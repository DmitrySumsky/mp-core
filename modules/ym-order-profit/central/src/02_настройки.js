/* НАСТРОЙКИ, КЛЮЧИ, СЕБЕСТОИМОСТЬ, КЭШ НА ДИСКЕ.
 *
 * Лист «⚙️ ЧП ЯМ настройки»: B3 — папка кэша на Диске; ниже таблица кабинетов с шапкой
 *   Кабинет | Лист юнитки (себес) | Считать (да/нет) | Тариф комиссии вручную, % | с даты заказа | Комментарий
 * Колонки ищутся по заголовку. Кабинет должен называться так же, как на листе «API-ключи».
 *
 * История заказов и удержаний за ~6 недель по кабинету лежит JSON-файлом «yop_cache_<кабинет>.json»
 * в папке кэша. В ячейки таблицы она не влезла бы: у одного кабинета это десятки тысяч заказов,
 * а книга и так близко к потолку Google в 10 млн ячеек.
 */

var YOP_KEEP_DAYS = 42;     // сколько дней заказов держать: окно когорты 35 дней + запас
var YOP_SETTINGS_HEAD = ['Кабинет', 'Лист юнитки (себес)', 'Считать (да/нет)', 'Тариф комиссии вручную, %',
  'с даты заказа', 'Комментарий'];
var YOP_COGS_HEAD = ['Кабинет', 'Артикул магазина', 'Себестоимость, ₽', 'Комментарий'];

/** Лист настроек → { folderId, cabinets: [включённые], all: [все строки] }. */
function yopSettings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.settings);
  if (!sh) throw new Error('нет листа «' + YOP_SH.settings + '» — нажмите «⚙️ Обновить настройки таблицы»');
  var v = sh.getDataRange().getValues(), hr = -1;
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === 'Кабинет') { hr = i; break; }
  if (hr < 0) throw new Error('на листе «' + YOP_SH.settings + '» нет строки с заголовком «Кабинет»');
  var h = v[hr].map(function (x) { return String(x).trim().toLowerCase(); });
  var col = function (prefix) {
    for (var j = 0; j < h.length; j++) if (h[j].indexOf(prefix) === 0) return j;
    return -1;
  };
  var cU = col('лист юнитки'), cOn = col('считать'), cT = col('тариф'), cF = col('с даты');
  var all = [];
  for (var r = hr + 1; r < v.length; r++) {
    var name = String(v[r][0] || '').trim();
    if (!name) continue;
    var t = cT >= 0 ? v[r][cT] : '', tNum = typeof t === 'number' ? t : parseFloat(String(t).replace(',', '.'));
    if (isFinite(tNum) && tNum > 0 && tNum < 1) tNum = tNum * 100;       // ячейка в формате процента: 0,49
    all.push({
      name: name,
      unit: cU >= 0 ? String(v[r][cU] || '').trim() : '',
      on: cOn < 0 || String(v[r][cOn] || 'да').trim().toLowerCase() !== 'нет',
      tariff: isFinite(tNum) && tNum > 0 ? tNum : null,
      tariffFrom: cF >= 0 ? yopIso_(v[r][cF]) : '',
      row: r + 1
    });
  }
  var folder = '';
  for (var k = 0; k < hr; k++) if (String(v[k][0]).indexOf('Папка кэша') === 0) folder = String(v[k][1] || '').trim();
  return { folderId: folder, cabinets: all.filter(function (c) { return c.on; }), all: all };
}

/** Ключи с листа «API-ключи»: Кабинет | API-ключ | Business ID | Campaign FBS | Campaign FBY. */
function yopKeys_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.keys), out = {};
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[0] || !r[1] || !r[2]) return;
    var fbs = String(r[3] || '').trim(), fby = String(r[4] || '').trim();
    out[String(r[0]).trim()] = {
      apiKey: String(r[1]).trim(), businessId: Number(r[2]),
      fbs: fbs ? Number(fbs) : null, fby: fby ? Number(fby) : null,
      campaigns: [fbs, fby].filter(String).map(Number)
    };
  });
  return out;
}

/** Колонки «Код 1С» и «себес» юнитки кабинета (заголовки в первой строке). */
function yopUnitCols_(unitName) {
  var sh = unitName ? SpreadsheetApp.getActive().getSheetByName(unitName) : null;
  if (!sh) return null;
  var v = sh.getDataRange().getValues(), h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var kc = h.indexOf('код 1с'), cc = h.indexOf('себес');
  if (kc < 0 || cc < 0 || cc < kc) return null;
  return { name: unitName, kc: kc, cc: cc, values: v };
}

/**
 * v2.0.0. Себестоимость кабинета: { артикул: { v: ₽, src: 'вручную' | 'юнитка' } } + данные для формул.
 * Лист «себес вручную» главнее юнитки: его заполняют ровно там, где юнитки нет или коды не совпадают.
 */
