import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  type PartyStage,
  type PartyTask,
  type PartyTaskStatus,
} from "../types";
import {
  createPartyTask,
  deletePartyTask,
  updatePartyTask,
} from "../api";

const DEFAULT_TASKS_PER_STAGE: Record<string, string[]> = {
  "Ideação": ["Definir conceito e tema", "Pesquisar referências"],
  "Viabilidade": ["Pesquisar venues", "Calcular break-even", "Definir data"],
  "Marketing": ["Criar artes", "Planejar campanha", "Contratar designer"],
  "Execução": ["Fechar fornecedores", "Confirmar equipe", "Revisar rider técnico"],
  "Concretização": ["Fechar financeiro", "Registrar aprendizados"],
};

function taskStatusColor(s: PartyTaskStatus) {
  return s === "concluida"
    ? "line-through text-muted-foreground"
    : s === "em_andamento"
    ? "text-amber-400"
    : "";
}

function nextTaskStatus(s: PartyTaskStatus): PartyTaskStatus {
  return s === "pendente" ? "em_andamento" : s === "em_andamento" ? "concluida" : "pendente";
}

export function TarefasTab({
  partyId,
  stages,
  tasks,
  onReload,
}: {
  partyId: number;
  stages: PartyStage[];
  tasks: PartyTask[];
  onReload: () => Promise<void>;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [newStageId, setNewStageId] = useState<string>("none");
  const [generating, setGenerating] = useState(false);

  async function handleToggle(task: PartyTask) {
    try {
      await updatePartyTask(task.id, { status: nextTaskStatus(task.status) });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyTask(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await createPartyTask({
        party_id: partyId,
        stage_id: newStageId !== "none" ? Number(newStageId) : null,
        title,
        status: "pendente",
        priority: "Normal",
        due_date: null,
        notes: null,
      });
      setNewTitle("");
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleGenerateDefaults() {
    setGenerating(true);
    try {
      for (const stage of stages) {
        const stageTasks = DEFAULT_TASKS_PER_STAGE[stage.name] ?? [];
        for (const title of stageTasks) {
          await createPartyTask({
            party_id: partyId,
            stage_id: stage.id,
            title,
            status: "pendente",
            priority: "Normal",
            due_date: null,
            notes: null,
          });
        }
      }
      await onReload();
      toast.success("Tarefas geradas");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  const byStage = stages.map((stage) => ({
    stage,
    tasks: tasks.filter((t) => t.stage_id === stage.id),
  }));
  const noStage = tasks.filter((t) => t.stage_id === null);

  return (
    <div className="space-y-4">
      {byStage.map(({ stage, tasks: stageTasks }) => {
        const done = stageTasks.filter((t) => t.status === "concluida").length;
        const total = stageTasks.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div key={stage.id}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {stage.name}{total > 0 ? ` — ${done}/${total}` : ""}
              </span>
            </div>
            {total > 0 && (
              <div className="mb-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {stageTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-2">Sem tarefas nesta etapa.</p>
            ) : (
              <div className="space-y-1">
                {stageTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {noStage.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Sem etapa
          </div>
          <div className="space-y-1">
            {noStage.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && stages.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma tarefa.</p>
      )}

      <div className="flex items-center gap-2 border-t pt-3">
        <Input
          placeholder="Nova tarefa… (Enter para adicionar)"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
          className="flex-1"
        />
        <Select value={newStageId} onValueChange={setNewStageId}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue placeholder="Etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem etapa</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => void handleAdd()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {tasks.length === 0 && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => void handleGenerateDefaults()} disabled={generating}>
            {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Gerar checklist padrão
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: PartyTask;
  onToggle: (t: PartyTask) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <button
        type="button"
        onClick={() => void onToggle(task)}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
          task.status === "concluida"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : task.status === "em_andamento"
            ? "border-amber-500 bg-amber-500/30"
            : "border-input bg-background"
        )}
        title={
          task.status === "pendente"
            ? "Iniciar tarefa"
            : task.status === "em_andamento"
            ? "Concluir tarefa"
            : "Reabrir tarefa"
        }
      >
        {task.status === "concluida" && <Check className="h-3 w-3" />}
        {task.status === "em_andamento" && (
          <div className="h-2 w-2 rounded-sm bg-amber-500" />
        )}
      </button>
      <span className={cn("flex-1 text-sm", taskStatusColor(task.status))}>
        {task.title}
      </span>
      {task.due_date && (
        <span className="text-xs text-muted-foreground">{formatDate(task.due_date)}</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive hover:text-destructive"
        onClick={() => void onDelete(task.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}
