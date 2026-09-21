/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — СКРИПТ КНИГИ v1.0.0 — 22.09.2026
 *
 * Что делает: каждое утро считает, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня по каждому
 * кабинету Маркета, и пишет это на листы «🧾 ЧП ЯМ по заказам» (вчера по артикулам, формулами)
 * и «📈 ЧП ЯМ по дням» (история: новый день добавляется сверху, прошлые дни не меняются).
 *
 * Файлы:
 *   1_меню.js   — меню, запуск, очередь по кабинетам, автопрогон
 *   2_сбор.js   — что и как берётся из Маркета
 *   3_модель.js — ВСЯ ЛОГИКА РАСЧЁТА (коэффициенты и прогноз) — начинать читать отсюда
 *   4_листы.js  — запись листов книги
 *   5_кэш.js    — где хранится история заказов и удержаний (файлы на Диске рядом с книгой)
 *
 * ИСТОРИЯ ВЕРСИЙ
 *
 * v1.0.0 — 22.09.2026
 *   МОДЕЛЬ ПЕРЕЕХАЛА ИЗ ЛОКАЛЬНОГО ПРОГОНА В СКРИПТ КНИГИ — просьба менеджера ЯМ посмотреть логику
 *   в Apps Script и ответ по демо (налог как в юнитке; реклама за показы, хранение и подписка —
 *   расходами дня по дате начисления; HealthPro — добавить), 22.09.2026.
 *   • сбор по дням: заказы, созданные вчера, + заказы, у которых вчера сменился статус
 *     (stats/orders, dateFrom/updateFrom), + отчёт «Стоимость услуг» за вчерашние начисления;
 *     кабинеты идут очередью, прогон продолжает сам себя, если не уложился в 4,5 минуты;
 *   • модель — «3_модель.js», один в один с проверенной версией на Python (крупнейший кабинет: 16.09
 *     −10 648 ₽, 20.09 +22 404 ₽ до расходов дня); прогон записи листов в Node на заглушках — tests/run_gas_stub.js;
 *   • налог — минус 25 % от маржи, как в юнитке; реклама за показы, хранение, подписка и прочие
 *     начисления без заказа — отдельными расходами дня, по артикулам не делятся;
 *   • кабинеты и листы юниток — на листе «⚙️ ЧП ЯМ настройки», ключи — лист «API-ключи».
 */

var YOP_VERSION = 'v1.0.0';
var YOP_TIME_LIMIT_MS = 4.5 * 60 * 1000;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 ЧП ЯМ по заказам')
    .addItem('1️⃣ Посчитать за вчера', 'yopRunYesterday')
    .addItem('2️⃣ Пересчитать листы без Маркета', 'yopRecalcSheets')
    .addItem('3️⃣ Пересобрать историю за 14 дней', 'yopRebuildHistory')
    .addSeparator()
    .addItem('⏰ Включить автопрогон (каждое утро)', 'yopTriggerOn')
    .addItem('🔕 Выключить автопрогон', 'yopTriggerOff')
    .addSeparator()
    .addItem('📊 Что сейчас происходит', 'yopShowStatus')
    .addItem('🔌 Проверка связи', 'yopCheckConnection')
    .addItem('📖 Как считается', 'yopShowHelp')
    .addToUi();
}

function yopYesterday_() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
}

function yopProps_() { return PropertiesService.getScriptProperties(); }

function yopLog_(msg) {
  var line = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM HH:mm:ss') + ' ' + msg;
  Logger.log(line);
  var p = yopProps_(), log = (p.getProperty('YOP_LOG') || '').split('\n').filter(String);
  log.push(line);
  p.setProperty('YOP_LOG', log.slice(-40).join('\n'));
}

/** Меню 1️⃣ и автопрогон: докачать всё по вчера включительно и пересчитать листы. */
function yopRunYesterday() {
  var p = yopProps_();
  var cabs = yopSettings_().cabinets.map(function (c) { return c.name; });
  p.setProperty('YOP_QUEUE', JSON.stringify({ day: yopYesterday_(), cabs: cabs, started: new Date().toISOString() }));
  yopLog_('старт: день ' + yopYesterday_() + ', кабинетов ' + cabs.length);
  yopContinue();
}

