'use strict';
// Lot G · une seule vérité pour le risque de gel. Constats terrain (même lieu, même trajet, même heure) : Gestion des pneus
// affichait une chaussée estimée 0,9 / 0,6 / 1,2 °C mais « Risque de gel (≤ 1 °C) : non / non / non » et le récit « Aucun
// risque de gel détecté » : le seuil était appliqué à l'AIR. Décision du propriétaire (03/11/2026, option A) : seuil sur la
// chaussée estimée, marge de prudence ± 2 °C (non mesurée), risque calculé HEURE PAR HEURE (chaussée et humidité de la même
// heure), humidité inconnue jamais traitée comme sèche :
//   chaussée < −2 °C DANGER · −2 à 1,0 °C : DANGER si humide ou inconnue, PRUDENCE si sèche · 1,0 à 2,0 °C (exclus) : PRUDENCE
//   si humide, VIGILANCE si sèche ou inconnue · 2,0 à 4,0 °C : RAS (marge faible).
// REPRO=main : reproducteur (chaque écart est compté). TABLE=1 : table de correspondance ET table main / branche (alertes,
// cartes, bandeau), calculées par les vraies fonctions, chaque baisse de niveau signalée. WHY=1 : raison de chaque mutation.
// Données fictives.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const readAt = (ref, f) => ref === 'main' ? execSync(`git show origin/main:src/${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 }) : fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const read = f => readAt(process.env.REPRO === 'main' ? 'main' : 'branche', f);
const sources = ref => ({ engine: readAt(ref, 'engine.js'), app: readAt(ref, 'app.js'), wxdesk: readAt(ref, 'wxdesk.js'), shell: readAt(ref, 'shell.html'), f1: readAt(ref, 'f1-pure.js'), race: readAt(ref, 'app/race-views.js') });
const SRC = sources(process.env.REPRO === 'main' ? 'main' : 'branche');
const grab = (src, re) => (re.exec(src) || [''])[0];
// Ligne « Risque de gel » de Gestion des pneus, telle qu'écrite dans l'app (fonction de rendu extraite, yn neutralisé).
const rowFn = app => { const m = /R\('Risque de gel[^']*', (c => [\s\S]*?)\),\n    R\('Risque verglas/.exec(app); return m ? m[1] : 'c => "?"'; };
function load(src = SRC) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Intl, console }; vm.createContext(ctx);
  vm.runInContext(src.engine + read('tirespecs.js') + read('tyrestate.js') + '\n' + src.wxdesk + '\n' + grab(src.app, /^function colStats\(seq\) \{[\s\S]*?\n\}/m) + '\n' +
    grab(src.app, /^(?:\/\/[^\n]*\n)*function frostBand\((?:x|Tr)\) \{[\s\S]*?\n\}/m) + '\nconst yn = (v, t) => v ? (t || "oui") : "non";\nconst ROW = ' + rowFn(src.app) + ';' +
    '\nthis.X = { summarize, windowAssess, narrate, colStats, frostBand, computeAlerts, wxDesk, ROW, frostRisk: typeof frostRisk === "function" ? frostRisk : null, frostHumid: typeof frostHumid === "function" ? frostHumid : null, precipWindow: typeof precipWindow === "function" ? precipWindow : null };', ctx);
  return ctx.X;
}
// Heure fictive : humidité 'sec' (HR 80 %, 0 mm), 'humide' (0,3 mm/h à cette heure), 'inconnue' (HR et pluie non fournies).
const hour = (t, T, Tr, hum = 'sec', extra = {}) => ({ t, hh: +t.slice(11, 13), T, Tr, RH: hum === 'inconnue' ? null : 80, P: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0,
  Pl: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0, snow: 0, code: hum === 'humide' ? 61 : 3, cloud: 90, vis: 20000, wind: 8, gust: 15, pp: 0, ice: { score: 0 }, ...extra });
