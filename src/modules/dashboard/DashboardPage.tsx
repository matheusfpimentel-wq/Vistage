import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  Star,
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
import { listGigs, loadInsights, type GigInsights } from "@/modules/gigs/api";
import { type Gig } from "@/modules/gigs/types";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { PrepProgressMini } from "@/modules/gigs/components/PrepChecklist";
import { parsePrepState, prepProgress } from "@/modules/gigs/prep";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listUpcoming } from "@/modules/tasks/api";
import { PriorityBadge } from "@/modules/tasks/components/PriorityBadge";
import type { Task } from "@/modules/tasks/types";
import { formatDate, formatRating, todayISO } from "@/lib/format";

export function DashboardPage() {
  const [insights, setInsights] = useState<GigInsights | null>(null);
  const [upcoming, setUpcoming] = useState<Gig[]>([]);
  const [pending, setPending] = useState<Gig[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);

  useEffect(() => {
    void (async () => {
      const today = todayISO();
      const [ins, all, tasks] = await Promise.all([
        loadInsights(),
        listGigs(),
        listUpcoming(5),
      ]);
      setInsights(ins);
      setUpcoming(
        all
          .filter(
            (g) =>
              g.date >= today &&
              g.status !== "Concluída" &&
              g.status !== "Cancelada"
          )
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3)
      );
      setPending(all.filter((g) => g.debrief_pending === 1).slice(0, 5));
      setUpcomingTasks(tasks);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          Resumo do seu negócio musical.
        </p>
      </div>

      {/* alerta de debriefs pendentes */}
      {pending.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {pending.length} GIG{pending.length > 1 ? "s" : ""} com debrief pendente
            </CardTitle>
            <CardDescription>
              O coração do sistema é registrar o que aconteceu — finalize quando puder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {pending.map((g) => (
              <Link
                key={g.id}
                to="/gigs"
                className="flex items-center justify-between rounded-md border bg-background p-2 text-sm transition hover:border-amber-500/60"
              >
                <div>
                  <div className="font-medium">{g.venue_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(g.date)}
                  </div>
                </div>
                <Badge variant="warning">finalizar</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<CalendarRange className="h-4 w-4" />}
          label="GIGs totais"
          value={insights?.totalCount.toString() ?? "—"}
        />
        <StatCard
          icon={<Star className="h-4 w-4 text-amber-500" />}
          label="Avaliação média"
          value={
            insights?.averageRating !== null && insights?.averageRating !== undefined
              ? formatRating(insights.averageRating)
              : "—"
          }
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Debriefs pendentes"
          value={insights?.pendingDebriefs.toString() ?? "—"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas GIGs</CardTitle>
            <CardDescription>
              As 3 próximas com data, local e status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sem GIGs futuras agendadas.{" "}
                <Button asChild variant="dark" size="sm" className="ml-2">
                  <Link to="/gigs">Criar uma</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((g) => {
                  const prep = parsePrepState(g.prep_state);
                  const { done, total } = prepProgress(prep);
                  return (
                    <Link
                      key={g.id}
                      to="/gigs"
                      className="block rounded-md border p-3 space-y-2 transition hover:border-primary hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{gigDisplayName(g)}</div>
                          <div className="text-xs text-muted-foreground">
                            {g.venue_name} · {formatDate(g.date)}
                            {g.main_goal && ` · 🎯 ${g.main_goal}`}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Tarefas (próximos 7 dias)
            </CardTitle>
            <CardDescription>
              O que vence nessa semana e ainda está em aberto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingTasks.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sem tarefas vencendo essa semana.{" "}
                <Button asChild variant="dark" size="sm" className="ml-2">
                  <Link to="/tarefas">Criar uma</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map((t) => (
                  <Link
                    key={t.id}
                    to="/tarefas"
                    className="flex items-center justify-between rounded-md border p-3 transition hover:border-primary"
                  >
                    <div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {t.due_date ? formatDate(t.due_date) : "—"}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
