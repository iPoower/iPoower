'use strict';
// Mission « Cohérence gel et trajet » (constat du 14/11/2026, prod-207) : règle de référence option A du 03/11 appliquée
// PARTOUT, tous seuils × humidité, départage (pire niveau puis plus proche), vocabulaire unique et note pneus alignée.
//   chaussée < −2 °C : DANGER · −2 à 1 °C : DANGER si humide ou inconnue, PRUDENCE si sèche · 1 à 2 °C : PRUDENCE si humide,
//   VIGILANCE si sèche ou inconnue · 2 à 4 °C : RAS (marge faible) · ≥ 4 °C : RAS. Humidité inconnue jamais « sèche ».
// Données fictives uniquement. Contre-tests : chaque mutation de la règle ou de son câblage doit être rejetée.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = { engine: fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8'), wxdesk: fs.readFileSync(path.join(__dirname, '../src/wxdesk.js'), 'utf8') };
function load(src = SRC) {
  const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Intl, console }; vm.createContext(ctx);
  vm.runInContext(src.engine + '\n' + src.wxdesk + '\nthis.X = { frostHour, frostRisk, frostWords, frostSentence, summarize, hourVerdict, windowAssess, narrate, computeAlerts, precipWindow, wxDesk, FROST_WORDS };', ctx);
  return ctx.X;
}
// Heure fictive : 'humide' = 0,3 mm/h ; 'sec' = HR 60 %, point de rosée bas, 0 mm ; 'inconnue' = pluie et HR non fournies.
const hour = (t, T, Tr, hum) => ({ t, date: t.slice(0, 10), hh: +t.slice(11, 13), T, Tr, RH: hum === 'inconnue' ? null : 60, Td: hum === 'inconnue' ? null : Tr - 6,
  P: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0, Pl: hum === 'inconnue' ? null : hum === 'humide' ? 0.3 : 0, snow: 0, code: hum === 'humide' ? 61 : 1,
  cloud: 20, vis: 20000, wind: 5, gust: 10, pp: 0, ice: { score: 0, level: 0 } });
