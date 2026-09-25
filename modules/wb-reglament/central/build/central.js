/* WB REGLAMENT — CENTRAL CODE v1.0.0 — 25.09.2026 */
/* v1.0.0 — 25.09.2026. РЕГЛАМЕНТ WB НА ПУЛЬТЕ: ПЕРВАЯ КНИГА, ДРУГИЕ — ПОТОМ, ОДНОЙ ВОЛНОЙ.
   Откуда: менеджеру WB нужен регламент ещё по одному кабинету «как у соседнего бренда» —
   заказы и остатки FBS/FBO подтягиваются сами, руками только выгрузка 1С. Решение
   владельца: собрать по стандарту «Пульт» сразу, начиная с этой книги; четыре книги
   прежней схемы не трогать до общей раскатки mp-core.
   Что было. Две автоматизации жили в каждой книге порознь: сбор заказов и остатков
   (скрипт внутри книги, правка = поход по книгам) и раскладка FBS (свой лоадер + свой
   центральный файл в отдельном репозитории). Два меню, две точки обновления.
   Что стало.
   • один модуль монорепозитория: в книге только лоадер, логика — этим файлом;
   • 10_данные.js — сбор «WB Данные», перенесён из книжного скрипта v1.3.1 без изменения
     логики (его история версий — в шапке того блока);
   • 01–03_fbs_*.js — раскладка FBS, перенесена из центрального кода v3.0.0 без изменения
     логики (история — в шапках блоков);
   • 20_пульт.js — одно меню по порядку работы, 🔌 проверка связи без ретраев с правом
     записи, 📖 инструкция и 📊 статус из кода, оба утренних запуска одной кнопкой,
     дописывание новых карточек кабинета с формулами строки-образца, миграция листов.
   Тесты: 86/86. */

/* ЧТО ЭТО ЗА ФАЙЛ. Склейка `central/src/*.js` по порядку имён. Руками не правится:
   правится исходник, `python tools/build.py` пересобирает и проверяет. Настройки книги
   (базовый склад, где лежит ключ) объявляет только лоадер. */


/* ==================== 01_fbs_math.js ==================== */

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


/* ==================== 02_fbs_wb.js ==================== */

/* WB FBS DISTRIBUTION — КЛИЕНТ WB MARKETPLACE API v1.1.0 — 26.08.2026

   ИСТОРИЯ ВЕРСИЙ
   v1.1.0 — 26.08.2026. ОБЪЕДИНЕНИЕ ДВУХ СКРИПТОВ: ОДИН КЛИЕНТ ВМЕСТО ДВУХ.
   • сюда переехали сборочные задания (fbsOrders_, fbsOrdersPeriod_) из файла
     «WB Склады FBS» v1.2.4 — раньше два файла в одном проекте держали два своих
     клиента к одному и тому же хосту, с разными ретраями и разными текстами ошибок;
   • оттуда же взят разбор 401/403: почти всегда это ключ без категории «Маркетплейс»,
     и человеку надо сказать именно это, а не «HTTP 403»;
   • сетевое исключение UrlFetchApp.fetch теперь тоже ретраится: до v1.1.0 падение
     сети на середине обхода складов роняло весь прогон.

   v1.0.0 — 25.08.2026. Читающие методы (fbsWarehouses_, fbsStocks_) безопасны.
   Пишущий ровно один — fbsPutStocks_, он вызывается только из пункта меню
   «Залить план в WB», который человек запускает руками. */

var FBSD_WB_BASE = 'https://marketplace-api.wildberries.ru';

// WB принимает до 1000 позиций в одном запросе остатков.
var FBSD_STOCKS_CHUNK = 1000;

/**
 * Запрос к WB с повторами.
 *
 * 429 и 5xx транзиентны — ретраим с нарастающей паузой. 401/403 не повторяем и
 * объясняем прямо: почти всегда это ключ, выпущенный без категории «Маркетплейс».
 * Прочие 4xx отдаём сразу — повтор их не исправит.
 */
function fbsWbCall_(method, path, body) {
  var opts = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: fbsGetToken_() },
    contentType: 'application/json'
  };
  if (body !== undefined) opts.payload = JSON.stringify(body);

  var url = FBSD_WB_BASE + path;

  for (var attempt = 0; attempt < 5; attempt++) {
    var resp;
    try {
      resp = UrlFetchApp.fetch(url, opts);
    } catch (netError) {
      // v1.1.0. Сеть отвалилась — это не ответ WB, это обрыв. Повторяем.
      if (attempt < 4) {
        Utilities.sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error('WB API: сетевая ошибка после повторов: ' + netError.message);
    }

    var code = resp.getResponseCode();
    var text = resp.getContentText();
    if (code >= 200 && code < 300) return text ? JSON.parse(text) : null;

    if (code === 401 || code === 403) throw new Error(fbsTokenError_(code, url, text));

    if ((code === 429 || code >= 500) && attempt < 4) {
      Utilities.sleep(Math.min(60000, 3000 * Math.pow(2, attempt)));
      continue;
    }

    var detail = text;
    try { var j = JSON.parse(text); detail = j.detail || j.title || text; } catch (e) {}
    throw new Error('WB ' + code + ' на ' + path + ': ' + String(detail).slice(0, 300));
  }
}

/** v1.1.0. Текст про ключ: человеку нужна причина и что нажать, а не номер кода. */
function fbsTokenError_(code, url, text) {
  return 'WB отклонил ключ (HTTP ' + code + ') на методе складов продавца.\n\n' +
    'Чаще всего у ключа в «' + FBSD_TOKEN_SHEET + '»!' + FBSD_TOKEN_CELL + ' нет категории ' +
    '«Маркетплейс» — без неё методы складов, остатков FBS и сборочных заданий недоступны.\n\n' +
    'Что сделать: в кабинете WB, Профиль → Настройки → Доступ к API, создайте НОВЫЙ токен ' +
    'и отметьте сразу три категории: Контент, Аналитика, Маркетплейс. Первые две нужны ' +
    'остальным скриптам книги, третья — этому. Галку «Только на чтение» не ставьте, ' +
    'иначе заливка остатков работать не будет. Вставьте токен в ту же ячейку ' +
    FBSD_TOKEN_CELL + ': он заменит старый для всех скриптов сразу. Старый удаляйте только ' +
    'после того, как убедитесь, что всё работает.\n\n' +
    'Адрес: ' + url + '\nОтвет: ' + String(text).slice(0, 300);
}

/** Склады продавца (виртуальные склады FBS). id — warehouseId, name — город. */
function fbsWarehouses_() {
  var list = fbsWbCall_('get', '/api/v3/warehouses') || [];
  return list
    .filter(function (w) { return !w.isDeleting; })
    .map(function (w) {
      return { id: Number(w.id) || 0, name: String(w.name || ('Склад ' + w.id)).trim() };
    })
    .filter(function (w) { return w.id; });
}

/** Остатки товаров на складе: {штрихкод: количество}. Метод читающий, несмотря на POST. */
function fbsStocks_(warehouseId, barcodes) {
  var out = {};
  for (var i = 0; i < barcodes.length; i += FBSD_STOCKS_CHUNK) {
    var chunk = barcodes.slice(i, i + FBSD_STOCKS_CHUNK);
    var r = fbsWbCall_('post', '/api/v3/stocks/' + warehouseId, { skus: chunk }) || {};
    (r.stocks || []).forEach(function (s) {
      var sku = String(s.sku || '').trim();
      if (sku) out[sku] = (out[sku] || 0) + (Number(s.amount) || 0);
    });
    if (i + FBSD_STOCKS_CHUNK < barcodes.length) Utilities.sleep(300);
  }
  return out;
}

/** ЗАПИСЬ остатков на склад. items: [{sku, amount}]. Ответ 204 без тела. */
function fbsPutStocks_(warehouseId, items) {
  for (var i = 0; i < items.length; i += FBSD_STOCKS_CHUNK) {
    var chunk = items.slice(i, i + FBSD_STOCKS_CHUNK).map(function (it) {
      return { sku: String(it.sku), amount: Math.max(0, Math.round(it.amount)) };
    });
    fbsWbCall_('put', '/api/v3/stocks/' + warehouseId, { stocks: chunk });
  }
}

/**
 * v1.1.0. Окно «последние N полных дней»: заканчивается вчера. Сегодня не берём —
 * день ещё не закрыт, и цифра всё равно поедет к вечеру.
 */
function fbsOrdersPeriod_(windowDays) {
  var days = windowDays > 0 ? windowDays : 5;
  var day = 24 * 60 * 60 * 1000;
  var now = Date.now();
  var endText = Utilities.formatDate(new Date(now - day), FBSD_TIMEZONE, 'yyyy-MM-dd');
  var startText = Utilities.formatDate(new Date(now - days * day), FBSD_TIMEZONE, 'yyyy-MM-dd');
  var from = Utilities.parseDate(startText + ' 00:00:00', FBSD_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  var to = Utilities.parseDate(endText + ' 23:59:59', FBSD_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  return {
    startText: startText,
    endText: endText,
    fromUnix: Math.floor(from.getTime() / 1000),
    toUnix: Math.floor(to.getTime() / 1000)
  };
}

/**
 * v1.1.0. GET /api/v3/orders — сборочные задания за период, постранично через курсор next.
 * У каждого задания есть warehouseId — это и есть склад, с которого заказ едет.
 * У WB одно задание = одна единица товара, поэтому задания считаются штуками.
 */
function fbsOrders_(period) {
  var all = [];
  var next = 0;
  var page = 0;

  while (true) {
    var path = '/api/v3/orders?limit=1000&next=' + next +
      '&dateFrom=' + period.fromUnix + '&dateTo=' + period.toUnix;
    var json = fbsWbCall_('get', path);
    if (page === 0) {
      Logger.log('/api/v3/orders, страница 1 — ответ (начало): ' + JSON.stringify(json).slice(0, 800));
    }

    var orders = json && Array.isArray(json.orders) ? json.orders : (Array.isArray(json) ? json : null);
    if (!orders) {
      throw new Error('WB вернул неожиданный формат списка сборочных заданий.\nОтвет: ' +
                      JSON.stringify(json).slice(0, 500));
    }
    if (!orders.length) break;

    all.push.apply(all, orders);

    var cursor = json && json.next;
    if (!cursor || cursor === next) break;
    next = cursor;
    page++;
    if (page > 200) break; // страховка от бесконечного цикла на кривом курсоре
    Utilities.sleep(300);
  }

  Logger.log('Сборочных заданий за период: ' + all.length);
  return all;
}

/** Право записи видно в самом токене: бит 30 маски `s` — «только на чтение». */
function fbsTokenIsReadOnly_(token) {
  try {
    var payload = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    var json = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString());
    return !!(Number(json.s) & Math.pow(2, 30));
  } catch (e) {
    return false;
  }
}


/* ==================== 03_fbs_sheet.js ==================== */

/* WB СКЛАДЫ FBS — ОДИН ЛИСТ: СПРОС, ОСТАТКИ И РАСКЛАДКА v2.2.0 — 27.08.2026

   ИСТОРИЯ ВЕРСИЙ

   v2.2.0 — 27.08.2026. МИНУС В КОЛОНКЕ D: ТОВАР МОЖНО НЕ ТОЛЬКО ДОБАВИТЬ, НО И УБАВИТЬ.
   Задача владельца 27.08.2026: «нужно чтобы можно было не только добавлять товар на
   виртуальные склады FBS, но ещё и убавлять количество — например числом с минусом
   в столбце D». До этого вычесть было нечем: отрицательное число в «Привезли (+)»
   молча обрезалось до нуля, а единственный способ уменьшить пул — пересчитать весь
   остаток товара и вписать его в «Факт на FBS (=)».
   • колонка D называется «Привезли (±)»: плюс прибавляет к пулу, минус вычитает;
   • СТАРЫЙ ЗАГОЛОВОК ЧИТАЕТСЯ ТОЖЕ. Ручные колонки ищутся по заголовку, и первый
     прогон новой версии видит на боевом листе ещё старую шапку «Привезли (+)» —
     без алиаса вписанное вечером перемещение пропало бы. Список FBSD_HEAD_BROUGHT_ALIASES;
   • минус не гасит «Ждёт перемещения»: долг закрывает факт перемещения НА склад,
     вывоз со склада им не является (см. fbs_math.gs v1.4.0);
   • «Факт на FBS (=)» по-прежнему главнее «Привезли»: заполнили факт — минус не смотрим.


   v2.1.0 — 26.08.2026. ОФОРМЛЕНИЕ ЛИСТА ТЕПЕРЬ ДЕЛАЕТ СКРИПТ, А НЕ ЧЕЛОВЕК.
   Задача владельца: «сделай правильное оформление границ блоков складов, заливку ячеек
   через условное форматирование, чтобы оформление в целом было красивое».
   Почему это переворот прежнего решения: до v2.1.0 скрипт СПЕЦИАЛЬНО не трогал цвета —
   раскраску настраивали руками, и её надо было сохранить. Но города идут по числу
   заказов и меняются местами каждый прогон: правило, повешенное руками на колонку,
   назавтра красит другой город. Значит владеть оформлением должен тот, кто знает порядок
   колонок, — сам скрипт.
   • ВНИМАНИЕ: ручные правила условного форматирования на этом листе БОЛЬШЕ НЕ ЖИВУТ.
     Каждый прогон снимает все правила и ставит свои. Нужен свой цвет — правится в коде
     (константы FBSD_COLOR и пороги в fbsBuildFormatRules_), а не в книге;
   • границы: блок каждого города отделён вертикальной чертой, служебный блок и шапка —
     чертой потолще, внутри данных светлые горизонтальные линии на всю ширину листа
     (на 97 колонках без них строка теряется). Сетка книги скрыта — рисуют границы;
   • «Остаток <город> (дней)» красится условным форматированием от горизонта:
     нет заказов — серый, меньше половины горизонта — красный, меньше горизонта — жёлтый,
     от горизонта — зелёный, от двух горизонтов — голубой (перезапас). Пороги едут за
     настройкой в строке 1: поменяли горизонт на 21 — перекрасится само;
   • ноль в «дней» больше не читается как «запас на ноль дней»: правило «нет заказов»
     стоит ПЕРВЫМ и красит такую ячейку серым, а не красным (грабля из v1.2.4);
   • формулы правил написаны через умножение условий, а не через AND: локаль книги
     решает, каким разделителем разделены аргументы функции, и русская книга отвергает
     `=AND(a,b)` прямо при установке правила (проверено на Sheets API 26.08.2026);
   • «План <город>» красится по направлению: зелёный — довезти, оранжевый — убрать,
     совпало — без заливки. Отдельные колонки «Δ» так и не нужны;
   • шапка блока города подкрашена через один, чтобы четвёрки колонок читались как блоки;
   • числовые форматы, ширины колонок, выравнивание и высота шапки — тоже за скриптом.
   Правил условного форматирования выходит 7 на город плюс 6 служебных (у кабинета А 153,
   у кабинета Б 139). Потолок листа — 500, проверено запросом к Sheets API 26.08.2026.

   v2.0.0 — 26.08.2026. ДВА ЛИСТА И ДВА СКРИПТА СЛИЛИСЬ В ОДИН ЛИСТ.
   Задача владельца 26.08.2026: «объединить функционал листа WB Склады FBS
   (Регламент кабинета А) и листа Распределение FBS (Регламент кабинета Б), важно чтобы
   остался один лист WB Склады FBS».
   Было: «WB Склады FBS» (файл v1.2.4) показывал заказы и остатки по городам,
   «Распределение FBS» (файл fbs_main.gs v1.2.0) отдельно ходил в те же самые методы
   WB и считал раскладку на своём листе. Менеджер сверял два листа глазами, а книга
   дважды за прогон опрашивала один и тот же API.
   Стало:
   • один лист «WB Склады FBS» и один проход по API: склады → остатки → сборочные
     задания. Всё, что раньше жило на листе плана, встало в этот же лист;
   • блок города — ЧЕТЫРЕ колонки подряд: «Заказы <город> (5 дн)», «Остаток (<город>)»,
     «Остаток <город> (дней)», «План <город>». План стоит рядом с текущим остатком,
     поэтому колонки «Δ <город>» больше не нужны — разницу видно и так;
   • слева служебный блок: Артикул, Штрихкод, Остаток всего (WB), Привезли (+),
     Факт на FBS (=), Долг из 1С (+), Ждёт перемещения, Пул, ССП/день, Дней покрытия;
   • строка 1 — настройки: горизонт (14 дней) и неснижаемый остаток (10 шт, решение
     владельца 26.08.2026; было 5). Правятся прямо в книге, действуют на весь лист;
   • ежедневный запуск в 06:45 обновляет данные И пересчитывает план, но в WB НЕ пишет.
     Заливка осталась ручным пунктом меню с подтверждением;
   • ручные колонки переживают любое обновление: они читаются ПО ЗАГОЛОВКУ до очистки
     листа и записываются обратно. Очищаются они ровно один раз — после успешной
     заливки в WB, иначе то же перемещение посчиталось бы дважды;
   • «Распределение FBS» больше не нужен: расчёт целиком идёт на этом листе.

   ЛИНИЯ «WB СКЛАДЫ FBS» (файл до объединения)
   v1.2.4 — в «Остаток дней» вместо пустоты ноль (константа FBSD_DAYS_FALLBACK).
   v1.2.3 — #ERROR! в колонке дней: подбираются и имя функции, и разделитель
            (ЕСЛИОШИБКА/IFERROR, «;»/«,») — локаль книги угадывать нельзя.
   v1.2.2 — короче заголовки колонок: «Заказы Москва (5 дн)».
   v1.2.1 — разделитель аргументов формулы определяется опытом, а не по локали.
   v1.2.0 — порядок складов по числу заказов, слева самый сильный; «остаток дней»
            формулой, а не числом; лист переписывается значениями, оформление живёт.
   v1.0.0 — первая версия: заказы и остатки FBS по складам продавца.

   ЛИНИЯ «РАСПРЕДЕЛЕНИЕ FBS» (fbs_main.gs до объединения)
   v1.2.0 — неснижаемый остаток вместо посева; «Долг из 1С (+)» и «Ждёт перемещения»:
            товар выставляется авансом и гасится реальным перемещением; ручные колонки
            читаются по заголовку, а не по номеру.
   v1.1.0 — «Факт на FBS (=)» перекрывает живые остатки WB: сверка списка перемещений
            менеджера с кабинетом 25.08.2026 разошлась по всем 34 позициям.
   v1.0.0 — первая версия: пул, цели по спросу, заливка остатков в WB из меню. */

/* ---------- лист и его геометрия ---------- */

var FBSD_SHEET = 'WB Склады FBS';
var FBSD_LOG_SHEET = '_лог FBS';

// Список товаров — колонки A:B листа «Регламент», со строки 3. Тот же источник,
// что у основного WB-скрипта книги: штрихкод в B — главный ключ сопоставления.
var FBSD_ITEMS_SHEET = 'Регламент';
var FBSD_ITEMS_FIRST_ROW = 3;

var FBSD_SETTINGS_ROW = 1;
var FBSD_HEADER_ROW = 2;
var FBSD_FIRST_ROW = 3;

// Служебный блок слева, до первого города.
var FBSD_META_COLS = 10;
var FBSD_COL_VENDOR = 1;
var FBSD_COL_BARCODE = 2;
var FBSD_COL_TOTAL = 3;
var FBSD_COL_BROUGHT = 4;
var FBSD_COL_FACT = 5;
var FBSD_COL_ADVANCE = 6;
var FBSD_COL_DEBT = 7;

// Колонок на один город и колонок в хвосте (Сумма плана, Откуда пул, Обновлено).
var FBSD_WH_BLOCK = 4;
var FBSD_TAIL_COLS = 3;

var FBSD_HEAD_BROUGHT = 'Привезли (±)';

/**
 * v2.2.0. Прежние названия той же колонки. Ручные колонки ищутся ПО ЗАГОЛОВКУ, а на
 * боевом листе в момент первого прогона новой версии стоит ещё старая шапка: без этого
 * списка вписанное менеджером перемещение прочиталось бы как ноль и потерялось.
 */
var FBSD_HEAD_BROUGHT_ALIASES = ['Привезли (+)', 'Привезли'];
var FBSD_HEAD_FACT = 'Факт на FBS (=)';
var FBSD_HEAD_ADVANCE = 'Долг из 1С (+)';
var FBSD_HEAD_DEBT = 'Ждёт перемещения';

var FBSD_TIMEZONE = 'Europe/Moscow';
var FBSD_WINDOW_DAYS = 5;
var FBSD_DEFAULT_HORIZON = 14;
var FBSD_DAILY_HANDLER = 'wbWarehousesDailyTrigger';
var FBSD_LOG_LIMIT = 20000;

/**
 * Что подставлять в «Остаток дней», когда делить не на что (заказов не было).
 *   '0' — ноль, '""' — пустая ячейка, '"—"' — прочерк.
 * О ЧЁМ ПОМНИТЬ ПРИ РАСКРАСКЕ: ноль здесь значит «посчитать не из чего», а не
 * «запаса на ноль дней». Правило «красным всё, что меньше 10» покрасит и склады,
 * где товар просто не продаётся.
 */
var FBSD_DAYS_FALLBACK = '0';

/* ---------- палитра листа ----------

   Светлые тона: лист читают целиком, на 97 колонок насыщенная заливка превращается
   в рябь. Смысл несут четыре цвета «дней» (красный → жёлтый → зелёный → голубой) и два
   цвета плана (зелёный «довезти», оранжевый «убрать»), всё остальное — фон и рамки. */
var FBSD_COLOR = {
  settings: '#e8eaed',   // строка настроек
  headMeta: '#d9d9d9',   // шапка служебного блока и хвоста
  headOdd: '#dbe4ee',    // шапка блока города, через один
  headEven: '#eef2f7',
  manual: '#fff2cc',     // жёлтые колонки — их заполняет человек
  debt: '#efefef',       // «Ждёт перемещения» — считает скрипт
  debtOn: '#fff0e0',     // ...и в ней есть непогашенный долг
  debtText: '#b06000',
  pool: '#e8f0fe',       // «Пул» — итог служебного блока
  soft: '#f8f9fa',       // ССП и дни покрытия
  noDemand: '#f3f3f3',   // заказов не было — считать не из чего
  noDemandText: '#9aa0a6',
  low: '#f4c7c3',        // меньше половины горизонта
  mid: '#fce8b2',        // меньше горизонта
  ok: '#d9ead3',         // от горизонта
  over: '#cfe2f3',       // от двух горизонтов — перезапас
  add: '#d9ead3',        // план больше остатка — довезти
  take: '#fce5cd',       // план меньше остатка — убрать
  gridLight: '#d9d9d9',
  gridDark: '#9aa0a6',
  muted: '#999999'
};

/* ---------- меню ---------- */

/**
 * Своего onOpen у файла НЕТ намеренно: в привязанном скрипте книги «Регламент» уже
 * живёт чужой onOpen (меню «Меню»), а два определения одного имени в проекте Apps
 * Script молча затирают друг друга. Вызов `fbsBuildMenu_();` дописывает деплой.
 */
function fbsBuildMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('📦 Остатки FBS')
    .addItem('Обновить лист и рассчитать план', 'updateWbSellerWarehouses')
    .addItem('Залить план в WB', 'fbsApplyPlan')
    .addSeparator()
    .addItem('Включить автообновление (06:45)', 'installWbWarehousesDailyTrigger')
    .addItem('Отключить автообновление', 'removeWbWarehousesDailyTrigger')
    .addSeparator()
    .addItem('Проверить связь с WB', 'fbsCheckConnection')
    .addItem('Указать токен WB', 'fbsSetToken')
    .addToUi();
}

