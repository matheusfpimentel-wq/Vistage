import { useEffect, useState } from "react";
import {
  Eye,
  Lightbulb,
  Loader2,
  Maximize2,
  Repeat,
  Scissors,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
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
import { toLocalISODate } from "@/lib/format";
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
import { createIdea, listIdeas, markIdeaAsConverted, updateIdea } from "../api";
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
import { createDocFromHtml, openDoc } from "@/modules/biblioteca/documents/api";
import { createNoteWithContent } from "@/modules/biblioteca/notesApi";
import { getDb } from "@/lib/db";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";

// Procedência (source) → rótulo curto pro selo "nasceu de" do formulário.
const SOURCE_LABEL: Record<string, string> = {
  colisao: "Nasceu de uma colisão de ideias",
  provocacao: "Nasceu de uma provocação",
  modo_foco: "Capturada no Modo Foco",
  biblioteca: "Veio de uma nota da Biblioteca",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idea?: Idea | null;
  onSaved: (id: number) => void;
  /** Callback chamado quando o usuário converte a ideia em outra entidade. */
  onConverted?: () => void;
  /** Abre o formulário real de GIG/Track; a página marca a conversão ao salvar. */
  onConvertToEntity?: (idea: Idea, target: "gig" | "track") => void;
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
  related_idea_id: null,
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
    related_idea_id: i.related_idea_id,
  };
}

/**
 * Lentes (§4): provocação aplicada à PRÓPRIA ideia — um toque dá um ângulo novo
 * sobre ela. Heurística de prática (sem laboratório por trás, diferente da fila
 * Ressurgir). `q` monta a pergunta a partir do título atual.
 */
const LENSES: { key: string; label: string; icon: LucideIcon; q: (t: string) => string }[] = [
  {
    key: "inverter",
    label: "Inverter",
    icon: Repeat,
    q: (t) => `Como você PIORARIA "${t}" de propósito? Às vezes o avesso revela o caminho.`,
  },
  {
    key: "escalar",
    label: "Escalar",
    icon: Maximize2,
    q: (t) => `E se "${t}" fosse 10× maior? E se fosse 10× menor? O que muda?`,
  },
  {
    key: "remover",
    label: "Remover",
    icon: Scissors,
    q: (t) => `Tire o elemento mais óbvio de "${t}". O que ainda funciona sem ele?`,
  },
  {
    key: "olhoFa",
    label: "Olho do fã",
    icon: Eye,
    q: (t) => `Como um fã descreveria "${t}" pra um amigo? O que ele destacaria?`,
  },
];

