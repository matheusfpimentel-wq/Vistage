import { getDb } from "@/lib/db";
import type { Gig, GigCreateInput, GigUpdateInput, GigStatus } from "./types";

const GIG_COLUMNS = [
  "id",
  "date",
  "start_time",
  "end_time",
  "event_name",
  "venue_name",
  "venue_city",
  "venue_address",
  "venue_id",
  "fans_present",
  "promoter_contact_id",
  "day_contact_name",
  "day_contact_phone",
  "estimated_audience",
  "cache_amount",
  "script_file_path",
  "banner_file_path",
  "extra_flyer_paths",
  "opportunities",
  "briefing",
  "set_concept",
  "concrete_goals",
  "targets",
  "status",
  "transport",
  "departure_time",
  "equipment_provided",
  "equipment_to_bring",
  "related_expenses",
  "payment_method",
  "payment_status",
  "payment_due_date",
  "invoice_file_path",
  "general_notes",
  "debrief_strengths",
  "debrief_weaknesses",
  "debrief_learnings",
  "debrief_opportunities_used",
  "debrief_future_opportunities",
  "debrief_promoter_feedback",
  "debrief_technical_notes",
  "debrief_media_content",
  "rating_charisma",
  "rating_charisma_note",
  "rating_technique",
  "rating_technique_note",
  "rating_repertoire",
  "rating_repertoire_note",
  "debrief_completed_at",
  "debrief_pending",
  "gcal_event_id",
  "main_goal",
  "prep_state",
  "main_goal_task_id",
  "prep_task_id",
  "created_at",
  "updated_at",
] as const;

const SELECT_ALL = `SELECT ${GIG_COLUMNS.join(", ")} FROM gigs`;

export type GigFilters = {
  status?: GigStatus | "Todas";
  fromDate?: string;
  toDate?: string;
  search?: string;
  promoterContactId?: number;
};

