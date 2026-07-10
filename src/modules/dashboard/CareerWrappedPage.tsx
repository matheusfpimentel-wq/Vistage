import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Calendar,
  CheckCircle2,
  FileDown,
  GraduationCap,
  Lightbulb,
  ListPlus,
  Loader2,
  MapPin,
  Megaphone,
  Mic2,
  Music2,
  PartyPopper,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toaster";
import { formatCurrency, formatDate } from "@/lib/format";
import { MONTH_NAMES, loadWrapped, type Period, type WrappedData } from "./careerWrapped";

async function exportWrappedPdf(data: WrappedData): Promise<void> {
  const kit = await import("@/lib/pdfKit");
  const { savePdfDoc } = await import("@/lib/savePdf");
  const doc = await kit.createPdf();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = kit.PDF_MARGIN, cr = W - mx;
  const accent = kit.accentRgb();

  let y = kit.pdfHeader(doc, { kicker: "Carreira em números", title: data.periodLabel, accent });

  const h2 = (t: string) => {
    if (y + 30 > H - kit.PDF_BOTTOM) { doc.addPage(); y = 64; }
    y = kit.pdfSection(doc, y, t, accent);
  };
  const kv = (label: string, value: string) => {
    if (y + 18 > H - kit.PDF_BOTTOM) { doc.addPage(); y = 64; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(...kit.SOFT);
    doc.text(label, mx, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(...kit.INK);
    doc.text(value, cr, y, { align: "right" });
    y += 17;
  };

  if (data.totalGigs > 0) {
    h2("GIGs"); y -= 4;
    kv("Total de shows", String(data.totalGigs));
    kv("Cidades diferentes", String(data.uniqueCities));
    if (data.topCity) kv("Cidade mais visitada", `${data.topCity} (${data.topCityCount}×)`);
    if (data.topMonth) kv("Mês mais agitado", `${data.topMonth} (${data.topMonthCount} shows)`);
    if (data.avgRating != null) kv("Nota média dos contratantes", data.avgRating.toFixed(1) + " / 5");
    y += 10;
  }

  if (data.totalRevenue > 0) {
    h2("Financeiro"); y -= 4;
    kv("Receita total (concluídas)", formatCurrency(data.totalRevenue));
    kv("Cachê médio", formatCurrency(data.avgCache));
    if (data.bestGig) kv(`Maior cachê (${formatDate(data.bestGig.date)})`, formatCurrency(data.bestGig.cache));
    y += 10;
  }

  if (data.aulasGiven > 0) {
    h2("Ensino"); y -= 4;
    kv("Aulas no período", String(data.aulasGiven));
    kv("Alunos atendidos", String(data.activeStudents));
    if (data.teachingRevenue > 0) kv("Receita com aulas", formatCurrency(data.teachingRevenue));
    y += 10;
  }

  if (data.topContractor || data.newFans > 0) {
    h2("Relacionamentos"); y -= 4;
    if (data.topContractor) kv("Contratante do período", `${data.topContractor} — ${formatCurrency(data.topContractorRevenue)}`);
    kv("Novos fãs cadastrados", String(data.newFans));
    y += 10;
  }

  if (data.partiesRealized > 0 || data.contentPublished > 0 || data.ideasCaptured > 0) {
    h2("Eventos & Conteúdo"); y -= 4;
    if (data.partiesRealized > 0) kv("Festas realizadas", String(data.partiesRealized));
    if (data.contentPublished > 0) kv("Conteúdos publicados", String(data.contentPublished));
    if (data.ideasCaptured > 0) kv("Ideias capturadas", String(data.ideasCaptured));
    y += 10;
  }

  if (data.newTracks > 0 || data.focusSessionCount > 0) {
    h2("Produção & Foco"); y -= 4;
    kv("Novas músicas iniciadas", String(data.newTracks));
    kv("Sessões de foco", String(data.focusSessionCount));
    kv("Horas em foco", `${data.focusHours}h`);
  }

  if (data.tasksCompleted > 0 || data.tasksCreated > 0) {
    h2("Tarefas"); y -= 4;
    if (data.tasksCompleted > 0) kv("Tarefas concluídas", String(data.tasksCompleted));
    if (data.tasksCreated > 0) kv("Tarefas novas", String(data.tasksCreated));
    y += 10;
  }

  if (data.highlights.length > 0) {
    y += 10;
    h2("Destaques"); y -= 4;
    for (const h of data.highlights) {
      if (y + 16 > H - kit.PDF_BOTTOM) { doc.addPage(); y = 64; }
      kit.drawBullet(doc, mx + 3, y, accent);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(55, 65, 81);
      doc.text(h.title, mx + 14, y);
      doc.setTextColor(...kit.FAINT);
      doc.text(h.date, cr, y, { align: "right" });
      y += 16;
    }
  }

  kit.pdfFooter(doc);
  await savePdfDoc(doc, `carreira-${data.periodSlug}`);
}

function StatTile({ icon, label, value, sub, accent = false }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-md p-1.5 ${accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold tabular-nums leading-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {icon} {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function CareerWrappedPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number | "all">(currentYear);
  const [month, setMonth] = useState<number | "all">("all");
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const period = useMemo<Period>(() => {
    if (year === "all") return { prefix: "", label: "Todos os anos", slug: "todos", year };
    if (month === "all") return { prefix: String(year), label: String(year), slug: String(year), year };
    const mm = String(month).padStart(2, "0");
    return {
      prefix: `${year}-${mm}`,
      label: `${MONTH_NAMES[month - 1]} de ${year}`,
      slug: `${year}-${mm}`,
      year,
    };
  }, [year, month]);

  useEffect(() => {
    setLoading(true);
    void loadWrapped(period)
      .then(setData)
      .catch((e) => toast.error(`Erro ao carregar os números: ${String(e)}`))
      .finally(() => setLoading(false));
  }, [period]);

  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  function onYearChange(v: string) {
    if (v === "all") {
      setYear("all");
      setMonth("all"); // mês não faz sentido sem ano
    } else {
      setYear(Number(v));
    }
  }

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      await exportWrappedPdf(data);
      toast.success("Relatório exportado em PDF");
    } catch {
      toast.error("Erro ao exportar PDF");
    } finally {
      setExporting(false);
    }
  }

  const isEmpty = !!data &&
    data.totalGigs === 0 &&
    data.aulasGiven === 0 &&
    data.partiesRealized === 0 &&
    data.newTracks === 0 &&
    data.contentPublished === 0 &&
    data.ideasCaptured === 0 &&
    data.newFans === 0 &&
    data.focusSessionCount === 0 &&
    data.tasksCompleted === 0 &&
    data.tasksCreated === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Carreira em Números</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={onYearChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {year !== "all" && (
            <Select value={String(month)} onValueChange={(v) => setMonth(v === "all" ? "all" : Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ano todo</SelectItem>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => void handleExport()} disabled={!data || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : !data || isEmpty ? (
        <div className="rounded-md border border-dashed p-16 text-center text-sm text-muted-foreground">
          <Award className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {`Nada registrado em ${data?.periodLabel ?? period.label}.`}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Headline (só quando há shows) */}
          {data.totalGigs > 0 && (
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/0">
              <CardContent className="py-6">
                <div className="text-center space-y-1">
                  <div className="text-5xl font-extrabold tabular-nums text-primary">{data.totalGigs}</div>
                  <div className="text-sm text-muted-foreground">
                    {data.periodLabel === "Todos os anos" ? "shows no total" : `shows · ${data.periodLabel}`}
                  </div>
                  {data.uniqueCities > 0 && (
                    <div className="text-xs text-muted-foreground">em {data.uniqueCities} cidade{data.uniqueCities !== 1 ? "s" : ""} diferentes</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shows */}
          {data.totalGigs > 0 && (
            <Section icon={<Mic2 className="h-4 w-4" />} title="Shows">
              {data.topCity && (
                <StatTile icon={<MapPin className="h-4 w-4" />} label="Cidade mais visitada" value={data.topCity} sub={`${data.topCityCount} show${data.topCityCount !== 1 ? "s" : ""}`} />
              )}
              {data.topMonth && (
                <StatTile icon={<Calendar className="h-4 w-4" />} label="Mês mais agitado" value={data.topMonth} sub={`${data.topMonthCount} show${data.topMonthCount !== 1 ? "s" : ""}`} />
              )}
              {data.avgRating != null && (
                <StatTile icon={<Star className="h-4 w-4" />} label="Nota média dos contratantes" value={data.avgRating.toFixed(1) + " / 5"} accent />
              )}
            </Section>
          )}

          {/* Status breakdown */}
          {Object.keys(data.gigsByStatus).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.gigsByStatus).map(([status, count]) => (
                <Badge key={status} variant="outline" className="gap-1 text-xs">
                  {status} <span className="font-bold">{count}</span>
                </Badge>
              ))}
            </div>
          )}

          {/* Financeiro */}
          {data.totalRevenue > 0 && (
            <Section icon={<TrendingUp className="h-4 w-4" />} title="Financeiro">
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Receita total (concluídas)" value={formatCurrency(data.totalRevenue)} accent />
              <StatTile icon={<Award className="h-4 w-4" />} label="Cachê médio" value={formatCurrency(data.avgCache)} />
              {data.bestGig && (
                <StatTile icon={<Star className="h-4 w-4" />} label="Maior cachê" value={formatCurrency(data.bestGig.cache)} sub={`${data.bestGig.name} · ${formatDate(data.bestGig.date)}`} />
              )}
            </Section>
          )}

          {/* Ensino (aulas) */}
          {data.aulasGiven > 0 && (
            <Section icon={<GraduationCap className="h-4 w-4" />} title="Ensino">
              <StatTile icon={<GraduationCap className="h-4 w-4" />} label="Aulas no período" value={data.aulasGiven} />
              <StatTile icon={<Users className="h-4 w-4" />} label="Alunos atendidos" value={data.activeStudents} />
              {data.teachingRevenue > 0 && (
                <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Receita com aulas" value={formatCurrency(data.teachingRevenue)} accent />
              )}
            </Section>
          )}

          {/* Relacionamento */}
          {(data.topContractor || data.newFans > 0) && (
            <Section icon={<Users className="h-4 w-4" />} title="Relacionamento">
              {data.topContractor && (
                <StatTile icon={<Users className="h-4 w-4" />} label="Contratante do período" value={data.topContractor} sub={formatCurrency(data.topContractorRevenue)} accent />
              )}
              {data.newFans > 0 && (
                <StatTile icon={<Users className="h-4 w-4" />} label="Novos fãs cadastrados" value={data.newFans} />
              )}
            </Section>
          )}

          {/* Eventos & Conteúdo */}
          {(data.partiesRealized > 0 || data.contentPublished > 0 || data.ideasCaptured > 0) && (
            <Section icon={<PartyPopper className="h-4 w-4" />} title="Eventos & Conteúdo">
              {data.partiesRealized > 0 && (
                <StatTile icon={<PartyPopper className="h-4 w-4" />} label="Festas realizadas" value={data.partiesRealized} />
              )}
              {data.contentPublished > 0 && (
                <StatTile icon={<Megaphone className="h-4 w-4" />} label="Conteúdos publicados" value={data.contentPublished} />
              )}
              {data.ideasCaptured > 0 && (
                <StatTile icon={<Lightbulb className="h-4 w-4" />} label="Ideias capturadas" value={data.ideasCaptured} />
              )}
            </Section>
          )}

          {/* Produção & Foco */}
          {(data.newTracks > 0 || data.focusSessionCount > 0) && (
            <Section icon={<Music2 className="h-4 w-4" />} title="Produção & Foco">
              <StatTile icon={<Music2 className="h-4 w-4" />} label="Novas músicas iniciadas" value={data.newTracks} />
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Sessões de foco" value={data.focusSessionCount} />
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Horas em foco" value={`${data.focusHours}h`} />
            </Section>
          )}

          {/* Tarefas */}
          {(data.tasksCompleted > 0 || data.tasksCreated > 0) && (
            <Section icon={<CheckCircle2 className="h-4 w-4" />} title="Tarefas">
              {data.tasksCompleted > 0 && (
                <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Tarefas concluídas" value={data.tasksCompleted} accent />
              )}
              {data.tasksCreated > 0 && (
                <StatTile icon={<ListPlus className="h-4 w-4" />} label="Tarefas novas" value={data.tasksCreated} />
              )}
            </Section>
          )}

          {/* Destaques / Highlights */}
          {data.highlights.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <Star className="h-4 w-4" /> Destaques
              </h2>
              <div className="space-y-1.5">
                {data.highlights.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <Star className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                    <span className="flex-1 font-medium">{h.title}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(h.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
