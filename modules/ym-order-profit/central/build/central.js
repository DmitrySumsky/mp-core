/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ЦЕНТРАЛЬНЫЙ КОД v2.3.0 — 25.09.2026 */
/*
 * Что делает: каждое утро считает, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня по каждому
 * кабинету Маркета, ведёт историю по дням с фактом рядом с прогнозом и собирает юнитку на данных
 * Маркета (цена, остатки, фактические расходы на штуку, ЧП на штуку).
 *
 * Код лежит в репозитории, в книге — только лоадер (меню и окна). Исходники — central/src/:
 *   01_ядро.js      — имена листов, даты, журнал
 *   02_настройки.js — лист настроек, ключи, себестоимость (юнитка + лист «себес вручную»), кэш на Диске
 *   03_сбор.js      — что и как берётся из Маркета
 *   04_модель.js    — ВСЯ ЛОГИКА РАСЧЁТА (коэффициенты, прогноз, факт, юнитка) — начинать читать отсюда
 *   05_листы.js     — запись листов книги
 *   06_прогон.js    — очередь по кабинетам, автопрогон, кнопки меню
 *   07_пульт.js     — «Как работать», «Что сейчас происходит», «Проверка связи», миграция листов
 *
 * ИСТОРИЯ ВЕРСИЙ (новая сверху)
 *
 * v2.3.0 — 25.09.2026
 *   МАРКЕТ ДОКЛАДЫВАЕТ НАЧИСЛЕНИЯ ЗА ДЕНЬ ЕЩЁ 1–2 ДНЯ, А КНИГА ЧИТАЛА КАЖДЫЙ ДЕНЬ ОДИН РАЗ — сверка отчёта «Стоимость услуг»
 *   25.09.2026 по крупному кабинету: за 22.09 утром 23.09 было 338 тыс. ₽ удержаний, 25.09 — 453 тыс.; средняя миля и перевод
 *   денег приходят через 1–2 дня (в день прогона их 0), комиссия — частями, хранение — днём позже. 21.09 и раньше за двое суток
 *   не изменились. Книга отмечала день прочитанным и больше к нему не возвращалась: у дней, собранных самой книгой (с 22.09),
 *   не хватало мили, перевода и трети комиссии; через 1–2 недели это ушло бы в коэффициенты и прогноз стал бы оптимистичнее.
 *   Плюс вопросы менеджера ЯМ по юнитке, 25.09.2026.
 *   • каждый прогон перечитывает последние 4 дня начислений (YOP_SVC_RECHECK) и ЗАМЕНЯЕТ прочитанное: что внёс каждый день,
 *     кэш помнит в svcRecent (вычесть и положить заново); отчёт скачивается до вычитания — сбой Маркета дыры не оставит;
 *     день, прочитанный до v2.3.0 без такой записи, не перечитывается (иначе удержания сложились бы дважды) — кэш на Диске
 *     пересобран tools/repair_svc.py по свежему отчёту;
 *   • «по дням»: расходы дня (P–S) последних 3 дней переписываются из кэша, маржа, налог и ЧП (T–W) пересчитываются;
 *   • юнитка: «Расходы дня (хранение, подписка, транзит, прочее), % от заказов» и «Расходы дня (условно), ₽» — рядом с рекламой
 *     за показы, вычитаются из маржи и в сценарии;
 *   • юнитка: «Минимум для акции» (offer-prices, minimumForBestseller), «Акция: макс. цена для участия» и «Акция: участие»
 *     (promos + promos/offers);
 *   • юнитка: «Остаток FBY Москва (Софьино)» — остаток по складам Маркета в Москве и области (GET /v2/warehouses), без возвратного;
 *   • юнитка: «Группа товара (впишите)» — свой признак для фильтра по всем брендам, переносится прогоном, как заметки.
 *   Тесты: 31/31 + 10/10.
 *
 * v2.2.2 — 24.09.2026
 *   «ИЗ-ЗА ФИЛЬТРА ДАННЫЕ ОПЯТЬ НЕ ПОДТЯНУЛИСЬ» — менеджер ЯМ, 24.09.2026, скриншот юнитки по одному кабинету.
 *   Фильтр ни при чём: скрытых строк нет, формулы во всех строках. Пустые цена продажи, ставка буста и СПП — у артикулов
 *   без заказов за последние 7 дней (в том кабинете таких 87 из 106: заказы раз в одну-две недели).
 *   • нет заказов за 7 дней — цена, ставка буста, цена на витрине и СПП по заказам за 30 дней; в заголовках колонок
 *     «(нет заказов — за 30)»; ставка «сейчас» по-прежнему только по заказам недели.
 *   Тесты: 28/28.
 *
 * v2.2.1 — 24.09.2026
 *   «22 ЧИСЛО НЕ СОХРАНИЛОСЬ, ВМЕСТО НЕГО ВСТАЛИ ДАННЫЕ ЗА 23» — менеджер ЯМ, утро 24.09.2026, после первого автопрогона.
 *   Блок вчерашнего дня на «по дням» стоит формулами SUMIFS от листа «по заказам», а yopWriteDay_ сначала
 *   перезаписывал «по заказам» новым днём и только потом замораживал историю значениями — прошлый день успевал
 *   пересчитаться на заказы нового и застывал их копией. Ошибка была с v1.0.0; раньше её маскировала ручная
 *   пересборка истории (прошлые дни она пишет значениями из кэша).
 *   • порядок: заморозка истории и flush — до записи «по заказам», коэффициентов и справки;
 *   • тест на порядок записи листов.
 *   Тесты: 27/27.
 *
 * v2.2.0 — 23.09.2026
 *   ЮНИТКА СЧИТАЛА ОПТИМИСТИЧНЕЕ ЗАКРЫВАЮЩИХ — вопросы менеджера ЯМ после первого дня работы с юнитками, 23.09.2026:
 *   «часть комиссий занижена», «перевод 1,2–1,5 % при 1,6 % в закрывающих, доставка 3,2–4,7 % при 5 %», «себес в юнитке
 *   есть, а не подтягивается», «нужны цена с СПП на витрине и СПП», «куда писать комментарии, чтобы не съезжали».
 *   Разбор по отчёту «Стоимость услуг» за сентябрь по семи кабинетам:
 *   • комиссия: в строке размещения кроме amountWithoutBonuses есть qualityIndexAmount — надбавка за просрочку отгрузки
 *     FBS (daysOfDelay, lateOrderExecutionFeeTariff до 100 % комиссии). Модель её не брала: у крупного кабинета 682 тыс. ₽
 *     за сентябрь, +6,5 % к комиссии. Теперь она в статье «прочее» заказа (₽ на заказанную штуку);
 *   • доставка и перевод: Маркет берёт ровно 5 % и 1,6 % с цены ДОСТАВЛЕННЫХ штук, а коэффициент был долей от суммы ВСЕХ
 *     заказов когорты — отсюда 3–4,7 %. Теперь доля от выручки выкупленного, прогноз — выручка × доля (без деления на выкуп);
 *   • тариф комиссии: последний день с начислениями вместо самого частого за 14 дней — после смены тарифа 01.09 модель
 *     неделю считала по старому;
 *   • себес: артикул сверяется без регистра и хвостовых знаков («ABC …» против «abc …», «X-z120» против «X-Z120»,
 *     артикул Маркета с запятой на конце); в формуле листа — REGEXREPLACE(TRIM(…));
 *   • юнитка: «Цена на витрине с СПП» и «СПП (скидка Маркета)» за 7 дней — из заказов: запись позиции получила шестое
 *     поле, скидку Маркета (prices[] MARKETPLACE); у старых записей кэша поля нет — колонки пустые до пересева кэша;
 *   • юнитка: «Заметка 1–3» в конце листа — переносятся прогоном по кабинету и артикулу, как «Ваша цена»;
 *   • лист «как считается»: что юнитка не учитывает на штуку (хранение, подписка, транзит, утилизация, вывоз — расходы дня),
 *     почему миля на выкупленную штуку выше тарифа (миля за отменённые в доставке тоже списывается), что можно делать с листом.
 *   Python-эталон (yop_engine v0.2.0) и засев кэша (seed_cache v1.1.0) — так же.
 *   Тесты: 26/26 + 10/10.
 *
 * v2.1.2 — 23.09.2026
 *   В ЮНИТКЕ «БУСТЫ НЕ ПОДТЯНУЛИСЬ» И ПРОПАЛИ ФОРМУЛЫ У ВСЕХ КАБИНЕТОВ, КРОМЕ ОДНОГО — менеджер ЯМ, 23.09.2026.
 *   1) «Ставка буста сейчас» стояла 0 у всех: bids/info отдаёт только ставки, выставленные через API, — у кабинетов
 *      там старые артикулы (у крупного кабинета 33 шт., в каталоге их нет), ставки из кабинета он не видит. Ноль
 *      при этом не пустой, и сценарий брал буст 0 % — маржа завышалась.
 *   2) На листе стоял обычный фильтр по одному кабинету: лист очищается и пишется заново, фильтр остаётся и прячет те же
 *      строки, а в скрытые строки формулы не легли — у остальных кабинетов пустые расходы и ЧП.
 *   • ставка «сейчас» — средняя bidFee по заказам последнего дня с заказами (не старше 7 дней): Маркет пишет в заказ
 *     ставку, действовавшую в момент заказа; bids/info — запасной источник; нет ничего — пусто (сценарий берёт
 *     среднюю за 7 дней); колонка переименована в «Ставка буста сейчас (последние заказы)»;
 *   • «🧮 юнитка» и «🧾 по заказам»: перед записью обычный фильтр снимается с запоминанием условий, после записи
 *     ставится заново на весь новый диапазон — фильтр применяется к свежим данным.
 *   Тесты: 23/23.
 *
 * v2.1.1 — 22.09.2026
 *   СРЕДНЯЯ МИЛЯ «СО СКИДКОЙ» — 4–21 ₽ НА ШТУКУ ВМЕСТО ~92 — вопрос менеджера ЯМ по юнитке, 22.09.2026.
 *   В отчёте «Стоимость услуг» servicePrice — лишь остаток сверх взаимозачёта: миля с тарифом 92 ₽ лежит как
 *   servicePrice 1 + netting 91. С сентября взаимозачётом закрывается почти всё, и миля занижалась в ~5 раз
 *   (крупный кабинет, 15.08–20.09: 417 тыс. ₽ вместо 2,25 млн). Комиссия и буст уже брались полной суммой.
 *   • статьи, которые берутся из servicePrice, берутся как servicePrice + netting (по отчёту поле netting есть
 *     только у средней мили, у доставки, перевода, эквайринга его нет); то же в засеве кэша и в Python-эталоне;
 *   • кэш на Диске пересобран из отчётов заново — в старом миля уже была сложена без взаимозачёта.
 *   Тесты: 21/21.
 *
 * v2.1.0 — 22.09.2026
 *   В ЮНИТКЕ НЕЛЬЗЯ БЫЛО ПОДСТАВИТЬ СВОЮ ЦЕНУ И СТАВКУ БУСТА — вопрос менеджера ЯМ после первого просмотра:
 *   ставки буста сильно снизили, а юнитка считала по средней ставке из заказов за 7 дней, поэтому маржа по части
 *   артикулов выглядела хуже, чем есть; нужно «в моменте подставить цену и ставку и сразу увидеть маржу».
 *   • ставка буста СЕЙЧАС по каждому артикулу — bids/info (сотые доли процента, как bidFee в заказе);
 *   • блок «Сценарий» сразу после остатков: «Ваша цена», «Ваша ставка буста» (пусто — текущие из кабинета) →
 *     цена и ставка в сценарии, расходы Маркета, маржа, ЧП на штуку, маржинальность — формулами, пересчёт сразу;
 *   • вписанное в сценарий прогон переносит по кабинету и артикулу, не затирает; ставка понимает и «5%», и «5»;
 *   • колонки юнитки заданы списком с ключами: формулы ссылаются на колонку по ключу, а не по букве.
 *   Тесты: 21/21.
 *
 * v2.0.1 — 22.09.2026
 *   #ERROR! ВО ВСЕХ ФОРМУЛАХ С АРГУМЕНТАМИ — первый живой прогон в копии книги, 22.09.2026.
 *   Формулы пишутся через setValues, а это ввод «как человек»: в русской локали книги разделитель
 *   аргументов «;», и SUMIFS/IFERROR/IF с «,» падали с «Formula parse error». Простые (=C5*D5) считались.
 *   • yopFx_: перед записью «,» в формулах меняется на разделитель локали книги (вне кавычек и имён листов);
 *   • лист «по дням» с ячейками-ошибками не замораживается значениями, а собирается заново из кэша.
 *   Тесты: 20/20.
 *
 * v2.0.0 — 22.09.2026
 *   ДОГОВОРЁННОСТИ С МЕНЕДЖЕРАМИ ЯМ ИЗ ЧАТА 21–22.09 — В КОД; ЮНИТКА НА ДАННЫХ МАРКЕТА; ПЕРЕЕЗД НА ПУЛЬТ.
 *   менеджер ЯМ: «факт, конечно, стоит добавить», запуск — сначала ручной прогон, потом автопрогон;
 *   «можно ли настроить юнитку, чтобы туда автоматически подтягивались цена, фактические расходы,
 *   остатки … на данных Маркета — отдельный новый лист»; второй менеджер прислал себестоимость двух
 *   американских кабинетов списком «артикул магазина — себес» (юниток по ним нет);
 *   владелец: старый ежедневный отчёт убрать, в меню — только кнопки, которыми пользуются, всё по Пульту.
 *   • Пульт: в книге только лоадер, логика — этот файл в репозитории (правка = один пуш);
 *     меню по порядку работы, «📖 Как работать», «📊 Что сейчас происходит», «🔌 Проверка связи»;
 *   • «📈 по дням»: колонки «Факт: ЧП заказов дня», «Факт − прогноз», «Судьба известна» — каждый прогон
 *     дописывает факт по дням старше 14 дней из отчёта «Стоимость услуг»; сравнение со старым
 *     ежедневным отчётом убрано; пересборка истории — 21 день, чтобы факт был виден сразу;
 *   • новый лист «🧮 ЧП ЯМ юнитка»: по каждому артикулу с заказами за 30 дней или остатком — цена
 *     в кабинете и фактическая цена продажи за 7 дней, остатки FBY/FBS и на сколько дней хватит,
 *     расходы Маркета на выкупленную штуку по факту удержаний, реклама за показы отдельной условной
 *     колонкой (доля кабинета), налог 25 % от маржи, ЧП на штуку и в месяц; синие колонки правятся руками;
 *   • лист «💲 ЧП ЯМ себес вручную» (кабинет | артикул магазина | себес): для кабинетов без юнитки
 *     и артикулов, которых нет в юнитке; значение с этого листа главнее юнитки;
 *   • лист настроек: «Тариф комиссии вручную, %» и «с даты заказа» — новый тариф действует сразу,
 *     без ожидания 1–2 недели, пока модель увидит его в начислениях;
 *   • новый кабинет подключается строкой настроек и строкой ключа: первый прогон сам докачивает
 *     42 дня истории кусками по 7 дней; кабинет без ключа пропускается и называется в статусе;
 *   • сбор кусками: заказы, созданные в окне, + заказы со сменой статуса в окне + отчёт услуг за окно;
 *     новый кусок начинается, только если до лимита исполнения хватает времени.
 *   Тесты: 19/19 на стабах (tests/run.js) + 10/10 модели на Python; на боевом кэше прогноз совпал с Python до рубля.
 *
 * v1.0.0 — 22.09.2026
 *   МОДЕЛЬ ПЕРЕЕХАЛА ИЗ ЛОКАЛЬНОГО ПРОГОНА В СКРИПТ КНИГИ — просьба менеджера ЯМ посмотреть логику
 *   в Apps Script и ответ по демо (налог как в юнитке; реклама за показы, хранение и подписка —
 *   расходами дня по дате начисления; кабинет без юнитки — добавить), 22.09.2026.
 *   • сбор по дням: заказы, созданные вчера, + заказы, у которых вчера сменился статус
 *     (stats/orders, dateFrom/updateFrom), + отчёт «Стоимость услуг» за вчерашние начисления;
 *     кабинеты идут очередью, прогон продолжает сам себя, если не уложился в 4,5 минуты;
 *   • модель — «3_модель.js», один в один с проверенной версией на Python (крупнейший кабинет: 16.09
 *     −10 648 ₽, 20.09 +22 404 ₽ до расходов дня); прогон записи листов в Node на заглушках;
 *   • налог — минус 25 % от маржи, как в юнитке; реклама за показы, хранение, подписка и прочие
 *     начисления без заказа — отдельными расходами дня, по артикулам не делятся;
 *   • кабинеты и листы юниток — на листе «⚙️ ЧП ЯМ настройки», ключи — лист «API-ключи».
 */


/* ==================== 01_ядро.js ==================== */

/* ЯДРО: имена листов, даты, журнал событий. */

var YOP_VERSION = 'v2.3.0';
var YOP_TIME_LIMIT_MS = 4.5 * 60 * 1000;   // этап очереди: дальше — продолжение новым запуском
var YOP_START_LIMIT_MS = 2.5 * 60 * 1000;  // новый кусок сбора начинается, только если прошло меньше
var YOP_STALE_MS = 30 * 60 * 1000;         // очередь молчит дольше — считается зависшей

var YOP_SH = {
  detail: '🧾 ЧП ЯМ по заказам',
  days: '📈 ЧП ЯМ по дням',
  unit: '🧮 ЧП ЯМ юнитка',
  coef: '⚙️ ЧП ЯМ коэффициенты',
  help: '📖 ЧП ЯМ как считается',
  settings: '⚙️ ЧП ЯМ настройки',
  cogs: '💲 ЧП ЯМ себес вручную',
  keys: 'API-ключи'
};
var YOP_HEAD_ROW = 4;
var YOP_CODE_URL = 'https://github.com/DmitrySumsky/mp-core/tree/dev/modules/ym-order-profit/central/src';

