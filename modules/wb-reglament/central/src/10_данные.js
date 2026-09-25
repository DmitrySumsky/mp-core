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