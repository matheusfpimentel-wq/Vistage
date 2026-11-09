import { describe, expect, it, vi } from "vitest";

// Fronteira do Tauri (banco). Tudo acima dela é o código de produção:
// createEquipmentExpense → createTransaction → syncEquipmentForTransaction.
vi.mock("@tauri-apps/api/core", async () => {
  const { testInvoke } = await import("@/test/sqliteDb");
  return { invoke: testInvoke, convertFileSrc: (p: string) => p };
});
// `emitDataChanged` faz window.dispatchEvent — fronteira de navegador, e os
// testes rodam em Node. Não tem nada a ver com a lógica aqui testada.
vi.mock("@/lib/events", () => ({
  DATA_CHANGED: "vistage:data-changed",
  emitDataChanged: () => {},
}));

import { buildFixture, countRows } from "@/test/fixture";
import { runMigrations } from "@/lib/migrations";
import { getDb } from "@/lib/db";
import {
  createEquipmentExpense,
  createTransaction,
  ensureEquipmentCategoryId,
  equipmentMissingExpense,
  findExpenseCandidates,
  listEquipment,
  updateEquipment,
} from "./api";

/** Despesa com os campos obrigatórios do create, pra não repetir 18 nulls. */
function expenseInput(over: Record<string, unknown>) {
  return {
    kind: "expense" as const,
    amount: 0,
    date: "2026-01-01",
    description: null,
    category_id: null,
    gig_id: null,
    contact_id: null,
    class_id: null,
    student_package_id: null,
    track_id: null,
    party_id: null,
    music_cost_id: null,
    gig_sync: 0,
    class_sync: 0,
    status: "Pago" as const,
    payment_method: null,
    expense_type: null,
    receipt_file_path: null,
    tax_relevant: 0,
    recurring_id: null,
    ...over,
  };
}

async function setup() {
  const fx = await buildFixture();
  await runMigrations(getDb()); // schema atual
  return fx;
}

