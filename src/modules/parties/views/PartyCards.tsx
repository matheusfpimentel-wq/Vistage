import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type PartyDeserialized, partyStatusColor, estimatedRevenue } from "../types";

const formatCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  parties: PartyDeserialized[];
  onEdit: (p: PartyDeserialized) => void;
};

export function PartyCards({ parties, onEdit }: Props) {
  if (parties.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma festa cadastrada.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {parties.map((p) => {
        const rev = estimatedRevenue(p);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onEdit(p)}
            className={cn(
              "rounded-lg border p-4 text-left transition hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-tight">{p.title}</h3>
              <Badge className={partyStatusColor(p.status)}>{p.status}</Badge>
            </div>

            {p.date && (
              <p className="text-xs text-muted-foreground">{formatDate(p.date)}</p>
            )}
            {p.venue_name && (
              <p className="text-xs text-muted-foreground">{p.venue_name}</p>
            )}

            <div className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              {p.expected_capacity != null && (
                <p>Capacidade: {p.expected_capacity.toLocaleString("pt-BR")}</p>
              )}
              {rev > 0 && (
                <p className="font-medium text-foreground">
                  Receita estimada: {formatCurrency(rev)}
                </p>
              )}
              {p.lineup.length > 0 && (
                <p>{p.lineup.length} DJ{p.lineup.length > 1 ? "s" : ""} escalado{p.lineup.length > 1 ? "s" : ""}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
