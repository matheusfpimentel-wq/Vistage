export const GIG_STATUSES = [
  "Proposta",
  "Confirmada",
  "Concluída",
  "Cancelada",
] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "Pendente",
  "Pago parcialmente",
  "Pago integralmente",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Linha completa da tabela `gigs` no banco. */
export type Gig = {
  id: number;

  // pré-evento
  date: string;
  /** 1º intervalo (espelha time_slots[0]) — mantido para gcal/ordenação/compat. */
  start_time: string | null;
  end_time: string | null;
  /** JSON array de intervalos de horário [{start,end}] — set alternado. */
  time_slots: string | null;
  event_name: string | null;       // nome da festa/evento (campo principal)
  venue_name: string;              // mantido pra resiliência se o venue for excluído
  venue_city: string | null;
  venue_address: string | null;
  venue_id: number | null;
  /** JSON array com IDs de fãs presentes (preenchido no debrief). */
  fans_present: string | null;
  promoter_contact_id: number | null;
  /** Nome do contratante quando é "eventual" (sem contato cadastrado). */
  promoter_name_manual: string | null;
  /**
   * Nome do contratante, resolvido por LEFT JOIN em `listGigs` (NÃO é coluna da
   * tabela `gigs`). Fica `undefined` em consultas que não fazem o join (ex.:
   * getGig). Excluído de GigCreateInput pra nunca entrar num INSERT/UPDATE.
   */
  promoter_contact_name?: string | null;
  day_contact_name: string | null;
  day_contact_phone: string | null;
  estimated_audience: number | null;
  cache_amount: number | null;
  /** Percentual do cachê já recebido (0-100). null = não definido. */
  cache_paid_pct: number | null;
  script_file_path: string | null;
  banner_file_path: string | null;
  /** Anexo de briefing da GIG (documento). */
  briefing_file_path: string | null;
  extra_flyer_paths: string | null; // JSON array de caminhos (flyers além do primeiro)
  opportunities: string | null;
  briefing: string | null;
  set_concept: string | null;
  concrete_goals: string | null;
  targets: string | null;
  status: GigStatus;

  // logística
  transport: string | null;
  departure_time: string | null;
  equipment_provided: string | null;
  equipment_to_bring: string | null;
  related_expenses: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus | null;
  payment_due_date: string | null;
  invoice_file_path: string | null;
  general_notes: string | null;
  fans_notified: number | null;

  // debrief
  debrief_strengths: string | null;
  debrief_weaknesses: string | null;
  debrief_learnings: string | null;
  debrief_opportunities_used: string | null;
  debrief_future_opportunities: string | null;
  debrief_promoter_feedback: string | null;
  debrief_technical_notes: string | null;
  debrief_media_content: string | null;
  rating_charisma: number | null;
  rating_charisma_note: string | null;
  rating_technique: number | null;
  rating_technique_note: string | null;
  rating_repertoire: number | null;
  rating_repertoire_note: string | null;
  rating_contractor: number | null;
  /** Pista: lotação/retenção/resposta do público (eixo obrigatório do debrief). */
  rating_floor: number | null;
  rating_floor_note: string | null;
  is_special: number;
  debrief_completed_at: string | null;
  debrief_pending: number; // 0 ou 1

  gcal_event_id: string | null;
  /** Quando o app gravou o evento por último (ISO). Edição no Google depois disso = drift. */
  gcal_synced_at?: string | null;
  main_goal: string | null;
  /** JSON string com `{ [itemId: string]: 1 }` para itens marcados. */
  prep_state: string | null;
  /** Observações livres da aba Preparação (separadas do checklist). */
  prep_notes: string | null;
  /** JSON array com IDs de equipamentos a levar. */
  gig_equipment: string;  // JSON array, parsed to number[]
  /** JSON array de músicas pesquisadas para a GIG: [{title, artist, note}] */
  gig_research: string | null;
  /** ID da tarefa auto-criada a partir do objetivo principal. */
  main_goal_task_id: number | null;
  event_category: string | null;
  recurring_event_name: string | null;
  prep_task_id?: number | null;
  created_at: string;
  updated_at: string;
};

/** Payload aceito ao criar uma GIG (subset do `Gig`). */
export type GigCreateInput = Omit<
  Gig,
  | "id"
  | "created_at"
  | "updated_at"
  | "debrief_pending"
  | "debrief_completed_at"
  | "promoter_contact_name"
> & {
  debrief_pending?: number;
  debrief_completed_at?: string | null;
};

export type GigUpdateInput = Partial<GigCreateInput> & { id: number };

/** Um intervalo de horário de uma GIG (HH:MM). */
export type GigTimeSlot = { start: string; end: string };

/** Lê os intervalos de horário, com fallback para o start/end legado. */
export function parseTimeSlots(
  g: Pick<Gig, "time_slots" | "start_time" | "end_time">
): GigTimeSlot[] {
  if (g.time_slots) {
    try {
      const parsed = JSON.parse(g.time_slots) as unknown;
      if (Array.isArray(parsed)) {
        const slots = parsed
          .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
          .map((s) => ({
            start: typeof s.start === "string" ? s.start : "",
            end: typeof s.end === "string" ? s.end : "",
          }))
          .filter((s) => s.start || s.end);
        if (slots.length > 0) return slots;
      }
    } catch {
      /* cai no fallback */
    }
  }
  if (g.start_time || g.end_time) {
    return [{ start: g.start_time ?? "", end: g.end_time ?? "" }];
  }
  return [];
}

/** Formata os intervalos para exibição: "22:00–23:00 · 00:00–01:00". */
export function formatTimeSlots(slots: GigTimeSlot[]): string {
  return slots
    .filter((s) => s.start || s.end)
    .map((s) => (s.start && s.end ? `${s.start}–${s.end}` : s.start || s.end))
    .join(" · ");
}

/**
 * Média das avaliações = média SIMPLES apenas dos eixos preenchidos
 * (carisma/técnica/repertório/pista/contratante). `is_special` NÃO entra na
 * conta — é só um selo de destaque; GIGs antigas sem um eixo degradam sem erro.
 */
export function averageRating(g: Pick<
  Gig,
  "rating_charisma" | "rating_technique" | "rating_repertoire" | "rating_floor" | "rating_contractor"
>): number | null {
  const ratings = [g.rating_charisma, g.rating_technique, g.rating_repertoire, g.rating_floor, g.rating_contractor]
    .filter((r): r is number => typeof r === "number");
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
}

/** Status badge variant para cada estado. */
export function statusVariant(status: GigStatus):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info" {
  switch (status) {
    case "Proposta":
      return "secondary";
    case "Confirmada":
      return "info";
    case "Concluída":
      return "success";
    case "Cancelada":
      return "destructive";
  }
}
