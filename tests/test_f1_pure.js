// F1 Pure : pas de source concurrente, résultats prudents et fonctions sans effets.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../src/f1-pure.js'), 'utf8');
const ctx = { Number, Array, Object, Math, JSON, Set };
vm.createContext(ctx); vm.runInContext(source + ';this.F1 = F1Pure;', ctx);
const F = ctx.F1, plain = v => JSON.parse(JSON.stringify(v));
let n = 0;
const check = (label, fn) => { fn(); console.log('✅ ' + label); n++; };
check('six extensions déclarées sans onglet supplémentaire et identifiants uniques', () => {
  assert.equal(F.FEATURES.length, 6);
  assert.equal(new Set(F.FEATURES.map(x => x.id)).size, 6);
  assert(F.FEATURES.every(x => ['pneus','meteo','trajet','analyse'].includes(x.view)));
});
check('Race Engineer sans source -> ne propose pas de départ rassurant', () => {
  const x = F.raceEngineer(); assert.equal(x.state, 'indisponible'); assert(!/conduire sans risque/i.test(x.lines.join(' ')));
});
check('Race Engineer : confiance dégradée prime sur météo rassurante', () => {
  const x = F.raceEngineer({ decision: { displayLevel: 0, reason: 'RAS' }, confidence: { level: 2, label: 'DÉGRADÉ', reason: 'Météo trop ancienne' } });
  assert.equal(x.state, 'prudence'); assert.match(x.action, /actualiser/); assert.match(x.lines.join(' '), /Météo trop ancienne/);
});
check('Race Engineer : danger refuse tout feu vert, destination sans altération', () => {
  const t = { to: 'Lieu test', dep: '2026-10-10T18:00' }, before = JSON.stringify(t);
  const x = F.raceEngineer({ decision: { displayLevel: 3, reason: 'Verglas' }, confidence: { level: 0, label: 'SOLIDE' }, trip: t });
  assert.match(x.action, /Danger/); assert.match(x.lines.join(' '), /Verglas/); assert.equal(JSON.stringify(t), before);
});
check('Track Conditions : aucun faux secteur si prévisions absentes ou périmées', () => {
  assert.equal(F.trackConditions([]).available, false);
  assert.equal(F.trackConditions([{ hs: [{ Tr: 1 }], i: 0 }], { ageMin: 91 }).available, false);
});
check('Track Conditions : maximum 3 secteurs, ordre et pire danger cohérents', () => {
  const samples = [{ P: 0, Tr: 7 }, { P: 0.6, Tr: 2 }, { vis: 80 }, { ice: { level: 2 } }, { snow: 0.2 }, { Tr: 8 }];
  const seq = samples.map(x => ({ hs: [x], i: 0 })), before = JSON.stringify(seq);
  const x = F.trackConditions(seq, { ageMin: 3 });
  assert.equal(x.sectors.length, 3);
  assert.equal(x.sectors[1].level, 3);
  assert.equal(x.sectors[0].level, 1);
  assert.equal(x.sectors[2].level, 2);
  assert.equal(JSON.stringify(seq), before);
});
check('Tyre Management : aucun calcul de kilométrage ou usure en absence de relevés', () => {
  const empty = F.tyreManagement(null);
  assert.equal(empty.available, false);
  const state = { active: { label: 'Été' }, tread: { mm: null }, pressure: { target: null }, mount: {}, maint: [] };
  const result = F.tyreManagement(state); assert(result.lines.some(x => /non mesurée/.test(x)));
  assert(!/km/.test(result.lines.join(' ')));
});
check('Tyre Management : étiquette mesuré vs estimé conservée', () => {
  const state = { active: { label: 'Hiver' }, tread: { mm: 3.2, est: true }, pressure: { target: 2.4 }, mount: { kmSince: 1200 }, maint: [] };
  const x = F.tyreManagement(state); assert.match(x.lines.join(' '), /estimée/);
  assert.match(x.lines.join(' '), /1 200|1200/);
});
check('Strategy A/B : deux voitures évaluées sur le même trajet, aucune route inventée', () => {
  const trip = { res: [{ c: { id: 'x', name: 'Voiture X' }, w: { level: 2 } }, { c: { id: 'y', name: 'Voiture Y' }, w: { level: 0 } }] };
  const src = JSON.stringify(trip), x = F.strategyAB(trip, 'x');
  assert.equal(x.available, true); assert.deepEqual(plain(x.choices.map(c => c.scenario)), ['A', 'B']);
  assert.deepEqual(plain(x.choices.map(c => c.level)), [2, 0]);
  assert.match(x.reason, /Même origine/); assert.equal(JSON.stringify(trip), src);
  assert.equal(F.strategyAB({ res: [trip.res[0]] }, 'x').available, false);
});
check('The Garage : données enregistrées uniquement, sans inventer une maintenance', () => {
  const x = F.theGarage([{ short: 'Voiture test', tire: {}, odo: [] }]);
  assert.equal(x.cars[0].odo, null); assert.match(x.cars[0].tyre, /non renseigné/);
});
check('Telemetry Replay : aucun calcul de vitesse ou télémétrie physique ajouté', () => {
  const x = F.telemetryReplay([{ name: 'Essai', at: 99, feedback: { conditions: ['fog'] }, start: null, end: null }], () => ({ kind: 'unknown' }));
  assert.equal(x.available, true);
  assert.match(x.lines.join(' '), /Prévision non comparable/);
  assert.match(x.note, /aucune télémétrie/);
  assert.equal(F.telemetryReplay([]).available, false);
});
console.log(n + '/' + n + ' scénarios F1 Pure réussis');
