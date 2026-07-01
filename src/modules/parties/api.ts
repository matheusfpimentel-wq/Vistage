import { getDb } from "@/lib/db";
import { toLocalISODate } from "@/lib/format";
import { emitDataChanged } from "@/lib/events";
import type {
  Party,
  PartyDeserialized,
  PartyTeamMember,
  PartySponsor,
  LineupStatus,
  PartyCreateInput,
  PartyUpdateInput,
  PartyStage,
  PartyBudgetItem,
  PartyTicket,
  PartyTask,
  PartyVenueCandidate,
  PartyRunsheetItem,
  PartyGuest,
  PartyTicketSale,
  PartyComplianceItem,
  PartyMarketingAsset,
  PartyMarketingAction,
  RiderTemplate,
  PartySeries,
  PartySeriesCreateInput,
  PartySeriesUpdateInput,
} from "./types";
import { DEFAULT_STAGE_NAMES, DEFAULT_COMPLIANCE_ITEMS } from "./types";
import { computePartyPnL } from "./pnl";

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
    sponsors: parseJsonArray<PartySponsor>(r.sponsors),
    team: parseJsonArray<PartyTeamMember>(r.team),
    lineup_status: parseJsonObject(r.lineup_status ?? null) as LineupStatus,
  };
}

type PartyStageRow = Omit<PartyStage, "fields"> & { fields: string | null };

function rowToStage(r: PartyStageRow): PartyStage {
  return { ...r, fields: parseJsonObject(r.fields) };
}

const PARTY_COLS = [
  "title", "date", "venue_id", "venue_name", "status", "status_override", "description",
  "expected_capacity", "actual_attendance", "ticket_price_regular",
  "ticket_price_vip", "bar_revenue", "target_cac", "lineup", "sponsors", "team", "lineup_status", "notes", "gig_id",
  "series_id", "edition_label", "edition_number",
];

export async function listParties(): Promise<PartyDeserialized[]> {
  const db = getDb();
  const rows = await db.select<Party[]>(
    "SELECT * FROM parties ORDER BY date IS NULL, date DESC"
  );
  return rows.map(rowToParty);
}

async function getParty(id: number): Promise<PartyDeserialized | null> {
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
  if (payload.lineup_status && typeof payload.lineup_status === "object") {
    payload.lineup_status = JSON.stringify(payload.lineup_status);
  }
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
  const today = toLocalISODate();
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
  if (payload.lineup_status && typeof payload.lineup_status === "object") {
    payload.lineup_status = JSON.stringify(payload.lineup_status);
  }
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
  // Espelha o estado da festa nas tarefas vinculadas
  if ("status" in rest && (rest.status === "Realizada" || rest.status === "Cancelada")) {
    try {
      const { syncLinkedTasksStatus } = await import("@/modules/tasks/api");
      await syncLinkedTasksStatus(
        "party",
        id,
        rest.status === "Realizada" ? "Concluída" : "Cancelada"
      );
    } catch { /* não interrompe */ }
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
  // Pós-evento: ao marcar Realizada, garante UM card de "Aftermovie" no Conteúdo
  // (idempotente — não duplica). O Financeiro já foi sincronizado acima; o
  // guest list → Clube de Fãs fica como ação manual (nem toda cortesia é fã).
  if ("status" in rest && rest.status === "Realizada") {
    try {
      const r = await db.select<{ title: string }[]>(
        "SELECT title FROM parties WHERE id = $1",
        [id]
      );
      if (r[0]) await ensurePartyAftermovieContent(id, r[0].title);
    } catch { /* não interrompe */ }
  }
  try {
    const { syncPartyTransactions } = await import("@/modules/finance/api");
    await syncPartyTransactions(id);
  } catch { /* não interrompe */ }
  emitDataChanged();
}

/**
 * Pós-evento (a): cria UM card "Aftermovie — {festa}" no Conteúdo, vinculado à
 * festa (promotes "Festa"). Idempotente — não recria se já houver um. O título
 * leva o nome da festa para também aparecer na lista de conteúdos vinculados.
 */
async function ensurePartyAftermovieContent(partyId: number, partyTitle: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    "SELECT id FROM content WHERE promotes_type = 'Festa' AND promotes_id = $1 AND title LIKE 'Aftermovie%' LIMIT 1",
    [partyId]
  );
  if (existing.length > 0) return false;
  const { createContent } = await import("@/modules/content/api");
  await createContent({
    title: `Aftermovie — ${partyTitle}`,
    script: null,
    networks: ["Instagram"],
    format: "Reels",
    purpose: "Recap da festa",
    status: "Ideia",
    due_date: null,
    publish_date: null,
    published_at: null,
    post_url: null,
    metric_views: null,
    metric_likes: null,
    metric_comments: null,
    metric_shares: null,
    metric_saves: null,
    notes: null,
    task_id: null,
    promotes_type: "Festa",
    promotes_id: partyId,
  });
  return true;
}

