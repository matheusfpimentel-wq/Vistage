export const CONTACT_TYPES = [
  "Contratante",
  "Booker",
  "Produtor de eventos",
  "DJ parceiro",
  "Músico",
  "Influencer",
  "Gerente de Club",
  "Dono de Club",
] as const;
export type ContactType = string;

export const CONTACT_PRIORITIES = ["Alta", "Média", "Baixa"] as const;
export type ContactPriority = (typeof CONTACT_PRIORITIES)[number];

/** Mapeia o legado `rating` (1..5) para a nova prioridade textual. */
export function ratingToPriority(rating: number | null): ContactPriority | null {
  if (rating === null) return null;
  if (rating >= 4) return "Alta";
  if (rating >= 2) return "Média";
  return "Baixa";
}

export function priorityToRating(p: ContactPriority | null): number | null {
  if (p === null) return null;
  if (p === "Alta") return 5;
  if (p === "Média") return 3;
  return 1;
}

/** Linha da tabela `contacts`. `types` e `tags` são serializados como JSON. */
export type Contact = {
  id: number;
  name: string;
  types: ContactType[];
  phone: string | null;
  email: string | null;
  instagram: string | null;
  city: string | null;
  tags: string[];
  notes: string | null;
  rating: number | null; // 1..5
  last_interaction_at: string | null;
  photo_path: string | null;
  follower_count: number | null;
  venue_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ContactCreateInput = Omit<
  Contact,
  "id" | "created_at" | "updated_at" | "last_interaction_at"
> & {
  last_interaction_at?: string | null;
};

export type ContactUpdateInput = Partial<ContactCreateInput> & { id: number };

export type ContactInteraction = {
  id: number;
  contact_id: number;
  date: string; // YYYY-MM-DD
  note: string;
  created_at: string;
};

/** Estatísticas computadas a partir de GIGs vinculadas. */
export type ContactStats = {
  gigCount: number;
  totalRevenue: number;
  lastGigDate: string | null;
};
