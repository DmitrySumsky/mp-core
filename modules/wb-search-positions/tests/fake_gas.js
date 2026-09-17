/* Стабы Apps Script для Node. FakeSheet проверяет размерность setValues и границы сетки —
   именно на них падает боевой Apps Script, а не на логике. */

function FakeSheet(name, rows, cols) {
  this.name = name;
  this.maxRows = rows || 1000;
  this.maxCols = cols || 26;
  this.values = {};                 // 'r:c' → значение
  this.formats = {};                // 'r:c' → числовой формат
}
FakeSheet.prototype.getName = function () { return this.name; };
FakeSheet.prototype.getMaxRows = function () { return this.maxRows; };
FakeSheet.prototype.getMaxColumns = function () { return this.maxCols; };
FakeSheet.prototype.insertRowsAfter = function (after, n) { this.maxRows += n; };
/** Как в Sheets: колонки правее after сдвигаются вправо вместе со значениями. */
FakeSheet.prototype.insertColumnsAfter = function (after, n) {
  var next = {};
  for (var k in this.values) {
    var p = k.split(':'), r = Number(p[0]), c = Number(p[1]);
    next[r + ':' + (c > after ? c + n : c)] = this.values[k];
  }
  this.values = next;
  this.maxCols += n;
};
FakeSheet.prototype.setFrozenRows = function () { return this; };
FakeSheet.prototype.setColumnWidth = function () { return this; };
FakeSheet.prototype.getLastRow = function () {
  var max = 0;
  for (var k in this.values) { var r = Number(k.split(':')[0]); if (r > max) max = r; }
  return max;
};
FakeSheet.prototype.getLastColumn = function () {
  var max = 0;
  for (var k in this.values) { var c = Number(k.split(':')[1]); if (c > max) max = c; }
  return max;
};
FakeSheet.prototype.getRange = function (a, b, c, d) {
  if (typeof a === 'string') {
    var m = a.match(/^([A-Z]+)(\d+)$/);
    return new FakeRange(this, Number(m[2]), m[1].charCodeAt(0) - 64, 1, 1);
  }
  var rows = c || 1, cols = d || 1;
  if (a < 1 || b < 1 || rows < 1 || cols < 1) throw new Error('getRange: плохие координаты ' + [a, b, rows, cols].join(','));
  if (a + rows - 1 > this.maxRows || b + cols - 1 > this.maxCols) {
    throw new Error('getRange: диапазон ' + [a, b, rows, cols].join(',') + ' за границей листа «' + this.name + '» ' +
      this.maxRows + '×' + this.maxCols);
  }
  return new FakeRange(this, a, b, rows, cols);
};
/** Матрица листа для сверок в тестах. */
FakeSheet.prototype.dump = function () {
  var rows = this.getLastRow(), cols = this.getLastColumn(), out = [];
  for (var r = 1; r <= rows; r++) {
    var row = [];
    for (var c = 1; c <= cols; c++) { var v = this.values[r + ':' + c]; row.push(v === undefined ? '' : v); }
    out.push(row);
  }
  return out;
};

function FakeRange(sheet, row, col, rows, cols) {
  this.sheet = sheet; this.row = row; this.col = col; this.rows = rows; this.cols = cols;
}
FakeRange.prototype.getRow = function () { return this.row; };
FakeRange.prototype.getNumRows = function () { return this.rows; };
FakeRange.prototype.setValues = function (values) {
  if (values.length !== this.rows) throw new Error('setValues: строк ' + values.length + ', а диапазон на ' + this.rows);
  for (var i = 0; i < values.length; i++) {
    if (values[i].length !== this.cols) {
      throw new Error('setValues: в строке ' + i + ' колонок ' + values[i].length + ', а диапазон на ' + this.cols);
    }
    for (var j = 0; j < values[i].length; j++) {
      var key = (this.row + i) + ':' + (this.col + j);
      if (values[i][j] === '' || values[i][j] === null || values[i][j] === undefined) delete this.sheet.values[key];
      else this.sheet.values[key] = values[i][j];
    }
  }
  return this;
};
FakeRange.prototype.setValue = function (v) { this.sheet.values[this.row + ':' + this.col] = v; return this; };
FakeRange.prototype.getValue = function () { var v = this.sheet.values[this.row + ':' + this.col]; return v === undefined ? '' : v; };
FakeRange.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.rows; i++) {
    var row = [];
    for (var j = 0; j < this.cols; j++) { var v = this.sheet.values[(this.row + i) + ':' + (this.col + j)]; row.push(v === undefined ? '' : v); }
    out.push(row);
  }
  return out;
};
FakeRange.prototype.clearContent = function () {
  for (var i = 0; i < this.rows; i++) for (var j = 0; j < this.cols; j++) delete this.sheet.values[(this.row + i) + ':' + (this.col + j)];
  return this;
};
FakeRange.prototype.setNumberFormat = function (fmt) {
  for (var i = 0; i < this.rows; i++) for (var j = 0; j < this.cols; j++) this.sheet.formats[(this.row + i) + ':' + (this.col + j)] = fmt;
  return this;
};
FakeRange.prototype.setFontWeight = function () { return this; };
FakeRange.prototype.setBackground = function () { return this; };

