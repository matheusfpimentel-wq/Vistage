import { useCallback, useEffect, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  deleteFlowSession,
  endFlowSession,
  getOpenFlowSession,
  listFlowSessions,
  startFlowSession,
} from "../api";
import type { FlowSession } from "../types";

// Sub-bloco Criatividade — Flow Theory (Csikszentmihalyi): registra sessões
// de trabalho com nível de flow (1-5) e bloqueios, e mostra um heatmap simples
// de horários × dia da semana com melhor flow ao longo do tempo.

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function FlowSessionPanel({ trackId }: { trackId: number }) {
  const [sessions, setSessions] = useState<FlowSession[]>([]);
  const [open, setOpen] = useState<FlowSession | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    const [list, openSession] = await Promise.all([
      listFlowSessions(trackId),
      getOpenFlowSession(trackId),
    ]);
    setSessions(list);
    setOpen(openSession);
  }, [trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleStart() {
    await startFlowSession(trackId);
    toast.success("Sessão de flow iniciada");
    await refresh();
  }

  async function handleEnd() {
    if (!open) return;
    await endFlowSession(open.id, level, notes.trim() || null);
    setLevel(null);
    setNotes("");
    toast.success("Sessão encerrada");
    await refresh();
  }

  async function handleDelete(id: number) {
    if (!(await confirmDialog({ title: "Excluir", description: "Excluir essa sessão?", confirmLabel: "Excluir", destructive: true }))) return;
    await deleteFlowSession(id);
    await refresh();
  }

  const heat = buildHeatmap(sessions);

  return (
    <div className="space-y-4">
      {open ? (
        <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-3">
          <div className="text-sm font-medium text-primary">
            Sessão em andamento — iniciada{" "}
            {new Date(open.started_at).toLocaleTimeString("pt-BR")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nível de flow ao encerrar</Label>
            <FlowScale value={level} onChange={setLevel} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Bloqueios / notas (opcional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="O que travou? O que fluiu?"
            />
          </div>
          <Button size="sm" onClick={handleEnd}>
            <Square className="h-3.5 w-3.5" /> Encerrar sessão
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="dark" onClick={handleStart}>
          <Play className="h-3.5 w-3.5" /> Iniciar sessão de flow
        </Button>
      )}

      {sessions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Heatmap de flow (período × dia)
          </div>
          <HeatmapGrid heat={heat} />
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-1">
          {sessions.slice(0, 8).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs"
            >
              <div>
                <span className="font-medium">{formatDate(s.started_at)}</span>
                {s.flow_level && (
                  <span className="ml-2 text-muted-foreground">
                    flow {s.flow_level}/5
                  </span>
                )}
                {!s.ended_at && (
                  <span className="ml-2 text-primary">em andamento</span>
                )}
                {s.block_notes && (
                  <div className="text-muted-foreground">{s.block_notes}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "h-8 w-8 rounded-md border text-sm transition",
            value === n
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-accent"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// 4 períodos do dia × 7 dias da semana
const PERIODS = ["Madrugada", "Manhã", "Tarde", "Noite"];

function periodIndex(hour: number): number {
  if (hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 18) return 2;
  return 3;
}

type Heat = { sum: number; count: number }[][]; // [period][weekday]

function buildHeatmap(sessions: FlowSession[]): Heat {
  const heat: Heat = PERIODS.map(() =>
    WEEKDAYS.map(() => ({ sum: 0, count: 0 }))
  );
  for (const s of sessions) {
    if (s.flow_level == null) continue;
    const d = new Date(s.started_at);
    const p = periodIndex(d.getHours());
    const w = d.getDay();
    heat[p][w].sum += s.flow_level;
    heat[p][w].count += 1;
  }
  return heat;
}

function HeatmapGrid({ heat }: { heat: Heat }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-[10px]">
        <thead>
          <tr>
            <th />
            {WEEKDAYS.map((w) => (
              <th key={w} className="font-normal text-muted-foreground">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p, pi) => (
            <tr key={p}>
              <td className="pr-1 text-right text-muted-foreground">{p}</td>
              {WEEKDAYS.map((_, wi) => {
                const cell = heat[pi][wi];
                const avg = cell.count > 0 ? cell.sum / cell.count : 0;
                const intensity = avg / 5; // 0..1
                return (
                  <td key={wi}>
                    <div
                      title={
                        cell.count > 0
                          ? `${avg.toFixed(1)}/5 (${cell.count}x)`
                          : "sem dados"
                      }
                      className="h-5 w-7 rounded"
                      style={{
                        backgroundColor:
                          cell.count > 0
                            ? `hsl(263 70% 60% / ${0.15 + intensity * 0.7})`
                            : "hsl(0 0% 50% / 0.08)",
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
