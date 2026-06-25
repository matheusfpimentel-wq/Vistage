import { useRef } from "react";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatMoney } from "@/lib/format";
import type { FinanceTransactionWithCategory } from "../types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";

type Props = {
  transactions: FinanceTransactionWithCategory[];
  onEdit: (t: FinanceTransactionWithCategory) => void;
  onDelete: (t: FinanceTransactionWithCategory) => void;
};

const COL_COUNT = 7;

export function TransactionList({ transactions, onEdit, onDelete }: Props) {
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(transactions);
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualização: o extrato pode ter milhares de linhas (anos de lançamentos).
  // Renderizamos só a janela visível + overscan; measureElement corrige a altura
  // das linhas que têm a 2ª linha de selos (GIG/Aula/Fixa/imposto…).
  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49,
    overscan: 12,
    getItemKey: (i) => sorted[i].id,
  });

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nenhuma transação encontrada."
      />
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto rounded-md border">
      {/* table-fixed + colgroup fixam as larguras: como só uma janela de linhas
          existe no DOM, sem isso as colunas “pulariam” conforme se rola. */}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: 44 }} />
          <col style={{ width: 112 }} />
          <col />
          <col style={{ width: 116 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 168 }} />
          <col style={{ width: 96 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left"></th>
            <SortableHeader col="date" label="Data" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left hover:text-foreground" />
            <SortableHeader col="description" label="Descrição" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left hover:text-foreground" />
            <SortableHeader col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-left hover:text-foreground" />
            <SortableHeader col="amount" label="Valor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right hover:text-foreground" />
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COL_COUNT} style={{ height: paddingTop, padding: 0 }} />
            </tr>
          )}
          {virtualItems.map((vi) => {
            const t = sorted[vi.index];
            const isIncome = t.kind === "income";
            const hasLinks = t.gig_id || t.class_id || t.student_package_id || t.track_id || t.party_id;
            return (
              <tr
                key={t.id}
                data-index={vi.index}
                ref={rowVirtualizer.measureElement}
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
                  <div className={cn("break-words", t.description ? "" : "text-muted-foreground")}>
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
                  {t.currency && t.currency !== "BRL" && t.original_amount != null && (
                    <div className="text-[11px] font-normal text-muted-foreground">
                      {formatMoney(t.original_amount, t.currency)}
                      {t.exchange_rate
                        ? ` · ${t.exchange_rate.toLocaleString("pt-BR")}`
                        : ""}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate">
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
          {paddingBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COL_COUNT} style={{ height: paddingBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
