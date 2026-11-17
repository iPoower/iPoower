'use strict';
// Témoin « Intelligence pneumatique V2 » (17/11/2026) : les verdicts de src/engine.js sont figés sur une grille d'entrées
// fictives (8 montes × 72 météos horaires), calculés au SHA 98065b5. Le relais (src/relay.js) charge engine.js et
// evidence.js, jamais tyrelab.js ni le catalogue d'essais : mêmes entrées → mêmes verdicts → mêmes sorties du relais.
// Toute différence échoue ici. Régénérer UNIQUEMENT pour un changement du moteur relu et accepté par le propriétaire :
//   node tests/test_engine_tyre_golden.js --write
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), FIX = path.join(__dirname, 'fixtures/engine-tyre-golden.json');
const ENGINE = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
const load = src => { const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx); vm.runInContext(src + ';this.E={hourVerdict,windowAssess,summarize};', ctx); return ctx.E; };
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const CARS = {
  'été V 6 mm': { type: 'summer', size: '225/45 R17 94V XL', tread: 6 },
  'été Y 6 mm': { type: 'summer', size: '225/45 R17 94Y XL', tread: 6 },
  'été Y 2,5 mm': { type: 'summer', size: '225/45 R17 94Y XL', tread: 2.5 },
  'été Y 1,4 mm': { type: 'summer', size: '225/45 R17 94Y XL', tread: 1.4 },
  '4 saisons W': { type: 'allseason', size: '225/45 R17 94W XL', tread: 6 },
  'hiver V': { type: 'winter', size: '225/45 R17 94V XL', tread: 6 },
  'type inconnu': { type: 'unknown', size: '225/45 R17 94Y XL', tread: 6 },
  'été Y + train prévu': { type: 'summer', size: '225/45 R17 94Y XL', tread: 6, plan: true }
};
const car = (name, c) => ({ id: 'fixture-' + name, name: 'Voiture ' + name, short: 'V', sporty: false,
  tire: { type: c.type, brand: 'Marque test', model: 'Modèle test', size: c.size, tread: c.tread, press: '2,4' },
  ...(c.plan ? { plan: { on: 1, brand: 'Marque B', model: 'Modèle prévu', size: '225/45 R17 94W XL', date: '2027-03-01' } } : {}) });
const WX = { sec: {}, 'pluie 2': { P: 2, Pl: 2, RH: 95 }, 'pluie 5': { P: 5, Pl: 5, RH: 97 }, 'pluie 9': { P: 9, Pl: 9, RH: 99 },
  brouillard: { vis: 150, RH: 100 }, rafales: { gust: 95 }, neige: { snow: 1.2, code: 73, RH: 95 }, verglaçante: { P: 1, Pl: 1, code: 66, RH: 98 },
  'verglas estimé': { ice: { score: 60, level: 2 }, RH: 96 } };
const COLD_ONLY = new Set(['neige', 'verglaçante', 'verglas estimé']);
const hours = (T, w) => Array.from({ length: 6 }, (_, k) => ({ t: `2026-11-17T${String(6 + k).padStart(2, '0')}:00`, T, Tr: T - 1, Td: T - 2,
  RH: 80, P: 0, Pl: 0, snow: 0, code: 1, vis: 20000, gust: 20, ice: { score: 0, level: 0 }, ...w }));
const short = v => v == null ? null : { level: v.level, score: v.score, scoreRaw: v.scoreRaw, baseLevel: v.baseLevel, frostLv: v.frostLv,
  guard: v.guard ? v.guard.level : null, parts: (v.a || v.first || { parts: [] }).parts.map(p => `${p.label}:${p.v}`) };
function compute(E) {
  const out = {};
  for (const T of [-4, -1, 1, 3, 5, 7, 10, 15, 22, 28]) for (const [wn, w] of Object.entries(WX)) {
    if (COLD_ONLY.has(wn) && T > 3) continue;
    const hs = hours(T, w), seq = [0, 1, 2].map(i => ({ hs, i, loc: 'A' }));
    const key = `${T}|${wn}`, row = { summary: sha(E.summarize(seq)) };
    for (const [cn, c] of Object.entries(CARS)) {
      const k = car(cn, c);
      const h = short(E.hourVerdict(k, hs, 0)), t = short(E.windowAssess(k, seq, 'trip'));
      row[cn] = [h && [h.level, h.score, h.scoreRaw, h.baseLevel, h.frostLv, h.guard, h.parts.join(' ; ')], t && [t.level, t.score, t.scoreRaw, t.baseLevel, t.frostLv, t.guard]];
    }
    out[key] = JSON.parse(JSON.stringify(row));
  }
  return out;
}
const now = compute(load(ENGINE));
if (process.argv.includes('--write')) { fs.writeFileSync(FIX, JSON.stringify({ sha: '98065b5', note: 'verdicts engine.js figés (V2 pneus, 17/11/2026)', cases: now }) + '\n'); console.log('témoin écrit : ' + Object.keys(now).length + ' météos'); process.exit(0); }
const golden = JSON.parse(fs.readFileSync(FIX, 'utf8'));
let n = 0;
for (const [key, row] of Object.entries(golden.cases)) { assert.deepEqual(now[key], row, `verdict moteur modifié pour ${key}`); n++; }
assert.equal(Object.keys(now).length, n, 'grille du témoin incomplète');
const cases = n * Object.keys(CARS).length;
console.log(`✅ témoin moteur : ${n} météos × ${Object.keys(CARS).length} montes = ${cases} verdicts horaires et ${cases} verdicts de trajet identiques au SHA ${golden.sha}`);
// Le relais ne charge que ces fichiers du dossier src : aucun module de l'onglet Analyse ni du catalogue d'essais.
const relay = fs.readFileSync(path.join(root, 'src/relay.js'), 'utf8');
const loaded = [...relay.matchAll(/readFileSync\(path\.join\(dir, '([^']+\.js)'\)/g)].map(m => m[1]).sort();
const evidenceFile = [...relay.matchAll(/path\.join\(dir, '([^']+\.js)'\)/g)].map(m => m[1]);
assert.deepEqual([...new Set([...loaded, ...evidenceFile])].sort(), ['engine.js', 'evidence.js']);
assert(!/tyrelab|tyre-evidence|tyre-intelligence/.test(relay), 'le relais ne dépend pas du simulateur ni du catalogue');
console.log('✅ relais : charge seulement engine.js et evidence.js (ni tyrelab.js, ni le catalogue d’essais)');
// Le train prévu ne change aucun verdict du moteur (même monte active, avec ou sans projet de montage).
for (const row of Object.values(now)) assert.deepEqual(row['été Y + train prévu'], row['été Y 6 mm']);
console.log('✅ train prévu non monté : verdicts horaires et de trajet identiques à la monte active seule');
// Contre-tests : le témoin doit détecter une modification du moteur (malus froid été, majoration mouillé, indice de vitesse).
for (const [name, from, to] of [['courbe été froid', '[5, 24]', '[5, 20]'], ['majoration mouillé', '(wet ? 1.25 : 0.75)', '(wet ? 1 : 0.75)'],
  ['facteur indice de vitesse', "f *= 1.07", "f *= 1"], ['pluie forte', 'P >= 7.6 ? 18', 'P >= 7.6 ? 12']]) {
  assert(ENGINE.includes(from), 'contre-test introuvable : ' + name);
  const mutated = compute(load(ENGINE.replace(from, to)));
  assert.notDeepEqual(mutated, golden.cases, 'le témoin doit détecter : ' + name);
  console.log('✅ contre-test détecté : ' + name);
}
