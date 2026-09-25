const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load } = require('./load');

const { fbsPlanOne_, fbsRoundKeepingSum_, fbsPool_, fbsNormName_ } = load();

const sum = (a) => a.reduce((x, y) => x + y, 0);

/* ---------- раскладка ---------- */

test('дефицит: сверх неснижаемого режет пропорционально спросу', () => {
  const res = fbsPlanOne_(150, [100, 50, 0], [0, 0, 0], { horizonDays: 14, minStock: 5 });
  assert.equal(res.mode, 'дефицит');
  assert.equal(sum(res.plan), 150);
  assert.equal(res.plan[2], 5);              // склад без заказов держит неснижаемый остаток
  const over = [res.plan[0] - 5, res.plan[1] - 5];   // 91 и 44 — округление до штук
  assert.ok(Math.abs(over[0] / over[1] - 2) < 0.1, JSON.stringify(res.plan));
});

test('профицит: цель на горизонт, излишек на базовый склад', () => {
  const res = fbsPlanOne_(1000, [100, 50, 0], [0, 0, 0],
                          { horizonDays: 14, minStock: 5, baseIndex: 0 });
  assert.equal(res.mode, 'профицит');
  assert.equal(sum(res.plan), 1000);
  assert.equal(res.plan[1], 140);            // второй склад получил ровно горизонт
  assert.equal(res.plan[2], 5);              // холодный — неснижаемый остаток
  assert.equal(res.plan[0], 1000 - 140 - 5); // излишек осел на базовом
});

test('неснижаемый остаток держится и в дефиците — боевой разбор 26.08.2026', () => {
  // до v1.2.0 слабый город в дефиците получал 0–1 штуку и пропадал из региона
  const res = fbsPlanOne_(300, [400, 300, 2, 0], [0, 0, 0, 0],
                          { horizonDays: 14, minStock: 5, baseIndex: 0 });
  assert.equal(sum(res.plan), 300);
  res.plan.forEach((v) => assert.ok(v >= 5, 'каждому складу минимум 5: ' + JSON.stringify(res.plan)));
});

test('мало товара: даём только тем городам, кому хватает неснижаемого', () => {
  // 12 шт при минимуме 5 — два города, а не «по 4 штуки всем»
  const res = fbsPlanOne_(12, [100, 50, 1], [0, 0, 0], { horizonDays: 14, minStock: 5 });
  assert.equal(res.mode, 'мало товара — только 2 городов');
  assert.equal(sum(res.plan), 12);
  assert.equal(res.plan[2], 0);
  res.plan.slice(0, 2).forEach((v) => assert.ok(v >= 5, JSON.stringify(res.plan)));
});

test('мало товара: 36 шт на 19 складов не размазываются по 1–2 штуки', () => {
  const orders = [40, 30, 25, 20, 15, 12, 10, 8, 6, 5, 4, 3, 2, 2, 1, 1, 1, 0, 0];
  const res = fbsPlanOne_(36, orders, orders.map(() => 0), { horizonDays: 14, minStock: 5 });
  assert.equal(sum(res.plan), 36);
  const alive = res.plan.filter((v) => v > 0);
  assert.equal(alive.length, 7, JSON.stringify(res.plan));
  alive.forEach((v) => assert.ok(v >= 5, JSON.stringify(res.plan)));
});

test('совсем мало товара — весь на самый продающий склад', () => {
  const res = fbsPlanOne_(4, [10, 90, 0], [0, 0, 0], { horizonDays: 14, minStock: 5 });
  assert.equal(res.mode, 'мало товара — весь на один склад');
  assert.deepEqual(res.plan, [0, 4, 0]);
});

test('спроса нет нигде: неснижаемый всем, остальное на базовый', () => {
  const res = fbsPlanOne_(120, [0, 0, 0], [30, 20, 10],
                          { horizonDays: 14, minStock: 5, baseIndex: 0 });
  assert.equal(res.mode, 'нет спроса');
  assert.deepEqual(res.plan, [110, 5, 5]);
  assert.equal(sum(res.plan), 120);
});

test('спроса нет и пула мало: раскладку не трогаем', () => {
  const res = fbsPlanOne_(60, [0, 0, 0], [30, 20, 10],
                          { horizonDays: 14, minStock: 25, baseIndex: 0 });
  assert.deepEqual(res.plan, [30, 20, 10]);
});

test('пул ноль: обнуляем все склады', () => {
  const res = fbsPlanOne_(0, [100, 50], [40, 10], { horizonDays: 14 });
  assert.deepEqual(res.plan, [0, 0]);
});

test('сумма плана равна пулу на неудобных дробях', () => {
  for (const pool of [1, 7, 13, 99, 1001, 2640]) {
    const res = fbsPlanOne_(pool, [7, 3, 11, 1, 0], [0, 0, 0, 0, 0],
                            { horizonDays: 14, minStock: 5 });
    assert.equal(sum(res.plan), pool, 'пул ' + pool);
    res.plan.forEach((v) => assert.ok(v >= 0 && Number.isInteger(v)));
  }
});

test('дефицит на единицу пула отдаёт её самому крупному спросу', () => {
  const res = fbsPlanOne_(1, [100, 1], [0, 0], { horizonDays: 14, minStock: 5 });
  assert.deepEqual(res.plan, [1, 0]);
});

