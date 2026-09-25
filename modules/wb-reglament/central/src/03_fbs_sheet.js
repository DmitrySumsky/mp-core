/* WB СКЛАДЫ FBS — ОДИН ЛИСТ: СПРОС, ОСТАТКИ И РАСКЛАДКА v2.2.0 — 27.08.2026

   ИСТОРИЯ ВЕРСИЙ

   v2.2.0 — 27.08.2026. МИНУС В КОЛОНКЕ D: ТОВАР МОЖНО НЕ ТОЛЬКО ДОБАВИТЬ, НО И УБАВИТЬ.
   Задача владельца 27.08.2026: «нужно чтобы можно было не только добавлять товар на
   виртуальные склады FBS, но ещё и убавлять количество — например числом с минусом
   в столбце D». До этого вычесть было нечем: отрицательное число в «Привезли (+)»
   молча обрезалось до нуля, а единственный способ уменьшить пул — пересчитать весь
   остаток товара и вписать его в «Факт на FBS (=)».
   • колонка D называется «Привезли (±)»: плюс прибавляет к пулу, минус вычитает;
   • СТАРЫЙ ЗАГОЛОВОК ЧИТАЕТСЯ ТОЖЕ. Ручные колонки ищутся по заголовку, и первый
     прогон новой версии видит на боевом листе ещё старую шапку «Привезли (+)» —
     без алиаса вписанное вечером перемещение пропало бы. Список FBSD_HEAD_BROUGHT_ALIASES;
   • минус не гасит «Ждёт перемещения»: долг закрывает факт перемещения НА склад,
     вывоз со склада им не является (см. fbs_math.gs v1.4.0);
   • «Факт на FBS (=)» по-прежнему главнее «Привезли»: заполнили факт — минус не смотрим.


   v2.1.0 — 26.08.2026. ОФОРМЛЕНИЕ ЛИСТА ТЕПЕРЬ ДЕЛАЕТ СКРИПТ, А НЕ ЧЕЛОВЕК.
   Задача владельца: «сделай правильное оформление границ блоков складов, заливку ячеек
   через условное форматирование, чтобы оформление в целом было красивое».
   Почему это переворот прежнего решения: до v2.1.0 скрипт СПЕЦИАЛЬНО не трогал цвета —
   раскраску настраивали руками, и её надо было сохранить. Но города идут по числу
   заказов и меняются местами каждый прогон: правило, повешенное руками на колонку,
   назавтра красит другой город. Значит владеть оформлением должен тот, кто знает порядок
   колонок, — сам скрипт.
   • ВНИМАНИЕ: ручные правила условного форматирования на этом листе БОЛЬШЕ НЕ ЖИВУТ.
     Каждый прогон снимает все правила и ставит свои. Нужен свой цвет — правится в коде
     (константы FBSD_COLOR и пороги в fbsBuildFormatRules_), а не в книге;
   • границы: блок каждого города отделён вертикальной чертой, служебный блок и шапка —
     чертой потолще, внутри данных светлые горизонтальные линии на всю ширину листа
     (на 97 колонках без них строка теряется). Сетка книги скрыта — рисуют границы;
   • «Остаток <город> (дней)» красится условным форматированием от горизонта:
     нет заказов — серый, меньше половины горизонта — красный, меньше горизонта — жёлтый,
     от горизонта — зелёный, от двух горизонтов — голубой (перезапас). Пороги едут за
     настройкой в строке 1: поменяли горизонт на 21 — перекрасится само;
   • ноль в «дней» больше не читается как «запас на ноль дней»: правило «нет заказов»
     стоит ПЕРВЫМ и красит такую ячейку серым, а не красным (грабля из v1.2.4);
   • формулы правил написаны через умножение условий, а не через AND: локаль книги
     решает, каким разделителем разделены аргументы функции, и русская книга отвергает
     `=AND(a,b)` прямо при установке правила (проверено на Sheets API 26.08.2026);
   • «План <город>» красится по направлению: зелёный — довезти, оранжевый — убрать,
     совпало — без заливки. Отдельные колонки «Δ» так и не нужны;
   • шапка блока города подкрашена через один, чтобы четвёрки колонок читались как блоки;
   • числовые форматы, ширины колонок, выравнивание и высота шапки — тоже за скриптом.
   Правил условного форматирования выходит 7 на город плюс 6 служебных (у кабинета А 153,
   у кабинета Б 139). Потолок листа — 500, проверено запросом к Sheets API 26.08.2026.

   v2.0.0 — 26.08.2026. ДВА ЛИСТА И ДВА СКРИПТА СЛИЛИСЬ В ОДИН ЛИСТ.
   Задача владельца 26.08.2026: «объединить функционал листа WB Склады FBS
   (Регламент кабинета А) и листа Распределение FBS (Регламент кабинета Б), важно чтобы
   остался один лист WB Склады FBS».
   Было: «WB Склады FBS» (файл v1.2.4) показывал заказы и остатки по городам,
   «Распределение FBS» (файл fbs_main.gs v1.2.0) отдельно ходил в те же самые методы
   WB и считал раскладку на своём листе. Менеджер сверял два листа глазами, а книга
   дважды за прогон опрашивала один и тот же API.
   Стало:
   • один лист «WB Склады FBS» и один проход по API: склады → остатки → сборочные
     задания. Всё, что раньше жило на листе плана, встало в этот же лист;
   • блок города — ЧЕТЫРЕ колонки подряд: «Заказы <город> (5 дн)», «Остаток (<город>)»,
     «Остаток <город> (дней)», «План <город>». План стоит рядом с текущим остатком,
     поэтому колонки «Δ <город>» больше не нужны — разницу видно и так;
   • слева служебный блок: Артикул, Штрихкод, Остаток всего (WB), Привезли (+),
     Факт на FBS (=), Долг из 1С (+), Ждёт перемещения, Пул, ССП/день, Дней покрытия;
   • строка 1 — настройки: горизонт (14 дней) и неснижаемый остаток (10 шт, решение
     владельца 26.08.2026; было 5). Правятся прямо в книге, действуют на весь лист;
   • ежедневный запуск в 06:45 обновляет данные И пересчитывает план, но в WB НЕ пишет.
     Заливка осталась ручным пунктом меню с подтверждением;
   • ручные колонки переживают любое обновление: они читаются ПО ЗАГОЛОВКУ до очистки
     листа и записываются обратно. Очищаются они ровно один раз — после успешной
     заливки в WB, иначе то же перемещение посчиталось бы дважды;
   • «Распределение FBS» больше не нужен: расчёт целиком идёт на этом листе.

   ЛИНИЯ «WB СКЛАДЫ FBS» (файл до объединения)
   v1.2.4 — в «Остаток дней» вместо пустоты ноль (константа FBSD_DAYS_FALLBACK).
   v1.2.3 — #ERROR! в колонке дней: подбираются и имя функции, и разделитель
            (ЕСЛИОШИБКА/IFERROR, «;»/«,») — локаль книги угадывать нельзя.
   v1.2.2 — короче заголовки колонок: «Заказы Москва (5 дн)».
   v1.2.1 — разделитель аргументов формулы определяется опытом, а не по локали.
   v1.2.0 — порядок складов по числу заказов, слева самый сильный; «остаток дней»
            формулой, а не числом; лист переписывается значениями, оформление живёт.
   v1.0.0 — первая версия: заказы и остатки FBS по складам продавца.

   ЛИНИЯ «РАСПРЕДЕЛЕНИЕ FBS» (fbs_main.gs до объединения)
   v1.2.0 — неснижаемый остаток вместо посева; «Долг из 1С (+)» и «Ждёт перемещения»:
            товар выставляется авансом и гасится реальным перемещением; ручные колонки
            читаются по заголовку, а не по номеру.
   v1.1.0 — «Факт на FBS (=)» перекрывает живые остатки WB: сверка списка перемещений
            менеджера с кабинетом 25.08.2026 разошлась по всем 34 позициям.
   v1.0.0 — первая версия: пул, цели по спросу, заливка остатков в WB из меню. */

