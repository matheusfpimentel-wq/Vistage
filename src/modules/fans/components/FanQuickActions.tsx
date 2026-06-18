import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarHeart,
  Gift,
  HandHeart,
  ListTodo,
  PartyPopper,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { DATA_CHANGED } from "@/lib/events";
import { createFanTask } from "../api";
import { listTasksLinkedTo } from "@/modules/tasks/api";
import type { Task } from "@/modules/tasks/types";
import { formatDate } from "@/lib/format";

type Props = {
  fanId: number;
  fanName: string;
};

type Preset = {
  key: string;
  label: string;
  icon: typeof Gift;
  title: (name: string) => string;
};

const PRESETS: Preset[] = [
  {
    key: "reativar",
    label: "Reativar fã",
    icon: RefreshCw,
    title: (n) => `Reativar contato com ${n}`,
  },
  {
    key: "agradecer",
    label: "Agradecer presença",
    icon: HandHeart,
    title: (n) => `Agradecer presença de ${n} no show`,
  },
  {
    key: "convidar",
    label: "Convidar p/ próximo show",
    icon: PartyPopper,
    title: (n) => `Convidar ${n} para o próximo show`,
  },
  {
    key: "brinde",
    label: "Enviar brinde",
    icon: Gift,
    title: (n) => `Enviar brinde para ${n}`,
  },
  {
    key: "aniversario",
    label: "Mensagem de aniversário",
    icon: CalendarHeart,
    title: (n) => `Mensagem de aniversário para ${n}`,
  },
];

export function FanQuickActions({ fanId, fanName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

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
          {PRESETS.map((p) => {
            const Icon = p.icon;
            return (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void create(p.title(fanName))}
              >
                <Icon className="h-3.5 w-3.5" /> {p.label}
              </Button>
            );
          })}
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
