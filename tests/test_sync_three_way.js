'use strict';
// NOESIS 13.4 — fusion à trois voies : aucun choix par horloge entre appareils.
// Données fictives, aucun réseau ni stockage.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const read = f => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8');
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String }; vm.createContext(ctx);
vm.runInContext(read('journal-archive.js') + read('debrief.js') + read('sync-merge.js') + read('sync-revisions.js') + ';this.M=SyncMerge;this.R=SyncRevisions;', ctx);
const json = v => JSON.parse(JSON.stringify(v));
const M = { settings: (...a) => json(ctx.M.settings(...a)), values: (...a) => json(ctx.M.values(...a)) };
const R = { ancestor: (...a) => ctx.R.ancestor(...a) };
let n = 0; const check = (name, fn) => { try { fn(); n++; console.log('✅ ' + name); } catch (e) { console.error('❌ ' + name + ' · ' + e.message); throw e; } };
const T = Date.parse('2026-10-28T10:00:00+01:00'), MIN = 60000;
const id = c => c.repeat(32);
const car = (cid, extra = {}) => ({ id: cid, short: cid, tire: { type: 'summer', dot: '', treads: [] }, odo: [], ...extra });
const settings = (extra = {}) => ({ v: 1, configured: 1, cars: [car('voitureA')], calib: [], journal: {}, edits: {}, prefs: { pressure: 2.4, unit: 'bar' }, ...extra });

check('ancêtre commun : lignée linéaire, fourche, histoire incomplète ou ambiguë', () => {
  const g = [{ id: id('a'), parents: [] }, { id: id('b'), parents: [id('a')] }, { id: id('c'), parents: [id('b')] }, { id: id('d'), parents: [id('b')] }];
  assert.equal(R.ancestor(g, [id('c')], [id('d')]), id('b'), 'fourche : base = b');
  assert.equal(R.ancestor(g, [id('c')], [id('b')]), id('b'), 'descendant : base = tête distante');
  assert.equal(R.ancestor(g, [], [id('d')]), null, 'appareil sans base : aucune base');
  assert.equal(R.ancestor(g, [id('c')], [id('z')]), null, 'révision inconnue : aucune base');
  const x = [...g, { id: id('e'), parents: [id('c'), id('d')] }, { id: id('f'), parents: [id('c'), id('d')] }];
  assert.equal(R.ancestor(x, [id('e')], [id('f')]), null, 'croisement : deux ancêtres maximaux, aucune base devinée');
});

