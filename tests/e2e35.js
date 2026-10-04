// Intégration Tenue + annulations + GPS volontaire : conseils visibles et réseau entièrement fictif.
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
      const one = i => {
        const loc = { lat: +lats[i], lon: +lons[i] }, payload = ctx.mk('doux', loc, 'Europe/Paris', 0);
        const cold = options.coldNetwork && Math.abs(loc.lat - options.coldNetwork.lat) < .008 && Math.abs(loc.lon - options.coldNetwork.lon) < .008;
        for (let k = 0; k < payload.hourly.time.length; k++) {
          payload.hourly.temperature_2m[k] = cold ? 4 : 22; payload.hourly.apparent_temperature[k] = cold ? 4 : 22;
          payload.hourly.precipitation_probability[k] = cold ? 95 : 0; payload.hourly.precipitation[k] = cold ? 2 : 0;
          payload.hourly.rain[k] = cold ? 2 : 0; payload.hourly.showers[k] = 0; payload.hourly.snowfall[k] = 0;
          payload.hourly.weather_code[k] = cold ? 63 : 0; payload.hourly.wind_gusts_10m[k] = 10; payload.hourly.wind_speed_10m[k] = 5;
        }
        for (const k of ['temperature_2m', 'apparent_temperature', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'wind_gusts_10m', 'wind_speed_10m']) payload.current[k] = payload.hourly[k][0];
        return payload;
      };
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

const H = { id: 'home', name: 'Maison intégration', lat: 48.85, lon: 2.35 };
const W = { id: 'work', name: 'Travail intégration', lat: 48.9, lon: 2.25 };
const A = { label: 'Lieu Alpha', lat: 49.20779, lon: 2.58743 };
const B = { label: 'Lieu Beta', lat: 49.55, lon: 2.20 };
const C = { label: 'Lieu Gamma', lat: 49.4, lon: 3.3 };
const privateTitle = 'PRIVE_INTEGRATION_35';
function route(k, from, to, dep, arr) {
  return { k, from: { ...from }, to: { ...to }, dep, arr, min: Math.round((clock(arr + ':00+02:00') - clock(dep + ':00+02:00')) / 60e3), km: 45, fromKind: from.id === 'home' ? 'home' : 'prev', routed: true,
    pts: [{ f: .5, lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2, km: 22.5 }], g: [[from.lat, from.lon], [to.lat, to.lon]] };
}
const eveningEvent = (date = '2026-10-03') => ({ id: 'tech-integration-evening-' + date, t: privateTitle + ' soirée Alpha', s: date + 'T20:00', e: date + 'T22:00', loc: 'Adresse fictive Alpha', ...A,
  legs: [route('go', H, A, date + 'T19:20', date + 'T19:50'), route('ret', A, H, date + 'T22:10', date + 'T22:40')] });
