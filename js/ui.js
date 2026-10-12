/* أدوات الواجهة: إنشاء العناصر، الإشعارات، النوافذ، الأصوات، الكاميرا، التصدير */
'use strict';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);

// ───── إشعار ─────
let toastTimer = null;
function toast(msg, ms = 3200) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ───── نافذة حوارية ─────
function dialog({ title, message, content, buttons = [], cancelable = true }) {
  const close = () => back.remove();
  const box = h('div', { class: 'dlg', role: 'dialog' },
    title ? h('div', { class: 'dlg-title' }, title) : null,
    message ? h('div', { class: 'dlg-msg' }, message) : null,
    content || null,
    h('div', { class: 'dlg-btns' }, buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind || ''), onclick: async () => { if (b.keep !== true) close(); if (b.onclick) await b.onclick(close); },
    }, b.label))));
  const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back && cancelable) close(); } }, box);
  document.body.append(back);
  return { close, box };
}
const confirmDlg = (title, message, okLabel, danger = true) => new Promise((res) => dialog({
  title, message,
  buttons: [{ label: 'إلغاء', onclick: () => res(false) }, { label: okLabel, kind: danger ? 'danger' : 'primary', onclick: () => res(true) }],
}));
const promptQty = (title, current) => new Promise((res) => {
  const inp = h('input', { type: 'number', inputmode: 'numeric', value: current, min: 0, class: 'inp' });
  dialog({ title, content: inp, buttons: [{ label: 'إلغاء', onclick: () => res(null) },
    { label: 'حفظ', kind: 'primary', onclick: () => res(parseInt(inp.value, 10)) }] });
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
});
function progressDialog(title) {
  const bar = h('div', { class: 'bar' }, h('i'));
  const label = h('div', { class: 'muted small' }, '');
  const d = dialog({ title, content: h('div', null, bar, label), cancelable: false });
  return { set(f, l) { bar.firstChild.style.width = Math.round(f * 100) + '%'; if (l) label.textContent = l; }, close: d.close };
}

// ───── أصوات ─────
const Sfx = (() => {
  let ctx = null;
  const tone = (notes, gain = 0.25) => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      let t = ctx.currentTime;
      for (const [f, ms] of notes) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
        t += ms / 1000;
      }
    } catch (e) {}
  };
  return {
    ok: () => tone([[1200, 90]]),
    bad: () => tone([[300, 180], [220, 220]], 0.3),
    up: () => tone([[660, 80], [880, 150]]),
    down: () => tone([[520, 80], [340, 160]]),
    unlock: () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) {} },
  };
})();

// ───── الكاميرا والمسح ─────
const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar'];
const ZX_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'Code93', 'ITF', 'Codabar'];
let _zxP = null;
function loadZXingWasm() {
  if (!_zxP) _zxP = new Promise((res, rej) => {
    const done = () => { try { ZXingWASM.setZXingModuleOverrides({ locateFile: (p) => 'vendor/' + p }); res(ZXingWASM); } catch (e) { rej(e); } };
    if (window.ZXingWASM) return done();
    const sc = document.createElement('script'); sc.src = 'vendor/zxing-wasm-reader.js'; sc.onload = done; sc.onerror = () => { _zxP = null; rej(new Error('zxing')); };
    document.head.appendChild(sc);
  });
  return _zxP;
}
const AIM = /^\][A-Za-z][0-9A-Za-z]/;

class CameraScanner {
  constructor(videoEl, onCode, onError) { this.video = videoEl; this.onCode = onCode; this.onError = onError; this.stream = null; this.running = false; }
  static supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  async start() {
    this.stop();
    this.running = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { this.running = false; this.onError(e); return; }
    if (!this.running) { this.stop(); return; }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true'); this.video.setAttribute('webkit-playsinline', 'true'); this.video.muted = true;
    try { await this.video.play(); } catch (e) {}
    // تركيز مستمر إن أمكن
    try {
      const tr = this.stream.getVideoTracks()[0];
      const caps = tr.getCapabilities ? tr.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) await tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) {}
    this.loop();
  }
  clean(v) { return String(v || '').replace(AIM, '').replace(/\u001D/g, '').trim(); }
  async loop() {
    let detector = null, wasm = null;
    if ('BarcodeDetector' in window) {
      try {
        const sup = await BarcodeDetector.getSupportedFormats();
        const fm = SCAN_FORMATS.filter((f) => sup.includes(f));
        if (fm.length) detector = new BarcodeDetector({ formats: fm });
      } catch (e) { detector = null; }
    }
    if (!detector) {   // Safari / iOS وغيره: zxing-cpp عبر WebAssembly
      try { wasm = await loadZXingWasm(); } catch (e) { this.onError(e); return; }
    }
    const canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          // نقرأ المنطقة المرئية فقط (وسط الإطار)، بدقة كاملة
          const vw = v.videoWidth, vh = v.videoHeight;
          const box = v.getBoundingClientRect();
          const scale = Math.max(box.width / vw, box.height / vh) || 1;
          const sw = Math.min(vw, box.width / scale), sh = Math.min(vh, box.height / scale);
          const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
          const k = Math.min(1, 1600 / sw);
          canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
          cx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          let text = null;
          if (detector) {
            const r = await detector.detect(canvas);
            if (r.length) text = r[0].rawValue;
          } else if (wasm) {
            const r = await wasm.readBarcodes(cx.getImageData(0, 0, canvas.width, canvas.height), {
              formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryDownscale: true, tryInvert: false, maxNumberOfSymbols: 1 });
            if (r.length) text = r[0].text;
          }
          const c = text && this.clean(text);
          if (c) this.onCode(c);
        } catch (e) {}
      }
      setTimeout(tick, 90);
    };
    tick();
  }
  stop() {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    try { this.video.srcObject = null; } catch (e) {}
  }
}

