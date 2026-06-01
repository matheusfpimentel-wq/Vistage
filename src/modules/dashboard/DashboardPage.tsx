import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronRight,
  Disc3,
  Film,
  Minus,
  Music,
  PartyPopper,
  Star,
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listGigs } from "@/modules/gigs/api";
import { averageRating, type Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { PrepProgressMini } from "@/modules/gigs/components/PrepChecklist";
import { parsePrepState, prepProgress } from "@/modules/gigs/prep";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listUpcoming } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listContent } from "@/modules/content/api";
import type { Content } from "@/modules/content/types";
import { loadFinanceInsights, type FinanceInsights } from "@/modules/finance/api";
import { formatCurrency, formatDate, formatRating, todayISO } from "@/lib/format";

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
};

export function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    void (async () => {
      const [gigs, fin, content, weekTasks] = await Promise.all([
        listGigs(),
        loadFinanceInsights(),
        listContent(),
        listUpcoming(50),
      ]);
      setData({ gigs, fin, content, weekTasks });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          Poucos números, alto sinal. A semana inteira num só eixo.
        </p>
      </div>

      {data ? (
        <>
          <KpiRow data={data} />
          <DomainCards data={data} />
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
  const { gigs, fin, content, weekTasks } = data;
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

  // pipeline criativo (por enquanto só conteúdos em produção)
  const contentInProd = content.filter((c) =>
    CONTENT_IN_PRODUCTION.includes(c.status)
  ).length;

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
        value={contentInProd.toString()}
        to="/conteudo"
        footer={
          <span className="text-xs text-muted-foreground">
            conteúdos em produção · tracks e festas em breve
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
// Bloco 2 — 4 cards de domínio
// ============================================================

function DomainCards({ data }: { data: DashData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GigsCard data={data} />
      <ContentCard data={data} />
      <ComingSoonCard
        icon={<Music className="h-4 w-4" />}
        title="Produção Musical"
        batch="Batch I"
        to="/ideias"
      />
      <ComingSoonCard
        icon={<PartyPopper className="h-4 w-4" />}
        title="Produção de Festas"
        batch="Batch K"
        to="/venues"
      />
    </div>
  );
}

function GigsCard({ data }: { data: DashData }) {
  const { gigs } = data;
  const today = todayISO();

  const upcoming = gigs
    .filter(
      (g) =>
        g.date >= today && g.status !== "Concluída" && g.status !== "Cancelada"
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const pending = gigs.filter((g) => g.debrief_pending === 1);

  const last5 = gigs
    .filter((g) => g.status === "Concluída")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const last5Ratings = last5
    .map((g) => averageRating(g))
    .filter((r): r is number => r !== null);
  const last5Avg =
    last5Ratings.length > 0
      ? last5Ratings.reduce((s, r) => s + r, 0) / last5Ratings.length
      : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Disc3 className="h-4 w-4 text-primary" />
          GIGs
        </CardTitle>
        <CardDescription>Próximas apresentações e debriefs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Sem GIGs futuras.{" "}
            <Button asChild variant="dark" size="sm" className="ml-1">
              <Link to="/gigs">Criar</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((g) => {
              const prep = parsePrepState(g.prep_state);
              const { done, total } = prepProgress(prep);
              const d = daysUntil(g.date);
              return (
                <Link
                  key={g.id}
                  to="/gigs"
                  className="block space-y-2 rounded-md border p-3 transition hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{gigDisplayName(g)}</div>
                      <div className="text-xs text-muted-foreground">
                        {g.venue_name} · {formatDate(g.date)}
                        {d >= 0 && <> · {d === 0 ? "hoje" : `em ${d}d`}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {done}/{total}
                      </span>
                      <StatusBadge status={g.status} />
                    </div>
                  </div>
                  <PrepProgressMini state={prep} />
                </Link>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            Média últimas 5
          </span>
          <span className="font-semibold text-amber-500">
            {last5Avg !== null ? formatRating(last5Avg) : "—"}
          </span>
        </div>

        {pending.length > 0 && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/gigs">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Finalizar {pending.length} debrief
              {pending.length > 1 ? "s" : ""} pendente
              {pending.length > 1 ? "s" : ""}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ContentCard({ data }: { data: DashData }) {
  const { content } = data;
  const today = todayISO();
  const month = today.slice(0, 7);

  const isScheduled = (c: Content) =>
    c.status !== "Publicado" &&
    c.status !== "Arquivado" &&
    c.publish_date !== null &&
    c.publish_date >= today;

  const counts = {
    ideia: content.filter((c) => c.status === "Ideia").length,
    producao: content.filter((c) =>
      ["Roteiro", "Gravando", "Edição"].includes(c.status)
    ).length,
    pronto: content.filter((c) => c.status === "Pronto").length,
    agendado: content.filter(isScheduled).length,
  };

  const nextScheduled = content
    .filter(isScheduled)
    .sort((a, b) =>
      (a.publish_date ?? "").localeCompare(b.publish_date ?? "")
    )[0];

  // distribuição por finalidade no mês
  const monthContent = content.filter((c) => {
    const ref = c.publish_date ?? c.due_date ?? c.created_at;
    return ref.slice(0, 7) === month && !!c.purpose;
  });
  const byPurpose = new Map<string, number>();
  for (const c of monthContent) {
    const p = c.purpose!.trim();
    byPurpose.set(p, (byPurpose.get(p) ?? 0) + 1);
  }
  const purposeTotal = monthContent.length;
  const purposes = Array.from(byPurpose.entries()).sort((a, b) => b[1] - a[1]);
  const topShare = purposeTotal > 0 ? purposes[0][1] / purposeTotal : 0;
  const imbalance = purposeTotal >= 3 && topShare > 0.7;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Film className="h-4 w-4 text-primary" />
          Conteúdos
        </CardTitle>
        <CardDescription>Pipeline editorial resumido.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          <MiniKanbanCol label="Ideia" value={counts.ideia} />
          <MiniKanbanCol label="Produção" value={counts.producao} />
          <MiniKanbanCol label="Pronto" value={counts.pronto} />
          <MiniKanbanCol label="Agendado" value={counts.agendado} />
        </div>

        {nextScheduled ? (
          <Link
            to="/conteudo"
            className="flex items-center justify-between rounded-md border p-2.5 text-sm transition hover:border-primary"
          >
            <div>
              <div className="font-medium">{nextScheduled.title}</div>
              <div className="text-xs text-muted-foreground">
                {nextScheduled.networks.join(", ") || "—"}
                {nextScheduled.format && ` · ${nextScheduled.format}`}
              </div>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDate(nextScheduled.publish_date)}
            </span>
          </Link>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Nenhum conteúdo agendado.
          </div>
        )}

        {purposeTotal > 0 && (
          <div className="space-y-1.5">
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {purposes.map(([p, n], i) => (
                <div
                  key={p}
                  className={cn(
                    "h-full",
                    PURPOSE_COLORS[i % PURPOSE_COLORS.length]
                  )}
                  style={{ width: `${(n / purposeTotal) * 100}%` }}
                  title={`${p}: ${n}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {purposes.slice(0, 4).map(([p, n], i) => (
                <span key={p} className="flex items-center gap-1">
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      PURPOSE_COLORS[i % PURPOSE_COLORS.length]
                    )}
                  />
                  {p} ({n})
                </span>
              ))}
            </div>
          </div>
        )}

        {imbalance && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Desequilíbrio: <strong>{Math.round(topShare * 100)}%</strong> do
              mês é só "{purposes[0][0]}". Varie as finalidades.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PURPOSE_COLORS = [
  "bg-primary",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-violet-400",
];

function MiniKanbanCol({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ComingSoonCard({
  icon,
  title,
  batch,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  batch: string;
  to: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>Módulo em desenvolvimento.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center">
          <Badge variant="secondary">Em breve · {batch}</Badge>
          <p className="text-xs text-muted-foreground">
            Enquanto isso, capture ideias em{" "}
            <Link to={to} className="underline hover:text-foreground">
              {to}
            </Link>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Bloco 3 — Visão integrada da semana
// ============================================================

type TimelineItem = {
  kind: "gig" | "task" | "content";
  label: string;
  to: string;
};

function WeekTimeline({ data }: { data: DashData }) {
  const { gigs, weekTasks, content } = data;
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
    return map;
  }, [days, gigs, weekTasks, content]);

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
        </div>
      </CardContent>
    </Card>
  );
}

const TIMELINE_STYLES: Record<TimelineItem["kind"], string> = {
  gig: "bg-primary/20 text-primary",
  task: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  content: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2.5 w-2.5 rounded", className)} />
      {label}
    </span>
  );
}
