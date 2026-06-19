export const CONTACT_TYPES = [
  "Contratante",
  "Booker",
  "Produtor de eventos",
  "DJ parceiro",
  "Músico",
  "Influencer",
  "Jornalista",
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

// ============================================================
// Tipo de relação (modelo "Pessoas")
// ============================================================

/** Todos os papéis exibidos. "Fornecedor" é derivado do fornecedor espelho. */
export const RELATIONSHIP_TYPES = [
  "Contratante",
  "Parceiro",
  "Alvo",
  "Músico",
  "Fornecedor",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Tipos editáveis no contato (Fornecedor é gerenciado via aba Serviços). */
export const CONTACT_RELATIONSHIP_TYPES = ["Contratante", "Parceiro", "Alvo", "Músico"] as const;
export type ContactRelationshipType = (typeof CONTACT_RELATIONSHIP_TYPES)[number];

/** Dados específicos por tipo de relação (aba de cada relação). */
export type RelationshipData = {
  Contratante?: { cacheReferencia?: number | null; notas?: string };
  Parceiro?: { tipo?: string; projetos?: string; notas?: string };
  Alvo?: { estagio?: AlvoEstagio; proximoPasso?: string; proximoPassoData?: string | null; notas?: string };
  "Músico"?: { instrumentos?: string; generos?: string; notas?: string };
};

export const ALVO_ESTAGIOS = ["Lead", "Em conversa", "Proposta enviada", "Fechado", "Perdido"] as const;
export type AlvoEstagio = (typeof ALVO_ESTAGIOS)[number];

/** Mapeia os `types` legados para o tipo de relação, pra contatos antigos já aparecerem com papéis. */
const LEGACY_TYPE_MAP: Record<string, ContactRelationshipType> = {
  Contratante: "Contratante",
  Booker: "Contratante",
  "Produtor de eventos": "Contratante",
  "Gerente de Club": "Contratante",
  "Dono de Club": "Contratante",
  "Músico": "Músico",
  "DJ parceiro": "Parceiro",
  Influencer: "Parceiro",
  Jornalista: "Parceiro",
};

export function deriveRelationshipTypes(types: string[]): ContactRelationshipType[] {
  const out = new Set<ContactRelationshipType>();
  for (const t of types) {
    const m = LEGACY_TYPE_MAP[t];
    if (m) out.add(m);
  }
  return [...out];
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
  company: string | null;
  relationship_types: ContactRelationshipType[];
  relationship_data: RelationshipData;
  created_at: string;
  updated_at: string;
};

export type ContactCreateInput = Omit<
  Contact,
  "id" | "created_at" | "updated_at" | "last_interaction_at" | "relationship_types" | "relationship_data"
> & {
  last_interaction_at?: string | null;
  relationship_types?: ContactRelationshipType[];
  relationship_data?: RelationshipData;
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
