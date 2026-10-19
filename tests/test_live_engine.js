// Données fictives ; véritables moteurs et fonctions réseau, sans navigateur ni fournisseur.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let instant = Date.parse('2026-10-12T14:10:00+02:00');
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [instant])); } static now() { return instant; } }
const c = { Date: Clock, Intl, console, Map, Set, Promise, Math, JSON, Number };
vm.createContext(c);
vm.runInContext(['engine', 'wxdesk', 'tirespecs', 'tyrestate', 'tyrelab'].map(n => read('src/' + n + '.js')).join('\n') + '\nthis.E={makeModel,validForecast,estRoad,seqOf,windowAssess,wxDesk,tyreLab};', c);
const E = c.E, copy = v => JSON.parse(JSON.stringify(v)), loc = { id: 'home', lat: 49, lon: 2 };
const p = () => {
  const time = Array.from({ length: 96 }, (_, i) => new Date(Date.UTC(2026, 9, 11, i)).toISOString().slice(0, 16));
  const hourly = { time }; const fill = v => time.map(() => v);
  Object.assign(hourly, { temperature_2m: fill(12), relative_humidity_2m: fill(75), precipitation: fill(0), cloud_cover: fill(50),
    visibility: fill(20000), wind_speed_10m: fill(10), wind_gusts_10m: fill(20), shortwave_radiation: fill(100) });
  return { timezone: 'Europe/Paris', current: { time: '2026-10-12T14:00', temperature_2m: 18 }, hourly };
};
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
test('cache : température de l’heure prévue, jamais ancienne valeur current', () => {
  const m = E.makeModel(p(), 'cache', loc); assert.equal(m.nowStr, '2026-10-12T14:10'); assert.equal(m.cur.T, 12); assert.equal(m.cur.source, 'hourly');
});
test('en ligne : instant actuel récent identifié ; ancien instant remplacé par la prévision horaire datée', () => {
  assert.equal(E.makeModel(p(), 'live', loc).cur.T, 18);
  const old = p(); old.current.time = '2026-10-12T10:00'; const m = E.makeModel(old, 'live', loc);
  assert.equal(m.cur.T, 12); assert.equal(m.cur.source, 'hourly'); assert.equal(m.mode, 'cache');
});
test('prévision expirée, future ou trou horaire : index indisponible, aucune dernière heure extrapolée', () => {
  for (const at of ['2026-10-20T14:10:00+02:00', '2026-10-01T14:10:00+02:00']) {
    const saved = instant; instant = Date.parse(at); const m = E.makeModel(p(), 'live', loc);
    assert.equal(m.nowI, -1); assert.equal(m.cur.T, null); assert.equal(E.seqOf(m, m.nowI, 12).length, 0); instant = saved;
  }
  const missing = p(), i = missing.hourly.time.indexOf('2026-10-12T14:00');
  Object.values(missing.hourly).forEach(a => a.splice(i, 1));
  assert.equal(E.makeModel(missing, 'cache', loc).cur.T, null);
  assert.equal(E.wxDesk({ now: '2026-10-12T14:10', hours: E.makeModel(missing, 'cache', loc).hs }), null);
});
test('heure manquante ou précipitations inconnues : aucun score route 100, aucune estimation thermique', () => {
  const missing = p(); missing.hourly.precipitation = missing.hourly.time.map(() => null);
  const m = E.makeModel(missing, 'cache', loc), x = m.hs[m.nowI]; assert.equal(x.Tr, null);
  const r = E.wxDesk({ now: m.nowStr, hours: m.hs }); assert.equal(r.road.score, null); assert(r.road.missing.includes('P'));
  assert.equal(E.windowAssess({ tire: { type: 'summer' } }, E.seqOf(m, m.nowI, 3), 'trip'), null);
  const lab = E.tyreLab({ now: m.nowStr, hours: m.hs, car: { tire: { type: 'summer', model: 'Test', size: '215/40 R18' } } });
  assert.equal(lab.noWeather, true); assert.equal(lab.thermal, undefined);
});
test('chaussée : vent, nuages, humidité et pluie absents ne deviennent pas des mesures fictives', () => {
  const m = E.makeModel(p(), 'cache', loc), x = copy(m.hs[m.nowI]);
  for (const key of ['wind', 'cloud', 'RH', 'P']) assert.equal(E.estRoad([{ ...x, [key]: null }], 0), null);
});
test('API : températures aberrantes, colonnes tronquées, humidité impossible et dates impossibles refusées', () => {
  assert.equal(E.validForecast(p()), null);
  for (const mutate of [q => q.hourly.temperature_2m[0] = 999, q => q.hourly.precipitation.pop(),
    q => q.hourly.relative_humidity_2m[0] = 150, q => q.current.temperature_2m = Infinity,
    q => q.hourly.time[0] = '2026-02-31T00:00']) { const q = p(); mutate(q); assert.notEqual(E.validForecast(q), null); }
});
test('API : petit bruit solaire futur accepté, borné à zéro dans le modèle, réponse brute intacte', () => {
  for (const value of [-1, -0.1, -0.000001]) {
    const q = p(), index = q.hourly.time.indexOf('2026-10-13T00:00');
    q.hourly.shortwave_radiation[index] = value;
    const before = JSON.stringify(q), m = E.makeModel(q, 'live', loc);
    assert.equal(E.validForecast(q), null);
    assert.equal(m.mode, 'live'); assert.equal(m.cur.T, 18);
    assert.equal(m.hs[index].rad, 0); assert.equal(m.hs[index].radClamped, true);
    assert.equal(JSON.stringify(q), before);
    const zero = copy(q); zero.hourly.shortwave_radiation[index] = 0;
    assert.equal(m.hs[index].Tr, E.makeModel(zero, 'live', loc).hs[index].Tr);
  }
});
test('API : rayonnement aberrant, non numérique, infini ou tronqué toujours refusé', () => {
  for (const value of [-1.01, -100, 2000.01, NaN, Infinity, '-1', false]) {
    const q = p(); q.hourly.shortwave_radiation[0] = value;
    assert.match(E.validForecast(q), /shortwave_radiation invalide/);
    const current = p(); current.current.shortwave_radiation = value;
    assert.match(E.validForecast(current), /shortwave_radiation actuel invalide/);
  }
  const cut = p(); cut.hourly.shortwave_radiation.pop();
  assert.match(E.validForecast(cut), /shortwave_radiation invalide/);
});
test('API : rayonnement nul, absent, inconnu et positif conservé sans correction fictive', () => {
  for (const value of [null, 0, 100, 2000]) {
    const q = p(); q.hourly.shortwave_radiation[0] = value;
    assert.equal(E.validForecast(q), null);
    const x = E.makeModel(q, 'live', loc).hs[0];
    assert.equal(x.rad, value); assert.equal(x.radClamped, undefined);
  }
  const q = p(); delete q.hourly.shortwave_radiation;
  assert.equal(E.validForecast(q), null); assert.equal(E.makeModel(q, 'live', loc).hs[0].rad, null);
});
const app = read('src/app.js'), slice = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
Object.assign(c, { WEATHER_LOAD_GEN: new Map(), RAW: {}, NOWRAW: {}, ERR: {}, GPS: null, gpsWeatherGen: 0, gpsWeatherOrigin: null,
  UI: { loc: 'home' }, offlineNow: () => false, locHasCoords: l => Number.isFinite(l.lat) && Number.isFinite(l.lon),
  WEATHER_REQUESTS: { cancelGroup() {}, fetchedAt: () => instant }, currentLoc: loc, writes: [],
  lsSet: (key, value) => c.writes.push([key, value]), distKm: (a, b) => Math.abs(a.lat - b.lat) * 111,
  urlFor: l => 'base:' + l.lat, urlArome: l => 'ar:' + l.lat, urlNow: l => 'nc:' + l.lat,
  allLocs: () => [c.currentLoc] });
