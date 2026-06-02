import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GIG_STATUSES, type Gig, type GigStatus } from "../types";
import { gigDisplayName } from "../displayName";
import { formatCurrency, formatDate } from "@/lib/format";
import { KanbanBoard, KanbanCard, KanbanColumn } from "@/lib/kanbanDnd";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onMove?: (id: number, status: GigStatus) => void;
};

export function KanbanView({ gigs, onEdit, onMove }: Props) {
  const columns = GIG_STATUSES.map((status) => ({
    status,
    gigs: gigs.filter((g) => g.status === status),
  }));

  return (
    <KanbanBoard
      onMove={(id, status) => onMove?.(id, status as GigStatus)}
      className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5"
    >
      {columns.map((col) => (
        <Column
          key={col.status}
          status={col.status}
          gigs={col.gigs}
          onEdit={onEdit}
        />
      ))}
    </KanbanBoard>
  );
}

function Column({
  status,
  gigs,
  onEdit,
}: {
  status: GigStatus;
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
}) {
  return (
    <KanbanColumn status={status} className="flex flex-col rounded-md border bg-muted/30">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-sm font-medium">{status}</div>
        <Badge variant="outline">{gigs.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {gigs.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
            sem GIGs
          </div>
        )}
        {gigs.map((g) => (
          <KanbanCard
            key={g.id}
            id={g.id}
            onClick={() => onEdit(g)}
            className="w-full rounded-md border bg-background p-2 text-left text-sm transition hover:border-primary"
          >
            <div className="font-medium">{gigDisplayName(g)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {g.venue_name} · {formatDate(g.date)}
              {g.start_time && ` · ${g.start_time}`}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1">
              <span className="text-xs tabular-nums">
                {formatCurrency(g.cache_amount)}
              </span>
              {g.debrief_pending === 1 && (
                <Badge variant="warning" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Debrief
                </Badge>
              )}
            </div>
          </KanbanCard>
        ))}
      </div>
    </KanbanColumn>
  );
}
