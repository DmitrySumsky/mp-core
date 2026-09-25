/**
 * РЕГЛАМЕНТ WB — ЛОАДЕР КНИГИ v1 — 25.09.2026
 *
 * v1: первая версия. Одно меню пульта на обе автоматизации книги — заказы и остатки WB
 *     («WB Данные» → «Регламент») и раскладку FBS по складам («WB Склады FBS»); run_(),
 *     HTML-окна, витрина скоупов, обработчики двух утренних триггеров.
 *
 * Единственный файл модуля внутри книги. Логика лежит в репозитории (mp-core, файл
 * modules/wb-reglament/central/build/central.js) и тянется при каждом клике: правка логики =
 * один пуш, книга на новой версии со следующего клика по меню.
 *
 * ЧТО НАСТРАИВАЕТСЯ (и больше нигде) — скрытый лист «Технический»:
 *   B2 — ключ WB кабинета: категории «Контент», «Аналитика», «Маркетплейс», без «только чтение»
 *   B3 — базовый склад FBS (пусто — «Мой склад»): на него уходит излишек раскладки
 *   B4 — GitHub-токен (Contents: Read-only). Пусто, пока репозиторий кода открыт
 *
 * ЛОАДЕР ЗАМОРОЖЕН: правки функционала делаются в репозитории. Этот файл трогают только
 * когда меняется НАБОР ПУНКТОВ МЕНЮ (run_ резолвит функции центрального кода по имени).
 * Меню собирает лоадер: onOpen — простой триггер, ему запрещён UrlFetchApp.
 */

var GH_OWNER = 'DmitrySumsky';
var GH_REPO = 'mp-core';
var GH_FILE = 'modules/wb-reglament/central/build/central.js';
var GH_BRANCH = 'dev';

/* Имена, которые центральный код раскладки FBS ждёт от лоадера. */
var FBSD_BASE_WAREHOUSE = 'Мой склад';          // перебивается «Технический» B3 в run_()
var FBSD_TOKEN_PROP = 'WB_FBS_TOKEN';           // свойство скрипта важнее ячейки (пункт «Указать токен»)
var FBSD_TOKEN_SHEET = 'Технический';
var FBSD_TOKEN_CELL = 'B2';

/* ---------- дальше ничего менять не нужно ---------- */

/**
 * НЕ ВЫЗЫВАЕТСЯ. Скоупы OAuth выдаются по СТАТИЧЕСКОМУ анализу кода, а загруженный по сети
 * центральный код анализатор не видит: эта функция «показывает» проекту все сервисы, включая
 * операции ЗАПИСИ. DriveApp намеренно НЕТ: модуль на Диск не ходит.
 */
function __scopes_() {
  SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.getUi();
  SpreadsheetApp.getActiveSpreadsheet().insertSheet('x');
  UrlFetchApp.fetch('https://example.com');
  UrlFetchApp.fetchAll([]);
  PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers();
  ScriptApp.newTrigger('x');
  LockService.getScriptLock();
  HtmlService.createHtmlOutput('x');
  Utilities.getUuid();
  Session.getScriptTimeZone();
}

function techCell_(a1) {
  try {
    var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FBSD_TOKEN_SHEET);
    return s ? String(s.getRange(a1).getValue() || '').trim() : '';
  } catch (e) { return ''; }
}

/** Ключ WB для раскладки FBS: свойство скрипта важнее ячейки книги. */
function fbsGetToken_() {
  var stored = PropertiesService.getScriptProperties().getProperty(FBSD_TOKEN_PROP);
  if (stored) return String(stored).trim();
  var cell = techCell_(FBSD_TOKEN_CELL);
  if (!cell) {
    throw new Error('Не найден ключ WB: пусто в «' + FBSD_TOKEN_SHEET + '»!' + FBSD_TOKEN_CELL +
                    '. Вставьте ключ и нажмите 🔌 Проверка связи.');
  }
  return cell;
}

/** GitHub-токен: «Технический» B4 > Script Properties (GITHUB_TOKEN). Пусто — публичная ссылка. */
function ghToken_() {
  var t = techCell_('B4');
  if (t) return t;
  var p = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  return p ? String(p).trim() : '';
}

/** Код модуля. Кэш на одно исполнение: за прогон файл тянется ровно один раз. */
var RG_CODE_CACHE_ = null;

