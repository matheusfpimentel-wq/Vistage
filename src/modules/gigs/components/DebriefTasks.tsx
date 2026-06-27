import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toLocalISODate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PendingDebriefTask = {
  title: string;
  dueDate: string;
};

/** Calcula uma data ISO `n` dias à frente. */
function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalISODate(d); // data LOCAL (não UTC) p/ não pular 1 dia à noite no Brasil
}

const DEFAULT_OFFSET_DAYS = 60;

type Props = {
  items: PendingDebriefTask[];
  onChange: (items: PendingDebriefTask[]) => void;
};

/**
 * Lista de tarefas a serem criadas a partir do debrief. Cada item tem
 * apenas título + data de vencimento (default = hoje + 60 dias). As
 * tarefas só são realmente criadas quando o usuário salva o debrief.
 */
export function DebriefTasks({ items, onChange }: Props) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(daysAhead(DEFAULT_OFFSET_DAYS));

  function add() {
    const t = title.trim();
    if (!t) return;
    onChange([...items, { title: t, dueDate }]);
    setTitle("");
    setDueDate(daysAhead(DEFAULT_OFFSET_DAYS));
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Lance aqui as ações que essa GIG abriu — vão virar tarefas com vencimento
        em <strong>60 dias</strong> por padrão e tag <code>do-debrief</code>.
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Nova tarefa</Label>
            <Input
              placeholder="Ex: Mandar release pro Maquinhário"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vence em</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <Button type="button" onClick={add}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma tarefa adicionada ainda.
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md border p-2.5 text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Vence em {it.dueDate}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                aria-label="Remover"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
