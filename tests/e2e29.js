// Navigation Waze : bouton « Ouvrir dans Waze » sur le trajet affiché et dans l'agenda (destination exacte du trajet, jamais l'origine GPS,
// ouverture seulement après un clic). Reprend le harnais de e2e28 (GPS simulé, horloge et réseau simulés, données fictives).
// (en-tête d'origine : GPS dynamique : trajet vivant depuis la position réelle (position SIMULÉE, horloge et réseau simulés, données fictives).
// Vérifie l'automate (imminent → départ dépassé → en cours → arrivé), un seul trajet vivant, les seuils de fraîcheur et de précision,
// la grâce de 5 min, l'arrivée sur deux relevés, le repli en cas de panne, les réponses dans le désordre, la batterie
// (haute précision continue seulement en trajet), et la confidentialité (coordonnées GPS envoyées seulement à OSRM, Open-Meteo, BigDataCloud).
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8'); let ctx;
const mkCtx = T0 => { const RD = Date; const FD = class extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
  ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx); };
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP;
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const U = 'https://ipoower.github.io/iPoower/race-control/', html = fs.readFileSync('site/index.html', 'utf8');
// positions GPS fictives, aux décimales reconnaissables (pour suivre où elles partent)
const G = { lille: { lat: 49.38471, lon: 3.30617 }, autre: { lat: 49.39913, lon: 3.33281 }, roule: { lat: 49.36752, lon: 3.27419 }, roule2: { lat: 49.36601, lon: 3.27163 },
  milieu: { lat: 49.29183, lon: 2.95137 }, amiens: { lat: 49.20779, lon: 2.58743 }, maison: { lat: 48.85073, lon: 2.35119 },
  loin: { lat: 49.47213, lon: 2.71131 }, loin2: { lat: 49.47213, lon: 2.79437 }, loin3: { lat: 49.47213, lon: 2.82219 }, origine: { lat: 49.38127, lon: 3.32213 } };
