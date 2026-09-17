/* Отчёт WB «Поисковые запросы по вашим товарам» (нужна подписка Джем) и публичная карточка. */

var POS_JAM_URL = 'https://seller-analytics-api.wildberries.ru/api/v2/search-report/product/search-texts';
var POS_JAM_PING = 'https://seller-analytics-api.wildberries.ru/ping';
var POS_JAM_GAP_MS = 21000;          // 3 запроса в минуту на кабинет
var POS_JAM_MAX_WAIT_S = 60;         // дольше в исполнении не ждём — переносим этап триггером
var POS_JAM_CHUNK = 50;              // столько артикулов принимает один запрос
var POS_CARD_HOSTS = ['card.wb.ru', 'u-card.wb.ru'];

function posHeader_(headers, name) {
  var want = String(name).toLowerCase();
  for (var k in headers) if (String(k).toLowerCase() === want) return headers[k];
  return null;
}

/**
 * Один вызов отчёта. Возвращает {ok, items} | {ok:false, waitS, error}.
 * 429: WB сам говорит, сколько ждать (бывает и 700 с) — короткое ожидание выдерживаем здесь,
 * длинное отдаём наверх: этап переносится триггером, а не спит до лимита исполнения.
 */
function posJamCall_(cfg, nmIds, startIso, endIso) {
  var body = {
    currentPeriod: { start: startIso, end: endIso },
    nmIds: nmIds,
    topOrderBy: 'orders',
    includeSubstitutedSKUs: false,
    includeSearchTexts: true,
    orderBy: { field: 'orders', mode: 'desc' },
    limit: cfg.limit
  };
  for (var attempt = 0; attempt < 2; attempt++) {
    var resp = UrlFetchApp.fetch(POS_JAM_URL, {
      method: 'post', contentType: 'application/json',
      headers: { 'Authorization': cfg.token },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var text = String(resp.getContentText() || '');
    if (code === 200) {
      var j = {};
      try { j = JSON.parse(text); } catch (e) { return { ok: false, error: 'WB вернул не JSON: ' + text.slice(0, 120) }; }
      return { ok: true, items: (j.data && j.data.items) || [] };
    }
    if (code === 429) {
      var retry = Number(posHeader_(resp.getHeaders() || {}, 'X-Ratelimit-Retry')) || 60;
      if (retry > POS_JAM_MAX_WAIT_S || attempt === 1) {
        return { ok: false, waitS: Math.ceil(retry), error: 'WB просит подождать ' + Math.ceil(retry) +
          ' с: лимит запросов кабинета выбран (его делят все сервисы на этом токене).' };
      }
      Utilities.sleep((retry + 1) * 1000);
      continue;
    }
    if (code === 401) return { ok: false, fatal: true, error: 'WB не принял токен (401): проверьте «' + POS_KEYS_SHEET + '» B2. ' + text.slice(0, 160) };
    if (code === 403) return { ok: false, fatal: true, error: 'WB отказал (403): у кабинета нет подписки Джем или у токена нет категории «Аналитика». ' + text.slice(0, 160) };
    if (code === 400) return { ok: false, fatal: true, error: 'WB не принял запрос (400): ' + text.slice(0, 200) };
    return { ok: false, error: 'WB ответил ' + code + ': ' + text.slice(0, 160) };
  }
  return { ok: false, error: 'WB не ответил' };
}

/** Слить ответ отчёта в общий словарь строк. kind: '30' — период 30 дней, '1' — вчера. */
function posJamMerge_(rows, items, kind) {
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var nm = Number(it.nmId);
    var text = String(it.text || '').trim();
    if (!nm || !text || /^\d+$/.test(text)) continue;      // поиск по самому артикулу — не ключевой запрос
    var key = posKey_(nm, text);
    var row = rows[key];
    if (!row) {
      row = rows[key] = { nm: nm, text: text, freq: 0, wb30: null, ord30: 0, wbY: null, ordY: 0, vis: null, source: 'WB' };
    }
    if (kind === '30') {
      row.freq = posNum_(it.frequency) || 0;
      row.wb30 = posNum_(it.avgPosition);
      row.ord30 = posNum_(it.orders) || 0;
      row.vis = posNum_(it.visibility);
    } else {
      row.wbY = posNum_(it.avgPosition);
      row.ordY = posNum_(it.orders) || 0;
      if (!row.freq) row.freq = (posNum_(it.weekFrequency) || 0) * 4;   // запрос появился только вчера
    }
  }
  return rows;
}

/**
 * Пачка артикулов: два вызова подряд (30 дней и вчера). Пара неделима — иначе строки
 * останутся без позиции дня. Возвращает {ok, rows} | {ok:false, waitS|fatal, error}.
 */
function posJamChunk_(cfg, nmIds, isFirstCall) {
  var rows = {};
  if (!isFirstCall) Utilities.sleep(POS_JAM_GAP_MS);
  var a = posJamCall_(cfg, nmIds, posDaysAgo_(30), posDaysAgo_(1));
  if (!a.ok) return a;
  posJamMerge_(rows, a.items, '30');
  Utilities.sleep(POS_JAM_GAP_MS);
  var b = posJamCall_(cfg, nmIds, posDaysAgo_(1), posDaysAgo_(1));
  if (!b.ok) return b;
  posJamMerge_(rows, b.items, '1');
  return { ok: true, rows: rows };
}

/** Публичная карточка: название, бренд, номер продавца. До 100 артикулов за запрос. */
function posCards_(nmIds, dest) {
  var out = {};
  for (var i = 0; i < nmIds.length; i += 100) {
    var chunk = nmIds.slice(i, i + 100);
    for (var h = 0; h < POS_CARD_HOSTS.length; h++) {
      var url = 'https://' + POS_CARD_HOSTS[h] + '/cards/v4/detail?appType=1&curr=rub&dest=' + dest +
        '&spp=30&nm=' + chunk.join(';');
      var resp;
      try {
        resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true,
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
      } catch (e) { continue; }
      if (resp.getResponseCode() !== 200) continue;
      var j;
      try { j = JSON.parse(resp.getContentText() || '{}'); } catch (e2) { continue; }
      var prods = (j.data && j.data.products) || j.products || [];
      for (var k = 0; k < prods.length; k++) {
        out[Number(prods[k].id)] = { name: prods[k].name || '', brand: prods[k].brand || '', seller: prods[k].supplierId || null };
      }
      break;
    }
  }
  return out;
}
