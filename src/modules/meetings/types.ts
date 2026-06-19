export const MEETING_STATUSES = ["Agendada", "Realizada", "Cancelada"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export type Meeting = {
  id: number;
  title: string;
  date: string | null;          // YYYY-MM-DD
  time: string | null;          // HH:MM
  location: string | null;      // local físico ou link
  participants: string[];       // nomes dos participantes
  contact_ids: number[];        // pessoas (contacts) vinculadas
  agenda: string | null;        // pauta
  notes: string | null;         // ata / anotações
  outcomes: string | null;      // decisões / encaminhamentos
  status: MeetingStatus;
  task_id: number | null;       // tarefa-lembrete criada ao agendar
  created_at: string;
  updated_at: string;
};

export type MeetingCreateInput = Omit<
  Meeting,
  "id" | "created_at" | "updated_at" | "task_id"
>;
export type MeetingUpdateInput = Partial<MeetingCreateInput> & { id: number };

export function meetingStatusVariant(s: MeetingStatus):
  | "secondary"
  | "success"
  | "destructive" {
  switch (s) {
    case "Agendada":
      return "secondary";
    case "Realizada":
      return "success";
    case "Cancelada":
      return "destructive";
  }
}
