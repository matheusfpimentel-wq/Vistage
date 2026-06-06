import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import {
  DEFAULT_NAV,
  NAV_GROUP_META,
  modulesInGroup,
  type NavGroup,
} from "@/lib/nav";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";
// Operação
import { listGigs } from "@/modules/gigs/api";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { listParties } from "@/modules/parties/api";
import { listClasses } from "@/modules/classes/api";
import { listTasks } from "@/modules/tasks/api";
// Relacionamento
import { listContacts } from "@/modules/crm/api";
import { ratingToPriority } from "@/modules/crm/types";
import { listSuppliers } from "@/modules/suppliers/api";
import { getFanStats } from "@/modules/fans/api";
import { listVenues } from "@/modules/venues/api";
// Criação
import { listTracks, daysInStage } from "@/modules/music/api";
import { trackDisplayName } from "@/modules/music/types";
import { StageBadge } from "@/modules/music/components/StageBadge";
import { listContent } from "@/modules/content/api";
import { listIdeas } from "@/modules/ideas/api";
// Gestão
import { loadFinanceInsights } from "@/modules/finance/api";
import { listOkrs, currentQuarter, okrProgress } from "@/modules/objetivos/api";
import { loadActivityStats } from "@/modules/foco/api";

// ============================================================
// Descrições curtas de cada módulo (cartões do hub)
// ============================================================

const MODULE_DESC: Record<string, string> = {
  "/gigs": "Agenda, propostas e debriefs",
  "/festas": "Produção de eventos próprios",
  "/aulas": "Aulas e alunos",
  "/tarefas": "To-dos e prazos",
  "/crm": "Contatos e relacionamento",
  "/venues": "Locais e casas de show",
  "/fornecedores": "Parceiros e serviços",
  "/fas": "Clube de fãs e superfãs",
  "/musica": "Pipeline de produção musical",
  "/conteudo": "Calendário de conteúdo",
  "/ideias": "Ideias, insights e captura",
  "/financeiro": "Receitas, despesas e fluxo",
  "/objetivos": "OKRs e metas do trimestre",
  "/relatorio": "Resumo mensal do projeto",
  "/foco": "Sessões de energia e foco",
  "/identidade": "Marca e identidade artística",
};

// ============================================================
// Hook de carregamento (recarrega no DATA_CHANGED)
// ============================================================

function useAsync<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(() => {
    setLoading(true);
    void load()
      .then(setData)
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    run();
    const onChange = () => run();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [run]);

  return { data, loading, reload: run };
}

// ============================================================
// Componentes de apresentação compartilhados
// ============================================================

