import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import {
  addSubtask,
  deleteSubtask,
  listSubtasks,
  renameSubtask,
  toggleSubtask,
} from "../api";
import type { Subtask } from "../types";
import { cn } from "@/lib/utils";

type Props = {
  taskId: number;
};

export function SubtaskList({ taskId }: Props) {
  const [items, setItems] = useState<Subtask[]>([]);
  const [newTitle, setNewTitle] = useState("");

  async function refresh() {
    setItems(await listSubtasks(taskId));
  }

  useEffect(() => {
    void refresh();
  }, [taskId]);

  async function handleAdd() {
    const t = newTitle.trim();
    if (!t) return;
    try {
      await addSubtask(taskId, t, items.length);
      setNewTitle("");
      await refresh();
    } catch (e) {
      toast.error(`Não consegui adicionar a subtarefa: ${String(e)}`);
    }
  }

  async function handleToggle(s: Subtask) {
    try {
      await toggleSubtask(s.id, s.done === 0);
      await refresh();
    } catch (e) {
      toast.error(`Não consegui atualizar a subtarefa: ${String(e)}`);
    }
  }

  async function handleRename(s: Subtask, title: string) {
    if (title.trim() === s.title) return;
    try {
      await renameSubtask(s.id, title.trim());
      await refresh();
    } catch (e) {
      toast.error(`Não consegui renomear a subtarefa: ${String(e)}`);
    }
  }

  async function handleDelete(s: Subtask) {
    await deleteWithUndo({
      label: "Subtarefa",
      remove: () => deleteSubtask(s.id),
      restore: async () => {
        await addSubtask(s.task_id, s.title, s.position);
      },
      onChange: refresh,
    });
  }

  const done = items.filter((s) => s.done === 1).length;

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="text-xs text-muted-foreground tabular-nums">
          {done} / {items.length} concluídas
        </div>
      )}
      {items.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={s.done === 1}
            onChange={() => void handleToggle(s)}
            className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
          />
          <input
            defaultValue={s.title}
            onBlur={(e) => handleRename(s, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={cn(
              "flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-input focus:outline-none",
              s.done === 1 && "text-muted-foreground line-through"
            )}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleDelete(s)}
            aria-label="Remover subtarefa"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Input
          placeholder="Nova subtarefa…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAdd();
            }
          }}
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void handleAdd()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