function yopAddDays_(iso, k) {
  var d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

function yopToday_() { return Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd'); }
function yopYesterday_() { return yopAddDays_(yopToday_(), -1); }
function yopRu_(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4); }
function yopNum_(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
function yopProps_() { return PropertiesService.getScriptProperties(); }

/** Дата из ячейки: объект Date, «ДД.ММ.ГГГГ» или «ГГГГ-ММ-ДД» → ISO; иначе ''. */
function yopIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Europe/Moscow', 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) return s.slice(6) + '-' + s.slice(3, 5) + '-' + s.slice(0, 2);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function yopCol_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function yopSheet_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Журнал последних 40 событий — его показывает «📊 Что сейчас происходит». */
function yopLog_(msg) {
  var line = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM HH:mm:ss') + ' ' + msg;
  Logger.log(line);
  var p = yopProps_(), log = (p.getProperty('YOP_LOG') || '').split('\n').filter(String);
  log.push(line);
  p.setProperty('YOP_LOG', log.slice(-40).join('\n'));
}

function yopHeader_(sh, head, widths) {
  sh.getRange(YOP_HEAD_ROW, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true)
    .setVerticalAlignment('middle').setBackground('#e8f0fe');
  sh.setFrozenRows(YOP_HEAD_ROW);
  for (var i = 1; i <= head.length; i++) sh.setColumnWidth(i, (widths && widths[i]) || 110);
}

/**
 * v2.1.2. Обычный фильтр на перезаписываемом листе. Лист очищается и пишется заново, а фильтр при этом остаётся
 * и держит скрытыми те же строки, что до прогона, — уже с чужими данными; в скрытые строки формулы юнитки
 * не легли (23.09: фильтр по одному кабинету — у остальных кабинетов пусто). Поэтому перед записью фильтр снимается
 * с запоминанием условий, после записи ставится заново на весь новый диапазон — и применяется к свежим данным.
 */
function yopFilterTake_(sh) {
  var f = sh.getFilter && sh.getFilter();
  if (!f) return null;
  var r = f.getRange(), crit = {};
  for (var c = r.getColumn(); c <= r.getLastColumn(); c++) {
    var k = f.getColumnFilterCriteria(c);
    if (k) crit[c] = k.copy().build();
  }
  f.remove();
  return crit;
}

function yopFilterPut_(sh, crit, nCols) {
  if (!crit) return;
  var n = Math.max(sh.getLastRow() - YOP_HEAD_ROW + 1, 2);
  var f = sh.getRange(YOP_HEAD_ROW, 1, n, nCols).createFilter();
  Object.keys(crit).forEach(function (c) { if (Number(c) <= nCols) f.setColumnFilterCriteria(Number(c), crit[c]); });
}

function yopTitle_(sh, title, note) {
  sh.getRange(1, 1).setValue(title).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue(note).setFontStyle('italic');
}
/**
 * v2.0.1. Формулы пишутся через setValues как ввод человека — значит, по правилам локали книги: в русской
 * локали аргументы разделяются «;», а «,» даёт «Formula parse error» (#ERROR!). В коде формулы пишутся
 * с «,», здесь меняются на разделитель книги — вне кавычек и имён листов.
 */
var YOP_SEP_ = null;
function yopSep_() {
  if (YOP_SEP_ === null) {
    var loc = '';
    try { loc = String(SpreadsheetApp.getActive().getSpreadsheetLocale() || ''); } catch (e) {}
    YOP_SEP_ = !loc || /^en/i.test(loc) ? ',' : ';';
  }
  return YOP_SEP_;
}

function yopFx_(rows) {
  if (yopSep_() === ',') return rows;
  return rows.map(function (row) {
    return row.map(function (v) {
      if (typeof v !== 'string' || v.charAt(0) !== '=') return v;
      var out = '', q = '';
      for (var i = 0; i < v.length; i++) {
        var ch = v.charAt(i);
        if (q) { if (ch === q) q = ''; out += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; out += ch; continue; }
        out += ch === ',' ? ';' : ch;
      }
      return out;
    });
  });
}


/* ==================== 02_настройки.js ==================== */

/* НАСТРОЙКИ, КЛЮЧИ, СЕБЕСТОИМОСТЬ, КЭШ НА ДИСКЕ.
 *
 * Лист «⚙️ ЧП ЯМ настройки»: B3 — папка кэша на Диске; ниже таблица кабинетов с шапкой
 *   Кабинет | Лист юнитки (себес) | Считать (да/нет) | Тариф комиссии вручную, % | с даты заказа | Комментарий
 * Колонки ищутся по заголовку. Кабинет должен называться так же, как на листе «API-ключи».
 *
 * История заказов и удержаний за ~6 недель по кабинету лежит JSON-файлом «yop_cache_<кабинет>.json»
 * в папке кэша. В ячейки таблицы она не влезла бы: у одного кабинета это десятки тысяч заказов,
 * а книга и так близко к потолку Google в 10 млн ячеек.
 */

var YOP_KEEP_DAYS = 42;     // сколько дней заказов держать: окно когорты 35 дней + запас
var YOP_SETTINGS_HEAD = ['Кабинет', 'Лист юнитки (себес)', 'Считать (да/нет)', 'Тариф комиссии вручную, %',
  'с даты заказа', 'Комментарий'];
var YOP_COGS_HEAD = ['Кабинет', 'Артикул магазина', 'Себестоимость, ₽', 'Комментарий'];

/** Лист настроек → { folderId, cabinets: [включённые], all: [все строки] }. */
function yopSettings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.settings);
  if (!sh) throw new Error('нет листа «' + YOP_SH.settings + '» — нажмите «⚙️ Обновить настройки таблицы»');
  var v = sh.getDataRange().getValues(), hr = -1;
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === 'Кабинет') { hr = i; break; }
  if (hr < 0) throw new Error('на листе «' + YOP_SH.settings + '» нет строки с заголовком «Кабинет»');
  var h = v[hr].map(function (x) { return String(x).trim().toLowerCase(); });
  var col = function (prefix) {
    for (var j = 0; j < h.length; j++) if (h[j].indexOf(prefix) === 0) return j;
    return -1;
  };
  var cU = col('лист юнитки'), cOn = col('считать'), cT = col('тариф'), cF = col('с даты');
  var all = [];
  for (var r = hr + 1; r < v.length; r++) {
    var name = String(v[r][0] || '').trim();
    if (!name) continue;
    var t = cT >= 0 ? v[r][cT] : '', tNum = typeof t === 'number' ? t : parseFloat(String(t).replace(',', '.'));
    if (isFinite(tNum) && tNum > 0 && tNum < 1) tNum = tNum * 100;       // ячейка в формате процента: 0,49
    all.push({
      name: name,
      unit: cU >= 0 ? String(v[r][cU] || '').trim() : '',
      on: cOn < 0 || String(v[r][cOn] || 'да').trim().toLowerCase() !== 'нет',
      tariff: isFinite(tNum) && tNum > 0 ? tNum : null,
      tariffFrom: cF >= 0 ? yopIso_(v[r][cF]) : '',
      row: r + 1
    });
  }
  var folder = '';
  for (var k = 0; k < hr; k++) if (String(v[k][0]).indexOf('Папка кэша') === 0) folder = String(v[k][1] || '').trim();
  return { folderId: folder, cabinets: all.filter(function (c) { return c.on; }), all: all };
}

/** Ключи с листа «API-ключи»: Кабинет | API-ключ | Business ID | Campaign FBS | Campaign FBY. */
function yopKeys_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.keys), out = {};
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[0] || !r[1] || !r[2]) return;
    var fbs = String(r[3] || '').trim(), fby = String(r[4] || '').trim();
    out[String(r[0]).trim()] = {
      apiKey: String(r[1]).trim(), businessId: Number(r[2]),
      fbs: fbs ? Number(fbs) : null, fby: fby ? Number(fby) : null,
      campaigns: [fbs, fby].filter(String).map(Number)
    };
  });
  return out;
}

/** Колонки «Код 1С» и «себес» юнитки кабинета (заголовки в первой строке). */
function yopUnitCols_(unitName) {
  var sh = unitName ? SpreadsheetApp.getActive().getSheetByName(unitName) : null;
  if (!sh) return null;
  var v = sh.getDataRange().getValues(), h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var kc = h.indexOf('код 1с'), cc = h.indexOf('себес');
  if (kc < 0 || cc < 0 || cc < kc) return null;
  return { name: unitName, kc: kc, cc: cc, values: v };
}

/**
 * v2.0.0. Себестоимость кабинета: { артикул: { v: ₽, src: 'вручную' | 'юнитка' } } + данные для формул.
 * Лист «себес вручную» главнее юнитки: его заполняют ровно там, где юнитки нет или коды не совпадают.
 */
function yopCogs_(cab) {
  var map = {}, unit = yopUnitCols_(cab.unit);
  if (unit) {
    unit.values.slice(1).forEach(function (r) {
      var k = String(r[unit.kc]).trim();
      if (k && typeof r[unit.cc] === 'number') map[k] = { v: r[unit.cc], src: 'юнитка' };
    });
  }
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.cogs);
  if (sh) {
    sh.getDataRange().getValues().slice(YOP_HEAD_ROW).forEach(function (r) {
      var sku = String(r[1] == null ? '' : r[1]).trim(), v = r[2];
      if (typeof v !== 'number') v = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
      if (String(r[0]).trim() === cab.name && sku && isFinite(v)) map[sku] = { v: v, src: 'вручную' };
    });
  }
  var norm = {};
  Object.keys(map).forEach(function (k) { norm[yopSkuNorm_(k)] = map[k]; });
  return { map: map, norm: norm, unit: unit ? { name: unit.name, kc: unit.kc, cc: unit.cc } : null };
}

/**
 * v2.2.0. Артикул для сверки с юниткой: без регистра и без хвостовых пробелов и знаков препинания. В кабинетах
 * «ABC …» против «abc …» в юнитке, «X-z120» против «X-Z120», в Маркете бывает артикул с запятой на конце —
 * себес не находился, хотя в юнитке он есть. Формула листа (VLOOKUP) регистр и так не различает.
 */
function yopSkuNorm_(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/[\s,.;]+$/, '');
}

/** Запись себеса артикула: точное совпадение, иначе — по нормализованному артикулу. */
function yopCogsEntry_(cogs, sku) {
  return cogs.map[sku] || (cogs.norm && cogs.norm[yopSkuNorm_(sku)]) || null;
}

/** { артикул: ₽ } — для модели; нормализованные артикулы — с префиксом «≈» (их читает yopCogsOf_). */
function yopCogsValues_(cogs) {
  var out = {};
  Object.keys(cogs.map).forEach(function (k) { out[k] = cogs.map[k].v; });
  Object.keys(cogs.norm || {}).forEach(function (k) { out['≈' + k] = cogs.norm[k].v; });
  return out;
}

/** v2.2.0. Себес артикула из yopCogsValues_: точно, иначе по нормализованному артикулу; нет — null. */
function yopCogsOf_(values, sku) {
  if (values.hasOwnProperty(sku)) return values[sku];
  var n = '≈' + yopSkuNorm_(sku);
  return values.hasOwnProperty(n) ? values[n] : null;
}

/**
 * Формула себестоимости строки листа: сначала «себес вручную» по (кабинет, артикул), потом юнитка
 * по «Код 1С». Поменяли себес в юнитке или на ручном листе — лист пересчитается сам.
 */
function yopCogsFormula_(cogs, cabCell, skuCell) {
  var m = "'" + YOP_SH.cogs + "'!";
  var manual = 'COUNTIFS(' + m + '$A:$A,' + cabCell + ',' + m + '$B:$B,' + skuCell + ')>0';
  var fromManual = 'SUMIFS(' + m + '$C:$C,' + m + '$A:$A,' + cabCell + ',' + m + '$B:$B,' + skuCell + ')';
  var fromUnit = '0';
  if (cogs.unit) {
    // v2.2.0: артикул без хвостовых пробелов и знаков («…90 caps,» в Маркете); регистр VLOOKUP не различает
    fromUnit = 'IFERROR(VLOOKUP(REGEXREPLACE(TRIM(' + skuCell + '&""),"[\\s,.;]+$",""),\'' + cogs.unit.name + "'!$" + yopCol_(cogs.unit.kc + 1) + ':$' +
      yopCol_(cogs.unit.cc + 1) + ',' + (cogs.unit.cc - cogs.unit.kc + 1) + ',FALSE),0)';
  }
  return '=IF(' + manual + ',' + fromManual + ',' + fromUnit + ')';
}

function yopCacheFolder_() {
  var id = yopSettings_().folderId;
  if (!id) throw new Error('на листе «' + YOP_SH.settings + '» не указана папка кэша (B3)');
  return DriveApp.getFolderById(id);
}

function yopCacheName_(cab) { return 'yop_cache_' + cab.replace(/\s+/g, '') + '.json'; }
function yopUnitDataName_(cab) { return 'yop_unit_' + cab.replace(/\s+/g, '') + '.json'; }

function yopEmptyCache_() { return { orders: {}, svc: {}, tariffs: {}, dayCost: {}, svcDays: [], svcRecent: {} }; }

function yopJsonLoad_(fileName) {
  var it = yopCacheFolder_().getFilesByName(fileName);
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) : null;
}

function yopJsonSave_(fileName, obj) {
  var folder = yopCacheFolder_(), it = folder.getFilesByName(fileName), text = JSON.stringify(obj);
  if (it.hasNext()) it.next().setContent(text);
  else folder.createFile(fileName, text, 'application/json');
}

function yopCacheLoad_(cab) {
  var c = yopJsonLoad_(yopCacheName_(cab)) || yopEmptyCache_();
  c.svcDays = c.svcDays || [];
  c.dayCost = c.dayCost || {};
  c.tariffs = c.tariffs || {};
  c.svc = c.svc || {};
  c.orders = c.orders || {};
  c.svcRecent = c.svcRecent || {};                 // v2.3.0: что добавил в кэш каждый из последних дней начислений
  return c;
}

function yopCacheSave_(cab, cache) { yopJsonSave_(yopCacheName_(cab), cache); }

/** Выбросить заказы старше окна и их удержания, старые тарифы и расходы дня. */
function yopCachePrune_(cache, upto) {
  var lo = yopAddDays_(upto, -YOP_KEEP_DAYS);
  Object.keys(cache.orders).forEach(function (oid) { if (cache.orders[oid].d < lo) delete cache.orders[oid]; });
  Object.keys(cache.svc).forEach(function (key) {
    if (!cache.orders[key.split('|')[0]]) delete cache.svc[key];
  });
  Object.keys(cache.tariffs).forEach(function (key) { if (key.slice(0, 10) < lo) delete cache.tariffs[key]; });
  Object.keys(cache.dayCost).forEach(function (d) { if (d < lo) delete cache.dayCost[d]; });
  cache.svcDays = cache.svcDays.filter(function (d) { return d >= lo; });
  var fresh = yopAddDays_(upto, -YOP_SVC_RECHECK + 1);          // v2.3.0: старше окна перечитки начисления уже не меняются
  Object.keys(cache.svcRecent || {}).forEach(function (d) { if (d < fresh) delete cache.svcRecent[d]; });
}
/** v2.0.0. Состояние кабинета для «📊 Что сейчас происходит» (без чтения многомегабайтного кэша). */
function yopCabState_(name, patch) {
  var p = yopProps_(), all = JSON.parse(p.getProperty('YOP_CAB_STATE') || '{}'), cur = all[name] || {};
  Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
  all[name] = cur;
  p.setProperty('YOP_CAB_STATE', JSON.stringify(all));
}


/* ==================== 03_сбор.js ==================== */

/* СБОР ИЗ МАРКЕТА.
 *
 * Для прогноза и факта по каждому кабинету за окно дат [D1; D2] (обычно это один вчерашний день,
 * у нового кабинета — куски по 7 дней на 42 дня назад):
 *   1. заказы, СОЗДАННЫЕ в окне (stats/orders, dateFrom/dateTo): штуки, цена продавца
 *      (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе (bidFee);
 *   2. заказы, у которых в окне СМЕНИЛСЯ СТАТУС (updateFrom/updateTo): так кэш узнаёт,
 *      что заказ недельной давности доставлен или отменён;
 *   3. отчёт «Стоимость услуг» за начисления окна (united-marketplace-services): каждое удержание
 *      Маркета по номеру заказа — комиссия, буст, доставка, средняя миля, перевод денег, эквайринг,
 *      невыкупы и возвраты; без номера заказа — реклама за показы, хранение, подписка, прочее.
 *      Последние YOP_SVC_RECHECK дней начислений перечитываются каждым прогоном и ЗАМЕНЯЮТ прочитанное
 *      раньше (v2.3.0): Маркет докладывает начисления за день ещё 1–2 дня (миля, перевод, часть комиссии).
 * Для юнитки: карточки (название, цена в кабинете, статус), остатки FBY/FBS (и FBY по складам Москвы),
 * минимум для акции и участие в акциях Маркета.
 *
 * Удержания в самих заказах (commissions[]) не используются: там только остаток сверх
 * взаимозачёта — комиссия 498 ₽ видна как 4,99 ₽.
 */

var YOP_BASE = 'https://api.partner.market.yandex.ru';
var YOP_CHUNK_DAYS = 7;
var YOP_SVC_RECHECK = 4;     // v2.3.0: столько последних дней начислений перечитывается каждым прогоном (вчера + 3 до него)

// файл отчёта «Стоимость услуг» → [статья, поле суммы]; tools/seed_cache.py держит те же правила
var YOP_ORDER_RULES = {
  'placement.json': ['комиссия', 'amountWithoutBonuses'],
  'boost.json': ['буст', null],                                   // prepaid + postpaid + bonusPaid
  'delivery.json': ['доставка', 'servicePrice'],
  'crossregional_delivery.json': ['миля', 'servicePrice'],
  'payment_transfer.json': ['перевод', 'servicePrice'],
  'payment_accepting.json': ['эквайринг', 'servicePrice'],
  'order_processing.json': ['возврат', 'servicePrice'],
  'order_processing_on_warehouse.json': ['возврат', 'servicePrice'],
  'storage_of_returns.json': ['возврат', 'servicePrice']
};
var YOP_DAY_RULES = {
  'cpm-boost.json': ['показы', 'payment'],
  'shelf.json': ['показы', 'payment'],
  'product-banners.json': ['показы', 'payment'],
  'business_subscription.json': ['подписка', 'servicePrice']
};
var YOP_NO_SKU = { 'order_processing.json': 1, 'order_processing_on_warehouse.json': 1, 'storage_of_returns.json': 1 };
var YOP_DELIVERED = { DELIVERED: 1, PARTIALLY_DELIVERED: 1 };

