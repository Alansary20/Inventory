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

// ───── الأيقونات (نفس ملفات vector في التطبيق) ─────
const ICONS = {
  scan: 'M12,12m-3.2,0a3.2,3.2 0,1 1,6.4 0a3.2,3.2 0,1 1,-6.4 0 M9,2L7.17,4H4c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h16c1.1,0 2,-0.9 2,-2V6c0,-1.1 -0.9,-2 -2,-2h-3.17L15,2H9zM12,17c-2.76,0 -5,-2.24 -5,-5s2.24,-5 5,-5 5,2.24 5,5 -2.24,5 -5,5z',
  inventory: 'M19,3h-4.18C14.4,1.84 13.3,1 12,1c-1.3,0 -2.4,0.84 -2.82,2L5,3c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 2,2h14c1.1,0 2,-0.9 2,-2L21,5c0,-1.1 -0.9,-2 -2,-2zM12,3c0.55,0 1,0.45 1,1s-0.45,1 -1,1 -1,-0.45 -1,-1 0.45,-1 1,-1zM14,17L7,17v-2h7v2zM17,13L7,13v-2h10v2zM17,9L7,9L7,7h10v2z',
  stock: 'M2,20h20v-4H2v4zm2,-3h2v2H4v-2zM2,4v4h20V4H2zm4,3H4V5h2v2zm-4,7h20v-4H2v4zm2,-3h2v2H4v-2z',
  compare: 'M3.5,18.49l6,-6.01 4,4L22,6.92l-1.41,-1.41 -7.09,7.97 -4,-4L2,16.99z',
  products: 'M20,2H4c-1,0 -2,0.9 -2,2v3.01c0,0.72 0.43,1.34 1,1.69V20c0,1.1 1.1,2 2,2h14c0.9,0 2,-0.9 2,-2V8.7c0.57,-0.35 1,-0.97 1,-1.69V4c0,-1.1 -1,-2 -2,-2zM19,20H5V9h14v11zM20,7H4V4h16v3zM9,12h6v2H9z',
  prices: 'M21.41,11.58l-9,-9C12.05,2.22 11.55,2 11,2H4c-1.1,0 -2,0.9 -2,2v7c0,0.55 0.22,1.05 0.59,1.42l9,9c0.36,0.36 0.86,0.58 1.41,0.58 0.55,0 1.05,-0.22 1.41,-0.59l7,-7c0.37,-0.36 0.59,-0.86 0.59,-1.41 0,-0.55 -0.23,-1.06 -0.59,-1.42zM5.5,7C4.67,7 4,6.33 4,5.5S4.67,4 5.5,4 7,4.67 7,5.5 6.33,7 5.5,7z',
  up: 'M16,6l2.29,2.29 -4.88,4.88 -4,-4L2,16.59 3.41,18l6,-6 4,4 6.3,-6.29L22,12V6z',
  down: 'M16,18l2.29,-2.29 -4.88,-4.88 -4,4L2,7.41 3.41,6l6,6 4,-4 6.3,6.29L22,12v6z',
  bar: 'M3,5h2.2v14H3z M6.6,5h1.2v14H6.6z M9.4,5h3v14h-3z M14,5h1.2v14H14z M16.8,5h1.4v14h-1.4z M19.6,5h1.6v14h-1.6z',
  edit: 'M3,17.25V21h3.75L17.81,9.94l-3.75,-3.75L3,17.25zM20.71,7.04c0.39,-0.39 0.39,-1.02 0,-1.41l-2.34,-2.34c-0.39,-0.39 -1.02,-0.39 -1.41,0l-1.83,1.83 3.75,3.75 1.83,-1.83z',
  trash: 'M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V7H6v12zM19,4h-3.5l-1,-1h-5l-1,1H5v2h14V4z',
  upload: 'M9,16h6v-6h4l-7,-7 -7,7h4zM5,18h14v2H5z',
  download: 'M5,20h14v-2H5v2zM19,9h-4V3H9v6H5l7,7 7,-7z',
};
const ICONS_STROKE = {
  all: ['M4.5,4.5h15v15h-15z M12,4.5v15 M4.5,12h15', 2.4],
  match: ['M4,8.5l3.6,3.6l7.4,-7.4 M4,16.5l3.6,3.6l12.4,-12.4', 2.6],
  scale: ['M12,4v16 M7,20h10 M4,7h16 M4,7l-2.5,6a3,3 0,0 0,5 0z M20,7l-2.5,6a3,3 0,0 0,5 0z', 2.0],
};
function ico(name) {
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  if (ICONS_STROKE[name]) { p.setAttribute('d', ICONS_STROKE[name][0]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', ICONS_STROKE[name][1]); }
  else { p.setAttribute('d', ICONS[name]); p.setAttribute('fill', 'currentColor'); }
  svg.append(p); return svg;
}

// ───── إشعار ─────
let toastTimer = null;
function toast(msg, ms = 3200) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ───── نافذة البطاقة (CardDialog) ─────
function dialog({ title, icon, danger, subtitle, message, content, buttons = [], cancelable = true, scroll = false, stack = false }) {
  const close = () => { back.remove(); };
  const box = h('div', { class: 'dlg', role: 'dialog' },
    title ? h('div', { class: 'dlg-head' }, icon ? h('div', { class: 'dlg-ic' + (danger ? ' danger' : '') }, ico(icon)) : null, h('div', { class: 'dlg-title' }, title)) : null,
    subtitle ? h('div', { class: 'dlg-sub' }, subtitle) : null,
    message ? h('div', { class: 'dlg-msg', style: title ? '' : 'margin-top:0' }, message) : null,
    content ? h('div', { class: 'dlg-body' }, content) : null,
    buttons.length ? h('div', { class: 'dlg-btns' + (stack ? ' stack' : '') }, buttons.map((b) => h('button', {
      class: 'btn ' + (b.kind === 'primary' ? 'fill' : b.kind === 'danger' ? 'fill dlgdanger' : 'muted'),
      onclick: async () => { if (b.keep !== true) close(); if (b.onclick) await b.onclick(close); },
    }, b.icon ? [h('span', { class: 'bic' }, ico(b.icon)), b.label] : b.label))) : null);
  const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back && cancelable) close(); } }, box);
  document.body.append(back);
  return { close, box };
}
const confirmDlg = (title, message, okLabel, danger = true) => new Promise((res) => dialog({
  title, message, icon: danger ? 'trash' : 'edit', danger,
  buttons: [{ label: okLabel, kind: danger ? 'danger' : 'primary', onclick: () => res(true) }, { label: 'إلغاء', onclick: () => res(false) }],
  cancelable: true,
}));
// ───── اختيار الفرع ─────
function branchDialog(onChanged) {
  const list = h('div'), cur = () => Store.getBranch();
  let d = null;
  const paint = () => {
    const bs = [...Store.branches()];
    if (!bs.some((b) => b[0] === cur())) bs.unshift([cur(), 0]);
    list.replaceChildren(...bs.map(([name, n]) => {
      const on = name === cur();
      let timer = null;
      const del = async () => {
        if (!await confirmDlg('حذف رصيد الفرع', `حذف كل رصيد «${name}» (${n} صنف)؟`, 'حذف')) return;
        Store.deleteBranch(name);
        if (on) Store.setBranch(Store.branches().length ? Store.branches()[0][0] : Store.DEFAULT_BRANCH);
        toast('تم حذف رصيد الفرع'); paint(); onChanged && onChanged();
      };
      return h('div', { class: 'irow', style: 'cursor:pointer;margin-bottom:6px' + (on ? ';border-color:var(--accent)' : ''),
        onclick: () => { Store.setBranch(name); d.close(); onChanged && onChanged(); },
        oncontextmenu: (e) => { e.preventDefault(); del(); },
        ontouchstart: () => { timer = setTimeout(() => { timer = null; del(); }, 700); },
        ontouchend: () => clearTimeout(timer), ontouchmove: () => clearTimeout(timer) },
        h('div', { class: 'grow' }, h('b', { class: 'ell nm', style: on ? 'color:var(--accent)' : '' }, (on ? '✓ ' : '') + name), h('div', { class: 's10' }, `${n} صنف`)),
        h('button', { class: 'btn danger', style: 'min-height:34px;padding:0 10px;width:auto;flex:none', onclick: (e) => { e.stopPropagation(); del(); } }, '🗑'));
    }));
  };
  paint();
  const addNew = () => {
    const inp = h('input', { type: 'text', class: 'inp', placeholder: 'اسم الفرع' });
    dialog({ title: 'فرع جديد', icon: 'edit', content: inp, buttons: [
      { label: 'إضافة', kind: 'primary', onclick: () => { const v = inp.value.trim(); if (v) { Store.setBranch(v); d.close(); onChanged && onChanged(); } } },
      { label: 'إلغاء' }] });
    setTimeout(() => inp.focus(), 50);
  };
  d = dialog({ title: 'الفروع', icon: 'products', subtitle: 'اضغط فرعاً لاختياره (ضغطة مطوّلة أو 🗑 للحذف). الجرد والمقارنة يعملان على الفرع المختار.', content: list, scroll: true,
    buttons: [{ label: 'فرع جديد', kind: 'primary', keep: true, onclick: () => addNew() }, { label: 'إغلاق' }] });
  return d;
}
// تعديل الكمية: + على جهة البداية و − على النهاية كما في التطبيق
const promptQty = (title, current, name) => new Promise((res) => {
  const inp = h('input', { type: 'number', inputmode: 'numeric', value: current, min: 0, class: 'inp' });
  const step = (d) => { inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + d); };
  const box = h('div', { class: 'qedit' }, h('button', { class: 'btn', onclick: () => step(1) }, '+'), inp,
    h('button', { class: 'btn danger', onclick: () => step(-1) }, '−'));
  dialog({ title, icon: 'edit', subtitle: name || null, content: box, buttons: [{ label: 'حفظ', kind: 'primary', onclick: () => res(parseInt(inp.value, 10)) }, { label: 'إلغاء', onclick: () => res(null) }] });
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
});
function progressDialog(title) {
  const bar = h('div', { class: 'bar' }, h('i'));
  const label = h('div', { class: 'muted', style: 'font-size:12px;margin-top:8px' }, '');
  const d = dialog({ title, icon: 'upload', content: h('div', null, bar, label), cancelable: false });
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
  constructor(videoEl, onCode, onError) { this.video = videoEl; this.onCode = onCode; this.onError = onError; this.stream = null; this.running = false; this.caps = {}; this.track = null; this.onReady = null; this.lastHit = 0; }
  static supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  // أفضل عدسة خلفية (مثل bestFirst في التطبيق): الرئيسية لا الواسعة جداً ولا المقرِّبة
  async pickBack() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.label);
      const back = devs.filter((d) => /back|rear|environment|facing back|خلف/i.test(d.label));
      if (!back.length) return null;
      const score = (d) => {
        const l = d.label; let sc = 0;
        if (/ultra|wide-angle|0\.5|macro|depth|tele|zoom/i.test(l)) sc -= 10;
        if (/^back camera$/i.test(l.trim())) sc += 5;
        const m = l.match(/camera2?\s*(\d+)/i); if (m) sc -= parseInt(m[1], 10) * 0.1;
        return sc;
      };
      return back.sort((x, y) => score(y) - score(x))[0].deviceId || null;
    } catch (e) { return null; }
  }
  async open(deviceId, level) {
    let v;
    if (level === 0) v = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    else if (level === 1) v = { width: { ideal: 1280 }, height: { ideal: 720 } };
    else v = true;                       // أبسط طلب ممكن
    if (v !== true) { if (deviceId) v.deviceId = { exact: deviceId }; else v.facingMode = { ideal: 'environment' }; }
    return navigator.mediaDevices.getUserMedia({ video: v, audio: false });
  }
  // ننتظر ظهور إطارات فعلية (الشاشة السوداء = لا إطارات)
  async attach(stream) {
    const v = this.video;
    v.srcObject = stream; v.muted = true;
    v.setAttribute('playsinline', 'true'); v.setAttribute('webkit-playsinline', 'true');
    try { await v.play(); } catch (e) {}
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (v.readyState >= 2 && v.videoWidth > 0 && v.currentTime > 0) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }
  async start() {
    this.stop();
    this.running = true;
    let ok = false, lastErr = null, best = null;
    for (let level = 0; level < 3 && this.running && !ok; level++) {
      try {
        this.stream = await this.open(level === 0 ? null : null, level);
        if (level === 0 && this.running) {
          const cur = this.stream.getVideoTracks()[0].getSettings().deviceId;
          best = await this.pickBack();            // التسميات لا تظهر إلا بعد منح الإذن
          if (best && best !== cur) {
            // نغلق الأولى قبل فتح الثانية (بعض الهواتف لا تسمح بكاميرتين معاً)
            this.stream.getTracks().forEach((t) => t.stop()); this.stream = null;
            try { this.stream = await this.open(best, 0); }
            catch (e) { this.stream = await this.open(null, 0); }
          }
        }
        ok = await this.attach(this.stream);
        if (!ok) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
      } catch (e) {
        lastErr = e;
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
        if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
      }
    }
    if (!this.running) { this.stop(); return; }
    if (!ok || !this.stream) { this.running = false; this.onError(lastErr || new Error('لا تظهر صورة من الكاميرا')); return; }
    this.track = this.stream.getVideoTracks()[0];
    try { this.caps = this.track.getCapabilities ? this.track.getCapabilities() : {}; } catch (e) { this.caps = {}; }
    await this.setContinuous();
    if (this.onReady) this.onReady(this.caps);
    this.lastHit = Date.now();
    this.loop();
  }
  async setContinuous() {
    const c = this.caps, adv = {};
    if (c.focusMode && c.focusMode.includes('continuous')) adv.focusMode = 'continuous';
    if (c.exposureMode && c.exposureMode.includes('continuous')) adv.exposureMode = 'continuous';
    if (Object.keys(adv).length) { try { await this.track.applyConstraints({ advanced: [adv] }); } catch (e) {} }
  }
  // إعادة التركيز (لمس المعاينة) — مثل CONTROL_AF_TRIGGER_START
  async refocus() {
    const tr = this.track; if (!tr || !this.running) return;
    const c = this.caps;
    try {
      if (c.focusMode && c.focusMode.includes('single-shot')) {
        const adv = { focusMode: 'single-shot' };
        if (c.pointsOfInterest) adv.pointsOfInterest = [{ x: 0.5, y: 0.5 }];
        await tr.applyConstraints({ advanced: [adv] });
        setTimeout(() => { if (this.running) this.setContinuous(); }, 900);
      } else if (c.focusMode && c.focusMode.includes('continuous')) {
        await tr.applyConstraints({ advanced: [{ focusMode: 'manual' }] }); await this.setContinuous();
      }
    } catch (e) {}
  }
  async setZoom(z) { try { await this.track.applyConstraints({ advanced: [{ zoom: z }] }); } catch (e) {} }
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
    // zxing-cpp (WebAssembly): الأساس في سفاري/iOS، ورديف لقارئ المتصفح في كروم
    if (!detector) { try { wasm = await loadZXingWasm(); } catch (e) { this.onError(e); return; } }
    else loadZXingWasm().then((w) => { wasm = w; }).catch(() => {});
    const canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently: true });
    let n = 0;
    const tick = async () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          // نقرأ المنطقة المرئية فقط (وسط الإطار) بدقة عالية، مثل viewport في التطبيق
          const vw = v.videoWidth, vh = v.videoHeight;
          const box = v.getBoundingClientRect();
          const scale = Math.max(box.width / vw, box.height / vh) || 1;
          const sw = Math.min(vw, box.width / scale), sh = Math.min(vh, box.height / scale);
          const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
          const k = Math.min(1, 1800 / sw);
          canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
          cx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          let text = null;
          if (detector) { const r = await detector.detect(canvas); if (r.length) text = r[0].rawValue; }
          if (!text && wasm && (!detector || (n++ % 3 === 0))) {
            const r = await wasm.readBarcodes(cx.getImageData(0, 0, canvas.width, canvas.height), {
              formats: ZX_FORMATS, tryHarder: true, tryRotate: true, tryDownscale: true, tryInvert: false, maxNumberOfSymbols: 1 });
            if (r.length) text = r[0].text;
          }
          const c = text && this.clean(text);
          if (c) { this.lastHit = Date.now(); this.onCode(c); }
          else if (Date.now() - this.lastHit > 3500) { this.lastHit = Date.now(); this.refocus(); }   // لا قراءة منذ 3.5 ثانية: أعد التركيز
        } catch (e) {}
      }
      setTimeout(tick, 70);
    };
    tick();
  }
  stop() {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.track = null;
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
  await loadScript('vendor/exceljs.bare.min.js', 'ExcelJS');
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
const colLetter = (i) => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

function mapColumns(fileName, rows, fields) {
  return new Promise((res) => {
    const det = ColumnDetector.detect(rows, fields.map((f) => f.kind));
    const ncols = rows.slice(0, 30).reduce((m, r) => Math.max(m, r.length), 0);
    const noHeader = h('input', { type: 'checkbox', id: 'nohdr' });
    noHeader.checked = !det.hasHeader;
    const pv = h('div', { class: 'prev' });
    const paintPv = () => {
      const hasH = !noHeader.checked, data = rows.slice(hasH ? 1 : 0, (hasH ? 1 : 0) + 5);
      pv.replaceChildren(...[...Array(ncols).keys()].map((i) => {
        const hd = String((rows[0] && rows[0][i]) ?? '').trim();
        return h('div', { class: 'pc' }, h('div', { class: 'ph' }, hasH && hd ? colLetter(i) + ' · ' + hd : colLetter(i)),
          data.map((r) => { const v = String(r[i] ?? '').trim(); return h('div', { class: 'pv', style: v ? '' : 'color:var(--muted)' }, v || '—'); }));
      }));
    };
    const sels = fields.map((f) => h('select', { class: 'sel' }));
    const fill = () => {
      sels.forEach((s) => {
        const keep = s.selectedIndex;
        s.replaceChildren(h('option', { value: -1 }, '— بدون —'), ...[...Array(ncols).keys()].map((i) => {
          const hd = String((rows[0] && rows[0][i]) ?? '').trim();
          return h('option', { value: i }, noHeader.checked || !hd ? `عمود ${colLetter(i)}` : `${hd}  (${colLetter(i)})`);
        }));
        if (keep >= 0) s.selectedIndex = Math.min(keep, ncols);
      });
    };
    fill();
    fields.forEach((f, i) => { sels[i].value = det.cols[f.kind] != null ? det.cols[f.kind] : -1; });
    noHeader.addEventListener('change', () => { fill(); paintPv(); });
    paintPv();
    const content = h('div', null, h('div', { class: 'muted', style: 'font-size:12px' }, fileName),
      h('label', { class: 'chk' }, noHeader, 'بدون رؤوس'), pv,
      fields.map((f, i) => h('div', null, h('div', { class: 'fld-l', style: 'font-weight:400;margin:10px 0 2px' }, f.label + (f.required ? ' *' : '')), sels[i])));
    dialog({ title: 'تعيين الأعمدة', icon: 'upload', content, cancelable: false, buttons: [
      { label: 'تأكيد ومعالجة', kind: 'primary', onclick: () => res({ cols: sels.map((s) => parseInt(s.value, 10)), noHeader: noHeader.checked }) },
      { label: 'إلغاء', onclick: () => res(null) },
    ] });
  });
}

/** يقرأ الملفات المختارة ويسأل عن الورقة إن تعددت. يعيد [{name, rows}] أو null. */
async function readFiles(fileList) {
  const out = [];
  for (const f of fileList) {
    const wait = progressDialog('جارٍ قراءة الملف…');
    wait.set(0.5, f.name);
    await new Promise((r) => setTimeout(r, 30));   // يتيح رسم النافذة قبل القراءة الثقيلة
    let wb;
    try { wb = await TableReader.readBook(f); }
    catch (e) { wait.close(); toast('تعذّرت قراءة الملف: ' + (e.message || e)); return null; }
    wait.close();
    let sheet = wb.SheetNames[0];
    if (wb.SheetNames.length > 1) {
      sheet = await new Promise((res) => {
        const nm = 'sheet' + Math.random().toString(36).slice(2);
        const box = h('div', null, wb.SheetNames.map((n, i) => h('label', { class: 'chk', style: 'padding:10px 6px' }, h('input', { type: 'radio', name: nm, value: n, checked: i === 0 }), n)));
        dialog({ title: 'اختر الورقة (Sheet) المراد استيرادها', icon: 'upload', subtitle: f.name, content: box, cancelable: false, buttons: [
          { label: 'تأكيد ومعالجة', kind: 'primary', onclick: () => res((box.querySelector('input:checked') || {}).value) }, { label: 'إلغاء', onclick: () => res(null) }] });
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

/** قائمة بتمرير لا نهائي (50 في الدفعة) مثل ListView في التطبيق. */
function pagedList(container, fetchPage, renderRow, emptyText) {
  const PAGE = 50;
  let offset = 0, done = false, token = 0;
  const holder = h('div');
  const sentinel = h('div', { style: 'height:1px' });
  const empty = h('div', { class: 'empty' }, emptyText);
  container.replaceChildren(empty, holder, sentinel);
  function load() {
    if (done) return;
    const page = fetchPage(PAGE, offset);
    page.forEach((r) => holder.append(h('div', { class: 'wrap' }, renderRow(r))));
    offset += page.length;
    if (page.length < PAGE) done = true;
    empty.style.display = offset === 0 ? '' : 'none';
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: '800px' }).observe(sentinel);
  return { reload() { token++; offset = 0; done = false; holder.replaceChildren(); load(); } };
}

function searchBox(onChange, placeholder = 'ابحث بالاسم أو الباركود أو رقم الصنف', icon = true) {
  let t = null;
  return h('input', { class: 'inp s14', type: 'search', placeholder: (icon ? '🔍  ' : '') + placeholder, oninput: (e) => { clearTimeout(t); const v = e.target.value.trim(); t = setTimeout(() => onChange(v), v ? 250 : 0); } });
}

function modeChips(initialMerge, descUpdate, descMerge, onChange) {
  let merge = initialMerge;
  const desc = h('div', { class: 'desc' });
  const a = h('button', { class: 'btn chip', onclick: () => set(false) }, 'تحديث');
  const b = h('button', { class: 'btn chip', onclick: () => set(true), style: 'margin-inline-start:8px' }, 'دمج');
  function set(m) { merge = m; a.classList.toggle('on', !m); b.classList.toggle('on', m); desc.textContent = m ? descMerge : descUpdate; onChange && onChange(m); }
  set(initialMerge);
  return { el: h('div', null, h('div', { class: 'row', style: 'margin-top:10px' }, a, b), desc), get merge() { return merge; } };
}
