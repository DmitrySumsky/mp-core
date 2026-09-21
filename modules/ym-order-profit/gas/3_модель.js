/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — МОДЕЛЬ — см. историю версий в «1_меню.js»
 *
 * Здесь вся логика расчёта: из каких заказов берутся коэффициенты и как из них получается
 * прибыль заказов дня. Файл не ходит ни в Маркет, ни в таблицу — только считает.
 *
 * Кэш кабинета (его собирает «2_сбор.js», хранит «5_кэш.js»):
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
  TAX: 0.25                        // налог, как в юнитке: минус 25 % от маржи
};
var YOP_ORDER_COSTS = ['комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее'];
var YOP_COSTS = YOP_ORDER_COSTS.concat(['себес']);
var YOP_DAY_COSTS = ['показы', 'хранение', 'подписка', 'прочее'];
var YOP_TRANSIT = { PROCESSING: 1, DELIVERY: 1, PICKUP: 1, RESERVED: 1, UNPAID: 1, PENDING: 1 };

function yopAddDays_(iso, k) {
  var d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

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
function yopCoefficients_(cache, flat, day) {
  var agg = yopAgg_(cache, flat, yopAddDays_(day, -YOP.COHORT_FROM), yopAddDays_(day, -YOP.COHORT_TO));
  var mile = yopAgg_(cache, flat, yopAddDays_(day, -YOP.MILE_FROM), yopAddDays_(day, -YOP.MILE_TO));
  var tr = yopTariffs_(cache, day), out = {};
  Object.keys(agg).forEach(function (key) {
    var a = agg[key], m = mile[key];
    if (!m || m.deliv < YOP.MIN_UNITS) m = mile['*'] || {};
    var known = Math.max(a.n - a.transit, 1), g = a.gmv || 1;
    var t = key === '*' ? tr.cab : (tr.sku[key] != null ? tr.sku[key] : tr.cab);
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
  if (!out['*']) out['*'] = { когорта_шт: 0, когорта_доставлено: 0, выкуп: 0.85, тариф: tr.cab / 100, буст_k: 1,
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

/** Заказы дня по артикулам с прогнозом. cogs — { артикул: себес } из юнитки. */
function yopForecast_(cache, day, cogs, flat) {
  flat = flat || yopItems_(cache);
  var coef = yopCoefficients_(cache, flat, day), acc = {};
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

if (typeof module !== 'undefined') {
  module.exports = { YOP: YOP, yopForecast_: yopForecast_, yopItems_: yopItems_, yopAddDays_: yopAddDays_ };
}
