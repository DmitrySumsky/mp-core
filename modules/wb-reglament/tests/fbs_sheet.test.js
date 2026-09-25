const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./load');

// fbs_sheet.gs грузится целиком: в нём нет вызовов GAS на верхнем уровне, только
// объявления и функции. Проверяем чистую часть — ту, на которой держится лист.
const {
  fbsManualCols_, fbsHeaders_, fbsBuildRow_, fbsChanges_, fbsColumnLetter_,
  fbsAggregateOrders_, fbsOrderWarehouses_, fbsMergeRows_, fbsBuildFormatRules_, FBSD_COLOR,
} = load(['fbs_math.gs', 'fbs_sheet.gs'], {
  SpreadsheetApp: {}, PropertiesService: {}, Utilities: {}, UrlFetchApp: {},
  Logger: { log() {} }, LockService: {}, ScriptApp: {},
});

const DIALECT = { fn: 'ЕСЛИОШИБКА', sep: ';' };

/* ---------- шапка объединённого листа ---------- */

test('у города четыре колонки подряд, план сразу за остатком', () => {
  const head = fbsHeaders_([{ name: 'Москва' }, { name: 'Казань' }]);
  assert.deepEqual(head.slice(0, 10), [
    'Артикул', 'Штрихкод', 'Остаток всего (WB)', 'Привезли (±)', 'Факт на FBS (=)',
    'Долг из 1С (+)', 'Ждёт перемещения', 'Пул', 'ССП/день', 'Дней покрытия']);
  assert.deepEqual(head.slice(10, 14), [
    'Заказы Москва (5 дн)', 'Остаток (Москва)', 'Остаток Москва (дней)', 'План Москва']);
  assert.deepEqual(head.slice(14, 18), [
    'Заказы Казань (5 дн)', 'Остаток (Казань)', 'Остаток Казань (дней)', 'План Казань']);
  assert.deepEqual(head.slice(-3), ['Сумма плана', 'Откуда пул', 'Обновлено (МСК)']);
  assert.equal(head.length, 10 + 2 * 4 + 3);
});

test('ширина листа растёт ровно на четыре колонки за склад', () => {
  const wh = (n) => Array.from({ length: n }, (_, i) => ({ name: 'Г' + i }));
  assert.equal(fbsHeaders_(wh(19)).length, 89);   // кабинет Б
  assert.equal(fbsHeaders_(wh(21)).length, 97);   // BRAND
});

/* ---------- строка товара ---------- */

const PLAN = {
  item: { vendorCode: 'TST Test', barcode: '4640422811325' },
  current: [100, 20], currentSum: 120, orders: [50, 10],
  brought: '', fact: '', advance: '', debtPrev: 0, debt: 0, covered: 0,
  pool: 120, poolSource: 'остатки', plan: [90, 30], mode: 'дефицит', updatedAt: '26.08.2026 12:00',
};

test('строка: служебный блок, блоки городов, хвост', () => {
  const row = fbsBuildRow_(PLAN, 3, DIALECT, false);
  assert.deepEqual(row.slice(0, 10),
    ['TST Test', '4640422811325', 120, '', '', '', '', 120, 12, 10]);
  assert.deepEqual(row.slice(10, 14), [50, 100, '=ЕСЛИОШИБКА(L3/(K3/5);0)', 90]);
  assert.deepEqual(row.slice(14, 18), [10, 20, '=ЕСЛИОШИБКА(P3/(O3/5);0)', 30]);
  assert.deepEqual(row.slice(-3), [120, 'остатки', '26.08.2026 12:00']);
});

