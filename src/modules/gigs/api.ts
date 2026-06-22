import { getDb } from "@/lib/db";
import { toLocalISODate } from "@/lib/format";
import { emitDataChanged } from "@/lib/events";
import type { Gig, GigCreateInput, GigUpdateInput, GigStatus } from "./types";

const GIG_COLUMNS = [
  "id",
  "date",
  "start_time",
  "end_time",
  "time_slots",
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
  "cache_paid_pct",
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
  "gig_equipment",
  "event_category",
  "recurring_event_name",
  "rating_contractor",
  "is_special",
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
  eventCategory?: string;
  recurringEventName?: string;
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
  if (filters.eventCategory && filters.eventCategory.trim().length > 0) {
    params.push(filters.eventCategory);
    where.push(`event_category = $${params.length}`);
  }
  if (filters.recurringEventName && filters.recurringEventName.trim().length > 0) {
    params.push(filters.recurringEventName);
    where.push(`recurring_event_name = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q, q, q, q, q, q, q, q, q, q, q);
    const i = params.length;
    where.push(
      `(venue_name LIKE $${i - 11} OR venue_city LIKE $${i - 10} OR briefing LIKE $${i - 9} OR event_name LIKE $${i - 8} OR recurring_event_name LIKE $${i - 7} OR event_category LIKE $${i - 6} OR targets LIKE $${i - 5} OR concrete_goals LIKE $${i - 4} OR opportunities LIKE $${i - 3} OR set_concept LIKE $${i - 2} OR day_contact_name LIKE $${i - 1} OR general_notes LIKE $${i})`
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
  const id = Number(res.lastInsertId);
  emitDataChanged();
  return id;
}

export async function updateGig(input: GigUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  // Status ANTERIOR — pra rodar os efeitos colaterais de mudança de status só na
  // TRANSIÇÃO, e não toda vez que uma GIG já concluída é salva de novo (o que
  // re-fechava tarefas recém-criadas no debrief e re-disparava o resto).
  let prevStatus: string | null = null;
  if ("status" in rest) {
    const prow = await db.select<{ status: string }[]>(
      "SELECT status FROM gigs WHERE id = $1",
      [id]
    );
    prevStatus = prow[0]?.status ?? null;
  }
  const statusChangedTo = (s: string) => "status" in rest && rest.status === s && prevStatus !== s;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE gigs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  // Auto-complete prep task when GIG is concluded (só na transição PARA Concluída)
  if (statusChangedTo("Concluída")) {
    // Marca debrief como pendente se as avaliações não estiverem todas preenchidas
    // (a menos que o debrief já tenha sido finalizado).
    try {
      const rrows = await db.select<{ rating_charisma: number | null; rating_technique: number | null; rating_repertoire: number | null; rating_contractor: number | null; debrief_completed_at: string | null }[]>(
        "SELECT rating_charisma, rating_technique, rating_repertoire, rating_contractor, debrief_completed_at FROM gigs WHERE id = $1", [id]
      );
      const r = rrows[0];
      if (r && !r.debrief_completed_at) {
        const ratingsComplete =
          r.rating_charisma != null && r.rating_technique != null &&
          r.rating_repertoire != null && r.rating_contractor != null;
        await db.execute("UPDATE gigs SET debrief_pending = $1 WHERE id = $2", [ratingsComplete ? 0 : 1, id]);
      }
    } catch { /* não interrompe */ }
    const rows = await db.select<{ prep_task_id: number | null; debrief_task_id: number | null; event_name: string | null; venue_name: string | null; date: string | null }[]>(
      "SELECT prep_task_id, debrief_task_id, event_name, venue_name, date FROM gigs WHERE id = $1", [id]
    );
    const prepTaskId = rows[0]?.prep_task_id;
    if (prepTaskId) {
      await db.execute(
        `UPDATE tasks SET status='Concluída', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status<>'Concluída'`,
        [prepTaskId]
      ).catch(() => {});
    }
    // Espelhamento: conclui as demais tarefas de preparação vinculadas à GIG,
    // exceto a de cobrança (payment_task_id), que sobrevive até o cachê entrar.
    await syncGigLinkedTasksStatus(id, "Concluída", { keepPaymentTask: true }).catch(() => {});
    // Auto-create debrief task (idempotent)
    try {
      const gigRow = rows[0];
      if (gigRow && !gigRow.debrief_task_id) {
        const label = gigRow.event_name?.trim() || gigRow.venue_name?.trim() || "GIG";
        let debriefDue: string | null = null;
        if (gigRow.date) {
          const d = new Date(`${gigRow.date}T00:00:00`);
          d.setDate(d.getDate() + 2);
          debriefDue = d.toISOString().slice(0, 10);
        }
        const { createTask } = await import("@/modules/tasks/api");
        const debriefTaskId = await createTask({
          title: `Debrief: ${label}`,
          description: "Avaliar performance, cachê, relacionamento com promotor e equipe",
          category: "Pessoal",
          priority: "Média",
          status: "A fazer",
          due_date: debriefDue,
          gig_id: null,
          contact_id: null,
          tags: ["debrief", "gig"],
        });
        await db.execute(
          "UPDATE gigs SET debrief_task_id = $1 WHERE id = $2",
          [debriefTaskId, id]
        );
      }
    } catch {
      // never crash the main update
    }
  }
  // Espelhamento: GIG cancelada → cancela todas as tarefas vinculadas ainda abertas.
  if (statusChangedTo("Cancelada")) {
    await syncGigLinkedTasksStatus(id, "Cancelada").catch(() => {});
  }
  // Saiu de "Concluída" (ex.: voltou pra Confirmada por engano): o debrief deixa
  // de fazer sentido. Limpa a pendência pra não competir com a "Preparação" na
  // lista nem aparecer como debrief pendente no dashboard. O histórico já
  // preenchido (debrief_completed_at) é preservado.
  if ("status" in rest && rest.status !== "Concluída" && prevStatus === "Concluída") {
    await db
      .execute("UPDATE gigs SET debrief_pending = 0 WHERE id = $1 AND debrief_pending = 1", [id])
      .catch(() => {});
    // Remove a tarefa de debrief auto-criada — sem isso ela fica "órfã" na lista
    // de tarefas como se a GIG ainda estivesse concluída. (Os campos já
    // preenchidos do debrief, se houver, continuam na GIG.)
    try {
      const drow = await db.select<{ debrief_task_id: number | null }[]>(
        "SELECT debrief_task_id FROM gigs WHERE id = $1",
        [id]
      );
      const dtid = drow[0]?.debrief_task_id;
      if (dtid) {
        const { deleteTask } = await import("@/modules/tasks/api");
        await deleteTask(dtid).catch(() => {});
        await db.execute("UPDATE gigs SET debrief_task_id = NULL WHERE id = $1", [id]).catch(() => {});
      }
    } catch { /* não interrompe */ }
  }
  // Debrief finalizado → conclui a tarefa "Debrief: ..." (não faz sentido ela
  // continuar aberta depois que o debrief foi preenchido).
  if ("debrief_completed_at" in rest && rest.debrief_completed_at) {
    try {
      const drow = await db.select<{ debrief_task_id: number | null }[]>(
        "SELECT debrief_task_id FROM gigs WHERE id = $1",
        [id]
      );
      const dtid = drow[0]?.debrief_task_id;
      if (dtid) {
        await db
          .execute(
            "UPDATE tasks SET status='Concluída', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status<>'Concluída'",
            [dtid]
          )
          .catch(() => {});
      }
    } catch { /* não interrompe */ }
  }
  // Mantém o Financeiro sincronizado quando payment_status ou cache_amount mudam.
  // Só sincroniza se o payment_status ficou num estado de pagamento real, ou se
  // já existia sincronização (para refletir mudanças no valor do cachê).
  // Evita duplicatas: sempre usa upsert por gig_id+gig_sync=1 em syncGigPaymentTransaction.
  if ("payment_status" in rest || "cache_amount" in rest || "cache_paid_pct" in rest) {
    try {
      const row = await db.select<{ payment_status: string | null; cache_amount: number | null; cache_paid_pct: number | null; event_name: string | null; venue_name: string | null; recurring_event_name: string | null; date: string | null; payment_due_date: string | null; promoter_contact_id: number | null; payment_method: string | null; payment_task_id: number | null }[]>(
        "SELECT payment_status, cache_amount, cache_paid_pct, event_name, venue_name, recurring_event_name, date, payment_due_date, promoter_contact_id, payment_method, payment_task_id FROM gigs WHERE id = $1", [id]
      );
      const g = row[0];
      if (g) {
        const paid =
          g.payment_status === "Pago integralmente" ||
          g.payment_status === "Pago parcialmente";
        const fullyPaid = g.payment_status === "Pago integralmente";
        const cache = g.cache_amount ?? 0;
        let pct: number;
        if (g.cache_paid_pct !== null && g.cache_paid_pct !== undefined) {
          pct = g.cache_paid_pct / 100;
        } else {
          pct = 1;
        }
        const received = cache * pct;
        const baseName = g.recurring_event_name?.trim()
          ? g.event_name?.trim()
            ? `${g.recurring_event_name.trim()} - ${g.event_name.trim()}`
            : g.recurring_event_name.trim()
          : g.event_name?.trim() || g.venue_name?.trim() || "GIG";
        const label = `Cachê: ${baseName}`;
        const txDate = g.payment_due_date ?? g.date ?? toLocalISODate();
        const { syncGigPaymentTransaction } = await import("@/modules/finance/api");
        await syncGigPaymentTransaction(id, paid, received, txDate, label, null, g.promoter_contact_id, g.payment_method ?? null, !!g.payment_due_date, g.date ?? null);

        // ── Tarefa de cobrança ───────────────────────────────────────
        // Cria lembrete quando há previsão de recebimento e o cachê ainda não
        // foi integralmente pago; conclui a tarefa quando o pagamento entra.
        try {
          const { createTask } = await import("@/modules/tasks/api");
          const wantTask = !fullyPaid && cache > 0 && !!g.payment_due_date;
          if (wantTask && !g.payment_task_id) {
            const taskId = await createTask({
              title: `Cobrar cachê: ${baseName}`,
              description: g.promoter_contact_id
                ? "Confirmar recebimento do cachê com o contratante."
                : "Confirmar recebimento do cachê.",
              category: "GIG",
              gig_id: id,
              contact_id: g.promoter_contact_id,
              priority: "Alta",
              status: "A fazer",
              due_date: g.payment_due_date,
              tags: ["gig", "cobrança"],
            });
            await db.execute("UPDATE gigs SET payment_task_id = $1 WHERE id = $2", [taskId, id]);
          } else if (g.payment_task_id) {
            if (fullyPaid) {
              await db.execute(
                `UPDATE tasks SET status='Concluída', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status<>'Concluída'`,
                [g.payment_task_id]
              );
            } else if (wantTask) {
              // mantém a data de vencimento da cobrança sincronizada
              await db.execute(
                `UPDATE tasks SET due_date=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
                [g.payment_due_date, g.payment_task_id]
              );
            }
          }
        } catch { /* não interrompe */ }
      }
    } catch { /* não interrompe */ }
  }
  // Sync prep task due_date when gig date changes, and title when event_name/venue_name changes
  if ("date" in rest || "event_name" in rest || "venue_name" in rest) {
    const rows = await db.select<{ prep_task_id: number | null; date: string | null; event_name: string | null; venue_name: string | null }[]>(
      "SELECT prep_task_id, date, event_name, venue_name FROM gigs WHERE id = $1", [id]
    );
    const prepTaskId = rows[0]?.prep_task_id;
    if (prepTaskId) {
      const { updateTask } = await import("@/modules/tasks/api");
      const taskUpdate: Parameters<typeof updateTask>[0] = { id: prepTaskId };
      if ("date" in rest) {
        const gigDate = rest.date as string | null;
        let prepDue: string | null = gigDate;
        if (gigDate) {
          const d = new Date(`${gigDate}T00:00:00`);
          d.setDate(d.getDate() - 2);
          prepDue = d.toISOString().slice(0, 10);
        }
        taskUpdate.due_date = prepDue;
      }
      if ("event_name" in rest || "venue_name" in rest) {
        const eventName = ("event_name" in rest ? rest.event_name as string | null : rows[0]?.event_name) ?? null;
        const venueName = ("venue_name" in rest ? rest.venue_name as string : rows[0]?.venue_name) ?? "";
        const title = eventName
          ? `Preparação - ${eventName}`
          : `Preparação - GIG ${("date" in rest ? rest.date as string | null : rows[0]?.date) ?? "sem data"}`;
        taskUpdate.title = title;
        taskUpdate.description = venueName || null;
      }
      await updateTask(taskUpdate);
    }
  }
  emitDataChanged();
}

