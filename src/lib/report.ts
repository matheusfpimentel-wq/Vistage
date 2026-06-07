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
};

/** Resumo consolidado de um mês (YYYY-MM) para o relatório. */
export async function loadMonthlyReport(month: string): Promise<MonthlyReport> {
  const db = getDb();

  const [fin, gigs, parties, content, trackRows, tasks] = await Promise.all([
    db.select<{ kind: string; total: number }[]>(
      `SELECT kind, COALESCE(SUM(amount), 0) total
         FROM finance_transactions WHERE substr(date,1,7) = $1 GROUP BY kind`,
      [month]
    ),
    // "Realizadas" = aconteceram no mês. Conta Confirmada + Concluída, pois
    // muitas GIGs ficam como Confirmada mesmo após o evento (não são marcadas
    // como Concluída manualmente). Cancelada/Proposta ficam de fora.
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
    // tracks não tem coluna de data por stage; o histórico fica em stage_history (JSON).
    db.select<{ stage_history: string | null }[]>(
      `SELECT stage_history FROM tracks
        WHERE current_stage IN ('Lançamento','Pós-lançamento')`
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) c FROM tasks WHERE status = 'Concluída' AND substr(updated_at,1,7) = $1`,
      [month]
    ),
  ]);
  const income = fin.find((r) => r.kind === "income")?.total ?? 0;
  const expense = fin.find((r) => r.kind === "expense")?.total ?? 0;

  // Conta tracks que entraram em "Lançamento" dentro do mês selecionado.
  let tracksReleased = 0;
  for (const row of trackRows) {
    try {
      const hist = JSON.parse(row.stage_history || "[]") as {
        stage: string;
        entered_at: string;
      }[];
      const launched = hist.some(
        (h) => h.stage === "Lançamento" && h.entered_at?.slice(0, 7) === month
      );
      if (launched) tracksReleased++;
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
