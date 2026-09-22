/* WB SHELF BROWSER — ХАБ СБОРА v1.0.1 — 22.09.2026 */
/*
 * v1.0.1 — 22.09.2026
 * ДИАГНОСТИКА ПОЛОК НЕ ДОЛЖНА ТРОГАТЬ КНИГИ — контуры с именем diag* хаб хранит,
 * но разнос по книгам для них не запускает.
 *
 * v1.0.0 — 22.09.2026
 * WB ЗАКРЫЛ ВИТРИНУ АНТИБОТОМ — полки и цены брендов с 22.09 собираются в Chrome
 * менеджера, по кнопке в книге. Хаб — почтовый ящик между облаком и браузером.
 *   • put_plan (облако) — план сбора контура: какие полки листать, что в них искать,
 *     по каким артикулам снять цены; get_plan (расширение) — забрать его.
 *   • start (расширение) — «сбор начат, кто»; status (кнопка в книге) — идёт ли сбор,
 *     когда был последний, кто собирал. Статус без ключа: в нём нет данных.
 *   • result (расширение) — итог сбора; хаб хранит его и сам запускает разнос по
 *     книгам (workflow browser-apply.yml); get_result (облако) — забрать итог.
 *   • Хранилище — листы этой же книги («Планы», «Итоги», «Журнал»): JSON режется на
 *     куски по 45 000 символов (в ячейке не больше 50 000).
 *
 * Шаблон: __HUB_KEY__, __GH_TOKEN__, __BOOK_ID__ подставляет tools/deploy_hub.py при
 * заливке — в репозитории файл без секретов.
 */

var HUB_KEY = '__HUB_KEY__';
var GH_TOKEN = '__GH_TOKEN__';
var BOOK_ID = '__BOOK_ID__';
var REPO = 'DmitrySumsky/wb-shelf-positions';
var APPLY_WORKFLOW = 'browser-apply.yml';
var CHUNK = 45000;
var SHEET_PLANS = 'Планы';
var SHEET_RESULTS = 'Итоги';
var SHEET_LOG = 'Журнал';
var STALE_RUN_MIN = 90;      // «идёт сбор» дольше полутора часов = брошенная вкладка

function book_() { return SpreadsheetApp.openById(BOOK_ID); }

function sheet_(name, head) {
  var b = book_();
  var sh = b.getSheetByName(name);
  if (!sh) {
    sh = b.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function now_() {
  return Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd HH:mm:ss');
}

function log_(contour, event, who, detail) {
  sheet_(SHEET_LOG, ['Когда (МСК)', 'Контур', 'Событие', 'Кто', 'Подробности'])
    .appendRow([now_(), contour, event, who || '', String(detail || '').slice(0, 1000)]);
}

/** Строка контура в листе-хранилище: [контур, когда, кто, куски JSON...]. */
function rowOf_(sh, contour) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === contour) return i + 2;
  return 0;
}

function put_(name, contour, who, text) {
  var sh = sheet_(name, ['Контур', 'Когда (МСК)', 'Кто', 'Данные (JSON кусками)']);
  var row = rowOf_(sh, contour) || sh.getLastRow() + 1;
  var parts = [];
  for (var i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
  var width = Math.max(sh.getLastColumn(), 3 + parts.length);
  var line = [contour, now_(), who || ''].concat(parts);
  while (line.length < width) line.push('');
  // Куски пишутся ТЕКСТОМ: иначе Sheets попробует понять JSON как формулу/число.
  sh.getRange(row, 1, 1, width).setNumberFormat('@').setValues([line]);
}

function get_(name, contour) {
  var sh = book_().getSheetByName(name);
  if (!sh) return null;
  var row = rowOf_(sh, contour);
  if (!row) return null;
  var line = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  var text = line.slice(3).join('');
  return {at: String(line[1]), who: String(line[2]), data: text ? JSON.parse(text) : null};
}

function state_() { return PropertiesService.getScriptProperties(); }

function status_(contour) {
  var res = get_(SHEET_RESULTS, contour);
  var plan = get_(SHEET_PLANS, contour);
  var run = state_().getProperty('run:' + contour);
  var running = null;
  if (run) {
    running = JSON.parse(run);
    var ageMin = (Date.now() - running.ts) / 60000;
    if (ageMin > STALE_RUN_MIN) running = null;
  }
  return {
    ok: true,
    contour: contour,
    last_at: res ? res.at : '',
    last_who: res ? res.who : '',
    plan_at: plan ? plan.at : '',
    plan_title: plan && plan.data ? plan.data.title : '',
    running: running
  };
}

function dispatch_(contour, who) {
  var url = 'https://api.github.com/repos/' + REPO + '/actions/workflows/' +
            APPLY_WORKFLOW + '/dispatches';
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: {Authorization: 'Bearer ' + GH_TOKEN, Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28'},
    payload: JSON.stringify({ref: 'main', inputs: {contour: contour, who: who || ''}}),
    muteHttpExceptions: true
  });
  return r.getResponseCode();
}

