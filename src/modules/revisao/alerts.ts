import type { WeekStats } from "./api";

/**
 * Núcleo PORTÁVEL de alertas e recomendações.
 *
 * Esta função é pura (sem JSX, sem React, sem acesso a DB): recebe um
 * `WeekStats` já calculado e devolve a lista de alertas como dados simples.
 * Isso permite reaproveitá-la em três lugares:
 *   1. O sininho de notificações no desktop (NotificationBell).
 *   2. A futura tela de alertas do app mobile.
 *   3. A futura Edge Function na nuvem que dispara push notifications —
 *      ela calcula o WeekStats a partir do Postgres e chama `computeAlerts`
 *      para decidir o que notificar (filtrando por `critical`).
 *
 * Ao manter a lógica aqui, os três consumidores ficam sempre em sincronia.
 */

export type AlertIconKey =
  | "clock"
  | "star"
  | "flame"
  | "music"
  | "party"
  | "book"
  | "heart"
  | "target"
  | "dollar"
  | "warning";

export type AlertItem = {
  /** Chave estável — usada para deduplicar push e como React key. */
  key: string;
  label: string;
  /** Rota interna para onde o alerta leva. */
  to: string;
  critical: boolean;
  icon: AlertIconKey;
};

const plural = (n: number) => (n > 1 ? "s" : "");

/** Calcula a lista de alertas a partir das estatísticas da semana. */
export function computeAlerts(stats: WeekStats): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (stats.tasksOverdue > 0)
    alerts.push({
      key: "tasks-overdue",
      icon: "clock",
      to: "/tarefas",
      critical: true,
      label: `${stats.tasksOverdue} tarefa${plural(stats.tasksOverdue)} atrasada${plural(stats.tasksOverdue)}`,
    });
  if (stats.pendingDebriefs > 0)
    alerts.push({
      key: "debriefs-pending",
      icon: "star",
      to: "/gigs",
      critical: true,
      label: `${stats.pendingDebriefs} debrief${plural(stats.pendingDebriefs)} de GIG pendente${plural(stats.pendingDebriefs)}`,
    });
  if (stats.gigsUnprepared > 0)
    alerts.push({
      key: "gigs-unprepared",
      icon: "music",
      to: "/gigs",
      critical: true,
      label: `${stats.gigsUnprepared} GIG${plural(stats.gigsUnprepared)} em 72h sem prep musical completa`,
    });
  if (stats.gigsUnpaidAfter48h > 0)
    alerts.push({
      key: "gigs-unpaid",
      icon: "dollar",
      to: "/gigs",
      critical: true,
      label: `${stats.gigsUnpaidAfter48h} GIG${plural(stats.gigsUnpaidAfter48h)} concluída${plural(stats.gigsUnpaidAfter48h)} há +48h com cachê não recebido`,
    });
  if (stats.hotIdeasStuck > 0)
    alerts.push({
      key: "ideas-stuck",
      icon: "flame",
      to: "/ideias",
      critical: true,
      label: `${stats.hotIdeasStuck} ideia${plural(stats.hotIdeasStuck)} quente${plural(stats.hotIdeasStuck)} parada${plural(stats.hotIdeasStuck)} em Embrião +15d`,
    });
  if (stats.stalledTracks > 0)
    alerts.push({
      key: "tracks-stalled",
      icon: "music",
      to: "/musica",
      critical: false,
      label: `${stats.stalledTracks} track${plural(stats.stalledTracks)} sem movimento há +15 dias`,
    });
  if (stats.stalledParties > 0)
    alerts.push({
      key: "parties-stalled",
      icon: "party",
      to: "/festas",
      critical: false,
      label: `${stats.stalledParties} festa${plural(stats.stalledParties)} sem movimento há +15 dias`,
    });
  if (stats.stalledContent > 0)
    alerts.push({
      key: "content-stalled",
      icon: "clock",
      to: "/conteudo",
      critical: false,
      label: `${stats.stalledContent} conteúdo${plural(stats.stalledContent)} sem movimento há +15 dias`,
    });
  if (stats.undatedParties > 0)
    alerts.push({
      key: "parties-undated",
      icon: "party",
      to: "/festas",
      critical: false,
      label: `${stats.undatedParties} festa${plural(stats.undatedParties)} sem data definida`,
    });
  if (stats.noUpcomingGigs)
    alerts.push({
      key: "no-upcoming-gigs",
      icon: "warning",
      to: "/gigs",
      critical: false,
      label: "Nenhuma GIG marcada à frente",
    });
  if (stats.noTracksInProduction)
    alerts.push({
      key: "no-tracks-production",
      icon: "warning",
      to: "/musica",
      critical: false,
      label: "Nenhuma música em produção",
    });
  if (stats.unpreparedClasses > 0)
    alerts.push({
      key: "classes-unprepared",
      icon: "book",
      to: "/aulas",
      critical: false,
      label: `${stats.unpreparedClasses} aula${plural(stats.unpreparedClasses)} não preparada${plural(stats.unpreparedClasses)} em breve`,
    });
  if (stats.superfasSemInteracao > 0)
    alerts.push({
      key: "superfans-stale",
      icon: "heart",
      to: "/fas",
      critical: false,
      label: `${stats.superfasSemInteracao} superfã${plural(stats.superfasSemInteracao)} sem interação nos últimos 30 dias`,
    });
  if (stats.okrsLagging > 0)
    alerts.push({
      key: "okrs-lagging",
      icon: "target",
      to: "/objetivos",
      critical: false,
      label: `${stats.okrsLagging} OKR${plural(stats.okrsLagging)} abaixo de 20% com menos de 30 dias no quarter`,
    });

  for (const t of stats.tracksStandbyOverdue ?? []) {
    alerts.push({
      key: `track-standby-overdue-${t.id}`,
      icon: "music",
      to: "/musica",
      critical: false,
      label: `Track "${t.title}" estava em standby e já passou da data de retorno.`,
    });
  }

  return alerts;
}
