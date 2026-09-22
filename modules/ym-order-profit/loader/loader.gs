/**
 * ЧП ЯМ ПО ЗАКАЗАМ — ЛОАДЕР КНИГИ v1 — 22.09.2026
 *
 * v1: первая версия. Меню пульта, run_(), HTML-диалог, витрина скоупов, обработчики триггеров
 *     yopDailyTrigger (автопрогон каждое утро) и continueQueue (облачное продолжение очереди).
 *
 * Единственный файл модуля внутри книги — отдельный привязанный проект, скрипт самой книги с её
 * функциями не трогается. Логика лежит в репозитории (mp-core, файл
 * modules/ym-order-profit/central/build/central.js) и тянется при каждом клике: правка логики =
 * один пуш, книга на новой версии со следующего клика по меню.
 *
 * Настройки модуля — листы книги «⚙️ ЧП ЯМ настройки», «💲 ЧП ЯМ себес вручную» и «API-ключи».
 * GitHub-токен не нужен, пока репозиторий открыт; закроют — PAT (Contents: Read-only) в Script
 * Properties, ключ GITHUB_TOKEN.
 *
 * ЛОАДЕР ЗАМОРОЖЕН: правки функционала делаются в репозитории. Этот файл трогают только когда
 * меняется НАБОР ПУНКТОВ МЕНЮ (run_ резолвит функции центрального кода по имени).
 */

var GH_OWNER = 'DmitrySumsky';
var GH_REPO = 'mp-core';
var GH_FILE = 'modules/ym-order-profit/central/build/central.js';
var GH_BRANCH = 'dev';

/* ---------- дальше ничего менять не нужно ---------- */

/**
 * НЕ ВЫЗЫВАЕТСЯ. Скоупы OAuth выдаются по СТАТИЧЕСКОМУ анализу кода, а загруженный по сети
 * центральный код анализатор не видит: эта функция «показывает» проекту все сервисы, включая
 * операции ЗАПИСИ. DriveApp нужен: история заказов лежит файлами в папке Диска.
 */
function __scopes_() {
  SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.getUi();
  SpreadsheetApp.getActiveSpreadsheet().insertSheet('x');
  DriveApp.getFolderById('x').createFile('x', 'x');
  DriveApp.getFileById('x').setContent('x');
  UrlFetchApp.fetch('https://example.com');
  UrlFetchApp.fetchAll([]);
  PropertiesService.getScriptProperties();
  ScriptApp.getProjectTriggers();
  ScriptApp.newTrigger('x');
  LockService.getScriptLock();
  HtmlService.createHtmlOutput('x');
  Utilities.unzip(Utilities.newBlob('x'));
  Session.getScriptTimeZone();
}

function ghToken_() {
  var p = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  return p ? String(p).trim() : '';
}

/** Код модуля. Кэш на одно исполнение: за прогон файл тянется ровно один раз. */
var YOP_CODE_CACHE_ = null;

function fetchCode_() {
  if (YOP_CODE_CACHE_) return YOP_CODE_CACHE_;
  var tok = ghToken_(), url, options;
  if (tok) {
    url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + GH_FILE + '?ref=' + GH_BRANCH;
    options = { headers: { 'Authorization': 'Bearer ' + tok, 'Accept': 'application/vnd.github.raw+json',
                           'X-GitHub-Api-Version': '2022-11-28' }, muteHttpExceptions: true };
  } else {
    url = 'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/' + GH_BRANCH + '/' + GH_FILE;
    options = { muteHttpExceptions: true };
  }
  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode(), src = resp.getContentText();
  if (code === 401) throw new Error('GitHub: токен не принят (401) — обновите GITHUB_TOKEN в Script Properties.');
  if (code === 403) throw new Error('GitHub: нет доступа (403) — у токена нет права Contents: Read-only на ' + GH_REPO + '.');
  if (code === 404) {
    throw new Error('GitHub: файл кода не найден (404): ' + GH_OWNER + '/' + GH_REPO + '/' + GH_FILE + '@' + GH_BRANCH +
      (tok ? '.' : '. Если репозиторий закрыли — нужен токен в Script Properties (GITHUB_TOKEN).'));
  }
  if (code !== 200) throw new Error('GitHub: ошибка ' + code + ': ' + String(src).slice(0, 200));
  if (!src || src.indexOf('function continueQueue') < 0) throw new Error('В файле кода не тот код: нет continueQueue.');
  YOP_CODE_CACHE_ = src;
  return src;
}

