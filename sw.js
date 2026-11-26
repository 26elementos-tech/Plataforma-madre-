/* Plataforma Madre · modo instalado (service worker)
   - La app (index.html): primero internet, y si no hay señal, la copia guardada.
     Así siempre recibes la versión nueva cuando hay conexión.
   - Librerías (Supabase, generador de PDF): se guardan la primera vez y se usan desde el teléfono.
   - Los datos (Supabase) NO pasan por aquí: los maneja la app con su propia cola sin conexión. */
const CACHE = "plataforma-madre-v2";
const LIBS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
];
// Si la red tarda más que esto en entregar la app, se abre la copia guardada (y la nueva se guarda en segundo plano).
const ESPERA_RED_MS = 4000;

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

  // La app: primero internet (versión más nueva). Si no hay señal o tarda más de 4 s, la copia guardada.
  // Solo la app (carpeta raíz o index.html). Otras páginas del sitio, como checkup-medico.html, pasan directo.
  if (url.origin === location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith("index.html"))) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const guardada = (await c.match("./")) || (await c.match(req));
      const red = fetch(req, {cache: "no-store"}).then(fresh => {
        if (fresh && fresh.ok) c.put("./", fresh.clone());
        return fresh;
      });
      if (guardada) {
        red.catch(() => {}); // si la red responde tarde, igual actualiza la copia para la próxima vez
        const espera = new Promise(res => setTimeout(() => res(null), ESPERA_RED_MS));
        try { const r = await Promise.race([red, espera]); if (r && r.ok) return r; } catch (err) {}
        return guardada;
      }
      try { return await red; }
      catch (err) { return new Response("Sin conexión y sin copia guardada. Abre la app una vez con internet.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}}); }
    })());
    return;
  }

  // Librerías del CDN: desde el teléfono; si no están, de internet y se guardan.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "unpkg.com" || url.hostname === "cdnjs.cloudflare.com") {
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
