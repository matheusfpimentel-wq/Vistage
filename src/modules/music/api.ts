import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import {
  projectKindFromTrack,
  nextStage,
  prevStage,
  type Stage,
} from "./stages";
import type { GateDecisionRecord } from "./gates";
import { trackDisplayName } from "./types";
import type {
  FlowSession,
  MusicProject,
  MusicProjectCost,
  MusicProjectCostCreateInput,
  MusicProjectCreateInput,
  MusicProjectUpdateInput,
  SnapshotData,
  StageHistoryEntry,
  Track,
  TrackCreateInput,
  TrackPerformanceSnapshot,
  TrackRow,
  TrackUpdateInput,
  TrackWithProject,
} from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function rowToTrack(r: TrackRow): Track {
  const { reference_files, ...rest } = r;
  return {
    ...rest,
    mood_tags: parseJsonArray<string>(r.mood_tags),
    references: parseJsonArray<string>(reference_files),
    stage_history: parseJsonArray<StageHistoryEntry>(r.stage_history),
    standby: r.standby === 1,
  };
}

// ============================================================
// Projetos
// ============================================================

export async function listProjects(): Promise<MusicProject[]> {
  const db = getDb();
  return db.select<MusicProject[]>(
    "SELECT * FROM music_projects ORDER BY updated_at DESC"
  );
}

