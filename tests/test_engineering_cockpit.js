'use strict';
// Oracle de projection des preuves : aucun profil ni réseau réel.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { URL }; vm.createContext(ctx);
vm.runInContext(['tyre-evidence', 'tyre-intelligence', 'engineering-cockpit'].map(f => fs.readFileSync(path.join(__dirname, '../src/app', f + '.js'), 'utf8')).join('\n') + ';this.TI=TyreIntelligence;this.EC=EngineeringCockpit;', ctx);
const json = v => JSON.parse(JSON.stringify(v));
const make = (tire = {}, weather = {}) => ctx.TI.analyse({ car: { tire: { type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 R18 89Y XL', ...tire } }, today: '2026-10-19', weather });
const evidence = make({ treadAv: 4, treadAr: 5, treadEst: 0, pchk: { date: '2026-10-18', av: 2.3, ar: 2.4 } });
const before = JSON.stringify(evidence), r = json(ctx.EC.build(evidence));
assert.equal(JSON.stringify(evidence), before);
assert.deepEqual(r.domains.map(x => x.id), ['acceleration', 'braking', 'cornering', 'stability', 'aquaplaning', 'tyres']);
assert.equal(r.version, '1.2');
for (const d of r.domains) for (const x of d.items) {
  assert(Object.hasOwn(ctx.EC.TYPES, x.kind)); assert(x.label); assert(x.value); assert(x.source); assert(x.limit);
  assert(Object.hasOwn(x, 'date'));
}
for (const id of ['acceleration', 'stability']) assert.equal(r.domains.find(x => x.id === id).kind, 'unknown');
const braking = r.domains.find(x => x.id === 'braking');
assert.equal(braking.items[0].kind, 'unknown');
assert(braking.items.some(x => x.value === '35,52 m' && x.kind === 'documented' && /historique/.test(x.limit) && /225\/40/.test(x.source)));
const aqua = r.domains.find(x => x.id === 'aquaplaning');
assert(aqua.items.some(x => x.label.includes('longitudinal'))); assert(aqua.items.some(x => x.label.includes('transversal')));
const tyre = r.domains.find(x => x.id === 'tyres');
assert.equal(tyre.kind, 'measured'); assert.equal(tyre.items.length, 4);
assert(tyre.items.filter(x => x.label.startsWith('Profondeur')).every(x => x.date === null), 'une valeur scalaire ne reçoit pas une date inventée');
const est = json(ctx.EC.build(make({ tread: 4, treadEst: 1 })));
assert.equal(est.domains.find(x => x.id === 'tyres').kind, 'estimated');
const none = json(ctx.EC.build(make({ type: 'none', tread: 4, pchk: { av: 2.3, ar: 2.4 } })));
assert(none.domains.every(x => x.kind === 'unknown'), 'aucune preuve du projet ou d’une monte non active');
for (const tire of [{ brand: 'Inconnu', model: '?' }, { size: '' }]) {
  const d = json(ctx.EC.build(make(tire))); assert.equal(d.domains.length, 6);
  assert.equal(d.domains[0].kind, 'unknown');
}
assert(!Object.keys(r).some(x => /score|mu|brakingNow/i.test(x)));
console.log('✅ Engineering Cockpit : six domaines, provenance, inconnues, essais distincts et absence de mutation');
