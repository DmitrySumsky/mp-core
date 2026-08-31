/* <МОДУЛЬ> — ЦЕНТРАЛЬНЫЙ КОД v1.0.0 — ДД.ММ.ГГГГ */
/* v1.0.0: ПЕРВАЯ ВЕРСИЯ.
   Новая версия = НОВЫЙ БЛОК СВЕРХУ, старые блоки не переписываются и не удаляются.
   В блоке — ПРИЧИНА, а не список правок: первой строкой заглавными «что болело и откуда
   пришло» (жалоба, разбор, запрос), дальше пунктами • что поменялось, в конце — тесты.
   Пример: «v1.1.0: ФАЙЛ СКЛАДА НАЗЫВАЛ КОРОБА ПАЛЕТАМИ (разбор логиста, 21.08.2026)». */

/* ================================================================
 *  ОБЯЗАТЕЛЬНЫЙ МИНИМУМ ПУЛЬТА (см. ПУЛЬТ.md §2-§4)
 *  <модуль>Help(version)             → {html, text}  «📖 Как работать»
 *  <модуль>Status(version)           → {html, text}  «📊 Что сейчас происходит»
 *  <модуль>CheckConnection()         → диалог: ключ / срок / ответ ручки / право записи
 *  upgradeSheets()                   → миграция служебных листов без боевых действий
 *  continueQueue()                   → облачное продолжение очередей (имя фиксировано)
 * ================================================================ */

/** Общая «шапка стилей» диалогов — один вид у инструкции и у статуса. */
function dlgCss_() {
  return '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.55;margin:0;padding:18px;color:#202124}' +
    'h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 6px;font-size:14.5px}' +
    'ol,ul{margin:6px 0 6px 18px;padding:0}li{margin-bottom:6px}' +
    '.red{color:#C5221F;font-weight:600}.ok{color:#188038;font-weight:600}' +
    '.box{background:#F5F5F5;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.warn{background:#FCE8E6;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.muted{color:#666}.big{font-size:22px;font-weight:700}' +
    'table{border-collapse:collapse;margin:8px 0;width:100%}' +
    'td,th{border:1px solid #DADCE0;padding:5px 8px;text-align:left;font-size:13px}' +
    'th{background:#F1F3F4}a{color:#1A73E8}' +
    '</style>';
}

/** HTML-экранирование: в тексты попадают названия, ошибки и данные книги. */
function htmlEsc_(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
