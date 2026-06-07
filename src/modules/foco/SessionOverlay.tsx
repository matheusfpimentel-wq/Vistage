import { useEffect, useRef, useState } from "react";
import { Square, X } from "lucide-react";
import { readOverlayParams } from "./overlay";

function elapsed(startedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Mini-janela flutuante (always-on-top) exibida durante uma sessão de trabalho.
 * É apenas apresentacional: mostra atividade + cronômetro. O botão "Encerrar"
 * traz a janela principal para frente para o usuário finalizar a sessão lá.
 */
export function SessionOverlay() {
  const params = readOverlayParams();
  const [timer, setTimer] = useState("00:00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!params) return;
    const tick = () => setTimer(elapsed(params.start));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [params]);

  async function focusMain() {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const main = await WebviewWindow.getByLabel("main");
      if (main) {
        await main.show();
        await main.unminimize();
        await main.setFocus();
      }
    } catch {
      /* ignore */
    }
  }

  async function closeSelf() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
    } catch {
      /* ignore */
    }
  }

  if (!params) return null;

  return (
    <div
      data-tauri-drag-region
      className="flex h-screen w-screen cursor-grab select-none items-center gap-3 bg-zinc-900 px-3.5 py-2.5 text-zinc-100 active:cursor-grabbing"
    >
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium text-zinc-400">
          {params.activity}
        </div>
        <div className="font-mono text-xl font-semibold tabular-nums leading-tight">
          {timer}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void focusMain()}
        title="Encerrar na janela principal"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary transition hover:bg-primary/30"
      >
        <Square className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void closeSelf()}
        title="Fechar mini-janela"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
