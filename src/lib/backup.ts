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
  "party_stages",
  "party_budget_items",
  "party_tickets",
  "party_tasks",
  "music_projects",
  "tracks",
  "track_collaborators",
  "track_flow_sessions",
  "track_media_targets",
  "music_project_costs",
  "track_performance_snapshots",
  "gig_tracks",
  "gig_setlists",
  "suppliers",
  "supplier_services",
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
  app: "musicgest";
  tables: Record<TableName, Record<string, unknown>[]>;
};

/**
 * Lê todas as tabelas do banco e gera um objeto Backup completo.
 * Não inclui anexos físicos (uploads/) — eles ficam na pasta apontada
 * pelo musicgest.config.json e devem ser copiados separadamente.
 */
/**
 * Chaves de app_settings que guardam segredos (tokens OAuth e client_secret do
 * Google). Nunca entram no backup — senão vazariam em texto puro no JSON,
 * inclusive no arquivo que sobe para o Google Drive.
 */
function isSensitiveSettingKey(key: unknown): boolean {
  return typeof key === "string" && /client_secret|access_token|refresh_token/.test(key);
}

export async function buildBackup(): Promise<Backup> {
  const db = getDb();
  const tables = {} as Backup["tables"];
  for (const t of TABLES) {
    if (t === "gcal_auth") {
      tables[t] = []; // tokens do Google nunca entram no backup
      continue;
    }
    let rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
    if (t === "app_settings") {
      rows = rows.filter((r) => !isSensitiveSettingKey(r.key));
    }
    tables[t] = rows;
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "musicgest",
    tables,
  };
}

/** Abre o diálogo de salvar e grava o backup em disco. Retorna o caminho. */
export async function exportBackupToFile(): Promise<string | null> {
  const backup = await buildBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const path = await saveDialog({
    title: "Exportar backup do MusicGest",
    defaultPath: `musicgest-backup-${stamp}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, JSON.stringify(backup, null, 2));
  return path;
}

/**
 * Valida o envelope de um backup (app, versão, tabelas) antes de qualquer
 * operação destrutiva. Lança erro descritivo se inválido. Usado tanto na
 * importação por arquivo quanto na restauração vinda do Google Drive.
 */
export function validateBackup(parsed: unknown): Backup {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Arquivo de backup inválido ou vazio.");
  }
  const p = parsed as Partial<Backup>;
  if (p.app !== "musicgest") {
    throw new Error("Arquivo não é um backup do MusicGest.");
  }
  if (typeof p.version !== "number" || p.version > BACKUP_VERSION) {
    throw new Error(
      `Versão do backup (${p.version}) é mais nova que a suportada por este app.`
    );
  }
  if (!p.tables || typeof p.tables !== "object") {
    throw new Error("Backup sem tabelas — arquivo corrompido ou incompleto.");
  }
  return p as Backup;
}

/** Abre o diálogo, lê o JSON e valida o formato. */
export async function pickBackupFile(): Promise<Backup | null> {
  const file = await openDialog({
    multiple: false,
    title: "Selecione o arquivo de backup",
    filters: [{ name: "Backup MusicGest", extensions: ["json"] }],
  });
  if (!file || typeof file !== "string") return null;
  const raw = await readTextFile(file);
  return validateBackup(JSON.parse(raw));
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
  validateBackup(backup);
  const db = getDb();
  let restoredRows = 0;

  // Colunas reais de cada tabela, para validar o que vem do backup contra o
  // schema atual: descarta colunas desconhecidas (corrupção / drift de schema)
  // e impede injeção de identificador no INSERT.
  const realCols = new Map<TableName, Set<string>>();
  for (const t of TABLES) {
    const info = await db.select<{ name: string }[]>(
      `SELECT name FROM pragma_table_info('${t}')`
    );
    realCols.set(t, new Set(info.map((c) => c.name)));
  }

  await db.execute("BEGIN");
  try {
    // Adia a checagem de FK até o COMMIT: assim a ordem de DELETE/INSERT não
    // precisa ser perfeita e a restauração nunca falha no meio por FK.
    await db.execute("PRAGMA defer_foreign_keys = ON");

    // limpa na ordem inversa (filhos antes de pais)
    for (const t of [...TABLES].reverse()) {
      await db.execute(`DELETE FROM ${t}`);
    }

    // reinsere na ordem original (pais antes de filhos)
    for (const t of TABLES) {
      const allowed = realCols.get(t)!;
      const rows = backup.tables[t] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => allowed.has(c));
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
