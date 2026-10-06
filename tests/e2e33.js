// Régressions GPS : petits déplacements cumulés, reprise iOS, vrais horodatages, réponses tardives et oubli.
// Positions, horloge, agenda et réseau fictifs ; le navigateur n'a aucun accès au réseau réel.
'use strict';
const fs = require('fs'), vm = require('vm');
const T0 = Date.parse('2026-10-04T02:00:00+02:00'), RD = Date;
const FD = class extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
const ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const U = 'https://ipoower.github.io/iPoower/race-control/', html = fs.readFileSync('site/index.html', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP;
const A = { lat: 49.38471, lon: 3.30617 }, G = n => ({ lat: A.lat + n * 0.01, lon: A.lon });
const rows = [], errors = [], requests = []; let failed = 0, hold = null;
const check = (name, ok, detail = '') => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) failed++; };
const rounded = g => ({ lat: +g.lat.toFixed(4), lon: +g.lon.toFixed(4) });
const eq = (p, g) => p && p.lat === rounded(g).lat && p.lon === rounded(g).lon;
const city = g => 'Ville ' + g.lat.toFixed(4);

(async () => {
  const b = await require('./lib/browser').launch();
  const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris' });
  await c.addInitScript(({ lat, lon }) => {
    const st = { lat, lon, age: 0, acc: 24 }, watches = new Map(), oldWatches = new Map(), pending = [];
    try { const saved = JSON.parse(localStorage.getItem('twrc.gps')); if (saved) { st.lat = saved.lat; st.lon = saved.lon; } } catch (e) { /* aucune position enregistrée */ }
    let id = 0, holdGets = false, hidden = false; window.__geoLog = [];
    const mk = o => { const x = { ...st, ...o }; return { coords: { latitude: x.lat, longitude: x.lon, accuracy: x.acc, speed: null }, timestamp: Date.now() - x.age }; };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(ok, err, options) { window.__geoLog.push({ kind: 'get', options }); const pos = mk(); if (holdGets) pending.push(() => ok(pos)); else setTimeout(() => ok(pos), 0); },
      watchPosition(ok, err, options) { const n = ++id; watches.set(n, ok); oldWatches.set(n, ok); window.__geoLog.push({ kind: 'watch', id: n, options }); return n; },
      clearWatch(n) { watches.delete(n); window.__geoLog.push({ kind: 'clear', id: n }); }
    } });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    window.__geoSet = o => Object.assign(st, o);
    window.__geoPush = o => { const pos = mk(o); watches.forEach(ok => ok(pos)); };
    window.__geoOldWatch = (n, o) => oldWatches.get(n)(mk(o));
    window.__geoHoldGets = on => { holdGets = on; };
    window.__geoFlushGets = () => pending.splice(0).forEach(reply => reply());
    window.__geoWatches = () => [...watches.keys()];
    window.__geoHide = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  }, A);
  const p = await c.newPage(); await p.clock.install({ time: T0 }); p.on('pageerror', e => errors.push(e.message));
  await p.route('**/*', async r => {
    const u = r.request().url(); requests.push(u);
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    const q = new URL(u).searchParams;
    if (hold && q.get('latitude') === hold.lat && /api\.bigdatacloud\.net|api\.open-meteo\.com/.test(u)) { if (u.includes('api.bigdatacloud.net')) hold.geocode++; else hold.weather++; await hold.wait; }
    if (u.includes('api.bigdatacloud.net')) return J({ locality: 'Ville ' + Number(q.get('latitude')).toFixed(4), principalSubdivision: 'Région test' });
    if (u.includes('open-meteo.com')) {
      const base = ctx.mk('doux', { lat: +q.get('latitude'), lon: +q.get('longitude') }, 'Europe/Paris', 0);
      return J(u.includes('air-quality-api') ? ctx.ma(base) : u.includes('ensemble-api') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : base);
    }
    if (u.includes('api.rainviewer.com')) return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
    if (u.includes('leaflet/1.9.4/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (u.includes('leaflet/1.9.4/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.includes('/race-control/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
    if (u.startsWith(U)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const settle = async (n = 4) => { for (let i = 0; i < n; i++) { await p.clock.runFor(700); await p.waitForTimeout(100); } };
  const state = () => p.evaluate(() => ({ gps: GPS && { ...GPS }, raw: RAW.gps && { lat: RAW.gps.lat, lon: RAW.gps.lon }, fix: FIX && { ...FIX }, busy: gpsBusy, loc: UI.loc }));
  const move = async (g, o = {}) => { await p.clock.runFor(1000); await require('./lib/geo-fixture-time').coherentTime(p, g, o); await p.evaluate(x => { window.__geoSet(x); window.__geoPush(); }, { ...g, age: 0, ...o }); await settle(); };
  const gpsRequests = () => requests.filter(u => { const q = new URL(u).searchParams; return Number(q.get('longitude')) === rounded(A).lon && /api\.bigdatacloud\.net|\/v1\/forecast/.test(u); });
  const pauseNetwork = g => { let release; hold = { lat: g.lat.toFixed(4), geocode: 0, weather: 0, wait: new Promise(r => { release = r; }), release: () => release() }; return hold; };
  await p.goto(U); await p.clock.runFor(3000);
  await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE)) break; await p.clock.runFor(200); await p.waitForTimeout(150); }
  await p.evaluate(() => locate(true)); await settle(8);
  let s = await state(); const initial = gpsRequests().length;
  check('1 · activation : position réelle, ville et météo alignées', eq(s.gps, A) && eq(s.raw, A) && s.gps.name === city(A));
  await move(G(1)); await move(G(2)); s = await state();
  check('2 · pas de 1,1 km puis 2,2 km : coordonnées à jour, météo conservée sans requêtes inutiles', eq(s.gps, G(2)) && eq(s.raw, A) && s.gps.name === city(A) && gpsRequests().length === initial);
  await move(G(3)); s = await state();
  check('3 · petits pas, 3,3 km cumulés : ville et météo changent', eq(s.gps, G(3)) && eq(s.raw, G(3)) && s.gps.name === city(G(3)) && gpsRequests().length === initial + 4);
  await move(G(4));
  const before = await state(), count = gpsRequests().length;
  await p.evaluate(x => window.__geoPush(x), { ...G(-20), age: 10 * 60e3 }); await settle(2); s = await state();
  check('4 · ancien fix reçu après un fix récent : position, heure, nom et météo conservés', JSON.stringify(s.gps) === JSON.stringify(before.gps) && eq(s.raw, before.raw) && s.fix.ts === before.fix.ts && gpsRequests().length === count);
  // Une demande et un watch abandonnés par iOS ne peuvent empêcher ou annuler la reprise.
  const oldWatch = (await p.evaluate(() => window.__geoWatches()))[0];
  await p.evaluate(() => { window.__geoHoldGets(true); locate(false); window.__geoHide(true); });
  const stopped = await p.evaluate(() => window.__geoWatches().length);
  await p.clock.runFor(60e3);
  await p.evaluate(g => { window.__geoSet(g); window.__geoHoldGets(false); window.__geoHide(false); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); }, G(5));
  await settle(8); s = await state();
  const resume = await p.evaluate(() => ({ watches: window.__geoWatches(), logs: window.__geoLog }));
  check('5 · sortie de veille : demande débloquée, watch recréé et coordonnées fraîches', stopped === 0 && !s.busy && resume.watches.length === 1 && resume.watches[0] !== oldWatch && eq(s.gps, G(5)));
  const gets = resume.logs.filter(x => x.kind === 'get');
  check('6 · reprise fraîche, acquisition précise puis suivi économique ; événements rapprochés regroupés', gets.at(-1).options.maximumAge === 0 && gets.at(-1).options.enableHighAccuracy && resume.logs.filter(x => x.kind === 'watch').every(x => !x.options.enableHighAccuracy));
  const latest = await state();
  await p.evaluate(({ id, g }) => { window.__geoFlushGets(); window.__geoOldWatch(id, g); }, { id: oldWatch, g: G(-30) }); await settle(2); s = await state();
  check('7 · ancienne demande et ancien watch : callbacks ignorés après la reprise', JSON.stringify(s.gps) === JSON.stringify(latest.gps) && s.fix.ts === latest.fix.ts);
  await p.clock.runFor(60e3); await move(G(5), { age: 30000 }); s = await state();
  const now = await p.evaluate(() => Date.now());
  check('8 · cache GPS de 30 s : date du relevé conservée, jamais remplacée par la réception', s.gps.t === s.fix.ts && now - s.gps.t >= 30000 && now - s.gps.t < 40000);
  // Ancienne réponse géocode/météo retardée pendant qu'une nouvelle ville a déjà été chargée.
  const delayed = pauseNetwork(G(8)); await move(G(8));
  await move(G(12)); const current = await state();
  delayed.release(); hold = null; await settle(8); s = await state();
  // La limite de deux appels ne lance plus les trois modèles ensemble ; les deux sources anciennes doivent bien être retardées.
  check('9 · géocode/météo dans le désordre : la dernière ville et ses coordonnées gagnent', delayed.geocode >= 1 && delayed.weather >= 1 && eq(current.raw, G(12)) && eq(s.raw, G(12)) && eq(s.gps, G(12)) && s.gps.name === city(G(12)));
  // Le cache météo reste valide après un petit mouvement, même si ses coordonnées ne sont pas celles du dernier fix.
  await move(G(13));
  const cached = await p.evaluate(() => { delete RAW.gps; loadCache(); return RAW.gps && { mode: RAW.gps.mode, lat: RAW.gps.lat, lon: RAW.gps.lon }; });
  check('10 · cache après petit mouvement : origine météo conservée au rechargement', cached && cached.mode === 'cache' && eq(cached, G(12)));
  await p.evaluate(() => { const saved = JSON.parse(localStorage.getItem('twrc.gps')); saved.name = 'Albert ancien'; localStorage.setItem('twrc.gps', JSON.stringify(saved)); });
  await p.reload(); await settle(10); s = await state();
  check('10b · premier fix après mise à jour : ancien nom persistant corrigé sans déplacement', eq(s.gps, G(13)) && s.gps.name === city(G(13)));
  const gpsMarks = [A, G(3), G(8), G(12), G(13)].map(g => g.lat.toFixed(4));
  const privacy = await p.evaluate(() => ({ keys: Object.keys(localStorage), other: Object.keys(localStorage).filter(k => !/^twrc\.(gps|cache\.gps|context\.v1)$/.test(k)).map(k => localStorage.getItem(k)).join('|') }));
  const sent = requests.filter(u => gpsMarks.some(v => u.includes(v)));
  check('11 · confidentialité : coordonnées uniquement aux fournisseurs autorisés, contexte courant local, aucun historique GPS ajouté', sent.every(u => /^(api\.bigdatacloud\.net|[a-z-]*api\.open-meteo\.com)$/.test(new URL(u).hostname)) && !gpsMarks.some(v => privacy.other.includes(v)) && !privacy.keys.some(k => /gps.*(?:history|origin|raw|fix)/i.test(k)));
  const forgotten = pauseNetwork(G(17)); await move(G(17));
  await p.evaluate(() => { window.__geoHoldGets(true); locate(true); renderSettings(true); document.querySelector('[data-act="gps-forget"]').click(); window.__geoFlushGets(); });
  forgotten.release(); hold = null; await settle(8);
  const gone = await p.evaluate(() => ({ gps: GPS, fix: FIX, auto: S.gpsAuto, cache: localStorage.getItem('twrc.cache.gps'), saved: localStorage.getItem('twrc.gps'), raw: RAW.gps, watches: window.__geoWatches() }));
  check('12 · oublier pendant des requêtes : aucune réponse ne recrée GPS ni cache', gone.gps === null && gone.fix === null && !gone.auto && gone.cache === null && gone.saved === null && !gone.raw && gone.watches.length === 0);
  console.log(rows.join('\n') + `\n\n${rows.length - failed}/${rows.length} scénarios OK · erreurs JS : ${errors.length ? errors.join(' | ') : 'aucune'}`);
  await c.close(); await b.close(); process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.log(rows.join('\n')); console.error(e); process.exit(1); });
