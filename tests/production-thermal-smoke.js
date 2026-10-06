// Contrôle du HTML/SW réellement publiés, sans compte ni code personnel.
// Les seuls états utilisateur sont des fixtures dans des contextes jetables.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const pw = require('playwright'), URL_APP = 'https://ipoower.github.io/iPoower/race-control/';
const expectedSha = process.env.EXPECTED_SHA, expectedBuild = process.env.EXPECTED_BUILD;
const engine = process.env.BROWSER || 'chromium', rows = [];
const proof = process.env.PRODUCTION_PROOF_PATH || 'production-proof';
fs.mkdirSync(proof, { recursive: true });
const time = Date.parse('2026-10-06T06:15:00+02:00');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/preset.fake.json', 'utf8'));
const model = { console, Math, Intl, Map, Set, JSON, Date: class extends Date {
  constructor(...a) { super(...(a.length ? a : [time])); } static now() { return time; }
} };
vm.createContext(model);
vm.runInContext(fs.readFileSync('src/engine.js', 'utf8') + fs.readFileSync('src/demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', model);
async function version() {
  const r = await fetch(URL_APP + 'version.json'); assert.equal(r.status, 200);
  const v = await r.json(); assert.equal(v.sha, expectedSha, 'commit réellement publié');
  assert(v.run > 37, 'nouvelle version de production après prod-37'); return v;
}
const text = (p, selector) => p.locator(selector).innerText();
const thermalCases = [
  { id: '12C-20min', T: 12, Tr: 13, min: 20, trend: 'heating', state: 'En chauffe · sous la plage favorable' },
  { id: '12C-60min', T: 12, Tr: 13, min: 60, trend: 'stable', state: 'Stabilisé · sous la plage favorable', range: [24, 41] },
  { id: '25C-unknown', T: 25, Tr: 30, rad: 600, trend: 'rest', state: 'Supposé ambiant', unknown: true },
  { id: '25C-known-rest', T: 25, Tr: 30, rad: 600, histMin: 420, histT: 30, trend: 'rest', state: 'Au repos · ambiant' },
  { id: '18C-20min', T: 18, Tr: 20, min: 20, trend: 'heating', state: 'En chauffe · favorable' },
  { id: '4C-summer', T: 4, Tr: 3, min: 60, trend: 'stable', state: 'Stabilisé · sous la plage favorable', cold: true },
  { id: 'cooling', T: 12, Tr: 13, histMin: 30, histT: 45, trend: 'cooling', state: 'En refroidissement · sous la plage favorable' },
  { id: 'long-rest', T: 12, Tr: 13, histMin: 210, histT: 45, trend: 'rest', state: 'Au repos · ambiant · froid' },
  { id: 'winter', type: 'winter', T: 2, Tr: 1, min: 60, trend: 'stable', state: 'Stabilisé · favorable' },
  { id: 'allseason', type: 'allseason', T: 8, Tr: 9, min: 60, trend: 'stable', state: 'Stabilisé · favorable' }
];
const tap = (p, selector, mobile) => mobile ? p.locator(selector).tap() : p.locator(selector).click();
async function thermal(p, mobile) {
  await tap(p, '#viewSeg [data-act=view][data-v=analyse]', mobile);
  await p.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
  for (const scn of thermalCases) {
    // Données d'entrée synthétiques uniquement. labInput, tyreLab et renderLab
    // sont les fonctions réellement publiées, sans remplacement ni interception.
    const r = await p.evaluate(scn => {
      const car = labCar(), m = CX.m, now = Date.now();
      Object.assign(car.tire, { type: scn.type || 'summer', brand: '', model: '', size: scn.type ? '205/55 R16 91H' : '215/40 ZR18 89Y XL', press: '2,4', tread: 6, pchk: { date: '2026-09-20', T: 15 } });
      m.hs = m.hs.map(h => ({ ...h, T: scn.T, Tr: scn.Tr, RH: 70, P: 0, Pl: 0, snow: 0, code: 1, gust: 15, rad: scn.rad || 0, ice: { level: 0, score: 0 } }));
      RAW[UI.loc].t = now; TT = {}; localStorage.removeItem(TT_KEY);
      if (scn.histMin) TT[car.id] = { at: localTs(now - scn.histMin * 60000), T: scn.histT, sig: tyreStateOf(car).sig };
      LIVE.phase = scn.min ? 'active' : 'idle'; LIVE.key = scn.min ? 'fixture-thermal' : null;
      LIVE.startFix = scn.min ? { ts: now - scn.min * 60000 } : null;
      LIVE.base = scn.min ? { l: { min: scn.min, km: scn.min * 70 / 60 } } : null;
      LIVE.route0 = LIVE.route = LIVE.lastFix = FIX = null; TRIPSTART = null; labThermTick.at = now;
      const input = labInput(car), model = tyreLab(input); renderLab();
      const el = document.querySelector('#secLab .lab-hero'), b = el.getBoundingClientRect(), W = document.documentElement.clientWidth;
      const small = [...document.querySelectorAll('#secLab button, #viewSeg button')].filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 43.5).length;
      return { state: model.hero.state, trend: model.thermal.trend, level: model.thermal.level, range: model.thermal.range, why: model.thermal.why,
        phase: model.phase, hero: el.innerText, width: W, scrollWidth: document.documentElement.scrollWidth, heroBottom: b.bottom, small };
    }, scn);
    const label = (mobile ? 'iPhone' : 'desktop') + '/' + scn.id;
    rows.push({ device: mobile ? 'iPhone' : 'desktop', scenario: scn.id, ...r });
    fs.writeFileSync(path.join(proof, engine + '-progress.json'), JSON.stringify(rows, null, 2));
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(proof, (mobile ? 'iphone' : 'desktop') + '-' + scn.id + '.png') });
    assert.equal(r.state, scn.state, label + '/état'); assert.equal(r.trend, scn.trend, label + '/tendance');
    assert(r.hero.includes(scn.state.toUpperCase()), label + '/verdict effectivement rendu');
    assert(r.hero.includes('Gomme estimée'), label + '/estimation et non mesure');
    assert(r.range[1] - r.range[0] >= 6, label + '/incertitude prudente');
    if (scn.range) assert.deepEqual(r.range, scn.range, label + '/stabilisation sans réduction de l’incertitude');
    if (scn.unknown) { assert.equal(r.phase, 'unknown'); assert.match(r.hero, /HISTORIQUE INCONNU/); assert.doesNotMatch(r.state, /Au repos|En chauffe/); }
    if (scn.cold) assert(r.why.some(x => x.includes('règle des 7 °C')), label + '/prudence été à froid');
    assert(r.scrollWidth <= r.width, label + '/aucun overflow horizontal');
    if (mobile) { assert.equal(r.small, 0, label + '/cibles 44 px'); assert(r.heroBottom <= 896, label + '/verdict visible sans défiler : ' + r.heroBottom); }
  }
  await p.evaluate(() => { LIVE.phase = 'idle'; LIVE.key = null; LIVE.startFix = null; LIVE.base = null; TT = {}; renderAll(); });
}
async function views(p, phase, expected) {
  const mobile = p.viewportSize().width === 414;
  for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
    await tap(p, '#viewSeg [data-act=view][data-v=' + view + ']', mobile);
    const s = await p.evaluate(() => {
      const c = APP_CONTEXT.snapshot;
      return { status: c.status, place: c.currentLocation && c.currentLocation.id,
        origin: c.origin && c.origin.id, destination: c.destination && c.destination.id,
        dir: c.activeTrip && c.activeTrip.td && c.activeTrip.td.dir,
        next: c.nextTrip && c.nextTrip.td && c.nextTrip.td.dir,
        weather: c.weatherLocationId, active: c.activeTrip && c.activeTrip.key,
        confirmation: c.confirmation && c.confirmation.placeId,
        persisted: JSON.parse(localStorage.getItem(USER_STORE.key)) };
    });
    for (const [key, value] of Object.entries(expected)) assert.equal(s[key], value, phase + '/' + view + '/' + key);
    assert.equal(s.persisted.place.conf && s.persisted.place.conf.placeId, s.confirmation);
    assert.equal(s.persisted.tripStart && s.persisted.tripStart.key, s.active);
    assert.match(await text(p, '#placeBar'), expected.status === 'travel' ? /EN ROUTE/ : expected.status === 'work' ? /AU TRAVAIL/ : /À LA MAISON/);
    if (view === 'tenue') {
      const heading = await text(p, '#secTenue .outfit-moment:first-child .outfit-moment-heading');
      assert(heading.includes(expected.status === 'travel' ? expected.dir === 'go' ? 'Maison test → Travail test' : 'Travail test → Maison test' : expected.status === 'work' ? 'Travail test' : 'Maison test'), heading);
      if (expected.status !== 'travel') assert(!heading.includes('→'), heading);
    }
    if (view === 'meteo' && expected.status === 'work') { const wx = await text(p, '#secWx'); assert(wx.includes('Travail test → Maison test')); assert(!/Prochain trajet · en cours/i.test(wx)); }
    if (view === 'analyse' && expected.status === 'travel') assert.match(await text(p, '#secLab'), /TRAJET EN COURS/i);
    rows.push({ phase, view, status: s.status, direction: s.dir, weather: s.weather });
  }
}
(async () => {
  const published = await version(), browser = await pw[engine].launch();
  try {
    for (const mobile of [false, true]) {
      const c = await browser.newContext({ viewport: mobile ? { width: 414, height: 896 } : { width: 1280, height: 900 },
        ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}), timezoneId: 'Europe/Paris', locale: 'fr-FR' });
      const errors = [];
      c.on('page', p => { p.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message, stack: e.stack, page: p.url() })); p.on('console', m => { if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError|SyntaxError/.test(m.text())) errors.push({ type: 'console', message: m.text(), location: m.location(), page: p.url() }); }); });
      await c.addInitScript(({ fixture, time, mobile }) => {
        if (location.origin !== 'https://ipoower.github.io' || !location.pathname.startsWith('/iPoower/race-control/')) return;
        if (!localStorage.getItem('twrc.production.fixture')) {
          localStorage.setItem('twrc.nocode', '1');
          localStorage.setItem('twrc.settings.v1', JSON.stringify({ ...fixture, v: 1, configured: 1, gpsAuto: 0 }));
          if (!mobile) localStorage.setItem('twrc.place.v1', JSON.stringify({ conf: { placeId: 'home', at: time - 30000, how: 'manual' }, last: { placeId: 'home', at: time - 30000, source: 'manual' } }));
          localStorage.setItem('twrc.production.fixture', '1');
        }
      }, { fixture, time, mobile });
      await c.route('**/*', async route => {
        const u = new URL(route.request().url()), json = obj => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
        if (u.hostname.endsWith('open-meteo.com')) {
          const q = u.searchParams, lat = String(q.get('latitude')).split(','), lon = String(q.get('longitude')).split(',');
          const payload = i => model.mk('doux', { lat: +lat[i], lon: +lon[i] }, 'Europe/Paris', 0);
          if (lat.length > 1) return json(lat.map((_, i) => payload(i)));
          const one = payload(0); return json(u.pathname.includes('ensemble') ? model.me(one) : q.get('minutely_15') ? model.mn(one) : u.hostname.includes('air-quality') ? {} : one);
        }
        if (/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)/.test(u.href)) return route.fulfill({ status: 200, contentType: u.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/' + (u.pathname.endsWith('.js') ? 'leaflet.js' : 'leaflet.css')) });
        // Le document, le SW et les assets viennent réellement de la production.
        // Aucun agenda personnel, GPS réel ou fournisseur externe n'est utilisé.
        if (u.origin === new URL(URL_APP).origin && u.pathname.startsWith('/iPoower/race-control/') && !/calendar|obs\.json|road-datex/.test(u.pathname)) return route.continue();
        return route.abort();
      });
      const p = await c.newPage(); await p.clock.install({ time });
      const response = await p.goto(URL_APP); assert.equal(response.status(), 200);
      await p.waitForFunction(() => typeof APP_CONTEXT !== 'undefined' && APP_CONTEXT.ready && M.home && M.work);
      assert.equal(await p.evaluate(() => window.TWRC_BUILD), expectedBuild);
      await p.waitForFunction(() => navigator.serviceWorker.controller);
      const sw = await p.evaluate(() => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = e => resolve(e.data.static); navigator.serviceWorker.controller.postMessage({ type: 'twrc-version' }, [channel.port2]); }));
      assert.equal(sw, 'twrc-static-v11');
      const homeButton = p.locator('#placeBar [data-act=place-confirm][data-place=home]');
      if (await homeButton.count()) { if (mobile) await homeButton.tap(); else await homeButton.click(); }
      await views(p, 'maison', { status: 'home', place: 'home', confirmation: 'home', weather: 'home' });
      await tap(p, '#placeBar [data-act=place-leave]', mobile);
      await views(p, 'aller réel', { status: 'travel', origin: 'home', destination: 'work', dir: 'go', confirmation: null, weather: 'home' });
      await tap(p, '#viewSeg [data-act=view][data-v=meteo]', mobile);
      await tap(p, '#placeBar [data-act=place-confirm][data-place=work]', mobile);
      await views(p, 'arrivé travail', { status: 'work', place: 'work', confirmation: 'work', active: null, next: 'ret', weather: 'work' });
      await tap(p, '#placeBar [data-act=place-leave]', mobile);
      await views(p, 'retour réel', { status: 'travel', origin: 'work', destination: 'home', dir: 'ret', confirmation: null, weather: 'work' });
      // Terminer les fixtures réseau avant de quitter le document : WebKit
      // signale sinon l'annulation de la réponse CORS comme erreur de console.
      await p.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      await p.reload(); await p.waitForFunction(() => APP_CONTEXT.ready && APP_CONTEXT.snapshot.activeTrip);
      await views(p, 'reload retour', { status: 'travel', origin: 'work', destination: 'home', dir: 'ret', confirmation: null, weather: 'work' });
      await tap(p, '#viewSeg [data-act=view][data-v=tenue]', mobile);
      await tap(p, '#placeBar [data-act=place-confirm][data-place=home]', mobile);
      await views(p, 'arrivé maison', { status: 'home', place: 'home', confirmation: 'home', active: null, weather: 'home' });
      await p.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      await p.close();
      const reopened = await c.newPage(); await reopened.goto(URL_APP);
      await reopened.waitForFunction(() => APP_CONTEXT.ready);
      assert.equal(await reopened.evaluate(() => window.TWRC_BUILD), expectedBuild, 'build après réouverture');
      await views(reopened, 'réouverture', { status: 'home', place: 'home', confirmation: 'home', active: null, weather: 'home' });
      await reopened.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      await thermal(reopened, mobile);
      if (engine === 'chromium') {
        await c.setOffline(true); await reopened.close();
        const offline = await c.newPage(); await offline.goto(URL_APP);
        await offline.waitForFunction(() => APP_CONTEXT.ready && M.home);
        assert.equal(await offline.evaluate(() => window.TWRC_BUILD), expectedBuild, 'build réellement mis en cache');
        for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
          await tap(offline, '#viewSeg [data-act=view][data-v=' + view + ']', mobile);
          assert.equal(await offline.evaluate(() => UI.view), view);
        }
        rows.push({ device: mobile ? 'iPhone' : 'desktop', offlineReopen: true });
        await c.setOffline(false);
      }
      assert.deepEqual(errors, [], 'erreurs JavaScript sur le document de production');
      rows.push({ device: mobile ? 'iPhone 414×896 @3x' : 'desktop', profile: mobile ? 'propre' : 'migration des anciennes clés', sw, build: expectedBuild, errors: errors.length });
      await c.close();
    }
    await version();
    const result = { engine, published, expectedBuild, rows };
    fs.writeFileSync(path.join(proof, 'production-' + engine + '.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ engine, published, build: expectedBuild, thermalCases: rows.filter(x => 'scenario' in x).length, devices: rows.filter(x => 'errors' in x), status: 'passed' }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { fs.writeFileSync(path.join(proof, 'failure-' + engine + '.json'), JSON.stringify({ engine, expectedSha, expectedBuild, error: e.message, rows }, null, 2)); console.error(e.stack); process.exitCode = 1; });
