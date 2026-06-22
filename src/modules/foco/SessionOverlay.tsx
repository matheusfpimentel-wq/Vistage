import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Lightbulb,
  Maximize2,
  Minimize2,
  Phone,
  Square,
  X,
} from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { readOverlayParams } from "./overlay";
import { applyAccent, type Accent } from "@/lib/theme";
import { CircularTimer } from "./CircularTimer";
import { getDb } from "@/lib/db";
import { loadFocusPanel, type FocusPanel, type WorkSession } from "./api";
import { updateTask } from "@/modules/tasks/api";

// Tamanhos da janela: compacto (só o círculo) e expandido (círculo + painel).
const COMPACT = { w: 280, h: 312 };
const EXPANDED = { w: 300, h: 540 };

function elapsedSecs(startedAt: string, pauseOffset: number): number {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime() - pauseOffset) / 1000);
  return Math.max(0, diff);
}

function fmtElapsed(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function fmtPlanned(min: number): string {
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
  }
  return `${min}min`;
}

type SessionRow = Pick<
  WorkSession,
  "activity_type" | "started_at" | "planned_minutes" | "context_type" | "context_id"
>;

/**
 * Mini-janela flutuante (always-on-top) do modo foco. Mostra o círculo com o
 * tempo, o anel rumo ao tempo previsto e — ao expandir — o painel de contexto
 * da atividade (palco / música / gestão). Nunca encerra sozinho: ao vencer o
 * tempo previsto, só alerta. O "Encerrar" traz a janela principal pra frente.
 */
