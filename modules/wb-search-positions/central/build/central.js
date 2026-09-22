/* ПОЗИЦИИ В ПОИСКЕ WB — ЦЕНТРАЛЬНЫЙ КОД v1.1.0 — 22.09.2026 */
/* v1.1.0: ПУБЛИЧНЫЕ ХОСТЫ ВЫДАЧИ (search.wb.ru, u-search.wb.ru) ЗАКРЫЛ АНТИБОТ WB — с 22.09.2026 оба отдают
   403 любому не-браузерному клиенту, органика из облака перестала собираться совсем. Место с рекламой теперь
   собирает расширение Chrome в браузере менеджера, книга обменивается с ним через уже существующий «хаб»
   (веб-приложение Apps Script, put_plan/get_result).
   • «Ключи» B10–B12: адрес хаба, ключ, имя книги в хабе (по умолчанию «search-vexor»); B10 пусто — прогон
     работает как раньше, из облака (регресс проверен отдельным тестом);
   • этап органики при заполненном хабе (posPhaseSearchHub_): один раз публикует план (posHubPutPlan_,
     POST put_plan) — запрос и артикулы очереди со статусом «ждёт»; дальше каждые 15 минут опрашивает
     итог (posHubGetResult_, GET get_result) и ставит триггер-продолжение, пока не придёт «свой» прогон
     (result.run === state.id) или не пройдёт 20 часов ожидания;
   • пришедший итог раскладывается по «Очереди» той же нормализацией запроса, что у posQueueBuild_
     (posHubApply_): complete — «готово» с местами из found, иначе и без ответа за 20 часов — «нет ответа»,
     как и у отказа облачной выдачи (в снимке «нет данных», прошлые дни истории не затираются);
   • ожидание хаба не считается зависшим прогоном: posTouch_ перед каждым 15-минутным продолжением держит
     touchedAt свежим внутри POS_STALE_MS (30 мин) — вахтёр (ежедневный автопрогон) прогон не подхватит зря;
   • карточки (posCards_, card.wb.ru) сейчас тоже могут не отвечать — исключение уже перехватывалось,
     поведение не менялось.
   Тесты: 31/31. */
/* v1.0.1: КАЖДЫЙ СБОЙ ЖИВОГО ХОСТА ВЫДАЧИ ОПЛАЧИВАЛСЯ ЗАПРОСОМ В ЗАКРЫТЫЙ — первый полный прогон 17.09.2026
   (439 запросов, локально тем же кодом): на запрос уходило 5,6 с вместо 2,7 с. Второй хост в этот день отвечал
   403 на всё, но после любого отказа первого код шёл к нему — и платил ещё запросом и паузой.
   • хост, отказавший три раза подряд, пропускается (POS_SEARCH_FAILS); список «мёртвых» фиксируется на начало
     вызова — живой хост не выпадает из перебора посреди страницы; ответил — счётчик обнуляется; закрыты все —
     счётчики сбрасываются, лимитер мог отпустить;
   • попытки считаются по сделанным запросам, а не по месту в списке: пропуск хоста попытку не тратит.
   Тесты: 26/26. */
/* v1.0.0: ПОЗИЦИИ СНИМАЛИСЬ РУКАМИ ПО ОДНОМУ АРТИКУЛУ И НЕ ЗАПОМИНАЛИСЬ — запрос менеджера маркетплейса
   17.09.2026: «он сам места не запоминает? мне все артикулы сейчас прогонять?». До этого позиции снимал
   скилл по одному артикулу за 5 минут, история жила файлами на компьютере того, кто запускал.
   • книга-пульт: лист «Артикулы» ведёт человек, остальное собирается само раз в день (триггер книги)
     и по кнопке; история пишется в книгу, а не на чей-то диск;
   • ключевые запросы, частотность, позиция WB и наши заказы — метод «Поисковые запросы» WB
     (search-report/product/search-texts): пачками до 50 артикулов, два вызова на пачку — за 30 дней
     (список запросов, частотность) и за вчера (позиция и заказы дня). Лимит 3 запроса в минуту;
   • органика — публичная выдача exactmatch, первая страница (глубина настраивается): хосты и версии
     метода перебираются с памятью, ответ без products считается чужим конвертом и перезапрашивается;
   • долгий прогон идёт этапами по 4,5 минуты с триггером-продолжением (continueQueue); очередь
     запросов — лист «Очередь», статус строки и есть машина состояний;
   • история — два широких листа («История · органика», «История · WB»): строка = артикул + запрос,
     колонка = день, новый день встаёт слева; повторный прогон в тот же день пишет в ту же колонку;
   • место «как видит покупатель» (с рекламой) из облака недоступно — сайт закрыт антиботом; в книге
     роль позиции с рекламой играет «WB позиция вчера», точечная проверка на сайте остаётся за скиллом.
   Тесты: 25/25. */


/* ==================== 01_ядро.js ==================== */

/* Ядро: имена листов, настройки книги, даты, токен, общие мелочи. */

var POS_KEYS_SHEET = 'Ключи';
var POS_ART_SHEET = 'Артикулы';
var POS_JAM_SHEET = 'Запросы WB';
var POS_QUEUE_SHEET = 'Очередь';
var POS_SHEET = 'Позиции';
var POS_HIST_ORG_SHEET = 'История · органика';
var POS_HIST_WB_SHEET = 'История · WB';
var POS_LOG_SHEET = 'Журнал';

var POS_ART_HEADER = ['Артикул WB', 'Активен', 'Свои запросы (через ;)', 'Название', 'Бренд',
  'Запросов', 'Последний замер', 'Статус'];
var POS_JAM_HEADER = ['Артикул', 'Запрос', 'Группа', 'Частотность 30 дн', 'WB позиция 30 дн',
  'Наших заказов 30 дн', 'WB позиция вчера', 'Наших заказов вчера', 'Видимость %', 'Источник'];
var POS_QUEUE_HEADER = ['Прогон', 'Запрос', 'Артикулы', 'Статус', 'Позиции', 'Тип выдачи',
  'Попыток', 'Обновлено'];
var POS_HEADER = ['Дата замера', 'Артикул', 'Название', 'Запрос', 'Группа', 'Частотность 30 дн',
  'Органика, место', 'Сдвиг органики', 'WB позиция вчера', 'Сдвиг WB', 'WB позиция 30 дн',
  'Наших заказов 30 дн', 'Наших заказов вчера', 'Источник'];
var POS_HIST_HEADER = ['Артикул', 'Запрос'];
var POS_LOG_HEADER = ['Когда', 'Кто', 'Прогон', 'Итог', 'Артикулов', 'Запросов', 'Найдено в органике',
  'Секунд', 'Примечание'];

var POS_KEYS_LABELS = [
  ['Кабинет (подпись для сообщений)', ''],
  ['Токен WB, категория «Аналитика» (нужна подписка Джем)', ''],
  ['Регион выдачи, dest (Москва = -1257786)', -1257786],
  ['GitHub-токен (пусто, пока код лежит в открытом репозитории)', ''],
  ['Токен бота оповещений (необязательно)', ''],
  ['Чат оповещений (необязательно)', ''],
  ['Глубина органики, страниц по 100 (1–3)', 1],
  ['Запросов на артикул из отчёта WB (1–30)', 30],
  ['Час автопрогона по Москве (0–23)', 7],
  /* v1.1.0. */
  ['Хаб сбора из браузера: адрес (пусто = искать из облака, как раньше)', ''],
  ['Хаб сбора из браузера: ключ', ''],
  ['Хаб сбора из браузера: имя книги в хабе', 'search-vexor']
];

/* Группы частотности: запросов за 30 дней по данным WB. */
var POS_FREQ_HIGH = 10000;
var POS_FREQ_MID = 1000;

var POS_DEST_MSK = -1257786;
var POS_PAGE_SIZE = 100;
var POS_STAGE_BUDGET_MS = 4.5 * 60 * 1000;      // у исполнения Apps Script шесть минут
var POS_STATE_KEY = 'POS_RUN';
var POS_T0 = 0;                                  // начало текущего исполнения, ставит точка входа

/** Настройки книги с листа «Ключи». Значения ключей живут ТОЛЬКО здесь. */
function posCfg_(soft) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(POS_KEYS_SHEET);
  if (!sh) {
    throw new Error('Нет листа «' + POS_KEYS_SHEET + '». Меню → «⚙️ Обновить настройки таблицы».');
  }
  var v = sh.getRange(1, 2, POS_KEYS_LABELS.length, 1).getValues();
  var cfg = {
    cabinet: String(v[0][0] || '').trim(),
    token: String(v[1][0] || '').trim(),
    dest: posInt_(v[2][0], POS_DEST_MSK),
    botToken: String(v[4][0] || '').trim(),
    chat: String(v[5][0] || '').trim(),
    depth: Math.min(3, Math.max(1, posInt_(v[6][0], 1))),
    limit: Math.min(30, Math.max(1, posInt_(v[7][0], 30))),
    hour: Math.min(23, Math.max(0, posInt_(v[8][0], 7))),
    /* v1.1.0. Хаб сбора из браузера: пусто в B10/B11 = искать органику из облака, как раньше. */
    hubUrl: String(v[9][0] || '').trim(),
    hubKey: String(v[10][0] || '').trim(),
    hubContour: String(v[11][0] || '').trim() || 'search-vexor'
  };
  if (!cfg.token && !soft) {
    throw new Error('Не заполнен токен WB: «' + POS_KEYS_SHEET + '» B2 (категория «Аналитика», у кабинета нужна подписка Джем).');
  }
  return cfg;
}

