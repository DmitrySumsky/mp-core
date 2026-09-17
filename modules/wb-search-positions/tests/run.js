/* Тесты центрального кода на стабах GAS: node tests/run.js
 *
 * Проверяется то, из-за чего книга молча врёт или виснет: разбор отчёта WB, перебор хостов выдачи,
 * размерность записи, сдвиги, история по дням, этапы с продолжением. Сеть в тестах — только сценарная.
 * Данные синтетические: артикулы и запросы выдуманы. */

const path = require('path');
const gas = require('./fake_gas');

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e.message || e).split('\n').slice(0, 3).join('\n       ')); }
}
function eq(a, b, what) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((what || '') + ': ожидали ' + JSON.stringify(b) + ', получили ' + JSON.stringify(a));
}
function has(text, part, what) { if (String(text).indexOf(part) < 0) throw new Error((what || '') + ': нет «' + part + '» в «' + String(text).slice(0, 200) + '»'); }

const CENTRAL = path.join(__dirname, '..', 'central', 'build', 'central.js');
let env = gas.install([]);
const C = require(CENTRAL);

const NM1 = 101, NM2 = 202, NM3 = 303;
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const TOKEN = 'eyJh.' + b64({ exp: 1900000000, oid: 777, t: false }) + '.sig';

/** Свежая книга со служебными листами, токеном и артикулами. */
function book(articles) {
  env = gas.install([]);
  C.posResetSearch_();
  C.posSetT0_(Date.now());
  C.upgradeSheets();
  env.ss.getSheetByName('Ключи').getRange(2, 2).setValue(TOKEN);
  const art = env.ss.getSheetByName('Артикулы');
  (articles || []).forEach((a, i) => art.getRange(i + 2, 1, 1, 3).setValues([[a[0], a[1] || '', a[2] || '']]));
  env.alerts.length = 0;
  return env;
}

/** Сценарная сеть: отчёт WB, выдача, карточки. places: {запрос: [id карточек по порядку]}. */
function net(opts) {
  const o = Object.assign({ jam30: [], jam1: [], places: {}, calls: [] }, opts || {});
  global.UrlFetchApp.fetch = function (url, req) {
    o.calls.push(url);
    if (url.indexOf('search-report') >= 0) {
      if (o.jamResponder) return o.jamResponder(url, req);
      const body = JSON.parse(req.payload);
      const day = body.currentPeriod.start === body.currentPeriod.end;
      const items = (day ? o.jam1 : o.jam30).filter(i => body.nmIds.indexOf(i.nmId) >= 0);
      return gas.resp(200, { data: { items: items } });
    }
    if (url.indexOf('/exactmatch/') >= 0) {
      if (o.searchResponder) { const r = o.searchResponder(url); if (r) return r; }
      const q = decodeURIComponent(url.match(/query=([^&]*)/)[1]);
      const page = Number(url.match(/page=(\d+)/)[1]);
      const ids = (o.places[q] || []).slice((page - 1) * 100, page * 100);
      return gas.resp(200, { metadata: { catalog_type: 'preset' }, products: ids.map(id => ({ id: id })), total: 5000 });
    }
    if (url.indexOf('/cards/') >= 0) {
      return gas.resp(200, { products: [{ id: NM1, name: 'Товар один', brand: 'Марка', supplierId: 777 }, { id: NM2, name: 'Товар два', brand: 'Марка', supplierId: 777 }] });
    }
    return gas.resp(200, {});
  };
  return o;
}
const item = (nm, text, freq, pos, orders) => ({ nmId: nm, text: text, frequency: { current: freq }, avgPosition: { current: pos }, orders: { current: orders }, visibility: { current: 90 }, weekFrequency: Math.round(freq / 4) });
const filler = n => Array.from({ length: n }, (_, i) => 900000 + i);

console.log('Тесты центрального кода «Позиции в поиске WB»');

/* ---------- мелочи ---------- */

t('группы частотности: ВЧ от 10 000, СЧ от 1 000, свой запрос — без группы WB', () => {
  eq([C.posGroup_(10000, 'WB'), C.posGroup_(9999, 'WB'), C.posGroup_(999, 'WB'), C.posGroup_(50000, 'свой')], ['ВЧ', 'СЧ', 'НЧ', 'свой']);
});

t('ключ строки не различает регистр и лишние пробелы запроса', () => {
  eq(C.posKey_(NM1, '  Чехол  Для Руля '), C.posKey_(String(NM1), 'чехол для руля'));
});

