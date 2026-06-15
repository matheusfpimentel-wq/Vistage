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
  // tauri-plugin-sql aceita "sqlite:<caminho-absoluto>". O "?mode=rwc" garante
  // que o arquivo seja aberto para leitura/escrita e criado se não existir, em
  // vez de falhar com "unable to open" (SQLITE_CANTOPEN code 14).
  let db: Database;
  try {
    db = await Database.load(`sqlite:${absolutePath}?mode=rwc`);
  } catch (e) {
    // tauri-plugin-sql guarda a conexão no pool pela connection string. Se a
    // primeira tentativa abriu mas falhou depois, uma reabertura pode pegar a
    // conexão ruim do pool e "Tentar novamente" nunca avança. Garantimos um
    // estado limpo antes de propagar o erro.
    dbInstance = null;
    currentPath = null;
    throw e;
  }
  // IMPORTANTE: em pastas sincronizadas (Google Drive, OneDrive, Dropbox) o WAL
  // mode falha com "unable to open database file" (code 14, SQLITE_CANTOPEN)
  // porque os arquivos auxiliares "-wal" e "-shm" precisam ser criados/mapeados
  // (mmap) na mesma pasta, algo que o cliente do Drive frequentemente bloqueia.
  // O journal mode DELETE não cria esses arquivos persistentes e abre normal.
  // Precisa rodar ANTES de qualquer outra coisa para destravar a abertura.
  try {
    try {
      await db.execute("PRAGMA journal_mode=DELETE;");
    } catch {
      // se já estiver em DELETE ou o pragma falhar, segue — não é fatal
    }
    await db.execute("PRAGMA foreign_keys = ON;");
    await runMigrations(db);
  } catch (e) {
    // fecha a conexão pela qual o erro veio para que "Tentar novamente"
    // recomece do zero, sem reaproveitar uma conexão num estado inconsistente.
    try {
      await db.close();
    } catch {
      // ignora — já estamos tratando o erro original
    }
    dbInstance = null;
    currentPath = null;
    throw e;
  }
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
      hint: "O arquivo do banco não foi localizado. Se ele está no Google Drive ou OneDrive, aguarde a sincronização terminar (ícone na barra de tarefas) e clique em 'Tentar de novo'. Se está num HD externo, verifique se está conectado.",
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
