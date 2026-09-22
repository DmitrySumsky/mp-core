/* МОДЕЛЬ — вся логика расчёта.
 *
 * Из каких заказов берутся коэффициенты, как из них получается прибыль заказов дня, как считается
 * факт дня и экономика одной штуки для юнитки. Файл не ходит ни в Маркет, ни в таблицу — только считает.
 *
 * Кэш кабинета (его собирает «03_сбор.js», хранит «02_настройки.js»):
 *   orders  { номер заказа: { d: дата заказа, st: статус, it: [[артикул, шт, цена, ставка буста, доставлено шт]] } }
 *   svc     { "заказ|артикул": { статья: ₽ } }  — факт удержаний Маркета по заказу (отчёт «Стоимость услуг»);
 *           «заказ|» без артикула — удержания на весь заказ, делятся по штукам
 *   tariffs { "дата заказа|артикул": тариф комиссии, % }
 *   dayCost { дата: { показы, хранение, подписка, прочее } } — расходы дня, к заказам не привязаны
 */

var YOP = {
  COHORT_FROM: 35, COHORT_TO: 14,  // дней назад: заказы, чья судьба уже известна — из них выкуп и доли расходов
  MILE_FROM: 21, MILE_TO: 8,       // дней назад: свежая ставка средней мили (меняется быстрее выкупа)
  TARIFF_DAYS: 14,                 // дней назад: окно действующего тарифа комиссии
  MIN_UNITS: 30,                   // у артикула меньше штук в когорте — берутся коэффициенты кабинета
  DEFAULT_TARIFF: 49,
  TAX: 0.25,                       // налог, как в юнитке: минус 25 % от маржи
  FACT_AGE: 14,                    // с какого возраста дня (дней назад) в «по дням» пишется факт
  UNIT_DAYS: 30,                   // юнитка: окно продаж и рекламы за показы
  UNIT_PRICE_DAYS: 7               // юнитка: окно фактической цены продажи и ставки буста
};
var YOP_ORDER_COSTS = ['комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее'];
var YOP_COSTS = YOP_ORDER_COSTS.concat(['себес']);
var YOP_DAY_COSTS = ['показы', 'хранение', 'подписка', 'прочее'];
var YOP_TRANSIT = { PROCESSING: 1, DELIVERY: 1, PICKUP: 1, RESERVED: 1, UNPAID: 1, PENDING: 1 };

/** Позиции заказов кэша плоским списком + штук в каждом заказе (для деления удержаний «на заказ»). */
function yopItems_(cache) {
  var items = [], units = {};
  Object.keys(cache.orders).forEach(function (oid) {
    var o = cache.orders[oid];
    o.it.forEach(function (x) {
      items.push({ oid: oid, day: o.d, sku: x[0], n: x[1], price: x[2], bid: x[3], deliv: x[4], transit: !!YOP_TRANSIT[o.st] });
      units[oid] = (units[oid] || 0) + x[1];
    });
  });
  return { items: items, units: units };
}

/** Факт удержаний Маркета по позиции заказа. */
function yopFact_(cache, it, units) {
  var out = {}, own = cache.svc[it.oid + '|' + it.sku] || {}, whole = cache.svc[it.oid + '|'] || {};
  var share = it.n / Math.max(units[it.oid] || 0, 1);
  Object.keys(own).forEach(function (k) { out[k] = (out[k] || 0) + own[k]; });
  Object.keys(whole).forEach(function (k) { out[k] = (out[k] || 0) + whole[k] * share; });
  return out;
}

/** Суммы по артикулам (и '*' — весь кабинет) за окно дат заказа. */
function yopAgg_(cache, flat, d0, d1) {
  var agg = {};
  flat.items.forEach(function (it) {
    if (it.day < d0 || it.day > d1) return;
    var f = yopFact_(cache, it, flat.units);
    [it.sku, '*'].forEach(function (key) {
      var a = agg[key] || (agg[key] = { n: 0, deliv: 0, transit: 0, gmv: 0, bidgmv: 0 });
      a.n += it.n; a.deliv += it.deliv; a.transit += it.transit ? it.n : 0;
      a.gmv += it.price * it.n; a.bidgmv += it.price * it.n * it.bid;
      Object.keys(f).forEach(function (k) { a[k] = (a[k] || 0) + f[k]; });
    });
  });
  return agg;
}

