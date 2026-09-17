/* Прогон центрального кода ЛОКАЛЬНО — v1.0.0 — 17.09.2026
 *
 * v1.0.0: ПРОВЕРИТЬ ПРОГОН БЕЗ КНОПКИ В КНИГЕ И ЗАПОЛНИТЬ НОВУЮ КНИГУ ПЕРВЫМ ЗАМЕРОМ.
 *   Тот же центральный код (без изменений) крутится в Node: сеть настоящая (UrlFetchApp через
 *   curl), листы — в памяти. Продолжения очереди вызываются здесь же циклом. Результат — JSON
 *   со всеми листами; в книгу его заливает tools/seed_book.py. Токен в результат не попадает.
 *
 *   node tools/run_local.js --token-file <файл ИМЯ=значение> --token-name <ИМЯ> \
 *        --articles <json {nm: {...}} | txt по строке> --out <результат.json> [--pause 1500] [--limit N]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const gas = require('../tests/fake_gas');

function arg(name, dflt) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; }
const tokenFile = arg('--token-file'), tokenName = arg('--token-name'), articlesPath = arg('--articles'), outPath = arg('--out');
if (!tokenFile || !tokenName || !articlesPath || !outPath) { console.error('нужны --token-file --token-name --articles --out'); process.exit(1); }

let token = '';
for (const line of fs.readFileSync(tokenFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(\S+)/);
  if (m && m[1] === tokenName) token = m[2];            // последняя строка побеждает
}
if (!token) { console.error('в файле нет ключа ' + tokenName); process.exit(1); }

let nms;
const raw = fs.readFileSync(articlesPath, 'utf8');
try { nms = Object.keys(JSON.parse(raw)).map(Number); } catch (e) { nms = raw.split(/\s+/).map(Number).filter(Boolean); }
const limit = Number(arg('--limit', 0));
if (limit) nms = nms.slice(0, limit);

const env = gas.install([]);
const hdrFile = path.join(os.tmpdir(), 'pos_run_local_headers_' + process.pid + '.txt');
function curl(url, o) {
  o = o || {};
  const args = ['-s', '-X', (o.method || 'get').toUpperCase(), '-w', '\n%{http_code}', '--max-time', '60', '-D', hdrFile];
  const hdr = Object.assign({}, o.headers || {});
  if (o.contentType) hdr['Content-Type'] = o.contentType;
  for (const [k, v] of Object.entries(hdr)) args.push('-H', k + ': ' + v);
  if (o.payload !== undefined) args.push('--data-binary', '@-');
  args.push(url);
  const r = spawnSync('curl', args, { input: o.payload !== undefined ? String(o.payload) : undefined, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const out = r.stdout || '', cut = out.lastIndexOf('\n');
  const code = Number(out.slice(cut + 1)) || 0, body = out.slice(0, cut);
  const headers = {};
  try { for (const l of fs.readFileSync(hdrFile, 'utf8').split(/\r?\n/)) { const m = l.match(/^([^:]+):\s*(.*)$/); if (m) headers[m[1]] = m[2]; } } catch (e) {}
  return { getResponseCode: () => code, getContentText: () => body, getHeaders: () => headers };
}
global.UrlFetchApp = { fetch: curl, fetchAll: reqs => reqs.map(q => curl(q.url, q)) };
global.Utilities.sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const C = require('../central/build/central.js');
C.posSetPause_(Number(arg('--pause', 1500)));
C.upgradeSheets();
env.ss.getSheetByName('Ключи').getRange(2, 2).setValue(token);
const art = env.ss.getSheetByName('Артикулы');
nms.forEach((nm, i) => art.getRange(i + 2, 1).setValue(nm));

const t0 = Date.now();
C.posSetT0_(Date.now());
console.error(C.posRunAll());
for (let i = 0; i < 400 && C.posIsActive_(C.posStateLoad_()); i++) {
  const st = C.posStateLoad_();
  const trig = env.triggers.find(t => t.handler === 'continueQueue');
  const waitMs = trig && trig.spec.after > 60000 ? trig.spec.after : 0;     // лимит WB просил подождать — ждём по-настоящему
  if (waitMs) { console.error('ждём ' + Math.round(waitMs / 1000) + ' с по просьбе WB'); global.Utilities.sleep(waitMs); }
  C.posSetT0_(Date.now());
  console.error('[этап ' + (st.stages + 1) + '] ' + C.continueQueue());
}
env.ss.getSheetByName('Ключи').getRange(2, 2).setValue('');                  // токен в результат не попадает
const dump = {};
for (const sh of env.ss._sheets) dump[sh.name] = sh.dump();
fs.writeFileSync(outPath, JSON.stringify({ sheets: dump, state: C.posStateLoad_(), search: C.posSearchStats_(), seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
try { fs.unlinkSync(hdrFile); } catch (e) {}
console.error('готово за ' + Math.round((Date.now() - t0) / 1000) + ' с, выдача: ' + JSON.stringify(C.posSearchStats_()));
