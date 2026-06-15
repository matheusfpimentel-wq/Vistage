import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { appDataDir } from "@tauri-apps/api/path";
import { copyFile } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";
import { buildBackup, restoreBackup, type Backup } from "./backup";

// ============================================================
// Chaves de app_settings
// ============================================================

const K = {
  CLIENT_ID: "gdrive.client_id",
  CLIENT_SECRET: "gdrive.client_secret",
  ACCESS_TOKEN: "gdrive.access_token",
  REFRESH_TOKEN: "gdrive.refresh_token",
  TOKEN_EXPIRY: "gdrive.token_expiry",
  FOLDER_ID: "gdrive.folder_id",
  FOLDER_NAME: "gdrive.folder_name",
  SUBFOLDER_NAME: "gdrive.subfolder_name",
  SUBFOLDER_ID: "gdrive.subfolder_id",
  AUTO_BACKUP: "gdrive.auto_backup",
  LAST_BACKUP_AT: "gdrive.last_backup_at",
  LAST_SYNC_AT: "gdrive.last_sync_at",
} as const;

export const DEFAULT_FOLDER_NAME = "Vistage Backups";

// ============================================================
// Tipos espelhando o Rust
// ============================================================

export type DriveTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  scope?: string | null;
  token_type?: string | null;
};

export type DriveFile = {
  id: string;
  name: string;
  size?: string | null;
  created_time?: string | null;
  modified_time?: string | null;
};

export type DriveConfig = {
  clientId: string;
  clientSecret: string;
};

export type DriveAuth = {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string;
  folderId?: string | null;
  folderName: string;
  subfolderName: string;
  subfolderIdCached?: string | null;
  autoBackup: boolean;
  lastBackupAt?: string | null;
};

// ============================================================
// Persistência via app_settings
// ============================================================

async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string | null }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value]
  );
}

async function deleteSetting(key: string): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM app_settings WHERE key = $1", [key]);
}

export async function loadDriveConfig(): Promise<DriveConfig> {
  const [clientId, clientSecret] = await Promise.all([
    getSetting(K.CLIENT_ID),
    getSetting(K.CLIENT_SECRET),
  ]);
  return { clientId: clientId ?? "", clientSecret: clientSecret ?? "" };
}

export async function saveDriveConfig(cfg: DriveConfig): Promise<void> {
  await Promise.all([
    setSetting(K.CLIENT_ID, cfg.clientId),
    setSetting(K.CLIENT_SECRET, cfg.clientSecret),
  ]);
}

export async function loadAuth(): Promise<DriveAuth | null> {
  const [access, refresh, expiry, folderId, folderName, subfolderName, subfolderIdCached, auto, lastBackup] =
    await Promise.all([
      getSetting(K.ACCESS_TOKEN),
      getSetting(K.REFRESH_TOKEN),
      getSetting(K.TOKEN_EXPIRY),
      getSetting(K.FOLDER_ID),
      getSetting(K.FOLDER_NAME),
      getSetting(K.SUBFOLDER_NAME),
      getSetting(K.SUBFOLDER_ID),
      getSetting(K.AUTO_BACKUP),
      getSetting(K.LAST_BACKUP_AT),
    ]);
  if (!access || !refresh || !expiry) return null;
  return {
    accessToken: access,
    refreshToken: refresh,
    tokenExpiry: expiry,
    folderId,
    folderName: folderName ?? DEFAULT_FOLDER_NAME,
    subfolderName: subfolderName ?? "",
    subfolderIdCached,
    autoBackup: auto === "true",
    lastBackupAt: lastBackup,
  };
}

export async function saveFolderName(name: string): Promise<void> {
  await setSetting(K.FOLDER_NAME, name.trim() || DEFAULT_FOLDER_NAME);
}

async function saveTokens(tokens: DriveTokens): Promise<void> {
  const expiry = new Date(
    Date.now() + (tokens.expires_in - 60) * 1000
  ).toISOString();
  await Promise.all([
    setSetting(K.ACCESS_TOKEN, tokens.access_token),
    setSetting(K.TOKEN_EXPIRY, expiry),
    tokens.refresh_token
      ? setSetting(K.REFRESH_TOKEN, tokens.refresh_token)
      : Promise.resolve(),
  ]);
}

// ============================================================
// Token management
// ============================================================

