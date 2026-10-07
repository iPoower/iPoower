// Retours terrain : une observation n'est pas une calibration ; correction par lieu, à partir de 5 retours cohérents.
// Les contre-tests altèrent volontairement le moteur : chaque régression doit être rejetée par un scénario.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const original = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
const engine = text => { const ctx = { Math, Date, Intl, Map, Set, console }; vm.createContext(ctx); vm.runInContext(text + ';this.api={calibBias,CALIB_MIN};', ctx); return ctx.api; };
// fixtures fictives : lieux « home » / « work », températures de chaussée estimées
const ice = (loc, Tr = 2) => ({ t: '2026-10-07T07:00', loc, kind: 'ice', Tr, T: 3 });   // givre vu alors que le modèle donnait +2 °C
const wet = (loc, Tr = -1) => ({ t: '2026-10-07T07:00', loc, kind: 'wet', Tr, T: 1 });   // mouillé non gelé alors que le modèle donnait −1 °C
const dry = loc => ({ t: '2026-10-07T07:00', loc, kind: 'dry', Tr: 4, T: 6 });
const times = (n, f) => Array.from({ length: n }, f);

function runTests(text, quiet = false) {
  const A = engine(text); let count = 0;
  const test = (name, fn) => { try { fn(); } catch (e) { if (e instanceof assert.AssertionError) e.scenario = name; throw e; } count++; if (!quiet) console.log('✅ ' + name); };
  test('un seul retour « givre vu » = observation, aucune correction', () => {
    const c = A.calibBias([ice('home')], 'home');
    assert.strictEqual(c.bias, 0); assert.strictEqual(c.applied, false); assert.strictEqual(c.level, 'observation'); assert.strictEqual(c.n, 1);
  });
  test('2 retours = motif, 3 et 4 = signal : toujours aucune correction', () => {
    assert.strictEqual(A.calibBias(times(2, () => ice('home')), 'home').level, 'motif');
    for (const n of [3, 4]) { const c = A.calibBias(times(n, () => ice('home')), 'home'); assert.strictEqual(c.level, 'signal'); assert.strictEqual(c.bias, 0); }
  });
  test('5 retours cohérents au même lieu = correction appliquée, plafonnée à ±3 °C', () => {
    const c = A.calibBias(times(5, () => ice('home')), 'home');
    assert.strictEqual(A.CALIB_MIN, 5); assert.strictEqual(c.level, 'suggestion'); assert.strictEqual(c.applied, true);
    assert(c.bias < 0 && c.bias >= -3, 'biais attendu négatif et borné : ' + c.bias);
    assert.strictEqual(A.calibBias(times(12, () => ice('home', 20)), 'home').bias, -3);
  });
  test('par lieu : 5 retours au travail ne décalent jamais le domicile', () => {
    const list = times(5, () => ice('work'));
    assert.strictEqual(A.calibBias(list, 'work').applied, true);
    const h = A.calibBias(list, 'home'); assert.strictEqual(h.bias, 0); assert.strictEqual(h.n, 0);
  });
  test('retours contradictoires (givre sur modèle chaud + mouillé sur modèle froid) : aucune correction', () => {
    const c = A.calibBias([...times(5, () => ice('home')), wet('home')], 'home');
    assert.strictEqual(c.coherent, false); assert.strictEqual(c.applied, false); assert.strictEqual(c.bias, 0);
  });
  test('« Sec, RAS » est compté mais ne change jamais la température de chaussée', () => {
    const c = A.calibBias(times(10, () => dry('home')), 'home');
    assert.strictEqual(c.dry, 10); assert.strictEqual(c.n, 0); assert.strictEqual(c.bias, 0);
  });
  test('anciens retours sans lieu ou lieu absent : jamais de biais global', () => {
    const legacy = times(8, () => ({ t: '2026-10-01T07:00', kind: 'ice', Tr: 2, T: 3 }));
    assert.strictEqual(A.calibBias(legacy, 'home').bias, 0);
    assert.strictEqual(A.calibBias(times(8, () => ice('home')), undefined).bias, 0);
  });
  test('retours cohérents avec le modèle (écart nul) : pas de correction fictive', () => {
    const c = A.calibBias(times(6, () => ice('home', -2)), 'home');
    assert.strictEqual(c.applied, false); assert.strictEqual(c.bias, 0);
  });
  test('seuls les 12 derniers retours utiles du lieu comptent', () => {
    const c = A.calibBias([...times(20, () => wet('home')), ...times(12, () => ice('home'))], 'home');
    assert.strictEqual(c.n, 12); assert.strictEqual(c.coherent, true); assert(c.bias < 0);
  });
  return count;
}
const count = runTests(original);
const mutations = [
  { name: 'calibration dès le premier retour', from: 'const CALIB_MIN = 5', to: 'const CALIB_MIN = 1' },
  { name: 'biais global : filtre de lieu retiré', from: 'r && loc != null && r.loc === loc', to: 'r' },
  { name: 'retours contradictoires appliqués', from: 'n >= CALIB_MIN && coherent && proposed !== 0', to: 'n >= CALIB_MIN && proposed !== 0' },
  { name: '« Sec, RAS » compté comme mouillé', from: "(r.kind === 'ice' || r.kind === 'wet')", to: "(r.kind === 'ice' || r.kind === 'wet' || r.kind === 'dry')" },
  { name: 'plafond ±3 °C retiré', from: 'clamp(mean * n / (n + 2), -3, 3)', to: '(mean * n / (n + 2))' }
];
for (const m of mutations) {
  assert(original.includes(m.from), 'Mutation introuvable : ' + m.name);
  let rejection; try { runTests(original.replace(m.from, m.to), true); } catch (e) { rejection = e; }
  assert(rejection instanceof assert.AssertionError, 'La mutation doit être rejetée : ' + m.name);
  console.log('✅ Contre-test rejeté : ' + m.name + ' → ' + rejection.scenario);
}
console.log(`${count} scénarios, ${mutations.length} mutations rejetées`);
