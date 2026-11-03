'use strict';
// Lot G · chaîne réelle de construction et de consommation des heures pour le gel (réponse météo FICTIVE de démonstration) :
// makeModel/buildHours (cumul de pluie P3 attaché à chaque heure) → poste Météo (frostHour sur une heure seule), trajet
// (legSeq sur des modèles distincts), recalage par une station (applyObs) ; l'ensemble (ensembleStats) n'alimente pas la règle de
// gel. Heure sans P3 : humidité « inconnue » affichée, jamais un « verglas » présenté comme certain. Contre-tests par mutation.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SRC = { engine: src('engine.js'), wxdesk: src('wxdesk.js') };
const T0 = Date.parse('2026-11-16T05:00:00+01:00');
function load(S = SRC) {
  const D = class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } };
  const ctx = { console, Math, Date: D, Intl, Map, Set, JSON, Object, Array, Number, String, RegExp }; vm.createContext(ctx);
  vm.runInContext(S.engine + src('demo.js') + '\n' + S.wxdesk + ';this.X={ makeModel, makeDemoPayload, makeDemoEnsemble, ensembleStats, applyObs, legSeq, summarize, frostHour, frostRisk, frostHumid, wxDesk };', ctx);
  return ctx.X;
}
const LA = { id: 'a', name: 'Lieu A', lat: 48.85, lon: 2.35 }, LB = { id: 'b', name: 'Lieu B', lat: 48.95, lon: 2.55 };
// Matin froid fictif : air 1 à 2 °C, ciel dégagé, vent faible ; pluie seulement à 05:00 (heure courante) sur le Lieu A.
const cold = (p, rainAt) => { const H = p.hourly; H.time.forEach((t, i) => { const hh = +t.slice(11, 13), day = t.slice(0, 10) === '2026-11-16';
  if (day && hh <= 9) { H.temperature_2m[i] = 1.2 + (hh - 5) * 0.2; H.cloud_cover[i] = 5; H.wind_speed_10m[i] = 3; H.relative_humidity_2m[i] = 80; H.precipitation[i] = 0; if (H.dew_point_2m) H.dew_point_2m[i] = null; }
  if (rainAt && t === rainAt) H.precipitation[i] = 0.4; }); return p; };
