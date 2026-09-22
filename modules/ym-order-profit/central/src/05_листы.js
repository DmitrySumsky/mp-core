/* ЛИСТЫ КНИГИ.
 *
 * «🧾 ЧП ЯМ по заказам»    — вчерашние заказы по артикулам. Каждый прогон перезаписывается целиком.
 *                             Синие колонки — коэффициенты модели, остальное — формулы от них.
 * «📈 ЧП ЯМ по дням»       — история по кабинетам. Прогон добавляет блок за вчера наверх; строки
 *                             вчерашнего дня считаются формулами из листа по заказам, а перед следующим
 *                             прогоном замораживаются значениями — прошлые дни больше не меняются.
 *                             Колонки факта (X–Z) дописываются каждым прогоном по дням старше 14 дней.
 * «🧮 ЧП ЯМ юнитка»        — экономика одной выкупленной штуки по каждому артикулу на данных Маркета.
 * «⚙️ ЧП ЯМ коэффициенты»  — из скольких заказов и за какие даты посчитан каждый коэффициент.
 * «📖 ЧП ЯМ как считается» — логика словами.
 */

var YOP_BLUE = '#dde9ff';
var YOP_GREY = '#f1f1f1';

/** Прогноз дня по всем включённым кабинетам, у которых есть ключ. */
function yopForecastAll_(day) {
  var keys = yopKeys_(), out = [];
  yopSettings_().cabinets.forEach(function (c) {
    if (!keys[c.name]) return;                                   // ждём ключ — кабинет не считается
    var cache = yopCacheLoad_(c.name), cogs = yopCogs_(c), flat = yopItems_(cache);
    var f = yopForecast_(cache, day, yopCogsValues_(cogs), flat, c);
    out.push({ name: c.name, settings: c, cogs: cogs, rows: f.rows, coef: f.coef, dayCost: cache.dayCost[day] || {},
      cache: cache, flat: flat });
  });
  return out;
}

// --- «🧾 ЧП ЯМ по заказам» ---------------------------------------------------------------

var YOP_DETAIL_HEAD = ['Кабинет', 'Артикул', 'Заказано, шт', 'Цена ср., ₽', 'Сумма заказов, ₽', 'Ставка буста ср.',
  'Выкуп', 'Тариф комиссии', 'Буст: доля ставки к списанию', 'Доставка, % цены', 'Перевод денег, % цены',
  'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу, ₽ на шт', 'Себес, ₽',
  'Выручка (прогноз), ₽', 'Комиссия, ₽', 'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽',
  'Эквайринг, ₽', 'Невыкупы/возвраты, ₽', 'Прочее по заказу, ₽', 'Себес, ₽', 'ЧП заказов, ₽', 'ЧП на заказ, ₽',
  'Маржа к сумме заказов', 'Коэффициенты по', 'Когорта, шт', 'Себес найден'];

function yopCogsSrc_(cab, sku) {
  var m = cab.cogs.map[sku];
  return m ? m.src : 'НЕТ — себес 0';
}