async function ensureValidToken(): Promise<{ accessToken: string; auth: DriveAuth }> {
  const auth = await loadAuth();
  if (!auth) throw new Error("Google Drive não conectado");

  const expiry = new Date(auth.tokenExpiry);
  if (expiry > new Date()) return { accessToken: auth.accessToken, auth };

  // Token expirado — refreshar
  const cfg = await loadDriveConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("Credenciais do Google Drive ausentes. Reconecte nas configurações.");
  }
  let tokens: DriveTokens;
  try {
    tokens = await invoke("gdrive_refresh_token", {
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      refreshToken: auth.refreshToken,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      try {
        await setSetting("gdrive.needs_reconnect", "1");
      } catch {
        // best-effort
      }
      throw new Error("Token do Google Drive inválido. Reconecte o Drive nas configurações.");
    }
    throw err;
  }
  await saveTokens(tokens);
  const refreshedAuth = await loadAuth();
  return { accessToken: tokens.access_token, auth: refreshedAuth! };
}

// ============================================================
// Connect / Disconnect
// ============================================================

export async function connect(): Promise<void> {
  const cfg = await loadDriveConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("Preencha Client ID e Client Secret antes de conectar");
  }

  const result: {
    auth_url: string;
    port: number;
    state: string;
    verifier: string;
    redirect_uri: string;
  } = await invoke("gdrive_start_oauth", { clientId: cfg.clientId });

  await openExternal(result.auth_url);

  const callback: { code: string; state: string } = await invoke(
    "gdrive_wait_callback",
    { port: result.port, timeoutSecs: 120 }
  );

  const tokens: DriveTokens = await invoke("gdrive_exchange_code", {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    code: callback.code,
    verifier: result.verifier,
    redirectUri: result.redirect_uri,
  });

  await saveTokens(tokens);

  // Garante que a pasta de backups existe no Drive
  const folderName = (await getSetting(K.FOLDER_NAME)) ?? DEFAULT_FOLDER_NAME;
  const folderId: string = await invoke("gdrive_ensure_folder", {
    accessToken: tokens.access_token,
    folderName,
    parentId: null,
  });
  await setSetting(K.FOLDER_ID, folderId);
}

export async function applyFolderName(newName: string): Promise<void> {
  const { accessToken } = await ensureValidToken();
  const folderName = newName.trim() || DEFAULT_FOLDER_NAME;
  await saveFolderName(folderName);
  const folderId: string = await invoke("gdrive_ensure_folder", { accessToken, folderName, parentId: null });
  await setSetting(K.FOLDER_ID, folderId);
  // Reset cached subfolder ID so it gets re-resolved on next backup
  await deleteSetting(K.SUBFOLDER_ID);
}

export async function applySubfolderName(newName: string): Promise<void> {
  const name = newName.trim();
  if (name) {
    await setSetting(K.SUBFOLDER_NAME, name);
  } else {
    await deleteSetting(K.SUBFOLDER_NAME);
  }
  await deleteSetting(K.SUBFOLDER_ID);
}

/** Returns the folder ID where backups should be uploaded (subfolder if set, else root folder). */
async function getEffectiveFolderId(accessToken: string): Promise<string> {
  const folderId = await getSetting(K.FOLDER_ID);
  if (!folderId) throw new Error("Pasta de backup não configurada. Reconecte o Drive.");
  const subfolderName = (await getSetting(K.SUBFOLDER_NAME))?.trim();
  if (!subfolderName) return folderId;
  // Check cache
  const cached = await getSetting(K.SUBFOLDER_ID);
  if (cached) return cached;
  const subId: string = await invoke("gdrive_ensure_folder", {
    accessToken,
    folderName: subfolderName,
    parentId: folderId,
  });
  await setSetting(K.SUBFOLDER_ID, subId);
  return subId;
}

export async function disconnect(): Promise<void> {
  await Promise.all(
    [
      K.ACCESS_TOKEN,
      K.REFRESH_TOKEN,
      K.TOKEN_EXPIRY,
      K.FOLDER_ID,
      K.AUTO_BACKUP,
      K.LAST_BACKUP_AT,
    ].map(deleteSetting)
  );
}

// ============================================================
// Backup / Restore
// ============================================================

