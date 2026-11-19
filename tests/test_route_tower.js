// Onglet Trajet · tour du parcours (19/11/2026), valeurs FICTIVES : une ligne par point météo réel, dans l'ordre, secteur de
// lecture identique à trackConditions, niveau du point par la même lecture, valeurs absentes à null, prévisions anciennes refusées.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/f1-pure.js'), 'utf8') + ';this.F=F1Pure;', c);
const F = c.F, json = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const hour = (h, x) => ({ t: '2026-11-20T' + String(h).padStart(2, '0') + ':00', T: 9, Tr: 8, vis: 9000, gust: 30, P: 0, ...x });
const pt = (h, km, x, name) => ({ hs: [hour(h, x)], i: 0, t: '2026-11-20T' + String(h).padStart(2, '0') + ':10', km, name });

test('une ligne par point, dans l’ordre, avec heure de passage, km et valeurs de l’heure lue', () => {
  const r = json(F.routeTower([pt(6, 0, {}, 'Lieu A'), pt(7, 36, { P: 0.6 }, 'Point 2'), pt(8, 71, { P: 2.4, vis: 800 }, 'Lieu B')]));
  assert.deepEqual(r.map(x => x.name), ['Lieu A', 'Point 2', 'Lieu B']);
  assert.deepEqual(r.map(x => x.at), ['06:10', '07:10', '08:10']);
  assert.deepEqual(r.map(x => x.km), [0, 36, 71]);
  assert.deepEqual([r[2].rain, r[2].road, r[2].vis, r[2].gust], [2.4, 8, 800, 30]);
});
test('niveau du point = trackConditions sur ce seul point (mêmes seuils pluie, brouillard)', () => {
  const seq = [pt(6, 0, {}), pt(7, 36, { P: 0.6 }), pt(8, 71, { P: 2.4 }), pt(9, 90, { vis: 150 })];
  const r = json(F.routeTower(seq));
  assert.deepEqual(r.map(x => x.level), seq.map(q => json(F.trackConditions([q])).sectors[0].level));
  assert.deepEqual(r.map(x => x.label), ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER']);
});
test('secteur de lecture identique au découpage de trackConditions (3 secteurs au plus)', () => {
  const seq = [0, 1, 2, 3, 4].map(k => pt(6 + k, k * 18, k === 4 ? { P: 2.4 } : {}));
  const r = json(F.routeTower(seq)), sec = json(F.trackConditions(seq)).sectors;
  assert.deepEqual(r.map(x => x.sector), [1, 2, 2, 3, 3]);
  assert.deepEqual(sec.map(s => s.points), [1, 2, 2].map((_, i) => r.filter(x => x.sector === i + 1).length));
  assert.equal(Math.max(...r.filter(x => x.sector === 3).map(x => x.level)), sec[2].level, 'le pire point du secteur fixe le niveau du secteur');
});
test('valeurs absentes : null (jamais inventées) ; sans heure de passage, heure de la prévision lue', () => {
  const r = json(F.routeTower([{ hs: [{ t: '2026-11-20T06:00', T: 9, Tr: 8, P: 0, vis: 9000 }], i: 0 }]));
  assert.equal(r[0].km, null); assert.equal(r[0].name, null); assert.equal(r[0].gust, null); assert.equal(r[0].at, '06 h');
});
test('prévisions de plus de 60 min ou trajet sans point : aucune ligne', () => {
  assert.equal(F.routeTower([pt(6, 0, {})], { ageMin: 61 }).length, 0);
  assert.equal(F.routeTower([]).length, 0); assert.equal(F.routeTower(null).length, 0);
});
console.log(`\n${n}/${n} contrôles « tour du parcours »`);
