/* WB FBS DISTRIBUTION — КЛИЕНТ WB MARKETPLACE API v1.1.0 — 26.08.2026

   ИСТОРИЯ ВЕРСИЙ
   v1.1.0 — 26.08.2026. ОБЪЕДИНЕНИЕ ДВУХ СКРИПТОВ: ОДИН КЛИЕНТ ВМЕСТО ДВУХ.
   • сюда переехали сборочные задания (fbsOrders_, fbsOrdersPeriod_) из файла
     «WB Склады FBS» v1.2.4 — раньше два файла в одном проекте держали два своих
     клиента к одному и тому же хосту, с разными ретраями и разными текстами ошибок;
   • оттуда же взят разбор 401/403: почти всегда это ключ без категории «Маркетплейс»,
     и человеку надо сказать именно это, а не «HTTP 403»;
   • сетевое исключение UrlFetchApp.fetch теперь тоже ретраится: до v1.1.0 падение
     сети на середине обхода складов роняло весь прогон.

   v1.0.0 — 25.08.2026. Читающие методы (fbsWarehouses_, fbsStocks_) безопасны.
   Пишущий ровно один — fbsPutStocks_, он вызывается только из пункта меню
   «Залить план в WB», который человек запускает руками. */

var FBSD_WB_BASE = 'https://marketplace-api.wildberries.ru';

// WB принимает до 1000 позиций в одном запросе остатков.
var FBSD_STOCKS_CHUNK = 1000;

/**
 * Запрос к WB с повторами.
 *
 * 429 и 5xx транзиентны — ретраим с нарастающей паузой. 401/403 не повторяем и
 * объясняем прямо: почти всегда это ключ, выпущенный без категории «Маркетплейс».
 * Прочие 4xx отдаём сразу — повтор их не исправит.
 */
function fbsWbCall_(method, path, body) {
  var opts = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: fbsGetToken_() },
    contentType: 'application/json'
  };
  if (body !== undefined) opts.payload = JSON.stringify(body);

  var url = FBSD_WB_BASE + path;

  for (var attempt = 0; attempt < 5; attempt++) {
    var resp;
    try {
      resp = UrlFetchApp.fetch(url, opts);
    } catch (netError) {
      // v1.1.0. Сеть отвалилась — это не ответ WB, это обрыв. Повторяем.
      if (attempt < 4) {
        Utilities.sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error('WB API: сетевая ошибка после повторов: ' + netError.message);
    }

    var code = resp.getResponseCode();
    var text = resp.getContentText();
    if (code >= 200 && code < 300) return text ? JSON.parse(text) : null;

    if (code === 401 || code === 403) throw new Error(fbsTokenError_(code, url, text));

    if ((code === 429 || code >= 500) && attempt < 4) {
      Utilities.sleep(Math.min(60000, 3000 * Math.pow(2, attempt)));
      continue;
    }

    var detail = text;
    try { var j = JSON.parse(text); detail = j.detail || j.title || text; } catch (e) {}
    throw new Error('WB ' + code + ' на ' + path + ': ' + String(detail).slice(0, 300));
  }
}

/** v1.1.0. Текст про ключ: человеку нужна причина и что нажать, а не номер кода. */
function fbsTokenError_(code, url, text) {
  return 'WB отклонил ключ (HTTP ' + code + ') на методе складов продавца.\n\n' +
    'Чаще всего у ключа в «' + FBSD_TOKEN_SHEET + '»!' + FBSD_TOKEN_CELL + ' нет категории ' +
    '«Маркетплейс» — без неё методы складов, остатков FBS и сборочных заданий недоступны.\n\n' +
    'Что сделать: в кабинете WB, Профиль → Настройки → Доступ к API, создайте НОВЫЙ токен ' +
    'и отметьте сразу три категории: Контент, Аналитика, Маркетплейс. Первые две нужны ' +
    'остальным скриптам книги, третья — этому. Галку «Только на чтение» не ставьте, ' +
    'иначе заливка остатков работать не будет. Вставьте токен в ту же ячейку ' +
    FBSD_TOKEN_CELL + ': он заменит старый для всех скриптов сразу. Старый удаляйте только ' +
    'после того, как убедитесь, что всё работает.\n\n' +
    'Адрес: ' + url + '\nОтвет: ' + String(text).slice(0, 300);
}

