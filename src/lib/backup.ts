import { getDb } from "./db";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/** Versão do formato de backup. Bump se mudar o schema de exportação. */
const BACKUP_VERSION = 1;

const TABLES = [
  // ── sem dependências ──────────────────────────────────────────────────────
  "app_settings",
  "gcal_auth",
  "venues",          // contacts.venue_id → venues  (deve vir antes de contacts)
  "fans",
  "fan_groups",
  "students",
  "class_packages",
  "artist_identity",
  "artist_templates",
  "parties",
  "music_projects",
  "finance_categories",
  "equipment",
  "work_sessions",
  "highlights",
  "okrs",
  "decisions",
  "ideas",
  "content",
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contacts",        // venue_id → venues
  "fan_interactions",        // fan_id → fans
  "fan_group_members",       // fan_id → fans, group_id → fan_groups
  "student_packages",        // student_id → students, package_id → class_packages
  "party_costs",             // party_id → parties
  "tracks",                  // project_id → music_projects
  "music_project_costs",     // project_id → music_projects
  "finance_transactions",    // category_id → finance_categories
  "finance_recurring",       // category_id → finance_categories
  "content_snapshots",       // content_id → content
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contact_interactions",    // contact_id → contacts
  "gigs",                    // venue_id → venues, promoter_contact_id → contacts
  "classes",                 // student_id → students
  "track_collaborators",     // track_id → tracks
  "track_flow_sessions",     // track_id → tracks
  "track_media_targets",     // track_id → tracks
  "track_performance_snapshots", // track_id → tracks
  // ── dependem do nível anterior ────────────────────────────────────────────
  "gig_debrief_drafts",      // gig_id → gigs
  "tasks",                   // gig_id → gigs, contact_id → contacts
  // ── dependem do nível anterior ────────────────────────────────────────────
  "subtasks",                // task_id → tasks
  "okr_kr_tasks",            // okr_id → okrs, task_id → tasks
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
 * dados do backup.
 *
 * IMPORTANTE: nada de BEGIN/COMMIT/ROLLBACK manual aqui. O tauri-plugin-sql
 * usa um pool de conexões; uma transação aberta numa conexão enquanto os
 * comandos seguintes caem em outras gera "cannot rollback - no transaction
 * is active" e deixa o banco travado ("database is locked"). Cada execute é
 * atômico por si só. Para preservar consistência, limpamos tudo primeiro e
 * só então reinserimos; um erro no meio é propagado para a UI avisar.
 */
export async function restoreBackup(backup: Backup): Promise<{
  restoredTables: number;
  restoredRows: number;
}> {
  const db = getDb();
  let restoredRows = 0;

  // PRAGMA foreign_keys é por-conexão no SQLite. O tauri-plugin-sql usa um
  // pool, portanto não há garantia de que o PRAGMA setado numa execute afete
  // as demais. A correção principal é a ordem topológica das tabelas (pais
  // antes de filhos), que elimina qualquer violação mesmo com FK=ON.
  // Mesmo assim, tentamos desligar FK antes de cada execute como salvaguarda.
  try {
    // limpa na ordem inversa (filhos antes de pais)
    for (const t of [...TABLES].reverse()) {
      await db.execute("PRAGMA foreign_keys = OFF");
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
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }

  return { restoredTables: TABLES.length, restoredRows };
}
