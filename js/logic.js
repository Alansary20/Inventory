/* منطق التطبيق: فهرس الأسماء، فهرس الأسعار، محرك المسح، المقارنة، الاستيراد (منقول من الأندرويد) */
'use strict';

const UNKNOWN_NAME = '❓ غير معروف';
const unknownLabels = () => [...new Set([UNKNOWN_NAME, '❓ غير معروف', '❓ Unknown'])];

// ───────── فهرس الأسماء ─────────
const Names = (() => {
  let cache = null;
  function build(version) {
    const prods = Store.allProducts(), stock = Store.allStock();
    const list = [], codes = new Set(), nkByCode = new Map();
    const add = (name, itemNo, barcode, key) => {
      if (!String(name).trim()) return;
      list.push({ name, itemNo, barcode, key, tokens: new Set(Codes.normTokens(name)) });
    };
    for (const p of prods) {
      add(p.name, p.itemNo, p.barcode, p.itemNo || p.barcode);
      if (p.itemNo) codes.add(p.itemNo);
      if (p.barcode) codes.add(p.barcode);
      altList(p.altBarcodes).forEach((a) => codes.add(a));
      const nk = Codes.nameKey(p.name);
      if (p.itemNo) nkByCode.set(p.itemNo, nk);
      if (p.barcode) nkByCode.set(p.barcode, nk);
    }
    const seenSt = new Set();
    for (const s of stock) {
      const dk = s.key + '|' + Codes.nameKey(s.name);
      if (seenSt.has(dk)) continue;
      seenSt.add(dk);
      if (codes.has(s.key) || (s.itemNo && codes.has(s.itemNo)) || (s.barcode && codes.has(s.barcode))) {
        // له منتج: نضيف اسمه في الرصيد فقط إن اختلف عن اسم المنتج
        const pk = nkByCode.get(s.key) ?? nkByCode.get(s.itemNo) ?? nkByCode.get(s.barcode);
        if (pk !== undefined && pk !== Codes.nameKey(s.name)) add(s.name, s.itemNo, s.barcode, s.key);
        continue;
      }
      add(s.name, s.itemNo, s.barcode, s.key);
    }
    const byKey = new Map();
    for (const h of list) {
      const k = [...h.tokens].sort().join(' ');
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(h);
    }
    return {
      version,
      exact(q) { const l = byKey.get(Codes.nameKey(q)); return l && l.length === 1 ? l[0] : null; },
      search(q, max = 300) {
        const qt = [...new Set(Codes.normTokens(q))];
        if (!qt.length || (qt.length === 1 && qt[0].length < 2)) return { list: [], full: true };
        const direct = byKey.get([...qt].sort().join(' '));
        if (direct) return { list: direct.slice(0, max), full: true };
        const tokMatch = (w, t) => (t === w ? 3 : t.startsWith(w) ? 2 : (w.length >= 2 && t.includes(w)) ? 1 : 0);
        const scored = [];
        for (const h of list) {
          let m = 0, sc = 0;
          for (const w of qt) {
            let best = 0;
            for (const t of h.tokens) { const v = tokMatch(w, t); if (v > best) best = v; if (best === 3) break; }
            if (best > 0) { m++; sc += best; }
          }
          if (m > 0) scored.push({ h, m, sc });
        }
        const full = scored.filter((x) => x.m === qt.length);
        if (full.length) return { list: full.sort((a, b) => b.sc - a.sc || a.h.tokens.size - b.h.tokens.size).slice(0, max).map((x) => x.h), full: true };
        const need = Math.max(1, Math.floor((qt.length + 1) / 2));
        const part = scored.filter((x) => x.m >= need).sort((a, b) => b.m - a.m || b.sc - a.sc || a.h.tokens.size - b.h.tokens.size);
        return { list: part.slice(0, max).map((x) => x.h), full: false };
      },
      candidates(q, max = 300) { return this.search(q, max).list; },
    };
  }
  return {
    get() {
      const v = Store.state.dataVersion;
      if (cache && cache.version === v) return cache;
      cache = build(v);
      return cache;
    },
  };
})();

