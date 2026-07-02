import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { EMPTY_VALUE, formatDate, formatCurrency, toLocalISODate } from "@/lib/format";
import {
  GUEST_REASONS,
  GUEST_STATUSES,
  TICKET_TYPES,
  ticketTypeLabel,
  type GuestStatus,
  type PartyGuest,
  type PartyTicket,
  type PartyTicketSale,
  type TicketType,
} from "../types";
import {
  createPartyGuest,
  createPartyTicket,
  createPartyTicketSale,
  deletePartyGuest,
  deletePartyTicket,
  deletePartyTicketSale,
  listPartyGuests,
  listPartyTicketSales,
  updatePartyGuest,
  updatePartyTicket,
} from "../api";

export function IngressosTab({
  partyId,
  tickets,
  eventDate = null,
  onReload,
}: {
  partyId: number;
  tickets: PartyTicket[];
  /** Data da festa (Info) — marca o Dia D na curva de venda. */
  eventDate?: string | null;
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
                  {t.sale_start_date ? formatDate(t.sale_start_date) : EMPTY_VALUE} →{" "}
                  {t.sale_end_date ? formatDate(t.sale_end_date) : EMPTY_VALUE}
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

      <TicketSalesCurve
        partyId={partyId}
        soldNow={tickets.reduce((s, t) => s + (t.quantity_sold || 0), 0)}
        capacity={tickets.reduce((s, t) => s + (t.quantity_total || 0), 0)}
        eventDate={eventDate}
      />

      <GuestList partyId={partyId} onReload={onReload} />
    </div>
  );
}

/** Cortesias / guest list — receita renunciada (qtd × preço de ref., informativo)
 *  E custo variável real (qtd × custo/cabeça: drink, pulseira, kit). Só o custo
 *  variável entra no líquido do P&L. */
