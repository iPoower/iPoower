// Pression prédictive (28/11/2026) · module pur, données FICTIVES. Une seule loi (pressLoss d'engine.js) ; projection depuis
// la mesure réelle (pas la cible) ; simulation théorique dite comme telle ; fiabilité selon l'âge de la mesure ; un essieu non
// mesuré n'est jamais copié de l'autre ; 7 jours au plus froid de chaque jour ; contre-tests sur les régressions volontaires.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
function load(src = read('app/pressure-forecast.js')) {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(read('engine.js') + src + '\nthis.PF = PressureForecast; this.loss = pressLoss;', ctx);
  return ctx;
}
// 8 jours horaires fictifs à partir du 28/11 00:00 : 2 °C, sauf un creux à −5 °C le 30/11 à 06:00.
const H = Array.from({ length: 24 * 8 }, (_, k) => { const t = new Date(Date.parse('2026-11-28T00:00:00Z') + k * 3600e3).toISOString().slice(0, 13) + ':00';
  return { t, T: t === '2026-11-30T06:00' ? -5 : 2 }; });
const base = { pressText: '2,5', pchk: { date: '2026-11-28', T: 2, av: 2.52, ar: 2.52 }, hours: H, nowStr: '2026-11-28T09:15', nowT: 2, days: 7 };
function run(ctx) {
  const P = i => JSON.parse(JSON.stringify(ctx.PF.project({ pressLoss: ctx.loss, ...base, ...i })));
  let n = 0; const ok = (label, cond, d) => { assert(cond, label + ' · ' + String(JSON.stringify(d)).slice(0, 600)); n++; };
  const a = P({});
  ok('loi des gaz : 2,52 bar à 2 °C → 2,43 bar à −5 °C (pression absolue, Kelvin)', a.known && a.worst.av === 2.43 && a.worst.T === -5 && a.worst.t === '2026-11-30T06:00', a.worst);
  ok('trois pressions distinctes : cible 2,5, mesure 2,52 du 28/11 à 2 °C, base = mesure', a.target.av === 2.5 && a.measured.av === 2.52 && a.measured.T === 2 && a.base === 'mesure', a);
  ok('fiabilité bonne pour une mesure du jour', a.reliability.level === 'bonne', a.reliability);
  ok('7 jours au plus, à partir de l’heure actuelle, une ligne par jour au plus froid', a.days.length === 7 && a.days[0].date === '2026-11-28' && a.days[6].date === '2026-12-04' && a.series[0].t === '2026-11-28T09:00', a.days.map(d => d.date));
  ok('2,43 bar pour une cible 2,5 : 0,07 sous la cible, dans la précision du manomètre (🟢)', a.days.find(d => d.date === '2026-11-30').lv === 0, a.days);
  const y = P({ pchk: { ...base.pchk, av: 2.45, ar: 2.45 } });
  ok('2,45 mesurés → ≈ 2,36 à −5 °C : 🟡 (de 0,1 à 0,2 bar sous la cible) ; 2,45 à 2 °C reste 🟢', y.worst.av === 2.36 && y.days.find(d => d.date === '2026-11-30').lv === 1 && y.days[0].lv === 0, y.days);
  ok('au-delà de 3 jours : prévision marquée moins sûre', a.days.filter(d => d.far).length === 4 && !a.days[2].far, a.days.map(d => d.far));
  // projection depuis la mesure, jamais depuis la cible : 2,30 mesurés → 2,22 à −5 °C (et non 2,41)
  const low = P({ pchk: { date: '2026-11-28', T: 2, av: 2.3, ar: 2.5 } });
  ok('projection depuis la pression mesurée par essieu (AV 2,30 → ≈ 2,22 ; AR 2,50 → ≈ 2,41)', low.worst.av === 2.22 && low.worst.ar === 2.41 && low.worst.lv === 2, low.worst);
  ok('mesure déjà sous la cible : niveau propre à la mesure', low.measuredLv === 2, low.measuredLv);
  // fraîcheur
  ok('mesure de 12 jours : fiabilité moyenne', P({ pchk: { ...base.pchk, date: '2026-11-16' } }).reliability.level === 'moyenne');
  ok('mesure de 30 jours : fiabilité faible, perte naturelle signalée', (r => r.level === 'faible' && /perte naturelle/.test(r.why))(P({ pchk: { ...base.pchk, date: '2026-10-29' } }).reliability));
  // simulation théorique
  const sim = P({ pchk: { date: '', T: null }, nowT: 6 });
  ok('aucune mesure : simulation théorique depuis la cible gonflée maintenant (6 °C)', sim.known && sim.base === 'simulation' && sim.reliability.level === 'théorique' && sim.T0 === 6 && sim.measured === null && sim.p0.av === 2.5, sim);
  const noT = P({ pchk: { date: '2026-11-28', T: null, av: 2.4, ar: 2.4 } });
  ok('mesure sans température : gardée comme « dernière mesure », projection théorique depuis la cible', noT.measured.av === 2.4 && noT.base === 'simulation' && /Température du contrôle/.test(noT.reliability.why), noT);
  // essieu non mesuré
  const av = P({ pchk: { date: '2026-11-28', T: 2, av: 2.52 } });
  ok('essieu arrière non mesuré : jamais copié de l’avant', av.measured.ar === null && av.worst.ar === null && av.worst.av === 2.43, av.worst);
  // cibles par essieu
  ok('cible « 2,3 AV / 2,5 AR » lue par essieu', (t => t.av === 2.3 && t.ar === 2.5)(ctx.PF.targets('2,3 AV / 2,5 AR')));
  ok('cible absente et mesure sans température : aucune projection', !P({ pressText: '', pchk: { date: '2026-11-28', T: null, av: 2.4 } }).known);
  ok('mesure datée du futur ignorée', P({ pchk: { ...base.pchk, date: '2026-12-01' } }).measured === null);
  ok('valeur aberrante (8 bar) ignorée', P({ pchk: { ...base.pchk, av: 8, ar: null } }).measured === null);
  ok('pas de loi injectée : refus', !ctx.PF.project({ ...base }).known);
  return n;
}
const n = run(load());
// contre-tests : chaque régression volontaire doit être rejetée
const src = read('app/pressure-forecast.js');
const muts = [
  ['projection depuis la cible au lieu de la mesure', 'p0[k] = usable ? usable[k] : tgt[k]', 'p0[k] = tgt ? tgt[k] : usable[k]'],
  ['essieu manquant copié de l’autre', "raw[k] = fin(pc[k]) && pc[k] > 0 && pc[k] < 6 ? pc[k] : null", "raw[k] = fin(pc[k]) ? pc[k] : fin(pc.av) ? pc.av : null"],
  ['fiabilité ignorant l’âge', 'if (a <= 7) return', 'if (a <= 999) return'],
  ['seuil de précision supprimé', "p - tgt <= -0.1 ? 1 : 0", "0"],
];
for (const [label, a, b] of muts) {
  assert(src.includes(a), 'mutation introuvable : ' + label);
  let caught = false; try { run(load(src.replace(a, b))); } catch (e) { caught = true; }
  assert(caught, 'contre-test non détecté : ' + label);
}
console.log(`✅ ${n} contrôles · ${muts.length} contre-tests rejetés`);
