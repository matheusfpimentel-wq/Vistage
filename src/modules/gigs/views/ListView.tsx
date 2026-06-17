import { AlertTriangle, ArrowUpDown, CalendarRange, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { averageRating, type Gig } from "../types";
import { gigDisplayName } from "../displayName";
import { formatCurrency, formatDate, formatRating } from "@/lib/format";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onDebrief: (gig: Gig) => void;
  onDelete: (gig: Gig) => void;
};

export function ListView({ gigs, onEdit, onDebrief, onDelete }: Props) {
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(gigs);

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Nenhuma GIG encontrada"
        description="Ajuste os filtros ou crie uma nova GIG para começar."
      />
    );
  }

  const cols: { key: keyof Gig; label: string }[] = [
    { key: "date", label: "Data" },
    { key: "status", label: "Status" },
    { key: "cache_amount", label: "Cachê" },
  ];

  return (
    <>
      {/* Mobile: cartões empilhados + seletor de ordenação. */}
      <div className="space-y-2 sm:hidden">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>Ordenar:</span>
          <div className="flex flex-wrap gap-1">
            {cols.map((col) => (
              <button
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={`rounded-full border px-2 py-0.5 transition ${
                  sortKey === col.key
                    ? "border-primary bg-primary/10 text-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {col.label}
                {sortKey === col.key && (sortDir === "asc" ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
        </div>
        {sorted.map((g) => {
          const avg = averageRating(g);
          return (
            <div key={g.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{gigDisplayName(g)}</span>
                    {g.status === "Concluída" &&
                      (g.cache_amount ?? 0) > 0 &&
                      g.payment_status !== "Pago integralmente" && (
                        <span
                          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                          title="Cachê não recebido"
                        >
                          !
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(g.date)}
                    {g.venue_city && ` · ${g.venue_city}`}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums text-sm font-medium">
                  {formatCurrency(g.cache_amount)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={g.status} />
                {g.debrief_pending === 1 && (
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Debrief pendente
                  </Badge>
                )}
                {avg !== null && (
                  <span className="text-xs text-amber-500">{formatRating(avg)}</span>
                )}
              </div>
              <div className="flex justify-end gap-1 border-t pt-2">
                {(g.status === "Concluída" ||
                  g.debrief_pending === 1 ||
                  g.debrief_completed_at) && (
                  <Button
                    size="sm"
                    variant={g.debrief_pending === 1 ? "default" : "ghost"}
                    onClick={() => onDebrief(g)}
                  >
                    Debrief
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEdit(g)} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(g)} aria-label="Excluir">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: tabela. */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <SortableHeader<Gig> col="date" label="Data" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left hover:text-foreground" />
            <th className="px-3 py-2 text-left">Show / Venue</th>
            <SortableHeader<Gig> col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left hover:text-foreground" />
            <SortableHeader<Gig> col="cache_amount" label="Cachê" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right hover:text-foreground" />
            <th className="px-3 py-2 text-right">Avaliação</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((g) => {
            const avg = averageRating(g);
            return (
              <tr
                key={g.id}
                className="border-t transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {formatDate(g.date)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium flex items-center gap-1.5">
                    {gigDisplayName(g)}
                    {g.status === "Concluída" &&
                      (g.cache_amount ?? 0) > 0 &&
                      g.payment_status !== "Pago integralmente" && (
                        <span
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                          title="Cachê não recebido"
                        >
                          !
                        </span>
                      )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.venue_name}
                    {g.venue_city && ` · ${g.venue_city}`}
                  </div>
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
    </>
  );
}
