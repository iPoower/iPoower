'use strict';
// Lot G · une seule vérité pour le risque de gel. Constats terrain (même lieu, même trajet, même heure) : Gestion des pneus
// affichait une chaussée estimée 0,9 / 0,6 / 1,2 °C mais « Risque de gel (≤ 1 °C) : non / non / non » et le récit « Aucun
// risque de gel détecté » : le seuil était appliqué à l'AIR (1,9 / 1,6 / 2,0 °C) ; l'alerte « Proche de 0 °C » passait en DANGER
// sur l'air seul. Attendu : le seuil s'applique à la chaussée estimée avec sa marge de prudence (± 2 °C, non mesurée) ; une
// seule fonction (frostRisk) lue par toutes les surfaces ; « marge faible » (chaussée 2 à 4 °C, matins frais) n'alerte jamais.
// Exécuté sur main (REPRO=main), il sert de reproducteur : chaque écart est compté. TABLE=1 imprime la table de correspondance,
// calculée par les vraies fonctions. Données fictives.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = f => process.env.REPRO === 'main' ? execSync(`git show origin/main:src/${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }) : fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const SRC = { engine: read('engine.js'), app: read('app.js'), wxdesk: read('wxdesk.js'), shell: read('shell.html'), f1: read('f1-pure.js'), race: read('app/race-views.js') };
const grab = (src, re) => (re.exec(src) || [''])[0];
// Ligne « Risque de gel » de Gestion des pneus, telle qu'écrite dans l'app (fonction de rendu extraite, yn neutralisé).
const rowFn = app => { const m = /R\('Risque de gel[^']*', (c => [^\n]*)\),\n/.exec(app); return m ? m[1] : 'c => "?"'; };
function load(src = SRC) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Intl, console }; vm.createContext(ctx);
  vm.runInContext(src.engine + read('tirespecs.js') + read('tyrestate.js') + '\n' + grab(src.app, /^function colStats\(seq\) \{[\s\S]*?\n\}/m) + '\n' +
    grab(src.app, /^(?:\/\/[^\n]*\n)*function frostBand\(Tr\) \{[\s\S]*?\n\}/m) + '\nconst yn = (v, t) => v ? (t || "oui") : "non";\nconst ROW = ' + rowFn(src.app) + ';' +
    '\nthis.X = { summarize, windowAssess, narrate, colStats, frostBand, computeAlerts, ROW, frostRisk: typeof frostRisk === "function" ? frostRisk : null };', ctx);
  return ctx.X;
}
// Fenêtre synthétique : trois heures de nuit/matin, sec, sans brouillard ; air et chaussée estimée fixés (T, Tr).
const hour = (t, T, Tr) => ({ t, hh: +t.slice(11, 13), T, Tr, RH: 80, P: 0, Pl: 0, snow: 0, code: 3, cloud: 90, vis: 20000, wind: 8, gust: 15, pp: 0, ice: { score: 0 } });
const seqOf = rows => { const hs = rows.map(([T, Tr], k) => hour('2026-11-16T0' + (6 + k) + ':00', T, Tr)); return hs.map((_, i) => ({ hs, i })); };
const CASES = [['chaussée 0,9 °C, air 1,9 °C', [[2.4, 1.6], [1.9, 0.9], [2.1, 1.3]], 'possible'], ['chaussée 1,0 °C, air 1,9 °C', [[2.4, 1.6], [1.9, 1.0], [2.1, 1.3]], 'possible'],
  ['chaussée 1,1 °C, air 1,9 °C (dans la marge ± 2 °C)', [[2.4, 1.6], [1.9, 1.1], [2.1, 1.3]], 'incertitude'], ['chaussée 0,6 °C, air 1,6 °C (constat terrain)', [[2.0, 1.2], [1.6, 0.6], [1.8, 0.9]], 'possible'],
  ['cas courant : air 5 °C, chaussée 3 °C, sec', [[5.5, 3.6], [5.0, 3.0], [5.2, 3.3]], 'marge'], ['chaussée 6 °C, air 8 °C', [[8.5, 6.5], [8.0, 6.0], [8.2, 6.2]], 'aucun'],
  ['chaussée −2,5 °C, air −1 °C', [[-0.5, -1.5], [-1.0, -2.5], [-0.8, -2.0]], 'sous0']];
