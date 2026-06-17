/**
 * Integração bidirecional com o Todoist (REST API v2).
 * Token pessoal + projeto específico, armazenados em app_settings.
 * Não usa nenhuma dependência extra — apenas fetch() nativo.
 */
import { getDb } from "./db";
import type { TaskPriority, TaskStatus } from "@/modules/tasks/types";

// ────────────────────────────────────────────────
// Configuração (app_settings)
// ────────────────────────────────────────────────

const KEY_TOKEN = "todoist_token";
const KEY_PROJECT = "todoist_project_id";
const KEY_LAST_SYNC = "todoist_last_sync";

async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value]
  );
}

export async function getTodoistConfig(): Promise<{
  token: string | null;
  projectId: string | null;
  lastSync: string | null;
}> {
  const [token, projectId, lastSync] = await Promise.all([
    getSetting(KEY_TOKEN),
    getSetting(KEY_PROJECT),
    getSetting(KEY_LAST_SYNC),
  ]);
  return { token, projectId, lastSync };
}

export async function saveTodoistConfig(
  token: string,
  projectId: string
): Promise<void> {
  await Promise.all([
    setSetting(KEY_TOKEN, token),
    setSetting(KEY_PROJECT, projectId),
  ]);
}

export async function clearTodoistConfig(): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM app_settings WHERE key IN ($1, $2, $3)", [
    KEY_TOKEN,
    KEY_PROJECT,
    KEY_LAST_SYNC,
  ]);
}

// ────────────────────────────────────────────────
// Todoist REST API v2
// ────────────────────────────────────────────────

const BASE = "https://api.todoist.com/rest/v2";

type TodoistTask = {
  id: string;
  content: string;
  description: string;
  project_id: string;
  due: { date: string } | null;
  priority: 1 | 2 | 3 | 4; // 1=normal, 2=médio, 3=alto, 4=urgente
  is_completed: boolean;
  created_at: string;
  updated_at?: string;
  labels: string[];
};

type TodoistProject = { id: string; name: string };

async function api<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Todoist API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function listTodoistProjects(
  token: string
): Promise<TodoistProject[]> {
  return api<TodoistProject[]>(token, "GET", "/projects");
}

async function fetchProjectTasks(
  token: string,
  projectId: string
): Promise<TodoistTask[]> {
  return api<TodoistTask[]>(
    token,
    "GET",
    `/tasks?project_id=${encodeURIComponent(projectId)}`
  );
}

async function createTodoistTask(
  token: string,
  projectId: string,
  task: { content: string; description: string; due_date?: string; priority: number }
): Promise<TodoistTask> {
  return api<TodoistTask>(token, "POST", "/tasks", {
    ...task,
    project_id: projectId,
  });
}

async function updateTodoistTask(
  token: string,
  todoistId: string,
  patch: { content?: string; description?: string; due_date?: string | null; priority?: number }
): Promise<void> {
  await api(token, "POST", `/tasks/${todoistId}`, patch);
}

async function closeTodoistTask(token: string, todoistId: string): Promise<void> {
  await api(token, "POST", `/tasks/${todoistId}/close`);
}

// ────────────────────────────────────────────────
// Mapeamento de prioridades
// ────────────────────────────────────────────────

function todoistPriorityToVistage(p: number): TaskPriority {
  if (p === 4) return "Urgente";
  if (p === 3) return "Alta";
  if (p === 2) return "Média";
  return "Baixa";
}

function vistagePriorityToTodoist(p: TaskPriority): number {
  if (p === "Urgente") return 4;
  if (p === "Alta") return 3;
  if (p === "Média") return 2;
  return 1;
}

// ────────────────────────────────────────────────
// Sincronização bidirecional
// ────────────────────────────────────────────────

type LocalTask = {
  id: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  todoist_id: string | null;
  updated_at: string;
};

type SyncResult = {
  pushed: number;
  pulled: number;
  updated: number;
  completed: number;
};

