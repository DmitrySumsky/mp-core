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
