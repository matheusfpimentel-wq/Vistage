import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Supplier,
  SupplierCategory,
  SupplierCreateInput,
  SupplierService,
  SupplierUpdateInput,
} from "./types";

export type SupplierFilters = {
  search?: string;
  category?: SupplierCategory | "Todos";
};

/**
 * Vínculos fornecedor→contato (suppliers.contact_id). Usado pela visão unificada
 * "Pessoas" para saber quais fornecedores já são um contato (papel duplo) e
 * quais são fornecedores puros.
 */
export async function listSupplierContactLinks(): Promise<
  { id: number; contact_id: number | null }[]
> {
  const db = getDb();
  return db.select<{ id: number; contact_id: number | null }[]>(
    "SELECT id, contact_id FROM suppliers"
  );
}

/** id do fornecedor espelho de um contato, se existir (papel Fornecedor). */
export async function getSupplierIdForContact(contactId: number): Promise<number | null> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  return rows[0]?.id ?? null;
}

/** Vincula um fornecedor a um contato (papel duplo na visão Pessoas). */
export async function setSupplierContact(
  supplierId: number,
  contactId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE suppliers SET contact_id = $1, updated_at = datetime('now') WHERE id = $2",
    [contactId, supplierId]
  );
  emitDataChanged();
}

export async function listSuppliers(filters: SupplierFilters = {}): Promise<Supplier[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q);
    const i = params.length;
    where.push(
      `(name LIKE $${i - 3} OR contact_name LIKE $${i - 2} OR email LIKE $${i - 1} OR city LIKE $${i})`
    );
  }

  if (filters.category && filters.category !== "Todos") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }

  const sql =
    `SELECT * FROM suppliers` +
    (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY name ASC`;

  return db.select<Supplier[]>(sql, params);
}

export async function getSupplier(id: number): Promise<Supplier | null> {
  const db = getDb();
  const rows = await db.select<Supplier[]>("SELECT * FROM suppliers WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createSupplier(input: SupplierCreateInput): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    `INSERT INTO suppliers (name, category, contact_name, phone, email, instagram, city, notes, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.name,
      input.category ?? null,
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.instagram ?? null,
      input.city ?? null,
      input.notes ?? null,
      input.rating ?? null,
    ]
  );
  return result.lastInsertId as number;
}

export async function updateSupplier(input: SupplierUpdateInput): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE suppliers SET
      name = $1, category = $2, contact_name = $3, phone = $4,
      email = $5, instagram = $6, city = $7, notes = $8, rating = $9,
      updated_at = datetime('now')
     WHERE id = $10`,
    [
      input.name ?? "",
      input.category ?? null,
      input.contact_name ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.instagram ?? null,
      input.city ?? null,
      input.notes ?? null,
      input.rating ?? null,
      input.id,
    ]
  );
}

export async function deleteSupplier(id: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE party_budget_items SET supplier_id = NULL WHERE supplier_id = $1",
    [id]
  );
  await db.execute("DELETE FROM suppliers WHERE id = $1", [id]);
  const { unlinkTasksFromEntity } = await import("@/modules/tasks/api");
  await unlinkTasksFromEntity("supplier", id);
  try {
    const { removeSupplierFromParties } = await import("@/modules/parties/api");
    await removeSupplierFromParties(id);
  } catch { /* não interrompe */ }
}

/**
 * Remove o papel de fornecedor de uma pessoa (apaga o fornecedor espelho).
 * Só permitido se a aba Serviços estiver vazia — espelha a regra de negócio:
 * "ao esvaziar Serviços, dá pra tirar a pessoa da categoria Fornecedor".
 */
export async function removeSupplierForContact(
  contactId: number
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM suppliers WHERE contact_id = $1 LIMIT 1",
    [contactId]
  );
  if (!rows[0]) return { ok: true };
  const supplierId = rows[0].id;
  const svc = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM supplier_services WHERE supplier_id = $1",
    [supplierId]
  );
  if ((svc[0]?.n ?? 0) > 0) {
    return {
      ok: false,
      reason: "Há serviços cadastrados. Esvazie a aba Serviços antes de remover o papel de fornecedor.",
    };
  }
  await deleteSupplier(supplierId);
  return { ok: true };
}

export async function getSupplierSpend(
  supplierId: number
): Promise<{ total: number; itemCount: number; parties: number }> {
  const db = getDb();
  const rows = await db.select<{ total: number; itemCount: number; parties: number }[]>(
    `SELECT COALESCE(SUM(COALESCE(actual_amount, projected_amount, 0)), 0) AS total,
            COUNT(*) AS itemCount,
            COUNT(DISTINCT party_id) AS parties
     FROM party_budget_items
     WHERE supplier_id = $1`,
    [supplierId]
  );
  const r = rows[0];
  return {
    total: r?.total ?? 0,
    itemCount: r?.itemCount ?? 0,
    parties: r?.parties ?? 0,
  };
}

type PartyRow = {
  id: number;
  title: string;
  date: string | null;
  status: string;
  team: string | null;
};

type SupplierParty = {
  id: number;
  title: string;
  date: string | null;
  status: string;
  role: string | null;
  amount_cents: number | null;
};

export async function listPartiesBySupplier(supplierId: number): Promise<SupplierParty[]> {
  const db = getDb();
  const rows = await db.select<PartyRow[]>(
    "SELECT id, title, date, status, team FROM parties"
  );

  const result: SupplierParty[] = [];

  for (const row of rows) {
    if (!row.team) continue;
    let members: { role?: string; amount_cents?: number; supplier_id?: number | null }[];
    try {
      const parsed = JSON.parse(row.team) as unknown;
      members = Array.isArray(parsed) ? (parsed as typeof members) : [];
    } catch {
      continue;
    }

    const matches = members.filter((m) => m.supplier_id === supplierId);
    if (matches.length === 0) continue;

    const role = matches.find((m) => m.role != null && m.role !== "")?.role ?? null;
    const amount_cents = matches.reduce(
      (sum, m) => sum + (typeof m.amount_cents === "number" ? m.amount_cents : 0),
      0
    );

    result.push({
      id: row.id,
      title: row.title,
      date: row.date,
      status: row.status,
      role,
      amount_cents,
    });
  }

  result.sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date == null) return 1;
    if (b.date == null) return -1;
    return a.date < b.date ? 1 : -1;
  });

  return result;
}

export async function listServices(supplierId: number): Promise<SupplierService[]> {
  const db = getDb();
  return db.select<SupplierService[]>(
    "SELECT * FROM supplier_services WHERE supplier_id = $1 ORDER BY id ASC",
    [supplierId]
  );
}

export async function createService(
  supplierId: number,
  data: { description: string; unit?: string | null; price?: number | null; notes?: string | null }
): Promise<number> {
  const db = getDb();
  const result = await db.execute(
    `INSERT INTO supplier_services (supplier_id, description, unit, price, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [supplierId, data.description, data.unit ?? null, data.price ?? null, data.notes ?? null]
  );
  return result.lastInsertId as number;
}

export async function updateService(
  id: number,
  data: { description: string; unit?: string | null; price?: number | null; notes?: string | null }
): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE supplier_services SET description = $1, unit = $2, price = $3, notes = $4 WHERE id = $5`,
    [data.description, data.unit ?? null, data.price ?? null, data.notes ?? null, id]
  );
}

export async function deleteService(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM supplier_services WHERE id = $1", [id]);
}