/* ---------- лист и его геометрия ---------- */

var FBSD_SHEET = 'WB Склады FBS';
var FBSD_LOG_SHEET = '_лог FBS';

// Список товаров — колонки A:B листа «Регламент», со строки 3. Тот же источник,
// что у основного WB-скрипта книги: штрихкод в B — главный ключ сопоставления.
var FBSD_ITEMS_SHEET = 'Регламент';
var FBSD_ITEMS_FIRST_ROW = 3;

var FBSD_SETTINGS_ROW = 1;
var FBSD_HEADER_ROW = 2;
var FBSD_FIRST_ROW = 3;

// Служебный блок слева, до первого города.
var FBSD_META_COLS = 10;
var FBSD_COL_VENDOR = 1;
var FBSD_COL_BARCODE = 2;
var FBSD_COL_TOTAL = 3;
var FBSD_COL_BROUGHT = 4;
var FBSD_COL_FACT = 5;
var FBSD_COL_ADVANCE = 6;
var FBSD_COL_DEBT = 7;

// Колонок на один город и колонок в хвосте (Сумма плана, Откуда пул, Обновлено).
var FBSD_WH_BLOCK = 4;
var FBSD_TAIL_COLS = 3;

var FBSD_HEAD_BROUGHT = 'Привезли (±)';

/**
 * v2.2.0. Прежние названия той же колонки. Ручные колонки ищутся ПО ЗАГОЛОВКУ, а на
 * боевом листе в момент первого прогона новой версии стоит ещё старая шапка: без этого
 * списка вписанное менеджером перемещение прочиталось бы как ноль и потерялось.
 */
var FBSD_HEAD_BROUGHT_ALIASES = ['Привезли (+)', 'Привезли'];
var FBSD_HEAD_FACT = 'Факт на FBS (=)';
var FBSD_HEAD_ADVANCE = 'Долг из 1С (+)';
var FBSD_HEAD_DEBT = 'Ждёт перемещения';

var FBSD_TIMEZONE = 'Europe/Moscow';
var FBSD_WINDOW_DAYS = 5;
var FBSD_DEFAULT_HORIZON = 14;
var FBSD_DAILY_HANDLER = 'wbWarehousesDailyTrigger';
var FBSD_LOG_LIMIT = 20000;

/**
 * Что подставлять в «Остаток дней», когда делить не на что (заказов не было).
 *   '0' — ноль, '""' — пустая ячейка, '"—"' — прочерк.
 * О ЧЁМ ПОМНИТЬ ПРИ РАСКРАСКЕ: ноль здесь значит «посчитать не из чего», а не
 * «запаса на ноль дней». Правило «красным всё, что меньше 10» покрасит и склады,
 * где товар просто не продаётся.
 */
var FBSD_DAYS_FALLBACK = '0';

/* ---------- палитра листа ----------

   Светлые тона: лист читают целиком, на 97 колонок насыщенная заливка превращается
   в рябь. Смысл несут четыре цвета «дней» (красный → жёлтый → зелёный → голубой) и два
   цвета плана (зелёный «довезти», оранжевый «убрать»), всё остальное — фон и рамки. */
var FBSD_COLOR = {
  settings: '#e8eaed',   // строка настроек
  headMeta: '#d9d9d9',   // шапка служебного блока и хвоста
  headOdd: '#dbe4ee',    // шапка блока города, через один
  headEven: '#eef2f7',
  manual: '#fff2cc',     // жёлтые колонки — их заполняет человек
  debt: '#efefef',       // «Ждёт перемещения» — считает скрипт
  debtOn: '#fff0e0',     // ...и в ней есть непогашенный долг
  debtText: '#b06000',
  pool: '#e8f0fe',       // «Пул» — итог служебного блока
  soft: '#f8f9fa',       // ССП и дни покрытия
  noDemand: '#f3f3f3',   // заказов не было — считать не из чего
  noDemandText: '#9aa0a6',
  low: '#f4c7c3',        // меньше половины горизонта
  mid: '#fce8b2',        // меньше горизонта
  ok: '#d9ead3',         // от горизонта
  over: '#cfe2f3',       // от двух горизонтов — перезапас
  add: '#d9ead3',        // план больше остатка — довезти
  take: '#fce5cd',       // план меньше остатка — убрать
  gridLight: '#d9d9d9',
  gridDark: '#9aa0a6',
  muted: '#999999'
};

/* ---------- меню ---------- */

/**
 * Своего onOpen у файла НЕТ намеренно: в привязанном скрипте книги «Регламент» уже
 * живёт чужой onOpen (меню «Меню»), а два определения одного имени в проекте Apps
 * Script молча затирают друг друга. Вызов `fbsBuildMenu_();` дописывает деплой.
 */
function fbsBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('📦 Остатки FBS')
    .addItem('Обновить лист и рассчитать план', 'updateWbSellerWarehouses')
    .addItem('Залить план в WB', 'fbsApplyPlan')
    .addSeparator()
    .addItem('Включить автообновление (06:45)', 'installWbWarehousesDailyTrigger')
    .addItem('Отключить автообновление', 'removeWbWarehousesDailyTrigger')
    .addSeparator()
    .addItem('Проверить связь с WB', 'fbsCheckConnection')
    .addItem('Указать токен WB', 'fbsSetToken')
    .addToUi();
}

/**
 * Ручной запуск: обновляет заказы и остатки и пересчитывает план. В WB не пишет.
 * Имя прежнее — на него завязан пункт «🏬 Обновить по складам FBS — WB» в меню «Меню».
 */
function updateWbSellerWarehouses() {
  var ui = SpreadsheetApp.getUi();
  fbsBook_().toast('Собираю остатки, заказы и раскладку по складам FBS…', 'Wildberries', 30);
  try {
    var result = fbsRun_(false);
    ui.alert('Wildberries — склады FBS', result.message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Wildberries — склады FBS',
             'Обновление не выполнено. Лист «' + FBSD_SHEET + '» не изменён.\n\n' + error.message,
             ui.ButtonSet.OK);
    throw error;
  }
}

/** Пересчёт заново и заливка плана в WB. Спрашивает подтверждение. */
function fbsApplyPlan() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = fbsRun_(true);
    ui.alert('Wildberries — склады FBS', result.message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Wildberries — склады FBS', 'Заливка не выполнена.\n\n' + error.message, ui.ButtonSet.OK);
    throw error;
  }
}

function fbsCheckConnection() {
  var warehouses = fbsWarehouses_();
  var readOnly = fbsTokenIsReadOnly_(fbsGetToken_());
  fbsAlert_('Связь с WB',
    'Складов в кабинете: ' + warehouses.length + '\n' +
    warehouses.map(function (w) { return '• ' + w.name; }).join('\n') + '\n\n' +
    (readOnly ? 'ВНИМАНИЕ: токен «только на чтение» — залить остатки он не сможет.'
              : 'Токен с правом записи — заливка остатков доступна.'));
}

