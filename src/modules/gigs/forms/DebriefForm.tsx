import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Film, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { confirmDialog } from "@/components/ui/confirm";
import { RatingSlider } from "../components/RatingSlider";
import { DebriefTasks, type PendingDebriefTask } from "../components/DebriefTasks";
import { FansPresentPicker } from "../components/FansPresentPicker";
import { averageRating, type Gig } from "../types";
import {
  clearDebriefDraft,
  loadDebriefDraft,
  saveDebriefDraft,
  updateGig,
} from "../api";
import { createTask } from "@/modules/tasks/api";
import { createIdea } from "@/modules/ideas/api";
import {
  addFanInteraction,
  checkAndUpgradeFan,
  listFanInteractions,
  setGigFans,
} from "@/modules/fans/api";
import { formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  gig: Gig;
  onCompleted: () => void;
  /** Modo embutido (aba do GigForm): renderiza o conteúdo sem o diálogo. */
  embedded?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Se true, dispara em modo "obrigatório" (quando o status acabou de virar Concluída). */
  required?: boolean;
};

type DebriefState = Pick<
  Gig,
  | "debrief_strengths"
  | "debrief_weaknesses"
  | "debrief_learnings"
  | "debrief_opportunities_used"
  | "debrief_future_opportunities"
  | "debrief_promoter_feedback"
  | "debrief_technical_notes"
  | "debrief_media_content"
  | "rating_charisma"
  | "rating_charisma_note"
  | "rating_technique"
  | "rating_technique_note"
  | "rating_repertoire"
  | "rating_repertoire_note"
  | "rating_contractor"
  | "is_special"
>;

function gigToDebrief(gig: Gig): DebriefState {
  return {
    debrief_strengths: gig.debrief_strengths,
    debrief_weaknesses: gig.debrief_weaknesses,
    debrief_learnings: gig.debrief_learnings,
    debrief_opportunities_used: gig.debrief_opportunities_used,
    debrief_future_opportunities: gig.debrief_future_opportunities,
    debrief_promoter_feedback: gig.debrief_promoter_feedback,
    debrief_technical_notes: gig.debrief_technical_notes,
    debrief_media_content: gig.debrief_media_content,
    rating_charisma: gig.rating_charisma,
    rating_charisma_note: gig.rating_charisma_note,
    rating_technique: gig.rating_technique,
    rating_technique_note: gig.rating_technique_note,
    rating_repertoire: gig.rating_repertoire,
    rating_repertoire_note: gig.rating_repertoire_note,
    rating_contractor: gig.rating_contractor ?? null,
    is_special: gig.is_special ?? 0,
  };
}

function isComplete(state: DebriefState): boolean {
  // Pontos fortes/fracos/insights deixaram de ser obrigatórios — basta as
  // três avaliações pra considerar o debrief completo.
  return (
    state.rating_charisma !== null &&
    state.rating_technique !== null &&
    state.rating_repertoire !== null
  );
}

