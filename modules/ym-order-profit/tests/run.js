/* Тесты центрального кода на стабах Apps Script: модель на синтетике с ручным расчётом, факт, тариф вручную,
   себес из двух источников, юнитка, полный прогон очереди на поддельном Маркете, миграция листов, окна пульта.
   node modules/ym-order-profit/tests/run.js */
const path = require('path');
const gas = require('./fake_gas');
const C = require(path.join(__dirname, '..', 'central', 'build', 'central.js'));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n      ')); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ': ждали ' + JSON.stringify(b) + ', пришло ' + JSON.stringify(a)); }
function near(a, b, msg, eps) { if (Math.abs(a - b) > (eps || 0.01)) throw new Error((msg || '') + ': ждали ' + b + ', пришло ' + a); }
function ok(x, msg) { if (!x) throw new Error(msg || 'не выполнено'); }

const iso = d => d.toISOString().slice(0, 10);
const D = (() => { const m = new Date(Date.now() + 3 * 3600e3); m.setUTCDate(m.getUTCDate() - 1); return iso(m); })();  // вчера по Москве
const add = (d, k) => C.yopAddDays_(d, k);
const OLD = add(D, -26);          // в когорте 14–35 дней и в окне факта
const MID = add(D, -16);          // день с фактом на листе «по дням» (старше 14 дней, в пределах 21)

// --- синтетика: 40 заказов артикула A в OLD (36 доставлено), 10 заказов в MID, 2 шт в день D ---
function marketOrder(id, day, status, sku, count, bid) {
  return { id: id, creationDate: day, status: status, fake: false, items: [{ shopSku: sku, count: count, bidFee: bid || 2000,
    prices: [{ type: 'BUYER', costPerItem: 400 }, { type: 'MARKETPLACE', costPerItem: 500 }, { type: 'CASHBACK', costPerItem: 100 }] }] };
}
const ORDERS = [];
for (let i = 1; i <= 40; i++) ORDERS.push(marketOrder(i, OLD, i % 10 ? 'DELIVERED' : 'CANCELLED_IN_DELIVERY', 'A', 1));
for (let i = 41; i <= 50; i++) ORDERS.push(marketOrder(i, MID, 'DELIVERED', 'M', 1));   // другой артикул: коэффициенты А не смешиваются
ORDERS.push(marketOrder(100, D, 'PROCESSING', 'A', 2));
const delivered = ORDERS.filter(o => o.status === 'DELIVERED').map(o => o.id);
const skuOf = id => (id > 40 && id <= 50 ? 'M' : 'A');
const SVC = {
  'placement.json': delivered.map(id => ({ orderId: id, shopSku: skuOf(id), amountWithoutBonuses: 490, tariff: 49,
    orderCreationDateTime: add(D, -5) + 'T10:00:00', serviceDate: MID })),
  'boost.json': delivered.map(id => ({ orderId: id, shopSku: skuOf(id), prepaid: null, postpaid: 180, bonusPaid: null, serviceDate: MID })),
  'cpm-boost.json': [{ payment: 3000, serviceDate: D }],
  'paid_storage_fby.json': [{ paidStorage: 150, serviceDate: D }]
};

function cacheOf(orders, svcFiles) {
  const c = { orders: {}, svc: {}, tariffs: {}, dayCost: {}, svcDays: [] };
  orders.forEach(o => { c.orders[String(o.id)] = C.yopOrderRecord_(o); });
  C.yopAddServices_(c, svcFiles);
  return c;
}

console.log('модель');
const cache = cacheOf(ORDERS, SVC), flat = C.yopItems_(cache);

t('прогноз дня: выкуп 36/40, комиссия от выручки, буст = ставка × доля списания, себес на выкуп', () => {
  const f = C.yopForecast_(cache, D, { A: 100 }, flat, null), r = f.rows[0];
  // когорта 14–35 дней: 40 заказов OLD, 36 доставлено → выкуп 0,9;
  // буст: списано 36 × 180 = 6480 ÷ (сумма заказов 40 000 × ставка 0,2) = 0,81 ставки
  near(r.coef.выкуп, 0.9, 'выкуп'); near(r.coef.тариф, 0.49, 'тариф'); near(r.coef.буст_k, 0.81, 'буст_k');
  near(r.выручка, 1800, 'выручка'); near(r.комиссия, 882, 'комиссия'); near(r.буст, 2000 * 0.2 * 0.81, 'буст'); near(r.себес, 180, 'себес');
  near(r.ЧП, 1800 - 882 - 324 - 180, 'ЧП');
  eq(r.src, 'артикул');
});