/** Запрос к Маркету: 420/429/5xx — повтор с паузой (лимит общий у всех сервисов на ключе). */
function yopApi_(key, method, url, body) {
  var pause = 3000;
  for (var i = 0; i < 7; i++) {
    var opt = { method: method, headers: { 'Api-Key': key }, muteHttpExceptions: true };
    if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
    var r = UrlFetchApp.fetch(url.indexOf('http') === 0 ? url : YOP_BASE + url, opt), code = r.getResponseCode();
    if (code === 200) return r;
    if (code !== 420 && code !== 429 && code < 500) {
      throw new Error('Маркет ' + url.replace(YOP_BASE, '').split('?')[0] + ': HTTP ' + code + ' ' + r.getContentText().slice(0, 200));
    }
    Utilities.sleep(pause);
    pause = Math.min(pause * 2, 30000);
  }
  throw new Error('Маркет не ответил: ' + url.replace(YOP_BASE, '').split('?')[0]);
}

/** Все заказы кампании по фильтру (созданы в окне / сменили статус в окне), страница за страницей. */
function yopOrders_(key, campaign, filter) {
  var out = [], token = null, res;
  do {
    var url = '/v2/campaigns/' + campaign + '/stats/orders?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(key, 'post', url, filter).getContentText()).result || {};
    out = out.concat(res.orders || []);
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.orders || []).length);
  return out;
}

/**
 * Заказ Маркета → запись кэша: дата, статус, позиции
 * [артикул, шт, цена продавца, ставка буста, доставлено шт, скидка Маркета на штуку (v2.2.0)].
 * Цена продавца — сумма всех prices[]; скидка Маркета (MARKETPLACE) — то, что Маркет доплатил за покупателя:
 * цена на витрине = цена продавца − скидка Маркета, СПП = скидка ÷ цена продавца.
 */
function yopOrderRecord_(o) {
  var st = o.status || '';
  return {
    d: String(o.creationDate || '').slice(0, 10), st: st,
    it: (o.items || []).map(function (it) {
      var n = Number(it.count || 0), deliv = YOP_DELIVERED[st] ? n : 0, price = 0, spp = 0;
      (it.details || []).forEach(function (det) {
        if (YOP_DELIVERED[st] && (det.itemStatus === 'REJECTED' || det.itemStatus === 'RETURNED')) deliv -= Number(det.itemCount || 0);
      });
      (it.prices || []).forEach(function (p) {
        price += Number(p.costPerItem || 0);
        if (p.type === 'MARKETPLACE') spp += Number(p.costPerItem || 0);
      });
      return [String(it.shopSku || ''), n, Math.round(price * 100) / 100, Number(it.bidFee || 0) / 10000, Math.max(deliv, 0),
        Math.round(spp * 100) / 100];
    })
  };
}

/** Отчёт «Стоимость услуг» за окно начислений → файлы отчёта { имя: [строки] }. */
function yopServicesReport_(key, businessId, d1, d2) {
  var gen = JSON.parse(yopApi_(key, 'post', '/v2/reports/united-marketplace-services/generate?format=JSON',
    { businessId: businessId, dateFrom: d1, dateTo: d2 }).getContentText());
  var id = gen.result.reportId;
  for (var i = 0; i < 45; i++) {
    Utilities.sleep(4000);
    var info = JSON.parse(yopApi_(key, 'get', '/v2/reports/info/' + id).getContentText()).result;
    if (info.status === 'DONE') {
      var files = {};
      if (!info.file) return files;
      Utilities.unzip(yopApi_(key, 'get', info.file).getBlob()).forEach(function (b) {
        var p = JSON.parse(b.getDataAsString('UTF-8'));
        files[b.getName()] = Array.isArray(p) ? p : (p.rows || []);
      });
      return files;
    }
    if (info.status === 'FAILED') throw new Error('отчёт «Стоимость услуг» за ' + d1 + '–' + d2 + ' не собрался у Маркета');
  }
  throw new Error('отчёт «Стоимость услуг» за ' + d1 + '–' + d2 + ' не дождались за 3 минуты');
}

/**
 * Разложить файлы отчёта услуг в кэш: удержания по заказам, тарифы, расходы дня.
 * v2.3.0: track — { день: 1 } дней, которые потом будут перечитаны; что каждый из них добавил в удержания
 * по заказам, пишется в cache.svcRecent[день], чтобы при перечитке вычесть и положить заново. lo..hi — окно
 * отчёта: строка с датой вне окна (или без даты) считается последним днём окна.
 */
function yopAddServices_(cache, files, track, lo, hi) {
  Object.keys(files).forEach(function (name) {
    files[name].forEach(function (r) {
      var day = String(r.serviceDate || r.serviceDateTime || '').slice(0, 10), rule, val;
      var dd = lo && hi ? (day >= lo && day <= hi ? day : hi) : day;
      if (YOP_ORDER_RULES[name] || (r.orderId && !YOP_DAY_RULES[name])) {
        rule = YOP_ORDER_RULES[name] || ['прочее', 'servicePrice'];
        val = rule[0] === 'буст' ? yopNum_(r.prepaid) + yopNum_(r.postpaid) + yopNum_(r.bonusPaid) : yopNum_(r[rule[1]]);
        if (rule[1] === 'servicePrice') val += yopNum_(r.netting);   // v2.1.1: servicePrice — лишь остаток сверх взаимозачёта
        if (!r.orderId || !val) return;
        var key = r.orderId + '|' + (YOP_NO_SKU[name] ? '' : (r.shopSku || ''));
        var slot = cache.svc[key] || (cache.svc[key] = {});
        var rec = track && track[dd] ? (cache.svcRecent[dd] || (cache.svcRecent[dd] = {})) : null;
        var put = function (k, v) {
          slot[k] = Math.round(((slot[k] || 0) + v) * 100) / 100;
          if (rec) { var x = rec[key] || (rec[key] = {}); x[k] = Math.round(((x[k] || 0) + v) * 100) / 100; }
        };
        put(rule[0], val);
        // v2.2.0: надбавка за просрочку отгрузки FBS лежит в той же строке размещения отдельным полем — в «прочее»
        if (name === 'placement.json' && yopNum_(r.qualityIndexAmount)) put('прочее', yopNum_(r.qualityIndexAmount));
        if (name === 'placement.json' && r.tariff != null && r.orderCreationDateTime) {
          cache.tariffs[String(r.orderCreationDateTime).slice(0, 10) + '|' + (r.shopSku || '')] = Number(r.tariff);
        }
      } else {
        if (name.indexOf('paid_storage') === 0) rule = ['хранение', 'paidStorage'];
        else rule = YOP_DAY_RULES[name] || ['прочее', 'servicePrice'];
        val = yopNum_(r[rule[1]]) || yopNum_(r.servicePrice);
        if (!dd || !val) return;
        var dc = cache.dayCost[dd] || (cache.dayCost[dd] = {});
        dc[rule[0]] = Math.round(((dc[rule[0]] || 0) + val) * 100) / 100;
      }
    });
  });
}

/**
 * v2.3.0. Какие дни начислений [lo; hi] читать: ещё не прочитанные и (с recheckFrom) перечитываемые — те,
 * у которых есть запись svcRecent (что они добавили в кэш). День, прочитанный до v2.3.0 без такой записи,
 * не перечитывается: вычесть его старый вклад нечем, иначе удержания сложились бы дважды.
 */
function yopSvcDaysToFetch_(cache, lo, hi, recheckFrom) {
  var out = [];
  for (var d = lo; d <= hi; d = yopAddDays_(d, 1)) {
    if (cache.svcDays.indexOf(d) < 0 || (recheckFrom && d >= recheckFrom && cache.svcRecent.hasOwnProperty(d))) out.push(d);
  }
  return out;
}

/** v2.3.0. Вычесть из кэша всё, что добавил день начислений `d` (перед его перечиткой), и его расходы дня. */
function yopUndoServiceDay_(cache, d) {
  var rec = cache.svcRecent[d] || {};
  Object.keys(rec).forEach(function (key) {
    var slot = cache.svc[key];
    if (!slot) return;
    Object.keys(rec[key]).forEach(function (k) {
      var v = Math.round(((slot[k] || 0) - rec[key][k]) * 100) / 100;
      if (Math.abs(v) < 0.005) delete slot[k]; else slot[k] = v;
    });
    if (!Object.keys(slot).length) delete cache.svc[key];
  });
  delete cache.svcRecent[d];
  delete cache.dayCost[d];
}

/**
 * v2.3.0. Отчёт услуг по дням `days` сплошными отрезками. Отчёт скачивается ДО того, как старое вычтено: сбой
 * Маркета не оставит дыру. Дни с trackFrom и позже записываются в svcRecent — их перечитает следующий прогон.
 */
function yopCollectServices_(cache, k, days, trackFrom) {
  var runs = [], cur = null, prev = null;
  days.forEach(function (d) {
    if (cur && d === yopAddDays_(prev, 1)) cur[1] = d; else runs.push(cur = [d, d]);
    prev = d;
  });
  runs.forEach(function (run) {
    var files = yopServicesReport_(k.apiKey, k.businessId, run[0], run[1]), track = {};
    for (var x = run[0]; x <= run[1]; x = yopAddDays_(x, 1)) {
      yopUndoServiceDay_(cache, x);
      if (trackFrom && x >= trackFrom) { track[x] = 1; cache.svcRecent[x] = {}; }
      if (cache.svcDays.indexOf(x) < 0) cache.svcDays.push(x);
    }
    yopAddServices_(cache, files, track, run[0], run[1]);
  });
  return runs.length;
}

/**
 * v2.0.0. Одно окно дат: заказы (созданные + сменившие статус) и отчёт услуг.
 * v2.3.0: recheckFrom — с какого дня перечитать уже прочитанные начисления (последний кусок прогона).
 */
function yopCollectWindow_(cache, k, d1, d2, recheckFrom) {
  k.campaigns.forEach(function (c) {
    yopOrders_(k.apiKey, c, { dateFrom: d1, dateTo: d2 }).concat(
      yopOrders_(k.apiKey, c, { updateFrom: d1, updateTo: d2 })).forEach(function (o) {
      if (!o.fake) cache.orders[String(o.id)] = yopOrderRecord_(o);
    });
  });
  var lo = recheckFrom && recheckFrom < d1 ? recheckFrom : d1;
  yopCollectServices_(cache, k, yopSvcDaysToFetch_(cache, lo, d2, recheckFrom),
    recheckFrom || yopAddDays_(d2, -YOP_SVC_RECHECK + 1));
  cache.lastDay = d2;
}

/**
 * v2.0.0. Докачать кабинет по день `upto` включительно — все дни после последнего скачанного.
 * Нового кабинета нет в кэше: история за 42 дня докачивается кусками по 7 дней. Кусок начинается,
 * только если до лимита исполнения хватает времени. Возвращает true, когда кабинет догнан.
 */
function yopCollectCabinet_(name, k, upto, t0) {
  if (!k) throw new Error('нет строки на листе «' + YOP_SH.keys + '»');
  if (!k.campaigns.length) throw new Error('на листе «' + YOP_SH.keys + '» нет ни одной кампании (FBS/FBY)');
  var cache = yopCacheLoad_(name), floor = yopAddDays_(upto, -YOP_KEEP_DAYS + 1);
  var day = cache.lastDay ? yopAddDays_(cache.lastDay, 1) : floor, chunks = 0;
  if (day < floor) day = floor;                                  // долгий простой — не глубже окна кэша
  var fresh = !cache.lastDay, recheck = yopAddDays_(upto, -YOP_SVC_RECHECK + 1), rechecked = 0;
  while (day <= upto) {
    if (Date.now() - t0 > YOP_START_LIMIT_MS) break;             // остаток — в следующем шаге очереди
    var end = yopAddDays_(day, YOP_CHUNK_DAYS - 1);
    if (end > upto) end = upto;
    yopCollectWindow_(cache, k, day, end, end === upto ? recheck : null);
    yopCachePrune_(cache, upto);
    yopCacheSave_(name, cache);
    chunks++;
    day = yopAddDays_(end, 1);
  }
  // v2.3.0: вчера уже скачано (повторный 1️⃣) — всё равно перечитать свежие дни начислений
  if (!chunks && cache.lastDay >= upto && Date.now() - t0 <= YOP_START_LIMIT_MS) {
    rechecked = yopCollectServices_(cache, k, yopSvcDaysToFetch_(cache, recheck, upto, recheck), recheck);
    if (rechecked) { yopCachePrune_(cache, upto); yopCacheSave_(name, cache); }
  }
  yopLog_(name + ': ' + (fresh && chunks ? 'новый кабинет, история с ' + yopRu_(floor) + '; ' : '') +
    'кусков ' + chunks + (rechecked ? ', начисления последних дней перечитаны' : '') +
    ', скачано по ' + (cache.lastDay ? yopRu_(cache.lastDay) : '—') +
    ', заказов в кэше ' + Object.keys(cache.orders).length);
  yopCabState_(name, { lastDay: cache.lastDay || '', orders: Object.keys(cache.orders).length });
  return !!cache.lastDay && cache.lastDay >= upto;
}

/**
 * v2.0.0. Данные юнитки кабинета: карточки (название, цена в кабинете, статусы по кампаниям) и
 * доступные остатки на складах FBY и FBS. Кладутся файлом в папку кэша, лист собирается в конце.
 */
function yopCollectUnitData_(name, k) {
  var offers = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/offer-mappings?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, { archived: false }).getContentText()).result || {};
    (res.offerMappings || []).forEach(function (m) {
      var o = m.offer || {}, st = {};
      (o.campaigns || []).forEach(function (c) { st[String(c.campaignId)] = c.status; });
      offers[String(o.offerId)] = {
        name: o.name || '', price: (o.basicPrice || {}).value || null,
        fbyStatus: k.fby ? st[String(k.fby)] || '' : '', fbsStatus: k.fbs ? st[String(k.fbs)] || '' : ''
      };
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.offerMappings || []).length);
  var msk = null, bids = null, minPromo = null, promo = null;
  try { msk = yopMoscowWarehouses_(k); } catch (e) { yopLog_(name + ': склады Маркета не получены — ' + e.message); }
  var fby = yopStocks_(k, k.fby, msk), fbs = yopStocks_(k, k.fbs, null);
  var stocks = { fby: fby.all, fbs: fbs.all, fbyMsk: msk ? fby.msk : null };
  try { bids = yopBids_(k); } catch (e) { yopLog_(name + ': текущие ставки буста не получены — ' + e.message); }
  try { minPromo = yopMinPromo_(k); } catch (e) { yopLog_(name + ': минимум для акции не получен — ' + e.message); }
  try { promo = yopPromos_(k); } catch (e) { yopLog_(name + ': акции не получены — ' + e.message); }
  var data = { at: new Date().toISOString(), offers: offers, stocks: stocks, bids: bids, minPromo: minPromo, promo: promo };
  yopJsonSave_(yopUnitDataName_(name), data);
  yopLog_(name + ': юнитка — карточек ' + Object.keys(offers).length + ', артикулов с остатком FBY ' +
    Object.keys(stocks.fby).length + ', FBS ' + Object.keys(stocks.fbs).length + ', со ставкой буста ' +
    (bids ? Object.keys(bids).length : '—') + ', в акциях ' + (promo ? Object.keys(promo).filter(function (s) {
      return promo[s].in; }).length : '—'));
  yopCabState_(name, { unitAt: data.at, offers: Object.keys(offers).length });
  return data;
}

/**
 * Доступный остаток (AVAILABLE) по артикулам на всех складах кампании: { all, msk }.
 * v2.3.0: msk — { id склада: 1 } складов Москвы; по ним остаток считается ещё и отдельно.
 */
function yopStocks_(k, campaign, mskWh) {
  var out = {}, msk = {}, token = null, res;
  if (!campaign) return { all: out, msk: msk };
  do {
    var url = '/v2/campaigns/' + campaign + '/offers/stocks?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.warehouses || []).forEach(function (w) {
      (w.offers || []).forEach(function (o) {
        (o.stocks || []).forEach(function (s) {
          if (s.type !== 'AVAILABLE' || !s.count) return;
          var id = String(o.offerId);
          out[id] = (out[id] || 0) + Number(s.count);
          if (mskWh && mskWh[String(w.warehouseId)]) msk[id] = (msk[id] || 0) + Number(s.count);
        });
      });
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.warehouses || []).length);
  return { all: out, msk: msk };
}

/**
 * v2.3.0. Склады Маркета в Москве и области: GET /v2/warehouses (id, название, город). Москва — склады
 * Софьино («МО Софьино …») и всё с городом «Москва»; возвратные (Домодедово возвратный) не в счёт — там
 * не продаваемый остаток. Возвращает { id: 1 }.
 */
function yopMoscowWarehouses_(k) {
  var out = {};
  var ws = (JSON.parse(yopApi_(k.apiKey, 'get', '/v2/warehouses').getContentText()).result || {}).warehouses || [];
  ws.forEach(function (w) {
    var name = String(w.name || ''), city = String((w.address || {}).city || '');
    if ((/софьино/i.test(name) || /софьин/i.test(city) || city === 'Москва') && !/возврат/i.test(name)) out[String(w.id)] = 1;
  });
  return out;
}

/** v2.3.0. «Минимум для акции» по артикулам (offer-prices, price.minimumForBestseller) — цена, ниже которой товар не идёт в акции. */
function yopMinPromo_(k) {
  var out = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/offer-prices?limit=200' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.offers || []).forEach(function (o) {
      var m = (o.price || {}).minimumForBestseller;
      if (m != null) out[String(o.offerId)] = Number(m);
    });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.offers || []).length);
  return out;
}

