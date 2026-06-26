import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { formatCurrency } from "@/lib/format";
import {
  BUDGET_CATEGORIES,
  budgetSummary,
  type BudgetItemStatus,
  type PartyBudgetItem,
  type PartyDeserialized,
  type PartyTicket,
} from "../types";
import {
  createPartyBudgetItem,
  deletePartyBudgetItem,
  syncPartyToFinanceiro,
  updatePartyBudgetItem,
} from "../api";
import { listSuppliers } from "@/modules/suppliers/api";
import type { Supplier } from "@/modules/suppliers/types";

export function OrcamentoTab({
  party,
  items,
  tickets,
  onReload,
}: {
  party: PartyDeserialized;
  items: PartyBudgetItem[];
  tickets: PartyTicket[];
  onReload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const summary = budgetSummary(items);
  // P&L da festa: o Orçamento é a verdade financeira — receita (ingressos
  // vendidos + patrocínio) menos custo real = resultado líquido.
  const ticketRevenue = tickets.reduce((s, t) => s + t.price * (t.quantity_sold || 0), 0);
  const sponsorRevenue = party.sponsors.reduce((s, sp) => s + (sp.amount_cents || 0) / 100, 0);
  const revenue = ticketRevenue + sponsorRevenue;
  const net = revenue - summary.actual;
  const [newCategory, setNewCategory] = useState(Object.keys(BUDGET_CATEGORIES)[0]);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProjected, setNewProjected] = useState("");
  const [newActual, setNewActual] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("none");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

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
      });
      setNewDesc("");
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

  const grouped = Object.keys(BUDGET_CATEGORIES).reduce<Record<string, PartyBudgetItem[]>>(
    (acc, cat) => {
      acc[cat] = items.filter((i) => i.category === cat);
      return acc;
    },
    {}
  );
  const uncategorized = items.filter(
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
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Custo</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-red-400">{formatCurrency(summary.actual)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">Projetado {formatCurrency(summary.projected)}</div>
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

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Subcategoria</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 text-right">Projetado</th>
              <th className="px-3 py-2 text-right">Real</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum item de orçamento.
                </td>
              </tr>
            )}
            {([...Object.entries(grouped), uncategorized.length > 0 ? ["Outros", uncategorized] as [string, PartyBudgetItem[]] : null] as ([string, PartyBudgetItem[]] | null)[])
              .filter((x): x is [string, PartyBudgetItem[]] => x !== null)
              .flatMap(([, catItems]) =>
                (catItems as PartyBudgetItem[]).map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.category}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{item.subcategory ?? "—"}</td>
                    <td className="px-3 py-2">{item.description ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.projected_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {item.actual_amount != null ? formatCurrency(item.actual_amount) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={item.status}
                        onValueChange={(v) => void handleStatusChange(item.id, v as BudgetItemStatus)}
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
                    <td className="px-3 py-2">
                      <Select
                        value={item.supplier_id != null ? String(item.supplier_id) : "none"}
                        onValueChange={(v) => void handleSupplierChange(item.id, v)}
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
                    <td className="px-3 py-2">
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
                ))
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
