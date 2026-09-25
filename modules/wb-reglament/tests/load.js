/* Загрузка .gs-файлов в тест: код в проекте — тот же, что уезжает в Apps Script.
   Файлы склеиваются в ОДНУ обёртку — в Apps Script у них тоже общая область видимости.
   Выполняем в текущем реалме (не в отдельном контексте vm), иначе массивы из скрипта
   не проходят deepStrictEqual: у них другой прототип Array. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MAP = { 'fbs_math.gs': '01_fbs_math.js', 'fbs_wb.gs': '02_fbs_wb.js', 'fbs_sheet.gs': '03_fbs_sheet.js' };

function load(files = ['fbs_math.gs'], overrides = {}) {
  const source = files
    .map((name) => {
      const filename = path.join(__dirname, '..', 'central', 'src', MAP[name] || name);
      return '/* ' + name + ' */\n' + fs.readFileSync(filename, 'utf8');
    })
    .join('\n');

  const names = Object.keys(overrides);
  const factory = vm.runInThisContext(
    '(function (module, exports, ' + names.concat(['__unused']).join(', ') + ') {\n' +
    source + '\n})',
    { filename: files.join('+') }
  );
  const box = { exports: {} };
  factory.apply(null, [box, box.exports].concat(names.map((n) => overrides[n])));
  return box.exports;
}

module.exports = { load };