/** Действующий тариф комиссии: самый частый за последние TARIFF_DAYS дней — по артикулу и по кабинету. */
function yopTariffs_(cache, day) {
  var lo = yopAddDays_(day, -YOP.TARIFF_DAYS), bySku = {}, cab = {};
  Object.keys(cache.tariffs).forEach(function (key) {
    var p = key.split('|'), d = p[0], sku = p.slice(1).join('|'), t = cache.tariffs[key];
    if (d < lo || d > day) return;
    (bySku[sku] || (bySku[sku] = {}))[t] = (bySku[sku][t] || 0) + 1;
    cab[t] = (cab[t] || 0) + 1;
  });
  var mode = function (c) {
    var best = null;
    Object.keys(c).forEach(function (t) { if (best === null || c[t] > c[best]) best = t; });
    return best === null ? null : Number(best);
  };
  var out = {};
  Object.keys(bySku).forEach(function (s) { out[s] = mode(bySku[s]); });
  var m = mode(cab);
  return { sku: out, cab: m === null ? YOP.DEFAULT_TARIFF : m };
}

/**
 * Коэффициенты на прогноз заказов дня `day` по каждому артикулу и по кабинету ('*').
 *   выкуп     = доставлено ÷ заказано (только заказы с известной судьбой), когорта 14–35 дней назад
 *   тариф     = действующий тариф комиссии, доля
 *   буст_k    = списано буста ÷ (сумма заказов × ставка из заказа) — какую часть ставки Маркет реально берёт
 *   доставка, перевод — доля от суммы заказов
 *   миля      = ₽ на доставленную штуку по свежим заказам 8–21 день
 *   эквайринг, возврат, прочее — ₽ на заказанную штуку
 */
function yopCoefficients_(cache, flat, day, manual) {
  var agg = yopAgg_(cache, flat, yopAddDays_(day, -YOP.COHORT_FROM), yopAddDays_(day, -YOP.COHORT_TO));
  var mile = yopAgg_(cache, flat, yopAddDays_(day, -YOP.MILE_FROM), yopAddDays_(day, -YOP.MILE_TO));
  var tr = yopTariffs_(cache, day), out = {}, over = yopManualTariff_(manual, day);
  Object.keys(agg).forEach(function (key) {
    var a = agg[key], m = mile[key];
    if (!m || m.deliv < YOP.MIN_UNITS) m = mile['*'] || {};
    var known = Math.max(a.n - a.transit, 1), g = a.gmv || 1;
    var t = over != null ? over : key === '*' ? tr.cab : (tr.sku[key] != null ? tr.sku[key] : tr.cab);
    out[key] = {
      когорта_шт: a.n, когорта_доставлено: a.deliv,
      выкуп: a.deliv / known,
      тариф: t / 100,
      буст_k: a.bidgmv ? (a['буст'] || 0) / a.bidgmv : 0,
      доставка: (a['доставка'] || 0) / g,
      перевод: (a['перевод'] || 0) / g,
      миля: m.deliv ? (m['миля'] || 0) / m.deliv : 0,
      эквайринг: a.n ? (a['эквайринг'] || 0) / a.n : 0,
      возврат: a.n ? (a['возврат'] || 0) / a.n : 0,
      прочее: a.n ? (a['прочее'] || 0) / a.n : 0
    };
  });
  if (!out['*']) out['*'] = { когорта_шт: 0, когорта_доставлено: 0, выкуп: 0.85, тариф: (over != null ? over : tr.cab) / 100, буст_k: 1,
    доставка: 0.05, перевод: 0.016, миля: 0, эквайринг: 0.12, возврат: 0, прочее: 0 };
  return out;
}

/** Коэффициенты артикула или, если когорта мала, кабинета (тариф при этом остаётся свой). */
function yopPick_(coef, sku) {
  var c = coef[sku];
  if (c && c.когорта_шт >= YOP.MIN_UNITS) return { c: c, src: 'артикул' };
  var base = {};
  Object.keys(coef['*']).forEach(function (k) { base[k] = coef['*'][k]; });
  if (c) base.тариф = c.тариф;
  return { c: base, src: 'кабинет' };
}

