/* СБОР ИЗ МАРКЕТА.
 *
 * Для прогноза и факта по каждому кабинету за окно дат [D1; D2] (обычно это один вчерашний день,
 * у нового кабинета — куски по 7 дней на 42 дня назад):
 *   1. заказы, СОЗДАННЫЕ в окне (stats/orders, dateFrom/dateTo): штуки, цена продавца
 *      (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе (bidFee);
 *   2. заказы, у которых в окне СМЕНИЛСЯ СТАТУС (updateFrom/updateTo): так кэш узнаёт,
 *      что заказ недельной давности доставлен или отменён;
 *   3. отчёт «Стоимость услуг» за начисления окна (united-marketplace-services): каждое удержание
 *      Маркета по номеру заказа — комиссия, буст, доставка, средняя миля, перевод денег, эквайринг,
 *      невыкупы и возвраты; без номера заказа — реклама за показы, хранение, подписка, прочее.
 * Для юнитки: карточки (название, цена в кабинете, статус) и остатки FBY/FBS.
 *
 * Удержания в самих заказах (commissions[]) не используются: там только остаток сверх
 * взаимозачёта — комиссия 498 ₽ видна как 4,99 ₽.
 */

var YOP_BASE = 'https://api.partner.market.yandex.ru';
var YOP_CHUNK_DAYS = 7;

// файл отчёта «Стоимость услуг» → [статья, поле суммы]; tools/seed_cache.py держит те же правила
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

/** Запрос к Маркету: 420/429/5xx — повтор с паузой (лимит общий у всех сервисов на ключе). */
function yopApi_(key, method, url, body) {
  var pause = 3000;
  for (var i = 0; i < 7; i++) {
    var opt = { method: method, headers: { 'Api-Key': key }, muteHttpExceptions: true };
    if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
    var r = UrlFetchApp.fetch(url.indexOf('http') === 0 ? url : YOP_BASE + url, opt), code = r.getResponseCode();
    if (code === 200) return r;
    if (code !== 420 && code !== 429 && code < 500) {
      throw new Error('Маркет ' + url.replace(YOP_BASE, '').split('?')[0] + ': HTTP ' + code + ' ' + r.getContentText().slice(0, 200));
    }
    Utilities.sleep(pause);
    pause = Math.min(pause * 2, 30000);
  }
  throw new Error('Маркет не ответил: ' + url.replace(YOP_BASE, '').split('?')[0]);
}

/** Все заказы кампании по фильтру (созданы в окне / сменили статус в окне), страница за страницей. */
function yopOrders_(key, campaign, filter) {
  var out = [], token = null, res;
  do {
    var url = '/v2/campaigns/' + campaign + '/stats/orders?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(key, 'post', url, filter).getContentText()).result || {};
    out = out.concat(res.orders || []);
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.orders || []).length);
  return out;
}

/** Заказ Маркета → запись кэша: дата, статус, позиции [артикул, шт, цена продавца, ставка буста, доставлено шт]. */
function yopOrderRecord_(o) {
  var st = o.status || '';
  return {
    d: String(o.creationDate || '').slice(0, 10), st: st,
    it: (o.items || []).map(function (it) {
      var n = Number(it.count || 0), deliv = YOP_DELIVERED[st] ? n : 0, price = 0;
      (it.details || []).forEach(function (det) {
        if (YOP_DELIVERED[st] && (det.itemStatus === 'REJECTED' || det.itemStatus === 'RETURNED')) deliv -= Number(det.itemCount || 0);
      });
      (it.prices || []).forEach(function (p) { price += Number(p.costPerItem || 0); });
      return [String(it.shopSku || ''), n, Math.round(price * 100) / 100, Number(it.bidFee || 0) / 10000, Math.max(deliv, 0)];
    })
  };
}

/** Отчёт «Стоимость услуг» за окно начислений → файлы отчёта { имя: [строки] }. */
function yopServicesReport_(key, businessId, d1, d2) {
  var gen = JSON.parse(yopApi_(key, 'post', '/v2/reports/united-marketplace-services/generate?format=JSON',
    { businessId: businessId, dateFrom: d1, dateTo: d2 }).getContentText());
  var id = gen.result.reportId;
  for (var i = 0; i < 45; i++) {
    Utilities.sleep(4000);
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
    if (info.status === 'FAILED') throw new Error('отчёт «Стоимость услуг» за ' + d1 + '–' + d2 + ' не собрался у Маркета');
  }
  throw new Error('отчёт «Стоимость услуг» за ' + d1 + '–' + d2 + ' не дождались за 3 минуты');
}

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