/**
 * Ручной запуск: обновляет заказы и остатки и пересчитывает план. В WB не пишет.
 * Имя прежнее — на него завязан пункт «🏬 Обновить по складам FBS — WB» в меню «Меню».
 */
function updateWbSellerWarehouses() {
  var ui = SpreadsheetApp.getUi();
  fbsBook_().toast('Собираю остатки, заказы и раскладку по складам FBS…', 'Wildberries', 30);
  try {
    var result = fbsRun_(false);
    ui.alert('Wildberries — склады FBS', result.message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Wildberries — склады FBS',
             'Обновление не выполнено. Лист «' + FBSD_SHEET + '» не изменён.\n\n' + error.message,
             ui.ButtonSet.OK);
    throw error;
  }
}

/** Пересчёт заново и заливка плана в WB. Спрашивает подтверждение. */
function fbsApplyPlan() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = fbsRun_(true);
    ui.alert('Wildberries — склады FBS', result.message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Wildberries — склады FBS', 'Заливка не выполнена.\n\n' + error.message, ui.ButtonSet.OK);
    throw error;
  }
}

function fbsCheckConnection() {
  var warehouses = fbsWarehouses_();
  var readOnly = fbsTokenIsReadOnly_(fbsGetToken_());
  fbsAlert_('Связь с WB',
    'Складов в кабинете: ' + warehouses.length + '\n' +
    warehouses.map(function (w) { return '• ' + w.name; }).join('\n') + '\n\n' +
    (readOnly ? 'ВНИМАНИЕ: токен «только на чтение» — залить остатки он не сможет.'
              : 'Токен с правом записи — заливка остатков доступна.'));
}

function fbsSetToken() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Токен WB',
    'Вставьте токен с правом «Маркетплейс» (без галки «только на чтение»)', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var token = answer.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty(FBSD_TOKEN_PROP, token);
  ui.alert('Токен сохранён' + (fbsTokenIsReadOnly_(token) ? '.\n\nНо он «только на чтение».' : '.'));
}

/* ---------- ежедневный запуск ---------- */

/**
 * Ежедневный запуск в 06:45 МСК.
 *
 * ПОЧЕМУ НЕ ВНУТРИ 07:00–08:00, КАК ОСТАЛЬНЫЕ: там уже стоят WB (07:15) и Ozon
 * (07:45), а Google запускает с допуском ±15 минут — свободного места между ними
 * не остаётся, и три выгрузки начали бы писать в одну книгу одновременно.
 * 06:45 заканчивается ровно перед стартом WB, к 08:00 все три листа заполнены.
 *
 * v2.0.0. Триггер считает и план тоже, но в WB НИЧЕГО не пишет: заливка требует
 * интерфейса (см. fbsConfirm_), а у триггера его нет.
 */
function installWbWarehousesDailyTrigger() {
  var ui = SpreadsheetApp.getUi();
  installWbWarehousesDailyTriggerSilent();
  ui.alert('Wildberries — склады FBS',
    'Ежедневное обновление включено: около 06:45 МСК, то есть между 06:30 и 07:00.\n\n' +
    'Оно обновляет заказы и остатки и пересчитывает план. В кабинет WB ничего не пишет — ' +
    'заливка остаётся ручным пунктом меню с подтверждением.',
    ui.ButtonSet.OK);
}

/** Служебный вариант без окон — для установки прямо из редактора. */
function installWbWarehousesDailyTriggerSilent() {
  fbsDeleteDailyTriggers_();
  ScriptApp.newTrigger(FBSD_DAILY_HANDLER)
    .timeBased()
    .atHour(6)
    .nearMinute(45)
    .everyDays(1)
    .inTimezone(FBSD_TIMEZONE)
    .create();
  return 'WB seller-warehouses trigger created';
}

/** Отключает только этот триггер, не трогая триггеры WB и Ozon. */
function removeWbWarehousesDailyTrigger() {
  var ui = SpreadsheetApp.getUi();
  var removed = fbsDeleteDailyTriggers_();
  ui.alert('Wildberries — склады FBS',
           removed ? 'Ежедневное обновление отключено.' : 'Активного триггера не было.',
           ui.ButtonSet.OK);
}

function fbsDeleteDailyTriggers_() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === FBSD_DAILY_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

/** Обработчик триггера: без окон, ошибки не глушим. */
function wbWarehousesDailyTrigger() {
  var result = fbsRun_(false);
  Logger.log(result.message);
}

/* ---------- основной прогон ---------- */

/** Блокировка, чтобы ручной запуск и триггер не столкнулись на одном листе. */
function fbsRun_(apply) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление по складам уже выполняется. Повторите позже.');
  try {
    return fbsRunLocked_(apply);
  } finally {
    lock.releaseLock();
  }
}

function fbsRunLocked_(apply) {
  var ss = fbsBook_();
  var sheet = ss.getSheetByName(FBSD_SHEET) || ss.insertSheet(FBSD_SHEET);

  // Настройки и ручные колонки читаем ДО очистки листа — иначе потеряем их.
  var settings = fbsReadSettings_(sheet);
  var manual = fbsReadManual_(sheet);

  var items = fbsReadItems_(ss);
  if (!items.length) {
    throw new Error('В листе «' + FBSD_ITEMS_SHEET + '» не найдены строки со штрихкодами (колонка B).');
  }
  items = fbsMergeRows_(items, manual);

  var warehouses = fbsWarehouses_();
  if (!warehouses.length) {
    throw new Error('WB не вернул ни одного склада продавца. Если вы работаете только по FBO, ' +
                    'этот лист не нужен — разбивать нечего.');
  }

  var barcodes = items.map(function (item) { return item.barcode; });
  var stocksByWarehouse = {};
  warehouses.forEach(function (warehouse) {
    stocksByWarehouse[warehouse.id] = fbsStocks_(warehouse.id, barcodes);
  });

  var period = fbsOrdersPeriod_(FBSD_WINDOW_DAYS);
  var ordersIndex = fbsAggregateOrders_(fbsOrders_(period), warehouses, items);

  // Слева самый сильный склад — тот, где больше всего заказов за период.
  var ordered = fbsOrderWarehouses_(warehouses, ordersIndex.byWarehouse);
  var baseIndex = fbsBaseIndex_(ordered);
  var headers = fbsHeaders_(ordered);

  // Лист нужен до сборки строк: на нём выясняем, какой разделитель аргументов
  // понимает эта книга, иначе формула «остаток дней» встанет в ошибку.
  var dialect = fbsDetectFormulaDialect_(sheet, headers.length + 3);

  var plans = items.map(function (item) {
    var current = ordered.map(function (w) {
      return Number((stocksByWarehouse[w.id] || {})[item.barcode]) || 0;
    });
    var orders = ordered.map(function (w) {
      return Number((ordersIndex.byWarehouse[w.id] || {})[item.barcode]) || 0;
    });
    var hand = manual[item.barcode] || {};
    var currentSum = current.reduce(function (a, b) { return a + b; }, 0);
    var chosen = fbsPool_(currentSum, hand.brought, hand.fact, hand.debt, hand.advance);
    var res = fbsPlanOne_(chosen.pool, orders, current, {
      horizonDays: settings.horizon,
      minStock: settings.minStock,
      windowDays: FBSD_WINDOW_DAYS,
      baseIndex: baseIndex
    });
    return {
      item: item, current: current, currentSum: currentSum, orders: orders,
      brought: Number(hand.brought) ? Number(hand.brought) : '',
      fact: (hand.fact === null || hand.fact === undefined) ? '' : hand.fact,
      advance: Number(hand.advance) > 0 ? Number(hand.advance) : '',
      debtPrev: Number(hand.debt) || 0, debt: chosen.debt, covered: chosen.covered,
      pool: chosen.pool, poolSource: chosen.source, plan: res.plan, mode: res.mode
    };
  });

  var changes = fbsChanges_(ordered, plans);
  var updatedAt = fbsNow_();
  var summary = fbsSummary_(plans, ordered, changes, period, ordersIndex);

  fbsWriteSheet_(sheet, headers, ordered, plans, settings, updatedAt, dialect, false);
  fbsWriteNote_(sheet, ordered, period, updatedAt, ordersIndex, plans.length, settings);
  SpreadsheetApp.flush();

  if (!apply) {
    fbsStamp_(sheet, updatedAt, 'расчёт, в WB не отправлено');
    return { message: 'Готово. ' + summary + '\n\nВ WB ничего не отправлено.', changes: changes };
  }

  if (fbsTokenIsReadOnly_(fbsGetToken_())) {
    throw new Error('Токен «только на чтение» — залить остатки нельзя. Меню → «Указать токен WB».');
  }
  if (!changes.count) {
    fbsStamp_(sheet, updatedAt, 'раскладка уже соответствует плану');
    return { message: 'Раскладка уже соответствует плану — заливать нечего.\n\n' + summary,
             changes: changes };
  }
  if (!fbsConfirm_('Залить остатки в WB?',
                   summary + '\n\nПосле заливки ручные колонки очистятся.')) {
    fbsStamp_(sheet, updatedAt, 'заливка отменена');
    return { message: 'Отменено. Лист пересчитан, в WB ничего не отправлено.\n\n' + summary,
             changes: changes };
  }

  var sent = 0;
  ordered.forEach(function (warehouse, index) {
    var list = changes.byWarehouse[index];
    if (!list.length) return;
    fbsPutStocks_(warehouse.id, list.map(function (it) { return { sku: it.barcode, amount: it.to }; }));
    sent += list.length;
  });

  fbsLog_(fbsBook_(), ordered, changes);
  // Долг фиксируется и ручные колонки очищаются ТОЛЬКО здесь: пересчёт кнопкой
  // не должен наращивать долг, а отменённая заливка — ничего не менять.
  fbsCommitManual_(sheet, plans);
  fbsStamp_(sheet, fbsNow_(), 'залито в WB');

  return { message: 'Залито в WB: ' + sent + ' позиций.\n\n' + summary, changes: changes };
}

