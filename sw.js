/* يخزّن ملفات الموقع ليعمل بلا إنترنت بعد أول فتح */
const V = 'jard-v18';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm', 'vendor/xlsx.full.min.js', 'vendor/exceljs.bare.min.js', 'vendor/zxing-wasm-reader.js', 'vendor/zxing_reader.wasm',
  'js/util.js', 'js/store.js', 'js/logic.js', 'js/ui.js', 'js/views.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// الملفات من الكاش فوراً (فتح سريع) ثم تحديثها بالخلفية؛ وعند صدور نسخة جديدة يُستبدل الكاش كله
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(V).then((c) => c.match(e.request, { ignoreSearch: true }).then((hit) => {
    const net = fetch(e.request).then((r) => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
