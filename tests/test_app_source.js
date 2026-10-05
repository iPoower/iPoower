// Contrat d'assemblage : ordre, portée lexicale, octets et refus des inclusions dangereuses.
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const { appSource } = require('../tools/app-source');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-app-source-'));
const put = (file, text) => { const p = path.join(root, 'src', file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
let n = 0;
const check = (label, fn) => { fn(); n++; console.log('✅ ' + label); };
try {
  put('app.js', 'const start = 3;\n// @include app/first.js\nresult = answer();\n');
  put('app/first.js', 'const offset = 4;\n// @include app/second.js\n');
  put('app/second.js', 'function answer() { return start + offset; }\n');
  check('ordre et octets des sections conservés', () => assert.equal(appSource(root), 'const start = 3;\nconst offset = 4;\nfunction answer() { return start + offset; }\nresult = answer();\n'));
  check('un script classique conserve les liaisons lexicales', () => { const c = {}; vm.runInNewContext(appSource(root), c); assert.equal(c.result, 7); });
  check('fin de ligne Windows acceptée', () => { put('app.js', '// @include app/second.js\r\n'); assert.equal(appSource(root), 'function answer() { return start + offset; }\n'); });
  check('section absente refusée', () => { put('app.js', '// @include app/missing.js\n'); assert.throws(() => appSource(root), /ENOENT/); });
  check('cycle refusé avant le build', () => { put('app.js', '// @include app/first.js\n'); put('app/first.js', '// @include app/second.js\n'); put('app/second.js', '// @include app/first.js\n'); assert.throws(() => appSource(root), /circulaire/); });
  check('traversée de répertoire refusée', () => { put('app.js', '// @include app/../../outside.js\n'); assert.throws(() => appSource(root), /invalide/); });
  check('fichier lié refusé', () => { put('app.js', '// @include app/linked.js\n'); fs.symlinkSync(path.join(root, 'src/app.js'), path.join(root, 'src/app/linked.js')); assert.throws(() => appSource(root), /non régulière/); });
  check('répertoire lié hors de src refusé', () => { fs.renameSync(path.join(root, 'src/app'), path.join(root, 'elsewhere')); fs.symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'src/app')); put('app.js', '// @include app/second.js\n'); assert.throws(() => appSource(root), /hors de src/); });
  check('app complète assemblée et syntaxiquement valide', () => { const source = appSource(); assert(!/^\/\/ @include /m.test(source)); new vm.Script(source); for (const name of ['renderWx', 'renderLab', 'diagRows', 'autoTick']) assert(source.includes('function ' + name + '(')); });
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log(`${n}/${n} scénarios OK`);
