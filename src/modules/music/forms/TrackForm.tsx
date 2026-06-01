import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatDate } from "@/lib/format";
import {
  deleteAttachment,
  openAttachment,
  pickFile,
  saveAttachment,
  DOC_EXTS,
  IMAGE_EXTS,
} from "@/lib/uploads";
import { AttachmentField } from "@/components/shared/AttachmentField";
import { listContacts } from "@/modules/crm/api";
import type { Contact } from "@/modules/crm/types";
import {
  TRACK_KINDS,
  TRACK_KIND_LABEL,
  nextStage,
  prevStage,
  type TrackKind,
} from "../stages";
import { MOOD_SUGGESTIONS, type Track, type TrackCreateInput } from "../types";
import { gateAfter, GATES, type GateDecisionRecord } from "../gates";
import { StageBadge } from "../components/StageBadge";
import { FlowSessionPanel } from "../components/FlowSessionPanel";
import { GateDialog } from "./GateDialog";
import {
  advanceStage,
  createTrack,
  getTrack,
  listTrackCollaborators,
  reactivateTrack,
  recordGate4,
  regressStage,
  rejectAtGate,
  setTrackCollaborators,
  updateTrack,
} from "../api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track?: Track | null;
  defaultProjectId?: number | null;
  onSaved: () => void;
};

type FormState = Omit<TrackCreateInput, "project_id">;

const EMPTY: FormState = {
  kind: "single",
  title_working: "",
  title_final: null,
  bpm: null,
  key: null,
  duration_seconds: null,
  mood_tags: [],
  genre_primary: null,
  genre_secondary: null,
  references: [],
  constraints: null,
  concept_narrative: null,
  daw_project_path: null,
  stems_path: null,
  final_files_path: null,
  stage_notes: null,
  creative_block_notes: null,
};

const COLLAB_TYPES = ["DJ parceiro", "Colaborador", "Produtor de eventos"];

