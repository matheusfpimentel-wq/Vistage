import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { TaskForm } from "@/modules/tasks/forms/TaskForm";
import { TaskEisenhowerView } from "@/modules/tasks/views/TaskEisenhowerView";
import {
  completeAndRecur,
  listTasks,
  updateTask,
} from "@/modules/tasks/api";
import {
  type EisenhowerQuadrant,
  type Task,
  type TaskStatus,
} from "@/modules/tasks/types";

// ============================================================
// Eisenhower — reaproveita a MESMA view e base de dados de Tarefas
// (coluna tasks.eisenhower_quadrant). A matriz continua existindo em Tarefas;
// aqui é só uma segunda superfície, com a fiação replicada do TasksPage.
// ============================================================

export function EisenhowerSection() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listTasks();
      setTasks(data);
    } catch (e) {
      toast.error(`Erro ao carregar tarefas: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setFormOpen(true);
  }

  async function handleToggleDone(task: Task) {
    if (task.status !== "Concluída" && task.recurrence) {
      const newId = await completeAndRecur(task);
      if (newId) toast.success("Concluída. Próxima recorrência criada");
    } else {
      const next: TaskStatus =
        task.status === "Concluída" ? "A fazer" : "Concluída";
      await updateTask({ id: task.id, status: next });
    }
    await refresh();
  }

  async function handleSetQuadrant(task: Task, quadrant: EisenhowerQuadrant) {
    await updateTask({ id: task.id, eisenhower_quadrant: quadrant });
    await refresh();
  }

  if (!tasks) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <TaskEisenhowerView
        tasks={tasks}
        onEdit={openEdit}
        onToggleDone={handleToggleDone}
        onSetQuadrant={handleSetQuadrant}
        onCreate={openCreate}
      />
      <TaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        onSaved={() => void refresh()}
      />
    </>
  );
}
