import { getDb } from "@/lib/db";

export const DECISION_DOMAINS = [
  "GIG",
  "Produção Musical",
  "Festas",
  "Conteúdo",
  "Financeiro",
  "Negócios",
  "Pessoal",
] as const;
export type DecisionDomain = (typeof DECISION_DOMAINS)[number];

export const OUTCOME_EVALUATIONS = ["Acertou", "Errou", "Inconclusivo"] as const;
export type OutcomeEvaluation = (typeof OUTCOME_EVALUATIONS)[number];

export type Decision = {
  id: number;
  context: string;
  options_considered: string | null;
  decision_made: string;
  reasoning: string | null;
  domain: DecisionDomain;
  outcome: string | null;
  outcome_evaluation: OutcomeEvaluation | null;
  learned: string | null;
  created_at: string;
  updated_at: string;
};

export type DecisionInput = Omit<Decision, "id" | "created_at" | "updated_at">;

export async function listDecisions(domain?: DecisionDomain): Promise<Decision[]> {
  const db = getDb();
  if (domain) {
    return db.select<Decision[]>(
      `SELECT * FROM decisions WHERE domain=$1 ORDER BY created_at DESC`,
      [domain]
    );
  }
  return db.select<Decision[]>(`SELECT * FROM decisions ORDER BY created_at DESC`);
}

export async function createDecision(input: DecisionInput): Promise<number> {
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO decisions (context, options_considered, decision_made, reasoning, domain, outcome, outcome_evaluation, learned)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.context,
      input.options_considered,
      input.decision_made,
      input.reasoning,
      input.domain,
      input.outcome,
      input.outcome_evaluation,
      input.learned,
    ]
  );
  return res.lastInsertId as number;
}

export async function updateDecision(input: Partial<DecisionInput> & { id: number }): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE decisions SET
      context=COALESCE($1,context),
      options_considered=COALESCE($2,options_considered),
      decision_made=COALESCE($3,decision_made),
      reasoning=COALESCE($4,reasoning),
      domain=COALESCE($5,domain),
      outcome=$6,
      outcome_evaluation=$7,
      learned=$8,
      updated_at=CURRENT_TIMESTAMP
     WHERE id=$9`,
    [
      input.context ?? null,
      input.options_considered ?? null,
      input.decision_made ?? null,
      input.reasoning ?? null,
      input.domain ?? null,
      input.outcome ?? null,
      input.outcome_evaluation ?? null,
      input.learned ?? null,
      input.id,
    ]
  );
}

export async function deleteDecision(id: number): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM decisions WHERE id=$1`, [id]);
}

export async function countPendingOutcomes(): Promise<number> {
  const db = getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM decisions WHERE outcome IS NOT NULL AND outcome != '' AND (outcome_evaluation IS NULL OR outcome_evaluation = '')`
  );
  return rows[0]?.c ?? 0;
}