test('неснижаемый ноль — раскладка чисто по спросу', () => {
  const res = fbsPlanOne_(1000, [100, 50, 0], [0, 0, 0],
                          { horizonDays: 14, minStock: 0, baseIndex: 0 });
  assert.equal(res.plan[2], 0);
  assert.equal(sum(res.plan), 1000);
});

test('округление с сохранением суммы не уходит в минус', () => {
  assert.deepEqual(fbsRoundKeepingSum_([1.5, 1.5], 3), [2, 1]);
  assert.deepEqual(fbsRoundKeepingSum_([5, 5], 8), [4, 4]);
  assert.equal(sum(fbsRoundKeepingSum_([0, 0, 0], 5)), 5);
});

test('имена складов: базовый склад ищется по нормализованному имени', () => {
  // «Ростов - на - Дону» у WB и «Ростов-на-Дону» в книге — один и тот же склад.
  assert.equal(fbsNormName_('Ростов - на - Дону'), fbsNormName_('Ростов-на-Дону'));
  assert.equal(fbsNormName_(' Санкт-Петербург '), 'санкт-петербург');
  assert.equal(fbsNormName_('Мой склад'), 'мой склад');
  assert.equal(fbsNormName_(null), '');
});

/* ---------- пул ---------- */

test('пул: «Факт на FBS» перекрывает живые остатки WB', () => {
  // боевой случай кабинета Б 25.08.2026: в кабинете висит 4920, реально перевезено 2640
  assert.equal(fbsPool_(4920, 0, 2640, 0, 0).pool, 2640);
  assert.equal(fbsPool_(4920, 0, 2640, 0, 0).source, 'факт');
  assert.equal(fbsPool_(74, 0, 360, 0, 0).pool, 360);
});

test('пул: пустой факт — это не ноль', () => {
  assert.equal(fbsPool_(500, 0, null, 0, 0).pool, 500);
  assert.equal(fbsPool_(500, 0, '', 0, 0).pool, 500);
  assert.equal(fbsPool_(500, 0, 0, 0, 0).pool, 0);      // явный ноль = на складе пусто
});

test('пул: обычный день — остатки плюс привезли', () => {
  assert.equal(fbsPool_(500, 120, null, 0, 0).pool, 620);
  assert.equal(fbsPool_(500, 120, null, 0, 0).source, 'остатки + привезли 120');
  assert.equal(fbsPool_(500, 0, null, 0, 0).pool, 500);
});

/* v1.4.0 — минус в «Привезли (±)»: со склада FBS товар не только привозят, но и забирают. */

test('минус в «привезли»: вычитается из пула', () => {
  const r = fbsPool_(500, -120, null, 0, 0);
  assert.equal(r.pool, 380);
  assert.equal(r.source, 'остатки − забрали 120');
});

test('минус больше остатка — пул ноль, а не отрицательный', () => {
  assert.equal(fbsPool_(50, -500, null, 0, 0).pool, 0);
});

test('минус НЕ гасит долг: вывоз со склада — не перемещение на склад', () => {
  const r = fbsPool_(700, -100, null, 200, 0);
  assert.equal(r.covered, 0);
  assert.equal(r.debt, 200);
  assert.equal(r.pool, 600);
});

test('минус вместе с авансом: обе поправки в одном пуле', () => {
  const r = fbsPool_(700, -100, null, 0, 50);
  assert.equal(r.pool, 650);
  assert.equal(r.debt, 50);
  assert.equal(r.source, 'остатки − забрали 100 + аванс 50');
});

test('факт главнее минуса: заполнен «Факт на FBS (=)» — «привезли» не смотрим', () => {
  assert.equal(fbsPool_(500, -300, 400, 0, 0).pool, 400);
});

test('долг: аванс из 1С попадает в пул и повисает', () => {
  const r = fbsPool_(500, 0, null, 0, 200);
  assert.equal(r.pool, 700);
  assert.equal(r.debt, 200);
  assert.equal(r.source, 'остатки + аванс 200');
});

test('долг: на следующий день не считается второй раз', () => {
  // аванс уже выставлен в кабинете, значит сидит внутри живых остатков
  const r = fbsPool_(700, 0, null, 200, 0);
  assert.equal(r.pool, 700);
  assert.equal(r.debt, 200);
});

test('долг: реальное перемещение сначала гасит долг', () => {
  const r = fbsPool_(700, 200, null, 200, 0);
  assert.equal(r.covered, 200);
  assert.equal(r.debt, 0);
  assert.equal(r.pool, 700);                 // товар уже лежал на витрине авансом
});

test('долг: перемещение больше долга — излишек идёт в пул', () => {
  const r = fbsPool_(700, 500, null, 200, 0);
  assert.equal(r.covered, 200);
  assert.equal(r.debt, 0);
  assert.equal(r.pool, 1000);                // 700 + (500 − 200)
});

test('долг: перемещение меньше долга — остаток долга висит дальше', () => {
  const r = fbsPool_(700, 50, null, 200, 0);
  assert.equal(r.debt, 150);
  assert.equal(r.pool, 700);
});

test('долг: с фактом на складе долг кладётся сверху', () => {
  const r = fbsPool_(999, 0, 300, 150, 0);
  assert.equal(r.pool, 450);
  assert.equal(r.debt, 150);
  assert.equal(r.source, 'факт + долг 150');
});
