import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";

export const ACTIVITY_TYPES = [
  "Criação musical",
  "Gestão",
  "Criação de conteúdo",
  "Aulas",
  "Comunicação",
  "Produção de festa",
  "Estudo",
  "Tempo de palco",
  "Treino",
  "Outro",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type WorkSession = {
  id: number;
  started_at: string;
  ended_at: string | null;
  activity_type: ActivityType;
  energy_level: number | null;
  focus_level: number | null;
  notes: string | null;
  context: string | null;
  context_type: string | null;
  context_id: number | null;
  created_at: string;
};

export async function startSession(activity_type: ActivityType): Promise<number> {
  const db = getDb();
  const started_at = new Date().toISOString();
  const res = await db.execute(
    `INSERT INTO work_sessions (started_at, activity_type) VALUES ($1, $2)`,
    [started_at, activity_type]
  );
  emitDataChanged();
  return res.lastInsertId as number;
}

export async function endSession(
  id: number,
  energy_level: number,
  focus_level: number,
  notes: string | null,
  context: string | null = null,
  context_type: string | null = null,
  context_id: number | null = null
): Promise<void> {
  const db = getDb();
  const ended_at = new Date().toISOString();
  await db.execute(
    `UPDATE work_sessions SET ended_at=$1, energy_level=$2, focus_level=$3, notes=$4, context=$5, context_type=$6, context_id=$7 WHERE id=$8`,
    [ended_at, energy_level, focus_level, notes, context, context_type, context_id, id]
  );
  emitDataChanged();
}

/** Encerra a sessão sem pedir energia/foco — usado pelo Modo Palco ao fechar a janela. */
export async function endSessionSilently(id: number): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE work_sessions SET ended_at = $1 WHERE id = $2 AND ended_at IS NULL`,
    [new Date().toISOString(), id]
  );
  emitDataChanged();
}

export async function getActiveSession(): Promise<WorkSession | null> {
  const db = getDb();
  const rows = await db.select<WorkSession[]>(
    `SELECT * FROM work_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function listSessions(limit = 50): Promise<WorkSession[]> {
  const db = getDb();
  return db.select<WorkSession[]>(
    `SELECT * FROM work_sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
}

export async function deleteSession(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM work_sessions WHERE id = $1`, [id]);
  emitDataChanged();
}

export type HeatmapCell = {
  day: number;   // 0=Dom…6=Sab
  hour: number;  // 0…23
  avg_energy: number;
  avg_focus: number;
  count: number;
};

export async function loadHeatmap(): Promise<HeatmapCell[]> {
  const db = getDb();
  return db.select<HeatmapCell[]>(`
    SELECT
      CAST(strftime('%w', started_at) AS INTEGER) as day,
      CAST(strftime('%H', started_at) AS INTEGER) as hour,
      AVG(energy_level) as avg_energy,
      AVG(focus_level) as avg_focus,
      COUNT(*) as count
    FROM work_sessions
    WHERE ended_at IS NOT NULL AND energy_level IS NOT NULL
    GROUP BY day, hour
  `);
}

export type ActivityStats = {
  activity_type: string;
  total_minutes: number;
  avg_energy: number;
  avg_focus: number;
  sessions: number;
};

export async function loadActivityStats(): Promise<ActivityStats[]> {
  const db = getDb();
  return db.select<ActivityStats[]>(`
    SELECT
      activity_type,
      CAST(SUM((julianday(ended_at) - julianday(started_at)) * 1440) AS INTEGER) as total_minutes,
      ROUND(AVG(energy_level), 1) as avg_energy,
      ROUND(AVG(focus_level), 1) as avg_focus,
      COUNT(*) as sessions
    FROM work_sessions
    WHERE ended_at IS NOT NULL
    GROUP BY activity_type
    ORDER BY total_minutes DESC
  `);
}

export type TimePerProject = {
  context_type: string;
  context_id: number;
  label: string;
  totalMinutes: number;
  sessions: number;
};

export async function loadTimePerProject(): Promise<TimePerProject[]> {
  const db = getDb();
  const rows = await db.select<
    { context_type: string; context_id: number; totalMinutes: number; sessions: number }[]
  >(`
    SELECT
      context_type,
      context_id,
      SUM((julianday(ended_at) - julianday(started_at)) * 24 * 60) as totalMinutes,
      COUNT(*) as sessions
    FROM work_sessions
    WHERE ended_at IS NOT NULL
      AND context_type IS NOT NULL
      AND context_id IS NOT NULL
    GROUP BY context_type, context_id
    ORDER BY totalMinutes DESC
  `);

  const result: TimePerProject[] = [];
  for (const r of rows) {
    let label = `${r.context_type} #${r.context_id}`;
    let sql: string | null = null;
    switch (r.context_type) {
      case "track":
        sql = `SELECT title_working AS label FROM tracks WHERE id=$1`;
        break;
      case "gig":
        sql = `SELECT COALESCE(NULLIF(event_name,''), venue_name) AS label FROM gigs WHERE id=$1`;
        break;
      case "content":
        sql = `SELECT title AS label FROM content WHERE id=$1`;
        break;
      case "task":
        sql = `SELECT title AS label FROM tasks WHERE id=$1`;
        break;
    }
    if (sql) {
      const named = await db.select<{ label: string | null }[]>(sql, [r.context_id]);
      if (named[0]?.label) label = named[0].label;
    }
    result.push({
      context_type: r.context_type,
      context_id: r.context_id,
      label,
      totalMinutes: r.totalMinutes,
      sessions: r.sessions,
    });
  }
  return result;
}

// Highlights
export type Highlight = {
  id: number;
  title: string;
  date: string;
  body: string | null;
  created_at: string;
};

export async function listHighlights(): Promise<Highlight[]> {
  const db = getDb();
  return db.select<Highlight[]>(
    `SELECT * FROM highlights ORDER BY date DESC`
  );
}

export async function createHighlight(input: {
  title: string;
  date: string;
  body: string | null;
}): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO highlights (title, date, body) VALUES ($1, $2, $3)`,
    [input.title, input.date, input.body]
  );
  emitDataChanged();
  return res.lastInsertId as number;
}

export async function deleteHighlight(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM highlights WHERE id=$1`, [id]);
  emitDataChanged();
}
