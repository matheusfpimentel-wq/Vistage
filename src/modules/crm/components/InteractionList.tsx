import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import {
  addInteraction,
  deleteInteraction,
  listInteractions,
} from "../api";
import type { ContactInteraction } from "../types";
import { formatDate, todayISO } from "@/lib/format";

type Props = {
  contactId: number;
  onChange?: () => void;
};

export function InteractionList({ contactId, onChange }: Props) {
  const [items, setItems] = useState<ContactInteraction[]>([]);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setItems(await listInteractions(contactId));
  }

  useEffect(() => {
    void refresh();
  }, [contactId]);

  async function handleAdd() {
    if (!note.trim()) {
      toast.error("Escreva uma nota da interação");
      return;
    }
    setSaving(true);
    try {
      await addInteraction(contactId, date, note.trim());
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
    await deleteInteraction(id);
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
              placeholder="Ex: liguei pra confirmar GIG do dia X, pediu pra mandar release…"
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
          Nenhuma interação registrada ainda.
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
                aria-label="Excluir interação"
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
