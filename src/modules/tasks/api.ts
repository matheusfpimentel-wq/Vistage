import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Subtask,
  Task,
  TaskCategory,
  TaskCreateInput,
  TaskLink,
  TaskLinkType,
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
  /** Filtra por tarefas vinculadas a um tipo de entidade (inbox unificada). */
  linkType?: TaskLinkType;
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
  if (filters.linkType) {
    params.push(filters.linkType);
    where.push(
      `EXISTS (SELECT 1 FROM task_links tl WHERE tl.task_id = tasks.id AND tl.entity_type = $${params.length})`
    );
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
  const rows = await getDb().select<TaskRow[]>("SELECT * FROM tasks WHERE id = $1", [id]);
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
  if (rest.status != null && id != null) {
    // Caminho inverso: concluir a tarefa de etapa de uma track ("Mixar X")
    // avança a track para o próximo stage automaticamente.
    if (rest.status === "Concluída") {
      try {
        const { advanceTrackForCompletedStageTask } = await import("@/modules/music/api");
        await advanceTrackForCompletedStageTask(id);
      } catch {
        /* não interrompe a conclusão da tarefa */
      }
    }
    // Espelho de status → origem (ex.: concluir preparação marca a GIG pronta).
    try {
      const rows = await db.select<{ derived_type: string | null; derived_id: number | null }[]>(
        "SELECT derived_type, derived_id FROM tasks WHERE id = $1",
        [id]
      );
      const d = rows[0];
      if (d?.derived_type && d.derived_id != null) {
        const { mirrorDerivedStatusToSource } = await import("./derived");
        await mirrorDerivedStatusToSource(d.derived_type, d.derived_id, rest.status as string);
      }
    } catch {
      /* não interrompe */
    }
  }
}

export async function deleteTask(id: number): Promise<void> {
  const db = getDb();
  // Se a tarefa estava espelhada no Todoist, propaga a EXCLUSÃO pra lá — senão a
  // próxima sync a veria "órfã" e a reimportaria como se fosse nova.
  let todoistId: string | null = null;
  try {
    const rows = await db.select<{ todoist_id: string | null }[]>(
      "SELECT todoist_id FROM tasks WHERE id = $1",
      [id]
    );
    todoistId = rows[0]?.todoist_id ?? null;
    if (todoistId) {
      const { tombstoneTodoistTask } = await import("@/lib/todoist");
      await tombstoneTodoistTask(todoistId);
    }
  } catch {
    // A lápide falhou antes de ser gravada (o que prevenia a reimportação).
    // Grava direto aqui como garantia: a próxima sync apaga no Todoist e NÃO
    // reimporta a tarefa recém-excluída. Não impede a exclusão local.
    if (todoistId) {
      await db
        .execute("INSERT OR IGNORE INTO todoist_tombstones (todoist_id) VALUES ($1)", [todoistId])
        .catch(() => {});
    }
  }
  // "Não quero a tarefa": limpa o backlink na origem (não recria, não mexe nela).
  try {
    const { clearTaskBacklinks } = await import("./derived");
    await clearTaskBacklinks(id);
  } catch {
    /* ignora */
  }
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
  const db = getDb();
  // Reivindica a conclusão de forma atômica. Se um duplo-clique disparar duas
  // chamadas antes do React re-renderizar, só a primeira pega rowsAffected=1 e
  // cria a próxima ocorrência — a segunda vê 0 e sai sem duplicar a recorrência.
  const claim = await db.execute(
    `UPDATE tasks SET status = 'Concluída', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status <> 'Concluída'`,
    [task.id]
  );
  if (Number(claim.rowsAffected) === 0) return null;
  emitDataChanged();

  // Mesmo efeito colateral de updateTask: concluir a tarefa de etapa de uma
  // track avança a track para o próximo stage automaticamente.
  if (task.id != null) {
    try {
      const { advanceTrackForCompletedStageTask } = await import(
        "@/modules/music/api"
      );
      await advanceTrackForCompletedStageTask(task.id);
    } catch {
      /* não interrompe a conclusão da tarefa */
    }
  }

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

// ============================================================
// Task links — vínculos polimórficos
// ============================================================

export async function listTaskLinks(taskId: number): Promise<TaskLink[]> {
  const db = getDb();
  return db.select<TaskLink[]>(
    "SELECT * FROM task_links WHERE task_id = $1 ORDER BY created_at ASC",
    [taskId]
  );
}

/**
 * Substitui todos os vínculos de uma tarefa pelos fornecidos.
 * Usado ao salvar o TaskForm (tanto criação quanto edição).
 */
export async function setTaskLinks(
  taskId: number,
  links: { entity_type: TaskLinkType; entity_id: number; label: string | null }[]
): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM task_links WHERE task_id = $1", [taskId]);
  for (const l of links) {
    await db.execute(
      "INSERT OR IGNORE INTO task_links (task_id, entity_type, entity_id, label) VALUES ($1, $2, $3, $4)",
      [taskId, l.entity_type, l.entity_id, l.label]
    );
  }
}

