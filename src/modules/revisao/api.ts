import { getDb } from "@/lib/db";
import { todayISO, toLocalISODate } from "@/lib/format";
import { currentQuarter, listOkrs, okrProgress, quarterRange, stageEnteredFromHistory } from "@/modules/objetivos/api";
import { parsePrepState, PREP_GROUPS } from "@/modules/gigs/prep";
import { getPackageHoursLeft, getPrepHours } from "./ruleConfig";

export type WeekStats = {
  gigsThisWeek: number;
  tasksCompleted: number;
  tasksPending: number;
  tasksOverdue: number;
  tasksOverdueIds: number[]; // 1ª = mais atrasada (abre direto pra concluir)
  contentPublished: number;
  contentInProgress: number;
  partiesConfirmed: number;
  tracksActive: number;
  tracksStalled: number;
  avgGigRating: number | null;
  pendingDebriefs: number;
  pendingDebriefIds: number[]; // 1ª = GIG concluída há mais tempo sem debrief
  // sinais críticos adicionais (item 13)
  hotIdeasStuck: number; // ideias quentes em "Embrião" há +15 dias
  hotIdeasStuckIds: number[]; // ids p/ link direto à ideia quando houver só uma
  stalledTracks: number;
  stalledParties: number;
  stalledContent: number;
  undatedParties: number; // festas sem data definida
  undatedPartyIds: number[];
  noUpcomingGigs: boolean;
  noTracksInProduction: boolean;
  unpreparedClasses: number; // aulas em <=48h sem subject
  unpreparedClassIds: number[]; // 1ª = aula mais próxima
  superfasSemInteracao: number; // superfãs sem interação nos últimos 30 dias
  gigsUnprepared: number; // GIGs em <=Xh com prep musical incompleta (X editável)
  gigsUnpreparedIds: number[]; // 1ª = GIG mais próxima
  okrsLagging: number; // OKRs do quarter atual com progresso < 20% e <30 dias p/ fechar
  okrsLaggingIds: number[];
  gigsUnpaidAfter48h: number; // GIGs concluídas há +48h com pagamento pendente
  gigsUnpaidIds: number[]; // ids p/ link direto à GIG quando houver só uma
  tracksStandbyOverdue: { id: number; title: string }[]; // tracks com standby_until vencido
  // Pacotes de aulas ativos quase no fim (≤2 aulas ou ≤2h restantes) — renovar/cobrar
  lowBalanceStudents: {
    packageId: number;
    studentId: number;
    studentName: string;
    remaining: number;
    unit: "aula" | "h";
  }[];
};

function weekRange(): { start: string; end: string } {
  // Parse LOCAL (T00:00:00) — new Date("YYYY-MM-DD") seria UTC e, no Brasil
  // (UTC-3), getDay()/getDate() cairiam no dia anterior → semana deslocada.
  const today = new Date(todayISO() + "T00:00:00");
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toLocalISODate(monday),
    end: toLocalISODate(sunday),
  };
}

