import { persistDocSetting } from "@/lib/docSettings";

/**
 * Configuração das regras de Insights/Alertas que o usuário liga/desliga em
 * "Configurações avançadas". Guardado em document_settings (portátil, viaja com
 * o .vistage) sob uma chave com prefixo "vistage.rules.". O cache local
 * (localStorage) é a fonte SÍNCRONA que `computeAlerts` lê via os consumidores.
 */
export const DISABLED_RULES_KEY = "vistage.rules.disabled";

/** Lê os ids das regras DESLIGADas (sincronicamente, do cache local). */
export function getDisabledRuleIds(): string[] {
  try {
    const raw = localStorage.getItem(DISABLED_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* JSON inválido — trata como nenhuma desligada */
  }
  return [];
}

/** Persiste o conjunto de regras desligadas (write-through: cache + documento). */
export function setDisabledRuleIds(ids: string[]): void {
  persistDocSetting(DISABLED_RULES_KEY, JSON.stringify(ids));
}

/** Liga/desliga uma regra e devolve a nova lista de desligadas. */
export function toggleRuleDisabled(id: string, disabled: boolean): string[] {
  const current = new Set(getDisabledRuleIds());
  if (disabled) current.add(id);
  else current.delete(id);
  const next = Array.from(current);
  setDisabledRuleIds(next);
  return next;
}

/** Restaura o padrão das regras embutidas: reativa TODAS (limpa as desligadas). */
export function restoreDefaultRules(): void {
  setDisabledRuleIds([]);
}

/**
 * "Tempo de resfriamento" (em dias): além desse tempo sem alimentar, um item
 * passa a "esfriar" (ver cooling.ts). Configurável pelo usuário e PORTÁTIL
 * (mesma família "vistage.rules." das regras — viaja no .vistage, hidrata no
 * cache local pra leitura síncrona, sem marcar o documento como sujo).
 */
export const COOLING_DAYS_KEY = "vistage.rules.cooling_days";
export const DEFAULT_COOLING_DAYS = 15;

/** Lê o tempo de resfriamento (dias) do cache local, com padrão e limites sãos. */
export function getCoolingDays(): number {
  try {
    const raw = localStorage.getItem(COOLING_DAYS_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 365) return n;
    }
  } catch {
    /* storage indisponível — usa o padrão */
  }
  return DEFAULT_COOLING_DAYS;
}

/** Define o tempo de resfriamento (write-through: cache + documento, portátil). */
export function setCoolingDays(days: number): void {
  const n = Math.max(1, Math.min(365, Math.round(days)));
  persistDocSetting(COOLING_DAYS_KEY, String(n));
}
