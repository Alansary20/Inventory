/* أدوات مشتركة: البحث العربي الذكي، تمييز الأكواد، تنظيف الأرقام (منقولة من تطبيق الأندرويد) */
'use strict';

const Ar = (() => {
  const TASHKEEL = /[ً-ٰٟـ]/g;
  const fold = (ch) => {
    switch (ch) {
      case 'أ': case 'إ': case 'آ': case 'ٱ': return 'ا';
      case 'ة': return 'ه';
      case 'ى': case 'ئ': return 'ي';
      case 'ؤ': return 'و';
    }
    const c = ch.charCodeAt(0);
    if (c >= 0x660 && c <= 0x669) return String.fromCharCode(48 + c - 0x660);
    if (c >= 0x6F0 && c <= 0x6F9) return String.fromCharCode(48 + c - 0x6F0);
    return ch;
  };
  const norm = (s) => {
    const t = String(s).replace(TASHKEEL, '');
    let o = '';
    for (const ch of t) o += fold(ch.toLowerCase());
    return o;
  };
  const cls = (ch) => {
    const f = fold(ch.toLowerCase());
    switch (f) {
      case 'ا': return '[اأإآٱ]';
      case 'ه': return '[هة]';
      case 'ي': return '[يىئ]';
      case 'و': return '[وؤ]';
      case '*': return '[*]';
      case '?': return '[?]';
      case '[': return '[[]';
    }
    if (f >= '0' && f <= '9') {
      const d = f.charCodeAt(0) - 48;
      return '[' + f + String.fromCharCode(0x660 + d) + String.fromCharCode(0x6F0 + d) + ']';
    }
    const lo = ch.toLowerCase(), up = ch.toUpperCase();
    return lo !== up ? '[' + lo + up + ']' : ch;
  };
  /** نمط GLOB لـ SQLite يطابق أي كتابة مكافئة للنص (بحث «يحتوي»). */
  const glob = (q) => {
    let s = '*';
    for (const ch of String(q).replace(TASHKEEL, '')) s += cls(ch);
    return s + '*';
  };
  /** نمط LIKE آمن مع ESCAPE '\\'. */
  const like = (q) => '%' + String(q).replace(/[%_\\]/g, (m) => '\\' + m) + '%';
  return { norm, glob, like };
})();

const Codes = (() => {
  const barcodeRe = /^\d{8,14}$/;
  const itemRe = /^[A-Za-z0-9]+(?:[-_/.][A-Za-z0-9]+)+$/;
  const isBarcode = (s) => barcodeRe.test(String(s).trim());
  const isItemNo = (s) => {
    const t = String(s).trim();
    return t.length <= 40 && !isBarcode(t) && itemRe.test(t) && /\d/.test(t);
  };
  const looksLikeName = (s) => {
    const t = String(s).trim();
    return !isBarcode(t) && !isItemNo(t) && /\p{L}/u.test(t) && (t.includes(' ') || t.length >= 8);
  };
  /** نص يستحق البحث بالاسم: فيه حرف وليس باركوداً ولا رقم صنف (ولو كلمة قصيرة). */
  const searchableAsName = (s) => { const t = String(s).trim(); return !isBarcode(t) && !isItemNo(t) && /\p{L}/u.test(t); };
  const tashkeel = /[ً-ٰٟـ]/g;
  const normTokens = (s) => {
    let t = String(s).toLowerCase().replace(tashkeel, '');
    t = t.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
    t = t.replace(/[٠-٩]/g, (c) => String.fromCharCode(48 + c.charCodeAt(0) - 0x660))
         .replace(/[۰-۹]/g, (c) => String.fromCharCode(48 + c.charCodeAt(0) - 0x6F0));
    return t.split(/[^\p{L}\p{N}]+/u).filter((x) => x);
  };
  const uniq = (a) => [...new Set(a)];
  const nameKey = (s) => uniq(normTokens(s)).sort().join(' ');
  /** يضع الباركود ورقم الصنف في مكانهما الصحيح لو كانا مقلوبين. */
  const fix = (barcode, itemNo) => {
    let b = String(barcode || '').trim(), i = String(itemNo || '').trim();
    if (b && !isBarcode(b) && isItemNo(b)) {
      if (!i || isBarcode(i)) { const t = i; i = b; b = t; }
    }
    if (i && isBarcode(i) && !isBarcode(b)) {
      if (!b || isItemNo(b)) { const t = b; b = i; i = t; }
    }
    return [b, i];
  };
  return { isBarcode, isItemNo, looksLikeName, searchableAsName, normTokens, nameKey, fix, uniq };
})();

