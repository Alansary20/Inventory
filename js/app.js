/* تشغيل التطبيق: التبويبات، الإحصاءات، الوضع الليلي، النسخ الاحتياطي */
'use strict';

const TABS = [
  ['scan', 'المسح'], ['inventory', 'الجرد'], ['stock', 'الرصيد'],
  ['compare', 'المقارنة'], ['products', 'المنتجات'], ['prices', 'الأسعار'],
];

(async function main() {
  const boot = document.getElementById('boot');
  try { await Store.init(); } catch (e) { boot.textContent = 'تعذّر تشغيل قاعدة البيانات: ' + e.message; throw e; }

  const stats = {
    products: h('b', null, '0'), items: h('b', null, '0'), ops: h('b', null, '0'),
  };
  const app = {
    views: {}, current: null,
    changed() { updateStats(); for (const k in app.views) if (k !== app.current) app.views[k].dirty = true; },
    stopOthers(except) { for (const k in app.views) { const v = app.views[k]; if (v.el !== except && v.stop) v.stop(); } },
  };
  function updateStats() {
    stats.products.textContent = Store.countProducts();
    stats.items.textContent = Store.countInventory();
    stats.ops.textContent = Store.countScanLog();
  }

  const tabBar = h('nav', { class: 'tabs' });
  const main = h('main');
  const stat = (l, el) => h('div', { class: 'stat' }, el, h('span', null, l), h('i'));
  // الافتراضي فاتح مثل التطبيق؛ زر ☀️/🌙 يبدّل ويُحفظ
  const applyTheme = (th) => { document.documentElement.dataset.theme = th; themeBtn.textContent = th === 'dark' ? '☀️' : '🌙'; };
  const themeBtn = h('button', { class: 'hbtn start', 'aria-label': 'الوضع الليلي', onclick: () => {
    const th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', th); applyTheme(th);
  } }, '🌙');
  applyTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
  const menuBtn = h('button', { class: 'hbtn end', 'aria-label': 'النسخ الاحتياطي', onclick: backupMenu }, '☰');

  function backupMenu() {
    dialog({ title: 'النسخ الاحتياطي', icon: 'download', stack: true, message: 'كل بياناتك محفوظة داخل هذا المتصفح فقط. احفظ نسخة احتياطية لتنقلها إلى جهاز آخر أو لتحميها من الضياع.',
      buttons: [
        { label: 'حفظ نسخة احتياطية', icon: 'download', kind: 'primary', onclick: () => {
          const blob = new Blob([Store.exportDb()], { type: 'application/octet-stream' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `jard-backup_${dateStr()}.db` }); document.body.append(a); a.click(); a.remove();
          toast('تم حفظ النسخة الاحتياطية');
        } },
        { label: 'استعادة نسخة', icon: 'upload', onclick: async () => {
          const f = await pickFiles(false); if (!f.length) return;
          if (!(await confirmDlg('استعادة نسخة', 'سيتم استبدال كل البيانات الحالية بمحتوى النسخة. متابعة؟', 'استعادة'))) return;
          try { await Store.importDb(await f[0].arrayBuffer()); Object.values(app.views).forEach((v) => v.refresh()); updateStats(); toast('تمت الاستعادة'); }
          catch (e) { toast('الملف ليس نسخة احتياطية صالحة'); }
        } },
        { label: 'إغلاق' },
      ] });
  }

  function show(key) {
    app.current = key;
    for (const k in app.views) if (k !== key && app.views[k].stop) app.views[k].stop();
    if (!app.views[key]) { const nv = Views[key](app); nv.dirty = false; app.views[key] = nv; main.append(nv.el); }
    const v = app.views[key];
    if (v.dirty) { v.refresh(); v.dirty = false; }
    for (const k in app.views) app.views[k].el.style.display = k === key ? '' : 'none';
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === key));
    localStorage.setItem('tab', key);
    scrollTo(0, 0);
  }
  for (const [key, label] of TABS) {
    tabBar.append(h('button', { 'data-k': key, class: 't-' + key, onclick: () => show(key) }, h('span', { class: 'ic' }, ico(key)), h('span', { class: 'lb' }, label)));
  }
  document.getElementById('app').append(
    h('header', null, themeBtn, h('h1', null, 'جرد المخزون'), menuBtn),
    h('div', { class: 'stats' }, stat('إجمالي المنتجات', stats.products), stat('أصناف مجرودة', stats.items), stat('عمليات الجرد', stats.ops)),
    tabBar, main);
  boot.remove();
  updateStats();
  show(localStorage.getItem('tab') && app.views[localStorage.getItem('tab')] ? localStorage.getItem('tab') : 'scan');
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller; let reloaded = false;
    // عند صدور نسخة جديدة نعيد التحميل مرة واحدة لتظهر فوراً
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
