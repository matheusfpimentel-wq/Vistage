import { runMigrations } from "@/lib/migrations";
import { getDb } from "@/lib/db";
import { createTestDb, type TestDb } from "./sqliteDb";

/**
 * Última migration que existia ANTES do lote de Patrimônio (itens 4, 7, 9, 10).
 * A fixture é montada neste schema e os testes aplicam o resto por cima — é o
 * caminho real de quem abre um .vistage gravado pela versão anterior.
 *
 * Ao adicionar migrations novas, NÃO mexa aqui: o valor tem que continuar
 * apontando pro schema de antes, senão o teste de migração deixa de exercitar a
 * subida e passa a validar só o estado final.
 */
export const BASELINE_VERSION = 186;

export type Fixture = TestDb & {
  /** Linhas que a fixture plantou, pra comparar depois da migração. */
  seeded: {
    equipment: { id: number; name: string; purchase_value: number | null; purchase_date: string | null }[];
    gigIds: number[];
    txIds: number[];
  };
};

/**
 * Banco no schema do BASELINE_VERSION com registros de Patrimônio, Financeiro e
 * GIGs. Os valores de Patrimônio são o que mais importa: o teste de migração
 * confere que o valor antigo continua sendo o valor de compra depois de subir.
 */
export async function buildFixture(): Promise<Fixture> {
  const test = createTestDb();
  const db = getDb();

  await runMigrations(db, { upTo: BASELINE_VERSION });

  // ── GIGs ──────────────────────────────────────────────────────────────────
  const gigIds: number[] = [];
  for (const g of [
    { date: "2026-08-02", venue_name: "Club Alpha", event_name: "Noite Alpha", cache_amount: 1500 },
    { date: "2026-09-13", venue_name: "Bar Beta", event_name: null, cache_amount: 800 },
  ]) {
    const r = await db.execute(
      `INSERT INTO gigs (date, venue_name, event_name, cache_amount, status)
       VALUES ($1, $2, $3, $4, 'Confirmada')`,
      [g.date, g.venue_name, g.event_name, g.cache_amount]
    );
    gigIds.push(Number(r.lastInsertId));
  }

  // ── Financeiro ────────────────────────────────────────────────────────────
  // A categoria "Equipamentos" já vem do seed da v2; buscamos em vez de criar
  // pra não duplicar (há UNIQUE(name, kind)).
  const catRows = await db.select<{ id: number }[]>(
    "SELECT id FROM finance_categories WHERE name = 'Equipamentos' AND kind = 'expense'"
  );
  const equipCategoryId = catRows[0]?.id ?? null;

  const txIds: number[] = [];
  for (const t of [
    { kind: "income", amount: 1500, date: "2026-08-03", description: "Cachê: Noite Alpha", category_id: null, gig_id: gigIds[0] },
    { kind: "expense", amount: 4200, date: "2025-03-10", description: "CDJ-3000 (par)", category_id: equipCategoryId, gig_id: null },
  ]) {
    const r = await db.execute(
      `INSERT INTO finance_transactions (kind, amount, date, description, category_id, gig_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pago')`,
      [t.kind, t.amount, t.date, t.description, t.category_id, t.gig_id]
    );
    txIds.push(Number(r.lastInsertId));
  }

  // ── Patrimônio ────────────────────────────────────────────────────────────
  // Inclui de propósito um item SEM valor e um SEM data: a migração não pode
  // inventar valor de revenda nem tropeçar em nulo.
  const equipment: Fixture["seeded"]["equipment"] = [];
  for (const e of [
    { name: "CDJ-3000 (par)", purchase_value: 4200, purchase_date: "2025-03-10", transaction_id: txIds[1] },
    { name: "Mixer DJM-900", purchase_value: 1899.9, purchase_date: "2024-11-20", transaction_id: null },
    { name: "Cabo RCA sobressalente", purchase_value: null, purchase_date: null, transaction_id: null },
  ]) {
    const r = await db.execute(
      `INSERT INTO equipment (name, purchase_value, purchase_date, transaction_id, state, quantity)
       VALUES ($1, $2, $3, $4, 'Em uso', 1)`,
      [e.name, e.purchase_value, e.purchase_date, e.transaction_id]
    );
    equipment.push({
      id: Number(r.lastInsertId),
      name: e.name,
      purchase_value: e.purchase_value,
      purchase_date: e.purchase_date,
    });
  }

  return { ...test, seeded: { equipment, gigIds, txIds } };
}

/** Contagem de linhas por tabela — usada pra provar que nada se perdeu. */
export async function countRows(tables: string[]): Promise<Record<string, number>> {
  const db = getDb();
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${t}`);
    out[t] = r[0]?.n ?? 0;
  }
  return out;
}
