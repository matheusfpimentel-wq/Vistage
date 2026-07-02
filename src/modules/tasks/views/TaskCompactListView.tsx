import { CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";
import type { Task } from "../types";
import { formatDate } from "@/lib/format";
import { urgencyLevel, type UrgencyLevel } from "@/lib/urgency";
import { UrgencyMark } from "@/components/ui/urgency-mark";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  /** Cria uma nova tarefa — CTA no estado vazio. */
  onCreate?: () => void;
};

function taskUrgency(t: Task): UrgencyLevel | null {
  if (t.status === "Concluída" || t.status === "Cancelada") return null;
  return urgencyLevel(t.due_date, "deadline");
}

/**
 * Lista COMPACTA — uma linha por tarefa (densa), pra varrer muita coisa rápido.
 * Sem descrição/tags/ações em lote; clique no título edita, checkbox conclui.
 */
export function TaskCompactListView({ tasks, onEdit, onToggleDone, onCreate }: Props) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        action={
          onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-md border">
      {tasks.map((t, i) => {
        const level = taskUrgency(t);
        const overdue = level === "overdue";
        const done = t.status === "Concluída";
        return (
          <div
            key={t.id}
            className={cn(
              "flex cursor-pointer items-center gap-2 px-2.5 py-1 text-sm transition-colors hover:bg-muted/40",
              i > 0 && "border-t",
              overdue && "bg-destructive/5"
            )}
            onClick={() => onEdit(t)}
            title="Clique pra editar"
          >
            <input
              type="checkbox"
              checked={done}
              onChange={() => onToggleDone(t)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-input accent-primary"
              aria-label={done ? "Reabrir" : "Marcar como concluída"}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(t);
              }}
              className={cn(
                "flex-1 truncate text-left hover:underline",
                done && "text-muted-foreground line-through"
              )}
              title={t.title}
            >
              {t.title}
            </button>
            {t.category && (
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {t.category}
              </span>
            )}
            {t.due_date && (
              level === "overdue" || level === "soon" ? (
                <UrgencyMark
                  level={level}
                  label={formatDate(t.due_date)}
                  className="shrink-0 text-xs font-medium tabular-nums"
                />
              ) : (
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {formatDate(t.due_date)}
                </span>
              )
            )}
            <span className="shrink-0">
              <PriorityBadge priority={t.priority} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
