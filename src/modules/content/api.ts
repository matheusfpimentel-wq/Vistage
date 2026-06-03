import { getDb } from "@/lib/db";
import type {
  Content,
  ContentCreateInput,
  ContentFormat,
  ContentNetwork,
  ContentScene,
  ContentSceneInput,
  ContentSnapshot,
  ContentSnapshotInput,
  ContentStatus,
  ContentUpdateInput,
} from "./types";

type ContentRow = Omit<Content, "networks"> & { networks: string | null };

function rowToContent(r: ContentRow): Content {
  let networks: ContentNetwork[] = [];
  if (r.networks) {
    try {
      networks = JSON.parse(r.networks) as ContentNetwork[];
    } catch {
      networks = [];
    }
  }
  return { ...r, networks };
}

export type ContentFilters = {
  status?: ContentStatus | "Todos";
  format?: ContentFormat | "Todos";
  network?: ContentNetwork | "Todas";
  search?: string;
  month?: string;
};

export async function listContent(
  filters: ContentFilters = {}
): Promise<Content[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "Todos") {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.format && filters.format !== "Todos") {
    params.push(filters.format);
    where.push(`format = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q);
    const i = params.length;
    where.push(
      `(title LIKE $${i - 2} OR purpose LIKE $${i - 1} OR script LIKE $${i})`
    );
  }
  if (filters.month) {
    params.push(`${filters.month}-01`, `${filters.month}-31`);
    const i = params.length;
    where.push(
      `(publish_date BETWEEN $${i - 1} AND $${i} OR due_date BETWEEN $${i - 1} AND $${i})`
    );
  }

  const sql =
    "SELECT * FROM content" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY CASE WHEN publish_date IS NULL THEN 1 ELSE 0 END, publish_date ASC, due_date ASC, id DESC";
  let rows = (await db.select<ContentRow[]>(sql, params)).map(rowToContent);

  // filtro por network (JSON multi-valor) feito em JS
  if (filters.network && filters.network !== "Todas") {
    rows = rows.filter((c) => c.networks.includes(filters.network as ContentNetwork));
  }
  return rows;
}

export async function getContent(id: number): Promise<Content | null> {
  const db = getDb();
  const rows = await db.select<ContentRow[]>(
    "SELECT * FROM content WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToContent(rows[0]) : null;
}

export async function createContent(input: ContentCreateInput): Promise<number> {
  const db = getDb();
  const payload = { ...input, networks: JSON.stringify(input.networks ?? []) };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO content (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateContent(input: ContentUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.networks))
    payload.networks = JSON.stringify(payload.networks);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE content SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteContent(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM content WHERE id = $1", [id]);
}

export type ContentStats = {
  total: number;
  byStatus: Record<ContentStatus, number>;
  publishedThisMonth: number;
};

export async function getContentStats(): Promise<ContentStats> {
  const db = getDb();
  const rows = await db.select<{ status: ContentStatus; n: number }[]>(
    "SELECT status, COUNT(*) as n FROM content GROUP BY status"
  );
  const month = new Date().toISOString().slice(0, 7);
  const publishedRows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM content
      WHERE status = 'Publicado'
        AND COALESCE(published_at, publish_date) LIKE $1`,
    [`${month}%`]
  );

  const byStatus: Record<ContentStatus, number> = {
    Ideia: 0,
    Roteiro: 0,
    Gravando: 0,
    Edição: 0,
    Pronto: 0,
    Publicado: 0,
    Arquivado: 0,
  };
  let total = 0;
  for (const r of rows) {
    byStatus[r.status] = r.n;
    total += r.n;
  }
  return {
    total,
    byStatus,
    publishedThisMonth: publishedRows[0]?.n ?? 0,
  };
}

// ============================================================
// Snapshots de métricas (retratos com data de captura)
// ============================================================

export async function listContentSnapshots(
  contentId: number
): Promise<ContentSnapshot[]> {
  const db = getDb();
  return db.select<ContentSnapshot[]>(
    "SELECT * FROM content_snapshots WHERE content_id = $1 ORDER BY captured_at DESC, id DESC",
    [contentId]
  );
}

export async function addContentSnapshot(
  input: ContentSnapshotInput
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO content_snapshots
       (content_id, captured_at, metric_views, metric_likes, metric_comments, metric_shares, metric_saves)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.content_id,
      input.captured_at,
      input.metric_views,
      input.metric_likes,
      input.metric_comments,
      input.metric_shares,
      input.metric_saves,
    ]
  );
  // mantém os campos "atuais" do content com a captura mais recente
  await syncLatestSnapshotToContent(input.content_id);
  return Number(res.lastInsertId);
}

export async function deleteContentSnapshot(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ content_id: number }[]>(
    "SELECT content_id FROM content_snapshots WHERE id = $1",
    [id]
  );
  await db.execute("DELETE FROM content_snapshots WHERE id = $1", [id]);
  if (rows[0]) await syncLatestSnapshotToContent(rows[0].content_id);
}

// ============================================================
// Cenas do roteiro
// ============================================================

type ContentSceneRow = Omit<ContentScene, "equipment" | "materials"> & {
  equipment: string | null;
  materials: string | null;
};

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export async function listScenes(contentId: number): Promise<ContentScene[]> {
  const db = getDb();
  const rows = await db.select<ContentSceneRow[]>(
    "SELECT * FROM content_scenes WHERE content_id = $1 ORDER BY position ASC, id ASC",
    [contentId]
  );
  return rows.map((r) => ({
    ...r,
    equipment: parseStringArray(r.equipment),
    materials: parseStringArray(r.materials),
  }));
}

export async function replaceScenes(
  contentId: number,
  scenes: ContentSceneInput[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM content_scenes WHERE content_id = $1", [
    contentId,
  ]);
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    await db.execute(
      `INSERT INTO content_scenes
         (content_id, position, title, description, equipment, materials, scenery)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        contentId,
        i,
        s.title,
        s.description,
        JSON.stringify(s.equipment ?? []),
        JSON.stringify(s.materials ?? []),
        s.scenery,
      ]
    );
  }
}

/** Copia a captura mais recente pros campos metric_* do content (compat com listas). */
async function syncLatestSnapshotToContent(contentId: number): Promise<void> {
  const db = getDb();
  const latest = await db.select<ContentSnapshot[]>(
    "SELECT * FROM content_snapshots WHERE content_id = $1 ORDER BY captured_at DESC, id DESC LIMIT 1",
    [contentId]
  );
  const s = latest[0];
  await db.execute(
    `UPDATE content SET metric_views = $1, metric_likes = $2, metric_comments = $3,
                        metric_shares = $4, metric_saves = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6`,
    [
      s?.metric_views ?? null,
      s?.metric_likes ?? null,
      s?.metric_comments ?? null,
      s?.metric_shares ?? null,
      s?.metric_saves ?? null,
      contentId,
    ]
  );
}
