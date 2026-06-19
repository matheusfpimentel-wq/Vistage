import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type { Gig } from "@/modules/gigs/types";
import {
  deriveRelationshipTypes,
  type Contact,
  type ContactCreateInput,
  type ContactInteraction,
  type ContactRelationshipType,
  type ContactStats,
  type ContactType,
  type ContactUpdateInput,
  type RelationshipData,
} from "./types";

type ContactRow = Omit<Contact, "types" | "tags" | "relationship_types" | "relationship_data"> & {
  types: string | null;
  tags: string | null;
  relationship_types: string | null;
  relationship_data: string | null;
};

function rowToContact(r: ContactRow): Contact {
  const types = r.types ? (safeParse<ContactType[]>(r.types) ?? []) : [];
  const relationship_types =
    r.relationship_types != null
      ? (safeParse<ContactRelationshipType[]>(r.relationship_types) ?? [])
      : deriveRelationshipTypes(types);
  return {
    ...r,
    types,
    tags: r.tags ? (safeParse<string[]>(r.tags) ?? []) : [],
    relationship_types,
    relationship_data: r.relationship_data
      ? (safeParse<RelationshipData>(r.relationship_data) ?? {})
      : {},
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

  // Ordenação padrão: prioridade alta → baixa (rating maior primeiro),
  // depois nome. A UI pode reordenar em memória conforme a coluna escolhida.
  const sql =
    `SELECT * FROM contacts` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY (rating IS NULL) ASC, rating DESC, name COLLATE NOCASE ASC";
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
    relationship_types: JSON.stringify(input.relationship_types ?? []),
    relationship_data: JSON.stringify(input.relationship_data ?? {}),
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
  if (Array.isArray(payload.relationship_types))
    payload.relationship_types = JSON.stringify(payload.relationship_types);
  if (payload.relationship_data && typeof payload.relationship_data === "object")
    payload.relationship_data = JSON.stringify(payload.relationship_data);
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

/** Cria/atualiza o fã espelho de um contato (idempotente por contact_id). */
export async function upsertFanMirror(contact: Contact): Promise<void> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM fans WHERE contact_id = $1 LIMIT 1",
    [contact.id]
  );
  if (existing[0]) {
    await db.execute(
      `UPDATE fans SET name = $1, instagram = $2, email = $3, phone = $4, city = $5,
         updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [contact.name, contact.instagram ?? null, contact.email ?? null, contact.phone ?? null, contact.city ?? null, existing[0].id]
    );
  } else {
    await db.execute(
      `INSERT INTO fans (name, instagram, email, phone, city, notes, tags, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, '[]', $7)`,
      [contact.name, contact.instagram ?? null, contact.email ?? null, contact.phone ?? null, contact.city ?? null, contact.notes ?? null, contact.id]
    );
  }
  emitDataChanged();
}

/** Remove o fã espelho de um contato (desselecionar o papel Fã). */
export async function removeFanForContact(contactId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM fans WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  if (!rows[0]) return;
  const { deleteFan } = await import("@/modules/fans/api");
  await deleteFan(rows[0].id);
}

/** Remove o aluno espelho de um contato (desselecionar o papel Aluno). */
export async function removeStudentForContact(contactId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM students WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  if (!rows[0]) return;
  const { deleteStudent } = await import("@/modules/classes/api");
  await deleteStudent(rows[0].id);
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

// ============================================================
// Personas espelho — fornecedor / aluno vinculados ao contato
// ============================================================

/** Indica se o contato já possui personas espelho criadas. */
export async function getMirrorState(
  contactId: number
): Promise<{ supplier: boolean; student: boolean; fan: boolean }> {
  const db = getDb();
  const sup = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  const stu = await db.select<{ id: number }[]>(
    "SELECT id FROM students WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  const fan = await db.select<{ id: number }[]>(
    "SELECT id FROM fans WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  return { supplier: sup.length > 0, student: stu.length > 0, fan: fan.length > 0 };
}

/**
 * Cria/atualiza o fornecedor espelho de um contato (idempotente por contact_id).
 * Mantém os dados básicos em sincronia, sem sobrescrever campos próprios do
 * fornecedor (categoria, etc.).
 */
export async function upsertSupplierMirror(contact: Contact): Promise<void> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE contact_id = $1 LIMIT 1",
    [contact.id]
  );
  if (existing[0]) {
    await db.execute(
      `UPDATE suppliers SET
         name = $1, contact_name = $2, phone = $3, email = $4,
         instagram = $5, city = $6, notes = $7, updated_at = datetime('now')
       WHERE id = $8`,
      [
        contact.name,
        contact.name,
        contact.phone ?? null,
        contact.email ?? null,
        contact.instagram ?? null,
        contact.city ?? null,
        contact.notes ?? null,
        existing[0].id,
      ]
    );
  } else {
    await db.execute(
      `INSERT INTO suppliers
         (name, category, contact_name, phone, email, instagram, city, notes, rating, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        contact.name,
        null,
        contact.name,
        contact.phone ?? null,
        contact.email ?? null,
        contact.instagram ?? null,
        contact.city ?? null,
        contact.notes ?? null,
        null,
        contact.id,
      ]
    );
  }
  emitDataChanged();
}

/**
 * Cria/atualiza o aluno espelho de um contato (idempotente por contact_id).
 * Mantém os dados básicos em sincronia, sem tocar em campos próprios do aluno.
 */
export async function upsertStudentMirror(contact: Contact): Promise<void> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM students WHERE contact_id = $1 LIMIT 1",
    [contact.id]
  );
  if (existing[0]) {
    await db.execute(
      `UPDATE students SET
         name = $1, phone = $2, email = $3, instagram = $4, city = $5,
         notes = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [
        contact.name,
        contact.phone ?? null,
        contact.email ?? null,
        contact.instagram ?? null,
        contact.city ?? null,
        contact.notes ?? null,
        existing[0].id,
      ]
    );
  } else {
    await db.execute(
      `INSERT INTO students
         (name, phone, email, instagram, city, acquisition, notes, default_rate, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        contact.name,
        contact.phone ?? null,
        contact.email ?? null,
        contact.instagram ?? null,
        contact.city ?? null,
        null,
        contact.notes ?? null,
        null,
        contact.id,
      ]
    );
  }
  emitDataChanged();
}
