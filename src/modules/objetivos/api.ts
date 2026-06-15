import { getDb } from "@/lib/db";

export type KeyResult = {
  id: string;
  description: string;
  metric_source:
    | "manual"
    | "finance_revenue"
    | "gigs_completed"
    | "tracks_released"
    | "parties_executed"
    | "content_published";
  target: number;
  unit: string;
  current: number;
};

export type Okr = {
  id: number;
  quarter: string;
  objective: string;
  key_results: KeyResult[];
  created_at: string;
  updated_at: string;
};

type OkrRow = Omit<Okr, "key_results"> & { key_results: string };

function parseOkr(row: OkrRow): Okr {
  return {
    ...row,
    key_results: JSON.parse(row.key_results || "[]") as KeyResult[],
  };
}

export async function listOkrs(): Promise<Okr[]> {
  const db = getDb();
  const rows = await db.select<OkrRow[]>(`SELECT * FROM okrs ORDER BY quarter DESC, created_at DESC`);
  const okrs = rows.map(parseOkr);
  return pullMetrics(okrs);
}

export async function getOkr(id: number): Promise<Okr | null> {
  const db = getDb();
  const rows = await db.select<OkrRow[]>(`SELECT * FROM okrs WHERE id=$1`, [id]);
  if (!rows[0]) return null;
  const [okr] = await pullMetrics([parseOkr(rows[0])]);
  return okr;
}

export async function createOkr(input: { quarter: string; objective: string; key_results: KeyResult[] }): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO okrs (quarter, objective, key_results) VALUES ($1, $2, $3)`,
    [input.quarter, input.objective, JSON.stringify(input.key_results)]
  );
  return res.lastInsertId as number;
}

export async function updateOkr(input: { id: number; quarter: string; objective: string; key_results: KeyResult[] }): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE okrs SET quarter=$1, objective=$2, key_results=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
    [input.quarter, input.objective, JSON.stringify(input.key_results), input.id]
  );
}

export async function deleteOkr(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM okrs WHERE id=$1`, [id]);
}

// Calcula current automaticamente pra KRs com metric_source != manual
async function pullMetrics(okrs: Okr[]): Promise<Okr[]> {
  const db = getDb();
  const needs = new Set(
    okrs.flatMap((o) => o.key_results.map((kr) => kr.metric_source)).filter((s) => s !== "manual")
  );
  if (needs.size === 0) return okrs;

  const today = new Date().toISOString().slice(0, 7); // YYYY-MM
  const quarter = currentQuarter();
  const [qStart, qEnd] = quarterRange(quarter);

  const counts: Record<string, number> = {};

  if (needs.has("gigs_completed")) {
    const rows = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM gigs WHERE status='Concluída' AND date >= $1 AND date <= $2`,
      [qStart, qEnd]
    );
    counts.gigs_completed = rows[0]?.c ?? 0;
  }
  if (needs.has("tracks_released")) {
    const rows = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM tracks WHERE current_stage IN ('Lançamento','Pós-lançamento') AND stage_entered_at >= $1`,
      [qStart]
    );
    counts.tracks_released = rows[0]?.c ?? 0;
  }
  if (needs.has("parties_executed")) {
    const rows = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM parties WHERE status='Realizada' AND date >= $1 AND date <= $2`,
      [qStart, qEnd]
    );
    counts.parties_executed = rows[0]?.c ?? 0;
  }
  if (needs.has("content_published")) {
    const rows = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM content WHERE status='Publicado' AND publish_date >= $1 AND publish_date <= $2`,
      [qStart, qEnd]
    );
    counts.content_published = rows[0]?.c ?? 0;
  }
  if (needs.has("finance_revenue")) {
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(amount_cents),0) as total FROM finance_transactions WHERE type='income' AND date >= $1 AND date <= $2`,
      [qStart, qEnd]
    );
    counts.finance_revenue = Math.round((rows[0]?.total ?? 0) / 100);
  }

  void today; // suppress unused warning

  return okrs.map((o) => ({
    ...o,
    key_results: o.key_results.map((kr) => ({
      ...kr,
      current: kr.metric_source === "manual" ? kr.current : (counts[kr.metric_source] ?? kr.current),
    })),
  }));
}

export function currentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export function quarterRange(quarter: string): [string, string] {
  const [year, q] = quarter.split("-Q");
  const qNum = parseInt(q);
  const startMonth = (qNum - 1) * 3 + 1;
  const endMonth = qNum * 3;
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(parseInt(year), endMonth, 0).getDate();
  return [
    `${year}-${pad(startMonth)}-01`,
    `${year}-${pad(endMonth)}-${lastDay}`,
  ];
}

export function okrProgress(okr: Okr): number {
  if (okr.key_results.length === 0) return 0;
  const total = okr.key_results.reduce((s, kr) => {
    const pct = kr.target > 0 ? Math.min(1, kr.current / kr.target) : 0;
    return s + pct;
  }, 0);
  return total / okr.key_results.length;
}
