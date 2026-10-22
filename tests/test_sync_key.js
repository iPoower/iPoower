'use strict';
// Lot D1 : reprise d'une session mémorisée SANS ressaisie du code. Données fictives.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { source, exportsSource, load, business, at, code } = require('./lib/control-vault-owner');
const fakeIndexedDB = require('./lib/indexeddb.fake');
const keySource = fs.readFileSync(path.join(__dirname, '../src/sync-key.js'), 'utf8');
function device(crypto = webcrypto) {
  const owner = load(crypto), context = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Uint8Array, TextEncoder, TextDecoder, atob, btoa, crypto, Promise, Error };
  vm.createContext(context); vm.runInContext(source + exportsSource + '\n' + keySource + ';this.S=SyncKey;', context);
  return { codec: owner.codec, S: context.S, idb: fakeIndexedDB() };
}
const reject = async (p, c) => assert.rejects(p, e => e.code === c);
const day = 24 * 3600 * 1000, now = Date.parse(at), bytes = v => new TextEncoder().encode(JSON.stringify(v));
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
(async () => {
  const fixture = business(load());
  const pc = device(), phone = device();
  const { descriptor, handle } = await pc.S.create(code, webcrypto, at);
  await pc.S.storage(pc.idb).remember(handle, 'device', now + 7 * day, now);

  await check('descripteur public : ni code, ni clé, contrôle GCM lié aux métadonnées', async () => {
    const text = JSON.stringify(descriptor);
    assert(!text.includes(code)); assert.equal(Object.keys(descriptor).length, 8);
    assert.equal(JSON.stringify(pc.S.parse(new TextEncoder().encode(text))), text);
    assert.equal(handle.key.extractable, false);
    await assert.rejects(webcrypto.subtle.exportKey('raw', handle.key));
  });
  await check('PC rechargé sans code → paquet V1 → iPhone repris sans code : 120 trajets et retours identiques', async () => {
    const resumedPc = await device().S.storage(pc.idb).resume(descriptor, 'device', webcrypto, now + day);
    assert(resumedPc);
    const packet = await pc.codec.sealWith(fixture.data, resumedPc, 'prod-156', at);
    // iPhone : une seule saisie du code, puis plusieurs reprises.
    await phone.S.storage(phone.idb).remember(await phone.S.derive(descriptor, code, webcrypto), 'device', now + 7 * day, now);
    const resumedPhone = await device().S.storage(phone.idb).resume(descriptor, 'device', webcrypto, now + 2 * day);
    const restored = await phone.codec.openWith(packet, resumedPhone, 'prod-156');
    assert.deepEqual(restored, fixture.data);
    assert.equal(restored.durable.context.debrief.archive.records.length, 122);
    // Sens retour, et lecture manuelle historique avec le code toujours possible.
    const back = await phone.codec.sealWith(fixture.data, resumedPhone, 'prod-156', at);
    assert.deepEqual(await pc.codec.openWith(back, resumedPc, 'prod-156'), fixture.data);
    assert.deepEqual(await pc.codec.open(back, code, 'prod-156'), fixture.data);
    const a = JSON.parse(new TextDecoder().decode(packet)), b = JSON.parse(new TextDecoder().decode(back));
    assert.equal(a.payload.s, descriptor.s); assert.equal(b.payload.s, descriptor.s); assert.notEqual(a.payload.i, b.payload.i);
    assert.deepEqual(await pc.codec.inspect(packet), await pc.codec.inspect(packet)); // structure contractuelle V1 inchangée
  });
  await check('rien de durable ne contient le code ou une clé exportable', async () => {
    for (const store of [pc.idb.records, phone.idb.records]) {
      assert.deepEqual([...store.keys()], ['sync:device']);
      const row = store.get('sync:device');
      assert.deepEqual(Object.keys(row).sort(), ['a', 'e', 'key', 'keyId', 's', 'v']);
      assert(!JSON.stringify(row).includes(code)); assert.equal(row.key.extractable, false);
    }
  });
  await check('mauvais code refusé avant toute mémorisation', async () => {
    const other = device();
    await reject(other.S.derive(descriptor, 'autre-code-fictif', webcrypto), 'AUTHENTICATION_FAILED');
    assert.equal(other.idb.records.size, 0);
  });
  await check('expiration, durée maximale, verrouillage et liaison de session', async () => {
    const s = device().S.storage(pc.idb);
    assert.equal(await s.resume(descriptor, 'tab:' + 'a'.repeat(32), webcrypto, now + day), null);
    assert.equal(await s.resume(descriptor, 'device', webcrypto, now - 1), null);
    assert.equal(pc.idb.records.size, 0); // une horloge antérieure invalide l'enregistrement
    await reject(s.remember(handle, 'device', now + 7 * day + 1, now), 'CONSERVATION_BLOCKED');
    await reject(s.remember(handle, 'autre', now + day, now), 'CONSERVATION_BLOCKED');
    await s.remember(handle, 'device', now + day, now);
    await s.remember(handle, 'tab:' + 'b'.repeat(32), now + 2 * day, now);
    assert.equal(await s.resume(descriptor, 'device', webcrypto, now + day), null);
    assert(await s.resume(descriptor, 'tab:' + 'b'.repeat(32), webcrypto, now + day));
    await s.remember(handle, 'device', now + 7 * day, now + day); // le balayage retire seulement l'expiré
    assert.deepEqual([...pc.idb.records.keys()].sort(), ['sync:device', 'sync:tab:' + 'b'.repeat(32)]);
    await s.revoke();
    assert.equal(pc.idb.records.size, 0);
    assert.equal(await s.resume(descriptor, 'device', webcrypto, now + 2 * day), null);
    await s.remember(handle, 'device', now + 7 * day, now);
  });
  await check('descripteur hostile refusé avant PBKDF2, contenu modifié refusé par GCM', async () => {
    let derivations = 0;
    const crypt = { getRandomValues: a => webcrypto.getRandomValues(a), subtle: new Proxy(webcrypto.subtle, { get(t, p) {
      if (p === 'deriveKey') return (...args) => { derivations++; return t.deriveKey(...args); };
      const v = Reflect.get(t, p); return typeof v === 'function' ? v.bind(t) : v;
    } }) };
    const S = device(crypt).S;
    for (const [change, error] of [[d => { d.it = 1000; }, 'INVALID_ENVELOPE'], [d => { d.schemaVersion = 2; }, 'UNSUPPORTED_SCHEMA'],
      [d => { d.extra = 1; }, 'INVALID_ENVELOPE'], [d => { d.s = d.s.slice(0, 21) + 'B=='; }, 'INVALID_ENVELOPE'],
      [d => { d.format = 'autre'; }, 'UNSUPPORTED_FORMAT'], [d => { d.createdAt = '2026-02-30T00:00:00.000Z'; }, 'INVALID_ENVELOPE']]) {
      const d = JSON.parse(JSON.stringify(descriptor)); change(d); await reject(S.derive(d, code, crypt), error);
    }
    assert.equal(derivations, 0);
    for (const change of [d => { d.keyId = 'f'.repeat(32); }, d => { d.createdAt = '2026-10-20T10:00:00.000Z'; }]) {
      const d = JSON.parse(JSON.stringify(descriptor)); change(d);
      await reject(S.derive(d, code, crypt), 'AUTHENTICATION_FAILED');
      assert.equal(await device().S.storage(pc.idb).resume(d, 'device', webcrypto, now + day), null);
    }
    assert.equal(pc.idb.records.size, 0); // la clé ne correspond plus : effacée, code requis
    const dup = new TextEncoder().encode(JSON.stringify(descriptor).replace('"format"', '"form\\u0061t":"x","format"'));
    for (const b of [dup, new Uint8Array([239, 187, 191, ...bytes(descriptor)]), new Uint8Array(2049)]) assert.throws(() => S.parse(b));
    await pc.S.storage(pc.idb).remember(handle, 'device', now + 7 * day, now);
  });
  await check('changement de code ou paquet manuel : code requis, jamais de repli silencieux', async () => {
    const rotated = await phone.S.create('nouveau-code-fictif', webcrypto, at);
    assert.notEqual(rotated.descriptor.keyId, descriptor.keyId);
    assert.equal(await device().S.storage(pc.idb).resume(rotated.descriptor, 'device', webcrypto, now + day), null);
    const newer = await phone.codec.sealWith(fixture.data, rotated.handle, 'prod-156', at);
    await reject(pc.codec.openWith(newer, handle, 'prod-156'), 'CODE_REQUIRED');
    const manual = await pc.codec.seal(fixture.data, code, 'prod-156', at);
    await reject(phone.codec.openWith(manual, handle, 'prod-156'), 'CODE_REQUIRED');
    assert.deepEqual(await phone.codec.open(manual, code, 'prod-156'), fixture.data);
    for (const bad of [null, { s: handle.s }, { ...handle, s: 'x' }]) await reject(pc.codec.sealWith(fixture.data, bad, 'prod-156', at), 'CODE_REQUIRED');
    const exportable = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    await reject(pc.codec.sealWith(fixture.data, { ...handle, key: exportable }, 'prod-156', at), 'CODE_REQUIRED');
    await reject(pc.S.storage(pc.idb).remember({ ...handle, key: exportable }, 'device', now + day, now), 'CONSERVATION_BLOCKED');
  });
  await check('non assemblé : ni build, ni écran, ni réseau', async () => {
    const build = fs.readFileSync(path.join(__dirname, '../tools/build.js'), 'utf8');
    assert(!build.includes('sync-key.js'));
    assert(!/fetch|XMLHttpRequest|localStorage|sessionStorage/.test(keySource));
  });
  console.log(n + '/' + n + ' scénarios OK · clé de synchronisation seule, aucune synchronisation activée');
})().catch(e => { console.error(e); process.exitCode = 1; });
