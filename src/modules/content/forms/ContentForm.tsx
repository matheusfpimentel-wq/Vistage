import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useUnsavedConfirm } from "@/lib/dirty";
import { createTask, updateTask } from "@/modules/tasks/api";
import {
  CONTENT_FORMATS,
  CONTENT_NETWORKS,
  CONTENT_STATUSES,
  type Content,
  type ContentCreateInput,
  type ContentFormat,
  type ContentNetwork,
  type ContentStatus,
  type ContentSceneInput,
} from "../types";
import {
  createContent,
  updateContent,
  listScenes,
  replaceScenes,
} from "../api";
import { ContentSnapshots } from "../components/ContentSnapshots";
import { SceneEditor } from "../components/SceneEditor";
import { loadIdentity } from "@/modules/identity/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content?: Content | null;
  defaults?: Partial<ContentCreateInput>;
  onSaved: (id: number) => void;
};

const EMPTY: ContentCreateInput = {
  title: "",
  script: null,
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
};

function contentToState(c: Content): ContentCreateInput {
  return {
    title: c.title,
    script: c.script,
    networks: c.networks,
    format: c.format,
    purpose: c.purpose,
    status: c.status,
    due_date: c.due_date,
    publish_date: c.publish_date,
    published_at: c.published_at,
    post_url: c.post_url,
    metric_views: c.metric_views,
    metric_likes: c.metric_likes,
    metric_comments: c.metric_comments,
    metric_shares: c.metric_shares,
    metric_saves: c.metric_saves,
    notes: c.notes,
    engagement_notes: c.engagement_notes,
    task_id: c.task_id,
  };
}