/** Прогноз по артикулу: сколько принесут его заказы дня. */
function yopPredict_(row, c, cogs) {
  var rev = row.gmv * c.выкуп;
  var cost = {
    комиссия: rev * c.тариф,
    буст: row.gmv * row.bid * c.буст_k,
    доставка: row.gmv * c.доставка,
    миля: row.n * c.выкуп * c.миля,
    перевод: row.gmv * c.перевод,
    эквайринг: row.n * c.эквайринг,
    возврат: row.n * c.возврат,
    прочее: row.n * c.прочее,
    себес: row.n * c.выкуп * cogs
  };
  var sum = 0;
  Object.keys(cost).forEach(function (k) { sum += cost[k]; });
  cost.выручка = rev;
  cost.ЧП = rev - sum;
  return cost;
}

/** Заказы дня по артикулам с прогнозом. cogs — { артикул: себес }, manual — тариф вручную с листа настроек. */
function yopForecast_(cache, day, cogs, flat, manual) {
  flat = flat || yopItems_(cache);
  var coef = yopCoefficients_(cache, flat, day, manual), acc = {};
  flat.items.forEach(function (it) {
    if (it.day !== day) return;
    var a = acc[it.sku] || (acc[it.sku] = { n: 0, gmv: 0, bidgmv: 0 });
    a.n += it.n; a.gmv += it.price * it.n; a.bidgmv += it.price * it.n * it.bid;
  });
  var rows = Object.keys(acc).filter(function (s) { return acc[s].n > 0; }).map(function (s) {
    var a = acc[s], row = { sku: s, n: a.n, gmv: a.gmv, price: a.gmv / a.n, bid: a.gmv ? a.bidgmv / a.gmv : 0 };
    var p = yopPick_(coef, s), cg = cogs.hasOwnProperty(s) ? cogs[s] : null;
    var r = yopPredict_(row, p.c, cg || 0);
    Object.keys(r).forEach(function (k) { row[k] = r[k]; });
    row.coef = p.c; row.src = p.src; row.cogs = cg;
    return row;
  });
  rows.sort(function (a, b) { return b.gmv - a.gmv; });
  return { rows: rows, coef: coef };
}

/** v2.0.0. Тариф вручную с листа настроек, % — если он задан и действует для дня `day`; иначе null. */
function yopManualTariff_(manual, day) {
  if (!manual || manual.tariff == null) return null;
  if (manual.tariffFrom && day < manual.tariffFrom) return null;
  return manual.tariff;
}

/**
 * v2.0.0. ФАКТ заказов дня `day`: что Маркет по ним реально удержал (отчёт «Стоимость услуг»)
 * и сколько штук реально выкуплено. Сравнивается с прогнозом «ЧП заказов дня» — та же база:
 * до рекламы за показы, хранения, подписки и налога.
 *   выручка = цена продавца × выкупленные штуки; себес — на выкупленные штуки;
 *   известно = доля штук, у заказов которых судьба уже известна (не в пути).
 */
function yopFactDay_(cache, flat, day, cogs) {
  var r = { n: 0, known: 0, deliv: 0, выручка: 0, себес: 0, удержания: 0 };
  flat.items.forEach(function (it) {
    if (it.day !== day) return;
    var f = yopFact_(cache, it, flat.units);
    r.n += it.n;
    if (!it.transit) r.known += it.n;
    r.deliv += it.deliv;
    r.выручка += it.price * it.deliv;
    r.себес += it.deliv * (cogs[it.sku] || 0);
    YOP_ORDER_COSTS.forEach(function (k) { r.удержания += f[k] || 0; });
  });
  r.ЧП = r.выручка - r.удержания - r.себес;
  r.известно = r.n ? r.known / r.n : 0;
  return r;
}

