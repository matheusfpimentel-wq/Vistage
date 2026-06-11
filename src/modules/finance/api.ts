import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import type {
  Equipment,
  EquipmentCreateInput,
  EquipmentUpdateInput,
  FinanceCategory,
  FinanceRecurring,
  FinanceRecurringCreateInput,
  FinanceTransactionCreateInput,
  FinanceTransactionUpdateInput,
  FinanceTransactionWithCategory,
  TransactionKind,
  TransactionStatus,
} from "./types";

const TX_COLUMNS = `t.id, t.kind, t.amount, t.date, t.description, t.category_id,
  t.gig_id, t.contact_id, t.class_id, t.student_package_id, t.track_id, t.party_id,
  t.music_cost_id, t.gig_sync, t.status, t.payment_method, t.expense_type,
  t.receipt_file_path, t.tax_relevant, t.recurring_id, t.created_at, t.updated_at,
  c.name as category_name`;

const TX_FROM = `FROM finance_transactions t
                 LEFT JOIN finance_categories c ON c.id = t.category_id`;

// ============================================================
// Categorias
// ============================================================

export async function listCategories(
  kind?: TransactionKind
): Promise<FinanceCategory[]> {
  const db = getDb();
  const sql = kind
    ? `SELECT * FROM finance_categories WHERE kind = $1 ORDER BY is_default DESC, name COLLATE NOCASE ASC`
    : `SELECT * FROM finance_categories ORDER BY kind, is_default DESC, name COLLATE NOCASE ASC`;
  return db.select<FinanceCategory[]>(sql, kind ? [kind] : []);
}

