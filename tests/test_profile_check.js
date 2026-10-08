// Audit A06 : un profil d'exemple ou incomplet est reconnu ; seuls les paramètres nécessaires comptent ; planning impossible repéré.
// Lieux et voitures fictifs uniquement.
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const sourcePath = path.join(__dirname, '../src/profile-check.js');
function runTests(source = fs.readFileSync(sourcePath, 'utf8'), options = {}) {
  const ctx = { Math, Number, Array, JSON }; vm.createContext(ctx); vm.runInContext(source + ';this.P=ProfileCheck;', ctx);
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
  return count;
}
module.exports = { runTests, sourcePath };
if (require.main === module) {
  const original = fs.readFileSync(sourcePath, 'utf8'), count = runTests(original);
  const mutations = [
    { name: 'lieux d’exemple ignorés', from: 'const generic = !!o.locked || ex.length > 0;', to: 'const generic = !!o.locked;' },
    { name: 'monte facultative', from: 'return { generic: generic || !monteKnown(x), gaps: g };', to: 'return { generic, gaps: g };' },
    { name: 'vitesse impossible tolérée', from: 'ok = kmh <= MAX_KMH', to: 'ok = true' },
    { name: 'verrouillage ignoré', from: 'const generic = !!o.locked ||', to: 'const generic = false ||' },
    { name: 'champ facultatif exigé (dimension)', from: "!!(car && car.tire && txt(car.tire.brand) && txt(car.tire.model))", to: "!!(car && car.tire && txt(car.tire.brand) && txt(car.tire.model) && txt(car.tire.size))" }
  ];
  for (const m of mutations) {
    assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
    let rejection; try { runTests(original.replace(m.from, m.to), { quiet: true }); } catch (e) { rejection = e; }
    assert(rejection && rejection.scenario, 'La mutation doit être rejetée : ' + m.name);
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
