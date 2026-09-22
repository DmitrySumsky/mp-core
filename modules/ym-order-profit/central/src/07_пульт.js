/* ПУЛЬТ: «📖 Как работать», «📊 Что сейчас происходит», «🔌 Проверка связи», «⚙️ Обновить настройки таблицы».
 * Окна рисует лоадер (HtmlService доступен только статическому коду книги): здесь — { html, text }. */

function dlgCss_() {
  return '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.55;margin:0;padding:18px;color:#202124}' +
    'h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 6px;font-size:14.5px}' +
    'ol,ul{margin:6px 0 6px 18px;padding:0}li{margin-bottom:6px}' +
    '.red{color:#C5221F;font-weight:600}.ok{color:#188038;font-weight:600}' +
    '.box{background:#F5F5F5;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.act{background:#E8F0FE;border-radius:6px;padding:10px 12px;margin:10px 0;font-weight:600}' +
    '.warn{background:#FCE8E6;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.muted{color:#666}' +
    'table{border-collapse:collapse;margin:8px 0;width:100%}' +
    'td,th{border:1px solid #DADCE0;padding:5px 8px;text-align:left;font-size:13px;vertical-align:top}' +
    'th{background:#F1F3F4}a{color:#1A73E8}pre{white-space:pre-wrap;font-size:12px;margin:0}' +
    '</style>';
}

