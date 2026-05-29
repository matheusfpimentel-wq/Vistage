export const FAN_LEVELS = ["Superfã", "Fã", "Possível fã"] as const;
export type FanLevel = (typeof FAN_LEVELS)[number];

export type Fan = {
  id: number;
  name: string;
  level: FanLevel;
  instagram: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  tags: string[];
  notes: string | null;
  last_interaction_at: string | null;
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
  note: string;
  created_at: string;
};

export function levelVariant(level: FanLevel):
  | "default"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "outline" {
  switch (level) {
    case "Superfã":
      return "success";
    case "Fã":
      return "info";
    case "Possível fã":
      return "outline";
  }
}
