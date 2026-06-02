import { getDb } from "@/lib/db";
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
  t.gig_id, t.contact_id, t.status, t.payment_method, t.expense_type,
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
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM finance_transactions WHERE id = $1", [id]);
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
  description: string
): Promise<void> {
  const db = getDb();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_transactions WHERE gig_id = $1 AND kind = 'income'`,
    [gigId]
  );

  if (!paid || !(amount > 0)) {
    // pagamento revertido ou sem valor: limpa lançamentos vinculados
    if (existing.length > 0) {
      await db.execute(
        `DELETE FROM finance_transactions WHERE gig_id = $1 AND kind = 'income'`,
        [gigId]
      );
    }
    return;
  }

  if (existing.length > 0) {
    await db.execute(
      `UPDATE finance_transactions
          SET amount = $1, date = $2, description = $3, status = 'Recebido/Pago',
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [amount, date, description, existing[0].id]
    );
    return;
  }

  // procura categoria "DJ"
  const cat = await db.select<{ id: number }[]>(
    `SELECT id FROM finance_categories WHERE kind = 'income' AND name = 'DJ' LIMIT 1`
  );
  const categoryId = cat[0]?.id ?? null;

  await db.execute(
    `INSERT INTO finance_transactions
       (kind, amount, date, description, category_id, gig_id, status)
     VALUES ('income', $1, $2, $3, $4, $5, 'Recebido/Pago')`,
    [amount, date, description, categoryId, gigId]
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
    venue_name: string;
    date: string;
    revenue: number;
  }[];
  fixedMonthlyExpenses: number;
  next30Receivable: number;
  next30Payable: number;
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

export async function loadFinanceInsights(): Promise<FinanceInsights> {
  const db = getDb();
  const month = currentMonth();
  const year = currentYear();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const today = isoToday();
  const in30 = isoNDaysFromNow(30);

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

  // Por categoria — mês atual
  const incomeByCat = await db.select<{ name: string; value: number }[]>(
    `SELECT COALESCE(c.name, 'Sem categoria') as name, COALESCE(SUM(t.amount), 0) as value
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.kind = 'income' AND t.date BETWEEN $1 AND $2
      GROUP BY t.category_id
      ORDER BY value DESC`,
    [monthStart, monthEnd]
  );
  const expenseByCat = await db.select<{ name: string; value: number }[]>(
    `SELECT COALESCE(c.name, 'Sem categoria') as name, COALESCE(SUM(t.amount), 0) as value
       FROM finance_transactions t
       LEFT JOIN finance_categories c ON c.id = t.category_id
      WHERE t.kind = 'expense' AND t.date BETWEEN $1 AND $2
      GROUP BY t.category_id
      ORDER BY value DESC`,
    [monthStart, monthEnd]
  );

  // Top GIGs (todas as receitas vinculadas a GIG)
  const topGigs = await db.select<
    { gig_id: number; venue_name: string; date: string; revenue: number }[]
  >(
    `SELECT t.gig_id, g.venue_name, g.date, SUM(t.amount) as revenue
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

  return {
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    yearIncome,
    yearExpense,
    yearBalance: yearIncome - yearExpense,
    monthly,
    byIncomeCategory: incomeByCat,
    byExpenseCategory: expenseByCat,
    topGigs,
    fixedMonthlyExpenses,
    next30Receivable,
    next30Payable,
  };
}