var YOP_PROMO_STATUS = {
  AUTO: 'участвует — добавил Маркет', PARTIALLY_AUTO: 'участвует частично — добавил Маркет', MANUAL: 'участвует — добавлен вами',
  MINIMUM_FOR_PROMOS: 'участвует по «минимуму для акции»', RENEWED: 'участвует — перенесён из прошлой акции',
  NOT_PARTICIPATING: 'не участвует', RENEW_FAILED: 'не перенесён из прошлой акции', NOT_ACTIVE: 'не активен'
};

/**
 * v2.3.0. Участие в акциях Маркета по артикулам: POST promos (список акций кабинета) → promos/offers каждой.
 * На артикул — одна запись: акция, где он участвует, иначе первая, куда его можно добавить.
 * { артикул: { promo: название, status: текст, max: макс. цена для участия, in: участвует ли } }.
 */
function yopPromos_(k) {
  var out = {};
  var promos = (JSON.parse(yopApi_(k.apiKey, 'post', '/v2/businesses/' + k.businessId + '/promos', {}).getContentText()).result || {}).promos || [];
  promos.forEach(function (p) {
    var token = null, res;
    do {
      var url = '/v2/businesses/' + k.businessId + '/promos/offers?limit=500' + (token ? '&page_token=' + encodeURIComponent(token) : '');
      res = JSON.parse(yopApi_(k.apiKey, 'post', url, { promoId: p.id }).getContentText()).result || {};
      (res.offers || []).forEach(function (o) {
        var sku = String(o.offerId), st = String(o.status || ''), isIn = st !== 'NOT_PARTICIPATING' && st !== 'RENEW_FAILED' && st !== 'NOT_ACTIVE';
        if (out[sku] && (out[sku].in || !isIn)) return;
        var dp = (o.params || {}).discountParams || {};
        out[sku] = { promo: p.name || p.id, status: YOP_PROMO_STATUS[st] || st, in: isIn,
          max: dp.maxPromoPrice != null ? Number(dp.maxPromoPrice) : (dp.promoPrice != null ? Number(dp.promoPrice) : null) };
      });
      token = (res.paging || {}).nextPageToken;
    } while (token && (res.offers || []).length);
  });
  return out;
}
/**
 * v2.1.0. Текущие ставки буста продаж по артикулам магазина (bids/info): в ответе доли процента в сотых
 * (1650 = 16,5 %), как bidFee в заказе. Артикула нет в ответе — буст по нему сейчас не включён (ставка 0).
 */
function yopBids_(k) {
  var out = {}, token = null, res;
  do {
    var url = '/v2/businesses/' + k.businessId + '/bids/info?limit=500' + (token ? '&page_token=' + encodeURIComponent(token) : '');
    res = JSON.parse(yopApi_(k.apiKey, 'post', url, {}).getContentText()).result || {};
    (res.bids || []).forEach(function (b) { out[String(b.sku)] = Number(b.bid || 0) / 10000; });
    token = (res.paging || {}).nextPageToken;
  } while (token && (res.bids || []).length);
  return out;
}


/* ==================== 04_модель.js ==================== */

/* МОДЕЛЬ — вся логика расчёта.
 *
 * Из каких заказов берутся коэффициенты, как из них получается прибыль заказов дня, как считается
 * факт дня и экономика одной штуки для юнитки. Файл не ходит ни в Маркет, ни в таблицу — только считает.
 *
 * Кэш кабинета (его собирает «03_сбор.js», хранит «02_настройки.js»):
 *   orders  { номер заказа: { d: дата заказа, st: статус, it: [[артикул, шт, цена, ставка буста, доставлено шт, скидка Маркета]] } }
 *   svc     { "заказ|артикул": { статья: ₽ } }  — факт удержаний Маркета по заказу (отчёт «Стоимость услуг»);
 *           «заказ|» без артикула — удержания на весь заказ, делятся по штукам
 *   tariffs { "дата заказа|артикул": тариф комиссии, % }
 *   dayCost { дата: { показы, хранение, подписка, прочее } } — расходы дня, к заказам не привязаны
 */

var YOP = {
  COHORT_FROM: 35, COHORT_TO: 14,  // дней назад: заказы, чья судьба уже известна — из них выкуп и доли расходов
  MILE_FROM: 21, MILE_TO: 8,       // дней назад: свежая ставка средней мили (меняется быстрее выкупа)
  TARIFF_DAYS: 14,                 // дней назад: окно действующего тарифа комиссии
  MIN_UNITS: 30,                   // у артикула меньше штук в когорте — берутся коэффициенты кабинета
  DEFAULT_TARIFF: 49,
  TAX: 0.25,                       // налог, как в юнитке: минус 25 % от маржи
  FACT_AGE: 14,                    // с какого возраста дня (дней назад) в «по дням» пишется факт
  UNIT_DAYS: 30,                   // юнитка: окно продаж и рекламы за показы
  UNIT_PRICE_DAYS: 7               // юнитка: окно фактической цены продажи и ставки буста
};
var YOP_ORDER_COSTS = ['комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее'];
var YOP_COSTS = YOP_ORDER_COSTS.concat(['себес']);
var YOP_DAY_COSTS = ['показы', 'хранение', 'подписка', 'прочее'];
var YOP_TRANSIT = { PROCESSING: 1, DELIVERY: 1, PICKUP: 1, RESERVED: 1, UNPAID: 1, PENDING: 1 };

/** Позиции заказов кэша плоским списком + штук в каждом заказе (для деления удержаний «на заказ»). */
function yopItems_(cache) {
  var items = [], units = {};
  Object.keys(cache.orders).forEach(function (oid) {
    var o = cache.orders[oid];
    o.it.forEach(function (x) {
      items.push({ oid: oid, day: o.d, sku: x[0], n: x[1], price: x[2], bid: x[3], deliv: x[4], transit: !!YOP_TRANSIT[o.st],
        spp: x.length > 5 ? x[5] : null });
      units[oid] = (units[oid] || 0) + x[1];
    });
  });
  return { items: items, units: units };
}

/** Факт удержаний Маркета по позиции заказа. */
function yopFact_(cache, it, units) {
  var out = {}, own = cache.svc[it.oid + '|' + it.sku] || {}, whole = cache.svc[it.oid + '|'] || {};
  var share = it.n / Math.max(units[it.oid] || 0, 1);
  Object.keys(own).forEach(function (k) { out[k] = (out[k] || 0) + own[k]; });
  Object.keys(whole).forEach(function (k) { out[k] = (out[k] || 0) + whole[k] * share; });
  return out;
}

/** Суммы по артикулам (и '*' — весь кабинет) за окно дат заказа. */
function yopAgg_(cache, flat, d0, d1) {
  var agg = {};
  flat.items.forEach(function (it) {
    if (it.day < d0 || it.day > d1) return;
    var f = yopFact_(cache, it, flat.units);
    [it.sku, '*'].forEach(function (key) {
      var a = agg[key] || (agg[key] = { n: 0, deliv: 0, transit: 0, gmv: 0, gmvDel: 0, bidgmv: 0 });
      a.n += it.n; a.deliv += it.deliv; a.transit += it.transit ? it.n : 0;
      a.gmv += it.price * it.n; a.gmvDel += it.price * it.deliv; a.bidgmv += it.price * it.n * it.bid;
      Object.keys(f).forEach(function (k) { a[k] = (a[k] || 0) + f[k]; });
    });
  });
  return agg;
}

/**
 * v2.2.0. Действующий тариф комиссии — тариф ПОСЛЕДНЕГО дня заказов с начислениями за TARIFF_DAYS дней
 * (по артикулу и по кабинету; в один день разные тарифы — самый частый). До v2.2.0 брался самый частый
 * за 14 дней, и после смены тарифа 01.09 модель неделю считала по старому.
 */
function yopTariffs_(cache, day) {
  var lo = yopAddDays_(day, -YOP.TARIFF_DAYS), bySku = {}, cab = {};
  var put = function (m, d, t) {
    if (!m.d || d > m.d) { m.d = d; m.c = {}; }
    if (d === m.d) m.c[t] = (m.c[t] || 0) + 1;
  };
  Object.keys(cache.tariffs).forEach(function (key) {
    var p = key.split('|'), d = p[0], sku = p.slice(1).join('|'), t = cache.tariffs[key];
    if (d < lo || d > day) return;
    put(bySku[sku] || (bySku[sku] = {}), d, t);
    put(cab, d, t);
  });
  var mode = function (m) {
    var best = null, c = m.c || {};
    Object.keys(c).forEach(function (t) { if (best === null || c[t] > c[best]) best = t; });
    return best === null ? null : Number(best);
  };
  var out = {};
  Object.keys(bySku).forEach(function (s) { out[s] = mode(bySku[s]); });
  var m = mode(cab);
  return { sku: out, cab: m === null ? YOP.DEFAULT_TARIFF : m };
}

/**
 * Коэффициенты на прогноз заказов дня `day` по каждому артикулу и по кабинету ('*').
 *   выкуп     = доставлено ÷ заказано (только заказы с известной судьбой), когорта 14–35 дней назад
 *   тариф     = действующий тариф комиссии, доля
 *   буст_k    = списано буста ÷ (сумма заказов × ставка из заказа) — какую часть ставки Маркет реально берёт
 *   доставка, перевод — доля от выручки ВЫКУПЛЕННЫХ штук (v2.2.0; Маркет берёт 5 % и 1,6 % только с доставленного,
 *                       а доля от всех заказов выглядела заниженной — 3–4,7 % вместо 5 %)
 *   миля      = ₽ на доставленную штуку по свежим заказам 8–21 день
 *   эквайринг, возврат, прочее — ₽ на заказанную штуку
 */
function yopCoefficients_(cache, flat, day, manual) {
  var agg = yopAgg_(cache, flat, yopAddDays_(day, -YOP.COHORT_FROM), yopAddDays_(day, -YOP.COHORT_TO));
  var mile = yopAgg_(cache, flat, yopAddDays_(day, -YOP.MILE_FROM), yopAddDays_(day, -YOP.MILE_TO));
  var tr = yopTariffs_(cache, day), out = {}, over = yopManualTariff_(manual, day);
  Object.keys(agg).forEach(function (key) {
    var a = agg[key], m = mile[key];
    if (!m || m.deliv < YOP.MIN_UNITS) m = mile['*'] || {};
    var known = Math.max(a.n - a.transit, 1), gd = a.gmvDel || 0;
    var t = over != null ? over : key === '*' ? tr.cab : (tr.sku[key] != null ? tr.sku[key] : tr.cab);
    out[key] = {
      когорта_шт: a.n, когорта_доставлено: a.deliv,
      выкуп: a.deliv / known,
      тариф: t / 100,
      буст_k: a.bidgmv ? (a['буст'] || 0) / a.bidgmv : 0,
      доставка: gd ? (a['доставка'] || 0) / gd : 0,
      перевод: gd ? (a['перевод'] || 0) / gd : 0,
      миля: m.deliv ? (m['миля'] || 0) / m.deliv : 0,
      эквайринг: a.n ? (a['эквайринг'] || 0) / a.n : 0,
      возврат: a.n ? (a['возврат'] || 0) / a.n : 0,
      прочее: a.n ? (a['прочее'] || 0) / a.n : 0
    };
  });
  if (!out['*']) out['*'] = { когорта_шт: 0, когорта_доставлено: 0, выкуп: 0.85, тариф: (over != null ? over : tr.cab) / 100, буст_k: 1,
    доставка: 0.05, перевод: 0.016, миля: 0, эквайринг: 0.12, возврат: 0, прочее: 0 };
  return out;
}

/** Коэффициенты артикула или, если когорта мала, кабинета (тариф при этом остаётся свой). */
function yopPick_(coef, sku) {
  var c = coef[sku];
  if (c && c.когорта_шт >= YOP.MIN_UNITS) return { c: c, src: 'артикул' };
  var base = {};
  Object.keys(coef['*']).forEach(function (k) { base[k] = coef['*'][k]; });
  if (c) base.тариф = c.тариф;
  return { c: base, src: 'кабинет' };
}

/** Прогноз по артикулу: сколько принесут его заказы дня. */
function yopPredict_(row, c, cogs) {
  var rev = row.gmv * c.выкуп;
  var cost = {
    комиссия: rev * c.тариф,
    буст: row.gmv * row.bid * c.буст_k,
    доставка: rev * c.доставка,
    миля: row.n * c.выкуп * c.миля,
    перевод: rev * c.перевод,
    эквайринг: row.n * c.эквайринг,
    возврат: row.n * c.возврат,
    прочее: row.n * c.прочее,
    себес: row.n * c.выкуп * cogs
  };
  var sum = 0;
  Object.keys(cost).forEach(function (k) { sum += cost[k]; });
  cost.выручка = rev;
  cost.ЧП = rev - sum;
  return cost;
}

/** Заказы дня по артикулам с прогнозом. cogs — { артикул: себес }, manual — тариф вручную с листа настроек. */
function yopForecast_(cache, day, cogs, flat, manual) {
  flat = flat || yopItems_(cache);
  var coef = yopCoefficients_(cache, flat, day, manual), acc = {};
  flat.items.forEach(function (it) {
    if (it.day !== day) return;
    var a = acc[it.sku] || (acc[it.sku] = { n: 0, gmv: 0, bidgmv: 0 });
    a.n += it.n; a.gmv += it.price * it.n; a.bidgmv += it.price * it.n * it.bid;
  });
  var rows = Object.keys(acc).filter(function (s) { return acc[s].n > 0; }).map(function (s) {
    var a = acc[s], row = { sku: s, n: a.n, gmv: a.gmv, price: a.gmv / a.n, bid: a.gmv ? a.bidgmv / a.gmv : 0 };
    var p = yopPick_(coef, s), cg = yopCogsOf_(cogs, s);
    var r = yopPredict_(row, p.c, cg || 0);
    Object.keys(r).forEach(function (k) { row[k] = r[k]; });
    row.coef = p.c; row.src = p.src; row.cogs = cg;
    return row;
  });
  rows.sort(function (a, b) { return b.gmv - a.gmv; });
  return { rows: rows, coef: coef };
}

/** v2.0.0. Тариф вручную с листа настроек, % — если он задан и действует для дня `day`; иначе null. */
function yopManualTariff_(manual, day) {
  if (!manual || manual.tariff == null) return null;
  if (manual.tariffFrom && day < manual.tariffFrom) return null;
  return manual.tariff;
}

/**
 * v2.0.0. ФАКТ заказов дня `day`: что Маркет по ним реально удержал (отчёт «Стоимость услуг»)
 * и сколько штук реально выкуплено. Сравнивается с прогнозом «ЧП заказов дня» — та же база:
 * до рекламы за показы, хранения, подписки и налога.
 *   выручка = цена продавца × выкупленные штуки; себес — на выкупленные штуки;
 *   известно = доля штук, у заказов которых судьба уже известна (не в пути).
 */
function yopFactDay_(cache, flat, day, cogs) {
  var r = { n: 0, known: 0, deliv: 0, выручка: 0, себес: 0, удержания: 0 };
  flat.items.forEach(function (it) {
    if (it.day !== day) return;
    var f = yopFact_(cache, it, flat.units);
    r.n += it.n;
    if (!it.transit) r.known += it.n;
    r.deliv += it.deliv;
    r.выручка += it.price * it.deliv;
    r.себес += it.deliv * (yopCogsOf_(cogs, it.sku) || 0);
    YOP_ORDER_COSTS.forEach(function (k) { r.удержания += f[k] || 0; });
  });
  r.ЧП = r.выручка - r.удержания - r.себес;
  r.известно = r.n ? r.known / r.n : 0;
  return r;
}

/**
 * v2.0.0. Юнитка: экономика одной ВЫКУПЛЕННОЙ штуки по каждому артикулу с заказами за 30 дней
 * или с остатком на складах. Коэффициенты — те же, что у прогноза заказов дня `day` (факт удержаний
 * по дозревшим заказам); цена и ставка буста — факт заказов за 7 дней, нет заказов — цена в кабинете.
 * Реклама за показы делится условно: доля от суммы заказов кабинета за 30 дней.
 * v2.3.0: так же условно — расходы дня (хранение, подписка, транзит, утилизация и прочее без номера заказа):
 * их доля от суммы заказов кабинета за 30 дней, на выкупленную штуку — цена × доля ÷ выкуп.
 */