const CONVERSION_OPTIONS = [
  { label: "Novo set", converted_to: "task" as const, description: "Set novo" },
  { label: "GIG", converted_to: "gig" as const, description: null },
  { label: "Investimento", converted_to: "task" as const, description: "Investimento" },
  { label: "Produção de festa", converted_to: "task" as const, description: "Produção de festa" },
  { label: "Produção musical", converted_to: "track" as const, description: null },
  { label: "Conteúdo", converted_to: "content" as const, description: null },
  { label: "Aula", converted_to: "task" as const, description: "Aula" },
  { label: "Documento", converted_to: "document" as const, description: null },
  { label: "Conhecimento", converted_to: "note" as const, description: null },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Corpo (texto puro da ideia) → HTML: parágrafos por linha em branco, <br> nas
 *  quebras simples. Serve tanto pro Google Doc quanto pra nota do Conhecimento. */
function bodyToHtml(body: string | null | undefined): string {
  const text = (body ?? "").trim();
  if (!text) return "<p></p>";
  return text
    .split(/\n{2,}/)
    .map((par) => `<p>${escapeHtml(par).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function IdeaForm({ open, onOpenChange, idea, onSaved, onConverted, onConvertToEntity, onDelete }: Props) {
  const [state, setStateRaw] = useState<IdeaCreateInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [otherIdeas, setOtherIdeas] = useState<{ id: number; title: string }[]>([]);
  const [activeLens, setActiveLens] = useState<string | null>(null);
  const [lensBusy, setLensBusy] = useState(false);
  const [sourceNoteTitle, setSourceNoteTitle] = useState<string | null>(null);
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
    setActiveLens(null);
    void listIdeas().then((all) =>
      setOtherIdeas(all.map((i) => ({ id: i.id, title: i.title })))
    );
  }, [idea, open]);

  // Backlink da Biblioteca: carrega o título da nota de origem (rastreabilidade).
  useEffect(() => {
    if (!open || !idea?.source_note_id) {
      setSourceNoteTitle(null);
      return;
    }
    let alive = true;
    void getDb()
      .select<{ title: string }[]>("SELECT title FROM notes WHERE id = $1", [idea.source_note_id])
      .then((r) => {
        if (alive) setSourceNoteTitle(r[0]?.title ?? null);
      })
      .catch(() => {
        /* nota sumiu — sem backlink */
      });
    return () => {
      alive = false;
    };
  }, [open, idea?.source_note_id]);

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
        due_date: toLocalISODate(due),
        tags: ["ideia"],
      });
      toast.success("Tarefa criada!");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setCreatingTask(false);
    }
  }

  // Lente → ideia: captura o ângulo como uma nova ideia relacionada a esta.
  async function handleLensToIdea(question: string) {
    if (!idea) return;
    setLensBusy(true);
    try {
      await createIdea({
        title: question.length > 80 ? `${question.slice(0, 77)}…` : question,
        body: `${question}\n\n(lente sobre "${idea.title}")`,
        category: state.category,
        tags: [],
        heat: 3,
        maturation: "Embrião",
        converted_to: null,
        converted_id: null,
        related_idea_id: idea.id,
        source: "provocacao",
      });
      toast.success("Ângulo virou ideia");
      onSaved(idea.id);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setLensBusy(false);
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
          engagement_notes: null,
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
          due_date: toLocalISODate(due),
          tags: ["ideia"],
        });
        await markIdeaAsConverted(idea.id, "task", taskId);
        toast.success(`Convertida em Tarefa: ${option.label}`);
      } else if (option.converted_to === "document") {
        // Cria um Google Doc NATIVO (título + corpo da ideia) na pasta de
        // Documentos e abre no navegador. Requer Drive + pasta designada.
        const title = state.title.trim() || "Documento";
        const html = `<h1>${escapeHtml(title)}</h1>${bodyToHtml(state.body)}`;
        const { localId, file } = await createDocFromHtml(title, html);
        await markIdeaAsConverted(idea.id, "document", localId);
        if (file.web_view_link) void openDoc(file.web_view_link);
        toast.success("Convertida em Documento (Google Doc criado)");
      } else if (option.converted_to === "note") {
        // Cria uma nota no Conhecimento (título + corpo da ideia). É local.
        const noteId = await createNoteWithContent(
          state.title.trim() || "Nota",
          bodyToHtml(state.body)
        );
        await markIdeaAsConverted(idea.id, "note", noteId);
        toast.success("Convertida em Conhecimento (nota criada)");
      } else if (option.converted_to === "gig" || option.converted_to === "track") {
        // Abre o formulário REAL da entidade — a IdeasPage marca a conversão
        // (com o id verdadeiro) quando o usuário salvar.
        onConvertToEntity?.(idea, option.converted_to);
        onOpenChange(false);
        return;
      }
      onConverted?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setConverting(false);
    }
  }

  const provenance =
    idea && idea.source_note_id && sourceNoteTitle
      ? `Veio da nota: ${sourceNoteTitle}`
      : idea && idea.source && idea.source !== "manual" && SOURCE_LABEL[idea.source]
        ? SOURCE_LABEL[idea.source]
        : idea && idea.source_note_id
          ? "Veio de uma nota da Biblioteca"
          : null;

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-2xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{idea ? "Editar ideia" : "Nova ideia"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {provenance && (
            <div className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              {provenance}
            </div>
          )}
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
            <AutoGrowTextarea
              rows={5}
              placeholder="Solta o que vier, desenvolvemos depois"
              value={state.body ?? ""}
              onChange={(v) => set("body", v || null)}
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
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
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

          <div className="space-y-1.5">
            <Label>Relacionada a outra ideia</Label>
            <Select
              value={
                state.related_idea_id == null
                  ? "none"
                  : String(state.related_idea_id)
              }
              onValueChange={(v) =>
                set("related_idea_id", v === "none" ? null : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {otherIdeas
                  .filter((i) => i.id !== idea?.id)
                  .map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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
          {idea && state.maturation === "Pronta" && (
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

          {idea && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Lentes
              </Label>
              <p className="text-xs text-muted-foreground">
                Um ângulo novo sobre esta ideia: toque uma lente.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {LENSES.map((l) => {
                  const Icon = l.icon;
                  const active = activeLens === l.key;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setActiveLens(active ? null : l.key)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition",
                        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {l.label}
                    </button>
                  );
                })}
              </div>
              {activeLens &&
                (() => {
                  const lens = LENSES.find((l) => l.key === activeLens);
                  if (!lens) return null;
                  const q = lens.q(state.title.trim() || "esta ideia");
                  return (
                    <div className="mt-1.5 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <p className="text-sm">{q}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={lensBusy}
                        onClick={() => void handleLensToIdea(q)}
                      >
                        <Lightbulb className="h-3.5 w-3.5" /> Virar ideia
                      </Button>
                    </div>
                  );
                })()}
            </div>
          )}

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
