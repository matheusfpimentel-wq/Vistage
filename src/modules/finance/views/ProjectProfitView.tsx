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
  track: "Música",
};

const KIND_VARIANT: Record<ProjectProfit["kind"], "default" | "secondary" | "outline"> = {
  gig: "default",
  party: "secondary",
  student: "outline",
  track: "secondary",
};

export function ProjectProfitView() {
  const [data, setData] = useState<ProjectProfit[] | null>(null);
  const [mode, setMode] = useState<"table" | "pareto">("table");

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

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        Sem dados de lucro ainda. Vincule receitas/despesas a GIGs ou registre
        bilheteria e custos nas festas.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-md border p-0.5">
        {(["table", "pareto"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg px-3 py-1 text-xs transition",
              mode === m
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30 ring-1 ring-inset ring-white/20"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {m === "table" ? "Tabela" : "Pareto (80/20)"}
          </button>
        ))}
      </div>

      {mode === "table" ? <ProfitTable data={data} /> : <ProfitPareto data={data} />}
    </div>
  );
}

function ProfitTable({ data }: { data: ProjectProfit[] }) {
  const rows: Row[] = data.map((it) => ({
    ...it,
    margin: it.income > 0 ? Math.round((it.profit / it.income) * 100) : null,
  }));
  const { sorted, sortKey, sortDir, handleSort } = useTableSort<Row>(rows);
  const totalProfit = data.reduce((s, i) => s + i.profit, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
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

// Pareto (regra 80/20): concentração da RECEITA entre os projetos. Receita é
// sempre >= 0, então o acumulado de % funciona limpo (lucro poderia ser
// negativo e quebrar a leitura). Espelha o antigo "Pareto de Receita" do dash,
// agora abrangendo GIGs, festas, alunos e músicas.
function ProfitPareto({ data }: { data: ProjectProfit[] }) {
  const [showAll, setShowAll] = useState(false);
  const earning = data
    .filter((p) => p.income > 0)
    .map((p) => ({ project: p, value: p.income }))
    .sort((a, b) => b.value - a.value);

  const total = earning.reduce((s, e) => s + e.value, 0);

  let cum = 0;
  const vital: typeof earning = [];
  for (const e of earning) {
    if (cum >= total * 0.8) break;
    vital.push(e);
    cum += e.value;
  }
  const vitalShareOfCount = earning.length > 0 ? Math.round((vital.length / earning.length) * 100) : 0;
  const vitalShareOfRevenue = total > 0 ? Math.round((cum / total) * 100) : 0;

  if (earning.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem receita registrada por projeto ainda.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="font-semibold">{vitalShareOfCount}%</span> dos projetos
        {" "}({vital.length} de {earning.length}) geraram{" "}
        <span className="font-semibold text-emerald-600">{vitalShareOfRevenue}%</span> da receita
        {" "}({formatCurrency(cum)} de {formatCurrency(total)}).
      </div>
      <div className="space-y-1.5">
        {(showAll ? earning : vital).map((e, i) => {
          const pct = total > 0 ? (e.value / total) * 100 : 0;
          const isVital = i < vital.length;
          return (
            <div key={`${e.project.kind}-${e.project.id}`} className="flex items-center gap-2">
              <span className="flex w-44 shrink-0 items-center gap-1.5 truncate text-xs" title={e.project.name}>
                <Badge variant={KIND_VARIANT[e.project.kind]} className="shrink-0 px-1 py-0 text-[10px]">
                  {KIND_LABEL[e.project.kind]}
                </Badge>
                <span className="truncate">{e.project.name}</span>
              </span>
              <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
                <div
                  className={cn("h-full rounded-full", isVital ? "bg-emerald-500" : "bg-muted-foreground/40")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums">
                {formatCurrency(e.value)}
              </span>
            </div>
          );
        })}
      </div>
      {!showAll && earning.length > vital.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          Ver todos os {earning.length} projetos →
        </button>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Em verde, os poucos vitais que somam ~80% da receita. Foque no que mais traz retorno.
      </p>
    </div>
  );
}
