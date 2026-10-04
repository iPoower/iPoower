// Agenda : seuls les déplacements localisés ou explicitement demandés sont visibles.
// Programme chiffré, météo, géographie et tous les appels réseau sont entièrement fictifs.
const fs = require('fs'), vm = require('vm');
const { seal } = require('../tools/keys');
const T0 = Date.parse('2026-10-03T08:00:00+02:00'), RD = Date;
class FD extends RD { constructor(...args) { super(...(args.length ? args : [T0])); } static now() { return T0; } }
const ctx = { console, Date: FD, Math, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const DAY = '2026-10-03', TITLE = 'Mon chargeur';
const H = { id: 'home', name: 'Maison test', lat: 48.85, lon: 2.35 }, W = { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 };
const A = { label: 'Destination fictive Alpha', lat: 49.02, lon: 2.52 }, B = { id: 'unused', name: 'Lieu fictif Beta', label: 'Lieu fictif Beta', lat: 49.55, lon: 2.20 };
const event = (id, start, end, extra = {}) => ({ id, t: TITLE, s: DAY + 'T' + start, e: DAY + 'T' + end, allDay: false, loc: '', lat: null, lon: null, label: null, ...extra });
const leg = (k, from, to, dep, arr) => ({ k, from: { ...from, label: from.label || from.name, city: from.label || from.name }, to: { ...to, label: to.label || to.name, city: to.label || to.name },
  dep: DAY + 'T' + dep, arr: DAY + 'T' + arr, min: 30, km: 45, fromKind: k === 'go' ? 'home' : 'event', routed: true,
  pts: [{ f: .5, lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2, km: 22.5 }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
const reminders = Array.from({ length: 30 }, (_, i) => event('test-reminder-' + String(i).padStart(2, '0'), '09:' + String(i).padStart(2, '0'), '09:' + String(i + 1).padStart(2, '0')));
// Une ancienne route ne rend pas un rappel sans lieu éligible.
reminders[0].legs = [leg('go', H, B, '08:20', '08:50'), leg('ret', B, H, '09:10', '09:40')];
const invalid = event('test-invalid-location', '11:00', '12:00', { t: 'Note fictive sans résultat', loc: 'LOCALISATION_FICTIVE_SANS_RESULTAT' });
const nonSpatial = event('test-no-travel-legacy', '13:00', '14:00', { t: 'Programme fictif #pasdetrajet', loc: B.label, ...B, id: 'test-no-travel-legacy', mode: 'pasdetrajet',
  legs: [leg('go', H, B, '12:20', '12:50'), leg('ret', B, H, '14:10', '14:40')] });
const nearby = event('test-near-home', '15:00', '16:00', { t: 'Rendez-vous fictif proche', lat: H.lat + .0001, lon: H.lon + .0001, loc: 'Près de la maison fictive', label: 'Près de la maison fictive', legs: [] });
const realTrip = event('test-real-same-title', '20:00', '21:00', { loc: A.label, ...A, legs: [leg('go', H, A, '19:20', '19:50'), leg('ret', A, H, '21:10', '21:40')] });
const explicitUnknown = event('test-explicit-unknown-trip', '11:00', '12:00', { t: 'Déplacement explicite fictif #trajet', mode: 'trajet',
  legs: [leg('go', H, B, '10:20', '10:50'), leg('ret', B, H, '12:10', '12:40')] });
const allEvents = [...reminders, invalid, nonSpatial, nearby, realTrip];
let calendarSealed = seal({ v: 2, updated: new Date(T0).toISOString(), events: allEvents }, PW);
const rows = [], errors = [], requests = []; let fail = 0;
const check = (name, ok, detail = '') => { rows.push((ok ? '✅ ' : '❌ ') + name + (detail ? ' · ' + detail : '')); if (!ok) fail++; };

(async () => {
  const browser = await require('./lib/browser').launch();
  const context = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
  await context.addInitScript(() => {
    let nextId = 0;
    window.__agendaGeoLog = [];
    // Aucun accès au GPS réel ; les appels éventuels restent observables.
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_ok, _err, options = {}) { window.__agendaGeoLog.push({ kind: 'get', hi: !!options.enableHighAccuracy }); },
      watchPosition(_ok, _err, options = {}) { const id = ++nextId; window.__agendaGeoLog.push({ kind: 'watch', id, hi: !!options.enableHighAccuracy }); return id; },
      clearWatch(id) { window.__agendaGeoLog.push({ kind: 'clear', id }); }
    } });
  });
  try {
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.clock.install({ time: T0 });
    await page.route('**/*', route => {
      const req = route.request(), url = req.url(); requests.push({ url, method: req.method(), body: req.postData() || '' });
      const J = value => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value) });
      if (url.includes('air-quality-api')) return J(ctx.ma(ctx.mk('doux', H, 'Europe/Paris', 0)));
      if (url.includes('open-meteo.com')) {
        const q = new URL(url).searchParams, lat = String(q.get('latitude')).split(','), lon = String(q.get('longitude')).split(',');
        const one = i => {
          const payload = ctx.mk('doux', { lat: +lat[i], lon: +lon[i] }, 'Europe/Paris', 0);
          const values = { temperature_2m: 22, apparent_temperature: 22, precipitation_probability: 0, precipitation: 0, rain: 0, showers: 0, snowfall: 0, weather_code: 0, wind_gusts_10m: 10, wind_speed_10m: 5 };
          for (const [key, value] of Object.entries(values)) {
            if (payload.hourly[key]) payload.hourly[key].fill(value);
            if (Object.prototype.hasOwnProperty.call(payload.current, key)) payload.current[key] = value;
          }
          return payload;
        };
        if (lat.length > 1) return J(lat.map((_, i) => one(i)));
        const base = one(0); return J(url.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : base);
      }
      if (url.includes('router.project-osrm.org')) {
        const match = /driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(url);
        if (!match) return route.abort();
        const from = [+match[1], +match[2]], to = [+match[3], +match[4]], coordinates = Array.from({ length: 11 }, (_, i) => [from[0] + (to[0] - from[0]) * i / 10, from[1] + (to[1] - from[1]) * i / 10]);
        return J({ routes: [{ distance: 45000, duration: 1800, geometry: { coordinates }, legs: [{ annotation: { duration: Array(10).fill(180) } }] }] });
      }
      if (url.includes('api.rainviewer.com')) return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
      if (url.includes('public.opendatasoft.com')) return J({ records: [] });
      if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PX });
      if (url.includes('leaflet/1.9.4/leaflet.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
      if (url.includes('leaflet/1.9.4/leaflet.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
      if (url.includes('/calendar.sealed.json')) return J(calendarSealed);
      if (url.includes('/obs.json')) return J({ stations: {} });
      if (url.includes('/tiredb.json')) return J(JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
      if (url.includes('/sw.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '// test fictif' });
      if (url.startsWith(U)) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return route.abort();
    });
    const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await page.clock.runFor(500); await page.waitForTimeout(90); } };
    await page.goto(U); await settle(); await page.fill('#unlockPw', PW);
    await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#unlockForm button[type=submit]')]);
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE && CAL && CAL.events.length === 34).catch(() => false)) break;
      await settle(1);
    }
    // Les modèles des destinations sont volontairement déjà disponibles :
    // Beta est froid et pluvieux, mais ne doit jamais devenir un déplacement.
    await page.evaluate(points => {
      liveReset(); tripPreviewReset(); TRIPCANCEL = {}; TripCancel.save(localStorage, TRIPCANCEL, Date.now());
      S.locs = [points.H, points.W]; S.customs = [points.B]; S.calDirect = {};
      S.work = { from: 'home', to: 'work', dep: '08:00', ret: '18:00', durMin: 30, days: [1, 2, 3, 4, 5] };
      GPS = FIX = FIXPREV = null; S.gpsAuto = 0; UI.loc = 'home'; UI.view = 'pneus'; UI.outfitDay = 0;
      M = {}; for (const key of Object.keys(RAW)) delete RAW[key]; for (const key of Object.keys(CALM)) delete CALM[key];
      const model = (loc, cold) => {
        // rebuild relit RAW.p : remplir le payload, pas seulement un modèle
        // temporaire qui serait remplacé par la météo « doux » d'origine.
        const payload = makeDemoPayload('doux', loc, 'Europe/Paris', 0);
        const values = { temperature_2m: cold ? 4 : 22, apparent_temperature: cold ? 4 : 22, precipitation_probability: cold ? 95 : 0,
          precipitation: cold ? 2 : 0, rain: cold ? 2 : 0, showers: 0, snowfall: 0, weather_code: cold ? 63 : 0, wind_gusts_10m: 10, wind_speed_10m: 5 };
        for (const [key, value] of Object.entries(values)) {
          if (payload.hourly[key]) payload.hourly[key].fill(value);
          if (Object.prototype.hasOwnProperty.call(payload.current, key)) payload.current[key] = value;
        }
        const m = makeModel(payload, 'live', loc);
        return { m, payload };
      };
      for (const loc of [points.H, points.W, points.B]) { const v = model(loc, loc.id === 'unused'); M[loc.id] = v.m; RAW[loc.id] = { p: v.payload, mode: 'live', t: Date.now() }; }
      for (const loc of [points.A, points.B]) { const id = 'cal' + loc.lat.toFixed(2) + '_' + loc.lon.toFixed(2), v = model({ ...loc, id }, loc.id === 'unused'); CALM[id] = { m: v.m, t: Date.now() }; }
      rebuild(); renderAll();
    }, { H, W, A, B }); await settle(8);

    const main = page.locator('#secCal .cal-l .cal-e');
    const ids = locator => locator.evaluateAll(nodes => nodes.map(n => n.dataset.eventId));
    const documentIds = () => ids(page.locator('[data-event-id]'));
    const mainIds = await ids(main), source = await page.evaluate(() => JSON.stringify(CAL.events));
    const excludedIds = [...reminders.map(e => e.id), invalid.id, nonSpatial.id];
    check('37.1 · programme réellement déchiffré : 30 rappels avant un rendez-vous portant le même titre', await page.evaluate(() => CAL.events.length) === 34 && mainIds.join('|') === realTrip.id && (await main.innerText()).includes(TITLE));
    const presentIds = await documentIds();
    check('37.2 · rappels et lieu invalide absents de toute l’interface, y compris du DOM caché', excludedIds.every(id => !presentIds.includes(id)) && !(await page.locator('body').textContent()).includes(invalid.t));
    check('37.3 · aucun volet ni liste secondaire de rappels dans l’application', await page.locator('.cal-notrips,.cal-local,.cal-local-list').count() === 0);
    check('37.4 · aucun filtrage par titre : le vrai rendez-vous homonyme garde ses deux jambes et Waze', (await main.locator('.leg').count()) === 2 && (await main.locator('a[href^="https://waze.com/ul?"]').count()) === 2);
    const brief = await page.locator('#secBrf').innerText(), briefTrips = await page.evaluate(() => BRF_TRIPS.map(t => ({ id: t.e && t.e.id, src: t.src, name: t.name, dep: t.dep, worst: t.worst })));
    check('37.5 · rappels précédents ne masquent pas le vrai prochain trajet du briefing', brief.toLocaleLowerCase('fr-FR').includes(TITLE.toLocaleLowerCase('fr-FR')) && brief.toLocaleLowerCase('fr-FR').includes(A.label.toLocaleLowerCase('fr-FR')) &&
      briefTrips.filter(t => t.src === 'cal').length === 2 && briefTrips.filter(t => t.src === 'cal').every(t => t.id === realTrip.id) && (await ids(main)).length === 1, JSON.stringify({ brief: brief.slice(0, 650), trips: briefTrips }));
    const relevant = await page.evaluate(() => CAL.events.filter(e => calendarEventRelevant(e, [...S.locs, ...S.customs])).map(e => e.id));
    check('37.6 · règle commune : seuls les deux rendez-vous localisés sont éligibles', JSON.stringify(relevant.sort()) === JSON.stringify([nearby.id, realTrip.id].sort()));
    const excludedLegs = await page.evaluate(eventIds => CAL.events.filter(e => eventIds.includes(e.id)).map(e => ({ id: e.id, legs: effLegs(e).length })), excludedIds);
    check('37.7 · anciennes jambes sans lieu et #pasdetrajet : aucun trajet effectif', excludedLegs.length === 32 && excludedLegs.every(e => e.legs === 0), JSON.stringify(excludedLegs.filter(e => e.legs)));
    check('37.8 · #pasdetrajet legacy et rendez-vous proche restent hors de la liste des trajets', ![nonSpatial.id, nearby.id].some(id => mainIds.includes(id)) && mainIds.length === 1 && !(await page.locator('body').textContent()).includes(nonSpatial.t));
    const beforeNetwork = requests.length; await page.evaluate(() => { renderCal(); renderBrf(); renderTenue(); renderCal(); }); await settle(2);
    check('37.9 · classement et consultation des trois surfaces : aucun nouvel appel réseau', requests.length === beforeNetwork);
    check('37.10 · exclure les rappels ne démarre ni LIVE ni aperçu manuel', await page.evaluate(() => LIVE.phase === 'idle' && TRIPPREVIEW.phase === 'idle'));
    check('37.11 · programme source complet inchangé après les rendus', source === await page.evaluate(() => JSON.stringify(CAL.events)));
    const cache = await page.evaluate(() => localStorage.getItem('twrc.calendar.sealed.v1') || '');
    check('37.12 · agenda en cache chiffré : aucun titre de rappel en clair', cache.length > 0 && !cache.includes(TITLE) && !cache.includes(invalid.loc));

    await page.click('[data-act="view"][data-v="tenue"]'); await settle(2);
    const outfit = await page.locator('#secTenue').innerText();
    const morning = await page.evaluate(() => buildTenueDay().moments.filter(m => m.start < '2026-10-03T13:00' && m.end > '2026-10-03T09:00'));
    check('37.13 · rappels sans lieu : Tenue garde le dernier lieu réel et sa météo, aucun segment inconnu', morning.length > 0 && morning.every(m => m.kind === 'home' && !m.unknown && /Maison test/.test(m.location) && m.weather && m.weather.Tapp === 22) && !/Lieu inconnu|Note fictive sans résultat|Programme fictif #pasdetrajet/.test(outfit));
    const kit = await page.locator('.outfit-carry,.outfit-pieces').allTextContents(), base = await page.locator('.outfit-base').innerText();
    const weather = await page.evaluate(() => ({ beta: { T: M.unused.cur.T, P: M.unused.cur.P }, unexpected: buildTenueDay().moments.filter(x => x.weather && (x.weather.Tapp !== 22 || x.weather.P !== 0)).map(x => ({ start: x.start, place: x.location, T: x.weather.T, Tapp: x.weather.Tapp, P: x.weather.P })) }));
    check('37.14 · #pasdetrajet froid/pluvieux ne déplace pas la personne vers Beta', weather.beta.T === 4 && weather.beta.P === 2 && /N1 max/.test(base) && !/Lieu fictif Beta/.test(outfit) && !/manteau|maille chaude|imperméable|parapluie/i.test(kit.join(' ')), JSON.stringify({ base, kit, weather }));
    check('37.15 · source complet inchangé après affichage Tenue', source === await page.evaluate(() => JSON.stringify(CAL.events)));

    // Sans déplacement éligible, les rappels restent seulement dans la source chiffrée.
    calendarSealed = seal({ v: 2, updated: new Date(T0).toISOString(), events: [...reminders, invalid] }, PW);
    await page.evaluate(async () => { await loadCalendar(); UI.view = 'pneus'; renderAll(); }); await settle(4);
    check('37.16 · zéro déplacement : message explicite et liste des trajets vide', /Aucun déplacement à analyser/.test(await page.locator('#secCal').innerText()) && await page.locator('#secCal .cal-l .cal-e').count() === 0 && await page.locator('#secCal a[href^="https://waze.com/"]').count() === 0);
    await page.evaluate(() => { renderCal(); renderTenue(); });
    check('37.17 · zéro déplacement : 31 sources conservées, aucun rappel dans le DOM', await page.evaluate(() => CAL.events.length) === 31 && (await documentIds()).length === 0 && await page.locator('.cal-notrips,.cal-local').count() === 0 && !(await page.locator('body').textContent()).includes(TITLE));
    await page.click('[data-act="view"][data-v="tenue"]'); await settle(2);
    const onlyReminders = await page.evaluate(() => buildTenueDay().moments);
    check('37.18 · uniquement des rappels : plan Maison complet, aucun événement ou météo inventé', onlyReminders.length > 0 && onlyReminders.every(m => m.kind === 'home' && !m.unknown && m.weather && m.weather.Tapp === 22) && !/Lieu inconnu|Mon chargeur/.test(await page.locator('#secTenue').textContent()));

    // Une ancienne analyse LIVE peut encore retenir un rappel exclu : son
    // fallback ne doit jamais le réinsérer après le filtrage des trajets.
    const ghostMarker = 'Trajet fantôme fictif 37-LIVE', ghostKey = 'legacy-agenda-ghost-37';
    const ghost = await page.evaluate(({ id, marker, key }) => {
      const e = CAL.events.find(e => e.id === id), l = e.legs[0];
      S.gpsAuto = 1; FIX = FIXPREV = null;
      const before = { allowed: liveAllowed(), source: JSON.stringify(CAL.events), doneStorage: localStorage.getItem('twrc.tripdone'), geoAt: window.__agendaGeoLog.length };
      const base = { key, src: 'cal', e, l, dep: l.dep, arr: l.arr, name: marker + ' · ' + e.t,
        from: l.from.city || l.from.label, to: l.to.city || l.to.label, running: true, res: null, sum: {}, seq: [], worst: null };
      Object.assign(LIVE, { key, base, phase: 'active', lastOk: Date.now(), last: { leg: l, r: { res: null, sum: {}, seq: [], worst: null }, fixTs: Date.now(), gen: LIVE.gen } });
      before.active = LIVE.phase === 'active' && LIVE.key === key && LIVE.base.src === 'cal';
      before.legacy = e.lat == null && e.lon == null && e.legs.length === 2;
      renderBrf();
      return before;
    }, { id: reminders[0].id, marker: ghostMarker, key: ghostKey });
    await settle(2);
    const afterGhost = await page.evaluate(({ key, geoAt }) => ({ phase: LIVE.phase, key: LIVE.key, base: LIVE.base,
      done: !!LIVE.done[key], doneStorage: localStorage.getItem('twrc.tripdone'), geo: window.__agendaGeoLog.slice(geoAt), source: JSON.stringify(CAL.events) }), { key: ghostKey, geoAt: ghost.geoAt });
    check('37.18b · GPS autorisé : un rappel LIVE legacy disparaît sans arrivée ni suivi haute précision', ghost.allowed && ghost.active && ghost.legacy && afterGhost.phase === 'idle' && afterGhost.key === null && afterGhost.base === null && !afterGhost.done && afterGhost.doneStorage === ghost.doneStorage && afterGhost.source === ghost.source && !afterGhost.geo.some(g => g.hi) && !(await page.locator('body').textContent()).includes(ghostMarker) && await page.locator('#secBrf .leg,#secBrf a[href^="https://waze.com/"]').count() === 0, JSON.stringify({ allowed: ghost.allowed, active: ghost.active, legacy: ghost.legacy, phase: afterGhost.phase, key: afterGhost.key, done: afterGhost.done, geo: afterGhost.geo }));
    await page.evaluate(() => { S.gpsAuto = 0; liveReset(); });

    // Un déplacement explicitement demandé reste signalé si son lieu manque.
    // Les anciennes jambes jointes ne doivent pas servir à inventer ce lieu.
    calendarSealed = seal({ v: 2, updated: new Date(T0).toISOString(), events: [...reminders, invalid, explicitUnknown] }, PW);
    await page.evaluate(async () => { await loadCalendar(); UI.view = 'pneus'; renderAll(); }); await settle(4);
    const unknownCard = page.locator('#secCal .cal-e[data-event-id="' + explicitUnknown.id + '"]'), unknownText = await unknownCard.textContent();
    check('37.19 · #trajet sans lieu : seul le déplacement explicite apparaît avec avertissement', (await ids(main)).join('|') === explicitUnknown.id && unknownText.includes(explicitUnknown.t) && /lieu inconnu|localisation.*confirm|lieu.*confirm/i.test(unknownText));
    check('37.20 · #trajet sans lieu : anciennes jambes inutilisées, aucun Waze, risque ou départ conseillé', await unknownCard.locator('.leg,a[href^="https://waze.com/"],.pill,.cal-k,.frost').count() === 0 && !/départ conseillé|route analysée|\d+\s*km\b/i.test(unknownText) && await page.evaluate(id => effLegs(CAL.events.find(e => e.id === id)).length, explicitUnknown.id) === 0);
    const explicitSource = await page.evaluate(() => JSON.stringify(CAL.events)), explicitBefore = requests.length;
    await page.click('[data-act="view"][data-v="tenue"]'); await settle(2);
    const unknownRows = await page.locator('.outfit-moment').evaluateAll(nodes => nodes.filter(n => /Lieu inconnu/.test(n.innerText)).map(n => ({ text: n.innerText, start: n.dataset.start })));
    check('37.21 · #trajet sans localisation : moment inconnu conservé sans météo ni adaptation', unknownRows.length > 0 && unknownRows.some(n => n.start === DAY + 'T11:00') && unknownRows.every(n => /météo locale non calculée/i.test(n.text) && !/ressenti|imperméable|manteau|ajoute|retire/i.test(n.text)));
    const explicitPlan = await page.evaluate(() => buildTenueDay());
    check('37.22 · #trajet sans lieu : aucun trajet vers Beta ni météo de son ancienne route', explicitPlan.moments.every(m => m.kind !== 'trip' && !/Lieu fictif Beta/.test(m.location)) && /N1 max/.test(await page.locator('.outfit-base').innerText()));
    await page.evaluate(() => { renderCal(); renderBrf(); renderTenue(); }); await settle(2);
    check('37.23 · #trajet inconnu : source intacte et aucun appel réseau supplémentaire', explicitSource === await page.evaluate(() => JSON.stringify(CAL.events)) && requests.length === explicitBefore);
    for (const width of [320, 414, 1280]) {
      await page.setViewportSize({ width, height: 896 });
      for (const view of ['pneus', 'tenue']) {
        await page.click('[data-act="view"][data-v="' + view + '"]');
        const sizing = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
          commands: [...document.querySelectorAll('[data-act="view"],#secCal button,#secCal a,#secTenue button,#secTenue a')].filter(n => n.getClientRects().length).map(n => ({ text: n.textContent, height: n.getBoundingClientRect().height, width: n.getBoundingClientRect().width })) }));
        check('37.24 · ' + width + ' px, vue ' + view + ' : aucun débordement, commandes ≥44 px', sizing.overflow <= 1 && sizing.commands.length >= 3 && sizing.commands.every(n => n.height >= 44 && n.width >= 44), JSON.stringify(sizing));
      }
    }

    // LOCATION peut désigner un lieu configuré sans coordonnées d'événement.
    // Les anciennes routes vers Beta et depuis Beta ne décrivent pas Travail.
    const configured = event('test-configured-location', '11:00', '12:00', { t: 'Réunion locale fictive', loc: W.name,
      legs: [leg('go', H, B, '10:20', '10:50'), leg('ret', B, H, '12:10', '12:40')] });
    const following = event('test-after-configured-location', '14:00', '15:00', { t: 'Rendez-vous suivant fictif', loc: A.label, ...A,
      legs: [{ ...leg('go', B, A, '13:20', '13:50'), fromKind: 'prev' }, leg('ret', A, H, '15:10', '15:40')] });
    calendarSealed = seal({ v: 2, updated: new Date(T0).toISOString(), events: [configured, following] }, PW);
    const routeAt = requests.length;
    await page.evaluate(async () => { await loadCalendar(); UI.view = 'pneus'; renderAll(); });
    const configuredSource = await page.evaluate(() => JSON.stringify(CAL.events));
    const configuredSnapshot = () => page.evaluate(eventIds => {
      const compact = l => ({ k: l.k, from: l.from, to: l.to, km: l.km, pending: !!l.originPending, routed: !!l.routed, g: l.g || [], pts: l.pts || [] });
      return eventIds.map(id => { const e = CAL.events.find(e => e.id === id); return { id, own: { lat: e.lat, lon: e.lon }, place: calendarEventPlace(e, [...S.locs, ...S.customs]), legs: effLegs(e).map(compact) }; });
    }, [configured.id, following.id]);
    const initialConfigured = await configuredSnapshot(), samePoint = (p, q) => p && Math.abs(p.lat - q.lat) < .00005 && Math.abs(p.lon - q.lon) < .00005;
    const hasBeta = l => samePoint(l.from, B) || samePoint(l.to, B) || l.pts.some(p => samePoint(p, B)) || l.g.some(p => Math.abs(p[0] - B.lat) < .00005 && Math.abs(p[1] - B.lon) < .00005);
    check('37.27 · LOCATION exacte : Travail reconnu malgré coordonnées propres absentes et legs Beta', initialConfigured[0].own.lat === null && initialConfigured[0].own.lon === null && samePoint(initialConfigured[0].place, W));
    check('37.28 · reconstruction en attente : aucune ancienne route ou durée Beta exposée', initialConfigured[0].legs.length === 1 && initialConfigured[1].legs.length === 2 && initialConfigured.every(e => e.legs.every(l => !hasBeta(l) && (!l.pending || l.from === null && l.km === null && l.g.length === 0 && l.pts.length === 0))), JSON.stringify(initialConfigured));
    let readyConfigured = initialConfigured;
    for (let i = 0; i < 24; i++) {
      await settle(1); readyConfigured = await configuredSnapshot();
      if (readyConfigured.every(e => e.legs.length && e.legs.every(l => !l.pending && l.routed))) break;
    }
    const configuredGo = readyConfigured[0].legs.filter(l => l.k === 'go'), followingGo = readyConfigured[1].legs.filter(l => l.k === 'go');
    const routeURLs = requests.slice(routeAt).filter(r => r.url.includes('router.project-osrm.org')).map(r => r.url);
    check('37.29 · chaîne recalculée : Maison→Travail puis Travail→Alpha, jamais Beta', configuredGo.length === 1 && samePoint(configuredGo[0].from, H) && samePoint(configuredGo[0].to, W) && followingGo.length === 1 && samePoint(followingGo[0].from, W) && samePoint(followingGo[0].to, A) && readyConfigured.every(e => e.legs.every(l => !l.pending && l.routed && !hasBeta(l))) && routeURLs.some(u => u.includes('driving/2.35,48.85;2.25,48.9?')) && routeURLs.some(u => u.includes('driving/2.25,48.9;2.52,49.02?')) && routeURLs.every(u => !u.includes('2.2,49.55')), JSON.stringify({ legs: readyConfigured, routeURLs }));
    const configuredWaze = await page.locator('#secCal .cal-e[data-event-id="' + configured.id + '"] a[href^="https://waze.com/"]').evaluateAll(a => a.map(n => new URL(n.href).searchParams.get('ll')));
    const allWaze = await page.locator('#secCal a[href^="https://waze.com/"]').evaluateAll(a => a.map(n => new URL(n.href).searchParams.get('ll')));
    check('37.30 · Waze du lieu reconnu pointe Travail, aucune destination Beta', configuredWaze.length === 1 && configuredWaze[0] === W.lat + ',' + W.lon && allWaze.every(p => p !== B.lat + ',' + B.lon), JSON.stringify({ configuredWaze, allWaze }));
    const configuredBeforeTenue = requests.length;
    await page.click('[data-act="view"][data-v="tenue"]'); await settle(2);
    const configuredMoments = await page.evaluate(() => buildTenueDay().moments), duringConfigured = configuredMoments.filter(m => m.start < '2026-10-03T12:00' && m.end > '2026-10-03T11:00');
    check('37.31 · Tenue utilise le lieu physique Travail et 22 °C, pas les anciennes routes froides', duringConfigured.length > 0 && duringConfigured.every(m => m.kind === 'event' && m.event && /Travail test/.test(m.location) && m.weather && m.weather.T === 22 && m.weather.Tapp === 22 && !m.unknown) && configuredMoments.every(m => !/Lieu fictif Beta/.test(m.location)) && /N1 max/.test(await page.locator('.outfit-base').innerText()) && !/manteau|maille chaude|imperméable|parapluie/i.test((await page.locator('.outfit-carry,.outfit-pieces').allTextContents()).join(' ')), JSON.stringify(duringConfigured));
    await page.evaluate(() => { renderTenue(); renderTenue(); }); await settle(2);
    check('37.32 · lieu configuré : consultation Tenue sans réseau et source chiffrée intacte', requests.length === configuredBeforeTenue && configuredSource === await page.evaluate(() => JSON.stringify(CAL.events)));
    check('37.25 · toute la consultation : aucune écriture réseau ni titre envoyé', requests.every(req => req.method === 'GET' && !req.body && !req.url.includes(TITLE) && !req.url.includes(invalid.loc) && !req.url.includes(explicitUnknown.t)));
    check('37.26 · aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
    console.log(rows.join('\n') + `\n\n${rows.length - fail}/${rows.length} scénarios OK · erreurs JS : ${errors.length ? errors.join(' | ') : 'aucune'}`);
  } finally { await context.close(); await browser.close(); }
  process.exit(fail || errors.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
