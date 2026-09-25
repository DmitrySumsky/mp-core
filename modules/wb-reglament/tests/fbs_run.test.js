/* Прогон объединённого листа целиком: «Регламент» + ответы WB → готовый лист.
   Проверяем то, что иначе проверить негде: запись боевого листа и повторные прогоны. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./load');
const { makeSheet, makeBook, makeFetch, Utilities, newConditionalFormatRule } = require('./fake_gas');

const ITEMS = [
  ['BRAND Inositol 1000 mg 120 caps', '4640422812438'],
  ['BRAND Choline 120 caps', '4640422812445'],
  ['Сеты', ''],
  ['ИТОГО', ''],
];

const WAREHOUSES = [
  { id: 1, name: 'Москва' },
  { id: 2, name: 'Казань' },
  { id: 3, name: 'софино' },
];

// Ширина листа при трёх складах: 10 служебных + 3 × 4 + 3 хвостовых.
// На самом листе колонок может быть больше — сетка книги не ужимается,
// поэтому в проверках берём ширину явно, а не по последней непустой ячейке.
const WIDTH = 10 + 3 * 4 + 3;
const COL_SUM = WIDTH - 3;        // Сумма плана
const COL_SOURCE = WIDTH - 2;     // Откуда пул

const WB = {
  warehouses: WAREHOUSES,
  stocks: {
    1: { 4640422812438: 100, 4640422812445: 40 },
    2: { 4640422812438: 30, 4640422812445: 0 },
    3: { 4640422812438: 0, 4640422812445: 0 },
  },
  orders: [].concat(
    Array.from({ length: 50 }, () => ({ warehouseId: 1, skus: ['4640422812438'] })),
    Array.from({ length: 20 }, () => ({ warehouseId: 2, skus: ['4640422812438'] })),
    Array.from({ length: 10 }, () => ({ warehouseId: 1, skus: ['4640422812445'] })),
    [{ warehouseId: 999, skus: ['4640422812438'] }],   // склад удалён в кабинете
  ),
};

function setup(options) {
  const opts = options || {};
  const reglament = makeSheet('Регламент', 20, 8);
  ITEMS.forEach((row, i) => {
    reglament.grid[2 + i][0] = row[0];
    reglament.grid[2 + i][1] = row[1];
  });
  const sheets = [reglament];
  if (opts.fbsSheet) sheets.push(opts.fbsSheet);
  const book = makeBook(sheets);
  const fetch = makeFetch(WB);

  const api = load(['fbs_math.gs', 'fbs_wb.gs', 'fbs_sheet.gs'], {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      flush() {},
      getUi() { throw new Error('нет интерфейса'); },   // как у триггера
      newConditionalFormatRule,
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'token' }) },
    Utilities,
    UrlFetchApp: fetch,
    Logger: { log() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: {},
    fbsGetToken_: () => 'token',
    FBSD_BASE_WAREHOUSE: 'Москва',
    FBSD_TOKEN_SHEET: 'Технический',
    FBSD_TOKEN_CELL: 'B2',
    FBSD_TOKEN_PROP: 'WB_FBS_TOKEN',
  });
  return { api, book, fetch, reglament };
}

test('первый прогон: лист заводится с нуля и заполняется целиком', () => {
  const { api, book, fetch } = setup();
  const result = api.fbsRunLocked_(false);

  const sheet = book.getSheetByName('WB Склады FBS');
  assert.ok(sheet, 'лист должен создаться сам');

  // Строка 1 — настройки, строка 2 — шапка, товары с 3-й.
  assert.deepEqual(sheet.grid[0].slice(0, 4), ['Горизонт, дней', 14, 'Неснижаемый остаток, шт', 10]);
  const head = sheet.grid[1];
  assert.equal(head[0], 'Артикул');
  assert.equal(head.slice(0, WIDTH).filter((h) => String(h).startsWith('План ')).length, 3);
  assert.equal(head[WIDTH - 1], 'Обновлено (МСК)');

  // Москва — самый сильный склад, значит первый блок города.
  assert.equal(head[10], 'Заказы Москва (5 дн)');
  assert.equal(head[13], 'План Москва');

  const inositol = sheet.grid[2];
  assert.equal(inositol[1], '4640422812438');
  assert.equal(inositol[2], 130, 'остаток всего = сумма живых остатков');
  assert.equal(inositol[7], 130, 'пул без ручных колонок = остатки');
  assert.equal(inositol[10], 50, 'заказы Москвы');
  assert.equal(inositol[11], 100, 'остаток Москвы');
  assert.equal(String(inositol[12]).startsWith('='), true, '«остаток дней» — формула');

  // Сумма плана всегда равна пулу — перепродажи схема создать не может.
  const planCols = [13, 17, 21];
  assert.equal(planCols.reduce((a, c) => a + inositol[c], 0), 130);
  assert.equal(inositol[COL_SUM], 130, 'колонка «Сумма плана»');

  // «Сеты» и «ИТОГО» без штрихкода на лист не попадают.
  assert.equal(sheet.getLastRow(), 4);

  assert.ok(result.message.indexOf('Товаров: 2') >= 0, result.message);
  assert.ok(result.message.indexOf('В WB ничего не отправлено') >= 0, result.message);
  assert.equal(fetch.calls.filter((c) => c.method === 'put').length, 0, 'без apply запись запрещена');
});

test('ручные колонки переживают повторный прогон', () => {
  const first = setup();
  first.api.fbsRunLocked_(false);
  const sheet = first.book.getSheetByName('WB Склады FBS');

  // менеджер вписал перемещение и долг из 1С
  sheet.grid[2][3] = 500;    // Привезли (±)
  sheet.grid[2][5] = 200;    // Долг из 1С (+)

  const again = setup({ fbsSheet: sheet });
  const result = again.api.fbsRunLocked_(false);

  assert.equal(sheet.grid[2][3], 500, '«Привезли» осталось на месте');
  assert.equal(sheet.grid[2][5], 200, '«Долг из 1С» остался на месте');
  assert.equal(sheet.grid[2][7], 130 + 500 + 200, 'пул = остатки + привезли + аванс');
  assert.equal(sheet.grid[2][6], '', 'долг фиксируется только после заливки, не пересчётом');
  assert.ok(result.message.indexOf('Ждёт перемещения') >= 0, result.message);
});

test('v2.2.0: минус в «Привезли (±)» убавляет пул и переживает прогон', () => {
  const first = setup();
  first.api.fbsRunLocked_(false);
  const sheet = first.book.getSheetByName('WB Склады FBS');

  sheet.grid[2][3] = -30;    // забрали со склада 30 шт

  const again = setup({ fbsSheet: sheet });
  again.api.fbsRunLocked_(false);

  assert.equal(sheet.grid[2][3], -30, 'минус остался в колонке');
  assert.equal(sheet.grid[2][7], 130 - 30, 'пул = остатки − забрали');
  assert.equal(sheet.grid[2][COL_SOURCE], 'остатки − забрали 30');
});

test('«Факт на FBS (=)» перекрывает живые остатки кабинета', () => {
  const first = setup();
  first.api.fbsRunLocked_(false);
  const sheet = first.book.getSheetByName('WB Склады FBS');
  sheet.grid[2][4] = 60;     // Факт на FBS (=): реально перевезли 60, а не 130

  const again = setup({ fbsSheet: sheet });
  again.api.fbsRunLocked_(false);
  assert.equal(sheet.grid[2][7], 60);
  assert.equal(sheet.grid[2][COL_SOURCE], 'факт');
});

test('лист старой версии (шапка в строке 1, ручных колонок нет) переезжает без мусора', () => {
  // Так выглядит «WB Склады FBS» v1.2.4 до объединения: заказы Москвы стояли в C.
  const old = makeSheet('WB Склады FBS', 10, 7);
  old.grid[0] = ['Артикул', 'Штрихкод', 'Заказы Москва (5 дн)', 'Остаток (Москва)',
                 'Остаток Москва (дней)', 'Обновлено (МСК)', ''];
  old.grid[1] = ['BRAND Inositol 1000 mg 120 caps', '4640422812438', 50, 100, 2, '26.08.2026 06:49', ''];

  const { api, book } = setup({ fbsSheet: old });
  api.fbsRunLocked_(false);

  const sheet = book.getSheetByName('WB Склады FBS');
  // Числа старого листа не должны просочиться в «Привезли»/«Факт»: пул — только остатки.
  assert.equal(sheet.grid[2][7], 130);
  assert.equal(sheet.grid[2][3], '');
  assert.equal(sheet.grid[2][4], '');
  assert.equal(sheet.grid[1][0], 'Артикул');
  assert.equal(sheet.grid[0][0], 'Горизонт, дней');
});

test('настройки из строки 1 применяются к расчёту', () => {
  const first = setup();
  first.api.fbsRunLocked_(false);
  const sheet = first.book.getSheetByName('WB Склады FBS');
  sheet.grid[0][1] = 30;     // горизонт
  sheet.grid[0][3] = 0;      // неснижаемый остаток

  const again = setup({ fbsSheet: sheet });
  again.api.fbsRunLocked_(false);
  assert.deepEqual(sheet.grid[0].slice(0, 4), ['Горизонт, дней', 30, 'Неснижаемый остаток, шт', 0]);
  // «Холин» продаётся только в Москве: при нулевом минимуме другие города получают 0.
  const choline = sheet.grid[3];
  assert.equal(choline[17], 0);
  assert.equal(choline[21], 0);
});

test('без интерфейса заливка не уходит: подтвердить некому', () => {
  const { api, fetch } = setup();
  const result = api.fbsRunLocked_(true);
  assert.equal(fetch.calls.filter((c) => c.method === 'put').length, 0);
  assert.ok(result.message.indexOf('Отменено') >= 0, result.message);
});

test('заказ с удалённого склада виден в отчёте, а не теряется', () => {
  const { api } = setup();
  const result = api.fbsRunLocked_(false);
  assert.ok(result.message.indexOf('не отнесено ни к одному складу из списка: 1') >= 0, result.message);
});

test('оформление уезжает на лист вместе со значениями', () => {
  const { api, book } = setup();
  api.fbsRunLocked_(false);
  const sheet = book.getSheetByName('WB Склады FBS');

  // Три склада: 7 правил на город плюс 6 служебных.
  assert.equal(sheet.rules.length, 3 * 7 + 6);
  assert.ok(sheet.rules.every((r) => r.formula && r.ranges.length === 1));

  // Границы блоков: у каждого города своя левая черта.
  const leftBorders = sheet.borders.filter((b) => b.args[1] === true && b.width === 4);
  assert.equal(leftBorders.length, 3);

  // Жёлтые ручные колонки на месте — по ним человек понимает, куда писать.
  assert.ok(sheet.backgrounds.some((b) => b.color === '#fff2cc' && b.col === 4 && b.width === 3));
});

test('повторный прогон не копит правила: прежние снимаются целиком', () => {
  const first = setup();
  first.api.fbsRunLocked_(false);
  const sheet = first.book.getSheetByName('WB Склады FBS');
  const after = sheet.rules.length;

  const again = setup({ fbsSheet: sheet });
  again.api.fbsRunLocked_(false);
  assert.equal(sheet.rules.length, after);
});
