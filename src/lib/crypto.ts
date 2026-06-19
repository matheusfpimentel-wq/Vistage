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

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

/** Cifra um texto (o JSON do backup) com a senha. Retorna o envelope JSON. */
export async function encryptString(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITER);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  const env: Envelope = {
    app: ENC_APP,
    v: 1,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iter: PBKDF2_ITER,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(cipher)),
  };
  return JSON.stringify(env);
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