t('тариф вручную действует с даты заказа, до неё — тариф из начислений', () => {
  near(C.yopForecast_(cache, D, { A: 100 }, flat, { tariff: 35, tariffFrom: add(D, -3) }).rows[0].комиссия, 1800 * 0.35, 'с даты');
  near(C.yopForecast_(cache, D, { A: 100 }, flat, { tariff: 35, tariffFrom: add(D, 3) }).rows[0].комиссия, 882, 'ещё не действует');
  near(C.yopForecast_(cache, D, { A: 100 }, flat, { tariff: 35, tariffFrom: '' }).rows[0].комиссия, 630, 'без даты — всегда');
});

t('факт дня: выкупленные × цена − удержания Маркета − себес выкупленных', () => {
  const f = C.yopFactDay_(cache, flat, OLD, { A: 100 });
  eq(f.n, 40); eq(f.deliv, 36); near(f.известно, 1, 'известно');
  near(f.ЧП, 36 * 1000 - 36 * (490 + 180) - 36 * 100, 'ЧП');
  near(C.yopFactDay_(cache, flat, D, {}).известно, 0, 'заказы вчера ещё в пути');
});

t('юнитка: штука с заказами — факт цены за 7 дней; только с остатком — цена кабинета и коэффициенты кабинета', () => {
  const u = C.yopUnitRows_(cache, flat, D, { A: 100 }, null,
    { offers: { A: { name: 'Товар А', price: 1100 }, B: { name: 'Товар Б', price: 700 } }, stocks: { fby: { A: 50, B: 5 }, fbs: {} } });
  eq(u.rows.map(r => r.sku).join(','), 'A,M,B', 'по продажам за 30 дней, потом по остатку');
  near(u.rows[0].price, 1000, 'цена А = факт 7 дней'); eq(u.rows[0].n30, 42);
  const b = u.rows[2]; eq(b.price, 700, 'нет продаж — цена кабинета'); eq(b.src, 'кабинет'); eq(b.cogs, null); eq(b.fby, 5);
  near(u.drr, 3000 / 52000, 'реклама за показы ÷ сумма заказов 30 дней');       // 40 + 10 + 2 шт по 1000 за 30 дней
  const x = C.yopUnitCalc_(u.rows[0]);
  // на выкупленную штуку: комиссия 490, буст 1000 × 0,2 × 0,81 ÷ 0,9 = 180, себес 100, показы — доля кабинета ÷ выкуп
  near(x.расходы, 490 + 180, 'расходы Маркета'); near(x.показы, 1000 * (3000 / 52000) / 0.9, 'показы');
  near(x.ЧП, (1000 - 670 - 100 - 1000 * (3000 / 52000) / 0.9) * 0.75, 'ЧП на штуку');
});

console.log('книга');

function book(extra) {
  const settings = new gas.FakeSheet(C.YOP_SH.settings, [['Настройки'], ['…'], ['Папка кэша на Диске (id)', 'папка'], [],
    ['Кабинет', 'Лист юнитки (себес)', 'Считать (да/нет)'],
    ['Кабинет-А', 'А Юнит', 'да'], ['Кабинет-Б', '', 'да'], ['Кабинет-В', '', 'да'], ['Кабинет-Г', '', 'нет']]);
  const keys = new gas.FakeSheet(C.YOP_SH.keys, [['Кабинет', 'API-ключ', 'Business ID', 'Campaign ID (FBS)', 'Campaign ID (FBY)'],
    ['Кабинет-А', 'k-a', 11, '', 101], ['Кабинет-В', 'k-v', 33, 303, '']]);
  const unit = new gas.FakeSheet('А Юнит', [['Бренд', 'Наименование', 'Код 1С', 'себес'], ['', '', 'A', 100], ['', '', 'Z', 55]]);
  return [settings, keys, unit].concat(extra || []);
}

