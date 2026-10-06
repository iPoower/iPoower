// Contrôle du HTML/SW réellement publiés, sans compte ni code personnel.
// Les seuls états utilisateur sont des fixtures dans des contextes jetables.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const pw = require('playwright'), URL_APP = 'https://ipoower.github.io/iPoower/race-control/';
const expectedSha = process.env.EXPECTED_SHA, expectedBuild = process.env.EXPECTED_BUILD;
const engine = process.env.BROWSER || 'chromium', rows = [];
const time = Date.parse('2026-10-06T06:15:00+02:00');
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/preset.fake.json', 'utf8'));
const model = { console, Math, Intl, Map, Set, JSON, Date: class extends Date {
  constructor(...a) { super(...(a.length ? a : [time])); } static now() { return time; }
} };
vm.createContext(model);
vm.runInContext(fs.readFileSync('src/engine.js', 'utf8') + fs.readFileSync('src/demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', model);
async function version() {
  const r = await fetch(URL_APP + 'version.json'); assert.equal(r.status, 200);
  const v = await r.json(); assert.equal(v.sha, expectedSha, 'commit réellement publié'); return v;
}
const text = (p, selector) => p.locator(selector).innerText();
const tokenColor = hex => 'rgb(' + [1, 3, 5].map(i => parseInt(hex.trim().slice(i, i + 2), 16)).join(', ') + ')';
async function temperature(p, mobile) {
  await p.locator('#viewSeg [data-act=view][data-v=meteo]').click();
  for (const context of ['none', 'fog']) for (const value of [-5, 0, 8, 15, 25, 35]) {
    const result = await p.evaluate(({ context, value }) => {
      const m = CX.m;
      m.cur.T = value; m.cur.Tapp = value - .5;
      m.hs = m.hs.map(x => ({ ...x, T: 15, Tapp: 14.5, Tr: 12, Td: 5, RH: 60, P: 0, Pl: 0, pp: 0, snow: 0, ice: { ...x.ice, level: 0, score: 0 }, code: 1, vis: 24000, wind: 9, gust: 20 }));
      const start = m.hs.findIndex(x => x.t.slice(0, 13) === m.nowStr.slice(0, 13));
      if (context === 'fog') for (let i = start; i < start + 2; i++) Object.assign(m.hs[i], { vis: 100, code: 45, RH: 98, Td: 14.5 });
      RAW[UI.loc].t = Date.now(); m.mode = 'live';
      const d = wxDesk(wxInput()); renderWx();
      const card = document.querySelector('.wx-now'), hero = card.closest('.wx-hero'), title = hero.querySelector('.wx-ht');
      const style = getComputedStyle(card), val = card.querySelector('.wx-now-v'), root = getComputedStyle(document.documentElement);
      const rect = e => e.getBoundingClientRect(), box = rect(card);
      return { tokens: Object.fromEntries(['--panel2', '--line', '--fg', '--fg2', '--c-rain', '--c-air', '--risk-t', '--nogo-t'].map(k => [k, root.getPropertyValue(k)])),
        background: style.backgroundColor, border: style.borderColor, shadow: style.boxShadow,
        value: val.textContent, valueColor: getComputedStyle(val).color, size: parseFloat(getComputedStyle(val).fontSize),
        secondaryColor: getComputedStyle(card.querySelector('.wx-now-src')).color,
        title: title.textContent, titleColor: getComputedStyle(title).color, alertColor: getComputedStyle(hero).getPropertyValue('--lv-t'),
        level: d.hero.level, expectedTitle: d.hero.title, headerAbove: rect(hero.querySelector('.wx-hk')).bottom <= box.top + 1,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || [...card.querySelectorAll('*')].some(e => { const b = rect(e); return b.width && (b.left < box.left - 1 || b.right > box.right + 1); }) };
    }, { context, value });
    const label = (mobile ? 'iPhone' : 'desktop') + '/' + context + '/' + value;
    assert.equal(result.background, tokenColor(result.tokens['--panel2']), label + '/surface sombre');
    assert.equal(result.border, tokenColor(result.tokens['--line']), label + '/bordure');
    assert.equal(result.shadow, 'none', label + '/ombre');
    assert.equal(result.value, value.toFixed(1).replace('.', ','), label + '/valeur');
    const token = value <= 0 ? '--c-rain' : value < 15 ? '--c-air' : value < 25 ? '--fg' : value < 35 ? '--risk-t' : '--nogo-t';
    assert.equal(result.valueColor, tokenColor(result.tokens[token]), label + '/couleur thermique');
    assert.equal(result.secondaryColor, tokenColor(result.tokens['--fg2']), label + '/texte secondaire');
    assert.equal(result.level, context === 'fog' ? 3 : 0, label + '/alerte');
    assert(result.title.includes(result.expectedTitle), label + '/titre météo');
    if (context === 'fog') assert.match(result.title, /BROUILLARD EN COURS/);
    assert.equal(result.titleColor, tokenColor(result.alertColor), label + '/priorité alerte');
    assert(result.size >= 50 && result.headerAbove && !result.overflow, label + '/layout');
    rows.push({ device: mobile ? 'iPhone' : 'desktop', temperature: value, context, dark: true, alert: result.level });
  }
}
async function views(p, phase, expected) {
  for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
    await p.locator('#viewSeg [data-act=view][data-v=' + view + ']').click();
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
      if (await homeButton.count()) await homeButton.click();
      await views(p, 'maison', { status: 'home', place: 'home', confirmation: 'home', weather: 'home' });
      await p.locator('#placeBar [data-act=place-leave]').click();
      await views(p, 'aller réel', { status: 'travel', origin: 'home', destination: 'work', dir: 'go', confirmation: null, weather: 'home' });
      await p.locator('#viewSeg [data-act=view][data-v=meteo]').click();
      await p.locator('#placeBar [data-act=place-confirm][data-place=work]').click();
      await views(p, 'arrivé travail', { status: 'work', place: 'work', confirmation: 'work', active: null, next: 'ret', weather: 'work' });
      await p.locator('#placeBar [data-act=place-leave]').click();
      await views(p, 'retour réel', { status: 'travel', origin: 'work', destination: 'home', dir: 'ret', confirmation: null, weather: 'work' });
      // Terminer les fixtures réseau avant de quitter le document : WebKit
      // signale sinon l'annulation de la réponse CORS comme erreur de console.
      await p.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      await p.reload(); await p.waitForFunction(() => APP_CONTEXT.ready && APP_CONTEXT.snapshot.activeTrip);
      await views(p, 'reload retour', { status: 'travel', origin: 'work', destination: 'home', dir: 'ret', confirmation: null, weather: 'work' });
      await p.locator('#viewSeg [data-act=view][data-v=tenue]').click();
      await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click();
      await views(p, 'arrivé maison', { status: 'home', place: 'home', confirmation: 'home', active: null, weather: 'home' });
      await p.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      await p.close();
      const reopened = await c.newPage(); await reopened.goto(URL_APP);
      await reopened.waitForFunction(() => APP_CONTEXT.ready);
      assert.equal(await reopened.evaluate(() => window.TWRC_BUILD), expectedBuild, 'build après réouverture');
      await views(reopened, 'réouverture', { status: 'home', place: 'home', confirmation: 'home', active: null, weather: 'home' });
      await reopened.waitForFunction(() => { const r = WEATHER_REQUESTS.state(); return !r.active && !r.queued; });
      if (process.env.CHECK_DARK_CARD === '1') await temperature(reopened, mobile);
      assert.deepEqual(errors, [], 'erreurs JavaScript sur le document de production');
      rows.push({ device: mobile ? 'iPhone 414×896 @3x' : 'desktop', profile: mobile ? 'propre' : 'migration des anciennes clés', sw, build: expectedBuild, errors: errors.length });
      await c.close();
    }
    await version();
    console.log(JSON.stringify({ engine, published, rows }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
