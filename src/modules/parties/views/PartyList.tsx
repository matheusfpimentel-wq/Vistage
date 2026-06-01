import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { type PartyDeserialized, partyStatusColor, estimatedRevenue } from "../types";

const formatCurrency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  parties: PartyDeserialized[];
  onEdit: (p: PartyDeserialized) => void;
  onDelete: (p: PartyDeserialized) => void;
};

export function PartyList({ parties, onEdit, onDelete }: Props) {
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
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Título</th>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Venue</th>
            <th className="px-3 py-2 text-right">Capacidade</th>
            <th className="px-3 py-2 text-right">Receita est.</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {parties.map((p) => {
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
