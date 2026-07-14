export const IDEA_CATEGORIES = [
  "Conteúdo",
  "GIG",
  "Música",
  "Aulas",
  "Marketing",
  "Negócio",
  "Outro",
] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number];

export const IDEA_MATURATIONS = [
  "Embrião",
  "Desenvolvendo",
  "Pronta",
  "Arquivada",
] as const;
export type IdeaMaturation = (typeof IDEA_MATURATIONS)[number];

/**
 * Calor da ideia numa escala fria→quente de 5 níveis. Quanto mais quente, mais
 * vermelha. 1 = fria, 3 = morna, 5 = quente; 2 e 4 são as gradações intermédias.
 * (Dados antigos no esquema 1/2/3 são remapeados na migração v136: 2→3, 3→5.)
 */
export const IDEA_HEATS = [1, 2, 3, 4, 5] as const;
export type IdeaHeat = (typeof IDEA_HEATS)[number];

/** Nível máximo (ideia mais "quente") — usado pelo atalho do mural. */
export const IDEA_HEAT_MAX = 5;
/** Nível "neutro" pra onde o atalho de quente volta ao desmarcar. */
export const IDEA_HEAT_NEUTRAL = 3;

export type IdeaConversion = "task" | "content" | "gig" | "track" | "document" | "note";

/** Rótulo do FIM (o que a ideia virou) — usado no selo da aba Executadas. */
export const IDEA_CONVERSION_LABELS: Record<IdeaConversion, string> = {
  task: "Tarefa",
  content: "Conteúdo",
  gig: "GIG",
  track: "Produção musical",
  document: "Documento",
  note: "Conhecimento",
};

/** Procedência da ideia (de onde ela nasceu) — dimensão de rastreabilidade. */
export const IDEA_SOURCES = [
  "manual",
  "provocacao",
  "modo_foco",
  "biblioteca",
  "colisao",
] as const;
export type IdeaSource = (typeof IDEA_SOURCES)[number];

export type Idea = {
  id: number;
  title: string;
  body: string | null;
  category: IdeaCategory | null;
  tags: string[];
  heat: IdeaHeat;
  maturation: IdeaMaturation;
  converted_to: IdeaConversion | null;
  converted_id: number | null;
  related_idea_id: number | null;
  task_id?: number | null;
  /** Nota da Biblioteca que originou esta ideia (rastreabilidade da procedência). */
  source_note_id?: number | null;
  /** Relógio do decaimento do Calor: tocar/editar/reaquecer a ideia reseta-o. */
  last_touched_at?: string | null;
  /** Procedência (manual/provocacao/modo_foco/biblioteca/colisao). */
  source?: IdeaSource | null;
  /** Id da origem (interpretado conforme `source`): gig/fã/faixa/nota/colisão. */
  source_ref_id?: number | null;
  created_at: string;
  updated_at: string;
  /** Calor efetivo AGORA (decaído pela inatividade) — calculado, não persistido. */
  currentHeat?: number;
  /** Dias desde o último toque — calculado, não persistido. */
  daysSinceTouch?: number;
};

export type IdeaCreateInput = Omit<
  Idea,
  | "id"
  | "created_at"
  | "updated_at"
  | "related_idea_id"
  | "last_touched_at"
  | "source"
  | "source_ref_id"
  | "currentHeat"
  | "daysSinceTouch"
> & {
  related_idea_id?: number | null;
  source?: IdeaSource | null;
  source_ref_id?: number | null;
};
export type IdeaUpdateInput = Partial<IdeaCreateInput> & { id: number };

/**
 * Colisão gerativa: juntar duas ideias (idea_a + idea_b) OU uma ideia + uma
 * semente do material (seed_tipo/seed_id) para parir uma terceira ideia
 * (idea_resultante). Base associativa (Mednick): ideia nova é recombinação nova
 * de elementos que já existem.
 */
