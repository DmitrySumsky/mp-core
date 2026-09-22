/* Окна пульта: инструкция, статус, проверка связи. Отдают {html, text} — рисует лоадер. */

function dlgCss_() {
  return '<style>' +
    'body{font-family:Roboto,Arial,sans-serif;font-size:13.5px;line-height:1.55;margin:0;padding:18px;color:#202124}' +
    'h2{margin:0 0 12px;font-size:18px}h3{margin:18px 0 6px;font-size:14.5px}' +
    'ol,ul{margin:6px 0 6px 18px;padding:0}li{margin-bottom:6px}' +
    '.red{color:#C5221F;font-weight:600}.ok{color:#188038;font-weight:600}' +
    '.box{background:#F5F5F5;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.warn{background:#FCE8E6;border-radius:6px;padding:10px 12px;margin:10px 0}' +
    '.act{background:#E6F4EA;border-radius:6px;padding:10px 12px;margin:10px 0;font-weight:600}' +
    '.muted{color:#666}.big{font-size:22px;font-weight:700}' +
    'table{border-collapse:collapse;margin:8px 0;width:100%}' +
    'td,th{border:1px solid #DADCE0;padding:5px 8px;text-align:left;font-size:13px}' +
    'th{background:#F1F3F4}' +
    '</style>';
}