/**
 * Pós-evento (c): manda a guest list (cortesias) pro Clube de Fãs. AÇÃO MANUAL —
 * nem toda cortesia é fã (imprensa, equipe, permuta…), então quem decide é o
 * usuário. Dedup por nome (não recria fã já existente). Os ingressos vendidos são
 * agregados (não guardam o comprador individual), então a fonte é o guest list.
 */
export async function addPartyGuestsToFans(
  partyId: number,
  partyTitle: string
): Promise<{ added: number; existed: number }> {
  const db = getDb();
  const guests = await db.select<{ name: string }[]>(
    "SELECT name FROM party_guests WHERE party_id = $1 AND TRIM(name) <> ''",
    [partyId]
  );
  if (guests.length === 0) return { added: 0, existed: 0 };
  const { createFan } = await import("@/modules/fans/api");
  const tag = `Festa: ${partyTitle}`;
  let added = 0;
  let existed = 0;
  for (const g of guests) {
    const name = g.name.trim();
    const dup = await db.select<{ id: number }[]>(
      "SELECT id FROM fans WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [name]
    );
    if (dup.length > 0) {
      existed++;
      continue;
    }
    await createFan({
      name,
      level: "Possível fã",
      is_ambassador: 0,
      instagram: null,
      email: null,
      phone: null,
      city: null,
      tags: [tag],
      notes: `Veio da guest list da festa "${partyTitle}".`,
      photo_path: null,
      contact_id: null,
    });
    added++;
  }
  return { added, existed };
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
  const { unlinkTasksFromEntity } = await import("@/modules/tasks/api");
  await unlinkTasksFromEntity("party", id);
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
     ORDER BY pvc.is_leader DESC, v.name COLLATE NOCASE ASC`,
    [partyId]
  );
}

export async function addPartyVenueCandidate(
  partyId: number,
  venueId: number,
  extra?: { capacity?: number | null; deal_type?: string | null; deal_terms?: string | null; estimated_cost?: number | null },
): Promise<void> {
  const db = getDb();
  // INSERT OR IGNORE preserva idempotência (UNIQUE party+venue). Se já existe e
  // vieram dados novos (capacidade/acordo/custo), atualiza via update abaixo.
  await db.execute(
    `INSERT OR IGNORE INTO party_venue_candidates (party_id, venue_id, capacity, deal_type, deal_terms, estimated_cost)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [partyId, venueId, extra?.capacity ?? null, extra?.deal_type ?? null, extra?.deal_terms ?? null, extra?.estimated_cost ?? null]
  );
}

/** Update genérico de um candidato (capacidade, acordo, custo, líder…). */
export async function updatePartyVenueCandidate(
  id: number,
  updates: Partial<Omit<PartyVenueCandidate, "id" | "party_id" | "venue_id" | "venue_name" | "created_at">>,
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(`UPDATE party_venue_candidates SET ${sets} WHERE id = $${values.length}`, values);
}

