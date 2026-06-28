import { getDb } from "@/lib/db";
import { emitDataChanged } from "@/lib/events";
import { daysSince, effectiveHeat } from "./types";
import type {
  Idea,
  IdeaCategory,
  IdeaCollisionSeedType,
  IdeaConversion,
  IdeaCreateInput,
  IdeaHeat,
  IdeaMaturation,
  IdeaUpdateInput,
} from "./types";

type IdeaRow = Omit<Idea, "tags" | "currentHeat" | "daysSinceTouch"> & { tags: string | null };

function rowToIdea(r: IdeaRow): Idea {
  let tags: string[] = [];
  if (r.tags) {
    try {
      tags = JSON.parse(r.tags) as string[];
    } catch {
      tags = [];
    }
  }
  // Calor efetivo (decaído pela inatividade) — relógio = last_touched_at, com
  // fallback p/ updated_at/created_at no acervo anterior à migração v152.
  const touched = r.last_touched_at ?? r.updated_at ?? r.created_at;
  return {
    ...r,
    tags,
    daysSinceTouch: daysSince(touched),
    currentHeat: effectiveHeat(r.heat, touched),
  };
}

export type IdeaFilters = {
  category?: IdeaCategory | "Todas";
  maturation?: IdeaMaturation | "Todas";
  heat?: IdeaHeat | "all";
  search?: string;
};

export async function listIdeas(filters: IdeaFilters = {}): Promise<Idea[]> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters.category && filters.category !== "Todas") {
    params.push(filters.category);
    where.push(`category = $${params.length}`);
  }
  if (filters.maturation && filters.maturation !== "Todas") {
    params.push(filters.maturation);
    where.push(`maturation = $${params.length}`);
  }
  if (filters.heat && filters.heat !== "all") {
    params.push(filters.heat);
    where.push(`heat = $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim()}%`;
    params.push(q, q);
    const i = params.length;
    where.push(`(title LIKE $${i - 1} OR body LIKE $${i})`);
  }

  const sql =
    "SELECT * FROM ideas" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY heat DESC, updated_at DESC";
  const rows = await db.select<IdeaRow[]>(sql, params);
  const ideas = rows.map(rowToIdea);
  // Ordena pelo Calor EFETIVO (decaído): ideia parada afunda, ideia tocada sobe.
  // Sort estável → empate preserva a ordem do SQL (updated_at DESC).
  ideas.sort((a, b) => (b.currentHeat ?? b.heat) - (a.currentHeat ?? a.heat));
  return ideas;
}

