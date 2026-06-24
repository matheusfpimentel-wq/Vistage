// Converte um .vistage do formato JSON antigo (arquivos em base64) para o
// CONTÊINER novo: continua sendo UM arquivo .vistage só, porém muito mais leve
// na memória ao salvar/abrir (era o que estourava no Windows — "Out of memory"
// / "salvamento eterno").
//
//   • Documento SEM senha  → contêiner zip puro (assinatura "PK").
//   • Documento COM senha  → contêiner zip CIFRADO (envelope binário "VENC").
//
// Uso:
//   node scripts/vistage-to-container.mjs <entrada.vistage> [saida.vistage] [--password <senha>]
//
// Para arquivos protegidos por senha, informe --password — a saída sai
// re-cifrada no mesmo esquema (AES-GCM 256 + PBKDF2-SHA256), pronta pro app.
import { readFileSync, writeFileSync } from "node:fs";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

// ── Replica EXATA do envelope de crypto.ts (mantém compatibilidade de formato) ─
const ENC_APP = "vistage-encrypted";
const PBKDF2_ITER = 210_000;
const ENC_MAGIC = new Uint8Array([0x56, 0x45, 0x4e, 0x43]); // "VENC"
const ENC_HEADER_LEN = 39;

function b64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
async function deriveKey(password, salt, iter) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function isEncryptedRaw(raw) {
  try {
    const p = JSON.parse(raw);
    return p?.app === ENC_APP && typeof p.data === "string";
  } catch {
    return false;
  }
}
async function decryptString(envelopeJson, password) {
  const env = JSON.parse(envelopeJson);
  if (env.app !== ENC_APP || !env.data) throw new Error("Arquivo criptografado inválido.");
  const key = await deriveKey(password, b64ToBytes(env.salt), env.iter ?? PBKDF2_ITER);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.data));
  return new TextDecoder().decode(plain);
}
function isEncryptedContainer(bytes) {
  return (
    bytes.length >= ENC_HEADER_LEN &&
    bytes[0] === ENC_MAGIC[0] && bytes[1] === ENC_MAGIC[1] &&
    bytes[2] === ENC_MAGIC[2] && bytes[3] === ENC_MAGIC[3]
  );
}
async function encryptBytes(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITER);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const header = new Uint8Array(ENC_HEADER_LEN);
  header.set(ENC_MAGIC, 0);
  header[4] = 1;
  new DataView(header.buffer).setUint32(5, PBKDF2_ITER, false);
  header[9] = salt.length;
  header.set(salt, 10);
  header[26] = iv.length;
  header.set(iv, 27);
  const out = new Uint8Array(header.length + cipher.length);
  out.set(header, 0);
  out.set(cipher, header.length);
  return out;
}
async function decryptBytes(envelope, password) {
  if (!isEncryptedContainer(envelope)) throw new Error("Arquivo criptografado inválido.");
  const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
  const iter = view.getUint32(5, false);
  const saltLen = envelope[9];
  const salt = envelope.slice(10, 10 + saltLen);
  const ivOff = 10 + saltLen;
  const ivLen = envelope[ivOff];
  const iv = envelope.slice(ivOff + 1, ivOff + 1 + ivLen);
  const cipher = envelope.slice(ivOff + 1 + ivLen);
  const key = await deriveKey(password, salt, iter);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new Uint8Array(plain);
}

