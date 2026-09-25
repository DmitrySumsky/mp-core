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
  'Выкуп', 'Тариф комиссии', 'Буст: доля ставки к списанию', 'Доставка, % выручки выкупленного', 'Перевод денег, % выручки выкупленного',
  'Ср. миля, ₽ на доставл.', 'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на шт', 'Себес, ₽',
  'Выручка (прогноз), ₽', 'Комиссия, ₽', 'Буст продаж, ₽', 'Доставка, ₽', 'Ср. миля, ₽', 'Перевод денег, ₽',
  'Эквайринг, ₽', 'Невыкупы/возвраты, ₽', 'Прочее по заказу, ₽', 'Себес, ₽', 'ЧП заказов, ₽', 'ЧП на заказ, ₽',
  'Маржа к сумме заказов', 'Коэффициенты по', 'Когорта, шт', 'Себес найден'];

function yopCogsSrc_(cab, sku) {
  var m = yopCogsEntry_(cab.cogs, sku);
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
        '=E' + r + '*G' + r, '=Q' + r + '*H' + r, '=E' + r + '*F' + r + '*I' + r, '=Q' + r + '*J' + r,   // v2.2.0: доставка и перевод — от выручки
        '=C' + r + '*G' + r + '*L' + r, '=Q' + r + '*K' + r, '=C' + r + '*M' + r, '=C' + r + '*N' + r,
        '=C' + r + '*O' + r, '=C' + r + '*G' + r + '*P' + r,
        '=Q' + r + '-SUM(R' + r + ':Z' + r + ')', '=IFERROR(AA' + r + '/C' + r + ',0)', '=IFERROR(AA' + r + '/E' + r + ',0)',
        x.src, c.когорта_шт, yopCogsSrc_(cab, x.sku)]);
      r++;
    });
  });
  var flt = yopFilterTake_(sh);
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
  yopFilterPut_(sh, flt, YOP_DETAIL_HEAD.length);
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

/**
 * v2.3.0. Расходы дня (P–S) последних дней перечитки: Маркет докладывает хранение и прочее ещё день-два, а строки
 * прошлых дней на листе уже заморожены значениями. Прогон переписывает P–S из кэша и пересчитывает T–W
 * (маржа, налог, ЧП, маржа к выручке) у кабинетов и у строки «Все кабинеты». Вчерашний блок не трогается —
 * он только что записан.
 */
function yopUpdateDayCosts_(sh, all, upto) {
  var last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return 0;
  var n = last - YOP_HEAD_ROW, R = YOP_HEAD_ROW + 1, lo = yopAddDays_(upto, -YOP_SVC_RECHECK + 1), byCab = {}, touched = 0;
  all.forEach(function (c) { byCab[c.name] = c; });
  var v = sh.getRange(R, 1, n, 23).getValues(), ab = sh.getRange(R, 1, n, 2).getDisplayValues(), out = [], rows = [];
  var tot = {};
  for (var i = 0; i < n; i++) {
    var iso = yopIso_(ab[i][0]), cab = ab[i][1];
    if (!iso || iso < lo || iso >= upto) continue;
    if (cab === 'Все кабинеты') { tot[iso] = i; continue; }
    var c = byCab[cab];
    if (!c) continue;
    var dc = c.cache.dayCost[iso] || {};
    var p = [Math.round(dc['показы'] || 0), Math.round(dc['хранение'] || 0), Math.round(dc['подписка'] || 0), Math.round(dc['прочее'] || 0)];
    var tt = yopNum_(v[i][14]) - p[0] - p[1] - p[2] - p[3], tax = tt * YOP.TAX, e = yopNum_(v[i][4]);
    rows.push([i, p.concat([tt, tax, tt - tax, e ? (tt - tax) / e : 0])]);
  }
  Object.keys(tot).forEach(function (iso) {
    var s = [0, 0, 0, 0, 0, 0, 0], e = 0;
    rows.forEach(function (x) {
      if (yopIso_(ab[x[0]][0]) !== iso) return;
      for (var j = 0; j < 7; j++) s[j] += x[1][j];
      e += yopNum_(v[x[0]][4]);
    });
    rows.push([tot[iso], s.concat([e ? s[6] / e : 0])]);
  });
  rows.forEach(function (x) { sh.getRange(R + x[0], 16, 1, 8).setValues([x[1]]); touched++; });
  return touched;
}

// --- «🧮 ЧП ЯМ юнитка» ----------------------------------------------------------------------

