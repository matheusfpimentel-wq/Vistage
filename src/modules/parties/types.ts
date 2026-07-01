// Status único de alto nível da festa, auto-sugerido por marcos do workflow
// (venue → Confirmada; 1ª venda → Em vendas; passou a data → Realizada), com
// override manual. "Ideia" e "Em vendas" entraram na de-duplicação (slice 3b):
// a coluna `status` é TEXT livre, então os valores novos não exigem migração.
export const PARTY_STATUSES = ["Ideia","Planejando","Confirmada","Em vendas","Realizada","Cancelada"] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export type StageStatus = "pendente" | "em_andamento" | "concluida";

export type PartyStage = {
  id: number; party_id: number; name: string; position: number;
  status: StageStatus; notes: string | null;
  fields: Record<string, string | number | null>;
  completed_at: string | null; created_at: string;
};

export const DEFAULT_STAGE_NAMES = ["Ideação","Viabilidade","Marketing","Execução","Concretização"] as const;

export const STAGE_FIELD_DEFS: Record<string, { key: string; label: string; type: "text"|"number"|"date"|"costs"|"checklist"|"rider" }[]> = {
  "Ideação": [
    { key:"conceito", label:"Conceito da festa", type:"text" },
    { key:"tema", label:"Tema", type:"text" },
    { key:"publico_alvo", label:"Público-alvo", type:"text" },
    { key:"referencias", label:"Referências e inspirações", type:"text" },
    { key:"motivacao", label:"Motivação / por que fazer", type:"text" },
  ],
  // De-dup (slice 3b): "Data pretendida" e "Público estimado" saíram daqui — a
  // data canônica é a da Info (parties.date) e o público estimado é
  // expected_capacity. O break-even lê a capacidade da Info, não mais um campo
  // paralelo. Valores antigos em party_stages.fields ficam (não-destrutivo).
  "Viabilidade": [
    { key:"custos_necessarios", label:"Custos necessários", type:"costs" },
    { key:"viabilidade_notas", label:"Observações de viabilidade", type:"text" },
  ],
  "Marketing": [
    { key:"canais", label:"Canais de divulgação", type:"text" },
    { key:"meta_alcance", label:"Meta de alcance", type:"number" },
    { key:"orcamento_mkt", label:"Orçamento de marketing (R$)", type:"number" },
    { key:"estrategia", label:"Estratégia", type:"text" },
    { key:"arte_status", label:"Status das artes", type:"text" },
  ],
  "Execução": [
    { key:"equipe", label:"Equipe confirmada", type:"text" },
    { key:"rider_tecnico", label:"Rider técnico", type:"rider" },
    { key:"checklist_operacional", label:"Checklist operacional", type:"checklist" },
    { key:"fornecedores_fechados", label:"Fornecedores fechados", type:"text" },
  ],
  // De-dup (slice 3b): "Público real" e "Receita total" saíram daqui — são
  // COMPUTADOS (público real = ingressos vendidos; receita = ingressos +
  // patrocínio do Orçamento), exibidos no cockpit/briefing, não redigitados.
  // Debrief Plus/Delta: o que reforçar (Plus) x o que ajustar (Delta) — a
  // retrospectiva enxuta que vira ação na próxima edição.
  "Concretização": [
    { key:"plus", label:"O que manteria (Plus)", type:"text" },
    { key:"delta", label:"O que mudaria (Delta)", type:"text" },
    { key:"aprendizados", label:"Aprendizados", type:"text" },
    { key:"proximos_passos", label:"Próximos passos", type:"text" },
  ],
};

/** Categorias para os custos necessários da etapa de Viabilidade. */
export const VIABILITY_COST_CATEGORIES = [
  "Pessoal", "Estrutura", "Marketing", "Operacional", "Outros",
] as const;

/** Linha de custo estimado na Viabilidade (serializado em JSON no campo da etapa). */
export type ViabilityCost = { category: string; description: string; amount: number };

/** Item do checklist operacional (serializado em JSON no campo da etapa). */
export type ChecklistItem = { text: string; done: boolean };

