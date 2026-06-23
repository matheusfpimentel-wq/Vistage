import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Calendar,
  FileDown,
  GraduationCap,
  Lightbulb,
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
import { getDb } from "@/lib/db";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Período selecionado, já resolvido em prefixo de data ("", "YYYY" ou "YYYY-MM"). */
type Period = {
  prefix: string;
  label: string;
  slug: string;
  year: number | "all";
};

type WrappedData = {
  periodLabel: string;
  periodSlug: string;
  totalGigs: number;
  totalRevenue: number;
  avgCache: number;
  topCity: string | null;
  topCityCount: number;
  topContractor: string | null;
  topContractorCount: number;
  topContractorRevenue: number;
  topMonth: string | null;
  topMonthCount: number;
  avgRating: number | null;
  newFans: number;
  focusSessionCount: number;
  focusHours: number;
  uniqueCities: number;
  bestGig: { name: string; date: string; cache: number } | null;
  gigsByStatus: Record<string, number>;
  newTracks: number;
  // Ensino (aulas)
  aulasGiven: number;
  teachingRevenue: number;
  activeStudents: number;
  // Mais módulos
  partiesRealized: number;
  contentPublished: number;
  ideasCaptured: number;
  highlights: { title: string; date: string }[];
};

async function loadWrapped(period: Period): Promise<WrappedData> {
  const db = getDb();
  // O prefixo casa qualquer granularidade: "" (tudo), "YYYY" (ano), "YYYY-MM" (mês).
  const like = `${period.prefix}%`;

  const [
    gigRows,
    revenueRows,
    cityRows,
    contractorRows,
    monthRows,
    ratingRows,
    fanRows,
    focusRows,
    trackRows,
    bestGigRows,
    statusRows,
  ] = await Promise.all([
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM gigs WHERE date LIKE $1 AND status != 'Cancelada'`,
      [like]
    ),
    db.select<{ total: number; avg: number }[]>(
      `SELECT SUM(cache_amount) as total, AVG(cache_amount) as avg FROM gigs
       WHERE date LIKE $1 AND status = 'Concluída' AND cache_amount IS NOT NULL`,
      [like]
    ),
    db.select<{ city: string; n: number }[]>(
      `SELECT venue_city as city, COUNT(*) as n FROM gigs
       WHERE date LIKE $1 AND venue_city IS NOT NULL AND status != 'Cancelada'
       GROUP BY venue_city ORDER BY n DESC LIMIT 1`,
      [like]
    ),
    db.select<{ name: string; revenue: number; n: number }[]>(
      `SELECT c.name, SUM(g.cache_amount) as revenue, COUNT(*) as n FROM gigs g
       JOIN contacts c ON g.promoter_contact_id = c.id
       WHERE g.date LIKE $1 AND g.status = 'Concluída' AND g.cache_amount IS NOT NULL
       GROUP BY c.id ORDER BY revenue DESC LIMIT 1`,
      [like]
    ),
    db.select<{ month: string; n: number }[]>(
      `SELECT strftime('%m', date) as month, COUNT(*) as n FROM gigs
       WHERE date LIKE $1 AND status != 'Cancelada'
       GROUP BY month ORDER BY n DESC LIMIT 1`,
      [like]
    ),
    db.select<{ avg: number }[]>(
      `SELECT AVG(rating_contractor) as avg FROM gigs
       WHERE date LIKE $1 AND rating_contractor IS NOT NULL`,
      [like]
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM fans WHERE created_at LIKE $1`,
      [like]
    ),
    db.select<{ n: number; minutes: number }[]>(
      `SELECT COUNT(*) as n, SUM((strftime('%s', ended_at) - strftime('%s', started_at))/60) as minutes
       FROM work_sessions WHERE started_at LIKE $1 AND ended_at IS NOT NULL`,
      [like]
    ),
    db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM tracks WHERE created_at LIKE $1`,
      [like]
    ),
    db.select<{ event_name: string | null; venue_name: string; date: string; cache_amount: number }[]>(
      `SELECT event_name, venue_name, date, cache_amount FROM gigs
       WHERE date LIKE $1 AND status = 'Concluída' AND cache_amount IS NOT NULL
       ORDER BY cache_amount DESC LIMIT 1`,
      [like]
    ),
    db.select<{ status: string; n: number }[]>(
      `SELECT status, COUNT(*) as n FROM gigs WHERE date LIKE $1 GROUP BY status`,
      [like]
    ),
  ]);

  const uniqueCitiesRow = await db.select<{ n: number }[]>(
    `SELECT COUNT(DISTINCT venue_city) as n FROM gigs WHERE date LIKE $1 AND venue_city IS NOT NULL AND status != 'Cancelada'`,
    [like]
  );

  // ── Ensino (aulas) ──────────────────────────────────────────────────────
  const classRows = await db.select<{ n: number; revenue: number; students: number }[]>(
    `SELECT COUNT(*) as n, COALESCE(SUM(amount), 0) as revenue, COUNT(DISTINCT student_id) as students
       FROM classes WHERE date LIKE $1 AND status != 'Cancelada'`,
    [like]
  ).catch(() => [] as { n: number; revenue: number; students: number }[]);

  // ── Mais módulos (festas, conteúdo, ideias) ─────────────────────────────
  const partyRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM parties WHERE date LIKE $1 AND status != 'Cancelada'`,
    [like]
  ).catch(() => [] as { n: number }[]);
  const contentRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM content WHERE COALESCE(published_at, publish_date) LIKE $1`,
    [like]
  ).catch(() => [] as { n: number }[]);
  const ideaRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM ideas WHERE created_at LIKE $1`,
    [like]
  ).catch(() => [] as { n: number }[]);

  const highlightRows = await db.select<{ title: string; date: string }[]>(
    `SELECT title, date FROM highlights WHERE date LIKE $1 ORDER BY date`,
    [like]
  ).catch(() => [] as { title: string; date: string }[]);

  const bestGigRow = bestGigRows[0];
  const gigsByStatus: Record<string, number> = {};
  for (const r of statusRows) gigsByStatus[r.status] = r.n;

  return {
    periodLabel: period.label,
    periodSlug: period.slug,
    totalGigs: gigRows[0]?.n ?? 0,
    totalRevenue: revenueRows[0]?.total ?? 0,
    avgCache: revenueRows[0]?.avg ?? 0,
    topCity: cityRows[0]?.city ?? null,
    topCityCount: cityRows[0]?.n ?? 0,
    topContractor: contractorRows[0]?.name ?? null,
    topContractorCount: contractorRows[0]?.n ?? 0,
    topContractorRevenue: contractorRows[0]?.revenue ?? 0,
    topMonth: monthRows[0]?.month ? MONTH_NAMES[Number(monthRows[0].month) - 1] ?? null : null,
    topMonthCount: monthRows[0]?.n ?? 0,
    avgRating: ratingRows[0]?.avg ?? null,
    newFans: fanRows[0]?.n ?? 0,
    focusSessionCount: focusRows[0]?.n ?? 0,
    focusHours: Math.round((focusRows[0]?.minutes ?? 0) / 60),
    uniqueCities: uniqueCitiesRow[0]?.n ?? 0,
    bestGig: bestGigRow ? {
      name: bestGigRow.event_name || bestGigRow.venue_name,
      date: bestGigRow.date,
      cache: bestGigRow.cache_amount,
    } : null,
    gigsByStatus,
    newTracks: trackRows[0]?.n ?? 0,
    aulasGiven: classRows[0]?.n ?? 0,
    teachingRevenue: classRows[0]?.revenue ?? 0,
    activeStudents: classRows[0]?.students ?? 0,
    partiesRealized: partyRows[0]?.n ?? 0,
    contentPublished: contentRows[0]?.n ?? 0,
    ideasCaptured: ideaRows[0]?.n ?? 0,
    highlights: highlightRows,
  };
}

async function exportWrappedPdf(data: WrappedData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 48, cr = W - mx;
  let y = 64;

  const h1 = (t: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(20);
    doc.text(t, mx, y); y += 30;
  };
  const h2 = (t: string) => {
    if (y + 24 > H - 48) { doc.addPage(); y = 64; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(30);
    doc.text(t, mx, y); y += 20;
  };
  const kv = (label: string, value: string) => {
    if (y + 18 > H - 48) { doc.addPage(); y = 64; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(60);
    doc.text(label, mx, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(20);
    doc.text(value, cr, y, { align: "right" });
    y += 17;
  };

  h1(`Carreira em Números — ${data.periodLabel}`);
  doc.setDrawColor(200); doc.line(mx, y, cr, y); y += 20;

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

  if (data.highlights.length > 0) {
    y += 10;
    h2("Destaques"); y -= 4;
    for (const h of data.highlights) {
      if (y + 16 > H - 48) { doc.addPage(); y = 64; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(60);
      doc.text(`• ${h.title}`, mx, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(120);
      doc.text(h.date, cr, y, { align: "right" });
      y += 16;
    }
  }

  doc.save(`carreira-${data.periodSlug}.pdf`);
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
    data.focusSessionCount === 0;

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
