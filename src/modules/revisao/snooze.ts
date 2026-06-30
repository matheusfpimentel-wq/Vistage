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

/**
 * "Dispensar até disparar de novo": o X de cada alerta esconde-o ENQUANTO a
 * situação não muda. Guardamos { [alertKey]: assinatura } onde a assinatura é o
 * próprio texto do alerta (que carrega a contagem / entidades). Assim:
 *  - mesma assinatura  → segue escondido;
 *  - assinatura muda (ex.: "Há 2 GIGs…" → "Há 1 GIG…") → reaparece já decrementado;
 *  - condição zera (o alerta some da lista) → a dispensa é limpa, e ele volta a
 *    aparecer quando disparar de novo.
 */
const DISMISS_DB_KEY = "alerts.dismissed";
type Dismissed = Record<string, string>;

/** Assinatura de um alerta para fins de dispensa (muda quando a situação muda). */
export function alertSignature(a: AlertItem): string {
  return a.label;
}

async function loadDismissed(): Promise<Dismissed> {
  try {
    const rows = await getDb().select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [DISMISS_DB_KEY]
    );
    return rows.length > 0 ? (JSON.parse(rows[0].value) as Dismissed) : {};
  } catch {
    return {};
  }
}

async function saveDismissed(map: Dismissed): Promise<void> {
  await getDb().execute(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [DISMISS_DB_KEY, JSON.stringify(map)]
  );
}

/** Dispensa um alerta até que sua assinatura mude (X do alerta). */
export async function dismissAlertUntilChange(key: string, signature: string): Promise<void> {
  const map = await loadDismissed();
  map[key] = signature;
  await saveDismissed(map);
  window.dispatchEvent(new Event(DATA_CHANGED));
}

/**
 * Aplica as dispensas "até mudar": esconde quem segue idêntico, limpa quem
 * mudou ou sumiu (pra reaparecer ao disparar de novo). Mantém o storage enxuto.
 */
export async function filterDismissed(alerts: AlertItem[]): Promise<AlertItem[]> {
  const map = await loadDismissed();
  if (Object.keys(map).length === 0) return alerts;
  const present = new Set(alerts.map((a) => a.key));
  let changed = false;
  // Condição não está mais ativa → limpa a dispensa (volta ao disparar de novo).
  for (const key of Object.keys(map)) {
    if (!present.has(key)) {
      delete map[key];
      changed = true;
    }
  }
  const out = alerts.filter((a) => {
    const sig = map[a.key];
    if (sig === undefined) return true;
    if (sig === alertSignature(a)) return false; // dispensado e inalterado → some
    delete map[a.key]; // mudou → reaparece e limpa a dispensa
    changed = true;
    return true;
  });
  if (changed) await saveDismissed(map).catch(() => {});
  return out;
}
