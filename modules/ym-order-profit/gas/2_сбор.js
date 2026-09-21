/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — СБОР ИЗ МАРКЕТА — см. историю версий в «1_меню.js»
 *
 * Что берётся из Маркета по каждому кабинету за день D:
 *   1. заказы, СОЗДАННЫЕ в D (stats/orders, dateFrom = dateTo = D): штуки, цена продавца
 *      (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе (bidFee);
 *   2. заказы, у которых в D СМЕНИЛСЯ СТАТУС (updateFrom = updateTo = D): так кэш узнаёт,
 *      что заказ недельной давности доставлен или отменён;
 *   3. отчёт «Стоимость услуг» за начисления D (united-marketplace-services): каждое удержание
 *      Маркета по номеру заказа — комиссия, буст, доставка, средняя миля, перевод денег, эквайринг,
 *      невыкупы и возвраты; без номера заказа — реклама за показы, хранение, подписка, прочее.
 *
 * Удержания в самих заказах (commissions[]) не используются: там только остаток сверх
 * взаимозачёта — комиссия 498 ₽ видна как 4,99 ₽.
 */

var YOP_BASE = 'https://api.partner.market.yandex.ru';

// файл отчёта «Стоимость услуг» → [статья, поле суммы]; SEED — tools/seed_cache.py держит те же правила
var YOP_ORDER_RULES = {
  'placement.json': ['комиссия', 'amountWithoutBonuses'],
  'boost.json': ['буст', null],                                   // prepaid + postpaid + bonusPaid
  'delivery.json': ['доставка', 'servicePrice'],
  'crossregional_delivery.json': ['миля', 'servicePrice'],
  'payment_transfer.json': ['перевод', 'servicePrice'],
  'payment_accepting.json': ['эквайринг', 'servicePrice'],
  'order_processing.json': ['возврат', 'servicePrice'],
  'order_processing_on_warehouse.json': ['возврат', 'servicePrice'],
  'storage_of_returns.json': ['возврат', 'servicePrice']
};
var YOP_DAY_RULES = {
  'cpm-boost.json': ['показы', 'payment'],
  'shelf.json': ['показы', 'payment'],
  'product-banners.json': ['показы', 'payment'],
  'business_subscription.json': ['подписка', 'servicePrice']
};
var YOP_NO_SKU = { 'order_processing.json': 1, 'order_processing_on_warehouse.json': 1, 'storage_of_returns.json': 1 };
var YOP_DELIVERED = { DELIVERED: 1, PARTIALLY_DELIVERED: 1 };

/** Ключи с листа «API-ключи»: Кабинет | API-ключ | Business ID | Campaign FBS | Campaign FBY. */
function yopKeys_() {
  var rows = SpreadsheetApp.getActive().getSheetByName('API-ключи').getDataRange().getValues(), out = {};
  rows.slice(1).forEach(function (r) {
    if (!r[0] || !r[1] || !r[2]) return;
    out[String(r[0]).trim()] = {
      apiKey: String(r[1]).trim(), businessId: Number(r[2]),
      campaigns: [r[3], r[4]].filter(function (x) { return String(x).trim(); }).map(Number)
    };
  });
  return out;
}

/** Запрос к Маркету: 420/429/5xx — повтор с паузой (лимит общий у всех сервисов на ключе). */
function yopApi_(key, method, url, body) {
  var pause = 3000;
  for (var i = 0; i < 7; i++) {
    var opt = { method: method, headers: { 'Api-Key': key }, muteHttpExceptions: true };
    if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
    var r = UrlFetchApp.fetch(url.indexOf('http') === 0 ? url : YOP_BASE + url, opt), code = r.getResponseCode();
    if (code === 200) return r;
    if (code !== 420 && code !== 429 && code < 500) {
      throw new Error('Маркет ' + url.replace(YOP_BASE, '') + ': HTTP ' + code + ' ' + r.getContentText().slice(0, 200));
    }
    Utilities.sleep(pause);
    pause = Math.min(pause * 2, 30000);
  }
  throw new Error('Маркет не ответил: ' + url.replace(YOP_BASE, ''));
}

/** Все заказы кампании по фильтру (создан в день / сменил статус в день), страница за страницей. */
function yopOrders_(key, campaign, filter) {
  var out = [], token = null;
  do {
    var url = '/v2/campaigns/' + campaign + '/stats/orders?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    var res = JSON.parse(yopApi_(key, 'post', url, filter).getContentText()).result || {};
    out = out.concat(res.orders || []);
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.orders || []).length);
  return out;
}

/** Заказ Маркета → запись кэша: дата, статус, позиции [артикул, шт, цена продавца, ставка буста, доставлено шт]. */
function yopOrderRecord_(o) {
  var st = o.status || '';
  return {
    d: o.creationDate, st: st,
    it: (o.items || []).map(function (it) {
      var n = Number(it.count || 0), deliv = YOP_DELIVERED[st] ? n : 0, price = 0;
      (it.details || []).forEach(function (det) {
        if (YOP_DELIVERED[st] && (det.itemStatus === 'REJECTED' || det.itemStatus === 'RETURNED')) deliv -= Number(det.itemCount || 0);
      });
      (it.prices || []).forEach(function (p) { price += Number(p.costPerItem || 0); });
      return [it.shopSku || '', n, Math.round(price * 100) / 100, Number(it.bidFee || 0) / 10000, Math.max(deliv, 0)];
    })
  };
}

