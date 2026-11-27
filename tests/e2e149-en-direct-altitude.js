// Mode « EN DIRECT » · altitude du parcours (21/11/2026, lot 5), données FICTIVES, iPhone puis PC, GPS simulé.
// Profil du tracé demandé à l'altimétrie IGN (simulée), jamais à moins de 1,5 km d'un lieu enregistré ; altitude à la position ;
// prochain point haut (990 m) et gel À SON ALTITUDE à l'heure de passage (Open-Meteo, altitude imposée) selon la règle UNIQUE
// d'engine.js : même niveau et mêmes mots que la carte trajet pour la même heure météo (test différentiel aux bornes −2, 1, 2 et
// 4 °C, chaussée sèche, humide et humidité inconnue) ; aucune altitude inventée là où le profil est inconnu.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 700))); if (!ok) fail++; };
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RAD = Math.PI / 180, meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
// Prévision horaire FICTIVE et uniforme du point haut (ciel couvert, sans soleil : chaussée estimée = air ; heures passées comprises
// pour l'inertie de la chaussée et le cumul de pluie). hum : 'sec' (tout mesuré, rien), 'humide' (pluie), 'inconnu' (pluie non fournie).
const HOURS = Array.from({ length: 5 * 24 }, (_, k) => { const d = new Date(Date.UTC(2026, 10, 15, k)); return d.toISOString().slice(0, 13) + ':00'; });
function summitJson(T, hum, z = 990) {
  const v = x => HOURS.map(() => x), wet = hum === 'humide', unk = hum === 'inconnu';
  return { latitude: 45, longitude: 6, elevation: z, timezone: 'Europe/Paris', utc_offset_seconds: 3600, hourly: { time: HOURS,
    temperature_2m: v(T), relative_humidity_2m: v(wet ? 90 : 60), dew_point_2m: v(wet ? T - 1.5 : T - 7), apparent_temperature: v(T - 2), precipitation_probability: v(wet ? 90 : 0),
    precipitation: v(unk ? null : wet ? 0.5 : 0), rain: v(unk ? null : wet ? 0.5 : 0), showers: v(0), snowfall: v(0), weather_code: v(wet ? 61 : 3), pressure_msl: v(1015),
    cloud_cover: v(100), visibility: v(20000), wind_speed_10m: v(10), wind_gusts_10m: v(20), shortwave_radiation: v(0), uv_index: v(0) } };
}
async function run(b, dev) {
  const s = await session(b, { at: '2026-11-16T10:00:00+01:00', dev }), p = s.p, alti = [], elevQ = [];
  await s.p.evaluate(() => { lsSet('twrc.drive.live', '1'); renderAll(); });   // mode EN DIRECT (sans CarPlay) : préférence de l’appareil, désactivée par défaut depuis le 27/11
  let summit = summitJson(-1.2, 'humide'), summitStatus = 200;
  p.on('request', r => { const u = r.url(); if (/api\.open-meteo\.com\/v1\/forecast/.test(u) && /[?&]elevation=/.test(u)) elevQ.push(u); });
  await p.route('https://data.geopf.fr/**', r => { const u = new URL(r.request().url());
    if (/altimetrie/.test(u.pathname)) { const lon = u.searchParams.get('lon').split('|'), lat = u.searchParams.get('lat').split('|'); alti.push(lat.map((v, i) => [+v, +lon[i]]));
      const n = lat.length; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ elevations: lat.map((_, i) => Math.round(150 + 840 * Math.sin(Math.PI * i / (n - 1)))) }) }); }
    return r.fulfill({ status: 200, contentType: 'image/png', body: PX }); });
  await p.route(/api\.open-meteo\.com\/v1\/forecast.*[?&]elevation=/, r => r.fulfill(summitStatus === 429 ? { status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":true,"reason":"Too many requests"}' }
    : { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(summit) }));
  await p.route('https://overpass-api.de/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"elements":[]}' }));
  await p.route('https://router.project-osrm.org/**', r => { const m = /driving\/([^;]+);([^?]+)/.exec(new URL(r.request().url()).pathname), A = m[1].split(',').map(Number), B = m[2].split(',').map(Number);
    const co = Array.from({ length: 41 }, (_, i) => [A[0] + (B[0] - A[0]) * i / 40, A[1] + (B[1] - A[1]) * i / 40]), d = meters([A[1], A[0]], [B[1], B[0]]);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ routes: [{ distance: d, duration: d / 20, geometry: { coordinates: co }, legs: [{ steps: [], annotation: { duration: co.slice(1).map(() => d / 800) } }] }] }) }); });
  await p.emulateMedia({ reducedMotion: 'reduce' }); await s.settle(4);
  const priv = await p.evaluate(() => { S.work.days = []; S.gpsAuto = 1; saveSettings(); const [o, d] = S.locs;
    appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep: liveNow().slice(0, 16), carId: S.cars[0].id }); UI.view = 'trajet'; rebuild(); renderAll();
    return S.locs.filter(locHasCoords).map(l => [l.lat, l.lon]); });
  await s.settle(8); await p.locator('#viewSeg [data-v=gps]').click(); await s.settle(1); await p.locator('#secGps [data-act=drive-open]').click(); await s.settle(6);
  await p.evaluate(() => { const t = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip; liveStart(t.key); });
  const push = async f => { await p.evaluate(f => { const [o, d] = S.locs; window.__geo = { lat: o.lat + (d.lat - o.lat) * f, lon: o.lon + (d.lon - o.lon) * f, acc: 8 }; window.__geoPush(); }, f); await s.settle(3); };
  await push(0.2); await p.clock.runFor(25e3); await push(0.22); await p.clock.runFor(20e3); await push(0.24); await s.settle(6);
  const a = await p.evaluate(() => { const r = document.querySelector('#liveDrive .dv-alt'), q = k => (document.querySelector('#liveDrive [data-dv="' + k + '"]') || {}).textContent || '';
    return { shown: !!r && !r.hidden, lv: r && r.dataset.dvLv, alt: q('alt'), top: q('altTop'), profile: !!(DRIVE.nav && DRIVE.nav.profile) }; });
  const sent = alti.flat(), closest = sent.length ? Math.min(...sent.flatMap(pt => priv.map(q => meters(pt, q)))) : 0;
  check(`${dev} · profil demandé à l’altimétrie IGN, aucun point à moins de 1,5 km d’un lieu enregistré (au plus près : ${Math.round(closest)} m)`, alti.length >= 1 && closest > 1500 && a.profile, JSON.stringify({ n: alti.length, closest }));
  check(`${dev} · altitude à la position affichée (${a.alt})`, a.shown && /^\d+ m$/.test(a.alt), JSON.stringify(a));
  check(`${dev} · point haut devant (≈ 990 m), gel à son altitude selon la règle d’engine.js : « ${a.top.replace(/^.*? km · /, '')} »`, /^Point haut 9[89]\d m dans [\d,]+ km · DANGER · gel possible · chaussée humide · chaussée est\. −1,2 °C$/.test(a.top) && a.lv === '3' && elevQ.length >= 1 && /elevation=9[89]\d/.test(elevQ[0]) && /dew_point_2m/.test(elevQ[0]), JSON.stringify({ a, q: elevQ[0] }));
  // Quota Open-Meteo atteint (429) pour l'heure suivante (une heure plus tard) : « non couverte », jamais « pas de gel » ; plafond de 3 appels par trajet.
  summitStatus = 429;
  const early = await p.evaluate(() => DRIVE.summitCalls);
  check(`${dev} · profil IGN rafraîchi (${alti.length} profils) sans nouvel appel météo pour le même col : ${early} appel`, early === 1 && alti.length >= 2, JSON.stringify({ early, alti: alti.length }));
  // La même série a servi l'heure de passage suivante (cache de 60 min, aucun appel) ; au-delà, nouvelle évaluation : nouvel appel.
  await p.clock.runFor(61 * 60e3); const mid = await p.evaluate(() => [DRIVE.summitCalls, DRIVE.summitKey]);
  await p.evaluate(() => { DRIVE.summitKey = null; }); await push(0.25); await s.settle(6);
  const q = await p.evaluate(() => { const r = document.querySelector('#liveDrive .dv-alt'); return { lv: r && r.dataset.dvLv, top: (document.querySelector('#liveDrive [data-dv="altTop"]') || {}).textContent || '', calls: DRIVE.summitCalls }; });
  check(`${dev} · Open-Meteo saturé (429) : « gel non couvert », jamais RAS ni « pas de gel » ; heure suivante servie par la même série sans appel, puis ${q.calls} appel(s) au total (plafond 3)`, /gel non couvert \(service météo saturé\)$/.test(q.top) && !/pas de gel|RAS|aucun risque/.test(q.top) && q.lv === 'x' && q.calls === 2 && mid[0] === 1 && /\|2026-11-16T11$/.test(mid[1]), JSON.stringify({ q, mid }));
  // Plafond atteint à l'heure de passage suivante : dernière prévision valide de CE point haut, avec son heure (pas « non couvert »).
  // Plafond atteint (budget de 3 appels consommé par d'autres cols : simulé, le trajet de test n'en a qu'un) puis nouvelle évaluation :
  // dernière prévision valide de CE col avec son heure, aucun appel de plus.
  summitStatus = 200; await p.clock.runFor(61e3); const before = elevQ.length;   // fin de la pause 429 commune (60 s)
  await p.evaluate(() => { DRIVE.summitCalls = DriveAlt.MAX_CALLS; DRIVE.summitKey = null; }); await push(0.26); await s.settle(6);
  const c = await p.evaluate(() => { const r = document.querySelector('#liveDrive .dv-alt'); return { lv: r && r.dataset.dvLv, top: (document.querySelector('#liveDrive [data-dv="altTop"]') || {}).textContent || '', calls: DRIVE.summitCalls, key: DRIVE.summitKey, phase: LIVE.phase, now: liveNow() }; });
  check(`${dev} · plafond atteint (série du col périmée) : dernière prévision valide gardée avec son heure (« ${c.top.replace(/^.*? km · /, '')} »)`, /· DANGER · gel possible · chaussée humide · chaussée est\. −1,2 °C · prévision de \d{2}:00 \(plafond d’appels atteint\)$/.test(c.top) && c.lv === '3' && c.calls === 3 && elevQ.length === before, JSON.stringify({ c, sent: elevQ.length - before }));
  const tripCalls = elevQ.length, tripAlti = alti.length;   // appels réels de CE trajet (le test différentiel ci-dessous remet le compteur à zéro)
  // Test DIFFÉRENTIEL : la même heure météo du point haut donne le même niveau et les mêmes mots dans le cockpit EN DIRECT et dans la
  // carte trajet (tripFrost : makeModel → summarize → frostRisk, comme un point du trajet), aux bornes de la règle d'engine.js.
  const EXPECT = { '-2': { sec: 3, humide: 3, inconnu: 3 }, '1': { sec: 2, humide: 3, inconnu: 3 }, '2': { sec: 1, humide: 2, inconnu: 1 }, '4': { sec: 0, humide: 0, inconnu: 0 } }, diff = [];
  for (const T of [-2, 1, 2, 4]) for (const hum of ['sec', 'humide', 'inconnu']) {
    summit = summitJson(T, hum);
    await p.evaluate(() => { DRIVE.summitKey = null; DRIVE.summitCalls = 0; DRIVE.summitLast = null; DRIVE.summitT = null; DRIVE.summitCol = null; DRIVE.summitCache = null; }); await push(0.26); await s.settle(3);
    const r = await p.evaluate(json => { const row = document.querySelector('#liveDrive .dv-alt'), top = (document.querySelector('#liveDrive [data-dv="altTop"]') || {}).textContent || '';
      const k = String(DRIVE.summitKey || '').split('|'), at = (k[0] || '').split(',').map(Number), hour = (k[2] || '') + ':00';
      const m = makeModel(json, 'live', { lat: at[0], lon: at[1] }), i = m.byTime.get(hour), tf = i == null ? null : tripFrost({ sum: summarize([{ hs: m.hs, i }]) });
      return { lv: row && row.dataset.dvLv, top, trip: tf ? { lv: tf.fr.level, name: LV[tf.fr.level].name, words: frostWords(tf.fr).label, basis: tf.fr.basis } : null }; }, summit);
    const want = EXPECT[String(T)][hum], t = r.trip, ok = !!t && t.lv === want && r.lv === String(t.lv) && r.top.includes(' · ' + t.name + ' · ' + t.words + ' · ')
      && (hum === 'inconnu' ? t.basis === 'air' && /repli : chaussée non estimée/.test(r.top) : t.basis === 'road') && !/pas de gel prévu/.test(r.top);
    diff.push((ok ? '✓ ' : '✗ ') + T + ' °C ' + hum + ' → ' + (t ? t.name : '?') + (ok ? '' : ' [cockpit ' + r.lv + ' « ' + r.top.replace(/^.*? km · /, '') + ' »]'));
  }
  check(`${dev} · test différentiel cockpit / carte trajet (règle d’engine.js) : ${diff.join(' ; ')}`, diff.every(x => x.startsWith('✓')), diff.filter(x => x.startsWith('✗')).join(' ; '));
  const z = await p.evaluate(() => { const before = DRIVE.summitCalls; DRIVE.key = 'autre-trajet'; driveTick(); return { before, after: DRIVE.summitCalls }; });
  check(`${dev} · plafond compté PAR TRAJET : un autre trajet repart à 0 appel (${z.before} → ${z.after})`, z.before >= 1 && z.after === 0, JSON.stringify(z));
  rows.push('ℹ️ ' + dev + ' · appels « point haut » vers Open-Meteo pendant ce trajet (≈ 1 h simulée) : ' + tripCalls + ' (plafond 3) ; altimétrie IGN : ' + tripAlti);
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
