import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
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
  buildReportCsv,
  loadMonthlyReport,
  monthOptions,
  quarterOfMonth,
  type MonthlyReport,
  type TransactionRow,
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

  function exportCsv() {
    if (!report) return;
    try {
      const csv = buildReportCsv(report, monthLabel);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exportado");
    } catch {
      toast.error("Não foi possível exportar o CSV");
    }
  }

  async function exportPdf() {
    if (!report) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 48;
      const contentRight = pageWidth - marginX;
      let y = 64;

      function checkPage(needed = 24) {
        if (y + needed > pageHeight - 48) { doc.addPage(); y = 64; }
      }

      const sectionTitle = (label: string) => {
        checkPage(32);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(30);
        doc.text(label, marginX, y);
        y += 20;
      };

      const row = (label: string, value: string) => {
        checkPage(18);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(60);
        doc.text(label, marginX, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20);
        doc.text(value, contentRight, y, { align: "right" });
        y += 18;
      };

      const tableRow = (cols: string[], widths: number[], bold = false) => {
        checkPage(16);
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(9);
        doc.setTextColor(bold ? 20 : 60);
        let x = marginX;
        for (let i = 0; i < cols.length; i++) {
          const w = widths[i];
          const align = i === cols.length - 1 ? "right" : "left";
          doc.text(cols[i], align === "right" ? x + w : x, y, { align, maxWidth: w - 4 });
          x += w;
        }
        y += 14;
      };

      // Título
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(`RELATÓRIO — ${monthLabel.toUpperCase()}`, marginX, y);
      y += 26;
      doc.setDrawColor(200);
      doc.line(marginX, y, contentRight, y);
      y += 28;

      // Financeiro resumo
      sectionTitle("Financeiro");
      row("Receita", formatCurrency(report.income));
      row("Despesa", formatCurrency(report.expense));
      row("Saldo", formatCurrency(report.balance));
      y += 14;

      // Receitas detalhadas
      const incomes = report.transactions.filter((t) => t.kind === "income");
      if (incomes.length > 0) {
        sectionTitle("Receitas detalhadas");
        const w = [80, 240, 100, 80];
        tableRow(["Data", "Descrição", "Categoria", "Valor"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const t of incomes) {
          tableRow([t.date, t.description, t.category ?? "—", formatCurrency(t.amount)], w);
        }
        y += 8;
      }

      // Despesas detalhadas
      const expenses = report.transactions.filter((t) => t.kind === "expense");
      if (expenses.length > 0) {
        sectionTitle("Despesas detalhadas");
        const w = [80, 240, 100, 80];
        tableRow(["Data", "Descrição", "Categoria", "Valor"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const t of expenses) {
          tableRow([t.date, t.description, t.category ?? "—", formatCurrency(t.amount)], w);
        }
        y += 8;
      }

      // Atividade
      sectionTitle("Atividade do mês");
      row("GIGs realizadas", `${report.gigsCompleted} (cachê ${formatCurrency(report.gigsCache)})`);
      row("Festas realizadas", String(report.partiesRealized));
      row("Conteúdos publicados", String(report.contentPublished));
      row("Tracks lançadas", String(report.tracksReleased));
      row("Tarefas concluídas", String(report.tasksCompleted));
      y += 8;

      // GIGs
      if (report.gigsList.length > 0) {
        sectionTitle("GIGs do mês");
        const w = [80, 200, 100, 80, 40];
        tableRow(["Data", "Nome", "Cidade", "Cachê", "Status"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const g of report.gigsList) {
          tableRow([g.date, g.name, g.city ?? "—", formatCurrency(g.cache ?? 0), g.status], w);
        }
        y += 8;
      }

      // Festas
      if (report.partiesList.length > 0) {
        sectionTitle("Festas do mês");
        const w = [80, 360, 60];
        tableRow(["Data", "Nome", "Status"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const p of report.partiesList) {
          tableRow([p.date ?? "—", p.name, p.status], w);
        }
        y += 8;
      }

      // Conteúdo
      if (report.contentList.length > 0) {
        sectionTitle("Conteúdo publicado");
        const w = [80, 420];
        tableRow(["Data", "Título"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const c of report.contentList) {
          tableRow([c.publish_date ?? "—", c.title], w);
        }
        y += 8;
      }

      // Tracks
      if (report.tracksList.length > 0) {
        sectionTitle("Tracks lançadas");
        const w = [300, 200];
        tableRow(["Nome", "Data de lançamento"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const t of report.tracksList) {
          tableRow([t.name, t.launched_at], w);
        }
        y += 8;
      }

      // Tarefas
      if (report.tasksList.length > 0) {
        sectionTitle("Tarefas concluídas");
        const w = [380, 120];
        tableRow(["Título", "Prazo"], w, true);
        doc.setDrawColor(220); doc.line(marginX, y - 8, contentRight, y - 8);
        for (const t of report.tasksList) {
          tableRow([t.title, t.due_date ?? "—"], w);
        }
        y += 8;
      }

      // OKRs
      if (okrs.length > 0) {
        sectionTitle(`OKRs · ${quarterOfMonth(month)}`);
        for (const o of okrs) {
          const pct = Math.round(okrProgress(o) * 100);
          row(o.objective, `${pct}%`);
        }
      }

      doc.save(`relatorio-${month}.pdf`);
      toast.success("PDF exportado");
    } catch {
      toast.error("Não foi possível exportar o PDF");
    }
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
        <div className="flex flex-wrap items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPdf()} disabled={!report}>
            <FileDown className="h-3.5 w-3.5" /> PDF
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
          {/* Financeiro KPIs */}
          <div className="grid gap-3 sm:grid-cols-3">
            <ReportKpi label="Receita" value={formatCurrency(report.income)} tone="success" />
            <ReportKpi label="Despesa" value={formatCurrency(report.expense)} tone="danger" />
            <ReportKpi
              label="Saldo"
              value={formatCurrency(report.balance)}
              tone={report.balance >= 0 ? "success" : "danger"}
            />
          </div>

          {/* Receitas detalhadas */}
          <TransactionTable
            title="Receitas"
            rows={report.transactions.filter((t) => t.kind === "income")}
          />

          {/* Despesas detalhadas */}
          <TransactionTable
            title="Despesas"
            rows={report.transactions.filter((t) => t.kind === "expense")}
          />

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

          {/* GIGs */}
          {report.gigsList.length > 0 && (
            <DetailCard title="GIGs do mês">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Data</th>
                    <th className="pb-2 text-left font-medium">Nome</th>
                    <th className="pb-2 text-left font-medium">Cidade</th>
                    <th className="pb-2 text-right font-medium">Cachê</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.gigsList.map((g, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{g.date}</td>
                      <td className="py-1.5 pr-3 font-medium">{g.name}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{g.city ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{g.cache ? formatCurrency(g.cache) : "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{g.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailCard>
          )}

          {/* Festas */}
          {report.partiesList.length > 0 && (
            <DetailCard title="Festas do mês">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Data</th>
                    <th className="pb-2 text-left font-medium">Nome</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.partiesList.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{p.date ?? "—"}</td>
                      <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                      <td className="py-1.5 text-muted-foreground">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailCard>
          )}

          {/* Conteúdo */}
          {report.contentList.length > 0 && (
            <DetailCard title="Conteúdo publicado">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Data</th>
                    <th className="pb-2 text-left font-medium">Título</th>
                  </tr>
                </thead>
                <tbody>
                  {report.contentList.map((c, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{c.publish_date ?? "—"}</td>
                      <td className="py-1.5 font-medium">{c.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailCard>
          )}

          {/* Tracks */}
          {report.tracksList.length > 0 && (
            <DetailCard title="Tracks lançadas">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Nome</th>
                    <th className="pb-2 text-left font-medium">Lançamento</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tracksList.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-3 font-medium">{t.name}</td>
                      <td className="py-1.5 tabular-nums text-muted-foreground">{t.launched_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailCard>
          )}

          {/* Tarefas */}
          {report.tasksList.length > 0 && (
            <DetailCard title="Tarefas concluídas">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Título</th>
                    <th className="pb-2 text-left font-medium">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tasksList.map((t, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-3 font-medium">{t.title}</td>
                      <td className="py-1.5 tabular-nums text-muted-foreground">{t.due_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DetailCard>
          )}

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
                        <span className="text-sm font-medium leading-tight">{o.objective}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-primary/60")}
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

function TransactionTable({ title, rows }: { title: string; rows: TransactionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <DetailCard title={title}>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="pb-2 text-left font-medium">Data</th>
            <th className="pb-2 text-left font-medium">Descrição</th>
            <th className="pb-2 text-left font-medium">Categoria</th>
            <th className="pb-2 text-right font-medium">Valor</th>
            <th className="pb-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-3 tabular-nums text-muted-foreground whitespace-nowrap">{t.date}</td>
              <td className="py-1.5 pr-3">{t.description}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{t.category ?? "—"}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{formatCurrency(t.amount)}</td>
              <td className="py-1.5 text-muted-foreground">{t.status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DetailCard>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function ReportKpi({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "default" }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", tone === "success" && "text-emerald-500", tone === "danger" && "text-destructive")}>
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

function ActivityStat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground/80">{sub}</div>}
      {value === 0 && ACTIVITY_HINTS[label] && (
        <div className="mt-1 text-[10px] italic text-muted-foreground/60">{ACTIVITY_HINTS[label]}</div>
      )}
    </div>
  );
}
