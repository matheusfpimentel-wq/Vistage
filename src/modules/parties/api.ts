import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Party,
  PartyDeserialized,
  PartyTeamMember,
  PartyCost,
  PartyCreateInput,
  PartyUpdateInput,
  PartyStage,
  PartyBudgetItem,
  PartyTicket,
  PartyTask,
  PartyVenueCandidate,
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
    team: parseJsonArray<PartyTeamMember>(r.team),
  };
}

type PartyStageRow = Omit<PartyStage, "fields"> & { fields: string | null };

function rowToStage(r: PartyStageRow): PartyStage {
  return { ...r, fields: parseJsonObject(r.fields) };
}

const PARTY_COLS = [
  "title", "date", "venue_id", "venue_name", "status", "description",
  "expected_capacity", "actual_attendance", "ticket_price_regular",
  "ticket_price_vip", "lineup", "sponsors", "team", "notes", "gig_id",
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
    team: JSON.stringify(Array.isArray(input.team) ? input.team : []),
  };
  const cols = PARTY_COLS.filter((c) => payload[c] !== undefined);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => payload[c] ?? null);
  const res = await db.execute(
    `INSERT INTO parties (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  try {
    const { syncPartyTransactions } = await import("@/modules/finance/api");
    await syncPartyTransactions(id);
  } catch { /* não interrompe */ }
  // Tarefa do dia do evento, se a festa é no futuro
  const today = new Date().toISOString().slice(0, 10);
  if (typeof input.date === "string" && input.date > today) {
    try {
      const { createTask } = await import("@/modules/tasks/api");
      const taskId = await createTask({
        title: `Festa: ${input.title ?? "evento"}`,
        description: "Dia do evento — confirmar produção, equipe e logística.",
        category: "Festas",
        gig_id: null,
        contact_id: null,
        priority: "Alta",
        status: "A fazer",
        due_date: input.date,
        tags: ["festa"],
      });
      await db.execute("UPDATE parties SET event_task_id = $1 WHERE id = $2", [taskId, id]);
    } catch { /* não interrompe */ }
  }
  emitDataChanged();
  return id;
}

export async function updateParty(input: PartyUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.lineup)) payload.lineup = JSON.stringify(payload.lineup);
  if (Array.isArray(payload.sponsors)) payload.sponsors = JSON.stringify(payload.sponsors);
  if (Array.isArray(payload.team)) payload.team = JSON.stringify(payload.team);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE parties SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  // Sync global_task due_date for auto-generated party tasks when party date changes
  if ("date" in rest) {
    const newDate = rest.date as string | null;
    const taskRows = await db.select<{ global_task_id: number | null; due_date: string | null }[]>(
      "SELECT global_task_id, due_date FROM party_tasks WHERE party_id = $1 AND global_task_id IS NOT NULL",
      [id]
    );
    if (taskRows.length > 0) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        for (const row of taskRows) {
          if (row.global_task_id) {
            await updateTask({ id: row.global_task_id, due_date: newDate });
          }
        }
      } catch { /* não interrompe */ }
    }
    // Sincroniza a tarefa do dia do evento
    const ev = await db.select<{ event_task_id: number | null }[]>(
      "SELECT event_task_id FROM parties WHERE id = $1", [id]
    );
    if (ev[0]?.event_task_id) {
      try {
        const { updateTask } = await import("@/modules/tasks/api");
        await updateTask({ id: ev[0].event_task_id, due_date: newDate });
      } catch { /* não interrompe */ }
    }
  }
  // Conclui a tarefa do evento quando a festa é marcada como Realizada
  if ("status" in rest && rest.status === "Realizada") {
    const ev = await db.select<{ event_task_id: number | null }[]>(
      "SELECT event_task_id FROM parties WHERE id = $1", [id]
    );
    if (ev[0]?.event_task_id) {
      await db.execute(
        `UPDATE tasks SET status='Concluída', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status<>'Concluída'`,
        [ev[0].event_task_id]
      ).catch(() => {});
    }
  }
  // Auto-sync financeiro ao marcar como Realizada
  if ("status" in rest && rest.status === "Realizada") {
    try {
      const partyRows = await db.select<{ financial_synced: number }[]>(
        "SELECT financial_synced FROM parties WHERE id = $1",
        [id]
      );
      if (partyRows[0]?.financial_synced === 0) {
        const [full] = await Promise.all([getParty(id)]);
        if (full) {
          const [tickets, budgetItems] = await Promise.all([
            db.select<PartyTicket[]>("SELECT * FROM party_tickets WHERE party_id = $1", [id]),
            db.select<PartyBudgetItem[]>("SELECT * FROM party_budget_items WHERE party_id = $1", [id]),
          ]);
          await syncPartyToFinanceiro(full, tickets, budgetItems);
        }
      }
    } catch { /* não interrompe */ }
  }
  try {
    const { syncPartyTransactions } = await import("@/modules/finance/api");
    await syncPartyTransactions(id);
  } catch { /* não interrompe */ }
  emitDataChanged();
}

export async function deleteParty(id: number): Promise<void> {
  const db = getDb();
  const taskRows = await db.select<{ global_task_id: number | null }[]>(
    "SELECT global_task_id FROM party_tasks WHERE party_id = $1",
    [id]
  );
  const taskIds = taskRows
    .map((r) => r.global_task_id)
    .filter((tid): tid is number => tid !== null);
  await db.execute("DELETE FROM finance_transactions WHERE party_id = $1", [id]);
  await db.execute("DELETE FROM parties WHERE id = $1", [id]);
  for (const tid of taskIds) {
    await db.execute("DELETE FROM tasks WHERE id = $1", [tid]);
  }
  emitDataChanged();
}

// ===== ORPHAN REFERENCE CLEANUP =====

type RawParty = { id: number; lineup: string | null; sponsors: string | null; team: string | null };

/**
 * Remove um contato de referências JSON em todas as festas:
 * `lineup` (array de IDs numéricos ou objetos com contact_id/id) e,
 * defensivamente, `team`/`sponsors` que contenham contact_id. Só faz UPDATE
 * quando algo muda.
 */
export async function removeContactFromParties(contactId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<RawParty[]>("SELECT id, lineup, sponsors, team FROM parties");
  for (const row of rows) {
    let changed = false;
    const sets: string[] = [];
    const values: unknown[] = [];

    const lineup = parseJsonArray<unknown>(row.lineup);
    const newLineup = lineup.filter((v) => !idMatches(v, contactId));
    if (newLineup.length !== lineup.length) {
      changed = true;
      values.push(JSON.stringify(newLineup));
      sets.push(`lineup = $${values.length}`);
    }

    const team = parseJsonArray<Record<string, unknown>>(row.team);
    const newTeam = team.filter((m) => !refMatches(m, "contact_id", contactId));
    if (newTeam.length !== team.length) {
      changed = true;
      values.push(JSON.stringify(newTeam));
      sets.push(`team = $${values.length}`);
    }

    const sponsors = parseJsonArray<Record<string, unknown>>(row.sponsors);
    const newSponsors = sponsors.filter((s) => !refMatches(s, "contact_id", contactId));
    if (newSponsors.length !== sponsors.length) {
      changed = true;
      values.push(JSON.stringify(newSponsors));
      sets.push(`sponsors = $${values.length}`);
    }

    if (changed) {
      values.push(row.id);
      await db.execute(
        `UPDATE parties SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
        values
      );
    }
  }
}