function fbsSummary_(plans, warehouses, changes, period, ordersIndex) {
  var debtTotal = plans.reduce(function (a, p) { return a + p.debt; }, 0);
  var coveredTotal = plans.reduce(function (a, p) { return a + p.covered; }, 0);
  var text = 'Товаров: ' + plans.length + ', складов: ' + warehouses.length + '.\n' +
    'Заказы за ' + period.startText + ' — ' + period.endText + ': ' + ordersIndex.total + ' шт.\n' +
    'Позиций к изменению: ' + changes.count + ', движение: ' + changes.moved + ' шт.';
  if (debtTotal) text += '\nЖдёт перемещения (выставлено авансом): ' + debtTotal + ' шт.';
  if (coveredTotal) text += '\nПеремещение закрыло долга: ' + coveredTotal + ' шт.';
  if (ordersIndex.unknownTotal) {
    text += '\nЗаказов не отнесено ни к одному складу из списка: ' + ordersIndex.unknownTotal +
            ' (обычно склад, удалённый в кабинете; подробности — в примечании к A2).';
  }
  return text;
}

/* ---------- чтение книги ---------- */

/**
 * Книга берётся текущая. Жёстко зашитого ID здесь нет специально: файл одинаковый
 * для всех брендов, и именно зашитый ID однажды привёл к тому, что скрипт из таблицы
 * одного бренда молча писал в таблицу другого.
 */
function fbsBook_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Скрипт не привязан к таблице. Откройте нужную книгу и запустите его через ' +
                    '«Расширения → Apps Script» именно из неё.');
  }
  return ss;
}

/** Строки «Регламента» со штрихкодом. Артикул нужен как запасной ключ для заказов. */
function fbsReadItems_(ss) {
  var sheet = ss.getSheetByName(FBSD_ITEMS_SHEET);
  if (!sheet) throw new Error('В книге нет листа «' + FBSD_ITEMS_SHEET + '».');
  var lastRow = sheet.getLastRow();
  if (lastRow < FBSD_ITEMS_FIRST_ROW) throw new Error('В «' + FBSD_ITEMS_SHEET + '» нет строк товаров.');
  var values = sheet.getRange(FBSD_ITEMS_FIRST_ROW, 1, lastRow - FBSD_ITEMS_FIRST_ROW + 1, 2)
                    .getDisplayValues();
  var out = [];
  values.forEach(function (row) {
    var vendorCode = String(row[0] || '').trim();
    var barcode = String(row[1] || '').trim();
    if (!/^\d{6,}$/.test(barcode)) return;   // «Сеты», «ИТОГО», инструкция — мимо
    out.push({ vendorCode: vendorCode, barcode: barcode });
  });
  return out;
}

/** Горизонт и неснижаемый остаток из строки 1. Пусто — значения по умолчанию. */
function fbsReadSettings_(sheet) {
  var horizon = FBSD_DEFAULT_HORIZON;
  var minStock = FBSD_DEFAULT_MIN_STOCK_;
  if (sheet && sheet.getLastRow() >= FBSD_SETTINGS_ROW && sheet.getLastColumn() >= 4) {
    var row = sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 4).getValues()[0];
    if (Number(row[1]) > 0) horizon = Math.round(Number(row[1]));
    if (row[3] !== '' && Number(row[3]) >= 0) minStock = Math.round(Number(row[3]));
  }
  return { horizon: horizon, minStock: minStock };
}

/**
 * Ручные колонки по штрихкоду. Пустой «Факт на FBS (=)» — это null, а не ноль:
 * ноль означал бы «на складах ничего нет» и обнулил бы весь товар.
 */
function fbsReadManual_(sheet) {
  var out = {};
  if (!sheet || sheet.getLastRow() < FBSD_FIRST_ROW) return out;
  var width = Math.max(FBSD_META_COLS, sheet.getLastColumn());
  var head = sheet.getRange(FBSD_HEADER_ROW, 1, 1, width).getValues()[0];
  var col = fbsManualCols_(head);
  var count = sheet.getLastRow() - FBSD_FIRST_ROW + 1;
  var values = sheet.getRange(FBSD_FIRST_ROW, 1, count, width).getValues();

  function num(row, index) {
    if (index < 0) return 0;
    var v = Number(row[index]);
    return v > 0 ? Math.round(v) : 0;
  }

  /** v2.2.0. «Привезли (±)» — единственная ручная колонка со знаком: минус = забрали. */
  function signed(row, index) {
    if (index < 0) return 0;
    var raw = row[index];
    if (raw === '' || raw === null || raw === undefined) return 0;
    var v = Number(raw);
    return isNaN(v) ? 0 : Math.round(v);
  }

  values.forEach(function (row) {
    var barcode = String(row[FBSD_COL_BARCODE - 1] === null || row[FBSD_COL_BARCODE - 1] === undefined
      ? '' : row[FBSD_COL_BARCODE - 1]).trim();
    if (!/^\d{6,}$/.test(barcode)) return;
    var factCell = col.fact >= 0 ? row[col.fact] : '';
    var fact = (factCell === '' || factCell === null || factCell === undefined || isNaN(Number(factCell)))
      ? null : Math.max(0, Math.round(Number(factCell)));
    out[barcode] = {
      vendorCode: String(row[FBSD_COL_VENDOR - 1] || '').trim(),
      brought: signed(row, col.brought), fact: fact,
      advance: num(row, col.advance), debt: num(row, col.debt)
    };
  });
  return out;
}

/**
 * Номера ручных колонок ПО ЗАГОЛОВКУ (0-based). Колонки нет на листе — вернётся −1,
 * и значение считается нулевым.
 *
 * ЗАЧЕМ ПО ЗАГОЛОВКУ, А НЕ ПО НОМЕРУ: до v2.0.0 те же колонки жили на другом листе
 * и в другом порядке. По номерам «Долг из 1С» вычитался бы из чужой колонки —
 * раскладка удвоила бы весь остаток товара. Пустая шапка = свежий лист: там номера
 * по умолчанию верны, потому что лист сейчас же будет записан этой версией.
 */
function fbsManualCols_(head) {
  function find(title, fallback) {
    var titles = Array.isArray(title) ? title : [title];
    for (var i = 0; i < head.length; i++) {
      var cell = String(head[i]).trim();
      for (var t = 0; t < titles.length; t++) {
        if (cell === titles[t]) return i;
      }
    }
    return fallback;
  }
  var empty = !head.join('').trim();
  return {
    brought: find([FBSD_HEAD_BROUGHT].concat(FBSD_HEAD_BROUGHT_ALIASES),
                  empty ? FBSD_COL_BROUGHT - 1 : -1),
    fact: find(FBSD_HEAD_FACT, empty ? FBSD_COL_FACT - 1 : -1),
    advance: find(FBSD_HEAD_ADVANCE, empty ? FBSD_COL_ADVANCE - 1 : -1),
    debt: find(FBSD_HEAD_DEBT, empty ? FBSD_COL_DEBT - 1 : -1)
  };
}

/**
 * Строки «Регламента» плюс дописанные руками: товара может не быть в «Регламенте»
 * (у кабинета Б так с одной позицией — он стоит там без штрихкода), но
 * перевезти его могли. Спрос по такой строке нулевой.
 */
function fbsMergeRows_(items, manual) {
  var rows = items.slice();
  var known = {};
  items.forEach(function (item) { known[item.barcode] = true; });
  Object.keys(manual).forEach(function (barcode) {
    if (known[barcode]) return;
    var hand = manual[barcode];
    if (!hand.brought && !hand.advance && !hand.debt
        && (hand.fact === null || hand.fact === undefined)) return;
    rows.push({ vendorCode: hand.vendorCode || ('ШК ' + barcode), barcode: barcode, addedByHand: true });
  });
  return rows;
}

/* ---------- заказы ---------- */

/**
 * Раскладывает сборочные задания по складам и товарам.
 * Ключ — штрихкод из skus[]; если его нет, пробуем артикул, но только когда он ведёт
 * ровно к одной строке: артикул продавца не уникален, и угадывание приписало бы
 * заказы чужому товару.
 */
function fbsAggregateOrders_(orders, warehouses, items) {
  var byWarehouse = {};
  warehouses.forEach(function (warehouse) { byWarehouse[warehouse.id] = {}; });

  var knownBarcodes = {};
  var barcodeByVendorCode = {};
  items.forEach(function (item) {
    knownBarcodes[item.barcode] = true;
    var key = String(item.vendorCode || '').trim().toLowerCase();
    if (!key) return;
    if (!barcodeByVendorCode[key]) barcodeByVendorCode[key] = [];
    barcodeByVendorCode[key].push(item.barcode);
  });

  var total = 0;
  var unknownTotal = 0;
  var unknownWarehouses = {};

  (orders || []).forEach(function (order) {
    var warehouseId = Number(order.warehouseId) || 0;

    var barcode = '';
    var skus = Array.isArray(order.skus) ? order.skus : [];
    for (var i = 0; i < skus.length; i++) {
      var candidate = String(skus[i] || '').trim();
      if (knownBarcodes[candidate]) { barcode = candidate; break; }
    }
    if (!barcode) {
      var candidates = barcodeByVendorCode[String(order.article || '').trim().toLowerCase()] || [];
      if (candidates.length === 1) barcode = candidates[0];
    }
    if (!barcode) return;   // товара нет в «Регламенте» — не наше дело

    total++;
    if (!byWarehouse[warehouseId]) {
      unknownTotal++;
      unknownWarehouses[warehouseId] = (unknownWarehouses[warehouseId] || 0) + 1;
      return;
    }
    byWarehouse[warehouseId][barcode] = (byWarehouse[warehouseId][barcode] || 0) + 1;
  });

  return { byWarehouse: byWarehouse, total: total,
           unknownTotal: unknownTotal, unknownWarehouses: unknownWarehouses };
}

/**
 * Склады слева направо — по убыванию числа заказов за период. При равенстве — по
 * имени, чтобы порядок не дёргался между запусками на складах с одинаковым
 * (обычно нулевым) результатом.
 */
function fbsOrderWarehouses_(warehouses, ordersByWarehouse) {
  return warehouses
    .map(function (warehouse) {
      var byBarcode = ordersByWarehouse[warehouse.id] || {};
      var total = Object.keys(byBarcode).reduce(function (sum, barcode) {
        return sum + byBarcode[barcode];
      }, 0);
      return { id: warehouse.id, name: warehouse.name, totalOrders: total };
    })
    .sort(function (a, b) {
      if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders;
      return a.name.localeCompare(b.name, 'ru');
    });
}

/** Базовый склад: на него уходит излишек при профиците. Не нашёлся — самый сильный. */
function fbsBaseIndex_(warehouses) {
  for (var i = 0; i < warehouses.length; i++) {
    if (fbsNormName_(warehouses[i].name) === fbsNormName_(FBSD_BASE_WAREHOUSE)) return i;
  }
  return 0;
}

/* ---------- сборка и запись листа ---------- */

/** Номер колонки → буквенное обозначение: 1 → A, 27 → AA, 66 → BN. */
function fbsColumnLetter_(index) {
  var result = '';
  var n = index;
  while (n > 0) {
    var remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * v2.0.0. Шапка: служебный блок, потом по ЧЕТЫРЕ колонки на город, потом хвост.
 * План стоит сразу за остатком того же города — так видно разницу без колонок «Δ».
 */
function fbsHeaders_(warehouses) {
  var headers = ['Артикул', 'Штрихкод', 'Остаток всего (WB)', FBSD_HEAD_BROUGHT, FBSD_HEAD_FACT,
                 FBSD_HEAD_ADVANCE, FBSD_HEAD_DEBT, 'Пул', 'ССП/день', 'Дней покрытия'];
  warehouses.forEach(function (warehouse) {
    headers.push('Заказы ' + warehouse.name + ' (' + FBSD_WINDOW_DAYS + ' дн)');
    headers.push('Остаток (' + warehouse.name + ')');
    headers.push('Остаток ' + warehouse.name + ' (дней)');
    headers.push('План ' + warehouse.name);
  });
  headers.push('Сумма плана');
  headers.push('Откуда пул');
  headers.push('Обновлено (МСК)');
  return headers;
}

/**
 * Строка товара. «Остаток дней» — формула, а не число: её видно, можно поправить
 * прямо в таблице, и она пересчитывается сама, если вы измените остаток руками.
 * Имя функции и разделитель аргументов приходят из fbsDetectFormulaDialect_.
 *
 * @param {boolean} commit true — в «Ждёт перемещения» уходит НОВЫЙ долг (после заливки).
 */
function fbsBuildRow_(plan, rowNumber, dialect, commit) {
  var ssp = plan.orders.reduce(function (a, b) { return a + b; }, 0) / FBSD_WINDOW_DAYS;
  var row = [plan.item.vendorCode, plan.item.barcode, plan.currentSum,
             plan.brought, plan.fact, plan.advance,
             (commit ? plan.debt : plan.debtPrev) || '',
             plan.pool, Math.round(ssp * 10) / 10, ssp > 0 ? Math.round(plan.pool / ssp) : ''];

  plan.plan.forEach(function (value, index) {
    var ordersCol = fbsColumnLetter_(FBSD_META_COLS + 1 + index * FBSD_WH_BLOCK);
    var stockCol = fbsColumnLetter_(FBSD_META_COLS + 2 + index * FBSD_WH_BLOCK);
    row.push(plan.orders[index]);
    row.push(plan.current[index]);
    row.push('=' + dialect.fn + '(' + stockCol + rowNumber + '/(' + ordersCol + rowNumber + '/' +
             FBSD_WINDOW_DAYS + ')' + dialect.sep + FBSD_DAYS_FALLBACK + ')');
    row.push(value);
  });

  row.push(plan.plan.reduce(function (a, b) { return a + b; }, 0));
  row.push(plan.poolSource + (plan.item.addedByHand ? ', строка дописана руками' : ''));
  row.push(plan.updatedAt);
  return row;
}

/**
 * v2.1.0. Лист переписывается ЦЕЛИКОМ: и значения, и оформление.
 *
 * До v2.1.0 скрипт трогал только содержимое, чтобы пережила раскраска, настроенная
 * руками. Так делать было нельзя: города стоят по числу заказов и меняются местами
 * между прогонами, поэтому правило, повешенное человеком на колонку, назавтра красит
 * другой город. Оформление отдано скрипту — он один знает, где какой город сегодня.
 */
function fbsWriteSheet_(sheet, headers, warehouses, plans, settings, updatedAt, dialect, commit) {
  var width = headers.length;
  var needRows = FBSD_FIRST_ROW + plans.length - 1;

  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < needRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), needRows - sheet.getMaxRows());
  }

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearContent();

  sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 8).setValues([[
    'Горизонт, дней', settings.horizon,
    'Неснижаемый остаток, шт', settings.minStock,
    'Обновлено (МСК)', updatedAt,
    'Статус', 'расчёт'
  ]]);
  sheet.getRange(FBSD_HEADER_ROW, 1, 1, width).setValues([headers]).setFontWeight('bold').setWrap(true);

  var body = plans.map(function (plan, index) {
    plan.updatedAt = updatedAt;
    return fbsBuildRow_(plan, FBSD_FIRST_ROW + index, dialect, commit);
  });
  if (body.length) sheet.getRange(FBSD_FIRST_ROW, 1, body.length, width).setValues(body);

  if (sheet.getFrozenRows() !== FBSD_HEADER_ROW) sheet.setFrozenRows(FBSD_HEADER_ROW);
  if (sheet.getFrozenColumns() !== 2) sheet.setFrozenColumns(2);

  fbsFormatSheet_(sheet, headers, warehouses, settings, body.length);
  return sheet;
}

/* ---------- оформление ---------- */

/**
 * v2.1.0. Весь внешний вид листа за один заход: чистим прежнее, красим шапку и
 * служебный блок, расставляем границы блоков, форматы чисел и ширины, в конце —
 * условное форматирование.
 *
 * Порядок важен: сначала снимаем все границы и заливку со ВСЕГО листа — иначе от
 * прошлого прогона остаются черты и цвет там, где сегодня стоит другой город.
 */
