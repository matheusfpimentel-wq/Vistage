import { useEffect } from "react";
import { computeAlerts } from "@/modules/revisao/alerts";
import { filterSnoozed } from "@/modules/revisao/snooze";
import { loadWeekStats } from "@/modules/revisao/api";
import { DATA_CHANGED } from "@/lib/events";

/**
 * Notificações locais do sistema para alertas CRÍTICOS.
 *
 * Usa a Web Notification API (disponível no webview quando o app está aberto).
 * Para push real com o app FECHADO é preciso o backend na nuvem — veja
 * docs/cloud-push.md. O núcleo de decisão (`computeAlerts`) é o mesmo aqui e lá.
 */

const NOTIFIED_KEY = "vistage:notified-alerts";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Pede permissão ao usuário. Retorna true se concedida. */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const p = await Notification.requestPermission();
    if (p === "granted") void syncAlertNotifications();
    return p === "granted";
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
 * Dispara notificação para cada alerta crítico que ainda não foi notificado.
 * Alertas dispensados (snooze) são ignorados. Mantém só as chaves ativas, então
 * um alerta que some e volta dispara de novo.
 */
async function syncAlertNotifications(): Promise<void> {
  if (notificationPermission() !== "granted") return;
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
      new Notification("Vistage — alerta", { body: a.label, tag: a.key });
    } catch {
      /* webview pode bloquear; ignora */
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