/** Поддельный Маркет: заказы по окну дат, отчёт услуг, карточки и остатки. */
function market(orders, svc) {
  return function (url, opt) {
    const body = opt.payload ? JSON.parse(opt.payload) : {};
    if (url.indexOf('/stats/orders') > 0) {
      const res = body.dateFrom ? orders.filter(o => o.creationDate >= body.dateFrom && o.creationDate <= body.dateTo) : [];
      return gas.resp(200, { result: { orders: res, paging: {} } });
    }
    if (url.indexOf('united-marketplace-services/generate') > 0) return gas.resp(200, { result: { reportId: 'r-' + body.dateFrom + '-' + body.dateTo } });
    if (url.indexOf('/reports/info/') > 0) return gas.resp(200, { result: { status: 'DONE', file: 'https://file/' + url.split('/').pop() } });
    if (url.indexOf('https://file/') === 0) {
      const p = url.split('r-')[1], d1 = p.slice(0, 10), d2 = p.slice(11, 21), files = {};
      Object.keys(svc).forEach(n => { files[n] = svc[n].filter(r => r.serviceDate >= d1 && r.serviceDate <= d2); });
      return gas.resp(200, '', { files: files });
    }
    if (url.indexOf('/offer-mappings') > 0) {
      return gas.resp(200, { result: { offerMappings: [{ offer: { offerId: 'A', name: 'Товар А', basicPrice: { value: 1100 },
        campaigns: [{ campaignId: 101, status: 'PUBLISHED' }] } }], paging: {} } });
    }
    if (url.indexOf('/offers/stocks') > 0) {
      return gas.resp(200, { result: { warehouses: [{ offers: [{ offerId: 'A', stocks: [{ type: 'AVAILABLE', count: 40 }, { type: 'FIT', count: 45 }] }] }], paging: {} } });
    }
    if (/\/campaigns\/\d+$/.test(url)) return gas.resp(opt.headers['Api-Key'] === 'k-a' ? 200 : 401, {});
    throw new Error('неожиданный запрос ' + url);
  };
}

const env = gas.install(book(), market(ORDERS, SVC));
const seeded = cacheOf(ORDERS.filter(o => o.creationDate < D), SVC);          // кэш кабинета А — по позавчера
seeded.lastDay = add(D, -1);
for (let d = add(D, -41); d <= add(D, -1); d = add(d, 1)) seeded.svcDays.push(d);
seeded.dayCost = {};                                                             // расходы дня D придут из отчёта
env.folder.files['yop_cache_Кабинет-А.json'] = JSON.stringify(seeded);

t('⚙️ Обновить настройки таблицы: колонки тарифа и лист «себес вручную»', () => {
  C.upgradeSheets();
  const s = env.ss.getSheetByName(C.YOP_SH.settings);
  eq(s.get(5, 4), 'Тариф комиссии вручную, %'); eq(s.get(5, 5), 'с даты заказа'); eq(s.get(5, 6), 'Комментарий');
  const cg = env.ss.getSheetByName(C.YOP_SH.cogs);
  ok(cg, 'лист себеса создан'); eq(cg.get(4, 2), 'Артикул магазина');
  C.upgradeSheets();                                                             // повтор ничего не дублирует
  eq(s.get(5, 7), '', 'лишних колонок нет');
});

t('настройки: шапка по заголовку, тариф 0,49 → 49 %, «нет» выключает кабинет', () => {
  const s = env.ss.getSheetByName(C.YOP_SH.settings);
  s.set(6, 4, 0.49); s.set(6, 5, new Date(Date.UTC(2026, 8, 1, 9)));
  const st = C.yopSettings_();
  eq(st.cabinets.map(c => c.name).join(','), 'Кабинет-А,Кабинет-Б,Кабинет-В'); eq(st.folderId, 'папка');
  near(st.cabinets[0].tariff, 49, 'тариф'); eq(st.cabinets[0].tariffFrom, '2026-09-01');
  s.set(6, 4, ''); s.set(6, 5, '');
});

t('себес: лист «вручную» главнее юнитки, артикул-число совпадает с текстовым', () => {
  const cg = env.ss.getSheetByName(C.YOP_SH.cogs);
  cg.set(5, 1, 'Кабинет-А'); cg.set(5, 2, 'Z'); cg.set(5, 3, 60);
  cg.set(6, 1, 'Кабинет-В'); cg.set(6, 2, 10421); cg.set(6, 3, '1 057,11');
  const a = C.yopCogs_({ name: 'Кабинет-А', unit: 'А Юнит' });
  eq(a.map.A.v, 100); eq(a.map.A.src, 'юнитка'); eq(a.map.Z.v, 60); eq(a.map.Z.src, 'вручную');
  const v = C.yopCogs_({ name: 'Кабинет-В', unit: '' });
  near(v.map['10421'].v, 1057.11, 'число из текста с пробелом и запятой'); eq(v.unit, null);
  const f = C.yopCogsFormula_(a, '$A5', '$B5');
  ok(f.indexOf("COUNTIFS('💲 ЧП ЯМ себес вручную'!$A:$A,$A5") > 0 && f.indexOf("VLOOKUP($B5,'А Юнит'!$C:$D,2,FALSE)") > 0, f);
});

