/**
 * Criptografia OPCIONAL do .vistage com senha (AES-GCM 256 + PBKDF2-SHA256).
 * Como o arquivo passou a carregar credenciais (tokens, sessão de sync), o
 * usuário pode protegê-lo com uma senha: o conteúdo vira um envelope cifrado e
 * só abre com a senha certa. Usa a Web Crypto API (disponível no webview Tauri).
 *
 * A senha NÃO é guardada no arquivo nem em disco — quem perde a senha perde o
 * acesso ao conteúdo (não há recuperação; é esse o ponto).
 */

const ENC_APP = "vistage-encrypted";
const PBKDF2_ITER = 210_000;

// Assinatura do CONTÊINER cifrado (envelope BINÁRIO): "VENC". Diferente do zip
// ("PK") e do JSON ("{"). Permite cifrar o contêiner zip inteiro sem inflar tudo
// em base64/JSON gigante na memória — a causa do "salvamento eterno"/OOM.
const ENC_MAGIC = new Uint8Array([0x56, 0x45, 0x4e, 0x43]); // "VENC"
const ENC_HEADER_LEN = 39; // magic(4)+ver(1)+iter(4 BE)+saltLen(1)+salt(16)+ivLen(1)+iv(12)
// Versão 2 adiciona, LOGO APÓS o cabeçalho e ANTES do ciphertext, um bloco de
// DICA DE SENHA em texto puro: hintLen(2 BE) + hint(UTF-8). Fica fora do que é
// cifrado de propósito — a dica precisa ser lida antes de decifrar. Arquivos v1
// (sem dica) continuam válidos; o leitor decide pelo byte de versão.
const ENC_HINT_MAX_BYTES = 1024;

type Envelope = {
  app: typeof ENC_APP;
  v: 1;
  kdf: "PBKDF2";
  hash: "SHA-256";
  iter: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 (ciphertext)
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iter: number
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: iter, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Detecta se um texto bruto é um .vistage criptografado (envelope). */
export function isEncryptedRaw(raw: string): boolean {
  try {
    const p = JSON.parse(raw) as Partial<Envelope>;
    return p?.app === ENC_APP && typeof p.data === "string";
  } catch {
    return false;
  }
}

/** Decifra um envelope. Lança "Senha incorreta." se a senha não bater. */
export async function decryptString(envelopeJson: string, password: string): Promise<string> {
  let env: Envelope;
  try {
    env = JSON.parse(envelopeJson) as Envelope;
  } catch {
    throw new Error("Arquivo criptografado inválido.");
  }
  if (env.app !== ENC_APP || !env.data) throw new Error("Arquivo criptografado inválido.");
  const key = await deriveKey(password, b64ToBytes(env.salt), env.iter ?? PBKDF2_ITER);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(env.iv) as BufferSource },
      key,
      b64ToBytes(env.data) as BufferSource
    );
  } catch {
    throw new Error("Senha incorreta.");
  }
  return new TextDecoder().decode(plain);
}

// ── Envelope BINÁRIO (para o contêiner .vistage cifrado) ─────────────────────
// Cifra/decifra BYTES crus sem passar por base64 nem JSON — assim um documento
// com senha sai do contêiner zip direto pro AES, sem materializar strings
// gigantes (era o que estourava a memória ao salvar fotos/vídeos embutidos).

/** Detecta se os bytes são um contêiner .vistage CIFRADO (envelope "VENC"). */
export function isEncryptedContainer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= ENC_HEADER_LEN &&
    bytes[0] === ENC_MAGIC[0] &&
    bytes[1] === ENC_MAGIC[1] &&
    bytes[2] === ENC_MAGIC[2] &&
    bytes[3] === ENC_MAGIC[3]
  );
}

/**
 * Cifra bytes (o zip do contêiner) com a senha. Retorna o envelope binário.
 * Com `hint`, grava também a dica de senha em texto puro (envelope v2) — útil
 * para lembrar a senha sem comprometer o conteúdo (a dica não destranca nada).
 */
export async function encryptBytes(
  plain: Uint8Array,
  password: string,
  hint?: string | null
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITER);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource)
  );

  const hintBytes =
    hint && hint.trim()
      ? new TextEncoder().encode(hint.trim()).slice(0, ENC_HINT_MAX_BYTES)
      : null;
  const version = hintBytes ? 2 : 1;
  const hintBlockLen = hintBytes ? 2 + hintBytes.length : 0;

  const header = new Uint8Array(ENC_HEADER_LEN + hintBlockLen);
  header.set(ENC_MAGIC, 0);
  header[4] = version; // versão do envelope (1 = sem dica, 2 = com dica)
  new DataView(header.buffer).setUint32(5, PBKDF2_ITER, false); // big-endian
  header[9] = salt.length; // 16
  header.set(salt, 10);
  header[26] = iv.length; // 12
  header.set(iv, 27);
  if (hintBytes) {
    new DataView(header.buffer).setUint16(ENC_HEADER_LEN, hintBytes.length, false); // BE
    header.set(hintBytes, ENC_HEADER_LEN + 2);
  }
  const out = new Uint8Array(header.length + cipher.length);
  out.set(header, 0);
  out.set(cipher, header.length);
  return out;
}

