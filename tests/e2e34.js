// Origine réelle, aperçu volontaire et annulation locale : horloge, agenda, GPS et réseau fictifs.
// Le navigateur est isolé d'Internet par tests/lib/browser ; aucune donnée privée n'est nécessaire.
'use strict';
const fs = require('fs'), vm = require('vm');
const U = 'https://ipoower.github.io/iPoower/race-control/';
const html = fs.readFileSync('site/index.html', 'utf8'), PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP;
const demo = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const G = { here: { lat: 49.38471, lon: 3.30617 }, moved: { lat: 49.39913, lon: 3.33281 }, drive: { lat: 49.36752, lon: 3.27419 }, a: { lat: 49.20779, lon: 2.58743 }, b: { lat: 49.55, lon: 2.20 } };
const rows = [], errors = [], sessions = []; let failed = 0;
const check = (name, ok, detail = '') => { const row = `${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`; rows.push(row); console.log(row); if (!ok) failed++; };
const clock = iso => Date.parse(iso), short = t => t.replace(/\s+/g, ' ').slice(0, 300);
const allowed = /^(ipoower\.github\.io|router\.project-osrm\.org|[a-z-]*api\.open-meteo\.com|api\.bigdatacloud\.net|api\.rainviewer\.com|tilecache\.rainviewer\.com|server\.arcgisonline\.com|[abc]\.tile\.openstreetmap\.org|tile\.openstreetmap\.org|unpkg\.com|public\.opendatasoft\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;

async function session(browser, iso, options = {}) {
  const T0 = clock(iso), RD = Date; let forecastTime = T0;
  const FD = class extends RD { constructor(...a) { super(...(a.length ? a : [forecastTime])); } static now() { return forecastTime; } };
  const ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx);
  vm.runInContext(demo + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
  const c = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
  await c.addInitScript(() => {
    const st = { lat: 49.38471, lon: 3.30617, acc: 25, age: 0, speed: null, deny: false }, watches = new Map(); let id = 0;
    window.__geoLog = [];
    const pos = () => ({ coords: { latitude: st.lat, longitude: st.lon, accuracy: st.acc, speed: st.speed, altitude: null, altitudeAccuracy: null, heading: null }, timestamp: Date.now() - st.age });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(ok, err, o) { window.__geoLog.push({ kind: 'get', hi: !!o.enableHighAccuracy, options: o }); setTimeout(() => st.deny ? err && err({ code: 1, message: 'refus fictif' }) : ok(pos()), 0); },
      watchPosition(ok, err, o) { const n = ++id; watches.set(n, { ok, hi: !!o.enableHighAccuracy }); window.__geoLog.push({ kind: 'watch', id: n, hi: !!o.enableHighAccuracy }); return n; },
      clearWatch(n) { watches.delete(n); window.__geoLog.push({ kind: 'clear', id: n }); }
    } });
    // Chaque scénario représente l'app visible ; les onglets du harnais ne simulent pas une mise en veille.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    window.__geoSet = o => Object.assign(st, o);
    window.__geoPush = () => watches.forEach(w => w.ok(pos()));
    window.__geoWatches = () => [...watches.values()].map(w => w.hi);
  });
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  const S = { reqs: [], osrm: [], routeHold: null, routeHeld: 0, routeReleased: 0, meteoHold: null, meteoHeld: 0, forecastHold: null, forecastHeld: 0, routeDown: false, meteoDown: false, reloading: false };
  p.on('pageerror', e => { if (!(S.reloading && /access control checks/.test(e.message))) errors.push(`${iso}: ${e.message}`); });
  await p.route('**/*', async r => {
    const req = r.request(), u = req.url(); S.reqs.push({ u, method: req.method(), body: req.postData() });
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('router.project-osrm.org')) {
      S.osrm.push(u); if (S.routeDown) return r.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'route fictive indisponible' });
      if (S.routeHold) { S.routeHeld++; await S.routeHold; S.routeReleased++; }
      const m = /driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(u), a = [+m[1], +m[2]], q = [+m[3], +m[4]];
      const co = Array.from({ length: 40 }, (_, k) => [a[0] + (q[0] - a[0]) * k / 39, a[1] + (q[1] - a[1]) * k / 39]);
      const km = Math.hypot((q[0] - a[0]) * 72, (q[1] - a[1]) * 111);
      return J({ routes: [{ distance: km * 1000, duration: km * 60, geometry: { coordinates: co }, legs: [{ annotation: { duration: co.slice(1).map(() => km * 60 / 39) } }] }] });
    }
    const q = new URL(u).searchParams;
    if (u.includes('api.bigdatacloud.net')) return J({ locality: 'Ville test locale', city: 'Ville test locale', principalSubdivision: 'Région test' });
    if (u.includes('open-meteo.com')) {
      const lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
      if (new URL(u).pathname === '/v1/forecast' && lats.length === 1 && S.forecastHold) { S.forecastHeld++; await S.forecastHold; }
      if (lats.length > 1 && S.meteoHold) { S.meteoHeld++; await S.meteoHold; }
      if (lats.length > 1 && S.meteoDown) return r.abort();
      const one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
      if (lats.length > 1) return J(lats.map((_, i) => one(i)));
      const base = one(0); return J(u.includes('air-quality-api') ? ctx.ma(base) : u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : base);
    }
    if (u.includes('api.rainviewer.com')) return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
    if (u.includes('public.opendatasoft.com')) return J({ records: [] });
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
    if (u.includes('leaflet/1.9.4/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (u.includes('leaflet/1.9.4/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.includes('/race-control/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
    if (u.startsWith(U)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const settle = async (n = 5) => { for (let i = 0; i < n; i++) { await p.clock.runFor(700); await p.waitForTimeout(100); } };
  const boot = async () => { for (let i = 0; i < 70; i++) { if (await p.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE).catch(() => false)) break; await p.clock.runFor(200); await p.waitForTimeout(150); } };
  const fixture = async () => p.evaluate(o => {
    liveReset();
    S.work = { ...S.work, days: [1, 2, 3, 4, 5], dep: '06:30', ret: '16:00', durMin: 40 };
    const home = { ...S.locs[0], label: 'Domicile', city: 'Domicile' };
    const a = { lat: 49.20779, lon: 2.58743, label: 'Destination Alpha', city: 'Alpha' }, b = { lat: 49.55, lon: 2.20, label: 'Destination Beta', city: 'Beta' };
    const leg = (k, from, to, dep, arr, fromKind = 'home') => ({ k, from: { ...from }, to: { ...to }, dep, arr, km: 60, min: Math.round((new Date(arr) - new Date(dep)) / 60e3), fromKind, routed: true,
      pts: [{ f: .5, lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2, km: 30 }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
    const e1 = { id: 'tech-alpha', t: 'Titre privé Alpha', s: '2026-10-03T17:00', e: '2026-10-03T18:00', loc: 'Adresse privée Alpha', label: 'Alpha', lat: a.lat, lon: a.lon,
      legs: [leg('go', home, a, '2026-10-03T15:30', '2026-10-03T16:50')] };
    if (!o.chain) e1.legs.push(leg('ret', a, home, '2026-10-03T18:10', '2026-10-03T19:30'));
    const e2 = { id: 'tech-beta', t: 'Titre privé Beta', s: '2026-10-03T20:00', e: '2026-10-03T21:00', loc: 'Adresse privée Beta', label: 'Beta', lat: b.lat, lon: b.lon, mode: o.chain ? 'direct' : null,
      legs: [leg('go', o.chain ? a : home, b, '2026-10-03T18:40', '2026-10-03T19:50', o.chain ? 'prev' : 'home'), leg('ret', b, home, '2026-10-03T21:10', '2026-10-03T22:20')] };
    // Conserver la version chiffrée déjà chargée évite qu'un rafraîchissement remplace le scénario fictif.
    CAL = { events: o.work ? [] : [e1, e2], updated: new Date(Date.now()).toISOString(), c: CAL && CAL.c }; CALDONE = true;
    Object.keys(LEGM).forEach(k => delete LEGM[k]); renderAll();
  }, options);
  await p.goto(U); await p.clock.runFor(3000);
  await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  await boot(); await fixture(); await settle(8);
  const txt = () => p.locator('#secBrf').innerText();
  const waitFor = async re => { let t = ''; for (let i = 0; i < 35; i++) { t = await txt(); if (re.test(t) && !/⏳/.test(t)) return t; await settle(1); } return t; };
  // La météo live utilise payload.current.time : son horloge doit avancer comme celle du navigateur.
  const to = async next => { const now = await p.evaluate(() => Date.now()), target = typeof next === 'number' ? next : clock(next); if (target > now) { forecastTime = target; await p.clock.fastForward(target - now); } };
  const fix = async (g, extra = {}) => { await p.evaluate(x => { window.__geoSet(x); window.__geoPush(); }, { ...g, age: 0, acc: 25, speed: null, ...extra }); await settle(3); };
  const enableGps = async (g = G.here, extra = {}) => { await p.evaluate(x => window.__geoSet(x), { ...g, age: 0, acc: 25, speed: null, ...extra }); await p.evaluate(() => locate(true)); await settle(8); };
  const reload = async () => { S.reloading = true; await p.reload(); await boot(); await fixture(); await settle(8); S.reloading = false; };
  const cancel = async accept => { const button = p.locator('#secBrf [data-act="trip-cancel"]').first(); let asked = false; p.once('dialog', async d => { asked = d.type() === 'confirm'; await (accept ? d.accept() : d.dismiss()); }); await button.click(); await settle(4); return asked; };
  const s = { p, c, S, txt, settle, waitFor, to, fix, enableGps, reload, cancel }; sessions.push(s); return s;
}
const phase = s => s.p.evaluate(() => LIVE.phase);
const gpsRoutes = s => s.S.osrm.filter(u => /3\.306,49\.385|3\.333,49\.399/.test(u));
const privacy = async s => {
  const local = await s.p.evaluate(() => ({ cancel: localStorage.getItem('twrc.tripcancel'), done: localStorage.getItem('twrc.tripdone'), other: Object.keys(localStorage).filter(k => !/^twrc\.(gps|cache\.gps)$/.test(k)).map(k => localStorage.getItem(k)).join('|') }));
  const sent = s.S.reqs.filter(r => /49\.3847|3\.3061|49\.385|3\.306|49\.399|3\.333/.test(r.u));
  const gpsHostAllowed = /^(router\.project-osrm\.org|[a-z-]*api\.open-meteo\.com|api\.bigdatacloud\.net)$/;
  const unexpectedProviders = [...new Set(s.S.reqs.filter(r => !allowed.test(new URL(r.u).hostname)).map(r => new URL(r.u).hostname))];
  const writes = s.S.reqs.filter(r => r.method !== 'GET' || r.body).map(r => ({ host: new URL(r.u).hostname, method: r.method }));
  const gpsUnexpectedProviders = [...new Set(sent.filter(r => !gpsHostAllowed.test(new URL(r.u).hostname)).map(r => new URL(r.u).hostname))];
  const storedGps = /49\.3847|3\.3061|49\.385|3\.306/.test(local.other);
  return { ...local, gpsOnlyAllowed: gpsUnexpectedProviders.length === 0, readOnly: writes.length === 0, providers: unexpectedProviders.length === 0,
    detail: JSON.stringify({ unexpectedProviders, writes, gpsUnexpectedProviders, storedGps }) };
};

(async () => {
  const browser = await require('./lib/browser').launch();
  // 1–4 : les quatre heures restent une règle automatique ; l'aperçu anticipé est une action volontaire distincte.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p, S } = s;
    await s.enableGps(); let t = await s.txt();
    const margins = await p.evaluate(() => ({ go: routeTravelMin(200, 10) - 200 + 10, ret: routeTravelMin(200, 0) - 200 }));
    check('0 · marge : plafond total de 15 min, avance rendez-vous comprise', margins.go === 15 && margins.ret === 15, JSON.stringify(margins));
    check('1 · GPS ailleurs, départ >4 h : origine planifiée explicite, sans fausse origine GPS', /Origine planifiée\s*:\s*Domicile\s*→\s*Alpha/i.test(t) && !/Ma position\s*→/i.test(t), short(t));
    check('1 · recalcul annoncé à 11:30, nom local ; aucun OSRM ni géocodage supplémentaire au rendu', /Tu es actuellement ailleurs/i.test(t) && /11:30/.test(t) && gpsRoutes(s).length === 0 && (await phase(s)) === 'idle');
    const source = await p.evaluate(() => JSON.stringify(CAL.events)), storedRoute = await p.evaluate(() => localStorage.getItem('twrc.croute'));
    const first = p.locator('#secBrf [data-act="trip-preview"]').first();
    check('3 · bouton volontaire « Calculer depuis ici maintenant » présent', await first.count() === 1 && /Calculer depuis ici maintenant/.test(await first.innerText()));
    let release; S.meteoHold = new Promise(r => { release = r; });
    await first.click(); await s.settle(5); t = await s.txt();
    check('3 · route prête, météo retardée : le briefing planifié reste complet, jamais de mélange', S.meteoHeld > 0 && /Origine planifiée/i.test(t) && !/Aperçu depuis ma position/i.test(t) && /\/ 100|Route/i.test(t), short(t));
    release(); S.meteoHold = null; await s.settle(8); t = await s.waitFor(/Aperçu depuis ma position/i);
    check('3 · route et météo prêtes : aperçu réel atomique, LIVE idle, jamais active', /Aperçu depuis ma position/i.test(t) && /Ma position\s*→\s*Alpha/i.test(t) && (await phase(s)) === 'idle', short(t));
    check('3 · origine GPS arrondie à .001°, aperçu sans suivi haute précision continu', gpsRoutes(s).length === 1 && /driving\/3\.306,49\.385;2\.587,49\.208/.test(gpsRoutes(s)[0]) && !(await p.evaluate(() => window.__geoWatches())).includes(true));
    check('3 · aucune modification de la route persistée ni du calendrier planifié', storedRoute === await p.evaluate(() => localStorage.getItem('twrc.croute')) && source === await p.evaluate(() => JSON.stringify(CAL.events)));
    await s.to('2026-10-03T10:32:00+02:00'); await s.fix(G.here); t = await s.txt();
    check('4 · après 30 min : retour au plan et expiration de l’aperçu', !/Aperçu depuis ma position/i.test(t) && /Origine planifiée/i.test(t) && (await phase(s)) === 'idle', short(t));
    await p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(7); await s.to('2026-10-03T10:35:00+02:00'); await s.fix(G.moved); t = await s.txt();
    check('4 · déplacement >1 km : aperçu supprimé et retour au trajet planifié', !/Aperçu depuis ma position/i.test(t) && /Origine planifiée/i.test(t), short(t));
    await s.to('2026-10-03T11:31:00+02:00'); await s.fix(G.here); t = await s.waitFor(/départ conseillé/);
    const route = await p.evaluate(() => LIVE.route && { min: liveRouteMin(LIVE.base, LIVE.route), key: LIVE.route.key });
    const expected = route && new Date(clock('2026-10-03T16:50:00+02:00') - route.min * 60e3).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    check('2 · entrée dans les 4 h : départ adaptatif existant, arrivée cible inchangée', (await phase(s)) === 'advice' && /Ma position\s*→\s*Alpha/i.test(t) && new RegExp(`départ conseillé\\s*${expected}`, 'i').test(t) && /arrivée cible 16:50/i.test(t) && !/Aperçu depuis ma position/i.test(t), short(t));
    const pr = await privacy(s);
    check('14 · aperçu : fournisseurs existants seulement, requêtes GET, aucune publication GPS', pr.providers && pr.readOnly && pr.gpsOnlyAllowed && !/49\.3847|3\.3061|49\.385|3\.306/.test(pr.other), pr.detail);
    await s.c.close();
  }
  // Un appui volontaire peut demander un relevé ; afficher un avertissement nécessite au contraire un fix fiable.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    await s.enableGps(G.here, { acc: 1200 });
    check('1 · GPS imprécis : aucune affirmation « ailleurs »', !/Tu es actuellement ailleurs/.test(await s.txt()));
    await p.evaluate(() => window.__geoSet({ acc: 25 })); const n = await p.evaluate(() => window.__geoLog.length);
    await p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(8);
    const log = await p.evaluate(k => window.__geoLog.slice(k), n);
    check('3 · relevé nécessaire : demande ponctuelle utilisateur, aperçu calculé sans watch haute précision', log.some(x => x.kind === 'get') && !log.some(x => x.kind === 'watch' && x.hi) && /Aperçu depuis ma position/i.test(await s.txt()) && (await phase(s)) === 'idle');
    await s.c.close();
  }
  // Un identifiant de trajet ou des horaires inchangés ne rendent pas une ancienne route valable après modification de l'agenda.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p, S } = s;
    await s.enableGps(); await p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(7);
    const ready = await p.evaluate(() => ({ key: TRIPPREVIEW.key, phase: TRIPPREVIEW.phase, gen: TRIPPREVIEW.gen }));
    check('3b · scénario valide : aperçu prêt avant modification du rendez-vous', ready.phase === 'ready' && /Aperçu depuis ma position/i.test(await s.txt()));
    await p.evaluate(() => {
      const e = CAL.events[0], go = e.legs.find(l => l.k === 'go'), ret = e.legs.find(l => l.k === 'ret');
      e.lat = 49.61; e.lon = 2.81; e.label = 'Gamma';
      go.to = { ...go.to, lat: e.lat, lon: e.lon, city: 'Gamma', label: 'Destination Gamma' };
      if (ret) ret.from = { ...go.to }; renderAll();
    }); await s.settle(4);
    const changed = await p.evaluate(key => ({ key: TRIPPREVIEW.key, gen: TRIPPREVIEW.gen, sameTrip: BRF_TRIPS.some(t => t.key === key) }), ready.key);
    check('3b · même trajet/mêmes horaires, destination modifiée : aperçu supprimé, nouveau plan affiché', changed.sameTrip && !changed.key && changed.gen > ready.gen && !/Aperçu depuis ma position/i.test(await s.txt()) && /Domicile\s*→\s*Gamma/i.test(await s.txt()));
    // Cette fois OSRM reste en vol. Modifier l'origine doit invalider la génération avant sa réponse.
    let release; S.routeHold = new Promise(r => { release = r; });
    await p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(2);
    const pending = await p.evaluate(() => ({ key: TRIPPREVIEW.key, phase: TRIPPREVIEW.phase, gen: TRIPPREVIEW.gen }));
    check('3c · scénario valide : ancien calcul OSRM réellement retenu', S.routeHeld === 1 && pending.phase === 'loading');
    await p.evaluate(() => { const go = CAL.events[0].legs.find(l => l.k === 'go'); go.from = { ...go.from, lat: 49.001, lon: 2.901, city: 'Autre origine', label: 'Autre origine' }; renderAll(); });
    release(); S.routeHold = null; await s.settle(6);
    const late = await p.evaluate(key => ({ key: TRIPPREVIEW.key, route: TRIPPREVIEW.route, gen: TRIPPREVIEW.gen, sameTrip: BRF_TRIPS.some(t => t.key === key) }), pending.key);
    check('3c · même trajet/mêmes horaires, origine modifiée : réponse tardive ignorée, aucun ancien aperçu réactivé', S.routeReleased === 1 && late.sameTrip && !late.key && !late.route && late.gen > pending.gen && !/Aperçu depuis ma position/i.test(await s.txt()) && /Autre origine\s*→\s*Gamma/i.test(await s.txt()));
    await s.c.close();
  }
  // Retour manuel : un tap rend le retour maison imminent, mais ne simule jamais un départ.
  {
    const s = await session(browser, '2026-10-03T17:10:00+02:00'); const { p } = s;
    await s.enableGps(G.a); await s.settle(5);
    const btn = p.locator('#secBrf [data-act="return-home"]').first();
    check('18 · retour : touche « Je rentre chez moi maintenant » visible après le début du rendez-vous', await btn.count() === 1 && /rentre chez moi/i.test(await btn.innerText()));
    await btn.click(); await s.settle(8);
    let t = await s.txt();
    const state = await p.evaluate(() => ({ phase: LIVE.phase, key: LIVE.key, home: RETURNHOME, done: localStorage.getItem('twrc.tripdone') }));
    check('18 · appui : retour maison devient immédiat sans faux départ', /Retour maison demandé/i.test(t) && state.phase !== 'active' && !!state.key && state.home && state.home.key === state.key && state.done === null, short(t));
    const raw = await p.evaluate(() => localStorage.getItem('twrc.returnhome.v1') || '');
    check('18 · stockage retour minimal : clé technique + at/exp, aucune coordonnée ni titre', !!raw && Object.keys(JSON.parse(raw)).sort().join(',') === 'at,exp,key' && !/Titre|Adresse|Alpha|Beta|lat|lon|49\.|2\./.test(raw), raw);
    const undo = p.locator('#secBrf [data-act="return-home-undo"]').first();
    check('18 · annulation de l’intention proposée avant le départ réel', await undo.count() === 1);
    await undo.click(); await s.settle(5); t = await s.txt();
    const back = await p.evaluate(() => ({ stored: localStorage.getItem('twrc.returnhome.v1'), phase: LIVE.phase }));
    check('18 · annuler : horaire planifié restauré, aucune arrivée/départ artificiels', back.stored === null && /18:10/.test(t) && back.phase !== 'active' && !/✓ Arrivé/.test(t), short(t));

    const already = p.locator('#secBrf [data-act="return-home-done"]').first();
    check('18b · touche « Déjà rentré » disponible même avant l’heure de retour planifiée', await already.count() === 1 && /Déjà rentré/i.test(await already.innerText()));
    const retKey = await already.getAttribute('data-key');
    await already.click(); await s.settle(5); t = await s.txt();
    const done = await p.evaluate(key => ({
      stored: localStorage.getItem('twrc.tripdone'),
      marked: !!LIVE.done[key],
      present: liveApply(BRF_TRIPS.slice(), liveNow()).some(x => x.key === key),
      home: localStorage.getItem('twrc.returnhome.v1'),
      phase: LIVE.phase
    }), retKey);
    const doneObj = JSON.parse(done.stored || '{}'), doneEntry = doneObj[retKey];
    check('18b · « Déjà rentré » clôt uniquement le retour, sans faux mouvement', done.marked && !done.present && done.phase !== 'active' && /✓ Arrivé/.test(t) && /Annuler l’arrivée/.test(t), short(t));
    check('18b · arrivée manuelle : stockage minimal, aucune coordonnée/titre/adresse', !!doneEntry && Object.keys(doneEntry).sort().join(',') === 'at,exp,how' && doneEntry.how === 'confirmé' && done.home === null && !/Titre|Adresse|Alpha|Beta|lat|lon|49\.|2\./.test(done.stored || ''), done.stored || '');
    await p.locator('#secBrf [data-act="trip-undo"]').first().click(); await s.settle(5);
    const undone = await p.evaluate(key => ({ stored: localStorage.getItem('twrc.tripdone'), marked: !!LIVE.done[key] }), retKey);
    check('18b · Annuler l’arrivée restaure le retour immédiatement', undone.stored === null && !undone.marked && /18:10/.test(await s.txt()));
    await s.c.close();
  }
  // 5, 8–10 : confirmation, aller/retour associés, undo et persistance opaque ; le rendez-vous Agenda reste intact.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    const original = await p.evaluate(() => JSON.stringify(CAL.events));
    check('5 · confirmation refusée : aucun trajet annulé', await s.cancel(false) && /Titre privé Alpha/.test(await s.txt()) && await p.evaluate(() => localStorage.getItem('twrc.tripcancel')) === null);
    check('5 · confirmation explicite demandée avant annulation', await s.cancel(true));
    let t = await s.txt(); const cancelled = await p.evaluate(() => ({ value: localStorage.getItem('twrc.tripcancel'), done: localStorage.getItem('twrc.tripdone'), a: effLegs(CAL.events[0]), cal: JSON.stringify(CAL.events) }));
    check('5 · annuler l’aller : aller + retour associés disparaissent du briefing et des jambes effectives', !/Titre privé Alpha/.test(t) && cancelled.a.length === 0 && /Titre privé Beta/.test(t), short(t));
    const nextAfterA = await p.evaluate(() => {
      const q = liveApply(BRF_TRIPS.slice(), liveNow()).filter(x => x.src === 'cal').sort((x, y) => x.dep.localeCompare(y.dep));
      return { name: q[0] && q[0].name, phase: LIVE.phase, done: localStorage.getItem('twrc.tripdone') };
    });
    check('15 · A annulé : Beta devient immédiatement le prochain trajet, sans active ni arrivée artificielle', /Beta/.test(nextAfterA.name || '') && nextAfterA.phase !== 'active' && nextAfterA.done === null, JSON.stringify(nextAfterA));
    check('5 · le rendez-vous est conservé et l’annulation ne ressemble jamais à une arrivée', cancelled.cal === original && !cancelled.done && !/✓ Arrivé|Annuler l’arrivée/.test(t));
    const object = JSON.parse(cancelled.value || '{}');
    check('10 · stockage minimal : ID technique opaque + at/exp seulement, aucun titre/adresse/GPS', Object.keys(object).length === 1 && Object.keys(object).every(k => /^cal-[a-f0-9]{32}$/.test(k)) && Object.values(object).every(v => Object.keys(v).sort().join(',') === 'at,exp' && v.exp > v.at) && !/Titre|Adresse|Alpha|Beta|lat|lon|49\.|2\./.test(cancelled.value || ''));
    check('4 · limite locale visible : notification cloud déjà planifiée possible', /notification.*(?:cloud|planifiée)|(?:cloud|planifiée).*notification/i.test(t));
    const undo = p.locator('[data-act="trip-cancel-undo"]').first(); check('8 · annuler l’annulation proposé pendant dix minutes', await undo.count() === 1);
    await undo.click(); await s.settle(5); t = await s.txt();
    check('8 · undo immédiat : aller et retour rétablis, mémoire supprimée', /Titre privé Alpha/.test(t) && await p.evaluate(() => effLegs(CAL.events[0]).length) === 2 && await p.evaluate(() => localStorage.getItem('twrc.tripcancel')) === null);
    const restoredFirst = await p.evaluate(() => liveApply(BRF_TRIPS.slice(), liveNow()).filter(x => x.src === 'cal').sort((x, y) => x.dep.localeCompare(y.dep))[0]?.name || '');
    check('15 · undo de A : l’ordre initial est recalculé et Alpha redevient le prochain trajet', /Alpha/.test(restoredFirst), restoredFirst);
    await s.cancel(true); await s.to('2026-10-03T10:12:00+02:00'); await p.evaluate(() => renderBrf());
    check('8 · après dix minutes : undo retiré, annulation toujours appliquée', await p.locator('[data-act="trip-cancel-undo"]').count() === 0 && !/Titre privé Alpha/.test(await s.txt()));
    await s.reload(); check('5 · après rechargement : annulation locale conservée sans supprimer l’événement', !/Titre privé Alpha/.test(await s.txt()) && await p.evaluate(() => CAL.events.length) === 2);
    const activeId = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('twrc.tripcancel')))[0]);
    await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('twrc.tripcancel')); o['cal-00000000000000000000000000000000'] = { at: Date.now() - 7200e3, exp: Date.now() - 3600e3 }; localStorage.setItem('twrc.tripcancel', JSON.stringify(o)); });
    await s.reload(); let ls = await p.evaluate(() => localStorage.getItem('twrc.tripcancel'));
    check('9 · chargement : entrée expirée réellement purgée, entrée valide conservée', !/00000000000000000000000000000000/.test(ls || '') && (ls || '').includes(activeId));
    await p.evaluate(() => localStorage.setItem('twrc.tripcancel', JSON.stringify({ 'cal-00000000000000000000000000000000': { at: Date.now() - 7200e3, exp: Date.now() - 3600e3 } })));
    await s.reload(); ls = await p.evaluate(() => localStorage.getItem('twrc.tripcancel'));
    check('9 · aucune entrée valide : clé réellement supprimée du localStorage', ls === null);
    const pr = await privacy(s); check('14 · annulation locale : aucun appel fournisseur nouveau ni écriture réseau', pr.providers && pr.readOnly, pr.detail);
    await s.c.close();
  }
  // Purge physique sans rechargement : l'expiration réactive le programme d'origine et efface vraiment la clé.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    await s.cancel(true);
    await p.evaluate(() => {
      const id = Object.keys(TRIPCANCEL)[0];
      TRIPCANCEL[id] = { ...TRIPCANCEL[id], exp: Date.now() + 1500 };
      TRIPCANCEL = TripCancel.save(localStorage, TRIPCANCEL, Date.now());
      tripCancelSchedulePurge(); renderAll();
    });
    await s.to('2026-10-03T10:00:03+02:00'); await s.settle(5);
    const purged = await p.evaluate(() => ({ stored: localStorage.getItem('twrc.tripcancel'), ids: Object.keys(TRIPCANCEL), done: localStorage.getItem('twrc.tripdone') }));
    check('9b · application restée ouverte : expiration purge physiquement twrc.tripcancel et restaure le trajet sans arrivée', purged.stored === null && purged.ids.length === 0 && purged.done === null && /Titre privé Alpha/.test(await s.txt()), JSON.stringify(purged));
    await s.c.close();
  }
  // Deux occurrences distinctes peuvent partager horaires ET route : la cible d'une action reste l'événement exact.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    await p.evaluate(() => {
      const first = CAL.events[0], second = JSON.parse(JSON.stringify(first));
      second.id = 'tech-simultaneous-beta'; second.t = 'Autre rendez-vous simultané avec ID';
      CAL.events = [first, second]; renderAll();
    }); await s.settle(4); await s.enableGps();
    const original = await p.evaluate(() => JSON.stringify(CAL.events));
    const keys = await p.evaluate(() => BRF_TRIPS.filter(t => t.src === 'cal' && t.l.k === 'go').map(t => ({ key: t.key, id: t.e.id })));
    check('5c · mêmes horaires et mêmes jambes, IDs distincts : clés UI distinctes', keys.length === 2 && keys[0].id !== keys[1].id && keys[0].key !== keys[1].key);
    await p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(8); await s.waitFor(/Aperçu depuis ma position/i);
    const previews = await p.evaluate(() => tripPreviewApply(BRF_TRIPS, liveNow()).filter(t => t.src === 'cal' && t.l && (t.l.k === 'go' || t.manualPreview)).map(t => ({ id: t.e.id, preview: !!t.manualPreview })));
    check('3d · aperçu du premier événement : seconde occurrence conservée sans aperçu', previews.length === 2 && previews[0].id === 'tech-alpha' && previews[0].preview && previews[1].id === 'tech-simultaneous-beta' && !previews[1].preview && /Autre rendez-vous simultané avec ID/.test(await s.txt()));
    await p.evaluate(() => { tripPreviewReset(); renderBrf(); });
    await s.to('2026-10-03T11:31:00+02:00'); await s.fix(G.here); await s.waitFor(/départ conseillé/);
    const living = await p.evaluate(() => liveApply(BRF_TRIPS, liveNow()).filter(t => t.src === 'cal' && (t.planL || t.l).k === 'go').map(t => ({ id: t.e.id, live: !!t.live })));
    check('2b · fenêtre adaptative : un seul événement simultané reçoit l’analyse LIVE', living.length === 2 && living[0].id === 'tech-alpha' && living[0].live && living[1].id === 'tech-simultaneous-beta' && !living[1].live);
    const secondCard = p.locator('#secCal .cal-e').filter({ hasText: 'Autre rendez-vous simultané avec ID' });
    const cancelButton = secondCard.locator('[data-act="trip-cancel"]').first();
    check('5c · deuxième carte Agenda : annulation accessible même si un autre trajet est principal', await cancelButton.count() === 1);
    if (await cancelButton.count()) {
      p.once('dialog', async d => { await d.accept(); }); await cancelButton.click(); await s.settle(6);
    }
    const cancelled = await p.evaluate(() => ({ flags: CAL.events.map(e => calendarCancelled(e)), first: effLegs(CAL.events[0]).length, second: effLegs(CAL.events[1]).length,
      source: JSON.stringify(CAL.events), done: localStorage.getItem('twrc.tripdone'), ids: Object.keys(JSON.parse(localStorage.getItem('twrc.tripcancel') || '{}')), target: TripCancel.eventId(CAL.events[1]), live: LIVE.base && LIVE.base.e && LIVE.base.e.id }));
    check('5c · bouton deuxième Agenda : seul le deuxième est annulé, premier LIVE et Agenda conservés', cancelled.flags.join(',') === 'false,true' && cancelled.first === 2 && cancelled.second === 0 && cancelled.source === original && !cancelled.done && cancelled.ids.join(',') === cancelled.target && cancelled.live === 'tech-alpha', JSON.stringify(cancelled));
    await s.c.close();
  }
  // Les anciens calendriers peuvent ne pas fournir d'UID : deux occurrences simultanées restent distinctes dans l'Agenda.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    await p.evaluate(() => {
      const first = CAL.events[0]; delete first.id; delete first.uid;
      const other = JSON.parse(JSON.stringify(first)); other.t = 'Autre rendez-vous simultané'; other.label = 'Beta simultané'; other.lat = 49.55; other.lon = 2.20;
      other.legs.forEach(l => { if (l.k === 'go') l.to = { ...l.to, lat: other.lat, lon: other.lon, city: other.label, label: other.label }; else l.from = { ...l.from, lat: other.lat, lon: other.lon, city: other.label, label: other.label }; });
      CAL.events = [first, other]; renderAll();
    }); await s.settle(4);
    const initial = await p.evaluate(() => JSON.stringify(CAL.events)); let dialogs = 0;
    const accept = async d => { dialogs++; await d.accept(); }; p.on('dialog', accept);
    await p.locator('#secBrf [data-act="trip-cancel"]').first().click(); await s.settle(3); p.off('dialog', accept);
    const untouched = await p.evaluate(() => ({ cancel: localStorage.getItem('twrc.tripcancel'), source: JSON.stringify(CAL.events), legs: CAL.events.map(e => effLegs(e).length) }));
    check('5b · deux événements legacy simultanés : annulation refusée, aucun rendez-vous masqué', dialogs === 0 && untouched.cancel === null && untouched.source === initial && untouched.legs.every(n => n === 2) && /Titre privé Alpha/.test(await s.txt()) && /Autre rendez-vous simultané/.test(await s.txt()));
    check('5b · ambiguïté expliquée : actualiser l’agenda pour annuler séparément', /Actualise l’agenda.*rendez-vous simultanés/i.test(await s.txt()));
    await s.c.close();
  }
  // 6 : la destination annulée ne peut plus servir d'origine à une route dépendante.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00', { chain: true }); const { p } = s;
    const before = await p.evaluate(() => ({ cal: JSON.stringify(CAL.events), legs: effLegs(CAL.events[1]) }));
    check('6 · scénario valide : Beta était chaîné depuis Alpha', before.legs.some(l => l.k === 'go' && l.from.lat === G.a.lat && l.from.lon === G.a.lon));
    await s.cancel(true); await s.settle(7);
    const after = await p.evaluate(() => ({ cal: JSON.stringify(CAL.events), legs: effLegs(CAL.events[1]), text: document.querySelector('#secBrf').innerText }));
    const outgoing = after.legs.filter(l => l.k === 'go');
    check('6 · après annulation : aucune route suivante ne conserve l’ancienne origine ni sa géométrie', outgoing.every(l => l.from.lat !== G.a.lat || l.from.lon !== G.a.lon) && outgoing.every(l => !(l.g || []).some(q => q[0] === G.a.lat && q[1] === G.a.lon)) && after.cal === before.cal);
    check('6 · chaîne recalculée depuis le dernier lieu valide ou origine explicitement à confirmer', /Titre privé Beta/.test(after.text) && (outgoing.some(l => l.from.city === 'Domicile' || l.from.label === 'Domicile' || l.from.id === 'home') || /Origine à confirmer après annulation du trajet précédent/.test(after.text)), short(after.text));
    const destinations = await p.locator('#secBrf a').evaluateAll(xs => xs.filter(x => /Waze/.test(x.textContent)).map(x => x.href));
    check('6 · Waze suit la destination conservée Beta et ne pointe jamais vers Alpha annulé', destinations.some(u => /ll=49\.55(?:%2C|,)2\.2(?:&|$)/.test(u)) && destinations.every(u => !/49\.207|2\.587/.test(u)), destinations.join(' | '));
    // Sans coordonnées du dernier lieu valide, la bonne issue est une origine à confirmer, pas un trajet fictif.
    await p.evaluate(() => { S.locs[0] = { ...S.locs[0], lat: null, lon: null }; renderBrf(); renderCal(); }); await s.settle(4);
    const unknown = await s.txt();
    check('6 · origine fiable absente : avertissement explicite, aucune ancienne route présentée', /Origine à confirmer après annulation du trajet précédent/i.test(unknown) && !/Alpha\s*→\s*Beta/i.test(unknown), short(unknown));
    await s.c.close();
  }
  // Plusieurs annulations successives sautent chaque trajet non éligible et prennent le premier suivant.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    await p.evaluate(() => {
      const home = { ...CAL.events[0].legs[0].from }, beta = CAL.events[1], gamma = JSON.parse(JSON.stringify(beta));
      const g = { lat: 49.8, lon: 2.8, label: 'Destination Gamma', city: 'Gamma' };
      gamma.id = 'tech-gamma'; gamma.t = 'Titre privé Gamma'; gamma.s = '2026-10-03T22:30'; gamma.e = '2026-10-03T23:00';
      gamma.loc = 'Adresse privée Gamma'; gamma.label = 'Gamma'; gamma.lat = g.lat; gamma.lon = g.lon; gamma.mode = null;
      gamma.legs = [
        { ...beta.legs[0], from: home, to: g, fromKind: 'home', dep: '2026-10-03T21:00', arr: '2026-10-03T22:20', pts: [], g: [[home.lat, home.lon], [g.lat, g.lon]] },
        { ...beta.legs[1], from: g, to: home, fromKind: 'event', dep: '2026-10-03T23:10', arr: '2026-10-04T00:20', pts: [], g: [[g.lat, g.lon], [home.lat, home.lon]] }
      ];
      CAL.events.push(gamma); renderAll();
    }); await s.settle(4);
    await s.cancel(true); let t = await s.txt();
    check('15 · A annulé : B est sélectionné avant C', /Titre privé Beta/.test(t) && !/Titre privé Alpha/.test(t), short(t));
    await s.cancel(true); await s.settle(7); t = await s.txt();
    const seq = await p.evaluate(() => ({ phase: LIVE.phase, done: localStorage.getItem('twrc.tripdone'), ids: Object.keys(TRIPCANCEL), first: liveApply(BRF_TRIPS.slice(), liveNow()).filter(x => x.src === 'cal').sort((x, y) => x.dep.localeCompare(y.dep))[0]?.name || '' }));
    check('15 · A puis B annulés : C devient automatiquement le premier trajet éligible', /Gamma/.test(seq.first) && /Titre privé Gamma/.test(t) && !/Titre privé Alpha|Titre privé Beta/.test(t) && seq.phase !== 'active' && seq.done === null && seq.ids.length === 2, JSON.stringify(seq));
    await s.c.close();
  }
  // L'annulation du travail du jour donne immédiatement la priorité à l'agenda encore valide aujourd'hui.
  {
    const s = await session(browser, '2026-10-03T05:00:00+02:00'); const { p } = s;
    await p.evaluate(() => { S.work.days = [6]; UI.dayOff = null; renderAll(); }); await s.settle(5);
    check('15 · scénario travail : le briefing principal est bien le trajet domicile-travail du jour', /domicile-travail/i.test(await s.txt()) && /Pas de trajet aujourd’hui/.test(await p.locator('#secBrf [data-act="trip-cancel"]').first().innerText()));
    await s.cancel(true); await s.settle(6);
    const afterWork = await p.evaluate(() => ({ todayWork: BRF_TRIPS.filter(x => x.src === 'work' && x.dep.slice(0, 10) === '2026-10-03').length, firstCal: BRF_TRIPS.filter(x => x.src === 'cal').sort((x, y) => x.dep.localeCompare(y.dep))[0]?.name || '', phase: LIVE.phase }));
    check('15 · travail annulé : Alpha agenda devient immédiatement prioritaire, sans modifier les jours ni passer active', afterWork.todayWork === 0 && /Alpha/.test(afterWork.firstCal) && afterWork.phase !== 'active' && /Titre privé Alpha/.test(await s.txt()), JSON.stringify(afterWork));
    await s.c.close();
  }
  // 7 : domicile-travail est annulé pour une date locale, sans toucher aux jours configurés.
  {
    const s = await session(browser, '2026-10-05T05:00:00+02:00', { work: true }); const { p } = s;
    const days = await p.evaluate(() => JSON.stringify(S.work.days));
    check('7 · bouton travail : « Pas de trajet aujourd’hui »', /Pas de trajet aujourd’hui/.test(await p.locator('#secBrf [data-act="trip-cancel"]').first().innerText()));
    await s.cancel(true); let t = await s.txt();
    const value = await p.evaluate(() => localStorage.getItem('twrc.tripcancel')), o = JSON.parse(value || '{}');
    const scheduled = await p.evaluate(() => BRF_TRIPS.filter(x => x.src === 'work').map(x => x.dep.slice(0, 10)));
    check('7 · aller et retour du jour masqués, lendemain toujours programmé', !scheduled.includes('2026-10-05') && scheduled.includes('2026-10-06') && /demain/i.test(t) && /domicile-travail/i.test(t) && await p.evaluate(() => JSON.stringify(S.work.days)) === days, short(t));
    check('7 · stockage travail : date seulement, expiration à la fin de journée locale', Object.keys(o).join(',') === 'work-2026-10-05' && o['work-2026-10-05'].exp >= clock('2026-10-06T00:00:00+02:00') - 1000 && o['work-2026-10-05'].exp <= clock('2026-10-06T00:00:00+02:00') + 1000);
    // Le calendrier du trajet doit suivre la date réelle même avant qu'une nouvelle météo n'arrive.
    let weatherRelease; s.S.forecastHold = new Promise(r => { weatherRelease = r; });
    await s.to('2026-10-06T05:00:00+02:00'); await p.evaluate(() => { rebuild(); renderAll(); }); await s.settle(3); t = await s.txt();
    const workState = await p.evaluate(() => ({ browser: new Date(Date.now()).toISOString(), model: M[S.work.from].nowStr, days: S.work.days, cancelled: TRIPCANCEL,
      trips: BRF_TRIPS.filter(x => x.src === 'work').map(x => ({ dep: x.dep, direction: x.td.dir })) }));
    check('7 · scénario cache valide : météo du lundi conservée, nouvelles prévisions réellement en attente', s.S.forecastHeld > 0 && workState.model.slice(0, 10) === '2026-10-05', JSON.stringify({ held: s.S.forecastHeld, model: workState.model }));
    check('7 · lendemain : trajet travail rétabli, jours configurés inchangés', /aujourd’hui/i.test(t) && /domicile-travail/i.test(t) && workState.trips.some(x => x.dep.slice(0, 10) === '2026-10-06') && JSON.stringify(workState.days) === days, JSON.stringify({ text: short(t), ...workState }));
    weatherRelease(); s.S.forecastHold = null; await s.settle(3);
    await s.c.close();
  }
  // Annulation travail juste avant minuit : Undo complet, mais le lendemain reste éligible ; purge sans reload.
  {
    const s = await session(browser, '2026-10-05T23:55:00+02:00', { work: true }); const { p } = s;
    await p.evaluate(() => {
      const now = Date.now(), date = liveNow().slice(0, 10), id = TripCancel.workId(date), exp = TripCancel.workExpiration(date, now);
      TRIPCANCEL = TripCancel.cancel(TRIPCANCEL, id, exp, now);
      TRIPCANCEL = TripCancel.save(localStorage, TRIPCANCEL, now);
      tripCancelChanged();
    }); await s.settle(3);
    await s.to('2026-10-06T00:04:00+02:00'); await s.settle(4);
    const m4 = await p.evaluate(() => ({ undo: TripCancel.undoable(TRIPCANCEL, Date.now()).length, next: BRF_TRIPS.filter(x => x.src === 'work').map(x => x.dep.slice(0, 10)), stored: localStorage.getItem('twrc.tripcancel') }));
    check('7c · annulation 23:55 : Undo encore disponible à 00:04 et trajet du lendemain visible', m4.undo === 1 && m4.next.includes('2026-10-06') && !!m4.stored, JSON.stringify(m4));
    await s.to('2026-10-06T00:06:00+02:00'); await s.settle(5);
    const m6 = await p.evaluate(() => ({ undo: TripCancel.undoable(TRIPCANCEL, Date.now()).length, stored: localStorage.getItem('twrc.tripcancel'), next: BRF_TRIPS.filter(x => x.src === 'work').map(x => x.dep.slice(0, 10)) }));
    check('7c · après dix minutes : Undo expiré, clé purgée physiquement, lendemain toujours programmé', m6.undo === 0 && m6.stored === null && m6.next.includes('2026-10-06'), JSON.stringify(m6));
    await s.c.close();
  }
  // Après la veille, les jours de départ suivent l'horloge réelle même si la météo est encore celle du vendredi.
  {
    const s = await session(browser, '2026-10-09T05:00:00+02:00', { work: true }); const { p } = s;
    let weatherRelease; s.S.forecastHold = new Promise(r => { weatherRelease = r; });
    await s.to('2026-10-10T05:00:00+02:00'); await p.evaluate(() => { UI.dayOff = null; rebuild(); renderAll(); }); await s.settle(3);
    const weekend = await p.evaluate(() => ({ model: M[S.work.from].nowStr,
      buttons: [...document.querySelectorAll('#secBrief [data-act="day"]')].map(x => ({ off: +x.dataset.off, text: x.textContent, selected: x.getAttribute('aria-pressed') === 'true' })),
      date: tripData().dep.slice(0, 10), briefing: document.querySelector('#secBrief').innerText }));
    check('7b · veille vendredi→samedi, météo encore vendredi : choix et analyse commencent lundi 12/10', s.S.forecastHeld > 0 && weekend.model.slice(0, 10) === '2026-10-09' &&
      weekend.buttons.map(x => x.off).join(',') === '2,3,4' && /lun\.?\s*12\/10/i.test(weekend.buttons[0].text) && weekend.buttons[0].selected &&
      weekend.buttons.every(x => !/Aujourd’hui|dim\.?\s*11\/10/i.test(x.text)) && weekend.date === '2026-10-12' && /départ\s*06:30\s*le\s*lun\.?\s*12\/10/i.test(weekend.briefing), JSON.stringify(weekend));
    weatherRelease(); s.S.forecastHold = null; await s.settle(3); await s.c.close();
  }
  // Migration des anciennes clés twrc.tripdone : un trajet déjà arrivé ne réapparaît pas après l'ajout des IDs agenda.
  {
    const s = await session(browser, '2026-10-03T10:00:00+02:00'); const { p } = s;
    const migration = await p.evaluate(() => {
      const ev = CAL.events[0], leg = ev.legs.find(l => l.k === 'go'), legacy = calendarTripLegacyKey(ev, leg), current = calendarTripKey(ev, leg);
      localStorage.setItem('twrc.tripdone', JSON.stringify({ [legacy]: { how: 'auto', at: Date.now(), exp: Date.now() + 24 * 3600e3 } }));
      LIVE.done = {}; liveDoneLoad();
      const filtered = liveApply(BRF_TRIPS.slice(), liveNow());
      return { legacy, current, visible: filtered.some(t => t.key === current), raw: localStorage.getItem('twrc.tripdone') };
    });
    check('16 · migration tripdone : ancienne clé reconnue pour l’occurrence unique, sans donnée privée', migration.legacy !== migration.current && !migration.visible && !/Titre|Adresse|49\.|2\./.test(migration.raw || ''), JSON.stringify(migration));
    const ambiguous = await p.evaluate(() => {
      const first = CAL.events[0], clone = JSON.parse(JSON.stringify(first)); clone.id = 'tech-alpha-simultaneous'; clone.t = 'Autre occurrence simultanée';
      CAL.events = [first, clone, CAL.events[1]]; renderAll();
      const legacy = calendarTripLegacyKey(first, first.legs[0]);
      return liveApply(BRF_TRIPS.slice(), liveNow()).filter(t => t.src === 'cal' && calendarTripLegacyKey(t.e, t.planL || t.l) === legacy).length;
    });
    check('16 · migration legacy ambiguë : une ancienne clé ne masque jamais plusieurs occurrences simultanées', ambiguous === 2, String(ambiguous));
    await s.c.close();
  }
  // 11–13 : annulation en suivi réel, Waze, onglets et tailles tactiles.
  {
    const s = await session(browser, '2026-10-03T14:20:00+02:00'); const { p } = s;
    await s.enableGps(); await s.waitFor(/départ conseillé/);
    await s.to('2026-10-03T14:21:00+02:00'); await s.fix(G.drive, { speed: 22 });
    await s.to('2026-10-03T14:21:20+02:00'); await s.fix({ lat: G.drive.lat - .004, lon: G.drive.lon - .004 }, { speed: 22 });
    check('11 · scénario valide : trajet active, suivi haute précision continu', (await phase(s)) === 'active' && (await p.evaluate(() => window.__geoWatches())).includes(true));
    await s.cancel(true); await s.settle(5); let t = await s.txt();
    check('11 · annulation pendant LIVE : idle, retour basse consommation, aucune arrivée', (await phase(s)) === 'idle' && !(await p.evaluate(() => window.__geoWatches())).includes(true) && !/Titre privé Alpha|✓ Arrivé/.test(t) && await p.evaluate(() => localStorage.getItem('twrc.tripdone')) === null, short(t));
    const liveNext = await p.evaluate(() => ({ phase: LIVE.phase, first: liveApply(BRF_TRIPS.slice(), liveNow()).filter(x => x.src === 'cal').sort((x, y) => x.dep.localeCompare(y.dep))[0]?.name || '', done: localStorage.getItem('twrc.tripdone') }));
    check('15 · A annulé pendant LIVE : Beta devient le suivant, sans transfert artificiel de active', /Beta/.test(liveNext.first) && liveNext.phase !== 'active' && liveNext.done === null && /Titre privé Beta/.test(t), JSON.stringify(liveNext));
    await p.locator('[data-act="trip-cancel-undo"]').first().click(); await s.settle(5);
    const nav = await p.locator('#secBrf a').evaluateAll(xs => xs.filter(x => /Waze/.test(x.textContent)).map(x => x.href));
    check('12 · Waze préserve la destination du trajet affiché', nav.some(u => /(?:ll=49\.208%2C2\.587|ll=49\.208,2\.587|ll=49\.20779%2C2\.58743|ll=49\.20779,2\.58743)/.test(u)), nav.join(' | '));
    check('12 · agenda demeure visible avec ses rendez-vous', await p.locator('#secCal').isVisible() && /Titre privé Alpha|Titre privé Beta/.test(await p.locator('#secCal').innerText()));
    const inspectLayout = () => p.evaluate(() => {
      const escapesViewport = x => {
        if (!x.getClientRects().length || getComputedStyle(x).visibility === 'hidden') return false;
        const r = x.getBoundingClientRect(); if (r.width <= 0 || r.right <= innerWidth + 1) return false;
        // Un ruban horizontal contenu dans son module ne déborde pas du document.
        for (let ancestor = x.parentElement; ancestor; ancestor = ancestor.parentElement) {
          if (!/^(auto|scroll|hidden|clip)$/.test(getComputedStyle(ancestor).overflowX)) continue;
          const clip = ancestor.getBoundingClientRect();
          if (clip.width > 0 && clip.left >= -1 && clip.right <= innerWidth + 1) return false;
        }
        return true;
      };
      const overflows = innerWidth === 320 ? [...document.querySelectorAll('body *')].filter(escapesViewport).map(x => {
        const r = x.getBoundingClientRect(), style = getComputedStyle(x);
        return { tag: x.tagName.toLowerCase(), class: x.getAttribute('class') || '', id: x.id || '', left: +r.left.toFixed(2), right: +r.right.toFixed(2), width: +r.width.toFixed(2), fontFamily: style.fontFamily, whiteSpace: style.whiteSpace, minWidth: style.minWidth, text: (x.innerText || x.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) };
      }).sort((a, b) => b.right - a.right || a.width - b.width).slice(0, 12) : [];
      return { overflow: document.documentElement.scrollWidth - innerWidth, overflows,
        buttons: [...document.querySelectorAll('#secBrf [data-act="trip-cancel"], #secBrf [data-act="trip-preview"], #secCal [data-act="trip-cancel"], [data-act="trip-cancel-undo"]')].filter(x => x.getClientRects().length).map(x => ({ h: x.getBoundingClientRect().height, w: x.getBoundingClientRect().width, text: x.textContent })) };
    });
    for (const width of [320, 414, 1280]) {
      await p.setViewportSize({ width, height: 896 }); await s.settle(2);
      const layout = await inspectLayout();
      check(`13 · ${width}px : aucun débordement, boutons trajet ≥44px`, layout.overflow <= 1 && layout.buttons.length > 0 && layout.buttons.every(x => x.h >= 44 && x.w >= 44), JSON.stringify(layout));
      if (width === 320) {
        // Ubuntu utilise notamment DejaVu Sans comme repli : ses glyphes plus larges doivent également rentrer.
        const fallbackStyle = await p.addStyleTag({ content: ':root { --f-body: "DejaVu Sans", sans-serif; --f-disp: "DejaVu Sans", sans-serif; --f-mono: "DejaVu Sans Mono", monospace; }' }); await s.settle(2);
        const fallbackLayout = await inspectLayout();
        check('13 · 320px avec DejaVu Sans : aucun débordement, boutons trajet ≥44px', fallbackLayout.overflow <= 1 && fallbackLayout.buttons.length > 0 && fallbackLayout.buttons.every(x => x.h >= 44 && x.w >= 44), JSON.stringify(fallbackLayout));
        await fallbackStyle.evaluate(x => x.remove()); await s.settle(2);
      }
    }
    await p.locator('[data-act="view"][data-v="meteo"]').click(); await s.settle(2);
    check('12 · Météo reste utilisable', await p.locator('#secCur').isVisible());
    await p.locator('[data-act="view"][data-v="tenue"]').click(); await s.settle(2);
    check('12 · Tenue reste utilisable', await p.locator('#secTenue').isVisible() && await p.locator('.outfit-piece').count() === 4);
    await p.locator('[data-act="view"][data-v="pneus"]').click(); await s.settle(2);
    check('12 · Pneus reste utilisable avec ses voitures et le briefing', await p.locator('#secCars').isVisible() && await p.locator('#secBrf').isVisible());
    const pr = await privacy(s); check('14 · toutes actions : aucun nouveau fournisseur, aucun POST ni donnée transmise au relais', pr.providers && pr.readOnly && pr.gpsOnlyAllowed, pr.detail);
    await s.c.close();
  }
  console.log(`\n${rows.length - failed}/${rows.length} scénarios OK · erreurs JS : ${errors.length ? errors.join(' | ') : 'aucune'}`);
  await browser.close(); process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
