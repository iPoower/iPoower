// Navigation « EN DIRECT » (20/11/2026), valeurs FICTIVES : module pur DriveNav (tracé OSRM complet, sortie d'itinéraire,
// cap, requête et lecture des feux tricolores, km du trajet pour le compteur).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Math, JSON, Date, Set, Map, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/drive-nav-core.js'), 'utf8') + ';this.N=DriveNav;', c);
const N = c.N; let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
// Route fictive plein est, 49,000° N, de 2,000° à 2,100° E (≈ 7,3 km), 101 points.
const co = Array.from({ length: 101 }, (_, i) => [2 + i * 0.001, 49]);
const osrm = { routes: [{ distance: 7400, duration: 600, geometry: { coordinates: co } }] };
const route = N.fromOsrm(osrm, 'k1');
test('tracé OSRM complet : [lat, lon], longueur cumulée, km et minutes du calculateur, réponse invalide refusée', () => {
  assert.equal(route.pts.length, 101); assert.deepEqual(JSON.parse(JSON.stringify(route.pts[0])), [49, 2]); assert.equal(route.km, 7.4); assert.equal(route.min, 10);
  assert.ok(Math.abs(route.total - 7300) < 50, String(route.total));
  assert.equal(N.fromOsrm({ routes: [{ geometry: { coordinates: [[2, 49]] } }] }), null);
  assert.equal(N.fromOsrm({ routes: [{ geometry: { coordinates: [[2, 49], [200, 49]] } }] }), null);
  assert.equal(N.fromOsrm(null), null);
});
test('point le plus proche : écart et distance le long du tracé', () => {
  const h = N.nearest(route, [49.0009, 2.05]);
  assert.ok(Math.abs(h.gap - 100) < 3, String(h.gap)); assert.ok(Math.abs(h.along - route.total / 2) < 20, String(h.along));
});
const fix = (dLat, lon, ts, acc = 8) => ({ lat: 49 + dLat, lon, acc, ts });
test('sortie d’itinéraire : 3 relevés précis à plus de 70 m sur au moins 4 s → hors itinéraire', () => {
  let s = null; const T = 1e6;
  s = N.offStep(s, { route, fix: fix(.0012, 2.03, T), now: T + 60e3, routeAt: 0 }); assert.equal(s.n, 1); assert.equal(s.off, false);
  s = N.offStep(s, { route, fix: fix(.0015, 2.03, T + 2000), now: T + 60e3, routeAt: 0 }); assert.equal(s.off, false);
  s = N.offStep(s, { route, fix: fix(.0018, 2.03, T + 4000), now: T + 60e3, routeAt: 0 }); assert.equal(s.off, true);
});
test('jamais hors itinéraire : relevés sur le tracé, imprécis (> 50 m), répétés, trop rapprochés, près de l’arrivée ou juste après un recalcul', () => {
  const T = 1e6, run = (fixes, o = {}) => fixes.reduce((s, f) => N.offStep(s, { route, fix: f, now: T + 60e3, routeAt: 0, ...o }), null);
  assert.equal(run([fix(0, 2.01, T), fix(0.0002, 2.02, T + 3e3), fix(-0.0003, 2.03, T + 6e3)]).off, false);                 // ≤ 35 m : sur la route
  assert.equal(run([fix(.002, 2.01, T, 80), fix(.002, 2.02, T + 3e3, 80), fix(.002, 2.03, T + 6e3, 80)]).off, false);          // GPS imprécis
  assert.equal(run([fix(.002, 2.01, T), fix(.002, 2.01, T), fix(.002, 2.01, T)]).off, false);                                  // même relevé
  assert.equal(run([fix(.002, 2.01, T), fix(.002, 2.01, T + 1e3), fix(.002, 2.01, T + 2e3)]).off, false);                      // 2 s seulement
  assert.equal(run([fix(.002, 2.01, T), fix(.002, 2.01, T + 3e3), fix(.002, 2.01, T + 6e3)], { destKm: 0.8 }).off, false);   // arrivée proche
  assert.equal(run([fix(.002, 2.01, T), fix(.002, 2.01, T + 3e3), fix(.002, 2.01, T + 6e3)], { routeAt: T + 50e3 }).off, false); // tracé neuf
  // Une série interrompue par un relevé sur le tracé repart de zéro.
  assert.equal(run([fix(.002, 2.01, T), fix(.002, 2.02, T + 3e3), fix(0, 2.03, T + 6e3), fix(.002, 2.04, T + 9e3)]).n, 1);
});
test('cap entre deux relevés (nord 0°, est 90°), null sous 15 m', () => {
  assert.equal(N.heading({ lat: 49, lon: 2 }, { lat: 49.01, lon: 2 }), 0);
  assert.equal(N.heading({ lat: 49, lon: 2 }, { lat: 49, lon: 2.01 }), 90);
  assert.equal(N.heading({ lat: 49, lon: 2 }, { lat: 49.0001, lon: 2 }), null);
});
test('requête des feux : « around:30 » sur le tracé échantillonné, 4 décimales, portions à < 800 m d’un lieu privé jamais envoyées', () => {
  const q = N.lightsQuery(route, [{ lat: 49, lon: 2 }]);
  assert.match(q, /^\[out:json\]\[timeout:20\];\(node\["highway"="traffic_signals"\]\(around:30,[\d.,]+\);\);out skel;$/);
  const nums = q.match(/around:30,([\d.,]+)\)/)[1].split(',').map(Number), lons = nums.filter((_, i) => i % 2);
  assert.ok(nums.every(v => String(v).split('.')[1] == null || String(v).split('.')[1].length <= 4));
  assert.ok(Math.min(...lons) > 2.0105, 'point à moins de 800 m du domicile fictif envoyé : ' + Math.min(...lons));
  assert.ok(nums.length / 2 <= 302);
  // Lieu privé au milieu : deux portions séparées, aucune ligne droite à travers la zone privée.
  const mid = N.lightsQuery(route, [{ lat: 49, lon: 2.05 }]), segs = mid.match(/around:30,[\d.,]+\)/g).map(x => x.slice(10, -1).split(',').map(Number).filter((_, i) => i % 2));
  assert.equal(segs.length, 2); assert.ok(Math.max(...segs[0]) < 2.0395 && Math.min(...segs[1]) > 2.0605, JSON.stringify(segs.map(x => [Math.min(...x), Math.max(...x)])));
  assert.equal(N.lightsQuery(route, Array.from({ length: 8 }, (_, i) => ({ lat: 49, lon: 2 + i * 0.015 }))), null);   // tout le tracé est privé
});
test('lecture des feux : à ≤ 30 m du tracé, regroupés par carrefour (60 m), triés ; feux devant et prochain', () => {
  const els = [{ type: 'node', lat: 49.0001, lon: 2.05 }, { type: 'node', lat: 48.9999, lon: 2.0503 },   // même carrefour (≈ 22 m)
    { type: 'node', lat: 49, lon: 2.02 }, { type: 'node', lat: 49.002, lon: 2.07 },                       // le dernier à ≈ 220 m : ignoré
    { type: 'way', lat: 49, lon: 2.03 }, { type: 'node', lat: 'x', lon: 2 }];
  const L = N.lights({ elements: els }, route);
  assert.equal(L.length, 2); assert.equal(L[1].n, 2); assert.ok(L[0].along < L[1].along);
  const a = N.lightsAhead(L, route.total * 0.3);
  assert.equal(a.count, 1); assert.ok(Math.abs(a.next - route.total * 0.2) < 40, String(a.next));
  assert.deepEqual(JSON.parse(JSON.stringify(N.lightsAhead(L, route.total * 0.9))), { count: 0, next: null });
});
test('alerte d’approche : prochain feu à ≤ 300 m, feux enchaînés dans les 150 m, rien au-delà ni une fois franchi', () => {
  const L = [{ along: 1000, n: 1 }, { along: 1120, n: 1 }, { along: 2000, n: 2 }];
  assert.equal(N.lightAlert(L, 600), null);
  const a = JSON.parse(JSON.stringify(N.lightAlert(L, 750)));
  assert.deepEqual(a, { dist: 250, chain: 2, key: 1000 });
  assert.equal(N.lightAlert(L, 1010).key, 1000); assert.equal(N.lightAlert(L, 1010).dist, 0);   // au carrefour (marge 15 m)
  assert.equal(N.lightAlert(L, 1200), null);                                                        // franchis, suivant à 800 m
  assert.deepEqual(JSON.parse(JSON.stringify(N.lightAlert(L, 1800))), { dist: 200, chain: 1, key: 2000 });
  assert.equal(N.lightAlert([], 0), null); assert.equal(N.lightAlert(L, null), null);
});
test('étapes OSRM : manœuvres placées le long du tracé, voies seulement si OSRM les fournit ; prochaine manœuvre réelle ; zoom automatique', () => {
  const r = N.fromOsrm({ routes: [{ distance: 7400, duration: 600, geometry: { coordinates: co }, legs: [{ steps: [
    { name: 'Rue A', maneuver: { type: 'depart', location: [2, 49] } },
    { name: 'Rue A bis', maneuver: { type: 'new name', modifier: 'straight', location: [2.02, 49] } },
    { name: 'Avenue B', maneuver: { type: 'turn', modifier: 'right', location: [2.05, 49] }, intersections: [{ lanes: [{ valid: false, indications: ['left'] }, { valid: true, indications: ['straight', 'right'] }] }] },
    { name: 'loin', maneuver: { type: 'turn', modifier: 'left', location: [2.05, 49.01] } },
    { name: '', maneuver: { type: 'arrive', location: [2.1, 49] } }] }] }] });
  assert.deepEqual(JSON.parse(JSON.stringify(r.steps.map(s => [s.type, s.name, !!s.lanes]))), [['depart', 'Rue A', false], ['new name', 'Rue A bis', false], ['turn', 'Avenue B', true], ['arrive', '', false]]);
  assert.ok(Math.abs(r.steps[2].along - r.total / 2) < 40);
  assert.equal(N.nextStep(r, 100).name, 'Avenue B');                          // « new name » tout droit ignoré
  assert.equal(N.nextStep(r, r.total / 2 + 30).type, 'arrive'); assert.equal(N.nextStep(null, 0), null);
  assert.equal(N.autoZoom(30, null), 17.3); assert.equal(N.autoZoom(95, 5000), 15.9); assert.equal(N.autoZoom(120, 300), 17.4); assert.equal(N.autoZoom(95, 700), 16.8); assert.equal(N.autoZoom(null, null), 16.6);
});
test('km du trajet pour le compteur : distance suivie si elle couvre la moitié du prévu, sinon prévue ; arrondi au km', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(N.tripKm(31.4, 30))), { km: 31, src: 'gps' });
  assert.deepEqual(JSON.parse(JSON.stringify(N.tripKm(3, 30))), { km: 30, src: 'route' });
  assert.deepEqual(JSON.parse(JSON.stringify(N.tripKm(null, 12.6))), { km: 13, src: 'route' });
  assert.equal(N.tripKm(null, null), null); assert.equal(N.tripKm(5000, null), null);
});
console.log(`\n${n}/${n} contrôles « navigation en direct »`);