export async function uploadBackup(): Promise<DriveFile> {
  const { accessToken } = await ensureValidToken();
  const folderId = await getEffectiveFolderId(accessToken);

  const backup = await buildBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const fileName = `vistage-backup-${stamp}.json`;
  const content = JSON.stringify(backup);

  const file: DriveFile = await invoke("gdrive_upload_backup", {
    accessToken,
    folderId,
    fileName,
    content,
  });

  const now = new Date().toISOString();
  await setSetting(K.LAST_BACKUP_AT, now);
  // marca o estado local como sincronizado para não sugerir restore do
  // backup que nós mesmos acabamos de subir
  await setSetting(K.LAST_SYNC_AT, file.created_time ?? now);

  // mantém no máximo MAX_BACKUPS no Drive, apagando os mais antigos.
  // Uma falha na limpeza não pode mascarar o sucesso do upload, mas é logada
  // — limpeza falhando em silêncio era o que deixava os backups acumularem.
  try {
    await pruneOldBackups();
  } catch {
    // best-effort — falha na limpeza não cancela o upload
  }
  return file;
}

/** Quantidade máxima de backups mantidos no Drive. */
export const MAX_BACKUPS = 10;

/**
 * Apaga os backups mais antigos que excedem MAX_BACKUPS, mantendo os mais
 * recentes. Falhas em deletar individualmente são logadas (não silenciosas)
 * para que o acúmulo indefinido (spam de arquivos) seja diagnosticável.
 */
