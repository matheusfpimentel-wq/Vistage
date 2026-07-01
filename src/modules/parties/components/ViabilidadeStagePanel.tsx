import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrency, toLocalISODate } from "@/lib/format";
import {
  VENUE_DEAL_TYPES,
  VIABILITY_COST_CATEGORIES,
  VIABILITY_DECISIONS,
  venueDealTypeLabel,
  viabilityDecisionLabel,
  type PartyBudgetItem,
  type PartyStage,
  type PartyVenueCandidate,
  type ViabilityCost,
} from "../types";
import {
  addPartyVenueCandidate,
  createPartyBudgetItem,
  deletePartyBudgetItem,
  listPartyVenueCandidates,
  removePartyVenueCandidate,
  setPartyVenueLeader,
  updatePartyBudgetItem,
  updatePartyStage,
  updatePartyVenueCandidate,
} from "../api";
import type { Venue } from "@/modules/venues/types";

type VBlock = "venue" | "premissas" | "custos" | "veredito" | "decisao";

// Marca dos itens de Orçamento criados no backfill (custos_necessarios antigos).
const VIAB_MIGRATED_MARK = "Migrado da Viabilidade";
// Guarda de concorrência do backfill entre remounts (o painel desmonta ao
// colapsar a etapa) — impede rodar o backfill duas vezes em paralelo.
const viabBackfilling = new Set<number>();

/** ViabilityCost.category → categoria de Orçamento (fonte única de dinheiro). */
function mapCostCategory(c: string): string {
  if (c === "Estrutura") return "Infraestrutura";
  return ["Pessoal", "Marketing", "Operacional", "Outros"].includes(c) ? c : "Outros";
}