function chain(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + String(detail).slice(0, 300)); } };
  const ma = X.makeModel(cold(X.makeDemoPayload('froid', LA, 'Europe/Paris', 0), '2026-11-16T05:00'), 'demo', LA), mb = X.makeModel(cold(X.makeDemoPayload('froid', LB, 'Europe/Paris', 0)), 'demo', LB);
  const hs = ma.hs, i = ma.nowI;
  t('construction : heure courante précédée d’au moins deux heures (past_days=1)', i >= 2 && hs[i].t === '2026-11-16T05:00', `nowI=${i} ${hs[i] && hs[i].t}`);
  t('construction : P3 attaché à chaque heure, complet dès la troisième heure', hs.every(x => x.P3 && typeof x.P3.complete === 'boolean') && hs.slice(2).every(x => x.P3.complete), JSON.stringify(hs.slice(0, 3).map(x => x.P3)));
  t('construction : point de rosée de chaque heure (API ou dewMagnus), une seule formule', hs.slice(i, i + 6).every(x => Number.isFinite(x.Td)), JSON.stringify(hs.slice(i, i + 3).map(x => x.Td)));
  // Poste Météo : niveau de chaque heure lue SEULE (frostHour([x], 0)) = niveau calculé avec ses heures voisines (frostHour(hs, k)).
  const same = hs.slice(i, i + 12).every((x, k) => { const a = X.frostHour([x], 0), b = X.frostHour(hs, i + k); return a && b && a.level === b.level && a.humid === b.humid; });
  t('poste Météo : une heure lue seule (P3 attaché) donne le même niveau et la même humidité que dans sa série', same, 'divergence entre frostHour([x],0) et frostHour(hs,i)');
  const desk = X.wxDesk({ now: hs[i].t, hours: hs.slice(Math.max(0, i - 4)), cur: { T: hs[i].T, Tapp: hs[i].T } }), ice = desk.phen.find(p => p.id === 'ice');
  const win = hs.slice(i, i + 12).map((x, k) => X.frostHour(hs, i + k)).filter(Boolean), top = Math.max(...win.map(h => h.level));
  t(`poste Météo : bandeau « gel » au niveau de la règle (${top})`, ice.lv >= top, JSON.stringify({ lv: ice.lv, line: ice.line }));
  // « Verglas » seulement si une heure de la fenêtre porte un verglas calculé (iceRisk) : sinon l'humidité est nommée.
  const icy = hs.slice(i, i + 12).some(x => x.ice && x.ice.level >= 1);
  t('poste Météo : l’humidité est nommée dans le libellé du gel, « verglas » seulement si un verglas est calculé', icy ? /verglas/i.test(ice.line) : /chaussée humide|chaussée sèche|humidité inconnue/.test(ice.line), JSON.stringify({ icy, line: ice.line }));
  // Trajet : séquence sur deux modèles (deux points) ; frostRisk de la fenêtre = pire heure, humidité de la même heure.
  const seq = X.legSeq([ma, mb], [{ f: 0, km: 0, name: 'Lieu A' }, { f: 1, km: 18, name: 'Lieu B' }], '2026-11-16T05:00', 60);
  const fr = X.frostRisk(X.summarize(seq)), worst = Math.max(...seq.map(q => X.frostHour(q.hs, q.i).level));
  t(`trajet : deux points de deux modèles, niveau de la fenêtre = pire heure (${worst})`, seq.length === 2 && fr.level === worst, JSON.stringify({ n: seq.length, fr: { key: fr.key, level: fr.level, humid: fr.humid } }));
  t('trajet : la pluie de 05:00 au Lieu A rend CETTE heure humide (cumul de la même série)', X.frostHumid(ma.hs, ma.nowI) === true && X.frostHumid(mb.hs, mb.nowI) === false, JSON.stringify({ a: X.frostHumid(ma.hs, ma.nowI), b: X.frostHumid(mb.hs, mb.nowI) }));
  // Recalage par une station proche (applyObs) : air et point de rosée recalés, chaussée réestimée ; P3 conservé et complet.
  const before = { T: ma.hs[i].T, Tr: ma.hs[i].Tr, P3: JSON.stringify(ma.hs[i].P3) };
  const obs = X.applyObs(ma, { st: { id: 'st', name: 'Station fictive', lat: 48.851, lon: 2.351, last: { t: new Date(T0).toISOString(), T: before.T - 2, Td: ma.hs[i].Td - 1 } } }, 35);
  t('recalage : station appliquée, air et chaussée recalés', !!obs && ma.hs[i].T !== before.T && ma.hs[i].Tr !== before.Tr, JSON.stringify({ obs: !!obs, before, after: { T: ma.hs[i].T, Tr: ma.hs[i].Tr } }));
  t('recalage : cumul de pluie P3 inchangé et complet (la pluie n’est pas recalée)', JSON.stringify(ma.hs[i].P3) === before.P3 && ma.hs[i].P3.complete, JSON.stringify(ma.hs[i].P3));
  const fh = X.frostHour(ma.hs, i);
  t('recalage : la règle lit la chaussée recalée de la même heure', !!fh && fh.ref === ma.hs[i].Tr, JSON.stringify(fh));
  // Ensemble : statistiques de probabilité séparées (pRoad0, pIce…), jamais converties en niveau de gel par frostHour.
  const st = X.ensembleStats(X.makeDemoEnsemble(X.makeDemoPayload('froid', LA, 'Europe/Paris', 0)), ma);
  t('ensemble : statistiques calculées sans passer par la règle de gel (aucun appel à frostHour/frostRisk)', !!st && !/frostHour|frostRisk/.test(SRC.engine.slice(SRC.engine.indexOf('function ensembleStats'), SRC.engine.indexOf('function ensembleStats') + 4000)), String(!!st));
  // Heure SANS P3, lue seule : cumul inconnu ⇒ humidité INCONNUE ; libellé explicite, jamais « verglas » comme une certitude.
  const lone = { ...ma.hs[i + 1] }; delete lone.P3; lone.P = 0; lone.Pl = 0; lone.Tr = 0.4; lone.ice = { level: 0, score: 0 }; lone.code = 0; lone.Td = -3;
  const fl = X.frostHour([lone], 0);
  t('heure sans P3 : humidité « inconnue » (jamais « sec »), niveau de la règle (DANGER sous 1 °C)', !!fl && fl.humid === null && fl.level === 3, JSON.stringify(fl));
  const d2 = X.wxDesk({ now: lone.t, hours: [lone, { ...lone, t: lone.t.slice(0, 11) + String(+lone.t.slice(11, 13) + 1).padStart(2, '0') + ':00' }], cur: { T: lone.T, Tapp: lone.T } }), ice2 = d2 && d2.phen.find(p => p.id === 'ice');
  t('heure sans P3 : le poste Météo affiche « humidité inconnue », pas « verglas »', !!ice2 && /humidité inconnue/.test(ice2.line) && !/verglas/i.test(ice2.line), JSON.stringify(ice2 && ice2.line));
  return ok;
}
const findings = [], X = load(); const ok = chain(X, findings);
console.log(`\n${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
if (findings.length) process.exit(1);
const MUT = [
  ['P3 non attaché par buildHours', 'engine', /  hs\.forEach\(\(x, i\) => \{ x\.P3 = precipWindow\(hs, i\); \}\);/, ''],
  ['P3 ignoré (heure seule)', 'engine', /const win = x\.P3 && typeof x\.P3 === 'object' \? x\.P3 : precipWindow\(hs, i\);/, 'const win = precipWindow(hs, i);'],
  ['heure seule sans P3 traitée comme sèche', 'engine', /return precipKnown && satKnown && depKnown \? false : null;/, 'return false;'],
  ['poste Météo : « verglas » sur humidité inconnue', 'wxdesk', /if \(!fh \|\| fh\.level !== lv\) return strong/, 'if (true) return strong'],
  ['poste Météo : règle propre', 'wxdesk', /typeof frostHour === 'function' \? frostHour\(\[x\], 0\) : null;\n    const frost/, "false ? 0 : null;\n    const frost"],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  const mutated = { ...SRC, [file]: SRC[file].replace(from, to) }; assert.notStrictEqual(mutated[file], SRC[file], 'mutation inapplicable : ' + name);
  const f = []; const log = console.log; console.log = () => {};
  try { chain(load(mutated), f); } catch (e) { f.push(e.message); } finally { console.log = log; }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
  if (process.env.WHY) console.log('   ↳ ' + name + ' : ' + f[0].slice(0, 130));
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