export async function listGigs(filters: GigFilters = {}): Promise<Gig[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "Todas") {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`date <= $${params.length}`);
  }
  if (filters.promoterContactId) {
    params.push(filters.promoterContactId);
    where.push(`promoter_contact_id = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q);
    const i = params.length;
    where.push(
      `(venue_name LIKE $${i - 2} OR venue_city LIKE $${i - 1} OR briefing LIKE $${i})`
    );
  }

  const sql =
    SELECT_ALL +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY date DESC, start_time DESC";
  return db.select<Gig[]>(sql, params);
}

export async function getGig(id: number): Promise<Gig | null> {
  const db = getDb();
  const rows = await db.select<Gig[]>(`${SELECT_ALL} WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createGig(input: GigCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO gigs (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateGig(input: GigUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE gigs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteGig(id: number): Promise<void> {
  const db = getDb();
  // mantém o financeiro integrado: ao excluir a GIG, apaga também a receita
  // vinculada (senão vira lançamento fantasma com gig_id nulo).
  await db.execute(
    "DELETE FROM finance_transactions WHERE gig_id = $1",
    [id]
  );
  await db.execute("DELETE FROM gigs WHERE id = $1", [id]);
}

// ============================================================
// Debrief — rascunhos autosalvos
// ============================================================

export async function loadDebriefDraft(
  gigId: number
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const rows = await db.select<{ payload: string }[]>(
    "SELECT payload FROM gig_debrief_drafts WHERE gig_id = $1",
    [gigId]
  );
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].payload);
  } catch {
    return null;
  }
}

export async function saveDebriefDraft(
  gigId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO gig_debrief_drafts (gig_id, payload, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(gig_id) DO UPDATE SET
       payload = excluded.payload,
       updated_at = CURRENT_TIMESTAMP`,
    [gigId, JSON.stringify(payload)]
  );
}

export async function clearDebriefDraft(gigId: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gig_debrief_drafts WHERE gig_id = $1", [gigId]);
}

// ============================================================
// Aggregates / Insights
// ============================================================

export type GigInsights = {
  totalCount: number;
  totalCache: number;
  averageCache: number | null;
  averageRating: number | null;
  pendingDebriefs: number;
  byStatus: Record<GigStatus, number>;
  byMonth: { month: string; count: number; revenue: number; avgRating: number | null }[];
  topVenues: { venue_name: string; gigs: number; avg_rating: number | null }[];
};

export async function loadInsights(): Promise<GigInsights> {
  const db = getDb();
  const all = await db.select<Gig[]>(SELECT_ALL);

  const byStatus: Record<GigStatus, number> = {
    Proposta: 0,
    Confirmada: 0,
    Concluída: 0,
    Cancelada: 0,
  };
  let totalCache = 0;
  let cacheCount = 0;
  const ratings: number[] = [];
  let pendingDebriefs = 0;
  const monthBuckets = new Map<
    string,
    { count: number; revenue: number; ratings: number[] }
  >();
  const venueBuckets = new Map<string, { gigs: number; ratings: number[] }>();

  for (const g of all) {
    byStatus[g.status] += 1;

    if (typeof g.cache_amount === "number") {
      totalCache += g.cache_amount;
      cacheCount += 1;
    }

    const gigRatings = [g.rating_charisma, g.rating_technique, g.rating_repertoire]
      .filter((r): r is number => typeof r === "number");
    const avgGig =
      gigRatings.length > 0
        ? gigRatings.reduce((s, r) => s + r, 0) / gigRatings.length
        : null;
    if (avgGig !== null) ratings.push(avgGig);

    if (g.debrief_pending === 1) pendingDebriefs += 1;

    const month = g.date.slice(0, 7); // YYYY-MM
    const mb = monthBuckets.get(month) ?? { count: 0, revenue: 0, ratings: [] };
    mb.count += 1;
    if (typeof g.cache_amount === "number") mb.revenue += g.cache_amount;
    if (avgGig !== null) mb.ratings.push(avgGig);
    monthBuckets.set(month, mb);

    const vb = venueBuckets.get(g.venue_name) ?? { gigs: 0, ratings: [] };
    vb.gigs += 1;
    if (avgGig !== null) vb.ratings.push(avgGig);
    venueBuckets.set(g.venue_name, vb);
  }

  const byMonth = Array.from(monthBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      count: b.count,
      revenue: b.revenue,
      avgRating:
        b.ratings.length > 0
          ? b.ratings.reduce((s, r) => s + r, 0) / b.ratings.length
          : null,
    }));

  const topVenues = Array.from(venueBuckets.entries())
    .map(([venue_name, b]) => ({
      venue_name,
      gigs: b.gigs,
      avg_rating:
        b.ratings.length > 0
          ? b.ratings.reduce((s, r) => s + r, 0) / b.ratings.length
          : null,
    }))
    .sort((a, b) => {
      // venues com avaliação primeiro, depois por nota desc, depois por nº de gigs desc
      const ar = a.avg_rating ?? -1;
      const br = b.avg_rating ?? -1;
      if (br !== ar) return br - ar;
      return b.gigs - a.gigs;
    })
    .slice(0, 5);

  return {
    totalCount: all.length,
    totalCache,
    averageCache: cacheCount > 0 ? totalCache / cacheCount : null,
    averageRating:
      ratings.length > 0
        ? ratings.reduce((s, r) => s + r, 0) / ratings.length
        : null,
    pendingDebriefs,
    byStatus,
    byMonth,
    topVenues,
  };
}

export async function countPendingDebriefs(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) as n FROM gigs WHERE debrief_pending = 1"
  );
  return rows[0]?.n ?? 0;
}

// ============================================================
// Set list — gig_tracks (N:N)
// ============================================================

export async function listGigTracks(gigId: number): Promise<number[]> {
  const db = getDb();
  const rows = await db.select<{ track_id: number }[]>(
    "SELECT track_id FROM gig_tracks WHERE gig_id = $1",
    [gigId]
  );
  return rows.map((r) => r.track_id);
}

export async function setGigTracks(
  gigId: number,
  trackIds: number[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM gig_tracks WHERE gig_id = $1", [gigId]);
  for (const tid of trackIds) {
    await db.execute(
      "INSERT OR IGNORE INTO gig_tracks (gig_id, track_id) VALUES ($1, $2)",
      [gigId, tid]
    );
  }
}

export async function createGigPrepTask(gig: Gig): Promise<number> {
  const { createTask } = await import("@/modules/tasks/api");
  const title = gig.event_name
    ? `Preparação - ${gig.event_name}`
    : `Preparação - GIG ${gig.date ?? "sem data"}`;
  return createTask({
    title,
    description: gig.venue_name ?? null,
    category: "GIG",
    gig_id: gig.id,
    contact_id: null,
    priority: "Alta",
    status: "A fazer",
    due_date: gig.date,
    tags: ["gig", "preparação"],
  });
}