/**
 * Lê a DICA DE SENHA (texto puro) de um envelope "VENC" v2, SEM decifrar nada.
 * Retorna null se não houver dica (v1) ou se o arquivo não for um envelope.
 */
export function readEncryptedHint(bytes: Uint8Array): string | null {
  if (!isEncryptedContainer(bytes)) return null;
  if (bytes[4] < 2) return null; // v1: sem dica
  const saltLen = bytes[9];
  const ivOff = 10 + saltLen;
  const ivLen = bytes[ivOff];
  const hintOff = ivOff + 1 + ivLen;
  if (bytes.length < hintOff + 2) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hintLen = view.getUint16(hintOff, false);
  if (hintLen === 0 || bytes.length < hintOff + 2 + hintLen) return null;
  try {
    return new TextDecoder().decode(bytes.slice(hintOff + 2, hintOff + 2 + hintLen));
  } catch {
    return null;
  }
}

/** Decifra um envelope binário "VENC". Lança "Senha incorreta." se não bater. */
export async function decryptBytes(envelope: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncryptedContainer(envelope)) throw new Error("Arquivo criptografado inválido.");
  const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
  const version = envelope[4];
  const iter = view.getUint32(5, false);
  const saltLen = envelope[9];
  const salt = envelope.slice(10, 10 + saltLen);
  const ivOff = 10 + saltLen;
  const ivLen = envelope[ivOff];
  const iv = envelope.slice(ivOff + 1, ivOff + 1 + ivLen);
  let dataOff = ivOff + 1 + ivLen;
  // v2: pula o bloco de dica em texto puro (hintLen BE + hint) antes do cipher.
  if (version >= 2) {
    const hintLen = view.getUint16(dataOff, false);
    dataOff += 2 + hintLen;
  }
  const cipher = envelope.slice(dataOff);
  const key = await deriveKey(password, salt, iter);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipher as BufferSource
    );
  } catch {
    throw new Error("Senha incorreta.");
  }
  return new Uint8Array(plain);
}

// ── Segredo pequeno AUTO-DECIFRÁVEL (senha de sync p/ "abrir já logado") ──────
// PROPÓSITO E LIMITE — leia antes de confiar nisto:
// Guarda a senha da sincronização DENTRO do .vistage para reconectar sozinho
// numa máquina nova (login automático em qualquer PC, opt-in do usuário). Como
// precisa decifrar em QUALQUER máquina sem digitar nada, a chave é DERIVADA de
// material que viaja junto (um "pepper" fixo do app + o e-mail da conta). Ou
// seja: isto é OFUSCAÇÃO, não sigilo forte — quem tiver o arquivo E o código
// consegue rederivar a chave. O pepper NÃO é segredo (o repositório é público);
// ele só amarra a derivação a este app e o e-mail evita uma chave universal.
// Serve para: (a) a senha não ficar em texto puro/grepável no arquivo e
// (b) herdar DE GRAÇA a cifragem FORTE quando o usuário protege o .vistage
// inteiro com senha (envelope "VENC" acima) — aí o segredo vai junto, cifrado
// pela senha do arquivo. A proteção real é criptografar o arquivo; isto é a
// camada de decência por cima do que já viaja (a própria sessão já é credencial).
const SYNC_SECRET_PEPPER = "vistage.sync-secret.v1";
const SYNC_SECRET_ITER = 100_000; // baixo de propósito: roda no boot e o "segredo"
// da derivação é público — iterar mais não compra sigilo, só custaria latência.

/** Cifra uma string curta (a senha de sync) amarrada ao e-mail. Base64 compacto. */
export async function encryptSyncSecret(plaintext: string, email: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(
    `${SYNC_SECRET_PEPPER} ${email.trim().toLowerCase()}`,
    salt,
    SYNC_SECRET_ITER
  );
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext)
    )
  );
  const out = new Uint8Array(16 + 12 + cipher.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(cipher, 28);
  return bytesToB64(out);
}

/** Decifra o segredo de sync. Retorna null se falhar (e-mail/arquivo trocados). */
export async function decryptSyncSecret(packed: string, email: string): Promise<string | null> {
  try {
    const bytes = b64ToBytes(packed);
    if (bytes.length <= 28) return null;
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const cipher = bytes.slice(28);
    const key = await deriveKey(
      `${SYNC_SECRET_PEPPER} ${email.trim().toLowerCase()}`,
      salt,
      SYNC_SECRET_ITER
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipher as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
