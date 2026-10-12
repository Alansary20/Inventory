/* الشاشات الست */
'use strict';

const Views = {};
const esc = (s) => s;

// ═════════ المسح ═════════
Views.scan = (app) => {
  const root = h('div', { class: 'view' });
  let delay = +(localStorage.getItem('delay') || 1500), lastScanTime = 0, locked = false;
  let pending = null, pendingCount = 0, pendingTimer = null, cameraOn = false, query = '';
  const CONFIRM_HITS = 2, CONFIRM_WINDOW = 700;

  const input = h('input', { class: 'inp big', type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: 'اكتب باركود أو رقم صنف ثم ⏎',
    onkeydown: (e) => { if (e.key === 'Enter') manualAdd(); } });
  const addBtn = h('button', { class: 'btn primary sq', onclick: () => manualAdd(), 'aria-label': 'إضافة' }, '＋');
  const video = h('video', { class: 'cam', muted: true, playsinline: true, autoplay: true });
  const camBox = h('div', { class: 'cambox', style: 'display:none' }, video, h('div', { class: 'scanline' }));
  const camBtn = h('button', { class: 'btn primary wide', onclick: () => toggleCamera() }, 'تشغيل السكانر');
  const status = h('div', { class: 'status' }, 'جاهز للمسح');
  const setStatus = (kind, text) => { status.dataset.kind = kind; status.textContent = text; };
  const delayLbl = h('b', { class: 'accent' }, (delay / 1000).toFixed(1) + 's');
  const slider = h('input', { type: 'range', min: 500, max: 5000, step: 250, value: delay, oninput: (e) => {
    delay = +e.target.value; delayLbl.textContent = (delay / 1000).toFixed(1) + 's'; localStorage.setItem('delay', delay); lastScanTime = 0; } });
  const logHolder = h('div');
  const logCount = h('span', { class: 'badge' }, '0');
  let logList = null;

  const scanner = new CameraScanner(video, (c) => onCameraScan(c), (e) => { cameraOff(); toast(e && e.name === 'NotAllowedError' ? 'مطلوب إذن الكاميرا للمسح' : 'تعذّر تشغيل الكاميرا: ' + (e && e.message || e)); });

  async function toggleCamera() {
    if (cameraOn) { cameraOff(); return; }
    if (!CameraScanner.supported()) { toast('المتصفح لا يدعم الكاميرا (يلزم HTTPS)'); return; }
    Sfx.unlock();
    app.stopOthers(root);
    cameraOn = true; camBox.style.display = ''; camBtn.textContent = 'إيقاف السكانر'; setStatus('ready', 'جاهز للمسح');
    await scanner.start();
  }
  function cameraOff() { scanner.stop(); cameraOn = false; camBox.style.display = 'none'; camBtn.textContent = 'تشغيل السكانر'; }

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
      pendingTimer = setTimeout(() => { pending = null; pendingCount = 0; }, CONFIRM_WINDOW);
    }
  }
  function lookupAndAdd(raw) {
    const code = ScanEngine.sanitize(raw);
    if (!code) { toast('كود غير صالح'); return; }
    const now = Date.now(), elapsed = now - lastScanTime;
    if (locked) return;
    if (elapsed < delay) { setStatus('locked', `⏳ ${((delay - elapsed) / 1000).toFixed(1)}s`); return; }
    locked = true; lastScanTime = now;
    setStatus('scanning', `جاري المعالجة: ${code}`);
    let out;
    try { out = ScanEngine.process(code); } catch (e) { out = null; console.error(e); }
    switch (out && out.kind) {
      case 'FOUND': Sfx.ok(); toast('✓ ' + out.name); setStatus('ready', `تم العد: ${out.name}`); break;
      case 'AUTO': Sfx.ok(); toast('أُضيف تلقائياً من الرصيد: ' + out.name); setStatus('ready', `تم العد: ${out.name}`); break;
      case 'UNKNOWN': case 'NAME_ONLY': Sfx.bad(); toast('غير مسجل: ' + out.code); setStatus('idle', `غير مسجل: ${out.code}`); break;
      case 'CHOOSE': setStatus('idle', 'اختر الصنف المقصود'); showChoices(out.code, out.choices); break;
      default: setStatus('idle', 'جاهز للمسح');
    }
    locked = false;
    reload(); app.changed();
  }
  function showChoices(typed, hits) {
    const box = h('div', { class: 'choices' });
    let dlg;
    for (const x of hits) {
      box.append(h('div', { class: 'choice', onclick: () => { dlg.close(); const o = ScanEngine.addHit(x); Sfx.ok(); toast('✓ ' + o.name); setStatus('ready', `تم العد: ${o.name}`); reload(); app.changed(); } },
        h('b', null, x.name), h('div', { class: 'muted small' }, [x.itemNo, x.barcode].filter(Boolean).join('  •  '))));
    }
    dlg = dialog({ title: 'اختر الصنف المقصود', message: typed, content: box, buttons: [{ label: 'إلغاء' }] });
  }

  function renderRow(r) {
    const isOpen = r.itemCode;
    const actions = h('div', { class: 'acts' },
      h('button', { class: 'btn mini', onclick: () => { if (!Store.logMinus(isOpen)) toast('لا يوجد سجل لهذا الصنف'); else Sfx.down(); reload(); app.changed(); } }, '−'),
      h('button', { class: 'btn mini', onclick: async () => { const q = await promptQty('تعديل الكمية', r.qty); if (q != null && !isNaN(q)) { Store.logSetQty(r.id, q); reload(); app.changed(); } } }, '✎'),
      h('button', { class: 'btn mini primary', onclick: () => { Store.logPlus(isOpen, r.name, r.barcode); Sfx.up(); reload(); app.changed(); } }, '＋'),
      h('button', { class: 'btn mini danger', onclick: async () => { if (await confirmDlg('حذف', 'حذف هذا السطر من السجل والجرد؟', 'حذف')) { Store.logDelete(r.id); reload(); app.changed(); } } }, '🗑'));
    return h('div', { class: 'row-card' },
      h('div', { class: 'grow' }, h('b', { class: 'ell' }, r.name || '—'), h('div', { class: 'muted small' }, [r.barcode || r.itemCode, fmtTime(r.timestamp)].join('  •  '))),
      h('div', { class: 'qty' }, r.qty), actions);
  }
  function reload() {
    logCount.textContent = Store.countScanLog();
    if (!logList) logList = pagedList(logHolder, (l, o) => Store.searchLog(query, l, o), renderRow, 'لا توجد مسحات بعد');
    logList.reload();
  }

  root.append(
    h('div', { class: 'card' }, h('div', { class: 'row gap' }, input, addBtn), camBox, camBtn, status,
      h('div', { class: 'row between' }, h('span', null, 'تأخير المسح:'), delayLbl), slider),
    h('button', { class: 'btn danger wide', onclick: async () => { if (await confirmDlg('مسح الجرد', 'هل تريد حذف الجرد وسجل المسحات؟ لا يمكن التراجع.', 'مسح')) { Store.clearInventoryAndLog(); toast('تم مسح الجرد'); reload(); app.changed(); } } }, '🗑  مسح الجرد'),
    h('div', { class: 'row between title' }, h('h3', null, 'سجل المسحات التفصيلي'), logCount),
    searchBox((v) => { query = v; reload(); }, 'ابحث في السجل…'),
    logHolder);
  reload();
  return { el: root, refresh: reload, stop: cameraOff };
};

