// Session de régression exclusivement fictive, réseau extérieur bloqué par lib/browser.
'use strict';
const fs = require('node:fs'), vm = require('node:vm');
const URL = 'https://ipoower.github.io/iPoower/race-control/';
const HTML = fs.readFileSync('site/index.html', 'utf8'), PRESET = JSON.parse(fs.readFileSync('preset.json', 'utf8'));
const VERSION = JSON.parse(/window\.TWRC_SEALED_V=("[^"]+")/.exec(HTML)[1]);
const HOME = { lat: 48.8502, lon: 2.3501, acc: 18 }, WORK = { lat: 48.9005, lon: 2.2502, acc: 25 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function session(browser, { iphone = false, permissionAPI = true, locked = false, nativeGeo = false } = {}) {
  const time = Date.parse('2026-10-05T12:00:00+02:00'), fake = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [time])); } static now() { return time; } }, Intl, Map, Set, JSON };
  vm.createContext(fake); vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', fake);
  const c = await browser.newContext({ viewport: iphone ? { width: 414, height: 896 } : { width: 1280, height: 900 }, ...(iphone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}), timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  if (nativeGeo) { await c.grantPermissions(['geolocation']); await c.setGeolocation({ latitude: HOME.lat, longitude: HOME.lon, accuracy: HOME.acc }); }
  await c.addInitScript(({ preset, version, locked, permissionAPI, nativeGeo, home }) => {
    if (!locked) { localStorage.setItem('twrc.plain', JSON.stringify(preset)); localStorage.setItem('twrc.plain.v', version); }
    window.__clipboard = []; window.__copyDenied = false;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.__copyDenied) throw new Error('fixture clipboard denied'); window.__clipboard.push(text); } } });
    window.__hidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    window.__geo = { ...home, error: 0, age: 0, speed: null }; window.__geoLog = []; const watches = new Map(), old = new Map(); let id = 0;
    const pos = () => ({ coords: { latitude: window.__geo.lat, longitude: window.__geo.lon, accuracy: window.__geo.acc, speed: window.__geo.speed }, timestamp: Date.now() - window.__geo.age });
    const reply = (ok, err) => window.__geo.error ? err({ code: window.__geo.error }) : ok(pos());
    if (!nativeGeo) Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(ok, err, options) { window.__geoLog.push({ kind: 'get', options }); setTimeout(() => reply(ok, err), 20); },
      watchPosition(ok, err, options) { const n = ++id; watches.set(n, { ok, err }); old.set(n, { ok, err }); window.__geoLog.push({ kind: 'watch', id: n, options }); return n; },
      clearWatch(n) { watches.delete(n); window.__geoLog.push({ kind: 'clear', id: n }); }
    } });
    window.__geoPush = data => { Object.assign(window.__geo, data); [...watches.values()].forEach(w => reply(w.ok, w.err)); };
    window.__geoOldPush = data => { Object.assign(window.__geo, data); [...old.values()].forEach(w => reply(w.ok, w.err)); };
    window.__watchCount = () => watches.size;
    if (!nativeGeo) Object.defineProperty(navigator, 'permissions', { configurable: true, value: permissionAPI ? { query: async () => window.__permission } : undefined });
    window.__permission = { state: 'prompt', onchange: null };
    window.__permissionSet = state => { window.__permission.state = state; if (window.__permission.onchange) window.__permission.onchange(); };
  }, { preset: PRESET, version: VERSION, locked, permissionAPI, nativeGeo, home: HOME });
  const p = await c.newPage(); await p.clock.install({ time: nativeGeo ? Date.now() : time });
  const errors = [], calls = [], state = { weather: 'ok', radar: 'ok', widgetStatus: 200, searches: [], holdSearch: null };
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && /Uncaught|TypeError|ReferenceError/.test(m.text())) errors.push(m.text()); });
  await p.route('**/*', async r => {
    const u = r.request().url(); calls.push(u);
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('geocoding-api.open-meteo.com')) { const q = new URL(u).searchParams.get('name'); state.searches.push(q); if (state.holdSearch && q === state.holdSearch.query) await state.holdSearch.promise; return J({ results: [{ name: q + ' test', admin1: 'Région test', latitude: 48.7, longitude: 2.4 }] }); }
    if (u.includes('open-meteo.com')) {
      if (state.weather === 'abort') return r.abort();
      const q = new URL(u).searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(','), payload = i => fake.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
      if (la.length > 1) return J(la.map((_, i) => payload(i)));
      const one = payload(0); return J(u.includes('ensemble') ? fake.me(one) : q.get('minutely_15') ? fake.mn(one) : u.includes('air-quality') ? {} : one);
    }
    if (u.includes('calendar.sealed.json')) return J(JSON.parse(fs.readFileSync(process.env.SP + '/cal.fake.json', 'utf8')));
    if (u.includes('bigdatacloud.net')) return J({ locality: 'Position test', principalSubdivision: 'Région test' });
    if (u.includes('ntfy.sh')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (u.includes('rainviewer.com') && !u.includes('tilecache.')) { if (state.radar === 'abort') return r.abort(); return J({ host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: Math.floor(time / 1000), path: '/test' }] } }); }
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (/leaflet@1\.9\.4\/dist\/leaflet\.(js|css)/.test(u)) return r.fulfill({ status: 200, contentType: u.endsWith('.js') ? 'text/javascript' : 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/' + (u.endsWith('.js') ? 'leaflet.js' : 'leaflet.css')) });
    if (u.startsWith(URL)) {
      const name = new URL(u).pathname.split('/').pop();
      if (!name || name === 'index.html') return r.fulfill({ status: 200, contentType: 'text/html', body: HTML });
      if (name === 'obs.json') return J({ updated: new Date(time).toISOString(), stations: {} });
      if (name === 'version.json') return J({ run: 999, sha: '0'.repeat(40), at: new Date(time).toISOString() });
      if (name === 'tiredb.json') return J(JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
      if (name === 'widget.js') return r.fulfill({ status: state.widgetStatus, contentType: 'text/javascript', body: state.widgetStatus === 200 ? fs.readFileSync('site/widget.js', 'utf8') : 'fixture unavailable' });
    }
    return r.abort();
  });
  const settle = async (n = 3) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(60); } };
  await p.goto(URL); await settle(12);
  return { p, c, errors, calls, state, settle, time, home: HOME, work: WORK };
}
module.exports = { session, HOME, WORK };
