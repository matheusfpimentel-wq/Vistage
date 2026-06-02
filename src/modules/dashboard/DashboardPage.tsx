import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarClock,
  ChevronRight,
  Disc3,
  Film,
  Minus,
  Music,
  PartyPopper,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listUpcoming } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listContent } from "@/modules/content/api";
import type { Content } from "@/modules/content/types";
import { loadFinanceInsights, type FinanceInsights } from "@/modules/finance/api";
import { listTracks } from "@/modules/music/api";
import { listParties } from "@/modules/parties/api";
import type { PartyDeserialized } from "@/modules/parties/types";
import { listOkrs, currentQuarter, okrProgress, type Okr } from "@/modules/objetivos/api";
import type { TrackWithProject } from "@/modules/music/types";
import { trackDisplayName } from "@/modules/music/types";
import { StageBadge } from "@/modules/music/components/StageBadge";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

// ============================================================
// Helpers de data
// ============================================================

function daysUntil(iso: string): number {
  const today = new Date(todayISO());
  const target = new Date(iso.slice(0, 10));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function nextNDays(n: number): string[] {
  const out: string[] = [];
  const base = new Date(todayISO());
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const CONTENT_IN_PRODUCTION = ["Roteiro", "Gravando", "Edição", "Pronto"];

// ============================================================
// Página
// ============================================================

type DashData = {
  gigs: Gig[];
  fin: FinanceInsights;
  content: Content[];
  weekTasks: Task[];
  tracks: TrackWithProject[];
  parties: PartyDeserialized[];
  okrs: Okr[];
};

export function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    void (async () => {
      const [gigs, fin, content, weekTasks, tracks, parties, okrs] = await Promise.all([
        listGigs(),
        loadFinanceInsights(),
        listContent(),
        listUpcoming(50),
        listTracks(),
        listParties(),
        listOkrs(),
      ]);
      setData({ gigs, fin, content, weekTasks, tracks, parties, okrs });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>

      {data ? (
        <>
          <KpiRow data={data} />
          <OkrCard okrs={data.okrs} />
          <CreativePipelineCard data={data} />
          <WeekTimeline data={data} />
        </>
      ) : (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      )}

      <p className="pt-2 text-center text-xs text-muted-foreground/70">
        Métricas são bússolas, não termômetros. Otimizar para o número costuma
        deformar o resultado real.{" "}
        <span className="italic">(Lei de Goodhart)</span>
      </p>
    </div>
  );
}

// ============================================================
// Bloco 1 — KPIs estratégicos
// ============================================================

function KpiRow({ data }: { data: DashData }) {
  const { gigs, fin, content, weekTasks, tracks } = data;
  const month = todayISO().slice(0, 7);

  // receita do mês + tendência vs mês anterior
  const series = fin.monthly;
  const curRevenue = fin.monthIncome;
  const prevRevenue = series.length >= 2 ? series[series.length - 2].income : 0;
  const revenueTrend = curRevenue - prevRevenue;

  // GIGs do mês
  const monthGigs = gigs.filter((g) => g.date.slice(0, 7) === month);
  const concluidas = monthGigs.filter((g) => g.status === "Concluída").length;
  const confirmadas = monthGigs.filter((g) => g.status === "Confirmada").length;
  const propostas = monthGigs.filter((g) => g.status === "Proposta").length;

  // pipeline criativo: tracks ativas + conteúdos em produção + festas sem data
  const activeTracks = tracks.filter((t) => !t.standby).length;
  const contentInProd = content.filter((c) =>
    CONTENT_IN_PRODUCTION.includes(c.status)
  ).length;
  const undatedParties = data.parties.filter(
    (p) => !p.date && p.status !== "Realizada" && p.status !== "Cancelada"
  ).length;
  const pipeline = activeTracks + contentInProd + undatedParties;

  // alertas críticos
  const alerts = computeAlerts(gigs, weekTasks, fin);
  const totalAlerts = alerts.reduce((s, a) => s + a.count, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Receita do mês"
        value={formatCurrency(curRevenue)}
        to="/financeiro"
        footer={<TrendIndicator delta={revenueTrend} />}
      />
      <KpiCard
        label="GIGs do mês"
        value={monthGigs.length.toString()}
        to="/gigs"
        footer={
          <span className="text-xs text-muted-foreground">
            {concluidas} concluídas · {confirmadas} confirmadas · {propostas}{" "}
            propostas
          </span>
        }
      />
      <KpiCard
        label="Pipeline criativo"
        value={pipeline.toString()}
        to="/musica"
        footer={
          <span className="text-xs text-muted-foreground">
            {activeTracks} tracks · {contentInProd} conteúdos · {undatedParties} festas s/ data
          </span>
        }
      />
      <AlertsKpi alerts={alerts} total={totalAlerts} />
    </div>
  );
}

type AlertLine = { label: string; to: string; count: number };

function computeAlerts(
  gigs: Gig[],
  weekTasks: Task[],
  fin: FinanceInsights
): AlertLine[] {
  const out: AlertLine[] = [];

  const pendingDebriefs = gigs.filter((g) => g.debrief_pending === 1).length;
  if (pendingDebriefs > 0)
    out.push({
      label: `${pendingDebriefs} debrief${pendingDebriefs > 1 ? "s" : ""} pendente${pendingDebriefs > 1 ? "s" : ""}`,
      to: "/gigs",
      count: pendingDebriefs,
    });

  const soon = weekTasks.filter(
    (t) => t.due_date && daysUntil(t.due_date) <= 2
  ).length;
  if (soon > 0)
    out.push({
      label: `${soon} tarefa${soon > 1 ? "s" : ""} vencendo em 48h`,
      to: "/tarefas",
      count: soon,
    });

  if (fin.next30Payable > 0)
    out.push({
      label: `${formatCurrency(fin.next30Payable)} a pagar em 30 dias`,
      to: "/financeiro",
      count: 1,
    });

  // tracks paradas / festas abaixo do break-even entram nos batches I e K
  return out;
}

function AlertsKpi({ alerts, total }: { alerts: AlertLine[]; total: number }) {
  const [open, setOpen] = useState(false);
  const danger = total > 0;
  return (
    <Card className={cn(danger && "border-amber-500/40 bg-amber-500/5")}>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full text-left"
          disabled={total === 0}
        >
          <CardDescription className="flex items-center gap-2 text-xs">
            <Bell className={cn("h-4 w-4", danger && "text-amber-500")} />
            Alertas críticos
          </CardDescription>
          <CardTitle
            className={cn(
              "text-2xl tabular-nums",
              danger ? "text-amber-600" : "text-muted-foreground"
            )}
          >
            {total}
          </CardTitle>
        </button>
      </CardHeader>
      {open && total > 0 && (
        <CardContent className="space-y-1 pt-0">
          {alerts.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5 text-xs transition hover:border-amber-500/60"
            >
              <span>{a.label}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function KpiCard({
  label,
  value,
  footer,
  to,
}: {
  label: string;
  value: string;
  footer?: React.ReactNode;
  to: string;
}) {
  return (
    <Link to={to} className="block transition hover:opacity-90">
      <Card className="h-full transition hover:border-primary">
        <CardHeader className="pb-2">
          <CardDescription className="text-xs">{label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        </CardHeader>
        {footer && <CardContent className="pt-0">{footer}</CardContent>}
      </Card>
    </Link>
  );
}

function TrendIndicator({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.01)
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> estável vs mês anterior
      </span>
    );
  const up = delta > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        up ? "text-emerald-500" : "text-destructive"
      )}
    >
      {up ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {up ? "+" : "−"}
      {formatCurrency(Math.abs(delta))} vs mês anterior
    </span>
  );
}

// ============================================================
// Bloco 2 — OKRs + Pipeline criativo compacto
// ============================================================

function OkrCard({ okrs }: { okrs: Okr[] }) {
  const quarter = currentQuarter();
  const current = okrs.filter((o) => o.quarter === quarter);
  const shown = current.length > 0 ? current : okrs.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          OKRs · {quarter}
        </CardTitle>
        <CardDescription>
          {okrs.length === 0
            ? "Nenhum OKR cadastrado."
            : current.length === 0
            ? "Sem OKRs neste trimestre."
            : `${current.length} objetivo(s) neste trimestre`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {shown.length === 0 ? (
          <Link
            to="/objetivos"
            className="flex items-center justify-center gap-1 rounded-md border border-dashed p-4 text-xs text-muted-foreground transition hover:bg-accent"
          >
            <Target className="h-3.5 w-3.5" /> Definir OKRs
          </Link>
        ) : (
          shown.map((okr) => {
            const pct = Math.round(okrProgress(okr) * 100);
            return (
              <Link
                key={okr.id}
                to="/objetivos"
                className="block space-y-1.5 rounded-md border p-3 transition hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{okr.objective}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {okr.key_results.length} resultado(s)-chave
                </p>
              </Link>
            );
          })
        )}
        <Link
          to="/objetivos"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Ver todos os OKRs <ChevronRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function CreativePipelineCard({ data }: { data: DashData }) {
  const today = todayISO();

  const upcomingGigs = data.gigs
    .filter((g) => g.date >= today && (g.status === "Proposta" || g.status === "Confirmada"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const unrecordedContent = data.content.filter((c) =>
    ["Ideia", "Roteiro", "Gravando", "Edição", "Pronto"].includes(c.status)
  );

  const activeTracks = data.tracks.filter(
    (t) => !t.standby && ["Ideação", "Composição", "Produção"].includes(t.current_stage)
  );

  const activePipeline = data.parties.filter(
    (p) => p.status === "Planejando" || p.status === "Confirmada"
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Pipeline criativo</CardTitle>
        <CardDescription>O que está em execução agora.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GIGs futuras */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Disc3 className="h-3.5 w-3.5" /> GIGs futuras
            </span>
            <Link to="/gigs" className="text-[11px] text-muted-foreground hover:text-foreground">
              ver todas <ChevronRight className="inline h-3 w-3" />
            </Link>
          </div>
          {upcomingGigs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma GIG proposta ou confirmada.</p>
          ) : (
            <div className="space-y-1">
              {upcomingGigs.map((g) => (
                <Link
                  key={g.id}
                  to="/gigs"
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:bg-accent"
                >
                  <span className="font-medium">{gigDisplayName(g)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(g.date)}</span>
                    <StatusBadge status={g.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Conteúdos não gravados */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Film className="h-3.5 w-3.5" /> Conteúdos não gravados
            </span>
            <span className="text-[11px] text-muted-foreground">{unrecordedContent.length} no pipeline</span>
          </div>
          {unrecordedContent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum conteúdo em andamento.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(["Ideia", "Roteiro", "Gravando", "Edição", "Pronto"] as const).map((status) => {
                const n = unrecordedContent.filter((c) => c.status === status).length;
                if (n === 0) return null;
                return (
                  <Link
                    key={status}
                    to="/conteudo"
                    className="flex items-center gap-1 rounded-md border bg-muted/40 px-2.5 py-1 text-xs transition hover:bg-accent"
                  >
                    <span className="font-medium">{n}</span>
                    <span className="text-muted-foreground">{status}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Tracks em produção */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <Music className="h-3.5 w-3.5" /> Tracks em produção
            </span>
            <Link to="/musica" className="text-[11px] text-muted-foreground hover:text-foreground">
              ver todas <ChevronRight className="inline h-3 w-3" />
            </Link>
          </div>
          {activeTracks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma track em Ideação, Composição ou Produção.</p>
          ) : (
            <div className="space-y-1">
              {activeTracks.slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  to="/musica"
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:bg-accent"
                >
                  <span className="font-medium">{trackDisplayName(t)}</span>
                  <StageBadge stage={t.current_stage} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Festas no pipeline */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <PartyPopper className="h-3.5 w-3.5" /> Festas no pipeline
            </span>
            <Link to="/festas" className="text-[11px] text-muted-foreground hover:text-foreground">
              ver todas <ChevronRight className="inline h-3 w-3" />
            </Link>
          </div>
          {activePipeline.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma festa planejando ou confirmada.</p>
          ) : (
            <div className="space-y-1">
              {activePipeline.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  to="/festas"
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition hover:bg-accent"
                >
                  <span className="font-medium">{p.title}</span>
                  <div className="flex items-center gap-2">
                    {p.date && <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>}
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        p.status === "Confirmada"
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-amber-500/30 text-amber-400"
                      )}
                    >
                      {p.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Bloco 3 — Visão integrada da semana
// ============================================================

type TimelineItem = {
  kind: "gig" | "task" | "content" | "party";
  label: string;
  to: string;
};

function WeekTimeline({ data }: { data: DashData }) {
  const { gigs, weekTasks, content, parties } = data;
  const days = useMemo(() => nextNDays(7), []);

  const byDay = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const d of days) map.set(d, []);
    const push = (date: string | null, item: TimelineItem) => {
      if (!date) return;
      const key = date.slice(0, 10);
      if (map.has(key)) map.get(key)!.push(item);
    };
    for (const g of gigs) {
      if (g.status === "Cancelada") continue;
      push(g.date, { kind: "gig", label: gigDisplayName(g), to: "/gigs" });
    }
    for (const t of weekTasks) {
      push(t.due_date, { kind: "task", label: t.title, to: "/tarefas" });
    }
    for (const c of content) {
      if (c.status === "Publicado" || c.status === "Arquivado") continue;
      push(c.publish_date, { kind: "content", label: c.title, to: "/conteudo" });
    }
    for (const p of parties) {
      if (p.status === "Cancelada" || p.status === "Realizada") continue;
      push(p.date, { kind: "party", label: p.title, to: "/festas" });
    }
    return map;
  }, [days, gigs, weekTasks, content, parties]);

  const totalItems = days.reduce((s, d) => s + (byDay.get(d)?.length ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-primary" />
          Sua semana
        </CardTitle>
        <CardDescription>
          GIGs, tarefas e posts dos próximos 7 dias — no mesmo eixo, sem silos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalItems === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Semana livre. Nada agendado nos próximos 7 dias.
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const isToday = d === todayISO();
              return (
                <div
                  key={d}
                  className={cn(
                    "min-h-[6rem] space-y-1.5 rounded-md border p-2",
                    isToday && "border-primary bg-primary/5"
                  )}
                >
                  <div className="text-center text-[11px] font-medium uppercase text-muted-foreground">
                    {formatDate(d, "EEE")}
                    <div className="text-sm font-semibold text-foreground">
                      {formatDate(d, "dd")}
                    </div>
                  </div>
                  {items.map((item, i) => (
                    <Link
                      key={i}
                      to={item.to}
                      title={item.label}
                      className={cn(
                        "block truncate rounded px-1.5 py-1 text-[11px] transition hover:opacity-80",
                        TIMELINE_STYLES[item.kind]
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <LegendDot className="bg-primary/20" label="GIG" />
          <LegendDot className="bg-sky-500/20" label="Tarefa" />
          <LegendDot className="bg-emerald-500/20" label="Post" />
          <LegendDot className="bg-pink-500/20" label="Festa" />
        </div>
      </CardContent>
    </Card>
  );
}

const TIMELINE_STYLES: Record<TimelineItem["kind"], string> = {
  gig: "bg-primary/20 text-primary",
  task: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  content: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  party: "bg-pink-500/20 text-pink-700 dark:text-pink-300",
};

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-2.5 rounded", className)} />
      {label}
    </span>
  );
}
