// Lot 1 UX mobile : aucun texte sous 11 px dans les feuilles de l'app, règles de lisibilité présentes.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const root = path.join(__dirname, '..', 'src');
const sources = [path.join(root, 'style.css'), ...fs.readdirSync(path.join(root, 'app')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'app', f))];
const SMALL = /(font-size:\s*|font:\s*(?:[0-9]{3}\s+)?)(\d+(?:\.\d+)?)px/g;
test('aucune taille de texte CSS sous 11 px (Garage, Live Route, Mission, cockpit)', () => {
  const found = [];
  for (const f of sources) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(SMALL)) if (parseFloat(m[2]) < 11) found.push(path.relative(root, f) + ' : ' + m[0]);
  }
  assert.deepEqual(found, []);
});
test('contre-test : le détecteur repère bien une taille de 9 px', () => {
  assert.equal([...'.x{font:9px var(--f-mono)} .y{font-size: 10.5px}'.matchAll(SMALL)].filter(m => parseFloat(m[2]) < 11).length, 2);
});
test('mobile : bandeau LIVE sur deux lignes, cibles de 44 pt et titre réservé à Météo', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const lot = css.slice(css.indexOf('/* Lot 1 UX mobile'));
  assert.match(lot, /@media \(min-width: 380px\) and \(max-width: 560px\)[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto auto/);
  assert.match(lot, /\.status-refresh \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(lot, /\.btn\.sm, \.decision-change, \.cal-v \.btn\.sm, \.chip \{ min-height: 44px !important; \}/);
  assert.match(lot, /body:not\(\.vm\) \.top > \.title \{ position: absolute;[^}]*clip-path: inset\(50%\)/);
});
test('libellés : tutoiement, onglet Trajet et risque explicite', () => {
  assert.match(fs.readFileSync(path.join(root, 'app', 'trip-view.js'), 'utf8'), /placeholder="Où vas-tu \?"/);
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /🧭<\/span> Trajet<\/button>/);
  assert.match(fs.readFileSync(path.join(root, 'app', 'weather-view.js'), 'utf8'), /'\/100 · risque '/);
});
const F1_EN = /\b(twin garage|live route|next mission|the garage)\b/i;
const visible = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
test('libellés : noms F1 traduits en français (Garage numérique, Trajet en direct, Prochaine mission, Le garage)', () => {
  const files = [path.join(root, 'app.js'), path.join(root, 'f1-pure.js'), ...sources.filter(f => f.endsWith('.js'))];
  const found = files.flatMap(f => visible(fs.readFileSync(f, 'utf8')).split('\n').filter(l => F1_EN.test(l)).map(l => path.relative(root, f) + ' : ' + l.trim().slice(0, 80)));
  assert.deepEqual(found, []);
  assert.match(fs.readFileSync(path.join(root, 'app', 'garage-view.js'), 'utf8'), /🛠️ GARAGE NUMÉRIQUE/);
  assert.match(fs.readFileSync(path.join(root, 'app', 'live-route-view.js'), 'utf8'), /lr-title">TRAJET EN DIRECT</);
  assert.match(fs.readFileSync(path.join(root, 'app', 'mission-control.js'), 'utf8'), /🏁 PROCHAINE MISSION/);
});
test('contre-test : le détecteur repère un nom anglais visible mais ignore les commentaires', () => {
  assert.equal(F1_EN.test(visible("h('<b>LIVE ROUTE</b>')")), true);
  assert.equal(F1_EN.test(visible('/* Twin Garage */ x(); // The Garage')), false);
});
console.log(n + '/' + n + ' contrôles UX mobile');
