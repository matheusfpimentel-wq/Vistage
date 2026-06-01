import { getDb } from "@/lib/db";
import type {
  Party,
  PartyDeserialized,
  PartyCost,
  PartyCreateInput,
  PartyUpdateInput,
} from "./types";

function nowISO(): string {
  return new Date().toISOString();
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

function rowToParty(r: Party): PartyDeserialized {
  return {
    ...r,
    lineup: parseJsonArray<number>(r.lineup),
    sponsors: parseJsonArray<{ name: string; amount_cents: number }>(r.sponsors),
  };
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
  const base = party.date ?? now.slice(0, 10);
  const dueDate = new Date(base);
  dueDate.setDate(dueDate.getDate() - 7);
  const due = dueDate.toISOString().slice(0, 10);
  const tasks = [
    "Confirmar venue e contrato",
    "Contratar sistema de som/luz",
    "Lançar divulgação nas redes",
    "Fechar line-up e cachês",
  ];
  for (const title of tasks) {
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