function FakeSpreadsheet(sheets) { this._sheets = sheets || []; this._active = null; this._ranges = []; }
FakeSpreadsheet.prototype.getSheetByName = function (name) {
  for (var i = 0; i < this._sheets.length; i++) if (this._sheets[i].name === name) return this._sheets[i];
  return null;
};
FakeSpreadsheet.prototype.insertSheet = function (name) { var sh = new FakeSheet(name, 1000, 26); this._sheets.push(sh); return sh; };
FakeSpreadsheet.prototype.getActiveSheet = function () { return this._active; };
FakeSpreadsheet.prototype.getActiveRangeList = function () { var r = this._ranges; return { getRanges: function () { return r; } }; };

/** Ставит глобальные стабы GAS. Возвращает {ss, props, triggers, alerts, net}. */
function install(sheets) {
  var ss = new FakeSpreadsheet(sheets);
  var env = { ss: ss, props: {}, triggers: [], alerts: [], net: [], now: null };
  global.SpreadsheetApp = {
    getActiveSpreadsheet: function () { return ss; },
    flush: function () {},
    getUi: function () {
      return { alert: function (t, m) { env.alerts.push([t, m]); }, ButtonSet: { OK: 'OK' } };
    }
  };
  global.Session = { getScriptTimeZone: function () { return 'Europe/Moscow'; } };
  global.Utilities = {
    formatDate: function (d, tz, pat) {
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      var s = { yyyy: d.getFullYear(), MM: p(d.getMonth() + 1), dd: p(d.getDate()), HH: p(d.getHours()), mm: p(d.getMinutes()) };
      return (pat || 'yyyy-MM-dd').replace(/yyyy|MM|dd|HH|mm/g, function (k) { return s[k]; });
    },
    sleep: function (ms) { env.slept = (env.slept || 0) + ms; },
    base64DecodeWebSafe: function (s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); },
    newBlob: function (bytes) { return { getDataAsString: function () { return Buffer.from(bytes).toString('utf8'); } }; }
  };
  global.UrlFetchApp = {
    fetch: function () { throw new Error('сеть в тестах запрещена'); },
    fetchAll: function () { throw new Error('сеть в тестах запрещена'); }
  };
  global.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  global.PropertiesService = { getScriptProperties: function () {
    return {
      getProperty: function (k) { return Object.prototype.hasOwnProperty.call(env.props, k) ? env.props[k] : null; },
      setProperty: function (k, v) { env.props[k] = String(v); },
      deleteProperty: function (k) { delete env.props[k]; }
    };
  } };
  global.ScriptApp = {
    getProjectTriggers: function () { return env.triggers.slice(); },
    deleteTrigger: function (t) { env.triggers = env.triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (handler) {
      var t = { handler: handler, spec: {}, getHandlerFunction: function () { return handler; } };
      var b = {
        timeBased: function () { return b; }, after: function (ms) { t.spec.after = ms; return b; },
        atHour: function (h) { t.spec.hour = h; return b; }, nearMinute: function () { return b; },
        everyDays: function () { return b; }, create: function () { env.triggers.push(t); return t; }
      };
      return b;
    }
  };
  return env;
}

/** Ответ UrlFetchApp для сценариев сети в тестах. */
function resp(code, body, headers) {
  return { getResponseCode: function () { return code; },
    getContentText: function () { return typeof body === 'string' ? body : JSON.stringify(body); },
    getHeaders: function () { return headers || {}; } };
}

module.exports = { FakeSheet: FakeSheet, FakeSpreadsheet: FakeSpreadsheet, install: install, resp: resp };
