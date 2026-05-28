import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "../components/PriorityBadge";
import { TASK_STATUSES, type Task, type TaskStatus } from "../types";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
};

export function TaskKanbanView({ tasks, onEdit }: Props) {
  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((col) => (
        <Column key={col.status} status={col.status} tasks={col.tasks} onEdit={onEdit} />
      ))}
    </div>
  );
}

function Column({
  status,
  tasks,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
}) {
  return (
    <div className="flex flex-col rounded-md border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">{status}</div>
        <Badge variant="outline">{tasks.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {tasks.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem tarefas
          </div>
        )}
        {tasks.map((t) => {
          const overdue =
            t.due_date &&
            t.due_date < todayISO() &&
            t.status !== "Concluída" &&
            t.status !== "Cancelada";
          return (
            <button
              key={t.id}
              onClick={() => onEdit(t)}
              className={cn(
                "w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary",
                overdue && "border-destructive/40"
              )}
            >
              <div className="font-medium">{t.title}</div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <PriorityBadge priority={t.priority} />
                  {t.category && (
                    <Badge variant="outline" className="text-xs">
                      {t.category}
                    </Badge>
                  )}
                </div>
                {t.due_date && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums",
                      overdue && "font-medium text-destructive"
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(t.due_date, "dd/MM")}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