function fbsSetToken() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Токен WB',
    'Вставьте токен с правом «Маркетплейс» (без галки «только на чтение»)', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var token = answer.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty(FBSD_TOKEN_PROP, token);
  ui.alert('Токен сохранён' + (fbsTokenIsReadOnly_(token) ? '.\n\nНо он «только на чтение».' : '.'));
}

/* ---------- ежедневный запуск ---------- */

/**
 * Ежедневный запуск в 06:45 МСК.
 *
 * ПОЧЕМУ НЕ ВНУТРИ 07:00–08:00, КАК ОСТАЛЬНЫЕ: там уже стоят WB (07:15) и Ozon
 * (07:45), а Google запускает с допуском ±15 минут — свободного места между ними
 * не остаётся, и три выгрузки начали бы писать в одну книгу одновременно.
 * 06:45 заканчивается ровно перед стартом WB, к 08:00 все три листа заполнены.
 *
 * v2.0.0. Триггер считает и план тоже, но в WB НИЧЕГО не пишет: заливка требует
 * интерфейса (см. fbsConfirm_), а у триггера его нет.
 */
function installWbWarehousesDailyTrigger() {
  var ui = SpreadsheetApp.getUi();
  installWbWarehousesDailyTriggerSilent();
  ui.alert('Wildberries — склады FBS',
    'Ежедневное обновление включено: около 06:45 МСК, то есть между 06:30 и 07:00.\n\n' +
    'Оно обновляет заказы и остатки и пересчитывает план. В кабинет WB ничего не пишет — ' +
    'заливка остаётся ручным пунктом меню с подтверждением.',
    ui.ButtonSet.OK);
}

/** Служебный вариант без окон — для установки прямо из редактора. */
function installWbWarehousesDailyTriggerSilent() {
  fbsDeleteDailyTriggers_();
  ScriptApp.newTrigger(FBSD_DAILY_HANDLER)
    .timeBased()
    .atHour(6)
    .nearMinute(45)
    .everyDays(1)
    .inTimezone(FBSD_TIMEZONE)
    .create();
  return 'WB seller-warehouses trigger created';
}

/** Отключает только этот триггер, не трогая триггеры WB и Ozon. */
function removeWbWarehousesDailyTrigger() {
  var ui = SpreadsheetApp.getUi();
  var removed = fbsDeleteDailyTriggers_();
  ui.alert('Wildberries — склады FBS',
           removed ? 'Ежедневное обновление отключено.' : 'Активного триггера не было.',
           ui.ButtonSet.OK);
}

function fbsDeleteDailyTriggers_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === FBSD_DAILY_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

/** Обработчик триггера: без окон, ошибки не глушим. */
function wbWarehousesDailyTrigger() {
  var result = fbsRun_(false);
  Logger.log(result.message);
}

/* ---------- основной прогон ---------- */

/** Блокировка, чтобы ручной запуск и триггер не столкнулись на одном листе. */
function fbsRun_(apply) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление по складам уже выполняется. Повторите позже.');
  try {
    return fbsRunLocked_(apply);
  } finally {
    lock.releaseLock();
  }
}

function fbsRunLocked_(apply) {
  var ss = fbsBook_();
  var sheet = ss.getSheetByName(FBSD_SHEET) || ss.insertSheet(FBSD_SHEET);

  // Настройки и ручные колонки читаем ДО очистки листа — иначе потеряем их.
  var settings = fbsReadSettings_(sheet);
  var manual = fbsReadManual_(sheet);

  var items = fbsReadItems_(ss);
  if (!items.length) {
    throw new Error('В листе «' + FBSD_ITEMS_SHEET + '» не найдены строки со штрихкодами (колонка B).');
  }
  items = fbsMergeRows_(items, manual);

  var warehouses = fbsWarehouses_();
  if (!warehouses.length) {
    throw new Error('WB не вернул ни одного склада продавца. Если вы работаете только по FBO, ' +
                    'этот лист не нужен — разбивать нечего.');
  }

  var barcodes = items.map(function (item) { return item.barcode; });
  var stocksByWarehouse = {};
  warehouses.forEach(function (warehouse) {
    stocksByWarehouse[warehouse.id] = fbsStocks_(warehouse.id, barcodes);
  });

  var period = fbsOrdersPeriod_(FBSD_WINDOW_DAYS);
  var ordersIndex = fbsAggregateOrders_(fbsOrders_(period), warehouses, items);

  // Слева самый сильный склад — тот, где больше всего заказов за период.
  var ordered = fbsOrderWarehouses_(warehouses, ordersIndex.byWarehouse);
  var baseIndex = fbsBaseIndex_(ordered);
  var headers = fbsHeaders_(ordered);

  // Лист нужен до сборки строк: на нём выясняем, какой разделитель аргументов
  // понимает эта книга, иначе формула «остаток дней» встанет в ошибку.
  var dialect = fbsDetectFormulaDialect_(sheet, headers.length + 3);

  var plans = items.map(function (item) {
    var current = ordered.map(function (w) {
      return Number((stocksByWarehouse[w.id] || {})[item.barcode]) || 0;
    });
    var orders = ordered.map(function (w) {
      return Number((ordersIndex.byWarehouse[w.id] || {})[item.barcode]) || 0;
    });
    var hand = manual[item.barcode] || {};
    var currentSum = current.reduce(function (a, b) { return a + b; }, 0);
    var chosen = fbsPool_(currentSum, hand.brought, hand.fact, hand.debt, hand.advance);
    var res = fbsPlanOne_(chosen.pool, orders, current, {
      horizonDays: settings.horizon,
      minStock: settings.minStock,
      windowDays: FBSD_WINDOW_DAYS,
      baseIndex: baseIndex
    });
    return {
      item: item, current: current, currentSum: currentSum, orders: orders,
      brought: Number(hand.brought) ? Number(hand.brought) : '',
      fact: (hand.fact === null || hand.fact === undefined) ? '' : hand.fact,
      advance: Number(hand.advance) > 0 ? Number(hand.advance) : '',
      debtPrev: Number(hand.debt) || 0, debt: chosen.debt, covered: chosen.covered,
      pool: chosen.pool, poolSource: chosen.source, plan: res.plan, mode: res.mode
    };
  });

  var changes = fbsChanges_(ordered, plans);
  var updatedAt = fbsNow_();
  var summary = fbsSummary_(plans, ordered, changes, period, ordersIndex);

  fbsWriteSheet_(sheet, headers, ordered, plans, settings, updatedAt, dialect, false);
  fbsWriteNote_(sheet, ordered, period, updatedAt, ordersIndex, plans.length, settings);
  SpreadsheetApp.flush();

  if (!apply) {
    fbsStamp_(sheet, updatedAt, 'расчёт, в WB не отправлено');
    return { message: 'Готово. ' + summary + '\n\nВ WB ничего не отправлено.', changes: changes };
  }

  if (fbsTokenIsReadOnly_(fbsGetToken_())) {
    throw new Error('Токен «только на чтение» — залить остатки нельзя. Меню → «Указать токен WB».');
  }
  if (!changes.count) {
    fbsStamp_(sheet, updatedAt, 'раскладка уже соответствует плану');
    return { message: 'Раскладка уже соответствует плану — заливать нечего.\n\n' + summary,
             changes: changes };
  }
  if (!fbsConfirm_('Залить остатки в WB?',
                   summary + '\n\nПосле заливки ручные колонки очистятся.')) {
    fbsStamp_(sheet, updatedAt, 'заливка отменена');
    return { message: 'Отменено. Лист пересчитан, в WB ничего не отправлено.\n\n' + summary,
             changes: changes };
  }

  var sent = 0;
  ordered.forEach(function (warehouse, index) {
    var list = changes.byWarehouse[index];
    if (!list.length) return;
    fbsPutStocks_(warehouse.id, list.map(function (it) { return { sku: it.barcode, amount: it.to }; }));
    sent += list.length;
  });

  fbsLog_(fbsBook_(), ordered, changes);
  // Долг фиксируется и ручные колонки очищаются ТОЛЬКО здесь: пересчёт кнопкой
  // не должен наращивать долг, а отменённая заливка — ничего не менять.
  fbsCommitManual_(sheet, plans);
  fbsStamp_(sheet, fbsNow_(), 'залито в WB');

  return { message: 'Залито в WB: ' + sent + ' позиций.\n\n' + summary, changes: changes };
}

