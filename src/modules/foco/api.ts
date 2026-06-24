import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { toLocalISODate } from "@/lib/format";

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
  pause_ms: number;
  /** Tempo previsto em minutos (opcional). Alimenta o anel + alerta de venc. */
  planned_minutes: number | null;
  created_at: string;
};

export async function startSession(
  activity_type: ActivityType,
  context_type: string | null = null,
  context_id: number | null = null,
  planned_minutes: number | null = null
): Promise<number> {
  const db = getDb();
  const started_at = new Date().toISOString();
  const res = await db.execute(
    `INSERT INTO work_sessions (started_at, activity_type, context_type, context_id, planned_minutes) VALUES ($1, $2, $3, $4, $5)`,
    [started_at, activity_type, context_type, context_id, planned_minutes]
  );
  emitDataChanged();
  return res.lastInsertId as number;
}

// ── Painel de contexto do foco (por tipo de atividade) ───────────────────────
// O modo foco mostra, ao lado do cronômetro, o que importa para AQUELA atividade:
// • Tempo de palco → contato do dia, horários do set e ideias de música da GIG
// • Criação musical → o conceito da faixa
// • Gestão → tarefas pendentes pra ir tickando
// Lê direto do banco (funciona até na mini-janela: getDb() delega pro processo
// Rust, que é o mesmo pra todas as janelas).

export type StageSlot = { start: string; end: string };
export type FocusPanel =
  | {
      kind: "stage";
      title: string;
      date: string | null;
      city: string | null;
      slots: StageSlot[];
      dayContactName: string | null;
      dayContactPhone: string | null;
      ideas: string[];
    }
  | { kind: "music"; title: string; stage: string | null; concept: string | null }
  | {
      kind: "tasks";
      tasks: { id: number; title: string; priority: string | null; due_date: string | null }[];
    }
  | null;

function parseStageSlots(time_slots: string | null, start: string | null, end: string | null): StageSlot[] {
  try {
    const arr = time_slots ? (JSON.parse(time_slots) as unknown) : null;
    if (Array.isArray(arr)) {
      const slots = arr
        .filter((s): s is StageSlot => !!s && typeof s === "object")
        .map((s) => ({ start: String((s as StageSlot).start ?? ""), end: String((s as StageSlot).end ?? "") }))
        .filter((s) => s.start || s.end);
      if (slots.length > 0) return slots;
    }
  } catch {
    /* cai no fallback */
  }
  if (start || end) return [{ start: start ?? "", end: end ?? "" }];
  return [];
}

function parseGigIdeas(gig_research: string | null): string[] {
  try {
    const arr = gig_research ? (JSON.parse(gig_research) as unknown) : null;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((r) => {
        if (r && typeof r === "object") {
          const o = r as { title?: unknown; artist?: unknown };
          const t = typeof o.title === "string" ? o.title : "";
          const a = typeof o.artist === "string" ? o.artist : "";
          return [t, a].filter(Boolean).join(" · ");
        }
        return typeof r === "string" ? r : "";
      })
      .filter((s) => s.trim().length > 0)
      .slice(0, 8);
  } catch {
    return [];
  }
}

type GigPanelRow = {
  venue_name: string;
  event_name: string | null;
  date: string | null;
  venue_city: string | null;
  start_time: string | null;
  end_time: string | null;
  time_slots: string | null;
  day_contact_name: string | null;
  day_contact_phone: string | null;
  gig_research: string | null;
};

