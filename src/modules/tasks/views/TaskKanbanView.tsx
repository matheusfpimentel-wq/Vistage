import { useState } from "react";
import { CalendarClock, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "../components/PriorityBadge";
import { TASK_STATUSES, type Task, type TaskStatus } from "../types";
import { formatDate } from "@/lib/format";
import { urgencyLevel } from "@/lib/urgency";
import { UrgencyMark } from "@/components/ui/urgency-mark";
import { readableTextColor } from "@/lib/contrast";
import { cn } from "@/lib/utils";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/kanbanDnd";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onMove?: (id: number, status: TaskStatus) => void;
};

// Cor por coluna (preferência da máquina, não viaja no .vistage).
const COLORS_KEY = "vistage.tasks.kanbanColors";
function loadColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(COLORS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function TaskKanbanView({ tasks, onEdit, onMove }: Props) {
  const [colors, setColors] = useState<Record<string, string>>(loadColors);

  function setColor(status: TaskStatus, hex: string | null) {
    setColors((prev) => {
      const next = { ...prev };
      if (hex) next[status] = hex;
      else delete next[status];
      try {
        localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      } catch {
        /* storage indisponível */
      }
      return next;
    });
  }

  const columns = TASK_STATUSES.map((status) => ({
    status,
    tasks: tasks.filter((t) => t.status === status),
  }));

  return (
    // §6 — sempre 4 colunas, mesmo em janela estreita: as colunas encolhem pra
    // caber (min-w-0 nas colunas + gap menor no estreito) em vez de cair pra 2.
    <KanbanBoard
      onMove={(id, status) => onMove?.(id, status as TaskStatus)}
      className="grid grid-cols-4 gap-2 sm:gap-3"
    >
      {columns.map((col) => (
        <Column
          key={col.status}
          status={col.status}
          tasks={col.tasks}
          color={colors[col.status] ?? null}
          onColor={setColor}
          onEdit={onEdit}
        />
      ))}
    </KanbanBoard>
  );
}

function Column({
  status,
  tasks,
  color,
  onColor,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  color: string | null;
  onColor: (status: TaskStatus, hex: string | null) => void;
  onEdit: (task: Task) => void;
}) {
  // Texto do card em preto/branco pra manter AA sobre a cor escolhida (§8.2).
  const cardText = color ? readableTextColor(color) : undefined;

  return (
    <KanbanColumn status={status} className="flex min-w-0 flex-col rounded-md border bg-muted/30">
      <div className="flex items-center justify-between gap-1 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {color && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          )}
          <span className="truncate text-sm font-medium">{status}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline">{tasks.length}</Badge>
          <label
            className="relative inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
            title="Cor dos cards desta coluna"
          >
            <input
              type="color"
              value={color ?? "#3b82f6"}
              onChange={(e) => onColor(status, e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Cor da coluna ${status}`}
            />
            <Palette className="h-3.5 w-3.5" />
          </label>
          {color && (
            <button
              type="button"
              onClick={() => onColor(status, null)}
              className="text-sm leading-none text-muted-foreground hover:text-foreground"
              title="Limpar cor"
              aria-label="Limpar cor"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {tasks.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem tarefas
          </div>
        )}
        {tasks.map((t) => {
          const level =
            t.status === "Concluída" || t.status === "Cancelada"
              ? null
              : urgencyLevel(t.due_date, "deadline");
          const overdue = level === "overdue";
          return (
            <KanbanCard
              key={t.id}
              id={t.id}
              onClick={() => onEdit(t)}
              className={cn(
                "w-full overflow-hidden rounded-md border text-left text-sm transition hover:border-primary",
                overdue && "border-destructive/40"
              )}
            >
              <div
                className={cn("p-2", !color && "bg-background")}
                style={color ? { backgroundColor: color, color: cardText } : undefined}
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
                  {t.due_date &&
                    (level === "overdue" || level === "soon" ? (
                      <UrgencyMark
                        level={level}
                        label={formatDate(t.due_date, "dd/MM")}
                        className="text-xs font-medium tabular-nums"
                      />
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs tabular-nums",
                          !color && "text-muted-foreground"
                        )}
                      >
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(t.due_date, "dd/MM")}
                      </span>
                    ))}
                </div>
              </div>
            </KanbanCard>
          );
        })}
      </div>
    </KanbanColumn>
  );
}