// ───────── فهرس الأسعار ─────────
const PricesIndex = (() => {
  let cache = null;
  const normBarcode = (s) => {
    const t = String(s).trim();
    if (t.length < 6 || !/^\d+$/.test(t)) return null;
    return t.replace(/^0+/, '') || null;
  };
  function build(version) {
    const prods = Store.allProducts(), stockArr = Store.allStock();
    const nameMap = new Map();
    const allBranches = Store.branches().map((b) => b[0]);
    const qtyMap = new Map(); // key -> Map(branch -> qty)
    for (const s of stockArr) {
      let m = qtyMap.get(s.key); if (!m) { m = new Map(); qtyMap.set(s.key, m); }
      m.set(s.branch, (m.get(s.branch) || 0) + s.qty);
      if (!nameMap.has(s.key)) nameMap.set(s.key, s.name || s.key);
    }
    const sumOf = (m) => { let t = 0; for (const v of m.values()) t += v; return t; };
    const brList = (m) => allBranches.map((b) => [b, (m && m.get(b)) || 0]).sort((x, y) => y[1] - x[1]);  // الأعلى رصيداً أولاً
    const items = [], byCode = new Map(), byBarcode = new Map(), matched = new Set();
    const PProto = { get lcName() { return this._ln !== undefined ? this._ln : (this._ln = Ar.norm(this.name)); } };   // يُحسب عند أول استخدام فقط
    const mk = (o) => Object.assign(Object.create(PProto), o, { lcCode: o.code.toLowerCase(), lcItem: o.itemNo.toLowerCase(), lcBar: o.barcode.toLowerCase() });
    for (const p of prods) {
      const code = p.itemNo || p.barcode;
      if (!code) continue;
      const name = p.name || code;
      const orig = p.priceOrig, sale = p.priceSale !== 0 ? p.priceSale : orig;
      const disc = orig > 0 ? Math.round((orig - sale) / orig * 100) : 0;
      let stk = 0, bm = null;
      if (p.itemNo && qtyMap.has(p.itemNo)) { bm = qtyMap.get(p.itemNo); stk = sumOf(bm); matched.add(p.itemNo); }
      if (p.barcode && qtyMap.has(p.barcode)) { bm = qtyMap.get(p.barcode); stk = sumOf(bm); matched.add(p.barcode); }
      const alts = altList(p.altBarcodes);
      const codes = [];
      if (p.barcode) codes.push(p.barcode);
      for (const a of alts) if (a !== p.barcode) codes.push(a);
      const item = mk({ code, name, orig, sale, disc, stock: stk, branches: brList(bm), itemNo: p.itemNo, barcode: p.barcode, product: p, barcodes: codes });
      items.push(item);
      if (p.itemNo) { byCode.set(p.itemNo, item); matched.add(p.itemNo); }
      if (p.barcode) { byCode.set(p.barcode, item); byBarcode.set(p.barcode, item); matched.add(p.barcode); }
      for (const a of alts) { byCode.set(a, item); byBarcode.set(a, item); matched.add(a); }
    }
    const doneKeys = new Set();
    for (const s of stockArr) {
      if (matched.has(s.key) || doneKeys.has(s.key)) continue;
      doneKeys.add(s.key);
      const bm = qtyMap.get(s.key);
      const code = s.key, keyDigits = /^\d+$/.test(code);
      const itemNo = s.itemNo || (!keyDigits ? code : '');
      const bc = s.barcode || (keyDigits ? code : '');
      const item = mk({ code, name: nameMap.get(code) || code, orig: 0, sale: 0, disc: 0, stock: sumOf(bm), branches: brList(bm), itemNo, barcode: bc, product: null, barcodes: bc ? [bc] : [] });
      items.push(item);
      byCode.set(code, item);
      if (itemNo) byCode.set(itemNo, item);
      if (bc) { byCode.set(bc, item); byBarcode.set(bc, item); }
    }
    items.sort((a, b) => (b.stock - a.stock) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const norm = new Map();
    for (const [k, v] of byBarcode) { const n = normBarcode(k); if (n && !norm.has(n)) norm.set(n, v); }
    return {
      version, list: items,
      findBarcode(q) { const x = byBarcode.get(q); if (x) return x; const n = normBarcode(q); return n ? norm.get(n) || null : null; },
      findCode(q) { return byCode.get(q) || this.findBarcode(q); },
      filterCode(q) { const ql = q.toLowerCase(); return items.filter((i) => i.lcCode.includes(ql) || i.lcItem.includes(ql) || i.lcBar.includes(ql)); },
      filterName(q) { const ql = Ar.norm(q); return items.filter((i) => i.lcName.includes(ql)); },
    };
  }
  return {
    get() {
      const v = Store.state.dataVersion;
      if (cache && cache.version === v) return cache;
      cache = build(v);
      return cache;
    },
  };
})();

// ───────── محرك المسح ─────────
const ScanEngine = (() => {
  const sanitize = (raw) => {
    if (raw == null) return null;
    const v = String(raw).trim().replace(/[\x00-\x1F\x7F]/g, '').replace(/\.0+$/, '');
    return v || null;
  };
  const addHit = (h) => { Store.addToInventory(h.key, h.name, h.barcode, h.itemNo); return { kind: 'FOUND', name: h.name, code: h.key }; };
  function process(raw) {
    const code = sanitize(raw);
    if (!code) return { kind: 'INVALID' };
    const isBarcode = /^\d+$/.test(code), isItemNo = /^\d+-[\d-]+$/.test(code);
    const match = isBarcode ? (Store.findByBarcode(code) || Store.findByItemNo(code))
      : isItemNo ? (Store.findByItemNo(code) || Store.findByBarcode(code))
        : (Store.findByBarcode(code) || Store.findByItemNo(code));
    if (match) {
      Store.addToInventory(match.itemNo || match.barcode, match.name, match.barcode, match.itemNo);
      return { kind: 'FOUND', name: match.name, code };
    }
    const st = Store.findStock(code);
    if (st) {
      const keyDigits = /^\d+$/.test(st.key);
      const itemNo = st.itemNo || (!keyDigits ? st.key : '');
      const barcode = st.barcode || (isBarcode ? code : keyDigits ? st.key : '');
      const name = st.name || st.key;
      Store.upsertProducts([{ id: uuid(), barcode, itemNo, name, altBarcodes: '', priceOrig: 0, priceSale: 0, sourceId: 0 }]);
      Store.addToInventory(itemNo || barcode || st.key, name, barcode, itemNo);
      return { kind: 'AUTO', name, code };
    }
    if (Codes.searchableAsName(code)) {
      const idx = Names.get();
      const ex = idx.exact(code);
      if (ex) return addHit(ex);
      const r = idx.search(code);
      if (r.list.length === 1 && r.full) return addHit(r.list[0]);
      if (r.list.length) return { kind: 'CHOOSE', code, choices: r.list };
      if (Codes.looksLikeName(code)) {
        Store.addToInventory(code, code, '', '');
        return { kind: 'NAME_ONLY', name: code, code };
      }
    }
    const uItem = isItemNo ? code : '', uBar = isBarcode ? code : '';
    Store.addToInventory(uItem || uBar || code, UNKNOWN_NAME, uBar, uItem);
    return { kind: 'UNKNOWN', name: UNKNOWN_NAME, code };
  }
  return { sanitize, process, addHit };
})();

// ───────── المقارنة ─────────
function buildCompare() {
  const inv = Store.allInventory(), stock = Store.allStock(Store.getBranch()), prods = Store.allProducts();
  const unknown = unknownLabels();
  const prodsMap = new Map();
  for (const p of prods) {
    if (p.itemNo) prodsMap.set(p.itemNo, p);
    if (p.barcode && p.barcode !== p.itemNo) prodsMap.set(p.barcode, p);
    for (const ab of altList(p.altBarcodes)) if (ab !== p.itemNo) prodsMap.set(ab, p);
  }
  let namesIdx = null; const names = { exact: (k) => (namesIdx || (namesIdx = Names.get())).exact(k) };
  const canonical = (k) => {
    const p = prodsMap.get(k);
    if (p && p.itemNo) return p.itemNo;
    if (p && p.barcode) return p.barcode;   // أي باركود للمنتج يرجع لرئيسيه
    if (!p && !Codes.isBarcode(k) && !Codes.isItemNo(k) && Codes.looksLikeName(k)) {
      const h = names.exact(k);
      if (h && h.itemNo) return h.itemNo;
    }
    return k;
  };
  const unk = (n) => !String(n).trim() || unknown.includes(n);
  const invMap = new Map();
  for (const i of inv) {
    const ck = canonical(i.key), ex = invMap.get(ck);
    invMap.set(ck, !ex ? i : { ...ex, qty: ex.qty + i.qty, name: unk(ex.name) ? i.name : ex.name, barcode: ex.barcode || i.barcode, itemNo: ex.itemNo || i.itemNo });
  }
  const stockMap = new Map();
  for (const s of stock) stockMap.set(canonical(s.key), s);
  const keys = new Set([...invMap.keys(), ...stockMap.keys()]);
  const rows = [];
  let inc = 0, dec = 0, match = 0;
  for (const k of keys) {
    const i = invMap.get(k), s = stockMap.get(k);
    const qi = i ? i.qty : 0, qs = s ? s.qty : 0, diff = qi - qs;
    const fp = prodsMap.get(k);
    const isDash = /^\d+-[\d-]+$/.test(k), isDigits = /^\d+$/.test(k);
    const itemNo = ((i && i.itemNo) || (s && s.itemNo) || '') || (fp && fp.itemNo) || (isDash ? k : '');
    const barcode = ((i && i.barcode) || (s && s.barcode) || '') || (fp && fp.barcode) || (isDigits ? k : '');
    const invName = i ? i.name : '';
    const name = (!unk(invName) && invName !== k) ? invName : (fp && fp.name && fp.name.trim()) ? fp.name : (s && s.name && s.name.trim()) ? s.name : invName;
    rows.push({ key: k, itemNo, barcode, name, qs, qi, diff });
    if (diff > 0) inc++; else if (diff < 0) dec++; else if (qi > 0) match++;
  }
  return { rows, inc, dec, match, invLen: inv.length, stockLen: stock.length };
}

// ───────── قراءة الملفات (Excel / CSV) ─────────
const TableReader = {
  async readBook(file) {
    await loadScript('vendor/xlsx.full.min.js', 'XLSX');
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
  },
  rowsOf(wb, sheetName) {
    const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
    if (!ws) return [];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    return aoa.map((r) => r.map((v) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v))))
      .filter((r) => r.some((c) => String(c).trim() !== ''));
  },
};