export function DebriefForm({
  gig,
  onCompleted,
  embedded = false,
  open: openProp,
  onOpenChange,
  required = false,
}: Props) {
  const navigate = useNavigate();
  // No modo embutido está sempre "aberto" (a aba do GigForm controla a montagem).
  const open = embedded ? true : openProp ?? false;
  const [state, setState] = useState<DebriefState>(() => gigToDebrief(gig));
  const [saving, setSaving] = useState(false);
  const [registeringFans, setRegisteringFans] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [tasksToCreate, setTasksToCreate] = useState<PendingDebriefTask[]>([]);
  const [fansPresent, setFansPresent] = useState<number[]>(() => {
    try {
      return gig.fans_present ? (JSON.parse(gig.fans_present) as number[]) : [];
    } catch {
      return [];
    }
  });
  const draftTimer = useRef<number | null>(null);
  const skipNextSave = useRef(true);

  // hidrata do rascunho ao abrir (se houver) — rascunho tem prioridade sobre o banco
  // já que representa edição mais recente não-confirmada.
  useEffect(() => {
    if (!open) return;
    skipNextSave.current = true;
    setTasksToCreate([]);
    try {
      setFansPresent(
        gig.fans_present ? (JSON.parse(gig.fans_present) as number[]) : []
      );
    } catch {
      setFansPresent([]);
    }
    (async () => {
      const draft = await loadDebriefDraft(gig.id);
      if (draft) setState({ ...gigToDebrief(gig), ...(draft as DebriefState) });
      else setState(gigToDebrief(gig));
      // libera autosave após o estado inicial
      window.setTimeout(() => {
        skipNextSave.current = false;
      }, 200);
    })();
  }, [open, gig]);

  // autosave debounced (1.5s) sempre que o state muda
  useEffect(() => {
    if (!open) return;
    if (skipNextSave.current) return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(async () => {
      try {
        await saveDebriefDraft(gig.id, state as unknown as Record<string, unknown>);
        setLastSavedAt(new Date());
      } catch {
        /* silencioso — não interrompe o usuário */
      }
    }, 1500);
    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [state, open, gig.id]);

  function set<K extends keyof DebriefState>(key: K, value: DebriefState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  /** Cria todas as tarefas a partir do debrief (chamado ao salvar). */
  async function flushDebriefTasks() {
    for (const t of tasksToCreate) {
      try {
        await createTask({
          title: t.title,
          description: `Originada no debrief de ${gig.venue_name}.`,
          category: "GIG",
          gig_id: gig.id,
          contact_id: gig.promoter_contact_id,
          priority: "Média",
          status: "A fazer",
          due_date: t.dueDate,
          tags: ["do-debrief"],
        });
      } catch {
        /* não interrompe */
      }
    }
    setTasksToCreate([]);
  }

  async function flushDebriefInsights(gig: Gig, state: DebriefState): Promise<number> {
    let count = 0;
    const gigDate = gig.date
      ? new Date(gig.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
      : "";

    // One idea per "pontos fracos" line
    if (state.debrief_weaknesses) {
      const lines = state.debrief_weaknesses
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of lines) {
        try {
          await createIdea({
            title: `Dificuldade GIG: ${gig.venue_name} — ${line.slice(0, 60)}`,
            body: line,
            category: "GIG",
            maturation: "Embrião",
            heat: 2,
            tags: ["debrief", "ponto-fraco"],
            converted_to: null,
            converted_id: null,
          });
          count++;
        } catch {
          /* não interrompe */
        }
      }
    }

    // Overall learnings
    if (state.debrief_learnings && state.debrief_learnings.trim()) {
      try {
        await createIdea({
          title: `Insight GIG: ${gig.venue_name}${gigDate ? ` (${gigDate})` : ""}`,
          body: state.debrief_learnings,
          category: "GIG",
          maturation: "Embrião",
          heat: 2,
          tags: ["debrief", "insight"],
          converted_to: null,
          converted_id: null,
        });
        count++;
      } catch {
        /* não interrompe */
      }
    }

    // Future opportunities
    if (state.debrief_future_opportunities && state.debrief_future_opportunities.trim()) {
      try {
        await createIdea({
          title: `Oportunidade: ${state.debrief_future_opportunities.slice(0, 60)}`,
          body: state.debrief_future_opportunities,
          category: "GIG",
          maturation: "Embrião",
          heat: 3,
          tags: ["debrief", "oportunidade"],
          converted_to: null,
          converted_id: null,
        });
        count++;
      } catch {
        /* não interrompe */
      }
    }

    return count;
  }

  const complete = useMemo(() => isComplete(state), [state]);
  const avg = useMemo(() => averageRating(state), [state]);

  async function saveAsPending() {
    setSaving(true);
    try {
      await updateGig({
        id: gig.id,
        ...state,
        fans_present: fansPresent.length > 0 ? JSON.stringify(fansPresent) : null,
        debrief_pending: 1,
      });
      await flushDebriefTasks();
      toast.warning("Debrief salvo como pendente — finalize quando puder.");
      onCompleted();
      onOpenChange?.(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsComplete() {
    if (!complete) {
      toast.error("Preencha as três avaliações para concluir o debrief.");
      return;
    }
    setSaving(true);
    try {
      // só registra debrief_completed_at na primeira vez que ficar completo
      const completedAt = gig.debrief_completed_at ?? new Date().toISOString();
      await updateGig({
        id: gig.id,
        ...state,
        fans_present: fansPresent.length > 0 ? JSON.stringify(fansPresent) : null,
        debrief_pending: 0,
        debrief_completed_at: completedAt,
      });
      await clearDebriefDraft(gig.id);
      await flushDebriefTasks();
      const insightCount = await flushDebriefInsights(gig, state);
      toast.success(`Debrief finalizado! ${insightCount} insight${insightCount !== 1 ? "s" : ""} criado${insightCount !== 1 ? "s" : ""} em Ideias.`);
      onCompleted();
      onOpenChange?.(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  /** Navega para o módulo de conteúdo já pré-preenchendo o título com a GIG. */
  function handleCreateContent() {
    const title = gig.event_name || gig.venue_name || "GIG";
    navigate(`/conteudo?title=${encodeURIComponent(title)}`);
  }

  /** Registra uma interação para cada fã marcado como presente na GIG. */
  async function handleRegisterFans() {
    if (fansPresent.length === 0) {
      toast.warning("Nenhum fã marcado como presente.");
      return;
    }
    setRegisteringFans(true);
    const date = (gig.date ?? new Date().toISOString()).slice(0, 10);
    const where = gig.event_name || gig.venue_name || "GIG";
    const note = `Presença em GIG: ${where}`;
    let count = 0;
    for (const fanId of fansPresent) {
      try {
        // evita duplicar a interação de Presença para o mesmo fã+GIG
        const existing = await listFanInteractions(fanId);
        const already = existing.some(
          (i) => i.type === "Presença" && i.note === note
        );
        if (already) continue;
        await addFanInteraction(fanId, date, note, "Presença");
        await checkAndUpgradeFan(fanId).catch(() => {});
        count++;
      } catch {
        /* best-effort — não interrompe */
      }
    }
    // persiste a presença na tabela gig_fans (best-effort)
    try {
      await setGigFans(gig.id, fansPresent);
    } catch {
      /* best-effort — não interrompe */
    }
    setRegisteringFans(false);
    if (count > 0) {
      toast.success(
        `${count} fã${count !== 1 ? "s" : ""} registrado${count !== 1 ? "s" : ""} com interação.`
      );
    } else {
      toast.error("Não foi possível registrar os fãs.");
    }
  }

  // Quando o debrief é obrigatório (status acabou de virar Concluída),
  // não dá pra simplesmente fechar — o usuário precisa ou completar ou
  // marcar como pendente. Interceptamos o close.
  async function handleOpenChange(next: boolean) {
    if (!next && required && !complete) {
      const ok = await confirmDialog(
        "Você ainda não preencheu todos os campos obrigatórios. " +
          "Deseja salvar como 'pendente' e terminar depois?"
      );
      if (ok) void saveAsPending();
      // se cancelar, mantém o modal aberto
      return;
    }
    onOpenChange?.(next);
  }

  const body = (
    <>
      <p className="text-sm text-muted-foreground">
        Rascunho salvo automaticamente.
        {lastSavedAt && (
          <span className="ml-2 text-xs">
            · salvo às {lastSavedAt.toLocaleTimeString("pt-BR")}
          </span>
        )}
      </p>

      <Tabs defaultValue="learn" className="w-full">
          <TabsList>
            <TabsTrigger value="learn">Insights</TabsTrigger>
            <TabsTrigger value="ratings">
              Avaliações
              {avg !== null && (
                <span className="ml-2 rounded bg-amber-500/20 px-1.5 text-xs text-amber-500">
                  {formatRating(avg)}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="more">Outros</TabsTrigger>
            <TabsTrigger value="tasks">
              Tarefas
              {tasksToCreate.length > 0 && (
                <span className="ml-2 rounded bg-primary/20 px-1.5 text-xs text-primary">
                  {tasksToCreate.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ============ INSIGHTS ============ */}
          <TabsContent value="learn" className="space-y-4">
            <DebriefField
              label="Pontos fortes da apresentação"
              compact
              value={state.debrief_strengths}
              onChange={(v) => set("debrief_strengths", v)}
            />
            <DebriefField
              label="Pontos fracos da apresentação"
              compact
              value={state.debrief_weaknesses}
              onChange={(v) => set("debrief_weaknesses", v)}
            />
            <DebriefField
              label="Insights"
              compact
              value={state.debrief_learnings}
              onChange={(v) => set("debrief_learnings", v)}
            />
          </TabsContent>

          {/* ============ AVALIAÇÕES ============ */}
          <TabsContent value="ratings" className="space-y-6">
            <RatingSlider
              label="Carisma — presença de palco, conexão com o público"
              required
              value={state.rating_charisma}
              note={state.rating_charisma_note}
              onChange={(v) => set("rating_charisma", v)}
              onNoteChange={(n) => set("rating_charisma_note", n)}
            />
            <RatingSlider
              label="Técnica — mixagem, transições, leitura de pista"
              required
              value={state.rating_technique}
              note={state.rating_technique_note}
              onChange={(v) => set("rating_technique", v)}
              onNoteChange={(n) => set("rating_technique_note", n)}
            />
            <RatingSlider
              label="Repertório — escolhas musicais, curadoria do set"
              required
              value={state.rating_repertoire}
              note={state.rating_repertoire_note}
              onChange={(v) => set("rating_repertoire", v)}
              onNoteChange={(n) => set("rating_repertoire_note", n)}
            />
            <RatingSlider
              label="Avaliação do Contratante (opcional)"
              value={state.rating_contractor}
              note={null}
              onChange={(v) => set("rating_contractor", v)}
              onNoteChange={() => undefined}
            />
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <span className="text-sm">GIG Especial ⭐</span>
                <p className="text-xs text-muted-foreground">Conta como bônus na média de avaliação</p>
              </div>
              <div className="inline-flex rounded-md border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => set("is_special", 0)}
                  className={cn(
                    "px-3 py-1.5 transition",
                    !state.is_special
                      ? "bg-muted text-foreground font-medium"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  )}
                >
                  Não
                </button>
                <button
                  type="button"
                  onClick={() => set("is_special", 1)}
                  className={cn(
                    "border-l px-3 py-1.5 transition",
                    state.is_special
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
                      : "bg-background text-muted-foreground hover:bg-accent"
                  )}
                >
                  Sim ⭐
                </button>
              </div>
            </div>
            {avg !== null && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Média geral: </span>
                <span className="text-lg font-semibold text-amber-500">
                  {formatRating(avg)}
                </span>
                <span className="text-muted-foreground"> / 5,0</span>
              </div>
            )}
          </TabsContent>

          {/* ============ OUTROS ============ */}
          <TabsContent value="more" className="space-y-4">
            <DebriefField
              label="Oportunidades aproveitadas durante a GIG"
              value={state.debrief_opportunities_used}
              onChange={(v) => set("debrief_opportunities_used", v)}
            />
            <DebriefField
              label="Oportunidades futuras (o que essa GIG abriu)"
              value={state.debrief_future_opportunities}
              onChange={(v) => set("debrief_future_opportunities", v)}
            />
            <DebriefField
              label="Observações técnicas (som, equipamento, setup)"
              value={state.debrief_technical_notes}
              onChange={(v) => set("debrief_technical_notes", v)}
            />

            <FansPresentPicker value={fansPresent} onChange={setFansPresent} />

            {/* ===== LOOP PÓS-GIG ===== */}
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium">Fechar o loop da GIG</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCreateContent}
                >
                  <Film className="h-3.5 w-3.5" /> Criar conteúdo sobre esta GIG
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRegisterFans()}
                  disabled={registeringFans || fansPresent.length === 0}
                >
                  {registeringFans ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Heart className="h-3.5 w-3.5 text-red-400" />
                  )}
                  Registrar fãs{fansPresent.length > 0 ? ` (${fansPresent.length})` : ""}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ============ TAREFAS A PARTIR DISSO ============ */}
          <TabsContent value="tasks">
            <DebriefTasks items={tasksToCreate} onChange={setTasksToCreate} />
          </TabsContent>
        </Tabs>

        {required && !complete && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Esta GIG foi marcada como <strong>Concluída</strong>. Preencha as
              três avaliações (carisma, técnica, repertório) ou salve como
              pendente para terminar depois.
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          {required && !complete && (
            <Button variant="outline" onClick={saveAsPending} disabled={saving}>
              Salvar como pendente
            </Button>
          )}
          {!required && !embedded && (
            <Button
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={saving}
            >
              Fechar
            </Button>
          )}
          <Button onClick={saveAsComplete} disabled={saving || !complete}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {gig.debrief_completed_at ? "Atualizar debrief" : "Finalizar debrief"}
          </Button>
        </div>
      </>
    );

  if (embedded) {
    return <div className="space-y-4 pt-2">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl"
        hideClose={required && !complete}
        onPointerDownOutside={(e) => {
          if (required && !complete) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (required && !complete) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Debrief — {gig.venue_name}
            {complete ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              required && (
                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-normal text-amber-500">
                  obrigatório
                </span>
              )
            )}
          </DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function DebriefField({
  label,
  value,
  required,
  compact,
  onChange,
}: {
  label: string;
  value: string | null;
  required?: boolean;
  compact?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Textarea
        rows={compact ? 2 : 4}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
