import Database from "@tauri-apps/plugin-sql";
import { runMigrations } from "./migrations";

let dbInstance: Database | null = null;
let currentPath: string | null = null;

/** Carrega o banco SQLite a partir do caminho absoluto e roda as migrations. */
export async function loadDatabase(absolutePath: string): Promise<Database> {
  if (dbInstance && currentPath === absolutePath) return dbInstance;
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
  // tauri-plugin-sql aceita "sqlite:<caminho-absoluto>".
  const db = await Database.load(`sqlite:${absolutePath}`);
  await db.execute("PRAGMA foreign_keys = ON;");
  await runMigrations(db);
  dbInstance = db;
  currentPath = absolutePath;
  return db;
}

export function getDb(): Database {
  if (!dbInstance) {
    throw new Error(
      "Banco de dados ainda não foi carregado. Execute loadDatabase() primeiro."
    );
  }
  return dbInstance;
}

export function getDbPath(): string | null {
  return currentPath;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    currentPath = null;
  }
}

export type DbErrorKind = "not_found" | "locked" | "corrupted" | "permission" | "unknown";

export type DbErrorInfo = {
  kind: DbErrorKind;
  title: string;
  hint: string;
};

/**
 * Classifica o erro bruto do SQLite/Tauri em algo acionável para o usuário.
 * Os dados ficam num HD externo, então distinguir "desconectado" de
 * "corrompido" muda completamente o que a pessoa deve fazer.
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
      hint: "O arquivo do banco não foi localizado. Verifique se o HD externo está conectado e se a pasta dos dados não foi movida, depois tente de novo.",
    };
  }
  if (e.includes("locked") || e.includes("busy")) {
    return {
      kind: "locked",
      title: "Banco em uso",
      hint: "O banco está bloqueado por outro processo. Feche outras janelas do Vistage (ou outro programa usando o arquivo) e tente novamente.",
    };
  }
  if (e.includes("malformed") || e.includes("corrupt") || e.includes("not a database")) {
    return {
      kind: "corrupted",
      title: "Banco corrompido",
      hint: "O arquivo do banco parece danificado. Restaure o backup mais recente (local ou Google Drive) para recuperar seus dados.",
    };
  }
  if (e.includes("permission") || e.includes("denied") || e.includes("readonly") || e.includes("os error 13")) {
    return {
      kind: "permission",
      title: "Sem permissão de acesso",
      hint: "O sistema negou acesso ao arquivo do banco. Verifique as permissões da pasta ou se o HD está em modo somente-leitura.",
    };
  }
  return {
    kind: "unknown",
    title: "Falha ao abrir o banco",
    hint: "Ocorreu um erro inesperado ao abrir o banco. Verifique se o HD externo está conectado e tente novamente.",
  };
}