export async function createCategory(
  name: string,
  kind: TransactionKind
): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO finance_categories (name, kind, is_default) VALUES ($1, $2, 0)`,
    [name.trim(), kind]
  );
  return Number(res.lastInsertId);
}

export async function renameCategory(id: number, name: string): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE finance_categories SET name = $1 WHERE id = $2", [
    name.trim(),
    id,
  ]);
}

export async function deleteCategory(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM finance_categories WHERE id = $1", [id]);
}

export async function countTransactionsForCategory(
  categoryId: number
): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ n: number }[]>(
    `SELECT COUNT(*) as n FROM finance_transactions WHERE category_id = $1`,
    [categoryId]
  );
  return rows[0]?.n ?? 0;
}

// ============================================================
// Transações
// ============================================================

export type TransactionFilters = {
  kind?: TransactionKind | "all";
  categoryId?: number;
  status?: TransactionStatus | "all";
  month?: string; // YYYY-MM
  fromDate?: string;
  toDate?: string;
  search?: string;
};

export async function listTransactions(
  filters: TransactionFilters = {}
): Promise<FinanceTransactionWithCategory[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.kind && filters.kind !== "all") {
    params.push(filters.kind);
    where.push(`t.kind = $${params.length}`);
  }
  if (filters.categoryId) {
    params.push(filters.categoryId);
    where.push(`t.category_id = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    where.push(`t.status = $${params.length}`);
  }
  if (filters.month) {
    params.push(`${filters.month}-01`, `${filters.month}-31`);
    where.push(
      `t.date BETWEEN $${params.length - 1} AND $${params.length}`
    );
  }
  if (filters.fromDate) {
    params.push(filters.fromDate);
    where.push(`t.date >= $${params.length}`);
  }
  if (filters.toDate) {
    params.push(filters.toDate);
    where.push(`t.date <= $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q);
    const i = params.length;
    where.push(`(t.description LIKE $${i - 1} OR c.name LIKE $${i})`);
  }

  const sql =
    `SELECT ${TX_COLUMNS} ${TX_FROM}` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY t.date DESC, t.id DESC";
  return db.select<FinanceTransactionWithCategory[]>(sql, params);
}

export async function getTransaction(
  id: number
): Promise<FinanceTransactionWithCategory | null> {
  const db = getDb();
  const rows = await db.select<FinanceTransactionWithCategory[]>(
    `SELECT ${TX_COLUMNS} ${TX_FROM} WHERE t.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createTransaction(
  input: FinanceTransactionCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO finance_transactions (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const newId = Number(res.lastInsertId);
  await syncEquipmentForTransaction(newId);
  emitDataChanged();
  return newId;
}

export async function updateTransaction(
  input: FinanceTransactionUpdateInput
): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE finance_transactions SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  await syncEquipmentForTransaction(id);
  emitDataChanged();
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM finance_transactions WHERE id = $1", [id]);
  emitDataChanged();
}

/**
 * Garante que existe um item de Patrimônio espelhando essa transação
 * quando ela for uma despesa da categoria "Equipamentos". Se a transação
 * já tiver um item linkado, atualiza o valor/data; senão cria.
 */
async function syncEquipmentForTransaction(transactionId: number): Promise<void> {
  const db = getDb();
  const tx = await getTransaction(transactionId);
  if (!tx) return;
  const isEquipment =
    tx.kind === "expense" && tx.category_name === "Equipamentos";
  const existing = await db.select<Equipment[]>(
    "SELECT * FROM equipment WHERE transaction_id = $1",
    [transactionId]
  );
  if (!isEquipment) {
    // se mudou de categoria, desvincula (mantém o item de patrimônio)
    if (existing.length > 0) {
      await db.execute(
        "UPDATE equipment SET transaction_id = NULL WHERE transaction_id = $1",
        [transactionId]
      );
    }
    return;
  }
  if (existing.length === 0) {
    await db.execute(
      `INSERT INTO equipment (transaction_id, name, purchase_date, purchase_value, state)
       VALUES ($1, $2, $3, $4, 'Em uso')`,
      [transactionId, tx.description ?? "Equipamento", tx.date, tx.amount]
    );
  } else {
    await db.execute(
      `UPDATE equipment SET purchase_date = $1, purchase_value = $2 WHERE id = $3`,
      [tx.date, tx.amount, existing[0].id]
    );
  }
}

/**
 * Sincroniza a receita financeira de uma GIG com o estado de pagamento dela.
 *
 * - `paid = true` e `amount > 0`: garante uma entrada de receita "DJ"
 *   vinculada à GIG, criando ou atualizando valor/data/descrição.
 * - caso contrário: remove qualquer receita vinculada (pagamento revertido,
 *   cachê zerado etc.) pra não deixar lançamento fantasma no financeiro.
 *
 * Mantém o app integrado: mudou no GIG, reflete no Financeiro.
 */
export async function syncGigPaymentTransaction(
  gigId: number,
  paid: boolean,
  amount: number,
  date: string,
  description: string,
  _cachePaidPct?: number | null,
  contactId?: number | null
): Promise<void> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_transactions WHERE gig_id = $1 AND kind = 'income' AND gig_sync = 1`,
    [gigId]
  );

  if (!paid || !(amount > 0)) {
    // pagamento revertido ou sem valor: limpa apenas lançamentos sincronizados
    if (existing.length > 0) {
      await db.execute(
        `DELETE FROM finance_transactions WHERE gig_id = $1 AND kind = 'income' AND gig_sync = 1`,
        [gigId]
      );
    }
    emitDataChanged();
    return;
  }

  if (existing.length > 0) {
    await db.execute(
      `UPDATE finance_transactions
          SET amount = $1, date = $2, description = $3, status = 'Recebido/Pago',
              contact_id = $5, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 AND gig_sync = 1`,
      [amount, date, description, existing[0].id, contactId ?? null]
    );
    emitDataChanged();
    return;
  }

  // procura categoria "DJ"
  const cat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories WHERE kind = 'income' AND name = 'DJ' LIMIT 1`
  );
  const categoryId = cat[0]?.id ?? null;

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, gig_id, contact_id, status, gig_sync)
     VALUES ('income', $1, $2, $3, $4, $5, $6, 'Recebido/Pago', 1)`,
    [amount, date, description, categoryId, gigId, contactId ?? null]
  );
  emitDataChanged();
}

/**
 * Sincroniza a despesa de um custo de produção musical com o Financeiro.
 * Cria/atualiza um lançamento de despesa vinculado via music_cost_id, ou
 * remove se o custo não existir mais / tiver valor <= 0.
 */
export async function syncMusicCostTransaction(costId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<
    {
      id: number;
      amount: number | null;
      date: string | null;
      description: string | null;
      category: string | null;
      track_title: string | null;
    }[]
  >(
    `SELECT mpc.id, mpc.amount, mpc.date, mpc.description, mpc.category, t.title_working AS track_title
       FROM music_project_costs mpc
       LEFT JOIN tracks t ON t.id = mpc.track_id
      WHERE mpc.id = $1`,
    [costId]
  );
  const cost = rows[0];
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_transactions WHERE music_cost_id = $1`,
    [costId]
  );

  if (!cost || !((cost.amount ?? 0) > 0)) {
    if (existing.length > 0) {
      await db.execute(
        `DELETE FROM finance_transactions WHERE music_cost_id = $1`,
        [costId]
      );
    }
    return;
  }

  const what = cost.description?.trim() || cost.category?.trim() || "custo";
  const where = cost.track_title?.trim() || "projeto";
  const desc = `Produção: ${what} (${where})`;
  const dateStr = cost.date ?? new Date().toISOString().slice(0, 10);

  if (existing.length > 0) {
    await db.execute(
      `UPDATE finance_transactions
          SET amount = $1, date = $2, description = $3, status = 'Recebido/Pago',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [cost.amount, dateStr, desc, existing[0].id]
    );
    return;
  }

  const cat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories
      WHERE kind = 'expense'
        AND (name LIKE '%Produção%' OR name LIKE '%Música%' OR name LIKE '%Music%')
      LIMIT 1`
  );
  const categoryId = cat[0]?.id ?? null;

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, music_cost_id, status, expense_type)
     VALUES ('expense', $1, $2, $3, $4, $5, 'Recebido/Pago', 'Variável')`,
    [cost.amount, dateStr, desc, categoryId, costId]
  );
}

/** Remove a transação vinculada a um custo de produção musical. */
export async function deleteTransactionsForMusicCost(
  costId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM finance_transactions WHERE music_cost_id = $1",
    [costId]
  );
}

/** Remove todas as transações vinculadas a uma GIG (usado ao excluir a GIG). */
export async function deleteTransactionsForGig(gigId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM finance_transactions WHERE gig_id = $1",
    [gigId]
  );
}

/**
 * Sincroniza receita (ingressos) e despesa (custos do orçamento) de uma festa
 * com o Financeiro. Cria, atualiza ou remove os lançamentos conforme os valores.
 */
export async function syncPartyTransactions(partyId: number): Promise<void> {
  const db = getDb();

  const partyRows = await db.select<{ title: string; date: string | null }[]>(
    "SELECT title, date FROM parties WHERE id = $1",
    [partyId]
  );
  const party = partyRows[0];
  if (!party) return;

  const incomeRows = await db.select<{ income: number }[]>(
    "SELECT COALESCE(SUM(price * quantity_sold), 0) as income FROM party_tickets WHERE party_id = $1",
    [partyId]
  );
  const expenseRows = await db.select<{ expense: number }[]>(
    "SELECT COALESCE(SUM(actual_amount), 0) as expense FROM party_budget_items WHERE party_id = $1",
    [partyId]
  );

  const income = Number(incomeRows[0]?.income ?? 0);
  const expense = Number(expenseRows[0]?.expense ?? 0);
  const dateStr = party.date ?? new Date().toISOString().slice(0, 10);

  // --- income transaction ---
  const existingIncome = await db.select<{ id: number }[]>(
    "SELECT id FROM finance_transactions WHERE party_id = $1 AND kind = 'income'",
    [partyId]
  );
  if (income > 0) {
    const catRows = await db.select<{ id: number }[]>(
      `SELECT id FROM finance_categories WHERE kind = 'income' AND (name LIKE '%Festa%' OR name LIKE '%Event%') LIMIT 1`
    );
    const categoryId = catRows[0]?.id ?? null;
    if (existingIncome.length > 0) {
      await db.execute(
        `UPDATE finance_transactions SET amount=$1, date=$2, description=$3, status='Recebido/Pago', updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
        [income, dateStr, `Ingressos: ${party.title}`, existingIncome[0].id]
      );
    } else {
      await db.execute(
        `INSERT INTO finance_transactions (kind, amount, date, description, category_id, party_id, status, expense_type) VALUES ('income', $1, $2, $3, $4, $5, 'Recebido/Pago', NULL)`,
        [income, dateStr, `Ingressos: ${party.title}`, categoryId, partyId]
      );
    }
  } else if (existingIncome.length > 0) {
    await db.execute(
      "DELETE FROM finance_transactions WHERE party_id = $1 AND kind = 'income'",
      [partyId]
    );
  }

  // --- expense transaction ---
  const existingExpense = await db.select<{ id: number }[]>(
    "SELECT id FROM finance_transactions WHERE party_id = $1 AND kind = 'expense'",
    [partyId]
  );
  if (expense > 0) {
    if (existingExpense.length > 0) {
      await db.execute(
        `UPDATE finance_transactions SET amount=$1, date=$2, description=$3, status='Recebido/Pago', updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
        [expense, dateStr, `Custos: ${party.title}`, existingExpense[0].id]
      );
    } else {
      await db.execute(
        `INSERT INTO finance_transactions (kind, amount, date, description, category_id, party_id, status, expense_type) VALUES ('expense', $1, $2, $3, NULL, $4, 'Recebido/Pago', 'Variável')`,
        [expense, dateStr, `Custos: ${party.title}`, partyId]
      );
    }
  } else if (existingExpense.length > 0) {
    await db.execute(
      "DELETE FROM finance_transactions WHERE party_id = $1 AND kind = 'expense'",
      [partyId]
    );
  }
}

/** Remove todas as transações vinculadas a uma festa (usado ao excluir a festa). */
export async function deleteTransactionsForParty(partyId: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM finance_transactions WHERE party_id = $1",
    [partyId]
  );
}

// ============================================================
// Integração com Aulas (receita)
// ============================================================

let classIncomeCategoryIdCache: number | null | undefined;
async function classIncomeCategoryId(): Promise<number | null> {
  if (classIncomeCategoryIdCache !== undefined) return classIncomeCategoryIdCache;
  const db = getDb();
  const cat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories WHERE kind = 'income' AND name = 'Aulas / Mentorias' LIMIT 1`
  );
  classIncomeCategoryIdCache = cat[0]?.id ?? null;
  return classIncomeCategoryIdCache;
}

/**
 * Sincroniza a receita de uma AULA com o Financeiro.
 * Gera receita quando a aula está "Realizada" e tem valor (`amount > 0`).
 * Aulas de pacote normalmente têm `amount = null` (a receita vem da venda do
 * pacote), então não há duplicidade; mas se o usuário definir um valor na aula,
 * ela conta. Senão, remove o lançamento.
 */
export async function syncClassTransaction(classId: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<
    {
      amount: number | null;
      status: string;
      date: string;
      subject: string | null;
      student_name: string | null;
      class_number: number;
    }[]
  >(
    `SELECT c.amount, c.status, c.date, c.subject, s.name AS student_name,
  (SELECT COUNT(*) FROM classes c2
   WHERE c2.student_id = c.student_id
     AND (c2.date < c.date OR (c2.date = c.date AND c2.id <= c.id))) as class_number
FROM classes c LEFT JOIN students s ON s.id = c.student_id
WHERE c.id = $1`,
    [classId]
  );
  const c = rows[0];
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_transactions WHERE class_id = $1`,
    [classId]
  );

  const shouldHave = !!c && c.status === "Realizada" && (c.amount ?? 0) > 0;

  if (!shouldHave) {
    if (existing.length > 0) {
      await db.execute(`DELETE FROM finance_transactions WHERE class_id = $1`, [classId]);
    }
    return;
  }

  const num = c.class_number ?? 1;
  const desc = `[Aula] ${num} - ${c.student_name ?? "Aluno"}`;
  if (existing.length > 0) {
    await db.execute(
      `UPDATE finance_transactions
          SET amount = $1, date = $2, description = $3, status = 'Recebido/Pago',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [c.amount, c.date, desc, existing[0].id]
    );
    return;
  }
  const categoryId = await classIncomeCategoryId();
  await db.execute(
    `INSERT INTO finance_transactions (kind, amount, date, description, category_id, class_id, status)
     VALUES ('income', $1, $2, $3, $4, $5, 'Recebido/Pago')`,
    [c.amount, c.date, desc, categoryId, classId]
  );
}

