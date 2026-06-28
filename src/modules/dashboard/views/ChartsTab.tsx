import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { loadMonthlyCharts, type ChartPeriod, type MonthlyChartPoint } from "../charts";

type Series = { key: keyof MonthlyChartPoint; name: string; color: string };

/** Gráficos de linha mês a mês das métricas do negócio, no período escolhido. */
export function ChartsTab({ period }: { period: ChartPeriod }) {
  const [data, setData] = useState<MonthlyChartPoint[] | null>(null);

  // Recarrega ao trocar o período (o "tudo" pode variar conforme os dados).
  useEffect(() => {
    let alive = true;
    void loadMonthlyCharts(period).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [period]);

  if (!data) {
    return (
      <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
        Carregando gráficos…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LineCard
        title="GIGs por mês"
        data={data}
        series={[{ key: "gigs", name: "GIGs", color: "hsl(var(--primary))" }]}
      />
      <LineCard
        title="Tarefas por mês"
        data={data}
        series={[
          { key: "tasksCreated", name: "Criadas", color: "#3b82f6" },
          { key: "tasksDone", name: "Concluídas", color: "#10b981" },
        ]}
      />
      <LineCard
        title="Ideias capturadas por mês"
        data={data}
        series={[{ key: "ideas", name: "Ideias", color: "#f59e0b" }]}
      />
      <LineCard
        title="Produção musical (faixas) por mês"
        data={data}
        series={[{ key: "tracks", name: "Faixas", color: "#06b6d4" }]}
      />
      <div className="lg:col-span-2">
        <LineCard
          title="Financeiro por mês"
          data={data}
          currency
          series={[
            { key: "income", name: "Receitas", color: "#10b981" },
            { key: "expense", name: "Despesas", color: "#ef4444" },
          ]}
        />
      </div>
    </div>
  );
}

function LineCard({
  title,
  data,
  series,
  currency,
}: {
  title: string;
  data: MonthlyChartPoint[];
  series: Series[];
  currency?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              width={currency ? 64 : 32}
              tickFormatter={
                currency
                  ? (v: number) => `R$${Math.round(v / 1000)}k`
                  : undefined
              }
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={
                currency
                  ? (value: number) => formatCurrency(value)
                  : (value: number) => value
              }
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s) => (
              <Line
                key={String(s.key)}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
