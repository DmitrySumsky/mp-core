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