function yopUnitRows_(cache, flat, day, cogs, manual, unitData) {
  var coef = yopCoefficients_(cache, flat, day, manual);
  var lo30 = yopAddDays_(day, -YOP.UNIT_DAYS + 1), lo7 = yopAddDays_(day, -YOP.UNIT_PRICE_DAYS + 1);
  var acc = {}, gmv30 = 0, shows = 0, dayOther = 0;
  flat.items.forEach(function (it) {
    if (it.day < lo30 || it.day > day) return;
    var a = acc[it.sku] || (acc[it.sku] = { n30: 0, n7: 0, gmv7: 0, bidgmv7: 0, lastDay: '', lastGmv: 0, lastBidGmv: 0,
      sppN: 0, sppGmv: 0, spp: 0, gmv30: 0, bidgmv30: 0, sppN30: 0, sppGmv30: 0, spp30: 0 });
    a.n30 += it.n;
    gmv30 += it.price * it.n;
    if (it.day >= lo7) { a.n7 += it.n; a.gmv7 += it.price * it.n; a.bidgmv7 += it.price * it.n * it.bid; }
    if (it.day >= lo7 && it.spp != null) { a.sppN += it.n; a.sppGmv += it.price * it.n; a.spp += it.spp * it.n; }
    a.gmv30 += it.price * it.n; a.bidgmv30 += it.price * it.n * it.bid;                  // v2.2.2: запасное окно 30 дней
    if (it.spp != null) { a.sppN30 += it.n; a.sppGmv30 += it.price * it.n; a.spp30 += it.spp * it.n; }
    if (it.day > a.lastDay) { a.lastDay = it.day; a.lastGmv = 0; a.lastBidGmv = 0; }
    if (it.day === a.lastDay) { a.lastGmv += it.price * it.n; a.lastBidGmv += it.price * it.n * it.bid; }
  });
  Object.keys(cache.dayCost).forEach(function (d) {
    if (d < lo30 || d > day) return;
    var dc = cache.dayCost[d];
    shows += dc['показы'] || 0;
    dayOther += (dc['хранение'] || 0) + (dc['подписка'] || 0) + (dc['прочее'] || 0);
  });
  var drr = gmv30 ? shows / gmv30 : 0, drrDay = gmv30 ? dayOther / gmv30 : 0;
  var offers = (unitData && unitData.offers) || {}, st = (unitData && unitData.stocks) || { fby: {}, fbs: {} };
  var minPromo = (unitData && unitData.minPromo) || null, promo = (unitData && unitData.promo) || null;
  var skus = {};
  Object.keys(acc).forEach(function (s) { skus[s] = 1; });
  Object.keys(st.fby || {}).concat(Object.keys(st.fbs || {})).forEach(function (s) { skus[s] = 1; });
  var rows = Object.keys(skus).map(function (s) {
    var a = acc[s] || { n30: 0, n7: 0, gmv7: 0, bidgmv7: 0, sppN: 0, sppGmv: 0, spp: 0, gmv30: 0, bidgmv30: 0, sppN30: 0, sppGmv30: 0,
      spp30: 0 }, o = offers[s] || {}, p = yopPick_(coef, s);
    // v2.2.2: за 7 дней заказов нет — цена, ставка буста и СПП по заказам за 30 дней (раньше ячейки стояли пустыми,
    // и это выглядело как «не подтянулось»: у редких артикулов заказы бывают раз в две недели)
    var w7 = a.n7 > 0, nW = w7 ? a.n7 : a.n30, gW = w7 ? a.gmv7 : a.gmv30, bW = w7 ? a.bidgmv7 : a.bidgmv30;
    var sN = w7 ? a.sppN : a.sppN30, sG = w7 ? a.sppGmv : a.sppGmv30, sS = w7 ? a.spp : a.spp30;
    var price7 = nW ? gW / nW : null;
    var shop7 = sN ? (sG - sS) / sN : null, spp7 = sG ? sS / sG : null;
    return {
      sku: s, name: o.name || '', status: [o.fbyStatus ? 'FBY: ' + o.fbyStatus : '', o.fbsStatus ? 'FBS: ' + o.fbsStatus : '']
        .filter(String).join(', '),
      priceCab: o.price || null, price7: price7, price: price7 || o.price || 0, shop7: shop7, spp7: spp7,
      n30: a.n30, fby: (st.fby || {})[s] || 0, fbs: (st.fbs || {})[s] || 0,
      fbyMsk: st.fbyMsk ? st.fbyMsk[s] || 0 : null,                                     // v2.3.0: null — склады не получены
      minPromo: minPromo && minPromo.hasOwnProperty(s) ? minPromo[s] : null,
      promo: promo && promo[s] ? promo[s] : null,
      bid: gW ? bW / gW : 0, drr: drr, drrDay: drrDay, factDays: w7 ? YOP.UNIT_PRICE_DAYS : (a.n30 ? YOP.UNIT_DAYS : null),
      bidNow: yopBidNow_(acc[s], lo7, unitData && unitData.bids, s),
      coef: p.c, src: p.src, cogs: yopCogsOf_(cogs, s)
    };
  });
  rows.sort(function (x, y) { return y.n30 - x.n30 || y.fby + y.fbs - x.fby - x.fbs; });
  return { rows: rows, drr: drr, drrDay: drrDay, shows: shows, dayOther: dayOther, gmv30: gmv30 };
}

/**
 * v2.1.2. Ставка буста «сейчас»: средняя по заказам последнего дня с заказами (не старше 7 дней) — Маркет
 * пишет в заказ ставку, действовавшую в момент заказа. bids/info отдаёт только ставки, выставленные через API
 * (у кабинетов там старые артикулы, которых нет в каталоге), поэтому он — лишь запасной источник.
 * Нет ни того, ни другого — пусто, и сценарий берёт среднюю за 7 дней.
 */
function yopBidNow_(a, lo7, apiBids, sku) {
  if (a && a.lastDay >= lo7 && a.lastGmv) return a.lastBidGmv / a.lastGmv;
  if (apiBids && apiBids.hasOwnProperty(sku)) return apiBids[sku];
  return null;
}

/**
 * v2.1.0. Экономика выкупленной штуки той же формулой, что стоит в ячейках юнитки (для тестов и сверки).
 * over — { price, bid }: сценарий «своя цена и ставка буста»; без него — факт за 7 дней.
 */
function yopUnitCalc_(x, over) {
  var c = x.coef, P = over && over.price != null ? over.price : x.price, bid = over && over.bid != null ? over.bid : x.bid;
  var b = c.выкуп || 1, cg = x.cogs || 0;
  var m = {
    комиссия: P * c.тариф, буст: P * bid * c.буст_k / b, доставка: P * c.доставка, миля: c.миля,
    перевод: P * c.перевод, эквайринг: c.эквайринг / b, возврат: c.возврат / b, прочее: c.прочее / b
  };
  var mp = 0;
  Object.keys(m).forEach(function (k) { mp += m[k]; });
  var before = P - mp - cg, shows = P * x.drr / b, dayc = P * (x.drrDay || 0) / b;         // v2.3.0: расходы дня условно
  var margin = before - shows - dayc, tax = margin * YOP.TAX;
  return { расходы: mp, доПоказов: before, показы: shows, расходыДня: dayc, маржа: margin, налог: tax, ЧП: margin - tax };
}


/* ==================== 05_листы.js ==================== */

/* ЛИСТЫ КНИГИ.
 *
 * «🧾 ЧП ЯМ по заказам»    — вчерашние заказы по артикулам. Каждый прогон перезаписывается целиком.
 *                             Синие колонки — коэффициенты модели, остальное — формулы от них.
 * «📈 ЧП ЯМ по дням»       — история по кабинетам. Прогон добавляет блок за вчера наверх; строки
 *                             вчерашнего дня считаются формулами из листа по заказам, а перед следующим
 *                             прогоном замораживаются значениями — прошлые дни больше не меняются.
 *                             Колонки факта (X–Z) дописываются каждым прогоном по дням старше 14 дней.
 * «🧮 ЧП ЯМ юнитка»        — экономика одной выкупленной штуки по каждому артикулу на данных Маркета.
 * «⚙️ ЧП ЯМ коэффициенты»  — из скольких заказов и за какие даты посчитан каждый коэффициент.
 * «📖 ЧП ЯМ как считается» — логика словами.
 */

var YOP_BLUE = '#dde9ff';
var YOP_GREY = '#f1f1f1';

/** Прогноз дня по всем включённым кабинетам, у которых есть ключ. */
function yopForecastAll_(day) {
  var keys = yopKeys_(), out = [];
  yopSettings_().cabinets.forEach(function (c) {
    if (!keys[c.name]) return;                                   // ждём ключ — кабинет не считается
    var cache = yopCacheLoad_(c.name), cogs = yopCogs_(c), flat = yopItems_(cache);
    var f = yopForecast_(cache, day, yopCogsValues_(cogs), flat, c);
    out.push({ name: c.name, settings: c, cogs: cogs, rows: f.rows, coef: f.coef, dayCost: cache.dayCost[day] || {},
      cache: cache, flat: flat });
  });
  return out;
}

// --- «🧾 ЧП ЯМ по заказам» ---------------------------------------------------------------

var YOP_DETAIL_HEAD = ['Кабинет', 'Артикул', 'Заказано, шт', 'Цена ср., ₽', 'Сумма заказов, ₽', 'Ставка буста ср.',
  'Выкуп', 'Тариф комиссии', 'Буст: доля ставки к списанию', 'Доставка, % выручки выкупленного', 'Перевод денег, % выручки выкупленного',
  'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на шт', 'Себес, ₽',
  'Выручка (прогноз), ₽', 'Комиссия, ₽', 'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽',
  'Эквайринг, ₽', 'Невыкупы/возвраты, ₽', 'Прочее по заказу, ₽', 'Себес, ₽', 'ЧП заказов, ₽', 'ЧП на заказ, ₽',
  'Маржа к сумме заказов', 'Коэффициенты по', 'Когорта, шт', 'Себес найден'];

function yopCogsSrc_(cab, sku) {
  var m = yopCogsEntry_(cab.cogs, sku);
  return m ? m.src : 'НЕТ — себес 0';
}

function yopWriteDetail_(day, all) {
  var sh = yopSheet_(YOP_SH.detail), rows = [], r = YOP_HEAD_ROW + 1;
  all.forEach(function (cab) {
    cab.rows.forEach(function (x) {
      var c = x.coef;
      rows.push([cab.name, x.sku, x.n, x.price, '=C' + r + '*D' + r, x.bid,
        c.выкуп, c.тариф, c.буст_k, c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее,
        yopCogsFormula_(cab.cogs, '$A' + r, '$B' + r),
        '=E' + r + '*G' + r, '=Q' + r + '*H' + r, '=E' + r + '*F' + r + '*I' + r, '=Q' + r + '*J' + r,   // v2.2.0: доставка и перевод — от выручки
        '=C' + r + '*G' + r + '*L' + r, '=Q' + r + '*K' + r, '=C' + r + '*M' + r, '=C' + r + '*N' + r,
        '=C' + r + '*O' + r, '=C' + r + '*G' + r + '*P' + r,
        '=Q' + r + '-SUM(R' + r + ':Z' + r + ')', '=IFERROR(AA' + r + '/C' + r + ',0)', '=IFERROR(AA' + r + '/E' + r + ',0)',
        x.src, c.когорта_шт, yopCogsSrc_(cab, x.sku)]);
      r++;
    });
  });
  var flt = yopFilterTake_(sh);
  sh.clear();
  yopTitle_(sh, 'ЧП по заказам за ' + yopRu_(day) + ' — прогноз по истории своих заказов (' + YOP_VERSION + ')',
    'Лист перезаписывается каждым прогоном. Синие колонки G–O — коэффициенты модели: их можно поменять руками, ' +
    'колонки Q–AC пересчитаются. Себес (P) — формулой: лист «' + YOP_SH.cogs + '», если там есть артикул, иначе юнитка кабинета.');
  yopHeader_(sh, YOP_DETAIL_HEAD, { 1: 130, 2: 300 });
  if (rows.length) {
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 2, n, 1).setNumberFormat('@');                // артикул — текстом ДО записи: артикул из одних цифр не станет числом
    sh.getRange(R, 1, n, rows[0].length).setValues(yopFx_(rows));
    sh.getRange(R, 4, n, 2).setNumberFormat('#,##0');
    sh.getRange(R, 6, n, 6).setNumberFormat('0.0%');
    sh.getRange(R, 12, n, 5).setNumberFormat('#,##0.00');
    sh.getRange(R, 17, n, 12).setNumberFormat('#,##0');
    sh.getRange(R, 29, n, 1).setNumberFormat('0.0%');
    sh.getRange(R, 7, n, 9).setBackground(YOP_BLUE);
  }
  yopFilterPut_(sh, flt, YOP_DETAIL_HEAD.length);
  return rows.length;
}

// --- «📈 ЧП ЯМ по дням» ---------------------------------------------------------------------

var YOP_DAYS_HEAD = ['Дата', 'Кабинет', 'Заказано, шт', 'Сумма заказов, ₽', 'Выручка (прогноз), ₽', 'Комиссия, ₽',
  'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽', 'Эквайринг, ₽', 'Невыкупы/возвраты, ₽',
  'Прочее по заказам, ₽', 'Себес, ₽', 'ЧП заказов дня (прогноз), ₽', 'Реклама за показы (факт дня), ₽',
  'Хранение (факт дня), ₽', 'Подписка (факт дня), ₽', 'Прочие расходы дня, ₽', 'Маржа до налога, ₽',
  'Налог 25% (как в юнитке), ₽', 'ЧП, ₽', 'Маржа к выручке', 'Факт: ЧП заказов дня, ₽', 'Факт − прогноз, ₽',
  'Судьба известна, % заказов'];
var YOP_DAYS_FACT_COL = 24;                                      // X
// колонки «по дням» C..N ← колонки листа по заказам
var YOP_DAYS_SRC = ['C', 'E', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
var YOP_ORDER_KEYS = ['выручка', 'комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее', 'себес'];
var YOP_REBUILD_DAYS = 21;

/** Строки блока одного дня. live = строки кабинетов формулами из листа по заказам (только для «вчера»). */
function yopDayBlock_(day, all, firstRow, live, detailLast) {
  var out = [], r = firstRow;
  all.forEach(function (cab) {
    var row = [yopRu_(day), cab.name];
    if (live) {
      YOP_DAYS_SRC.forEach(function (c) {
        row.push("=SUMIFS('" + YOP_SH.detail + "'!$" + c + '$5:$' + c + '$' + detailLast + ",'" + YOP_SH.detail +
          "'!$A$5:$A$" + detailLast + ',$B' + r + ')');
      });
    } else {
      var s = function (k) { return cab.rows.reduce(function (a, x) { return a + x[k]; }, 0); };
      row.push(s('n'), Math.round(s('gmv')));
      YOP_ORDER_KEYS.forEach(function (k) { row.push(Math.round(s(k))); });
    }
    var dc = cab.dayCost;
    row.push('=E' + r + '-SUM(F' + r + ':N' + r + ')',
      Math.round(dc['показы'] || 0), Math.round(dc['хранение'] || 0), Math.round(dc['подписка'] || 0), Math.round(dc['прочее'] || 0),
      '=O' + r + '-SUM(P' + r + ':S' + r + ')', '=T' + r + '*' + Math.round(YOP.TAX * 100) + '/100', '=T' + r + '-U' + r,
      '=IFERROR(V' + r + '/E' + r + ',0)', '', '', '');
    out.push(row);
    r++;
  });
  var a = firstRow, b = r - 1, tot = [yopRu_(day), 'Все кабинеты'];
  'CDEFGHIJKLMNOPQRSTUV'.split('').forEach(function (c) { tot.push(b >= a ? '=SUM(' + c + a + ':' + c + b + ')' : 0); });
  tot.push('=IFERROR(V' + r + '/E' + r + ',0)', '', '', '');
  out.push(tot);
  return out;
}

function yopDaysLayoutOk_(sh) {
  if (!sh || String(sh.getRange(YOP_HEAD_ROW, YOP_DAYS_FACT_COL).getValue()).indexOf('Факт: ЧП') !== 0) return false;
  var n = sh.getLastRow() - YOP_HEAD_ROW;                         // v2.0.1: ячейки с ошибкой формулы не замораживаются
  if (n < 1) return true;                                        // значениями — такой лист собирается заново
  return !sh.getRange(YOP_HEAD_ROW + 1, 3, n, YOP_DAYS_HEAD.length - 2).getDisplayValues()
    .some(function (r) { return r.some(function (x) { return String(x).charAt(0) === '#'; }); });
}

function yopDaysSheet_() {
  var sh = yopSheet_(YOP_SH.days);
  if (!yopDaysLayoutOk_(sh)) {
    sh.clear();                                   // старая раскладка колонок — лист собирается заново
    yopTitle_(sh, 'ЧП ЯМ по дням — прибыль заказов дня плюс расходы дня (' + YOP_VERSION + ')',
      'Новый день добавляется сверху каждым прогоном; строки вчерашнего дня — формулами из «' + YOP_SH.detail +
      '», перед следующим прогоном замораживаются значениями. Реклама за показы, хранение, подписка — факт начисления дня, ' +
      'по артикулам не делятся. Колонки X–Z (факт) дописываются сами, когда дню исполнится ' + YOP.FACT_AGE + ' дней.');
    yopHeader_(sh, YOP_DAYS_HEAD, { 1: 90, 2: 140 });
  }
  return sh;
}

/** Заморозить формулы истории значениями и убрать блок дня `day`, если он уже есть (перезапуск). */
function yopFreezeAndDrop_(sh, day) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return;
  var rng = sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, YOP_DAYS_HEAD.length);
  rng.setValues(rng.getValues());
  var dates = sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, 1).getDisplayValues(), ru = yopRu_(day);
  for (var i = dates.length - 1; i >= 0; i--) {
    if (dates[i][0] === ru) sh.deleteRow(YOP_HEAD_ROW + 1 + i);
  }
  while (sh.getLastRow() > YOP_HEAD_ROW && !sh.getRange(YOP_HEAD_ROW + 1, 1).getDisplayValue()) sh.deleteRow(YOP_HEAD_ROW + 1);
}

function yopInsertBlock_(sh, block) {
  sh.insertRowsBefore(YOP_HEAD_ROW + 1, block.length + 1);
  sh.getRange(YOP_HEAD_ROW + 1, 1, block.length + 1, YOP_DAYS_HEAD.length).clearFormat();
  sh.getRange(YOP_HEAD_ROW + 1, 1, block.length, block[0].length).setValues(yopFx_(block));
  yopDaysFormat_(sh, YOP_HEAD_ROW + 1, block.length);
}

function yopDaysFormat_(sh, row, n) {
  sh.getRange(row, 3, n, 20).setNumberFormat('#,##0');
  sh.getRange(row, 23, n, 1).setNumberFormat('0.0%');
  sh.getRange(row, 24, n, 2).setNumberFormat('#,##0');
  sh.getRange(row, 26, n, 1).setNumberFormat('0%');
  sh.getRange(row, 24, n, 3).setBackground('#e6f4ea');
  sh.getRange(row + n - 1, 1, 1, YOP_DAYS_HEAD.length).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(row, 15, n, 1).setFontWeight('bold');
  sh.getRange(row, 22, n, 1).setFontWeight('bold');
}

/**
 * v2.0.0. Факт по дням старше FACT_AGE: колонки X (факт ЧП заказов), Y (факт − прогноз), Z (доля
 * заказов с известной судьбой) по каждой строке кабинета и по строке «Все кабинеты». Дни, которых
 * уже нет в кэше (старше 42 дней), не трогаются — там остаётся последний записанный факт.
 */
