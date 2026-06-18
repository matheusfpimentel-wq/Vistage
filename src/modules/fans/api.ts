import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Fan,
  FanCreateInput,
  FanGroup,
  FanGroupCreateInput,
  FanGroupMember,
  FanGroupUpdateInput,
  FanInteraction,
  FanInteractionType,
  FanLevel,
  FanPerk,
  FanPerkCreateInput,
  FanPerkUpdateInput,
  FanScoreThresholds,
  FanUpdateInput,
  FanUpgradeRules,
} from "./types";

type FanRow = Omit<Fan, "tags"> & { tags: string | null };

function rowToFan(r: FanRow): Fan {
  let tags: string[] = [];
  if (r.tags) {
    try {
      tags = JSON.parse(r.tags) as string[];
    } catch {
      tags = [];
    }
  }
  return { ...r, tags };
}

export type FanFilters = {
  level?: FanLevel | "Todos";
  city?: string;
  search?: string;
};

export async function listFans(filters: FanFilters = {}): Promise<Fan[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.level && filters.level !== "Todos") {
    params.push(filters.level);
    where.push(`level = $${params.length}`);
  }
  if (filters.city && filters.city.trim().length > 0) {
    params.push(`%${filters.city.trim()}%`);
    where.push(`city LIKE $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
    const i = params.length;
    where.push(
      `(name LIKE $${i - 3} OR email LIKE $${i - 2} OR phone LIKE $${i - 1} OR instagram LIKE $${i})`
    );
  }

  const sql =
    "SELECT * FROM fans" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY CASE level WHEN 'Embaixador' THEN 0 WHEN 'Superfã' THEN 1 WHEN 'Fã' THEN 2 WHEN 'Quase fã' THEN 3 ELSE 4 END, name COLLATE NOCASE ASC";
  const rows = await db.select<FanRow[]>(sql, params);
  return rows.map(rowToFan);
}

export async function getFan(id: number): Promise<Fan | null> {
  const db = getDb();
  const rows = await db.select<FanRow[]>("SELECT * FROM fans WHERE id = $1", [id]);
  return rows[0] ? rowToFan(rows[0]) : null;
}

export async function createFan(input: FanCreateInput): Promise<number> {
  const db = getDb();
  const payload = { ...input, tags: JSON.stringify(input.tags ?? []) };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO fans (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  emitDataChanged();
  return id;
}

export async function updateFan(input: FanUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE fans SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

export async function deleteFan(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fans WHERE id = $1", [id]);
  const { unlinkTasksFromEntity } = await import("@/modules/tasks/api");
  await unlinkTasksFromEntity("fan", id);
  emitDataChanged();
}

export async function listFanInteractions(fanId: number): Promise<FanInteraction[]> {
  const db = getDb();
  return db.select<FanInteraction[]>(
    `SELECT * FROM fan_interactions
     WHERE fan_id = $1
     ORDER BY date DESC, created_at DESC`,
    [fanId]
  );
}

// ============================================================
// Motor de pontuação (engagement score com decaimento)
// ============================================================

const SCORING_DEFAULTS = {
  weightPresenca: 3,
  weightFeedback: 2,
  weightInteracao: 1,
  weightGig: 3,
  halfLifeDays: 180,
  thresholds: { quaseFa: 2, fa: 5, superfa: 12, embaixador: 25 },
};

/**
 * Peso de um sinal já com o decaimento por idade aplicado (meia-vida): um sinal
 * com `halfLifeDays` de idade vale metade. Sinais no futuro (ex.: GIG planejada
 * com audiência pré-marcada) ainda não contam.
 */
function decayedWeight(dateStr: string | null, weight: number, halfLifeDays: number): number {
  if (!dateStr || weight <= 0) return 0;
  const iso = dateStr.includes("T") ? dateStr : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const ageDays = (Date.now() - t) / 86400000;
  if (ageDays < 0) return 0;
  return weight * Math.pow(0.5, ageDays / halfLifeDays);
}

// Embaixador NÃO entra na pontuação automática — é um destaque manual
// (fans.is_ambassador). O score sobe no máximo até Superfã.
function scoreToLevel(score: number, th: Required<FanScoreThresholds>): FanLevel {
  if (score >= th.superfa) return "Superfã";
  if (score >= th.fa) return "Fã";
  if (score >= th.quaseFa) return "Quase fã";
  return "Possível fã";
}

async function computeFanScoreAndLevel(
  fanId: number,
  preRules?: FanUpgradeRules
): Promise<{ score: number; level: FanLevel }> {
  const db = getDb();
  const cfg = (preRules ?? (await loadFanUpgradeRules())).scoring ?? {};
  const wPres = cfg.weightPresenca ?? SCORING_DEFAULTS.weightPresenca;
  const wFb = cfg.weightFeedback ?? SCORING_DEFAULTS.weightFeedback;
  const wInt = cfg.weightInteracao ?? SCORING_DEFAULTS.weightInteracao;
  const wGig = cfg.weightGig ?? SCORING_DEFAULTS.weightGig;
  const halfLife =
    cfg.halfLifeDays && cfg.halfLifeDays > 0 ? cfg.halfLifeDays : SCORING_DEFAULTS.halfLifeDays;
  const th: Required<FanScoreThresholds> = {
    quaseFa: cfg.thresholds?.quaseFa ?? SCORING_DEFAULTS.thresholds.quaseFa,
    fa: cfg.thresholds?.fa ?? SCORING_DEFAULTS.thresholds.fa,
    superfa: cfg.thresholds?.superfa ?? SCORING_DEFAULTS.thresholds.superfa,
    embaixador: cfg.thresholds?.embaixador ?? SCORING_DEFAULTS.thresholds.embaixador,
  };

  let score = 0;
  const interactions = await db.select<{ date: string; type: string }[]>(
    `SELECT date, type FROM fan_interactions WHERE fan_id = $1`,
    [fanId]
  );
  for (const it of interactions) {
    const w = it.type === "Presença" ? wPres : it.type === "Feedback" ? wFb : wInt;
    score += decayedWeight(it.date, w, halfLife);
  }
  // presenças reais em shows: audiência marcada na GIG, datada pela data do show
  const gigs = await db.select<{ date: string | null }[]>(
    `SELECT g.date FROM gig_fans gf JOIN gigs g ON g.id = gf.gig_id WHERE gf.fan_id = $1`,
    [fanId]
  );
  for (const g of gigs) {
    score += decayedWeight(g.date, wGig, halfLife);
  }

  return { score, level: scoreToLevel(score, th) };
}

/** Score de engajamento atual de um fã (com decaimento). Para exibição. */
export async function fanEngagementScore(fanId: number): Promise<number> {
  return (await computeFanScoreAndLevel(fanId)).score;
}

/**
 * Recalcula o nível do fã a partir do histórico (pontuação com decaimento).
 * Idempotente e reconciliável: reflete corretamente quando interações são
 * adicionadas OU removidas. Só grava se o nível mudou.
 */
export async function recomputeFanLevel(fanId: number): Promise<void> {
  const db = getDb();
  const { level: computed } = await computeFanScoreAndLevel(fanId);
  const cur = await db.select<{ level: string; is_ambassador: number }[]>(
    `SELECT level, is_ambassador FROM fans WHERE id = $1`,
    [fanId]
  );
  if (!cur[0]) return;
  // Embaixador é manual (is_ambassador) e imune ao recálculo.
  const level = cur[0].is_ambassador ? "Embaixador" : computed;
  if (cur[0].level !== level) {
    await db.execute(
      `UPDATE fans SET level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [level, fanId]
    );
    emitDataChanged();
  }
}