t('1️⃣ полный прогон: кабинет без ключа пропущен, новый докачан кусками, листы записаны', () => {
  C.yopRunYesterday();
  eq(env.props.YOP_QUEUE, undefined, 'очередь закрыта');
  const last = JSON.parse(env.props.YOP_LAST_DONE);
  eq(last.day, D); eq(last.errors.length, 0, 'ошибок нет: ' + last.errors.join('; '));
  ok(/Кабинет-Б: пропущен/.test(env.props.YOP_LOG), 'в журнале пропуск кабинета без ключа');
  const v = JSON.parse(env.folder.files['yop_cache_Кабинет-В.json']);
  eq(v.lastDay, D, 'новый кабинет догнан'); eq(v.svcDays.length, 42, '42 дня отчёта услуг');
  const gens = env.net.filter(n => n[0].indexOf('generate') > 0 && n[1].businessId === 33);
  eq(gens.length, 6, 'история нового кабинета — 6 кусков по 7 дней');
  const a = JSON.parse(env.folder.files['yop_cache_Кабинет-А.json']);
  eq(a.lastDay, D); eq(a.orders['100'].it[0][1], 2, 'заказ вчера в кэше'); eq(a.dayCost[D]['показы'], 3000);
});

t('«🧾 по заказам»: строка заказа, себес формулой, источник себеса', () => {
  const s = env.ss.getSheetByName(C.YOP_SH.detail);
  eq(s.get(5, 1), 'Кабинет-А'); eq(s.get(5, 2), 'A'); eq(s.get(5, 3), 2);
  ok(String(s.get(5, 16)).indexOf('=IF(COUNTIFS(') === 0, 'себес формулой');
  eq(s.get(5, C.YOP_DETAIL_HEAD.length), 'юнитка'); eq(s.formats['5:2'], '@', 'артикул текстом');
});

t('«📈 по дням»: 21 день, вчера сверху формулами, факт в X–Z по дням старше 14 дней', () => {
  const s = env.ss.getSheetByName(C.YOP_SH.days);
  eq(s.get(4, 24), 'Факт: ЧП заказов дня, ₽');
  const dates = s.col(1, 5).filter(String), uniq = [...new Set(dates)];
  eq(uniq.length, 21, 'дней на листе'); eq(uniq[0], D.split('-').reverse().join('.'), 'вчера сверху');
  ok(String(s.get(5, 3)).indexOf('=SUMIFS(') === 0, 'вчера — формулами из листа по заказам');
  eq(s.get(5, 16), 3000, 'реклама за показы — факт дня'); eq(s.get(5, 17), 150, 'хранение — факт дня');
  const mid = MID.split('-').reverse().join('.');
  const r = s.rows.findIndex(x => x[0] === mid && x[1] === 'Кабинет-А') + 1;
  ok(r > 0, 'строка дня MID');
  eq(s.get(r, 24), 10 * 1000 - 10 * (490 + 180), 'факт ЧП заказов MID (себеса у M нет)');
  near(s.get(r, 26), 1, 'судьба известна');
  const tot = s.rows.findIndex(x => x[0] === mid && x[1] === 'Все кабинеты') + 1;
  const rv = s.rows.findIndex(x => x[0] === mid && x[1] === 'Кабинет-В') + 1;
  eq(s.get(tot, 24), s.get(r, 24) + s.get(rv, 24), 'итог дня = сумма кабинетов');
  eq(typeof s.get(r, 25), 'number', 'факт − прогноз числом');     // O в стабе — строка формулы, вычислить её нечем
  eq(s.get(5, 24), '', 'вчера — факта ещё нет');
});

t('«🧮 юнитка»: цены и остатки из Маркета, формулы на 44 колонки', () => {
  const s = env.ss.getSheetByName(C.YOP_SH.unit), row = s.rows[4];
  eq(row.length, C.YOP_UNIT_HEAD.length, 'колонок');
  eq(row[0], 'Кабинет-А'); eq(row[1], 'A'); eq(row[2], 'Товар А'); eq(row[4], 1100); eq(row[9], 40, 'остаток FBY');
  eq(row[37], '=AJ5-AK5', 'ЧП на штуку формулой'); eq(row[43], 'юнитка');
});

