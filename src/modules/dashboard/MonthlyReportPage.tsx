import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import {
  loadMonthlyReport,
  monthOptions,
  quarterOfMonth,
  type MonthlyReport,
} from "@/lib/report";
import { listOkrs, okrProgress, type Okr } from "@/modules/objetivos/api";
import { formatCurrency } from "@/lib/format";

export function MonthlyReportPage() {
  const months = useMemo(() => monthOptions(12), []);
  const [month, setMonth] = useState(months[0].value);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [okrs, setOkrs] = useState<Okr[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const [r, allOkrs] = await Promise.all([loadMonthlyReport(m), listOkrs()]);
      setReport(r);
      setOkrs(allOkrs.filter((o) => o.quarter === quarterOfMonth(m)));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  const monthLabel =
    months.find((m) => m.value === month)?.label ?? month;

  function buildSummary(): string {
    if (!report) return "";
    const lines = [
      `RELATÓRIO — ${monthLabel.toUpperCase()}`,
      "",
      `Receita: ${formatCurrency(report.income)}`,
      `Despesa: ${formatCurrency(report.expense)}`,
      `Saldo: ${formatCurrency(report.balance)}`,
      "",
      `GIGs realizadas: ${report.gigsCompleted} (cachê ${formatCurrency(report.gigsCache)})`,
      `Festas realizadas: ${report.partiesRealized}`,
      `Conteúdos publicados: ${report.contentPublished}`,
      `Tracks lançadas: ${report.tracksReleased}`,
      `Tarefas concluídas: ${report.tasksCompleted}`,
    ];
    if (okrs.length > 0) {
      lines.push("", `OKRs ${quarterOfMonth(month)}:`);
      for (const o of okrs) {
        lines.push(`- ${o.objective}: ${Math.round(okrProgress(o) * 100)}%`);
      }
    }
    return lines.join("\n");
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(buildSummary());
      toast.success("Resumo copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold leading-tight">Relatório mensal</h1>
          <p className="text-sm text-muted-foreground">
            Um retrato do mês: dinheiro, entregas e progresso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void copySummary()}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Erro ao carregar relatório: {error}
        </div>
      ) : !report ? null : (
        <>
          {/* Financeiro */}
          <div className="grid gap-3 sm:grid-cols-3">
            <ReportKpi label="Receita" value={formatCurrency(report.income)} tone="success" />
            <ReportKpi label="Despesa" value={formatCurrency(report.expense)} tone="danger" />
            <ReportKpi
              label="Saldo"
              value={formatCurrency(report.balance)}
              tone={report.balance >= 0 ? "success" : "danger"}
            />
          </div>

          {/* Atividade */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Atividade do mês</CardTitle>
              <CardDescription>{monthLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ActivityStat label="GIGs realizadas" value={report.gigsCompleted} sub={formatCurrency(report.gigsCache)} />
                <ActivityStat label="Festas realizadas" value={report.partiesRealized} />
                <ActivityStat label="Conteúdos publicados" value={report.contentPublished} />
                <ActivityStat label="Tracks lançadas" value={report.tracksReleased} />
                <ActivityStat label="Tarefas concluídas" value={report.tasksCompleted} />
              </div>
            </CardContent>
          </Card>

          {/* OKRs do trimestre */}
          {okrs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  OKRs · {quarterOfMonth(month)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {okrs.map((o) => {
                  const pct = Math.round(okrProgress(o) * 100);
                  return (
                    <div key={o.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium leading-tight">
                          {o.objective}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ReportKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "danger" | "default";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-2xl tabular-nums",
            tone === "success" && "text-emerald-500",
            tone === "danger" && "text-destructive"
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

const ACTIVITY_HINTS: Record<string, string> = {
  "GIGs realizadas": "Registre suas GIGs em /gigs",
  "Festas realizadas": "Produza festas em /festas",
  "Conteúdos publicados": "Gerencie conteúdo em /conteudo",
  "Tracks lançadas": "Acompanhe lançamentos em /musica",
  "Tarefas concluídas": "Veja tarefas em /tarefas",
};

function ActivityStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80">{sub}</div>}
      {value === 0 && ACTIVITY_HINTS[label] && (
        <div className="mt-1 text-[10px] italic text-muted-foreground/60">
          {ACTIVITY_HINTS[label]}
        </div>
      )}
    </div>
  );
}
