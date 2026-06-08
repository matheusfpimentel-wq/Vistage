import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type { Gig } from "@/modules/gigs/types";
import type {
  Contact,
  ContactCreateInput,
  ContactInteraction,
  ContactStats,
  ContactType,
  ContactUpdateInput,
} from "./types";

type ContactRow = Omit<Contact, "types" | "tags"> & {
  types: string | null;
  tags: string | null;
};

function rowToContact(r: ContactRow): Contact {
  return {
    ...r,
    types: r.types ? (safeParse<ContactType[]>(r.types) ?? []) : [],
    tags: r.tags ? (safeParse<string[]>(r.tags) ?? []) : [],
  };
}

function safeParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export type ContactFilters = {
  type?: ContactType | "Todos";
  city?: string;
  search?: string;
};

export async function listContacts(
  filters: ContactFilters = {}
): Promise<Contact[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.type && filters.type !== "Todos") {
    params.push(`%${filters.type}%`);
    where.push(`(types LIKE $${params.length})`);
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
    `SELECT * FROM contacts` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY name COLLATE NOCASE ASC";
  const rows = await db.select<ContactRow[]>(sql, params);
  return rows.map(rowToContact);
}

export async function getContact(id: number): Promise<Contact | null> {
  const db = getDb();
  const rows = await db.select<ContactRow[]>(
    "SELECT * FROM contacts WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToContact(rows[0]) : null;
}

export async function createContact(input: ContactCreateInput): Promise<number> {
  const db = getDb();
  const payload = {
    ...input,
    types: JSON.stringify(input.types ?? []),
    tags: JSON.stringify(input.tags ?? []),
  };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO contacts (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  emitDataChanged();
  return id;
}

export async function updateContact(input: ContactUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.types)) payload.types = JSON.stringify(payload.types);
  if (Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE contacts SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

export async function deleteContact(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM contacts WHERE id = $1", [id]);
  try {
    const { removeContactFromParties } = await import("@/modules/parties/api");
    await removeContactFromParties(id);
  } catch { /* não interrompe */ }
  emitDataChanged();
}

// ============================================================
// Interações
// ============================================================

export async function listInteractions(
  contactId: number
): Promise<ContactInteraction[]> {
  const db = getDb();
  return db.select<ContactInteraction[]>(
    `SELECT * FROM contact_interactions
     WHERE contact_id = $1
     ORDER BY date DESC, created_at DESC`,
    [contactId]
  );
}

export async function addInteraction(
  contactId: number,
  date: string,
  note: string
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO contact_interactions (contact_id, date, note)
     VALUES ($1, $2, $3)`,
    [contactId, date, note]
  );
  await db.execute(
    `UPDATE contacts
     SET last_interaction_at = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND (last_interaction_at IS NULL OR last_interaction_at < $1)`,
    [date, contactId]
  );
  return Number(res.lastInsertId);
}

export async function deleteInteraction(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM contact_interactions WHERE id = $1", [id]);
}

// ============================================================
// Stats (derivadas de GIGs)
// ============================================================

export async function getContactStats(contactId: number): Promise<ContactStats> {
  const db = getDb();
  const rows = await db.select<
    { n: number; total: number | null; last: string | null }[]
  >(
    `SELECT COUNT(*) as n,
            SUM(cache_amount) as total,
            MAX(date) as last
       FROM gigs
      WHERE promoter_contact_id = $1`,
    [contactId]
  );
  const r = rows[0];
  return {
    gigCount: r?.n ?? 0,
    totalRevenue: r?.total ?? 0,
    lastGigDate: r?.last ?? null,
  };
}

export async function listGigsByContact(contactId: number): Promise<Gig[]> {
  const db = getDb();
  return db.select<Gig[]>(
    `SELECT * FROM gigs WHERE promoter_contact_id = $1 ORDER BY date DESC`,
    [contactId]
  );
}