export function ContentForm({
  open,
  onOpenChange,
  content,
  defaults,
  onSaved,
}: Props) {
  const [state, setState] = useState<ContentCreateInput>(EMPTY);
  const [scenes, setScenes] = useState<ContentSceneInput[]>([]);
  // Só permite persistir cenas depois que a carga inicial terminou com sucesso.
  // Evita que uma leitura falha/pendente apague cenas já salvas no save.
  const [scenesLoaded, setScenesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);
  // Redes disponíveis vêm das redes sociais cadastradas em Identidade.
  const [networkOptions, setNetworkOptions] = useState<string[]>([
    ...CONTENT_NETWORKS,
  ]);

  useEffect(() => {
    if (!open) return;
    void loadIdentity().then((identity) => {
      const fromIdentity = Array.from(
        new Set(identity.socials.map((s) => s.network).filter(Boolean))
      );
      setNetworkOptions(
        fromIdentity.length > 0 ? fromIdentity : [...CONTENT_NETWORKS]
      );
    });
  }, [open]);

  useEffect(() => {
    if (content) setState(contentToState(content));
    else setState({ ...EMPTY, ...(defaults ?? {}) });
    setTitleError(null);
    setDirty(false);
    setScenesLoaded(false);
    if (content) {
      void listScenes(content.id).then(
        (rows) => {
          setScenes(
            rows.map((r) => ({
              title: r.title,
              description: r.description,
              equipment: r.equipment,
              materials: r.materials,
              scenery: r.scenery,
            }))
          );
          setScenesLoaded(true);
        },
        () => {
          // leitura falhou: NÃO marca como carregado, para não sobrescrever
          setScenes([]);
        }
      );
    } else {
      setScenes([]);
      setScenesLoaded(true);
    }
  }, [content, defaults, open]);

  function set<K extends keyof ContentCreateInput>(
    key: K,
    value: ContentCreateInput[K]
  ) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function handleScenesChange(next: ContentSceneInput[]) {
    setScenes(next);
    setDirty(true);
  }

  function toggleNetwork(n: ContentNetwork) {
    setState((s) => ({
      ...s,
      networks: s.networks.includes(n)
        ? s.networks.filter((x) => x !== n)
        : [...s.networks, n],
    }));
    setDirty(true);
  }

  async function handleSubmit() {
    if (!state.title.trim()) {
      setTitleError("Obrigatório");
      toast.error("O título é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const prevTaskId = content?.task_id ?? null;
      const id = content
        ? (await updateContent({ id: content.id, ...state }), content.id)
        : await createContent(state);

      // Cria tarefa sempre que não existe ainda
      if (!prevTaskId && !content?.task_id) {
        try {
          const taskId = await createTask({
            title: `Conteúdo: ${state.title.trim()}`,
            description: state.purpose ?? null,
            category: "Conteúdo",
            gig_id: null,
            contact_id: null,
            priority: "Média",
            status: "A fazer",
            due_date: state.due_date,
            tags: ["conteudo"],
          });
          await updateContent({ id, task_id: taskId });
        } catch {
          /* não interrompe */
        }
      }

      // Pronto ou Publicado → conclui a tarefa vinculada.
      if (state.status === "Pronto" || state.status === "Publicado") {
        const taskId = prevTaskId ?? content?.task_id ?? null;
        if (taskId) {
          try {
            await updateTask({ id: taskId, status: "Concluída" });
          } catch {
            /* não interrompe */
          }
        }
      }

      // Só regrava cenas se a carga inicial concluiu — senão um load
      // pendente/falho apagaria cenas já salvas.
      if (scenesLoaded) {
        await replaceScenes(id, scenes);
      }

      toast.success(content ? "Conteúdo atualizado" : "Conteúdo criado");
      setDirty(false);
      onSaved(id);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{content ? "Editar conteúdo" : "Novo conteúdo"}</DialogTitle>
          <DialogDescription>
            Ao definir um prazo, é criada uma tarefa automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Título <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder='Ex: "Reel — bastidor do meu set no Audio"'
              value={state.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
            {titleError && (
              <p className="text-xs text-destructive">{titleError}</p>
            )}
          </div>

          <Tabs defaultValue="basico">
            <TabsList>
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="roteiro">Roteiro</TabsTrigger>
              <TabsTrigger value="cenas">Cenas</TabsTrigger>
              <TabsTrigger value="metricas">Métricas</TabsTrigger>
            </TabsList>

            <TabsContent value="basico" className="space-y-4">
              <div className="space-y-1.5">
                <Label>Redes (multi-select)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(
                    new Set([...networkOptions, ...state.networks])
                  ).map((n) => {
                    const active = state.networks.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleNetwork(n)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-background hover:bg-accent"
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  As redes vêm das que você cadastra em Identidade.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Formato">
                  <Select
                    value={state.format ?? "none"}
                    onValueChange={(v) =>
                      set("format", v === "none" ? null : (v as ContentFormat))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {CONTENT_FORMATS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select
                    value={state.status}
                    onValueChange={(v) => set("status", v as ContentStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Finalidade">
                  <Input
                    placeholder="Ex: divulgar GIG"
                    value={state.purpose ?? ""}
                    onChange={(e) => set("purpose", e.target.value || null)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Prazo (cria tarefa)">
                  <Input
                    type="date"
                    value={state.due_date ?? ""}
                    onChange={(e) => set("due_date", e.target.value || null)}
                  />
                </Field>
                <Field label="Data prevista de publicação">
                  <Input
                    type="date"
                    value={state.publish_date ?? ""}
                    onChange={(e) => set("publish_date", e.target.value || null)}
                  />
                </Field>
                <Field label="Publicado em">
                  <Input
                    type="date"
                    value={state.published_at ?? ""}
                    onChange={(e) => set("published_at", e.target.value || null)}
                  />
                </Field>
              </div>

              <Field label="Link do post publicado">
                <Input
                  placeholder="https://"
                  value={state.post_url ?? ""}
                  onChange={(e) => set("post_url", e.target.value || null)}
                />
              </Field>
            </TabsContent>

            <TabsContent value="roteiro" className="space-y-3">
              <Field label="Roteiro">
                <Textarea
                  rows={8}
                  placeholder="Hook, desenvolvimento, CTA…"
                  value={state.script ?? ""}
                  onChange={(e) => set("script", e.target.value || null)}
                />
              </Field>
              <Field label="Notas internas">
                <Textarea
                  rows={3}
                  value={state.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value || null)}
                />
              </Field>
              {state.status === "Publicado" && (
                <Field label="Resultado / engajamento">
                  <Textarea
                    rows={3}
                    placeholder="O que funcionou? Alcance, comentários, resultado…"
                    value={state.engagement_notes ?? ""}
                    onChange={(e) => set("engagement_notes", e.target.value || null)}
                  />
                </Field>
              )}
            </TabsContent>

            <TabsContent value="cenas" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Divida o roteiro em cenas com equipamento, materiais e cenário.
              </p>
              <SceneEditor scenes={scenes} onChange={handleScenesChange} />
            </TabsContent>

            <TabsContent value="metricas" className="space-y-3">
              {content ? (
                <ContentSnapshots contentId={content.id} title={content.title} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Salve o conteúdo primeiro para registrar capturas de métricas.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => confirmClose(false, () => onOpenChange(false))}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {content ? "Salvar alterações" : "Criar conteúdo"}
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