// ───── التصدير (Excel) ─────
const X_HEADER_GREEN = { fill: 'FF1A7A5E', font: 'FFFFFFFF', bold: true, border: 'medium', bcolor: 'FF0F5C46' };
const X_ROW_WHITE = { fill: 'FFFFFFFF', font: 'FF1A202C' };
const X_ROW_ALT = { fill: 'FFF5F7FA', font: 'FF1A202C' };
const X_CMP = {
  header: { fill: 'FF1B4F72', font: 'FFFFFFFF', bold: true, border: 'medium', bcolor: 'FF00A884', wrap: true, name: 'Cairo' },
  inc: { fill: 'FFD1FAE5', font: 'FF065F46', name: 'Cairo' }, dec: { fill: 'FFFEE2E2', font: 'FF991B1B', name: 'Cairo' },
  match: { fill: 'FFE0F2FE', font: 'FF0369A1', name: 'Cairo' }, none: { fill: 'FFF3F4F6', font: 'FF6B7280', name: 'Cairo' },
};
function xlStyle(c, st) {
  const bd = { style: st.border || 'thin', color: { argb: st.bcolor || 'FFD1D5DB' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.fill } };
  c.font = { bold: !!st.bold, size: 11, color: { argb: st.font }, name: st.name || 'Calibri' };
  c.border = { left: bd, right: bd, top: bd, bottom: bd };
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: !!st.wrap, readingOrder: 'rtl' };
}
// opts: { header: style, rowStyle: (i,row)=>style, boldCols: [idx], frozen: bool }
async function downloadXlsx(filename, sheetName, header, rows, widths, opts) {
  opts = opts || {};
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true, state: opts.frozen ? 'frozen' : 'normal', ySplit: opts.frozen ? 1 : 0 }] });
  ws.columns = header.map((_, i) => ({ width: (widths || [])[i] || 20 }));
  const hr = ws.addRow(header); hr.height = 22;
  hr.eachCell((c) => xlStyle(c, opts.header || X_HEADER_GREEN));
  rows.forEach((r, i) => {
    const row = ws.addRow(r.map((v) => (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) ? null : v));
    row.height = 18;
    const st = opts.rowStyle ? opts.rowStyle(i, r) : (i % 2 === 0 ? X_ROW_WHITE : X_ROW_ALT);
    for (let c = 1; c <= header.length; c++) {
      const cell = row.getCell(c);
      xlStyle(cell, (opts.boldCols || []).includes(c - 1) ? { ...st, bold: true } : st);
      if (typeof cell.value === 'string') cell.numFmt = '@';
    }
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const file = new File([blob], filename, { type: blob.type });
  // iOS Safari: ورقة المشاركة أكثر موثوقية من تنزيل blob
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const dateStr = () => new Date().toISOString().slice(0, 10);
const fmtTime = (ts) => { if (!ts) return ''; const d = new Date(ts), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

// ───── اختيار الأعمدة ─────
const COL_LABELS = { BARCODE: 'الباركود', ITEM_NO: 'رقم الصنف', NAME: 'اسم المنتج', QTY: 'الكمية', LAST_SCAN: 'آخر مسح', PRICE_ORIG: 'السعر الأساسي', PRICE_SALE: 'السعر بعد الخصم' };
const colLetter = (i) => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function mapColumns(fileName, rows, fields) {
  return new Promise((res) => {
    const det = ColumnDetector.detect(rows, fields.map((f) => f.kind));
    const ncols = rows.slice(0, 30).reduce((m, r) => Math.max(m, r.length), 0);
    const noHeader = h('input', { type: 'checkbox', id: 'nohdr' });
    noHeader.checked = !det.hasHeader;
    const sels = fields.map((f) => {
      const s = h('select', { class: 'inp' }, h('option', { value: -1 }, '— بدون —'),
        [...Array(ncols).keys()].map((i) => h('option', { value: i }, `عمود ${colLetter(i)}` + (rows[0] && rows[0][i] ? ` — ${String(rows[0][i]).slice(0, 18)}` : ''))));
      s.value = det.cols[f.kind] != null ? det.cols[f.kind] : -1;
      return s;
    });
    const prev = h('div', { class: 'prev' }, h('table', null, rows.slice(0, 6).map((r) => h('tr', null, [...Array(ncols).keys()].map((i) => h('td', null, String(r[i] ?? '').slice(0, 24)))))));
    const content = h('div', null, h('div', { class: 'muted small' }, fileName), prev,
      h('label', { class: 'row' }, noHeader, ' ', 'بدون رؤوس (الصف الأول بيانات)'),
      fields.map((f, i) => h('div', { class: 'fld' }, h('label', null, f.label + (f.required ? ' *' : '')), sels[i])));
    dialog({ title: 'تعيين الأعمدة', content, buttons: [
      { label: 'إلغاء', onclick: () => res(null) },
      { label: 'تأكيد ومعالجة', kind: 'primary', onclick: () => res({ cols: sels.map((s) => parseInt(s.value, 10)), noHeader: noHeader.checked }) },
    ] });
  });
}

/** يقرأ الملفات المختارة ويسأل عن الورقة إن تعددت. يعيد [{name, rows}] أو null. */
async function readFiles(fileList) {
  const out = [];
  for (const f of fileList) {
    const wb = await TableReader.readBook(f);
    let sheet = wb.SheetNames[0];
    if (wb.SheetNames.length > 1) {
      sheet = await new Promise((res) => {
        const sel = h('select', { class: 'inp' }, wb.SheetNames.map((n) => h('option', { value: n }, n)));
        dialog({ title: 'اختر الورقة (Sheet) المراد استيرادها', message: f.name, content: sel, buttons: [
          { label: 'إلغاء', onclick: () => res(null) }, { label: 'موافق', kind: 'primary', onclick: () => res(sel.value) }] });
      });
      if (sheet == null) return null;
    }
    const rows = TableReader.rowsOf(wb, sheet);
    if (!rows.length) { toast('الملف فارغ: ' + f.name); return null; }
    out.push({ name: f.name, rows });
  }
  return out;
}

function pickFiles(multiple) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept: '.xlsx,.xls,.csv,.txt,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv', multiple: multiple || null, style: 'display:none' });
    inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
    document.body.append(inp); inp.click();
  });
}

