import { getDb } from "@/lib/db";
import type {
  Party,
  PartyDeserialized,
  PartyCost,
  PartyCreateInput,
  PartyUpdateInput,
  PartyStage,
  PartyBudgetItem,
  PartyTicket,
  PartyTask,
} from "./types";
import { DEFAULT_STAGE_NAMES } from "./types";

function nowISO(): string {
  return new Date().toISOString();
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null): Record<string, string | number | null> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, string | number | null>)
      : {};
  } catch {
    return {};
  }
}

function rowToParty(r: Party): PartyDeserialized {
  return {
    ...r,
    lineup: parseJsonArray<number>(r.lineup),
    sponsors: parseJsonArray<{ name: string; amount_cents: number }>(r.sponsors),
  };
}

type PartyStageRow = Omit<PartyStage, "fields"> & { fields: string | null };

function rowToStage(r: PartyStageRow): PartyStage {
  return { ...r, fields: parseJsonObject(r.fields) };
}

const PARTY_COLS = [
  "title", "date", "venue_id", "venue_name", "status", "description",
  "expected_capacity", "actual_attendance", "ticket_price_regular",
  "ticket_price_vip", "lineup", "sponsors", "notes",
];

export async function listParties(): Promise<PartyDeserialized[]> {
  const db = getDb();
  const rows = await db.select<Party[]>(
    "SELECT * FROM parties ORDER BY date IS NULL, date DESC"
  );
  return rows.map(rowToParty);
}

export async function getParty(id: number): Promise<PartyDeserialized | null> {
  const db = getDb();
  const rows = await db.select<Party[]>(
    "SELECT * FROM parties WHERE id = $1",
    [id]
  );
  return rows[0] ? rowToParty(rows[0]) : null;
}

export async function createParty(input: PartyCreateInput): Promise<number> {
  const db = getDb();
  const payload: Record<string, unknown> = {
    ...input,
    lineup: JSON.stringify(Array.isArray(input.lineup) ? input.lineup : []),
    sponsors: JSON.stringify(Array.isArray(input.sponsors) ? input.sponsors : []),
  };
  const cols = PARTY_COLS.filter((c) => payload[c] !== undefined);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => payload[c] ?? null);
  const res = await db.execute(
    `INSERT INTO parties (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateParty(input: PartyUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.lineup)) payload.lineup = JSON.stringify(payload.lineup);
  if (Array.isArray(payload.sponsors)) payload.sponsors = JSON.stringify(payload.sponsors);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE parties SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deleteParty(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM parties WHERE id = $1", [id]);
}

export async function listPartyCosts(partyId: number): Promise<PartyCost[]> {
  const db = getDb();
  return db.select<PartyCost[]>(
    "SELECT * FROM party_costs WHERE party_id = $1 ORDER BY date DESC, created_at DESC",
    [partyId]
  );
}

export async function createPartyCost(
  partyId: number,
  category: string | null,
  description: string | null,
  amount: number,
  date: string | null
): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO party_costs (party_id, category, description, amount, date)
     VALUES ($1, $2, $3, $4, $5)`,
    [partyId, category, description, amount, date]
  );
}

export async function deletePartyCost(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM party_costs WHERE id = $1", [id]);
}

export async function autoGeneratePartyTasks(party: PartyDeserialized): Promise<void> {
  if (party.tasks_generated) return;
  const db = getDb();
  const now = nowISO();
  // Data final = data da festa; se não houver, deixa sem data.
  const due = party.date ?? null;
  const tasks = [
    "Confirmar venue e contrato",
    "Contratar sistema de som/luz",
    "Lançar divulgação nas redes",
    "Fechar line-up e cachês",
  ];
  for (const action of tasks) {
    // Título traz a ação e termina com o nome da festa entre parênteses.
    const title = `${action} (${party.title})`;
    await db.execute(
      `INSERT INTO tasks (title, category, priority, status, due_date, created_at, updated_at)
       VALUES ($1, 'Festas', 'Alta', 'A fazer', $2, $3, $4)`,
      [title, due, now, now]
    );
  }
  await db.execute(
    "UPDATE parties SET tasks_generated = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [party.id]
  );
}

// ===== STAGES =====

export async function listPartyStages(partyId: number): Promise<PartyStage[]> {
  const db = getDb();
  const rows = await db.select<PartyStageRow[]>(
    "SELECT * FROM party_stages WHERE party_id = $1 ORDER BY position ASC",
    [partyId]
  );
  return rows.map(rowToStage);
}

export async function createPartyStage(partyId: number, name: string, position: number): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO party_stages (party_id, name, position) VALUES ($1, $2, $3)",
    [partyId, name, position]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyStage(
  id: number,
  updates: Partial<Pick<PartyStage, "name" | "position" | "status" | "notes" | "fields" | "completed_at">>
): Promise<void> {
  const db = getDb();
  const payload: Record<string, unknown> = { ...updates };
  if (payload.fields !== undefined) {
    payload.fields = JSON.stringify(payload.fields);
  }
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE party_stages SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deletePartyStage(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM party_stages WHERE id = $1", [id]);
}

export async function initDefaultStages(partyId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) as cnt FROM party_stages WHERE party_id = $1",
    [partyId]
  );
  if (rows[0] && rows[0].cnt > 0) return;
  for (let i = 0; i < DEFAULT_STAGE_NAMES.length; i++) {
    await db.execute(
      "INSERT INTO party_stages (party_id, name, position) VALUES ($1, $2, $3)",
      [partyId, DEFAULT_STAGE_NAMES[i], i]
    );
  }
}