function fbsFormatSheet_(sheet, headers, warehouses, settings, rowCount) {
  var width = headers.length;
  var n = warehouses.length;
  var bodyRows = Math.max(rowCount, 1);
  var blockStart = FBSD_META_COLS + 1;
  var tailStart = FBSD_META_COLS + n * FBSD_WH_BLOCK + 1;
  var solid = SpreadsheetApp.BorderStyle.SOLID;
  var medium = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;

  var all = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  all.setBorder(false, false, false, false, false, false);
  all.setBackground(null);
  all.setFontColor(null);
  all.setFontWeight('normal');
  all.setFontSize(10);
  all.setWrap(false);
  sheet.setHiddenGridlines(true);

  // Строка настроек: и подписи, и значения жирные — их правит человек.
  sheet.getRange(FBSD_SETTINGS_ROW, 1, 1, 8)
       .setBackground(FBSD_COLOR.settings).setFontWeight('bold');

  // Шапка: служебный блок и хвост серые, блоки городов подкрашены через один.
  var header = sheet.getRange(FBSD_HEADER_ROW, 1, 1, width);
  header.setFontWeight('bold').setWrap(true)
        .setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange(FBSD_HEADER_ROW, 1, 1, FBSD_META_COLS).setBackground(FBSD_COLOR.headMeta);
  sheet.getRange(FBSD_HEADER_ROW, tailStart, 1, FBSD_TAIL_COLS).setBackground(FBSD_COLOR.headMeta);
  warehouses.forEach(function (warehouse, i) {
    sheet.getRange(FBSD_HEADER_ROW, blockStart + i * FBSD_WH_BLOCK, 1, FBSD_WH_BLOCK)
         .setBackground(i % 2 ? FBSD_COLOR.headEven : FBSD_COLOR.headOdd);
  });
  sheet.getRange(FBSD_HEADER_ROW, 1).setHorizontalAlignment('left');
  sheet.setRowHeight(FBSD_HEADER_ROW, 46);

  // Служебный блок: жёлтое — руке, серое — скрипту, голубое — итог.
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, 1).setBackground(FBSD_COLOR.soft);
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, bodyRows, 3).setBackground(FBSD_COLOR.manual);
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_DEBT, bodyRows, 1).setBackground(FBSD_COLOR.debt);
  sheet.getRange(FBSD_FIRST_ROW, 8, bodyRows, 1)
       .setBackground(FBSD_COLOR.pool).setFontWeight('bold');
  sheet.getRange(FBSD_FIRST_ROW, 9, bodyRows, 2).setBackground(FBSD_COLOR.soft);

  // Выравнивание: название слева, числа по центру, «откуда пул» — мелким слева.
  sheet.getRange(FBSD_FIRST_ROW, 1, bodyRows, 2).setHorizontalAlignment('left');
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, width - 2).setHorizontalAlignment('center');
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 1, bodyRows, 1)
       .setHorizontalAlignment('left').setFontSize(9).setFontColor(FBSD_COLOR.muted);
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 2, bodyRows, 1)
       .setFontSize(9).setFontColor(FBSD_COLOR.muted);

  // Числовые форматы. Штрихкод — текстом, иначе длинное число уедет в экспоненту.
  sheet.getRange(FBSD_FIRST_ROW, 1, bodyRows, 2).setNumberFormat('@');
  sheet.getRange(FBSD_FIRST_ROW, 3, bodyRows, 6).setNumberFormat('#,##0');
  // v2.2.0. Минус в «Привезли (±)» — красным: вычитание должно быть видно с первого взгляда.
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, bodyRows, 1)
       .setNumberFormat('#,##0;[Red]-#,##0');
  sheet.getRange(FBSD_FIRST_ROW, 9, bodyRows, 1).setNumberFormat('#,##0.0');
  sheet.getRange(FBSD_FIRST_ROW, 10, bodyRows, 1).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, blockStart, bodyRows, n * FBSD_WH_BLOCK).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, tailStart, bodyRows, 1).setNumberFormat('#,##0');
  sheet.getRange(FBSD_FIRST_ROW, tailStart + 1, bodyRows, 2).setNumberFormat('@');

  // Ширины. Блоки городов одной ширины — так четвёрки читаются как одинаковые модули.
  [[1, 300], [2, 120], [3, 92], [4, 84], [5, 90], [6, 88], [7, 96], [8, 82], [9, 78], [10, 86]]
    .forEach(function (pair) { sheet.setColumnWidth(pair[0], pair[1]); });
  sheet.setColumnWidths(blockStart, n * FBSD_WH_BLOCK, 66);
  sheet.setColumnWidth(tailStart, 86);
  sheet.setColumnWidth(tailStart + 1, 170);
  sheet.setColumnWidth(tailStart + 2, 112);

  // Границы: сначала светлая сетка по данным, потом тяжёлые разделители поверх.
  var data = sheet.getRange(FBSD_HEADER_ROW, 1, bodyRows + 1, width);
  data.setBorder(true, true, true, true, null, true, FBSD_COLOR.gridLight, solid);
  warehouses.forEach(function (warehouse, i) {
    sheet.getRange(FBSD_SETTINGS_ROW, blockStart + i * FBSD_WH_BLOCK, bodyRows + 2, FBSD_WH_BLOCK)
         .setBorder(null, true, null, null, null, null, FBSD_COLOR.gridDark, solid);
  });
  sheet.getRange(FBSD_SETTINGS_ROW, 1, bodyRows + 2, FBSD_META_COLS)
       .setBorder(null, null, null, true, null, null, FBSD_COLOR.gridDark, medium);
  sheet.getRange(FBSD_SETTINGS_ROW, tailStart, bodyRows + 2, FBSD_TAIL_COLS)
       .setBorder(null, true, null, null, null, null, FBSD_COLOR.gridDark, medium);
  header.setBorder(null, null, true, null, null, null, FBSD_COLOR.gridDark, medium);

  fbsApplyRules_(sheet, fbsBuildFormatRules_(warehouses, settings, rowCount));
  return sheet;
}

/**
 * v2.1.0. Правила условного форматирования — ЧИСТЫМ списком, без обращений к книге.
 * Так их видно в тестах: цвет ячейки на боевом листе через API не прочитать, поэтому
 * проверять можно только то, из чего он получается — диапазон, формулу и цвет.
 *
 * НА КАЖДУЮ КОЛОНКУ СВОЁ ПРАВИЛО, а не одно на все сразу. Одно правило с двумя десятками
 * диапазонов короче, но тогда относительные ссылки в формуле пересчитывает сама таблица,
 * и ошибка вылезла бы цветом уже на боевом листе. Правил выходит 7 на город плюс 6
 * служебных — при потолке листа в 500 (проверено запросом к Sheets API 26.08.2026) запас есть.
 *
 * ПОРЯДОК ВНУТРИ ОДНОГО ДИАПАЗОНА ЗНАЧИМ: побеждает первое подошедшее правило. «Нет
 * заказов» стоит первым, иначе ноль в «дней» покрасился бы красным как острый дефицит,
 * хотя означает «считать не из чего» (см. FBSD_DAYS_FALLBACK).
 */
function fbsBuildFormatRules_(warehouses, settings, rowCount) {
  var rules = [];
  if (!rowCount) return rules;

  var horizon = settings && settings.horizon > 0 ? settings.horizon : FBSD_DEFAULT_HORIZON;
  var half = Math.max(1, Math.round(horizon / 2));
  var row = FBSD_FIRST_ROW;

  function add(col, formula, background, fontColor, bold) {
    rules.push({ row: row, col: col, rows: rowCount, cols: 1, formula: formula,
                 background: background || null, fontColor: fontColor || null, bold: !!bold });
  }

  /**
   * Четыре ступени запаса плюс «спроса нет». demandCol — колонка заказов.
   *
   * ПОЧЕМУ УМНОЖЕНИЕ, А НЕ AND: формулу условного форматирования разбирает сама книга,
   * по своей локали. В русской книге `=AND($K3>0,$M3>=28)` отвергается на месте —
   * разделитель аргументов там `;`, а не `,` (проверено запросом к Sheets API 26.08.2026:
   * запятая — отказ 400, `AND(...;...)` и `И(...;...)` проходят). Подбирать диалект, как
   * для ЕСЛИОШИБКА в строках листа, тут не нужно: `(A)*(B)` — то же «и», но без имени
   * функции и без разделителя, поэтому работает в книге с любой локалью.
   */
  function daysRules(daysCol, demandCol) {
    var d = '$' + fbsColumnLetter_(daysCol) + row;
    var q = '$' + fbsColumnLetter_(demandCol) + row;
    add(daysCol, '=' + q + '=0', FBSD_COLOR.noDemand, FBSD_COLOR.noDemandText);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + (horizon * 2) + ')', FBSD_COLOR.over);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + horizon + ')', FBSD_COLOR.ok);
    add(daysCol, '=(' + q + '>0)*(' + d + '>=' + half + ')', FBSD_COLOR.mid);
    add(daysCol, '=' + q + '>0', FBSD_COLOR.low);
  }

  // Служебный блок: «Дней покрытия» считается от ССП, «Ждёт перемещения» — от нуля.
  daysRules(10, 9);
  add(FBSD_COL_DEBT, '=$' + fbsColumnLetter_(FBSD_COL_DEBT) + row + '>0',
      FBSD_COLOR.debtOn, FBSD_COLOR.debtText, true);

  warehouses.forEach(function (warehouse, i) {
    var demand = FBSD_META_COLS + 1 + i * FBSD_WH_BLOCK;
    var stock = demand + 1;
    var days = demand + 2;
    var plan = demand + 3;
    daysRules(days, demand);
    // План против текущего остатка: что довезти, что забрать.
    var p = '$' + fbsColumnLetter_(plan) + row;
    var st = '$' + fbsColumnLetter_(stock) + row;
    add(plan, '=' + p + '>' + st, FBSD_COLOR.add);
    add(plan, '=' + p + '<' + st, FBSD_COLOR.take);
  });

  return rules;
}

/** Превращает список правил в правила книги. Прежние правила листа снимаются целиком. */
function fbsApplyRules_(sheet, specs) {
  var rules = specs.map(function (spec) {
    var builder = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(spec.formula)
      .setRanges([sheet.getRange(spec.row, spec.col, spec.rows, spec.cols)]);
    if (spec.background) builder.setBackground(spec.background);
    if (spec.fontColor) builder.setFontColor(spec.fontColor);
    if (spec.bold) builder.setBold(true);
    return builder.build();
  });
  sheet.setConditionalFormatRules(rules);
  return rules.length;
}

function fbsStamp_(sheet, updatedAt, status) {
  sheet.getRange(FBSD_SETTINGS_ROW, 6).setValue(updatedAt);
  sheet.getRange(FBSD_SETTINGS_ROW, 8).setValue(status);
}

/**
 * Фиксация после успешной заливки: непогашенный долг остаётся на листе, ручные
 * колонки очищаются — иначе следующий прогон посчитает то же перемещение дважды.
 */
function fbsCommitManual_(sheet, plans) {
  if (!plans.length) return;
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_BROUGHT, plans.length, 3).clearContent();
  sheet.getRange(FBSD_FIRST_ROW, FBSD_COL_DEBT, plans.length, 1)
       .setValues(plans.map(function (p) { return [p.debt || '']; }));
}

/**
 * Выясняет опытом, чем эта книга разделяет аргументы функции и как называет
 * ЕСЛИОШИБКА. Гадать нельзя: формулу разбирает сама таблица, и от локали зависит
 * и имя функции, и разделитель. Проверка занимает одну служебную ячейку за
 * пределами выгрузки и делается один раз за запуск.
 */
var FBSD_FORMULA_CANDIDATES = [
  { fn: 'ЕСЛИОШИБКА', sep: ';' },
  { fn: 'IFERROR', sep: ';' },
  { fn: 'IFERROR', sep: ',' },
  { fn: 'ЕСЛИОШИБКА', sep: ',' }
];

function fbsDetectFormulaDialect_(sheet, probeColumn) {
  if (sheet.getMaxColumns() < probeColumn) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), probeColumn - sheet.getMaxColumns());
  }
  var cell = sheet.getRange(1, probeColumn);
  var previous = cell.getFormula() || cell.getValue();
  var chosen = null;

  try {
    for (var i = 0; i < FBSD_FORMULA_CANDIDATES.length; i++) {
      var candidate = FBSD_FORMULA_CANDIDATES[i];
      cell.setFormula('=' + candidate.fn + '(1' + candidate.sep + '1)');
      SpreadsheetApp.flush();
      var value = cell.getValue();
      Logger.log('Пробую «=' + candidate.fn + '(1' + candidate.sep + '1)» → ' + value);
      if (value === 1) { chosen = candidate; break; }
    }
  } catch (error) {
    Logger.log('Проверка формулы прервалась: ' + error.message);
  } finally {
    cell.clearContent();
    if (previous !== '' && previous !== null) cell.setValue(previous);
  }

  if (!chosen) {
    chosen = FBSD_FORMULA_CANDIDATES[0];
    Logger.log('Ни один вариант не посчитался — беру «' + chosen.fn + '» с «' + chosen.sep + '».');
  }
  return chosen;
}

function fbsWriteNote_(sheet, warehouses, period, updatedAt, ordersIndex, itemCount, settings) {
  var note = 'Обновлено: ' + updatedAt + ' МСК.\n' +
    'Заказы: сборочные задания за ' + period.startText + ' — ' + period.endText +
    ' (' + FBSD_WINDOW_DAYS + ' полных дней), 1 задание = 1 единица товара.\n' +
    'Остаток: текущий остаток на складе продавца по штрихкоду.\n' +
    'Товаров: ' + itemCount + '. Складов: ' + warehouses.length + '.\n\n' +
    'КАК ЧИТАТЬ БЛОК ГОРОДА: «Заказы» — спрос за период, «Остаток» — что лежит сейчас, ' +
    '«Остаток (дней)» — на сколько дней хватит, «План» — сколько должно лежать после ' +
    'раскладки. План минус остаток и есть перемещение.\n' +
    'ЦЕЛЬ СКЛАДА: ССП города × горизонт (' + settings.horizon + ' дн). Сначала каждому ' +
    'складу неснижаемый остаток (' + settings.minStock + ' шт), спрос делит остаток пула. ' +
    'Пула не хватает даже на минимум по всем городам — товар НЕ размазывается по 1–2 штуки, ' +
    'берутся только самые продающие города.\n' +
    'ПУЛ: колонка «' + FBSD_HEAD_FACT + '» перекрывает живые остатки WB (им верить нельзя — ' +
    'их проставляют руками). Пусто — пул = сумма живых остатков + «' + FBSD_HEAD_BROUGHT + '».\n' +
    'ДОЛГ: «' + FBSD_HEAD_ADVANCE + '» кладёт товар на витрину авансом и вешает его в ' +
    '«' + FBSD_HEAD_DEBT + '»; реальное перемещение сначала гасит долг и идёт в пул только ' +
    'излишком. Долг фиксируется ТОЛЬКО после заливки — пересчёт кнопкой его не растит.\n' +
    'Ручные колонки очищаются после успешной заливки, иначе перемещение посчитается дважды.\n' +
    'Строка 1 — настройки: горизонт и неснижаемый остаток. Правьте прямо в книге.\n\n' +
    'Порядок складов — по числу заказов, слева самый сильный: ' +
    warehouses.slice(0, 5).map(function (w) { return w.name + ' (' + w.totalOrders + ')'; }).join(', ') +
    (warehouses.length > 5 ? ' и далее' : '') + '.\n' +
    'Порядок пересчитывается каждый запуск, поэтому города могут меняться местами. ' +
    'Структура при этом постоянная: у каждого города четыре колонки подряд, поэтому ' +
    'условное форматирование, повешенное на колонку, остаётся верным по смыслу.\n' +
    'ОФОРМЛЕНИЕ СТАВИТ СКРИПТ (v2.1.0): каждый прогон он заново красит шапку, границы ' +
    'блоков и условное форматирование, потому что города меняются местами. Правила, ' +
    'добавленные руками на этом листе, будут сняты следующим прогоном — нужный цвет ' +
    'правится в коде.\n' +
    'ЦВЕТ «ОСТАТОК <ГОРОД> (ДНЕЙ)»: серый — заказов не было, красный — меньше ' +
    'половины горизонта, жёлтый — меньше горизонта, зелёный — от горизонта, ' +
    'голубой — от двух горизонтов (перезапас). Пороги едут за горизонтом из строки 1.\n' +
    'ЦВЕТ «ПЛАН <ГОРОД>»: зелёный — довезти, оранжевый — забрать, без заливки — ' +
    'оставить как есть.\n' +
    'Формулы в «Регламенте» стройте через ПОИСКПОЗ по заголовку, а не по номеру колонки — ' +
    'номера зависят от порядка складов.\n' +
    'Сумма по складам может слегка расходиться с колонкой «Заказы за 5 дней / FBS» в ' +
    '«WB Данные»: там цифра из аналитического отчёта, здесь — из сборочных заданий.';

  var unknownIds = Object.keys(ordersIndex.unknownWarehouses || {});
  if (unknownIds.length) {
    note += '\n\nЗаказы со складов, которых нет в текущем списке (всего ' + ordersIndex.unknownTotal +
      '): ' + unknownIds.map(function (id) {
        return 'ID ' + id + ' — ' + ordersIndex.unknownWarehouses[id] + ' шт.';
      }).join(', ') + '. Обычно это склад, удалённый или переименованный в кабинете уже после ' +
      'того, как заказы по нему прошли. В колонки такие заказы не попали.';
  }
  sheet.getRange(FBSD_HEADER_ROW, 1).setNote(note);
}

/* ---------- заливка ---------- */

/** Что реально меняется: по складам, только позиции с другим количеством. */
function fbsChanges_(warehouses, plans) {
  var byWarehouse = warehouses.map(function () { return []; });
  var count = 0;
  var moved = 0;
  plans.forEach(function (p) {
    p.plan.forEach(function (to, i) {
      var from = p.current[i];
      if (to === from) return;
      byWarehouse[i].push({ barcode: p.item.barcode, sku: p.item.vendorCode, from: from, to: to });
      count++;
      moved += Math.abs(to - from);
    });
  });
  return { byWarehouse: byWarehouse, count: count, moved: moved };
}

