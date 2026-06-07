import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Circle,
  Film,
  Loader2,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkSessionWidget } from "@/modules/foco/WorkSessionWidget";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { StatusBadge } from "@/modules/gigs/components/StatusBadge";
import { listTasks, updateTask } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listContent } from "@/modules/content/api";
import type { Content } from "@/modules/content/types";
import { listClasses } from "@/modules/classes/api";
import type { ClassWithStudent } from "@/modules/classes/api";
import { Badge } from "@/components/ui/badge";
import { DATA_CHANGED } from "@/lib/events";
import { triggerQuickCapture } from "@/lib/shortcuts";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

type Data = { gigs: Gig[]; tasks: Task[]; content: Content[]; classes: ClassWithStudent[] };

export function TodayPage() {
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const [gigs, tasks, content, classes] = await Promise.all([
      listGigs(),
      listTasks(),
      listContent(),
      listClasses({ fromDate: todayISO(), toDate: todayISO() }),
    ]);
    setData({ gigs, tasks, content, classes });
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [load]);

  const today = todayISO();

  async function complete(t: Task) {
    await updateTask({ id: t.id, status: "Concluída" });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">
            {greeting()}, hora de focar.
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(today, "EEEE, dd 'de' MMMM")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={triggerQuickCapture}>
            <Zap className="h-3.5 w-3.5" /> Captura rápida
          </Button>
          <WorkSessionWidget />
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        (() => {
          const todaysGigs = data.gigs.filter(
            (g) => g.date.slice(0, 10) === today && g.status !== "Cancelada"
          );
          const nextGig = data.gigs
            .filter(
              (g) =>
                g.date > today &&
                g.status !== "Cancelada" &&
                g.status !== "Concluída"
            )
            .sort((a, b) => a.date.localeCompare(b.date))[0];

          const active = data.tasks.filter(
            (t) => t.status !== "Concluída" && t.status !== "Cancelada"
          );
          const overdue = active.filter((t) => t.due_date && t.due_date < today);
          const dueToday = active.filter((t) => t.due_date === today);
          const focusTasks = [...overdue, ...dueToday];

          const publishToday = data.content.filter(
            (c) =>
              c.publish_date?.slice(0, 10) === today &&
              c.status !== "Publicado" &&
              c.status !== "Arquivado"
          );

          const todaysClasses = data.classes.filter((c) => c.status !== "Cancelada");

          return (
            <>
              {/* GIGs de hoje / próxima */}
              {todaysGigs.length > 0 && (
                <Card className="border-primary/40 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      {todaysGigs.length === 1 ? "GIG de hoje" : "GIGs de hoje"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {todaysGigs.map((g) => (
                      <Link
                        key={g.id}
                        to="/gigs"
                        className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 transition hover:border-primary"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {gigDisplayName(g)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {g.venue_name}
                          </div>
                        </div>
                        <StatusBadge status={g.status} />
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Aulas de hoje */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Aulas de hoje
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {todaysClasses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma aula hoje.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {todaysClasses.map((c) => (
                        <Link
                          key={c.id}
                          to="/aulas"
                          className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-sm">{c.student_name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {c.start_time ? `${c.start_time} · ` : ""}{c.subject ?? "—"}
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs">{c.status}</Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tarefas para focar hoje */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>Para hoje</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {focusTasks.length} tarefa(s)
                      {overdue.length > 0 && (
                        <span className="text-destructive">
                          {" "}
                          · {overdue.length} atrasada(s)
                        </span>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {focusTasks.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      <p className="text-sm font-medium">Nada pendente para hoje</p>
                      <p className="text-xs text-muted-foreground">
                        Aproveite pra adiantar uma track ou um conteúdo.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {focusTasks.map((t) => {
                        const late = !!t.due_date && t.due_date < today;
                        return (
                          <div
                            key={t.id}
                            className="flex items-center gap-3 rounded-md border p-3"
                          >
                            <button
                              type="button"
                              onClick={() => void complete(t)}
                              className="shrink-0 text-muted-foreground transition hover:text-emerald-500"
                              aria-label="Concluir tarefa"
                              title="Concluir"
                            >
                              <Circle className="h-5 w-5" />
                            </button>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {t.title}
                            </span>
                            {late && (
                              <span className="shrink-0 text-xs font-medium text-destructive">
                                atrasada
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Publicar hoje */}
              {publishToday.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Film className="h-4 w-4 text-primary" /> Publicar hoje
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {publishToday.map((c) => (
                      <Link
                        key={c.id}
                        to="/conteudo"
                        className="flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {c.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.networks.join(", ") || c.status}
                        </span>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Próxima GIG (quando não há nada hoje) */}
              {todaysGigs.length === 0 && nextGig && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" />
                      Próxima GIG
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Link
                      to="/gigs"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border p-3 transition hover:border-primary"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {gigDisplayName(nextGig)}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {nextGig.venue_name} · {formatDate(nextGig.date)}
                        </div>
                      </div>
                      <StatusBadge status={nextGig.status} />
                    </Link>
                  </CardContent>
                </Card>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
