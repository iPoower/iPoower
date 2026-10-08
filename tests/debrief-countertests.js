'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const { sourcePath, runTests } = require('./test_debrief');
const source = fs.readFileSync(sourcePath, 'utf8'); runTests(source, { quiet: true });
const mutations = [
  ['double arrivée ajoutée', '!state.entries.some(e => e.key === value.key)', 'true'],
  ['annulation traitée comme arrivée', "['auto', 'confirmé']", "['auto', 'confirmé', 'annulé']"],
  ['départ effacé trop tôt du journal', 'start: s, feedback:', 'start: null, feedback:'],
  ['brouillard non annoncé masqué', 'observed.filter(k => !predicted.includes(k))', '[]'],
  ['alerte non rencontrée masquée', 'predicted.filter(k => !observed.includes(k))', '[]'],
  ['données anciennes traitées comme fraîches', 'e.start.at - p.fetchedAt > 90 * 60e3', 'false'],
  ['signal thermique 3 et 4 perdu', 'v.s > 4', 'v.s > 2'],
  ['champs privés conservés', 'carId: text(v.carId, 120)', '...v, carId: text(v.carId, 120)'],
  ['rétention prolongée', 'now - v.at >= RETENTION', 'false'],
  ['annulation d’arrivée sans retrait du journal', 'state.entries.filter(e => e.key !== tripKey)', 'state.entries'],
  ['absence de débrief comptée comme accord', "kind: 'pending'", "kind: 'match'"]
];
let n = 0;
for (const [name, from, to] of mutations) {
  assert(source.includes(from), 'Mutation devenue inapplicable : ' + name);
  let rejected = false; try { runTests(source.replaceAll(from, to), { quiet: true }); } catch (e) { rejected = true; }
  assert(rejected, 'Mutation non détectée : ' + name); n++; console.log('✅ Contre-test rejette : ' + name);
}
console.log(`${n}/${n} mutations rejetées`);