/**
 * Sincroniza a receita da VENDA DE UM PACOTE com o Financeiro.
 * Usa o preço do template do pacote; sem preço, não gera lançamento.
 */
export async function syncStudentPackageTransaction(
  studentPackageId: number
): Promise<void> {
  const db = getDb();
  const rows = await db.select<
    {
      purchased_at: string;
      status: string;
      price: number | null;
      pkg_name: string | null;
      student_name: string | null;
    }[]
  >(
    `SELECT sp.purchased_at, sp.status, cp.price, cp.name AS pkg_name, s.name AS student_name
       FROM student_packages sp
       LEFT JOIN class_packages cp ON cp.id = sp.package_id
       LEFT JOIN students s ON s.id = sp.student_id
      WHERE sp.id = $1`,
    [studentPackageId]
  );
  const p = rows[0];
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_transactions WHERE student_package_id = $1`,
    [studentPackageId]
  );

  const shouldHave = !!p && p.status !== "Cancelado" && (p.price ?? 0) > 0;
  if (!shouldHave) {
    if (existing.length > 0) {
      await db.execute(
        `DELETE FROM finance_transactions WHERE student_package_id = $1`,
        [studentPackageId]
      );
    }
    return;
  }

  const pkgLabel = p.pkg_name?.trim() ? p.pkg_name.trim() : "Pacote";
  const desc = `${pkgLabel}: ${p.student_name ?? "Aluno"}`;
  if (existing.length > 0) {
    await db.execute(
      `UPDATE finance_transactions
          SET amount = $1, date = $2, description = $3, status = 'Recebido/Pago',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [p.price, p.purchased_at, desc, existing[0].id]
    );
    return;
  }
  const categoryId = await classIncomeCategoryId();
  await db.execute(
    `INSERT INTO finance_transactions (kind, amount, date, description, category_id, student_package_id, status)
     VALUES ('income', $1, $2, $3, $4, $5, 'Recebido/Pago')`,
    [p.price, p.purchased_at, desc, categoryId, studentPackageId]
  );
}