t('токен WB читается как JWT: срок и номер продавца, значение никуда не уходит', () => {
  const info = C.posTokenInfo_(TOKEN);
  eq(info.seller, 777, 'продавец');
  eq(info.exp.getTime(), 1900000000000, 'срок');
  eq(C.posTokenInfo_('не токен'), null, 'мусор');
});

/* ---------- отчёт WB ---------- */

t('отчёт WB: 30 дней и вчера сливаются в одну строку, поиск по артикулу выкидывается', () => {
  const rows = {};
  C.posJamMerge_(rows, [item(NM1, 'чехол', 5000, 7, 12), item(NM1, '101', 0, 1, 3)], '30');
  C.posJamMerge_(rows, [item(NM1, 'Чехол', 5000, 4, 2), item(NM1, 'новый запрос', 400, 9, 1)], '1');
  eq(Object.keys(rows).length, 2, 'строк');
  const r = rows[C.posKey_(NM1, 'чехол')];
  eq([r.freq, r.wb30, r.ord30, r.wbY, r.ordY], [5000, 7, 12, 4, 2], 'слияние');
  eq(rows[C.posKey_(NM1, 'новый запрос')].freq, 400, 'частотность запроса, появившегося вчера, — из недельной');
});

t('отчёт WB: короткий 429 выдерживается на месте, длинный отдаётся наверх', () => {
  book([]);
  let n = 0;
  net({ jamResponder: () => (++n === 1 ? gas.resp(429, '', { 'x-ratelimit-retry': '5' }) : gas.resp(200, { data: { items: [] } })) });
  const cfg = C.posCfg_();
  eq(C.posJamCall_(cfg, [NM1], '2026-01-01', '2026-01-30').ok, true, 'после короткого ожидания');
  eq(env.slept >= 5000, true, 'ждали столько, сколько просил WB');
  net({ jamResponder: () => gas.resp(429, '', { 'X-Ratelimit-Retry': '700' }) });
  const r = C.posJamCall_(cfg, [NM1], '2026-01-01', '2026-01-30');
  eq([r.ok, r.waitS], [false, 700], 'длинное ожидание');
});

t('отчёт WB: 403 — человеческий текст про Джем и флаг «повторять бесполезно»', () => {
  book([]);
  net({ jamResponder: () => gas.resp(403, '{"title":"Report not available"}') });
  const r = C.posJamCall_(C.posCfg_(), [NM1], '2026-01-01', '2026-01-30');
  eq(r.fatal, true, 'fatal');
  has(r.error, 'Джем', 'текст');
});

/* ---------- выдача ---------- */

t('выдача: 200 без products — чужой конверт; берётся следующий хост, ответивший встаёт первым', () => {
  book([]);
  const hosts = [];
  net({ searchResponder: url => {
    const host = url.split('/')[2];
    hosts.push(host);
    return host === 'search.wb.ru' ? gas.resp(200, { metadata: {}, state: 0, params: {} }) : null;
  }, places: { 'чехол': [1, 2, NM1] } });
  eq(C.posSearchPage_('чехол', 1, -1).products.length, 3, 'товары со второго хоста');
  C.posSearchPage_('чехол', 1, -1);
  eq(hosts, ['search.wb.ru', 'u-search.wb.ru', 'u-search.wb.ru'], 'второй запрос сразу пошёл к ответившему');
});

t('выдача: все хосты закрыты — null, а не «конец выдачи»', () => {
  book([]);
  net({ searchResponder: () => gas.resp(403, '') });
  eq(C.posSearchPage_('чехол', 1, -1), null);
  eq(C.posSearchStats_().failures, 6, 'число попыток ограничено');
});

t('выдача: место = (страница − 1) × 100 + индекс + 1; нашли всех — дальше не листаем', () => {
  book([]);
  const o = net({ places: { 'чехол': filler(100).concat([7, NM1, 8, NM2]) } });
  const r = C.posLocate_('чехол', [NM1, NM2, NM3], 3, -1);
  eq(r.found, { [NM1]: 102, [NM2]: 104 }, 'места');
  eq(r.complete, true, 'полнота');
  eq(o.calls.length, 3, 'третью страницу запросили: NM3 ещё не найден');
});

t('выдача: страница без новых id — потолок, сбор останавливается', () => {
  book([]);
  const same = filler(100);
  const o = net({ searchResponder: () => gas.resp(200, { metadata: {}, products: same.map(id => ({ id: id })) }) });
  const r = C.posLocate_('чехол', [NM1], 3, -1);
  eq([r.found, r.complete, o.calls.length], [{}, true, 2], 'вторая страница повторила первую');
});