export async function syncTodoist(): Promise<SyncResult> {
  const { token, projectId } = await getTodoistConfig();
  if (!token || !projectId) throw new Error("Todoist não configurado");

  const db = getDb();
  const result: SyncResult = { pushed: 0, pulled: 0, updated: 0, completed: 0 };

  // Busca tarefas locais (não canceladas) e tarefas do Todoist em paralelo
  const [localTasks, todoistTasks] = await Promise.all([
    db.select<LocalTask[]>(
      `SELECT id, title, description, priority, status, due_date, todoist_id, updated_at
         FROM tasks WHERE status <> 'Cancelada'`
    ),
    fetchProjectTasks(token, projectId),
  ]);

  const todoistById = new Map(todoistTasks.map((t) => [t.id, t]));
  const localByTodoistId = new Map(
    localTasks.filter((t) => t.todoist_id).map((t) => [t.todoist_id!, t])
  );

  // ── 1. Puxa tarefas do Todoist que não existem localmente ──────────────────
  for (const tt of todoistTasks) {
    if (localByTodoistId.has(tt.id)) continue;
    if (tt.is_completed) continue; // não importa concluídas sem vínculo local

    const priority = todoistPriorityToVistage(tt.priority);
    const res = await db.execute(
      `INSERT INTO tasks (title, description, priority, status, due_date, todoist_id, created_at, updated_at)
       VALUES ($1, $2, $3, 'A fazer', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        tt.content,
        tt.description || null,
        priority,
        tt.due?.date ?? null,
        tt.id,
      ]
    );
    localByTodoistId.set(tt.id, {
      id: Number(res.lastInsertId),
      title: tt.content,
      description: tt.description || null,
      priority,
      status: "A fazer",
      due_date: tt.due?.date ?? null,
      todoist_id: tt.id,
      updated_at: new Date().toISOString(),
    });
    result.pulled++;
  }

  // ── 2. Para tarefas locais com todoist_id, sincroniza estado ───────────────
  for (const lt of localTasks) {
    if (!lt.todoist_id) continue;
    const tt = todoistById.get(lt.todoist_id);

    // Todoist concluiu → conclui localmente
    if (tt?.is_completed && lt.status !== "Concluída") {
      await db.execute(
        "UPDATE tasks SET status='Concluída', updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [lt.id]
      );
      result.completed++;
      continue;
    }

    // Local concluiu → fecha no Todoist
    if (lt.status === "Concluída" && tt && !tt.is_completed) {
      await closeTodoistTask(token, lt.todoist_id);
      result.completed++;
      continue;
    }

    // Todoist sumiu da lista (deletado lá) → ignora, mantém local
    if (!tt) continue;

    // Sincroniza campos se o Todoist mudou depois da última sync
    const lastSync = await getSetting(KEY_LAST_SYNC);
    const todoistUpdated = tt.updated_at ?? tt.created_at;
    if (lastSync && todoistUpdated > lastSync) {
      await db.execute(
        `UPDATE tasks SET title=$1, description=$2, priority=$3, due_date=$4,
           updated_at=CURRENT_TIMESTAMP WHERE id=$5`,
        [
          tt.content,
          tt.description || null,
          todoistPriorityToVistage(tt.priority),
          tt.due?.date ?? null,
          lt.id,
        ]
      );
      result.updated++;
    }
  }

  // ── 3. Empurra tarefas locais sem todoist_id para o Todoist ────────────────
  const localWithoutTodoist = localTasks.filter(
    (t) => !t.todoist_id && t.status !== "Concluída" && t.status !== "Cancelada"
  );
  for (const lt of localWithoutTodoist) {
    const tt = await createTodoistTask(token, projectId, {
      content: lt.title,
      description: lt.description ?? "",
      due_date: lt.due_date ?? undefined,
      priority: vistagePriorityToTodoist(lt.priority),
    });
    await db.execute(
      "UPDATE tasks SET todoist_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2",
      [tt.id, lt.id]
    );
    result.pushed++;
  }

  // ── 4. Atualiza campos de tarefas locais já vinculadas que mudaram ─────────
  const lastSync = await getSetting(KEY_LAST_SYNC);
  for (const lt of localTasks) {
    if (!lt.todoist_id) continue;
    if (lt.status === "Concluída") continue;
    const tt = todoistById.get(lt.todoist_id);
    if (!tt || tt.is_completed) continue;

    if (!lastSync || lt.updated_at > lastSync) {
      await updateTodoistTask(token, lt.todoist_id, {
        content: lt.title,
        description: lt.description ?? "",
        due_date: lt.due_date ?? null,
        priority: vistagePriorityToTodoist(lt.priority),
      });
    }
  }

  await setSetting(KEY_LAST_SYNC, new Date().toISOString());
  return result;
}

/** Desvincula todas as tarefas locais do Todoist (não deleta nada no Todoist). */
export async function unlinkAllTodoist(): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE tasks SET todoist_id=NULL WHERE todoist_id IS NOT NULL",
    []
  );
  await clearTodoistConfig();
}
