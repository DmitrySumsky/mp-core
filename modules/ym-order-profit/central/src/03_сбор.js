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
 *      Последние YOP_SVC_RECHECK дней начислений перечитываются каждым прогоном и ЗАМЕНЯЮТ прочитанное
 *      раньше (v2.3.0): Маркет докладывает начисления за день ещё 1–2 дня (миля, перевод, часть комиссии).
 * Для юнитки: карточки (название, цена в кабинете, статус), остатки FBY/FBS (и FBY по складам Москвы),
 * минимум для акции и участие в акциях Маркета.
 *
 * Удержания в самих заказах (commissions[]) не используются: там только остаток сверх
 * взаимозачёта — комиссия 498 ₽ видна как 4,99 ₽.
 */

var YOP_BASE = 'https://api.partner.market.yandex.ru';
var YOP_CHUNK_DAYS = 7;
var YOP_SVC_RECHECK = 4;     // v2.3.0: столько последних дней начислений перечитывается каждым прогоном (вчера + 3 до него)

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

/**
 * Заказ Маркета → запись кэша: дата, статус, позиции
 * [артикул, шт, цена продавца, ставка буста, доставлено шт, скидка Маркета на штуку (v2.2.0)].
 * Цена продавца — сумма всех prices[]; скидка Маркета (MARKETPLACE) — то, что Маркет доплатил за покупателя:
 * цена на витрине = цена продавца − скидка Маркета, СПП = скидка ÷ цена продавца.
 */
