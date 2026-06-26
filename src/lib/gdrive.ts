// Integração com o Google Drive — APENAS para mídia pesada (fotos da galeria,
// flyers, arquivos de música, etc.). Reaproveita o OAuth e as credenciais do
// Google Calendar (mesma app; só pede o escopo `drive.file`, que dá acesso só
// aos arquivos que o próprio app cria). O Rust (gdrive.rs) faz as chamadas HTTP.
//
// Política do que vai pro Drive vs. fica LOCAL (embutido no .vistage):
//   LOCAL  → fotos de contatos, venues e fãs; logo, isótipo, fontes e templates.
//   DRIVE  → o resto (galeria da Identidade, presskit/manual, GIGs, música,
//            conteúdo, festas, equipamentos, recibos…), em subpastas por módulo.
import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { getDb } from "./db";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
// readonly: pra LISTAR/abrir arquivos de uma pasta designada (contratos, riders)
// que o app NÃO criou. Escopo novo → exige novo consentimento (reconectar).
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const ROOT_FOLDER_NAME = "Vistage";
// Credenciais reaproveitadas da seção do Calendar.
const GCAL_CLIENT_ID = "gcal.client_id";
const GCAL_CLIENT_SECRET = "gcal.client_secret";
const K = {
  access: "gdrive.access_token",
  refresh: "gdrive.refresh_token",
  expires: "gdrive.expires_at",
  root: "gdrive.root_folder_id",
} as const;

type GTokens = { access_token: string; refresh_token?: string | null; expires_in: number };

async function getSetting(key: string): Promise<string | null> {
  const rows = await getDb().select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}
async function setSetting(key: string, value: string | null): Promise<void> {
  const db = getDb();
  if (value === null) {
    await db.execute("DELETE FROM app_settings WHERE key = $1", [key]);
    return;
  }
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

// ── Conexão ──────────────────────────────────────────────────────────────────
export async function isDriveConnected(): Promise<boolean> {
  return !!(await getSetting(K.refresh));
}

export async function connectDrive(): Promise<void> {
  const clientId = await getSetting(GCAL_CLIENT_ID);
  const clientSecret = await getSetting(GCAL_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error(
      "Preencha o Client ID e o Client Secret do Google (na seção do Calendar) antes de conectar o Drive."
    );
  }
  const start = await invoke<{ auth_url: string; port: number; verifier: string; redirect_uri: string }>(
    "gcal_start_oauth",
    { clientId, scopes: [DRIVE_SCOPE, DRIVE_READONLY_SCOPE] }
  );
  await openExternal(start.auth_url);
  const cb = await invoke<{ code: string }>("gcal_wait_callback", {
    port: start.port,
    timeoutSecs: 300,
  });
  const tokens = await invoke<GTokens>("gcal_exchange_code", {
    clientId,
    clientSecret,
    code: cb.code,
    verifier: start.verifier,
    redirectUri: start.redirect_uri,
  });
  await saveTokens(tokens);
}

export async function disconnectDrive(): Promise<void> {
  for (const k of [K.access, K.refresh, K.expires, K.root]) await setSetting(k, null);
  folderCache.clear();
}

/**
 * Pasta-raiz do Drive onde os arquivos do Vistage são guardados. Por padrão o
 * app cria/usa uma pasta "Vistage"; o usuário pode apontar outra colando o ID
 * (a parte final da URL drive.google.com/drive/folders/ID). As subpastas por
 * módulo (GIGs, Música…) passam a ser criadas dentro dela.
 */
export async function getDriveRootFolderId(): Promise<string | null> {
  return getSetting(K.root);
}
export async function setDriveRootFolderId(id: string | null): Promise<void> {
  await setSetting(K.root, id && id.trim() ? id.trim() : null);
  folderCache.clear(); // subpastas por módulo re-resolvem sob a nova raiz
}

async function saveTokens(t: GTokens): Promise<void> {
  await setSetting(K.access, t.access_token);
  if (t.refresh_token) await setSetting(K.refresh, t.refresh_token);
  await setSetting(K.expires, String(Date.now() + t.expires_in * 1000));
}

async function getValidToken(): Promise<string> {
  const [access, refresh, expires, clientId, clientSecret] = await Promise.all([
    getSetting(K.access),
    getSetting(K.refresh),
    getSetting(K.expires),
    getSetting(GCAL_CLIENT_ID),
    getSetting(GCAL_CLIENT_SECRET),
  ]);
  if (!refresh || !clientId || !clientSecret) throw new Error("Drive não conectado.");
  const exp = expires ? Number(expires) : 0;
  if (access && Date.now() + 60_000 < exp) return access;
  const fresh = await invoke<GTokens>("gcal_refresh_token", {
    clientId,
    clientSecret,
    refreshToken: refresh,
  });
  await saveTokens(fresh);
  return fresh.access_token;
}

// ── Biblioteca de Documentos (pasta designada, leitura) ──────────────────────
export type DriveFile = {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  modified_time: string | null;
};

/** Lista os arquivos de uma pasta do Drive (precisa do escopo readonly). */
export async function listDriveFolder(folderId: string): Promise<DriveFile[]> {
  const token = await getValidToken();
  return invoke<DriveFile[]>("gdrive_list_folder", { accessToken: token, folderId });
}

export async function driveFileMeta(fileId: string): Promise<DriveFile> {
  const token = await getValidToken();
  return invoke<DriveFile>("gdrive_file_meta", { accessToken: token, fileId });
}

// ── Pastas (raiz "Vistage" + subpasta por módulo, em português) ───────────────
const folderCache = new Map<string, string>();

async function ensureRootFolder(token: string): Promise<string> {
  const cached = await getSetting(K.root);
  if (cached) return cached;
  const id = await invoke<string>("gdrive_ensure_folder", {
    accessToken: token,
    name: ROOT_FOLDER_NAME,
    parentId: null,
  });
  await setSetting(K.root, id);
  return id;
}

async function ensureModuleFolder(token: string, folderName: string): Promise<string> {
  const cached = folderCache.get(folderName);
  if (cached) return cached;
  const root = await ensureRootFolder(token);
  const id = await invoke<string>("gdrive_ensure_folder", {
    accessToken: token,
    name: folderName,
    parentId: root,
  });
  folderCache.set(folderName, id);
  return id;
}

// ── Política local × Drive ────────────────────────────────────────────────────
const DRIVE_FOLDER: Record<string, string> = {
  gigs: "GIGs",
  tracks: "Música",
  music: "Música",
  content: "Conteúdo",
  parties: "Festas",
  identity: "Identidade",
  equipment: "Equipamentos",
  finance: "Financeiro",
};

// ── O que sincronizar (preferência da máquina, em localStorage) ───────────────
// "Imagens e vídeos" (inclui áudio/mídia pesada) e "Documentos". Default: ambos.
const LS_SYNC_MEDIA = "vistage.drive.syncMedia";
const LS_SYNC_DOCS = "vistage.drive.syncDocs";

function lsBool(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0"; // ausente = ligado
  } catch {
    return true;
  }
}
function lsSet(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* ignora */
  }
}

