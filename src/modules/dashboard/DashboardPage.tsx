import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Disc3,
  Film,
  Minus,
  Music,
  PartyPopper,
  RefreshCw,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CareerTimelinePage } from "@/modules/carreira/CareerTimelinePage";
import { MindMapPage } from "@/modules/dashboard/MindMapPage";
import { MonthlyReportPage } from "@/modules/dashboard/MonthlyReportPage";
import { MetodologiasPage } from "@/modules/dashboard/MetodologiasPage";
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
import { listTracks, daysInStage } from "@/modules/music/api";
import { listParties } from "@/modules/parties/api";
import { estimatedRevenue, type PartyDeserialized } from "@/modules/parties/types";
import { listOkrs, currentQuarter, okrProgress, type Okr } from "@/modules/objetivos/api";
import type { TrackWithProject } from "@/modules/music/types";
import { trackDisplayName } from "@/modules/music/types";
import { TRACK_KIND_LABEL } from "@/modules/music/stages";
import { gateAfter } from "@/modules/music/gates";
import { StageBadge } from "@/modules/music/components/StageBadge";
import { listClasses } from "@/modules/classes/api";
import type { ClassSession } from "@/modules/classes/types";
import { formatCurrency, formatDate, formatRating, todayISO } from "@/lib/format";

// Recharts (~150kb) só carrega quando o painel Financeiro é expandido.
const FinanceDashboard = lazy(() =>
  import("@/modules/finance/views/FinanceDashboard").then((m) => ({
    default: m.FinanceDashboard,
  }))
);

// ============================================================
// Painel temático colapsável (estado lembrado em localStorage)
// ============================================================

function useCollapsed(key: string, defaultOpen = true): [boolean, () => void] {
  const storageKey = `dash.panel.${key}`;
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === "1";
  });
  const toggle = useCallback(() => {
    setOpen((o) => {
      localStorage.setItem(storageKey, o ? "0" : "1");
      return !o;
    });
  }, [storageKey]);
  return [open, toggle];
}

function CollapsibleCard({
  storageKey,
  icon,
  title,
  description,
  children,
  defaultOpen = true,
}: {
  storageKey: string;
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, toggle] = useCollapsed(storageKey, defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left"
        aria-expanded={open}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90"
              )}
            />
          </div>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      </button>
      {open && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  );
}

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
  classes: ClassSession[];
};