/* ---------- листы ---------- */

t('настройка листов: всё создаётся, повторный запуск не затирает введённые значения', () => {
  book([]);
  ['Ключи', 'Артикулы', 'Позиции', 'История · органика', 'История · WB', 'Запросы WB', 'Очередь', 'Журнал']
    .forEach(n => { if (!env.ss.getSheetByName(n)) throw new Error('нет листа ' + n); });
  env.ss.getSheetByName('Ключи').getRange(7, 2).setValue(3);
  C.upgradeSheets();
  eq(C.posCfg_().depth, 3, 'глубина сохранилась');
  eq(C.posCfg_().token, TOKEN, 'токен сохранился');
});

t('«Артикулы»: «нет» выключает, дубли схлопываются, свои запросы режутся по «;», колонки — по заголовку', () => {
  book([[NM1, '', 'чехол на руль; оплётка'], [NM2, 'нет', ''], [NM1, '', ''], ['не число', '', ''], [NM3, 'да', '']]);
  const art = env.ss.getSheetByName('Артикулы');
  art.insertColumnsAfter(0, 1);                               // человек вставил свою колонку слева
  art.getRange(1, 1).setValue('Моя пометка');
  const list = C.posReadArticles_(null);
  eq(list.map(a => a.nm), [NM1, NM3], 'активные');
  eq(list[0].manual, ['чехол на руль', 'оплётка'], 'свои запросы');
});

t('очередь: один запрос на все артикулы, которым он нужен; порядок — по частотности', () => {
  book([[NM1, '', 'свой запрос'], [NM2, '', '']]);
  const jam = [{ nm: NM1, text: 'чехол', freq: 100 }, { nm: NM2, text: 'Чехол', freq: 100 }, { nm: NM2, text: 'оплётка', freq: 9000 }];
  eq(C.posQueueBuild_('r1', jam, C.posReadArticles_(null)), 3, 'уникальных запросов');
  const q = C.posQueueRead_();
  eq(q.map(x => x.query), ['оплётка', 'чехол', 'свой запрос'], 'порядок');
  eq(q[1].nms, [NM1, NM2], 'артикулы запроса');
  eq(q.every(x => x.status === 'ждёт'), true, 'статус');
});

t('сдвиг: плюс — поднялись; текст «>100» или «нет данных» сдвига не даёт', () => {
  eq([C.posShift_(40, 12), C.posShift_(5, 9), C.posShift_('>100', 9), C.posShift_(9, 'нет данных')], [28, -4, '', '']);
});

t('история: новый день встаёт слева, шапка получает текстовый формат ДО значения, повтор дня — в ту же колонку', () => {
  book([]);
  const k1 = C.posKey_(NM1, 'чехол'), k2 = C.posKey_(NM2, 'оплётка');
  C.posHistoryWrite_('История · органика', '16.09.2026', { [k1]: { nm: NM1, text: 'чехол', value: 40 } });
  C.posHistoryWrite_('История · органика', '17.09.2026', { [k1]: { nm: NM1, text: 'чехол', value: 12 }, [k2]: { nm: NM2, text: 'оплётка', value: '>100' } });
  const sh = env.ss.getSheetByName('История · органика');
  eq(sh.dump(), [['Артикул', 'Запрос', '17.09.2026', '16.09.2026'], [NM1, 'чехол', 12, 40], [NM2, 'оплётка', '>100', '']], 'раскладка');
  eq(sh.formats['1:3'], '@', 'формат шапки');
  C.posHistoryWrite_('История · органика', '17.09.2026', { [k1]: { nm: NM1, text: 'чехол', value: 10 } });
  eq(sh.dump()[1], [NM1, 'чехол', 10, 40], 'повтор дня переписал ту же колонку');
  eq(sh.dump()[2][2], '>100', 'строка без нового значения не затёрта');
});

/* ---------- прогон целиком ---------- */

const JAM30 = [item(NM1, 'чехол', 12000, 9, 20), item(NM1, 'оплётка', 800, 15, 3), item(NM2, 'чехол', 12000, 30, 1)];
const JAM1 = [item(NM1, 'чехол', 12000, 6, 2), item(NM2, 'чехол', 12000, 28, 0)];