/** Склады продавца (виртуальные склады FBS). id — warehouseId, name — город. */
function fbsWarehouses_() {
  var list = fbsWbCall_('get', '/api/v3/warehouses') || [];
  return list
    .filter(function (w) { return !w.isDeleting; })
    .map(function (w) {
      return { id: Number(w.id) || 0, name: String(w.name || ('Склад ' + w.id)).trim() };
    })
    .filter(function (w) { return w.id; });
}

/** Остатки товаров на складе: {штрихкод: количество}. Метод читающий, несмотря на POST. */
function fbsStocks_(warehouseId, barcodes) {
  var out = {};
  for (var i = 0; i < barcodes.length; i += FBSD_STOCKS_CHUNK) {
    var chunk = barcodes.slice(i, i + FBSD_STOCKS_CHUNK);
    var r = fbsWbCall_('post', '/api/v3/stocks/' + warehouseId, { skus: chunk }) || {};
    (r.stocks || []).forEach(function (s) {
      var sku = String(s.sku || '').trim();
      if (sku) out[sku] = (out[sku] || 0) + (Number(s.amount) || 0);
    });
    if (i + FBSD_STOCKS_CHUNK < barcodes.length) Utilities.sleep(300);
  }
  return out;
}

/** ЗАПИСЬ остатков на склад. items: [{sku, amount}]. Ответ 204 без тела. */
function fbsPutStocks_(warehouseId, items) {
  for (var i = 0; i < items.length; i += FBSD_STOCKS_CHUNK) {
    var chunk = items.slice(i, i + FBSD_STOCKS_CHUNK).map(function (it) {
      return { sku: String(it.sku), amount: Math.max(0, Math.round(it.amount)) };
    });
    fbsWbCall_('put', '/api/v3/stocks/' + warehouseId, { stocks: chunk });
  }
}

/**
 * v1.1.0. Окно «последние N полных дней»: заканчивается вчера. Сегодня не берём —
 * день ещё не закрыт, и цифра всё равно поедет к вечеру.
 */
function fbsOrdersPeriod_(windowDays) {
  var days = windowDays > 0 ? windowDays : 5;
  var day = 24 * 60 * 60 * 1000;
  var now = Date.now();
  var endText = Utilities.formatDate(new Date(now - day), FBSD_TIMEZONE, 'yyyy-MM-dd');
  var startText = Utilities.formatDate(new Date(now - days * day), FBSD_TIMEZONE, 'yyyy-MM-dd');
  var from = Utilities.parseDate(startText + ' 00:00:00', FBSD_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var to = Utilities.parseDate(endText + ' 23:59:59', FBSD_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return {
    startText: startText,
    endText: endText,
    fromUnix: Math.floor(from.getTime() / 1000),
    toUnix: Math.floor(to.getTime() / 1000)
  };
}

/**
 * v1.1.0. GET /api/v3/orders — сборочные задания за период, постранично через курсор next.
 * У каждого задания есть warehouseId — это и есть склад, с которого заказ едет.
 * У WB одно задание = одна единица товара, поэтому задания считаются штуками.
 */
function fbsOrders_(period) {
  var all = [];
  var next = 0;
  var page = 0;

  while (true) {
    var path = '/api/v3/orders?limit=1000&next=' + next +
      '&dateFrom=' + period.fromUnix + '&dateTo=' + period.toUnix;
    var json = fbsWbCall_('get', path);
    if (page === 0) {
      Logger.log('/api/v3/orders, страница 1 — ответ (начало): ' + JSON.stringify(json).slice(0, 800));
    }

    var orders = json && Array.isArray(json.orders) ? json.orders : (Array.isArray(json) ? json : null);
    if (!orders) {
      throw new Error('WB вернул неожиданный формат списка сборочных заданий.\nОтвет: ' +
                      JSON.stringify(json).slice(0, 500));
    }
    if (!orders.length) break;

    all.push.apply(all, orders);

    var cursor = json && json.next;
    if (!cursor || cursor === next) break;
    next = cursor;
    page++;
    if (page > 200) break; // страховка от бесконечного цикла на кривом курсоре
    Utilities.sleep(300);
  }

  Logger.log('Сборочных заданий за период: ' + all.length);
  return all;
}

/** Право записи видно в самом токене: бит 30 маски `s` — «только на чтение». */
function fbsTokenIsReadOnly_(token) {
  try {
    var payload = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    var json = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString());
    return !!(Number(json.s) & Math.pow(2, 30));
  } catch (e) {
    return false;
  }
}
