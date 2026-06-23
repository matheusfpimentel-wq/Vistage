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
  | "warning"
  | "trophy"
  | "zap";

export type AlertItem = {
  /** Chave estável — usada para deduplicar push e como React key. */
  key: string;
  label: string;
  /** Rota interna para onde o alerta leva. */
  to: string;
  critical: boolean;
  icon: AlertIconKey;
};

export type ExtraStats = {
  /** GIGs esta semana sem nenhuma avaliação de debrief registrada */
  gigsWithoutRating?: number;
  /** Dias desde que a última música foi iniciada (null = nunca ou muito recente) */
  daysSinceLastTrack?: number | null;
  /** Contatos CRM sem interação esta semana */
  crmNoInteractionThisWeek?: number;
  /** Tarefas vencidas (redundante com tasksOverdue mas mais detalhado) */
  overdueCount?: number;
  /** GIGs concluídas sem debrief (redundante com pendingDebriefs) */
  gigsNeedingDebrief?: number;
  /** Superfãs sem interação há 30+ dias (redundante com superfasSemInteracao) */
  staleSuperFans?: number;
  /** Tarefas concluídas esta semana (para motivação) */
  tasksCompletedThisWeek?: number;
  /** Número de GIGs este mês (para motivação) */
  gigsThisMonth?: number;
  /** Dias para bater recorde de sessões de foco */
  daysToFocusRecord?: number | null;
};

const plural = (n: number) => (n > 1 ? "s" : "");

/** Categorias usadas para agrupar as regras padrão no editor de Configurações. */
export type RuleCategory =
  | "GIGs"
  | "Produção"
  | "Pessoas"
  | "Tarefas"
  | "Festas"
  | "Aulas"
  | "Objetivos"
  | "Motivação";

/**
 * Catálogo das regras EMBUTIDAS (as que já existem no `computeAlerts`). Serve
 * para o editor "Configurações avançadas" listá-las no formato Se→Então e
 * permitir LIGAR/DESLIGAR cada uma. O `id` é estável; regras com chave dinâmica
 * (sufixo por item) casam por prefixo (`dynamic: true`).
 */
export type BuiltinRule = {
  id: string;
  category: RuleCategory;
  /** Texto no formato "Se … → Então …". */
  label: string;
  /** Chave dinâmica: o id é um prefixo (ex.: "motivation-tasks-done-"). */
  dynamic?: boolean;
};

export const BUILTIN_RULES: BuiltinRule[] = [
  { id: "tasks-overdue", category: "Tarefas", label: "Se uma tarefa está vencida (data < hoje) sem conclusão → alerta" },
  { id: "debriefs-pending", category: "GIGs", label: "Se uma GIG concluída está sem debrief → alerta" },
  { id: "gigs-unprepared", category: "GIGs", label: "Se uma GIG em até 72h está sem prep musical completa → alerta" },
  { id: "gigs-unpaid", category: "GIGs", label: "Se uma GIG concluída há +48h está com cachê não recebido → alerta" },
  { id: "gigs-no-rating", category: "GIGs", label: "Se uma GIG desta semana está sem avaliação no debrief → alerta" },
  { id: "no-upcoming-gigs", category: "GIGs", label: "Se não há nenhuma GIG marcada à frente → alerta" },
  { id: "ideas-stuck", category: "Produção", label: "Se uma ideia quente está parada em Embrião há +15 dias → alerta" },
  { id: "tracks-stalled", category: "Produção", label: "Se uma faixa está sem movimento há +15 dias → alerta" },
  { id: "content-stalled", category: "Produção", label: "Se um conteúdo está sem movimento há +15 dias → alerta" },
  { id: "no-tracks-production", category: "Produção", label: "Se não há nenhuma música em produção → alerta" },
  { id: "no-new-track-30d", category: "Produção", label: "Se nenhuma música nova foi iniciada nos últimos 30 dias → alerta" },
  { id: "track-standby-overdue-", category: "Produção", label: "Se uma faixa em standby passou da data de retorno → alerta", dynamic: true },
  { id: "parties-stalled", category: "Festas", label: "Se uma festa está sem movimento há +15 dias → alerta" },
  { id: "parties-undated", category: "Festas", label: "Se uma festa está sem data definida → alerta" },
  { id: "classes-unprepared", category: "Aulas", label: "Se uma aula em breve não foi preparada → alerta" },
  { id: "superfans-stale", category: "Pessoas", label: "Se um superfã está sem interação há 30+ dias → alerta" },
  { id: "superfans-pending-interaction", category: "Pessoas", label: "Se um fã Superfã está sem interação há 30+ dias → pendência" },
  { id: "crm-no-interaction-week", category: "Pessoas", label: "Se nenhum contato do CRM foi interagido esta semana → alerta" },
  { id: "okrs-lagging", category: "Objetivos", label: "Se um OKR está abaixo de 20% com menos de 30 dias no quarter → alerta" },
  { id: "motivation-tasks-done-", category: "Motivação", label: "Se você completou 5+ tarefas na semana → parabéns", dynamic: true },
  { id: "motivation-gigs-month-", category: "Motivação", label: "Se você fez shows este mês e tem GIG esta semana → motivação", dynamic: true },
  { id: "motivation-focus-record-", category: "Motivação", label: "Se você está a 7 dias ou menos de bater seu recorde de foco → motivação", dynamic: true },
];