/** Rider técnico estruturado — categorias de equipamento de uma festa. */
export const RIDER_CATEGORIES = ["Áudio (PA)", "DJ / Palco", "Monitores", "Luz", "Backline", "Energia", "Cabeamento", "Outros"] as const;
/** Quem fornece cada item do rider. */
export const RIDER_PROVIDERS = ["Casa", "Nós", "Locação"] as const;
/** Linha do rider técnico (serializado em JSON no campo da etapa). */
export type RiderItem = { category: string; item: string; quantity: number; by: string; done: boolean };

/** Modelo de rider reutilizável entre festas (biblioteca de riders). */
export type RiderTemplate = { id: number; name: string; items: string; created_at: string };

export const BUDGET_CATEGORIES: Record<string, string[]> = {
  Pessoal: ["DJs","Seguranças","Promoters","Staff","Fotógrafo/Vídeo","MC/Apresentador","Outros"],
  Marketing: ["Tráfego pago","Flyers","Designer","Influencers","Assessoria de imprensa","Outros"],
  Infraestrutura: ["Som/Luz","Venue","Decoração","Estrutura","Geradores","Tendas","Outros"],
  Operacional: ["Transporte","Alimentação staff","Seguro","Aluguel equipamentos","Taxas/Impostos","Outros"],
  Outros: ["Geral"],
};

export type BudgetItemStatus = "projetado"|"confirmado"|"pago";

export type PartyBudgetItem = {
  id: number; party_id: number; category: string; subcategory: string|null;
  description: string|null; projected_amount: number; actual_amount: number|null;
  supplier_note: string|null; supplier_id: number|null; status: BudgetItemStatus; date_paid: string|null;
  /** Premissa/assunção da linha (por que deste valor). */
  premissa: string|null;
  /** Causa-raiz do desvio projetado×real (preenchida no fechamento). */
  nota_variancia: string|null;
  created_at: string; updated_at: string;
};