/**
 * Recalcula o nível de TODOS os fãs de uma vez (botão "recalcular agora").
 * Carrega as regras uma única vez. Retorna quantos níveis mudaram.
 */
export async function recomputeAllFanLevels(): Promise<number> {
  const db = getDb();
  const rules = await loadFanUpgradeRules();
  const fans = await db.select<{ id: number; level: string; is_ambassador: number }[]>(
    `SELECT id, level, is_ambassador FROM fans`
  );
  let changed = 0;
  for (const f of fans) {
    const { level: computed } = await computeFanScoreAndLevel(f.id, rules);
    const level = f.is_ambassador ? "Embaixador" : computed;
    if (f.level !== level) {
      await db.execute(
        `UPDATE fans SET level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [level, f.id]
      );
      changed++;
    }
  }
  if (changed > 0) emitDataChanged();
  return changed;
}

export async function addFanInteraction(
  fanId: number,
  date: string,
  note: string,
  type: FanInteractionType = "Interação",
  special = false
): Promise<number> {
  const db = getDb();
  const autoSpecial = type !== "Interação" ? true : special;
  const res = await db.execute(
    `INSERT INTO fan_interactions (fan_id, date, note, type, special) VALUES ($1, $2, $3, $4, $5)`,
    [fanId, date, note, type, autoSpecial ? 1 : 0]
  );
  await db.execute(
    `UPDATE fans
        SET last_interaction_at = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
    [date, fanId]
  );

  // Recalcula o nível a partir do histórico completo (pontuação com
  // decaimento). Substitui o antigo bump de 1 nível por interação especial +
  // regras de limiar — que compunham (podiam pular 2 níveis de uma vez) e nunca
  // reconciliavam quando algo era apagado.
  try {
    await recomputeFanLevel(fanId);
  } catch {
    // não interrompe o registro da interação
  }

  // Close any open follow-up tasks for this fan since they just interacted
  try {
    const followupRows = await db.select<{ id: number }[]>(
      `SELECT t.id FROM tasks t WHERE t.title LIKE 'Follow-up: %' AND t.status <> 'Concluída' AND t.description LIKE $1`,
      [`%fan_id:${fanId}%`]
    );
    for (const row of followupRows) {
      const { updateTask } = await import("@/modules/tasks/api");
      await updateTask({ id: row.id, status: "Concluída" }).catch(() => {});
    }
  } catch {
    // silently skip
  }

  return Number(res.lastInsertId);
}

export async function saveFanUpgradeRules(rules: FanUpgradeRules): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value) VALUES ('fan_upgrade_rules', $1)
     ON CONFLICT(key) DO UPDATE SET value = $1`,
    [JSON.stringify(rules)]
  );
}

export async function loadFanUpgradeRules(): Promise<FanUpgradeRules> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM app_settings WHERE key = 'fan_upgrade_rules'`
  );
  if (!rows[0]) return {};
  try {
    return JSON.parse(rows[0].value) as FanUpgradeRules;
  } catch {
    return {};
  }
}

