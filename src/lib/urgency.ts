import { toLocalISODate } from "./format";

/**
 * Tokens únicos de urgência de prazo — fonte única para toda a app (tarefas,
 * prep/debrief de GIGs, confirmações/formalidades de festas, ações de marketing).
 * `vencido` = alerta; `proximo` = âmbar (dentro do horizonte); `ok`/null = neutro.
 * O horizonte de "próximo" é configurável por contexto (default 7 dias).
 */
export type Urgency = "vencido" | "proximo" | "ok" | null;

export function urgencyOf(
  date: string | null | undefined,
  opts: { resolved?: boolean; horizonDays?: number } = {}
): Urgency {
  if (!date || opts.resolved) return null;
  const d = date.slice(0, 10);
  const today = toLocalISODate();
  if (d < today) return "vencido";
  const horizon = opts.horizonDays ?? 7;
  const h = new Date(today + "T00:00:00");
  h.setDate(h.getDate() + horizon);
  return d <= toLocalISODate(h) ? "proximo" : "ok";
}

/** Classe de borda/texto para inputs/badges de data com urgência. */
export function urgencyClass(u: Urgency): string {
  return u === "vencido"
    ? "border-red-500/60 text-red-400"
    : u === "proximo"
    ? "border-amber-500/60 text-amber-400"
    : "";
}

/** Cor de "ponto" de status por urgência. */
export function urgencyDot(u: Urgency): string {
  return u === "vencido" ? "bg-red-500" : u === "proximo" ? "bg-amber-500" : "bg-muted-foreground/40";
}