// Fenêtre de trois heures précédée de deux heures d'historique (même humidité) : le cumul de pluie sur 3 h est complet.
const seqOf = (rows, startH = 4) => {
  const all = [[rows[0][0] + 0.5, rows[0][1] + 0.5, rows[0][2], rows[0][3]], [rows[0][0] + 0.3, rows[0][1] + 0.3, rows[0][2], rows[0][3]], ...rows];
  const hs = all.map(([T, Tr, hum, extra], k) => hour('2026-11-16T' + String(startH + k).padStart(2, '0') + ':00', T, Tr, hum, extra));
  return hs.slice(2).map((_, i) => ({ hs, i: i + 2 }));
};
const LV_NAME = { 0: 'RAS', 1: 'VIGILANCE', 2: 'PRUDENCE', 3: 'DANGER' };
const HUM = { sec: false, humide: true, inconnue: null };
const EXPECT = (Tr, hum) => Tr < -2 ? ['sous0', 3] : Tr <= 1 ? ['possible', hum === 'sec' ? 2 : 3] : Tr < 2 ? ['incertitude', hum === 'humide' ? 2 : 1] : Tr < 4 ? ['marge', 0] : ['aucun', 0];
const CASES = [];
for (const Tr of [-2.1, -2.0, 0.5, 0.9, 1.0, 1.1, 1.5, 2.0, 2.1]) for (const hum of ['sec', 'humide', 'inconnue']) {
  const [key, level] = EXPECT(Tr, hum);
  CASES.push([`chaussée ${String(Tr).replace('.', ',')} °C, air ${String(Math.round((Tr + 1) * 10) / 10).replace('.', ',')} °C, ${hum === 'inconnue' ? 'humidité inconnue' : hum}`, [[Tr + 1.5, Tr + 0.6, hum], [Tr + 1, Tr, hum], [Tr + 1.2, Tr + 0.4, hum]], key, level, HUM[hum]]);
}
CASES.push(['constat terrain : chaussée 0,6 °C, air 1,6 °C, sec', [[2.0, 1.2], [1.6, 0.6], [1.8, 0.9]], 'possible', 2, false]);
CASES.push(['cas courant : air 5 °C, chaussée 3 °C, sec', [[5.5, 3.6], [5.0, 3.0], [5.2, 3.3]], 'marge', 0, false]);
CASES.push(['chaussée 6 °C, air 8 °C', [[8.5, 6.5], [8.0, 6.0], [8.2, 6.2]], 'aucun', 0, false]);
// Givre : chaussée −1 °C, point de rosée au-dessus de la chaussée, sans pluie ⇒ humidité (dépôt) ⇒ DANGER.
CASES.push(['givre : chaussée −1 °C, point de rosée −0,5 °C, sans pluie', [[0.5, 0, 'sec', { Td: -0.6 }], [0.0, -1.0, 'sec', { Td: -0.5 }], [0.3, -0.4, 'sec', { Td: -0.7 }]], 'possible', 3, true]);
// Cumul de pluie incomplet : une heure du cumul sans valeur, aucun autre signal ⇒ humidité INCONNUE (jamais « sec »).
const MISSING = () => { const seq = seqOf([[1.5, 0.6, 'sec'], [1.5, 0.5, 'sec'], [1.7, 0.8, 'sec']]); seq[0].hs[2].P = null; seq[0].hs[2].Pl = null; return seq; };   // heure précédente du cumul sans valeur, heure courante mesurée (0 mm)
const TEMPORAL = [[2.5, 1.5, 'sec'], [4.0, 2.6, 'sec'], [5.5, 3.0, 'humide']];
const car = { id: 'voitureA', short: 'Voiture A', sporty: false, tire: { type: 'summer', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6 } };
// Comme buildHours en production : cumul de pluie sur 3 h attaché à chaque heure (lu par le poste Météo, heure seule).
const deskOf = (X, seq, T) => { const hs = seq[0].hs; if (X.precipWindow) hs.forEach((x, i) => { x.P3 = X.precipWindow(hs, i); });
  const d = X.wxDesk({ now: hs[seq[0].i].t, hours: hs.slice(seq[0].i), cur: { T, Tapp: T } }); return d && d.phen && d.phen.find(p => p.id === 'ice'); };