// ===== BUDGET =====

export async function listPartyBudgetItems(partyId: number): Promise<PartyBudgetItem[]> {
  const db = getDb();
  return db.select<PartyBudgetItem[]>(
    "SELECT * FROM party_budget_items WHERE party_id = $1 ORDER BY category, subcategory, created_at",
    [partyId]
  );
}

export async function createPartyBudgetItem(
  item: Omit<PartyBudgetItem, "id" | "created_at" | "updated_at">
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO party_budget_items (party_id, category, subcategory, description, projected_amount, actual_amount, supplier_note, status, date_paid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      item.party_id, item.category, item.subcategory ?? null, item.description ?? null,
      item.projected_amount, item.actual_amount ?? null, item.supplier_note ?? null,
      item.status, item.date_paid ?? null,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyBudgetItem(
  id: number,
  updates: Partial<Omit<PartyBudgetItem, "id" | "party_id" | "created_at" | "updated_at">>
): Promise<void> {
  const db = getDb();
  const payload: Record<string, unknown> = { ...updates };
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE party_budget_items SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deletePartyBudgetItem(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM party_budget_items WHERE id = $1", [id]);
}

// ===== TICKETS =====

export async function listPartyTickets(partyId: number): Promise<PartyTicket[]> {
  const db = getDb();
  return db.select<PartyTicket[]>(
    "SELECT * FROM party_tickets WHERE party_id = $1 ORDER BY position, created_at",
    [partyId]
  );
}

export async function createPartyTicket(
  ticket: Omit<PartyTicket, "id" | "created_at">
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO party_tickets (party_id, name, ticket_type, price, quantity_total, quantity_sold, sale_start_date, sale_end_date, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      ticket.party_id, ticket.name, ticket.ticket_type, ticket.price,
      ticket.quantity_total ?? null, ticket.quantity_sold, ticket.sale_start_date ?? null,
      ticket.sale_end_date ?? null, ticket.position,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyTicket(
  id: number,
  updates: Partial<Omit<PartyTicket, "id" | "party_id" | "created_at">>
): Promise<void> {
  const db = getDb();
  const payload: Record<string, unknown> = { ...updates };
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE party_tickets SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deletePartyTicket(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM party_tickets WHERE id = $1", [id]);
}

// ===== PARTY TASKS =====

export async function listPartyTasks(partyId: number): Promise<PartyTask[]> {
  const db = getDb();
  return db.select<PartyTask[]>(
    `SELECT * FROM party_tasks WHERE party_id = $1
     ORDER BY (status = 'concluida'), (due_date IS NULL), due_date ASC`,
    [partyId]
  );
}

export async function createPartyTask(
  task: Omit<PartyTask, "id" | "created_at" | "updated_at">
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO party_tasks (party_id, stage_id, title, status, priority, due_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      task.party_id, task.stage_id ?? null, task.title,
      task.status, task.priority, task.due_date ?? null, task.notes ?? null,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyTask(
  id: number,
  updates: Partial<Omit<PartyTask, "id" | "party_id" | "created_at" | "updated_at">>
): Promise<void> {
  const db = getDb();
  const payload: Record<string, unknown> = { ...updates };
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE party_tasks SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
}

export async function deletePartyTask(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM party_tasks WHERE id = $1", [id]);
}

// ===== FINANCEIRO SYNC =====

export async function syncPartyToFinanceiro(
  party: PartyDeserialized,
  tickets: PartyTicket[],
  budgetItems: PartyBudgetItem[]
): Promise<void> {
  if (party.financial_synced) return;
  const db = getDb();
  const dateStr = party.date ?? todayISO();

  for (const ticket of tickets) {
    if (ticket.quantity_sold <= 0) continue;
    const amount = ticket.price * ticket.quantity_sold;
    await db.execute(
      `INSERT INTO finance_transactions (kind, amount, date, description, gig_id, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["income", amount, dateStr, `Ingressos: ${ticket.name} — ${party.title}`, null, null]
    );
  }

  for (const item of budgetItems) {
    if (!item.actual_amount || item.actual_amount <= 0) continue;
    const desc =
      item.category +
      (item.subcategory ? ` / ${item.subcategory}` : "") +
      ` — ${party.title}`;
    const dateUsed = item.date_paid ?? party.date ?? todayISO();
    await db.execute(
      `INSERT INTO finance_transactions (kind, amount, date, description, gig_id, category_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["expense", item.actual_amount, dateUsed, desc, null, null]
    );
  }

  await db.execute(
    "UPDATE parties SET financial_synced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [party.id]
  );
}
