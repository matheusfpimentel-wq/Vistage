export type InsightSource = "gig" | "track" | "party" | "idea" | "manual";

export type InsightHit = {
  source_type: InsightSource;
  source_id: number;
  source_title: string;
  content: string;
  occurred_at: string;
};

export const SOURCE_LABEL: Record<InsightSource, string> = {
  gig: "GIG",
  track: "Track",
  party: "Festa",
  idea: "Ideia",
  manual: "Manual",
};

export const SOURCE_COLOR: Record<InsightSource, string> = {
  gig: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  track: "bg-primary/20 text-primary border-primary/30",
  party: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  idea: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  manual: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

export const SOURCE_ROUTE: Record<InsightSource, string> = {
  gig: "/gigs",
  track: "/musica",
  party: "/festas",
  idea: "/ideias",
  manual: "/insights",
};
