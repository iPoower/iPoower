// Sécurité V1 : garde-fou statique. Aucun code source ne doit réintroduire l'écriture en clair du code de déverrouillage
// (`twrc.key`) ou du préréglage déchiffré (`twrc.plain`) dans le stockage du navigateur. Seul le coffre de session les détient,
// chiffrés. Ignore les commentaires et les données de test fictives.
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), files = [...fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f),
  ...fs.readdirSync(path.join(root, 'src/app')).filter(f => f.endsWith('.js')).map(f => 'src/app/' + f), 'tools/build.js'];
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
let n = 0; const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
const WRITE = /\.setItem\(\s*['"`]twrc\.(key|plain)(\.v)?['"`]/;
const PLAN = /['"`]twrc\.(key|plain)['"`]\s*:/;   // valeur placée dans un plan d'écriture du stockage brut
check('aucune écriture directe de twrc.key / twrc.plain dans le stockage', () => {
  const hits = files.filter(f => WRITE.test(strip(fs.readFileSync(path.join(root, f), 'utf8'))));
  assert.deepEqual(hits, []);
});
check('twrc.key / twrc.plain placés uniquement dans les valeurs du coffre de session (app.js → VS.unlock, session-vault)', () => {
  const hits = files.filter(f => !['src/session-vault.js'].includes(f)).flatMap(f => strip(fs.readFileSync(path.join(root, f), 'utf8')).split('\n')
    .filter(l => PLAN.test(l) && !/VS\.unlock\(|TWRC_VAULT\.unlock\(/.test(l)).map(l => f + ' : ' + l.trim().slice(0, 120)));
  assert.deepEqual(hits, []);
});
check('le démarrage ne relit plus le préréglage en clair depuis le stockage brut', () => {
  const b = fs.readFileSync(path.join(root, 'tools/build.js'), 'utf8');
  assert(!/localStorage\.getItem\(['"]twrc\.plain/.test(b)); assert(/id="twrc-app"/.test(b) && /SessionVault\.create/.test(b));
});
check('le garde-fou détecte une réintroduction (contre-test)', () => {
  assert(WRITE.test("localStorage.setItem('twrc.key', pass)")); assert(PLAN.test("{ 'twrc.key': pass }")); assert(!WRITE.test("// localStorage.setItem('twrc.key', x)".replace(/\/\/.*/, '')));
});
console.log(n + '/' + n + ' scénarios OK');
