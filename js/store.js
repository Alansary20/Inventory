/* قاعدة البيانات: SQLite (sql.js) تُحفظ داخل المتصفح (IndexedDB). نفس جداول واستعلامات تطبيق الأندرويد. */
'use strict';

const Store = (() => {
  let SQL = null, db = null, saveTimer = null, saving = false, dirty = false;
  const IDB_NAME = 'jard-makhzon', IDB_STORE = 'kv', IDB_KEY = 'sqlite';
  const state = { dataVersion: 0 };

  // ───── IndexedDB ─────
  const idbOpen = () => new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idbGet = async () => {
    const d = await idbOpen();
    return new Promise((res, rej) => {
      const r = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  };
  const idbPut = async (bytes) => {
    const d = await idbOpen();
    return new Promise((res, rej) => {
      const t = d.transaction(IDB_STORE, 'readwrite');
      t.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  };

  const SCHEMA = [
    "CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, barcode TEXT NOT NULL DEFAULT '', item_no TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', alt_barcodes TEXT NOT NULL DEFAULT '', price_orig REAL NOT NULL DEFAULT 0, price_sale REAL NOT NULL DEFAULT 0, source_id INTEGER NOT NULL DEFAULT 0)",
    "CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)",
    "CREATE INDEX IF NOT EXISTS idx_products_item_no ON products(item_no)",
    "CREATE TABLE IF NOT EXISTS inventory (key TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL DEFAULT 0, barcode TEXT NOT NULL DEFAULT '', item_no TEXT NOT NULL DEFAULT '', timestamp INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS stock (key TEXT PRIMARY KEY, item_no TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', qty REAL NOT NULL DEFAULT 0)",
    "CREATE INDEX IF NOT EXISTS idx_stock_item_no ON stock(item_no)",
    "CREATE INDEX IF NOT EXISTS idx_stock_barcode ON stock(barcode)",
    "CREATE TABLE IF NOT EXISTS uploaded_files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, timestamp INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS scan_log (id INTEGER PRIMARY KEY AUTOINCREMENT, item_code TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL DEFAULT 1, timestamp INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_scan_log_time ON scan_log(timestamp)",
  ];

  async function init() {
    SQL = await initSqlJs({ locateFile: (f) => 'vendor/' + f });
    let bytes = null;
    try { bytes = await idbGet(); } catch (e) { /* قد يكون التخزين محجوباً */ }
    db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
    for (const s of SCHEMA) db.run(s);
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    const flush = () => { if (dirty) saveNow(); };
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  function markDirty() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }
  async function saveNow() {
    if (saving || !db) { if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); } return; }
    saving = true; dirty = false;
    try { await idbPut(db.export()); } catch (e) { dirty = true; console.warn('save failed', e); }
    saving = false;
  }

  // ───── أدوات SQL ─────
  function all(sql, params = []) {
    const st = db.prepare(sql);
    try {
      st.bind(params);
      const out = [];
      while (st.step()) out.push(st.getAsObject());
      return out;
    } finally { st.free(); }
  }
  const one = (sql, params) => all(sql, params)[0] || null;
  const scalar = (sql, params) => { const r = db.exec(sql, params); return r.length && r[0].values.length ? r[0].values[0][0] : null; };
  function run(sql, params = []) { db.run(sql, params); markDirty(); }
  function tx(fn) {
    db.run('BEGIN');
    try { const r = fn(); db.run('COMMIT'); markDirty(); return r; }
    catch (e) { try { db.run('ROLLBACK'); } catch (_) {} throw e; }
  }
  const bump = () => { state.dataVersion++; };

  // ───── تحويل الصفوف ─────
  const P_COLS = 'id, barcode, item_no, name, alt_barcodes, price_orig, price_sale, source_id';
  const toProduct = (r) => normalizeProduct({ id: r.id, barcode: r.barcode, itemNo: r.item_no, name: r.name, altBarcodes: r.alt_barcodes, priceOrig: r.price_orig, priceSale: r.price_sale, sourceId: r.source_id });
  const toInv = (r) => ({ key: r.key, name: r.name, qty: r.qty, barcode: r.barcode, itemNo: r.item_no, timestamp: r.timestamp });
  const toLog = (r) => ({ id: r.id, itemCode: r.item_code, name: r.name, barcode: r.barcode, qty: r.qty, timestamp: r.timestamp });
  const toStock = (r) => ({ key: r.key, itemNo: r.item_no, barcode: r.barcode, name: r.name, qty: r.qty });

  // ───── المنتجات ─────
  const searchProducts = (q, limit, offset) => (q
    ? all(`SELECT ${P_COLS} FROM products WHERE name GLOB ? OR barcode LIKE ? ESCAPE '\\' OR item_no LIKE ? ESCAPE '\\' OR alt_barcodes LIKE ? ESCAPE '\\' ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
        [Ar.glob(q), Ar.like(q), Ar.like(q), Ar.like(q), limit, offset])
    : all(`SELECT ${P_COLS} FROM products ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`, [limit, offset])).map(toProduct);
  const allProducts = () => all(`SELECT ${P_COLS} FROM products`).map(toProduct);
  const findByCode = (v) => { const r = one(`SELECT ${P_COLS} FROM products WHERE item_no = ? OR barcode = ? OR instr(',' || alt_barcodes || ',', ?) > 0 LIMIT 1`, [v, v, ',' + v + ',']); return r && toProduct(r); };
  const countProducts = () => scalar('SELECT COUNT(*) FROM products');
  const countInventory = () => scalar('SELECT COUNT(*) FROM inventory');
  const countScanLog = () => scalar('SELECT COUNT(*) FROM scan_log');
  const countStock = () => scalar('SELECT COUNT(*) FROM stock');

  function upsertProducts(list) {
    bump();
    if (!list.length) return;
    tx(() => {
      const st = db.prepare(`INSERT OR REPLACE INTO products (${P_COLS}) VALUES (?,?,?,?,?,?,?,?)`);
      try { for (const p0 of list) { const p = normalizeProduct(p0); st.run([p.id, p.barcode, p.itemNo, p.name, p.altBarcodes, p.priceOrig, p.priceSale, p.sourceId || 0]); } } finally { st.free(); }
    });
  }
  function deleteProducts(ids) {
    bump();
    if (!ids.length) return;
    tx(() => { const st = db.prepare('DELETE FROM products WHERE id = ?'); try { for (const id of ids) st.run([id]); } finally { st.free(); } });
  }
  const deleteProduct = (id) => deleteProducts([id]);
  function clearProducts() { bump(); tx(() => { db.run('DELETE FROM products'); db.run("DELETE FROM uploaded_files WHERE kind = 'products'"); }); }
  const addUploadedFile = (name, kind) => run('INSERT INTO uploaded_files (name, kind, timestamp) VALUES (?,?,?)', [name, kind, Date.now()]);

  function findByBarcode(code) {
    let r = one(`SELECT ${P_COLS} FROM products WHERE barcode = ? OR instr(',' || alt_barcodes || ',', ?) > 0 LIMIT 1`, [code, ',' + code + ',']);
    if (r) return toProduct(r);
    if (code.length < 6 || !/^\d+$/.test(code)) return null;
    const base = code.replace(/^0+/, '');
    if (!base) return null;
    const variants = new Set();
    for (const n of [base.length, 8, 12, 13, 14]) if (n >= base.length) variants.add(base.padStart(n, '0'));
    variants.delete(code);
    if (!variants.size) return null;
    const arr = [...variants];
    r = one(`SELECT ${P_COLS} FROM products WHERE barcode IN (${arr.map(() => '?').join(',')}) LIMIT 1`, arr);
    return r && toProduct(r);
  }
  const findByItemNo = (code) => { const r = one(`SELECT ${P_COLS} FROM products WHERE item_no = ? LIMIT 1`, [code]); return r && toProduct(r); };
  const findStock = (code) => { const r = one('SELECT key, item_no, barcode, name, qty FROM stock WHERE key = ? OR item_no = ? OR barcode = ? LIMIT 1', [code, code, code]); return r && toStock(r); };

  // ───── الجرد وسجل المسحات ─────
  const INV_COLS = 'key, name, qty, barcode, item_no, timestamp';
  const LOG_COLS = 'id, item_code, name, barcode, qty, timestamp';

  function addInvQty(key, delta, name, barcode, itemNo, now) {
    const cur = one('SELECT qty FROM inventory WHERE key = ?', [key]);
    if (cur) {
      const nq = cur.qty + delta;
      if (nq <= 0) { db.run('DELETE FROM inventory WHERE key = ?', [key]); db.run('DELETE FROM scan_log WHERE item_code = ?', [key]); }
      else db.run('UPDATE inventory SET qty = ?, timestamp = ? WHERE key = ?', [nq, now, key]);
    } else if (delta > 0) {
      db.run('INSERT OR REPLACE INTO inventory (key, name, qty, barcode, item_no, timestamp) VALUES (?,?,?,?,?,?)', [key, name, delta, barcode, itemNo, now]);
    }
  }
  const insertLog = (itemCode, name, barcode, qty, now) =>
    db.run('INSERT INTO scan_log (item_code, name, barcode, qty, timestamp) VALUES (?,?,?,?,?)', [itemCode, name, barcode, qty, now]);

  function addToInventory(itemCode, name, barcode = '', itemNoOverride = '') {
    const now = Date.now();
    const onlyDigits = /^\d+$/.test(itemCode), hasDash = /^\d+-[\d-]+$/.test(itemCode);
    const storedBarcode = barcode || (onlyDigits ? itemCode : '');
    const storedItemNo = itemNoOverride || (hasDash ? itemCode : '');
    const key = storedItemNo || storedBarcode || itemCode;
    tx(() => { addInvQty(key, 1, name, storedBarcode, storedItemNo, now); insertLog(itemCode, name, storedBarcode, 1, now); });
  }
  const searchInventory = (q, limit, offset) => (q
    ? all(`SELECT ${INV_COLS} FROM inventory WHERE name GLOB ? OR barcode LIKE ? ESCAPE '\\' OR item_no LIKE ? ESCAPE '\\' OR key LIKE ? ESCAPE '\\' ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        [Ar.glob(q), Ar.like(q), Ar.like(q), Ar.like(q), limit, offset])
    : all(`SELECT ${INV_COLS} FROM inventory ORDER BY timestamp DESC LIMIT ? OFFSET ?`, [limit, offset])).map(toInv);
  const allInventory = () => all(`SELECT ${INV_COLS} FROM inventory`).map(toInv);
  const searchLog = (q, limit, offset) => (q
    ? all(`SELECT ${LOG_COLS} FROM scan_log WHERE name GLOB ? OR item_code LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
        [Ar.glob(q), Ar.like(q), Ar.like(q), limit, offset])
    : all(`SELECT ${LOG_COLS} FROM scan_log ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`, [limit, offset])).map(toLog);

  const lastLog = (code) => one('SELECT id, qty FROM scan_log WHERE item_code = ? ORDER BY timestamp DESC, id DESC LIMIT 1', [code]);
  function logPlus(itemCode, name, barcode) {
    const now = Date.now();
    tx(() => {
      const last = lastLog(itemCode);
      if (last) db.run('UPDATE scan_log SET qty = ? WHERE id = ?', [last.qty + 1, last.id]);
      else insertLog(itemCode, name, barcode, 1, now);
      addInvQty(itemCode, 1, name, barcode, itemCode, now);
    });
  }
  function logMinus(itemCode) {
    let found = false;
    tx(() => {
      const last = lastLog(itemCode);
      if (last) {
        found = true;
        if (last.qty > 1) db.run('UPDATE scan_log SET qty = ? WHERE id = ?', [last.qty - 1, last.id]);
        else db.run('DELETE FROM scan_log WHERE id = ?', [last.id]);
        addInvQty(itemCode, -1, '', '', '', Date.now());
      }
    });
    return found;
  }
  function logDelete(id) {
    tx(() => {
      const row = one('SELECT item_code, qty FROM scan_log WHERE id = ?', [id]);
      if (row) { db.run('DELETE FROM scan_log WHERE id = ?', [id]); addInvQty(row.item_code, -row.qty, '', '', '', Date.now()); }
    });
  }
  function logSetQty(id, newQty) {
    if (newQty < 1) { logDelete(id); return; }
    tx(() => {
      const row = one('SELECT item_code, qty FROM scan_log WHERE id = ?', [id]);
      if (row) { db.run('UPDATE scan_log SET qty = ? WHERE id = ?', [newQty, id]); addInvQty(row.item_code, newQty - row.qty, '', '', '', Date.now()); }
    });
  }
  const clearInventoryAndLog = () => tx(() => { db.run('DELETE FROM inventory'); db.run('DELETE FROM scan_log'); });

  function importInventory(items, replace, mergeInto) {
    tx(() => {
      if (replace) { db.run('DELETE FROM inventory'); db.run('DELETE FROM scan_log'); }
      for (const it of items) {
        const ex = mergeInto[it.key];
        const key = ex ? ex.key : it.key;
        db.run('INSERT OR REPLACE INTO inventory (key, name, qty, barcode, item_no, timestamp) VALUES (?,?,?,?,?,?)',
          [key, (ex && ex.name) || it.name, (ex ? ex.qty : 0) + it.qty, (ex && ex.barcode) || it.barcode, (ex && ex.itemNo) || it.itemNo, it.timestamp]);
        insertLog(key, it.name, it.barcode, it.qty, it.timestamp);
      }
    });
  }

  // ───── الرصيد ─────
  const searchStock = (q, limit, offset) => (q
    ? all(`SELECT key, item_no, barcode, name, qty FROM stock WHERE name GLOB ? OR key LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\' ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
        [Ar.glob(q), Ar.like(q), Ar.like(q), limit, offset])
    : all('SELECT key, item_no, barcode, name, qty FROM stock ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?', [limit, offset])).map(toStock);
  const allStock = () => all('SELECT key, item_no, barcode, name, qty FROM stock').map(toStock);
  function upsertStock(list) {
    bump();
    if (!list.length) return;
    tx(() => {
      const st = db.prepare('INSERT OR REPLACE INTO stock (key, item_no, barcode, name, qty) VALUES (?,?,?,?,?)');
      try { for (const r of list) st.run([r.key, r.itemNo, r.barcode, r.name, r.qty]); } finally { st.free(); }
    });
  }
  const clearStock = () => { bump(); tx(() => { db.run('DELETE FROM stock'); db.run("DELETE FROM uploaded_files WHERE kind = 'stock'"); }); };

  // ───── التنظيف بعد الاستيراد ─────
  function purgeZeroInventory() {
    let n = 0;
    tx(() => { db.run('DELETE FROM scan_log WHERE item_code IN (SELECT key FROM inventory WHERE qty <= 0)'); db.run('DELETE FROM inventory WHERE qty <= 0'); n = db.getRowsModified(); });
    return n;
  }
  function repairNameKeys() {
    const idx = Names.get();
    const rows = allInventory().filter((it) => !Codes.isBarcode(it.key) && !Codes.isItemNo(it.key) && Codes.looksLikeName(it.key));
    let n = 0;
    for (const r of rows) {
      const hit = idx.exact(r.key);
      const newKey = hit ? (hit.itemNo || hit.barcode) : '';
      tx(() => {
        if (hit && newKey) {
          const ex = one('SELECT qty FROM inventory WHERE key = ?', [newKey]);
          if (ex) {
            db.run('UPDATE inventory SET qty = ?, timestamp = ? WHERE key = ?', [ex.qty + r.qty, Math.max(r.timestamp, Date.now()), newKey]);
            db.run('DELETE FROM inventory WHERE key = ?', [r.key]);
          } else {
            db.run('UPDATE inventory SET key = ?, name = ?, barcode = ?, item_no = ? WHERE key = ?', [newKey, hit.name, hit.barcode, hit.itemNo, r.key]);
          }
          db.run('UPDATE scan_log SET item_code = ?, name = ?, barcode = ? WHERE item_code = ?', [newKey, hit.name, hit.barcode, r.key]);
          n++;
        } else if (r.itemNo || r.barcode || r.name !== r.key) {
          db.run("UPDATE inventory SET name = ?, barcode = '', item_no = '' WHERE key = ?", [r.key, r.key]);
          db.run("UPDATE scan_log SET name = ?, barcode = '' WHERE item_code = ?", [r.key, r.key]);
          n++;
        }
      });
    }
    return n;
  }
  function resolveUnknown(labels) {
    const ph = labels.map(() => '?').join(',');
    const rows = all(`SELECT ${INV_COLS} FROM inventory WHERE name = '' OR name IN (${ph})`, labels).map(toInv);
    let n = 0;
    for (const r of rows) {
      let name = null, bc = r.barcode, ino = r.itemNo;
      for (const code of [r.itemNo, r.barcode, r.key].filter((x) => x)) {
        const p = findByCode(code);
        if (p) { name = p.name; if (!bc) bc = p.barcode; if (!ino) ino = p.itemNo; break; }
        const s = findStock(code);
        if (s) { name = s.name || s.key; if (!bc) bc = s.barcode; if (!ino) ino = s.itemNo; break; }
      }
      if (name && name.trim()) {
        tx(() => {
          db.run('UPDATE inventory SET name = ?, barcode = ?, item_no = ? WHERE key = ?', [name, bc, ino, r.key]);
          db.run('UPDATE scan_log SET name = ? WHERE item_code = ?', [name, r.key]);
        });
        n++;
      }
    }
    return n;
  }
  const reconcile = (labels) => repairNameKeys() + resolveUnknown(labels) + purgeZeroInventory();

  // ───── نسخة احتياطية كاملة ─────
  const exportDb = () => db.export();
  async function importDb(bytes) {
    const nd = new SQL.Database(new Uint8Array(bytes));
    for (const t of ['products', 'inventory', 'stock', 'scan_log']) nd.exec(`SELECT COUNT(*) FROM ${t}`); // تحقق أنه ملف صالح
    db.close(); db = nd;
    for (const s of SCHEMA) db.run(s);
    bump(); markDirty(); await saveNow();
  }
  async function wipeAll() {
    for (const t of ['products', 'inventory', 'stock', 'scan_log', 'uploaded_files']) db.run(`DELETE FROM ${t}`);
    bump(); markDirty(); await saveNow();
  }

  return {
    state, init, saveNow, bump, all, one,
    searchProducts, allProducts, findByCode, findByBarcode, findByItemNo, findStock,
    countProducts, countInventory, countScanLog, countStock,
    upsertProducts, deleteProducts, deleteProduct, clearProducts, addUploadedFile,
    addToInventory, searchInventory, allInventory, searchLog, logPlus, logMinus, logDelete, logSetQty,
    clearInventoryAndLog, importInventory,
    searchStock, allStock, upsertStock, clearStock,
    purgeZeroInventory, repairNameKeys, resolveUnknown, reconcile,
    exportDb, importDb, wipeAll,
  };
})();
