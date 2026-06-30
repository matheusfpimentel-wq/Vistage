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

/**
 * Limiares percentuais editáveis de alguns alertas de festa (mesma família
 * portátil "vistage.rules."). Lidos do cache local (síncrono) pelos loaders.
 *  - festa_sales_pct: dispara quando as vendas estão ABAIXO de X% da meta (0 = nunca);
 *  - lote_sold_pct:   dispara quando o lote passa de X% vendido.
 */
export const FESTA_SALES_PCT_KEY = "vistage.rules.festa_sales_pct";
export const DEFAULT_FESTA_SALES_PCT = 40;
export const LOTE_SOLD_PCT_KEY = "vistage.rules.lote_sold_pct";
export const DEFAULT_LOTE_SOLD_PCT = 80;

function getPct(key: string, def: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  } catch {
    /* storage indisponível — usa o padrão */
  }
  return def;
}

function setPct(key: string, value: number): void {
  persistDocSetting(key, String(Math.max(0, Math.min(100, Math.round(value)))));
}

export const getFestaSalesPct = (): number => getPct(FESTA_SALES_PCT_KEY, DEFAULT_FESTA_SALES_PCT);
export const setFestaSalesPct = (v: number): void => setPct(FESTA_SALES_PCT_KEY, v);
export const getLoteSoldPct = (): number => getPct(LOTE_SOLD_PCT_KEY, DEFAULT_LOTE_SOLD_PCT);
export const setLoteSoldPct = (v: number): void => setPct(LOTE_SOLD_PCT_KEY, v);

/** Leitor genérico de número (cache local) com padrão e limites. */
function getNum(key: string, def: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= min && n <= max) return n;
    }
  } catch {
    /* storage indisponível — usa o padrão */
  }
  return def;
}
function setNum(key: string, value: number, min: number, max: number): void {
  persistDocSetting(key, String(Math.max(min, Math.min(max, value))));
}

/** Antecedência (horas) do alerta "GIG sem prep musical" — padrão 72h. */
export const PREP_HOURS_KEY = "vistage.rules.prep_hours";
export const DEFAULT_PREP_HOURS = 72;
export const getPrepHours = (): number => Math.round(getNum(PREP_HOURS_KEY, DEFAULT_PREP_HOURS, 1, 720));
export const setPrepHours = (h: number): void => setNum(PREP_HOURS_KEY, Math.round(h), 1, 720);

/** Saldo (em HORAS) que aciona "pacote de aula quase no fim" — padrão 1h. */
export const PACKAGE_HOURS_KEY = "vistage.rules.package_hours_left";
export const DEFAULT_PACKAGE_HOURS = 1;
export const getPackageHoursLeft = (): number => getNum(PACKAGE_HOURS_KEY, DEFAULT_PACKAGE_HOURS, 0, 100);
export const setPackageHoursLeft = (h: number): void => setNum(PACKAGE_HOURS_KEY, h, 0, 100);

/**
 * Calor mínimo da IDEIA para entrar no "esfriando" (ideias têm calor 1–3).
 * 0 = desliga a regra de esfriando INTEIRA (todas as entidades). Padrão 1.
 */
export const COOLING_HEAT_KEY = "vistage.rules.cooling_heat";
export const DEFAULT_COOLING_HEAT = 1;
export const getCoolingHeat = (): number => Math.round(getNum(COOLING_HEAT_KEY, DEFAULT_COOLING_HEAT, 0, 3));
export const setCoolingHeat = (h: number): void => setNum(COOLING_HEAT_KEY, Math.round(h), 0, 3);
