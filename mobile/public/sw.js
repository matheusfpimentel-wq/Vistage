// Service worker mínimo: instala na hora e faz network-first com fallback de
// cache (suficiente pra instalar como PWA e abrir offline a casca do app).
const CACHE = "vistage-mobile-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Não intercepta chamadas à API do Supabase — sempre rede.
  if (req.url.includes("supabase.co")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || Promise.reject("offline")))
  );
});

// ── Web push ────────────────────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: "Vistage", body: e.data ? e.data.text() : "" };
  }
  const title = data.title || "Vistage";
  const options = {
    body: data.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.tag || "vistage",
    renotify: true,
    data: { url: data.url || "./" },
    // Foco: notificação persistente (não some sozinha) enquanto o set rola.
    requireInteraction: data.tag === "foco",
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
