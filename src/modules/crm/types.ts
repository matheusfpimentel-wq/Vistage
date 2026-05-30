export const CONTACT_TYPES = [
  "Cliente / Contratante",
  "Casa / Estabelecimento",
  "Agente / Booker",
  "Produtor de eventos",
  "Colaborador",
  "Fornecedor",
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

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
