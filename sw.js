/* Plataforma Madre · modo instalado (service worker)
   - La app (index.html): primero internet, y si no hay señal, la copia guardada.
     Así siempre recibes la versión nueva cuando hay conexión.
   - Librerías (Supabase, generador de PDF): se guardan la primera vez y se usan desde el teléfono.
   - Los datos (Supabase) NO pasan por aquí: los maneja la app con su propia cola sin conexión. */
const CACHE = "plataforma-madre-v1";
const LIBS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.add(new Request("./", {cache: "reload"})); } catch (err) {}
    for (const u of LIBS) {
      try { const r = await fetch(u, {mode: "no-cors"}); await c.put(u, r); } catch (err) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("plataforma-madre-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La app: primero internet (versión más nueva), si falla, la guardada.
  if (req.mode === "navigate" || (url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith("index.html")))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const fresh = await fetch(req, {cache: "no-store"});
        if (fresh && fresh.ok) c.put("./", fresh.clone());
        return fresh;
      } catch (err) {
        return (await c.match("./")) || (await c.match(req)) || new Response("Sin conexión y sin copia guardada. Abre la app una vez con internet.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}});
      }
    })());
    return;
  }

  // Librerías del CDN: desde el teléfono; si no están, de internet y se guardan.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "cdnjs.cloudflare.com") {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req.url);
      if (hit) return hit;
      try { const r = await fetch(req); c.put(req.url, r.clone()); return r; }
      catch (err) { return hit || Response.error(); }
    })());
    return;
  }
  // Todo lo demás (Supabase, fotos, etc.) pasa directo.
});
