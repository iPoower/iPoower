// Route Radar : lecture seule, données manquantes, horaires, couverture, cache et sécurité.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../src/app/route-radar.js'), 'utf8');
const ctx = { addMin: (t, n) => new Date(Date.parse(t) + n * 60000).toISOString().slice(0, 16) };
vm.createContext(ctx);
vm.runInContext(script + '\nthis.radar = RouteRadar;', ctx);
const rr = ctx.radar, now = Date.parse('2026-10-19T15:00:00Z');
const hours = [{ t: '2026-10-19T15:00', T: 8, P: 1.2, pp: 70, snow: 0, vis: 600, wind: 19, gust: 42 }];
const points = (fs) => fs.map((f, i) => ({ hs: hours, i: 0, f, lat: 49 + f, lon: 2 + f,
  t: '2026-10-19T15:' + String(i * 10).padStart(2, '0'), km: f * 30 }));
const leg = { routed: true, g: [[49, 2], [49.5, 2.5], [50, 3]], pts: [{ f: .5 }] };
const trip = { key: 'lieu-a-lieu-b', dep: '2026-10-19T15:00', arr: '2026-10-19T15:20', l: leg, seq: points([0, .5, 1]) };
const source = { hs: hours, mode: 'live', at: now - 120000 };
const view = t => rr.snapshot({ trip: t, sources: [source], now });
const original = JSON.stringify(trip);
const first = view(trip);
assert.equal(first.state, 'ready'); assert.equal(first.partial, false);
assert.deepEqual([...first.points].map(p => p.label), ['DÉPART', 'PARCOURS', 'ARRIVÉE']);
assert.equal(first.points[1].time, '2026-10-19T15:10');
assert.equal(first.points[1].temp, 8); assert.equal(first.points[1].visibility, 600);
assert.equal(first.points[1].state, 'Prévision conservée');
assert.match(rr.html(first, String), /600 m/);
assert.match(rr.html(first, String), /Couverture|Échantillons/);
assert.equal(JSON.stringify(trip), original, 'aucune mutation');
assert.equal(view({ ...trip, seq: points([0, 1]) }).partial, true, 'grand intervalle non couvert');
assert.equal(view({ ...trip, seq: points([0]) }).partial, true, 'trajet long avec un seul point');
assert.equal(view({ ...trip, seq: [] }).state, 'unavailable');
assert.equal(view({ ...trip, originPending: true }).state, 'unavailable');
assert.equal(view(null).state, 'unavailable');
assert.equal(view({ ...trip, l: { routed: false }, seq: points([0, .5, 1]) }).partial, true, 'pas de géométrie OSRM');
assert.equal(view({ ...trip, arr: null, seq: [{ hs: hours, i: 0 }] }).points[0].time, null, 'pas de faux ETA');
assert.equal(rr.snapshot({ trip, sources: [source], offline: true, now }).points[0].state, 'Hors ligne · cache');
assert.equal(rr.snapshot({ trip, sources: [{ ...source, at: now - 3600000 }], now }).points[0].state, 'Cache périmé');
assert.equal(rr.snapshot({ trip, sources: [], now }).points[0].state, 'Fraîcheur non vérifiée');
assert.equal(rr.snapshot({ trip: { ...trip, seq: points([0, 1]), carId: 'other' }, sources: [source], now }).points.length, 2);
assert.equal(view({ ...trip, key: 'nouvelle-destination', seq: [] }).state, 'unavailable');
assert.match(rr.html(first, s => String(s).replaceAll('<', '&lt;')), /Prévisions aux points/);
const html = rr.html(view({ ...trip, seq: [{ ...points([0])[0], t: null, name: '<script>alert(1)</script>' }] }), s => String(s).replaceAll('<', '&lt;'));
assert(!html.includes('<script>'), 'aucun HTML injecté via les points');
console.log('✅ Route Radar : projection et ETA prudents, phénomènes, couverture, annulation, offline/cache, changement et sécurité');