function fbsSummary_(plans, warehouses, changes, period, ordersIndex) {
  var debtTotal = plans.reduce(function (a, p) { return a + p.debt; }, 0);
  var coveredTotal = plans.reduce(function (a, p) { return a + p.covered; }, 0);
  var text = 'Товаров: ' + plans.length + ', складов: ' + warehouses.length + '.\n' +
    'Заказы за ' + period.startText + ' — ' + period.endText + ': ' + ordersIndex.total + ' шт.\n' +
    'Позиций к изменению: ' + changes.count + ', движение: ' + changes.moved + ' шт.';
  if (debtTotal) text += '\nЖдёт перемещения (выставлено авансом): ' + debtTotal + ' шт.';
  if (coveredTotal) text += '\nПеремещение закрыло долга: ' + coveredTotal + ' шт.';
  if (ordersIndex.unknownTotal) {
    text += '\nЗаказов не отнесено ни к одному складу из списка: ' + ordersIndex.unknownTotal +
            ' (обычно склад, удалённый в кабинете; подробности — в примечании к A2).';
  }
  return text;
}

/* ---------- чтение книги ---------- */

/**
 * Книга берётся текущая. Жёстко зашитого ID здесь нет специально: файл одинаковый
 * для всех брендов, и именно зашитый ID однажды привёл к тому, что скрипт из таблицы
 * одного бренда молча писал в таблицу другого.
 */
function fbsBook_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Скрипт не привязан к таблице. Откройте нужную книгу и запустите его через ' +
                    '«Расширения → Apps Script» именно из неё.');
  }
  return ss;
}

/** Строки «Регламента» со штрихкодом. Артикул нужен как запасной ключ для заказов. */
function fbsReadItems_(ss) {
  var sheet = ss.getSheetByName(FBSD_ITEMS_SHEET);
  if (!sheet) throw new Error('В книге нет листа «' + FBSD_ITEMS_SHEET + '».');
  var lastRow = sheet.getLastRow();
  if (lastRow < FBSD_ITEMS_FIRST_ROW) throw new Error('В «' + FBSD_ITEMS_SHEET + '» нет строк товаров.');
  var values = sheet.getRange(FBSD_ITEMS_FIRST_ROW, 1, lastRow - FBSD_ITEMS_FIRST_ROW + 1, 2)
                    .getDisplayValues();
  var out = [];
  values.forEach(function (row) {
    var vendorCode = String(row[0] || '').trim();
    var barcode = String(row[1] || '').trim();
    if (!/^\d{6,}$/.test(barcode)) return;   // «Сеты», «ИТОГО», инструкция — мимо
    out.push({ vendorCode: vendorCode, barcode: barcode });
  });
  return out;
}

/** Горизонт и неснижаемый остаток из строки 1. Пусто — значения по умолчанию. */
function fbsReadSettings_(sheet) {
  var horizon = FBSD_DEFAULT_HORIZON;
  var minStock = FBSD_DEFAULT_MIN_STOCK_;
  if (sheet && sheet.getLastRow() >= FBSD_SETTINGS_ROW && sheet.getLastColumn() >= 4) {
    var row = sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 4).getValues()[0];
    if (Number(row[1]) > 0) horizon = Math.round(Number(row[1]));
    if (row[3] !== '' && Number(row[3]) >= 0) minStock = Math.round(Number(row[3]));
  }
  return { horizon: horizon, minStock: minStock };
}

/**
 * Ручные колонки по штрихкоду. Пустой «Факт на FBS (=)» — это null, а не ноль:
 * ноль означал бы «на складах ничего нет» и обнулил бы весь товар.
 */
function fbsReadManual_(sheet) {
  var out = {};
  if (!sheet || sheet.getLastRow() < FBSD_FIRST_ROW) return out;
  var width = Math.max(FBSD_META_COLS, sheet.getLastColumn());
  var head = sheet.getRange(FBSD_HEADER_ROW, 1, 1, width).getValues()[0];
  var col = fbsManualCols_(head);
  var count = sheet.getLastRow() - FBSD_FIRST_ROW + 1;
  var values = sheet.getRange(FBSD_FIRST_ROW, 1, count, width).getValues();

  function num(row, index) {
    if (index < 0) return 0;
    var v = Number(row[index]);
    return v > 0 ? Math.round(v) : 0;
  }

  /** v2.2.0. «Привезли (±)» — единственная ручная колонка со знаком: минус = забрали. */
  function signed(row, index) {
    if (index < 0) return 0;
    var raw = row[index];
    if (raw === '' || raw === null || raw === undefined) return 0;
    var v = Number(raw);
    return isNaN(v) ? 0 : Math.round(v);
  }

  values.forEach(function (row) {
    var barcode = String(row[FBSD_COL_BARCODE - 1] === null || row[FBSD_COL_BARCODE - 1] === undefined
      ? '' : row[FBSD_COL_BARCODE - 1]).trim();
    if (!/^\d{6,}$/.test(barcode)) return;
    var factCell = col.fact >= 0 ? row[col.fact] : '';
    var fact = (factCell === '' || factCell === null || factCell === undefined || isNaN(Number(factCell)))
      ? null : Math.max(0, Math.round(Number(factCell)));
    out[barcode] = {
      vendorCode: String(row[FBSD_COL_VENDOR - 1] || '').trim(),
      brought: signed(row, col.brought), fact: fact,
      advance: num(row, col.advance), debt: num(row, col.debt)
    };
  });
  return out;
}

/**
 * Номера ручных колонок ПО ЗАГОЛОВКУ (0-based). Колонки нет на листе — вернётся −1,
 * и значение считается нулевым.
 *
 * ЗАЧЕМ ПО ЗАГОЛОВКУ, А НЕ ПО НОМЕРУ: до v2.0.0 те же колонки жили на другом листе
 * и в другом порядке. По номерам «Долг из 1С» вычитался бы из чужой колонки —
 * раскладка удвоила бы весь остаток товара. Пустая шапка = свежий лист: там номера
 * по умолчанию верны, потому что лист сейчас же будет записан этой версией.
 */
function fbsManualCols_(head) {
  function find(title, fallback) {
    var titles = Array.isArray(title) ? title : [title];
    for (var i = 0; i < head.length; i++) {
      var cell = String(head[i]).trim();
      for (var t = 0; t < titles.length; t++) {
        if (cell === titles[t]) return i;
      }
    }
    return fallback;
  }
  var empty = !head.join('').trim();
  return {
    brought: find([FBSD_HEAD_BROUGHT].concat(FBSD_HEAD_BROUGHT_ALIASES),
                  empty ? FBSD_COL_BROUGHT - 1 : -1),
    fact: find(FBSD_HEAD_FACT, empty ? FBSD_COL_FACT - 1 : -1),
    advance: find(FBSD_HEAD_ADVANCE, empty ? FBSD_COL_ADVANCE - 1 : -1),
    debt: find(FBSD_HEAD_DEBT, empty ? FBSD_COL_DEBT - 1 : -1)
  };
}

