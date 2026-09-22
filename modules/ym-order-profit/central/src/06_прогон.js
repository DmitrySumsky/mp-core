/* ПРОГОН: очередь по кабинетам, автопрогон, кнопки меню.
 *
 * Очередь — свойство YOP_QUEUE: { mode: 'full' | 'unit', day, cabs: [кого докачать], unitCabs: [чьи цены
 * и остатки взять], started, touched, errors }. Этап работает до 4,5 минуты и ставит продолжение
 * (continueQueue) через минуту. По очереди прогон восстанавливается после любого сбоя.
 *   full — 1️⃣ и автопрогон: заказы и отчёт услуг → цены и остатки → листы (по заказам, по дням, юнитка);
 *   unit — 2️⃣: только цены и остатки → лист юнитки.
 */

function yopQueueLoad_() { return JSON.parse(yopProps_().getProperty('YOP_QUEUE') || 'null'); }

function yopQueueSave_(q) {
  q.touched = new Date().toISOString();
  yopProps_().setProperty('YOP_QUEUE', JSON.stringify(q));
}

function yopQueueStale_(q) { return !!q && Date.now() - new Date(q.touched || q.started).getTime() > YOP_STALE_MS; }

function yopDropTriggers_(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
  });
}

function yopScheduleContinue_(q, why) {
  yopQueueSave_(q);
  yopDropTriggers_('continueQueue');
  ScriptApp.newTrigger('continueQueue').timeBased().after(60 * 1000).create();
  yopLog_(why + ' — продолжение через минуту');
}

function yopToast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'ЧП ЯМ', 8); } catch (e) {}
}

/** Кабинеты для прогона: включённые в настройках и с ключом. Без ключа — в журнал, не ошибка. */
function yopRunnable_() {
  var keys = yopKeys_(), out = [];
  yopSettings_().cabinets.forEach(function (c) {
    if (keys[c.name]) out.push(c.name);
    else yopLog_(c.name + ': пропущен — нет строки на листе «' + YOP_SH.keys + '»');
  });
  return out;
}

function yopStart_(mode) {
  var q = yopQueueLoad_();
  if (q && !yopQueueStale_(q)) {
    yopToast_('Прогон уже идёт (начат ' + Utilities.formatDate(new Date(q.started), 'Europe/Moscow', 'HH:mm') +
      '). Ход — «📊 Что сейчас происходит».');
    return false;
  }
  if (q) yopLog_('предыдущий прогон завис — начат заново');
  var cabs = yopRunnable_();
  q = { mode: mode, day: yopYesterday_(), cabs: mode === 'full' ? cabs.slice() : [], unitCabs: cabs.slice(),
    started: new Date().toISOString(), errors: [] };
  yopQueueSave_(q);
  yopLog_('старт (' + (mode === 'full' ? 'полный прогон' : 'юнитка') + '): день ' + yopRu_(q.day) + ', кабинетов ' + cabs.length);
  return true;
}

/** 1️⃣ Посчитать за вчера: докачать всё по вчера, цены и остатки, все листы. */
function yopRunYesterday() {
  if (!yopStart_('full')) return;
  yopToast_('Прогон запущен. Крупные кабинеты идут несколько минут, прогон продолжит сам себя.');
  continueQueue();
}

/** 2️⃣ Обновить юнитку: свежие цены и остатки, лист юнитки. Заказы и отчёт услуг не качаются. */
function yopRefreshUnit() {
  if (!yopStart_('unit')) return;
  yopToast_('Обновляю цены и остатки по кабинетам.');
  continueQueue();
}

/** Автопрогон (триггер книги каждое утро): то же, что 1️⃣. Завис прошлый — начинает заново. */
function yopDailyTrigger() {
  if (yopStart_('full')) continueQueue();
}