function yopUpdateFacts_(sh, all, upto) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return 0;
  var n = last - YOP_HEAD_ROW, R = YOP_HEAD_ROW + 1;
  var ab = sh.getRange(R, 1, n, 2).getDisplayValues(), o = sh.getRange(R, 15, n, 1).getValues();
  var xz = sh.getRange(R, YOP_DAYS_FACT_COL, n, 3).getValues();
  var hi = yopAddDays_(upto, -YOP.FACT_AGE), lo = yopAddDays_(upto, -YOP_KEEP_DAYS + 1), memo = {}, byCab = {}, written = 0;
  all.forEach(function (c) { byCab[c.name] = c; });
  var fact = function (cabName, iso) {
    var k = cabName + '|' + iso, c = byCab[cabName];
    if (!memo.hasOwnProperty(k)) memo[k] = c ? yopFactDay_(c.cache, c.flat, iso, yopCogsValues_(c.cogs)) : null;
    return memo[k];
  };
  var totals = {};
  for (var i = 0; i < n; i++) {
    var iso = yopIso_(ab[i][0]), cab = ab[i][1];
    if (!iso || iso > hi || iso < lo) continue;
    if (cab === 'Все кабинеты') { totals[iso] = i; continue; }
    var f = fact(cab, iso);
    if (!f || !f.n) continue;
    xz[i] = [Math.round(f.ЧП), Math.round(f.ЧП - yopNum_(o[i][0])), f.известно];
    written++;
  }
  Object.keys(totals).forEach(function (iso) {
    var i = totals[iso], sum = 0, known = 0, units = 0, any = false;
    all.forEach(function (c) {
      var f = fact(c.name, iso);
      if (f && f.n) { sum += f.ЧП; known += f.known; units += f.n; any = true; }
    });
    if (any) xz[i] = [Math.round(sum), Math.round(sum - yopNum_(o[i][0])), units ? known / units : 0];
  });
  sh.getRange(R, YOP_DAYS_FACT_COL, n, 3).setValues(xz);
  return written;
}

/**
 * v2.3.0. Расходы дня (P–S) последних дней перечитки: Маркет докладывает хранение и прочее ещё день-два, а строки
 * прошлых дней на листе уже заморожены значениями. Прогон переписывает P–S из кэша и пересчитывает T–W
 * (маржа, налог, ЧП, маржа к выручке) у кабинетов и у строки «Все кабинеты». Вчерашний блок не трогается —
 * он только что записан.
 */
function yopUpdateDayCosts_(sh, all, upto) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return 0;
  var n = last - YOP_HEAD_ROW, R = YOP_HEAD_ROW + 1, lo = yopAddDays_(upto, -YOP_SVC_RECHECK + 1), byCab = {}, touched = 0;
  all.forEach(function (c) { byCab[c.name] = c; });
  var v = sh.getRange(R, 1, n, 23).getValues(), ab = sh.getRange(R, 1, n, 2).getDisplayValues(), out = [], rows = [];
  var tot = {};
  for (var i = 0; i < n; i++) {
    var iso = yopIso_(ab[i][0]), cab = ab[i][1];
    if (!iso || iso < lo || iso >= upto) continue;
    if (cab === 'Все кабинеты') { tot[iso] = i; continue; }
    var c = byCab[cab];
    if (!c) continue;
    var dc = c.cache.dayCost[iso] || {};
    var p = [Math.round(dc['показы'] || 0), Math.round(dc['хранение'] || 0), Math.round(dc['подписка'] || 0), Math.round(dc['прочее'] || 0)];
    var tt = yopNum_(v[i][14]) - p[0] - p[1] - p[2] - p[3], tax = tt * YOP.TAX, e = yopNum_(v[i][4]);
    rows.push([i, p.concat([tt, tax, tt - tax, e ? (tt - tax) / e : 0])]);
  }
  Object.keys(tot).forEach(function (iso) {
    var s = [0, 0, 0, 0, 0, 0, 0], e = 0;
    rows.forEach(function (x) {
      if (yopIso_(ab[x[0]][0]) !== iso) return;
      for (var j = 0; j < 7; j++) s[j] += x[1][j];
      e += yopNum_(v[x[0]][4]);
    });
    rows.push([tot[iso], s.concat([e ? s[6] / e : 0])]);
  });
  rows.forEach(function (x) { sh.getRange(R + x[0], 16, 1, 8).setValues([x[1]]); touched++; });
  return touched;
}

// --- «🧮 ЧП ЯМ юнитка» ----------------------------------------------------------------------

/**
 * v2.1.0. Колонки юнитки: ключ, заголовок, надпись над блоком, формат, заливка и значение строки.
 * Формулы ссылаются на колонки по ключу (L('ключ')), поэтому порядок меняется одной правкой списка.
 *   блоки: карточка и остатки → СЦЕНАРИЙ (своя цена и ставка буста) → факт за 7 дней → коэффициенты → расходы.
 * «Ваша цена» и «Ваша ставка буста» вписывает человек: прогон их не затирает (переносит по кабинету и артикулу).
 */
function yopTaxF_(e) { return e + '*' + Math.round(YOP.TAX * 100) + '/100'; }
function yopDivB_(e, L) { return '=IFERROR(' + e + '/' + L('k_buyout') + ',0)'; }

var YOP_UNIT_SPEC = [
  ['cab', 'Кабинет', '', '', '', function (x, L, cab) { return cab.name; }],
  ['sku', 'Артикул', '', '@', '', function (x) { return x.sku; }],
  ['name', 'Наименование', '', '', '', function (x) { return x.name; }],
  // v2.3.0: свой признак товара (инозитол, магний …) — фильтровать один товар по всем брендам; прогон переносит
  ['group', 'Группа товара (впишите)', '', '', 'blue', function (x, L, cab, keep) { return keep.group; }],
  ['status', 'Статус на Маркете', '', '', '', function (x) { return x.status; }],
  ['priceNow', 'Цена в кабинете сейчас, ₽', 'Карточка и остатки', 'rub', '', function (x) { return x.priceCab || ''; }],
  // v2.3.0: акции — минимум для акции (цена, ниже которой товар не идёт в акции) и участие в акциях Маркета
  ['minPromo', 'Минимум для акции, ₽', '', 'rub', '', function (x) { return x.minPromo == null ? '' : x.minPromo; }],
  ['promoMax', 'Акция: макс. цена для участия, ₽', '', 'rub', '', function (x) { return x.promo && x.promo.max != null ? x.promo.max : ''; }],
  ['promoStatus', 'Акция: участие', '', '', '', function (x) { return x.promo ? x.promo.status + ' («' + x.promo.promo + '»)' : ''; }],
  ['price7', 'Цена продажи ср. за 7 дн (нет заказов — за 30), ₽', '', 'rub', '', function (x) { return x.price7 == null ? '' : Math.round(x.price7); }],
  ['bidNow', 'Ставка буста сейчас (последние заказы)', '', 'pct', '', function (x) { return x.bidNow == null ? '' : x.bidNow; }],
  ['bid7', 'Ставка буста ср. за 7 дн (нет заказов — за 30)', '', 'pct', '', function (x) { return x.bid; }],
  // v2.2.0: цена на витрине и СПП — из заказов: цена продавца минус скидка Маркета (MARKETPLACE)
  ['shop7', 'Цена на витрине с СПП ср. за 7 дн (нет заказов — за 30), ₽', '', 'rub', '', function (x) { return x.shop7 == null ? '' : Math.round(x.shop7); }],
  ['spp7', 'СПП (скидка Маркета) ср. за 7 дн (нет заказов — за 30)', '', 'pct', '', function (x) { return x.spp7 == null ? '' : x.spp7; }],
  ['n30', 'Заказано за 30 дн, шт', '', 'int', '', function (x) { return x.n30; }],
  ['perDay', 'Заказов в день, шт', '', 'num1', '', function (x, L) { return '=' + L('n30') + '/' + YOP.UNIT_DAYS; }],
  ['fby', 'Остаток FBY (доступно), шт', '', 'int', '', function (x) { return x.fby; }],
  ['fbyMsk', 'Остаток FBY Москва (Софьино), шт', '', 'int', '', function (x) { return x.fbyMsk == null ? '' : x.fbyMsk; }],
  ['fbs', 'Остаток FBS (доступно), шт', '', 'int', '', function (x) { return x.fbs; }],
  ['days', 'Хватит на, дней', '', 'int', '', function (x, L) {
    return '=IF(' + L('perDay') + '=0,"",ROUND((' + L('fby') + '+' + L('fbs') + ')/' + L('perDay') + ',0))'; }],
  // сценарий: своя цена и ставка буста
  ['myPrice', 'Ваша цена, ₽', 'Сценарий: впишите свою цену и ставку буста (пусто = текущие из кабинета)', 'rub', 'blue',
    function (x, L, cab, keep) { return keep.price; }],
  ['myBid', 'Ваша ставка буста, %', '', 'pct', 'blue', function (x, L, cab, keep) { return keep.bid; }],
  ['sPrice', 'Цена в сценарии, ₽', '', 'rub', 'green', function (x, L) {
    return '=IF(' + L('myPrice') + '="",IF(' + L('priceNow') + '="",' + L('price7') + ',' + L('priceNow') + '),' + L('myPrice') + ')'; }],
  ['sBid', 'Ставка буста в сценарии', '', 'pct', 'green', function (x, L) {
    return '=IF(' + L('myBid') + '="",IF(' + L('bidNow') + '="",' + L('bid7') + ',' + L('bidNow') + '),IF(' + L('myBid') + '>1,' +
      L('myBid') + '/100,' + L('myBid') + '))'; }],
  ['sCost', 'Расходы Маркета на штуку (сценарий), ₽', '', 'rub', 'green', function (x, L) {
    return '=' + L('sPrice') + '*(' + L('k_tariff') + '+' + L('k_deliv') + '+' + L('k_transfer') + ')+' + L('k_mile') +
      '+IFERROR((' + L('sPrice') + '*' + L('sBid') + '*' + L('k_boost') + '+' + L('k_acq') + '+' + L('k_ret') + '+' +
      L('k_other') + ')/' + L('k_buyout') + ',0)'; }],
  ['sMargin', 'Маржа (сценарий), ₽', '', 'rub', 'green', function (x, L) {
    return '=' + L('sPrice') + '-' + L('sCost') + '-' + L('cogs') + '-IFERROR(' + L('sPrice') + '*(' + L('k_shows') + '+' + L('k_day') + ')/' +
      L('k_buyout') + ',0)'; }],
  ['sProfit', 'ЧП на штуку (сценарий), ₽', '', 'rub', 'greenBold', function (x, L) { return '=' + L('sMargin') + '-' + yopTaxF_(L('sMargin')); }],
  ['sPct', 'Маржинальность (сценарий)', '', 'pct', 'green', function (x, L) { return '=IFERROR(' + L('sProfit') + '/' + L('sPrice') + ',0)'; }],
  // факт за 7 дней
  ['price', 'Цена (факт 7 дн, нет продаж = кабинет), ₽', 'Факт: цена и ставка буста из заказов за 7 дней', 'rub', '', function (x, L) {
    return '=IF(' + L('price7') + '="",' + L('priceNow') + ',' + L('price7') + ')'; }],
  ['fCost', 'Расходы Маркета на штуку, ₽', '', 'rub', '', function (x, L) { return '=SUM(' + L('c_comm') + ':' + L('c_other') + ')'; }],
  ['fBefore', 'Маржа до рекламы за показы, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '-' + L('fCost') + '-' + L('cogs'); }],
  ['fShows', 'Реклама за показы (условно), ₽', '', 'rub', 'grey', function (x, L) { return yopDivB_(L('price') + '*' + L('k_shows'), L); }],
  ['fDay', 'Расходы дня (условно), ₽', '', 'rub', 'grey', function (x, L) { return yopDivB_(L('price') + '*' + L('k_day'), L); }],
  ['fMargin', 'Маржа, ₽', '', 'rub', '', function (x, L) { return '=' + L('fBefore') + '-' + L('fShows') + '-' + L('fDay'); }],
  ['fTax', 'Налог 25% (как в юнитке), ₽', '', 'rub', '', function (x, L) { return '=' + yopTaxF_(L('fMargin')); }],
  ['fProfit', 'ЧП на штуку, ₽', '', 'rub', 'bold', function (x, L) { return '=' + L('fMargin') + '-' + L('fTax'); }],
  ['fPct', 'Маржинальность', '', 'pct', '', function (x, L) { return '=IFERROR(' + L('fProfit') + '/' + L('price') + ',0)'; }],
  ['fRoi', 'Рентабельность к себесу', '', 'pct', '', function (x, L) { return '=IFERROR(' + L('fProfit') + '/' + L('cogs') + ',"")'; }],
  ['fMonth', 'ЧП в месяц при текущих продажах, ₽', '', 'rub', '', function (x, L) {
    return '=' + L('fProfit') + '*' + L('n30') + '*' + L('k_buyout'); }],
  // коэффициенты модели: общие для сценария и факта
  ['k_buyout', 'Выкуп', 'Коэффициенты модели (факт удержаний по дозревшим заказам), можно менять', 'pct', 'blue', function (x) { return x.coef.выкуп; }],
  ['k_tariff', 'Тариф комиссии', '', 'pct', 'blue', function (x) { return x.coef.тариф; }],
  ['k_boost', 'Буст: доля ставки к списанию', '', 'pct', 'blue', function (x) { return x.coef.буст_k; }],
  ['k_deliv', 'Доставка, % цены выкупленной', '', 'pct', 'blue', function (x) { return x.coef.доставка; }],
  ['k_transfer', 'Перевод денег, % цены выкупленной', '', 'pct', 'blue', function (x) { return x.coef.перевод; }],
  ['k_mile', 'Ср. миля, ₽ на доставл.', '', 'rub2', 'blue', function (x) { return x.coef.миля; }],
  ['k_acq', 'Эквайринг, ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.эквайринг; }],
  ['k_ret', 'Невыкуп/возврат, ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.возврат; }],
  ['k_other', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.прочее; }],
  ['k_shows', 'Реклама за показы, % от заказов (условно)', '', 'pct', 'grey', function (x) { return x.drr; }],
  ['k_day', 'Расходы дня (хранение, подписка, транзит, прочее), % от заказов (условно)', '', 'pct', 'grey', function (x) { return x.drrDay; }],
  ['cogs', 'Себес, ₽', '', 'rub', '', function (x, L, cab) { return yopCogsFormula_(cab.cogs, L('cab', true), L('sku', true)); }],
  // расшифровка «Расходы Маркета на штуку» (факт)
  ['c_comm', 'Комиссия, ₽', 'Расходы на выкупленную штуку по факту', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_tariff'); }],
  ['c_boost', 'Буст продаж, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('price') + '*' + L('bid7') + '*' + L('k_boost'), L); }],
  ['c_deliv', 'Доставка, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_deliv'); }],
  ['c_mile', 'Ср. миля, ₽', '', 'rub', '', function (x, L) { return '=' + L('k_mile'); }],
  ['c_transfer', 'Перевод денег, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_transfer'); }],
  ['c_acq', 'Эквайринг, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_acq'), L); }],
  ['c_ret', 'Невыкупы/возвраты, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_ret'), L); }],
  ['c_other', 'Прочее по заказу, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_other'), L); }],
  ['src', 'Коэффициенты по', '', '', '', function (x) { return x.src; }],
  ['cohort', 'Когорта, шт', '', 'int', '', function (x) { return x.coef.когорта_шт; }],
  ['cogsSrc', 'Себес найден', '', '', '', function (x, L, cab) { return yopCogsSrc_(cab, x.sku); }],
  // v2.2.0: заметки менеджера — привязаны к кабинету и артикулу, прогон их переносит
  ['note1', 'Заметка 1', 'Заметки: пишите что угодно — прогон переносит их вместе с артикулом', '', 'blue',
    function (x, L, cab, keep) { return keep.notes[0]; }],
  ['note2', 'Заметка 2', '', '', 'blue', function (x, L, cab, keep) { return keep.notes[1]; }],
  ['note3', 'Заметка 3', '', '', 'blue', function (x, L, cab, keep) { return keep.notes[2]; }]
];
var YOP_UNIT_NOTES = ['Заметка 1', 'Заметка 2', 'Заметка 3'];
var YOP_UNIT_HEAD = YOP_UNIT_SPEC.map(function (c) { return c[1]; });
var YOP_UNIT_FMT = { rub: '#,##0', rub2: '#,##0.00', pct: '0.0%', int: '#,##0', num1: '#,##0.0' };
var YOP_UNIT_BG = { blue: YOP_BLUE, grey: YOP_GREY, green: '#e6f4ea', greenBold: '#e6f4ea' };

/** v2.1.0. «Ваша цена», «Ваша ставка буста», (v2.2.0) заметки и (v2.3.0) группа товара с прошлого прогона: { "кабинет|артикул": {…} }. */
function yopUnitKeep_(sh) {
  var out = {}, last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return out;
  var head = sh.getRange(YOP_HEAD_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var ip = head.indexOf('Ваша цена, ₽'), ib = head.indexOf('Ваша ставка буста, %'), ig = head.indexOf('Группа товара (впишите)');
  var inotes = YOP_UNIT_NOTES.map(function (h) { return head.indexOf(h); });
  if (ip < 0 && ib < 0 && ig < 0 && inotes.every(function (i) { return i < 0; })) return out;
  sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, head.length).getValues().forEach(function (r) {
    var p = ip >= 0 ? r[ip] : '', b = ib >= 0 ? r[ib] : '', g = ig >= 0 ? r[ig] : '';
    var notes = inotes.map(function (i) { return i >= 0 ? r[i] : ''; });
    if (p !== '' || b !== '' || g !== '' || notes.join('') !== '') {
      out[String(r[0]) + '|' + String(r[1])] = { price: p, bid: b, group: g, notes: notes };
    }
  });
  return out;
}