const alerts3 = (X, seq) => X.computeAlerts({ hs: seq[0].hs, nowI: seq[0].i }, [car], { alerts: {}, rainThr: 5 }, {}, 3);
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + detail); } };
  t('une seule fonction frostRisk calcule le risque de gel d’une fenêtre (heure par heure, chaussée et humidité de la même heure)', typeof X.frostRisk === 'function', 'frostRisk absente');
  t('une seule formule de rosée : x.Td (API ou dewMagnus en repli), plus de dewPoint', !/dewPoint\b/.test(SRC.engine) && /const Td = frostNum\(x\.Td\) != null \? x\.Td : /.test(SRC.engine), 'dewPoint présent ou Td non lu');
  for (const [name, rows, want, level, humid] of CASES) {
    const seq = seqOf(rows), sum = X.summarize(seq), c = X.colStats(seq), fr = X.frostRisk ? X.frostRisk(sum) : null;
    const row = c.frost && typeof c.frost === 'object' ? c.frost.key : c.frost ? 'possible' : 'aucun';   // main : booléen
    t(`${name} · Gestion des pneus : « Risque de gel » = ${want}`, row === want, 'affiché : ' + row + ' (air min ' + sum.Tmin + ', chaussée min ' + sum.TrMin + ')');
    const w = X.windowAssess(car, seq, 'trip'), nar = w ? X.narrate(car, w, sum, 'au départ') : null, body = nar ? nar.body : '';
    if (want !== 'aucun' && want !== 'marge') t(`${name} · récit : jamais « Aucun risque de gel détecté »`, !/Aucun risque de gel détecté/.test(body), body.slice(0, 200));
    if (fr) t(`${name} · frostRisk : ${want}, humidité ${humid === null ? 'inconnue' : humid ? 'présente' : 'absente'}, ${LV_NAME[level]}`, fr.key === want && fr.level === level && (level === 0 || fr.humid === humid), JSON.stringify({ key: fr.key, level: fr.level, humid: fr.humid, ref: fr.ref }));
    const al = alerts3(X, seq), t0 = al.t0;
    if (level >= 1) t(`${name} · alerte gel : ${LV_NAME[level]}, chaussée et heure nommées`, !!t0 && t0.sev === level && t0.title.includes(String(sum.TrMin).replace('.', ',')) && /vers \d\d:\d\d/.test(t0.title), JSON.stringify(t0));
    else t(`${name} · aucune alerte de gel (RAS)`, !t0 && !al.frost, JSON.stringify(t0 || al.frost));
    const fb = X.frostBand(sum);
    t(`${name} · carte trajet : ${level >= 1 ? 'bandeau ' + LV_NAME[level] : 'aucun bandeau'}`, level >= 1 ? !!fb && fb.lv === level : !fb, JSON.stringify(fb));
    const ice = deskOf(X, seq, rows[0][0]);
    t(`${name} · poste Météo (bandeau « gel ») : ${LV_NAME[level]}`, !!ice && ice.lv === level, JSON.stringify(ice && { lv: ice.lv, title: ice.title }));
  }
  { const seq = MISSING(), sum = X.summarize(seq), fr = X.frostRisk ? X.frostRisk(sum) : null, h = X.frostHumid ? X.frostHumid(seq[0].hs, seq[1].i) : 'absente';
    t('cumul de pluie avec une heure manquante, aucun autre signal : humidité « inconnue » (jamais « sec »), donc DANGER sous 1 °C', h === null && !!fr && fr.humid === null && fr.level === 3, JSON.stringify({ humid: h, fr: fr && { key: fr.key, level: fr.level, humid: fr.humid } })); }
  { const seq = seqOf(TEMPORAL), sum = X.summarize(seq), fr = X.frostRisk ? X.frostRisk(sum) : null, al = alerts3(X, seq);
    t('temporel : chaussée 1,5 °C le matin à sec, humidité seulement l’après-midi (chaussée 3 °C) ⇒ VIGILANCE, pas PRUDENCE', !!fr && fr.key === 'incertitude' && fr.level === 1 && fr.humid === false, JSON.stringify(fr && { key: fr.key, level: fr.level, humid: fr.humid, ref: fr.ref }));
    t('temporel : alerte de gel en VIGILANCE, à l’heure froide (06:00)', !!al.t0 && al.t0.sev === 1 && /vers 06:00/.test(al.t0.title), JSON.stringify(al.t0)); }
  { const seq = seqOf([[2.5, 1.5, 'humide'], [2.0, 1.2, 'humide'], [2.2, 1.4, 'humide']]); seq.forEach(x => { x.hs[x.i].ice = { score: 70, level: 2 }; });
    const al = alerts3(X, seq);
    t('verglas : alerte dédiée conservée, au moins au niveau de l’alerte de gel', !!al.ice && al.ice.sev >= 2 && (!al.t0 || al.ice.sev >= al.t0.sev), JSON.stringify({ ice: al.ice, t0: al.t0 })); }
  return ok;
}
// Surfaces de l'app : toutes lisent frostRisk (une donnée de référence : t.sum du trajet) ; synthèse sur TOUS les trajets.
function appChecks(src, collect) {
  const { app, wxdesk, shell, f1, race } = src;
  let ok = 0; const t = (name, cond) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name); console.log('❌ ' + name); } };
  const fb = grab(app, /^function frostBand\((?:x|Tr)\) \{[\s\S]*?\n\}/m), cs = grab(app, /^function colStats\(seq\) \{[\s\S]*?\n\}/m), nt = grab(app, /^function renderBrfCore\(\) \{[\s\S]*?\n\}/m),
    cmp = grab(app, /^function renderCompare\(\) \{[\s\S]*?\n\}/m), core = grab(app, /^function renderDecisionCore\(\) \{[\s\S]*?\n\}/m), cars = grab(app, /^function renderCars\(\) \{[\s\S]*?\n\}/m);
  t('carte trajet (frostBand) : même règle que le moteur (frostRisk), aucun seuil propre', /frostRisk\(x\)/.test(fb) && /frostRisk\(\{ TrMin: x \}\)/.test(fb) && !/if \((lo|hi|Tr) *[<>]/.test(fb));
  t('Gestion des pneus (colStats) : gel lu dans frostRisk, jamais un seuil sur l’air', /frost: frostRisk\(s\)/.test(cs) && !/s\.Tmin <= 1/.test(cs));
  t('synthèse « Prochain risque » : pire risque de TOUS les trajets, domicile-travail compris', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)\.filter\(o => o\.r\)\.sort\(\(a, b\) => b\.r\.lv - a\.r\.lv/.test(nt) && !/T\.filter\(t => t !== main && t !== crit\)/.test(nt));
  // Lot V : la synthèse lit tripRisk (risque global partagé) ; mêmes exigences, vérifiées dans tripRisk.
  const trk = grab(app, /^function tripRisk\(t\) \{[\s\S]*?\n\}/m);
  t('synthèse : une incertitude gel en VIGILANCE n’est jamais verte', /const riskOf = t => \{ const r = tripRisk\(t\);/.test(nt) && /if \(fb && fb\.lv >= 1\) c\.push\(\{ k: 'frost', lv: fb\.lv,/.test(trk));
  t('synthèse : pire cause du trajet (maximum), jamais la première trouvée', /const worst = c\.reduce\(\(a, x\) => !a \|\| x\.lv > a\.lv \? x : a, null\);/.test(trk));
  t('« Quelle voiture prendre ? » : niveaux différents ou garde-fou ⇒ jamais « ne les distinguent pas »', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/.test(cmp));
  t('bandeau (décision) : ligne du trajet = fenêtre du trajet (tripFrost)', /const tf = tripFrost\(trip\);/.test(core) && /decision-trip-frost/.test(core));
  t('cartes pneus : prochain trajet lu dans tripFrost (même donnée)', /tripFrost\(\)/.test(cars) && /car-trip-frost/.test(cars));
  t('Ingénieur de course : fenêtre du trajet lue dans tripFrost', /frost: \(\(\) => \{ const tf = tripFrost\(\); return tf && tf\.fr; \}\)\(\)/.test(race) && /Fenêtre du trajet : air min/.test(f1));
  t('poste Météo : même règle et même niveau (frostHour, heure par heure)', /typeof frostHour === 'function' \? frostHour\(\[x\], 0\)/.test(wxdesk) && /fh \? fh\.level :/.test(wxdesk));
  t('marge ± 2 °C présentée comme une marge de prudence non mesurée (aide), plus « incertitude typique »', /Marge de prudence : ± 2 °C/.test(shell) && !/Incertitude typique/.test(shell));
  return ok;
}
// Niveaux d'une case (chaussée, humidité) avec les fonctions d'une version (main ou branche) : alerte, carte, bandeau.
function levels(X, Tr, hum) {
  const seq = seqOf([[Tr + 1.5, Tr + 0.6, hum], [Tr + 1, Tr, hum], [Tr + 1.2, Tr + 0.4, hum]]), sum = X.summarize(seq);
  const al = alerts3(X, seq), fb = X.frostBand(X.frostRisk ? sum : sum.TrMin);
  const ice = deskOf(X, seq, Tr + 1.5);
  return { alerte: al.t0 ? al.t0.sev : 0, carte: fb ? fb.lv : 0, bandeau: ice ? ice.lv : 0 };
}
function table(X) {
  const f = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  console.log('\nTABLE · chaussée estimée (air = chaussée + 1 °C) · humidité à la même heure → clé · Gestion des pneus · niveau · alerte · bandeau');
  for (const Tr of [-2.5, -2.1, -2.0, -0.5, 0, 0.5, 0.9, 1.0, 1.1, 1.5, 1.9, 2.0, 2.1, 3.0, 3.9, 4.0, 6.0]) for (const hum of ['sec', 'humide', 'inconnue']) {
    const seq = seqOf([[Tr + 1.5, Tr + 0.6, hum], [Tr + 1, Tr, hum], [Tr + 1.2, Tr + 0.4, hum]]), sum = X.summarize(seq), fr = X.frostRisk(sum), c = X.colStats(seq), fb = X.frostBand(sum), al = alerts3(X, seq);
    console.log(`TABLE | ${f(Tr).padStart(4)} °C | marge ${f(Tr - 2)} → ${f(Tr + 2)} | ${hum.padEnd(8)} | ${fr.key.padEnd(11)} | « ${X.ROW(c)} » | ${LV_NAME[fr.level]} | alerte ${al.t0 ? LV_NAME[al.t0.sev] : 'aucune'} | ${fb ? fb.t : 'aucun bandeau'}`);
  }
  // Main / branche, de −3 à 4 °C : alertes (t0), cartes (bandeau de gel du trajet), poste Météo (bandeau « gel »).
  const M = load(sources('main')), lv = v => LV_NAME[v] || String(v);
  console.log('\nCOMPARE · chaussée · humidité · alerte main → branche · carte main → branche · bandeau main → branche (▼ = baisse de niveau)');
  let downs = 0;
  for (let k = -30; k <= 40; k += 5) for (const hum of ['sec', 'humide', 'inconnue']) {
    const Tr = k / 10, a = levels(M, Tr, hum), b = levels(X, Tr, hum);
    const cell = key => { const d = b[key] < a[key]; if (d) downs++; return `${lv(a[key])} → ${lv(b[key])}${d ? ' ▼' : b[key] > a[key] ? ' ▲' : ''}`; };
    console.log(`COMPARE | ${f(Tr).padStart(4)} °C | ${hum.padEnd(8)} | ${cell('alerte')} | ${cell('carte')} | ${cell('bandeau')}`);
  }
  console.log(`COMPARE · baisses de niveau : ${downs}`);
}
// Cohérence des surfaces (demande du propriétaire, 05/11) : de −3 à 4 °C par pas de 0,1 °C, humidité sèche, humide et
// inconnue, à heure et contexte identiques : alerte (t0), carte du trajet (frostBand) et bandeau « gel » du poste Météo donnent
// le niveau de la règle (option A) ; jamais RAS ou VIGILANCE sur une surface quand une autre est en DANGER.
function coherence(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + detail); } };
  let mixed = [];
  for (const hum of ['sec', 'humide', 'inconnue']) {
    const bad = [];
    for (let k = -30; k <= 40; k++) {
      const Tr = k / 10, l = levels(X, Tr, hum), want = EXPECT(Tr, hum)[1], v = [l.alerte, l.carte, l.bandeau];
      if (v.some(x => x !== want)) bad.push(`${Tr} °C : alerte ${LV_NAME[l.alerte]}, carte ${LV_NAME[l.carte]}, bandeau ${LV_NAME[l.bandeau]} (règle ${LV_NAME[want]})`);
      if (Math.max(...v) === 3 && Math.min(...v) <= 1) mixed.push(`${Tr} °C ${hum}`);
    }
    t(`cohérence ${hum} (−3 à 4 °C, pas 0,1 °C, 71 cas) : alerte, carte et bandeau au niveau de la règle`, !bad.length, bad.slice(0, 3).join(' | '));
  }
  t('cohérence : jamais RAS ou VIGILANCE sur une surface quand une autre est en DANGER (213 cas)', !mixed.length, mixed.slice(0, 5).join(', '));
  return ok;
}
const findings = [], X = load();
let ok = scenarios(X, findings); ok += appChecks(SRC, findings); ok += coherence(X, findings);
console.log(`\n${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)${process.env.REPRO === 'main' ? ' (reproducteur sur main)' : ''}`);
if (process.env.TABLE && !findings.length) table(X);
if (findings.length) process.exit(1);
// Contre-tests permanents : une mutation par case du tableau, puis les règles transverses.
const CELL = (key, humid, to) => { const lvl = { sous0: { any: 3 }, possible: { true: 3, false: 2, null: 3 }, incertitude: { true: 2, false: 1, null: 1 }, marge: { any: 0 }, aucun: { any: 0 } };
  const fnBody = Object.entries(lvl).map(([k, m]) => m.any !== undefined ? `key === '${k}' ? ${k === key ? to : m.any}` : `key === '${k}' ? (humid === true ? ${k === key && humid === true ? to : m.true} : humid === false ? ${k === key && humid === false ? to : m.false} : ${k === key && humid === null ? to : m.null})`).join(' : ') + ' : 0';
  return `const frostLevel = (key, humid) => ${fnBody};`; };
