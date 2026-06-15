import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadFinanceInsights, type FinanceInsights } from "../api";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";

const INCOME_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5", "#059669", "#047857"];
const EXPENSE_COLORS = ["#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2", "#dc2626", "#b91c1c"];

type Props = { refreshKey: number };

export function FinanceDashboard({ refreshKey }: Props) {
  const [data, setData] = useState<FinanceInsights | null>(null);

  useEffect(() => {
    void loadFinanceInsights().then(setData);
  }, [refreshKey]);

  if (!data) {
    return <div className="text-sm text-muted-foreground">Carregando dashboard…</div>;
  }

  const monthlyData = data.monthly.map((m) => {
    let label = m.month;
    try {
      label = format(parse(m.month, "yyyy-MM", new Date()), "MMM/yy", {
        locale: ptBR,
      });
    } catch {
      /* keep raw */
    }
    return { ...m, label };
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI
          icon={<ArrowUpRight className="h-4 w-4 text-emerald-500" />}
          label="Receitas (mês)"
          value={formatCurrency(data.monthIncome)}
        />
        <KPI
          icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
          label="Despesas (mês)"
          value={formatCurrency(data.monthExpense)}
        />
        <KPI
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo do mês"
          value={formatCurrency(data.monthBalance)}
          tone={data.monthBalance >= 0 ? "positive" : "negative"}
        />
        <KPI
          icon={<Wallet className="h-4 w-4" />}
          label="Saldo do ano"
          value={formatCurrency(data.yearBalance)}
          tone={data.yearBalance >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Receitas vs despesas — 12 meses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receitas vs despesas (12 meses)</CardTitle>
          <CardDescription>
            Histórico mensal das suas transações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v.toString())}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pies por categoria */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryPie
          title="Receitas por categoria (mês)"
          data={data.byIncomeCategory}
          colors={INCOME_COLORS}
        />
        <CategoryPie
          title="Despesas por categoria (mês)"
          data={data.byExpenseCategory}
          colors={EXPENSE_COLORS}
        />
      </div>

      {/* Top GIGs + Projeções */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 5 GIGs mais lucrativas</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topGigs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Sem receitas vinculadas a GIGs ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {data.topGigs.map((g, i) => (
                  <div
                    key={g.gig_id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">#{i + 1}</Badge>
                      <span className="font-medium">{g.venue_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(g.date)}
                      </span>
                    </div>
                    <span className="tabular-nums font-medium text-emerald-500">
                      {formatCurrency(g.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projeção (30 dias)</CardTitle>
            <CardDescription>
              Lançamentos previstos para os próximos 30 dias
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProjectionRow
              label="A receber"
              value={data.next30Receivable}
              tone="positive"
            />
            <ProjectionRow
              label="A pagar"
              value={data.next30Payable}
              tone="negative"
            />
            <div className="border-t pt-3">
              <ProjectionRow
                label="Saldo projetado"
                value={data.next30Receivable - data.next30Payable}
                tone={
                  data.next30Receivable - data.next30Payable >= 0
                    ? "positive"
                    : "negative"
                }
                bold
              />
            </div>
            <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
              <div className="text-muted-foreground">Despesas fixas mensais</div>
              <div className="mt-0.5 tabular-nums font-medium">
                {formatCurrency(data.fixedMonthlyExpenses)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card
      className={
        tone === "positive"
          ? "border-emerald-500/30"
          : tone === "negative"
          ? "border-destructive/40"
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CategoryPie({
  title,
  data,
  colors,
}: {
  title: string;
  data: { name: string; value: number }[];
  colors: string[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sem dados este mês.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: colors[i % colors.length] }}
                />
                <span className="truncate">{d.name}</span>
              </div>
              <span className="tabular-nums text-muted-foreground">
                {formatCurrency(d.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectionRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative";
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? "text-base font-semibold" : ""} ${
          tone === "positive" ? "text-emerald-500" : "text-destructive"
        }`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
