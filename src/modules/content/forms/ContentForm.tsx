import { useEffect, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { useUnsavedConfirm } from "@/lib/dirty";
import { onEnterSave } from "@/lib/formEnter";
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
import { LinkedTasksManager } from "@/modules/tasks/components/LinkedTasksManager";
import { loadIdentity } from "@/modules/identity/api";
import { listTracks } from "@/modules/music/api";
import { trackDisplayName } from "@/modules/music/types";
import { listGigs } from "@/modules/gigs/api";
import { listParties } from "@/modules/parties/api";

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
  track_id: null,
  promotes_type: null,
  promotes_id: null,
  date_roteiro: null,
  date_gravacao: null,
  date_edicao: null,
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
    track_id: c.track_id,
    promotes_type: c.promotes_type,
    promotes_id: c.promotes_id,
    date_roteiro: c.date_roteiro,
    date_gravacao: c.date_gravacao,
    date_edicao: c.date_edicao,
  };
}

// ============================================================
// PDF export de cenas
// ============================================================

function exportScenesPdf(title: string, scenes: ContentSceneInput[]) {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = scenes
    .map(
      (s, i) => `
      <div class="scene">
        <div class="scene-num">Cena ${i + 1}</div>
        ${s.title ? `<div class="scene-title">${escapeHtml(s.title)}</div>` : ""}
        ${s.description ? `<div class="field-label">O que acontece</div><p>${escapeHtml(s.description)}</p>` : ""}
        ${
          s.equipment.length > 0
            ? `<div class="field-label">Equipamento</div><div class="tags">${s.equipment.map((e) => `<span class="tag">${escapeHtml(e)}</span>`).join("")}</div>`
            : ""
        }
        ${
          s.materials.length > 0
            ? `<div class="field-label">Materiais</div><div class="tags">${s.materials.map((m) => `<span class="tag">${escapeHtml(m)}</span>`).join("")}</div>`
            : ""
        }
        ${s.scenery ? `<div class="field-label">Cenário</div><p>${escapeHtml(s.scenery)}</p>` : ""}
      </div>`
    )
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Cenas — ${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#111}
  h1{font-size:1.3em;margin-bottom:16px;border-bottom:2px solid #7C3AED;padding-bottom:8px}
  .scene{border:1px solid #ddd;border-radius:6px;padding:14px;margin-bottom:12px;break-inside:avoid}
  .scene-num{display:inline-block;background:#7c3aed22;color:#7C3AED;font-size:.75em;font-weight:600;padding:2px 8px;border-radius:4px;margin-bottom:8px}
  .scene-title{font-weight:600;margin-bottom:6px}
  .field-label{font-size:.75em;color:#666;margin:8px 0 2px;text-transform:uppercase;letter-spacing:.03em}
  p{margin:0 0 4px;font-size:.9em;white-space:pre-wrap}
  .tags{display:flex;flex-wrap:wrap;gap:4px}
  .tag{background:#f0f0f0;padding:2px 8px;border-radius:3px;font-size:.8em}
  @media print{body{padding:0}}
</style></head>
<body>
  <h1>Cenas — ${escapeHtml(title)}</h1>
  ${rows || '<p style="color:#888">Nenhuma cena cadastrada.</p>'}
</body></html>`;

  const win = window.open("", "_blank", "width=820,height=640");
  if (!win) {
    toast.error("O navegador bloqueou a janela pop-up. Permita pop-ups para exportar.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.print();
}

// ============================================================
// Component
// ============================================================

export function ContentForm({
  open,
  onOpenChange,
  content,
  defaults,
  onSaved,
}: Props) {
  const [state, setState] = useState<ContentCreateInput>(EMPTY);
  const [scenes, setScenes] = useState<ContentSceneInput[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const confirmClose = useUnsavedConfirm(dirty);
  const [networkOptions, setNetworkOptions] = useState<string[]>([
    ...CONTENT_NETWORKS,
  ]);
  const [tracks, setTracks] = useState<{ id: number; name: string }[]>([]);
  const [gigs, setGigs] = useState<{ id: number; name: string }[]>([]);
  const [parties, setParties] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    void listTracks().then((ts) =>
      setTracks(ts.map((t) => ({ id: t.id, name: trackDisplayName(t) })))
    );
    void listGigs().then((gs) =>
      setGigs(gs.map((g) => ({ id: g.id, name: g.event_name ?? g.venue_name })))
    );
    void listParties().then((ps) =>
      setParties(ps.map((p) => ({ id: p.id, name: p.title })))
    );
  }, [open]);

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

      // Cria tarefa de acompanhamento se ainda não existe
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
            due_date: null,
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
      <DialogContent className="max-w-3xl" onKeyDown={onEnterSave(handleSubmit)}>
        <DialogHeader>
          <DialogTitle>{content ? "Editar conteúdo" : "Novo conteúdo"}</DialogTitle>
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
              <TabsTrigger value="prazos">Prazos</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
              <TabsTrigger value="metricas">Métricas</TabsTrigger>
            </TabsList>

            {/* ── Básico ── */}
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
                            ? "border-primary/30 bg-primary/10 text-primary shadow-sm shadow-primary/5 ring-1 ring-inset ring-primary/20 backdrop-blur-sm"
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
                      <SelectValue placeholder="Nenhum" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Publicado em">
                  <Input
                    type="date"
                    value={state.published_at ?? ""}
                    onChange={(e) => set("published_at", e.target.value || null)}
                  />
                </Field>
                <Field label="Link do post publicado">
                  <Input
                    placeholder="https://"
                    value={state.post_url ?? ""}
                    onChange={(e) => set("post_url", e.target.value || null)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Divulga a track">
                  <Select
                    value={state.track_id == null ? "none" : String(state.track_id)}
                    onValueChange={(v) =>
                      set("track_id", v === "none" ? null : Number(v))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {tracks.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Promove evento">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={state.promotes_type ?? "none"}
                      onValueChange={(v) => {
                        if (v === "none") {
                          setState((s) => ({
                            ...s,
                            promotes_type: null,
                            promotes_id: null,
                          }));
                          setDirty(true);
                        } else {
                          setState((s) => ({
                            ...s,
                            promotes_type: v,
                            promotes_id: null,
                          }));
                          setDirty(true);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhum" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        <SelectItem value="GIG">GIG</SelectItem>
                        <SelectItem value="Festa">Festa</SelectItem>
                      </SelectContent>
                    </Select>
                    {state.promotes_type && (
                      <Select
                        value={
                          state.promotes_id == null
                            ? "none"
                            : String(state.promotes_id)
                        }
                        onValueChange={(v) =>
                          set("promotes_id", v === "none" ? null : Number(v))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhum" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {(state.promotes_type === "GIG" ? gigs : parties).map(
                            (o) => (
                              <SelectItem key={o.id} value={String(o.id)}>
                                {o.name}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </Field>
              </div>
            </TabsContent>

            {/* ── Roteiro ── */}
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

            {/* ── Cenas ── */}
            <TabsContent value="cenas" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Divida o roteiro em cenas com equipamento, materiais e cenário.
                </p>
                {scenes.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => exportScenesPdf(state.title || "Conteúdo", scenes)}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Exportar PDF
                  </Button>
                )}
              </div>
              <SceneEditor scenes={scenes} onChange={handleScenesChange} />
            </TabsContent>

            {/* ── Prazos ── */}
            <TabsContent value="prazos" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cada prazo cria automaticamente uma tarefa na categoria Conteúdo.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Roteiro">
                  <Input
                    type="date"
                    value={state.date_roteiro ?? ""}
                    onChange={(e) => set("date_roteiro", e.target.value || null)}
                  />
                </Field>
                <Field label="Gravação">
                  <Input
                    type="date"
                    value={state.date_gravacao ?? ""}
                    onChange={(e) => set("date_gravacao", e.target.value || null)}
                  />
                </Field>
                <Field label="Edição">
                  <Input
                    type="date"
                    value={state.date_edicao ?? ""}
                    onChange={(e) => set("date_edicao", e.target.value || null)}
                  />
                </Field>
                <Field label="Publicação">
                  <Input
                    type="date"
                    value={state.publish_date ?? ""}
                    onChange={(e) => set("publish_date", e.target.value || null)}
                  />
                </Field>
              </div>
            </TabsContent>

            {/* ── Tarefas ── */}
            <TabsContent value="tarefas" className="space-y-3">
              {content ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Vincule tarefas a este conteúdo — crie uma nova ou conecte uma
                    existente. Elas aparecem como vinculadas em Tarefas.
                  </p>
                  <LinkedTasksManager
                    entityType="content"
                    entityId={content.id}
                    entityLabel={content.title}
                    defaultCategory="Conteúdo"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Salve o conteúdo primeiro para vincular tarefas.
                </p>
              )}
            </TabsContent>

            {/* ── Métricas ── */}
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
