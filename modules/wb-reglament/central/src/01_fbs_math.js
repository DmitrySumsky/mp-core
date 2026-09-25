/* WB FBS DISTRIBUTION — ЧИСТАЯ МАТЕМАТИКА РАСКЛАДКИ v1.4.0 — 27.08.2026 */

/* ИСТОРИЯ ВЕРСИЙ
   v1.4.0 — 27.08.2026. ТОВАР С FBS НЕ ТОЛЬКО ПРИВОЗЯТ, НО И ЗАБИРАЮТ.
   Задача владельца 27.08.2026: «нужно чтобы можно было не только добавлять товар на
   виртуальные склады FBS, но ещё и убавлять количество — например числом с минусом
   в столбце D». Раньше вычесть было нечем: «Привезли (+)» обрезалось до нуля снизу,
   а «Факт на FBS (=)» требует пересчитать ВЕСЬ остаток товара, хотя менеджер знает
   только, сколько увёз.
   • колонка стала «Привезли (±)»: минус вычитается из пула тем же способом, каким
     плюс прибавляется. Пул ниже нуля не уходит — вычли больше, чем лежит, значит ноль;
   • МИНУС ДОЛГ НЕ ГАСИТ: погашение — это факт перемещения на склад, а вывоз со склада
     им быть не может. covered считается только с положительного «привезли», иначе
     вывоз списал бы долг из 1С, который никто не перемещал;
   • «Факт на FBS (=)» по-прежнему главнее: заполнили факт — «привезли» не смотрим.

   v1.3.0 — 26.08.2026. ОБЪЕДИНЕНИЕ С ЛИСТОМ «WB СКЛАДЫ FBS»: ОДИН ЛИСТ ВМЕСТО ДВУХ.
   Спрос больше не читается из заголовков чужого листа — заказы, остатки и раскладка
   считаются одним проходом (см. fbs_sheet.gs v2.0.0), поэтому:
   • неснижаемый остаток по умолчанию 10 шт вместо 5 — решение владельца 26.08.2026,
     единое для всех кабинетов; в строке 1 листа его по-прежнему можно переопределить;
   • убрана fbsCityFromHeader_ — разбор заголовка «Заказы Казань (5 дн)» нужен был
     только для чтения спроса с соседнего листа, теперь спрос приходит из API.
   Сама раскладка не менялась: те же цели, тот же неснижаемый остаток, та же сумма.

   v1.2.0 — 26.08.2026. ПЕРВЫЙ БОЕВОЙ ПРОГОН: НА ЧАСТЬ ГОРОДОВ УЕХАЛИ НОЛИ И ЕДИНИЦЫ —
   разбор с менеджером 26.08.2026 («на некоторые склады сделало по 0 штук», «а где по
   1 штуке»). Посев в 5 шт доставался только складам БЕЗ заказов и только при профиците,
   а город со слабым спросом в дефиците получал 0–1 и пропадал из региона.
   • «Мин. посев» заменён на НЕСНИЖАЕМЫЙ ОСТАТОК: сначала каждому складу его порция,
     остаток пула делится по спросу сверх неё;
   • на неснижаемый не хватает пула — старое поведение, режем всё по спросу;
   • долг из 1С: fbsPool_ принимает «положить авансом» и непогашенный долг, реальное
     перемещение сначала ГАСИТ долг и только излишком попадает в пул (иначе один и тот же
     товар попадёт в раскладку дважды — сначала авансом, потом по факту).

   v1.1.0 — 25.08.2026. ОСТАТКИ НА WB НЕ РАВНЫ ТОМУ, ЧТО ЛЕЖИТ НА СКЛАДЕ — сверка
   списка перемещений менеджера (34 позиции) с кабинетом Б: расходятся ВСЕ
   позиции, инозитол 4920 в кабинете против 2640 реально перевезённых («выставила
   5000»), глюкозамин 74 против 360, цинк 143 против 300, суммарно 14 120 против 12 414.
   Значит пул нельзя считать только как «сумма живых остатков + привезли»: он унаследует
   выдуманные числа.
   • колонка «Факт на FBS (=)» задаёт пул напрямую и перекрывает живые остатки;
   • «Привезли (+)» осталась для обычного дня — добавка к тому, что уже лежит;
   • выбор источника пула вынесен в fbsPool_ и покрыт тестами.

   v1.0.0 — 25.08.2026. ПЕРВАЯ ВЕРСИЯ. РАСКЛАДКА FBS-ОСТАТКА ПО ГОРОДАМ РУКАМИ —
   разбор с менеджером 25.08.2026: остатки по 19 виртуальным складам проставлялись
   вручную «на глаз», числа расходились с реальным перемещением на FBS-склад.
   • выравнивание дней покрытия: цель склада = ССП склада × горизонт;
   • пул меньше потребности — режем всем пропорционально спросу;
   • пул больше — холодным складам минимальный посев, излишек на базовый склад;
   • сумма плана всегда равна пулу до штуки (округление с сохранением суммы). */

