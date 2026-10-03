// Automate du trajet vivant : départ décidé par le MOUVEMENT (jamais par l'heure), arrivée vérifiée dans toutes les phases
// (réouverture de l'app à destination), arrivée probable + confirmation, mémoire sans coordonnée, annulation.
// Reprend le harnais de e2e28 : GPS simulé et pilotable (position, précision, âge, vitesse, nombre de réponses), horloge et réseau simulés,
// données 100 % fictives ; seules OSRM, Open-Meteo et BigDataCloud reçoivent des coordonnées.
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
  const T0 = new Date(iso).getTime(); mkCtx(T0);
  const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
  // géolocalisation simulée et pilotable : position, précision, âge du relevé (pos.timestamp), vitesse, refus ; journal des demandes
  await c.addInitScript(() => {
    const st = { lat: 0, lon: 0, acc: 30, age: 0, speed: null, deny: false, max: null }, W = new Map(); let n = 0; window.__geoLog = [];
    const mk = () => ({ coords: { latitude: st.lat, longitude: st.lon, accuracy: st.acc, speed: st.speed, altitude: null, altitudeAccuracy: null, heading: null }, timestamp: Date.now() - st.age });
    const geo = {
      getCurrentPosition(ok, err, o) { window.__geoLog.push({ t: 'get', hi: !!(o && o.enableHighAccuracy) }); setTimeout(() => (st.deny || st.max === 0) ? err && err({ code: 3, message: 'délai' }) : (st.max != null && st.max--, ok(mk())), 0); },
      watchPosition(ok, err, o) { const id = ++n; W.set(id, { ok, hi: !!(o && o.enableHighAccuracy) }); window.__geoLog.push({ t: 'watch', id, hi: !!(o && o.enableHighAccuracy) }); if (!st.deny && st.max !== 0) setTimeout(() => { if (W.has(id) && st.max !== 0) { if (st.max != null) st.max--; ok(mk()); } }, 0); return id; },
      clearWatch(id) { W.delete(id); window.__geoLog.push({ t: 'clear', id }); } };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    window.__geoSet = o => Object.assign(st, o);
    window.__geoPush = () => W.forEach(w => w.ok(mk()));
    window.__geoWatches = () => [...W.values()].map(w => w.hi);
  });
  const p = await c.newPage(); await p.clock.install({ time: T0 }); p.on('pageerror', x => errs.push(iso + ': ' + x.message + (process.env.STK ? ' @ ' + x.stack : '')));
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
const P = (g, dLat, dLon) => ({ lat: +(g.lat + dLat).toFixed(5), lon: +(g.lon + dLon).toFixed(5) });
const ph = s => s.p.evaluate(() => LIVE.phase);
const main = t => t.replace(/✓ Arrivé[^⏎]*/, '');
(async () => {
  const b = await require('./lib/browser').launch(); const all = [];
  // ===== 1. la capture : app rouverte À destination (aucun départ observé), GPS ±10 m =====
  {
    const s = await session(b, '2026-10-03T16:30:00+02:00'); const { p } = s; all.push(s);
    await s.enableGps(G.amiens, { acc: 10, max: 1 });   // un seul relevé obtenu : les demandes suivantes restent sans réponse
    const asked = await p.evaluate(() => window.__geoLog.filter(x => x.t === 'get').length);
    let t = await s.txt();
    check('1 · un seul relevé à destination : pas encore d\'arrivée (il en faut deux)', /Assurance/.test(main(t)) && (await p.evaluate(() => LIVE.arrN)) === 1, (await ph(s)));
    check('1 · trajet retrouvé à la réouverture : relevé demandé activement (pas d\'attente passive)', asked >= 2, `${asked} demande(s)`);
    await s.to('2026-10-03T16:30:20+02:00'); await s.fix(G.amiens, { acc: 10, max: null }); await s.settle(5); t = await s.txt();
    check('1 · deuxième relevé : arrivé, sans avoir jamais vu « en cours »', !/Assurance/.test(main(t)) && /✓ Arrivé · Aller · Assurance/.test(t), t.slice(0, 160));
    check('8 · le retour suivant (Concert) n\'est pas supprimé', /Retour · Concert/.test(t));
    const ls = await p.evaluate(() => localStorage.getItem('twrc.tripdone') || '');
    check('7 · arrivée mémorisée : clé du trajet seulement, aucune coordonnée', /leg\|2026-10-03T15:33\|go/.test(ls) && !/\d\.\d/.test(ls), ls);
    await p.reload(); for (let k = 0; k < 40; k++) { if (await p.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE).catch(() => false)) break; await p.clock.runFor(300); await p.waitForTimeout(200); }
    await s.settle(6); t = await s.txt();
    check('7 · après rechargement : le trajet terminé ne réapparaît pas', !/Assurance/.test(t) && /Concert/.test(t), t.slice(0, 140));
  }
  // ===== 13. annuler l'arrivée : le trajet revient, plus d'arrivée automatique pendant 10 min (confirmation manuelle) =====
  {
    const s = await session(b, '2026-10-03T16:30:00+02:00'); const { p } = s; all.push(s);
    await s.enableGps(G.amiens, { acc: 10 }); await s.to('2026-10-03T16:30:20+02:00'); await s.fix(G.amiens, { acc: 10, max: null }); await s.settle(5);
    const undo = await p.$('[data-act="trip-undo"]');
    check('13 · arrivée affichée avec « Annuler l\'arrivée »', !!undo); if (undo) await undo.click(); await s.settle(4);
    await s.to('2026-10-03T16:31:00+02:00'); await s.fix(G.amiens, { acc: 10 }); await s.settle(3); await s.to('2026-10-03T16:31:20+02:00'); await s.fix(G.amiens, { acc: 10 }); await s.settle(5);
    const t = await s.txt(), ls = await p.evaluate(() => localStorage.getItem('twrc.tripdone') || '');
    check('13 · « Annuler l\'arrivée » : trajet de retour à l\'écran, pas de nouvelle arrivée automatique, confirmation proposée', /Assurance/.test(main(t)) && /Arrivée probable/.test(t) && !/15:33\|go/.test(ls), t.slice(0, 200));
  }
  // ===== 2. départ en avance, app ouverte : le mouvement déclenche « en cours » alors que le départ conseillé est dans le futur =====
  {
    const s = await session(b, '2026-10-03T14:00:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.waitFor(/départ conseillé/i);
    await s.to('2026-10-03T14:20:00+02:00'); await s.fix(G.roule, { speed: 22 }); await s.settle(2); await s.to('2026-10-03T14:20:15+02:00'); await s.fix(G.roule, { speed: 22 });
    let t = await s.waitFor(/TRAJET EN COURS/i);
    check('2 · départ 90 min en avance : « en cours » dès le mouvement, sans attendre l\'heure conseillée', /TRAJET EN COURS/i.test(t) && (await ph(s)) === 'active', t.slice(0, 140));
    await s.to('2026-10-03T15:20:00+02:00'); await s.fix(G.amiens, { acc: 20 }); await s.settle(2); await s.to('2026-10-03T15:20:20+02:00'); await s.fix(G.amiens, { acc: 20 }); await s.settle(5); t = await s.txt();
    check('2 · arrivée détectée (même largement avant l\'heure cible)', /✓ Arrivé · Aller · Assurance/.test(t) && !/Assurance/.test(main(t)), t.slice(0, 120));
  }
  // ===== 3. voiture garée loin de l'origine prévue : nouveaux relevés immobiles → jamais « en cours » =====
  {
    const s = await session(b, '2026-10-03T14:10:00+02:00'); all.push(s);
    await s.enableGps(G.loin); for (const hm of ['14:15', '14:20', '14:25', '14:30']) { await s.to(`2026-10-03T${hm}:00+02:00`); await s.fix(G.loin); await s.settle(2); }
    check('3 · stationné à 30 km de l\'origine : reste en attente de départ', ['imminent', 'late'].includes(await ph(s)), await ph(s));
  }
  // ===== 4. long trajet : départ reconnu après ~1 km, pas après 15 % du parcours =====
  {
    const s = await session(b, '2026-10-03T14:20:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.settle(3); const A = P(G.lille, 0.010, 0);
    await s.to('2026-10-03T14:21:00+02:00'); await s.fix(A, { speed: 15 }); await s.settle(2); await s.to('2026-10-03T14:21:10+02:00'); await s.fix(P(A, 0.001, 0), { speed: 15 }); await s.settle(4);
    check('4 · ~1,2 km parcourus en voiture : « en cours »', (await ph(s)) === 'active', await ph(s));
  }
  // ===== 5. destination approximative (~1 km) : jamais d'arrivée automatique, « arrivée probable » + confirmation =====
  {
    const s = await session(b, '2026-10-03T16:30:00+02:00'); const { p } = s; all.push(s); const near = P(G.amiens, 0.0085, 0);
    await s.enableGps(near, { acc: 10 }); await s.to('2026-10-03T16:30:20+02:00'); await s.fix(near, { acc: 10 }); await s.settle(5);
    let t = await s.txt();
    check('5 · à ~1 km : pas d\'arrivée automatique, « Arrivée probable » proposée', /Assurance/.test(main(t)) && /Arrivée probable/.test(t) && /✓ Je suis arrivé/.test(t), t.slice(0, 220));
    { const bt = await p.$('[data-act="trip-arrived"]'); if (bt) await bt.click(); } await s.settle(4); t = await s.txt();
    check('5 · « ✓ Je suis arrivé » : trajet terminé', /✓ Arrivé · Aller · Assurance/.test(t) && !/Assurance/.test(main(t)));
  }
  // ===== 6. relevés précis mais périmés (cache iOS) à destination : aucune transition =====
  {
    const s = await session(b, '2026-10-03T16:30:00+02:00'); all.push(s);
    await s.enableGps(G.amiens, { acc: 10, age: 5 * 60e3 }); await s.to('2026-10-03T16:30:20+02:00'); await s.fix(G.amiens, { acc: 10, age: 5 * 60e3 + 10e3 }); await s.settle(5);
    const t = await s.txt();
    check('6 · relevés périmés à destination : ni arrivée, ni « arrivée probable », ni « en cours »', /Assurance/.test(main(t)) && !/✓ Arrivé|Arrivée probable/.test(t) && (await ph(s)) !== 'active', t.slice(0, 140));
  }
  // ===== 9. marche à pied de 450 m (1,4 m/s) : pas parti =====
  {
    const s = await session(b, '2026-10-03T14:20:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.settle(3);
    for (let k = 1; k <= 5; k++) { await s.to(new Date(new Date('2026-10-03T14:20:00+02:00').getTime() + k * 60e3).toISOString()); await s.fix(P(G.lille, 0.0008 * k, 0), { speed: 1.4 }); await s.settle(2); }
    check('9 · marche de 450 m à vitesse piétonne : pas parti', (await ph(s)) !== 'active', await ph(s));
  }
  // ===== 10. vrai départ en voiture qui commence en S'ÉLOIGNANT de la destination =====
  {
    const s = await session(b, '2026-10-03T14:20:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.settle(3); const E1 = P(G.lille, 0, 0.020), E2 = P(G.lille, 0, 0.024);   // vers l'est, Amiens est à l'ouest
    await s.to('2026-10-03T14:22:00+02:00'); await s.fix(E1, { speed: 14 }); await s.settle(2); await s.to('2026-10-03T14:22:20+02:00'); await s.fix(E2, { speed: 14 }); await s.settle(4);
    check('10 · départ qui s\'éloigne d\'abord de la destination : « en cours »', (await ph(s)) === 'active', await ph(s));
  }
  // ===== 11. iOS sans coords.speed : vitesse automobile DÉDUITE des horodatages =====
  {
    const s = await session(b, '2026-10-03T14:20:00+02:00'); all.push(s);
    await s.enableGps(G.lille); await s.settle(3);
    const steps = [1, 2].map(k => P(G.lille, 0, -0.0062 * k));   // ~450 m toutes les 30 s ≈ 15 m/s
    await s.to('2026-10-03T14:20:30+02:00'); await s.fix(steps[0], { speed: null }); await s.settle(2);
    const p1 = await ph(s);
    await s.to('2026-10-03T14:21:00+02:00'); await s.fix(steps[1], { speed: null }); await s.settle(4);
    check('11 · speed absente : 1 intervalle ne suffit pas, 2 intervalles à ~15 m/s → « en cours »', p1 !== 'active' && (await ph(s)) === 'active', `${p1} → ${await ph(s)}`);
  }
  // ===== 12. GPS imprécis / bruité (±200 m, précision 150 m), sans vitesse : pas parti =====
  {
    const s = await session(b, '2026-10-03T14:20:00+02:00'); all.push(s);
    await s.enableGps(G.lille, { acc: 150 }); await s.settle(3);
    for (let k = 1; k <= 6; k++) { await s.to(new Date(new Date('2026-10-03T14:20:00+02:00').getTime() + k * 10e3).toISOString()); await s.fix(P(G.lille, k % 2 ? 0.0018 : -0.0018, 0), { acc: 150, speed: null }); await s.settle(1); }
    check('12 · sauts GPS de ±200 m : pas parti', (await ph(s)) !== 'active', await ph(s));
  }
  // ===== aperçu (4 h avant) : un déplacement en voiture ne déclenche pas « en cours » (ni la haute précision continue) =====
  {
    const s = await session(b, '2026-10-03T12:00:00+02:00'); all.push(s);
    await s.enableGps(G.loin); await s.waitFor(/départ conseillé/i);
    await s.to('2026-10-03T12:10:00+02:00'); await s.fix(G.loin2, { speed: 14 }); await s.settle(2); await s.to('2026-10-03T12:10:20+02:00'); await s.fix(G.loin3, { speed: 14 }); await s.settle(4);
    check('14 · course en voiture 3 h 30 avant (aperçu) : pas de faux départ, pas de haute précision continue', (await ph(s)) === 'advice' && !(await s.p.evaluate(() => window.__geoWatches())).includes(true), await ph(s));
  }
  for (const s of all) await s.c.close();
  console.log(rows.join('\n') + `\n\n${rows.length - fail}/${rows.length} scénarios OK · erreurs JS : ${errs.length ? errs.join(' | ') : 'aucune'}`);
  await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
