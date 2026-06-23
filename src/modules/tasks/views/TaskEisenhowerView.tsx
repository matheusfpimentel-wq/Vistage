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
};

const QUADRANTS: {
  id: EisenhowerQuadrant;
  label: string;
  hint: string;
  cls: string;
}[] = [
  { id: "do", label: "Fazer agora", hint: "Urgente + importante", cls: "border-red-500/40 bg-red-500/5" },
  { id: "schedule", label: "Agendar", hint: "Importante, não urgente", cls: "border-sky-500/40 bg-sky-500/5" },
  { id: "delegate", label: "Delegar", hint: "Urgente, não importante", cls: "border-amber-500/40 bg-amber-500/5" },
  { id: "eliminate", label: "Eliminar / depois", hint: "Nem urgente nem importante", cls: "border-muted bg-muted/20" },
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

export function TaskEisenhowerView({ tasks, onEdit, onToggleDone }: Props) {
  if (tasks.length === 0) {
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
  for (const t of tasks) byQuad.get(quadrantOf(t))!.push(t);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {QUADRANTS.map((q) => {
        const list = byQuad.get(q.id) ?? [];
        return (
          <div key={q.id} className={cn("rounded-lg border p-3", q.cls)}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{q.label}</div>
                <div className="text-[11px] text-muted-foreground">{q.hint}</div>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">Vazio.</p>
            ) : (
              <div className="space-y-1">
                {list.map((t) => {
                  const done = t.status === "Concluída";
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => onToggleDone(t)}
                        className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-input accent-primary"
                        aria-label={done ? "Reabrir" : "Marcar como concluída"}
                      />
                      <button
                        type="button"
                        onClick={() => onEdit(t)}
                        className={cn(
                          "flex-1 truncate text-left hover:underline",
                          done && "text-muted-foreground line-through"
                        )}
                        title={t.title}
                      >
                        {t.title}
                      </button>
                      <span className="shrink-0">
                        <PriorityBadge priority={t.priority} />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