/**
 * v2.1.0. Колонки юнитки: ключ, заголовок, надпись над блоком, формат, заливка и значение строки.
 * Формулы ссылаются на колонки по ключу (L('ключ')), поэтому порядок меняется одной правкой списка.
 *   блоки: карточка и остатки → СЦЕНАРИЙ (своя цена и ставка буста) → факт за 7 дней → коэффициенты → расходы.
 * «Ваша цена» и «Ваша ставка буста» вписывает человек: прогон их не затирает (переносит по кабинету и артикулу).
 */
function yopTaxF_(e) { return e + '*' + Math.round(YOP.TAX * 100) + '/100'; }
function yopDivB_(e, L) { return '=IFERROR(' + e + '/' + L('k_buyout') + ',0)'; }

var YOP_UNIT_SPEC = [
  ['cab', 'Кабинет', '', '', '', function (x, L, cab) { return cab.name; }],
  ['sku', 'Артикул', '', '@', '', function (x) { return x.sku; }],
  ['name', 'Наименование', '', '', '', function (x) { return x.name; }],
  // v2.3.0: свой признак товара (инозитол, магний …) — фильтровать один товар по всем брендам; прогон переносит
  ['group', 'Группа товара (впишите)', '', '', 'blue', function (x, L, cab, keep) { return keep.group; }],
  ['status', 'Статус на Маркете', '', '', '', function (x) { return x.status; }],
  ['priceNow', 'Цена в кабинете сейчас, ₽', 'Карточка и остатки', 'rub', '', function (x) { return x.priceCab || ''; }],
  // v2.3.0: акции — минимум для акции (цена, ниже которой товар не идёт в акции) и участие в акциях Маркета
  ['minPromo', 'Минимум для акции, ₽', '', 'rub', '', function (x) { return x.minPromo == null ? '' : x.minPromo; }],
  ['promoPrice', 'Цена в акции, ₽', '', 'rub', '', function (x) { return x.promo && x.promo.price != null ? x.promo.price : ''; }],
  ['promoMax', 'Макс. акц. цена, ₽', '', 'rub', '', function (x) { return x.promo && x.promo.max != null ? x.promo.max : ''; }],
  ['promoStatus', 'Акция: участие', '', '', '', function (x) { return x.promo ? x.promo.status + ' («' + x.promo.promo + '»)' : ''; }],
  ['price7', 'Цена продажи ср. за 7 дн (нет заказов — за 30), ₽', '', 'rub', '', function (x) { return x.price7 == null ? '' : Math.round(x.price7); }],
  ['bidNow', 'Ставка буста сейчас (последние заказы)', '', 'pct', '', function (x) { return x.bidNow == null ? '' : x.bidNow; }],
  ['bid7', 'Ставка буста ср. за 7 дн (нет заказов — за 30)', '', 'pct', '', function (x) { return x.bid; }],
  // v2.2.0: цена на витрине и СПП — из заказов: цена продавца минус скидка Маркета (MARKETPLACE)
  ['shop7', 'Цена на витрине с СПП ср. за 7 дн (нет заказов — за 30), ₽', '', 'rub', '', function (x) { return x.shop7 == null ? '' : Math.round(x.shop7); }],
  ['spp7', 'СПП (скидка Маркета) ср. за 7 дн (нет заказов — за 30)', '', 'pct', '', function (x) { return x.spp7 == null ? '' : x.spp7; }],
  ['n30', 'Заказано за 30 дн, шт', '', 'int', '', function (x) { return x.n30; }],
  ['perDay', 'Заказов в день, шт', '', 'num1', '', function (x, L) { return '=' + L('n30') + '/' + YOP.UNIT_DAYS; }],
  ['fby', 'Остаток FBY (доступно), шт', '', 'int', '', function (x) { return x.fby; }],
  ['fbyMsk', 'Остаток FBY Москва (Софьино), шт', '', 'int', '', function (x) { return x.fbyMsk == null ? '' : x.fbyMsk; }],
  ['fbs', 'Остаток FBS (доступно), шт', '', 'int', '', function (x) { return x.fbs; }],
  ['days', 'Хватит на, дней', '', 'int', '', function (x, L) {
    return '=IF(' + L('perDay') + '=0,"",ROUND((' + L('fby') + '+' + L('fbs') + ')/' + L('perDay') + ',0))'; }],
  // сценарий: своя цена и ставка буста
  ['myPrice', 'Ваша цена, ₽', 'Сценарий: впишите свою цену и ставку буста (пусто = текущие из кабинета)', 'rub', 'blue',
    function (x, L, cab, keep) { return keep.price; }],
  ['myBid', 'Ваша ставка буста, %', '', 'pct', 'blue', function (x, L, cab, keep) { return keep.bid; }],
  ['sPrice', 'Цена в сценарии, ₽', '', 'rub', 'green', function (x, L) {
    return '=IF(' + L('myPrice') + '="",IF(' + L('priceNow') + '="",' + L('price7') + ',' + L('priceNow') + '),' + L('myPrice') + ')'; }],
  ['sBid', 'Ставка буста в сценарии', '', 'pct', 'green', function (x, L) {
    return '=IF(' + L('myBid') + '="",IF(' + L('bidNow') + '="",' + L('bid7') + ',' + L('bidNow') + '),IF(' + L('myBid') + '>1,' +
      L('myBid') + '/100,' + L('myBid') + '))'; }],
  ['sCost', 'Расходы Маркета на штуку (сценарий), ₽', '', 'rub', 'green', function (x, L) {
    return '=' + L('sPrice') + '*(' + L('k_tariff') + '+' + L('k_deliv') + '+' + L('k_transfer') + ')+' + L('k_mile') +
      '+IFERROR((' + L('sPrice') + '*' + L('sBid') + '*' + L('k_boost') + '+' + L('k_acq') + '+' + L('k_ret') + '+' +
      L('k_other') + ')/' + L('k_buyout') + ',0)'; }],
  ['sMargin', 'Маржа (сценарий), ₽', '', 'rub', 'green', function (x, L) {
    return '=' + L('sPrice') + '-' + L('sCost') + '-' + L('cogs') + '-IFERROR(' + L('sPrice') + '*(' + L('k_shows') + '+' + L('k_day') + ')/' +
      L('k_buyout') + ',0)'; }],
  ['sProfit', 'ЧП на штуку (сценарий), ₽', '', 'rub', 'greenBold', function (x, L) { return '=' + L('sMargin') + '-' + yopTaxF_(L('sMargin')); }],
  ['sPct', 'Маржинальность (сценарий)', '', 'pct', 'green', function (x, L) { return '=IFERROR(' + L('sProfit') + '/' + L('sPrice') + ',0)'; }],
  // факт за 7 дней
  ['price', 'Цена (факт 7 дн, нет продаж = кабинет), ₽', 'Факт: цена и ставка буста из заказов за 7 дней', 'rub', '', function (x, L) {
    return '=IF(' + L('price7') + '="",' + L('priceNow') + ',' + L('price7') + ')'; }],
  ['fCost', 'Расходы Маркета на штуку, ₽', '', 'rub', '', function (x, L) { return '=SUM(' + L('c_comm') + ':' + L('c_other') + ')'; }],
  ['fBefore', 'Маржа до рекламы за показы, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '-' + L('fCost') + '-' + L('cogs'); }],
  ['fShows', 'Реклама за показы (условно), ₽', '', 'rub', 'grey', function (x, L) { return yopDivB_(L('price') + '*' + L('k_shows'), L); }],
  ['fDay', 'Расходы дня (условно), ₽', '', 'rub', 'grey', function (x, L) { return yopDivB_(L('price') + '*' + L('k_day'), L); }],
  ['fMargin', 'Маржа, ₽', '', 'rub', '', function (x, L) { return '=' + L('fBefore') + '-' + L('fShows') + '-' + L('fDay'); }],
  ['fTax', 'Налог 25% (как в юнитке), ₽', '', 'rub', '', function (x, L) { return '=' + yopTaxF_(L('fMargin')); }],
  ['fProfit', 'ЧП на штуку, ₽', '', 'rub', 'bold', function (x, L) { return '=' + L('fMargin') + '-' + L('fTax'); }],
  ['fPct', 'Маржинальность', '', 'pct', '', function (x, L) { return '=IFERROR(' + L('fProfit') + '/' + L('price') + ',0)'; }],
  ['fRoi', 'Рентабельность к себесу', '', 'pct', '', function (x, L) { return '=IFERROR(' + L('fProfit') + '/' + L('cogs') + ',"")'; }],
  ['fMonth', 'ЧП в месяц при текущих продажах, ₽', '', 'rub', '', function (x, L) {
    return '=' + L('fProfit') + '*' + L('n30') + '*' + L('k_buyout'); }],
  // коэффициенты модели: общие для сценария и факта
  ['k_buyout', 'Выкуп', 'Коэффициенты модели (факт удержаний по дозревшим заказам), можно менять', 'pct', 'blue', function (x) { return x.coef.выкуп; }],
  ['k_tariff', 'Тариф комиссии', '', 'pct', 'blue', function (x) { return x.coef.тариф; }],
  ['k_boost', 'Буст: доля ставки к списанию', '', 'pct', 'blue', function (x) { return x.coef.буст_k; }],
  ['k_deliv', 'Доставка, % цены выкупленной', '', 'pct', 'blue', function (x) { return x.coef.доставка; }],
  ['k_transfer', 'Перевод денег, % цены выкупленной', '', 'pct', 'blue', function (x) { return x.coef.перевод; }],
  ['k_mile', 'Ср. миля, ₽ на доставл.', '', 'rub2', 'blue', function (x) { return x.coef.миля; }],
  ['k_acq', 'Эквайринг, ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.эквайринг; }],
  ['k_ret', 'Невыкуп/возврат, ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.возврат; }],
  ['k_other', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на заказ', '', 'rub2', 'blue', function (x) { return x.coef.прочее; }],
  ['k_shows', 'Реклама за показы, % от заказов (условно)', '', 'pct', 'grey', function (x) { return x.drr; }],
  ['k_day', 'Расходы дня (хранение, подписка, транзит, прочее), % от заказов (условно)', '', 'pct', 'grey', function (x) { return x.drrDay; }],
  ['cogs', 'Себес, ₽', '', 'rub', '', function (x, L, cab) { return yopCogsFormula_(cab.cogs, L('cab', true), L('sku', true)); }],
  // расшифровка «Расходы Маркета на штуку» (факт)
  ['c_comm', 'Комиссия, ₽', 'Расходы на выкупленную штуку по факту', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_tariff'); }],
  ['c_boost', 'Буст продаж, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('price') + '*' + L('bid7') + '*' + L('k_boost'), L); }],
  ['c_deliv', 'Доставка, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_deliv'); }],
  ['c_mile', 'Ср. миля, ₽', '', 'rub', '', function (x, L) { return '=' + L('k_mile'); }],
  ['c_transfer', 'Перевод денег, ₽', '', 'rub', '', function (x, L) { return '=' + L('price') + '*' + L('k_transfer'); }],
  ['c_acq', 'Эквайринг, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_acq'), L); }],
  ['c_ret', 'Невыкупы/возвраты, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_ret'), L); }],
  ['c_other', 'Прочее по заказу, ₽', '', 'rub', '', function (x, L) { return yopDivB_(L('k_other'), L); }],
  ['src', 'Коэффициенты по', '', '', '', function (x) { return x.src; }],
  ['cohort', 'Когорта, шт', '', 'int', '', function (x) { return x.coef.когорта_шт; }],
  ['cogsSrc', 'Себес найден', '', '', '', function (x, L, cab) { return yopCogsSrc_(cab, x.sku); }],
  // v2.2.0: заметки менеджера — привязаны к кабинету и артикулу, прогон их переносит
  ['note1', 'Заметка 1', 'Заметки: пишите что угодно — прогон переносит их вместе с артикулом', '', 'blue',
    function (x, L, cab, keep) { return keep.notes[0]; }],
  ['note2', 'Заметка 2', '', '', 'blue', function (x, L, cab, keep) { return keep.notes[1]; }],
  ['note3', 'Заметка 3', '', '', 'blue', function (x, L, cab, keep) { return keep.notes[2]; }]
];
var YOP_UNIT_NOTES = ['Заметка 1', 'Заметка 2', 'Заметка 3'];
var YOP_UNIT_HEAD = YOP_UNIT_SPEC.map(function (c) { return c[1]; });
var YOP_UNIT_FMT = { rub: '#,##0', rub2: '#,##0.00', pct: '0.0%', int: '#,##0', num1: '#,##0.0' };
var YOP_UNIT_BG = { blue: YOP_BLUE, grey: YOP_GREY, green: '#e6f4ea', greenBold: '#e6f4ea' };

