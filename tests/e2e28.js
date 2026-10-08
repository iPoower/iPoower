// GPS dynamique : trajet vivant depuis la position réelle (position SIMULÉE, horloge et réseau simulés, données fictives).
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
  const T0 = new Date(iso).getTime(); mkCtx(T0);
  const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
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
  await p.fill('#unlockPw', PW);
  // Reproduire une réponse de démarrage pendant la saisie : aucun code ne doit être perdu.
  const inputKept = await p.evaluate(() => {
    const field = document.querySelector('#unlockPw'), value = field.value;
    renderNotice();
    return value.length > 0 && document.querySelector('#unlockPw') === field && field.value === value && document.activeElement === field;
  });
  check('Déverrouillage · rafraîchissement pendant la saisie : code et focus conservés · ' + iso, inputKept);
  await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  for (let k = 0; k < 60; k++) { if (await p.evaluate(() => typeof CALDONE !== 'undefined' && CALDONE).catch(() => false)) break; await p.clock.runFor(200); await p.waitForTimeout(250); }
  const settle = async (n = 12) => { for (let k = 0; k < n; k++) { await p.clock.runFor(700); await p.waitForTimeout(150); } };
  const txt = () => p.$eval('#secBrf', x => x.innerText.replace(/\n+/g, ' ⏎ ').replace(/[ \t]+/g, ' ').trim()).catch(() => '(absent)');
  const waitFor = async (re, n = 40) => { let t = ''; for (let k = 0; k < n; k++) { t = await txt(); if (re.test(t) && !/⏳/.test(t)) return t; await p.clock.runFor(700); await p.waitForTimeout(200); } return t; };
  const to = async iso2 => { const t = new Date(iso2).getTime(); if (t > S.now) await p.clock.fastForward(t - S.now); S.now = t; };
  const fix = async (g, o = {}) => { await require('./lib/geo-fixture-time').coherentTime(p, g, o); await p.evaluate(x => { window.__geoSet(x); window.__geoPush(); }, { lat: g.lat, lon: g.lon, acc: 25, age: 0, speed: null, ...o }); };
  const enableGps = async (g, o = {}) => { await p.evaluate(x => window.__geoSet(x), { lat: g.lat, lon: g.lon, acc: 25, age: 0, ...o }); await p.evaluate(() => locate(true)); await settle(6); };
  return { c, p, S, txt, waitFor, to, fix, enableGps, settle };
}
const nMa = t => (t.match(/Ma position/gi) || []).length;
const osrmFromGps = S => S.osrm.filter(x => GPS_MARK.some(v => x.includes(v)));

