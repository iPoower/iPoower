// Mode « EN DIRECT » · altitude du parcours (21/11/2026, lot 5), données FICTIVES, iPhone puis PC, GPS simulé.
// Profil du tracé demandé à l'altimétrie IGN (simulée), jamais à moins de 1,5 km d'un lieu enregistré ; altitude à la position ;
// prochain point haut (990 m) et température prévue À SON ALTITUDE à l'heure de passage (Open-Meteo, altitude imposée) : sous 0 °C
// → « gel probable », mis en évidence ; aucune altitude inventée là où le profil est inconnu.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
const cold = o => { const H = o.hourly || {}; if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) H.temperature_2m = H.time.map(() => -1.2); return o; };
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev, wx: cold }), p = s.p, alti = [], elevQ = [];
  p.on('request', r => { const u = r.url(); if (/api\.open-meteo\.com\/v1\/forecast/.test(u) && /[?&]elevation=/.test(u)) elevQ.push(u); });
  await p.route('https://data.geopf.fr/**', r => { const u = new URL(r.request().url());
    if (/altimetrie/.test(u.pathname)) { const lon = u.searchParams.get('lon').split('|'), lat = u.searchParams.get('lat').split('|'); alti.push(lat.map((v, i) => [+v, +lon[i]]));
      const n = lat.length; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elevations: lat.map((_, i) => Math.round(150 + 840 * Math.sin(Math.PI * i / (n - 1)))) }) }); }
    return r.fulfill({ status: 200, contentType: 'image/png', body: PX }); });
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  await p.route('https://router.project-osrm.org/**', r => { const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const co = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 20, geometry: { coordinates: co }, legs: [{ steps: [], annotation: { duration: co.slice(1).map(() => d / 800) } }] }] }) }); });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  const priv = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); UI.view = 'trajet'; rebuild(); renderAll();
    return S.locs.filter(locHasCoords).map(l => [l.lat, l.lon]); });
  await s.settle(8); await p.locator('#secTripSummary [data-act=drive-open]').click(); await s.settle(6);
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const push = async f => { await p.evaluate(f => { const [o, d] = S.locs; window.__geo = { lat: o.lat + (d.lat - o.lat) * f, lon: o.lon + (d.lon - o.lon) * f, acc: 8 }; window.__geoPush(); }, f); await s.settle(3); };
  await push(0.2); await p.clock.runFor(25e3); await push(0.22); await p.clock.runFor(20e3); await push(0.24); await s.settle(6);
  const a = await p.evaluate(() => { const r = document.querySelector('#liveDrive .dv-alt'), q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || '';
    return { shown: !!r && !r.hidden, lv: r && r.dataset.dvLv, alt: q('alt'), top: q('altTop'), profile: !!(DRIVE.nav && DRIVE.nav.profile) }; });
  const sent = alti.flat(), closest = sent.length ? Math.min(...sent.flatMap(pt => priv.map(q => meters(pt, q)))) : 0;
  check(`${dev} · profil demandé à l’altimétrie IGN, aucun point à moins de 1,5 km d’un lieu enregistré (au plus près : ${Math.round(closest)} m)`, alti.length >= 1 && closest > 1500 && a.profile, JSON.stringify({ n: alti.length, closest }));
  check(`${dev} · altitude à la position affichée (${a.alt})`, a.shown && /^\d+ m$/.test(a.alt), JSON.stringify(a));
  check(`${dev} · point haut devant (≈ 990 m) et température prévue à son altitude : « gel probable » mis en évidence`, /^Point haut 9[89]\d m dans [\d,]+ km · −?-?1,2 °C prévus · gel probable$/.test(a.top.replace('−', '-')) && a.lv === '2' && elevQ.length >= 1 && /elevation=9[89]\d/.test(elevQ[0]), JSON.stringify({ a, q: elevQ[0] }));
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
