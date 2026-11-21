// Guidage EN DIRECT (21/11/2026, lot 3), valeurs FICTIVES : module pur DriveGuide (consignes, pictogrammes, paliers, voies).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Math, JSON }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/drive-guide-core.js'), 'utf8') + ';this.G=DriveGuide;', c);
const G = c.G, J = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
test('consignes françaises tirées des étapes OSRM, rien d’inventé (étape inconnue : « Continuez »)', () => {
  const t = s => G.text(s);
  assert.equal(t({ type: 'turn', modifier: 'right', name: 'Avenue fictive B' }), 'Tournez à droite sur Avenue fictive B');
  assert.equal(t({ type: 'turn', modifier: 'sharp left', name: '' }), 'Tournez franchement à gauche');
  assert.equal(t({ type: 'turn', modifier: 'uturn', name: '' }), 'Faites demi-tour');
  assert.equal(t({ type: 'roundabout', exit: 1, name: 'Rue C' }), 'Au rond-point, prenez la 1re sortie sur Rue C');
  assert.equal(t({ type: 'roundabout', exit: 3, name: '' }), 'Au rond-point, prenez la 3e sortie');
  assert.equal(t({ type: 'roundabout', name: '' }), 'Au rond-point, sortez');
  assert.equal(t({ type: 'off ramp', modifier: 'slight right', name: '', ref: 'A 99' }), 'Prenez la sortie à droite vers A 99');
  assert.equal(t({ type: 'on ramp', modifier: 'left', name: 'Rocade fictive' }), 'Prenez la bretelle à gauche vers Rocade fictive');
  assert.equal(t({ type: 'fork', modifier: 'slight left', name: '' }), 'Restez à gauche');
  assert.equal(t({ type: 'merge', modifier: 'slight right', name: 'N 999' }), 'Insérez-vous à droite sur N 999');
  assert.equal(t({ type: 'end of road', modifier: 'right', name: 'D 999' }), 'Au bout de la route, tournez à droite sur D 999');
  assert.equal(t({ type: 'new name', modifier: 'straight', name: 'Rue E' }), 'Continuez sur Rue E');
  assert.equal(t({ type: 'arrive', modifier: 'left' }), 'Arrivée à destination, à gauche');
  assert.equal(t({ type: 'arrive' }), 'Arrivée à destination');
  assert.equal(t({ type: 'inconnu', modifier: 'left', name: '' }), 'Continuez');
  assert.equal(t(null), 'Continuez');
});
test('pictogrammes : forme selon la direction, rond-point, arrivée ; tout droit par défaut', () => {
  assert.deepEqual(['right', 'slight left', 'sharp right', 'uturn', 'straight', undefined].map(m => G.arrow({ type: 'turn', modifier: m })), ['right', 'slight-left', 'sharp-right', 'uturn', 'straight', 'straight']);
  assert.equal(G.arrow({ type: 'roundabout', exit: 2 }), 'roundabout'); assert.equal(G.arrow({ type: 'arrive' }), 'arrive');
});
test('paliers : > 1 km arrondi, puis 1 km, 500 m, 200 m, 100 m, « maintenant » ; paliers d’annonce', () => {
  assert.deepEqual(J([5000, 1490, 1000, 999, 501, 500, 201, 200, 101, 100, 31, 30, 0].map(G.distLabel)), ['5 km', '1,5 km', '1 km', '1 km', '1 km', '500 m', '500 m', '200 m', '200 m', '100 m', '100 m', 'maintenant', 'maintenant']);
  assert.deepEqual([2000, 900, 400, 150, 60, 10].map(G.tier), [Infinity, 1000, 500, 200, 100, 0]);
  assert.equal(G.distLabel(-1), ''); assert.equal(G.distLabel(NaN), '');
});
test('voies : seulement celles fournies par OSRM ; aucune sinon', () => {
  assert.deepEqual(J(G.lanes({ lanes: [{ valid: false, indications: ['left'] }, { valid: true, indications: ['straight', 'right'] }] })), [{ ok: false, dirs: ['left'] }, { ok: true, dirs: ['straight', 'right'] }]);
  assert.equal(G.lanes({}), null); assert.equal(G.lanes({ lanes: [] }), null);
});
test('état : manœuvre en cours (départ et simple changement de nom ignorés), distance, palier, puis la suivante ; rien après l’arrivée', () => {
  const nav = { steps: [{ type: 'depart', along: 0 }, { type: 'new name', modifier: 'straight', name: 'X', along: 100 }, { type: 'turn', modifier: 'right', name: 'Avenue B', along: 1000 }, { type: 'arrive', along: 2000 }] };
  const s = J(G.state(nav, 400));
  assert.equal(s.text, 'Tournez à droite sur Avenue B'); assert.equal(s.dist, 600); assert.equal(s.label, '1 km'); assert.equal(s.then.text, 'Arrivée à destination');
  assert.equal(G.state(nav, 1010).text, 'Tournez à droite sur Avenue B');   // 15 m de marge au passage
  assert.equal(G.state(nav, 1100).text, 'Arrivée à destination'); assert.equal(G.state(nav, 2100), null); assert.equal(G.state({ steps: [] }, 0), null);
});
console.log(`\n${n}/${n} contrôles « guidage en direct »`);
