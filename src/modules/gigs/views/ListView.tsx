import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "../components/StatusBadge";
import { averageRating, type Gig } from "../types";
import { formatCurrency, formatDate, formatRating } from "@/lib/format";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onDebrief: (gig: Gig) => void;
  onDelete: (gig: Gig) => void;
};

export function ListView({ gigs, onEdit, onDebrief, onDelete }: Props) {
  if (gigs.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nenhuma GIG encontrada com esses filtros.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Venue</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Cachê</th>
            <th className="px-3 py-2 text-right">Avaliação</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {gigs.map((g) => {
            const avg = averageRating(g);
            return (
              <tr
                key={g.id}
                className="border-t transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {formatDate(g.date)}
                  {g.start_time && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      · {g.start_time}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{g.venue_name}</div>
                  {g.venue_city && (
                    <div className="text-xs text-muted-foreground">
                      {g.venue_city}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={g.status} />
                    {g.debrief_pending === 1 && (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Debrief pendente
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(g.cache_amount)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {avg !== null ? (
                    <span className="text-amber-500">{formatRating(avg)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {(g.status === "Concluída" ||
                      g.debrief_pending === 1 ||
                      g.debrief_completed_at) && (
                      <Button
                        size="sm"
                        variant={
                          g.debrief_pending === 1 ? "default" : "ghost"
                        }
                        onClick={() => onDebrief(g)}
                      >
                        Debrief
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(g)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(g)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
