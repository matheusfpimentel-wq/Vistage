import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/format";

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
type TrackRow = { standby: number; stage_history: string | null };
type RatingRow = {
  rating_charisma: number | null;
  rating_technique: number | null;
  rating_repertoire: number | null;
};

/** Data em que a track entrou no stage atual, derivada do stage_history JSON. */
function stageEnteredFromHistory(historyJson: string | null): string | null {
  if (!historyJson) return null;
  try {
    const arr = JSON.parse(historyJson) as { entered_at?: string }[];
    return arr[arr.length - 1]?.entered_at ?? null;
  } catch {
    return null;
  }
}

export async function loadWeekStats(): Promise<WeekStats> {
  const { start, end } = weekRange();
  const today = todayISO();
  const db = getDb();

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
  ] = await Promise.all([
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM gigs WHERE date >= $1 AND date <= $2 AND status != 'Cancelada'`,
      [start, end]
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM tasks WHERE status = 'Concluída' AND updated_at >= $1`,
      [start]
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('Concluída','Cancelada')`,
      []
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('Concluída','Cancelada') AND due_date < $1 AND due_date IS NOT NULL`,
      [today]
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM content WHERE status = 'Publicado' AND publish_date >= $1 AND publish_date <= $2`,
      [start, end]
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM content WHERE status IN ('Roteiro','Gravando','Edição','Pronto')`,
      []
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM parties WHERE status = 'Confirmada' AND date >= $1`,
      [today]
    ),
    db.select<TrackRow[]>(
      `SELECT standby, stage_history FROM tracks`,
      []
    ),
    db.select<CountRow[]>(
      `SELECT COUNT(*) as c FROM gigs WHERE debrief_pending = 1`,
      []
    ),
    db.select<RatingRow[]>(
      `SELECT rating_charisma, rating_technique, rating_repertoire FROM gigs WHERE date >= $1 AND date <= $2 AND status = 'Concluída'`,
      [start, end]
    ),
  ]);

  const tracksActive = tracksRows.filter((t: TrackRow) => !t.standby).length;
  const tracksStalled = tracksRows.filter((t: TrackRow) => {
    if (t.standby) return false;
    const entered = stageEnteredFromHistory(t.stage_history);
    if (!entered) return false;
    return (Date.now() - new Date(entered).getTime()) / 86400000 > 30;
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
  };
}

export type FocusTask = {
  id: number;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
};

export async function loadFocusTasks(): Promise<FocusTask[]> {
  const today = todayISO();
  const db = getDb();
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in7iso = in7.toISOString().slice(0, 10);

  return db.select<FocusTask[]>(
    `SELECT id, title, due_date, priority, status
     FROM tasks
     WHERE status NOT IN ('Concluída','Cancelada')
       AND (
         priority IN ('Alta','Urgente')
         OR (due_date IS NOT NULL AND due_date <= $1)
       )
     ORDER BY
       CASE priority WHEN 'Urgente' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Média' THEN 2 ELSE 3 END,
       due_date ASC NULLS LAST
     LIMIT 10`,
    [in7iso]
  );
}
