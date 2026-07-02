import { useState } from "react";
import { CalendarClock, CheckSquare, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityBadge } from "../components/PriorityBadge";
import { TaskStatusBadge } from "../components/TaskStatusBadge";
import { TASK_STATUSES, type Task, type TaskStatus } from "../types";
import { formatDate } from "@/lib/format";
import { urgencyLevel, type UrgencyLevel } from "@/lib/urgency";
import { UrgencyMark } from "@/components/ui/urgency-mark";
import { cn } from "@/lib/utils";
import { INTERACTIVE_ROW_CLASS, interactiveRowProps } from "@/lib/interactiveRow";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Cria uma nova tarefa — mostrado como CTA no estado vazio. */
  onCreate?: () => void;
  /** Ações em lote — opcionais. Recebem as tarefas selecionadas. */
  onBulkComplete?: (tasks: Task[]) => void;
  onBulkSetStatus?: (tasks: Task[], status: TaskStatus) => void;
  onBulkDelete?: (tasks: Task[]) => void;
};

function taskUrgency(t: Task): UrgencyLevel | null {
  if (t.status === "Concluída" || t.status === "Cancelada") return null;
  return urgencyLevel(t.due_date, "deadline");
}

export function TaskListView({
  tasks,
  onEdit,
  onToggleDone,
  onDelete,
  onCreate,
  onBulkComplete,
  onBulkSetStatus,
  onBulkDelete,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const bulkEnabled = !!(onBulkComplete || onBulkSetStatus || onBulkDelete);

  // Só conta as selecionadas que ainda estão visíveis (filtros podem ter mudado).
  const selectedTasks = tasks.filter((t) => selected.has(t.id));
  const hasSelection = selectedTasks.length > 0;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clear() {
    setSelected(new Set());
  }

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
    <div className="space-y-1.5">
      {/* Barra de ações em lote */}
      {bulkEnabled && hasSelection && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <span className="text-sm font-medium">
            {selectedTasks.length} selecionada{selectedTasks.length > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {onBulkComplete && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onBulkComplete(selectedTasks);
                  clear();
                }}
              >
                <CheckSquare className="h-3.5 w-3.5" /> Concluir
              </Button>
            )}
            {onBulkSetStatus && (
              <Select
                value=""
                onValueChange={(v) => {
                  onBulkSetStatus(selectedTasks, v as TaskStatus);
                  clear();
                }}
              >
                <SelectTrigger className="h-8 w-36">
                  <SelectValue placeholder="Mudar status…" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {onBulkDelete && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onBulkDelete(selectedTasks);
                  clear();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clear}>
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </div>
      )}

      {tasks.map((t) => {
        const level = taskUrgency(t);
        const overdue = level === "overdue";
        const done = t.status === "Concluída";
        const isSel = selected.has(t.id);
        return (
          <div
            key={t.id}
            className={cn(
              "group flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40",
              INTERACTIVE_ROW_CLASS,
              overdue && "border-destructive/40 bg-destructive/5",
              isSel && "bg-primary/5 ring-1 ring-primary/40"
            )}
            {...interactiveRowProps(() => onEdit(t))}
            title="Clique pra editar"
          >
            {/* Caixa de SELEÇÃO — revelada no hover (ou sempre, com algo selecionado) */}
            {bulkEnabled && (
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggle(t.id)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "mt-0.5 h-4 w-4 cursor-pointer rounded border-input accent-primary transition-opacity",
                  !isSel && !hasSelection && "opacity-0 group-hover:opacity-100 focus:opacity-100"
                )}
                aria-label="Selecionar tarefa"
              />
            )}

            {/* Caixa de CONCLUÍDA */}
            <input
              type="checkbox"
              checked={done}
              onChange={() => onToggleDone(t)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input accent-primary"
              aria-label={done ? "Reabrir" : "Marcar como concluída"}
            />

            <div className="flex-1 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(t);
                  }}
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
                  level === "overdue" || level === "soon" ? (
                    <UrgencyMark
                      level={level}
                      label={formatDate(t.due_date)}
                      className="font-medium tabular-nums"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(t.due_date)}
                    </span>
                  )
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

            <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
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