/**
 * Espelha o estado da GIG nas tarefas vinculadas por gig_id.
 * Só mexe em tarefas ainda abertas — não ressuscita concluídas/canceladas.
 * Com `keepPaymentTask`, preserva a tarefa de cobrança (payment_task_id),
 * que precisa continuar aberta até o cachê ser efetivamente recebido.
 */
async function syncGigLinkedTasksStatus(
  gigId: number,
  status: "Concluída" | "Cancelada",
  opts?: { keepPaymentTask?: boolean }
): Promise<void> {
  const db = getDb();
  let exceptId: number | null = null;
  if (opts?.keepPaymentTask) {
    const rows = await db.select<{ payment_task_id: number | null }[]>(
      "SELECT payment_task_id FROM gigs WHERE id = $1",
      [gigId]
    );
    exceptId = rows[0]?.payment_task_id ?? null;
  }
  await db.execute(
    `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE gig_id = $2
         AND status NOT IN ('Concluída', 'Cancelada')
         AND ($3 IS NULL OR id <> $3)`,
    [status, gigId, exceptId]
  );
  emitDataChanged();
}

export async function deleteGig(id: number): Promise<void> {
  const db = getDb();
  // Busca prep_task_id antes de deletar
  const gigRows = await db.select<{ prep_task_id: number | null }[]>(
    "SELECT prep_task_id FROM gigs WHERE id = $1",
    [id]
  );
  const prepTaskId = gigRows[0]?.prep_task_id ?? null;
  // mantém o financeiro integrado: ao excluir a GIG, apaga também a receita
  // vinculada (senão vira lançamento fantasma com gig_id nulo).
  await db.execute(
    "DELETE FROM finance_transactions WHERE gig_id = $1",
    [id]
  );
  // Apaga tarefas vinculadas à GIG pelo gig_id
  await db.execute("DELETE FROM tasks WHERE gig_id = $1", [id]);
  await db.execute("DELETE FROM gigs WHERE id = $1", [id]);
  // Apaga a prep task da GIG se existir
  if (prepTaskId) {
    await db.execute("DELETE FROM tasks WHERE id = $1", [prepTaskId]);
  }
  emitDataChanged();
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
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;

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
  // A preparação vence 2 dias antes da GIG, pra não aparecer empilhada com
  // ela no mesmo dia do calendário e dar margem real de preparo.
  let prepDue = gig.date;
  if (gig.date) {
    const d = new Date(`${gig.date}T00:00:00`);
    d.setDate(d.getDate() - 2);
    prepDue = d.toISOString().slice(0, 10);
  }
  return createTask({
    title,
    description: gig.venue_name ?? null,
    category: "GIG",
    gig_id: gig.id,
    contact_id: null,
    priority: "Alta",
    status: "A fazer",
    due_date: prepDue,
    tags: ["gig", "preparação"],
  });
}


export async function updateGigCityForVenue(venueId: number, city: string | null): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE gigs SET venue_city = $1 WHERE venue_id = $2", [city, venueId]);
}
