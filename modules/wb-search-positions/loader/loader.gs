/**
 * ПОЗИЦИИ В ПОИСКЕ WB — ЛОАДЕР КНИГИ v1 — 17.09.2026
 *
 * v1: первая версия. Меню пульта, run_(), HTML-диалог, витрина скоупов, обработчики
 *     триггеров posDailyTrigger (ежедневный замер) и continueQueue (облачное продолжение).
 *
 * Единственный файл модуля внутри книги. Логика лежит в репозитории
 * (mp-core, файл modules/wb-search-positions/central/build/central.js) и тянется при каждом
 * клике: правка логики = один пуш, книга на новой версии со следующего клика по меню.
 *
 * ЧТО НАСТРАИВАЕТСЯ (и больше нигде): лист «Ключи» книги.
 *   B1 — подпись кабинета для сообщений
 *   B2 — токен WB, категория «Аналитика» (у кабинета нужна подписка Джем)
 *   B3 — регион выдачи (dest), Москва = -1257786
 *   B4 — GitHub-токен (fine-grained PAT, Contents: Read-only). Пусто, пока репозиторий открыт
 *   B5/B6 — токен бота и чат оповещений (необязательно)
 *   B7 — глубина органики, страниц по 100 (1–3)
 *   B8 — запросов на артикул из отчёта WB (1–30)
 *   B9 — час автопрогона по Москве
 *
 * ЛОАДЕР ЗАМОРОЖЕН: правки функционала делаются в репозитории. Этот файл трогают только
 * когда меняется НАБОР ПУНКТОВ МЕНЮ (run_ резолвит функции центрального кода по имени).
 * Меню собирает лоадер: onOpen — простой триггер, ему запрещён UrlFetchApp.
 */

var GH_OWNER = 'DmitrySumsky';
var GH_REPO = 'mp-core';
var GH_FILE = 'modules/wb-search-positions/central/build/central.js';
var GH_BRANCH = 'main';

/* ---------- дальше ничего менять не нужно ---------- */

/**
 * НЕ ВЫЗЫВАЕТСЯ. Скоупы OAuth выдаются по СТАТИЧЕСКОМУ анализу кода, а загруженный по сети
 * центральный код анализатор не видит: эта функция «показывает» проекту все сервисы, включая
 * операции ЗАПИСИ. DriveApp намеренно НЕТ: модуль на Диск не ходит, лишний скоуп — лишняя
 * переавторизация всех пользователей книги.
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

/** GitHub-токен: лист «Ключи» B4 > Script Properties (GITHUB_TOKEN). Пусто — публичная ссылка. */
function ghToken_() {
  try {
    var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ключи');
    if (s) {
      var t = String(s.getRange('B4').getValue() || '').trim();
      if (t) return t;
    }
  } catch (e) {}
  var p = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  return p ? String(p).trim() : '';
}

/** Код модуля. Кэш на одно исполнение: за прогон файл тянется ровно один раз. */
var POS_CODE_CACHE_ = null;

function fetchCode_() {
  if (POS_CODE_CACHE_) return POS_CODE_CACHE_;
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
  if (code === 401) throw new Error('GitHub: токен не принят (401) — истёк или неверный. Обновите «Ключи» B4.');
  if (code === 403) throw new Error('GitHub: нет доступа (403) — у токена нет права Contents: Read-only на ' + GH_REPO + '.');
  if (code === 404) {
    throw new Error('GitHub: файл кода не найден (404). Проверьте ' + GH_OWNER + '/' + GH_REPO +
      '/' + GH_FILE + '@' + GH_BRANCH + (tok ? ' и что токену выдан доступ к этому репозиторию.'
        : '. Токена нет — код тянется по публичной ссылке; если репозиторий закрыли, вставьте PAT в «Ключи» B4.'));
  }
  if (code !== 200) throw new Error('GitHub: ошибка ' + code + ': ' + String(src).slice(0, 200));
  if (!src || src.indexOf('function posRunAll') < 0) {
    throw new Error('В файле кода не тот код: нет posRunAll. Проверьте путь к файлу.');
  }
  POS_CODE_CACHE_ = src;
  return src;
}

/** Резолв функции центрального кода ПО ИМЕНИ: новая функция не требует правки лоадера. */
function run_(name, args) {
  var body = fetchCode_() + '\n;return (typeof ' + name + ' === "function" ? ' + name + ' : null);';
  var f = (new Function(body))();
  if (!f) throw new Error('В центральном коде нет функции ' + name + ' — обновите файл кода.');
  return f.apply(null, args || []);
}

/** HTML-диалог. HtmlService работает только из СТАТИЧЕСКОГО кода проекта, поэтому окно рисует
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

/**
 * 🔴 в меню НЕТ намеренно: модуль не пишет ни в одну внешнюю систему, только читает WB и
 * заполняет листы своей книги. Метка должна значить одно и то же во всех книгах.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('📈 Позиции WB')
    .addItem('1️⃣ 🔄 Снять позиции по всем артикулам', 'mRunAll')
    .addItem('2️⃣ 🎯 Снять по выделенным артикулам', 'mRunSelected')
    .addSeparator()
    .addItem('📖 Как работать (инструкция)', 'mHelp')
    .addItem('📊 Что сейчас происходит', 'mStatus')
    .addItem('🔌 Проверка связи', 'mCheck')
    .addSeparator()
    .addSubMenu(ui.createMenu('🛠 Ручной режим')
      .addItem('⏰ Включить автопрогон', 'mTriggerOn')
      .addItem('⏰ Отключить автопрогон', 'mTriggerOff')
      .addItem('🧹 Сбросить зависший прогон', 'mReset'))
    .addSeparator()
    .addItem('⚙️ Обновить настройки таблицы', 'mUpgrade')
    .addItem('ℹ️ Версия кода', 'mVersion')
    .addToUi();
}

function mRunAll()      { return run_('posRunAll'); }
function mRunSelected() { return run_('posRunSelected'); }
function mTriggerOn()   { return run_('posInstallDailyTrigger'); }
function mTriggerOff()  { return run_('posRemoveDailyTrigger'); }
function mReset()       { return run_('posResetRun'); }
function mUpgrade()     { return run_('upgradeSheets'); }
function mCheck()       { showHtml_(run_('posCheckConnection'), '🔌 Проверка связи', 760, 520); }

function mHelp()   { showHtml_(run_('posHelp',   [centralVersion_()]), '📖 Как работать', 900, 680); }
function mStatus() { showHtml_(run_('posStatus', [centralVersion_()]), '📊 Что сейчас происходит', 760, 560); }

/** Ежедневный замер: устанавливаемый триггер вызывает функцию с ЭТИМ именем. */
function posDailyTrigger() { return run_('posDailyTrigger'); }

/** Облачное продолжение прогона. Имя не переименовывать — на нём висят установленные триггеры. */
function continueQueue() { return run_('continueQueue'); }

function mVersion() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Версия кода', centralVersion_() + '\n\nИсточник: GitHub ' + GH_OWNER + '/' +
    GH_REPO + '/' + GH_FILE + '@' + GH_BRANCH + '\nЛоадер: v1', ui.ButtonSet.OK);
}
