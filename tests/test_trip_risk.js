'use strict';
// Lot V · risque global d'un trajet (tripRisk) : UNE synthèse pour la même fenêtre, lue par toutes les surfaces ; l'indice pneus
// reste à part. Règle du gel = option A (frostRisk / frostBand), seuils INCHANGÉS. Contrôles de câblage des surfaces et des
// statuts d'alerte, puis contre-tests par mutation. Données fictives.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SRC = { engine: src('engine.js'), app: src('app.js'), garageView: src('app/garage-view.js'), mission: src('app/mission-control.js'), scene: src('app/garage-scene.js'), garage: src('garage.js'), wx: src('app/weather-view.js') };
const grab = (s, re) => (re.exec(s) || [''])[0];
function load(S = SRC) {
  const ctx = { Math, JSON, Date, Intl, Map, Set, Number, String, Array, Object, RegExp, console }; vm.createContext(ctx);
  vm.runInContext(S.engine + '\nconst carProfile = c => ({ generic: !!(c && c.generic) });\nconst esc = s => String(s);\n' +
    grab(S.app, /^function frostBand\(x\) \{[\s\S]*?\n\}/m) + '\n' + grab(S.app, /^function tripRisk\(t\) \{[\s\S]*?\n\}/m) + '\n' +
    grab(S.app, /^const tripRiskLv = [^\n]*/m) + '\nthis.X = { tripRisk: typeof tripRisk === "function" ? tripRisk : null, frostRisk, LV };', ctx);
  return ctx.X;
}
const car = (short, generic = false) => ({ short, generic, tire: { type: 'winter' } });
const sum = (TrMin, humid, extra = {}) => ({ Tmin: TrMin + 0.5, TrMin, humid, iceLevel: 0, visMin: 20000, ...extra });
const trip = (s, levels, generic = false) => ({ sum: s, res: levels.map((l, k) => ({ c: car('Test ' + 'AB'[k], generic), w: { level: l, worst: { parts: [{ label: 'pénalité fictive', v: 30 }] } } })), worst: Math.max(...levels) });
function scenarios(X, collect) {
  let ok = 0; const t = (name, cond, detail) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name + ' · ' + detail); console.log('❌ ' + name + ' · ' + detail); } };
  t('tripRisk existe (synthèse unique du risque global)', typeof X.tripRisk === 'function', 'absente');
  if (typeof X.tripRisk !== 'function') return ok;
  const a = X.tripRisk(trip(sum(1.0, true), [0]));
  t('chaussée 1,0 °C humide, indice pneus RAS ⇒ risque global DANGER (gel), indice pneus conservé à part', a.lv === 3 && a.k === 'frost' && a.tyreLv === 0 && /chaussée 1,0 °C/.test(a.why), JSON.stringify(a));
  const b = X.tripRisk(trip(sum(1.5, false), [2]));
  t('indice pneus PRUDENCE et gel VIGILANCE ⇒ PRUDENCE (pire cause, pas la première), gel listé', b.lv === 2 && b.k === 'tyre' && b.causes.some(c => c.k === 'frost' && c.lv === 1), JSON.stringify(b));
  const c = X.tripRisk(trip(sum(6, false, { iceLevel: 2 }), [1]));
  t('verglas élevé ⇒ DANGER', c.lv === 3 && c.k === 'ice', JSON.stringify(c));
  const d = X.tripRisk(trip(sum(6, false, { visMin: 150 }), [0])), e = X.tripRisk(trip(sum(6, false, { visMin: 600 }), [0]));
  t('brouillard < 200 m ⇒ DANGER ; < 1 000 m ⇒ PRUDENCE', d.lv === 3 && e.lv === 2, JSON.stringify([d.lv, e.lv]));
  const g = X.tripRisk(trip(sum(6, false), [3], true));
  t('aperçu générique : l’indice pneus d’exemple n’entre pas dans le risque global, aperçu signalé', g.lv === 0 && g.tyreGeneric === true, JSON.stringify(g));
  const z = X.tripRisk(trip(sum(8, false), [0]));
  t('aucune cause ⇒ RAS, aucune raison inventée', z.lv === 0 && z.why === null && z.causes.length === 0, JSON.stringify(z));
  t('trajet non analysé ⇒ null (jamais un RAS par défaut)', X.tripRisk({ sum: null, res: null }) === null && X.tripRisk(null) === null, 'non null');
  // Balayage −3 à 4 °C × trois humidités × indices pneus 0 à 3 : global = max(gel option A, indice pneus), jamais en dessous.
  const bad = [];
  for (let k = -30; k <= 40; k += 5) for (const h of [true, false, null]) for (let tl = 0; tl <= 3; tl++) {
    const s = sum(k / 10, h), r = X.tripRisk(trip(s, [tl])), fr = X.frostRisk(s).level || 0;
    if (r.lv !== Math.max(fr, tl)) bad.push(`${k / 10} °C ${h} pneus ${tl} → ${r.lv} (gel ${fr})`);
  }
  t('balayage 15 × 3 × 4 cas : risque global = pire du gel (seuils option A inchangés) et de l’indice pneus', !bad.length, bad.slice(0, 4).join(' | '));
  return ok;
}
// Câblage : chaque surface qui présente le risque du trajet lit tripRisk ; l'indice pneus est nommé ; statuts d'alerte honnêtes.
function wiring(S, collect) {
  let ok = 0; const t = (name, cond) => { if (cond) { ok++; console.log('✅ ' + name); } else { collect.push(name); console.log('❌ ' + name); } };
  const f = name => grab(S.app, new RegExp('^function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}', 'm'));
  const brf = f('renderBrfCore'), card = f('briefCard'), core = f('renderDecisionCore'), brief = f('renderBrief');
  t('Prochain risque : riskOf = tripRisk', /const riskOf = t => \{ const r = tripRisk\(t\);/.test(brf));
  t('briefing : couleur = risque global (tripRiskLv), trajet le plus risqué au risque global', /el\.className = 'mod brf lv' \+ \(main\.res \? tripRiskLv\(main\)/.test(brf) && /const crit = rest\.filter\(t => gl\(t\) != null/.test(brf));
  t('briefing : ligne « Risque global du trajet » et indice pneus nommé', /tripRiskHtml\(tripRisk\(t\), 'brf-global'\)/.test(card) && /Indice pneus · \$\{esc\(top\.c\.short\)\}/.test(card));
  t('synthèse : verdict du trajet = risque global, indice pneus nommé', /const tr = trip && !tripGeneric \? tripRisk\(trip\) : null;/.test(core) && /' · risque global du trajet<\/b>'/.test(core) && /' · indice pneus '/.test(core));
  t('onglet Trajet : risque global des voitures du trajet + indice pneus de la voiture affichée', /const gRisk = gRes\.length \? tripRisk\(/.test(brief) && /tripRiskHtml\(gRisk, 'brief-global'\)/.test(brief) && /Indice pneus · \$\{esc\(car\.short\)\}/.test(brief));
  t('agenda : pastilles, résumé du jour et trajet critique au risque global', /const rg = tripRisk\(r\);/.test(S.app) && /const G = o => tripRiskLv\(o\.r\) \|\| 0/.test(S.app) && /const G = x => tripRiskLv\(x\.r\) \|\| 0;/.test(S.app));
  t('Garage : risque global transmis, gel par point via la règle unique (frostHour)', /risk: trip \? tripRisk\(trip\) : null/.test(S.garageView) && /frostFor: q => q && q\.hs \? frostHour\(q\.hs, q\.i\) : null/.test(S.garageView) && /mission-global/.test(S.mission) && /gel possible/.test(S.mission) && /frostFor/.test(S.garage));
  t('Garage : « voiture active » seulement pour une voiture confirmée', /active\.active \? ' · voiture active' : ' · affichée, non confirmée pour le trajet'/.test(S.scene));
  t('alertes : non évaluable / évaluée en partie / non applicable, jamais RAS par défaut', /function alertNoTrigger\(id\)/.test(S.app) && /if \(id === 'tread'\) return miss\(c => treadWorst\(c\.tire\)\.mm != null/.test(S.app) && /if \(id === 'treadgap'\) return miss\(c => !!treadWheels\(/.test(S.app) && /if \(id === 'press'\)/.test(S.app) && /alertNoTrigger\(d\.id\) \? alertNoTrigger\(d\.id\)\.label : 'RAS'/.test(S.app));
  t('fenêtres traversant minuit : jour nommé (synthèse et poste Météo)', /'demain '/.test(core) && (S.wx.match(/d\.window\.toLabel \|\| d\.window\.to\)/g) || []).length === 2);
  t('option A intacte : frostBand lit frostRisk, aucun seuil propre', /const fr = x && typeof x === 'object' \? frostRisk\(x\)/.test(S.app) && /const FROST_ROAD_MAX = 1, FROST_ROAD_MARGIN = 2;/.test(S.engine));
  return ok;
}
const findings = [];
let ok = scenarios(load(), findings); ok += wiring(SRC, findings);
console.log(`\n${ok} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
if (findings.length) process.exit(1);
const MUT = [
  ['gel ignoré dans le risque global', 'app', /if \(fb && fb\.lv >= 1\) c\.push\(\{ k: 'frost'/, "if (false) c.push({ k: 'frost'"],
  ['première cause au lieu de la pire', 'app', /const worst = c\.reduce\(\(a, x\) => !a \|\| x\.lv > a\.lv \? x : a, null\);/, 'const worst = c[0] || null;'],
  ['aperçu générique compté comme indice réel', 'app', /if \(tyreLv >= 1 && top && !carProfile\(top\.c\)\.generic\)/, 'if (tyreLv >= 1 && top)'],
  ['synthèse revenue à l’indice pneus', 'app', /const tr = trip && !tripGeneric \? tripRisk\(trip\) : null;/, 'const tr = trip && !tripGeneric ? { lv: trip.worst, why: null } : null;'],
  ['briefing coloré par l’indice pneus', 'app', /el\.className = 'mod brf lv' \+ \(main\.res \? tripRiskLv\(main\) \|\| 0 : 0\);/, "el.className = 'mod brf lv' + (main.res ? main.res[0].w.level : 0);"],
  ['briefing sans ligne de risque global', 'app', /\$\{tripRiskHtml\(tripRisk\(t\), 'brf-global'\)\}/, ''],
  ['Trajet sans risque global', 'app', /\$\{tripRiskHtml\(gRisk, 'brief-global'\)\}/, ''],
  ['Garage : « voiture active » inconditionnel', 'scene', /active\.active \? ' · voiture active' : ' · affichée, non confirmée pour le trajet'/, "' · voiture active'"],
  ['Garage : gel non transmis', 'garageView', /, frostFor: q => q && q\.hs \? frostHour\(q\.hs, q\.i\) : null/, ''],
  ['alertes : retour du RAS par défaut', 'app', /alertNoTrigger\(d\.id\) \? alertNoTrigger\(d\.id\)\.label : 'RAS'/, "'RAS'"],
  ['alerte profondeur jugée évaluable sans mesure', 'app', /if \(id === 'tread'\) return miss\(c => treadWorst\(c\.tire\)\.mm != null/, "if (id === 'tread') return miss(c => true"],
  ['minuit : jour omis', 'wx', /d\.window\.toLabel \|\| d\.window\.to\)\}<\/p>/, 'd.window.to)}</p>'],
];
let killed = 0;
for (const [name, file, from, to] of MUT) {
  const mutated = { ...SRC, [file]: SRC[file].replace(from, to) }; assert.notStrictEqual(mutated[file], SRC[file], 'mutation inapplicable : ' + name);
  const f = []; const log = console.log; console.log = () => {};
  try { scenarios(load(mutated), f); wiring(mutated, f); } catch (e) { f.push(e.message); } finally { console.log = log; }
  assert(f.length > 0, 'contre-test non détecté : ' + name); killed++;
}
console.log(`✅ ${killed}/${MUT.length} mutations rejetées (contre-tests)`);