export async function loadFocusPanel(session: {
  activity_type: string;
  context_type: string | null;
  context_id: number | null;
}): Promise<FocusPanel> {
  const db = getDb();
  const act = session.activity_type;

  if (act === "Tempo de palco") {
    const gigCols = `venue_name, event_name, date, venue_city, start_time, end_time, time_slots, day_contact_name, day_contact_phone, gig_research`;
    let row: GigPanelRow | undefined;
    if (session.context_type === "gig" && session.context_id) {
      const rows = await db.select<GigPanelRow[]>(
        `SELECT ${gigCols} FROM gigs WHERE id = $1`,
        [session.context_id]
      );
      row = rows[0];
    }
    if (!row) {
      const rows = await db.select<GigPanelRow[]>(
        `SELECT ${gigCols} FROM gigs WHERE date >= date('now') AND status != 'Cancelada' ORDER BY date, start_time LIMIT 1`
      );
      row = rows[0];
    }
    if (!row) return null;
    return {
      kind: "stage",
      title: (row.event_name && row.event_name.trim()) || row.venue_name,
      date: row.date,
      city: row.venue_city,
      slots: parseStageSlots(row.time_slots, row.start_time, row.end_time),
      dayContactName: row.day_contact_name,
      dayContactPhone: row.day_contact_phone,
      ideas: parseGigIdeas(row.gig_research),
    };
  }

  if (act === "Criação musical") {
    if (session.context_type !== "track" || !session.context_id) return null;
    const rows = await db.select<
      { title_working: string; title_final: string | null; current_stage: string | null; concept_narrative: string | null; stage_notes: string | null }[]
    >(
      `SELECT title_working, title_final, current_stage, concept_narrative, stage_notes FROM tracks WHERE id = $1`,
      [session.context_id]
    );
    const t = rows[0];
    if (!t) return null;
    return {
      kind: "music",
      title: (t.title_final && t.title_final.trim()) || t.title_working,
      stage: t.current_stage,
      concept: (t.concept_narrative && t.concept_narrative.trim()) || (t.stage_notes && t.stage_notes.trim()) || null,
    };
  }

  if (act === "Gestão") {
    const tasks = await db.select<
      { id: number; title: string; priority: string | null; due_date: string | null }[]
    >(
      `SELECT id, title, priority, due_date FROM tasks
        WHERE status NOT IN ('Concluída','Cancelada')
        ORDER BY (due_date IS NULL), due_date LIMIT 12`
    );
    return { kind: "tasks", tasks };
  }

  return null;
}