function posInt_(x, dflt) {
  if (x === null || x === undefined || x === '') return dflt;
  var n = parseInt(String(x).replace(/\s/g, ''), 10);
  return isNaN(n) ? dflt : n;
}

function posNum_(x) {
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'object' && x !== null && 'current' in x) x = x.current;
  var n = Number(String(x).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function posTz_() { return Session.getScriptTimeZone() || 'Europe/Moscow'; }

/** 'ГГГГ-ММ-ДД' по часовому поясу книги. */
function posIso_(date) { return Utilities.formatDate(date, posTz_(), 'yyyy-MM-dd'); }

/** 'ДД.ММ.ГГГГ' — так день стоит в шапке истории. */
function posRu_(iso) {
  var p = String(iso).split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function posToday_() { return posIso_(new Date()); }

function posDaysAgo_(n) {
  var d = new Date();
  d.setDate(d.getDate() - n);
  return posIso_(d);
}

function posStamp_() { return Utilities.formatDate(new Date(), posTz_(), 'yyyy-MM-dd HH:mm'); }

function posElapsed_() { return Date.now() - POS_T0; }

function posGroup_(freq, source) {
  if (source !== 'WB') return 'свой';
  if (freq >= POS_FREQ_HIGH) return 'ВЧ';
  if (freq >= POS_FREQ_MID) return 'СЧ';
  return 'НЧ';
}

/** Ключ строки «артикул + запрос»: WB регистр запроса не различает. */
function posKey_(nm, text) {
  return String(nm) + '|' + String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Полезная часть токена WB (JWT): срок и номер продавца. Значение токена никуда не пишется. */
function posTokenInfo_(token) {
  try {
    var part = String(token).split('.')[1];
    if (!part) return null;
    while (part.length % 4) part += '=';
    var bytes = Utilities.base64DecodeWebSafe(part);
    var p = JSON.parse(Utilities.newBlob(bytes).getDataAsString());
    return { exp: p.exp ? new Date(p.exp * 1000) : null, seller: p.oid || null, test: !!p.t };
  } catch (e) {
    return null;
  }
}

/* ---------- состояние прогона (Script Properties) ---------- */

function posStateLoad_() {
  var raw = PropertiesService.getScriptProperties().getProperty(POS_STATE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function posStateSave_(state) {
  PropertiesService.getScriptProperties().setProperty(POS_STATE_KEY, JSON.stringify(state));
}

function posStateClear_() {
  PropertiesService.getScriptProperties().deleteProperty(POS_STATE_KEY);
}


/* ==================== 02_джем.js ==================== */

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


/* ==================== 03_выдача.js ==================== */

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


/* ==================== 04_книга.js ==================== */

/* Листы книги: чтение «Артикулов», запись отчёта WB, позиций, истории и журнала. */

function posSs_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function posSheet_(name) {
  var sh = posSs_().getSheetByName(name);
  if (!sh) throw new Error('Нет листа «' + name + '». Меню → «⚙️ Обновить настройки таблицы».');
  return sh;
}

/** Хватает ли сетки: запись за границу листа в Apps Script — ошибка, а не авторасширение. */
function posEnsureSize_(sh, rows, cols) {
  if (rows > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (cols > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

/** Лист с шапкой. Существующему листу недостающие колонки дописываются СПРАВА: чужие колонки не двигаем. */
function posEnsureSheet_(name, header) {
  var ss = posSs_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    posEnsureSize_(sh, 2, header.length);
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  var have = posCols_(sh), lastCol = Math.max(sh.getLastColumn(), 0), add = [];
  for (var i = 0; i < header.length; i++) if (!have[header[i]]) add.push(header[i]);
  if (add.length) {
    posEnsureSize_(sh, 1, lastCol + add.length);
    sh.getRange(1, lastCol + 1, 1, add.length).setValues([add]).setFontWeight('bold');
  }
  return sh;
}

/** Колонки ищутся по заголовку, а не по букве: люди вставляют свои. {заголовок: номер колонки}. */
function posCols_(sh) {
  var last = sh.getLastColumn();
  var map = {};
  if (!last) return map;
  var row = sh.getRange(1, 1, 1, last).getValues()[0];
  for (var i = 0; i < row.length; i++) {
    var h = String(row[i] || '').trim();
    if (h && !map[h]) map[h] = i + 1;
  }
  return map;
}

function posBody_(sh) {
  var rows = sh.getLastRow() - 1, cols = sh.getLastColumn();
  if (rows < 1 || cols < 1) return [];
  return sh.getRange(2, 1, rows, cols).getValues();
}

function posClearBody_(sh) {
  var rows = sh.getLastRow() - 1, cols = sh.getLastColumn();
  if (rows >= 1 && cols >= 1) sh.getRange(2, 1, rows, cols).clearContent();
}

/* ---------- «Артикулы» ---------- */

/** [{row, nm, manual[]}] — только активные. «Активен» пусто или «да» = в работе, «нет» = выключен. */
function posReadArticles_(onlyRows) {
  var sh = posSheet_(POS_ART_SHEET);
  var c = posCols_(sh);
  if (!c[POS_ART_HEADER[0]]) throw new Error('На листе «' + POS_ART_SHEET + '» нет колонки «' + POS_ART_HEADER[0] + '».');
  var body = posBody_(sh), out = [], seen = {};
  for (var i = 0; i < body.length; i++) {
    var rowNo = i + 2;
    if (onlyRows && !onlyRows[rowNo]) continue;
    var nm = parseInt(String(body[i][c[POS_ART_HEADER[0]] - 1]).replace(/\D/g, ''), 10);
    if (!nm || seen[nm]) continue;
    var act = c[POS_ART_HEADER[1]] ? String(body[i][c[POS_ART_HEADER[1]] - 1] || '').trim().toLowerCase() : '';
    if (!onlyRows && /^(нет|no|0|выкл)/.test(act)) continue;
    var manualRaw = c[POS_ART_HEADER[2]] ? String(body[i][c[POS_ART_HEADER[2]] - 1] || '') : '';
    var manual = [];
    var parts = manualRaw.split(/[;\n]/);
    for (var k = 0; k < parts.length; k++) { var q = parts[k].trim(); if (q) manual.push(q); }
    seen[nm] = true;
    out.push({ row: rowNo, nm: nm, manual: manual });
  }
  return out;
}

/** Название, бренд, число запросов, дата и статус — по артикулу. Человеческие колонки не трогаем. */
function posArticlesMark_(byNm) {
  var sh = posSheet_(POS_ART_SHEET);
  var c = posCols_(sh), body = posBody_(sh);
  var fields = [['name', POS_ART_HEADER[3]], ['brand', POS_ART_HEADER[4]], ['queries', POS_ART_HEADER[5]],
    ['date', POS_ART_HEADER[6]], ['status', POS_ART_HEADER[7]]];
  for (var f = 0; f < fields.length; f++) {
    var col = c[fields[f][1]];
    if (!col || !body.length) continue;
    var values = [];
    for (var i = 0; i < body.length; i++) {
      var nm = parseInt(String(body[i][c[POS_ART_HEADER[0]] - 1]).replace(/\D/g, ''), 10);
      var info = nm && byNm[nm];
      var v = info && info[fields[f][0]] !== undefined && info[fields[f][0]] !== null ? info[fields[f][0]] : body[i][col - 1];
      values.push([v]);
    }
    sh.getRange(2, col, values.length, 1).setValues(values);
  }
}

/* ---------- «Запросы WB» ---------- */

function posJamRowValues_(r) {
  return [r.nm, r.text, posGroup_(r.freq || 0, r.source), r.freq || 0, r.wb30 === null ? '' : r.wb30, r.ord30 || 0,
    r.wbY === null ? '' : r.wbY, r.ordY || 0, r.vis === null || r.vis === undefined ? '' : r.vis, r.source];
}

function posJamAppend_(rowsObj) {
  var sh = posSheet_(POS_JAM_SHEET);
  var list = [];
  for (var k in rowsObj) list.push(rowsObj[k]);
  if (!list.length) return 0;
  list.sort(function (a, b) { return a.nm - b.nm || (b.ord30 - a.ord30) || (b.freq - a.freq); });
  var values = [];
  for (var i = 0; i < list.length; i++) values.push(posJamRowValues_(list[i]));
  var start = sh.getLastRow() + 1;
  posEnsureSize_(sh, start + values.length, POS_JAM_HEADER.length);
  sh.getRange(start, 1, values.length, POS_JAM_HEADER.length).setValues(values);
  return values.length;
}

function posJamRead_() {
  var body = posBody_(posSheet_(POS_JAM_SHEET)), out = [];
  for (var i = 0; i < body.length; i++) {
    var b = body[i];
    if (!b[0] || !b[1]) continue;
    out.push({ nm: Number(b[0]), text: String(b[1]), freq: Number(b[3]) || 0, wb30: posNum_(b[4]), ord30: Number(b[5]) || 0,
      wbY: posNum_(b[6]), ordY: Number(b[7]) || 0, vis: posNum_(b[8]), source: String(b[9] || 'WB') });
  }
  return out;
}

/* ---------- «Очередь» ---------- */

/** Очередь = уникальные запросы прогона; у каждого — список артикулов, которым он нужен. */
function posQueueBuild_(runId, jamRows, articles) {
  var byQuery = {}, order = [];
  function add(nm, text, source) {
    var q = String(text).trim();
    if (!q) return;
    var key = q.toLowerCase().replace(/\s+/g, ' ');
    if (!byQuery[key]) { byQuery[key] = { query: q, nms: {}, freq: 0 }; order.push(key); }
    byQuery[key].nms[nm] = true;
  }
  var active = {};
  for (var a = 0; a < articles.length; a++) active[articles[a].nm] = true;
  for (var i = 0; i < jamRows.length; i++) {
    if (!active[jamRows[i].nm]) continue;
    add(jamRows[i].nm, jamRows[i].text, 'WB');
    var key = String(jamRows[i].text).trim().toLowerCase().replace(/\s+/g, ' ');
    byQuery[key].freq = Math.max(byQuery[key].freq, jamRows[i].freq || 0);
  }
  for (var m = 0; m < articles.length; m++) {
    for (var q = 0; q < articles[m].manual.length; q++) add(articles[m].nm, articles[m].manual[q], 'свой');
  }
  order.sort(function (x, y) { return byQuery[y].freq - byQuery[x].freq; });
  var values = [];
  for (var o = 0; o < order.length; o++) {
    var item = byQuery[order[o]], nms = [];
    for (var nm in item.nms) nms.push(nm);
    values.push([runId, item.query, nms.join(','), 'ждёт', '', '', 0, '']);
  }
  var sh = posSheet_(POS_QUEUE_SHEET);
  posClearBody_(sh);
  if (values.length) {
    posEnsureSize_(sh, values.length + 1, POS_QUEUE_HEADER.length);
    sh.getRange(2, 1, values.length, POS_QUEUE_HEADER.length).setValues(values);
  }
  return values.length;
}

function posQueueRead_() {
  var body = posBody_(posSheet_(POS_QUEUE_SHEET)), out = [];
  for (var i = 0; i < body.length; i++) {
    var b = body[i];
    if (!b[1]) continue;
    var pos = {};
    try { pos = b[4] ? JSON.parse(b[4]) : {}; } catch (e) { pos = {}; }
    out.push({ row: i + 2, run: String(b[0]), query: String(b[1]), nms: String(b[2]).split(',').map(Number).filter(Boolean),
      status: String(b[3] || 'ждёт'), positions: pos, type: String(b[5] || ''), tries: Number(b[6]) || 0 });
  }
  return out;
}

/** Записать пачку строк очереди подряд (rows идут по возрастанию row без пропусков). */
function posQueueFlush_(rows) {
  if (!rows.length) return;
  var sh = posSheet_(POS_QUEUE_SHEET), values = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    values.push([r.run, r.query, r.nms.join(','), r.status, JSON.stringify(r.positions || {}), r.type || '', r.tries || 0, posStamp_()]);
  }
  sh.getRange(rows[0].row, 1, values.length, POS_QUEUE_HEADER.length).setValues(values);
}

/* ---------- «Позиции» ---------- */

/** Прошлый снимок: {ключ: {org, wb}} — против него считается сдвиг. */
function posPrevPositions_() {
  var sh = posSheet_(POS_SHEET), c = posCols_(sh), body = posBody_(sh), map = {};
  var cNm = c[POS_HEADER[1]], cQ = c[POS_HEADER[3]], cOrg = c[POS_HEADER[6]], cWb = c[POS_HEADER[8]];
  if (!cNm || !cQ) return map;
  for (var i = 0; i < body.length; i++) {
    var nm = body[i][cNm - 1], q = body[i][cQ - 1];
    if (!nm || !q) continue;
    map[posKey_(nm, q)] = { org: cOrg ? body[i][cOrg - 1] : '', wb: cWb ? body[i][cWb - 1] : '' };
  }
  return map;
}

function posShift_(prev, cur) {
  if (typeof prev !== 'number' || typeof cur !== 'number') return '';
  return Math.round((prev - cur) * 10) / 10;      // плюс — поднялись
}

function posWritePositions_(rows) {
  var sh = posSheet_(POS_SHEET);
  posClearBody_(sh);
  if (!rows.length) return 0;
  posEnsureSize_(sh, rows.length + 1, POS_HEADER.length);
  var shiftFmt = '[Green]"▲"0.#;[Red]"▼"0.#;"="';
  sh.getRange(2, 8, rows.length, 1).setNumberFormat(shiftFmt);
  sh.getRange(2, 10, rows.length, 1).setNumberFormat(shiftFmt);
  sh.getRange(2, 1, rows.length, POS_HEADER.length).setValues(rows);
  return rows.length;
}

/* ---------- история: строка = артикул + запрос, колонка = день, новый день слева ---------- */

function posHistoryWrite_(sheetName, dayRu, byKey) {
  var any = false;
  for (var probe in byKey) { any = true; break; }
  if (!any) return { column: 0, rows: 0, added: 0 };   // писать нечего — пустую колонку дня не заводим
  var sh = posSheet_(sheetName);
  var lastCol = Math.max(sh.getLastColumn(), 2);
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = 0;
  for (var h = 2; h < header.length; h++) if (String(header[h]).trim() === dayRu) { col = h + 1; break; }
  if (!col) {
    sh.insertColumnsAfter(2, 1);
    col = 3;
    sh.getRange(1, col).setNumberFormat('@');          // формат ДО значения: иначе «17.09.2026» станет датой
    sh.getRange(1, col).setValue(dayRu).setFontWeight('bold');
  }
  var body = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues() : [];
  var have = {}, column = [];
  var old = body.length ? sh.getRange(2, col, body.length, 1).getValues() : [];
  for (var i = 0; i < body.length; i++) {
    var key = posKey_(body[i][0], body[i][1]);
    have[key] = true;
    column.push([byKey[key] !== undefined ? byKey[key].value : old[i][0]]);
  }
  var fresh = [];
  for (var k in byKey) {
    if (have[k]) continue;
    fresh.push([byKey[k].nm, byKey[k].text]);
    column.push([byKey[k].value]);
  }
  posEnsureSize_(sh, column.length + 1, col);
  if (fresh.length) sh.getRange(body.length + 2, 1, fresh.length, 2).setValues(fresh);
  if (column.length) sh.getRange(2, col, column.length, 1).setValues(column);
  return { column: col, rows: column.length, added: fresh.length };
}

/* ---------- журнал ---------- */

function posLog_(e) {
  var sh = posSs_().getSheetByName(POS_LOG_SHEET);
  if (!sh) return;
  var row = [posStamp_(), e.who || '', e.run || '', e.result || '', e.articles === undefined ? '' : e.articles,
    e.queries === undefined ? '' : e.queries, e.found === undefined ? '' : e.found,
    e.seconds === undefined ? '' : e.seconds, String(e.note || '').slice(0, 500)];
  var at = sh.getLastRow() + 1;
  posEnsureSize_(sh, at, POS_LOG_HEADER.length);
  sh.getRange(at, 1, 1, POS_LOG_HEADER.length).setValues([row]);
}


/* ==================== 05_прогон.js ==================== */

/* Прогон: отчёт WB → очередь запросов → органика → запись. Этапы по 4,5 минуты с продолжением в облаке. */

var POS_STALE_MS = 30 * 60 * 1000;        // столько прогон может молчать, прежде чем его сочтут зависшим
var POS_LAST_KEY = 'POS_LAST';            // итог последнего прогона — для окна «Что сейчас происходит»
var POS_CONTINUE_HANDLER = 'continueQueue';
/* v1.1.0. Хаб сбора из браузера: план публикуется один раз, итог книга сама перепроверяет по расписанию —
   отдельно от POS_STALE_MS (30 мин), которого прогон не достигает: посTouch_ перед каждым posSchedule_
   держит touchedAt свежим на каждом 15-минутном цикле ожидания. */
var POS_HUB_WAIT_MS = 20 * 60 * 60 * 1000;   // дольше молчания браузера прогон не ждёт
var POS_HUB_RECHECK_S = 900;                 // 15 минут между проверками итога в хабе

function posIsActive_(state) {
  return !!state && state.phase !== 'done' && state.phase !== 'failed';
}

function posIsStale_(state) {
  return posIsActive_(state) && (Date.now() - (state.touchedAt || 0)) > POS_STALE_MS;
}

function posTouch_(state) {
  state.touchedAt = Date.now();
  posStateSave_(state);
}

/* ---------- триггер-продолжение ---------- */

function posDropContinuations_() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === POS_CONTINUE_HANDLER) ScriptApp.deleteTrigger(all[i]);
  }
}

function posSchedule_(seconds) {
  posDropContinuations_();          // сработавший разовый триггер сам не исчезает, а лимит — 20 на проект
  ScriptApp.newTrigger(POS_CONTINUE_HANDLER).timeBased().after(Math.max(10, seconds) * 1000).create();
}

/* ---------- старт ---------- */

/**
 * Новый прогон. onlyRows — {номер строки «Артикулов»: true} для прогона по выделенным.
 * Возвращает текст для человека.
 */
function posStart_(who, onlyRows) {
  var cfg = posCfg_();
  var old = posStateLoad_();
  if (posIsActive_(old) && !posIsStale_(old)) {
    return 'Прогон ' + old.id + ' уже идёт (этап «' + posPhaseName_(old.phase) + '»). Дождитесь его — «📊 Что сейчас происходит».';
  }
  var articles = posReadArticles_(onlyRows);
  if (!articles.length) {
    return onlyRows ? 'В выделенных строках нет артикулов. Выделите строки на листе «' + POS_ART_SHEET + '».'
      : 'На листе «' + POS_ART_SHEET + '» нет активных артикулов: впишите артикулы WB в первую колонку.';
  }
  var nms = [];
  for (var i = 0; i < articles.length; i++) nms.push(articles[i].nm);
  var state = { id: posStamp_(), day: posToday_(), who: who, phase: 'jam', startedAt: Date.now(),
    nms: nms, rows: onlyRows ? Object.keys(onlyRows).map(Number) : null,
    jamChunk: 0, waits: 0, errors: 0, stages: 0 };
  posClearBody_(posSheet_(POS_JAM_SHEET));
  posClearBody_(posSheet_(POS_QUEUE_SHEET));
  posTouch_(state);
  return posStep_();
}

function posPhaseName_(phase) {
  return { jam: 'отчёт WB', search: 'органика', final: 'запись', done: 'готово', failed: 'сбой' }[phase] || phase;
}

/* ---------- один этап ---------- */

function posStep_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return 'Другой этап этого прогона ещё работает — повторять не нужно.';
  try {
    var state = posStateLoad_();
    if (!posIsActive_(state)) return 'Активного прогона нет.';
    var cfg = posCfg_();
    state.stages++;
    posTouch_(state);
    if (state.phase === 'jam') {
      var r = posPhaseJam_(state, cfg);
      if (r) return r;
    }
    if (state.phase === 'search') {
      var s = posPhaseSearch_(state, cfg);
      if (s) return s;
    }
    if (state.phase === 'final') {
      if (posElapsed_() > POS_STAGE_BUDGET_MS - 30000) {
        posTouch_(state);
        posSchedule_(15);
        return 'Позиции собраны, запись в листы — следующим этапом (в облаке, ничего делать не нужно).';
      }
      return posFinalize_(state, cfg);
    }
    return 'Прогон ' + state.id + ': ' + posPhaseName_(state.phase) + '.';
  } catch (e) {
    var st = posStateLoad_();
    return posFail_(st, 'ошибка кода: ' + String(e && e.message || e).slice(0, 300));
  } finally {
    lock.releaseLock();
  }
}

function posFail_(state, msg) {
  posDropContinuations_();
  if (state) {
    state.phase = 'failed';
    state.error = msg;
    posTouch_(state);
  }
  posLog_({ who: state && state.who, run: state && state.id, result: 'СБОЙ', articles: state && state.nms.length,
    seconds: state ? Math.round((Date.now() - state.startedAt) / 1000) : '', note: msg });
  posNotify_('⚠️ Позиции WB — прогон не завершён', msg, 'Откройте книгу → «📊 Что сейчас происходит».');
  return 'Прогон остановлен: ' + msg;
}

/* ---------- этап 1: отчёт WB ---------- */

function posPhaseJam_(state, cfg) {
  var total = Math.ceil(state.nms.length / POS_JAM_CHUNK);
  var firstHere = true;
  while (state.jamChunk < total) {
    // пара вызовов с паузами занимает ~50 с — не начинаем, если не успеем
    if (posElapsed_() > POS_STAGE_BUDGET_MS - 70000) {
      posTouch_(state);
      posSchedule_(20);
      return 'Отчёт WB: ' + state.jamChunk + ' из ' + total + ' пачек. Продолжение — в облаке, ничего делать не нужно.';
    }
    var nms = state.nms.slice(state.jamChunk * POS_JAM_CHUNK, (state.jamChunk + 1) * POS_JAM_CHUNK);
    var r = posJamChunk_(cfg, nms, firstHere);
    firstHere = false;
    if (!r.ok) {
      if (r.fatal) return posFail_(state, r.error);
      if (r.waitS) {
        state.waits++;
        if (state.waits > 4) return posFail_(state, r.error + ' Лимит не освободился за четыре попытки — повторите позже или выпустите отдельный токен.');
        posTouch_(state);
        posSchedule_(r.waitS + 10);
        posLog_({ who: state.who, run: state.id, result: 'ждём лимит WB', note: r.error });
        return r.error + ' Прогон продолжится сам через ' + Math.ceil((r.waitS + 10) / 60) + ' мин.';
      }
      state.errors++;
      if (state.errors > 3) return posFail_(state, r.error);
      posTouch_(state);
      posSchedule_(120);
      return r.error + ' Повтор через 2 минуты.';
    }
    posJamAppend_(r.rows);
    state.jamChunk++;
    posTouch_(state);
  }
  var articles = posReadArticles_(posRowsFilter_(state));
  var jam = posJamRead_();
  var cards = {};
  try { cards = posCards_(state.nms, cfg.dest); } catch (e) { cards = {}; }
  var marks = {}, perNm = {};
  for (var j = 0; j < jam.length; j++) perNm[jam[j].nm] = (perNm[jam[j].nm] || 0) + 1;
  for (var i = 0; i < state.nms.length; i++) {
    var nm = state.nms[i], card = cards[nm] || {};
    marks[nm] = { name: card.name || null, brand: card.brand || null, queries: perNm[nm] || 0,
      status: perNm[nm] ? 'идёт замер' : 'в отчёте WB нет запросов (новая карточка или чужой кабинет)' };
  }
  posArticlesMark_(marks);
  state.queue = posQueueBuild_(state.id, jam, articles);
  state.phase = state.queue ? 'search' : 'final';
  posTouch_(state);
  return null;
}

function posRowsFilter_(state) {
  if (!state.rows) return null;
  var f = {};
  for (var i = 0; i < state.rows.length; i++) f[state.rows[i]] = true;
  return f;
}

/* ---------- этап 2: органика ---------- */

/** v1.1.0. Публичная выдача закрыта антиботом — при заполненном хабе органику собирает браузер. */
function posPhaseSearch_(state, cfg) {
  if (cfg.hubUrl && cfg.hubKey) return posPhaseSearchHub_(state, cfg);
  var queue = posQueueRead_();
  var buffer = [], left = 0;
  function flush() { posQueueFlush_(buffer); buffer = []; }
  for (var i = 0; i < queue.length; i++) {
    var q = queue[i];
    if (q.status !== 'ждёт') continue;
    if (posElapsed_() > POS_STAGE_BUDGET_MS) { left++; continue; }
    var loc = posLocate_(q.query, q.nms, cfg.depth, cfg.dest);
    if (loc.complete) {
      q.status = 'готово';
      q.positions = loc.found;
      q.type = loc.type;
    } else {
      q.tries++;
      if (q.tries >= 3) q.status = 'нет ответа'; else left++;
    }
    if (buffer.length && buffer[buffer.length - 1].row + 1 !== q.row) flush();
    buffer.push(q);
    if (buffer.length >= 40) { flush(); posTouch_(state); }
    Utilities.sleep(POS_SEARCH_PAUSE_MS);
  }
  flush();
  if (left) {
    posTouch_(state);
    posSchedule_(20);
    return 'Органика: осталось ' + left + ' запросов из ' + queue.length + '. Продолжение — в облаке, ничего делать не нужно.';
  }
  state.phase = 'final';
  posTouch_(state);
  return null;
}

/* ---------- этап 2, режим браузера ---------- */

/**
 * v1.1.0. Хаб — веб-приложение Apps Script с HTTP-протоколом (все ответы JSON):
 *   POST {hubUrl}?action=put_plan&contour=<имя>&key=<ключ>, тело — JSON план (text/plain);
 *   GET  {hubUrl}?action=get_result&contour=<имя>&key=<ключ> → {ok:true,result:{...}} | {ok:false,error}.
 * Хаб отвечает 302 на googleusercontent.com — UrlFetchApp идёт по редиректу сам (followRedirects по умолчанию).
 */
function posHubUrl_(cfg, action) {
  return cfg.hubUrl + '?action=' + action + '&contour=' + encodeURIComponent(cfg.hubContour) +
    '&key=' + encodeURIComponent(cfg.hubKey);
}

/** v1.1.0. Отдать план хабу. {ok:true} | {ok:false,error}. */
function posHubPutPlan_(cfg, plan) {
  try {
    var resp = UrlFetchApp.fetch(posHubUrl_(cfg, 'put_plan'), {
      method: 'post', contentType: 'text/plain', payload: JSON.stringify(plan), muteHttpExceptions: true
    });
    var j;
    try { j = JSON.parse(resp.getContentText() || '{}'); } catch (e) {
      return { ok: false, error: 'хаб вернул не JSON: ' + String(resp.getContentText()).slice(0, 160) };
    }
    if (!j.ok) return { ok: false, error: String(j.error || ('хаб ответил ' + resp.getResponseCode())) };
    return { ok: true };
  } catch (e2) {
    return { ok: false, error: 'хаб недоступен: ' + String(e2 && e2.message || e2).slice(0, 200) };
  }
}

/** v1.1.0. Спросить у хаба итог. Возвращает разобранный ответ как есть — свежести решает вызывающий. */
function posHubGetResult_(cfg) {
  try {
    var resp = UrlFetchApp.fetch(posHubUrl_(cfg, 'get_result'), { muteHttpExceptions: true });
    try { return JSON.parse(resp.getContentText() || '{}'); } catch (e) { return { ok: false, error: 'хаб вернул не JSON' }; }
  } catch (e2) {
    return { ok: false, error: 'хаб недоступен: ' + String(e2 && e2.message || e2).slice(0, 200) };
  }
}

/** v1.1.0. Сообщение-приглашение — одно и то же на публикации плана и на каждой проверке без итога. */
function posHubWaitText_() {
  return 'Органика ждёт сбора из браузера: нажмите значок расширения «Полки WB» в Chrome (или меню «Полки WB» ' +
    'в книге бренда). Книга проверит итог сама через 15 минут.';
}

/**
 * v1.1.0. Итоги хаба {q, found:{nm: место}, complete, type?} раскладываются по строкам «Очереди» той же
 * нормализацией запроса, что и posQueueBuild_. Строка без итога или с complete:false — «нет ответа»:
 * в снимке это «нет данных», прошлые дни истории не затираются (как и у отказа облачной выдачи).
 */
function posHubApply_(state, result) {
  var items = result.items || [], byQuery = {};
  for (var i = 0; i < items.length; i++) {
    byQuery[String(items[i].q || '').trim().toLowerCase().replace(/\s+/g, ' ')] = items[i];
  }
  var queue = posQueueRead_(), buffer = [];
  function flush() { posQueueFlush_(buffer); buffer = []; }
  for (var k = 0; k < queue.length; k++) {
    var q = queue[k];
    if (q.status !== 'ждёт') continue;
    var item = byQuery[q.query.trim().toLowerCase().replace(/\s+/g, ' ')];
    if (item && item.complete) {
      q.status = 'готово';
      q.positions = item.found || {};
      q.type = item.type || 'браузер';
    } else {
      q.status = 'нет ответа';
    }
    if (buffer.length && buffer[buffer.length - 1].row + 1 !== q.row) flush();
    buffer.push(q);
  }
  flush();
  state.phase = 'final';
  posTouch_(state);
  return null;
}

/** v1.1.0. Хаб отдал не наш прогон, молчит, или недоступен: ждём дальше — до POS_HUB_WAIT_MS. */
function posHubMarkDead_(state) {
  var queue = posQueueRead_(), buffer = [];
  function flush() { posQueueFlush_(buffer); buffer = []; }
  for (var i = 0; i < queue.length; i++) {
    var q = queue[i];
    if (q.status !== 'ждёт') continue;
    q.status = 'нет ответа';
    if (buffer.length && buffer[buffer.length - 1].row + 1 !== q.row) flush();
    buffer.push(q);
  }
  flush();
  state.phase = 'final';
  posTouch_(state);
  return null;
}

/** v1.1.0. Режим браузера: план публикуется один раз за прогон, дальше — только опрос итога. */
function posPhaseSearchHub_(state, cfg) {
  if (!state.published) {
    var queue = posQueueRead_(), searches = [];
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'ждёт') continue;
      searches.push({ q: queue[i].query, nms: queue[i].nms });
    }
    var plan = { v: 1, contour: cfg.hubContour, title: 'Позиции в поиске — ' + (cfg.cabinet || 'книга'),
      run: state.id, built_at: new Date().toISOString(), dest: cfg.dest, depth: cfg.depth, searches: searches };
    var put = posHubPutPlan_(cfg, plan);
    if (!put.ok) return posFail_(state, 'Хаб браузера не принял план: ' + put.error);
    state.published = true;
    state.waitSince = Date.now();
    posTouch_(state);
  }

  var res = posHubGetResult_(cfg);
  if (res && res.ok && res.result && res.result.run === state.id) return posHubApply_(state, res.result);

  if (Date.now() - state.waitSince > POS_HUB_WAIT_MS) return posHubMarkDead_(state);

  posTouch_(state);
  posSchedule_(POS_HUB_RECHECK_S);
  return posHubWaitText_();
}

/* ---------- этап 3: запись ---------- */

function posFinalize_(state, cfg) {
  var limit = cfg.depth * POS_PAGE_SIZE;
  var inRun = {};
  for (var n = 0; n < state.nms.length; n++) inRun[state.nms[n]] = true;

  var queue = posQueueRead_(), byQuery = {};
  for (var q = 0; q < queue.length; q++) byQuery[queue[q].query.trim().toLowerCase().replace(/\s+/g, ' ')] = queue[q];

  var names = posArticleNames_();
  var prev = posPrevPositions_();
  var jam = posJamRead_();
  var articles = posReadArticles_(posRowsFilter_(state));

  var items = [], seenKey = {};
  for (var j = 0; j < jam.length; j++) {
    if (!inRun[jam[j].nm]) continue;
    seenKey[posKey_(jam[j].nm, jam[j].text)] = true;
    items.push(jam[j]);
  }
  for (var a = 0; a < articles.length; a++) {
    for (var m = 0; m < articles[a].manual.length; m++) {
      var key = posKey_(articles[a].nm, articles[a].manual[m]);
      if (seenKey[key]) continue;
      seenKey[key] = true;
      items.push({ nm: articles[a].nm, text: articles[a].manual[m], freq: 0, wb30: null, ord30: 0, wbY: null, ordY: 0, source: 'свой' });
    }
  }

  var rows = [], histOrg = {}, histWb = {}, found = 0, perNm = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var qrow = byQuery[String(it.text).trim().toLowerCase().replace(/\s+/g, ' ')];
    var org;
    if (!qrow || qrow.status !== 'готово') org = 'нет данных';
    else if (qrow.positions[it.nm]) { org = Number(qrow.positions[it.nm]); found++; }
    else org = '>' + limit;
    var k = posKey_(it.nm, it.text), p = prev[k] || {};
    var wbY = it.wbY === null || it.wbY === undefined ? '' : it.wbY;
    rows.push([state.day, it.nm, names[it.nm] || '', it.text, posGroup_(it.freq || 0, it.source),
      it.source === 'WB' ? (it.freq || 0) : '', org, posShift_(p.org, org), wbY, posShift_(p.wb, wbY),
      it.wb30 === null || it.wb30 === undefined ? '' : it.wb30, it.ord30 || 0, it.ordY || 0, it.source]);
    if (org !== 'нет данных') histOrg[k] = { nm: it.nm, text: it.text, value: org };   // молчание источника не затирает собранное
    if (wbY !== '') histWb[k] = { nm: it.nm, text: it.text, value: wbY };
    perNm[it.nm] = (perNm[it.nm] || 0) + 1;
  }

  // прогон по выделенным не должен стирать остальные артикулы со снимка
  if (state.rows) {
    var sh = posSheet_(POS_SHEET), c = posCols_(sh), body = posBody_(sh);
    for (var b = 0; b < body.length; b++) {
      var nmOld = Number(body[b][c[POS_HEADER[1]] - 1]);
      if (nmOld && !inRun[nmOld]) rows.push(body[b].slice(0, POS_HEADER.length));
    }
  }
  rows.sort(function (x, y) {
    return (x[1] - y[1]) || ((x[13] === 'WB' ? 0 : 1) - (y[13] === 'WB' ? 0 : 1)) || ((Number(y[5]) || 0) - (Number(x[5]) || 0));
  });

  posWritePositions_(rows);
  posHistoryWrite_(POS_HIST_ORG_SHEET, posRu_(state.day), histOrg);
  posHistoryWrite_(POS_HIST_WB_SHEET, posRu_(posDaysAgo_(1)), histWb);

  var marks = {};
  for (var s = 0; s < state.nms.length; s++) {
    var nm = state.nms[s];
    marks[nm] = { queries: perNm[nm] || 0, date: state.day,
      status: perNm[nm] ? 'ок' : 'в отчёте WB нет запросов (новая карточка или чужой кабинет)' };
  }
  posArticlesMark_(marks);

  var noAnswer = 0;
  for (var z = 0; z < queue.length; z++) if (queue[z].status !== 'готово') noAnswer++;
  var seconds = Math.round((Date.now() - state.startedAt) / 1000);
  var summary = { id: state.id, day: state.day, who: state.who, articles: state.nms.length, rows: items.length,
    queries: queue.length, found: found, noAnswer: noAnswer, seconds: seconds, stages: state.stages };
  PropertiesService.getScriptProperties().setProperty(POS_LAST_KEY, JSON.stringify(summary));
  posLog_({ who: state.who, run: state.id, result: noAnswer ? 'готово, не всё' : 'готово', articles: state.nms.length,
    queries: queue.length, found: found, seconds: seconds,
    note: (noAnswer ? noAnswer + ' запросов выдача не отдала — в истории за этот день пусто, прошлое не затёрто. ' : '') +
      'этапов: ' + state.stages });
  posDropContinuations_();
  state.phase = 'done';
  posTouch_(state);
  var text = posSummaryText_(summary, limit);
  if (state.who === 'автопрогон' || noAnswer) {
    posNotify_('📈 Позиции WB — замер ' + posRu_(state.day), text, noAnswer ? 'Повторите 1️⃣ позже: часть запросов выдача не отдала.' : 'Ничего делать не нужно.');
  }
  return text;
}