export async function getProject(id: number): Promise<MusicProject | null> {
  const db = getDb();
  const rows = await db.select<MusicProject[]>(
    "SELECT * FROM music_projects WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function createProject(
  input: MusicProjectCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO music_projects (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateProject(
  input: MusicProjectUpdateInput
): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE music_projects SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteProject(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM music_projects WHERE id = $1", [id]);
}

// ============================================================
// Tracks
// ============================================================

// `references` é palavra reservada no SQLite — sempre entre aspas.
const TRACK_INSERT_COLS = [
  "project_id",
  "kind",
  "title_working",
  "title_final",
  "bpm",
  "key",
  "duration_seconds",
  "mood_tags",
  "genre_primary",
  "genre_secondary",
  "reference_files",
  "constraints",
  "concept_narrative",
  "current_stage",
  "stage_history",
  "daw_project_path",
  "stems_path",
  "final_files_path",
  "stage_notes",
  "creative_block_notes",
  "standby",
  "related_track_id",
];

export async function listTracks(): Promise<TrackWithProject[]> {
  const db = getDb();
  const rows = await db.select<(TrackRow & { project_kind: string; project_title: string })[]>(
    `SELECT t.*, p.kind AS project_kind, p.title AS project_title
       FROM tracks t
       JOIN music_projects p ON p.id = t.project_id
      ORDER BY t.updated_at DESC`
  );
  return rows.map((r) => ({
    ...rowToTrack(r),
    project_kind: r.project_kind as TrackWithProject["project_kind"],
    project_title: r.project_title,
  }));
}

// Moods mais usados em todas as tracks, do mais frequente ao menos.
// Serve de sugestão persistente ao cadastrar uma nova track.
export async function getTopMoods(limit = 12): Promise<string[]> {
  const db = getDb();
  const rows = await db.select<{ mood_tags: string | null }[]>(
    "SELECT mood_tags FROM tracks"
  );
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const tag of parseJsonArray<string>(r.mood_tags)) {
      const t = tag.trim();
      if (!t) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export async function getTrack(id: number): Promise<Track | null> {
  const db = getDb();
  const rows = await db.select<TrackRow[]>(
    "SELECT * FROM tracks WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToTrack(rows[0]) : null;
}

export async function createTrack(input: TrackCreateInput): Promise<number> {
  const db = getDb();

  // auto-cria projeto se a track foi criada solta
  let projectId = input.project_id;
  if (!projectId) {
    projectId = await createProject({
      kind: projectKindFromTrack(input.kind),
      title: input.title_working,
      release_strategy: null,
      presave_link: null,
      press_release_draft: null,
      marketing_dates: null,
      partnerships_confirmed: null,
      concept: null,
      notes: null,
    });
  }

  const stage: Stage = "Ideação";
  const history: StageHistoryEntry[] = [
    { stage, entered_at: nowISO() },
  ];

  const values = [
    projectId,
    input.kind,
    input.title_working,
    input.title_final,
    input.bpm,
    input.key,
    input.duration_seconds,
    JSON.stringify(input.mood_tags ?? []),
    input.genre_primary,
    input.genre_secondary,
    JSON.stringify(input.references ?? []),
    input.constraints,
    input.concept_narrative,
    stage,
    JSON.stringify(history),
    input.daw_project_path,
    input.stems_path,
    input.final_files_path,
    input.stage_notes,
    input.creative_block_notes,
    0,
    input.related_track_id ?? null,
  ];
  const placeholders = TRACK_INSERT_COLS.map((_, i) => `$${i + 1}`).join(", ");
  const res = await db.execute(
    `INSERT INTO tracks (${TRACK_INSERT_COLS.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  // Cria tarefa vinculada
  try {
    const { createTask } = await import("@/modules/tasks/api");
    const taskStage = "Ideação";
    const taskId = await createTask({
      title: `${input.title_working} (${taskStage})`,
      description: null,
      category: "Produção Musical",
      gig_id: null,
      contact_id: null,
      priority: "Média",
      status: "A fazer",
      due_date: null,
      tags: ["música"],
    });
    await db.execute("UPDATE tracks SET task_id = $1 WHERE id = $2", [taskId, id]);
  } catch {
    /* não interrompe */
  }
  emitDataChanged();
  return id;
}

const COL_MAP: Record<string, string> = { references: "reference_files" };

export async function updateTrack(input: TrackUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.mood_tags))
    payload.mood_tags = JSON.stringify(payload.mood_tags);
  if (Array.isArray(payload.references))
    payload.references = JSON.stringify(payload.references);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols
    .map((c, i) => `${COL_MAP[c] ?? c} = $${i + 1}`)
    .join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE tracks SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  // Sync task due_date when track date changes
  if ("date" in rest) {
    const rows = await db.select<{ task_id: number | null }[]>(
      "SELECT task_id FROM tracks WHERE id = $1", [id]
    );
    const taskId = rows[0]?.task_id;
    if (taskId) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        await updateTask({ id: taskId, due_date: rest.date as string | null });
      } catch { /* não interrompe */ }
    }
  }
  emitDataChanged();
}

export async function deleteTrack(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ task_id: number | null }[]>(
    "SELECT task_id FROM tracks WHERE id = $1",
    [id]
  );
  const taskId = rows[0]?.task_id ?? null;
  await db.execute("DELETE FROM tracks WHERE id = $1", [id]);
  if (taskId) {
    await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
  }
  emitDataChanged();
}

// ============================================================
// Transições de stage / gates
// ============================================================

async function writeStage(
  id: number,
  stage: Stage,
  history: StageHistoryEntry[],
  standby: boolean
): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE tracks
        SET current_stage = $1, stage_history = $2, standby = $3,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $4`,
    [stage, JSON.stringify(history), standby ? 1 : 0, id]
  );
  // Conclui a tarefa vinculada quando a track chega ao lançamento
  if (stage === "Lançamento") {
    const rows = await db.select<{ task_id: number | null }[]>(
      "SELECT task_id FROM tracks WHERE id = $1", [id]
    );
    const taskId = rows[0]?.task_id;
    if (taskId) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        await updateTask({ id: taskId, status: "Concluída" });
      } catch { /* não interrompe */ }
    }
  }
}

/** Avança pro próximo stage. Se houver decisão de gate, grava no histórico. */
export async function advanceStage(
  track: Track,
  gate?: GateDecisionRecord
): Promise<void> {
  const next = nextStage(track.current_stage);
  if (!next) return;
  const now = nowISO();
  const history = [...track.stage_history];
  const cur = history[history.length - 1];
  if (cur && !cur.exited_at) {
    cur.exited_at = now;
    if (gate) cur.gate = gate;
  }
  history.push({ stage: next, entered_at: now });
  await writeStage(track.id, next, history, false);
}

/** Volta um stage (sem gate). */
export async function regressStage(track: Track): Promise<void> {
  const prev = prevStage(track.current_stage);
  if (!prev) return;
  const now = nowISO();
  const history = [...track.stage_history];
  const cur = history[history.length - 1];
  if (cur && !cur.exited_at) cur.exited_at = now;
  history.push({ stage: prev, entered_at: now });
  await writeStage(track.id, prev, history, false);
}

/** Reprova num gate → Stand-by (não move stage; mantém reativável). */
export async function rejectAtGate(
  track: Track,
  gate: GateDecisionRecord
): Promise<void> {
  const history = [...track.stage_history];
  const cur = history[history.length - 1];
  if (cur) cur.gate = gate;
  await writeStage(track.id, track.current_stage, history, true);
}

/** Move a track direto pra um stage (drag no kanban). Sai do stand-by. */
export async function moveTrackToStage(track: Track, stage: Stage): Promise<void> {
  if (track.current_stage === stage && !track.standby) return;
  const now = nowISO();
  const history = [...track.stage_history];
  const cur = history[history.length - 1];
  if (cur && !cur.exited_at) cur.exited_at = now;
  history.push({ stage, entered_at: now });
  await writeStage(track.id, stage, history, false);
  // Sincroniza tarefa vinculada
  if (track.task_id) {
    try {
      const { updateTask } = await import("@/modules/tasks/api");
      if (stage === "Lançamento" || stage === "Pós-lançamento") {
        await updateTask({ id: track.task_id, status: "Concluída" });
      } else {
        await updateTask({ id: track.task_id, title: `${track.title_working} (${stage})` });
      }
    } catch {
      /* não interrompe */
    }
  }
}

/** Coloca/tira do Stand-by sem mexer no stage (drag pro coluna Stand-by). */
export async function setTrackStandby(id: number, standby: boolean): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE tracks SET standby = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [standby ? 1 : 0, id]
  );
}

/** Reativa uma track que estava em Stand-by. */
export async function reactivateTrack(id: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE tracks SET standby = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id]
  );
}

