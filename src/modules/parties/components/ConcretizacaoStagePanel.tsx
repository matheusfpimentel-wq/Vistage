import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { InfoHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  OBJETIVO_STATUSES,
  objetivoStatusLabel,
  type PartyBudgetItem,
  type PartyGuest,
  type PartySponsor,
  type PartyStage,
  type PartyTicket,
} from "../types";
import { computePartyPnL } from "../pnl";
import { computeVerdict, readViabilityPremissas } from "../viability";
import { createPartyTask, updatePartyStage } from "../api";

const concrBackfilling = new Set<number>();

function parseItems(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
  } catch { /* legado/vazio */ }
  return [];
}

/**
 * Painel da etapa Concretização — debrief comparável: bloco RESULTADO (projetado
 * vs realizado, calculado do que o app já tem, com degradação honesta e "?" nas
 * contas), Plus/Delta como listas de itens curtos (Delta vira tarefa) e o check
 * do Objetivo da Ideação. Migra Aprendizados/Próximos passos e o texto de
 * Plus/Delta uma única vez.
 */
export function ConcretizacaoStagePanel({
  partyId,
  stage,
  stages,
  budgetItems,
  tickets,
  sponsors,
  guests,
  barRevenue,
  actualAttendance,
  expectedCapacity,
  onReload,
}: {
  partyId: number;
  stage: PartyStage;
  stages: PartyStage[];
  budgetItems: PartyBudgetItem[];
  tickets: PartyTicket[];
  sponsors: PartySponsor[];
  guests: PartyGuest[];
  barRevenue: number | null;
  actualAttendance: number | null;
  expectedCapacity: number | null;
  onReload: () => Promise<void>;
}) {
  const f = stage.fields;
  const viabFields = useMemo(() => stages.find((s) => s.name === "Viabilidade")?.fields, [stages]);
  const mktFields = useMemo(() => stages.find((s) => s.name === "Marketing")?.fields, [stages]);
  const ideaObjetivo = useMemo(() => {
    const o = stages.find((s) => s.name === "Ideação")?.fields?.objetivo;
    return typeof o === "string" ? o : "";
  }, [stages]);

  const [plusItems, setPlusItems] = useState<string[]>(parseItems(f.plus_items));
  const [deltaItems, setDeltaItems] = useState<string[]>(parseItems(f.delta_items));
  const objetivoStatus = typeof f.objetivo_status === "string" ? f.objetivo_status : "";

  // ===== cálculos (projetado vs realizado) =====
  const pnl = useMemo(
    () => computePartyPnL(tickets, budgetItems, sponsors.map((s) => ({ amount_cents: s.amount_cents })), guests, { barRevenue, attendance: actualAttendance }),
    [tickets, budgetItems, sponsors, guests, barRevenue, actualAttendance]
  );
  const custosProjetados = budgetItems.reduce((s, b) => s + (b.projected_amount || 0), 0);
  const premissas = useMemo(() => readViabilityPremissas(viabFields), [viabFields]);
  const verdict = useMemo(
    () => computeVerdict(premissas, custosProjetados, expectedCapacity),
    [premissas, custosProjetados, expectedCapacity]
  );

  const publicoEsperado = premissas.publicoEsperado > 0 ? premissas.publicoEsperado : null;
  const publicoReal = actualAttendance != null && actualAttendance > 0 ? actualAttendance : pnl.sold;
  const financeiroProj = premissas.precoMedio > 0 ? verdict.resultado : null;
  const metaVendasNum = Number(mktFields?.meta_vendas);
  const metaTipo = typeof mktFields?.meta_vendas_tipo === "string" ? mktFields.meta_vendas_tipo : "num";
  const metaAbs = Number.isFinite(metaVendasNum) && metaVendasNum > 0
    ? (metaTipo === "pct" ? Math.round(((expectedCapacity ?? 0) * metaVendasNum) / 100) : Math.round(metaVendasNum))
    : null;

  // ===== persistência =====
  const saveFields = useCallback(
    async (partial: Record<string, string | number | null>) => {
      try {
        await updatePartyStage(stage.id, { fields: { ...stage.fields, _concr_migrated: "1", ...partial } });
        await onReload();
      } catch (e) {
        toast.error(`Não consegui salvar: ${String(e)}`);
      }
    },
    [stage.id, stage.fields, onReload]
  );
  const savePlus = (items: string[]) => { setPlusItems(items); void saveFields({ plus_items: items.length ? JSON.stringify(items) : null }); };
  const saveDelta = (items: string[]) => { setDeltaItems(items); void saveFields({ delta_items: items.length ? JSON.stringify(items) : null }); };

  // ===== backfill =====
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || f._concr_migrated || concrBackfilling.has(stage.id)) return;
    backfilled.current = true;
    concrBackfilling.add(stage.id);
    void runBackfill().finally(() => concrBackfilling.delete(stage.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBackfill() {
    try {
      const aprend = typeof f.aprendizados === "string" ? f.aprendizados.trim() : "";
      const prox = typeof f.proximos_passos === "string" ? f.proximos_passos.trim() : "";
      const plusFromText = f.plus_items == null ? parseText(f.plus) : parseItems(f.plus_items);
      const deltaFromText = f.delta_items == null ? parseText(f.delta) : parseItems(f.delta_items);

      const preserved = [
        aprend ? `[Aprendizados]\n${aprend}` : "",
        prox ? `[Próximos passos]\n${prox}` : "",
      ].filter(Boolean).join("\n\n");
      const nextNotes = [stage.notes ?? "", preserved].filter(Boolean).join("\n\n") || null;

      await updatePartyStage(stage.id, {
        notes: nextNotes,
        fields: {
          ...f, _concr_migrated: "1",
          plus_items: plusFromText.length ? JSON.stringify(plusFromText) : null,
          delta_items: deltaFromText.length ? JSON.stringify(deltaFromText) : null,
        },
      });
      setPlusItems(plusFromText);
      setDeltaItems(deltaFromText);
      await onReload();
    } catch (e) {
      toast.error(`Não consegui migrar a Concretização: ${String(e)}`);
    }
  }

  async function deltaToTask(text: string) {
    try {
      await createPartyTask({
        party_id: partyId, stage_id: stage.id, title: text,
        status: "pendente", priority: "Média", due_date: null, notes: null, responsavel_contact_id: null,
      });
      toast.success("Tarefa criada");
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-3">
      {/* ===== RESULTADO ===== */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resultado</div>
        <ResultRow
          label="Público"
          proj={publicoEsperado}
          real={publicoReal}
          fmt={(n) => String(n)}
          hint="Esperado (Viabilidade) vs. real (portaria/ingressos)."
        />
        <ResultRow
          label="Financeiro"
          proj={financeiroProj}
          real={pnl.netReal}
          fmt={formatCurrency}
          hint="Projetado = veredito da Viabilidade no público esperado. Real = receita real − custo real (Orçamento)."
        />
        <ResultRow
          label="Ingressos"
          proj={metaAbs}
          real={pnl.sold}
          fmt={(n) => String(n)}
          hint="Meta (Marketing) vs. vendidos (Ingressos)."
        />
        <div className="flex items-center justify-between gap-2 border-t pt-1.5 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            CAC
            <InfoHint>Custo de aquisição por comprador = gasto real de Marketing ÷ ingressos vendidos. Só aparece se houve gasto de marketing.</InfoHint>
          </span>
          <span className="font-medium tabular-nums">{pnl.cac != null ? formatCurrency(pnl.cac) : "sem gasto de mkt"}</span>
        </div>

        {/* Check do Objetivo da Ideação */}
        <div className="space-y-1 border-t pt-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Objetivo atingido?
            <InfoHint>O critério de sucesso definido na Ideação{ideaObjetivo ? `: "${ideaObjetivo}"` : ""}.</InfoHint>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OBJETIVO_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void saveFields({ objetivo_status: s })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  objetivoStatus === s
                    ? s === "atingido"
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                      : s === "parcial"
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-400"
                      : "border-red-500/50 bg-red-500/20 text-red-400"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {objetivoStatusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== PLUS / DELTA ===== */}
      <ItemList title="O que manteria (Plus)" items={plusItems} onChange={savePlus} />
      <ItemList title="O que mudaria (Delta)" items={deltaItems} onChange={saveDelta} onItemTask={deltaToTask} />
    </div>
  );
}

function parseText(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/** Linha do RESULTADO: projetado vs realizado com delta colorido (maior = melhor). */
function ResultRow({ label, proj, real, fmt, hint }: {
  label: string;
  proj: number | null;
  real: number;
  fmt: (n: number) => string;
  hint: string;
}) {
  const delta = proj != null ? real - proj : null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1 text-muted-foreground">
        {label}
        <InfoHint>{hint}</InfoHint>
      </span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className="text-muted-foreground">{proj != null ? fmt(proj) : "sem projeção"}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold">{fmt(real)}</span>
        {delta != null && delta !== 0 && (
          <span className={cn("text-[11px]", delta > 0 ? "text-emerald-400" : "text-red-400")}>
            {delta > 0 ? "▲" : "▼"} {fmt(Math.abs(delta))}
          </span>
        )}
      </span>
    </div>
  );
}

/** Lista de itens curtos com adição inline (Enter) e "virar tarefa" opcional. */
function ItemList({ title, items, onChange, onItemTask }: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  onItemTask?: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, t]);
    setDraft("");
  }
  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">{it}</span>
              {onItemTask && (
                <button
                  type="button"
                  onClick={() => onItemTask(it)}
                  className="flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline"
                  title="Virar tarefa"
                >
                  <Plus className="h-3 w-3" /> tarefa
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        className="h-8 text-sm"
        placeholder="Novo item… (Enter adiciona)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
      />
    </div>
  );
}
