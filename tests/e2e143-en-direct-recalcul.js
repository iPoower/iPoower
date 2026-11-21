// Mode « EN DIRECT » · recalcul, feux, arrivée (20/11/2026), données FICTIVES (Maison test → Travail test), iPhone puis PC.
// Tracé routier complet ; feux tricolores du parcours (Overpass simulé : 3 carrefours, un en double, un hors tracé) sans aucune
// portion à moins de 800 m d'un lieu privé envoyée ; alerte d'approche à 300 m et bip facultatif (un par feu) ; sortie d'itinéraire (GPS simulé qui s'écarte) → recalcul IMMÉDIAT depuis
// la position (cap transmis), nouveau tracé dessiné, km parcourus continus, même itinéraire repris par le suivi du trajet ;
// iPhone : « BIEN ARRIVÉ » près de l'arrivée → trajet clos (journal, lieu confirmé), km ajoutés au compteur de SA voiture ;
// PC : arrivée détectée par le GPS → écran d'arrivée, compteur ajouté seulement sur appui ; aucun compteur sans relevé connu.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, osrm = [], over = [];
  await p.route('https://data.geopf.fr/wmts**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  await p.route('https://router.project-osrm.org/**', r => {
    const u = new URL(r.request().url()), m = /driving\/([^;]+);([^?]+)/.exec(u.pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    osrm.push({ from: [A[1], A[0]], bearings: u.searchParams.get('bearings') });
    const coords = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d * 1.1, duration: d / 20,
      geometry: { coordinates: coords }, legs: [{ annotation: { duration: coords.slice(1).map(() => d / 20 / 40) } }] }] }) });
  });
  let lightsAt = [];
  await p.route('https://overpass-api.de/**', r => {
    over.push(decodeURIComponent(String(r.request().postData() || '').replace(/^data=/, '').replace(/\+/g, ' ')));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elements: lightsAt.map(([lat, lon], i) => ({ type: 'node', id: i + 1, lat, lon })) }) });
  });
  await s.settle(4);
  const ends = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; S.cars[0].odo = [{ d: '2026-11-15', km: 15000 }]; S.cars[1].odo = [{ d: '2026-11-15', km: 42000 }]; saveSettings();
    const [o, d] = S.locs; appSetCar(S.cars[0].id);
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id });
    UI.view = 'trajet'; rebuild(); renderAll(); return { a: [o.lat, o.lon], b: [d.lat, d.lon], priv: S.locs.filter(locHasCoords).map(l => [l.lat, l.lon]) }; });
  const at = (f, side = 0, from = ends.a) => { const v = [ends.b[0] - from[0], ends.b[1] - from[1]], k = Math.cos(from[0] * RAD), len = Math.hypot(v[0], v[1] * k);
    return [from[0] + v[0] * f + (-v[1] * k / len) * side / 111195, from[1] + v[1] * f + (v[0] / len) * side / (111195 * k)]; };
  // Feux fictifs sur le tracé prévu : 30 %, 50 % (deux nœuds du même carrefour), 70 % ; un quatrième à 400 m du tracé (ignoré).
  lightsAt = [at(0.3), at(0.5), at(0.5, 15), at(0.7), at(0.6, 400)];
  await s.settle(8);
  await p.locator('#secTripSummary [data-act=drive-open]').click(); await s.settle(6);
  const geo = async (pt, acc = 8) => { await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: g[2] }; window.__geoPush(); }, [pt[0], pt[1], acc]); await s.settle(2); };
  const read = () => p.evaluate(() => { const q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || '', n = document.querySelector('#liveDrive [data-dv="nav"]');
    return { done: q('done'), left: q('left'), lights: q('lights'), lightNext: q('lightNext'), gps: q('gps'), nav: n && !n.hidden ? n.textContent : '', markers: document.querySelectorAll('#liveDrive .dv-light').length,
      sig: DRIVE.nav && DRIVE.nav.signature, navStart: DRIVE.nav && DRIVE.nav.pts[0], full: !!(DRIVE.nav && DRIVE.nav.full), liveO: LIVE.route && LIVE.route.o, liveKey: LIVE.key,
      arrive: (() => { const x = document.querySelector('#liveDrive .dv-arrive'); return x && !x.hidden ? x.textContent : ''; })(), csp: (window.__csp || []).join(' ') }; });
  const num = v => parseFloat(String(v).replace(',', '.'));
  const a = await read();
  check(`${dev} · tracé routier complet demandé à l’ouverture (OSRM), feux du parcours : 3 carrefours (doublon regroupé, nœud hors tracé ignoré), icônes sur la carte`,
    a.full && osrm.length >= 1 && a.lights === '3' && a.markers === 3, JSON.stringify({ a, osrm: osrm.length, over: over.length }));
  const coords = over.length ? (over[0].match(/around:30,([\d.,]+)\)/g) || []).flatMap(x => { const n = x.slice(10, -1).split(',').map(Number), out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; }) : [];
  const closest = coords.length ? Math.min(...coords.flatMap(c => ends.priv.map(q => meters(c, q)))) : 0;
  check(`${dev} · requête des feux : aucune portion à moins de 800 m d’un lieu privé (au plus près : ${Math.round(closest)} m), 4 décimales au plus`,
    coords.length > 2 && closest > 800 && coords.every(c => c.every(v => (String(v).split('.')[1] || '').length <= 4)), over[0] && over[0].slice(0, 300));
  // Trajet démarré, GPS sur l'itinéraire (90 km/h ≈ 1,5 km/min).
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const total = meters(ends.a, ends.b), step = 1500 / total;
  let f = 0.12;
  for (let i = 0; i < 3; i++) { if (i) await p.clock.runFor(60e3); await geo(at(f)); f += step; }
  f -= step; await p.clock.runFor(25e3); await geo(at(f));
  const c = await read();
  check(`${dev} · sur l’itinéraire : km parcourus et prochain feu affichés`, num(c.done) > 1 && /^à \d/.test(c.lightNext) && /GPS ± \d+ m/.test(c.gps), JSON.stringify(c));
  // Approche d'un feu (carrefour à 50 %) : bandeau à ≤ 300 m, un seul bip par feu quand le bip est activé.
  const tap = () => p.locator('#liveDrive [data-act=drive-beep]').click();
  await tap(); await s.settle(1);
  const beep0 = await p.evaluate(() => ({ on: document.querySelector('#liveDrive [data-act=drive-beep]').getAttribute('aria-pressed'), pref: localStorage.getItem('twrc.drive.beep'), n: DRIVE.beeps }));
  const banner = () => p.evaluate(() => { const x = document.querySelector('#liveDrive [data-dv="lightAlert"]'); return x && !x.hidden ? x.textContent : ''; });
  const far = await banner();
  f = 0.5 - 250 / total; await p.clock.runFor(80e3); await geo(at(f));
  const near = await banner(), n1 = await p.evaluate(() => DRIVE.beeps);
  await p.clock.runFor(4e3); f += 80 / total; await geo(at(f));
  const n2 = await p.evaluate(() => DRIVE.beeps), near2 = await banner();
  check(`${dev} · « 🔔 » active le bip (préférence de l’appareil)`, beep0.on === 'true' && beep0.pref === '1', JSON.stringify(beep0));
  check(`${dev} · à l’approche d’un feu : « 🚦 FEU DANS 250 m » (rien quand il est loin), un seul bip pour ce feu`,
    !far && /🚦 FEU DANS 2[45]0 m/.test(near) && /🚦 FEU DANS 1[678]0 m/.test(near2) && n1 === beep0.n + 1 && n2 === n1, JSON.stringify({ far, near, near2, beeps: [beep0.n, n1, n2] }));
  await tap(); await s.settle(1);
  check(`${dev} · « 🔕 » coupe le bip`, await p.evaluate(() => localStorage.getItem('twrc.drive.beep') === '0' && document.querySelector('#liveDrive [data-act=drive-beep]').getAttribute('aria-pressed') === 'false'));
  // Sortie d'itinéraire : la voiture s'écarte (100, 200, 300 m), relevés toutes les 5 s.
  const before = osrm.length, rr = { c: await p.evaluate(() => DRIVE.reroutes) }, overBefore = over.length;
  for (const side of [100, 200, 300]) { await p.clock.runFor(5e3); f += 125 / total; await geo(at(f, side)); }
  await s.settle(4);
  rr.d = await p.evaluate(() => DRIVE.reroutes);
  const d = await read(), dev0 = at(f, 300), req = osrm.filter(x => x.bearings).pop() || {};
  check(`${dev} · sortie d’itinéraire détectée au 3e relevé écarté → recalcul IMMÉDIAT depuis ta position (4 décimales), cap du véhicule transmis`,
    rr.d === rr.c + 1 && meters(req.from, dev0) < 20 && req.from.every(v => (String(v).split('.')[1] || '').length <= 4) && /^\d{1,3},60;$/.test(req.bearings || ''), JSON.stringify({ rr, req, dev0 }));
  check(`${dev} · nouveau tracé dessiné depuis la position, message « Itinéraire recalculé », km parcourus continus (${c.done} → ${d.done})`,
    d.sig !== c.sig && meters(d.navStart, dev0) < 20 && /Itinéraire recalculé/.test(d.nav) && num(d.done) >= num(c.done), JSON.stringify(d));
  check(`${dev} · même itinéraire repris par le suivi du trajet (km, arrivée, météo) sans second appel`, !!d.liveO && meters([d.liveO.lat, d.liveO.lon], dev0) < 150, JSON.stringify(d.liveO));
  check(`${dev} · feux redemandés pour le nouveau tracé`, over.length === overBefore + 1, JSON.stringify({ overBefore, n: over.length }));
  // Sur le nouveau tracé, jusqu'à l'arrivée.
  const from = d.navStart, along = g => at(g, 0, from), left = meters(from, ends.b);
  for (const k of [0.3, 0.6]) { await p.clock.runFor(60e3); await geo(along(k)); }
  await p.clock.runFor(30e3); await geo(along(1 - 380 / left)); await s.settle(2);
  const e = await read();
  check(`${dev} · aucun nouveau recalcul en suivant le nouveau tracé`, await p.evaluate(() => DRIVE.reroutes) === rr.d, JSON.stringify(rr));
  check(`${dev} · près de l’arrivée : « BIEN ARRIVÉ · +N km au compteur »`, /BIEN ARRIVÉ · \+\d+ km au compteur/.test(e.arrive), JSON.stringify(e));
  const km = +(/\+(\d+) km/.exec(e.arrive) || [])[1];
  check(`${dev} · km annoncés = distance suivie (prévu ${Math.round(total / 1000 * 1.1)} km, suivi ${e.done} km)`, Math.abs(km - num(e.done)) <= 1, JSON.stringify({ km, done: e.done }));
  if (dev === 'iphone') {
    await p.locator('#liveDrive [data-act=drive-arrived]').click(); await s.settle(4);
    const z = await p.evaluate(() => ({ odo: lastOdo(S.cars[0]), odo2: lastOdo(S.cars[1]), done: Object.keys(USER_STORE.state.done || {}), journal: USER_STORE.state.debrief.entries.map(e => e.key), live: LIVE.key,
      conf: PLACE.conf && { id: PLACE.conf.placeId, how: PLACE.conf.how }, work: S.locs[1].id, sheet: (document.querySelector('#liveDrive [data-dv="arrived"]') || {}).innerText || '',
      writable: !!(window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && !window.TWRC_VAULT.journalNeedsRecovery) }));
    check(`${dev} · « BIEN ARRIVÉ » : trajet clos (journal, lieu d’arrivée confirmé)`, !z.live && z.done.length >= 1 && (z.journal.length >= 1 || !z.writable) && !!z.conf && z.conf.id === z.work, JSON.stringify(z));
    check(`${dev} · compteur de SA voiture : 15 000 + ${km} km (relevé du jour), l’autre voiture intacte`, z.odo.km === 15000 + km && z.odo.d === '2026-11-16' && z.odo2.km === 42000, JSON.stringify(z.odo));
    check(`${dev} · écran d’arrivée : ARRIVÉ, +${km} km, compteur affiché, « Fermer »`, /ARRIVÉ/.test(z.sheet) && z.sheet.includes('+' + km + ' km') && /Compteur/.test(z.sheet) && /Fermer/.test(z.sheet), z.sheet);
    await p.evaluate(async () => { await window.TWRC_VAULT.flush(); });
    await p.reload(); await s.settle(10);
    check(`${dev} · réouverture : compteur conservé (15 000 + ${km} km)`, await p.evaluate(k => lastOdo(S.cars[0]).km === 15000 + k, km));
  } else {
    // Arrivée détectée par le GPS (2 relevés à moins de 300 m) : écran d'arrivée, compteur seulement sur appui.
    await p.clock.runFor(20e3); await geo(along(1 - 120 / left)); await p.clock.runFor(10e3); await geo(along(1 - 60 / left)); await s.settle(4);
    const y = await p.evaluate(() => ({ odo: lastOdo(S.cars[0]), live: LIVE.key, sheet: (document.querySelector('#liveDrive [data-dv="arrived"]') || {}).innerText || '' }));
    check(`${dev} · arrivée GPS : écran d’arrivée, compteur NON modifié sans appui`, !y.live && /ARRIVÉ/.test(y.sheet) && /Ajouter \+\d+ km au compteur/.test(y.sheet) && y.odo.km === 15000, JSON.stringify(y));
    await p.locator('#liveDrive [data-act=drive-odo]').click(); await s.settle(3);
    const w = await p.evaluate(() => ({ odo: lastOdo(S.cars[0]), sheet: (document.querySelector('#liveDrive [data-dv="arrived"]') || {}).innerText || '' }));
    const k2 = +(/\+(\d+) km/.exec(y.sheet) || [])[1];
    check(`${dev} · « Ajouter au compteur » : 15 000 + ${k2} km, bouton retiré (jamais ajouté deux fois)`, w.odo.km === 15000 + k2 && !/Ajouter/.test(w.sheet) && /Compteur/.test(w.sheet), JSON.stringify(w));
    // Sans relevé connu : aucun compteur inventé.
    const none = await p.evaluate(() => { const c = { ...S.cars[1], odo: [] }; return driveOdoAdd(c, 20); });
    check(`${dev} · voiture sans relevé : compteur non modifié, message clair`, !none.ok && /jamais saisi/.test(none.msg), JSON.stringify(none));
  }
  check(`${dev} · aucune violation de la politique de sécurité (Overpass autorisé)`, !(await p.evaluate(() => (window.__csp || []).join(' '))), a.csp);
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