export const TICKET_TYPES = ["antecipado","portaria","vip","cortesia"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export type PartyTicket = {
  id: number; party_id: number; name: string; ticket_type: TicketType;
  price: number; quantity_total: number|null; quantity_sold: number;
  sale_start_date: string|null; sale_end_date: string|null; position: number; created_at: string;
};

/** Ponto datado da curva de venda de ingressos — quantos vendidos ATÉ essa data. */
export type PartyTicketSale = {
  id: number; party_id: number; sale_date: string;
  cumulative_sold: number; note: string | null; created_at: string;
};

/** Linha do run-of-show (cronograma do Dia D) — aba Operação. */
export type PartyRunsheetItem = {
  id: number; party_id: number; position: number;
  time: string | null; end_time: string | null;
  title: string; performer_contact_id: number | null; notes: string | null;
  /** Duração em minutos — base do cronograma reverso (recalcula horários a partir de uma âncora). */
  duration_min: number | null;
  created_at: string;
};

/** Compliance / licenças da festa — tira as obrigações legais do "na cabeça". */
export const COMPLIANCE_CATEGORIES = ["ECAD", "Alvará", "Bombeiros", "SMMA", "Segurança", "Sanitária", "Outro"] as const;
export const COMPLIANCE_STATUSES = ["pendente", "em_andamento", "ok", "na"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export type PartyComplianceItem = {
  id: number; party_id: number; category: string; title: string;
  status: ComplianceStatus; protocol: string | null; due_date: string | null;
  notes: string | null; position: number; created_at: string;
};

/** Itens padrão de compliance de uma festa de nightlife (semente do checklist). */
export const DEFAULT_COMPLIANCE_ITEMS: { category: string; title: string }[] = [
  { category: "ECAD", title: "Recolhimento ECAD (direitos autorais musicais)" },
  { category: "Alvará", title: "Alvará de funcionamento / autorização do evento" },
  { category: "Bombeiros", title: "Vistoria / AVCB do Corpo de Bombeiros" },
  { category: "SMMA", title: "Licença ambiental / controle de ruído (SMMA)" },
  { category: "Segurança", title: "Plano de segurança e seguranças credenciados" },
  { category: "Sanitária", title: "Vigilância sanitária (bar / alimentos)" },
];

export function complianceStatusLabel(s: ComplianceStatus): string {
  return s === "ok" ? "OK" : s === "em_andamento" ? "Em andamento" : s === "na" ? "N/A" : "Pendente";
}

// ===== MARKETING (Artes + Canais) =====

/** Peça de marketing (flyer, reel, stories, aftermovie…) com pipeline de status. */
export const MARKETING_ASSET_STATUSES = ["briefada", "em_producao", "aprovada", "publicada"] as const;
export type MarketingAssetStatus = (typeof MARKETING_ASSET_STATUSES)[number];
export type PartyMarketingAsset = {
  id: number; party_id: number; name: string; format: string | null;
  due_date: string | null; status: MarketingAssetStatus; link: string | null;
  notes: string | null; content_id: number | null; position: number; created_at: string;
};
/** Peças padrão sugeridas ao montar o kit de divulgação. */
export const DEFAULT_MARKETING_ASSETS = ["Flyer principal", "Reel teaser", "Stories de lote", "Aftermovie"] as const;
export function marketingAssetStatusLabel(s: MarketingAssetStatus): string {
  return s === "briefada" ? "Briefada" : s === "em_producao" ? "Em produção" : s === "aprovada" ? "Aprovada" : "Publicada";
}

/** Ação de marketing datada, por canal — o calendário de campanha. */
export const MARKETING_CHANNELS = ["Instagram festa", "Perfis dos DJs", "WhatsApp/base", "Promoters", "Pago", "Parcerias/comunidade", "Outro"] as const;
export const MARKETING_ROLES = ["aquisicao", "retencao", "prova_social"] as const;
export type MarketingRole = (typeof MARKETING_ROLES)[number];
export type PartyMarketingAction = {
  id: number; party_id: number; canal: string; papel: MarketingRole;
  acao: string | null; date: string | null; done: number; tracking_code: string | null;
  position: number; created_at: string;
};
/** Marcos de calendário sugeridos (chips de 1 toque). */
export const MARKETING_MILESTONES = ["Anúncio", "Reveal do line-up", "Virada de lote", "Última semana", "Dia do evento"] as const;
export function marketingRoleLabel(r: MarketingRole): string {
  return r === "aquisicao" ? "Aquisição" : r === "retencao" ? "Retenção" : "Prova social";
}

/** Motivos comuns de cortesia (guest list). */
export const GUEST_REASONS = ["Influencer", "Imprensa", "VIP", "Permuta", "Equipe", "Outro"] as const;
export const GUEST_STATUSES = ["Confirmado", "Pendente", "Compareceu", "Faltou"] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

/** Cortesia / guest list — tem DOIS custos: receita renunciada (qtd × preço de
 * ref., informativo, não sai do caixa) E custo variável real (qtd × unit_cost:
 * welcome drink, pulseira, kit). Só o custo variável entra no líquido do P&L. */
export type PartyGuest = {
  id: number; party_id: number; name: string; reason: string | null;
  quantity: number; ref_price: number;
  /** Custo variável real por cabeça (drink/pulseira/kit) — entra no líquido. */
  unit_cost: number;
  status: GuestStatus; created_at: string;
};

type PartyTaskStatus = "pendente"|"em_andamento"|"concluida";

export type PartyTask = {
  id: number; party_id: number; stage_id: number|null; title: string;
  status: PartyTaskStatus; priority: string; due_date: string|null; notes: string|null;
  global_task_id?: number | null;
  /** Dono da tarefa (FK contacts) — a etapa vira cronograma com responsável. */
  responsavel_contact_id?: number | null;
  created_at: string; updated_at: string;
};

export type PartyTeamMember = {
  name: string;
  role: string;
  amount_cents: number;
  supplier_id: number | null;
};

/** Série = a marca durável (Caramelo); cada festa é uma edição dela. */
export type PartySeries = {
  id: number;
  name: string;
  slug: string | null;
  conceito: string | null;
  posicionamento: string | null;
  publico_alvo: string | null;
  identidade_visual: string | null;
  tom_mensagem: string | null;
  created_at: string;
  archived_at: string | null;
};
export type PartySeriesCreateInput = Omit<PartySeries, "id" | "created_at" | "archived_at"> & {
  archived_at?: string | null;
};
export type PartySeriesUpdateInput = Partial<PartySeriesCreateInput> & { id: number };

export type Party = {
  id: number; title: string; date: string|null; venue_id: number|null;
  venue_name: string|null; status: PartyStatus; status_override: number; description: string|null;
  expected_capacity: number|null; actual_attendance: number|null;
  ticket_price_regular: number|null; ticket_price_vip: number|null;
  /** Receita de bar atribuída à festa (parte do produtor) — entra na receita do P&L. */
  bar_revenue: number|null;
  /** CAC-alvo: custo de aquisição por comprador que você aceita pagar (meta). */
  target_cac: number|null;
  lineup: string|null; sponsors: string|null; team: string|null; tasks_generated: number;
  notes: string|null; stage_current: number|null; financial_synced: number;
  gig_id: number|null;
  series_id: number|null; edition_label: string|null; edition_number: number|null;
  gcal_event_id?: string|null;
  created_at: string; updated_at: string;
};

export type PartyDeserialized = Omit<Party,"lineup"|"sponsors"|"team"> & {
  lineup: number[]; sponsors: { name: string; amount_cents: number }[];
  team: PartyTeamMember[];
};

export type PartyCreateInput = Omit<Party,"id"|"created_at"|"updated_at"|"tasks_generated"|"financial_synced"|"stage_current"|"status_override"|"ticket_price_regular"|"ticket_price_vip"|"bar_revenue"|"target_cac"|"lineup"|"sponsors"|"team"|"series_id"|"edition_label"|"edition_number"> & {
  stage_current?: number|null;
  status_override?: number;
  ticket_price_regular?: number|null;
  ticket_price_vip?: number|null;
  bar_revenue?: number|null;
  target_cac?: number|null;
  lineup?: number[]|string|null;
  sponsors?: { name: string; amount_cents: number }[]|string|null;
  team?: PartyTeamMember[]|string|null;
  series_id?: number|null;
  edition_label?: string|null;
  edition_number?: number|null;
};
export type PartyUpdateInput = Partial<PartyCreateInput> & { id: number };

export type PartyVenueCandidate = {
  id: number;
  party_id: number;
  venue_id: number;
  notes: string | null;
  created_at: string;
  venue_name?: string | null;
};

export function partyStatusColor(s: PartyStatus): string {
  return s==="Confirmada" ? "bg-emerald-500/20 text-emerald-400"
    : s==="Em vendas" ? "bg-sky-500/20 text-sky-400"
    : s==="Realizada" ? "bg-primary/20 text-primary"
    : s==="Cancelada" ? "bg-red-500/20 text-red-400"
    : s==="Ideia" ? "bg-muted text-muted-foreground"
    : "bg-amber-500/20 text-amber-400"; // Planejando
}

export function ticketTypeLabel(t: TicketType): string {
  return t==="antecipado" ? "Antecipado" : t==="portaria" ? "Portaria" : t==="vip" ? "VIP" : "Cortesia";
}

export function budgetSummary(items: PartyBudgetItem[]) {
  return {
    projected: items.reduce((s,i) => s+i.projected_amount, 0),
    actual: items.reduce((s,i) => s+(i.actual_amount??0), 0),
  };
}

export function estimatedRevenue(p: PartyDeserialized): number {
  if (!p.expected_capacity) return 0;
  const regular = (p.ticket_price_regular ?? 0) * (p.expected_capacity * 0.8);
  const vip = (p.ticket_price_vip ?? 0) * (p.expected_capacity * 0.2);
  return regular + vip;
}
