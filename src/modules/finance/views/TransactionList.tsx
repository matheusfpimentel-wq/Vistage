import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FinanceTransactionWithCategory } from "../types";
import { cn } from "@/lib/utils";

type Props = {
  transactions: FinanceTransactionWithCategory[];
  onEdit: (t: FinanceTransactionWithCategory) => void;
  onDelete: (t: FinanceTransactionWithCategory) => void;
};

export function TransactionList({ transactions, onEdit, onDelete }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Nenhuma transação encontrada.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-8 px-3 py-2 text-left"></th>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Descrição</th>
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const isIncome = t.kind === "income";
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
                  {formatDate(t.date)}
                </td>
                <td className="px-3 py-2">
                  <div className={cn(t.description ? "" : "text-muted-foreground")}>
                    {t.description ?? "—"}
                  </div>
                  {(t.gig_id || t.expense_type === "Fixa" || t.tax_relevant === 1) && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {t.gig_id && <Badge variant="outline" className="text-xs">GIG</Badge>}
                      {t.expense_type === "Fixa" && (
                        <Badge variant="outline" className="text-xs">Fixa</Badge>
                      )}
                      {t.tax_relevant === 1 && (
                        <Badge variant="outline" className="text-xs">imposto</Badge>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {t.category_name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={t.status === "Recebido/Pago" ? "success" : "warning"}>
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
