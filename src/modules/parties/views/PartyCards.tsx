import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PendingTasksBadge } from "@/modules/tasks/components/PendingTasksBadge";
import { PendingTasksProvider } from "@/modules/tasks/components/PendingTasksContext";
import { type PartyDeserialized, partyStatusColor, estimatedRevenue } from "../types";

type Props = {
  parties: PartyDeserialized[];
  onEdit: (p: PartyDeserialized) => void;
  onDelete: (p: PartyDeserialized) => void;
};

export function PartyCards({ parties, onEdit, onDelete }: Props) {
  if (parties.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma festa cadastrada.
      </p>
    );
  }

  return (
    <PendingTasksProvider entityType="party">
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
              <div className="flex items-center gap-1 shrink-0">
                <PendingTasksBadge entityType="party" entityId={p.id} />
                <Badge className={partyStatusColor(p.status)}>{p.status}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
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
    </PendingTasksProvider>
  );
}
