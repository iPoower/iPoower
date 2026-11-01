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
// NOESIS 13.4 : l'ancienne règle « la plus récente selon l'horloge gagne » écrasait en silence
// la modification concurrente d'un appareil à l'horloge décalée. Deux modifications = conflit.
check('réglage : deux modifications concurrentes sans base ⇒ conflit des deux côtés, chacun garde sa valeur', () => {
  const pc = settings({ edits: { 'cars.0.tire.dot': 1 } }), tel = settings({ edits: { 'cars.0.tire.dot': 1 } });
  pc.cars[0].tire.dot = '2124'; tel.cars[0].tire.dot = '3924';
  const sPc = { 'cars.0.tire.dot': T + 5000 }, sTel = { 'cars.0.tire.dot': T + 1000 };
  const a = M.settings(pc, tel, sPc, sTel), b = M.settings(tel, pc, sTel, sPc);
  assert.equal(a.settings.cars[0].tire.dot, '2124'); assert.equal(b.settings.cars[0].tire.dot, '3924');
  assert.deepEqual(a.report.conflicts, ['cars.0.tire.dot']); assert.deepEqual(b.report.conflicts, ['cars.0.tire.dot']);
  assert.equal(b.stamps['cars.0.tire.dot'], T + 1000, 'horodatage local conservé tant que le conflit reste ouvert');
});
check('réglage : une seule modification depuis la base commune ⇒ reprise des deux côtés, horodatages fusionnés', () => {
  const pc = settings({ edits: { 'cars.0.tire.dot': 1 } }), tel = settings({ edits: { 'cars.0.tire.dot': 1 } });
  pc.cars[0].tire.dot = '2124';
  const base = { 'cars.0.tire.dot': T }, sPc = { 'cars.0.tire.dot': T + 5000 }, sTel = { ...base };
  const a = M.settings(pc, tel, sPc, sTel, { base }), b = M.settings(tel, pc, sTel, sPc, { base });
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
  // Base : monte posée à T sur les deux appareils. Seul l'autre appareil a changé la monte ensuite ;
  // cet appareil a seulement modifié le DOT.
  const base = { 'cars.0.tire': T };
  const r = M.settings(pc, tel, { 'cars.0.tire': T, 'cars.0.tire.dot': T + 9000 }, { 'cars.0.tire': T + 5000 }, { base });
  assert.equal(r.settings.cars[0].tire.brand, 'Marque B', 'monte modifiée sur l’autre appareil seulement');
  assert.equal(r.settings.cars[0].tire.dot, '1111', 'DOT modifié ici : chemin enfant plus précis, il reste');
  assert(r.report.conflicts.includes('cars.0.tire.dot'), 'DOT changé des deux côtés (monte entière remplacée là-bas) : conflit signalé');
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
check('observations : fusion à la capacité de l’appareil (30 / 200 plus récentes), copies sources intactes', () => {
  for (const [key, limit] of [['twrc.reports.v1', 30], ['twrc.shadow.v1', 200]]) {
    const rows = Array.from({ length: limit }, (_, i) => ({ at: T + i }));
    const pc = device({ extra: { [key]: JSON.stringify(rows) } });
    const tel = device({ extra: { [key]: JSON.stringify([{ at: T + limit }]) } });
    const before = JSON.stringify([pc, tel]);
    const merged = JSON.parse(M.values(pc, tel).values[key]);
    assert.equal(merged.length, limit, key + ' : deux appareils pleins se synchronisent');
    assert.deepEqual(merged, [...rows, { at: T + limit }].slice(-limit), key + ' : seules les plus anciennes sortent');
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
check('journal de saison (résumés météo dérivés) : même matin différent → aucun conflit, choix identique des deux côtés, aucun jour perdu', () => {
  const pc = settings({ journal: { '2026-10-27': { T: 7.1, Tr: 6, ice: 0, vis: 9000, lv: {} }, '2026-10-28': { T: 5.9, Tr: 4.4, ice: 0, vis: 3380, lv: { i20: 0 } }, '2026-10-29': { T: 8.5, Tr: 9.2, ice: 0, vis: 2280, lv: { i20: 0 } } } });
  const tel = settings({ journal: { '2026-10-28': { T: 5.6, Tr: 4.5, ice: 0, vis: 3380, lv: { i20: 0 } }, '2026-10-29': { T: 6.1, Tr: 6.6, ice: 0, vis: 2280, lv: { i20: 0 } }, '2026-10-30': { T: 3, Tr: 2, ice: 1, vis: 800, lv: {} } } });
  const a = M.settings(pc, tel, {}, {}), b = M.settings(tel, pc, {}, {});
  assert.deepEqual(a.report.conflicts, [], 'aucun arbitrage manuel pour une valeur dérivée');
  assert.deepEqual(b.report.conflicts, []);
  assert.deepEqual(a.settings.journal, b.settings.journal, 'les deux appareils convergent vers le même journal');
  assert.deepEqual(Object.keys(a.settings.journal).sort(), ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'], 'union des jours');
  assert.equal(a.settings.journal['2026-10-28'].T, 5.6); assert.equal(a.settings.journal['2026-10-29'].T, 6.1);
  const again = M.settings(a.settings, b.settings, {}, {});
  assert.deepEqual(again.settings.journal, a.settings.journal, 'stable : une seconde fusion ne change plus rien');
  const tie = M.settings(settings({ journal: { d: { T: 1, Tr: 2, vis: 1 } } }), settings({ journal: { d: { T: 1, Tr: 2, vis: 2 } } }), {}, {});
  const tie2 = M.settings(settings({ journal: { d: { T: 1, Tr: 2, vis: 2 } } }), settings({ journal: { d: { T: 1, Tr: 2, vis: 1 } } }), {}, {});
  assert.deepEqual(tie.settings.journal, tie2.settings.journal, 'égalité de températures : départage canonique, indépendant du côté');
});
check('voiture créée sur un appareil : reprise entière sur l’autre, sans conflit, dans les deux sens', () => {
  const added = car('v-0123456789ab', { userAdded: 1, name: 'Voiture C', odo: [{ d: '2026-10-29', km: 1234 }] });
  const pc = settings({ cars: [car('voitureA'), car('voitureB'), added] }), tel = settings();
  const a = M.settings(tel, pc, {}, { 'cars.2.name': T }), b = M.settings(pc, tel, { 'cars.2.name': T }, {});
  assert.deepEqual(a.report.conflicts, []); assert.deepEqual(b.report.conflicts, []);
  assert.deepEqual(a.settings.cars.map(c => c.id), ['voitureA', 'voitureB', 'v-0123456789ab'], 'ajoutée à la fin chez l’appareil qui ne l’avait pas');
  assert.deepEqual(b.settings.cars.map(c => c.id), ['voitureA', 'voitureB', 'v-0123456789ab'], 'gardée chez l’appareil qui l’a créée');
  assert.deepEqual(a.settings.cars[2].odo, [{ d: '2026-10-29', km: 1234 }], 'fiche et relevés repris entiers');
  assert.equal(a.report.added.cars, 1);
});
check('voiture créée : une modification d’une voiture commune se fusionne comme avant', () => {
  const added = car('v-0123456789ab', { userAdded: 1 });
  const pc = settings({ cars: [car('voitureA'), car('voitureB'), added] }), tel = settings();
  tel.cars[0].short = 'A modifiée';
  const r = M.settings(pc, tel, {}, { 'cars.0.short': T + 5 });
  assert.deepEqual(r.report.conflicts, []); assert.equal(r.settings.cars[0].short, 'A modifiée'); assert.equal(r.settings.cars.length, 3);
});
check('création de voiture : aucun horodatage de liste (seuls les champs communs comparés)', () => {
  const before = settings(), after = settings({ cars: [car('voitureA'), car('voitureB'), car('v-0123456789ab', { userAdded: 1 })] });
  const stamps = ctx.M.edits(before, after, {}, T);
  assert.deepEqual(Object.keys(stamps), []);
});
check('voitures ajoutées différentes des deux côtés, ou liste raccourcie : conflit conservé (rien supprimé ni deviné)', () => {
  const pc = settings({ cars: [car('voitureA'), car('voitureB'), car('v-aaaaaaaaaaaa', { userAdded: 1 })] });
  const tel = settings({ cars: [car('voitureA'), car('voitureB'), car('v-bbbbbbbbbbbb', { userAdded: 1 })] });
  const r = M.settings(pc, tel, {}, {});
  assert(r.report.conflicts.includes('cars')); assert.deepEqual(r.settings.cars.map(c => c.id), ['voitureA', 'voitureB', 'v-aaaaaaaaaaaa']);
  const preset = M.settings(settings(), settings({ cars: [car('voitureA')] }), {}, {});
  assert(preset.report.conflicts.includes('cars'), 'voiture du préréglage absente à distance : jamais une suppression déduite');
  assert.equal(preset.settings.cars.length, 2);
});
check('aucune mutation des entrées', () => {
  const pc = device({ entries: [trip('t1', 0)] }), tel = device({ entries: [trip('t2', 1)] }), a = json(pc), b = json(tel);
  M.values(pc, tel); assert.deepEqual(json(pc), a); assert.deepEqual(json(tel), b);
});
// REL-1 : fusion déterministe quel que soit l'appareil qui fusionne. Propriétés sur 2 000 paires d'états
// aléatoires (graine fixe) : listes dans un ordre quelconque, doublons partagés, horodatages égaux ou absents.
check('propriétés : même résultat dans les deux sens, aucune saisie perdue, point fixe au tour suivant', () => {
  let seed = 20261031; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = a => a[Math.floor(rnd() * a.length)];
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const ats = [T, T + 1000, T + 1000, T + 2000, 0];   // égalités volontaires ; 0 = horodatage absent
  const rows = (n, f) => Array.from({ length: n }, f);
  const calibRow = () => ({ t: pick(['2026-10-20T07:00', '2026-10-20T07:00', '2026-10-21T06:30', '']), loc: pick(['lieuA', 'lieuB']), kind: pick(['sec', 'humide', 'givre']), Tr: pick([1, 2, 3]), T: 4 });
  const obsRow = () => ({ at: pick(ats), loc: pick(['lieuA', 'lieuB']), kind: pick(['fog', 'rain', 'wet']) });
  const mark = () => pick([{ at: pick(ats), how: pick(['auto', 'confirmé']) }, { at: pick(ats), by: pick(['pc', 'tel']) }, true, 1]);
  const marks = () => Object.fromEntries(rows(1 + Math.floor(rnd() * 3), () => [pick(['k1', 'k2', 'k3']), mark()]));
  // Texte exact synchronisé (réglages complets, horodatages, observations, trajets clos, annulations) : l'empreinte compare ce texte.
  const synced = r => { const v = r.values, c = JSON.parse(v['twrc.context.v1']);
    return JSON.stringify([v['twrc.settings.v1'], v['twrc.editstamps.v1'], v['twrc.reports.v1'], v['twrc.shadow.v1'], v['twrc.tripcancel'], v['twrc.tripdone'], c.done]); };
  const day = () => ({ T: pick([-1, 2, 3]), Tr: pick([0, 1]) });
  const days = () => Object.fromEntries(rows(Math.floor(rnd() * 4), () => [pick(['2026-10-18', '2026-10-19', '2026-10-20']), day()]));
  const stamps = () => Object.fromEntries(rows(Math.floor(rnd() * 3), () => [pick(['rainThr', 'horizon', 'dept.code']), T]));
  for (let i = 0; i < 2000; i++) {
    const shared = { calib: rows(Math.floor(rnd() * 3), calibRow), obs: rows(Math.floor(rnd() * 3), obsRow) };
    const side = () => device({ s: settings({ calib: shuffle([...shared.calib, ...rows(Math.floor(rnd() * 3), calibRow)]), journal: days() }), stamps: stamps(), done: marks(),
      extra: { 'twrc.reports.v1': JSON.stringify(shuffle([...shared.obs, ...rows(Math.floor(rnd() * 3), obsRow)])),
        'twrc.shadow.v1': JSON.stringify(shuffle([...shared.obs, ...rows(Math.floor(rnd() * 3), obsRow)])),
        'twrc.tripcancel': JSON.stringify(marks()), 'twrc.tripdone': JSON.stringify(marks()) } });
    const pc = side(), tel = side(), atPc = M.values(pc, tel), atTel = M.values(tel, pc);
    assert.equal(synced(atPc), synced(atTel), 'cas ' + i + ' : le résultat dépend de l’appareil qui fusionne');
    const all = [...JSON.parse(pc['twrc.settings.v1']).calib, ...JSON.parse(tel['twrc.settings.v1']).calib].map(x => JSON.stringify(x));
    const kept = new Set(JSON.parse(atPc.values['twrc.settings.v1']).calib.map(x => JSON.stringify(x)));
    assert(all.every(x => kept.has(x)), 'cas ' + i + ' : un retour de calibration est perdu');
    for (const k of ['twrc.reports.v1', 'twrc.shadow.v1']) {
      const got = new Set(JSON.parse(atPc.values[k]).map(x => JSON.stringify(x)));
      assert([...JSON.parse(pc[k]), ...JSON.parse(tel[k])].every(x => got.has(JSON.stringify(x))), 'cas ' + i + ' : observation perdue (' + k + ')');
    }
    assert.equal(synced(M.values(atPc.values, atTel.values)), synced(atPc), 'cas ' + i + ' : le tour suivant modifie encore l’état (republication)');
  }
});
console.log(n + '/' + n + ' scénarios fusion PC ↔ iPhone OK');