/** Юнитка по всем кабинетам: карточки, остатки и ставки — файлы в папке кэша от последнего сбора. */
function yopWriteUnit_(day, all) {
  var sh = yopSheet_(YOP_SH.unit), keep = yopUnitKeep_(sh), rows = [], r = YOP_HEAD_ROW + 1, info = [], idx = {};
  YOP_UNIT_SPEC.forEach(function (c, i) { idx[c[0]] = yopCol_(i + 1); });
  all.forEach(function (cab) {
    var data = yopJsonLoad_(yopUnitDataName_(cab.name));
    var u = yopUnitRows_(cab.cache, cab.flat, day, yopCogsValues_(cab.cogs), cab.settings, data);
    info.push(cab.name + ': реклама за показы ' + (u.drr * 100).toFixed(1) + ' %, расходы дня ' + (u.drrDay * 100).toFixed(1) + ' % от заказов' +
      (data ? (data.bids ? '' : ', текущих ставок буста нет') : ' (цены и остатки ещё не загружены)'));
    u.rows.forEach(function (x) {
      var L = function (key, abs) { return (abs ? '$' : '') + idx[key] + r; };
      var k = keep[cab.name + '|' + x.sku] || { price: '', bid: '', group: '', notes: ['', '', ''] };
      if (k.group == null) k.group = '';
      rows.push(YOP_UNIT_SPEC.map(function (c) { return c[5](x, L, cab, k); }));
      r++;
    });
  });
  var flt = yopFilterTake_(sh);
  sh.clear();
  yopTitle_(sh, 'Юнитка ЯМ на данных Маркета на ' + yopRu_(day) + ' — экономика одной выкупленной штуки (' + YOP_VERSION + ')',
    'Сценарий: впишите «Ваша цена» и «Ваша ставка буста» — зелёные колонки сразу покажут маржу и ЧП на штуку; пусто — по текущей ' +
    'цене в кабинете и ставке буста из последних заказов. Вписанное прогон не затирает. Факт — цена и ставка из заказов за 7 дней, ' +
    'нет заказов за неделю — за 30 дней. ' +
    'Расходы Маркета — факт удержаний по дозревшим заказам; реклама за показы и расходы дня (хранение, подписка, транзит, прочее) ' +
    'делятся условно, долей от заказов кабинета за 30 дней. ' + info.join('; ') + '.');
  sh.getRange(3, 1, 1, YOP_UNIT_SPEC.length).setValues([YOP_UNIT_SPEC.map(function (c) { return c[2]; })]).setFontWeight('bold');
  yopHeader_(sh, YOP_UNIT_HEAD, { 1: 130, 2: 220, 3: 320, 4: 160 });
  if (rows.length) {
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 2, n, 1).setNumberFormat('@');                // артикул — текстом ДО записи
    sh.getRange(R, 1, n, rows[0].length).setValues(yopFx_(rows));
    YOP_UNIT_SPEC.forEach(function (c, i) {
      if (YOP_UNIT_FMT[c[3]]) sh.getRange(R, i + 1, n, 1).setNumberFormat(YOP_UNIT_FMT[c[3]]);
      if (YOP_UNIT_BG[c[4]]) sh.getRange(R, i + 1, n, 1).setBackground(YOP_UNIT_BG[c[4]]);
      if (c[4] === 'bold' || c[4] === 'greenBold') sh.getRange(R, i + 1, n, 1).setFontWeight('bold');
    });
  }
  sh.setFrozenColumns(2);
  yopFilterPut_(sh, flt, YOP_UNIT_SPEC.length);
  return rows.length;
}

// --- «⚙️ ЧП ЯМ коэффициенты» -------------------------------------------------------------------

