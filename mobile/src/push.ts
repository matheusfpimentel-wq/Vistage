import { supabase } from "./supabase";

// Chave pública VAPID (par fica no servidor; esta é pública por natureza).
const VAPID_PUBLIC_KEY =
  "BLd6q9R9AjiQhYLg9X9JMhmaAYQHkyqE_bJDYQZ4MRTHbJuidtekZECAxXGRbSsM2L6zGfKfuREkgAGmVIAw9Qo";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
}

export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(reg && (await reg.pushManager.getSubscription()));
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: "Push não é suportado neste aparelho/navegador." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permissão de notificação negada." };
  const reg = await registration();
  if (!reg) return { ok: false, reason: "Service worker indisponível." };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: u.user?.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent,
    },
    { onConflict: "user_id,endpoint" }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function sendTestPush(): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase.functions.invoke("send-push", { body: {} });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// ── Modo foco: notificação persistente local (app aberto) ────────────────────
export async function buildFocusBody(): Promise<string> {
  const { data } = await supabase
    .from("agenda_mirror")
    .select("title")
    .eq("source", "task")
    .order("start_at")
    .limit(3);
  const tasks = (data ?? []) as { title: string }[];
  if (!tasks.length) return "Sem pendências marcadas. Foco total.";
  return "Pendências: " + tasks.map((t) => t.title).join(" · ");
}

export async function showFocusNotification(
  body: string,
  opts?: { title?: string; renotify?: boolean }
): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  // tag "foco" mantém UMA notificação que vai sendo atualizada (tempo correndo);
  // renotify só quando vence o tempo previsto, pra dar o alerta. data.url faz o
  // toque trazer o app de volta (o service worker foca a janela).
  // renotify é válido em runtime (o service worker usa), mas falta no lib.dom.
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    tag: "foco",
    renotify: opts?.renotify ?? false,
    requireInteraction: true,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: "./" },
  };
  await reg.showNotification(opts?.title ?? "Modo foco ativo", options);
}

export async function clearFocusNotification(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const notes = await reg.getNotifications({ tag: "foco" });
  notes.forEach((n) => n.close());
}
