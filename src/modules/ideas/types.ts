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
  "Convertida",
  "Arquivada",
] as const;
export type IdeaMaturation = (typeof IDEA_MATURATIONS)[number];

/** 1 = fria, 2 = morna, 3 = quente. */
export const IDEA_HEATS = [1, 2, 3] as const;
export type IdeaHeat = (typeof IDEA_HEATS)[number];

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
  created_at: string;
  updated_at: string;
};

export type IdeaCreateInput = Omit<Idea, "id" | "created_at" | "updated_at">;
export type IdeaUpdateInput = Partial<IdeaCreateInput> & { id: number };

export function heatLabel(h: IdeaHeat): string {
  return h === 1 ? "Fria" : h === 2 ? "Morna" : "Quente";
}

export function heatColor(h: IdeaHeat): string {
  return h === 1
    ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
    : h === 2
    ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
    : "bg-red-500/20 text-red-500 border-red-500/30";
}

/** Cor de fundo do card no mural — tons pastel rotativos. */
export const STICKY_COLORS = [
  "bg-yellow-200/20 border-yellow-500/30",
  "bg-pink-200/20 border-pink-500/30",
  "bg-purple-200/20 border-purple-500/30",
  "bg-emerald-200/20 border-emerald-500/30",
  "bg-sky-200/20 border-sky-500/30",
  "bg-orange-200/20 border-orange-500/30",
];
