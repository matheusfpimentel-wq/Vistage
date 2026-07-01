import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { EMPTY_VALUE, formatCurrency } from "@/lib/format";
import { InfoHint } from "@/components/ui/tooltip";
import {
  BUDGET_CATEGORIES,
  type BudgetItemStatus,
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
  updatePartyBudgetItem,
} from "../api";
import { computePartyPnL } from "../pnl";
import { listSuppliers } from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";

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

  const [newCategory, setNewCategory] = useState(Object.keys(BUDGET_CATEGORIES)[0]);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPremissa, setNewPremissa] = useState("");
  const [newProjected, setNewProjected] = useState("");
  const [newActual, setNewActual] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("none");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // Limiar de materialidade (%): destaca só desvios acima disso (foco na atenção).
  const [materiality, setMateriality] = useState(10);
  // Rascunhos controlados de premissa/nota — o valor reflete na hora (o realce da
  // nota some ao digitar) e sobrevive a um reload sem precisar recarregar a lista.
  const [premissaDraft, setPremissaDraft] = useState<Record<number, string>>({});
  const [notaDraft, setNotaDraft] = useState<Record<number, string>>({});

  useEffect(() => {
    void listSuppliers()
      .then(setSuppliers)
      .catch(() => undefined);
  }, []);

  const subcats = BUDGET_CATEGORIES[newCategory] ?? [];

  async function handleAdd() {
    const projected = parseFloat(newProjected);
    if (isNaN(projected) || projected < 0) {
      toast.error("Informe um valor projetado válido");
      return;
    }
    setAdding(true);
    try {
      await createPartyBudgetItem({
        party_id: party.id,
        category: newCategory,
        subcategory: newSubcategory || null,
        description: newDesc.trim() || null,
        projected_amount: projected,
        actual_amount: newActual && Number.isFinite(parseFloat(newActual)) ? parseFloat(newActual) : null,
        supplier_note: newSupplier.trim() || null,
        supplier_id: newSupplierId === "none" ? null : Number(newSupplierId),
        status: "projetado",
        date_paid: null,
        premissa: newPremissa.trim() || null,
        nota_variancia: null,
      });
      setNewDesc("");
      setNewPremissa("");
      setNewProjected("");
      setNewActual("");
      setNewSupplier("");
      setNewSupplierId("none");
      await onReload();
      toast.success("Item adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyBudgetItem(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleStatusChange(id: number, status: BudgetItemStatus) {
    try {
      await updatePartyBudgetItem(id, { status });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleSupplierChange(id: number, value: string) {
    try {
      await updatePartyBudgetItem(id, {
        supplier_id: value === "none" ? null : Number(value),
      });
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  // Premissa e nota de variância: texto que não altera totais → salva direto,
  // sem recarregar a lista (o input não-controlado mantém o valor digitado).
  async function handleFieldSave(id: number, field: "premissa" | "nota_variancia", value: string) {
    try {
      await updatePartyBudgetItem(id, { [field]: value.trim() || null });
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
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

  // A tabela de custos lista só itens de custo; os de receita (ex.: patrocínio
  // gerido na aba Equipe) entram no P&L como receita, não como custo.
  const costItems = items.filter((i) => i.kind !== "receita");
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

  return (
    <div className="space-y-4">
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

      {/* Limiar de materialidade — destaca só os desvios que merecem atenção. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">Materialidade:<InfoHint>Desvios acima deste % ficam destacados na coluna Variância.</InfoHint></span>
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

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Subcategoria</th>
              <th className="px-3 py-2">Descrição / premissa</th>
              <th className="px-3 py-2 text-right">Projetado</th>
              <th className="px-3 py-2 text-right">Real</th>
              <th className="px-3 py-2 text-right">Variância</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
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
                  const notaVal = notaDraft[item.id] ?? item.nota_variancia ?? "";
                  const varTone = v == null ? "text-muted-foreground" : v.abs > 0 ? "text-red-400" : v.abs < 0 ? "text-emerald-500" : "text-muted-foreground";
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.category}</td>
                      <td className="px-3 py-2 align-top text-xs text-muted-foreground">{item.subcategory ?? EMPTY_VALUE}</td>
                      <td className="px-3 py-2 align-top">
                        <div>{item.description ?? EMPTY_VALUE}</div>
                        <Input
                          value={premissaDraft[item.id] ?? item.premissa ?? ""}
                          onChange={(e) => setPremissaDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                          onBlur={(e) => void handleFieldSave(item.id, "premissa", e.target.value)}
                          placeholder="Premissa (por quê deste valor)"
                          className="mt-1 h-7 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">{formatCurrency(item.projected_amount)}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {item.actual_amount != null ? formatCurrency(item.actual_amount) : EMPTY_VALUE}
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {v == null ? (
                          <span className="text-muted-foreground">{EMPTY_VALUE}</span>
                        ) : (
                          <>
                            <div className={cn("inline-flex items-center justify-end gap-1", varTone, material && "font-semibold")}>
                              {material && <AlertTriangle className="h-3 w-3" aria-label="Desvio material" />}
                              {varianceLabel(v)}
                            </div>
                            <Input
                              value={notaVal}
                              onChange={(e) => setNotaDraft((d) => ({ ...d, [item.id]: e.target.value }))}
                              onBlur={(e) => void handleFieldSave(item.id, "nota_variancia", e.target.value)}
                              placeholder="Causa do desvio"
                              className={cn("mt-1 h-7 text-left text-xs", material && !notaVal && "ring-1 ring-amber-500/50")}
                            />
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Select
                          value={item.status}
                          onValueChange={(val) => void handleStatusChange(item.id, val as BudgetItemStatus)}
                        >
                          <SelectTrigger className="h-7 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="projetado">Projetado</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="pago">Pago</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Select
                          value={item.supplier_id != null ? String(item.supplier_id) : "none"}
                          onValueChange={(val) => void handleSupplierChange(item.id, val)}
                        >
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue placeholder="Fornecedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {item.supplier_note && (
                          <div className="mt-1 text-xs text-muted-foreground">{item.supplier_note}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Excluir"
                          onClick={() => void handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
        </table>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Adicionar item</div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Select value={newCategory} onValueChange={(v) => { setNewCategory(v); setNewSubcategory(""); }}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {Object.keys(BUDGET_CATEGORIES).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newSubcategory} onValueChange={setNewSubcategory}>
            <SelectTrigger><SelectValue placeholder="Subcategoria" /></SelectTrigger>
            <SelectContent>
              {subcats.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Descrição"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Input
            placeholder="Premissa (opcional)"
            value={newPremissa}
            onChange={(e) => setNewPremissa(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Projetado (R$)"
            value={newProjected}
            onChange={(e) => setNewProjected(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Real (R$)"
            value={newActual}
            onChange={(e) => setNewActual(e.target.value)}
          />
          <Input
            placeholder="Fornecedor (nota livre)"
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
          />
          <Select value={newSupplierId} onValueChange={setNewSupplierId}>
            <SelectTrigger><SelectValue placeholder="Fornecedor (cadastro)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum fornecedor</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
