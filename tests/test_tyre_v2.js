'use strict';
// Intelligence pneumatique V2 (17/11/2026) : les 10 scénarios du cahier des charges, les limites thermiques, l'indépendance
// vis-à-vis de l'indice de vitesse et l'isolation des véhicules. Voitures et lieux fictifs ; seuls les modèles de pneus
// (catalogue public) sont réels. Trois couches distinctes : risque routier (engine.js), simulateur Analyse (tyrelab.js),
// essais publiés (catalogue, affichage seulement).
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const ctx = { console, Math, Date, Intl, Map, Set, JSON, URL, TextEncoder, TextDecoder }; vm.createContext(ctx);
vm.runInContext(['engine.js', 'tirespecs.js', 'tyrestate.js', 'tyrelab.js', 'app/tyre-evidence.js', 'app/tyre-intelligence.js'].map(read).join('\n')
  + ';this.lab=tyreLab;this.TI=TyreIntelligence;this.catalog=TYRE_TEST_EVIDENCE;this.hourVerdict=hourVerdict;this.windowAssess=windowAssess;', ctx);
const plain = v => JSON.parse(JSON.stringify(v));
const H = (base = {}, n = 40) => Array.from({ length: n }, (_, k) => ({ t: new Date(Date.parse('2026-11-16T18:00:00Z') + k * 3600e3).toISOString().slice(0, 16),
  T: 12, Tr: 12, Td: 8, RH: 70, P: 0, Pl: 0, snow: 0, code: 1, vis: 20000, gust: 15, rad: 0, ice: { level: 0, score: 0 }, ...base }));
const NOW = '2026-11-17T07:00';
const tyre = (extra = {}) => ({ type: 'summer', brand: 'Marque test', model: 'Modèle test', size: '225/45 R17 94Y XL', press: '2,4', tread: 7, ...extra });
const PC7 = (extra = {}) => tyre({ brand: 'Continental', model: 'PremiumContact 7', ...extra });
const VAS4 = (extra = {}) => tyre({ type: 'allseason', brand: 'Goodyear', model: 'Vector All Season 4', size: '225/45 R17 94W XL', ...extra });
const ROVELO = (extra = {}) => tyre({ brand: 'Rovelo', model: 'RPX-988', ...extra });
const car = (t, extra = {}) => ({ id: 'fixture-A', name: 'Voiture A', short: 'A', tire: t, ...extra });
const lab = (t, w = {}, extra = {}) => plain(ctx.lab({ ageMin: 5, now: NOW, car: car(t, extra.car), hours: H(w), ...extra.inp }));
const drive = { drive: { active: true, since: '2026-11-17T06:30', kind: 'route' } };
// Partie « performance du simulateur » d'un résultat, sans les champs descriptifs (titre, indices décodés, fiche).
const perf = r => ({ env: r.env, thermal: r.thermal && { T: r.thermal.T, range: r.thermal.range, state: r.thermal.state, s: r.thermal.s, win: r.thermal.win },
  grip: r.grip && { mu: r.grip.mu, lv: r.grip.lv, dist: r.grip.dist, distNote: r.grip.distNote, aqua: r.grip.aqua, f: r.grip.f.map(x => [x.k, x.v]) },
  hero: r.hero && { lvl: r.hero.lvl, brake: r.hero.brake, rain: r.hero.rain, limiting: r.hero.limiting, critical: r.hero.critical } });
const TI = (t, w = { T: 8, Tr: 7 }, extra = {}) => plain(ctx.TI.analyse(plain({ today: '2026-11-17', car: { id: 'fixture-A', tire: t, ...extra },
  weather: { ageMin: 5, source: 'Prévision fictive', fetchedAt: '2026-11-17T06:55:00Z', samples: [{ t: '2026-11-17T07:00', ...w }] } }), ctx.catalog));
const engineCar = (t, extra = {}) => ({ id: 'fixture-A', name: 'Voiture A', short: 'A', sporty: false, tire: t, ...extra });
const hv = (t, w) => plain(ctx.hourVerdict(engineCar(t), H(w, 6), 0));
let n = 0;
const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };

