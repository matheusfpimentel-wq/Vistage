// Converte um .vistage do formato JSON antigo (arquivos em base64) para o
// CONTÊINER zip novo (vistage.json + files/<rel> crus). Continua sendo um
// arquivo .vistage só, porém muito mais leve na memória ao salvar/abrir.
//
// Uso:  node scripts/vistage-to-container.mjs <entrada.vistage> [saida.vistage]
//
// Não converte arquivos PROTEGIDOS POR SENHA — salve sem senha no app antes.
import { readFileSync, writeFileSync } from "node:fs";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

function isZip(b) {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}
function dataUrlToBytes(url) {
  const b64 = url.slice(url.indexOf(",") + 1);
  return new Uint8Array(Buffer.from(b64, "base64"));
}

const [, , inPath, outArg] = process.argv;
if (!inPath) {
  console.error("uso: node scripts/vistage-to-container.mjs <entrada.vistage> [saida.vistage]");
  process.exit(1);
}
const outPath = outArg ?? inPath.replace(/\.vistage$/i, "") + " (conteiner).vistage";

const raw = readFileSync(inPath);
if (isZip(raw)) {
  console.log("Esse arquivo já é um contêiner (zip) — nada a converter.");
  process.exit(0);
}

let backup;
try {
  backup = JSON.parse(raw.toString("utf8"));
} catch {
  console.error(
    "Não consegui ler como JSON. O arquivo pode estar PROTEGIDO POR SENHA — " +
      "salve sem senha no app e tente de novo."
  );
  process.exit(2);
}
if (backup.app !== "vistage" && backup.app !== "musicgest") {
  console.error("Isso não parece um documento .vistage.");
  process.exit(2);
}

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

const zipped = zipSync(entries, { level: 0 });
writeFileSync(outPath, zipped);

// Verificação de integridade do que acabou de gravar (round-trip).
const check = unzipSync(zipped);
JSON.parse(strFromU8(check["vistage.json"])); // valida o JSON
const fileCount = Object.keys(check).filter((k) => k.startsWith("files/")).length;
if (fileCount !== n) {
  console.error(`ERRO: esperava ${n} arquivos no contêiner, mas há ${fileCount}.`);
  process.exit(3);
}

const mb = (x) => (x / 1e6).toFixed(1);
console.log(`OK — convertido para contêiner:\n  ${inPath}\n  → ${outPath}`);
console.log(`  ${n} arquivo(s), ${mb(rawBytes)} MB de mídia.`);
console.log(`  Antes (JSON+base64): ${mb(raw.length)} MB · Depois (contêiner): ${mb(zipped.length)} MB.`);
console.log("  Abra normalmente no Vistage — ele detecta o formato sozinho.");