export async function createIdea(input: IdeaCreateInput): Promise<number> {
  const db = getDb();
  // source default 'manual'; last_touched_at é gravado logo após o insert (não dá
  // pra usar CURRENT_TIMESTAMP no VALUES dinâmico) — relógio do decaimento começa agora.
  const payload = {
    ...input,
    tags: JSON.stringify(input.tags ?? []),
    source: input.source ?? "manual",
  };
  const cols = Object.keys(payload);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const values = cols.map((k) => (payload as Record<string, unknown>)[k]);
  const res = await db.execute(
    `INSERT INTO ideas (${cols.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const id = Number(res.lastInsertId);
  await db.execute("UPDATE ideas SET last_touched_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  // Ideias NÃO geram tarefa automática — a criação de tarefa(s) é manual, pela
  // opção que aparece quando a ideia está em "Desenvolvendo" (ver IdeaForm).
  emitDataChanged();
  return id;
}

export async function updateIdea(input: IdeaUpdateInput): Promise<void> {
  const db = getDb();
  const { id, ...rest } = input;
  const payload: Record<string, unknown> = { ...rest };
  if (Array.isArray(payload.tags)) payload.tags = JSON.stringify(payload.tags);
  const cols = Object.keys(payload);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const values = cols.map((k) => payload[k]);
  values.push(id);
  // Editar a ideia também a "toca" (reaquece): reseta o relógio do decaimento.
  await db.execute(
    `UPDATE ideas SET ${sets}, updated_at = CURRENT_TIMESTAMP, last_touched_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  const rows = await db.select<{ task_id: number | null }[]>(
    "SELECT task_id FROM ideas WHERE id = $1", [id]
  );
  const taskId = rows[0]?.task_id;
  if (taskId) {
    try {
      const { updateTask } = await import("@/modules/tasks/api");
      const taskUpdate: Parameters<typeof updateTask>[0] = { id: taskId };
      if (input.title) taskUpdate.title = `Ideia: ${input.title}`;
      if (input.maturation === "Pronta") taskUpdate.status = "Concluída";
      if (Object.keys(taskUpdate).length > 1) {
        await updateTask(taskUpdate);
      }
    } catch {
      /* não interrompe */
    }
  }
  emitDataChanged();
}

export async function deleteIdea(id: number): Promise<void> {
  const db = getDb();
  const rows = await db.select<{ task_id: number | null }[]>(
    "SELECT task_id FROM ideas WHERE id = $1",
    [id]
  );
  const taskId = rows[0]?.task_id ?? null;
  await db.execute("DELETE FROM ideas WHERE id = $1", [id]);
  if (taskId) {
    await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
  }
  emitDataChanged();
}

/** Registra o alvo da conversão. A maturação 'Pronta' acumula as convertidas. */
export async function markIdeaAsConverted(
  ideaId: number,
  to: IdeaConversion,
  newId: number
): Promise<void> {
  const db = getDb();
  await db.execute(
    `UPDATE ideas SET converted_to = $1, converted_id = $2, maturation = 'Pronta',
                      updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
    [to, newId, ideaId]
  );
}

// ============================================================
// Ressurgimento — decaimento do Calor + fila "Ressurgir"
// ============================================================

/** Ideia esfriada (Calor efetivo ≤ este valor) já é candidata a ressurgir. */
const IDEA_RESURFACE_COOLED_BELOW = 2.5;
/** Só ressurge o que está dormente há pelo menos tantos dias. */
const IDEA_RESURFACE_MIN_DORMANT_DAYS = 21;

/**
 * Reaquece a ideia: reseta o relógio do decaimento (last_touched_at = agora), de
 * modo que o Calor efetivo volta a ser o Calor armazenado. Não altera o Calor
 * manual nem a maturação — é só "voltei a olhar pra isto".
 */
export async function touchIdea(id: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE ideas SET last_touched_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id]
  );
  emitDataChanged();
}

/**
 * Arquiva de vez (maturação 'Arquivada'): sai do mural ativo, da fila Ressurgir e
 * das provocações. NÃO reaquece (não toca o relógio do decaimento).
 */
export async function archiveIdea(id: number): Promise<void> {
  const db = getDb();
  await db.execute(
    "UPDATE ideas SET maturation = 'Arquivada', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id]
  );
  emitDataChanged();
}

/**
 * Fila "Ressurgir": ideias dormentes (estavam mornas/quentes, esfriaram pela
 * inatividade e ninguém tocou há um tempo) — candidatas a um olhar fresco.
 * Exclui Pronta/Arquivada/convertidas. Ordena pelas mais esfriadas primeiro.
 */
export async function listResurfaceIdeas(limit = 20): Promise<Idea[]> {
  const db = getDb();
  const rows = await db.select<IdeaRow[]>(
    `SELECT * FROM ideas
       WHERE maturation NOT IN ('Pronta', 'Arquivada')
         AND converted_id IS NULL
         AND heat >= 3`
  );
  const ideas = rows
    .map(rowToIdea)
    .filter(
      (i) =>
        (i.daysSinceTouch ?? 0) >= IDEA_RESURFACE_MIN_DORMANT_DAYS &&
        (i.currentHeat ?? i.heat) <= IDEA_RESURFACE_COOLED_BELOW
    );
  ideas.sort((a, b) => {
    const dropA = a.heat - (a.currentHeat ?? a.heat);
    const dropB = b.heat - (b.currentHeat ?? b.heat);
    if (dropB !== dropA) return dropB - dropA;
    return (b.daysSinceTouch ?? 0) - (a.daysSinceTouch ?? 0);
  });
  return ideas.slice(0, limit);
}

/**
 * Cria uma tarefa a partir de uma ideia (semeada com a tag 'ideia', vencimento
 * +60d) — mesma forma do "Criar tarefa" do IdeaForm. Não vincula task_id (a
 * ideia segue viva); quem chama decide se reaquece/arquiva depois.
 */
export async function createTaskFromIdea(idea: Pick<Idea, "title">): Promise<number> {
  const { createTask } = await import("@/modules/tasks/api");
  const { toLocalISODate } = await import("@/lib/format");
  const due = new Date();
  due.setDate(due.getDate() + 60);
  return createTask({
    title: idea.title.trim(),
    description: null,
    category: null,
    gig_id: null,
    contact_id: null,
    priority: "Média",
    status: "A fazer",
    due_date: toLocalISODate(due),
    tags: ["ideia"],
  });
}

/** Carrega uma única ideia (com Calor efetivo calculado). Null se não existir. */
export async function getIdea(id: number): Promise<Idea | null> {
  const db = getDb();
  const rows = await db.select<IdeaRow[]>("SELECT * FROM ideas WHERE id = $1", [id]);
  return rows[0] ? rowToIdea(rows[0]) : null;
}

// ============================================================
// Colisão de ideias (§3) — movimento gerativo
// ============================================================

/** Item do material que pode colidir com uma ideia (GIG/fã/faixa/nota). */
export type MaterialSeed = { tipo: IdeaCollisionSeedType; id: number; label: string };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sementes do material para "colidir ideia + item": amostra aleatória de GIGs,
 * fãs, faixas e notas da Biblioteca — conexão forçada ancorada na sua realidade
 * (o banco devolve faísca a partir de tudo que já está no app).
 */
export async function listMaterialSeeds(perType = 4): Promise<MaterialSeed[]> {
  const db = getDb();
  const out: MaterialSeed[] = [];
  try {
    const { listGigs } = await import("@/modules/gigs/api");
    const { gigDisplayName } = await import("@/modules/gigs/displayName");
    const gigs = await listGigs();
    for (const g of shuffle(gigs).slice(0, perType)) {
      out.push({ tipo: "gig", id: g.id, label: gigDisplayName(g) });
    }
  } catch {
    /* sem GIGs */
  }
  try {
    const fans = await db.select<{ id: number; name: string }[]>(
      "SELECT id, name FROM fans ORDER BY RANDOM() LIMIT $1",
      [perType]
    );
    for (const f of fans) out.push({ tipo: "fan", id: f.id, label: f.name });
  } catch {
    /* sem fãs */
  }
  try {
    const tracks = await db.select<{ id: number; label: string | null }[]>(
      "SELECT id, COALESCE(NULLIF(title_final, ''), title_working) AS label FROM tracks ORDER BY RANDOM() LIMIT $1",
      [perType]
    );
    for (const t of tracks) if (t.label) out.push({ tipo: "track", id: t.id, label: t.label });
  } catch {
    /* sem faixas */
  }
  try {
    const notes = await db.select<{ id: number; title: string }[]>(
      "SELECT id, title FROM notes WHERE title != '' ORDER BY RANDOM() LIMIT $1",
      [perType]
    );
    for (const n of notes) out.push({ tipo: "note", id: n.id, label: n.title });
  } catch {
    /* sem notas */
  }
  return shuffle(out);
}

/**
 * Cria a ideia nascida de uma colisão (source 'colisao'), relacionada à ideia A,
 * e registra a colisão em idea_collisions (duas ideias OU ideia + semente do
 * material). Retorna o id da nova ideia para desenvolvê-la em seguida.
 */
export async function createIdeaCollision(params: {
  title: string;
  body?: string | null;
  ideaA: number;
  ideaB?: number | null;
  seed?: { tipo: IdeaCollisionSeedType; id: number | null; label: string } | null;
}): Promise<number> {
  const newId = await createIdea({
    title: params.title,
    body: params.body ?? null,
    category: null,
    tags: [],
    heat: 3,
    maturation: "Embrião",
    converted_to: null,
    converted_id: null,
    related_idea_id: params.ideaA,
    source: "colisao",
  });
  const db = getDb();
  const res = await db.execute(
    `INSERT INTO idea_collisions (idea_a, idea_b, seed_tipo, seed_id, seed_label, idea_resultante)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.ideaA,
      params.ideaB ?? null,
      params.seed?.tipo ?? null,
      params.seed?.id ?? null,
      params.seed?.label ?? null,
      newId,
    ]
  );
  await db.execute("UPDATE ideas SET source_ref_id = $1 WHERE id = $2", [
    Number(res.lastInsertId),
    newId,
  ]);
  emitDataChanged();
  return newId;
}