/* ---------- les 10 scénarios ---------- */
check('S1 · PremiumContact 7 neuf, pluie modérée, 12 °C : potentiel documenté reconnu (essai ADAC affiché), aucun coefficient tiré de l’essai', () => {
  const r = TI(PC7(), { T: 12, Tr: 12, P: 3, Pl: 3 });
  assert.equal(r.model.id, 'continental-pc7'); assert.equal(r.tests.length, 1);
  const { test: t, comparison: cmp } = r.tests[0], wet = t.metrics.filter(m => m.id === 'wetBraking').map(m => m.value);
  assert.deepEqual(wet, [30.1, 34.9]); assert.equal(cmp.kind, 'same-model'); assert.equal(cmp.quality, 'faible');
  assert(cmp.reasons.some(x => /Dimension différente/.test(x)), 'essai 225/50 R17 : dimension différente signalée');
  assert(r.rules.some(x => x.id === 'rain-evidence-wetBraking' && /30,1 m · ADAC 2026 · 225\/50 R17/.test(x.text)), 'pluie prévue : freinage mouillé documenté rappelé');
  // Le simulateur ignore la marque : même résultat pour le PremiumContact 7 et un pneu été générique de même dimension.
  const w = { T: 12, Tr: 12, P: 3, Pl: 3, RH: 96 };
  assert.deepEqual(perf(lab(PC7(), w)), perf(lab(tyre(), w)));
});
check('S2 · PremiumContact 7, pluie, 5 °C : aucune pénalité propre au passage sous 7 °C', () => {
  for (const extra of [{}, drive]) {
    const at = T => lab(PC7(), { T, Tr: T, P: 1.5, Pl: 1.5, RH: 95 }, { inp: extra });
    const a = at(6.9), b = at(7.1), c = at(5);
    assert.deepEqual(perf(a).grip, perf(b).grip, '6,9 °C et 7,1 °C : même adhérence et mêmes distances');
    assert(![a, b, c].some(r => r.grip.f.some(x => /7 °C/.test(x.k))), 'aucun facteur « sous 7 °C »');
    assert(!c.thermal.why.some(x => /règle des 7 °C/.test(x)));
  }
});
check('S3 · PremiumContact 7, pluie forte et eau stagnante : aquaplaning critique maintenu, aucune distance chiffrée', () => {
  const r = lab(PC7(), { T: 15, Tr: 15, P: 9, Pl: 9, RH: 99 }, { inp: drive });
  assert.equal(r.env.surf, 'pool'); assert.equal(r.grip.aqua.lv, 3); assert.equal(r.hero.lvl, 3); assert.equal(r.grip.dist, null);
  assert.match(r.grip.distNote, /Eau stagnante/);
  const v = hv(PC7(), { T: 15, Tr: 15, P: 9, Pl: 9, RH: 99 });
  assert(v.a.parts.some(p => /aquaplaning/.test(p.label) && p.v >= 18), 'verdict moteur : pénalité de pluie forte présente');
});
check('S4 · PremiumContact 7, verglas : alerte sévère malgré le niveau premium', () => {
  const r = lab(PC7(), { T: -1, Tr: -2, P: 0.5, Pl: 0.5, code: 66, RH: 98, ice: { level: 3, score: 80 } });
  assert.equal(r.env.surf, 'ice'); assert.equal(r.hero.lvl, 3); assert.equal(r.grip.dist, null);
  const v = hv(PC7(), { T: -1, Tr: -2, P: 0.5, Pl: 0.5, code: 66, RH: 98, ice: { level: 3, score: 80 } });
  assert.equal(v.level, 3, 'pluie verglaçante proche : DANGER au verdict moteur');
  assert.deepEqual(hv(PC7(), { T: -1, Tr: -2, code: 66, P: 0.5, Pl: 0.5 }), hv(tyre(), { T: -1, Tr: -2, code: 66, P: 0.5, Pl: 0.5 }), 'la marque n’adoucit rien');
});
check('S5 · Vector All Season 4, pluie froide : polyvalence de saison, aucun avantage inventé (lacune d’essais affichée)', () => {
  const r = TI(VAS4(), { T: 4, Tr: 3, P: 2, Pl: 2 });
  assert.equal(r.model.id, 'goodyear-vector-as4'); assert.equal(r.tests.length, 0); assert.equal(r.quality, 'indisponible');
  assert(JSON.stringify(r).includes('Données d’essais insuffisantes'), 'lacune d’essais affichée');
  assert(!r.rules.some(x => /^rain-evidence-(wetBraking|aqua)/.test(x.id)), 'aucun résultat d’essai attribué au modèle');
  assert(r.rules.some(x => x.id === 'rain-evidence-gap' && /Freinage mouillé/.test(x.text)), 'preuves manquantes nommées discipline par discipline');
  const w = { T: 4, Tr: 3, P: 2, Pl: 2, RH: 96 };
  assert.deepEqual(perf(lab(VAS4(), w)), perf(lab(tyre({ type: 'allseason', size: '225/45 R17 94W XL' }), w)), 'même résultat qu’un 4 saisons générique');
});
check('S6 · Vector All Season 4, neige : 3PMSF pris en compte, conditions réelles maintenues', () => {
  const w = { T: -1, Tr: -1, snow: 1.2, code: 73, RH: 95 };
  const p = lab(VAS4(), w, { inp: { db: { pmsf: true } } }), q = lab(VAS4(), w, { inp: { db: { pmsf: false } } }), s = lab(PC7(), w);
  assert.equal(p.env.surf, 'snow'); assert(p.grip.mu > q.grip.mu, '3PMSF : meilleure adhérence relative sur neige que sans marquage');
  assert(p.grip.mu > s.grip.mu, 'pneu été sur neige : moins bon qu’un 4 saisons');
  assert.equal(p.grip.dist, null, 'neige : aucune distance');
  const vs = hv(VAS4(), w), su = hv(PC7(), w);
  assert(vs.a.parts.some(x => /4 saisons sur neige/.test(x.label))); assert(su.level >= vs.level);
});
check('S7 · Rovelo RPX-988 sans essai fiable : performance spécifique inconnue, aucun classement inventé', () => {
  const r = TI(ROVELO());
  assert.equal(r.model.id, 'rovelo-rpx988'); assert.equal(r.tests.length, 0); assert.equal(r.quality, 'indisponible');
  const w = { T: 8, Tr: 7, P: 2, Pl: 2, RH: 96 };
  assert.deepEqual(perf(lab(ROVELO(), w)), perf(lab(PC7(), w)), 'Rovelo et PremiumContact 7 : même hypothèse de saison, ni bonus ni malus de marque');
});
check('S8 · profondeur sous 1,6 mm : alerte critique préservée (simulateur et verdict moteur)', () => {
  for (const t of [PC7({ tread: 1.4 }), VAS4({ tread: 1.4 }), tyre({ type: 'winter', size: '225/45 R17 94V XL', tread: 1.4 })]) {
    const r = lab(t, { T: 15, Tr: 15 });
    assert(r.hero.critical, 'état critique affiché'); assert.equal(r.hero.lvl, 3); assert.equal(r.grip.dist, null);
    assert.equal(hv(t, { T: 15, Tr: 15 }).level, 3, 'verdict moteur DANGER même par temps sec');
  }
});
check('S9 · modèle prévu mais non monté : aucune influence sur le risque du véhicule actif', () => {
  const plan = { plan: { on: 1, brand: 'Continental', model: 'PremiumContact 7', size: '225/45 R17 94Y XL', date: '2027-03-01' } };
  const w = { T: 5, Tr: 4, P: 2, Pl: 2, RH: 96 };
  assert.deepEqual(perf(lab(ROVELO(), w, { car: plan })), perf(lab(ROVELO(), w)));
  assert.deepEqual(plain(ctx.hourVerdict(engineCar(ROVELO(), plan), H(w, 6), 0)), hv(ROVELO(), w));
  const r = TI(ROVELO(), w, plan);
  assert.equal(r.model.id, 'rovelo-rpx988'); assert.equal(r.tests.length, 0); assert.equal(r.planned.status, 'planned'); assert.equal(r.planned.tests.length, 1);
});
check('S10 · météo manquante : analyse limitée, jamais une sécurité garantie', () => {
  const r = plain(ctx.lab({ ageMin: 5, now: NOW, car: car(PC7()), hours: [] }));
  assert.equal(r.noWeather, true); assert.equal(r.thermal, undefined); assert.equal(r.confidence.level, 'faible');
  assert.equal(ctx.hourVerdict(engineCar(PC7()), [{ t: NOW, T: 8 }], 0), null, 'heure incomplète : aucun verdict (jamais RAS par défaut)');
  const stale = plain(ctx.lab({ ageMin: 300, now: NOW, car: car(PC7()), hours: H({ T: 8, Tr: 7 }) }));
  assert.equal(stale.confidence.level, 'faible'); assert(stale.confidence.limits.some(x => /Météo ancienne/.test(x)));
});

