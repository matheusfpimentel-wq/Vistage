import { invoke } from "@tauri-apps/api/core";
import { runMigrations } from "./migrations";

type QueryResult = { rowsAffected: number; lastInsertId: number };

/** Um statement de um lote transacional. */
export type BatchStatement = { sql: string; params?: unknown[] };

// Interface mínima do banco usada pelo app (migrations, módulos). Espelha o
// `Database` do antigo tauri-plugin-sql; o proxy abaixo a implementa delegando
// para comandos Tauri que rodam o banco libsql LOCAL no Rust.
export type Db = {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  /**
   * Executa todos os statements numa única transação (BEGIN/COMMIT no Rust).
   * Se qualquer um falhar, faz ROLLBACK e lança — tudo-ou-nada. Devolve o total
   * de linhas afetadas.
   */
  executeBatch(statements: BatchStatement[]): Promise<number>;
};

// Proxy duck-typed com a MESMA interface do `Database` do tauri-plugin-sql.
// As chamadas getDb().select()/execute() seguem funcionando sem mudança.
// O banco libsql roda no Rust (não funciona no JS do webview), então cada
// chamada delega para um comando Tauri.
const dbProxy: Db = {
  async select<T>(sql: string, params?: unknown[]): Promise<T> {
    return invoke<T>("db_select", { sql, params: params ?? [] });
  },
  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    return invoke<QueryResult>("db_execute", { sql, params: params ?? [] });
  },
  async executeBatch(statements: BatchStatement[]): Promise<number> {
    return invoke<number>("db_execute_batch", {
      statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })),
    });
  },
};

export function getDb() {
  return dbProxy;
}

let _initInProgress = false;

/** Abre o banco LOCAL no caminho informado e roda as migrations. */
export async function initDatabase(replicaPath: string): Promise<void> {
  if (_initInProgress) throw new Error("initDatabase já está em andamento — aguarde.");
  _initInProgress = true;
  try {
    await invoke("db_init", { replicaPath });
    await runMigrations(dbProxy);
  } finally {
    _initInProgress = false;
  }
}

export async function closeDatabase(): Promise<void> {}

type DbErrorKind = "not_found" | "locked" | "corrupted" | "permission" | "unknown";

export type DbErrorInfo = {
  kind: DbErrorKind;
  title: string;
  hint: string;
};

/**
 * Classifica o erro bruto do libsql/Tauri ao abrir o banco LOCAL em algo
 * acionável para o usuário.
 */
export function classifyDbError(raw: string): DbErrorInfo {
  const e = raw.toLowerCase();
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
      hint: "O arquivo do banco não pôde ser criado ou localizado. Verifique se a pasta de dados do app existe e tem permissão de escrita.",
    };
  }
  if (e.includes("locked") || e.includes("busy")) {
    return {
      kind: "locked",
      title: "Banco em uso",
      hint: "O banco está bloqueado por outro processo. Feche outras janelas do Vistage e tente novamente.",
    };
  }
  if (e.includes("malformed") || e.includes("corrupt") || e.includes("not a database")) {
    return {
      kind: "corrupted",
      title: "Banco danificado",
      hint: "O arquivo do banco local parece danificado. Abra um documento .vistage recente para restaurar seus dados.",
    };
  }
  if (e.includes("permission") || e.includes("denied") || e.includes("readonly") || e.includes("os error 13")) {
    return {
      kind: "permission",
      title: "Sem permissão de acesso",
      hint: "O sistema negou acesso à pasta de dados do app. Verifique as permissões da pasta.",
    };
  }
  return {
    kind: "unknown",
    title: "Falha ao abrir o banco",
    hint: "Ocorreu um erro inesperado ao abrir o banco local. Tente novamente.",
  };
}