const LEVEL = { sous0: 3, possible: 2, incertitude: 2, marge: 0, aucun: 0 };
const car = { id: 'voitureA', short: 'Voiture A', sporty: false, tire: { type: 'summer', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 } };
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + detail); } };
  t('une seule fonction frostRisk calcule le risque de gel d’une fenêtre (air et chaussée estimée, marge de prudence)', typeof X.frostRisk === 'function', 'frostRisk absente');
  for (const [name, rows, want] of CASES) {
    const seq = seqOf(rows), sum = X.summarize(seq), c = X.colStats(seq), fr = X.frostRisk ? X.frostRisk(sum) : null;
    // main : booléen (true = « possible », false = « non ») ; correctif : clé de frostRisk.
    const row = c.frost && typeof c.frost === 'object' ? c.frost.key : c.frost ? 'possible' : 'aucun';
    const okRow = row === want || (want === 'sous0' && row === 'possible' && !fr);
    t(`${name} · Gestion des pneus : « Risque de gel » = ${want}`, okRow, 'affiché : ' + row + ' (air min ' + sum.Tmin + ', chaussée min ' + sum.TrMin + ')');
    const w = X.windowAssess(car, seq, 'trip'), nar = w ? X.narrate(car, w, sum, 'au départ') : null, body = nar ? nar.body : '';
    if (want !== 'aucun' && want !== 'marge') t(`${name} · récit : jamais « Aucun risque de gel détecté »`, !/Aucun risque de gel détecté/.test(body), body.slice(0, 200));
    if (fr) t(`${name} · frostRisk : air ${sum.Tmin} °C, chaussée ${sum.TrMin} °C, clé ${want}, niveau ${LEVEL[want]}`,
      fr.airMin === sum.Tmin && fr.roadMin === sum.TrMin && fr.margin === 2 && fr.key === want && fr.level === LEVEL[want], JSON.stringify(fr));
    // Alerte « gel » : même règle et même niveau ; jamais d'alerte sur une marge faible (matin frais de novembre).
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3), t0 = al.t0;
    if (LEVEL[want] >= 2) t(`${name} · alerte gel : niveau ${LEVEL[want]} (même règle), valeur de chaussée et heure nommées`, !!t0 && t0.sev === LEVEL[want] && t0.title.includes(String(sum.TrMin).replace('.', ',')), JSON.stringify(t0));
    else t(`${name} · aucune alerte de gel (RAS)`, !t0 && !al.frost, JSON.stringify(t0 || al.frost));
    // Carte trajet (bandeau de gel) : jamais pour une marge faible ou aucun risque ; sinon niveau identique.
    const fb = X.frostBand(sum.TrMin);
    t(`${name} · carte trajet : ${LEVEL[want] >= 2 ? 'bandeau de niveau ' + LEVEL[want] : 'aucun bandeau'}`, LEVEL[want] >= 2 ? !!fb && Math.min(3, fb.lv) === Math.min(3, LEVEL[want]) : !fb, JSON.stringify(fb));
  }
  return ok;
}
// Surfaces de l'app : toutes lisent frostRisk (une donnée de référence : t.sum du trajet) ; synthèse sur TOUS les trajets.
function appChecks(src, collect) {
  const { app, wxdesk, shell, f1, race } = src;
  let ok = 0; const t = (name, cond) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name); console.log('❌ ' + name); } };
  const fb = grab(app, /^function frostBand\(Tr\) \{[\s\S]*?\n\}/m), cs = grab(app, /^function colStats\(seq\) \{[\s\S]*?\n\}/m), nt = grab(app, /^function renderBrfCore\(\) \{[\s\S]*?\n\}/m),
    cmp = grab(app, /^function renderCompare\(\) \{[\s\S]*?\n\}/m), core = grab(app, /^function renderDecisionCore\(\) \{[\s\S]*?\n\}/m), cars = grab(app, /^function renderCars\(\) \{[\s\S]*?\n\}/m);
  t('carte trajet (frostBand) : même règle que le moteur (frostRisk), aucun seuil propre', /frostRisk\(\{ TrMin: Tr \}\)/.test(fb) && !/if \((lo|hi|Tr) *[<>]/.test(fb));
  t('Gestion des pneus (colStats) : gel lu dans frostRisk, jamais un seuil sur l’air', /frost: frostRisk\(s\)/.test(cs) && !/s\.Tmin <= 1/.test(cs));
  t('synthèse « Prochain risque » : pire risque de TOUS les trajets, domicile-travail compris', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)\.filter\(o => o\.r\)\.sort\(\(a, b\) => b\.r\.lv - a\.r\.lv/.test(nt) && !/T\.filter\(t => t !== main && t !== crit\)/.test(nt));
  t('« Quelle voiture prendre ? » : niveaux différents ou garde-fou ⇒ jamais « ne les distinguent pas »', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/.test(cmp));
  t('bandeau (décision) : ligne du trajet = fenêtre du trajet (tripFrost)', /const tf = tripFrost\(trip\);/.test(core) && /decision-trip-frost/.test(core));
  t('cartes pneus : prochain trajet lu dans tripFrost (même donnée)', /tripFrost\(\)/.test(cars) && /car-trip-frost/.test(cars));
  t('Ingénieur de course : fenêtre du trajet lue dans tripFrost', /frost: \(\(\) => \{ const tf = tripFrost\(\); return tf && tf\.fr; \}\)\(\)/.test(race) && /Fenêtre du trajet : air min/.test(f1));
  t('poste Météo (« chaussée proche du gel ») : même règle (frostRisk)', /typeof frostRisk === 'function' \? frostRisk\(\{ TrMin: Tr \}\)\.key/.test(wxdesk));
  t('marge ± 2 °C présentée comme une marge de prudence non mesurée (aide), plus « incertitude typique »', /Marge de prudence : ± 2 °C/.test(shell) && !/Incertitude typique/.test(shell));
  return ok;
}
function table(X) {
  const name = { 0: 'RAS', 1: 'VIGILANCE', 2: 'PRUDENCE', 3: 'DANGER' };
  console.log('\nTABLE · chaussée estimée (air = chaussée + 1 °C, sec) → clé · Gestion des pneus · niveau · alerte · bandeau de gel');
  for (const Tr of [-2.5, -2.1, -2.0, -0.5, 0, 0.9, 1.0, 1.1, 1.5, 1.9, 2.0, 3.0, 3.9, 4.0, 6.0]) {
    const seq = seqOf([[Tr + 1.5, Tr + 0.5], [Tr + 1, Tr], [Tr + 1.2, Tr + 0.3]]), sum = X.summarize(seq), fr = X.frostRisk(sum), c = X.colStats(seq), fb = X.frostBand(sum.TrMin);
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3);
    console.log(`TABLE | ${String(Tr).replace('.', ',').padStart(4)} °C | marge ${String(Tr - 2).replace('.', ',')} → ${String(Tr + 2).replace('.', ',')} | ${fr.key.padEnd(11)} | « ${X.ROW(c)} » | ${name[fr.level]} | alerte ${al.t0 ? name[al.t0.sev] : 'aucune'} | ${fb ? fb.t : 'aucun bandeau'}`);
  }
}
const findings = [], X = load();
let ok = scenarios(X, findings); ok += appChecks(SRC, findings);
console.log(`\n${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)${process.env.REPRO === 'main' ? ' (reproducteur sur main)' : ''}`);
if (process.env.TABLE && !findings.length) table(X);
if (findings.length) process.exit(1);
// Contre-tests permanents : chaque mutation doit faire apparaître au moins un écart.
const MUT = [
  ['seuil appliqué à l’air (constat terrain)', 'engine', /ref = roadMin != null \? roadMin : airMin/, 'ref = airMin != null ? airMin : roadMin'],
  ['marge de prudence ignorée', 'engine', /lo = ref - FROST_ROAD_MARGIN, hi = ref \+ FROST_ROAD_MARGIN/, 'lo = ref, hi = ref'],
  ['seuil à 0 °C au lieu de 1 °C', 'engine', /ref <= FROST_ROAD_MAX \? 'possible'/, "ref <= 0 ? 'possible'"],
  ['marge faible devenue une alerte (matins de novembre)', 'engine', /marge: 0, aucun: 0 \}\[key\]/, 'marge: 2, aucun: 0 }[key]'],
  ['récit : retour de « Aucun risque de gel » sur l’air', 'engine', /if \(fr\.key === 'aucun'\) s\.push\('Aucun risque de gel détecté\.'\);/, "if (sum.Tmin > 1.5) s.push('Aucun risque de gel détecté.');"],
  ['alerte : retour du DANGER sur l’air seul', 'engine', /const fr = frostRisk\(sm\);\n    if \(fr\.level >= 2\) \{/, "const fr = frostRisk(sm);\n    if (sm.Tmin <= 1.5) { fr.level = 3;"],
  ['Gestion des pneus : seuil sur l’air', 'app', /frost: frostRisk\(s\),/, 'frost: s.Tmin != null && s.Tmin <= 1,'],
  ['synthèse : trajet principal exclu', 'app', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)/, 'const rk = T.filter(t => t !== main && t !== crit).map(t => ({ t, r: riskOf(t) }))'],
  ['A/B : garde-fou ignoré', 'app', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/, 'false ?'],
  ['carte trajet : seuil propre à l’affichage', 'app', /if \(fr\.key === 'sous0'\) return/, 'if (hi < 0) return'],
  ['bandeau : température « maintenant » au lieu du trajet', 'app', /const tf = tripFrost\(trip\);/, 'const tf = null;'],
  ['poste Météo : règle propre', 'wxdesk', /typeof frostRisk === 'function' \? frostRisk\(\{ TrMin: Tr \}\)\.key/, "false ? 0"],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  const mutated = { ...SRC, [file]: SRC[file].replace(from, to) }; assert.notStrictEqual(mutated[file], SRC[file], 'mutation inapplicable : ' + name);
  const f = []; const log = console.log; console.log = () => {};
  try { scenarios(load(mutated), f); appChecks(mutated, f); } catch (e) { f.push(e.message); } finally { console.log = log; }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
  if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + f[0].slice(0, 130));
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
