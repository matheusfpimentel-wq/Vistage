import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import { createFanTask, loadFanClubConfig } from "../api";
import type { FanClubAction } from "../types";
import { listTasksLinkedTo } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { formatDate } from "@/lib/format";

type Props = {
  fanId: number;
  fanName: string;
};

/** Aplica o nome do fã ao template (`{nome}`). */
function fillTemplate(template: string, name: string): string {
  return template.replace(/\{nome\}/g, name);
}

export function FanQuickActions({ fanId, fanName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [actions, setActions] = useState<FanClubAction[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadFanClubConfig().then((c) => setActions(c.actions));
  }, []);

  async function refresh() {
    const all = await listTasksLinkedTo("fan", fanId);
    setTasks(all.filter((t) => t.status !== "Concluída" && t.status !== "Cancelada"));
  }

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(DATA_CHANGED, onChange);
    return () => window.removeEventListener(DATA_CHANGED, onChange);
  }, [fanId]);

  async function create(title: string) {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createFanTask(fanId, title.trim());
      toast.success("Tarefa criada e vinculada ao fã");
      await refresh();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Gere uma tarefa já vinculada a {fanName} — ela aparece nas suas Tarefas
          e no histórico do fã.
        </p>
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.id}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void create(fillTemplate(a.titleTemplate, fanName))}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Outra ação… (vira tarefa do fã)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              void create(custom).then(() => setCustom(""));
            }
          }}
        />
        <Button
          disabled={busy || !custom.trim()}
          onClick={() => void create(custom).then(() => setCustom(""))}
        >
          <Plus className="h-4 w-4" /> Criar
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Tarefas abertas deste fã
          </span>
          <Link to="/tarefas" className="text-xs text-primary hover:underline">
            Ver em Tarefas
          </Link>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhuma tarefa aberta vinculada.
          </p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <ListTodo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t.title}</span>
                {t.due_date && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(t.due_date)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
