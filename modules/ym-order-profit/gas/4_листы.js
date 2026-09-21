/* ЧП ПО ЗАКАЗАМ ЯНДЕКС МАРКЕТА — ЛИСТЫ КНИГИ — см. историю версий в «1_меню.js»
 *
 * «🧾 ЧП ЯМ по заказам»   — вчерашние заказы по артикулам. Каждый прогон перезаписывается целиком.
 *                            Синие колонки — коэффициенты модели, остальное — формулы от них.
 * «📈 ЧП ЯМ по дням»      — история по кабинетам. Прогон добавляет блок за вчера наверх; строки
 *                            вчерашнего дня считаются формулами из листа по заказам, а перед следующим
 *                            прогоном замораживаются значениями — прошлые дни больше не меняются.
 * «⚙️ ЧП ЯМ коэффициенты» — из скольких заказов и за какие даты посчитан каждый коэффициент.
 * «📖 ЧП ЯМ как считается» — логика словами.
 */

var YOP_SH = {
  detail: '🧾 ЧП ЯМ по заказам', days: '📈 ЧП ЯМ по дням', coef: '⚙️ ЧП ЯМ коэффициенты',
  help: '📖 ЧП ЯМ как считается', settings: '⚙️ ЧП ЯМ настройки', old: '📊 Ежедневный'
};
var YOP_HEAD_ROW = 4;

function yopRu_(iso) { return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4); }

function yopSheet_(name) {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Себестоимость из юнитки кабинета: колонки ищутся по заголовкам «Код 1С» и «себес». */
function yopUnit_(unitName) {
  var sh = SpreadsheetApp.getActive().getSheetByName(unitName);
  if (!sh) return { cogs: {}, formula: null };
  var v = sh.getDataRange().getValues(), h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var kc = h.indexOf('код 1с'), cc = h.indexOf('себес'), cogs = {};
  if (kc < 0 || cc < 0) return { cogs: {}, formula: null };
  v.slice(1).forEach(function (r) {
    var k = String(r[kc]).trim();
    if (k && typeof r[cc] === 'number') cogs[k] = r[cc];
  });
  var col = function (i) { return yopCol_(i + 1); };
  return { cogs: cogs, formula: "IFERROR(VLOOKUP($B{r},'" + unitName + "'!$" + col(kc) + ':$' + col(cc) + ',' + (cc - kc + 1) + ',FALSE),0)' };
}

function yopCol_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Прогноз дня по всем кабинетам настроек. */
function yopForecastAll_(day) {
  var out = [];
  yopSettings_().cabinets.forEach(function (c) {
    var cache = yopCacheLoad_(c.name), unit = yopUnit_(c.unit);
    var f = yopForecast_(cache, day, unit.cogs);
    out.push({ name: c.name, unit: unit, rows: f.rows, coef: f.coef, dayCost: cache.dayCost[day] || {}, cache: cache });
  });
  return out;
}

// --- «🧾 ЧП ЯМ по заказам» ---------------------------------------------------------------

var YOP_DETAIL_HEAD = ['Кабинет', 'Артикул', 'Заказано, шт', 'Цена ср., ₽', 'Сумма заказов, ₽', 'Ставка буста ср.',
  'Выкуп', 'Тариф комиссии', 'Буст: доля ставки к списанию', 'Доставка, % цены', 'Перевод денег, % цены',
  'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу, ₽ на шт', 'Себес, ₽',
  'Выручка (прогноз), ₽', 'Комиссия, ₽', 'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽',
  'Эквайринг, ₽', 'Невыкупы/возвраты, ₽', 'Прочее по заказу, ₽', 'Себес, ₽', 'ЧП заказов, ₽', 'ЧП на заказ, ₽',
  'Маржа к сумме заказов', 'Коэффициенты по', 'Когорта, шт', 'Себес найден в юнитке'];

function yopWriteDetail_(day, all) {
  var sh = yopSheet_(YOP_SH.detail), rows = [], r = YOP_HEAD_ROW + 1;
  all.forEach(function (cab) {
    cab.rows.forEach(function (x) {
      var c = x.coef;
      rows.push([cab.name, x.sku, x.n, x.price, '=C' + r + '*D' + r, x.bid,
        c.выкуп, c.тариф, c.буст_k, c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее,
        cab.unit.formula ? '=' + cab.unit.formula.replace('{r}', r) : 0,
        '=E' + r + '*G' + r, '=Q' + r + '*H' + r, '=E' + r + '*F' + r + '*I' + r, '=E' + r + '*J' + r,
        '=C' + r + '*G' + r + '*L' + r, '=E' + r + '*K' + r, '=C' + r + '*M' + r, '=C' + r + '*N' + r,
        '=C' + r + '*O' + r, '=C' + r + '*G' + r + '*P' + r,
        '=Q' + r + '-SUM(R' + r + ':Z' + r + ')', '=IFERROR(AA' + r + '/C' + r + ',0)', '=IFERROR(AA' + r + '/E' + r + ',0)',
        x.src, c.когорта_шт, x.cogs === null ? 'НЕТ — себес 0' : 'да']);
      r++;
    });
  });
  sh.clear();
  sh.getRange(1, 1).setValue('ЧП по заказам за ' + yopRu_(day) + ' — прогноз по истории своих заказов (скрипт ' + YOP_VERSION + ')')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue('Лист перезаписывается каждым прогоном. Синие колонки G–O — коэффициенты модели: их можно ' +
    'поменять руками, колонки Q–AC пересчитаются. Себес (P) тянется формулой из юнитки кабинета.').setFontStyle('italic');
  yopHeader_(sh, YOP_DETAIL_HEAD);
  if (rows.length) {
    sh.getRange(YOP_HEAD_ROW + 1, 1, rows.length, rows[0].length).setValues(rows);
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 4, n, 2).setNumberFormat('#,##0');
    sh.getRange(R, 6, n, 6).setNumberFormat('0.0%');
    sh.getRange(R, 12, n, 5).setNumberFormat('#,##0.00');
    sh.getRange(R, 17, n, 12).setNumberFormat('#,##0');
    sh.getRange(R, 29, n, 1).setNumberFormat('0.0%');
    sh.getRange(R, 7, n, 9).setBackground('#dde9ff');
  }
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 300);
  return rows.length;
}

