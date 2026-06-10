import { useState } from "react";
import { CalendarClock, CheckSquare, ChevronDown, ChevronRight, Clock, Coffee, Pencil, RotateCcw, Trash2, Zap } from "lucide-react";
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

type EnergyGroup = "alta" | "media" | "baixa" | "concluidas";

function getEnergyGroup(task: Task): EnergyGroup {
  if (task.status === "Concluída" || task.status === "Cancelada") return "concluidas";
  // Use energy_required when set, otherwise fall back to priority
  if (task.energy_required != null) {
    if (task.energy_required >= 4) return "alta";
    if (task.energy_required >= 2) return "media";
    return "baixa";
  }
  if (task.priority === "Urgente" || task.priority === "Alta") return "alta";
  if (task.priority === "Média") return "media";
  return "baixa";
}

function dueDateSortKey(task: Task): string {
  // overdue / has date sorts before no date; null sorts last
  if (!task.due_date) return "9999-99-99";
  return task.due_date;
}

function isOverdue(t: Task): boolean {
  return (
    !!t.due_date &&
    t.due_date < todayISO() &&
    t.status !== "Concluída" &&
    t.status !== "Cancelada"
  );
}

const GROUP_META: Record<
  EnergyGroup,
  {
    label: string;
    hint: string;
    icon: React.ReactNode;
    iconClass: string;
  }
> = {
  alta: {
    label: "Alta energia",
    hint: "Faça quando estiver mais disposto",
    icon: <Zap className="h-4 w-4" />,
    iconClass: "text-amber-500",
  },
  media: {
    label: "Energia média",
    hint: "Nível de foco moderado",
    icon: <Clock className="h-4 w-4" />,
    iconClass: "text-sky-500",
  },
  baixa: {
    label: "Baixa energia",
    hint: "Pode fazer no piloto automático",
    icon: <Coffee className="h-4 w-4" />,
    iconClass: "text-emerald-500",
  },
  concluidas: {
    label: "Concluídas",
    hint: "",
    icon: <CheckSquare className="h-4 w-4" />,
    iconClass: "text-muted-foreground",
  },
};

const GROUP_ORDER: EnergyGroup[] = ["alta", "media", "baixa", "concluidas"];

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

function EnergyGroupSection({
  groupKey,
  tasks,
  onEdit,
  onToggleDone,
  onDelete,
}: {
  groupKey: EnergyGroup;
  tasks: Task[];
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [open, setOpen] = useState(true);
  const meta = GROUP_META[groupKey];

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
        <span className={cn(meta.iconClass)}>{meta.icon}</span>
        <span>{meta.label}</span>
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
        {meta.hint && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {meta.hint}
          </span>
        )}
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

export function TaskEnergyView({ tasks, onEdit, onToggleDone, onDelete }: Props) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        description="Crie uma nova tarefa ou ajuste os filtros."
      />
    );
  }

  const grouped: Record<EnergyGroup, Task[]> = { alta: [], media: [], baixa: [], concluidas: [] };
  for (const t of tasks) {
    grouped[getEnergyGroup(t)].push(t);
  }

  // Sort each group by due_date ASC (overdue first), null last
  for (const key of GROUP_ORDER) {
    grouped[key].sort((a, b) => dueDateSortKey(a).localeCompare(dueDateSortKey(b)));
  }

  const hasAny = GROUP_ORDER.some((k) => grouped[k].length > 0);
  if (!hasAny) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        description="Crie uma nova tarefa ou ajuste os filtros."
      />
    );
  }

  return (
    <div className="space-y-4">
      {GROUP_ORDER.map((key) => {
        if (grouped[key].length === 0) return null;
        return (
          <EnergyGroupSection
            key={key}
            groupKey={key}
            tasks={grouped[key]}
            onEdit={onEdit}
            onToggleDone={onToggleDone}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}
