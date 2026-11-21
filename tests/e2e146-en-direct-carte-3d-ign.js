// Mode « EN DIRECT » v2 · lot 2, carte 3D IGN (21/11/2026), données FICTIVES, iPhone puis PC, GPS simulé.
// MapLibre (auto-hébergé) + tuiles vectorielles IGN (style simulé) : bâtiments extrudés à la « hauteur » BD TOPO, couches inutiles
// au volant retirées ; carte orientée dans le sens de la marche, inclinée ; zoom automatique (vitesse, rapproché avant une
// manœuvre OSRM) ; flèche interpolée entre deux relevés, jamais extrapolée ; nuit dérivée en direct (fond sombre, routes plus
// claires) ; photo aérienne IGN en option ; sans WebGL : repli à plat (Plan IGN, Leaflet) ; aucune violation CSP.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
const STYLE = { version: 8, glyphs: 'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf', sources: { plan_ign: { type: 'vector', tiles: ['https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 18 } }, layers: [
  { id: 'vegetation', type: 'fill', source: 'plan_ign', 'source-layer': 'ocs_vegetation_surf', paint: { 'fill-color': '#d8ebc8' } },
  { id: 'route', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route', paint: { 'line-color': '#ffffff', 'line-width': 6 } },
  { id: 'parcelle', type: 'line', source: 'plan_ign', 'source-layer': 'parcellaire_parcelle', paint: { 'line-color': '#999999' } },
  { id: 'bati plat 16', type: 'fill', source: 'plan_ign', 'source-layer': 'bati_surf', minzoom: 15, paint: { 'fill-color': '#d0c8bb' } },
  { id: 'nom de rue', type: 'symbol', source: 'plan_ign', 'source-layer': 'toponyme_routier_odonyme_lin', layout: { 'text-field': ['get', 'texte'] }, paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff' } }] };
const lum = c => { const m = /hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/.exec(c || ''); if (m) return +m[3] / 100; const x = /#([0-9a-f]{6})/i.exec(c || ''); if (!x) return null; const v = [0, 2, 4].map(i => parseInt(x[1].slice(i, i + 2), 16) / 255); return (Math.max(...v) + Math.min(...v)) / 2; };
async function setup(s, dev, osrmSteps) {
  const p = s.p, tiles = [], styles = [];
  await p.route('https://data.geopf.fr/**', r => { const u = r.request().url();
    if (/styles\/PLAN\.IGN\/standard\.json/.test(u)) { styles.push('standard'); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(STYLE) }); }
    if (/PLAN\.IGN\/\d+|vectorTiles\/fonts\//.test(u)) return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    const L = /LAYER=([A-Z0-9.]+)/.exec(u); if (L) tiles.push(L[1]); return r.fulfill({ status: 200, contentType: /jpeg/.test(u) ? 'image/jpeg' : 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PX }); });
  await p.route('https://router.project-osrm.org/**', r => {
    const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const coords = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    const steps = osrmSteps ? [{ name: 'Rue fictive A', maneuver: { type: 'depart', location: coords[0] } }, { name: 'Avenue fictive B', maneuver: { type: 'turn', modifier: 'right', location: coords[24] } }, { name: '', maneuver: { type: 'arrive', location: coords[40] } }] : [];
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 20,
      geometry: { coordinates: coords }, legs: [{ steps, annotation: { duration: coords.slice(1).map(() => d / 20 / 40) } }] }] }) });
  });
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  await p.emulateMedia({ reducedMotion: 'reduce' });   // longues minutes simulées : recadrage direct (sinon rendu image par image)
  await s.settle(4);
  const ends = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id });
    UI.view = 'trajet'; rebuild(); renderAll(); return { a: [o.lat, o.lon], b: [d.lat, d.lon] }; });
  await s.settle(8);
  await p.locator('#secTripSummary [data-act=drive-open]').click(); await s.settle(12);
  return { tiles, styles, ends, line: f => [ends.a[0] + (ends.b[0] - ends.a[0]) * f, ends.a[1] + (ends.b[1] - ends.a[1]) * f], total: meters(ends.a, ends.b) };
}
const state = p => p.evaluate(() => { const mv = DRIVE.mv, m = mv && mv.map, gl = mv && mv.kind === '3d', node = document.querySelector('#liveDrive .dv-map'), cv = node && node.querySelector('canvas');
  const b3d = gl && m.getLayer('dv-b3d') ? { src: m.getLayer('dv-b3d').sourceLayer, h: JSON.stringify(m.getPaintProperty('dv-b3d', 'fill-extrusion-height')) } : null;
  return { kind: mv && mv.kind, err: DRIVE.glErr, theme: mv && mv.theme(), pitch: gl ? Math.round(m.getPitch()) : null, bearing: gl ? Math.round((m.getBearing() + 360) % 360) : null, zoom: gl ? +m.getZoom().toFixed(2) : null, want: DRIVE.zoom,
    b3d, parcelle: gl ? !!m.getLayer('parcelle') : null, flat: gl ? !!m.getLayer('bati plat 16') : null, bg: gl && m.getLayer('dv-bg') ? m.getPaintProperty('dv-bg', 'background-color') : null, road: gl && m.getLayer('route') ? m.getPaintProperty('route', 'line-color') : null,
    ortho: gl ? !!m.getSource('ortho') : null, canvas: cv ? [cv.clientWidth, cv.clientHeight] : null, box: node ? [node.clientWidth, node.clientHeight] : null, foot: (document.querySelector('#liveDrive [data-dv="foot"]') || {}).textContent || '', csp: (window.__csp || []).join(' ') }; });
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T16:30:00+01:00', dev }), p = s.p;
  // Navigateur de test sans WebGL (possible dans certains WebKit de CI) : seule la voie de repli est vérifiable, et elle l'est.
  if (!await p.evaluate(() => typeof driveWebGL !== 'function' || driveWebGL())) {
    const y = await setup(s, dev, false), w = await state(p);
    check(`${dev} · ce navigateur de test n’a pas WebGL : repli à plat vérifié (Plan IGN), carte 3D non vérifiable ici`, w.kind === 'plat' && y.tiles.includes('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'), JSON.stringify(w));
    rows.push('ℹ️ ' + dev + ' · WebGL absent du navigateur de test : contrôles 3D à faire sur un appareil réel'); await s.c.close(); return;
  }
  const x = await setup(s, dev, true);
  const a = await state(p);
  check(`${dev} · carte 3D IGN : style vectoriel IGN demandé, bâtiments extrudés à la « hauteur » BD TOPO, couches inutiles retirées, plein cadre`,
    a.kind === '3d' && x.styles.length >= 1 && a.b3d && a.b3d.src === 'bati_surf' && /hauteur/.test(a.b3d.h) && a.parcelle === false && a.flat === false && !!a.canvas && a.canvas[0] === a.box[0] && a.canvas[1] === a.box[1] && /IGN Géoplateforme/.test(a.foot), JSON.stringify(a));
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const step = 1500 / x.total, geo = async (f, n = 3) => { await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: 8 }; window.__geoPush(); }, x.line(f)); await s.settle(n); };
  let f = 0.2; for (let i = 0; i < 3; i++) { if (i) await p.clock.runFor(60e3); await geo(f); f += step; }
  const c = await state(p), want = Math.round((Math.atan2((x.ends.b[1] - x.ends.a[1]) * Math.cos(x.ends.a[0] * RAD), x.ends.b[0] - x.ends.a[0]) / RAD + 360) % 360), dB = Math.abs(((c.bearing - want) + 540) % 360 - 180);
  check(`${dev} · orientée dans le sens de la marche (cap ${c.bearing}°, route ${want}°), inclinée (${c.pitch}°), zoom auto à 90 km/h loin d’une manœuvre (${c.zoom})`, c.pitch >= 55 && dB <= 15 && Math.abs(c.zoom - 15.9) <= .25, JSON.stringify(c));
  // Approche de la manœuvre (60 % du tracé fictif) : zoom rapproché.
  for (const ff of [0.5, 0.6 - 250 / x.total]) { await p.clock.runFor(ff === 0.5 ? 60e3 : 20e3); await geo(ff); }
  const z = await state(p);
  check(`${dev} · à 250 m d’une manœuvre : zoom rapproché (${z.zoom})`, z.zoom >= 17.3, JSON.stringify(z));
  // Flèche interpolée (animations actives) : position intermédiaire, puis exactement le relevé, jamais au-delà sans nouveau relevé.
  await p.emulateMedia({ reducedMotion: 'no-preference' });
  const before = await p.evaluate(() => DRIVE.mv && DRIVE.mv.shown ? DRIVE.mv.shown() : [0, 0]), next = x.line(0.6 - 200 / x.total);
  await p.clock.runFor(4e3); await p.evaluate(g => { window.__geo = { lat: g[0], lon: g[1], acc: 8 }; window.__geoPush(); driveTick(); }, next);
  await p.clock.runFor(350); const mid = await p.evaluate(() => DRIVE.mv && DRIVE.mv.shown ? DRIVE.mv.shown() : [0, 0]);
  await p.clock.runFor(1500); const end = await p.evaluate(() => DRIVE.mv && DRIVE.mv.shown ? DRIVE.mv.shown() : [0, 0]);
  await p.clock.runFor(3000); const still = await p.evaluate(() => DRIVE.mv && DRIVE.mv.shown ? DRIVE.mv.shown() : [0, 0]);
  const dMid = meters(before, mid), dAll = meters(before, next);
  check(`${dev} · flèche interpolée : à mi-chemin (${Math.round(dMid)} m sur ${Math.round(dAll)} m), puis au relevé, jamais extrapolée après 3 s sans relevé`,
    dMid > 5 && dMid < dAll - 5 && meters(end, next) < 1 && meters(still, next) < 1, JSON.stringify({ before, mid, end, still, next }));
  await p.emulateMedia({ reducedMotion: 'reduce' });
  // Nuit noire : style nuit dérivé en direct, même carte : fond sombre, routes plus claires que le fond.
  await p.evaluate(() => { window.__mv = DRIVE.mv; });
  await p.clock.setSystemTime(new Date('2026-11-16T17:35:00+01:00')); await s.settle(8);
  const n = await state(p), same = await p.evaluate(() => DRIVE.mv === window.__mv);
  check(`${dev} · 17:35 (il fait noir) : style nuit IGN en direct sur la même carte, fond sombre, routes plus claires que le fond`, same && /^nuit/.test(n.theme) && lum(n.bg) < .2 && lum(n.road) > lum(n.bg) + .15, JSON.stringify({ n, same }));
  // Photo aérienne choisie dans les Réglages : source BD ORTHO dans la carte 3D, conservée.
  await p.evaluate(() => { lsSet('twrc.drive.base', 'ortho'); }); await s.settle(6);
  const o = await state(p);
  check(`${dev} · photo aérienne (Réglages) : BD ORTHO dans la carte 3D, assombrie la nuit`, o.ortho === true && o.theme === 'nuit+photo' && /BD ORTHO/.test(o.foot), JSON.stringify(o));
  check(`${dev} · aucune violation de la politique de sécurité (bibliothèque, worker, tuiles IGN)`, !o.csp, o.csp);
  await s.c.close();
  // Sans WebGL : repli à plat (Plan IGN, Leaflet), mêmes informations.
  const s2 = await session(b, { at: '2026-11-16T16:30:00+01:00', dev }), p2 = s2.p;
  await p2.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...r) { return /webgl/.test(k) ? null : g.call(this, k, ...r); }; });
  await p2.reload(); await s2.settle(10);
  const y = await setup(s2, dev, false).catch(e => ({ err: e.message }));
  const w = await state(p2).catch(e => ({ err: e.message }));
  check(`${dev} · sans WebGL : repli à plat sur le Plan IGN (Leaflet)`, w.kind === 'plat' && (y.tiles || []).includes('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'), JSON.stringify({ w, tiles: y.tiles, err: y.err }));
  await s2.c.close();
}
(async () => {
  const b = await BR.launch();
  try { await run(b, 'iphone'); await run(b, 'pc'); } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
