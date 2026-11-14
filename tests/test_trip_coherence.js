'use strict';
// Mission « Cohérence gel et trajet », PR 2 (constat du 14/11/2026) : A5 · « État de la route » (secteurs) et risque global du
// trajet (tripRisk) lisent la même fenêtre avec les MÊMES seuils (pluie : poste Météo, 0,2 mm/h VIGILANCE, 2 mm/h PRUDENCE ;
// neige PRUDENCE ; gel : règle option A) ; A4 · Ingénieur de course : départ daté et gel borné à la fenêtre. Données fictives.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SRC = { engine: src('engine.js'), app: src('app.js'), f1: src('f1-pure.js') };
const grab = (s, re) => (re.exec(s) || [''])[0];
function load(S = SRC) {
  const ctx = { Math, JSON, Date, Intl, Map, Set, Number, String, Array, Object, RegExp, console }; vm.createContext(ctx);
  vm.runInContext(S.engine + '\n' + S.f1 + '\nconst carProfile = c => ({ generic: false });\nconst esc = s => String(s);\n' +
    grab(S.app, /^function frostBand\(x\) \{[\s\S]*?\n\}/m) + '\n' + grab(S.app, /^function tripRisk\(t\) \{[\s\S]*?\n\}/m) + '\nthis.X = { tripRisk, F1Pure, frostRisk, summarize };', ctx);
  return ctx.X;
}
// Fenêtre fictive de trois heures du trajet (chaussée 9 °C, sans gel), pluie et neige paramétrées.
const hours = (P, snow = 0) => [6, 6, 7].map((h, k) => ({ t: '2026-11-16T0' + (h + (k ? k - 1 : 0)) + ':' + (k ? '00' : '30'), hh: h, T: 10, Tr: 9, RH: 80, Td: 4, P, Pl: snow > 0.05 ? 0 : P, snow, code: snow > 0.05 ? 71 : P ? 61 : 2, vis: 20000, gust: 20, ice: { level: 0, score: 0 }, P3: { mm: P * 3, complete: true } }));
const tripOf = (X, hs) => { const seq = hs.map((x, i) => ({ hs, i })), sum = X.summarize(seq); return { seq, t: { sum, seq, res: [{ c: { short: 'Test A' }, w: { level: 0, worst: { parts: [] } } }], worst: 0 } }; };
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) ok++; else collect.push(name + ' · ' + String(detail).slice(0, 300)); };
  for (const [mm, want] of [[0, 0], [0.19, 0], [0.2, 1], [0.5, 1], [1.99, 1], [2, 2], [7.6, 2]]) {
    t(`pluie ${mm} mm/h : seuil du poste Météo ⇒ ${want}`, X.F1Pure.rainLevel(mm) === want, X.F1Pure.rainLevel(mm));
    const { seq, t: trip } = tripOf(X, hours(mm)), track = X.F1Pure.trackConditions(seq), lvTrack = Math.max(...track.sectors.map(s => s.level)), r = X.tripRisk(trip);
    t(`pluie ${mm} mm/h : État de la route = risque global = ${want} (même fenêtre, mêmes seuils)`, lvTrack === want && r.lv === want && (want === 0 ? !r.why : /pluie/.test(r.why)), JSON.stringify({ lvTrack, r }));
  }
  { const { seq, t: trip } = tripOf(X, hours(0.4, 0.5)), lvTrack = Math.max(...X.F1Pure.trackConditions(seq).sectors.map(s => s.level)), r = X.tripRisk(trip);
    t('neige pendant le trajet : État de la route = risque global = PRUDENCE', lvTrack === 2 && r.lv === 2 && /neige/.test(r.why), JSON.stringify({ lvTrack, r })); }
  { const e = X.F1Pure.raceEngineer({ decision: { displayLevel: 0, reason: 'Conditions calmes' }, confidence: { level: 0, label: 'élevée' }, trip: { to: 'Lieu B', dep: '2026-11-16T06:30' }, when: 'lun. 16/11 · 06:30',
      frost: { key: 'aucun', airMin: 9, roadMin: 8.5, margin: 2 } });
    t('Ingénieur de course : départ daté et « aucun risque de gel » borné à la fenêtre', e.lines.some(l => l === 'Prochain trajet : Lieu B · départ prévu lun. 16/11 · 06:30') && e.lines.some(l => /· aucun risque de gel sur cette fenêtre$/.test(l)), JSON.stringify(e.lines)); }
  return ok;
}
const findings = [], X = load(), ok = scenarios(X, findings);
console.log(`${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
const MUT = [
  ['risque global sans la pluie (constat A5)', 'app', "if (rl >= 1) c.push({ k: 'rain'", "if (false) c.push({ k: 'rain'"],
  ['État de la route : ancien seuil de 0,5 mm/h', 'f1', 'const RAIN_MMH = 0.2,', 'const RAIN_MMH = 0.5,'],
  ['risque global sans la neige', 'app', "c.push({ k: 'snow', lv: 2,", "c.push({ k: 'snow', lv: 0,"],
  ['Ingénieur de course : heure seule', 'f1', "(text(when) || text(trip.dep).slice(11, 16))", "text(trip.dep).slice(11, 16)"],
  ['gel non borné à la fenêtre', 'f1', "frostTxt[k] + ' sur cette fenêtre'", 'frostTxt[k]'],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  assert(SRC[file].includes(from), 'mutation inapplicable : ' + name);
  const f = []; try { scenarios(load({ ...SRC, [file]: SRC[file].replace(from, to) }), f); } catch (e) { f.push(e.message); }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
