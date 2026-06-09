import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { TaskForm } from "./forms/TaskForm";
import { TaskListView } from "./views/TaskListView";
import { TaskKanbanView } from "./views/TaskKanbanView";
import { TaskTimelineView } from "./views/TaskTimelineView";
import { TaskSprintView } from "./views/TaskSprintView";
import { TaskEnergyView } from "./views/TaskEnergyView";
import {
  completeAndRecur,
  deleteTask,
  listTasks,
  updateTask,
  type TaskFilters,
  type TasksDateFilter,
} from "./api";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
} from "./types";
import { cn } from "@/lib/utils";
import { useNewItemShortcut } from "@/lib/shortcuts";

type StatusFilter = TaskStatus | "Todas";
type CategoryFilter = TaskCategory | "Todas";
type PriorityFilter = TaskPriority | "Todas";

const DATE_FILTERS: { id: TasksDateFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "overdue", label: "Atrasadas" },
  { id: "none", label: "Sem data" },
];

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<{
    status: StatusFilter;
    category: CategoryFilter;
    priority: PriorityFilter;
    search: string;
    date: TasksDateFilter;
  }>({
    status: "Todas",
    category: "Todas",
    priority: "Todas",
    search: "",
    date: "all",
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const queryFilters: TaskFilters = useMemo(
    () => ({
      status: filters.status,
      category: filters.category,
      priority: filters.priority,
      search: filters.search,
      date: filters.date,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    const data = await listTasks(queryFilters);
    setTasks(data);
  }, [queryFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  useNewItemShortcut(openCreate);

  function openEdit(task: Task) {
    setEditing(task);
    setFormOpen(true);
  }

  async function handleToggleDone(task: Task) {
    if (task.status !== "Concluída" && task.recurrence) {
      const newId = await completeAndRecur(task);
      if (newId) toast.success("Concluída — próxima recorrência criada");
    } else {
      const next: TaskStatus =
        task.status === "Concluída" ? "A fazer" : "Concluída";
      await updateTask({ id: task.id, status: next });
    }
    await refresh();
  }

  async function handleMove(id: number, status: TaskStatus) {
    await updateTask({ id, status });
    await refresh();
  }

  async function handleDelete(task: Task) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${task.title}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteTask(task.id);
    toast.success("Tarefa excluída");
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 bg-background pt-1 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar título ou descrição…"
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-72 pl-8"
            />
          </div>
          <Select
            value={filters.status}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, status: v as StatusFilter }))
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todos os status</SelectItem>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.category}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, category: v as CategoryFilter }))
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas categorias</SelectItem>
              {TASK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.priority}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, priority: v as PriorityFilter }))
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas prioridades</SelectItem>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova tarefa
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {DATE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilters((s) => ({ ...s, date: f.id }))}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition",
              filters.date === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Lista</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
          <TabsTrigger value="sprint">Sprint</TabsTrigger>
          <TabsTrigger value="energia">Energia</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <TaskListView
            tasks={tasks}
            onEdit={openEdit}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="kanban">
          <TaskKanbanView tasks={tasks} onEdit={openEdit} onMove={handleMove} />
        </TabsContent>

        <TabsContent value="timeline">
          <TaskTimelineView tasks={tasks} onEdit={openEdit} />
        </TabsContent>

        <TabsContent value="sprint">
          <TaskSprintView
            tasks={tasks}
            onEdit={openEdit}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="energia">
          <TaskEnergyView
            tasks={tasks}
            onEdit={openEdit}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

      <TaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