/**
 * Строки «Регламента» плюс дописанные руками: товара может не быть в «Регламенте»
 * (у кабинета Б так с одной позицией — он стоит там без штрихкода), но
 * перевезти его могли. Спрос по такой строке нулевой.
 */
function fbsMergeRows_(items, manual) {
  var rows = items.slice();
  var known = {};
  items.forEach(function (item) { known[item.barcode] = true; });
  Object.keys(manual).forEach(function (barcode) {
    if (known[barcode]) return;
    var hand = manual[barcode];
    if (!hand.brought && !hand.advance && !hand.debt
        && (hand.fact === null || hand.fact === undefined)) return;
    rows.push({ vendorCode: hand.vendorCode || ('ШК ' + barcode), barcode: barcode, addedByHand: true });
  });
  return rows;
}

/* ---------- заказы ---------- */

/**
 * Раскладывает сборочные задания по складам и товарам.
 * Ключ — штрихкод из skus[]; если его нет, пробуем артикул, но только когда он ведёт
 * ровно к одной строке: артикул продавца не уникален, и угадывание приписало бы
 * заказы чужому товару.
 */
function fbsAggregateOrders_(orders, warehouses, items) {
  var byWarehouse = {};
  warehouses.forEach(function (warehouse) { byWarehouse[warehouse.id] = {}; });

  var knownBarcodes = {};
  var barcodeByVendorCode = {};
  items.forEach(function (item) {
    knownBarcodes[item.barcode] = true;
    var key = String(item.vendorCode || '').trim().toLowerCase();
    if (!key) return;
    if (!barcodeByVendorCode[key]) barcodeByVendorCode[key] = [];
    barcodeByVendorCode[key].push(item.barcode);
  });

  var total = 0;
  var unknownTotal = 0;
  var unknownWarehouses = {};

  (orders || []).forEach(function (order) {
    var warehouseId = Number(order.warehouseId) || 0;

    var barcode = '';
    var skus = Array.isArray(order.skus) ? order.skus : [];
    for (var i = 0; i < skus.length; i++) {
      var candidate = String(skus[i] || '').trim();
      if (knownBarcodes[candidate]) { barcode = candidate; break; }
    }
    if (!barcode) {
      var candidates = barcodeByVendorCode[String(order.article || '').trim().toLowerCase()] || [];
      if (candidates.length === 1) barcode = candidates[0];
    }
    if (!barcode) return;   // товара нет в «Регламенте» — не наше дело

    total++;
    if (!byWarehouse[warehouseId]) {
      unknownTotal++;
      unknownWarehouses[warehouseId] = (unknownWarehouses[warehouseId] || 0) + 1;
      return;
    }
    byWarehouse[warehouseId][barcode] = (byWarehouse[warehouseId][barcode] || 0) + 1;
  });

  return { byWarehouse: byWarehouse, total: total,
           unknownTotal: unknownTotal, unknownWarehouses: unknownWarehouses };
}

/**
 * Склады слева направо — по убыванию числа заказов за период. При равенстве — по
 * имени, чтобы порядок не дёргался между запусками на складах с одинаковым
 * (обычно нулевым) результатом.
 */
function fbsOrderWarehouses_(warehouses, ordersByWarehouse) {
  return warehouses
    .map(function (warehouse) {
      var byBarcode = ordersByWarehouse[warehouse.id] || {};
      var total = Object.keys(byBarcode).reduce(function (sum, barcode) {
        return sum + byBarcode[barcode];
      }, 0);
      return { id: warehouse.id, name: warehouse.name, totalOrders: total };
    })
    .sort(function (a, b) {
      if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders;
      return a.name.localeCompare(b.name, 'ru');
    });
}

/** Базовый склад: на него уходит излишек при профиците. Не нашёлся — самый сильный. */
function fbsBaseIndex_(warehouses) {
  for (var i = 0; i < warehouses.length; i++) {
    if (fbsNormName_(warehouses[i].name) === fbsNormName_(FBSD_BASE_WAREHOUSE)) return i;
  }
  return 0;
}

/* ---------- сборка и запись листа ---------- */

/** Номер колонки → буквенное обозначение: 1 → A, 27 → AA, 66 → BN. */
function fbsColumnLetter_(index) {
  var result = '';
  var n = index;
  while (n > 0) {
    var remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * v2.0.0. Шапка: служебный блок, потом по ЧЕТЫРЕ колонки на город, потом хвост.
 * План стоит сразу за остатком того же города — так видно разницу без колонок «Δ».
 */
function fbsHeaders_(warehouses) {
  var headers = ['Артикул', 'Штрихкод', 'Остаток всего (WB)', FBSD_HEAD_BROUGHT, FBSD_HEAD_FACT,
                 FBSD_HEAD_ADVANCE, FBSD_HEAD_DEBT, 'Пул', 'ССП/день', 'Дней покрытия'];
  warehouses.forEach(function (warehouse) {
    headers.push('Заказы ' + warehouse.name + ' (' + FBSD_WINDOW_DAYS + ' дн)');
    headers.push('Остаток (' + warehouse.name + ')');
    headers.push('Остаток ' + warehouse.name + ' (дней)');
    headers.push('План ' + warehouse.name);
  });
  headers.push('Сумма плана');
  headers.push('Откуда пул');
  headers.push('Обновлено (МСК)');
  return headers;
}

/**
 * Строка товара. «Остаток дней» — формула, а не число: её видно, можно поправить
 * прямо в таблице, и она пересчитывается сама, если вы измените остаток руками.
 * Имя функции и разделитель аргументов приходят из fbsDetectFormulaDialect_.
 *
 * @param {boolean} commit true — в «Ждёт перемещения» уходит НОВЫЙ долг (после заливки).
 */
function fbsBuildRow_(plan, rowNumber, dialect, commit) {
  var ssp = plan.orders.reduce(function (a, b) { return a + b; }, 0) / FBSD_WINDOW_DAYS;
  var row = [plan.item.vendorCode, plan.item.barcode, plan.currentSum,
             plan.brought, plan.fact, plan.advance,
             (commit ? plan.debt : plan.debtPrev) || '',
             plan.pool, Math.round(ssp * 10) / 10, ssp > 0 ? Math.round(plan.pool / ssp) : ''];

  plan.plan.forEach(function (value, index) {
    var ordersCol = fbsColumnLetter_(FBSD_META_COLS + 1 + index * FBSD_WH_BLOCK);
    var stockCol = fbsColumnLetter_(FBSD_META_COLS + 2 + index * FBSD_WH_BLOCK);
    row.push(plan.orders[index]);
    row.push(plan.current[index]);
    row.push('=' + dialect.fn + '(' + stockCol + rowNumber + '/(' + ordersCol + rowNumber + '/' +
             FBSD_WINDOW_DAYS + ')' + dialect.sep + FBSD_DAYS_FALLBACK + ')');
    row.push(value);
  });

  row.push(plan.plan.reduce(function (a, b) { return a + b; }, 0));
  row.push(plan.poolSource + (plan.item.addedByHand ? ', строка дописана руками' : ''));
  row.push(plan.updatedAt);
  return row;
}

/**
 * v2.1.0. Лист переписывается ЦЕЛИКОМ: и значения, и оформление.
 *
 * До v2.1.0 скрипт трогал только содержимое, чтобы пережила раскраска, настроенная
 * руками. Так делать было нельзя: города стоят по числу заказов и меняются местами
 * между прогонами, поэтому правило, повешенное человеком на колонку, назавтра красит
 * другой город. Оформление отдано скрипту — он один знает, где какой город сегодня.
 */
function fbsWriteSheet_(sheet, headers, warehouses, plans, settings, updatedAt, dialect, commit) {
  var width = headers.length;
  var needRows = FBSD_FIRST_ROW + plans.length - 1;

  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < needRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), needRows - sheet.getMaxRows());
  }

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearContent();

  sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 8).setValues([[
    'Горизонт, дней', settings.horizon,
    'Неснижаемый остаток, шт', settings.minStock,
    'Обновлено (МСК)', updatedAt,
    'Статус', 'расчёт'
  ]]);
  sheet.getRange(FBSD_HEADER_ROW, 1, 1, width).setValues([headers]).setFontWeight('bold').setWrap(true);

  var body = plans.map(function (plan, index) {
    plan.updatedAt = updatedAt;
    return fbsBuildRow_(plan, FBSD_FIRST_ROW + index, dialect, commit);
  });
  if (body.length) sheet.getRange(FBSD_FIRST_ROW, 1, body.length, width).setValues(body);

  if (sheet.getFrozenRows() !== FBSD_HEADER_ROW) sheet.setFrozenRows(FBSD_HEADER_ROW);
  if (sheet.getFrozenColumns() !== 2) sheet.setFrozenColumns(2);

  fbsFormatSheet_(sheet, headers, warehouses, settings, body.length);
  return sheet;
}