function fbsLog_(book, warehouses, changes) {
  var sheet = book.getSheetByName(FBSD_LOG_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(FBSD_LOG_SHEET);
    sheet.getRange(1, 1, 1, 6)
         .setValues([['Когда (МСК)', 'Склад', 'SKU', 'ШК', 'Было', 'Стало']])
         .setFontWeight('bold');
    sheet.hideSheet();
  }
  var stamp = fbsNow_();
  var rows = [];
  warehouses.forEach(function (w, i) {
    changes.byWarehouse[i].forEach(function (it) {
      rows.push([stamp, w.name, it.sku, it.barcode, it.from, it.to]);
    });
  });
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  var extra = sheet.getLastRow() - 1 - FBSD_LOG_LIMIT;
  if (extra > 0) sheet.deleteRows(2, extra);
}

/* ---------- мелочи ---------- */

function fbsNow_() {
  return Utilities.formatDate(new Date(), FBSD_TIMEZONE, 'dd.MM.yyyy HH:mm');
}

function fbsAlert_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(title + ': ' + message);
  }
}

/** Без интерфейса (триггер, clasp run) заливка НЕ идёт: подтверждение обязательно. */
function fbsConfirm_(title, message) {
  try {
    var ui = SpreadsheetApp.getUi();
    return ui.alert(title, message, ui.ButtonSet.YES_NO) === ui.Button.YES;
  } catch (e) {
    return false;
  }
}

// Для тестов в Node. В Apps Script `module` не существует — блок не выполняется.
// Object.assign, а не присваивание: fbs_math.gs экспортируется первым, и простое
// `module.exports = {...}` стёрло бы его функции.
if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, {
    fbsManualCols_: fbsManualCols_, fbsHeaders_: fbsHeaders_, fbsBuildRow_: fbsBuildRow_,
    fbsChanges_: fbsChanges_, fbsColumnLetter_: fbsColumnLetter_,
    fbsAggregateOrders_: fbsAggregateOrders_, fbsOrderWarehouses_: fbsOrderWarehouses_,
    fbsMergeRows_: fbsMergeRows_, fbsRunLocked_: fbsRunLocked_,
    fbsReadSettings_: fbsReadSettings_, fbsReadManual_: fbsReadManual_,
    fbsBuildFormatRules_: fbsBuildFormatRules_, FBSD_COLOR: FBSD_COLOR
  });
}


/* ==================== 10_данные.js ==================== */

/* WB REGLAMENT AUTOMATION v1.3.1 — 24.08.2026 */
/*
 * v1.3.1 — ТОВАР БЕЗ КАРТОЧКИ НА WB БОЛЬШЕ НЕ ВАЛИТ ВЕСЬ ПРОГОН.
 * • Было: если хотя бы у одной строки «Регламента» штрихкод не нашёлся среди
 *   карточек WB, скрипт бросал «Не найдены nmID для строк …» и не записывал
 *   вообще ничего. На кабинете В так упали две строки Vitamin C — карточки на WB ещё
 *   не заведены («создать ФБС карточку»). При раскатке на все бренды такие
 *   строки будут всегда: новинки, выведенные товары, позиции только для Ozon.
 * • Стало: такие строки попадают в «WB Данные» как обычно, но с пустым nmID и
 *   нулями в метриках. Формулы VLOOKUP по штрихкоду продолжают находить строку
 *   и получают 0 вместо #Н/Д, а не рушатся.
 * • Список этих строк показывается после ручного запуска и пишется в примечание
 *   к A1 листа «WB Данные» — чтобы было видно, что проверить, а не молча забыть.
 * • Прогон останавливается только если карточек не нашлось СОВСЕМ ни для одной
 *   строки: это уже не «новинка без карточки», а неверный ключ или чужой кабинет.
 *
 * v1.3.0 — УНИВЕРСАЛЬНЫЙ ФАЙЛ ДЛЯ ЛЮБОГО БРЕНДА: ID ТАБЛИЦЫ БОЛЬШЕ НЕ ЗАШИТ.
 * • Убрана константа WB_REGLAMENT_SPREADSHEET_ID_. Скрипт всегда работает с той
 *   книгой, к которой он привязан (SpreadsheetApp.getActiveSpreadsheet()).
 *   Раньше ID был прописан жёстко: какой бы бренд вы ни открыли, скрипт молча
 *   писал в первый кабинет — именно из-за этого «данные обновились непонятно куда».
 * • Теперь порядок переноса на новый бренд такой: открыть таблицу бренда →
 *   Расширения → Apps Script → вставить этот файл. Больше ничего менять не нужно.
 * • Если файл случайно окажется в отдельном (не привязанном к таблице) проекте,
 *   скрипт не станет угадывать книгу, а сразу скажет об этом понятной ошибкой.
 * • Требования к таблице бренда прежние: лист «Технический» с ключом WB API в B2
 *   и лист «Регламент», где со строки 3 идут товары (колонка A — артикул,
 *   колонка B — штрихкод). Штрихкод — основной ключ сопоставления.
 *
 * v1.2.2 — БОЛЬШЕ ВРЕМЕНИ НА ОТЧЁТ ОСТАТКОВ ПО СКЛАДАМ.
 * • «WB не подготовил отчёт остатков за 60 секунд» — на некоторых кабинетах или
 *   при загрузке серверов WB асинхронный отчёт /api/v1/warehouse_remains не успевал
 *   сформироваться за прежнее окно ожидания (20 попыток по 3с = 60с).
 * • Окно ожидания увеличено втрое: 60 попыток по 3с = 180с. Каждые 5 попыток статус
 *   пишется в журнал выполнения (Logger.log) — если снова не уложится, будет видно,
 *   на каком статусе застряло, а не просто «не успели».
 * • Это не связано со структурой листов — может случиться на любом кабинете,
 *   независимо от бренда. Общее время выполнения скрипта по-прежнему укладывается
 *   в лимит Apps Script (6 минут на обычном аккаунте).
 *
 * v1.2.1 — КЛЮЧ ДЛЯ ФОРМУЛ В «РЕГЛАМЕНТЕ» — ШТРИХКОД, КАК И РАНЬШЕ ВНУТРИ СКРИПТА.
 * • Проверка на дубли теперь идёт по штрихкоду (колонка B «Регламента»), а не по
 *   артикулу — так же, как скрипт всегда сопоставлял товар с данными WB API внутри
 *   себя (штрихкод — основной ключ, артикул — только запасной вариант).
 * • Колонки в листе «WB Данные» не изменились (Артикул, Штрихкод, nmID, метрики) —
 *   поменялась только рекомендация, по какой из них строить VLOOKUP.
 *
 * v1.2.0 — ДАННЫЕ ТЕПЕРЬ ВЫГРУЖАЮТСЯ В ОТДЕЛЬНЫЙ ЛИСТ, А НЕ В ФИКСИРОВАННЫЕ КОЛОНКИ «РЕГЛАМЕНТА».
 * • Скрипт больше НЕ пишет в H/K/L/N/O/V листа «Регламент» — перестановка столбцов там
 *   больше ничего не ломает.
 * • Все метрики (остатки FBS/FBO, заказы за 5 дней и средние/день) выгружаются в новый
 *   лист «WB Данные» одной таблицей: Артикул | Штрихкод | nmID | Остаток FBS |
 *   Остаток FBO (Склад WB РФ) | Заказы FBS 5 дней | Заказы FBS/день |
 *   Заказы FBO 5 дней | Заказы FBO/день | Обновлено.
 * • Лист создаётся автоматически при первом запуске, если его ещё нет.
 * • Ключ для собственных VLOOKUP/INDEX-MATCH формул в «Регламенте» — колонка A
 *   («Артикул», vendorCode), как и попросили. Если среди артикулов есть повторы
 *   (например строки-обёртки FBS), скрипт пишет предупреждение об этом в примечание
 *   к ячейке A1 листа «WB Данные», потому что VLOOKUP по неуникальному ключу вернёт
 *   только первую подходящую строку.
 * • Список товаров (какие артикулы/штрихкоды вообще выгружать) по-прежнему читается
 *   из колонок A:B листа «Регламент», начиная со строки 3 — это единственное, что
 *   скрипт всё ещё читает из «Регламента».
 * ВАЖНО: этот файл не тестировался на вашей боевой таблице и WB API (нет доступа из
 * этой сессии) — перед подключением дневного триггера рекомендуется прогнать ручной
 * запуск и свериться глазами.
 *
 * v1.1.1 — СЕТЕВОЙ ТАЙМАУТ WB ОБРЫВАЛ ОБНОВЛЕНИЕ БЕЗ ПОВТОРА.
 * • Исключения UrlFetchApp теперь повторяются один раз с тем же безопасным интервалом.
 * Тесты: 7/7.
 *
 * v1.1.0 — FBO ТОЛЬКО «СКЛАД WB РФ», ЗАКАЗЫ ЗА ПЯТЬ ДНЕЙ.
 * • V берётся из точной графы «Склад WB РФ» отчёта остатков на складах.
 * • K/N — сумма ordersCount за пять завершённых дней; L/O — среднее за эти пять дней.
 * • Ручной пункт меню переименован в «🏭 Обновить заказы и остатки FBS, FBO».
 * Тесты: 6/6.
 *
 * v1.0.3 — FBS-КАРТОЧКА БЕЗ СТРОКИ В РЕГЛАМЕНТЕ ТЕРЯЛА ЗАКАЗЫ.
 * • Служебные карточки FBS!/!FBS/(FBS) добавляются к единственной базовой строке товара.
 * • Явные строки с разными штрихкодами остаются раздельными и не дублируются.
 * Тесты: 5/5.
 *
 * v1.0.2 — ДВА ШТРИХКОДА ОДНОГО АРТИКУЛА ПОЛУЧАЛИ ОДНИ И ТЕ ЖЕ ЗАКАЗЫ.
 * • Строки связываются с точным nmID через штрихкод из колонки B и Content API.
 * • Заголовки «Сеты», «ИТОГО» и текст регламента больше не затираются нулями.
 * • Запись идёт только по непрерывным блокам настоящих товарных строк.
 * Тесты: 4/4.
 *
 * v1.0.1 — ЗАКАЗЫ РАСХОДИЛИСЬ С «АНАЛИТИКА → ИСТОРИЯ ОСТАТКОВ».
 * • Источник заказов заменён: metrics.ordersCount из того же аналитического отчёта WB.
 * • FBS/FBO разделяются штатным stockType=mp/wb, как в интерфейсе истории остатков.
 * • Старый отчёт /supplier/orders больше не участвует в расчёте регламента.
 * Тесты: 3/3.
 *
 * v1.0.0 — ОСТАТКИ И ЗАКАЗЫ WB БОЛЬШЕ НЕ ОБНОВЛЯЮТСЯ ВРУЧНУЮ.
 * • H и V листа «Регламент» заполняются текущими остатками FBS/FBO.
 * • K и N получают активные заказы FBS/FBO за вчера; L и O — тот же суточный темп.
 * • Добавлены ручной запуск из меню и ежедневный триггер около 07:15 МСК.
 * • Старый отключённый /api/v1/supplier/stocks не используется.
 * Тесты: 3/3.
 */

const WB_TIMEZONE_ = 'Europe/Moscow';
const WB_ANALYTICS_URL_ =
  'https://seller-analytics-api.wildberries.ru/api/v2/stocks-report/products/products';
const WB_WAREHOUSE_REMAINS_URL_ =
  'https://seller-analytics-api.wildberries.ru/api/v1/warehouse_remains';
const WB_CONTENT_CARDS_URL_ = 'https://content-api.wildberries.ru/content/v2/get/cards/list';
const WB_RF_WAREHOUSE_NAME_ = 'Склад WB РФ';
const WB_ORDER_WINDOW_DAYS_ = 5;
const WB_DAILY_HANDLER_ = 'wbDailyTrigger';
const WB_DATA_SHEET_NAME_ = 'WB Данные';
const WB_DATA_HEADERS_ = [
  'Артикул (vendorCode)',
  'Штрихкод',
  'nmID',
  'Остаток FBS',
  'Остаток FBO (Склад WB РФ)',
  'Заказы FBS за 5 дней',
  'Заказы FBS, среднее/день',
  'Заказы FBO за 5 дней',
  'Заказы FBO, среднее/день',
  'Обновлено (МСК)',
];

/**
 * v1.3.0. Книга, в которой работает скрипт — всегда та, к которой он привязан.
 *
 * ПОЧЕМУ БЕЗ ID: раньше здесь стоял openById с зашитым ID первого кабинета, и копия файла
 * в другом бренде продолжала писать в первый кабинет. getActiveSpreadsheet() у
 * привязанного (bound) проекта доступен и в меню, и в ежедневном триггере.
 * Если он вернул null — значит файл лежит в отдельном проекте, не привязанном
 * к таблице; угадывать книгу нельзя, поэтому сразу говорим об этом.
 */
function wbSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'Скрипт не привязан к таблице. Откройте нужную таблицу бренда → ' +
        'Расширения → Apps Script и вставьте файл там, а не в отдельный проект ' +
        'на script.google.com.',
    );
  }
  return ss;
}

/** Ручной запуск из меню таблицы. */
function updateWbReglament() {
  const ss = wbSpreadsheet_();
  const ui = SpreadsheetApp.getUi();
  ss.toast('Получаю остатки и заказы WB…', 'Wildberries', 10);

  try {
    const result = wbUpdateReglament_();
    let message = 'Обновлено в листе «' + result.dataSheetName + '»: ' + result.rows + ' строк.\n' +
      'Заказы за ' + result.ordersPeriod + ': FBS ' + result.fbsOrders +
      ', FBO ' + result.fboOrders + '.';
    if (result.unmappedCount) {
      message += '\n\nБез карточки на WB: ' + result.unmappedCount + ' строк — записаны нули.\n' +
        result.unmappedText + '.\n' +
        'Для новинок и товаров только для Ozon это нормально. Подробности — ' +
        'в примечании к ячейке A1 листа «' + result.dataSheetName + '».';
    }
    ui.alert('Wildberries', message, ui.ButtonSet.OK);
  } catch (error) {
    ui.alert(
      'Wildberries',
      'Обновление не выполнено. Лист «' + WB_DATA_SHEET_NAME_ + '» не изменён.\n\n' + error.message,
      ui.ButtonSet.OK,
    );
    throw error;
  }
}

/** Устанавливает единственный ежедневный запуск около 07:15 МСК. */
function installWbDailyTrigger() {
  const ui = SpreadsheetApp.getUi();
  installWbDailyTriggerSilent();

  ui.alert(
    'Wildberries',
    'Ежедневное обновление WB включено: каждое утро в промежутке 07:00–08:00 МСК.\n\n' +
      'Запуск ставится на 07:15, Google выполняет его с допуском ±15 минут, ' +
      'то есть фактически между 07:00 и 07:30. Ozon обновляется следом, около 07:45, ' +
      'чтобы две выгрузки не писали в книгу одновременно.',
    ui.ButtonSet.OK,
  );
}

/** Служебный вариант без UI — для первоначальной установки из API/редактора. */
function installWbDailyTriggerSilent() {
  wbDeleteDailyTriggers_();
  ScriptApp.newTrigger(WB_DAILY_HANDLER_)
    .timeBased()
    .atHour(7)
    .nearMinute(15)
    .everyDays(1)
    .inTimezone(WB_TIMEZONE_)
    .create();
  return 'WB daily trigger created';
}

/** Отключает ежедневный запуск WB, не затрагивая другие триггеры проекта. */
function removeWbDailyTrigger() {
  const ui = SpreadsheetApp.getUi();
  const removed = wbDeleteDailyTriggers_();
  ui.alert(
    'Wildberries',
    removed ? 'Ежедневное обновление отключено.' : 'Активного триггера WB не было.',
    ui.ButtonSet.OK,
  );
}

/** Обработчик installable trigger: ошибки не глушатся, чтобы владелец получил уведомление. */
function wbDailyTrigger() {
  wbUpdateReglament_();
}

/** v1.0.0. Получает все данные до записи, затем одним этапом обновляет лист «WB Данные». */
function wbUpdateReglament_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Обновление WB уже выполняется. Повторите позже.');
  try {
    return wbUpdateReglamentLocked_();
  } finally {
    lock.releaseLock();
  }
}

