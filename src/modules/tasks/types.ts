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
  created_at: string;
  updated_at: string;
};

export type TaskCreateInput = Omit<Task, "id" | "created_at" | "updated_at" | "recurrence"> & {
  recurrence?: TaskRecurrence | null;
};
export type TaskUpdateInput = Partial<TaskCreateInput> & { id: number };

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