/**
 * v2.0.0. Юнитка: экономика одной ВЫКУПЛЕННОЙ штуки по каждому артикулу с заказами за 30 дней
 * или с остатком на складах. Коэффициенты — те же, что у прогноза заказов дня `day` (факт удержаний
 * по дозревшим заказам); цена и ставка буста — факт заказов за 7 дней, нет заказов — цена в кабинете.
 * Реклама за показы делится условно: доля от суммы заказов кабинета за 30 дней.
 */
function yopUnitRows_(cache, flat, day, cogs, manual, unitData) {
  var coef = yopCoefficients_(cache, flat, day, manual);
  var lo30 = yopAddDays_(day, -YOP.UNIT_DAYS + 1), lo7 = yopAddDays_(day, -YOP.UNIT_PRICE_DAYS + 1);
  var acc = {}, gmv30 = 0, shows = 0;
  flat.items.forEach(function (it) {
    if (it.day < lo30 || it.day > day) return;
    var a = acc[it.sku] || (acc[it.sku] = { n30: 0, n7: 0, gmv7: 0, bidgmv7: 0 });
    a.n30 += it.n;
    gmv30 += it.price * it.n;
    if (it.day >= lo7) { a.n7 += it.n; a.gmv7 += it.price * it.n; a.bidgmv7 += it.price * it.n * it.bid; }
  });
  Object.keys(cache.dayCost).forEach(function (d) {
    if (d >= lo30 && d <= day) shows += cache.dayCost[d]['показы'] || 0;
  });
  var drr = gmv30 ? shows / gmv30 : 0;
  var offers = (unitData && unitData.offers) || {}, st = (unitData && unitData.stocks) || { fby: {}, fbs: {} };
  var skus = {};
  Object.keys(acc).forEach(function (s) { skus[s] = 1; });
  Object.keys(st.fby || {}).concat(Object.keys(st.fbs || {})).forEach(function (s) { skus[s] = 1; });
  var rows = Object.keys(skus).map(function (s) {
    var a = acc[s] || { n30: 0, n7: 0, gmv7: 0, bidgmv7: 0 }, o = offers[s] || {}, p = yopPick_(coef, s);
    var price7 = a.n7 ? a.gmv7 / a.n7 : null;
    return {
      sku: s, name: o.name || '', status: [o.fbyStatus ? 'FBY: ' + o.fbyStatus : '', o.fbsStatus ? 'FBS: ' + o.fbsStatus : '']
        .filter(String).join(', '),
      priceCab: o.price || null, price7: price7, price: price7 || o.price || 0,
      n30: a.n30, fby: (st.fby || {})[s] || 0, fbs: (st.fbs || {})[s] || 0,
      bid: a.gmv7 ? a.bidgmv7 / a.gmv7 : 0, drr: drr,
      bidNow: unitData && unitData.bids ? unitData.bids[s] || 0 : null,
      coef: p.c, src: p.src, cogs: cogs.hasOwnProperty(s) ? cogs[s] : null
    };
  });
  rows.sort(function (x, y) { return y.n30 - x.n30 || y.fby + y.fbs - x.fby - x.fbs; });
  return { rows: rows, drr: drr, shows: shows, gmv30: gmv30 };
}

/**
 * v2.1.0. Экономика выкупленной штуки той же формулой, что стоит в ячейках юнитки (для тестов и сверки).
 * over — { price, bid }: сценарий «своя цена и ставка буста»; без него — факт за 7 дней.
 */
function yopUnitCalc_(x, over) {
  var c = x.coef, P = over && over.price != null ? over.price : x.price, bid = over && over.bid != null ? over.bid : x.bid;
  var b = c.выкуп || 1, cg = x.cogs || 0;
  var m = {
    комиссия: P * c.тариф, буст: P * bid * c.буст_k / b, доставка: P * c.доставка / b, миля: c.миля,
    перевод: P * c.перевод / b, эквайринг: c.эквайринг / b, возврат: c.возврат / b, прочее: c.прочее / b
  };
  var mp = 0;
  Object.keys(m).forEach(function (k) { mp += m[k]; });
  var before = P - mp - cg, shows = P * x.drr / b, margin = before - shows, tax = margin * YOP.TAX;
  return { расходы: mp, доПоказов: before, показы: shows, маржа: margin, налог: tax, ЧП: margin - tax };
}