/** Шаг очереди. Имя не переименовывать: на нём висят установленные триггеры продолжения. */
function continueQueue() {
  var t0 = Date.now();
  yopDropTriggers_('continueQueue');
  var q = yopQueueLoad_();
  if (!q) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { yopLog_('шаг очереди уже идёт — этот запуск пропущен'); return; }
  try {
    var keys = yopKeys_();
    while (q.cabs.length) {
      if (Date.now() - t0 > YOP_START_LIMIT_MS) return yopScheduleContinue_(q, 'сбор: осталось ' + q.cabs.join(', '));
      var name = q.cabs[0], complete = true;
      try {
        complete = yopCollectCabinet_(name, keys[name], q.day, t0);
      } catch (e) {
        yopLog_(name + ': ОШИБКА ' + e.message);
        q.errors.push(name + ': ' + String(e.message).slice(0, 160));
      }
      if (!complete) return yopScheduleContinue_(q, name + ': не догнан за шаг');
      q.cabs.shift();
      yopQueueSave_(q);
    }
    while (q.unitCabs.length) {
      if (Date.now() - t0 > YOP_START_LIMIT_MS) return yopScheduleContinue_(q, 'цены и остатки: осталось ' + q.unitCabs.join(', '));
      var u = q.unitCabs[0];
      try {
        yopCollectUnitData_(u, keys[u]);
      } catch (e) {
        yopLog_(u + ': цены и остатки — ОШИБКА ' + e.message);
        q.errors.push(u + ' (юнитка): ' + String(e.message).slice(0, 160));
      }
      q.unitCabs.shift();
      yopQueueSave_(q);
    }
    if (Date.now() - t0 > 2 * 60 * 1000) return yopScheduleContinue_(q, 'сбор закончен, листы — отдельным шагом');
    var all = q.mode === 'full' ? yopWriteDay_(q.day) : yopForecastAll_(q.day);
    var n = yopWriteUnit_(q.day, all);
    yopProps_().deleteProperty('YOP_QUEUE');
    yopProps_().setProperty('YOP_LAST_DONE', JSON.stringify({ mode: q.mode, day: q.day, at: new Date().toISOString(),
      errors: q.errors, minutes: Math.round((Date.now() - new Date(q.started).getTime()) / 60000) }));
    yopLog_('готово: ' + (q.mode === 'full' ? 'листы за ' + yopRu_(q.day) + ', ' : '') + 'юнитка — артикулов ' + n +
      (q.errors.length ? '; ошибок ' + q.errors.length : ''));
    yopToast_('Готово' + (q.errors.length ? ', есть ошибки — «📊 Что сейчас происходит»' : '') + '.');
  } finally {
    lock.releaseLock();
  }
}

/** 🛠 Пересчитать листы по уже скачанным данным (поменяли себес, тариф вручную, коэффициенты модели). */
function yopRecalcSheets() {
  var day = yopYesterday_(), all = yopWriteDay_(day);
  yopWriteUnit_(day, all);
  yopToast_('Листы пересчитаны за ' + yopRu_(day) + ' без запросов в Маркет.');
}

/** 🛠 Пересобрать «📈 по дням» за 21 день из кэша (прошлые дни прогнозом по данным кэша). */
function yopRebuildHistory() {
  var day = yopYesterday_(), all = yopRebuildDays_(day, YOP_REBUILD_DAYS);
  yopWriteUnit_(day, all);
  yopToast_('История за ' + YOP_REBUILD_DAYS + ' дней пересобрана.');
}

/** 🛠 Сбросить зависший прогон: очередь и триггеры продолжения. Скачанное в кэше остаётся. */
function yopResetRun() {
  yopDropTriggers_('continueQueue');
  yopProps_().deleteProperty('YOP_QUEUE');
  yopLog_('прогон сброшен вручную');
  yopToast_('Прогон сброшен. Скачанные данные на месте — жмите 1️⃣.');
}

function yopAutoOn_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'yopDailyTrigger'; });
}

/** ⏰ Автопрогон каждое утро около 07:00 по Москве. */
function yopTriggerOn() {
  yopDropTriggers_('yopDailyTrigger');
  ScriptApp.newTrigger('yopDailyTrigger').timeBased().everyDays(1).atHour(7).nearMinute(10).inTimezone('Europe/Moscow').create();
  yopLog_('автопрогон включён');
  yopToast_('Автопрогон включён: каждое утро около 07:10 по Москве.');
}

function yopTriggerOff() {
  yopDropTriggers_('yopDailyTrigger');
  yopLog_('автопрогон выключен');
  yopToast_('Автопрогон выключен.');
}