function posSummaryText_(s, limit) {
  return 'Замер ' + posRu_(s.day) + ' готов: артикулов ' + s.articles + ', строк «артикул + запрос» ' + s.rows +
    ', уникальных запросов ' + s.queries + ', в первых ' + limit + ' органики найдено ' + s.found +
    (s.noAnswer ? ', без ответа выдачи ' + s.noAnswer : '') + '. Время: ' + Math.ceil(s.seconds / 60) + ' мин, этапов ' + s.stages + '.';
}

function posArticleNames_() {
  var sh = posSheet_(POS_ART_SHEET), c = posCols_(sh), body = posBody_(sh), map = {};
  for (var i = 0; i < body.length; i++) {
    var nm = parseInt(String(body[i][c[POS_ART_HEADER[0]] - 1]).replace(/\D/g, ''), 10);
    if (nm && c[POS_ART_HEADER[3]]) map[nm] = body[i][c[POS_ART_HEADER[3]] - 1] || '';
  }
  return map;
}


/* ==================== 06_пульт.js ==================== */

/* Пульт: точки входа меню и триггеров. Имена не переименовывать — на них висят пункты меню и триггеры. */

var POS_DAILY_HANDLER = 'posDailyTrigger';

function posAlert_(title, text) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, text, ui.ButtonSet.OK);
  } catch (e) { /* из триггера окна нет — итог уже в журнале */ }
}