/* ---------- оформление ---------- */

/**
 * v2.1.0. Весь внешний вид листа за один заход: чистим прежнее, красим шапку и
 * служебный блок, расставляем границы блоков, форматы чисел и ширины, в конце —
 * условное форматирование.
 *
 * Порядок важен: сначала снимаем все границы и заливку со ВСЕГО листа — иначе от
 * прошлого прогона остаются черты и цвет там, где сегодня стоит другой город.
 */
function fbsFormatSheet_(sheet, headers, warehouses, settings, rowCount) {
  var width = headers.length;
  var n = warehouses.length;
  var bodyRows = Math.max(rowCount, 1);
  var blockStart = FBSD_META_COLS + 1;
  var tailStart = FBSD_META_COLS + n * FBSD_WH_BLOCK + 1;
  var solid = SpreadsheetApp.BorderStyle.SOLID;
  var medium = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;

  var all = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  all.setBorder(false, false, false, false, false, false);
  all.setBackground(null);
  all.setFontColor(null);
  all.setFontWeight('normal');
  all.setFontSize(10);
  all.setWrap(false);
  sheet.setHiddenGridlines(true);

  // Строка настроек: и подписи, и значения жирные — их правит человек.
  sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 8)
       .setBackground(FBSD_COLOR.settings).setFontWeight('bold');

  // Шапка: служебный блок и хвост серые, блоки городов подкрашены через один.
  var header = sheet.getRange(FBSD_HEADER_ROW, 1, 1, width);
  header.setFontWeight('bold').setWrap(true)
        .setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange(FBSD_HEADER_ROW, 1, 1, FBSD_META_COLS).setBackground(FBSD_COLOR.headMeta);
  sheet.getRange(FBSD_HEADER_ROW, tailStart, 1, FBSD_TAIL_COLS).setBackground(FBSD_COLOR.headMeta);
  warehouses.forEach(function (warehouse, i) {
    sheet.getRange(FBSD_HEADER_ROW, blockStart + i * FBSD_WH_BLOCK, 1, FBSD_WH_BLOCK)
         .setBackground(i % 2 ? FBSD_COLOR.headEven : FBSD_COLOR.headOdd);
  });
  sheet.getRange(FBSD_HEADER_ROW, 1).setHorizontalAlignment('left');
  sheet.setRowHeight(FBSD_HEADER_ROW, 46);

  // Служебный блок: жёлтое — руке, серое — скрипту, голубое — итог.
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, 1).setBackground(FBSD_COLOR.soft);
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, bodyRows, 3).setBackground(FBSD_COLOR.manual);
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_DEBT, bodyRows, 1).setBackground(FBSD_COLOR.debt);
  sheet.getRange(FBSD_FIRST_ROW, 8, bodyRows, 1)
       .setBackground(FBSD_COLOR.pool).setFontWeight('bold');
  sheet.getRange(FBSD_FIRST_ROW, 9, bodyRows, 2).setBackground(FBSD_COLOR.soft);

  // Выравнивание: название слева, числа по центру, «откуда пул» — мелким слева.
  sheet.getRange(FBSD_FIRST_ROW, 1, bodyRows, 2).setHorizontalAlignment('left');
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, width - 2).setHorizontalAlignment('center');
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 1, bodyRows, 1)
       .setHorizontalAlignment('left').setFontSize(9).setFontColor(FBSD_COLOR.muted);
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 2, bodyRows, 1)
       .setFontSize(9).setFontColor(FBSD_COLOR.muted);

  // Числовые форматы. Штрихкод — текстом, иначе длинное число уедет в экспоненту.
  sheet.getRange(FBSD_FIRST_ROW, 1, bodyRows, 2).setNumberFormat('@');
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, 6).setNumberFormat('#,##0');
  // v2.2.0. Минус в «Привезли (±)» — красным: вычитание должно быть видно с первого взгляда.
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, bodyRows, 1)
       .setNumberFormat('#,##0;[Red]-#,##0');
  sheet.getRange(FBSD_FIRST_ROW, 9, bodyRows, 1).setNumberFormat('#,##0.0');
  sheet.getRange(FBSD_FIRST_ROW, 10, bodyRows, 1).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, blockStart, bodyRows, n * FBSD_WH_BLOCK).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, tailStart, bodyRows, 1).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 1, bodyRows, 2).setNumberFormat('@');

  // Ширины. Блоки городов одной ширины — так четвёрки читаются как одинаковые модули.
  [[1, 300], [2, 120], [3, 92], [4, 84], [5, 90], [6, 88], [7, 96], [8, 82], [9, 78], [10, 86]]
    .forEach(function (pair) { sheet.setColumnWidth(pair[0], pair[1]); });
  sheet.setColumnWidths(blockStart, n * FBSD_WH_BLOCK, 66);
  sheet.setColumnWidth(tailStart, 86);
  sheet.setColumnWidth(tailStart + 1, 170);
  sheet.setColumnWidth(tailStart + 2, 112);

  // Границы: сначала светлая сетка по данным, потом тяжёлые разделители поверх.
  var data = sheet.getRange(FBSD_HEADER_ROW, 1, bodyRows + 1, width);
  data.setBorder(true, true, true, true, null, true, FBSD_COLOR.gridLight, solid);
  warehouses.forEach(function (warehouse, i) {
    sheet.getRange(FBSD_SETTINGS_ROW, blockStart + i * FBSD_WH_BLOCK, bodyRows + 2, FBSD_WH_BLOCK)
         .setBorder(null, true, null, null, null, null, FBSD_COLOR.gridDark, solid);
  });
  sheet.getRange(FBSD_SETTINGS_ROW, 1, bodyRows + 2, FBSD_META_COLS)
       .setBorder(null, null, null, true, null, null, FBSD_COLOR.gridDark, medium);
  sheet.getRange(FBSD_SETTINGS_ROW, tailStart, bodyRows + 2, FBSD_TAIL_COLS)
       .setBorder(null, true, null, null, null, null, FBSD_COLOR.gridDark, medium);
  header.setBorder(null, null, true, null, null, null, FBSD_COLOR.gridDark, medium);

  fbsApplyRules_(sheet, fbsBuildFormatRules_(warehouses, settings, rowCount));
  return sheet;
}

