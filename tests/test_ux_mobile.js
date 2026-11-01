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
test('mobile : bandeau LIVE sur une ligne, cibles de 44 pt et titre réservé à Météo', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const lot = css.slice(css.indexOf('/* Lot 1 UX mobile'));
  assert.match(lot, /\.status-refresh \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(lot, /\.btn\.sm, \.decision-change, \.cal-v \.btn\.sm, \.chip \{ min-height: 44px !important; \}/);
  assert.match(lot, /body:not\(\.vm\) \.top > \.title \{ position: absolute;[^}]*clip-path: inset\(50%\)/);
  // Lisibilité mobile (1er novembre 2026) : plus d'horloge à la seconde ni de deuxième ligne « Reçues il y a… ».
  const view = fs.readFileSync(path.join(root, 'app', 'live-status.js'), 'utf8');
  assert.doesNotMatch(view + css, /liveClock|live-clock-wrap|second: '2-digit'/);
  assert.match(css, /\.weather-received \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  assert.match(css, /\.status-detail:not\(\.is-shown\) \{ position: absolute;[^}]*clip-path: inset\(50%\)/);
  assert.match(view, /classList\.toggle\('is-shown', shown\)/);
});
// Contraste WCAG 2.x : luminance relative sRGB, ratio (L1 + 0,05) / (L2 + 0,05).
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const themes = css => {
  const block = (start, end) => { const i = css.indexOf(start); return css.slice(i, css.indexOf(end, i)); };
  const vars = text => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));
  return { sombre: vars(block(':root {', '}')), 'clair (système)': vars(block(':root:not([data-theme="dark"]) {', '}')), 'clair (choisi)': vars(block(':root[data-theme="light"] {', '}')) };
};
test('gris tertiaire (--fg3) : contraste AA ≥ 4,5:1 sur --bg, --panel et --panel2, thèmes sombre et clair', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8'), low = [];
  for (const [name, v] of Object.entries(themes(css))) {
    assert.ok(v['--fg3'] && v['--bg'] && v['--panel'] && v['--panel2'], name);
    for (const bg of ['--bg', '--panel', '--panel2']) { const r = ratio(v['--fg3'], v[bg]); if (r < 4.5) low.push(`${name} ${v['--fg3']} sur ${v[bg]} = ${r.toFixed(3)}`); }
  }
  assert.deepEqual(low, []);
});
test('contre-test : les anciens gris tertiaires (#75869a sombre, #66768c clair) étaient mesurés sous ou au ras du seuil', () => {
  assert.equal(ratio('#66768c', '#e8edf3').toFixed(3), '3.934');
  assert.ok(ratio('#66768c', '#e8edf3') < 4.5 && ratio('#66768c', '#f2f5f9') < 4.5);
  assert.equal(ratio('#75869a', '#151d26').toFixed(3), '4.559');
  assert.equal(ratio('#000000', '#ffffff').toFixed(0), '21');
});
test('champs de saisie : règle finale à 16 px sur tous les écrans (pas de zoom Safari)', () => {
  const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  const rule = /:root input:not\(\[type=checkbox\], \[type=radio\][^)]*\), :root select, :root textarea \{ font-size: 16px; \}/;
  assert.match(css, rule);
  // Aucune règle plus tardive ne réduit un champ sous 16 px.
  const after = css.slice(css.search(rule) + 1);
  const late = [...after.matchAll(/([^{}]*(?:input|select|textarea)[^{}]*)\{([^}]*)\}/g)].filter(m => /font(?:-size)?:[^;]*\b(\d+(?:\.\d+)?)px/.test(m[2]) && parseFloat(m[2].match(/font(?:-size)?:[^;]*?\b(\d+(?:\.\d+)?)px/)[1]) < 16);
  assert.deepEqual(late.map(m => m[1].trim()), []);
});
test('libellés : tutoiement, onglet Trajet et risque explicite', () => {
  assert.match(fs.readFileSync(path.join(root, 'app', 'trip-view.js'), 'utf8'), /placeholder="Où vas-tu \?"/);
  assert.match(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), /🧭<\/span> Trajet<\/button>/);
  assert.match(fs.readFileSync(path.join(root, 'app', 'weather-view.js'), 'utf8'), /'\/100 · ' \+ LV\[r\.level\]\.name/);
});
const F1_EN = /\b(twin garage|live route|next mission|the garage|race engineer|track conditions|tyre management|strategy a\/b|telemetry replay)\b/i;
const visible = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
test('libellés : noms F1 traduits en français (garage, trajet, mission et modules F1)', () => {
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
