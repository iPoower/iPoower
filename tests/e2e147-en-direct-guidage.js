// Mode « EN DIRECT » v2 · lot 3, guidage tournant par tournant (21/11/2026), données FICTIVES, iPhone puis PC, GPS simulé.
// Consignes françaises tirées des étapes OSRM (simulées) : flèche, distance par paliers (1,2 km → 1 km → 500 m → 200 m → 100 m →
// « Maintenant »), nom de rue, « Puis » ; voies affichées seulement si OSRM les fournit ; après un recalcul, consignes du nouveau
// tracé ; OSRM en échec : ancien tracé gardé et dit, aucune consigne inventée hors du tracé ; mention « la signalisation prime ».
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, st = { fail: false, reroutes: 0, n: 0 };
  await p.route('https://data.geopf.fr/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  await p.route('https://router.project-osrm.org/**', r => {
    const u = new URL(r.request().url()), m = /driving\/([^;]+);([^?]+)/.exec(u.pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number), rer = !!u.searchParams.get('bearings');
    st.n++; if (rer) st.reroutes++;
    if (rer && st.fail) return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"code":"Error"}' });
    const co = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    const steps = rer ? [{ name: 'Rue fictive D', maneuver: { type: 'depart', location: co[0] } }, { name: 'Rue fictive D', maneuver: { type: 'turn', modifier: 'left', location: co[20] } }, { name: '', maneuver: { type: 'arrive', location: co[40] } }]
      : [{ name: 'Rue fictive A', maneuver: { type: 'depart', location: co[0] } },
        { name: 'Avenue fictive B', maneuver: { type: 'turn', modifier: 'right', location: co[20] }, intersections: [{ lanes: [{ valid: false, indications: ['left'] }, { valid: true, indications: ['straight', 'right'] }] }] },
        { name: 'Rue fictive C', maneuver: { type: 'roundabout', exit: 2, location: co[30] } }, { name: '', maneuver: { type: 'arrive', modifier: 'right', location: co[40] } }];
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 20,
      geometry: { coordinates: co }, legs: [{ steps, annotation: { duration: co.slice(1).map(() => d / 800) } }] }] }) });
  });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); UI.view = 'trajet'; rebuild(); renderAll(); });
  await s.settle(8); await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(6);
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  // Positions exprimées sur le tracé suivi (tracé détaillé recalculé depuis le départ réel) : distance avant la manœuvre.
  const push = async (lat, lon) => { await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: 8 }; window.__geoPush(); }, [lat, lon]); await s.settle(3); };
  const onNav = (stepIdx, before) => p.evaluate(([i, d]) => { const n = DRIVE.nav, st = n.steps[i]; return LiveRoute.at(n, Math.max(0, st.along - d) / n.total).point; }, [stepIdx, before]);
  const atAlong = a => p.evaluate(x => { const n = DRIVE.nav; return LiveRoute.at(n, Math.min(n.total, Math.max(0, x)) / n.total).point; }, a);
  const stepAlong = i => p.evaluate(k => DRIVE.nav.steps[k].along, i);
  const walk = async (from, to) => { for (let a = from + 400; a < to; a += 400) { await p.clock.runFor(20e3); await push(...await atAlong(a)); } };
  const ui = () => p.evaluate(() => { const q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || '', box = document.querySelector('#liveDrive [data-dv="guide"]'), lanes = document.querySelector('#liveDrive [data-dv="glanes"]'), then = document.querySelector('#liveDrive [data-dv="gthenbox"]');
    return { on: !!box && !box.hidden, dist: q('gdist'), text: q('gtext'), arrow: (document.querySelector('#liveDrive [data-dv="garrow"]') || {}).dataset ? document.querySelector('#liveDrive [data-dv="garrow"]').dataset.k : null,
      then: then && !then.hidden ? q('gthen') : '', lanes: lanes && !lanes.hidden ? [...lanes.querySelectorAll('.dv-lane')].map(l => l.classList.contains('ok')) : null, note: q('gnote'), nav: (() => { const n = document.querySelector('#liveDrive [data-dv="nav"]'); return n && !n.hidden ? n.textContent : ''; })() }; });
  // Premier relevé : tracé détaillé depuis la position (étape 1 = virage à droite).
  const start = await p.evaluate(() => { const [o, d] = S.locs; return [o.lat + (d.lat - o.lat) * .2, o.lon + (d.lon - o.lon) * .2]; });
  await push(...start); await p.clock.runFor(25e3); await push(...start);
  // Approche à allure plausible (≤ 80 km/h entre deux relevés espacés de 20 s) : un saut irréaliste serait écarté par l'app.
  const lead = await p.evaluate(() => DRIVE.nav.steps[1].along - 1200);
  for (let d = lead - 400; d > 0; d -= 400) { await p.clock.runFor(20e3); await push(...await onNav(1, 1200 + d)); }
  const seen = [];
  for (const d of [1200, 900, 450, 150, 80, 20]) { await p.clock.runFor(20e3); const pt = await onNav(1, d); await push(...pt); seen.push(await ui()); }
  const labels = seen.map(x => x.dist), first = seen[0];
  check(`${dev} · paliers de distance : ${labels.join(' → ')}`, JSON.stringify(labels) === JSON.stringify(['1,2 km', '1 km', '500 m', '200 m', '100 m', 'Maintenant']), JSON.stringify(labels));
  check(`${dev} · consigne tirée de l’étape OSRM : « Tournez à droite sur Avenue fictive B », flèche à droite, « Puis » rond-point 2e sortie`,
    seen.every(x => x.on && x.text === 'Tournez à droite sur Avenue fictive B' && x.arrow === 'right') && /^Au rond-point, prenez la 2e sortie sur Rue fictive C$/.test(first.then), JSON.stringify(first));
  check(`${dev} · voies conseillées (fournies par OSRM) : 2 voies, la droite conseillée`, JSON.stringify(first.lanes) === '[false,true]', JSON.stringify(first.lanes));
  check(`${dev} · mention fixe « Itinéraire indicatif, la signalisation prime »`, first.note === 'Itinéraire indicatif, la signalisation prime');
  // Régression de la capture terrain : longues consignes et statistiques ne doivent plus masquer la route.
  const layout = () => p.evaluate(() => {
    const root = document.getElementById('liveDrive'), rect = s => root.querySelector(s).getBoundingClientRect();
    const map = rect('.dv-map'), panel = rect('.dv-panel'), alerts = rect('.dv-alerts'), speed = rect('.dv-speed');
    const car = root.querySelector('.dv-car, .dv-car3d'), cr = car && car.getBoundingClientRect();
    const atCar = cr && document.elementFromPoint(cr.x + cr.width / 2, cr.y + cr.height / 2);
    return { w: innerWidth, h: innerHeight, map: map.height, panel: panel.height, clear: speed.top - alerts.bottom,
      guide: rect('.dv-guide').height, overflow: root.scrollWidth > innerWidth, carOnMap: !!atCar && root.querySelector('.dv-map').contains(atCar) };
  });
  await p.evaluate(() => { DRIVE.nav.steps[1].name = 'Avenue fictive B du quartier des longs noms de rues'; DRIVE.nav.steps[2].name = 'Boulevard fictif C du quartier des longs noms de rues'; driveTick(); });
  const compact = await layout();
  check(`${dev} · longues consignes : carte ≥ 75 % de l’écran, bandeau principal ≤ 120 px, aucun débordement`, compact.map >= compact.h * .75 && compact.guide <= 120 && !compact.overflow, JSON.stringify(compact));
  check(`${dev} · route et position dégagées sous les consignes`, compact.carOnMap && (dev !== 'iphone' || compact.clear >= compact.h * .4), JSON.stringify(compact));
  if (dev === 'iphone') {
    await p.setViewportSize({ width: 320, height: 568 }); await s.settle(3);
    const small = await layout();
    check('petit écran 320×568 : carte ≥ 75 %, position visible et aucun débordement', small.map >= small.h * .75 && small.carOnMap && !small.overflow, JSON.stringify(small));
    await p.setViewportSize({ width: 896, height: 414 }); await s.settle(3);
    const landscape = await layout();
    check('iPhone paysage : carte sur toute la hauteur, position visible et aucun débordement', landscape.map >= landscape.h * .95 && landscape.carOnMap && !landscape.overflow, JSON.stringify(landscape));
    await p.setViewportSize({ width: 414, height: 896 }); await s.settle(3);
  }
  await p.evaluate(() => { DRIVE.nav.steps[1].name = 'Avenue fictive B'; DRIVE.nav.steps[2].name = 'Rue fictive C'; driveTick(); });
  // Annonces (pour une future voix) : une seule au-delà de 1 km pour ce tracé, puis une par palier franchi, jamais répétée.
  const ann = await p.evaluate(() => { if (typeof DriveGuide === 'undefined' || !DRIVE.nav || !DRIVE.nav.steps) return []; const k = DriveGuide.state(DRIVE.nav, DRIVE.nav.steps[1].along - 1).key; return (DRIVE.announces || []).filter(a => a.key === k).map(a => a.label); });
  check(`${dev} · une annonce par palier franchi (pour une future voix), jamais répétée : ${ann.join(' · ')}`, ann.length === 6 && /^\d+(,\d)? km$/.test(ann[0]) && JSON.stringify(ann.slice(1)) === JSON.stringify(['1 km', '500 m', '200 m', '100 m', 'maintenant']), JSON.stringify(ann));
  // Manœuvre passée : consigne suivante (rond-point), sans voies (OSRM n'en fournit pas).
  const s1 = await stepAlong(1), s2 = await stepAlong(2);
  await walk(s1 - 20, s2 - 400); await p.clock.runFor(20e3); await push(...await onNav(2, 400));
  const r2 = await ui();
  check(`${dev} · après le virage : « Au rond-point, prenez la 2e sortie », voies masquées (non fournies)`, r2.on && /^Au rond-point, prenez la 2e sortie sur Rue fictive C$/.test(r2.text) && r2.arrow === 'roundabout' && r2.lanes === null && /^Arrivée à destination, à droite$/.test(r2.then), JSON.stringify(r2));
  // Sortie d'itinéraire → recalcul : consignes du nouveau tracé.
  const base = await onNav(2, 300), side = k => [base[0] + k * 0.0009, base[1] + k * 0.0009];
  for (const k of [1, 2, 3]) { await p.clock.runFor(5e3); await push(...side(k)); }
  await s.settle(4); await p.clock.runFor(5e3); await push(...side(3.2));
  const r3 = await ui();
  check(`${dev} · après un recalcul : consignes du nouveau tracé (« Tournez à gauche sur Rue fictive D »)`, st.reroutes >= 1 && r3.on && r3.text === 'Tournez à gauche sur Rue fictive D' && r3.arrow === 'left', JSON.stringify({ r3, st }));
  // OSRM en échec : ancien tracé gardé et dit ; hors du tracé, aucune consigne affichée.
  st.fail = true; const before = st.reroutes, old = await p.evaluate(() => DRIVE.nav.signature);
  // Sur le nouveau tracé d'abord (allure plausible, recalcul précédent vieux de plus de 20 s), puis nouvelle sortie de route.
  await p.clock.runFor(20e3); await push(...await atAlong(150)); await p.clock.runFor(10e3); await push(...await atAlong(350));
  // Écart perpendiculaire au tracé (≈ 110 m par relevé), quelle que soit son orientation.
  const b2 = await atAlong(350), b3 = await atAlong(450), cs = Math.cos(b2[0] * RAD), dy = b3[0] - b2[0], dx = (b3[1] - b2[1]) * cs, nn = Math.hypot(dx, dy) || 1;
  const side2 = k => [b2[0] - dx / nn * k * 0.001, b2[1] + dy / nn * k * 0.001 / cs];
  for (const k of [1, 2, 3]) { await p.clock.runFor(5e3); await push(...side2(k)); }
  await s.settle(4);
  const r4 = await ui(), kept = await p.evaluate(() => DRIVE.nav.signature);
  check(`${dev} · OSRM en échec : « itinéraire précédent conservé », tracé inchangé, aucune consigne hors du tracé`, st.reroutes > before && kept === old && /itinéraire précédent conservé/.test(r4.nav) && !r4.on, JSON.stringify({ r4, st }));
  // Retour sur le tracé conservé : les consignes reprennent (aucune inventée entre-temps).
  await p.clock.runFor(20e3); await push(...await atAlong(450)); await p.clock.runFor(10e3); await push(...await atAlong(600));
  const r5 = await ui();
  check(`${dev} · de retour sur le tracé conservé : consigne du tracé reprise`, r5.on && r5.text === 'Tournez à gauche sur Rue fictive D', JSON.stringify(r5));
  check(`${dev} · aucune action à toucher pendant le guidage (bandeau sans bouton)`, await p.evaluate(() => !document.querySelector('#liveDrive [data-dv="guide"] button, #liveDrive [data-dv="gthenbox"] button')));
  await s.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
