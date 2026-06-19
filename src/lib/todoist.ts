/**
 * Integração bidirecional com o Todoist (API v1 unificada).
 * As antigas REST v2 / Sync v9 foram descontinuadas (HTTP 410) e migraram pra
 * o prefixo /api/v1; os endpoints de lista agora são paginados ({results,...}).
 * Token pessoal + projeto específico, armazenados em app_settings.
 * Usa o fetch do plugin HTTP do Tauri (passa pela camada Rust) — o fetch nativo
 * do webview falha por CORS, já que a API do Todoist não libera origem de browser.
 */
import { fetch } from "@tauri-apps/plugin-http";
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
// Todoist API v1 (unificada)
// ────────────────────────────────────────────────

const BASE = "https://api.todoist.com/api/v1";

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

/**
 * Endpoints de LISTA na API v1 são paginados: devolvem { results, next_cursor }
 * em vez de um array puro. Seguimos o cursor até o fim (com fallback caso a
 * resposta ainda venha como array).
 */
async function apiList<T>(token: string, path: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url: string = cursor
      ? `${path}${sep}cursor=${encodeURIComponent(cursor)}`
      : path;
    const page = await api<{ results: T[]; next_cursor: string | null } | T[]>(
      token,
      "GET",
      url
    );
    if (Array.isArray(page)) {
      out.push(...page);
      break;
    }
    out.push(...(page.results ?? []));
    cursor = page.next_cursor ?? null;
  } while (cursor);
  return out;
}

type RawTask = {
  id: string | number;
  content?: string;
  description?: string;
  project_id?: string | number;
  due?: { date?: string } | null;
  priority?: number;
  is_completed?: boolean;
  checked?: boolean;
  completed_at?: string | null;
  created_at?: string;
  added_at?: string;
  updated_at?: string;
  labels?: string[];
};

/** Normaliza a tarefa da API v1 pro shape que a sync usa (campos defensivos). */
function normalizeTask(t: RawTask): TodoistTask {
  return {
    id: String(t.id),
    content: t.content ?? "",
    description: t.description ?? "",
    project_id: String(t.project_id ?? ""),
    due: t.due?.date ? { date: t.due.date } : null,
    priority: (t.priority ?? 1) as 1 | 2 | 3 | 4,
    is_completed: Boolean(t.is_completed ?? t.checked ?? t.completed_at != null),
    created_at: t.created_at ?? t.added_at ?? new Date().toISOString(),
    updated_at: t.updated_at,
    labels: t.labels ?? [],
  };
}

export async function listTodoistProjects(
  token: string
): Promise<TodoistProject[]> {
  const raw = await apiList<{ id: string | number; name: string }>(token, "/projects");
  return raw.map((p) => ({ id: String(p.id), name: p.name }));
}

async function fetchProjectTasks(
  token: string,
  projectId: string
): Promise<TodoistTask[]> {
  const raw = await apiList<RawTask>(
    token,
    `/tasks?project_id=${encodeURIComponent(projectId)}`
  );
  return raw.map(normalizeTask);
}

async function createTodoistTask(
  token: string,
  projectId: string,
  task: { content: string; description: string; due_date?: string; priority: number }
): Promise<TodoistTask> {
  const raw = await api<RawTask>(token, "POST", "/tasks", {
    ...task,
    project_id: projectId,
  });
  return normalizeTask(raw);
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

/** Apaga DE VEZ a tarefa no Todoist. 404 é tratado como sucesso (já não existe). */
async function deleteTodoistTask(token: string, todoistId: string): Promise<void> {
  try {
    await api(token, "DELETE", `/tasks/${todoistId}`);
  } catch (e) {
    if (e instanceof Error && /\b404\b/.test(e.message)) return; // já apagada
    throw e;
  }
}

// ────────────────────────────────────────────────
// Tombstones — exclusões a propagar para o Todoist
// ────────────────────────────────────────────────

/**
 * Marca um todoist_id como "excluído no Vistage". Tenta apagar imediatamente no
 * Todoist; se conseguir, não deixa lápide. Se falhar (offline, sem token), grava
 * a lápide pra próxima sync apagar e, principalmente, pra a sync NÃO reimportar
 * a tarefa como se fosse nova (era esse o bug: excluir aqui e ela voltar).
 */
export async function tombstoneTodoistTask(todoistId: string): Promise<void> {
  const db = getDb();
  const { token } = await getTodoistConfig();
  if (token) {
    try {
      await deleteTodoistTask(token, todoistId);
      return; // apagada no Todoist — sem necessidade de lápide
    } catch {
      /* cai pra lápide abaixo */
    }
  }
  await db
    .execute(
      "INSERT OR IGNORE INTO todoist_tombstones (todoist_id) VALUES ($1)",
      [todoistId]
    )
    .catch(() => {});
}

/** Processa as lápides pendentes: apaga no Todoist e limpa as resolvidas. */
async function flushTombstones(token: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select<{ todoist_id: string }[]>("SELECT todoist_id FROM todoist_tombstones")
    .catch(() => [] as { todoist_id: string }[]);
  const ids = new Set(rows.map((r) => r.todoist_id));
  for (const todoistId of ids) {
    try {
      await deleteTodoistTask(token, todoistId);
      await db.execute("DELETE FROM todoist_tombstones WHERE todoist_id = $1", [todoistId]);
    } catch {
      /* mantém a lápide pra tentar de novo na próxima sync */
    }
  }
  return ids; // usados pra não reimportar nesta mesma sync
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
// Comparação de timestamps
// ────────────────────────────────────────────────

/**
 * Normaliza um timestamp para epoch ms antes de comparar. Sem isso a sync
 * comparava strings de formatos diferentes:
 *  - Todoist/lastSync: ISO-UTC com 'T' e 'Z' ("2026-06-17T20:49:24.000000Z")
 *  - updated_at local: CURRENT_TIMESTAMP do SQLite ("2026-06-17 20:49:24"),
 *    com espaço e SEM zona — e em UTC.
 * Como ' ' (0x20) < 'T' (0x54), `local > lastSync` dava SEMPRE falso e as
 * edições locais nunca eram empurradas pro Todoist. O espaço também faria o
 * JS ler a data como horário local; por isso normalizamos pra ISO-UTC.
 */
function toEpochMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const iso = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
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

  // Antes de tudo: propaga exclusões feitas no Vistage (lápides) pro Todoist.
  // O conjunto retornado é usado pra NÃO reimportar uma tarefa recém-excluída
  // que ainda apareça na resposta da API por timing.
  const tombstoned = await flushTombstones(token);

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

  // Lido UMA vez: representa a sync anterior e não muda até o fim (só gravamos
  // KEY_LAST_SYNC no final). Todas as comparações usam o mesmo valor.
  const lastSync = await getSetting(KEY_LAST_SYNC);

  // ── 1. Puxa tarefas do Todoist que não existem localmente ──────────────────
  for (const tt of todoistTasks) {
    if (localByTodoistId.has(tt.id)) continue;
    if (tombstoned.has(tt.id)) continue; // excluída aqui — não ressuscita
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
    const todoistUpdated = tt.updated_at ?? tt.created_at;
    if (lastSync && toEpochMs(todoistUpdated) > toEpochMs(lastSync)) {
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
  for (const lt of localTasks) {
    if (!lt.todoist_id) continue;
    if (lt.status === "Concluída") continue;
    const tt = todoistById.get(lt.todoist_id);
    if (!tt || tt.is_completed) continue;

    if (!lastSync || toEpochMs(lt.updated_at) > toEpochMs(lastSync)) {
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