function htmlEsc_(x) {
  return String(x === null || x === undefined ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function posStrip_(html) {
  return String(html).replace(/<li>/g, '\n• ').replace(/<\/(h2|h3|div|tr|ol|ul|p)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** 📖 Как работать — описывает ТУ версию, которая сейчас в книге. */
function posHelp(version) {
  var h = [];
  h.push('<h2>📖 Позиции в поиске WB — как работать</h2>');
  h.push('<div class="box">Книга раз в день сама снимает позиции карточек в поиске Wildberries по их ключевым ' +
    'запросам и копит историю. Вы ведёте только лист <b>«' + POS_ART_SHEET + '»</b>. Ничего во внешние системы ' +
    'книга не пишет — только читает WB.</div>');

  h.push('<h3>Один раз</h3><ol>');
  h.push('<li><b>⚙️ Обновить настройки таблицы</b> — появятся все листы.</li>');
  h.push('<li>«' + POS_KEYS_SHEET + '» <b>B2</b> — токен кабинета WB с категорией «Аналитика» (у кабинета нужна подписка ' +
    'Джем). Лучше отдельный токен под эту книгу: лимит WB считается на токен, общий ключ делят другие сервисы.</li>');
  h.push('<li><b>🔌 Проверка связи</b> — токен принят, срок виден, выдача отвечает.</li>');
  h.push('<li>Лист «' + POS_ART_SHEET + '»: в первую колонку — артикулы WB, по одному в строке.</li>');
  h.push('<li><b>🛠 Ручной режим → ⏰ Включить автопрогон</b>. Час — «' + POS_KEYS_SHEET + '» B9.</li></ol>');

  h.push('<h3>Каждый день</h3><ol>');
  h.push('<li>Ничего не нажимать: автопрогон снимает позиции по всем активным артикулам и дописывает историю.</li>');
  h.push('<li>Нужно прямо сейчас — <b>1️⃣ Снять позиции по всем артикулам</b>. Только что добавили пару карточек — ' +
    'выделите их строки на «' + POS_ART_SHEET + '» и нажмите <b>2️⃣ Снять по выделенным</b>: остальные не трогаются.</li>');
  h.push('<li>Долгий прогон идёт этапами в облаке: окно можно закрыть, книгу тоже. Ход — <b>📊 Что сейчас происходит</b>.</li></ol>');

  h.push('<h3>Лист «' + POS_ART_SHEET + '» — что заполняете вы</h3>');
  h.push('<table><tr><th>Колонка</th><th>Что писать</th></tr>' +
    '<tr><td>' + POS_ART_HEADER[0] + '</td><td>артикул (nmID) карточки своего кабинета</td></tr>' +
    '<tr><td>' + POS_ART_HEADER[1] + '</td><td>пусто или «да» — в работе; «нет» — не снимать (история остаётся)</td></tr>' +
    '<tr><td>' + POS_ART_HEADER[2] + '</td><td>необязательно: запросы, которых нет в отчёте WB, через «;» — например, под новую карточку</td></tr></table>' +
    '<div class="muted">Остальные колонки листа заполняет книга. Свои колонки добавлять можно — книга ищет колонки по заголовку.</div>');

  h.push('<h3>Что где лежит</h3>');
  h.push('<table><tr><th>Лист</th><th>Что в нём</th></tr>' +
    '<tr><td>' + POS_SHEET + '</td><td>последний замер: строка = артикул + запрос. Сдвиги ▲▼ — к прошлому замеру</td></tr>' +
    '<tr><td>' + POS_HIST_ORG_SHEET + '</td><td>место в органике по дням: строка = артикул + запрос, колонка = день, новый день слева</td></tr>' +
    '<tr><td>' + POS_HIST_WB_SHEET + '</td><td>средняя позиция по данным WB за каждый вчерашний день</td></tr>' +
    '<tr><td>' + POS_JAM_SHEET + '</td><td>сырой отчёт WB по запросам карточек (обновляется каждым прогоном)</td></tr>' +
    '<tr><td>' + POS_QUEUE_SHEET + ', ' + POS_LOG_SHEET + '</td><td>служебные: очередь запросов текущего прогона и журнал прогонов</td></tr></table>');

  h.push('<h3>Как читать цифры</h3><ul>');
  h.push('<li><b>Органика, место</b> — место карточки в публичной выдаче WB по Москве <b>без рекламы</b>. ' +
    '«&gt;100» — карточки нет в проверенной глубине (глубина — «' + POS_KEYS_SHEET + '» B7, страниц по 100). ' +
    '«нет данных» — выдача не ответила; прошлые дни в истории при этом не затираются. С 22.09.2026 сайт WB закрыт ' +
    'для облака антиботом: если в «' + POS_KEYS_SHEET + '» B10–B12 указан хаб сбора, органику собирает расширение ' +
    'в браузере менеджера, а книга сама забирает итог — ничего дополнительно нажимать в этих листах не нужно.</li>');
  h.push('<li><b>WB позиция вчера</b> — средняя позиция карточки по запросу за вчера по данным самого WB: ' +
    '<b>с рекламой</b>, по всем регионам и показам. Если вы крутите рекламу, эта цифра обычно лучше органики — ' +
    'её и сравнивайте с тем, что видите на сайте.</li>');
  h.push('<li><b>Группа</b>: ВЧ — от ' + POS_FREQ_HIGH + ' запросов за 30 дней, СЧ — от ' + POS_FREQ_MID + ', НЧ — меньше; ' +
    '«свой» — запрос из вашей колонки, частотности у него нет.</li>');
  h.push('<li><b>Наших заказов</b> — заказы именно этой карточки по запросу. Заказов всех продавцов по запросу ' +
    'WB через API не отдаёт; спрос показывает частотность.</li>');
  h.push('<li>В отчёт WB попадает до ' + 30 + ' запросов на карточку (лучшие по заказам за 30 дней); ' +
    'число — «' + POS_KEYS_SHEET + '» B8.</li></ul>');

  h.push('<div class="warn"><b>Место «как на сайте» с рекламой</b> из облака снять нельзя: сайт WB закрыт от ' +
    'автоматических запросов. Нужна точечная проверка по артикулу — попросите Клода: «Позиции &lt;артикул&gt;».</div>');

  h.push('<h3>Если что-то пошло не так</h3><ol>');
  h.push('<li>Откройте <b>📊 Что сейчас происходит</b> — там причина и одно действие.</li>');
  h.push('<li>«WB просит подождать» — лимит кабинета занят другими сервисами; прогон продолжится сам. Повторяется ' +
    'каждый день — выпустите отдельный токен под книгу.</li>');
  h.push('<li>Прогон молчит дольше 30 минут — <b>🛠 → 🧹 Сбросить зависший прогон</b> и 1️⃣ заново. Собранное не пропадёт.</li>');
  h.push('<li>У артикула «в отчёте WB нет запросов» — карточка новая, без показов, или она не из кабинета этого токена. ' +
    'Впишите свои запросы в третью колонку.</li></ol>');

  h.push('<div class="muted">' + htmlEsc_(version || '') + '</div>');
  var html = dlgCss_() + h.join('');
  return { html: html, text: posStrip_(h.join('')) };
}

/** 📊 Что сейчас происходит — состояние и ОДНО действие. */
function posStatus(version) {
  var cfg = null, cfgError = '';
  try { cfg = posCfg_(true); } catch (e) { cfgError = String(e.message || e); }
  var state = posStateLoad_();
  var last = null;
  try { last = JSON.parse(PropertiesService.getScriptProperties().getProperty(POS_LAST_KEY) || 'null'); } catch (e2) { last = null; }
  var articles = 0;
  try { articles = posReadArticles_(null).length; } catch (e3) { articles = 0; }
  var daily = posDailyInstalled_();

  var counts = { wait: 0, done: 0, dead: 0, total: 0 };
  if (posIsActive_(state) && state.phase !== 'jam') {
    try {
      var q = posQueueRead_();
      counts.total = q.length;
      for (var i = 0; i < q.length; i++) {
        if (q[i].status === 'готово') counts.done++; else if (q[i].status === 'нет ответа') counts.dead++; else counts.wait++;
      }
    } catch (e4) { /* очередь ещё не построена */ }
  }

  var action;
  if (cfgError) action = cfgError;
  else if (!cfg.token) action = 'Впишите токен WB в «' + POS_KEYS_SHEET + '» B2 и нажмите «🔌 Проверка связи».';
  else if (!articles) action = 'Впишите артикулы WB в первую колонку листа «' + POS_ART_SHEET + '» и нажмите 1️⃣.';
  else if (posIsStale_(state)) action = 'Прогон молчит дольше 30 минут: «🛠 Ручной режим → 🧹 Сбросить зависший прогон», затем 1️⃣.';
  else if (posIsActive_(state)) action = 'Идёт работа в облаке — ничего делать не нужно. Книгу можно закрыть.';
  else if (state && state.phase === 'failed') action = 'Прошлый прогон остановлен: ' + state.error + ' Исправьте причину и нажмите 1️⃣.';
  else if (!daily) action = 'Включите автопрогон: «🛠 Ручной режим → ⏰ Включить автопрогон».';
  else action = 'Ничего делать не нужно: следующий замер — завтра около ' + cfg.hour + ':00.';

  var h = [];
  h.push('<h2>📊 Позиции WB — что сейчас происходит</h2>');
  h.push('<div class="act">Сейчас от вас: ' + htmlEsc_(action) + '</div>');
  h.push('<table>');
  if (posIsActive_(state)) {
    h.push('<tr><th>Прогон</th><td>' + htmlEsc_(state.id) + ' · ' + htmlEsc_(state.who) + '</td></tr>');
    h.push('<tr><th>Этап</th><td>' + htmlEsc_(posPhaseName_(state.phase)) + ' (этапов пройдено: ' + state.stages + ')</td></tr>');
    h.push('<tr><th>Артикулов</th><td>' + state.nms.length + '</td></tr>');
    if (state.phase === 'jam') {
      h.push('<tr><th>Отчёт WB</th><td>пачек ' + state.jamChunk + ' из ' + Math.ceil(state.nms.length / POS_JAM_CHUNK) +
        (state.waits ? ', ожиданий лимита: ' + state.waits : '') + '</td></tr>');
    } else {
      h.push('<tr><th>Запросы органики</th><td>готово ' + counts.done + ' из ' + counts.total +
        (counts.dead ? ', без ответа ' + counts.dead : '') + ', ждёт ' + counts.wait + '</td></tr>');
    }
  } else {
    h.push('<tr><th>Прогон</th><td>сейчас не идёт</td></tr>');
  }
  if (last) {
    h.push('<tr><th>Последний замер</th><td>' + htmlEsc_(posSummaryText_(last, (cfg ? cfg.depth : 1) * POS_PAGE_SIZE)) + '</td></tr>');
  }
  h.push('<tr><th>Активных артикулов</th><td>' + articles + '</td></tr>');
  h.push('<tr><th>Автопрогон</th><td>' + (daily ? '<span class="ok">включён</span>, около ' + (cfg ? cfg.hour : 7) + ':00' :
    '<span class="red">выключен</span>') + '</td></tr>');
  h.push('</table>');
  h.push('<div class="muted">' + htmlEsc_(version || '') + '</div>');
  return { html: dlgCss_() + h.join(''), text: posStrip_(h.join('')) };
}

/** 🔌 Проверка связи — БЕЗ ретраев: все адреса одним fetchAll, код ответа и есть диагноз. */
function posCheckConnection() {
  var cfg = posCfg_(true);
  var reqs = [], names = [];
  function add(name, url, headers) {
    names.push(name);
    reqs.push({ url: url, muteHttpExceptions: true, headers: headers || { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
  }
  if (cfg.token) add('WB «Аналитика» (токен)', POS_JAM_PING, { 'Authorization': cfg.token });
  for (var i = 0; i < POS_SEARCH_HOSTS.length; i++) {
    add('Выдача ' + POS_SEARCH_HOSTS[i], posSearchUrl_(POS_SEARCH_HOSTS[i], POS_SEARCH_VERSIONS[0], 'чехол', 1, cfg.dest));
  }
  add('Карточки ' + POS_CARD_HOSTS[0], 'https://' + POS_CARD_HOSTS[0] + '/cards/v4/detail?appType=1&curr=rub&dest=' + cfg.dest + '&spp=30&nm=1');
  var resp = [];
  try { resp = UrlFetchApp.fetchAll(reqs); } catch (e) { resp = []; }

  var h = [];
  h.push('<h2>🔌 Проверка связи</h2><table><tr><th>Что</th><th>Ответ</th><th>Диагноз</th></tr>');
  var info = cfg.token ? posTokenInfo_(cfg.token) : null;
  if (!cfg.token) {
    h.push('<tr><td>Токен WB</td><td>—</td><td class="red">нет: впишите в «' + POS_KEYS_SHEET + '» B2</td></tr>');
  } else if (!info) {
    h.push('<tr><td>Токен WB</td><td>—</td><td class="red">не похож на токен WB (не читается как JWT)</td></tr>');
  } else {
    var days = info.exp ? Math.floor((info.exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
    h.push('<tr><td>Токен WB</td><td>продавец ' + htmlEsc_(info.seller) + '</td><td class="' + (days !== null && days < 14 ? 'red' : 'ok') + '">' +
      (info.exp ? 'действует до ' + htmlEsc_(posRu_(posIso_(info.exp))) + ' (' + days + ' дн.)' : 'срок не указан') +
      (info.test ? ' · ТЕСТОВЫЙ контур' : '') + '</td></tr>');
  }
  var searchOk = 0;
  for (var r = 0; r < names.length; r++) {
    var code = resp[r] ? resp[r].getResponseCode() : 0, verdict, cls = 'ok';
    if (names[r].indexOf('Аналитика') >= 0) {
      if (code === 200) verdict = 'токен принят';
      else if (code === 401) { verdict = 'токен не принят — перевыпустите'; cls = 'red'; }
      else if (code === 429) { verdict = 'лимит занят другими сервисами — токен при этом рабочий'; cls = 'ok'; }
      else { verdict = 'неожиданный ответ'; cls = 'red'; }
    } else if (names[r].indexOf('Выдача') >= 0) {
      var good = false;
      if (code === 200) { try { good = !!JSON.parse(resp[r].getContentText()).products; } catch (e2) { good = false; } }
      if (good) { verdict = 'отвечает'; searchOk++; }
      else { verdict = code === 200 ? 'ответ без товаров (чужой конверт)' : 'закрыт лимитером — прогон возьмёт другой хост'; cls = 'muted'; }
    } else {
      verdict = code === 200 ? 'отвечает' : 'не отвечает — названия артикулов не подтянутся'; cls = code === 200 ? 'ok' : 'red';
    }
    h.push('<tr><td>' + htmlEsc_(names[r]) + '</td><td>' + (code || 'нет ответа') + '</td><td class="' + cls + '">' + htmlEsc_(verdict) + '</td></tr>');
  }
  h.push('</table>');
  if (!searchOk) h.push('<div class="warn">Ни один хост выдачи сейчас не ответил. Это лимитер WB, а не поломка: повторите через 5–10 минут.</div>');
  h.push('<div class="box"><b>Право записи:</b> не требуется. Книга ничего не пишет во внешние системы — только читает WB ' +
    'и заполняет свои листы. Подписка Джем проверяется первым прогоном: без неё отчёт WB ответит 403, и книга скажет об этом словами.</div>');
  return { html: dlgCss_() + h.join(''), text: posStrip_(h.join('')) };
}
