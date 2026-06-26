import { getDb } from "@/lib/db";

/**
 * Tarefas LEGADAS de outra origem. Aqui ficam os utilitários que ligam a tarefa
 * de volta à origem: marcar (derived_type/derived_id), limpar o backlink ao
 * excluir, e espelhar o status de volta na origem.
 */

// (tabela da origem, coluna de backlink, derived_type) — origens que viram
// tarefa "legada" (título/tag travados na UI).
const BACKLINKS: { table: string; col: string; type: string }[] = [
  { table: "gigs", col: "prep_task_id", type: "gig_prep" },
  { table: "gigs", col: "debrief_task_id", type: "gig_debrief" },
  { table: "gigs", col: "payment_task_id", type: "gig_payment" },
  { table: "tracks", col: "task_id", type: "track" },
  { table: "classes", col: "task_id", type: "class" },
  { table: "content", col: "task_id", type: "content" },
  { table: "content", col: "publish_task_id", type: "content" },
  { table: "content", col: "task_roteiro_id", type: "content" },
  { table: "content", col: "task_gravacao_id", type: "content" },
  { table: "content", col: "task_edicao_id", type: "content" },
  { table: "parties", col: "event_task_id", type: "party" },
  { table: "meetings", col: "task_id", type: "meeting" },
];

// Backlinks que NÃO marcam como legada, mas ainda devem ser limpos ao excluir
// a tarefa (pra origem não apontar pra uma tarefa que não existe mais).
const EXTRA_BACKLINKS: { table: string; col: string }[] = [
  { table: "gigs", col: "main_goal_task_id" },
  { table: "ideas", col: "task_id" },
  { table: "party_tasks", col: "global_task_id" },
];

/** Boot: marca tarefas legadas (derived_type/derived_id) a partir dos backlinks. */
export async function syncDerivedTaskMarkers(): Promise<void> {
  const db = getDb();
  for (const b of BACKLINKS) {
    try {
      await db.execute(
        `UPDATE tasks
            SET derived_type = $1,
                derived_id = (SELECT s.id FROM ${b.table} s WHERE s.${b.col} = tasks.id LIMIT 1)
          WHERE derived_type IS NULL
            AND id IN (SELECT ${b.col} FROM ${b.table} WHERE ${b.col} IS NOT NULL)`,
        [b.type]
      );
    } catch {
      /* coluna/tabela ausente em bancos antigos — ignora */
    }
  }
  await clearOrphanDerivedMarkers();
}

/**
 * Limpa marcadores `derived_type`/`derived_id` ÓRFÃOS: tarefas marcadas como
 * legadas de uma origem que NÃO existe mais (a GIG/conteúdo/etc. que as gerou
 * foi excluída, mas o marcador ficou). Sem isto a tarefa exibe pra sempre o
 * aviso "vinculada a Preparação de GIG" sem haver vínculo real — e fica travada
 * (título/tags bloqueados) à toa. Só limpa um TIPO quando consegue conferir
 * TODAS as suas colunas de backlink (se alguma falta, não arrisca apagar).
 */
async function clearOrphanDerivedMarkers(): Promise<void> {
  const db = getDb();
  // Agrupa os backlinks por derived_type.
  const byType = new Map<string, { table: string; col: string }[]>();
  for (const b of BACKLINKS) {
    const arr = byType.get(b.type) ?? [];
    arr.push({ table: b.table, col: b.col });
    byType.set(b.type, arr);
  }

  for (const [type, cols] of byType) {
    const supported = new Set<number>();
    let allOk = true;
    for (const c of cols) {
      try {
        const rows = await db.select<{ id: number }[]>(
          `SELECT ${c.col} AS id FROM ${c.table} WHERE ${c.col} IS NOT NULL`
        );
        for (const r of rows) supported.add(r.id);
      } catch {
        allOk = false; // coluna/tabela ausente — não dá pra conferir este tipo
        break;
      }
    }
    if (!allOk) continue;

    const orphans = await db
      .select<{ id: number }[]>(
        `SELECT id FROM tasks WHERE derived_type = $1 AND derived_id IS NOT NULL`,
        [type]
      )
      .catch(() => [] as { id: number }[]);
    for (const t of orphans) {
      if (!supported.has(t.id)) {
        await db
          .execute(
            "UPDATE tasks SET derived_type = NULL, derived_id = NULL WHERE id = $1",
            [t.id]
          )
          .catch(() => {});
      }
    }
  }
}

/** Marca uma tarefa como legada de uma origem (idempotente). */
export async function markTaskDerived(taskId: number, type: string, sourceId: number): Promise<void> {
  try {
    await getDb().execute(
      "UPDATE tasks SET derived_type = $1, derived_id = $2 WHERE id = $3",
      [type, sourceId, taskId]
    );
  } catch {
    /* ignora */
  }
}

/** Excluir tarefa = "não quero a tarefa": zera qualquer backlink na origem. */
export async function clearTaskBacklinks(taskId: number): Promise<void> {
  const db = getDb();
  for (const b of [...BACKLINKS, ...EXTRA_BACKLINKS]) {
    try {
      await db.execute(`UPDATE ${b.table} SET ${b.col} = NULL WHERE ${b.col} = $1`, [taskId]);
    } catch {
      /* ignora */
    }
  }
}

/**
 * Status da tarefa → origem (espelho de duas vias). Ex.: concluir a tarefa de
 * preparação marca o preparo da GIG como pronto. (A track tem caminho próprio em
 * advanceTrackForCompletedStageTask.)
 */
export async function mirrorDerivedStatusToSource(
  type: string,
  sourceId: number,
  status: string
): Promise<void> {
  const db = getDb();
  const done = status === "Concluída";
  try {
    if (type === "gig_prep") {
      await db.execute("UPDATE gigs SET prep_state = $1 WHERE id = $2", [done ? "done" : "todo", sourceId]);
    } else if (type === "gig_debrief" && done) {
      await db.execute(
        "UPDATE gigs SET debrief_completed_at = COALESCE(debrief_completed_at, datetime('now')), debrief_pending = 0 WHERE id = $1",
        [sourceId]
      );
    }
  } catch {
    /* coluna ausente — ignora */
  }
}
