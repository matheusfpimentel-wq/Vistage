import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { InfoHint } from "@/components/ui/tooltip";
import { AutoGrowInput } from "./AutoGrowInput";
import type { PartyStage } from "../types";
import { createPartyTask, getPreviousEditionDebrief, updatePartyStage } from "../api";

// Guarda de concorrência do backfill entre remounts (painel desmonta ao colapsar).
const ideaBackfilling = new Set<number>();

type PrevDebrief = { editionLabel: string | null; plus: string[]; delta: string[] };

/**
 * Painel da etapa Ideação — 4 campos enxutos (Conceito · Objetivo · Público-alvo
 * · Referências) em inputs de 1 linha com auto-grow; explicações só no "?". Se a
 * festa é de série e a edição anterior tem Delta/Plus, mostra um bloco read-only
 * "Da edição anterior" com ação de virar tarefa. Migra Tema/Motivação uma vez.
 */
export function IdeacaoStagePanel({
  partyId,
  stage,
  onReload,
}: {
  partyId: number;
  stage: PartyStage;
  onReload: () => Promise<void>;
}) {
  const f = stage.fields;
  const [conceito, setConceito] = useState(typeof f.conceito === "string" ? f.conceito : "");
  const [objetivo, setObjetivo] = useState(typeof f.objetivo === "string" ? f.objetivo : "");
  const [publicoAlvo, setPublicoAlvo] = useState(typeof f.publico_alvo === "string" ? f.publico_alvo : "");
  const [referencias, setReferencias] = useState(typeof f.referencias === "string" ? f.referencias : "");

  const [prev, setPrev] = useState<PrevDebrief | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  useEffect(() => {
    void getPreviousEditionDebrief(partyId).then(setPrev).catch(() => setPrev(null));
  }, [partyId]);

  const saveField = useCallback(
    async (key: string, value: string) => {
      try {
        await updatePartyStage(stage.id, { fields: { ...stage.fields, _idea_migrated: "1", [key]: value.trim() || null } });
        await onReload();
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [stage.id, stage.fields, onReload]
  );

  // ===== backfill: Tema → Conceito; Motivação → Objetivo (uma vez) =====
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || f._idea_migrated || ideaBackfilling.has(stage.id)) return;
    backfilled.current = true;
    ideaBackfilling.add(stage.id);
    void runBackfill().finally(() => ideaBackfilling.delete(stage.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    try {
      const tema = typeof f.tema === "string" ? f.tema.trim() : "";
      const motivacao = typeof f.motivacao === "string" ? f.motivacao.trim() : "";
      const curConceito = typeof f.conceito === "string" ? f.conceito.trim() : "";
      const curObjetivo = typeof f.objetivo === "string" ? f.objetivo.trim() : "";

      const nextConceito = tema && !curConceito.includes(tema)
        ? [curConceito, `Tema: ${tema}`].filter(Boolean).join(" — ")
        : curConceito;
      const nextObjetivo = curObjetivo || motivacao;

      await updatePartyStage(stage.id, {
        fields: { ...f, conceito: nextConceito || null, objetivo: nextObjetivo || null, _idea_migrated: "1" },
      });
      if (nextConceito !== curConceito) setConceito(nextConceito);
      if (nextObjetivo !== curObjetivo) setObjetivo(nextObjetivo);
      await onReload();
    } catch (e) {
      toast.error(`Não consegui migrar a Ideação: ${String(e)}`);
    }
  }

  async function criarTarefa(text: string) {
    try {
      await createPartyTask({
        party_id: partyId, stage_id: stage.id, title: text,
        status: "pendente", priority: "Média", due_date: null, notes: null,
        responsavel_contact_id: null,
      });
      toast.success("Tarefa criada");
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-3">
      {prev && (prev.delta.length > 0 || prev.plus.length > 0) && (
        <div className="rounded-md border border-primary/30 bg-primary/5">
          <button
            type="button"
            onClick={() => setPrevOpen((s) => !s)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-sm font-medium">
              Da edição anterior{prev.editionLabel ? ` (${prev.editionLabel})` : ""}
            </span>
            {prevOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {prevOpen && (
            <div className="space-y-2 border-t p-3">
              {prev.delta.length > 0 && (
                <PrevList title="O que mudar (Delta)" items={prev.delta} onTask={criarTarefa} />
              )}
              {prev.plus.length > 0 && (
                <PrevList title="O que manter (Plus)" items={prev.plus} onTask={criarTarefa} />
              )}
            </div>
          )}
        </div>
      )}

      <Field
        label="Conceito"
        hint="O que é essa festa em 1-3 linhas: conceito + tema + o que a torna diferente."
      >
        <AutoGrowInput value={conceito} onChange={setConceito} onBlur={() => void saveField("conceito", conceito)} placeholder="O que é essa festa…" />
      </Field>
      <Field
        label="Objetivo"
        hint="O que a festa precisa alcançar — o critério de sucesso que a Concretização vai avaliar. Ex.: resultado financeiro, construir audiência própria, ocupar uma data, posicionamento."
      >
        <AutoGrowInput value={objetivo} onChange={setObjetivo} onBlur={() => void saveField("objetivo", objetivo)} placeholder="O que essa festa precisa alcançar…" />
      </Field>
      <Field label="Público-alvo" hint="Pra quem é. O Marketing pré-preenche a partir daqui.">
        <AutoGrowInput value={publicoAlvo} onChange={setPublicoAlvo} onBlur={() => void saveField("publico_alvo", publicoAlvo)} placeholder="Pra quem é…" />
      </Field>
      <Field label="Referências e inspirações">
        <AutoGrowInput value={referencias} onChange={setReferencias} onBlur={() => void saveField("referencias", referencias)} placeholder="Referências, inspirações…" />
      </Field>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </label>
      {children}
    </div>
  );
}

function PrevList({ title, items, onTask }: { title: string; items: string[]; onTask: (t: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{it}</span>
            <button
              type="button"
              onClick={() => onTask(it)}
              className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
              title="Criar tarefa a partir deste item"
            >
              <Plus className="h-3 w-3" /> tarefa
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
