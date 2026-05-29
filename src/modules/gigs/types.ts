export const GIG_STATUSES = [
  "Proposta",
  "Confirmada",
  "A Caminho",
  "Concluída",
  "Cancelada",
] as const;
export type GigStatus = (typeof GIG_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "Pendente",
  "50% pago",
  "Pago integralmente",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Linha completa da tabela `gigs` no banco. */
export type Gig = {
  id: number;

  // pré-evento
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string;
  venue_city: string | null;
  venue_address: string | null;
  promoter_contact_id: number | null;
  day_contact_name: string | null;
  day_contact_phone: string | null;
  estimated_audience: number | null;
  cache_amount: number | null;
  script_file_path: string | null;
  banner_file_path: string | null;
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
  debrief_completed_at: string | null;
  debrief_pending: number; // 0 ou 1

  gcal_event_id: string | null;
  main_goal: string | null;
  /** JSON string com `{ [itemId: string]: 1 }` para itens marcados. */
  prep_state: string | null;
  /** ID da tarefa auto-criada a partir do objetivo principal. */
  main_goal_task_id: number | null;
  created_at: string;
  updated_at: string;
};

/** Payload aceito ao criar uma GIG (subset do `Gig`). */
export type GigCreateInput = Omit<
  Gig,
  "id" | "created_at" | "updated_at" | "debrief_pending" | "debrief_completed_at"
> & {
  debrief_pending?: number;
  debrief_completed_at?: string | null;
};

export type GigUpdateInput = Partial<GigCreateInput> & { id: number };

/** Cálculo da média das 3 avaliações; retorna null se nenhuma foi preenchida. */
export function averageRating(g: Pick<
  Gig,
  "rating_charisma" | "rating_technique" | "rating_repertoire"
>): number | null {
  const ratings = [g.rating_charisma, g.rating_technique, g.rating_repertoire]
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
    case "A Caminho":
      return "warning";
    case "Concluída":
      return "success";
    case "Cancelada":
      return "destructive";
  }
}
