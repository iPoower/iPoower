// Garage · évolution du kilométrage et objectif par voiture (kilométrage cible ou « à vie ») : projection pure, valeurs FICTIVES.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/garage.js'), 'utf8') + ';this.G=Garage;', c);
const G = c.G; let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const T = '2026-11-15';
test('objectif : seuls { km } entier 1…2 000 000 et { life } sont acceptés', () => {
  assert.deepEqual({ ...G.odoGoal({ km: 250000 }) }, { km: 250000 });
  assert.deepEqual({ ...G.odoGoal({ life: 1 }) }, { life: true });
  for (const bad of [null, undefined, 'x', {}, { km: 0 }, { km: -5 }, { km: 1.5 }, { km: 2000001 }, { km: '250000' }, { life: 'oui' }]) assert.equal(G.odoGoal(bad), null, JSON.stringify(bad));
});
test('date du jour exigée', () => assert.throws(() => G.odoTrend({ odo: [] }, {})));
test('aucun relevé : rien d’inventé', () => {
  const r = G.odoTrend({ id: 'a', odoGoal: { km: 250000 } }, { today: T });
  assert.equal(r.count, 0); assert.equal(r.last, null); assert.equal(r.kmPerDay, null); assert.equal(r.totalKm, null);
  assert.equal(r.target.km, 250000); assert.equal(r.target.remaining, null); assert.equal(r.target.eta, null); assert.equal(r.target.pct, null);
});
test('un relevé : progression connue, date d’objectif inconnue (rythme non calculable)', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-11-01', km: 200000 }], odoGoal: { km: 250000 } }, { today: T });
  assert.equal(r.target.pct, 80); assert.equal(r.target.remaining, 50000); assert.equal(r.target.eta, null); assert.equal(r.kmPerYear, null);
});
test('rythme et date d’objectif : même règle que l’entretien (premier et dernier relevés, ≥ 7 jours)', () => {
  const car = { odo: [{ d: '2026-01-01', km: 100000 }, { d: '2026-06-01', km: 104000 }, { d: '2026-11-01', km: 110000 }], odoGoal: { km: 120000 } };
  const r = G.odoTrend(car, { today: T });
  assert.equal(r.kmPerDay, G.kmPerDay(car.odo));
  assert.equal(r.totalKm, 10000); assert.equal(r.spanDays, 304);
  const days = Math.ceil(10000 / (10000 / 304)); assert.equal(r.target.eta, new Date(Date.parse('2026-11-01T00:00:00Z') + days * 864e5).toISOString().slice(0, 10));
  assert.ok(Math.abs(r.target.pct - 110000 / 120000 * 100) < 1e-9); assert.equal(r.target.reached, false);
});
test('objectif atteint : date du premier relevé qui l’atteint, aucune projection', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-01-01', km: 98000 }, { d: '2026-05-01', km: 100500 }, { d: '2026-09-01', km: 103000 }], odoGoal: { km: 100000 } }, { today: T });
  assert.equal(r.target.reached, true); assert.equal(r.target.reachedOn, '2026-05-01'); assert.equal(r.target.eta, null); assert.equal(r.target.pct, 100);
});
test('à vie : pas de cible ni de date, kilomètres parcourus et rythme', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-03-01', km: 5000 }, { d: '2026-11-01', km: 15000 }], odoGoal: { life: 1 } }, { today: T });
  assert.equal(r.goal.life, true); assert.equal(r.target, null); assert.equal(r.totalKm, 10000); assert.ok(r.kmPerYear > 14000 && r.kmPerYear < 16000);
});
test('12 derniers mois : seulement si l’historique couvre un an (interpolation entre deux relevés réels)', () => {
  assert.equal(G.odoTrend({ odo: [{ d: '2026-03-01', km: 5000 }, { d: '2026-11-01', km: 15000 }] }, { today: T }).last12, null);
  const r = G.odoTrend({ odo: [{ d: '2025-01-01', km: 0 + 1 }, { d: '2025-07-01', km: 10001 }, { d: '2026-07-01', km: 30001 }] }, { today: T });
  // 01/07/2025 → 01/07/2026 = 365 jours exactement : borne sur un relevé réel
  assert.equal(r.last12, 20000);
});
test('un relevé par jour (le dernier saisi) ; relevés invalides ignorés ; ordre chronologique', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-05-01', km: 1200 }, { d: '2026-02-01', km: 1000 }, { d: '2026-05-01', km: 1300 }, { d: 'x', km: 9 }, { d: '2026-06-01', km: -4 }, null] }, { today: T });
  assert.equal(JSON.stringify(r.readings.map(o => [o.d, o.km])), JSON.stringify([['2026-02-01', 1000], ['2026-05-01', 1300]]));
});
test('compteur qui recule : signalé, aucun total ni 12 mois calculé', () => {
  const r = G.odoTrend({ odo: [{ d: '2025-01-01', km: 9000 }, { d: '2025-06-01', km: 8000 }, { d: '2026-06-01', km: 12000 }] }, { today: T });
  assert.equal(r.nonMonotonic, true); assert.equal(r.totalKm, null); assert.equal(r.last12, null);
});
test('historique long (plus de 60 relevés) : tout est lu, rien n’est tronqué', () => {
  const odo = Array.from({ length: 300 }, (_, i) => ({ d: new Date(Date.parse('2020-01-06T00:00:00Z') + i * 7 * 864e5).toISOString().slice(0, 10), km: 1000 + i * 250 }));
  const r = G.odoTrend({ odo, odoGoal: { life: 1 } }, { today: T });
  assert.equal(r.count, 300); assert.equal(r.first.km, 1000); assert.equal(r.totalKm, 299 * 250);
});
test('immutabilité : la fiche n’est jamais modifiée', () => {
  const car = { odo: [{ d: '2026-05-01', km: 1300 }, { d: '2026-02-01', km: 1000 }], odoGoal: { km: 5000 } }, before = JSON.stringify(car);
  G.odoTrend(car, { today: T }); assert.equal(JSON.stringify(car), before);
});
console.log(`\n${n}/${n} contrôles « évolution du kilométrage »`);
