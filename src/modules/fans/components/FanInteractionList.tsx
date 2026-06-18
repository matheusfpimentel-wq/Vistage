import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  addFanInteraction,
  deleteFanInteraction,
  getFanInteractionCounts,
  listFanInteractions,
} from "../api";
import { FAN_INTERACTION_TYPES, type FanInteraction, type FanInteractionType } from "../types";
import { formatDate, todayISO } from "@/lib/format";

type Props = {
  fanId: number;
  onChange?: () => void;
};

function typeVariant(type: FanInteractionType): "default" | "secondary" | "info" | "warning" {
  switch (type) {
    case "Presença":
      return "info";
    case "Feedback":
      return "warning";
    default:
      return "secondary";
  }
}

export function FanInteractionList({ fanId, onChange }: Props) {
  const [items, setItems] = useState<FanInteraction[]>([]);
  const [counts, setCounts] = useState<{ total: number; presences: number; feedbacks: number }>({ total: 0, presences: 0, feedbacks: 0 });
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [interactionType, setInteractionType] = useState<FanInteractionType>("Interação");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [its, cts] = await Promise.all([
      listFanInteractions(fanId),
      getFanInteractionCounts(fanId),
    ]);
    setItems(its);
    setCounts(cts);
  }

  useEffect(() => {
    void refresh();
  }, [fanId]);

  async function handleAdd() {
    if (!note.trim()) {
      toast.error("Escreva uma nota");
      return;
    }
    setSaving(true);
    try {
      await addFanInteraction(fanId, date, note.trim(), interactionType);
      setNote("");
      setDate(todayISO());
      setInteractionType("Interação");
      await refresh();
      onChange?.();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirmDialog({ title: "Excluir", description: "Excluir essa interação?", confirmLabel: "Excluir", destructive: true }))) return;
    await deleteFanInteraction(id);
    await refresh();
    onChange?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span><strong className="text-foreground">{counts.total}</strong> total</span>
        <span><strong className="text-sky-500">{counts.presences}</strong> presença</span>
        <span><strong className="text-amber-500">{counts.feedbacks}</strong> feedback</span>
      </div>

      <div className="rounded-md border p-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_140px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={interactionType} onValueChange={(v) => setInteractionType(v as FanInteractionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAN_INTERACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nova interação</Label>
            <Textarea
              rows={2}
              placeholder="Ex: Conversou comigo na GIG do Audio Club, pediu unrelease."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma interação registrada.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-start justify-between rounded-md border p-3 text-sm"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(it.date)}
                  <Badge variant={typeVariant(it.type)} className="text-[10px] px-1.5 py-0">
                    {it.type}
                  </Badge>
                </div>
                <div className="mt-1 whitespace-pre-wrap">{it.note}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(it.id)}
                aria-label="Excluir"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
