/* الشاشات الست — نفس ترتيب وتصميم شاشات التطبيق */
'use strict';

const Views = {};
const tfmt = (ts, sec) => { try { return new Date(ts).toLocaleTimeString('ar-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: true }); } catch (e) { return fmtTime(ts); } };
const fieldBtn = (cls, label, onclick, extra) => h('button', { class: 'btn ' + cls, onclick, style: extra || null }, label);
const importCard = (title, fileBtn, mode, processLabel, onProcess) => h('div', { class: 'icard' },
  h('div', { class: 'txt16' }, title), h('div', { style: 'margin-top:10px' }, fileBtn), mode.el,
  h('button', { class: 'btn fill', style: 'margin-top:10px;min-height:50px', onclick: onProcess }, processLabel));
const qtyClass = (q) => q === 0 ? 'zero' : q <= 5 ? 'warn' : '';

// ═════════ المسح ═════════
Views.scan = (app) => {
  const root = h('div', { class: 'view' });
  let delay = +(localStorage.getItem('delay') || 1500), lastScanTime = 0, locked = false;
  let pending = null, pendingCount = 0, pendingTimer = null, cameraOn = false, query = '';
  const CONFIRM_HITS = 2, CONFIRM_WINDOW = 700;

  const status = h('div', { class: 'statusc', 'data-kind': 'idle' }, h('i', { class: 'dot' }), h('b', null, 'جاهز للمسح'));
  const setStatus = (kind, text) => { status.dataset.kind = kind; status.lastChild.textContent = text; };
  setStatus('idle', 'جاهز للمسح');
  const flash = (ok) => { status.classList.add(ok ? 'ok' : 'bad'); setTimeout(() => status.classList.remove('ok', 'bad'), 350); };

  const input = h('input', { class: 'inp', type: 'text', autocomplete: 'off', placeholder: 'اكتب باركود أو رقم صنف ثم ⏎', enterkeyhint: 'done',
    onkeydown: (e) => { if (e.key === 'Enter') manualAdd(); } });
  const addBtn = h('button', { class: 'btn fill', style: 'width:52px;min-height:52px;font-size:26px;padding:0;margin-inline-end:8px;flex:none', onclick: () => manualAdd(), 'aria-label': 'إضافة' }, '+');

  const video = h('video', { muted: true, playsinline: true, autoplay: true });
  const zoom = h('input', { type: 'range', min: 1, max: 4, step: 0.1, value: 1, oninput: (e) => scanner.setZoom(+e.target.value) });
  const camBox = h('div', { class: 'cambox', style: 'display:none', onclick: (e) => { if (e.target.tagName !== 'INPUT') scanner.refocus(); } }, video, h('div', { class: 'sline' }),
    h('div', { class: 'zoomrow' }, '🔍', zoom));
  const camBtn = h('button', { class: 'btn fill', style: 'min-height:48px;margin-bottom:10px', onclick: () => toggleCamera() }, 'تشغيل السكانر');

  const delayLbl = h('b', null, (delay / 1000).toFixed(1) + 's');
  const slider = h('input', { type: 'range', min: 500, max: 5000, step: 250, value: delay, oninput: (e) => {
    delay = +e.target.value; delayLbl.textContent = (delay / 1000).toFixed(1) + 's'; localStorage.setItem('delay', delay); lastScanTime = 0; } });
  const logCount = h('span', { class: 'cbadge' }, '0');
  const logHolder = h('div');
  let logList = null;

  const scanner = new CameraScanner(video, (c) => onCameraScan(c), (e) => { cameraOff(); toast(e && e.name === 'NotAllowedError' ? 'مطلوب إذن الكاميرا للمسح' : 'تعذّر تشغيل الكاميرا: ' + (e && e.message || e)); });
  scanner.onReady = (caps) => {
    if (caps.zoom && caps.zoom.max > 1) { zoom.min = Math.max(1, caps.zoom.min || 1); zoom.max = Math.min(4, caps.zoom.max); zoom.step = caps.zoom.step || 0.1; zoom.value = 1; camBox.classList.add('zm'); }
    else camBox.classList.remove('zm');
  };

  async function toggleCamera() {
    if (cameraOn) { cameraOff(); return; }
    if (!CameraScanner.supported()) { toast('المتصفح لا يدعم الكاميرا (يلزم HTTPS)'); return; }
    Sfx.unlock();
    app.stopOthers(root);
    cameraOn = true; camBox.style.display = ''; camBtn.textContent = 'إيقاف السكانر'; setStatus('ready', 'جاهز للمسح');
    await scanner.start();
  }
  function cameraOff() { scanner.stop(); cameraOn = false; camBox.style.display = 'none'; camBtn.textContent = 'تشغيل السكانر'; camBox.classList.remove('zm'); }

  function manualAdd() {
    const raw = input.value.trim();
    if (!raw) { toast('أدخل باركود أو رقم صنف'); return; }
    lastScanTime = 0; clearTimeout(pendingTimer); pending = null; pendingCount = 0;
    lookupAndAdd(raw.replace(/\.0+$/, '').trim());
    input.value = '';
  }
  function onCameraScan(raw) {
    const code = ScanEngine.sanitize(raw);
    if (!code || locked) return;
    if (code === pending) {
      pendingCount++;
      if (pendingCount >= CONFIRM_HITS) { clearTimeout(pendingTimer); pending = null; pendingCount = 0; lookupAndAdd(code); }
    } else {
      clearTimeout(pendingTimer); pending = code; pendingCount = 1;
      setStatus('confirm', `تأكيد القراءة: ${code}…`);
      pendingTimer = setTimeout(() => { pending = null; pendingCount = 0; if (cameraOn) setStatus('ready', 'جاهز للمسح'); }, CONFIRM_WINDOW);
    }
  }
  function lookupAndAdd(raw) {
    const code = ScanEngine.sanitize(raw);
    if (!code) { toast('كود غير صالح'); return; }
    const now = Date.now(), elapsed = now - lastScanTime;
    if (locked) { setStatus('locked', 'جاهز للمسح'); return; }
    if (elapsed < delay) { setStatus('locked', `⏳ ${((delay - elapsed) / 1000).toFixed(1)}s`); return; }
    locked = true; lastScanTime = now;
    setStatus('scanning', `جاري المعالجة: ${code}`);
    let out;
    try { out = ScanEngine.process(code); } catch (e) { out = null; console.error(e); }
    switch (out && out.kind) {
      case 'FOUND': Sfx.ok(); flash(true); toast('✓ ' + out.name); setStatus('ready', `تم العد: ${out.name}`); break;
      case 'AUTO': Sfx.ok(); flash(true); toast('أُضيف تلقائياً من الرصيد: ' + out.name); setStatus('ready', `تم العد: ${out.name}`); break;
      case 'UNKNOWN': case 'NAME_ONLY': Sfx.bad(); flash(false); toast('غير مسجل: ' + out.code); setStatus('idle', `غير مسجل: ${out.code}`); break;
      case 'CHOOSE': setStatus('idle', 'اختر الصنف المقصود'); showChoices(out.code, out.choices); break;
      default: setStatus('idle', 'جاهز للمسح');
    }
    locked = false;
    reload(); app.changed();
  }
  function showChoices(typed, hits) {
    const box = h('div');
    let dlg;
    for (const x of hits) {
      box.append(h('div', { class: 'choice', onclick: () => { dlg.close(); const o = ScanEngine.addHit(x); Sfx.ok(); toast('✓ ' + o.name); setStatus('ready', `تم العد: ${o.name}`); reload(); app.changed(); } },
        h('b', null, x.name), h('div', { class: 'muted', style: 'font-size:12px' }, [x.itemNo, x.barcode].filter(Boolean).join('  •  '))));
    }
    dlg = dialog({ title: 'اختر الصنف المقصود', icon: 'edit', subtitle: typed, content: box, buttons: [{ label: 'إلغاء' }] });
  }

  function renderRow(r) {
    const isOpen = r.itemCode;
    const act = (cls, label, fn) => h('button', { class: cls, onclick: fn }, label);
    return h('div', { class: 'log' },
      h('div', { class: 'top' }, h('div', { class: 'qtybox' }, r.qty),
        h('div', { class: 'grow' }, h('div', { class: 'nm' }, r.name || '—'), h('div', { class: 'sub' }, `${r.itemCode}  •  ${tfmt(r.timestamp, true)}`))),
      h('div', { class: 'acts' },
        act('a-minus', '−  نقص', () => { if (!Store.logMinus(isOpen)) toast('لا يوجد سجل لهذا الصنف'); else Sfx.down(); reload(); app.changed(); }),
        act('a-edit', '✎  تعديل', async () => { const q = await promptQty('تعديل الكمية', r.qty, r.name); if (q != null && !isNaN(q)) { Store.logSetQty(r.id, q); reload(); app.changed(); } }),
        act('a-plus', '+  زيادة', () => { Store.logPlus(isOpen, r.name, r.barcode); Sfx.up(); reload(); app.changed(); }),
        act('a-del', '🗑', () => { Store.logDelete(r.id); toast('تم الحذف'); reload(); app.changed(); })));
  }
  function reload() {
    logCount.textContent = Store.countScanLog();
    if (!logList) logList = pagedList(logHolder, (l, o) => Store.searchLog(query, l, o), (r) => h('div', { class: 'logwrap', style: 'padding:0' }, renderRow(r)), 'لا توجد مسحات بعد');
    logList.reload();
  }
  async function confirmReset() {
    if (await confirmDlg('مسح الجرد', 'هل تريد حذف الجرد وسجل المسحات؟ لا يمكن التراجع.', 'حذف')) { Store.clearInventoryAndLog(); toast('تم مسح الجرد'); reload(); app.changed(); }
  }

  root.append(h('div', { class: 'vh' },
    status,
    h('div', { class: 'row mb10' }, addBtn, input),
    camBox, camBtn,
    h('div', { class: 'delayrow' }, h('span', null, 'تأخير المسح:'), slider, delayLbl),
    h('button', { class: 'btn danger', style: 'min-height:52px;margin-bottom:14px', onclick: confirmReset }, '🗑  مسح الجرد'),
    h('div', { class: 'ltitle' }, h('span', { class: 't' }, 'سجل المسحات التفصيلي'), logCount),
    searchBox((v) => { query = v; reload(); }, 'ابحث في السجل…')),
    logHolder);
  reload();
  return { el: root, refresh: reload, stop: cameraOff };
};

// ═════════ الجرد ═════════
Views.inventory = (app) => {
  const root = h('div', { class: 'view' });
  let file = null, query = '', list = null;
  const fileBtn = h('button', { class: 'btn', onclick: async () => { const f = await pickFiles(false); if (f.length) { file = f[0]; fileBtn.textContent = file.name; } } }, 'اختر ملف Excel للجرد');
  const mode = modeChips(false, 'تحديث: يحذف الجرد الحالي وسجل المسحات ويستبدله بمحتوى الملف.', 'دمج: يجمع كميات الملف مع الجرد الحالي.');
  const count = h('div', { class: 'count' }), holder = h('div');
  async function doImport() {
    if (!file) { toast('اختر ملفاً أولاً'); return; }
    try {
      const srcs = await readFiles([file]); if (!srcs) return;
      const fields = [{ label: 'الباركود', kind: 'BARCODE' }, { label: 'رقم الصنف', kind: 'ITEM_NO' }, { label: 'اسم المنتج', kind: 'NAME' }, { label: 'الكمية', kind: 'QTY', required: true }, { label: 'آخر مسح', kind: 'LAST_SCAN' }];
      const m = await mapColumns(file.name, srcs[0].rows.slice(0, 30), fields); if (!m) return;
      if (m.cols[0] < 0 && m.cols[1] < 0) { toast('اختر عمود الباركود أو رقم الصنف على الأقل'); return; }
      if (m.cols[3] < 0) { toast('اختر عمود الكمية'); return; }
      const n = importInventoryRows(srcs[0], m.cols, m.noHeader, mode.merge);
      file = null; fileBtn.textContent = 'اختر ملف Excel للجرد';
      toast(n < 0 ? 'لا توجد صفوف صالحة (يلزم باركود أو رقم صنف وكمية أكبر من صفر)' : `تم استيراد ${n} صنف`);
      refresh(); app.changed();
    } catch (e) { toast('تعذّرت قراءة الملف: ' + e.message); }
  }
  function doExport() {
    const inv = Store.allInventory().sort((a, b) => b.timestamp - a.timestamp);
    const rows = inv.map((it) => [it.barcode || (/^\d+$/.test(it.key) ? it.key : ''), it.itemNo || (/^\d+-[\d-]+$/.test(it.key) ? it.key : ''), it.name, it.qty, fmtTime(it.timestamp)]);
    downloadXlsx(`جرد_${dateStr()}.xlsx`, 'الجرد', ['الباركود', 'رقم الصنف', 'الاسم', 'الكمية', 'آخر مسح'], rows, [22, 18, 36, 10, 22]);
    toast(`تم تصدير ${rows.length} منتج`);
  }
  const renderRow = (it) => {
    const itemNo = it.itemNo && it.itemNo !== it.key ? it.itemNo : (it.key.includes('-') ? it.key : '');
    const barcode = it.barcode && it.barcode !== it.key ? it.barcode : (/^\d+$/.test(it.key) ? it.key : '');
    return h('div', { class: 'irow' },
      h('div', { class: 'grow' }, h('b', { class: 'ell nm' }, it.name || '—'),
        !itemNo && !barcode ? h('div', { class: 's11' }, it.key || '—') : null,
        itemNo ? h('div', { class: 's11' }, '🔢 ' + itemNo) : null, barcode ? h('div', { class: 's11' }, '📦 ' + barcode) : null,
        it.timestamp > 0 ? h('div', { class: 's10' }, tfmt(it.timestamp)) : null),
      h('div', { class: 'qbadge ' + qtyClass(it.qty) }, it.qty));
  };
  function refresh() {
    count.textContent = `الأصناف المجرودة (${Store.countInventory()})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchInventory(query, l, o), renderRow, 'لا توجد أصناف مجرودة');
    list.reload();
  }
  root.append(h('div', { class: 'vh' },
    importCard('استيراد الجرد من Excel', fileBtn, mode, 'استيراد الجرد', doImport),
    h('button', { class: 'btn mb10', onclick: doExport }, 'تصدير الجرد'),
    searchBox((v) => { query = v; refresh(); }), count), holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ الرصيد ═════════
Views.stock = (app) => {
  const root = h('div', { class: 'view' });
  let files = [], query = '', list = null;
  const fileBtn = h('button', { class: 'btn', onclick: async () => { const f = await pickFiles(true); if (f.length) { files = f; fileBtn.textContent = `تم اختيار ${f.length} ملف`; } } }, 'اختر ملف Excel');
  const mode = modeChips(false, 'تحديث: يحذف الرصيد القديم للفروع الموجودة في الملف ويستبدله بالجديد (وباقي الفروع كما هي).', 'دمج: يجمع الكميات مع رصيد كل فرع.');
  const count = h('div', { class: 'count' }), holder = h('div');
  const brLbl = h('b', { class: 'grow ell' }, '');
  const brBar = h('div', { class: 'irow', style: 'margin-bottom:10px;align-items:center' }, brLbl,
    h('button', { class: 'btn', style: 'min-height:38px;padding:0 14px;width:auto;flex:none', onclick: () => branchDialog(() => { refresh(); app.changed(); }) }, 'تغيير'));
  async function doImport() {
    if (!files.length) { toast('اختر ملفاً أولاً'); return; }
    try {
      const srcs = await readFiles(files); if (!srcs) return;
      const fields = [{ label: 'رقم الصنف', kind: 'ITEM_NO' }, { label: 'الباركود', kind: 'BARCODE' }, { label: 'اسم المنتج', kind: 'NAME' }, { label: 'الكمية', kind: 'QTY', required: true }, { label: 'الفرع (اختياري)', kind: 'BRANCH' }];
      const m = await mapColumns(files.map((f) => f.name).join(', '), srcs[0].rows.slice(0, 30), fields); if (!m) return;
      if (m.cols[0] < 0 && m.cols[1] < 0) { toast('اختر عمود الباركود أو رقم الصنف على الأقل'); return; }
      if (m.cols[3] < 0) { toast('اختر عمود الكمية'); return; }
      const pd = progressDialog('معالجة ورفع الرصيد');
      let n;
      try { n = await importStock(srcs, m.cols, m.noHeader, mode.merge, (f, l) => pd.set(f, l)); } finally { pd.close(); }
      files = []; fileBtn.textContent = 'اختر ملف Excel';
      toast(`تم تحديث الرصيد (${n.records} سجل، ${n.branches} فرع)`); refresh(); app.changed();
    } catch (e) { toast('تعذّرت قراءة الملف: ' + e.message); }
  }
  function doExport() {
    const all = [...Store.allStock()].sort((a, b) => (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : a.key < b.key ? -1 : 1));
    downloadXlsx(`رصيد_${dateStr()}.xlsx`, 'الرصيد', ['رقم الصنف', 'الاسم', 'كمية الرصيد', 'الفرع'], all.map((s) => [s.key, s.name, s.qty, s.branch]), [18, 36, 16, 20]);
    toast(`تم تصدير ${all.length} منتج`);
  }
  const renderRow = (r) => h('div', { class: 'irow' },
    h('div', { class: 'grow' }, h('b', { class: 'ell nm' }, r.name || '—'), h('div', { class: 's10' }, r.key)),
    h('div', { class: 'qbadge ' + qtyClass(r.qty) }, fmtQty(r.qty)));
  function refresh() {
    brLbl.textContent = '🏬 الفرع: ' + Store.getBranch();
    count.textContent = `الرصيد (${Store.countStock(Store.getBranch())})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchStock(Store.getBranch(), query, l, o), renderRow, 'لا توجد بيانات رصيد');
    list.reload();
  }
  root.append(h('div', { class: 'vh' },
    importCard('رفع ملف رصيد النظام', fileBtn, mode, 'معالجة ورفع الرصيد', doImport),
    h('button', { class: 'btn mb10', onclick: doExport }, 'تصدير الرصيد'),
    h('button', { class: 'btn danger mb10', onclick: async () => {
      if (!await confirmDlg('حذف كل الرصيد', 'سيتم حذف رصيد كل الفروع نهائياً. هل أنت متأكد؟', 'حذف')) return;
      Store.clearStock(); Store.setBranch(Store.DEFAULT_BRANCH); toast('تم حذف كل الرصيد'); refresh(); app.changed();
    } }, 'حذف كل الرصيد'),
    brBar,
    searchBox((v) => { query = v; refresh(); }), count), holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ المقارنة ═════════
Views.compare = (app) => {
  const root = h('div', { class: 'view' });
  let filter = 'all', query = '', data = null, shown = [], limit = 60;
  const V = { neutral: 'v-neutral', inc: 'v-green', dec: 'v-red', match: 'v-blue', scanned: 'v-amber', diff: 'v-violet' };
  const mkStat = (cls, icon, label) => { const num = h('div', { class: 'num' }, '0'); return { num, el: h('div', { class: 'cs ' + cls }, h('div', { class: 'ib' }, ico(icon)), num, h('div', { class: 'lab' }, label)) }; };
  const sRef = mkStat(V.neutral, 'products', 'الرصيد'), sInc = mkStat(V.inc, 'up', 'زيادة ↑'), sDec = mkStat(V.dec, 'down', 'نقص ↓'),
    sMatch = mkStat(V.match, 'match', 'مطابق ✓'), sScan = mkStat(V.amber || V.scanned, 'bar', 'المجرود'), sDiff = mkStat(V.diff, 'scale', 'الفرق ⚖');
  const FLT = [['all', V.neutral, 'all', 'الكل'], ['inc', V.inc, 'up', 'زيادة'], ['dec', V.dec, 'down', 'نقص'], ['match', V.match, 'match', 'مطابق'], ['scanned', V.scanned, 'bar', 'مجرود']];
  const fbar = h('div', { class: 'fbar' });
  const paintFilters = () => fbar.replaceChildren(...FLT.map(([k, cls, ic, l]) => h('button', { class: `fb ${cls}` + (filter === k ? ' on' : ''), onclick: () => { filter = k; limit = 60; paintFilters(); apply(); } },
    h('div', { class: 'ib' }, ico(ic)), h('div', { class: 'lb' }, l))));
  const holder = h('div'), emptyEl = h('div', { class: 'empty', style: 'display:none' }, 'لا توجد بيانات للمقارنة');
  const cmpBr = h('b', { class: 'grow ell' }, '');
  const cmpBar = h('div', { class: 'irow', style: 'margin-bottom:10px;align-items:center' }, cmpBr,
    h('button', { class: 'btn', style: 'min-height:38px;padding:0 14px;width:auto;flex:none', onclick: () => branchDialog(() => { refresh(); app.changed(); }) }, 'تغيير'));
  const more = h('button', { class: 'btn more', onclick: () => { limit += 60; paint(); } }, 'عرض المزيد');
  function apply() {
    if (!data) return;
    const nq = Ar.norm(query), lq = query.toLowerCase();
    shown = data.rows.filter((r) => {
      if (filter === 'inc' && !(r.diff > 0)) return false;
      if (filter === 'dec' && !(r.diff < 0)) return false;
      if (filter === 'match' && !(r.diff === 0 && r.qi > 0)) return false;
      if (filter === 'scanned' && !(r.qi > 0)) return false;
      if (!query) return true;
      return Ar.norm(r.name).includes(nq) || r.itemNo.toLowerCase().includes(lq) || r.barcode.toLowerCase().includes(lq) || r.key.toLowerCase().includes(lq);
    });
    sRef.num.textContent = data.stockLen; sInc.num.textContent = data.inc; sDec.num.textContent = data.dec;
    sMatch.num.textContent = data.match; sScan.num.textContent = data.invLen; sDiff.num.textContent = fmtQty(shown.reduce((a, r) => a + r.diff, 0));
    emptyEl.style.display = shown.length ? 'none' : '';
    paint();
  }
  function paint() {
    holder.replaceChildren(...shown.slice(0, limit).map((r) => {
      const pos = r.diff > 0, neg = r.diff < 0, zero = r.diff === 0 && r.qi > 0;
      const clr = pos ? '#10B981' : neg ? '#FB7185' : zero ? '#60A5FA' : 'var(--muted)';
      const icon = pos ? '⬆' : neg ? '⬇' : zero ? '✓' : '—';
      return h('div', { class: 'wrap' }, h('div', { class: 'irow' },
        h('div', { class: 'grow' }, h('b', { class: 'ell nm' }, r.name || '—'), h('div', { class: 's10' }, r.itemNo || r.barcode || '—'),
          h('div', { class: 's11' }, `الرصيد ${fmtQty(r.qs)} → المجرود ${fmtQty(r.qi)}`)),
        h('div', { class: 'cbadge2', style: `--c:${clr}` }, `${icon} ${pos ? '+' : ''}${fmtQty(r.diff)}`)));
    }));
    more.style.display = shown.length > limit ? '' : 'none';
  }
  function refresh() { cmpBr.textContent = '🏬 المقارنة مع رصيد فرع: ' + Store.getBranch(); data = buildCompare(); limit = 60; apply(); }
  function doExport() {
    const lst = data ? data.rows : buildCompare().rows;
    const kindOf = (r) => r.diff > 0 ? 'inc' : r.diff < 0 ? 'dec' : (r.qi > 0 ? 'match' : 'none');
    const kinds = lst.map(kindOf);
    const lbl = { inc: '⬆ زيادة', dec: '⬇ نقص', match: '✓ مطابق', none: '— —' };
    const rows = lst.map((r, i) => [r.barcode, r.itemNo, r.name, r.qs, r.qi, (r.diff > 0 ? '+' : '') + fmtQty(r.diff), lbl[kinds[i]]]);
    downloadXlsx(`مقارنة_الجرد_${dateStr()}.xlsx`, 'المقارنة', ['الباركود', 'رقم الصنف', 'الاسم', 'الفعلي', 'المجرود', 'الفرق', 'الحالة'], rows, [20, 18, 40, 12, 12, 12, 12],
      { header: X_CMP.header, rowStyle: (i) => X_CMP[kinds[i]], boldCols: [5, 6], frozen: true });
    toast(`تم تصدير ${rows.length} منتج`);
  }
  root.append(h('div', { class: 'vh' },
    cmpBar,
    h('div', { class: 'cgrid' }, sRef.el, sInc.el, sDec.el), h('div', { class: 'cgrid' }, sMatch.el, sScan.el, sDiff.el),
    fbar,
    h('button', { class: 'btn mb10', onclick: doExport }, 'تصدير المقارنة'),
    h('div', { style: 'margin-bottom:6px' }, searchBox((v) => { query = v; limit = 60; apply(); }, '🔍 بحث...', false)),
    emptyEl), holder, more);
  paintFilters();
  refresh();
  return { el: root, refresh };
};

// ═════════ المنتجات ═════════
Views.products = (app) => {
  const root = h('div', { class: 'view' });
  let files = [], query = '', list = null;
  const fileBtn = h('button', { class: 'btn', onclick: async () => { const f = await pickFiles(true); if (f.length) { files = f; fileBtn.textContent = `تم اختيار ${f.length} ملف`; } } }, 'اختر ملف Excel أو CSV');
  const mode = modeChips(false, 'تحديث: يحذف المنتجات الحالية ويستبدلها بمحتوى الملف.', 'دمج: يضيف الجديد ويحدّث الموجود دون حذف.');
  const count = h('div', { class: 'count' }), holder = h('div');
  async function doImport() {
    if (!files.length) { toast('اختر ملفاً أولاً'); return; }
    try {
      const srcs = await readFiles(files); if (!srcs) return;
      const fields = [{ label: 'الباركود', kind: 'BARCODE' }, { label: 'رقم الصنف', kind: 'ITEM_NO' }, { label: 'اسم المنتج', kind: 'NAME' }, { label: 'السعر الأساسي', kind: 'PRICE_ORIG' }, { label: 'السعر بعد الخصم', kind: 'PRICE_SALE' }];
      const m = await mapColumns(files.map((f) => f.name).join(', '), srcs[0].rows.slice(0, 30), fields); if (!m) return;
      if (m.cols[0] < 0 && m.cols[1] < 0) { toast('اختر عمود الباركود أو رقم الصنف على الأقل'); return; }
      const map = { barcode: m.cols[0], itemNo: m.cols[1], name: m.cols[2], priceOrig: m.cols[3], priceSale: m.cols[4], noHeader: m.noHeader };
      const merge = mode.merge, pd = progressDialog('جاري رفع المنتجات…');
      let r;
      try { r = await ProductImporter.run(srcs, map, merge, 'بدون اسم', (f, l) => pd.set(f, l)); Store.reconcile(unknownLabels()); } finally { pd.close(); }
      files = []; fileBtn.textContent = 'اختر ملف Excel أو CSV';
      toast(`تمت إضافة ${r.added}، و${merge ? 'دمج' : 'تحديث'} ${r.updated}، ورفض ${r.skipped}`, 6000);
      refresh(); app.changed();
    } catch (e) { toast('تعذّرت قراءة الملف: ' + e.message); console.error(e); }
  }
  function doExport() {
    const all = [...Store.allProducts()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    downloadXlsx(`منتجات_${dateStr()}.xlsx`, 'المنتجات', ['الباركود', 'رقم الصنف', 'الاسم', 'السعر الأساسي', 'السعر بعد الخصم'],
      all.map((p) => [allBarcodes(p).join(', '), p.itemNo, p.name, p.priceOrig, p.priceSale !== 0 ? p.priceSale : p.priceOrig]), [22, 18, 40, 16, 16]);
    toast(`تم تصدير ${all.length} منتج`);
  }
  function editProduct(p) {
    const isNew = !p;
    const cur = p || { id: uuid(), barcode: '', itemNo: '', name: '', altBarcodes: '', priceOrig: 0, priceSale: 0, sourceId: 0 };
    const f = {
      barcode: h('input', { class: 'inp', value: cur.barcode }), itemNo: h('input', { class: 'inp', value: cur.itemNo }),
      name: h('input', { class: 'inp', value: cur.name }), alt: h('input', { class: 'inp', value: cur.altBarcodes }),
      orig: h('input', { class: 'inp', value: isNew ? '' : fmtQty(cur.priceOrig), inputmode: 'decimal' }), sale: h('input', { class: 'inp', value: isNew ? '' : fmtQty(cur.priceSale), inputmode: 'decimal' }),
    };
    const fld = (l, el) => h('div', null, h('div', { class: 'fld-l' }, l), el);
    const buttons = [];
    buttons.push({ label: 'حفظ', kind: 'primary', keep: true, onclick: (close) => {
      const [b, i] = Codes.fix(cleanCode(f.barcode.value), cleanCode(f.itemNo.value));
      if (!b && !i) { toast('أدخل الباركود أو رقم الصنف'); return; }
      const oN = parseNumber(f.orig.value) ?? 0, sN = parseNumber(f.sale.value);
      Store.upsertProducts([{ ...cur, barcode: b, itemNo: i, name: f.name.value.trim(), altBarcodes: splitCodes(f.alt.value).map(cleanCode).filter(Boolean).join(','), priceOrig: oN, priceSale: sN ?? oN }]);
      close(); toast('تم الحفظ'); refresh(); app.changed();
    } });
    if (!isNew) buttons.push({ label: 'حذف', kind: 'danger', onclick: () => { Store.deleteProduct(cur.id); toast('تم الحذف'); refresh(); app.changed(); } });
    buttons.push({ label: 'إلغاء' });
    dialog({ title: isNew ? 'إضافة منتج' : 'تعديل المنتج', icon: 'edit', scroll: true, buttons,
      content: h('div', null, fld('الباركود', f.barcode), fld('رقم الصنف', f.itemNo), fld('اسم المنتج', f.name), fld('السعر الأساسي', f.orig), fld('السعر بعد الخصم', f.sale), fld('باركودات إضافية (مفصولة بفاصلة)', f.alt)) });
  }
  const renderRow = (p) => {
    const sale = p.priceSale || p.priceOrig, both = p.priceOrig && p.priceSale && p.priceOrig !== p.priceSale;
    const pct = both ? Math.round((1 - p.priceSale / p.priceOrig) * 100) : 0;
    return h('div', { class: 'pcard', onclick: () => editProduct(p) },
      h('div', { class: 'n' }, p.name),
      p.barcode ? h('div', { class: 'k' }, 'الباركود: ' + p.barcode) : null,
      p.itemNo ? h('div', { class: 'k' }, 'رقم الصنف: ' + p.itemNo) : null,
      p.priceOrig || p.priceSale ? h('div', { class: 'pr' }, h('b', null, fmtQty(sale)), both ? h('s', null, fmtQty(p.priceOrig)) : null,
        both ? h('em', null, pct >= 0 ? `-${pct}%` : `+${-pct}%`) : null) : null);
  };
  function refresh() {
    count.textContent = `المنتجات (${Store.countProducts()})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchProducts(query, l, o), renderRow, 'لا توجد منتجات بعد');
    list.reload();
  }
  const half = (cls, label, fn, side) => h('button', { class: 'btn ' + cls, style: `flex:1;width:auto;margin-inline-${side}:4px;min-width:0`, onclick: fn }, label);
  root.append(h('div', { class: 'vh' },
    importCard('رفع ملف قائمة المنتجات مع الباركود والسعر', fileBtn, mode, 'معالجة ورفع المنتجات', doImport),
    h('div', { class: 'row mb8' }, half('', 'تصدير المنتجات', doExport, 'end'), half('', 'إضافة منتج', () => editProduct(null), 'start')),
    h('div', { class: 'row mb10' },
      half('', 'دمج المنتجات المكررة', async () => { const n = ProductImporter.dedupe(); toast(`تم حذف ${n} منتج مكرر`); refresh(); app.changed(); }, 'end'),
      half('danger', 'مسح كل المنتجات', async () => { if (await confirmDlg('مسح كل المنتجات', 'هل تريد حذف كل المنتجات؟ لا يمكن التراجع عن ذلك.', 'حذف')) { Store.clearProducts(); toast('تم مسح كل المنتجات'); refresh(); app.changed(); } }, 'start')),
    searchBox((v) => { query = v; refresh(); }, 'ابحث بالاسم أو الباركود أو رقم الصنف', false), count), holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ الأسعار ═════════
Views.prices = (app) => {
  const root = h('div', { class: 'view' });
  let type = 'barcode', cameraOn = false, lastMiss = '', lastCode = '', lastCodeAt = 0, lastScan = 0, shownN = 50;
  const HINT = { barcode: 'أدخل الباركود…', code: 'أدخل رقم الصنف…', name: 'أدخل اسم المنتج…' };
  const input = h('input', { class: 'inp sm', type: 'text', autocomplete: 'off', placeholder: HINT.barcode, enterkeyhint: 'search',
    onkeydown: (e) => { if (e.key === 'Enter') { doSearch(false); input.blur(); } },
    oninput: () => { clearTimeout(live); live = setTimeout(() => { const v = input.value.trim(); if ((type === 'name' && v.length >= 2) || (type === 'code' && v.length >= 3)) doSearch(false); }, 180); } });
  let live = null;
  const typeRow = h('div', { class: 'types' });
  const video = h('video', { muted: true, playsinline: true, autoplay: true });
  const camBox = h('div', { class: 'cambox ratio', style: 'display:none', onclick: () => scanner.refocus() }, video, h('div', { class: 'sline' }));
  const camBtn = h('button', { class: 'btn fill', style: 'flex:1.6;width:auto;margin-inline-end:8px', onclick: () => toggleCamera() }, '📷  تشغيل السكانر');
  const result = h('div', { style: 'margin-top:10px' });
  const listCount = h('span', { class: 'cbadge', style: 'font-size:14px' }, '0'), listHolder = h('div'), emptyEl = h('div', { class: 'empty', style: 'display:none' }, 'لا توجد منتجات بعد');
  const scanner = new CameraScanner(video, (c) => onScan(c), (e) => { cameraOff(); toast(e && e.name === 'NotAllowedError' ? 'مطلوب إذن الكاميرا للمسح' : 'تعذّر تشغيل الكاميرا: ' + (e && e.message || e)); });

  const setType = (k) => { type = k; input.placeholder = HINT[k]; paintTypes(); };
  const paintTypes = () => typeRow.replaceChildren(...[['barcode', 'باركود'], ['code', 'رقم الصنف'], ['name', 'اسم المنتج']].map(([k, l]) =>
    h('button', { class: 'btn chip chip42' + (type === k ? ' on' : ''), style: 'flex:1;min-height:42px', onclick: () => setType(k) }, l)));
  async function toggleCamera() {
    if (cameraOn) { cameraOff(); return; }
    if (!CameraScanner.supported()) { toast('المتصفح لا يدعم الكاميرا (يلزم HTTPS)'); return; }
    Sfx.unlock(); app.stopOthers(root);
    cameraOn = true; camBox.style.display = ''; camBtn.textContent = '⏹  إيقاف السكانر'; lastCode = ''; lastMiss = '';
    await scanner.start();
  }
  function cameraOff() { scanner.stop(); cameraOn = false; camBox.style.display = 'none'; camBtn.textContent = '📷  تشغيل السكانر'; }
  function onScan(raw) {
    const now = Date.now();
    const code = raw.trim().replace(/[\x00-\x1F\x7F]/g, '').replace(/\.0+$/, '');
    if (!code) return;
    // نفس الباركود ما دام أمام الكاميرا: نتجاهله (نجدّد المهلة) حتى يغيب 3 ثوانٍ
    if (code === lastCode && now - lastCodeAt < 3000) { lastCodeAt = now; return; }
    if (now - lastScan < 1500) return;
    lastCode = code; lastCodeAt = now; lastScan = now;
    Sfx.ok(); setType('barcode');
    input.value = code; doSearch(true);
  }
  const stockCls = (q) => q === 0 ? 'zero' : q <= 5 ? 'warn' : '';
  function detail(r) {
    const codeRow = (l, v, mono) => h('div', { class: 'coderow' }, h('span', { class: 'l' }, l), h('code', { class: mono ? 'mono' : '', onclick: () => { try { navigator.clipboard.writeText(v); } catch (e) {} toast('تم النسخ: ' + v); } }, v));
    const tile = (l, v, cls) => h('div', { class: 'tile ' + cls }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v));
    return h('div', { class: 'detail' },
      h('div', { class: 'found' }, '✅ تم العثور على المنتج'),
      h('div', { class: 'pname' }, r.name || '—'),
      (r.itemNo || r.barcodes.length) ? h('div', { class: 'codes' }, r.itemNo ? codeRow('🔢 رقم الصنف', r.itemNo, false) : null, r.barcodes.map((b) => codeRow('📦 الباركود', b, true))) : null,
      h('div', { class: 'tiles' }, tile('السعر الأساسي', r.orig ? fmtQty(r.orig) : '—', 'orig'), tile('السعر بعد الخصم', r.sale ? fmtQty(r.sale) : '—', 'sale'),
        tile('الخصم', r.disc + '%', 'disc'), tile(r.multi ? 'إجمالي الرصيد' : 'الرصيد', fmtQty(r.stock), 'stk ' + stockCls(r.stock))),
      r.multi ? h('div', { style: 'margin-top:10px' }, h('div', { class: 'fld-l', style: 'font-weight:700;margin-bottom:6px' }, '🏬 الرصيد بالفروع'),
        r.branches.map(([b, q]) => h('div', { class: 'irow', style: 'margin-bottom:6px' + (b === Store.getBranch() ? ';border-color:var(--accent)' : '') }, h('b', { class: 'grow ell nm', style: b === Store.getBranch() ? 'color:var(--accent)' : '' }, b), h('div', { class: 'qbadge ' + qtyClass(q) }, fmtQty(q))))) : null);
  }
  const productRow = (r) => {
    const shownPrice = r.sale || r.orig, both = r.orig && r.sale && r.orig !== r.sale;
    return h('div', { class: 'prow', onclick: () => { result.replaceChildren(detail(r)); result.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
      h('div', { class: 'grow' }, h('div', { class: 'ell n' }, r.name || '—'), h('div', { class: 'c' }, r.code || '—'), h('div', { class: 'stk ' + stockCls(r.stock) }, '📦 ' + fmtQty(r.stock))),
      h('div', { class: 'pp' }, h('b', null, shownPrice ? fmtQty(shownPrice) : '—'), both ? h('s', null, fmtQty(r.orig)) : null, r.disc ? h('em', null, r.disc + '%') : null));
  };
  let lastResults = [], resultLimit = 50;
  function paintResults() {
    result.replaceChildren(...lastResults.slice(0, resultLimit).map((r) => h('div', { style: 'margin-bottom:6px' }, productRow(r))));
    if (lastResults.length > resultLimit) result.append(h('button', { class: 'btn', style: 'min-height:44px', onclick: () => { resultLimit += 50; paintResults(); } }, `عرض المزيد (${lastResults.length - resultLimit})`));
  }
  function doSearch(fromScan) {
    const q = input.value.trim();
    if (!q) return;
    const idx = PricesIndex.get();
    let single = null, many = [];
    if (type === 'barcode') single = idx.findBarcode(q);
    else if (type === 'code') { single = idx.findCode(q); if (!single) many = idx.filterCode(q); }
    else many = idx.filterName(q);
    if (!single && many.length === 1) single = many[0];
    if (single) {
      result.replaceChildren(detail(single)); lastMiss = '';
      if (fromScan) { cameraOff(); result.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else if (!many.length) {
      if (fromScan) { if (q !== lastMiss) Sfx.bad(); lastMiss = q; lastCode = ''; lastScan = Date.now() - 1000; }
      result.replaceChildren(h('div', { class: 'miss' }, type === 'barcode' ? `❌ لا يوجد منتج بالكود: ${q}` : `❌ لا نتائج لـ «${q}»`));
    } else { lastResults = many; resultLimit = 50; paintResults(); }
  }
  let io = null;
  function refresh() {
    const idx = PricesIndex.get();
    listCount.textContent = idx.list.length; shownN = 0; listHolder.replaceChildren();
    emptyEl.style.display = idx.list.length ? 'none' : '';
    appendMore();
  }
  function appendMore() {
    const idx = PricesIndex.get(), end = Math.min(shownN + 50, idx.list.length);
    for (let i = shownN; i < end; i++) listHolder.append(h('div', { class: 'wrap' }, productRow(idx.list[i])));
    shownN = end;
  }
  const sentinel = h('div', { style: 'height:1px' });
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { if (es[0].isIntersecting) appendMore(); }, { rootMargin: '900px' }).observe(sentinel);
  paintTypes();
  root.append(h('div', { class: 'vh' },
    h('div', { class: 'icard' }, h('div', { class: 'txt16' }, 'بحث الأسعار والأرصدة'), typeRow,
      h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'grow', style: 'margin-inline-end:8px' }, input), h('button', { class: 'btn fill sbtn', onclick: () => { doSearch(false); input.blur(); }, 'aria-label': 'بحث' }, '🔍')),
      camBox,
      h('div', { class: 'row', style: 'margin-top:10px' }, camBtn, h('button', { class: 'btn danger', style: 'flex:1;width:auto', onclick: () => { input.value = ''; result.replaceChildren(); lastMiss = ''; } }, '🗑️ مسح')),
      result),
    h('div', { class: 'ltitle', style: 'margin-top:4px' }, h('span', { class: 't' }, 'قائمة المنتجات'), listCount)), emptyEl, listHolder, sentinel);
  refresh();
  return { el: root, refresh, stop: cameraOff };
};
