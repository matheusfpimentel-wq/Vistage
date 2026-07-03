import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  categoriesForKind,
  type BudgetItemKind,
  type BudgetItemStatus,
  type PartyBudgetItem,
} from "../types";
import { createPartyBudgetItem, updatePartyBudgetItem } from "../api";
import type { Supplier } from "@/modules/suppliers/types";

/**
 * Campo de fornecedor que aceita AMBOS: escolher um fornecedor já cadastrado
 * (busca por nome) ou digitar um nome livre (alguém não registrado). Digitar
 * limpa a seleção de cadastro; escolher da lista preenche o campo.
 */
function SupplierCombobox({
  suppliers,
  supplierId,
  supplierText,
  onChange,
}: {
  suppliers: Supplier[];
  supplierId: number | null;
  supplierText: string;
  onChange: (id: number | null, text: string) => void;
}) {
  const display = supplierId != null
    ? suppliers.find((s) => s.id === supplierId)?.name ?? supplierText
    : supplierText;
  const [query, setQuery] = useState(display);
  const [open, setOpen] = useState(false);

  // Reflete mudanças externas (troca de item editado) sem brigar com a digitação.
  useEffect(() => setQuery(display), [display]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? suppliers.filter((s) => s.name.toLowerCase().includes(q)) : suppliers;
    return base.slice(0, 50);
  }, [suppliers, query]);

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(null, e.target.value); // digitar = nome livre, sem cadastro
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar cadastro ou digitar nome"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {matches.map((s) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                "flex w-full items-center px-2 py-1.5 text-left text-sm hover:bg-accent",
                s.id === supplierId && "bg-accent/60"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(s.name);
                setOpen(false);
                onChange(s.id, ""); // escolher cadastro
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {supplierId != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">Fornecedor cadastrado.</p>
      )}
    </div>
  );
}

/**
 * Diálogo único de criação/edição de uma linha do orçamento (§ financeiro).
 * Substitui a edição direta na planilha: um lápis por linha abre este diálogo e
 * permite alterar tudo. No modo "orcamento" só planeja (categoria, subcategoria,
 * descrição, projetado, fornecedor); no modo "execucao" também lança real, status
 * e a causa do desvio. Campos ocultos preservam o valor do item ao salvar.
 */
export function BudgetItemDialog({
  open,
  onOpenChange,
  item,
  partyId,
  suppliers,
  mode,
  defaultKind = "custo",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = criar; item = editar. */
  item: PartyBudgetItem | null;
  partyId: number;
  suppliers: Supplier[];
  /** orcamento: só planejamento · execucao: também real/status/causa. */
  mode: "orcamento" | "execucao";
  defaultKind?: BudgetItemKind;
  onSaved: () => Promise<void>;
}) {
  const [kind, setKind] = useState<BudgetItemKind>(defaultKind);
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [projected, setProjected] = useState("");
  const [actual, setActual] = useState("");
  const [status, setStatus] = useState<BudgetItemStatus>("projetado");
  const [notaVariancia, setNotaVariancia] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierText, setSupplierText] = useState("");
  const [saving, setSaving] = useState(false);

  // (Re)inicializa o formulário sempre que abre ou troca o item editado.
  useEffect(() => {
    if (!open) return;
    const k = (item?.kind ?? defaultKind) as BudgetItemKind;
    setKind(k);
    setCategory(item?.category ?? "");
    setSubcategory(item?.subcategory ?? "");
    setDescription(item?.description ?? "");
    setProjected(item ? String(item.projected_amount) : "");
    setActual(item?.actual_amount != null ? String(item.actual_amount) : "");
    setStatus(item?.status ?? "projetado");
    setNotaVariancia(item?.nota_variancia ?? "");
    setSupplierId(item?.supplier_id ?? null);
    setSupplierText(item?.supplier_note ?? "");
  }, [open, item, defaultKind]);

  const cats = categoriesForKind(kind);
  const subcats = cats[category] ?? [];

  function changeKind(k: BudgetItemKind) {
    setKind(k);
    // Categoria de custo e de receita são listas diferentes: se a atual não
    // existe na nova lista, zera para não ficar um valor órfão.
    if (!Object.keys(categoriesForKind(k)).includes(category)) {
      setCategory("");
      setSubcategory("");
    }
  }

  async function handleSave() {
    const proj = parseFloat(projected.replace(",", "."));
    if (!Number.isFinite(proj) || proj < 0) {
      toast.error("Informe um valor projetado válido");
      return;
    }
    const act = actual.trim() === "" ? null : parseFloat(actual.replace(",", "."));
    if (act != null && (!Number.isFinite(act) || act < 0)) {
      toast.error("Valor real inválido");
      return;
    }
    setSaving(true);
    try {
      const common = {
        category: category || "Outros",
        subcategory: subcategory || null,
        description: description.trim() || null,
        projected_amount: proj,
        actual_amount: act,
        supplier_note: supplierId != null ? null : supplierText.trim() || null,
        supplier_id: supplierId,
        status,
        nota_variancia: notaVariancia.trim() || null,
        kind,
      };
      if (item) {
        await updatePartyBudgetItem(item.id, common);
      } else {
        await createPartyBudgetItem({
          party_id: partyId,
          ...common,
          date_paid: null,
          premissa: null,
        });
      }
      await onSaved();
      onOpenChange(false);
      toast.success(item ? "Item atualizado" : kind === "receita" ? "Receita adicionada" : "Item adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Custo ou Receita — define a taxonomia de categorias. */}
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => changeKind("custo")}
              className={cn("rounded px-2.5 py-1 transition", kind === "custo" ? "bg-red-500/15 font-medium text-red-400" : "text-muted-foreground")}
            >
              Custo
            </button>
            <button
              type="button"
              onClick={() => changeKind("receita")}
              className={cn("rounded px-2.5 py-1 transition", kind === "receita" ? "bg-emerald-500/15 font-medium text-emerald-500" : "text-muted-foreground")}
            >
              Receita
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {Object.keys(cats).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subcategoria</Label>
              <Select value={subcategory} onValueChange={setSubcategory} disabled={subcats.length === 0}>
                <SelectTrigger><SelectValue placeholder="Subcategoria" /></SelectTrigger>
                <SelectContent>
                  {subcats.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Projetado (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={projected}
                onChange={(e) => setProjected(e.target.value)}
                placeholder="0,00"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fornecedor</Label>
              <SupplierCombobox
                suppliers={suppliers}
                supplierId={supplierId}
                supplierText={supplierText}
                onChange={(id, text) => { setSupplierId(id); setSupplierText(text); }}
              />
            </div>
          </div>

          {/* Execução: real, status e causa do desvio só aparecem na aba Execução. */}
          {mode === "execucao" && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed p-3">
              <div className="space-y-1">
                <Label className="text-xs">Real (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  placeholder="—"
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BudgetItemStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projetado">Projetado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Causa do desvio</Label>
                <Input value={notaVariancia} onChange={(e) => setNotaVariancia(e.target.value)} placeholder="Por que real ≠ projetado" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {item ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
