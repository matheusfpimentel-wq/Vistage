import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock da ÚNICA fronteira: o invoke do Tauri. O runner de migrations testado
// abaixo é o de produção, sem adaptação.
vi.mock("@tauri-apps/api/core", async () => {
  const { testInvoke } = await import("@/test/sqliteDb");
  return { invoke: testInvoke, convertFileSrc: (p: string) => p };
});

import { buildFixture, countRows, BASELINE_VERSION } from "@/test/fixture";
import { runMigrations, MIGRATIONS } from "@/lib/migrations";
import { getDb } from "@/lib/db";

/** Tabelas cujo conteúdo a migração não pode perder. */
const WATCHED = ["equipment", "finance_transactions", "finance_categories", "gigs"];

describe("migrations", () => {
  let close: (() => void) | null = null;

  beforeEach(() => {
    close = null;
  });

  afterEach(() => {
    close?.();
  });

  it("sobe do schema anterior sem perder linha nem valor de Patrimônio", async () => {
    const fx = await buildFixture();
    close = fx.close;

    const db = getDb();

    const before = await countRows(WATCHED);
    const equipBefore = await db.select<
      { id: number; name: string; purchase_value: number | null; purchase_date: string | null }[]
    >("SELECT id, name, purchase_value, purchase_date FROM equipment ORDER BY id");

    // Aplica TUDO que vem depois do baseline — o caminho de quem abre um
    // .vistage antigo com o app atualizado.
    const { applied } = await runMigrations(db);
    const pending = MIGRATIONS.filter((m) => m.version > BASELINE_VERSION).map((m) => m.version);
    expect(applied).toEqual(pending);

    // 1. Nenhuma linha some.
    expect(await countRows(WATCHED)).toEqual(before);

    // 2. O valor antigo continua sendo o VALOR DE COMPRA, item por item.
    //    É a garantia que o item 7 do pedido exige: renomear o rótulo não pode
    //    mexer no dado, e a coluna de revenda nasce vazia.
    const equipAfter = await db.select<
      { id: number; name: string; purchase_value: number | null; purchase_date: string | null }[]
    >("SELECT id, name, purchase_value, purchase_date FROM equipment ORDER BY id");
    expect(equipAfter).toEqual(equipBefore);

    // 3. O vínculo com o Financeiro sobrevive.
    const linked = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM equipment WHERE transaction_id IS NOT NULL"
    );
    expect(linked[0].n).toBe(1);
  });

  it("é idempotente: rodar de novo não aplica nada nem muda o banco", async () => {
    const fx = await buildFixture();
    close = fx.close;

    const db = getDb();

    await runMigrations(db);
    const snapshot = await countRows(WATCHED);

    const second = await runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(await countRows(WATCHED)).toEqual(snapshot);
  });

  it("não tem versão duplicada nem fora de ordem", async () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions]).toEqual([...versions].sort((a, b) => a - b));
  });

  it("todo ADD COLUMN NOT NULL tem DEFAULT", async () => {
    // Sem DEFAULT, o ALTER falha num banco que já tem linhas — e o runner
    // reverte a migration inteira. Convenção do projeto, vale checar sozinha.
    const offenders: string[] = [];
    for (const m of MIGRATIONS) {
      for (const stmt of m.sql.split(";")) {
        if (!/ADD\s+COLUMN/i.test(stmt)) continue;
        if (!/NOT\s+NULL/i.test(stmt)) continue;
        if (!/DEFAULT/i.test(stmt)) offenders.push(`v${m.version}: ${stmt.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
