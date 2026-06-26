import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2Off, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import {
  addTaskLink,
  createTask,
  listTasks,
  listTasksLinkedTo,
  removeTaskLink,
} from "../api";
import { statusVariant, type Task, type TaskCategory, type TaskLinkType } from "../types";

type Props = {
  entityType: TaskLinkType;
  entityId: number;
  /** Texto cacheado no vínculo (ex.: título do conteúdo). */
  entityLabel?: string;
  /** Categoria padrão para tarefas criadas aqui. */
  defaultCategory?: TaskCategory | null;
};

/**
 * Painel inverso de tarefas: a partir de uma entidade (Conteúdo, GIG, etc.),
 * lista as tarefas vinculadas e deixa CRIAR uma nova já vinculada ou VINCULAR
 * uma existente — sem precisar abrir a tarefa pelo módulo de Tarefas.
 */
export function LinkedTasksManager({
  entityType,
  entityId,
  entityLabel,
  defaultCategory = null,
}: Props) {
  const [linked, setLinked] = useState<Task[]>([]);
  const [all, setAll] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [pickId, setPickId] = useState("none");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [l, a] = await Promise.all([
      listTasksLinkedTo(entityType, entityId),
      listTasks(),
    ]);
    setLinked(l);
    setAll(a);
  }, [entityType, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const h = () => void refresh();
    window.addEventListener(DATA_CHANGED, h);
    return () => window.removeEventListener(DATA_CHANGED, h);
  }, [refresh]);

  const available = useMemo(() => {
    const linkedIds = new Set(linked.map((t) => t.id));
    return all.filter(
      (t) => !linkedIds.has(t.id) && t.status !== "Concluída" && t.status !== "Cancelada"
    );
  }, [all, linked]);

  async function createAndLink() {
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const id = await createTask({
        title,
        description: null,
        category: defaultCategory,
        gig_id: null,
        contact_id: null,
        priority: "Média",
        status: "A fazer",
        due_date: null,
        tags: [],
      });
      await addTaskLink(id, entityType, entityId, entityLabel ?? null);
      setNewTitle("");
      await refresh();
      toast.success("Tarefa criada e vinculada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function linkExisting() {
    if (pickId === "none" || busy) return;
    setBusy(true);
    try {
      await addTaskLink(Number(pickId), entityType, entityId, entityLabel ?? null);
      setPickId("none");
      await refresh();
      toast.success("Tarefa vinculada");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function unlink(taskId: number) {
    await removeTaskLink(taskId, entityType, entityId);
    await refresh();
  }

  return (
    <div className="space-y-3">
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma tarefa vinculada ainda.</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-sm"
            >
              <Badge variant={statusVariant(t.status)} className="shrink-0 text-[10px]">
                {t.status}
              </Badge>
              <span className="flex-1 truncate">{t.title}</span>
              {t.due_date && (
                <span className="shrink-0 text-xs text-muted-foreground">{t.due_date}</span>
              )}
              <button
                type="button"
                onClick={() => void unlink(t.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Desvincular tarefa"
              >
                <Link2Off className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Criar nova já vinculada */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="Nova tarefa vinculada…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void createAndLink();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => void createAndLink()}
          disabled={busy || !newTitle.trim()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Criar
        </Button>
      </div>

      {/* Vincular uma existente */}
      <div className="flex items-center gap-2">
        <Select value={pickId} onValueChange={setPickId}>
          <SelectTrigger className="h-8 flex-1 text-sm">
            <SelectValue placeholder="Vincular tarefa existente…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Vincular tarefa existente…</SelectItem>
            {available.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => void linkExisting()}
          disabled={busy || pickId === "none"}
        >
          Vincular
        </Button>
      </div>
    </div>
  );
}
