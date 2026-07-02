import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { zipSync, strToU8 } from "fflate";
import { getDb } from "./db";

export const CSV_ENTITIES = [
  { key: "gigs", label: "GIGs", table: "gigs" },
  { key: "contacts", label: "Contatos (CRM)", table: "contacts" },
  { key: "venues", label: "Venues", table: "venues" },
  { key: "fans", label: "Fãs", table: "fans" },
  { key: "fan_segments", label: "Fãs: segmentos", table: "fan_segments" },
  { key: "tasks", label: "Tarefas", table: "tasks" },
  { key: "meetings", label: "Reuniões", table: "meetings" },
  { key: "content", label: "Conteúdos", table: "content" },
  { key: "ideas", label: "Ideias", table: "ideas" },
  { key: "idea_collisions", label: "Ideias: colisões", table: "idea_collisions" },
  { key: "students", label: "Alunos", table: "students" },
  { key: "parties", label: "Festas", table: "parties" },
  { key: "party_costs", label: "Custos de festas", table: "party_costs" },
  { key: "music_projects", label: "Projetos musicais", table: "music_projects" },
  { key: "tracks", label: "Tracks", table: "tracks" },
  { key: "track_media_targets", label: "Tracks: mídia alvo", table: "track_media_targets" },
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
  { key: "work_sessions", label: "Sessões de trabalho", table: "work_sessions" },
  { key: "highlights", label: "Highlights", table: "highlights" },
  { key: "performance_weak_points", label: "Apresentação: pontos fracos", table: "performance_weak_points" },
  { key: "performance_moments", label: "Apresentação: momentos", table: "performance_moments" },
  { key: "okrs", label: "OKRs", table: "okrs" },
  { key: "nps_responses", label: "NPS: pesquisa", table: "nps_responses" },
  { key: "library_tracks", label: "Biblioteca: Músicas", table: "library_tracks" },
  { key: "notes", label: "Biblioteca: Notas", table: "notes" },
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
function parseCsv(text: string): string[][] {
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
    throw new Error(`Tabela "${table}" está vazia: nada pra exportar.`);
  }
  const columns = Object.keys(rows[0]);
  const csv = buildCsv(columns, rows);

  const stamp = new Date().toISOString().slice(0, 10);
  const path = await saveDialog({
    title: `Exportar ${table} em CSV`,
    defaultPath: `vistage-${table}-${stamp}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, csv);
  return path;
}

/**
 * Exporta uma lista já filtrada de transações financeiras em CSV, com colunas
 * amigáveis (datas DD/MM/YYYY, categoria por nome, tipo em português). Usado
 * pelo botão "Exportar CSV" do Financeiro, respeitando o filtro atual da tela.
 */
export async function exportTransactionsCsv(
  rows: {
    date: string;
    kind: string;
    description: string | null;
    category_name?: string | null;
    amount: number;
    status: string;
    payment_method?: string | null;
    expense_type?: string | null;
  }[]
): Promise<string | null> {
  if (rows.length === 0) {
    throw new Error("Nenhuma transação no filtro atual: nada pra exportar.");
  }
  const fmtBR = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  };
  const columns = [
    "Data",
    "Tipo",
    "Descrição",
    "Categoria",
    "Valor",
    "Status",
    "Forma de pagamento",
    "Tipo de despesa",
  ];
  const mapped = rows.map((t) => ({
    Data: fmtBR(t.date),
    Tipo: t.kind === "income" ? "Receita" : "Despesa",
    Descrição: t.description ?? "",
    Categoria: t.category_name ?? "",
    Valor: t.amount.toFixed(2).replace(".", ","),
    Status: t.status,
    "Forma de pagamento": t.payment_method ?? "",
    "Tipo de despesa": t.expense_type ?? "",
  }));
  const csv = buildCsv(columns, mapped);
  const stamp = new Date().toISOString().slice(0, 10);
  const path = await saveDialog({
    title: "Exportar transações em CSV",
    defaultPath: `vistage-financeiro-${stamp}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  // BOM para o Excel reconhecer UTF-8 (acentos)
  await writeTextFile(path, "﻿" + csv);
  return path;
}

export type ExportAllResult = {
  path: string;
  files: number;
  skippedEmpty: string[];
};

/**
 * Exporta TODAS as entidades conhecidas (CSV_ENTITIES) num único arquivo .zip
 * escolhido pelo usuário — um .csv por tabela dentro do zip. Tabelas vazias são
 * puladas. Dá portabilidade total dos dados de uma vez só, num arquivo só (mesmo
 * motor fflate do contêiner .vistage).
 */
export async function exportAllCsv(): Promise<ExportAllResult | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const path = await saveDialog({
    title: "Exportar todos os CSVs (.zip)",
    defaultPath: `vistage-csv-${stamp}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
  });
  if (!path) return null;

  const db = getDb();
  const entries: Record<string, Uint8Array> = {};
  let files = 0;
  const skippedEmpty: string[] = [];

  for (const ent of CSV_ENTITIES) {
    const rows = await db
      .select<Record<string, unknown>[]>(`SELECT * FROM ${ent.table}`)
      .catch(() => [] as Record<string, unknown>[]);
    if (rows.length === 0) {
      skippedEmpty.push(ent.label);
      continue;
    }
    const csv = buildCsv(Object.keys(rows[0]), rows);
    // BOM (﻿) para o Excel reconhecer UTF-8 (acentos), igual à exportação avulsa.
    entries[`vistage-${ent.table}-${stamp}.csv`] = strToU8("﻿" + csv);
    files += 1;
  }

  // level 6: CSV é texto e comprime bem (diferente do .vistage, que embala mídia
  // já comprimida e por isso usa store/level 0).
  const bytes = zipSync(entries, { level: 6 });
  await writeFile(path, bytes);

  return { path, files, skippedEmpty };
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

  // IMPORTANTE: nada de BEGIN/COMMIT manual aqui. O tauri-plugin-sql usa um
  // pool de conexões; uma transação aberta numa conexão enquanto os INSERTs
  // caem em outras gera "database is locked" e trava o app. Inserimos linha a
  // linha, cada execute é atômico por si só.
  if (mode === "replace") {
    await db.execute(`DELETE FROM ${table}`);
  }

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;

  let rowNum = 1; // linha 1 = cabeçalho
  for (const row of rows) {
    rowNum += 1;
    // ignora linhas em branco
    if (row.length === 0 || (row.length === 1 && row[0].trim() === "")) {
      continue;
    }
    const values = cols.map((c) => {
      const v = row[headerIdx[c]];
      return v === undefined || v === "" ? null : v;
    });
    try {
      const res = await db.execute(sql, values);
      if (res.rowsAffected > 0) {
        result.inserted += 1;

        // ── Gig-specific enrichment ──────────────────────────────────────
        if (table === "gigs") {
          // Determine the inserted gig id (prefer id from CSV, else last_insert_rowid)
          let gigId: unknown = null;
          const idIdx = headerIdx["id"];
          if (idIdx !== undefined) {
            const rawId = row[idIdx];
            gigId = rawId === undefined || rawId === "" ? null : rawId;
          }
          if (!gigId) {
            const lastRow = await db.select<{ id: unknown }[]>(
              `SELECT id FROM gigs ORDER BY rowid DESC LIMIT 1`
            );
            gigId = lastRow[0]?.id ?? null;
          }

          if (gigId !== null) {
            // 1) venue_name → create venue if missing, then link
            const venueNameIdx = headerIdx["venue_name"];
            if (venueNameIdx !== undefined) {
              const venueName = row[venueNameIdx];
              if (venueName && venueName.trim() !== "") {
                const existing = await db.select<{ id: unknown }[]>(
                  `SELECT id FROM venues WHERE name = $1 LIMIT 1`,
                  [venueName]
                );
                let venueId: unknown;
                if (existing.length > 0) {
                  venueId = existing[0].id;
                } else {
                  const cityIdx = headerIdx["venue_city"];
                  const venueCity =
                    cityIdx !== undefined && row[cityIdx] && row[cityIdx].trim() !== ""
                      ? row[cityIdx]
                      : null;
                  await db.execute(
                    `INSERT INTO venues (name, city) VALUES ($1, $2)`,
                    [venueName, venueCity]
                  );
                  const newVenue = await db.select<{ id: unknown }[]>(
                    `SELECT id FROM venues WHERE name = $1 ORDER BY rowid DESC LIMIT 1`,
                    [venueName]
                  );
                  venueId = newVenue[0]?.id ?? null;
                }
                if (venueId !== null && venueId !== undefined) {
                  await db.execute(
                    `UPDATE gigs SET venue_id = $1 WHERE id = $2`,
                    [venueId, gigId]
                  );
                }
              }
            }

            // 2) promoter → find or create contact, then link
            const promoterIdx = headerIdx["promoter"];
            if (promoterIdx !== undefined) {
              const promoterName = row[promoterIdx];
              if (promoterName && promoterName.trim() !== "") {
                const existingContact = await db.select<{ id: unknown }[]>(
                  `SELECT id FROM contacts WHERE name = $1 LIMIT 1`,
                  [promoterName]
                );
                let contactId: unknown;
                if (existingContact.length > 0) {
                  contactId = existingContact[0].id;
                } else {
                  await db.execute(
                    `INSERT INTO contacts (name, types) VALUES ($1, $2)`,
                    [promoterName, '["Contratante"]']
                  );
                  const newContact = await db.select<{ id: unknown }[]>(
                    `SELECT id FROM contacts WHERE name = $1 ORDER BY rowid DESC LIMIT 1`,
                    [promoterName]
                  );
                  contactId = newContact[0]?.id ?? null;
                }
                if (contactId !== null && contactId !== undefined) {
                  await db.execute(
                    `UPDATE gigs SET promoter_contact_id = $1 WHERE id = $2`,
                    [contactId, gigId]
                  );
                }
              }
            }
          }
        }
        // ── end gig enrichment ──────────────────────────────────────────
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      result.skipped += 1;
      // guarda só as 10 primeiras pra não estourar a UI
      if (result.errors.length < 10) {
        result.errors.push(`Linha ${rowNum}: ${String(e)}`);
      }
    }
  }

  return result;
}
