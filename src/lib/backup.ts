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
  "suppliers",
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contacts",        // venue_id → venues
  "fan_interactions",        // fan_id → fans
  "fan_group_members",       // fan_id → fans, group_id → fan_groups
  "student_packages",        // student_id → students, package_id → class_packages
  "party_costs",             // party_id → parties
  "party_stages",            // party_id → parties
  "party_budget_items",      // party_id → parties
  "party_tickets",           // party_id → parties
  "party_venue_candidates",  // party_id → parties, venue_id → venues
  "supplier_services",       // supplier_id → suppliers
  "content_scenes",          // content_id → content
  "tracks",                  // project_id → music_projects
  "music_project_costs",     // project_id → music_projects
  "finance_transactions",    // category_id → finance_categories
  "finance_recurring",       // category_id → finance_categories
  "content_snapshots",       // content_id → content
  // ── dependem do nível anterior ────────────────────────────────────────────
  "contact_interactions",    // contact_id → contacts
  "gigs",                    // venue_id → venues, promoter_contact_id → contacts
  "classes",                 // student_id → students
  "party_tasks",             // party_id → parties, stage_id → party_stages
  "track_collaborators",     // track_id → tracks
  "track_flow_sessions",     // track_id → tracks
  "track_media_targets",     // track_id → tracks
  "track_performance_snapshots", // track_id → tracks
  // ── dependem do nível anterior ────────────────────────────────────────────
  "gig_debrief_drafts",      // gig_id → gigs
  "gig_setlists",            // gig_id → gigs
  "gig_tracks",              // gig_id → gigs, track_id → tracks
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
/**
 * Colunas de foreign key ANULÁVEIS que são inseridas como NULL na primeira
 * passagem e restauradas numa segunda passagem (apenas se o id referenciado
 * existir). Isso torna o restore imune a:
 *  - ordem de inserção entre tabelas (inclui ciclos: gigs↔tasks)
 *  - referências órfãs (parent ausente no backup) → ficam NULL em vez de quebrar
 *  - PRAGMA foreign_keys instável no pool de conexões do tauri-plugin-sql
 *
 * Colunas FK NOT NULL / parte de PK não entram aqui: são satisfeitas pela
 * ordem topológica de TABLES (pais antes de filhos).
 *
 * Formato: { tabela: { coluna: tabelaReferenciada } }
 */
const DEFERRED_FK: Partial<Record<TableName, Record<string, TableName>>> = {
  contacts: { venue_id: "venues" },
  gigs: {
    promoter_contact_id: "contacts",
    venue_id: "venues",
    main_goal_task_id: "tasks",
  },
  tasks: { gig_id: "gigs", contact_id: "contacts" },
  finance_transactions: {
    category_id: "finance_categories",
    gig_id: "gigs",
    contact_id: "contacts",
  },
  finance_recurring: { category_id: "finance_categories" },
  equipment: { transaction_id: "finance_transactions" },
  fan_group_members: { fan_id: "fans" },
  student_packages: { package_id: "class_packages" },
  classes: { student_package_id: "student_packages" },
  party_tasks: { stage_id: "party_stages" },
  music_project_costs: { project_id: "music_projects", track_id: "tracks" },
};

export async function restoreBackup(backup: Backup): Promise<{
  restoredTables: number;
  restoredRows: number;
}> {
  const db = getDb();
  let restoredRows = 0;

  // Conjunto de ids presentes no backup por tabela — usado na 2ª passagem
  // para só restaurar FKs cujo parent realmente existe (descarta órfãos).
  const idsByTable = new Map<string, Set<unknown>>();
  for (const t of TABLES) {
    const set = new Set<unknown>();
    for (const row of backup.tables[t] ?? []) {
      if (row["id"] != null) set.add(row["id"]);
    }
    idsByTable.set(t, set);
  }

  // Apenas tabelas presentes no backup (chave existe). Tabelas ausentes são
  // ignoradas na limpeza e inserção para não apagar dados de versões mais novas.
  const tablesInBackup = new Set(
    TABLES.filter((t) => Object.prototype.hasOwnProperty.call(backup.tables, t))
  );

  try {
    // limpa na ordem inversa (filhos antes de pais) — só tabelas do backup
    for (const t of [...TABLES].reverse()) {
      if (!tablesInBackup.has(t)) continue;
      await db.execute("PRAGMA foreign_keys = OFF");
      await db.execute(`DELETE FROM ${t}`);
    }

    // 1ª passagem: insere na ordem topológica, omitindo as colunas FK
    // anuláveis (DEFERRED_FK) — elas entram como NULL.
    for (const t of TABLES) {
      if (!tablesInBackup.has(t)) continue;
      const rows = backup.tables[t] ?? [];
      const deferred = DEFERRED_FK[t] ?? {};
      for (const row of rows) {
        await db.execute("PRAGMA foreign_keys = OFF");
        const insertCols = Object.keys(row).filter((c) => !(c in deferred));
        if (insertCols.length === 0) continue;
        const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
        const values = insertCols.map((c) => row[c]);
        await db.execute(
          `INSERT INTO ${t} (${insertCols.join(", ")}) VALUES (${placeholders})`,
          values
        );
        restoredRows += 1;
      }
    }

    // 2ª passagem: restaura as colunas FK adiadas, somente quando o id
    // referenciado existe na sua tabela (caso contrário, mantém NULL).
    for (const t of TABLES) {
      if (!tablesInBackup.has(t)) continue;
      const deferred = DEFERRED_FK[t];
      if (!deferred) continue;
      const rows = backup.tables[t] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const [col, refTable] of Object.entries(deferred)) {
          const val = row[col];
          if (val == null) continue;
          if (!idsByTable.get(refTable)?.has(val)) continue; // órfão → deixa NULL
          await db.execute("PRAGMA foreign_keys = OFF");
          await db.execute(
            `UPDATE ${t} SET ${col} = $1 WHERE id = $2`,
            [val, id]
          );
        }
      }
    }
  } finally {
    await db.execute("PRAGMA foreign_keys = ON");
  }

  return { restoredTables: tablesInBackup.size, restoredRows };
}
