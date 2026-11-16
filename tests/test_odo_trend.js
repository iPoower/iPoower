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
// Relevé invraisemblable (constat du 16/11 sur valeurs FICTIVES) : un chiffre manquant au premier relevé.
const SUS = [{ d: '2026-10-18', km: 21100 }, { d: '2026-10-25', km: 211300 }, { d: '2026-11-01', km: 211650 }, { d: '2026-11-08', km: 212000 }, { d: '2026-11-15', km: 212350 }];
test('chiffre manquant : le relevé seul en cause est écarté des calculs, jamais retiré de la fiche', () => {
  const car = { odo: SUS.map(o => ({ ...o })), odoGoal: { km: 250000 } }, before = JSON.stringify(car);
  const r = G.odoTrend(car, { today: T });
  assert.equal(r.suspect.d, '2026-10-18'); assert.equal(r.suspect.km, 21100); assert.equal(r.nonMonotonic, false);
  assert.equal(r.count, 4); assert.equal(r.totalKm, 1050); assert.equal(r.first.d, '2026-10-25');
  assert.ok(r.pair.kmPerDay > 1500, 'saut chiffré'); assert.ok(r.kmPerDay > 40 && r.kmPerDay < 60, 'rythme réel sur les relevés fiables');
  assert.ok(r.target.eta, 'date d’objectif calculée sans le relevé faux');
  assert.equal(JSON.stringify(car), before, 'fiche intacte');
});
test('rythme de l’entretien : même série fiable (règle unique Garage.kmPerDay)', () => {
  assert.ok(G.kmPerDay(SUS) > 40 && G.kmPerDay(SUS) < 60);
  assert.equal(G.kmPerDay([{ d: '2026-10-18', km: 2520 }, { d: '2026-10-31', km: 252071 }]), null, 'deux relevés seulement : impossible de savoir lequel est faux');
});
test('chiffre en trop au dernier relevé : c’est lui qui est écarté', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-10-01', km: 50000 }, { d: '2026-10-15', km: 50600 }, { d: '2026-11-01', km: 51300 }, { d: '2026-11-14', km: 518500 }] }, { today: T });
  assert.equal(r.suspect.d, '2026-11-14'); assert.equal(r.last.km, 51300);
});
test('ambigu (aucune correction unique) : calculs suspendus, les deux relevés nommés', () => {
  const r = G.odoTrend({ odo: [{ d: '2026-10-01', km: 5000 }, { d: '2026-11-01', km: 90000 }] }, { today: T });
  assert.equal(r.suspect, null); assert.equal(r.nonMonotonic, true); assert.equal(r.totalKm, null); assert.equal(r.kmPerDay, null);
  assert.equal(r.pair.from.d, '2026-10-01'); assert.equal(r.pair.to.d, '2026-11-01');
});
test('nouveau relevé : saut > 1 500 km/j signalé par rapport aux relevés fiables (le relevé faux n’est pas la référence)', () => {
  const car = { odo: SUS.map(o => ({ ...o })) };
  assert.equal(G.kmJump(car, '2026-11-16', 212400), null, 'relevé normal');
  const j = G.kmJump(car, '2026-11-16', 21240); assert.equal(j, null, 'recul : traité par la chronologie, pas ici');
  const k = G.kmJump(car, '2026-11-16', 2124000); assert.equal(k.d, '2026-11-15'); assert.ok(k.kmPerDay > 1500);
  assert.equal(G.kmJump({ odo: [] }, '2026-11-16', 5000), null, 'premier relevé : rien à comparer');
});
test('boîte de dépôt : un compteur invraisemblable est refusé avec le relevé de référence nommé', () => {
  const ic = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error, isFinite }; vm.createContext(ic);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/inbox-core.js'), 'utf8') + ';this.I=RcInbox;', ic);
  const car = { id: 'a', name: 'Voiture test', tire: { type: 'summer' }, odo: SUS.map(o => ({ ...o })) };
  const deps = { kmJump: G.kmJump, switchTire: () => {}, setTreadAxle: () => {}, treadAxles: () => [], maxTreads: 60, addEntry: () => {} };
  assert.throws(() => ic.I.apply(car, { type: 'odometer', date: '2026-11-16', values: { km: 2124000 } }, deps), /km par jour.*15\/11\/2026/);
  const ok = ic.I.apply(car, { type: 'odometer', date: '2026-11-16', values: { km: 212400 } }, deps);
  assert.ok(ok.paths.includes('odo'));
});
console.log(`\n${n}/${n} contrôles « évolution du kilométrage »`);