function doGet(e) {
  var p = e.parameter || {};
  var contour = String(p.contour || 'brands');
  try {
    if (p.action === 'status') return json_(status_(contour));
    if (p.key !== HUB_KEY) return json_({ok: false, error: 'неверный ключ'});
    if (p.action === 'get_plan') {
      var plan = get_(SHEET_PLANS, contour);
      if (!plan || !plan.data) return json_({ok: false, error: 'плана для контура ' + contour + ' ещё нет'});
      return json_({ok: true, plan: plan.data, at: plan.at});
    }
    if (p.action === 'get_result') {
      var res = get_(SHEET_RESULTS, contour);
      if (!res || !res.data) return json_({ok: false, error: 'итога для контура ' + contour + ' нет'});
      res.data.who = res.data.who || res.who;
      return json_({ok: true, result: res.data, at: res.at});
    }
    return json_({ok: false, error: 'неизвестное действие ' + p.action});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  }
}

function doPost(e) {
  var p = e.parameter || {};
  var contour = String(p.contour || 'brands');
  var lock = LockService.getScriptLock();
  try {
    if (p.key !== HUB_KEY) return json_({ok: false, error: 'неверный ключ'});
    var body = e.postData && e.postData.contents ? e.postData.contents : '';
    lock.waitLock(20000);
    if (p.action === 'put_plan') {
      put_(SHEET_PLANS, contour, 'облако', body);
      log_(contour, 'план обновлён', 'облако', body.length + ' символов');
      return json_({ok: true, size: body.length});
    }
    if (p.action === 'start') {
      var s = JSON.parse(body || '{}');
      state_().setProperty('run:' + contour, JSON.stringify({who: s.who || '', ts: Date.now(),
        at: now_()}));
      log_(contour, 'сбор начат', s.who, s.note || '');
      return json_({ok: true});
    }
    if (p.action === 'result') {
      var rec = JSON.parse(body);
      var who = rec.who || '';
      put_(SHEET_RESULTS, contour, who, body);
      state_().deleteProperty('run:' + contour);
      var code = contour.indexOf('diag') === 0 ? 204 : dispatch_(contour, who);
      var n = rec.shelves ? Object.keys(rec.shelves).length : 0;
      var c = rec.cards ? Object.keys(rec.cards).length : 0;
      log_(contour, 'итог получен', who, 'полок ' + n + ', карточек ' + c +
           '; разнос по книгам: GitHub ' + code);
      return json_({ok: code === 204, dispatched: code,
                    error: code === 204 ? '' : 'GitHub не принял запуск разноса: ' + code});
    }
    if (p.action === 'abort') {
      var a = JSON.parse(body || '{}');
      state_().deleteProperty('run:' + contour);
      log_(contour, 'сбор прерван', a.who, a.reason || '');
      return json_({ok: true});
    }
    return json_({ok: false, error: 'неизвестное действие ' + p.action});
  } catch (err) {
    return json_({ok: false, error: String(err)});
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/** Разовая настройка из редактора: заводит листы и выдаёт разрешения скрипту. */
function setup() {
  sheet_(SHEET_PLANS, ['Контур', 'Когда (МСК)', 'Кто', 'Данные (JSON кусками)']);
  sheet_(SHEET_RESULTS, ['Контур', 'Когда (МСК)', 'Кто', 'Данные (JSON кусками)']);
  sheet_(SHEET_LOG, ['Когда (МСК)', 'Контур', 'Событие', 'Кто', 'Подробности']);
  UrlFetchApp.fetch('https://api.github.com/zen', {muteHttpExceptions: true});
  log_('-', 'хаб настроен', Session.getEffectiveUser().getEmail(), '');
}
