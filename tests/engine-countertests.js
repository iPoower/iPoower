// Chaque mutation représente une régression de sécurité du verdict : le vrai moteur doit passer,
// puis les mêmes scénarios doivent rejeter chaque moteur volontairement altéré.
const fs = require('fs'), assert = require('assert');
const { runTests, sourcePath } = require('./test_engine_verdicts.js');
const original = fs.readFileSync(sourcePath, 'utf8');
const count = runTests(original, { quiet: true });
const mutations = [
  { name: 'brouillard < 200 m rétrogradé en CAUTION', from: 'if (x.vis < 200) L = Math.max(L, 2);', to: 'if (x.vis < 200) L = Math.max(L, 1);' },
  { name: 'rafales ≥ 90 km/h sans alerte', from: 'if (x.gust != null && x.gust >= 90) L = Math.max(L, 2);', to: '' },
  { name: 'drapeaux de danger ignorés par le niveau', from: 'const level = Math.max(sl, lvl);', to: 'const level = sl;' },
  { name: 'seuils de niveau trop indulgents', from: 'const scoreToLevel = s => s >= 80 ? 0 : s >= 60 ? 1 : s >= 40 ? 2 : 3;', to: 'const scoreToLevel = s => s >= 40 ? 0 : s >= 20 ? 1 : s >= 10 ? 2 : 3;' },
  { name: 'pneu inconnu analysé comme un 4 saisons', from: "const effType = car => car.tire.type === 'unknown' ? 'summer' : car.tire.type;", to: "const effType = car => car.tire.type === 'unknown' ? 'allseason' : car.tire.type;" },
  { name: 'plancher « pluie sur chaussée négative » supprimé', from: 'score = Math.max(score, 75); f.push', to: 'score = score; f.push' },
  { name: 'pire heure du trajet ignorée', from: 'if (a.pen > pMax) { pMax = a.pen; kMax = k; }', to: 'if (k === 0) { pMax = a.pen; kMax = k; }' },
  { name: 'courbe froid des pneus été non monotone', from: '[0, 60], [1, 48]', to: '[0, 20], [1, 48]' },
  { name: 'profondeur illégale oubliée', from: "if (tread != null && tread < 1.6) add('Profondeur sous le minimum légal (1,6 mm)', 40, 'tyre');", to: '' },
  { name: '« maintenant » repris d’une réponse obsolète', from: "Math.abs(Date.parse(curS + 'Z') - Date.parse(clockNow + 'Z')) <= 3600e3", to: 'true' },
  { name: 'prévision tronquée acceptée', from: "if (!Array.isArray(t) || t.length < 24) return 'moins de 24 heures de prévision';", to: "if (!Array.isArray(t)) return 'x';" },
  { name: 'températures trouées acceptées', from: "if (T.filter(v => typeof v === 'number' && isFinite(v)).length < t.length / 2) return", to: "if (false) return" },
  { name: 'gomme usée favorisée sous la pluie', from: 'tread < 3 ? 1.6 : tread < 4 ? 1.25 : 1', to: 'tread < 3 ? 0.5 : tread < 4 ? 1.25 : 1' }
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