/** Registra a decisão do Gate 4 (revisão pós-lançamento), sem mudar stage. */
export async function recordGate4(
  track: Track,
  gate: GateDecisionRecord
): Promise<void> {
  const history = [...track.stage_history];
  const cur = history[history.length - 1];
  if (cur) cur.gate = gate;
  await writeStage(
    track.id,
    track.current_stage,
    history,
    gate.decision === "rejected"
  );
}

/** Quando a track entrou no stage atual (entered_at da última entrada). */
export function stageEnteredAt(track: Track): string | null {
  const last = track.stage_history[track.stage_history.length - 1];
  return last?.entered_at ?? null;
}

export function daysInStage(track: Track): number | null {
  const entered = stageEnteredAt(track);
  if (!entered) return null;
  return Math.floor((Date.now() - new Date(entered).getTime()) / 86_400_000);
}

// ============================================================
// Colaboradores (N:N com contacts)
// ============================================================

export async function listTrackCollaborators(
  trackId: number
): Promise<number[]> {
  const db = getDb();
  const rows = await db.select<{ contact_id: number }[]>(
    "SELECT contact_id FROM track_collaborators WHERE track_id = $1",
    [trackId]
  );
  return rows.map((r) => r.contact_id);
}

export async function setTrackCollaborators(
  trackId: number,
  contactIds: number[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM track_collaborators WHERE track_id = $1", [
    trackId,
  ]);
  for (const cid of contactIds) {
    await db.execute(
      "INSERT OR IGNORE INTO track_collaborators (track_id, contact_id) VALUES ($1, $2)",
      [trackId, cid]
    );
  }
}

// ============================================================
// Flow sessions (sub-bloco Criatividade — Flow Theory)
// ============================================================

export async function listFlowSessions(
  trackId: number
): Promise<FlowSession[]> {
  const db = getDb();
  return db.select<FlowSession[]>(
    "SELECT * FROM track_flow_sessions WHERE track_id = $1 ORDER BY started_at DESC",
    [trackId]
  );
}

export async function getOpenFlowSession(
  trackId: number
): Promise<FlowSession | null> {
  const db = getDb();
  const rows = await db.select<FlowSession[]>(
    "SELECT * FROM track_flow_sessions WHERE track_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [trackId]
  );
  return rows[0] ?? null;
}

export async function startFlowSession(trackId: number): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO track_flow_sessions (track_id, started_at) VALUES ($1, $2)",
    [trackId, nowISO()]
  );
  return Number(res.lastInsertId);
}

export async function endFlowSession(
  id: number,
  flowLevel: number | null,
  blockNotes: string | null
): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE track_flow_sessions SET ended_at = $1, flow_level = $2, block_notes = $3 WHERE id = $4",
    [nowISO(), flowLevel, blockNotes, id]
  );
}