describe("despesa retroativa do Patrimônio", () => {
  it("lançar a despesa de um item NÃO cria um segundo item", async () => {
    // A armadilha do item 10: `createTransaction` chama
    // `syncEquipmentForTransaction`, que CRIA um item de Patrimônio para
    // qualquer despesa na categoria "Equipamentos". Sem o vínculo explícito, o
    // item apareceria DUPLICADO a cada cadastro — e o usuário veria dois
    // "Mixer DJM-900" na lista.
    const fx = await setup();
    try {
      const before = await countRows(["equipment", "finance_transactions"]);
      const mixer = (await listEquipment()).find((e) => e.name === "Mixer DJM-900")!;
      expect(mixer.transaction_id).toBeNull();

      const txId = await createEquipmentExpense({
        id: mixer.id,
        name: mixer.name,
        purchase_date: mixer.purchase_date!,
        purchase_value: mixer.purchase_value!,
      });

      const after = await countRows(["equipment", "finance_transactions"]);
      expect(after.equipment).toBe(before.equipment); // nenhum item novo
      expect(after.finance_transactions).toBe(before.finance_transactions + 1);

      // O item existente é que ficou vinculado.
      const linked = (await listEquipment()).find((e) => e.id === mixer.id)!;
      expect(linked.transaction_id).toBe(txId);

      // E a despesa é RETROATIVA: entra na data da compra, não hoje.
      const tx = await getDb().select<{ date: string; amount: number; description: string }[]>(
        "SELECT date, amount, description FROM finance_transactions WHERE id = $1",
        [txId]
      );
      expect(tx[0].date).toBe("2024-11-20");
      expect(tx[0].amount).toBe(1899.9);
      expect(tx[0].description).toBe("Mixer DJM-900");
    } finally {
      fx.close();
    }
  });

  it("o espelhamento normal (despesa criada no Financeiro) continua criando o item", async () => {
    // O early-return do vínculo explícito não pode ter desligado o
    // comportamento que já existia: quem lança "Equipamentos" pelo Financeiro
    // continua ganhando o item de Patrimônio automático.
    const fx = await setup();
    try {
      const before = await countRows(["equipment"]);
      const categoryId = await ensureEquipmentCategoryId();
      await createTransaction(
        expenseInput({
          amount: 999,
          date: "2026-02-14",
          description: "Fone de ouvido",
          category_id: categoryId,
        })
      );
      const after = await countRows(["equipment"]);
      expect(after.equipment).toBe(before.equipment + 1);
      const novo = (await listEquipment()).find((e) => e.name === "Fone de ouvido");
      expect(novo?.purchase_value).toBe(999);
      expect(novo?.purchase_date).toBe("2026-02-14");
    } finally {
      fx.close();
    }
  });

  it("acha despesa já lançada e ignora a que já tem item vinculado", async () => {
    const fx = await setup();
    try {
      // Despesa SOLTA (sem item), 2 dias depois da data de compra e mesmo valor.
      await createTransaction(
        expenseInput({
          amount: 4200,
          date: "2025-03-12",
          description: "CDJ-3000 comprado na loja",
          category_id: null, // categoria neutra: não dispara o espelhamento
        })
      );

      const hits = await findExpenseCandidates({
        name: "CDJ-3000 (par)",
        value: 4200,
        date: "2025-03-10",
      });
      expect(hits.map((h) => h.description)).toContain("CDJ-3000 comprado na loja");

      // A despesa da fixture tem o MESMO valor e data, mas já tem item
      // vinculado — oferecê-la levaria o usuário a vincular dois itens à mesma
      // compra. Tem que ficar de fora.
      expect(hits.map((h) => h.description)).not.toContain("CDJ-3000 (par)");

      // Fora da janela de ±7 dias não entra.
      const far = await findExpenseCandidates({
        name: "CDJ-3000 (par)",
        value: 4200,
        date: "2025-05-10",
      });
      expect(far).toEqual([]);
    } finally {
      fx.close();
    }
  });

  it("editar valor no Patrimônio atualiza a despesa vinculada", async () => {
    const fx = await setup();
    try {
      const db = getDb();
      const cdj = (await listEquipment()).find((e) => e.name === "CDJ-3000 (par)")!;
      expect(cdj.transaction_id).not.toBeNull();

      await updateEquipment({ id: cdj.id, purchase_value: 3900, purchase_date: "2025-03-11" });

      const tx = await db.select<{ amount: number; date: string }[]>(
        "SELECT amount, date FROM finance_transactions WHERE id = $1",
        [cdj.transaction_id]
      );
      expect(tx[0].amount).toBe(3900);
      expect(tx[0].date).toBe("2025-03-11");

      // E os dois lados CONVERGEM: a propagação não pode ter voltado o valor
      // antigo pro item (ida-e-volta com o espelhamento).
      const again = (await listEquipment()).find((e) => e.id === cdj.id)!;
      expect(again.purchase_value).toBe(3900);
    } finally {
      fx.close();
    }
  });

  it("a fila do backfill só lista item com data, valor e sem despesa", async () => {
    const fx = await setup();
    try {
      const fila = await equipmentMissingExpense();
      // Da fixture: o CDJ já tem despesa; o cabo não tem data nem valor. Sobra
      // o mixer.
      expect(fila.map((e) => e.name)).toEqual(["Mixer DJM-900"]);

      // Depois de lançar, a fila esvazia — é o que impede lançar duas vezes
      // pela tela de backfill.
      const mixer = fila[0];
      await createEquipmentExpense({
        id: mixer.id,
        name: mixer.name,
        purchase_date: mixer.purchase_date!,
        purchase_value: mixer.purchase_value!,
      });
      expect(await equipmentMissingExpense()).toEqual([]);
    } finally {
      fx.close();
    }
  });
});
