// Copie figée du build EN PRODUCTION (gh-pages/race-control/index.html), utilisée comme « ancienne version » par les tests de
// compatibilité. Seule la configuration scellée (TWRC_SEALED, chiffrée) est retirée : c'est une donnée, pas du code. Tout le
// reste, en particulier chaque bloc <script> de l'application, est identique à l'octet près et vérifié par empreinte.
//   node tests/lib/prod-build-fixture.js make   <index.html de gh-pages> <sortie.html> <manifeste.json>
//   node tests/lib/prod-build-fixture.js verify <index.html de gh-pages> <manifeste.json>
'use strict';
const fs = require('fs'), crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SEALED = /window\.TWRC_SEALED=\{[^<]*?\};window\.TWRC_SEALED_V=/;
const scripts = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// Empreintes des blocs <script> identiques entre l'original et la copie (le bloc qui portait TWRC_SEALED est comparé sans elle).
const codeHashes = html => scripts(html).map(s => sha(s.replace(SEALED, 'window.TWRC_SEALED=null;window.TWRC_SEALED_V=')));
function make(original) {
  if (!SEALED.test(original)) throw new Error('TWRC_SEALED introuvable : build inattendu.');
  const fixture = original.replace(SEALED, 'window.TWRC_SEALED=null;window.TWRC_SEALED_V=');
  const build = (/window\.TWRC_BUILD="([0-9a-f]+)"/.exec(original) || [])[1];
  return { fixture, manifest: { build, originalSha256: sha(original), fixtureSha256: sha(fixture), scripts: codeHashes(original) } };
}
function check(fixture, manifest) {
  const problems = [];
  if (sha(fixture) !== manifest.fixtureSha256) problems.push('empreinte de la copie');
  const now = codeHashes(fixture);
  if (now.length !== manifest.scripts.length || now.some((h, i) => h !== manifest.scripts[i])) problems.push('blocs <script>');
  if (!fixture.includes(`window.TWRC_BUILD="${manifest.build}"`)) problems.push('build');
  return problems;
}
module.exports = { make, check, sha };
if (require.main === module) {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === 'make') { const r = make(fs.readFileSync(a, 'utf8')); fs.writeFileSync(b, r.fixture); fs.writeFileSync(c, JSON.stringify(r.manifest, null, 2) + '\n'); console.log('✅ copie figée du build ' + r.manifest.build); }
  else if (cmd === 'verify') { const m = JSON.parse(fs.readFileSync(b, 'utf8')), r = make(fs.readFileSync(a, 'utf8'));
    const ok = r.manifest.originalSha256 === m.originalSha256 && r.manifest.fixtureSha256 === m.fixtureSha256;
    console.log(ok ? '✅ la copie correspond exactement à ce build de production' : '❌ build différent de la copie figée'); process.exit(ok ? 0 : 1); }
  else { console.error('usage : make | verify'); process.exit(2); }
}