function GroupShell({
  group,
  loading,
  onReload,
  children,
}: {
  group: NavGroup;
  loading: boolean;
  onReload: () => void;
  children: React.ReactNode;
}) {
  const meta = NAV_GROUP_META[group];
  const Icon = meta.icon;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold leading-tight">{group}</h2>
            <p className="text-sm text-muted-foreground">{meta.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground transition hover:bg-accent"
          aria-label="Atualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  to,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  to: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <Link to={to} className="block transition hover:opacity-90">
      <Card className="h-full transition hover:border-primary">
        <CardHeader className="pb-2">
          <CardDescription className="text-xs">{label}</CardDescription>
          <CardTitle
            className={cn(
              "text-2xl tabular-nums",
              tone === "danger" && "text-destructive",
              tone === "success" && "text-emerald-500"
            )}
          >
            {value}
          </CardTitle>
        </CardHeader>
        {hint && (
          <CardContent className="pt-0">
            <span className="text-xs text-muted-foreground">{hint}</span>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

function ModuleHub({ group }: { group: NavGroup }) {
  const modules = modulesInGroup(DEFAULT_NAV, group);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Módulos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {modules.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-3 rounded-md border p-3 transition hover:border-primary hover:bg-accent/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition group-hover:text-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {MODULE_DESC[to] ?? ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nada por aqui ainda.
          </div>
        ) : (
          <div className="space-y-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function CenterLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

const KPI_GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";

// ============================================================
// Operação
// ============================================================

export function OperacaoDashboard() {
  const load = useCallback(async () => {
    const [gigs, parties, classes, tasks] = await Promise.all([
      listGigs(),
      listParties(),
      listClasses(),
      listTasks(),
    ]);
    return { gigs, parties, classes, tasks };
  }, []);
  const { data, loading, reload } = useAsync(load);
  const today = todayISO();

  return (
    <GroupShell group="Operação" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const upcomingGigs = data.gigs
            .filter(
              (g) =>
                g.date >= today &&
                (g.status === "Proposta" || g.status === "Confirmada")
            )
            .sort((a, b) => a.date.localeCompare(b.date));
          const upcomingParties = data.parties.filter(
            (p) =>
              p.date &&
              p.date >= today &&
              (p.status === "Planejando" || p.status === "Confirmada")
          );
          const upcomingClasses = data.classes.filter(
            (c) => c.status === "Agendada" && c.date >= today
          );
          const activeTasks = data.tasks.filter(
            (t) => t.status !== "Concluída" && t.status !== "Cancelada"
          );
          const overdue = activeTasks.filter(
            (t) => t.due_date && t.due_date < today
          );
          const dueSoon = activeTasks
            .filter((t) => t.due_date && t.due_date >= today)
            .slice(0, 5);

          return (
            <>
              <div className={KPI_GRID}>
                <StatCard
                  label="GIGs futuras"
                  value={upcomingGigs.length}
                  to="/gigs"
                  hint={
                    upcomingGigs[0]
                      ? `Próxima: ${formatDate(upcomingGigs[0].date)}`
                      : "Nada agendado"
                  }
                />
                <StatCard
                  label="Festas em andamento"
                  value={upcomingParties.length}
                  to="/festas"
                />
                <StatCard
                  label="Aulas agendadas"
                  value={upcomingClasses.length}
                  to="/aulas"
                />
                <StatCard
                  label="Tarefas atrasadas"
                  value={overdue.length}
                  to="/tarefas"
                  tone={overdue.length > 0 ? "danger" : "default"}
                  hint={`${activeTasks.length} ativas no total`}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <HighlightCard
                  title="Próximas GIGs"
                  empty={upcomingGigs.length === 0}
                >
                  {upcomingGigs.slice(0, 5).map((g) => (
                    <Link
                      key={g.id}
                      to="/gigs"
                      className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {gigDisplayName(g)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {g.venue_name} · {formatDate(g.date)}
                        </div>
                      </div>
                      <StatusBadge status={g.status} />
                    </Link>
                  ))}
                </HighlightCard>

                <HighlightCard
                  title="Tarefas em aberto"
                  empty={overdue.length === 0 && dueSoon.length === 0}
                >
                  {[...overdue.slice(0, 5), ...dueSoon]
                    .slice(0, 6)
                    .map((t) => {
                      const late = !!t.due_date && t.due_date < today;
                      return (
                        <Link
                          key={t.id}
                          to="/tarefas"
                          className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                        >
                          <span className="min-w-0 truncate text-sm">
                            {t.title}
                          </span>
                          {t.due_date && (
                            <span
                              className={cn(
                                "shrink-0 text-xs tabular-nums",
                                late
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              {formatDate(t.due_date)}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                </HighlightCard>
              </div>

              <ModuleHub group="Operação" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}

// ============================================================
// Relacionamento
// ============================================================

export function RelacionamentoDashboard() {
  const load = useCallback(async () => {
    const [contacts, suppliers, fanStats, venues] = await Promise.all([
      listContacts(),
      listSuppliers(),
      getFanStats(),
      listVenues(),
    ]);
    return { contacts, suppliers, fanStats, venues };
  }, []);
  const { data, loading, reload } = useAsync(load);

  return (
    <GroupShell group="Relacionamento" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const highPriority = data.contacts.filter(
            (c) => ratingToPriority(c.rating) === "Alta"
          );
          const totalFans =
            data.fanStats.superfa + data.fanStats.fa + data.fanStats.possivelFa;

          return (
            <>
              <div className={KPI_GRID}>
                <StatCard
                  label="Contatos"
                  value={data.contacts.length}
                  to="/crm"
                  hint={`${highPriority.length} de prioridade alta`}
                />
                <StatCard
                  label="Venues"
                  value={data.venues.length}
                  to="/venues"
                />
                <StatCard
                  label="Fornecedores"
                  value={data.suppliers.length}
                  to="/fornecedores"
                />
                <StatCard
                  label="Superfãs"
                  value={data.fanStats.superfa}
                  to="/fas"
                  hint={`${totalFans} fãs no total`}
                />
              </div>

              <HighlightCard
                title="Contatos de prioridade alta"
                empty={highPriority.length === 0}
              >
                {highPriority.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to="/crm"
                    className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.types[0] ?? "—"}
                    </span>
                  </Link>
                ))}
              </HighlightCard>

              <ModuleHub group="Relacionamento" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}

// ============================================================
// Criação
// ============================================================

export function CriacaoDashboard() {
  const load = useCallback(async () => {
    const [tracks, content, ideas] = await Promise.all([
      listTracks(),
      listContent(),
      listIdeas(),
    ]);
    return { tracks, content, ideas };
  }, []);
  const { data, loading, reload } = useAsync(load);

  return (
    <GroupShell group="Criação" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const activeTracks = data.tracks.filter((t) => !t.standby);
          const pipeline = data.content.filter(
            (c) => c.status !== "Publicado" && c.status !== "Arquivado"
          );
          const published = data.content.filter(
            (c) => c.status === "Publicado"
          );
          const hotIdeas = data.ideas.filter((i) => i.heat === 3);

          return (
            <>
              <div className={KPI_GRID}>
                <StatCard
                  label="Tracks ativas"
                  value={activeTracks.length}
                  to="/musica"
                />
                <StatCard
                  label="Conteúdo no pipeline"
                  value={pipeline.length}
                  to="/conteudo"
                  hint={`${published.length} já publicados`}
                />
                <StatCard
                  label="Ideias"
                  value={data.ideas.length}
                  to="/ideias"
                  hint={`${hotIdeas.length} quentes`}
                />
                <StatCard
                  label="Standby"
                  value={data.tracks.length - activeTracks.length}
                  to="/musica"
                />
              </div>

              <HighlightCard
                title="Tracks ativas"
                empty={activeTracks.length === 0}
              >
                {activeTracks.slice(0, 6).map((t) => {
                  const d = daysInStage(t);
                  return (
                    <Link
                      key={t.id}
                      to="/musica"
                      className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {trackDisplayName(t)}
                        </div>
                        {d !== null && (
                          <div
                            className={cn(
                              "text-xs",
                              d > 30
                                ? "text-amber-500"
                                : "text-muted-foreground"
                            )}
                          >
                            {d}d no stage atual
                          </div>
                        )}
                      </div>
                      <StageBadge stage={t.current_stage} />
                    </Link>
                  );
                })}
              </HighlightCard>

              <ModuleHub group="Criação" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}

// ============================================================
// Gestão
// ============================================================

export function GestaoDashboard() {
  const load = useCallback(async () => {
    const [fin, okrs, activity] = await Promise.all([
      loadFinanceInsights(),
      listOkrs(),
      loadActivityStats(),
    ]);
    return { fin, okrs, activity };
  }, []);
  const { data, loading, reload } = useAsync(load);

  return (
    <GroupShell group="Gestão" loading={loading} onReload={reload}>
      {!data ? (
        <CenterLoader />
      ) : (
        (() => {
          const quarter = currentQuarter();
          const current = data.okrs.filter((o) => o.quarter === quarter);
          const shownOkrs = current.length > 0 ? current : data.okrs;
          const avgPct =
            shownOkrs.length > 0
              ? Math.round(
                  (shownOkrs.reduce((s, o) => s + okrProgress(o), 0) /
                    shownOkrs.length) *
                    100
                )
              : null;
          const totalMinutes = data.activity.reduce(
            (s, a) => s + (a.total_minutes ?? 0),
            0
          );
          const focusHours = Math.round(totalMinutes / 60);

          return (
            <>
              <div className={KPI_GRID}>
                <StatCard
                  label="Receita do mês"
                  value={formatCurrency(data.fin.monthIncome)}
                  to="/financeiro"
                />
                <StatCard
                  label="Saldo do mês"
                  value={formatCurrency(data.fin.monthBalance)}
                  to="/financeiro"
                  tone={data.fin.monthBalance >= 0 ? "success" : "danger"}
                />
                <StatCard
                  label="OKRs"
                  value={avgPct !== null ? `${avgPct}%` : "—"}
                  to="/objetivos"
                  hint={`${shownOkrs.length} objetivo(s) · ${quarter}`}
                />
                <StatCard
                  label="Horas de foco"
                  value={`${focusHours}h`}
                  to="/foco"
                  hint={`${data.activity.reduce((s, a) => s + (a.sessions ?? 0), 0)} sessões`}
                />
              </div>

              <HighlightCard
                title={`OKRs · ${quarter}`}
                empty={shownOkrs.length === 0}
              >
                {shownOkrs.map((o) => {
                  const pct = Math.round(okrProgress(o) * 100);
                  return (
                    <Link
                      key={o.id}
                      to="/objetivos"
                      className="block space-y-1.5 rounded-md border p-3 transition hover:border-primary"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">
                          {o.objective}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pct >= 70
                              ? "bg-emerald-500"
                              : pct >= 40
                                ? "bg-amber-500"
                                : "bg-primary/60"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </HighlightCard>

              <ModuleHub group="Gestão" />
            </>
          );
        })()
      )}
    </GroupShell>
  );
}
