import { getDb } from "@/lib/db";

/** Um ponto mensal com as contagens/valores de cada métrica. */
export type MonthlyChartPoint = {
  month: string; // "YYYY-MM"
  label: string; // "jun/26"
  gigs: number;
  tasksCreated: number;
  tasksDone: number;
  ideas: number;
  tracks: number;
  income: number;
  expense: number;
};

const MES_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MES_ABBR[(m - 1) % 12]}/${String(y).slice(2)}`;
}

/** Últimos N meses (YYYY-MM) em ordem crescente, terminando no mês atual local. */
function lastNMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

type CountByMonth = { m: string; c: number };

/**
 * Séries mensais (12 meses) para os gráficos do dashboard. Cada query é
 * isolada e tolerante a falha (tabela/coluna ausente → série zerada) pra não
 * derrubar a aba inteira.
 */
export async function loadMonthlyCharts(): Promise<MonthlyChartPoint[]> {
  const db = getDb();
  const months = lastNMonths(12);
  const start = `${months[0]}-01`;

  const count = (sql: string) =>
    db.select<CountByMonth[]>(sql, [start]).catch(() => [] as CountByMonth[]);

  const [gigsRows, tCreatedRows, tDoneRows, ideasRows, tracksRows, finRows] =
    await Promise.all([
      count(
        `SELECT substr(date, 1, 7) AS m, COUNT(*) AS c FROM gigs
          WHERE date >= $1 AND status != 'Cancelada' GROUP BY m`
      ),
      count(
        `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS c FROM tasks
          WHERE created_at >= $1 GROUP BY m`
      ),
      count(
        `SELECT substr(updated_at, 1, 7) AS m, COUNT(*) AS c FROM tasks
          WHERE status = 'Concluída' AND updated_at >= $1 GROUP BY m`
      ),
      count(
        `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS c FROM ideas
          WHERE created_at >= $1 GROUP BY m`
      ),
      count(
        `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS c FROM tracks
          WHERE created_at >= $1 GROUP BY m`
      ),
      db
        .select<{ m: string; kind: string; total: number }[]>(
          `SELECT substr(date, 1, 7) AS m, kind, COALESCE(SUM(amount), 0) AS total
             FROM finance_transactions WHERE date >= $1 GROUP BY m, kind`,
          [start]
        )
        .catch(() => [] as { m: string; kind: string; total: number }[]),
    ]);

  const mapOf = (rows: CountByMonth[]) => new Map(rows.map((r) => [r.m, r.c]));
  const gM = mapOf(gigsRows);
  const tcM = mapOf(tCreatedRows);
  const tdM = mapOf(tDoneRows);
  const iM = mapOf(ideasRows);
  const trM = mapOf(tracksRows);
  const incM = new Map(finRows.filter((r) => r.kind === "income").map((r) => [r.m, r.total]));
  const expM = new Map(finRows.filter((r) => r.kind === "expense").map((r) => [r.m, r.total]));

  return months.map((m) => ({
    month: m,
    label: monthLabel(m),
    gigs: gM.get(m) ?? 0,
    tasksCreated: tcM.get(m) ?? 0,
    tasksDone: tdM.get(m) ?? 0,
    ideas: iM.get(m) ?? 0,
    tracks: trM.get(m) ?? 0,
    income: incM.get(m) ?? 0,
    expense: expM.get(m) ?? 0,
  }));
}