export async function getFanInteractionCounts(fanId: number): Promise<{
  total: number;
  presences: number;
  feedbacks: number;
}> {
  const db = getDb();
  const rows = await db.select<{ type: string; n: number }[]>(
    `SELECT type, COUNT(*) as n FROM fan_interactions WHERE fan_id = $1 GROUP BY type`,
    [fanId]
  );
  let total = 0, presences = 0, feedbacks = 0;
  for (const r of rows) {
    total += r.n;
    if (r.type === "Presença") presences = r.n;
    if (r.type === "Feedback") feedbacks = r.n;
  }
  return { total, presences, feedbacks };
}

export async function listFanInteractionCounts(): Promise<Map<number, number>> {
  const db = getDb();
  const rows = await db.select<{ fan_id: number; n: number }[]>(
    `SELECT fan_id, COUNT(*) as n FROM fan_interactions GROUP BY fan_id`
  );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.fan_id, r.n);
  return map;
}

/**
 * @deprecated Mantido só por compatibilidade com chamadores existentes (ex.:
 * DebriefForm, que reavalia fãs após o debrief). Hoje só recalcula o nível pelo
 * motor de pontuação — que já sobe E desce conforme o engajamento.
 */
export async function checkAndUpgradeFan(fanId: number): Promise<void> {
  await recomputeFanLevel(fanId);
}

export async function syncSuperfanFollowupTasks(): Promise<void> {
  try {
    const db = getDb();
    const superfans = await db.select<{ id: number; name: string }[]>(
      `SELECT f.id, f.name FROM fans f
       WHERE f.level IN ('Superfã', 'Embaixador')
         AND NOT EXISTS (
           SELECT 1 FROM fan_interactions fi
           WHERE fi.fan_id = f.id AND fi.date >= date('now', '-30 days')
         )`
    );
    for (const fan of superfans) {
      const existing = await db.select<{ id: number }[]>(
        `SELECT t.id FROM tasks t
         WHERE t.title LIKE 'Follow-up: %'
           AND t.status <> 'Concluída'
           AND t.description LIKE $1`,
        [`%fan_id:${fan.id}%`]
      );
      if (existing.length === 0) {
        const { createTask } = await import("@/modules/tasks/api");
        await createTask({
          title: `Follow-up: ${fan.name}`,
          description: `fan_id:${fan.id} — Superfã/Embaixador sem interação há 30+ dias`,
          category: "Pessoal",
          priority: "Média",
          status: "A fazer",
          due_date: null,
          gig_id: null,
          contact_id: null,
          tags: ["fã", "follow-up"],
        });
      }
    }
  } catch {
    // silently skip
  }
}

