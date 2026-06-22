import type { WorkSession } from "./api";

const OVERLAY_LABEL = "work-session";

// Prevents concurrent calls from creating two windows before the first one is registered.
let _creating = false;

/** Detecta se estamos rodando dentro do Tauri (e não no browser de dev puro). */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Resolve a URL base correta para novas janelas:
 * - Em dev: usa o devUrl do Vite (window.location.origin = http://localhost:1420)
 * - Em produção: usa tauri://localhost (protocolo interno do Tauri)
 */
function resolveWindowUrl(path: string): string {
  const isDev = window.location.protocol === "http:";
  const base = isDev ? window.location.origin : "tauri://localhost";
  return `${base}/${path.replace(/^\//, "")}`;
}

/**
 * Abre (ou foca) a mini-janela flutuante always-on-top da sessão de trabalho.
 * Passa atividade e horário de início via query string — a janela é puramente
 * apresentacional e não precisa do banco.
 */
export async function openSessionOverlay(session: WorkSession): Promise<void> {
  if (!isTauri()) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

    const existing = await WebviewWindow.getByLabel(OVERLAY_LABEL);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    if (_creating) return;
    _creating = true;

    const isDark = document.documentElement.classList.contains("dark");
    // A cor de destaque também viaja: sem ela, o overlay caía no violeta default
    // do index.css independentemente da personalização escolhida pelo usuário.
    const accent = localStorage.getItem("vistage.accent") || "violet";
    const params = new URLSearchParams({
      overlay: "1",
      activity: session.activity_type,
      start: session.started_at,
      id: String(session.id),
      theme: isDark ? "dark" : "light",
      accent,
    });

    const win = new WebviewWindow(OVERLAY_LABEL, {
      url: resolveWindowUrl(`index.html?${params.toString()}`),
      title: "Sessão de foco",
      width: 280,
      height: 312,
      // resizable: true permite o setSize programático (Expandir/Retrair). Como
      // a janela é sem moldura (decorations:false), o usuário não arrasta a borda.
      resizable: true,
      decorations: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      shadow: true,
    });

    win.once("tauri://created", () => { _creating = false; });
    win.once("tauri://error", () => { _creating = false; });
  } catch {
    _creating = false;
    /* ambiente sem suporte a múltiplas janelas */
  }
}

/** Fecha a mini-janela flutuante, se existir. */
export async function closeSessionOverlay(): Promise<void> {
  if (!isTauri()) return;
  _creating = false;
  try {
    // Emit event so the overlay can close itself (more reliable on Windows)
    const { emit } = await import("@tauri-apps/api/event");
    await emit("work-session-closed");
  } catch { /* ignore */ }
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(OVERLAY_LABEL);
    if (existing) await existing.close();
  } catch {
    /* nada a fazer */
  }
}

/** Lê os parâmetros da sessão a partir da URL (usado dentro da janela overlay). */
export function readOverlayParams(): {
  activity: string;
  start: string;
  id: number;
  theme: string;
  accent: string;
} | null {
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("overlay") !== "1") return null;
  return {
    activity: sp.get("activity") ?? "Sessão",
    start: sp.get("start") ?? new Date().toISOString(),
    id: Number(sp.get("id") ?? 0),
    theme: sp.get("theme") ?? "light",
    accent: sp.get("accent") ?? "violet",
  };
}

/** True quando o documento atual está rodando como a janela overlay. */
export function isOverlayWindow(): boolean {
  return new URLSearchParams(window.location.search).get("overlay") === "1";
}
