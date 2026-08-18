/**
 * Тесты Apps Script-ядра. Запуск: node gas/test_mpcore.js
 *
 * Среду таблиц подменяем заглушками: сеть в тестах не нужна, а ждать
 * по-настоящему тем более. Проверяем ровно те правила, ради которых
 * ядро и существует, — они обязаны совпадать с питоновской половиной.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// --- заглушки среды -------------------------------------------------------

let queue = [];
let sleptFor = 0;

global.UrlFetchApp = {
  fetch(url, options) {
    const answer = queue.length ? queue.shift() : { code: 200, body: '{}' };
    if (answer.throw) throw new Error('сеть отвалилась');
    global.UrlFetchApp.calls.push({ url, options });
    return {
      getResponseCode: () => answer.code,
      getContentText: () => answer.body
    };
  },
  calls: []
};

global.Utilities = { sleep(ms) { sleptFor += ms; } };

function reset(answers) {
  queue = answers || [];
  sleptFor = 0;
  global.UrlFetchApp.calls = [];
}

// Файл ядра — обычный скрипт для среды таблиц, модульной обёртки в нём нет.
// Собираем его функцией: тело `Function` исполняется вне строгого режима
// этого файла, поэтому объявленный там `MpCore` можно просто вернуть.
const source = fs.readFileSync(path.join(__dirname, 'MpCore.gs'), 'utf8');
const MpCore = new Function(source + '\nreturn MpCore;')();

// --- проверки -------------------------------------------------------------

const checks = [];
function test(name, fn) { checks.push([name, fn]); }

test('цена с кошельком считается floor, а не round', () => {
  assert.strictEqual(MpCore.walletPrice(55900), 547);
  assert.strictEqual(MpCore.walletPrice(100000), 980);
});

test('пустое тело при 200 — это факт, а не сбой', () => {
  reset([{ code: 200, body: '   ' }]);
  const answer = MpCore.getJson('http://x');
  assert.strictEqual(answer.ok, true);
  assert.strictEqual(answer.data, null);
});

test('квоту не ретраим ни разу', () => {
  reset([{ code: 429, body: '{"message":"Превышен лимит запросов за 18.08.2026"}' }]);
  const answer = MpCore.getJson('http://x', {}, 4);
  assert.strictEqual(answer.quota, true);
  assert.strictEqual(global.UrlFetchApp.calls.length, 1);
  assert.strictEqual(sleptFor, 0);
});

test('обычный 429 ретраится', () => {
  reset([{ code: 429, body: 'too many requests' }, { code: 200, body: '{"ok":true}' }]);
  const answer = MpCore.getJson('http://x', {}, 4);
  assert.deepStrictEqual(answer.data, { ok: true });
  assert.strictEqual(global.UrlFetchApp.calls.length, 2);
});

test('цена есть — число, предложения нет — «нет в наличии»', () => {
  reset([{ code: 200, body: JSON.stringify({ products: [
    { id: 1, sizes: [{ price: { product: 54800 } }] },
    { id: 2, sizes: [{ price: {} }] }
  ] }) }]);
  const prices = MpCore.cardPrices([1, 2]);
  assert.strictEqual(prices['1'], 537);
  assert.strictEqual(prices['2'], MpCore.STATE_NONE);
});

test('идентификатора нет в ответе — «нет карточки»', () => {
  reset([{ code: 200, body: JSON.stringify({ products: [] }) }]);
  const prices = MpCore.cardPrices([7]);
  assert.strictEqual(prices['7'], MpCore.STATE_GONE);
});

test('не отдавшаяся пачка не пишется вообще', () => {
  reset([{ code: 500, body: '' }, { code: 500, body: '' },
         { code: 500, body: '' }, { code: 500, body: '' }]);
  assert.deepStrictEqual(MpCore.cardPrices([1, 2]), {});
});

test('цена ищется во ВСЕХ размерах, а не только в первом', () => {
  reset([{ code: 200, body: JSON.stringify({ products: [
    { id: 3, sizes: [{ price: {} }, { price: { product: 70000 } }] }
  ] }) }]);
  assert.strictEqual(MpCore.cardPrices([3])['3'], 686);
});

test('квота гасит остальные запросы контура, но не соседний', () => {
  reset([{ code: 429, body: '{"message":"превышен лимит"}' }]);
  const wb = {};
  assert.deepStrictEqual(MpCore.mpHistory('1', 't', 'wb', null, wb), {});
  assert.strictEqual(wb.quota, true);
  assert.deepStrictEqual(MpCore.mpHistory('2', 't', 'wb', null, wb), {});
  assert.strictEqual(global.UrlFetchApp.calls.length, 1);
  assert.ok(MpCore.whySilent(wb).indexOf('лимит') >= 0);

  reset([{ code: 200, body: JSON.stringify([{ data: '2026-08-17', ozon_card_price: 320 }]) }]);
  const ozon = {};
  assert.deepStrictEqual(MpCore.mpHistory('1', 't', 'oz', null, ozon),
                         { '2026-08-17': 320 });
  assert.strictEqual(ozon.quota, undefined);
});

test('тема №1 — это «General», в API её передавать нельзя', () => {
  assert.deepStrictEqual(MpCore.parseTarget('-100123:1'), { chat: '-100123', thread: null });
  assert.deepStrictEqual(MpCore.parseTarget('-100123:45'), { chat: '-100123', thread: '45' });
  assert.deepStrictEqual(MpCore.parseTarget('-100123'), { chat: '-100123', thread: null });
});

test('список получателей терпит пустоту', () => {
  assert.deepStrictEqual(MpCore.parseTargets('-100:5, -200 ,'),
    [{ chat: '-100', thread: '5' }, { chat: '-200', thread: null }]);
  assert.deepStrictEqual(MpCore.parseTargets(''), []);
});

test('шапка попадает в каждый кусок, а не только в первый', () => {
  const text = Array.from({ length: 40 }, (_, i) => 'строка '.repeat(10) + i).join('\n');
  const parts = MpCore.withHeaders(text, 'МЕТКА · отчёт', 300);
  assert.ok(parts.length > 1);
  assert.ok(parts[0].startsWith('МЕТКА · отчёт\n'));
  for (let i = 1; i < parts.length; i++) {
    assert.ok(parts[i].startsWith(`МЕТКА · отчёт — продолжение ${i + 1}/${parts.length}`));
  }
});

test('нарезка не рвёт строку пополам', () => {
  const text = Array.from({ length: 20 }, () => 'ровно двадцать знаков').join('\n');
  assert.strictEqual(MpCore.splitText(text, 100).join('\n'), text);
});

// --- прогон ---------------------------------------------------------------

let failed = 0;
for (const [name, fn] of checks) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('ПАДАЕТ ' + name + '\n        ' + err.message);
  }
}
console.log(`\n${checks.length - failed} из ${checks.length} прошли`);
process.exit(failed ? 1 : 0);