export async function endSession(
  id: number,
  energy_level: number,
  focus_level: number,
  notes: string | null,
  context: string | null = null,
  context_type: string | null = null,
  context_id: number | null = null,
  pause_ms: number = 0
): Promise<void> {
  const db = getDb();
  const ended_at = new Date().toISOString();
  await db.execute(
    `UPDATE work_sessions SET ended_at=$1, energy_level=$2, focus_level=$3, notes=$4, context=$5, context_type=$6, context_id=$7, pause_ms=$8 WHERE id=$9`,
    [ended_at, energy_level, focus_level, notes, context, context_type, context_id, pause_ms, id]
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

// ── Trilha da semana (focus_blocks) ──────────────────────────────────────────
// "foco" = bloco produtivo (conta nas horas planejadas); "morto" = tempo
// indisponível/bloqueado (não conta). O rótulo "morto" é interno — a UI mostra
// "Indisponível".
export type FocusBlockKind = "foco" | "morto";

/** Classificações dos blocos — reaproveita os tipos de atividade do Modo Foco. */
export const BLOCK_CATEGORIES = ACTIVITY_TYPES;

export type FocusBlock = {
  id: number;
  weekday: number; // 0=Dom … 6=Sáb
  start_min: number; // minutos desde 00:00
  duration_min: number;
  kind: FocusBlockKind;
  label: string | null;
  /** Classificação (gestão, estudo, tempo de palco…). */
  category: string | null;
  /** Cor do bloco em hex (#rrggbb). Sem cor → usa a cor do tipo. */
  color: string | null;
  /** Plano breve (opcional). */
  plan: string | null;
};

export type FocusBlockInput = {
  weekday: number;
  start_min: number;
  duration_min: number;
  kind: FocusBlockKind;
  label?: string | null;
  category?: string | null;
  color?: string | null;
  plan?: string | null;
};

export async function listFocusBlocks(): Promise<FocusBlock[]> {
  const db = getDb();
  return db
    .select<FocusBlock[]>(
      `SELECT id, weekday, start_min, duration_min, kind, label, category, color, plan
         FROM focus_blocks ORDER BY weekday, start_min`
    )
    .catch(() => [] as FocusBlock[]);
}

export async function createFocusBlock(input: FocusBlockInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO focus_blocks (weekday, start_min, duration_min, kind, label, category, color, plan)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.weekday, input.start_min, input.duration_min, input.kind,
      input.label ?? null, input.category ?? null, input.color ?? null, input.plan ?? null,
    ]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export type StageTimeBlock = {
  gig_id: number;
  weekday: number;
  start_min: number;
  duration_min: number;
  label: string;
};

/**
 * Blocos de "tempo de palco" derivados das GIGs da SEMANA CORRENTE (dom→sáb).
 * Lê data + time_slots de cada GIG não-cancelada e mapeia pro grid semanal. São
 * read-only (refletem a agenda real, não ficam em focus_blocks).
 */
export async function loadStageTimeBlocks(): Promise<StageTimeBlock[]> {
  const db = getDb();
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  sunday.setHours(0, 0, 0, 0);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const iso = (d: Date) => toLocalISODate(d); // LOCAL, não UTC (senão a semana vira o dia errado no fuso BR)
  const rows = await db
    .select<
      { id: number; date: string | null; event_name: string | null; venue_name: string; start_time: string | null; end_time: string | null; time_slots: string | null }[]
    >(
      `SELECT id, date, event_name, venue_name, start_time, end_time, time_slots
         FROM gigs WHERE date >= $1 AND date <= $2 AND status != 'Cancelada'`,
      [iso(sunday), iso(saturday)]
    )
    .catch(() => [] as { id: number; date: string | null; event_name: string | null; venue_name: string; start_time: string | null; end_time: string | null; time_slots: string | null }[]);
  const toMin = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const blocks: StageTimeBlock[] = [];
  for (const g of rows) {
    if (!g.date) continue;
    const weekday = new Date(`${g.date}T00:00:00`).getDay();
    const label = (g.event_name && g.event_name.trim()) || g.venue_name;
    for (const s of parseStageSlots(g.time_slots, g.start_time, g.end_time)) {
      const sm = s.start ? toMin(s.start) : null;
      if (sm == null) continue;
      let em = s.end ? toMin(s.end) : null;
      if (em == null) em = sm + 60;
      if (em <= sm) em = 24 * 60; // cruza a meia-noite → cap no fim do dia
      blocks.push({ gig_id: g.id, weekday, start_min: sm, duration_min: em - sm, label });
    }
  }
  return blocks;
}

export type PeakFocusHour = { hour: number; avg_focus: number; sessions: number } | null;

/** Horário do dia com MAIOR foco médio (sessões encerradas com foco aferido). */
export async function loadPeakFocusHour(): Promise<PeakFocusHour> {
  const db = getDb();
  const rows = await db
    .select<{ hour: number; avg_focus: number; sessions: number }[]>(`
      SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour,
             ROUND(AVG(focus_level), 1) AS avg_focus,
             COUNT(*) AS sessions
        FROM work_sessions
       WHERE ended_at IS NOT NULL AND focus_level IS NOT NULL
       GROUP BY hour
       ORDER BY avg_focus DESC, sessions DESC
       LIMIT 1
    `)
    .catch(() => [] as { hour: number; avg_focus: number; sessions: number }[]);
  return rows[0] ?? null;
}

export async function updateFocusBlock(
  id: number,
  patch: Partial<FocusBlockInput>
): Promise<void> {
  const db = getDb();
  const cols = Object.keys(patch);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (patch as Record<string, unknown>)[c]);
  values.push(id);
  await db.execute(`UPDATE focus_blocks SET ${sets} WHERE id = $${values.length}`, values);
  emitDataChanged();
}

export async function deleteFocusBlock(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM focus_blocks WHERE id = $1`, [id]);
  emitDataChanged();
}

/**
 * Streak (estilo Duolingo): dias seguidos com ao menos uma sessão encerrada,
 * terminando hoje ou ontem (se ainda não focou hoje, a sequência não quebra até
 * o fim do dia).
 */
export async function loadFocusStreak(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select<{ d: string }[]>(
      `SELECT DISTINCT date(started_at) AS d FROM work_sessions
        WHERE ended_at IS NOT NULL ORDER BY d DESC`
    )
    .catch(() => [] as { d: string }[]);
  const days = new Set(rows.map((r) => r.d));
  if (days.size === 0) return 0;

  const dayMs = 86400000;
  const today = new Date();
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  // âncora: hoje se focou hoje, senão ontem (sequência ainda viva durante o dia)
  let cursor = new Date(today);
  if (!days.has(iso(cursor))) {
    cursor = new Date(today.getTime() - dayMs);
    if (!days.has(iso(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(iso(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - dayMs);
  }
  return streak;
}
