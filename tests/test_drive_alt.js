// Altitude du parcours (21/11/2026, lot 5), valeurs FICTIVES : module pur DriveAlt (profil, altitude, point haut, gel).
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const c = { Number, Array, Object, String, Math, JSON }; vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/drive-alt-core.js'), 'utf8') + ';this.A=DriveAlt;', c);
const A = c.A, J = v => JSON.parse(JSON.stringify(v)); let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
const co = Array.from({ length: 101 }, (_, i) => [45.9, 6.0 + i * 0.004]), cum = [0];
for (let i = 1; i < co.length; i++) cum.push(cum[i - 1] + 6371000 * Math.PI / 180 * 0.004 * Math.cos(45.9 * Math.PI / 180));
const route = { pts: co, cumulative: cum, total: cum[cum.length - 1] };
test('points du profil : réguliers, 4 décimales, jamais à moins de 1,5 km d’un lieu enregistré', () => {
  const s = J(A.samples(route, [{ lat: 45.9, lon: 6.0 }]));
  assert.ok(s.length >= 100 && s.length <= 160, String(s.length));
  assert.ok(s.every(p => p.at.every(v => (String(v).split('.')[1] || '').length <= 4)));
  const R = Math.PI / 180, m = p => 6371000 * R * Math.hypot(p[0] - 45.9, (p[1] - 6.0) * Math.cos(45.9 * R));
  assert.ok(Math.min(...s.map(p => m(p.at))) > 1500);
  assert.equal(A.samples(null).length, 0);
});
test('profil : réponse IGN alignée sur les points, valeurs absurdes écartées ; altitude interpolée, inconnue loin des points', () => {
  const pts = [{ along: 0, at: [45.9, 6] }, { along: 1000, at: [45.9, 6.01] }, { along: 2000, at: [45.9, 6.02] }, { along: 6000, at: [45.9, 6.06] }];
  const prof = J(A.profile({ elevations: [400, 600, -99999, 900] }, pts));
  assert.deepEqual(prof.map(p => p.z), [400, 600, 900]);
  assert.equal(A.altAt(prof, 500), 500); assert.equal(A.altAt(prof, 3000), null);   // trou de 5 km : inconnu
  assert.equal(A.profile({ elevations: [1, 2] }, pts), null);
});
test('point haut devant : ≥ 150 m au-dessus ou ≥ 600 m ; aucun sinon ; distance et gain', () => {
  const pts = Array.from({ length: 11 }, (_, i) => ({ along: i * 1000, at: [45.9, 6 + i * 0.01] }));
  const prof = J(A.profile({ elevations: [300, 350, 420, 560, 780, 990, 900, 700, 500, 400, 350] }, pts));
  const s = A.summit(prof, 1500);
  assert.equal(s.z, 990); assert.equal(s.dist, 3500); assert.ok(s.gain >= 600);
  assert.equal(A.summit(J(A.profile({ elevations: Array(11).fill(200) }, pts)), 0), null);
  assert.equal(A.summit(prof, 9600), null);
});
test('gel au point haut : AUCUNE règle propre (ni seuil, ni « pas de gel prévu ») ; la règle unique est celle d’engine.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/app/drive-alt-core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(A.frost, undefined); assert.equal(A.tempAt, undefined);
  assert.ok(!/pas de gel|gel probable|gel possible|<=\s*[0-2]\b/.test(src), 'seuil ou mot de gel propre au module');
});
test('libellé au point haut : niveau et mots de la règle d’engine.js tels quels ; repli air signalé ; 429, panne ou plafond → « non couvert », jamais RAS', () => {
  assert.equal(A.summitLabel({ lv: 3, name: 'DANGER', words: 'gel possible · chaussée humide', ref: -1.2, basis: 'road', at: '2026-11-16T10:00' }), 'DANGER · gel possible · chaussée humide · chaussée est. −1,2 °C');
  assert.equal(A.summitLabel({ lv: 1, name: 'VIGILANCE', words: 'gel possible (marge de prudence) · humidité inconnue', ref: 2, basis: 'air', at: '2026-11-16T10:00' }),
    'VIGILANCE · gel possible (marge de prudence) · humidité inconnue · air 2 °C (repli : chaussée non estimée)');
  assert.equal(A.summitLabel({ lv: 0, name: 'RAS', words: 'pas de gel attendu (marge faible)', ref: 3.4, basis: 'road', at: '2026-11-16T11:00', stale: true }),
    'RAS · pas de gel attendu (marge faible) · chaussée est. 3,4 °C · prévision de 11:00 (plafond d’appels atteint)');
  assert.equal(A.summitLabel({ err: 429 }), 'gel non couvert (service météo saturé)'); assert.equal(A.summitLabel({ err: 'plafond' }), 'gel non couvert');
  assert.equal(A.summitLabel(null), 'gel non couvert'); assert.equal(A.summitLabel({ lv: null }), 'gel non couvert'); assert.equal(A.MAX_CALLS, 3);
});
test('DIFFÉRENTIEL : même heure météo → même niveau et mêmes mots dans le cockpit (DriveAlt.verdict) et dans la règle d’engine.js, aux bornes −2, 1, 2, 4 °C, sec / humide / inconnu', () => {
  const E = { console, Math, Date, Intl, Map, Set, JSON, Number, Array, Object, String }; vm.createContext(E);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8') + ';this.eng={ makeModel, summarize, frostRisk, frostWords, LV };', E);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/drive-alt-core.js'), 'utf8') + ';this.DA=DriveAlt;', E);
  const { eng, DA } = E, HOURS = Array.from({ length: 72 }, (_, k) => new Date(Date.UTC(2026, 10, 15, k)).toISOString().slice(0, 13) + ':00'), pass = '2026-11-16T10:20';
  const json = (T, hum) => { const v = x => HOURS.map(() => x), wet = hum === 'humide', unk = hum === 'inconnu';
    return { timezone: 'Europe/Paris', hourly: { time: HOURS, temperature_2m: v(T), relative_humidity_2m: v(wet ? 90 : 60), dew_point_2m: v(wet ? T - 1.5 : T - 7), precipitation: v(unk ? null : wet ? 0.5 : 0),
      rain: v(unk ? null : wet ? 0.5 : 0), snowfall: v(0), weather_code: v(wet ? 61 : 3), cloud_cover: v(100), wind_speed_10m: v(10), wind_gusts_10m: v(20), shortwave_radiation: v(0), visibility: v(20000) } }; };
  const WANT = { '-2': [3, 3, 3], '1': [2, 3, 3], '2': [1, 2, 1], '4': [0, 0, 0] }, bad = [];
  for (const T of [-2, 1, 2, 4]) ['sec', 'humide', 'inconnu'].forEach((hum, h) => {
    const j = json(T, hum), m = eng.makeModel(j, 'live', { lat: 45, lon: 6 }), i = m.byTime.get('2026-11-16T10:00'), fr = eng.frostRisk(eng.summarize([{ hs: m.hs, i }]));
    // Cockpit : la fonction du lot 5 (avant correction : son échelle propre, frost(tempAt) sur l'air seul).
    const c = typeof DA.verdict === 'function' ? DA.verdict(m, pass, eng) : (() => { const t = DA.tempAt(j, pass), f = DA.frost(t); return f && { lv: f.level, words: f.label }; })();
    const ok = c && fr.level === WANT[String(T)][h] && c.lv === fr.level && c.words === eng.frostWords(fr).label && (hum === 'inconnu' ? fr.basis === 'air' : fr.basis === 'road') && !/pas de gel prévu/.test(c.words);
    if (!ok) bad.push(`${T} °C ${hum} : règle ${eng.LV[fr.level] && eng.LV[fr.level].name} (${eng.frostWords(fr).label}) ≠ cockpit ${c ? c.lv + ' (' + c.words + ')' : 'rien'}`);
  });
  assert.deepEqual(bad, []);
});
console.log(`\n${n}/${n} contrôles « altitude du parcours »`);