/** 1️⃣ Снять позиции по всем активным артикулам. */
function posRunAll() {
  POS_T0 = Date.now();
  var text;
  try { text = posStart_('кнопка 1️⃣', null); } catch (e) { text = String(e.message || e); }
  posAlert_('📈 Позиции WB', text);
  return text;
}

/** 2️⃣ Снять позиции по выделенным строкам листа «Артикулы». Остальные артикулы снимка не трогаются. */
function posRunSelected() {
  POS_T0 = Date.now();
  var text;
  try {
    var ss = posSs_(), sh = ss.getActiveSheet();
    if (!sh || sh.getName() !== POS_ART_SHEET) {
      text = 'Откройте лист «' + POS_ART_SHEET + '», выделите строки с нужными артикулами и нажмите 2️⃣ ещё раз.';
    } else {
      var rows = {}, list = ss.getActiveRangeList ? ss.getActiveRangeList().getRanges() : [ss.getActiveRange()];
      for (var i = 0; i < list.length; i++) {
        for (var r = list[i].getRow(); r < list[i].getRow() + list[i].getNumRows(); r++) if (r > 1) rows[r] = true;
      }
      text = posStart_('кнопка 2️⃣', rows);
    }
  } catch (e) { text = String(e.message || e); }
  posAlert_('📈 Позиции WB', text);
  return text;
}

