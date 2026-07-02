import { useEffect, useMemo, useState } from "react";
import { Grid2x2, Plus, RefreshCw, X } from "lucide-react";
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
import { toLocalISODate } from "@/lib/format";
import { listOkrs, okrProgress, type Okr } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { parseDebriefItems } from "@/modules/gigs/debriefItems";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listSessions, type WorkSession } from "@/modules/foco/api";
import {
  loadSwot,
  saveSwot,
  loadDismissedOpportunities,
  saveDismissedOpportunities,
  type SwotData,
  type SwotKey,
} from "@/modules/dashboard/methodologies";

// ============================================================
// SWOT — indicadores automáticos + itens manuais
//
// Movido da antiga aba "Metodologias" do Dashboard para o módulo de Gestão
// Estratégica. Continua consumindo methodologies.ts (loadSwot/saveSwot etc.).
// ============================================================

/** Dados que alimentam os indicadores automáticos do SWOT. */
type SwotBaseData = {
  okrs: Okr[];
  tasks: Task[];
  gigs: Gig[];
};

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
function autoIndicators(data: SwotBaseData, extra: SwotExtra | null): SwotData {
  const { tasks, gigs, okrs } = data;
  const today = toLocalISODate();

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
    const cutoff90 = toLocalISODate(new Date(now - 90 * DAY)); // data LOCAL (não UTC)
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
    const cutoff7 = toLocalISODate(new Date(now - 7 * DAY)); // data LOCAL (não UTC)
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
    for (const item of parseDebriefItems(g.debrief_future_opportunities)) {
      const text = item.text.trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

export function SwotSection() {
  const [data, setData] = useState<SwotBaseData | null>(null);
  const [manual, setManual] = useState<SwotData | null>(null);
  const [draft, setDraft] = useState<Record<SwotKey, string>>({
    strengths: "",
    weaknesses: "",
    opportunities: "",
    threats: "",
  });

  const [extra, setExtra] = useState<SwotExtra | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Carrega os dados-base (OKRs, tarefas, GIGs) e recarrega silenciosamente
  // quando algo muda no app (ex.: classificar tarefa, concluir GIG).
  useEffect(() => {
    const reload = () => {
      void Promise.all([listOkrs(), listTasks(), listGigs()])
        .then(([okrs, tasks, gigs]) => setData({ okrs, tasks, gigs }))
        .catch((e) => console.error("Falha ao carregar SWOT", e));
    };
    reload();
    window.addEventListener(DATA_CHANGED, reload);
    return () => window.removeEventListener(DATA_CHANGED, reload);
  }, []);

  useEffect(() => {
    void loadSwot().then(setManual);
    void loadDismissedOpportunities().then((items) => setDismissed(new Set(items)));
    void Promise.all([listContacts(), listSessions(200)])
      .then(([contacts, sessions]) => setExtra({ contacts, sessions }))
      .catch(() => setExtra({ contacts: [], sessions: [] }));
  }, []);

  const auto = useMemo(
    () => (data ? autoIndicators(data, extra) : { strengths: [], weaknesses: [], opportunities: [], threats: [] }),
    [data, extra]
  );

  // Oportunidades vindas dos debriefs, ainda não dispensadas pelo usuário.
  const debriefOpps = useMemo(
    () => (data ? debriefOpportunities(data.gigs).filter((t) => !dismissed.has(t)) : []),
    [data, dismissed]
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

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
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
