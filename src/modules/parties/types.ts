export const PARTY_STATUSES = [
  "Planejando",
  "Confirmada",
  "Realizada",
  "Cancelada",
] as const;
export type PartyStatus = (typeof PARTY_STATUSES)[number];

export const PARTY_COST_CATEGORIES = [
  "Produção",
  "Decoração",
  "Som/Luz",
  "Marketing",
  "Venue",
  "Cachê DJ",
  "Outros",
] as const;
export type PartyCostCategory = (typeof PARTY_COST_CATEGORIES)[number];

export type Party = {
  id: number;
  title: string;
  date: string | null;
  venue_id: number | null;
  venue_name: string | null;
  status: PartyStatus;
  description: string | null;
  expected_capacity: number | null;
  actual_attendance: number | null;
  ticket_price_regular: number | null;
  ticket_price_vip: number | null;
  lineup: string | null;
  sponsors: string | null;
  tasks_generated: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartyRow = Party;

export type PartyDeserialized = Omit<Party, "lineup" | "sponsors"> & {
  lineup: number[];
  sponsors: { name: string; amount_cents: number }[];
};

export type PartyCost = {
  id: number;
  party_id: number;
  category: PartyCostCategory | null;
  description: string | null;
  amount: number;
  date: string | null;
  created_at: string;
};

export type PartyCreateInput = Omit<Party, "id" | "created_at" | "updated_at" | "tasks_generated" | "lineup" | "sponsors"> & {
  lineup: number[] | string | null;
  sponsors: { name: string; amount_cents: number }[] | string | null;
};
export type PartyUpdateInput = Partial<PartyCreateInput> & { id: number };

export function partyStatusColor(s: PartyStatus): string {
  return s === "Confirmada"
    ? "bg-emerald-500/20 text-emerald-400"
    : s === "Realizada"
    ? "bg-primary/20 text-primary"
    : s === "Cancelada"
    ? "bg-red-500/20 text-red-400"
    : "bg-amber-500/20 text-amber-400";
}

export function estimatedRevenue(p: PartyDeserialized): number {
  if (!p.expected_capacity) return 0;
  const regular = (p.ticket_price_regular ?? 0) * (p.expected_capacity * 0.8);
  const vip = (p.ticket_price_vip ?? 0) * (p.expected_capacity * 0.2);
  return regular + vip;
}
