import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
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
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
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
import { LinkPicker, type PendingLink } from "../components/LinkPicker";
import {
  TASK_CATEGORIES,
  TASK_DERIVED_LABELS,
  TASK_PRIORITIES,
  TASK_RECURRENCES,
  TASK_RECURRENCE_LABEL,
  TASK_STATUSES,
  type Task,
  type TaskCreateInput,
  type TaskRecurrence,
} from "../types";
import { addSubtask, createTask, listTaskLinks, setTaskLinks, updateTask } from "../api";
import { detachTaskFromOrigin } from "../derived";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import { listGigs } from "@/modules/gigs/api";
import type { Gig } from "@/modules/gigs/types";
import { formatDate } from "@/lib/format";
import { confirmDialog } from "@/components/ui/confirm";
import { emitDataChanged } from "@/lib/events";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";

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
  recurrence: null,
  energy_required: null,
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
    recurrence: t.recurrence,
    energy_required: t.energy_required,
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
  const [links, setLinks] = useState<PendingLink[]>([]);
  // Subtarefas digitadas ANTES de a tarefa existir (modo criar): bufferizadas
  // aqui e persistidas após o createTask, igual aos vínculos. No modo editar, o
  // SubtaskList grava direto no banco.
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Vira true depois de "Desvincular da origem" — destrava título/tags na hora,
  // sem esperar reabrir o formulário (o banco já foi atualizado).
  const [detached, setDetached] = useState(false);
  const [detaching, setDetaching] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);

  // Tarefa LEGADA de outra origem: título e tags são geridos pela origem —
  // exceto se o usuário acabou de desvinculá-la (aí volta a ser editável).
  const isDerived = !!task?.derived_type && !detached;
  const derivedLabel = task?.derived_type
    ? TASK_DERIVED_LABELS[task.derived_type] ?? "origem vinculada"
    : null;

  useEffect(() => {
    if (task) setState(taskToInput(task));
    else setState({ ...EMPTY, ...(defaults ?? {}) });
    setTagInput("");
    setTitleError(null);
    setDirty(false);
    setDetached(false);
    setLinks([]);
    setPendingSubtasks([]);
    setSubtaskInput("");
  }, [task, defaults, open]);

  useEffect(() => {
    if (!open) return;
    void listContacts().then(setContacts);
    void listGigs().then(setGigs);
    if (task) {
      void listTaskLinks(task.id).then((rows) =>
        setLinks(
          rows.map((r) => ({
            entity_type: r.entity_type,
            entity_id: r.entity_id,
            label: r.label ?? "",
          }))
        )
      );
    }
  }, [open, task]);

  function set<K extends keyof TaskCreateInput>(
    key: K,
    value: TaskCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || state.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setState((s) => ({ ...s, tags: [...s.tags, t] }));
    setTagInput("");
    setDirty(true);
  }

  function removeTag(tag: string) {
    setState((s) => ({ ...s, tags: s.tags.filter((t) => t !== tag) }));
    setDirty(true);
  }

  function addPendingSubtask() {
    const t = subtaskInput.trim();
    if (!t) return;
    setPendingSubtasks((s) => [...s, t]);
    setSubtaskInput("");
    setDirty(true);
  }

  function removePendingSubtask(idx: number) {
    setPendingSubtasks((s) => s.filter((_, i) => i !== idx));
    setDirty(true);
  }

  // "Desvincular da origem": destrava a tarefa de uma GIG/conteúdo/etc. (zera o
  // backlink na origem E os marcadores na tarefa). Persiste na hora; depois o
  // título/tags ficam editáveis e a tarefa pode ser vinculada a outra coisa.
  async function handleDetach() {
    if (!task) return;
    const ok = await confirmDialog({
      title: "Desvincular da origem",
      description: `A tarefa deixa de ser gerida por ${derivedLabel ?? "sua origem"}: o título e as tags voltam a ser editáveis, e a origem deixa de apontar para ela. A tarefa em si não é excluída. Continuar?`,
      confirmLabel: "Desvincular",
    });
    if (!ok) return;
    setDetaching(true);
    try {
      await detachTaskFromOrigin(task.id);
      // A origem não a reivindica mais → o vínculo único de GIG também sai.
      setState((s) => ({ ...s, gig_id: null }));
      setDetached(true);
      emitDataChanged();
      toast.success("Tarefa desvinculada: título e tags liberados.");
    } catch (e) {
      toast.error(`Erro ao desvincular: ${String(e)}`);
    } finally {
      setDetaching(false);
    }
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
      await setTaskLinks(
        id,
        links.map((l) => ({
          entity_type: l.entity_type,
          entity_id: l.entity_id,
          label: l.label || null,
        }))
      );
      // Tarefa nova: grava as subtarefas bufferizadas, na ordem digitada.
      if (!task && pendingSubtasks.length > 0) {
        for (let i = 0; i < pendingSubtasks.length; i++) {
          await addSubtask(id, pendingSubtasks[i], i);
        }
      }
      toast.success(task ? "Tarefa atualizada" : "Tarefa criada");
      setDirty(false);
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isDerived && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <p>
                Tarefa vinculada a <span className="font-medium text-foreground">{derivedLabel}</span>:
                o título e as tags são geridos pela origem. Você pode mudar status, prioridade e prazo.
                Para editar o título ou vinculá-la a outra coisa (ex.: um Conteúdo específico),
                <span className="font-medium text-foreground"> desvincule da origem</span> primeiro.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDetach}
                disabled={detaching}
              >
                {detaching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Desvincular da origem
              </Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              autoFocus={!isDerived}
              value={state.title}
              disabled={isDerived}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <AutoGrowTextarea
              rows={3}
              value={state.description ?? ""}
              onChange={(v) => set("description", v || null)}
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
                  <SelectValue placeholder="Nenhum" />
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
            <Field label="Energia necessária">
              <div className="flex items-center gap-1 pt-1">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() =>
                      set("energy_required", state.energy_required === level ? null : level)
                    }
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold transition",
                      state.energy_required != null && level <= state.energy_required
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-input bg-background text-muted-foreground hover:border-amber-400 hover:text-amber-500",
                    ].join(" ")}
                    aria-label={`Energia ${level}`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <Field label="Vencimento">
              <Input
                type="date"
                value={state.due_date ?? ""}
                onChange={(e) => set("due_date", e.target.value || null)}
              />
            </Field>
            <Field label="Recorrência">
              <Select
                value={state.recurrence ?? "none"}
                onValueChange={(v) =>
                  set("recurrence", v === "none" ? null : (v as TaskRecurrence))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {TASK_RECURRENCES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {TASK_RECURRENCE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1">
              {state.tags.length === 0 && isDerived && (
                <span className="text-xs text-muted-foreground">Sem tags.</span>
              )}
              {state.tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1 pr-1">
                  {t}
                  {!isDerived && (
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="rounded p-0.5 hover:bg-accent"
                      aria-label="Remover tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {!isDerived && (
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
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Vínculo</Label>
            <LinkPicker
              gigId={state.gig_id ?? null}
              contactId={state.contact_id ?? null}
              onGig={(id) => set("gig_id", id)}
              onContact={(id) => set("contact_id", id)}
              gigOptions={gigs.map((g) => ({
                id: g.id,
                label: `${g.venue_name} · ${formatDate(g.date)}`,
              }))}
              contactOptions={contacts.map((c) => ({ id: c.id, label: c.name }))}
              links={links}
              onLinks={(l) => {
                setLinks(l);
                setDirty(true);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Subtarefas (checklist)</Label>
            {task ? (
              <SubtaskList taskId={task.id} />
            ) : (
              <div className="space-y-2">
                {pendingSubtasks.length > 0 && (
                  <div className="space-y-1">
                    {pendingSubtasks.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="flex-1 rounded bg-muted/50 px-2 py-1 text-sm">{s}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removePendingSubtask(i)}
                          aria-label="Remover subtarefa"
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova subtarefa…"
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPendingSubtask();
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addPendingSubtask}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
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
