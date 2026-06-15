import type { Gig } from "./types";

/**
 * Nome que vai aparecer na lista, calendário e dashboard.
 * Prefere o nome da festa/evento; cai pro nome do venue se não houver.
 */
export function gigDisplayName(gig: Pick<Gig, "event_name" | "venue_name">): string {
  const event = gig.event_name?.trim();
  if (event) return event;
  return gig.venue_name;
}
