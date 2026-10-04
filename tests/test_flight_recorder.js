'use strict';

const assert = require('assert');

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
global.localStorage = new MemoryStorage();

const obs = require('../src/flight-recorder.js');
let ok = 0;
const test = (name, fn) => {
  try { fn(); ok++; console.log('✅ ' + name); }
  catch (e) { console.error('❌ ' + name); console.error(e.stack || e); process.exitCode = 1; }
};

obs.clear();

test('source enregistrée et relisible', () => {
  obs.source('weather', { status: 'ok', ageMs: 1200, latencyMs: 84 });
  const s = obs.snapshot();
  assert.equal(s.sources.weather.data.status, 'ok');
  assert.equal(s.sources.weather.data.latencyMs, 84);
});

test('coordonnées et identifiants de lieu exclus', () => {
  obs.record('event', 'privacy', {
    lat: 49.1, lon: 2.3, title: 'Rendez-vous secret', name: 'Lieu privé',
    nested: { address: '1 rue test', latitude: 49.1, safe: 'ok' }
  });
  const e = obs.events(1)[0];
  assert.equal('lat' in e.data, false);
  assert.equal('lon' in e.data, false);
  assert.equal('title' in e.data, false);
  assert.equal('name' in e.data, false);
  assert.equal('address' in e.data.nested, false);
  assert.equal('latitude' in e.data.nested, false);
  assert.equal(e.data.nested.safe, 'ok');
});

test('coordonnées textuelles et URL neutralisées', () => {
  obs.record('event', 'privacy', { reason: 'point 49.1234, 2.9876 https://example.test/a' });
  const t = obs.events(1)[0].data.reason;
  assert(t.includes('[coord]'));
  assert(t.includes('[url]'));
  assert(!t.includes('49.1234'));
  assert(!t.includes('example.test'));
});

test('dernière source gagnante', () => {
  obs.source('weather', { status: 'degraded', fallback: 'cache' });
  const s = obs.snapshot();
  assert.equal(s.sources.weather.data.status, 'degraded');
  assert.equal(s.sources.weather.data.fallback, 'cache');
});

test('décision et récupération séparées', () => {
  obs.decision('current-verdict', { level: 2, reasons: ['wet', 'cold-road'] });
  obs.recovery('weather', { status: 'ok', reason: 'network-restored' });
  const s = obs.snapshot();
  assert.equal(s.lastDecision.domain, 'current-verdict');
  assert.equal(s.lastRecovery.domain, 'weather');
});

test('statut inconnu normalisé', () => {
  obs.source('gps', { status: 'magique' });
  assert.equal(obs.snapshot().sources.gps.data.status, 'unknown');
});

test('tampon borné à 180 événements', () => {
  for (let i = 0; i < 220; i++) obs.record('event', 'load', { i });
  assert.equal(obs.snapshot().count, 180);
  assert.equal(obs.events(50).length, 50);
});

test('effacement local complet', () => {
  obs.clear();
  assert.equal(obs.snapshot().count, 0);
  assert.equal(global.localStorage.getItem('twrc.flight.v1'), null);
});

console.log(ok + '/8 scénarios OK');
if (ok !== 8) process.exit(1);