/**
 * Adiciona UM vínculo polimórfico a uma tarefa sem mexer nos demais (diferente
 * de setTaskLinks, que substitui tudo). Usado pelo painel inverso — vincular uma
 * tarefa existente a partir do Conteúdo/GIG/etc. Idempotente.
 */
export async function addTaskLink(
  taskId: number,
  entityType: TaskLinkType,
  entityId: number,
  label: string | null
): Promise<void> {
  await getDb().execute(
    "INSERT OR IGNORE INTO task_links (task_id, entity_type, entity_id, label) VALUES ($1, $2, $3, $4)",
    [taskId, entityType, entityId, label]
  );
  emitDataChanged();
}

/** Remove UM vínculo polimórfico específico (task ↔ entidade). */
export async function removeTaskLink(
  taskId: number,
  entityType: TaskLinkType,
  entityId: number
): Promise<void> {
  await getDb().execute(
    "DELETE FROM task_links WHERE task_id = $1 AND entity_type = $2 AND entity_id = $3",
    [taskId, entityType, entityId]
  );
  emitDataChanged();
}

/**
 * Remove os vínculos polimórficos que apontam para uma entidade excluída.
 * A FK de task_links cobre só o lado task_id (ON DELETE CASCADE); o lado
 * polimórfico (entity_type/entity_id) não pode ter FK, então sem isto sobram
 * vínculos-fantasma apontando para fãs/festas/tracks já apagados (a tarefa
 * continua exibindo o link cacheado de algo que não existe mais).
 */
export async function unlinkTasksFromEntity(
  entityType: TaskLinkType,
  entityId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM task_links WHERE entity_type = $1 AND entity_id = $2",
    [entityType, entityId]
  );
}

/** Tarefas vinculadas a qualquer entidade (para o painel inverso). */
export async function listTasksLinkedTo(
  entityType: string,
  entityId: number
): Promise<Task[]> {
  const db = getDb();
  const rows = await db.select<TaskRow[]>(
    `SELECT t.* FROM tasks t
       JOIN task_links tl ON tl.task_id = t.id
      WHERE tl.entity_type = $1 AND tl.entity_id = $2
      ORDER BY t.due_date ASC, t.created_at DESC`,
    [entityType, entityId]
  );
  return rows.map(rowToTask);
}

/**
 * Espelha o estado de uma entidade nas tarefas vinculadas a ela.
 * Só mexe em tarefas ainda abertas (não "ressuscita" concluídas/canceladas).
 * Usado quando uma track é lançada, uma festa é realizada, etc.
 */
export async function syncLinkedTasksStatus(
  entityType: string,
  entityId: number,
  status: TaskStatus
): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT task_id FROM task_links WHERE entity_type = $2 AND entity_id = $3
       )
       AND status NOT IN ('Concluída', 'Cancelada')`,
    [status, entityType, entityId]
  );
  emitDataChanged();
}

/** Conta tarefas abertas vinculadas a uma entidade (para badges de pendência). */
export async function countOpenTasksLinkedTo(
  entityType: string,
  entityId: number
): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM tasks t
       JOIN task_links tl ON tl.task_id = t.id
      WHERE tl.entity_type = $1 AND tl.entity_id = $2
        AND t.status NOT IN ('Concluída', 'Cancelada')`,
    [entityType, entityId]
  );
  return rows[0]?.n ?? 0;
}

/**
 * Versão em lote: conta as tarefas abertas de TODAS as entidades de um tipo numa
 * única query agrupada. Usada pelo PendingTasksProvider para evitar N+1 (um
 * SELECT por selo) em telas de lista. Só entram entidades com ≥1 tarefa aberta.
 */
export async function countOpenTasksByEntity(
  entityType: string
): Promise<Map<number, number>> {
  const db = getDb();
  const rows = await db.select<{ entity_id: number; n: number }[]>(
    `SELECT tl.entity_id AS entity_id, COUNT(*) AS n
       FROM tasks t
       JOIN task_links tl ON tl.task_id = t.id
      WHERE tl.entity_type = $1
        AND t.status NOT IN ('Concluída', 'Cancelada')
      GROUP BY tl.entity_id`,
    [entityType]
  );
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.entity_id, r.n);
  return map;
}
