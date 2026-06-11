import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listSessions } from "@/modules/foco/api";
import type { WorkSession } from "@/modules/foco/api";
import {
  loadSwot,
  saveSwot,
  loadDismissedOpportunities,
  saveDismissedOpportunities,
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

type SwotExtra = {
  contacts: Contact[];
  sessions: WorkSession[];
};

/** Indicadores automáticos derivados dos dados do app. */
function autoIndicators(data: Data, extra: SwotExtra | null): SwotData {
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

  // Pagamentos pendentes só viram ameaça quando acumulam (≥3); 1-2 já têm
  // alerta próprio no app, então não poluem o SWOT.
  if (pendingPayment >= 3) out.threats.push(`${pendingPayment} GIGs com pagamento pendente acumuladas`);

  // ----- Indicadores que dependem de CRM e sessões de foco -----
  if (extra) {
    const now = Date.now();
    const DAY = 86_400_000;

    // Ameaça: concentração de contratações no mesmo CRM nos últimos 90 dias.
    const cutoff90 = new Date(now - 90 * DAY).toISOString().slice(0, 10);
    const recentGigs = gigs.filter((g) => g.promoter_contact_id != null && g.date >= cutoff90);
    if (recentGigs.length >= 3) {
      const counts = new Map<number, number>();
      for (const g of recentGigs) {
        const id = g.promoter_contact_id as number;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      let topId = -1;
      let topCount = 0;
      for (const [id, c] of counts) {
        if (c > topCount) { topCount = c; topId = id; }
      }
      if (topCount / recentGigs.length > 0.5) {
        const name = extra.contacts.find((c) => c.id === topId)?.name ?? "um único contato";
        const pct = Math.round((topCount / recentGigs.length) * 100);
        out.threats.push(`Dependência de "${name}" (${pct}% das contratações em 90 dias)`);
      }
    }

    // Foco: força se houve sessão todos os dias da última semana; fraqueza se nenhuma.
    const focusCutoff = now - 7 * DAY;
    const recentSessions = extra.sessions.filter((s) => Date.parse(s.started_at) >= focusCutoff);
    const focusDays = new Set(recentSessions.map((s) => s.started_at.slice(0, 10)));
    if (focusDays.size >= 7) {
      out.strengths.push("Consistência: sessão de foco todos os dias da última semana");
    } else if (recentSessions.length === 0) {
      out.weaknesses.push("Nenhuma sessão de foco iniciada na última semana");
    }

    // Oportunidade: contato recente com CRM de alta prioridade (última semana).
    const cutoff7 = new Date(now - 7 * DAY).toISOString().slice(0, 10);
    const hotContacts = extra.contacts.filter(
      (c) => (c.rating ?? 0) >= 4 && c.last_interaction_at && c.last_interaction_at.slice(0, 10) >= cutoff7
    );
    if (hotContacts.length > 0) {
      const names = hotContacts.slice(0, 2).map((c) => c.name).join(", ");
      out.opportunities.push(`Contato recente com CRM de alta prioridade: ${names}`);
    }
  }

  // Ameaça: cachê médio das últimas 10 GIGs < cachê médio geral.
  const gigsWithCache = gigs
    .filter((g) => g.status === "Concluída" && (g.cache_amount ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (gigsWithCache.length >= 3) {
    const last10 = gigsWithCache.slice(0, 10);
    const avgLast10 = last10.reduce((s, g) => s + (g.cache_amount ?? 0), 0) / last10.length;
    const avgAll = gigsWithCache.reduce((s, g) => s + (g.cache_amount ?? 0), 0) / gigsWithCache.length;
    if (avgLast10 < avgAll * 0.95) {
      out.threats.push(
        `Cachê abaixo da média histórica nas últimas ${last10.length} GIGs (média geral: R$ ${Math.round(avgAll).toLocaleString("pt-BR")})`
      );
    }
  }

  return out;
}

/**
 * Oportunidades futuras anotadas nos debriefs de GIGs concluídas.
 * Retornadas em separado porque o usuário pode dispensá-las como itens manuais.
 */
function debriefOpportunities(gigs: Gig[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of gigs) {
    if (g.status !== "Concluída") continue;
    const text = g.debrief_future_opportunities?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
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

  const [extra, setExtra] = useState<SwotExtra | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadSwot().then(setManual);
    void loadDismissedOpportunities().then((items) => setDismissed(new Set(items)));
    void Promise.all([listContacts(), listSessions(200)])
      .then(([contacts, sessions]) => setExtra({ contacts, sessions }))
      .catch(() => setExtra({ contacts: [], sessions: [] }));
  }, []);

  const auto = useMemo(() => autoIndicators(data, extra), [data, extra]);

  // Oportunidades vindas dos debriefs, ainda não dispensadas pelo usuário.
  const debriefOpps = useMemo(
    () => debriefOpportunities(data.gigs).filter((t) => !dismissed.has(t)),
    [data.gigs, dismissed]
  );

  async function dismissOpportunity(text: string) {
    const next = new Set(dismissed);
    next.add(text);
    setDismissed(next);
    await saveDismissedOpportunities([...next]);
  }

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
                  {key === "opportunities" && debriefOpps.map((item) => (
                    <li key={`deb-${item}`} className="group flex items-start justify-between gap-1.5 text-xs">
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => void dismissOpportunity(item)}
                        className="shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                        aria-label="Remover"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
                  {auto[key].length === 0 &&
                    (manual?.[key].length ?? 0) === 0 &&
                    !(key === "opportunities" && debriefOpps.length > 0) && (
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
  highlight: string;
}[] = [
  { key: "do", title: "Fazer agora", subtitle: "Urgente + Importante", border: "border-destructive/40 bg-destructive/5", badge: "bg-destructive/15 text-destructive", highlight: "border-destructive border-2" },
  { key: "schedule", title: "Agendar", subtitle: "Importante, não urgente", border: "border-emerald-500/40 bg-emerald-500/5", badge: "bg-emerald-500/15 text-emerald-600", highlight: "border-emerald-500 border-2" },
  { key: "delegate", title: "Delegar", subtitle: "Urgente, não importante", border: "border-amber-500/40 bg-amber-500/5", badge: "bg-amber-500/15 text-amber-600", highlight: "border-amber-500 border-2" },
  { key: "eliminate", title: "Eliminar", subtitle: "Nem urgente nem importante", border: "border-muted-foreground/30 bg-muted/30", badge: "bg-muted text-muted-foreground", highlight: "border-primary border-2" },
];

const EisenhowerTaskChip = React.memo(function EisenhowerTaskChip({
  task,
  isDragging,
  onPointerDown,
}: {
  task: Task;
  isDragging: boolean;
  onPointerDown: (task: Task, e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onPointerDown={(e) => onPointerDown(task, e)}
      className={cn(
        "cursor-grab select-none rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm transition hover:border-primary touch-none",
        isDragging && "opacity-30 pointer-events-none"
      )}
    >
      <div className="font-medium leading-tight">{task.title}</div>
      {task.due_date && (
        <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{task.due_date}</div>
      )}
    </div>
  );
});

function EisenhowerSection({ tasks, onChanged }: { tasks: Task[]; onChanged: () => void }) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const dragRef = useRef<{ taskId: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const zoneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Enquanto há um arraste em curso, bloqueia o scroll por toque na página:
  // um listener touchmove não-passivo chamando preventDefault evita que o
  // navegador role (e "pule" para o topo) durante o gesto.
  useEffect(() => {
    if (draggingId == null) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, [draggingId]);

  useEffect(() => {
    document.body.style.overflow = draggingId != null ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [draggingId]);

  const open = tasks.filter((t) => t.status === "A fazer" || t.status === "Em andamento");
  const ungrouped = open.filter((t) => !t.eisenhower_quadrant);
  const byQuadrant = useCallback(
    (q: EisenhowerQuadrant) => open.filter((t) => t.eisenhower_quadrant === q),
    [open]
  );

  async function move(taskId: number, quadrant: EisenhowerQuadrant | null) {
    await updateTask({ id: taskId, eisenhower_quadrant: quadrant });
    onChanged();
  }

  function zoneAtPoint(x: number, y: number): string | null {
    for (const [key, el] of zoneRefs.current.entries()) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  }

  const onChipPointerDown = useCallback((task: Task, e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();
    // Captura no container estável (e não no chip, que vira pointer-events-none
    // ao arrastar — o que perderia a captura e podia disparar scroll/foco).
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* setPointerCapture pode falhar se o ponteiro já foi liberado */
    }
    dragRef.current = { taskId: task.id };
    setDraggingId(task.id);
    if (ghostRef.current) {
      ghostRef.current.textContent = task.title;
      ghostRef.current.style.left = `${e.clientX + 12}px`;
      ghostRef.current.style.top = `${e.clientY + 8}px`;
      ghostRef.current.style.display = "block";
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    if (ghostRef.current) {
      ghostRef.current.style.left = `${e.clientX + 12}px`;
      ghostRef.current.style.top = `${e.clientY + 8}px`;
    }
    const key = zoneAtPoint(e.clientX, e.clientY);
    setHoverKey(key);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { taskId } = dragRef.current;
    dragRef.current = null;
    if (ghostRef.current) ghostRef.current.style.display = "none";
    const key = zoneAtPoint(e.clientX, e.clientY);
    setDraggingId(null);
    setHoverKey(null);
    if (key !== null) {
      const quadrant = key === "ungrouped" ? null : (key as EisenhowerQuadrant);
      void move(taskId, quadrant);
    }
  }, []);

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setHoverKey(null);
    if (ghostRef.current) ghostRef.current.style.display = "none";
  }, []);

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
      <CardContent
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="space-y-3 touch-none"
        style={{ overscrollBehavior: "none", overflow: draggingId != null ? "hidden" : undefined }}
      >
        {/* Não agrupadas */}
        <div
          ref={(el) => { if (el) zoneRefs.current.set("ungrouped", el); else zoneRefs.current.delete("ungrouped"); }}
          className={cn(
            "rounded-lg border border-dashed p-3 transition",
            hoverKey === "ungrouped" && "border-primary border-2 bg-primary/5"
          )}
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
                <EisenhowerTaskChip
                  key={t.id}
                  task={t}
                  isDragging={draggingId === t.id}
                  onPointerDown={onChipPointerDown}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quadrantes */}
        <div className="grid gap-3 sm:grid-cols-2">
          {EISENHOWER_META.map((q) => {
            const items = byQuadrant(q.key);
            const isHovered = hoverKey === q.key;
            return (
              <div
                key={q.key}
                ref={(el) => { if (el) zoneRefs.current.set(q.key, el); else zoneRefs.current.delete(q.key); }}
                className={cn(
                  "min-h-28 rounded-lg border p-3 transition",
                  isHovered ? q.highlight : q.border
                )}
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
                    <EisenhowerTaskChip
                      key={t.id}
                      task={t}
                      isDragging={draggingId === t.id}
                      onPointerDown={onChipPointerDown}
                    />
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

      {/* Ghost element — positioned fixed, updated via direct DOM mutation */}
      <div
        ref={ghostRef}
        style={{ display: "none", position: "fixed", pointerEvents: "none", zIndex: 9999 }}
        className="rounded-md border border-primary bg-background px-2 py-1.5 text-xs shadow-lg font-medium"
      />
    </Card>
  );
}

// ============================================================
// Pareto de Receita (regra 80/20)
// ============================================================

function ParetoSection({ gigs }: { gigs: Gig[] }) {
  const [showAll, setShowAll] = useState(false);
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
              {(showAll ? earning : vital).map((e, i) => {
                const pct = total > 0 ? (e.value / total) * 100 : 0;
                const isVital = i < vital.length;
                return (
                  <div key={e.gig.id} className="flex items-center gap-2">
                    <Link
                      to={`/gigs?open=${e.gig.id}`}
                      className="w-40 shrink-0 truncate text-xs hover:underline"
                      title={gigDisplayName(e.gig)}
                    >
                      {gigDisplayName(e.gig)}
                    </Link>
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
            {!showAll && earning.length > vital.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-1 text-xs text-primary hover:underline"
              >
                Ver todas as {earning.length} GIGs →
              </button>
            )}
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

type NpsCategory = "promoters" | "neutrals" | "detractors" | "all";

function npsCategoryOf(g: Gig): Exclude<NpsCategory, "all"> {
  const r = g.rating_contractor ?? 0;
  if (r >= 4) return "promoters";
  if (r <= 2.5) return "detractors";
  return "neutrals";
}

const NPS_CATEGORY_LABEL: Record<NpsCategory, string> = {
  promoters: "Promotores (≥4)",
  neutrals: "Neutros (3)",
  detractors: "Detratores (≤2,5)",
  all: "Todas as avaliações",
};

function NpsSection({ gigs }: { gigs: Gig[] }) {
  // rating_contractor é uma nota 0..5. Mapeamento para NPS:
  //   >= 4   → promotor
  //   == 3   → neutro
  //   <= 2.5 → detrator
  const [drill, setDrill] = useState<NpsCategory | null>(null);

  const rated = gigs.filter((g) => typeof g.rating_contractor === "number");
  const promoters = rated.filter((g) => (g.rating_contractor ?? 0) >= 4).length;
  const detractors = rated.filter((g) => (g.rating_contractor ?? 0) <= 2.5).length;
  const neutrals = rated.length - promoters - detractors;

  const nps = rated.length > 0
    ? Math.round((promoters / rated.length) * 100 - (detractors / rated.length) * 100)
    : null;

  const tone = nps == null ? "text-muted-foreground" : nps >= 50 ? "text-emerald-500" : nps >= 0 ? "text-amber-500" : "text-destructive";
  const verdict = nps == null ? "" : nps >= 50 ? "Excelente" : nps >= 0 ? "Razoável" : "Precisa de atenção";

  const drillGigs = drill == null
    ? []
    : (drill === "all" ? rated : rated.filter((g) => npsCategoryOf(g) === drill))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
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
              <button
                type="button"
                onClick={() => setDrill("all")}
                className="rounded-md px-1 text-left transition-colors hover:bg-muted/50"
                title="Ver todas as GIGs avaliadas"
              >
                <div className={cn("text-4xl font-bold tabular-nums", tone)}>{nps}</div>
                <div className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {verdict} · {rated.length} avaliações
                </div>
              </button>
              <div className="flex-1 space-y-1.5 min-w-48">
                <NpsBar label={NPS_CATEGORY_LABEL.promoters} count={promoters} total={rated.length} tone="bg-emerald-500" onClick={() => promoters > 0 && setDrill("promoters")} />
                <NpsBar label={NPS_CATEGORY_LABEL.neutrals} count={neutrals} total={rated.length} tone="bg-amber-400" onClick={() => neutrals > 0 && setDrill("neutrals")} />
                <NpsBar label={NPS_CATEGORY_LABEL.detractors} count={detractors} total={rated.length} tone="bg-destructive" onClick={() => detractors > 0 && setDrill("detractors")} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={drill != null} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{drill ? NPS_CATEGORY_LABEL[drill] : ""}</DialogTitle>
            <DialogDescription>
              {drillGigs.length} GIG{drillGigs.length === 1 ? "" : "s"} com avaliação do contratante.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {drillGigs.map((g) => (
              <Link
                key={g.id}
                to={`/gigs?debrief=${g.id}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{gigDisplayName(g)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(g.date)}
                    {g.venue_city ? ` · ${g.venue_city}` : ""}
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-semibold">
                  {g.rating_contractor?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} / 5
                </span>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NpsBar({ label, count, total, tone, onClick }: { label: string; count: number; total: number; tone: string; onClick?: () => void }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const clickable = onClick && count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1 text-left transition-colors",
        clickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
      )}
      title={clickable ? `Ver GIGs · ${label}` : undefined}
    >
      <span className="w-32 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{count} ({pct}%)</span>
    </button>
  );
}
