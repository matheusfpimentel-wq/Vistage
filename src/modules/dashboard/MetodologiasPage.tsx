import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Target, CheckSquare, CalendarRange, Music, Wallet, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DATA_CHANGED } from "@/lib/events";
import { formatCurrency, todayISO } from "@/lib/format";
import { listOkrs, currentQuarter, okrProgress, type Okr } from "@/modules/objetivos/api";
import { listTasks } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig, GigStatus } from "@/modules/gigs/types";
import { listTracks } from "@/modules/music/api";
import type { TrackWithProject } from "@/modules/music/types";
import { loadFinanceInsights, type FinanceInsights } from "@/modules/finance/api";
import { listSessions, type WorkSession } from "@/modules/foco/api";

type Stats = {
  okrs: Okr[];
  tasks: Task[];
  gigs: Gig[];
  tracks: TrackWithProject[];
  finance: FinanceInsights | null;
  focusMinutesThisWeek: number;
};

async function loadStats(): Promise<Stats> {
  const today = todayISO();
  const weekStart = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0, 10);
  })();

  const [okrs, tasks, gigs, tracks, finance, sessions] = await Promise.all([
    listOkrs(),
    listTasks(),
    listGigs(),
    listTracks(),
    loadFinanceInsights().catch(() => null as FinanceInsights | null),
    listSessions(200).catch((): WorkSession[] => []),
  ]);

  const focusMinutesThisWeek = sessions
    .filter((s) => s.started_at >= weekStart && s.ended_at)
    .reduce((acc, s) => {
      if (!s.ended_at) return acc;
      const mins = Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
      return acc + mins;
    }, 0);

  return { okrs, tasks, gigs, tracks, finance, focusMinutesThisWeek };
}