/** قائمة تمرير لا نهائية بالصفحات (50). */
function pagedList(container, fetchPage, renderRow, emptyText) {
  const PAGE = 50;
  let offset = 0, done = false, token = 0;
  const holder = h('div', { class: 'list' });
  const more = h('button', { class: 'btn', onclick: () => load() }, 'عرض المزيد');
  const empty = h('div', { class: 'empty' }, emptyText);
  container.replaceChildren(holder, more, empty);
  function load() {
    const tk = token;
    const page = fetchPage(PAGE, offset);
    if (tk !== token) return;
    page.forEach((r) => holder.append(renderRow(r)));
    offset += page.length;
    if (page.length < PAGE) done = true;
    more.style.display = done ? 'none' : '';
    empty.style.display = offset === 0 ? '' : 'none';
  }
  return { reload() { token++; offset = 0; done = false; holder.replaceChildren(); load(); } };
}

function searchBox(onChange, placeholder = 'ابحث بالاسم أو الباركود أو رقم الصنف') {
  let t = null;
  return h('input', { class: 'inp search', type: 'search', placeholder: '🔍  ' + placeholder, oninput: (e) => { clearTimeout(t); const v = e.target.value.trim(); t = setTimeout(() => onChange(v), v ? 250 : 0); } });
}

function modeChips(initialMerge, descUpdate, descMerge, onChange) {
  let merge = initialMerge;
  const desc = h('div', { class: 'muted small' });
  const a = h('button', { class: 'chip', onclick: () => set(false) }, 'تحديث');
  const b = h('button', { class: 'chip', onclick: () => set(true) }, 'دمج');
  function set(m) { merge = m; a.classList.toggle('on', !m); b.classList.toggle('on', m); desc.textContent = m ? descMerge : descUpdate; onChange && onChange(m); }
  set(initialMerge);
  return { el: h('div', null, h('div', { class: 'chips' }, a, b), desc), get merge() { return merge; } };
}