/** Ежедневный автопрогон. Зависший прогон подхватывает, живой — не дублирует. */
function posDailyTrigger() {
  POS_T0 = Date.now();
  try {
    var state = posStateLoad_();
    if (posIsActive_(state) && !posIsStale_(state)) {
      posLog_({ who: 'автопрогон', run: state.id, result: 'пропуск', note: 'прогон уже идёт — второй не нужен' });
      return;
    }
    if (posIsStale_(state) && state.day === posToday_()) { posStep_(); return; }
    posStart_('автопрогон', null);
  } catch (e) {
    posLog_({ who: 'автопрогон', result: 'СБОЙ', note: String(e.message || e).slice(0, 400) });
    posNotify_('⚠️ Позиции WB — автопрогон не стартовал', String(e.message || e).slice(0, 300),
      'Откройте книгу → «🔌 Проверка связи».');
  }
}

/** Облачное продолжение: триггер вызывает функцию лоадера с ЭТИМ именем. */
function continueQueue() {
  POS_T0 = Date.now();
  posDropContinuations_();
  return posStep_();
}

function posInstallDailyTrigger() {
  var cfg = posCfg_(true);
  posRemoveDaily_();
  ScriptApp.newTrigger(POS_DAILY_HANDLER).timeBased().atHour(cfg.hour).nearMinute(5).everyDays(1).create();
  posAlert_('⏰ Автопрогон включён', 'Книга будет снимать позиции по всем активным артикулам каждый день около ' +
    cfg.hour + ':00 (час — «' + POS_KEYS_SHEET + '» B9). Итог каждого прогона — лист «' + POS_LOG_SHEET + '».\n\n' +
    'Триггер работает от имени того, кто нажал эту кнопку.');
}

