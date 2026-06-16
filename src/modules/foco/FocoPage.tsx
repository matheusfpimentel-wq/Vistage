import { useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatDate, todayISO } from "@/lib/format";
import {
  loadHeatmap,
  loadActivityStats,
  loadTimePerProject,
  listSessions,
  deleteSession,
  listHighlights,
  createHighlight,
  deleteHighlight,
  type HeatmapCell,
  type ActivityStats,
  type TimePerProject,
  type WorkSession,
  type Highlight,
} from "./api";

function formatHours(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6h–23h

export function FocoPage() {
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [timePerProject, setTimePerProject] = useState<TimePerProject[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  async function refresh() {
    const [h, a, sess, hl, tpp] = await Promise.all([
      loadHeatmap(),
      loadActivityStats(),
      listSessions(100),
      listHighlights(),
      loadTimePerProject(),
    ]);
    setHeatmap(h);
    setActivityStats(a);
    setSessions(sess);
    setHighlights(hl);
    setTimePerProject(tpp);
  }

  useEffect(() => { void refresh(); }, []);

  const totalMinutes = activityStats.reduce((s, a) => s + a.total_minutes, 0);

  return (
    <div className="space-y-6">
      {activityStats.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Nenhuma sessão encerrada ainda. Inicie uma sessão pelo botão "▶ Sessão" no topo.
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <HeatmapCard heatmap={heatmap} />
            <ActivityCard stats={activityStats} totalMinutes={totalMinutes} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumo por atividade</CardTitle>
              <CardDescription>Total: {Math.round(totalMinutes / 60)}h acumuladas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activityStats.map((s) => (
                  <div key={s.activity_type} className="flex items-center gap-3 text-sm">
                    <div className="w-36 truncate font-medium">{s.activity_type}</div>
                    <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                      <div
                        className="h-full bg-primary/60"
                        style={{ width: `${(s.total_minutes / totalMinutes) * 100}%` }}
                      />
                    </div>
                    <div className="w-16 text-right tabular-nums text-xs text-muted-foreground">
                      {Math.round(s.total_minutes / 60)}h
                    </div>
                    <div className="text-xs text-muted-foreground">
                      E:{s.avg_energy} F:{s.avg_focus}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {timePerProject.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tempo por projeto</CardTitle>
            <CardDescription>Tempo investido por faixa, GIG, conteúdo ou tarefa.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {timePerProject.map((p) => (
                <div
                  key={`${p.context_type}-${p.context_id}`}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{p.label}</span>
                    <span className="ml-2 text-xs uppercase text-muted-foreground">{p.context_type}</span>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatHours(p.totalMinutes)} · {p.sessions} sessão{p.sessions !== 1 ? "ões" : ""}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sessões registradas</CardTitle>
            <CardDescription>
              {sessions.length} sessão{sessions.length !== 1 ? "ões" : ""} encerrada{sessions.length !== 1 ? "s" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {sessions.map((s) => {
                const start = new Date(s.started_at);
                const end = new Date(s.ended_at!);
                const mins = Math.round((end.getTime() - start.getTime() - (s.pause_ms ?? 0)) / 60000);
                const dur = mins >= 60
                  ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}m`
                  : `${mins}min`;
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{s.activity_type}</span>
                      {s.context && (
                        <span className="ml-2 truncate text-xs text-primary/80">{s.context}</span>
                      )}
                      {s.notes && (
                        <span className="ml-2 truncate text-xs text-muted-foreground">{s.notes}</span>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {dur}
                    </div>
                    {s.energy_level != null && (
                      <div className="shrink-0 text-xs text-muted-foreground">
                        E:{s.energy_level} F:{s.focus_level}
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={async () => {
                        if (!(await confirmDialog({ title: "Excluir", description: "Excluir esta sessão de foco?", confirmLabel: "Excluir", destructive: true }))) return;
                        await deleteSession(s.id);
                        toast.success("Sessão removida");
                        void refresh();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-amber-400" />
                Highlights cumulativos
              </CardTitle>
              <CardDescription>Momentos marcantes da sua carreira.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {highlights.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Registre conquistas, shows marcantes, feedbacks especiais…
            </div>
          ) : (
            <div className="space-y-2">
              {highlights.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{h.title}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(h.date)}</span>
                    </div>
                    {h.body && <p className="mt-1 text-xs text-muted-foreground">{h.body}</p>}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!(await confirmDialog({ title: "Excluir", description: "Excluir este highlight?", confirmLabel: "Excluir", destructive: true }))) return;
                      await deleteHighlight(h.id);
                      toast.success("Highlight removido");
                      void refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddHighlightDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => { setAddOpen(false); void refresh(); }}
      />
    </div>
  );
}

function HeatmapCard({ heatmap }: { heatmap: HeatmapCell[] }) {
  const cellMap = new Map<string, HeatmapCell>();
  for (const c of heatmap) cellMap.set(`${c.day}-${c.hour}`, c);
  const max = Math.max(1, ...heatmap.map((c) => c.avg_energy));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Heatmap de energia</CardTitle>
        <CardDescription>Dia da semana × horário — intensidade = energia média.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[400px]">
          <div className="flex gap-1">
            <div className="w-8" />
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
                {h}h
              </div>
            ))}
          </div>
          {DAYS.map((d, di) => (
            <div key={d} className="flex gap-1 mt-1">
              <div className="w-8 text-[10px] text-muted-foreground flex items-center">{d}</div>
              {HOURS.map((h) => {
                const cell = cellMap.get(`${di}-${h}`);
                const intensity = cell ? cell.avg_energy / max : 0;
                return (
                  <div
                    key={h}
                    className={cn(
                      "flex-1 rounded-sm h-5 transition",
                      cell ? "cursor-default" : "bg-muted/30"
                    )}
                    style={cell ? { backgroundColor: `hsl(262 60% 60% / ${intensity})` } : {}}
                    title={cell ? `E:${cell.avg_energy.toFixed(1)} F:${cell.avg_focus.toFixed(1)} (${cell.count}×)` : "Sem dados"}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ stats, totalMinutes }: { stats: ActivityStats[]; totalMinutes: number }) {
  const COLORS = [
    "bg-primary",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-rose-500",
    "bg-violet-400",
    "bg-orange-400",
    "bg-teal-500",
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Distribuição de atividades</CardTitle>
        <CardDescription>
          {Math.round(totalMinutes / 60)}h totais em {stats.reduce((s, a) => s + a.sessions, 0)} sessões.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {stats.map((s, i) => (
            <div
              key={s.activity_type}
              className={cn("h-full", COLORS[i % COLORS.length])}
              style={{ width: `${(s.total_minutes / totalMinutes) * 100}%` }}
              title={`${s.activity_type}: ${Math.round(s.total_minutes / 60)}h`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {stats.map((s, i) => (
            <span key={s.activity_type} className="flex items-center gap-1">
              <span className={cn("inline-block h-2 w-2 rounded-full", COLORS[i % COLORS.length])} />
              {s.activity_type.split(" ")[0]}
            </span>
          ))}
        </div>
        <div className="space-y-1">
          {stats.slice(0, 3).map((s) => (
            <div key={s.activity_type} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.activity_type}</span>
              <span className="tabular-nums">
                ⚡{s.avg_energy} 🎯{s.avg_focus}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddHighlightDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    setSaving(true);
    try {
      await createHighlight({ title, date, body: body || null });
      toast.success("Highlight registrado!");
      setTitle(""); setBody(""); setDate(todayISO());
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Highlight</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título <span className="text-destructive">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Primeiro show no exterior" />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Detalhes (opcional)</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="O que tornou esse momento especial?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
