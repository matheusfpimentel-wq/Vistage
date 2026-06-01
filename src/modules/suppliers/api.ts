import { getDb } from "@/lib/db";
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
  await db.execute("DELETE FROM suppliers WHERE id = $1", [id]);
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