export async function deleteFanInteraction(id: number): Promise<void> {
  const db = getDb();
  // pega o fã ANTES de apagar pra poder recalcular o nível depois
  const rows = await db.select<{ fan_id: number }[]>(
    "SELECT fan_id FROM fan_interactions WHERE id = $1",
    [id]
  );
  await db.execute("DELETE FROM fan_interactions WHERE id = $1", [id]);
  const fanId = rows[0]?.fan_id;
  if (fanId != null) {
    // reconcilia o nível: apagar engajamento pode (corretamente) rebaixar o fã
    await recomputeFanLevel(fanId);
  }
}

export type FanStats = {
  embaixador: number;
  superfa: number;
  fa: number;
  quaseFa: number;
  possivelFa: number;
};

export async function getFanStats(): Promise<FanStats> {
  const db = getDb();
  const rows = await db.select<{ level: string; n: number }[]>(
    "SELECT level, COUNT(*) as n FROM fans GROUP BY level"
  );
  const stats: FanStats = { embaixador: 0, superfa: 0, fa: 0, quaseFa: 0, possivelFa: 0 };
  for (const r of rows) {
    if (r.level === "Embaixador") stats.embaixador = r.n;
    else if (r.level === "Superfã") stats.superfa = r.n;
    else if (r.level === "Fã") stats.fa = r.n;
    else if (r.level === "Quase fã") stats.quaseFa = r.n;
    else if (r.level === "Possível fã") stats.possivelFa = r.n;
  }
  return stats;
}

// ===== Fan Groups =====

export async function listFanGroups(): Promise<FanGroup[]> {
  const db = getDb();
  return db.select<FanGroup[]>("SELECT * FROM fan_groups ORDER BY name ASC");
}

export async function createFanGroup(input: FanGroupCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_groups (name, whatsapp_group, origin, notes) VALUES ($1, $2, $3, $4)`,
    [input.name, input.whatsapp_group, input.origin, input.notes]
  );
  return Number(res.lastInsertId);
}

export async function updateFanGroup(input: FanGroupUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...cols.map((k) => (rest as Record<string, unknown>)[k]), id];
  await db.execute(
    `UPDATE fan_groups SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteFanGroup(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_groups WHERE id = $1", [id]);
}

export async function listFanGroupMembers(groupId: number): Promise<FanGroupMember[]> {
  const db = getDb();
  return db.select<FanGroupMember[]>(
    "SELECT * FROM fan_group_members WHERE group_id = $1 ORDER BY id ASC",
    [groupId]
  );
}

export async function addFanGroupMember(
  groupId: number,
  fanId: number | null,
  name: string | null,
  notes: string | null
): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO fan_group_members (group_id, fan_id, name, notes) VALUES ($1, $2, $3, $4)",
    [groupId, fanId, name, notes]
  );
}

export async function removeFanGroupMember(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_group_members WHERE id = $1", [id]);
}

// ===== GIG presence (gig_fans) =====

export async function setGigFans(gigId: number, fanIds: number[]): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gig_fans WHERE gig_id = $1", [gigId]);
  for (const fanId of fanIds) {
    await db.execute(
      "INSERT OR IGNORE INTO gig_fans (gig_id, fan_id) VALUES ($1, $2)",
      [gigId, fanId]
    );
  }
  emitDataChanged();
}

export async function addGigFan(gigId: number, fanId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT OR IGNORE INTO gig_fans (gig_id, fan_id) VALUES ($1, $2)",
    [gigId, fanId]
  );
  emitDataChanged();
}