/** Mapeia a chave de um alerta para o `id` da regra embutida (lida no editor). */
export function ruleIdForKey(key: string): string {
  for (const r of BUILTIN_RULES) {
    if (r.dynamic ? key.startsWith(r.id) : key === r.id) return r.id;
  }
  return key;
}

/**
 * Calcula a lista de alertas a partir das estatísticas da semana e de stats
 * extras (opcionais). `disabledRuleIds` remove as regras padrão que o usuário
 * desligou no editor — passado pelos consumidores (lido do cache local). O
 * núcleo segue puro/portátil: mesmas entradas → mesma saída.
 */
export function computeAlerts(
  stats: WeekStats,
  extra?: ExtraStats,
  disabledRuleIds: string[] = []
): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (stats.tasksOverdue > 0)
    alerts.push({
      key: "tasks-overdue",
      icon: "clock",
      to: "/tarefas",
      critical: true,
      label: `Há ${stats.tasksOverdue} tarefa${plural(stats.tasksOverdue)} vencida${plural(stats.tasksOverdue)} sem conclusão`,
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
      // Uma só GIG → abre direto nela; várias → cai na lista.
      to: stats.gigsUnpaidIds.length === 1 ? `/gigs?open=${stats.gigsUnpaidIds[0]}` : "/gigs",
      critical: true,
      label: `${stats.gigsUnpaidAfter48h} GIG${plural(stats.gigsUnpaidAfter48h)} concluída${plural(stats.gigsUnpaidAfter48h)} com cachê não recebido`,
    });
  if (stats.hotIdeasStuck > 0)
    alerts.push({
      key: "ideas-stuck",
      icon: "flame",
      // Uma só ideia → abre direto nela; várias → cai na lista.
      to: stats.hotIdeasStuckIds.length === 1 ? `/ideias?open=${stats.hotIdeasStuckIds[0]}` : "/ideias",
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

  // ── Fraquezas / gaps ───────────────────────────────────────────
  if ((extra?.gigsWithoutRating ?? 0) > 0) {
    const n = extra!.gigsWithoutRating!;
    alerts.push({
      key: "gigs-no-rating",
      icon: "star",
      to: "/gigs",
      critical: false,
      label: `${n} GIG${plural(n)} esta semana sem avaliação registrada no debrief`,
    });
  }

  if ((extra?.daysSinceLastTrack ?? null) != null && (extra?.daysSinceLastTrack ?? 0) >= 30) {
    const d = extra!.daysSinceLastTrack!;
    alerts.push({
      key: "no-new-track-30d",
      icon: "music",
      to: "/musica",
      critical: false,
      label: `Nenhuma música nova iniciada nos últimos ${d} dias`,
    });
  }

  if ((extra?.crmNoInteractionThisWeek ?? 0) > 0) {
    alerts.push({
      key: "crm-no-interaction-week",
      icon: "heart",
      to: "/pessoas",
      critical: false,
      label: "Nenhum contato CRM interagido esta semana — que tal manter o relacionamento?",
    });
  }

  // ── Pendências ─────────────────────────────────────────────────
  if ((extra?.staleSuperFans ?? 0) > 0) {
    const n = extra!.staleSuperFans!;
    alerts.push({
      key: "superfans-pending-interaction",
      icon: "heart",
      to: "/fas",
      critical: false,
      label: `${n} fã${plural(n)} Superfã${plural(n)} sem interação há 30+ dias`,
    });
  }

  // ── Motivação / conquistas ─────────────────────────────────────
  if ((extra?.tasksCompletedThisWeek ?? 0) >= 5) {
    const n = extra!.tasksCompletedThisWeek!;
    alerts.push({
      key: `motivation-tasks-done-${n}`,
      icon: "trophy",
      to: "/tarefas",
      critical: false,
      label: `Você completou ${n} tarefa${plural(n)} esta semana — ótimo ritmo!`,
    });
  }

  if ((extra?.gigsThisMonth ?? 0) > 0 && stats.gigsThisWeek > 0) {
    const n = extra!.gigsThisMonth!;
    alerts.push({
      key: `motivation-gigs-month-${n}`,
      icon: "zap",
      to: "/gigs",
      critical: false,
      label: `Esta semana com ${stats.gigsThisWeek} GIG${plural(stats.gigsThisWeek)} — você já fez ${n} show${plural(n)} este mês!`,
    });
  }

  if ((extra?.daysToFocusRecord ?? null) != null && (extra?.daysToFocusRecord ?? 999) <= 7) {
    const d = extra!.daysToFocusRecord!;
    alerts.push({
      key: `motivation-focus-record-${d}d`,
      icon: "zap",
      to: "/foco",
      critical: false,
      label: `Você está a apenas ${d} dia${plural(d)} de bater seu recorde de sessões de foco`,
    });
  }

  if (disabledRuleIds.length > 0) {
    const disabled = new Set(disabledRuleIds);
    return alerts.filter((a) => !disabled.has(ruleIdForKey(a.key)));
  }
  return alerts;
}
