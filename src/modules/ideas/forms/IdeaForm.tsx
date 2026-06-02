import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { createIdea, markIdeaAsConverted, updateIdea } from "../api";
import {
  IDEA_CATEGORIES,
  IDEA_HEATS,
  IDEA_MATURATIONS,
  heatColor,
  heatLabel,
  type Idea,
  type IdeaCategory,
  type IdeaCreateInput,
  type IdeaHeat,
  type IdeaMaturation,
} from "../types";
import { createContent } from "@/modules/content/api";
import { createTask } from "@/modules/tasks/api";
import { useUnsavedConfirm } from "@/lib/dirty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea?: Idea | null;
  onSaved: (id: number) => void;
  /** Callback chamado quando o usuário converte a ideia em outra entidade. */
  onConverted?: () => void;
  onDelete?: (id: number) => void;
};

const EMPTY: IdeaCreateInput = {
  title: "",
  body: null,
  category: null,
  tags: [],
  heat: 1,
  maturation: "Embrião",
  converted_to: null,
  converted_id: null,
};

function ideaToState(i: Idea): IdeaCreateInput {
  return {
    title: i.title,
    body: i.body,
    category: i.category,
    tags: i.tags,
    heat: i.heat,
    maturation: i.maturation,
    converted_to: i.converted_to,
    converted_id: i.converted_id,
  };
}

const CONVERSION_OPTIONS = [
  { label: "Novo set", converted_to: "task" as const, description: "Set novo" },
  { label: "GIG", converted_to: "gig" as const, description: null },
  { label: "Investimento", converted_to: "task" as const, description: "Investimento" },
  { label: "Produção de festa", converted_to: "task" as const, description: "Produção de festa" },
  { label: "Produção musical", converted_to: "track" as const, description: null },
  { label: "Conteúdo", converted_to: "content" as const, description: null },
  { label: "Aula", converted_to: "task" as const, description: "Aula" },
];

export function IdeaForm({ open, onOpenChange, idea, onSaved, onConverted, onDelete }: Props) {
  const [state, setStateRaw] = useState<IdeaCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);
  const setState: typeof setStateRaw = (v) => {
    setStateRaw(v);
    setDirty(true);
  };

  useEffect(() => {
    if (!open) return;
    if (idea) {
      setStateRaw(ideaToState(idea));
      setTaskTitle(idea.title);
    } else {
      setStateRaw(EMPTY);
      setTaskTitle("");
    }
    setTagInput("");
    setTitleError(null);
    setDirty(false);
  }, [idea, open]);

  function set<K extends keyof IdeaCreateInput>(key: K, value: IdeaCreateInput[K]) {
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
      const id = idea
        ? (await updateIdea({ id: idea.id, ...state }), idea.id)
        : await createIdea(state);
      toast.success(idea ? "Ideia atualizada" : "Ideia salva");
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTask() {
    setCreatingTask(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + 60);
      await createTask({
        title: taskTitle.trim() || state.title.trim(),
        description: null,
        category: null,
        gig_id: null,
        contact_id: null,
        priority: "Média",
        status: "A fazer",
        due_date: due.toISOString().slice(0, 10),
        tags: ["ideia"],
      });
      toast.success("Tarefa criada!");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleConvert(option: typeof CONVERSION_OPTIONS[number]) {
    if (!idea) return;
    setConverting(true);
    try {
      if (option.converted_to === "content") {
        const contentId = await createContent({
          title: state.title.trim(),
          script: state.body ?? null,
          networks: [],
          format: null,
          purpose: null,
          status: "Ideia",
          due_date: null,
          publish_date: null,
          published_at: null,
          post_url: null,
          metric_views: null,
          metric_likes: null,
          metric_comments: null,
          metric_shares: null,
          metric_saves: null,
          notes: null,
          task_id: null,
        });
        await markIdeaAsConverted(idea.id, "content", contentId);
        toast.success("Convertida em Conteúdo");
      } else if (option.converted_to === "task") {
        const due = new Date();
        due.setDate(due.getDate() + 60);
        const taskId = await createTask({
          title: option.description
            ? `${option.description}: ${state.title.trim()}`
            : state.title.trim(),
          description: null,
          category: null,
          gig_id: null,
          contact_id: null,
          priority: "Média",
          status: "A fazer",
          due_date: due.toISOString().slice(0, 10),
          tags: ["ideia"],
        });
        await markIdeaAsConverted(idea.id, "task", taskId);
        toast.success(`Convertida em Tarefa — ${option.label}`);
      } else if (option.converted_to === "gig") {
        await markIdeaAsConverted(idea.id, "gig", 0);
        toast.success("Marcada como convertida em GIG");
      } else if (option.converted_to === "track") {
        await markIdeaAsConverted(idea.id, "track", 0);
        toast.success("Marcada como convertida em Produção musical");
      }
      onConverted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setConverting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{idea ? "Editar ideia" : "Nova ideia"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              autoFocus
              value={state.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Corpo</Label>
            <Textarea
              rows={5}
              placeholder="Solta o que vier — desenvolve depois."
              value={state.body ?? ""}
              onChange={(e) => set("body", e.target.value || null)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={state.category ?? "none"}
                onValueChange={(v) =>
                  set("category", v === "none" ? null : (v as IdeaCategory))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {IDEA_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Maturação</Label>
              <Select
                value={state.maturation}
                onValueChange={(v) => set("maturation", v as IdeaMaturation)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDEA_MATURATIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Desenvolvendo — criar tarefa inline */}
          {state.maturation === "Desenvolvendo" && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Crie uma tarefa para começar:
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={state.title || "Título da tarefa"}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCreateTask}
                  disabled={creatingTask}
                >
                  {creatingTask && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Criar tarefa
                </Button>
              </div>
            </div>
          )}

          {/* Pronta — Em que se converteu? */}
          {idea && state.maturation === "Pronta" && idea.maturation !== "Convertida" && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Em que se converteu?
              </div>
              <div className="flex flex-wrap gap-2">
                {CONVERSION_OPTIONS.map((opt) => (
                  <Button
                    key={opt.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleConvert(opt)}
                    disabled={converting}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Calor</Label>
            <div className="flex gap-1.5">
              {IDEA_HEATS.map((h) => {
                const active = state.heat === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => set("heat", h as IdeaHeat)}
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs transition",
                      active
                        ? heatColor(h as IdeaHeat)
                        : "border-input bg-background hover:bg-accent"
                    )}
                  >
                    {heatLabel(h as IdeaHeat)}
                  </button>
                );
              })}
            </div>
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
                    aria-label="Remover"
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

          {idea?.converted_to && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-600">
              Convertida em {idea.converted_to} #{idea.converted_id}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <div className="flex flex-1">
            {idea && onDelete && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => { onDelete(idea.id); onOpenChange(false); }}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {idea ? "Salvar alterações" : "Salvar ideia"}
          </Button>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}
