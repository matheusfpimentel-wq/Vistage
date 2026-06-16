import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/format";
import { currentQuarter, listOkrs, okrProgress, quarterRange } from "@/modules/objetivos/api";
import { parsePrepState, PREP_GROUPS } from "@/modules/gigs/prep";

export type WeekStats = {
  gigsThisWeek: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
  contentPublished: number;
  contentInProgress: number;
  partiesConfirmed: number;
  tracksActive: number;
  tracksStalled: number;
  avgGigRating: number | null;
  pendingDebriefs: number;
  // sinais críticos adicionais (item 13)
  hotIdeasStuck: number; // ideias quentes em "Embrião" há +15 dias
  stalledTracks: number;
  stalledParties: number;
  stalledContent: number;
  undatedParties: number; // festas sem data definida
  noUpcomingGigs: boolean;
  noTracksInProduction: boolean;
  unpreparedClasses: number; // aulas em <=48h sem subject
  superfasSemInteracao: number; // superfãs sem interação nos últimos 30 dias
  gigsUnprepared: number; // GIGs em <=72h com prep musical incompleta
  okrsLagging: number; // OKRs do quarter atual com progresso < 20% e <30 dias p/ fechar
  gigsUnpaidAfter48h: number; // GIGs concluídas há +48h com pagamento pendente
  tracksStandbyOverdue: { id: number; title: string }[]; // tracks com standby_until vencido
};

