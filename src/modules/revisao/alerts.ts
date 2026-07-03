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

/**
 * Nomes dos GRUPOS de alerta (organização "por tipo" do catálogo, do sininho e
 * da central). Mapeiam 1:1 na severidade: crítico → "Alertas graves",
 * atenção → "Exige ação", info → "Avisos".
 */
export const SEVERITY_BUCKET_LABEL: Record<AlertSeverity, string> = {
  critico: "Alertas graves",
  atencao: "Exige ação",
  info: "Avisos",
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
  /**
   * Alerta de "esfriando": refs ("contact:12", "track:7", …) dos itens frios que
   * ele representa. Quando presente, a UI mostra "Deixar esfriar" e o clique
   * registra esses itens como aceitos (ackCooling) — ver cooling.ts.
   */
  coolingRefs?: string[];
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
  | "Objetivos"
  | "Financeiro";

/**
 * Catálogo das regras EMBUTIDAS de ALERTA (as que já existem no `computeAlerts`).
 * Serve para o editor "Configurações avançadas" listá-las com a MENSAGEM REAL
 * que aparece + quando ela dispara, e permitir LIGAR/DESLIGAR cada uma. O `id` é
 * estável; regras com chave dinâmica (sufixo por item) casam por prefixo.
 */
/**
 * Limiares ATUAIS (Configurações avançadas) usados pra preencher o texto de
 * "Dispara quando" com os NÚMEROS REAIS em vigor — nunca uma palavra genérica
 * como "configurado" ou um "padrão X" que pode já não bater com o valor
 * efetivo. `coolingHeatLabel` já vem pronto (rótulo do calor: Fria/Morna/…)
 * porque o vocabulário de calor pertence ao módulo de Ideias, não a este
 * núcleo portátil de alertas.
 */
export type RuleTriggerConfig = {
  coolingDays: number;
  coolingHeatLabel: string;
  prepHours: number;
  packageHoursLeft: number;
  festaSalesPct: number;
  loteSoldPct: number;
  okrsLaggingPct: number;
  okrsLaggingDays: number;
};

export type BuiltinRule = {
  id: string;
  category: RuleCategory;
  /** A mensagem real que aparece no alerta (generalizada, sem o número). */
  message: string;
  /** Quando o alerta dispara (a condição), já com os limiares atuais preenchidos. */
  trigger: (cfg: RuleTriggerConfig) => string;
  /** Prioridade — crítico (dinheiro/prazo), atenção (acionável), info (lembrete). */
  severidade: AlertSeverity;
  /** Regra de dinheiro/fisco — não pode ser excluída do catálogo, só desativada (🔒). */
  inegociavel?: boolean;
  /** Chave dinâmica: o id é um prefixo (ex.: "track-standby-overdue-"). */
  dynamic?: boolean;
};

export const BUILTIN_RULES: BuiltinRule[] = [
  // ── Esfriamento (bloco fixo no topo do catálogo; 0 no calor desliga a regra) ──
  { id: "cooling", category: "Pessoas", severidade: "info", message: "Itens esfriando (sem alimentar além do tempo de resfriamento)", trigger: (cfg) => `Contato, fã, faixa, conteúdo, tarefa ou ideia sem movimento por mais de ${cfg.coolingDays} dia${cfg.coolingDays === 1 ? "" : "s"} (calor mínimo: ${cfg.coolingHeatLabel}); fora itens de criação já concluídos. Dispense com "Deixar esfriar".`, dynamic: true },

  // ── Alertas graves (crítico) ────────────────────────────────────────────────
  { id: "gigs-unpaid", category: "GIGs", severidade: "critico", inegociavel: true, message: "GIGs concluídas com cachê não recebido", trigger: () => "GIG concluída com a previsão de pagamento já vencida; ou, sem previsão, 72h após a conclusão" },
  { id: "receita-abaixo-custo-fixo", category: "Financeiro", severidade: "critico", inegociavel: true, message: "Receita do mês abaixo do custo fixo", trigger: () => "Depois do dia 15, receita realizada do mês menor que o custo fixo mensal (recorrentes)" },
  { id: "tasks-overdue", category: "Tarefas", severidade: "critico", message: "Tarefa vencida sem conclusão", trigger: () => "Tarefa com prazo anterior a hoje e ainda não concluída" },
  { id: "okrs-lagging", category: "Objetivos", severidade: "critico", message: "OKR atrasado no quarter", trigger: (cfg) => `OKR com progresso abaixo de ${cfg.okrsLaggingPct}% e menos de ${cfg.okrsLaggingDays} dias restantes no quarter` },
  { id: "festa-resultado-negativo-", category: "Festas", severidade: "critico", inegociavel: true, message: "Festa com resultado projetado negativo", trigger: () => "Custo projetado maior que a receita projetada (ingressos + patrocínio) antes do evento", dynamic: true },

  // ── Exige ação (atenção) ────────────────────────────────────────────────────
  { id: "gigs-unprepared", category: "GIGs", severidade: "atencao", message: "GIGs sem preparação em breve", trigger: (cfg) => `GIG dentro de ${cfg.prepHours}h sem a preparação musical concluída` },
  { id: "classes-unprepared", category: "Aulas", severidade: "atencao", message: "Aulas sem preparação em breve", trigger: () => "Aula próxima ainda sem preparação registrada" },
  { id: "festa-vendas-baixas-", category: "Festas", severidade: "atencao", message: "Festa próxima com vendas abaixo da meta", trigger: (cfg) => cfg.festaSalesPct === 0 ? "Desligado (0 = nunca dispara)" : `Festa a até 14 dias vendendo menos que ${cfg.festaSalesPct}% da meta de ingressos`, dynamic: true },
  { id: "track-standby-overdue-", category: "Produção", severidade: "atencao", message: "Faixa em standby passou da data de retorno", trigger: () => "Faixa marcada como standby cuja data de retorno já passou", dynamic: true },
  { id: "debriefs-pending", category: "GIGs", severidade: "atencao", message: "Debriefs de GIG pendentes", trigger: () => "GIG concluída sem o debrief preenchido" },

  // ── Avisos (info) ───────────────────────────────────────────────────────────
  { id: "crm-no-interaction-week", category: "Pessoas", severidade: "info", message: "Sem interações com contatos esta semana", trigger: () => "Semana sem nenhuma interação registrada com contatos" },
  { id: "no-upcoming-gigs", category: "GIGs", severidade: "info", message: "Nenhuma GIG à frente", trigger: () => "Não há nenhuma GIG futura agendada; clicar abre uma nova GIG" },
  { id: "funil-producao-vazio", category: "Produção", severidade: "info", message: "Nenhuma faixa sendo produzida", trigger: () => "Nenhuma faixa ativa em produção; clicar abre uma nova faixa" },
  { id: "no-parties-production", category: "Festas", severidade: "info", message: "Nenhuma festa sendo produzida", trigger: () => "Nenhuma festa no pipeline (fora realizadas/canceladas); clicar abre uma nova festa" },
  { id: "no-content-production", category: "Produção", severidade: "info", message: "Nenhum conteúdo sendo produzido", trigger: () => "Nenhum conteúdo em Roteiro, Gravando, Edição ou Pronto; clicar abre um novo conteúdo" },
  { id: "no-upcoming-classes", category: "Aulas", severidade: "info", message: "Nenhuma aula à frente", trigger: () => "Não há nenhuma aula futura agendada; clicar abre uma nova aula" },
  { id: "students-low-balance", category: "Aulas", severidade: "info", message: "Alunos com pacote de aulas quase no fim", trigger: (cfg) => `Pacote de aulas ativo com ${cfg.packageHoursLeft}h ou menos restante; hora de renovar` },
  { id: "lote-esgotando-", category: "Festas", severidade: "info", message: "Lote esgotando (acima do % vendido)", trigger: (cfg) => `Lote de ingressos acima de ${cfg.loteSoldPct}% vendido; hora de abrir o próximo`, dynamic: true },
];

/** Mapeia a chave de um alerta para o `id` da regra embutida (lida no editor). */
export function ruleIdForKey(key: string): string {
  for (const r of BUILTIN_RULES) {
    if (r.dynamic ? key.startsWith(r.id) : key === r.id) return r.id;
  }
  return key;
}

/**
 * A que módulo de CRIAÇÃO (rota canônica) cada regra embutida pertence. Ocultar
 * o módulo no Perfil suprime esses alertas (inclusive os inegociáveis — ocultar
 * um módulo o some de TODA superfície, não só desativa a regra). Regras fora
 * deste mapa são do núcleo (tarefas, financeiro, pessoas, objetivos, ideias) e
 * nunca são afetadas. `id` dinâmico = o mesmo prefixo de `BUILTIN_RULES`.
 */
const MODULE_BY_RULE_ID: Record<string, string> = {
  // GIGs (/gigs)
  "debriefs-pending": "/gigs",
  "gigs-unprepared": "/gigs",
  "gigs-unpaid": "/gigs",
  "no-upcoming-gigs": "/gigs",
  // Produção Musical (/musica)
  "funil-producao-vazio": "/musica",
  "track-standby-overdue-": "/musica",
  // Produção de Festas (/festas)
  "no-parties-production": "/festas",
  "festa-vendas-baixas-": "/festas",
  "festa-resultado-negativo-": "/festas",
  "lote-esgotando-": "/festas",
  // Conteúdo (/conteudo)
  "no-content-production": "/conteudo",
  // Aulas (/aulas)
  "classes-unprepared": "/aulas",
  "students-low-balance": "/aulas",
  "no-upcoming-classes": "/aulas",
};

/**
 * Ids das regras INEGOCIÁVEIS (cadeado verde — dinheiro/fisco). NÃO podem ser
 * desativadas nem editadas no editor, e o motor nunca as filtra mesmo que um id
 * antigo tenha ficado na lista de desligadas.
 */
export const INEGOCIAVEL_RULE_IDS: ReadonlySet<string> = new Set(
  BUILTIN_RULES.filter((r) => r.inegociavel).map((r) => r.id)
);

/** A regra (por id) é inegociável (cadeado verde)? */
export function isInegociavelRule(id: string): boolean {
  return INEGOCIAVEL_RULE_IDS.has(id);
}

/**
 * Calcula a lista de alertas a partir das estatísticas da semana e de stats
 * extras (opcionais). `disabledRuleIds` remove as regras padrão que o usuário
 * desligou no editor — passado pelos consumidores (lido do cache local).
 * `hiddenModules` (Perfil) suprime os alertas dos módulos de CRIAÇÃO ocultos —
 * inclusive os inegociáveis, pois ocultar um módulo o some de TODA superfície.
 * O núcleo segue puro/portátil: mesmas entradas → mesma saída (os consumidores
 * de cliente passam `getHiddenModules()`; servidor/testes podem omitir).
 */
export function computeAlerts(
  stats: WeekStats,
  extra?: ExtraStats,
  disabledRuleIds: string[] = [],
  hiddenModules: Set<string> = new Set()
): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (stats.tasksOverdue > 0)
    alerts.push({
      key: "tasks-overdue",
      icon: "clock",
      // Abre a tarefa mais atrasada, pronta pra concluir.
      to: stats.tasksOverdueIds.length > 0 ? `/tarefas?open=${stats.tasksOverdueIds[0]}` : "/tarefas",
      critical: true,
      label: `Há ${stats.tasksOverdue} tarefa${plural(stats.tasksOverdue)} vencida${plural(stats.tasksOverdue)} sem conclusão`,
    });
  if (stats.pendingDebriefs > 0)
    alerts.push({
      key: "debriefs-pending",
      icon: "star",
      // Abre a GIG concluída há mais tempo sem debrief, pronta pra preencher.
      to: stats.pendingDebriefIds.length > 0 ? `/gigs?debrief=${stats.pendingDebriefIds[0]}` : "/gigs",
      critical: false,
      label: `Há ${stats.pendingDebriefs} GIG${plural(stats.pendingDebriefs)} com debrief pendente`,
    });
  if (stats.gigsUnprepared > 0)
    alerts.push({
      key: "gigs-unprepared",
      icon: "music",
      // Abre a GIG mais próxima pra completar a preparação musical.
      to: stats.gigsUnpreparedIds.length > 0 ? `/gigs?open=${stats.gigsUnpreparedIds[0]}` : "/gigs",
      critical: false,
      label: `Há ${stats.gigsUnprepared} GIG${plural(stats.gigsUnprepared)} chegando sem prep musical completa`,
    });
  if (stats.gigsUnpaidAfter48h > 0)
    alerts.push({
      key: "gigs-unpaid",
      icon: "dollar",
      // Abre direto na primeira GIG (mesmo quando há várias).
      to: stats.gigsUnpaidIds.length > 0 ? `/gigs?open=${stats.gigsUnpaidIds[0]}` : "/gigs",
      critical: true,
      label: `Há ${stats.gigsUnpaidAfter48h} GIG${plural(stats.gigsUnpaidAfter48h)} concluída${plural(stats.gigsUnpaidAfter48h)} com cachê não recebido`,
    });
  // Ideias quentes paradas, faixas/conteúdos/superfãs estagnados → cobertos pelo
  // alerta UNIFICADO "Esfriando" (loadCoolingAlerts em cooling.ts): um só conceito,
  // com tempo de resfriamento configurável e ação "Deixar esfriar".
  if (stats.noUpcomingGigs)
    alerts.push({
      key: "no-upcoming-gigs",
      icon: "warning",
      // Clicar abre direto um formulário de NOVA GIG em branco.
      to: "/gigs?new=1",
      critical: false,
      label: "Nenhuma GIG à frente",
    });
  // "Nenhuma faixa sendo produzida": nenhuma faixa ativa no pipeline. Clicar abre
  // um formulário de NOVA faixa em branco.
  if (stats.noTracksInProduction)
    alerts.push({
      key: "funil-producao-vazio",
      icon: "warning",
      to: "/musica?new=1",
      critical: false,
      label: "Nenhuma faixa sendo produzida",
    });
  // "Nenhuma festa sendo produzida": nada no pipeline de festas. Clicar abre nova.
  if (stats.noPartiesInProduction)
    alerts.push({
      key: "no-parties-production",
      icon: "warning",
      to: "/festas?new=1",
      critical: false,
      label: "Nenhuma festa sendo produzida",
    });
  // "Nenhum conteúdo sendo produzido": nada em Roteiro/Gravando/Edição/Pronto.
  if (stats.contentInProgress === 0)
    alerts.push({
      key: "no-content-production",
      icon: "warning",
      to: "/conteudo?new=1",
      critical: false,
      label: "Nenhum conteúdo sendo produzido",
    });
  // "Nenhuma aula à frente": nenhuma aula futura agendada. Clicar abre nova aula.
  if (stats.noUpcomingClasses)
    alerts.push({
      key: "no-upcoming-classes",
      icon: "book",
      to: "/aulas?new=1",
      critical: false,
      label: "Nenhuma aula à frente",
    });
  if (stats.unpreparedClasses > 0)
    alerts.push({
      key: "classes-unprepared",
      icon: "book",
      // Abre a aula mais próxima, pronta pra preparar.
      to: stats.unpreparedClassIds.length > 0 ? `/aulas?open=${stats.unpreparedClassIds[0]}` : "/aulas",
      critical: false,
      label: `Há ${stats.unpreparedClasses} aula${plural(stats.unpreparedClasses)} não preparada${plural(stats.unpreparedClasses)} em breve`,
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
      // Abre a ficha do (primeiro) aluno — vê o pacote e renova.
      to: list.length > 0 ? `/aulas?open=${list[0].studentId}` : "/aulas",
      critical: false,
      label: single
        ? `${single.studentName} está com ${remLabel(single)} no pacote; hora de renovar`
        : `Há ${list.length} alunos com pacote de aulas quase no fim`,
    });
  }
  // (superfãs sem interação → agora cobertos pelo alerta unificado "Esfriando")
  if (stats.okrsLagging > 0)
    alerts.push({
      key: "okrs-lagging",
      icon: "target",
      to: stats.okrsLaggingIds.length > 0 ? `/objetivos?open=${stats.okrsLaggingIds[0]}` : "/objetivos",
      critical: true,
      label: `Há ${stats.okrsLagging} OKR${plural(stats.okrsLagging)} abaixo de ${stats.okrsLaggingPct}% com menos de ${stats.okrsLaggingDaysThreshold} dias no quarter`,
    });

  for (const t of stats.tracksStandbyOverdue ?? []) {
    alerts.push({
      key: `track-standby-overdue-${t.id}`,
      icon: "music",
      to: `/musica?open=${t.id}`,
      critical: false,
      label: `Track "${t.title}" estava em standby e já passou da data de retorno.`,
    });
  }

  // "GIGs sem avaliação no debrief" foi FUNDIDA em "Debrief de GIG pendente" — a
  // nota do contratante faz parte do debrief, não é um alerta separado.

  // "Nenhuma música nova em 30d" foi FUNDIDA no "Funil de produção vazio" acima.

  if ((extra?.crmNoInteractionThisWeek ?? 0) > 0) {
    alerts.push({
      key: "crm-no-interaction-week",
      icon: "heart",
      to: "/pessoas",
      critical: false,
      label: "Você não tem interações com contatos essa semana",
    });
  }

  // Superfãs/contatos sem interação → cobertos pelo alerta unificado "Esfriando"
  // (loadCoolingAlerts em cooling.ts), não mais por regras separadas aqui.

  // Mensagens de motivação/parabéns NÃO são alertas — foram removidas do
  // sininho (os campos de ExtraStats correspondentes ficam sem uso aqui).

  let result = alerts;
  if (disabledRuleIds.length > 0) {
    const disabled = new Set(disabledRuleIds);
    // Inegociáveis (cadeado verde) NUNCA são filtradas — nem que um id antigo
    // tenha ficado na lista de desligadas.
    result = result.filter((a) => {
      const id = ruleIdForKey(a.key);
      return isInegociavelRule(id) || !disabled.has(id);
    });
  }
  // Perfil: alertas de módulos de CRIAÇÃO ocultos somem por completo — inclusive
  // os inegociáveis (ocultar um módulo o tira de toda superfície). Núcleo intacto.
  if (hiddenModules.size > 0) {
    result = result.filter((a) => {
      const mod = MODULE_BY_RULE_ID[ruleIdForKey(a.key)];
      return !mod || !hiddenModules.has(mod);
    });
  }
  return result;
}
