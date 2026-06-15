import { getDb } from "@/lib/db";
import type {
  Fan,
  FanCreateInput,
  FanInteraction,
  FanLevel,
  FanUpdateInput,
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
  return Number(res.lastInsertId);
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
}

export async function deleteFan(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM fans WHERE id = $1", [id]);
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

export async function addFanInteraction(
  fanId: number,
  date: string,
  note: string
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO fan_interactions (fan_id, date, note) VALUES ($1, $2, $3)`,
    [fanId, date, note]
  );
  await db.execute(
    `UPDATE fans
        SET last_interaction_at = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
    [date, fanId]
  );
  return Number(res.lastInsertId);
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
