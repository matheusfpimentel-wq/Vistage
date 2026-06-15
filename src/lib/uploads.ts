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
export const DOC_EXTS = ["pdf", "doc", "docx", "txt", "rtf", "md", "odt"];

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
 * @deprecated convertFileSrc não funciona com paths arbitrários fora do scope.
 * Use `useImageUrl(path)` ou `readAsDataUrl(path)` no lugar.
 * Mantido como string vazia pra não quebrar callers existentes que serão migrados.
 */
export function assetUrl(_path: string | null | undefined): string | null {
  return null;
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
    void readAsDataUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url;
}

/** Lê o arquivo e retorna um data URL — útil quando convertFileSrc não funciona em alguns paths. */
export async function readAsDataUrl(
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
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
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
