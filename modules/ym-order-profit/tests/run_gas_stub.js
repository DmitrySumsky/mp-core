// Прогон скрипта книги в Node на заглушках таблицы и Диска: ловит опечатки и несовпадение размеров
// в setValues. node tests/run_gas_stub.js <реестр> <день>
// Себес — файлы cogs_<лист юнитки>.json в папке кэша (необязательны).
const fs = require("fs"), path = require("path"), vm = require("vm");
const registry = JSON.parse(fs.readFileSync(process.argv[2], "utf8")), day = process.argv[3];
const cacheDir = path.join(registry.data_dir, "cache");

class Range {
  constructor(sh, r, c, nr = 1, nc = 1) { Object.assign(this, { sh, r, c, nr, nc }); }
  setValues(v) {
    if (v.length !== this.nr || v.some(x => x.length !== this.nc)) throw new Error(`setValues ${this.sh.name}: ждали ${this.nr}×${this.nc}, пришло ${v.length}×${v[0] && v[0].length}`);
    v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this;
  }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  getValues() { return [...Array(this.nr)].map((_, i) => [...Array(this.nc)].map((_, j) => this.sh.get(this.r + i, this.c + j))); }
  getDisplayValues() { return this.getValues().map(r => r.map(x => x === undefined ? "" : String(x))); }
  getValue() { return this.sh.get(this.r, this.c); }
  getDisplayValue() { const v = this.getValue(); return v === undefined ? "" : String(v); }
}
["setNumberFormat","setBackground","setFontWeight","setFontSize","setFontStyle","setWrap","setVerticalAlignment","clearFormat"].forEach(m => Range.prototype[m] = function () { return this; });
class Sheet {
  constructor(name, rows = []) { this.name = name; this.rows = rows.map(r => r.slice()); }
  get(r, c) { const x = (this.rows[r - 1] || [])[c - 1]; return x === undefined ? "" : x; }
  set(r, c, x) { while (this.rows.length < r) this.rows.push([]); this.rows[r - 1][c - 1] = x; }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { const nc = Math.max(1, ...this.rows.map(r => r.length)); return new Range(this, 1, 1, Math.max(this.rows.length, 1), nc); }
  getLastRow() { let n = this.rows.length; while (n && !this.rows[n - 1].some(x => x !== undefined && x !== "")) n--; return n; }
  clear() { this.rows = []; }
  insertRowsBefore(r, n) { this.rows.splice(r - 1, 0, ...[...Array(n)].map(() => [])); }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  setFrozenRows() {} setColumnWidth() {} activate() {}
}
const sheets = {};
const settings = [["Настройки"], ["…"], ["Папка кэша", "stub"], [], ["Кабинет", "Лист юнитки", "Считать"]];
for (const [cab, c] of Object.entries(registry.cabinets)) {
  const p = c.unit;
  settings.push([cab, p, "да"]);
  const cogsFile = path.join(cacheDir, `cogs_${p}.json`);
  const cogs = fs.existsSync(cogsFile) ? JSON.parse(fs.readFileSync(cogsFile, "utf8")) : {};
  sheets[p] = new Sheet(p, [["Наименование", "", "Код 1С", "себес"], ...Object.entries(cogs).map(([k, v]) => ["", "", k, v])]);
}
sheets["⚙️ ЧП ЯМ настройки"] = new Sheet("⚙️ ЧП ЯМ настройки", settings);
sheets["📊 Ежедневный"] = new Sheet("📊 Ежедневный", [[Object.keys(registry.cabinets)[0]], ["Дата", "Кол-во", "Марж", "Прибыль чистая, руб"], [day.split("-").reverse().join("."), 1, 0, 100]]);
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), toast() {} };
const files = {};
const ctx = {
  SpreadsheetApp: { getActive: () => ss, flush() {}, getUi: () => ({ alert: console.log }) },
  DriveApp: { getFolderById: () => ({ getName: () => "кэш", getFilesByName: n => { const f = path.join(cacheDir, n); const ok = fs.existsSync(f); let used = false;
      return { hasNext: () => ok && !used, next: () => { used = true; return { getBlob: () => ({ getDataAsString: () => files[n] || fs.readFileSync(f, "utf8") }), setContent: t => { files[n] = t; } }; } }; },
    createFile: (n, t) => { files[n] = t; } }) },
  Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {}, deleteProperty() {} }) },
  Logger: { log() {} }, console
};
vm.createContext(ctx);
const gas = path.join(__dirname, "..", "gas");
for (const f of fs.readdirSync(gas).filter(f => f.endsWith(".js")).sort()) vm.runInContext(fs.readFileSync(path.join(gas, f), "utf8"), ctx, { filename: f });
const t0 = Date.now();
sheets["📈 ЧП ЯМ по дням"] = new Sheet("📈 ЧП ЯМ по дням", [["демо"], [], [], ["Дата", "Кабинет"]]);  // раскладка демо
vm.runInContext(`yopWriteDay_(${JSON.stringify(day)})`, ctx);
const d = sheets["📈 ЧП ЯМ по дням"], det = sheets["🧾 ЧП ЯМ по заказам"], co = sheets["⚙️ ЧП ЯМ коэффициенты"];
console.log("время", Date.now() - t0, "мс; строк: по дням", d.getLastRow(), "по заказам", det.getLastRow(), "коэфф.", co.getLastRow());
d.rows.slice(3, 13).forEach(r => console.log(r.slice(0, 3).join(" | "), "|", String(r[14]).slice(0, 40), "|", r[15], r[16], r[17]));
console.log("по заказам, строка 5:", det.rows[4].slice(0, 8).join(" | "), "|", det.rows[4][15]);