export type IdeaCollisionSeedType = "gig" | "fan" | "track" | "note" | "idea";

export type IdeaCollision = {
  id: number;
  idea_a: number | null;
  idea_b: number | null;
  seed_tipo: IdeaCollisionSeedType | null;
  seed_id: number | null;
  seed_label: string | null;
  idea_resultante: number | null;
  created_at: string;
};

// ============================================================
// Decaimento do Calor (ressurgimento) — funções puras
// ============================================================

/**
 * Meia-vida (dias) do decaimento do Calor por inatividade. Mais curta que a de
 * fãs (180d) de propósito: ideia parada esfria rápido e a fila "Ressurgir" se
 * abastece em semanas, não em anos. Tocar/editar/reaquecer a ideia reseta o relógio.
 */
export const IDEA_HEAT_HALF_LIFE_DAYS = 45;

/** Dias decorridos desde uma data ISO (SQLite "YYYY-MM-DD HH:MM:SS" UTC ou ISO-T). */
export function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const iso = dateStr.includes("T") ? dateStr : `${dateStr.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  const days = (Date.now() - t) / 86400000;
  return days > 0 ? days : 0;
}

/**
 * Calor efetivo AGORA = Calor armazenado decaído pela inatividade (meia-vida
 * exponencial, espelhando `decayedWeight` do motor de fãs). Retorna float em
 * (0, heat]. `lastTouchedAt` nulo (acervo antigo) → sem decaimento.
 */
export function effectiveHeat(
  heat: number,
  lastTouchedAt: string | null | undefined,
  halfLifeDays = IDEA_HEAT_HALF_LIFE_DAYS
): number {
  const ageDays = daysSince(lastTouchedAt);
  if (ageDays <= 0 || heat <= 0) return heat;
  return heat * Math.pow(0.5, ageDays / halfLifeDays);
}

/** Mapeia o Calor efetivo (float) para a faixa discreta 1..5 (pra badge/cor). */
export function heatBucket(currentHeat: number): IdeaHeat {
  const r = Math.round(currentHeat);
  if (r <= 1) return 1;
  if (r >= 5) return 5;
  return r as IdeaHeat;
}

const HEAT_LABELS: Record<IdeaHeat, string> = {
  1: "Fria",
  2: "Esfriando",
  3: "Morna",
  4: "Esquentando",
  5: "Quente",
};

export function heatLabel(h: IdeaHeat): string {
  return HEAT_LABELS[h] ?? "Morna";
}

/** Badge de calor — rampa fria→quente (branca → amarela → laranja → vermelha). */
const HEAT_BADGE: Record<IdeaHeat, string> = {
  1: "bg-zinc-400/15 text-zinc-400 border-zinc-400/30",
  2: "bg-yellow-300/20 text-yellow-500 border-yellow-300/30",
  3: "bg-amber-500/20 text-amber-500 border-amber-500/30",
  4: "bg-orange-500/20 text-orange-500 border-orange-500/30",
  5: "bg-red-500/20 text-red-500 border-red-500/30",
};

export function heatColor(h: IdeaHeat): string {
  return HEAT_BADGE[h] ?? HEAT_BADGE[3];
}

/**
 * Fundo do card no mural pintado pelo CALOR (não mais cores rotativas de
 * post-it): quanto mais quente, mais vermelho e mais forte.
 */
const HEAT_CARD_BG: Record<IdeaHeat, string> = {
  1: "bg-zinc-400/[0.06] border-zinc-400/25",
  2: "bg-yellow-300/[0.09] border-yellow-300/25",
  3: "bg-amber-500/[0.08] border-amber-500/25",
  4: "bg-orange-500/[0.10] border-orange-500/30",
  5: "bg-red-500/[0.13] border-red-500/35",
};

export function heatCardBg(h: IdeaHeat): string {
  return HEAT_CARD_BG[h] ?? HEAT_CARD_BG[3];
}