// ───────── التعرف على الأعمدة ─────────
const ColumnDetector = (() => {
  const H = {
    BARCODE: ['باركود', 'بار كود', 'barcode', 'bar code', 'ean', 'upc', 'gtin'],
    ITEM_NO: ['رقم الصنف', 'رقم المادة', 'كود الصنف', 'كود المادة', 'رقم المنتج', 'item no', 'item code', 'item number', 'item#', 'sku', 'itemno'],
    ITEM_WEAK: ['رقم', 'code', 'كود', 'item'],
    NAME: ['اسم', 'الاسم', 'وصف', 'البيان', 'بيان', 'name', 'desc', 'المادة', 'المنتج', 'product'],
    QTY: ['كمية', 'الكمية', 'qty', 'quantity', 'عدد', 'رصيد', 'الفعلي', 'count', 'النهائي', 'تحويل'],
    PRICE_ORIG: ['السعر الأساسي', 'سعر أساسي', 'أساسي', 'أصلي', 'السعر الأصلي', 'original', 'قبل الخصم', 'base price', 'سعر1', 'سعر قبل'],
    PRICE_SALE: ['بعد الخصم', 'السعر بعد الخصم', 'سعر العرض', 'عرض', 'خصم', 'sale', 'discount', 'صافي', 'net', 'سعر2', 'سعر بعد'],
    BRANCH: ['فرع', 'الفرع', 'فروع', 'مخزن', 'المخزن', 'مستودع', 'المستودع', 'branch', 'store', 'warehouse', 'location', 'الموقع'],
    LAST_SCAN: ['آخر مسح', 'تاريخ', 'date', 'time', 'الوقت', 'last scan', 'مسح'],
  };
  const has = (h, words) => words.some((w) => h.includes(w));
  const isNumber = (s) => { const t = String(s).replace(/,/g, ''); return t !== '' && Number.isFinite(Number(t)); };
  const looksDate = (s) => s.length >= 8 && /\d/.test(s) && (s.includes(':') || /\d{4}-\d{1,2}-\d{1,2}/.test(s) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s));
  function looksLikeHeader(row) {
    if (!row) return false;
    const cells = row.map((x) => String(x).trim()).filter((x) => x);
    if (!cells.length) return false;
    if (cells.some((c) => Codes.isBarcode(c) || Codes.isItemNo(c) || isNumber(c))) return false;
    return cells.some((c) => /\p{L}/u.test(c));
  }
  function detect(rows, kinds) {
    const sample = rows.slice(0, 60);
    const hasHeader = looksLikeHeader(sample[0]);
    const header = hasHeader ? sample[0].map((x) => String(x).trim().toLowerCase()) : [];
    const data = hasHeader ? sample.slice(1) : sample;
    const ncols = sample.reduce((m, r) => Math.max(m, r.length), 0);
    const prof = [];
    for (let j = 0; j < ncols; j++) {
      const cells = data.map((r) => (r[j] == null ? '' : String(r[j]).trim())).filter((s) => s);
      const n = cells.length;
      const r = (f) => (n ? cells.filter(f).length / n : 0);
      prof.push({
        n, rBar: r((c) => Codes.isBarcode(c)), rItem: r((c) => Codes.isItemNo(c)), rName: r((c) => Codes.looksLikeName(c)),
        rNum: r((c) => isNumber(c) && !Codes.isBarcode(c) && c.length <= 9), rDate: r(looksDate),
        distinct: new Set(cells).size,
        rCodeLike: r((c) => Codes.isBarcode(c) || Codes.isItemNo(c) || isNumber(c) || looksDate(c)),
      });
    }
    const cands = [];
    const allH = [].concat(H.BARCODE, H.ITEM_NO, H.NAME, H.QTY, H.PRICE_ORIG, H.PRICE_SALE, H.LAST_SCAN, H.BRANCH);
    for (let j = 0; j < ncols; j++) {
      const h = header[j] || '', p = prof[j];
      for (const k of kinds) {
        let s = 0;
        switch (k) {
          case 'BARCODE': if (has(h, H.BARCODE)) s += 3; s += 4 * p.rBar; break;
          case 'ITEM_NO':
            if (has(h, H.ITEM_NO)) s += 3;
            else if (has(h, H.ITEM_WEAK) && !has(h, H.NAME) && !has(h, H.BARCODE)) s += 1.5;
            s += 4 * p.rItem; break;
          case 'NAME': if (has(h, H.NAME)) s += 3; s += 4 * p.rName; break;
          case 'QTY': if (has(h, H.QTY)) s += 3; s += 3 * p.rNum - 2 * p.rName; break;
          case 'PRICE_ORIG': if (has(h, H.PRICE_ORIG)) s += 3; s += p.rNum; break;
          case 'PRICE_SALE': if (has(h, H.PRICE_SALE)) s += 3; s += p.rNum; break;
          case 'BRANCH':
            if (has(h, H.BRANCH)) s += 3;
            if (p.n >= 4 && p.distinct >= 2 && p.distinct <= 40 && p.distinct <= p.n / 3 && p.rCodeLike < 0.3 && p.rName > 0.5) s += 2;
            break;
          case 'LAST_SCAN': if (has(h, H.LAST_SCAN)) s += 3; s += 4 * p.rDate; break;
        }
        const min = (k === 'BARCODE' || k === 'ITEM_NO' || k === 'NAME') ? 2 : k === 'QTY' ? 2.5 : 3;  // BRANCH: 3
        if (p.n > 0 || has(h, allH)) if (s >= min) cands.push({ kind: k, col: j, score: s });
      }
    }
    const out = {}, used = new Set();
    for (const c of cands.sort((a, b) => b.score - a.score)) {
      if (c.kind in out || used.has(c.col)) continue;
      out[c.kind] = c.col; used.add(c.col);
    }
    return { cols: out, hasHeader };
  }
  return { detect, looksLikeHeader };
})();

