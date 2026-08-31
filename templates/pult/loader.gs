/**
 * ПУЛЬТ — шаблон лоадера книги (вставляется в таблицу ОДИН раз).
 * Стандарт: ../../ПУЛЬТ.md. Заменить <МОДУЛЬ>, GH_* и пункты меню.
 *
 * Код модуля лежит в репозитории; лоадер тянет его по токену и исполняет.
 * Правка логики = один пуш, все книги на новой версии со следующего клика.
 * Лоадер трогается ТОЛЬКО ради нового пункта меню (run_ резолвит функции по имени).
 *
 * Настройка книги (лист «Ключи»):
 *   B1 — идентификатор кабинета/бренда этой книги
 *   B2/B3 — ключи внешнего API
 *   B4 — GitHub-токен (fine-grained PAT, Contents: Read-only)
 *   B5/B6 — токен бота и адрес чата оповещений (необязательно)
 *
 * v1: первая версия лоадера модуля.
 */

var GH_OWNER  = 'DmitrySumsky';
var GH_REPO   = '<репозиторий>';
var GH_FILE   = '<central.js>';
var GH_BRANCH = 'main';

/* ---------- дальше ничего менять не нужно ---------- */

/** НЕ ВЫЗЫВАЕТСЯ. Скоупы OAuth выдаются по СТАТИЧЕСКОМУ анализу кода, а загруженный
 *  по сети центральный код анализатор не видит: эта функция «показывает» все сервисы,
 *  включая операции ЗАПИСИ (иначе Google выдаст «только чтение»). */
function __scopes_() {
  SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.create('x');
  DriveApp.getRootFolder();
  DriveApp.createFolder('x');
  DriveApp.createFile('x', 'x');
  ScriptApp.getProjectTriggers();
  ScriptApp.newTrigger('x');
  PropertiesService.getScriptProperties();
  CacheService.getScriptCache();
  LockService.getScriptLock();
  UrlFetchApp.fetch('https://example.com');
  HtmlService.createHtmlOutput('x');
  Utilities.getUuid();
  Session.getScriptTimeZone();
}

/** GitHub-токен: лист «Ключи» B4 > Script Properties (GITHUB_TOKEN). */
function ghToken_() {
  try {
    var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ключи');
    if (s) { var t = String(s.getRange('B4').getValue()).trim(); if (t) return t; }
  } catch (e) {}
  var p = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  return p ? String(p).trim() : '';
}

function fetchCode_() {
  var tok = ghToken_();
  if (!tok) throw new Error('Нет GitHub-токена: вставьте PAT (Contents: Read-only) в «Ключи» B4.');
  var url = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO +
            '/contents/' + GH_FILE + '?ref=' + GH_BRANCH;
  var resp = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'Bearer ' + tok,
               'Accept': 'application/vnd.github.raw+json',
               'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode(), src = resp.getContentText();
  if (code === 401) throw new Error('GitHub: токен не принят (401) — истёк или неверный. Обновите «Ключи» B4.');
  if (code === 403) throw new Error('GitHub: нет доступа (403) — у токена нет права Contents: Read-only.');
  if (code === 404) throw new Error('GitHub: файл не найден (404) — проверьте репозиторий/файл/ветку.');
  if (code !== 200) throw new Error('GitHub: ошибка ' + code + ': ' + String(src).slice(0, 200));
  if (!src || src.indexOf('function') < 0) throw new Error('В файле кода не код.');
  return src;
}

/** Резолв функции центрального кода ПО ИМЕНИ: новая функция не требует правки лоадера.
 *  args — необязательный массив аргументов (диалогам нужна строка версии). */
function run_(name, args) {
  var body = fetchCode_() + '\n;return (typeof ' + name + ' === "function" ? ' + name + ' : null);';
  var f = (new Function(body))();
  if (!f) throw new Error('В центральном коде нет функции ' + name + ' — обновите файл кода.');
  return f.apply(null, args || []);
}

/** HTML-диалог. HtmlService работает только из СТАТИЧЕСКОГО кода проекта, поэтому окно
 *  рисует лоадер, а центральный код отдаёт {html, text}. Не открылось — текст alert'ом:
 *  инструкция обязана дойти до человека в любом случае. */
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

/** Меню — в порядке работы. 🔴 стоит ТОЛЬКО у пунктов, которые пишут во внешнюю систему. */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📦 <МОДУЛЬ>')
    .addItem('1️⃣ 🔄 Обновить данные из <источник>', 'mStep1')
    .addItem('2️⃣ 🧾 <Подготовить>', 'mStep2')
    .addItem('3️⃣ 🔴 <Записать во внешнюю систему>', 'mStep3')
    .addSeparator()
    .addItem('📖 Как работать (инструкция)', 'mHelp')
    .addItem('📊 Что сейчас происходит', 'mStatus')
    .addItem('🔌 Проверка связи', 'mCheck')
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠 Ручной режим')
      .addItem('<точечный повтор>', 'mManual'))
    .addSeparator()
    .addItem('⚙️ Обновить настройки таблицы', 'mUpgrade')
    .addItem('ℹ️ Версия кода', 'mVersion')
    .addToUi();
}

function mStep1()  { return run_('<step1>'); }
function mStep2()  { return run_('<step2>'); }
function mStep3()  { return run_('<step3>'); }
function mManual() { return run_('<manual>'); }
function mCheck()  { return run_('<модуль>CheckConnection'); }
function mUpgrade(){ return run_('upgradeSheets'); }

function mHelp()   { showHtml_(run_('<модуль>Help',   [centralVersion_()]), '📖 Как работать', 900, 680); }
function mStatus() { showHtml_(run_('<модуль>Status', [centralVersion_()]), '📊 Что сейчас происходит', 720, 560); }

/** Облачное продолжение очередей: триггер вызывает функцию с ЭТИМ именем.
 *  Имя не переименовывать — на нём висят уже установленные триггеры. */
function continueQueue() { return run_('continueQueue'); }

function mVersion() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Версия кода', centralVersion_() + '\n\nИсточник: GitHub ' + GH_OWNER + '/' +
    GH_REPO + '/' + GH_FILE + '@' + GH_BRANCH + '\nЛоадер: v1', ui.ButtonSet.OK);
}
