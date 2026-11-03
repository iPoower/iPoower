'use strict';
// PR 2 · cohérence des véhicules : voiture confirmée, affichée et proposée distinguées ; aucune présélection considérée comme utilisée.
// Données fictives. Fonctions pures exécutées (day-context, Prochaine mission) et gardes de source (Trajet, A/B, Diagnostic).
// Contre-tests par mutation en fin de fichier ; le reproducteur navigateur est e2e100-voitures-coherence.js.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const SOURCES = { 'app/day-context.js': read('app/day-context.js'), 'app/mission-control.js': read('app/mission-control.js'), 'app/trip-view.js': read('app/trip-view.js'), 'app/race-views.js': read('app/race-views.js'), 'app.js': read('app.js') };
const fn = (src, name) => { const m = new RegExp('^function ' + name + '\\([^]*?\\n}\\n', 'm').exec(src) || new RegExp('^function ' + name + '\\(.*\\}$', 'm').exec(src); assert(m, 'fonction introuvable : ' + name); return m[0]; };
function runTests(src = SOURCES, options = {}) {
  let count = 0;
  const test = (name, f) => { try { f(); } catch (e) { e.scenario = name; throw e; } count++; if (!options.quiet) console.log('✅ ' + name); };
  const cars = [{ id: 'carA', short: 'Voiture A', tire: { type: 'summer' } }, { id: 'carB', short: 'Voiture B', tire: { type: 'summer' } }];
  const ctx = { S: { cars }, UI: { bcar: 'carB' }, day: { activeCarId: null } }; vm.createContext(ctx);
  vm.runInContext('function appDay() { return day; } function TCARS() { return S.cars; }\n' + ['appActiveCar', 'appDisplayedCar', 'appCarLabel'].map(n => fn(src['app/day-context.js'], n)).join('\n'), ctx);
  const mc = { esc: s => String(s), f1: v => String(v), uxFold: (k, t, b, n) => t + ' ' + b + ' ' + (n || '') }; vm.createContext(mc);
  vm.runInContext(src['app/mission-control.js'] + '\nthis.MC = MissionControl; this.html = missionControlHtml;', mc);
  test('aucune voiture confirmée : voiture affichée = choix de l’affichage (UI.bcar), libellée « affichée, non confirmée »', () => {
    ctx.day.activeCarId = null; assert.equal(vm.runInContext('appActiveCar()', ctx), null);
    assert.equal(vm.runInContext('appDisplayedCar().id', ctx), 'carB');
    const l = vm.runInContext('appCarLabel()', ctx); assert.equal(l.confirmed, false); assert.equal(l.text, 'Voiture B · affichée, non confirmée pour le trajet');
  });
  test('voiture confirmée : prioritaire, sans mention « non confirmée »', () => {
    ctx.day.activeCarId = 'carA'; const l = vm.runInContext('appCarLabel()', ctx); assert.equal(l.confirmed, true); assert.equal(l.text, 'Voiture A');
    assert.equal(vm.runInContext('appDisplayedCar().id', ctx), 'carA'); ctx.day.activeCarId = null;
  });
  test('aucune voiture : « voiture du trajet à choisir »', () => {
    const empty = { S: { cars: [] }, UI: { bcar: null }, day: { activeCarId: null } }; vm.createContext(empty);
    vm.runInContext('function appDay() { return day; } function TCARS() { return S.cars; }\n' + ['appActiveCar', 'appDisplayedCar', 'appCarLabel'].map(n => fn(src['app/day-context.js'], n)).join('\n'), empty);
    assert.equal(vm.runInContext('appCarLabel().text', empty), 'voiture du trajet à choisir');
  });
  const car = { id: 'carB', name: 'Voiture B', tyre: { type: 'Été', model: 'Modèle test', size: '205/55 R16 91V', tread: { mm: 5, estimated: false, date: '2026-11-16' }, pressure: { checked: '2026-11-16' } } };
  test('Prochaine mission : données réelles de la voiture affichée, signalée non confirmée', () => {
    const h = mc.html(JSON.parse(JSON.stringify(mc.MC.project({ car, carConfirmed: false }))));
    assert.match(h, /Voiture B · affichée, non confirmée pour le trajet/); assert.match(h, /5 mm/); assert.doesNotMatch(h, /Monte non confirmée|Profondeur non renseignée/);
  });
  test('Prochaine mission : voiture confirmée sans mention ; aucune voiture → « Voiture du trajet à choisir »', () => {
    assert.doesNotMatch(mc.html(JSON.parse(JSON.stringify(mc.MC.project({ car })))), /non confirmée pour le trajet/);
    assert.match(mc.html(JSON.parse(JSON.stringify(mc.MC.project({})))), /Voiture du trajet à choisir/);
  });
  test('Trajet : formulaire sans présélection (jamais la première voiture par défaut), option « à choisir »', () => {
    const t = src['app/trip-view.js'];
    assert.doesNotMatch(t, /TRIP_FORM\.carId = d\.activeCarId \|\| S\.cars\[0\]/); assert.equal((t.match(/TRIP_FORM\.carId = d\.activeCarId \|\| null;/g) || []).length, 2);
    assert.match(t, /<option value="" \$\{TRIP_FORM\.carId \? '' : 'selected'\}>— Voiture du trajet à choisir —<\/option>/);
    assert.match(t, /🚗 \$\{esc\(appCarLabel\(\)\.text\)\}/);
  });
  test('A/B : comparée avec la voiture affichée quand aucune n’est confirmée, avec la mention', () => {
    const r = src['app/race-views.js']; assert(r.includes('const shown = car || appDisplayedCar(), x = F1Pure.strategyAB(cars.length >= 2 ? { res: cars } : null, shown && shown.id);'));
    assert.match(r, /aucune voiture n’est encore confirmée pour ce trajet/);
  });
  test('Diagnostic : coordonnées à 2 décimales (≈ 1 km) à l’écran comme dans la copie', () => {
    assert.match(src['app.js'], /rd = v => Number\.isFinite\(v\) \? v\.toFixed\(2\) : '—'/); assert.doesNotMatch(src['app.js'], /toFixed\(forCopy \? 2 : 5\)/);
  });
  return count;
}
module.exports = { runTests, SOURCES };
if (require.main === module) {
  const count = runTests();
  const M = (file, name, from, to) => ({ file, name, from, to });
  const mutations = [
    M('app/day-context.js', 'voiture affichée réduite à la voiture confirmée', 'return appActiveCar() || TCARS().find(c => c.id === UI.bcar) || TCARS()[0] || null;', 'return appActiveCar();'),
    M('app/day-context.js', 'voiture affichée présentée comme confirmée', "confirmed: false, text: n(d) + ' · affichée, non confirmée pour le trajet' }", 'confirmed: true, text: n(d) }'),
    M('app/day-context.js', 'voiture affichée ignorée (« à choisir »)', "return c ? { car: c, confirmed: true, text: n(c) } : d ?", 'return c ? { car: c, confirmed: true, text: n(c) } : false ?'),
    M('app/mission-control.js', 'Prochaine mission sans mention « non confirmée »', "(m.carConfirmed === false ? ' · affichée, non confirmée pour le trajet' : '')", "''"),
    M('app/mission-control.js', 'confirmation supposée par défaut', 'carConfirmed: !!car && carConfirmed !== false,', 'carConfirmed: true,'),
    M('app/trip-view.js', 'première voiture présélectionnée de nouveau', "  TRIP_FORM.carId = d.activeCarId || null; TRIP_FORM.message = '';", "  TRIP_FORM.carId = d.activeCarId || S.cars[0] && S.cars[0].id || null; TRIP_FORM.message = '';"),
    M('app/race-views.js', 'A/B limitée à la voiture confirmée', 'const shown = car || appDisplayedCar(), x', 'const shown = car, x'),
    M('app.js', 'coordonnées à 5 décimales à l’écran', "rd = v => Number.isFinite(v) ? v.toFixed(2) : '—'", "rd = v => Number.isFinite(v) ? v.toFixed(forCopy ? 2 : 5) : '—'")
  ];
  for (const m of mutations) {
    const src = { ...SOURCES }; assert(src[m.file].includes(m.from), 'Mutation introuvable : ' + m.name);
    src[m.file] = src[m.file].replace(m.from, m.to);
    let rej; try { runTests(src, { quiet: true }); } catch (e) { rej = e; }
    assert(rej && rej.scenario, 'La mutation doit être rejetée : ' + m.name + (rej ? ' (' + rej.message + ')' : ''));
    console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rej.scenario);
  }
  console.log(`${count}/${count} scénarios OK · ${mutations.length}/${mutations.length} régressions rejetées`);
}
