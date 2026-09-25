const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScript(overrides = {}) {
  const filename = path.join(__dirname, '..', 'central', 'src', '10_данные.js');
  const source = fs.readFileSync(filename, 'utf8');
  const sandbox = { ...overrides };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename });
  return sandbox;
}

test('retries a transient network exception from WB', () => {
  let calls = 0;
  const { wbFetchJson_ } = loadScript({
    UrlFetchApp: {
      fetch() {
        calls += 1;
        if (calls === 1) throw new Error('connect timeout');
        return {
          getResponseCode: () => 200,
          getContentText: () => '{"ok":true}',
        };
      },
    },
    Utilities: { sleep() {} },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(wbFetchJson_('url', {}, 1))), { ok: true });
  assert.equal(calls, 2);
});

test('indexes stock by nmID', () => {
  const { wbIndexStockProducts_ } = loadScript();
  const result = wbIndexStockProducts_([
    { nmID: 101, metrics: { stockCount: 7 } },
    { nmID: 101, metrics: { stockCount: 3 } },
    { nmID: 202, metrics: { stockCount: 0 } },
    { nmID: 0, metrics: { stockCount: 99 } },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    '101': 10,
    '202': 0,
  });
});

test('indexes History of Stocks ordersCount by nmID', () => {
  const { wbIndexOrdersProducts_ } = loadScript();
  const result = wbIndexOrdersProducts_([
    { nmID: 101, metrics: { ordersCount: 7 } },
    { nmID: 101, metrics: { ordersCount: 3 } },
    { nmID: 202, metrics: { ordersCount: 0 } },
    { nmID: 0, metrics: { ordersCount: 99 } },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    '101': 10,
    '202': 0,
  });
});

test('maps duplicate vendor codes by barcode and skips non-product rows', () => {
  const { wbBuildSkuRows_ } = loadScript();
  const result = wbBuildSkuRows_([
    ['DUPLICATE', '111'],
    ['Сеты', ''],
    ['DUPLICATE', '222'],
  ], { '111': 101, '222': 202 }, 3);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { sheetRow: 3, vendorCode: 'DUPLICATE', barcode: '111', nmID: 101 },
    { sheetRow: 5, vendorCode: 'DUPLICATE', barcode: '222', nmID: 202 },
  ]);
});

test('adds an unlisted FBS-prefixed card to its unique base product row', () => {
  const { wbIndexOrdersProducts_ } = loadScript();
  const result = wbIndexOrdersProducts_([
    { nmID: 101, vendorCode: 'BRAND Vitamin C', metrics: { ordersCount: 1 } },
    { nmID: 202, vendorCode: 'FBS!BRAND Vitamin C', metrics: { ordersCount: 3 } },
  ], [
    { nmID: 101, vendorCode: 'BRAND Vitamin C' },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    '101': 4,
  });
});

test('extracts only the exact Sklad WB RF warehouse column', () => {
  const { wbExtractRfWarehouseStockProducts_ } = loadScript();
  const result = wbExtractRfWarehouseStockProducts_([
    {
      nmId: 101,
      vendorCode: 'SKU-1',
      warehouses: [
        { warehouseName: 'Всего находится на складах', quantity: 20 },
        { warehouseName: 'Склад WB РФ', quantity: 7 },
        { warehouseName: 'Актобе', quantity: 3 },
      ],
    },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { nmID: 101, vendorCode: 'SKU-1', metrics: { stockCount: 7 } },
  ]);
});

test('v1.3.1: строки «WB Данные» — метрики по nmID, у строки без карточки нули', () => {
  const { wbBuildWbDataRows_ } = loadScript();
  const rows = wbBuildWbDataRows_(
    [{ vendorCode: 'A', barcode: '111', nmID: 101 }, { vendorCode: 'B', barcode: '222', nmID: 0 }],
    { 101: 11 },
    { 101: 22 },
    { fbs: { 101: 3 }, fbo: { 101: 4 } },
    '25.09.2026 07:15',
  );
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    ['A', '111', 101, 11, 22, 3, 0.6, 4, 0.8, '25.09.2026 07:15'],
    ['B', '222', '', 0, 0, 0, 0, 0, 0, '25.09.2026 07:15'],
  ]);
});