function yopOrderRecord_(o) {
  var st = o.status || '';
  return {
    d: String(o.creationDate || '').slice(0, 10), st: st,
    it: (o.items || []).map(function (it) {
      var n = Number(it.count || 0), deliv = YOP_DELIVERED[st] ? n : 0, price = 0, spp = 0;
      (it.details || []).forEach(function (det) {
        if (YOP_DELIVERED[st] && (det.itemStatus === 'REJECTED' || det.itemStatus === 'RETURNED')) deliv -= Number(det.itemCount || 0);
      });
      (it.prices || []).forEach(function (p) {
        price += Number(p.costPerItem || 0);
        if (p.type === 'MARKETPLACE') spp += Number(p.costPerItem || 0);
      });
      return [String(it.shopSku || ''), n, Math.round(price * 100) / 100, Number(it.bidFee || 0) / 10000, Math.max(deliv, 0),
        Math.round(spp * 100) / 100];
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

/**
 * Разложить файлы отчёта услуг в кэш: удержания по заказам, тарифы, расходы дня.
 * v2.3.0: track — { день: 1 } дней, которые потом будут перечитаны; что каждый из них добавил в удержания
 * по заказам, пишется в cache.svcRecent[день], чтобы при перечитке вычесть и положить заново. lo..hi — окно
 * отчёта: строка с датой вне окна (или без даты) считается последним днём окна.
 */
function yopAddServices_(cache, files, track, lo, hi) {
  Object.keys(files).forEach(function (name) {
    files[name].forEach(function (r) {
      var day = String(r.serviceDate || r.serviceDateTime || '').slice(0, 10), rule, val;
      var dd = lo && hi ? (day >= lo && day <= hi ? day : hi) : day;
      if (YOP_ORDER_RULES[name] || (r.orderId && !YOP_DAY_RULES[name])) {
        rule = YOP_ORDER_RULES[name] || ['прочее', 'servicePrice'];
        val = rule[0] === 'буст' ? yopNum_(r.prepaid) + yopNum_(r.postpaid) + yopNum_(r.bonusPaid) : yopNum_(r[rule[1]]);
        if (rule[1] === 'servicePrice') val += yopNum_(r.netting);   // v2.1.1: servicePrice — лишь остаток сверх взаимозачёта
        if (!r.orderId || !val) return;
        var key = r.orderId + '|' + (YOP_NO_SKU[name] ? '' : (r.shopSku || ''));
        var slot = cache.svc[key] || (cache.svc[key] = {});
        var rec = track && track[dd] ? (cache.svcRecent[dd] || (cache.svcRecent[dd] = {})) : null;
        var put = function (k, v) {
          slot[k] = Math.round(((slot[k] || 0) + v) * 100) / 100;
          if (rec) { var x = rec[key] || (rec[key] = {}); x[k] = Math.round(((x[k] || 0) + v) * 100) / 100; }
        };
        put(rule[0], val);
        // v2.2.0: надбавка за просрочку отгрузки FBS лежит в той же строке размещения отдельным полем — в «прочее»
        if (name === 'placement.json' && yopNum_(r.qualityIndexAmount)) put('прочее', yopNum_(r.qualityIndexAmount));
        if (name === 'placement.json' && r.tariff != null && r.orderCreationDateTime) {
          cache.tariffs[String(r.orderCreationDateTime).slice(0, 10) + '|' + (r.shopSku || '')] = Number(r.tariff);
        }
      } else {
        if (name.indexOf('paid_storage') === 0) rule = ['хранение', 'paidStorage'];
        else rule = YOP_DAY_RULES[name] || ['прочее', 'servicePrice'];
        val = yopNum_(r[rule[1]]) || yopNum_(r.servicePrice);
        if (!dd || !val) return;
        var dc = cache.dayCost[dd] || (cache.dayCost[dd] = {});
        dc[rule[0]] = Math.round(((dc[rule[0]] || 0) + val) * 100) / 100;
      }
    });
  });
}

/**
 * v2.3.0. Какие дни начислений [lo; hi] читать: ещё не прочитанные и (с recheckFrom) перечитываемые — те,
 * у которых есть запись svcRecent (что они добавили в кэш). День, прочитанный до v2.3.0 без такой записи,
 * не перечитывается: вычесть его старый вклад нечем, иначе удержания сложились бы дважды.
 */
function yopSvcDaysToFetch_(cache, lo, hi, recheckFrom) {
  var out = [];
  for (var d = lo; d <= hi; d = yopAddDays_(d, 1)) {
    if (cache.svcDays.indexOf(d) < 0 || (recheckFrom && d >= recheckFrom && cache.svcRecent.hasOwnProperty(d))) out.push(d);
  }
  return out;
}

/** v2.3.0. Вычесть из кэша всё, что добавил день начислений `d` (перед его перечиткой), и его расходы дня. */
function yopUndoServiceDay_(cache, d) {
  var rec = cache.svcRecent[d] || {};
  Object.keys(rec).forEach(function (key) {
    var slot = cache.svc[key];
    if (!slot) return;
    Object.keys(rec[key]).forEach(function (k) {
      var v = Math.round(((slot[k] || 0) - rec[key][k]) * 100) / 100;
      if (Math.abs(v) < 0.005) delete slot[k]; else slot[k] = v;
    });
    if (!Object.keys(slot).length) delete cache.svc[key];
  });
  delete cache.svcRecent[d];
  delete cache.dayCost[d];
}

/**
 * v2.3.0. Отчёт услуг по дням `days` сплошными отрезками. Отчёт скачивается ДО того, как старое вычтено: сбой
 * Маркета не оставит дыру. Дни с trackFrom и позже записываются в svcRecent — их перечитает следующий прогон.
 */
function yopCollectServices_(cache, k, days, trackFrom) {
  var runs = [], cur = null, prev = null;
  days.forEach(function (d) {
    if (cur && d === yopAddDays_(prev, 1)) cur[1] = d; else runs.push(cur = [d, d]);
    prev = d;
  });
  runs.forEach(function (run) {
    var files = yopServicesReport_(k.apiKey, k.businessId, run[0], run[1]), track = {};
    for (var x = run[0]; x <= run[1]; x = yopAddDays_(x, 1)) {
      yopUndoServiceDay_(cache, x);
      if (trackFrom && x >= trackFrom) { track[x] = 1; cache.svcRecent[x] = {}; }
      if (cache.svcDays.indexOf(x) < 0) cache.svcDays.push(x);
    }
    yopAddServices_(cache, files, track, run[0], run[1]);
  });
  return runs.length;
}

/**
 * v2.0.0. Одно окно дат: заказы (созданные + сменившие статус) и отчёт услуг.
 * v2.3.0: recheckFrom — с какого дня перечитать уже прочитанные начисления (последний кусок прогона).
 */
function yopCollectWindow_(cache, k, d1, d2, recheckFrom) {
  k.campaigns.forEach(function (c) {
    yopOrders_(k.apiKey, c, { dateFrom: d1, dateTo: d2 }).concat(
      yopOrders_(k.apiKey, c, { updateFrom: d1, updateTo: d2 })).forEach(function (o) {
      if (!o.fake) cache.orders[String(o.id)] = yopOrderRecord_(o);
    });
  });
  var lo = recheckFrom && recheckFrom < d1 ? recheckFrom : d1;
  yopCollectServices_(cache, k, yopSvcDaysToFetch_(cache, lo, d2, recheckFrom),
    recheckFrom || yopAddDays_(d2, -YOP_SVC_RECHECK + 1));
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
  var fresh = !cache.lastDay, recheck = yopAddDays_(upto, -YOP_SVC_RECHECK + 1), rechecked = 0;
  while (day <= upto) {
    if (Date.now() - t0 > YOP_START_LIMIT_MS) break;             // остаток — в следующем шаге очереди
    var end = yopAddDays_(day, YOP_CHUNK_DAYS - 1);
    if (end > upto) end = upto;
    yopCollectWindow_(cache, k, day, end, end === upto ? recheck : null);
    yopCachePrune_(cache, upto);
    yopCacheSave_(name, cache);
    chunks++;
    day = yopAddDays_(end, 1);
  }
  // v2.3.0: вчера уже скачано (повторный 1️⃣) — всё равно перечитать свежие дни начислений
  if (!chunks && cache.lastDay >= upto && Date.now() - t0 <= YOP_START_LIMIT_MS) {
    rechecked = yopCollectServices_(cache, k, yopSvcDaysToFetch_(cache, recheck, upto, recheck), recheck);
    if (rechecked) { yopCachePrune_(cache, upto); yopCacheSave_(name, cache); }
  }
  yopLog_(name + ': ' + (fresh && chunks ? 'новый кабинет, история с ' + yopRu_(floor) + '; ' : '') +
    'кусков ' + chunks + (rechecked ? ', начисления последних дней перечитаны' : '') +
    ', скачано по ' + (cache.lastDay ? yopRu_(cache.lastDay) : '—') +
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
  var msk = null, bids = null, minPromo = null, promo = null;
  try { msk = yopMoscowWarehouses_(k); } catch (e) { yopLog_(name + ': склады Маркета не получены — ' + e.message); }
  var fby = yopStocks_(k, k.fby, msk), fbs = yopStocks_(k, k.fbs, null);
  var stocks = { fby: fby.all, fbs: fbs.all, fbyMsk: msk ? fby.msk : null };
  try { bids = yopBids_(k); } catch (e) { yopLog_(name + ': текущие ставки буста не получены — ' + e.message); }
  try { minPromo = yopMinPromo_(k); } catch (e) { yopLog_(name + ': минимум для акции не получен — ' + e.message); }
  try { promo = yopPromos_(k); } catch (e) { yopLog_(name + ': акции не получены — ' + e.message); }
  var data = { at: new Date().toISOString(), offers: offers, stocks: stocks, bids: bids, minPromo: minPromo, promo: promo };
  yopJsonSave_(yopUnitDataName_(name), data);
  yopLog_(name + ': юнитка — карточек ' + Object.keys(offers).length + ', артикулов с остатком FBY ' +
    Object.keys(stocks.fby).length + ', FBS ' + Object.keys(stocks.fbs).length + ', со ставкой буста ' +
    (bids ? Object.keys(bids).length : '—') + ', в акциях ' + (promo ? Object.keys(promo).filter(function (s) {
      return promo[s].in; }).length : '—'));
  yopCabState_(name, { unitAt: data.at, offers: Object.keys(offers).length });
  return data;
}

/**
 * Доступный остаток (AVAILABLE) по артикулам на всех складах кампании: { all, msk }.
 * v2.3.0: msk — { id склада: 1 } складов Москвы; по ним остаток считается ещё и отдельно.
 */
function yopStocks_(k, campaign, mskWh) {
  var out = {}, msk = {}, token = null, res;
  if (!campaign) return { all: out, msk: msk };
  do {
    var url = '/v2/campaigns/' + campaign + '/offers/stocks?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.warehouses || []).forEach(function (w) {
      (w.offers || []).forEach(function (o) {
        (o.stocks || []).forEach(function (s) {
          if (s.type !== 'AVAILABLE' || !s.count) return;
          var id = String(o.offerId);
          out[id] = (out[id] || 0) + Number(s.count);
          if (mskWh && mskWh[String(w.warehouseId)]) msk[id] = (msk[id] || 0) + Number(s.count);
        });
      });
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.warehouses || []).length);
  return { all: out, msk: msk };
}

/**
 * v2.3.0. Склады Маркета в Москве и области: GET /v2/warehouses (id, название, город). Москва — склады
 * Софьино («МО Софьино …») и всё с городом «Москва»; возвратные (Домодедово возвратный) не в счёт — там
 * не продаваемый остаток. Возвращает { id: 1 }.
 */
function yopMoscowWarehouses_(k) {
  var out = {};
  var ws = (JSON.parse(yopApi_(k.apiKey, 'get', '/v2/warehouses').getContentText()).result || {}).warehouses || [];
  ws.forEach(function (w) {
    var name = String(w.name || ''), city = String((w.address || {}).city || '');
    if ((/софьино/i.test(name) || /софьин/i.test(city) || city === 'Москва') && !/возврат/i.test(name)) out[String(w.id)] = 1;
  });
  return out;
}

/** v2.3.0. «Минимум для акции» по артикулам (offer-prices, price.minimumForBestseller) — цена, ниже которой товар не идёт в акции. */
function yopMinPromo_(k) {
  var out = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/offer-prices?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.offers || []).forEach(function (o) {
      var m = (o.price || {}).minimumForBestseller;
      if (m != null) out[String(o.offerId)] = Number(m);
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.offers || []).length);
  return out;
}

var YOP_PROMO_STATUS = {
  AUTO: 'участвует — добавил Маркет', PARTIALLY_AUTO: 'участвует частично — добавил Маркет', MANUAL: 'участвует — добавлен вами',
  MINIMUM_FOR_PROMOS: 'участвует по «минимуму для акции»', RENEWED: 'участвует — перенесён из прошлой акции',
  NOT_PARTICIPATING: 'не участвует', RENEW_FAILED: 'не перенесён из прошлой акции', NOT_ACTIVE: 'не активен'
};

/**
 * v2.3.0. Участие в акциях Маркета по артикулам: POST promos (список акций кабинета) → promos/offers каждой.
 * На артикул — одна запись: акция, где он участвует, иначе первая, куда его можно добавить.
 * { артикул: { promo: название, status: текст, max: макс. цена для участия, in: участвует ли } }.
 */
function yopPromos_(k) {
  var out = {};
  var promos = (JSON.parse(yopApi_(k.apiKey, 'post', '/v2/businesses/' + k.businessId + '/promos', {}).getContentText()).result || {}).promos || [];
  promos.forEach(function (p) {
    var token = null, res;
    do {
      var url = '/v2/businesses/' + k.businessId + '/promos/offers?limit=500' + (token ? '&page_token=' + encodeURIComponent(token) : '');
      res = JSON.parse(yopApi_(k.apiKey, 'post', url, { promoId: p.id }).getContentText()).result || {};
      (res.offers || []).forEach(function (o) {
        var sku = String(o.offerId), st = String(o.status || ''), isIn = st !== 'NOT_PARTICIPATING' && st !== 'RENEW_FAILED' && st !== 'NOT_ACTIVE';
        if (out[sku] && (out[sku].in || !isIn)) return;
        var dp = (o.params || {}).discountParams || {};
        out[sku] = { promo: p.name || p.id, status: YOP_PROMO_STATUS[st] || st, in: isIn,
          max: dp.maxPromoPrice != null ? Number(dp.maxPromoPrice) : (dp.promoPrice != null ? Number(dp.promoPrice) : null) };
      });
      token = (res.paging || {}).nextPageToken;
    } while (token && (res.offers || []).length);
  });
  return out;
}
/**
 * v2.1.0. Текущие ставки буста продаж по артикулам магазина (bids/info): в ответе доли процента в сотых
 * (1650 = 16,5 %), как bidFee в заказе. Артикула нет в ответе — буст по нему сейчас не включён (ставка 0).
 */
function yopBids_(k) {
  var out = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/bids/info?limit=500' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.bids || []).forEach(function (b) { out[String(b.sku)] = Number(b.bid || 0) / 10000; });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.bids || []).length);
  return out;
}
