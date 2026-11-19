// État de la route (19/11/2026) : chiffres par secteur, décalage d'heures entières et meilleur départ, valeurs FICTIVES.
// Même lecture et mêmes seuils que trackConditions (pluie ≥ 0,2 mm/h VIGILANCE, ≥ 2 mm/h PRUDENCE) ; rien n'est deviné.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Set, Map, JSON, Date, Math, Error }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/f1-pure.js'), 'utf8') + ';this.F=F1Pure;', c);
const F = c.F, json = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
// Série horaire fictive d'un point : 12:00 → 23:00, pluie choisie par heure.
const series = rain => Array.from({ length: 12 }, (_, h) => ({ t: '2026-11-20T' + String(12 + h).padStart(2, '0') + ':00', T: 9, Tr: 8, vis: 9000, gust: 30, P: rain[12 + h] || 0 }));
// Trajet fictif 17:05 → 18:20, 5 points, km 0 → 71 (même forme que legSeq : hs, i, t, km).
const trip = rainByPoint => [0, 18, 36, 54, 71].map((km, k) => {
  const t = ['2026-11-20T17:05', '2026-11-20T17:20', '2026-11-20T17:40', '2026-11-20T18:00', '2026-11-20T18:20'][k], hs = series(rainByPoint[k]);
  return { hs, i: hs.findIndex(x => x.t === t.slice(0, 13) + ':00'), t, km };
});
const R = (o) => o;   // pluie par heure pour un point : { 16: 0.8, 17: 2.4, ... }

test('chiffres du secteur : heures de passage, kilomètres, pire pluie, chaussée, visibilité, rafales', () => {
  const x = json(F.trackConditions(trip([R({ 17: 2.4 }), R({ 17: 1.1 }), R({ 17: 0.6 }), R({ 18: 0.3 }), R({ 18: 0 })])));
  assert.equal(x.available, true); assert.equal(x.sectors.length, 3);
  assert.deepEqual(x.sectors[0].figures, { from: '17:05', to: '17:05', h0: '17 h', h1: '17 h', km0: 0, km1: 0, rain: 2.4, road: 8, vis: 9000, gust: 30 });
  assert.equal(x.sectors[0].level, 2); assert.equal(x.sectors[0].label, 'PRUDENCE');
  assert.deepEqual([x.sectors[1].figures.from, x.sectors[1].figures.to, x.sectors[2].figures.km1], ['17:20', '17:40', 71]);
});
test('valeur absente : null, jamais inventée (trajet domicile-travail sans heure ni km par point)', () => {
  const seq = trip([{}, {}, {}, {}, {}]).map(({ hs, i }) => ({ hs, i }));
  const f = json(F.trackConditions(seq)).sectors[0].figures;
  assert.equal(f.from, null); assert.equal(f.km0, null); assert.equal(f.rain, 0); assert.equal(f.h0, '17 h', 'repère : heure de la prévision lue');
});
test('décalage d’une heure : même point, heure suivante ; heure de passage décalée', () => {
  const seq = trip([{}, {}, {}, {}, {}]), s = json(F.shiftSeq(seq, 1));
  assert.equal(s[0].i, seq[0].i + 1); assert.equal(s[0].t, '2026-11-20T18:05'); assert.equal(s[4].t, '2026-11-20T19:20');
  assert.equal(json(F.shiftSeq(seq, -1))[0].t, '2026-11-20T16:05');
});
test('décalage refusé : fin de prévision, série non contiguë, heure fractionnaire', () => {
  const seq = trip([{}, {}, {}, {}, {}]);
  assert.equal(F.shiftSeq(seq, 6), null, 'au-delà de la série');
  const gap = seq.map(q => ({ ...q, hs: q.hs.map((x, k) => k === q.i + 1 ? { ...x, t: '2026-11-20T23:59' } : x) }));
  assert.equal(F.shiftSeq(gap, 1), null, 'heure suivante non contiguë (changement d’heure, trou)');
  assert.equal(F.shiftSeq(seq, 0.5), null); assert.equal(F.shiftSeq([], 1), null);
});
test('meilleur départ : −1 h conseillé quand il fait baisser le niveau (PRUDENCE → VIGILANCE)', () => {
  const o = json(F.departureOptions(trip([R({ 16: 0.8, 17: 2.4, 18: 1.1 }), R({ 16: 0.4, 17: 1.1, 18: 0.7 }), R({ 17: 0.6 }), R({ 18: 0.3 }), R({})])));
  assert.equal(o.needed, true); assert.deepEqual(o.options.map(x => x.shift), [-1, 0, 1]);
  assert.deepEqual(o.options.map(x => x.label), ['VIGILANCE', 'PRUDENCE', 'VIGILANCE']);
  assert.equal(o.best.shift, -1, 'à niveau égal : la pluie la plus faible, puis le plus proche, puis le plus tôt');
  assert.equal(o.best.dep, '2026-11-20T16:05'); assert.match(o.best.cause, /Pluie prévue/);
});
test('aucun conseil si rien ne baisse ; horaire prévu gardé à égalité ; trajet sans signal : rien à décaler', () => {
  const same = json(F.departureOptions(trip([R({ 16: 1, 17: 1, 18: 1 }), {}, {}, {}, {}])));
  assert.equal(same.needed, true); assert.equal(same.best, null);
  const dry = json(F.departureOptions(trip([{}, {}, {}, {}, {}])));
  assert.equal(dry.needed, false); assert.equal(dry.best, null); assert.equal(dry.planned.label, 'RAS');
});
test('option sans prévision : indisponible, jamais choisie ; trajet illisible : null', () => {
  const late = trip([R({ 17: 2.4 }), {}, {}, {}, {}]).map(q => ({ ...q, hs: q.hs.slice(0, q.i + 1) }));   // aucune heure après celle du passage : +1 h impossible
  const o = json(F.departureOptions(late));
  assert.equal(o.options.find(x => x.shift === 1).available, false);
  assert.notEqual(o.best && o.best.shift, 1);
  assert.equal(F.departureOptions([]), null);
  assert.equal(F.departureOptions(trip([{}, {}, {}, {}, {}]), { ageMin: 61 }), null, 'prévisions trop anciennes : aucun conseil');
});
test('cohérence : le niveau de l’option prévue = le pire secteur de trackConditions', () => {
  const seq = trip([R({ 17: 0.3 }), R({ 17: 2.1 }), {}, {}, {}]);
  assert.equal(json(F.departureOptions(seq)).planned.level, Math.max(...json(F.trackConditions(seq)).sectors.map(s => s.level)));
});
console.log(`\n${n}/${n} contrôles « État de la route »`);
