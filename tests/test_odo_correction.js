// Correction d'un relevé du compteur (16/11/2026), valeurs FICTIVES : jamais d'effacement ; un marqueur { d, km, void: 1 }
// annule l'ancienne valeur et se propage par la fusion PC ↔ iPhone existante (union des relevés), dans les deux sens.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8');
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Error, isFinite }; vm.createContext(ctx);
vm.runInContext(read('garage.js') + read('journal-archive.js') + read('debrief.js') + read('sync-merge.js') + read('app/inbox-core.js') +
  read('tyrestate.js') + ';this.G=Garage;this.M=SyncMerge;this.I=RcInbox;this.TS={tyreState,mountWinter:typeof mountWinter==="function"?mountWinter:null};', ctx);
const G = ctx.G, json = v => JSON.parse(JSON.stringify(v));
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const BAD = [{ d: '2026-10-18', km: 21100 }, { d: '2026-10-25', km: 211300 }, { d: '2026-11-01', km: 211650 }, { d: '2026-11-08', km: 212000 }];
const live = l => json(G.odoLive(l)).map(o => o.d + ':' + o.km).join(',');

test('corriger = marqueur d’annulation + valeur juste ; rien n’est retiré, la liste reçue est intacte', () => {
  const before = json(BAD), next = json(G.odoReplace(BAD, '2026-10-18', 210950));
  assert.equal(JSON.stringify(BAD), JSON.stringify(before), 'liste d’origine non modifiée');
  assert.ok(next.some(o => o.d === '2026-10-18' && o.km === 21100 && !o.void), 'ancienne valeur conservée');
  assert.ok(next.some(o => o.d === '2026-10-18' && o.km === 21100 && o.void === 1), 'marqueur d’annulation');
  assert.equal(live(next), '2026-10-18:210950,2026-10-25:211300,2026-11-01:211650,2026-11-08:212000');
  const tr = G.odoTrend({ odo: next }, { today: '2026-11-16' });
  assert.equal(tr.suspect, null); assert.equal(tr.totalKm, 1050); assert.equal(tr.count, 4);
});
test('annuler sans remplacer : le relevé ne compte plus', () => {
  const next = json(G.odoReplace(BAD, '2026-10-18', null));
  assert.equal(live(next), '2026-10-25:211300,2026-11-01:211650,2026-11-08:212000'); assert.equal(next.length, 5);
});
test('idempotent : la même correction deux fois n’ajoute rien', () => {
  const once = json(G.odoReplace(BAD, '2026-10-18', 210950)), twice = json(G.odoReplace(once, '2026-10-18', 210950));
  assert.equal(JSON.stringify(once), JSON.stringify(twice));
});
test('re-corriger : la valeur intermédiaire est à son tour annulée', () => {
  const a = json(G.odoReplace(BAD, '2026-10-18', 210000)), b = json(G.odoReplace(a, '2026-10-18', 210950));
  assert.equal(json(G.odoLive(b)).filter(o => o.d === '2026-10-18').map(o => o.km).join(','), '210950');
});
// Synchronisation : un appareil corrige, l'autre a encore l'ancienne liste. La fusion existante (union) doit garder l'annulation.
const car = odo => ({ id: 'voitureA', short: 'A', tire: { type: 'summer', dot: '', treads: [] }, odo });
const settings = odo => ({ v: 1, configured: 1, cars: [car(odo), { id: 'voitureB', short: 'B', tire: { type: 'summer', dot: '', treads: [] }, odo: [] }], calib: [], journal: {}, edits: { 'cars.0.odo': 1 } });
test('synchronisation PC corrigé ↔ iPhone ancien : la correction gagne dans les deux sens, l’ancienne valeur ne revient pas', () => {
  const fixed = json(G.odoReplace(BAD, '2026-10-18', 210950)), stamps = { 'cars.0.odo': 1 };
  const a = json(ctx.M.settings(settings(fixed), settings(json(BAD)), stamps, stamps));
  const b = json(ctx.M.settings(settings(json(BAD)), settings(fixed), stamps, stamps));
  for (const r of [a, b]) assert.equal(live(r.settings.cars[0].odo), '2026-10-18:210950,2026-10-25:211300,2026-11-01:211650,2026-11-08:212000');
});
test('synchronisation : un nouveau relevé saisi sur l’autre appareil s’ajoute sans annuler la correction', () => {
  const fixed = json(G.odoReplace(BAD, '2026-10-18', 210950)), other = [...json(BAD), { d: '2026-11-15', km: 212350 }], stamps = { 'cars.0.odo': 1 };
  const r = json(ctx.M.settings(settings(fixed), settings(other), stamps, stamps));
  assert.equal(live(r.settings.cars[0].odo), '2026-10-18:210950,2026-10-25:211300,2026-11-01:211650,2026-11-08:212000,2026-11-15:212350');
});
test('boîte de dépôt : la valeur annulée n’est plus « déjà enregistrée » et ne bloque pas le jour corrigé', () => {
  const c = { id: 'a', name: 'Voiture test', tire: { type: 'summer' }, odo: json(G.odoReplace(BAD, '2026-10-18', null)) };
  const deps = { kmJump: G.kmJump, switchTire: () => {}, setTreadAxle: () => {}, treadAxles: () => [], maxTreads: 60, addEntry: () => {} };
  const r = ctx.I.apply(c, { type: 'odometer', date: '2026-10-18', values: { km: 210950 } }, deps);
  assert.equal(live(json(r.car.odo)).split(',')[0], '2026-10-18:210950');
  const raw = { ...c, odo: json(BAD) };
  assert.equal(ctx.I.kmConflict(raw, '2026-10-20', 20000).km, 21100, 'avant annulation : 21 100 km sert de référence');
  assert.equal(ctx.I.kmConflict(c, '2026-10-20', 20000), null, 'après annulation : la valeur annulée n’est plus une référence de chronologie');
});
test('lecteurs : état des pneus et rythme ignorent la valeur annulée', () => {
  const c = { id: 'a', tire: { type: 'summer', mounted: '2026-10-01', mountKm: 210000 }, odo: json(G.odoReplace(BAD, '2026-10-18', 210950)) };
  assert.ok(G.kmPerDay(c.odo) > 0);
  assert.equal(json(G.odoLive(c.odo)).some(o => o.km === 21100), false);
});
console.log(`\n${n}/${n} contrôles « correction d’un relevé »`);
