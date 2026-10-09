// Contrats métier : une préférence d'origine ne devient jamais une seconde timeline.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const context = {}; vm.createContext(context);
for (const file of ['calendar-origin', 'trip-cancel', 'backup']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/' + file + '.js'), 'utf8'), context);
vm.runInContext('this.O=CalendarOrigin;this.C=TripCancel;this.B=Backup', context);
const { O, C, B } = context, json = x => JSON.parse(JSON.stringify(x));
const now = Date.parse('2026-10-09T06:00:00Z'), day = '2026-10-09';
const home = { id: 'home', name: 'Maison fictive', lat: 48.85, lon: 2.35 }, work = { id: 'work', name: 'Travail fictif', lat: 48.9, lon: 2.25 };
const A = { lat: 49.2, lon: 2.7, label: 'Alpha' }, D = { lat: 49.6, lon: 3.1, label: 'Beta' };
const settings = { locs: [home, work], customs: [{ id: 'ami', name: 'Lieu enregistré fictif', lat: 49, lon: 2.8 }] };
const leg = (k, from, to, dep, arr) => ({ k, from, to, dep: day + 'T' + dep, arr: day + 'T' + arr, km: 60, min: 40, routed: true, byTime: true, pts: [{ lat: 49, lon: 2.6, f: .5 }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
const e1 = { id: 'opaque-alpha', t: 'Alpha', s: day + 'T10:00', e: day + 'T11:00', ...A, legs: [leg('go', home, A, '09:10', '09:50'), leg('ret', A, home, '11:10', '11:50')] };
const e2 = { id: 'opaque-beta', t: 'Beta', s: day + 'T12:00', e: day + 'T13:00', ...D, mode: 'direct', legs: [leg('go', A, D, '11:10', '11:50'), leg('ret', D, home, '13:10', '13:50')] };
const id = C.eventId(e1), exp = C.eventExpiration(e1, now), saved = { kind: 'saved', placeId: 'work' };
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const update = (value = {}, choice = saved, k = 'go', at = now) => O.update(value, id, k, choice, exp, at);
const rebuild = (events, origins, cancel = {}, direct = {}) => C.rebuild(events, home, direct, cancel, now, { origin: (e, l) => O.apply(l, O.get(origins, C.eventId(e), l.k, now), settings) });
test('une occurrence technique opaque, indépendante du titre et de la route', () => { assert.match(id, /^cal-[a-f0-9]{32}$/); assert.equal(id, C.eventId({ ...e1, t: 'Autre', legs: [] })); assert(!id.includes('Alpha')); });
test('une occurrence récurrente à une autre date a son propre choix', () => assert.notEqual(id, C.eventId({ ...e1, s: '2026-10-10T10:00', e: '2026-10-10T11:00' })));
test('une préférence est datée et expire avec son rendez-vous', () => { const x = json(update()); assert.equal(x[id].go.at, now); assert.equal(x[id].go.exp, exp); assert.deepEqual(json(O.clean(x, exp)), {}); });
test('aller et retour peuvent choisir deux départs indépendants', () => { const x = update(update(), { kind: 'home' }, 'ret'); assert.equal(O.get(x, id, 'go', now).kind, 'saved'); assert.equal(O.get(x, id, 'ret', now).kind, 'home'); });
test('nettoyage refuse identifiant privé, direction arbitraire, future date et coordonnées invalides', () => {
  const x = update(); x['Titre adresse'] = x[id]; x[id].live = x[id].go; x[id].ret = { ...x[id].go, at: now + 60001 };
  const y = json(O.clean(x, now)); assert.deepEqual(Object.keys(y), [id]); assert.deepEqual(Object.keys(y[id]), ['go']);
  assert.equal(O.choice({ kind: 'gps', point: { lat: 100, lon: 1 } }), undefined);
});
test('aucune route, météo, précision brute ou trace GPS dans la préférence', () => {
  const c = json(O.choice({ kind: 'gps', point: { lat: 49, lon: 3, name: 'Ma position', accuracy: 20, timestamp: now, watch: 5, route: [1], weather: 'privée' } }));
  assert.deepEqual(c, { kind: 'gps', point: { lat: 49, lon: 3, name: 'Ma position' } });
});
test('domicile utilise le lieu configuré actuel, sans copie persistée', () => { assert.deepEqual(json(O.choice({ kind: 'home', point: A })), { kind: 'home' }); assert.equal(O.resolve({ kind: 'home' }, { locs: [{ ...home, lat: 50 }] }).lat, 50); });
test('lieu enregistré suit son ID, même si son adresse change', () => assert.equal(O.resolve(saved, { locs: [home, { ...work, lon: 3 }] }).lon, 3));
test('un lieu supprimé reste explicite et en attente, sans repli silencieux sur domicile', () => { const x = O.apply(e1.legs[0], { kind: 'saved', placeId: 'supprimé' }, settings); assert.equal(x.from, null); assert(x.originExplicit && x.originPending && x.originUncertain); });
test('l’adresse conserve le libellé accentué choisi et seulement ses champs utiles', () => { const x = O.choice({ kind: 'address', point: { ...work, name: "1 Rue de l'Église", provider: 'IGN/BAN', unknown: 'x' } }); assert.equal(x.point.name, "1 Rue de l'Église"); assert(!('unknown' in x.point)); });
test('sans préférence : mêmes jambes, même ordre, mêmes métriques', () => { const actual = rebuild([e1, e2], {}); assert.deepEqual(json(actual.get(e1)), json(e1.legs)); assert.deepEqual(json(actual.get(e2)), json(e2.legs)); });
test('seul l’aller ciblé change : retour et autre rendez-vous intacts', () => { const x = rebuild([e1, e2], update()); assert.equal(x.get(e1)[0].from.id, 'work'); assert.deepEqual(json(x.get(e1)[1]), json(e1.legs[1])); assert.deepEqual(json(x.get(e2)), json(e2.legs)); });
test('le calendrier et les routes du relais restent immuables', () => { const before = JSON.stringify([e1, e2]); rebuild([e1, e2], update()); assert.equal(JSON.stringify([e1, e2]), before); });
test('changement spatial invalide tout ancien calcul avant publication atomique', () => { const x = rebuild([e1], update()).get(e1)[0]; assert(x.originPending); for (const key of ['km', 'min']) assert.equal(x[key], null); for (const key of ['pts', 'g']) assert.deepEqual(json(x[key]), []); assert.equal(x.targetArr, e1.legs[0].arr); assert.equal(x.originPlannedDep, e1.legs[0].dep); });
test('même extrémité : route conservée, départ explicite protégé', () => { const x = O.apply(e1.legs[0], { kind: 'home' }, settings); assert(x.originExplicit); assert.equal(x.min, 40); assert.deepEqual(json(x.g), json(e1.legs[0].g)); assert(!x.originPending); });
test('retour ciblé conserve son heure de départ, arrivée à recalculer', () => { const x = O.apply(e1.legs[1], saved, settings); assert.equal(x.dep, e1.legs[1].dep); assert.equal(x.targetArr, null); assert(x.originPending); });
for (const mode of ['direct', 'maison']) test('#' + mode + ' : origine locale prioritaire, règle et rendez-vous voisin conservés', () => {
  const event = { ...e2, mode }, origins = O.update({}, C.eventId(event), 'go', saved, C.eventExpiration(event, now), now);
  const x = rebuild([e1, event], origins); assert.equal(x.get(event)[0].from.id, 'work'); assert.equal(event.mode, mode); assert.deepEqual(json(x.get(e1)), json(e1.legs));
});
test('Départ automatique restaure la sélection #direct sans modifier calDirect', () => {
  const event = { ...e2, alt: { key: 'break', direct: { ...e2.legs[0], from: A, brk: 'break' } }, legs: [{ ...e2.legs[0], from: home, brk: 'break' }] };
  const uid = C.eventId(event), direct = { break: 1 }, origins = O.update({}, uid, 'go', saved, exp, now);
  const cleared = O.update(origins, uid, 'go', null, exp, now + 1), x = rebuild([e1, event], cleared, {}, direct);
  assert.equal(x.get(event)[0].from.label, 'Alpha'); assert.deepEqual(direct, { break: 1 });
});
test('annulation masque toutes les jambes sans effacer la préférence ; undo la retrouve', () => {
  const origins = update(), canceled = C.cancel({}, id, exp, now); assert.deepEqual(json(rebuild([e1, e2], origins, canceled).get(e1)), []);
  assert.equal(rebuild([e1, e2], origins, C.undo(canceled, id, now + 1)).get(e1)[0].from.id, 'work'); assert.equal(O.get(origins, id, 'go', now).kind, 'saved');
});
test('chaîne après annulation : seul le départ visé remplace l’origine reconstruite', () => {
  const uid = C.eventId(e2), origins = O.update({}, uid, 'go', saved, C.eventExpiration(e2, now), now);
  const x = rebuild([e1, e2], origins, C.cancel({}, id, exp, now)); assert.equal(x.get(e2)[0].from.id, 'work'); assert.equal(x.get(e2)[1].to.label, 'Domicile');
});
test('deux anciens rendez-vous simultanés ambigus ne partagent jamais une préférence', () => {
  const { id: unused, ...legacy } = e1, other = { ...legacy, t: 'Autre', ...D }, uid = C.eventId(legacy);
  const origins = O.update({}, uid, 'go', saved, exp, now); assert.equal(rebuild([legacy, other], origins).get(legacy)[0].from.id, 'home');
});
test('mise à jour puis retour automatique dans la même milliseconde : tombstone plus récent', () => { const a = update(), b = update(a, null); assert(b[id].go.at > a[id].go.at); assert.equal(O.get(O.merge(a, b, now), id, 'go', now), null); });
test('fusion garde le choix récent et les autres directions', () => { const a = update(), b = update(update({}, { kind: 'home' }, 'ret'), { kind: 'home' }, 'go', now + 1); const x = O.merge(a, b, now); assert.equal(x[id].go.choice.kind, 'home'); assert.equal(x[id].ret.choice.kind, 'home'); });
test('export V2 nettoie la préférence sans exporter des trajets supplémentaires', () => { const s = { ...settings, calOrigins: update() }, b = json(B.make({ settings: s, at: new Date(now).toISOString() })); assert.equal(b.settings.calOrigins[id].go.choice.placeId, 'work'); assert(!('calOrigins' in b.durable)); });
for (const v of [1, 2]) test('import V' + v + ' sans carte conserve les choix valides du téléphone', () => { const plan = B.restorePlan({ app: 'twrc', v, settings }, now, { calOrigins: update() }); const x = JSON.parse(plan.writes['twrc.settings.v1']); assert.equal(x.calOrigins[id].go.choice.placeId, 'work'); assert.equal(x.edits.calOrigins, 1); });
test('import ancien ne ressuscite pas un départ annulé par Départ automatique', () => { const a = update(), b = update(a, null, 'go', now + 1), plan = B.restorePlan({ app: 'twrc', v: 2, settings: { ...settings, calOrigins: a } }, now + 1, { calOrigins: b }); assert.equal(JSON.parse(plan.writes['twrc.settings.v1']).calOrigins[id].go.choice, null); });
test('import du choix récent est compatible dans les deux sens', () => { const a = update(), b = update(a, { kind: 'home' }, 'go', now + 1); assert.deepEqual(json(O.merge(a, b, now)), json(O.merge(b, a, now))); });
test('après expiration et changement de jour, une vieille sauvegarde ne restaure rien', () => { const plan = B.restorePlan({ app: 'twrc', v: 2, settings: { ...settings, calOrigins: update() } }, exp + 1, { calOrigins: update() }); assert.deepEqual(JSON.parse(plan.writes['twrc.settings.v1']).calOrigins, {}); });
console.log(`${n}/${n} scénarios OK`);
