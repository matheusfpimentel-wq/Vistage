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
  "Preparação",
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
  /** UUID gerado no celular que liga esta sessão aos marcadores ao vivo do Modo
   *  Foco (performance_weak_points/moments). Null em sessões criadas no PC. */
  focus_session_id: string | null;
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
  | {
      // Sessão de Gestão ligada a uma tarefa específica → o checklist dela.
      kind: "task-checklist";
      taskId: number;
      title: string;
      subtasks: { id: number; title: string; done: boolean }[];
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
    // Ligada a uma tarefa → mostra o checklist (subtasks) dela pra tickar.
    if (session.context_type === "task" && session.context_id) {
      const trows = await db.select<{ title: string }[]>(
        `SELECT title FROM tasks WHERE id = $1`,
        [session.context_id]
      );
      const t = trows[0];
      if (t) {
        const subs = await db.select<{ id: number; title: string; done: number }[]>(
          `SELECT id, title, done FROM subtasks WHERE task_id = $1 ORDER BY position`,
          [session.context_id]
        );
        return {
          kind: "task-checklist",
          taskId: session.context_id,
          title: t.title,
          subtasks: subs.map((s) => ({ id: s.id, title: s.title, done: s.done === 1 })),
        };
      }
    }
    const tasks = await db.select<
      { id: number; title: string; priority: string | null; due_date: string | null }[]
    >(
      `SELECT id, title, priority, due_date FROM tasks
        WHERE status NOT IN ('Concluída','Cancelada')
        ORDER BY (due_date IS NULL), due_date LIMIT 12`
    );
    return { kind: "tasks", tasks };
  }

  if (act === "Preparação") {
    // Preparação de show: checklist = tarefas abertas da GIG vinculada (ou, se
    // nenhuma foi vinculada, da próxima/de hoje).
    let gigId = session.context_type === "gig" ? session.context_id : null;
    if (!gigId) gigId = await resolveStageGigId();
    if (!gigId) return null;
    const tasks = await db.select<
      { id: number; title: string; priority: string | null; due_date: string | null }[]
    >(
      `SELECT id, title, priority, due_date FROM tasks
        WHERE gig_id = $1 AND status NOT IN ('Concluída','Cancelada')
        ORDER BY (due_date IS NULL), due_date LIMIT 20`,
      [gigId]
    );
    return { kind: "tasks", tasks };
  }

  return null;
}

