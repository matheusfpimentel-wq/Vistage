import { useMemo, type ReactNode } from "react";
import { ArrowUpDown, CalendarRange, ListChecks, NotebookPen, Pencil, Plus, ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../components/StatusBadge";
import { averageRating, type Gig } from "../types";
import { gigDisplayName } from "../displayName";
import { parsePrepState, prepProgress } from "../prep";
import { EMPTY_VALUE, formatCurrency, formatDate, formatRating, todayISO } from "@/lib/format";
import { useTableSort } from "@/lib/useTableSort";
import { ColResizer, useResizableColumns } from "@/lib/resizableColumns";
import { OrderableHeader, SortableTh, SortLabel, useOrderableColumns } from "@/lib/orderableColumns";
import type { ListDensity } from "@/components/shared/ListDensityToggle";

type Props = {
  gigs: Gig[];
  onEdit: (gig: Gig) => void;
  onPrep: (gig: Gig) => void;
  onDebrief: (gig: Gig) => void;
  onDelete: (gig: Gig) => void;
  onShowSheet: (gig: Gig) => void;
  /** Cria uma nova GIG — CTA no estado vazio. */
  onCreate?: () => void;
  density?: ListDensity;
};

/**
 * Debrief só existe para GIGs concluídas; Preparação, para confirmadas. Os dois
 * são mutuamente exclusivos por status — assim nunca disputam o mesmo lugar
 * quando uma GIG concluída volta pra "Confirmada".
 */
function showDebrief(g: Gig): boolean {
  return g.status === "Concluída";
}

/**
 * Preparação em destaque: GIG futura, faltando ≤ 48h pra começar e com o
 * checklist de preparação ainda incompleto. O horário usa g.date + start_time
 * (default "00:00"); se a data não parsear, não destaca.
 */
function prepUrgent(g: Gig): boolean {
  const { done, total } = prepProgress(parsePrepState(g.prep_state));
  if (done >= total) return false;
  const start = new Date(`${g.date}T${g.start_time || "00:00"}`);
  const ms = start.getTime();
  if (isNaN(ms)) return false;
  const diff = ms - Date.now();
  return diff > 0 && diff < 48 * 60 * 60 * 1000;
}

/**
 * "!" de cachê só quando está de fato ATRASADO: GIG concluída, com cachê, não
 * pago integralmente — e SEM previsão futura de recebimento. Com previsão pra
 * frente (payment_due_date >= hoje) não está atrasado, então não alerta.
 */
function cacheOverdue(g: Gig): boolean {
  if (g.status !== "Concluída") return false;
  if ((g.cache_amount ?? 0) <= 0) return false;
  if (g.payment_status === "Pago integralmente") return false;
  if (g.payment_due_date && g.payment_due_date >= todayISO()) return false;
  return true;
}

// Definição de uma coluna da tabela desktop: o cabeçalho e o corpo são dirigidos
// por esta lista, mapeada pela ORDEM do useOrderableColumns — assim header e
// body nunca dessincronizam ao reordenar.
/**
 * Linha da tabela = GIG + campos derivados só para ordenar colunas que não
 * mapeiam direto num campo (nome de exibição, contratante, avaliação média).
 */
type GigRow = Gig & {
  _name: string;
  _contractor: string | null;
  _rating: number | null;
};

type GigCol = {
  id: string;
  locked?: boolean;
  /** chave de ordenação (useTableSort) — quando ausente, o th não ordena. */
  sortKey?: keyof GigRow;
  /** rótulo do cabeçalho. */
  header: string;
  /** classes do <th>. */
  thClassName: string;
  /** classes do <td>. */
  tdClassName?: string;
  /** se a coluna tem alça de redimensionamento (último th não tem). */
  resizable?: boolean;
  cell: (g: Gig) => ReactNode;
};

export function ListView({ gigs, onEdit, onPrep, onDebrief, onDelete, onShowSheet, onCreate, density = "full" }: Props) {
  const compact = density === "compact";
  const rows: GigRow[] = useMemo(
    () =>
      gigs.map((g) => ({
        ...g,
        _name: gigDisplayName(g),
        _contractor: g.promoter_contact_name ?? null,
        _rating: averageRating(g),
      })),
    [gigs]
  );
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(rows);
  const cols = useResizableColumns("gigs", [
    { id: "date", width: 110, min: 90 },
    { id: "name", width: 300, min: 160 },
    { id: "contractor", width: 170, min: 110 },
    { id: "status", width: 180, min: 120 },
    { id: "cache", width: 120, min: 90 },
    { id: "rating", width: 110, min: 80 },
    { id: "actions", width: 190, min: 150 },
  ]);

  // Colunas do meio reordenáveis; "name" (Show/Venue, principal) e "actions" travadas.
  const colDefs: Record<string, GigCol> = {
    date: {
      id: "date",
      sortKey: "date",
      header: "Data",
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2 whitespace-nowrap tabular-nums",
      resizable: true,
      cell: (g) => formatDate(g.date),
    },
    name: {
      id: "name",
      locked: true,
      sortKey: "_name",
      header: "Show / Venue",
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2",
      resizable: true,
      cell: (g) => (
        <>
          <div className="font-medium flex items-center gap-1.5">
            <span className="truncate">{gigDisplayName(g)}</span>
            {g.is_special === 1 && (
              <span className="shrink-0 text-amber-500" title="GIG especial">⭐</span>
            )}
            {cacheOverdue(g) && (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white"
                title="Cachê não recebido"
              >
                !
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {g.venue_name}
            {g.venue_city && ` · ${g.venue_city}`}
          </div>
        </>
      ),
    },
    contractor: {
      id: "contractor",
      sortKey: "_contractor",
      header: "Contratante",
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "truncate px-3 py-2",
      resizable: true,
      cell: (g) =>
        g.promoter_contact_name ? (
          <span className="truncate">{g.promoter_contact_name}</span>
        ) : (
          EMPTY_VALUE
        ),
    },
    status: {
      id: "status",
      sortKey: "status",
      header: "Status",
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2",
      resizable: true,
      cell: (g) => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={g.status} />
        </div>
      ),
    },
    cache: {
      id: "cache",
      sortKey: "cache_amount",
      header: "Cachê",
      thClassName: "px-3 py-2 text-right hover:text-foreground",
      tdClassName: "px-3 py-2 text-right tabular-nums",
      resizable: true,
      cell: (g) => formatCurrency(g.cache_amount),
    },
    rating: {
      id: "rating",
      sortKey: "_rating",
      header: "Avaliação",
      thClassName: "px-3 py-2 text-right hover:text-foreground",
      tdClassName: "px-3 py-2 text-right tabular-nums",
      resizable: true,
      cell: (g) => {
        const avg = averageRating(g);
        return avg !== null ? (
          <span className="text-amber-500">{formatRating(avg)}</span>
        ) : (
          EMPTY_VALUE
        );
      },
    },
    actions: {
      id: "actions",
      locked: true,
      header: "Ações",
      thClassName: "px-3 py-2 text-right",
      tdClassName: "px-3 py-2",
      cell: (g) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {g.status === "Confirmada" && (
            <Button
              size="icon"
              variant={prepUrgent(g) ? "default" : "ghost"}
              onClick={() => onPrep(g)}
              aria-label="Preparação"
              title="Preparação"
            >
              <ListChecks className="h-4 w-4" />
            </Button>
          )}
          {showDebrief(g) && (
            <Button
              size="icon"
              variant={g.debrief_pending === 1 ? "default" : "ghost"}
              onClick={() => onDebrief(g)}
              aria-label="Debrief"
              title="Debrief"
            >
              <NotebookPen className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => onShowSheet(g)} aria-label="Show Sheet" title="Show Sheet">
            <ScrollText className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onEdit(g)} aria-label="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(g)} aria-label="Excluir">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  };

  const oc = useOrderableColumns(
    "gigs",
    cols.defs.map((c) => ({ id: c.id, locked: colDefs[c.id].locked }))
  );
  // Largura total na MESMA ordem das colunas (a soma independe da ordem, mas o
  // <colgroup> segue oc.order pra casar com header/body).
  const tableWidth = oc.order.reduce((s, id) => s + cols.widths[id], 0);

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Nenhuma GIG encontrada"
        action={
          onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4" /> Nova GIG
            </Button>
          )
        }
      />
    );
  }

  const sortCols: { key: keyof GigRow; label: string }[] = [
    { key: "date", label: "Data" },
    { key: "_name", label: "Show" },
    { key: "_contractor", label: "Contratante" },
    { key: "status", label: "Status" },
    { key: "cache_amount", label: "Cachê" },
    { key: "_rating", label: "Avaliação" },
  ];

  return (
    <>
      {/* Mobile: cartões empilhados + seletor de ordenação. */}
      <div className="space-y-2 sm:hidden">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>Ordenar:</span>
          <div className="flex flex-wrap gap-1">
            {sortCols.map((col) => (
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
            <div
              key={g.id}
              className="glass-panel cursor-pointer rounded-lg p-3 space-y-2"
              onClick={() => onEdit(g)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="truncate">{gigDisplayName(g)}</span>
                    {g.is_special === 1 && (
                      <span className="shrink-0 text-amber-500" title="GIG especial">⭐</span>
                    )}
                    {cacheOverdue(g) && (
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
                  {g.promoter_contact_name && (
                    <div className="truncate text-xs text-muted-foreground">
                      Contratante: {g.promoter_contact_name}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums text-sm font-medium">
                  {formatCurrency(g.cache_amount)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={g.status} />
                {avg !== null && (
                  <span className="text-xs text-amber-500">{formatRating(avg)}</span>
                )}
              </div>
              <div className="flex justify-end gap-1 border-t pt-2" onClick={(e) => e.stopPropagation()}>
                {g.status === "Confirmada" && (
                  <Button
                    size="icon"
                    variant={prepUrgent(g) ? "default" : "ghost"}
                    onClick={() => onPrep(g)}
                    aria-label="Preparação"
                    title="Preparação"
                  >
                    <ListChecks className="h-4 w-4" />
                  </Button>
                )}
                {showDebrief(g) && (
                  <Button
                    size="icon"
                    variant={g.debrief_pending === 1 ? "default" : "ghost"}
                    onClick={() => onDebrief(g)}
                    aria-label="Debrief"
                    title="Debrief"
                  >
                    <NotebookPen className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onShowSheet(g)} aria-label="Show Sheet" title="Show Sheet">
                  <ScrollText className="h-4 w-4" />
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

      {/* Desktop: tabela com colunas redimensionáveis (arraste a alça; 2 cliques reseta)
          e reordenáveis (arraste o cabeçalho; clique ordena). Show/Venue e Ações travadas. */}
      <div className="hidden overflow-x-auto rounded-md border sm:block">
        <table
          className={cn("table-fixed", compact ? "text-xs [&_td]:py-1 [&_th]:py-1" : "text-sm")}
          style={{ width: tableWidth }}
        >
          <colgroup>
            {oc.order.map((id) => (
              <col key={id} style={cols.colStyle(id)} />
            ))}
          </colgroup>
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <OrderableHeader oc={oc}>
              <tr>
                {oc.order.map((id) => {
                  const c = colDefs[id];
                  const active = !!c.sortKey && sortKey === c.sortKey;
                  return (
                    <SortableTh
                      key={id}
                      id={id}
                      locked={c.locked}
                      className={cn(c.thClassName, c.sortKey && "cursor-pointer")}
                      onClick={c.sortKey ? () => handleSort(c.sortKey!) : undefined}
                      title={c.locked ? undefined : "Clique pra ordenar · arraste pra reposicionar"}
                    >
                      {c.sortKey ? (
                        <SortLabel label={c.header} active={active} dir={active ? sortDir : null} />
                      ) : (
                        c.header
                      )}
                      {c.resizable && <ColResizer {...cols.resizer(id)} />}
                    </SortableTh>
                  );
                })}
              </tr>
            </OrderableHeader>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr
                key={g.id}
                className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                onClick={() => onEdit(g)}
                title="Clique pra editar"
              >
                {oc.order.map((id) => {
                  const c = colDefs[id];
                  return (
                    <td key={id} className={c.tdClassName}>
                      {c.cell(g)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
