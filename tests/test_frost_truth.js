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
    grab(src.app, /^(?:\/\/[^\n]*\n)*function frostBand\((?:x|Tr)\) \{[\s\S]*?\n\}/m) + '\nconst yn = (v, t) => v ? (t || "oui") : "non";\nconst ROW = ' + rowFn(src.app) + ';' +
    '\nthis.X = { summarize, windowAssess, narrate, colStats, frostBand, computeAlerts, ROW, frostRisk: typeof frostRisk === "function" ? frostRisk : null };', ctx);
  return ctx.X;
}
// Fenêtre synthétique de trois heures ; chaque heure : [air, chaussée estimée, humidité] avec humidité 'sec' (HR 80 %, aucune
// précipitation), 'humide' (0,3 mm/h à cette heure) ou 'inconnue' (HR et précipitations non fournies).
const hour = (t, T, Tr, hum = 'sec') => ({ t, hh: +t.slice(11, 13), T, Tr, RH: hum === 'inconnue' ? null : 80, P: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0,
  Pl: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0, snow: 0, code: hum === 'humide' ? 61 : 3, cloud: 90, vis: 20000, wind: 8, gust: 15, pp: 0, ice: { score: 0 } });
const seqOf = (rows, startH = 6) => { const hs = rows.map(([T, Tr, hum], k) => hour('2026-11-16T' + String(startH + k).padStart(2, '0') + ':00', T, Tr, hum)); return hs.map((_, i) => ({ hs, i })); };
const LV_NAME = { 0: 'RAS', 1: 'VIGILANCE', 2: 'PRUDENCE', 3: 'DANGER' };
const EXPECT = (Tr, hum) => Tr < -2 ? ['sous0', 3] : Tr <= 1 ? ['possible', 2] : Tr < 2 ? ['incertitude', hum === 'humide' ? 2 : 1] : Tr < 4 ? ['marge', 0] : ['aucun', 0];
// Bornes exigées (0,9 / 1,0 / 1,5 / 2,0 / 2,1 °C), chacune sec, humide et humidité inconnue ; air au-dessus de 1 °C.
const CASES = [];
for (const Tr of [0.9, 1.0, 1.5, 2.0, 2.1]) for (const hum of ['sec', 'humide', 'inconnue']) {
  const [key, level] = EXPECT(Tr, hum);
  CASES.push([`chaussée ${String(Tr).replace('.', ',')} °C, air ${String(Tr + 1).replace('.', ',')} °C, ${hum === 'inconnue' ? 'humidité inconnue' : hum}`, [[Tr + 1.5, Tr + 0.6, hum], [Tr + 1, Tr, hum], [Tr + 1.2, Tr + 0.4, hum]], key, level]);
}
CASES.push(['constat terrain : chaussée 0,6 °C, air 1,6 °C', [[2.0, 1.2], [1.6, 0.6], [1.8, 0.9]], 'possible', 2]);
CASES.push(['cas courant : air 5 °C, chaussée 3 °C, sec', [[5.5, 3.6], [5.0, 3.0], [5.2, 3.3]], 'marge', 0]);
CASES.push(['chaussée 6 °C, air 8 °C', [[8.5, 6.5], [8.0, 6.0], [8.2, 6.2]], 'aucun', 0]);
CASES.push(['chaussée −2,5 °C, air −1 °C', [[-0.5, -1.5], [-1.0, -2.5], [-0.8, -2.0]], 'sous0', 3]);
// Cohérence temporelle : chaussée froide (1,5 °C) le matin à sec, humidité seulement l'après-midi quand la chaussée est à 3 °C.
const TEMPORAL = [[2.5, 1.5, 'sec'], [4.0, 2.6, 'sec'], [5.5, 3.0, 'humide']];
const car = { id: 'voitureA', short: 'Voiture A', sporty: false, tire: { type: 'summer', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 } };
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + detail); } };
  t('une seule fonction frostRisk calcule le risque de gel d’une fenêtre (heure par heure, chaussée et humidité de la même heure)', typeof X.frostRisk === 'function', 'frostRisk absente');
  for (const [name, rows, want, level] of CASES) {
    const seq = seqOf(rows), sum = X.summarize(seq), c = X.colStats(seq), fr = X.frostRisk ? X.frostRisk(sum) : null;
    // main : booléen (true = « possible », false = « non ») ; correctif : clé de frostRisk.
    const row = c.frost && typeof c.frost === 'object' ? c.frost.key : c.frost ? 'possible' : 'aucun';
    t(`${name} · Gestion des pneus : « Risque de gel » = ${want}`, row === want, 'affiché : ' + row + ' (air min ' + sum.Tmin + ', chaussée min ' + sum.TrMin + ')');
    const w = X.windowAssess(car, seq, 'trip'), nar = w ? X.narrate(car, w, sum, 'au départ') : null, body = nar ? nar.body : '';
    if (want !== 'aucun' && want !== 'marge') t(`${name} · récit : jamais « Aucun risque de gel détecté »`, !/Aucun risque de gel détecté/.test(body), body.slice(0, 200));
    if (fr) t(`${name} · frostRisk : clé ${want}, niveau ${LV_NAME[level]}`, fr.airMin === sum.Tmin && fr.roadMin === sum.TrMin && fr.margin === 2 && fr.key === want && fr.level === level, JSON.stringify({ key: fr.key, level: fr.level, humid: fr.humid, ref: fr.ref }));
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3), t0 = al.t0;
    if (level >= 1) t(`${name} · alerte gel : ${LV_NAME[level]} (même règle), chaussée et heure nommées`, !!t0 && t0.sev === level && t0.title.includes(String(sum.TrMin).replace('.', ',')) && /vers \d\d:\d\d/.test(t0.title), JSON.stringify(t0));
    else t(`${name} · aucune alerte de gel (RAS)`, !t0 && !al.frost, JSON.stringify(t0 || al.frost));
    const fb = X.frostBand(sum);
    t(`${name} · carte trajet : ${level >= 1 ? 'bandeau de niveau ' + LV_NAME[level] : 'aucun bandeau'}`, level >= 1 ? !!fb && fb.lv === level : !fb, JSON.stringify(fb));
  }
  // Cohérence temporelle (audit) : jamais la chaussée d'une heure avec l'humidité d'une autre.
  { const seq = seqOf(TEMPORAL), sum = X.summarize(seq), fr = X.frostRisk ? X.frostRisk(sum) : null;
    t('temporel : chaussée 1,5 °C le matin à sec, humidité seulement l’après-midi (chaussée 3 °C) ⇒ VIGILANCE, pas PRUDENCE', !!fr && fr.key === 'incertitude' && fr.level === 1 && fr.humid === false, JSON.stringify(fr && { key: fr.key, level: fr.level, humid: fr.humid, ref: fr.ref }));
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3);
    t('temporel : alerte de gel en VIGILANCE, à l’heure froide (06:00)', !!al.t0 && al.t0.sev === 1 && /vers 06:00/.test(al.t0.title), JSON.stringify(al.t0)); }
  // Verglas, neige, pluie verglaçante : alertes indépendantes, priorité conservée.
  { const rows = [[2.5, 1.5, 'humide'], [2.0, 1.2, 'humide'], [2.2, 1.4, 'humide']], seq = seqOf(rows); seq.forEach(x => { x.hs[x.i].ice = { score: 70, level: 2 }; });
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3);
    t('verglas : alerte dédiée conservée, au-dessus de l’alerte de gel', !!al.ice && al.ice.sev >= 2 && (!al.t0 || al.ice.sev >= al.t0.sev), JSON.stringify({ ice: al.ice, t0: al.t0 })); }
  return ok;
}
// Surfaces de l'app : toutes lisent frostRisk (une donnée de référence : t.sum du trajet) ; synthèse sur TOUS les trajets.
function appChecks(src, collect) {
  const { app, wxdesk, shell, f1, race } = src;
  let ok = 0; const t = (name, cond) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name); console.log('❌ ' + name); } };
  const fb = grab(app, /^function frostBand\(x\) \{[\s\S]*?\n\}/m), cs = grab(app, /^function colStats\(seq\) \{[\s\S]*?\n\}/m), nt = grab(app, /^function renderBrfCore\(\) \{[\s\S]*?\n\}/m),
    cmp = grab(app, /^function renderCompare\(\) \{[\s\S]*?\n\}/m), core = grab(app, /^function renderDecisionCore\(\) \{[\s\S]*?\n\}/m), cars = grab(app, /^function renderCars\(\) \{[\s\S]*?\n\}/m);
  t('carte trajet (frostBand) : même règle que le moteur (frostRisk), aucun seuil propre', /frostRisk\(x\)/.test(fb) && /frostRisk\(\{ TrMin: x \}\)/.test(fb) && !/if \((lo|hi|Tr) *[<>]/.test(fb));
  t('Gestion des pneus (colStats) : gel lu dans frostRisk, jamais un seuil sur l’air', /frost: frostRisk\(s\)/.test(cs) && !/s\.Tmin <= 1/.test(cs));
  t('synthèse « Prochain risque » : pire risque de TOUS les trajets, domicile-travail compris', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)\.filter\(o => o\.r\)\.sort\(\(a, b\) => b\.r\.lv - a\.r\.lv/.test(nt) && !/T\.filter\(t => t !== main && t !== crit\)/.test(nt));
  t('synthèse : une incertitude gel en VIGILANCE (sans humidité) n’est jamais verte', /if \(fb && fb\.lv >= 1\) return \{ lv: fb\.lv,/.test(nt));
  t('« Quelle voiture prendre ? » : niveaux différents ou garde-fou ⇒ jamais « ne les distinguent pas »', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/.test(cmp));
  t('bandeau (décision) : ligne du trajet = fenêtre du trajet (tripFrost)', /const tf = tripFrost\(trip\);/.test(core) && /decision-trip-frost/.test(core));
  t('cartes pneus : prochain trajet lu dans tripFrost (même donnée)', /tripFrost\(\)/.test(cars) && /car-trip-frost/.test(cars));
  t('Ingénieur de course : fenêtre du trajet lue dans tripFrost', /frost: \(\(\) => \{ const tf = tripFrost\(\); return tf && tf\.fr; \}\)\(\)/.test(race) && /Fenêtre du trajet : air min/.test(f1));
  t('poste Météo (« chaussée proche du gel ») : même règle (frostRisk)', /typeof frostRisk === 'function' \? frostRisk\(\{ TrMin: Tr \}\)\.key/.test(wxdesk));
  t('marge ± 2 °C présentée comme une marge de prudence non mesurée (aide), plus « incertitude typique »', /Marge de prudence : ± 2 °C/.test(shell) && !/Incertitude typique/.test(shell));
  return ok;
}
function table(X) {
  console.log('\nTABLE · chaussée estimée (air = chaussée + 1 °C) · humidité à la même heure → clé · Gestion des pneus · niveau · alerte · bandeau');
  for (const Tr of [-2.5, -2.1, -2.0, -0.5, 0, 0.9, 1.0, 1.1, 1.5, 1.9, 2.0, 2.1, 3.0, 3.9, 4.0, 6.0]) for (const hum of ['sec', 'humide', 'inconnue']) {
    const seq = seqOf([[Tr + 1.5, Tr + 0.6, hum], [Tr + 1, Tr, hum], [Tr + 1.2, Tr + 0.4, hum]]), sum = X.summarize(seq), fr = X.frostRisk(sum), c = X.colStats(seq), fb = X.frostBand(sum);
    const al = X.computeAlerts({ hs: seq[0].hs, nowI: 0 }, [car], { alerts: {}, rainThr: 5 }, {}, 3), f = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
    console.log(`TABLE | ${f(Tr).padStart(4)} °C | marge ${f(Tr - 2)} → ${f(Tr + 2)} | ${hum.padEnd(8)} | ${fr.key.padEnd(11)} | « ${X.ROW(c)} » | ${LV_NAME[fr.level]} | alerte ${al.t0 ? LV_NAME[al.t0.sev] : 'aucune'} | ${fb ? fb.t : 'aucun bandeau'}`);
  }
}
const findings = [], X = load();
let ok = scenarios(X, findings); ok += appChecks(SRC, findings);
console.log(`\n${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)${process.env.REPRO === 'main' ? ' (reproducteur sur main)' : ''}`);
if (process.env.TABLE && !findings.length) table(X);
if (findings.length) process.exit(1);
// Contre-tests permanents : chaque mutation doit faire apparaître au moins un écart.
const MUT = [
  ['seuil appliqué à l’air (constat terrain)', 'engine', /const road = Number\.isFinite\(x\.Tr\), ref = road \? x\.Tr : /, 'const road = Number.isFinite(x.Tr), ref = Number.isFinite(x.T) ? x.T : '],
  ['marge de prudence ignorée', 'engine', /ref < FROST_ROAD_MARGIN \? 'incertitude'/, "false ? 'incertitude'"],
  ['seuil à 0 °C au lieu de 1 °C', 'engine', /ref <= FROST_ROAD_MAX \? 'possible'/, "ref <= 0 ? 'possible'"],
  ['marge faible devenue une alerte (matins de novembre)', 'engine', /marge: 0, aucun: 0 \}\)\[key\]/, 'marge: 2, aucun: 0 })[key]'],
  ['1 à 2 °C toujours en PRUDENCE (humidité ignorée)', 'engine', /incertitude: humid === true \? 2 : 1,/, 'incertitude: 2,'],
  ['humidité inconnue traitée comme humide', 'engine', /incertitude: humid === true \? 2 : 1,/, 'incertitude: humid === false ? 1 : 2,'],
  ['humidité d’une autre heure (audit temporel)', 'engine', /const humid = frostHumid\(hs, i\), key = frostKey\(ref\);/, 'const humid = hs.some((_, k) => frostHumid(hs, k) === true) ? true : frostHumid(hs, i), key = frostKey(ref);'],
  ['borne 1,0 °C exclue', 'engine', /ref <= FROST_ROAD_MAX \? 'possible'/, "ref < FROST_ROAD_MAX ? 'possible'"],
  ['borne 2,0 °C incluse dans l’incertitude', 'engine', /ref < FROST_ROAD_MARGIN \? 'incertitude'/, "ref <= FROST_ROAD_MARGIN ? 'incertitude'"],
  ['récit : retour de « Aucun risque de gel » sur l’air', 'engine', /if \(fr\.key === 'aucun'\) s\.push\('Aucun risque de gel détecté\.'\);/, "if (sum.Tmin > 1.5) s.push('Aucun risque de gel détecté.');"],
  ['alerte : retour du DANGER sur l’air seul', 'engine', /const fr = frostRisk\(sm\);\n    if \(fr\.level >= 1\) \{/, "const fr = frostRisk(sm);\n    if (sm.Tmin <= 1.5) { fr.level = 3;"],
  ['Gestion des pneus : seuil sur l’air', 'app', /frost: frostRisk\(s\),/, 'frost: s.Tmin != null && s.Tmin <= 1,'],
  ['synthèse : trajet principal exclu', 'app', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)/, 'const rk = T.filter(t => t !== main && t !== crit).map(t => ({ t, r: riskOf(t) }))'],
  ['A/B : garde-fou ignoré', 'app', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/, 'false ?'],
  ['carte trajet : seuil propre à l’affichage', 'app', /if \(fr\.key === 'sous0'\) return/, 'if (hi < 0) return'],
  ['synthèse verte avec une incertitude gel sèche', 'app', /if \(fb && fb\.lv >= 1\) return \{ lv: fb\.lv,/, 'if (fb && fb.lv >= 2) return { lv: fb.lv,'],
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
