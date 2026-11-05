// Lot S · rechargement HORS LIGNE sur une vue demandée par l'URL (?vue=garage). Données fictives, aucun appel externe réel.
// A. Hors ligne applicatif (Chromium ET WebKit, comme e2e36) : navigator.onLine forcé, appels externes coupés, page servie par
//    le banc. Rechargement et ouverture directe sur ?vue=garage : vue Garage affichée, URL intacte (paramètres étrangers
//    conservés), HORS LIGNE et données en cache, jamais LIVE ; au chargement, replaceState sans URL et aucun pushState.
// B. VRAI Service Worker, profil persistant, réseau coupé (Chromium seulement : Playwright ne pilote les Service Workers que
//    sous Chromium, comme e2e41) : navigateur fermé puis rouvert hors ligne directement sur ?vue=garage → shell servi par le SW
//    malgré le paramètre, déverrouillage hors ligne, vue Garage, URL intacte.
'use strict';
const fs = require('fs'), os = require('os'), http = require('http'), path = require('path'), vm = require('vm'), pw = require('playwright');
const NAME = (process.env.BROWSER || 'chromium').toLowerCase();
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const T0 = new Date('2026-10-05T06:00:00+02:00').getTime(), RD = Date, FD = class extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
const ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/';
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅' : '❌') + ' ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); if (!ok) fail++; };
// Journal des appels d'historique de la page (posé avant tout script de l'app, survit aux rechargements par sessionStorage).
const HIST = () => { const log = JSON.parse(sessionStorage.getItem('__hist') || '[]'), save = () => sessionStorage.setItem('__hist', JSON.stringify(log));
  for (const k of ['pushState', 'replaceState']) { const f = history[k].bind(history); history[k] = (s, t, url) => { log.push({ k, url: url === undefined ? null : String(url), at: location.pathname + location.search }); save(); return f(s, t, url); }; }
  window.__histLog = () => JSON.parse(sessionStorage.getItem('__hist') || '[]'); window.__histReset = () => { log.length = 0; save(); }; };
const view = p => p.evaluate(() => ({ view: UI.view, search: location.search, hash: location.hash, pressed: (document.querySelector('#viewSeg [data-v=garage]') || {}).getAttribute?.('aria-pressed'), state: history.state, bar: ((document.querySelector('#statusbar') || {}).innerText || '').replace(/\s+/g, ' '), hist: window.__histLog() }));
const loadHist = h => { const i = h.map(x => x.k).lastIndexOf('replaceState'); return { push: h.filter(x => x.k === 'pushState').length, urls: h.filter(x => x.url !== null).length, rep: i >= 0 }; };

