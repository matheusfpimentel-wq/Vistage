import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { DATA_CHANGED } from "@/lib/events";
import { SortableHeader, useTableSort } from "@/lib/useTableSort";
import { loadProjectProfit, type ProjectProfit } from "../api";

type Row = ProjectProfit & { margin: number | null };

const KIND_LABEL: Record<ProjectProfit["kind"], string> = {
  gig: "GIG",
  party: "Festa",
  student: "Aluno",
};

const KIND_VARIANT: Record<ProjectProfit["kind"], "default" | "secondary" | "outline"> = {
  gig: "default",
  party: "secondary",
  student: "outline",
};

export function ProjectProfitView() {
  const [data, setData] = useState<ProjectProfit[] | null>(null);

  useEffect(() => {
    const load = () => void loadProjectProfit().then(setData);
    load();
    window.addEventListener(DATA_CHANGED, load);
    return () => window.removeEventListener(DATA_CHANGED, load);
  }, []);

  const rows: Row[] = (data ?? []).map((it) => ({
    ...it,
    margin: it.income > 0 ? Math.round((it.profit / it.income) * 100) : null,
  }));

  const { sorted, sortKey, sortDir, handleSort } = useTableSort<Row>(rows);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        Sem dados de lucro ainda. Vincule receitas/despesas a GIGs ou registre
        bilheteria e custos nas festas.
      </div>
    );
  }

  const totalProfit = data.reduce((s, i) => s + i.profit, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Lucro consolidado por GIG, festa e aluno.
        </p>
        <span className="text-sm font-semibold tabular-nums text-emerald-500">
          {formatCurrency(totalProfit)}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <SortableHeader<Row> col="name" label="Projeto" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
              <SortableHeader<Row> col="kind" label="Tipo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
              <SortableHeader<Row> col="date" label="Data" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2" />
              <SortableHeader<Row> col="income" label="Receita" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
              <SortableHeader<Row> col="expense" label="Custo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
              <SortableHeader<Row> col="profit" label="Lucro" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
              <SortableHeader<Row> col="margin" label="Margem" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => {
              const isStudent = it.kind === "student";
              return (
                <tr
                  key={`${it.kind}-${it.id}`}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-2 font-medium">{it.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant={KIND_VARIANT[it.kind]}>{KIND_LABEL[it.kind]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {it.date ? formatDate(it.date) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">
                    {formatCurrency(it.income)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {isStudent ? "—" : formatCurrency(it.expense)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      it.profit >= 0 ? "text-emerald-500" : "text-destructive"
                    )}
                  >
                    {isStudent ? "—" : formatCurrency(it.profit)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {isStudent || it.margin === null ? "—" : `${it.margin}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
