import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PartyBudgetItem, PartyGuest, PartyTicket } from "../types";
import { computePartyPnL } from "../pnl";

/**
 * Cockpit da festa — painel computado que LÊ as outras abas (não redigita nada):
 * lucro projetado×real, ingressos vendidos/meta, público e CAC. A Info deixa de
 * ser formulário que repete dado e vira o painel ao vivo do evento.
 */
export function PartyCockpit({
  tickets,
  items,
  sponsors,
  guests = [],
  expectedCapacity,
  actualAttendance,
}: {
  tickets: PartyTicket[];
  items: PartyBudgetItem[];
  sponsors: { name: string; amount_cents: number }[];
  guests?: PartyGuest[];
  expectedCapacity: number | null;
  actualAttendance: number | null;
}) {
  const pnl = computePartyPnL(tickets, items, sponsors, guests);
  const { sold, cac } = pnl;
  const meta = pnl.capacity;
  const lucroReal = pnl.netReal;
  const lucroProj = pnl.netProjected;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Kpi
        label="Lucro"
        value={formatCurrency(lucroReal)}
        sub={`proj. ${formatCurrency(lucroProj)}`}
        tone={lucroReal >= 0 ? "good" : "bad"}
      />
      <Kpi
        label="Ingressos"
        value={meta > 0 ? `${sold}/${meta}` : String(sold)}
        sub={meta > 0 ? `${Math.round((sold / meta) * 100)}% da meta` : "vendidos"}
      />
      <Kpi
        label="Público"
        value={actualAttendance != null ? String(actualAttendance) : "—"}
        sub={expectedCapacity ? `cap. ${expectedCapacity}` : "a confirmar"}
      />
      <Kpi label="CAC" value={cac != null ? formatCurrency(cac) : "—"} sub="mkt / comprador" />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "good" && "text-emerald-500",
          tone === "bad" && "text-red-400"
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}
