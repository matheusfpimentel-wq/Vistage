import { getDb } from "@/lib/db";
import type { Gig } from "@/modules/gigs/types";
import type {
  Venue,
  VenueCreateInput,
  VenueStats,
  VenueUpdateInput,
} from "./types";

export type VenueFilters = {
  city?: string;
  search?: string;
};

export async function listVenues(filters: VenueFilters = {}): Promise<Venue[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.city && filters.city.trim().length > 0) {
    params.push(`%${filters.city.trim()}%`);
    where.push(`city LIKE $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q);
    const i = params.length;
    where.push(
      `(name LIKE $${i - 2} OR owner_name LIKE $${i - 1} OR notes LIKE $${i})`
    );
  }

  const sql =
    "SELECT * FROM venues" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY name COLLATE NOCASE ASC";
  return db.select<Venue[]>(sql, params);
}

export async function getVenue(id: number): Promise<Venue | null> {
  const db = getDb();
  const rows = await db.select<Venue[]>("SELECT * FROM venues WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createVenue(input: VenueCreateInput): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO venues (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateVenue(input: VenueUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE venues SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteVenue(id: number): Promise<void> {
  const db = getDb();
  // GIGs vinculadas perdem o venue_id (mantemos venue_name como fallback).
  await db.execute("UPDATE gigs SET venue_id = NULL WHERE venue_id = $1", [id]);
  await db.execute("DELETE FROM venues WHERE id = $1", [id]);
}

export async function getVenueStats(venueId: number): Promise<VenueStats> {
  const db = getDb();
  const rows = await db.select<
    {
      n: number;
      total: number | null;
      last: string | null;
      avg_c: number | null;
      avg_t: number | null;
      avg_r: number | null;
    }[]
  >(
    `SELECT COUNT(*) as n,
            SUM(cache_amount) as total,
            MAX(date) as last,
            AVG(rating_charisma) as avg_c,
            AVG(rating_technique) as avg_t,
            AVG(rating_repertoire) as avg_r
       FROM gigs WHERE venue_id = $1`,
    [venueId]
  );
  const r = rows[0];
  const ratings = [r.avg_c, r.avg_t, r.avg_r].filter(
    (v): v is number => typeof v === "number"
  );
  return {
    gigCount: r.n ?? 0,
    totalRevenue: r.total ?? 0,
    lastGigDate: r.last ?? null,
    avgRating:
      ratings.length > 0 ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null,
  };
}

export async function listGigsByVenue(venueId: number): Promise<Gig[]> {
  const db = getDb();
  return db.select<Gig[]>(
    "SELECT * FROM gigs WHERE venue_id = $1 ORDER BY date DESC",
    [venueId]
  );
}

export async function geocodeVenue(
  venue: Pick<Venue, "id" | "name" | "city" | "state" | "country">
): Promise<{ lat: number; lng: number } | null> {
  const parts = [venue.name, venue.city, venue.state, venue.country].filter(Boolean);
  const q = encodeURIComponent(parts.join(", "));
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`,
      { headers: { "User-Agent": "MusicGest/1.0" } }
    );
    const data = await resp.json() as { lat: string; lon: string }[];
    if (!data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export async function saveVenueCoords(
  id: number,
  lat: number,
  lng: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE venues SET lat = $1, lng = $2, geocoded_at = CURRENT_TIMESTAMP WHERE id = $3",
    [lat, lng, id]
  );
}