/**
 * v2.1.0. Правила условного форматирования — ЧИСТЫМ списком, без обращений к книге.
 * Так их видно в тестах: цвет ячейки на боевом листе через API не прочитать, поэтому
 * проверять можно только то, из чего он получается — диапазон, формулу и цвет.
 *
 * НА КАЖДУЮ КОЛОНКУ СВОЁ ПРАВИЛО, а не одно на все сразу. Одно правило с двумя десятками
 * диапазонов короче, но тогда относительные ссылки в формуле пересчитывает сама таблица,
 * и ошибка вылезла бы цветом уже на боевом листе. Правил выходит 7 на город плюс 6
 * служебных — при потолке листа в 500 (проверено запросом к Sheets API 26.08.2026) запас есть.
 *
 * ПОРЯДОК ВНУТРИ ОДНОГО ДИАПАЗОНА ЗНАЧИМ: побеждает первое подошедшее правило. «Нет
 * заказов» стоит первым, иначе ноль в «дней» покрасился бы красным как острый дефицит,
 * хотя означает «считать не из чего» (см. FBSD_DAYS_FALLBACK).
 */
function fbsBuildFormatRules_(warehouses, settings, rowCount) {
  var rules = [];
  if (!rowCount) return rules;

  var horizon = settings && settings.horizon > 0 ? settings.horizon : FBSD_DEFAULT_HORIZON;
  var half = Math.max(1, Math.round(horizon / 2));
  var row = FBSD_FIRST_ROW;

  function add(col, formula, background, fontColor, bold) {
    rules.push({ row: row, col: col, rows: rowCount, cols: 1, formula: formula,
                 background: background || null, fontColor: fontColor || null, bold: !!bold });
  }

  /**
   * Четыре ступени запаса плюс «спроса нет». demandCol — колонка заказов.
   *
   * ПОЧЕМУ УМНОЖЕНИЕ, А НЕ AND: формулу условного форматирования разбирает сама книга,
   * по своей локали. В русской книге `=AND($K3>0,$M3>=28)` отвергается на месте —
   * разделитель аргументов там `;`, а не `,` (проверено запросом к Sheets API 26.08.2026:
   * запятая — отказ 400, `AND(...;...)` и `И(...;...)` проходят). Подбирать диалект, как
   * для ЕСЛИОШИБКА в строках листа, тут не нужно: `(A)*(B)` — то же «и», но без имени
   * функции и без разделителя, поэтому работает в книге с любой локалью.
   */
  function daysRules(daysCol, demandCol) {
    var d = '$' + fbsColumnLetter_(daysCol) + row;
    var q = '$' + fbsColumnLetter_(demandCol) + row;
    add(daysCol, '=' + q + '=0', FBSD_COLOR.noDemand, FBSD_COLOR.noDemandText);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + (horizon * 2) + ')', FBSD_COLOR.over);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + horizon + ')', FBSD_COLOR.ok);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + half + ')', FBSD_COLOR.mid);
    add(daysCol, '=' + q + '>0', FBSD_COLOR.low);
  }

  // Служебный блок: «Дней покрытия» считается от ССП, «Ждёт перемещения» — от нуля.
  daysRules(10, 9);
  add(FBSD_COL_DEBT, '=$' + fbsColumnLetter_(FBSD_COL_DEBT) + row + '>0',
      FBSD_COLOR.debtOn, FBSD_COLOR.debtText, true);

  warehouses.forEach(function (warehouse, i) {
    var demand = FBSD_META_COLS + 1 + i * FBSD_WH_BLOCK;
    var stock = demand + 1;
    var days = demand + 2;
    var plan = demand + 3;
    daysRules(days, demand);
    // План против текущего остатка: что довезти, что забрать.
    var p = '$' + fbsColumnLetter_(plan) + row;
    var st = '$' + fbsColumnLetter_(stock) + row;
    add(plan, '=' + p + '>' + st, FBSD_COLOR.add);
    add(plan, '=' + p + '<' + st, FBSD_COLOR.take);
  });

  return rules;
}

/** Превращает список правил в правила книги. Прежние правила листа снимаются целиком. */
function fbsApplyRules_(sheet, specs) {
  var rules = specs.map(function (spec) {
    var builder = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(spec.formula)
      .setRanges([sheet.getRange(spec.row, spec.col, spec.rows, spec.cols)]);
    if (spec.background) builder.setBackground(spec.background);
    if (spec.fontColor) builder.setFontColor(spec.fontColor);
    if (spec.bold) builder.setBold(true);
    return builder.build();
  });
  sheet.setConditionalFormatRules(rules);
  return rules.length;
}

function fbsStamp_(sheet, updatedAt, status) {
  sheet.getRange(FBSD_SETTINGS_ROW, 6).setValue(updatedAt);
  sheet.getRange(FBSD_SETTINGS_ROW, 8).setValue(status);
}

/**
 * Фиксация после успешной заливки: непогашенный долг остаётся на листе, ручные
 * колонки очищаются — иначе следующий прогон посчитает то же перемещение дважды.
 */
function fbsCommitManual_(sheet, plans) {
  if (!plans.length) return;
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, plans.length, 3).clearContent();
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_DEBT, plans.length, 1)
       .setValues(plans.map(function (p) { return [p.debt || '']; }));
}

/**
 * Выясняет опытом, чем эта книга разделяет аргументы функции и как называет
 * ЕСЛИОШИБКА. Гадать нельзя: формулу разбирает сама таблица, и от локали зависит
 * и имя функции, и разделитель. Проверка занимает одну служебную ячейку за
 * пределами выгрузки и делается один раз за запуск.
 */
var FBSD_FORMULA_CANDIDATES = [
  { fn: 'ЕСЛИОШИБКА', sep: ';' },
  { fn: 'IFERROR', sep: ';' },
  { fn: 'IFERROR', sep: ',' },
  { fn: 'ЕСЛИОШИБКА', sep: ',' }
];

function fbsDetectFormulaDialect_(sheet, probeColumn) {
  if (sheet.getMaxColumns() < probeColumn) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), probeColumn - sheet.getMaxColumns());
  }
  var cell = sheet.getRange(1, probeColumn);
  var previous = cell.getFormula() || cell.getValue();
  var chosen = null;

  try {
    for (var i = 0; i < FBSD_FORMULA_CANDIDATES.length; i++) {
      var candidate = FBSD_FORMULA_CANDIDATES[i];
      cell.setFormula('=' + candidate.fn + '(1' + candidate.sep + '1)');
      SpreadsheetApp.flush();
      var value = cell.getValue();
      Logger.log('Пробую «=' + candidate.fn + '(1' + candidate.sep + '1)» → ' + value);
      if (value === 1) { chosen = candidate; break; }
    }
  } catch (error) {
    Logger.log('Проверка формулы прервалась: ' + error.message);
  } finally {
    cell.clearContent();
    if (previous !== '' && previous !== null) cell.setValue(previous);
  }

  if (!chosen) {
    chosen = FBSD_FORMULA_CANDIDATES[0];
    Logger.log('Ни один вариант не посчитался — беру «' + chosen.fn + '» с «' + chosen.sep + '».');
  }
  return chosen;
}