function wbUpdateReglamentLocked_() {
  const ss = wbSpreadsheet_();
  const techSheet = ss.getSheetByName('Технический');
  const reglamentSheet = ss.getSheetByName('Регламент');
  if (!techSheet || !reglamentSheet) throw new Error('Не найдены листы «Технический»/«Регламент».');

  // B1 — подпись «WB API», ключ расположен под ней в B2.
  const token = String(techSheet.getRange('B2').getValue() || '').trim();
  if (!token) throw new Error('Пустой WB API-ключ в «Технический»!B2.');

  const barcodeToNm = wbFetchBarcodeToNm_(token);
  const now = Date.now();
  const ordersEndDate = wbFormatMoscowDate_(new Date(now - 24 * 60 * 60 * 1000));
  const ordersStartDate = wbFormatMoscowDate_(
    new Date(now - WB_ORDER_WINDOW_DAYS_ * 24 * 60 * 60 * 1000),
  );
  // stockCount в этом отчёте всегда текущий, а ordersCount относится к currentPeriod.
  // Два типа складов имеют общий лимит: следующий вызов не раньше чем через 20 секунд.
  const fbsProducts = wbFetchStockProducts_(token, 'mp', ordersStartDate, ordersEndDate);
  Utilities.sleep(20500);
  const fboProducts = wbFetchStockProducts_(token, 'wb', ordersStartDate, ordersEndDate);
  Utilities.sleep(20500);
  const rfFboStockProducts = wbFetchRfWarehouseStockProducts_(token);

  // Список товаров (какие артикулы/штрихкоды выгружать) — единственное, что всё ещё
  // читается из «Регламента». Сама запись результатов идёт в отдельный лист.
  const lastRow = reglamentSheet.getLastRow();
  if (lastRow < 3) throw new Error('В «Регламенте» нет строк товаров.');
  const sheetRows = reglamentSheet.getRange(3, 1, lastRow - 2, 2).getDisplayValues();
  const skuRows = wbBuildSkuRows_(sheetRows, barcodeToNm, 3);

  // v1.3.1. Строки без карточки на WB не выбрасываем и прогон из-за них не роняем:
  // они попадут в лист с нулями, а список уйдёт в предупреждение. Сопоставление и
  // проверки полноты считаем только по строкам, у которых карточка есть.
  const unmappedRows = wbFindUnmappedRows_(skuRows);
  const mappedRows = skuRows.filter(function (row) { return row.nmID; });
  wbAssertAnyMapping_(skuRows, mappedRows);

  const fbsStocks = wbIndexStockProducts_(fbsProducts, mappedRows);
  const fboStocks = wbIndexStockProducts_(rfFboStockProducts, mappedRows);
  const orderCounts = {
    fbs: wbIndexOrdersProducts_(fbsProducts, mappedRows),
    fbo: wbIndexOrdersProducts_(fboProducts, mappedRows),
  };

  wbAssertEnoughMatches_(mappedRows, fbsStocks, 'остатки FBS');
  wbAssertEnoughMatches_(mappedRows, fboStocks, 'остатки FBO');

  const updatedAt = Utilities.formatDate(new Date(), WB_TIMEZONE_, 'dd.MM.yyyy HH:mm');
  const rows = wbBuildWbDataRows_(skuRows, fbsStocks, fboStocks, orderCounts, updatedAt);

  const dataSheet = wbGetOrCreateDataSheet_(ss);
  wbWriteWbDataSheet_(dataSheet, rows);

  const dupBarcodes = wbFindDuplicateBarcodes_(skuRows);
  let note = 'Обновлено: ' + updatedAt + ' МСК.\n' +
    'Заказы (ordersCount): ' + ordersStartDate + ' — ' + ordersEndDate + ', сумма и среднее за ' +
    WB_ORDER_WINDOW_DAYS_ + ' дней.\n' +
    'Остаток FBS — склады продавца, stockType=mp. Остаток FBO — только графа «Склад WB РФ».';
  if (unmappedRows.length) {
    note += '\n\nБЕЗ КАРТОЧКИ НА WB (' + unmappedRows.length + ' из ' + skuRows.length +
      '): пустой nmID и нули в метриках. Это нормально для новинок и товаров только ' +
      'для Ozon; если товар на WB есть — проверьте штрихкод в колонке B «Регламента».\n' +
      wbDescribeUnmappedRows_(unmappedRows) + '.';
  }
  if (dupBarcodes.length) {
    note += '\n\nВНИМАНИЕ: повторяющиеся штрихкоды — VLOOKUP по колонке B найдёт ' +
      'только первую строку. Повторы: ' + dupBarcodes.join(', ') + '.';
  }
  dataSheet.getRange(1, 1).setNote(note);
  SpreadsheetApp.flush();

  return {
    rows: skuRows.length,
    ordersPeriod: ordersStartDate + ' — ' + ordersEndDate,
    fbsOrders: wbSumValues_(orderCounts.fbs),
    fboOrders: wbSumValues_(orderCounts.fbo),
    dataSheetName: WB_DATA_SHEET_NAME_,
    unmappedCount: unmappedRows.length,
    unmappedText: unmappedRows.length ? wbDescribeUnmappedRows_(unmappedRows) : '',
  };
}

/**
 * Актуальные остатки и метрики за период по товарам с разбивкой по типу хранения.
 * Source: https://dev.wildberries.ru/docs/openapi/analytics#tag/Istoriya-ostatkov/operation/postV2StocksReportProductsProducts
 */
function wbFetchStockProducts_(token, stockType, periodStart, periodEnd) {
  const limit = 1000;
  let offset = 0;
  let allItems = [];

  while (true) {
    const payload = {
      currentPeriod: { start: periodStart, end: periodEnd },
      stockType: stockType,
      skipDeletedNm: true,
      orderBy: { field: 'avgOrders', mode: 'desc' },
      availabilityFilters: [],
      limit: limit,
      offset: offset,
    };
    const json = wbFetchJson_(WB_ANALYTICS_URL_, {
      method: 'post',
      headers: { Authorization: token },
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }, 20500);
    const items = json && json.data && Array.isArray(json.data.items) ? json.data.items : null;
    if (!items) throw new Error('WB изменил формат отчёта истории остатков ' + stockType + '.');
    allItems = allItems.concat(items);
    if (items.length < limit) break;
    offset += items.length;
    Utilities.sleep(20500);
  }
  return allItems;
}

/**
 * v1.1.0. Точный столбец «Склад WB РФ» из асинхронного отчёта остатков.
 * Source: https://dev.wildberries.ru/openapi/reports#tag/Otchyoty/operation/getWarehouseRemains
 */
function wbFetchRfWarehouseStockProducts_(token) {
  const query = '?groupBySa=true&groupByNm=true&groupByBarcode=true&groupBySize=true' +
    '&filterPics=0&filterVolume=0';
  const authOptions = {
    method: 'get',
    headers: { Authorization: token },
    muteHttpExceptions: true,
  };
  const created = wbFetchJson_(WB_WAREHOUSE_REMAINS_URL_ + query, authOptions, 3000);
  const taskId = created && created.data && created.data.taskId;
  if (!taskId) throw new Error('WB не вернул taskId отчёта остатков.');

  // v1.2.2. Было 20 попыток по 3с (60с) — на некоторых кабинетах/при загрузке WB
  // отчёт не успевает сформироваться. Подняли окно до 60 попыток (180с) и логируем
  // каждый статус, чтобы при повторном сбое сразу было видно, на чём застряло.
  let done = false;
  let lastStatus = '';
  for (let attempt = 1; attempt <= 60; attempt++) {
    Utilities.sleep(3000);
    const statusJson = wbFetchJson_(
      WB_WAREHOUSE_REMAINS_URL_ + '/tasks/' + taskId + '/status',
      authOptions,
      3000,
    );
    lastStatus = String((statusJson && statusJson.data && statusJson.data.status) || '');
    if (attempt === 1 || attempt % 5 === 0) {
      Logger.log('Отчёт остатков: попытка ' + attempt + '/60, статус «' + lastStatus + '».');
    }
    if (lastStatus === 'done') {
      done = true;
      break;
    }
    if (lastStatus === 'failed') throw new Error('WB не смог сформировать отчёт остатков.');
  }
  if (!done) {
    throw new Error('WB не подготовил отчёт остатков за 180 секунд. Последний статус: «' +
      lastStatus + '». Попробуйте запустить ещё раз — иногда WB отвечает медленнее обычного.');
  }

  const rows = wbFetchJson_(
    WB_WAREHOUSE_REMAINS_URL_ + '/tasks/' + taskId + '/download',
    authOptions,
    3000,
  );
  if (rows === null) return [];
  if (!Array.isArray(rows)) throw new Error('WB изменил формат отчёта остатков на складах.');
  return wbExtractRfWarehouseStockProducts_(rows);
}

function wbExtractRfWarehouseStockProducts_(rows) {
  return (rows || []).map(function (row) {
    const quantity = (row.warehouses || []).reduce(function (sum, warehouse) {
      return warehouse.warehouseName === WB_RF_WAREHOUSE_NAME_
        ? sum + (Number(warehouse.quantity) || 0)
        : sum;
    }, 0);
    return {
      nmID: Number(row.nmId),
      vendorCode: String(row.vendorCode || ''),
      metrics: { stockCount: quantity },
    };
  });
}

/**
 * v1.0.2. Карта штрихкод → nmID нужна, потому что vendorCode в кабинете не уникален.
 * Source: https://dev.wildberries.ru/docs/openapi/work-with-products#tag/Kartochki-tovarov/operation/postContentV2GetCardsList
 */
function wbFetchBarcodeToNm_(token) {
  const limit = 100;
  let cursor = { limit: limit };
  const result = Object.create(null);

  while (true) {
    const json = wbFetchJson_(WB_CONTENT_CARDS_URL_, {
      method: 'post',
      headers: { Authorization: token },
      contentType: 'application/json',
      payload: JSON.stringify({
        settings: {
          sort: { ascending: true },
          cursor: cursor,
          filter: { withPhoto: -1 },
        },
      }),
      muteHttpExceptions: true,
    }, 650);
    const cards = json && Array.isArray(json.cards) ? json.cards : null;
    if (!cards) throw new Error('WB изменил формат списка карточек товаров.');
    cards.forEach(function (card) {
      (card.sizes || []).forEach(function (size) {
        (size.skus || []).forEach(function (barcode) {
          result[String(barcode)] = Number(card.nmID);
        });
      });
    });

    const responseCursor = json.cursor || {};
    if (Number(responseCursor.total) < limit) break;
    if (!responseCursor.updatedAt || !responseCursor.nmID) {
      throw new Error('WB не вернул курсор следующей страницы карточек.');
    }
    cursor = {
      limit: limit,
      updatedAt: responseCursor.updatedAt,
      nmID: responseCursor.nmID,
    };
    Utilities.sleep(650);
  }
  return result;
}

function wbFetchJson_(url, options, retryDelayMs) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (error) {
      if (attempt === 1) {
        Utilities.sleep(retryDelayMs);
        continue;
      }
      throw new Error('WB API: сетевая ошибка после повтора: ' + error.message);
    }
    const code = response.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(response.getContentText() || 'null');
    if (attempt === 1 && (code === 429 || code >= 500)) {
      Utilities.sleep(retryDelayMs);
      continue;
    }
    throw new Error('WB API HTTP ' + code + ': ' + response.getContentText().slice(0, 500));
  }
  throw new Error('WB API: исчерпаны попытки запроса.');
}

function wbIndexStockProducts_(items, skuRows) {
  return wbIndexProductMetric_(items, 'stockCount', skuRows);
}

/** v1.0.1. Заказы ровно в методике виджета «История остатков». */
function wbIndexOrdersProducts_(items, skuRows) {
  return wbIndexProductMetric_(items, 'ordersCount', skuRows);
}

function wbIndexProductMetric_(items, metricName, skuRows) {
  const result = Object.create(null);
  if (skuRows && skuRows.length) {
    const listedNm = Object.create(null);
    const rowsByNormalizedCode = Object.create(null);
    skuRows.forEach(function (row) {
      listedNm[row.nmID] = row.nmID;
      const normalized = wbNormalizeVendorCode_(row.vendorCode);
      if (!rowsByNormalizedCode[normalized]) rowsByNormalizedCode[normalized] = [];
      rowsByNormalizedCode[normalized].push(row.nmID);
    });
    (items || []).forEach(function (item) {
      const itemNm = Number(item.nmID);
      let targetNm = listedNm[itemNm] || 0;
      if (!targetNm) {
        const targets = rowsByNormalizedCode[wbNormalizeVendorCode_(item.vendorCode)] || [];
        if (targets.length === 1) targetNm = targets[0];
      }
      if (!targetNm) return;
      const count = Number(item.metrics && item.metrics[metricName]) || 0;
      result[targetNm] = (result[targetNm] || 0) + count;
    });
    return result;
  }
  (items || []).forEach(function (item) {
    const nmID = Number(item.nmID);
    if (!nmID) return;
    const count = Number(item.metrics && item.metrics[metricName]) || 0;
    result[nmID] = (result[nmID] || 0) + count;
  });
  return result;
}

/** v1.0.3. Служебные префиксы обозначают карточку/схему, а не другой товар. */
function wbNormalizeVendorCode_(value) {
  return String(value || '')
    .trim()
    .replace(/^(!FBS\s*|\(FBS\)|FBS!|FBS\s+)\s*/i, '')
    .replace(/^!+/, '')
    .trim()
    .toLowerCase();
}

function wbBuildSkuRows_(sheetRows, barcodeToNm, firstSheetRow) {
  const result = [];
  (sheetRows || []).forEach(function (row, index) {
    const vendorCode = String(row[0] || '').trim();
    const barcode = String(row[1] || '').trim();
    if (!barcode) return;
    result.push({
      sheetRow: firstSheetRow + index,
      vendorCode: vendorCode,
      barcode: barcode,
      nmID: Number(barcodeToNm[barcode]) || 0,
    });
  });
  return result;
}

/**
 * v1.2.0. Одна строка на позицию «Регламента»: артикул, штрихкод, nmID и все метрики.
 * v1.3.1. У строк без карточки на WB nmID пустой, а метрики нулевые — строка всё равно
 * присутствует, чтобы VLOOKUP по штрихкоду возвращал 0, а не #Н/Д.
 */
function wbBuildWbDataRows_(skuRows, fbsStocks, fboStocks, orderCounts, updatedAt) {
  return skuRows.map(function (row) {
    const fbsOrders = Number(orderCounts.fbs[row.nmID]) || 0;
    const fboOrders = Number(orderCounts.fbo[row.nmID]) || 0;
    return [
      row.vendorCode,
      row.barcode,
      row.nmID || '',
      Number(fbsStocks[row.nmID]) || 0,
      Number(fboStocks[row.nmID]) || 0,
      fbsOrders,
      fbsOrders / WB_ORDER_WINDOW_DAYS_,
      fboOrders,
      fboOrders / WB_ORDER_WINDOW_DAYS_,
      updatedAt,
    ];
  });
}

/** v1.2.0. Находит/создаёт лист-приёмник, чтобы «Регламент» больше не трогать. */
function wbGetOrCreateDataSheet_(ss) {
  let sheet = ss.getSheetByName(WB_DATA_SHEET_NAME_);
  if (!sheet) sheet = ss.insertSheet(WB_DATA_SHEET_NAME_);
  return sheet;
}

/** v1.2.0. Лист «WB Данные» целиком под управлением скрипта — просто перезаписываем таблицу. */
function wbWriteWbDataSheet_(sheet, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, WB_DATA_HEADERS_.length).setValues([WB_DATA_HEADERS_]);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, WB_DATA_HEADERS_.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
}

/** v1.2.1. Предупреждает, если ключ (штрихкод) для будущих VLOOKUP не уникален. */
function wbFindDuplicateBarcodes_(skuRows) {
  const seen = Object.create(null);
  const duplicates = Object.create(null);
  skuRows.forEach(function (row) {
    const key = row.barcode;
    if (!key) return;
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > 1) duplicates[key] = true;
  });
  return Object.keys(duplicates);
}

/** v1.3.1. Строки «Регламента», для штрихкода которых не нашлось карточки на WB. */
function wbFindUnmappedRows_(skuRows) {
  return skuRows.filter(function (row) { return !row.nmID; });
}

/**
 * v1.3.1. Останавливаемся только если не нашлось НИ ОДНОЙ карточки.
 *
 * Отдельные ненайденные строки — это норма (новинка без карточки, товар только
 * для Ozon, выведенная позиция). А вот ноль совпадений на весь лист означает
 * другое: не тот ключ WB, чужой кабинет или штрихкоды не из этого бренда —
 * тогда записывать нули во всю таблицу нельзя.
 */
function wbAssertAnyMapping_(skuRows, mappedRows) {
  if (!skuRows.length) throw new Error('В «Регламенте» не найдены товарные строки со штрихкодами.');
  if (!mappedRows.length) {
    throw new Error(
      'Ни один штрихкод из «Регламента» не найден среди карточек WB (' + skuRows.length +
        ' строк). Похоже, ключ WB API в «Технический»!B2 от другого кабинета либо ' +
        'штрихкоды в колонке B не от этого бренда. Лист не изменён.',
    );
  }
}

/** v1.3.1. Короткий человекочитаемый список проблемных строк для предупреждения. */
function wbDescribeUnmappedRows_(unmappedRows) {
  const shown = unmappedRows.slice(0, 15).map(function (row) {
    return 'строка ' + row.sheetRow + ' (' + (row.vendorCode || row.barcode) + ')';
  });
  const tail = unmappedRows.length > shown.length
    ? ' и ещё ' + (unmappedRows.length - shown.length)
    : '';
  return shown.join(', ') + tail;
}