export async function pruneOldBackups(): Promise<number> {
  const files = await listBackups();
  if (files.length <= MAX_BACKUPS) return 0;

  // mais recente primeiro. Empata (mesmo createdTime, ex.: dois backups no
  // mesmo segundo) usando o id para garantir ordem estável e determinística —
  // sem isso, dois arquivos com timestamp igual podiam nunca cair no slice.
  const sorted = [...files].sort((a, b) => {
    const ta = a.created_time ? Date.parse(a.created_time) : 0;
    const tb = b.created_time ? Date.parse(b.created_time) : 0;
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
  const toDelete = sorted.slice(MAX_BACKUPS);
  // Reusa um único token para todas as exclusões — evita refresh por arquivo
  // e garante que um token válido seja usado para todos os DELETEs.
  const { accessToken } = await ensureValidToken();
  let deleted = 0;
  for (const f of toDelete) {
    if (!f.id) continue;
    try {
      await invoke("gdrive_delete_backup", { accessToken, fileId: f.id });
      deleted += 1;
    } catch (e) {
      // best-effort, mas registra: deletes que falham em silêncio são a causa
      // do acúmulo indefinido de backups no Drive.
      void e; // best-effort delete, acúmulo visível na listagem do Drive
    }
  }
  return deleted;
}

export async function listBackups(): Promise<DriveFile[]> {
  const { accessToken, auth } = await ensureValidToken();
  if (!auth.folderId) return [];
  const folderId = await getEffectiveFolderId(accessToken);
  return invoke("gdrive_list_backups", {
    accessToken,
    folderId,
  });
}

export async function downloadAndRestoreBackup(fileId: string): Promise<{ restoredRows: number; restoredTables: number }> {
  const { accessToken } = await ensureValidToken();
  const raw: string = await invoke("gdrive_download_backup", {
    accessToken,
    fileId,
  });
  const backup: Backup = JSON.parse(raw);
  const result = await restoreBackup(backup);
  // marca o estado local como sincronizado com este backup
  await setSetting(K.LAST_SYNC_AT, new Date().toISOString());
  return result;
}

/**
 * Procura o backup mais recente no Drive. Retorna-o apenas se for mais novo
 * que o último sync local (último backup que subimos ou restauramos). Serve
 * para o app sugerir, ao abrir, importar dados feitos em outra máquina.
 */
export async function findNewerDriveBackup(): Promise<DriveFile | null> {
  const auth = await loadAuth();
  if (!auth) return null;
  const files = await listBackups();
  if (files.length === 0) return null;

  // mais recente primeiro
  const sorted = [...files].sort((a, b) => {
    const ta = a.created_time ? Date.parse(a.created_time) : 0;
    const tb = b.created_time ? Date.parse(b.created_time) : 0;
    return tb - ta;
  });
  const newest = sorted[0];
  const newestTime = newest.created_time ? Date.parse(newest.created_time) : 0;

  const lastSync = await getSetting(K.LAST_SYNC_AT);
  const lastSyncTime = lastSync ? Date.parse(lastSync) : 0;

  // margem de 5s para evitar falso positivo por arredondamento de timestamp
  return newestTime > lastSyncTime + 5000 ? newest : null;
}

export async function deleteBackupFile(fileId: string): Promise<void> {
  const { accessToken } = await ensureValidToken();
  await invoke("gdrive_delete_backup", { accessToken, fileId });
}

export async function setAutoBackup(enabled: boolean): Promise<void> {
  await setSetting(K.AUTO_BACKUP, enabled ? "true" : "false");
}

export async function runAutoBackupIfEnabled(): Promise<void> {
  const auth = await loadAuth();
  if (!auth?.autoBackup) return;
  await uploadBackup();
}


/**
 * Restaura silenciosamente o backup mais recente do Drive.
 * Antes de restaurar, salva uma cópia local do banco atual em
 * `{appDataDir}/vistage-before-restore.db` para evitar perda de edições offline.
 * Retorna true se restaurou, false se não havia backup ou ocorreu erro.
 */
export async function restoreLatestBackupSilently(): Promise<boolean> {
  try {
    const auth = await loadAuth();
    if (!auth) return false;
    // Só restaura se o Drive tiver um backup MAIS NOVO que o último sync local.
    // Isso evita sobrescrever dados criados nesta máquina que ainda não subiram
    // (ex.: sessões/highlights/pacotes recém-criados antes de fechar o app).
    const newer = await findNewerDriveBackup();
    if (!newer) return false;

    // Salva snapshot local do banco atual antes de sobrescrever
    try {
      const dataDir = await appDataDir();
      const dbPath = `${dataDir.replace(/[\\/]+$/, "")}/vistage.db`;
      const snapshotPath = `${dataDir.replace(/[\\/]+$/, "")}/vistage-before-restore.db`;
      await copyFile(dbPath, snapshotPath);
    } catch {
      // snapshot é best-effort — não bloqueia a restauração
    }

    await downloadAndRestoreBackup(newer.id);
    return true;
  } catch {
    return false;
  }
}

/** Sobe um backup se o automático estiver ligado. Chamado após cada mudança de dados. */
export async function maybeAutoBackupAfterChange(): Promise<void> {
  const auth = await loadAuth();
  if (!auth?.autoBackup) return;
  await uploadBackup();
}

// ============================================================
// Media (photos / images) sync
// ============================================================

const MEDIA_FOLDER_NAME = "Media";
const MEDIA_FOLDER_KEY = "gdrive.media_folder_id";
const MEDIA_FOLDER_PARENT_KEY = "gdrive.media_folder_parent_id";

/**
 * Returns a valid access token, or null if Drive is not connected.
 * Refreshes the token if expired.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const { accessToken } = await ensureValidToken();
    return accessToken;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("invalid_grant")) {
      try {
        await setSetting("gdrive.needs_reconnect", "1");
      } catch {
        // best-effort — ignore storage errors
      }
    }
    return null;
  }
}

/**
 * Returns the Drive folder ID for media files, creating it if needed.
 * The "Media" folder lives INSIDE the effective backup folder (subfolder if
 * configured, else the main backup folder). The cache is invalidated whenever
 * the effective parent changes, so a reconfigured backup folder/subfolder
 * re-resolves the nested Media folder.
 */
async function ensureMediaFolder(accessToken: string): Promise<string> {
  const parentId = await getEffectiveFolderId(accessToken);
  const cached = await getSetting(MEDIA_FOLDER_KEY);
  const cachedParent = await getSetting(MEDIA_FOLDER_PARENT_KEY);
  if (cached && cachedParent === parentId) return cached;
  const id = await invoke<string>("gdrive_ensure_folder", {
    accessToken,
    folderName: MEDIA_FOLDER_NAME,
    parentId,
  });
  await setSetting(MEDIA_FOLDER_KEY, id);
  await setSetting(MEDIA_FOLDER_PARENT_KEY, parentId);
  return id;
}

/**
 * Uploads a media file to Drive.
 * `relPath` = relative path like "fans/abc123.jpg" — used as the file name in Drive.
 * `base64` = raw base64 (no data: prefix).
 * `mime` = e.g., "image/jpeg".
 * Returns the Drive file ID, or null on error/not connected.
 */
export async function uploadMediaToDrive(
  relPath: string,
  base64: string,
  mime: string
): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;
    const folderId = await ensureMediaFolder(accessToken);
    // Drive file name: replace path separators with __ to keep flat
    const driveName = relPath.replace(/[\\/]/g, "__");
    const fileId = await invoke<string>("gdrive_upload_media", {
      accessToken,
      folderId,
      fileName: driveName,
      contentBase64: base64,
      mime,
    });
    return fileId;
  } catch {
    return null;
  }
}

/**
 * Downloads a media file from Drive by its file ID.
 * Returns a data URL (data:image/...;base64,...) or null on error.
 */
export async function downloadMediaFromDrive(
  fileId: string,
  mime: string
): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return null;
    const b64 = await invoke<string>("gdrive_download_media", {
      accessToken,
      fileId,
    });
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}
