import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createFocusBlock,
  deleteFocusBlock,
  listFocusBlocks,
  loadFocusStreak,
  updateFocusBlock,
  type FocusBlock,
  type FocusBlockKind,
} from "./api";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 38;
const SNAP = 30; // minutos
const GRID_MIN = START_HOUR * 60;
const GRID_MAX = END_HOUR * 60;
const GRID_H = (END_HOUR - START_HOUR) * HOUR_PX;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (min: number) => Math.round(min / SNAP) * SNAP;
const minToY = (min: number) => ((min - GRID_MIN) / 60) * HOUR_PX;
const fmt = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

type Drag = {
  id: number;
  mode: "move" | "resize";
  origWeekday: number;
  origStart: number;
  origDur: number;
  px: number;
  py: number;
};
type Preview = { weekday: number; start_min: number; duration_min: number };

/**
 * Trilha da semana — agenda semanal recorrente de FOCO. Clique numa coluna pra
 * criar um bloco; arraste pra mover (entre dias/horas); puxe a borda de baixo
 * pra redimensionar. Dois tipos: "foco" (planejado) e "morto" (indisponível).
 */
export function WeekTrack() {
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [streak, setStreak] = useState(0);
  const [brush, setBrush] = useState<FocusBlockKind>("foco");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(() => {
    void listFocusBlocks().then(setBlocks);
    void loadFocusStreak().then(setStreak);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  // Arrastar (mover/redimensionar) via listeners de janela enquanto há drag.
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const dMin = snap(Math.round(((e.clientY - drag!.py) / HOUR_PX) * 60));
      let next: Preview;
      if (drag!.mode === "move") {
        const start = clamp(drag!.origStart + dMin, GRID_MIN, GRID_MAX - drag!.origDur);
        let weekday = drag!.origWeekday;
        const grid = gridRef.current;
        if (grid) {
          const rect = grid.getBoundingClientRect();
          weekday = clamp(Math.floor((e.clientX - rect.left) / (rect.width / 7)), 0, 6);
        }
        next = { weekday, start_min: start, duration_min: drag!.origDur };
      } else {
        const dur = clamp(drag!.origDur + dMin, SNAP, GRID_MAX - drag!.origStart);
        next = { weekday: drag!.origWeekday, start_min: drag!.origStart, duration_min: dur };
      }
      previewRef.current = next;
      setPreview(next);
    }
    async function onUp() {
      const p = previewRef.current;
      const id = drag!.id;
      setDrag(null);
      setPreview(null);
      previewRef.current = null;
      if (p) {
        await updateFocusBlock(id, {
          weekday: p.weekday,
          start_min: p.start_min,
          duration_min: p.duration_min,
        });
        reload();
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, reload]);

  function onColumnDown(e: React.PointerEvent, weekday: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    let start = snap(GRID_MIN + Math.round(((e.clientY - rect.top) / HOUR_PX) * 60));
    start = clamp(start, GRID_MIN, GRID_MAX - 60);
    void createFocusBlock({
      weekday,
      start_min: start,
      duration_min: 60,
      kind: brush,
      label: null,
    }).then(reload);
  }

  function startDrag(e: React.PointerEvent, b: FocusBlock, mode: Drag["mode"]) {
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      id: b.id,
      mode,
      origWeekday: b.weekday,
      origStart: b.start_min,
      origDur: b.duration_min,
      px: e.clientX,
      py: e.clientY,
    });
  }

  // Aplica o preview no bloco que está sendo arrastado (move até entre colunas).
  const display = blocks.map((b) =>
    drag?.id === b.id && preview
      ? { ...b, weekday: preview.weekday, start_min: preview.start_min, duration_min: preview.duration_min }
      : b
  );

  const focoMin = blocks
    .filter((b) => b.kind === "foco")
    .reduce((s, b) => s + b.duration_min, 0);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Trilha da semana</h2>
          <span
            className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500"
            title="Dias seguidos com sessão de foco"
          >
            <Flame className="h-3.5 w-3.5" /> {streak} dia{streak === 1 ? "" : "s"}
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round((focoMin / 60) * 10) / 10}h de foco planejadas/semana
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Criar:</span>
          {(["foco", "morto"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setBrush(k)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition",
                brush === k
                  ? k === "foco"
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-muted-foreground/40 bg-muted-foreground/15 text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {k === "foco" ? "Bloco de foco" : "Bloco morto"}
            </button>
          ))}
        </div>
      </div>

      <p className="px-3 pt-2 text-[11px] text-muted-foreground">
        Clique numa coluna pra criar · arraste pra mover · puxe a borda de baixo
        pra redimensionar.
      </p>

      <div className="flex select-none p-3">
        {/* régua de horas */}
        <div className="w-9 shrink-0">
          <div className="h-6" />
          <div className="relative" style={{ height: GRID_H }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: minToY(h * 60) }}
              >
                {h}h
              </div>
            ))}
          </div>
        </div>

        {/* grade dos 7 dias */}
        <div ref={gridRef} className="grid flex-1 grid-cols-7">
          {DAYS.map((day, wd) => (
            <div key={wd} className="border-l">
              <div className="h-6 text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
              <div
                className="relative"
                style={{ height: GRID_H }}
                onPointerDown={(e) => onColumnDown(e, wd)}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                    style={{ top: minToY(h * 60) }}
                  />
                ))}
                {display
                  .filter((b) => b.weekday === wd)
                  .map((b) => (
                    <div
                      key={b.id}
                      onPointerDown={(e) => startDrag(e, b, "move")}
                      className={cn(
                        "absolute inset-x-0.5 cursor-grab overflow-hidden rounded-md border px-1 py-0.5 text-[10px] shadow-sm active:cursor-grabbing",
                        b.kind === "foco"
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-muted-foreground/30 bg-muted-foreground/15 text-muted-foreground"
                      )}
                      style={{ top: minToY(b.start_min), height: (b.duration_min / 60) * HOUR_PX }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-medium">
                          {b.kind === "foco" ? "Foco" : "Bloqueado"}
                        </span>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => void deleteFocusBlock(b.id).then(reload)}
                          className="shrink-0 opacity-50 transition hover:opacity-100"
                          aria-label="Remover bloco"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {b.duration_min >= 45 && (
                        <span className="text-[9px] opacity-70">
                          {fmt(b.start_min)}–{fmt(b.start_min + b.duration_min)}
                        </span>
                      )}
                      <div
                        onPointerDown={(e) => startDrag(e, b, "resize")}
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