export async function endSession(
  id: number,
  energy_level: number | null,
  focus_level: number | null,
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

// ── Marcadores ao vivo do Modo Foco (celular → PC) ───────────────────────────
// Pontos fracos e momentos marcados durante a apresentação no celular chegam por
// sync (mobileSync.ingest) ligados pela coluna focus_session_id. Aqui o PC os lê
// por sessão e permite descrever/excluir cada um (a descrição fica vazia até o
// usuário preencher no debrief).
export type PerfWeakPoint = {
  id: number;
  focus_session_id: string | null;
  gig_id: number | null;
  tipo: string | null;
  at_ms: number | null;
  at: string | null;
  descricao: string | null;
  created_at: string;
};

export type PerfMoment = {
  id: number;
  focus_session_id: string | null;
  gig_id: number | null;
  tipo: string | null;
  at_ms: number | null;
  at: string | null;
  descricao: string | null;
  created_at: string;
};

export type SessionMarkers = {
  weakPoints: PerfWeakPoint[];
  moments: PerfMoment[];
  /** Pontos fracos agregados por tipo, do mais frequente ao menos (pro resumo). */
  weakByTipo: { tipo: string; count: number }[];
  /** Pontos fortes (momentos) agregados por tipo, idem. */
  momentsByTipo: { tipo: string; count: number }[];
};

/** Rótulos legíveis dos tipos de ponto fraco (espelha o WeakType do mobile). */
export const WEAK_TIPO_LABEL: Record<string, string> = {
  tecnico: "Técnico",
  repertorio: "Repertório",
  postura: "Postura",
  outra: "Outra",
};

/** Rótulos dos tipos de ponto forte/momento (espelha o StrongType do mobile). */
export const STRONG_TIPO_LABEL: Record<string, string> = {
  tecnico: "Técnico",
  repertorio: "Repertório",
  postura: "Postura",
  conexao: "Conexão",
  outra: "Outro",
};

/** Agrega marcadores por tipo (null → "outra"), do mais frequente ao menos. */
function countByTipo(rows: { tipo: string | null }[]): { tipo: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const tipo = r.tipo ?? "outra";
    counts.set(tipo, (counts.get(tipo) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tipo, count]) => ({ tipo, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Quantos marcadores cada sessão (focus_session_id) tem — em 2 queries agregadas,
 * pra a lista de sessões mostrar um selo sem N+1. Chave = focus_session_id.
 */
export async function loadSessionMarkerCounts(): Promise<
  Map<string, { weak: number; moments: number }>
> {
  const db = getDb();
  const map = new Map<string, { weak: number; moments: number }>();
  const weak = await db
    .select<{ sid: string; n: number }[]>(
      `SELECT focus_session_id AS sid, COUNT(*) AS n FROM performance_weak_points
        WHERE focus_session_id IS NOT NULL GROUP BY focus_session_id`
    )
    .catch(() => [] as { sid: string; n: number }[]);
  const mom = await db
    .select<{ sid: string; n: number }[]>(
      `SELECT focus_session_id AS sid, COUNT(*) AS n FROM performance_moments
        WHERE focus_session_id IS NOT NULL GROUP BY focus_session_id`
    )
    .catch(() => [] as { sid: string; n: number }[]);
  for (const r of weak) map.set(r.sid, { weak: r.n, moments: 0 });
  for (const r of mom) {
    const e = map.get(r.sid) ?? { weak: 0, moments: 0 };
    e.moments = r.n;
    map.set(r.sid, e);
  }
  return map;
}

export async function loadSessionMarkers(focusSessionId: string): Promise<SessionMarkers> {
  const db = getDb();
  const weakPoints = await db.select<PerfWeakPoint[]>(
    `SELECT * FROM performance_weak_points WHERE focus_session_id = $1 ORDER BY at_ms, id`,
    [focusSessionId]
  );
  const moments = await db.select<PerfMoment[]>(
    `SELECT * FROM performance_moments WHERE focus_session_id = $1 ORDER BY at_ms, id`,
    [focusSessionId]
  );
  return { weakPoints, moments, weakByTipo: countByTipo(weakPoints), momentsByTipo: countByTipo(moments) };
}

/**
 * Marcadores ao vivo ligados a uma GIG, pro debrief (erro→pontos fracos,
 * momento→pontos fortes). Junta os dois caminhos: (a) marcadores que já chegaram
 * com gig_id (o celular manda quando a sessão é de palco) e (b) marcadores de
 * sessões de trabalho vinculadas à GIG (context_type='gig') pelo focus_session_id.
 * O OR cobre os dois sem duplicar (um marcador só tem uma origem).
 */
export async function loadGigMarkers(gigId: number): Promise<SessionMarkers> {
  const db = getDb();
  // $1 e $2 são o MESMO gigId (não reusa um placeholder — o plugin liga por posição).
  const linkedSessions = `focus_session_id IN (
        SELECT focus_session_id FROM work_sessions
         WHERE context_type = 'gig' AND context_id = $2 AND focus_session_id IS NOT NULL
      )`;
  const weakPoints = await db
    .select<PerfWeakPoint[]>(
      `SELECT * FROM performance_weak_points
        WHERE gig_id = $1 OR ${linkedSessions}
        ORDER BY at_ms, id`,
      [gigId, gigId]
    )
    .catch(() => [] as PerfWeakPoint[]);
  const moments = await db
    .select<PerfMoment[]>(
      `SELECT * FROM performance_moments
        WHERE gig_id = $1 OR ${linkedSessions}
        ORDER BY at_ms, id`,
      [gigId, gigId]
    )
    .catch(() => [] as PerfMoment[]);
  return { weakPoints, moments, weakByTipo: countByTipo(weakPoints), momentsByTipo: countByTipo(moments) };
}

/** Apaga TODOS os marcadores ao vivo (pontos fracos + momentos) ligados a uma
 *  GIG — direto pelo gig_id OU pela sessão de trabalho vinculada. Pro botão "x"
 *  do bloco "Marcado ao vivo no Modo Foco" do debrief, pra não ficarem pra sempre. */
export async function clearGigMarkers(gigId: number): Promise<void> {
  const db = getDb();
  const linked = `focus_session_id IN (
        SELECT focus_session_id FROM work_sessions
         WHERE context_type = 'gig' AND context_id = $2 AND focus_session_id IS NOT NULL
      )`;
  await db
    .execute(`DELETE FROM performance_weak_points WHERE gig_id = $1 OR ${linked}`, [gigId, gigId])
    .catch(() => {});
  await db
    .execute(`DELETE FROM performance_moments WHERE gig_id = $1 OR ${linked}`, [gigId, gigId])
    .catch(() => {});
  emitDataChanged();
}

/**
 * Resolve a GIG de uma sessão de palco quando ela não foi vinculada explicitamente:
 * a próxima (ou de hoje) não-cancelada. Mesma lógica do painel de palco do Modo Foco,
 * pra o debrief cair na GIG que o usuário acabou de tocar.
 */
export async function resolveStageGigId(): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select<{ id: number }[]>(
      `SELECT id FROM gigs WHERE date >= date('now') AND status != 'Cancelada'
        ORDER BY date, start_time LIMIT 1`
    )
    .catch(() => [] as { id: number }[]);
  return rows[0]?.id ?? null;
}

/** Minutos entre dois horários HH:MM (vira o dia quando end <= start — set noturno). */
function slotMinutes(s: StageSlot): number | null {
  const parse = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = parse(s.start);
  const b = parse(s.end);
  if (a == null || b == null) return null;
  let d = b - a;
  if (d <= 0) d += 24 * 60;
  return d > 0 ? d : null;
}

/**
 * Tempo previsto sugerido (min) pra uma sessão de palco: a duração do PRÓXIMO set
 * ainda não gravado da GIG. Conta quantas sessões de palco já foram encerradas pra
 * essa GIG e pega o período seguinte (do 1º em diante). null se não der pra saber.
 */
export async function suggestStagePlannedMinutes(gigId: number): Promise<number | null> {
  const db = getDb();
  const rows = await db
    .select<{ time_slots: string | null; start_time: string | null; end_time: string | null }[]>(
      `SELECT time_slots, start_time, end_time FROM gigs WHERE id = $1`,
      [gigId]
    )
    .catch(() => [] as { time_slots: string | null; start_time: string | null; end_time: string | null }[]);
  const gig = rows[0];
  if (!gig) return null;
  const slots = parseStageSlots(gig.time_slots, gig.start_time, gig.end_time);
  if (slots.length === 0) return null;
  const done = await db
    .select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM work_sessions
        WHERE activity_type = 'Tempo de palco' AND context_type = 'gig' AND context_id = $1 AND ended_at IS NOT NULL`,
      [gigId]
    )
    .catch(() => [{ n: 0 }]);
  const idx = Math.min(done[0]?.n ?? 0, slots.length - 1);
  return slotMinutes(slots[idx]);
}

export async function updateWeakPointDescription(id: number, descricao: string | null): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE performance_weak_points SET descricao = $1 WHERE id = $2`, [descricao, id]);
  emitDataChanged();
}

export async function deleteWeakPoint(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM performance_weak_points WHERE id = $1`, [id]);
  emitDataChanged();
}

export async function updateMomentDescription(id: number, descricao: string | null): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE performance_moments SET descricao = $1 WHERE id = $2`, [descricao, id]);
  emitDataChanged();
}

export async function deleteMoment(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM performance_moments WHERE id = $1`, [id]);
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
  // Agrega DUAS fontes na mesma escala 1–5 e no mesmo bucket dia-da-semana×hora,
  // em fuso LOCAL ('localtime' — o timestamp é gravado em UTC): as sessões de
  // trabalho (com energia e foco) e os registros avulsos de energia do celular
  // (EMA, sem foco). Média e contagem são sobre o conjunto; avg_focus vem só das
  // sessões — o AVG ignora os NULLs dos logs avulsos.
  return db.select<HeatmapCell[]>(`
    SELECT
      CAST(strftime('%w', ts, 'localtime') AS INTEGER) as day,
      CAST(strftime('%H', ts, 'localtime') AS INTEGER) as hour,
      AVG(energy) as avg_energy,
      AVG(focus) as avg_focus,
      COUNT(*) as count
    FROM (
      SELECT started_at AS ts, energy_level AS energy, focus_level AS focus
      FROM work_sessions
      WHERE ended_at IS NOT NULL AND energy_level IS NOT NULL
      UNION ALL
      SELECT logged_at AS ts, energy_level AS energy, NULL AS focus
      FROM energy_logs
    )
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
  // date(..., 'localtime') converte o started_at (gravado em UTC) para a data
  // LOCAL — senão uma sessão à noite no BR cai no dia seguinte (UTC) e a sequência
  // "de hoje" some. Casado com toLocalISODate no cursor abaixo.
  const rows = await db
    .select<{ d: string }[]>(
      `SELECT DISTINCT date(started_at, 'localtime') AS d FROM work_sessions
        WHERE ended_at IS NOT NULL ORDER BY d DESC`
    )
    .catch(() => [] as { d: string }[]);
  const days = new Set(rows.map((r) => r.d));
  if (days.size === 0) return 0;

  const dayMs = 86400000;
  const today = new Date();
  const iso = (dt: Date) => toLocalISODate(dt);
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
