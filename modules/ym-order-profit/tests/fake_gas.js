/* Стабы Apps Script для Node. FakeSheet проверяет размерность setValues — именно на ней падает боевой
   Apps Script, а не на логике. Формулы не вычисляются: в ячейке лежит строка формулы. */

function FakeSheet(name, rows) { this.name = name; this.rows = (rows || []).map(function (r) { return r.slice(); }); this.formats = {}; this.maxRows = 1000; }
FakeSheet.prototype.get = function (r, c) { var x = (this.rows[r - 1] || [])[c - 1]; return x === undefined || x === null ? '' : x; };
FakeSheet.prototype.set = function (r, c, x) { while (this.rows.length < r) this.rows.push([]); this.rows[r - 1][c - 1] = x; };
FakeSheet.prototype.getRange = function (a, b, nr, nc) {
  if (typeof a === 'string') {
    var m = a.match(/^([A-Z]+)(\d+)$/), col = 0;
    for (var i = 0; i < m[1].length; i++) col = col * 26 + m[1].charCodeAt(i) - 64;
    return new FakeRange(this, Number(m[2]), col, 1, 1);
  }
  if (a < 1 || b < 1 || (nr !== undefined && nr < 1) || (nc !== undefined && nc < 1)) {
    throw new Error('getRange «' + this.name + '»: плохие координаты ' + [a, b, nr, nc].join(','));
  }
  return new FakeRange(this, a, b, nr || 1, nc || 1);
};
FakeSheet.prototype.getDataRange = function () {
  var nc = Math.max.apply(null, [1].concat(this.rows.map(function (r) { return r.length; })));
  return new FakeRange(this, 1, 1, Math.max(this.rows.length, 1), nc);
};
FakeSheet.prototype.getLastRow = function () {
  var n = this.rows.length;
  while (n && !this.rows[n - 1].some(function (x) { return x !== undefined && x !== null && x !== ''; })) n--;
  return n;
};
FakeSheet.prototype.getLastColumn = function () {
  return Math.max.apply(null, [0].concat(this.rows.map(function (r) { var n = r.length; while (n && (r[n - 1] === undefined || r[n - 1] === '')) n--; return n; })));
};
FakeSheet.prototype.getMaxRows = function () { return Math.max(this.maxRows, this.rows.length); };
FakeSheet.prototype.clear = function () { this.rows = []; this.formats = {}; return this; };
FakeSheet.prototype.insertRowsBefore = function (r, n) {
  while (this.rows.length < r - 1) this.rows.push([]);
  var add = []; for (var i = 0; i < n; i++) add.push([]);
  Array.prototype.splice.apply(this.rows, [r - 1, 0].concat(add));
};
FakeSheet.prototype.deleteRow = function (r) { this.rows.splice(r - 1, 1); };
['setFrozenRows', 'setFrozenColumns', 'setColumnWidth', 'activate'].forEach(function (m) { FakeSheet.prototype[m] = function () { return this; }; });
FakeSheet.prototype.col = function (c, from) {         // значения колонки c начиная со строки from — для сверок
  var out = []; for (var r = from; r <= this.getLastRow(); r++) out.push(this.get(r, c)); return out;
};

function FakeRange(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
FakeRange.prototype.setValues = function (v) {
  if (v.length !== this.nr) throw new Error('setValues «' + this.sh.name + '»: строк ' + v.length + ', а диапазон на ' + this.nr);
  for (var i = 0; i < v.length; i++) {
    if (v[i].length !== this.nc) throw new Error('setValues «' + this.sh.name + '»: в строке ' + i + ' колонок ' + v[i].length + ', а диапазон на ' + this.nc);
    for (var j = 0; j < v[i].length; j++) {
      if (v[i][j] === undefined || (typeof v[i][j] === 'number' && !isFinite(v[i][j]))) {
        throw new Error('setValues «' + this.sh.name + '»: пустое/нечисловое значение в ' + (this.r + i) + ':' + (this.c + j));
      }
      this.sh.set(this.r + i, this.c + j, v[i][j]);
    }
  }
  return this;
};
FakeRange.prototype.setValue = function (x) { this.sh.set(this.r, this.c, x); return this; };
FakeRange.prototype.getValue = function () { return this.sh.get(this.r, this.c); };
FakeRange.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); }
  return out;
};
FakeRange.prototype.getDisplayValues = function () { return this.getValues().map(function (r) { return r.map(String); }); };
FakeRange.prototype.getDisplayValue = function () { return String(this.getValue()); };
FakeRange.prototype.setNumberFormat = function (f) {
  for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) this.sh.formats[(this.r + i) + ':' + (this.c + j)] = f;
  return this;
};
['setBackground', 'setFontWeight', 'setFontSize', 'setFontStyle', 'setWrap', 'setVerticalAlignment', 'clearFormat']
  .forEach(function (m) { FakeRange.prototype[m] = function () { return this; }; });