/** تنظيف كود مقروء من ملف: أرقام عربية، رموز خفية، علامة ' وبادئة، و .0 */
function cleanCode(s) {
  if (s == null) return '';
  let o = '';
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (c >= 0x660 && c <= 0x669) o += String.fromCharCode(48 + c - 0x660);
    else if (c >= 0x6F0 && c <= 0x6F9) o += String.fromCharCode(48 + c - 0x6F0);
    else if ('​‌‍‎‏﻿'.includes(ch)) continue;
    else if (ch === ' ') o += ' ';
    else o += ch;
  }
  let t = o.trim();
  if (t.startsWith("'") || t.startsWith('’')) t = t.slice(1).trim();
  t = t.replace(/\.0+$/, '');
  if (t && /^[\d ]+$/.test(t)) t = t.replace(/ /g, '');
  return t;
}

function splitCodes(s) {
  const parts = String(s).split(/[,;،؛\n\r\t|]+/).map((x) => x.trim()).filter((x) => x);
  const out = [];
  for (const p of parts) {
    const sp = p.split(/\s+/).filter((x) => x);
    if (sp.length > 1 && sp.every((x) => Codes.isBarcode(cleanCode(x)))) out.push(...sp); else out.push(p);
  }
  return out;
}

function parseNumber(s) {
  if (s == null) return null;
  let o = '';
  for (const ch of String(s).trim()) {
    const c = ch.charCodeAt(0);
    if (c >= 0x660 && c <= 0x669) o += String.fromCharCode(48 + c - 0x660);
    else if (c >= 0x6F0 && c <= 0x6F9) o += String.fromCharCode(48 + c - 0x6F0);
    else if (ch === '٫') o += '.';
    else if (ch === ',' || ch === '٬' || ch === ' ' || ch === ' ') continue;
    else o += ch;
  }
  if (o === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(o)) return null;
  const n = Number(o);
  return Number.isFinite(n) ? n : null;
}

function fmtQty(n) {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

/** الأطول بين الباركودات؛ عند التساوي الأول. */
function longestCode(list) { let best = ''; for (const c of list) if (c.length > best.length) best = c; return best; }
/** كل باركودات المنتج (الرئيسي أولاً) بلا تكرار. */
function allBarcodes(p) { return [...new Set([String(p.barcode || '').trim(), ...String(p.altBarcodes || '').split(',').map((x) => x.trim())].filter((x) => x))]; }
/** الباركود الرئيسي هو الأطول دائماً، والبقية إضافية بترتيبها. */
function normalizeProduct(p) {
  const all = allBarcodes(p);
  if (!all.length) return p;
  const main = longestCode(all), alts = all.filter((x) => x !== main).join(',');
  return (main === p.barcode && alts === p.altBarcodes) ? p : { ...p, barcode: main, altBarcodes: alts };
}
/** خلية فيها عدة باركودات: نعيد الأطول (أو الخلية نفسها إن لم يكن فيها فاصل). */
function pickLongestBarcode(cell) { const parts = splitCodes(cell); return parts.length <= 1 ? cell : longestCode(parts); }

function altList(altBarcodes) {
  return String(altBarcodes || '').split(',').map((x) => x.trim()).filter((x) => x);
}

// تحميل مكتبة ثقيلة عند الحاجة فقط (يسرّع فتح الموقع)
const _scriptP = {};
function loadScript(src, globalName) {
  if (globalName && window[globalName]) return Promise.resolve();
  if (!_scriptP[src]) _scriptP[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => { delete _scriptP[src]; rej(new Error('تعذّر تحميل ' + src)); };
    document.head.append(s);
  });
  return _scriptP[src];
}
