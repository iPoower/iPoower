// Trajets imprévus (20/11/2026), valeurs FICTIVES : module pur RcLoans (liste fermée et bornée, voiture occupée, aller/retour).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/loan-core.js'), 'utf8') + ';this.L=RcLoans;', c);
const L = c.L, json = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const NOW = Date.parse('2026-11-16T14:00:00Z'), A = { id: 'home', name: 'Lieu A', lat: 49.2, lon: 2.58 }, C = { name: 'Lieu C', lat: 49.6, lon: 2.9, address: '1 rue test' };
const base = { id: 'loan-abc123', carId: 'carB', driver: 'Conducteur B', from: A, to: C, dep: '2026-11-16T14:05', ret: '2026-11-16T18:30', back: null, at: NOW };
test('entrée complète conservée, champs fermés, coordonnées arrondies', () => {
  const x = json(L.clean([{ ...base, from: { ...A, lat: 49.2000004 } }], ['carA', 'carB'], NOW));
  assert.equal(x.length, 1); assert.equal(x[0].driver, 'Conducteur B'); assert.equal(x[0].from.lat, 49.2); assert.deepEqual(Object.keys(x[0]).sort(), ['at', 'back', 'carId', 'dep', 'driver', 'from', 'id', 'ret', 'to']);
});
test('refus : voiture inconnue, conducteur vide ou balisé, coordonnée hors bornes, heure invalide, retour avant le départ, champ en double', () => {
  const bad = [{ ...base, carId: 'carZ' }, { ...base, id: 'loan-a2', driver: ' ' }, { ...base, id: 'loan-a3', driver: '<img>' }, { ...base, id: 'loan-a4', to: { ...C, lat: 91 } },
    { ...base, id: 'loan-a5', dep: '16/11 14:05' }, { ...base, id: 'loan-a6', ret: '2026-11-16T13:00' }, { ...base, id: 'bad id' }, base, base];
  const x = json(L.clean(bad, ['carA', 'carB'], NOW));
  assert.deepEqual(x.map(v => v.id), ['loan-abc123']);
});
test('purge : rentré depuis plus de 48 h ou ouvert depuis plus de 7 jours retiré ; 10 au plus', () => {
  const old = { ...base, id: 'loan-old1', back: NOW - 49 * 3600e3 }, fresh = { ...base, id: 'loan-new1', back: NOW - 3600e3 }, stale = { ...base, id: 'loan-old2', at: NOW - 8 * 864e5 };
  assert.deepEqual(json(L.clean([old, fresh, stale], ['carB'], NOW)).map(v => v.id), ['loan-new1']);
  const many = Array.from({ length: 14 }, (_, i) => ({ ...base, id: 'loan-m' + String(i).padStart(3, '0') }));
  assert.equal(L.clean(many, ['carB'], NOW).length, 10);
});
test('voiture occupée : départ passé ou dans 30 min, jamais un jour à l’avance ; plus occupée une fois rentrée', () => {
  assert.equal(L.busy([base], 'carB', '2026-11-16T14:00').id, 'loan-abc123');
  assert.equal(L.busy([{ ...base, dep: '2026-11-16T15:00' }], 'carB', '2026-11-16T14:00'), null);
  assert.equal(L.busy([{ ...base, back: NOW }], 'carB', '2026-11-16T14:30'), null);
  assert.equal(L.busy([base], 'carA', '2026-11-16T14:30'), null);
});
test('trajets : aller puis retour (sens inverse), clés stables ; sans heure de retour, aller seul', () => {
  const g = json(L.legs(base));
  assert.deepEqual(g.map(x => [x.k, x.key, x.dep, x.from.name, x.to.name]), [['go', 'loan|loan-abc123|go', '2026-11-16T14:05', 'Lieu A', 'Lieu C'], ['ret', 'loan|loan-abc123|ret', '2026-11-16T18:30', 'Lieu C', 'Lieu A']]);
  assert.equal(L.legs({ ...base, ret: null }).length, 1);
});
test('création : identifiant dérivé de l’heure, saisie incomplète refusée (jamais réparée)', () => {
  const x = json(L.make({ carId: 'carB', driver: ' Conducteur B ', from: A, to: C, dep: '2026-11-16T14:05', ret: null }, NOW));
  assert.match(x.id, /^loan-[a-z0-9]+$/); assert.equal(x.driver, 'Conducteur B'); assert.equal(x.back, null);
  assert.throws(() => L.make({ carId: 'carB', driver: 'B', from: A, to: { name: 'C' }, dep: '2026-11-16T14:05' }, NOW));
  assert.throws(() => L.make({ carId: 'carB', driver: '', from: A, to: C, dep: '2026-11-16T14:05' }, NOW));
});
console.log(`\n${n}/${n} contrôles « trajets imprévus »`);
