import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { formatCurrency } from "@/lib/format";
import { KpiCard } from "@/components/shared/KpiCard";
import { createCost, deleteCost, listProjectCosts } from "../api";
import type { MusicProjectCost } from "../types";

type Props = {
  projectId: number;
  trackId: number;
};

const CATEGORIES = [
  "Studio",
  "Mixing",
  "Mastering",
  "Arte",
  "Marketing",
  "Distribuição",
  "Outro",
] as const;

export function FinancePanel({ projectId, trackId }: Props) {
  const [costs, setCosts] = useState<MusicProjectCost[]>([]);
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listProjectCosts(projectId);
    setCosts(list);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalCosts = costs.reduce((acc, c) => acc + c.amount, 0);
  const revenue = 0;
  const roi =
    totalCosts > 0
      ? `${(((revenue - totalCosts) / totalCosts) * 100).toFixed(0)}%`
      : "—";

  async function handleAdd() {
    if (!category || !amount) {
      toast.error("Categoria e valor são obrigatórios");
      return;
    }
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Valor inválido");
      return;
    }
    setAdding(true);
    try {
      await createCost({
        project_id: projectId,
        track_id: trackId,
        category,
        description: description.trim() || null,
        amount: amountNum,
        date: date || null,
      });
      setCategory("");
      setDescription("");
      setAmount("");
      setDate("");
      toast.success("Custo adicionado");
      await refresh();
    } catch {
      toast.error("Erro ao adicionar custo");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteCost(id);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total custos" value={formatCurrency(totalCosts)} />
        <KpiCard label="Receita" value={formatCurrency(revenue)} />
        <KpiCard label="ROI" value={roi} />
      </div>

      {costs.length > 0 && (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_2fr_auto_auto_auto] gap-x-2 px-2 text-[10px] font-medium text-muted-foreground">
            <span>Categoria</span>
            <span>Descrição</span>
            <span>Valor</span>
            <span>Data</span>
            <span />
          </div>
          {costs.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_2fr_auto_auto_auto] items-center gap-x-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <span className="truncate font-medium">{c.category ?? "—"}</span>
              <span className="truncate text-muted-foreground">
                {c.description ?? "—"}
              </span>
              <span className="whitespace-nowrap">{formatCurrency(c.amount)}</span>
              <span className="whitespace-nowrap text-muted-foreground">
                {c.date ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-md border p-3">
        <div className="text-xs font-medium">Adicionar custo</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding}>
          {adding ? "Adicionando..." : "Adicionar"}
        </Button>
      </div>
    </div>
  );
}

