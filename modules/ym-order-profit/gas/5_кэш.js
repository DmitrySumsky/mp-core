/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — КЭШ И НАСТРОЙКИ — см. историю версий в «1_меню.js»
 *
 * История заказов и удержаний за ~6 недель по кабинету лежит JSON-файлом «yop_cache_<кабинет>.json»
 * в папке Диска, указанной на листе «⚙️ ЧП ЯМ настройки» (B3). В ячейки таблицы она не влезла бы:
 * у одного кабинета это десятки тысяч заказов, а книга и так близко к потолку Google в 10 млн ячеек.
 */

var YOP_KEEP_DAYS = 42;     // сколько дней заказов держать: окно когорты 35 дней + запас

/** Лист настроек: B3 — папка кэша; с 6-й строки: Кабинет | Лист юнитки | Считать (да/нет). */
function yopSettings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.settings);
  if (!sh) throw new Error('нет листа «' + YOP_SH.settings + '»');
  var v = sh.getDataRange().getValues(), cabs = [];
  for (var i = 5; i < v.length; i++) {
    var name = String(v[i][0] || '').trim();
    if (name && String(v[i][2] || 'да').trim().toLowerCase() !== 'нет') {
      cabs.push({ name: name, unit: String(v[i][1] || '').trim() });
    }
  }
  return { folderId: String(v[2][1] || '').trim(), cabinets: cabs };
}

function yopCacheFolder_() {
  var id = yopSettings_().folderId;
  if (!id) throw new Error('на листе «' + YOP_SH.settings + '» не указана папка кэша (B3)');
  return DriveApp.getFolderById(id);
}

function yopCacheName_(cab) { return 'yop_cache_' + cab.replace(/\s+/g, '') + '.json'; }

function yopCacheLoad_(cab) {
  var it = yopCacheFolder_().getFilesByName(yopCacheName_(cab));
  if (!it.hasNext()) return { orders: {}, svc: {}, tariffs: {}, dayCost: {}, svcDays: [] };
  var c = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
  c.svcDays = c.svcDays || [];
  c.dayCost = c.dayCost || {};
  return c;
}

function yopCacheSave_(cab, cache) {
  var folder = yopCacheFolder_(), it = folder.getFilesByName(yopCacheName_(cab)), text = JSON.stringify(cache);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(yopCacheName_(cab), text, 'application/json');
}

/** Выбросить заказы старше окна и их удержания, старые тарифы и расходы дня. */
function yopCachePrune_(cache, upto) {
  var lo = yopAddDays_(upto, -YOP_KEEP_DAYS);
  Object.keys(cache.orders).forEach(function (oid) { if (cache.orders[oid].d < lo) delete cache.orders[oid]; });
  Object.keys(cache.svc).forEach(function (key) {
    if (!cache.orders[key.split('|')[0]]) delete cache.svc[key];
  });
  Object.keys(cache.tariffs).forEach(function (key) { if (key.slice(0, 10) < lo) delete cache.tariffs[key]; });
  Object.keys(cache.dayCost).forEach(function (d) { if (d < lo) delete cache.dayCost[d]; });
  cache.svcDays = cache.svcDays.filter(function (d) { return d >= lo; });
}
