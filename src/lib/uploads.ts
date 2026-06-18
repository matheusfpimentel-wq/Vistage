import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  copyFile,
  exists,
  mkdir,
  readFile,
  remove,
} from "@tauri-apps/plugin-fs";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { useConfigStore } from "./config";

export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
export const VIDEO_EXTS = ["mp4", "mov", "webm", "avi", "mkv", "m4v"];
export const DOC_EXTS = ["pdf", "doc", "docx", "txt", "rtf", "md", "odt", "ttf", "otf", "woff", "woff2"];

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
  return dest;
}

/**
 * Hook React que carrega uma imagem como data URL.
 * Funciona pra qualquer caminho que o app tenha permissão fs:allow-read-file.
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
      // 1. tenta o caminho absoluto como está salvo no banco
      let data = await readAsDataUrl(path);
      // 2. fallback: resolve sob o uploadsDir ATUAL. Cobre o caso de abrir um
      //    .vistage cujos caminhos absolutos são de outra máquina/pasta — os
      //    bytes foram restaurados em uploads/<subdir>/<arquivo>, mas a linha no
      //    banco ainda aponta para o caminho antigo, que não existe aqui.
      if (!data) {
        const alt = resolveUnderCurrentUploads(path);
        if (alt && alt !== path) data = await readAsDataUrl(alt);
      }
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
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
        ? "image/png"
        : ext === "gif"
        ? "image/gif"
        : ext === "webp"
        ? "image/webp"
        : "application/octet-stream";
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