test('формула «остаток дней» смотрит на свои же колонки и свою строку', () => {
  // 21 склад: у последнего заказы в колонке 10+1+20*4 = 91 (CM), остаток — 92 (CN)
  const wide = Object.assign({}, PLAN, {
    current: Array(21).fill(1), orders: Array(21).fill(5), plan: Array(21).fill(1),
  });
  const row = fbsBuildRow_(wide, 42, DIALECT, false);
  assert.equal(fbsColumnLetter_(91), 'CM');
  assert.equal(fbsColumnLetter_(92), 'CN');
  assert.equal(row[10 + 20 * 4 + 2], '=ЕСЛИОШИБКА(CN42/(CM42/5);0)');
});

test('«Ждёт перемещения»: пересчёт показывает старый долг, заливка — новый', () => {
  const p = Object.assign({}, PLAN, { debtPrev: 40, debt: 90 });
  assert.equal(fbsBuildRow_(p, 3, DIALECT, false)[6], 40);
  assert.equal(fbsBuildRow_(p, 3, DIALECT, true)[6], 90);
});

test('дней покрытия при нулевом спросе — пусто, а не деление на ноль', () => {
  const p = Object.assign({}, PLAN, { orders: [0, 0] });
  const row = fbsBuildRow_(p, 3, DIALECT, false);
  assert.equal(row[8], 0);
  assert.equal(row[9], '');
});

/* ---------- ручные колонки ---------- */

test('колонки находятся по заголовку объединённого листа', () => {
  const head = fbsHeaders_([{ name: 'Москва' }]);
  assert.deepEqual(fbsManualCols_(head), { brought: 3, fact: 4, advance: 5, debt: 6 });
});

test('v2.2.0: старый заголовок «Привезли (+)» на боевом листе читается как та же колонка', () => {
  // Первый прогон новой версии видит ещё старую шапку: без алиаса вписанное менеджером
  // перемещение прочиталось бы как ноль и потерялось при перезаписи листа.
  const head = ['Артикул', 'Штрихкод', 'Остаток всего (WB)', 'Привезли (+)', 'Факт на FBS (=)',
                'Долг из 1С (+)', 'Ждёт перемещения', 'Пул'];
  assert.deepEqual(fbsManualCols_(head), { brought: 3, fact: 4, advance: 5, debt: 6 });
});

test('лист прошлой версии («Распределение FBS»): номера другие, но заголовки те же', () => {
  const head = ['SKU', 'ШК', 'Привезли (+)', 'Факт на FBS (=)', 'Долг из 1С (+)',
                'Ждёт перемещения', 'Пул'];
  assert.deepEqual(fbsManualCols_(head), { brought: 2, fact: 3, advance: 4, debt: 5 });
});

test('лист старого «WB Склады FBS» v1.2.4: ручных колонок на нём нет', () => {
  // Шапка была в строке 1, ручных колонок не существовало. Читать по номерам нельзя:
  // на месте «Привезли» стояли бы заказы Москвы и попали бы в пул.
  const head = ['Артикул', 'Штрихкод', 'Заказы Москва (5 дн)', 'Остаток (Москва)'];
  assert.deepEqual(fbsManualCols_(head), { brought: -1, fact: -1, advance: -1, debt: -1 });
});

test('пустая шапка — свежий лист, берём номера по умолчанию', () => {
  assert.deepEqual(fbsManualCols_(['', '', '', '', '', '', '']),
                   { brought: 3, fact: 4, advance: 5, debt: 6 });
});

/* ---------- заказы ---------- */

const WH = [{ id: 1, name: 'Москва' }, { id: 2, name: 'Казань' }];
const ITEMS = [{ vendorCode: 'A', barcode: '4640422811325' },
               { vendorCode: 'B', barcode: '4640422812742' }];

test('задание = штука, ключ — штрихкод из skus', () => {
  const orders = [
    { warehouseId: 1, skus: ['4640422811325'] },
    { warehouseId: 1, skus: ['4640422811325'] },
    { warehouseId: 2, skus: ['4640422812742'] },
  ];
  const index = fbsAggregateOrders_(orders, WH, ITEMS);
  assert.equal(index.total, 3);
  assert.equal(index.byWarehouse[1]['4640422811325'], 2);
  assert.equal(index.byWarehouse[2]['4640422812742'], 1);
});

