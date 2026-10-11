// Cache the application shell only. Never cache authentication, dog data or photos.
const CACHE = 'dayboard-shell-v1';
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const shell = await fetch('/', { cache: 'reload' });
  if (!shell.ok) throw new Error('Unable to cache application shell');
  const html = await shell.clone().text();
  await cache.put('/', shell);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(match => match[1]);
  await cache.addAll([...new Set(assets), '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!(event.request.mode === 'navigate' || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icon'))) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      // Static module requests may carry Origin while install-time fetches do not.
      // Hosts can emit Vary: Origin; these same-origin public shell assets are identical.
      return await cache.match(event.request, { ignoreVary: true }) || (event.request.mode === 'navigate' ? await cache.match('/', { ignoreVary: true }) : undefined) || new Response('Offline. Reconnect to open Dayboard.', {status: 503});
    }
  })());
});
