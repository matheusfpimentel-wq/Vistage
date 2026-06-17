import { useEffect, useState } from "react";
import { Loader2, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { CategorySelect } from "../components/CategorySelect";
import {
  createRecurring,
  deleteRecurring,
  generateRecurringForMonth,
  listCategories,
  listRecurring,
  setRecurringActive,
} from "../api";
import {
  type FinanceCategory,
  type FinanceRecurring,
  type TransactionKind,
} from "../types";
import { formatCurrency, toLocalYearMonth } from "@/lib/format";

type Props = {
  onChanged: () => void;
};

export function RecurringView({ onChanged }: Props) {
  const [items, setItems] = useState<FinanceRecurring[]>([]);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function refresh() {
    setItems(await listRecurring());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const yearMonth = toLocalYearMonth();
      const created = await generateRecurringForMonth(yearMonth);
      if (created === 0) {
        toast.info("Nada novo — todos os lançamentos do mês já existem.");
      } else {
        toast.success(
          `${created} lançamento${created > 1 ? "s" : ""} gerado${created > 1 ? "s" : ""} para o mês.`
        );
        onChanged();
      }
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle(r: FinanceRecurring) {
    await setRecurringActive(r.id, r.active === 0);
    await refresh();
  }

  async function handleDelete(r: FinanceRecurring) {
    if (
      !(await confirmDialog({
        title: "Excluir",
        description: `Excluir o modelo recorrente "${r.description ?? "(sem descrição)"}"? Lançamentos já criados serão mantidos.`,
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteRecurring(r.id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
            Gerar do mês
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Novo modelo
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Sem modelos recorrentes.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={r.active === 1}
                  onChange={() => void handleToggle(r)}
                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                />
                <div>
                  <div className="font-medium">
                    {r.description ?? "(sem descrição)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Dia {r.day_of_month ?? 1} do mês ·{" "}
                    {r.kind === "income" ? "Receita" : "Despesa"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`tabular-nums font-medium ${
                    r.kind === "income"
                      ? "text-emerald-500"
                      : "text-destructive"
                  }`}
                >
                  {r.kind === "income" ? "+" : "−"} {formatCurrency(r.amount)}
                </span>
                {r.active === 0 && <Badge variant="outline">inativo</Badge>}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(r)}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecurringForm
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          void refresh();
          onChanged();
        }}
      />
    </div>
  );
}

function RecurringForm({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [day, setDay] = useState("5");
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  async function refreshCategories() {
    setCategories(await listCategories());
  }

  useEffect(() => {
    if (open) {
      void refreshCategories();
      setKind("expense");
      setAmount("");
      setDescription("");
      setCategoryId(null);
      setDay("5");
    }
  }, [open]);

  async function handleSubmit() {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    const dia = parseInt(day, 10);
    try {
      await createRecurring({
        kind,
        amount: val,
        description: description.trim(),
        category_id: categoryId,
        day_of_month: isNaN(dia) ? 1 : Math.min(Math.max(dia, 1), 28),
        active: 1,
      });
      toast.success("Modelo recorrente criado");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo modelo recorrente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("income")}
              className={`flex-1 rounded-md border p-2 text-sm ${
                kind === "income"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                  : "border-input"
              }`}
            >
              Receita
            </button>
            <button
              type="button"
              onClick={() => setKind("expense")}
              className={`flex-1 rounded-md border p-2 text-sm ${
                kind === "expense"
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-input"
              }`}
            >
              Despesa
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Spotify, aluguel do estúdio, mensalidade DistroKid…"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dia do mês</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      Dia {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <CategorySelect
              kind={kind}
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCategoriesChange={refreshCategories}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