function posRemoveDailyTrigger() {
  var n = posRemoveDaily_();
  posAlert_('⏰ Автопрогон', n ? 'Автопрогон отключён.' : 'Автопрогон и так не был включён.');
}

function posRemoveDaily_() {
  var all = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === POS_DAILY_HANDLER) { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n;
}

function posDailyInstalled_() {
  var all = ScriptApp.getProjectTriggers();
  for (var i = 0; i < all.length; i++) if (all[i].getHandlerFunction() === POS_DAILY_HANDLER) return true;
  return false;
}

/** 🧹 Сбросить зависший прогон: собранное остаётся в листах, состояние и продолжения снимаются. */
function posResetRun() {
  var state = posStateLoad_();
  posDropContinuations_();
  posStateClear_();
  if (state) posLog_({ who: 'кнопка «сбросить»', run: state.id, result: 'сброшен', note: 'этап «' + posPhaseName_(state.phase) + '»' });
  posAlert_('🧹 Прогон сброшен', state ? 'Прогон ' + state.id + ' снят. Можно запускать 1️⃣ заново.' : 'Активного прогона не было.');
}

/** ⚙️ Служебные листы и шапки — без боевых действий. Человеческие колонки и данные не трогаются. */
function upgradeSheets() {
  var ss = posSs_();
  var keys = ss.getSheetByName(POS_KEYS_SHEET);
  if (!keys) {
    keys = ss.insertSheet(POS_KEYS_SHEET);
    posEnsureSize_(keys, POS_KEYS_LABELS.length, 2);
    keys.getRange(1, 1, POS_KEYS_LABELS.length, 2).setValues(POS_KEYS_LABELS);
    keys.setColumnWidth(1, 430);
    keys.setColumnWidth(2, 360);
  } else {
    var have = keys.getRange(1, 1, POS_KEYS_LABELS.length, 2).getValues(), fix = [];
    for (var i = 0; i < POS_KEYS_LABELS.length; i++) {
      fix.push([POS_KEYS_LABELS[i][0], have[i][1] === '' || have[i][1] === null ? POS_KEYS_LABELS[i][1] : have[i][1]]);
    }
    keys.getRange(1, 1, fix.length, 2).setValues(fix);      // подписи обновляются, значения — только пустые
  }
  var art = posEnsureSheet_(POS_ART_SHEET, POS_ART_HEADER);
  art.getRange(1, 1, 1, 3).setBackground('#FFF2CC');         // эти три колонки заполняет человек
  art.setColumnWidth(3, 320);
  art.setColumnWidth(4, 360);
  posEnsureSheet_(POS_SHEET, POS_HEADER);
  posEnsureSheet_(POS_HIST_ORG_SHEET, POS_HIST_HEADER);
  posEnsureSheet_(POS_HIST_WB_SHEET, POS_HIST_HEADER);
  posEnsureSheet_(POS_JAM_SHEET, POS_JAM_HEADER);
  posEnsureSheet_(POS_QUEUE_SHEET, POS_QUEUE_HEADER);
  posEnsureSheet_(POS_LOG_SHEET, POS_LOG_HEADER);
  posAlert_('⚙️ Настройки таблицы', 'Листы и шапки на месте. Дальше: «' + POS_KEYS_SHEET + '» B2 — токен WB, ' +
    'лист «' + POS_ART_SHEET + '» — артикулы, потом 1️⃣.');
  return 'ok';
}


/* ==================== 07_окна.js ==================== */

/* Окна пульта: инструкция, статус, проверка связи. Отдают {html, text} — рисует лоадер. */

function dlgCss_() {
  return '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.55;margin:0;padding:18px;color:#202124}' +
    'h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 6px;font-size:14.5px}' +
    'ol,ul{margin:6px 0 6px 18px;padding:0}li{margin-bottom:6px}' +
    '.red{color:#C5221F;font-weight:600}.ok{color:#188038;font-weight:600}' +
    '.box{background:#F5F5F5;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.warn{background:#FCE8E6;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.act{background:#E6F4EA;border-radius:6px;padding:10px 12px;margin:10px 0;font-weight:600}' +
    '.muted{color:#666}.big{font-size:22px;font-weight:700}' +
    'table{border-collapse:collapse;margin:8px 0;width:100%}' +
    'td,th{border:1px solid #DADCE0;padding:5px 8px;text-align:left;font-size:13px}' +
    'th{background:#F1F3F4}' +
    '</style>';
}

