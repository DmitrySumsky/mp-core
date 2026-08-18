/**
 * MpCore — общее ядро сборщиков для Apps Script.
 *
 * Python-библиотеке в таблицах места нет: код живёт внутри книги и
 * читается человеком прямо там. Поэтому у ядра две реализации, и правила
 * в них одни и те же — расходиться им нельзя.
 *
 * Файл КОПИРУЕТСЯ в проект книги (clasp push) и не правится на месте:
 * правка вносится в mp-core и раскатывается заново. Версия ниже должна
 * совпадать с версией питоновского ядра по смыслу правил, а не по числу.
 *
 * Правила, ради которых это существует:
 *
 *  1. Три состояния замера — разные факты. «Нет в наличии» про товар,
 *     «нет карточки» про идентификатор, «ошибка сбора» про ЗАМЕР.
 *     Последнее в таблицу не пишется вообще.
 *  2. Молчание источника не затирает собранное.
 *  3. Исчерпанная квота — это НЕ «сервис не ответил». Ретраить её
 *     бессмысленно, и в журнале она обязана называться своим именем.
 *  4. Тема №1 — это «General»: номер есть, но передавать его в API
 *     нельзя, приходит 400 «message thread not found».
 *  5. Суточная квота аналитики считается по контурам РАЗДЕЛЬНО: когда
 *     один контур наполняется, а второй стоит — дело не в токене.
 *
 * @version 0.5.0
 */

