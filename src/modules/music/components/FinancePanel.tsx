import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { addTrackRoyalty, listTrackRoyalties } from "@/modules/finance/royalties";
import { deleteTransaction } from "@/modules/finance/api";

type Props = {
  projectId: number;
  trackId: number;
};

type Royalty = { id: number; amount: number; date: string | null; description: string | null };

const CATEGORIES = [
  "Studio",
  "Mixing",
  "Mastering",
  "Arte",
  "Marketing",
  "Distribuição",
  "Outro",
] as const;

/** Custo (despesa de produção) ou Royalties (receita da faixa). */
type EntryType = "custo" | "royalties";

export function FinancePanel({ projectId, trackId }: Props) {
  const [costs, setCosts] = useState<MusicProjectCost[]>([]);
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [entryType, setEntryType] = useState<EntryType>("custo");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    const [c, r] = await Promise.all([
      listProjectCosts(projectId),
      listTrackRoyalties(trackId),
    ]);
    setCosts(c);
    setRoyalties(r);
  }, [projectId, trackId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalCosts = costs.reduce((acc, c) => acc + c.amount, 0);
  const revenue = royalties.reduce((acc, r) => acc + r.amount, 0);
  const roi =
    totalCosts > 0
      ? `${(((revenue - totalCosts) / totalCosts) * 100).toFixed(0)}%`
      : "—";

  async function handleAdd() {
    const amountNum = parseFloat(amount.replace(",", "."));
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("Valor inválido");
      return;
    }
    if (entryType === "custo" && !category) {
      toast.error("Categoria é obrigatória");
      return;
    }
    setAdding(true);
    try {
      if (entryType === "custo") {
        await createCost({
          project_id: projectId,
          track_id: trackId,
          category,
          description: description.trim() || null,
          amount: amountNum,
          date: date || null,
        });
        toast.success("Custo adicionado");
      } else {
        await addTrackRoyalty({
          trackId,
          amount: amountNum,
          date: date || null,
          description: description.trim() || null,
        });
        toast.success("Royalties adicionados");
      }
      setCategory("");
      setDescription("");
      setAmount("");
      setDate("");
      await refresh();
    } catch {
      toast.error("Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteCost(id: number) {
    await deleteCost(id);
    await refresh();
  }

  async function handleDeleteRoyalty(id: number) {
    await deleteTransaction(id);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total custos" value={formatCurrency(totalCosts)} />
        <KpiCard label="Receita (royalties)" value={formatCurrency(revenue)} />
        <KpiCard label="ROI" value={roi} />
      </div>

      {costs.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Custos</div>
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
                onClick={() => handleDeleteCost(c.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Excluir"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {royalties.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Royalties
          </div>
          <div className="grid grid-cols-[3fr_auto_auto_auto] gap-x-2 px-2 text-[10px] font-medium text-muted-foreground">
            <span>Descrição</span>
            <span>Valor</span>
            <span>Data</span>
            <span />
          </div>
          {royalties.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[3fr_auto_auto_auto] items-center gap-x-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <span className="truncate text-muted-foreground">
                {r.description ?? "—"}
              </span>
              <span className="whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                {formatCurrency(r.amount)}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {r.date ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteRoyalty(r.id)}
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
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Adicionar</div>
          <div className="flex gap-1">
            {(["custo", "royalties"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntryType(t)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                  entryType === t
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t === "custo" ? "Custo" : "Royalties"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {entryType === "custo" && (
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
          )}
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
          {adding
            ? "Adicionando..."
            : entryType === "custo"
              ? "Adicionar custo"
              : "Adicionar royalties"}
        </Button>
      </div>
    </div>
  );
}
