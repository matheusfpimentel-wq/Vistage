import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowUpDown, Pencil, Trash2, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinanceTransactionWithCategory } from "../types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";

type SortKey = "date" | "description" | "amount" | "status";
type SortDir = "asc" | "desc";

type Props = {
  transactions: FinanceTransactionWithCategory[];
  onEdit: (t: FinanceTransactionWithCategory) => void;
  onDelete: (t: FinanceTransactionWithCategory) => void;
};

export function TransactionList({ transactions, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...transactions].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date") cmp = a.date.localeCompare(b.date);
    else if (sortKey === "description") cmp = (a.description ?? "").localeCompare(b.description ?? "");
    else if (sortKey === "amount") cmp = a.amount - b.amount;
    else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nenhuma transação encontrada."
      />
    );
  }

  type ColDef = { key: SortKey; label: string; align: "left" | "right" };
  const cols: ColDef[] = [
    { key: "date", label: "Data", align: "left" },
    { key: "description", label: "Descrição", align: "left" },
    { key: "status", label: "Status", align: "left" },
    { key: "amount", label: "Valor", align: "right" },
  ];

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2 text-left"></th>
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
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const isIncome = t.kind === "income";
            const hasLinks = t.gig_id || t.class_id || t.student_package_id || t.track_id || t.party_id;
            return (
              <tr
                key={t.id}
                className="border-t transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  {isIncome ? (
                    <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ArrowDownCircle className="h-4 w-4 text-destructive" />
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {formatDate(t.date, "dd/MM/yyyy")}
                </td>
                <td className="px-3 py-2">
                  <div className={cn(t.description ? "" : "text-muted-foreground")}>
                    {t.description ?? "—"}
                  </div>
                  {(hasLinks || t.expense_type === "Fixa" || t.tax_relevant === 1) && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {t.gig_id && (
                        <Link to={`/gigs?open=${t.gig_id}`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">GIG ↗</Badge>
                        </Link>
                      )}
                      {t.class_id && (
                        <Link to={`/aulas?open=${t.class_id}`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">Aula ↗</Badge>
                        </Link>
                      )}
                      {t.student_package_id && (
                        <Link to={`/aulas?open=${t.student_package_id}`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">Pacote ↗</Badge>
                        </Link>
                      )}
                      {t.track_id && (
                        <Link to={`/musica?open=${t.track_id}`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">Música ↗</Badge>
                        </Link>
                      )}
                      {t.party_id && (
                        <Link to={`/festas?open=${t.party_id}`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs hover:bg-muted cursor-pointer">Festa ↗</Badge>
                        </Link>
                      )}
                      {t.expense_type === "Fixa" && (
                        <Badge variant="outline" className="text-xs">Fixa</Badge>
                      )}
                      {t.tax_relevant === 1 && (
                        <Badge variant="outline" className="text-xs">imposto</Badge>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={(t.status === "Recebido" || t.status === "Pago") ? "success" : "warning"}>
                    {t.status}
                  </Badge>
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums font-medium",
                    isIncome ? "text-emerald-500" : "text-destructive"
                  )}
                >
                  {isIncome ? "+" : "−"} {formatCurrency(t.amount)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {t.category_name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(t)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(t)}
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
