'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..'), context = { Date, JSON, Object, Number, Array, Set, Math };
vm.createContext(context); vm.runInContext(fs.readFileSync(root + '/src/debrief.js', 'utf8') + fs.readFileSync(root + '/src/userctx.js', 'utf8') + ';this.store=userContextStore;', context);
const t = Date.parse('2026-10-05T06:50:00+02:00'), mem = new Map(), puts = [];
const read = k => mem.get(k) || null, write = (k, v) => { puts.push([k, v]); if (v == null) mem.delete(k); else mem.set(k, v); };
const make = () => context.store({ read, write, now: () => t });
const json = value => JSON.parse(JSON.stringify(value)); let n = 0;
function check(label, fn) { fn(); n++; console.log('✅ ' + label); }
mem.set('twrc.place.v1', JSON.stringify({ conf: { placeId: 'work', at: t - 1000, day: '2026-10-05', how: 'manual' }, last: { placeId: 'work', at: t - 1000 } }));
mem.set('twrc.tripdone', JSON.stringify({ aller: { how: 'confirmé', at: t - 1000, exp: t + 86400000 }, ancien: { how: 'auto', at: t - 90000000, exp: t - 1000 } }));
mem.set('twrc.tripstart.v1', JSON.stringify({ key: 'retour', at: t - 500, o: { lat: 48.9, lon: 2.25 } }));
let s = make();
check('migration : lieu confirmé, trajet clôturé et départ conservés ensemble ; arrivées expirées purgées', () => {
  assert.equal(s.state.place.conf.placeId, 'work'); assert.deepEqual(Object.keys(s.state.done), ['aller']); assert.equal(s.state.tripStart.key, 'retour');
  assert.equal(JSON.parse(mem.get(s.key)).place.conf.placeId, 'work');
});
check('le document canonique prévaut sur une ancienne copie locale contradictoire', () => {
  mem.set('twrc.place.v1', JSON.stringify({ conf: { placeId: 'home', at: t } })); const loaded = make(); assert.equal(loaded.state.place.conf.placeId, 'work');
});
let emissions = 0; s.subscribe(() => { emissions++; assert.equal(s.state.tripStart, null); assert.equal(s.state.place.conf.placeId, 'work'); assert(s.state.done.retour); });
check('arrivée atomique : aucun abonné ne voit un lieu arrivé avec un trajet encore actif', () => {
  s.transaction(state => { state.place.conf = { placeId: 'work', at: t }; s.transaction(state => { state.tripStart = null; state.done.retour = { how: 'confirmé', at: t, exp: t + 86400000 }; }); });
  assert.equal(emissions, 1); assert.equal(puts.at(-8)[0], s.key);
});
check('reload et réouverture : le même contexte complet est hydraté', () => { assert.deepEqual(json(make().state), json(s.state)); });
check('événement storage : les autres fenêtres adoptent le dernier état sans reload', () => {
  const other = make(); let seen = 0; other.subscribe(() => seen++);
  s.transaction(state => { state.place.last = { placeId: 'work', at: t }; });
  assert(other.receive(mem.get(s.key))); assert.equal(seen, 1); assert.deepEqual(json(other.state), json(s.state));
});
check('deux changements avec la même horloge augmentent la révision ; un événement tardif est rejeté', () => {
  const old = mem.get(s.key), prior = s.state.revision;
  s.transaction(state => { state.place.last.source = 'manual'; }); assert(s.state.revision > prior); assert.equal(s.receive(old), false);
});
check('JSON corrompu, GPS impossible, timestamp futur et ancien départ ne deviennent pas une réalité', () => {
  const dirty = new Map([['twrc.context.v1', JSON.stringify({ v: 1, place: { conf: { placeId: 'work', at: t + 120000 } }, gps: { lat: 150, lon: 2, t, acc: 10 }, tripStart: { key: 'ancien', at: t - 13 * 3600e3 }, done: {} })]]);
  const x = context.store({ read: k => dirty.get(k), write: (k, v) => dirty.set(k, v), now: () => t }); assert.equal(x.state.place.conf, null); assert.equal(x.state.gps, null); assert.equal(x.state.tripStart, null);
  assert.doesNotThrow(() => context.store({ read: () => '{invalid', write: () => {}, now: () => t }));
});
check('stockage refusé : l’action reste cohérente en mémoire et est publiée une seule fois', () => {
  const x = context.store({ read: () => null, write: () => { throw Error('quota'); }, now: () => t }); let seen = 0; x.subscribe(() => seen++);
  x.transaction(state => { state.place.conf = { placeId: 'work', at: t }; state.tripStart = null; }); assert.equal(x.state.place.conf.placeId, 'work'); assert.equal(seen, 1);
  assert.equal(x.durability().status, 'degraded'); assert.match(x.durability().error, /quota/); assert.equal(x.retry(), false);
});
check('stockage récupéré : l’état non durable est réécrit sans nouvelle action utilisateur', () => {
  const data = new Map(); let fail = true;
  const x = context.store({ read: k => data.get(k) || null, write: (k, v) => { if (k === 'twrc.context.v1' && fail) throw Error('temporaire'); if (v == null) data.delete(k); else data.set(k, v); }, now: () => t });
  x.transaction(state => { state.place.conf = { placeId: 'work', at: t }; });
  assert.equal(x.durability().status, 'degraded'); assert.equal(data.has(x.key), false);
  fail = false; assert.equal(x.retry(), true); assert.equal(x.durability().status, 'durable');
  assert.equal(JSON.parse(data.get(x.key)).place.conf.placeId, 'work');
});
check('hydratation : une confirmation d’arrivée plus récente clôture un ancien départ contradictoire', () => {
  const data = new Map([['twrc.context.v1', JSON.stringify({ v: 1, place: { conf: { placeId: 'work', at: t } }, tripStart: { key: 'go', at: t - 120000 }, done: {} })]]);
  const x = context.store({ read: k => data.get(k), write: (k, v) => data.set(k, v), now: () => t });
  assert.equal(x.state.place.conf.placeId, 'work'); assert.equal(x.state.tripStart, null);
  assert.equal(JSON.parse(data.get(x.key)).tripStart, null);
});
check('ancienne page qui ignore le champ : débrief récupéré, effacement canonique respecté', () => {
  const record = { key: 'trip', at: t - 1000, how: 'confirmé', name: 'Test', start: null, end: null,
    feedback: { at: t - 500, conditions: ['fog'], grip: 'unknown' }, deferred: false };
  const data = new Map([['twrc.context.v1', JSON.stringify({ v: 1, done: {}, place: {} })],
    ['twrc.debrief.v1', JSON.stringify({ active: null, entries: [record] })]]);
  const x = context.store({ read: k => data.get(k), write: (k, v) => { if (v == null) data.delete(k); else data.set(k, v); }, now: () => t });
  assert.equal(x.state.debrief.entries.length, 1); assert.deepEqual(json(x.state.debrief.entries[0].feedback.conditions), ['fog']);
  x.transaction(state => { state.debrief.entries = []; });
  assert.equal(JSON.parse(data.get('twrc.debrief.v1')).entries.length, 0);
  assert.equal(context.store({ read: k => data.get(k), write: () => {}, now: () => t }).state.debrief.entries.length, 0);
});
check('snapshot orphelin et ancienne page après fin de trajet : aucune prévision active restaurée', () => {
  const data = new Map([['twrc.context.v1', JSON.stringify({ v: 1, done: {}, place: {} })],
    ['twrc.debrief.v1', JSON.stringify({ active: { key: 'go', at: t - 1000 }, entries: [] })]]);
  const x = context.store({ read: k => data.get(k), write: (k, v) => data.set(k, v), now: () => t });
  assert.equal(x.state.debrief.active, null);
});
console.log(`${n}/${n} scénarios OK`);
