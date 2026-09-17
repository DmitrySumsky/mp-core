/* Публичная выдача WB (органика, без рекламы): хосты и версии перебираются с памятью. */

var POS_SEARCH_HOSTS = ['search.wb.ru', 'u-search.wb.ru'];
var POS_SEARCH_VERSIONS = ['v12', 'v11', 'v10', 'v9', 'v5', 'v4'];   // v13+ отдают только metadata без товаров
var POS_SEARCH_PAUSE_MS = 400;
var POS_SEARCH_MAX_TRIES = 6;

/* Кто ответил последним — тот и первый в следующем запросе. Живёт одно исполнение. */
var POS_SEARCH_ORDER = null;
var POS_SEARCH_STATS = { requests: 0, failures: 0, skipped: 0 };
/* v1.0.1. Отказы подряд по хосту. Хост, отказавший POS_SEARCH_DEAD_AFTER раз подряд, до конца исполнения
   пропускается: иначе каждый сбой живого хоста оплачивается ещё и запросом в заведомо закрытый. */
var POS_SEARCH_FAILS = {};
var POS_SEARCH_DEAD_AFTER = 3;

function posSearchOrder_() {
  if (POS_SEARCH_ORDER) return POS_SEARCH_ORDER;
  var order = [];
  for (var v = 0; v < POS_SEARCH_VERSIONS.length; v++) {
    for (var h = 0; h < POS_SEARCH_HOSTS.length; h++) {
      order.push({ host: POS_SEARCH_HOSTS[h], ver: POS_SEARCH_VERSIONS[v] });
    }
  }
  POS_SEARCH_ORDER = order;
  return order;
}

function posSearchUrl_(host, ver, query, page, dest) {
  return 'https://' + host + '/exactmatch/ru/common/' + ver + '/search?query=' + encodeURIComponent(query) +
    '&resultset=catalog&curr=rub&spp=30&ab_testing=false&suppressSpellcheck=false&page=' + page +
    '&dest=' + dest + '&appType=1&sort=popular&lang=ru';
}

/**
 * Одна страница выдачи. {products, type} | null — страницу честно получить не удалось.
 * 200 без ключа products — чужой закэшированный конверт: это не «конец выдачи», а отказ.
 */
function posSearchPage_(query, page, dest) {
  var order = posSearchOrder_();
  var wait = 500, tries = 0;
  // «Мёртвые» хосты фиксируются НА НАЧАЛО вызова: живой хост, отказавший трижды внутри одного вызова,
  // не должен выпасть из перебора посреди страницы. Закрыты все — счётчики сбрасываются: лимитер мог отпустить.
  var dead = {}, alive = 0;
  for (var a = 0; a < POS_SEARCH_HOSTS.length; a++) {
    if ((POS_SEARCH_FAILS[POS_SEARCH_HOSTS[a]] || 0) >= POS_SEARCH_DEAD_AFTER) dead[POS_SEARCH_HOSTS[a]] = true; else alive++;
  }
  if (!alive) { dead = {}; POS_SEARCH_FAILS = {}; }
  for (var i = 0; i < order.length && tries < POS_SEARCH_MAX_TRIES; i++) {
    var o = order[i];
    if (dead[o.host]) { POS_SEARCH_STATS.skipped++; continue; }
    tries++;
    POS_SEARCH_STATS.requests++;
    var code = 0, j = null;
    try {
      var resp = UrlFetchApp.fetch(posSearchUrl_(o.host, o.ver, query, page, dest), {
        muteHttpExceptions: true,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      code = resp.getResponseCode();
      if (code === 200) j = JSON.parse(resp.getContentText() || '{}');
    } catch (e) { j = null; }
    if (code === 200 && j && j.products) {
      if (i > 0) { order.splice(i, 1); order.unshift(o); }      // ответивший — вперёд
      POS_SEARCH_FAILS[o.host] = 0;
      return { products: j.products, type: (j.metadata && j.metadata.catalog_type) || '' };
    }
    POS_SEARCH_STATS.failures++;
    POS_SEARCH_FAILS[o.host] = (POS_SEARCH_FAILS[o.host] || 0) + 1;
    Utilities.sleep(wait);
    wait = Math.min(wait * 2, 4000);
  }
  return null;
}

/**
 * Места карточек nmIds по запросу. {found: {nm: место}, complete, type}.
 * Останов: все найдены, страница без новых id (потолок выдачи), пустая страница.
 */
function posLocate_(query, nmIds, depth, dest) {
  var want = {};
  for (var i = 0; i < nmIds.length; i++) want[Number(nmIds[i])] = true;
  var found = {}, seen = {}, left = nmIds.length, type = '';
  for (var page = 1; page <= depth; page++) {
    var res = posSearchPage_(query, page, dest);
    if (!res) return { found: found, complete: false, type: type };
    type = res.type || type;
    var fresh = 0;
    for (var k = 0; k < res.products.length; k++) {
      var id = Number(res.products[k].id);
      if (!seen[id]) { seen[id] = true; fresh++; }
      if (want[id] && !found[id]) {
        found[id] = (page - 1) * POS_PAGE_SIZE + k + 1;
        left--;
      }
    }
    if (left <= 0 || !res.products.length || !fresh) break;
    Utilities.sleep(POS_SEARCH_PAUSE_MS);
  }
  return { found: found, complete: true, type: type };
}
