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
const critical = json(ctx.EC.build(make({ tread: 1.59, treadEst: 0 }, { samples: [], ageMin: 180, offline: true })));
assert.equal(critical.diagnostics.entries[0].id, 'critical-depth', 'le risque documenté précède toutes les lacunes, même sans météo');
assert(critical.diagnostics.entries[0].reference.url.includes('legifrance.gouv.fr'));
assert.equal(critical.diagnostics.weather.state, 'INDISPONIBLE'); assert(critical.diagnostics.weather.offline);
assert(critical.diagnostics.weather.values.every(x => x.kind === 'unknown'));
assert(!json(ctx.EC.build(make({ tread: 1.6 }))).diagnostics.entries.some(x => x.id === 'critical-depth'));
const estimatedRisk = json(ctx.EC.build(make({ tread: 1.5, treadEst: 1 })));
assert(estimatedRisk.diagnostics.entries.some(x => x.id === 'estimated-critical-depth' && x.state === 'Vigilance'));
assert(!estimatedRisk.diagnostics.entries.some(x => x.id === 'critical-depth'));
const zero = json(ctx.EC.build(make({ pchk: { date: '2026-10-18', av: 0, ar: 2.3 } })));
assert.equal(zero.diagnostics.entries[0].id, 'zero-pressure');
assert(zero.diagnostics.entries[0].reference.url.includes('michelin.fr'));
const oldZero = json(ctx.EC.build(make({ pchk: { date: '2025-01-01', av: 0, ar: 2.3 } })));
assert(oldZero.diagnostics.entries.some(x => x.id === 'historical-zero-pressure' && x.state === 'Vigilance'));
assert(!oldZero.diagnostics.entries.some(x => x.id === 'zero-pressure'));
for (const ageMin of [null, -1, 61, 180]) {
  const z = json(ctx.EC.build(make({}, { samples: [{ t: '2026-10-19T10:00', T: 5.1, Tr: 4.6, Pl: 1 }], ageMin, source: 'Prévision fictive' })));
  assert.equal(z.diagnostics.weather.state, 'ANCIENNE OU NON DATÉE');
  assert(!z.diagnostics.entries.some(x => x.id === 'rain-context'));
}
assert.equal(json(ctx.EC.build(make({}, { samples: [{ t: '2026-10-19T10:00', T: 5.1, Tr: 4.6 }], ageMin: 60 }))).diagnostics.weather.state, 'PRÉVISIONS RÉCENTES');
const boundary = json(ctx.EC.build(make({}, { samples: [{ t: '2026-10-19T10:00', T: 5.1, Tr: 4.6 }], ageMin: 60.1 })));
assert.equal(boundary.diagnostics.weather.state, 'ANCIENNE OU NON DATÉE'); assert.equal(boundary.diagnostics.weather.ageMin, 61);
assert.equal(boundary.diagnostics.weather.values[0].value, '5 à 6 °C');
const doc = braking.items.find(x => x.kind === 'documented');
assert(doc.url.startsWith('https://www.tyrereviews.com/')); assert.equal(doc.checkedOn, '2026-10-18');
// Une même épreuve contradictoire garde ses deux valeurs, sans conclusion.
vm.runInContext('this.catalog=TYRE_TEST_EVIDENCE;', ctx);
const catalog = json(ctx.catalog), duplicate = json(catalog.tests[0]); duplicate.id = 'source-divergente'; duplicate.metrics[0].value = 100;
catalog.tests.push(duplicate);
const conflict = json(ctx.EC.build(ctx.TI.analyse({ car: { tire: { type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 R18' } }, today: '2026-10-19' }, catalog)));
assert(conflict.diagnostics.entries.some(x => x.id === 'source-conflict'));
assert(conflict.domains.find(x => x.id === 'braking').items.filter(x => x.label === 'Freinage sec').every(x => /conclusion suspendue/.test(x.limit)));
console.log('✅ Engineering Cockpit : six domaines, provenance, inconnues, essais distincts et absence de mutation');
// Régression de contexte : vrai initialiseur du brouillon, aucune persistance.
const tripSource = fs.readFileSync(path.join(__dirname, '../src/app/trip-view.js'), 'utf8');
const day = { activeCarId: 'a', nextDestination: null }, tripCtx = { appDay: () => day, S: { cars: [{ id: 'a' }, { id: 'b' }] },
  localTs: () => '2026-10-19T10:00', tripRecommendedOrigin: () => ({ mode: 'place-a', point: { id: 'place-a' } }) };
vm.createContext(tripCtx);
vm.runInContext(tripSource.slice(tripSource.indexOf('const TRIP_FORM'), tripSource.indexOf('function tripPoint')) +
  tripSource.slice(tripSource.indexOf('function tripDraftInit'), tripSource.indexOf('function tripCaptureForm')) + ';this.init=tripDraftInit;this.form=TRIP_FORM;', tripCtx);
tripCtx.init(); const form = tripCtx.form;
form.destinationQuery = 'Lieu fictif B'; form.originQuery = 'Lieu fictif A'; form.when = 'later'; form.time = '14:30'; form.carId = 'b';
tripCtx.init(); assert.equal(form.carId, 'b', 'choix du brouillon conservé sans changement global');
form.carId = 'a'; day.activeCarId = 'b'; tripCtx.init(); assert.equal(form.carId, 'b', 'nouveau choix global répercuté');
assert.equal(form.destinationQuery, 'Lieu fictif B'); assert.equal(form.originQuery, 'Lieu fictif A'); assert.equal(form.when, 'later'); assert.equal(form.time, '14:30');
console.log('✅ Véhicule global répercuté dans Trajet, départ/destination/horaire du brouillon conservés');
