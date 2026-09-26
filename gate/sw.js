// 门电路大脑的离线支持：把页面、代码、单元库与权重清单缓存下来，断网时（飞行模式）照样能打开页面、从本机缓存启动电路。
// 策略：先走网络（联网时总是拿最新版本并刷新缓存），网络失败才用缓存。权重块（chunk-*.bin）不经这里缓存：
// 它们只在第一次搭电路时用到，搭好的电路已存进本机缓存（OPFS），再存一份原始权重只会白占 0.5–0.75 GB。
const CACHE = 'gate-offline-v1';
const skip = u => /\/chunk-[^/]*\.bin(\.gz)?$/.test(u.pathname);
const want = u => (u.origin === self.location.origin && u.pathname.startsWith(new URL('./', self.location).pathname))
  || /\/gate-weights\/manifest(\.gz)?\.json$/.test(u.pathname);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (skip(u) || !want(u)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(r);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) await c.put(r, res.clone());
      return res;
    } catch (err) {
      const hit = await c.match(r, { ignoreVary: true }) || await c.match(u.href.split('?')[0], { ignoreVary: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