function yopWriteDetail_(day, all) {
  var sh = yopSheet_(YOP_SH.detail), rows = [], r = YOP_HEAD_ROW + 1;
  all.forEach(function (cab) {
    cab.rows.forEach(function (x) {
      var c = x.coef;
      rows.push([cab.name, x.sku, x.n, x.price, '=C' + r + '*D' + r, x.bid,
        c.выкуп, c.тариф, c.буст_k, c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее,
        yopCogsFormula_(cab.cogs, '$A' + r, '$B' + r),
        '=E' + r + '*G' + r, '=Q' + r + '*H' + r, '=E' + r + '*F' + r + '*I' + r, '=E' + r + '*J' + r,
        '=C' + r + '*G' + r + '*L' + r, '=E' + r + '*K' + r, '=C' + r + '*M' + r, '=C' + r + '*N' + r,
        '=C' + r + '*O' + r, '=C' + r + '*G' + r + '*P' + r,
        '=Q' + r + '-SUM(R' + r + ':Z' + r + ')', '=IFERROR(AA' + r + '/C' + r + ',0)', '=IFERROR(AA' + r + '/E' + r + ',0)',
        x.src, c.когорта_шт, yopCogsSrc_(cab, x.sku)]);
      r++;
    });
  });
  sh.clear();
  yopTitle_(sh, 'ЧП по заказам за ' + yopRu_(day) + ' — прогноз по истории своих заказов (' + YOP_VERSION + ')',
    'Лист перезаписывается каждым прогоном. Синие колонки G–O — коэффициенты модели: их можно поменять руками, ' +
    'колонки Q–AC пересчитаются. Себес (P) — формулой: лист «' + YOP_SH.cogs + '», если там есть артикул, иначе юнитка кабинета.');
  yopHeader_(sh, YOP_DETAIL_HEAD, { 1: 130, 2: 300 });
  if (rows.length) {
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 2, n, 1).setNumberFormat('@');                // артикул — текстом ДО записи: артикул из одних цифр не станет числом
    sh.getRange(R, 1, n, rows[0].length).setValues(yopFx_(rows));
    sh.getRange(R, 4, n, 2).setNumberFormat('#,##0');
    sh.getRange(R, 6, n, 6).setNumberFormat('0.0%');
    sh.getRange(R, 12, n, 5).setNumberFormat('#,##0.00');
    sh.getRange(R, 17, n, 12).setNumberFormat('#,##0');
    sh.getRange(R, 29, n, 1).setNumberFormat('0.0%');
    sh.getRange(R, 7, n, 9).setBackground(YOP_BLUE);
  }
  return rows.length;
}

// --- «📈 ЧП ЯМ по дням» ---------------------------------------------------------------------

var YOP_DAYS_HEAD = ['Дата', 'Кабинет', 'Заказано, шт', 'Сумма заказов, ₽', 'Выручка (прогноз), ₽', 'Комиссия, ₽',
  'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽', 'Эквайринг, ₽', 'Невыкупы/возвраты, ₽',
  'Прочее по заказам, ₽', 'Себес, ₽', 'ЧП заказов дня (прогноз), ₽', 'Реклама за показы (факт дня), ₽',
  'Хранение (факт дня), ₽', 'Подписка (факт дня), ₽', 'Прочие расходы дня, ₽', 'Маржа до налога, ₽',
  'Налог 25% (как в юнитке), ₽', 'ЧП, ₽', 'Маржа к выручке', 'Факт: ЧП заказов дня, ₽', 'Факт − прогноз, ₽',
  'Судьба известна, % заказов'];