// ───────── استيراد المنتجات ─────────
const ProductImporter = {
  /** sources: [{name, rows}]، map: {barcode,itemNo,name,priceOrig,priceSale,noHeader} */
  async run(sources, map, merge, noNameLabel, progress) {
    progress(0.02, '');
    if (!merge) Store.clearProducts();
    const byItemNo = new Map(), byBarcode = new Map();
    const index = (p) => {
      if (p.itemNo) byItemNo.set(p.itemNo, p);
      if (p.barcode) byBarcode.set(p.barcode, p);
      for (const a of altList(p.altBarcodes)) byBarcode.set(a, p);
    };
    if (merge) Store.allProducts().forEach(index);
    const sourceId = Date.now();
    const res = { added: 0, updated: 0, skipped: 0, badPrice: 0, dupBarcode: 0, dupItem: 0 };
    const barcodeItem = new Map(), seenItem = new Set(), touched = new Set();
    const cell = (row, i) => (i >= 0 && i < row.length ? String(row[i]) : '');
    for (let fi = 0; fi < sources.length; fi++) {
      const src = sources[fi];
      const rows = src.rows, from = map.noHeader ? 0 : 1, total = Math.max(0, rows.length - from);
      for (let start = from; start < rows.length;) {
        const end = Math.min(start + 500, rows.length);
        const changed = [];
        for (let ri = start; ri < end; ri++) {
          const row = rows[ri];
          const bParts = splitCodes(cell(row, map.barcode)).map(cleanCode).filter((x) => x);
          const [barcode, itemNo] = Codes.fix(longestCode(bParts), cleanCode(cell(row, map.itemNo)));   // الرئيسي هو الأطول
          const allB = new Set();
          if (barcode) allB.add(barcode);
          for (const b of bParts) if (b && b !== itemNo) allB.add(b);
          const name = cell(row, map.name).trim();
          const origN = map.priceOrig >= 0 ? parseNumber(cell(row, map.priceOrig)) : null;
          const saleN = map.priceSale >= 0 ? parseNumber(cell(row, map.priceSale)) : null;
          const priceOrig = origN ?? 0, priceSale = saleN ?? priceOrig;
          if (!barcode && !itemNo) { res.skipped++; continue; }
          if (map.priceOrig >= 0 && cell(row, map.priceOrig).trim() && origN == null) res.badPrice++;
          if (barcode) {
            const prev = barcodeItem.get(barcode);
            if (prev === undefined) barcodeItem.set(barcode, itemNo);
            else if (prev && itemNo && prev !== itemNo) res.dupBarcode++;
          }
          if (itemNo && seenItem.has(itemNo)) {
            const known = byItemNo.get(itemNo);
            const trulyDup = !allB.size || !known || [...allB].every((b) => b === known.barcode || altList(known.altBarcodes).includes(b));
            if (trulyDup) res.dupItem++;
          }
          if (itemNo) seenItem.add(itemNo);
          // لا دمج تلقائي للمكرر داخل نفس الاستيراد (الدمج يدوياً بزر «دمج المنتجات المكررة»)
          let existing = (itemNo ? byItemNo.get(itemNo) : null);
          if (!existing) for (const b of allB) { const x = byBarcode.get(b); if (x) { existing = x; break; } }
          if (existing && touched.has(existing.id)) existing = null;
          if (existing) {
            const alts = altList(existing.altBarcodes);
            let main = existing.barcode;
            for (const b of allB) {
              if (b === main) continue;
              if (!main) main = b; else if (!alts.includes(b)) alts.push(b);
            }
            // الرئيسي هو الأطول بين كل الباركودات (القديمة والجديدة)
            const pool = [...new Set([main, ...alts].filter((x) => x))];
            if (pool.length) { main = longestCode(pool); alts.length = 0; alts.push(...pool.filter((x) => x !== main)); }
            const hasOrig = map.priceOrig >= 0 && origN != null, hasSale = map.priceSale >= 0 && saleN != null;
            const p = { ...existing, barcode: main, altBarcodes: alts.join(','), itemNo: itemNo || existing.itemNo, name: name || existing.name,
              priceOrig: hasOrig ? priceOrig : existing.priceOrig, priceSale: (hasSale || hasOrig) ? priceSale : existing.priceSale };
            changed.push(p); index(p); touched.add(p.id); res.updated++;
            continue;
          }
          const p = { id: uuid(), barcode, itemNo, altBarcodes: [...allB].slice(1).join(','), name: name || noNameLabel, priceOrig, priceSale, sourceId };
          changed.push(p); touched.add(p.id); res.added++;
        }
        Store.upsertProducts(changed);
        start = end;
        const done = start - from;
        progress(0.05 + 0.9 * (fi + done / Math.max(1, total)) / sources.length, `${src.name}  ${done} / ${total}`);
        await new Promise((r) => setTimeout(r, 0));
      }
      Store.addUploadedFile(src.name, 'products');
    }
    progress(1, '');
    return res;
  },

  dedupe() {
    const groups = new Map();
    for (const p of Store.allProducts()) {
      const key = p.itemNo ? 'i:' + p.itemNo : p.barcode ? 'b:' + p.barcode : 'x:' + p.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const del = [], ups = [];
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const keeper = g[0], codes = new Set();
      for (const p of g) { if (p.barcode) codes.add(p.barcode); altList(p.altBarcodes).forEach((a) => codes.add(a)); }
      const main = longestCode([...codes]);
      codes.delete(main);
      ups.push({ ...keeper, barcode: main, altBarcodes: [...codes].join(','),
        name: (g.map((p) => p.name).find((n) => n.trim())) || keeper.name,
        priceOrig: (g.map((p) => p.priceOrig).find((x) => x !== 0)) || 0,
        priceSale: (g.map((p) => p.priceSale).find((x) => x !== 0)) || 0 });
      g.slice(1).forEach((p) => del.push(p.id));
    }
    Store.deleteProducts(del);
    Store.upsertProducts(ups);
    return del.length;
  },
};

