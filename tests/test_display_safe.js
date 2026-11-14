'use strict';
// Mission « Cohérence gel et trajet », PR 3 (constat du 14/11/2026) : affichage et données sans risque. Données fictives.
// B1 monte hiver enregistrée ⇒ plus de « Prévu · NON MONTÉ » ; B2 relevés antérieurs au montage hors de la monte actuelle et de
// sa projection, CONSERVÉS ; B3 Garage : tous les points du trajet, chacun avec son rôle et son lieu ; B5 formats français,
// mots-clés d'agenda masqués à l'affichage seulement. Contre-tests : chaque correctif retiré doit être détecté.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SRC = { engine: read('engine.js'), ev: read('app/tyre-evidence.js'), ti: read('app/tyre-intelligence.js'), ts: read('tyrestate.js'), garage: read('garage.js'), app: read('app.js') };
const grab = (s, re) => (re.exec(s) || [''])[0];
function load(S = SRC) {
  const ctx = { URL, TextEncoder, TextDecoder, Number, Array, Object, String, Set, Map, JSON, Date, Math, Intl, RegExp }; vm.createContext(ctx);
  vm.runInContext(S.ev + S.ti + '\n' + S.ts + '\n' + S.garage + '\nconst DAYN = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."]; const pad = n => String(n).padStart(2, "0");\n' +
    grab(S.engine, /^function fmtDay\(d\) \{[^\n]*\}/m) + '\n' + grab(S.app, /^const CAL_TAG_RE = [^\n]*/m) + '\n' + grab(S.app, /^const calTitle = [^\n]*/m) + '\n' +
    grab(S.app, /^const decFr = [^\n]*/m) + '\n' + grab(S.app, /^function tsFr\(ts\) \{[\s\S]*?\n\}/m) +
    ';this.X = { TI: TyreIntelligence, treadHistory, tyreState: typeof tyreState === "function" ? tyreState : null, mountTreads: typeof mountTreads === "function" ? mountTreads : null, Garage, calTitle, decFr, tsFr };', ctx);
  return ctx.X;
}
const copy = v => JSON.parse(JSON.stringify(v));
const winterCar = () => ({ id: 'voitureB', short: 'Test B', plan: { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '225/45 R17 94W', date: '2026-11-13' },
  tire: { type: 'winter', brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '225/45 R17 94W', mounted: '2026-11-13', mountKm: 49100, treadAv: 7.8, treadAr: 7.8, tread: 7.8, treadEst: 0,
    treads: [{ d: '2026-06-01', mm: 6.4, km: 41000, ax: 'av' }, { d: '2026-09-20', mm: 5.1, km: 47000, ax: 'av' }, { d: '2026-11-13', mm: 7.8, km: 49100, ax: 'av' }, { d: '2026-11-13', mm: 7.8, km: 49100, ax: 'ar' }] },
  odo: [{ d: '2026-06-01', km: 41000 }, { d: '2026-11-13', km: 49100 }] });
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) ok++; else collect.push(name + ' · ' + String(detail).slice(0, 300)); };
  const car = winterCar(), before = JSON.stringify(car);
  const r = copy(X.TI.analyse(copy({ today: '2026-11-14', car, weather: { ageMin: 5, samples: [] } })));
  t('B1 · monte hiver enregistrée : aucun bloc « Prévu · NON MONTÉ »', r.planned === null, JSON.stringify(r.planned && r.planned.model));
  const summerPlan = winterCar(); Object.assign(summerPlan.tire, { type: 'summer', brand: 'Marque A', model: 'Modèle A', mounted: '2026-04-01' });
  const r2 = copy(X.TI.analyse(copy({ today: '2026-11-14', car: summerPlan, weather: { ageMin: 5, samples: [] } })));
  t('B1 · projet toujours en attente (pneus été montés) : le « Prévu » reste affiché', !!r2.planned, 'absent');
  t('B2 · relevés individuels de la monte actuelle seulement (2 sur 4), 2 antérieurs signalés', r.facts.history.length === 2 && r.facts.history.every(h => h.date >= '2026-11-13') && r.facts.beforeMount === 2, JSON.stringify(r.facts.history.map(h => h.date)) + ' · ' + r.facts.beforeMount);
  const h = X.treadHistory(car.tire);
  t('B2 · tendance d’usure de la monte : aucun relevé d’été (pas de pente 6,4 → 5,1 → 7,8)', h.rate == null && h.last && h.last.d === '2026-11-13', JSON.stringify(h));
  t('B2 · aucune suppression : les 4 relevés restent dans tire.treads, objet d’entrée intact', car.tire.treads.length === 4 && JSON.stringify(car) === before, car.tire.treads.length);
  // Tendance : deux relevés de la monte actuelle espacés de 1 200 km (7,8 → 7,6 mm) ⇒ 0,17 mm / 1 000 km ; avec les relevés d'été
  // (6,4 mm à 41 000 km), la pente première → dernière deviendrait « aucune usure » (6,4 → 7,6 mm).
  const worn = winterCar(); worn.tire.treads.push({ d: '2026-11-14', mm: 7.6, km: 50300, ax: 'av' }); worn.tire.treadAv = worn.tire.tread = 7.6;   // essieu avant le plus usé
  const hw = X.treadHistory(worn.tire);
  t('B2 · projection d’usure calculée sur la monte actuelle seulement (7,8 → 7,6 mm sur 1 200 km)', hw.rate != null && Math.abs(hw.rate - 0.2 / 1.2) < 0.01, JSON.stringify(hw.rate));
  const old = winterCar(); delete old.tire.mounted;
  t('B2 · sans date de montage : tous les relevés, comme avant', X.treadHistory(old.tire).last && X.mountTreads(old.tire).length === 4, 'filtré');
  // B3 : trajet court évalué aux deux extrémités (06:00 et 07:00 à A et B).
  const hs = [6, 7].map(h => ({ t: '2026-11-16T0' + h + ':00', T: 3, Tr: 2, P: 0, RH: 80, vis: 20000, gust: 10, code: 1 }));
  const trip = { from: 'Lieu A', to: 'Lieu B', dep: '2026-11-16T06:30', arr: '2026-11-16T07:10', seq: [{ hs, i: 0, loc: 'Lieu A' }, { hs, i: 0, loc: 'Lieu B' }, { hs, i: 1, loc: 'Lieu A' }, { hs, i: 1, loc: 'Lieu B' }] };
  const pv = copy(X.Garage.preview(trip, { now: Date.parse('2026-11-14T20:00:00Z') }));
  t('B3 · Garage : les 4 points affichés (le 3/4 manquait)', pv.samples.length === 4 && pv.count === 4 && pv.samples.map(s => s.index).join() === '1,2,3,4', JSON.stringify(pv.samples.map(s => s.index)));
  t('B3 · Garage : chaque point porte son lieu et son rôle, dans l’ordre du parcours', pv.samples.map(s => s.role + ':' + s.place + ':' + String(s.at).slice(11, 16)).join() === 'from:Lieu A:06:00,from:Lieu A:07:00,to:Lieu B:06:00,to:Lieu B:07:00', JSON.stringify(pv.samples.map(s => [s.role, s.place, s.at])));
  t('B3 · Garage : Lieu B à 06:00 = lecture de prudence, jamais « arrivée à 06:00 » ; Lieu A 06:00 et Lieu B 07:00 = vrais passages', pv.samples.map(s => s.prudence).join() === 'false,true,true,false', JSON.stringify(pv.samples.map(s => s.prudence)));
  // B5
  t('B5 · « #direct » masqué dans un titre, texte intact sinon', X.calTitle('Réunion #direct') === 'Réunion' && X.calTitle('#maison Dîner') === 'Dîner' && X.calTitle('Projet #directeur') === 'Projet #directeur' && X.calTitle('#trajet') === 'Rendez-vous', [X.calTitle('Réunion #direct'), X.calTitle('Projet #directeur')].join('|'));
  t('B5 · horodatage ISO en français (heure de Paris)', X.tsFr('2026-11-14T20:30') === 'sam. 14/11 · 20:30' && X.tsFr('2026-11-14T19:30:12Z') === 'sam. 14/11 · 20:30', X.tsFr('2026-11-14T19:30:12Z'));
  t('B5 · virgule décimale dans les facteurs du verglas', X.decFr('Précipitations (0.1 mm) sur chaussée estimée à 1.5 °C') === 'Précipitations (0,1 mm) sur chaussée estimée à 1,5 °C', X.decFr('0.1 mm'));
  return ok;
}
const findings = [], X = load(), ok = scenarios(X, findings);
console.log(`${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
const MUT = [
  ['B1 : projet affiché malgré la monte hiver', 'ti', "car.plan.on && t.type !== 'winter' ? model(c, car.plan)", 'car.plan.on ? model(c, car.plan)'],
  ['B2 : relevés antérieurs au montage affichés', 'ti', 'const history = all.filter(r => !since || !date(r.d) || r.d >= since)', 'const history = all.filter(r => true)'],
  ['B2 : tendance d’usure sur les relevés d’une autre monte', 'ts', 'const hist = mountTreads(t).filter(x => x && num(x.mm) != null && (!x.ax', 'const hist = ((t && t.treads) || []).filter(x => x && num(x.mm) != null && (!x.ax'],
  ['B3 : retour aux trois échantillons', 'garage', 'const indexes = rows.length <= 6 ? rows.map((_, i) => i) :', 'const indexes = false ? 0 :'],
  ['B3 : lecture de prudence non signalée', 'garage', "const prudence = !!hAt &&", 'const prudence = false &&'],
  ['B5 : mots-clés d’agenda affichés', 'app', "const calTitle = t => String(t || '').replace(CAL_TAG_RE, '$1')", "const calTitle = t => String(t || '')"],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  assert(SRC[file].includes(from), 'mutation inapplicable : ' + name);
  const f = []; try { scenarios(load({ ...SRC, [file]: SRC[file].replace(from, to) }), f); } catch (e) { f.push(e.message); }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