vm.runInContext(slice('function weatherLoadCurrent(', 'let ensBusy') + slice('async function loadLoc(', 'async function reverseName'), c);
const defer = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
(async () => {
  const delayed = defer(); c.fetchJSON = url => url === 'ar:49' ? delayed.promise : Promise.resolve(url.startsWith('nc:') ? {} : p());
  const a = c.loadLoc(loc, true); c.currentLoc = { ...loc, lat: 50 }; await c.loadLoc(c.currentLoc, true);
  const saved = JSON.stringify(c.RAW.home); delayed.resolve(p()); assert.equal(await a, null); assert.equal(JSON.stringify(c.RAW.home), saved);
  assert.equal(c.writes.length, 1); n++; console.log('✅ réponse fixe tardive après déplacement : données et cache récent intacts');
  c.fetchJSON = url => { const q = p(); q.current.time = '2026-10-12T12:00'; return Promise.resolve(url.startsWith('nc:') ? {} : q); };
  await assert.rejects(c.loadLoc(c.currentLoc, true), /plus ancienne/); assert.equal(JSON.stringify(c.RAW.home), saved);
  n++; console.log('✅ réponse API plus ancienne : ancien instant refusé avant toute écriture');
  const lifecycle = read('src/app/lifecycle.js'), start = lifecycle.indexOf('let LOCAL_CLOCK_MINUTE'), end = lifecycle.indexOf("document.addEventListener('focusout'", start);
  let rebuilt = 0, rendered = 0;
  Object.assign(c, { APP_CONTEXT: { ready: true }, DEMO: { on: false }, offlineNow: () => true,
    rebuild: () => rebuilt++, updateLiveClock() {}, renderLiveStatus() {}, renderAll: () => { throw new Error('Un tick local ne doit pas reconstruire tous les onglets'); }, markOfflineCache() {} });
  vm.runInContext(lifecycle.slice(start, end), c);
  c.renderTemporalWeather = () => rendered++; // Le vrai rendu ciblé est exercé par la suite navigateur.
  c.tickLocalClock(); c.tickLocalClock(); instant += 60e3; c.tickLocalClock();
  assert.equal(rebuilt, 2); assert.equal(rendered, 2); n++;
  console.log('✅ horloge locale hors ligne : un recalcul par minute, aucun accès réseau');
  console.log(n + '/' + n + ' scénarios Live Engine OK');
})().catch(e => { console.error(e); process.exit(1); });
