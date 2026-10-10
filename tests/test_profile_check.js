// Audit A06 : un profil d'exemple ou incomplet est reconnu ; seuls les paramètres nécessaires comptent ; planning impossible repéré.
// Lieux et voitures fictifs uniquement.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const sourcePath = path.join(__dirname, '../src/profile-check.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = { Math, Number, Array, JSON }; vm.createContext(ctx); vm.runInContext(source + ';this.P=ProfileCheck;', ctx);
  const app = options.appSource || fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  ctx.LOCKED = () => false;
  vm.runInContext(app.match(/^const calendarPlaces = .*$/m)[0] + '\n' + app.match(/^const PROFILE = .*$/m)[0] + '\nthis.appProfile=PROFILE;', ctx);
  const P = ctx.P, plain = v => JSON.parse(JSON.stringify(v)); let count = 0;
  const test = (name, fn) => { try { fn(); } catch (error) { error.scenario = name; throw error; } count++; if (!options.quiet) console.log('✅ ' + name); };
  const EX = [{ id: 'home', lat: 48.8566, lon: 2.3522 }, { id: 'work', lat: 50.6292, lon: 3.0573 }];
  const REAL = [{ id: 'home', lat: 49.20, lon: 2.58 }, { id: 'work', lat: 49.36, lon: 2.40 }];   // ≈ 21 km à vol d'oiseau
  const work = (durMin = 30) => ({ from: 'home', to: 'work', durMin });
  const car = (brand = 'Marque test', model = 'Modèle test', extra = {}) => ({ id: 'c', short: 'Citadine', tire: { type: 'summer', brand, model, size: '', dot: '', tread: null, press: '', ...extra } });

  test('réglage neutre (Paris/Lille, voiture sans modèle) : aperçu générique, raisons listées', () => {
    const r = P.check({ locs: EX, work: work(40) }), c = r.car(car('', ''));
    assert.equal(r.generic, true); assert.equal(c.generic, true);
    assert.deepEqual(plain(c.gaps.map(g => g.id)), ['places', 'monte']); assert.match(c.gaps[0].text, /domicile et travail sont les lieux d’exemple/);
    assert.match(c.gaps[1].text, /^Citadine : marque et modèle des pneus montés à renseigner$/);
  });
  test('critère A06 : Paris → Lille en 40 min détecté (≈ 255 km, ≈ 380 km/h) avant tout calcul de chauffe', () => {
    const r = P.check({ locs: EX, work: work(40) });
    assert.equal(r.commuteOk, false); assert(r.commute.km >= 245 && r.commute.km <= 270, r.commute.km); assert(r.commute.kmh >= 360 && r.commute.kmh <= 410, r.commute.kmh);
    assert.match(r.gaps.find(g => g.id === 'commute').text, /≈ 2\d\d km en 40 min, soit ≈ \d{3} km\/h de moyenne/);
  });
  test('vrais lieux + monte renseignée : conseil personnel ; champs facultatifs vides non exigés', () => {
    const r = P.check({ locs: REAL, work: work(30) }), c = r.car(car());
    assert.equal(r.generic, false); assert.equal(r.commuteOk, true); assert.equal(c.generic, false); assert.deepEqual(plain(c.gaps), []);
  });
  test('vrais lieux, monte inconnue sur une seule voiture : seule cette voiture reste en aperçu', () => {
    const r = P.check({ locs: REAL, work: work(30) });
    assert.equal(r.car(car('', 'Modèle')).generic, true); assert.equal(r.car(car('Marque', '  ')).generic, true); assert.equal(r.car(car()).generic, false);
  });
  test('un seul lieu d’exemple suffit à rester en aperçu', () => {
    const r = P.check({ locs: [REAL[0], EX[1]], work: work(60) });
    assert.equal(r.generic, true); assert.match(r.gaps.find(g => g.id === 'places').text, /^travail : lieu d’exemple$/);
  });
  test('appareil verrouillé : toujours aperçu, même avec des valeurs plausibles', () => {
    const r = P.check({ locked: true, locs: REAL, work: work(30) });
    assert.equal(r.generic, true); assert.equal(r.car(car()).generic, true); assert.equal(r.gaps[0].id, 'locked');
  });
  test('cohérence distance/durée : seuil 130 km/h ; distance routière connue prioritaire ; durée absente signalée', () => {
    const a = { lat: 49.0, lon: 2.0 }, b = { lat: 49.9, lon: 2.0 };   // ≈ 100 km à vol d'oiseau → ≈ 125 km de route
    assert.equal(P.commute(a, b, 60).ok, true); assert.equal(P.commute(a, b, 50).ok, false);
    assert.equal(P.commute(a, b, 40, 60).ok, true, 'distance routière réelle');
    const none = P.commute(a, b, null); assert.equal(none.ok, false); assert.match(none.why, /durée du trajet domicile-travail non renseignée/);
    assert.equal(P.commute(a, null, 30), null);
  });
  test('trajet incohérent sans profil générique : pas d’aperçu imposé, seulement le planning bloqué', () => {
    const r = P.check({ locs: REAL, work: work(5) });   // 21 km × 1,25 en 5 min
    assert.equal(r.generic, false); assert.equal(r.commuteOk, false); assert.equal(r.car(car()).generic, false);
    assert(!r.car(car()).gaps.some(g => g.id === 'commute'), 'la voiture n’est pas déclarée générique pour un planning');
  });
  test('lieu absent ou coordonnées invalides : aperçu et planning suspendu', () => {
    for (const locs of [[], [REAL[0]], [{ ...REAL[0], lat: null }, REAL[1]],
      [{ ...REAL[0], lon: NaN }, REAL[1]], [REAL[0], { ...REAL[1], lat: 91 }], [REAL[0], { ...REAL[1], lon: 181 }]]) {
      const r = P.check({ locs, work: work(30) });
      assert.equal(r.generic, true); assert.equal(r.car(car()).generic, true); assert.equal(r.commuteOk, false);
      assert(r.gaps.some(g => g.id === 'places'));
    }
  });
  test('choix explicite introuvable : jamais remplacé par un autre lieu valide', () => {
    for (const w of [{ ...work(), from: 'deleted' }, { ...work(), to: 'deleted' }]) {
      const r = P.check({ locs: REAL, work: w }); assert.equal(r.generic, true); assert.equal(r.commuteOk, false);
    }
  });
  test('lieu enregistré choisi : profil évalué sur ce lieu, pas sur le deuxième lieu d’exemple', () => {
    const custom = { id: 'custom-test', lat: REAL[1].lat, lon: REAL[1].lon };
    const r = P.check({ locs: [REAL[0], EX[1], custom], work: { ...work(), to: custom.id } });
    assert.equal(r.generic, false); assert.equal(r.car(car()).generic, false); assert.equal(r.commuteOk, true);
    assert.deepEqual(plain(r.gaps), []);
  });
  test('profil de l’application : les destinations enregistrées font partie des lieux configurés', () => {
    ctx.S = { locs: [REAL[0], EX[1]], customs: [{ ...REAL[1], id: 'custom-test' }], work: { ...work(), to: 'custom-test' } };
    const r = ctx.appProfile(); assert.equal(r.generic, false); assert.equal(r.car(car()).generic, false); assert.equal(r.commuteOk, true);
  });
  // Exécuter les vrais rendus avec un verdict favorable : l'aperçu doit l'emporter sur ce verdict.
  const els = Object.fromEntries(['#secSeason', '#secDays'].map(id => [id, { innerHTML: '', querySelector: () => null }]));
  Object.assign(ctx, { $: id => els[id], document: { activeElement: null }, MOUNT_FORM: null,
    UI: { view: 'analyse' }, esc: String, f0: String, f1: String, fmtDay: String, pad: String,
    DAYN: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], TYPE_LABEL: { summer: 'été' },
    LV: [{ name: 'GO', emoji: '🟢' }], hasTires: () => true, icon: () => '', wx: () => '', dayDiff: () => 0,
    dayInfosOne: () => 0, carProfile: c => ctx.appProfile().car(c) });
  vm.runInContext(app.match(/^const genericNote = .*$/m)[0] + '\n'
    + app.slice(app.indexOf('function renderDays()'), app.indexOf('function dayInfosOne('))
    + app.slice(app.indexOf('function renderSeason()'), app.indexOf('/* ---------- journal de saison ---------- */')), ctx);
  const renderForecasts = locked => {
    ctx.LOCKED = () => locked;
    const c = car(), day = { date: '2026-10-10', tmin: 13, tmax: 18, level: 0 };
    ctx.S = { locs: REAL, customs: [], work: work(), cars: [c] };
    ctx.CX = { m: { nowStr: '2026-10-10T08:00', days: [day] }, cars: [{ car: c,
      season: { level: 0, title: 'Pneus été encore adaptés', text: 'Aucune période froide', days: [day] } }] };
    ctx.renderSeason(); ctx.renderDays();
    return { season: els['#secSeason'].innerHTML, days: els['#secDays'].innerHTML };
  };
  test('saison et prévisions verrouillées : températures conservées, aucun GO ni couleur favorable', () => {
    const r = renderForecasts(true);
    assert.match(r.season, /APERÇU GÉNÉRIQUE/); assert.match(r.season, /13°/);
    assert.doesNotMatch(r.season, /\bGO\b|Pneus été encore adaptés|class="(?:cell|season) lv0/);
    assert.match(r.days, /Citadine : aperçu générique/); assert.doesNotMatch(r.days, /\bGO\b|class="pip lv0/);
  });
  test('saison et prévisions configurées : conseils, GO et couleurs rétablis', () => {
    const r = renderForecasts(false);
    assert.match(r.season, /Pneus été encore adaptés/); assert.match(r.season, /class="cell lv0/);
    assert.match(r.season, /maximum 18 degrés · GO/); assert.doesNotMatch(r.season, /APERÇU GÉNÉRIQUE/);
    assert.match(r.days, /class="pip lv0/); assert.match(r.days, /Citadine : GO/);
  });
  const leg = { k: 'go', dep: '2026-10-10T09:00', arr: '2026-10-10T09:30', km: 25, min: 30, fromKind: 'home' };
  Object.assign(ctx, { calendarTripKey: () => 'test', liveNow: () => '2026-10-10T08:00', tripCancelButton: () => '',
    returnHomeButtonForTrip: () => '', legNavTo: () => null, wazeBtn: () => 'Waze', cdSpan: () => '', visTxt: String,
    frostBand: () => null, trendHtml: () => '', trendOf: () => null, snapOf: () => null,
    effLegs: () => [leg] });
  vm.runInContext(app.slice(app.indexOf('function legHtml('), app.indexOf('const calendarHasDeclaredPlace')), ctx);
  const renderAgenda = locked => {
    renderForecasts(locked);
    const c = ctx.S.cars[0]; ctx.legEval = () => ({ worst: 0, res: [{ c, w: { level: 0, score: 100 } }],
      sum: { TrMin: 12, Tmin: 13, Pmax: 0, visMin: 10000 }, seq: [] });
    return ctx.legHtml(leg);
  };
  test('Agenda verrouillé : planning et météo conservés, aucun GO personnel', () => {
    const r = renderAgenda(true);
    assert.match(r, /aperçu générique/i); assert.match(r, /25 km · 30 min/); assert.match(r, /12 °C/);
    assert.doesNotMatch(r, /\bGO\b|\b100\b|class="leg lv0/);
  });
  test('Agenda configuré : conclusions favorables rétablies', () => {
    const r = renderAgenda(false);
    assert.match(r, /🟢 GO 100/);
  });
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'lieux d’exemple ignorés', from: 'const generic = !!o.locked || ex.length > 0 || missing;', to: 'const generic = !!o.locked || missing;' },
    { name: 'monte facultative', from: 'return { generic: generic || !monteKnown(x), gaps: g };', to: 'return { generic, gaps: g };' },
    { name: 'vitesse impossible tolérée', from: 'ok = kmh <= MAX_KMH', to: 'ok = true' },
    { name: 'verrouillage ignoré', from: 'const generic = !!o.locked ||', to: 'const generic = false ||' },
    { name: 'champ facultatif exigé (dimension)', from: "!!(car && car.tire && txt(car.tire.brand) && txt(car.tire.model))", to: "!!(car && car.tire && txt(car.tire.brand) && txt(car.tire.model) && txt(car.tire.size))" },
    { name: 'lieux incomplets autorisant un conseil', from: '|| ex.length > 0 || missing;', to: '|| ex.length > 0;' },
    { name: 'origine explicite introuvable remplacée', from: 'w.from ? byId(w.from) : locs[0] || null', to: 'byId(w.from) || locs[0] || null' },
    { name: 'coordonnées hors limites acceptées', from: '&& Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180', to: '' }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name);
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8'), viewMutations = [
    { name: 'saison ignorant le profil', from: 'gen = pf.generic;\n    const di = s.days', to: 'gen = false;\n    const di = s.days' },
    { name: 'prévisions ignorant le profil', from: 'gen = carProfile(c.car).generic, di =', to: 'gen = false, di =' },
    { name: 'Agenda ignorant le profil', from: 'gen = (r.res || []).some(x => carProfile(x.c).generic)', to: 'gen = false' }
  ];
  for (const m of viewMutations) {
    assert(app.includes(m.from), 'Mutation de vue introuvable : ' + m.name);
    let rejection; try { runTests(original, { quiet: true, appSource: app.replace(m.from, m.to) }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation de vue doit être rejetée : ' + m.name);
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length + viewMutations.length}/${mutations.length + viewMutations.length} régressions rejetées`);
}