async function program(s, options = {}) {
  await s.p.evaluate(o => {
    liveReset(); tripPreviewReset(); TRIPCANCEL = {}; TripCancel.save(localStorage, TRIPCANCEL, Date.now()); tripCancelSchedulePurge();
    S.locs = o.locs; S.customs = []; S.calDirect = {}; S.work = { from: 'home', to: 'work', dep: '08:00', ret: '18:00', durMin: 30, days: [1, 2, 3, 4, 5] };
    GPS = o.gps ? { ...o.gps, t: Date.now(), acc: 25, gps: true } : null;
    FIX = GPS ? { lat: GPS.lat, lon: GPS.lon, ts: Date.now(), acc: 25, speed: null } : null;
    FIXPREV = null; UI.loc = GPS ? 'gps' : 'home'; UI.view = 'pneus'; UI.outfitDay = 0; UI.outfitOccasion = 'outing';
    M = {}; Object.keys(RAW).forEach(k => delete RAW[k]); Object.keys(CALM).forEach(k => delete CALM[k]); Object.keys(LEGM).forEach(k => delete LEGM[k]);
    const model = (l, cold) => {
      const payload = makeDemoPayload('doux', l, 'Europe/Paris', 0);
      for (let k = 0; k < payload.hourly.time.length; k++) {
        const h = payload.hourly;
        h.temperature_2m[k] = cold ? 4 : 22; h.apparent_temperature[k] = cold ? 4 : 22;
        h.precipitation_probability[k] = cold ? 95 : 0; h.precipitation[k] = cold ? 2 : 0;
        h.rain[k] = cold ? 2 : 0; h.showers[k] = 0; h.snowfall[k] = 0; h.weather_code[k] = cold ? 63 : 0;
        h.wind_gusts_10m[k] = 10; h.wind_speed_10m[k] = 5; h.uv_index[k] = 0;
        const hour = +h.time[k].slice(11, 13), fields = { T: 'temperature_2m', Tapp: 'apparent_temperature', pp: 'precipitation_probability', P: 'precipitation', rain: 'rain', snow: 'snowfall', code: 'weather_code', gust: 'wind_gusts_10m', wind: 'wind_speed_10m' };
        for (const patch of (o.weatherPatches || {})[l.id] || []) {
          if (hour < patch.from || hour >= patch.to || patch.date && patch.date !== h.time[k].slice(0, 10)) continue;
          for (const [field, value] of Object.entries(patch.values)) h[fields[field]][k] = value;
        }
      }
      const currentIndex = Math.max(0, payload.hourly.time.findIndex(t => t === payload.current.time));
      for (const k of ['temperature_2m', 'apparent_temperature', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'wind_gusts_10m', 'wind_speed_10m']) payload.current[k] = payload.hourly[k][currentIndex];
      const m = makeModel(payload, 'live', l);
      return { payload, m };
    };
    for (const l of [...o.locs, ...(GPS ? [GPS] : [])]) { const v = model(l, o.coldWork && l.id === 'work' || o.coldHome && l.id === 'home'); M[l.id] = v.m; RAW[l.id] = { p: v.payload, mode: 'live', t: Date.now() }; }
    CAL = { events: o.events, updated: new Date(Date.now()).toISOString(), c: CAL && CAL.c }; CALDONE = true;
    for (const e of o.events) {
      const id = 'cal' + e.lat.toFixed(2) + '_' + e.lon.toFixed(2), v = model({ ...e, id, name: e.label }, o.coldIds.includes(e.id));
      CALM[id] = { m: v.m, t: Date.now() };
    }
    renderAll();
  }, { locs: [H, W], events: [], coldIds: [], ...options });
  await s.settle(6);
}
const outfit = s => s.p.locator('#secTenue').innerText();
const timeline = s => s.p.locator('.outfit-moment').evaluateAll(xs => xs.map(x => ({ start: x.dataset.start, end: (x.querySelector('time').innerText.split('–')[1] || '').trim(), location: x.querySelector('.outfit-moment-heading b').innerText, kind: x.dataset.kind, text: x.innerText })));
const view = async (s, name) => { await s.p.locator('[data-act="view"][data-v="' + name + '"]').click(); await s.settle(2); };
const outfitSnapshot = async s => ({ text: await outfit(s), base: await s.p.locator('.outfit-base').innerText(), carry: await s.p.locator('.outfit-carry').innerText(), timeline: await timeline(s), pieces: await s.p.locator('.outfit-pieces').innerText() });
const same = (a, b) => a && b && Math.abs(a.lat - b.lat) < .011 && Math.abs(a.lon - b.lon) < .011;

