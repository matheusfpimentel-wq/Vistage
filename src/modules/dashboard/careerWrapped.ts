import { getDb } from "@/lib/db";

// "Carreira em números" — agregados de toda a jornada (GIGs, ensino, festas,
// conteúdo, produção, foco…) por período. Extraído da página pra também
// alimentar o espelho do celular (career_stats) com os MESMOS números.

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Período selecionado, já resolvido em prefixo de data ("", "YYYY" ou "YYYY-MM"). */
export type Period = {
  prefix: string;
  label: string;
  slug: string;
  year: number | "all";
};

export type WrappedData = {
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
  tasksCompleted: number;
  tasksCreated: number;
  highlights: { title: string; date: string }[];
};

export async function loadWrapped(period: Period): Promise<WrappedData> {
  const db = getDb();
  // O prefixo casa qualquer granularidade: "" (tudo), "YYYY" (ano), "YYYY-MM" (mês).
  const like = `${period.prefix}%`;
  // "Mês mais agitado" não faz sentido quando o próprio filtro já é um mês.
  const monthLevel = /^\d{4}-\d{2}$/.test(period.prefix);

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
    `SELECT COUNT(*) as n FROM parties WHERE date LIKE $1 AND status = 'Realizada'`,
    [like]
  ).catch(() => [] as { n: number }[]);
  const contentRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM content WHERE status = 'Publicado' AND COALESCE(published_at, publish_date) LIKE $1`,
    [like]
  ).catch(() => [] as { n: number }[]);
  const ideaRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM ideas WHERE created_at LIKE $1`,
    [like]
  ).catch(() => [] as { n: number }[]);
  // Tarefas: concluídas no período (proxy = updated_at, pois não há completed_at)
  // e novas (created_at). Mesmo padrão de "created_at LIKE" dos outros módulos.
  const tasksDoneRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM tasks WHERE status = 'Concluída' AND updated_at LIKE $1`,
    [like]
  ).catch(() => [] as { n: number }[]);
  const tasksNewRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM tasks WHERE created_at LIKE $1`,
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
    topMonth: monthLevel ? null : (monthRows[0]?.month ? MONTH_NAMES[Number(monthRows[0].month) - 1] ?? null : null),
    topMonthCount: monthLevel ? 0 : (monthRows[0]?.n ?? 0),
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
    tasksCompleted: tasksDoneRows[0]?.n ?? 0,
    tasksCreated: tasksNewRows[0]?.n ?? 0,
    highlights: highlightRows,
  };
}
