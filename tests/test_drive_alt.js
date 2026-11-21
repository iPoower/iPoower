// Altitude du parcours (21/11/2026, lot 5), valeurs FICTIVES : module pur DriveAlt (profil, altitude, point haut, gel).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Math, JSON }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/drive-alt-core.js'), 'utf8') + ';this.A=DriveAlt;', c);
const A = c.A, J = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const co = Array.from({ length: 101 }, (_, i) => [45.9, 6.0 + i * 0.004]), cum = [0];
for (let i = 1; i < co.length; i++) cum.push(cum[i - 1] + 6371000 * Math.PI / 180 * 0.004 * Math.cos(45.9 * Math.PI / 180));
const route = { pts: co, cumulative: cum, total: cum[cum.length - 1] };
test('points du profil : réguliers, 4 décimales, jamais à moins de 1,5 km d’un lieu enregistré', () => {
  const s = J(A.samples(route, [{ lat: 45.9, lon: 6.0 }]));
  assert.ok(s.length >= 100 && s.length <= 160, String(s.length));
  assert.ok(s.every(p => p.at.every(v => (String(v).split('.')[1] || '').length <= 4)));
  const R = Math.PI / 180, m = p => 6371000 * R * Math.hypot(p[0] - 45.9, (p[1] - 6.0) * Math.cos(45.9 * R));
  assert.ok(Math.min(...s.map(p => m(p.at))) > 1500);
  assert.equal(A.samples(null).length, 0);
});
test('profil : réponse IGN alignée sur les points, valeurs absurdes écartées ; altitude interpolée, inconnue loin des points', () => {
  const pts = [{ along: 0, at: [45.9, 6] }, { along: 1000, at: [45.9, 6.01] }, { along: 2000, at: [45.9, 6.02] }, { along: 6000, at: [45.9, 6.06] }];
  const prof = J(A.profile({ elevations: [400, 600, -99999, 900] }, pts));
  assert.deepEqual(prof.map(p => p.z), [400, 600, 900]);
  assert.equal(A.altAt(prof, 500), 500); assert.equal(A.altAt(prof, 3000), null);   // trou de 5 km : inconnu
  assert.equal(A.profile({ elevations: [1, 2] }, pts), null);
});
test('point haut devant : ≥ 150 m au-dessus ou ≥ 600 m ; aucun sinon ; distance et gain', () => {
  const pts = Array.from({ length: 11 }, (_, i) => ({ along: i * 1000, at: [45.9, 6 + i * 0.01] }));
  const prof = J(A.profile({ elevations: [300, 350, 420, 560, 780, 990, 900, 700, 500, 400, 350] }, pts));
  const s = A.summit(prof, 1500);
  assert.equal(s.z, 990); assert.equal(s.dist, 3500); assert.ok(s.gain >= 600);
  assert.equal(A.summit(J(A.profile({ elevations: Array(11).fill(200) }, pts)), 0), null);
  assert.equal(A.summit(prof, 9600), null);
});
test('gel au point haut : ≤ 0 °C probable, ≤ 2 °C possible, sinon non ; température à l’heure de passage', () => {
  assert.deepEqual(J([-1.5, 0, 1.5, 2, 3.2].map(t => A.frost(t).level)), [2, 2, 1, 1, 0]);
  assert.equal(A.frost(null), null);
  const j = { hourly: { time: ['2026-11-16T07:00', '2026-11-16T08:00'], temperature_2m: [-2.4, -1.1] } };
  assert.equal(A.tempAt(j, '2026-11-16T08:35'), -1.1); assert.equal(A.tempAt(j, '2026-11-16T09:10'), null);
});
console.log(`\n${n}/${n} contrôles « altitude du parcours »`);
