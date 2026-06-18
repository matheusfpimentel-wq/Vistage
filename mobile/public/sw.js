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
