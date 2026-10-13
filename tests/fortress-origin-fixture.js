#!/usr/bin/env node
// Forteresse II : modèle de transfert ENTIÈREMENT FICTIF, sans accès au navigateur,
// aux secrets GitHub, à GitHub Pages, au réseau ou au coffre réel.
// Ce script n'est PAS un outil d'export/import pour l'utilisateur.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv, createHash } = require('node:crypto');

const SOURCE = 'https://ipoower.github.io';
const TARGET = 'https://race-control-fixture.invalid'; // RFC 2606 : hôte volontairement inexistant
const KEYSET = new Set(['twrc.settings.v1', 'twrc.context.v1', 'twrc.tyretherm.v1', 'twrc.tripcancel', 'twrc.view']);
const PASSWORD = 'PHRASE-DE-PASSE-EXCLUSIVEMENT-FICTIVE-2026';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({
  'twrc.settings.v1': JSON.stringify({
    cars: [{ id: 'vehicule-fixture-1', name: 'Auto factice', active: true, tires: [
      { position: 'front', size: '215/40 R18', dot: '2025', depth: 6.2 },
      { position: 'rear', size: '225/45 R17', dot: '2024', depth: 5.6 }
    ], plan: { season: 'winter', at: '2026-12-01', target: 'pneu-test' } }],
    locs: [{ id: 'fiction-home', name: 'Adresse fictive', lat: 0, lon: 0 }],
    calOrigins: { 'cal-fixture': 'fiction-home' }, journal: { service: 'observation fictive' }
  }),
  'twrc.context.v1': JSON.stringify({
    v: 1, dayContext: { activeCarId: 'vehicule-fixture-1', dayType: { date: '2026-10-13', value: 'work' } },
    gps: null, tripStart: null, tripEnd: null, returnHome: null,
    debrief: { active: null, entries: [{ key: 'trajet-fictif', feedback: { grip: 'normal' } }] },
    done: { 'trajet-fictif': { at: 1 } }
  }),
  'twrc.tyretherm.v1': JSON.stringify({ 'vehicule-fixture-1': { T: 21.4, at: '2026-10-13' } }),
  'twrc.tripcancel': JSON.stringify({ 'work-2026-10-13': { at: 1, exp: 2 } }),
  'twrc.view': 'pneus'
});
function validate(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('format values');
  const keys = Object.keys(values);
  if (!keys.length || keys.length > 50 || !keys.every(k => KEYSET.has(k) && typeof values[k] === 'string')) throw Error('clé non classifiée');
  if (!keys.includes('twrc.settings.v1') || !keys.includes('twrc.context.v1')) throw Error('clé métier absente');
  const ctx = JSON.parse(values['twrc.context.v1']);
  if (!ctx || ctx.gps != null || ctx.tripStart != null || ctx.tripEnd != null || ctx.returnHome != null)
    throw Error('contexte runtime interdit');
  if (Object.values(values).some(v => v.length > 1e6)) throw Error('valeur trop longue');
}
function seal(values, password, origin = SOURCE, target = TARGET) {
  validate(values);
  const salt = randomBytes(16), iv = randomBytes(12);
  const header = { app: 'twrc-origin-fixture', v: 1, kdf: 'PBKDF2-SHA256', it: 600000, source: origin, target };
  const payload = { v: 1, keys: Object.keys(values).sort(), digest: digest(values), values: clone(values) };
  const key = pbkdf2Sync(password, salt, header.it, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const c = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  key.fill(0);
  return { ...header, s: salt.toString('base64'), i: iv.toString('base64'), c: c.toString('base64') };
}
function open(pack, password, expectedSource = SOURCE, expectedTarget = TARGET) {
  if (!pack || pack.app !== 'twrc-origin-fixture' || pack.v !== 1 || pack.kdf !== 'PBKDF2-SHA256' ||
    pack.it !== 600000 || pack.source !== expectedSource || pack.target !== expectedTarget) throw Error('enveloppe/version/origine');
  const b64 = v => typeof v === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0;
  if (!b64(pack.s) || !b64(pack.i) || !b64(pack.c) || pack.c.length > 2e6) throw Error('encodage/limites');
  const salt = Buffer.from(pack.s, 'base64'), iv = Buffer.from(pack.i, 'base64'), ct = Buffer.from(pack.c, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 17) throw Error('dimensions GCM');
  const key = pbkdf2Sync(password, salt, pack.it, 32, 'sha256');
  const head = { app: pack.app, v: pack.v, kdf: pack.kdf, it: pack.it, source: pack.source, target: pack.target };
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(JSON.stringify(head)));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  let data;
  try { data = JSON.parse(Buffer.concat([decipher.update(ct.subarray(0, -16)), decipher.final()]).toString('utf8')); }
  finally { key.fill(0); }
  if (!data || data.v !== 1 || !data.values || !Array.isArray(data.keys)) throw Error('schéma');
  validate(data.values);
  assert.deepEqual(data.keys, Object.keys(data.values).sort(), 'manifeste de clés non conforme');
  if (data.digest !== digest(data.values)) throw Error('digest');
  return clone(data.values);
}
class FakeStore {
  constructor(values = {}, limit = Infinity) { this.values = clone(values); this.limit = limit; }
  read() { return clone(this.values); }
  commit(stage) {
    if (Buffer.byteLength(JSON.stringify(stage)) > this.limit) throw Object.assign(Error('quota'), { name: 'QuotaExceededError' });
    this.values = clone(stage);
  }
}
function restore(pack, password, target, options = {}) {
  const values = open(pack, password, options.source || SOURCE, options.targetOrigin || TARGET);
  const before = target.read();
  if (!options.confirmed) throw Error('confirmation explicite requise');
  const stage = { ...before };
  for (const [key, value] of Object.entries(values)) {
    stage[key] = value;
    if (options.interruptAfter === key) throw Error('interruption simulée');
  }
  // Le remplacement atomique de FakeStore est une exigence du protocole, pas
  // une propriété garantie des APIs localStorage/IndexedDB réelles.
  target.commit(stage);
  assert.deepEqual(Object.fromEntries(Object.keys(values).map(k => [k, target.read()[k]])), values);
  return { before, after: target.read() };
}
let passed = 0;
async function check(name, fn) { await fn(); console.log('✅ ' + name); passed++; }
(async () => {
  const source = new FakeStore(fixture()), original = source.read();
  const file = seal(source.read(), PASSWORD);
  const destination = new FakeStore();
  await check('source conservée et restauration vers origine vide = égalité intégrale', () => {
    restore(file, PASSWORD, destination, { confirmed: true });
    assert.deepEqual(destination.read(), original); assert.deepEqual(source.read(), original);
  });
  await check('authenticité : mauvais mot de passe refusé sans mutation', () => {
    const before = destination.read(); assert.throws(() => restore(file, 'FAUX-MOT-DE-PASSE', destination, { confirmed: true }));
    assert.deepEqual(destination.read(), before);
  });
  await check('ciphertext altéré interdit et stockage intact', () => {
    const before = destination.read(), altered = clone(file), b = Buffer.from(altered.c, 'base64');
    b[3] ^= 1; altered.c = b.toString('base64');
    assert.throws(() => restore(altered, PASSWORD, destination, { confirmed: true })); assert.deepEqual(destination.read(), before);
  });
  await check('AAD d’origine altéré interdit', () => {
    const before = destination.read(), p = { ...file, source: 'https://other.invalid' };
    assert.throws(() => restore(p, PASSWORD, destination, { confirmed: true, source: p.source }));
    assert.deepEqual(destination.read(), before);
  });
  await check('version inconnue refusée', () => {
    for (const v of [0, 2, 900]) assert.throws(() => open({ ...file, v }, PASSWORD));
  });
  await check('format KDF/IV/salt/volume hostile refusé', () => {
    for (const x of [{ it: 1 }, { s: 'AQ==' }, { i: 'AQ==' }, { c: 'Z'.repeat(2000001) }])
      assert.throws(() => open({ ...file, ...x }, PASSWORD));
  });
  await check('clé future inconnue et token/session exclus', () => {
    for (const key of ['twrc.unknown.v9', 'twrc.session.v2', 'twrc.vault.v2', 'twrc.gps']) {
      assert.throws(() => seal({ ...fixture(), [key]: 'fictif' }, PASSWORD));
    }
  });
  await check('GPS actif interdit même à l’intérieur d’une clé durable', () => {
    const data = fixture(), c = JSON.parse(data['twrc.context.v1']);
    c.gps = { lat: 20, lon: 30 }; data['twrc.context.v1'] = JSON.stringify(c);
    assert.throws(() => seal(data, PASSWORD));
  });
  await check('quota sur cible vide ne modifie pas source ou cible', () => {
    const empty = new FakeStore({}, 150), before = empty.read();
    assert.throws(() => restore(file, PASSWORD, empty, { confirmed: true }), { name: 'QuotaExceededError' });
    assert.deepEqual(empty.read(), before); assert.deepEqual(source.read(), original);
  });
  await check('coupure pendant staging, aucun commit partiel', () => {
    const dst = new FakeStore({ 'autre.app': 'intacte' }), before = dst.read();
    assert.throws(() => restore(file, PASSWORD, dst, { confirmed: true, interruptAfter: 'twrc.context.v1' }));
    assert.deepEqual(dst.read(), before);
  });
  await check('restauration non confirmée interdite', () => {
    const dst = new FakeStore(); assert.throws(() => restore(file, PASSWORD, dst)); assert.deepEqual(dst.read(), {});
  });
  await check('cohabitation : magasins de deux origines distincts', () => {
    const old = source.read(); destination.values['twrc.view'] = 'analyse';
    assert.equal(source.read()['twrc.view'], 'pneus'); assert.equal(destination.read()['twrc.view'], 'analyse');
    assert.deepEqual(source.read(), old);
  });
  await check('rollback inverse après modification nouvelle origine, consentement et comparaison', () => {
    const modified = destination.read(), reverse = seal(modified, PASSWORD, TARGET, SOURCE);
    const oldBefore = source.read(), reverseResult = restore(reverse, PASSWORD, source, { confirmed: true, source: TARGET, targetOrigin: SOURCE });
    assert.deepEqual(source.read(), modified); assert.deepEqual(reverseResult.before, oldBefore);
    assert.equal(source.read()['twrc.view'], 'analyse');
  });
  await check('coffre chiffré distinct de valeurs de test en clair', () => {
    assert(!JSON.stringify(file).includes('Auto factice')); assert(!JSON.stringify(file).includes('pneu-test'));
  });

  await check('SW v12 réel : autre origine et autre sous-dossier non interceptés', async () => {
    // Le JS du SW de main est exécuté dans un contexte factice : ni navigateur,
    // ni disque local, ni service worker déployé, ni réseau.
    const events = {}, cacheWrites = [];
    const selfFake = {
      location: { origin: TARGET },
      registration: { scope: TARGET + '/' },
      clients: { claim: async () => undefined },
      skipWaiting() {},
      addEventListener(event, callback) { events[event] = callback; }
    };
    const webCache = {
      match: async () => undefined,
      put: async (key, response) => { cacheWrites.push({ key: key.url || String(key), ok: response.ok }); },
      delete: async () => true
    };
    const sandbox = {
      self: selfFake, URL, Request, Response, Headers, Date, Promise, setTimeout,
      caches: { open: async () => webCache, keys: async () => [] },
      fetch: async () => new Response('{"fixture":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../src/sw.js'), 'utf8'),
      sandbox, { filename: 'src/sw.js', timeout: 1000 }
    );
    const run = async url => {
      let promise;
      events.fetch({ request: new Request(url), respondWith: p => { promise = p; }, waitUntil() {} });
      if (!promise) return false;
      const response = await promise;
      assert.equal(response.ok, true);
      return true;
    };
    assert.equal(await run(SOURCE + '/iPoower/race-control/calendar.sealed.json'), false,
      'une ressource relais cross-origin n’est actuellement pas cachée par le SW');
    assert.equal(await run(TARGET + '/Reconversion-Control/fixture.html'), false,
      'autre sous-dossier exclu du scope');
    assert.equal(cacheWrites.length, 0);
    assert.equal(await run(TARGET + '/calendar.sealed.json'), true,
      'le JSON de la même origine est intercepté par le SW actuel');
    assert.equal(cacheWrites.length, 1);
    assert.equal(cacheWrites[0].key, TARGET + '/calendar.sealed.json');
    // Un test réseau fictif ne prouve PAS la réponse CORS de GitHub Pages.
  });
  console.log(`${passed}/${passed} scénarios fictifs OK · aucune connexion réseau ni donnée réelle`);
})().catch(error => { console.error('❌ Forteresse II fixture :', error.message); process.exitCode = 1; });