// --- «📈 ЧП ЯМ по дням» ---------------------------------------------------------------------

var YOP_DAYS_HEAD = ['Дата', 'Кабинет', 'Заказано, шт', 'Сумма заказов, ₽', 'Выручка (прогноз), ₽', 'Комиссия, ₽',
  'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽', 'Эквайринг, ₽', 'Невыкупы/возвраты, ₽',
  'Прочее по заказам, ₽', 'Себес, ₽', 'ЧП заказов дня, ₽', 'Реклама за показы (факт дня), ₽', 'Хранение (факт дня), ₽',
  'Подписка (факт дня), ₽', 'Прочие расходы дня, ₽', 'Маржа до налога, ₽', 'Налог 25% (как в юнитке), ₽', 'ЧП, ₽',
  'Маржа к выручке', 'Старый отчёт: ЧП, ₽', 'Разница с новым, ₽'];
// колонки «по дням» C..N ← колонки листа по заказам
var YOP_DAYS_SRC = ['C', 'E', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
var YOP_ORDER_KEYS = ['выручка', 'комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее', 'себес'];

/** Строки блока одного дня. live = строки кабинетов формулами из листа по заказам (только для «вчера»). */
function yopDayBlock_(day, all, old, firstRow, live, detailLast) {
  var out = [], r = firstRow;
  all.forEach(function (cab) {
    var row = [yopRu_(day), cab.name];
    if (live) {
      YOP_DAYS_SRC.forEach(function (c) {
        row.push("=SUMIFS('" + YOP_SH.detail + "'!$" + c + '$5:$' + c + '$' + detailLast + ",'" + YOP_SH.detail + "'!$A$5:$A$" + detailLast + ',$B' + r + ')');
      });
    } else {
      var s = function (k) { return cab.rows.reduce(function (a, x) { return a + x[k]; }, 0); };
      row.push(s('n'), Math.round(s('gmv')));
      YOP_ORDER_KEYS.forEach(function (k) { row.push(Math.round(s(k))); });
    }
    var dc = cab.dayCost, o = old[cab.name + '|' + day];
    row.push('=E' + r + '-SUM(F' + r + ':N' + r + ')',
      Math.round(dc['показы'] || 0), Math.round(dc['хранение'] || 0), Math.round(dc['подписка'] || 0), Math.round(dc['прочее'] || 0),
      '=O' + r + '-SUM(P' + r + ':S' + r + ')', '=T' + r + '*' + Math.round(YOP.TAX * 100) + '/100', '=T' + r + '-U' + r,
      '=IFERROR(V' + r + '/E' + r + ',0)', o == null ? '' : Math.round(o), '=IF(X' + r + '="","",V' + r + '-X' + r + ')');
    out.push(row);
    r++;
  });
  var a = firstRow, b = r - 1, tot = [yopRu_(day), 'Все кабинеты'];
  'CDEFGHIJKLMNOPQRSTUV'.split('').forEach(function (c) { tot.push('=SUM(' + c + a + ':' + c + b + ')'); });
  tot.push('=IFERROR(V' + r + '/E' + r + ',0)', '=SUM(X' + a + ':X' + b + ')', '=V' + r + '-X' + r);
  out.push(tot);
  return out;
}

/** ЧП старого ежедневного отчёта книги: { "кабинет|дата": ЧП } — для колонки сравнения. */
function yopOldDaily_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(YOP_SH.old), out = {};
  if (!sh) return out;
  var v = sh.getDataRange().getValues();
  if (v.length < 3) return out;
  v[0].forEach(function (name, i) {
    name = String(name).trim();
    if (!name) return;
    var j = -1;
    for (var k = i; k < i + 9 && k < v[1].length; k++) if (String(v[1][k]).indexOf('Прибыль') === 0) { j = k; break; }
    if (j < 0) return;
    v.slice(2).forEach(function (r) {
      var d = r[i], iso;
      if (d instanceof Date) iso = Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd');
      else if (/^\d{2}\.\d{2}\.\d{4}$/.test(String(d).trim())) { var p = String(d).trim().split('.'); iso = p[2] + '-' + p[1] + '-' + p[0]; }
      if (iso && typeof r[j] === 'number') out[name + '|' + iso] = r[j];
    });
  });
  return out;
}