// Trois heures d'historique de même humidité (cumul de pluie sur 3 h complet), puis les heures évaluées.
function hoursOf(list, hum) {
  const hs = [];
  for (let k = 0; k < 3 + list.length; k++) { const Tr = k < 3 ? list[0] + 3 : list[k - 3], h = hour('2026-11-15T' + String(k).padStart(2, '0') + ':00', Tr + 1.5, Tr, hum); hs.push(h); }
  return hs;
}
const LV = ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'];
const EXPECT = (Tr, hum) => Tr < -2 ? 3 : Tr <= 1 ? (hum === 'sec' ? 2 : 3) : Tr < 2 ? (hum === 'humide' ? 2 : 1) : 0;
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; } else collect.push(name + ' · ' + String(detail).slice(0, 300)); };
  // 1. Tous les seuils (−2 / 1 / 2 / 4 °C) de part et d'autre × humide / sec / inconnu, heure seule.
  for (const Tr of [-2.5, -2.1, -2.0, -1.9, 0, 0.9, 1.0, 1.1, 1.5, 1.9, 2.0, 2.1, 3.9, 4.0, 4.1]) for (const hum of ['humide', 'sec', 'inconnue']) {
    const hs = hoursOf([Tr], hum), h = X.frostHour(hs, 3), want = EXPECT(Tr, hum);
    t(`chaussée ${Tr} °C · ${hum} → ${LV[want]}`, h && h.level === want && h.humid === (hum === 'humide' ? true : hum === 'sec' ? false : null), JSON.stringify(h));
    // Humidité inconnue n'est jamais « sèche » (libellé) ; même mot pour le même niveau.
    if (h && h.level >= 1) t(`libellé ${Tr} °C · ${hum} : humidité de la même heure, jamais « probable » ni « verglas »`,
      X.frostWords(h).label.includes(hum === 'humide' ? 'chaussée humide' : hum === 'sec' ? 'chaussée sèche' : 'humidité inconnue') && !/probable|verglas/.test(X.frostWords(h).label), X.frostWords(h).label);
  }
  // 2. Départage : le pire niveau l'emporte ; à niveau égal, l'heure la plus proche.
  { const hs = hoursOf([1.6, 0.8, -2.5, -1.0], 'humide'), sum = X.summarize([3, 4, 5, 6].map(i => ({ hs, i }))), fr = X.frostRisk(sum);
    t('départage : DANGER à 04:00 (0,8 °C humide) retenu avant DANGER à 05:00 (−2,5 °C), plus proche', fr.level === 3 && fr.s && fr.s.i === 4 && fr.ref === 0.8, JSON.stringify({ level: fr.level, i: fr.s && fr.s.i, ref: fr.ref }));
    t('un seul minimum par horizon : −2,5 °C vers 05:00, distinct de l’heure retenue', fr.roadMin === -2.5 && fr.sMin && fr.sMin.i === 5, JSON.stringify({ roadMin: fr.roadMin, i: fr.sMin && fr.sMin.i }));
    const ph = X.frostSentence(fr, 'nuit');
    t('phrase : niveau, humidité, minimum avec son heure et l’horizon écrit', /^Gel possible · DANGER vers 04:00 \(chaussée 0,8 °C, chaussée humide\) · chaussée estimée min -2,5 °C vers 05:00 \(nuit\)\.$/.test(ph), ph); }
  { const hs = hoursOf([1.5, 3.0, 0.5], 'sec'), fr = X.frostRisk(X.summarize([3, 4, 5].map(i => ({ hs, i }))));
    t('pire niveau d’abord : PRUDENCE (0,5 °C sèche, 05:00) l’emporte sur VIGILANCE plus proche (1,5 °C sèche, 03:00)', fr.level === 2 && fr.s.i === 5, JSON.stringify({ level: fr.level, i: fr.s && fr.s.i })); }
  // 3. Note pneus (courbe /100) : en pneus été, reprend le niveau de la règle et ne le dépasse pas pour le froid ; le score
  // affiché reste dans la tranche du niveau ; en pneus hiver, jamais au-dessus de la règle pour le froid.
  const car = type => ({ id: 'c' + type, short: 'Voiture ' + type, sporty: 1, tire: { type, size: '215/40 ZR18 89Y XL', tread: 6, treadAv: 6, treadAr: 6, dot: '1224' } });
  const band = (lv, sc) => sc >= [80, 60, 40, 0][lv] && sc <= [100, 79, 59, 39][lv];
  for (const Tr of [-2.5, 0, 0.9, 1.0, 1.5, 1.9]) for (const hum of ['humide', 'sec', 'inconnue']) {
    const hs = hoursOf([Tr], hum), want = EXPECT(Tr, hum);
    if (hum === 'inconnue') continue;   // note pneus : météo complète exigée (tireAssess), inconnu couvert par la règle ci-dessus
    const v = X.hourVerdict(car('summer'), hs, 3), w = X.hourVerdict(car('winter'), hs, 3);
    t(`note pneus été ${Tr} °C ${hum} : ${LV[want]}, score dans la tranche`, v && v.level === want && band(v.level, v.score), JSON.stringify(v && { level: v.level, score: v.score, raw: v.scoreRaw }));
    t(`note pneus hiver ${Tr} °C ${hum} : jamais au-dessus de la règle (${LV[want]})`, w && w.level <= want && band(w.level, w.score), JSON.stringify(w && { level: w.level, score: w.score }));
  }
  // Cas du constat (« DANGER 39/100 » à 04:00 pour 1,6 °C humide) : air proche de la chaussée, froid des pneus été très
  // pénalisant (score physique sous 40) ; la règle donne PRUDENCE, la note ne la dépasse pas et reste dans sa tranche.
  { const hs = hoursOf([1.6], 'humide'); hs.forEach(x => { x.T = x.Tr + 0.1; }); const v = X.hourVerdict(car('summer'), hs, 3);
    t('constat 14/11 : pneus été, chaussée 1,6 °C humide, score physique < 40 ⇒ PRUDENCE 40/100, jamais DANGER', v && v.scoreRaw < 40 && v.level === 2 && v.score === 40, JSON.stringify(v && { level: v.level, score: v.score, raw: v.scoreRaw })); }
  { const hs = hoursOf([1.5, 1.4, 1.6], 'humide'); hs.forEach(x => { x.T = x.Tr + 0.1; }); const seq = [3, 4, 5].map(i => ({ hs, i })), w = X.windowAssess(car('summer'), seq, 'trip');
    t('fenêtre pneus été (chaussée 1,4–1,6 °C humide, score physique < 40) : PRUDENCE, score dans la tranche, jamais DANGER', w && w.scoreRaw < 40 && w.level === 2 && band(2, w.score), JSON.stringify(w && { level: w.level, score: w.score, raw: w.scoreRaw })); }
  // 4. Récit (carte voiture) : humidité de la règle, verdict gel jamais remplacé par le verglas estimé.
  // Sans aucune pluie : humidité par air saturé (HR 97 %, air − rosée < 1 °C) ; l'ancien récit disait « chaussée sèche ».
  { const hs = hoursOf([6, 3, 1.5], 'sec'); hs.forEach(x => { x.T = x.Tr + 1; x.RH = 97; x.Td = x.T - 0.5; });
    const seq = [3, 4, 5].map(i => ({ hs, i })), sum = X.summarize(seq); sum.horizon = '12 h'; sum.iceLevel = 1; sum.iceI = seq[2];
    const w = X.windowAssess(car('summer'), seq, 'card'), n = X.narrate(car('summer'), w, sum, 'actuellement');
    t('récit : humidité de la même heure, verdict gel avec horizon, verglas en indicateur complémentaire', /actuellement, chaussée humide\./.test(n.body) && !/chaussée sèche/.test(n.body) && /Gel possible \(marge de prudence\) · PRUDENCE · chaussée humide · chaussée estimée min 1,5 °C vers 05:00 \(12 h\)/.test(n.body) && /Indicateur verglas \(complémentaire\)/.test(n.body) && !/Risque de verglas/.test(n.body), n.body); }
  // 5. Poste Météo : même niveau et même vocabulaire que la règle ; jamais « gel de surface probable ».
  { const hs = hoursOf([3, 1.6, 1.4, 1.6], 'humide'); hs.forEach((x, i) => { x.P3 = X.precipWindow(hs, i); x.ice = { level: 2, score: 50 }; });
    const d = X.wxDesk({ now: hs[3].t, hours: hs.slice(3), cur: { T: 4, Tapp: 2 } }), ice = d.phen.find(p => p.id === 'ice');
    t('poste Météo : PRUDENCE (règle), libellé unique, jamais « probable », indicateur verglas ÉLEVÉ non promu en DANGER', ice.lv === 2 && /^Gel possible \(marge de prudence\) · chaussée humide/.test(ice.line) && !/probable/i.test(JSON.stringify(d)) && d.hero.title === 'GEL POSSIBLE (MARGE DE PRUDENCE) · CHAUSSÉE HUMIDE · PRUDENCE', JSON.stringify({ lv: ice.lv, line: ice.line, title: d.hero.title }));
    t('poste Météo : un seul minimum avec son heure et l’horizon', ice.detail.some(l => /^Chaussée estimée min 1,4 °C ± 2 vers \d\d:\d\d \(jusqu’à /.test(l)), JSON.stringify(ice.detail)); }
  return ok;
}
const findings = [], X = load(), ok = scenarios(X, findings);
console.log(`${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
const MUT = [
  ['départage : la plus froide au lieu de la plus proche', 'engine', 'if (h && (!r.frost || h.level > r.frost.level)) r.frost', 'if (h && (!r.frost || h.level > r.frost.level || (h.level === r.frost.level && h.ref < r.frost.ref))) r.frost'],
  ['note pneus : froid des pneus été au-delà de la règle', 'engine', 'penEff: Math.min(100, frostZone ? Math.max(0, pen - penCold) : pen)', 'penEff: Math.min(100, pen)'],
  ['note pneus : niveau de la règle ignoré', 'engine', 'return Math.max(L, a.frostCap || 0);', 'return L;'],
  ['score hors de la tranche du niveau', 'engine', 'let score = scoreInBand(scoreRaw, level);', 'let score = scoreRaw;'],
  ['récit : « chaussée sèche » sur la pluie seule', 'engine', 's.push(`${f1(x0.T)} °C ${intro}, ${frostHumidWord(hum0)}.`);', 's.push(`${f1(x0.T)} °C ${intro}, ${w.first.flags.wet ? "chaussée humide" : "chaussée sèche"}.`);'],
  ['vocabulaire : « probable » réintroduit', 'engine', "possible: 'gel possible', incertitude:", "possible: 'gel de surface probable', incertitude:"],
  ['poste Météo : verglas estimé promu au-dessus de la règle (ancienne règle)', 'wxdesk', 'o.ice = Math.max(FZ.has(code) ? 3 : fh ? 0 :', 'o.ice = Math.max(FZ.has(code) ? 3 :'],
  ['poste Météo : minimum sans horizon', 'wxdesk', "vers ${hmd(r.t)} (jusqu’à ${hmd(endTs)})`", "vers ${hmd(r.t)}`"],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  assert(SRC[file].includes(from), 'mutation inapplicable : ' + name);
  const f = []; try { scenarios(load({ ...SRC, [file]: SRC[file].replace(from, to) }), f); } catch (e) { f.push(e.message); }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
