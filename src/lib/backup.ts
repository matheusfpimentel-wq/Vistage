import { getDb } from "./db";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile, writeFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { useConfigStore } from "./config";

/** Versão do formato de backup. Bump se mudar o schema de exportação. */
const BACKUP_VERSION = 2;

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
  "gig_fans",                // gig_id → gigs, fan_id → fans
  "tasks",                   // gig_id → gigs, contact_id → contacts
  "meetings",                // task_id → tasks
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
  /**
   * Arquivos de anexo incluídos no backup (v2+).
   * Chave: caminho RELATIVO ao uploadsDir (ex: "fans/abc123.jpg").
   * Valor: data URL base64 ("data:image/jpeg;base64,...").
   */
  files?: Record<string, string>;
  /** uploadsDir do sistema de origem — usado para relativizar e restaurar caminhos. */
  uploadsDir?: string;
};

// Colunas que armazenam caminhos de arquivos (caminho absoluto ou relativo).
// extra_flyer_paths é JSON array de caminhos.
const FILE_PATH_COLS: Partial<Record<TableName, string[]>> = {
  gigs:                 ["script_file_path", "banner_file_path", "invoice_file_path"],
  contacts:             ["photo_path"],
  fans:                 ["photo_path"],
  venues:               ["photo_path"],
  equipment:            ["photo_path"],
  finance_transactions: ["receipt_file_path"],
  finance_recurring:    ["receipt_file_path"],
  tracks:               ["daw_project_path", "stems_path", "final_files_path"],
  artist_identity:      ["logo_path", "isotype_path", "presskit_path", "thumbnail_path", "file_path"],
  artist_templates:     ["file_path"],
};

/** Colunas cujo valor é um JSON array de caminhos. */
const FILE_PATH_JSON_COLS: Partial<Record<TableName, string[]>> = {
  gigs: ["extra_flyer_paths"],
};

function joinPath(...parts: string[]): string {
  const sep = parts[0]?.includes("\\") && !parts[0].includes("/") ? "\\" : "/";
  return parts
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .filter(Boolean)
    .join(sep);
}

function relativize(absPath: string, uploadsDir: string): string {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const rel = norm(absPath).replace(norm(uploadsDir).replace(/\/$/, "") + "/", "");
  return rel;
}

