import { useEffect, useState } from "react";
import { CalendarRange, Loader2, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { DATA_CHANGED } from "@/lib/events";
import { loadProjectProfit, type ProjectProfit } from "../api";

export function ProjectProfitView() {
  const [data, setData] = useState<{
    gigs: ProjectProfit[];
    parties: ProjectProfit[];
  } | null>(null);

  useEffect(() => {
    const load = () => void loadProjectProfit().then(setData);
    load();
    window.addEventListener(DATA_CHANGED, load);
    return () => window.removeEventListener(DATA_CHANGED, load);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const empty = data.gigs.length === 0 && data.parties.length === 0;
  if (empty) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        Sem dados de lucro ainda. Vincule receitas/despesas a GIGs ou registre
        bilheteria e custos nas festas.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfitSection
        title="Lucro por GIG"
        icon={<CalendarRange className="h-4 w-4 text-primary" />}
        items={data.gigs}
        hint="Receitas − despesas vinculadas à GIG no Financeiro."
      />
      <ProfitSection
        title="Lucro por festa"
        icon={<PartyPopper className="h-4 w-4 text-pink-400" />}
        items={data.parties}
        hint="Bilheteria vendida − custos reais do orçamento."
      />
    </div>
  );
}

function ProfitSection({
  title,
  icon,
  items,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  items: ProjectProfit[];
  hint: string;
}) {
  if (items.length === 0) return null;
  const totalProfit = items.reduce((s, i) => s + i.profit, 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
        </h3>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            totalProfit >= 0 ? "text-emerald-500" : "text-destructive"
          )}
        >
          {formatCurrency(totalProfit)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">Projeto</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2 text-right">Receita</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2 text-right">Lucro</th>
              <th className="px-3 py-2 text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const margin =
                it.income > 0 ? Math.round((it.profit / it.income) * 100) : null;
              return (
                <tr
                  key={`${it.kind}-${it.id}`}
                  className="border-b last:border-0 hover:bg-muted/20"
                >
                  <td className="px-3 py-2 font-medium">{it.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {it.date ? formatDate(it.date) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-500">
                    {formatCurrency(it.income)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(it.expense)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      it.profit >= 0 ? "text-emerald-500" : "text-destructive"
                    )}
                  >
                    {formatCurrency(it.profit)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {margin !== null ? `${margin}%` : "—"}
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
