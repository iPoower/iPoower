// Annulation locale : expiration, confidentialité et reconstruction de chaîne sans fausse origine.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../src/trip-cancel.js'), 'utf8');
function engine(text = source) { const ctx = {}; vm.createContext(ctx); vm.runInContext(text + ';this.api=TripCancel;', ctx); return ctx.api; }
const api = engine(), plain = value => JSON.parse(JSON.stringify(value));
const now = Date.parse('2026-10-04T07:00:00Z'), day = '2026-10-04';
const H = { lat: 48.86, lon: 2.35, label: 'Domicile' }, A = { lat: 49.9, lon: 2.3, label: 'Lieu privé A' }, B = { lat: 50.63, lon: 3.06, label: 'Lieu privé B' }, C = { lat: 49.25, lon: 4.03, label: 'Lieu privé C' };
const leg = (k, from, to, dep, arr, fromKind = 'home') => ({ k, from, to, fromKind, dep: day + 'T' + dep, arr: day + 'T' + arr, min: 40, km: 60,
  routed: true, byTime: true, pts: [{ f: .5, lat: from.lat, lon: from.lon, name: 'Ancienne origine privée' }], g: [[from.lat, from.lon], [to.lat, to.lon]] });
function chain() {
  return [
    { id: 'event-a', t: 'Titre privé A', s: day + 'T10:00', e: day + 'T11:00', ...A, loc: 'Adresse privée A', legs: [leg('go', H, A, '09:10', '09:50')] },
    { id: 'event-b', t: 'Titre privé B', s: day + 'T12:00', e: day + 'T13:00', ...B, loc: 'Adresse privée B', legs: [leg('go', A, B, '11:10', '11:50', 'prev')] },
    { id: 'event-c', t: 'Titre privé C', s: day + 'T14:00', e: day + 'T15:00', ...C, loc: 'Adresse privée C', legs: [leg('go', B, C, '13:10', '13:50', 'prev'), leg('ret', C, H, '15:10', '15:50', 'event')] }
  ];
}
function memory(raw) {
  const data = new Map(raw == null ? [] : [[api.KEY, raw]]), calls = [];
  return { data, calls, getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { calls.push(['set', key]); data.set(key, value); }, removeItem: key => { calls.push(['remove', key]); data.delete(key); } };
}
let count = 0;
function test(name, fn) { fn(); count++; console.log('✅ ' + name); }
const cancelEvent = (a, state, e, at = now) => a.cancel(state, a.eventId(e), a.eventExpiration(e, at), at);
test('identifiant agenda technique, stable quand route ou titre changent', () => {
  const [e] = chain(), id = api.eventId(e);
  assert.match(id, /^cal-[a-f0-9]{32}$/); assert.equal(id, api.eventId({ ...e, t: 'Autre titre', legs: [] }));
  const { id: unused, ...legacy } = e;
  assert.equal(api.eventId(legacy), api.eventId({ ...legacy, t: 'Autre titre', loc: 'Autre lieu', lat: 0, lon: 0, legs: [] }));
  assert.notEqual(id, api.eventId({ ...e, s: '2026-10-05T10:00' }));
});
test('état et stockage contiennent uniquement identifiant, heure et expiration', () => {
  const [e] = chain(), id = api.eventId(e), state = cancelEvent(api, {}, e), storage = memory();
  assert.deepEqual(plain(state[id]), { at: now, exp: Date.parse('2026-10-04T11:00:00Z') });
  api.save(storage, state, now);
  const raw = storage.getItem(api.KEY); assert(!/Titre|Adresse|49\.9|2\.3|arrivé|how|lat|lon/.test(raw));
  assert.deepEqual(Object.keys(JSON.parse(raw)[id]).sort(), ['at', 'exp']);
});
test('une annulation ne porte aucun état d’arrivée et ne crée aucune jambe d’arrivée', () => noArrival(api));
function noArrival(a) {
  const events = chain(), id = a.eventId(events[0]), state = cancelEvent(a, {}, events[0]);
  assert.deepEqual(Object.keys(state[id]).sort(), ['at', 'exp']);
  assert(!Object.values(state[id]).includes('arrivé'));
  assert.deepEqual(plain(a.rebuild(events, H, {}, state, now).get(id)), []);
  assert.equal(a.has(state, id, now), true);
}
test('charger une entrée expirée la supprime réellement du localStorage', () => {
  const id = api.eventId(chain()[0]), storage = memory(JSON.stringify({ [id]: { at: now - 10000, exp: now } }));
  assert.deepEqual(plain(api.load(storage, now)), {}); assert.equal(storage.getItem(api.KEY), null); assert.deepEqual(storage.calls, [['remove', api.KEY]]);
});
test('purge partielle conserve seulement les entrées valides, sans champs privés', () => {
  const id = api.eventId(chain()[0]), expired = api.workId('2026-10-03');
  const storage = memory(JSON.stringify({ [id]: { at: now, exp: now + 10000, title: 'privé', lat: 49.9 }, [expired]: { at: now - 20000, exp: now - 1 }, 'Titre privé': { at: now, exp: now + 10000 } }));
  const state = api.load(storage, now); assert.deepEqual(plain(state), { [id]: { at: now, exp: now + 10000 } });
  assert.deepEqual(JSON.parse(storage.getItem(api.KEY)), plain(state));
});
test('JSON invalide et tableau corrompu sont réellement purgés', () => {
  for (const raw of ['{', '[]', 'null', '42']) { const storage = memory(raw); assert.deepEqual(plain(api.load(storage, now)), {}); assert.equal(storage.getItem(api.KEY), null); }
});
test('absence de stockage ne casse pas les décisions locales', () => {
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } };
  assert.deepEqual(plain(api.load(broken, now)), {}); assert.equal(Object.keys(api.save(broken, cancelEvent(api, {}, chain()[0]), now)).length, 1);
});
test('Annuler l’annulation restaure immédiatement pendant dix minutes', () => {
  const [e] = chain(), id = api.eventId(e), state = cancelEvent(api, {}, e);
  assert.equal(api.undoable(state, now + 599999).length, 1); assert.equal(api.has(api.undo(state, id, now + 599999), id, now + 599999), false);
  assert.equal(api.undoable(state, now + 600001).length, 0); assert.equal(api.has(api.undo(state, id, now + 600001), id, now + 600001), true);
  assert.equal(api.has(state, id, now), true); // entrée originale immuable
});
test('expiration agenda = fin locale + deux heures, indépendante du fuseau navigateur', () => {
  assert.equal(api.eventExpiration({ s: day + 'T10:00', e: day + 'T11:00' }, now), Date.parse(day + 'T11:00:00Z'));
  assert.equal(api.eventExpiration({ s: '2026-12-05T10:00', e: '2026-12-05T11:00' }, now), Date.parse('2026-12-05T12:00:00Z'));
  assert.equal(api.eventExpiration({ s: day + 'T10:00', e: day + 'T11:00' }, now, 'UTC'), Date.parse(day + 'T13:00:00Z'));
});
test('annulation travail expire à minuit locale, y compris changements d’heure', () => {
  assert.equal(api.workExpiration(day, now), Date.parse('2026-10-04T22:00:00Z'));
  assert.equal(api.workExpiration('2026-10-25', Date.parse('2026-10-25T08:00:00Z')), Date.parse('2026-10-25T23:00:00Z'));
  assert.equal(api.workExpiration('2026-03-29', Date.parse('2026-03-29T08:00:00Z')), Date.parse('2026-03-29T22:00:00Z'));
  assert.equal(api.workExpiration('2026-10-25', Date.parse('2026-10-25T22:55:00Z')), Date.parse('2026-10-25T23:05:00Z'));
  assert.equal(api.workId(day), 'work-' + day);
});
function workUndoWindow(a) {
  const at = Date.parse('2026-10-05T21:55:00Z'), id = a.workId('2026-10-05'), exp = a.workExpiration('2026-10-05', at);
  assert.equal(exp, at + a.UNDO_MS);
  const state = a.cancel({}, id, exp, at);
  assert.equal(a.undoable(state, Date.parse('2026-10-05T22:04:00Z')).length, 1);
  assert.equal(a.undoable(state, at + a.UNDO_MS + 1).length, 0);
  assert.equal(a.has(state, a.workId('2026-10-06'), Date.parse('2026-10-05T22:04:00Z')), false);
}
test('travail annulé à 23:55 : dix minutes d’Undo complètes sans masquer le lendemain', () => workUndoWindow(api));
test('événement journée entière sans fin expire le lendemain plus marge', () => {
  assert.equal(api.eventExpiration({ s: day, allDay: true }, now), Date.parse('2026-10-05T00:00:00Z'));
});
test('sans annulation la chaîne et les choix direct restent inchangés', () => {
  const events = chain(), e = events[1]; e.alt = { key: 'technical-break', direct: e.legs[0] };
  e.legs = [leg('go', H, B, '11:10', '11:50')]; e.legs[0].brk = e.alt.key;
  const map = api.rebuild(events, H, { [e.alt.key]: true }, {}, now);
  assert.deepEqual(plain(map.get(api.eventId(e))), [{ ...e.alt.direct, chosen: true }]);
  assert.deepEqual(plain(map.get(api.eventId(events[0]))), events[0].legs);
});
test('aller annulé masque toutes ses jambes sans modifier l’agenda original', () => {
  const e = chain()[0]; e.legs.push(leg('ret', A, H, '11:10', '11:50', 'event'));
  const before = JSON.stringify(e), state = cancelEvent(api, {}, e), map = api.rebuild([e], H, {}, state, now);
  assert.deepEqual(plain(map.get(api.eventId(e))), []); assert.equal(JSON.stringify(e), before);
});
test('ancien départ annulé : nouvelle origine connue, aucune vieille géométrie', () => noOldOrigin(api));
function noOldOrigin(a) {
  const events = chain(), state = cancelEvent(a, {}, events[0]), go = a.rebuild(events, H, {}, state, now).get(a.eventId(events[1])).find(l => l.k === 'go');
  assert.equal(go.from.lat, H.lat); assert.equal(go.fromKind, 'home'); assert.equal(go.originPending, true);
  assert.deepEqual(plain(go.g), []); assert.deepEqual(plain(go.pts), []); assert.equal(go.km, null); assert.equal(go.min, null); assert.equal(go.routed, false);
  assert.equal(go.targetArr, day + 'T11:50'); assert.equal(go.rebuildFrom.lat, H.lat);
}
test('événement milieu annulé : le suivant repart du dernier rendez-vous valide', () => {
  const events = chain(), map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[1]), now), go = map.get(api.eventId(events[2])).find(l => l.k === 'go');
  assert.equal(go.from.lat, A.lat); assert.equal(go.fromKind, 'prev'); assert.equal(go.originPending, true); assert.deepEqual(plain(go.g), []);
});
test('dernier événement annulé : un retour sûr est ajouté au précédent', () => {
  const events = chain(), map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[2]), now), ret = map.get(api.eventId(events[1])).find(l => l.k === 'ret');
  assert(ret); assert.equal(ret.from.lat, B.lat); assert.equal(ret.to.lat, H.lat); assert.equal(ret.dep, day + 'T13:10'); assert.equal(ret.originPending, true); assert.deepEqual(plain(ret.g), []);
});
test('route inchangée réutilisée seulement si ses deux extrémités sont identiques', () => {
  const events = chain(), map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[1]), now), first = map.get(api.eventId(events[0]))[0], ret = map.get(api.eventId(events[2])).find(l => l.k === 'ret');
  assert.equal(first.originPending, undefined); assert.deepEqual(plain(first.g), events[0].legs[0].g);
  assert.equal(ret.originPending, undefined); assert.deepEqual(plain(ret.g), events[2].legs[1].g);
});
test('écart > trois heures et #maison reconstruisent un retour maison explicite', () => {
  for (const mode of ['maison', null]) {
    const events = chain(); events[2] = { ...events[2], s: day + 'T17:00', e: day + 'T18:00', mode };
    const map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[1]), now), go = map.get(api.eventId(events[2])).find(l => l.k === 'go'), ret = map.get(api.eventId(events[0])).find(l => l.k === 'ret');
    assert.equal(go.from.lat, H.lat); assert.equal(ret.to.lat, H.lat); assert.equal(go.originPending, true);
  }
});
test('#direct et choix local conservent un enchaînement depuis le dernier lieu valide', () => {
  for (const keyed of [false, true]) {
    const events = chain(); events[2].s = day + 'T17:00'; events[2].e = day + 'T18:00';
    if (keyed) events[2].alt = { key: 'technical-break', direct: events[2].legs[0] }; else events[2].mode = 'direct';
    const map = api.rebuild(events, H, keyed ? { 'technical-break': 1 } : {}, cancelEvent(api, {}, events[1]), now), go = map.get(api.eventId(events[2])).find(l => l.k === 'go');
    assert.equal(go.from.lat, A.lat); assert.equal(go.fromKind, 'prev');
  }
});
test('origine introuvable : aucune ancienne route, origine à confirmer', () => {
  const events = chain(), map = api.rebuild(events, null, {}, cancelEvent(api, {}, events[0]), now), go = map.get(api.eventId(events[1])).find(l => l.k === 'go');
  assert.equal(go.from, null); assert.equal(go.rebuildFrom, null); assert.equal(go.originUncertain, true); assert.equal(go.originPending, true); assert.deepEqual(plain(go.g), []);
});
test('annulation d’un autre jour ne recalcule pas le programme conservé', () => {
  const events = chain(), other = { ...events[0], id: 'other-day', s: '2026-10-05T10:00', e: '2026-10-05T11:00' }, map = api.rebuild([...events, other], H, {}, cancelEvent(api, {}, other), now);
  assert.deepEqual(plain(map.get(api.eventId(events[1]))), events[1].legs);
});
test('restaurer une annulation restaure la chaîne initiale sans mutation des événements', () => {
  const events = chain(), snapshot = JSON.stringify(events), state = cancelEvent(api, {}, events[0]), restored = api.undo(state, api.eventId(events[0]), now + 1000), map = api.rebuild(events, H, {}, restored, now + 1000);
  for (const e of events) assert.deepEqual(plain(map.get(api.eventId(e))), e.legs); assert.equal(JSON.stringify(events), snapshot);
});
test('continuité travail : le premier événement gardé repart du dernier lieu valide', () => {
  const events = chain(), state = cancelEvent(api, {}, events[0]), work = { id: 'work', lat: 49.1, lon: 2.8, label: 'Travail' }, calls = [];
  const map = api.rebuild(events, H, {}, state, now, { beforeFirst(e) { calls.push(e.id); return work; } });
  const first = map.get(api.eventId(events[1])).find(l => l.k === 'go'), next = map.get(api.eventId(events[2])).find(l => l.k === 'go');
  assert.deepEqual(calls, ['event-b']); assert.equal(first.from.lat, work.lat); assert.equal(first.fromKind, 'work'); assert.equal(first.originPending, true);
  assert.equal(next.from.lat, B.lat); assert.equal(next.fromKind, 'prev');
});
test('continuité incertaine : callback null exige confirmation, jamais domicile forcé', () => {
  const events = chain(), map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[0]), now, { beforeFirst: () => null });
  const first = map.get(api.eventId(events[1])).find(l => l.k === 'go');
  assert.equal(first.from, null); assert.equal(first.rebuildFrom, null); assert.equal(first.fromKind, 'unknown'); assert.equal(first.originUncertain, true); assert.deepEqual(plain(first.g), []);
});
test('retour maison explicite après premier lieu travail rétablit origine domicile', () => {
  const events = chain(), work = { id: 'work', lat: 49.1, lon: 2.8, label: 'Travail' }; events[2].mode = 'maison';
  const map = api.rebuild(events, H, {}, cancelEvent(api, {}, events[0]), now, { beforeFirst: () => work });
  const first = map.get(api.eventId(events[1])), next = map.get(api.eventId(events[2]));
  assert.equal(first.find(l => l.k === 'go').from.lat, work.lat); assert.equal(first.find(l => l.k === 'ret').to.lat, H.lat);
  assert.equal(next.find(l => l.k === 'go').from.lat, H.lat);
});
test('occurrences simultanées avec identifiant technique conservent routes et clés distinctes', () => {
  const [a] = chain(), b = { ...a, id: 'simultaneous-b', ...B, legs: [leg('go', H, B, '09:15', '09:55')] };
  const events = [a, b], map = api.rebuild(events, H, {}, {}, now);
  assert.notEqual(api.eventId(a), api.eventId(b)); assert.equal(api.identifiable(events, a), true);
  assert.deepEqual(plain(map.get(a)), a.legs); assert.deepEqual(plain(map.get(b)), b.legs);
  assert.strictEqual(map.get(a), map.get(api.eventId(a))); assert.strictEqual(map.get(b), map.get(api.eventId(b)));
  const reversed = api.rebuild([...events].reverse(), H, {}, {}, now);
  assert.deepEqual(plain(reversed.get(api.eventId(a))), a.legs); assert.deepEqual(plain(reversed.get(api.eventId(b))), b.legs);
});
test('legacy simultané ambigu ne mélange pas deux routes dans la Map', () => {
  const [first] = chain(), { id: omitted, ...a } = first, b = { ...a, ...B, legs: [leg('go', H, B, '09:15', '09:55')] };
  const events = [a, b], map = api.rebuild(events, H, {}, {}, now), id = api.eventId(a);
  assert.equal(id, api.eventId(b)); assert.equal(api.identifiable(events, a), false); assert.equal(api.identifiable(events, b), false);
  assert.deepEqual(plain(map.get(a)), a.legs); assert.deepEqual(plain(map.get(b)), b.legs); assert.equal(map.get(id), undefined);
});
test('annulation legacy ambiguë ne masque aucune des deux occurrences', () => {
  const [first] = chain(), { id: omitted, ...a } = first, b = { ...a, ...B, legs: [leg('go', H, B, '09:15', '09:55')] };
  const events = [a, b], state = cancelEvent(api, {}, a), map = api.rebuild(events, H, {}, state, now);
  assert.deepEqual(plain(map.get(a)), a.legs); assert.deepEqual(plain(map.get(b)), b.legs);
  const reversed = api.rebuild([...events].reverse(), H, {}, state, now);
  assert.deepEqual(plain(reversed.get(a)), a.legs); assert.deepEqual(plain(reversed.get(b)), b.legs);
});
test('travail annulé : un ancien aller depuis travail se reconstruit depuis domicile', () => {
  const [e] = chain(), work = { id: 'work', lat: 49.1, lon: 2.8, label: 'Travail' };
  e.legs = [leg('go', work, A, '09:10', '09:50', 'work'), leg('ret', A, H, '11:10', '11:50', 'event')];
  const snapshot = JSON.stringify(e), state = api.cancel({}, api.workId(day), api.workExpiration(day, now), now), calls = [];
  const map = api.rebuild([e], H, {}, state, now, { beforeFirst(event) { calls.push(event.id); return H; } });
  const go = map.get(e).find(l => l.k === 'go');
  assert.deepEqual(calls, ['event-a']); assert.equal(go.from.lat, H.lat); assert.equal(go.fromKind, 'home'); assert.equal(go.originPending, true);
  assert.deepEqual(plain(go.pts), []); assert.deepEqual(plain(go.g), []); assert.equal(go.min, null); assert.equal(go.km, null);
  assert.strictEqual(map.get(e), map.get(api.eventId(e))); assert.equal(JSON.stringify(e), snapshot);
});
function noNonSpatialOrigin(a) {
  const events = chain().slice(1);
  events[0].mode = 'pasdetrajet';
  const snapshot = JSON.stringify(events), map = a.rebuild(events, H, {}, {}, now);
  assert.deepEqual(plain(map.get(events[0])), []);
  const go = map.get(events[1]).find(l => l.k === 'go');
  assert.equal(go.from.lat, H.lat); assert.equal(go.from.lon, H.lon);
  assert.equal(go.originPending, true); assert.deepEqual(plain(go.g), []);
  assert.deepEqual(plain(go.pts), []); assert.equal(JSON.stringify(events), snapshot);
}
test('#pasdetrajet sans annulation : aucune jambe ni ancienne origine B pour C', () => noNonSpatialOrigin(api));
test('#pasdetrajet legacy sans coordonnées : aucune ancienne jambe réinjectée', () => {
  const events = chain().slice(1); events[0].mode = 'pasdetrajet';
  events[0].lat = null; events[0].lon = null;
  const map = api.rebuild(events, H, {}, {}, now);
  assert.deepEqual(plain(map.get(events[0])), []);
  assert.deepEqual(plain(map.get(api.eventId(events[0]))), []);
  assert.equal(map.get(events[1]).find(l => l.k === 'go').from.lat, H.lat);
});
test('#pasdetrajet entre A et C : le dernier lieu physique A reste l’origine', () => {
  const events = chain(); events[1].mode = 'pasdetrajet';
  const map = api.rebuild(events, H, {}, {}, now), go = map.get(events[2]).find(l => l.k === 'go');
  assert.deepEqual(plain(map.get(events[1])), []);
  assert.equal(go.from.lat, A.lat); assert.equal(go.from.lon, A.lon);
  assert.equal(go.fromKind, 'prev'); assert.equal(go.originPending, true);
  assert.deepEqual(plain(go.g), []);
});
test('#pasdetrajet conserve une origine initiale fiable fournie par le contexte', () => {
  const events = chain().slice(1); events[0].mode = 'pasdetrajet';
  const work = { id: 'work', lat: 49.1, lon: 2.8, label: 'Travail' };
  const map = api.rebuild(events, H, {}, {}, now, { beforeFirst: () => work });
  const go = map.get(events[1]).find(l => l.k === 'go');
  assert.equal(go.from.lat, work.lat); assert.equal(go.from.lon, work.lon);
  assert.equal(go.fromKind, 'work'); assert.equal(go.originPending, true);
});
// Contre-tests : appliquer une faute réelle au moteur doit faire échouer une preuve ci-dessus.
function caught(name, text, proof) {
  assert.notEqual(text, source, 'Mutation absente : ' + name); let rejected = false;
  try { proof(engine(text)); } catch (e) { if (e instanceof assert.AssertionError) rejected = true; else throw e; }
  assert(rejected, 'Mutation non détectée : ' + name); count++; console.log('✅ contre-test : ' + name);
}
caught('une annulation ne peut être convertie en arrivée', source.replace('out[id] = { at: now, exp };', "out[id] = { at: now, exp, how: 'arrivé' };"), noArrival);
caught('ancienne route d’un rendez-vous annulé interdite', source.replace('same(l.from, from) && same(l.to, to)', 'same(l.to, to)'), noOldOrigin);
caught('la fenêtre Undo travail ne peut pas être coupée à minuit', source.replace('Math.max(midnight, now + UNDO_MS)', 'midnight'), workUndoWindow);
caught('#pasdetrajet ne peut redevenir l’origine suivante', source.replace("dayEvents.some(e => cancelled(e) || e.mode === 'pasdetrajet')", 'dayEvents.some(cancelled)'), noNonSpatialOrigin);
console.log(count + '/' + count + ' scénarios OK (dont quatre mutations détectées)');
