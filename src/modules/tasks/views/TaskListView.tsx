import { CalendarClock, CheckSquare, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  onToggleDone: (task: Task) => void;
  onDelete: (task: Task) => void;
};

function isOverdue(t: Task): boolean {
  return (
    !!t.due_date &&
    t.due_date < todayISO() &&
    t.status !== "Concluída" &&
    t.status !== "Cancelada"
  );
}

export function TaskListView({
  tasks,
  onEdit,
  onToggleDone,
  onDelete,
}: Props) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        description="Crie uma nova tarefa ou ajuste os filtros."
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {tasks.map((t) => {
        const overdue = isOverdue(t);
        const done = t.status === "Concluída";
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40",
              overdue && "border-destructive/40 bg-destructive/5"
            )}
          >
            <input
              type="checkbox"
              checked={done}
              onChange={() => onToggleDone(t)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input accent-primary"
              aria-label={done ? "Reabrir" : "Marcar como concluída"}
            />

            <div className="flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className={cn(
                    "text-left text-sm font-medium hover:underline",
                    done && "text-muted-foreground line-through"
                  )}
                >
                  {t.title}
                </button>
                <div className="flex items-center gap-1.5">
                  <TaskStatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
              </div>

              {t.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {t.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {t.due_date && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 tabular-nums",
                      overdue && "font-medium text-destructive"
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {formatDate(t.due_date)}
                    {overdue && " · atrasada"}
                  </span>
                )}
                {t.category && <Badge variant="outline">{t.category}</Badge>}
                {t.recurrence && (
                  <span className="inline-flex items-center gap-0.5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-400">
                    <RotateCcw className="h-2.5 w-2.5" />
                    {t.recurrence === "weekly" ? "Semanal" : "Mensal"}
                  </span>
                )}
                {t.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="opacity-70">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit(t)}
                aria-label="Editar"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDelete(t)}
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