test('артикул принимается только когда ведёт ровно к одной строке', () => {
  const items = ITEMS.concat([{ vendorCode: 'A', barcode: '4640422899999' }]);
  const index = fbsAggregateOrders_([{ warehouseId: 1, skus: ['нет-такого'], article: 'A' }], WH, items);
  assert.equal(index.total, 0, 'неоднозначный артикул не должен приписываться чужой строке');

  const one = fbsAggregateOrders_([{ warehouseId: 1, skus: [], article: 'B' }], WH, ITEMS);
  assert.equal(one.byWarehouse[1]['4640422812742'], 1);
});

test('заказ с удалённого склада считается отдельно, а не теряется молча', () => {
  const index = fbsAggregateOrders_([{ warehouseId: 777, skus: ['4640422811325'] }], WH, ITEMS);
  assert.equal(index.total, 1);
  assert.equal(index.unknownTotal, 1);
  assert.deepEqual(index.unknownWarehouses, { 777: 1 });
});

test('склады слева направо по числу заказов, при равенстве — по имени', () => {
  const ordered = fbsOrderWarehouses_(
    [{ id: 1, name: 'Москва' }, { id: 2, name: 'Казань' }, { id: 3, name: 'Абакан' }],
    { 1: { x: 5 }, 2: { x: 50 }, 3: {} });
  assert.deepEqual(ordered.map((w) => w.name), ['Казань', 'Москва', 'Абакан']);
  assert.equal(ordered[0].totalOrders, 50);
});

/* ---------- дописанные руками строки ---------- */

test('товар без строки в «Регламенте» подхватывается по ручным колонкам', () => {
  const rows = fbsMergeRows_(ITEMS, { 4640422899999: { vendorCode: 'TST Omega-3', brought: 60, fact: null } });
  assert.equal(rows.length, 3);
  assert.equal(rows[2].addedByHand, true);
  assert.equal(rows[2].vendorCode, 'TST Omega-3');
});

test('пустая ручная строка не плодит товар', () => {
  const rows = fbsMergeRows_(ITEMS, { 4640422899999: { brought: 0, advance: 0, debt: 0, fact: null } });
  assert.equal(rows.length, 2);
});

/* ---------- что уедет в WB ---------- */

test('в WB уходят только позиции с изменившимся количеством', () => {
  const plans = [
    { item: { barcode: '111111', vendorCode: 'A' }, current: [10, 5], plan: [10, 7] },
    { item: { barcode: '222222', vendorCode: 'B' }, current: [0, 0], plan: [0, 0] },
  ];
  const changes = fbsChanges_(WH, plans);
  assert.equal(changes.count, 1);
  assert.equal(changes.moved, 2);
  assert.equal(changes.byWarehouse[0].length, 0);
  assert.deepEqual(changes.byWarehouse[1], [{ barcode: '111111', sku: 'A', from: 5, to: 7 }]);
});

/* ---------- оформление: правила условного форматирования ---------- */

const SETTINGS = { horizon: 14, minStock: 10 };
const TWO = [{ name: 'Москва' }, { name: 'Казань' }];

function rulesFor(col, rules) {
  return rules.filter((r) => r.col === col);
}

test('правил столько, сколько колонок под цвет: 7 на город плюс 6 служебных', () => {
  const rules = fbsBuildFormatRules_(TWO, SETTINGS, 50);
  assert.equal(rules.length, 2 * 7 + 6);
  // Потолок листа — 500 (проверено запросом к Sheets API 26.08.2026);
  // самый широкий кабинет — 21 склад.
  assert.ok(fbsBuildFormatRules_(Array(21).fill({ name: 'Г' }), SETTINGS, 80).length < 500);
});

test('пустой лист — правил нет, а не правила на нулевой диапазон', () => {
  assert.deepEqual(fbsBuildFormatRules_(TWO, SETTINGS, 0), []);
});