type CountRow = { c: number };
type TrackRow = { standby: number; stage_history: string | null };
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
    activePackagesRows,
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
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM tasks WHERE status NOT IN ('Concluída','Cancelada') AND due_date IS NOT NULL AND due_date != '' AND due_date < $1 ORDER BY due_date ASC`,
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
      `SELECT standby, stage_history FROM tracks`,
      []
    ), []),
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM gigs WHERE debrief_pending = 1 ORDER BY date ASC`,
      []
    ), []),
    safeSelect<RatingRow>(() => db.select(
      `SELECT rating_charisma, rating_technique, rating_repertoire FROM gigs WHERE date >= $1 AND date <= $2 AND status = 'Concluída'`,
      [start, end]
    ), []),
    // ideias quentes (heat 3) presas em Embrião há +15 dias (com id p/ link direto)
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM ideas
        WHERE heat = 3 AND maturation = 'Embrião' AND substr(updated_at, 1, 10) < $1`,
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
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM parties
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
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM classes
        WHERE status = 'Agendada'
          AND (subject IS NULL OR subject = '')
          AND date >= $1 AND date <= $2
        ORDER BY date ASC`,
      [today, (() => { const d = new Date(today); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10); })()]
    ), []),
    // superfãs (level = 'Superfã') sem interação nos últimos 30 dias
    safeSelect<CountRow>(() => db.select(
      `SELECT COUNT(*) as c FROM fans
        WHERE level = 'Superfã'
          AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
      [(() => { const d = new Date(today); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })()]
    ), []),
    // GIGs nas próximas X horas (janela editável; default 72h) p/ checar prep musical
    safeSelect<{ id: number; prep_state: string | null }>(() => db.select(
      `SELECT id, prep_state FROM gigs
        WHERE date >= $1 AND date <= $2 AND status != 'Cancelada'
        ORDER BY date ASC`,
      [today, (() => { const d = new Date(today); d.setDate(d.getDate() + Math.ceil(getPrepHours() / 24)); return d.toISOString().slice(0, 10); })()]
    ), []),
    // GIGs concluídas com cachê pendente. Sem previsão de pagamento, usa a regra
    // das 48h (data já passou +2 dias). COM previsão (payment_due_date), ignora as
    // 48h e só alerta se a previsão já venceu — assim uma GIG com pagamento
    // agendado pra frente não vira alerta antes da hora.
    safeSelect<{ id: number }>(() => db.select(
      `SELECT id FROM gigs
        WHERE status = 'Concluída'
          AND (payment_status IS NULL OR payment_status != 'Pago integralmente')
          AND cache_amount IS NOT NULL AND cache_amount > 0
          AND (
            (payment_due_date IS NULL AND date < $1)
            OR (payment_due_date IS NOT NULL AND payment_due_date < $2)
          )`,
      [(() => { const d = new Date(today); d.setDate(d.getDate() - 2); return d.toISOString().slice(0, 10); })(), today]
    ), []),
    // tracks em standby com data de retorno já vencida
    safeSelect<{ id: number; title: string }>(() => db.select(
      `SELECT id, title_working as title FROM tracks
        WHERE standby = 1 AND standby_until IS NOT NULL AND standby_until <= $1`,
      [today]
    ), []),
    // pacotes de aulas ATIVOS (saldo calculado em JS — lida com pacote por aula
    // e por hora). Filtra "quase no fim" depois.
    safeSelect<{
      id: number; student_id: number; student_name: string;
      total_classes: number | null; used_classes: number | null;
      total_hours: number | null; used_minutes: number | null;
    }>(() => db.select(
      `SELECT sp.id, sp.student_id, s.name AS student_name,
              sp.total_classes, sp.used_classes, sp.total_hours, sp.used_minutes
         FROM student_packages sp
         JOIN students s ON s.id = sp.student_id
        WHERE sp.status = 'Ativo'`,
      []
    ), []),
  ]);

  // GIGs com prep musical incompleta
  const musicalGroup = PREP_GROUPS.find((g) => g.id === "musical");
  const musicalItems = musicalGroup?.items ?? [];
  const gigsUnpreparedRows = (upcomingGigsPrepRows as { id: number; prep_state: string | null }[]).filter((g) => {
    const state = parsePrepState(g.prep_state);
    return musicalItems.some((item) => state[item.id] !== 1);
  });
  const gigsUnprepared = gigsUnpreparedRows.length;
  const gigsUnpreparedIds = gigsUnpreparedRows.map((g) => g.id);

  // OKRs do quarter atual com progresso < 20% e faltando menos de 30 dias
  let okrsLagging = 0;
  let okrsLaggingIds: number[] = [];
  try {
    const qtr = currentQuarter();
    const [, qEnd] = quarterRange(qtr);
    const daysLeft = Math.round((new Date(qEnd).getTime() - new Date(today).getTime()) / 86_400_000);
    if (daysLeft < 30) {
      const okrs = await listOkrs();
      const lagging = okrs.filter((o) => o.quarter === qtr && okrProgress(o) < 0.2);
      okrsLagging = lagging.length;
      okrsLaggingIds = lagging.map((o) => o.id);
    }
  } catch {
    // não interrompe
  }

  const nowMs = Date.now();
  // dias desde que a track entrou no stage atual (derivado do stage_history JSON)
  const daysInStage = (t: TrackRow): number | null => {
    const entered = stageEnteredFromHistory(t.stage_history);
    return entered ? (nowMs - new Date(entered).getTime()) / 86_400_000 : null;
  };
  const tracksActive = tracksRows.filter((t: TrackRow) => !t.standby).length;
  const tracksStalled = tracksRows.filter((t: TrackRow) => {
    if (t.standby) return false;
    const d = daysInStage(t);
    return d !== null && d > 30;
  }).length;
  // tracks ativas sem mudança de stage há +15 dias (antes: query SQL c/ coluna inexistente)
  const stalledTracks = tracksRows.filter((t: TrackRow) => {
    if (t.standby) return false;
    const d = daysInStage(t);
    return d !== null && d > 15;
  }).length;

  // Saldo de pacotes de aulas: "quase no fim" = ≤2 aulas (pacote por aula) ou
  // ≤2h (pacote por hora). Pacote zerado já vira "Concluído" no recalc, então
  // aqui pegamos a janela de aviso (>0).
  type PkgRow = {
    id: number; student_id: number; student_name: string;
    total_classes: number | null; used_classes: number | null;
    total_hours: number | null; used_minutes: number | null;
  };
  const lowBalanceStudents: WeekStats["lowBalanceStudents"] = (
    activePackagesRows as PkgRow[]
  ).flatMap((p): WeekStats["lowBalanceStudents"] => {
    const hourBased = p.total_hours != null && p.total_hours > 0;
    if (hourBased) {
      const remMin = Math.round(p.total_hours! * 60 - (p.used_minutes ?? 0));
      if (remMin > 0 && remMin <= getPackageHoursLeft() * 60) {
        return [{
          packageId: p.id, studentId: p.student_id, studentName: p.student_name,
          remaining: Math.round(remMin / 6) / 10, unit: "h" as const,
        }];
      }
      return [];
    }
    const rem = (p.total_classes ?? 0) - (p.used_classes ?? 0);
    if (rem > 0 && rem <= 2) {
      return [{
        packageId: p.id, studentId: p.student_id, studentName: p.student_name,
        remaining: rem, unit: "aula" as const,
      }];
    }
    return [];
  });

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
    tasksOverdue: (tasksOverdueRows as { id: number }[]).length,
    tasksOverdueIds: (tasksOverdueRows as { id: number }[]).map((r) => r.id),
    contentPublished: contentPublishedRows[0]?.c ?? 0,
    contentInProgress: contentInProgressRows[0]?.c ?? 0,
    partiesConfirmed: partiesRows[0]?.c ?? 0,
    tracksActive,
    tracksStalled,
    avgGigRating,
    pendingDebriefs: (debriefRows as { id: number }[]).length,
    pendingDebriefIds: (debriefRows as { id: number }[]).map((r) => r.id),
    hotIdeasStuck: (hotIdeasRows as { id: number }[]).length,
    hotIdeasStuckIds: (hotIdeasRows as { id: number }[]).map((r) => r.id),
    stalledTracks,
    stalledParties: stalledPartiesRows[0]?.c ?? 0,
    stalledContent: stalledContentRows[0]?.c ?? 0,
    undatedParties: (undatedPartiesRows as { id: number }[]).length,
    undatedPartyIds: (undatedPartiesRows as { id: number }[]).map((r) => r.id),
    noUpcomingGigs: (upcomingGigsRows[0]?.c ?? 0) === 0,
    noTracksInProduction: (tracksInProductionRows[0]?.c ?? 0) === 0,
    unpreparedClasses: (unpreparedClassesRows as { id: number }[]).length,
    unpreparedClassIds: (unpreparedClassesRows as { id: number }[]).map((r) => r.id),
    superfasSemInteracao: superfasRows[0]?.c ?? 0,
    gigsUnprepared,
    gigsUnpreparedIds,
    okrsLagging,
    okrsLaggingIds,
    gigsUnpaidAfter48h: (gigsUnpaidRows as { id: number }[]).length,
    gigsUnpaidIds: (gigsUnpaidRows as { id: number }[]).map((r) => r.id),
    tracksStandbyOverdue: standbyOverdueRows as { id: number; title: string }[],
    lowBalanceStudents,
  };
}

