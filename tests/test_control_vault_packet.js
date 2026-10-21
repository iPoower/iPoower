'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { webcrypto, createHash } = require('node:crypto');
const { load, business, at, code, json } = require('./lib/control-vault-owner');
const owner = load(), { P, codec } = owner, enc = new TextEncoder();
const bytes = v => enc.encode(typeof v === 'string' ? v : JSON.stringify(v));
const digest = b => createHash('sha256').update(b).digest('hex');
const reject = async (p, c) => assert.rejects(p, e => e.code === c);
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
(async () => {
  const fixture = business(owner), packet = await codec.seal(fixture.data, code, 'prod-156', at);
  await check('chiffrement authentifié réel, journal complet et tous ses retours à 61 et 120 trajets', async () => {
    for (const count of [61, 120]) {
      const f = count === 120 ? fixture : business(owner, count);
      const sealed = count === 120 ? packet : await codec.seal(f.data, code, 'prod-156', at);
      const restored = await codec.open(sealed, code, 'prod-156', digest(sealed));
      assert.deepEqual(restored, f.data);
      assert.deepEqual(restored.durable.context.debrief.archive, f.archive);
      assert.equal(f.archive.records.length, count + 2);
      assert(f.archive.records.some(r => r.includes('oldField')));
      assert.equal(restored.durable.context.gps, null); assert.equal(restored.durable.context.debrief.active, null);
    }
  });
  await check('empreintes des octets, références externes et métadonnées sans clé', async () => {
    const e = JSON.parse(new TextDecoder().decode(packet)), info = await codec.inspect(packet);
    assert.equal(info.fileSha256, digest(packet)); assert.equal(info.cipherSha256, digest(Buffer.from(e.payload.c, 'base64')));
    assert(Object.isFrozen(info)); assert(!new TextDecoder().decode(packet).includes('voitureA'));
    await reject(codec.open(packet, code, 'prod-156', '0'.repeat(64)), 'INTEGRITY_MISMATCH');
  });
  await check('chaque export utilise un nouveau sel et un nouvel IV', async () => {
    const a = JSON.parse(new TextDecoder().decode(packet)), b = JSON.parse(new TextDecoder().decode(await codec.seal(fixture.data, code, 'prod-156', at)));
    assert.notEqual(a.payload.s, b.payload.s); assert.notEqual(a.payload.i, b.payload.i); assert.notEqual(a.payload.c, b.payload.c);
  });
  await check('mauvais code, altération du chiffré avec hash recalculé et downgrade AAD refusés', async () => {
    await reject(codec.open(packet, 'autre-code-fictif', 'prod-156'), 'AUTHENTICATION_FAILED');
    for (const change of [e => { e.createdAt = '2026-10-20T10:00:00.000Z'; }, e => { e.appVersion = 'prod-155'; }, e => {
      const c = Buffer.from(e.payload.c, 'base64'); c[0] ^= 1; e.payload.c = c.toString('base64'); e.sha256 = digest(c);
    }]) {
      const e = JSON.parse(new TextDecoder().decode(packet)); change(e);
      await reject(codec.open(bytes(e), code, 'prod-156'), 'AUTHENTICATION_FAILED');
    }
  });
  await check('refus de version inconnue/future avant toute dérivation coûteuse', async () => {
    let derivations = 0;
    const crypt = { getRandomValues: a => webcrypto.getRandomValues(a), subtle: new Proxy(webcrypto.subtle, { get(target, prop) {
      if (prop === 'deriveKey') return (...args) => { derivations++; return target.deriveKey(...args); };
      const v = Reflect.get(target, prop); return typeof v === 'function' ? v.bind(target) : v;
    } }) };
    const c = load(crypt).codec;
    await reject(c.open(packet, code, undefined), 'UNKNOWN_READER_VERSION');
    await reject(c.open(packet, code, 'prod-9'), 'PRODUCER_TOO_NEW');
    assert.equal(derivations, 0);
    assert.equal(P.loadedVersion('abcdef012345', { build: 'abcdef012345', run: 156 }), 'prod-156');
    for (const release of [{ build: '012345abcdef', run: 157 }, { run: 156 }, { build: 'abcdef012345', run: '156' }])
      assert.throws(() => P.loadedVersion('abcdef012345', release), e => e.code === 'UNKNOWN_READER_VERSION');
    assert.equal((await codec.open(packet, code, 'prod-1000')).app, 'twrc');
  });
  await check('schémas, propriétés, KDF, Base64, doublons échappés, BOM et UTF-8 invalides refusés', async () => {
    const original = JSON.parse(new TextDecoder().decode(packet));
    for (const [change, error] of [[e => { e.schemaVersion = 2; }, 'UNSUPPORTED_SCHEMA'], [e => { e.extra = true; }, 'INVALID_ENVELOPE'],
      [e => { e.payload.it = 600001; }, 'INVALID_ENVELOPE'], [e => { e.createdAt = '2026-02-30T00:00:00.000Z'; }, 'INVALID_ENVELOPE'],
      [e => { e.payload.s = 'A'.repeat(21) + 'B=='; }, 'INVALID_ENCODING'], [e => { e.sha256 = '0'.repeat(64); }, 'INTEGRITY_MISMATCH']]) {
      const e = json(original); change(e); await reject(codec.inspect(bytes(e)), error);
    }
    for (const malformed of [bytes('{"format":"x","for\\u006dat":"x"}'), bytes('{"a":[[[[0]]]]}'),
      new Uint8Array([239, 187, 191, 123, 125]), new Uint8Array([0xff]), bytes('{"a":1e999}')])
      await reject(codec.inspect(malformed), 'MALFORMED_FILE');
    await reject(codec.inspect(bytes({ app: 'twrc-backup', v: 2 })), 'LEGACY_REEXPORT_REQUIRED');
  });
  await check('le métier refuse, ne nettoie pas et ne convertit jamais un coffre brut', async () => {
    assert.throws(() => P.create(), e => e.code === 'CONSERVATION_BLOCKED');
    for (const data of [{ ...fixture.data, app: 'autre' }, { app: 'twrc', v: 3, settings: {} }, { ...fixture.data, bad: undefined },
      { ...fixture.data, settings: { cars: [{ tire: { treads: [{ pos: 'outer', mm: -1 }] } }] } }])
      await reject(codec.seal(data, code, 'prod-156', at), 'CONSERVATION_BLOCKED');
    const dirty = P.create({ validateBusiness: d => { d.settings.changed = 1; return true; } });
    await reject(dirty.seal(fixture.data, code, 'prod-156', at), 'CONSERVATION_BLOCKED');
    const cyclic = {}; cyclic.self = cyclic;
    await reject(codec.seal(cyclic, code, 'prod-156', at), 'CONSERVATION_BLOCKED');
    const v1 = { app: 'twrc', v: 1, at, settings: { cars: [] }, view: 'garage' };
    assert.deepEqual(await codec.open(await codec.seal(v1, code, 'prod-156', at), code, 'prod-156'), v1);
  });
  await check('taille et absence d’activation : aucun import, stockage, réseau ou changement UX', async () => {
    await reject(codec.inspect(new Uint8Array(P.LIMITS.file + 1)), 'FILE_TOO_LARGE');
    const build = fs.readFileSync(path.join(__dirname, '../tools/build.js'), 'utf8');
    assert(!build.includes('control-vault-packet.js'));
    assert.deepEqual(fixture.values, business(owner).values);
  });
  console.log(n + '/' + n + ' scénarios OK · codec propriétaire seul, pas de restauration appliquée');
})().catch(e => { console.error(e); process.exitCode = 1; });
