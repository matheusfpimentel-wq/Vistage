export const PARTY_STATUSES = ["Planejando","Confirmada","Realizada","Cancelada"] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export type StageStatus = "pendente" | "em_andamento" | "concluida";

export type PartyStage = {
  id: number; party_id: number; name: string; position: number;
  status: StageStatus; notes: string | null;
  fields: Record<string, string | number | null>;
  completed_at: string | null; created_at: string;
};

export const DEFAULT_STAGE_NAMES = ["Ideação","Viabilidade","Marketing","Execução","Concretização"] as const;

export const STAGE_FIELD_DEFS: Record<string, { key: string; label: string; type: "text"|"number"|"date"|"costs"|"checklist" }[]> = {
  "Ideação": [
    { key:"conceito", label:"Conceito da festa", type:"text" },
    { key:"tema", label:"Tema", type:"text" },
    { key:"publico_alvo", label:"Público-alvo", type:"text" },
    { key:"referencias", label:"Referências e inspirações", type:"text" },
    { key:"motivacao", label:"Motivação / por que fazer", type:"text" },
  ],
  "Viabilidade": [
    { key:"data_pretendida", label:"Data pretendida", type:"date" },
    { key:"capacidade", label:"Público estimado", type:"number" },
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
    { key:"rider_tecnico", label:"Rider técnico", type:"text" },
    { key:"checklist_operacional", label:"Checklist operacional", type:"checklist" },
    { key:"fornecedores_fechados", label:"Fornecedores fechados", type:"text" },
  ],
  "Concretização": [
    { key:"publico_real", label:"Público real", type:"number" },
    { key:"receita_total", label:"Receita total (R$)", type:"number" },
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
  created_at: string; updated_at: string;
};

export const TICKET_TYPES = ["antecipado","portaria","vip","cortesia"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export type PartyTicket = {
  id: number; party_id: number; name: string; ticket_type: TicketType;
  price: number; quantity_total: number|null; quantity_sold: number;
  sale_start_date: string|null; sale_end_date: string|null; position: number; created_at: string;
};

/** Linha do run-of-show (cronograma do Dia D) — aba Operação. */
export type PartyRunsheetItem = {
  id: number; party_id: number; position: number;
  time: string | null; end_time: string | null;
  title: string; performer_contact_id: number | null; notes: string | null;
  created_at: string;
};

/** Motivos comuns de cortesia (guest list). */
export const GUEST_REASONS = ["Influencer", "Imprensa", "VIP", "Permuta", "Equipe", "Outro"] as const;
export const GUEST_STATUSES = ["Confirmado", "Pendente", "Compareceu", "Faltou"] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

/** Cortesia / guest list — o custo é RECEITA RENUNCIADA (qtd × preço de ref.), não despesa. */
export type PartyGuest = {
  id: number; party_id: number; name: string; reason: string | null;
  quantity: number; ref_price: number; status: GuestStatus; created_at: string;
};

type PartyTaskStatus = "pendente"|"em_andamento"|"concluida";

export type PartyTask = {
  id: number; party_id: number; stage_id: number|null; title: string;
  status: PartyTaskStatus; priority: string; due_date: string|null; notes: string|null;
  global_task_id?: number | null;
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
  venue_name: string|null; status: PartyStatus; description: string|null;
  expected_capacity: number|null; actual_attendance: number|null;
  ticket_price_regular: number|null; ticket_price_vip: number|null;
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

export type PartyCreateInput = Omit<Party,"id"|"created_at"|"updated_at"|"tasks_generated"|"financial_synced"|"stage_current"|"ticket_price_regular"|"ticket_price_vip"|"lineup"|"sponsors"|"team"|"series_id"|"edition_label"|"edition_number"> & {
  stage_current?: number|null;
  ticket_price_regular?: number|null;
  ticket_price_vip?: number|null;
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
    : s==="Realizada" ? "bg-primary/20 text-primary"
    : s==="Cancelada" ? "bg-red-500/20 text-red-400"
    : "bg-amber-500/20 text-amber-400";
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
