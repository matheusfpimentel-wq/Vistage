export const ACQUISITION_SOURCES = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Indicação",
  "Anúncio",
  "Evento",
  "Outro",
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export type Student = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  city: string | null;
  acquisition: AcquisitionSource | null;
  notes: string | null;
  default_rate: number | null;
  contact_id: number | null;
  created_at: string;
  updated_at: string;
};

export type StudentCreateInput = Omit<Student, "id" | "created_at" | "updated_at">;
export type StudentUpdateInput = Partial<StudentCreateInput> & { id: number };

export type SyllabusItem = {
  title: string;
  hours: number | null;
  detail: string | null;
};

export type ClassPackage = {
  id: number;
  name: string;
  total_classes: number;
  total_hours: number | null;
  price: number | null;
  description: string | null;
  syllabus: string | null;
  syllabus_items: SyllabusItem[];
  active: number;
  created_at: string;
};

export type ClassPackageCreateInput = Omit<ClassPackage, "id" | "created_at">;
export type ClassPackageUpdateInput = Partial<ClassPackageCreateInput> & { id: number };

const STUDENT_PACKAGE_STATUSES = ["Ativo", "Concluído", "Cancelado"] as const;
export type StudentPackageStatus = (typeof STUDENT_PACKAGE_STATUSES)[number];

export type StudentPackage = {
  id: number;
  student_id: number;
  package_id: number | null;
  total_classes: number;
  total_hours: number | null;
  used_classes: number;
  used_minutes: number;
  purchased_at: string;
  status: StudentPackageStatus;
  notes: string | null;
};

export type StudentPackageCreateInput = Omit<StudentPackage, "id">;

export const CLASS_STATUSES = [
  "Agendada",
  "Realizada",
  "Cancelada",
  "Falta",
] as const;
export type ClassStatus = (typeof CLASS_STATUSES)[number];

export type ClassSession = {
  id: number;
  student_id: number;
  student_package_id: number | null;
  date: string;
  start_time: string | null;
  duration_min: number | null;
  title: string | null;
  subject: string | null;
  status: ClassStatus;
  feedback: string | null;
  amount: number | null;
  notes: string | null;
  task_id?: number | null;
  gcal_event_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type ClassSessionCreateInput = Omit<
  ClassSession,
  "id" | "created_at" | "updated_at"
>;
export type ClassSessionUpdateInput = Partial<ClassSessionCreateInput> & {
  id: number;
};

export function classStatusVariant(s: ClassStatus):
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info" {
  switch (s) {
    case "Agendada":
      return "info";
    case "Realizada":
      return "success";
    case "Cancelada":
      return "secondary";
    case "Falta":
      return "destructive";
  }
}
