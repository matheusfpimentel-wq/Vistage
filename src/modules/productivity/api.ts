import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { toLocalISODate } from "@/lib/format";
import { updateTask } from "@/modules/tasks/api";

// Rituais de produtividade — Top 3 (priorities) + reflexão (journal_entries).
// Dois escopos: 'day' (encerramento diário) e 'week' (revisão semanal guiada).
// Tabelas criadas na migração v185; registradas em backup/limpeza/CSV.

export type RitualScope = "day" | "week";

export type Priority = {
  id: number;
  scope: RitualScope;
  target_date: string;
  sort: number;
  title: string;
  task_id: number | null;
  done: boolean;
  /** Derivado (LEFT JOIN): status da tarefa vinculada, se houver. */
  task_status?: string | null;
};

/** Um item do Top 3 ao montar: texto livre e/ou vínculo com uma tarefa. */
export type PriorityInput = { title: string; task_id?: number | null };

// ── Datas (semana começa na segunda) ─────────────────────────────────────────
export function todayISO(): string {
  return toLocalISODate(new Date());
}
export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
}
/** 2ª-feira da semana que contém `date`. É a chave do Top 3 semanal. */
export function weekMondayISO(date: Date = new Date()): string {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda … 6 = domingo
  d.setDate(d.getDate() - dow);
  return toLocalISODate(d);
}

/** Dias corridos desde uma data ISO (YYYY-MM-DD), ou Infinity se nula. */
export function daysSinceISO(iso: string | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

// ── Top 3 (priorities) ───────────────────────────────────────────────────────
type PriorityRow = Omit<Priority, "done"> & { done: number };

export async function getPriorities(
  scope: RitualScope,
  targetDate: string
): Promise<Priority[]> {
  const rows = await getDb().select<PriorityRow[]>(
    `SELECT p.id, p.scope, p.target_date, p.sort, p.title, p.task_id, p.done,
            t.status AS task_status
       FROM priorities p
       LEFT JOIN tasks t ON t.id = p.task_id
      WHERE p.scope = $1 AND p.target_date = $2
      ORDER BY p.sort ASC, p.id ASC`,
    [scope, targetDate]
  );
  return rows.map((r) => ({ ...r, done: !!r.done }));
}

/**
 * SUBSTITUI o Top N de (scope, targetDate) pelos itens dados, na ordem. Itens
 * vazios (sem título e sem tarefa) são ignorados. Idempotente por (scope, data).
 */
export async function setPriorities(
  scope: RitualScope,
  targetDate: string,
  items: PriorityInput[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM priorities WHERE scope = $1 AND target_date = $2", [
    scope,
    targetDate,
  ]);
  let sort = 0;
  for (const it of items) {
    const title = (it.title ?? "").trim();
    if (!title && it.task_id == null) continue;
    await db.execute(
      "INSERT INTO priorities (scope, target_date, sort, title, task_id, done) VALUES ($1,$2,$3,$4,$5,0)",
      [scope, targetDate, sort++, title, it.task_id ?? null]
    );
  }
  emitDataChanged();
}

/** Marca/desmarca um item. Concluir um item VINCULADO a tarefa conclui a tarefa
 *  (mesmo caminho do módulo de Tarefas — dispara mirrors/KR). Desmarcar não
 *  reabre a tarefa (evita mexer em recorrência). */
export async function togglePriorityDone(id: number, done: boolean): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE priorities SET done = $1 WHERE id = $2", [done ? 1 : 0, id]);
  if (done) {
    const rows = await db.select<{ task_id: number | null }[]>(
      "SELECT task_id FROM priorities WHERE id = $1",
      [id]
    );
    const taskId = rows[0]?.task_id;
    if (taskId) {
      try {
        await updateTask({ id: taskId, status: "Concluída" });
      } catch {
        /* não trava o check da prioridade */
      }
    }
  }
  emitDataChanged();
}

// ── Reflexão (journal_entries) ───────────────────────────────────────────────
export async function getJournal(scope: RitualScope, entryDate: string): Promise<string> {
  const rows = await getDb().select<{ body: string }[]>(
    "SELECT body FROM journal_entries WHERE scope = $1 AND entry_date = $2 ORDER BY id DESC LIMIT 1",
    [scope, entryDate]
  );
  return rows[0]?.body ?? "";
}

export async function saveJournal(
  scope: RitualScope,
  entryDate: string,
  body: string
): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ id: number }[]>(
    "SELECT id FROM journal_entries WHERE scope = $1 AND entry_date = $2 ORDER BY id DESC LIMIT 1",
    [scope, entryDate]
  );
  if (rows[0]) {
    await db.execute(
      "UPDATE journal_entries SET body = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [body, rows[0].id]
    );
  } else {
    await db.execute(
      "INSERT INTO journal_entries (scope, entry_date, body) VALUES ($1,$2,$3)",
      [scope, entryDate, body]
    );
  }
  emitDataChanged();
}

// ── Pendências pro ritual + candidatas pro Top 3 ─────────────────────────────
export type OpenTask = {
  id: number;
  title: string;
  due_date: string | null;
  priority: string | null;
  status: string;
};

/** Tarefas abertas vencidas ou de hoje — o "o que ficou aberto" do encerramento. */
export async function listOpenTasksToday(): Promise<OpenTask[]> {
  return getDb().select<OpenTask[]>(
    `SELECT id, title, due_date, priority, status FROM tasks
      WHERE status NOT IN ('Concluída', 'Cancelada')
        AND due_date IS NOT NULL AND due_date <= $1
      ORDER BY due_date ASC`,
    [todayISO()]
  );
}

/** Candidatas pro picker do Top 3 — abertas, vencimento primeiro. */
export async function listTaskCandidates(limit = 60): Promise<OpenTask[]> {
  return getDb().select<OpenTask[]>(
    `SELECT id, title, due_date, priority, status FROM tasks
      WHERE status NOT IN ('Concluída', 'Cancelada')
      ORDER BY (due_date IS NULL), due_date ASC, created_at DESC
      LIMIT $1`,
    [limit]
  );
}

/** Data do último encerramento (registro 'day') — pro empurrãozinho na home. */
export async function lastShutdownDate(): Promise<string | null> {
  const rows = await getDb().select<{ entry_date: string }[]>(
    "SELECT entry_date FROM journal_entries WHERE scope = 'day' ORDER BY entry_date DESC LIMIT 1"
  );
  return rows[0]?.entry_date ?? null;
}

/** Data da última revisão semanal (registro 'week') — pro nudge de >7 dias. */
export async function lastWeeklyReviewDate(): Promise<string | null> {
  const rows = await getDb().select<{ entry_date: string }[]>(
    "SELECT entry_date FROM journal_entries WHERE scope = 'week' ORDER BY entry_date DESC LIMIT 1"
  );
  return rows[0]?.entry_date ?? null;
}
