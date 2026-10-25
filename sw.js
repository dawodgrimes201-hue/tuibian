/* 蜕变 · Service Worker（网络优先，更新立即生效；语音长期缓存） */
const VERSION = 'tb-offline-20261026014200';
const CACHE_SHELL = VERSION;
const CACHE_AUDIO = 'tb-audio-v1';
const SHELL = ['./', 'index.html', 'style.css', 'data.js', 'coach.js', 'rules.js', 'voice.js', 'app.js',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    // 任一必需文件失败就让 install 失败，保留旧 SW（宁可暂时不更新，也不要留一个残缺外壳）
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_SHELL);
    const ok = (await Promise.all(SHELL.map(u => cache.match(u)))).every(Boolean);
    const keys = await caches.keys();
    if (ok) {
      // 先把旧外壳里可能残留的语音搬到语音缓存，再删旧外壳
      try {
        const audio = await caches.open(CACHE_AUDIO);
        const have = new Set((await audio.keys()).map(r => new URL(r.url).pathname));
        for (const k of keys) {
          if (!k.startsWith('tb-offline-') || k === CACHE_SHELL) continue;
          const old = await caches.open(k);
          for (const req of await old.keys()) {
            const u = new URL(req.url);
            if (!/\.mp3$/.test(u.pathname) || have.has(u.pathname)) continue;
            const res = await old.match(req);
            if (res) { await audio.put(req, res); have.add(u.pathname); }
          }
        }
      } catch (e) {}
      await Promise.all(keys.filter(k => k !== CACHE_SHELL && k !== CACHE_AUDIO).map(k => caches.delete(k)));
    }
    await self.clients.claim();
  })());
});

function cacheVoice(req) {
  return (async () => {
    const cache = await caches.open(CACHE_AUDIO);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) { return new Response('', { status: 504 }); }
  })();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 隐私/实时数据：API 和 reset 不经过缓存
  if (url.pathname.startsWith('/api/') || url.pathname === '/reset') return;
  const isVoiceClip = /\/voice\/(female|male)\/[a-f0-9]+\.mp3$/.test(url.pathname);
  if (isVoiceClip) { event.respondWith(cacheVoice(req)); return; }
  const isManifestJson = url.pathname.endsWith('/voice/manifest.json');
  if (isManifestJson) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_SHELL);
      try { const res = await fetch(req); if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); return res; }
      catch (e) { return (await cache.match(req)) || new Response('{}', { headers: { 'Content-Type': 'application/json' } }); }
    })());
    return;
  }
  // 外壳：网络优先，失败回缓存；导航请求忽略 query（?start=train / ?v= / ?updated=）
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_SHELL);
    try {
      const res = await fetch(req, { cache: 'no-store' });
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const idx = (await cache.match('index.html')) || (await cache.match('./')) || (await cache.match(req, { ignoreSearch: true }));
        if (idx) return idx;
      }
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
      return hit || new Response('离线中', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
  if (event.data && event.data.type === 'clear') {
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('tb-offline-')).map(k => caches.delete(k)))).then(() => event.source && event.source.postMessage({ type: 'cleared' }));
  }
  if (event.data && event.data.type === 'ping' && event.source) event.source.postMessage({ type: 'pong', version: VERSION });
});
