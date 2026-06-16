import { getDb } from "@/lib/db";
import { DATA_CHANGED } from "@/lib/events";
import type { AlertItem } from "./alerts";

/**
 * "Dispensar" alertas por um tempo. Guardado em app_settings como
 * { [alertKey]: expiryMs }. Compartilhado entre o sininho e a tela de Alertas
 * para que dispensar num lugar reflita no outro.
 */
const DB_KEY = "alerts.snooze";

type Snoozed = Record<string, number>;

async function loadSnoozed(): Promise<Snoozed> {
  try {
    const db = getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [DB_KEY]
    );
    const raw = rows.length > 0 ? (JSON.parse(rows[0].value) as Snoozed) : {};
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

/** Dispensa um alerta por N horas (padrão 24h) e avisa o resto do app. */
export async function snoozeAlert(key: string, hours = 24): Promise<void> {
  const snoozed = await loadSnoozed();
  snoozed[key] = Date.now() + hours * 3_600_000;
  const db = getDb();
  await db.execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [DB_KEY, JSON.stringify(snoozed)]
  );
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/** Remove os alertas atualmente dispensados de uma lista. */
export async function filterSnoozed(alerts: AlertItem[]): Promise<AlertItem[]> {
  const snoozed = await loadSnoozed();
  return alerts.filter((a) => !snoozed[a.key] || snoozed[a.key]! <= Date.now());
}
