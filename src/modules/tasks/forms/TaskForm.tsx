import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { SubtaskList } from "../components/SubtaskList";
import {
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskCreateInput,
} from "../types";
import { createTask, updateTask } from "../api";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { formatDate } from "@/lib/format";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task | null;
  /** Defaults para uma tarefa nova (vinda de outro contexto, ex: dentro de uma GIG). */
  defaults?: Partial<TaskCreateInput>;
  onSaved: (id: number) => void;
};

const EMPTY: TaskCreateInput = {
  title: "",
  description: null,
  category: null,
  gig_id: null,
  contact_id: null,
  priority: "Média",
  status: "A fazer",
  due_date: null,
  tags: [],
};

function taskToInput(t: Task): TaskCreateInput {
  return {
    title: t.title,
    description: t.description,
    category: t.category,
    gig_id: t.gig_id,
    contact_id: t.contact_id,
    priority: t.priority,
    status: t.status,
    due_date: t.due_date,
    tags: t.tags,
  };
}

export function TaskForm({
  open,
  onOpenChange,
  task,
  defaults,
  onSaved,
}: Props) {
  const [state, setState] = useState<TaskCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (task) setState(taskToInput(task));
    else setState({ ...EMPTY, ...(defaults ?? {}) });
    setTagInput("");
    setTitleError(null);
  }, [task, defaults, open]);

  useEffect(() => {
    if (!open) return;
    void listContacts().then(setContacts);
    void listGigs().then(setGigs);
  }, [open]);

  function set<K extends keyof TaskCreateInput>(
    key: K,
    value: TaskCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || state.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setState((s) => ({ ...s, tags: [...s.tags, t] }));
    setTagInput("");
  }

  function removeTag(tag: string) {
    setState((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
  }

  async function handleSubmit() {
    if (!state.title.trim()) {
      setTitleError("Obrigatório");
      toast.error("O título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const id = task
        ? (await updateTask({ id: task.id, ...state }), task.id)
        : await createTask(state);
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              value={state.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={3}
              value={state.description ?? ""}
              onChange={(e) => set("description", e.target.value || null)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Categoria">
              <Select
                value={state.category ?? "none"}
                onValueChange={(v) =>
                  set("category", v === "none" ? null : (v as Task["category"]))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {TASK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={state.priority}
                onValueChange={(v) =>
                  set("priority", v as Task["priority"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={state.status}
                onValueChange={(v) => set("status", v as Task["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Vencimento">
              <Input
                type="date"
                value={state.due_date ?? ""}
                onChange={(e) => set("due_date", e.target.value || null)}
              />
            </Field>
            <Field label="Vincular a uma GIG">
              <Select
                value={state.gig_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("gig_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem vínculo —</SelectItem>
                  {gigs.map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.venue_name} · {formatDate(g.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vincular a um contato">
              <Select
                value={state.contact_id?.toString() ?? "none"}
                onValueChange={(v) =>
                  set("contact_id", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem vínculo —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1">
              {state.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1 pr-1">
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="rounded p-0.5 hover:bg-accent"
                    aria-label="Remover tag"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova tag (Enter)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Adicionar
              </Button>
            </div>
          </div>

          {task && (
            <div className="space-y-1.5">
              <Label>Subtarefas (checklist)</Label>
              <SubtaskList taskId={task.id} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {task ? "Salvar alterações" : "Criar tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
