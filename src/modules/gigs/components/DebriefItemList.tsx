import { useState } from "react";
import { CheckSquare, Lightbulb, Plus, User, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DebriefItem } from "../debriefItems";

type Action = "task" | "idea" | "person";

type Props = {
  label: string;
  hint?: string;
  items: DebriefItem[];
  onChange: (items: DebriefItem[]) => void;
  placeholder?: string;
  /** Ações disponíveis por item. */
  actions?: Action[];
  /** Cria tarefa a partir do texto; devolve o id (ou null). */
  onMakeTask?: (text: string) => Promise<number | null>;
  /** Cria ideia a partir do texto; devolve o id (ou null). */
  onMakeIdea?: (text: string) => Promise<number | null>;
  /** Contatos para vincular pessoa (ação "person"). */
  contacts?: { id: number; name: string }[];
};

/**
 * Lista de itens do debrief (1 linha por item, adição inline) com ações
 * opcionais: virar tarefa, virar ideia, vincular pessoa.
 */
export function DebriefItemList({
  label,
  hint,
  items,
  onChange,
  placeholder = "adicionar item…",
  actions = [],
  onMakeTask,
  onMakeIdea,
  contacts = [],
}: Props) {
  const [draft, setDraft] = useState("");
  const [pickingFor, setPickingFor] = useState<number | null>(null);

  function addFromDraft() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { text }]);
    setDraft("");
  }

  function patch(idx: number, next: Partial<DebriefItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...next } : it)));
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1 text-sm">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </Label>

      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Input
                value={item.text}
                onChange={(e) => patch(idx, { text: e.target.value })}
                className="h-8 flex-1"
              />
              {actions.includes("task") && onMakeTask && (
                <button
                  type="button"
                  title={item.taskId ? "Tarefa criada" : "Virar tarefa"}
                  disabled={!!item.taskId || !item.text.trim()}
                  className={cn(
                    "shrink-0 rounded p-1.5 transition",
                    item.taskId
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  )}
                  onClick={async () => {
                    const id = await onMakeTask(item.text);
                    if (id) patch(idx, { taskId: id });
                  }}
                >
                  <CheckSquare className="h-4 w-4" />
                </button>
              )}
              {actions.includes("idea") && onMakeIdea && (
                <button
                  type="button"
                  title={item.ideaId ? "Ideia criada" : "Virar ideia"}
                  disabled={!!item.ideaId || !item.text.trim()}
                  className={cn(
                    "shrink-0 rounded p-1.5 transition",
                    item.ideaId
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  )}
                  onClick={async () => {
                    const id = await onMakeIdea(item.text);
                    if (id) patch(idx, { ideaId: id });
                  }}
                >
                  <Lightbulb className="h-4 w-4" />
                </button>
              )}
              {actions.includes("person") && (
                <button
                  type="button"
                  title={item.contactName ? `Vinculado: ${item.contactName}` : "Vincular pessoa"}
                  className={cn(
                    "shrink-0 rounded p-1.5 transition",
                    item.contactId
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => setPickingFor(pickingFor === idx ? null : idx)}
                >
                  <User className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                title="Remover"
                className="shrink-0 rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-destructive"
                onClick={() => remove(idx)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {item.contactId && item.contactName && (
              <div className="flex items-center gap-1 pl-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-300">
                  <User className="h-3 w-3" />
                  {item.contactName}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() => patch(idx, { contactId: undefined, contactName: undefined })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}

            {pickingFor === idx && (
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value={item.contactId ?? ""}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : undefined;
                  const name = id ? contacts.find((c) => c.id === id)?.name : undefined;
                  patch(idx, { contactId: id, contactName: name });
                  setPickingFor(null);
                }}
              >
                <option value="">Escolher pessoa…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromDraft();
            }
          }}
          // Commita o texto pendente ao sair do campo (ex.: clicar em Finalizar
          // sem apertar Enter) pra não perder o item digitado.
          onBlur={addFromDraft}
          placeholder={placeholder}
          className="h-8 flex-1"
        />
        <button
          type="button"
          title="Adicionar"
          disabled={!draft.trim()}
          className="shrink-0 rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
          onClick={addFromDraft}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