test('«нет заказов» стоит ПЕРВЫМ, иначе ноль дней покрасится как острый дефицит', () => {
  // Первый блок города: заказы K, остаток L, дни M, план N.
  const days = rulesFor(13, fbsBuildFormatRules_(TWO, SETTINGS, 50));
  assert.equal(days.length, 5);
  assert.equal(days[0].formula, '=$K3=0');
  assert.equal(days[0].background, FBSD_COLOR.noDemand);
  assert.deepEqual(days.map((r) => r.background), [
    FBSD_COLOR.noDemand, FBSD_COLOR.over, FBSD_COLOR.ok, FBSD_COLOR.mid, FBSD_COLOR.low]);
});

test('ступени запаса едут за горизонтом из строки 1', () => {
  const days14 = rulesFor(13, fbsBuildFormatRules_(TWO, { horizon: 14 }, 50));
  assert.equal(days14[1].formula, '=($K3>0)*($M3>=28)');   // перезапас
  assert.equal(days14[2].formula, '=($K3>0)*($M3>=14)');   // норма
  assert.equal(days14[3].formula, '=($K3>0)*($M3>=7)');    // впритык
  assert.equal(days14[4].formula, '=$K3>0');               // остальное — дефицит

  const days21 = rulesFor(13, fbsBuildFormatRules_(TWO, { horizon: 21 }, 50));
  assert.equal(days21[1].formula, '=($K3>0)*($M3>=42)');
  assert.equal(days21[3].formula, '=($K3>0)*($M3>=11)');   // половина, округлённая вверх
});

test('в формулах правил нет функций с аргументами: локаль книги их разбирает по-своему', () => {
  // Русская книга отвергает =AND(a,b) прямо при установке правила (Sheets API, 26.08.2026).
  fbsBuildFormatRules_(TWO, SETTINGS, 50).forEach((rule) => {
    assert.ok(!/[A-ZА-Я]+\(/.test(rule.formula), 'формула должна быть без функций: ' + rule.formula);
    assert.ok(rule.formula.indexOf(',') < 0, 'запятая зависит от локали: ' + rule.formula);
  });
});

test('второй город смотрит на СВОИ колонки, а не на колонки первого', () => {
  const rules = fbsBuildFormatRules_(TWO, SETTINGS, 50);
  // Блок Казани сдвинут на четыре колонки: заказы O, остаток P, дни Q, план R.
  const days = rulesFor(17, rules);
  assert.equal(days[0].formula, '=$O3=0');
  assert.equal(days[2].formula, '=($O3>0)*($Q3>=14)');
  const plan = rulesFor(18, rules);
  assert.deepEqual(plan.map((r) => r.formula), ['=$R3>$P3', '=$R3<$P3']);
});

test('план красится по направлению: зелёный довезти, оранжевый забрать', () => {
  const plan = rulesFor(14, fbsBuildFormatRules_(TWO, SETTINGS, 50));
  assert.deepEqual(plan.map((r) => r.background), [FBSD_COLOR.add, FBSD_COLOR.take]);
});

test('служебный блок: дни покрытия от ССП, непогашенный долг выделен', () => {
  const rules = fbsBuildFormatRules_(TWO, SETTINGS, 50);
  const cover = rulesFor(10, rules);              // «Дней покрытия»
  assert.equal(cover[0].formula, '=$I3=0');       // ССП — колонка I
  assert.equal(cover.length, 5);
  const debt = rulesFor(7, rules);                // «Ждёт перемещения»
  assert.deepEqual(debt.map((r) => [r.formula, r.bold]), [['=$G3>0', true]]);
});

test('диапазон правила — только строки товаров, без шапки и настроек', () => {
  fbsBuildFormatRules_(TWO, SETTINGS, 79).forEach((rule) => {
    assert.equal(rule.row, 3);
    assert.equal(rule.rows, 79);
    assert.equal(rule.cols, 1);
  });
});
