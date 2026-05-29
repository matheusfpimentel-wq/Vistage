import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toaster";
import {
  addFanInteraction,
  deleteFanInteraction,
  listFanInteractions,
} from "../api";
import type { FanInteraction } from "../types";
import { formatDate, todayISO } from "@/lib/format";

type Props = {
  fanId: number;
  onChange?: () => void;
};

export function FanInteractionList({ fanId, onChange }: Props) {
  const [items, setItems] = useState<FanInteraction[]>([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setItems(await listFanInteractions(fanId));
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
      await addFanInteraction(fanId, date, note.trim());
      setNote("");
      setDate(todayISO());
      await refresh();
      onChange?.();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Excluir essa interação?")) return;
    await deleteFanInteraction(id);
    await refresh();
    onChange?.();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
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
                <div className="text-xs text-muted-foreground">
                  {formatDate(it.date)}
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