/** v2.1.0. «Ваша цена», «Ваша ставка буста», (v2.2.0) заметки и (v2.3.0) группа товара с прошлого прогона: { "кабинет|артикул": {…} }. */
function yopUnitKeep_(sh) {
  var out = {}, last = sh.getLastRow();
  if (last <= YOP_HEAD_ROW) return out;
  var head = sh.getRange(YOP_HEAD_ROW, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var ip = head.indexOf('Ваша цена, ₽'), ib = head.indexOf('Ваша ставка буста, %'), ig = head.indexOf('Группа товара (впишите)');
  var inotes = YOP_UNIT_NOTES.map(function (h) { return head.indexOf(h); });
  if (ip < 0 && ib < 0 && ig < 0 && inotes.every(function (i) { return i < 0; })) return out;
  sh.getRange(YOP_HEAD_ROW + 1, 1, last - YOP_HEAD_ROW, head.length).getValues().forEach(function (r) {
    var p = ip >= 0 ? r[ip] : '', b = ib >= 0 ? r[ib] : '', g = ig >= 0 ? r[ig] : '';
    var notes = inotes.map(function (i) { return i >= 0 ? r[i] : ''; });
    if (p !== '' || b !== '' || g !== '' || notes.join('') !== '') {
      out[String(r[0]) + '|' + String(r[1])] = { price: p, bid: b, group: g, notes: notes };
    }
  });
  return out;
}

/** Юнитка по всем кабинетам: карточки, остатки и ставки — файлы в папке кэша от последнего сбора. */
function yopWriteUnit_(day, all) {
  var sh = yopSheet_(YOP_SH.unit), keep = yopUnitKeep_(sh), rows = [], r = YOP_HEAD_ROW + 1, info = [], idx = {};
  YOP_UNIT_SPEC.forEach(function (c, i) { idx[c[0]] = yopCol_(i + 1); });
  all.forEach(function (cab) {
    var data = yopJsonLoad_(yopUnitDataName_(cab.name));
    var u = yopUnitRows_(cab.cache, cab.flat, day, yopCogsValues_(cab.cogs), cab.settings, data);
    info.push(cab.name + ': реклама за показы ' + (u.drr * 100).toFixed(1) + ' %, расходы дня ' + (u.drrDay * 100).toFixed(1) + ' % от заказов' +
      (data ? (data.bids ? '' : ', текущих ставок буста нет') : ' (цены и остатки ещё не загружены)'));
    u.rows.forEach(function (x) {
      var L = function (key, abs) { return (abs ? '$' : '') + idx[key] + r; };
      var k = keep[cab.name + '|' + x.sku] || { price: '', bid: '', group: '', notes: ['', '', ''] };
      if (k.group == null) k.group = '';
      rows.push(YOP_UNIT_SPEC.map(function (c) { return c[5](x, L, cab, k); }));
      r++;
    });
  });
  var flt = yopFilterTake_(sh);
  sh.clear();
  yopTitle_(sh, 'Юнитка ЯМ на данных Маркета на ' + yopRu_(day) + ' — экономика одной выкупленной штуки (' + YOP_VERSION + ')',
    'Сценарий: впишите «Ваша цена» и «Ваша ставка буста» — зелёные колонки сразу покажут маржу и ЧП на штуку; пусто — по текущей ' +
    'цене в кабинете и ставке буста из последних заказов. Вписанное прогон не затирает. Факт — цена и ставка из заказов за 7 дней, ' +
    'нет заказов за неделю — за 30 дней. ' +
    'Расходы Маркета — факт удержаний по дозревшим заказам; реклама за показы и расходы дня (хранение, подписка, транзит, прочее) ' +
    'делятся условно, долей от заказов кабинета за 30 дней. ' + info.join('; ') + '.');
  sh.getRange(3, 1, 1, YOP_UNIT_SPEC.length).setValues([YOP_UNIT_SPEC.map(function (c) { return c[2]; })]).setFontWeight('bold');
  yopHeader_(sh, YOP_UNIT_HEAD, { 1: 130, 2: 220, 3: 320, 4: 160 });
  if (rows.length) {
    var n = rows.length, R = YOP_HEAD_ROW + 1;
    sh.getRange(R, 2, n, 1).setNumberFormat('@');                // артикул — текстом ДО записи
    sh.getRange(R, 1, n, rows[0].length).setValues(yopFx_(rows));
    YOP_UNIT_SPEC.forEach(function (c, i) {
      if (YOP_UNIT_FMT[c[3]]) sh.getRange(R, i + 1, n, 1).setNumberFormat(YOP_UNIT_FMT[c[3]]);
      if (YOP_UNIT_BG[c[4]]) sh.getRange(R, i + 1, n, 1).setBackground(YOP_UNIT_BG[c[4]]);
      if (c[4] === 'bold' || c[4] === 'greenBold') sh.getRange(R, i + 1, n, 1).setFontWeight('bold');
    });
  }
  sh.setFrozenColumns(2);
  yopFilterPut_(sh, flt, YOP_UNIT_SPEC.length);
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
    '; тариф — последнего дня с начислениями комиссии за 14 дней' +
    (manual.length ? ', вручную с листа настроек: ' + manual.join(', ') : '') + '. Артикул с когортой меньше ' + YOP.MIN_UNITS +
    ' шт считается по строке «* весь кабинет».');
  yopHeader_(sh, ['Кабинет', 'Артикул', 'Когорта: заказано, шт', 'Когорта: доставлено, шт', 'Выкуп', 'Тариф комиссии',
    'Буст: доля ставки к списанию', 'Доставка, % выручки выкупленного', 'Перевод, % выручки выкупленного', 'Ср. миля, ₽ на доставл.',
    'Эквайринг, ₽ на шт', 'Невыкуп/возврат, ₽ на шт', 'Прочее по заказу (просрочка FBS, баллы за отзывы), ₽ на шт'], { 1: 130, 2: 300 });
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
     'доля от выручки выкупленных штук (Маркет берёт 5 % и 1,6 % только с доставленного). Средняя миля — ₽ на доставленную ' +
     'штуку по заказам 8–21 день (ставка меняется быстро; миля за заказы, отменённые в доставке, тоже входит — поэтому на ' +
     'выкупленную штуку она чуть выше тарифа). Тариф комиссии — последнего дня с начислениями или вручную с листа настроек. ' +
     '«Прочее по заказу» — надбавка за просрочку отгрузки FBS (в отчёте она в той же строке размещения) и баллы за отзывы.'],
    ['Расходы дня — хранение, подписка, транзит, утилизация, вывоз со склада и всё прочее без номера заказа — на листе «' +
     YOP_SH.days + '» стоят отдельными колонками по дню начисления. В юнитке они, как и реклама за показы (полки, баннеры, ' +
     'оплата за показы), идут на штуку условно: доля от суммы заказов кабинета за 30 дней.'],
    ['Маркет докладывает начисления за день ещё 1–2 дня (средняя миля, перевод денег, часть комиссии, хранение), поэтому ' +
     'каждый прогон перечитывает последние ' + YOP_SVC_RECHECK + ' дня начислений и заменяет прочитанное раньше.'],
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
    ['Лист «' + YOP_SH.unit + '»: по каждому артикулу с заказами за 30 дней или с остатком — цена в кабинете, ставка буста из последних ' +
     'заказов, цена и ставка по факту заказов за 7 дней, цена на витрине с СПП и СПП (скидка Маркета) за 7 дней, остатки FBY и FBS (доступно), на сколько дней хватит, расходы Маркета на одну ' +
     'выкупленную штуку по тем же коэффициентам, что прогноз, себес, реклама за показы условно (доля от суммы заказов кабинета ' +
     'за 30 дней), налог 25 %, ЧП на штуку и в месяц.'],
    ['Сценарий: впишите «Ваша цена» и «Ваша ставка буста» — зелёные колонки сразу покажут расходы, маржу, ЧП на штуку и ' +
     'маржинальность при этих настройках. Пусто — считается по текущей цене и ставке из кабинета. Вписанное прогон не затирает; ' +
     'ставку можно писать и «5%», и «5».'],
    ['Заметки 1–3 в конце листа — для своих пометок: прогон переносит их вместе с артикулом. Свои колонки справа от них ' +
     'прогон стирает (лист пишется заново). Сортировать можно, порядок вернётся при следующем прогоне; фильтр прогон ' +
     'снимает и ставит обратно.'], [''],
    ['Себестоимость'],
    ['Сначала лист «' + YOP_SH.cogs + '» (кабинет | артикул магазина | себес), если там нет — юнитка кабинета по «Код 1С» ' +
     '(без учёта регистра и знаков на конце артикула). ' +
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
  // v2.2.1: сначала заморозить историю — блок прошлого дня стоит формулами от листа «по заказам», и если
  // сперва перезаписать тот лист новым днём, прошлый день застынет с цифрами нового (22.09 → цифры 23.09)
  var sh = yopDaysSheet_();
  yopFreezeAndDrop_(sh, day);
  SpreadsheetApp.flush();
  var n = yopWriteDetail_(day, all);
  yopWriteCoef_(day, all);
  yopWriteHelp_();
  yopInsertBlock_(sh, yopDayBlock_(day, all, YOP_HEAD_ROW + 1, true, YOP_HEAD_ROW + Math.max(n, 1)));
  var f = yopUpdateFacts_(sh, all, day);
  yopUpdateDayCosts_(sh, all, day);
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