function fbsWriteNote_(sheet, warehouses, period, updatedAt, ordersIndex, itemCount, settings) {
  var note = 'Обновлено: ' + updatedAt + ' МСК.\n' +
    'Заказы: сборочные задания за ' + period.startText + ' — ' + period.endText +
    ' (' + FBSD_WINDOW_DAYS + ' полных дней), 1 задание = 1 единица товара.\n' +
    'Остаток: текущий остаток на складе продавца по штрихкоду.\n' +
    'Товаров: ' + itemCount + '. Складов: ' + warehouses.length + '.\n\n' +
    'КАК ЧИТАТЬ БЛОК ГОРОДА: «Заказы» — спрос за период, «Остаток» — что лежит сейчас, ' +
    '«Остаток (дней)» — на сколько дней хватит, «План» — сколько должно лежать после ' +
    'раскладки. План минус остаток и есть перемещение.\n' +
    'ЦЕЛЬ СКЛАДА: ССП города × горизонт (' + settings.horizon + ' дн). Сначала каждому ' +
    'складу неснижаемый остаток (' + settings.minStock + ' шт), спрос делит остаток пула. ' +
    'Пула не хватает даже на минимум по всем городам — товар НЕ размазывается по 1–2 штуки, ' +
    'берутся только самые продающие города.\n' +
    'ПУЛ: колонка «' + FBSD_HEAD_FACT + '» перекрывает живые остатки WB (им верить нельзя — ' +
    'их проставляют руками). Пусто — пул = сумма живых остатков + «' + FBSD_HEAD_BROUGHT + '».\n' +
    'ДОЛГ: «' + FBSD_HEAD_ADVANCE + '» кладёт товар на витрину авансом и вешает его в ' +
    '«' + FBSD_HEAD_DEBT + '»; реальное перемещение сначала гасит долг и идёт в пул только ' +
    'излишком. Долг фиксируется ТОЛЬКО после заливки — пересчёт кнопкой его не растит.\n' +
    'Ручные колонки очищаются после успешной заливки, иначе перемещение посчитается дважды.\n' +
    'Строка 1 — настройки: горизонт и неснижаемый остаток. Правьте прямо в книге.\n\n' +
    'Порядок складов — по числу заказов, слева самый сильный: ' +
    warehouses.slice(0, 5).map(function (w) { return w.name + ' (' + w.totalOrders + ')'; }).join(', ') +
    (warehouses.length > 5 ? ' и далее' : '') + '.\n' +
    'Порядок пересчитывается каждый запуск, поэтому города могут меняться местами. ' +
    'Структура при этом постоянная: у каждого города четыре колонки подряд, поэтому ' +
    'условное форматирование, повешенное на колонку, остаётся верным по смыслу.\n' +
    'ОФОРМЛЕНИЕ СТАВИТ СКРИПТ (v2.1.0): каждый прогон он заново красит шапку, границы ' +
    'блоков и условное форматирование, потому что города меняются местами. Правила, ' +
    'добавленные руками на этом листе, будут сняты следующим прогоном — нужный цвет ' +
    'правится в коде.\n' +
    'ЦВЕТ «ОСТАТОК <ГОРОД> (ДНЕЙ)»: серый — заказов не было, красный — меньше ' +
    'половины горизонта, жёлтый — меньше горизонта, зелёный — от горизонта, ' +
    'голубой — от двух горизонтов (перезапас). Пороги едут за горизонтом из строки 1.\n' +
    'ЦВЕТ «ПЛАН <ГОРОД>»: зелёный — довезти, оранжевый — забрать, без заливки — ' +
    'оставить как есть.\n' +
    'Формулы в «Регламенте» стройте через ПОИСКПОЗ по заголовку, а не по номеру колонки — ' +
    'номера зависят от порядка складов.\n' +
    'Сумма по складам может слегка расходиться с колонкой «Заказы за 5 дней / FBS» в ' +
    '«WB Данные»: там цифра из аналитического отчёта, здесь — из сборочных заданий.';

  var unknownIds = Object.keys(ordersIndex.unknownWarehouses || {});
  if (unknownIds.length) {
    note += '\n\nЗаказы со складов, которых нет в текущем списке (всего ' + ordersIndex.unknownTotal +
      '): ' + unknownIds.map(function (id) {
        return 'ID ' + id + ' — ' + ordersIndex.unknownWarehouses[id] + ' шт.';
      }).join(', ') + '. Обычно это склад, удалённый или переименованный в кабинете уже после ' +
      'того, как заказы по нему прошли. В колонки такие заказы не попали.';
  }
  sheet.getRange(FBSD_HEADER_ROW, 1).setNote(note);
}

/* ---------- заливка ---------- */

/** Что реально меняется: по складам, только позиции с другим количеством. */
function fbsChanges_(warehouses, plans) {
  var byWarehouse = warehouses.map(function () { return []; });
  var count = 0;
  var moved = 0;
  plans.forEach(function (p) {
    p.plan.forEach(function (to, i) {
      var from = p.current[i];
      if (to === from) return;
      byWarehouse[i].push({ barcode: p.item.barcode, sku: p.item.vendorCode, from: from, to: to });
      count++;
      moved += Math.abs(to - from);
    });
  });
  return { byWarehouse: byWarehouse, count: count, moved: moved };
}

function fbsLog_(book, warehouses, changes) {
  var sheet = book.getSheetByName(FBSD_LOG_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(FBSD_LOG_SHEET);
    sheet.getRange(1, 1, 1, 6)
         .setValues([['Когда (МСК)', 'Склад', 'SKU', 'ШК', 'Было', 'Стало']])
         .setFontWeight('bold');
    sheet.hideSheet();
  }
  var stamp = fbsNow_();
  var rows = [];
  warehouses.forEach(function (w, i) {
    changes.byWarehouse[i].forEach(function (it) {
      rows.push([stamp, w.name, it.sku, it.barcode, it.from, it.to]);
    });
  });
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  var extra = sheet.getLastRow() - 1 - FBSD_LOG_LIMIT;
  if (extra > 0) sheet.deleteRows(2, extra);
}

/* ---------- мелочи ---------- */

function fbsNow_() {
  return Utilities.formatDate(new Date(), FBSD_TIMEZONE, 'dd.MM.yyyy HH:mm');
}

function fbsAlert_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(title + ': ' + message);
  }
}

/** Без интерфейса (триггер, clasp run) заливка НЕ идёт: подтверждение обязательно. */
function fbsConfirm_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    return ui.alert(title, message, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) {
    return false;
  }
}

// Для тестов в Node. В Apps Script `module` не существует — блок не выполняется.
// Object.assign, а не присваивание: fbs_math.gs экспортируется первым, и простое
// `module.exports = {...}` стёрло бы его функции.
if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, {
    fbsManualCols_: fbsManualCols_, fbsHeaders_: fbsHeaders_, fbsBuildRow_: fbsBuildRow_,
    fbsChanges_: fbsChanges_, fbsColumnLetter_: fbsColumnLetter_,
    fbsAggregateOrders_: fbsAggregateOrders_, fbsOrderWarehouses_: fbsOrderWarehouses_,
    fbsMergeRows_: fbsMergeRows_, fbsRunLocked_: fbsRunLocked_,
    fbsReadSettings_: fbsReadSettings_, fbsReadManual_: fbsReadManual_,
    fbsBuildFormatRules_: fbsBuildFormatRules_, FBSD_COLOR: FBSD_COLOR
  });
}
