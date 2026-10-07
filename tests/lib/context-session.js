// Lieu courant de confiance (PC au travail, COARSE) : « Bien arrivé », « Je suis déjà au travail », « Je quitte le travail »,
// « Bien rentré » ; une position réseau (IP / COARSE) ne remplace jamais un lieu confirmé ni ne s'affiche comme position réelle.
// Lieux fictifs : Maison test (48,85 ; 2,35), Travail test (48,90 ; 2,25), « Ville approximative test » ≈ 100 km plus loin (fournisseur navigateur inconnu).
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KNOWN = /open-meteo\.com|opendatasoft\.com|ipoower\.github\.io|rainviewer|arcgisonline|tile\.openstreetmap|unpkg\.com|cdn\.jsdelivr|router\.project-osrm|fonts\.g|bigdatacloud\.net/;
let fail = 0; const rows = [], errors = [], hosts = new Set(), NETWORK_NOISE = [];
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } } };
const COARSE = { lat: 48.75, lon: 0.95, acc: 20000 }, COARSE2 = { lat: 49.4, lon: 1.1, acc: 35000 }, WORK = { lat: 48.9005, lon: 2.2502, acc: 25 }, HOME = { lat: 48.8502, lon: 2.3501, acc: 20 };

async function session(b, { at, scn = 'doux', dev = 'pc', meteo = 'ok', unlock = true, geo = null, storedGps = null }) {
  const T0 = new Date(at).getTime();
  const ctx = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
  const c = await b.newContext({ ...VP[dev], timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  if (storedGps) await c.addInitScript(g => { if (!localStorage.getItem('twrc.context.v1')) localStorage.setItem('twrc.gps', JSON.stringify(g)); }, storedGps);
  // géolocalisation simulée sur l'horloge de test : window.__geo = { lat, lon, acc } ou null (aucune position disponible)
  await c.addInitScript(g => {
    window.__geo = g; const W = new Map(); let n = 0;
    const pos = () => ({ coords: { latitude: window.__geo.lat, longitude: window.__geo.lon, accuracy: window.__geo.acc, speed: null }, timestamp: Date.now() });
    const geo = { getCurrentPosition(ok, err) { setTimeout(() => window.__geo ? ok(pos()) : err && err({ code: 2, message: 'indisponible' }), 20); },
      watchPosition(ok, err) { const id = ++n; W.set(id, { ok, err }); setTimeout(() => window.__geo ? ok(pos()) : err && err({ code: 2 }), 20); return id; }, clearWatch(id) { W.delete(id); } };
    window.__geoPush = () => W.forEach(w => window.__geo ? w.ok(pos()) : w.err && w.err({ code: 2 }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  }, geo);
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  const S = { meteo, calls: 0 };
  // WebKit (moteur de Safari) remonte en « erreur de page » une requête annulée ou coupée en vol (passage hors connexion,
  // requête remplacée) : « Fetch API cannot load <url> ». Ce n'est pas une exception JavaScript ; l'effet fonctionnel (cache
  // conservé, message hors connexion) est vérifié par les scénarios eux-mêmes. Ces lignes sont comptées à part, jamais ignorées
  // en silence : NETWORK_NOISE est exporté pour les tests qui veulent le vérifier.
  p.on('pageerror', e => {
    const msg = String(e && e.message || '');
    if (/^(?:TypeError: )?Fetch API cannot load https?:\/\//.test(msg.trim())) { NETWORK_NOISE.push(dev + ' · ' + msg.replace(/\?.*$/, '')); return; }
    errors.push(dev + ' · ' + (e.name && e.name !== 'Error' ? e.name + ': ' : '') + msg + ' @ ' + String(e.stack || '').split('\n').slice(0, 2).join(' ← ').replace(/https?:\/\/[^\s)]*\//g, ''));
  });
  p.on('request', r => { try { hosts.add(new URL(r.url()).host); } catch (e) { /* url illisible */ } });
  await c.route('**/*', r => {
    const u = r.request().url(), J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('open-meteo.com')) {
      S.calls++;
      if (S.meteo === 'abort') return r.abort();
      if (S.meteo === '503') return r.fulfill({ status: 503, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Service Unavailable' });
      const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
      const one = i => ctx.mk(scn, { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
      if (lats.length > 1) return J(lats.map((_, i) => one(i)));
      const base = one(0); return J(u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : u.includes('air-quality') ? {} : base);
    }
    if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('router.project-osrm.org')) return r.abort();
    if (u.includes('api.bigdatacloud.net')) { S.rev = (S.rev || 0) + 1; const q = new URL(u).searchParams; return J({ locality: +q.get('longitude') < 1.5 ? 'Ville approximative test' : 'Ville proche', city: '', principalSubdivision: 'Région test' }); }
    if (u.includes('api.rainviewer.com')) { const n = Math.floor(T0 / 600000) * 600; return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: n, path: '/v2/radar/' + n }] } }); }
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
    if (u.includes('leaflet@1.9.4/dist/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (u.includes('leaflet@1.9.4/dist/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  await p.goto(U); await p.clock.runFor(2500);
  if (unlock) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
  const settle = async (n = 14) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } };
  await settle();
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); window.scrollTo(0, 0); }); await settle(6);
  return { p, c, S, settle, T0 };
}

module.exports = { session, BR, errors, U, NETWORK_NOISE };