async function partA() {
  const b = await require('./lib/browser').launch(), c = await b.newContext({ viewport: { width: 414, height: 896 }, isMobile: NAME !== 'firefox', hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
  await c.addInitScript(() => { window.__OFFLINE = sessionStorage.getItem('__offline') === '1'; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__OFFLINE }); window.__setOffline = v => { window.__OFFLINE = !!v; sessionStorage.setItem('__offline', v ? '1' : '0'); window.dispatchEvent(new Event(v ? 'offline' : 'online')); }; });
  await c.addInitScript(HIST);
  const p = await c.newPage(); await p.clock.install({ time: T0 }); let cut = false, external = 0;
  p.on('pageerror', e => rows.push('ERR ' + e.message));
  await p.route('**/*', r => { const u = r.request().url(), J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('open-meteo.com')) { external++; if (cut) return r.abort(); const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(','), one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0); if (lats.length > 1) return J(lats.map((_, i) => one(i))); const base = one(0); return J(u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : base); }
    if (u.includes('api.bigdatacloud.net') || u.includes('public.opendatasoft.com') || u.includes('api.rainviewer.com') || u.includes('router.project-osrm.org')) { external++; return cut ? r.abort() : J(u.includes('api.bigdatacloud.net') ? { locality: 'Ville test' } : u.includes('api.rainviewer.com') ? { version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } } : { records: [] }); }
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.abort();
    if (u.includes('leaflet/1.9.4/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (u.includes('leaflet/1.9.4/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (u.includes('/race-control/calendar.sealed.json')) return cut ? r.abort() : r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('/race-control/obs.json')) return cut ? r.abort() : J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.includes('/race-control/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '// test' });
    if (u.startsWith(U) && !/\.(js|json|png|webmanifest)(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });   // shell, quel que soit le paramètre (comme le SW)
    return r.abort(); });
  const settle = async (n = 8) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(120); } };
  await p.goto(U); await p.clock.runFor(2500); await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle(14);
  const cached = await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('twrc.cache.')));
  check(`A.0 [${NAME}] · en ligne : app déverrouillée, météo fictive en cache`, cached);
  // Geste réel vers Garage : une entrée ?vue=garage (pushState), puis coupure réseau.
  await p.evaluate(() => scrollTo(0, 0)); await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await settle(2);
  const g = await view(p);
  check(`A.1 [${NAME}] · geste vers Garage : ?vue=garage dans l’URL`, g.view === 'garage' && g.search === '?vue=garage', JSON.stringify({ view: g.view, search: g.search }));
  cut = true; await p.evaluate(() => window.__setOffline(true)); await settle(3); const before = external;
  // Rechargement hors ligne sur ?vue=garage.
  await p.evaluate(() => window.__histReset()); await p.reload(); await settle(10);
  const r1 = await view(p), h1 = loadHist(r1.hist);
  check(`A.2 [${NAME}] · rechargement hors ligne sur ?vue=garage : vue Garage affichée, URL intacte`, r1.view === 'garage' && r1.pressed === 'true' && r1.search === '?vue=garage' && r1.state && r1.state.vue === 'garage', JSON.stringify({ view: r1.view, pressed: r1.pressed, search: r1.search, state: r1.state }));
  check(`A.3 [${NAME}] · rechargement : HORS LIGNE + données en cache, jamais LIVE, aucun appel externe`, /HORS LIGNE/.test(r1.bar) && /cache/i.test(r1.bar) && !/\bLIVE\b/.test(r1.bar) && external === before, r1.bar.slice(0, 160) + ' · appels ' + (external - before));
  check(`A.4 [${NAME}] · chargement : replaceState sans URL (état seul), aucun pushState, aucune réécriture`, h1.rep && h1.urls === 0 && h1.push === 0, JSON.stringify(r1.hist));
  // Ouverture directe hors ligne d'une adresse portant un paramètre étranger et un fragment.
  await p.evaluate(() => window.__histReset()); await p.goto(U + '?vue=garage&source=test#section=secSeason'); await settle(10);
  const r2 = await view(p), h2 = loadHist(r2.hist);
  check(`A.5 [${NAME}] · ouverture directe hors ligne ?vue=garage&source=test#… : Garage, paramètre et fragment conservés`, r2.view === 'garage' && r2.pressed === 'true' && r2.search === '?vue=garage&source=test' && r2.hash === '#section=secSeason', JSON.stringify({ view: r2.view, search: r2.search, hash: r2.hash }));
  check(`A.6 [${NAME}] · ouverture directe : replaceState sans URL, aucun pushState ; HORS LIGNE, jamais LIVE`, h2.rep && h2.urls === 0 && h2.push === 0 && /HORS LIGNE/.test(r2.bar) && !/\bLIVE\b/.test(r2.bar), JSON.stringify(r2.hist) + ' · ' + r2.bar.slice(0, 100));
  // Vue inconnue dans l'URL : ignorée (vue de session), URL laissée telle quelle.
  await p.goto(U + '?vue=inconnue'); await settle(8); const r3 = await view(p);
  check(`A.7 [${NAME}] · ?vue=inconnue : ignorée sans erreur, URL laissée intacte`, ['pneus', 'meteo', 'trajet', 'garage', 'analyse', 'tenue'].includes(r3.view) && r3.search === '?vue=inconnue', JSON.stringify({ view: r3.view, search: r3.search }));
  await c.close(); await b.close();
}

