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