export async function deleteFlowSession(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM track_flow_sessions WHERE id = $1", [id]);
}

// ============================================================
// Custos do projeto
// ============================================================

export async function listProjectCosts(projectId: number): Promise<MusicProjectCost[]> {
  const db = getDb();
  return db.select<MusicProjectCost[]>(
    "SELECT * FROM music_project_costs WHERE project_id = $1 ORDER BY date DESC, created_at DESC",
    [projectId]
  );
}

export async function createCost(input: MusicProjectCostCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO music_project_costs (project_id, track_id, category, description, amount, date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.project_id, input.track_id, input.category, input.description, input.amount, input.date]
  );
  const costId = Number(res.lastInsertId);
  try {
    const { syncMusicCostTransaction } = await import("@/modules/finance/api");
    await syncMusicCostTransaction(costId);
  } catch { /* não interrompe */ }
  return costId;
}

export async function deleteCost(id: number): Promise<void> {
  const db = getDb();
  try {
    const { deleteTransactionsForMusicCost } = await import("@/modules/finance/api");
    await deleteTransactionsForMusicCost(id);
  } catch { /* não interrompe */ }
  await db.execute("DELETE FROM music_project_costs WHERE id = $1", [id]);
}

// ============================================================
// Performance snapshots
// ============================================================

export async function listTrackSnapshots(trackId: number): Promise<TrackPerformanceSnapshot[]> {
  const db = getDb();
  return db.select<TrackPerformanceSnapshot[]>(
    "SELECT * FROM track_performance_snapshots WHERE track_id = $1 ORDER BY period_yyyymm DESC",
    [trackId]
  );
}

export async function upsertSnapshot(
  trackId: number,
  period: string,
  data: SnapshotData
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO track_performance_snapshots (track_id, period_yyyymm, data)
     VALUES ($1, $2, $3)
     ON CONFLICT(track_id, period_yyyymm) DO UPDATE SET data = excluded.data`,
    [trackId, period, JSON.stringify(data)]
  );
}

export async function deleteSnapshot(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM track_performance_snapshots WHERE id = $1", [id]);
}

// ============================================================
// Media targets (N:N tracks × contacts)
// ============================================================

export async function listTrackMediaTargets(trackId: number): Promise<{ contact_id: number; role: string | null }[]> {
  const db = getDb();
  return db.select(
    "SELECT contact_id, role FROM track_media_targets WHERE track_id = $1",
    [trackId]
  );
}

export async function setTrackMediaTargets(
  trackId: number,
  targets: { contact_id: number; role: string | null }[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM track_media_targets WHERE track_id = $1", [trackId]);
  for (const t of targets) {
    await db.execute(
      "INSERT OR IGNORE INTO track_media_targets (track_id, contact_id, role) VALUES ($1, $2, $3)",
      [trackId, t.contact_id, t.role]
    );
  }
}

// ============================================================
// Auto-criação ao entrar em Pré-lançamento / Lançamento
// ============================================================

export async function autoCreatePreLaunchContent(
  track: Track,
  titles: string[]
): Promise<void> {
  const db = getDb();
  const now = nowISO();
  const trackName = trackDisplayName(track);
  for (const t of titles) {
    await db.execute(
      `INSERT INTO content (title, status, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
      [`[${t}] ${trackName}`, "Ideia", now, now]
    );
  }
}

export async function autoCreateLaunchTask(track: Track): Promise<void> {
  const db = getDb();
  const now = nowISO();
  const trackName = trackDisplayName(track);
  // próximo dia 1 do mês após hoje
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  const due = d.toISOString().slice(0, 10);
  await db.execute(
    `INSERT INTO tasks (title, category, priority, status, due_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      `Atualizar métricas de ${trackName}`,
      "Produção Musical",
      "Média",
      "A fazer",
      due,
      now,
      now,
    ]
  );
}

// ============================================================
// GIGs onde a track foi tocada
// ============================================================

export async function listTrackGigs(
  trackId: number
): Promise<{ id: number; event_name: string | null; venue_name: string; date: string }[]> {
  const db = getDb();
  return db.select(
    `SELECT g.id, g.event_name, g.venue_name, g.date
       FROM gigs g
       JOIN gig_tracks gt ON gt.gig_id = g.id
      WHERE gt.track_id = $1
      ORDER BY g.date DESC`,
    [trackId]
  );
}
