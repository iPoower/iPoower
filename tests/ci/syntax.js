// Contrôle préalable de tous les scripts, y compris les outils et les anciens tests hors du registre actif.
'use strict';
const fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process'), { ROOT } = require('./workspace');
const files = [];
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (/\.m?js$/.test(f)) files.push(f); } }
['src', 'tests', 'tools'].forEach(d => walk(path.join(ROOT, d)));
for (const f of files) {
  const widget = f === path.join(ROOT, 'src/widget.js');
  const r = spawnSync(process.execPath, widget ? ['--input-type=module', '--check'] : ['--check', f], { encoding: 'utf8', ...(widget ? { input: fs.readFileSync(f, 'utf8') } : {}) });
  if (r.status !== 0) { console.error('Syntaxe invalide : ' + path.relative(ROOT, f)); process.exit(1); }
}
const hook = spawnSync('bash', ['-n', path.join(ROOT, 'tools/pre-commit')], { encoding: 'utf8' });
if (hook.status !== 0) throw new Error('Syntaxe invalide du hook de confidentialité');
console.log(`✅ ${files.length} scripts et le hook de confidentialité : syntaxe valide`);
