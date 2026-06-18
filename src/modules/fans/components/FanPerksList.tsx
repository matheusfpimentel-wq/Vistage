import { useEffect, useState } from "react";
import { Check, Gift, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
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
import {
  addFanPerk,
  deleteFanPerk,
  listFanPerks,
  markFanPerkDelivered,
} from "../api";
import {
  FAN_PERK_CATEGORIES,
  type FanPerk,
  type FanPerkCategory,
} from "../types";
import { formatDate } from "@/lib/format";

type Props = {
  fanId: number;
  onChange?: () => void;
};

function categoryVariant(
  c: FanPerkCategory
): "default" | "secondary" | "info" | "success" | "warning" | "outline" {
  switch (c) {
    case "VIP":
      return "warning";
    case "Acesso":
      return "info";
    case "Cortesia":
      return "success";
    case "Desconto":
      return "secondary";
    case "Brinde":
      return "default";
    default:
      return "outline";
  }
}

export function FanPerksList({ fanId, onChange }: Props) {
  const [items, setItems] = useState<FanPerk[]>([]);
  const [category, setCategory] = useState<FanPerkCategory>("Brinde");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setItems(await listFanPerks(fanId));
  }

  useEffect(() => {
    void refresh();
  }, [fanId]);

  async function handleAdd() {
    if (!name.trim()) {
      toast.error("Descreva o perk ou brinde");
      return;
    }
    setSaving(true);
    try {
      await addFanPerk({
        fan_id: fanId,
        category,
        name: name.trim(),
        status: "Planejado",
        date: date || null,
        notes: null,
      });
      setName("");
      setDate("");
      setCategory("Brinde");
      await refresh();
      onChange?.();
      toast.success("Perk registrado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeliver(id: number) {
    await markFanPerkDelivered(id);
    await refresh();
    onChange?.();
  }

  async function handleDelete(id: number) {
    if (
      !(await confirmDialog({
        title: "Excluir",
        description: "Excluir esse perk/brinde?",
        confirmLabel: "Excluir",
        destructive: true,
      }))
    )
      return;
    await deleteFanPerk(id);
    await refresh();
    onChange?.();
  }

  const planned = items.filter((p) => p.status === "Planejado").length;
  const delivered = items.filter((p) => p.status === "Entregue").length;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground">{items.length}</strong> total
        </span>
        <span>
          <strong className="text-amber-500">{planned}</strong> planejado(s)
        </span>
        <span>
          <strong className="text-emerald-500">{delivered}</strong> entregue(s)
        </span>
      </div>

      <div className="rounded-md border p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_150px_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FanPerkCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAN_PERK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Perk / brinde</Label>
            <Input
              placeholder="Ex: Vinil autografado, lista VIP, meet & greet…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data (opcional)</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={saving}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Gift className="mx-auto mb-2 h-7 w-7 opacity-50" />
          Nenhum perk ou brinde ainda. Recompense seus fãs mais fiéis.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={categoryVariant(p.category)} className="text-[10px] px-1.5 py-0">
                    {p.category}
                  </Badge>
                  {p.status === "Entregue" ? (
                    <Badge variant="success" className="text-[10px] px-1.5 py-0">
                      Entregue
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Planejado
                    </Badge>
                  )}
                  {p.date && <span>{formatDate(p.date)}</span>}
                </div>
                <div className="mt-1">{p.name}</div>
              </div>
              <div className="flex gap-1">
                {p.status !== "Entregue" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDeliver(p.id)}
                    aria-label="Marcar como entregue"
                    title="Marcar como entregue"
                  >
                    <Check className="h-4 w-4 text-emerald-500" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void handleDelete(p.id)}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
