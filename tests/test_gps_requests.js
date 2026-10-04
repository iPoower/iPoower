// Réponses réseau GPS dans le désordre : fonctions réelles, réseau et lieux fictifs.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const actual = section('const gpsSourceCurrent =', 'const TCARS') + section('async function refreshObservations(', 'function startDemo') + section('async function loadLoc(l)', 'async function reverseName') + section('const RELAY_WARN_MIN =', 'const CARD =') + section('async function fetchAQ(l)', 'const polCls');
const A = { id: 'gps', gps: true, lat: 49, lon: 2 }, B = { ...A, lat: 50 };
const defer = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const weather = origin => ({ hourly: { time: ['2026-10-04T00:00'] }, origin });
const turn = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const c = { Date, Promise, Map, Set, GPS: { ...A }, gpsWeatherGen: 1, gpsWeatherOrigin: null, DEMO: { on: false }, ENSRAW: {}, NOWRAW: {}, AQRAW: {}, AQERR: {}, AQBUSY: new Set(), AQREQ: new Map(), RAW: {}, ERR: {}, UI: { loc: 'gps' }, busy: false, refreshAgain: false, lastOk: null, lastTry: null, MIDP: {}, OBS: null, RELAYSYNC: { state: 'none', updated: null }, relayObsGen: 0, location: { protocol: 'http:' }, fixed: [] };
  c.distKm = (a, b) => Math.abs(a.lat - b.lat) * 111;
  c.allLocs = () => [...(c.GPS ? [c.GPS] : []), ...c.fixed];
  c.offlineNow = () => false; c.markOfflineCache = () => {};
  for (const name of ['rebuild', 'softRender', 'renderAll', 'renderStatus', 'renderSrc', 'fetchVigi', 'radarRefresh', 'loadCalendar', 'renderAir', 'lsSet']) c[name] = () => {};
  c.locHasCoords = l => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lon);
  c.urlFor = c.urlArome = c.urlNow = l => ({ ...l }); c.mergeArome = value => value;
  c.urlAQ = l => l;
  vm.createContext(c); vm.runInContext(actual, c); return c;
}
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('✅ ' + name); }
(async () => {
  await test('ensemble : réponse ancienne ignorée, nouvelle position relancée après le verrou', async () => {
    const c = setup(), a = defer(), b = defer(), calls = [];
    c.fetchEns = l => { calls.push(l.lat); return calls.length === 1 ? a.promise : b.promise; };
    const first = c.refreshEns(); c.GPS = { ...B }; c.gpsWeatherGen++; await c.refreshEns();
    a.resolve({ p: weather('A'), t: Date.now() }); await turn();
    assert.equal(c.ENSRAW.gps, undefined); assert.deepEqual(calls, [A.lat, B.lat]);
    b.resolve({ p: weather('B'), t: Date.now() }); await first; assert.equal(c.ENSRAW.gps.p.origin, 'B');
  });
  await test('ensemble : oubli puis réactivation au même endroit invalident aussi l’ancienne réponse', async () => {
    const c = setup(), a = defer(); c.fetchEns = () => a.promise; const request = c.refreshEns();
    c.GPS = null; c.gpsWeatherGen++; c.GPS = { ...A }; c.gpsWeatherGen++;
    a.resolve({ p: weather('ancienne session'), t: Date.now() }); await request; assert.equal(c.ENSRAW.gps, undefined);
  });
  await test('ensemble : un petit déplacement conserve la requête utile', async () => {
    const c = setup(), a = defer(); c.fetchEns = () => a.promise; const request = c.refreshEns();
    c.GPS = { ...A, lat: A.lat + .01 }; a.resolve({ p: weather('A'), t: Date.now() }); await request; assert.equal(c.ENSRAW.gps.p.origin, 'A');
  });
  await test('air : nouvelle origine lancée immédiatement, ancien résultat ne libère pas le verrou récent', async () => {
    const c = setup(), a = defer(), b = defer(), calls = []; c.fetchJSON = l => { calls.push(l.lat); return calls.length === 1 ? a.promise : b.promise; };
    const first = c.fetchAQ(c.GPS); c.GPS = { ...B }; c.gpsWeatherGen++; const second = c.fetchAQ(c.GPS);
    assert.deepEqual(calls, [A.lat, B.lat]); a.resolve(weather('A')); await first;
    assert.equal(c.AQRAW.gps, undefined); assert.equal(c.AQBUSY.has('gps'), true);
    b.resolve(weather('B')); await second; assert.equal(c.AQRAW.gps.p.origin, 'B'); assert.equal(c.AQBUSY.has('gps'), false);
  });
  await test('air : échec ancien après succès récent ne recrée pas une erreur', async () => {
    const c = setup(), a = defer(), b = defer(); let n = 0; c.fetchJSON = () => ++n === 1 ? a.promise : b.promise;
    const first = c.fetchAQ(c.GPS); c.GPS = { ...B }; c.gpsWeatherGen++; const second = c.fetchAQ(c.GPS);
    b.resolve(weather('B')); await second; a.reject(new Error('ancienne erreur')); await first;
    assert.equal(c.AQRAW.gps.p.origin, 'B'); assert.equal(c.AQERR.gps, undefined);
  });
  await test('air : oubli pendant la requête ne recrée aucun cache ni erreur', async () => {
    for (const fails of [false, true]) {
      const c = setup(), a = defer(); c.fetchJSON = () => a.promise; const request = c.fetchAQ(c.GPS); c.GPS = null; c.gpsWeatherGen++;
      if (fails) a.reject(new Error('réseau absent')); else a.resolve(weather('A')); await request;
      assert.equal(c.AQRAW.gps, undefined); assert.equal(c.AQERR.gps, undefined); assert.equal(c.AQBUSY.has('gps'), false);
    }
  });
  await test('rafraîchissement global : échec ancien ne marque pas le nouveau GPS en cache', async () => {
    const c = setup(), a = defer(); c.loadLoc = () => { c.gpsWeatherGen++; return a.promise; }; c.refreshEns = () => {};
    const request = c.refreshAll(); c.GPS = { ...B }; c.gpsWeatherGen++; c.RAW.gps = { p: weather('B'), mode: 'live' };
    a.reject(new Error('ancienne erreur')); await request; assert.equal(c.ERR.gps, undefined); assert.equal(c.RAW.gps.mode, 'live'); assert.equal(c.lastOk, null);
  });
  await test('rafraîchissement global : succès ancien ne renouvelle pas la date de réussite', async () => {
    const c = setup(), a = defer(); c.loadLoc = () => { c.gpsWeatherGen++; return a.promise; }; c.refreshEns = () => {};
    const request = c.refreshAll(); c.GPS = null; c.gpsWeatherGen++; a.resolve(weather('A')); await request; assert.equal(c.lastOk, null);
  });
  await test('rafraîchissement global : météo indépendante d’un relais lent, ancien GPS toujours ignoré', async () => {
    const c = setup(), obs = defer(); c.location.protocol = 'https:'; c.fetchJSON = () => obs.promise; c.refreshEns = () => {};
    let calls = 0; c.loadLoc = () => { calls++; c.gpsWeatherGen++; return Promise.resolve(weather('A')); };
    const request = c.refreshAll(); c.GPS = { ...B }; c.gpsWeatherGen++; const latest = c.gpsWeatherGen;
    obs.resolve({ stations: {} }); await request; assert.equal(calls, 1); assert.equal(c.gpsWeatherGen, latest); assert.equal(c.lastOk, null);
  });
  await test('rafraîchissement global : échec courant signalé et météo existante marquée en cache', async () => {
    const c = setup(); c.RAW.gps = { p: weather('A'), mode: 'live' }; c.loadLoc = () => { c.gpsWeatherGen++; return Promise.reject(new Error('réseau absent')); }; c.refreshEns = () => {};
    await c.refreshAll(); assert.equal(c.ERR.gps, 'réseau absent'); assert.equal(c.RAW.gps.mode, 'cache');
  });
  await test('lieu fixe : ancienne météo/nowcast après correction ne remplace aucun cache', async () => {
    const c = setup(), a = defer(), work = { id: 'work', lat: 48.9, lon: 2.25 }; c.GPS = null; c.fixed = [work];
    c.fetchJSON = () => a.promise; const request = c.loadLoc(work); work.lat = 48.95;
    a.resolve({ ...weather('ancienne adresse'), minutely_15: { time: [] } }); await request;
    assert.equal(c.RAW.work, undefined); assert.equal(c.NOWRAW.work, undefined); assert.equal(c.ERR.work, undefined);
  });
  await test('lieu fixe : ancien échec météo ne marque pas le nouveau lieu en cache et ne renouvelle pas lastOk', async () => {
    const c = setup(), a = defer(), work = { id: 'work', lat: 48.9, lon: 2.25 }; c.GPS = null; c.fixed = [work];
    c.fetchJSON = () => a.promise; c.refreshEns = () => {}; const request = c.refreshAll(); work.lat = 48.95;
    c.RAW.work = { p: weather('nouvelle adresse'), mode: 'live', lat: work.lat, lon: work.lon };
    a.reject(new Error('ancienne erreur')); await request;
    assert.equal(c.RAW.work.mode, 'live'); assert.equal(c.ERR.work, undefined); assert.equal(c.lastOk, null);
  });
  await test('lieu fixe : correction pendant busy relance immédiatement une seule requête vers la nouvelle adresse', async () => {
    const c = setup(), a = defer(), work = { id: 'work', lat: 48.9, lon: 2.25 }, calls = []; c.GPS = null; c.fixed = [work]; c.refreshEns = () => {};
    c.fetchJSON = l => { calls.push(l.lat); return l.lat === 48.9 ? a.promise : Promise.resolve(weather('nouvelle adresse')); };
    const first = c.refreshAll(); work.lat = 48.95; await c.refreshAll(); await c.refreshAll();
    a.resolve(weather('ancienne adresse')); await first;
    assert.equal(c.RAW.work.lat, 48.95); assert.equal(c.RAW.work.p.origin, 'nouvelle adresse'); assert.equal(c.lastOk > 0, true);
    assert.deepEqual(calls, [48.9, 48.9, 48.9, 48.95, 48.95, 48.95]); assert.equal(c.refreshAgain, false); assert.equal(c.busy, false);
  });
  await test('lieu fixe : ancien ensemble ne remplace pas celui de la nouvelle adresse', async () => {
    const c = setup(), a = defer(), work = { id: 'work', lat: 48.9, lon: 2.25 }; c.GPS = null; c.fixed = [work];
    c.fetchEns = () => a.promise; const request = c.refreshEns(); work.lat = 48.95;
    a.resolve({ p: weather('ancienne adresse'), t: Date.now() }); await request; assert.equal(c.ENSRAW.work, undefined);
  });
  await test('lieu fixe : nouvelle qualité de l’air démarre immédiatement et ignore l’ancienne réponse', async () => {
    const c = setup(), a = defer(), b = defer(), work = { id: 'work', lat: 48.9, lon: 2.25 }; c.GPS = null; c.fixed = [work]; let n = 0;
    c.fetchJSON = () => ++n === 1 ? a.promise : b.promise;
    const first = c.fetchAQ(work); work.lat = 48.95; const second = c.fetchAQ(work); assert.equal(n, 2);
    b.resolve(weather('nouvelle adresse')); await second; a.reject(new Error('ancienne erreur')); await first;
    assert.equal(c.AQRAW.work.p.origin, 'nouvelle adresse'); assert.equal(c.AQERR.work, undefined); assert.equal(c.AQBUSY.has('work'), false);
  });
  await test('horodatage relais : dates invalides ou futures ne sont jamais fraîches', async () => {
    const c = setup(); assert.equal(vm.runInContext('relayAgeMin("invalide")', c), Infinity);
    assert.equal(vm.runInContext('relayAgeMin(new Date(Date.now() + 120000).toISOString())', c), Infinity);
    assert.equal(vm.runInContext('relayObservationTime({updated: new Date().toISOString(), metarError:true})', c), null);
  });
  await test('correction privée : un seul lieu migre une fois, autres réglages et nouvelles éditions préservés', async () => {
    const store = new Map(), preset = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'fixtures/preset.fake.json'), 'utf8'));
    const revision = '1'.repeat(32); preset.locRevisions = { work: revision }; preset.locs[1].address = 'Adresse de test corrigée';
    const c = { window: { TWRC_PRESET: preset, TWRC_PRESET_V: 'nouvelle-version-fictive' }, JSON, Object, Array, Number,
      lsGet: key => store.get(key) || null, lsSet: (key, value) => store.set(key, value), localStorage: { removeItem: key => store.delete(key) }, hashCfg: () => null,
      locHasCoords: l => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lon) };
    vm.createContext(c); vm.runInContext(section('const BASE =', 'const b64 =') + section('function loadSettings()', 'let S = loadSettings()') + section('function getPath(', '/* ---------- données ---------- */'), c);
    c.DEFAULTS = vm.runInContext('normalize(window.TWRC_PRESET, BASE)', c);
    const old = JSON.parse(JSON.stringify(c.DEFAULTS)); old.locRevisions = { work: '0'.repeat(32) };
    old.locs[1] = { ...old.locs[1], name: 'Ancien travail fictif', address: 'Ancienne adresse fictive', lat: 48.95, lon: 2.3 };
    old.locs[0].name = 'Maison éditée fictive'; old.cars[0].tire.tread = 3.7; old.cars[0].tire.dot = '1124';
    old.calib = [{ d: '2026-10-01', fake: true }]; old.journal = { '2026-10-01': { fake: true } }; old.gpsAuto = 1;
    old.edits = { 'locs.1.name': 1, 'locs.1.address': 1, 'locs.1.lat': 1, 'locs.1.lon': 1, 'locs.0.name': 1, 'work.dep': 1 }; old.work.dep = '07:15';
    store.set('twrc.settings.v1', JSON.stringify(old)); store.set('twrc.presetv', 'ancienne-version-fictive'); store.set('twrc.tripcancel', 'annulation-fictive');
    const result = vm.runInContext('loadSettings()', c);
    assert.equal(result.locs[1].lat, preset.locs[1].lat); assert.equal(result.locs[1].address, preset.locs[1].address); assert.equal(result.locs[1].name, preset.locs[1].name);
    assert.equal(result.locs[0].name, old.locs[0].name); assert.equal(result.cars[0].tire.tread, 3.7); assert.equal(result.cars[0].tire.dot, '1124');
    assert.equal(JSON.stringify(result.calib), JSON.stringify(old.calib)); assert.equal(JSON.stringify(result.journal), JSON.stringify(old.journal)); assert.equal(result.work.dep, '07:15'); assert.equal(result.gpsAuto, 1);
    assert.equal(result.locRevisions.work, revision); assert.equal(result.edits['locs.1.lat'], undefined); assert.equal(result.edits['locs.0.name'], 1); assert.equal(store.get('twrc.tripcancel'), 'annulation-fictive');
    result.locs[1].lat = 48.96; result.edits['locs.1.lat'] = 1; store.set('twrc.settings.v1', JSON.stringify(result));
    const again = vm.runInContext('loadSettings()', c); assert.equal(again.locs[1].lat, 48.96); assert.equal(again.edits['locs.1.lat'], 1);
  });
  console.log(`\n${checks}/${checks} contre-tests réseau GPS OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