function htmlEsc_(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function yopTable_(head, rows) {
  return '<table><tr>' + head.map(function (h) { return '<th>' + htmlEsc_(h) + '</th>'; }).join('') + '</tr>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
    '</table>';
}

/** 📖 Как работать. */
function yopHelp(version) {
  var steps = [
    '<b>1️⃣ Посчитать за вчера</b> — докачать заказы и отчёт «Стоимость услуг» по вчера, взять цены и остатки, ' +
      'переписать листы «' + YOP_SH.detail + '», «' + YOP_SH.days + '» (новый день сверху, факт по старым дням) и «' + YOP_SH.unit + '». ' +
      'Крупные кабинеты идут несколько минут: прогон продолжает сам себя, ничего нажимать не нужно.',
    '<b>2️⃣ Обновить юнитку</b> — только свежие цены и остатки, лист «' + YOP_SH.unit + '». Заказы не качаются.',
    '<b>⏰ Автопрогон</b> (🛠 Ручной режим) — то же, что 1️⃣, каждое утро около 07:10. Включается один раз.'
  ];
  var cols = [
    ['«' + YOP_SH.detail + '»', 'синие G–O — коэффициенты модели; поменяли — ЧП в строке пересчиталась. Лист переписывается каждым прогоном.'],
    ['«' + YOP_SH.days + '»', 'O — ЧП заказов дня (прогноз); P–S — реклама за показы, хранение, подписка, прочее — факт начисления дня; ' +
      'U — налог 25 % от маржи; X–Z — факт по дням старше ' + YOP.FACT_AGE + ' дней и доля заказов с известной судьбой.'],
    ['«' + YOP_SH.unit + '»', 'синие G (цена для расчёта) и M–W (коэффициенты) — можно менять руками: впишите цену и увидите ЧП на штуку. ' +
      'Серые — реклама за показы, делится условно.'],
    ['«' + YOP_SH.settings + '»', 'кабинеты: «Лист юнитки», «Считать», «Тариф комиссии вручную, %» и «с даты заказа» — на случай смены ' +
      'комиссии Маркетом: расчёт сразу идёт по новому тарифу.'],
    ['«' + YOP_SH.cogs + '»', 'себес там, где юнитки нет или коды артикулов не совпадают: кабинет | артикул магазина | себес. ' +
      'Главнее юнитки. «НЕТ — себес 0» в колонке «Себес найден» — артикул, который надо сюда добавить.']
  ];
  var html = dlgCss_() + '<h2>ЧП ЯМ по заказам — как работать</h2>' +
    '<p class="muted">Код: ' + htmlEsc_(version || YOP_VERSION) + '. Логика и формулы — «' + YOP_SH.help + '» и ' +
    '<a href="' + YOP_CODE_URL + '" target="_blank">код в репозитории</a>.</p>' +
    '<h3>Кнопки</h3><ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
    '<div class="warn"><b>Не редактируйте строки прошлых дней на «' + YOP_SH.days + '» и не вставляйте туда свои строки</b>: ' +
    'прогон ищет дни по колонке A и дописывает факт в X–Z.</div>' +
    '<h3>Что где</h3>' + yopTable_(['Лист', 'Что делать человеку'], cols.map(function (c) { return [htmlEsc_(c[0]), htmlEsc_(c[1])]; })) +
    '<h3>Новый кабинет</h3><ol><li>Строка на листе «' + YOP_SH.keys + '»: имя кабинета, API-ключ, Business ID, кампании FBS/FBY.</li>' +
    '<li>Строка на «' + YOP_SH.settings + '» с тем же именем и «Считать = да»; себес — лист юнитки или «' + YOP_SH.cogs + '».</li>' +
    '<li>1️⃣ — первый прогон сам докачает 42 дня истории (несколько шагов по минуте).</li></ol>' +
    '<h3>Если что-то пошло не так</h3><ol><li>Откройте «📊 Что сейчас происходит» — там одно действие, которое нужно сейчас.</li>' +
    '<li>«🔌 Проверка связи» — отвечает ли Маркет по каждому ключу и доступна ли папка кэша.</li>' +
    '<li>Прогон молчит дольше 30 минут — 🛠 → «🧹 Сбросить зависший прогон», потом 1️⃣. Скачанное не теряется.</li></ol>';
  var text = 'ЧП ЯМ по заказам (' + (version || YOP_VERSION) + ')\n\n1️⃣ Посчитать за вчера — заказы, отчёт услуг, цены, остатки, все листы.\n' +
    '2️⃣ Обновить юнитку — только цены и остатки.\n⏰ Автопрогон — 🛠 Ручной режим, каждое утро ≈07:10.\n\n' +
    'Себес без юнитки — лист «' + YOP_SH.cogs + '». Смена комиссии — «Тариф комиссии вручную» на листе настроек.\n' +
    'Сбой — «📊 Что сейчас происходит».';
  return { html: html, text: text };
}

/** Одно действие, которое сейчас нужно от человека. */
function yopNextAction_(ctx) {
  if (ctx.error) return 'Нажмите «⚙️ Обновить настройки таблицы»: ' + ctx.error;
  if (ctx.queue && ctx.stale) return 'Прогон молчит больше 30 минут: 🛠 Ручной режим → «🧹 Сбросить зависший прогон», затем 1️⃣.';
  if (ctx.queue) return 'Идёт прогон — ничего делать не нужно, листы обновятся сами.';
  if (!ctx.last) return 'Нажмите 1️⃣ «Посчитать за вчера» — первый прогон.';
  if (ctx.last.errors && ctx.last.errors.length) return 'Прошлый прогон с ошибками (ниже) — откройте «🔌 Проверка связи».';
  if (ctx.noKey.length) return 'Впишите ключ на лист «' + YOP_SH.keys + '» для: ' + ctx.noKey.join(', ') + ' (или поставьте «Считать = нет»).';
  if (!ctx.auto) return 'Включите автопрогон: 🛠 Ручной режим → «⏰ Включить автопрогон».';
  if (ctx.noCogs) return 'Добавьте себес ' + ctx.noCogs + ' артикулов на лист «' + YOP_SH.cogs + '» (они помечены «НЕТ — себес 0»).';
  return 'Ничего делать не нужно: автопрогон включён, листы свежие.';
}

/** 📊 Что сейчас происходит. */
function yopStatus(version) {
  var p = yopProps_(), ctx = { noKey: [], noCogs: 0 };
  ctx.queue = yopQueueLoad_();
  ctx.stale = yopQueueStale_(ctx.queue);
  ctx.last = JSON.parse(p.getProperty('YOP_LAST_DONE') || 'null');
  ctx.auto = yopAutoOn_();
  var st = JSON.parse(p.getProperty('YOP_CAB_STATE') || '{}'), rows = [];
  try {
    var keys = yopKeys_(), s = yopSettings_();
    s.all.forEach(function (c) {
      var k = keys[c.name], x = st[c.name] || {};
      if (c.on && !k) ctx.noKey.push(c.name);
      rows.push([htmlEsc_(c.name), c.on ? 'да' : 'нет', k ? '<span class="ok">есть</span>' : '<span class="red">нет</span>',
        x.lastDay ? yopRu_(x.lastDay) : '—', c.tariff != null ? c.tariff + ' %' + (c.tariffFrom ? ' с ' + yopRu_(c.tariffFrom) : '') : 'из начислений']);
    });
  } catch (e) { ctx.error = e.message; }
  var det = SpreadsheetApp.getActive().getSheetByName(YOP_SH.detail);
  if (det && det.getLastRow() > YOP_HEAD_ROW) {
    det.getRange(YOP_HEAD_ROW + 1, YOP_DETAIL_HEAD.length, det.getLastRow() - YOP_HEAD_ROW, 1).getValues()
      .forEach(function (r) { if (String(r[0]).indexOf('НЕТ') === 0) ctx.noCogs++; });
  }
  var action = yopNextAction_(ctx), q = ctx.queue, last = ctx.last;
  var now = q ? (ctx.stale ? '<span class="red">прогон завис</span>' : 'идёт прогон') + ' за ' + yopRu_(q.day) + ': ' +
    (q.cabs.length ? 'заказы — осталось ' + htmlEsc_(q.cabs.join(', ')) : q.unitCabs.length ? 'цены и остатки — осталось ' +
      htmlEsc_(q.unitCabs.join(', ')) : 'запись листов') : 'прогона нет';
  var lastTxt = last ? (last.mode === 'full' ? 'полный прогон за ' + yopRu_(last.day) : 'юнитка') + ', закончен ' +
    Utilities.formatDate(new Date(last.at), 'Europe/Moscow', 'dd.MM HH:mm') + ', ' + last.minutes + ' мин' : 'ещё не было';
  var log = (p.getProperty('YOP_LOG') || '').split('\n').slice(-15).join('\n');
  var html = dlgCss_() + '<h2>Что сейчас происходит</h2>' +
    '<div class="act">👉 ' + htmlEsc_(action) + '</div>' +
    '<table><tr><th>Сейчас</th><td>' + now + '</td></tr><tr><th>Последний прогон</th><td>' + htmlEsc_(lastTxt) + '</td></tr>' +
    '<tr><th>Автопрогон</th><td>' + (ctx.auto ? 'включён, ≈07:10' : '<span class="red">выключен</span>') + '</td></tr>' +
    '<tr><th>Код</th><td>' + htmlEsc_(version || YOP_VERSION) + '</td></tr></table>' +
    (last && last.errors && last.errors.length ? '<div class="warn"><b>Ошибки прошлого прогона:</b><br>' +
      last.errors.map(htmlEsc_).join('<br>') + '</div>' : '') +
    '<h3>Кабинеты</h3>' + yopTable_(['Кабинет', 'Считать', 'Ключ', 'Заказы скачаны по', 'Тариф комиссии'], rows) +
    '<h3>Последние события</h3><div class="box"><pre>' + htmlEsc_(log || '—') + '</pre></div>';
  var text = '👉 ' + action + '\n\nСейчас: ' + now.replace(/<[^>]+>/g, '') + '\nПоследний прогон: ' + lastTxt +
    '\nАвтопрогон: ' + (ctx.auto ? 'включён' : 'выключен') + '\n\n' + log;
  return { html: html, text: text };
}

/**
 * 🔌 Проверка связи — БЕЗ повторов: все кабинеты одним fetchAll, код ответа и есть диагноз.
 * Права записи не проверяются: модуль в Маркет ничего не пишет, только читает.
 */
function yopCheckConnection() {
  var keys = yopKeys_(), s, rows = [], reqs = [], idx = [];
  try { s = yopSettings_(); } catch (e) {
    return { html: dlgCss_() + '<h2>Проверка связи</h2><div class="warn">' + htmlEsc_(e.message) + '</div>', text: e.message };
  }
  s.all.forEach(function (c) {
    var k = keys[c.name];
    if (!k) { rows.push([htmlEsc_(c.name), '—', '<span class="red">нет строки на листе «' + YOP_SH.keys + '»</span>']); return; }
    [['FBS', k.fbs], ['FBY', k.fby]].forEach(function (pair) {
      if (!pair[1]) return;
      idx.push([c.name, pair[0]]);
      reqs.push({ url: YOP_BASE + '/campaigns/' + pair[1], headers: { 'Api-Key': k.apiKey }, muteHttpExceptions: true });
    });
  });
  var diag = { 200: '<span class="ok">отвечает</span>', 401: '<span class="red">ключ не принят (401)</span>',
    403: '<span class="red">у ключа нет доступа к кампании (403)</span>', 404: '<span class="red">кампания не найдена (404)</span>',
    420: 'лимит запросов (420) — повторите через минуту', 429: 'лимит запросов (429) — повторите через минуту' };
  (reqs.length ? UrlFetchApp.fetchAll(reqs) : []).forEach(function (r, i) {
    var code = r.getResponseCode();
    rows.push([htmlEsc_(idx[i][0]), idx[i][1], diag[code] || '<span class="red">ошибка Маркета ' + code + '</span>']);
  });
  var extra = [];
  try { extra.push(['Папка кэша на Диске', '<span class="ok">' + htmlEsc_(yopCacheFolder_().getName()) + '</span>']); }
  catch (e) { extra.push(['Папка кэша на Диске', '<span class="red">' + htmlEsc_(e.message) + '</span>']); }
  s.all.forEach(function (c) {
    if (!c.unit) return;
    extra.push(['Юнитка «' + htmlEsc_(c.unit) + '»', yopUnitCols_(c.unit) ? '<span class="ok">найдены «Код 1С» и «себес»</span>'
      : '<span class="red">нет листа или колонок «Код 1С» / «себес»</span>']);
  });
  extra.push(['Лист «' + YOP_SH.cogs + '»', SpreadsheetApp.getActive().getSheetByName(YOP_SH.cogs) ? '<span class="ok">есть</span>'
    : '<span class="red">нет — «⚙️ Обновить настройки таблицы»</span>']);
  var html = dlgCss_() + '<h2>Проверка связи</h2>' +
    '<p class="muted">Один запрос на кампанию, без повторов. Запись в Маркет модулю не нужна — он только читает.</p>' +
    yopTable_(['Кабинет', 'Кампания', 'Маркет'], rows) + yopTable_(['Что', 'Состояние'], extra);
  var text = rows.concat(extra).map(function (r) { return r.join(' — ').replace(/<[^>]+>/g, ''); }).join('\n');
  return { html: html, text: text };
}

/**
 * ⚙️ Обновить настройки таблицы: служебные листы в раскладку текущей версии без боевых действий.
 * Лист настроек: недостающие колонки дописываются справа от шапки; лист «себес вручную» создаётся пустым.
 */
function upgradeSheets() {
  var ss = SpreadsheetApp.getActive(), done = [];
  var sh = ss.getSheetByName(YOP_SH.settings);
  if (!sh) {
    sh = ss.insertSheet(YOP_SH.settings);
    sh.getRange(1, 1).setValue('Настройки «ЧП ЯМ по заказам»').setFontWeight('bold').setFontSize(13);
    sh.getRange(2, 1).setValue('Кабинеты берутся отсюда, ключи — с листа «' + YOP_SH.keys + '» (имя кабинета должно совпадать).');
    sh.getRange(3, 1, 1, 2).setValues([['Папка кэша на Диске (id)', '']]);
    sh.getRange(5, 1, 1, YOP_SETTINGS_HEAD.length).setValues([YOP_SETTINGS_HEAD]).setFontWeight('bold').setBackground('#e8f0fe');
    done.push('создан лист настроек — впишите папку кэша (B3) и кабинеты');
  } else {
    var v = sh.getDataRange().getValues(), hr = -1;
    for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === 'Кабинет') { hr = i; break; }
    if (hr >= 0) {
      var have = v[hr].map(function (x) { return String(x).trim().toLowerCase(); }).filter(String);
      var add = YOP_SETTINGS_HEAD.filter(function (h) {
        var key = h.toLowerCase().split(' (')[0].split(',')[0];
        return !have.some(function (x) { return x.indexOf(key) === 0; });
      });
      if (add.length) {
        sh.getRange(hr + 1, have.length + 1, 1, add.length).setValues([add]).setFontWeight('bold').setBackground('#e8f0fe');
        done.push('на лист настроек добавлены колонки: ' + add.join(', '));
      }
      sh.getRange(hr + 2, 5, Math.max(sh.getMaxRows() - hr - 1, 1), 1).setNumberFormat('dd.mm.yyyy');
    }
  }
  var cg = ss.getSheetByName(YOP_SH.cogs);
  if (!cg) {
    cg = ss.insertSheet(YOP_SH.cogs);
    yopTitle_(cg, 'Себестоимость вручную — для кабинетов без юнитки и артикулов, которых нет в юнитке',
      'Кабинет — как на листе настроек; артикул магазина — как в заказах Маркета (shopSku). Значение отсюда главнее юнитки.');
    yopHeader_(cg, YOP_COGS_HEAD, { 1: 160, 2: 260, 3: 130, 4: 320 });
    cg.getRange(YOP_HEAD_ROW + 1, 2, cg.getMaxRows() - YOP_HEAD_ROW, 1).setNumberFormat('@');
    done.push('создан лист «' + YOP_SH.cogs + '»');
  }
  yopWriteHelp_();
  done.push('лист «' + YOP_SH.help + '» обновлён под ' + YOP_VERSION);
  yopLog_('настройки таблицы: ' + done.join('; '));
  yopToast_(done.join('; '));
  return done;
}