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

/** Prioridade do alerta — dirige cor e ordenação (e, adiante, padrões de push/permanência). */
export type AlertSeverity = "critico" | "atencao" | "info";

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { critico: 0, atencao: 1, info: 2 };
export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  info: "Informativo",
};

export type AlertItem = {
  /** Chave estável — usada para deduplicar push e como React key. */
  key: string;
  label: string;
  /** Rota interna para onde o alerta leva. */
  to: string;
  critical: boolean;
  icon: AlertIconKey;
  /** Regra própria marcada como "desaparecer ao clicar" → mostra dispensar. */
  dismissible?: boolean;
  /** Prioridade (preenchida por regras do usuário; builtins derivam do catálogo). */
  severidade?: AlertSeverity;
};

/** Prioridade efetiva de um alerta: a própria, ou a do catálogo builtin, ou via `critical`. */
export function alertSeverity(item: AlertItem): AlertSeverity {
  if (item.severidade) return item.severidade;
  const id = ruleIdForKey(item.key);
  const builtin = BUILTIN_RULES.find((b) => b.id === id);
  if (builtin) return builtin.severidade;
  return item.critical ? "critico" : "info";
}

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
  | "Objetivos";

/**
 * Catálogo das regras EMBUTIDAS de ALERTA (as que já existem no `computeAlerts`).
 * Serve para o editor "Configurações avançadas" listá-las com a MENSAGEM REAL
 * que aparece + quando ela dispara, e permitir LIGAR/DESLIGAR cada uma. O `id` é
 * estável; regras com chave dinâmica (sufixo por item) casam por prefixo.
 */
export type BuiltinRule = {
  id: string;
  category: RuleCategory;
  /** A mensagem real que aparece no alerta (generalizada, sem o número). */
  message: string;
  /** Quando o alerta dispara (a condição). */
  trigger: string;
  /** Prioridade — crítico (dinheiro/prazo), atenção (acionável), info (lembrete). */
  severidade: AlertSeverity;
  /** Chave dinâmica: o id é um prefixo (ex.: "track-standby-overdue-"). */
  dynamic?: boolean;
};

export const BUILTIN_RULES: BuiltinRule[] = [
  { id: "tasks-overdue", category: "Tarefas", severidade: "atencao", message: "Há tarefas vencidas sem conclusão", trigger: "Tarefa com prazo anterior a hoje e ainda não concluída" },
  { id: "debriefs-pending", category: "GIGs", severidade: "atencao", message: "Debriefs de GIG pendentes", trigger: "GIG concluída sem o debrief preenchido" },
  { id: "gigs-unprepared", category: "GIGs", severidade: "critico", message: "GIGs em 72h sem prep musical completa", trigger: "GIG nas próximas 72h sem a preparação musical concluída" },
  { id: "gigs-unpaid", category: "GIGs", severidade: "critico", message: "GIGs concluídas com cachê não recebido", trigger: "GIG concluída há mais de 48h com cachê ainda não recebido" },
  { id: "gigs-no-rating", category: "GIGs", severidade: "info", message: "GIGs desta semana sem avaliação no debrief", trigger: "GIG da semana concluída sem a nota do contratante no debrief" },
  { id: "no-upcoming-gigs", category: "GIGs", severidade: "atencao", message: "Nenhuma GIG marcada à frente", trigger: "Não há nenhuma GIG futura agendada" },
  { id: "ideas-stuck", category: "Produção", severidade: "info", message: "Ideias quentes paradas em Embrião há +15 dias", trigger: "Ideia 'quente' sem evoluir do estágio Embrião por mais de 15 dias" },
  { id: "tracks-stalled", category: "Produção", severidade: "atencao", message: "Faixas sem movimento há +15 dias", trigger: "Faixa em produção sem nenhuma atualização por mais de 15 dias" },
  { id: "content-stalled", category: "Produção", severidade: "info", message: "Conteúdos sem movimento há +15 dias", trigger: "Conteúdo sem nenhuma atualização por mais de 15 dias" },
  { id: "no-tracks-production", category: "Produção", severidade: "info", message: "Nenhuma música em produção", trigger: "Não há nenhuma faixa em produção no momento" },
  { id: "no-new-track-30d", category: "Produção", severidade: "info", message: "Nenhuma música nova nos últimos 30 dias", trigger: "Nenhuma faixa foi iniciada nos últimos 30 dias" },
  { id: "track-standby-overdue-", category: "Produção", severidade: "info", message: "Faixa em standby passou da data de retorno", trigger: "Faixa marcada como standby cuja data de retorno já passou", dynamic: true },
  { id: "parties-stalled", category: "Festas", severidade: "info", message: "Festas sem movimento há +15 dias", trigger: "Festa sem nenhuma atualização por mais de 15 dias" },
  { id: "parties-undated", category: "Festas", severidade: "info", message: "Festas sem data definida", trigger: "Festa cadastrada sem data definida" },
  { id: "classes-unprepared", category: "Aulas", severidade: "atencao", message: "Aulas não preparadas em breve", trigger: "Aula próxima ainda sem preparação registrada" },
  { id: "students-low-balance", category: "Aulas", severidade: "atencao", message: "Alunos com pacote de aulas quase no fim", trigger: "Pacote de aulas ativo com 2 ou menos aulas (ou 2h) restantes — hora de renovar" },
  { id: "superfans-stale", category: "Pessoas", severidade: "info", message: "Superfãs sem interação nos últimos 30 dias", trigger: "Superfã sem nenhuma interação registrada há 30 dias" },
  { id: "superfans-pending-interaction", category: "Pessoas", severidade: "info", message: "Superfãs com interação pendente há 30+ dias", trigger: "Fã superfã sem interação registrada há 30 dias ou mais" },
  { id: "crm-no-interaction-week", category: "Pessoas", severidade: "info", message: "Nenhum contato do CRM interagido esta semana", trigger: "Semana sem nenhuma interação registrada com contatos do CRM" },
  { id: "okrs-lagging", category: "Objetivos", severidade: "atencao", message: "OKRs abaixo de 20% com menos de 30 dias no quarter", trigger: "OKR com progresso abaixo de 20% e menos de 30 dias restantes no quarter" },
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
  if ((stats.lowBalanceStudents?.length ?? 0) > 0) {
    const list = stats.lowBalanceStudents;
    const single = list.length === 1 ? list[0] : null;
    const remLabel = (r: { remaining: number; unit: "aula" | "h" }) =>
      r.unit === "h"
        ? `${r.remaining.toLocaleString("pt-BR")} h`
        : `${r.remaining} aula${plural(r.remaining)}`;
    alerts.push({
      key: "students-low-balance",
      icon: "warning",
      // Uma só → abre a ficha do aluno (vê o pacote e renova); várias → lista.
      to: single ? `/aulas?open=${single.studentId}` : "/aulas",
      critical: false,
      label: single
        ? `${single.studentName} está com ${remLabel(single)} no pacote — hora de renovar`
        : `${list.length} alunos com pacote de aulas quase no fim`,
    });
  }
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

  // Mensagens de motivação/parabéns NÃO são alertas — foram removidas do
  // sininho (os campos de ExtraStats correspondentes ficam sem uso aqui).

  if (disabledRuleIds.length > 0) {
    const disabled = new Set(disabledRuleIds);
    return alerts.filter((a) => !disabled.has(ruleIdForKey(a.key)));
  }
  return alerts;
}
