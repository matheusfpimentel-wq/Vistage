import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw,
  Target,
  Grid2x2,
  TrendingUp,
  Smile,
  Plus,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { formatCurrency } from "@/lib/format";
import {
  listOkrs,
  currentQuarter,
  okrProgress,
  type Okr,
} from "@/modules/objetivos/api";
import { listTasks, updateTask } from "@/modules/tasks/api";
import {
  type Task,
  type EisenhowerQuadrant,
} from "@/modules/tasks/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import {
  loadSwot,
  saveSwot,
  type SwotData,
  type SwotKey,
} from "./methodologies";

// ============================================================
// Carregamento
// ============================================================

type Data = {
  okrs: Okr[];
  tasks: Task[];
  gigs: Gig[];
};

async function loadData(): Promise<Data> {
  const [okrs, tasks, gigs] = await Promise.all([
    listOkrs(),
    listTasks(),
    listGigs(),
  ]);
  return { okrs, tasks, gigs };
}

/** "2026-Q2" → número comparável (ano*4 + trimestre). */
function quarterRank(q: string): number {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return 0;
  return parseInt(m[1]) * 4 + parseInt(m[2]);
}

export function MetodologiasPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void loadData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Metodologias de Gestão</h2>
          <p className="text-sm text-muted-foreground">
            Frameworks aplicados aos seus dados: OKRs, SWOT, Eisenhower, Pareto e NPS.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} aria-label="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <OkrsSection okrs={data.okrs} />
      <SwotSection data={data} />
      <EisenhowerSection tasks={data.tasks} onChanged={load} />
      <ParetoSection gigs={data.gigs} />
      <NpsSection gigs={data.gigs} />
    </div>
  );
}

// ============================================================
// OKRs — presentes e futuros
// ============================================================