t('повторный прогон того же дня не дублирует блок; следующий день встаёт сверху', () => {
  C.yopRecalcSheets();
  const s = env.ss.getSheetByName(C.YOP_SH.days), ru = D.split('-').reverse().join('.');
  eq(s.col(1, 5).filter(x => x === ru).length, 3, 'блок вчера: 2 кабинета + итог, один раз');
  ok(typeof s.get(12, 3) !== 'string' || String(s.get(12, 3)).indexOf('=SUMIFS') < 0, 'прошлые дни не ссылаются на лист по заказам');
});

t('2️⃣ юнитка: только карточки и остатки, заказы не качаются', () => {
  const before = env.net.length;
  C.yopRefreshUnit();
  const calls = env.net.slice(before).map(n => n[0]);
  ok(calls.every(u => u.indexOf('/stats/orders') < 0 && u.indexOf('generate') < 0), 'ни заказов, ни отчётов');
  ok(calls.some(u => u.indexOf('/offers/stocks') > 0), 'остатки взяты');
});

t('прогон уже идёт — второй не стартует; завис — стартует заново', () => {
  env.props.YOP_QUEUE = JSON.stringify({ mode: 'full', day: D, cabs: ['Кабинет-А'], unitCabs: [], started: new Date().toISOString(),
    touched: new Date().toISOString(), errors: [] });
  const before = env.net.length;
  C.yopRunYesterday();
  eq(env.net.length, before, 'запросов нет'); ok(env.props.YOP_QUEUE, 'очередь на месте');
  const q = JSON.parse(env.props.YOP_QUEUE); q.touched = new Date(Date.now() - 3600e3).toISOString(); env.props.YOP_QUEUE = JSON.stringify(q);
  C.yopDailyTrigger();
  eq(env.props.YOP_QUEUE, undefined, 'зависший перезапущен и доведён');
});

t('⏰ автопрогон: триггер ставится один раз и снимается', () => {
  C.yopTriggerOn(); C.yopTriggerOn();
  eq(env.triggers.filter(x => x.handler === 'yopDailyTrigger').length, 1);
  C.yopTriggerOff();
  eq(env.triggers.filter(x => x.handler === 'yopDailyTrigger').length, 0);
});

console.log('пульт');

t('📊 статус: одно действие — ключ для кабинета без ключа', () => {
  const r = C.yopStatus('v-test');
  ok(r.html.indexOf('Кабинет-Б') > 0 && r.text.indexOf('Впишите ключ') >= 0, r.text.split('\n')[0]);
});

t('📊 порядок действий: завис > идёт > первый прогон > ошибки > ключ > автопрогон > себес > ничего', () => {
  const base = { noKey: [], noCogs: 0, last: { errors: [] }, auto: true };
  ok(/Сбросить/.test(C.yopNextAction_(Object.assign({}, base, { queue: {}, stale: true }))));
  ok(/ничего делать не нужно/.test(C.yopNextAction_(Object.assign({}, base, { queue: {} }))));
  ok(/первый прогон/.test(C.yopNextAction_(Object.assign({}, base, { last: null }))));
  ok(/автопрогон/.test(C.yopNextAction_(Object.assign({}, base, { auto: false }))));
  ok(/себес 3/.test(C.yopNextAction_(Object.assign({}, base, { noCogs: 3 }))));
  ok(/Ничего делать не нужно/.test(C.yopNextAction_(base)));
});

t('🔌 проверка связи: один fetchAll без повторов, код ответа — диагноз', () => {
  const before = env.net.length, r = C.yopCheckConnection();
  eq(env.net.length - before, 2, 'по запросу на кампанию');
  ok(r.text.indexOf('Кабинет-А — FBY — отвечает') >= 0, r.text);
  ok(r.text.indexOf('Кабинет-В — FBS — ключ не принят (401)') >= 0, r.text);
  ok(r.text.indexOf('Кабинет-Б — — — нет строки') >= 0, r.text);
});

t('📖 инструкция: кнопки, листы, новый кабинет, версия', () => {
  const r = C.yopHelp('v9.9.9');
  ['1️⃣', '2️⃣', C.YOP_SH.cogs, 'Тариф комиссии вручную', 'v9.9.9', 'Новый кабинет'].forEach(w => ok(r.html.indexOf(w) >= 0, w));
});

console.log('\nТесты: ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);