function GuestList({ partyId, onReload }: { partyId: number; onReload: () => Promise<void> }) {
  const [guests, setGuests] = useState<PartyGuest[]>([]);
  const [name, setName] = useState("");
  const [reason, setReason] = useState<string>(GUEST_REASONS[0]);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  const reload = useCallback(() => {
    void listPartyGuests(partyId).then(setGuests);
  }, [partyId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const renounced = guests.reduce((s, g) => s + g.quantity * g.ref_price, 0);
  const compCost = guests.reduce((s, g) => s + g.quantity * (g.unit_cost || 0), 0);
  const totalGuests = guests.reduce((s, g) => s + g.quantity, 0);

  async function add() {
    const n = name.trim();
    if (!n) {
      toast.error("Informe o nome da cortesia");
      return;
    }
    try {
      await createPartyGuest({
        party_id: partyId,
        name: n,
        reason,
        quantity: Math.max(1, parseInt(qty, 10) || 1),
        ref_price: parseFloat(price) || 0,
        unit_cost: parseFloat(cost) || 0,
        status: "Confirmado",
      });
      setName("");
      setQty("1");
      setPrice("");
      setCost("");
      reload();
      void onReload();
    } catch (e) {
      toast.error(`Não consegui adicionar a cortesia: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Cortesias / Guest list
          <InfoHint>
            Cortesia tem dois números: a <span className="text-amber-500">receita renunciada</span> (qtd × preço de ref., não sai do caixa) e o <span className="text-red-400">custo variável real</span> (qtd × custo/cabeça: drink, pulseira, kit). Só o custo variável entra no líquido do P&amp;L.
          </InfoHint>
        </div>
        {guests.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {totalGuests} cortesia(s) · renunciada{" "}
            <strong className="text-amber-500">{formatCurrency(renounced)}</strong>
            {compCost > 0 && (
              <>
                {" · custo real "}
                <strong className="text-red-400">{formatCurrency(compCost)}</strong>
              </>
            )}
          </div>
        )}
      </div>

      {guests.length > 0 && (
        <ul className="space-y-1">
          {guests.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              {g.reason && <Badge variant="outline" className="shrink-0 text-[10px]">{g.reason}</Badge>}
              <span className="shrink-0 text-xs text-muted-foreground">×{g.quantity}</span>
              <span className="shrink-0 text-xs text-amber-500/80" title="Receita renunciada">{formatCurrency(g.quantity * g.ref_price)}</span>
              {g.unit_cost > 0 && (
                <span className="shrink-0 text-xs text-red-400" title="Custo variável real (drink/pulseira/kit)">
                  −{formatCurrency(g.quantity * g.unit_cost)}
                </span>
              )}
              <select
                value={g.status}
                onChange={(e) => {
                  const status = e.target.value as GuestStatus;
                  void updatePartyGuest(g.id, { status })
                    .then(() => onReload())
                    .catch((err) => {
                      toast.error(`Não consegui atualizar o status: ${String(err)}`);
                      reload();
                    });
                  setGuests((gs) => gs.map((x) => (x.id === g.id ? { ...x, status } : x)));
                }}
                className="h-6 shrink-0 rounded border bg-background px-1 text-[11px]"
              >
                {GUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await deletePartyGuest(g.id);
                    reload();
                    void onReload();
                  } catch (e) {
                    toast.error(`Não consegui remover a cortesia: ${String(e)}`);
                  }
                }}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover cortesia"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-5">
        <Input className="h-8 text-sm" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GUEST_REASONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input className="h-8 text-sm" type="number" min={1} placeholder="Qtd" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input className="h-8 text-sm" type="number" min={0} step={0.01} placeholder="Preço ref." value={price} onChange={(e) => setPrice(e.target.value)} />
        <div className="flex gap-1.5">
          <Input className="h-8 text-sm" type="number" min={0} step={0.01} placeholder="Custo/cabeça" value={cost} onChange={(e) => setCost(e.target.value)} />
          <Button size="sm" className="h-8 shrink-0" onClick={() => void add()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Dias entre duas datas ISO (YYYY-MM-DD) — positivo se `to` é no futuro. */
function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO.slice(0, 10) + "T00:00:00");
  const b = new Date(toISO.slice(0, 10) + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Curva de venda de ingressos — pontos datados (quantos vendidos até cada data)
 *  para enxergar o ritmo (front-loaded x last-minute) e o sell-through. */
function TicketSalesCurve({
  partyId,
  soldNow,
  capacity,
  eventDate,
}: {
  partyId: number;
  soldNow: number;
  capacity: number;
  eventDate: string | null;
}) {
  const [sales, setSales] = useState<PartyTicketSale[]>([]);
  const [draftDate, setDraftDate] = useState("");
  const [draftSold, setDraftSold] = useState("");

  const reload = useCallback(() => {
    void listPartyTicketSales(partyId).then(setSales);
  }, [partyId]);
  useEffect(() => { reload(); }, [reload]);

  const chartData = useMemo(
    () => sales.map((s) => ({ label: formatDate(s.sale_date), sold: s.cumulative_sold })),
    [sales]
  );
  const latest = sales.length ? sales[sales.length - 1].cumulative_sold : 0;
  const sellThrough = capacity > 0 ? Math.round((latest / capacity) * 100) : null;
  const daysToEvent = eventDate ? daysBetween(toLocalISODate(), eventDate) : null;

  // Um ponto por data: registrar de novo na mesma data troca o valor.
  async function upsert(sale_date: string, cumulative_sold: number) {
    const existing = sales.find((s) => s.sale_date === sale_date);
    if (existing) await deletePartyTicketSale(existing.id);
    await createPartyTicketSale({ party_id: partyId, sale_date, cumulative_sold, note: null });
    reload();
  }

  async function registerToday() {
    try {
      await upsert(toLocalISODate(), soldNow);
    } catch (e) {
      toast.error(`Não consegui registrar o ponto: ${String(e)}`);
    }
  }

  async function addManual() {
    const d = draftDate.trim();
    const n = parseInt(draftSold, 10);
    if (!d || isNaN(n) || n < 0) {
      toast.error("Informe data e quantidade válidas");
      return;
    }
    try {
      await upsert(d, n);
      setDraftDate("");
      setDraftSold("");
    } catch (e) {
      toast.error(`Não consegui adicionar o ponto: ${String(e)}`);
    }
  }

  async function remove(id: number) {
    try {
      await deletePartyTicketSale(id);
      reload();
    } catch (e) {
      toast.error(`Não consegui remover: ${String(e)}`);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          Curva de venda
          <InfoHint>Registre pelo menos 2 pontos (ex.: toque "Registrar hoje" ao longo dos dias) para ver a curva.</InfoHint>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {sellThrough != null && (
            <span>sell-through <strong className="text-foreground">{sellThrough}%</strong></span>
          )}
          {daysToEvent != null && daysToEvent >= 0 && (
            <span>faltam <strong className="text-foreground">{daysToEvent}</strong> dia(s)</span>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => void registerToday()}>
            <CalendarPlus className="h-3.5 w-3.5" /> Registrar hoje ({soldNow})
          </Button>
        </div>
      </div>

      {chartData.length >= 2 ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
            <ChartTooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            {capacity > 0 && (
              <ReferenceLine
                y={capacity}
                stroke="hsl(var(--primary))"
                strokeDasharray="4 4"
                label={{
                  value: `capacidade ${capacity}`,
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                  position: "insideTopRight",
                }}
              />
            )}
            <Line type="monotone" dataKey="sold" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Poucos pontos ainda pra desenhar a curva.
        </p>
      )}

      {sales.length > 0 && (
        <ul className="space-y-1">
          {sales.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{formatDate(s.sale_date)}</span>
              <span className="flex-1 font-medium tabular-nums">{s.cumulative_sold} vendidos</span>
              {capacity > 0 && (
                <span className="shrink-0 text-muted-foreground">{Math.round((s.cumulative_sold / capacity) * 100)}%</span>
              )}
              <button
                type="button"
                onClick={() => void remove(s.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover ponto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input type="date" className="h-8 w-40 text-xs" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
        <Input
          type="number"
          min={0}
          className="h-8 w-40 text-xs"
          placeholder="Vendidos até a data"
          value={draftSold}
          onChange={(e) => setDraftSold(e.target.value)}
        />
        <Button size="sm" variant="outline" className="h-8" onClick={() => void addManual()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
