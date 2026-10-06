// Lieux fictifs. Vérifie les décisions physiques et les transitions, pas les chaînes de rendu.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/placectx.js'), 'utf8');
function run(code = source) {
  const c = {}; vm.createContext(c); vm.runInContext(code + ';this.observe=placeObserve;this.context=placeContext;', c);
  const now = Date.parse('2026-10-05T10:00:00Z'), home = { id: 'home', kind: 'home', name: 'Maison test', lat: 48.85, lon: 2.35 }, work = { id: 'work', kind: 'work', name: 'Travail test', lat: 48.90, lon: 2.25 }, places = [home, work];
  const fix = (p = home, dt = 0, acc = 18) => ({ lat: p.lat, lon: p.lon, acc, ts: now + dt });
  const old = fix(home, -60e3), ctx = c.context({ now, places, fix: old });
  const O = extra => c.observe({ now, places, fix: fix(), previous: null, logical: null, context: {}, pending: null, ...extra });
  let n = 0;
  const test = (label, fn) => { fn(); n++; };
  for (const place of places) test(`${place.id} : premier point isolé en attente, second point cohérent reconnu`, () => {
    const first = O({ fix: fix(place) });
    assert(first.accept && first.hold); assert.equal(first.logical, null); assert.equal(first.pending.key, place.id);
    assert.equal(c.context({ now, places, fix: first.logical }).place, null);
    const second = O({ now: now + 5000, fix: fix(place, 5000), previous: fix(place), pending: first.pending });
    assert(second.accept && !second.hold); assert.equal(second.pending, null);
    assert.equal(c.context({ now: now + 5000, places, fix: second.logical }).place.id, place.id);
  });
  test('lieu inconnu conservé comme autre, sans faux domicile', () => assert.equal(c.context({ now, places, fix: O({ fix: fix({ lat: 48.86, lon: 2.36 }) }).logical }).place, null));
  test('une mesure navigateur à 6 km ne devient pas une adresse IP', () => { const r = O({ fix: fix(home, 0, 6000) }); assert(!r.accept); const p = c.context({ now, places, fix: fix(home, 0, 6000) }); assert.equal(p.source, 'coarse'); assert.equal(p.place, null); assert(!/VPN|IP/.test(p.badge)); });
  test('IP seule : lieu indéterminé, aucune géofence', () => { const p = c.context({ now, places, net: fix(home, 0, 6000) }); assert.equal(p.source, 'network'); assert.equal(p.place, null); assert.equal(p.originLock, null); assert(!/VPN/.test(p.badge)); });
  test('GPS précis + IP divergente : priorité GPS', () => assert.equal(c.context({ now, places, fix: fix(), net: fix(work, 0, 6000) }).place.id, 'home'));
  test('900 m ne remplace pas 18 m encore valide', () => { const r = O({ previous: old, logical: old, context: ctx, fix: fix(work, 0, 900) }); assert(!r.accept); assert.equal(r.logical, old); });
  test('mesure périmée', () => assert(!O({ fix: fix(home, -11 * 60e3) }).accept));
  test('horodatage futur', () => assert(!O({ fix: fix(home, 2 * 60e3) }).accept));
  test('état persistant futur ne devient pas un lieu fiable, réseau périmé ignoré', () => { assert.equal(c.context({ now, places, fix: fix(home, 2 * 60e3) }).source, 'none'); assert.equal(c.context({ now, places, net: fix(home, -60 * 60e3, 6000) }).source, 'none'); });
  test('réponse antérieure', () => assert(!O({ previous: fix(home), fix: fix(home, -1000) }).accept));
  test('coordonnées et précision invalides', () => { for (const f of [{ ...fix(), lat: 91 }, { ...fix(), lon: NaN }, { ...fix(), acc: -1 }, { ...fix(), acc: Infinity }]) assert(!O({ fix: f }).accept); });
  test('vitesse mesurée impossible', () => assert(!O({ fix: { ...fix(), speed: 80 } }).accept));
  test('saut physique impossible', () => assert(!O({ previous: old, fix: fix(work) }).accept));
  test('interruption de six minutes en trajet : le garde de vitesse reste actif', () => {
    const f = fix({ lat: 50.85, lon: 2.35 });
    assert(!O({ previous: fix(home, -6 * 60e3), fix: f, context: { source: 'trip', place: null } }).accept);
    assert(O({ previous: fix(home, -3 * 3600e3), fix: f, context: { source: 'trip', place: null } }).accept);
  });
  const later = now + 20 * 60e3, target = fix(work, 20 * 60e3);
  const first = O({ now: later, previous: old, logical: old, context: ctx, fix: target });
  test('un seul point ne déplace pas le lieu', () => { assert(first.accept && first.hold); assert.equal(first.logical, old); assert(first.pending); });
  test('deux observations cohérentes confirment un changement', () => { const r = O({ now: later + 5000, previous: target, logical: old, context: ctx, fix: fix(work, 20 * 60e3 + 5000), pending: first.pending }); assert(r.accept && !r.hold); assert.equal(r.logical.lat, work.lat); });
  test('un même timestamp ne compte pas deux fois', () => assert(O({ now: later, previous: target, logical: old, context: ctx, fix: target, pending: first.pending }).hold));
  test('une série ancienne ne compte pas après suspension', () => assert(O({ now: later + 3 * 60e3, previous: target, logical: old, context: ctx, fix: fix(work, 23 * 60e3), pending: first.pending }).hold));
  test('le retour dans la géofence annule le point aberrant', () => { const r = O({ now: later + 5 * 60e3, previous: target, logical: old, context: ctx, fix: fix(home, 25 * 60e3), pending: first.pending }); assert(!r.hold && !r.pending); });
  test('hystérésis au bord : 220 m conserve le domicile', () => { const r = O({ previous: old, logical: old, context: ctx, fix: fix({ lat: 48.852, lon: 2.35 }) }); assert(r.accept && r.hold && !r.pending); });
  test('GPS drift de 60 m : ni départ ni changement de lieu', () => { const r = O({ previous: old, logical: old, context: ctx, fix: fix({ lat: 48.8505, lon: 2.35 }) }); assert(r.accept && !r.hold && !r.pending); });
  test('géofence bornée par la précision : 180 m admis à ±100 m', () => assert.equal(c.context({ now, places, fix: fix({ lat: 48.8516, lon: 2.35 }, 0, 100) }).place.id, 'home'));
  test('adresses qui se recouvrent : pas de choix automatique', () => assert.equal(c.context({ now, places: [home, { ...work, lat: home.lat, lon: home.lon }], fix: fix() }).place, null));
  test('override conservé pendant une seule observation extérieure', () => { const conf = { placeId: 'home', at: now, how: 'manual' }, context = c.context({ now, places, conf }); const r = O({ now: later, fix: target, context }); assert(r.hold); assert.equal(r.logical, null); assert.equal(c.context({ now: later, places, conf, fix: r.logical }).source, 'manual'); });
  return n;
}
const count = run();
for (const [from, to] of [["if (cls === 'coarse')", 'if (false)'], ["if (!coherent)", 'if (false)'], ['now - previous.ts <= PLACE_GPS_AGE', 'false'], ['const PLACE_VMAX = 200,', 'const PLACE_VMAX = 1e9,'], ['!current && target;', '!current && target && logical;']]) {
  assert(source.includes(from)); assert.throws(() => run(source.replace(from, to)));
}
console.log(`${count}/${count} scénarios OK · 5/5 mutations rejetées`);
