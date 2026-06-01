import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { formatRating } from "@/lib/format";
import { GigSetlist } from "./GigSetlist";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gig: Gig;
  /** Se true, dispara em modo "obrigatório" (quando o status acabou de virar Concluída). */
  required: boolean;
  onCompleted: () => void;
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
  };
}

function isComplete(state: DebriefState): boolean {
  const has = (s: string | null) => !!s && s.trim().length > 0;
  return (
    has(state.debrief_strengths) &&
    has(state.debrief_weaknesses) &&
    has(state.debrief_learnings) &&
    state.rating_charisma !== null &&
    state.rating_technique !== null &&
    state.rating_repertoire !== null
  );
}

export function DebriefForm({
  open,
  onOpenChange,
  gig,
  required,
  onCompleted,
}: Props) {
  const [state, setState] = useState<DebriefState>(() => gigToDebrief(gig));
  const [saving, setSaving] = useState(false);
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
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAsComplete() {
    if (!complete) {
      toast.error(
        "Preencha pontos fortes, fracos, insights e as três avaliações."
      );
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
      toast.success("Debrief finalizado!");
      onCompleted();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // Quando o debrief é obrigatório (status acabou de virar Concluída),
  // não dá pra simplesmente fechar — o usuário precisa ou completar ou
  // marcar como pendente. Interceptamos o close.
  function handleOpenChange(next: boolean) {
    if (!next && required && !complete) {
      const ok = window.confirm(
        "Você ainda não preencheu todos os campos obrigatórios. " +
          "Deseja salvar como 'pendente' e terminar depois?"
      );
      if (ok) void saveAsPending();
      // se cancelar, mantém o modal aberto
      return;
    }
    onOpenChange(next);
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
          <DialogDescription>
            Rascunho salvo automaticamente.
            {lastSavedAt && (
              <span className="ml-2 text-xs">
                · salvo às {lastSavedAt.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

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
            <TabsTrigger value="setlist">Setlist</TabsTrigger>
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
              required
              value={state.debrief_strengths}
              onChange={(v) => set("debrief_strengths", v)}
            />
            <DebriefField
              label="Pontos fracos da apresentação"
              required
              value={state.debrief_weaknesses}
              onChange={(v) => set("debrief_weaknesses", v)}
            />
            <DebriefField
              label="Insights"
              required
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
              label="Feedback do promoter / casa"
              value={state.debrief_promoter_feedback}
              onChange={(v) => set("debrief_promoter_feedback", v)}
            />
            <DebriefField
              label="Observações técnicas (som, equipamento, setup)"
              value={state.debrief_technical_notes}
              onChange={(v) => set("debrief_technical_notes", v)}
            />
            <DebriefField
              label="Conteúdos / mídia — o que registrar ou pedir"
              value={state.debrief_media_content}
              onChange={(v) => set("debrief_media_content", v)}
            />

            <FansPresentPicker value={fansPresent} onChange={setFansPresent} />
          </TabsContent>

          {/* ============ SETLIST ============ */}
          <TabsContent value="setlist" className="pt-2">
            <GigSetlist gigId={gig.id} />
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
              Esta GIG foi marcada como <strong>Concluída</strong>. Preencha os
              campos obrigatórios (Pontos fortes / fracos / insights + as
              três avaliações) ou salve como pendente para terminar depois.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {required && !complete && (
            <Button variant="outline" onClick={saveAsPending} disabled={saving}>
              Salvar como pendente
            </Button>
          )}
          {!required && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Fechar
            </Button>
          )}
          <Button onClick={saveAsComplete} disabled={saving || !complete}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {gig.debrief_completed_at ? "Atualizar debrief" : "Finalizar debrief"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DebriefField({
  label,
  value,
  required,
  onChange,
}: {
  label: string;
  value: string | null;
  required?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Textarea
        rows={4}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
