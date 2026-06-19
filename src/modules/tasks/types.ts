export const TASK_CATEGORIES = [
  "GIG",
  "Produção Musical",
  "Conteúdo",
  "Festas",
  "Administrativo",
  "Pessoal",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_PRIORITIES = ["Baixa", "Média", "Alta", "Urgente"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "A fazer",
  "Em andamento",
  "Concluída",
  "Cancelada",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_RECURRENCES = ["weekly", "monthly"] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];

export const TASK_RECURRENCE_LABEL: Record<TaskRecurrence, string> = {
  weekly: "Semanal (+7 dias)",
  monthly: "Mensal (+30 dias)",
};

/** Quadrantes da matriz de Eisenhower (urgência × importância). */
const EISENHOWER_QUADRANTS = ["do", "schedule", "delegate", "eliminate"] as const;
export type EisenhowerQuadrant = (typeof EISENHOWER_QUADRANTS)[number];

/**
 * Tarefas LEGADAS de outra origem (criadas automaticamente a partir de uma
 * track/GIG/etc.). Nelas o título e as tags são geridos pela origem (travados na
 * UI); excluir é "não quero a tarefa"; e o status é espelho de duas vias.
 */
export const TASK_DERIVED_TYPES = [
  "gig_prep",
  "gig_debrief",
  "gig_payment",
  "track",
  "content",
  "class",
  "party",
  "meeting",
] as const;
export type TaskDerivedType = (typeof TASK_DERIVED_TYPES)[number];

export const TASK_DERIVED_LABELS: Record<string, string> = {
  gig_prep: "Preparação de GIG",
  gig_debrief: "Debrief de GIG",
  gig_payment: "Cobrança de GIG",
  track: "Música",
  content: "Conteúdo",
  class: "Aula",
  party: "Festa",
  meeting: "Reunião",
};

export type Task = {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory | null;
  gig_id: number | null;
  contact_id: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  tags: string[];
  recurrence: TaskRecurrence | null;
  eisenhower_quadrant: EisenhowerQuadrant | null;
  energy_required: number | null;
  /** Origem da tarefa, quando legada (ver TASK_DERIVED_TYPES). */
  derived_type: string | null;
  derived_id: number | null;
  created_at: string;
  updated_at: string;
};

export type TaskCreateInput = Omit<
  Task,
  | "id"
  | "created_at"
  | "updated_at"
  | "recurrence"
  | "eisenhower_quadrant"
  | "energy_required"
  | "derived_type"
  | "derived_id"
> & {
  recurrence?: TaskRecurrence | null;
  eisenhower_quadrant?: EisenhowerQuadrant | null;
  energy_required?: number | null;
  derived_type?: string | null;
  derived_id?: number | null;
};
export type TaskUpdateInput = Partial<TaskCreateInput> & { id: number };

// ============================================================
// Task links — vínculos polimórficos
// ============================================================

export const TASK_LINK_TYPES = [
  "fan",
  "student",
  "supplier",
  "venue",
  "track",
  "party",
  "content",
  "meeting",
] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export const TASK_LINK_LABELS: Record<TaskLinkType, string> = {
  fan: "Fã",
  student: "Aluno",
  supplier: "Fornecedor",
  venue: "Venue",
  track: "Track Musical",
  party: "Festa",
  content: "Conteúdo",
  meeting: "Reunião",
};

export type TaskLink = {
  id: number;
  task_id: number;
  entity_type: TaskLinkType;
  entity_id: number;
  /** Label cacheado no momento da criação do vínculo. */
  label: string | null;
  created_at: string;
};

export type Subtask = {
  id: number;
  task_id: number;
  title: string;
  done: number;
  position: number;
};

export function priorityVariant(p: TaskPriority):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "warning"
  | "info" {
  switch (p) {
    case "Baixa":
      return "outline";
    case "Média":
      return "secondary";
    case "Alta":
      return "warning";
    case "Urgente":
      return "destructive";
  }
}

export function statusVariant(s: TaskStatus):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info" {
  switch (s) {
    case "A fazer":
      return "secondary";
    case "Em andamento":
      return "info";
    case "Concluída":
      return "success";
    case "Cancelada":
      return "destructive";
  }
}