t('прогон: отчёт → очередь → органика → запись за одно исполнение', () => {
  book([[NM1, '', 'свой запрос'], [NM2, '', '']]);
  net({ jam30: JAM30, jam1: JAM1, places: { 'чехол': [5, NM1, 6].concat(filler(50)).concat([NM2]), 'оплётка': filler(100), 'свой запрос': [NM1] } });
  const text = C.posRunAll();
  has(text, 'готов', 'итог');
  const pos = env.ss.getSheetByName('Позиции').dump();
  eq(pos[0], C.POS_HEADER, 'шапка');
  eq(pos.length, 5, 'строк: 3 из отчёта + 1 свой запрос + шапка');
  const row = r => pos.find(x => x[1] === r[0] && x[3] === r[1]);
  eq(row([NM1, 'чехол']).slice(4, 14), ['ВЧ', 12000, 2, '', 6, '', 9, 20, 2, 'WB'], 'NM1 чехол');
  eq(row([NM1, 'оплётка'])[6], '>100', 'нет в первой сотне');
  eq(row([NM2, 'чехол'])[6], 54, 'NM2 чехол');
  eq(row([NM1, 'свой запрос']).slice(4, 7), ['свой', '', 1], 'свой запрос');
  eq(row([NM1, 'чехол'])[2], 'Товар один', 'название из карточки');
  eq(env.ss.getSheetByName('История · WB').dump()[1].slice(0, 3), [NM1, 'чехол', 6], 'история WB');
  eq(C.posStateLoad_().phase, 'done', 'состояние');
  eq(env.triggers.length, 0, 'продолжений не осталось');
  const art = env.ss.getSheetByName('Артикулы').dump();
  eq([art[1][5], art[1][7], art[2][5]], [3, 'ок', 1], 'отметки на «Артикулах»');
  eq(env.ss.getSheetByName('Журнал').dump()[1][3], 'готово', 'журнал');
});

t('второй замер: сдвиги считаются к прошлому снимку', () => {
  net({ jam30: JAM30, jam1: [item(NM1, 'чехол', 12000, 3, 4)], places: { 'чехол': filler(9).concat([NM1]), 'оплётка': filler(100), 'свой запрос': [NM1] } });
  C.posSetT0_(Date.now());
  C.posRunAll();
  const pos = env.ss.getSheetByName('Позиции').dump();
  const r = pos.find(x => x[1] === NM1 && x[3] === 'чехол');
  eq([r[6], r[7], r[8], r[9]], [10, -8, 3, 3], 'органика опустилась на 8, WB поднялась на 3');
  eq(env.ss.getSheetByName('Позиции').formats['2:8'].indexOf('▲') >= 0, true, 'формат сдвига');
});

t('прогон по выделенным не стирает остальные артикулы со снимка', () => {
  net({ jam30: JAM30, jam1: JAM1, places: { 'чехол': [NM2], 'оплётка': [] } });
  env.ss._active = env.ss.getSheetByName('Артикулы');
  env.ss._ranges = [env.ss.getSheetByName('Артикулы').getRange(3, 1, 1, 1)];      // строка NM2
  C.posSetT0_(Date.now());
  C.posRunSelected();
  const pos = env.ss.getSheetByName('Позиции').dump();
  eq(pos.filter(x => x[1] === NM1).length, 3, 'строки NM1 остались');
  eq(pos.find(x => x[1] === NM2)[6], 1, 'NM2 пересчитан');
});

t('бюджет этапа: органика не успела — состояние «органика», триггер-продолжение, continueQueue доделывает', () => {
  book([[NM1, '', ''], [NM2, '', '']]);
  let searches = 0;
  net({ jam30: JAM30, jam1: JAM1, places: { 'чехол': [NM1, NM2], 'оплётка': [NM1] },
    searchResponder: () => { if (++searches === 1) C.posSetT0_(Date.now() - C.POS_STAGE_BUDGET_MS - 1000); return null; } });
  has(C.posRunAll(), 'Продолжение — в облаке', 'текст');
  eq(C.posStateLoad_().phase, 'search', 'этап');
  eq(env.triggers.map(x => x.handler), ['continueQueue'], 'триггер');
  eq(C.posQueueRead_().map(x => x.status), ['готово', 'ждёт'], 'очередь');
  has(C.posStatus('v').text, 'Идёт работа в облаке', 'статус называет одно действие');
  C.continueQueue();
  eq(C.posStateLoad_().phase, 'done', 'доделано');
  eq(env.triggers.length, 0, 'сработавший триггер снят');
});

