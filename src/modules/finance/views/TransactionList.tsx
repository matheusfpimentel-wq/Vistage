import { useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EMPTY_VALUE, formatCurrency, formatDate, formatMoney } from "@/lib/format";
import type { FinanceTransactionWithCategory } from "../types";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTableSort } from "@/lib/useTableSort";
import { OrderableHeader, SortableTh, SortLabel, useOrderableColumns } from "@/lib/orderableColumns";

type Props = {
  transactions: FinanceTransactionWithCategory[];
  onEdit: (t: FinanceTransactionWithCategory) => void;
  onDelete: (t: FinanceTransactionWithCategory) => void;
};

const COL_COUNT = 7;

// Cabeçalho e corpo dirigidos pela mesma ORDEM. A virtualização é VERTICAL
// (linhas); reordenar colunas é HORIZONTAL — ortogonal, não toca no medidor de
// linhas nem nas linhas de padding. "kind" (marcador), "description" (principal)
// e "actions" ficam travadas; data/status/valor/categoria reordenam.
type TxCol = {
  id: string;
  locked?: boolean;
  sortKey?: keyof FinanceTransactionWithCategory;
  header: string;
  /** largura do <col> (undefined = flexível, preenche o resto — a descrição). */
  width?: number;
  thClassName: string;
  tdClassName?: string;
  cell: (t: FinanceTransactionWithCategory, onEdit: Props["onEdit"], onDelete: Props["onDelete"]) => ReactNode;
};

export function TransactionList({ transactions, onEdit, onDelete }: Props) {
  const { sorted, sortKey, sortDir, handleSort } = useTableSort(transactions);
  const parentRef = useRef<HTMLDivElement>(null);

  const colDefs: Record<string, TxCol> = {
    kind: {
      id: "kind",
      locked: true,
      sortKey: "kind",
      header: "",
      width: 44,
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2",
      cell: (t) =>
        t.kind === "income" ? (
          <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <ArrowDownCircle className="h-4 w-4 text-destructive" />
        ),
    },
    date: {
      id: "date",
      sortKey: "date",
      header: "Data",
      width: 112,
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2 whitespace-nowrap tabular-nums",
      cell: (t) => formatDate(t.date, "dd/MM/yyyy"),
    },
    description: {
      id: "description",
      locked: true,
      sortKey: "description",
      header: "Descrição",
      width: undefined, // flexível: preenche o espaço restante
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2",
      cell: (t) => {
        const hasLinks = t.gig_id || t.class_id || t.student_package_id || t.track_id || t.party_id;
        return (
          <>
            <div className={cn("break-words", t.description ? "" : "text-muted-foreground")}>
              {t.description ?? EMPTY_VALUE}
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
                {t.expense_type === "Fixa" && <Badge variant="outline" className="text-xs">Fixa</Badge>}
                {t.tax_relevant === 1 && <Badge variant="outline" className="text-xs">imposto</Badge>}
              </div>
            )}
          </>
        );
      },
    },
    status: {
      id: "status",
      sortKey: "status",
      header: "Status",
      width: 116,
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2",
      cell: (t) => (
        <Badge variant={t.status === "Recebido" || t.status === "Pago" ? "success" : "warning"}>
          {t.status}
        </Badge>
      ),
    },
    amount: {
      id: "amount",
      sortKey: "amount",
      header: "Valor",
      width: 140,
      thClassName: "px-3 py-2 text-right hover:text-foreground",
      tdClassName: "px-3 py-2 text-right tabular-nums font-medium",
      cell: (t) => {
        const isIncome = t.kind === "income";
        return (
          <span className={isIncome ? "text-emerald-500" : "text-destructive"}>
            {isIncome ? "+" : "−"} {formatCurrency(t.amount)}
            {t.currency && t.currency !== "BRL" && t.original_amount != null && (
              <div className="text-[11px] font-normal text-muted-foreground">
                {formatMoney(t.original_amount, t.currency)}
                {t.exchange_rate ? ` · ${t.exchange_rate.toLocaleString("pt-BR")}` : ""}
              </div>
            )}
          </span>
        );
      },
    },
    category: {
      id: "category",
      sortKey: "category_name",
      header: "Categoria",
      width: 168,
      thClassName: "px-3 py-2 text-left hover:text-foreground",
      tdClassName: "px-3 py-2 text-muted-foreground truncate",
      cell: (t) => t.category_name ?? EMPTY_VALUE,
    },
    actions: {
      id: "actions",
      locked: true,
      header: "Ações",
      width: 96,
      thClassName: "px-3 py-2 text-right",
      tdClassName: "px-3 py-2",
      cell: (t, edit, del) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" onClick={() => edit(t)} aria-label="Editar">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => del(t)} aria-label="Excluir">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  };

  const oc = useOrderableColumns(
    "finance",
    ["kind", "date", "description", "status", "amount", "category", "actions"].map((id) => ({
      id,
      locked: colDefs[id].locked,
    }))
  );

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
    return <EmptyState icon={Wallet} title="Nenhuma transação encontrada." />;
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
          {oc.order.map((id) => {
            const w = colDefs[id].width;
            const style: CSSProperties | undefined = w != null ? { width: w } : undefined;
            return <col key={id} style={style} />;
          })}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
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
                  </SortableTh>
                );
              })}
            </tr>
          </OrderableHeader>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={COL_COUNT} style={{ height: paddingTop, padding: 0 }} />
            </tr>
          )}
          {virtualItems.map((vi) => {
            const t = sorted[vi.index];
            return (
              <tr
                key={t.id}
                data-index={vi.index}
                ref={rowVirtualizer.measureElement}
                className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                onClick={() => onEdit(t)}
                title="Clique pra editar"
              >
                {oc.order.map((id) => {
                  const c = colDefs[id];
                  return (
                    <td key={id} className={c.tdClassName}>
                      {c.cell(t, onEdit, onDelete)}
                    </td>
                  );
                })}
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