/** Неснижаемый остаток по умолчанию, шт. Строка 1 листа перебивает его. */
var FBSD_DEFAULT_MIN_STOCK_ = 10;

/**
 * v1.2.0. Пул товара — сколько штук раскладываем по городам, и что осталось должно складу.
 *
 * Живым остаткам WB верить нельзя: их проставляют руками и завышают. Поэтому
 * «Факт на FBS (=)» перекрывает всё — это число из перемещения или из 1С.
 *
 * Долг — товар, который лежит в 1С, но на виртуальный склад ещё не перемещён. Его кладут
 * на витрину авансом, поэтому он УЖЕ внутри живых остатков WB и второй раз в пул не идёт.
 * Когда приходит реальное перемещение, оно сначала гасит долг и попадает в пул только
 * излишком — иначе тот же товар разложится дважды.
 *
 * @param {number} currentSum Сумма живых остатков по всем складам WB.
 * @param {number} brought    «Привезли (±)» — перемещение: плюс привезли, минус забрали.
 * @param {?number} fact      «Факт на FBS (=)», пусто = null (не ноль!).
 * @param {number} debtPrev   «Ждёт перемещения» с прошлого прогона, пусто = 0.
 * @param {number} advance    «Долг из 1С (+)» — положить авансом сейчас, пусто = 0.
 */
function fbsPool_(currentSum, brought, fact, debtPrev, advance) {
  // v1.4.0. «Привезли» знаковое: плюс — привезли на склад, минус — забрали со склада.
  var got = Math.round(Number(brought) || 0);
  var owed = Math.max(0, Math.round(Number(debtPrev) || 0));
  var ahead = Math.max(0, Math.round(Number(advance) || 0));

  // Долг гасит только ПРИВОЗ: вывоз со склада перемещением из 1С не является.
  var covered = Math.min(Math.max(0, got), owed);
  var net = got - covered;                    // в пул идёт только излишек привоза
  var debt = owed - covered + ahead;

  var hasFact = fact !== null && fact !== undefined && fact !== '' && !isNaN(Number(fact));
  if (hasFact) {
    return { pool: Math.max(0, Math.round(Number(fact))) + debt,
             source: debt ? 'факт + долг ' + debt : 'факт',
             debt: debt, covered: covered };
  }

  var text = 'остатки';
  if (net > 0) text += ' + привезли ' + net;
  if (net < 0) text += ' − забрали ' + (-net);
  if (ahead) text += ' + аванс ' + ahead;
  return { pool: Math.max(0, Math.round(currentSum) + net + ahead),
           source: text, debt: debt, covered: covered };
}

/** Округление до целых с сохранением суммы: пол + остаток по величине дробной части. */
function fbsRoundKeepingSum_(raw, total) {
  var out = [];
  var sum = 0;
  var i;
  for (i = 0; i < raw.length; i++) {
    var whole = Math.max(0, Math.floor(raw[i] || 0));
    out.push(whole);
    sum += whole;
  }
  var left = Math.round(total) - sum;

  if (left > 0 && out.length) {
    var byFrac = [];
    for (i = 0; i < raw.length; i++) {
      var v = Math.max(0, raw[i] || 0);
      byFrac.push({ idx: i, frac: v - Math.floor(v) });
    }
    byFrac.sort(function (a, b) { return (b.frac - a.frac) || (a.idx - b.idx); });
    for (i = 0; i < left; i++) out[byFrac[i % byFrac.length].idx] += 1;
  }

  // Отрицательный остаток возможен, только если raw уже больше пула (защита от рассинхрона):
  // снимаем с самых больших, чтобы не обнулить мелкие склады.
  while (left < 0) {
    var maxIdx = -1;
    for (i = 0; i < out.length; i++) {
      if (out[i] > 0 && (maxIdx < 0 || out[i] > out[maxIdx])) maxIdx = i;
    }
    if (maxIdx < 0) break;
    out[maxIdx] -= 1;
    left += 1;
  }
  return out;
}

/**
 * v1.2.0. План остатков по складам для ОДНОГО товара.
 *
 * Сначала каждому складу неснижаемый остаток, потом остаток пула — по спросу сверх него.
 * На неснижаемый не хватило пула — режем всё пропорционально спросу, без гарантии минимума.
 *
 * @param {number} pool     Пул из fbsPool_.
 * @param {number[]} orders Заказы по складам за окно (по умолчанию 5 дней).
 * @param {number[]} current Текущие остатки по складам — нужны, когда спроса нет нигде.
 * @param {Object} opts     {horizonDays, minStock, windowDays, baseIndex}
 * @return {{plan: number[], mode: string, need: number, ssp: number[]}}
 */