export function TrackForm({
  open,
  onOpenChange,
  track,
  defaultProjectId,
  onSaved,
}: Props) {
  const [state, setState] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState<Track | null>(null);
  const [collabs, setCollabs] = useState<number[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [moodInput, setMoodInput] = useState("");
  const [gateOpen, setGateOpen] = useState<null | { gateId: string; mode: "advance" | "review" }>(null);

  const confirmClose = useUnsavedConfirm(dirty);
  const isEdit = !!track;

  const reload = useCallback(async () => {
    if (!track) return;
    const fresh = await getTrack(track.id);
    if (fresh) setLoaded(fresh);
  }, [track]);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setMoodInput("");
    void listContacts().then((all) =>
      setContacts(
        all.filter((c) => c.types.some((t) => COLLAB_TYPES.includes(t)))
      )
    );
    if (track) {
      setState({
        kind: track.kind,
        title_working: track.title_working,
        title_final: track.title_final,
        bpm: track.bpm,
        key: track.key,
        duration_seconds: track.duration_seconds,
        mood_tags: track.mood_tags,
        genre_primary: track.genre_primary,
        genre_secondary: track.genre_secondary,
        references: track.references,
        constraints: track.constraints,
        concept_narrative: track.concept_narrative,
        daw_project_path: track.daw_project_path,
        stems_path: track.stems_path,
        final_files_path: track.final_files_path,
        stage_notes: track.stage_notes,
        creative_block_notes: track.creative_block_notes,
      });
      setLoaded(track);
      void listTrackCollaborators(track.id).then(setCollabs);
    } else {
      setState(EMPTY);
      setLoaded(null);
      setCollabs([]);
    }
  }, [open, track]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function addMood(tag: string) {
    const t = tag.trim();
    if (!t || state.mood_tags.includes(t)) return;
    set("mood_tags", [...state.mood_tags, t]);
    setMoodInput("");
  }

  async function addReference() {
    try {
      const src = await pickFile({
        title: "Selecionar referência",
        extensions: [...IMAGE_EXTS, ...DOC_EXTS, "mp3", "wav", "aiff", "flac"],
        filterName: "Referências",
      });
      if (!src) return;
      const dest = await saveAttachment(src, "music/references");
      set("references", [...state.references, dest]);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function removeReference(path: string) {
    await deleteAttachment(path);
    set(
      "references",
      state.references.filter((r) => r !== path)
    );
  }

  function toggleCollab(id: number) {
    setCollabs((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    setDirty(true);
  }

  async function handleSubmit() {
    if (!state.title_working.trim()) {
      toast.error("O título de trabalho é obrigatório");
      return;
    }
    if (!state.constraints || !state.constraints.trim()) {
      toast.error(
        "Defina as restrições criativas — elas aumentam a produção criativa."
      );
      return;
    }
    setSaving(true);
    try {
      let id: number;
      if (track) {
        await updateTrack({ id: track.id, ...state });
        id = track.id;
      } else {
        id = await createTrack({ ...state, project_id: defaultProjectId ?? null });
      }
      await setTrackCollaborators(id, collabs);
      toast.success(track ? "Track atualizada" : "Track criada");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // ---- transições de stage ----

  async function persistThen(fn: () => Promise<void>) {
    if (track) await updateTrack({ id: track.id, ...state });
    await fn();
    await reload();
    onSaved();
  }

  async function handleAdvance() {
    if (!loaded) return;
    const gate = gateAfter(loaded.current_stage);
    if (gate) {
      setGateOpen({ gateId: gate.id, mode: "advance" });
      return;
    }
    await persistThen(() => advanceStage(loaded));
    toast.success(`Avançou para ${nextStage(loaded.current_stage)}`);
  }

  async function handleRegress() {
    if (!loaded) return;
    await persistThen(() => regressStage(loaded));
  }

  async function handleReactivate() {
    if (!loaded) return;
    await persistThen(() => reactivateTrack(loaded.id));
    toast.success("Track reativada");
  }

  async function onGateDecide(record: GateDecisionRecord) {
    if (!loaded || !gateOpen) return;
    if (gateOpen.mode === "review") {
      await persistThen(() => recordGate4(loaded, record));
    } else if (record.decision === "approved") {
      await persistThen(() => advanceStage(loaded, record));
      toast.success(`Aprovado — avançou para ${nextStage(loaded.current_stage)}`);
    } else {
      await persistThen(() => rejectAtGate(loaded, record));
      toast.warning("Reprovado — track em Stand-by (reativável)");
    }
    setGateOpen(null);
  }

  const activeGate = gateOpen
    ? GATES.find((g) => g.id === gateOpen.gateId) ?? null
    : null;
  const canAdvance = loaded && nextStage(loaded.current_stage) !== null;
  const canRegress = loaded && prevStage(loaded.current_stage) !== null;
  const isPostRelease = loaded?.current_stage === "Pós-lançamento";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => confirmClose(v, () => onOpenChange(v))}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {track ? "Editar track" : "Nova track"}
            {loaded && (
              <StageBadge stage={loaded.current_stage} standby={loaded.standby} />
            )}
          </DialogTitle>
          <DialogDescription>
            Cada track é o objeto de trabalho cotidiano, com modelo Stage-Gate.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="id">
          <TabsList>
            <TabsTrigger value="id">Identificação</TabsTrigger>
            <TabsTrigger value="concept">Conceito</TabsTrigger>
            {isEdit && <TabsTrigger value="exec">Execução</TabsTrigger>}
            {isEdit && <TabsTrigger value="flow">Criatividade</TabsTrigger>}
          </TabsList>

          {/* ===== IDENTIFICAÇÃO ===== */}
          <TabsContent value="id" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título de trabalho *">
                <Input
                  value={state.title_working}
                  onChange={(e) => set("title_working", e.target.value)}
                  placeholder='Ex: "ideia bass 130"'
                />
              </Field>
              <Field label="Título final">
                <Input
                  value={state.title_final ?? ""}
                  onChange={(e) => set("title_final", e.target.value || null)}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Tipo">
                <Select
                  value={state.kind}
                  onValueChange={(v) => set("kind", v as TrackKind)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRACK_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {TRACK_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="BPM">
                <Input
                  type="number"
                  value={state.bpm ?? ""}
                  onChange={(e) =>
                    set("bpm", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field label="Tom (key)">
                <Input
                  value={state.key ?? ""}
                  onChange={(e) => set("key", e.target.value || null)}
                  placeholder="Ex: A min"
                />
              </Field>
              <Field label="Duração (segundos)">
                <Input
                  type="number"
                  value={state.duration_seconds ?? ""}
                  onChange={(e) =>
                    set(
                      "duration_seconds",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Gênero principal">
                <Input
                  value={state.genre_primary ?? ""}
                  onChange={(e) => set("genre_primary", e.target.value || null)}
                />
              </Field>
              <Field label="Gênero secundário">
                <Input
                  value={state.genre_secondary ?? ""}
                  onChange={(e) =>
                    set("genre_secondary", e.target.value || null)
                  }
                />
              </Field>
            </div>
            <Field label="Mood tags">
              <div className="flex flex-wrap gap-1.5">
                {state.mood_tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "mood_tags",
                          state.mood_tags.filter((x) => x !== t)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={moodInput}
                  onChange={(e) => setMoodInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addMood(moodInput);
                    }
                  }}
                  placeholder="Adicionar mood…"
                  className="h-8"
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {MOOD_SUGGESTIONS.filter((m) => !state.mood_tags.includes(m)).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => addMood(m)}
                      className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                    >
                      + {m}
                    </button>
                  )
                )}
              </div>
            </Field>
          </TabsContent>

          {/* ===== CONCEITO ===== */}
          <TabsContent value="concept" className="space-y-4">
            <Field label="Restrições criativas *">
              <p className="text-xs text-muted-foreground">
                Definir restrições explícitas aumenta a produção criativa. Ex:
                "só sintetizadores", "sem sample vocal", "produzir em 7 dias".
              </p>
              <Textarea
                rows={3}
                value={state.constraints ?? ""}
                onChange={(e) => set("constraints", e.target.value || null)}
              />
            </Field>
            <Field label="Narrativa do conceito">
              <Textarea
                rows={4}
                value={state.concept_narrative ?? ""}
                onChange={(e) =>
                  set("concept_narrative", e.target.value || null)
                }
                placeholder="A história/ideia por trás da track."
              />
            </Field>
            <Field label="Referências (imagens, áudios, links)">
              <div className="space-y-1.5">
                {state.references.map((r) => (
                  <div
                    key={r}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2"
                  >
                    <button
                      type="button"
                      onClick={() => void openAttachment(r)}
                      className="flex flex-1 items-center gap-2 text-left text-sm hover:text-primary"
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {r.split(/[\\/]/).pop()}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeReference(r)}
                      aria-label="Remover"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addReference}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar referência
                </Button>
              </div>
            </Field>
          </TabsContent>

          {/* ===== EXECUÇÃO ===== */}
          {isEdit && loaded && (
            <TabsContent value="exec" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-sm text-muted-foreground">Stage atual:</span>
                <StageBadge
                  stage={loaded.current_stage}
                  standby={loaded.standby}
                />
                <div className="ml-auto flex gap-2">
                  {loaded.standby && (
                    <Button size="sm" variant="dark" onClick={handleReactivate}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reativar
                    </Button>
                  )}
                  {canRegress && (
                    <Button size="sm" variant="outline" onClick={handleRegress}>
                      <ArrowLeft className="h-3.5 w-3.5" /> Voltar
                    </Button>
                  )}
                  {canAdvance && !loaded.standby && (
                    <Button size="sm" onClick={handleAdvance}>
                      Avançar <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isPostRelease && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setGateOpen({ gateId: "gate4", mode: "review" })
                      }
                    >
                      Revisar (Gate 4)
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <AttachmentField
                  label="Projeto da DAW"
                  variant="document"
                  subdir="music/daw"
                  value={state.daw_project_path}
                  onChange={(v) => set("daw_project_path", v)}
                />
                <AttachmentField
                  label="Stems"
                  variant="document"
                  subdir="music/stems"
                  value={state.stems_path}
                  onChange={(v) => set("stems_path", v)}
                />
                <AttachmentField
                  label="Arquivos finais"
                  variant="document"
                  subdir="music/final"
                  value={state.final_files_path}
                  onChange={(v) => set("final_files_path", v)}
                />
              </div>

              <Field label="Colaboradores">
                {contacts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Cadastre contatos do tipo DJ parceiro / Colaborador no CRM.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCollab(c.id)}
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs transition",
                          collabs.includes(c.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input hover:bg-accent"
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Notas do stage (mini-diário)">
                <Textarea
                  rows={3}
                  value={state.stage_notes ?? ""}
                  onChange={(e) => set("stage_notes", e.target.value || null)}
                />
              </Field>
              <Field label="Bloqueios criativos resolvidos (vira Insight)">
                <Textarea
                  rows={3}
                  value={state.creative_block_notes ?? ""}
                  onChange={(e) =>
                    set("creative_block_notes", e.target.value || null)
                  }
                  placeholder="O que estava travando e como destravou."
                />
              </Field>

              {loaded.stage_history.length > 0 && (
                <Field label="Histórico de stages">
                  <div className="space-y-1">
                    {loaded.stage_history.map((h, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                      >
                        <StageBadge stage={h.stage} />
                        <span className="text-muted-foreground">
                          {formatDate(h.entered_at)}
                          {h.exited_at && ` → ${formatDate(h.exited_at)}`}
                        </span>
                        {h.gate && (
                          <span
                            className={cn(
                              "ml-auto rounded px-1.5 py-0.5",
                              h.gate.decision === "approved"
                                ? "bg-emerald-500/20 text-emerald-500"
                                : "bg-amber-500/20 text-amber-500"
                            )}
                          >
                            {h.gate.gate_id}:{" "}
                            {h.gate.decision === "approved"
                              ? "aprovado"
                              : "reprovado"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Field>
              )}
            </TabsContent>
          )}

          {/* ===== CRIATIVIDADE ===== */}
          {isEdit && loaded && (
            <TabsContent value="flow">
              <FlowSessionPanel trackId={loaded.id} />
            </TabsContent>
          )}
        </Tabs>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => confirmClose(false, () => onOpenChange(false))}
            disabled={saving}
          >
            Fechar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {track ? "Salvar alterações" : "Criar track"}
          </Button>
        </div>
      </DialogContent>

      {activeGate && (
        <GateDialog
          open={!!gateOpen}
          onOpenChange={(v) => !v && setGateOpen(null)}
          gate={activeGate}
          onDecide={onGateDecide}
        />
      )}
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
