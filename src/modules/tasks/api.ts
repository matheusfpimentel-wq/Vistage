import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Subtask,
  Task,
  TaskCategory,
  TaskCreateInput,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
} from "./types";

type TaskRow = Omit<Task, "tags"> & { tags: string | null };

function rowToTask(r: TaskRow): Task {
  let tags: string[] = [];
  if (r.tags) {
    try {
      tags = JSON.parse(r.tags) as string[];
    } catch {
      tags = [];
    }
  }
  return { ...r, tags };
}

export type TasksDateFilter = "all" | "today" | "week" | "overdue" | "none";

export type TaskFilters = {
  status?: TaskStatus | "Todas";
  category?: TaskCategory | "Todas";
  priority?: TaskPriority | "Todas";
  gigId?: number;
  contactId?: number;
  search?: string;
  date?: TasksDateFilter;
};

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sevenDaysFromNowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.status && filters.status !== "Todas") {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.category && filters.category !== "Todas") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters.priority && filters.priority !== "Todas") {
    params.push(filters.priority);
    where.push(`priority = $${params.length}`);
  }
  if (filters.gigId) {
    params.push(filters.gigId);
    where.push(`gig_id = $${params.length}`);
  }
  if (filters.contactId) {
    params.push(filters.contactId);
    where.push(`contact_id = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q);
    const i = params.length;
    where.push(`(title LIKE $${i - 1} OR description LIKE $${i})`);
  }
  if (filters.date && filters.date !== "all") {
    const today = todayISO();
    switch (filters.date) {
      case "today":
        params.push(today);
        where.push(`due_date = $${params.length}`);
        break;
      case "week":
        params.push(today, sevenDaysFromNowISO());
        where.push(
          `due_date IS NOT NULL AND due_date BETWEEN $${params.length - 1} AND $${params.length}`
        );
        break;
      case "overdue":
        params.push(today);
        where.push(
          `due_date IS NOT NULL AND due_date < $${params.length} AND status NOT IN ('Concluída', 'Cancelada')`
        );
        break;
      case "none":
        where.push(`due_date IS NULL`);
        break;
    }
  }

  const sql =
    `SELECT * FROM tasks` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    // ordem natural: status ativos primeiro, depois por vencimento asc (nulls last), prioridade desc
    ` ORDER BY
        CASE status
          WHEN 'Em andamento' THEN 0
          WHEN 'A fazer' THEN 1
          WHEN 'Concluída' THEN 2
          WHEN 'Cancelada' THEN 3
        END,
        CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
        due_date ASC,
        CASE priority
          WHEN 'Urgente' THEN 0
          WHEN 'Alta' THEN 1
          WHEN 'Média' THEN 2
          WHEN 'Baixa' THEN 3
        END`;
  const rows = await db.select<TaskRow[]>(sql, params);
  return rows.map(rowToTask);
}

export async function getTask(id: number): Promise<Task | null> {
  const db = getDb();
  const rows = await db.select<TaskRow[]>("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function createTask(input: TaskCreateInput): Promise<number> {
  const db = getDb();
  const payload = { ...input, tags: JSON.stringify(input.tags ?? []) };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO tasks (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  emitDataChanged();
  return Number(res.lastInsertId);
}

export async function updateTask(input: TaskUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  await db.execute(
    `UPDATE tasks SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  emitDataChanged();
}

export async function deleteTask(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
  emitDataChanged();
}

// ============================================================
// Subtasks
// ============================================================

export async function listSubtasks(taskId: number): Promise<Subtask[]> {
  const db = getDb();
  return db.select<Subtask[]>(
    "SELECT * FROM subtasks WHERE task_id = $1 ORDER BY position ASC, id ASC",
    [taskId]
  );
}

export async function addSubtask(
  taskId: number,
  title: string,
  position: number
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    "INSERT INTO subtasks (task_id, title, position) VALUES ($1, $2, $3)",
    [taskId, title, position]
  );
  return Number(res.lastInsertId);
}

export async function toggleSubtask(id: number, done: boolean): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE subtasks SET done = $1 WHERE id = $2", [
    done ? 1 : 0,
    id,
  ]);
}

export async function renameSubtask(id: number, title: string): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE subtasks SET title = $1 WHERE id = $2", [title, id]);
}

export async function deleteSubtask(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM subtasks WHERE id = $1", [id]);
}

// ============================================================
// Aggregates / Dashboard
// ============================================================

export async function countUpcoming7Days(): Promise<number> {
  const db = getDb();
  const today = todayISO();
  const week = sevenDaysFromNowISO();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM tasks
      WHERE due_date BETWEEN $1 AND $2
        AND status NOT IN ('Concluída', 'Cancelada')`,
    [today, week]
  );
  return rows[0]?.n ?? 0;
}

export async function listUpcoming(limit = 5): Promise<Task[]> {
  const db = getDb();
  const today = todayISO();
  const week = sevenDaysFromNowISO();
  const rows = await db.select<TaskRow[]>(
    `SELECT * FROM tasks
      WHERE due_date BETWEEN $1 AND $2
        AND status NOT IN ('Concluída', 'Cancelada')
      ORDER BY due_date ASC
      LIMIT $3`,
    [today, week, limit]
  );
  return rows.map(rowToTask);
}


// ============================================================
// Tarefas recorrentes
// ============================================================

/**
 * Marca a task como Concluída. Se tiver recurrence, cria automaticamente
 * uma cópia com due_date adiantada (+7d weekly / +30d monthly).
 * Retorna o id da nova task criada, ou null se não houve recorrência.
 */
export async function completeAndRecur(task: Task): Promise<number | null> {
  await updateTask({ id: task.id, status: "Concluída" });
  if (!task.recurrence) return null;

  let newDue: string;
  if (task.recurrence === "weekly") {
    const base = task.due_date ?? todayISO();
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + 7);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    newDue = `${y}-${mo}-${dy}`;
  } else {
    // monthly — proper +1 month arithmetic, clamped to last day of month
    const base = task.due_date ?? todayISO();
    const d = new Date(`${base}T12:00:00`);
    const targetMonth = d.getMonth() + 1; // 0-based month + 1
    d.setMonth(targetMonth);
    // If month overflowed (e.g. Jan 31 → Mar 2), clamp back to last day
    if (d.getMonth() !== (targetMonth % 12)) {
      d.setDate(0); // day 0 of current month = last day of previous month
    }
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    newDue = `${y}-${mo}-${dy}`;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const res = await db.execute(
    `INSERT INTO tasks (title, description, category, gig_id, contact_id, priority, status, due_date, tags, recurrence, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'A fazer', $7, $8, $9, $10, $11)`,
    [
      task.title,
      task.description,
      task.category,
      task.gig_id,
      task.contact_id,
      task.priority,
      newDue,
      JSON.stringify(task.tags),
      task.recurrence,
      now,
      now,
    ]
  );
  return Number(res.lastInsertId);
}