// ───────── استيراد الرصيد والجرد ─────────
const cellOf = (r, i) => (i >= 0 && i < r.length ? String(r[i]).trim().replace(/\.0+$/, '') : '');

async function importStock(sources, cols, noHeader, merge, progress) {
  const cur = Store.getBranch();
  const bk = (b, c) => b + '\u0001' + c;
  const byKey = new Map(), cleared = new Set(), fileBranches = [];
  if (merge) for (const e of Store.allStock()) { if (e.itemNo) byKey.set(bk(e.branch, e.itemNo), e); if (e.barcode) byKey.set(bk(e.branch, e.barcode), e); byKey.set(bk(e.branch, e.key), e); }
  for (let fi = 0; fi < sources.length; fi++) {
    const src = sources[fi];
    const rows = noHeader ? src.rows : src.rows.slice(1);
    for (let start = 0; start < rows.length;) {
      const end = Math.min(start + 500, rows.length);
      const batch = new Map();
      for (let ri = start; ri < end; ri++) {
        const r = rows[ri];
        const [barcode, itemNo] = Codes.fix(pickLongestBarcode(cellOf(r, cols[1])), cellOf(r, cols[0]));
        const key = itemNo || barcode;
        if (!key) continue;
        const branch = cellOf(r, cols[4]) || cur;
        if (!fileBranches.includes(branch)) fileBranches.push(branch);
        // تحديث: يُمسح فقط رصيد الفروع الموجودة في الملف (عند أول ظهور لكل فرع)
        if (!merge && !cleared.has(branch)) { Store.clearStockBranches([branch]); cleared.add(branch); }
        const name = cellOf(r, cols[2]);
        const qn = parseNumber(cellOf(r, cols[3]));
        const qty = qn == null ? 0 : Math.trunc(qn);
        const ex = merge ? ((itemNo ? byKey.get(bk(branch, itemNo)) : null) || (barcode ? byKey.get(bk(branch, barcode)) : null)) : null;
        const same = batch.get(bk(branch, ex ? ex.key : key));
        const base = same || ex;
        const rec = { branch, key: ex ? ex.key : key, itemNo: itemNo || (base && base.itemNo) || '', barcode: barcode || (base && base.barcode) || '',
          name: name || (base && base.name) || '', qty: ((base && base.qty) || 0) + qty };
        batch.set(bk(branch, rec.key), rec);
        if (merge) { if (rec.itemNo) byKey.set(bk(branch, rec.itemNo), rec); if (rec.barcode) byKey.set(bk(branch, rec.barcode), rec); byKey.set(bk(branch, rec.key), rec); }
      }
      Store.upsertStock([...batch.values()]);
      start = end;
      progress((fi + start / Math.max(1, rows.length)) / sources.length, `${src.name}  ${start} / ${rows.length}`);
      await new Promise((r) => setTimeout(r, 0));
    }
    Store.addUploadedFile(src.name, 'stock');
  }
  // إن لم يكن للفرع الحالي رصيد نحوّل الجرد إلى أول فرع في الملف
  if (fileBranches.length && Store.countStock(Store.getBranch()) === 0) Store.setBranch(fileBranches[0]);
  Store.reconcile(unknownLabels());
  return { records: Store.countStock(), branches: Store.branches().length };
}