// Base commune : pression 2.4, horodatée à T. Chaque appareil part de cette base.
const baseStamps = { 'prefs.pressure': T };
check('horloge en AVANCE sur l’iPhone : deux modifications concurrentes ⇒ conflit, rien n’est écrasé', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const sPc = { 'prefs.pressure': T + 5 * MIN }, sTel = { 'prefs.pressure': T + 10 * MIN };   // iPhone modifié avant, horloge +10 min
  const r = M.settings(pc, tel, sPc, sTel, { base: baseStamps });
  assert.equal(r.settings.prefs.pressure, 2.6, 'la valeur de cet appareil reste');
  assert.deepEqual(r.report.conflicts, ['prefs.pressure'], 'conflit signalé');
  assert.deepEqual(r.report.fromRemote, []);
});
check('horloge en RETARD sur le PC : la valeur locale n’est plus préférée en silence', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const sPc = { 'prefs.pressure': T + 1 * MIN }, sTel = { 'prefs.pressure': T + 3 * MIN };
  const r = M.settings(tel, pc, sTel, sPc, { base: baseStamps });
  assert.deepEqual(r.report.conflicts, ['prefs.pressure']);
});
check('seul l’autre appareil a modifié depuis la base : sa valeur est reprise, même avec une horloge en retard', () => {
  const pc = settings(), tel = settings(); tel.prefs.pressure = 2.2;
  const r = M.settings(pc, tel, { ...baseStamps }, { 'prefs.pressure': T + 1 }, { base: baseStamps });
  assert.equal(r.settings.prefs.pressure, 2.2); assert.deepEqual(r.report.fromRemote, ['prefs.pressure']); assert.deepEqual(r.report.conflicts, []);
});
check('seul cet appareil a modifié depuis la base : sa valeur reste, même si l’autre horloge est très en avance', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6;
  const r = M.settings(pc, tel, { 'prefs.pressure': T + 1 }, { 'prefs.pressure': T }, { base: baseStamps });
  assert.equal(r.settings.prefs.pressure, 2.6); assert.deepEqual(r.report.conflicts, []); assert.deepEqual(r.report.fromRemote, []);
});
check('sans base connue : deux modifications horodatées divergentes ⇒ conflit (plus de victoire à l’horloge)', () => {
  const pc = settings(), tel = settings(); pc.prefs.unit = 'psi'; tel.prefs.unit = 'kPa';
  const r = M.settings(pc, tel, { 'prefs.unit': T + 9 * MIN }, { 'prefs.unit': T + 1 * MIN });
  assert.equal(r.settings.prefs.unit, 'psi'); assert.deepEqual(r.report.conflicts, ['prefs.unit']);
});
check('sans base connue : modification d’un seul côté (l’autre jamais horodaté) reprise comme avant', () => {
  const pc = settings(), tel = settings(); tel.prefs.unit = 'psi';
  const r = M.settings(pc, tel, {}, { 'prefs.unit': T });
  assert.equal(r.settings.prefs.unit, 'psi'); assert.deepEqual(r.report.conflicts, []);
});
check('chemins indépendants : aucun conflit, les deux modifications sont conservées', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.unit = 'psi';
  const r = M.settings(pc, tel, { 'prefs.pressure': T + MIN }, { 'prefs.unit': T + MIN }, { base: {} });
  assert.equal(r.settings.prefs.pressure, 2.6); assert.equal(r.settings.prefs.unit, 'psi'); assert.deepEqual(r.report.conflicts, []);
});
check('résolution explicite : « autre appareil » appliquée, horodatage relevé pour propager le choix', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const sPc = { 'prefs.pressure': T + 5 * MIN }, sTel = { 'prefs.pressure': T + 10 * MIN };
  const r = M.settings(pc, tel, sPc, sTel, { base: baseStamps, resolutions: { 'prefs.pressure': 'remote' } });
  assert.equal(r.settings.prefs.pressure, 2.2); assert.deepEqual(r.report.conflicts, []); assert.deepEqual(r.report.resolved, ['prefs.pressure']);
  assert(r.stamps['prefs.pressure'] > T + 10 * MIN, 'le choix est plus récent que les deux versions');
});
check('résolution explicite : « cet appareil » conservée et propagée', () => {
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const r = M.settings(pc, tel, { 'prefs.pressure': T + 5 * MIN }, { 'prefs.pressure': T + 10 * MIN }, { base: baseStamps, resolutions: { 'prefs.pressure': 'local' } });
  assert.equal(r.settings.prefs.pressure, 2.6); assert.deepEqual(r.report.conflicts, []); assert(r.stamps['prefs.pressure'] > T + 10 * MIN);
});
check('résolution : une liste de véhicules divergente n’est jamais remplacée par un simple choix', () => {
  const pc = settings(), tel = settings({ cars: [car('voitureA'), car('voitureB')] });
  const r = M.settings(pc, tel, {}, {}, { base: {}, resolutions: { cars: 'remote' } });
  assert.equal(r.settings.cars.length, 1); assert(r.report.conflicts.includes('cars'));
});
check('absence distante : jamais appliquée par déduction, seulement sur choix explicite', () => {
  const pc = settings(), tel = settings(); pc.prefs.note = 'saisie PC';
  const auto = M.settings(pc, tel, { 'prefs.note': T + 1 }, { 'prefs.note': T + 2 }, { base: {} });
  assert.equal(auto.settings.prefs.note, 'saisie PC'); assert.deepEqual(auto.report.conflicts, ['prefs.note']);
  const chosen = M.settings(pc, tel, { 'prefs.note': T + 1 }, { 'prefs.note': T + 2 }, { base: {}, resolutions: { 'prefs.note': 'remote' } });
  assert(!('note' in chosen.settings.prefs)); assert.deepEqual(chosen.report.resolved, ['prefs.note']);
});
check('parent horodaté une seule fois (création) : seuls les chemins enfants décident, pas de faux conflit', () => {
  const pc = settings(), tel = settings(); tel.prefs.pressure = 2.2;
  const base = { prefs: T }, r = M.settings(pc, tel, { prefs: T }, { prefs: T, 'prefs.pressure': T + 1 }, { base });
  assert.equal(r.settings.prefs.pressure, 2.2); assert.deepEqual(r.report.conflicts, []);
  const noBase = M.settings(pc, tel, { prefs: T }, { prefs: T, 'prefs.pressure': T + 1 });
  // Sans base, le 2.4 local a pu être saisi à la création du parent : prudence, l'enfant est en conflit,
  // mais le parent lui-même n'est plus un faux conflit.
  assert.equal(noBase.settings.prefs.pressure, 2.4); assert.deepEqual(noBase.report.conflicts, ['prefs.pressure']);
});
check('contre-expertise A1 : un parent horodaté dans le futur ne masque plus la modification d’un enfant', () => {
  // PC (horloge +60 min) crée l'objet notes ; l'iPhone l'intègre, puis les deux modifient notes.alert.
  const s0 = settings(), r1 = settings({ notes: { alert: 1 } }), st1 = json(ctx.M.edits(s0, r1, {}, T + 60 * MIN));
  const tel = settings({ notes: { alert: 2 } }), sTel = json(ctx.M.edits(r1, tel, st1, T + 5 * MIN));
  const pc = settings({ notes: { alert: 3 } }), sPc = json(ctx.M.edits(r1, pc, st1, T + 70 * MIN));
  const onTel = M.settings(tel, pc, sTel, sPc, { base: st1 }), onPc = M.settings(pc, tel, sPc, sTel, { base: st1 });
  assert.equal(onTel.settings.notes.alert, 2, 'iPhone garde sa valeur'); assert.deepEqual(onTel.report.conflicts, ['notes.alert']);
  assert.equal(onPc.settings.notes.alert, 3); assert.deepEqual(onPc.report.conflicts, ['notes.alert']);
});
check('values() : la base est lue dans les valeurs de l’ancêtre commun', () => {
  const v = (s, st) => ({ 'twrc.settings.v1': JSON.stringify(s), 'twrc.editstamps.v1': JSON.stringify(st) });
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const r = M.values(v(pc, { 'prefs.pressure': T + 5 * MIN }), v(tel, { 'prefs.pressure': T + 10 * MIN }), { base: v(settings(), baseStamps) });
  assert.deepEqual(r.report.settings.conflicts, ['prefs.pressure']);
  assert.equal(JSON.parse(r.values['twrc.settings.v1']).prefs.pressure, 2.6);
});
check('conflictValues : versions locale et distante consultables pour chaque chemin', () => {
  const v = s => ({ 'twrc.settings.v1': JSON.stringify(s) });
  const pc = settings(), tel = settings(); pc.prefs.pressure = 2.6; tel.prefs.pressure = 2.2;
  const out = json(ctx.M.conflictValues(v(pc), v(tel), ['prefs.pressure', 'cars', 'clé:twrc.x']));
  assert.deepEqual(out[0], { path: 'prefs.pressure', local: 2.6, remote: 2.2, resolvable: true });
  assert.equal(out[1].resolvable, false); assert.equal(out[2].resolvable, false);
});
console.log(`\n✅ ${n} contrôles de fusion à trois voies`);
