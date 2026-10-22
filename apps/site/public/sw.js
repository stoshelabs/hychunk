// Keeps the site's own files (page, scripts, styles, icons) in the browser so a repeat visit opens at once and works offline.
// Game data packs (`gamedata/`) have their own cache (see src/gameData.ts); anything not ours is left alone.
const CACHE = 'hychunk-shell-1';
const scope = new URL(self.registration.scope).pathname;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            for (const key of await caches.keys())
                if (key.startsWith('hychunk-shell-') && key !== CACHE) await caches.delete(key);
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
    const path = url.pathname.slice(scope.length);
    if (path.startsWith('gamedata/') || path.startsWith('__') || path === 'sw.js') return;

    // pages: the network first (a new deploy shows at once), the saved copy when offline
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(async (res) => {
                    if (res.ok) await (await caches.open(CACHE)).put(url.pathname, res.clone());
                    return res;
                })
                .catch(
                    async () => (await caches.match(url.pathname)) ?? (await caches.match(scope)) ?? Response.error()
                )
        );
        return;
    }

    // everything else: the saved copy at once, renewed behind the scenes
    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const hit = await cache.match(request);
            const fresh = fetch(request)
                .then((res) => {
                    if (res.ok) void cache.put(request, res.clone());
                    return res;
                })
                .catch(() => hit ?? Response.error());
            return hit ?? fresh;
        })
    );
});