function yopCogs_(cab) {
  var map = {}, unit = yopUnitCols_(cab.unit);
  if (unit) {
    unit.values.slice(1).forEach(function (r) {
      var k = String(r[unit.kc]).trim();
      if (k && typeof r[unit.cc] === 'number') map[k] = { v: r[unit.cc], src: 'юнитка' };
    });
  }
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.cogs);
  if (sh) {
    sh.getDataRange().getValues().slice(YOP_HEAD_ROW).forEach(function (r) {
      var sku = String(r[1] == null ? '' : r[1]).trim(), v = r[2];
      if (typeof v !== 'number') v = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
      if (String(r[0]).trim() === cab.name && sku && isFinite(v)) map[sku] = { v: v, src: 'вручную' };
    });
  }
  var norm = {};
  Object.keys(map).forEach(function (k) { norm[yopSkuNorm_(k)] = map[k]; });
  return { map: map, norm: norm, unit: unit ? { name: unit.name, kc: unit.kc, cc: unit.cc } : null };
}

/**
 * v2.2.0. Артикул для сверки с юниткой: без регистра и без хвостовых пробелов и знаков препинания. В кабинетах
 * «ABC …» против «abc …» в юнитке, «X-z120» против «X-Z120», в Маркете бывает артикул с запятой на конце —
 * себес не находился, хотя в юнитке он есть. Формула листа (VLOOKUP) регистр и так не различает.
 */
function yopSkuNorm_(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/[\s,.;]+$/, '');
}

/** Запись себеса артикула: точное совпадение, иначе — по нормализованному артикулу. */
function yopCogsEntry_(cogs, sku) {
  return cogs.map[sku] || (cogs.norm && cogs.norm[yopSkuNorm_(sku)]) || null;
}

/** { артикул: ₽ } — для модели; нормализованные артикулы — с префиксом «≈» (их читает yopCogsOf_). */
function yopCogsValues_(cogs) {
  var out = {};
  Object.keys(cogs.map).forEach(function (k) { out[k] = cogs.map[k].v; });
  Object.keys(cogs.norm || {}).forEach(function (k) { out['≈' + k] = cogs.norm[k].v; });
  return out;
}

/** v2.2.0. Себес артикула из yopCogsValues_: точно, иначе по нормализованному артикулу; нет — null. */
function yopCogsOf_(values, sku) {
  if (values.hasOwnProperty(sku)) return values[sku];
  var n = '≈' + yopSkuNorm_(sku);
  return values.hasOwnProperty(n) ? values[n] : null;
}

/**
 * Формула себестоимости строки листа: сначала «себес вручную» по (кабинет, артикул), потом юнитка
 * по «Код 1С». Поменяли себес в юнитке или на ручном листе — лист пересчитается сам.
 */
function yopCogsFormula_(cogs, cabCell, skuCell) {
  var m = "'" + YOP_SH.cogs + "'!";
  var manual = 'COUNTIFS(' + m + '$A:$A,' + cabCell + ',' + m + '$B:$B,' + skuCell + ')>0';
  var fromManual = 'SUMIFS(' + m + '$C:$C,' + m + '$A:$A,' + cabCell + ',' + m + '$B:$B,' + skuCell + ')';
  var fromUnit = '0';
  if (cogs.unit) {
    // v2.2.0: артикул без хвостовых пробелов и знаков («…90 caps,» в Маркете); регистр VLOOKUP не различает
    fromUnit = 'IFERROR(VLOOKUP(REGEXREPLACE(TRIM(' + skuCell + '&""),"[\\s,.;]+$",""),\'' + cogs.unit.name + "'!$" + yopCol_(cogs.unit.kc + 1) + ':$' +
      yopCol_(cogs.unit.cc + 1) + ',' + (cogs.unit.cc - cogs.unit.kc + 1) + ',FALSE),0)';
  }
  return '=IF(' + manual + ',' + fromManual + ',' + fromUnit + ')';
}

function yopCacheFolder_() {
  var id = yopSettings_().folderId;
  if (!id) throw new Error('на листе «' + YOP_SH.settings + '» не указана папка кэша (B3)');
  return DriveApp.getFolderById(id);
}

function yopCacheName_(cab) { return 'yop_cache_' + cab.replace(/\s+/g, '') + '.json'; }
function yopUnitDataName_(cab) { return 'yop_unit_' + cab.replace(/\s+/g, '') + '.json'; }

function yopEmptyCache_() { return { orders: {}, svc: {}, tariffs: {}, dayCost: {}, svcDays: [] }; }

function yopJsonLoad_(fileName) {
  var it = yopCacheFolder_().getFilesByName(fileName);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}

function yopJsonSave_(fileName, obj) {
  var folder = yopCacheFolder_(), it = folder.getFilesByName(fileName), text = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(fileName, text, 'application/json');
}

function yopCacheLoad_(cab) {
  var c = yopJsonLoad_(yopCacheName_(cab)) || yopEmptyCache_();
  c.svcDays = c.svcDays || [];
  c.dayCost = c.dayCost || {};
  c.tariffs = c.tariffs || {};
  c.svc = c.svc || {};
  c.orders = c.orders || {};
  return c;
}

function yopCacheSave_(cab, cache) { yopJsonSave_(yopCacheName_(cab), cache); }

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
/** v2.0.0. Состояние кабинета для «📊 Что сейчас происходит» (без чтения многомегабайтного кэша). */
function yopCabState_(name, patch) {
  var p = yopProps_(), all = JSON.parse(p.getProperty('YOP_CAB_STATE') || '{}'), cur = all[name] || {};
  Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
  all[name] = cur;
  p.setProperty('YOP_CAB_STATE', JSON.stringify(all));
}