function pctOf(s: string | null | undefined): number {
  const n = parseFloat(String(s ?? "").replace(",", ".").replace("%", ""));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
function num(s: string | number | null | undefined): number {
  const n = typeof s === "number" ? s : parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

type Premissas = {
  publicoEsperado: number;
  precoMedio: number;
  acordoTipo: string;
  acordoTermos: string;
  acordoValor: number;
  patrocinio: number;
  barPerCapita: number;
};

type Verdict = {
  breakEvenPeople: number | null;
  revPerPerson: number;
  resultado: number;
  receitaBase: number;
  margem: number | null;
  light: "verde" | "ambar" | "vermelho";
  exceedsCapacity: boolean;
};

/**
 * Veredito honesto: quantas pessoas empatam e qual o resultado no público
 * esperado (não na capacidade máxima). Considera preço, o efeito do acordo com
 * a casa (aluguel fixo x % da bilheteria x % do bar x cachê) e extras.
 */
function computeVerdict(p: Premissas, custosProjetados: number, capacity: number | null): Verdict {
  const ticketCutPct = p.acordoTipo === "pct_bilheteria" ? pctOf(p.acordoTermos) : 0;
  const netTicketPerPerson = p.precoMedio * (1 - ticketCutPct / 100);
  const barPerPerson = p.acordoTipo === "pct_bar" ? p.barPerCapita : 0;
  const revPerPerson = netTicketPerPerson + barPerPerson;

  // Receita fixa que abate os custos: patrocínio + cachê da casa (se for o acordo).
  const fixedRevenue = p.patrocinio + (p.acordoTipo === "cache" ? p.acordoValor : 0);
  const fixedToCover = Math.max(0, custosProjetados - fixedRevenue);
  const breakEvenPeople = revPerPerson > 0 ? Math.ceil(fixedToCover / revPerPerson) : null;

  const P = Math.max(0, p.publicoEsperado);
  const receitaBase = P * revPerPerson + fixedRevenue;
  const resultado = receitaBase - custosProjetados;
  const margem = receitaBase > 0 ? resultado / receitaBase : null;

  const exceedsCapacity =
    capacity != null && capacity > 0 && breakEvenPeople != null && breakEvenPeople >= capacity;

  let light: Verdict["light"];
  if (resultado < 0 || exceedsCapacity) light = "vermelho";
  else if (margem != null && margem >= 0.15) light = "verde";
  else light = "ambar";

  return { breakEvenPeople, revPerPerson, resultado, receitaBase, margem, light, exceedsCapacity };
}

/**
 * Painel da etapa Viabilidade — 5 blocos em acordeão (um aberto por vez):
 * Venue & Capacidade · Premissas · Custos (view do Orçamento) · Veredito ·
 * Decisão. A escolha da casa acontece aqui (candidatos → confirmado); os custos
 * vivem no Orçamento (fonte única); o veredito é calculado; explicações ficam
 * atrás de ícones "?" (nada de helper text solto). Migra campos antigos 1x.
 */
export function ViabilidadeStagePanel({
  partyId,
  stage,
  budgetItems,
  venues,
  confirmedVenueId,
  confirmedVenueName,
  expectedCapacity,
  onPatchParty,
  onGoOrcamento,
  onReload,
}: {
  partyId: number;
  stage: PartyStage;
  budgetItems: PartyBudgetItem[];
  venues: Venue[];
  confirmedVenueId: number | null;
  confirmedVenueName: string | null;
  expectedCapacity: number | null;
  onPatchParty: (updates: {
    venue_id?: number | null;
    venue_name?: string | null;
    expected_capacity?: number | null;
  }) => Promise<void>;
  onGoOrcamento: () => void;
  onReload: () => Promise<void>;
}) {
  const [open, setOpen] = useState<VBlock>("venue");
  const [candidates, setCandidates] = useState<PartyVenueCandidate[]>([]);
  const [showDiscarded, setShowDiscarded] = useState(false);

  const f = stage.fields;
  const [publicoEsperado, setPublicoEsperado] = useState(
    f.publico_esperado != null
      ? String(f.publico_esperado)
      : expectedCapacity
      ? String(Math.round(expectedCapacity * 0.7))
      : ""
  );
  const [precoMedio, setPrecoMedio] = useState(f.preco_medio != null ? String(f.preco_medio) : "");
  const [acordoTipo, setAcordoTipo] = useState(typeof f.acordo_tipo === "string" ? f.acordo_tipo : "");
  const [acordoTermos, setAcordoTermos] = useState(typeof f.acordo_termos === "string" ? f.acordo_termos : "");
  const [acordoValor, setAcordoValor] = useState(f.acordo_valor != null ? String(f.acordo_valor) : "");
  const [patrocinio, setPatrocinio] = useState(f.patrocinio != null ? String(f.patrocinio) : "");
  const [barPerCapita, setBarPerCapita] = useState(f.bar_per_capita != null ? String(f.bar_per_capita) : "");
  const [maisExtras, setMaisExtras] = useState(!!(f.patrocinio || f.bar_per_capita));

  const [capDraft, setCapDraft] = useState(expectedCapacity != null ? String(expectedCapacity) : "");
  useEffect(() => {
    setCapDraft(expectedCapacity != null ? String(expectedCapacity) : "");
  }, [expectedCapacity]);

  const reloadCandidates = useCallback(() => {
    void listPartyVenueCandidates(partyId).then(setCandidates);
  }, [partyId]);
  useEffect(() => { reloadCandidates(); }, [reloadCandidates]);

  const confirmedCand = candidates.find((c) => c.venue_id === confirmedVenueId) ?? null;
  const leaderCand =
    candidates.find((c) => c.is_leader) ?? (candidates.length === 1 ? candidates[0] : null);
  const refCand = confirmedCand ?? leaderCand;

  // Herda o acordo do venue de referência quando ainda não foi preenchido.
  const seededAcordo = useRef(false);
  useEffect(() => {
    if (seededAcordo.current || acordoTipo) return;
    if (refCand?.deal_type) {
      seededAcordo.current = true;
      setAcordoTipo(refCand.deal_type);
      if (refCand.deal_terms) setAcordoTermos(refCand.deal_terms);
      if (refCand.estimated_cost != null) setAcordoValor(String(refCand.estimated_cost));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refCand?.id]);

  const custosProjetados = budgetItems.reduce((s, b) => s + (b.projected_amount || 0), 0);
  const topCosts = useMemo(
    () => [...budgetItems].sort((a, b) => (b.projected_amount || 0) - (a.projected_amount || 0)).slice(0, 5),
    [budgetItems]
  );

  const capacityForVerdict = expectedCapacity ?? refCand?.capacity ?? null;
  const verdict = useMemo(
    () =>
      computeVerdict(
        {
          publicoEsperado: num(publicoEsperado),
          precoMedio: num(precoMedio),
          acordoTipo,
          acordoTermos,
          acordoValor: num(acordoValor),
          patrocinio: num(patrocinio),
          barPerCapita: num(barPerCapita),
        },
        custosProjetados,
        capacityForVerdict
      ),
    [publicoEsperado, precoMedio, acordoTipo, acordoTermos, acordoValor, patrocinio, barPerCapita, custosProjetados, capacityForVerdict]
  );

  const decisao = typeof f.decisao === "string" ? f.decisao : "";
  const decisaoCondicao = typeof f.decisao_condicao === "string" ? f.decisao_condicao : "";

  // ===== persistência de campos da etapa =====
  const saveFields = useCallback(
    async (partial: Record<string, string | number | null>) => {
      try {
        await updatePartyStage(stage.id, {
          fields: { ...stage.fields, _viab_migrated: "1", ...partial },
        });
        await onReload();
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [stage.id, stage.fields, onReload]
  );

  // ===== backfill (uma vez) =====
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || f._viab_migrated || viabBackfilling.has(stage.id)) return;
    backfilled.current = true;
    viabBackfilling.add(stage.id);
    void runBackfill().finally(() => viabBackfilling.delete(stage.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    try {
      const notas = typeof f.viabilidade_notas === "string" ? f.viabilidade_notas.trim() : "";
      const preserved = notas ? `[Observações de viabilidade]\n${notas}` : "";
      const nextNotes = [stage.notes ?? "", preserved].filter(Boolean).join("\n\n") || null;
      // Preserva texto + marca migrado ANTES de criar linhas — nada se perde.
      await updatePartyStage(stage.id, { notes: nextNotes, fields: { ...f, _viab_migrated: "1" } });

      let custos: ViabilityCost[] = [];
      try {
        const p = JSON.parse(String(f.custos_necessarios ?? ""));
        if (Array.isArray(p)) custos = p;
      } catch { /* vazio/legado */ }
      // Idempotência: só migra se ainda não há itens marcados como migrados.
      const alreadyMigrated = budgetItems.some((b) => b.premissa === VIAB_MIGRATED_MARK);
      if (custos.length > 0 && !alreadyMigrated) {
        for (const c of custos) {
          if (!(c.amount > 0) && !c.description) continue;
          await createPartyBudgetItem({
            party_id: partyId,
            category: mapCostCategory(c.category),
            subcategory: null,
            description: c.description || "Custo (viabilidade)",
            projected_amount: c.amount || 0,
            actual_amount: null,
            supplier_note: null,
            supplier_id: null,
            status: "projetado",
            date_paid: null,
            premissa: VIAB_MIGRATED_MARK,
            nota_variancia: null,
          });
        }
      }
      await onReload();
    } catch (e) {
      toast.error(`Não consegui migrar a Viabilidade: ${String(e)}`);
    }
  }

  // ===== acordo com a casa → Orçamento (fonte única) =====
  // Aluguel fixo é custo do produtor → vira/atualiza 1 item de Orçamento
  // (rastreado por acordo_budget_id). Se o acordo deixa de ser custo fixo, o
  // item é removido para não fantasmar no Orçamento. Retorna o id resultante
  // (ou null) SEM gravar em stage.fields — quem grava é saveAcordo, num único
  // write atômico junto de tipo/termos/valor (evita clobber entre writes).
  async function syncAcordoBudget(tipo: string, valor: number): Promise<number | null> {
    const existingId = Number(f.acordo_budget_id) || null;
    const isFixedCost = tipo === "aluguel";
    try {
      if (isFixedCost && valor > 0) {
        if (existingId && budgetItems.some((b) => b.id === existingId)) {
          await updatePartyBudgetItem(existingId, { projected_amount: valor });
          await onReload();
          return existingId;
        }
        const newId = await createPartyBudgetItem({
          party_id: partyId,
          category: "Infraestrutura",
          subcategory: "Venue",
          description: "Aluguel do venue",
          projected_amount: valor,
          actual_amount: null,
          supplier_note: null,
          supplier_id: null,
          status: "projetado",
          date_paid: null,
          premissa: "Acordo com a casa (aluguel fixo)",
          nota_variancia: null,
        });
        await onReload();
        return newId;
      }
      if (existingId && budgetItems.some((b) => b.id === existingId)) {
        await deletePartyBudgetItem(existingId);
        await onReload();
        return null;
      }
      return existingId;
    } catch (e) {
      toast.error(`Não consegui sincronizar com o Orçamento: ${String(e)}`);
      return existingId;
    }
  }

  async function saveAcordo(next: { tipo?: string; termos?: string; valor?: string }) {
    const tipo = next.tipo ?? acordoTipo;
    const termos = next.termos ?? acordoTermos;
    const valorStr = next.valor ?? acordoValor;
    const valor = num(valorStr);
    // Sincroniza o Orçamento primeiro (pega o id do item) e grava TUDO num só
    // write — assim tipo/termos/valor e acordo_budget_id nunca se atropelam.
    const acordoBudgetId = await syncAcordoBudget(tipo, valor);
    await saveFields({
      acordo_tipo: tipo || null,
      acordo_termos: termos.trim() || null,
      acordo_valor: valorStr.trim() === "" ? null : valor,
      acordo_budget_id: acordoBudgetId,
    });
  }

  // ===== candidatos =====
  const candidateVenueIds = new Set(candidates.map((c) => c.venue_id));
  const availableVenues = venues.filter((v) => !candidateVenueIds.has(v.id));

  async function addCandidate(venueId: number) {
    const v = venues.find((x) => x.id === venueId);
    try {
      await addPartyVenueCandidate(partyId, venueId, { capacity: v?.capacity ?? null });
      reloadCandidates();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }
  function patchCandidate(id: number, updates: Partial<PartyVenueCandidate>) {
    void updatePartyVenueCandidate(id, updates).then(reloadCandidates).catch((e) => toast.error(`Erro: ${String(e)}`));
  }
  async function removeCandidate(cand: PartyVenueCandidate) {
    try {
      await removePartyVenueCandidate(partyId, cand.venue_id);
      if (cand.venue_id === confirmedVenueId) await onPatchParty({ venue_id: null, venue_name: null });
      reloadCandidates();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }
  async function confirmVenue(cand: PartyVenueCandidate) {
    try {
      const updates: { venue_id: number; venue_name: string | null; expected_capacity?: number | null } = {
        venue_id: cand.venue_id,
        venue_name: cand.venue_name ?? null,
      };
      if ((expectedCapacity == null || expectedCapacity === 0) && cand.capacity) {
        updates.expected_capacity = cand.capacity;
      }
      await onPatchParty(updates);
      reloadCandidates();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }
  async function toggleLeader(cand: PartyVenueCandidate) {
    try {
      await setPartyVenueLeader(partyId, cand.is_leader ? null : cand.id);
      reloadCandidates();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  // ===== resumos dos blocos =====
  const venueSummary = confirmedVenueName
    ? `${confirmedVenueName}${expectedCapacity ? ` · cap. ${expectedCapacity}` : ""}`
    : candidates.length > 0
    ? `${candidates.length} candidato(s)${expectedCapacity ? ` · cap. ${expectedCapacity}` : ""}`
    : "sem venue";
  const premissasSummary =
    publicoEsperado || precoMedio
      ? `público ${num(publicoEsperado) || "—"} · preço ${precoMedio ? formatCurrency(num(precoMedio)) : "—"}`
      : "definir premissas";
  const veredictoSummary =
    verdict.breakEvenPeople != null
      ? `${lightDot(verdict.light)} empata com ${verdict.breakEvenPeople}`
      : "informe preço";
  const decisaoSummary = decisao
    ? `${viabilityDecisionLabel(decisao)}${decisaoCondicao ? ` · ${decisaoCondicao}` : ""}`
    : "sem decisão";

  const otherCandidates = confirmedVenueId != null ? candidates.filter((c) => c.venue_id !== confirmedVenueId) : [];
  const visibleCandidates =
    confirmedVenueId != null
      ? candidates.filter((c) => c.venue_id === confirmedVenueId).concat(showDiscarded ? otherCandidates : [])
      : candidates;

  return (
    <div className="space-y-2">
      {/* ===== VENUE & CAPACIDADE ===== */}
      <VBlockShell title="Venue & Capacidade" summary={venueSummary} isOpen={open === "venue"} setOpen={() => setOpen("venue")}>
        <div className="space-y-2">
          {visibleCandidates.length > 0 && (
            <ul className="space-y-1.5">
              {visibleCandidates.map((c) => {
                const isConfirmed = c.venue_id === confirmedVenueId;
                return (
                  <li key={c.id} className={cn("rounded-md border p-2", isConfirmed && "border-emerald-500/50 bg-emerald-500/5")}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void toggleLeader(c)}
                        className={cn("shrink-0", c.is_leader ? "text-amber-400" : "text-muted-foreground/50 hover:text-amber-400")}
                        title={c.is_leader ? "Líder (usado no veredito sem confirmação)" : "Marcar como líder"}
                      >
                        <Star className={cn("h-3.5 w-3.5", c.is_leader && "fill-amber-400")} />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.venue_name || "—"}</span>
                      {isConfirmed ? (
                        <Badge className="shrink-0 bg-emerald-500/20 text-[10px] text-emerald-400">confirmado</Badge>
                      ) : (
                        <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => void confirmVenue(c)}>
                          <Check className="mr-1 h-3 w-3" /> Confirmar
                        </Button>
                      )}
                      <button type="button" onClick={() => void removeCandidate(c)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label="Remover candidato">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[6rem_1fr_7rem]">
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs"
                        placeholder="Cap."
                        defaultValue={c.capacity ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value ? Number(e.target.value) : null;
                          if (v !== (c.capacity ?? null)) patchCandidate(c.id, { capacity: v });
                        }}
                      />
                      <div className="flex gap-1.5">
                        <Select value={c.deal_type ?? ""} onValueChange={(v) => patchCandidate(c.id, { deal_type: v })}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Acordo" /></SelectTrigger>
                          <SelectContent>
                            {VENUE_DEAL_TYPES.map((t) => (<SelectItem key={t} value={t}>{venueDealTypeLabel(t)}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-7 flex-1 text-xs"
                          placeholder="Termos (ex.: 15%)"
                          defaultValue={c.deal_terms ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (c.deal_terms ?? null)) patchCandidate(c.id, { deal_terms: v });
                          }}
                        />
                      </div>
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs"
                        placeholder="Custo R$"
                        defaultValue={c.estimated_cost ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value ? Number(e.target.value) : null;
                          if (v !== (c.estimated_cost ?? null)) patchCandidate(c.id, { estimated_cost: v });
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {confirmedVenueId != null && otherCandidates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDiscarded((s) => !s)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showDiscarded ? "Ocultar descartados" : `+${otherCandidates.length} candidato(s) descartado(s)`}
            </button>
          )}

          {availableVenues.length > 0 && (
            <Select value="_add" onValueChange={(v) => { if (v !== "_add") void addCandidate(Number(v)); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="+ Adicionar venue candidato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_add" disabled>Selecionar…</SelectItem>
                {availableVenues.map((v) => (<SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 pt-1">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Capacidade esperada
              <InfoHint>Capacidade da festa (fonte única). Puxa da casa confirmada e é lida pelo cockpit e pelo veredito. Edite se a montagem reduz a lotação.</InfoHint>
            </label>
            <Input
              type="number"
              min={0}
              className="h-8 w-28 text-sm"
              value={capDraft}
              onChange={(e) => setCapDraft(e.target.value)}
              onBlur={() => {
                const v = capDraft.trim() === "" ? null : Number(capDraft);
                if (v !== (expectedCapacity ?? null)) void onPatchParty({ expected_capacity: v });
              }}
            />
          </div>
        </div>
      </VBlockShell>

      {/* ===== PREMISSAS ===== */}
      <VBlockShell title="Premissas" summary={premissasSummary} isOpen={open === "premissas"} setOpen={() => setOpen("premissas")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Público esperado (realista)" hint="Estimativa honesta de quantas pessoas realmente vêm — não a capacidade. Sugerimos ~70% da capacidade; ajuste pela sua realidade.">
            <Input
              type="number"
              min={0}
              className="h-8 text-sm"
              placeholder={expectedCapacity ? `sugerido ${Math.round(expectedCapacity * 0.7)}` : "nº de pessoas"}
              value={publicoEsperado}
              onChange={(e) => setPublicoEsperado(e.target.value)}
              onBlur={() => void saveFields({ publico_esperado: publicoEsperado.trim() === "" ? null : num(publicoEsperado) })}
            />
          </Field>
          <Field label="Preço médio pretendido" hint="Ticket médio que você espera praticar (média entre lotes/portaria). Base da receita por pessoa no veredito.">
            <Input
              type="number"
              min={0}
              className="h-8 text-sm"
              placeholder="R$"
              value={precoMedio}
              onChange={(e) => setPrecoMedio(e.target.value)}
              onBlur={() => void saveFields({ preco_medio: precoMedio.trim() === "" ? null : num(precoMedio) })}
            />
          </Field>

          <div className="space-y-1 sm:col-span-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Acordo com a casa
              <InfoHint>Herdado do venue confirmado (editável). O valor entra no veredito e no Orçamento conforme o tipo: aluguel/cachê = fixo; % da bilheteria reduz a receita/pessoa; % do bar soma o bar por cabeça.</InfoHint>
            </label>
            <div className="grid gap-1.5 sm:grid-cols-[10rem_1fr_7rem]">
              <Select value={acordoTipo} onValueChange={(v) => { setAcordoTipo(v); void saveAcordo({ tipo: v }); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  {VENUE_DEAL_TYPES.map((t) => (<SelectItem key={t} value={t}>{venueDealTypeLabel(t)}</SelectItem>))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs"
                placeholder={acordoTipo === "pct_bilheteria" || acordoTipo === "pct_bar" ? "%" : "termos curtos"}
                value={acordoTermos}
                onChange={(e) => setAcordoTermos(e.target.value)}
                onBlur={() => void saveAcordo({ termos: acordoTermos })}
              />
              <Input
                type="number"
                min={0}
                className="h-8 text-xs"
                placeholder="Valor R$"
                value={acordoValor}
                onChange={(e) => setAcordoValor(e.target.value)}
                onBlur={() => void saveAcordo({ valor: acordoValor })}
              />
            </div>
          </div>

          {!maisExtras ? (
            <button type="button" onClick={() => setMaisExtras(true)} className="text-left text-[11px] text-muted-foreground hover:text-foreground sm:col-span-2">
              + receitas extras prováveis (patrocínio, bar)
            </button>
          ) : (
            <>
              <Field label="Patrocínio provável" hint="Receita fixa de patrocínio já esperada. Abate os custos a cobrir no veredito.">
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-sm"
                  placeholder="R$"
                  value={patrocinio}
                  onChange={(e) => setPatrocinio(e.target.value)}
                  onBlur={() => void saveFields({ patrocinio: patrocinio.trim() === "" ? null : num(patrocinio) })}
                />
              </Field>
              <Field label="Bar por cabeça" hint="Só conta se o acordo te der parte do bar (% do bar). Receita estimada de bar por pessoa presente.">
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-sm"
                  placeholder="R$/pessoa"
                  value={barPerCapita}
                  onChange={(e) => setBarPerCapita(e.target.value)}
                  onBlur={() => void saveFields({ bar_per_capita: barPerCapita.trim() === "" ? null : num(barPerCapita) })}
                />
              </Field>
            </>
          )}
        </div>
      </VBlockShell>

      {/* ===== CUSTOS PROJETADOS (view do Orçamento) ===== */}
      <VBlockShell title="Custos projetados" summary={formatCurrency(custosProjetados)} isOpen={open === "custos"} setOpen={() => setOpen("custos")}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Total projetado
              <InfoHint>Somado dos itens de custo do Orçamento (fonte única). Edite lá para manter tudo consistente.</InfoHint>
            </span>
            <span className="font-semibold tabular-nums">{formatCurrency(custosProjetados)}</span>
          </div>
          {topCosts.length > 0 ? (
            <ul className="space-y-1">
              {topCosts.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5">{b.category}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.description || "—"}</span>
                  <span className="shrink-0 font-medium tabular-nums">{formatCurrency(b.projected_amount || 0)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">Nenhum custo no Orçamento ainda.</p>
          )}
          <InlineBudgetAdd partyId={partyId} nextInfo={budgetItems.length} onAdded={onReload} />
          <button type="button" onClick={onGoOrcamento} className="text-[11px] text-primary hover:underline">
            editar no Orçamento →
          </button>
        </div>
      </VBlockShell>

      {/* ===== VEREDITO ===== */}
      <VBlockShell title="Veredito" summary={veredictoSummary} isOpen={open === "veredito"} setOpen={() => setOpen("veredito")}>
        <div className="space-y-3">
          <div className={cn("flex items-center justify-between rounded-md border p-3", lightClass(verdict.light))}>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              {lightDot(verdict.light)}
              {verdict.light === "verde" ? "Viável" : verdict.light === "ambar" ? "Apertado" : "Arriscado"}
              <InfoHint>
                Empatar = menor público cuja receita (preço + extras aplicáveis, já com o efeito do acordo) cobre os custos projetados menos as receitas fixas (patrocínio/cachê). Verde: resultado ≥ 15% da receita. Vermelho: resultado &lt; 0 ou empatar exige ≥ capacidade.
              </InfoHint>
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Kpi label="Pessoas p/ empatar" value={verdict.breakEvenPeople != null ? String(verdict.breakEvenPeople) : "—"} hint={verdict.exceedsCapacity ? "Acima da capacidade — não empata nem lotando." : undefined} danger={verdict.exceedsCapacity} />
            <Kpi
              label="Resultado projetado"
              value={num(publicoEsperado) > 0 ? formatCurrency(verdict.resultado) : "—"}
              danger={verdict.resultado < 0 && num(publicoEsperado) > 0}
            />
            <Kpi label="Margem" value={verdict.margem != null && num(publicoEsperado) > 0 ? `${Math.round(verdict.margem * 100)}%` : "—"} />
          </div>
          {verdict.revPerPerson <= 0 && (
            <p className="text-[11px] text-amber-400">Informe o preço médio (e o % do acordo, se houver) para calcular.</p>
          )}
        </div>
      </VBlockShell>

      {/* ===== DECISÃO ===== */}
      <VBlockShell title="Decisão" summary={decisaoSummary} isOpen={open === "decisao"} setOpen={() => setOpen("decisao")}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {VIABILITY_DECISIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() =>
                  void saveFields({
                    decisao: d,
                    decisao_data: typeof f.decisao_data === "string" && f.decisao_data ? f.decisao_data : toLocalISODate(),
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  decisao === d
                    ? d === "vai"
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                      : d === "ajustar"
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-400"
                      : "border-red-500/50 bg-red-500/20 text-red-400"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {viabilityDecisionLabel(d)}
              </button>
            ))}
          </div>
          <Input
            className="h-8 text-sm"
            placeholder="Condição (ex.: se fechar patrocínio até dia 10)"
            defaultValue={decisaoCondicao}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== (decisaoCondicao || null)) void saveFields({ decisao_condicao: v });
            }}
          />
          {typeof f.decisao_data === "string" && f.decisao_data && (
            <p className="text-[11px] text-muted-foreground">Decidido em {f.decisao_data}</p>
          )}
        </div>
      </VBlockShell>
    </div>
  );
}

// ===== helpers de UI =====

function lightDot(light: Verdict["light"]) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        light === "verde" ? "bg-emerald-500" : light === "ambar" ? "bg-amber-500" : "bg-red-500"
      )}
    />
  );
}
function lightClass(light: Verdict["light"]) {
  return light === "verde"
    ? "border-emerald-500/40 bg-emerald-500/5"
    : light === "ambar"
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-red-500/40 bg-red-500/5";
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

function Kpi({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className={cn("rounded-md border bg-muted/20 p-2.5", danger && "border-red-500/40")}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </div>
      <div className={cn("mt-0.5 text-base font-semibold tabular-nums", danger && "text-red-400")}>{value}</div>
    </div>
  );
}

/** Casca de bloco do acordeão — cabeçalho clicável + resumo quando fechado. */
function VBlockShell({
  title,
  summary,
  isOpen,
  setOpen,
  children,
}: {
  title: string;
  summary: string;
  isOpen: boolean;
  setOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border", isOpen && "ring-1 ring-primary/40")}>
      <button type="button" onClick={setOpen} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-2">
          {!isOpen && <span className="truncate text-[11px] text-muted-foreground">{summary}</span>}
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </span>
      </button>
      {isOpen && <div className="border-t p-3">{children}</div>}
    </div>
  );
}

/** Adicionar custo por aqui, mas gravando no Orçamento (fonte única). */
function InlineBudgetAdd({ partyId, nextInfo, onAdded }: { partyId: number; nextInfo: number; onAdded: () => Promise<void> }) {
  void nextInfo;
  const [cat, setCat] = useState<string>(VIABILITY_COST_CATEGORIES[0]);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");

  async function add() {
    const val = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    try {
      await createPartyBudgetItem({
        party_id: partyId,
        category: mapCostCategory(cat),
        subcategory: null,
        description: desc.trim() || null,
        projected_amount: val,
        actual_amount: null,
        supplier_note: null,
        supplier_id: null,
        status: "projetado",
        date_paid: null,
        premissa: null,
        nota_variancia: null,
      });
      setDesc("");
      setAmount("");
      await onAdded();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="grid gap-1.5 sm:grid-cols-[8rem_1fr_6rem_auto]">
      <Select value={cat} onValueChange={setCat}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {VIABILITY_COST_CATEGORIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
        </SelectContent>
      </Select>
      <Input className="h-7 text-xs" placeholder="Descrição" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
      <Input className="h-7 text-xs" type="number" min={0} placeholder="R$" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void add()}><Plus className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
