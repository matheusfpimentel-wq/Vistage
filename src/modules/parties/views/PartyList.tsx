import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { type PartyDeserialized, partyStatusColor, estimatedRevenue } from "../types";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";

const formatCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  parties: PartyDeserialized[];
  onEdit: (p: PartyDeserialized) => void;
  onDelete: (p: PartyDeserialized) => void;
};

export function PartyList({ parties, onEdit, onDelete }: Props) {
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(parties);
  if (parties.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nenhuma festa cadastrada.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <SortableHeader<PartyDeserialized> col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
            <SortableHeader<PartyDeserialized> col="title" label="Título" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
            <SortableHeader<PartyDeserialized> col="date" label="Data" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
            <SortableHeader<PartyDeserialized> col="venue_name" label="Venue" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
            <SortableHeader<PartyDeserialized> col="expected_capacity" label="Capacidade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
            <th className="px-3 py-2 text-right">Receita est.</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const rev = estimatedRevenue(p);
            return (
              <tr
                key={p.id}
                className="border-b last:border-0 hover:bg-muted/20"
              >
                <td className="px-3 py-2">
                  <Badge className={partyStatusColor(p.status)}>
                    {p.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-medium">{p.title}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.date ? formatDate(p.date) : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.venue_name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {p.expected_capacity ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {rev > 0 ? formatCurrency(rev) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