export async function deleteTransactionsForClass(classId: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM finance_transactions WHERE class_id = $1", [classId]);
}

export async function deleteTransactionsForStudentPackage(
  studentPackageId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    "DELETE FROM finance_transactions WHERE student_package_id = $1",
    [studentPackageId]
  );
}

// ============================================================
// Recorrentes
// ============================================================

export async function listRecurring(): Promise<FinanceRecurring[]> {
  const db = getDb();
  return db.select<FinanceRecurring[]>(
    "SELECT * FROM finance_recurring ORDER BY active DESC, kind, description"
  );
}

export async function createRecurring(
  input: FinanceRecurringCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO finance_recurring (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function deleteRecurring(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM finance_recurring WHERE id = $1", [id]);
}

export async function setRecurringActive(
  id: number,
  active: boolean
): Promise<void> {
  const db = getDb();
  await db.execute("UPDATE finance_recurring SET active = $1 WHERE id = $2", [
    active ? 1 : 0,
    id,
  ]);
}

/**
 * Gera lançamentos do mês para todos os recorrentes ativos que
 * ainda não geraram para esse mês. Retorna nº de transações criadas.
 */
export async function generateRecurringForMonth(yearMonth: string): Promise<number> {
  const db = getDb();
  const recs = await db.select<FinanceRecurring[]>(
    "SELECT * FROM finance_recurring WHERE active = 1"
  );
  let created = 0;
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-31`;

  for (const r of recs) {
    const existing = await db.select<{ id: number }[]>(
      `SELECT id FROM finance_transactions
        WHERE recurring_id = $1 AND date BETWEEN $2 AND $3`,
      [r.id, monthStart, monthEnd]
    );
    if (existing.length > 0) continue;

    const day = Math.min(r.day_of_month ?? 1, 28);
    const date = `${yearMonth}-${day.toString().padStart(2, "0")}`;
    await db.execute(
      `INSERT INTO finance_transactions
        (kind, amount, date, description, category_id, status, expense_type, recurring_id)
       VALUES ($1, $2, $3, $4, $5, 'Previsto', $6, $7)`,
      [
        r.kind,
        r.amount,
        date,
        r.description,
        r.category_id,
        r.kind === "expense" ? "Fixa" : null,
        r.id,
      ]
    );
    created += 1;
  }
  return created;
}

/**
 * Gera automaticamente os recorrentes para todos os meses entre o último
 * mês registrado (last_recurring_gen em app_settings) e o mês atual.
 * Deve ser chamado no boot do app, fire-and-forget.
 */
export async function autoGenerateRecurringUpToNow(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const currentYM = now.toISOString().slice(0, 7);

  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM app_settings WHERE key = 'last_recurring_gen'"
  );
  const lastGen = rows[0]?.value ?? null;

  const months: string[] = [];
  if (!lastGen) {
    months.push(currentYM);
  } else {
    // Enumerate months from lastGen (exclusive) up to currentYM (inclusive)
    const [ly, lm] = lastGen.split("-").map(Number);
    const [cy, cm] = currentYM.split("-").map(Number);
    let y = ly;
    let m = lm + 1;
    while (y < cy || (y === cy && m <= cm)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  for (const ym of months) {
    await generateRecurringForMonth(ym);
  }

  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    ["last_recurring_gen", currentYM]
  );
}

// ============================================================
// Patrimônio
// ============================================================

export async function listEquipment(): Promise<Equipment[]> {
  const db = getDb();
  return db.select<Equipment[]>(
    "SELECT * FROM equipment ORDER BY state, name COLLATE NOCASE ASC"
  );
}

export async function createEquipment(
  input: EquipmentCreateInput
): Promise<number> {
  const db = getDb();
  const cols = Object.keys(input);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (input as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO equipment (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return Number(res.lastInsertId);
}

export async function updateEquipment(
  input: EquipmentUpdateInput
): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const cols = Object.keys(rest);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => (rest as Record<string, unknown>)[k]);
  values.push(id);
  await db.execute(
    `UPDATE equipment SET ${sets} WHERE id = $${values.length}`,
    values
  );
}

export async function deleteEquipment(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM equipment WHERE id = $1", [id]);
}

// ============================================================
// Dashboard / Aggregates
// ============================================================

export type FinanceInsights = {
  monthIncome: number;
  monthExpense: number;
  monthBalance: number;
  yearIncome: number;
  yearExpense: number;
  yearBalance: number;
  /** Totais do período selecionado (igual ao mês atual quando period é vazio). */
  periodIncome: number;
  periodExpense: number;
  periodBalance: number;
  monthly: {
    month: string;
    income: number;
    expense: number;
    balance: number;
  }[]; // últimos 12 meses
  byIncomeCategory: { name: string; value: number }[];
  byExpenseCategory: { name: string; value: number }[];
  topGigs: {
    gig_id: number;
    event_name: string | null;
    venue_name: string;
    date: string;
    revenue: number;
  }[];
  fixedMonthlyExpenses: number;
  next30Receivable: number;
  next30Payable: number;
  /** Receita agrupada por fonte: GIG, Festa, Aulas, Outros (período selecionado). */
  incomeBySource: { name: string; value: number }[];
};

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function currentYear(): string {
  return new Date().toISOString().slice(0, 4);
}

function isoNDaysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 7);
}

/** Último dia do mês "YYYY-MM" como "YYYY-MM-DD" (lida com fev, 30/31 dias). */
function monthEnd(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const day = new Date(y, m, 0).getDate(); // dia 0 do mês seguinte = último dia deste
  return `${yyyymm}-${String(day).padStart(2, "0")}`;
}

function periodToDateFilter(period?: string): { fromDate?: string; toDate?: string } {
  if (!period || period === "all") return {};
  const now = new Date();
  if (period === "last12") {
    const d = new Date();
    d.setDate(d.getDate() - 365);
    return { fromDate: d.toISOString().slice(0, 10) };
  }
  if (period === "thismonth") {
    const m = now.toISOString().slice(0, 7);
    return { fromDate: `${m}-01`, toDate: monthEnd(m) };
  }
  if (period === "thisyear") {
    const y = now.toISOString().slice(0, 4);
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    return { fromDate: `${period}-01`, toDate: monthEnd(period) };
  }
  return {};
}

export async function loadFinanceInsights(period?: string): Promise<FinanceInsights> {
  const db = getDb();
  const month = currentMonth();
  const year = currentYear();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const today = isoToday();
  const in30 = isoNDaysFromNow(30);

  const isAllTime = !period || period === "all";
  const pf = periodToDateFilter(period);
  const periodWhere = isAllTime
    ? "1=1"
    : pf.fromDate && pf.toDate
    ? `date BETWEEN '${pf.fromDate}' AND '${pf.toDate}'`
    : pf.fromDate
    ? `date >= '${pf.fromDate}'`
    : pf.toDate
    ? `date <= '${pf.toDate}'`
    : `date BETWEEN '${monthStart}' AND '${monthEnd}'`;

  // KPIs do mês
  const monthRows = await db.select<{ kind: string; total: number }[]>(
    `SELECT kind, COALESCE(SUM(amount), 0) as total
       FROM finance_transactions
      WHERE date BETWEEN $1 AND $2
      GROUP BY kind`,
    [monthStart, monthEnd]
  );
  const monthIncome = monthRows.find((r) => r.kind === "income")?.total ?? 0;
  const monthExpense = monthRows.find((r) => r.kind === "expense")?.total ?? 0;

  const yearRows = await db.select<{ kind: string; total: number }[]>(
    `SELECT kind, COALESCE(SUM(amount), 0) as total
       FROM finance_transactions
      WHERE date BETWEEN $1 AND $2
      GROUP BY kind`,
    [yearStart, yearEnd]
  );
  const yearIncome = yearRows.find((r) => r.kind === "income")?.total ?? 0;
  const yearExpense = yearRows.find((r) => r.kind === "expense")?.total ?? 0;

  // Mensal — últimos 12 meses
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthsAgo(i));
  const monthlyRows = await db.select<
    { month: string; kind: string; total: number }[]
  >(
    `SELECT substr(date, 1, 7) as month, kind, COALESCE(SUM(amount), 0) as total
       FROM finance_transactions
      WHERE date >= $1
      GROUP BY substr(date, 1, 7), kind`,
    [`${months[0]}-01`]
  );
  const monthly = months.map((m) => {
    const i = monthlyRows.find((r) => r.month === m && r.kind === "income")?.total ?? 0;
    const e = monthlyRows.find((r) => r.month === m && r.kind === "expense")?.total ?? 0;
    return { month: m, income: i, expense: e, balance: i - e };
  });

  // Totais do período selecionado.
  const periodRows = await db.select<{ kind: string; total: number }[]>(
    `SELECT kind, COALESCE(SUM(amount), 0) as total
       FROM finance_transactions
      WHERE ${periodWhere}
      GROUP BY kind`
  );
  const periodIncome = periodRows.find((r) => r.kind === "income")?.total ?? 0;
  const periodExpense = periodRows.find((r) => r.kind === "expense")?.total ?? 0;

  // Por categoria — filtrado pelo período selecionado
  const catPeriod = periodWhere.replace(/\bdate\b/g, "t.date");
  const incomeByCat = await db.select<{ name: string; value: number }[]>(
    `SELECT COALESCE(c.name, 'Sem categoria') as name, COALESCE(SUM(t.amount), 0) as value
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.kind = 'income' AND ${catPeriod}
      GROUP BY t.category_id
      ORDER BY value DESC`
  );
  const expenseByCat = await db.select<{ name: string; value: number }[]>(
    `SELECT COALESCE(c.name, 'Sem categoria') as name, COALESCE(SUM(t.amount), 0) as value
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.kind = 'expense' AND ${catPeriod}
      GROUP BY t.category_id
      ORDER BY value DESC`
  );

  // Top GIGs (todas as receitas vinculadas a GIG)
  const topGigs = await db.select<
    { gig_id: number; event_name: string | null; venue_name: string; date: string; revenue: number }[]
  >(
    `SELECT t.gig_id, g.event_name, g.venue_name, g.date, SUM(t.amount) as revenue
       FROM finance_transactions t
       JOIN gigs g ON g.id = t.gig_id
      WHERE t.kind = 'income' AND t.gig_id IS NOT NULL
      GROUP BY t.gig_id
      ORDER BY revenue DESC
      LIMIT 5`
  );

  const fixedRows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM finance_transactions
      WHERE kind = 'expense' AND expense_type = 'Fixa'
        AND date BETWEEN $1 AND $2`,
    [monthStart, monthEnd]
  );
  const fixedMonthlyExpenses = fixedRows[0]?.total ?? 0;

  const next30 = await db.select<{ kind: string; total: number }[]>(
    `SELECT kind, COALESCE(SUM(amount), 0) as total
       FROM finance_transactions
      WHERE status = 'Previsto' AND date BETWEEN $1 AND $2
      GROUP BY kind`,
    [today, in30]
  );
  const next30Receivable = next30.find((r) => r.kind === "income")?.total ?? 0;
  const next30Payable = next30.find((r) => r.kind === "expense")?.total ?? 0;

  // Receita por fonte (GIG / Festa / Aulas / Outros) no período selecionado
  const sourceWhere = `kind = 'income' AND ${periodWhere}`;
  const sourceRows = await db.select<{ source: string; total: number }[]>(
    `SELECT
       CASE
         WHEN gig_id IS NOT NULL THEN 'GIG'
         WHEN party_id IS NOT NULL THEN 'Festa'
         WHEN class_id IS NOT NULL OR student_package_id IS NOT NULL THEN 'Aulas'
         ELSE 'Outros'
       END AS source,
       COALESCE(SUM(amount), 0) AS total
     FROM finance_transactions
     WHERE ${sourceWhere}
     GROUP BY source
     ORDER BY total DESC`
  );
  const incomeBySource = sourceRows.map((r) => ({ name: r.source, value: r.total }));

  return {
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    yearIncome,
    yearExpense,
    yearBalance: yearIncome - yearExpense,
    periodIncome,
    periodExpense,
    periodBalance: periodIncome - periodExpense,
    monthly,
    byIncomeCategory: incomeByCat,
    byExpenseCategory: expenseByCat,
    topGigs,
    fixedMonthlyExpenses,
    next30Receivable,
    next30Payable,
    incomeBySource,
  };
}

// ============================================================
// Lucro por projeto (GIGs e festas)
// ============================================================

export type ProjectProfit = {
  kind: "gig" | "party" | "student";
  id: number;
  name: string;
  date: string | null;
  income: number;
  expense: number;
  profit: number;
};

/**
 * Lucro consolidado por projeto:
 *  - GIGs: receitas e despesas vinculadas via gig_id.
 *  - Festas: bilheteria (price × quantity_sold) e custos do orçamento.
 *  - Alunos: soma de aulas realizadas com valor + pacotes vendidos.
 */
export async function loadProjectProfit(): Promise<{
  gigs: ProjectProfit[];
  parties: ProjectProfit[];
  students: ProjectProfit[];
}> {
  const db = getDb();

  const [gigRows, partyRows, studentRows] = await Promise.all([
    db.select<
      { id: number; name: string; date: string; income: number; expense: number }[]
    >(
      `SELECT t.gig_id AS id,
              COALESCE(NULLIF(g.event_name,''), g.venue_name) AS name,
              g.date AS date,
              COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN t.kind='expense' THEN t.amount END), 0) AS expense
         FROM finance_transactions t
         JOIN gigs g ON g.id = t.gig_id
        WHERE t.gig_id IS NOT NULL
        GROUP BY t.gig_id
        ORDER BY (income - expense) DESC`
    ),
    db.select<
      { id: number; name: string; date: string | null; income: number; expense: number }[]
    >(
      `SELECT p.id AS id,
              p.title AS name,
              p.date AS date,
              (SELECT COALESCE(SUM(price * quantity_sold), 0) FROM party_tickets WHERE party_id = p.id) AS income,
              (SELECT COALESCE(SUM(actual_amount), 0) FROM party_budget_items WHERE party_id = p.id) AS expense
         FROM parties p`
    ),
    db.select<{ id: number; name: string; income: number }[]>(
      `SELECT s.id, s.name, COALESCE(SUM(t.amount), 0) AS income
         FROM students s
         JOIN finance_transactions t ON t.kind = 'income' AND (
           EXISTS (SELECT 1 FROM classes c WHERE c.id = t.class_id AND c.student_id = s.id)
           OR EXISTS (SELECT 1 FROM student_packages sp WHERE sp.id = t.student_package_id AND sp.student_id = s.id)
         )
        GROUP BY s.id, s.name
        HAVING income > 0
        ORDER BY income DESC`
    ),
  ]);

  const gigs: ProjectProfit[] = gigRows.map((r) => ({
    kind: "gig",
    id: r.id,
    name: r.name,
    date: r.date,
    income: r.income,
    expense: r.expense,
    profit: r.income - r.expense,
  }));

  const parties: ProjectProfit[] = partyRows
    .map((r) => ({
      kind: "party" as const,
      id: r.id,
      name: r.name,
      date: r.date,
      income: r.income,
      expense: r.expense,
      profit: r.income - r.expense,
    }))
    .filter((p) => p.income !== 0 || p.expense !== 0)
    .sort((a, b) => b.profit - a.profit);

  const students: ProjectProfit[] = studentRows.map((r) => ({
    kind: "student",
    id: r.id,
    name: r.name,
    date: null,
    income: r.income,
    expense: 0,
    profit: r.income,
  }));

  return { gigs, parties, students };
}