/** Шаг очереди: кабинеты по одному, пока хватает времени; остаток — новым запуском через минуту. */
function yopContinue() {
  var t0 = Date.now(), p = yopProps_();
  yopDropTriggers_('yopContinue');
  var q = JSON.parse(p.getProperty('YOP_QUEUE') || 'null');
  if (!q) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { yopLog_('прогон уже идёт — этот запуск пропущен'); return; }
  try {
    var keys = yopKeys_(), settings = yopSettings_();
    while (q.cabs.length) {
      if (Date.now() - t0 > YOP_TIME_LIMIT_MS) {
        p.setProperty('YOP_QUEUE', JSON.stringify(q));
        ScriptApp.newTrigger('yopContinue').timeBased().after(60 * 1000).create();
        yopLog_('не уложились — продолжение через минуту, осталось: ' + q.cabs.join(', '));
        return;
      }
      var name = q.cabs[0], complete = true;
      try {
        complete = yopCollectCabinet_(name, keys[name], q.day, settings, t0);
      } catch (e) {
        yopLog_(name + ': ОШИБКА ' + e.message);
      }
      if (!complete) continue;                 // кончилось время посреди кабинета — он остаётся первым в очереди
      q.cabs.shift();
      p.setProperty('YOP_QUEUE', JSON.stringify(q));
    }
    if (Date.now() - t0 > 3 * 60 * 1000) {      // запись листов — отдельным шагом, чтобы не упереться в 6 минут
      p.setProperty('YOP_QUEUE', JSON.stringify(q));
      ScriptApp.newTrigger('yopContinue').timeBased().after(60 * 1000).create();
      yopLog_('сбор закончен, листы запишутся через минуту');
      return;
    }
    p.deleteProperty('YOP_QUEUE');
    yopWriteDay_(q.day);
    yopLog_('готово: листы за ' + q.day + ' записаны');
  } finally {
    lock.releaseLock();
  }
}

/** Меню 2️⃣: пересчитать листы за вчера по уже скачанным данным (например, поменяли себес в юнитке). */
function yopRecalcSheets() {
  yopWriteDay_(yopYesterday_(), false);
  SpreadsheetApp.getActive().toast('Листы пересчитаны за ' + yopYesterday_(), 'ЧП ЯМ', 5);
}

/** Меню 3️⃣: заново собрать «📈 ЧП ЯМ по дням» за 14 дней по данным кэша. */
function yopRebuildHistory() {
  yopRebuildDays_(yopYesterday_(), 14);
  SpreadsheetApp.getActive().toast('История за 14 дней пересобрана', 'ЧП ЯМ', 5);
}

function yopDropTriggers_(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
  });
}

function yopTriggerOn() {
  yopDropTriggers_('yopRunYesterday');
  ScriptApp.newTrigger('yopRunYesterday').timeBased().everyDays(1).atHour(7).nearMinute(10).create();
  SpreadsheetApp.getUi().alert('Автопрогон включён: каждое утро около 07:10 по Москве.');
}

function yopTriggerOff() {
  yopDropTriggers_('yopRunYesterday');
  yopDropTriggers_('yopContinue');
  yopProps_().deleteProperty('YOP_QUEUE');
  SpreadsheetApp.getUi().alert('Автопрогон выключен.');
}

function yopShowStatus() {
  var p = yopProps_(), q = p.getProperty('YOP_QUEUE');
  var auto = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'yopRunYesterday'; });
  var text = 'Версия скрипта: ' + YOP_VERSION + '\nАвтопрогон: ' + (auto ? 'включён (≈07:10)' : 'выключен') +
    '\nСейчас: ' + (q ? 'идёт прогон, осталось ' + JSON.parse(q).cabs.join(', ') : 'прогона нет') +
    '\n\nПоследние события:\n' + (p.getProperty('YOP_LOG') || '—');
  SpreadsheetApp.getUi().alert(text);
}

/** Проверка связи: каждый ключ — один запрос к Маркету без повторов, и доступ к папке кэша. */
function yopCheckConnection() {
  var keys = yopKeys_(), lines = [];
  yopSettings_().cabinets.forEach(function (c) {
    var k = keys[c.name];
    if (!k) { lines.push('❌ ' + c.name + ': нет строки на листе «API-ключи»'); return; }
    var r = UrlFetchApp.fetch(YOP_BASE + '/campaigns/' + k.campaigns[0], {
      headers: { 'Api-Key': k.apiKey }, muteHttpExceptions: true });
    lines.push((r.getResponseCode() === 200 ? '✅ ' : '❌ ') + c.name + ': HTTP ' + r.getResponseCode());
  });
  try {
    lines.push('✅ папка кэша: ' + yopCacheFolder_().getName());
  } catch (e) {
    lines.push('❌ папка кэша: ' + e.message);
  }
  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function yopShowHelp() {
  SpreadsheetApp.getActive().getSheetByName(YOP_SH.help).activate();
}