/**
 * Anula referências a um fornecedor em `team` JSON de todas as festas
 * (membros com `supplier_id` apontando para o fornecedor removido têm o campo
 * setado para null). Só faz UPDATE quando algo muda.
 */
export async function removeSupplierFromParties(supplierId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<RawParty[]>("SELECT id, lineup, sponsors, team FROM parties");
  for (const row of rows) {
    const team = parseJsonArray<Record<string, unknown>>(row.team);
    let changed = false;
    const newTeam = team.map((m) => {
      if (m && typeof m === "object" && Number(m.supplier_id) === supplierId) {
        changed = true;
        return { ...m, supplier_id: null };
      }
      return m;
    });
    if (changed) {
      await db.execute(
        "UPDATE parties SET team = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [JSON.stringify(newTeam), row.id]
      );
    }
  }
}

/** Compara um elemento de array que pode ser um número ou objeto {contact_id|id}. */
function idMatches(v: unknown, id: number): boolean {
  if (typeof v === "number") return v === id;
  if (typeof v === "string") return Number(v) === id;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Number(o.contact_id) === id || Number(o.id) === id;
  }
  return false;
}

/** Verifica se um objeto referencia `id` via o campo indicado. */
function refMatches(o: Record<string, unknown> | null, field: string, id: number): boolean {
  if (!o || typeof o !== "object") return false;
  return Number(o[field]) === id;
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

// ===== VENUE CANDIDATES =====

export async function listPartyVenueCandidates(partyId: number): Promise<PartyVenueCandidate[]> {
  const db = getDb();
  return db.select<PartyVenueCandidate[]>(
    `SELECT pvc.*, v.name AS venue_name
     FROM party_venue_candidates pvc
     LEFT JOIN venues v ON v.id = pvc.venue_id
     WHERE pvc.party_id = $1
     ORDER BY v.name COLLATE NOCASE ASC`,
    [partyId]
  );
}

export async function addPartyVenueCandidate(partyId: number, venueId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT OR IGNORE INTO party_venue_candidates (party_id, venue_id) VALUES ($1, $2)",
    [partyId, venueId]
  );
}

