import { invoke } from "@tauri-apps/api/core";
import { runMigrations } from "./migrations";

type QueryResult = { rowsAffected: number; lastInsertId: number };

// Interface mínima do banco usada pelo app (migrations, módulos). Espelha o
// `Database` do antigo tauri-plugin-sql; o proxy abaixo a implementa delegando
// para comandos Tauri que rodam a réplica libsql no Rust.
export type Db = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
};

// Proxy duck-typed com a MESMA interface do `Database` do tauri-plugin-sql.
// As 756 chamadas getDb().select()/execute() seguem funcionando sem mudança.
// A réplica embarcada do libsql roda no Rust (não funciona no JS do webview),
// então cada chamada delega para um comando Tauri.
const dbProxy: Db = {
  async select<T>(sql: string, params?: unknown[]): Promise<T> {
    return invoke<T>("db_select", { sql, params: params ?? [] });
  },
  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    return invoke<QueryResult>("db_execute", { sql, params: params ?? [] });
  },
};

export function getDb() {
  return dbProxy;
}

let _initInProgress = false;

export async function initDatabase(
  replicaPath: string,
  tursoUrl: string,
  tursoToken: string
): Promise<{ synced: boolean }> {
  if (_initInProgress) throw new Error("initDatabase já está em andamento — aguarde.");
  _initInProgress = true;
  try {
    const synced = await invoke<boolean>("db_init", { replicaPath, tursoUrl, tursoToken });
    await runMigrations(dbProxy);
    return { synced };
  } finally {
    _initInProgress = false;
  }
}

export async function syncDatabase(): Promise<void> {
  await invoke("db_sync").catch(() => {});
}

export async function resetReplica(
  replicaPath: string,
  tursoUrl: string,
  tursoToken: string,
): Promise<void> {
  await invoke("db_reset_replica", { replicaPath, tursoUrl: tursoUrl, tursoToken });
}

export async function closeDatabase(): Promise<void> {}

type DbErrorKind = "not_found" | "locked" | "corrupted" | "permission" | "unknown";

export type DbErrorInfo = {
  kind: DbErrorKind;
  title: string;
  hint: string;
};

/**
 * Classifica o erro bruto do libsql/Turso/Tauri em algo acionável para o
 * usuário. Distinguir "sem conexão" de "token inválido" muda o que a pessoa
 * deve fazer.
 */
export function classifyDbError(raw: string): DbErrorInfo {
  const e = raw.toLowerCase();
  if (
    e.includes("unauthorized") ||
    e.includes("token") ||
    e.includes("auth") ||
    e.includes("403") ||
    e.includes("401")
  ) {
    return {
      kind: "permission",
      title: "Falha de autenticação no Turso",
      hint: "O token de acesso ao banco na nuvem é inválido ou expirou. Verifique as credenciais do Turso e tente novamente.",
    };
  }
  if (
    e.includes("unable to open") ||
    e.includes("no such file") ||
    e.includes("not found") ||
    e.includes("os error 2") ||
    e.includes("cannot find")
  ) {
    return {
      kind: "not_found",
      title: "Banco não encontrado",
      hint: "O arquivo da réplica local não pôde ser criado ou localizado. Verifique se a pasta escolhida existe e tem permissão de escrita.",
    };
  }
  if (e.includes("locked") || e.includes("busy")) {
    return {
      kind: "locked",
      title: "Banco em uso",
      hint: "A réplica está bloqueada por outro processo. Feche outras janelas do Vistage e tente novamente.",
    };
  }
  if (e.includes("malformed") || e.includes("corrupt") || e.includes("not a database")) {
    return {
      kind: "corrupted",
      title: "Réplica corrompida",
      hint: "O arquivo da réplica local parece danificado. Apague a réplica e deixe o app recriá-la a partir do Turso.",
    };
  }
  if (e.includes("permission") || e.includes("denied") || e.includes("readonly") || e.includes("os error 13")) {
    return {
      kind: "permission",
      title: "Sem permissão de acesso",
      hint: "O sistema negou acesso à pasta da réplica. Verifique as permissões da pasta escolhida.",
    };
  }
  return {
    kind: "unknown",
    title: "Falha ao abrir o banco",
    hint: "Ocorreu um erro inesperado ao conectar ao banco. Verifique sua conexão com a internet e tente novamente.",
  };
}