function wbAssertEnoughMatches_(skuRows, index, label) {
  const matches = skuRows.filter(function (row) {
    return Object.prototype.hasOwnProperty.call(index, row.nmID);
  }).length;
  const minimum = Math.min(10, skuRows.length);
  if (matches < minimum) {
    throw new Error('Проверка ' + label + ' не пройдена: совпало ' + matches + ' из ' + skuRows.length + ' SKU.');
  }
}

function wbDeleteDailyTriggers_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === WB_DAILY_HANDLER_) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return removed;
}

function wbFormatMoscowDate_(date) {
  return Utilities.formatDate(date, WB_TIMEZONE_, 'yyyy-MM-dd');
}

function wbSumValues_(index) {
  return Object.keys(index).reduce(function (sum, key) { return sum + index[key]; }, 0);
}


/* ==================== 20_пульт.js ==================== */

/* ПУЛЬТ РЕГЛАМЕНТА WB — меню «по порядку работы», проверка связи, инструкция, статус,
   автообновление, новые товары, миграция листов.

   v1.0.0 — 25.09.2026. ПЕРВАЯ КНИГА РЕГЛАМЕНТА НА ПУЛЬТЕ.
   Сбор остатков и заказов (10_данные.js) и раскладка FBS (01–03_fbs_*.js) перенесены из
   книжных скриптов без изменения логики. Этот файл — всё, что делает из них пульт:
   • rgCheckConnection — один fetchAll без ретраев: ключ, срок, категории, право записи;
   • rgHelp / rgStatus — окна из кода, статус называет ОДНО следующее действие человека;
   • rgInstallTriggers — оба ежедневных запуска одной кнопкой (06:45 FBS, 07:15 WB);
   • rgAddNewItems — новые карточки кабинета дописываются в «Регламент» с формулами
     строки-образца (R1C1 из самой книги — формулы не зависят от локали);
   • upgradeSheets — служебные листы и порядок листов без боевого прогона. */

var RG_ITEMS_SHEET = 'Регламент';
var RG_TECH_SHEET = 'Технический';
var RG_1C_SHEET = '1С';
var RG_ITEMS_FIRST_ROW = 3;
var RG_SHEET_ORDER = ['Регламент', '1С', 'WB Данные', 'WB Склады FBS', '_лог FBS', 'Технический'];

/** Подписи служебного листа. Значения (ключи) в коде не живут никогда. */
var RG_TECH_LABELS = [
  ['WB API', ''],
  ['↑ ключ WB в B2: все категории, без галки «только на чтение»', ''],
  ['Базовый склад FBS (пусто = «Мой склад»)', ''],
  ['GitHub-токен (пусто, пока репозиторий кода открыт)', '']
];

var RG_PINGS = [
  { key: 'content', name: 'Контент — карточки и штрихкоды',
    url: 'https://content-api.wildberries.ru/ping' },
  { key: 'analytics', name: 'Аналитика — заказы и остатки FBS/FBO',
    url: 'https://seller-analytics-api.wildberries.ru/ping' },
  { key: 'marketplace', name: 'Маркетплейс — склады FBS и заливка остатков',
    url: 'https://marketplace-api.wildberries.ru/api/v3/warehouses' }
];

/** Биты поля `s` токена WB → категории. Бит 30 — «только на чтение». */
var RG_TOKEN_BITS = { 1: 'Контент', 2: 'Аналитика', 3: 'Цены и скидки', 4: 'Маркетплейс',
  5: 'Статистика', 6: 'Продвижение', 7: 'Вопросы и отзывы', 9: 'Чат', 10: 'Поставки',
  11: 'Возвраты', 12: 'Документы', 13: 'Финансы', 16: 'Пользователи' };
var RG_NEED_BITS = [1, 2, 4];

/* ---------- ключ ---------- */

function rgBook_() { return wbSpreadsheet_(); }

function rgToken_() {
  var tech = rgBook_().getSheetByName(RG_TECH_SHEET);
  return tech ? String(tech.getRange('B2').getValue() || '').trim() : '';
}

/**
 * v1.0.0. Что написано в самом токене — без запроса к WB: срок, категории, «только чтение».
 * Токен WB — JWT, полезная нагрузка во второй части base64url.
 */
function rgTokenInfo_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    var b64 = parts[1] + '===='.slice(0, (4 - parts[1].length % 4) % 4);
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64)).getDataAsString('UTF-8');
    var p = JSON.parse(json);
    var s = Number(p.s) || 0;
    var cats = [], missing = [];
    Object.keys(RG_TOKEN_BITS).forEach(function (bit) {
      if (Math.floor(s / Math.pow(2, Number(bit))) % 2 === 1) cats.push(RG_TOKEN_BITS[bit]);
    });
    RG_NEED_BITS.forEach(function (bit) {
      if (Math.floor(s / Math.pow(2, bit)) % 2 !== 1) missing.push(RG_TOKEN_BITS[bit]);
    });
    var exp = p.exp ? new Date(Number(p.exp) * 1000) : null;
    return {
      exp: exp,
      daysLeft: exp ? Math.floor((exp.getTime() - Date.now()) / (24 * 3600 * 1000)) : null,
      categories: cats,
      missing: missing,
      readOnly: Math.floor(s / Math.pow(2, 30)) % 2 === 1
    };
  } catch (e) {
    return null;
  }
}

/* ---------- 🔌 проверка связи ---------- */

/**
 * v1.0.0. Без ретраев: один fetchAll, код ответа сам становится диагнозом (ПУЛЬТ §2).
 * Диагностика, которая умеет ждать, умирает по лимиту времени и выглядит как «кнопка
 * не работает». Право записи показывается ДО красной кнопки.
 */
function rgCheckConnection() {
  var token = rgToken_();
  var rows = [];
  if (!token) {
    return rgWindow_('🔌 Проверка связи', [
      ['Ключ WB', 'нет', 'Лист «' + RG_TECH_SHEET + '», ячейка B2 пустая. Вставьте ключ кабинета.', 'bad']
    ], 'Вставьте ключ WB в «' + RG_TECH_SHEET + '»!B2 и повторите проверку.');
  }

  var info = rgTokenInfo_(token);
  if (!info) {
    rows.push(['Ключ WB', 'не читается', 'В B2 лежит не токен WB (не три части через точку).', 'bad']);
  } else {
    var expText = info.exp ? Utilities.formatDate(info.exp, WB_TIMEZONE_, 'dd.MM.yyyy') : '—';
    rows.push(['Срок ключа', expText,
      info.daysLeft === null ? 'срок не указан' :
        info.daysLeft < 0 ? 'ключ ПРОСРОЧЕН — выпустите новый в кабинете WB' :
        'осталось ' + info.daysLeft + ' дн.', info.daysLeft !== null && info.daysLeft < 14 ? 'bad' : 'ok']);
    rows.push(['Категории', info.categories.join(', ') || '—',
      info.missing.length ? 'НЕ ХВАТАЕТ: ' + info.missing.join(', ') : 'всё нужное есть',
      info.missing.length ? 'bad' : 'ok']);
    rows.push(['Право записи', info.readOnly ? 'нет' : 'есть',
      info.readOnly ? 'ключ «только на чтение»: 3️⃣ 🔴 залить остатки не сможет'
                    : 'заливка остатков FBS (3️⃣ 🔴) доступна', info.readOnly ? 'bad' : 'ok']);
  }

  var responses;
  try {
    responses = UrlFetchApp.fetchAll(RG_PINGS.map(function (p) {
      return { url: p.url, method: 'get', headers: { Authorization: token }, muteHttpExceptions: true };
    }));
  } catch (e) {
    rows.push(['Сеть', 'ошибка', String(e.message || e).slice(0, 200), 'bad']);
    responses = [];
  }
  var warehouses = null;
  responses.forEach(function (resp, i) {
    var code = resp.getResponseCode();
    var ok = code >= 200 && code < 300;
    var comment = ok ? 'отвечает' : rgHttpDiagnosis_(code);
    if (ok && RG_PINGS[i].key === 'marketplace') {
      try { warehouses = JSON.parse(resp.getContentText() || '[]'); } catch (e) { warehouses = null; }
      if (warehouses) {
        var base = rgBaseWarehouse_();
        var hasBase = warehouses.some(function (w) { return fbsNormName_(w.name) === fbsNormName_(base); });
        comment = 'складов FBS: ' + warehouses.length + '; базовый «' + base + '» ' +
          (hasBase ? 'найден' : 'НЕ НАЙДЕН — впишите точное имя в «' + RG_TECH_SHEET + '»!B3');
        if (!hasBase) ok = false;
      }
    }
    rows.push([RG_PINGS[i].name, String(code), comment, ok ? 'ok' : 'bad']);
  });

  var bad = rows.filter(function (r) { return r[3] === 'bad'; }).length;
  return rgWindow_('🔌 Проверка связи', rows,
    bad ? 'Есть проблемы: ' + bad + '. Исправьте отмеченное красным и повторите проверку.'
        : 'Связь в порядке — можно работать по меню сверху вниз.');
}

function rgHttpDiagnosis_(code) {
  if (code === 401) return 'ключ не принят: неверный, отозван или без этой категории';
  if (code === 403) return 'доступ запрещён: у ключа нет этой категории';
  if (code === 429) return 'лимит запросов WB — повторите проверку через минуту';
  if (code >= 500) return 'WB сейчас не отвечает — повторите позже';
  return 'неожиданный ответ WB';
}

/** Базовый склад: «Технический» B3, пусто — значение лоадера (по умолчанию «Мой склад»). */
function rgBaseWarehouse_() {
  var tech = rgBook_().getSheetByName(RG_TECH_SHEET);
  var cell = tech ? String(tech.getRange('B3').getValue() || '').trim() : '';
  if (cell) return cell;
  return typeof FBSD_BASE_WAREHOUSE !== 'undefined' ? FBSD_BASE_WAREHOUSE : 'Мой склад';
}

/* ---------- ⏰ автообновление ---------- */

/** v1.0.0. Оба ежедневных запуска одной кнопкой: 06:45 раскладка FBS, 07:15 заказы и остатки. */
function rgInstallTriggers() {
  installWbWarehousesDailyTriggerSilent();
  installWbDailyTriggerSilent();
  fbsAlert_('Автообновление включено',
    'Каждое утро книга обновится сама:\n' +
    '• около 06:45 — лист «WB Склады FBS»: заказы и остатки по складам, новый план раскладки ' +
    '(в кабинет WB ничего не пишет);\n' +
    '• около 07:15 — лист «WB Данные» и вместе с ним «Регламент»: заказы за 5 дней и остатки FBS/FBO.\n\n' +
    'Google запускает с допуском ±15 минут. Заливка плана FBS в WB остаётся ручной кнопкой 3️⃣ 🔴.');
}

function rgRemoveTriggers() {
  var n = fbsDeleteDailyTriggers_() + wbDeleteDailyTriggers_();
  fbsAlert_('Автообновление', n ? 'Ежедневные запуски отключены (' + n + ').' : 'Ежедневных запусков не было.');
}

function rgTriggersState_() {
  var state = { fbs: false, data: false };
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === FBSD_DAILY_HANDLER) state.fbs = true;
    if (t.getHandlerFunction() === WB_DAILY_HANDLER_) state.data = true;
  });
  return state;
}

/* ---------- ➕ новые товары из кабинета ---------- */

/** v1.0.0. Все карточки кабинета: nmID, артикул продавца, штрихкоды. */
function rgFetchCards_(token) {
  var limit = 100;
  var cursor = { limit: limit };
  var out = [];
  while (true) {
    var json = wbFetchJson_(WB_CONTENT_CARDS_URL_, {
      method: 'post',
      headers: { Authorization: token },
      contentType: 'application/json',
      payload: JSON.stringify({ settings: { sort: { ascending: true }, cursor: cursor, filter: { withPhoto: -1 } } }),
      muteHttpExceptions: true
    }, 650);
    var cards = json && Array.isArray(json.cards) ? json.cards : null;
    if (!cards) throw new Error('WB изменил формат списка карточек товаров.');
    cards.forEach(function (card) {
      var barcodes = [];
      (card.sizes || []).forEach(function (size) {
        (size.skus || []).forEach(function (b) { barcodes.push(String(b)); });
      });
      out.push({ nmID: Number(card.nmID), vendorCode: String(card.vendorCode || ''), barcodes: barcodes });
    });
    var rc = json.cursor || {};
    if (Number(rc.total) < limit) break;
    if (!rc.updatedAt || !rc.nmID) throw new Error('WB не вернул курсор следующей страницы карточек.');
    cursor = { limit: limit, updatedAt: rc.updatedAt, nmID: rc.nmID };
    Utilities.sleep(650);
  }
  return out;
}

/**
 * v1.0.0. Какой из штрихкодов карточки ставить в колонку B. У карточки их бывает три:
 * EAN-13 производителя, он же с ведущим нулём и внутренний код WB «20…». Нужен EAN-13
 * производителя — по нему строку узнают в 1С и на складе.
 */
function rgPickBarcode_(barcodes) {
  var list = (barcodes || []).map(String);
  var i;
  for (i = 0; i < list.length; i++) if (/^4\d{12}$/.test(list[i])) return list[i];
  for (i = 0; i < list.length; i++) if (/^0\d{13}$/.test(list[i])) return list[i].slice(1);
  for (i = 0; i < list.length; i++) if (/^\d{13}$/.test(list[i])) return list[i];
  return list[0] || '';
}

/** v1.0.0. Карточки, которых нет в «Регламенте» ни по одному штрихкоду. Чистая функция. */
function rgNewCards_(cards, sheetBarcodes) {
  var have = Object.create(null);
  (sheetBarcodes || []).forEach(function (b) {
    var s = String(b || '').trim();
    if (!s) return;
    have[s] = true;
    have[s.replace(/^0+/, '')] = true;
  });
  return (cards || []).filter(function (card) {
    return !card.barcodes.some(function (b) { return have[b] || have[String(b).replace(/^0+/, '')]; });
  }).map(function (card) {
    return { nmID: card.nmID, vendorCode: card.vendorCode, barcode: rgPickBarcode_(card.barcodes) };
  }).filter(function (c) { return c.barcode; })
    .sort(function (a, b) { return a.vendorCode < b.vendorCode ? -1 : a.vendorCode > b.vendorCode ? 1 : 0; });
}

/** Последняя строка товара «Регламента» (со штрихкодом в B). 0 — товаров нет. */
function rgLastItemRow_(sheet) {
  var last = sheet.getLastRow();
  if (last < RG_ITEMS_FIRST_ROW) return 0;
  var vals = sheet.getRange(RG_ITEMS_FIRST_ROW, 2, last - RG_ITEMS_FIRST_ROW + 1, 1).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (/^\d{6,}$/.test(String(vals[i][0]).trim())) return RG_ITEMS_FIRST_ROW + i;
  }
  return 0;
}

/**
 * v1.0.0. Дописывает в «Регламент» карточки кабинета, которых там нет. Пишет только в свою
 * книгу — поэтому без 🔴. Формулы берутся R1C1 из последней строки товара: так они
 * сдвигаются на новую строку и не зависят от локали книги (разделитель, имена функций).
 * Ручные колонки образца (числа, текст) не копируются — только формулы.
 */
function rgAddNewItems() {
  var token = rgToken_();
  if (!token) throw new Error('Пустой ключ WB в «' + RG_TECH_SHEET + '»!B2.');
  var ss = rgBook_();
  var sheet = ss.getSheetByName(RG_ITEMS_SHEET);
  if (!sheet) throw new Error('Нет листа «' + RG_ITEMS_SHEET + '». Запустите ⚙️ Обновить настройки таблицы.');

  var lastItem = rgLastItemRow_(sheet);
  var have = lastItem
    ? sheet.getRange(RG_ITEMS_FIRST_ROW, 2, lastItem - RG_ITEMS_FIRST_ROW + 1, 1).getDisplayValues()
        .map(function (r) { return r[0]; })
    : [];
  var fresh = rgNewCards_(rgFetchCards_(token), have);
  if (!fresh.length) {
    fbsAlert_('Новые товары', 'Все карточки кабинета уже есть в «' + RG_ITEMS_SHEET + '». Ничего не добавлено.');
    return { added: 0 };
  }

  var width = sheet.getLastColumn();
  var start = lastItem ? lastItem + 1 : RG_ITEMS_FIRST_ROW;
  if (lastItem && lastItem < sheet.getLastRow()) {
    sheet.insertRowsAfter(lastItem, fresh.length);          // под товарами есть «ИТОГО»/сеты — не затираем
  } else if (start + fresh.length - 1 > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), start + fresh.length - 1 - sheet.getMaxRows());
  }
  var ab = sheet.getRange(start, 1, fresh.length, 2);
  sheet.getRange(start, 2, fresh.length, 1).setNumberFormat('@');   // формат ДО значения (ПУЛЬТ §6)
  ab.setValues(fresh.map(function (c) { return [c.vendorCode, c.barcode]; }));

  var copied = 0;
  if (lastItem && width > 2) {
    var tpl = sheet.getRange(lastItem, 3, 1, width - 2).getFormulasR1C1()[0];
    for (var c = 0; c < tpl.length; c++) {
      if (!tpl[c]) continue;
      var col = sheet.getRange(start, 3 + c, fresh.length, 1);
      col.setFormulasR1C1(fresh.map(function () { return [tpl[c]]; }));
      copied++;
    }
  }
  SpreadsheetApp.flush();
  var list = fresh.slice(0, 15).map(function (c) { return '• ' + c.vendorCode; }).join('\n') +
    (fresh.length > 15 ? '\n… и ещё ' + (fresh.length - 15) : '');
  fbsAlert_('Новые товары',
    'Добавлено в «' + RG_ITEMS_SHEET + '»: ' + fresh.length + ' (строки ' + start + '–' + (start + fresh.length - 1) + ').\n' +
    list + '\n\n' +
    (copied ? 'Формулы (' + copied + ' колонок) скопированы со строки ' + lastItem + '.'
            : 'Строки-образца с формулами не было — формулы в новые строки нужно протянуть руками.') +
    '\nОстатки 1С, комментарий производства и поставки заполните сами. Цифры WB появятся после 1️⃣.');
  return { added: fresh.length, formulas: copied };
}