function weekRange(): { start: string; end: string } {
  const today = new Date(todayISO());
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

type CountRow = { c: number };
type TrackRow = { standby: number; stage_entered_at: string | null };
type RatingRow = { rating_charisma: number | null; rating_technique: number | null; rating_repertoire: number | null };

// Roda um SELECT isolado: se a query falhar (ex.: coluna ausente em banco
// antigo), devolve o fallback ao invés de derrubar todo o painel de alertas.
async function safeSelect<T>(
  fn: () => Promise<T[]>,
  fallback: T[]
): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// Vários componentes (sino, barra mobile, tela de Alertas, notificador) chamam
// loadWeekStats nos mesmos gatilhos (DATA_CHANGED/focus). Um cache curtíssimo
// faz essas chamadas concorrentes compartilharem uma única consulta.
let weekStatsCache: { at: number; promise: Promise<WeekStats> } | null = null;
const WEEK_STATS_TTL = 1500;

export function loadWeekStats(): Promise<WeekStats> {
  const now = Date.now();
  if (weekStatsCache && now - weekStatsCache.at < WEEK_STATS_TTL) {
    return weekStatsCache.promise;
  }
  const promise = computeWeekStats().catch((e) => {
    weekStatsCache = null;
    throw e;
  });
  weekStatsCache = { at: now, promise };
  return promise;
}

async function computeWeekStats(): Promise<WeekStats> {
  const { start, end } = weekRange();
  const today = todayISO();
  const db = getDb();

  // limite de 15 dias atrás (sinais de estagnação)
  const d15 = new Date(today);
  d15.setDate(d15.getDate() - 15);
  const cut15 = d15.toISOString().slice(0, 10);

  const [
    gigsRows,
    tasksCompletedRows,
    tasksPendingRows,
    tasksOverdueRows,
    contentPublishedRows,
    contentInProgressRows,
    partiesRows,
    tracksRows,
    debriefRows,
    gigRatingRows,
    hotIdeasRows,
    stalledTracksRows,
    stalledPartiesRows,
    stalledContentRows,
    undatedPartiesRows,
    upcomingGigsRows,
    tracksInProductionRows,
    unpreparedClassesRows,
    superfasRows,
    upcomingGigsPrepRows,
    gigsUnpaidRows,
    standbyOverdueRows,
  ] = await Promise.all([
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM gigs WHERE date >= $1 AND date <= $2 AND status != 'Cancelada'`,
      [start, end]
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM tasks WHERE status = 'Concluída' AND updated_at >= $1`,
      [start]
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('Concluída','Cancelada')`,
      []
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('Concluída','Cancelada') AND due_date IS NOT NULL AND due_date != '' AND due_date < $1`,
      [today]
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM content WHERE status = 'Publicado' AND publish_date >= $1 AND publish_date <= $2`,
      [start, end]
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM content WHERE status IN ('Roteiro','Gravando','Edição','Pronto')`,
      []
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM parties WHERE status = 'Confirmada' AND date >= $1`,
      [today]
    ), []),
    safeSelect<TrackRow>(() => db.select(
      `SELECT standby, stage_entered_at FROM tracks`,
      []
    ), []),
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM gigs WHERE debrief_pending = 1`,
      []
    ), []),
    safeSelect<RatingRow>(() => db.select(
      `SELECT rating_charisma, rating_technique, rating_repertoire FROM gigs WHERE date >= $1 AND date <= $2 AND status = 'Concluída'`,
      [start, end]
    ), []),
    // ideias quentes (heat 3) presas em Embrião há +15 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM ideas
        WHERE heat = 3 AND maturation = 'Embrião' AND substr(updated_at, 1, 10) < $1`,
      [cut15]
    ), []),
    // tracks ativas sem mudança de stage há +15 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM tracks
        WHERE standby = 0 AND stage_entered_at IS NOT NULL
          AND substr(stage_entered_at, 1, 10) < $1`,
      [cut15]
    ), []),
    // festas em aberto sem movimento há +15 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM parties
        WHERE status NOT IN ('Realizada','Cancelada') AND substr(updated_at, 1, 10) < $1`,
      [cut15]
    ), []),
    // conteúdos em produção sem movimento há +15 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM content
        WHERE status NOT IN ('Publicado','Arquivado') AND substr(updated_at, 1, 10) < $1`,
      [cut15]
    ), []),
    // festas sem data (entram no pipeline criativo)
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM parties
        WHERE (date IS NULL OR date = '') AND status NOT IN ('Realizada','Cancelada')`,
      []
    ), []),
    // GIGs marcadas ainda à frente (data futura, fora canceladas).
    // Fallback [{c:1}]: se a query falhar, NÃO disparar o alerta de ausência.
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM gigs
        WHERE date >= $1 AND status != 'Cancelada'`,
      [today]
    ), [{ c: 1 }]),
    // músicas ativas sendo produzidas (não em stand-by, ainda não no pós-lançamento)
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM tracks
        WHERE standby = 0 AND current_stage != 'Pós-lançamento'`,
      []
    ), [{ c: 1 }]),
    // aulas em <= 48h sem matéria preenchida (subject vazio/nulo), status Agendada
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM classes
        WHERE status = 'Agendada'
          AND (subject IS NULL OR subject = '')
          AND date >= $1 AND date <= $2`,
      [today, (() => { const d = new Date(today); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })()]
    ), []),
    // superfãs (level = 'Superfã') sem interação nos últimos 30 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM fans
        WHERE level = 'Superfã'
          AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
      [(() => { const d = new Date(today); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })()]
    ), []),
    // GIGs nos próximos 72h (para verificar prep musical em JS)
    safeSelect<{ id: number; prep_state: string | null }>(() => db.select(
      `SELECT id, prep_state FROM gigs
        WHERE date >= $1 AND date <= $2 AND status != 'Cancelada'`,
      [today, (() => { const d = new Date(today); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })()]
    ), []),
    // GIGs concluídas há +48h com pagamento ainda não integral
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM gigs
        WHERE status = 'Concluída'
          AND date < $1
          AND (payment_status IS NULL OR payment_status != 'Pago integralmente')
          AND cache_amount IS NOT NULL AND cache_amount > 0`,
      [(() => { const d = new Date(today); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); })()]
    ), []),
    // tracks em standby com data de retorno já vencida
    safeSelect<{ id: number; title: string }>(() => db.select(
      `SELECT id, title_working as title FROM tracks
        WHERE standby = 1 AND standby_until IS NOT NULL AND standby_until <= $1`,
      [today]
    ), []),
  ]);

  // GIGs com prep musical incompleta
  const musicalGroup = PREP_GROUPS.find((g) => g.id === "musical");
  const musicalItems = musicalGroup?.items ?? [];
  const gigsUnprepared = (upcomingGigsPrepRows as { prep_state: string | null }[]).filter((g) => {
    const state = parsePrepState(g.prep_state);
    return musicalItems.some((item) => state[item.id] !== 1);
  }).length;

  // OKRs do quarter atual com progresso < 20% e faltando menos de 30 dias
  let okrsLagging = 0;
  try {
    const qtr = currentQuarter();
    const [, qEnd] = quarterRange(qtr);
    const daysLeft = Math.round((new Date(qEnd).getTime() - new Date(today).getTime()) / 86_400_000);
    if (daysLeft < 30) {
      const okrs = await listOkrs();
      okrsLagging = okrs.filter((o) => o.quarter === qtr && okrProgress(o) < 0.2).length;
    }
  } catch {
    // não interrompe
  }

  const tracksActive = tracksRows.filter((t: TrackRow) => !t.standby).length;
  const tracksStalled = tracksRows.filter((t: TrackRow) => {
    if (t.standby || !t.stage_entered_at) return false;
    const entered = new Date(t.stage_entered_at);
    const now = new Date();
    return (now.getTime() - entered.getTime()) / 86400000 > 30;
  }).length;

  const ratings = gigRatingRows
    .map((g: RatingRow) => {
      const vals = [g.rating_charisma, g.rating_technique, g.rating_repertoire].filter(
        (v): v is number => v !== null
      );
      return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
    })
    .filter((r): r is number => r !== null);
  const avgGigRating =
    ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;

  return {
    gigsThisWeek: gigsRows[0]?.c ?? 0,
    tasksCompleted: tasksCompletedRows[0]?.c ?? 0,
    tasksPending: tasksPendingRows[0]?.c ?? 0,
    tasksOverdue: tasksOverdueRows[0]?.c ?? 0,
    contentPublished: contentPublishedRows[0]?.c ?? 0,
    contentInProgress: contentInProgressRows[0]?.c ?? 0,
    partiesConfirmed: partiesRows[0]?.c ?? 0,
    tracksActive,
    tracksStalled,
    avgGigRating,
    pendingDebriefs: debriefRows[0]?.c ?? 0,
    hotIdeasStuck: hotIdeasRows[0]?.c ?? 0,
    stalledTracks: stalledTracksRows[0]?.c ?? 0,
    stalledParties: stalledPartiesRows[0]?.c ?? 0,
    stalledContent: stalledContentRows[0]?.c ?? 0,
    undatedParties: undatedPartiesRows[0]?.c ?? 0,
    noUpcomingGigs: (upcomingGigsRows[0]?.c ?? 0) === 0,
    noTracksInProduction: (tracksInProductionRows[0]?.c ?? 0) === 0,
    unpreparedClasses: unpreparedClassesRows[0]?.c ?? 0,
    superfasSemInteracao: superfasRows[0]?.c ?? 0,
    gigsUnprepared,
    okrsLagging,
    gigsUnpaidAfter48h: gigsUnpaidRows[0]?.c ?? 0,
    tracksStandbyOverdue: standbyOverdueRows as { id: number; title: string }[],
  };
}

