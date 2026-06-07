/** Lista padrão de redes, usada como fallback quando a Identidade não tem redes cadastradas. */
export const CONTENT_NETWORKS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "LinkedIn",
  "Threads",
  "Spotify",
] as const;
/**
 * Rede de conteúdo. É uma string livre porque as opções vêm das redes sociais
 * cadastradas no módulo Identidade (com fallback para CONTENT_NETWORKS).
 */
export type ContentNetwork = string;

export const CONTENT_FORMATS = [
  "Reels",
  "Story",
  "Post",
  "Carrossel",
  "Vídeo longo",
  "Live",
  "Podcast",
  "Outro",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_STATUSES = [
  "Ideia",
  "Roteiro",
  "Gravando",
  "Edição",
  "Pronto",
  "Publicado",
  "Arquivado",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export type Content = {
  id: number;
  title: string;
  script: string | null;
  networks: ContentNetwork[];
  format: ContentFormat | null;
  purpose: string | null;
  status: ContentStatus;
  due_date: string | null;
  publish_date: string | null;
  published_at: string | null;
  post_url: string | null;
  metric_views: number | null;
  metric_likes: number | null;
  metric_comments: number | null;
  metric_shares: number | null;
  metric_saves: number | null;
  notes: string | null;
  engagement_notes: string | null;
  task_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ContentCreateInput = Omit<Content, "id" | "created_at" | "updated_at" | "engagement_notes"> & { engagement_notes?: string | null };
export type ContentUpdateInput = Partial<ContentCreateInput> & { id: number };

/** Retrato de métricas num dado momento (captura). */
export type ContentSnapshot = {
  id: number;
  content_id: number;
  captured_at: string;
  metric_views: number | null;
  metric_likes: number | null;
  metric_comments: number | null;
  metric_shares: number | null;
  metric_saves: number | null;
  created_at: string;
};

export type ContentSnapshotInput = Omit<ContentSnapshot, "id" | "created_at">;

/** Cena de um roteiro de conteúdo. */
export type ContentScene = {
  id: number;
  content_id: number;
  position: number;
  title: string | null;
  description: string | null;
  equipment: string[];
  materials: string[];
  scenery: string | null;
  created_at: string;
};

export type ContentSceneInput = {
  title: string | null;
  description: string | null;
  equipment: string[];
  materials: string[];
  scenery: string | null;
};

export function contentStatusVariant(s: ContentStatus):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info" {
  switch (s) {
    case "Ideia":
      return "outline";
    case "Roteiro":
      return "secondary";
    case "Gravando":
    case "Edição":
      return "warning";
    case "Pronto":
      return "info";
    case "Publicado":
      return "success";
    case "Arquivado":
      return "secondary";
  }
}
