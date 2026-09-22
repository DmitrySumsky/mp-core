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
