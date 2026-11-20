// Onglet Pneus · épreuve spéciale (19/11/2026), valeurs FICTIVES : ruban de surface et notes du copilote tirés des lignes de
// routeTower (mêmes points, mêmes niveaux, mêmes seuils 0,2 / 2 mm/h), parts en km sinon en points, rien d'inventé.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/f1-pure.js'), 'utf8') + ';this.F=F1Pure;', c);
const F = c.F, json = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const hour = (h, x) => ({ t: '2026-11-16T' + String(h).padStart(2, '0') + ':00', T: 10, Tr: 9, vis: 20000, gust: 25, P: 0, ...x });
const pt = (h, m, km, x) => ({ hs: [hour(h, x)], i: 0, t: '2026-11-16T' + String(h).padStart(2, '0') + ':' + m, km });
const rows = seq => json(F.routeTower(seq));
const trip = [pt(6, '30', 0, { P: 0 }), pt(6, '42', 18, { P: 0.5 }), pt(6, '54', 36, { P: 0.5 }), pt(7, '02', 54, { P: 2.4 }), pt(7, '10', 71, { P: 2.4 })];

test('ruban : segments contigus par surface (sec, humide, mouillé), parts proportionnelles aux km', () => {
  const s = json(F.stageSurface(rows(trip)));
  assert.deepEqual(s.map(x => x.label), ['SEC', 'HUMIDE', 'MOUILLÉ']);
  assert.deepEqual(s.map(x => [x.from, x.to]), [[0, 0], [1, 2], [3, 4]]);
  assert.deepEqual(s.map(x => x.share), [25.4, 50.7, 23.9]);
  assert.equal(Math.round(s.reduce((a, x) => a + x.share, 0)), 100);
});
test('ruban : sans kilomètres, parts au nombre de points ; gel et neige priment sur la pluie (même lecture que le point)', () => {
  const s = json(F.stageSurface(rows([pt(6, '00', null, {}), pt(7, '00', null, { P: 0.6 }), pt(8, '00', null, { snow: 0.4, P: 0.4 }), pt(9, '00', null, { Tr: -1 })])));
  assert.deepEqual(s.map(x => x.kind), ['dry', 'damp', 'snow', 'ice']);
  assert.deepEqual(s.map(x => x.share), [25, 25, 25, 25]);
  assert.equal(F.stageSurface([]).length, 0); assert.equal(F.stageSurface(null).length, 0);
});
test('notes : départ (heure, air, chaussée), une note par portion de même niveau, arrivée avec le gel ; niveaux de routeTower', () => {
  const r = rows(trip), x = json(F.copilotNotes(r, { dep: '2026-11-16T06:30', arr: '2026-11-16T07:10', frost: 0, tyre: 'winter' }));
  assert.deepEqual(x.map(z => z.n), [1, 2, 3, 4, 5]);
  assert.equal(x[0].text, 'Départ 06:30 · air 10 °C, chaussée 9 °C.');
  assert.equal(x[1].text, 'Au départ : sec, RAS.');
  assert.equal(x[2].text, 'Du km 18 au km 36, vers 06:42 : Pluie prévue (0,5 mm/h).');
  assert.equal(x[3].text, 'Après le km 54, vers 07:02 : Pluie modérée ou forte prévue (2,4 mm/h).');
  assert.equal(x[4].text, 'Arrivée 07:10. Aucun risque de gel.');
  assert.deepEqual(x.slice(1, 4).map(z => z.level), [0, 1, 2]);
});
test('notes : pneus été, mêmes repères que « Quelle voiture prendre ? » (air < 5 °C ; < 7 °C et chaussée humide)', () => {
  const cold = json(F.copilotNotes(rows([pt(6, '30', 0, { T: 4 }), pt(7, '00', 30, { T: 6 })]), { tyre: 'summer' }));
  assert.match(cold[0].text, /Route froide pour des pneus été\.$/);
  const fresh = json(F.copilotNotes(rows([pt(6, '30', 0, { T: 6 }), pt(7, '00', 30, { T: 6, P: 0.4 })]), { tyre: 'summer' }));
  assert.match(fresh[0].text, /Route fraîche et humide pour des pneus été\.$/);
  const winter = json(F.copilotNotes(rows([pt(6, '30', 0, { T: 4 })]), { tyre: 'winter' }));
  assert.doesNotMatch(winter[0].text, /pneus été/);
});
test('notes : un seul niveau → « Sur tout le parcours » ; valeurs absentes jamais inventées ; gel inconnu non affirmé', () => {
  const x = json(F.copilotNotes(rows([{ hs: [{ t: '2026-11-16T06:00', P: 0 }], i: 0 }, { hs: [{ t: '2026-11-16T07:00', P: 0 }], i: 0 }]), {}));
  assert.equal(x[0].text, 'Départ 06 h.');
  assert.equal(x[1].text, 'Sur tout le parcours : sec, RAS.');
  assert.equal(x[2].text, 'Arrivée.'); assert.equal(x[2].level, null);
  assert.equal(F.copilotNotes([]).length, 0); assert.equal(F.copilotNotes(null).length, 0);
});
test('CLARA R3-04 : pluie sous le seuil jamais affichée « 0,2 » (affichage cohérent avec le niveau)', () => {
  assert.equal(F.rainShown(0.15), '< 0,2'); assert.equal(F.rainShown(0.19), '< 0,2'); assert.equal(F.rainLevel(0.19), 0);
  assert.equal(F.rainShown(0.2), '0,2'); assert.equal(F.rainLevel(0.2), 1);
  assert.equal(F.rainShown(0.25), '0,3'); assert.equal(F.rainShown(0.1), '0,1'); assert.equal(F.rainShown(0), '0'); assert.equal(F.rainShown(null), null);
});
console.log(`\n${n}/${n} contrôles « épreuve spéciale »`);
