// Matrice Live/Offline : vrais moteurs, données fictives, Chromium et WebKit, iPhone et PC.
'use strict';
const fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync('site/index.html', 'utf8'), PW = fs.readFileSync('.passphrase', 'utf8').trim();
const U = 'https://ipoower.github.io/iPoower/race-control/', T0 = Date.parse('2026-10-03T23:55:00+02:00');
let serverNow = T0, faults = '', hang = false, calls = 0, pending = [];
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [serverNow])); } static now() { return serverNow; } }
const model = { Date: Clock, Intl, Math, Map, Set, JSON };
vm.createContext(model); vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.payload=makeDemoPayload;this.ens=makeDemoEnsemble;this.nc=makeDemoNowcast;', model);
const rows = [], errors = []; let failures = 0;
const check = (name, ok, detail) => { rows.push((ok ? '✅ ' : '❌ ') + name + (detail ? ' · ' + detail : '')); if (!ok) failures++; };
async function meteoReply(route, url) {
  const J = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
  if (faults === '429') return J({ error: true, reason: 'Too many requests' }, 429, { 'retry-after': '120' });
  const q = new URL(url).searchParams, lat = String(q.get('latitude')).split(','), lon = String(q.get('longitude')).split(',');
  const one = i => {
    const p = model.payload('doux', { lat: +lat[i], lon: +lon[i] }, 'Europe/Paris');
    if (faults === 'old') p.current.time = '2026-10-03T20:00';
    if (faults === 'invalid') p.hourly.temperature_2m[0] = 999;
    if (faults === 'partial') p.hourly.precipitation = p.hourly.time.map(() => null);
    return p;
  };
  if (lat.length > 1) return J(lat.map((_, i) => one(i)));
  const p = one(0); return J(url.includes('ensemble') ? model.ens(p) : q.has('minutely_15') ? model.nc(p) : p);
}
async function session(b, mobile) {
  serverNow = T0; faults = ''; hang = false; calls = 0; pending = [];
  const c = await b.newContext({ viewport: { width: mobile ? 414 : 1360, height: mobile ? 896 : 900 }, isMobile: mobile, hasTouch: mobile, timezoneId: 'Europe/Paris' });
  await c.addInitScript(() => { window.__OFFLINE = false; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__OFFLINE }); });
  const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: T0 });
  await p.route('**/*', r => {
    const u = r.request().url(), J = o => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.includes('open-meteo.com')) { calls++; if (hang) { pending.push([r, u]); return; } return meteoReply(r, u); }
    if (u.includes('/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(process.env.SP + '/cal.fake.json', 'utf8') });
    if (u.includes('/obs.json')) return J({ stations: {} });
    if (u.includes('/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const settle = async (n = 16) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(100); } };
  await p.goto(U); await p.clock.runFor(2500); await p.fill('#unlockPw', PW);
  await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle();
  await p.evaluate(() => { appSetCar(S.cars[0].id); UI.view = 'meteo'; renderAll(); }); await settle(2);
  return { p, c, settle };
}
const state = p => p.evaluate(() => {
  const m = M[UI.loc], raw = RAW[UI.loc], current = m && m.hs[m.nowI];
  return { now: m && m.nowStr, mode: m && m.mode, receipt: raw && raw.t, T: m && m.cur.T, hourlyT: current && current.T,
    bar: document.querySelector('#statusbar').innerText, weather: document.querySelector('#secWx').innerText,
    busy, activeCar: appActiveCar() && appActiveCar().id, card: document.querySelector('.wx-hours-card')?.dataset.hour,
    thermal: CX ? !!tyreLab(labInput(appActiveCar())).thermal : false, decision: DECISION_LAST && DECISION_LAST.confidence.key,
    cache: raw && JSON.stringify(raw.p), y: window.scrollY, left: document.querySelector('.wx-hours-track')?.scrollLeft };
});
(async () => {
  const b = await require('./lib/browser').launch();
  try {
    for (const mobile of [true, false]) {
      const dev = mobile ? 'iPhone' : 'PC', { p, c, settle } = await session(b, mobile);
      let s = await state(p); check(dev + ' · en ligne : météo reçue et estimations disponibles', s.mode === 'live' && s.thermal && /LIVE/.test(s.bar));
      // Une actualisation est interrompue par la perte de réseau ; les réponses déjà en vol peuvent finir, jamais en LIVE.
      hang = true; await p.evaluate(() => refreshAll()); await settle(2); const before = await state(p);
      await p.evaluate(() => { window.__OFFLINE = true; window.dispatchEvent(new Event('offline')); });
      hang = false; await Promise.allSettled(pending.splice(0).map(([r, u]) => meteoReply(r, u))); await settle(); s = await state(p);
      check(dev + ' · coupure pendant actualisation : cache valide conservé, jamais LIVE', s.mode === 'cache' && !/LIVE/.test(s.bar) && s.cache && s.receipt >= before.receipt && !s.busy);
      const receipt = s.receipt, count = calls;
      await p.evaluate(() => { document.querySelector('.wx-hours-track').scrollLeft = 140; window.scrollTo(0, Math.min(80, Math.max(0, document.documentElement.scrollHeight - innerHeight) / 2)); }); const scroll = await state(p);
      for (const at of ['2026-10-04T00:00:00+02:00', '2026-10-04T02:30:00+02:00', '2026-10-04T06:15:00+02:00']) {
        serverNow = Date.parse(at); await p.clock.setSystemTime(serverNow); await p.clock.runFor(31000); await settle(2); s = await state(p);
        const expect = at.slice(0, 16);
        check(dev + ' · offline ' + expect + ' : horloge et température horaire progressent, réception inchangée', s.now === expect && s.T === s.hourlyT && s.receipt === receipt && s.mode === 'cache' && calls === count && !/LIVE/.test(s.bar), JSON.stringify({ now: s.now, receipt: s.receipt, calls, count }));
        if (expect.endsWith('00:00')) check(dev + ' · minuit : date et première carte du jour exactes, aucun rechargement', s.card === '2026-10-04T00:00' && s.activeCar === before.activeCar);
        check(dev + ' · actualisation locale : position verticale préservée', Math.abs(s.y - scroll.y) <= 2, JSON.stringify({ before: scroll.y, after: s.y }));
      }
      s = await state(p); check(dev + ' · actualisations locales : défilement horizontal préservé', Math.abs((s.left || 0) - (scroll.left || 0)) <= 2);
      // La température courante et la mémoire thermique lisent le modèle reconstruit.
      const shared = await p.evaluate(() => { const car = appActiveCar(), lab = tyreLab(labInput(car)); return CX.m === M[UI.loc] && lab.env.Ta === M[UI.loc].hs[M[UI.loc].nowI].T; });
      check(dev + ' · calculs offline synchronisés entre Météo/Pneus/Analyse', shared);
      // Réveil et reconnexion répétés : un seul lot pendant le verrou busy.
      await p.evaluate(() => { window.__OFFLINE = false; window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); }); await settle(); s = await state(p);
      check(dev + ' · réveil et reconnexion : données nouvelles validées, retour LIVE sans recharge', s.mode === 'live' && s.receipt > receipt && !s.busy && /LIVE/.test(s.bar));
      const recent = s.cache;
      faults = 'old'; await p.evaluate(() => refreshAll()); await settle(); s = await state(p);
      check(dev + ' · API ancienne : dernière donnée valide et son horodatage conservés', s.cache === recent && s.mode === 'cache' && !/LIVE/.test(s.bar));
      faults = 'invalid'; await p.evaluate(() => refreshAll()); await settle(); s = await state(p);
      check(dev + ' · API aberrante : 999 °C rejeté, cache inchangé', s.cache === recent && !s.weather.includes('999') && s.mode === 'cache');
      faults = 'partial'; await p.evaluate(() => refreshAll()); await settle(); s = await state(p);
      const missing = await p.evaluate(() => { const d = wxDesk(wxInput()), lab = tyreLab(labInput(appActiveCar())); return { score: d.road.score, thermal: !!lab.thermal, decision: DECISION_LAST.confidence.key }; });
      check(dev + ' · API partielle : température prévue possible, route/thermique indisponibles, confiance dégradée', s.T != null && missing.score === null && !missing.thermal && missing.decision === 'degraded', JSON.stringify(missing));
      faults = '429'; await p.evaluate(() => refreshAll()); await settle(); const paused = calls;
      await p.evaluate(() => { refreshAll(); autoTick(); window.dispatchEvent(new Event('focus')); }); await settle(3); s = await state(p);
      check(dev + ' · HTTP 429 : appels suspendus pendant Retry-After, cache conservé', calls === paused && /429|limité/.test(s.bar) && !/LIVE/.test(s.bar));
      faults = ''; serverNow = await p.evaluate(() => Math.max(WEATHER_REQUESTS.state().until, lastTry + 5 * 60e3) + 1000); await p.clock.setSystemTime(serverNow);
      await p.evaluate(() => { lastOk = 0; lastTry = 0; autoTick(); }); await settle(); s = await state(p);
      check(dev + ' · HTTP 429 terminé : reprise validée automatique', calls > paused && s.mode === 'live' && !s.busy, JSON.stringify({ calls, paused, mode: s.mode, busy: s.busy, now: s.now }));
      // Un horizon entièrement dépassé reste consultable comme cache, mais aucune valeur « maintenant » n'est extrapolée.
      await p.evaluate(() => { window.__OFFLINE = true; window.dispatchEvent(new Event('offline')); });
      await p.evaluate(() => { // Horizon fictif dépassé, session réelle de 7 jours toujours intacte.
        for (const raw of Object.values(RAW)) for (const key of Object.keys(raw.p.hourly))
          if (Array.isArray(raw.p.hourly[key])) raw.p.hourly[key] = raw.p.hourly[key].slice(0, 24);
      });
      await p.clock.setSystemTime(await p.evaluate(() => Date.now() + 60e3)); await p.clock.runFor(31000); await settle(2); s = await state(p);
      check(dev + ' · horizon expiré : météo actuelle indisponible, aucune extrapolation', s.T === null && !s.thermal && /INDISPONIBLE/.test(s.weather) && !/LIVE/.test(s.bar), JSON.stringify({ T: s.T, thermal: s.thermal, now: s.now, weather: s.weather.slice(0, 180) }));
      await c.close();
    }
    check('aucune erreur JavaScript dans la matrice', errors.length === 0, errors.slice(0, 4).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n' + (rows.length - failures) + '/' + rows.length + ' scénarios Live/Offline OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
