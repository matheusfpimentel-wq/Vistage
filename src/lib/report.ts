import { getDb } from "./db";

export type MonthlyReport = {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  balance: number;
  gigsCompleted: number;
  gigsCache: number;
  partiesRealized: number;
  contentPublished: number;
  tracksReleased: number;
  tasksCompleted: number;
  // detalhe
  transactions: TransactionRow[];
  gigsList: GigRow[];
  partiesList: PartyRow[];
  contentList: ContentRow[];
  tracksList: TrackRow[];
  tasksList: TaskRow[];
};

export type TransactionRow = {
  date: string;
  kind: "income" | "expense";
  description: string;
  category: string | null;
  amount: number;
  status: string | null;
};

export type GigRow = { date: string; name: string; city: string | null; cache: number | null; status: string };
export type PartyRow = { date: string | null; name: string; status: string };
export type ContentRow = { publish_date: string | null; title: string; status: string };
export type TrackRow = { name: string; launched_at: string };
export type TaskRow = { title: string; due_date: string | null; status: string };

/** Resumo consolidado de um mês (YYYY-MM) para o relatório. */
export async function loadMonthlyReport(month: string): Promise<MonthlyReport> {
  const db = getDb();

  const [fin, gigs, parties, content, trackRows, tasks, txRows, gigsDetail, partiesDetail, contentDetail, tasksDetail] = await Promise.all([
    db.select<{ kind: string; total: number }[]>(
      `SELECT kind, COALESCE(SUM(amount), 0) total
         FROM finance_transactions WHERE substr(date,1,7) = $1 GROUP BY kind`,
      [month]
    ),
    db.select<{ c: number; cache: number }[]>(
      `SELECT COUNT(*) c, COALESCE(SUM(cache_amount), 0) cache
         FROM gigs
        WHERE status IN ('Concluída', 'Confirmada') AND substr(date,1,7) = $1`,
      [month]
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) c FROM parties
        WHERE status IN ('Realizada', 'Confirmada') AND substr(date,1,7) = $1`,
      [month]
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) c FROM content WHERE status = 'Publicado' AND substr(publish_date,1,7) = $1`,
      [month]
    ),
    db.select<{ stage_history: string | null; name: string }[]>(
      `SELECT name, stage_history FROM tracks
        WHERE current_stage IN ('Lançamento','Pós-lançamento')`
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) c FROM tasks WHERE status = 'Concluída' AND substr(updated_at,1,7) = $1`,
      [month]
    ),
    // transações detalhadas
    db.select<TransactionRow[]>(
      `SELECT t.date, t.kind, t.description, fc.name as category, t.amount, t.status
         FROM finance_transactions t
         LEFT JOIN finance_categories fc ON fc.id = t.category_id
        WHERE substr(t.date,1,7) = $1
        ORDER BY t.date, t.kind`,
      [month]
    ),
    // GIGs do mês
    db.select<GigRow[]>(
      `SELECT date, COALESCE(event_name, venue_name) as name, venue_city as city, cache_amount as cache, status
         FROM gigs WHERE status IN ('Concluída', 'Confirmada') AND substr(date,1,7) = $1
        ORDER BY date`,
      [month]
    ),
    // festas do mês
    db.select<PartyRow[]>(
      `SELECT date, title AS name, status FROM parties
        WHERE status IN ('Realizada', 'Confirmada') AND substr(date,1,7) = $1
        ORDER BY date`,
      [month]
    ),
    // conteúdo publicado no mês
    db.select<ContentRow[]>(
      `SELECT publish_date, title, status FROM content
        WHERE status = 'Publicado' AND substr(publish_date,1,7) = $1
        ORDER BY publish_date`,
      [month]
    ),
    // tarefas concluídas no mês
    db.select<TaskRow[]>(
      `SELECT title, due_date, status FROM tasks
        WHERE status = 'Concluída' AND substr(updated_at,1,7) = $1
        ORDER BY due_date`,
      [month]
    ),
  ]);

  const income = fin.find((r) => r.kind === "income")?.total ?? 0;
  const expense = fin.find((r) => r.kind === "expense")?.total ?? 0;

  let tracksReleased = 0;
  const tracksList: TrackRow[] = [];
  for (const row of trackRows) {
    try {
      const hist = JSON.parse(row.stage_history || "[]") as { stage: string; entered_at: string }[];
      const entry = hist.find((h) => h.stage === "Lançamento" && h.entered_at?.slice(0, 7) === month);
      if (entry) {
        tracksReleased++;
        tracksList.push({ name: row.name, launched_at: entry.entered_at });
      }
    } catch {
      // ignora histórico malformado
    }
  }

  return {
    month,
    income,
    expense,
    balance: income - expense,
    gigsCompleted: gigs[0]?.c ?? 0,
    gigsCache: gigs[0]?.cache ?? 0,
    partiesRealized: parties[0]?.c ?? 0,
    contentPublished: content[0]?.c ?? 0,
    tracksReleased,
    tasksCompleted: tasks[0]?.c ?? 0,
    transactions: txRows,
    gigsList: gigsDetail,
    partiesList: partiesDetail,
    contentList: contentDetail,
    tracksList,
    tasksList: tasksDetail,
  };
}

/** Últimos n meses como opções {value:"YYYY-MM", label:"junho de 2026"}. */
export function monthOptions(n = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const raw = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    out.push({ value, label });
  }
  return out;
}

/** Trimestre (YYYY-Qn) ao qual o mês pertence. */
export function quarterOfMonth(month: string): string {
  const [year, mm] = month.split("-");
  const q = Math.ceil(parseInt(mm) / 3);
  return `${year}-Q${q}`;
}

/** Gera string CSV do relatório detalhado. */
export function buildReportCsv(report: MonthlyReport, monthLabel: string): string {
  const rows: string[][] = [];

  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const row = (...cols: (string | number | null | undefined)[]) => rows.push(cols.map(esc));

  row("RELATÓRIO", monthLabel);
  row();

  row("== RECEITAS ==");
  row("Data", "Descrição", "Categoria", "Valor", "Status");
  for (const t of report.transactions.filter((t) => t.kind === "income")) {
    row(t.date, t.description, t.category, t.amount, t.status);
  }
  row();

  row("== DESPESAS ==");
  row("Data", "Descrição", "Categoria", "Valor", "Status");
  for (const t of report.transactions.filter((t) => t.kind === "expense")) {
    row(t.date, t.description, t.category, t.amount, t.status);
  }
  row();

  row("== GIGS ==");
  row("Data", "Nome", "Cidade", "Cachê", "Status");
  for (const g of report.gigsList) {
    row(g.date, g.name, g.city, g.cache, g.status);
  }
  row();

  row("== FESTAS ==");
  row("Data", "Nome", "Status");
  for (const p of report.partiesList) {
    row(p.date, p.name, p.status);
  }
  row();

  row("== CONTEÚDO PUBLICADO ==");
  row("Data", "Título", "Status");
  for (const c of report.contentList) {
    row(c.publish_date, c.title, c.status);
  }
  row();

  row("== TRACKS LANÇADAS ==");
  row("Nome", "Data de lançamento");
  for (const t of report.tracksList) {
    row(t.name, t.launched_at);
  }
  row();

  row("== TAREFAS CONCLUÍDAS ==");
  row("Título", "Prazo", "Status");
  for (const t of report.tasksList) {
    row(t.title, t.due_date, t.status);
  }

  return rows.map((r) => r.join(",")).join("\n");
}