(async () => {
  const b = await require('./lib/browser').launch(); const all = [];
  // ===== A. samedi, « Assurance » Lille → Amiens (départ prévu 15:35, arrivée prévue 16:50) : le parcours complet =====
  // position GPS à ~1,3 km de l'origine prévue : départ conseillé = 16:50 − 60 min (route simulée) = 15:50 ; suivi vivant dès min(15:35, 15:50) − 90 = 14:05
  {
    const s = await session(b, '2026-10-03T11:00:00+02:00'); const { p, S } = s; all.push(s);
    await s.enableGps(G.lille);
    let t = await s.waitFor(/Assurance/);
    check('A1 · 11:00, départ prévu dans plus de 4 h : trajet planifié, aucun appel OSRM depuis le GPS', /Assurance/.test(t) && nMa(t) === 0 && osrmFromGps(S).length === 0);
    check('A1 · hors trajet : aucun suivi haute précision', !(await p.evaluate(() => window.__geoWatches())).includes(true));
    const hi0 = await p.evaluate(() => window.__geoLog.length);   // (l'activation manuelle « Ma position » du test demande déjà la haute précision : comportement existant)
    await s.to('2026-10-03T13:30:00+02:00'); await s.fix(G.lille);
    t = await s.waitFor(/départ conseillé/i);
    check('A1b · 13:30, aperçu : départ conseillé 15:50 · arrivée cible 16:50', /départ conseillé 15:50/i.test(t) && /arrivée cible 16:50/i.test(t) && /Ma position/i.test(t) && (await p.evaluate(() => LIVE.phase)) === 'advice', t.slice(0, 200));
    check('A1b · aperçu : aucune demande ni suivi haute précision', !(await p.evaluate(n => window.__geoLog.slice(n).some(x => x.hi), hi0)));
    await s.to('2026-10-03T14:30:00+02:00'); await s.fix(G.lille);
    t = await s.waitFor(/Ma position.*Amiens/i);
    check('A2 · 14:30, suivi vivant (dès 14:05) : 📍 Ma position → Amiens, départ conseillé', /PROCHAIN TRAJET/i.test(t) && /départ conseillé 15:50/i.test(t) && /Ma position\s*→\s*Amiens/i.test(t) && /GPS · actualisé il y a/.test(t) && (await p.evaluate(() => LIVE.phase)) === 'imminent', t.slice(0, 160));
    check('A2 · un seul trajet vivant', nMa(t) === 1);
    const o1 = osrmFromGps(S)[0] || '';
    check('A2 · OSRM : origine GPS arrondie à 0,001°, destination agenda à 0,001°', /^3\.306,49\.385;2\.586,49\.207$/.test(o1), o1);
    check('A2 · avant le départ : pas de suivi haute précision continu', !(await p.evaluate(() => window.__geoWatches())).includes(true));
    const live = await p.evaluate(() => ({ canonical: JSON.parse(localStorage.getItem('twrc.context.v1')), k: Object.keys(localStorage).join(','), lv: Object.keys(localStorage).filter(k => !/^twrc\.(gps|cache\.gps|context\.v1)$/.test(k)).map(k => localStorage.getItem(k)).join('|') }));
    check('A2 · aucun itinéraire GPS persisté ; seul le point courant du contexte canonique est local', !/live|route(?!s?\b)/i.test(live.k.replace('twrc.croute', '')) && !GPS_MARK.some(v => live.lv.includes(v)) && !/\"(?:route|pts|g|history|startFix|lastFix)\"/.test(JSON.stringify(live.canonical)));
    await s.to('2026-10-03T15:40:00+02:00'); await s.fix(G.lille); await s.settle(4); t = await s.txt();
    check('A3a · 15:40 : départ prévu (15:35) passé mais départ conseillé (15:50) à venir : pas « dépassé »', /départ conseillé 15:50/i.test(t) && !/dépassé/i.test(t), t.slice(0, 140));
    await s.to('2026-10-03T15:52:00+02:00'); await s.fix(G.lille);
    t = await s.waitFor(/Départ conseillé dépassé/i);
    check('A3 · 15:52, départ conseillé passé sans mouvement : arrivée estimée 16:52 · retard estimé +2 min', /Départ conseillé dépassé/i.test(t) && /arrivée estimée 16:52/.test(t) && /retard estimé \+2 min/.test(t) && !/TRAJET EN COURS/i.test(t), t.slice(0, 140));
    check('A3 · départ dépassé : demande ponctuelle haute précision', (await p.evaluate(() => window.__geoLog.filter(x => x.t === 'get' && x.hi).length)) >= 1);
    // relevé précis mais PÉRIMÉ (6 min, cache iOS), à plusieurs km, en mouvement : ne doit jamais faire passer « en cours »
    await s.to('2026-10-03T15:53:00+02:00'); await s.fix(G.milieu, { speed: 25, acc: 15, age: 6 * 60e3 }); await s.settle(4); await s.fix(G.milieu, { speed: 25, acc: 15, age: 5 * 60e3 }); await s.settle(6);
    t = await s.txt();
    check('A3b · relevés précis mais périmés, à plusieurs km et rapides : jamais « en cours »', /Départ conseillé dépassé/i.test(t) && !/TRAJET EN COURS/i.test(t) && (await p.evaluate(() => LIVE.phase)) === 'late', await p.evaluate(() => LIVE.phase));
    await s.to('2026-10-03T15:56:00+02:00'); await s.fix(G.roule, { speed: 22 }); await s.settle(4); await s.fix(G.roule, { speed: 22, acc: 20 });
    t = await s.waitFor(/TRAJET EN COURS.*km restants/i);
    check('A4 · 15:56, mouvement confirmé : 🏎️ Trajet en cours, km restants, arrivée estimée', /TRAJET EN COURS/i.test(t) && /km restants/.test(t) && /arrivée estimée/.test(t), t.slice(0, 160));
    check('A4 · en trajet : suivi haute précision continu', (await p.evaluate(() => window.__geoWatches())).includes(true));
    const nO = S.osrm.length;
    await s.to('2026-10-03T15:57:00+02:00'); await s.fix(G.roule2, { speed: 22 }); await s.settle(6);
    check('A5 · déplacement de 200 m : aucun nouvel appel OSRM', S.osrm.length === nO, `${S.osrm.length - nO} appel(s)`);
    await s.to('2026-10-03T16:55:00+02:00'); await s.fix(G.milieu, { speed: 25 }); await s.settle(8);
    t = await s.waitFor(/TRAJET EN COURS.*km restants/i);
    check('A6 · 16:55, arrivée prévue dépassée mais trajet commencé : toujours affiché', /TRAJET EN COURS/i.test(t) && /Assurance/.test(t));
    check('A6 · déplacement de plus de 1 km : itinéraire recalculé', S.osrm.length > nO && /GPS · actualisé/.test(t), S.osrm.length > nO ? '' : JSON.stringify(await p.evaluate(() => ({ phase: LIVE.phase, key: LIVE.key, ro: LIVE.routeOrigin, try: LIVE.routeTry, now: Date.now(), fix: FIX, err: LIVE.routeErr }))));
    await s.to('2026-10-03T16:58:30+02:00'); await s.settle(3); t = await s.txt();
    check('A7 · GPS muet depuis plus de 2 min : dernière analyse signalée « GPS ancien »', /GPS ancien · dernière analyse \d\d:\d\d/.test(t), t.slice(0, 200));
    await s.to('2026-10-03T17:03:30+02:00'); await s.settle(3); t = await s.txt();
    check('A7 · au-delà de 5 min : repli explicite, jamais présenté comme du temps réel', /Suivi GPS indisponible · trajet planifié affiché/.test(t) && !/GPS · actualisé/.test(t), t.slice(0, 200));
    // deux relevés précis à la destination mais PÉRIMÉS (3 min) : ne valident jamais l'arrivée
    await s.to('2026-10-03T17:03:40+02:00'); await s.fix(G.amiens, { acc: 40, age: 3 * 60e3 }); await s.settle(3); await s.fix(G.amiens, { acc: 40, age: 3 * 60e3 + 5000 }); await s.settle(4); t = await s.txt();
    check('A8a · deux relevés périmés à la destination : arrivée jamais validée', /Assurance/.test(t) && (await p.evaluate(() => LIVE.phase)) === 'active' && (await p.evaluate(() => LIVE.arrN)) === 0, `${await p.evaluate(() => LIVE.phase)} / ${await p.evaluate(() => LIVE.arrN)}`);
    await s.to('2026-10-03T17:04:00+02:00'); await s.fix(G.amiens, { acc: 40 }); await s.settle(4); t = await s.txt();
    check('A8 · un seul relevé à moins de 300 m : pas encore arrivé', /Assurance/.test(t));
    await s.to('2026-10-03T17:04:20+02:00'); await s.fix(G.amiens, { acc: 40 }); await s.settle(6); t = await s.txt();
    const tA = t.replace(/✓ Arrivé[^⏎]*/, '');   // la ligne « ✓ Arrivé · … · Annuler l'arrivée » rappelle le trajet terminé
    check('A8 · deux relevés précis consécutifs : arrivé, trajet suivant affiché', !/Assurance/.test(tA) && /✓ Arrivé · Aller · Assurance/.test(t) && /Concert/.test(tA) && nMa(tA) === 0, t.slice(0, 160));
    const w = await p.evaluate(() => window.__geoWatches());
    check('A8 · après l\'arrivée : retour au seul suivi basse consommation', w.length === 1 && w[0] === false, JSON.stringify(w));
  }
  // ===== B. précision insuffisante (1 200 m) et GPS ancien =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); all.push(s);
    await s.enableGps(G.lille, { acc: 1200 }); let t = await s.waitFor(/Assurance/);
    check('B · précision 1 200 m : aucun mode vivant', nMa(t) === 0 && osrmFromGps(s.S).length === 0);
    await s.fix(G.lille, { acc: 25, age: 6 * 60e3 }); await s.settle(6); t = await s.txt();
    check('B · relevé de 6 min (pos.timestamp) : trop ancien, aucun mode vivant', nMa(t) === 0 && osrmFromGps(s.S).length === 0);
  }
  // ===== C. pannes : OSRM, puis météo de la route vivante =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00', { osrmDown: true }); all.push(s);
    await s.enableGps(G.lille); const t = await s.waitFor(/Assurance/);
    check('C1 · OSRM en panne : briefing planifié complet, jamais une carte vide', /Assurance/.test(t) && /\/ 100|🧪 APERÇU|Route/.test(t) && nMa(t) === 0 && !/Suivi GPS indisponible/.test(t), t.slice(0, 120));
  }
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00', { meteoDownLat: '49.385' }); all.push(s);
    await s.enableGps(G.lille); await s.settle(10); const t = await s.waitFor(/Assurance/);
    check('C2 · météo de la route vivante en panne : briefing planifié conservé', /Assurance/.test(t) && nMa(t) === 0 && osrmFromGps(s.S).length >= 1, t.slice(0, 120));
  }
  // ===== D. deux recalculs qui se chevauchent : l'ancienne réponse ne remplace jamais la nouvelle =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); const { p, S } = s; all.push(s);
    let release; S.hold = new Promise(r => { release = r; });
    // A doit être servie AVANT son délai de 10 s (heure de la page) : sinon elle serait simplement abandonnée et le test ne prouverait rien
    await s.enableGps(G.lille);   // requête A (position Lille) retenue
    await p.evaluate(() => { LIVE.routeTry = 0; }); await s.fix(G.autre); await s.settle(3);   // requête B (2 km plus loin) servie tout de suite
    const oB = await p.evaluate(() => LIVE.routeOrigin);
    release(); await s.settle(8);   // la réponse A arrive en dernier
    check('D · la réponse A a bien été servie après B (test valide)', !!S.lateServed && !!oB && oB.lat === 49.399, JSON.stringify(oB));
    const o = await p.evaluate(() => LIVE.routeOrigin), t = await s.waitFor(/Ma position/);
    check('D · réponse ancienne ignorée : la route reste celle de la position la plus récente', o && o.lat === 49.399 && o.lon === 3.333 && S.osrm.length >= 2, JSON.stringify(o));
    check('D · affichage cohérent après le chevauchement', /Ma position\s*→\s*Amiens/i.test(t));
  }
  // ===== G. route A réussie, déplacement > 1 km, OSRM B en panne : A n'est jamais présentée comme fraîche, lastOk figé, repli à 5 min =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); const { p, S } = s; all.push(s);
    await s.enableGps(G.lille); let t = await s.waitFor(/GPS · actualisé/);
    check('G1 · route A calculée : analyse actuelle', /Ma position\s*→\s*Amiens/i.test(t) && /GPS · actualisé/.test(t));
    S.osrmDown = true; await s.to('2026-10-03T14:31:00+02:00'); await s.fix(G.autre); await s.settle(6); t = await s.txt();
    const ok0 = await p.evaluate(() => LIVE.lastOk);
    check('G2 · GPS B frais mais route B en panne : A jamais présentée comme fraîche', !/GPS · actualisé/.test(t) && /Itinéraire non actualisé · dernière analyse 14:3\d/.test(t) && /Ma position/i.test(t), t.slice(0, 220));
    await s.to('2026-10-03T14:32:30+02:00'); await s.fix(G.autre); await s.settle(6); await s.fix(G.autre); await s.settle(4);
    const ok1 = await p.evaluate(() => LIVE.lastOk);
    check('G3 · nouveaux relevés et rendus : lastOk n\'avance pas', ok1 === ok0, `${ok0} → ${ok1}`);
    await s.to('2026-10-03T14:36:30+02:00'); await s.fix(G.autre); await s.settle(6); t = await s.txt();
    check('G4 · au-delà de 5 min : « Suivi GPS indisponible · trajet planifié affiché »', /Suivi GPS indisponible · trajet planifié affiché/.test(t) && !/GPS · actualisé|Itinéraire non actualisé/.test(t), t.slice(0, 200));
  }
  // ===== H. route B réussie mais météo B en retard : B n'est promue qu'une fois route ET météo complètes =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); const { p, S } = s; all.push(s);
    await s.enableGps(G.lille); let t = await s.waitFor(/GPS · actualisé/);
    const genA = await p.evaluate(() => LIVE.last && LIVE.last.gen);
    let release; S.meteoHold = new Promise(r => { release = r; }); S.meteoHoldLat = '49.399';
    await s.to('2026-10-03T14:31:00+02:00'); await s.fix(G.autre); await s.settle(5); t = await s.txt();
    const st = await p.evaluate(() => ({ route: LIVE.route && LIVE.route.gen, last: LIVE.last && LIVE.last.gen, o: LIVE.routeOrigin }));
    check('H1 · route B prête, météo B en attente : l\'analyse A reste affichée, marquée non actualisée', !!S.meteoHeld && st.route !== genA && st.last === genA && /Itinéraire non actualisé/.test(t) && !/GPS · actualisé/.test(t), JSON.stringify(st));
    release(); S.meteoHoldLat = null; await s.settle(6); t = await s.waitFor(/GPS · actualisé/);
    const st2 = await p.evaluate(() => ({ route: LIVE.route && LIVE.route.gen, last: LIVE.last && LIVE.last.gen }));
    check('H2 · météo B arrivée : bascule atomique vers B', st2.last === st2.route && st2.last !== genA && /GPS · actualisé/.test(t), JSON.stringify(st2));
  }
  // ===== I. départ adaptatif loin de l'origine prévue (cas réel : rendez-vous loin, on n'est pas chez soi) =====
  {
    const s = await session(b, '2026-10-03T12:00:00+02:00'); const { p, S } = s; all.push(s);
    await s.enableGps(G.loin); const hi0 = await p.evaluate(() => window.__geoLog.length); let t = await s.waitFor(/départ conseillé/i);
    const m1 = await p.evaluate(() => LIVE.route && LIVE.route.min), exp = new Date(new Date('2026-10-03T16:50:00+02:00').getTime() - m1 * 60e3).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    check('I1 · 12:00, à 30 km de l\'origine prévue : départ conseillé = arrivée cible − durée depuis ici', new RegExp('départ conseillé ' + exp, 'i').test(t) && /arrivée cible 16:50/i.test(t) && /depuis ici/.test(t) && nMa(t) === 1 && (await p.evaluate(() => LIVE.phase)) === 'advice', exp + ' · ' + t.slice(0, 200));
    const n1 = osrmFromGps(S).length;
    await s.to('2026-10-03T12:10:00+02:00'); await s.fix(G.loin2); await s.settle(6);
    check('I2 · aperçu : déplacement de 6 km → itinéraire recalculé', osrmFromGps(S).length === n1 + 1, `${osrmFromGps(S).length - n1}`);
    await s.to('2026-10-03T12:20:00+02:00'); await s.fix(G.loin3); await s.settle(6);
    check('I3 · aperçu : déplacement de 2 km → aucun recalcul (seuil 5 km)', osrmFromGps(S).length === n1 + 1);
    await s.to('2026-10-03T12:45:00+02:00'); await s.fix(G.loin3); await s.settle(6);
    check('I4 · aperçu : route de plus de 30 min → recalcul', osrmFromGps(S).length === n1 + 2);
    check('I4 · aperçu : jamais de haute précision (ni demande, ni suivi)', !(await p.evaluate(n => window.__geoLog.slice(n).some(x => x.hi), hi0)) && !(await p.evaluate(() => window.__geoWatches())).includes(true));
    // l'agenda chiffré (base64 aléatoire) est opaque. La synthèse Race Control peut mémoriser
    // le mot « live » comme mode météo, mais jamais le tracé, l'état LIVE ni des coordonnées GPS.
    const persisted = await p.evaluate(() => ({
      decision: localStorage.getItem('twrc.decision.latest.v1') || '',
      other: Object.keys(localStorage).filter(k => !/^twrc\.(gps|cache\.gps|context\.v1|calendar\.sealed\.v1|decision\.latest\.v1)$/.test(k))
        .map(k => k + '=' + localStorage.getItem(k)).join('|')
    }));
    check('I4 · aperçu : aucun itinéraire ni état de suivi persisté hors du contexte canonique',
      !/live/i.test(persisted.other) &&
      !GPS_MARK.some(v => persisted.other.includes(v) || persisted.decision.includes(v)) &&
      !/"(?:route|pts|startFix|lastFix|lat|lon)"\s*:/.test(persisted.decision));
    await s.to('2026-10-03T14:10:00+02:00'); await s.fix(G.loin3); await s.settle(6);
    check('I5 · 14:10 : suivi vivant activé dès min(départ prévu, départ conseillé) − 90 min', (await p.evaluate(() => LIVE.phase)) === 'imminent');
  }
  // ===== J. aperçu : route prête mais météo de cette route en retard → briefing planifié intégralement conservé =====
  {
    const s = await session(b, '2026-10-03T12:00:00+02:00'); const { p, S } = s; all.push(s);
    let release; S.meteoHold = new Promise(r => { release = r; }); S.meteoHoldLat = '49.472';
    await s.enableGps(G.loin); await s.settle(6); let t = await s.waitFor(/Assurance/);
    check('J1 · route prête, météo en attente : briefing planifié intact (aucun mélange nouvelle heure + ancienne météo)', !!S.meteoHeld && osrmFromGps(S).length >= 1 && nMa(t) === 0 && !/départ conseillé/i.test(t) && /15:35/.test(t), t.slice(0, 160));
    release(); S.meteoHoldLat = null; t = await s.waitFor(/départ conseillé/i);
    check('J2 · météo arrivée : bascule atomique vers l\'aperçu', /départ conseillé/i.test(t) && /Ma position/i.test(t));
  }
  // ===== K. à moins de 1 km de l'origine prévue : planification inchangée =====
  {
    const s = await session(b, '2026-10-03T13:30:00+02:00'); all.push(s);
    await s.enableGps(G.origine); await s.settle(6); const t = await s.waitFor(/Assurance/);
    check('K · à 1 km de l\'origine prévue, 2 h avant : trajet planifié, aucun appel OSRM', nMa(t) === 0 && osrmFromGps(s.S).length === 0 && /15:35/.test(t), t.slice(0, 120));
  }
  // ===== L. retour (« Concert », départ prévu 23:25) : le départ reste la contrainte =====
  {
    const s = await session(b, '2026-10-03T22:30:00+02:00'); all.push(s);
    await s.enableGps(G.loin); const t = await s.waitFor(/Ma position/i);
    check('L · retour : départ prévu 23:25 conservé, arrivée adaptée, aucun « départ conseillé »', /23:25/.test(t) && !/départ conseillé/i.test(t) && /Retour · Concert/.test(t), t.slice(0, 160));
  }
  // ===== E. lundi 05:30 : boulot 06:30 et agenda 06:46 dans la même fenêtre → un seul trajet vivant =====
  {
    const s = await session(b, '2026-10-05T05:30:00+02:00'); const { S } = s; all.push(s);
    await s.enableGps(G.maison); const t = await s.waitFor(/Ma position/);
    check('E · deux trajets dans les 90 min : seul le premier (boulot 06:30) devient vivant', nMa(t) === 1 && /DOMICILE-TRAVAIL/i.test(t) && /Journée Lille/.test(t), t.slice(0, 200));
    check('E · chez soi (à moins de 1 km de l\'origine) : heure de départ planifiée inchangée (06:30), aucun départ conseillé', /06:30/.test(t) && !/départ conseillé/i.test(t));
    const o = osrmFromGps(S)[0] || '';
    check('E · destination « travail » arrondie à 0,01° avant l\'envoi', /^2\.351,48\.851;2\.25,48\.9$/.test(o), o);
  }
  // ===== F. GPS refusé : timeline identique à aujourd'hui =====
  {
    const s = await session(b, '2026-10-03T14:30:00+02:00'); all.push(s);
    await s.p.evaluate(() => window.__geoSet({ deny: true })); await s.p.evaluate(() => locate(true)); await s.settle(6);
    const t = await s.waitFor(/Assurance/);
    check('F · GPS refusé : trajet planifié, aucun appel OSRM', /Assurance/.test(t) && nMa(t) === 0 && s.S.osrm.length === 0);
  }
  // ===== confidentialité, sur l'ensemble des sessions =====
  const reqs = all.flatMap(s => s.S.reqs);
  const leak = reqs.filter(r => GPS_MARK.some(v => r.u.includes(v))).map(r => new URL(r.u).hostname).filter(h => !ALLOWED.test(h));
  check('Confidentialité · coordonnées GPS envoyées uniquement à OSRM, Open-Meteo et BigDataCloud', leak.length === 0, [...new Set(leak)].join(', '));
  check('Confidentialité · aucune écriture réseau (que des lectures GET)', reqs.every(r => r.m === 'GET'));
  check('Confidentialité · rien vers GitHub (obs.json et agenda seulement lus, jamais modifiés)', !reqs.some(r => /api\.github\.com|github\.com\/.*\/(contents|git)/.test(r.u)));
  const relay = fs.readFileSync('relay.js', 'utf8');
  check('Confidentialité · le relais ne connaît pas le GPS dynamique', !/geolocation|twrc\.gps|LIVE\b|FIX\b/.test(relay));
  for (const s of all) await s.c.close();
  console.log(rows.join('\n') + `\n\n${rows.length - fail}/${rows.length} scénarios OK · erreurs JS : ${errs.length ? errs.join(' | ') : 'aucune'}`);
  await b.close(); process.exit(fail || errs.length ? 1 : 0);
})();