/** Отчёт «Стоимость услуг» за день начислений → файлы отчёта { имя: [строки] }. */
function yopServicesReport_(key, businessId, day) {
  var gen = JSON.parse(yopApi_(key, 'post', '/v2/reports/united-marketplace-services/generate?format=JSON',
    { businessId: businessId, dateFrom: day, dateTo: day }).getContentText());
  var id = gen.result.reportId;
  for (var i = 0; i < 40; i++) {
    Utilities.sleep(5000);
    var info = JSON.parse(yopApi_(key, 'get', '/v2/reports/info/' + id).getContentText()).result;
    if (info.status === 'DONE') {
      var files = {};
      if (!info.file) return files;
      Utilities.unzip(yopApi_(key, 'get', info.file).getBlob()).forEach(function (b) {
        var p = JSON.parse(b.getDataAsString('UTF-8'));
        files[b.getName()] = Array.isArray(p) ? p : (p.rows || []);
      });
      return files;
    }
    if (info.status === 'FAILED') throw new Error('отчёт «Стоимость услуг» за ' + day + ' не собрался у Маркета');
  }
  throw new Error('отчёт «Стоимость услуг» за ' + day + ' не дождались');
}

function yopNum_(v) { return typeof v === 'number' ? v : 0; }

/** Разложить файлы отчёта услуг в кэш: удержания по заказам, тарифы, расходы дня. */
function yopAddServices_(cache, files) {
  Object.keys(files).forEach(function (name) {
    files[name].forEach(function (r) {
      var day = String(r.serviceDate || r.serviceDateTime || '').slice(0, 10), rule, val;
      if (YOP_ORDER_RULES[name] || (r.orderId && !YOP_DAY_RULES[name])) {
        rule = YOP_ORDER_RULES[name] || ['прочее', 'servicePrice'];
        val = rule[0] === 'буст' ? yopNum_(r.prepaid) + yopNum_(r.postpaid) + yopNum_(r.bonusPaid) : yopNum_(r[rule[1]]);
        if (!r.orderId || !val) return;
        var key = r.orderId + '|' + (YOP_NO_SKU[name] ? '' : (r.shopSku || ''));
        var slot = cache.svc[key] || (cache.svc[key] = {});
        slot[rule[0]] = Math.round(((slot[rule[0]] || 0) + val) * 100) / 100;
        if (name === 'placement.json' && r.tariff != null && r.orderCreationDateTime) {
          cache.tariffs[String(r.orderCreationDateTime).slice(0, 10) + '|' + (r.shopSku || '')] = Number(r.tariff);
        }
      } else {
        if (name.indexOf('paid_storage') === 0) rule = ['хранение', 'paidStorage'];
        else rule = YOP_DAY_RULES[name] || ['прочее', 'servicePrice'];
        val = yopNum_(r[rule[1]]) || yopNum_(r.servicePrice);
        if (!day || !val) return;
        var dc = cache.dayCost[day] || (cache.dayCost[day] = {});
        dc[rule[0]] = Math.round(((dc[rule[0]] || 0) + val) * 100) / 100;
      }
    });
  });
}

/** Докачать кабинет по день `upto` включительно: все дни после последнего скачанного.
 *  Возвращает false, если время вышло раньше — очередь продолжит этот кабинет следующим шагом. */
function yopCollectCabinet_(name, k, upto, settings, t0) {
  if (!k) throw new Error('нет строки на листе «API-ключи»');
  var cache = yopCacheLoad_(name);
  var last = cache.lastDay || yopAddDays_(upto, -1), day = yopAddDays_(last, 1), done = 0;
  while (day <= upto) {
    k.campaigns.forEach(function (c) {
      yopOrders_(k.apiKey, c, { dateFrom: day, dateTo: day }).concat(
        yopOrders_(k.apiKey, c, { updateFrom: day, updateTo: day })).forEach(function (o) {
        if (!o.fake) cache.orders[String(o.id)] = yopOrderRecord_(o);
      });
    });
    if (cache.svcDays.indexOf(day) < 0) {
      yopAddServices_(cache, yopServicesReport_(k.apiKey, k.businessId, day));
      cache.svcDays.push(day);
    }
    cache.lastDay = day;
    done++;
    day = yopAddDays_(day, 1);
    if (Date.now() - t0 > YOP_TIME_LIMIT_MS) break;       // остаток дней — в следующем шаге очереди
  }
  yopCachePrune_(cache, upto);
  yopCacheSave_(name, cache);
  yopLog_(name + ': дней докачано ' + done + ', последний ' + cache.lastDay + ', заказов в кэше ' + Object.keys(cache.orders).length);
  return cache.lastDay >= upto;
}
