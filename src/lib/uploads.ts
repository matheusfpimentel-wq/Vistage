import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  copyFile,
  exists,
  mkdir,
  readFile,
  remove,
  writeFile,
} from "@tauri-apps/plugin-fs";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useConfigStore } from "./config";
import {
  downloadMediaFromDrive,
  getDriveFileId,
  isDriveConnected,
  isDriveMedia,
  uploadMediaToDrive,
} from "./gdrive";

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
export const VIDEO_EXTS = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];
export const DOC_EXTS = ["pdf", "doc", "docx", "txt", "rtf", "md", "odt", "ttf", "otf", "woff", "woff2"];

/**
 * MIME por extensão. Sem o MIME certo no data URL, o <video> não reproduz —
 * era o caso do .mov, que caía em "application/octet-stream" e não tocava.
 */
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
};

type PickOptions = {
  title?: string;
  extensions: string[];
  filterName: string;
};

/** Abre o diálogo nativo e retorna o caminho selecionado, ou null. */
export async function pickFile(opts: PickOptions): Promise<string | null> {
  const result = await openDialog({
    multiple: false,
    title: opts.title,
    filters: [{ name: opts.filterName, extensions: opts.extensions }],
  });
  if (!result || typeof result !== "string") return null;
  return result;
}

/** Abre o diálogo nativo permitindo VÁRIOS arquivos; retorna a lista de caminhos. */
export async function pickFiles(opts: PickOptions): Promise<string[]> {
  const result = await openDialog({
    multiple: true,
    title: opts.title,
    filters: [{ name: opts.filterName, extensions: opts.extensions }],
  });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function joinPath(...parts: string[]): string {
  const sep = parts[0]?.includes("\\") && !parts[0].includes("/") ? "\\" : "/";
  return parts
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .filter(Boolean)
    .join(sep);
}

function getExtension(path: string): string {
  const m = path.match(/\.([a-zA-Z0-9]+)$/);
  return (m ? m[1] : "bin").toLowerCase();
}

/**
 * Copia o arquivo escolhido para uma subpasta dentro de `uploadsDir` e retorna
 * o caminho ABSOLUTO do destino. Subpastas são criadas se não existirem.
 */
export async function saveAttachment(
  sourcePath: string,
  subdir: string
): Promise<string> {
  const cfg = useConfigStore.getState().config;
  if (!cfg?.uploadsDir) throw new Error("Pasta de uploads não configurada.");
  const dir = joinPath(cfg.uploadsDir, subdir);
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  const ext = getExtension(sourcePath);
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const filename = `${stamp}.${ext}`;
  const dest = joinPath(dir, filename);
  await copyFile(sourcePath, dest);

  // Mídia "pesada" (galeria, flyers, música…) sobe pro Google Drive em segundo
  // plano, se conectado. Best-effort: a cópia local continua valendo de qualquer
  // forma, então nada se perde se o Drive falhar ou estiver desconectado.
  const rel = `${subdir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")}/${filename}`;
  if (isDriveMedia(rel)) {
    void (async () => {
      try {
        if (!(await isDriveConnected())) return;
        const bytes = await readFile(dest);
        const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
        await uploadMediaToDrive(rel, bytesToBase64(bytes), mime);
      } catch {
        /* fica só local */
      }
    })();
  }
  return dest;
}

/** Uint8Array → base64 (em blocos, pra não estourar a pilha com arquivos grandes). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Parte relativa de um caminho de anexo (depois do último "/uploads/"). */
function relUnderUploads(path: string): string | null {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.toLowerCase().lastIndexOf("/uploads/");
  if (idx === -1) return null;
  const segs = norm.slice(idx + "/uploads/".length).split("/").filter(Boolean);
  return segs.length ? segs.join("/") : null;
}

/**
 * Anexo sumido do disco mas existente no Drive: baixa, grava no uploadsDir atual
 * e devolve o caminho local. Best-effort (null se não der). Cobre abrir um
 * .vistage cuja mídia pesada vive no Drive (não embutida no arquivo).
 */
async function tryFetchFromDrive(path: string): Promise<string | null> {
  try {
    const rel = relUnderUploads(path);
    if (!rel) return null;
    const fileId = await getDriveFileId(rel);
    if (!fileId || !(await isDriveConnected())) return null;
    const dest = resolveUnderCurrentUploads(path);
    if (!dest) return null;
    const b64 = await downloadMediaFromDrive(fileId);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dir = dest.substring(0, Math.max(dest.lastIndexOf("/"), dest.lastIndexOf("\\")));
    if (dir && !(await exists(dir))) await mkdir(dir, { recursive: true });
    await writeFile(dest, bytes);
    return dest;
  } catch {
    return null;
  }
}

// ── Streaming nativo de mídia (asset://) ─────────────────────────────────────
// Antes, CADA foto/vídeo era lido inteiro e convertido em base64 num data URL
// guardado em estado React. Numa galeria com dezenas de fotos — e PIOR, com
// vídeos inteiros — isso enchia a memória do JS e travava/estourava. Agora a
// mídia é servida pelo protocolo `asset:` do Tauri (streaming direto do disco,
// sem cópia em memória, com lazy-decode do navegador). Detectamos UMA vez se o
// protocolo está disponível nesta máquina; se não estiver, caímos no base64 de
// antes — então nunca há regressão, só ganho quando o asset funciona.
type AssetMode = "unknown" | "ok" | "off";
let assetMode: AssetMode = "unknown";
let assetProbe: Promise<void> | null = null;

/** Testa se uma URL `asset:` realmente carrega (via <img>), com timeout. */
function probeAssetUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 2500);
  });
}