export async function listFansForGig(gigId: number): Promise<Fan[]> {
  const db = getDb();
  const rows = await db.select<FanRow[]>(
    `SELECT f.* FROM gig_fans gf
       JOIN fans f ON f.id = gf.fan_id
      WHERE gf.gig_id = $1
      ORDER BY f.name COLLATE NOCASE ASC`,
    [gigId]
  );
  return rows.map(rowToFan);
}

export async function gigCountForFan(fanId: number): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM gig_fans WHERE fan_id = $1",
    [fanId]
  );
  return rows[0]?.n ?? 0;
}

export async function topFansByPresence(
  limit = 10
): Promise<{ fan_id: number; name: string; gigs: number }[]> {
  const db = getDb();
  return db.select<{ fan_id: number; name: string; gigs: number }[]>(
    `SELECT gf.fan_id as fan_id, f.name as name, COUNT(*) as gigs
       FROM gig_fans gf
       JOIN fans f ON f.id = gf.fan_id
      GROUP BY gf.fan_id, f.name
      ORDER BY gigs DESC, f.name COLLATE NOCASE ASC
      LIMIT $1`,
    [limit]
  );
}

/** Lista os shows (gigs) que um fã assistiu, mais recentes primeiro. */
export async function listGigsForFan(
  fanId: number
): Promise<{ id: number; name: string | null; date: string | null; city: string | null }[]> {
  const db = getDb();
  return db.select<{ id: number; name: string | null; date: string | null; city: string | null }[]>(
    `SELECT g.id as id, g.name as name, g.date as date, g.city as city
       FROM gig_fans gf
       JOIN gigs g ON g.id = gf.gig_id
      WHERE gf.fan_id = $1
      ORDER BY g.date DESC NULLS LAST, g.id DESC`,
    [fanId]
  );
}

// ===== Perks / VIP / brindes (clube de fãs) =====

export async function listFanPerks(fanId: number): Promise<FanPerk[]> {
  const db = getDb();
  return db.select<FanPerk[]>(
    `SELECT * FROM fan_perks
      WHERE fan_id = $1
      ORDER BY CASE status WHEN 'Planejado' THEN 0 ELSE 1 END,
               COALESCE(date, '') DESC, created_at DESC`,
    [fanId]
  );
}

export async function addFanPerk(input: FanPerkCreateInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_perks (fan_id, category, name, status, date, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.fan_id, input.category, input.name, input.status, input.date, input.notes]
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updateFanPerk(input: FanPerkUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = [...cols.map((k) => (rest as Record<string, unknown>)[k]), id];
  await db.execute(
    `UPDATE fan_perks SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

/** Marca um perk/brinde como entregue, datando hoje se ainda não tiver data. */
export async function markFanPerkDelivered(id: number): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  await db.execute(
    `UPDATE fan_perks
        SET status = 'Entregue',
            date = COALESCE(date, $1),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $2`,
    [today, id]
  );
  emitDataChanged();
}

export async function deleteFanPerk(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fan_perks WHERE id = $1", [id]);
  emitDataChanged();
}

/** Quantos perks/brindes cada fã possui (para badges na lista). */
export async function listFanPerkCounts(): Promise<Map<number, number>> {
  const db = getDb();
  const rows = await db.select<{ fan_id: number; n: number }[]>(
    `SELECT fan_id, COUNT(*) as n FROM fan_perks GROUP BY fan_id`
  );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.fan_id, r.n);
  return map;
}

// ===== Ação → tarefa (cria tarefa já vinculada ao fã) =====

/**
 * Cria uma tarefa já vinculada ao fã (task_links entity_type "fan"). Usado pelas
 * ações rápidas do clube de fãs (reativar, agradecer presença, enviar brinde…).
 */
export async function createFanTask(
  fanId: number,
  title: string,
  opts?: { description?: string | null; due_date?: string | null }
): Promise<number> {
  const fan = await getFan(fanId);
  const { createTask, setTaskLinks } = await import("@/modules/tasks/api");
  const taskId = await createTask({
    title,
    description: opts?.description ?? null,
    category: "Pessoal",
    priority: "Média",
    status: "A fazer",
    due_date: opts?.due_date ?? null,
    gig_id: null,
    contact_id: null,
    tags: ["fã"],
  });
  await setTaskLinks(taskId, [
    { entity_type: "fan", entity_id: fanId, label: fan?.name ?? null },
  ]);
  emitDataChanged();
  return taskId;
}