export function SessionOverlay() {
  const params = readOverlayParams();
  const [session, setSession] = useState<SessionRow | null>(null);
  const [secs, setSecs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panel, setPanel] = useState<FocusPanel>(null);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseStartRef = useRef<number | null>(null);
  const pauseOffsetRef = useRef(0);
  const expiredNotifiedRef = useRef(false);

  // Tema + acento (vêm na URL; sem isso a janela ficava sempre violeta).
  useEffect(() => {
    if (!params) return;
    const theme = params.theme === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
    applyAccent(params.accent as Accent, theme);
  }, [params?.theme, params?.accent]);

  // Carrega a linha da sessão do banco (getDb() delega pro processo Rust, então
  // funciona aqui mesmo a janela sendo "presentacional"). Dá o tempo previsto e
  // o contexto pro painel.
  useEffect(() => {
    if (!params) return;
    let active = true;
    void (async () => {
      try {
        const rows = await getDb().select<SessionRow[]>(
          `SELECT activity_type, started_at, planned_minutes, context_type, context_id
             FROM work_sessions WHERE id = $1`,
          [params.id]
        );
        if (active && rows[0]) setSession(rows[0]);
      } catch {
        /* sem banco pronto — segue com os params da URL */
      }
    })();
    return () => {
      active = false;
    };
  }, [params?.id]);

  // Cronômetro (descontando pausa). Avisa a janela principal pra congelar junto.
  useEffect(() => {
    if (!params) return;
    if (paused) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      pauseStartRef.current = Date.now();
      void emit("work-session-pause", { paused: true, pauseMs: pauseOffsetRef.current });
      return;
    }
    if (pauseStartRef.current !== null) {
      pauseOffsetRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    void emit("work-session-pause", { paused: false, pauseMs: pauseOffsetRef.current });
    const tick = () => setSecs(elapsedSecs(params.start, pauseOffsetRef.current));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [params, paused]);

  const plannedMin = session?.planned_minutes ?? null;
  const plannedSecs = plannedMin ? plannedMin * 60 : null;

  // Venceu o tempo previsto → alerta UMA vez (nunca encerra sozinho).
  useEffect(() => {
    if (plannedSecs && secs >= plannedSecs && !expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      setExpired(true);
      void emit("work-session-expired", { activity: session?.activity_type ?? params?.activity });
    }
  }, [secs, plannedSecs, session?.activity_type, params?.activity]);

  const refreshPanel = useCallback(async () => {
    if (!session) return;
    try {
      setPanel(await loadFocusPanel(session));
    } catch {
      setPanel(null);
    }
  }, [session]);

  useEffect(() => {
    if (expanded) void refreshPanel();
  }, [expanded, refreshPanel]);

  async function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    try {
      const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
      const dim = next ? EXPANDED : COMPACT;
      await getCurrentWindow().setSize(new LogicalSize(dim.w, dim.h));
    } catch {
      /* ambiente sem suporte a redimensionar */
    }
  }

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

  // A janela principal avisa quando a sessão é encerrada lá.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("work-session-closed", () => void closeSelf());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  if (!params) return null;

  const progress = plannedSecs ? secs / plannedSecs : undefined;
  const activity = session?.activity_type ?? params.activity;

  return (
    <div className="flex h-screen w-screen flex-col select-none overflow-hidden bg-background text-foreground">
      <div
        data-tauri-drag-region
        className="flex shrink-0 cursor-grab items-center justify-between gap-2 px-3 pt-2 active:cursor-grabbing"
      >
        <span className="pointer-events-none flex items-center gap-1.5 truncate text-[11px] font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
          {activity}
        </span>
        <button
          type="button"
          onClick={() => void closeSelf()}
          title="Fechar mini-janela"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1.5 px-3 pt-1">
        <CircularTimer
          size={150}
          elapsedLabel={fmtElapsed(secs)}
          progress={progress}
          plannedLabel={plannedMin ? fmtPlanned(plannedMin) : null}
          paused={paused}
          expired={expired}
          onToggle={() => setPaused((p) => !p)}
        />
        {expired && (
          <span className="text-[11px] font-medium text-amber-500">⏰ tempo previsto atingido</span>
        )}
      </div>

      {expanded ? (
        <div className="mt-2 flex-1 overflow-y-auto border-t px-3 py-2">
          <PanelView
            panel={panel}
            onToggleTask={async (id) => {
              try {
                await updateTask({ id, status: "Concluída" });
                await refreshPanel();
              } catch {
                /* ignore */
              }
            }}
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        <button
          type="button"
          onClick={() => void toggleExpand()}
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {expanded ? "Retrair" : "Expandir"}
        </button>
        <button
          type="button"
          onClick={() => void focusMain()}
          title="Encerrar na janela principal"
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/20 text-xs font-medium text-primary transition hover:bg-primary/30"
        >
          <Square className="h-3.5 w-3.5" /> Encerrar
        </button>
      </div>
    </div>
  );
}

function PanelView({
  panel,
  onToggleTask,
}: {
  panel: FocusPanel;
  onToggleTask: (id: number) => void;
}) {
  if (!panel) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Mantenha o foco. Sem contexto extra pra esta atividade.
      </p>
    );
  }

  if (panel.kind === "stage") {
    const wa = panel.dayContactPhone
      ? `https://wa.me/${panel.dayContactPhone.replace(/\D/g, "")}`
      : null;
    return (
      <div className="space-y-2.5 text-xs">
        <div>
          <div className="font-semibold">{panel.title}</div>
          {panel.city && <div className="text-muted-foreground">{panel.city}</div>}
        </div>
        {panel.slots.length > 0 && (
          <div className="flex items-start gap-1.5">
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="flex flex-wrap gap-1">
              {panel.slots.map((s, i) => (
                <span key={i} className="rounded bg-muted px-1.5 py-0.5 tabular-nums">
                  {s.start || "?"}
                  {s.end ? `–${s.end}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
        {panel.dayContactName && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
                {panel.dayContactName}
              </a>
            ) : (
              <span>{panel.dayContactName}</span>
            )}
          </div>
        )}
        {panel.ideas.length > 0 && (
          <div className="flex items-start gap-1.5">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <ul className="space-y-0.5">
              {panel.ideas.map((idea, i) => (
                <li key={i} className="text-muted-foreground">
                  {idea}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (panel.kind === "music") {
    return (
      <div className="space-y-1.5 text-xs">
        <div className="font-semibold">{panel.title}</div>
        {panel.stage && (
          <div className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {panel.stage}
          </div>
        )}
        {panel.concept ? (
          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{panel.concept}</p>
        ) : (
          <p className="text-muted-foreground">Sem conceito anotado para esta faixa.</p>
        )}
      </div>
    );
  }

  // tasks
  if (panel.tasks.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">Sem tarefas pendentes. 🎯</p>;
  }
  return (
    <ul className="space-y-1">
      {panel.tasks.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onToggleTask(t.id)}
            className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition hover:bg-accent"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input">
              <Check className="h-3 w-3 opacity-0" />
            </span>
            <span className="flex-1 truncate">{t.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