const LEVEL_FN = /const frostLevel = \(key, humid\) => [^\n]*;/;
const MUT = [
  ['case < −2 °C : DANGER abaissé', 'engine', LEVEL_FN, CELL('sous0', null, 2)],
  ['case −2 à 1 °C humide : DANGER abaissé', 'engine', LEVEL_FN, CELL('possible', true, 2)],
  ['case −2 à 1 °C sèche : PRUDENCE modifiée', 'engine', LEVEL_FN, CELL('possible', false, 3)],
  ['case −2 à 1 °C humidité inconnue : DANGER abaissé (inconnu traité comme sec)', 'engine', LEVEL_FN, CELL('possible', null, 2)],
  ['case 1 à 2 °C humide : PRUDENCE abaissée', 'engine', LEVEL_FN, CELL('incertitude', true, 1)],
  ['case 1 à 2 °C sèche : VIGILANCE relevée', 'engine', LEVEL_FN, CELL('incertitude', false, 2)],
  ['case 1 à 2 °C humidité inconnue : VIGILANCE modifiée', 'engine', LEVEL_FN, CELL('incertitude', null, 2)],
  ['case 2 à 4 °C : marge faible devenue une alerte', 'engine', LEVEL_FN, CELL('marge', null, 1)],
  ['case ≥ 4 °C : alerte inventée', 'engine', LEVEL_FN, CELL('aucun', null, 1)],
  ['borne 1,0 °C exclue', 'engine', /ref <= FROST_ROAD_MAX \? 'possible'/, "ref < FROST_ROAD_MAX ? 'possible'"],
  ['borne 2,0 °C incluse dans l’incertitude', 'engine', /ref < FROST_ROAD_MARGIN \? 'incertitude'/, "ref <= FROST_ROAD_MARGIN ? 'incertitude'"],
  ['borne −2 °C : DANGER dès −2,0 °C', 'engine', /ref < -FROST_ROAD_MARGIN \? 'sous0'/, "ref <= -FROST_ROAD_MARGIN ? 'sous0'"],
  ['seuil appliqué à l’air (constat terrain)', 'engine', /const road = frostNum\(x\.Tr\) != null, ref = road \? x\.Tr : frostNum\(x\.T\);/, 'const road = frostNum(x.Tr) != null, ref = frostNum(x.T) != null ? x.T : x.Tr;'],
  ['cumul de pluie : heure manquante comptée 0 mm', 'engine', /if \(P == null\) complete = false; else mm \+= P;/, 'mm += P || 0;'],
  ['humidité d’une autre heure (audit temporel)', 'engine', /const humid = frostHumid\(hs, i\), key = frostKey\(ref\);/, 'const humid = hs.some((_, k) => frostHumid(hs, k) === true) ? true : frostHumid(hs, i), key = frostKey(ref);'],
  ['givre ignoré (point de rosée ≥ chaussée)', 'engine', /const dep = Td != null && Tr != null && Td >= Tr;/, 'const dep = false;'],
  ['récit : retour de « Aucun risque de gel » sur l’air', 'engine', /if \(fr\.key === 'aucun'\) s\.push\('Aucun risque de gel détecté\.'\);/, "if (sum.Tmin > 1.5) s.push('Aucun risque de gel détecté.');"],
  ['alerte : seuil sur l’air seul', 'engine', /const fr = frostRisk\(sm\);\n    if \(fr\.level >= 1\) \{/, "const fr = frostRisk(sm);\n    if (sm.Tmin <= 1.5) { fr.level = 3;"],
  ['Gestion des pneus : seuil sur l’air', 'app', /frost: frostRisk\(s\),/, 'frost: s.Tmin != null && s.Tmin <= 1,'],
  ['synthèse : trajet principal exclu', 'app', /const rk = T\.map\(t => \(\{ t, r: riskOf\(t\) \}\)\)/, 'const rk = T.filter(t => t !== main && t !== crit).map(t => ({ t, r: riskOf(t) }))'],
  ['synthèse verte avec une incertitude gel sèche', 'app', /if \(fb && fb\.lv >= 1\) c\.push\(\{ k: 'frost', lv: fb\.lv,/, "if (fb && fb.lv >= 2) c.push({ k: 'frost', lv: fb.lv,"],
  ['synthèse : première cause au lieu du maximum (gel DANGER masqué)', 'app', /const worst = c\.reduce\(\(a, x\) => !a \|\| x\.lv > a\.lv \? x : a, null\);/, 'const worst = c[0] || null;'],
  ['A/B : garde-fou ignoré', 'app', /a\.w\.level !== b\.w\.level \|\| a\.w\.guard \|\| b\.w\.guard \?/, 'false ?'],
  ['carte trajet : seuil propre à l’affichage', 'app', /if \(fr\.key === 'sous0'\) return/, 'if (hi < 0) return'],
  ['bandeau : température « maintenant » au lieu du trajet', 'app', /const tf = tripFrost\(trip\);/, 'const tf = null;'],
  ['poste Météo : règle propre', 'wxdesk', /typeof frostHour === 'function' \? frostHour\(\[x\], 0\)/, 'false ? 0'],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  const mutated = { ...SRC, [file]: SRC[file].replace(from, to) }; assert.notStrictEqual(mutated[file], SRC[file], 'mutation inapplicable : ' + name);
  const f = []; const log = console.log; console.log = () => {};
  try { const Y = load(mutated); scenarios(Y, f); appChecks(mutated, f); coherence(Y, f); } catch (e) { f.push(e.message); } finally { console.log = log; }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
  if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + f[0].slice(0, 130));
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
