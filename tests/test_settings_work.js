// Réglages hérités de « + Destination » : données fictives, stockage local simulé.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8').split('let S = loadSettings();')[0];
const make = () => {
  const data = new Map(), storage = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const ctx = { window: {}, location: { hash: '' }, document: { querySelector: () => null }, localStorage: storage, console };
  vm.createContext(ctx); vm.runInContext(source + ';this.repair = repairStoredWork; this.load = loadSettings; this.base = BASE;', ctx);
  return { ctx, storage };
};
const fixture = ctx => ({ ...JSON.parse(JSON.stringify(ctx.base)), configured: 1,
  customs: [{ id: 'c-old', name: 'Destination test', lat: 48.7, lon: 1 }],
  work: { ...ctx.base.work, to: 'c-old' }, edits: { customs: 1 }, journal: { kept: 1 } });
let count = 0; const test = (name, f) => { f(); count++; console.log('✅ ' + name); };
test('ancien ajout : travail restauré, destination et autres données conservées', () => {
  const { ctx, storage } = make(), s = fixture(ctx), before = JSON.stringify(s);
  assert.equal(ctx.repair(s), true); assert.equal(s.work.to, 'work');
  const original = JSON.parse(before); original.work.to = 'work'; assert.equal(JSON.stringify(s), JSON.stringify(original));
  assert.equal(JSON.parse(storage.getItem('twrc.settings.v1')).work.to, 'work');
  assert.equal(ctx.repair(s), false);
});
test('confirmation du faux travail supprimée sans inventer de position', () => {
  const { ctx, storage } = make(), s = fixture(ctx);
  storage.setItem('twrc.place.v1', JSON.stringify({ conf: { placeId: 'c-old', at: 100 }, last: { placeId: 'c-old', at: 100 } }));
  ctx.repair(s); const p = JSON.parse(storage.getItem('twrc.place.v1')); assert.equal(p.conf, null); assert.equal(p.last, null);
});
test('confirmation d’un autre lieu conservée', () => {
  const { ctx, storage } = make(), s = fixture(ctx), p = { conf: { placeId: 'home', at: 100 }, last: { placeId: 'home', at: 100 } };
  storage.setItem('twrc.place.v1', JSON.stringify(p)); ctx.repair(s); assert.equal(storage.getItem('twrc.place.v1'), JSON.stringify(p));
});
test('travail custom choisi explicitement conservé', () => {
  for (const k of ['work.to', 'work']) { const { ctx } = make(), s = fixture(ctx); s.edits[k] = 1; assert.equal(ctx.repair(s), false); assert.equal(s.work.to, 'c-old'); }
});
test('aucun ajout manuel : configuration importée préservée', () => {
  const { ctx } = make(), s = fixture(ctx); delete s.edits; assert.equal(ctx.repair(s), false); assert.equal(s.work.to, 'c-old');
});
test('autre destination que le dernier ajout : aucune réparation conjecturale', () => {
  const { ctx } = make(), s = fixture(ctx); s.customs.push({ id: 'c-next', name: 'Autre test' }); assert.equal(ctx.repair(s), false);
});
test('chargement et rechargement utilisent le travail réparé', () => {
  const { ctx, storage } = make(), s = fixture(ctx); storage.setItem('twrc.settings.v1', JSON.stringify(s));
  assert.equal(ctx.load().work.to, 'work'); assert.equal(ctx.load().work.to, 'work');
});
test('stockage de position illisible : réparation des réglages conservée', () => {
  const { ctx, storage } = make(), s = fixture(ctx); storage.setItem('twrc.place.v1', '{broken'); assert.equal(ctx.repair(s), true);
});
console.log(count + '/' + count + ' scénarios OK');
