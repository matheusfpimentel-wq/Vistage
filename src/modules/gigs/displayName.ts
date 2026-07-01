import type { Gig } from "./types";

/**
 * Nome que vai aparecer na lista, calendário e dashboard.
 * Se recurring_event_name e event_name estiverem preenchidos, retorna
 * "recurring_event_name: event_name" (ex.: "Caliente: Especial Karol G").
 * Caso contrário prefere event_name; cai pro nome do venue se não houver.
 */
export function gigDisplayName(gig: Pick<Gig, "event_name" | "venue_name" | "recurring_event_name">): string {
  const recurring = gig.recurring_event_name?.trim();
  const event = gig.event_name?.trim();
  if (recurring && event) return `${recurring}: ${event}`;
  if (event) return event;
  if (recurring) return recurring;
  return gig.venue_name;
}
