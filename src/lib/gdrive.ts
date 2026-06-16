import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { getDb } from "./db";

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
  LAST_SYNC_AT: "gdrive.last_sync_at",
} as const;

export const DEFAULT_FOLDER_NAME = "Vistage Backups";

// ============================================================
// Tipos espelhando o Rust
// ============================================================

type DriveTokens = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  scope?: string | null;
  token_type?: string | null;
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
  const [access, refresh, expiry, folderId, folderName, subfolderName, subfolderIdCached] =
    await Promise.all([
      getSetting(K.ACCESS_TOKEN),
      getSetting(K.REFRESH_TOKEN),
      getSetting(K.TOKEN_EXPIRY),
      getSetting(K.FOLDER_ID),
      getSetting(K.FOLDER_NAME),
      getSetting(K.SUBFOLDER_NAME),
      getSetting(K.SUBFOLDER_ID),
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
  };
}

async function saveFolderName(name: string): Promise<void> {
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
    [K.ACCESS_TOKEN, K.REFRESH_TOKEN, K.TOKEN_EXPIRY, K.FOLDER_ID].map(deleteSetting)
  );
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
