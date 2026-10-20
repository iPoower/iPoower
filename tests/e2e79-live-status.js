// Vrai HTML et vrais planificateurs ; réseau, profil, veille et temps entièrement simulés.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const T0 = Date.parse('2026-10-19T18:33:10+02:00'); let providerNow = T0;
const NativeDate = Date, TestDate = class extends NativeDate { constructor(...a) { super(...(a.length ? a : [providerNow])); } static now() { return providerNow; } };
const model = vm.createContext({ console, Math, Date: TestDate, Intl, Map, Set, JSON });
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.payload=makeDemoPayload;this.ensemble=makeDemoEnsemble;this.nowcast=makeDemoNowcast;', model);
const U = 'https://ipoower.github.io/iPoower/race-control/', html = fs.readFileSync('site/index.html', 'utf8'), pass = fs.readFileSync('.passphrase', 'utf8').trim();
let failures = 0; const rows = [], errors = [], check = (name, ok) => { rows.push((ok ? '✅ ' : '❌ ') + name); if (!ok) failures++; };
(async () => {
  const browser = await require('./lib/browser').launch();
  // Le fuseau du navigateur est volontairement différent : l’horloge doit rester celle de Paris.
  const context = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });
  await context.addInitScript(() => {
    window.__offline = false; window.__hidden = false;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__offline });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: T0 });
  let requests = 0, mainRequests = 0, observationReads = 0, hold = false, limited = false; const pending = [];
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...(status === 429 ? { 'retry-after': '900', 'access-control-expose-headers': 'retry-after' } : {}) }, body: JSON.stringify(data) });
  const reply = async (route, url) => {
    if (limited) return json(route, { error: true, reason: 'Minutely API request limit exceeded.' }, 429);
    providerNow = await page.evaluate(() => Date.now());
    const q = new URL(url).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
    const one = i => model.payload('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
    if (lats.length > 1) return json(route, lats.map((_, i) => one(i)));
    const value = one(0); return json(route, url.includes('ensemble') ? model.ensemble(value) : q.has('minutely_15') ? model.nowcast(value) : value);
  };
  await page.route('**/*', async route => {
    const url = route.request().url(), u = new URL(url);
    if (/(^|\.)open-meteo\.com$/.test(u.hostname)) {
      requests++; if (u.searchParams.has('current')) mainRequests++;
      if (hold) { pending.push([route, url]); return; } return reply(route, url);
    }
    if (url.includes('/race-control/calendar.sealed.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(process.env.SP, 'cal.fake.json'), 'utf8') });
    if (url.includes('/race-control/obs.json')) { observationReads++; return json(route, { stations: {} }); }
    if (url.includes('/race-control/tiredb.json')) return json(route, JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
    if (url.startsWith(U) && !/\.(js|json)$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    return route.abort();
  });
  const settle = async (n = 12) => { for (let i = 0; i < n; i++) { await page.clock.runFor(500); await page.waitForTimeout(60); } };
  const status = () => page.evaluate(() => ({ clock: document.querySelector('#liveClock').textContent, receipt: document.querySelector('#weatherReceived').textContent,
    detail: document.querySelector('#weatherFreshness').textContent, label: document.querySelector('#weatherState').textContent, at: dataAt(), now: Date.now(), modelNow: M[UI.loc] && M[UI.loc].nowStr }));
  await page.goto(U); await page.clock.runFor(2000); await page.fill('#unlockPw', pass);
  await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#unlockForm button[type="submit"]')]); await settle(20);
  const settings = await page.evaluate(() => JSON.stringify(S));
  await page.evaluate(() => {
    UI.view = 'meteo'; renderAll();
    window.__fullRenders = 0; const draw = renderAll; renderAll = function () { window.__fullRenders++; return draw(); };
    window.__hiddenCar = document.querySelector('#secCars').firstElementChild; window.__clockNode = document.querySelector('#liveClock'); window.__refreshNode = document.querySelector('#statusbar [data-act="refresh"]');
    const details = document.querySelector('#secWx details[data-ux]'); details.open = true; details.querySelector('summary').focus();
    window.__fold = details.dataset.ux;
  });
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  let before = await status(); const count = requests;
  await page.clock.runFor(3000); let after = await status();
  check('secondes réelles de Paris, malgré le fuseau différent du navigateur', after.clock === new Date(after.now).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour12: false }));
  check('trois secondes sans requête, sans rendu complet et sans remplacer les nœuds', after.now - before.now === 3000 && after.clock !== before.clock && count === requests && await page.evaluate(() => __fullRenders === 0 && __clockNode === document.querySelector('#liveClock') && __refreshNode === document.querySelector('#statusbar [data-act="refresh"]')));
  check('horloge silencieuse pour le lecteur d’écran et réception indépendante', await page.locator('#liveClock').getAttribute('aria-live') === 'off' && after.receipt === before.receipt && after.at === before.at);
  check('bandeau compact sur iPhone 414 : moins de 100 px en fonctionnement normal', await page.evaluate(() => document.querySelector('#statusbar').closest('.statusbar').getBoundingClientRect().height <= 100));
  check('lot 1 UX : à 414 pt, bandeau sur deux lignes (≤ 80 px), réception, horloge et bouton 44 pt sur la première', await page.evaluate(() => {
    if (innerWidth < 380 || innerWidth > 560) return true;
    const bar = document.querySelector('#statusbar').closest('.statusbar').getBoundingClientRect(), r = s => document.querySelector(s).getBoundingClientRect();
    const row = [r('#weatherBadge'), r('#weatherReceived'), r('#liveClock'), r('#statusbar [data-act=refresh]')], mid = b => b.top + b.height / 2;
    return bar.height <= 80 && row.every(b => Math.abs(mid(b) - mid(row[0])) < 12) && row[3].width >= 44 && row[3].height >= 44 && r('#weatherFreshness').top > row[0].bottom - 1;
  }));
  // Franchir une minute sans laisser le téléchargement vieillir artificiellement.
  const nextMinute = Math.ceil(after.now / 60000) * 60000;
  await page.clock.setSystemTime(nextMinute - 1000); await page.clock.runFor(2000); after = await status();
  check('minute : âge exact, modèle temporel avancé et réception inchangée', after.at === before.at && after.detail.includes(Math.floor((after.now - after.at) / 60000) < 1 ? '< 1 min' : 'il y a ' + Math.floor((after.now - after.at) / 60000) + ' min') && after.modelNow === new Date(after.now).toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 16).replace(' ', 'T'));
  check('minute : panneau déployé, focus du résumé et onglets masqués conservés', await page.evaluate(() => { const d = [...document.querySelectorAll('#secWx details[data-ux]')].find(x => x.dataset.ux === __fold); return d.open && document.activeElement === d.querySelector('summary') && __fullRenders === 0 && __hiddenCar === document.querySelector('#secCars').firstElementChild; }));
  // Les champs existants de Réglages restent les mêmes nœuds au changement de minute.
  await page.evaluate(() => { const settings = document.querySelector('#settings'); settings.open = true; }); await settle(2); await page.evaluate(() => { const settings = document.querySelector('#settings'); const input = settings.querySelector('input[type="text"]'); input.focus(); window.__focusedInput = input; window.__inputValue = input.value; });
  await page.clock.runFor(60000);
  check('saisie : focus, valeur et élément de formulaire intacts', await page.evaluate(() => document.activeElement === __focusedInput && __focusedInput.isConnected && __focusedInput.value === __inputValue));
  await page.evaluate(() => { document.activeElement.blur(); document.querySelector('#settings').open = false; const source = document.querySelector('#srcline details'); source.open = true; source.querySelector('summary').focus(); });
  await page.clock.runFor(60000);
  check('sources : panneau ouvert et focus conservés à la minute suivante', await page.evaluate(() => { const d = document.querySelector('#srcline details'); return d.open && document.activeElement === d.querySelector('summary') && /validité du modèle/.test(d.textContent) && !/dernière observation/.test(d.textContent); }));
  // Aucun appel météo avant cinq minutes ; le heartbeat existant vérifie l’échéance sous trente secondes.
  await page.evaluate(() => { lastTry = Date.now(); lastOk = lastTry; });
  const mainBefore = mainRequests; await page.clock.runFor(299000);
  check('cinq minutes : aucun téléchargement du modèle principal avant l’échéance', mainRequests === mainBefore);
  await page.clock.runFor(32000); await settle();
  check('cinq minutes : vérification automatique après l’échéance, sans clic', mainRequests > mainBefore && (await status()).label === 'LIVE');
  // Le lieu affiché possède sa propre réception, même pendant une vague en cours.
  hold = true; await page.evaluate(() => { void refreshAll(); }); await page.clock.runFor(1000);
  await page.evaluate(() => { UI.loc = S.locs[1].id; RAW[UI.loc].t = Date.now() - 120000; renderStatus(); });
  after = await status();
  check('changement de lieu pendant une requête : réception et âge de ce lieu, état ACTUALISATION', after.label === 'ACTUALISATION' && /il y a 2 min/.test(after.detail));
  hold = false; await Promise.all(pending.splice(0).map(([r, u]) => reply(r, u))); await settle();
  // Veille simulée : le minuteur de la seconde est réellement désarmé.
  await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  before = await status(); await page.clock.runFor(3000); after = await status();
  check('page masquée : zéro minuteur d’horloge et aucune écriture de seconde', before.clock === after.clock && await page.evaluate(() => LIVE_CLOCK_TIMER === null));
  await page.clock.setSystemTime(after.now + 6 * 3600000); hold = true;
  await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); });
  await page.clock.runFor(1000); after = await status();
  check('reprise après six heures : heure resynchronisée, donnée ancienne jamais LIVE', after.label !== 'LIVE' && after.clock === new Date(after.now).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour12: false }));
  hold = false; await Promise.all(pending.splice(0).map(([r, u]) => reply(r, u))); await settle();
  await page.evaluate(() => { window.__offline = true; window.dispatchEvent(new Event('offline')); }); await settle(2);
  check('hors ligne : cache daté et prochaine vérification au retour du réseau', (await status()).label === 'HORS LIGNE' && /retour du réseau/.test((await status()).detail));
  const offlineCount = requests; await page.clock.runFor(60000);
  check('horloge et âge hors ligne sans appel météo', offlineCount === requests);
  await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); }); await settle();
  check('retour du réseau : reprise existante et réception fraîche', (await status()).label === 'LIVE');
  await page.evaluate(() => { window.scrollTo(0, 0); });
  for (const width of [414, 1440]) for (const theme of ['dark', 'light']) { await page.setViewportSize({ width, height: width === 1440 ? 900 : 896 }); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.screenshot({ path: path.join(process.env.SP, `place-live-v13-fresh-${process.env.BROWSER || 'chromium'}-${width}-${theme}.png`) }); }
  limited = true; await page.evaluate(() => { void refreshAll(); }); await settle(); after = await status();
  check('429 : LIMITÉ, cache conservé et reprise annoncée', after.label === 'LIMITÉ' && after.at !== null && /reprise automatique après/.test(after.detail));
  const limitCount = requests; await page.clock.runFor(30000);
  check('429 : l’horloge ne contourne ni la pause ni les boutons désactivés', limitCount === requests && await page.locator('#statusbar [data-act="refresh"]').isDisabled());
  const relayBefore = observationReads; await page.clock.runFor(330000); await settle();
  check('429 : relais et agenda continuent leur cycle, sans requête Open-Meteo pendant la pause', observationReads > relayBefore && requests === limitCount && (await status()).label === 'LIMITÉ');
  // Recette visuelle avec données fictives, dans les deux thèmes et aux quatre largeurs.
  for (const width of [414, 375, 320, 1440]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 896 });
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    const fit = await page.evaluate(() => { const root = document.querySelector('#statusbar'); return document.documentElement.scrollWidth <= innerWidth + 1 && root.getBoundingClientRect().right <= innerWidth + 1 && [...root.querySelectorAll('button,time,.live-clock-wrap,.weather-received,.status-detail')].every(x => x.getBoundingClientRect().right <= innerWidth + 1 && x.getBoundingClientRect().left >= -1); });
    check(`bandeau ${width}px ${theme} : aucun débordement`, fit);
    if (width === 414 || width === 1440) await page.screenshot({ path: path.join(process.env.SP, `place-live-v13-${process.env.BROWSER || 'chromium'}-${width}-${theme}.png`), fullPage: false });
  }
  check('réglages et préférences conservés ; journal automatique enrichi sans disparition d’entrée', await page.evaluate(value => { const before = JSON.parse(value), current = { ...S }; const journal = before.journal || {}; delete before.journal; delete current.journal; return JSON.stringify(current) === JSON.stringify(before) && Object.keys(journal).every(k => Object.hasOwn(S.journal, k)); }, settings));
  check('libellé accessible de l’horloge masqué visuellement et lisible sans annonce répétée', await page.evaluate(() => { const label = document.querySelector('.live-clock-wrap .sr-only'), r = label.getBoundingClientRect(); return getComputedStyle(label).position === 'absolute' && r.width <= 1 && r.height <= 1 && label.textContent.includes('Europe/Paris'); }));
  check('aucune erreur JavaScript', errors.length === 0);
  console.log(rows.join('\n') + `\n\n${rows.length - failures}/${rows.length} scénarios OK · erreurs JS : ${errors.length ? 'présentes' : 'aucune'}`);
  await context.close(); await browser.close(); process.exit(failures || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