// Lot 2 · itinéraire FICTIF « Lieu A → Lieu B » d'environ 800 km (coordonnées en plein océan, aucune donnée personnelle).
{
  const N = 400, A = [-30, 40], B = [-21.5, 44.6];   // [lon, lat]
  const co = Array.from({ length: N + 1 }, (_, k) => [A[0] + (B[0] - A[0]) * k / N, A[1] + (B[1] - A[1]) * k / N + 0.15 * Math.sin(k / 30)]);
  const dur = Array.from({ length: N }, (_, k) => k < N / 2 ? 18 : 24);   // vitesses différentes : f (temps) ≠ fraction de distance
  const pts = rr.samplePoints(co, dur), kms = [0, ...pts.map(p => p.km)];
  const total = co.slice(1).reduce((s, c, i) => s + (() => { const R = Math.PI / 180, a = co[i], h = Math.sin((c[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(c[1] * R) * Math.sin((c[0] - a[0]) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); })(), 0);
  assert(total > 750 && total < 900, 'itinéraire fictif ≈ 800 km : ' + total);
  assert(pts.length >= 10 && pts.length <= 14, 'nombre de points intermédiaires : ' + pts.length);
  kms.push(total);
  kms.slice(1).forEach((k, i) => { const step = k - kms[i]; assert(step >= 50 && step <= 80, `écart ${i} : ${step.toFixed(1)} km (attendu 50 à 80)`); });
  assert(pts.every((p, i) => p.f > 0 && p.f < 1 && (i === 0 || p.f > pts[i - 1].f)), 'fractions de temps croissantes');
  assert(Math.abs(pts[Math.floor(pts.length / 2)].f - .5) > .01, 'f = fraction de TEMPS, pas de distance');
  const short = rr.samplePoints(co.slice(0, 50), dur.slice(0, 49));
  assert.equal(short.length, 3, 'trajet court (≈ 100 km) : 3 points comme avant');
  // altitude : celle du point de grille du modèle (elevation de la réponse Open-Meteo), jamais inventée
  const hrs = k => [{ t: '2026-11-23T' + String(6 + Math.floor(k / 2)).padStart(2, '0') + ':' + (k % 2 ? '30' : '00'), T: 3, P: 0, pp: 10, snow: 0, vis: k === 8 ? 150 : 20000, wind: 10, gust: 20, code: k === 8 ? 45 : 3 }];
  const seq = [{ f: 0, km: 0, elev: 60 }, ...pts.map((p, k) => ({ ...p, elev: k === 7 ? 1050 : k === 8 ? 920 : 300 + k * 20 })), { f: 1, km: Math.round(total), elev: 280 }]
    .map((p, k) => ({ hs: hrs(k), i: 0, f: p.f, km: p.km, lat: 40, lon: -30, t: hrs(k)[0].t, elev: p.elev }));
  const longTrip = { key: 'lieu-a-lieu-b-long', dep: '2026-11-23T06:00', arr: '2026-11-23T14:00', l: { routed: true, g: co.map(c => [c[1], c[0]]), pts }, seq };
  const r = rr.snapshot({ trip: longTrip, sources: [], now: Date.parse('2026-11-23T05:00:00Z') });
  assert.equal(r.points.length, pts.length + 2);
  assert(r.highCount >= 1, 'au moins un point au-dessus de 800 m'); assert.equal(r.highest.elevation, 1050);
  assert(r.worst && r.worst.visibility === 150, 'pire point = brouillard'); assert.equal(r.worst.elevation, 1050);
  const h = rr.html(r, String);
  assert.match(h, /Pire point · km \d+ vers \d\d:\d\d/); assert.match(h, /alt\. 1050 m ⛰️/); assert.match(h, /au-dessus de 800 m/);
  console.log(`✅ Lot 2 · itinéraire fictif ≈ ${Math.round(total)} km : ${pts.length} points intermédiaires (50 à 80 km), altitude ≥ 800 m signalée, pire point et pire heure`);
}
