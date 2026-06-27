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

export type IdeaConversion = "task" | "content" | "gig" | "track";

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
  created_at: string;
  updated_at: string;
};

export type IdeaCreateInput = Omit<
  Idea,
  "id" | "created_at" | "updated_at" | "related_idea_id"
> & {
  related_idea_id?: number | null;
};
export type IdeaUpdateInput = Partial<IdeaCreateInput> & { id: number };

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
