// Analyse · « Mon bilan » (16/11/2026) : projection pure, valeurs FICTIVES. Aucune donnée inventée, tri des échéances,
// km des 30 derniers jours, trajets et matins, calendrier des départs selon la monte, usure seulement avec deux mesures.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/bilan-core.js'), 'utf8') + ';this.B=Bilan;', c);
const B = c.B, json = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const T = '2026-11-16';
const car = x => ({ id: 'a', short: 'Voiture A', hasTires: true, plan: null, maintenance: {}, pressureDate: '2026-11-10', treadMm: 6, treadDate: '2026-11-01', treadEst: false, ...x });

test('date du jour exigée', () => assert.throws(() => B.todo([], 'hier')));
test('voiture à jour : rien à faire', () => assert.equal(B.todo([car()], T).length, 0));
test('pression : jamais contrôlée → à faire ; contrôle de plus de 30 j → bientôt', () => {
  assert.equal(json(B.todo([car({ pressureDate: null })], T))[0].sub, 'Aucun contrôle daté');
  const r = json(B.todo([car({ pressureDate: '2026-10-01' })], T))[0]; assert.equal(r.tone, 'soon'); assert.match(r.sub, /46 j/);
});
test('profondeur : jamais mesurée, estimée ou ancienne', () => {
  assert.match(json(B.todo([car({ treadMm: null })], T))[0].sub, /Jamais mesurée/);
  assert.match(json(B.todo([car({ treadEst: true })], T))[0].sub, /estimée/);
  assert.equal(json(B.todo([car({ treadDate: '2026-06-01' })], T))[0].tone, 'soon');
});
test('voiture sans pneus : aucune ligne pression ni profondeur', () => assert.equal(B.todo([car({ hasTires: false, pressureDate: null, treadMm: null })], T).length, 0));
test('montage hiver : compte à rebours, bientôt à 14 j, dépassé si passé', () => {
  const r = json(B.todo([car({ plan: { appointment: '2026-11-26', confirmed: false } })], T))[0];
  assert.equal(r.days, 10); assert.equal(r.tone, 'soon'); assert.match(r.sub, /à confirmer/); assert.equal(r.target, null);
  assert.equal(json(B.todo([car({ plan: { estimate: '2026-12-20' } })], T))[0].tone, 'info');
  assert.equal(json(B.todo([car({ plan: { estimate: '2026-11-10' } })], T))[0].tone, 'late');
});
test('compteur, révision, contrôle technique : mêmes règles que l’entretien du Garage', () => {
  const m = { odo: { due: true, last: { d: '2026-11-01' }, ageDays: 15, everyDays: 7 }, revision: { status: 'late', daysLeft: -3 }, ct: { next: null } };
  const r = json(B.todo([car({ maintenance: m })], T)).map(x => x.id + ':' + x.tone);
  assert.deepEqual(r, ['revision:late', 'odo:soon', 'ct:todo']);
  const ok = json(B.todo([car({ maintenance: { odo: { due: false, last: { d: T }, ageDays: 2, everyDays: 7 } } })], T))[0];
  assert.equal(ok.tone, 'info'); assert.equal(ok.days, 5);
});
test('tri : en retard, bientôt (le plus proche d’abord), à faire, information', () => {
  const r = json(B.todo([car({ id: 'a', pressureDate: null, plan: { appointment: '2026-11-20' } }), car({ id: 'b', maintenance: { revision: { status: 'late', daysLeft: -1 } } })], T));
  assert.deepEqual(r.map(x => x.tone), ['late', 'soon', 'todo']);
});
const trend = readings => ({ readings, nonMonotonic: false });
test('30 derniers jours : interpolé quand un relevé précède la fenêtre', () => {
  const w = json(B.kmWindow(trend([{ d: '2026-10-01', km: 180000 }, { d: '2026-10-26', km: 181000 }, { d: '2026-11-14', km: 182500 }]), T, 30));
  assert.equal(w.km, 1860); assert.equal(w.from, '2026-10-17'); assert.equal(w.partial, false);
});
test('30 derniers jours : partiel et daté sans relevé avant la fenêtre ; rien avec un seul relevé', () => {
  const w = json(B.kmWindow(trend([{ d: '2026-11-01', km: 1000 }, { d: '2026-11-15', km: 1700 }]), T, 30));
  assert.equal(w.km, 700); assert.equal(w.from, '2026-11-01'); assert.equal(w.partial, true);
  assert.equal(B.kmWindow(trend([{ d: '2026-11-15', km: 1700 }]), T, 30), null);
  assert.equal(B.kmWindow({ readings: [{ d: '2026-11-01', km: 1 }, { d: '2026-11-02', km: 2 }], nonMonotonic: true }, T, 30), null);
});
test('trajets : 30 jours, cette voiture, annulés exclus, pluie observée sinon prévue', () => {
  const now = Date.parse('2026-11-16T12:00:00Z'), at = d => now - d * 864e5;
  const e = [{ at: at(2), start: { carId: 'a', prediction: { conditions: ['rain'] } } }, { at: at(3), start: { carId: 'a', prediction: { conditions: ['rain'] } }, feedback: { conditions: [] } },
    { at: at(4), start: { carId: 'a' }, feedback: { conditions: ['wet'] } }, { at: at(5), start: { carId: 'b' } }, { at: at(40), start: { carId: 'a' } }, { at: at(1), start: { carId: 'a' }, cancelledAt: at(1) }];
  const r = json(B.trips(e, 'a', now, 30)); assert.equal(r.count, 3); assert.equal(r.wet, 2);
});
test('matins : journal de saison des 30 derniers jours (T < 5 °C, verglas ≥ 1)', () => {
  const r = json(B.mornings({ '2026-11-15': { T: 3, ice: 1 }, '2026-11-10': { T: 8, ice: 0 }, '2026-10-01': { T: 0, ice: 2 }, x: { T: 1 } }, T, 30));
  assert.deepEqual(r, { days: 2, cold: 1, frost: 1 });
});
test('calendrier (Pneus V2) : gomme au départ dans la fenêtre de saison, aucune marche à 7 °C, hiver ≥ 20 °C, sans fenêtre inconnu', () => {
  const W = { summer: [10, 20, 50, 65], allseason: [5, 15, 45, 60], winter: [-5, 5, 35, 50] };   // TL_WIN du laboratoire
  const src = /const TL_WIN = (\{[^}]+\});/.exec(fs.readFileSync(path.join(__dirname, '../src/tyrelab.js'), 'utf8'));
  assert(src, 'TL_WIN introuvable dans tyrelab.js'); assert.equal(JSON.stringify(vm.runInNewContext('(' + src[1] + ')')), JSON.stringify(W), 'mêmes fenêtres que le laboratoire');
  const lv = (t, T) => B.morningLevel(W[t], t, T);
  assert.deepEqual([lv('summer', 9.9), lv('summer', 10), lv('summer', 20)], ['cold', 'limit', 'ok']);
  assert.equal(lv('summer', 6.95), lv('summer', 7.05), 'aucune discontinuité à 7 °C');
  assert.deepEqual([lv('allseason', 4), lv('allseason', 8), lv('allseason', 15)], ['cold', 'limit', 'ok']);
  assert.deepEqual([lv('winter', -6), lv('winter', 0), lv('winter', 8), lv('winter', 20)], ['cold', 'limit', 'ok', 'warm']);
  assert.equal(B.morningLevel(null, 'unknown', 8), 'unknown'); assert.equal(lv('summer', null), 'unknown');
  const cal = json(B.calendar([{ date: '2026-11-19', T: 2 }, { date: '2026-11-20', T: 12 }, { date: '2026-11-21', T: null }, { date: '2026-11-22', T: 21 }], 'summer', W.summer));
  assert.equal(cal.cold, 1); assert.equal(cal.limit, 1); assert.equal(cal.warm, 0); assert.equal(cal.rows[2].level, 'unknown'); assert.equal(cal.rows[3].level, 'ok');
  assert.equal(json(B.calendar([{ date: '2026-07-01', T: 24 }], 'winter', W.winter)).warm, 1);
  assert.equal(json(B.calendar(Array.from({ length: 20 }, (_, i) => ({ date: '2026-12-' + String(i + 1).padStart(2, '0'), T: 9 })), 'summer', W.summer)).rows.length, 14);
});
test('usure : date seulement avec la projection existante ; sinon ce qu’il manque', () => {
  assert.equal(json(B.wear({ dateThr: '2027-05-01', kmThr: 210000, kmLegal: 230000, thr: 3, rate: 0.05 })).kind, 'projection');
  assert.equal(json(B.wear({ kmThr: 210000, thr: 3, rate: 0.05 })).kind, 'km');
  assert.equal(json(B.wear({ last: { mm: 6.2, d: '2026-11-01' }, thr: 3 })).kind, 'one');
  assert.equal(json(B.wear({ thr: 3 })).kind, 'none');
});
console.log(`\n${n}/${n} contrôles « Mon bilan »`);
