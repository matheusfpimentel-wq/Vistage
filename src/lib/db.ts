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
