import { useState } from "react";
import { AlertTriangle, ArrowUpDown, CalendarRange, Mic2, Pencil, Trash2 } from "lucide-react";
import { openStageMode } from "../stageMode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { averageRating, type Gig } from "../types";
import { gigDisplayName } from "../displayName";
import { formatCurrency, formatDate, formatRating } from "@/lib/format";

type SortKey = "date" | "venue" | "status" | "cache" | "rating";
type SortDir = "asc" | "desc";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onDebrief: (gig: Gig) => void;
  onDelete: (gig: Gig) => void;
};

export function ListView({ gigs, onEdit, onDebrief, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = [...gigs].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date") cmp = a.date.localeCompare(b.date);
    else if (sortKey === "venue") cmp = gigDisplayName(a).localeCompare(gigDisplayName(b));
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    else if (sortKey === "cache") cmp = (a.cache_amount ?? 0) - (b.cache_amount ?? 0);
    else if (sortKey === "rating") {
      const ra = averageRating(a) ?? -1;
      const rb = averageRating(b) ?? -1;
      cmp = ra - rb;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Nenhuma GIG encontrada"
        description="Ajuste os filtros ou crie uma nova GIG para começar."
      />
    );
  }

  const cols: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "date", label: "Data", align: "left" },
    { key: "venue", label: "Venue", align: "left" },
    { key: "status", label: "Status", align: "left" },
    { key: "cache", label: "Cachê", align: "right" },
    { key: "rating", label: "Avaliação", align: "right" },
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
                onClick={() => toggleSort(col.key)}
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
                    {g.start_time && ` · ${g.start_time}`}
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
                <Button size="icon" variant="ghost" onClick={() => void openStageMode(g)} aria-label="Modo Palco" title="Modo Palco">
                  <Mic2 className="h-4 w-4 text-primary" />
                </Button>
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
            {cols.map((col) => (
              <th
                key={col.key}
                className={`cursor-pointer select-none px-3 py-2 hover:text-foreground ${col.align === "right" ? "text-right" : "text-left"}`}
                onClick={() => toggleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && <ArrowUpDown className="h-3 w-3 opacity-60" />}
                </span>
              </th>
            ))}
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
                  {g.start_time && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      · {g.start_time}
                    </span>
                  )}
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