function OkrsSection({ okrs }: { okrs: Okr[] }) {
  const currentRank = quarterRank(currentQuarter());
  const relevant = okrs
    .filter((o) => quarterRank(o.quarter) >= currentRank)
    .sort((a, b) => quarterRank(a.quarter) - quarterRank(b.quarter));

  const byQuarter = useMemo(() => {
    const map = new Map<string, Okr[]>();
    for (const o of relevant) {
      const arr = map.get(o.quarter) ?? [];
      arr.push(o);
      map.set(o.quarter, arr);
    }
    return [...map.entries()];
  }, [relevant]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          OKRs — atuais e futuros
        </CardTitle>
        <CardDescription>
          {relevant.length === 0
            ? "Nenhum OKR para este trimestre ou os próximos."
            : `${relevant.length} objetivo(s) em ${byQuarter.length} trimestre(s)`}
        </CardDescription>
      </CardHeader>
      {byQuarter.length > 0 && (
        <CardContent className="space-y-5">
          {byQuarter.map(([quarter, qOkrs]) => (
            <div key={quarter} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {quarter}
                </span>
                {quarter === currentQuarter() && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    atual
                  </span>
                )}
              </div>
              {qOkrs.map((o) => {
                const pct = Math.round(okrProgress(o) * 100);
                return (
                  <div key={o.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{o.objective}</span>
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums font-semibold",
                          pct >= 70 ? "text-emerald-500" : pct >= 40 ? "text-amber-500" : "text-destructive"
                        )}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-destructive/60"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {o.key_results.length > 0 && (
                      <ul className="ml-3 space-y-0.5">
                        {o.key_results.map((kr, i) => {
                          const krPct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
                          return (
                            <li key={i} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{kr.description}</span>
                              <span className="shrink-0 tabular-nums">
                                {kr.current}/{kr.target} ({krPct}%)
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <Link to="/objetivos" className="block text-xs text-primary hover:underline">
            Gerenciar OKRs →
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

// ============================================================
// SWOT — indicadores automáticos + itens manuais
// ============================================================

const SWOT_META: Record<SwotKey, { label: string; tone: string; border: string }> = {
  strengths: { label: "Forças", tone: "text-emerald-600", border: "border-emerald-500/30 bg-emerald-500/5" },
  weaknesses: { label: "Fraquezas", tone: "text-destructive", border: "border-destructive/30 bg-destructive/5" },
  opportunities: { label: "Oportunidades", tone: "text-sky-600", border: "border-sky-500/30 bg-sky-500/5" },
  threats: { label: "Ameaças", tone: "text-amber-600", border: "border-amber-500/30 bg-amber-500/5" },
};

/** Indicadores automáticos derivados dos dados do app. */
function autoIndicators(data: Data): SwotData {
  const { tasks, gigs, okrs } = data;
  const today = new Date().toISOString().slice(0, 10);

  const concluded = gigs.filter((g) => g.status === "Concluída").length;
  const proposals = gigs.filter((g) => g.status === "Proposta").length;
  const overdue = tasks.filter((t) => t.status !== "Concluída" && t.due_date && t.due_date < today).length;
  const cancelled = gigs.filter((g) => g.status === "Cancelada").length;
  const okrsOnTrack = okrs.filter((o) => okrProgress(o) >= 0.7).length;
  const pendingPayment = gigs.filter((g) => g.payment_status && g.payment_status !== "Pago integralmente" && g.status !== "Cancelada").length;

  const out: SwotData = { strengths: [], weaknesses: [], opportunities: [], threats: [] };

  if (concluded > 0) out.strengths.push(`${concluded} GIG(s) concluída(s) com sucesso`);
  if (okrsOnTrack > 0) out.strengths.push(`${okrsOnTrack} OKR(s) acima de 70%`);

  if (overdue > 0) out.weaknesses.push(`${overdue} tarefa(s) atrasada(s)`);
  if (cancelled > 0) out.weaknesses.push(`${cancelled} GIG(s) cancelada(s)`);

  if (proposals > 0) out.opportunities.push(`${proposals} proposta(s) de GIG em aberto`);

  if (pendingPayment > 0) out.threats.push(`${pendingPayment} GIG(s) com pagamento pendente`);

  return out;
}

function SwotSection({ data }: { data: Data }) {
  const [manual, setManual] = useState<SwotData | null>(null);
  const [draft, setDraft] = useState<Record<SwotKey, string>>({
    strengths: "",
    weaknesses: "",
    opportunities: "",
    threats: "",
  });

  useEffect(() => {
    void loadSwot().then(setManual);
  }, []);

  const auto = useMemo(() => autoIndicators(data), [data]);

  async function addItem(key: SwotKey) {
    const text = draft[key].trim();
    if (!text || !manual) return;
    const next = { ...manual, [key]: [...manual[key], text] };
    setManual(next);
    setDraft((d) => ({ ...d, [key]: "" }));
    await saveSwot(next);
  }

  async function removeItem(key: SwotKey, idx: number) {
    if (!manual) return;
    const next = { ...manual, [key]: manual[key].filter((_, i) => i !== idx) };
    setManual(next);
    await saveSwot(next);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Grid2x2 className="h-4 w-4 text-primary" />
          Matriz SWOT
        </CardTitle>
        <CardDescription>
          Indicadores automáticos (derivados dos seus dados) + os seus próprios pontos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(SWOT_META) as SwotKey[]).map((key) => {
            const meta = SWOT_META[key];
            return (
              <div key={key} className={cn("rounded-lg border p-3", meta.border)}>
                <div className={cn("mb-2 text-sm font-semibold", meta.tone)}>{meta.label}</div>
                <ul className="space-y-1.5">
                  {auto[key].map((item, i) => (
                    <li key={`auto-${i}`} className="flex items-start gap-1.5 text-xs">
                      <span className="mt-0.5 shrink-0 rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
                        auto
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                  {manual?.[key].map((item, i) => (
                    <li key={`man-${i}`} className="group flex items-start justify-between gap-1.5 text-xs">
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => void removeItem(key, i)}
                        className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                        aria-label="Remover"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                  {auto[key].length === 0 && (manual?.[key].length ?? 0) === 0 && (
                    <li className="text-xs text-muted-foreground/60">Sem itens ainda.</li>
                  )}
                </ul>
                <div className="mt-2 flex gap-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Adicionar…"
                    value={draft[key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void addItem(key);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => void addItem(key)} aria-label="Adicionar">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Eisenhower — arraste tarefas para os quadrantes
// ============================================================

const EISENHOWER_META: {
  key: EisenhowerQuadrant;
  title: string;
  subtitle: string;
  border: string;
  badge: string;
}[] = [
  { key: "do", title: "Fazer agora", subtitle: "Urgente + Importante", border: "border-destructive/40 bg-destructive/5", badge: "bg-destructive/15 text-destructive" },
  { key: "schedule", title: "Agendar", subtitle: "Importante, não urgente", border: "border-emerald-500/40 bg-emerald-500/5", badge: "bg-emerald-500/15 text-emerald-600" },
  { key: "delegate", title: "Delegar", subtitle: "Urgente, não importante", border: "border-amber-500/40 bg-amber-500/5", badge: "bg-amber-500/15 text-amber-600" },
  { key: "eliminate", title: "Eliminar", subtitle: "Nem urgente nem importante", border: "border-muted-foreground/30 bg-muted/30", badge: "bg-muted text-muted-foreground" },
];

function EisenhowerSection({ tasks, onChanged }: { tasks: Task[]; onChanged: () => void }) {
  const [dragId, setDragId] = useState<number | null>(null);

  // Só tarefas em aberto (A fazer / Em andamento) entram na matriz.
  const open = tasks.filter((t) => t.status === "A fazer" || t.status === "Em andamento");
  const ungrouped = open.filter((t) => !t.eisenhower_quadrant);
  const byQuadrant = (q: EisenhowerQuadrant) => open.filter((t) => t.eisenhower_quadrant === q);

  async function move(taskId: number, quadrant: EisenhowerQuadrant | null) {
    await updateTask({ id: taskId, eisenhower_quadrant: quadrant });
    onChanged();
  }

  function onDrop(quadrant: EisenhowerQuadrant | null) {
    if (dragId != null) void move(dragId, quadrant);
    setDragId(null);
  }

  function TaskChip({ task }: { task: Task }) {
    return (
      <div
        draggable
        onDragStart={() => setDragId(task.id)}
        onDragEnd={() => setDragId(null)}
        className="cursor-grab rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm transition hover:border-primary active:cursor-grabbing"
      >
        <div className="font-medium leading-tight">{task.title}</div>
        {task.due_date && (
          <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{task.due_date}</div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Grid2x2 className="h-4 w-4 text-primary" />
          Matriz de Eisenhower
        </CardTitle>
        <CardDescription>
          Arraste cada tarefa para um quadrante. As que você ainda não classificou ficam em "Não agrupadas".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Não agrupadas */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDrop(null)}
          className="rounded-lg border border-dashed p-3"
        >
          <div className="mb-2 text-xs font-semibold text-muted-foreground">
            Não agrupadas ({ungrouped.length})
          </div>
          {ungrouped.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">
              Tudo classificado. Arraste de volta aqui para remover de um quadrante.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ungrouped.map((t) => (
                <TaskChip key={t.id} task={t} />
              ))}
            </div>
          )}
        </div>

        {/* Quadrantes */}
        <div className="grid gap-3 sm:grid-cols-2">
          {EISENHOWER_META.map((q) => {
            const items = byQuadrant(q.key);
            return (
              <div
                key={q.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(q.key)}
                className={cn("min-h-28 rounded-lg border p-3 transition", q.border)}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{q.title}</div>
                    <div className="text-[10px] text-muted-foreground">{q.subtitle}</div>
                  </div>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums", q.badge)}>
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((t) => (
                    <TaskChip key={t.id} task={t} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <Link to="/tarefas" className="block text-xs text-primary hover:underline">
          Gerenciar tarefas →
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Pareto de Receita (regra 80/20)
// ============================================================

function ParetoSection({ gigs }: { gigs: Gig[] }) {
  const earning = gigs
    .filter((g) => (g.cache_amount ?? 0) > 0 && g.status !== "Cancelada")
    .map((g) => ({ gig: g, value: g.cache_amount ?? 0 }))
    .sort((a, b) => b.value - a.value);

  const total = earning.reduce((s, e) => s + e.value, 0);

  // GIGs que acumulam os primeiros 80% da receita (os "poucos vitais").
  let cum = 0;
  const vital: typeof earning = [];
  for (const e of earning) {
    if (cum >= total * 0.8) break;
    vital.push(e);
    cum += e.value;
  }
  const vitalShareOfCount = earning.length > 0 ? Math.round((vital.length / earning.length) * 100) : 0;
  const vitalShareOfRevenue = total > 0 ? Math.round((cum / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Pareto de Receita (80/20)
        </CardTitle>
        <CardDescription>
          De onde vem a maior parte do seu faturamento de GIGs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {earning.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem GIGs com cachê registrado ainda.
          </p>
        ) : (
          <>
            <div className="mb-3 rounded-md border bg-muted/30 p-3 text-sm">
              <span className="font-semibold">{vitalShareOfCount}%</span> das GIGs
              {" "}({vital.length} de {earning.length}) geraram{" "}
              <span className="font-semibold text-emerald-600">{vitalShareOfRevenue}%</span> da receita
              {" "}({formatCurrency(cum)} de {formatCurrency(total)}).
            </div>
            <div className="space-y-1.5">
              {earning.map((e, i) => {
                const pct = total > 0 ? (e.value / total) * 100 : 0;
                const isVital = i < vital.length;
                return (
                  <div key={e.gig.id} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-xs" title={gigDisplayName(e.gig)}>
                      {gigDisplayName(e.gig)}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                      <div
                        className={cn("h-full rounded-full", isVital ? "bg-emerald-500" : "bg-muted-foreground/40")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                      {formatCurrency(e.value)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Em verde, os poucos vitais que somam ~80% da receita. Foque em conseguir mais GIGs como essas.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// NPS — feedback do contratante/produtor
// ============================================================

function NpsSection({ gigs }: { gigs: Gig[] }) {
  // rating_contractor é uma nota 0..5. Mapeamento para NPS:
  //   >= 4   → promotor
  //   == 3   → neutro
  //   <= 2.5 → detrator
  const rated = gigs.filter((g) => typeof g.rating_contractor === "number");
  const promoters = rated.filter((g) => (g.rating_contractor ?? 0) >= 4).length;
  const detractors = rated.filter((g) => (g.rating_contractor ?? 0) <= 2.5).length;
  const neutrals = rated.length - promoters - detractors;

  const nps = rated.length > 0
    ? Math.round((promoters / rated.length) * 100 - (detractors / rated.length) * 100)
    : null;

  const tone = nps == null ? "text-muted-foreground" : nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-500" : "text-destructive";
  const verdict = nps == null ? "" : nps >= 50 ? "Excelente" : nps >= 0 ? "Razoável" : "Precisa de atenção";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smile className="h-4 w-4 text-primary" />
          NPS dos contratantes
        </CardTitle>
        <CardDescription>
          Calculado a partir da "Avaliação do Contratante" registrada no debrief das GIGs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rated.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma GIG com avaliação de contratante ainda. Preencha no debrief.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className={cn("text-4xl font-bold tabular-nums", tone)}>{nps}</div>
              <div className="text-xs text-muted-foreground">{verdict} · {rated.length} avaliações</div>
            </div>
            <div className="flex-1 space-y-1.5 min-w-48">
              <NpsBar label="Promotores (≥4)" count={promoters} total={rated.length} tone="bg-emerald-500" />
              <NpsBar label="Neutros (3)" count={neutrals} total={rated.length} tone="bg-amber-400" />
              <NpsBar label="Detratores (≤2,5)" count={detractors} total={rated.length} tone="bg-destructive" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NpsBar({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{count} ({pct}%)</span>
    </div>
  );
}
