import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Flame, Plus, Smartphone, Star, Trash2 } from "lucide-react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { WeekTrack } from "./WeekTrack";
import {
  loadHeatmap,
  loadActivityStats,
  loadTimePerProject,
  loadFocusStreak,
  loadPeakFocusHour,
  listSessions,
  deleteSession,
  listHighlights,
  createHighlight,
  deleteHighlight,
  loadSessionMarkerCounts,
  loadSessionMarkers,
  updateWeakPointDescription,
  deleteWeakPoint,
  updateMomentDescription,
  deleteMoment,
  WEAK_TIPO_LABEL,
  type HeatmapCell,
  type ActivityStats,
  type TimePerProject,
  type WorkSession,
  type Highlight,
  type PeakFocusHour,
  type SessionMarkers,
} from "./api";

function formatHours(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/** Tempo decorrido (ms desde o início da sessão) → "m:ss". */
function formatAtMs(ms: number | null): string {
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6h–23h

export function FocoPage() {
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [activityStats, setActivityStats] = useState<ActivityStats[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [timePerProject, setTimePerProject] = useState<TimePerProject[]>([]);
  const [streak, setStreak] = useState(0);
  const [peakHour, setPeakHour] = useState<PeakFocusHour>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState("foco");
  const [markerCounts, setMarkerCounts] = useState<Map<string, { weak: number; moments: number }>>(new Map());

  async function refresh() {
    const [h, a, sess, hl, tpp, stk, peak, mc] = await Promise.all([
      loadHeatmap(),
      loadActivityStats(),
      listSessions(100),
      listHighlights(),
      loadTimePerProject(),
      loadFocusStreak(),
      loadPeakFocusHour(),
      loadSessionMarkerCounts(),
    ]);
    setHeatmap(h);
    setActivityStats(a);
    setSessions(sess);
    setHighlights(hl);
    setTimePerProject(tpp);
    setStreak(stk);
    setPeakHour(peak);
    setMarkerCounts(mc);
  }

  useEffect(() => { void refresh(); }, []);

  const totalMinutes = activityStats.reduce((s, a) => s + a.total_minutes, 0);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="foco">Modo Foco</TabsTrigger>
        <TabsTrigger value="trilha">Trilha da Semana</TabsTrigger>
        <TabsTrigger value="highlights">Highlights</TabsTrigger>
      </TabsList>

      <TabsContent value="trilha">
        <WeekTrack />
      </TabsContent>

      <TabsContent value="foco" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                <Flame className="h-5 w-5" />
              </span>
              <div>
                <div className="text-2xl font-semibold leading-none">{streak}</div>
                <div className="text-xs text-muted-foreground">
                  dia{streak === 1 ? "" : "s"} seguidos de foco
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                {peakHour ? (
                  <>
                    <div className="text-2xl font-semibold leading-none">{peakHour.hour}h</div>
                    <div className="text-xs text-muted-foreground">
                      seu horário de maior foco
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium">Horário de pico</div>
                    <div className="text-xs text-muted-foreground">
                      registre sessões pra descobrir quando você foca melhor
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      {activityStats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-12 text-center">
          <Button size="sm" variant="outline" onClick={() => setTab("trilha")}>
            <Plus className="h-4 w-4" /> Planejar na Trilha
          </Button>
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
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  markerCount={s.focus_session_id ? markerCounts.get(s.focus_session_id) : undefined}
                  onRefresh={refresh}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="highlights">
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
                      try {
                        await deleteHighlight(h.id);
                        toast.success("Highlight removido");
                        void refresh();
                      } catch (e) {
                        toast.error(`Não consegui excluir o highlight: ${String(e)}`);
                      }
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
      </TabsContent>

      <AddHighlightDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => { setAddOpen(false); void refresh(); }}
      />
    </Tabs>
  );
}

// Uma linha da lista "Sessões registradas". Sessões vindas do Modo Foco do
// celular (com focus_session_id e marcadores) ganham um painel expansível com os
// pontos fracos e momentos capturados ao vivo — cada um com descrição editável.
function SessionRow({
  session: s,
  markerCount,
  onRefresh,
}: {
  session: WorkSession;
  markerCount?: { weak: number; moments: number };
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [markers, setMarkers] = useState<SessionMarkers | null>(null);
  const [loading, setLoading] = useState(false);

  const hasMarkers = !!markerCount && markerCount.weak + markerCount.moments > 0;

  const start = new Date(s.started_at);
  const end = new Date(s.ended_at!);
  const mins = Math.round((end.getTime() - start.getTime() - (s.pause_ms ?? 0)) / 60000);
  const dur = mins >= 60
    ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}m`
    : `${mins}min`;

  async function loadMarkers() {
    if (!s.focus_session_id) return;
    setLoading(true);
    try {
      setMarkers(await loadSessionMarkers(s.focus_session_id));
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !markers) void loadMarkers();
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center gap-3 px-3 py-2 text-sm">
        {hasMarkers ? (
          <button
            type="button"
            onClick={toggle}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Recolher marcadores" : "Ver marcadores ao vivo"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="font-medium">{s.activity_type}</span>
          {s.context && <span className="ml-2 truncate text-xs text-primary/80">{s.context}</span>}
          {s.notes && <span className="ml-2 truncate text-xs text-muted-foreground">{s.notes}</span>}
          {hasMarkers && (
            <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] text-muted-foreground">
              <Smartphone className="h-3 w-3" />
              {markerCount!.weak > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />{markerCount!.weak}
                </span>
              )}
              {markerCount!.moments > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Star className="h-3 w-3 text-amber-400" />{markerCount!.moments}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} · {dur}
        </div>
        {s.energy_level != null && (
          <div className="shrink-0 text-xs text-muted-foreground">E:{s.energy_level} F:{s.focus_level}</div>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={async () => {
            if (!(await confirmDialog({ title: "Excluir", description: "Excluir esta sessão de foco?", confirmLabel: "Excluir", destructive: true }))) return;
            try {
              await deleteSession(s.id);
              toast.success("Sessão removida");
              onRefresh();
            } catch (e) {
              toast.error(`Não consegui excluir a sessão: ${String(e)}`);
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {expanded && hasMarkers && (
        <div className="border-t bg-muted/30 px-3 py-3">
          {loading || !markers ? (
            <div className="text-xs text-muted-foreground">Carregando marcadores…</div>
          ) : (
            <SessionMarkerPanel
              markers={markers}
              onChanged={async () => { await loadMarkers(); onRefresh(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SessionMarkerPanel({
  markers,
  onChanged,
}: {
  markers: SessionMarkers;
  onChanged: () => Promise<void>;
}) {
  const { weakPoints, moments, weakByTipo } = markers;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Capturado ao vivo no celular durante a apresentação. Descreva cada marca pra lembrar depois — a ideia é capturar no palco e detalhar aqui.
      </p>

      {weakPoints.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" /> Pontos fracos
            </span>
            {weakByTipo.map((w) => (
              <span key={w.tipo} className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                {WEAK_TIPO_LABEL[w.tipo] ?? w.tipo} ×{w.count}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {weakPoints.map((w) => (
              <MarkerEditRow
                key={w.id}
                badge={formatAtMs(w.at_ms)}
                tag={WEAK_TIPO_LABEL[w.tipo ?? "outra"] ?? w.tipo ?? "Outra"}
                descricao={w.descricao}
                onSave={(text) => updateWeakPointDescription(w.id, text)}
                onDelete={async () => { await deleteWeakPoint(w.id); await onChanged(); }}
              />
            ))}
          </div>
        </div>
      )}

      {moments.length > 0 && (
        <div className="space-y-2">
          <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
            <Star className="h-3.5 w-3.5" /> Momentos marcantes
          </span>
          <div className="space-y-1.5">
            {moments.map((m) => (
              <MarkerEditRow
                key={m.id}
                badge={formatAtMs(m.at_ms)}
                descricao={m.descricao}
                onSave={(text) => updateMomentDescription(m.id, text)}
                onDelete={async () => { await deleteMoment(m.id); await onChanged(); }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Linha de marcador com descrição editável (salva ao perder o foco, só se mudou).
function MarkerEditRow({
  badge,
  tag,
  descricao,
  onSave,
  onDelete,
}: {
  badge: string;
  tag?: string;
  descricao: string | null;
  onSave: (text: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [value, setValue] = useState(descricao ?? "");
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = value.trim();
    const next = trimmed.length ? trimmed : null;
    if (next === (descricao ?? null)) return; // sem mudança → não grava
    setSaving(true);
    try {
      await onSave(next);
    } catch (e) {
      toast.error(`Não consegui salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 rounded border bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {badge}
      </span>
      {tag && <span className="shrink-0 text-[11px] text-muted-foreground">{tag}</span>}
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        placeholder="Descrever depois…"
        className="h-7 flex-1 text-xs"
      />
      {saving && <span className="shrink-0 text-[10px] text-muted-foreground">salvando…</span>}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => void onDelete()}
        aria-label="Excluir marcador"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
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
        <CardDescription>Dia da semana × horário: intensidade = energia média.</CardDescription>
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
                    style={cell ? { backgroundColor: `hsl(var(--primary) / ${intensity})` } : {}}
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
    } catch (e) {
      toast.error(`Não consegui salvar o highlight: ${String(e)}`);
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
