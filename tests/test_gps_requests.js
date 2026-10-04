// Réponses réseau GPS dans le désordre : fonctions réelles, réseau et lieux fictifs.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const actual = section('const gpsSourceCurrent =', 'const TCARS') + section('async function refreshAll()', 'function startDemo') + section('async function fetchAQ(l)', 'const polCls');
const A = { id: 'gps', gps: true, lat: 49, lon: 2 }, B = { ...A, lat: 50 };
const defer = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const weather = origin => ({ hourly: { time: ['2026-10-04T00:00'] }, origin });
const turn = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const c = { Date, Promise, Map, Set, GPS: { ...A }, gpsWeatherGen: 1, DEMO: { on: false }, ENSRAW: {}, AQRAW: {}, AQERR: {}, AQBUSY: new Set(), AQREQ: new Map(), RAW: {}, ERR: {}, UI: { loc: 'gps' }, busy: false, lastOk: null, lastTry: null, MIDP: {}, OBS: null, location: { protocol: 'http:' } };
  c.distKm = (a, b) => Math.abs(a.lat - b.lat) * 111;
  c.allLocs = () => c.GPS ? [c.GPS] : [];
  for (const name of ['rebuild', 'softRender', 'renderAll', 'renderStatus', 'fetchVigi', 'radarRefresh', 'loadCalendar', 'renderAir']) c[name] = () => {};
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
  await test('rafraîchissement global : changement pendant les observations ne relance pas l’ancien lieu', async () => {
    const c = setup(), obs = defer(); c.location.protocol = 'https:'; c.fetchJSON = () => obs.promise; c.refreshEns = () => {};
    let calls = 0; c.loadLoc = () => { calls++; c.gpsWeatherGen++; return Promise.resolve(weather('A')); };
    const request = c.refreshAll(); c.GPS = { ...B }; c.gpsWeatherGen++; const latest = c.gpsWeatherGen;
    obs.resolve({ stations: {} }); await request; assert.equal(calls, 0); assert.equal(c.gpsWeatherGen, latest);
  });
  await test('rafraîchissement global : échec courant signalé et météo existante marquée en cache', async () => {
    const c = setup(); c.RAW.gps = { p: weather('A'), mode: 'live' }; c.loadLoc = () => { c.gpsWeatherGen++; return Promise.reject(new Error('réseau absent')); }; c.refreshEns = () => {};
    await c.refreshAll(); assert.equal(c.ERR.gps, 'réseau absent'); assert.equal(c.RAW.gps.mode, 'cache');
  });
  console.log(`\n${checks}/${checks} contre-tests réseau GPS OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