function importInventoryRows(src, cols, noHeader, merge) {
  const rows = noHeader ? src.rows : src.rows.slice(1);
  const now = Date.now(), parsed = [];
  for (const r of rows) {
    const [bc, inNo] = Codes.fix(pickLongestBarcode(cellOf(r, cols[0])), cellOf(r, cols[1]));
    const qn = parseNumber(cellOf(r, cols[3]));
    const qty = qn == null ? 0 : Math.trunc(qn);
    if ((!bc && !inNo) || qty <= 0) continue;
    parsed.push({ key: inNo || bc, name: cellOf(r, cols[2]), qty, barcode: bc, itemNo: inNo, timestamp: now });
  }
  if (!parsed.length) return -1;
  const existing = new Map();
  if (merge) for (const e of Store.allInventory()) { if (e.itemNo) existing.set(e.itemNo, e); if (e.barcode) existing.set(e.barcode, e); existing.set(e.key, e); }
  const grouped = new Map();
  for (const p of parsed) { const g = grouped.get(p.key); grouped.set(p.key, g ? { ...g, qty: g.qty + p.qty } : p); }
  const toWrite = [...grouped.values()], mergeMap = {};
  for (const w of toWrite) {
    const x = (w.itemNo && existing.get(w.itemNo)) || (w.barcode && existing.get(w.barcode)) || existing.get(w.key);
    if (x) mergeMap[w.key] = x;
  }
  Store.importInventory(toWrite, !merge, mergeMap);
  return toWrite.length;
}
