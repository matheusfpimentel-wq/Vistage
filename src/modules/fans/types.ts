export const FAN_LEVELS = ["Embaixador", "Superfã", "Fã", "Quase fã", "Possível fã"] as const;
export type FanLevel = (typeof FAN_LEVELS)[number];

export const FAN_INTERACTION_TYPES = ["Interação", "Presença", "Feedback", "Compra", "Indicação"] as const;
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
  /** Quem indicou este fã (outro fã). Alimenta o sinal de Indicação: o indicador
   * ganha crédito na pontuação (ver computeFanScoreAndLevel). */
  indicated_by_fan_id: number | null;
  /** Origem/aquisição do fã (texto livre) — filtro e dimensão de segmento. */
  origem: string | null;
  /** Data/hora da última troca de nível (gravada pelo recálculo quando o nível muda). */
  nivel_changed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FanSegment = {
  id: number;
  nome: string;
  /** Critérios = o objeto FanFilters serializado em JSON. */
  criterios: string;
  created_at: string;
};

export type FanCreateInput = Omit<
  Fan,
  "id" | "created_at" | "updated_at" | "last_interaction_at" | "origem" | "nivel_changed_at"
> & {
  last_interaction_at?: string | null;
  origem?: string | null;
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
  /** Peso de uma compra (ingresso/merch): dinheiro = comprometimento, sinal forte. */
  weightCompra?: number;
  /** Peso de uma indicação (trouxe alguém): comportamento de embaixador. */
  weightIndicacao?: number;
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
// Listas (ex.: lista da casa pra mandar antes da GIG)
// ============================================================

export type FanList = {
  id: number;
  name: string;
  gig_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FanListMember = {
  id: number;
  list_id: number;
  fan_id: number | null;
  name: string | null;
  created_at: string;
};

export type FanListCreateInput = Omit<FanList, "id" | "created_at" | "updated_at">;

// ============================================================
// Convite / RSVP (fan_invites) — funil pré-show. "Compareceu" NÃO é um status
// aqui: é derivado cruzando com gig_fans, a fonte única de presença real.
// ============================================================

export const FAN_INVITE_STATUSES = ["convidado", "confirmado", "recusado"] as const;
export type FanInviteStatus = (typeof FAN_INVITE_STATUSES)[number];

/** Um convite (fã × show) com o nome do fã e a presença real já cruzados. */
export type FanInviteRow = {
  invite_id: number;
  fan_id: number;
  fan_name: string;
  status: FanInviteStatus;
  attended: boolean;
};

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

// ============================================================
// Configuração do clube de fãs (ações rápidas + catálogo de perks)
// ============================================================

/** Ação rápida configurável: vira tarefa do fã. `{nome}` é trocado pelo nome. */
export type FanClubAction = { id: string; label: string; titleTemplate: string };
/** Perk pré-definido do catálogo (atalho na aba Perks do fã). */
export type FanClubPerkTemplate = { id: string; category: FanPerkCategory; name: string };
export type FanClubConfig = {
  actions: FanClubAction[];
  perks: FanClubPerkTemplate[];
};

// ============================================================
// Ações programadas (regras gatilho → ação automáticas)
// ============================================================
// Regras que o usuário compõe ("se X então Y") e que rodam sozinhas sobre os
// fãs. Persistidas em document_settings (chave "fan_auto_rules"), igual à config
// do clube — viajam no .vistage e marcam o documento como não salvo. SEM tabela
// nova. A idempotência (cada regra dispara no máximo uma vez por fã) é garantida
// no executor por um marcador `[auto:<ruleId>]` gravado no que cada ação cria.

/**
 * Gatilho de uma ação programada. Cada variante é avaliada contra um fã:
 *  - level_reached: o fã ATINGIU esse nível (ou um superior na ordem de FAN_LEVELS).
 *  - fan_for_days: está há >= `days` no nível (nivel_changed_at) ou, sem `level`,
 *    há >= `days` desde o cadastro (created_at).
 *  - inactive_days: sem interação há >= `days` (last_interaction_at), opcionalmente
 *    só para um nível específico.
 */
export type FanRuleTrigger =
  | { type: "level_reached"; level: FanLevel }
  | { type: "fan_for_days"; level?: FanLevel; days: number }
  | { type: "inactive_days"; level?: FanLevel; days: number };

/**
 * Ação executada quando o gatilho casa:
 *  - grant_perk: concede um perk do catálogo (categoria + nome).
 *  - log_interaction: registra uma interação (tipo + nota opcional).
 *  - create_task: cria uma tarefa vinculada ao fã.
 *  - suggest_action: sugere uma ação rápida do clube (pelo id da ação
 *    configurada) — vira uma tarefa COM data e aparece em "Próximas ações".
 */
export type FanRuleAction =
  | { type: "grant_perk"; perkCategory: FanPerkCategory; perkName: string }
  | { type: "log_interaction"; interactionType: FanInteractionType; note?: string }
  | { type: "create_task"; taskTitle: string }
  | { type: "suggest_action"; actionId: string };

export type FanAutoRule = {
  id: string;
  enabled: boolean;
  name?: string;
  trigger: FanRuleTrigger;
  action: FanRuleAction;
};
