/* Тесты пультового слоя (20_пульт.js) на СОБРАННОМ central.js — тот же файл уезжает в книги.
   Сеть сценарная, листы в памяти. FakeSheet проверяет размерность setValues, как боевой Apps Script. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const CENTRAL = path.join(__dirname, '..', 'central', 'build', 'central.js');
const LOADER = fs.readFileSync(path.join(__dirname, '..', 'loader', 'loader.gs'), 'utf8');

/* ---------- стабы Apps Script ---------- */

function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64; return n; }

function makeSheet(name, rows = 100, cols = 30) {
  const cells = {};          // 'r:c' → {v, f, fmt}
  const sh = {
    name, maxRows: rows, maxCols: cols, hidden: false, notes: {},
    getName: () => name,
    getMaxRows: () => sh.maxRows,
    getMaxColumns: () => sh.maxCols,
    isSheetHidden: () => sh.hidden,
    hideSheet() { sh.hidden = true; },
    getLastRow() { let m = 0; for (const k in cells) if (cells[k].v !== '' || cells[k].f) m = Math.max(m, +k.split(':')[0]); return m; },
    getLastColumn() { let m = 0; for (const k in cells) if (cells[k].v !== '' || cells[k].f) m = Math.max(m, +k.split(':')[1]); return m; },
    insertRowsAfter(after, n) {
      const moved = {};
      for (const k in cells) { const [r, c] = k.split(':').map(Number); moved[(r > after ? r + n : r) + ':' + c] = cells[k]; }
      for (const k in cells) delete cells[k];
      Object.assign(cells, moved);
      sh.maxRows += n;
    },
    cell(r, c) { return cells[r + ':' + c] || { v: '' }; },
    getRange(a, b, h = 1, w = 1) {
      if (typeof a === 'string') { const m = a.match(/^([A-Z]+)(\d+)$/); return sh.getRange(+m[2], colNum(m[1])); }
      if (a < 1 || b < 1 || a + h - 1 > sh.maxRows || b + w - 1 > sh.maxCols) {
        throw new Error(`getRange за границей «${name}»: ${a},${b} ${h}x${w}`);
      }
      const each = (fn) => { const out = []; for (let i = 0; i < h; i++) { const row = []; for (let j = 0; j < w; j++) row.push(fn(a + i, b + j)); out.push(row); } return out; };
      const put = (vals, key) => {
        if (vals.length !== h) throw new Error(`setValues: строк ${vals.length}, а диапазон на ${h}`);
        vals.forEach((row, i) => {
          if (row.length !== w) throw new Error(`setValues: колонок ${row.length}, а диапазон на ${w}`);
          row.forEach((v, j) => { const k = (a + i) + ':' + (b + j); cells[k] = Object.assign(cells[k] || { v: '' }, key === 'f' ? { f: v, v: '=' } : { v, f: '' }); });
        });
      };
      return {
        getValue: () => sh.cell(a, b).v,
        getValues: () => each((r, c) => sh.cell(r, c).v),
        getDisplayValues: () => each((r, c) => String(sh.cell(r, c).v)),
        getFormulasR1C1: () => each((r, c) => sh.cell(r, c).f || ''),
        setValue(v) { put([[v]]); return this; },
        setValues(v) { put(v); return this; },
        setFormulasR1C1(v) { put(v, 'f'); return this; },
        setNumberFormat(fmt) { each((r, c) => { const k = r + ':' + c; cells[k] = Object.assign(cells[k] || { v: '' }, { fmt }); }); return this; },
        setNote(t) { sh.notes[a + ':' + b] = t; return this; },
      };
    },
  };
  return sh;
}

function makeBook(sheets) {
  const list = sheets.slice();
  let active = list[0];
  return {
    list,
    getSheetByName: (n) => list.find((s) => s.name === n) || null,
    insertSheet(n, idx) { const s = makeSheet(n); if (idx === 0) list.unshift(s); else list.push(s); return s; },
    setActiveSheet(s) { active = s; return s; },
    moveActiveSheet(pos) { list.splice(list.indexOf(active), 1); list.splice(pos - 1, 0, active); },
    toast() {},
  };
}

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function jwt(payload) { return b64url({ alg: 'ES256' }) + '.' + b64url(payload) + '.sig'; }

function install(book, fetchAll, fetch) {
  const alerts = [];
  const triggers = [];
  global.SpreadsheetApp = {
    getActiveSpreadsheet: () => book,
    getUi: () => ({ alert: (t, m) => { alerts.push([t, m]); return 'YES'; }, ButtonSet: { OK: 1, YES_NO: 2 }, Button: { YES: 'YES' } }),
    flush() {},
  };
  global.Utilities = {
    sleep() {},
    formatDate: (d) => d.toISOString().slice(0, 10).split('-').reverse().join('.'),
    base64DecodeWebSafe: (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
  };
  global.UrlFetchApp = { fetchAll: fetchAll || (() => []), fetch: fetch || (() => { throw new Error('сеть не ждали'); }) };
  global.ScriptApp = {
    getProjectTriggers: () => triggers.map((h) => ({ getHandlerFunction: () => h })),
    deleteTrigger() {},
    newTrigger: (h) => { const b = { timeBased: () => b, atHour: () => b, nearMinute: () => b, everyDays: () => b, inTimezone: () => b, create: () => triggers.push(h) }; return b; },
  };
  global.Logger = { log() {} };
  global.FBSD_BASE_WAREHOUSE = 'Мой склад';
  delete require.cache[require.resolve(CENTRAL)];
  return { C: require(CENTRAL), alerts, triggers };
}

const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) });