function fetchCode_() {
  if (RG_CODE_CACHE_) return RG_CODE_CACHE_;
  var tok = ghToken_();
  var url, options;
  if (tok) {
    url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO +
          '/contents/' + GH_FILE + '?ref=' + GH_BRANCH;
    options = { headers: { 'Authorization': 'Bearer ' + tok,
                           'Accept': 'application/vnd.github.raw+json',
                           'X-GitHub-Api-Version': '2022-11-28' },
                muteHttpExceptions: true };
  } else {
    url = 'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' +
          GH_BRANCH + '/' + GH_FILE;
    options = { muteHttpExceptions: true };
  }
  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode(), src = resp.getContentText();
  if (code === 401) throw new Error('GitHub: токен не принят (401) — истёк или неверный. Обновите «Технический» B4.');
  if (code === 403) throw new Error('GitHub: нет доступа (403) — у токена нет права Contents: Read-only на ' + GH_REPO + '.');
  if (code === 404) {
    throw new Error('GitHub: файл кода не найден (404). Проверьте ' + GH_OWNER + '/' + GH_REPO +
      '/' + GH_FILE + '@' + GH_BRANCH + (tok ? ' и что токену выдан доступ к этому репозиторию.'
        : '. Токена нет — код тянется по публичной ссылке; если репозиторий закрыли, вставьте PAT в «Технический» B4.'));
  }
  if (code !== 200) throw new Error('GitHub: ошибка ' + code + ': ' + String(src).slice(0, 200));
  if (!src || src.indexOf('function rgCheckConnection') < 0 || src.indexOf('function fbsRunLocked_') < 0) {
    throw new Error('В файле кода не тот код: нет rgCheckConnection/fbsRunLocked_. Проверьте путь к файлу.');
  }
  RG_CODE_CACHE_ = src;
  return src;
}

/** Резолв функции центрального кода ПО ИМЕНИ: новая функция не требует правки лоадера. */
function run_(name, args) {
  var base = techCell_('B3');
  if (base) FBSD_BASE_WAREHOUSE = base;
  var body = fetchCode_() + '\n;return (typeof ' + name + ' === "function" ? ' + name + ' : null);';
  var f = (new Function(body))();
  if (!f) throw new Error('В центральном коде нет функции ' + name + ' — обновите файл кода.');
  return f.apply(null, args || []);
}

/** HTML-окно. HtmlService работает только из СТАТИЧЕСКОГО кода проекта, поэтому окно рисует
 *  лоадер, а центральный код отдаёт {html, text}. Не открылось — тот же текст alert'ом. */
function showHtml_(res, title, w, h) {
  var ui = SpreadsheetApp.getUi();
  var html = res && res.html ? String(res.html) : '';
  var text = res && res.text ? String(res.text) : String(res || '');
  try {
    ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(w || 880).setHeight(h || 640), title);
  } catch (e) {
    ui.alert(title, text + '\n\n(Окно с оформлением не открылось: ' +
      String(e.message || e).slice(0, 200) + ')', ui.ButtonSet.OK);
  }
}

/** Первая строка центрального файла — строка версии. */
function centralVersion_() {
  try { return fetchCode_().split('\n')[0]; } catch (e) { return ''; }
}

/* ---------- меню: порядок работы ---------- */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📦 Регламент WB')
    .addItem('1️⃣ 🔄 Обновить заказы и остатки WB', 'mUpdateData')
    .addItem('2️⃣ 🧮 Раскладка FBS: обновить лист и рассчитать план', 'mFbsPlan')
    .addItem('3️⃣ 🔴 Раскладка FBS: залить план в WB', 'mFbsApply')
    .addSeparator()
    .addItem('📖 Как работать (инструкция)', 'mHelp')
    .addItem('📊 Что сейчас происходит', 'mStatus')
    .addItem('🔌 Проверка связи', 'mCheck')
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠 Ручной режим')
      .addItem('➕ Дописать новые товары из кабинета', 'mAddItems')
      .addItem('⏰ Включить автообновление (06:45 и 07:15)', 'mTriggersOn')
      .addItem('⏰ Отключить автообновление', 'mTriggersOff')
      .addItem('🔑 Указать токен WB (отдельный ключ для раскладки FBS)', 'mSetToken'))
    .addSeparator()
    .addItem('⚙️ Обновить настройки таблицы', 'mUpgrade')
    .addItem('ℹ️ Версия кода', 'mVersion')
    .addToUi();
}

function mUpdateData()  { return run_('updateWbReglament'); }
function mFbsPlan()     { return run_('updateWbSellerWarehouses'); }
function mFbsApply()    { return run_('fbsApplyPlan'); }
function mAddItems()    { return run_('rgAddNewItems'); }
function mTriggersOn()  { return run_('rgInstallTriggers'); }
function mTriggersOff() { return run_('rgRemoveTriggers'); }
function mUpgrade()     { return run_('upgradeSheets'); }
function mSetToken()    { return run_('fbsSetToken'); }
function mCheck()       { showHtml_(run_('rgCheckConnection'), '🔌 Проверка связи', 820, 480); }

function mHelp()   { showHtml_(run_('rgHelp',   [centralVersion_()]), '📖 Как работать', 900, 700); }
function mStatus() { showHtml_(run_('rgStatus', [centralVersion_()]), '📊 Что сейчас происходит', 820, 520); }

/** Утренние триггеры вызывают функции с ЭТИМИ именами. Не переименовывать. */
function wbDailyTrigger()           { return run_('wbDailyTrigger'); }
function wbWarehousesDailyTrigger() { return run_('wbWarehousesDailyTrigger'); }

function mVersion() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Версия кода', centralVersion_() + '\n\nИсточник: GitHub ' + GH_OWNER + '/' +
    GH_REPO + '/' + GH_FILE + '@' + GH_BRANCH + '\nЛоадер: v1\nБазовый склад FBS: ' +
    (techCell_('B3') || FBSD_BASE_WAREHOUSE), ui.ButtonSet.OK);
}
