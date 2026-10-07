'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/backup.js'), 'utf8');
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp }; vm.createContext(ctx); vm.runInContext(source + ';this.api=Backup;', ctx);
const B = ctx.api, json = v => JSON.parse(JSON.stringify(v));
const at = Date.parse('2026-10-07T10:30:00+02:00');
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const state = {
  updatedAt: at - 1000,
  dayContext: {
    nextDestination: { placeId: 'work', source: 'user', confirmedAt: at - 2000, expiresAt: at + 3600000, originId: 'home', tripKey: 'commute|x', dep: '2026-10-07T17:00' },
    lastConfirmedPlace: { placeId: 'work', at: at - 3000, source: 'manual' }, departedAt: at - 5000, arrivedAt: at - 3000,
    dayType: { date: '2026-10-07', value: 'work' }, activeCarId: 'car1', outfitChoice: { date: '2026-10-07', occasion: 'office' }
  },
  place: { conf: { placeId: 'work', at: at - 3000, how: 'arrival', day: '2026-10-07', lat: 49.9 }, last: { placeId: 'work', at: at - 3000, source: 'manual', lon: 2.2 }, extra: { lat: 1, lon: 2 } },
  gps: { lat: 49.9, lon: 2.2, acc: 12, t: at }, tripStart: { key: 'x', at: at, o: { lat: 1, lon: 2 } },
  tripEnd: { at, range: [20, 30] }, returnHome: { key: 'ret', at, exp: at + 10000 }, lastDeparture: { placeId: 'work', at },
  done: { x: { at: at - 1000, exp: at + 10000, how: 'confirmé', secret: 'non' } },
  debrief: { active: { key: 'x', at, gps: { lat: 1, lon: 2 } }, entries: [{ key: 'd1', at: at - 1000, how: 'confirmé', name: 'Trajet', from: 'A', to: 'B',
    start: { key: 'd1', at: at - 5000, name: 'Trajet', from: 'A', to: 'B', carId: 'car1', car: 'Auto',
      prediction: { known: true, conditions: ['fog'], fetchedAt: at - 6000, verdict: 'PRUDENCE', thermal: { s: 2, range: [10, 20], conf: 'moyenne' },
        evidence: { fogLevel: 2, trust: 'moyenne', proofs: ['preuve'], contradiction: false }, gps: { lat: 3, lon: 4 } } },
    end: { thermal: { s: 3, range: [20, 30], conf: 'moyenne' }, km: 42, kmSrc: 'route' },
    feedback: { at: at - 500, conditions: ['fog'], grip: 'normal', lat: 9 }, deferred: false, route: [{ lat: 1, lon: 2 }] }] },
  lastArrival: { key: 'd1', name: 'Travail', at: at - 1000, placeId: 'work', lat: 9 }
};
check('V2 conserve le contexte métier sans observation physique', () => {
  const d = B.make({ settings: { cars: [{ id: 'car1' }] }, view: 'analyse', context: state,
    tyreTherm: { car1: { at: '2026-10-07T10:00', T: 18.26, sig: 'summer' } },
    tripCancel: { 'work-2026-10-07': { at: at - 1000, exp: at + 5000 }, bad: { at, exp: at + 1 } }, at: new Date(at).toISOString() });
  assert.equal(d.v, 2); assert.equal(d.durable.context.place.conf.placeId, 'work'); assert.equal(d.durable.context.dayContext.activeCarId, 'car1');
  assert.equal(d.durable.context.gps, null); assert.equal(d.durable.context.tripStart, null); assert.equal(d.durable.context.tripEnd, null);
  assert.equal(d.durable.context.returnHome, null); assert.equal(d.durable.context.place.extra, null); assert.equal(d.durable.context.lastDeparture, null);
  assert.equal(d.durable.context.debrief.active, null); assert.equal(d.durable.context.debrief.entries.length, 1);
  assert(!JSON.stringify(d.durable.context).includes('"lat"')); assert(!JSON.stringify(d.durable.context).includes('"lon"'));
  assert.equal(d.durable.tyreTherm.car1.T, 18.3); assert(d.durable.tripCancel['work-2026-10-07']); assert(!d.durable.tripCancel.bad);
});
check('restauration V2 remplace le canonique et purge les états dérivés', () => {
  const d = B.make({ settings: { configured: 0, x: 1 }, view: 'meteo', context: state, tyreTherm: {}, tripCancel: {}, at: new Date(at).toISOString() });
  const p = B.restorePlan(d, at + 1000); assert(p);
  assert.equal(JSON.parse(p.writes['twrc.settings.v1']).configured, 1); assert.equal(p.writes['twrc.view'], 'meteo');
  const c = JSON.parse(p.writes['twrc.context.v1']); assert.equal(c.updatedAt, at + 1000); assert.equal(c.gps, null);
  assert(p.remove.includes('twrc.gps')); assert(p.remove.includes('twrc.tripstart.v1')); assert(p.remove.includes('twrc.calendar.sealed.v1'));
  assert(p.removePrefixes.includes('twrc.cache.')); assert(!Object.keys(p.writes).includes('twrc.runtime.v1'));
});
check('ancienne sauvegarde V1 reste importable sans mélanger le contexte actuel', () => {
  const p = B.restorePlan({ app: 'twrc', v: 1, at: new Date(at).toISOString(), settings: { old: 1 }, view: 'pneus' }, at);
  assert(p); assert.equal(JSON.parse(p.writes['twrc.settings.v1']).old, 1); assert(!p.writes['twrc.context.v1']);
  for (const k of ['twrc.context.v1', 'twrc.tyretherm.v1', 'twrc.tripcancel']) assert(p.remove.includes(k));
});
check('payload invalide refusé', () => {
  assert.equal(B.restorePlan(null, at), null); assert.equal(B.restorePlan({ app: 'other', settings: {} }, at), null); assert.equal(B.restorePlan({ app: 'twrc' }, at), null);
});
check('intégration build et interface utilise le module V2', () => {
  const build = fs.readFileSync(path.resolve(__dirname, '../tools/build.js'), 'utf8'), app = fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8');
  assert(build.includes("r('src/backup.js')")); assert(app.includes('Backup.make({')); assert(app.includes('Backup.restorePlan(data')); assert(app.includes('Sauvegarde V2 prête'));
});
console.log(`${n}/${n} scénarios OK`);
