import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm";
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
import { TaskCompactListView } from "./views/TaskCompactListView";
import { TaskKanbanView } from "./views/TaskKanbanView";
import { TaskEisenhowerView } from "./views/TaskEisenhowerView";
import { TaskSprintView } from "./views/TaskSprintView";
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
  TASK_LINK_LABELS,
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type EisenhowerQuadrant,
  type Task,
  type TaskCategory,
  type TaskLinkType,
  type TaskPriority,
  type TaskStatus,
} from "./types";
import { cn } from "@/lib/utils";
import { useNewItemShortcut } from "@/lib/shortcuts";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import { useModuleView } from "@/lib/moduleView";
import { ListDensityToggle, useListDensity } from "@/components/shared/ListDensityToggle";

type StatusFilter = TaskStatus | "Todas";
type CategoryFilter = TaskCategory | "Todas";
type PriorityFilter = TaskPriority | "Todas";
type LinkFilter = TaskLinkType | "Todas";

const DATE_FILTERS: { id: TasksDateFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "overdue", label: "Atrasadas" },
  { id: "none", label: "Sem data" },
];

/** Conta quantas promessas de um lote falharam (para avisar de falha parcial em vez de engolir). */
function countFailures(results: PromiseSettledResult<unknown>[]): number {
  return results.filter((r) => r.status === "rejected").length;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<{
    status: StatusFilter;
    category: CategoryFilter;
    priority: PriorityFilter;
    search: string;
    date: TasksDateFilter;
    linkType: LinkFilter;
  }>({
    status: "Todas",
    category: "Todas",
    priority: "Todas",
    search: "",
    date: "all",
    linkType: "Todas",
  });

  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const queryFilters: TaskFilters = useMemo(
    () => ({
      status: filters.status,
      category: filters.category,
      priority: filters.priority,
      search: filters.search,
      date: filters.date,
      linkType: filters.linkType === "Todas" ? undefined : filters.linkType,
    }),
    [filters]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTasks(queryFilters);
      setTasks(data);
    } catch (e) {
      toast.error(`Erro ao carregar tarefas: ${String(e)}`);
    } finally {
      setLoading(false);
    }
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

  async function handleSetQuadrant(task: Task, quadrant: EisenhowerQuadrant) {
    await updateTask({ id: task.id, eisenhower_quadrant: quadrant });
    await refresh();
  }

  async function handleDelete(task: Task) {
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir "${task.title}"?`, confirmLabel: "Excluir", destructive: true }))) return;
    await deleteTask(task.id);
    toast.success("Tarefa excluída");
    await refresh();
  }

  async function handleBulkComplete(list: Task[]) {
    const pending = list.filter((t) => t.status !== "Concluída");
    if (pending.length === 0) return;
    const failed = countFailures(
      await Promise.allSettled(pending.map((t) => updateTask({ id: t.id, status: "Concluída" }))),
    );
    if (failed > 0) toast.error(`${pending.length - failed} de ${pending.length} concluída(s); ${failed} falhou(ram).`);
    else toast.success(`${pending.length} tarefa(s) concluída(s)`);
    await refresh();
  }

  async function handleBulkSetStatus(list: Task[], status: TaskStatus) {
    if (list.length === 0) return;
    const failed = countFailures(await Promise.allSettled(list.map((t) => updateTask({ id: t.id, status }))));
    if (failed > 0) toast.error(`${list.length - failed} de ${list.length} → ${status}; ${failed} falhou(ram).`);
    else toast.success(`${list.length} tarefa(s) → ${status}`);
    await refresh();
  }

  async function handleBulkDelete(list: Task[]) {
    if (list.length === 0) return;
    if (!(await confirmDialog({ title: "Excluir", description: `Excluir ${list.length} tarefa(s)? Esta ação não pode ser desfeita.`, confirmLabel: "Excluir", destructive: true }))) return;
    const failed = countFailures(await Promise.allSettled(list.map((t) => deleteTask(t.id))));
    if (failed > 0) toast.error(`${list.length - failed} de ${list.length} excluída(s); ${failed} falhou(ram).`);
    else toast.success(`${list.length} tarefa(s) excluída(s)`);
    await refresh();
  }

  const [view, setView] = useModuleView<
    "list" | "kanban" | "eisenhower" | "sprint"
  >("tasks", "list");
  // "Lista" e "Compacta" viraram uma view só ("Lista") com toggle de densidade.
  // Quem tinha "Compacta" salva da versão antiga começa já em densidade compacta.
  const [density, setDensity] = useListDensity(
    "tasks",
    (() => {
      try {
        return localStorage.getItem("vistage.view.tasks") === "compact" ? "compact" : "full";
      } catch {
        return "full";
      }
    })()
  );
  // Se uma view removida (compacta/linha do tempo/energia) estiver salva de uma
  // visita antiga, cai pra "list" pra não ficar sem conteúdo.
  const safeView: typeof view =
    view === "kanban" || view === "eisenhower" || view === "sprint" ? view : "list";

  return (
    <div className="space-y-4">
      <ModuleToolbar
        primaryAction={{ label: "Nova tarefa", icon: Plus, onClick: openCreate }}
        search={{
          value: filters.search,
          onChange: (v) => setFilters((f) => ({ ...f, search: v })),
          placeholder: "Buscar título ou descrição…",
        }}
        filtersActiveCount={
          (filters.status !== "Todas" ? 1 : 0) +
          (filters.category !== "Todas" ? 1 : 0) +
          (filters.priority !== "Todas" ? 1 : 0) +
          (filters.linkType !== "Todas" ? 1 : 0)
        }
        filters={
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as StatusFilter }))}
              >
                <SelectTrigger className="w-full">
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
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select
                value={filters.category}
                onValueChange={(v) => setFilters((f) => ({ ...f, category: v as CategoryFilter }))}
              >
                <SelectTrigger className="w-full">
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
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
              <Select
                value={filters.priority}
                onValueChange={(v) => setFilters((f) => ({ ...f, priority: v as PriorityFilter }))}
              >
                <SelectTrigger className="w-full">
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
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vínculo</label>
              <Select
                value={filters.linkType}
                onValueChange={(v) => setFilters((f) => ({ ...f, linkType: v as LinkFilter }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todas">Todos os vínculos</SelectItem>
                  {TASK_LINK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_LINK_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {DATE_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilters((s) => ({ ...s, date: f.id }))}
            className={cn("seg-pill", filters.date === f.id ? "seg-pill-on" : "seg-pill-off")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Carregando…</div>
      )}

      <Tabs value={safeView} onValueChange={(v) => setView(v as typeof view)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="eisenhower">Eisenhower</TabsTrigger>
            <TabsTrigger value="sprint">Sprint</TabsTrigger>
          </TabsList>
          {safeView === "list" && (
            <ListDensityToggle value={density} onChange={setDensity} />
          )}
        </div>

        <TabsContent value="list">
          {density === "compact" ? (
            <TaskCompactListView
              tasks={tasks}
              onEdit={openEdit}
              onToggleDone={handleToggleDone}
              onCreate={openCreate}
            />
          ) : (
            <TaskListView
              tasks={tasks}
              onEdit={openEdit}
              onToggleDone={handleToggleDone}
              onDelete={handleDelete}
              onCreate={openCreate}
              onBulkComplete={handleBulkComplete}
              onBulkSetStatus={handleBulkSetStatus}
              onBulkDelete={handleBulkDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="kanban">
          <TaskKanbanView tasks={tasks} onEdit={openEdit} onMove={handleMove} />
        </TabsContent>

        <TabsContent value="eisenhower">
          <TaskEisenhowerView
            tasks={tasks}
            onEdit={openEdit}
            onToggleDone={handleToggleDone}
            onSetQuadrant={handleSetQuadrant}
            onCreate={openCreate}
          />
        </TabsContent>

        <TabsContent value="sprint">
          <TaskSprintView
            tasks={tasks}
            onEdit={openEdit}
            onToggleDone={handleToggleDone}
            onDelete={handleDelete}
            onCreate={openCreate}
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
