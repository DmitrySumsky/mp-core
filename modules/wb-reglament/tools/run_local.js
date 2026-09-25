/* Прогон центрального кода ЛОКАЛЬНО — v1.0.0 — 25.09.2026
 *
 * v1.0.0: ПРОВЕРИТЬ СБОР И РАСКЛАДКУ НА ЖИВОМ КАБИНЕТЕ БЕЗ КНОПКИ В КНИГЕ.
 *   Тот же собранный central.js грузится так же, как в книге, — телом new Function; сеть
 *   настоящая (UrlFetchApp через curl, только чтение: заливка 3️⃣ здесь не вызывается),
 *   листы в памяти. Результат — JSON с листами «WB Данные» и «WB Склады FBS»; первый
 *   заливает в новую книгу tools/seed_book.py. Ключ в результат не попадает.
 *
 *   node tools/run_local.js --token-file <файл ИМЯ=значение> --token-name <ИМЯ> \
 *        --items <json [[артикул, штрихкод], ...]> --out <результат.json> [--base <базовый склад>]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const gas = require('../tests/fake_gas');

function arg(name, dflt) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; }
const tokenFile = arg('--token-file'), tokenName = arg('--token-name'), itemsPath = arg('--items'), outPath = arg('--out');
if (!tokenFile || !tokenName || !itemsPath || !outPath) { console.error('нужны --token-file --token-name --items --out'); process.exit(1); }

let token = '';
for (const line of fs.readFileSync(tokenFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(\S+)/);
  if (m && m[1] === tokenName) token = m[2];            // последняя строка побеждает
}
if (!token) { console.error('в файле нет ключа ' + tokenName); process.exit(1); }
const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));

/* ---------- книга в памяти ---------- */
const reg = gas.makeSheet('Регламент', items.length + 10, 30);
reg.getRange(2, 1, 1, 2).setValues([['SKU', 'ШК']]);
reg.getRange(3, 1, items.length, 2).setValues(items);
const tech = gas.makeSheet('Технический', 10, 5);
tech.getRange(2, 2).setValue(token);
const book = gas.makeBook([reg, tech]);

/* ---------- Apps Script поверх Node ---------- */
const hdrFile = path.join(os.tmpdir(), 'rg_run_local_headers_' + process.pid + '.txt');
function curl(url, o) {
  o = o || {};
  const method = (o.method || 'get').toUpperCase();
  if (method !== 'GET' && method !== 'POST') throw new Error('локальный прогон только читает: ' + method + ' ' + url);
  if (method === 'POST' && /marketplace-api/.test(url) && !/\/api\/v3\/stocks\/\d+$/.test(url)) throw new Error('неожиданная запись: ' + url);
  const args = ['-s', '-X', method, '-w', '\n%{http_code}', '--max-time', '120', '-D', hdrFile];
  const hdr = Object.assign({}, o.headers || {});
  if (o.contentType) hdr['Content-Type'] = o.contentType;
  for (const [k, v] of Object.entries(hdr)) args.push('-H', k + ': ' + v);
  if (o.payload !== undefined) args.push('--data-binary', '@-');
  args.push(url);
  const r = spawnSync('curl', args, { input: o.payload !== undefined ? String(o.payload) : undefined, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const out = r.stdout || '', cut = out.lastIndexOf('\n');
  const code = Number(out.slice(cut + 1)) || 0, body = out.slice(0, cut);
  return { getResponseCode: () => code, getContentText: () => body };
}
global.UrlFetchApp = { fetch: curl, fetchAll: (reqs) => reqs.map((q) => curl(q.url, q)) };
global.Utilities = Object.assign({}, gas.Utilities, {
  sleep: (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms),
  formatDate(date, tz, pattern) {               // время книги — московское при любом поясе машины
    const d = new Date(new Date(date).getTime() + 3 * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    if (pattern === 'yyyy-MM-dd') return ymd;
    return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear() + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  },
});
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => book,
  getUi: () => { throw new Error('нет интерфейса'); },   // как у триггера: заливка без подтверждения не идёт
  flush() {},
  newConditionalFormatRule: gas.newConditionalFormatRule,
  BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' },
};
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
global.Logger = { log: (m) => console.error('  · ' + m) };
global.FBSD_BASE_WAREHOUSE = arg('--base', 'Мой склад');
global.FBSD_TOKEN_PROP = 'WB_FBS_TOKEN';
global.FBSD_TOKEN_SHEET = 'Технический';
global.FBSD_TOKEN_CELL = 'B2';
global.fbsGetToken_ = () => token;

const src = fs.readFileSync(path.join(__dirname, '..', 'central', 'build', 'central.js'), 'utf8');
const C = (new Function(src + '\n;return { wbUpdateReglamentLocked_: wbUpdateReglamentLocked_, fbsRunLocked_: fbsRunLocked_ };'))();

const t0 = Date.now();
console.error('1️⃣ заказы и остатки WB…');
const data = C.wbUpdateReglamentLocked_();
console.error('   ' + JSON.stringify(data));
console.error('2️⃣ раскладка FBS (расчёт, без записи в WB)…');
const fbs = C.fbsRunLocked_(false);
console.error('   ' + fbs.message.split('\n').join('\n   '));

const dump = (name) => { const s = book.getSheetByName(name); return s ? { grid: s.grid.filter((r) => r.some((v) => v !== '')), notes: s.notes } : null; };
fs.writeFileSync(outPath, JSON.stringify({ data, fbsMessage: fbs.message, sheets: { 'WB Данные': dump('WB Данные'), 'WB Склады FBS': dump('WB Склады FBS') }, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
try { fs.unlinkSync(hdrFile); } catch (e) {}
console.error('готово за ' + Math.round((Date.now() - t0) / 1000) + ' с → ' + outPath);