/** Marca UM candidato como líder (estrela) e zera os demais da festa. */
export async function setPartyVenueLeader(partyId: number, candidateId: number | null): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE party_venue_candidates SET is_leader = 0 WHERE party_id = $1", [partyId]);
  if (candidateId != null) {
    await db.execute("UPDATE party_venue_candidates SET is_leader = 1 WHERE id = $1 AND party_id = $2", [candidateId, partyId]);
  }
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

// ===== SÉRIES / EDIÇÕES =====

const SERIES_COLS = [
  "name", "slug", "conceito", "posicionamento", "publico_alvo",
  "identidade_visual", "tom_mensagem", "archived_at",
];

export async function listPartySeries(includeArchived = false): Promise<PartySeries[]> {
  const db = getDb();
  const sql = includeArchived
    ? "SELECT * FROM party_series ORDER BY name COLLATE NOCASE"
    : "SELECT * FROM party_series WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE";
  return db.select<PartySeries[]>(sql);
}

export async function getPartySeries(id: number): Promise<PartySeries | null> {
  const db = getDb();
  const rows = await db.select<PartySeries[]>("SELECT * FROM party_series WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createPartySeries(input: PartySeriesCreateInput): Promise<number> {
  const db = getDb();
  const payload: Record<string, unknown> = { ...input };
  const cols = SERIES_COLS.filter((c) => payload[c] !== undefined);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((c) => payload[c] ?? null);
  const res = await db.execute(
    `INSERT INTO party_series (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updatePartySeries(input: PartySeriesUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  const cols = Object.keys(payload).filter((c) => SERIES_COLS.includes(c));
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => payload[c] ?? null);
  values.push(id);
  await db.execute(`UPDATE party_series SET ${sets} WHERE id = $${values.length}`, values);
  emitDataChanged();
}

export async function archivePartySeries(id: number): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE party_series SET archived_at = $1 WHERE id = $2", [nowISO(), id]);
  emitDataChanged();
}

/** Edições de uma série, ordenadas por número e depois data. */
export async function listEditions(seriesId: number): Promise<PartyDeserialized[]> {
  const db = getDb();
  const rows = await db.select<Party[]>(
    "SELECT * FROM parties WHERE series_id = $1 ORDER BY edition_number IS NULL, edition_number, date IS NULL, date",
    [seriesId]
  );
  return rows.map(rowToParty);
}

/**
 * Transforma uma festa avulsa em série (retroativo): cria a série puxando o DNA
 * dos campos da Ideação e marca a festa como edição 1. Sem começar do zero.
 */
export async function transformPartyIntoSeries(partyId: number, name?: string): Promise<number> {
  const db = getDb();
  const party = await getParty(partyId);
  if (!party) throw new Error("Festa não encontrada.");
  const stageRows = await db.select<PartyStageRow[]>(
    "SELECT * FROM party_stages WHERE party_id = $1",
    [partyId]
  );
  const ideacao = stageRows.map(rowToStage).find((s) => s.name === "Ideação");
  const f = ideacao?.fields ?? {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const seriesId = await createPartySeries({
    name: name?.trim() || party.title,
    slug: null,
    conceito: str(f.conceito) ?? party.description ?? null,
    posicionamento: null,
    publico_alvo: str(f.publico_alvo),
    identidade_visual: str(f.referencias),
    tom_mensagem: null,
  });
  await db.execute(
    "UPDATE parties SET series_id = $1, edition_number = COALESCE(edition_number, 1) WHERE id = $2",
    [seriesId, partyId]
  );
  emitDataChanged();
  return seriesId;
}

export type CloneScaffoldOptions = {
  lineup: boolean; team: boolean; sponsors: boolean;
  tickets: boolean; budget: boolean; runsheet: boolean;
};

/**
 * Cria uma nova edição: puxa o DNA da série e CLONA o andaime da edição mais
 * recente (line-up, equipe, patrocinadores, lotes, orçamento projetado,
 * run-of-show) — NÃO clona os actuals (vendas, público real, valores pagos,
 * datas, cortesias). Clona o "como fazer", não o "o que aconteceu".
 */
export async function createEdition(
  seriesId: number,
  opts: { editionLabel?: string | null; clone?: CloneScaffoldOptions } = {}
): Promise<number> {
  const db = getDb();
  const series = await getPartySeries(seriesId);
  if (!series) throw new Error("Série não encontrada.");
  const editions = await listEditions(seriesId);
  const source = editions[editions.length - 1] ?? null;
  const nextNumber = editions.reduce((m, e) => Math.max(m, e.edition_number ?? 0), 0) + 1;
  const clone: CloneScaffoldOptions =
    opts.clone ?? { lineup: true, team: true, sponsors: true, tickets: true, budget: true, runsheet: true };
  const label = opts.editionLabel?.trim() || `Edição ${nextNumber}`;

  const newId = await createParty({
    title: `${series.name} — ${label}`,
    date: null,
    venue_id: null,
    venue_name: null,
    status: "Planejando",
    description: series.conceito ?? null,
    expected_capacity: source?.expected_capacity ?? null,
    actual_attendance: null,
    gig_id: null,
    series_id: seriesId,
    edition_label: label,
    edition_number: nextNumber,
    lineup: clone.lineup && source ? source.lineup : [],
    team: clone.team && source ? source.team.map((t) => ({ ...t, amount_cents: 0 })) : [],
    sponsors: clone.sponsors && source ? source.sponsors.map((s) => ({ ...s, amount_cents: 0 })) : [],
    notes: null,
  });
  await initDefaultStages(newId);

  if (source) {
    if (clone.tickets) {
      const tk = await db.select<PartyTicket[]>(
        "SELECT * FROM party_tickets WHERE party_id = $1 ORDER BY position",
        [source.id]
      );
      for (const t of tk) {
        await db.execute(
          "INSERT INTO party_tickets (party_id, name, ticket_type, price, quantity_total, quantity_sold, sale_start_date, sale_end_date, position) VALUES ($1,$2,$3,$4,$5,0,NULL,NULL,$6)",
          [newId, t.name, t.ticket_type, t.price, t.quantity_total, t.position]
        );
      }
    }
    if (clone.budget) {
      const bi = await db.select<PartyBudgetItem[]>(
        "SELECT * FROM party_budget_items WHERE party_id = $1",
        [source.id]
      );
      for (const b of bi) {
        await db.execute(
          "INSERT INTO party_budget_items (party_id, category, subcategory, description, projected_amount, actual_amount, supplier_note, supplier_id, status, date_paid) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'projetado',NULL)",
          [newId, b.category, b.subcategory, b.description, b.projected_amount, b.supplier_note, b.supplier_id]
        );
      }
    }
    if (clone.runsheet) {
      const rs = await db.select<PartyRunsheetItem[]>(
        "SELECT * FROM party_runsheet WHERE party_id = $1 ORDER BY position",
        [source.id]
      );
      for (const r of rs) {
        await db.execute(
          "INSERT INTO party_runsheet (party_id, position, time, end_time, title, performer_contact_id, notes, duration_min) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [newId, r.position, r.time, r.end_time, r.title, r.performer_contact_id, r.notes, r.duration_min]
        );
      }
    }
  }
  emitDataChanged();
  return newId;
}

/** Roll-up da franquia: métricas por edição + agregados. */
export type SeriesRollup = {
  editions: {
    id: number; title: string; date: string | null; number: number | null;
    attendance: number | null; capacity: number | null; net: number; sold: number;
    /** Retenção de público vs edição anterior (público_N / público_{N-1} × 100); null se faltar dado. */
    attendanceRetentionPct: number | null;
  }[];
  totalAttendance: number; avgAttendance: number; totalNet: number; editionsCount: number;
  /** Média das retenções entre edições consecutivas (cresce >100% / esfria <100%); null se <2 edições com público. */
  avgRetentionPct: number | null;
};

export async function seriesRollup(seriesId: number): Promise<SeriesRollup> {
  const db = getDb();
  const editions = await listEditions(seriesId);
  const rows: SeriesRollup["editions"] = [];
  for (const e of editions) {
    const tickets = await db.select<PartyTicket[]>(
      "SELECT * FROM party_tickets WHERE party_id = $1",
      [e.id]
    );
    const items = await db.select<PartyBudgetItem[]>(
      "SELECT * FROM party_budget_items WHERE party_id = $1",
      [e.id]
    );
    const guests = await db.select<PartyGuest[]>(
      "SELECT * FROM party_guests WHERE party_id = $1",
      [e.id]
    );
    const pnl = computePartyPnL(tickets, items, e.sponsors, guests, {
      barRevenue: e.bar_revenue,
      attendance: e.actual_attendance,
    });
    rows.push({
      id: e.id, title: e.title, date: e.date, number: e.edition_number,
      attendance: e.actual_attendance, capacity: e.expected_capacity,
      net: pnl.netReal, sold: pnl.sold,
      attendanceRetentionPct: null,
    });
  }
  const withAtt = rows.filter((e) => e.attendance != null);
  const totalAttendance = withAtt.reduce((s, e) => s + (e.attendance ?? 0), 0);
  const totalNet = rows.reduce((s, e) => s + e.net, 0);

  // Ordena cronologicamente (nº, depois data) e calcula a retenção de público de
  // cada edição vs a anterior — mostra se a franquia cresce (>100%) ou esfria.
  const ordered = [...rows].sort((a, b) => {
    const na = a.number ?? 0, nb = b.number ?? 0;
    if (na !== nb) return na - nb;
    return (a.date ?? "").localeCompare(b.date ?? "");
  });
  const retentions: number[] = [];
  let prevAtt: number | null = null;
  for (const e of ordered) {
    if (e.attendance != null && prevAtt != null && prevAtt > 0) {
      const pct = Math.round((e.attendance / prevAtt) * 100);
      e.attendanceRetentionPct = pct;
      retentions.push(pct);
    }
    if (e.attendance != null) prevAtt = e.attendance;
  }
  const avgRetentionPct = retentions.length
    ? Math.round(retentions.reduce((s, x) => s + x, 0) / retentions.length)
    : null;

  return {
    editions: ordered,
    totalAttendance,
    avgAttendance: withAtt.length ? Math.round(totalAttendance / withAtt.length) : 0,
    totalNet,
    editionsCount: rows.length,
    avgRetentionPct,
  };
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
    `INSERT INTO party_budget_items (party_id, category, subcategory, description, projected_amount, actual_amount, supplier_note, supplier_id, status, date_paid, premissa, nota_variancia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      item.party_id, item.category, item.subcategory ?? null, item.description ?? null,
      item.projected_amount, item.actual_amount ?? null, item.supplier_note ?? null,
      item.supplier_id ?? null, item.status, item.date_paid ?? null,
      item.premissa ?? null, item.nota_variancia ?? null,
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
const TEAM_BUDGET_CATEGORY = "Produção/Equipe";

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
      // Mantém o vínculo com o fornecedor — assim o gasto aparece ligado a ele
      // (getSupplierSpend / Festas do fornecedor). Antes ia sempre null, o que
      // "desligava" o fornecedor do orçamento da festa.
      supplier_id: m.supplier_id ?? null,
      status: "projetado",
      date_paid: null,
      premissa: null,
      nota_variancia: null,
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

// ===== OPERAÇÃO / DIA D (run-of-show) =====

export async function listPartyRunsheet(partyId: number): Promise<PartyRunsheetItem[]> {
  return getDb().select<PartyRunsheetItem[]>(
    "SELECT * FROM party_runsheet WHERE party_id = $1 ORDER BY position, time",
    [partyId]
  );
}

export async function createPartyRunsheetItem(
  item: Omit<PartyRunsheetItem, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_runsheet (party_id, position, time, end_time, title, performer_contact_id, notes, duration_min)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      item.party_id, item.position, item.time ?? null, item.end_time ?? null,
      item.title, item.performer_contact_id ?? null, item.notes ?? null,
      item.duration_min ?? null,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyRunsheetItem(
  id: number,
  updates: Partial<Omit<PartyRunsheetItem, "id" | "party_id" | "created_at">>
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(
    `UPDATE party_runsheet SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deletePartyRunsheetItem(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_runsheet WHERE id = $1", [id]);
}

/** Reordena o run-of-show gravando `position` pela posição na lista. */
export async function reorderPartyRunsheet(orderedIds: number[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE party_runsheet SET position = $1 WHERE id = $2", [i, orderedIds[i]]);
  }
}

/** "Pendências com a casa" — campo único na festa (alvará/segurança/bar). */
export async function getPartyHousePending(partyId: number): Promise<string | null> {
  const rows = await getDb().select<{ house_pending: string | null }[]>(
    "SELECT house_pending FROM parties WHERE id = $1",
    [partyId]
  );
  return rows[0]?.house_pending ?? null;
}

export async function setPartyHousePending(partyId: number, value: string | null): Promise<void> {
  await getDb().execute(
    "UPDATE parties SET house_pending = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [value || null, partyId]
  );
}

// ===== GUEST LIST / CORTESIAS =====

export async function listPartyGuests(partyId: number): Promise<PartyGuest[]> {
  return getDb().select<PartyGuest[]>(
    "SELECT * FROM party_guests WHERE party_id = $1 ORDER BY created_at",
    [partyId]
  );
}

export async function createPartyGuest(
  guest: Omit<PartyGuest, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_guests (party_id, name, reason, quantity, ref_price, unit_cost, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [guest.party_id, guest.name, guest.reason ?? null, guest.quantity, guest.ref_price, guest.unit_cost ?? 0, guest.status]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyGuest(
  id: number,
  updates: Partial<Omit<PartyGuest, "id" | "party_id" | "created_at">>
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(`UPDATE party_guests SET ${sets} WHERE id = $${values.length}`, values);
}

export async function deletePartyGuest(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_guests WHERE id = $1", [id]);
}

// ===== PARTY TICKET SALES (curva de venda) =====

export async function listPartyTicketSales(partyId: number): Promise<PartyTicketSale[]> {
  return getDb().select<PartyTicketSale[]>(
    "SELECT * FROM party_ticket_sales WHERE party_id = $1 ORDER BY sale_date ASC, id ASC",
    [partyId]
  );
}

export async function createPartyTicketSale(
  sale: Omit<PartyTicketSale, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_ticket_sales (party_id, sale_date, cumulative_sold, note)
     VALUES ($1, $2, $3, $4)`,
    [sale.party_id, sale.sale_date, sale.cumulative_sold, sale.note ?? null]
  );
  return Number(res.lastInsertId);
}

export async function deletePartyTicketSale(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_ticket_sales WHERE id = $1", [id]);
}

// ===== PARTY COMPLIANCE (licenças / obrigações) =====

export async function listPartyCompliance(partyId: number): Promise<PartyComplianceItem[]> {
  return getDb().select<PartyComplianceItem[]>(
    "SELECT * FROM party_compliance WHERE party_id = $1 ORDER BY position ASC, id ASC",
    [partyId]
  );
}

export async function createPartyComplianceItem(
  item: Omit<PartyComplianceItem, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_compliance (party_id, category, title, status, protocol, due_date, notes, position, responsavel, valor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      item.party_id, item.category, item.title, item.status,
      item.protocol ?? null, item.due_date ?? null, item.notes ?? null, item.position,
      item.responsavel ?? null, item.valor ?? null,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyComplianceItem(
  id: number,
  updates: Partial<Omit<PartyComplianceItem, "id" | "party_id" | "created_at">>
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(`UPDATE party_compliance SET ${sets} WHERE id = $${values.length}`, values);
}

export async function deletePartyComplianceItem(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_compliance WHERE id = $1", [id]);
}

// ===== MARKETING — ARTES (peças) =====

export async function listPartyMarketingAssets(partyId: number): Promise<PartyMarketingAsset[]> {
  return getDb().select<PartyMarketingAsset[]>(
    "SELECT * FROM party_marketing_assets WHERE party_id = $1 ORDER BY position ASC, id ASC",
    [partyId]
  );
}

export async function createPartyMarketingAsset(
  a: Omit<PartyMarketingAsset, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_marketing_assets (party_id, name, format, due_date, status, link, notes, content_id, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      a.party_id, a.name, a.format ?? null, a.due_date ?? null, a.status,
      a.link ?? null, a.notes ?? null, a.content_id ?? null, a.position,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyMarketingAsset(
  id: number,
  updates: Partial<Omit<PartyMarketingAsset, "id" | "party_id" | "created_at">>
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(`UPDATE party_marketing_assets SET ${sets} WHERE id = $${values.length}`, values);
}

export async function deletePartyMarketingAsset(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_marketing_assets WHERE id = $1", [id]);
}

// ===== MARKETING — CANAIS (ações datadas) =====

export async function listPartyMarketingActions(partyId: number): Promise<PartyMarketingAction[]> {
  return getDb().select<PartyMarketingAction[]>(
    "SELECT * FROM party_marketing_actions WHERE party_id = $1 ORDER BY (date IS NULL), date ASC, position ASC, id ASC",
    [partyId]
  );
}

export async function createPartyMarketingAction(
  a: Omit<PartyMarketingAction, "id" | "created_at">
): Promise<number> {
  const res = await getDb().execute(
    `INSERT INTO party_marketing_actions (party_id, canal, papel, acao, date, done, tracking_code, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      a.party_id, a.canal, a.papel, a.acao ?? null, a.date ?? null,
      a.done ? 1 : 0, a.tracking_code ?? null, a.position,
    ]
  );
  return Number(res.lastInsertId);
}

export async function updatePartyMarketingAction(
  id: number,
  updates: Partial<Omit<PartyMarketingAction, "id" | "party_id" | "created_at">>
): Promise<void> {
  const cols = Object.keys(updates);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((c) => (updates as Record<string, unknown>)[c]);
  values.push(id);
  await getDb().execute(`UPDATE party_marketing_actions SET ${sets} WHERE id = $${values.length}`, values);
}

export async function deletePartyMarketingAction(id: number): Promise<void> {
  await getDb().execute("DELETE FROM party_marketing_actions WHERE id = $1", [id]);
}

// ===== RIDER TEMPLATES (biblioteca de riders reutilizáveis) =====

export async function listRiderTemplates(): Promise<RiderTemplate[]> {
  return getDb().select<RiderTemplate[]>("SELECT * FROM rider_templates ORDER BY name COLLATE NOCASE ASC");
}

export async function createRiderTemplate(name: string, items: string): Promise<number> {
  const res = await getDb().execute(
    "INSERT INTO rider_templates (name, items) VALUES ($1, $2)",
    [name, items]
  );
  return Number(res.lastInsertId);
}

export async function deleteRiderTemplate(id: number): Promise<void> {
  await getDb().execute("DELETE FROM rider_templates WHERE id = $1", [id]);
}

/** Semeia os itens padrão de compliance que ainda não existem (por categoria+título). */
export async function seedDefaultCompliance(partyId: number): Promise<number> {
  const existing = await listPartyCompliance(partyId);
  const have = new Set(existing.map((i) => `${i.category}|${i.title}`.toLowerCase()));
  let pos = existing.reduce((m, i) => Math.max(m, i.position), -1) + 1;
  let created = 0;
  for (const d of DEFAULT_COMPLIANCE_ITEMS) {
    if (have.has(`${d.category}|${d.title}`.toLowerCase())) continue;
    await createPartyComplianceItem({
      party_id: partyId, category: d.category, title: d.title,
      status: d.status, protocol: null, due_date: null, notes: null, position: pos++,
      responsavel: d.responsavel, valor: null,
    });
    created += 1;
  }
  return created;
}

// ===== SÉRIE — DEBRIEF DA EDIÇÃO ANTERIOR =====

/** Lê itens de uma lista (JSON array preferido; senão, texto quebrado por linha). */
function readDebriefItems(itemsJson: unknown, legacyText: unknown): string[] {
  if (typeof itemsJson === "string" && itemsJson.trim()) {
    try {
      const p = JSON.parse(itemsJson);
      if (Array.isArray(p)) return p.map((x) => String(x).trim()).filter(Boolean);
    } catch { /* ignora */ }
  }
  if (typeof legacyText === "string" && legacyText.trim()) {
    return legacyText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Plus/Delta da edição ANTERIOR da mesma série — alimenta o bloco "Da edição
 * anterior" da Ideação. Escolhe a edição imediatamente antes (por número; senão
 * por data). Retorna null se a festa não é de série ou não há anterior.
 */
export async function getPreviousEditionDebrief(
  partyId: number
): Promise<{ editionLabel: string | null; plus: string[]; delta: string[] } | null> {
  const db = getDb();
  const rows = await db.select<{ id: number; series_id: number | null; edition_number: number | null; edition_label: string | null; date: string | null }[]>(
    "SELECT id, series_id, edition_number, edition_label, date FROM parties"
  );
  const cur = rows.find((r) => r.id === partyId);
  if (!cur?.series_id) return null;
  const siblings = rows.filter((r) => r.series_id === cur.series_id && r.id !== partyId);
  if (siblings.length === 0) return null;

  let prev: (typeof siblings)[number] | undefined;
  if (cur.edition_number != null) {
    prev = siblings
      .filter((s) => s.edition_number != null && s.edition_number < cur.edition_number!)
      .sort((a, b) => b.edition_number! - a.edition_number!)[0];
  }
  if (!prev) {
    prev = siblings
      .filter((s) => s.date && (!cur.date || s.date < cur.date))
      .sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
  }
  if (!prev) return null;

  const stages = await listPartyStages(prev.id);
  const concr = stages.find((s) => s.name === "Concretização");
  if (!concr) return null;
  const f = concr.fields;
  const plus = readDebriefItems(f.plus_items, f.plus);
  const delta = readDebriefItems(f.delta_items, f.delta);
  if (plus.length === 0 && delta.length === 0) return null;
  return { editionLabel: prev.edition_label, plus, delta };
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
    `INSERT INTO party_tasks (party_id, stage_id, title, status, priority, due_date, notes, responsavel_contact_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      task.party_id, task.stage_id ?? null, task.title,
      task.status, task.priority, task.due_date ?? null, task.notes ?? null,
      task.responsavel_contact_id ?? null,
    ]
  );
  return Number(res.lastInsertId);
}

// ===== FINANCEIRO SYNC =====

export async function syncPartyToFinanceiro(
  party: PartyDeserialized,
  _tickets: PartyTicket[],
  _budgetItems: PartyBudgetItem[]
): Promise<void> {
  if (party.financial_synced) return;
  const db = getDb();
  // Delega para o sync agregado e idempotente do Financeiro: 1 receita
  // (soma dos ingressos) + 1 despesa (soma do orçamento), deduplicadas por
  // party_id+kind. A versão antiga inseria uma linha POR ingresso e POR item
  // de orçamento — que DUPLICAVAM as linhas agregadas já criadas por
  // syncPartyTransactions a cada edição. Os parâmetros tickets/budgetItems
  // ficam só por compatibilidade de assinatura (a soma é lida do banco).
  const { syncPartyTransactions } = await import("@/modules/finance/api");
  await syncPartyTransactions(party.id);
  await db.execute(
    "UPDATE parties SET financial_synced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [party.id]
  );
}

