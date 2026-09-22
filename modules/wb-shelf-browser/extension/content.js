/* ПОЛКИ WB — СБОР ИЗ БРАУЗЕРА v1.0.0 — 22.09.2026 */
/*
 * v1.0.0 — 22.09.2026
 * WB ЗАКРЫЛ ВИТРИНУ АНТИБОТОМ ДЛЯ ОБЛАКА — полки и цены книг брендов снимаются
 * здесь, на открытой человеком вкладке wildberries.ru, по кнопке из книги.
 *   • Запуск: кнопка книги открывает https://www.wildberries.ru/#wbshelf=<контур>.
 *     Контур = набор книг (brands.json → contours); одна кнопка собирает их все.
 *   • План (какие полки листать, какие наши карточки в них искать, какие артикулы
 *     под цены) — из хаба; итог — обратно в хаб, он сам запускает разнос по книгам.
 *   • Запросы — те же, что делает сама страница: /__internal/u-recom/… (полка) и
 *     /__internal/u-card/… (карточки), с куками этой вкладки и заголовком deviceid
 *     сайта. Проверку WB проходит человек: на 403/498 сбор встаёт на паузу и просит
 *     обновить страницу, а после обновления продолжает с того же места.
 *   • Полку листаем, пока не нашли ВСЕ наши карточки, которые в ней ищем, или не
 *     дошли до total / 600-й позиции. При медиане позиции 30–40 это одна страница.
 */