var MpCore = (function () {
  'use strict';

  var STATE_NONE = 'нет в наличии';
  var STATE_GONE = 'нет карточки';
  var STATE_FAIL = 'ошибка сбора';

  var CARD_URL = 'https://card.wb.ru/cards/v4/detail';
  var CARD_BATCH = 100;          // больше витрина за раз не отдаёт
  var WALLET_K = 0.98;
  var DEST_DEFAULT = -1257786;

  var MPSTATS_BASE = 'https://mpstats.io/api';
  var TG_API = 'https://api.telegram.org/bot';
  var TG_LIMIT = 3900;           // запас к потолку 4096 на служебные хвосты
  var GENERAL_THREAD = '1';

  /** Цена с бонусом кошелька из копеек карточки. Именно floor, не round. */
  function walletPrice(kopeks) {
    return Math.floor(kopeks / 100 * WALLET_K);
  }

  /**
   * GET с ретраями. Возвращает {ok, status, data, quota}.
   *
   * `quota: true` — суточный лимит исчерпан; ретраить бессмысленно, до
   * сброса счётчика ответ не изменится. Отличаем от обычного 429 по телу.
   */
  function getJson(url, headers, tries) {
    tries = tries || 4;
    var delay = 1000;
    for (var i = 1; i <= tries; i++) {
      var response;
      try {
        response = UrlFetchApp.fetch(url, {
          muteHttpExceptions: true,
          headers: headers || {},
          followRedirects: true
        });
      } catch (err) {
        if (i === tries) return { ok: false, status: 0, data: null, quota: false };
        Utilities.sleep(delay); delay *= 2; continue;
      }
      var code = response.getResponseCode();
      var body = response.getContentText();
      if (code === 200) {
        if (!body || !body.trim()) return { ok: true, status: 200, data: null, quota: false };
        try {
          return { ok: true, status: 200, data: JSON.parse(body), quota: false };
        } catch (err) {
          return { ok: false, status: 200, data: null, quota: false };
        }
      }
      if (code === 429 && isQuotaMessage_(body)) {
        return { ok: false, status: 429, data: null, quota: true };
      }
      if (i === tries) return { ok: false, status: code, data: null, quota: false };
      Utilities.sleep(delay); delay *= 2;
    }
    return { ok: false, status: 0, data: null, quota: false };
  }

  function isQuotaMessage_(body) {
    var low = String(body || '').toLowerCase();
    return low.indexOf('лимит') >= 0 || low.indexOf('limit') >= 0 ||
           low.indexOf('quota') >= 0;
  }

  /**
   * Цены с публичной витрины: {идентификатор: цена | состояние}.
   *
   * Идентификатора нет в ответе — «нет карточки»; пришёл без цены —
   * «нет в наличии»; НЕ отдавшаяся пачка не попадает в результат вообще,
   * потому что дырка замера не должна выглядеть как факт о товаре.
   */
  function cardPrices(ids, options) {
    options = options || {};
    var dest = options.dest || DEST_DEFAULT;
    var wallet = options.wallet !== false;
    var out = {};
    for (var i = 0; i < ids.length; i += CARD_BATCH) {
      var chunk = ids.slice(i, i + CARD_BATCH).map(String);
      var url = CARD_URL + '?appType=1&curr=rub&spp=30&dest=' + dest +
                '&nm=' + chunk.join(';');
      var answer = getJson(url, { 'User-Agent': 'Mozilla/5.0' });
      if (!answer.ok) continue;                 // сбой пачки — молчим, а не врём
      var products = (answer.data && answer.data.products) || [];
      var seen = {};
      for (var p = 0; p < products.length; p++) {
        var product = products[p];
        var key = String(product.id);
        seen[key] = true;
        var kopeks = productKopeks_(product);
        out[key] = kopeks ? (wallet ? walletPrice(kopeks) : Math.round(kopeks / 100))
                          : STATE_NONE;
      }
      for (var c = 0; c < chunk.length; c++) {
        if (!seen[chunk[c]]) out[chunk[c]] = STATE_GONE;
      }
      Utilities.sleep(200);
    }
    return out;
  }

  /** Цена предложения в копейках или 0. Смотрим ВСЕ размеры, не только первый. */
  function productKopeks_(product) {
    var sizes = product.sizes || [];
    for (var i = 0; i < sizes.length; i++) {
      var value = (sizes[i].price || {}).product;
      if (value) return value;
    }
    return 0;
  }

  /**
   * История цен из платной аналитики: {дата: цена}. Пусто при недоступности.
   *
   * `state` — объект-накопитель на прогон: в него садится флаг квоты, и
   * один отказ гасит остальные запросы ЭТОГО контура, не трогая соседний.
   */
  function mpHistory(item, token, kind, field, state) {
    state = state || {};
    kind = kind || 'wb';
    field = field || (kind === 'oz' ? 'ozon_card_price' : 'wallet_price');
    if (state.quota) return {};
    var answer = getJson(MPSTATS_BASE + '/' + kind + '/get/item/' + item + '/sales',
                         { 'X-Mpstats-TOKEN': token });
    if (answer.quota) { state.quota = true; return {}; }
    var rows = answer.data;
    if (!answer.ok || !rows || !rows.length) return {};
    var out = {};
    for (var i = 0; i < rows.length; i++) {
      var day = rows[i].data;
      var value = rows[i][field] || rows[i].final_price;
      if (day && value) out[day] = Math.round(value);
    }
    return out;
  }

  /** Причина молчания источника одной строкой — для журнала и человека. */
  function whySilent(state) {
    return (state && state.quota) ? 'исчерпан суточный лимит запросов'
                                  : 'источник не ответил';
  }

  /**
   * Получатель оповещения: «чат» либо «чат:тема».
   *
   * Тема №1 — «General» форум-группы. Номер существует, но передавать его
   * в API НЕЛЬЗЯ: приходит 400 «message thread not found».
   */
  function parseTarget(raw) {
    var text = String(raw || '').trim();
    var at = text.lastIndexOf(':');
    if (at > 0) {
      var thread = text.slice(at + 1);
      if (/^\d+$/.test(thread)) {
        return {
          chat: text.slice(0, at),
          thread: thread === GENERAL_THREAD ? null : thread
        };
      }
    }
    return { chat: text, thread: null };
  }

  /** Список получателей через запятую. Пусто — пустой список, а не ошибка. */
  function parseTargets(raw) {
    var out = [];
    var parts = String(raw || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].trim()) out.push(parseTarget(parts[i]));
    }
    return out;
  }

  /** Нарезка под лимит сообщения: строку пополам не рвём. */
  function splitText(text, limit) {
    limit = limit || TG_LIMIT;
    var lines = String(text || '').split('\n');
    var parts = [], current = '';
    for (var i = 0; i < lines.length; i++) {
      var candidate = current ? current + '\n' + lines[i] : lines[i];
      if (candidate.length > limit && current) {
        parts.push(current);
        current = lines[i];
      } else {
        current = candidate;
      }
    }
    if (current) parts.push(current);
    return parts.length ? parts : [''];
  }

  /**
   * Куски с шапкой в КАЖДОМ: первый — полная, дальше «продолжение k/n».
   *
   * Автор рассылки знает контекст, получатель — нет: в один чат пишут
   * несколько систем, и без шапки продолжения приходят безадресными.
   */
  function withHeaders(text, header, limit) {
    var body = splitText(text, limit);
    if (body.length === 1) return [header ? header + '\n' + body[0] : body[0]];
    var out = [];
    for (var i = 0; i < body.length; i++) {
      var cap = i === 0 ? header
                        : header + ' — продолжение ' + (i + 1) + '/' + body.length;
      out.push(header ? cap + '\n' + body[i] : body[i]);
    }
    return out;
  }

  /** Отправка с нарезкой. true — ушли ВСЕ куски всем получателям. */
  function tgSend(token, targets, text, header) {
    var list = (typeof targets === 'string') ? parseTargets(targets) : targets;
    var ok = list.length > 0;
    for (var t = 0; t < list.length; t++) {
      var chunks = withHeaders(text, header || '');
      for (var i = 0; i < chunks.length; i++) {
        var payload = {
          chat_id: String(list[t].chat),
          text: chunks[i],
          disable_web_page_preview: true
        };
        if (list[t].thread) payload.message_thread_id = String(list[t].thread);
        try {
          var response = UrlFetchApp.fetch(TG_API + token + '/sendMessage', {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          });
          var body = JSON.parse(response.getContentText() || '{}');
          ok = ok && body.ok === true;
        } catch (err) {
          ok = false;
        }
      }
    }
    return ok;
  }

  return {
    VERSION: '0.5.0',
    STATE_NONE: STATE_NONE,
    STATE_GONE: STATE_GONE,
    STATE_FAIL: STATE_FAIL,
    CARD_URL: CARD_URL,
    DEST_DEFAULT: DEST_DEFAULT,
    walletPrice: walletPrice,
    getJson: getJson,
    cardPrices: cardPrices,
    mpHistory: mpHistory,
    whySilent: whySilent,
    parseTarget: parseTarget,
    parseTargets: parseTargets,
    splitText: splitText,
    withHeaders: withHeaders,
    tgSend: tgSend
  };
})();
