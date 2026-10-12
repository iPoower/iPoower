// Cache mémoire de prévisions secondaires : pas de données ni de clés utilisateur.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8'), source = read('src/app.js');
const section = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const T0 = Date.parse('2026-10-12T14:00:00+02:00'); let instant = T0, online = true, calls = 0, fail = false;
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [instant])); } static now() { return instant; } }
const c = { Date: Clock, Intl, Math, Map, Set, JSON, Number, Promise, RAW: {}, MIDP: {}, MIDM: {}, CALM: {}, LEGM: {},
  OBS: null, M: {}, DEMO: { on: false }, LIVE_MAX_MS: 15 * 60e3, PT_TTL: 25 * 60e3, CALBUSY: new Set(), LEGBUSY: new Set(),
  API: 'api', Q_HR: 'hours', Q_DY: 'days', allLocs: () => [], offlineNow: () => !online,
  locHasCoords: p => Number.isFinite(p.lat) && Number.isFinite(p.lon), calendarSpatial: () => true,
  urlFor: p => 'weather:' + p.id, WEATHER_REQUESTS: { fetchedAt: () => instant },
  renderCal() {}, renderTenue() {}, renderBrf() {}, softRender() {}, setTimeout: () => 1, clearTimeout() {},
  legKey: l => l.key, legPoints: l => l.points };
vm.createContext(c);
vm.runInContext(read('src/engine.js') + '\n' + read('src/demo.js') +
  section('const MIDPENDING', 'let VIGI') + section('function expireLive(', 'applyCalib();') +
  section('function rebuild()', '// Vigilance Météo-France') + section('async function ensureMids(', '// dir :') +
  section('async function calModel(', 'function calTrip(') + section('async function fetchLeg(', 'function legEval(') +
  ';this.payload=makeDemoPayload;this.make=makeModel;', c);
const f1 = read('src/app/race-views.js');
vm.runInContext(f1.slice(f1.indexOf('function f1WeatherSources('), f1.indexOf('function f1TrackHtml(')), c);
const point = { id: 'mid', name: 'Point test', lat: 49, lon: 2 }, ev = { lat: 49.1, lon: 2.1 }, id = 'cal49.10_2.10';
const leg = { key: 'test-leg', points: [point] }, payload = () => c.payload('doux', point, 'Europe/Paris');
c.legPoints = l => l.points; // géométrie fictive ; les fonctions de cache et les modèles sont les fonctions réelles
c.fetchJSON = async () => { calls++; if (fail) throw new Error('HTTP 503'); return payload(); };
let n = 0; const check = (name, fn) => { fn(); n++; console.log('✅ ' + name); };
(async () => {
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('réceptions initiales valides : lieu agenda, parcours et point intermédiaire', () => {
    assert(c.MIDP.mid.p); assert(c.CALM[id].m); assert(c.LEGM[leg.key].models[0]);
  });
  const receipts = [c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t], before = calls;
  online = false; instant += 6 * 3600e3; c.markOfflineCache(); c.rebuild();
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('six heures offline : aucun appel, trois prévisions conservées, horloge et mode cache communs', () => {
    assert.equal(calls, before);
    for (const m of [c.MIDM.mid, c.CALM[id].m, c.LEGM[leg.key].models[0]]) { assert.equal(m.nowStr, '2026-10-12T20:00'); assert.equal(m.mode, 'cache'); }
    assert.deepEqual([c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t], receipts);
  });
  check('F1 : une météo locale récente ne masque pas l’âge des points du parcours', () => {
    const m = c.make(payload(), 'live', { id: 'home' }); c.M.home = m; c.RAW.home = { t: instant };
    const provenance = c.f1WeatherSources([{ hs: m.hs, i: m.nowI }, { hs: c.MIDM.mid.hs, i: c.MIDM.mid.nowI }]);
    assert.equal(provenance.known, true); assert.equal(provenance.cache, true); assert.equal(provenance.ageMin, 360);
  });
  online = true; fail = true;
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('HTTP 503 à la reconnexion : les trois dernières prévisions et dates restent intactes', () => {
    assert(c.MIDP.mid.p); assert(c.CALM[id].m); assert(c.LEGM[leg.key].models[0]);
    assert.deepEqual([c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t], receipts);
  });
  const paused = calls;
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('échec : reprise bornée à dix minutes, pas de rafale à chaque rendu', () => assert.equal(calls, paused));
  instant += 11 * 60e3; fail = false;
  await Promise.all([c.ensureMids([point]), c.ensureMids([point])]); await c.calModel(ev); await c.fetchLeg(leg);
  check('reprise : un seul appel par source, nouvelles dates et données adoptées', () => {
    assert.equal(calls, paused + 3);
    assert(c.MIDP.mid.t > receipts[0]); assert(c.CALM[id].t > receipts[1]); assert(c.LEGM[leg.key].t > receipts[2]);
  });
  instant += 26 * 60e3; c.fetchJSON = async () => { calls++; return {}; };
  const last = [c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t];
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('réponse 200 invalide : conservation identique au défaut réseau', () => {
    assert(c.MIDP.mid.p); assert(c.CALM[id].m); assert(c.LEGM[leg.key].models[0]);
    assert.deepEqual([c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t], last);
  });
  instant += 11 * 60e3; c.fetchJSON = async () => { calls++; const p = payload(); p.current.time = '2026-10-12T12:00'; return p; };
  await c.ensureMids([point]); await c.calModel(ev); await c.fetchLeg(leg);
  check('réponse fournisseur ancienne : aucun parcours ni lieu agenda plus récent écrasé', () => {
    assert.deepEqual([c.MIDP.mid.t, c.CALM[id].t, c.LEGM[leg.key].t], last);
  });
  console.log(n + '/' + n + ' scénarios de résilience secondaire OK');
})().catch(e => { console.error(e); process.exit(1); });
