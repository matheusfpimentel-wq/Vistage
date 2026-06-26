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

/**
 * Modo pausa: suspende os alertas de PIPELINE/CONTINUIDADE (gigs à frente, funil
 * de produção, conteúdo/ideias parados, relacionamento) durante uma pausa
 * deliberada — sem te xingar por isso. NÃO silencia dinheiro nem prazo. Também
 * viaja no .vistage.
 */
export const PAUSE_MODE_KEY = "vistage.rules.pauseMode";

export function isPauseMode(): boolean {
  try {
    return localStorage.getItem(PAUSE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPauseMode(on: boolean): void {
  persistDocSetting(PAUSE_MODE_KEY, on ? "1" : "0");
}
