// Copie figée du build EN PRODUCTION (gh-pages/race-control/index.html), utilisée comme « ancienne version » par les tests de
// compatibilité. La configuration scellée (TWRC_SEALED, chiffrée) est remplacée par null : c'est une donnée, pas du code.
// Le corps de repairVehicleIdentity (migration ponctuelle qui citait l'identité RÉELLE d'un véhicule, retirée de l'app le
// 24/11/2026) est remplacé par « return false » : aucune donnée personnelle dans le dépôt public. Motif générique : l'outil
// ne contient lui-même aucune valeur réelle. Les tests de compatibilité n'utilisent que des véhicules fictifs.
// Preuve d'identité sans analyser le HTML : la copie est EXACTEMENT l'original après ce seul remplacement. Le manifeste garde
// l'empreinte de l'original (à comparer au fichier de gh-pages) et celle de la copie (contrôlée à chaque exécution des tests) ;
// `verify` refait le remplacement depuis le build de gh-pages et compare les deux empreintes : tout le reste est identique à l'octet.
//   node tests/lib/prod-build-fixture.js make   <index.html de gh-pages> <sortie.html> <manifeste.json>
//   node tests/lib/prod-build-fixture.js verify <index.html de gh-pages> <manifeste.json>
'use strict';
const fs = require('fs'), crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const SEALED = /window\.TWRC_SEALED=\{[^<]*?\};window\.TWRC_SEALED_V=/, NONE = 'window.TWRC_SEALED=null;window.TWRC_SEALED_V=';
const VEHICLE = /function repairVehicleIdentity\(settings\) \{[\s\S]*?\n\}\n/, NOVEHICLE = 'function repairVehicleIdentity(settings) { return false; }\n';
function make(original) {
  if (!SEALED.test(original)) throw new Error('TWRC_SEALED introuvable : build inattendu.');
  let fixture = original.replace(SEALED, NONE);
  // Neutraliser la migration change le bloc applicatif différé : son empreinte CSP (script-src 'sha256-…') est recalculée,
  // sinon l'ancienne version ne démarrerait plus. Aucun autre octet du code n'est touché.
  const block = html => (/<script type="text\/plain" id="twrc-app">([\s\S]*?)<\/script>/.exec(html) || [])[1];
  const csp = t => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
  if (VEHICLE.test(fixture)) { const before = block(fixture), after = fixture.replace(VEHICLE, NOVEHICLE);
    fixture = before == null ? after : after.split(csp(before)).join(csp(block(after))); }
  const build = (/window\.TWRC_BUILD="([0-9a-f]+)"/.exec(original) || [])[1];
  return { fixture, manifest: { build, originalSha256: sha(original), fixtureSha256: sha(fixture) } };
}
function check(fixture, manifest) {
  const problems = [];
  if (sha(fixture) !== manifest.fixtureSha256) problems.push('empreinte de la copie');
  if (SEALED.test(fixture) || !fixture.includes(NONE)) problems.push('configuration scellée présente ou remplacement absent');
  if (!fixture.includes(NOVEHICLE) || fixture.split('function repairVehicleIdentity(').length !== 2) problems.push('identité de véhicule non neutralisée');
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
