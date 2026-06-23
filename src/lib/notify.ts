import { useEffect } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { computeAlerts } from "@/modules/revisao/alerts";
import { getDisabledRuleIds } from "@/modules/revisao/ruleConfig";
import { filterSnoozed } from "@/modules/revisao/snooze";
import { loadWeekStats } from "@/modules/revisao/api";
import { DATA_CHANGED } from "@/lib/events";
import { getDb } from "@/lib/db";

// Lembra a INTENÇÃO do usuário (por máquina, em app_settings). Assim, depois de
// ativar uma vez, o app re-estabelece sozinho a cada boot — sem ficar pedindo
// autorização toda hora.
const PREF_KEY = "notifications_enabled";
async function setNotifPref(on: boolean): Promise<void> {
  try {
    await getDb().execute(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [PREF_KEY, on ? "1" : "0"]
    );
  } catch {
    /* banco não pronto */
  }
}
async function getNotifPref(): Promise<boolean> {
  try {
    const rows = await getDb().select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1",
      [PREF_KEY]
    );
    return rows[0]?.value === "1";
  } catch {
    return false;
  }
}

// No Windows o estado de permissão do plugin de notificação NÃO persiste entre
// aberturas — e o consentimento real fica nas Configurações do Windows, não num
// prompt do app. Por isso, lá, a INTENÇÃO salva pelo usuário é a fonte da
// verdade: sem isso o app voltaria a se achar "sem permissão" a cada abertura.
const IS_WINDOWS =
  typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/**
 * Permissão "efetiva": concedida se o plugin confirma OU — só no Windows — se o
 * usuário já ativou antes (intenção salva). Evita ficar reexibindo "Ativar" e
 * deixando de notificar quando o plugin esquece o estado entre aberturas.
 */
async function effectivelyGranted(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
  } catch {
    /* segue pro fallback */
  }
  return IS_WINDOWS ? await getNotifPref() : false;
}

/**
 * Notificações locais do sistema para alertas CRÍTICOS, via o plugin de
 * notificação do Tauri (a Web Notification API não funciona no webview).
 * Disparam enquanto o app está aberto; push com o app FECHADO precisaria de
 * backend — o núcleo de decisão (`computeAlerts`) é o mesmo aqui e lá.
 */

const NOTIFIED_KEY = "vistage:notified-alerts";

export type NotifPermission = "granted" | "default";

/** Lê a permissão atual (assíncrono — plugin do Tauri). */
export async function checkNotificationPermission(): Promise<NotifPermission> {
  try {
    return (await effectivelyGranted()) ? "granted" : "default";
  } catch {
    return "default";
  }
}

/** Pede permissão ao usuário (mostra o prompt do SO). Retorna true se concedida. */
export async function enableNotifications(): Promise<boolean> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    // Windows: o consentimento real fica nas Configurações do sistema e o estado
    // do plugin não persiste — se o usuário clicou "Ativar", respeitamos a
    // intenção (notificar; quem barra de fato é o Windows, nas Configurações).
    if (!granted && IS_WINDOWS) granted = true;
    if (granted) {
      void setNotifPref(true);
      void syncAlertNotifications();
    }
    return granted;
  } catch {
    return false;
  }
}

/**
 * No boot: se o usuário já ativou notificações antes, re-estabelece SÓ se a
 * permissão do SO ainda estiver de pé — em silêncio, sem clique.
 *
 * Importante: NÃO re-pedimos a permissão automaticamente. Em alguns cenários o
 * SO "esquece" a autorização a cada abertura — no Windows o estado do plugin não
 * persiste; no macOS é clássico via App Translocation (app aberto de dentro do
 * .dmg/Downloads, fora de /Aplicativos) ou sem assinatura Developer ID. Re-pedir
 * ali jogaria o prompt na cara do usuário toda vez. Usamos a permissão "efetiva"
 * (que no Windows confia na intenção salva); se ela cair, o re-ativar fica como
 * ação explícita no sininho.
 */
export async function restoreNotificationPreference(): Promise<void> {
  if (!(await getNotifPref())) return;
  try {
    if (await effectivelyGranted()) {
      void syncAlertNotifications();
    }
  } catch {
    /* best-effort */
  }
}

/** Dispara uma notificação de teste — feedback imediato ao ativar. */
export async function sendTestNotification(): Promise<void> {
  try {
    sendNotification({ title: "Vistage", body: "Notificações ativadas ✓" });
  } catch {
    /* best-effort */
  }
}

function loadNotified(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function saveNotified(keys: string[]): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-50)));
}

/**
 * Dispara notificação para cada alerta crítico ainda não notificado.
 * Alertas dispensados (snooze) são ignorados. Mantém só as chaves ativas, então
 * um alerta que some e volta dispara de novo.
 */
async function syncAlertNotifications(): Promise<void> {
  let granted = false;
  try {
    granted = await effectivelyGranted();
  } catch {
    return;
  }
  if (!granted) return;

  let critical;
  try {
    const stats = await loadWeekStats();
    critical = (await filterSnoozed(computeAlerts(stats, undefined, getDisabledRuleIds()))).filter((a) => a.critical);
  } catch {
    return;
  }
  const notified = new Set(loadNotified());
  const currentKeys = critical.map((a) => a.key);
  for (const a of critical) {
    if (notified.has(a.key)) continue;
    try {
      sendNotification({ title: "Vistage — alerta", body: a.label });
    } catch {
      /* ignora — best-effort */
    }
  }
  saveNotified(currentKeys);
}

/** Mantém as notificações em dia enquanto o app está aberto. */
export function useAlertNotifications(): void {
  useEffect(() => {
    void syncAlertNotifications();
    const onChange = () => void syncAlertNotifications();
    const interval = setInterval(onChange, 5 * 60_000);
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener(DATA_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, []);
}
