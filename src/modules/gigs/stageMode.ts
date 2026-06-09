import type { Gig } from "./types";

const STAGE_LABEL = "stage-mode";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openStageMode(gig: Gig): Promise<void> {
  if (!isTauri()) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

    const existing = await WebviewWindow.getByLabel(STAGE_LABEL);
    if (existing) {
      await existing.show();
      await existing.setFocus();
      return;
    }

    const isDark = document.documentElement.classList.contains("dark");
    const params = new URLSearchParams({
      stage: "1",
      gig_id: String(gig.id),
      theme: isDark ? "dark" : "light",
    });

    const win = new WebviewWindow(STAGE_LABEL, {
      url: `index.html?${params.toString()}`,
      title: "Modo Palco",
      width: 360,
      height: 560,
      resizable: true,
      decorations: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      shadow: true,
    });

    win.once("tauri://error", () => { /* silencioso */ });

    // Modo Palco conta como sessão de foco ("Tempo de palco"):
    // inicia ao abrir a janela e encerra quando ela for fechada.
    try {
      const { startSession, getActiveSession, endSessionSilently } = await import(
        "@/modules/foco/api"
      );
      const active = await getActiveSession();
      if (!active) {
        const sessionId = await startSession("Tempo de palco");
        void win.once("tauri://destroyed", () => {
          void endSessionSilently(sessionId);
        });
      }
    } catch { /* sessão é best-effort */ }
  } catch {
    /* sem suporte a múltiplas janelas */
  }
}

export async function closeStageMode(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existing = await WebviewWindow.getByLabel(STAGE_LABEL);
    if (existing) await existing.close();
  } catch { /* nada */ }
}

export function readStageModeParams(): { gigId: number; theme: string } | null {
  const sp = new URLSearchParams(window.location.search);
  if (sp.get("stage") !== "1") return null;
  return {
    gigId: Number(sp.get("gig_id") ?? 0),
    theme: sp.get("theme") ?? "light",
  };
}

export function isStageModeWindow(): boolean {
  return new URLSearchParams(window.location.search).get("stage") === "1";
}