async function partB() {
  if (NAME !== 'chromium') { rows.push('↪️ B · vrai Service Worker : Chromium uniquement (Playwright ne pilote pas le SW sous ' + NAME + ' ; partie A couverte)'); return; }
  const SITE = path.join(process.cwd(), 'site'), LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const type = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') || f.endsWith('.webmanifest') ? 'application/json' : f.endsWith('.png') ? 'image/png' : 'text/html';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/race-control/harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script>window.boot=navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(()=>navigator.serviceWorker.ready).then(()=>new Promise(r=>navigator.serviceWorker.controller?r():navigator.serviceWorker.addEventListener("controllerchange",r)))</script>'); }
    const rel = u.pathname.replace(/^\/race-control\/?/, '') || 'index.html', file = path.join(SITE, rel);
    if (!file.startsWith(SITE) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': type(file), 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res);
  });
  const port = await new Promise((ok, ko) => server.listen(0, '127.0.0.1', () => ok(server.address().port)).on('error', ko)), base = 'http://localhost:' + port + '/race-control/';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'twrc-vue-'));
  const open = async () => { const c = await pw.chromium.launchPersistentContext(dir, { ...(fs.existsSync(LOCAL) ? { executablePath: LOCAL } : {}), args: ['--no-sandbox'], serviceWorkers: 'allow',
    proxy: { server: 'http://127.0.0.1:9', bypass: 'localhost' }, viewport: { width: 414, height: 896 }, timezoneId: 'Europe/Paris' }); await c.clock.setFixedTime(new Date(T0)); await c.addInitScript(HIST); return c; };
  try {
    let c = await open(), p = c.pages()[0] || await c.newPage(); p.on('pageerror', e => rows.push('ERR ' + e.message));
    await p.goto(base + 'harness.html'); await p.evaluate(() => window.boot);
    await p.goto(base + 'index.html'); await p.waitForSelector('#statusbar .badge');
    if (await p.locator('#unlockPw').count()) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
    await p.waitForFunction(() => typeof allLocs === 'function' && typeof makeDemoPayload === 'function');
    await p.evaluate(async () => { const locs = allLocs().filter(l => !l.gps && locHasCoords(l)); if (!locs.length) throw new Error('Aucun lieu fictif.');
      locs.forEach(l => localStorage.setItem('twrc.cache.' + l.id, JSON.stringify({ t: Date.now() - 20 * 60e3, lat: l.lat, lon: l.lon, p: makeDemoPayload('doux', l, 'Europe/Paris') })));
      if (!window.TWRC_VAULT) throw new Error('Coffre absent.'); await TWRC_VAULT.flush(); if (TWRC_VAULT.error) throw new Error('Écriture chiffrée non confirmée.'); });
    await c.close();
    // Réouverture complète, réseau coupé AVANT toute requête, directement sur ?vue=garage.
    c = await open(); await c.setOffline(true); p = c.pages()[0] || await c.newPage(); p.on('pageerror', e => rows.push('ERR ' + e.message));
    const nav = await p.goto(base + '?vue=garage', { waitUntil: 'domcontentloaded' }).catch(() => null);
    check('B.1 [chromium] · réouverture hors ligne sur ?vue=garage : shell servi par le vrai Service Worker', !!nav && nav.status() === 200, nav ? String(nav.status()) : 'aucune réponse');
    await p.waitForSelector('#statusbar .badge', { timeout: 15000 }).catch(() => null);
    if (await p.locator('#unlockPw').count()) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
    await p.waitForSelector('#viewSeg [data-v=garage]', { timeout: 15000 }).catch(() => null); await p.waitForTimeout(800);
    const s = await view(p), h = loadHist(s.hist.filter(x => x.at.endsWith('?vue=garage')));
    check('B.2 [chromium] · déverrouillée hors ligne : vue Garage, URL ?vue=garage intacte après le rechargement de déverrouillage', s.view === 'garage' && s.pressed === 'true' && s.search === '?vue=garage', JSON.stringify({ view: s.view, pressed: s.pressed, search: s.search }));
    check('B.3 [chromium] · HORS LIGNE + données en cache, jamais LIVE ; aucun pushState, aucune URL réécrite', /HORS LIGNE/.test(s.bar) && /cache/i.test(s.bar) && !/\bLIVE\b/.test(s.bar) && h.push === 0 && h.urls === 0, s.bar.slice(0, 140) + ' · ' + JSON.stringify(s.hist));
    await c.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); await new Promise(r => server.close(r)); }
}

(async () => {
  await partA(); await partB();
  console.log(rows.join('\n') + '\n\n' + rows.filter(x => x.startsWith('✅')).length + '/' + rows.filter(x => /^[✅❌]/.test(x)).length + ' scénarios OK · erreurs JS : ' + (rows.some(x => x.startsWith('ERR ')) ? 'présentes' : 'aucune'));
  process.exit(fail || rows.some(x => x.startsWith('ERR ')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
