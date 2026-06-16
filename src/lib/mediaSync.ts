import { getDb } from "./db";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { useConfigStore } from "./config";
import { uploadMediaToDrive, downloadMediaFromDrive } from "./gdrive";

const KEY_PREFIX = "drive_media:";

function getExtension(path: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : "bin").toLowerCase();
}

function extToMime(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

/** Computes the relative path of an absolute path within uploadsDir. */
function relativize(absPath: string, uploadsDir: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/");
  return norm(absPath).replace(norm(uploadsDir).replace(/\/$/, "") + "/", "");
}

/** Returns the Drive file ID stored for a given relative path, or null. */
async function getDriveMediaId(relPath: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [KEY_PREFIX + relPath]
  );
  return rows[0]?.value ?? null;
}

/** Stores the Drive file ID for a given relative path. */
async function setDriveMediaId(relPath: string, driveId: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [KEY_PREFIX + relPath, driveId]
  );
}

/**
 * After saving a file locally, upload it to Drive in the background.
 * Silently ignores errors (Drive might not be configured).
 * `absPath` = local absolute path to the file.
 */
export async function syncFileToDrive(absPath: string): Promise<void> {
  const uploadsDir = useConfigStore.getState().config?.uploadsDir;
  if (!uploadsDir) return;
  const relPath = relativize(absPath, uploadsDir);
  if (!relPath || relPath === absPath) return; // not inside uploadsDir
  try {
    const bytes = await readFile(absPath);
    const ext = getExtension(absPath);
    const mime = extToMime(ext);
    const CHUNK = 8192;
    let bin = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(bin);
    const driveId = await uploadMediaToDrive(relPath, base64, mime);
    if (driveId) await setDriveMediaId(relPath, driveId);
  } catch {
    // silent — Drive sync is best-effort
  }
}

/**
 * Downloads a file from Drive and saves it locally.
 * Returns the data URL if successful, null otherwise.
 * `absPath` = where to save the file locally.
 */
export async function restoreFileFromDrive(absPath: string): Promise<string | null> {
  const uploadsDir = useConfigStore.getState().config?.uploadsDir;
  if (!uploadsDir) return null;
  const relPath = relativize(absPath, uploadsDir);
  if (!relPath || relPath === absPath) return null;
  const driveId = await getDriveMediaId(relPath);
  if (!driveId) return null;
  try {
    const ext = getExtension(absPath);
    const mime = extToMime(ext);
    const dataUrl = await downloadMediaFromDrive(driveId, mime);
    if (!dataUrl) return null;
    // save locally so next load is instant
    const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dir = absPath.substring(0, Math.max(absPath.lastIndexOf("/"), absPath.lastIndexOf("\\")));
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeFile(absPath, bytes);
    return dataUrl;
  } catch {
    return null;
  }
}