async function readAsBase64(absPath: string): Promise<string | null> {
  try {
    const bytes = await readFile(absPath);
    const ext = (absPath.match(/\.([a-zA-Z0-9]+)$/) ?? [])[1]?.toLowerCase() ?? "bin";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "png" ? "image/png"
      : ext === "gif" ? "image/gif"
      : ext === "webp" ? "image/webp"
      : ext === "pdf" ? "application/pdf"
      : "application/octet-stream";
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

/** Reúne todos os caminhos de arquivos do backup e os lê como base64. */
async function collectFiles(
  tables: Backup["tables"],
  uploadsDir: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const [table, cols] of Object.entries(FILE_PATH_COLS) as [TableName, string[]][]) {
    const rows = tables[table] ?? [];
    for (const row of rows) {
      for (const col of cols) {
        const val = row[col];
        if (typeof val !== "string" || !val) continue;
        const rel = relativize(val, uploadsDir);
        if (files[rel] !== undefined) continue;
        const data = await readAsBase64(val);
        if (data) files[rel] = data;
      }
    }
  }
  for (const [table, cols] of Object.entries(FILE_PATH_JSON_COLS) as [TableName, string[]][]) {
    const rows = tables[table] ?? [];
    for (const row of rows) {
      for (const col of cols) {
        const raw = row[col];
        if (typeof raw !== "string" || !raw) continue;
        let paths: unknown[];
        try { paths = JSON.parse(raw); } catch { continue; }
        for (const p of paths) {
          if (typeof p !== "string" || !p) continue;
          const rel = relativize(p, uploadsDir);
          if (files[rel] !== undefined) continue;
          const data = await readAsBase64(p);
          if (data) files[rel] = data;
        }
      }
    }
  }
  return files;
}

/** Restaura arquivos do backup para o uploadsDir atual. */
async function restoreFiles(
  files: Record<string, string>,
  uploadsDir: string
): Promise<void> {
  for (const [rel, dataUrl] of Object.entries(files)) {
    try {
      const absPath = joinPath(uploadsDir, rel);
      const dir = absPath.substring(0, Math.max(absPath.lastIndexOf("/"), absPath.lastIndexOf("\\")));
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
      // base64 → Uint8Array
      const b64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await writeFile(absPath, bytes);
    } catch {
      // arquivo não-crítico — falha silenciosa
    }
  }
}

/**
 * Lê todas as tabelas do banco e gera um objeto Backup completo.
 * Inclui os arquivos de anexo como base64 (v2+) — fotos, flyers, etc.
 */
async function buildBackup(): Promise<Backup> {
  const db = getDb();
  const tables = {} as Backup["tables"];
  for (const t of TABLES) {
    tables[t] = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
  }
  const uploadsDir = useConfigStore.getState().config?.uploadsDir ?? "";
  let files: Record<string, string> = {};
  if (uploadsDir) {
    try {
      files = await collectFiles(tables, uploadsDir);
    } catch {
      // não bloqueia o backup se a leitura de arquivos falhar
    }
  }
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "vistage",
    tables,
    files,
    uploadsDir,
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

  // Colunas reais de cada tabela no banco atual — protege contra backups de
  // versões diferentes do app (colunas a mais ou a menos no backup).
  const tableColumns = new Map<string, Set<string>>();
  for (const t of TABLES) {
    if (!tablesInBackup.has(t)) continue;
    const info = await db.select<{ name: string }[]>(`PRAGMA table_info(${t})`);
    tableColumns.set(t, new Set(info.map((r) => r.name)));
  }

  try {
    // limpa na ordem inversa (filhos antes de pais) — só tabelas do backup
    for (const t of [...TABLES].reverse()) {
      if (!tablesInBackup.has(t)) continue;
      await db.execute("PRAGMA foreign_keys = OFF");
      await db.execute(`DELETE FROM ${t}`);
    }

    // 1ª passagem: insere na ordem topológica, omitindo as colunas FK
    // anuláveis (DEFERRED_FK) — elas entram como NULL.
    // Também filtra colunas que não existem no schema atual.
    for (const t of TABLES) {
      if (!tablesInBackup.has(t)) continue;
      const rows = backup.tables[t] ?? [];
      const deferred = DEFERRED_FK[t] ?? {};
      const existingCols = tableColumns.get(t) ?? new Set<string>();
      for (const row of rows) {
        await db.execute("PRAGMA foreign_keys = OFF");
        const insertCols = Object.keys(row).filter(
          (c) => !(c in deferred) && existingCols.has(c)
        );
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
      const existingCols = tableColumns.get(t) ?? new Set<string>();
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const [col, refTable] of Object.entries(deferred)) {
          if (!existingCols.has(col)) continue; // coluna não existe nesta versão
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

  // Restaura arquivos de anexo (v2+) para o uploadsDir atual
  const uploadsDir = useConfigStore.getState().config?.uploadsDir ?? "";
  if (backup.files && Object.keys(backup.files).length > 0) {
    if (uploadsDir) {
      await restoreFiles(backup.files, uploadsDir).catch(() => {});
    }
  }

  // Rewrite file path columns to use the current uploadsDir
  if (backup.files && backup.uploadsDir && uploadsDir && backup.uploadsDir !== uploadsDir) {
    const oldDir = backup.uploadsDir.replace(/[\\/]+$/, "");
    const newDir = uploadsDir.replace(/[\\/]+$/, "");
    for (const [table, cols] of Object.entries(FILE_PATH_COLS) as [TableName, string[]][]) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const col of cols) {
          const val = row[col];
          if (typeof val !== "string" || !val) continue;
          const normVal = val.replace(/\\/g, "/");
          const normOld = oldDir.replace(/\\/g, "/");
          if (!normVal.startsWith(normOld)) continue;
          const rel = normVal.slice(normOld.length).replace(/^\//, "");
          const newPath = joinPath(newDir, rel);
          await db.execute(
            `UPDATE ${table} SET ${col} = $1 WHERE id = $2`,
            [newPath, id]
          );
        }
      }
    }
    for (const [table, cols] of Object.entries(FILE_PATH_JSON_COLS) as [TableName, string[]][]) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const id = row["id"];
        if (id == null) continue;
        for (const col of cols) {
          const raw = row[col];
          if (typeof raw !== "string" || !raw) continue;
          let paths: unknown[];
          try { paths = JSON.parse(raw); } catch { continue; }
          const updated = paths.map((p) => {
            if (typeof p !== "string") return p;
            const normP = p.replace(/\\/g, "/");
            const normOld = oldDir.replace(/\\/g, "/");
            if (!normP.startsWith(normOld)) return p;
            const rel = normP.slice(normOld.length).replace(/^\//, "");
            return joinPath(newDir, rel);
          });
          await db.execute(
            `UPDATE ${table} SET ${col} = $1 WHERE id = $2`,
            [JSON.stringify(updated), id]
          );
        }
      }
    }
  }

  return { restoredTables: tablesInBackup.size, restoredRows };
}
