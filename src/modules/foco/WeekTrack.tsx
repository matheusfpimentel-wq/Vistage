import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Flame, Mic, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BLOCK_CATEGORIES,
  createFocusBlock,
  deleteFocusBlock,
  listFocusBlocks,
  loadFocusStreak,
  loadStageTimeBlocks,
  updateFocusBlock,
  type FocusBlock,
  type FocusBlockKind,
  type StageTimeBlock,
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

// Paleta de cores pra escolher por bloco.
const BLOCK_COLORS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899",
  "#8b5cf6", "#ef4444", "#14b8a6", "#64748b",
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (min: number) => Math.round(min / SNAP) * SNAP;
const minToY = (min: number) => ((min - GRID_MIN) / 60) * HOUR_PX;
const fmt = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(99,102,241,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function blockLabel(b: FocusBlock): string {
  return (b.label && b.label.trim()) || b.category || (b.kind === "foco" ? "Foco" : "Indisponível");
}

function overlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

type Drag = {
  id: number;
  mode: "move" | "resize";
  origWeekday: number;
  origStart: number;
  origDur: number;
  px: number;
  py: number;
  moved: boolean;
};
type Preview = { weekday: number; start_min: number; duration_min: number };

/**
 * Trilha da semana — agenda semanal recorrente de FOCO. Clique numa coluna pra
 * criar um bloco; clique num bloco pra editar (nome, cor, classificação, plano);
 * arraste pra mover; puxe a borda de baixo pra redimensionar. Os blocos de
 * "tempo de palco" das GIGs da semana aparecem em sobreposição (read-only) e
 * geram alerta quando colidem com um bloco planejado.
 */
export function WeekTrack() {
  const [blocks, setBlocks] = useState<FocusBlock[]>([]);
  const [stageBlocks, setStageBlocks] = useState<StageTimeBlock[]>([]);
  const [streak, setStreak] = useState(0);
  const [brush, setBrush] = useState<FocusBlockKind>("foco");
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(() => {
    void listFocusBlocks().then(setBlocks);
    void loadFocusStreak().then(setStreak);
    void loadStageTimeBlocks().then(setStageBlocks);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  // Arrastar (mover/redimensionar) via listeners de janela enquanto há drag.
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const dMin = snap(Math.round(((e.clientY - drag!.py) / HOUR_PX) * 60));
      const dx = e.clientX - drag!.px;
      if (Math.abs(e.clientY - drag!.py) > 4 || Math.abs(dx) > 4) drag!.moved = true;
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
      const d = drag!;
      setDrag(null);
      setPreview(null);
      previewRef.current = null;
      const changed =
        p && (p.weekday !== d.origWeekday || p.start_min !== d.origStart || p.duration_min !== d.origDur);
      if (changed) {
        try {
          await updateFocusBlock(d.id, {
            weekday: p!.weekday,
            start_min: p!.start_min,
            duration_min: p!.duration_min,
          });
          reload();
        } catch (e) {
          toast.error(`Não consegui mover o bloco: ${String(e)}`);
          reload();
        }
      } else if (d.mode === "move" && !d.moved) {
        // clique sem arraste → abre o editor do bloco
        setEditingId(d.id);
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
    })
      .then(reload)
      .catch((e) => toast.error(`Não consegui criar o bloco: ${String(e)}`));
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
      moved: false,
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

  // Conflitos: bloco planejado x tempo de palco no mesmo dia/horário.
  const conflicts: { block: FocusBlock; stage: StageTimeBlock }[] = [];
  for (const b of blocks) {
    for (const st of stageBlocks) {
      if (b.weekday === st.weekday && overlap(b.start_min, b.duration_min, st.start_min, st.duration_min)) {
        conflicts.push({ block: b, stage: st });
      }
    }
  }

  const editing = editingId != null ? blocks.find((b) => b.id === editingId) ?? null : null;

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
              {k === "foco" ? "Bloco de foco" : "Indisponível"}
            </button>
          ))}
        </div>
      </div>


      {conflicts.length > 0 && (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">
              {conflicts.length} sobreposiç{conflicts.length === 1 ? "ão" : "ões"} com tempo de palco:
            </p>
            {conflicts.slice(0, 5).map((c, i) => (
              <p key={i}>
                {DAYS[c.block.weekday]} · "{blockLabel(c.block)}" ({fmt(c.block.start_min)}) sobre palco{" "}
                <span className="font-medium">{c.stage.label}</span> ({fmt(c.stage.start_min)}–{fmt(c.stage.start_min + c.stage.duration_min)})
              </p>
            ))}
          </div>
        </div>
      )}

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

                {/* tempo de palco (GIGs da semana) — read-only, atrás dos blocos */}
                {stageBlocks
                  .filter((s) => s.weekday === wd && s.start_min < GRID_MAX && s.start_min + s.duration_min > GRID_MIN)
                  .map((s, i) => {
                    const top = minToY(Math.max(s.start_min, GRID_MIN));
                    const h = (Math.min(s.start_min + s.duration_min, GRID_MAX) - Math.max(s.start_min, GRID_MIN)) / 60 * HOUR_PX;
                    return (
                      <div
                        key={`st-${s.gig_id}-${i}`}
                        className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md border border-dashed border-violet-500/50 bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-600 dark:text-violet-300"
                        style={{ top, height: Math.max(h, 12) }}
                        title={`Palco: ${s.label} (${fmt(s.start_min)}–${fmt(s.start_min + s.duration_min)})`}
                      >
                        <span className="flex items-center gap-0.5 font-medium">
                          <Mic className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{s.label}</span>
                        </span>
                      </div>
                    );
                  })}

                {display
                  .filter((b) => b.weekday === wd)
                  .map((b) => {
                    const custom = b.color
                      ? { backgroundColor: hexToRgba(b.color, 0.2), borderColor: hexToRgba(b.color, 0.55), color: b.color }
                      : undefined;
                    return (
                      <div
                        key={b.id}
                        onPointerDown={(e) => startDrag(e, b, "move")}
                        className={cn(
                          "absolute inset-x-0.5 cursor-grab overflow-hidden rounded-md border px-1 py-0.5 text-[10px] shadow-sm active:cursor-grabbing",
                          !custom &&
                            (b.kind === "foco"
                              ? "border-primary/40 bg-primary/20 text-primary"
                              : "border-muted-foreground/30 bg-muted-foreground/15 text-muted-foreground")
                        )}
                        style={{
                          top: minToY(b.start_min),
                          height: (b.duration_min / 60) * HOUR_PX,
                          ...custom,
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium">{blockLabel(b)}</span>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() =>
                              void deleteFocusBlock(b.id)
                                .then(reload)
                                .catch((e) => toast.error(`Não consegui excluir o bloco: ${String(e)}`))
                            }
                            className="shrink-0 opacity-50 transition hover:opacity-100"
                            aria-label="Remover bloco"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        {b.duration_min >= 45 && (
                          <span className="block truncate text-[9px] opacity-70">
                            {b.category ? `${b.category} · ` : ""}
                            {fmt(b.start_min)}–{fmt(b.start_min + b.duration_min)}
                          </span>
                        )}
                        <div
                          onPointerDown={(e) => startDrag(e, b, "resize")}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <BlockEditor
          block={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function BlockEditor({
  block,
  onClose,
  onSaved,
}: {
  block: FocusBlock;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(block.label ?? "");
  const [kind, setKind] = useState<FocusBlockKind>(block.kind);
  const [category, setCategory] = useState<string>(block.category ?? "");
  const [color, setColor] = useState<string | null>(block.color);
  const [plan, setPlan] = useState(block.plan ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateFocusBlock(block.id, {
        label: label.trim() || null,
        kind,
        category: category || null,
        color,
        plan: plan.trim() || null,
      });
      onSaved();
    } catch (e) {
      toast.error(`Não consegui salvar o bloco: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar bloco</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do bloco</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === "foco" ? "Ex: Deep work / mixagem" : "Ex: Almoço, deslocamento"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {(["foco", "morto"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKind(k); if (k === "morto") setCategory(""); }}
                  className={cn(
                    "flex-1 rounded-md border px-2.5 py-1.5 text-xs transition",
                    kind === k ? "border-primary bg-primary/15 text-primary" : "hover:bg-accent"
                  )}
                >
                  {k === "foco" ? "Foco (conta nas horas)" : "Indisponível"}
                </button>
              ))}
            </div>
          </div>
          {kind === "foco" && (
            <div className="space-y-1.5">
              <Label>Classificação</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem classificação</option>
                {BLOCK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor(null)}
                className={cn(
                  "h-6 w-6 rounded-full border-2 bg-muted text-[9px] text-muted-foreground",
                  color === null ? "border-foreground" : "border-transparent"
                )}
                title="Cor do tipo (padrão)"
                aria-label="Cor padrão"
              >
                —
              </button>
              {BLOCK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition",
                    color === c ? "border-foreground" : "border-transparent hover:scale-110"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Plano (opcional)</Label>
            <Textarea
              rows={2}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="O que pretende fazer nesse bloco?"
            />
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              try {
                await deleteFocusBlock(block.id);
                onSaved();
              } catch (e) {
                toast.error(`Não consegui excluir o bloco: ${String(e)}`);
              }
            }}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
