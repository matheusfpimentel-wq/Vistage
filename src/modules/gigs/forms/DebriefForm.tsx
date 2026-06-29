import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Film, Loader2, X } from "lucide-react";
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
import { clearGigMarkers, loadGigMarkers, STRONG_TIPO_LABEL, WEAK_TIPO_LABEL, type SessionMarkers } from "@/modules/foco/api";
import {
  addFanInteraction,
  checkAndUpgradeFan,
  listFanInteractions,
  setGigFans,
} from "@/modules/fans/api";
import { formatDate, formatRating } from "@/lib/format";
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

/** Permite ao GigForm finalizar o debrief embutido pelo seu próprio "Salvar". */
export type DebriefHandle = { commit: () => Promise<void> };

export const DebriefForm = forwardRef<DebriefHandle, Props>(function DebriefForm({
  gig,
  onCompleted,
  embedded = false,
  open: openProp,
  onOpenChange,
  required = false,
}: Props, ref) {
  const navigate = useNavigate();
  // No modo embutido está sempre "aberto" (a aba do GigForm controla a montagem).
  const open = embedded ? true : openProp ?? false;
  const [state, setState] = useState<DebriefState>(() => gigToDebrief(gig));
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Garante que os insights só sejam gerados UMA vez por sessão (o "Salvar" do
  // GigForm pode finalizar o debrief várias vezes — não pode duplicar ideias).
  const insightsFlushed = useRef(false);
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
  // Marcadores ao vivo do Modo Foco ligados a esta GIG (erro→fracos, momento→fortes).
  const [liveMarkers, setLiveMarkers] = useState<SessionMarkers | null>(null);

  // hidrata do rascunho ao abrir (se houver) — rascunho tem prioridade sobre o banco
  // já que representa edição mais recente não-confirmada.
  useEffect(() => {
    if (!open) return;
    skipNextSave.current = true;
    insightsFlushed.current = false;
    setTasksToCreate([]);
    try {
      setFansPresent(
        gig.fans_present ? (JSON.parse(gig.fans_present) as number[]) : []
      );
    } catch {
      setFansPresent([]);
    }
    void loadGigMarkers(gig.id).then(setLiveMarkers).catch(() => setLiveMarkers(null));
    (async () => {
      const draft = await loadDebriefDraft(gig.id);
      const base = gigToDebrief(gig);
      if (draft) {
        const merged = { ...base, ...(draft as DebriefState) };
        // Avaliações vindas do sync do celular (gravadas NA GIG) não podem ser
        // apagadas por um rascunho antigo que ainda estava sem nota: se o rascunho
        // está null e a GIG tem nota, a da GIG vence (senão a estrela "some").
        for (const k of [
          "rating_charisma",
          "rating_technique",
          "rating_repertoire",
          "rating_contractor",
        ] as const) {
          if (merged[k] == null && base[k] != null) merged[k] = base[k];
        }
        setState(merged);
      } else {
        setState(base);
      }
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

  /** Joga um resumo dos marcadores ao vivo no fim de um campo (sem apagar o texto). */
  function appendTo(key: "debrief_strengths" | "debrief_weaknesses", line: string) {
    setState((s) => {
      const cur = (s[key] ?? "").trim();
      return { ...s, [key]: cur ? `${cur}\n${line}` : line };
    });
  }

  /** Apaga os marcadores ao vivo desta GIG (o "x" do bloco) pra não ficarem pra
   *  sempre — o texto que você já copiou pros campos permanece. */
  async function clearMarkers() {
    const ok = await confirmDialog({
      title: "Apagar marcadores ao vivo",
      description:
        "Remove os pontos fortes/fracos marcados ao vivo no Modo Foco desta GIG. O que você já copiou pros campos fica. Apagar?",
      confirmLabel: "Apagar",
      destructive: true,
    });
    if (!ok) return;
    try {
      await clearGigMarkers(gig.id);
      setLiveMarkers(null);
    } catch (e) {
      toast.error(`Erro ao apagar: ${String(e)}`);
    }
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
    // formatDate (date-fns parseISO) lê a data-only como LOCAL — toLocaleDateString
    // sobre new Date("YYYY-MM-DD") interpretava UTC e gravava o dia anterior no BR.
    const gigDate = gig.date ? formatDate(gig.date, "dd/MM") : "";

    // As dificuldades (pontos fracos) NÃO viram ideia — passam a aparecer como
    // insight no "dado de insights" (lê debrief_weaknesses), pra refletir sem
    // poluir o módulo Ideias.

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

  /** Registra (silenciosamente) a presença dos fãs marcados — dedup por fã+GIG. */
  async function registerFansPresence() {
    if (fansPresent.length === 0) return;
    const date = (gig.date ?? new Date().toISOString()).slice(0, 10);
    const where = gig.event_name || gig.venue_name || "GIG";
    const note = `Presença em GIG: ${where}`;
    for (const fanId of fansPresent) {
      try {
        const existing = await listFanInteractions(fanId);
        if (existing.some((i) => i.type === "Presença" && i.note === note)) continue;
        await addFanInteraction(fanId, date, note, "Presença");
        await checkAndUpgradeFan(fanId).catch(() => {});
      } catch {
        /* best-effort — não interrompe */
      }
    }
    try {
      await setGigFans(gig.id, fansPresent);
    } catch {
      /* best-effort */
    }
  }

  /**
   * Grava o debrief na GIG. `finalize` marca como concluído (precisa estar
   * completo). Cria tarefas pendentes, alimenta os fãs presentes (presença →
   * interação) e — só na PRIMEIRA finalização — gera os insights. NÃO fecha nem
   * avisa: quem chama cuida disso (botões do diálogo ou o "Salvar" do GigForm).
   * Retorna quantos insights foram criados.
   */
  async function persistDebrief(finalize: boolean): Promise<number> {
    const firstFinalize = finalize && !gig.debrief_completed_at && !insightsFlushed.current;
    const completedAt = finalize ? (gig.debrief_completed_at ?? new Date().toISOString()) : null;
    await updateGig({
      id: gig.id,
      ...state,
      fans_present: fansPresent.length > 0 ? JSON.stringify(fansPresent) : null,
      debrief_pending: finalize ? 0 : 1,
      ...(finalize ? { debrief_completed_at: completedAt } : {}),
    });
    if (finalize) await clearDebriefDraft(gig.id);
    await flushDebriefTasks();
    await registerFansPresence();
    if (firstFinalize) {
      insightsFlushed.current = true;
      return flushDebriefInsights(gig, state);
    }
    return 0;
  }

  async function saveAsPending() {
    setSaving(true);
    try {
      await persistDebrief(false);
      toast.warning("Debrief salvo como pendente: finalize quando puder.");
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
      const insightCount = await persistDebrief(true);
      toast.success(
        insightCount > 0
          ? `Debrief finalizado! ${insightCount} insight${insightCount !== 1 ? "s" : ""} em Ideias.`
          : "Debrief finalizado!"
      );
      onCompleted();
      onOpenChange?.(false);
    } catch (e) {
      toast.error(`Erro ao salvar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  // O "Salvar" do GigForm finaliza o debrief embutido por aqui (sem fechar/avisar
  // — o GigForm cuida do seu próprio toast e refresh).
  useImperativeHandle(ref, () => ({
    commit: async () => {
      await persistDebrief(complete);
    },
  }));

  /** Navega para o módulo de conteúdo já pré-preenchendo o título com a GIG. */
  function handleCreateContent() {
    const title = gig.event_name || gig.venue_name || "GIG";
    navigate(`/conteudo?title=${encodeURIComponent(title)}`);
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
            {liveMarkers && (liveMarkers.moments.length > 0 || liveMarkers.weakPoints.length > 0) && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Marcado ao vivo no Modo Foco
                  </p>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void clearMarkers()}
                    aria-label="Apagar marcadores ao vivo"
                    title="Apagar marcadores ao vivo"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {liveMarkers.momentsByTipo.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Pontos fortes:
                    </span>
                    {liveMarkers.momentsByTipo.map((m) => (
                      <span key={m.tipo} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                        {STRONG_TIPO_LABEL[m.tipo] ?? m.tipo} ×{m.count}
                      </span>
                    ))}
                    <button
                      type="button"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        appendTo(
                          "debrief_strengths",
                          `Pontos fortes (marcado ao vivo): ${liveMarkers.momentsByTipo.map((m) => `${STRONG_TIPO_LABEL[m.tipo] ?? m.tipo} ×${m.count}`).join(", ")}`
                        )
                      }
                    >
                      usar
                    </button>
                  </div>
                )}
                {liveMarkers.weakByTipo.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      Pontos fracos:
                    </span>
                    {liveMarkers.weakByTipo.map((w) => (
                      <span key={w.tipo} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        {WEAK_TIPO_LABEL[w.tipo] ?? w.tipo} ×{w.count}
                      </span>
                    ))}
                    <button
                      type="button"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        appendTo(
                          "debrief_weaknesses",
                          `A melhorar (marcado ao vivo): ${liveMarkers.weakByTipo.map((w) => `${WEAK_TIPO_LABEL[w.tipo] ?? w.tipo} ×${w.count}`).join(", ")}`
                        )
                      }
                    >
                      usar
                    </button>
                  </div>
                )}
              </div>
            )}
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
              label="Carisma: presença de palco, conexão com o público"
              required
              value={state.rating_charisma}
              note={state.rating_charisma_note}
              onChange={(v) => set("rating_charisma", v)}
              onNoteChange={(n) => set("rating_charisma_note", n)}
            />
            <RatingSlider
              label="Técnica: mixagem, transições, leitura de pista"
              required
              value={state.rating_technique}
              note={state.rating_technique_note}
              onChange={(v) => set("rating_technique", v)}
              onNoteChange={(n) => set("rating_technique_note", n)}
            />
            <RatingSlider
              label="Repertório: escolhas musicais, curadoria do set"
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

            {/* Os fãs marcados aqui ganham a interação de presença ao salvar o
                debrief — não precisa mais de um botão separado. */}
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

        {/* Embutido no GigForm: sem botões próprios — o "Salvar alterações" do
            GigForm finaliza o debrief (via commit). Avulso: mantém os botões. */}
        {embedded ? (
          <p className="pt-1 text-xs text-muted-foreground">
            As avaliações e tudo daqui são salvos junto com o botão{" "}
            <strong>Salvar alterações</strong> da GIG.
          </p>
        ) : (
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            {required && !complete && (
              <Button variant="outline" onClick={saveAsPending} disabled={saving}>
                Salvar como pendente
              </Button>
            )}
            {!required && (
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
        )}
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
});

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
