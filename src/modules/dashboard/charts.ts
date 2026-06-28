import { getDb } from "@/lib/db";

/** Período dos gráficos: mês corrente, ano atual, ano até hoje (YTD) ou tudo. */
export type ChartPeriod = "mes" | "ano" | "ytd" | "tudo";

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

/** Mês atual local em "YYYY-MM". */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

/** Lista de meses (YYYY-MM) de `from` até `to` inclusive, ordem crescente. */
function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  // Limite defensivo (120 meses = 10 anos) pra não explodir com datas absurdas.
  while ((y < ty || (y === ty && m <= tm)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

type CountByMonth = { m: string; c: number };

/**
 * Descobre o mês (YYYY-MM) MAIS ANTIGO com dados em qualquer tabela relevante.
 * Query tolerante (try/catch); se vier vazio, devolve `null` e o chamador faz
 * fallback para 12 meses.
 */
async function earliestDataMonth(): Promise<string | null> {
  const db = getDb();
  try {
    const rows = await db.select<{ m: string | null }[]>(
      `SELECT MIN(m) AS m FROM (
         SELECT MIN(substr(date, 1, 7)) m FROM gigs
         UNION ALL SELECT MIN(substr(created_at, 1, 7)) FROM tasks
         UNION ALL SELECT MIN(substr(created_at, 1, 7)) FROM ideas
         UNION ALL SELECT MIN(substr(created_at, 1, 7)) FROM tracks
         UNION ALL SELECT MIN(substr(date, 1, 7)) FROM finance_transactions
       )`
    );
    const m = rows[0]?.m ?? null;
    return m && m.length === 7 ? m : null;
  } catch {
    return null;
  }
}

/** Lista de meses (YYYY-MM, crescente, terminando agora) conforme o período. */
async function monthsForPeriod(period: ChartPeriod): Promise<string[]> {
  const now = new Date();
  const year = now.getFullYear();
  const cur = currentMonth();

  switch (period) {
    case "mes":
      // Só o mês corrente (1 bucket).
      return [cur];
    case "ytd":
      // Jan → mês atual do ano atual.
      return monthsBetween(`${year}-01`, cur);
    case "tudo": {
      // Do mês mais antigo com dados até agora; sem dados → 12 meses.
      const start = await earliestDataMonth();
      return start ? monthsBetween(start, cur) : lastNMonths(12);
    }
    case "ano":
    default:
      // Jan → dez do ano atual (12 meses fixos).
      return monthsBetween(`${year}-01`, `${year}-12`);
  }
}

/**
 * Séries mensais para os gráficos do dashboard, conforme o período escolhido
 * (mês / ano / YTD / tudo). Cada query é isolada e tolerante a falha
 * (tabela/coluna ausente → série zerada) pra não derrubar a seção inteira.
 * Os buckets fora da lista de meses simplesmente não aparecem; como todos os
 * períodos terminam "agora", não há limite superior nas queries (só `>= start`).
 */
export async function loadMonthlyCharts(
  period: ChartPeriod = "ano"
): Promise<MonthlyChartPoint[]> {
  const db = getDb();
  const months = await monthsForPeriod(period);
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