/* ---------- limites thermiques ---------- */
check('limites · aucune discontinuité à 7 °C ; changements d’état seulement aux bornes documentées des fenêtres de saison', () => {
  for (const t of [PC7(), tyre({ size: '225/45 ZR17 94Y XL' }), VAS4(), tyre({ type: 'winter', size: '225/45 R17 94V XL' })]) for (const extra of [{}, drive]) {
    const mu = T => lab(t, { T, Tr: T, P: 1.5, Pl: 1.5, RH: 95 }, { inp: extra }).grip.mu;
    assert.equal(mu(6.95), mu(7.05), `${t.type} ${t.size} : 6,95 °C et 7,05 °C identiques`);
  }
  // fenêtres : celle de la saison, quelle que soit la dimension
  assert.deepEqual(lab(PC7(), {}).thermal.win, [10, 20, 50, 65]); assert.deepEqual(lab(VAS4(), {}).thermal.win, [5, 15, 45, 60]);
  assert.deepEqual(lab(tyre({ type: 'winter', size: '225/45 R17 94V XL' }), {}).thermal.win, [-5, 5, 35, 50]);
  // le froid n'est compté qu'une fois : sur sec, l'adhérence relative est exactement le facteur « gomme »
  for (const T of [-3, 0, 2, 4, 6, 8]) {
    const r = lab(PC7(), { T, Tr: T });
    if (r.env.surf !== 'dry') continue;
    const f = r.grip.f.filter(x => x.v < 1);
    assert(f.length <= 1 && (!f.length || /^Gomme/.test(f[0].k)), `${T} °C : un seul facteur de froid (${f.map(x => x.k).join(' | ')})`);
  }
  // hypothèse générique documentée comme telle dans l'interface
  const cold = lab(PC7(), { T: 3, Tr: 3 });
  assert(cold.grip.f.some(x => /^Gomme/.test(x.k) && /hypothèse générique de saison, non calibrée/.test(x.k)));
  assert(cold.thermal.why.some(x => /aucun seuil fixe à 7 °C/.test(x)));
});
check('indice de vitesse : V, W, Y et ZR donnent le même résultat (fenêtre, adhérence, distances, états, alertes)', () => {
  const sizes = ['225/45 R17 94V XL', '225/45 R17 94W XL', '225/45 R17 94Y XL', '225/45 ZR17 94Y XL', '225/45 R17 94H XL'];
  for (const w of [{ T: 3, Tr: 2 }, { T: 6, Tr: 6, P: 2, Pl: 2, RH: 96 }, { T: 12, Tr: 12, P: 5, Pl: 5, RH: 98 }, { T: 18, Tr: 20 }, { T: 25, Tr: 32, rad: 600 }])
    for (const extra of [{}, drive]) {
      const ref = perf(lab(tyre({ size: sizes[0] }), w, { inp: extra }));
      for (const s of sizes.slice(1)) assert.deepEqual(perf(lab(tyre({ size: s }), w, { inp: extra })), ref, `${s} ≠ ${sizes[0]} à ${w.T} °C`);
    }
  const r = lab(tyre({ size: '225/45 ZR17 94Y XL' }), {});
  assert.equal(r.tyre.uhp, undefined); assert(r.thermal.why.some(x => /indice de vitesse Y \(sans effet sur la fenêtre thermique\)/.test(x)));
});
check('alertes jamais abaissées : neige, verglas, eau stagnante et profondeur critique au moins aussi sévères qu’un pneu générique de la même saison', () => {
  const W = { neige: { T: -1, Tr: -1, snow: 1.2, code: 73, RH: 95 }, verglas: { T: -1, Tr: -2, P: 0.5, Pl: 0.5, code: 66, ice: { level: 3, score: 80 } },
    eau: { T: 16, Tr: 16, P: 9, Pl: 9, RH: 99 } };
  for (const [k, w] of Object.entries(W)) for (const t of [PC7(), ROVELO(), VAS4()]) {
    const r = lab(t, w, { inp: drive });
    assert.equal(r.hero.lvl, 3, `${k} · ${t.model} : niveau global critique`); assert.equal(r.grip.dist, null);
  }
});
check('isolation des véhicules : la monte, le train prévu et l’état d’une voiture ne changent rien à l’autre', () => {
  const w = { T: 4, Tr: 3, P: 2, Pl: 2, RH: 96 };
  const B = { id: 'fixture-B', name: 'Voiture B', short: 'B', sporty: false, tire: tyre({ type: 'winter', brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '225/45 R18 95V XL' }) };
  const labB = () => plain(ctx.lab({ ageMin: 5, now: NOW, car: B, hours: H(w) }));
  const vB = () => plain(ctx.hourVerdict(B, H(w, 6), 0)), tiB = () => plain(ctx.TI.analyse(plain({ today: '2026-11-17', car: { id: B.id, tire: B.tire }, weather: { ageMin: 5, source: 'x', fetchedAt: '2026-11-17T06:55:00Z', samples: [{ t: NOW, ...w }] } }), ctx.catalog));
  const before = [labB(), vB(), tiB()];
  // la voiture A change : monte usée sous 1,6 mm, autre modèle, train prévu, verdicts calculés
  const A = engineCar(PC7({ tread: 1.2 }), { plan: { on: 1, brand: 'Goodyear', model: 'Vector All Season 4', size: '225/45 R17 94W XL' } });
  ctx.lab({ ageMin: 5, now: NOW, car: A, hours: H(w) }); ctx.hourVerdict(A, H(w, 6), 0); ctx.windowAssess(A, [0, 1, 2].map(i => ({ hs: H(w, 6), i, loc: 'A' })), 'trip');
  assert.deepEqual([labB(), vB(), tiB()], before, 'voiture B identique avant et après les calculs de la voiture A');
  assert.equal(B.tire.tread, 7, 'aucune mutation des entrées');
});
check('catalogue : aucune conversion d’essai ou d’étiquette UE en coefficient (le simulateur et le moteur ne le lisent pas)', () => {
  for (const f of ['engine.js', 'tyrelab.js', 'tyrestate.js', 'relay.js', 'evidence.js']) assert(!/TYRE_TEST_EVIDENCE|TyreIntelligence/.test(read(f)), f);
  const w = { T: 9, Tr: 8, P: 2, Pl: 2, RH: 96 }, empty = { ...plain(ctx.catalog), models: [], tests: [] };
  const withCat = perf(lab(PC7(), w));
  assert.deepEqual(withCat, perf(lab(tyre(), w)), 'catalogue présent ou absent : même simulation');
  assert.equal(plain(ctx.TI.analyse(plain({ today: '2026-11-17', car: { id: 'x', tire: PC7() }, weather: null }), empty)).tests.length, 0);
});
console.log(`${n}/${n} scénarios OK`);
