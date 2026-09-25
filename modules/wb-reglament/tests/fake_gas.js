/* Заглушки Apps Script для прогона fbsRunLocked_ в Node.

   Зачем: код пишет боевой лист книги и раз в сутки запускается без человека. Прогнать
   его целиком до выкатки больше негде — `clasp run` в привязанном к книге проекте
   недоступен. Сетка листа тут настоящая (значения, формулы, примечания, размеры),
   WB отвечает подставленными данными, интерфейса нет — как у триггера. */

function makeSheet(name, rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(''));
  const notes = {};
  const backgrounds = [];
  const borders = [];
  const sheet = {
    name,
    grid,
    notes,
    backgrounds,
    frozenRows: 0,
    frozenColumns: 0,
    hidden: false,
    getName: () => name,
    getMaxRows: () => grid.length,
    getMaxColumns: () => (grid[0] ? grid[0].length : 0),
    getLastRow() {
      for (let r = grid.length - 1; r >= 0; r--) {
        if (grid[r].some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
      }
      return 0;
    },
    getLastColumn() {
      let last = 0;
      grid.forEach((row) => row.forEach((v, c) => {
        if (v !== '' && v !== null && v !== undefined) last = Math.max(last, c + 1);
      }));
      return last;
    },
    insertRowsAfter(after, howMany) {
      const width = sheet.getMaxColumns();
      for (let i = 0; i < howMany; i++) grid.splice(after + i, 0, new Array(width).fill(''));
    },
    insertColumnsAfter(after, howMany) {
      grid.forEach((row) => {
        for (let i = 0; i < howMany; i++) row.splice(after + i, 0, '');
      });
    },
    deleteRows(start, howMany) { grid.splice(start - 1, howMany); },
    clearContents() { grid.forEach((row) => row.fill('')); return sheet; },
    setFrozenRows(n) { sheet.frozenRows = n; },
    setFrozenColumns(n) { sheet.frozenColumns = n; },
    getFrozenRows: () => sheet.frozenRows,
    getFrozenColumns: () => sheet.frozenColumns,
    hideSheet() { sheet.hidden = true; },
    getParent: () => null,
    getRange(row, col, numRows, numCols) {
      if (typeof row === 'string') {             // A1-адрес одной ячейки: «Технический»!B2
        const m = row.match(/^([A-Z]+)(\d+)$/);
        let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
        return sheet.getRange(Number(m[2]), c);
      }
      const height = numRows === undefined ? 1 : numRows;
      const width = numCols === undefined ? 1 : numCols;
      if (row < 1 || col < 1) throw new Error(`getRange вне листа: row=${row} col=${col}`);
      if (row + height - 1 > grid.length || col + width - 1 > sheet.getMaxColumns()) {
        throw new Error(`getRange за границей листа «${name}»: ` +
          `${row},${col} ${height}x${width} при ${grid.length}x${sheet.getMaxColumns()}`);
      }
      const range = {
        getValues() {
          const out = [];
          for (let r = 0; r < height; r++) {
            out.push(grid[row - 1 + r].slice(col - 1, col - 1 + width));
          }
          return out;
        },
        getDisplayValues() { return range.getValues().map((r) => r.map((v) => String(v))); },
        getValue: () => range.getValues()[0][0],
        getFormula() {
          const v = range.getValue();
          return typeof v === 'string' && v.startsWith('=') ? v : '';
        },
        setValues(values) {
          if (values.length !== height || values[0].length !== width) {
            throw new Error(`setValues: ${values.length}x${values[0].length} в диапазон ` +
                            `${height}x${width} листа «${name}»`);
          }
          values.forEach((line, r) => line.forEach((v, c) => { grid[row - 1 + r][col - 1 + c] = v; }));
          return range;
        },
        setValue(v) { grid[row - 1][col - 1] = v; return range; },
        setFormula(v) { grid[row - 1][col - 1] = v; return range; },
        clearContent() {
          for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) grid[row - 1 + r][col - 1 + c] = '';
          }
          return range;
        },
        setNote(text) { notes[`${row},${col}`] = text; return range; },
        setBackground(color) { backgrounds.push({ row, col, height, width, color }); return range; },
        // Оформление на значения не влияет — заглушки цепочки вызовов (v2.1.0).
        setFontWeight: () => range,
        setWrap: () => range,
        setFontColor: () => range,
        setFontSize: () => range,
        setNumberFormat: () => range,
        setHorizontalAlignment: () => range,
        setVerticalAlignment: () => range,
        setBorder(...args) { borders.push({ row, col, height, width, args }); return range; },
      };
      return range;
    },
    setColumnWidth: () => sheet,
    setColumnWidths: () => sheet,
    setRowHeight: () => sheet,
    setHiddenGridlines: () => sheet,
    setConditionalFormatRules(rules) { sheet.rules = rules; return sheet; },
    getConditionalFormatRules: () => sheet.rules,
  };
  sheet.borders = borders;
  sheet.rules = [];
  return sheet;
}