function fbsPlanOne_(pool, orders, current, opts) {
  opts = opts || {};
  var horizon = opts.horizonDays > 0 ? opts.horizonDays : 14;
  var floor = opts.minStock >= 0 ? Math.round(opts.minStock) : FBSD_DEFAULT_MIN_STOCK_;
  var windowDays = opts.windowDays > 0 ? opts.windowDays : 5;
  var n = orders.length;
  var base = (opts.baseIndex >= 0 && opts.baseIndex < n) ? opts.baseIndex : 0;
  var i;

  pool = Math.max(0, Math.round(pool || 0));

  var ssp = [];
  var target = [];
  var need = 0;
  for (i = 0; i < n; i++) {
    var s = Math.max(0, orders[i] || 0) / windowDays;
    ssp.push(s);
    target.push(s * horizon);
    need += s * horizon;
  }

  var zeros = [];
  for (i = 0; i < n; i++) zeros.push(0);
  if (!n) return { plan: [], mode: 'нет складов', need: 0, ssp: ssp };
  if (pool <= 0) return { plan: zeros, mode: 'пул 0', need: need, ssp: ssp };

  var reserve = floor * n;

  // Спроса нет нигде: раскладывать по городам нечем — держим неснижаемый остаток,
  // остальное на базовом складе. Не хватает и на него — оставляем как лежит.
  if (need <= 0) {
    if (pool > reserve) {
      var flat = [];
      for (i = 0; i < n; i++) flat.push(floor);
      flat[base] += pool - reserve;
      return { plan: fbsRoundKeepingSum_(flat, pool), mode: 'нет спроса', need: 0, ssp: ssp };
    }
    var keep = [];
    var kept = 0;
    for (i = 0; i < n; i++) {
      var c = Math.max(0, Math.round((current || [])[i] || 0));
      keep.push(c);
      kept += c;
    }
    keep[base] += pool - kept;
    if (keep[base] < 0) keep[base] = 0;
    return { plan: fbsRoundKeepingSum_(keep, pool), mode: 'нет спроса', need: 0, ssp: ssp };
  }

  var raw = [];
  var mode;

  if (pool <= reserve) {
    // Товара меньше, чем неснижаемый остаток по всем складам. Размазывать его по всем
    // городам нельзя — выйдет по 1–2 штуки везде (боевая претензия менеджера 26.08.2026).
    // Берём столько городов, скольким хватает неснижаемого остатка, самых продающих.
    var slots = floor > 0 ? Math.floor(pool / floor) : n;
    if (slots <= 1) {
      mode = 'мало товара — весь на один склад';
      var hottest = 0;
      for (i = 1; i < n; i++) if (ssp[i] > ssp[hottest]) hottest = i;
      for (i = 0; i < n; i++) raw.push(i === hottest ? pool : 0);
    } else {
      mode = 'мало товара — только ' + slots + ' городов';
      var order = [];
      for (i = 0; i < n; i++) order.push({ idx: i, ssp: ssp[i] });
      order.sort(function (a, b) { return (b.ssp - a.ssp) || (a.idx - b.idx); });
      var chosen = {};
      var chosenNeed = 0;
      for (i = 0; i < slots; i++) {
        chosen[order[i].idx] = true;
        chosenNeed += Math.max(0, target[order[i].idx] - floor);
      }
      var left = pool - slots * floor;
      for (i = 0; i < n; i++) {
        if (!chosen[i]) { raw.push(0); continue; }
        var add = chosenNeed > 0 ? Math.max(0, target[i] - floor) / chosenNeed * left : left / slots;
        raw.push(floor + add);
      }
    }
  } else {
    var rest = pool - reserve;
    var extra = [];
    var extraSum = 0;
    for (i = 0; i < n; i++) {
      var over = Math.max(0, target[i] - floor);
      extra.push(over);
      extraSum += over;
    }
    if (extraSum <= rest) {
      mode = 'профицит';
      for (i = 0; i < n; i++) raw.push(floor + extra[i]);
      raw[base] += rest - extraSum;
    } else {
      mode = 'дефицит';
      var k = rest / extraSum;
      for (i = 0; i < n; i++) raw.push(floor + extra[i] * k);
    }
  }

  return { plan: fbsRoundKeepingSum_(raw, pool), mode: mode, need: need, ssp: ssp };
}

/** Нормализация имени склада: «Ростов - на - Дону» и «Ростов-на-Дону» — один склад. */
function fbsNormName_(name) {
  return String(name === null || name === undefined ? '' : name)
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase();
}

if (typeof module !== 'undefined') {
  module.exports = { fbsRoundKeepingSum_: fbsRoundKeepingSum_, fbsPlanOne_: fbsPlanOne_,
                     fbsPool_: fbsPool_, fbsNormName_: fbsNormName_ };
}