/* ---------- тесты ---------- */

test('central грузится как тело new Function — так его запускает лоадер', () => {
  const src = fs.readFileSync(CENTRAL, 'utf8');
  const fn = new Function(src + '\n;return typeof rgCheckConnection;');
  assert.equal(fn(), 'function');
});

test('каждая функция, которую лоадер зовёт через run_, есть в central', () => {
  const src = fs.readFileSync(CENTRAL, 'utf8');
  const names = [...LOADER.matchAll(/run_\('([A-Za-z_]+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 12);
  names.forEach((n) => assert.match(src, new RegExp('function\\s+' + n + '\\s*\\('), n));
});

test('в лоадере 🔴 ровно у одного пункта — заливки в WB', () => {
  const red = LOADER.split('\n').filter((l) => l.includes('addItem') && l.includes('🔴'));
  assert.equal(red.length, 1);
  assert.match(red[0], /mFbsApply/);
});

test('ключ: срок, категории и «только чтение» читаются из самого токена', () => {
  const { C } = install(makeBook([]));
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const full = C.rgTokenInfo_(jwt({ exp, s: 2 + 4 + 16 }));
  assert.deepEqual(full.missing, []);
  assert.equal(full.readOnly, false);
  assert.ok(full.daysLeft >= 29 && full.daysLeft <= 30);
  const ro = C.rgTokenInfo_(jwt({ exp, s: 2 + 16 + Math.pow(2, 30) }));
  assert.equal(ro.readOnly, true);
  assert.deepEqual(ro.missing, ['Аналитика']);
  assert.equal(C.rgTokenInfo_('не токен'), null);
});

test('штрихкод строки — EAN-13 производителя, а не код WB «20…» и не с ведущим нулём', () => {
  const { C } = install(makeBook([]));
  assert.equal(C.rgPickBarcode_(['04640000000017', '2037441603567', '4640000000017']), '4640000000017');
  assert.equal(C.rgPickBarcode_(['04640000000024']), '4640000000024');
  assert.equal(C.rgPickBarcode_(['02053918972080', '2053918972080']), '2053918972080');
  assert.equal(C.rgPickBarcode_([]), '');
});

test('новые карточки: уже стоящие в листе пропускаются по любому штрихкоду, итог по артикулу', () => {
  const { C } = install(makeBook([]));
  const cards = [
    { nmID: 1, vendorCode: 'B item', barcodes: ['04640000000017', '4640000000017'] },
    { nmID: 2, vendorCode: 'Z item', barcodes: ['4640000000024'] },
    { nmID: 3, vendorCode: 'A item', barcodes: ['04640000000031', '2030000000000', '4640000000031'] },
  ];
  const fresh = C.rgNewCards_(cards, ['4640000000017']);
  assert.deepEqual(fresh.map((c) => [c.vendorCode, c.barcode]), [['A item', '4640000000031'], ['Z item', '4640000000024']]);
  assert.equal(C.rgNewCards_(cards, ['04640000000024', '4640000000017', '4640000000031']).length, 0);
});

test('дописывание товаров: A/B, штрихкод текстом, формулы образца R1C1, «ИТОГО» под товарами цело', () => {
  const reg = makeSheet('Регламент');
  reg.getRange(2, 1, 1, 4).setValues([['SKU', 'ШК', 'Доступный остаток', 'Комментарий']]);
  reg.getRange(3, 1, 1, 2).setValues([['B item', '4640000000017']]);
  reg.getRange(3, 3).setFormulasR1C1([['=RC[1]-RC[2]']]);
  reg.getRange(3, 4).setValue('ручной текст');
  reg.getRange(5, 1).setValue('ИТОГО');
  const tech = makeSheet('Технический');
  tech.getRange('B2').setValue('tok');
  const book = makeBook([reg, tech]);
  const cards = { cards: [
    { nmID: 1, vendorCode: 'B item', sizes: [{ skus: ['4640000000017'] }] },
    { nmID: 2, vendorCode: 'C item', sizes: [{ skus: ['04640000000024', '4640000000024'] }] },
  ], cursor: { total: 2 } };
  const { C, alerts } = install(book, null, () => resp(200, cards));
  const res = C.rgAddNewItems();
  assert.deepEqual(res, { added: 1, formulas: 1 });
  assert.equal(reg.cell(4, 1).v, 'C item');
  assert.equal(reg.cell(4, 2).v, '4640000000024');
  assert.equal(reg.cell(4, 2).fmt, '@');
  assert.equal(reg.cell(4, 3).f, '=RC[1]-RC[2]');
  assert.equal(reg.cell(4, 4).v, '', 'ручные значения образца не копируются');
  assert.equal(reg.cell(6, 1).v, 'ИТОГО', 'строка «ИТОГО» сдвинута, а не затёрта');
  assert.match(alerts[0][1], /Добавлено.*1/);
});

test('🔌 проверка связи: один fetchAll, 401 — диагноз, базовый склад ищется в списке', () => {
  const tech = makeSheet('Технический');
  tech.getRange('B2').setValue(jwt({ exp: Math.floor(Date.now() / 1000) + 90 * 86400, s: 2 + 4 + 16 }));
  let calls = 0;
  const { C } = install(makeBook([tech]), (reqs) => {
    calls++;
    assert.equal(reqs.length, 3);
    return [resp(200, { Status: 'OK' }), resp(401, {}), resp(200, [{ name: 'Мой склад' }, { name: 'Ростов - на - Дону' }])];
  });
  const res = C.rgCheckConnection();
  assert.equal(calls, 1, 'без ретраев');
  assert.match(res.text, /ключ не принят/);
  assert.match(res.text, /складов FBS: 2; базовый «Мой склад» найден/);
  assert.match(res.text, /заливка остатков FBS \(3️⃣ 🔴\) доступна/);
  assert.match(res.html, /<table/);
});

test('🔌 без ключа: сеть не трогается, одно действие — вставить ключ', () => {
  const { C } = install(makeBook([makeSheet('Технический')]), () => { throw new Error('сеть без ключа'); });
  const res = C.rgCheckConnection();
  assert.match(res.text, /Вставьте ключ WB/);
});

test('📊 следующее действие — одно и по порядку важности', () => {
  const { C } = install(makeBook([]));
  const fresh = new Date();
  const base = { token: true, items: 36, no1c: 0, dataAt: fresh, triggers: true, fbsStatus: 'залито в WB' };
  assert.match(C.rgNextAction_(Object.assign({}, base, { token: false })), /ключ WB/);
  assert.match(C.rgNextAction_(Object.assign({}, base, { items: 0 })), /Дописать новые товары/);
  assert.match(C.rgNextAction_(Object.assign({}, base, { dataAt: null })), /1️⃣/);
  assert.match(C.rgNextAction_(Object.assign({}, base, { triggers: false })), /Включить автообновление/);
  assert.match(C.rgNextAction_(Object.assign({}, base, { no1c: 36 })), /1С/);
  assert.match(C.rgNextAction_(Object.assign({}, base, { fbsStatus: 'расчёт, в WB не отправлено' })), /3️⃣ 🔴/);
  assert.match(C.rgNextAction_(base), /Ничего делать не нужно/);
});

test('дата обновления читается и из Date, и из строки «dd.MM.yyyy HH:mm» по Москве', () => {
  const { C } = install(makeBook([]));
  assert.equal(C.rgParseStamp_('25.09.2026 07:15').toISOString(), '2026-09-25T04:15:00.000Z');
  const d = new Date();
  assert.equal(C.rgParseStamp_(d), d);
  assert.equal(C.rgParseStamp_(''), null);
});

test('⚙️ настройки таблицы: скрытый «Технический» с подписями, лист «1С», порядок листов', () => {
  const reg = makeSheet('Регламент');
  const book = makeBook([makeSheet('WB Данные'), reg]);
  const { C } = install(book);
  const done = C.upgradeSheets();
  const tech = book.getSheetByName('Технический');
  assert.ok(tech.hidden);
  assert.equal(tech.cell(1, 1).v, 'WB API');
  assert.equal(tech.cell(2, 2).v, '', 'значение ключа код не пишет');
  assert.ok(book.getSheetByName('1С'));
  assert.deepEqual(book.list.map((s) => s.name), ['Регламент', '1С', 'WB Данные', 'Технический']);
  assert.ok(done.length >= 2);
  assert.equal(C.upgradeSheets().length, 0, 'второй прогон ничего не меняет');
});

test('⏰ автообновление ставит оба утренних триггера на имена лоадера', () => {
  const { C, triggers } = install(makeBook([]));
  C.rgInstallTriggers();
  assert.deepEqual(triggers.sort(), ['wbDailyTrigger', 'wbWarehousesDailyTrigger']);
  ['wbDailyTrigger', 'wbWarehousesDailyTrigger'].forEach((h) => assert.match(LOADER, new RegExp('function ' + h + '\\(')));
});

test('📖 инструкция описывает каждый пункт меню лоадера', () => {
  const { C } = install(makeBook([]));
  const h = C.rgHelp('v-test');
  ['1️⃣', '2️⃣', '3️⃣ 🔴', 'Что сейчас происходит', 'Проверка связи', 'Дописать новые товары',
   'автообновление', 'Обновить настройки таблицы'].forEach((s) => assert.ok(h.html.includes(s), s));
  assert.ok(h.html.includes('v-test'));
});
