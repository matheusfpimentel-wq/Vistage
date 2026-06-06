import { DATA_CHANGED } from "@/lib/events";
import type { AlertItem } from "./alerts";

/**
 * "Dispensar" alertas por um tempo. Guardado em localStorage como
 * { [alertKey]: expiryMs }. Compartilhado entre o sininho e a tela de Alertas
 * para que dispensar num lugar reflita no outro.
 */
const KEY = "vistage:snoozed-alerts";

type Snoozed = Record<string, number>;

export function loadSnoozed(): Snoozed {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Snoozed;
    const now = Date.now();
    // limpa entradas expiradas no carregamento
    const clean: Snoozed = {};
    for (const [k, exp] of Object.entries(raw)) {
      if (typeof exp === "number" && exp > now) clean[k] = exp;
    }
    return clean;
  } catch {
    return {};
  }
}

export function isSnoozed(key: string, snoozed: Snoozed = loadSnoozed()): boolean {
  const exp = snoozed[key];
  return !!exp && exp > Date.now();
}

/** Dispensa um alerta por N horas (padrão 24h) e avisa o resto do app. */
export function snoozeAlert(key: string, hours = 24): void {
  const snoozed = loadSnoozed();
  snoozed[key] = Date.now() + hours * 3_600_000;
  localStorage.setItem(KEY, JSON.stringify(snoozed));
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/** Remove os alertas atualmente dispensados de uma lista. */
export function filterSnoozed(alerts: AlertItem[]): AlertItem[] {
  const snoozed = loadSnoozed();
  return alerts.filter((a) => !isSnoozed(a.key, snoozed));
}