export function MetodologiasPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void loadStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const q = currentQuarter();
  const qOkrs = stats.okrs.filter((o) => o.quarter === q);

  // Tasks
  const today = todayISO();
  const overdueTasks = stats.tasks.filter(
    (t) => t.status !== "Concluída" && t.due_date && t.due_date < today
  );
  const dueSoonTasks = stats.tasks.filter(
    (t) => t.status !== "Concluída" && t.due_date && t.due_date >= today
  );
  const inProgressTasks = stats.tasks.filter((t) => t.status === "Em andamento");
  const doneTasks = stats.tasks.filter((t) => t.status === "Concluída");

  // GIG funnel
  const gigByStatus = stats.gigs.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = (acc[g.status] ?? 0) + 1;
    return acc;
  }, {});
  const gigTotal = stats.gigs.length;

  // Track pipeline
  const trackByStage = stats.tracks.reduce<Record<string, number>>((acc, t) => {
    acc[t.current_stage] = (acc[t.current_stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Metodologias de Gestão</h2>
          <p className="text-sm text-muted-foreground">
            Uma visão integrada dos seus frameworks de gestão — OKRs, GTD, pipeline, finanças e foco.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} aria-label="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* OKRs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" />
            OKRs · {q}
          </CardTitle>
          <CardDescription>
            {qOkrs.length === 0
              ? "Nenhum OKR definido para este trimestre."
              : `${qOkrs.filter((o) => okrProgress(o) >= 0.7).length} de ${qOkrs.length} objetivos acima de 70%`}
          </CardDescription>
        </CardHeader>
        {qOkrs.length > 0 && (
          <CardContent className="space-y-4">
            {qOkrs.map((o) => {
              const pct = Math.round(okrProgress(o) * 100);
              return (
                <div key={o.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium leading-tight">{o.objective}</span>
                    <span className={cn("shrink-0 text-xs tabular-nums font-semibold", pct >= 70 ? "text-emerald-500" : pct >= 40 ? "text-amber-500" : "text-destructive")}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-all", pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-destructive/60")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {o.key_results && o.key_results.length > 0 && (
                    <ul className="ml-3 space-y-0.5">
                      {o.key_results.map((kr, i) => {
                        const krPct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
                        return (
                          <li key={i} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{kr.description}</span>
                            <span className="shrink-0 tabular-nums">{kr.current}/{kr.target} ({krPct}%)</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
            <Link to="/objetivos" className="text-xs text-primary hover:underline">
              Gerenciar OKRs →
            </Link>
          </CardContent>
        )}
      </Card>

      {/* GTD — saúde das tarefas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-primary" />
            Saúde das tarefas (GTD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricBox
              label="Atrasadas"
              value={overdueTasks.length}
              tone={overdueTasks.length > 0 ? "danger" : "success"}
            />
            <MetricBox label="Em andamento" value={inProgressTasks.length} />
            <MetricBox label="Com prazo futuro" value={dueSoonTasks.length} />
            <MetricBox label="Concluídas" value={doneTasks.length} tone="success" />
          </div>
          {overdueTasks.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium text-destructive">Tarefas atrasadas:</p>
              <ul className="space-y-0.5">
                {overdueTasks.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 tabular-nums text-destructive">{t.due_date}</span>
                  </li>
                ))}
                {overdueTasks.length > 5 && (
                  <li className="text-xs text-muted-foreground">…e mais {overdueTasks.length - 5}</li>
                )}
              </ul>
            </div>
          )}
          <Link to="/tarefas" className="mt-3 block text-xs text-primary hover:underline">
            Ver todas as tarefas →
          </Link>
        </CardContent>
      </Card>

      {/* GIG funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" />
            Funil de GIGs
          </CardTitle>
          <CardDescription>{gigTotal} GIGs no total</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(["Proposta", "Confirmada", "Concluída", "Cancelada"] as GigStatus[]).map((status) => {
              const count = gigByStatus[status] ?? 0;
              const pct = gigTotal > 0 ? Math.round((count / gigTotal) * 100) : 0;
              const tones: Record<string, string> = {
                Proposta: "bg-amber-400",
                Confirmada: "bg-emerald-500",
                Concluída: "bg-primary",
                Cancelada: "bg-muted-foreground/40",
              };
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{status}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                    <div className={cn("h-full rounded-full", tones[status])} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums font-medium">{count}</span>
                </div>
              );
            })}
          </div>
          <Link to="/gigs" className="mt-3 block text-xs text-primary hover:underline">
            Ver GIGs →
          </Link>
        </CardContent>
      </Card>

      {/* Track pipeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Music className="h-4 w-4 text-primary" />
            Pipeline musical
          </CardTitle>
          <CardDescription>{stats.tracks.length} tracks ativas</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.tracks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma track cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(trackByStage).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
                <div key={stage} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{stage}</span>
                  <span className="tabular-nums font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
          <Link to="/musica" className="mt-3 block text-xs text-primary hover:underline">
            Ver produção musical →
          </Link>
        </CardContent>
      </Card>

      {/* Financeiro */}
      {stats.finance && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Saúde financeira
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricBox
                label="Receita do mês"
                value={formatCurrency(stats.finance.monthIncome)}
                tone="success"
              />
              <MetricBox
                label="Despesa do mês"
                value={formatCurrency(stats.finance.monthExpense)}
                tone={stats.finance.monthExpense > stats.finance.monthIncome ? "danger" : "default"}
              />
              <MetricBox
                label="Saldo do mês"
                value={formatCurrency(stats.finance.monthBalance)}
                tone={stats.finance.monthBalance >= 0 ? "success" : "danger"}
              />
            </div>
            <Link to="/financeiro" className="mt-3 block text-xs text-primary hover:underline">
              Ver financeiro →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Foco */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Energia & Foco
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <MetricBox
              label="Minutos de foco esta semana"
              value={stats.focusMinutesThisWeek}
              tone={stats.focusMinutesThisWeek >= 120 ? "success" : "default"}
            />
            <MetricBox
              label="Horas de foco esta semana"
              value={`${(stats.focusMinutesThisWeek / 60).toFixed(1)}h`}
              tone={stats.focusMinutesThisWeek >= 120 ? "success" : "default"}
            />
          </div>
          <Link to="/foco" className="mt-3 block text-xs text-primary hover:underline">
            Ver sessões de foco →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-emerald-500"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