function yopDaysSheet_() {
  var sh = yopSheet_(YOP_SH.days);
  if (String(sh.getRange(YOP_HEAD_ROW, 16).getValue()).indexOf('Реклама за показы') !== 0) {
    sh.clear();                                   // старая раскладка колонок (демо) — лист собирается заново
    sh.getRange(1, 1).setValue('ЧП ЯМ по дням — прибыль заказов дня плюс расходы дня (скрипт ' + YOP_VERSION + ')')
      .setFontWeight('bold').setFontSize(13);
    sh.getRange(2, 1).setValue('Новый день добавляется сверху каждым прогоном. Строки вчерашнего дня считаются формулами из ' +
      'листа «' + YOP_SH.detail + '», перед следующим прогоном замораживаются значениями. Реклама за показы, хранение, ' +
      'подписка — факт начисления дня, по артикулам не делятся.').setFontStyle('italic');
    yopHeader_(sh, YOP_DAYS_HEAD);
  }
  return sh;
}

/** Заморозить формулы истории значениями и убрать блок дня `day`, если он уже есть (перезапуск). */
function yopFreezeAndDrop_(sh, day) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return;
  var rng = sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, YOP_DAYS_HEAD.length);
  rng.setValues(rng.getValues());
  var dates = sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, 1).getDisplayValues(), ru = yopRu_(day);
  for (var i = dates.length - 1; i >= 0; i--) {
    if (dates[i][0] === ru) sh.deleteRow(YOP_HEAD_ROW + 1 + i);
  }
  while (sh.getLastRow() > YOP_HEAD_ROW && !sh.getRange(YOP_HEAD_ROW + 1, 1).getDisplayValue()) sh.deleteRow(YOP_HEAD_ROW + 1);
}

function yopInsertBlock_(sh, block) {
  sh.insertRowsBefore(YOP_HEAD_ROW + 1, block.length + 1);
  sh.getRange(YOP_HEAD_ROW + 1, 1, block.length + 1, YOP_DAYS_HEAD.length).clearFormat();
  sh.getRange(YOP_HEAD_ROW + 1, 1, block.length, block[0].length).setValues(block);
  yopDaysFormat_(sh, YOP_HEAD_ROW + 1, block.length);
}

function yopDaysFormat_(sh, row, n) {
  sh.getRange(row, 3, n, 20).setNumberFormat('#,##0');
  sh.getRange(row, 23, n, 1).setNumberFormat('0.0%');
  sh.getRange(row, 24, n, 2).setNumberFormat('#,##0');
  sh.getRange(row + n - 1, 1, 1, YOP_DAYS_HEAD.length).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(row, 15, n, 1).setFontWeight('bold');
  sh.getRange(row, 22, n, 1).setFontWeight('bold');
}

