import { useEffect } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { computeAlerts } from "@/modules/revisao/alerts";
import { filterSnoozed } from "@/modules/revisao/snooze";
import { loadWeekStats } from "@/modules/revisao/api";
import { DATA_CHANGED } from "@/lib/events";

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
    return (await isPermissionGranted()) ? "granted" : "default";
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
    if (granted) void syncAlertNotifications();
    return granted;
  } catch {
    return false;
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
    granted = await isPermissionGranted();
  } catch {
    return;
  }
  if (!granted) return;

  let critical;
  try {
    const stats = await loadWeekStats();
    critical = (await filterSnoozed(computeAlerts(stats))).filter((a) => a.critical);
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
