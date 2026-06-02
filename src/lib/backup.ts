import { getDb } from "./db";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/** Versão do formato de backup. Bump se mudar o schema de exportação. */
const BACKUP_VERSION = 1;

const TABLES = [
  "contacts",
  "contact_interactions",
  "venues",
  "fans",
  "fan_interactions",
  "gigs",
  "gig_debrief_drafts",
  "tasks",
  "subtasks",
  "content",
  "ideas",
  "students",
  "class_packages",
  "student_packages",
  "classes",
  "artist_identity",
  "artist_templates",
  "parties",
  "party_costs",
  "music_projects",
  "tracks",
  "track_collaborators",
  "track_flow_sessions",
  "track_media_targets",
  "music_project_costs",
  "track_performance_snapshots",
  "finance_categories",
  "finance_transactions",
  "finance_recurring",
  "equipment",
  "work_sessions",
  "highlights",
  "okrs",
  "decisions",
  "app_settings",
  "gcal_auth",
] as const;

type TableName = (typeof TABLES)[number];

export type Backup = {
  version: number;
  exportedAt: string;
  app: "vistage" | "musicgest"; // aceita backups antigos do MusicGest
  tables: Record<TableName, Record<string, unknown>[]>;
};

/**
 * Lê todas as tabelas do banco e gera um objeto Backup completo.
 * Não inclui anexos físicos (uploads/) — eles ficam na pasta apontada
 * pelo vistage.config.json e devem ser copiados separadamente.
 */
export async function buildBackup(): Promise<Backup> {
  const db = getDb();
  const tables = {} as Backup["tables"];
  for (const t of TABLES) {
    tables[t] = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "vistage",
    tables,
  };
}

/** Abre o diálogo de salvar e grava o backup em disco. Retorna o caminho. */
export async function exportBackupToFile(): Promise<string | null> {
  const backup = await buildBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const path = await saveDialog({
    title: "Exportar backup do Vistage",
    defaultPath: `vistage-backup-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, JSON.stringify(backup, null, 2));
  return path;
}

/** Abre o diálogo, lê o JSON e valida o formato. */
export async function pickBackupFile(): Promise<Backup | null> {
  const file = await openDialog({
    multiple: false,
    title: "Selecione o arquivo de backup",
    filters: [{ name: "Backup Vistage", extensions: ["json"] }],
  });
  if (!file || typeof file !== "string") return null;
  const raw = await readTextFile(file);
  const parsed = JSON.parse(raw) as Partial<Backup>;
  if (parsed.app !== "vistage" && parsed.app !== "musicgest") {
    throw new Error("Arquivo não é um backup do Vistage.");
  }
  if (typeof parsed.version !== "number" || parsed.version > BACKUP_VERSION) {
    throw new Error(
      `Versão do backup (${parsed.version}) é mais nova que a suportada por este app.`
    );
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error("Backup sem tabelas.");
  }
  return parsed as Backup;
}

/**
 * **Operação destrutiva**: limpa todas as tabelas e reescreve com os
 * dados do backup. Roda dentro de uma transação para que falhas no meio
 * não deixem o banco em estado quebrado.
 */
export async function restoreBackup(backup: Backup): Promise<{
  restoredTables: number;
  restoredRows: number;
}> {
  const db = getDb();
  let restoredRows = 0;

  await db.execute("BEGIN");
  try {
    // limpa na ordem inversa para não ferir foreign keys
    for (const t of [...TABLES].reverse()) {
      await db.execute(`DELETE FROM ${t}`);
    }

    // reinsere na ordem original (pais antes de filhos)
    for (const t of TABLES) {
      const rows = backup.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        const values = cols.map((c) => row[c]);
        await db.execute(
          `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${placeholders})`,
          values
        );
        restoredRows += 1;
      }
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }

  return { restoredTables: TABLES.length, restoredRows };
}
