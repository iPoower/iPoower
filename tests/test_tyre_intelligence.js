'use strict';
// Données de véhicule fictives ; sources publiques pour les essais uniquement.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const ctx = { URL, TextEncoder, TextDecoder }; vm.createContext(ctx);
vm.runInContext(read('app/tyre-evidence.js') + read('app/tyre-intelligence.js') + ';this.TI=TyreIntelligence;this.catalog=TYRE_TEST_EVIDENCE;', ctx);
const { TI, catalog } = ctx, copy = v => JSON.parse(JSON.stringify(v));
const tire = (extra = {}) => ({ type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 ZR18 89Y XL', treadAv: 2.4, treadAr: 5.8, treadEst: 0,
  treads: [{ d: '2026-10-12', mm: 2.4, ax: 'av', pos: 'shoulders', km: null }, { d: '2026-10-12', mm: 3.6, ax: 'av', pos: 'centre', km: null }, { d: '2026-10-12', mm: 5.8, ax: 'ar', km: null }], ...extra });
const weather = (extra = {}) => ({ ageMin: 5, source: 'Prévision fictive', fetchedAt: '2026-10-18T07:55:00Z', samples: [{ t: '2026-10-18T10:00', T: 8, Tr: 10, P: 1, Pl: 1 }], ...extra });
const input = (t = tire(), w = weather()) => ({ today: '2026-10-18', car: { id: 'fixture-A', tire: t }, weather: w });
const analyse = (i, c = catalog) => copy(TI.analyse(copy(i), c));
let n = 0;
const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
check('catalogue V1 valide, immuable, trois modèles et trois protocoles sources', () => {
  assert(TI.validate(catalog)); assert(Object.isFrozen(catalog.tests[0].metrics[0])); assert.equal(catalog.models.length, 3); assert.equal(catalog.tests.length, 3);
  const t = catalog.tests[0]; assert.equal(t.source.organisation, 'Tyre Reviews'); assert.equal(t.metrics.find(x => x.id === 'wetBraking').value, 35.52);
  assert.equal(t.metrics.find(x => x.id === 'wetBraking').endKmh, 1); assert.equal(t.metrics.find(x => x.id === 'aquaLongitudinal').unit, 'km/h');
});
check('modèle exact, alias de graphie et annotation AV/AR ; aucune confusion PS4/PS5/SUV', () => {
  for (const model of ['Pilot Sport 4S', 'Pilot Sport 4 S', 'Pilot Sport 4S (AV + AR)']) assert.equal(analyse(input(tire({ model }))).tests.length, 1);
  for (const model of ['Pilot Sport 4', 'Pilot Sport 5', 'Pilot Sport 5 S', 'Pilot Sport 4 SUV', 'Pilot Sport (4S)', 'Pilot Sport 4S MO']) assert.equal(analyse(input(tire({ model }))).tests.length, 0, model);
  assert.equal(analyse(input(tire({ brand: 'Autre' }))).tests.length, 0);
});
check('Rovelo RPX988 reconnu mais absence de source primaire ne produit aucune mauvaise note', () => {
  const r = analyse(input(tire({ brand: 'Rovelo', model: 'RPX988', size: '225/45 ZR17 94Y XL' })));
  assert.equal(r.model.id, 'rovelo-rpx988'); assert.equal(r.tests.length, 0); assert.equal(r.quality, 'indisponible'); assert(r.rules.some(x => /Données d’essais insuffisantes/.test(x.text))); assert(!('score' in r));
  assert.equal(analyse(input(tire({ brand: 'Rovelo', model: 'RPX998' }))).model, null);
});
check('dimension différente et indices inconnus explicités, jamais une preuve exacte', () => {
  const c = analyse(input()).tests[0].comparison; assert.equal(c.kind, 'same-model'); assert.equal(c.quality, 'faible'); assert(c.reasons.some(x => /Dimension différente/.test(x)));
  const r = analyse(input(tire({ size: '225/40 R18' }))); assert.equal(r.tests[0].comparison.kind, 'indirect');
});
check('identité de dimension et variante exigée ; qualité élevée seulement avec conditions documentées', () => {
  const c = copy(catalog), t = c.tests[0]; Object.assign(t, { variant: 'standard', vehicle: 'Voiture fictive', tyreState: 'new', airC: 20, roadC: 22 });
  const i = input(tire({ size: '225/40 R18 92Y XL', variant: 'standard' })); assert.equal(analyse(i, c).quality, 'élevée');
  i.car.tire.variant = 'autre'; assert.equal(analyse(i, c).tests[0].comparison.kind, 'indirect');
  i.car.tire.variant = 'standard'; i.car.tire.size = '225/40 R18 94Y XL'; assert.equal(analyse(i, c).tests[0].comparison.kind, 'indirect');
});
check('relevés asymétriques et positions individuelles conservés sans mutation ni moyenne', () => {
  const i = input(), original = JSON.stringify(i), r = analyse(i);
  assert.equal(JSON.stringify(i), original); assert.equal(r.facts.min, 2.4); assert.equal(r.facts.history.length, 3);
  assert.deepEqual(r.facts.history.filter(x => x.axle === 'av').map(x => [x.position, x.mm]), [['shoulders', 2.4], ['centre', 3.6]]);
  assert.equal(r.facts.current.find(x => x.axle === 'ar').mm, 5.8); assert.match(r.facts.coverage, /aucune couverture/);
  assert.equal(analyse(input(tire({ treadAv: null }))).facts.current.some(x => x.axle === 'av'), false);
});
check('ancien scalaire lu une seule fois, portée et date inconnues ; aucune migration destructive', () => {
  const r = analyse(input({ type: 'summer', tread: 4.2 })); assert.equal(r.facts.current.length, 1); assert.equal(r.facts.current[0].axle, 'unknown'); assert.equal(r.facts.current[0].date, null);
});
check('anciennes profondeurs en chaînes : lecture numérique stricte, octets d’origine conservés', () => {
  const t = tire({ treadAv: '2,4', treadAr: '5.8', treads: [{ d: '2026-10-12', mm: '2.4', ax: 'av', km: null }] }), before = JSON.stringify(t);
  const r = analyse(input(t)); assert.equal(r.facts.min, 2.4); assert.equal(r.facts.history[0].mm, 2.4); assert.equal(JSON.stringify(t), before);
  assert.equal(analyse(input(tire({ treadAv: '2.4mm', treadAr: null, tread: null }))).facts.min, null);
});
check('le train prévu ne fournit aucune capacité à la monte active', () => {
  const i = input(); i.car.plan = { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '215/40 R18 89V XL' };
  const r = analyse(i); assert.equal(r.model.id, 'michelin-ps4s'); assert.equal(r.planned.status, 'planned'); assert.equal(r.planned.tests.length, 2);
  i.car.tire.type = 'none'; const waiting = analyse(i); assert.equal(waiting.active, false); assert.equal(waiting.tests.length, 0); assert(!waiting.rules.some(x => x.id === 'rain-context'));
});
check('pluie, froid et faible profondeur expliqués sans distance ni pourcentage d’adhérence', () => {
  const r = analyse(input()); assert(r.rules.some(x => x.id === 'rain-context')); assert(r.rules.some(x => x.id === 'wet-shallow-tread'));
  for (const rule of r.rules) { assert(rule.id); assert(rule.state); assert(rule.triggers); assert(Array.isArray(rule.sources)); assert.equal(rule.date, '2026-10-18'); assert(Array.isArray(rule.uncertainties)); }
  for (const key of ['mu', 'brakingNow', 'riskPercent', 'score']) assert(!Object.hasOwn(r, key));
  assert.equal(r.weather.roadState, 'unknown');
  const cold = analyse(input(tire(), weather({ samples: [{ t: '2026-10-18T10:00', T: -1, Tr: 2 }] })));
  assert(cold.rules.some(x => x.id === 'cold-context')); assert.equal(cold.weather.roadState, 'unknown');
});
check('7 °C ne crée aucune frontière de verdict ou de perte d’adhérence', () => {
  const ids = T => analyse(input(tire(), weather({ samples: [{ t: '2026-10-18T10:00', T, Tr: T }] }))).rules.map(x => x.id);
  assert.deepEqual(ids(6.9), ids(7.1));
});
check('météo absente, périmée, âge négatif ou inconnu : aucun contexte actuel affirmé', () => {
  for (const w of [{}, weather({ samples: [] }), weather({ ageMin: 61 }), weather({ ageMin: null }), weather({ ageMin: -5 })]) {
    const r = analyse(input(tire(), w)); assert(r.rules.some(x => x.id === 'weather-missing')); assert(!r.rules.some(x => x.id === 'rain-context'));
  }
});
check('la profondeur mesurée il y a longtemps ne devient pas une observation actuelle', () => {
  const t = tire({ treads: [{ d: '2025-01-01', mm: 2.4, ax: 'av', km: null }] });
  const r = analyse(input(t)); assert(r.rules.some(x => x.id === 'depth-age')); assert(r.facts.current.find(x => x.axle === 'av').ageDays > 180);
});
check('une date de contrôle seule ne prouve pas une pression mesurée ; valeurs périmées identifiées', () => {
  assert(analyse(input(tire({ pchk: { date: '2026-10-17', T: 20 } }))).rules.some(x => x.id === 'pressure-check'));
  assert(!analyse(input(tire({ pchk: { date: '2026-10-17', T: 20, av: 2.3, ar: 2.4 } }))).rules.some(x => x.id === 'pressure-check'));
  assert(analyse(input(tire({ pchk: { date: '2026-01-01', T: 20, av: 2.3, ar: 2.4 } }))).rules.some(x => x.id === 'pressure-check'));
});
check('risque documenté limité à une sculpture effectivement mesurée, jamais à une estimation utilisateur', () => {
  assert.equal(analyse(input(tire({ treadAv: 1.2 }))).status, 'Risque documenté');
  assert.notEqual(analyse(input(tire({ treadAv: 1.2, treadEst: 1 }))).status, 'Risque documenté');
});
check('synthèse V1.1 : preuve indirecte, mesures datées et absence d’alerte sans faux feu vert', () => {
  const dry = weather({ samples: [{ t: '2026-10-18T10:00', T: 17, Tr: 18, P: 0, Pl: 0 }] });
  const r = analyse(input(tire({ pchk: { date: '2026-10-17', av: 2.3, ar: 2.4 } }), dry));
  assert.equal(r.overview.evidence, 'Essais du même modèle, non directement transposables');
  assert.equal(r.overview.measurements, 'Aucune lacune détectée');
  assert.equal(r.overview.safety, 'Aucune alerte déclenchée');
  assert.equal(r.status, 'Information');
  assert.equal(r.quality, 'faible');
});
check('synthèse V1.1 : Rovelo sans essai, dates inconnues et pression non mesurée restent séparés', () => {
  const t = tire({ brand: 'Rovelo', model: 'RPX988', size: '225/45 R17 94W', treadAv: 4.6, treadAr: 6.5,
    treads: [], pchk: { date: '2026-10-18' } });
  const before = JSON.stringify(t), r = analyse(input(t, weather({ samples: [{ t: '2026-10-18T10:00', T: 15, P: 0 }] })));
  assert.equal(JSON.stringify(t), before);
  assert.equal(r.quality, 'indisponible'); assert.equal(r.overview.evidence, 'Essais indisponibles');
  assert.equal(r.status, 'Analyse limitée');
  assert.equal(r.overview.safety, 'Aucune alerte déclenchée');
  assert.deepEqual(r.overview.measurementRuleIds.sort(), ['depth-age', 'pressure-check']);
  assert(r.facts.current.every(x => x.date === null));
  assert.equal(r.pressure.date, '2026-10-18'); assert.equal(r.pressure.av, null); assert.equal(r.pressure.ar, null);
});
check('synthèse V1.1 : risque mesuré prioritaire et météo absente jamais rassurante', () => {
  const dry = weather({ samples: [{ t: '2026-10-18T10:00', T: 15, P: 0 }] });
  const critical = analyse(input(tire({ treadAv: 1.2, treads: [] }), dry));
  assert.equal(critical.overview.safety, 'Risque documenté'); assert.equal(critical.status, 'Risque documenté');
  assert(critical.overview.measurementRuleIds.includes('depth-age'));
  const stale = analyse(input(tire(), weather({ samples: [], ageMin: 75 })));
  assert.equal(stale.overview.safety, 'Évaluation limitée'); assert.equal(stale.status, 'Analyse limitée');
  assert.equal(stale.overview.weather, 'Contexte à vérifier');
  const unknown = analyse(input(tire({ treadAv: null, treadAr: null, tread: null, treads: [] }), dry));
  assert(unknown.overview.measurementRuleIds.includes('depth-missing'));
  assert(!unknown.rules.some(x => x.id === 'critical-depth'));
});
check('protocoles ADAC asphalt/béton et Tyre Reviews distincts ; aucun classement global', () => {
  const r = analyse(input(tire({ type: 'winter', brand: 'Goodyear', model: 'UltraGrip Performance 3' })));
  const wet = r.facets.find(x => x.id === 'wetBraking'); assert.equal(wet.results.length, 3); assert.equal(new Set(wet.results.map(x => x.metric.protocol)).size, 3);
  assert.equal(r.conflicts.length, 0); assert.equal(r.facets.find(x => x.id === 'cold').results.length, 0);
});
check('contradiction pour un même essai/protocole : tous les résultats conservés et conclusion suspendue', () => {
  const c = copy(catalog), t = copy(c.tests[0]); t.id += '-contradiction'; t.metrics[0].value += 2; c.tests.push(t);
  const r = analyse(input(), c); assert.equal(r.quality, 'faible'); assert(r.conflicts.length); assert(r.rules.some(x => x.id === 'source-conflict')); assert.equal(r.tests.length, 2);
});
check('des températures ou surfaces différentes restent des contextes distincts, pas une contradiction artificielle', () => {
  const c = copy(catalog), t = copy(c.tests[0]); t.id += '-other-conditions'; t.airC = 5; t.metrics[0].value += 2; c.tests.push(t);
  const r = analyse(input(), c); assert.equal(r.conflicts.length, 0); assert.equal(r.tests.length, 2);
});
check('catalogue invalide refusé : versions, unités, classements, URLs, dates et champs inconnus', () => {
  for (const mutate of [c => c.schemaVersion = 2, c => c.unexpected = 1, c => c.tests[0].source.url = 'javascript:alert(1)',
    c => c.tests[0].source.url = 'https://www.adac.de.attacker.invalid/a', c => c.tests[0].source.checkedOn = '2026-02-30',
    c => c.tests[0].metrics[0].rank = 99, c => c.tests[0].metrics[0].unit = 'km', c => c.tests[0].metrics[0].value = -1,
    c => c.tests[0].metrics[0].endKmh = 110, c => c.tests.push(copy(c.tests[0]))]) { const c = copy(catalog); mutate(c); assert(!TI.validate(c)); assert.equal(analyse(input(), c).tests.length, 0); }
});
check('source et valeur restent null si non documentées ; aucun appel réseau dans le domaine', () => {
  assert.equal(catalog.tests.find(x => x.source.organisation === 'ADAC').metrics[0].rank, null);
  const src = read('app/tyre-intelligence.js') + read('app/tyre-evidence.js'); assert(!/\b(?:fetch|XMLHttpRequest|localStorage|Date\.now)\s*\(/.test(src));
});
check('le contexte pluie sélectionne les trois disciplines du modèle exact et leurs protocoles', () => {
  const r = analyse(input());
  for (const id of ['wetBraking', 'aquaLongitudinal', 'aquaLateral']) {
    const rule = r.rules.find(x => x.id === 'rain-evidence-' + id); assert(rule); assert(rule.triggers.evidence.length); assert(rule.sources.every(x => x.kind === 'published'));
  }
  const noRain = analyse(input(tire(), weather({ samples: [{ t: '2026-10-18T10:00', T: 15, Pl: 0 }] })));
  assert(!noRain.rules.some(x => x.id.startsWith('rain-evidence-')));
  const empty = analyse(input(tire({ brand: 'Rovelo', model: 'RPX988' }))); assert(empty.rules.some(x => x.id === 'rain-evidence-gap'));
});
check('un contrôle sous la cible déclenche une vigilance, zéro bar un risque daté documenté', () => {
  const t = tire({ press: '2,3 AV / 2,4 AR', pchk: { date: '2026-10-17', T: 18, av: 2.1, ar: 2.4 } });
  assert(analyse(input(t)).rules.some(x => x.id === 'pressure-target-gap'));
  t.pchk.av = 0; assert(analyse(input(t)).rules.some(x => x.id === 'zero-pressure'));
  t.pchk.date = '2025-01-01'; assert(!analyse(input(t)).rules.some(x => x.id === 'zero-pressure'));
});
check('points du trajet : fraîcheur de chaque fournisseur, pas celle du seul lieu consulté', () => {
  vm.runInContext(read('app/tyre-intelligence-view.js') + ';this.gather=tyreIntelligenceInput;', ctx);
  const now = Date.parse('2026-10-18T08:00Z'), hs = [{ t: '2026-10-18T10:00', T: 10, Pl: 1 }], hsMid = [{ t: '2026-10-18T11:00', T: 12, Pl: 0 }];
  Object.assign(ctx, { CX: { m: { tz: 'Europe/Paris', hs, nowI: 0 } }, M: { test: { hs } }, RAW: { test: { t: now - 5 * 60000 } }, UI: { loc: 'test' }, MIDM: { middle: { hs: hsMid } }, MIDP: { middle: { t: now - 90 * 60000 } }, CALM: {}, LEGM: {},
    nowIn: () => '2026-10-18T10:00', Reliability: { ageMin: t => (now - t) / 60000 }, DEMO: { on: false }, offlineNow: () => false });
  const i = ctx.gather({ tire: tire() }, { points: [{ t: hs[0].t, x: hs[0], hs }, { t: hsMid[0].t, x: hsMid[0], hs: hsMid }] });
  assert.equal(i.weather.ageMin, 90); assert.equal(i.weather.samples.length, 2); assert(!TI.analyse(i).weather.fresh);
  ctx.MIDP.middle.t = now - 10 * 60000; assert.equal(ctx.gather({ tire: tire() }, { points: [{ t: hs[0].t, x: hs[0], hs }, { t: hsMid[0].t, x: hsMid[0], hs: hsMid }] }).weather.ageMin, 10);
});
// Contrat de persistance : le même export natif garde les champs optionnels, sans changer la version de sauvegarde.
vm.runInContext(['journal-archive.js', 'debrief.js', 'calendar-origin.js', 'backup.js', 'config-import.js'].map(read).join('\n') + ';this.CI=ConfigImport;this.B=Backup;', ctx);
check('sauvegarde historique acceptée, extensions strictes et aller-retour JSON sans perte des points', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/preset.fake.json'), 'utf8'));
  assert(ctx.CI.validate(cfg)); cfg.cars[0].tire = tire({ pchk: { date: '2026-10-12', T: 18, av: 2.3, ar: 2.4 } }); assert(ctx.CI.validate(cfg));
  const b = ctx.B.make({ settings: cfg, at: '2026-10-18T08:00:00Z' }), plan = ctx.B.restorePlan(copy(b));
  assert(plan); assert(ctx.CI.validateTyreExtensions(b.settings)); assert.deepEqual(JSON.parse(plan.writes['twrc.settings.v1']).cars[0].tire, cfg.cars[0].tire);
  for (const mutate of [t => t.treads[0].pos = 'invented', t => t.treads[0].wheel = 'rear-left', t => t.pchk.av = 50, t => t.treads[0].mm = '2.4', t => t.treads[0].unknown = 1]) { const bad = copy(cfg); mutate(bad.cars[0].tire); assert(!ctx.CI.validate(bad)); assert(!ctx.CI.validateTyreExtensions(bad)); }
  const legacy = { cars: [{ tire: { tread: '4.2', treads: [{ d: '2020-01-01', mm: '4.2', km: '12000' }], previousField: 'conservé' } }] };
  assert(ctx.CI.validateTyreExtensions(legacy)); assert.equal(legacy.cars[0].tire.tread, '4.2');
});
console.log(`${n}/${n} scénarios OK`);
require('./test_engineering_cockpit');
