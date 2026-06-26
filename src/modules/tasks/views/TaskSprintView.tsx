import { useState } from "react";
import { CalendarClock, CheckSquare, ChevronDown, ChevronRight, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";
import { TaskStatusBadge } from "../components/TaskStatusBadge";
import { type Task, type TaskPriority } from "../types";
import { formatDate, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Cria uma nova tarefa — CTA no estado vazio. */
  onCreate?: () => void;
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  Urgente: 0,
  Alta: 1,
  Média: 2,
  Baixa: 3,
};

function getWeekBounds(offsetWeeks: number): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  function toISO(d: Date) {
    return d.toISOString().slice(0, 10);
  }
  return { start: toISO(monday), end: toISO(sunday) };
}

type GroupKey = "esta" | "proxima" | "depois" | "sem_prazo";

function getGroup(task: Task): GroupKey {
  if (!task.due_date) return "sem_prazo";
  const today = todayISO();
  const thisWeek = getWeekBounds(0);
  const nextWeek = getWeekBounds(1);

  if (task.due_date >= thisWeek.start && task.due_date <= thisWeek.end) return "esta";
  if (task.due_date >= nextWeek.start && task.due_date <= nextWeek.end) return "proxima";
  if (task.due_date < today) return "esta"; // overdue counts as this week
  return "depois";
}

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "esta", label: "Esta semana" },
  { key: "proxima", label: "Próxima semana" },
  { key: "depois", label: "Depois" },
  { key: "sem_prazo", label: "Sem prazo" },
];

function isOverdue(t: Task): boolean {
  return (
    !!t.due_date &&
    t.due_date < todayISO() &&
    t.status !== "Concluída" &&
    t.status !== "Cancelada"
  );
}

function TaskRow({
  task,
  onEdit,
  onToggleDone,
  onDelete,
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const overdue = isOverdue(task);
  const done = task.status === "Concluída";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40",
        overdue && "border-destructive/40 bg-destructive/5",
        done && "opacity-60"
      )}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggleDone(task)}
        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-input accent-primary"
        aria-label={done ? "Reabrir" : "Marcar como concluída"}
      />

      <div className="flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className={cn(
              "text-left text-sm font-medium hover:underline",
              done && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </button>
          <div className="flex items-center gap-1.5">
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        {task.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums",
                overdue && "font-medium text-destructive"
              )}
            >
              <CalendarClock className="h-3 w-3" />
              {formatDate(task.due_date)}
              {overdue && " · atrasada"}
            </span>
          )}
          {task.category && <Badge variant="outline">{task.category}</Badge>}
          {task.recurrence && (
            <span className="inline-flex items-center gap-0.5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-400">
              <RotateCcw className="h-2.5 w-2.5" />
              {task.recurrence === "weekly" ? "Semanal" : "Mensal"}
            </span>
          )}
          {task.tags.map((tag) => (
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
          onClick={() => onEdit(task)}
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(task)}
          aria-label="Excluir"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function CollapsibleGroup({
  label,
  tasks,
  onEdit,
  onToggleDone,
  onDelete,
}: {
  label: string;
  tasks: Task[];
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span>{label}</span>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </button>

      {open && (
        <div className="space-y-1.5 pl-6">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onEdit={onEdit}
              onToggleDone={onToggleDone}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskSprintView({ tasks, onEdit, onToggleDone, onDelete, onCreate }: Props) {
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

  const grouped: Record<GroupKey, Task[]> = { esta: [], proxima: [], depois: [], sem_prazo: [] };
  for (const t of tasks) {
    grouped[getGroup(t)].push(t);
  }

  // Sort each group by priority
  for (const key of Object.keys(grouped) as GroupKey[]) {
    grouped[key].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  const nonEmpty = GROUPS.filter((g) => grouped[g.key].length > 0);

  if (nonEmpty.length === 0) {
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
    <div className="space-y-4">
      {GROUPS.map((g) => {
        if (grouped[g.key].length === 0) return null;
        return (
          <CollapsibleGroup
            key={g.key}
            label={g.label}
            tasks={grouped[g.key]}
            onEdit={onEdit}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}
