// Chaque mutation représente une régression métier : le vrai moteur doit passer,
// puis les mêmes scénarios doivent rejeter chaque moteur volontairement altéré.
const fs = require('fs'), assert = require('assert');
const { runTests, sourcePath } = require('./test_dayplan.js');
const original = fs.readFileSync(sourcePath, 'utf8');
const count = runTests(original, { quiet: true });
const mutations = [
  { name: 'suppression du filtre thermique de 2 h', from: 'if (duration < 120 && !hasEvent)', to: 'if (false)' },
  { name: 'oubli des pièces du soir à emporter', from: 'const carry = unique([...baseLayers.filter(layer => !firstLayers.includes(layer)), ...hazardCarry]);', to: 'const carry = unique(hazardCarry);' },
  { name: 'utilisation d’une température pour un lieu inconnu', from: 'if (moment.unknown || !moment.weather) return null;', to: 'if (!moment.weather) return null;' }
];
for (const mutation of mutations) {
  assert(original.includes(mutation.from), 'Mutation introuvable : ' + mutation.name);
  const changed = original.replace(mutation.from, mutation.to);
  let rejection;
  try { runTests(changed, { quiet: true }); } catch (error) { rejection = error; }
  assert(rejection instanceof assert.AssertionError, 'La mutation doit être rejetée par un scénario métier : ' + mutation.name);
  console.log('✅ Contre-test rejeté : ' + mutation.name + ' → scénario rouge : ' + rejection.scenario);
}
console.log(count + ' scénarios du moteur de référence passent ; ' + mutations.length + '/' + mutations.length + ' régressions ciblées rejetées.');
