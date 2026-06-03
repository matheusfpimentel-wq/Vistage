import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
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
  AUTO_BACKUP: "gdrive.auto_backup",
  LAST_BACKUP_AT: "gdrive.last_backup_at",
  LAST_SYNC_AT: "gdrive.last_sync_at",
} as const;

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
  const [access, refresh, expiry, folderId, auto, lastBackup] =
    await Promise.all([
      getSetting(K.ACCESS_TOKEN),
      getSetting(K.REFRESH_TOKEN),
      getSetting(K.TOKEN_EXPIRY),
      getSetting(K.FOLDER_ID),
      getSetting(K.AUTO_BACKUP),
      getSetting(K.LAST_BACKUP_AT),
    ]);
  if (!access || !refresh || !expiry) return null;
  return {
    accessToken: access,
    refreshToken: refresh,
    tokenExpiry: expiry,
    folderId,
    autoBackup: auto === "true",
    lastBackupAt: lastBackup,
  };
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
  const tokens: DriveTokens = await invoke("gdrive_refresh_token", {
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    refreshToken: auth.refreshToken,
  });
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
  const folderId: string = await invoke("gdrive_ensure_folder", {
    accessToken: tokens.access_token,
  });
  await setSetting(K.FOLDER_ID, folderId);
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
  const { accessToken, auth } = await ensureValidToken();
  if (!auth.folderId) throw new Error("Pasta de backup não configurada. Reconecte o Drive.");

  const backup = await buildBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const fileName = `vistage-backup-${stamp}.json`;
  const content = JSON.stringify(backup);

  const file: DriveFile = await invoke("gdrive_upload_backup", {
    accessToken,
    folderId: auth.folderId,
    fileName,
    content,
  });

  const now = new Date().toISOString();
  await setSetting(K.LAST_BACKUP_AT, now);
  // marca o estado local como sincronizado para não sugerir restore do
  // backup que nós mesmos acabamos de subir
  await setSetting(K.LAST_SYNC_AT, file.created_time ?? now);

  // mantém no máximo MAX_BACKUPS no Drive, apagando os mais antigos
  await pruneOldBackups();
  return file;
}

/** Quantidade máxima de backups mantidos no Drive. */
export const MAX_BACKUPS = 20;

/**
 * Apaga os backups mais antigos que excedem MAX_BACKUPS, mantendo os mais
 * recentes. Falhas em deletar individualmente são ignoradas (best-effort).
 */
export async function pruneOldBackups(): Promise<number> {
  const files = await listBackups();
  if (files.length <= MAX_BACKUPS) return 0;

  // mais recente primeiro
  const sorted = [...files].sort((a, b) => {
    const ta = a.created_time ? Date.parse(a.created_time) : 0;
    const tb = b.created_time ? Date.parse(b.created_time) : 0;
    return tb - ta;
  });
  const toDelete = sorted.slice(MAX_BACKUPS);
  let deleted = 0;
  for (const f of toDelete) {
    try {
      await deleteBackupFile(f.id);
      deleted += 1;
    } catch {
      // best-effort — ignora falhas individuais
    }
  }
  return deleted;
}

export async function listBackups(): Promise<DriveFile[]> {
  const { accessToken, auth } = await ensureValidToken();
  if (!auth.folderId) return [];
  return invoke("gdrive_list_backups", {
    accessToken,
    folderId: auth.folderId,
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
 * Retorna true se restaurou, false se não havia backup ou ocorreu erro.
 */
export async function restoreLatestBackupSilently(): Promise<boolean> {
  try {
    const auth = await loadAuth();
    if (!auth) return false;
    const files = await listBackups();
    if (files.length === 0) return false;
    const sorted = [...files].sort((a, b) => {
      const ta = a.created_time ? Date.parse(a.created_time) : 0;
      const tb = b.created_time ? Date.parse(b.created_time) : 0;
      return tb - ta;
    });
    await downloadAndRestoreBackup(sorted[0].id);
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
