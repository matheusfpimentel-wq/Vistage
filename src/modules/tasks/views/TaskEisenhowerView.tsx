import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PriorityBadge } from "../components/PriorityBadge";
import type { EisenhowerQuadrant, Task } from "../types";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  /** Move a tarefa para um quadrante (drag-and-drop). */
  onSetQuadrant: (task: Task, quadrant: EisenhowerQuadrant) => void;
};

const QUADRANTS: {
  id: EisenhowerQuadrant;
  label: string;
  hint: string;
  cls: string;
  over: string;
}[] = [
  { id: "do", label: "Fazer agora", hint: "Urgente + importante", cls: "border-red-500/40 bg-red-500/5", over: "border-red-500 bg-red-500/15" },
  { id: "schedule", label: "Agendar", hint: "Importante, não urgente", cls: "border-sky-500/40 bg-sky-500/5", over: "border-sky-500 bg-sky-500/15" },
  { id: "delegate", label: "Delegar", hint: "Urgente, não importante", cls: "border-amber-500/40 bg-amber-500/5", over: "border-amber-500 bg-amber-500/15" },
  { id: "eliminate", label: "Eliminar / depois", hint: "Nem urgente nem importante", cls: "border-muted bg-muted/20", over: "border-foreground/40 bg-muted/50" },
];

/**
 * Classifica a tarefa no quadrante. Usa o quadrante salvo (eisenhower_quadrant);
 * se não houver, deriva: importante = prioridade Alta/Urgente; urgente = vence
 * hoje ou já passou. Assim a matriz é útil mesmo sem classificação manual.
 */
function quadrantOf(t: Task): EisenhowerQuadrant {
  if (t.eisenhower_quadrant) return t.eisenhower_quadrant;
  const important = t.priority === "Alta" || t.priority === "Urgente";
  const urgent = !!t.due_date && t.due_date <= todayISO();
  if (urgent && important) return "do";
  if (!urgent && important) return "schedule";
  if (urgent && !important) return "delegate";
  return "eliminate";
}

function TaskCard({
  task,
  onEdit,
  onToggleDone,
}: {
  task: Task;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  const done = task.status === "Concluída";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1 text-sm cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <input
        type="checkbox"
        checked={done}
        onChange={() => onToggleDone(task)}
        onPointerDown={(e) => e.stopPropagation()}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-input accent-primary"
        aria-label={done ? "Reabrir" : "Marcar como concluída"}
      />
      <button
        type="button"
        onClick={() => onEdit(task)}
        className={cn(
          "flex-1 truncate text-left hover:underline",
          done && "text-muted-foreground line-through"
        )}
        title={task.title}
      >
        {task.title}
      </button>
      <span className="shrink-0">
        <PriorityBadge priority={task.priority} />
      </span>
    </div>
  );
}

function DropZone({
  id,
  baseCls,
  overCls,
  children,
}: {
  id: EisenhowerQuadrant;
  baseCls: string;
  overCls: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-lg border p-3 transition-colors", isOver ? overCls : baseCls)}
    >
      {children}
    </div>
  );
}

export function TaskEisenhowerView({ tasks, onEdit, onToggleDone, onSetQuadrant }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // A matriz é uma ferramenta de decisão sobre o que fazer a seguir — tarefas
  // já executadas (concluídas/canceladas) só poluiriam os quadrantes.
  const open = tasks.filter((t) => t.status !== "Concluída" && t.status !== "Cancelada");

  if (open.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="Nenhuma tarefa por aqui"
        description="Crie uma nova tarefa ou ajuste os filtros."
      />
    );
  }

  const byQuad = new Map<EisenhowerQuadrant, Task[]>();
  for (const q of QUADRANTS) byQuad.set(q.id, []);
  for (const t of open) byQuad.get(quadrantOf(t))!.push(t);

  const activeTask = activeId != null ? open.find((t) => t.id === activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const task = open.find((t) => t.id === Number(active.id));
    if (!task) return;
    const target = over.id as EisenhowerQuadrant;
    if (quadrantOf(task) === target) return;
    onSetQuadrant(task, target);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <p className="mb-2 text-[11px] text-muted-foreground">
        Arraste as tarefas entre os quadrantes pra reclassificar.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {QUADRANTS.map((q) => {
          const list = byQuad.get(q.id) ?? [];
          return (
            <DropZone key={q.id} id={q.id} baseCls={q.cls} overCls={q.over}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{q.label}</div>
                  <div className="text-[11px] text-muted-foreground">{q.hint}</div>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Arraste tarefas pra cá.
                </p>
              ) : (
                <div className="space-y-1">
                  {list.map((t) => (
                    <TaskCard key={t.id} task={t} onEdit={onEdit} onToggleDone={onToggleDone} />
                  ))}
                </div>
              )}
            </DropZone>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm shadow-lg">
            <span className="flex-1 truncate">{activeTask.title}</span>
            <PriorityBadge priority={activeTask.priority} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