export async function removePartyVenueCandidate(partyId: number, venueId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM party_venue_candidates WHERE party_id = $1 AND venue_id = $2",
    [partyId, venueId]
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
    `INSERT INTO party_budget_items (party_id, category, subcategory, description, projected_amount, actual_amount, supplier_note, supplier_id, status, date_paid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      item.party_id, item.category, item.subcategory ?? null, item.description ?? null,
      item.projected_amount, item.actual_amount ?? null, item.supplier_note ?? null,
      item.supplier_id ?? null, item.status, item.date_paid ?? null,
    ]
  );
  try {
    const { syncPartyTransactions } = await import("@/modules/finance/api");
    await syncPartyTransactions(item.party_id);
  } catch { /* não interrompe */ }
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
  try {
    const rows = await db.select<{ party_id: number }[]>(
      "SELECT party_id FROM party_budget_items WHERE id = $1",
      [id]
    );
    if (rows[0]) {
      const { syncPartyTransactions } = await import("@/modules/finance/api");
      await syncPartyTransactions(rows[0].party_id);
    }
  } catch { /* não interrompe */ }
}

export async function deletePartyBudgetItem(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ party_id: number }[]>(
    "SELECT party_id FROM party_budget_items WHERE id = $1",
    [id]
  );
  await db.execute("DELETE FROM party_budget_items WHERE id = $1", [id]);
  try {
    if (rows[0]) {
      const { syncPartyTransactions } = await import("@/modules/finance/api");
      await syncPartyTransactions(rows[0].party_id);
    }
  } catch { /* não interrompe */ }
}

/** Categoria usada para itens de orçamento gerados a partir da equipe de produção. */
export const TEAM_BUDGET_CATEGORY = "Produção/Equipe";

/**
 * Cria itens de orçamento para membros da equipe de produção que ainda não
 * têm um item correspondente. Identifica os existentes pela categoria
 * `TEAM_BUDGET_CATEGORY` + descrição (nome / função). Retorna os nomes dos
 * membros para os quais um item foi criado.
 */
export async function syncTeamBudgetItems(
  partyId: number,
  team: PartyTeamMember[]
): Promise<string[]> {
  if (team.length === 0) return [];
  const existing = await listPartyBudgetItems(partyId);
  const existingKeys = new Set(
    existing
      .filter((i) => i.category === TEAM_BUDGET_CATEGORY)
      .map((i) => (i.description ?? "").trim().toLowerCase())
  );
  const created: string[] = [];
  for (const m of team) {
    const description = `${m.name} — ${m.role}`;
    if (existingKeys.has(description.trim().toLowerCase())) continue;
    await createPartyBudgetItem({
      party_id: partyId,
      category: TEAM_BUDGET_CATEGORY,
      subcategory: m.role || null,
      description,
      projected_amount: m.amount_cents > 0 ? m.amount_cents / 100 : 0,
      actual_amount: null,
      supplier_note: null,
      supplier_id: null,
      status: "projetado",
      date_paid: null,
    });
    existingKeys.add(description.trim().toLowerCase());
    created.push(m.name);
  }
  return created;
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
  try {
    const { syncPartyTransactions } = await import("@/modules/finance/api");
    await syncPartyTransactions(ticket.party_id);
  } catch { /* não interrompe */ }
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
  try {
    const rows = await db.select<{ party_id: number }[]>(
      "SELECT party_id FROM party_tickets WHERE id = $1",
      [id]
    );
    if (rows[0]) {
      const { syncPartyTransactions } = await import("@/modules/finance/api");
      await syncPartyTransactions(rows[0].party_id);
    }
  } catch { /* não interrompe */ }
}

export async function deletePartyTicket(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ party_id: number }[]>(
    "SELECT party_id FROM party_tickets WHERE id = $1",
    [id]
  );
  await db.execute("DELETE FROM party_tickets WHERE id = $1", [id]);
  try {
    if (rows[0]) {
      const { syncPartyTransactions } = await import("@/modules/finance/api");
      await syncPartyTransactions(rows[0].party_id);
    }
  } catch { /* não interrompe */ }
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

  const incCat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories WHERE kind='income' AND name='Produção de Festas' LIMIT 1`
  );
  const expCat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories WHERE kind='expense' AND name='Produção de Festas' LIMIT 1`
  );
  const incomeCatId = incCat[0]?.id ?? null;
  const expenseCatId = expCat[0]?.id ?? null;

  for (const ticket of tickets) {
    if (ticket.quantity_sold <= 0) continue;
    const amount = ticket.price * ticket.quantity_sold;
    await db.execute(
      `INSERT INTO finance_transactions (kind, amount, date, description, party_id, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Recebido/Pago')`,
      ["income", amount, dateStr, `${party.title}: ingressos ${ticket.name}`, party.id, incomeCatId]
    );
  }

  for (const item of budgetItems) {
    if (!item.actual_amount || item.actual_amount <= 0) continue;
    const subcat = item.subcategory ? ` / ${item.subcategory}` : "";
    const desc = `${party.title}: ${item.category}${subcat}`;
    const dateUsed = item.date_paid ?? party.date ?? todayISO();
    await db.execute(
      `INSERT INTO finance_transactions (kind, amount, date, description, party_id, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Recebido/Pago')`,
      ["expense", item.actual_amount, dateUsed, desc, party.id, expenseCatId]
    );
  }

  await db.execute(
    "UPDATE parties SET financial_synced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [party.id]
  );
}

/** Links a party task to the global tasks module, creating a global task if needed. */
export async function linkPartyTaskToGlobal(
  task: PartyTask,
  partyTitle: string,
  partyDate: string | null
): Promise<number> {
  const { createTask } = await import("@/modules/tasks/api");
  const taskId = await createTask({
    title: `${task.title} (${partyTitle})`,
    description: null,
    category: "Festas",
    gig_id: null,
    contact_id: null,
    priority: "Média",
    status: "A fazer",
    due_date: partyDate,
    tags: ["festa"],
  });
  const db = getDb();
  await db.execute("UPDATE party_tasks SET global_task_id = $1 WHERE id = $2", [taskId, task.id]);
  return taskId;
}

/** Completes both the party task and its linked global task. */
export async function completePartyTask(task: PartyTask): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE party_tasks SET status = 'concluida' WHERE id = $1", [task.id]);
  if (task.global_task_id) {
    const { updateTask } = await import("@/modules/tasks/api");
    await updateTask({ id: task.global_task_id, status: "Concluída" });
  }
}