t('лимит WB: длинный 429 — прогон ждёт триггером, а не спит; четыре ожидания подряд — сбой словами', () => {
  book([[NM1, '', '']]);
  net({ jamResponder: () => gas.resp(429, '', { 'X-Ratelimit-Retry': '300' }) });
  has(C.posRunAll(), 'продолжится сам', 'текст');
  eq(env.triggers[0].spec.after, 310000, 'через сколько');
  for (let i = 0; i < 4; i++) { C.posSetT0_(Date.now()); C.continueQueue(); }
  eq(C.posStateLoad_().phase, 'failed', 'сбой после четырёх ожиданий');
  has(C.posStatus('v').text, 'Исправьте причину', 'статус');
});

t('выдача молчит: «нет данных» в снимке, вчерашнее значение истории не затёрто', () => {
  book([[NM1, '', '']]);
  net({ jam30: [item(NM1, 'чехол', 500, 9, 1)], jam1: [], places: { 'чехол': [NM1] } });
  C.posRunAll();
  const hist = env.ss.getSheetByName('История · органика');
  hist.getRange(1, 3).setValue('01.01.2026');                 // будто замер был в другой день
  net({ jam30: [item(NM1, 'чехол', 500, 9, 1)], jam1: [], searchResponder: () => gas.resp(403, '') });
  C.posSetT0_(Date.now());
  C.posRunAll();
  for (let i = 0; i < 3 && C.posStateLoad_().phase !== 'done'; i++) { C.posSetT0_(Date.now()); C.continueQueue(); }
  eq(C.posStateLoad_().phase, 'done', 'прогон завершён');
  eq(env.ss.getSheetByName('Позиции').dump()[1][6], 'нет данных', 'снимок');
  eq(hist.dump()[1], [NM1, 'чехол', 1], 'в истории только прошлый день, пустого сегодняшнего нет');
  eq(env.ss.getSheetByName('Журнал').dump().pop()[3], 'готово, не всё', 'журнал');
});

t('автопрогон: живой прогон не дублируется, зависший сегодняшний — подхватывается', () => {
  book([[NM1, '', '']]);
  let searches = 0;
  net({ jam30: [item(NM1, 'чехол', 500, 9, 1), item(NM1, 'оплётка', 300, 9, 1)], jam1: [], places: { 'чехол': [NM1], 'оплётка': [NM1] },
    searchResponder: () => { if (++searches === 1) C.posSetT0_(Date.now() - C.POS_STAGE_BUDGET_MS - 1000); return null; } });
  C.posRunAll();
  C.posDailyTrigger();
  eq(env.ss.getSheetByName('Журнал').dump().pop()[3], 'пропуск', 'живой прогон');
  const st = JSON.parse(env.props.POS_RUN); st.touchedAt = Date.now() - 31 * 60 * 1000; env.props.POS_RUN = JSON.stringify(st);
  C.posDailyTrigger();
  eq(C.posStateLoad_().phase, 'done', 'зависший доделан');
});

/* ---------- окна ---------- */

t('статус без токена называет одно действие — вписать токен', () => {
  env = gas.install([]);
  C.upgradeSheets();
  has(C.posStatus('v1').text, 'Впишите токен WB', 'действие');
});

t('инструкция и проверка связи отдают {html, text}; проверка — один fetchAll без повторов', () => {
  book([]);
  const help = C.posHelp('строка версии');
  has(help.html, '1️⃣', 'html'); has(help.text, 'строка версии', 'text');
  let batches = 0;
  global.UrlFetchApp.fetchAll = reqs => { batches++; return reqs.map((r, i) => gas.resp(i === 0 ? 200 : 403, i === 0 ? { Status: 'OK' } : '')); };
  const check = C.posCheckConnection();
  eq(batches, 1, 'один fetchAll');
  has(check.text, 'продавец 777', 'токен разобран');
  has(check.text, 'Право записи', 'право записи названо');
  has(check.text, 'Ни один хост выдачи', 'диагноз лимитера словами');
});

t('автопрогон включается на час из «Ключи» B9 и не плодит дубли', () => {
  book([]);
  env.ss.getSheetByName('Ключи').getRange(9, 2).setValue(6);
  C.posInstallDailyTrigger(); C.posInstallDailyTrigger();
  eq(env.triggers.map(x => [x.handler, x.spec.hour]), [['posDailyTrigger', 6]], 'один триггер');
  C.posRemoveDailyTrigger();
  eq(env.triggers.length, 0, 'снят');
});

console.log('\nИтог: ' + ok + '/' + (ok + fail));
process.exit(fail ? 1 : 0);