function htmlEsc_(x) {
  return String(x === null || x === undefined ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function posStrip_(html) {
  return String(html).replace(/<li>/g, '\n• ').replace(/<\/(h2|h3|div|tr|ol|ul|p)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** 📖 Как работать — описывает ТУ версию, которая сейчас в книге. */
function posHelp(version) {
  var h = [];
  h.push('<h2>📖 Позиции в поиске WB — как работать</h2>');
  h.push('<div class="box">Книга раз в день сама снимает позиции карточек в поиске Wildberries по их ключевым ' +
    'запросам и копит историю. Вы ведёте только лист <b>«' + POS_ART_SHEET + '»</b>. Ничего во внешние системы ' +
    'книга не пишет — только читает WB.</div>');

  h.push('<h3>Один раз</h3><ol>');
  h.push('<li><b>⚙️ Обновить настройки таблицы</b> — появятся все листы.</li>');
  h.push('<li>«' + POS_KEYS_SHEET + '» <b>B2</b> — токен кабинета WB с категорией «Аналитика» (у кабинета нужна подписка ' +
    'Джем). Лучше отдельный токен под эту книгу: лимит WB считается на токен, общий ключ делят другие сервисы.</li>');
  h.push('<li><b>🔌 Проверка связи</b> — токен принят, срок виден, выдача отвечает.</li>');
  h.push('<li>Лист «' + POS_ART_SHEET + '»: в первую колонку — артикулы WB, по одному в строке.</li>');
  h.push('<li><b>🛠 Ручной режим → ⏰ Включить автопрогон</b>. Час — «' + POS_KEYS_SHEET + '» B9.</li></ol>');

  h.push('<h3>Каждый день</h3><ol>');
  h.push('<li>Ничего не нажимать: автопрогон снимает позиции по всем активным артикулам и дописывает историю.</li>');
  h.push('<li>Нужно прямо сейчас — <b>1️⃣ Снять позиции по всем артикулам</b>. Только что добавили пару карточек — ' +
    'выделите их строки на «' + POS_ART_SHEET + '» и нажмите <b>2️⃣ Снять по выделенным</b>: остальные не трогаются.</li>');
  h.push('<li>Долгий прогон идёт этапами в облаке: окно можно закрыть, книгу тоже. Ход — <b>📊 Что сейчас происходит</b>.</li></ol>');

  h.push('<h3>Лист «' + POS_ART_SHEET + '» — что заполняете вы</h3>');
  h.push('<table><tr><th>Колонка</th><th>Что писать</th></tr>' +
    '<tr><td>' + POS_ART_HEADER[0] + '</td><td>артикул (nmID) карточки своего кабинета</td></tr>' +
    '<tr><td>' + POS_ART_HEADER[1] + '</td><td>пусто или «да» — в работе; «нет» — не снимать (история остаётся)</td></tr>' +
    '<tr><td>' + POS_ART_HEADER[2] + '</td><td>необязательно: запросы, которых нет в отчёте WB, через «;» — например, под новую карточку</td></tr></table>' +
    '<div class="muted">Остальные колонки листа заполняет книга. Свои колонки добавлять можно — книга ищет колонки по заголовку.</div>');

  h.push('<h3>Что где лежит</h3>');
  h.push('<table><tr><th>Лист</th><th>Что в нём</th></tr>' +
    '<tr><td>' + POS_SHEET + '</td><td>последний замер: строка = артикул + запрос. Сдвиги ▲▼ — к прошлому замеру</td></tr>' +
    '<tr><td>' + POS_HIST_ORG_SHEET + '</td><td>место в органике по дням: строка = артикул + запрос, колонка = день, новый день слева</td></tr>' +
    '<tr><td>' + POS_HIST_WB_SHEET + '</td><td>средняя позиция по данным WB за каждый вчерашний день</td></tr>' +
    '<tr><td>' + POS_JAM_SHEET + '</td><td>сырой отчёт WB по запросам карточек (обновляется каждым прогоном)</td></tr>' +
    '<tr><td>' + POS_QUEUE_SHEET + ', ' + POS_LOG_SHEET + '</td><td>служебные: очередь запросов текущего прогона и журнал прогонов</td></tr></table>');

  h.push('<h3>Как читать цифры</h3><ul>');
  h.push('<li><b>Органика, место</b> — место карточки в публичной выдаче WB по Москве <b>без рекламы</b>. ' +
    '«&gt;100» — карточки нет в проверенной глубине (глубина — «' + POS_KEYS_SHEET + '» B7, страниц по 100). ' +
    '«нет данных» — выдача не ответила; прошлые дни в истории при этом не затираются. С 22.09.2026 сайт WB закрыт ' +
    'для облака антиботом: если в «' + POS_KEYS_SHEET + '» B10–B12 указан хаб сбора, органику собирает расширение ' +
    'в браузере менеджера, а книга сама забирает итог — ничего дополнительно нажимать в этих листах не нужно.</li>');
  h.push('<li><b>WB позиция вчера</b> — средняя позиция карточки по запросу за вчера по данным самого WB: ' +
    '<b>с рекламой</b>, по всем регионам и показам. Если вы крутите рекламу, эта цифра обычно лучше органики — ' +
    'её и сравнивайте с тем, что видите на сайте.</li>');
  h.push('<li><b>Группа</b>: ВЧ — от ' + POS_FREQ_HIGH + ' запросов за 30 дней, СЧ — от ' + POS_FREQ_MID + ', НЧ — меньше; ' +
    '«свой» — запрос из вашей колонки, частотности у него нет.</li>');
  h.push('<li><b>Наших заказов</b> — заказы именно этой карточки по запросу. Заказов всех продавцов по запросу ' +
    'WB через API не отдаёт; спрос показывает частотность.</li>');
  h.push('<li>В отчёт WB попадает до ' + 30 + ' запросов на карточку (лучшие по заказам за 30 дней); ' +
    'число — «' + POS_KEYS_SHEET + '» B8.</li></ul>');

  h.push('<div class="warn"><b>Место «как на сайте» с рекламой</b> из облака снять нельзя: сайт WB закрыт от ' +
    'автоматических запросов. Нужна точечная проверка по артикулу — попросите Клода: «Позиции &lt;артикул&gt;».</div>');

  h.push('<h3>Если что-то пошло не так</h3><ol>');
  h.push('<li>Откройте <b>📊 Что сейчас происходит</b> — там причина и одно действие.</li>');
  h.push('<li>«WB просит подождать» — лимит кабинета занят другими сервисами; прогон продолжится сам. Повторяется ' +
    'каждый день — выпустите отдельный токен под книгу.</li>');
  h.push('<li>Прогон молчит дольше 30 минут — <b>🛠 → 🧹 Сбросить зависший прогон</b> и 1️⃣ заново. Собранное не пропадёт.</li>');
  h.push('<li>У артикула «в отчёте WB нет запросов» — карточка новая, без показов, или она не из кабинета этого токена. ' +
    'Впишите свои запросы в третью колонку.</li></ol>');

  h.push('<div class="muted">' + htmlEsc_(version || '') + '</div>');
  var html = dlgCss_() + h.join('');
  return { html: html, text: posStrip_(h.join('')) };
}

/** 📊 Что сейчас происходит — состояние и ОДНО действие. */
function posStatus(version) {
  var cfg = null, cfgError = '';
  try { cfg = posCfg_(true); } catch (e) { cfgError = String(e.message || e); }
  var state = posStateLoad_();
  var last = null;
  try { last = JSON.parse(PropertiesService.getScriptProperties().getProperty(POS_LAST_KEY) || 'null'); } catch (e2) { last = null; }
  var articles = 0;
  try { articles = posReadArticles_(null).length; } catch (e3) { articles = 0; }
  var daily = posDailyInstalled_();

  var counts = { wait: 0, done: 0, dead: 0, total: 0 };
  if (posIsActive_(state) && state.phase !== 'jam') {
    try {
      var q = posQueueRead_();
      counts.total = q.length;
      for (var i = 0; i < q.length; i++) {
        if (q[i].status === 'готово') counts.done++; else if (q[i].status === 'нет ответа') counts.dead++; else counts.wait++;
      }
    } catch (e4) { /* очередь ещё не построена */ }
  }

  var action;
  if (cfgError) action = cfgError;
  else if (!cfg.token) action = 'Впишите токен WB в «' + POS_KEYS_SHEET + '» B2 и нажмите «🔌 Проверка связи».';
  else if (!articles) action = 'Впишите артикулы WB в первую колонку листа «' + POS_ART_SHEET + '» и нажмите 1️⃣.';
  else if (posIsStale_(state)) action = 'Прогон молчит дольше 30 минут: «🛠 Ручной режим → 🧹 Сбросить зависший прогон», затем 1️⃣.';
  else if (posIsActive_(state)) action = 'Идёт работа в облаке — ничего делать не нужно. Книгу можно закрыть.';
  else if (state && state.phase === 'failed') action = 'Прошлый прогон остановлен: ' + state.error + ' Исправьте причину и нажмите 1️⃣.';
  else if (!daily) action = 'Включите автопрогон: «🛠 Ручной режим → ⏰ Включить автопрогон».';
  else action = 'Ничего делать не нужно: следующий замер — завтра около ' + cfg.hour + ':00.';

  var h = [];
  h.push('<h2>📊 Позиции WB — что сейчас происходит</h2>');
  h.push('<div class="act">Сейчас от вас: ' + htmlEsc_(action) + '</div>');
  h.push('<table>');
  if (posIsActive_(state)) {
    h.push('<tr><th>Прогон</th><td>' + htmlEsc_(state.id) + ' · ' + htmlEsc_(state.who) + '</td></tr>');
    h.push('<tr><th>Этап</th><td>' + htmlEsc_(posPhaseName_(state.phase)) + ' (этапов пройдено: ' + state.stages + ')</td></tr>');
    h.push('<tr><th>Артикулов</th><td>' + state.nms.length + '</td></tr>');
    if (state.phase === 'jam') {
      h.push('<tr><th>Отчёт WB</th><td>пачек ' + state.jamChunk + ' из ' + Math.ceil(state.nms.length / POS_JAM_CHUNK) +
        (state.waits ? ', ожиданий лимита: ' + state.waits : '') + '</td></tr>');
    } else {
      h.push('<tr><th>Запросы органики</th><td>готово ' + counts.done + ' из ' + counts.total +
        (counts.dead ? ', без ответа ' + counts.dead : '') + ', ждёт ' + counts.wait + '</td></tr>');
    }
  } else {
    h.push('<tr><th>Прогон</th><td>сейчас не идёт</td></tr>');
  }
  if (last) {
    h.push('<tr><th>Последний замер</th><td>' + htmlEsc_(posSummaryText_(last, (cfg ? cfg.depth : 1) * POS_PAGE_SIZE)) + '</td></tr>');
  }
  h.push('<tr><th>Активных артикулов</th><td>' + articles + '</td></tr>');
  h.push('<tr><th>Автопрогон</th><td>' + (daily ? '<span class="ok">включён</span>, около ' + (cfg ? cfg.hour : 7) + ':00' :
    '<span class="red">выключен</span>') + '</td></tr>');
  h.push('</table>');
  h.push('<div class="muted">' + htmlEsc_(version || '') + '</div>');
  return { html: dlgCss_() + h.join(''), text: posStrip_(h.join('')) };
}

/** 🔌 Проверка связи — БЕЗ ретраев: все адреса одним fetchAll, код ответа и есть диагноз. */
function posCheckConnection() {
  var cfg = posCfg_(true);
  var reqs = [], names = [];
  function add(name, url, headers) {
    names.push(name);
    reqs.push({ url: url, muteHttpExceptions: true, headers: headers || { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  }
  if (cfg.token) add('WB «Аналитика» (токен)', POS_JAM_PING, { 'Authorization': cfg.token });
  for (var i = 0; i < POS_SEARCH_HOSTS.length; i++) {
    add('Выдача ' + POS_SEARCH_HOSTS[i], posSearchUrl_(POS_SEARCH_HOSTS[i], POS_SEARCH_VERSIONS[0], 'чехол', 1, cfg.dest));
  }
  add('Карточки ' + POS_CARD_HOSTS[0], 'https://' + POS_CARD_HOSTS[0] + '/cards/v4/detail?appType=1&curr=rub&dest=' + cfg.dest + '&spp=30&nm=1');
  var resp = [];
  try { resp = UrlFetchApp.fetchAll(reqs); } catch (e) { resp = []; }

  var h = [];
  h.push('<h2>🔌 Проверка связи</h2><table><tr><th>Что</th><th>Ответ</th><th>Диагноз</th></tr>');
  var info = cfg.token ? posTokenInfo_(cfg.token) : null;
  if (!cfg.token) {
    h.push('<tr><td>Токен WB</td><td>—</td><td class="red">нет: впишите в «' + POS_KEYS_SHEET + '» B2</td></tr>');
  } else if (!info) {
    h.push('<tr><td>Токен WB</td><td>—</td><td class="red">не похож на токен WB (не читается как JWT)</td></tr>');
  } else {
    var days = info.exp ? Math.floor((info.exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    h.push('<tr><td>Токен WB</td><td>продавец ' + htmlEsc_(info.seller) + '</td><td class="' + (days !== null && days < 14 ? 'red' : 'ok') + '">' +
      (info.exp ? 'действует до ' + htmlEsc_(posRu_(posIso_(info.exp))) + ' (' + days + ' дн.)' : 'срок не указан') +
      (info.test ? ' · ТЕСТОВЫЙ контур' : '') + '</td></tr>');
  }
  var searchOk = 0;
  for (var r = 0; r < names.length; r++) {
    var code = resp[r] ? resp[r].getResponseCode() : 0, verdict, cls = 'ok';
    if (names[r].indexOf('Аналитика') >= 0) {
      if (code === 200) verdict = 'токен принят';
      else if (code === 401) { verdict = 'токен не принят — перевыпустите'; cls = 'red'; }
      else if (code === 429) { verdict = 'лимит занят другими сервисами — токен при этом рабочий'; cls = 'ok'; }
      else { verdict = 'неожиданный ответ'; cls = 'red'; }
    } else if (names[r].indexOf('Выдача') >= 0) {
      var good = false;
      if (code === 200) { try { good = !!JSON.parse(resp[r].getContentText()).products; } catch (e2) { good = false; } }
      if (good) { verdict = 'отвечает'; searchOk++; }
      else { verdict = code === 200 ? 'ответ без товаров (чужой конверт)' : 'закрыт лимитером — прогон возьмёт другой хост'; cls = 'muted'; }
    } else {
      verdict = code === 200 ? 'отвечает' : 'не отвечает — названия артикулов не подтянутся'; cls = code === 200 ? 'ok' : 'red';
    }
    h.push('<tr><td>' + htmlEsc_(names[r]) + '</td><td>' + (code || 'нет ответа') + '</td><td class="' + cls + '">' + htmlEsc_(verdict) + '</td></tr>');
  }
  h.push('</table>');
  if (!searchOk) h.push('<div class="warn">Ни один хост выдачи сейчас не ответил. Это лимитер WB, а не поломка: повторите через 5–10 минут.</div>');
  h.push('<div class="box"><b>Право записи:</b> не требуется. Книга ничего не пишет во внешние системы — только читает WB ' +
    'и заполняет свои листы. Подписка Джем проверяется первым прогоном: без неё отчёт WB ответит 403, и книга скажет об этом словами.</div>');
  return { html: dlgCss_() + h.join(''), text: posStrip_(h.join('')) };
}


/* ==================== 08_оповещения.js ==================== */

/* Оповещения в чат: шапка → тело → действие. Без токена бота модуль молчит — это не ошибка. */

function posNotify_(head, body, action) {
  var cfg;
  try { cfg = posCfg_(true); } catch (e) { return false; }
  if (!cfg.botToken || !cfg.chat) return false;
  var text = head + (cfg.cabinet ? ' · ' + cfg.cabinet : '') + '\n\n' + body + '\n\n' + action;
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.botToken + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: cfg.chat, text: text.slice(0, 3900), disable_web_page_preview: true })
    });
    return resp.getResponseCode() === 200;
  } catch (e2) {
    return false;      // сырой ответ API в чат и в окно не уходит; сбой оповещения прогон не роняет
  }
}


/* ==================== 99_экспорт.js ==================== */

/* Экспорт для тестов в Node. В Apps Script `module` не существует, ветка не выполняется. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    posCfg_: posCfg_, posGroup_: posGroup_, posKey_: posKey_, posRu_: posRu_, posTokenInfo_: posTokenInfo_,
    posJamMerge_: posJamMerge_, posJamCall_: posJamCall_, posJamChunk_: posJamChunk_, posCards_: posCards_,
    posSearchPage_: posSearchPage_, posLocate_: posLocate_, posSearchUrl_: posSearchUrl_,
    posResetSearch_: function () { POS_SEARCH_ORDER = null; POS_SEARCH_FAILS = {}; POS_SEARCH_STATS = { requests: 0, failures: 0, skipped: 0 }; },
    posSearchStats_: function () { return POS_SEARCH_STATS; },
    posReadArticles_: posReadArticles_, posArticlesMark_: posArticlesMark_, posJamAppend_: posJamAppend_, posJamRead_: posJamRead_,
    posQueueBuild_: posQueueBuild_, posQueueRead_: posQueueRead_, posQueueFlush_: posQueueFlush_,
    posPrevPositions_: posPrevPositions_, posShift_: posShift_, posWritePositions_: posWritePositions_,
    posHistoryWrite_: posHistoryWrite_, posLog_: posLog_,
    posStart_: posStart_, posStep_: posStep_, posFinalize_: posFinalize_, posStateLoad_: posStateLoad_,
    posIsActive_: posIsActive_, posIsStale_: posIsStale_,
    posSetT0_: function (t) { POS_T0 = t; },
    posSetPause_: function (ms) { POS_SEARCH_PAUSE_MS = ms; },
    posRunAll: posRunAll, posRunSelected: posRunSelected, posDailyTrigger: posDailyTrigger, continueQueue: continueQueue,
    posInstallDailyTrigger: posInstallDailyTrigger, posRemoveDailyTrigger: posRemoveDailyTrigger, posResetRun: posResetRun,
    upgradeSheets: upgradeSheets, posHelp: posHelp, posStatus: posStatus, posCheckConnection: posCheckConnection,
    POS_HEADER: POS_HEADER, POS_ART_HEADER: POS_ART_HEADER, POS_JAM_HEADER: POS_JAM_HEADER, POS_QUEUE_HEADER: POS_QUEUE_HEADER,
    POS_KEYS_LABELS: POS_KEYS_LABELS, POS_STAGE_BUDGET_MS: POS_STAGE_BUDGET_MS
  };
}
