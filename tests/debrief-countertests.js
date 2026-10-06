// Chaque mutation est une régression métier du débrief : le vrai module passe, chaque module altéré doit être rejeté.
const fs = require('fs'), assert = require('assert');
const { runTests, sourcePath } = require('./test_debrief.js');
const original = fs.readFileSync(sourcePath, 'utf8');
const count = runTests(original, { quiet: true });
const mutations = [
  { name: 'double débrief (idempotence retirée)', from: 'if (existing) return { state, record: existing, created: false };', to: '' },
  { name: 'annulation sans limite de 10 min', from: 'if (!r || now - r.createdAt > UNDO_MS) return', to: 'if (!r) return' },
  { name: 'origine en texte libre acceptée', from: "origin: typeof r.origin === 'string' && PLACE.test(r.origin) ? r.origin : null", to: 'origin: r.origin || null' },
  { name: 'observation sans source ni distance acceptée', from: 'if (!at || dist === null || !source) return null;', to: '' },
  { name: 'confiance globale recopiée dans le prévu', from: "level: pick(p.level, ['go', 'caution', 'risk', 'nogo']) };", to: "level: pick(p.level, ['go', 'caution', 'risk', 'nogo']), confidence: p.confidence };" },
  { name: 'carte jamais retirée après 2 h', from: "now - r.endedAt <= CARD_MS ? 'pending'", to: "true ? 'pending'" },
  { name: '« Pire » accepté sans cause', from: "if (verdict === 'worse' && !c.length) return { state, ok: false };", to: '' },
  { name: 'suggestion dès 3 cas', from: "n >= 5 ? 'suggestion'", to: "n >= 3 ? 'suggestion'" },
  { name: 'historique non borné', from: '.slice(0, MAX)', to: '' }
];
for (const m of mutations) {
  assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
  let rejection;
  try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
  assert(rejection instanceof assert.AssertionError, 'La mutation doit être rejetée : ' + m.name);
  console.log('✅ Contre-test rejeté : ' + m.name + ' → scénario rouge : ' + rejection.scenario);
}
console.log(count + ' scénarios, ' + mutations.length + ' mutations rejetées');