/** Detecta o modo do protocolo asset uma única vez (compartilhado entre hooks). */
async function ensureAssetMode(sampleImagePath: string): Promise<void> {
  if (assetMode !== "unknown") return;
  if (!assetProbe) {
    assetProbe = probeAssetUrl(convertFileSrc(sampleImagePath)).then((ok) => {
      assetMode = ok ? "ok" : "off";
    });
  }
  await assetProbe;
}

/** Resolve o caminho que REALMENTE existe (cobre .vistage de outra máquina). */
async function resolveExistingPath(path: string): Promise<string> {
  try {
    if (await exists(path)) return path;
  } catch {
    /* segue pro fallback */
  }
  const alt = resolveUnderCurrentUploads(path);
  if (alt && alt !== path) {
    try {
      if (await exists(alt)) return alt;
    } catch {
      /* ignora */
    }
  }
  // Não está em disco: tenta baixar do Google Drive (mídia pesada não embutida).
  const fromDrive = await tryFetchFromDrive(path);
  if (fromDrive) return fromDrive;
  return path;
}

/**
 * Hook React que devolve a URL de uma mídia para usar em <img>/<video>.
 * Prefere streaming nativo (asset://) e só cai no data URL base64 quando o
 * protocolo asset não está disponível. Vídeo NUNCA é carregado em base64 a não
 * ser que o asset comprovadamente não funcione (era a maior fonte de estouro).
 */
export function useImageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const resolved = await resolveExistingPath(path);
      const isVideo = VIDEO_EXTS.includes(getExtension(resolved));

      if (isVideo) {
        // Vídeo: streaming nativo (evita o base64 gigante). Só base64 se o asset
        // já se provou indisponível nesta máquina.
        if (assetMode === "off") {
          const data = await readAsDataUrl(resolved);
          if (!cancelled) setUrl(data);
        } else if (!cancelled) {
          setUrl(convertFileSrc(resolved));
        }
        return;
      }

      // Imagem: usa asset se disponível; detecta uma vez; senão base64.
      if (assetMode === "unknown") await ensureAssetMode(resolved);
      if (assetMode === "ok") {
        if (!cancelled) setUrl(convertFileSrc(resolved));
        return;
      }
      const data = await readAsDataUrl(resolved);
      if (!cancelled) setUrl(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

/**
 * Reconstrói o caminho de um anexo sob o uploadsDir atual a partir da parte
 * relativa (depois de ".../uploads/"). Torna o carregamento de imagens imune a
 * caminhos absolutos antigos vindos de outro computador ou de outra pasta.
 */
function resolveUnderCurrentUploads(path: string): string | null {
  const uploadsDir = useConfigStore.getState().config?.uploadsDir;
  if (!uploadsDir) return null;
  const norm = path.replace(/\\/g, "/");
  const idx = norm.toLowerCase().lastIndexOf("/uploads/");
  if (idx === -1) return null;
  const segs = norm
    .slice(idx + "/uploads/".length)
    .split("/")
    .filter(Boolean);
  if (segs.length === 0) return null;
  return joinPath(uploadsDir, ...segs);
}

/** Lê o arquivo e retorna um data URL — útil quando convertFileSrc não funciona em alguns paths. */
async function readAsDataUrl(
  absolutePath: string | null | undefined
): Promise<string | null> {
  if (!absolutePath) return null;
  try {
    const bytes = await readFile(absolutePath);
    const ext = getExtension(absolutePath);
    const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
    // converte Uint8Array em base64
    // Chunk to avoid stack overflow on large files and O(n²) string builds.
    const CHUNK = 8192;
    let bin = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

export async function deleteAttachment(absolutePath: string | null | undefined): Promise<void> {
  if (!absolutePath) return;
  try {
    await remove(absolutePath);
  } catch {
    /* ignora — pode já ter sido removido */
  }
}

/** Abre o arquivo no app padrão do OS (ex: PDF no Preview/Adobe). */
export async function openAttachment(absolutePath: string): Promise<void> {
  await openShell(absolutePath);
}
