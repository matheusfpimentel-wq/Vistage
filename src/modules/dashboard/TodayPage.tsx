import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Film,
  Loader2,
  Music,
  PartyPopper,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorkSessionWidget } from "@/modules/foco/WorkSessionWidget";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { gigDisplayName } from "@/modules/gigs/displayName";
import { listTasks } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { listContent } from "@/modules/content/api";
import type { Content } from "@/modules/content/types";
import { listClasses } from "@/modules/classes/api";
import type { ClassWithStudent } from "@/modules/classes/api";
import { listParties } from "@/modules/parties/api";
import type { PartyDeserialized } from "@/modules/parties/types";
import { triggerQuickCapture } from "@/lib/shortcuts";
import { DATA_CHANGED } from "@/lib/events";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

type Data = {
  gigs: Gig[];
  tasks: Task[];
  content: Content[];
  classes: ClassWithStudent[];
  parties: PartyDeserialized[];
};

type AgendaType = "gig" | "aula" | "tarefa" | "conteudo" | "festa";

type AgendaItem = {
  key: string;
  type: AgendaType;
  title: string;
  subtitle?: string;
  time: string | null;
  route: string;
};

const TYPE_META: Record<
  AgendaType,
  { label: string; icon: typeof Music; cls: string }
> = {
  gig: { label: "GIG", icon: Music, cls: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30" },
  aula: { label: "Aula", icon: BookOpen, cls: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
  tarefa: { label: "Tarefa", icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  conteudo: { label: "Conteúdo", icon: Film, cls: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  festa: { label: "Festa", icon: PartyPopper, cls: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
};

function TypeBadge({ type }: { type: AgendaType }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        meta.cls
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

export function TodayPage() {
  const [data, setData] = useState<Data | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [gigs, tasks, content, classes, parties] = await Promise.all([
      listGigs(),
      listTasks(),
      listContent(),
      listClasses({ fromDate: todayISO(), toDate: todayISO() }),
      listParties(),
    ]);
    setData({ gigs, tasks, content, classes, parties });
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [load]);

  const today = todayISO();

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
          // ===== Precisa de atenção (overdue) =====
          const activeTasks = data.tasks.filter(
            (t) => t.status !== "Concluída" && t.status !== "Cancelada"
          );
          const overdueTasks = activeTasks.filter(
            (t) => t.due_date && t.due_date.slice(0, 10) < today
          );
          const gigsPendingDebrief = data.gigs.filter(
            (g) =>
              g.date.slice(0, 10) < today &&
              g.status !== "Cancelada" &&
              g.debrief_pending === 1
          );

          type Attention = { key: string; type: AgendaType; title: string; meta: string; route: string };
          const attention: Attention[] = [
            ...gigsPendingDebrief.map((g) => ({
              key: `gig-deb-${g.id}`,
              type: "gig" as AgendaType,
              title: gigDisplayName(g),
              meta: `debrief pendente · ${formatDate(g.date, "dd/MM")}`,
              route: "/gigs",
            })),
            ...overdueTasks.map((t) => ({
              key: `task-od-${t.id}`,
              type: "tarefa" as AgendaType,
              title: t.title,
              meta: `atrasada · ${formatDate(t.due_date, "dd/MM")}`,
              route: "/tarefas",
            })),
          ];

          // ===== Agenda de hoje =====
          const items: AgendaItem[] = [];

          for (const g of data.gigs) {
            if (g.date.slice(0, 10) === today && g.status !== "Cancelada") {
              items.push({
                key: `gig-${g.id}`,
                type: "gig",
                title: gigDisplayName(g),
                subtitle: g.venue_name,
                time: g.start_time,
                route: "/gigs",
              });
            }
          }

          for (const c of data.classes) {
            if (c.status === "Cancelada") continue;
            items.push({
              key: `class-${c.id}`,
              type: "aula",
              title: c.student_name,
              subtitle: c.subject ?? undefined,
              time: c.start_time,
              route: "/aulas",
            });
          }

          for (const t of activeTasks) {
            if (t.due_date && t.due_date.slice(0, 10) === today) {
              items.push({
                key: `task-${t.id}`,
                type: "tarefa",
                title: t.title,
                subtitle: t.category ?? undefined,
                time: null,
                route: "/tarefas",
              });
            }
          }

          for (const c of data.content) {
            if (
              c.publish_date?.slice(0, 10) === today &&
              c.status !== "Publicado" &&
              c.status !== "Arquivado"
            ) {
              items.push({
                key: `content-${c.id}`,
                type: "conteudo",
                title: c.title,
                subtitle: c.networks.join(", ") || undefined,
                time: null,
                route: "/conteudo",
              });
            }
          }

          for (const p of data.parties) {
            if (p.date?.slice(0, 10) === today && p.status !== "Cancelada") {
              items.push({
                key: `party-${p.id}`,
                type: "festa",
                title: p.title,
                subtitle: p.venue_name ?? undefined,
                time: null,
                route: "/festas",
              });
            }
          }

          const timed = items
            .filter((i) => i.time)
            .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
          const untimed = items.filter((i) => !i.time);

          const renderItem = (i: AgendaItem) => (
            <button
              key={i.key}
              type="button"
              onClick={() => navigate(i.route)}
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left transition hover:border-primary"
            >
              <TypeBadge type={i.type} />
              {i.time && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {i.time}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{i.title}</div>
                {i.subtitle && (
                  <div className="truncate text-xs text-muted-foreground">
                    {i.subtitle}
                  </div>
                )}
              </div>
            </button>
          );

          return (
            <>
              {/* Precisa de atenção */}
              {attention.length > 0 && (
                <Card className="border-destructive/40 bg-destructive/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Precisa de atenção
                      <Badge variant="outline" className="text-xs">
                        {attention.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {attention.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => navigate(a.route)}
                        className="flex w-full items-center gap-3 rounded-md border border-destructive/30 bg-background p-2.5 text-left transition hover:border-destructive"
                      >
                        <TypeBadge type={a.type} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {a.title}
                          </div>
                          <div className="truncate text-xs text-destructive">
                            {a.meta}
                          </div>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Agenda de hoje */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarClock className="h-4 w-4 text-primary" />
                    Agenda de hoje
                    <Badge variant="outline" className="text-xs">
                      {items.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      <p className="text-sm font-medium">
                        Nada agendado para hoje
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Aproveite pra adiantar uma track ou um conteúdo.
                      </p>
                    </div>
                  ) : (
                    <>
                      {timed.length > 0 && (
                        <div className="space-y-1.5">{timed.map(renderItem)}</div>
                      )}
                      {untimed.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-medium text-muted-foreground">
                            Sem horário
                          </div>
                          {untimed.map(renderItem)}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()
      )}
    </div>
  );
}
