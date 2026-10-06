'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = { Date, Intl, JSON, Object, Number, Array, Set, Math };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/userctx.js'), 'utf8') + ';this.api = typeof DayContext === "undefined" ? null : DayContext; this.store = userContextStore;', ctx);
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
if (process.env.LOT === 'A') { console.log(`${n}/${n + fail} scénarios OK`); process.exit(fail ? 1 : 0); }
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
    USER_STORE: { state: { dayContext: {} } }, placeList: () => places, hasTires: car => car.tire.type !== 'none', appAction: fn => fn() };
  c.TCARS = () => c.S.cars.filter(c.hasTires); vm.createContext(c); vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname, '../src/app/day-context.js'), 'utf8'), c); return c;
}
check('voiture configurée sans monte renseignée reste sélectionnable, sans analyser les autres voitures', () => {
  const a = appFixture(); a.appSetCar('b'); assert.equal(a.appDay().activeCarId, 'b'); assert.equal(a.appTripCars()[0].id, 'b');
});
check('arrivée explicite plus récente efface le départ précédent pour la prochaine origine', () => {
  const a = appFixture(); a.USER_STORE.state.dayContext.departedAt = now; a.appConfirmedPlace('b', now); assert.equal(D.morningOrigin(a.appDay(), now + 1000, places).id, 'b');
});
console.log(`${n}/${n + fail} scénarios OK`); process.exit(fail ? 1 : 0);
