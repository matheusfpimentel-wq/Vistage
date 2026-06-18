export const FAN_LEVELS = ["Embaixador", "Superfã", "Fã", "Quase fã", "Possível fã"] as const;
export type FanLevel = (typeof FAN_LEVELS)[number];

export const FAN_INTERACTION_TYPES = ["Interação", "Presença", "Feedback"] as const;
export type FanInteractionType = (typeof FAN_INTERACTION_TYPES)[number];

export type Fan = {
  id: number;
  name: string;
  level: FanLevel;
  /** Embaixador é destaque manual (1) — imune ao recálculo de pontuação. */
  is_ambassador: number;
  instagram: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  tags: string[];
  notes: string | null;
  last_interaction_at: string | null;
  photo_path: string | null;
  contact_id: number | null;
  created_at: string;
  updated_at: string;
};

export type FanCreateInput = Omit<
  Fan,
  "id" | "created_at" | "updated_at" | "last_interaction_at"
> & {
  last_interaction_at?: string | null;
};

export type FanUpdateInput = Partial<FanCreateInput> & { id: number };

export type FanInteraction = {
  id: number;
  fan_id: number;
  date: string;
  type: FanInteractionType;
  note: string;
  special: number;
  created_at: string;
};

export type FanLevelCriteria = {
  minInteractions?: number | null;
  minPresences?: number | null;
  minFeedbacks?: number | null;
  minDaysSinceCreation?: number | null;
  maxDaysSinceLastInteraction?: number | null;
};

/**
 * Limiares de pontuação (engagement score) por nível. O nível do fã é a maior
 * faixa cujo limiar o score alcança.
 */
export type FanScoreThresholds = {
  quaseFa?: number;
  fa?: number;
  superfa?: number;
  embaixador?: number;
};

/**
 * Config do motor de pontuação com decaimento. Cada sinal vale pontos que
 * decaem com o tempo (meia-vida); o nível é derivado do score total. Campos
 * ausentes caem nos defaults de SCORING_DEFAULTS (fans/api.ts).
 */
export type FanScoringConfig = {
  weightPresenca?: number;
  weightFeedback?: number;
  weightInteracao?: number;
  /** Peso de uma presença real em show (audiência marcada na GIG via gig_fans). */
  weightGig?: number;
  /** Meia-vida do decaimento, em dias: um sinal com essa idade vale metade. */
  halfLifeDays?: number;
  thresholds?: FanScoreThresholds;
};

export type FanUpgradeRules = {
  /** @deprecated motor antigo de critérios — mantido só para não quebrar regras salvas. */
  toFa?: FanLevelCriteria;
  /** @deprecated motor antigo de critérios. */
  toSuperfa?: FanLevelCriteria;
  /** @deprecated motor antigo de rebaixamento. */
  downgradeInactiveDays?: number | null;
  /** Motor atual: pontuação com decaimento. */
  scoring?: FanScoringConfig;
};

export function levelVariant(level: FanLevel):
  | "default"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "outline" {
  switch (level) {
    case "Embaixador":
      return "warning";
    case "Superfã":
      return "success";
    case "Fã":
      return "info";
    case "Quase fã":
      return "secondary";
    case "Possível fã":
      return "outline";
  }
}

export type FanGroup = {
  id: number;
  name: string;
  whatsapp_group: string | null;
  origin: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FanGroupMember = {
  id: number;
  group_id: number;
  fan_id: number | null;
  name: string | null;
  notes: string | null;
  created_at: string;
};

export type FanGroupCreateInput = Omit<FanGroup, "id" | "created_at" | "updated_at">;
export type FanGroupUpdateInput = Partial<FanGroupCreateInput> & { id: number };

// ============================================================
// Perks / VIP / brindes — clube de fãs
// ============================================================

export const FAN_PERK_CATEGORIES = [
  "Brinde",
  "VIP",
  "Acesso",
  "Cortesia",
  "Desconto",
  "Outro",
] as const;
export type FanPerkCategory = (typeof FAN_PERK_CATEGORIES)[number];

export const FAN_PERK_STATUSES = ["Planejado", "Entregue"] as const;
export type FanPerkStatus = (typeof FAN_PERK_STATUSES)[number];

export type FanPerk = {
  id: number;
  fan_id: number;
  category: FanPerkCategory;
  name: string;
  status: FanPerkStatus;
  /** Data planejada / de entrega (ISO YYYY-MM-DD). */
  date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FanPerkCreateInput = Omit<FanPerk, "id" | "created_at" | "updated_at">;
export type FanPerkUpdateInput = Partial<FanPerkCreateInput> & { id: number };