const GPS_MARK = Object.values(G).flatMap(g => [g.lat.toFixed(3), g.lon.toFixed(3)]).filter(v => !['49.207', '2.587'].includes(v));   // fragments propres au GPS
const ALLOWED = /^(router\.project-osrm\.org|[a-z-]*api\.open-meteo\.com|api\.bigdatacloud\.net)$/;
const rows = []; let fail = 0; const errs = [];
const check = (name, ok, detail) => { rows.push(`${ok ? '✅' : '❌'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail++; };
async function session(b, iso, opt = {}) {
  const VP = opt.desktop ? { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false } : { viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const T0 = new Date(iso).getTime(); mkCtx(T0);
  const c = await b.newContext({ ...VP, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
  // géolocalisation simulée et pilotable : position, précision, âge du relevé (pos.timestamp), vitesse, refus ; journal des demandes
  await c.addInitScript(() => {
    const st = { lat: 0, lon: 0, acc: 30, age: 0, speed: null, deny: false }, W = new Map(); let n = 0; window.__geoLog = [];
    const mk = () => ({ coords: { latitude: st.lat, longitude: st.lon, accuracy: st.acc, speed: st.speed, altitude: null, altitudeAccuracy: null, heading: null }, timestamp: Date.now() - st.age });
    const geo = {
      getCurrentPosition(ok, err, o) { window.__geoLog.push({ t: 'get', hi: !!(o && o.enableHighAccuracy) }); setTimeout(() => st.deny ? err && err({ code: 1, message: 'refusé' }) : ok(mk()), 0); },
      watchPosition(ok, err, o) { const id = ++n; W.set(id, { ok, hi: !!(o && o.enableHighAccuracy) }); window.__geoLog.push({ t: 'watch', id, hi: !!(o && o.enableHighAccuracy) }); if (!st.deny) setTimeout(() => W.has(id) && ok(mk()), 0); return id; },
      clearWatch(id) { W.delete(id); window.__geoLog.push({ t: 'clear', id }); } };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    window.__geoSet = o => Object.assign(st, o);
    window.__geoPush = () => W.forEach(w => w.ok(mk()));
    window.__geoWatches = () => [...W.values()].map(w => w.hi);
  });
  const p = await c.newPage(); await p.clock.install({ time: T0 }); p.on('pageerror', x => errs.push(iso + ': ' + x.message));
  const S = { now: T0, reqs: [], osrm: [], hold: null, osrmDown: !!opt.osrmDown, meteoDownLat: opt.meteoDownLat || null };
  await p.route('**/*', async r => {
    const req = r.request(), u = req.url(); S.reqs.push({ u, m: req.method() });
    const J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('router.project-osrm.org')) {
      const m = /driving\/([-\d.]+),([-\d.]+);([-\d.]+),([-\d.]+)/.exec(u), a = [+m[1], +m[2]], q = [+m[3], +m[4]]; S.osrm.push(u.split('/driving/')[1].split('?')[0]);
      if (S.osrmDown) return r.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'indisponible' });
      let late = false; if (S.hold) { const h = S.hold; S.hold = null; await h; late = true; }
      const co = [...Array(40)].map((_, k) => [a[0] + (q[0] - a[0]) * k / 39, a[1] + (q[1] - a[1]) * k / 39]);
      const km = Math.hypot((q[0] - a[0]) * 72, (q[1] - a[1]) * 111);
      await J({ routes: [{ distance: km * 1000, duration: km * 60, geometry: { coordinates: co }, legs: [{ annotation: { duration: co.slice(1).map(() => km * 60 / 39) } }] }] });
      if (late) S.lateServed = true; return;
    }
    if (u.startsWith('https://waze.com/')) { S.waze = (S.waze || []).concat(u); return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>waze</body></html>' }); }
    if (u.includes('api.bigdatacloud.net')) return J({ locality: 'Ville test', city: 'Ville test', principalSubdivision: 'Région test' });
    if (u.includes('air-quality-api')) { const q = new URL(u).searchParams; return J(ctx.ma(ctx.mk('doux', { lat: +q.get('latitude'), lon: +q.get('longitude') }, 'Europe/Paris', 0))); }
    if (u.includes('open-meteo.com')) {
      const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
      if (S.meteoDownLat && lats.some(v => v.startsWith(S.meteoDownLat))) return r.abort();
      if (S.meteoHoldLat && S.meteoHold && lats.some(v => v.startsWith(S.meteoHoldLat))) { S.meteoHeld = (S.meteoHeld || 0) + 1; await S.meteoHold; }
      const one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
      if (lats.length > 1) return J(lats.map((_, i) => one(i)));
      const base = one(0); if (u.includes('ensemble')) return J(ctx.me(base)); if (q.get('minutely_15')) return J(ctx.mn(base)); return J(base);
    }
    if (u.includes('api.rainviewer.com')) return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
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
  await p.goto(U); await p.clock.runFor(3000);
  await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  for (let k = 0; k < 60; k++) { if (await p.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE).catch(() => false)) break; await p.clock.runFor(200); await p.waitForTimeout(250); }
  const settle = async (n = 12) => { for (let k = 0; k < n; k++) { await p.clock.runFor(700); await p.waitForTimeout(150); } };
  const txt = () => p.$eval('#secBrf', x => x.innerText.replace(/\n+/g, ' ⏎ ').replace(/[ \t]+/g, ' ').trim()).catch(() => '(absent)');
  const waitFor = async (re, n = 40) => { let t = ''; for (let k = 0; k < n; k++) { t = await txt(); if (re.test(t) && !/⏳/.test(t)) return t; await p.clock.runFor(700); await p.waitForTimeout(200); } return t; };
  const to = async iso2 => { const t = new Date(iso2).getTime(); if (t > S.now) await p.clock.fastForward(t - S.now); S.now = t; };
  const fix = async (g, o = {}) => { await p.evaluate(x => { window.__geoSet(x); window.__geoPush(); }, { lat: g.lat, lon: g.lon, acc: 25, age: 0, speed: null, ...o }); };
  const enableGps = async (g, o = {}) => { await p.evaluate(x => window.__geoSet(x), { lat: g.lat, lon: g.lon, acc: 25, age: 0, ...o }); await p.evaluate(() => locate(true)); await settle(6); };
  return { c, p, S, txt, waitFor, to, fix, enableGps, settle };
}
const W = 'a[href^="https://waze.com/ul?"]';
const links = (p, sel) => p.$$eval(sel + ' ' + W, a => a.map(x => ({ h: x.getAttribute('href'), t: x.getAttribute('target'), r: x.getAttribute('rel') || '' }))).catch(() => []);
// domicile local exact simulé : le relais (et donc l'agenda) ne connaît que le domicile arrondi 48.85,2.35
const HOME = { lat: 48.84627, lon: 2.34478 };   // à ~600 m du point arrondi du relais, sans fragment commun avec les positions GPS simulées
const exactHome = async s => { await s.p.evaluate(h => { const L = S.locs, x = L.find(l => l.id === 'home') || L[0]; x.lat = h.lat; x.lon = h.lon; renderCal(); renderBrf(); }, HOME); await s.settle(3); };
const ll = h => (/ll=([-\d.]+),([-\d.]+)/.exec(h) || []).slice(1).join(',');
(async () => {
  const b = await require('./lib/browser').launch(); const all = [];
  // ===== 1. samedi 15:00, trajet agenda planifié (Assurance → Amiens), sans GPS =====
  {
    const s = await session(b, '2026-10-03T15:00:00+02:00'); const { p, S } = s; all.push(s); let popups = 0; p.on('popup', () => popups++);
    await s.waitFor(/Assurance/); await exactHome(s); await s.settle(6);
    const L = await links(p, '#secBrf');
    check('1 · briefing : « Ouvrir dans Waze » vers la destination du trajet affiché (Amiens)', L.length === 1 && ll(L[0].h) === '49.207,2.586' && /navigate=yes/.test(L[0].h), JSON.stringify(L));
    check('1 · lien externe sûr : nouvel onglet, noopener', L[0] && L[0].t === '_blank' && /noopener/.test(L[0].r));
    check('1 · aucune ouverture automatique : aucune requête vers Waze, aucune fenêtre', !S.waze && popups === 0);
    const A = (await links(p, '#secCal')).map(x => ll(x.h));
    check('1 · agenda : aller vers le rendez-vous', A.includes('49.207,2.586') && A.includes('49.381,3.323'), A.join(' | '));
    check('1 · agenda : retour vers le domicile local EXACT, jamais le domicile arrondi du relais', A.includes('48.84627,2.34478') && !A.includes('48.85,2.35'), A.join(' | '));
    check('1 · plus aucun lien Apple Plans', !(await p.content()).includes('maps.apple.com'));
    // la fenêtre ouverte par le clic est une nouvelle page : Waze est simulé au niveau du contexte (sinon le filet de sécurité la bloque)
    await s.c.route('https://waze.com/**', r => { S.reqs.push({ u: r.request().url(), m: r.request().method() }); S.waze = (S.waze || []).concat(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>waze</body></html>' }); });
    const [pop] = await Promise.all([p.waitForEvent('popup', { timeout: 15000 }), p.click('#secBrf ' + W)]); await pop.waitForLoadState().catch(() => {});
    check('1 · clic : Waze ouvert avec la destination', /^https:\/\/waze\.com\/ul\?ll=49\.207,2\.586&navigate=yes$/.test(pop.url()), pop.url());
  }
  // ===== 2. lundi 05:30, trajet boulot =====
  {
    const s = await session(b, '2026-10-05T05:30:00+02:00'); all.push(s);
    await s.waitFor(/DOMICILE-TRAVAIL/i); await s.settle(4); const L = await links(s.p, '#secBrf');
    check('2 · boulot aller : destination = travail', L.length === 1 && ll(L[0].h) === '48.9,2.25', JSON.stringify(L));
  }
  {
    const s = await session(b, '2026-10-05T15:30:00+02:00'); all.push(s);
    await s.waitFor(/Retour domicile-travail/i); await exactHome(s); await s.settle(4); const L = await links(s.p, '#secBrf');
    check('2 · boulot retour : destination = domicile local exact', L.length === 1 && ll(L[0].h) === '48.84627,2.34478', JSON.stringify(L));
  }
  // ===== 3. ordinateur : bouton visible (le bouton « Voir le trajet » y est masqué, Waze non) =====
  {
    const s = await session(b, '2026-10-03T15:00:00+02:00', { desktop: true }); all.push(s);
    await s.waitFor(/Assurance/); await s.settle(4);
    check('3 · ordinateur : bouton Waze visible', await s.p.isVisible('#secBrf ' + W));
  }
  // ===== 4. trajet vivant / adaptatif (GPS simulé) : destination du trajet, jamais l'origine GPS =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.waitFor(/Ma position/i); await s.settle(4); const L = await links(s.p, '#secBrf');
    check('4 · trajet vivant : Waze vers Amiens, aucune coordonnée GPS dans le lien', L.length === 1 && ll(L[0].h) === '49.207,2.586' && !GPS_MARK.some(v => L[0].h.includes(v)), JSON.stringify(L));
  }
  // ===== 5. retour vivant (Concert → domicile, départ 23:25) =====
  {
    const s = await session(b, '2026-10-03T22:30:00+02:00'); all.push(s);
    await exactHome(s); await s.enableGps(G.loin); await s.waitFor(/Ma position/i); await s.settle(4); const L = await links(s.p, '#secBrf');
    check('5 · retour vivant : Waze vers le domicile local exact, aucune coordonnée GPS', L.length === 1 && ll(L[0].h) === '48.84627,2.34478' && !GPS_MARK.some(v => L[0].h.includes(v)), JSON.stringify(L));
    check('5 · OSRM garde le domicile arrondi à 0,01° (confidentialité inchangée)', s.S.osrm.some(x => x.endsWith(';2.35,48.85')) && !s.S.osrm.some(x => x.includes('2.345') && x.includes('48.846')), s.S.osrm.join(' | '));
  }
  const reqs = all.flatMap(s => s.S.reqs);
  check('Confidentialité · seule requête Waze : celle du clic de l\'utilisateur', reqs.filter(r => r.u.startsWith('https://waze.com/')).length === 1);
  for (const s of all) await s.c.close();
  console.log(rows.join('\n') + `\n\n${rows.length - fail}/${rows.length} scénarios OK · erreurs JS : ${errs.length ? errs.join(' | ') : 'aucune'}`);
  await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