/** v2.0.0. Одно окно дат: заказы (созданные + сменившие статус) и отчёт услуг. */
function yopCollectWindow_(cache, k, d1, d2) {
  k.campaigns.forEach(function (c) {
    yopOrders_(k.apiKey, c, { dateFrom: d1, dateTo: d2 }).concat(
      yopOrders_(k.apiKey, c, { updateFrom: d1, updateTo: d2 })).forEach(function (o) {
      if (!o.fake) cache.orders[String(o.id)] = yopOrderRecord_(o);
    });
  });
  var runs = [], cur = null;                                     // дни без отчёта услуг — сплошными отрезками,
  for (var d = d1; d <= d2; d = yopAddDays_(d, 1)) {             // уже учтённый день второй раз не складывается
    if (cache.svcDays.indexOf(d) >= 0) { cur = null; continue; }
    if (!cur) runs.push(cur = [d, d]); else cur[1] = d;
  }
  runs.forEach(function (run) {
    yopAddServices_(cache, yopServicesReport_(k.apiKey, k.businessId, run[0], run[1]));
    for (var x = run[0]; x <= run[1]; x = yopAddDays_(x, 1)) cache.svcDays.push(x);
  });
  cache.lastDay = d2;
}

/**
 * v2.0.0. Докачать кабинет по день `upto` включительно — все дни после последнего скачанного.
 * Нового кабинета нет в кэше: история за 42 дня докачивается кусками по 7 дней. Кусок начинается,
 * только если до лимита исполнения хватает времени. Возвращает true, когда кабинет догнан.
 */
function yopCollectCabinet_(name, k, upto, t0) {
  if (!k) throw new Error('нет строки на листе «' + YOP_SH.keys + '»');
  if (!k.campaigns.length) throw new Error('на листе «' + YOP_SH.keys + '» нет ни одной кампании (FBS/FBY)');
  var cache = yopCacheLoad_(name), floor = yopAddDays_(upto, -YOP_KEEP_DAYS + 1);
  var day = cache.lastDay ? yopAddDays_(cache.lastDay, 1) : floor, chunks = 0;
  if (day < floor) day = floor;                                  // долгий простой — не глубже окна кэша
  var fresh = !cache.lastDay;
  while (day <= upto) {
    if (Date.now() - t0 > YOP_START_LIMIT_MS) break;             // остаток — в следующем шаге очереди
    var end = yopAddDays_(day, YOP_CHUNK_DAYS - 1);
    if (end > upto) end = upto;
    yopCollectWindow_(cache, k, day, end);
    yopCachePrune_(cache, upto);
    yopCacheSave_(name, cache);
    chunks++;
    day = yopAddDays_(end, 1);
  }
  yopLog_(name + ': ' + (fresh && chunks ? 'новый кабинет, история с ' + yopRu_(floor) + '; ' : '') +
    'кусков ' + chunks + ', скачано по ' + (cache.lastDay ? yopRu_(cache.lastDay) : '—') +
    ', заказов в кэше ' + Object.keys(cache.orders).length);
  yopCabState_(name, { lastDay: cache.lastDay || '', orders: Object.keys(cache.orders).length });
  return !!cache.lastDay && cache.lastDay >= upto;
}

/**
 * v2.0.0. Данные юнитки кабинета: карточки (название, цена в кабинете, статусы по кампаниям) и
 * доступные остатки на складах FBY и FBS. Кладутся файлом в папку кэша, лист собирается в конце.
 */
function yopCollectUnitData_(name, k) {
  var offers = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/offer-mappings?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, { archived: false }).getContentText()).result || {};
    (res.offerMappings || []).forEach(function (m) {
      var o = m.offer || {}, st = {};
      (o.campaigns || []).forEach(function (c) { st[String(c.campaignId)] = c.status; });
      offers[String(o.offerId)] = {
        name: o.name || '', price: (o.basicPrice || {}).value || null,
        fbyStatus: k.fby ? st[String(k.fby)] || '' : '', fbsStatus: k.fbs ? st[String(k.fbs)] || '' : ''
      };
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.offerMappings || []).length);
  var stocks = { fby: yopStocks_(k, k.fby), fbs: yopStocks_(k, k.fbs) };
  var data = { at: new Date().toISOString(), offers: offers, stocks: stocks };
  yopJsonSave_(yopUnitDataName_(name), data);
  yopLog_(name + ': юнитка — карточек ' + Object.keys(offers).length + ', артикулов с остатком FBY ' +
    Object.keys(stocks.fby).length + ', FBS ' + Object.keys(stocks.fbs).length);
  yopCabState_(name, { unitAt: data.at, offers: Object.keys(offers).length });
  return data;
}

/** Доступный остаток (AVAILABLE) по артикулам на всех складах кампании. */
function yopStocks_(k, campaign) {
  var out = {}, token = null, res;
  if (!campaign) return out;
  do {
    var url = '/v2/campaigns/' + campaign + '/offers/stocks?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.warehouses || []).forEach(function (w) {
      (w.offers || []).forEach(function (o) {
        (o.stocks || []).forEach(function (s) {
          if (s.type === 'AVAILABLE' && s.count) out[String(o.offerId)] = (out[String(o.offerId)] || 0) + Number(s.count);
        });
      });
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.warehouses || []).length);
  return out;
}