import { describe, expect, it, vi } from "vitest";

// Mock da fronteira do Tauri (banco) e das bordas que saem da máquina.
// `buildBackupData` e `restoreBackup` são o código de produção.
vi.mock("@tauri-apps/api/core", async () => {
  const { testInvoke } = await import("@/test/sqliteDb");
  return { invoke: testInvoke, convertFileSrc: (p: string) => p };
});
// getPortableSession faz getSession() do Supabase, que tentaria rede e só
// desistiria pelo timeout de 5s de dentro do buildBackupData.
vi.mock("@/lib/supabase", () => ({
  getPortableSession: async () => null,
  adoptPortableSession: async () => false,
  PORTABLE_SESSION_TTL_MS: 0,
}));

import { buildFixture, countRows } from "@/test/fixture";
import { runMigrations } from "@/lib/migrations";
import { buildBackupData, restoreBackup } from "@/lib/backup";
import { createTestDb } from "@/test/sqliteDb";
import { getDb } from "@/lib/db";

const WATCHED = ["equipment", "finance_transactions", "finance_categories", "gigs"];

async function snapshot(tables: string[]): Promise<Record<string, unknown[]>> {
  const db = getDb();
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    out[t] = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t} ORDER BY id`);
  }
  return out;
}

describe("backup round-trip", () => {
  it("salvar e abrir num banco NOVO devolve os mesmos dados, tabela por tabela", async () => {
    // Reabrir no MESMO banco não prova nada: `restoreBackup` só limpa e
    // reinsere as tabelas presentes no backup, então uma tabela esquecida no
    // array TABLES ficaria intocada e a comparação passaria. O teste tem que
    // ser contra um banco VAZIO — é o caso real de abrir o .vistage em outra
    // máquina, e o único em que a tabela ausente aparece como perda.
    const a = await buildFixture();
    let before: Record<string, unknown[]>;
    let backup: Awaited<ReturnType<typeof buildBackupData>>;
    try {
      await runMigrations(getDb()); // schema atual, como no app
      before = await snapshot(WATCHED);
      expect((before.equipment as { name: string }[]).length).toBe(3);
      backup = await buildBackupData();
      expect(backup.app).toBe("vistage");
      expect(Object.keys(backup.tables).length).toBeGreaterThan(50);
    } finally {
      a.close();
    }

    // Banco limpo, schema atual, nenhum dado — a "outra máquina".
    const b = createTestDb();
    try {
      await runMigrations(getDb());
      const empty = await countRows(WATCHED);
      expect(empty.equipment).toBe(0);
      expect(empty.gigs).toBe(0);

      const res = await restoreBackup(backup);
      expect(res.restoredRows).toBeGreaterThan(0);

      const after = await snapshot(WATCHED);
      for (const t of WATCHED) {
        expect(after[t], `tabela ${t} não voltou igual`).toEqual(before[t]);
      }
    } finally {
      b.close();
    }
  });

  it("não duplica linha ao restaurar duas vezes", async () => {
    const fx = await buildFixture();
    try {
      const db = getDb();
      await runMigrations(db);
      const backup = await buildBackupData();
      const before = await countRows(WATCHED);

      await restoreBackup(backup);
      await restoreBackup(backup);

      expect(await countRows(WATCHED)).toEqual(before);
    } finally {
      fx.close();
    }
  });

  it("religa a FK adiada (equipment.transaction_id) no banco novo", async () => {
    // `transaction_id` é omitido na 1ª passagem do restore e religado na 2ª
    // (DEFERRED_FK). Se a 2ª passagem falhasse em silêncio, o item de
    // Patrimônio voltaria sem a despesa vinculada — exatamente o vínculo que o
    // item 10 vai usar. Só aparece abrindo num banco novo.
    const a = await buildFixture();
    let backup: Awaited<ReturnType<typeof buildBackupData>>;
    try {
      await runMigrations(getDb());
      backup = await buildBackupData();
    } finally {
      a.close();
    }

    const b = createTestDb();
    try {
      await runMigrations(getDb());
      await restoreBackup(backup);
      const rows = await getDb().select<{ name: string; transaction_id: number | null }[]>(
        "SELECT name, transaction_id FROM equipment WHERE transaction_id IS NOT NULL"
      );
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe("CDJ-3000 (par)");
    } finally {
      b.close();
    }
  });
});