function FakeSpreadsheet(sheets) { this.sheets = sheets || []; this.toasts = []; }
FakeSpreadsheet.prototype.getSheetByName = function (n) {
  for (var i = 0; i < this.sheets.length; i++) if (this.sheets[i].name === n) return this.sheets[i];
  return null;
};
FakeSpreadsheet.prototype.insertSheet = function (n) { var s = new FakeSheet(n); this.sheets.push(s); return s; };
FakeSpreadsheet.prototype.toast = function (m) { this.toasts.push(m); };

/** Папка Диска в памяти: { имя файла: текст }. */
function FakeFolder(files) { this.files = files || {}; }
FakeFolder.prototype.getName = function () { return 'кэш ЧП ЯМ'; };
FakeFolder.prototype.getFilesByName = function (n) {
  var self = this, used = false;
  return { hasNext: function () { return !used && Object.prototype.hasOwnProperty.call(self.files, n); },
    next: function () { used = true; return { getBlob: function () { return { getDataAsString: function () { return self.files[n]; } }; },
      setContent: function (t) { self.files[n] = t; } }; } };
};
FakeFolder.prototype.createFile = function (n, t) { this.files[n] = t; };

/** Ставит глобальные стабы GAS. router(url, options) → ответ для UrlFetchApp. */
function install(sheets, router) {
  var ss = new FakeSpreadsheet(sheets), folder = new FakeFolder();
  var env = { ss: ss, folder: folder, props: {}, triggers: [], net: [], slept: 0 };
  var moscow = function (d) { return new Date(d.getTime() + 3 * 3600 * 1000); };
  global.SpreadsheetApp = { getActive: function () { return ss; }, getActiveSpreadsheet: function () { return ss; }, flush: function () {},
    getUi: function () { return { alert: function () {}, ButtonSet: { OK: 'OK' } }; } };
  global.DriveApp = { getFolderById: function () { return folder; } };
  global.Logger = { log: function () {} };
  global.Utilities = {
    formatDate: function (d, tz, pat) {
      var m = moscow(d), p = function (n) { return (n < 10 ? '0' : '') + n; };
      var s = { yyyy: m.getUTCFullYear(), MM: p(m.getUTCMonth() + 1), dd: p(m.getUTCDate()), HH: p(m.getUTCHours()),
        mm: p(m.getUTCMinutes()), ss: p(m.getUTCSeconds()) };
      return pat.replace(/yyyy|MM|dd|HH|mm|ss/g, function (k) { return s[k]; });
    },
    sleep: function (ms) { env.slept += ms; },
    unzip: function (blob) { return Object.keys(blob.files).map(function (n) {
      return { getName: function () { return n; }, getDataAsString: function () { return JSON.stringify(blob.files[n]); } }; }); }
  };
  global.UrlFetchApp = {
    fetch: function (url, opt) { env.net.push([url, opt && opt.payload ? JSON.parse(opt.payload) : null]); return router(url, opt || {}); },
    fetchAll: function (reqs) { return reqs.map(function (q) { env.net.push([q.url, null]); return router(q.url, q); }); }
  };
  global.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  global.PropertiesService = { getScriptProperties: function () {
    return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(env.props, k) ? env.props[k] : null; },
      setProperty: function (k, v) { env.props[k] = String(v); }, deleteProperty: function (k) { delete env.props[k]; } };
  } };
  global.ScriptApp = {
    getProjectTriggers: function () { return env.triggers.slice(); },
    deleteTrigger: function (t) { env.triggers = env.triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (handler) {
      var t = { handler: handler, spec: {}, getHandlerFunction: function () { return handler; } };
      var b = { timeBased: function () { return b; }, after: function (ms) { t.spec.after = ms; return b; },
        atHour: function (h) { t.spec.hour = h; return b; }, nearMinute: function () { return b; }, inTimezone: function () { return b; },
        everyDays: function () { return b; }, create: function () { env.triggers.push(t); return t; } };
      return b;
    }
  };
  return env;
}

function resp(code, body, extra) {
  return { getResponseCode: function () { return code; },
    getContentText: function () { return typeof body === 'string' ? body : JSON.stringify(body); },
    getBlob: function () { return extra; } };
}

module.exports = { FakeSheet: FakeSheet, FakeSpreadsheet: FakeSpreadsheet, install: install, resp: resp };