export function isDriveSyncMedia(): boolean { return lsBool(LS_SYNC_MEDIA); }
export function isDriveSyncDocs(): boolean { return lsBool(LS_SYNC_DOCS); }
export function setDriveSyncMedia(on: boolean): void { lsSet(LS_SYNC_MEDIA, on); }
export function setDriveSyncDocs(on: boolean): void { lsSet(LS_SYNC_DOCS, on); }

const MEDIA_EXTS = new Set([
  // imagens
  "jpg", "jpeg", "png", "webp", "gif", "heic", "bmp", "tiff",
  // vídeos
  "mp4", "mov", "webm", "avi", "mkv", "m4v",
  // áudio (mídia pesada — acompanha "Imagens e vídeos")
  "mp3", "wav", "flac", "aiff", "aif", "m4a", "ogg", "aac",
]);
const DOC_EXTS_SET = new Set([
  "pdf", "doc", "docx", "txt", "rtf", "md", "odt",
  "ttf", "otf", "woff", "woff2",
]);

/** Classifica o anexo pela extensão para casar com os checkboxes do usuário. */
function fileKind(rel: string): "media" | "doc" | "other" {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  if (MEDIA_EXTS.has(ext)) return "media";
  if (DOC_EXTS_SET.has(ext)) return "doc";
  return "other";
}

/** true se este anexo (pela parte relativa) deve ir pro Drive em vez de embutir. */
export function isDriveMedia(rel: string): boolean {
  const r = rel.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  const top = r.split("/")[0];
  // 1) política de PASTA — quais módulos podem ir pro Drive.
  let pathOk: boolean;
  if (top === "identity") {
    // logo/isótipo/fontes ficam LOCAIS; galeria/presskit/manual vão pro Drive.
    pathOk =
      r.startsWith("identity/photos/") ||
      r.includes("presskit") ||
      r.includes("brand") ||
      r.includes("manual");
  } else {
    pathOk = ["gigs", "tracks", "music", "content", "parties", "equipment", "finance"].includes(top);
  }
  if (!pathOk) return false;
  // 2) política de TIPO — respeita o que o usuário escolheu sincronizar.
  const kind = fileKind(r);
  return kind === "doc" ? isDriveSyncDocs() : isDriveSyncMedia();
}

function driveFolderForRel(rel: string): string {
  const top = rel.replace(/\\/g, "/").replace(/^\/+/, "").split("/")[0].toLowerCase();
  return DRIVE_FOLDER[top] ?? "Outros";
}

// ── Mapeamento rel ↔ id do arquivo no Drive (em app_settings) ─────────────────
export async function getDriveFileId(rel: string): Promise<string | null> {
  return getSetting(`drive_media:${rel}`);
}
async function setDriveFileId(rel: string, fileId: string): Promise<void> {
  await setSetting(`drive_media:${rel}`, fileId);
}

/** Conjunto de todos os rels que já estão no Drive (para o salvar não embutir). */
export async function loadDriveMediaRels(): Promise<Set<string>> {
  const rows = await getDb()
    .select<{ key: string }[]>("SELECT key FROM app_settings WHERE key LIKE 'drive_media:%'")
    .catch(() => [] as { key: string }[]);
  return new Set(rows.map((r) => r.key.slice("drive_media:".length)));
}

// ── Upload / Download ─────────────────────────────────────────────────────────
/** Sobe o conteúdo (base64) pro Drive na subpasta do módulo. Devolve o file id. */
export async function uploadMediaToDrive(rel: string, contentB64: string, mime: string): Promise<string> {
  const token = await getValidToken();
  const folderId = await ensureModuleFolder(token, driveFolderForRel(rel));
  const name = rel.split("/").pop() ?? rel;
  const fileId = await invoke<string>("gdrive_upload", {
    accessToken: token,
    parentId: folderId,
    name,
    contentB64,
    mime,
  });
  await setDriveFileId(rel, fileId);
  return fileId;
}

/** Baixa o arquivo do Drive (devolve base64). */
export async function downloadMediaFromDrive(fileId: string): Promise<string> {
  const token = await getValidToken();
  return invoke<string>("gdrive_download", { accessToken: token, fileId });
}