/** Построитель правил условного форматирования: запоминает, что ему сказали. */
function newConditionalFormatRule() {
  const spec = { ranges: [], formula: null, background: null, fontColor: null, bold: false };
  const builder = {
    whenFormulaSatisfied(f) { spec.formula = f; return builder; },
    setRanges(r) { spec.ranges = r; return builder; },
    setBackground(c) { spec.background = c; return builder; },
    setFontColor(c) { spec.fontColor = c; return builder; },
    setBold(v) { spec.bold = v; return builder; },
    build: () => spec,
  };
  return builder;
}

function makeBook(sheets) {
  const book = {
    sheets,
    toast() {},
    getSheetByName: (name) => sheets.find((s) => s.getName() === name) || null,
    insertSheet(name) {
      const sheet = makeSheet(name, 1000, 26);
      sheets.push(sheet);
      return sheet;
    },
    getSpreadsheetLocale: () => 'ru_RU',
  };
  return book;
}

/** Ответы WB: склады, остатки по складам, сборочные задания. */
function makeFetch(wb) {
  const calls = [];
  return {
    calls,
    fetch(url, options) {
      calls.push({ url, method: (options.method || 'get').toLowerCase(), payload: options.payload });
      let body = null;
      if (url.endsWith('/api/v3/warehouses')) {
        body = wb.warehouses;
      } else if (/\/api\/v3\/stocks\/\d+$/.test(url) && options.method === 'post') {
        const id = Number(url.split('/').pop());
        const skus = JSON.parse(options.payload).skus;
        body = { stocks: skus.filter((sku) => (wb.stocks[id] || {})[sku] !== undefined)
                             .map((sku) => ({ sku, amount: wb.stocks[id][sku] })) };
      } else if (/\/api\/v3\/stocks\/\d+$/.test(url) && options.method === 'put') {
        body = null;
      } else if (url.indexOf('/api/v3/orders?') >= 0) {
        body = url.indexOf('next=0') >= 0 ? { orders: wb.orders, next: 0 } : { orders: [] };
      } else {
        throw new Error('Заглушка не знает адрес: ' + url);
      }
      return {
        getResponseCode: () => 200,
        getContentText: () => (body === null ? '' : JSON.stringify(body)),
      };
    },
  };
}

/** Utilities: даты и сон. Формат — только тот, что реально просит код. */
const Utilities = {
  formatDate(date, tz, pattern) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(date);
    if (pattern === 'yyyy-MM-dd') {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
  parseDate(text) { return new Date(text.replace(' ', 'T')); },
  sleep() {},
  base64Decode: (s) => Buffer.from(s, 'base64'),
  newBlob: (buf) => ({ getDataAsString: () => Buffer.from(buf).toString('utf8') }),
};

module.exports = { makeSheet, makeBook, makeFetch, Utilities, newConditionalFormatRule };