// ── Conversão ────────────────────────────────────────────────────────────────
function isZip(b) {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}
function dataUrlToBytes(url) {
  return new Uint8Array(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
}
function buildContainerBytes(backup) {
  const files = backup.files ?? {};
  const entries = { "vistage.json": strToU8(JSON.stringify({ ...backup, files: {} })) };
  let n = 0;
  let rawBytes = 0;
  for (const [rel, url] of Object.entries(files)) {
    if (typeof url !== "string" || !url.startsWith("data:")) continue;
    const bytes = dataUrlToBytes(url);
    entries[`files/${rel}`] = bytes;
    n += 1;
    rawBytes += bytes.length;
  }
  return { zip: zipSync(entries, { level: 0 }), n, rawBytes };
}

const argv = process.argv.slice(2);
const pwIdx = argv.findIndex((a) => a === "--password" || a === "-p");
let password = null;
if (pwIdx >= 0) {
  password = argv[pwIdx + 1] ?? null;
  argv.splice(pwIdx, 2);
}
const [inPath, outArg] = argv;
if (!inPath) {
  console.error("uso: node scripts/vistage-to-container.mjs <entrada.vistage> [saida.vistage] [--password <senha>]");
  process.exit(1);
}
const outPath = outArg ?? inPath.replace(/\.vistage$/i, "") + " (conteiner).vistage";

const raw = new Uint8Array(readFileSync(inPath));
if (isEncryptedContainer(raw)) {
  console.log("Esse arquivo já é um contêiner CIFRADO (VENC) — nada a converter.");
  process.exit(0);
}
if (isZip(raw)) {
  console.log("Esse arquivo já é um contêiner (zip) — nada a converter.");
  process.exit(0);
}

const text = Buffer.from(raw).toString("utf8");
let backup;
const encrypted = isEncryptedRaw(text);
if (encrypted) {
  if (!password) {
    console.error("Arquivo PROTEGIDO POR SENHA. Rode de novo com:  --password <senha>");
    process.exit(2);
  }
  let json;
  try {
    json = await decryptString(text, password);
  } catch {
    console.error("Senha incorreta (não consegui decifrar).");
    process.exit(2);
  }
  backup = JSON.parse(json);
} else {
  try {
    backup = JSON.parse(text);
  } catch {
    console.error("Não consegui ler como JSON nem como envelope cifrado.");
    process.exit(2);
  }
}
if (backup.app !== "vistage" && backup.app !== "musicgest") {
  console.error("Isso não parece um documento .vistage.");
  process.exit(2);
}

const { zip, n, rawBytes } = buildContainerBytes(backup);
// Mantém a proteção: se a entrada tinha senha, a saída sai cifrada (VENC).
const outBytes = encrypted ? await encryptBytes(zip, password) : zip;
writeFileSync(outPath, outBytes);

// ── Verificação de integridade (round-trip do que acabou de gravar) ──────────
const reread = new Uint8Array(readFileSync(outPath));
const zipCheck = encrypted ? await decryptBytes(reread, password) : reread;
const check = unzipSync(zipCheck);
JSON.parse(strFromU8(check["vistage.json"]));
const fileCount = Object.keys(check).filter((k) => k.startsWith("files/")).length;
if (fileCount !== n) {
  console.error(`ERRO: esperava ${n} arquivos no contêiner, mas há ${fileCount}.`);
  process.exit(3);
}
// confere byte-a-byte uma amostra (o 1º arquivo), comparando com a origem
const firstRel = Object.keys(backup.files ?? {}).find(
  (k) => typeof backup.files[k] === "string" && backup.files[k].startsWith("data:")
);
if (firstRel) {
  const orig = dataUrlToBytes(backup.files[firstRel]);
  const got = check[`files/${firstRel}`];
  const same = orig.length === got.length && orig.every((b, i) => b === got[i]);
  if (!same) {
    console.error(`ERRO: bytes de "${firstRel}" não batem após o round-trip.`);
    process.exit(3);
  }
}

const mb = (x) => (x / 1e6).toFixed(1);
console.log(`OK — convertido para contêiner${encrypted ? " CIFRADO (VENC)" : ""}:`);
console.log(`  ${inPath}\n  → ${outPath}`);
console.log(`  ${n} arquivo(s), ${mb(rawBytes)} MB de mídia.`);
console.log(`  Antes: ${mb(raw.length)} MB · Depois: ${mb(outBytes.length)} MB.`);
console.log("  Abra normalmente no Vistage — ele detecta o formato sozinho.");
