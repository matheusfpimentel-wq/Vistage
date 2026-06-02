export const SOCIAL_NETWORKS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X (Twitter)",
  "LinkedIn",
  "Threads",
  "Spotify",
  "SoundCloud",
  "Beatport",
  "Bandcamp",
  "Mixcloud",
  "Apple Music",
  "Website",
  "Outro",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export type SocialLink = {
  network: SocialNetwork;
  handle: string;
  url: string;
};

export type PaletteColor = {
  hex: string;
  /** Rótulo opcional (ex: "Roxo principal", "Acento", "Texto escuro"). */
  label?: string;
};

export type FontEntry = {
  /** Nome da fonte (ex: "Clash Display", "Inter"). */
  name: string;
  /** Uso opcional (ex: "Títulos", "Corpo", "Destaque"). */
  role?: string;
  /** Caminho opcional do arquivo da fonte anexado. */
  file_path?: string | null;
};

export type ArtistIdentity = {
  id: 1;
  artist_name: string | null;
  bio_short: string | null;
  bio_long: string | null;
  socials: SocialLink[];
  logo_path: string | null;
  isotype_path: string | null;
  presskit_path: string | null;
  /** Paleta livre (qualquer número de cores). Substitui primary/secondary. */
  palette: PaletteColor[];
  /** Fontes da marca (tipografia). */
  fonts: FontEntry[];
  notes: string | null;
  updated_at: string;
};

export type ArtistIdentityInput = Omit<ArtistIdentity, "id" | "updated_at">;

export const TEMPLATE_CATEGORIES = [
  "Story",
  "Carrossel",
  "Agenda",
  "Banner",
  "Capa",
  "Outro",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type ArtistTemplate = {
  id: number;
  name: string;
  category: TemplateCategory | null;
  file_path: string | null;
  thumbnail_path: string | null;
  notes: string | null;
  created_at: string;
};

export type ArtistTemplateCreateInput = Omit<ArtistTemplate, "id" | "created_at">;
