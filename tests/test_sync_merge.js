'use strict';
// Fusion PC ↔ iPhone (étape 1) : moteur pur, données entièrement fictives, aucun réseau ni stockage.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const read = f => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8');
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String }; vm.createContext(ctx);
vm.runInContext(read('journal-archive.js') + read('debrief.js') + read('sync-merge.js') + ';this.M=SyncMerge;this.J=JournalArchive;', ctx);
const json = v => JSON.parse(JSON.stringify(v));
// Résultats recopiés hors du contexte vm : comparaison stricte sans écart de prototypes.
const M = { settings: (...a) => json(ctx.M.settings(...a)), values: (...a) => json(ctx.M.values(...a)) };
const J = { KEY: ctx.J.KEY, capture: v => json(ctx.J.capture(v)), read: v => json(ctx.J.read(v)) };
let n = 0; const check = (name, fn) => { try { fn(); n++; console.log('✅ ' + name); } catch (e) { console.error('❌ ' + name + ' · ' + e.message); throw e; } };
const T = Date.parse('2026-10-20T08:00:00+02:00');
const trip = (key, dt, extra = {}) => ({ key, at: T + dt, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B', start: null, end: null, feedback: null, deferred: false, ...extra });   // forme normalisée, comme dans l'appli
const car = (id, extra = {}) => ({ id, short: id, tire: { type: 'summer', dot: '', treads: [] }, odo: [], ...extra });
const settings = (extra = {}) => ({ v: 1, configured: 1, cars: [car('voitureA'), car('voitureB')], calib: [], journal: {}, edits: {}, ...extra });
function device({ s = settings(), stamps = null, entries = [], done = {}, extra = {} } = {}) {
  const values = { 'twrc.settings.v1': JSON.stringify(s), 'twrc.context.v1': JSON.stringify({ v: 1, dayContext: { activeCarId: 'voitureA' }, debrief: { active: null, entries }, done }),
    'twrc.gps': JSON.stringify({ lat: 1, lon: 2 }), 'twrc.cache.lieuA': '{"t":1}', ...extra };
  if (stamps) values['twrc.editstamps.v1'] = JSON.stringify(stamps);
  values[J.KEY] = JSON.stringify(J.capture(values));
  return values;
}
const out = r => ({ s: JSON.parse(r.values['twrc.settings.v1']), c: JSON.parse(r.values['twrc.context.v1']), a: J.read(r.values[J.KEY]) });

check('journal : un trajet saisi sur chaque appareil, les deux restent des deux côtés', () => {
  const pc = device({ entries: [trip('trajet-pc', 0)] }), phone = device({ entries: [trip('trajet-tel', 60000)] });
  const a = out(M.values(pc, phone)), b = out(M.values(phone, pc));
  assert.deepEqual(a.c.debrief.entries.map(e => e.key).sort(), ['trajet-pc', 'trajet-tel']);
  assert.deepEqual(a.a.records, b.a.records, 'les deux appareils convergent vers la même archive');
  assert.equal(a.a.records.length, 2);
});
check('journal : deux réponses au même trajet conservées dans l’archive, jamais d’écrasement', () => {
  const pc = device({ entries: [trip('meme', 0, { feedback: { at: T + 1000, conditions: ['rain'], grip: 'normal' } })] });
  const phone = device({ entries: [trip('meme', 0, { feedback: { at: T + 2000, conditions: ['fog'], grip: 'reduced' } })] });
  const r = out(M.values(pc, phone));
  assert.equal(r.a.records.length, 2, 'les deux versions restent dans l’archive cumulative');
  assert(r.a.records.some(x => x.includes('rain')) && r.a.records.some(x => x.includes('fog')));
});
check('relevés : compteur et profondeurs saisis sur chaque appareil, union par voiture (id, pas position)', () => {
  const pc = settings({ cars: [car('voitureA', { odo: [{ d: '2026-10-10', km: 1000 }], tire: { type: 'summer', treads: [{ d: '2026-10-10', mm: 5, ax: 'av' }] } }), car('voitureB')] });
  const tel = settings({ cars: [car('voitureA', { odo: [{ d: '2026-10-10', km: 1000 }, { d: '2026-10-18', km: 1700 }], tire: { type: 'summer', treads: [{ d: '2026-10-18', mm: 4.8, ax: 'av' }] } }), car('voitureB')] });
  const r = M.settings(pc, tel, {}, {});
  assert.deepEqual(r.settings.cars[0].odo, [{ d: '2026-10-10', km: 1000 }, { d: '2026-10-18', km: 1700 }]);
  assert.equal(r.settings.cars[0].tire.treads.length, 2); assert.equal(r.report.added.odo, 1); assert.equal(r.report.added.treads, 1);
});
check('réglage : la modification la plus récente gagne, des deux côtés, horodatages fusionnés', () => {
  const pc = settings({ edits: { 'cars.0.tire.dot': 1 } }), tel = settings({ edits: { 'cars.0.tire.dot': 1 } });
  pc.cars[0].tire.dot = '2124'; tel.cars[0].tire.dot = '3924';
  const sPc = { 'cars.0.tire.dot': T + 5000 }, sTel = { 'cars.0.tire.dot': T + 1000 };
  const a = M.settings(pc, tel, sPc, sTel), b = M.settings(tel, pc, sTel, sPc);
  assert.equal(a.settings.cars[0].tire.dot, '2124'); assert.equal(b.settings.cars[0].tire.dot, '2124');
  assert.deepEqual(b.report.fromRemote, ['cars.0.tire.dot']); assert.equal(b.stamps['cars.0.tire.dot'], T + 5000);
});
check('réglage : sans preuve de fraîcheur, la valeur de cet appareil reste et le conflit est signalé', () => {
  const pc = settings({ edits: { 'work.dep': 1 }, work: { dep: '06:30' } }), tel = settings({ edits: { 'work.dep': 1 }, work: { dep: '07:00' } });
  const r = M.settings(pc, tel, {}, {});
  assert.equal(r.settings.work.dep, '06:30'); assert.deepEqual(r.report.conflicts, ['work.dep']); assert.deepEqual(r.report.fromRemote, []);
});
check('réglage parent puis enfant : chaque chemin suit son propre horodatage', () => {
  const pc = settings({ edits: { 'cars.0.tire': 1, 'cars.0.tire.dot': 1 } }), tel = settings({ edits: { 'cars.0.tire': 1 } });
  pc.cars[0].tire = { type: 'summer', brand: 'Marque A', dot: '1111', treads: [] }; tel.cars[0].tire = { type: 'winter', brand: 'Marque B', dot: '2222', treads: [] };
  const r = M.settings(pc, tel, { 'cars.0.tire': T, 'cars.0.tire.dot': T + 9000 }, { 'cars.0.tire': T + 5000 });
  assert.equal(r.settings.cars[0].tire.brand, 'Marque B', 'monte plus récente sur l’autre appareil');
  assert.equal(r.settings.cars[0].tire.dot, '1111', 'DOT modifié plus tard ici : il reste');
});
check('voitures dans un ordre différent : aucun réglage croisé, conflit signalé', () => {
  const pc = settings({ edits: { 'cars.0.short': 1 } }), tel = settings({ cars: [car('voitureB'), car('voitureA')], edits: { 'cars.0.short': 1 } });
  tel.cars[0].short = 'Renommée';
  const r = M.settings(pc, tel, {}, { 'cars.0.short': T + 9000 });
  assert.equal(r.settings.cars[0].short, 'voitureA'); assert.deepEqual(r.report.conflicts, ['cars', 'cars.0.short']);
});
check('état de l’appareil (GPS, caches, contexte du jour) jamais importé de l’autre appareil', () => {
  const pc = device(), tel = device({ extra: { 'twrc.gps': '{"lat":9,"lon":9}', 'twrc.cache.lieuB': '{"t":2}', 'twrc.place.v1': '{"x":1}', 'twrc.key': 'cle-fictive' } });
  const telCtx = JSON.parse(tel['twrc.context.v1']); telCtx.dayContext = { activeCarId: 'voitureB' }; tel['twrc.context.v1'] = JSON.stringify(telCtx);
  const r = M.values(pc, tel).values;
  assert.equal(r['twrc.gps'], pc['twrc.gps']); assert.equal(r['twrc.cache.lieuB'], undefined); assert.equal(r['twrc.place.v1'], undefined); assert.equal(r['twrc.key'], undefined);
  assert.equal(JSON.parse(r['twrc.context.v1']).dayContext.activeCarId, 'voitureA');
});
check('clé inconnue : jamais importée automatiquement, écart signalé', () => {
  const pc = device({ extra: { 'twrc.future.a': 'local' } }), tel = device({ extra: { 'twrc.future.a': 'distant', 'twrc.future.b': 'nouveau' } });
  const r = M.values(pc, tel);
  assert.equal(r.values['twrc.future.a'], 'local'); assert.equal(r.values['twrc.future.b'], undefined);
  assert.deepEqual(r.report.keysKept, ['twrc.future.a', 'twrc.future.b']); assert(!r.report.keysAdded.includes('twrc.future.b'));
});
check('trajets clos : par identifiant, l’enregistrement le plus récent, aucun perdu', () => {
  const pc = device({ done: { a: { at: T, how: 'confirmé' }, b: { at: T + 10, how: 'auto' } } }), tel = device({ done: { b: { at: T + 99, how: 'confirmé' }, c: { at: T, how: 'auto' } } });
  const d = out(M.values(pc, tel)).c.done;
  assert.deepEqual(Object.keys(d).sort(), ['a', 'b', 'c']); assert.equal(d.b.how, 'confirmé');
});
check('observations hors capacité : refus intégral, aucune suppression de la copie source', () => {
  for (const [key, limit] of [['twrc.reports.v1', 30], ['twrc.shadow.v1', 200]]) {
    const rows = Array.from({ length: limit }, (_, i) => ({ at: T + i }));
    const pc = device({ extra: { [key]: JSON.stringify(rows) } });
    const tel = device({ extra: { [key]: JSON.stringify([{ at: T + limit }]) } });
    const before = JSON.stringify([pc, tel]);
    assert.throws(() => M.values(pc, tel), /sans perte impossible/);
    assert.equal(JSON.stringify([pc, tel]), before);
    assert.equal(JSON.parse(M.values(pc, pc).values[key]).length, limit, 'doublons exacts à la capacité admis');
  }
});
check('prototype : chemins et objets hostiles refusés avant toute écriture', () => {
  for (const path of ['__proto__.polluted', 'constructor.prototype.polluted', 'cars.0.__proto__.polluted', 'work.prototype.polluted']) {
    const pc = settings(), tel = settings({ edits: { [path]: 1 } });
    assert.throws(() => M.settings(pc, tel, {}, { [path]: T }), /interdit/);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(vm.runInContext('Object.prototype.polluted', ctx), undefined);
  }
  const bad = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => M.settings(settings(), { ...settings(), work: bad }), /interdite/);
});
check('conflit de voiture : horodatage distant refusé ne remplace pas la preuve locale', () => {
  const pc = settings(), tel = settings({ cars: [car('voitureB'), car('voitureA')] });
  tel.cars[0].short = 'Autre véhicule';
  const r = M.settings(pc, tel, { 'cars.0.short': T }, { 'cars.0.short': T + 100 });
  assert.equal(r.stamps['cars.0.short'], T);
  assert.deepEqual(r.report.conflicts, ['cars', 'cars.0.short']);
  const erased = M.settings(pc, settings({ cars: [] }), {}, { cars: T + 100 });
  assert.equal(erased.settings.cars.length, 2); assert(erased.report.conflicts.includes('cars'));
});
check('journal brut de 61/120 trajets et de 91/365 jours, toutes versions conservées après fusion et relecture', () => {
  for (const count of [61, 120]) {
    const entries = Array.from({ length: count }, (_, i) => trip('ancien-'+i, -365*86400000-i));
    entries.push(trip('ancien-0', -365*86400000, { feedback: { at: T - 91*86400000, conditions: ['fog'], grip: 'normal' } }));
    const pc = device({ entries }), tel = device({ entries: [trip('autre', -91*86400000)] });
    const one = M.values(pc, tel).values, reloaded = JSON.parse(JSON.stringify(one));
    const archive = J.capture(reloaded);
    for (const original of entries) assert(archive.records.some(r => require('node:util').isDeepStrictEqual(JSON.parse(r), original)));
    assert.equal(JSON.parse(reloaded['twrc.context.v1']).debrief.entries.length, count + 1);
    assert.equal(M.values(reloaded, tel).values[J.KEY], reloaded[J.KEY]);
  }
});
check('une propriété length ne peut pas supprimer une liste de véhicules', () => {
  const pc = settings(), tel = settings({ cars: [] });
  assert.throws(() => M.settings(pc, tel, {}, { 'cars.length': T }), /Indice de liste interdit/);
  assert.equal(pc.cars.length, 2);
  assert.throws(() => M.settings(pc, settings({ cars: [car('voitureA'), car('voitureA')] })), /ambiguës/);
});
check('mesures et véhicules incomplets : refus, aucune copie nettoyée silencieusement', () => {
  for (const change of [{ odo: {} }, { odo: [null] }, { tire: { treads: {} } }])
    assert.throws(() => M.settings(settings(), settings({ cars: [car('voitureA', change), car('voitureB')] })), /incompl[eè]t|invalide/);
});
check('fusion répétée : idempotente, rien ne double', () => {
  const pc = device({ entries: [trip('t1', 0)], s: settings({ cars: [car('voitureA', { odo: [{ d: '2026-10-10', km: 1000 }] }), car('voitureB')] }) });
  const tel = device({ entries: [trip('t2', 1)] });
  const once = M.values(pc, tel).values, twice = M.values(once, tel).values;
  assert.equal(twice[J.KEY], once[J.KEY]); assert.equal(twice['twrc.settings.v1'], once['twrc.settings.v1']);
});
check('entrées brutes (anciennes versions) : stables dès la deuxième fusion', () => {
  const raw = (k, dt) => ({ key: k, at: T + dt, how: 'auto', name: 'Ancien format', from: 'Lieu A', to: 'Lieu B' });
  const pc = device({ entries: [raw('ancien-1', 0)] }), tel = device({ entries: [raw('ancien-2', 5)] });
  const once = M.values(pc, tel).values, twice = M.values(once, tel).values;
  assert.equal(twice[J.KEY], once[J.KEY]); assert.equal(twice['twrc.context.v1'], once['twrc.context.v1']);
  assert(J.read(once[J.KEY]).records.some(r => !r.includes('"start"')), 'la source brute reste dans l’archive');
});
check('copie distante illisible : refus explicite, aucune sortie partielle', () => {
  const pc = device(), tel = device(); tel['twrc.settings.v1'] = '{pas du json';
  assert.throws(() => M.values(pc, tel), /illisible.*réglages distants.*refusée/);
  assert.throws(() => M.values(pc, null), /refusée/);
});
check('ancien réglage sans edits : un écart de photo est visible, jamais intégré silencieusement', () => {
  const pc = settings(), tel = settings(); pc.cars[0].photo = 'local'; tel.cars[0].photo = 'remote';
  const r = M.settings(pc, tel); assert.equal(r.settings.cars[0].photo, 'local'); assert(r.report.conflicts.includes('cars.0.photo'));
});
check('horodatage réel : tous les champs de réglage modifiés sont couverts, mesures additives exclues', () => {
  const before = settings(), after = settings(); after.cars[0].photo = 'new'; after.work = { dep: '08:00' };
  after.cars[0].odo.push({ d: '2026-10-23', km: 900 });
  const stamps = json(ctx.M.edits(before, after, {}, T));
  assert.equal(stamps['cars.0.photo'], T); assert.equal(stamps.work, T); assert(!Object.keys(stamps).some(k => k.includes('odo')));
});
check('aucune mutation des entrées', () => {
  const pc = device({ entries: [trip('t1', 0)] }), tel = device({ entries: [trip('t2', 1)] }), a = json(pc), b = json(tel);
  M.values(pc, tel); assert.deepEqual(json(pc), a); assert.deepEqual(json(tel), b);
});
console.log(n + '/' + n + ' scénarios fusion PC ↔ iPhone OK');
