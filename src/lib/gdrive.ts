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
  const fileName = `musicgest-backup-${stamp}.json`;
  const content = JSON.stringify(backup);

  const file: DriveFile = await invoke("gdrive_upload_backup", {
    accessToken,
    folderId: auth.folderId,
    fileName,
    content,
  });

  await setSetting(K.LAST_BACKUP_AT, new Date().toISOString());
  return file;
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
  return restoreBackup(backup);
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