/* ---------- ⚙️ обновить настройки таблицы ---------- */

/** v1.0.0. Служебные листы и порядок листов. Боевых запросов и записи в WB нет. */
function upgradeSheets() {
  var ss = rgBook_();
  var done = [];
  var tech = ss.getSheetByName(RG_TECH_SHEET);
  if (!tech) { tech = ss.insertSheet(RG_TECH_SHEET); done.push('создан лист «' + RG_TECH_SHEET + '»'); }
  var labels = tech.getRange(1, 1, RG_TECH_LABELS.length, 1).getValues();
  RG_TECH_LABELS.forEach(function (pair, i) {
    if (!String(labels[i][0] || '').trim()) { tech.getRange(i + 1, 1).setValue(pair[0]); }
  });
  if (!tech.isSheetHidden()) { tech.hideSheet(); done.push('лист «' + RG_TECH_SHEET + '» скрыт'); }
  if (!ss.getSheetByName(RG_1C_SHEET)) {
    var one = ss.insertSheet(RG_1C_SHEET);
    one.getRange(1, 1).setNote('Сюда вставляется выгрузка остатков из 1С как есть: A — артикул (как в «Регламенте»), ' +
      'G — остаток КА, H — остаток ERP. «Регламент» берёт их формулами в колонки D и E.');
    done.push('создан лист «' + RG_1C_SHEET + '»');
  }
  if (!ss.getSheetByName(RG_ITEMS_SHEET)) {
    ss.insertSheet(RG_ITEMS_SHEET, 0);
    done.push('создан пустой лист «' + RG_ITEMS_SHEET + '» — заголовки и формулы заводит tools/seed_book.py');
  }
  var pos = 1;
  RG_SHEET_ORDER.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(pos++);
  });
  ss.setActiveSheet(ss.getSheetByName(RG_ITEMS_SHEET));
  fbsAlert_('Настройки таблицы', done.length ? 'Сделано:\n• ' + done.join('\n• ') : 'Всё уже в порядке, ничего не менял.');
  return done;
}

/* ---------- 📊 что сейчас происходит ---------- */

/** Дата из ячейки: у книги она то Date, то строка «dd.MM.yyyy HH:mm». */
function rgParseStamp_(v) {
  if (v instanceof Date) return v;
  var m = String(v || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  // Время в книге — московское; UTC+3 без перехода на летнее время.
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) - 3, Number(m[5])));
}

function rgAgeText_(d) {
  if (!d) return 'ни разу';
  var h = Math.floor((Date.now() - d.getTime()) / 3600000);
  var when = Utilities.formatDate(d, WB_TIMEZONE_, 'dd.MM.yyyy HH:mm');
  return when + (h < 1 ? ' (только что)' : h < 48 ? ' (' + h + ' ч назад)' : ' (' + Math.floor(h / 24) + ' дн. назад)');
}

/**
 * v1.0.0. Снимок книги и ОДНО действие, которое сейчас нужно от человека (ПУЛЬТ §2).
 * Чистая часть — rgNextAction_, её гоняют тесты.
 */
function rgStatus(version) {
  var ss = rgBook_();
  var s = { token: !!rgToken_() };
  var items = ss.getSheetByName(RG_ITEMS_SHEET);
  s.items = 0;
  s.no1c = 0;
  if (items) {
    var last = rgLastItemRow_(items);
    if (last) {
      var vals = items.getRange(RG_ITEMS_FIRST_ROW, 1, last - RG_ITEMS_FIRST_ROW + 1, 5).getValues();
      vals.forEach(function (r) {
        if (!/^\d{6,}$/.test(String(r[1]).trim())) return;
        s.items++;
        if (!(Number(r[3]) || Number(r[4]))) s.no1c++;
      });
    }
  }
  var data = ss.getSheetByName(WB_DATA_SHEET_NAME_);
  s.dataAt = data && data.getLastRow() >= 2 ? rgParseStamp_(data.getRange(2, 10).getValue()) : null;
  var fbs = ss.getSheetByName(FBSD_SHEET);
  s.fbsAt = fbs ? rgParseStamp_(fbs.getRange(1, 6).getValue()) : null;
  s.fbsStatus = fbs ? String(fbs.getRange(1, 8).getValue() || '') : '';
  var tr = rgTriggersState_();
  s.triggers = tr.fbs && tr.data;
  s.triggersPartial = tr.fbs !== tr.data;

  var rows = [
    ['Ключ WB', s.token ? 'есть' : 'нет', s.token ? 'проверить срок и права — 🔌 Проверка связи' : '«' + RG_TECH_SHEET + '»!B2 пустая', s.token ? 'ok' : 'bad'],
    ['Товаров в «Регламенте»', String(s.items), s.items ? '' : 'нет строк со штрихкодом', s.items ? 'ok' : 'bad'],
    ['Остатки 1С', s.items ? (s.items - s.no1c) + ' из ' + s.items : '—',
      s.no1c ? 'без остатка 1С: ' + s.no1c + ' — вставьте выгрузку на лист «1С»' : 'заполнены', s.no1c ? 'warn' : 'ok'],
    ['WB Данные (1️⃣)', rgAgeText_(s.dataAt), 'заказы за 5 дней и остатки FBS/FBO', rgFresh_(s.dataAt) ? 'ok' : 'warn'],
    ['Раскладка FBS (2️⃣)', rgAgeText_(s.fbsAt), s.fbsStatus || '—', rgFresh_(s.fbsAt) ? 'ok' : 'warn'],
    ['Автообновление', s.triggers ? 'включено' : s.triggersPartial ? 'включено частично' : 'выключено',
      '06:45 раскладка FBS, 07:15 заказы и остатки', s.triggers ? 'ok' : 'warn']
  ];
  return rgWindow_('📊 Что сейчас происходит', rows, rgNextAction_(s), version);
}

function rgFresh_(d) { return !!d && Date.now() - d.getTime() < 26 * 3600000; }

/** v1.0.0. Одно следующее действие. Порядок — от того, без чего не работает ничего. */
function rgNextAction_(s) {
  if (!s.token) return 'Вставьте ключ WB в скрытый лист «' + RG_TECH_SHEET + '», ячейка B2, и нажмите 🔌 Проверка связи.';
  if (!s.items) return 'В «' + RG_ITEMS_SHEET + '» нет товаров: 🛠 Ручной режим → ➕ Дописать новые товары из кабинета.';
  if (!rgFresh_(s.dataAt)) return 'Нажмите 1️⃣ — обновить заказы и остатки WB.';
  if (!s.triggers) return 'Включите автообновление: 🛠 Ручной режим → ⏰ Включить автообновление.';
  if (s.items && s.no1c === s.items) return 'Вставьте выгрузку остатков из 1С на лист «' + RG_1C_SHEET + '» — сейчас «Доступный остаток» считается без неё.';
  if (/не отправлено/i.test(s.fbsStatus || '')) {
    return 'План раскладки FBS посчитан, но в WB не отправлен. Проверьте лист «' + FBSD_SHEET +
      '» и, когда план верный, нажмите 3️⃣ 🔴. Если сегодня перемещений не было — ничего делать не нужно.';
  }
  return 'Ничего делать не нужно: книга обновляется сама каждое утро.';
}

/* ---------- окна ---------- */

function rgEsc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** {html, text}: окно рисует лоадер, text — запасной вариант для ui.alert (ПУЛЬТ §3). */
function rgWindow_(title, rows, action, version) {
  var color = { ok: '#1e8e3e', warn: '#b06000', bad: '#d93025' };
  var html = '<div style="font:14px/1.45 Arial,sans-serif;color:#202124">' +
    '<table style="border-collapse:collapse;width:100%">' +
    rows.map(function (r) {
      return '<tr style="border-bottom:1px solid #e0e0e0">' +
        '<td style="padding:6px 8px;font-weight:bold;white-space:nowrap">' + rgEsc_(r[0]) + '</td>' +
        '<td style="padding:6px 8px;color:' + (color[r[3]] || '#202124') + ';white-space:nowrap">' + rgEsc_(r[1]) + '</td>' +
        '<td style="padding:6px 8px;color:#5f6368">' + rgEsc_(r[2]) + '</td></tr>';
    }).join('') + '</table>' +
    '<div style="margin-top:14px;padding:10px 12px;background:#e8f0fe;border-radius:6px">' +
    '<b>Что сделать сейчас:</b> ' + rgEsc_(action) + '</div>' +
    (version ? '<div style="margin-top:10px;color:#9aa0a6;font-size:12px">' + rgEsc_(version) + '</div>' : '') +
    '</div>';
  var text = rows.map(function (r) { return r[0] + ': ' + r[1] + (r[2] ? ' — ' + r[2] : ''); }).join('\n') +
    '\n\nЧто сделать сейчас: ' + action;
  return { html: html, text: text, title: title };
}

/* ---------- 📖 как работать ---------- */

/** v1.0.0. Инструкция описывает ВЕСЬ текущий функционал и живёт в коде рядом с ним (ПУЛЬТ §4). */
function rgHelp(version) {
  var steps = [
    ['1️⃣ 🔄 Обновить заказы и остатки WB',
     'Лист «WB Данные» перезаписывается целиком: остаток FBS (склады продавца), остаток FBO (только графа ' +
     '«Склад WB РФ»), заказы FBS и FBO за 5 предыдущих завершённых дней и среднее в день. «Регламент» ' +
     'подтягивает их формулами по артикулу (колонка A). Идёт 1–4 минуты: WB разрешает один отчёт в 20 секунд.'],
    ['2️⃣ 🧮 Раскладка FBS: обновить лист и рассчитать план',
     'Лист «WB Склады FBS»: по каждому товару заказы и остаток на каждом виртуальном складе WB и план — ' +
     'сколько поставить на склад. Каждому складу сначала неснижаемый остаток (строка 1, D1), дальше ' +
     'цель = продажи склада в день × горизонт (B1). Излишек уходит на базовый склад. В WB ничего не пишет.'],
    ['3️⃣ 🔴 Раскладка FBS: залить план в WB',
     'Пересчитывает план заново, показывает, сколько складов и позиций изменится, и после «Да» записывает ' +
     'остатки в кабинет WB. Каждое изменение пишется в журнал «_лог FBS» (было → стало).']
  ];
  var manual = [
    ['Лист «1С»', 'вставить выгрузку остатков из 1С как есть: A — артикул как в «Регламенте», G — остаток КА, H — ERP. ' +
      'В «Регламенте» это колонки D и E, «Доступный остаток» (C) = D − F.'],
    ['«Регламент», колонка G', 'комментарий с производства (статус партии, дата отгрузки).'],
    ['«Регламент», колонки P–S', 'поставки на FBO: количество и дата, №1 и №2. Из них считаются «Остаток после отгрузки» и дни.'],
    ['«Регламент», колонка Y', 'кратность короба: по ней округляется «Потребность FBO на 30 дней».'],
    ['«WB Склады FBS», D «Привезли (±)»', 'сколько штук физически привезли на FBS-склад (минус — забрали). ' +
      'Очищается после успешной заливки 3️⃣.'],
    ['«WB Склады FBS», E «Факт на FBS (=)»', 'если знаете точный остаток на складе — он заменяет живые остатки WB.'],
    ['«WB Склады FBS», F «Долг из 1С (+)»', 'положить на витрину авансом то, что ещё не перевезено; висит в «Ждёт перемещения», пока не приедет.']
  ];
  var html = '<div style="font:14px/1.5 Arial,sans-serif;color:#202124">' +
    '<div style="padding:10px 12px;background:#fce8e6;border-left:4px solid #d93025;margin-bottom:12px">' +
    '<b>Одно правило:</b> 3️⃣ 🔴 записывает остатки в кабинет WB. Перед ней посмотрите план на листе ' +
    '«WB Склады FBS» и впишите, что реально привезли. Всё остальное меню ничего наружу не пишет.</div>' +
    '<h3 style="margin:8px 0">Меню «📦 Регламент WB» — сверху вниз</h3><ol style="padding-left:20px">' +
    steps.map(function (s) { return '<li style="margin-bottom:8px"><b>' + rgEsc_(s[0]) + '</b><br>' + rgEsc_(s[1]) + '</li>'; }).join('') +
    '</ol><p><b>Каждое утро само</b> (после 🛠 → ⏰ Включить автообновление): около 06:45 — пункт 2️⃣, около ' +
    '07:15 — пункт 1️⃣. Заливка 3️⃣ всегда только руками.</p>' +
    '<h3 style="margin:8px 0">Что заполняете вы</h3><table style="border-collapse:collapse;width:100%">' +
    manual.map(function (m) {
      return '<tr style="border-bottom:1px solid #e0e0e0"><td style="padding:5px 8px;font-weight:bold;white-space:nowrap;vertical-align:top">' +
        rgEsc_(m[0]) + '</td><td style="padding:5px 8px">' + rgEsc_(m[1]) + '</td></tr>';
    }).join('') + '</table>' +
    '<p>Остальные колонки считают формулы и скрипт — их не трогайте, колонки не переставляйте.</p>' +
    '<h3 style="margin:8px 0">Остальные пункты</h3><ul style="padding-left:20px">' +
    '<li><b>📊 Что сейчас происходит</b> — когда что обновлялось и одно действие, которое нужно сейчас.</li>' +
    '<li><b>🔌 Проверка связи</b> — ключ WB: срок, категории, право записи, ответы WB.</li>' +
    '<li><b>🛠 → ➕ Дописать новые товары из кабинета</b> — новые карточки WB встают в конец «Регламента» с формулами.</li>' +
    '<li><b>🛠 → ⏰ Включить / отключить автообновление</b>.</li>' +
    '<li><b>⚙️ Обновить настройки таблицы</b> — служебные листы и порядок листов, без обновления данных.</li></ul>' +
    '<h3 style="margin:8px 0">Если что-то пошло не так</h3><ol style="padding-left:20px">' +
    '<li>Откройте 📊 Что сейчас происходит — там написано, что делать.</li>' +
    '<li>Ошибка про ключ или 401 — 🔌 Проверка связи покажет, чего не хватает.</li>' +
    '<li>«Без карточки на WB» после 1️⃣ — у строки штрихкод не из этого кабинета; для новинок это нормально.</li>' +
    '<li>Не помогло — пришлите разработчику текст ошибки и строку из ℹ️ Версия кода.</li></ol>' +
    (version ? '<div style="margin-top:10px;color:#9aa0a6;font-size:12px">' + rgEsc_(version) + '</div>' : '') + '</div>';
  var text = 'Меню сверху вниз:\n' + steps.map(function (s) { return s[0] + ' — ' + s[1]; }).join('\n\n') +
    '\n\nЗаполняете вы:\n' + manual.map(function (m) { return '• ' + m[0] + ': ' + m[1]; }).join('\n') +
    '\n\nПравило: 3️⃣ 🔴 пишет остатки в кабинет WB — сначала проверьте план.';
  return { html: html, text: text };
}


/* ==================== 99_экспорт.js ==================== */

// Для тестов в Node. В Apps Script `module` не существует — блок не выполняется.
if (typeof module !== 'undefined') {
  module.exports = Object.assign(module.exports || {}, {
    rgTokenInfo_: rgTokenInfo_, rgPickBarcode_: rgPickBarcode_, rgNewCards_: rgNewCards_,
    rgNextAction_: rgNextAction_, rgParseStamp_: rgParseStamp_, rgWindow_: rgWindow_,
    rgCheckConnection: rgCheckConnection, rgAddNewItems: rgAddNewItems, rgStatus: rgStatus,
    rgHelp: rgHelp, upgradeSheets: upgradeSheets, rgInstallTriggers: rgInstallTriggers,
    wbBuildWbDataRows_: wbBuildWbDataRows_, wbBuildSkuRows_: wbBuildSkuRows_
  });
}