/** Резолв функции центрального кода ПО ИМЕНИ: новая функция не требует правки лоадера. */
function run_(name, args) {
  var body = fetchCode_() + '\n;return (typeof ' + name + ' === "function" ? ' + name + ' : null);';
  var f = (new Function(body))();
  if (!f) throw new Error('В центральном коде нет функции ' + name + ' — обновите файл кода.');
  return f.apply(null, args || []);
}

/** HTML-диалог рисует лоадер, центральный код отдаёт {html, text}. Не открылось — тот же текст alert'ом. */
function showHtml_(res, title, w, h) {
  var ui = SpreadsheetApp.getUi();
  var html = res && res.html ? String(res.html) : '';
  var text = res && res.text ? String(res.text) : String(res || '');
  try {
    ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(w || 880).setHeight(h || 640), title);
  } catch (e) {
    ui.alert(title, text + '\n\n(Окно с оформлением не открылось: ' + String(e.message || e).slice(0, 200) + ')', ui.ButtonSet.OK);
  }
}

function centralVersion_() {
  try { return fetchCode_().split('\n')[0]; } catch (e) { return ''; }
}

/* ---------- меню: порядок работы ---------- */

/** 🔴 в меню НЕТ намеренно: модуль в Маркет ничего не пишет, только читает и заполняет свои листы. */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('💰 ЧП ЯМ')
    .addItem('1️⃣ 🔄 Посчитать за вчера', 'mRunYesterday')
    .addItem('2️⃣ 🧮 Обновить юнитку (цены и остатки)', 'mRefreshUnit')
    .addSeparator()
    .addItem('📖 Как работать (инструкция)', 'mHelp')
    .addItem('📊 Что сейчас происходит', 'mStatus')
    .addItem('🔌 Проверка связи', 'mCheck')
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠 Ручной режим')
      .addItem('⏰ Включить автопрогон (каждое утро)', 'mTriggerOn')
      .addItem('🔕 Выключить автопрогон', 'mTriggerOff')
      .addItem('♻️ Пересчитать листы без Маркета', 'mRecalc')
      .addItem('📜 Пересобрать историю за 21 день', 'mRebuild')
      .addItem('🧹 Сбросить зависший прогон', 'mReset'))
    .addSeparator()
    .addItem('⚙️ Обновить настройки таблицы', 'mUpgrade')
    .addItem('ℹ️ Версия кода', 'mVersion')
    .addToUi();
}

function mRunYesterday() { return run_('yopRunYesterday'); }
function mRefreshUnit()  { return run_('yopRefreshUnit'); }
function mTriggerOn()    { return run_('yopTriggerOn'); }
function mTriggerOff()   { return run_('yopTriggerOff'); }
function mRecalc()       { return run_('yopRecalcSheets'); }
function mRebuild()      { return run_('yopRebuildHistory'); }
function mReset()        { return run_('yopResetRun'); }
function mUpgrade()      { return run_('upgradeSheets'); }
function mCheck()        { showHtml_(run_('yopCheckConnection'), '🔌 Проверка связи', 760, 560); }
function mHelp()         { showHtml_(run_('yopHelp', [centralVersion_()]), '📖 Как работать', 900, 680); }
function mStatus()       { showHtml_(run_('yopStatus', [centralVersion_()]), '📊 Что сейчас происходит', 780, 600); }

/** Автопрогон: устанавливаемый триггер вызывает функцию с ЭТИМ именем. */
function yopDailyTrigger() { return run_('yopDailyTrigger'); }

/** Облачное продолжение очереди. Имя не переименовывать — на нём висят установленные триггеры. */
function continueQueue() { return run_('continueQueue'); }

function mVersion() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Версия кода', centralVersion_() + '\n\nИсточник: GitHub ' + GH_OWNER + '/' + GH_REPO + '/' + GH_FILE + '@' +
    GH_BRANCH + '\nЛоадер: v1', ui.ButtonSet.OK);
}