// --- «⚙️ ЧП ЯМ коэффициенты» -------------------------------------------------------------------

function yopWriteCoef_(day, all) {
  var sh = yopSheet_(YOP_SH.coef), rows = [];
  all.forEach(function (cab) {
    Object.keys(cab.coef).sort(function (a, b) { return a === '*' ? -1 : b === '*' ? 1 : a < b ? -1 : 1; }).forEach(function (k) {
      var c = cab.coef[k];
      rows.push([cab.name, k === '*' ? '* весь кабинет' : k, c.когорта_шт, c.когорта_доставлено, c.выкуп, c.тариф, c.буст_k,
        c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее]);
    });
  });
  sh.clear();
  sh.getRange(1, 1).setValue('Коэффициенты модели на ' + yopRu_(day)).setFontWeight('bold').setFontSize(13);
  sh.getRange(2, 1).setValue('Выкуп и доли расходов — заказы ' + yopRu_(yopAddDays_(day, -YOP.COHORT_FROM)) + '–' +
    yopRu_(yopAddDays_(day, -YOP.COHORT_TO)) + ' (только с известной судьбой); средняя миля — заказы ' +
    yopRu_(yopAddDays_(day, -YOP.MILE_FROM)) + '–' + yopRu_(yopAddDays_(day, -YOP.MILE_TO)) +
    '; тариф — самый частый в начислениях комиссии за 14 дней. Артикул с когортой меньше ' + YOP.MIN_UNITS +
    ' шт считается по строке «* весь кабинет».').setFontStyle('italic');
  yopHeader_(sh, ['Кабинет', 'Артикул', 'Когорта: заказано, шт', 'Когорта: доставлено, шт', 'Выкуп', 'Тариф комиссии',
    'Буст: доля ставки к списанию', 'Доставка, % цены', 'Перевод, % цены', 'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт',
    'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу, ₽ на шт']);
  if (rows.length) {
    sh.getRange(YOP_HEAD_ROW + 1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(YOP_HEAD_ROW + 1, 5, rows.length, 5).setNumberFormat('0.0%');
    sh.getRange(YOP_HEAD_ROW + 1, 10, rows.length, 4).setNumberFormat('#,##0.00');
  }
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 300);
}

// --- «📖 ЧП ЯМ как считается» ------------------------------------------------------------------

