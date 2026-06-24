import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatCurrency } from "@/lib/format";
import {
  TICKET_TYPES,
  ticketTypeLabel,
  type PartyTicket,
  type TicketType,
} from "../types";
import {
  createPartyTicket,
  deletePartyTicket,
  updatePartyTicket,
} from "../api";

export function IngressosTab({
  partyId,
  tickets,
  onReload,
}: {
  partyId: number;
  tickets: PartyTicket[];
  onReload: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<TicketType>("antecipado");
  const [newPrice, setNewPrice] = useState("");
  const [newQtyTotal, setNewQtyTotal] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editSold, setEditSold] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name || isNaN(price) || price < 0) {
      toast.error("Preencha nome e preço válidos");
      return;
    }
    setAdding(true);
    try {
      await createPartyTicket({
        party_id: partyId,
        name,
        ticket_type: newType,
        price,
        quantity_total: newQtyTotal && Number.isFinite(parseInt(newQtyTotal, 10)) ? parseInt(newQtyTotal, 10) : null,
        quantity_sold: 0,
        sale_start_date: newStart || null,
        sale_end_date: newEnd || null,
        position: tickets.length,
      });
      setNewName("");
      setNewPrice("");
      setNewQtyTotal("");
      setNewStart("");
      setNewEnd("");
      await onReload();
      toast.success("Ingresso adicionado");
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePartyTicket(id);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  async function handleSaveSold(ticket: PartyTicket) {
    const sold = parseInt(editSold);
    if (isNaN(sold) || sold < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await updatePartyTicket(ticket.id, { quantity_sold: sold });
      setEditingId(null);
      await onReload();
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      {tickets.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">
          Nenhum ingresso cadastrado.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-lg border p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm">{t.name}</span>
                <Badge className="text-xs shrink-0">{ticketTypeLabel(t.ticket_type)}</Badge>
              </div>
              <div className="text-lg font-semibold tabular-nums">{formatCurrency(t.price)}</div>
              <div className="text-xs text-muted-foreground">
                {editingId === t.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      className="h-6 w-20 text-xs"
                      value={editSold}
                      onChange={(e) => setEditSold(e.target.value)}
                    />
                    <Button size="sm" className="h-6 text-xs" onClick={() => void handleSaveSold(t)}>
                      OK
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => { setEditingId(t.id); setEditSold(String(t.quantity_sold)); }}
                  >
                    {t.quantity_sold} / {t.quantity_total ?? "∞"} vendidos
                  </button>
                )}
              </div>
              {(t.sale_start_date || t.sale_end_date) && (
                <div className="text-xs text-muted-foreground">
                  {t.sale_start_date ? formatDate(t.sale_start_date) : "—"} →{" "}
                  {t.sale_end_date ? formatDate(t.sale_end_date) : "—"}
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label="Excluir"
                  onClick={() => void handleDelete(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Adicionar ingresso</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Nome do ingresso"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Select value={newType} onValueChange={(v) => setNewType(v as TicketType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TICKET_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ticketTypeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={0.01}
            placeholder="Preço (R$)"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            placeholder="Quantidade total (opcional)"
            value={newQtyTotal}
            onChange={(e) => setNewQtyTotal(e.target.value)}
          />
          <Input
            type="date"
            placeholder="Início das vendas"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <Input
            type="date"
            placeholder="Fim das vendas"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
          />
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
            <Plus className="h-3.5 w-3.5" /> Adicionar ingresso
          </Button>
        </div>
      </div>
    </div>
  );
}
