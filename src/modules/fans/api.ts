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
  FanLevelCriteria,
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
    " ORDER BY CASE level WHEN 'Superfã' THEN 0 WHEN 'Fã' THEN 1 ELSE 2 END, name COLLATE NOCASE ASC";
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

function nextLevel(current: string): string | null {
  if (current === "Possível fã") return "Fã";
  if (current === "Fã") return "Superfã";
  return null;
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

  // Special interaction: auto-upgrade one level
  if (autoSpecial) {
    const fanRows = await db.select<{ level: string }[]>(
      `SELECT level FROM fans WHERE id = $1`,
      [fanId]
    );
    const currentLevel = fanRows[0]?.level;
    if (currentLevel) {
      const upgraded = nextLevel(currentLevel);
      if (upgraded) {
        await db.execute(
          `UPDATE fans SET level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [upgraded, fanId]
        );
      }
    }
  }

  // Auto-upgrade rules from app_settings
  try {
    await checkAndUpgradeFan(fanId);
  } catch {
    // silently skip if rules not configured
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

async function meetsCriteria(
  db: ReturnType<typeof getDb>,
  fanId: number,
  criteria: FanLevelCriteria,
  fanCreatedAt: string,
  _fanLastInteractionAt: string | null
): Promise<boolean> {
  if (criteria.minInteractions != null) {
    const rows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM fan_interactions WHERE fan_id = $1`,
      [fanId]
    );
    if ((rows[0]?.n ?? 0) < criteria.minInteractions) return false;
  }
  if (criteria.minPresences != null) {
    const rows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM fan_interactions WHERE fan_id = $1 AND type = 'Presença'`,
      [fanId]
    );
    if ((rows[0]?.n ?? 0) < criteria.minPresences) return false;
  }
  if (criteria.minFeedbacks != null) {
    const rows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) as n FROM fan_interactions WHERE fan_id = $1 AND type = 'Feedback'`,
      [fanId]
    );
    if ((rows[0]?.n ?? 0) < criteria.minFeedbacks) return false;
  }
  if (criteria.minDaysSinceCreation != null) {
    const daysSince = Math.floor(
      (Date.now() - new Date(fanCreatedAt).getTime()) / 86400000
    );
    if (daysSince < criteria.minDaysSinceCreation) return false;
  }
  return true;
}

export async function checkAndUpgradeFan(fanId: number): Promise<void> {
  const db = getDb();
  const rulesRows = await db.select<{ value: string }[]>(
    `SELECT value FROM app_settings WHERE key = 'fan_upgrade_rules'`
  );
  if (!rulesRows[0]?.value) return;
  let rules: FanUpgradeRules;
  try {
    rules = JSON.parse(rulesRows[0].value) as FanUpgradeRules;
  } catch {
    return;
  }

  const fanRows = await db.select<{ level: string; created_at: string; last_interaction_at: string | null }[]>(
    `SELECT level, created_at, last_interaction_at FROM fans WHERE id = $1`,
    [fanId]
  );
  if (!fanRows[0]) return;
  let { level, created_at, last_interaction_at } = fanRows[0];

  // Check toFa criteria
  if (level === "Possível fã" && rules.toFa) {
    const ok = await meetsCriteria(db, fanId, rules.toFa, created_at, last_interaction_at);
    if (ok) {
      await db.execute(
        `UPDATE fans SET level = 'Fã', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [fanId]
      );
      level = "Fã";
    }
  }

  // Check toSuperfa criteria
  if (level === "Fã" && rules.toSuperfa) {
    const ok = await meetsCriteria(db, fanId, rules.toSuperfa, created_at, last_interaction_at);
    if (ok) {
      await db.execute(
        `UPDATE fans SET level = 'Superfã', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [fanId]
      );
      level = "Superfã";
    }
  }

  // Downgrade check
  if (rules.downgradeInactiveDays != null && last_interaction_at) {
    const daysSinceLast = Math.floor(
      (Date.now() - new Date(last_interaction_at).getTime()) / 86400000
    );
    if (daysSinceLast > rules.downgradeInactiveDays) {
      const downgraded = level === "Superfã" ? "Fã" : level === "Fã" ? "Possível fã" : null;
      if (downgraded) {
        await db.execute(
          `UPDATE fans SET level = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [downgraded, fanId]
        );
      }
    }
  }
}

export async function syncSuperfanFollowupTasks(): Promise<void> {
  try {
    const db = getDb();
    const superfans = await db.select<{ id: number; name: string }[]>(
      `SELECT f.id, f.name FROM fans f
       WHERE f.level = 'Superfã'
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
          description: `fan_id:${fan.id} — Superfã sem interação há 30+ dias`,
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
  await db.execute("DELETE FROM fan_interactions WHERE id = $1", [id]);
}

export type FanStats = {
  superfa: number;
  fa: number;
  possivelFa: number;
};

export async function getFanStats(): Promise<FanStats> {
  const db = getDb();
  const rows = await db.select<{ level: string; n: number }[]>(
    "SELECT level, COUNT(*) as n FROM fans GROUP BY level"
  );
  const stats: FanStats = { superfa: 0, fa: 0, possivelFa: 0 };
  for (const r of rows) {
    if (r.level === "Superfã") stats.superfa = r.n;
    else if (r.level === "Fã") stats.fa = r.n;
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
