// Fraîcheur indépendante du relais, réseau entièrement simulé, aucune donnée ni clé personnelle.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const U = 'https://ipoower.github.io/iPoower/race-control/';
const T0 = Date.parse('2026-10-05T10:00:00+02:00');
const preset = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/preset.fake.json'), 'utf8'));
preset.work.days = [6]; preset.gpsAuto = 0; // Lundi simulé : aucun trajet travail, départ physique à Maison test.
const html = fs.readFileSync('site/index.html', 'utf8').replace('<body>', '<body><script>window.TWRC_PRESET=' + JSON.stringify(preset) + ';</script>');
let now = T0;
const RD = Date, FD = class extends RD { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
const ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const rows = [], errors = []; let failed = 0;
const check = (name, ok, detail = '') => { const line = (ok ? '✅ ' : '❌ ') + name + (detail ? ' · ' + detail : ''); rows.push(line); console.log(line); if (!ok) failed++; };
const isoAgo = mins => new Date(now - mins * 60000).toISOString();
const observation = (fetchAge = 0, completeAge = fetchAge) => ({ updated: isoAgo(fetchAge), completedAt: isoAgo(completeAge), observationsFetchedAt: isoAgo(fetchAge), stations: { TEST: { id: 'TEST', name: 'Station fictive', lat: preset.locs[0].lat, lon: preset.locs[0].lon, last: { t: isoAgo(10), T: 5, Td: 3, vis: 10000, wind: 5, gust: 10, wx: '', raw: 'DONNEES FICTIVES' } } } });

(async () => {
  const browser = await require('./lib/browser').launch();
  try {
    const c = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
    await c.addInitScript(() => {
      window.__offline = false;
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__offline });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      window.__network = offline => { window.__offline = offline; dispatchEvent(new Event(offline ? 'offline' : 'online')); };
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {} } });
    });
    const p = await c.newPage(); await p.clock.install({ time: T0 });
    p.on('pageerror', e => errors.push(e.message));
    const net = { count: 0, forecasts: 0, observations: 0, obs: observation(), hold: null, held: 0 };
    let release;
    net.hold = new Promise(resolve => { release = resolve; });
    await p.route('**/*', async r => {
      const u = r.request().url(); net.count++;
      const J = value => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value) });
      if (u.includes('/race-control/obs.json')) {
        net.observations++; const snapshot = net.obs, held = net.hold;
        if (held) { net.held++; await held; }
        return J(snapshot).catch(() => {}); // Une réponse annulée pendant le scénario offline est attendue.
      }
      if (u.includes('open-meteo.com')) {
        const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
        if (new URL(u).pathname === '/v1/forecast') net.forecasts++;
        const one = i => {
          const data = ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
          for (let k = 0; k < data.hourly.time.length; k++) {
            data.hourly.temperature_2m[k] = 22; data.hourly.apparent_temperature[k] = 22;
            data.hourly.precipitation_probability[k] = 0; data.hourly.precipitation[k] = 0;
            data.hourly.rain[k] = 0; data.hourly.showers[k] = 0; data.hourly.snowfall[k] = 0;
            data.hourly.weather_code[k] = 0; data.hourly.wind_gusts_10m[k] = 10;
          }
          for (const k of ['temperature_2m', 'apparent_temperature', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'wind_gusts_10m']) data.current[k] = data.hourly[k][0];
          return data;
        };
        if (lats.length > 1) return J(lats.map((_, i) => one(i)));
        const data = one(0); return J(u.includes('air-quality-api') ? ctx.ma(data) : u.includes('ensemble') ? ctx.me(data) : q.get('minutely_15') ? ctx.mn(data) : data);
      }
      if (u.includes('api.rainviewer.com')) return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
      if (u.includes('public.opendatasoft.com')) return J({ records: [] });
      if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
      if (u.includes('leaflet/1.9.4/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
      if (u.includes('leaflet/1.9.4/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
      if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
      if (u.includes('/race-control/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '// worker bloqué par le harnais' });
      if (u === U) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort();
    });
    const settle = async (n = 4) => { for (let i = 0; i < n; i++) { now += 150; await p.clock.runFor(150); await p.waitForTimeout(100); } };
    const snap = () => p.evaluate(() => ({ busy, lastOk, obs: !!OBS, relay: RELAYSYNC, model: M.home && { mode: M.home.mode, current: M.home.cur.T, adjusted: M.home.hs[M.home.nowI].T, station: M.home.obs }, live: document.querySelector('#statusbar').innerText, source: document.querySelector('#srcline').textContent }));
    const refresh = async payload => { net.obs = payload; await p.evaluate(() => refreshAll()); await settle(5); return snap(); };
    await p.goto(U); await settle(10);
    let state = await snap();
    check('38.1 · réponse obs retenue : prévisions directes et MAJ rendues sans attendre le relais', net.held > 0 && !state.busy && state.lastOk >= T0 && state.model.mode === 'live' && state.model.current === 22 && /LIVE/.test(state.live), JSON.stringify(state));
    net.hold = null; release(); await settle(4);

    state = await refresh(observation(40));
    check('38.2 · relais de 40 min exclu du recalage ; météo directe fraîche toujours LIVE', !state.obs && !state.model.station && state.model.adjusted === 22 && state.model.mode === 'live' && /LIVE/.test(state.live), JSON.stringify(state));
    check('38.3 · retard relais 40 min explicite et distinct de la MAJ locale', /40 min/.test(state.source) && /Relais en retard/.test(state.source) && /météo locale est actualisée directement/.test(state.source));

    state = await refresh(observation(40, 0));
    check('38.4 · completedAt récent ne rajeunit jamais les observations récupérées il y a 40 min', !state.obs && !state.model.station && state.model.adjusted === 22 && /Observations stations récupérées il y a 40 min/.test(state.source), JSON.stringify(state.relay));

    const measured = observation(0), stationTime = measured.stations.TEST.last.t;
    state = await refresh(measured);
    check('38.5 · station disponible : heure réelle de mesure conservée, âge de 10 min et recalage effectif', state.obs && state.model.station && state.model.station.t === stationTime && state.model.station.age === 10 && state.model.adjusted === 5, JSON.stringify(state.model));
    const future = observation(0); future.observationsFetchedAt = new Date(now + 2 * 60000).toISOString();
    state = await refresh(future);
    check('38.6 · récupération datée de plus de 60 s dans le futur : observations rejetées', !state.obs && !state.model.station && state.model.adjusted === 22);
    const missing = observation(0); delete missing.observationsFetchedAt; missing.metarError = true;
    state = await refresh(missing);
    check('38.7 · METAR en échec : updated récent ne suffit pas à faire accepter un cache station', !state.obs && !state.model.station);

    net.obs = observation(0);
    await p.evaluate(() => { lastOk = Date.now(); lastTry = Date.now(); });
    const beforeAuto = net.forecasts;
    now += 239000; await p.clock.fastForward(239000); await p.waitForTimeout(100);
    check('38.8 · auto : aucune relance météo avant les 4 min', net.forecasts === beforeAuto);
    now += 16000; await p.clock.fastForward(16000); await settle(5); state = await snap();
    check('38.9 · auto : relance au plus tard à 4 min 15 s, libellé 4 min sans attendre 5 min', net.forecasts > beforeAuto && /auto 4 min/.test(state.live) && !/auto 5 min/.test(state.live) && !state.busy, state.live);

    net.hold = new Promise(resolve => { release = resolve; }); net.obs = observation(0);
    await p.evaluate(() => refreshAll()); await settle(2);
    await p.evaluate(() => window.__network(true)); await settle(2);
    net.hold = null; release(); await settle(3); state = await snap();
    check('38.10 · perte réseau invalide la réponse obs tardive et conserve HORS LIGNE', !state.obs && state.relay.state === 'offline' && /HORS LIGNE/.test(state.live) && !/\bLIVE\b/.test(state.live), JSON.stringify(state));
    const beforeOnline = net.forecasts; net.obs = observation(0);
    await p.evaluate(() => window.__network(false)); await settle(8); state = await snap();
    check('38.11 · retour réseau : météo directe relancée et LIVE rétabli automatiquement', net.forecasts > beforeOnline && state.model.mode === 'live' && /LIVE/.test(state.live) && !state.busy);

    // Le cache d'un ancien relais peut encore contenir un rappel d'objet sans aucun déplacement.
    await p.evaluate(() => {
      const day = nowIn('Europe/Paris').slice(0, 10);
      CAL = { updated: new Date(Date.now()).toISOString(), events: [
        { id: 'fake-object-reminder', t: 'Chargeur', s: day + 'T10:00', e: day + 'T12:00', loc: '', lat: null, lon: null, legs: [] },
        { id: 'fake-unresolved-address', t: 'Rendez-vous à confirmer', s: day + 'T14:00', e: day + 'T15:00', loc: 'Adresse fictive introuvable', lat: null, lon: null, legs: [] },
        { id: 'fake-nonspatial', t: 'Programme sans déplacement', s: day + 'T12:00', e: day + 'T13:00', loc: 'Lieu fictif distant', lat: 49.55, lon: 2.20, mode: 'pasdetrajet', legs: [] }
      ] }; CALDONE = true; OBS = null; rebuild(); UI.view = 'tenue'; renderAll();
    }); await settle(4);
    const program = await p.evaluate(() => ({ moments: buildTenueDay().moments, plan: dayplan(buildTenueDay()), agenda: document.querySelector('#secCal').textContent, visible: document.querySelector('#secTenue').innerText }));
    const chargeHours = program.moments.filter(m => m.start < '2026-10-05T12:00' && m.end > '2026-10-05T10:00');
    check('38.12 · ancien rappel Chargeur sans lieu : météo Maison conservée, aucun événement Tenue inventé', chargeHours.length > 0 && chargeHours.every(m => !m.unknown && m.weather && m.weather.T === 22 && /Maison test/.test(m.location) && !/Chargeur|Lieu inconnu/.test(m.location)) && !/Chargeur/.test(program.visible), JSON.stringify(chargeHours));
    check('38.13 · vraie adresse introuvable : moment explicite Lieu inconnu conservé', program.moments.some(m => m.start < '2026-10-05T15:00' && m.end > '2026-10-05T14:00' && /Lieu inconnu/.test(m.location) && !m.weather));
    const noTrip = program.moments.filter(m => m.start < '2026-10-05T13:00' && m.end > '2026-10-05T12:00');
    check('38.14 · #pasdetrajet : programme reste non spatial et garde la météo Maison', noTrip.length > 0 && noTrip.every(m => m.weather && m.weather.T === 22 && /Maison test/.test(m.location) && !/Lieu fictif distant/.test(m.location)));
    const count = net.count; await p.evaluate(() => { renderTenue(); renderTenue(); }); await settle(2);
    check('38.15 · consulter Tenue ne déclenche aucun nouvel appel réseau', net.count === count);

    for (const width of [320, 414, 1280]) {
      await p.setViewportSize({ width, height: 896 });
      const layout = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, tabs: [...document.querySelectorAll('#viewSeg button')].map(b => ({ height: b.getBoundingClientRect().height, text: b.innerText })) }));
      check('38.16 · interface ' + width + ' px : aucun débordement global, trois onglets ≥44 px', layout.scroll <= layout.width + 1 && layout.tabs.length === 3 && layout.tabs.every(b => b.height >= 44), JSON.stringify(layout));
    }
    check('38.17 · fraîcheur, réseau et Tenue : aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
    console.log('\n' + (rows.length - failed) + '/' + rows.length + ' scénarios OK · erreurs JS : ' + (errors.length ? 'présentes' : 'aucune'));
    await c.close();
  } finally { await browser.close(); }
  process.exit(failed || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