export function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [gigs, fin, content, weekTasks, tracks, parties, okrs, classes] = await Promise.all([
        listGigs(),
        loadFinanceInsights(),
        listContent(),
        listUpcoming(50),
        listTracks(),
        listParties(),
        listOkrs(),
        listClasses(),
      ]);
      setData({ gigs, fin, content, weekTasks, tracks, parties, okrs, classes });
      setUpdatedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <TabsList className="flex-wrap h-auto gap-0.5">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
          <TabsTrigger value="mindmap">Mapa mental</TabsTrigger>
          <TabsTrigger value="metodologias">Metodologias</TabsTrigger>
          <TabsTrigger value="report">Extrair relatório</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => void load()} disabled={refreshing} aria-label="Atualizar">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      <TabsContent value="overview" className="space-y-6">
        {data ? (
          <>
            <KpiRow data={data} />
            <div className="grid gap-4 lg:grid-cols-2">
              <GigsCard data={data} />
              <MusicCard data={data} />
              <ContentCard data={data} />
              <FestasCard data={data} />
            </div>
            <WeekTimeline data={data} />

            <div className="space-y-4">
              <FinancePanel />
              <OkrPanel okrs={data.okrs} />
            </div>
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
      </TabsContent>

      <TabsContent value="timeline">
        <CareerTimelinePage />
      </TabsContent>

      <TabsContent value="mindmap" className="-mx-1">
        <MindMapPage />
      </TabsContent>

      <TabsContent value="metodologias">
        <MetodologiasPage />
      </TabsContent>

      <TabsContent value="report">
        <MonthlyReportPage />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================
// Bloco 1 — KPIs estratégicos
// ============================================================

function KpiRow({ data }: { data: DashData }) {
  const { gigs, fin } = data;
  const month = todayISO().slice(0, 7);

  const series = fin.monthly;
  const curRevenue = fin.monthIncome;
  const prevRevenue = series.length >= 2 ? series[series.length - 2].income : 0;
  const revenueTrend = curRevenue - prevRevenue;

  const monthGigs = gigs.filter((g) => g.date.slice(0, 7) === month);
  const concluidas = monthGigs.filter((g) => g.status === "Concluída").length;
  const confirmadas = monthGigs.filter((g) => g.status === "Confirmada").length;
  const propostas = monthGigs.filter((g) => g.status === "Proposta").length;

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
      <EmExecucaoCard data={data} />
      <OkrMiniCard okrs={data.okrs} />
    </div>
  );
}

function EmExecucaoCard({ data }: { data: DashData }) {
  const today = todayISO();

  const upcomingGigs = data.gigs.filter(
    (g) => g.date >= today && (g.status === "Proposta" || g.status === "Confirmada")
  ).length;

  const contentInProgress = data.content.filter((c) =>
    ["Ideia", "Roteiro", "Gravando", "Edição", "Pronto"].includes(c.status)
  ).length;

  const activeTracks = data.tracks.filter(
    (t) => !t.standby && ["Ideação", "Composição", "Produção"].includes(t.current_stage)
  ).length;

  const partiesPipeline = data.parties.filter(
    (p) => p.status === "Planejando" || p.status === "Confirmada"
  ).length;

  const upcomingClasses = data.classes.filter(
    (c) => c.status === "Agendada" && c.date >= today
  ).length;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">Em execução</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <Link
          to="/gigs"
          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs transition hover:bg-accent"
        >
          <Disc3 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="tabular-nums font-medium">{upcomingGigs}</span>
          <span className="text-muted-foreground">GIGs futuras</span>
        </Link>
        <Link
          to="/conteudo"
          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs transition hover:bg-accent"
        >
          <Film className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="tabular-nums font-medium">{contentInProgress}</span>
          <span className="text-muted-foreground">Conteúdos</span>
        </Link>
        <Link
          to="/musica"
          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs transition hover:bg-accent"
        >
          <Music className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="tabular-nums font-medium">{activeTracks}</span>
          <span className="text-muted-foreground">Tracks ativas</span>
        </Link>
        <Link
          to="/festas"
          className="flex items-center gap-2 rounded px-1 py-0.5 text-xs transition hover:bg-accent"
        >
          <PartyPopper className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="tabular-nums font-medium">{partiesPipeline}</span>
          <span className="text-muted-foreground">Festas em andamento</span>
        </Link>
        {upcomingClasses > 0 && (
          <Link
            to="/aulas"
            className="flex items-center gap-2 rounded px-1 py-0.5 text-xs transition hover:bg-accent"
          >
            <BookOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="tabular-nums font-medium">{upcomingClasses}</span>
            <span className="text-muted-foreground">Aulas agendadas</span>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function OkrMiniCard({ okrs }: { okrs: Okr[] }) {
  const quarter = currentQuarter();
  const current = okrs.filter((o) => o.quarter === quarter);
  const shown = current.length > 0 ? current : okrs;

  const avgPct =
    shown.length > 0
      ? Math.round(
          shown.reduce((s, o) => s + okrProgress(o), 0) / shown.length * 100
        )
      : null;

  return (
    <Link to="/objetivos" className="block transition hover:opacity-90">
      <Card className="h-full transition hover:border-primary">
        <CardHeader className="pb-2">
          <CardDescription className="text-xs">OKRs</CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {avgPct !== null ? `${avgPct}%` : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <span className="text-xs text-muted-foreground">
            {shown.length === 0
              ? "Sem OKRs"
              : `${shown.length} objetivo(s) · ${quarter}`}
          </span>
        </CardContent>
      </Card>
    </Link>
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
// Bloco 2 — painéis temáticos
// ============================================================

function FinancePanel() {
  const [open, toggle] = useCollapsed("financeiro", false);
  return (
    <Card>
      <button type="button" onClick={toggle} className="w-full text-left" aria-expanded={open}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Financeiro
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90"
              )}
            />
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent>
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">Carregando dashboard…</div>
            }
          >
            <FinanceDashboard refreshKey={0} />
          </Suspense>
        </CardContent>
      )}
    </Card>
  );
}

function OkrPanel({ okrs }: { okrs: Okr[] }) {
  const quarter = currentQuarter();
  const current = okrs.filter((o) => o.quarter === quarter);
  const shown = current.length > 0 ? current : okrs;

  return (
    <CollapsibleCard
      storageKey="okrs"
      icon={<Target className="h-4 w-4 text-primary" />}
      title="OKRs"
      description={
        shown.length === 0
          ? "Nenhum OKR cadastrado."
          : `${shown.length} objetivo(s) · ${quarter}`
      }
      defaultOpen={false}
    >
      {shown.length === 0 ? (
        <Link
          to="/objetivos"
          className="flex items-center justify-center gap-1 rounded-md border border-dashed p-4 text-xs text-muted-foreground transition hover:bg-accent"
        >
          <Target className="h-3.5 w-3.5" /> Criar primeiro objetivo
        </Link>
      ) : (
        <div className="space-y-3">
          {shown.map((o) => {
            const pct = Math.round(okrProgress(o) * 100);
            return (
              <Link
                key={o.id}
                to="/objetivos"
                className="block space-y-1.5 rounded-md border p-3 transition hover:border-primary"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">{o.objective}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CollapsibleCard>
  );
}

function GigsCard({ data }: { data: DashData }) {
  const { gigs } = data;
  const today = todayISO();
  const lifeTimeCount = gigs.filter((g) => g.status === "Concluída").length;

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
          <Disc3 className="h-4 w-4 text-primary" /> GIGs
          {lifeTimeCount > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {lifeTimeCount} realizadas
            </span>
          )}
        </CardTitle>
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
                  to={`/gigs?open=${g.id}`}
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
                  <PrepProgressMini state={prep} groupFilter={g.event_category === "Festa" ? undefined : ["musical", "logistica"]} />
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

function MusicCard({ data }: { data: DashData }) {
  const { tracks } = data;

  const active = tracks.filter((t) => !t.standby);
  const top3 = active.slice(0, 3);
  const stalled = active.filter((t) => {
    const d = daysInStage(t);
    return d !== null && d > 30;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="h-4 w-4 text-primary" /> Produção Musical
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {top3.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Sem tracks ativas.{" "}
            <Button asChild variant="dark" size="sm" className="ml-1">
              <Link to="/musica">Criar</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {top3.map((t) => {
              const d = daysInStage(t);
              const gate = gateAfter(t.current_stage);
              return (
                <Link
                  key={t.id}
                  to="/musica"
                  className="block space-y-1 rounded-md border p-2.5 transition hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium leading-tight">
                      {trackDisplayName(t)}
                    </div>
                    <StageBadge stage={t.current_stage} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{TRACK_KIND_LABEL[t.kind]}</span>
                    <span>
                      {d !== null && (
                        <span className={d > 30 ? "text-amber-500" : ""}>
                          {d}d no stage
                        </span>
                      )}
                      {gate && <> · próx: {gate.id}</>}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {stalled.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {stalled.length} track{stalled.length > 1 ? "s" : ""} parada
              {stalled.length > 1 ? "s" : ""} há +30 dias em algum stage.
            </span>
          </div>
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
          <Film className="h-4 w-4 text-primary" /> Conteúdos
        </CardTitle>
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

function FestasCard({ data }: { data: DashData }) {
  const today = todayISO();
  const upcoming = data.parties
    .filter(
      (p) =>
        p.date &&
        p.date >= today &&
        p.status !== "Cancelada" &&
        p.status !== "Realizada"
    )
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(0, 3);

  const next = upcoming[0] ?? null;

  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const hasUpcoming30 = data.parties.some(
    (p) =>
      p.date &&
      p.date >= today &&
      p.date <= in30 &&
      p.status !== "Cancelada" &&
      p.status !== "Realizada"
  );
  const noConfirmed = !data.parties.some(
    (p) =>
      p.status === "Confirmada" &&
      p.date &&
      p.date >= today &&
      p.date <= in30
  );

  const undated =
    !hasUpcoming30
      ? data.parties
          .filter(
            (p) =>
              !p.date &&
              p.status !== "Cancelada" &&
              p.status !== "Realizada"
          )
          .slice(0, 3)
      : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PartyPopper className="h-4 w-4 text-pink-400" /> Produção de Festas
        </CardTitle>
        <CardDescription>
          {data.parties.length === 0
            ? "Nenhuma festa cadastrada."
            : `${upcoming.length} próxima(s) · ${data.parties.filter((p) => p.status === "Realizada").length} realizada(s)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {noConfirmed && data.parties.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Nenhuma festa confirmada nos próximos 30 dias.
          </div>
        )}
        {next ? (
          <div className="space-y-1 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{next.title}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  next.status === "Confirmada"
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-amber-500/30 text-amber-400"
                )}
              >
                {next.status}
              </Badge>
            </div>
            {next.date && (
              <p className="text-xs text-muted-foreground">
                {formatDate(next.date)} · {daysUntil(next.date)} dias
              </p>
            )}
            {next.expected_capacity && (
              <p className="text-xs text-muted-foreground">
                Capacidade: {next.expected_capacity.toLocaleString("pt-BR")} pessoas
                {estimatedRevenue(next) > 0 &&
                  ` · Receita est. ${formatCurrency(estimatedRevenue(next))}`}
              </p>
            )}
          </div>
        ) : undated.length === 0 ? (
          <Link
            to="/festas"
            className="flex items-center justify-center gap-1 rounded-md border border-dashed p-4 text-xs text-muted-foreground transition hover:bg-accent"
          >
            <PartyPopper className="h-3.5 w-3.5" /> Cadastrar primeira festa
          </Link>
        ) : null}

        {undated.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Nada nos próximos 30 dias. Festas sem data definida:
            </p>
            {undated.map((p) => (
              <Link
                key={p.id}
                to="/festas"
                className="flex items-center justify-between gap-2 rounded-md border p-2.5 transition hover:bg-accent"
              >
                <span className="text-sm font-medium">{p.title}</span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-500/30 text-xs text-amber-400"
                >
                  Sem data
                </Badge>
              </Link>
            ))}
          </div>
        )}
        <Link
          to="/festas"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Ver todas as festas <ChevronRight className="h-3 w-3" />
        </Link>
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
      push(g.date, { kind: "gig", label: gigDisplayName(g), to: `/gigs?open=${g.id}` });
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
      </CardHeader>
      <CardContent>
        {totalItems === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Semana livre. Nada agendado nos próximos 7 dias.
          </div>
        ) : (
          // Mobile: lista vertical (dias vazios escondidos). Desktop: grade de 7 colunas.
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-7">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const isToday = d === todayISO();
              return (
                <div
                  key={d}
                  className={cn(
                    "flex gap-3 rounded-md border p-2 sm:block sm:min-h-[6rem] sm:gap-0 sm:space-y-1.5",
                    isToday && "border-primary bg-primary/5",
                    items.length === 0 && "hidden sm:block"
                  )}
                >
                  <div className="flex w-10 shrink-0 flex-col items-center justify-center text-[11px] font-medium uppercase text-muted-foreground sm:w-auto sm:justify-start">
                    {formatDate(d, "EEE")}
                    <div className="text-sm font-semibold text-foreground">
                      {formatDate(d, "dd")}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
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
