import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";

export const CSV_ENTITIES = [
  { key: "gigs", label: "GIGs", table: "gigs" },
  { key: "contacts", label: "Contatos (CRM)", table: "contacts" },
  { key: "venues", label: "Venues", table: "venues" },
  { key: "fans", label: "Fãs", table: "fans" },
  { key: "tasks", label: "Tarefas", table: "tasks" },
  { key: "content", label: "Conteúdos", table: "content" },
  { key: "ideas", label: "Ideias", table: "ideas" },
  { key: "students", label: "Alunos", table: "students" },
  { key: "music_projects", label: "Projetos musicais", table: "music_projects" },
  { key: "tracks", label: "Tracks", table: "tracks" },
  { key: "classes", label: "Aulas (sessões)", table: "classes" },
  {
    key: "class_packages",
    label: "Pacotes de aulas (templates)",
    table: "class_packages",
  },
  {
    key: "finance_transactions",
    label: "Transações financeiras",
    table: "finance_transactions",
  },
  {
    key: "finance_categories",
    label: "Categorias financeiras",
    table: "finance_categories",
  },
] as const;

export type CsvEntityKey = (typeof CSV_ENTITIES)[number]["key"];

// ============================================================
// Encode / Decode
// ============================================================

function csvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c])).join(","));
  }
  return lines.join("\n");
}

/**
 * Parser CSV simples (suporta campos entre aspas com vírgulas e quebras
 * de linha, e aspas escapadas como ""). Retorna matriz de strings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// ============================================================
// Operations
// ============================================================

export async function exportEntityCsv(table: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${table}`);
  if (rows.length === 0) {
    throw new Error(`Tabela "${table}" está vazia — nada pra exportar.`);
  }
  const columns = Object.keys(rows[0]);
  const csv = buildCsv(columns, rows);

  const stamp = new Date().toISOString().slice(0, 10);
  const path = await saveDialog({
    title: `Exportar ${table} em CSV`,
    defaultPath: `musicgest-${table}-${stamp}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, csv);
  return path;
}

export async function pickAndParseCsv(): Promise<string[][] | null> {
  const file = await openDialog({
    multiple: false,
    title: "Selecionar arquivo CSV",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!file || typeof file !== "string") return null;
  const text = await readTextFile(file);
  return parseCsv(text);
}

export type ImportMode = "append" | "replace";

export type ImportResult = {
  inserted: number;
  skipped: number;
  errors: string[];
};

/**
 * Importa o conteúdo de um CSV pra uma tabela.
 *
 * - `replace`: limpa a tabela inteira antes de inserir
 * - `append`: tenta inserir cada linha; ignora duplicatas por PK
 *
 * O cabeçalho do CSV deve bater com as colunas da tabela. Colunas extras
 * no CSV são ignoradas; colunas ausentes ficam NULL. O campo `id` é
 * preservado (não regenerado) pra manter relacionamentos.
 */
export async function importCsvIntoTable(
  table: string,
  data: string[][],
  mode: ImportMode
): Promise<ImportResult> {
  if (data.length < 2) {
    return { inserted: 0, skipped: 0, errors: ["CSV vazio ou só com cabeçalho"] };
  }
  const db = getDb();
  const header = data[0];
  const rows = data.slice(1);

  // descobre colunas reais da tabela
  const sample = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM ${table} LIMIT 1`
  );
  let realCols: string[] = [];
  if (sample[0]) {
    realCols = Object.keys(sample[0]);
  } else {
    // tabela vazia: usa pragma_table_info
    const pragma = await db.select<{ name: string }[]>(
      `SELECT name FROM pragma_table_info('${table}')`
    );
    realCols = pragma.map((r) => r.name);
  }
  const cols = header.filter((h) => realCols.includes(h));
  if (cols.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      errors: ["Nenhuma coluna do CSV bate com a tabela"],
    };
  }
  const headerIdx: Record<string, number> = {};
  header.forEach((h, i) => (headerIdx[h] = i));

  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] };

  await db.execute("BEGIN");
  try {
    if (mode === "replace") {
      await db.execute(`DELETE FROM ${table}`);
    }

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;

    for (const row of rows) {
      // ignora linhas em branco
      if (row.length === 1 && row[0] === "") continue;
      const values = cols.map((c) => {
        const v = row[headerIdx[c]];
        return v === undefined || v === "" ? null : v;
      });
      try {
        const res = await db.execute(sql, values);
        if (res.rowsAffected > 0) result.inserted += 1;
        else result.skipped += 1;
      } catch (e) {
        result.errors.push(String(e));
        result.skipped += 1;
      }
    }
    await db.execute("COMMIT");
  } catch (e) {
    await db.execute("ROLLBACK");
    throw e;
  }

  return result;
}
