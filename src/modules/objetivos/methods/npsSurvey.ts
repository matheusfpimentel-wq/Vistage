import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";

// ============================================================
// NPS — pesquisa própria (respostas manuais 0-10)
//
// API da tabela `nps_responses` (migração 153). Isto é o NPS "clássico" de
// mercado, na escala 0-10, registrado à mão a partir de respostas de
// fãs/contratantes — SEPARADO do NPS derivado das avaliações de contratante das
// GIGs (escala 0-5, em NpsSection). As duas escalas NÃO se misturam.
// ============================================================

export type NpsResponse = {
  id: number;
  score: number; // 0-10
  respondent: string | null;
  comment: string | null;
  response_date: string; // ISO yyyy-mm-dd
  source: string | null; // ex.: 'manual'
  created_at: string;
};

/** Dados para registrar uma nova resposta de NPS. */
export type NpsResponseInput = {
  score: number;
  respondent?: string | null;
  comment?: string | null;
  response_date: string;
  source?: string | null;
};

/** Lista todas as respostas, da mais recente para a mais antiga. */
export async function listNpsResponses(): Promise<NpsResponse[]> {
  const db = getDb();
  return db.select<NpsResponse[]>(
    "SELECT * FROM nps_responses ORDER BY response_date DESC, id DESC"
  );
}

/** Insere uma resposta de NPS e avisa o resto do app que os dados mudaram. */
export async function addNpsResponse(input: NpsResponseInput): Promise<void> {
  const db = getDb();
  await db.execute(
    `INSERT INTO nps_responses (score, respondent, comment, response_date, source)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.score,
      input.respondent?.trim() || null,
      input.comment?.trim() || null,
      input.response_date,
      input.source ?? "manual",
    ]
  );
  emitDataChanged();
}

/** Exclui uma resposta de NPS pelo id. */
export async function deleteNpsResponse(id: number): Promise<void> {
  const db = getDb();
  await db.execute("DELETE FROM nps_responses WHERE id = $1", [id]);
  emitDataChanged();
}