function yopWriteHelp_() {
  var L = [
    ['Как считается ЧП по заказам Яндекс Маркета (скрипт ' + YOP_VERSION + ')'], [''],
    ['Главное правило'],
    ['Считаем, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня. Маркет списывает комиссию и буст при доставке, через дни и недели ' +
     'после заказа. Если брать списания вчерашнего дня, в отчёт попадают расходы по заказам недельной давности.'], [''],
    ['Что фактом из Маркета, а что прогнозом'],
    ['ФАКТ по заказам вчера: количество, цена продавца (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе.'],
    ['ФАКТ дня: реклама за показы (буст показов, полки, баннеры), хранение, подписка и прочие начисления без номера заказа — ' +
     'по дате начисления, отдельными колонками, по артикулам не делятся.'],
    ['ПРОГНОЗ по коэффициентам: всё, что Маркет спишет с вчерашних заказов позже, — выкуп, комиссия, буст продаж, доставка, ' +
     'средняя миля, перевод денег, эквайринг, невыкупы и возвраты.'],
    ['ИЗ ЮНИТКИ: себестоимость (формулой, колонка «себес» по «Код 1С»).'], [''],
    ['Откуда коэффициенты'],
    ['Из факта по прошлым заказам. Отчёт Маркета «Стоимость услуг» привязывает каждое удержание к номеру заказа, поэтому по ' +
     'заказам 14–35 дней назад (их судьба уже известна) видно, какая доля выкупилась и сколько Маркет по ним списал.'],
    ['Выкуп = доставлено ÷ заказано. Буст = ставка из заказа × доля ставки, которую Маркет реально списал. Доставка и перевод — ' +
     'доля от суммы заказов. Средняя миля — ₽ на доставленную штуку по заказам 8–21 день (ставка меняется быстро). ' +
     'Тариф комиссии — действующий, из последних начислений (с заказов 01.09.2026 — 49 %).'],
    ['У артикула меньше 30 шт в когорте — берутся коэффициенты кабинета (лист «' + YOP_SH.coef + '»).'], [''],
    ['Налог'],
    ['Как в юнитке: минус 25 % от маржи дня (маржа = ЧП заказов − расходы дня). При отрицательной марже формула уменьшает убыток — так же, как в юнитке.'], [''],
    ['Где код'],
    ['Расширения → Apps Script этого проекта, файл «3_модель» — вся логика расчёта; «2_сбор» — что берётся из Маркета; ' +
     '«4_листы» — запись листов. Историю заказов скрипт хранит файлами на Диске (лист «' + YOP_SH.settings + '»).'], [''],
    ['Проверка на факте (крупнейший кабинет, заказы 01–03.09.2026, коэффициенты только из августа)'],
    ['Выручка −0,4 %, буст −1,6 %, доставка −0,5 %, себес −0,6 % от факта Маркета; ЧП заказов −372 против −393 тыс. ₽. ' +
     'Комиссия и средняя миля отклонились сильнее: 01.09 сменился тариф и упала ставка мили, модель узнаёт такие смены с задержкой.']
  ];
  var sh = yopSheet_(YOP_SH.help);
  sh.clear();
  sh.getRange(1, 1, L.length, 1).setValues(L).setWrap(true);
  sh.setColumnWidth(1, 900);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  L.forEach(function (r, i) {
    if (['Главное правило', 'Что фактом из Маркета, а что прогнозом', 'Откуда коэффициенты', 'Налог', 'Где код'].indexOf(r[0]) >= 0 ||
        r[0].indexOf('Проверка на факте') === 0) sh.getRange(i + 1, 1).setFontWeight('bold');
  });
}

function yopHeader_(sh, head) {
  sh.getRange(YOP_HEAD_ROW, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true)
    .setVerticalAlignment('middle').setBackground('#e8f0fe');
  sh.setFrozenRows(YOP_HEAD_ROW);
  for (var i = 3; i <= head.length; i++) sh.setColumnWidth(i, 110);
}

// --- сборка --------------------------------------------------------------------------------

/** Записать день: лист по заказам, коэффициенты и блок в истории. */
function yopWriteDay_(day) {
  var cur = SpreadsheetApp.getActive().getSheetByName(YOP_SH.days);
  if (!cur || String(cur.getRange(YOP_HEAD_ROW, 16).getValue()).indexOf('Реклама за показы') !== 0) {
    yopRebuildDays_(day, 14);                     // листа нет или он в раскладке демо — собрать историю сразу
    return;
  }
  var all = yopForecastAll_(day);
  var n = yopWriteDetail_(day, all);
  yopWriteCoef_(day, all);
  yopWriteHelp_();
  var sh = yopDaysSheet_();
  yopFreezeAndDrop_(sh, day);
  yopInsertBlock_(sh, yopDayBlock_(day, all, yopOldDaily_(), YOP_HEAD_ROW + 1, true, YOP_HEAD_ROW + Math.max(n, 1)));
  SpreadsheetApp.flush();
}

/** Пересобрать историю за `days` дней: прошлые дни значениями, последний — формулами. */
function yopRebuildDays_(upto, days) {
  var sh = yopSheet_(YOP_SH.days);
  sh.clear();
  sh = yopDaysSheet_();                           // пишет шапку новой раскладки — повторной пересборки не будет
  var old = yopOldDaily_(), caches = {}, flats = {}, units = {};
  for (var k = days - 1; k >= 1; k--) {
    var d = yopAddDays_(upto, -k), all = [];
    yopSettings_().cabinets.forEach(function (c) {
      var cache = caches[c.name] || (caches[c.name] = yopCacheLoad_(c.name));
      var unit = units[c.name] || (units[c.name] = yopUnit_(c.unit));
      var flat = flats[c.name] || (flats[c.name] = yopItems_(cache));
      var f = yopForecast_(cache, d, unit.cogs, flat);
      all.push({ name: c.name, rows: f.rows, dayCost: cache.dayCost[d] || {} });
    });
    yopInsertBlock_(sh, yopDayBlock_(d, all, old, YOP_HEAD_ROW + 1, false, 0));
  }
  yopWriteDay_(upto);
}
