import type { WorkSession } from "./api";

const OVERLAY_LABEL = "work-session";

/** Detecta se estamos rodando dentro do Tauri (e não no browser de dev puro). */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

    const params = new URLSearchParams({
      overlay: "1",
      activity: session.activity_type,
      start: session.started_at,
      id: String(session.id),
    });

    const win = new WebviewWindow(OVERLAY_LABEL, {
      url: `index.html?${params.toString()}`,
      title: "Sessão de trabalho",
      width: 240,
      height: 96,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      shadow: true,
    });

    win.once("tauri://error", () => {
      /* falha ao criar janela não deve quebrar a sessão */
    });
  } catch {
    /* ambiente sem suporte a múltiplas janelas */
  }
}

/** Fecha a mini-janela flutuante, se existir. */
export async function closeSessionOverlay(): Promise<void> {
  if (!isTauri()) return;
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
} | null {
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("overlay") !== "1") return null;
  return {
    activity: sp.get("activity") ?? "Sessão",
    start: sp.get("start") ?? new Date().toISOString(),
    id: Number(sp.get("id") ?? 0),
  };
}

/** True quando o documento atual está rodando como a janela overlay. */
export function isOverlayWindow(): boolean {
  return new URLSearchParams(window.location.search).get("overlay") === "1";
}
