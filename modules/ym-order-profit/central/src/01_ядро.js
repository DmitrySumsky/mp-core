/* ЯДРО: имена листов, даты, журнал событий. */

var YOP_VERSION = 'v2.0.1';
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
