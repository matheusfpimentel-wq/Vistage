import { useMemo, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INTERACTIVE_ROW_CLASS, interactiveRowProps } from "@/lib/interactiveRow";
import { EMPTY_VALUE, formatDate, formatCurrency } from "@/lib/format";
import { type PartyDeserialized, partyStatusColor, estimatedRevenue } from "../types";
import { useTableSort } from "@/lib/useTableSort";
import { OrderableHeader, SortableTh, SortLabel, useOrderableColumns } from "@/lib/orderableColumns";
import type { ListDensity } from "@/components/shared/ListDensityToggle";

type Props = {
  parties: PartyDeserialized[];
  onEdit: (p: PartyDeserialized) => void;
  onDelete: (p: PartyDeserialized) => void;
  density?: ListDensity;
};

/**
 * Linha da tabela = festa + campo derivado só para ordenar a coluna de receita,
 * que não mapeia direto num campo (é calculada por estimatedRevenue).
 */
type PartyRow = PartyDeserialized & {
  _revenue: number;
};

// Cabeçalho e corpo dirigidos pela mesma ORDEM (useOrderableColumns): "title"
// (principal) e "actions" travadas; as do meio reordenam ao arrastar o cabeçalho.
type PartyCol = {
  id: string;
  locked?: boolean;
  sortKey?: keyof PartyRow;
  header: string;
  thClassName: string;
  tdClassName?: string;
  cell: (p: PartyDeserialized) => ReactNode;
};

export function PartyList({ parties, onEdit, onDelete, density = "full" }: Props) {
  const rows: PartyRow[] = useMemo(
    () =>
      parties.map((p) => ({
        ...p,
        _revenue: estimatedRevenue(p),
      })),
    [parties]
  );
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(rows);

  const colDefs: Record<string, PartyCol> = {
    status: {
      id: "status",
      sortKey: "status",
      header: "Status",
      thClassName: "px-3 py-2",
      tdClassName: "px-3 py-2",
      cell: (p) => <Badge className={partyStatusColor(p.status)}>{p.status}</Badge>,
    },
    title: {
      id: "title",
      locked: true,
      sortKey: "title",
      header: "Título",
      thClassName: "px-3 py-2",
      tdClassName: "px-3 py-2 font-medium",
      cell: (p) => p.title,
    },
    date: {
      id: "date",
      sortKey: "date",
      header: "Data",
      thClassName: "px-3 py-2",
      tdClassName: "px-3 py-2 text-muted-foreground",
      cell: (p) => (p.date ? formatDate(p.date) : EMPTY_VALUE),
    },
    venue: {
      id: "venue",
      sortKey: "venue_name",
      header: "Venue",
      thClassName: "px-3 py-2",
      tdClassName: "px-3 py-2 text-muted-foreground",
      cell: (p) => p.venue_name ?? EMPTY_VALUE,
    },
    capacity: {
      id: "capacity",
      sortKey: "expected_capacity",
      header: "Capacidade",
      thClassName: "px-3 py-2 text-right",
      tdClassName: "px-3 py-2 text-right tabular-nums text-muted-foreground",
      cell: (p) => p.expected_capacity ?? EMPTY_VALUE,
    },
    revenue: {
      id: "revenue",
      sortKey: "_revenue",
      header: "Receita est.",
      thClassName: "px-3 py-2 text-right",
      tdClassName: "px-3 py-2 text-right tabular-nums",
      cell: (p) => {
        const rev = estimatedRevenue(p);
        return rev > 0 ? formatCurrency(rev) : EMPTY_VALUE;
      },
    },
    actions: {
      id: "actions",
      locked: true,
      header: "",
      thClassName: "px-3 py-2",
      tdClassName: "px-3 py-2",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(p)}
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(p)}
            aria-label="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  };

  const oc = useOrderableColumns(
    "parties",
    ["status", "title", "date", "venue", "capacity", "revenue", "actions"].map((id) => ({
      id,
      locked: colDefs[id].locked,
    }))
  );

  if (parties.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma festa cadastrada.
      </p>
    );
  }

  const compact = density === "compact";
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className={cn("w-full", compact ? "text-xs [&_td]:py-1 [&_th]:py-1" : "text-sm")}>
        <thead>
          <OrderableHeader oc={oc}>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
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
                  </SortableTh>
                );
              })}
            </tr>
          </OrderableHeader>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.id}
              className={cn("cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/20", INTERACTIVE_ROW_CLASS)}
              {...interactiveRowProps(() => onEdit(p))}
              title="Clique pra editar"
            >
              {oc.order.map((id) => {
                const c = colDefs[id];
                return (
                  <td key={id} className={c.tdClassName}>
                    {c.cell(p)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