(async () => {
  const browser = await require('./lib/browser').launch();
  try {
    // Un rendez-vous réellement froid change le kit ; sa suppression doit traverser toutes les vues du même plan.
    {
      const s = await session(browser, '2026-10-03T08:00:00+02:00', { coldNetwork: A }), ev = eveningEvent();
      await program(s, { events: [ev], coldIds: [ev.id] }); await view(s, 'tenue');
      const original = await s.p.evaluate(() => JSON.stringify(CAL.events)), before = await outfitSnapshot(s);
      check('35.1 · fixture matin 22 °C / soir 4 °C : timeline N1 au départ, N4 au rendez-vous', before.timeline.some(x => x.kind === 'home' && /N1/.test(x.text) && /22(?:,0)?\s*°/.test(x.text)) && before.timeline.some(x => x.kind === 'event' && /Alpha/.test(x.text) && /N4/.test(x.text) && /4(?:,0)?\s*°/.test(x.text)));
      check('35.2 · kit maximal explicite, manteau et maille à emporter, pluie du soir visible', /Kit complet de la journée\s*·\s*N4 max/i.test(before.base) && /manteau/i.test(before.carry) && /maille chaude/i.test(before.carry) && /imperméable|parapluie/i.test(before.carry) && !/Tenue de base/i.test(before.text));
      await view(s, 'pneus'); const declined = await s.cancel(false); await view(s, 'tenue');
      check('35.3 · confirmation refusée : événement froid et kit inchangés', declined && (await outfitSnapshot(s)).base === before.base && (await outfit(s)).includes(privateTitle));
      await view(s, 'pneus'); const confirmed = await s.cancel(true); await view(s, 'tenue'); const cancelled = await outfitSnapshot(s);
      check('35.4 · confirmation acceptée : événement et ses lieux absents de toute la timeline Tenue', confirmed && !cancelled.timeline.some(x => /Alpha|PRIVE_INTEGRATION_35/.test(x.text)) && cancelled.timeline.every(x => x.kind === 'home'));
      const actions = s.p.locator('.outfit-actions'), actionsText = await actions.count() ? await actions.innerText() : '';
      check('35.5 · annulation froide/pluvieuse : kit, pièces, adaptations et emport redeviennent légers', /N1 max/.test(cancelled.base) && !/manteau|maille chaude|imperméable|parapluie/i.test([cancelled.base, cancelled.carry, cancelled.pieces].join(' ')) && !/20:00|imperméable|manteau/i.test(actionsText));
      check('35.6 · annulation locale : agenda source intact, aucune fausse arrivée', original === await s.p.evaluate(() => JSON.stringify(CAL.events)) && await s.p.evaluate(() => localStorage.getItem('twrc.tripdone')) === null && await phase(s) === 'idle');
      // Mutant en mémoire : couper volontairement le lien annulation→Tenue doit faire échouer le même oracle visible.
      const mutant = await s.p.evaluate(() => { const has = TripCancel.has; try { TripCancel.has = () => false; renderTenue(); return document.querySelector('#secTenue').innerText; } finally { TripCancel.has = has; renderTenue(); } });
      check('35.7 · contre-test propagation : ignorer l’annulation réintroduit Alpha et le manteau, oracle sensible', /PRIVE_INTEGRATION_35/.test(mutant) && /manteau/i.test(mutant) && !(await outfit(s)).includes(privateTitle));
      await view(s, 'pneus'); await s.p.locator('[data-act="trip-cancel-undo"]').first().click(); await s.settle(4); await view(s, 'tenue'); const restored = await outfitSnapshot(s);
      check('35.8 · undo immédiat : rendez-vous, N4, pluie et pièces à emporter restaurés', restored.text.includes(privateTitle) && /N4 max/.test(restored.base) && /manteau/i.test(restored.carry) && /imperméable|parapluie/i.test(restored.carry) && await s.p.evaluate(() => localStorage.getItem('twrc.tripcancel')) === null);
      const n = s.S.reqs.length;
      await s.p.locator('[data-act="outfit-occasion"][data-v="office"]').click(); await s.p.locator('[data-act="outfit-occasion"][data-v="walk"]').click();
      await s.p.locator('[data-act="outfit-day"][data-v="1"]').click(); await s.p.locator('[data-act="outfit-day"][data-v="0"]').click(); await s.settle(2);
      check('35.9 · Tenue et ses réglages : aucun nouvel appel réseau, aucune récupération propre au plan', s.S.reqs.length === n);
      const pr = await privacy(s); check('35.10 · propagation et undo : aucune écriture réseau, aucun titre transmis', pr.readOnly && pr.providers && !JSON.stringify(s.S.reqs).includes(privateTitle), pr.detail);
      await s.c.close();
    }
    // Annuler une journée de travail n'altère ni ses jours configurés ni la journée suivante.
    {
      const s = await session(browser, '2026-10-05T06:00:00+02:00', { work: true, coldNetwork: W }); await program(s, { coldWork: true });
      const days = await s.p.evaluate(() => JSON.stringify(S.work.days)); await view(s, 'tenue'); const before = await outfitSnapshot(s);
      check('35.11 · fixture travail : lieu, aller et retour présents, travail froid N4', before.timeline.some(x => x.kind === 'work' && /Travail intégration/.test(x.text)) && before.timeline.filter(x => x.kind === 'trip').some(x => /Maison intégration.*Travail intégration/is.test(x.text)) && /N4 max/.test(before.base));
      await view(s, 'pneus'); const asked = await s.cancel(true); await view(s, 'tenue'); const after = await outfitSnapshot(s);
      check('35.12 · Pas de trajet aujourd’hui : travail et commute retirés du plan, kit N1', asked && after.timeline.every(x => x.kind === 'home' && !/Travail intégration/.test(x.text)) && /N1 max/.test(after.base) && !/manteau|imperméable/i.test(after.carry) && days === await s.p.evaluate(() => JSON.stringify(S.work.days)));
      await s.p.locator('[data-act="outfit-day"][data-v="1"]').click(); const next = await outfitSnapshot(s);
      check('35.13 · annulation du lundi : mardi garde travail, commute et kit froid sans modifier la configuration', /06\/10/.test(next.text) && next.timeline.some(x => x.kind === 'work') && next.timeline.some(x => x.kind === 'trip') && /N4 max/.test(next.base) && days === await s.p.evaluate(() => JSON.stringify(S.work.days)));
      await s.to('2026-10-06T06:00:00+02:00'); await s.p.locator('[data-act="outfit-day"][data-v="0"]').click(); await s.settle(5); const current = await outfitSnapshot(s);
      check('35.14 · expiration sans rechargement : suppression physique et journée suivante intacte', await s.p.evaluate(() => localStorage.getItem('twrc.tripcancel')) === null && /06\/10/.test(current.text) && current.timeline.some(x => x.kind === 'work') && current.timeline.some(x => x.kind === 'trip') && /N4 max/.test(current.base));
      await s.c.close();
    }
    // Le dernier lieu valide est partagé par la chaîne trajet et la frise de tenue, même après plusieurs annulations.
    {
      const date = '2026-10-03', spots = [A, B, C], events = spots.map((spot, i) => {
        const hour = 12 + i * 3, s = date + 'T' + hour + ':00', e = date + 'T' + (hour + 1) + ':00';
        const dep = date + 'T' + (hour - 1) + ':20', arr = date + 'T' + (hour - 1) + ':50';
        return { id: 'tech-chain-' + i, t: privateTitle + ' ' + ['Alpha', 'Beta', 'Gamma'][i], s, e, loc: 'Adresse fictive ' + i, ...spot, mode: i ? 'direct' : null,
          legs: [route('go', i ? spots[i - 1] : H, spot, dep, arr), ...(i === 2 ? [route('ret', spot, H, date + 'T19:10', date + 'T19:40')] : [])] };
      });
      const s = await session(browser, '2026-10-03T08:00:00+02:00', { chain: true }); await program(s, { events });
      await view(s, 'tenue'); check('35.15 · fixture chaîne : Alpha, Beta et Gamma visibles dans Tenue', /Alpha/.test(await outfit(s)) && /Beta/.test(await outfit(s)) && /Gamma/.test(await outfit(s)));
      let releaseRoute; s.S.routeHold = new Promise(resolve => { releaseRoute = resolve; });
      await view(s, 'pneus'); await s.cancel(true); await view(s, 'tenue'); const pending = await outfitSnapshot(s);
      check('35.16a · reconstruction en attente : Tenue annonce l’incertitude et ne conserve aucune route Alpha', s.S.routeHeld > 0 && /Origine.*confirmer/i.test(pending.text) && !/Alpha/.test(pending.text) && !pending.timeline.some(x => x.kind === 'trip' && /Alpha/.test(x.text)));
      const pendingNetworkAt = s.S.reqs.length;
      await s.p.evaluate(() => { renderTenue(); renderTenue(); }); await s.settle(1);
      check('35.16b · rendu Tenue pendant OSRM en attente : zéro appel réseau supplémentaire', s.S.reqs.length === pendingNetworkAt);
      releaseRoute(); s.S.routeHold = null; await s.settle(7); const afterA = await outfitSnapshot(s);
      check('35.16c · réponse route et météo reçue : Tenue se met à jour sans geste ni changement d’onglet', afterA.timeline.some(x => x.kind === 'trip' && /(?:Maison intégration|Domicile).*Beta/is.test(x.text)) && !/Alpha/.test(afterA.text));
      const legsA = await s.p.evaluate(() => CAL.events.map(e => ({ title: e.t, legs: effLegs(e).map(l => ({ from: l.from, to: l.to, pending: !!l.originPending })) })));
      check('35.16 · annuler A : aucun lieu Alpha dans Tenue ni origine effective suivante', !/Alpha/.test(afterA.text) && /Beta/.test(afterA.text) && legsA[1].legs.every(l => !l.from || !(Math.abs(l.from.lat - 49.20779) < .01 && Math.abs(l.from.lon - 2.58743) < .01)));
      // Le trajet Beta→Gamma reste parfaitement valable : seule l'arrivée à Beta dépendait d'Alpha.
      const toBeta = afterA.timeline.filter(x => x.kind === 'trip' && /→\s*Lieu Beta/.test(x.text));
      check('35.17 · après A : continuité domicile→Beta ou origine explicitement inconnue, jamais Alpha', toBeta.length > 0 && toBeta.every(x => !/Alpha/.test(x.text) && /Maison intégration|Domicile|Origine.*confirmer|Lieu inconnu/i.test(x.text)) && legsA[1].legs.some(l => l.pending || same(l.from, H)), JSON.stringify({ timeline: toBeta, legs: legsA[1].legs }));
      await view(s, 'pneus'); await s.cancel(true); await s.settle(7); await view(s, 'tenue'); const afterB = await outfitSnapshot(s);
      const legsB = await s.p.evaluate(() => CAL.events.map(e => ({ title: e.t, legs: effLegs(e).map(l => ({ from: l.from, to: l.to, pending: !!l.originPending })) })));
      check('35.18 · annulations A puis B : Gamma retenu, jamais lieu ni origine de A/B', !/Alpha|Beta/.test(afterB.text) && /Gamma/.test(afterB.text) && legsB[2].legs.every(l => !l.from || ![A, B].some(p => same(l.from, p))));
      check('35.19 · après A/B : nouvelle origine fiable domicile ou attente explicite, aucune arrivée', legsB[2].legs.some(l => l.pending || same(l.from, H)) && afterB.timeline.filter(x => x.kind === 'trip').every(x => !/Alpha|Beta/.test(x.text)) && await s.p.evaluate(() => localStorage.getItem('twrc.tripdone')) === null && await phase(s) === 'idle');
      await view(s, 'pneus'); await s.cancel(true); await view(s, 'tenue'); const afterC = await outfitSnapshot(s);
      check('35.20 · annulations A/B/C : aucun rendez-vous, aucun trajet, continuité au domicile', !/Alpha|Beta|Gamma/.test(afterC.text) && afterC.timeline.every(x => x.kind === 'home') && await s.p.evaluate(() => Object.keys(TRIPCANCEL).length) === 3);
      await s.c.close();
    }
    // Un fix précis considéré « frais » par LIVE ne suffit pas pour le geste volontaire « maintenant ».
    for (const age of [3, 4]) {
      const s = await session(browser, '2026-10-03T08:00:00+02:00'), ev = eveningEvent(); await program(s, { events: [ev] });
      await s.enableGps(G.here); await s.to('2026-10-03T08:0' + age + ':00+02:00');
      await s.p.evaluate(n => { FIX.ts = Date.now() - n * 60e3; }, age);
      const stale = await s.p.evaluate(() => ({ age: Date.now() - FIX.ts, fresh: liveFresh(FIX, LIVE_AGE_IMM), acc: FIX.acc, phase: LIVE.phase }));
      check('35.21 · fixture GPS précis âgé de ' + age + ' min : encore frais pour LIVE, ailleurs sans déplacement simulé au watch', stale.age >= age * 60e3 && stale.age < 5 * 60e3 && stale.fresh && stale.acc === 25 && stale.phase === 'idle', JSON.stringify(stale));
      await s.p.evaluate(g => window.__geoSet({ ...g, age: 0, acc: 25 }), G.moved);
      const logAt = await s.p.evaluate(() => window.__geoLog.length), routeAt = s.S.osrm.length, stored = await s.p.evaluate(() => localStorage.getItem('twrc.croute'));
      await s.p.locator('#secBrf [data-act="trip-preview"]').first().click(); await s.settle(8);
      const log = await s.p.evaluate(n => window.__geoLog.slice(n), logAt), routes = s.S.osrm.slice(routeAt), preview = await s.p.evaluate(() => ({ phase: TRIPPREVIEW.phase, fix: TRIPPREVIEW.fix, live: LIVE.phase, watches: window.__geoWatches(), stored: localStorage.getItem('twrc.croute') }));
      check('35.22 · « maintenant » avec GPS vieux de ' + age + ' min : getCurrentPosition maximumAge 0 systématique', log.filter(x => x.kind === 'get').length === 1 && log.some(x => x.kind === 'get' && x.options.maximumAge === 0), JSON.stringify(log));
      check('35.23 · aperçu ' + age + ' min : route/météo depuis nouveau GPS arrondi, ancien point inutilisé', preview.phase === 'ready' && preview.fix && preview.fix.lat === G.moved.lat && preview.fix.lon === G.moved.lon && routes.length === 1 && /driving\/3\.333,49\.399;/.test(routes[0]) && !/driving\/3\.306,49\.385;/.test(routes[0]) && /Aperçu depuis ma position/i.test(await s.txt()), JSON.stringify({ preview, routes }));
      check('35.24 · aperçu ponctuel ' + age + ' min : LIVE idle, zéro watch haute précision, zéro route persistée', preview.live === 'idle' && !preview.watches.includes(true) && !log.some(x => x.kind === 'watch' && x.hi) && preview.stored === stored);
      await s.c.close();
    }
    // #pasdetrajet est exclu du plan, sans déplacer la personne vers les coordonnées du rendez-vous.
    {
      const date = '2026-10-03';
      const noMove = { id: 'tech-audit-no-move', t: 'Audit non spatial B', s: date + 'T12:00', e: date + 'T14:00', loc: 'Adresse fictive Beta', ...B, mode: 'pasdetrajet', legs: [] };
      const next = { id: 'tech-audit-after-no-move', t: 'Audit déplacement Gamma', s: date + 'T18:00', e: date + 'T19:00', loc: 'Adresse fictive Gamma', ...C,
        legs: [route('go', H, C, date + 'T17:20', date + 'T17:50'), route('ret', C, H, date + 'T19:10', date + 'T19:40')] };
      const s = await session(browser, '2026-10-03T08:00:00+02:00', { coldNetwork: B }); await program(s, { events: [noMove, next], coldIds: [noMove.id] }); await view(s, 'tenue');
      const noMovePlan = await outfitSnapshot(s), actual = await s.p.evaluate(() => ({
        cold: CALM['cal49.55_2.20'].m.hs.find(h => h.t === '2026-10-03T12:00'),
        during: buildTenueDay().moments.filter(x => x.start < '2026-10-03T17:20' && x.end > '2026-10-03T12:00'),
        following: effLegs(CAL.events[1]).filter(l => l.k === 'go').map(l => ({ from: l.from, to: l.to, pending: !!l.originPending }))
      }));
      check('35.audit1 · fixture #pasdetrajet : coordonnées Beta et météo 4 °C/pluie réellement disponibles', actual.cold.T === 4 && actual.cold.Tapp === 4 && actual.cold.pp === 95 && actual.cold.P === 2);
      check('35.audit2 · #pasdetrajet absent : Maison et sa météo 22 °C restent continues jusqu’au vrai départ', actual.during.length > 0 && actual.during.every(x => x.kind === 'home' && /Maison intégration/.test(x.location) && !/Lieu Beta|Audit non spatial B/.test(x.location) && x.weather && x.weather.T === 22 && x.weather.Tapp === 22), JSON.stringify(actual.during.map(x => ({ start: x.start, end: x.end, kind: x.kind, location: x.location, temperature: x.weather && x.weather.T }))));
      check('35.audit3 · #pasdetrajet froid/pluvieux : aucune couche ni protection inventée pour Beta', /N1 max/.test(noMovePlan.base) && !/manteau|maille chaude|imperméable|parapluie/i.test([noMovePlan.base, noMovePlan.carry, noMovePlan.pieces].join(' ')) && noMovePlan.timeline.every(x => !/Lieu Beta/.test(x.location)));
      check('35.audit4 · rendez-vous suivant : origine fiable Maison, jamais Beta', actual.following.length === 1 && same(actual.following[0].from, H) && !same(actual.following[0].from, B) && noMovePlan.timeline.some(x => x.kind === 'trip' && /Maison intégration.*Lieu Gamma/is.test(x.location)));
      const networkAt = s.S.reqs.length; await s.p.evaluate(() => { renderTenue(); renderTenue(); }); await s.settle(1);
      check('35.audit5 · #pasdetrajet : consulter la météo déjà injectée ne déclenche aucun appel réseau', s.S.reqs.length === networkAt);
      // Un ancien relais peut avoir conservé Beta comme origine de Gamma : cette route ne doit jamais redevenir crédible.
      await s.p.evaluate(b => {
        const go = CAL.events[1].legs.find(l => l.k === 'go'); go.from = { ...b }; go.fromKind = 'prev';
        go.g = [[b.lat, b.lon], [go.to.lat, go.to.lon]];
        go.pts = [{ f: .5, lat: (b.lat + go.to.lat) / 2, lon: (b.lon + go.to.lon) / 2, km: 22.5 }];
        renderAll();
      }, B); await s.settle(7);
      const legacy = await outfitSnapshot(s), following = await s.p.evaluate(() => effLegs(CAL.events[1]).filter(l => l.k === 'go').map(l => ({ from: l.from, pending: !!l.originPending, g: l.g })));
      check('35.audit5b · ancienne origine #pasdetrajet : trajet suivant reconstruit depuis Maison ou explicitement en attente', following.length === 1 && following.every(l => !same(l.from, B) && (l.pending || same(l.from, H))), JSON.stringify(following));
      check('35.audit5c · ancienne route Beta→Gamma : Tenue ne reprend ni le lieu froid ni sa météo', /N1 max/.test(legacy.base) && !legacy.timeline.some(x => /Lieu Beta/.test(x.location)) && !/manteau|maille chaude|imperméable|parapluie/i.test([legacy.base, legacy.carry, legacy.pieces].join(' ')));
      await s.c.close();
    }
    // Un GPS actuellement connu prime sur l'historique planifié, jusqu'au prochain déplacement réel du programme.
    {
      const date = '2026-10-03', gps = { id: 'gps', name: 'Ma position audit', ...G.here };
      const past = { id: 'tech-audit-past', t: 'Audit programme passé', s: date + 'T08:00', e: date + 'T09:00', loc: 'Adresse fictive Alpha', ...A,
        legs: [route('go', H, A, date + 'T07:20', date + 'T07:50'), route('ret', A, H, date + 'T09:10', date + 'T09:40')] };
      const future = { id: 'tech-audit-future', t: 'Audit programme futur', s: date + 'T18:00', e: date + 'T19:00', loc: 'Adresse fictive Gamma', ...C,
        legs: [route('go', H, C, date + 'T17:20', date + 'T17:50'), route('ret', C, H, date + 'T19:10', date + 'T19:40')] };
      const s = await session(browser, '2026-10-03T10:00:00+02:00'); await program(s, { gps, coldHome: true, events: [past, future], coldIds: [past.id] }); await view(s, 'tenue');
      const plan = await outfitSnapshot(s), position = await s.p.evaluate(() => ({ selected: UI.loc, age: Date.now() - GPS.t, accuracy: GPS.acc, now: M.gps.cur, beforeDeparture: buildTenueDay().moments.filter(x => x.start < '2026-10-03T17:20') }));
      check('35.audit6 · fixture GPS fiable sélectionné, météo disponible et programme passé/futur présents', position.selected === 'gps' && position.age >= 0 && position.age < 5 * 60e3 && position.accuracy === 25 && position.now.T === 22 && await s.p.evaluate(() => CAL.events.length) === 2);
      check('35.audit7 · GPS + programme futur : premier moment à Ma position, N1 et 22 °C', plan.timeline.length > 0 && /Ma position audit/.test(plan.timeline[0].location) && /N1/.test(plan.timeline[0].text) && /22(?:,0)?\s*°/.test(plan.timeline[0].text) && !/Maison intégration|Lieu Alpha/.test(plan.timeline[0].location));
      check('35.audit8 · ancien retour Maison n’écrase pas le GPS actuel avant le premier déplacement futur', position.beforeDeparture.length > 0 && position.beforeDeparture.every(x => /Ma position audit/.test(x.location) && x.weather && x.weather.T === 22 && x.weather.Tapp === 22), JSON.stringify(position.beforeDeparture.map(x => ({ start: x.start, location: x.location, temperature: x.weather && x.weather.T }))));
      check('35.audit9 · après le prochain déplacement connu : Gamma apparaît et le plan sort du lieu GPS', plan.timeline.some(x => x.kind === 'event' && x.start === date + 'T18:00' && /Lieu Gamma/.test(x.location)) && plan.timeline.some(x => x.kind === 'trip' && /Lieu Gamma/.test(x.location)));
      // L'agenda est à la minute, le GPS à la seconde : 10:00 ne peut déplacer un GPS constaté à 10:00:30.
      await s.to(date + 'T10:00:30+02:00');
      const currentEvent = { id: 'tech-audit-same-minute-event', t: 'Audit lieu planifié même minute', s: date + 'T10:00', e: date + 'T10:30', loc: 'Adresse fictive Alpha', ...A, legs: [] };
      await s.p.evaluate(e => { GPS.t = Date.now(); FIX.ts = GPS.t; CAL.events.push(e); renderTenue(); }, currentEvent);
      const sameMinuteEvent = await outfitSnapshot(s), eventFixture = await s.p.evaluate(() => ({ start: buildTenueDay().start, event: CAL.events[2].s, seconds: new Date(GPS.t).getSeconds(), first: buildTenueDay().moments[0] }));
      check('35.audit9b · GPS observé après le début de la minute : événement spatial à cette minute n’écrase ni lieu ni météo', eventFixture.start === currentEvent.s && eventFixture.event === eventFixture.start && eventFixture.seconds > 0 && /Ma position audit/.test(sameMinuteEvent.timeline[0].location) && /N1/.test(sameMinuteEvent.timeline[0].text) && /22(?:,0)?\s*°/.test(sameMinuteEvent.timeline[0].text) && eventFixture.first.weather.T === 22 && !/Lieu Alpha/.test(eventFixture.first.location), JSON.stringify(eventFixture));
      const currentTrip = { id: 'tech-audit-same-minute-trip', t: 'Audit déplacement planifié même minute', s: date + 'T10:40', e: date + 'T11:00', loc: 'Adresse fictive Alpha', ...A,
        legs: [route('go', H, A, date + 'T10:00', date + 'T10:30')] };
      await s.p.evaluate(e => { CAL.events.pop(); CAL.events.push(e); GPS.t = Date.now(); FIX.ts = GPS.t; renderTenue(); }, currentTrip);
      const sameMinuteTrip = await outfitSnapshot(s), tripFixture = await s.p.evaluate(() => ({ start: buildTenueDay().start, departure: CAL.events[2].legs[0].dep, seconds: new Date(GPS.t).getSeconds(), first: buildTenueDay().moments[0] }));
      check('35.audit9c · GPS observé après le début de la minute : trajet à cette minute n’écrase ni lieu ni météo', tripFixture.start === currentTrip.legs[0].dep && tripFixture.departure === tripFixture.start && tripFixture.seconds > 0 && /Ma position audit/.test(sameMinuteTrip.timeline[0].location) && /N1/.test(sameMinuteTrip.timeline[0].text) && /22(?:,0)?\s*°/.test(sameMinuteTrip.timeline[0].text) && tripFixture.first.weather.T === 22 && tripFixture.first.kind !== 'trip', JSON.stringify(tripFixture));
      await s.c.close();
    }
    // Les dangers météo restent un avertissement séparé du nombre d'adaptations à effectuer.
    {
      const s = await session(browser, '2026-10-03T08:00:00+02:00');
      const cases = [
        { count: 0, level: 'stable', text: 'Tenue valable toute la journée', thermal: [] },
        { count: 1, level: 'adapt', text: '1 adaptation nécessaire', thermal: [{ from: 18, to: 24, values: { T: 4, Tapp: 4 } }] },
        { count: 2, level: 'multiple', text: 'Plusieurs adaptations', thermal: [{ from: 0, to: 11, values: { T: 4, Tapp: 4 } }, { from: 17, to: 24, values: { T: 4, Tapp: 4 } }] }
      ];
      for (const item of cases) {
        await program(s, { weatherPatches: { home: [{ from: 0, to: 24, values: { gust: 60 } }, ...item.thermal] } }); await view(s, 'tenue');
        const indicator = await s.p.locator('.outfit-indicator').evaluate(x => ({ level: x.dataset.level, text: x.innerText }));
        const warning = s.p.locator('.outfit-weather-warning'), count = await s.p.evaluate(() => dayplan(buildTenueDay()).indicator.count);
        check('35.audit10 · rafales + ' + item.count + ' adaptation(s) : niveau et libellé produit conservés', indicator.level === item.level && indicator.text === item.text && count === item.count, JSON.stringify({ indicator, count }));
        check('35.audit11 · rafales + ' + item.count + ' adaptation(s) : avertissement météo distinct de l’indicateur', await warning.count() === 1 && /Protection météo nécessaire/i.test(await warning.innerText()) && await warning.getAttribute('data-risks') === 'wind' && await s.p.locator('.outfit-indicator[data-level="warning"]').count() === 0);
      }
      for (const width of [320, 414, 1280]) {
        await s.p.setViewportSize({ width, height: 896 });
        check('35.audit12 · indicateur et avertissement sans débordement à ' + width + ' px', await s.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await s.c.close();
    }
    check('35.25 · produit combiné : aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
    console.log(`\n${rows.length - failed}/${rows.length} scénarios d’intégration OK`);
  } finally { await browser.close(); }
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