(() => {
  'use strict';
  const VERSION = '1.0.0';
  const KEY_JOB = 'wbshelf.job';
  const KEY_WHO = 'wbshelf.who';
  const WORKERS = 3;            // одновременных полок
  const PAUSE_MS = 350;         // пауза каждого потока между запросами
  const PAGE = 100;
  const MAX_PAGES = 8;
  const CARD_BATCH = 100;
  const SAVE_EVERY = 20;        // полок между сохранениями прогресса
  const HEARTBEAT_MS = 30000;   // вкладка, молчащая дольше, считается брошенной

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get: k => new Promise(r => chrome.storage.local.get(k, v => r(v[k]))),
    set: (k, v) => new Promise(r => chrome.storage.local.set({[k]: v}, r)),
    del: k => new Promise(r => chrome.storage.local.remove(k, r)),
  };
  const hub = (action, contour, body) => new Promise(r =>
    chrome.runtime.sendMessage({type: 'hub', action, contour, body}, r));

  // ------------------------------------------------------------------ панель
  let panel, lines = {};
  function ui() {
    if (panel) return;
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:340px;' +
      'background:#1f2430;color:#f2f2f2;font:13px/1.45 system-ui,sans-serif;border-radius:10px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.35);padding:12px 14px';
    panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Полки WB — сбор для книг</div>' +
      '<div data-k="title" style="opacity:.8"></div><div data-k="shelves"></div>' +
      '<div data-k="cards"></div><div data-k="msg" style="margin-top:6px"></div>' +
      '<div style="margin-top:8px;text-align:right"><button data-k="stop" style="cursor:pointer;' +
      'background:#3a4152;color:#fff;border:0;border-radius:6px;padding:4px 10px">Остановить</button></div>';
    document.documentElement.appendChild(panel);
    panel.querySelectorAll('[data-k]').forEach(el => { lines[el.dataset.k] = el; });
    lines.stop.onclick = () => { stopRequested = true; say('Останавливаю…'); };
  }
  function set(k, text) { ui(); lines[k].textContent = text; }
  function say(text, color) { set('msg', text); lines.msg.style.color = color || '#f2f2f2'; }

  // ---------------------------------------------------------------- запросы WB
  class Blocked extends Error {}
  let stopRequested = false;
  let halted = false;           // WB попросил проверку: встают ВСЕ потоки, а не один

  function headers() {
    const auid = (document.cookie.match(/(?:^|;\s*)_wbauid=([^;]+)/) || [])[1] || '';
    const h = {'x-userid': '0', 'x-queryid': `qid${auid}${Date.now()}`};
    const dev = localStorage.getItem('wbx__sessionID');
    if (dev) h.deviceid = dev;
    return h;
  }

  /** GET на /__internal/…: объект, 'EMPTY' (200 с пустым телом) или null (сбой). */
  async function wb(path, params) {
    const url = path + '?' + new URLSearchParams(params).toString();
    for (let attempt = 0; attempt < 4; attempt++) {
      if (stopRequested) throw new Error('остановлено');
      if (halted) throw new Blocked('пауза');
      let r;
      try {
        r = await fetch(url, {credentials: 'include', headers: headers()});
      } catch (e) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (r.status === 403 || r.status === 498) { halted = true; throw new Blocked(String(r.status)); }
      if (r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
      if (!r.ok) { await sleep(1500 * (attempt + 1)); continue; }
      const text = await r.text();
      if (!text.trim()) return 'EMPTY';
      try { return JSON.parse(text); } catch (e) { await sleep(1000); }
    }
    return null;
  }

  async function shelf(comp, targets, dest, maxPos) {
    const want = new Set(targets.map(String));
    const pos = {};
    let seen = 0, total = null, pages = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await wb('/__internal/u-recom/recom/ru/common/v8/search', {
        ab_testing: 'false', curr: 'rub', resultset: 'catalog', spp: '30',
        suppressSpellcheck: 'false', appType: '1', query: String(comp),
        page: String(page), dest: String(dest)});
      if (data === 'EMPTY') return page === 1 ? {s: 'missing'} : {s: 'ok', t: total, pg: pages, p: pos};
      if (data === null) return page === 1 ? {s: 'failed'} : {s: 'ok', t: total, pg: pages, p: pos};
      pages++;
      if (total === null) total = data.total;
      const products = data.products || [];
      if (!products.length) break;
      for (const p of products) {
        seen++;
        const id = String(p.id);
        if (want.has(id) && !(id in pos)) pos[id] = seen;
      }
      // Как в облаке: останавливаться по «пришло меньше 100» НЕЛЬЗЯ — WB штатно
      // отдаёт 99 на первой странице. Только по total, лимиту или «нашли всех».
      if (Object.keys(pos).length >= want.size) break;
      if (total && seen >= total) break;
      if (seen >= maxPos) break;
      await sleep(PAUSE_MS);
    }
    return {s: 'ok', t: total, pg: pages, p: pos};
  }

  async function cardsBatch(ids, dest, job) {
    const data = await wb('/__internal/u-card/cards/v4/detail', {
      appType: '1', curr: 'rub', dest: String(dest), spp: '30', ab_testing: 'false',
      lang: 'ru', nm: ids.join(';')});
    ids.forEach(id => job.res.cards_asked.push(id));
    // Пустое тело на пачку — не «сотни карточек удалены», а не отдалась пачка.
    if (data === null || (data === 'EMPTY' && ids.length > 1)) {
      ids.forEach(id => job.res.cards_failed.push(id));
      return;
    }
    for (const p of (data === 'EMPTY' ? [] : (data.products || []))) {
      let k = null;
      for (const s of p.sizes || []) { if (s.price && s.price.product) { k = s.price.product; break; } }
      job.res.cards[String(p.id)] = {k, b: p.brand || '', sid: p.supplierId || null};
    }
  }

  // ------------------------------------------------------------------ прогон
  async function heartbeat(job) { job.beat = Date.now(); job.tab = TAB; await store.set(KEY_JOB, job); }
  // Номер вкладки переживает F5 (sessionStorage): обновлённая страница продолжает
  // свой же сбор, а не принимает его за чужой.
  const TAB = sessionStorage.getItem(KEY_JOB + '.tab') ||
    (() => { const t = Math.random().toString(36).slice(2); sessionStorage.setItem(KEY_JOB + '.tab', t); return t; })();

  async function run(job) {
    const plan = job.plan;
    set('title', `${plan.title} · план от ${plan.built_at.slice(0, 16).replace('T', ' ')}`);
    const comps = Object.keys(plan.shelves);
    const batches = [];
    for (let i = 0; i < plan.cards.length; i += CARD_BATCH) batches.push(plan.cards.slice(i, i + CARD_BATCH));

    const showShelves = () => set('shelves', `Полки: ${Object.keys(job.res.shelves).length} из ${comps.length}`);
    const showCards = () => set('cards', `Цены и карточки: пачек ${job.cardsDone || 0} из ${batches.length}`);
    showShelves(); showCards();
    say('Идёт сбор. Вкладку не закрывайте — можно работать в других.');

    const queue = comps.filter(c => !(c in job.res.shelves));
    let sinceSave = 0;
    const worker = async () => {
      while (queue.length) {
        const comp = queue.shift();
        job.res.shelves[comp] = await shelf(comp, plan.shelves[comp], plan.dest, plan.max_positions || 600);
        showShelves();
        if (++sinceSave >= SAVE_EVERY) { sinceSave = 0; await heartbeat(job); }
        await sleep(PAUSE_MS);
      }
    };
    await Promise.all(Array.from({length: WORKERS}, worker));
    await heartbeat(job);

    for (let i = job.cardsDone || 0; i < batches.length; i++) {
      await cardsBatch(batches[i], plan.dest, job);
      job.cardsDone = i + 1;
      showCards();
      await heartbeat(job);
      await sleep(PAUSE_MS);
    }

    // Полки, которые не отдались, — ещё один спокойный проход (как в облаке).
    const failed = comps.filter(c => job.res.shelves[c].s === 'failed');
    if (failed.length) {
      say(`Повторяю ${failed.length} не отдавшихся полок…`);
      for (const comp of failed) {
        await sleep(1500);
        const again = await shelf(comp, plan.shelves[comp], plan.dest, plan.max_positions || 600);
        if (again.s !== 'failed') job.res.shelves[comp] = again;
      }
    }

    say('Отправляю в книги…');
    job.res.at = new Date().toISOString();
    job.res.finished_at = job.res.at;
    const ans = await hub('result', plan.contour, job.res);
    if (!ans || !ans.ok) throw new Error('хаб не принял итог: ' + ((ans && ans.error) || 'нет ответа'));
    await store.del(KEY_JOB);
    const bad = comps.filter(c => job.res.shelves[c].s === 'failed').length;
    say(`Готово. Книги обновятся сами за 3–5 минут${bad ? ` (не отдались полок: ${bad})` : ''}. ` +
        'Вкладку можно закрыть.', '#8fe39a');
    lines.stop.style.display = 'none';
  }

  async function start(contour) {
    let who = await store.get(KEY_WHO);
    if (!who) {
      who = (prompt('Полки WB: как вас подписать в журнале сбора? (имя)') || '').trim();
      if (who) await store.set(KEY_WHO, who);
    }
    say('Беру план сбора…');
    const ans = await hub('get_plan', contour);
    if (!ans || !ans.ok) throw new Error('план не получен: ' + ((ans && ans.error) || 'нет ответа'));
    const job = {v: VERSION, contour, who, started: Date.now(), plan: ans.plan,
                 res: {v: VERSION, contour, who, plan_at: ans.plan.built_at,
                       started_at: new Date().toISOString(), shelves: {}, cards: {},
                       cards_asked: [], cards_failed: []}};
    await heartbeat(job);
    await hub('start', contour, {who, note: `полок ${Object.keys(ans.plan.shelves).length}, ` +
                                           `карточек ${ans.plan.cards.length}, расширение ${VERSION}`});
    return job;
  }

  async function main() {
    const m = location.hash.match(/wbshelf=([\w-]+)/);
    let job = await store.get(KEY_JOB);
    if (!m && !job) return;                                  // обычная страница WB

    if (job && job.tab !== TAB && Date.now() - (job.beat || 0) < HEARTBEAT_MS) {
      if (m) { ui(); say('Сбор уже идёт в другой вкладке WB — дождитесь его там.'); }
      return;
    }
    if (m) history.replaceState(null, '', location.pathname + location.search);
    ui();
    try {
      if (!job || (m && job.contour !== m[1])) job = await start(m[1]);
      else say('Продолжаю сбор с того же места…');
      await run(job);
    } catch (e) {
      if (e instanceof Blocked) {
        if (job) { job.beat = 0; await store.set(KEY_JOB, job); }
        say('WB попросил проверку браузера. Обновите страницу (F5) — сбор продолжится сам ' +
            'с того же места.', '#ffd479');
        return;
      }
      if (String(e.message) === 'остановлено') {
        await store.del(KEY_JOB);
        if (job) await hub('abort', job.contour, {who: job.who, reason: 'остановлено вручную'});
        say('Сбор остановлен. Книги не менялись.', '#ffd479');
        return;
      }
      say('Ошибка: ' + e.message + '. Обновите страницу — сбор продолжится.', '#ff9b9b');
    }
  }

  main();
})();
