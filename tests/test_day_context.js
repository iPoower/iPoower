'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { Date, Intl, JSON, Object, Number, Array, Set, Math };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/debrief.js'), 'utf8') + fs.readFileSync(require('node:path').resolve(__dirname, '../src/userctx.js'), 'utf8') + ';this.api = typeof DayContext === "undefined" ? null : DayContext; this.store = userContextStore;', ctx);
const D = ctx.api, t = s => Date.parse(s + '+02:00'), now = t('2026-10-06T17:30:00');
const places = [{ id: 'home', name: 'Domicile test', lat: 48.85, lon: 2.35 }, { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }, { id: 'b', name: 'Lieu B', lat: 48.8, lon: 2.45 }];
const cars = [{ id: 'a' }, { id: 'b' }], conf = at => ({ placeId: 'b', at, source: 'manual' });
const choice = (placeId, at = now) => ({ placeId, source: 'user', confirmedAt: at, expiresAt: t('2026-10-07T04:00:00'), tripKey: 'current', originId: 'work' });
let n = 0, fail = 0;
function check(label, fn) { try { fn(); n++; console.log('✅ ' + label); } catch (e) { fail++; console.log('❌ ' + label + ' · ' + e.message); } }
check('API canonique disponible', () => assert(D));
for (const [label, id] of [['A1 WORK → HOME', 'home'], ['A2 WORK → CUSTOM', 'b'], ['A3 WORK → UNKNOWN', null]]) check(label, () => assert.equal(D.clean({ nextDestination: choice(id) }, now, places, cars).nextDestination.placeId, id));
check('A4/E5 origine confirmée après 16 h la veille', () => assert.equal(D.morningOrigin({ lastConfirmedPlace: conf(t('2026-10-06T18:10:00')) }, t('2026-10-07T06:00:00'), places).id, 'b'));
check('E4 ancienne confirmation avant 16 h non retenue', () => assert.equal(D.morningOrigin({ lastConfirmedPlace: conf(t('2026-10-06T15:59:00')) }, t('2026-10-07T06:00:00'), places), null));
check('E6 départ après confirmation invalide origine', () => assert.equal(D.morningOrigin({ lastConfirmedPlace: conf(now), departedAt: now + 1 }, now + 1000, places), null));
check('origine plafonnée à 20 h même le lendemain', () => assert.equal(D.morningOrigin({ lastConfirmedPlace: conf(now) }, t('2026-10-07T14:00:00'), places), null));
check('A5/A8 manuel récent prévaut sur planning et agenda', () => assert.equal(D.destination({ nextDestination: choice('b') }, { id: 'home' }, now, places).place.id, 'b'));
check('A7 GPS observe sans inventer ni remplacer destination', () => assert.equal(D.destination({ nextDestination: choice('b'), gps: places[0] }, places[0], now, places).place.id, 'b'));
check('A8 Agenda plus tôt ne passe pas devant le trajet explicitement choisi', () => assert.equal(D.prioritize([{ key: 'agenda-home' }, { key: 'current' }], { nextDestination: choice('b') }, now)[0].key, 'current'));
check('même timeline : une prédiction concurrente avant arrivée choisie est retirée, futures conservées', () => {
  const T = [{ key: 'agenda-home', dep: '2026-10-06T17:10', arr: '2026-10-06T17:40' }, { key: 'current', dep: '2026-10-06T18:00', arr: '2026-10-06T18:40' }, { key: 'future', dep: '2026-10-06T19:00', arr: '2026-10-06T19:30' }];
  assert.deepEqual(Array.from(D.prioritize(T, { nextDestination: choice('b') }, now), t => t.key), ['current', 'future']);
});
check('E1 avant arrivée la destination reste confirmée', () => assert.equal(D.clean({ nextDestination: choice('b') }, now + 1000, places, cars).nextDestination.source, 'user'));
check('E2 arrivée plus récente termine la destination', () => assert.equal(D.clean({ nextDestination: choice('b'), arrivedAt: now + 1000 }, now + 1000, places, cars).nextDestination, null));
check('E3 expiration exacte à 04 h Paris', () => { assert(D.clean({ nextDestination: choice('b') }, t('2026-10-07T03:59:59'), places, cars).nextDestination); assert.equal(D.clean({ nextDestination: choice('b') }, t('2026-10-07T04:00:00'), places, cars).nextDestination, null); });
check('expiry Paris prend en compte changement heure', () => assert.equal(D.expiry(Date.parse('2026-10-24T17:30:00+02:00')), Date.parse('2026-10-25T04:00:00+01:00')));
check('destination expirée retourne au planning PRÉVU', () => { const x = D.destination({ nextDestination: choice('b') }, places[0], t('2026-10-07T04:00:00'), places); assert.equal(x.place.id, 'home'); assert.equal(x.source, 'planned'); });
check('destination Autre conserve À CONFIRMER sans fallback Maison', () => { const x = D.destination({ nextDestination: choice(null) }, places[0], now, places); assert.equal(x.place, null); assert.equal(x.source, 'pending'); });
check('lieu supprimé ne laisse aucune destination fantôme', () => assert.equal(D.clean({ nextDestination: choice('gone') }, now, places, cars).nextDestination, null));
check('E13 retour agenda courant remplacé sans vieille géométrie', () => { const l = { k: 'ret', from: places[1], to: places[0], g: [[1, 2]], pts: [places[0]], min: 30 }; const r = D.returnLeg(l, 'current', { nextDestination: choice('b') }, now, places); assert.equal(r.to.id, 'b'); assert.equal(r.navTo.id, 'b'); assert.equal(r.g.length, 0); assert(r.originPending); assert.equal(l.to.id, 'home'); });
check('E14 autres retours et après arrivée inchangés', () => { const l = { k: 'ret', to: places[0] }; assert.equal(D.returnLeg(l, 'future', { nextDestination: choice('b') }, now, places), l); assert.equal(D.returnLeg(l, 'current', { nextDestination: choice('b'), arrivedAt: now + 1 }, now + 1, places), l); });
check('A6 reload + migration document v1 conserve intention valide', () => { const mem = new Map(); const make = () => ctx.store({ read: k => mem.get(k), write: (k, v) => mem.set(k, v), now: () => now }); const s = make(); s.transaction(x => { x.dayContext = { nextDestination: choice('b') }; }); assert.equal(make().state.dayContext.nextDestination.placeId, 'b'); });
if (process.env.LOT === 'A') { check('TRAJET futur : expiration suit le jour de départ, pas seulement le lendemain de la saisie', () => {
  const dep = '2026-10-08T17:15', exp = D.tripExpiry(dep, now);
  assert(exp > D.expiry(now));
  const point = { id: 'manual-destination', name: '29 Rue Jean Jaurès 80610 Saint-Ouen', address: '29 Rue Jean Jaurès, 80610 Saint-Ouen',
    lat: 50.04, lon: 2.11, provider: 'IGN/BAN', precision: 'housenumber' };
  const v = D.clean({ nextDestination: { placeId: point.id, destinationPoint: point, source: 'manual', confirmedAt: now, expiresAt: exp,
    originId: 'work', tripKey: 'manual|1', dep, createdAt: now, updatedAt: now } }, now, places, cars).nextDestination;
  assert(v); assert.equal(v.dep, dep); assert.equal(v.source, 'manual'); assert.equal(v.destinationPoint.address, point.address); assert.equal(v.destinationPoint.provider, 'IGN/BAN');
});
check('TRAJET manuel : heure choisie et voiture active pilotent le trajet local sans dupliquer le contexte', () => {
  const a = appFixture(); a.S.work = { durMin: 40 }; a.locById = id => places.find(p => p.id === id); a.TRIPSTART = null;
  a.addMin = (s, m) => new Date(Date.parse(s + ':00Z') + m * 60000).toISOString().slice(0, 16);
  a.tripCancelRouteLeg = (_, l) => ({ ...l, originPending: false, min: 32, km: 24, arr: a.addMin(l.dep, 32), pts: [], g: [[48.9,2.25],[48.8,2.45]] });
  a.legEval = () => ({ res: null, sum: { Tmin: 10 }, seq: [], worst: null });
  a.USER_STORE.state.dayContext = { activeCarId: 'a', nextDestination: { ...choice('b'), source: 'manual', dep: '2026-10-06T19:15', tripKey: 'manual|x' } };
  const trip = a.appLocalTrips([], '2026-10-06T17:30')[0];
  assert.equal(trip.dep, '2026-10-06T19:15'); assert.equal(trip.carId, 'a'); assert.equal(trip.key, 'manual|x'); assert.equal(trip.src, 'local');
});
check('TRAJET manuel explicite reste prioritaire sur commute et agenda plus tôt', () => {
  const exp = D.tripExpiry('2026-10-06T19:15', now), v = { nextDestination: { placeId: 'b', source: 'manual', confirmedAt: now, expiresAt: exp, originId: 'work', tripKey: 'manual|x', dep: '2026-10-06T19:15' } };
  const T = [{ key:'commute', dep:'2026-10-06T18:00', arr:'2026-10-06T18:40' }, { key:'agenda', dep:'2026-10-06T18:30', arr:'2026-10-06T19:00' },
    { key:'manual|x', dep:'2026-10-06T19:15', arr:'2026-10-06T19:45' }, { key:'after', dep:'2026-10-06T20:00', arr:'2026-10-06T20:30' }];
  assert.deepEqual(Array.from(D.prioritize(T, v, now), x => x.key), ['manual|x','after']);
});
check('audit A05 · point manuel : département, commune et code postal conservés, valeurs invalides retirées', () => {
  const ok = D.cleanPoint({ id: 'manual-destination', name: 'Place fictive', lat: 45.9, lon: 6.13, deptCode: '74', dept: 'Haute-Savoie', city: 'Annecy', cityCode: '74010', postcode: '74000' }, 'x');
  assert.deepEqual([ok.deptCode, ok.dept, ok.city, ok.cityCode, ok.postcode], ['74', 'Haute-Savoie', 'Annecy', '74010', '74000']);
  const bad = D.cleanPoint({ id: 'm', lat: 45.9, lon: 6.13, deptCode: '74; DROP', cityCode: 'abc', postcode: '7400' }, 'x');
  assert.deepEqual([bad.deptCode, bad.dept, bad.cityCode, bad.postcode], ['', '', '', '']);
  assert.equal(D.cleanPoint({ id: 'c', lat: 41.9, lon: 8.7, deptCode: '2a' }, 'x').deptCode, '2A');
});
console.log(`${n}/${n + fail} scénarios OK`); process.exit(fail ? 1 : 0); }
for (const [label, date, value, days, expected] of [['B1', '2026-10-06', 'work', [2], true], ['B2', '2026-10-06', 'off', [2], false], ['B3', '2026-10-06', 'work', [], true], ['E7', '2026-10-07', 'off', [3], true]]) check(label + ' journée datée', () => assert.equal(D.workOn(date, { dayType: { date: '2026-10-06', value } }, days), expected));
check('E8 choix exceptionnel ne réécrit jamais planning', () => { const days = [1]; D.workOn('2026-10-06', { dayType: { date: '2026-10-06', value: 'work' } }, days); assert.deepEqual(days, [1]); });
for (const id of ['a', 'b', null]) check('B4/B5/B6 voiture ' + id, () => assert.equal(D.clean({ activeCarId: id }, now, places, cars).activeCarId, id));
check('E9 voiture reste active lendemain', () => assert.equal(D.clean({ activeCarId: 'b' }, now + 86400000, places, cars).activeCarId, 'b'));
check('E10 voiture supprimée nettoie ID orphelin', () => assert.equal(D.clean({ activeCarId: 'gone' }, now, places, cars).activeCarId, null));
check('B8 manuel du jour gagne sur Bureau', () => assert.equal(D.occasion('2026-10-06', { outfitChoice: { date: '2026-10-06', occasion: 'outing' } }, true, 'work', 'work'), 'outing'));
check('E11 Tenue expire le lendemain, Bureau revient', () => assert.equal(D.occasion('2026-10-07', { outfitChoice: { date: '2026-10-06', occasion: 'outing' } }, true, 'work', 'work'), 'office'));
check('journée off ne propose pas Bureau depuis planning', () => assert.equal(D.occasion('2026-10-06', {}, false, null, 'work'), 'outing'));
check('E12 ancienne occasion migre une fois pour aujourd’hui', () => { let clock = now; const mem = new Map([['twrc.outfit.occasion', 'walk']]); const make = () => ctx.store({ read: k => mem.get(k), write: (k, v) => v == null ? mem.delete(k) : mem.set(k, v), now: () => clock }); const s = make(); assert.equal(s.state.dayContext.outfitChoice.date, '2026-10-06'); assert.equal(s.state.dayContext.outfitChoice.occasion, 'walk'); assert.equal(mem.has('twrc.outfit.occasion'), false); clock += 86400000; assert.equal(make().state.dayContext.outfitChoice, null); });
check('canonical migration datée + synchro fenêtre en une publication', () => { const mem = new Map(), make = () => ctx.store({ read: k => mem.get(k), write: (k, v) => mem.set(k, v), now: () => now }); const a = make(), b = make(); let changes = 0; b.subscribe(() => changes++); a.transaction(x => { x.dayContext = { activeCarId: 'b', nextDestination: choice('b'), dayType: { date: '2026-10-06', value: 'off' } }; }); assert(b.receive(mem.get(a.key))); assert.equal(changes, 1); assert.equal(b.state.dayContext.activeCarId, 'b'); assert.equal(b.state.dayContext.dayType.value, 'off'); });
check('ancien profil #40 : confirmation manuelle du soir disponible comme origine le lendemain', () => {
  const at = t('2026-10-06T18:10:00'), clock = t('2026-10-07T06:00:00');
  const mem = new Map([['twrc.context.v1', JSON.stringify({ v: 1, place: { conf: { placeId: 'b', at, how: 'manual', day: '2026-10-06' } } })]]);
  const s = ctx.store({ read: k => mem.get(k), write: (k, v) => mem.set(k, v), now: () => clock });
  assert.equal(D.morningOrigin(s.state.dayContext, clock, places).id, 'b');
});
check('migration ancien GPS : observation jamais convertie en confirmation manuelle', () => {
  const mem = new Map([['twrc.context.v1', JSON.stringify({ v: 1, place: { last: { placeId: 'work', at: now, source: 'gps' } } })]]);
  const s = ctx.store({ read: k => mem.get(k), write: (k, v) => mem.set(k, v), now: () => now }); assert.equal(s.state.dayContext.lastConfirmedPlace, null);
});
function appFixture() {
  const c = { Date: class extends Date { static now() { return now; } }, DayContext: D, S: { cars: [{ id: 'a', tire: { type: 'summer' } }, { id: 'b', tire: { type: 'none' } }] },
    USER_STORE: { state: { dayContext: {} } }, placeList: () => places, hasTires: car => car.tire.type !== 'none', appAction: fn => fn(),
    placeNow: () => ({ source: 'none' }), placeToday: () => '2026-10-06', liveNow: () => '2026-10-06T17:30',
    TRIPSTART: null, LIVE: { phase: 'idle' } };
  c.TCARS = () => c.S.cars.filter(c.hasTires); vm.createContext(c); vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/app/day-context.js'), 'utf8'), c); return c;
}
function commuteFixture(place, clock) {
  const a = appFixture(), at = t(clock);
  a.Date = class extends Date { static now() { return at; } };
  a.S.work = { from: 'home', to: 'work', days: [2], dep: '07:00', ret: '18:00' };
  a.localTs = () => clock; a.placeToday = () => clock.slice(0, 10);
  a.toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  a.commuteDays = days => days;
  a.locById = id => places.find(p => p.id === id); a.TRIPSTART = null;
  a.placeNow = () => ({ source: 'manual', confirmed: { at }, place });
  return a;
}
check('domicile confirmé avant l’aller : le retour futur part toujours du travail', () => {
  const a = commuteFixture(places[0], '2026-10-06T06:30');
  assert.equal(a.appCommuteEndpoints('go', '2026-10-06', 'aller').from.id, 'home');
  const ret = a.appCommuteEndpoints('ret', '2026-10-06', 'retour');
  assert.equal(ret.from.id, 'work'); assert.equal(ret.to.id, 'home');
});
check('autre lieu confirmé le matin : origine réelle de l’aller, origine prévue du retour', () => {
  const a = commuteFixture(places[2], '2026-10-06T06:30');
  assert.equal(a.appCommuteEndpoints('go', '2026-10-06', 'aller').from.id, places[2].id);
  assert.equal(a.appCommuteEndpoints('ret', '2026-10-06', 'retour').from.id, 'work');
});
check('travail confirmé : le retour courant conserve l’origine réelle au travail', () => {
  const a = commuteFixture(places[1], '2026-10-06T17:30');
  assert.equal(a.appCommuteEndpoints('ret', '2026-10-06', 'retour').from.id, 'work');
});
check('départ réel déjà enregistré : son origine reste prioritaire sur la prochaine direction', () => {
  const a = commuteFixture(places[0], '2026-10-06T06:30');
  a.TRIPSTART = { key: 'retour', trip: { fromId: places[2].id } };
  assert.equal(a.appCommuteEndpoints('ret', '2026-10-06', 'retour').from.id, places[2].id);
});
check('voiture configurée sans monte renseignée reste sélectionnable, sans analyser les autres voitures', () => {
  const a = appFixture(); a.appSetCar('b'); assert.equal(a.appDay().activeCarId, 'b'); assert.equal(a.appTripCars()[0].id, 'b');
});
check('arrivée explicite plus récente efface le départ précédent pour la prochaine origine', () => {
  const a = appFixture(); a.USER_STORE.state.dayContext.departedAt = now; a.appConfirmedPlace('b', now); assert.equal(D.morningOrigin(a.appDay(), now + 1000, places).id, 'b');
});
check('Congé reconstruit localement une ancienne origine Agenda Travail sans annulation persistante', () => {
  const a = appFixture(), app = fs.readFileSync(require('node:path').resolve(__dirname, '../src/app.js'), 'utf8');
  vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/trip-cancel.js'), 'utf8') + ';this.TC=TripCancel;', a);
  a.S.work = { days: [2] }; a.USER_STORE.state.dayContext.dayType = { date: '2026-10-06', value: 'off' }; a.commuteDays = x => x;
  const e = { id: 'fixture-agenda', t: 'Lieu B', s: '2026-10-06T18:30', e: '2026-10-06T19:00', ...places[2], legs: [{ k: 'go', from: places[1], to: places[2], dep: '2026-10-06T18:00', arr: '2026-10-06T18:20', min: 20 }] };
  a.CAL = { events: [e] }; a.TRIPCANCEL = {}; a.workCancelled = (day, state) => a.TC.has(state, a.TC.workId(day), now); a.calendarSpatial = () => true; a.calendarPlace = x => x;
  a.calendarCancelled = () => false; a.homeExact = () => places[0]; a.calDirectSet = () => ({}); a.tripCancelBeforeFirst = () => places[0]; a.tripCancelRouteLeg = (_, l) => l; a.calendarTripKey = (_, l) => 'fixture|' + l.k;
  vm.runInContext(app.match(/^const cancelAffectedDay =.*;$/m)[0] + '\n' + app.slice(app.indexOf('function effLegs('), app.indexOf('function altHtml(')), a);
  assert.equal(a.effLegs(e)[0].from.id, 'home'); assert.deepEqual(a.TRIPCANCEL, {});
});
check('Congé ne transforme pas le lieu confirmé Travail en origine Domicile', () => {
  const a = appFixture(), app = fs.readFileSync(require('node:path').resolve(__dirname, '../src/app.js'), 'utf8');
  a.S.locs = places.slice(0, 2); a.S.customs = [places[2]]; a.S.work = { from: 'home', to: 'work', days: [2], dep: '07:00', ret: '18:00' };
  a.USER_STORE.state.dayContext.dayType = { date: '2026-10-06', value: 'off' }; a.TRIPCANCEL = {}; a.workCancelled = () => false; a.commuteDays = x => x;
  a.placeToday = () => '2026-10-06'; a.liveNow = () => '2026-10-06T17:30'; a.placeNow = () => ({ source: 'manual', confirmed: { at: now }, place: places[1] });
  vm.runInContext(app.slice(app.indexOf('function tripCancelBeforeFirst('), app.indexOf('const tripCancelRouteKey')), a);
  assert.equal(a.tripCancelBeforeFirst({ s: '2026-10-06T18:30' }).id, 'work');
});
check('AGENDA : Aveluy confirmé sans GPS invalide la route calculée depuis Domicile pour le prochain aller uniquement', () => {
  const a = appFixture();
  a.locHasCoords = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  a.calendarSpatial = () => true; a.calendarCancelled = () => false;
  a.calendarTripKey = (e, leg) => e.id + '|' + leg.k;
  a.distKm = (x, y) => x.id === y.id ? 0 : 30;
  a.placeNow = () => ({ source: 'manual', confirmed: { at: now }, place: places[2] });
  const old = { k: 'go', from: places[0], to: places[1], dep: '2026-10-06T18:00', arr: '2026-10-06T18:20',
    km: 39, min: 41, routed: true, pts: [{ lat: 48.86, lon: 2.30 }], g: [[48.85, 2.35], [48.9, 2.25]] };
  const later = { ...old, dep: '2026-10-06T20:00', arr: '2026-10-06T20:20' };
  const first = { id: 'maif', s: '2026-10-06T18:30', mode: 'auto', legs: [old] };
  const second = { id: 'concert', s: '2026-10-06T20:30', mode: 'auto', legs: [later] };
  a.CAL = { events: [first, second] };
  const adapted = a.appAgendaLeg(first, old);
  assert.equal(adapted.from.id, 'b'); assert.equal(adapted.from.city, 'Lieu B');
  assert.equal(adapted.originName, 'Lieu B'); assert.equal(adapted.targetArr, old.arr);
  assert.equal(adapted.originRecalc, true); assert.equal(adapted.originPending, true);
  assert.equal(adapted.km, null); assert.equal(adapted.min, null); assert.equal(adapted.routed, false);
  assert.deepEqual(Array.from(adapted.g), []); assert.deepEqual(Array.from(adapted.pts), []);
  assert.equal(old.from.id, 'home'); assert.equal(old.km, 39); assert.equal(old.g.length, 2);
  assert.equal(a.appAgendaLeg(second, later), later, 'prochain rendez-vous ultérieur préservé');
  const back = { ...old, k: 'ret' };
  assert.equal(a.appAgendaLeg(first, back), back, 'retour préservé');
  first.mode = 'maison'; assert.equal(a.appAgendaLeg(first, old), old, 'consigne #maison respectée');
  first.mode = 'auto';
  a.placeNow = () => ({ source: 'last', place: places[2] });
  assert.equal(a.appAgendaLeg(first, old), old, 'dernier lieu estimé ne remplace pas le planning');
  a.placeNow = () => ({ source: 'manual', confirmed: { at: now - 86400000 }, place: places[2] });
  assert.equal(a.appAgendaLeg(first, old), old, 'confirmation de la veille non imposée');
  a.placeNow = () => ({ source: 'manual', confirmed: { at: now }, place: places[0] });
  assert.equal(a.appAgendaLeg(first, old), old, 'pas de recalcul si origine identique');
});
check('observation GPS cohérente plus récente invalide une ancienne origine sans inventer de destination', () => {
  const a = appFixture(); a.placeToday = () => '2026-10-06'; a.placeNow = () => ({ source: 'last', place: places[1] });
  a.PLACE = { last: { placeId: 'work', at: now, source: 'gps' } }; a.USER_STORE.state.dayContext = { lastConfirmedPlace: conf(now - 3600000), nextDestination: choice('b') };
  assert.equal(a.appRealOrigin(), null); assert.equal(a.appDay().nextDestination.placeId, 'b');
});
check('E13/E14 navigation et arrivée Agenda suivent uniquement la destination du trajet courant', () => {
  const a = appFixture(), app = fs.readFileSync(require('node:path').resolve(__dirname, '../src/app.js'), 'utf8');
  a.homeExact = () => places[0]; a.locHasCoords = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  vm.runInContext(app.slice(app.indexOf('function liveDest('), app.indexOf('const liveOut')) + ['legNavTo', 'tripTo', 'liveArrDest'].map(n => app.match(new RegExp('^const ' + n + ' =.*;$', 'm'))[0]).join('\n') + ';this.nav={legNavTo,tripTo,liveArrDest};', a);
  const original = { k: 'ret', from: places[1], to: places[0] }, chosen = { ...D.returnLeg(original, 'current', { nextDestination: choice('b') }, now, places), originPending: false };
  assert.equal(a.nav.legNavTo(chosen).id, 'b'); assert.equal(a.nav.tripTo({ src: 'cal', l: chosen, planL: chosen }).id, 'b'); assert.equal(a.nav.liveArrDest({ src: 'cal', l: chosen }).lon, places[2].lon);
  const future = D.returnLeg(original, 'future', { nextDestination: choice('b') }, now, places);
  assert.equal(a.nav.tripTo({ src: 'cal', l: future }).id, 'home'); assert.equal(a.nav.liveArrDest({ src: 'cal', l: future }).id, 'home');
});
check('destination inconnue : aucun ETA ou durée du commute inventé', () => {
  const a = appFixture(); a.S.work = { durMin: 40 }; a.locById = id => places.find(p => p.id === id); a.TRIPSTART = null;
  a.addMin = (s, m) => new Date(Date.parse(s + ':00Z') + m * 60000).toISOString().slice(0, 16); a.USER_STORE.state.dayContext.nextDestination = choice(null);
  const trip = a.appLocalTrips([], '2026-10-06T17:30')[0]; assert.equal(trip.l.min, null); assert.equal(trip.arr, null); assert.equal(trip.to, 'Destination à confirmer');
});
check('libellé Travail → Lieu B ne prétend pas rentrer au domicile ; vrai retour Maison conservé', () => {
  const a = appFixture(); a.S.locs = places.slice(0, 2); a.S.work = { from: 'home', to: 'work' };
  const td = { dir: 'ret', LA: places[1], LB: places[2], fromName: 'Travail test', toName: 'Lieu B' };
  assert.equal(a.appCommuteLabel(td), 'Trajet · Travail test → Lieu B');
  assert.equal(a.appCommuteLabel({ ...td, LB: places[0], toName: 'Domicile test' }), 'Retour domicile-travail');
});
check('destination manuelle plus récente remplace aussi le trajet Agenda aller courant', () => {
  const l = { k: 'go', from: places[1], to: places[0], min: 30 };
  assert.equal(D.returnLeg(l, 'current', { nextDestination: choice('b') }, now, places).to.id, 'b');
});
check('voiture active sans pneus : météo route conservée, aucun verdict d’une autre voiture', () => {
  const a = appFixture(), app = fs.readFileSync(require('node:path').resolve(__dirname, '../src/app.js'), 'utf8');
  vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/engine.js'), 'utf8'), a);
  a.appSetCar('b'); a.PT_TTL = 3600000; a.LEGM = { route: { t: now, models: [{}] } }; a.legKey = () => 'route'; a.locHasCoords = () => true;
  a.legSeq = () => [{ hs: [{}], i: 0 }]; a.legPoints = () => []; a.summarize = () => ({}); a.legCritical = () => null;
  vm.runInContext(app.slice(app.indexOf('function legEval('), app.indexOf('function calDirectSet(')), a);
  const r = a.legEval({ from: places[0], to: places[1], dep: '2026-10-06T17:30', min: 30 }); assert.equal(r.res, null); assert.equal(r.seq.length, 1); assert.equal(r.worst, null);
});
check('audit A05 · point manuel : département, commune et code postal conservés, valeurs invalides retirées', () => {
  const ok = D.cleanPoint({ id: 'manual-destination', name: 'Place fictive', lat: 45.9, lon: 6.13, deptCode: '74', dept: 'Haute-Savoie', city: 'Annecy', cityCode: '74010', postcode: '74000' }, 'x');
  assert.deepEqual([ok.deptCode, ok.dept, ok.city, ok.cityCode, ok.postcode], ['74', 'Haute-Savoie', 'Annecy', '74010', '74000']);
  const bad = D.cleanPoint({ id: 'm', lat: 45.9, lon: 6.13, deptCode: '74; DROP', cityCode: 'abc', postcode: '7400' }, 'x');
  assert.deepEqual([bad.deptCode, bad.dept, bad.cityCode, bad.postcode], ['', '', '', '']);
  assert.equal(D.cleanPoint({ id: 'c', lat: 41.9, lon: 8.7, deptCode: '2a' }, 'x').deptCode, '2A');
});
console.log(`${n}/${n + fail} scénarios OK`); process.exit(fail ? 1 : 0);
