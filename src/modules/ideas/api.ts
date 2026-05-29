import { getDb } from "@/lib/db";
import type {
  Idea,
  IdeaCategory,
  IdeaConversion,
  IdeaCreateInput,
  IdeaHeat,
  IdeaMaturation,
  IdeaUpdateInput,
} from "./types";

type IdeaRow = Omit<Idea, "tags"> & { tags: string | null };

function rowToIdea(r: IdeaRow): Idea {
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

export type IdeaFilters = {
  category?: IdeaCategory | "Todas";
  maturation?: IdeaMaturation | "Todas";
  heat?: IdeaHeat | "all";
  search?: string;
};

export async function listIdeas(filters: IdeaFilters = {}): Promise<Idea[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.category && filters.category !== "Todas") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters.maturation && filters.maturation !== "Todas") {
    params.push(filters.maturation);
    where.push(`maturation = $${params.length}`);
  }
  if (filters.heat && filters.heat !== "all") {
    params.push(filters.heat);
    where.push(`heat = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q);
    const i = params.length;
    where.push(`(title LIKE $${i - 1} OR body LIKE $${i})`);
  }

  const sql =
    "SELECT * FROM ideas" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY heat DESC, updated_at DESC";
  const rows = await db.select<IdeaRow[]>(sql, params);
  return rows.map(rowToIdea);
}

export async function getIdea(id: number): Promise<Idea | null> {
  const db = getDb();
  const rows = await db.select<IdeaRow[]>("SELECT * FROM ideas WHERE id = $1", [id]);
  return rows[0] ? rowToIdea(rows[0]) : null;
}

export async function createIdea(input: IdeaCreateInput): Promise<number> {
  const db = getDb();
  const payload = { ...input, tags: JSON.stringify(input.tags ?? []) };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO ideas (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateIdea(input: IdeaUpdateInput): Promise<void> {
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
    `UPDATE ideas SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteIdea(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM ideas WHERE id = $1", [id]);
}

/** Marca a ideia como Convertida e guarda o alvo. */
export async function markIdeaAsConverted(
  ideaId: number,
  to: IdeaConversion,
  newId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE ideas SET converted_to = $1, converted_id = $2, maturation = 'Convertida',
                      updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
    [to, newId, ideaId]
  );
}
