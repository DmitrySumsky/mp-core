/* Оповещения в чат: шапка → тело → действие. Без токена бота модуль молчит — это не ошибка. */

function posNotify_(head, body, action) {
  var cfg;
  try { cfg = posCfg_(true); } catch (e) { return false; }
  if (!cfg.botToken || !cfg.chat) return false;
  var text = head + (cfg.cabinet ? ' · ' + cfg.cabinet : '') + '\n\n' + body + '\n\n' + action;
  try {
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.botToken + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: cfg.chat, text: text.slice(0, 3900), disable_web_page_preview: true })
    });
    return resp.getResponseCode() === 200;
  } catch (e2) {
    return false;      // сырой ответ API в чат и в окно не уходит; сбой оповещения прогон не роняет
  }
}
