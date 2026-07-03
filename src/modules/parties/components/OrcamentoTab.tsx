import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { deleteWithUndo } from "@/lib/deleteWithUndo";
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, formatCurrency } from "@/lib/format";
import { InfoHint } from "@/components/ui/tooltip";
import {
  BUDGET_CATEGORIES,
  type PartyBudgetItem,
  type PartyDeserialized,
  type PartyGuest,
  type PartyTicket,
  type ViabilityCost,
} from "../types";
import {
  createPartyBudgetItem,
  deletePartyBudgetItem,
  syncPartyToFinanceiro,
} from "../api";
import { computePartyPnL } from "../pnl";
import { listSuppliers } from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";
import { BudgetItemDialog } from "./BudgetItemDialog";

/** Mapeia as categorias da Viabilidade para as do Orçamento ao importar custos. */
const VIAB_TO_BUDGET_CAT: Record<string, string> = {
  Pessoal: "Pessoal",
  Estrutura: "Infraestrutura",
  Marketing: "Marketing",
  Operacional: "Operacional",
  Outros: "Outros",
};

/** Variância de uma linha de CUSTO: real − projetado (positivo = estourou o
 *  orçamento). Retorna null quando o real ainda não foi lançado. */
function lineVariance(projected: number, actual: number | null): { abs: number; pct: number } | null {
  if (actual == null) return null;
  const abs = actual - projected;
  const pct = projected !== 0 ? (abs / projected) * 100 : actual !== 0 ? 100 : 0;
  return { abs, pct };
}
/** "+R$ 120 · +12%" / "−R$ 50 · −8%" (usa − real, não hífen). */
function varianceLabel(v: { abs: number; pct: number }): string {
  const sign = v.abs >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(v.abs))} · ${sign}${Math.abs(v.pct).toFixed(0)}%`;
}

/** Fornecedor exibido numa linha: cadastro (nome) ou nota livre. */
function supplierLabel(item: PartyBudgetItem, suppliers: Supplier[]): string {
  if (item.supplier_id != null) {
    return suppliers.find((s) => s.id === item.supplier_id)?.name ?? item.supplier_note ?? EMPTY_VALUE;
  }
  return item.supplier_note?.trim() || EMPTY_VALUE;
}

export function OrcamentoTab({
  party,
  items,
  tickets,
  guests = [],
  barRevenue = null,
  viabilityCostsRaw = null,
  marketingReach = null,
  marketingBudget = null,
  onReload,
}: {
  party: PartyDeserialized;
  items: PartyBudgetItem[];
  tickets: PartyTicket[];
  guests?: PartyGuest[];
  /** Receita de bar (vem do estado do formulário, editável na aba Info). */
  barRevenue?: number | null;
  /** JSON dos custos estimados na Viabilidade — pra reconciliar com o orçamento. */
  viabilityCostsRaw?: string | null;
  /** Meta de alcance (Marketing) — topo do funil. */
  marketingReach?: number | null;
  /** Orçamento de marketing (Marketing) — custo por alcance. */
  marketingBudget?: number | null;
  onReload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  // P&L da festa: o Orçamento é a verdade financeira — receita (ingressos
  // vendidos + patrocínio + bar) menos custo real (orçamento + custo variável
  // das cortesias) = resultado líquido. Cálculo único em computePartyPnL (antes
  // duplicado em 4 lugares com bases divergentes).
  const pnl = computePartyPnL(tickets, items, party.sponsors, guests, {
    barRevenue,
    attendance: party.actual_attendance,
  });
  const ticketRevenue = pnl.ticketRevenueReal;
  const sponsorRevenue = pnl.sponsorRevenue;
  const revenue = pnl.revenueReal;
  const net = pnl.netReal;

  // Reconciliação: custos ESTIMADOS na Viabilidade × orçamento projetado real.
  // O custos_necessarios da Viabilidade era um 2º lugar onde o custo vivia; aqui
  // o gap fica visível e dá pra importar o que ficou só na estimativa.
  let viabilityCosts: ViabilityCost[] = [];
  try {
    const p = JSON.parse(viabilityCostsRaw ?? "");
    if (Array.isArray(p)) viabilityCosts = p;
  } catch { /* vazio / legado */ }
  const viabilityTotal = viabilityCosts.reduce((s, c) => s + (c.amount || 0), 0);
  const [importing, setImporting] = useState(false);

  // Funil de marketing: alcance (meta) → ingressos vendidos.
  const reach = marketingReach && marketingReach > 0 ? marketingReach : null;
  const conversion = reach ? (pnl.sold / reach) * 100 : null;
  const costPerReach = reach && marketingBudget ? marketingBudget / reach : null;

  async function importViabilityCosts() {
    if (viabilityCosts.length === 0) return;
    setImporting(true);
    try {
      const existing = new Set(items.map((i) => (i.description ?? "").trim().toLowerCase()));
      let created = 0;
      for (const c of viabilityCosts) {
        const desc = (c.description?.trim() || c.category);
        if (existing.has(desc.toLowerCase())) continue;
        await createPartyBudgetItem({
          party_id: party.id,
          category: VIAB_TO_BUDGET_CAT[c.category] ?? "Outros",
          subcategory: null,
          description: desc,
          projected_amount: c.amount || 0,
          actual_amount: null,
          supplier_note: null,
          supplier_id: null,
          status: "projetado",
          date_paid: null,
          premissa: "Importado da Viabilidade",
          nota_variancia: null,
        });
        existing.add(desc.toLowerCase());
        created += 1;
      }
      await onReload();
      toast.success(created > 0 ? `${created} custo(s) importado(s) da Viabilidade.` : "Custos da Viabilidade já estão no orçamento.");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  const [syncing, setSyncing] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // Sub-aba do Financeiro (§2.5): Orçamento (projetado) | Execução (real) |
  // Indicadores (métricas). Puramente presentacional — o pnl não muda.
  const [sub, setSub] = useState<"orcamento" | "execucao" | "indicadores">("orcamento");
  // Limiar de materialidade (%): destaca só desvios acima disso (foco na atenção).
  const [materiality, setMateriality] = useState(10);
  // Edição/criação de item via diálogo (lápis) — sem edição direta na planilha.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<PartyBudgetItem | null>(null);
  const [dialogKind, setDialogKind] = useState<"custo" | "receita">("custo");

  useEffect(() => {
    void listSuppliers()
      .then(setSuppliers)
      .catch(() => undefined);
  }, []);

  function openAdd(kind: "custo" | "receita") {
    setDialogItem(null);
    setDialogKind(kind);
    setDialogOpen(true);
  }
  function openEdit(item: PartyBudgetItem) {
    setDialogItem(item);
    setDialogOpen(true);
  }

  async function handleDelete(id: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await deleteWithUndo({
      label: "Item de orçamento",
      remove: () => deletePartyBudgetItem(id),
      restore: async () => {
        await createPartyBudgetItem(item);
      },
      onChange: onReload,
    });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncPartyToFinanceiro(party, tickets, items);
      await onReload();
      toast.success("Sincronizado com Financeiro - veja em /financeiro");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  // A tabela de custos lista só itens de custo; os de receita (ex.: bar,
  // patrocínio avulso) aparecem numa seção própria (lançáveis, §2.5) e entram no
  // P&L como receita (computePartyPnL).
  const costItems = items.filter((i) => i.kind !== "receita");
  const receitaItems = items.filter((i) => i.kind === "receita");
  const grouped = Object.keys(BUDGET_CATEGORIES).reduce<Record<string, PartyBudgetItem[]>>(
    (acc, cat) => {
      acc[cat] = costItems.filter((i) => i.category === cat);
      return acc;
    },
    {}
  );
  const uncategorized = costItems.filter(
    (i) => !Object.keys(BUDGET_CATEGORIES).includes(i.category)
  );

  // Totais: projetado (fim do Orçamento) e real/variância (Execução).
  const projectedTotal = costItems.reduce((s, i) => s + i.projected_amount, 0);
  const realTotal = costItems.reduce((s, i) => s + (i.actual_amount ?? 0), 0);
  const varianceTotal = realTotal - projectedTotal;
  // Nº de colunas da tabela (pra colSpan do vazio/rodapé).
  const colCount = sub === "execucao" ? 9 : 6;

  return (
    <div className="space-y-4">
      {/* Sub-abas do Financeiro (§2.5). */}
      <div className="inline-flex rounded-md border p-0.5 text-xs">
        {([["orcamento", "Orçamento"], ["execucao", "Execução"], ["indicadores", "Indicadores"]] as const).map(
          ([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSub(k)}
              className={cn(
                "rounded px-3 py-1 transition",
                sub === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          )
        )}
      </div>

      {sub === "indicadores" && (
        <>
      {/* P&L da festa — o Orçamento é a verdade financeira única */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Receita</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-500">{formatCurrency(revenue)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Ingressos {formatCurrency(ticketRevenue)} · Patrocínio {formatCurrency(sponsorRevenue)}
            {pnl.barRevenue > 0 && ` · Bar ${formatCurrency(pnl.barRevenue)}`}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Custo</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-red-400">{formatCurrency(pnl.costActual)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Projetado {formatCurrency(pnl.costProjected)}
            {pnl.compVariableCost > 0 && ` · Cortesias ${formatCurrency(pnl.compVariableCost)}`}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Resultado líquido</div>
          <div
            className={cn(
              "mt-1 text-lg font-semibold tabular-nums",
              net >= 0 ? "text-emerald-500" : "text-red-400"
            )}
          >
            {formatCurrency(net)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Receita − custo real</div>
        </div>
      </div>

      {/* Economia por cabeça — quanto cada pessoa vale de faturamento e de lucro.
          A receita de bar (2ª receita da festa) é editada na aba Info. */}
      {pnl.heads > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Faturamento/cabeça{" "}
            <strong className="tabular-nums text-foreground">
              {pnl.revenuePerHead != null ? formatCurrency(pnl.revenuePerHead) : EMPTY_VALUE}
            </strong>
          </span>
          <span className="text-muted-foreground">
            Lucro/cabeça{" "}
            <strong className={cn("tabular-nums", (pnl.netPerHead ?? 0) >= 0 ? "text-emerald-500" : "text-red-400")}>
              {pnl.netPerHead != null ? formatCurrency(pnl.netPerHead) : EMPTY_VALUE}
            </strong>
          </span>
          <span className="text-muted-foreground">
            base: {pnl.heads} {party.actual_attendance && party.actual_attendance > 0 ? "presentes" : "vendidos"}
          </span>
        </div>
      )}

      {/* Reconciliação: estimativa da Viabilidade × orçamento projetado. */}
      {viabilityTotal > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Estimativa Viabilidade{" "}
            <strong className="tabular-nums text-foreground">{formatCurrency(viabilityTotal)}</strong>
          </span>
          <span className="text-muted-foreground">
            Orçamento projetado{" "}
            <strong className="tabular-nums text-foreground">{formatCurrency(pnl.costProjected)}</strong>
          </span>
          {(() => {
            const diff = pnl.costProjected - viabilityTotal;
            return (
              <span className="text-muted-foreground">
                Δ{" "}
                <strong className={cn("tabular-nums", Math.abs(diff) < 1 ? "text-muted-foreground" : diff > 0 ? "text-red-400" : "text-emerald-500")}>
                  {diff >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}
                </strong>
              </span>
            );
          })()}
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={importing} onClick={() => void importViabilityCosts()}>
            {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Importar custos da Viabilidade
          </Button>
        </div>
      )}

      {/* Funil de marketing: alcance → ingressos vendidos. */}
      {reach != null && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Funil: alcance <strong className="tabular-nums text-foreground">{reach.toLocaleString("pt-BR")}</strong>
            {" → "}vendas <strong className="tabular-nums text-foreground">{pnl.sold}</strong>
          </span>
          {conversion != null && (
            <span className="text-muted-foreground">
              conversão{" "}
              <strong className="tabular-nums text-foreground">{conversion.toFixed(conversion < 1 ? 2 : 1)}%</strong>
            </span>
          )}
          {costPerReach != null && (
            <span className="text-muted-foreground">
              custo/alcance{" "}
              <strong className="tabular-nums text-foreground">{formatCurrency(costPerReach)}</strong>
            </span>
          )}
        </div>
      )}

      {party.status === "Realizada" && party.financial_synced === 0 && (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <span className="flex-1 text-sm text-amber-400">
            Festa realizada mas não sincronizada com o Financeiro.
          </span>
          <Button size="sm" onClick={() => void handleSync()} disabled={syncing}>
            {syncing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sincronizar com Financeiro
          </Button>
        </div>
      )}

      {party.financial_synced !== 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Sincronizado com Financeiro.</span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => navigate("/financeiro")}
          >
            Ver no Financeiro →
          </button>
        </div>
      )}
        </>
      )}

      {(sub === "orcamento" || sub === "execucao") && (
        <>
      {/* Receitas lançadas (kind='receita', ex.: Receita de bar, patrocínio avulso). */}
      {receitaItems.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center justify-between border-b bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span>Receitas lançadas</span>
            <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => openAdd("receita")}>
              <Plus className="h-3.5 w-3.5" /> Receita
            </Button>
          </div>
          <ul className="divide-y">
            {receitaItems.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.description ?? EMPTY_VALUE}</span>
                <span className="shrink-0 text-xs text-muted-foreground">proj {formatCurrency(r.projected_amount)}</span>
                <span className="shrink-0 font-medium tabular-nums text-emerald-500">
                  {r.actual_amount != null ? formatCurrency(r.actual_amount) : EMPTY_VALUE}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Editar receita"
                  onClick={() => openEdit(r)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  aria-label="Excluir receita"
                  onClick={() => void handleDelete(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Limiar de materialidade — destaca só os desvios que merecem atenção. */}
      {sub === "execucao" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">Materialidade:<InfoHint>Desvios acima deste % ficam destacados na coluna Var.</InfoHint></span>
          <Input
            type="number"
            min={0}
            step={1}
            value={materiality}
            onChange={(e) => setMateriality(Math.max(0, Number(e.target.value) || 0))}
            className="h-7 w-16 tabular-nums"
          />
          <span>%</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="w-32 px-3 py-2">Categoria</th>
              <th className="w-32 px-3 py-2">Subcategoria</th>
              <th className="w-full px-3 py-2">Descrição</th>
              <th className="w-20 px-3 py-2 text-right">Proj.</th>
              {sub === "execucao" && <th className="w-24 px-3 py-2 text-right">Real</th>}
              {sub === "execucao" && <th className="w-20 px-3 py-2 text-right">Var.</th>}
              {sub === "execucao" && <th className="w-24 px-3 py-2">Status</th>}
              <th className="w-40 px-3 py-2">Fornecedor</th>
              <th className="w-16 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {costItems.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum item de orçamento.
                </td>
              </tr>
            )}
            {([...Object.entries(grouped), uncategorized.length > 0 ? ["Outros", uncategorized] as [string, PartyBudgetItem[]] : null] as ([string, PartyBudgetItem[]] | null)[])
              .filter((x): x is [string, PartyBudgetItem[]] => x !== null)
              .flatMap(([, catItems]) =>
                (catItems as PartyBudgetItem[]).map((item) => {
                  const v = lineVariance(item.projected_amount, item.actual_amount);
                  // Só é "material" um desvio DIFERENTE de zero (com limiar 0, uma
                  // linha em cima do orçamento — 0% — não é desvio material).
                  const material = v != null && v.pct !== 0 && Math.abs(v.pct) >= materiality;
                  const varTone = v == null ? "text-muted-foreground" : v.abs > 0 ? "text-red-400" : v.abs < 0 ? "text-emerald-500" : "text-muted-foreground";
                  const statusTone = item.status === "pago" ? "text-emerald-500" : item.status === "confirmado" ? "text-sky-400" : "text-muted-foreground";
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.subcategory ?? EMPTY_VALUE}</td>
                      <td className="px-3 py-2 align-top">{item.description ?? EMPTY_VALUE}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">{formatCurrency(item.projected_amount)}</td>
                      {sub === "execucao" && (
                        <>
                          <td className="px-3 py-2 text-right align-top tabular-nums">
                            {item.actual_amount != null ? formatCurrency(item.actual_amount) : <span className="text-muted-foreground">{EMPTY_VALUE}</span>}
                          </td>
                          <td className="px-3 py-2 text-right align-top tabular-nums">
                            {v == null ? (
                              <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                            ) : (
                              <span className={cn("inline-flex items-center justify-end gap-1 whitespace-nowrap", varTone, material && "font-semibold")} title={item.nota_variancia ?? undefined}>
                                {material && <AlertTriangle className="h-3 w-3" aria-label="Desvio material" />}
                                {varianceLabel(v)}
                              </span>
                            )}
                          </td>
                          <td className={cn("px-3 py-2 align-top text-xs capitalize", statusTone)}>{item.status}</td>
                        </>
                      )}
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{supplierLabel(item, suppliers)}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Editar item"
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            aria-label="Excluir"
                            onClick={() => void handleDelete(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
          {costItems.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs font-medium">
                <td className="px-3 py-2" colSpan={3}>{sub === "execucao" ? "Totais" : "Total projetado"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(projectedTotal)}</td>
                {sub === "execucao" && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(realTotal)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", varianceTotal > 0 ? "text-red-400" : varianceTotal < 0 ? "text-emerald-500" : "")}>
                      {varianceTotal >= 0 ? "+" : "−"}{formatCurrency(Math.abs(varianceTotal))}
                    </td>
                    <td className="px-3 py-2" />
                  </>
                )}
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Button size="sm" variant="outline" onClick={() => openAdd("custo")}>
        <Plus className="h-3.5 w-3.5" /> Adicionar item
      </Button>
        </>
      )}

      <BudgetItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={dialogItem}
        partyId={party.id}
        suppliers={suppliers}
        mode={sub === "execucao" ? "execucao" : "orcamento"}
        defaultKind={dialogKind}
        onSaved={onReload}
      />
    </div>
  );
}