var YOP_DAYS_FACT_COL = 24;                                      // X
// колонки «по дням» C..N ← колонки листа по заказам
var YOP_DAYS_SRC = ['C', 'E', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
var YOP_ORDER_KEYS = ['выручка', 'комиссия', 'буст', 'доставка', 'миля', 'перевод', 'эквайринг', 'возврат', 'прочее', 'себес'];
var YOP_REBUILD_DAYS = 21;

/** Строки блока одного дня. live = строки кабинетов формулами из листа по заказам (только для «вчера»). */
function yopDayBlock_(day, all, firstRow, live, detailLast) {
  var out = [], r = firstRow;
  all.forEach(function (cab) {
    var row = [yopRu_(day), cab.name];
    if (live) {
      YOP_DAYS_SRC.forEach(function (c) {
        row.push("=SUMIFS('" + YOP_SH.detail + "'!$" + c + '$5:$' + c + '$' + detailLast + ",'" + YOP_SH.detail +
          "'!$A$5:$A$" + detailLast + ',$B' + r + ')');
      });
    } else {
      var s = function (k) { return cab.rows.reduce(function (a, x) { return a + x[k]; }, 0); };
      row.push(s('n'), Math.round(s('gmv')));
      YOP_ORDER_KEYS.forEach(function (k) { row.push(Math.round(s(k))); });
    }
    var dc = cab.dayCost;
    row.push('=E' + r + '-SUM(F' + r + ':N' + r + ')',
      Math.round(dc['показы'] || 0), Math.round(dc['хранение'] || 0), Math.round(dc['подписка'] || 0), Math.round(dc['прочее'] || 0),
      '=O' + r + '-SUM(P' + r + ':S' + r + ')', '=T' + r + '*' + Math.round(YOP.TAX * 100) + '/100', '=T' + r + '-U' + r,
      '=IFERROR(V' + r + '/E' + r + ',0)', '', '', '');
    out.push(row);
    r++;
  });
  var a = firstRow, b = r - 1, tot = [yopRu_(day), 'Все кабинеты'];
  'CDEFGHIJKLMNOPQRSTUV'.split('').forEach(function (c) { tot.push(b >= a ? '=SUM(' + c + a + ':' + c + b + ')' : 0); });
  tot.push('=IFERROR(V' + r + '/E' + r + ',0)', '', '', '');
  out.push(tot);
  return out;
}

function yopDaysLayoutOk_(sh) {
  if (!sh || String(sh.getRange(YOP_HEAD_ROW, YOP_DAYS_FACT_COL).getValue()).indexOf('Факт: ЧП') !== 0) return false;
  var n = sh.getLastRow() - YOP_HEAD_ROW;                         // v2.0.1: ячейки с ошибкой формулы не замораживаются
  if (n < 1) return true;                                        // значениями — такой лист собирается заново
  return !sh.getRange(YOP_HEAD_ROW + 1, 3, n, YOP_DAYS_HEAD.length - 2).getDisplayValues()
    .some(function (r) { return r.some(function (x) { return String(x).charAt(0) === '#'; }); });
}

function yopDaysSheet_() {
  var sh = yopSheet_(YOP_SH.days);
  if (!yopDaysLayoutOk_(sh)) {
    sh.clear();                                   // старая раскладка колонок — лист собирается заново
    yopTitle_(sh, 'ЧП ЯМ по дням — прибыль заказов дня плюс расходы дня (' + YOP_VERSION + ')',
      'Новый день добавляется сверху каждым прогоном; строки вчерашнего дня — формулами из «' + YOP_SH.detail +
      '», перед следующим прогоном замораживаются значениями. Реклама за показы, хранение, подписка — факт начисления дня, ' +
      'по артикулам не делятся. Колонки X–Z (факт) дописываются сами, когда дню исполнится ' + YOP.FACT_AGE + ' дней.');
    yopHeader_(sh, YOP_DAYS_HEAD, { 1: 90, 2: 140 });
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
  sh.getRange(YOP_HEAD_ROW + 1, 1, block.length, block[0].length).setValues(yopFx_(block));
  yopDaysFormat_(sh, YOP_HEAD_ROW + 1, block.length);
}

function yopDaysFormat_(sh, row, n) {
  sh.getRange(row, 3, n, 20).setNumberFormat('#,##0');
  sh.getRange(row, 23, n, 1).setNumberFormat('0.0%');
  sh.getRange(row, 24, n, 2).setNumberFormat('#,##0');
  sh.getRange(row, 26, n, 1).setNumberFormat('0%');
  sh.getRange(row, 24, n, 3).setBackground('#e6f4ea');
  sh.getRange(row + n - 1, 1, 1, YOP_DAYS_HEAD.length).setFontWeight('bold').setBackground('#f3f3f3');
  sh.getRange(row, 15, n, 1).setFontWeight('bold');
  sh.getRange(row, 22, n, 1).setFontWeight('bold');
}

/**
 * v2.0.0. Факт по дням старше FACT_AGE: колонки X (факт ЧП заказов), Y (факт − прогноз), Z (доля
 * заказов с известной судьбой) по каждой строке кабинета и по строке «Все кабинеты». Дни, которых
 * уже нет в кэше (старше 42 дней), не трогаются — там остаётся последний записанный факт.
 */
function yopUpdateFacts_(sh, all, upto) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return 0;
  var n = last - YOP_HEAD_ROW, R = YOP_HEAD_ROW + 1;
  var ab = sh.getRange(R, 1, n, 2).getDisplayValues(), o = sh.getRange(R, 15, n, 1).getValues();
  var xz = sh.getRange(R, YOP_DAYS_FACT_COL, n, 3).getValues();
  var hi = yopAddDays_(upto, -YOP.FACT_AGE), lo = yopAddDays_(upto, -YOP_KEEP_DAYS + 1), memo = {}, byCab = {}, written = 0;
  all.forEach(function (c) { byCab[c.name] = c; });
  var fact = function (cabName, iso) {
    var k = cabName + '|' + iso, c = byCab[cabName];
    if (!memo.hasOwnProperty(k)) memo[k] = c ? yopFactDay_(c.cache, c.flat, iso, yopCogsValues_(c.cogs)) : null;
    return memo[k];
  };
  var totals = {};
  for (var i = 0; i < n; i++) {
    var iso = yopIso_(ab[i][0]), cab = ab[i][1];
    if (!iso || iso > hi || iso < lo) continue;
    if (cab === 'Все кабинеты') { totals[iso] = i; continue; }
    var f = fact(cab, iso);
    if (!f || !f.n) continue;
    xz[i] = [Math.round(f.ЧП), Math.round(f.ЧП - yopNum_(o[i][0])), f.известно];
    written++;
  }
  Object.keys(totals).forEach(function (iso) {
    var i = totals[iso], sum = 0, known = 0, units = 0, any = false;
    all.forEach(function (c) {
      var f = fact(c.name, iso);
      if (f && f.n) { sum += f.ЧП; known += f.known; units += f.n; any = true; }
    });
    if (any) xz[i] = [Math.round(sum), Math.round(sum - yopNum_(o[i][0])), units ? known / units : 0];
  });
  sh.getRange(R, YOP_DAYS_FACT_COL, n, 3).setValues(xz);
  return written;
}

// --- «🧮 ЧП ЯМ юнитка» ----------------------------------------------------------------------

var YOP_UNIT_HEAD = ['Кабинет', 'Артикул', 'Наименование', 'Статус на Маркете', 'Цена в кабинете, ₽',
  'Цена продажи ср. за 7 дн (факт), ₽', 'Цена для расчёта, ₽', 'Заказано за 30 дн, шт', 'Заказов в день, шт',
  'Остаток FBY (доступно), шт', 'Остаток FBS (доступно), шт', 'Хватит на, дней',
  'Выкуп', 'Тариф комиссии', 'Ставка буста ср. за 7 дн', 'Буст: доля ставки к списанию', 'Доставка, % цены',
  'Перевод денег, % цены', 'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на заказ', 'Невыкуп/возврат, ₽ на заказ',
  'Прочее по заказу, ₽ на заказ', 'Реклама за показы, % от заказов (условно)', 'Себес, ₽',
  'Комиссия, ₽', 'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽', 'Эквайринг, ₽',
  'Невыкупы/возвраты, ₽', 'Прочее по заказу, ₽', 'Расходы Маркета на штуку, ₽', 'Маржа до рекламы за показы, ₽',
  'Реклама за показы (условно), ₽', 'Маржа, ₽', 'Налог 25% (как в юнитке), ₽', 'ЧП на штуку, ₽', 'Маржинальность',
  'Рентабельность к себесу', 'ЧП в месяц при текущих продажах, ₽', 'Коэффициенты по', 'Когорта, шт', 'Себес найден'];

/** Юнитка по всем кабинетам. unitData — { кабинет: данные карточек и остатков } (файлы в папке кэша). */
function yopWriteUnit_(day, all) {
  var sh = yopSheet_(YOP_SH.unit), rows = [], r = YOP_HEAD_ROW + 1, info = [];
  all.forEach(function (cab) {
    var data = yopJsonLoad_(yopUnitDataName_(cab.name));
    var u = yopUnitRows_(cab.cache, cab.flat, day, yopCogsValues_(cab.cogs), cab.settings, data);
    info.push(cab.name + ': реклама за показы ' + (u.drr * 100).toFixed(1) + ' % от заказов' +
      (data ? '' : ' (цены и остатки ещё не загружены)'));
    u.rows.forEach(function (x) {
      var c = x.coef, g = function (col) { return col + r; }, div = function (e) { return '=IFERROR(' + e + '/M' + r + ',0)'; };
      rows.push([cab.name, x.sku, x.name, x.status, x.priceCab || '', x.price7 == null ? '' : Math.round(x.price7), Math.round(x.price),
        x.n30, '=H' + r + '/' + YOP.UNIT_DAYS, x.fby, x.fbs, '=IF(I' + r + '=0,"",ROUND((J' + r + '+K' + r + ')/I' + r + ',0))',
        c.выкуп, c.тариф, x.bid, c.буст_k, c.доставка, c.перевод, c.миля, c.эквайринг, c.возврат, c.прочее, x.drr,
        yopCogsFormula_(cab.cogs, '$A' + r, '$B' + r),
        '=' + g('G') + '*' + g('N'), div(g('G') + '*' + g('O') + '*' + g('P')), div(g('G') + '*' + g('Q')), '=' + g('S'),
        div(g('G') + '*' + g('R')), div(g('T')), div(g('U')), div(g('V')),
        '=SUM(Y' + r + ':AF' + r + ')', '=G' + r + '-AG' + r + '-X' + r, div(g('G') + '*' + g('W')), '=AH' + r + '-AI' + r,
        '=AJ' + r + '*' + Math.round(YOP.TAX * 100) + '/100', '=AJ' + r + '-AK' + r, '=IFERROR(AL' + r + '/G' + r + ',0)',
        '=IFERROR(AL' + r + '/X' + r + ',"")', '=AL' + r + '*H' + r + '*M' + r, x.src, c.когорта_шт, yopCogsSrc_(cab, x.sku)]);
      r++;
    });
  });
  sh.clear();
  yopTitle_(sh, 'Юнитка ЯМ на данных Маркета на ' + yopRu_(day) + ' — экономика одной выкупленной штуки (' + YOP_VERSION + ')',
    'Цена — факт продаж за 7 дней (нет продаж — цена в кабинете); расходы Маркета — факт удержаний по дозревшим заказам ' +
    '(отчёт «Стоимость услуг»); остатки — доступно на складах. Синие колонки (G, M–W) можно менять руками — ' +
    'остальное пересчитается. Реклама за показы делится условно, долей от суммы заказов кабинета. ' + info.join('; ') + '.');
  yopHeader_(sh, YOP_UNIT_HEAD, { 1: 130, 2: 220, 3: 320, 4: 160 });
  if (rows.length) {
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 2, n, 1).setNumberFormat('@');
    sh.getRange(R, 1, n, rows[0].length).setValues(yopFx_(rows));
    sh.getRange(R, 5, n, 3).setNumberFormat('#,##0');
    sh.getRange(R, 8, n, 5).setNumberFormat('#,##0');
    sh.getRange(R, 9, n, 1).setNumberFormat('#,##0.0');
    sh.getRange(R, 13, n, 6).setNumberFormat('0.0%');
    sh.getRange(R, 19, n, 4).setNumberFormat('#,##0.00');
    sh.getRange(R, 23, n, 1).setNumberFormat('0.0%');
    sh.getRange(R, 24, n, 15).setNumberFormat('#,##0');
    sh.getRange(R, 39, n, 2).setNumberFormat('0.0%');
    sh.getRange(R, 41, n, 1).setNumberFormat('#,##0');
    sh.getRange(R, 7, n, 1).setBackground(YOP_BLUE);
    sh.getRange(R, 13, n, 11).setBackground(YOP_BLUE);
    sh.getRange(R, 23, n, 1).setBackground(YOP_GREY);
    sh.getRange(R, 35, n, 1).setBackground(YOP_GREY);
    sh.getRange(R, 38, n, 1).setFontWeight('bold');
  }
  sh.setFrozenColumns(2);
  return rows.length;
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
  var manual = all.filter(function (c) { return yopManualTariff_(c.settings, day) != null; })
    .map(function (c) { return c.name + ' — ' + c.settings.tariff + ' %'; });
  sh.clear();
  yopTitle_(sh, 'Коэффициенты модели на ' + yopRu_(day),
    'Выкуп и доли расходов — заказы ' + yopRu_(yopAddDays_(day, -YOP.COHORT_FROM)) + '–' +
    yopRu_(yopAddDays_(day, -YOP.COHORT_TO)) + ' (только с известной судьбой); средняя миля — заказы ' +
    yopRu_(yopAddDays_(day, -YOP.MILE_FROM)) + '–' + yopRu_(yopAddDays_(day, -YOP.MILE_TO)) +
    '; тариф — самый частый в начислениях комиссии за 14 дней' +
    (manual.length ? ', вручную с листа настроек: ' + manual.join(', ') : '') + '. Артикул с когортой меньше ' + YOP.MIN_UNITS +
    ' шт считается по строке «* весь кабинет».');
  yopHeader_(sh, ['Кабинет', 'Артикул', 'Когорта: заказано, шт', 'Когорта: доставлено, шт', 'Выкуп', 'Тариф комиссии',
    'Буст: доля ставки к списанию', 'Доставка, % цены', 'Перевод, % цены', 'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт',
    'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу, ₽ на шт'], { 1: 130, 2: 300 });
  if (rows.length) {
    sh.getRange(YOP_HEAD_ROW + 1, 2, rows.length, 1).setNumberFormat('@');
    sh.getRange(YOP_HEAD_ROW + 1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(YOP_HEAD_ROW + 1, 5, rows.length, 5).setNumberFormat('0.0%');
    sh.getRange(YOP_HEAD_ROW + 1, 10, rows.length, 4).setNumberFormat('#,##0.00');
  }
}

// --- «📖 ЧП ЯМ как считается» ------------------------------------------------------------------

var YOP_HELP_BOLD = ['Главное правило', 'Что фактом из Маркета, а что прогнозом', 'Откуда коэффициенты', 'Налог',
  'Факт рядом с прогнозом', 'Юнитка на данных Маркета', 'Себестоимость', 'Смена тарифа комиссии', 'Новый кабинет', 'Где код'];

function yopWriteHelp_() {
  var L = [
    ['Как считается ЧП по заказам Яндекс Маркета (' + YOP_VERSION + ')'], [''],
    ['Главное правило'],
    ['Считаем, сколько в итоге принесут заказы ВЧЕРАШНЕГО дня. Маркет списывает комиссию и буст при доставке, через дни и недели ' +
     'после заказа. Если брать списания вчерашнего дня, в отчёт попадают расходы по заказам недельной давности.'], [''],
    ['Что фактом из Маркета, а что прогнозом'],
    ['ФАКТ по заказам вчера: количество, цена продавца (заплатил покупатель + доплата Маркета + баллы), ставка буста в заказе.'],
    ['ФАКТ дня: реклама за показы (буст показов, полки, баннеры), хранение, подписка и прочие начисления без номера заказа — ' +
     'по дате начисления, отдельными колонками, по артикулам не делятся.'],
    ['ПРОГНОЗ по коэффициентам: всё, что Маркет спишет с вчерашних заказов позже, — выкуп, комиссия, буст продаж, доставка, ' +
     'средняя миля, перевод денег, эквайринг, невыкупы и возвраты.'], [''],
    ['Откуда коэффициенты'],
    ['Из факта по прошлым заказам. Отчёт Маркета «Стоимость услуг» привязывает каждое удержание к номеру заказа, поэтому по ' +
     'заказам 14–35 дней назад (их судьба уже известна) видно, какая доля выкупилась и сколько Маркет по ним списал.'],
    ['Выкуп = доставлено ÷ заказано. Буст = ставка из заказа × доля ставки, которую Маркет реально списал. Доставка и перевод — ' +
     'доля от суммы заказов. Средняя миля — ₽ на доставленную штуку по заказам 8–21 день (ставка меняется быстро). ' +
     'Тариф комиссии — действующий, из последних начислений, или вручную с листа настроек.'],
    ['У артикула меньше ' + YOP.MIN_UNITS + ' шт в когорте (новые и редкие) — берутся коэффициенты кабинета, тариф при этом свой ' +
     '(колонка «Коэффициенты по» = «кабинет», подробности — лист «' + YOP_SH.coef + '»).'], [''],
    ['Налог'],
    ['Как в юнитке: минус 25 % от маржи дня (маржа = ЧП заказов − расходы дня). При отрицательной марже формула уменьшает убыток — так же, как в юнитке.'], [''],
    ['Факт рядом с прогнозом'],
    ['Лист «' + YOP_SH.days + '», колонки X–Z. Когда дню исполняется ' + YOP.FACT_AGE + ' дней, прогон пишет фактическую ЧП его заказов: ' +
     'выкупленные штуки × цена минус всё, что Маркет по этим заказам реально удержал, минус себес выкупленных. Та же база, что у ' +
     'колонки O (до рекламы за показы, хранения, подписки и налога). «Судьба известна» — какая доля заказов дня уже доставлена ' +
     'или отменена: пока она меньше 100 %, факт ещё дорастёт. Каждый прогон обновляет факт по всем дням за последние 6 недель.'], [''],
    ['Юнитка на данных Маркета'],
    ['Лист «' + YOP_SH.unit + '»: по каждому артикулу с заказами за 30 дней или с остатком — цена в кабинете и фактическая цена ' +
     'продажи за 7 дней, остатки FBY и FBS (доступно), на сколько дней хватит, расходы Маркета на одну выкупленную штуку по тем ' +
     'же коэффициентам, что прогноз, себес, реклама за показы условно (доля от суммы заказов кабинета за 30 дней), налог 25 %, ' +
     'ЧП на штуку и в месяц. Синие колонки можно менять руками — например, вписать новую цену и посмотреть ЧП.'], [''],
    ['Себестоимость'],
    ['Сначала лист «' + YOP_SH.cogs + '» (кабинет | артикул магазина | себес), если там нет — юнитка кабинета по «Код 1С». ' +
     'Колонка «Себес найден» показывает источник, «НЕТ — себес 0» — артикул, который надо добавить.'], [''],
    ['Смена тарифа комиссии'],
    ['Модель видит новый тариф в начислениях с задержкой 1–2 недели. Чтобы не ждать: лист «' + YOP_SH.settings + '», колонки ' +
     '«Тариф комиссии вручную, %» и «с даты заказа». Пустая ячейка — тариф снова берётся из начислений.'], [''],
    ['Новый кабинет'],
    ['Строка на листе «' + YOP_SH.keys + '» (ключ, Business ID, кампании) и строка на листе настроек с «Считать = да». Первый прогон ' +
     'сам докачает 42 дня истории. Пока ключа нет, кабинет пропускается и назван в «📊 Что сейчас происходит».'], [''],
    ['Где код'],
    ['В книге — только меню (лоадер). Вся логика — в репозитории: ' + YOP_CODE_URL + ' . Файл «04_модель.js» — весь расчёт; ' +
     '«03_сбор.js» — что берётся из Маркета; «05_листы.js» — формулы листов. Историю заказов скрипт хранит файлами на Диске ' +
     '(папка — лист «' + YOP_SH.settings + '»).']
  ];
  var sh = yopSheet_(YOP_SH.help);
  sh.clear();
  sh.getRange(1, 1, L.length, 1).setValues(L).setWrap(true);
  sh.setColumnWidth(1, 900);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  L.forEach(function (r, i) { if (YOP_HELP_BOLD.indexOf(r[0]) >= 0) sh.getRange(i + 1, 1).setFontWeight('bold'); });
}

// --- сборка --------------------------------------------------------------------------------

/** Записать день: лист по заказам, коэффициенты, блок в истории, факт. Возвращает прогноз по кабинетам. */
function yopWriteDay_(day, all) {
  all = all || yopForecastAll_(day);
  var cur = SpreadsheetApp.getActive().getSheetByName(YOP_SH.days);
  if (!yopDaysLayoutOk_(cur)) return yopRebuildDays_(day, YOP_REBUILD_DAYS, all);
  var n = yopWriteDetail_(day, all);
  yopWriteCoef_(day, all);
  yopWriteHelp_();
  var sh = yopDaysSheet_();
  yopFreezeAndDrop_(sh, day);
  yopInsertBlock_(sh, yopDayBlock_(day, all, YOP_HEAD_ROW + 1, true, YOP_HEAD_ROW + Math.max(n, 1)));
  var f = yopUpdateFacts_(sh, all, day);
  SpreadsheetApp.flush();
  yopLog_('листы за ' + yopRu_(day) + ': заказов по артикулам ' + n + ', строк факта ' + f);
  return all;
}

/** Пересобрать историю за `days` дней: прошлые дни значениями, последний — формулами. */
function yopRebuildDays_(upto, days, all) {
  all = all || yopForecastAll_(upto);
  var sh = yopSheet_(YOP_SH.days);
  sh.clear();
  sh = yopDaysSheet_();                           // пишет шапку новой раскладки — повторной пересборки не будет
  for (var k = days - 1; k >= 1; k--) {
    var d = yopAddDays_(upto, -k);
    var block = all.map(function (c) {
      var f = yopForecast_(c.cache, d, yopCogsValues_(c.cogs), c.flat, c.settings);
      return { name: c.name, rows: f.rows, dayCost: c.cache.dayCost[d] || {} };
    });
    yopInsertBlock_(sh, yopDayBlock_(d, block, YOP_HEAD_ROW + 1, false, 0));
  }
  return yopWriteDay_(upto, all);
}