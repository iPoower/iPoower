'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/backup.js'), 'utf8');
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp }; vm.createContext(ctx); vm.runInContext(source + ';this.api=Backup;', ctx);
const B = ctx.api, json = v => JSON.parse(JSON.stringify(v));
const at = Date.parse('2026-10-07T10:30:00+02:00');
let n = 0; const check = (name, fn) => { try { fn(); n++; console.log('✅ ' + name); } catch (e) { console.error('❌ ' + name + ' · ' + e.message); throw e; } };
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
check('ancienne sauvegarde V1 importable ; sans état du téléphone, rien n’est inventé', () => {
  const p = B.restorePlan({ app: 'twrc', v: 1, at: new Date(at).toISOString(), settings: { old: 1 }, view: 'pneus' }, at);
  assert(p); assert.equal(JSON.parse(p.writes['twrc.settings.v1']).old, 1); assert(!p.writes['twrc.context.v1']); assert.equal(p.kept, 0);
  for (const k of ['twrc.context.v1', 'twrc.tyretherm.v1', 'twrc.tripcancel']) assert(p.remove.includes(k));
});
const v1 = { app: 'twrc', v: 1, at: new Date(at).toISOString(), settings: { old: 1 }, view: 'pneus' };
const phone = { context: state, tyreTherm: { car1: { at: '2026-10-07T07:10', T: 21.4, sig: 'summer' } }, tripCancel: { 'work-2026-10-08': { at: at - 1000, exp: at + 5000 } } };
check('V1 : le journal des trajets, les trajets clos et les annulations du téléphone sont conservés', () => {
  const p = B.restorePlan(v1, at, phone), c = JSON.parse(p.writes['twrc.context.v1']);
  assert.equal(p.kept, 1); assert.equal(c.debrief.entries.length, 1); assert.equal(c.debrief.entries[0].key, 'd1');
  assert.deepEqual(json(c.debrief.entries[0].feedback), { at: at - 500, conditions: ['fog'], grip: 'normal' });
  assert(c.done.x); assert.equal(c.lastArrival.key, 'd1'); assert.equal(c.debrief.active, null);
  // l'état propre à l'appareil repart de zéro
  assert.equal(c.gps, null); assert.equal(c.place.conf, null); assert.equal(c.dayContext.nextDestination, null); assert.equal(c.dayContext.activeCarId, null);
  assert(!JSON.stringify(c).includes('"lat"')); assert(!JSON.stringify(c).includes('"lon"'));
  assert(JSON.parse(p.writes['twrc.tripcancel'])['work-2026-10-08']); assert.equal(JSON.parse(p.writes['twrc.tyretherm.v1']).car1.T, 21.4);
  assert(!p.remove.includes('twrc.context.v1')); for (const k of ['twrc.gps', 'twrc.place.v1', 'twrc.tripstart.v1', 'twrc.debrief.v1', 'twrc.tripdone']) assert(p.remove.includes(k));
});
check('incident du 7 octobre : débrief du matin donné, import V1 → le trajet reste clos et la réponse reste', () => {
  const morning = { key: 'work-2026-10-07|aller', at: Date.parse('2026-10-07T07:12:00+02:00'), how: 'auto', name: 'Aller travail', from: 'home', to: 'work',
    feedback: { at: Date.parse('2026-10-07T07:20:00+02:00'), conditions: ['wet'], grip: 'normal' }, deferred: false };
  const p = B.restorePlan(v1, at, { context: { debrief: { active: null, entries: [morning] }, done: { [morning.key]: { at: morning.at, exp: morning.at + 864e5, how: 'auto' } } } });
  const c = JSON.parse(p.writes['twrc.context.v1']), e = c.debrief.entries.find(x => x.key === morning.key);
  assert(e && e.feedback && e.feedback.grip === 'normal'); assert(c.done[morning.key]);
});
check('V2 : journal fusionné par trajet — le retour renseigné l’emporte, les trajets récents du téléphone s’ajoutent', () => {
  const bk = B.make({ settings: { x: 1 }, context: { ...state, debrief: { active: null, entries: [{ ...state.debrief.entries[0], feedback: null }] } }, at: new Date(at).toISOString() });
  const newer = { key: 'd2', at: at + 60000, how: 'confirmé', name: 'Retour', from: 'B', to: 'A', feedback: null, deferred: true };
  const p = B.restorePlan(bk, at + 120000, { context: { ...state, debrief: { active: null, entries: [newer, state.debrief.entries[0]] }, done: { d2: { at: at + 60000, exp: at + 9e6, how: 'confirmé' } } } });
  const c = JSON.parse(p.writes['twrc.context.v1']);
  assert.deepEqual(c.debrief.entries.map(e => e.key), ['d2', 'd1']); assert.equal(c.debrief.entries[1].feedback.grip, 'normal');
  assert(c.done.d2 && c.done.x); assert.equal(p.kept, 1);
  assert.equal(c.place.conf.placeId, 'work');   // le contexte métier vient bien de la sauvegarde V2
});
check('V2 : deux retours pour le même trajet → le plus récent ; journal plafonné à 60 trajets, plus récents d’abord', () => {
  const e = (key, t, f) => ({ key, at: t, how: 'auto', name: '', from: '', to: '', feedback: f ? { at: f, conditions: [], grip: 'reduced' } : null });
  const bk = B.make({ settings: {}, context: { debrief: { entries: [{ ...e('k', at, at + 10), feedback: { at: at + 10, conditions: ['rain'], grip: 'slip' } }] } }, at: new Date(at).toISOString() });
  const many = Array.from({ length: 70 }, (_, i) => e('m' + i, at - (i + 1) * 1000));
  const p = B.restorePlan(bk, at, { context: { debrief: { entries: [e('k', at, at + 20), ...many] } } }), c = JSON.parse(p.writes['twrc.context.v1']);
  const k = c.debrief.entries.find(x => x.key === 'k'); assert.equal(k.feedback.grip, 'reduced');
  assert.equal(c.debrief.entries.length, 60); assert(c.debrief.entries.every((x, i, a) => !i || a[i - 1].at >= x.at));
});
check('V2 conserve un trajet manuel programmé avec points normalisés, sans GPS ni trace', () => {
  const manual = { ...state, dayContext: { ...state.dayContext, nextDestination: {
    placeId: 'manual-destination', source: 'manual', confirmedAt: at - 2000, expiresAt: at + 2 * 864e5,
    originId: 'work', originPoint: null, destinationPoint: { id:'manual-destination', name:'29 Rue Jean Jaurès 80610 Saint-Ouen',
      address:'29 Rue Jean Jaurès, 80610 Saint-Ouen', lat:50.04, lon:2.11, provider:'IGN/BAN', precision:'housenumber' },
    tripKey:'manual|1', dep:'2026-10-08T17:15', createdAt:at - 2000, updatedAt:at - 1000
  } } };
  const d = B.make({ settings:{}, context:manual, at:new Date(at).toISOString() });
  const n = d.durable.context.dayContext.nextDestination;
  assert.equal(n.source,'manual'); assert.equal(n.dep,'2026-10-08T17:15'); assert.equal(n.destinationPoint.provider,'IGN/BAN');
  assert.equal(n.destinationPoint.address,'29 Rue Jean Jaurès, 80610 Saint-Ouen');
  assert.equal(d.durable.context.gps,null); assert.equal(d.durable.context.place.extra,null); assert(!/"route"\s*:/.test(JSON.stringify(d.durable.context)));
});
check('dernier roulage déclaré : provenance et incertitude conservées après sauvegarde V2 et import V1', () => {
  const history = { at: '2026-10-07T07:10', T: 21.4, sig: 'summer', source: 'manual', minutes: 40, kind: 'route', lat: 9, lon: 8 };
  const expected = { at: history.at, T: history.T, sig: history.sig, source: 'manual', minutes: 40, kind: 'route' };
  const d = B.make({ settings: {}, tyreTherm: { car1: history }, at: new Date(at).toISOString() });
  assert.deepEqual(json(d.durable.tyreTherm.car1), expected);
  for (const [data, current] of [[d, {}], [v1, { ...phone, tyreTherm: { car1: history } }]]) {
    const p = B.restorePlan(data, at, current);
    assert.deepEqual(JSON.parse(p.writes['twrc.tyretherm.v1']).car1, expected);
  }
});
check('dernier roulage déclaré invalide : jamais restauré comme historique automatique', () => {
  for (const invalid of [{ minutes: 0 }, { minutes: 721 }, { minutes: 2.5 }, { minutes: '40' }, { kind: 'piste' }]) {
    const d = B.make({ settings: {}, tyreTherm: { car1: { at: '2026-10-07T07:10', T: 21.4, sig: 'summer', source: 'manual', minutes: 40, kind: 'route', ...invalid } } });
    assert.deepEqual(json(d.durable.tyreTherm), {});
  }
});
check('payload invalide refusé', () => {
  assert.equal(B.restorePlan(null, at), null); assert.equal(B.restorePlan({ app: 'other', settings: {} }, at), null); assert.equal(B.restorePlan({ app: 'twrc' }, at), null);
});
check('intégration build et interface utilise le module V2', () => {
  const build = fs.readFileSync(path.resolve(__dirname, '../tools/build.js'), 'utf8'), app = fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8');
  assert(build.includes("r('src/backup.js')")); assert(app.includes('Backup.make({')); assert(app.includes('Backup.restorePlan(data')); assert(app.includes('Sauvegarde V2 prête'));
});
console.log(`${n}/${n} scénarios OK`);