// ═════════ الجرد ═════════
Views.inventory = (app) => {
  const root = h('div', { class: 'view' });
  let file = null, query = '', list = null;
  const fileBtn = h('button', { class: 'btn wide', onclick: async () => { const f = await pickFiles(false); if (f.length) { file = f[0]; fileBtn.textContent = file.name; } } }, 'اختر ملف Excel للجرد');
  const mode = modeChips(false, 'تحديث: يحذف الجرد الحالي وسجل المسحات ويستبدله بمحتوى الملف.', 'دمج: يجمع كميات الملف مع الجرد الحالي.');
  const count = h('h3', null, ''), holder = h('div');
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
  const renderRow = (r) => h('div', { class: 'row-card' }, h('div', { class: 'grow' }, h('b', { class: 'ell' }, r.name || '—'), h('div', { class: 'muted small' }, r.itemNo || r.barcode || r.key)), h('div', { class: 'qty' }, r.qty));
  function refresh() {
    count.textContent = `الأصناف المجرودة (${Store.countInventory()})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchInventory(query, l, o), renderRow, 'لا توجد أصناف مجرودة');
    list.reload();
  }
  root.append(h('div', { class: 'card' }, h('h3', null, 'استيراد الجرد من Excel'), fileBtn, mode.el, h('button', { class: 'btn primary wide', onclick: doImport }, 'استيراد الجرد')),
    h('button', { class: 'btn wide', onclick: doExport }, 'تصدير الجرد'), searchBox((v) => { query = v; refresh(); }), count, holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ الرصيد ═════════
Views.stock = (app) => {
  const root = h('div', { class: 'view' });
  let files = [], query = '', list = null;
  const fileBtn = h('button', { class: 'btn wide', onclick: async () => { const f = await pickFiles(true); if (f.length) { files = f; fileBtn.textContent = `تم اختيار ${f.length} ملف`; } } }, 'اختر ملف Excel');
  const mode = modeChips(false, 'تحديث: يحذف بيانات الرصيد القديمة ويستبدلها بالجديدة.', 'دمج: يجمع الكميات مع الرصيد الحالي.');
  const count = h('h3', null, ''), holder = h('div');
  async function doImport() {
    if (!files.length) { toast('اختر ملفاً أولاً'); return; }
    try {
      const srcs = await readFiles(files); if (!srcs) return;
      const fields = [{ label: 'رقم الصنف', kind: 'ITEM_NO' }, { label: 'الباركود', kind: 'BARCODE' }, { label: 'اسم المنتج', kind: 'NAME' }, { label: 'الكمية', kind: 'QTY', required: true }];
      const m = await mapColumns(files.map((f) => f.name).join(', '), srcs[0].rows.slice(0, 30), fields); if (!m) return;
      if (m.cols[0] < 0 && m.cols[1] < 0) { toast('اختر عمود الباركود أو رقم الصنف على الأقل'); return; }
      if (m.cols[3] < 0) { toast('اختر عمود الكمية'); return; }
      const pd = progressDialog('معالجة ورفع الرصيد');
      let n;
      try { n = await importStock(srcs, m.cols, m.noHeader, mode.merge, (f, l) => pd.set(f, l)); } finally { pd.close(); }
      files = []; fileBtn.textContent = 'اختر ملف Excel';
      toast(`تم تحديث الرصيد (${n} صنف)`); refresh(); app.changed();
    } catch (e) { toast('تعذّرت قراءة الملف: ' + e.message); }
  }
  function doExport() {
    const all = Store.allStock().sort((a, b) => (a.key < b.key ? -1 : 1));
    downloadXlsx(`رصيد_${dateStr()}.xlsx`, 'الرصيد', ['رقم الصنف', 'الاسم', 'كمية الرصيد'], all.map((s) => [s.key, s.name, s.qty]), [18, 36, 16]);
    toast(`تم تصدير ${all.length} منتج`);
  }
  const renderRow = (r) => {
    const c = r.qty === 0 ? 'neg' : r.qty <= 5 ? 'warn' : 'ok';
    return h('div', { class: 'row-card' }, h('div', { class: 'grow' }, h('b', { class: 'ell' }, r.name || '—'), h('div', { class: 'muted small' }, r.key)), h('div', { class: 'qty ' + c }, fmtQty(r.qty)));
  };
  function refresh() {
    count.textContent = `الرصيد (${Store.countStock()})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchStock(query, l, o), renderRow, 'لا توجد بيانات رصيد');
    list.reload();
  }
  root.append(h('div', { class: 'card' }, h('h3', null, 'رفع ملف رصيد النظام'), fileBtn, mode.el, h('button', { class: 'btn primary wide', onclick: doImport }, 'معالجة ورفع الرصيد')),
    h('button', { class: 'btn wide', onclick: doExport }, 'تصدير الرصيد'), searchBox((v) => { query = v; refresh(); }), count, holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ المقارنة ═════════
Views.compare = (app) => {
  const root = h('div', { class: 'view' });
  let filter = 'all', query = '', data = null;
  const stats = h('div', { class: 'stats3' });
  const chips = h('div', { class: 'chips' });
  const holder = h('div', { class: 'list' });
  const FLT = [['all', 'الكل'], ['inc', 'زيادة'], ['dec', 'نقص'], ['match', 'مطابق'], ['scanned', 'مجرود']];
  let shown = 80;
  const more = h('button', { class: 'btn', onclick: () => { shown += 80; paint(); } }, 'عرض المزيد');
  const stat = (label, val, cls) => h('div', { class: 'stat ' + cls }, h('b', null, val), h('span', null, label));
  const status = (r) => r.diff > 0 ? 'inc' : r.diff < 0 ? 'dec' : (r.qi > 0 ? 'match' : '');
  const filtered = () => {
    const nq = Ar.norm(query), lq = query.toLowerCase();
    return data.rows.filter((r) => {
      if (filter === 'inc' && !(r.diff > 0)) return false;
      if (filter === 'dec' && !(r.diff < 0)) return false;
      if (filter === 'match' && !(r.diff === 0 && r.qi > 0)) return false;
      if (filter === 'scanned' && !(r.qi > 0)) return false;
      if (!query) return true;
      return Ar.norm(r.name).includes(nq) || r.itemNo.toLowerCase().includes(lq) || r.barcode.toLowerCase().includes(lq) || r.key.toLowerCase().includes(lq);
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  };
  function paint() {
    const rows = filtered();
    holder.replaceChildren(...rows.slice(0, shown).map((r) => h('div', { class: 'row-card cmp ' + status(r) },
      h('div', { class: 'grow' }, h('b', { class: 'ell' }, r.name || '—'), h('div', { class: 'muted small' }, r.itemNo || r.barcode || r.key)),
      h('div', { class: 'cmpnums' }, h('span', null, 'الرصيد ', h('b', null, fmtQty(r.qs))), h('span', null, 'المجرود ', h('b', null, fmtQty(r.qi))),
        h('span', { class: 'diff' }, 'الفرق ', h('b', null, (r.diff > 0 ? '+' : '') + fmtQty(r.diff)))))));
    more.style.display = rows.length > shown ? '' : 'none';
    if (!rows.length) holder.append(h('div', { class: 'empty' }, 'لا توجد بيانات للمقارنة'));
  }
  function refresh() {
    data = buildCompare(); shown = 80;
    stats.replaceChildren(stat('زيادة ↑', data.inc, 'inc'), stat('نقص ↓', data.dec, 'dec'), stat('مطابق ✓', data.match, 'match'));
    chips.replaceChildren(...FLT.map(([k, l]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; shown = 80; refresh2(); } }, l)));
    paint();
  }
  const refresh2 = () => { chips.replaceChildren(...FLT.map(([k, l]) => h('button', { class: 'chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; shown = 80; refresh2(); } }, l))); paint(); };
  function doExport() {
    const kindOf = (r) => r.diff > 0 ? 'inc' : r.diff < 0 ? 'dec' : (r.qi > 0 ? 'match' : 'none');
    const lst = filtered(), kinds = lst.map(kindOf);
    const lbl = { inc: '⬆ زيادة', dec: '⬇ نقص', match: '✓ مطابق', none: '— —' };
    const rows = lst.map((r, i) => [r.barcode, r.itemNo, r.name, r.qs, r.qi, (r.diff > 0 ? '+' : '') + fmtQty(r.diff), lbl[kinds[i]]]);
    downloadXlsx(`مقارنة_الجرد_${dateStr()}.xlsx`, 'المقارنة', ['الباركود', 'رقم الصنف', 'الاسم', 'الفعلي', 'المجرود', 'الفرق', 'الحالة'], rows, [20, 18, 40, 12, 12, 12, 12],
      { header: X_CMP.header, rowStyle: (i) => X_CMP[kinds[i]], boldCols: [5, 6], frozen: true });
    toast(`تم تصدير ${rows.length} منتج`);
  }
  root.append(stats, chips, searchBox((v) => { query = v; shown = 80; paint(); }, '🔍 بحث...'), h('button', { class: 'btn wide', onclick: doExport }, 'تصدير المقارنة'), holder, more);
  refresh();
  return { el: root, refresh };
};

// ═════════ المنتجات ═════════
Views.products = (app) => {
  const root = h('div', { class: 'view' });
  let files = [], query = '', list = null;
  const fileBtn = h('button', { class: 'btn wide', onclick: async () => { const f = await pickFiles(true); if (f.length) { files = f; fileBtn.textContent = `تم اختيار ${f.length} ملف`; } } }, 'اختر ملف Excel أو CSV');
  const mode = modeChips(false, 'تحديث: يحذف المنتجات الحالية ويستبدلها بمحتوى الملف.', 'دمج: يضيف الجديد ويحدّث الموجود دون حذف.');
  const count = h('h3', null, ''), holder = h('div');
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
    const all = Store.allProducts().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    downloadXlsx(`منتجات_${dateStr()}.xlsx`, 'المنتجات', ['الباركود', 'رقم الصنف', 'الاسم', 'السعر الأساسي', 'السعر بعد الخصم'],
      all.map((p) => [p.barcode, p.itemNo, p.name, p.priceOrig, p.priceSale !== 0 ? p.priceSale : p.priceOrig]), [22, 18, 40, 16, 16]);
    toast(`تم تصدير ${all.length} منتج`);
  }
  function editProduct(p) {
    const isNew = !p;
    const cur = p || { id: uuid(), barcode: '', itemNo: '', name: '', altBarcodes: '', priceOrig: 0, priceSale: 0, sourceId: 0 };
    const f = {
      barcode: h('input', { class: 'inp', value: cur.barcode, inputmode: 'numeric' }), itemNo: h('input', { class: 'inp', value: cur.itemNo }),
      name: h('input', { class: 'inp', value: cur.name }), alt: h('input', { class: 'inp', value: cur.altBarcodes }),
      orig: h('input', { class: 'inp', value: cur.priceOrig || '', inputmode: 'decimal' }), sale: h('input', { class: 'inp', value: cur.priceSale || '', inputmode: 'decimal' }),
    };
    const fld = (l, el) => h('div', { class: 'fld' }, h('label', null, l), el);
    const buttons = [{ label: 'إلغاء' }];
    if (!isNew) buttons.push({ label: 'حذف', kind: 'danger', onclick: async () => { if (await confirmDlg('حذف', 'حذف هذا المنتج؟', 'حذف')) { Store.deleteProduct(cur.id); toast('تم الحذف'); refresh(); app.changed(); } } });
    buttons.push({ label: 'حفظ', kind: 'primary', keep: true, onclick: (close) => {
      const [b, i] = Codes.fix(cleanCode(f.barcode.value), cleanCode(f.itemNo.value));
      if (!b && !i) { toast('أدخل الباركود أو رقم الصنف'); return; }
      const oN = parseNumber(f.orig.value) ?? 0, sN = parseNumber(f.sale.value);
      Store.upsertProducts([{ ...cur, barcode: b, itemNo: i, name: f.name.value.trim(), altBarcodes: splitCodes(f.alt.value).map(cleanCode).filter(Boolean).join(','), priceOrig: oN, priceSale: sN ?? oN }]);
      close(); toast('تم الحفظ'); refresh(); app.changed();
    } });
    dialog({ title: isNew ? 'إضافة منتج' : 'تعديل المنتج', content: h('div', null, fld('الباركود', f.barcode), fld('رقم الصنف', f.itemNo), fld('اسم المنتج', f.name), fld('السعر الأساسي', f.orig), fld('السعر بعد الخصم', f.sale), fld('باركودات إضافية (مفصولة بفاصلة)', f.alt)), buttons });
  }
  const renderRow = (p) => h('div', { class: 'row-card', onclick: () => editProduct(p) },
    h('div', { class: 'grow' }, h('b', { class: 'ell' }, p.name || '—'), h('div', { class: 'muted small' }, [p.itemNo, p.barcode].filter(Boolean).join('  •  '))),
    h('div', { class: 'price' }, h('b', null, fmtQty(p.priceSale || p.priceOrig)), p.priceOrig && p.priceSale && p.priceSale !== p.priceOrig ? h('s', { class: 'muted small' }, fmtQty(p.priceOrig)) : null));
  function refresh() {
    count.textContent = `المنتجات (${Store.countProducts()})`;
    if (!list) list = pagedList(holder, (l, o) => Store.searchProducts(query, l, o), renderRow, 'لا توجد منتجات بعد');
    list.reload();
  }
  root.append(
    h('div', { class: 'card' }, h('h3', null, 'رفع ملف قائمة المنتجات مع الباركود والسعر'), fileBtn, mode.el, h('button', { class: 'btn primary wide', onclick: doImport }, 'معالجة ورفع المنتجات')),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn grow', onclick: doExport }, 'تصدير المنتجات'),
      h('button', { class: 'btn grow', onclick: () => editProduct(null) }, '＋ إضافة منتج'),
      h('button', { class: 'btn grow', onclick: async () => { if (await confirmDlg('دمج المنتجات المكررة', 'دمج المنتجات التي لها نفس رقم الصنف (أو نفس الباركود)؟', 'دمج', false)) { const n = ProductImporter.dedupe(); toast(`تم حذف ${n} منتج مكرر`); refresh(); app.changed(); } } }, 'دمج المنتجات المكررة'),
      h('button', { class: 'btn danger grow', onclick: async () => { if (await confirmDlg('مسح كل المنتجات', 'هل تريد حذف كل المنتجات؟ لا يمكن التراجع عن ذلك.', 'مسح')) { Store.clearProducts(); toast('تم مسح كل المنتجات'); refresh(); app.changed(); } } }, 'مسح كل المنتجات')),
    searchBox((v) => { query = v; refresh(); }), count, holder);
  refresh();
  return { el: root, refresh };
};

// ═════════ الأسعار ═════════
Views.prices = (app) => {
  const root = h('div', { class: 'view' });
  let type = 'barcode', cameraOn = false, lastMiss = '', lastCode = '', lastScan = 0, listLimit = 50;
  const HINT = { barcode: 'أدخل الباركود…', code: 'أدخل رقم الصنف…', name: 'أدخل اسم المنتج…' };
  const input = h('input', { class: 'inp big', type: 'text', autocomplete: 'off', placeholder: HINT.barcode, onkeydown: (e) => { if (e.key === 'Enter') doSearch(false); } });
  const typeChips = h('div', { class: 'chips' });
  const video = h('video', { class: 'cam', muted: true, playsinline: true, autoplay: true });
  const camBox = h('div', { class: 'cambox', style: 'display:none' }, video, h('div', { class: 'scanline' }));
  const camBtn = h('button', { class: 'btn primary grow', onclick: () => toggleCamera() }, 'تشغيل السكانر');
  const result = h('div', { class: 'result' });
  const listTitle = h('h3', null, 'قائمة المنتجات'), listHolder = h('div', { class: 'list' });
  const scanner = new CameraScanner(video, (c) => onScan(c), (e) => { cameraOff(); toast(e && e.name === 'NotAllowedError' ? 'مطلوب إذن الكاميرا للمسح' : 'تعذّر تشغيل الكاميرا: ' + (e && e.message || e)); });

  const paintChips = () => typeChips.replaceChildren(...[['barcode', 'باركود'], ['code', 'رقم الصنف'], ['name', 'اسم المنتج']].map(([k, l]) =>
    h('button', { class: 'chip' + (type === k ? ' on' : ''), onclick: () => { type = k; input.placeholder = HINT[k]; input.value = ''; result.replaceChildren(); paintChips(); } }, l)));
  async function toggleCamera() {
    if (cameraOn) { cameraOff(); return; }
    if (!CameraScanner.supported()) { toast('المتصفح لا يدعم الكاميرا (يلزم HTTPS)'); return; }
    Sfx.unlock(); app.stopOthers(root);
    type = 'barcode'; input.placeholder = HINT.barcode; paintChips();
    cameraOn = true; camBox.style.display = ''; camBtn.textContent = 'إيقاف السكانر'; lastCode = ''; lastMiss = '';
    await scanner.start();
  }
  function cameraOff() { scanner.stop(); cameraOn = false; camBox.style.display = 'none'; camBtn.textContent = 'تشغيل السكانر'; }
  function onScan(code) {
    const now = Date.now();
    if (code === lastCode && now - lastScan < 1500) return;
    if (now - lastScan < 400) return;
    lastCode = code; lastScan = now;
    input.value = code; doSearch(true);
  }
  const stockCls = (q) => q === 0 ? 'neg' : q <= 5 ? 'warn' : 'ok';
  function detail(r) {
    const codeRow = (l, v) => h('div', { class: 'coderow' }, h('span', { class: 'muted' }, l), h('code', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(v); toast('تم النسخ'); } }, v));
    const tile = (l, v, cls) => h('div', { class: 'tile ' + cls }, h('span', null, l), h('b', null, v));
    return h('div', { class: 'card detail' },
      h('div', { class: 'found' }, '✅ تم العثور على المنتج'),
      h('div', { class: 'pname' }, r.name || '—'),
      (r.itemNo || r.barcodes.length) ? h('div', { class: 'codes' }, r.itemNo ? codeRow('🔢 رقم الصنف', r.itemNo) : null, r.barcodes.map((b) => codeRow('📦 الباركود', b))) : null,
      h('div', { class: 'tiles' }, tile('السعر الأساسي', r.orig ? h('s', null, fmtQty(r.orig)) : '—', 'orig'), tile('السعر بعد الخصم', r.sale ? fmtQty(r.sale) : '—', 'sale'),
        tile('الخصم', r.disc + '%', 'disc'), tile('الرصيد', fmtQty(r.stock), 'stk ' + stockCls(r.stock))));
  }
  const compact = (r) => h('div', { class: 'row-card', onclick: () => { result.replaceChildren(detail(r)); result.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    h('div', { class: 'grow' }, h('b', { class: 'ell' }, r.name), h('div', { class: 'muted small' }, r.itemNo || r.barcode)),
    h('div', { class: 'price' }, h('b', null, r.sale ? fmtQty(r.sale) : '—')), h('div', { class: 'qty ' + stockCls(r.stock) }, fmtQty(r.stock)));
  let lastResults = [], resultLimit = 50;
  function paintResults() {
    result.replaceChildren(...lastResults.slice(0, resultLimit).map(compact));
    if (lastResults.length > resultLimit) result.append(h('button', { class: 'btn', onclick: () => { resultLimit += 50; paintResults(); } }, `عرض المزيد (${lastResults.length - resultLimit})`));
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
      if (fromScan) { Sfx.ok(); cameraOff(); result.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else if (!many.length) {
      if (fromScan) { if (q !== lastMiss) Sfx.bad(); lastMiss = q; lastCode = ''; lastScan = Date.now() - 1000; }
      result.replaceChildren(h('div', { class: 'miss' }, type === 'barcode' ? `❌ لا يوجد منتج بالكود: ${q}` : `❌ لا نتائج لـ «${q}»`));
    } else { lastResults = many; resultLimit = 50; paintResults(); }
  }
  function refresh() {
    const idx = PricesIndex.get();
    listHolder.replaceChildren(...idx.list.slice(0, listLimit).map(compact));
    if (idx.list.length > listLimit) listHolder.append(h('button', { class: 'btn', onclick: () => { listLimit += 50; refresh(); } }, 'عرض المزيد'));
    if (!idx.list.length) listHolder.append(h('div', { class: 'empty' }, 'لا توجد منتجات بعد'));
  }
  paintChips();
  root.append(h('div', { class: 'card' }, h('h3', null, 'بحث الأسعار والأرصدة'), typeChips,
    h('div', { class: 'row gap' }, input, h('button', { class: 'btn primary sq', onclick: () => doSearch(false), 'aria-label': 'بحث' }, '🔍')),
    camBox, h('div', { class: 'row gap' }, camBtn, h('button', { class: 'btn danger', onclick: () => { input.value = ''; result.replaceChildren(); lastMiss = ''; } }, '🗑 مسح'))),
    result, listTitle, listHolder);
  refresh();
  return { el: root, refresh, stop: cameraOff };
};
