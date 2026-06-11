import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { readOverlayParams } from "./overlay";

function elapsed(startedAt: string, pauseOffset: number): string {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime() - pauseOffset) / 1000);
  const clamped = Math.max(0, diff);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
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
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseStartRef = useRef<number | null>(null);
  const pauseOffsetRef = useRef(0);

  // Apply theme
  useEffect(() => {
    if (!params) return;
    if (params.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [params?.theme]);

  useEffect(() => {
    if (!params) return;
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      pauseStartRef.current = Date.now();
      return;
    }
    // Resumed: accumulate pause offset
    if (pauseStartRef.current !== null) {
      const extra = Date.now() - pauseStartRef.current;
      pauseOffsetRef.current += extra;
      pauseStartRef.current = null;
    }
    const tick = () => setTimer(elapsed(params.start, pauseOffsetRef.current));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [params, paused]);

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

  // Listen for session-ended event emitted by the main window
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("work-session-closed", () => void closeSelf());
      } catch { /* ignore */ }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  if (!params) return null;

  return (
    <div className="flex h-screen w-screen select-none bg-background text-foreground">
      <div
        data-tauri-drag-region
        className="flex flex-1 cursor-grab items-center gap-3 px-3.5 py-2.5 active:cursor-grabbing min-w-0"
      >
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {params.activity}
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums leading-tight text-foreground">
            {timer}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 px-2 shrink-0">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          title={paused ? "Retomar" : "Pausar"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
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
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