function yopWriteCoef_(day, all) {
  var sh = yopSheet_(YOP_SH.coef), rows = [];
  all.forEach(function (cab) {
    Object.keys(cab.coef).sort(function (a, b) { return a === '*' ? -1 : b === '*' ? 1 : a < b ? -1 : 1; }).forEach(function (k) {
      var c = cab.coef[k];
      rows.push([cab.name, k === '*' ? '* весь кабинет' : k, c.когорта_шт, c.когорта_доставлено, c.выкуп, c.тариф, c.буст_k,
        c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее]);
    });
  });
  var manual = all.filter(function (c) { return yopManualTariff_(c.settings, day) != null; })
    .map(function (c) { return c.name + ' — ' + c.settings.tariff + ' %'; });
  sh.clear();
  yopTitle_(sh, 'Коэффициенты модели на ' + yopRu_(day),
    'Выкуп и доли расходов — заказы ' + yopRu_(yopAddDays_(day, -YOP.COHORT_FROM)) + '–' +
    yopRu_(yopAddDays_(day, -YOP.COHORT_TO)) + ' (только с известной судьбой); средняя миля — заказы ' +
    yopRu_(yopAddDays_(day, -YOP.MILE_FROM)) + '–' + yopRu_(yopAddDays_(day, -YOP.MILE_TO)) +
    '; тариф — последнего дня с начислениями комиссии за 14 дней' +
    (manual.length ? ', вручную с листа настроек: ' + manual.join(', ') : '') + '. Артикул с когортой меньше ' + YOP.MIN_UNITS +
    ' шт считается по строке «* весь кабинет».');
  yopHeader_(sh, ['Кабинет', 'Артикул', 'Когорта: заказано, шт', 'Когорта: доставлено, шт', 'Выкуп', 'Тариф комиссии',
    'Буст: доля ставки к списанию', 'Доставка, % выручки выкупленного', 'Перевод, % выручки выкупленного', 'Ср. миля, ₽ на доставл.',
    'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на шт'], { 1: 130, 2: 300 });
  if (rows.length) {
    sh.getRange(YOP_HEAD_ROW + 1, 2, rows.length, 1).setNumberFormat('@');
    sh.getRange(YOP_HEAD_ROW + 1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(YOP_HEAD_ROW + 1, 5, rows.length, 5).setNumberFormat('0.0%');
    sh.getRange(YOP_HEAD_ROW + 1, 10, rows.length, 4).setNumberFormat('#,##0.00');
  }
}

// --- «📖 ЧП ЯМ как считается» ------------------------------------------------------------------

var YOP_HELP_BOLD = ['Главное правило', 'Что фактом из Маркета, а что прогнозом', 'Откуда коэффициенты', 'Налог',
  'Факт рядом с прогнозом', 'Юнитка на данных Маркета', 'Себестоимость', 'Смена тарифа комиссии', 'Новый кабинет', 'Где код'];

function yopWriteHelp_() {
  var L = [
    ['Как считается ЧП по заказам Яндекс Маркета (' + YOP_VERSION + ')'], [''],
    ['Главное правило'],
    ['Считаем, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня. Маркет списывает комиссию и буст при доставке, через дни и недели ' +
     'после заказа. Если брать списания вчерашнего дня, в отчёт попадают расходы по заказам недельной давности.'], [''],
    ['Что фактом из Маркета, а что прогнозом'],
    ['ФАКТ по заказам вчера: количество, цена продавца (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе.'],
    ['ФАКТ дня: реклама за показы (буст показов, полки, баннеры), хранение, подписка и прочие начисления без номера заказа — ' +
     'по дате начисления, отдельными колонками, по артикулам не делятся.'],
    ['ПРОГНОЗ по коэффициентам: всё, что Маркет спишет с вчерашних заказов позже, — выкуп, комиссия, буст продаж, доставка, ' +
     'средняя миля, перевод денег, эквайринг, невыкупы и возвраты.'], [''],
    ['Откуда коэффициенты'],
    ['Из факта по прошлым заказам. Отчёт Маркета «Стоимость услуг» привязывает каждое удержание к номеру заказа, поэтому по ' +
     'заказам 14–35 дней назад (их судьба уже известна) видно, какая доля выкупилась и сколько Маркет по ним списал.'],
    ['Выкуп = доставлено ÷ заказано. Буст = ставка из заказа × доля ставки, которую Маркет реально списал. Доставка и перевод — ' +
     'доля от выручки выкупленных штук (Маркет берёт 5 % и 1,6 % только с доставленного). Средняя миля — ₽ на доставленную ' +
     'штуку по заказам 8–21 день (ставка меняется быстро; миля за заказы, отменённые в доставке, тоже входит — поэтому на ' +
     'выкупленную штуку она чуть выше тарифа). Тариф комиссии — последнего дня с начислениями или вручную с листа настроек. ' +
     '«Прочее по заказу» — надбавка за просрочку отгрузки FBS (в отчёте она в той же строке размещения) и баллы за отзывы.'],
    ['Расходы дня — хранение, подписка, транзит, утилизация, вывоз со склада и всё прочее без номера заказа — на листе «' +
     YOP_SH.days + '» стоят отдельными колонками по дню начисления. В юнитке они, как и реклама за показы (полки, баннеры, ' +
     'оплата за показы), идут на штуку условно: доля от суммы заказов кабинета за 30 дней.'],
    ['Маркет докладывает начисления за день ещё 1–2 дня (средняя миля, перевод денег, часть комиссии, хранение), поэтому ' +
     'каждый прогон перечитывает последние ' + YOP_SVC_RECHECK + ' дня начислений и заменяет прочитанное раньше.'],
    ['У артикула меньше ' + YOP.MIN_UNITS + ' шт в когорте (новые и редкие) — берутся коэффициенты кабинета, тариф при этом свой ' +
     '(колонка «Коэффициенты по» = «кабинет», подробности — лист «' + YOP_SH.coef + '»).'], [''],
    ['Налог'],
    ['Как в юнитке: минус 25 % от маржи дня (маржа = ЧП заказов − расходы дня). При отрицательной марже формула уменьшает убыток — так же, как в юнитке.'], [''],
    ['Факт рядом с прогнозом'],
    ['Лист «' + YOP_SH.days + '», колонки X–Z. Когда дню исполняется ' + YOP.FACT_AGE + ' дней, прогон пишет фактическую ЧП его заказов: ' +
     'выкупленные штуки × цена минус всё, что Маркет по этим заказам реально удержал, минус себес выкупленных. Та же база, что у ' +
     'колонки O (до рекламы за показы, хранения, подписки и налога). «Судьба известна» — какая доля заказов дня уже доставлена ' +
     'или отменена: пока она меньше 100 %, факт ещё дорастёт. Каждый прогон обновляет факт по всем дням за последние 6 недель.'], [''],
    ['Юнитка на данных Маркета'],
    ['Лист «' + YOP_SH.unit + '»: по каждому артикулу с заказами за 30 дней или с остатком — цена в кабинете, ставка буста из последних ' +
     'заказов, цена и ставка по факту заказов за 7 дней, цена на витрине с СПП и СПП (скидка Маркета) за 7 дней, остатки FBY и FBS (доступно), на сколько дней хватит, расходы Маркета на одну ' +
     'выкупленную штуку по тем же коэффициентам, что прогноз, себес, реклама за показы условно (доля от суммы заказов кабинета ' +
     'за 30 дней), налог 25 %, ЧП на штуку и в месяц.'],
    ['Сценарий: впишите «Ваша цена» и «Ваша ставка буста» — зелёные колонки сразу покажут расходы, маржу, ЧП на штуку и ' +
     'маржинальность при этих настройках. Пусто — считается по текущей цене и ставке из кабинета. Вписанное прогон не затирает; ' +
     'ставку можно писать и «5%», и «5».'],
    ['Заметки 1–3 в конце листа — для своих пометок: прогон переносит их вместе с артикулом. Свои колонки справа от них ' +
     'прогон стирает (лист пишется заново). Сортировать можно, порядок вернётся при следующем прогоне; фильтр прогон ' +
     'снимает и ставит обратно.'], [''],
    ['Себестоимость'],
    ['Сначала лист «' + YOP_SH.cogs + '» (кабинет | артикул магазина | себес), если там нет — юнитка кабинета по «Код 1С» ' +
     '(без учёта регистра и знаков на конце артикула). ' +
     'Колонка «Себес найден» показывает источник, «НЕТ — себес 0» — артикул, который надо добавить.'], [''],
    ['Смена тарифа комиссии'],
    ['Модель видит новый тариф в начислениях с задержкой 1–2 недели. Чтобы не ждать: лист «' + YOP_SH.settings + '», колонки ' +
     '«Тариф комиссии вручную, %» и «с даты заказа». Пустая ячейка — тариф снова берётся из начислений.'], [''],
    ['Новый кабинет'],
    ['Строка на листе «' + YOP_SH.keys + '» (ключ, Business ID, кампании) и строка на листе настроек с «Считать = да». Первый прогон ' +
     'сам докачает 42 дня истории. Пока ключа нет, кабинет пропускается и назван в «📊 Что сейчас происходит».'], [''],
    ['Где код'],
    ['В книге — только меню (лоадер). Вся логика — в репозитории: ' + YOP_CODE_URL + ' . Файл «04_модель.js» — весь расчёт; ' +
     '«03_сбор.js» — что берётся из Маркета; «05_листы.js» — формулы листов. Историю заказов скрипт хранит файлами на Диске ' +
     '(папка — лист «' + YOP_SH.settings + '»).']
  ];
  var sh = yopSheet_(YOP_SH.help);
  sh.clear();
  sh.getRange(1, 1, L.length, 1).setValues(L).setWrap(true);
  sh.setColumnWidth(1, 900);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  L.forEach(function (r, i) { if (YOP_HELP_BOLD.indexOf(r[0]) >= 0) sh.getRange(i + 1, 1).setFontWeight('bold'); });
}

// --- сборка --------------------------------------------------------------------------------

/** Записать день: лист по заказам, коэффициенты, блок в истории, факт. Возвращает прогноз по кабинетам. */
function yopWriteDay_(day, all) {
  all = all || yopForecastAll_(day);
  var cur = SpreadsheetApp.getActive().getSheetByName(YOP_SH.days);
  if (!yopDaysLayoutOk_(cur)) return yopRebuildDays_(day, YOP_REBUILD_DAYS, all);
  // v2.2.1: сначала заморозить историю — блок прошлого дня стоит формулами от листа «по заказам», и если
  // сперва перезаписать тот лист новым днём, прошлый день застынет с цифрами нового (22.09 → цифры 23.09)
  var sh = yopDaysSheet_();
  yopFreezeAndDrop_(sh, day);
  SpreadsheetApp.flush();
  var n = yopWriteDetail_(day, all);
  yopWriteCoef_(day, all);
  yopWriteHelp_();
  yopInsertBlock_(sh, yopDayBlock_(day, all, YOP_HEAD_ROW + 1, true, YOP_HEAD_ROW + Math.max(n, 1)));
  var f = yopUpdateFacts_(sh, all, day);
  yopUpdateDayCosts_(sh, all, day);
  SpreadsheetApp.flush();
  yopLog_('листы за ' + yopRu_(day) + ': заказов по артикулам ' + n + ', строк факта ' + f);
  return all;
}

/** Пересобрать историю за `days` дней: прошлые дни значениями, последний — формулами. */
function yopRebuildDays_(upto, days, all) {
  all = all || yopForecastAll_(upto);
  var sh = yopSheet_(YOP_SH.days);
  sh.clear();
  sh = yopDaysSheet_();                           // пишет шапку новой раскладки — повторной пересборки не будет
  for (var k = days - 1; k >= 1; k--) {
    var d = yopAddDays_(upto, -k);
    var block = all.map(function (c) {
      var f = yopForecast_(c.cache, d, yopCogsValues_(c.cogs), c.flat, c.settings);
      return { name: c.name, rows: f.rows, dayCost: c.cache.dayCost[d] || {} };
    });
    yopInsertBlock_(sh, yopDayBlock_(d, block, YOP_HEAD_ROW + 1, false, 0));
  }
  return yopWriteDay_(upto, all);
}


/* ==================== 06_прогон.js ==================== */

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


/* ==================== 07_пульт.js ==================== */

/* ПУЛЬТ: «📖 Как работать», «📊 Что сейчас происходит», «🔌 Проверка связи», «⚙️ Обновить настройки таблицы».
 * Окна рисует лоадер (HtmlService доступен только статическому коду книги): здесь — { html, text }. */

function dlgCss_() {
  return '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.55;margin:0;padding:18px;color:#202124}' +
    'h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 6px;font-size:14.5px}' +
    'ol,ul{margin:6px 0 6px 18px;padding:0}li{margin-bottom:6px}' +
    '.red{color:#C5221F;font-weight:600}.ok{color:#188038;font-weight:600}' +
    '.box{background:#F5F5F5;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.act{background:#E8F0FE;border-radius:6px;padding:10px 12px;margin:10px 0;font-weight:600}' +
    '.warn{background:#FCE8E6;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.muted{color:#666}' +
    'table{border-collapse:collapse;margin:8px 0;width:100%}' +
    'td,th{border:1px solid #DADCE0;padding:5px 8px;text-align:left;font-size:13px;vertical-align:top}' +
    'th{background:#F1F3F4}a{color:#1A73E8}pre{white-space:pre-wrap;font-size:12px;margin:0}' +
    '</style>';
}

function htmlEsc_(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function yopTable_(head, rows) {
  return '<table><tr>' + head.map(function (h) { return '<th>' + htmlEsc_(h) + '</th>'; }).join('') + '</tr>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
    '</table>';
}

/** 📖 Как работать. */
function yopHelp(version) {
  var steps = [
    '<b>1️⃣ Посчитать за вчера</b> — докачать заказы и отчёт «Стоимость услуг» по вчера, взять цены и остатки, ' +
      'переписать листы «' + YOP_SH.detail + '», «' + YOP_SH.days + '» (новый день сверху, факт по старым дням) и «' + YOP_SH.unit + '». ' +
      'Крупные кабинеты идут несколько минут: прогон продолжает сам себя, ничего нажимать не нужно.',
    '<b>2️⃣ Обновить юнитку</b> — только свежие цены и остатки, лист «' + YOP_SH.unit + '». Заказы не качаются.',
    '<b>⏰ Автопрогон</b> (🛠 Ручной режим) — то же, что 1️⃣, каждое утро около 07:10. Включается один раз.'
  ];
  var cols = [
    ['«' + YOP_SH.detail + '»', 'синие G–O — коэффициенты модели; поменяли — ЧП в строке пересчиталась. Лист переписывается каждым прогоном.'],
    ['«' + YOP_SH.days + '»', 'O — ЧП заказов дня (прогноз); P–S — реклама за показы, хранение, подписка, прочее — факт начисления дня; ' +
      'U — налог 25 % от маржи; X–Z — факт по дням старше ' + YOP.FACT_AGE + ' дней и доля заказов с известной судьбой.'],
    ['«' + YOP_SH.unit + '»', 'сценарий: впишите «Ваша цена» и «Ваша ставка буста» — зелёные колонки покажут маржу и ЧП на штуку при ' +
      'этих настройках; пусто — по текущим цене и ставке из кабинета; вписанное прогон не затирает. Синие коэффициенты тоже можно ' +
      'менять (до следующего прогона). Серые — реклама за показы, делится условно.'],
    ['«' + YOP_SH.settings + '»', 'кабинеты: «Лист юнитки», «Считать», «Тариф комиссии вручную, %» и «с даты заказа» — на случай смены ' +
      'комиссии Маркетом: расчёт сразу идёт по новому тарифу.'],
    ['«' + YOP_SH.cogs + '»', 'себес там, где юнитки нет или коды артикулов не совпадают: кабинет | артикул магазина | себес. ' +
      'Главнее юнитки. «НЕТ — себес 0» в колонке «Себес найден» — артикул, который надо сюда добавить.']
  ];
  var html = dlgCss_() + '<h2>ЧП ЯМ по заказам — как работать</h2>' +
    '<p class="muted">Код: ' + htmlEsc_(version || YOP_VERSION) + '. Логика и формулы — «' + YOP_SH.help + '» и ' +
    '<a href="' + YOP_CODE_URL + '" target="_blank">код в репозитории</a>.</p>' +
    '<h3>Кнопки</h3><ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
    '<div class="warn"><b>Не редактируйте строки прошлых дней на «' + YOP_SH.days + '» и не вставляйте туда свои строки</b>: ' +
    'прогон ищет дни по колонке A и дописывает факт в X–Z.</div>' +
    '<h3>Что где</h3>' + yopTable_(['Лист', 'Что делать человеку'], cols.map(function (c) { return [htmlEsc_(c[0]), htmlEsc_(c[1])]; })) +
    '<h3>Новый кабинет</h3><ol><li>Строка на листе «' + YOP_SH.keys + '»: имя кабинета, API-ключ, Business ID, кампании FBS/FBY.</li>' +
    '<li>Строка на «' + YOP_SH.settings + '» с тем же именем и «Считать = да»; себес — лист юнитки или «' + YOP_SH.cogs + '».</li>' +
    '<li>1️⃣ — первый прогон сам докачает 42 дня истории (несколько шагов по минуте).</li></ol>' +
    '<h3>Если что-то пошло не так</h3><ol><li>Откройте «📊 Что сейчас происходит» — там одно действие, которое нужно сейчас.</li>' +
    '<li>«🔌 Проверка связи» — отвечает ли Маркет по каждому ключу и доступна ли папка кэша.</li>' +
    '<li>Прогон молчит дольше 30 минут — 🛠 → «🧹 Сбросить зависший прогон», потом 1️⃣. Скачанное не теряется.</li></ol>';
  var text = 'ЧП ЯМ по заказам (' + (version || YOP_VERSION) + ')\n\n1️⃣ Посчитать за вчера — заказы, отчёт услуг, цены, остатки, все листы.\n' +
    '2️⃣ Обновить юнитку — только цены и остатки.\n⏰ Автопрогон — 🛠 Ручной режим, каждое утро ≈07:10.\n\n' +
    'Себес без юнитки — лист «' + YOP_SH.cogs + '». Смена комиссии — «Тариф комиссии вручную» на листе настроек.\n' +
    'Сбой — «📊 Что сейчас происходит».';
  return { html: html, text: text };
}

/** Одно действие, которое сейчас нужно от человека. */
function yopNextAction_(ctx) {
  if (ctx.error) return 'Нажмите «⚙️ Обновить настройки таблицы»: ' + ctx.error;
  if (ctx.queue && ctx.stale) return 'Прогон молчит больше 30 минут: 🛠 Ручной режим → «🧹 Сбросить зависший прогон», затем 1️⃣.';
  if (ctx.queue) return 'Идёт прогон — ничего делать не нужно, листы обновятся сами.';
  if (!ctx.last) return 'Нажмите 1️⃣ «Посчитать за вчера» — первый прогон.';
  if (ctx.last.errors && ctx.last.errors.length) return 'Прошлый прогон с ошибками (ниже) — откройте «🔌 Проверка связи».';
  if (ctx.noKey.length) return 'Впишите ключ на лист «' + YOP_SH.keys + '» для: ' + ctx.noKey.join(', ') + ' (или поставьте «Считать = нет»).';
  if (!ctx.auto) return 'Включите автопрогон: 🛠 Ручной режим → «⏰ Включить автопрогон».';
  if (ctx.noCogs) return 'Добавьте себес ' + ctx.noCogs + ' артикулов на лист «' + YOP_SH.cogs + '» (они помечены «НЕТ — себес 0»).';
  return 'Ничего делать не нужно: автопрогон включён, листы свежие.';
}

/** 📊 Что сейчас происходит. */
function yopStatus(version) {
  var p = yopProps_(), ctx = { noKey: [], noCogs: 0 };
  ctx.queue = yopQueueLoad_();
  ctx.stale = yopQueueStale_(ctx.queue);
  ctx.last = JSON.parse(p.getProperty('YOP_LAST_DONE') || 'null');
  ctx.auto = yopAutoOn_();
  var st = JSON.parse(p.getProperty('YOP_CAB_STATE') || '{}'), rows = [];
  try {
    var keys = yopKeys_(), s = yopSettings_();
    s.all.forEach(function (c) {
      var k = keys[c.name], x = st[c.name] || {};
      if (c.on && !k) ctx.noKey.push(c.name);
      rows.push([htmlEsc_(c.name), c.on ? 'да' : 'нет', k ? '<span class="ok">есть</span>' : '<span class="red">нет</span>',
        x.lastDay ? yopRu_(x.lastDay) : '—', c.tariff != null ? c.tariff + ' %' + (c.tariffFrom ? ' с ' + yopRu_(c.tariffFrom) : '') : 'из начислений']);
    });
  } catch (e) { ctx.error = e.message; }
  var det = SpreadsheetApp.getActive().getSheetByName(YOP_SH.detail);
  if (det && det.getLastRow() > YOP_HEAD_ROW) {
    det.getRange(YOP_HEAD_ROW + 1, YOP_DETAIL_HEAD.length, det.getLastRow() - YOP_HEAD_ROW, 1).getValues()
      .forEach(function (r) { if (String(r[0]).indexOf('НЕТ') === 0) ctx.noCogs++; });
  }
  var action = yopNextAction_(ctx), q = ctx.queue, last = ctx.last;
  var now = q ? (ctx.stale ? '<span class="red">прогон завис</span>' : 'идёт прогон') + ' за ' + yopRu_(q.day) + ': ' +
    (q.cabs.length ? 'заказы — осталось ' + htmlEsc_(q.cabs.join(', ')) : q.unitCabs.length ? 'цены и остатки — осталось ' +
      htmlEsc_(q.unitCabs.join(', ')) : 'запись листов') : 'прогона нет';
  var lastTxt = last ? (last.mode === 'full' ? 'полный прогон за ' + yopRu_(last.day) : 'юнитка') + ', закончен ' +
    Utilities.formatDate(new Date(last.at), 'Europe/Moscow', 'dd.MM HH:mm') + ', ' + last.minutes + ' мин' : 'ещё не было';
  var log = (p.getProperty('YOP_LOG') || '').split('\n').slice(-15).join('\n');
  var html = dlgCss_() + '<h2>Что сейчас происходит</h2>' +
    '<div class="act">👉 ' + htmlEsc_(action) + '</div>' +
    '<table><tr><th>Сейчас</th><td>' + now + '</td></tr><tr><th>Последний прогон</th><td>' + htmlEsc_(lastTxt) + '</td></tr>' +
    '<tr><th>Автопрогон</th><td>' + (ctx.auto ? 'включён, ≈07:10' : '<span class="red">выключен</span>') + '</td></tr>' +
    '<tr><th>Код</th><td>' + htmlEsc_(version || YOP_VERSION) + '</td></tr></table>' +
    (last && last.errors && last.errors.length ? '<div class="warn"><b>Ошибки прошлого прогона:</b><br>' +
      last.errors.map(htmlEsc_).join('<br>') + '</div>' : '') +
    '<h3>Кабинеты</h3>' + yopTable_(['Кабинет', 'Считать', 'Ключ', 'Заказы скачаны по', 'Тариф комиссии'], rows) +
    '<h3>Последние события</h3><div class="box"><pre>' + htmlEsc_(log || '—') + '</pre></div>';
  var text = '👉 ' + action + '\n\nСейчас: ' + now.replace(/<[^>]+>/g, '') + '\nПоследний прогон: ' + lastTxt +
    '\nАвтопрогон: ' + (ctx.auto ? 'включён' : 'выключен') + '\n\n' + log;
  return { html: html, text: text };
}

/**
 * 🔌 Проверка связи — БЕЗ повторов: все кабинеты одним fetchAll, код ответа и есть диагноз.
 * Права записи не проверяются: модуль в Маркет ничего не пишет, только читает.
 */
function yopCheckConnection() {
  var keys = yopKeys_(), s, rows = [], reqs = [], idx = [];
  try { s = yopSettings_(); } catch (e) {
    return { html: dlgCss_() + '<h2>Проверка связи</h2><div class="warn">' + htmlEsc_(e.message) + '</div>', text: e.message };
  }
  s.all.forEach(function (c) {
    var k = keys[c.name];
    if (!k) { rows.push([htmlEsc_(c.name), '—', '<span class="red">нет строки на листе «' + YOP_SH.keys + '»</span>']); return; }
    [['FBS', k.fbs], ['FBY', k.fby]].forEach(function (pair) {
      if (!pair[1]) return;
      idx.push([c.name, pair[0]]);
      reqs.push({ url: YOP_BASE + '/campaigns/' + pair[1], headers: { 'Api-Key': k.apiKey }, muteHttpExceptions: true });
    });
  });
  var diag = { 200: '<span class="ok">отвечает</span>', 401: '<span class="red">ключ не принят (401)</span>',
    403: '<span class="red">у ключа нет доступа к кампании (403)</span>', 404: '<span class="red">кампания не найдена (404)</span>',
    420: 'лимит запросов (420) — повторите через минуту', 429: 'лимит запросов (429) — повторите через минуту' };
  (reqs.length ? UrlFetchApp.fetchAll(reqs) : []).forEach(function (r, i) {
    var code = r.getResponseCode();
    rows.push([htmlEsc_(idx[i][0]), idx[i][1], diag[code] || '<span class="red">ошибка Маркета ' + code + '</span>']);
  });
  var extra = [];
  try { extra.push(['Папка кэша на Диске', '<span class="ok">' + htmlEsc_(yopCacheFolder_().getName()) + '</span>']); }
  catch (e) { extra.push(['Папка кэша на Диске', '<span class="red">' + htmlEsc_(e.message) + '</span>']); }
  s.all.forEach(function (c) {
    if (!c.unit) return;
    extra.push(['Юнитка «' + htmlEsc_(c.unit) + '»', yopUnitCols_(c.unit) ? '<span class="ok">найдены «Код 1С» и «себес»</span>'
      : '<span class="red">нет листа или колонок «Код 1С» / «себес»</span>']);
  });
  extra.push(['Лист «' + YOP_SH.cogs + '»', SpreadsheetApp.getActive().getSheetByName(YOP_SH.cogs) ? '<span class="ok">есть</span>'
    : '<span class="red">нет — «⚙️ Обновить настройки таблицы»</span>']);
  var html = dlgCss_() + '<h2>Проверка связи</h2>' +
    '<p class="muted">Один запрос на кампанию, без повторов. Запись в Маркет модулю не нужна — он только читает.</p>' +
    yopTable_(['Кабинет', 'Кампания', 'Маркет'], rows) + yopTable_(['Что', 'Состояние'], extra);
  var text = rows.concat(extra).map(function (r) { return r.join(' — ').replace(/<[^>]+>/g, ''); }).join('\n');
  return { html: html, text: text };
}

/**
 * ⚙️ Обновить настройки таблицы: служебные листы в раскладку текущей версии без боевых действий.
 * Лист настроек: недостающие колонки дописываются справа от шапки; лист «себес вручную» создаётся пустым.
 */
function upgradeSheets() {
  var ss = SpreadsheetApp.getActive(), done = [];
  var sh = ss.getSheetByName(YOP_SH.settings);
  if (!sh) {
    sh = ss.insertSheet(YOP_SH.settings);
    sh.getRange(1, 1).setValue('Настройки «ЧП ЯМ по заказам»').setFontWeight('bold').setFontSize(13);
    sh.getRange(2, 1).setValue('Кабинеты берутся отсюда, ключи — с листа «' + YOP_SH.keys + '» (имя кабинета должно совпадать).');
    sh.getRange(3, 1, 1, 2).setValues([['Папка кэша на Диске (id)', '']]);
    sh.getRange(5, 1, 1, YOP_SETTINGS_HEAD.length).setValues([YOP_SETTINGS_HEAD]).setFontWeight('bold').setBackground('#e8f0fe');
    done.push('создан лист настроек — впишите папку кэша (B3) и кабинеты');
  } else {
    var v = sh.getDataRange().getValues(), hr = -1;
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === 'Кабинет') { hr = i; break; }
    if (hr >= 0) {
      var have = v[hr].map(function (x) { return String(x).trim().toLowerCase(); }).filter(String);
      var add = YOP_SETTINGS_HEAD.filter(function (h) {
        var key = h.toLowerCase().split(' (')[0].split(',')[0];
        return !have.some(function (x) { return x.indexOf(key) === 0; });
      });
      if (add.length) {
        sh.getRange(hr + 1, have.length + 1, 1, add.length).setValues([add]).setFontWeight('bold').setBackground('#e8f0fe');
        done.push('на лист настроек добавлены колонки: ' + add.join(', '));
      }
      sh.getRange(hr + 2, 5, Math.max(sh.getMaxRows() - hr - 1, 1), 1).setNumberFormat('dd.mm.yyyy');
    }
  }
  var cg = ss.getSheetByName(YOP_SH.cogs);
  if (!cg) {
    cg = ss.insertSheet(YOP_SH.cogs);
    yopTitle_(cg, 'Себестоимость вручную — для кабинетов без юнитки и артикулов, которых нет в юнитке',
      'Кабинет — как на листе настроек; артикул магазина — как в заказах Маркета (shopSku). Значение отсюда главнее юнитки.');
    yopHeader_(cg, YOP_COGS_HEAD, { 1: 160, 2: 260, 3: 130, 4: 320 });
    cg.getRange(YOP_HEAD_ROW + 1, 2, cg.getMaxRows() - YOP_HEAD_ROW, 1).setNumberFormat('@');
    done.push('создан лист «' + YOP_SH.cogs + '»');
  }
  yopWriteHelp_();
  done.push('лист «' + YOP_SH.help + '» обновлён под ' + YOP_VERSION);
  yopLog_('настройки таблицы: ' + done.join('; '));
  yopToast_(done.join('; '));
  return done;
}


/* ==================== 99_экспорт.js ==================== */

/* Экспорт для тестов в Node. В Apps Script `module` не существует, ветка не выполняется. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YOP: YOP, YOP_SH: YOP_SH, YOP_DAYS_HEAD: YOP_DAYS_HEAD, YOP_DETAIL_HEAD: YOP_DETAIL_HEAD, YOP_UNIT_HEAD: YOP_UNIT_HEAD,
    yopAddDays_: yopAddDays_, yopItems_: yopItems_, yopForecast_: yopForecast_, yopCoefficients_: yopCoefficients_,
    yopFactDay_: yopFactDay_, yopUnitRows_: yopUnitRows_, yopBidNow_: yopBidNow_, yopCogsOf_: yopCogsOf_, yopSkuNorm_: yopSkuNorm_, yopTariffs_: yopTariffs_, yopFilterTake_: yopFilterTake_, yopFilterPut_: yopFilterPut_, yopUnitCalc_: yopUnitCalc_, yopManualTariff_: yopManualTariff_,
    yopSettings_: yopSettings_, yopKeys_: yopKeys_, yopCogs_: yopCogs_, yopCogsValues_: yopCogsValues_, yopCogsFormula_: yopCogsFormula_,
    yopAddServices_: yopAddServices_, yopOrderRecord_: yopOrderRecord_, yopCollectCabinet_: yopCollectCabinet_,
    yopCollectUnitData_: yopCollectUnitData_, yopWriteDay_: yopWriteDay_, yopWriteUnit_: yopWriteUnit_,
    yopRebuildDays_: yopRebuildDays_, yopUpdateFacts_: yopUpdateFacts_, yopNextAction_: yopNextAction_,
    yopRunYesterday: yopRunYesterday, yopRefreshUnit: yopRefreshUnit, yopDailyTrigger: yopDailyTrigger, continueQueue: continueQueue,
    yopRecalcSheets: yopRecalcSheets, yopRebuildHistory: yopRebuildHistory, yopResetRun: yopResetRun,
    yopTriggerOn: yopTriggerOn, yopTriggerOff: yopTriggerOff,
    yopUndoServiceDay_: yopUndoServiceDay_, yopSvcDaysToFetch_: yopSvcDaysToFetch_, yopCollectServices_: yopCollectServices_,
    yopUpdateDayCosts_: yopUpdateDayCosts_, yopForecastAll_: yopForecastAll_, yopCol_: yopCol_,
    yopFx_: yopFx_, yopSepReset_: function () { YOP_SEP_ = null; },
    yopHelp: yopHelp, yopStatus: yopStatus, yopCheckConnection: yopCheckConnection, upgradeSheets: upgradeSheets
  };
}
