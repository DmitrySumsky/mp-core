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
