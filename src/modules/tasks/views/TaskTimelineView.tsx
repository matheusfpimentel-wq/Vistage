import { CalendarClock, CalendarRange, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";
import { TaskStatusBadge } from "../components/TaskStatusBadge";
import { type Task } from "../types";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
};

type GroupId = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

const GROUP_ORDER: GroupId[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "none",
];

const GROUP_LABELS: Record<GroupId, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  tomorrow: "Amanhã",
  week: "Esta semana",
  later: "Mais tarde",
  none: "Sem data",
};

function addDaysISO(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isActive(t: Task): boolean {
  return t.status !== "Concluída" && t.status !== "Cancelada";
}

function groupFor(t: Task, today: string, tomorrow: string, weekEnd: string): GroupId {
  if (!t.due_date) return "none";
  const due = t.due_date.slice(0, 10);
  if (due < today) return isActive(t) ? "overdue" : "today";
  if (due === today) return "today";
  if (due === tomorrow) return "tomorrow";
  if (due <= weekEnd) return "week";
  return "later";
}

export function TaskTimelineView({ tasks, onEdit }: Props) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        description="Crie uma nova tarefa ou ajuste os filtros."
      />
    );
  }

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const weekEnd = addDaysISO(today, 7);

  const groups: Record<GroupId, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
    none: [],
  };

  for (const t of tasks) {
    groups[groupFor(t, today, tomorrow, weekEnd)].push(t);
  }

  // Ordena cada grupo por data (asc, nulls últimos)
  for (const id of GROUP_ORDER) {
    groups[id].sort((a, b) => {
      const da = a.due_date ?? "";
      const db = b.due_date ?? "";
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }

  const visible = GROUP_ORDER.filter((id) => groups[id].length > 0);

  return (
    <div className="space-y-6">
      {visible.map((id) => {
        const overdueGroup = id === "overdue";
        return (
          <section key={id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CalendarRange
                className={cn(
                  "h-4 w-4",
                  overdueGroup ? "text-destructive" : "text-muted-foreground"
                )}
              />
              <h3
                className={cn(
                  "text-sm font-semibold",
                  overdueGroup && "text-destructive"
                )}
              >
                {GROUP_LABELS[id]}
              </h3>
              <Badge variant="outline" className="text-xs">
                {groups[id].length}
              </Badge>
            </div>

            <div className="space-y-1.5">
              {groups[id].map((t) => {
                const done = t.status === "Concluída";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onEdit(t)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/40",
                      overdueGroup && "border-destructive/40 bg-destructive/5"
                    )}
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            done && "text-muted-foreground line-through"
                          )}
                        >
                          {t.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <TaskStatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {t.due_date && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 tabular-nums",
                              overdueGroup && "font-medium text-destructive"
                            )}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {formatDate(t.due_date)}
                          </span>
                        )}
                        {t.category && (
                          <Badge variant="outline">{t.category}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
