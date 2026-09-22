/* Полки WB — фоновая часть v1.2.0 — 22.09.2026
 * v1.2.0: клик по значку расширения = «обновить все книги» — открывает вкладку WB
 *         с меткой сбора контура «all»; искать кнопку в таблицах не нужно.
 * Единственная задача: разговор с хабом (веб-приложение Apps Script). Со страницы
 * wildberries.ru туда не достучаться — чужой домен, поэтому страница просит фон.
 * Адрес хаба и ключ — в config.js, его пишет tools/build_ext.py (в git не лежит).
 */
importScripts('config.js');

async function hub(msg) {
  const url = new URL(self.SHELF_HUB.url);
  url.searchParams.set('action', msg.action);
  url.searchParams.set('contour', msg.contour || 'brands');
  if (msg.action !== 'status') url.searchParams.set('key', self.SHELF_HUB.key);
  const opt = msg.body === undefined ? {method: 'GET'} : {
    method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
    body: JSON.stringify(msg.body)
  };
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url.toString(), opt);
      const text = await r.text();
      try { return JSON.parse(text); } catch (e) { last = 'хаб ответил не JSON: ' + text.slice(0, 200); }
    } catch (e) { last = String(e); }
    await new Promise(res => setTimeout(res, 3000 * (attempt + 1)));
  }
  return {ok: false, error: last};
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === 'hub') {
    hub(msg).then(reply);
    return true;             // ответ придёт асинхронно
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: 'https://www.wildberries.ru/#wbshelf=all'});
});
