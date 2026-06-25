/**
 * Núcleo PURO da detecção de drift do Google Calendar — sem Tauri, sem DB, sem
 * rede. Isolado de propósito para ser testável (a parte mais sujeita a bug é a
 * comparação de timestamp + extração de data/hora dos campos do Google).
 */

/** Margem p/ skew de relógio entre o cliente e o Google (ms). */
export const DRIFT_MARGIN_MS = 90_000;

/** Extrai "YYYY-MM-DD" de um campo start/end do Google ("2026-06-25" ou "...T22:00:00-03:00"). */
export function isoDatePart(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.slice(0, 10);
}

/** Extrai "HH:MM" de um start COM hora ("...T22:00:00-03:00"); evento de dia inteiro → null. */
export function isoTimePart(s: string | null | undefined): string | null {
  if (!s || !s.includes("T") || s.length < 16) return null;
  return s.slice(11, 16);
}

export type DriftDecision = {
  isDrift: boolean;
  googleDate: string | null;
  googleStartTime: string | null;
  changed: ("data" | "hora")[];
};

/**
 * Decide se um evento divergiu DO LADO DO GOOGLE em relação à GIG.
 *
 * - `baseline`: quando o app gravou o evento por último (ISO) — null = sem
 *   referência, não dá pra afirmar drift.
 * - É drift só quando o `updated` do Google é mais novo que o baseline (+ margem)
 *   E a data ou a hora realmente mudou. Edição de descrição/título (que não
 *   mapeamos de volta) NÃO conta como drift.
 */
export function decideDrift(input: {
  gigDate: string;
  gigStartTime: string | null;
  eventStart: string | null | undefined;
  eventUpdated: string | null | undefined;
  baseline: string | null | undefined;
}): DriftDecision {
  const none: DriftDecision = {
    isDrift: false,
    googleDate: null,
    googleStartTime: null,
    changed: [],
  };
  if (!input.eventUpdated || !input.baseline) return none;
  if (
    new Date(input.eventUpdated).getTime() <=
    new Date(input.baseline).getTime() + DRIFT_MARGIN_MS
  ) {
    return none; // mudança nossa (ou nada novo)
  }
  const googleDate = isoDatePart(input.eventStart);
  const googleStartTime = isoTimePart(input.eventStart);
  const changed: ("data" | "hora")[] = [];
  if (googleDate && googleDate !== input.gigDate) changed.push("data");
  if ((googleStartTime ?? null) !== (input.gigStartTime ?? null)) changed.push("hora");
  return {
    isDrift: changed.length > 0,
    googleDate,
    googleStartTime,
    changed,
  };
}
