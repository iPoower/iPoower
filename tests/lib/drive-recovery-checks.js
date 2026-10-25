'use strict';
// Codecs/coffre de production ; transport et Storage synthétiques uniquement.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), { webcrypto, createHash } = require('node:crypto');
const sha = b => createHash('sha256').update(b).digest('hex');
const clone = v => structuredClone(v), plain = v => JSON.parse(JSON.stringify(v));
const pass = 'fictitious-recovery-only', binding = 'a'.repeat(64), folder = 'fixtureFolder';
const modules = ['journal-archive', 'debrief', 'device-storage', 'remember-device', 'session-vault', 'sync-merge', 'sync-revisions', 'sync-outbox', 'sync-key', 'control-vault-packet', 'drive-store', 'drive-transport', 'drive-sync', 'drive-recovery'];
function storage() {
  const m = new Map(); let failWrite = false, failRead = false, writes = 0;
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem(k) { if (failRead && k === 'twrc.vault.v2') { failRead = false; throw new Error('read'); } return m.get(k) ?? null; },
    setItem(k, v) { if (failWrite && k === 'twrc.vault.v2') throw new Error('write'); m.set(k, String(v)); writes++; },
    removeItem(k) { m.delete(k); }, dump: () => Object.fromEntries(m),
    fail(value) { failWrite = value; }, unreadable() { failRead = true; }, get writes() { return writes; } };
}
function lock() {
  const chains = new Map();
  return { request(name, options, fn) { if (typeof options === 'function') fn = options;
    const p = (chains.get(name) || Promise.resolve()).then(() => fn({ name })); chains.set(name, p.catch(() => {})); return p; } };
}
module.exports = async function recoveryChecks() {
  const ctx = { crypto: webcrypto, navigator: { locks: lock(), onLine: true }, structuredClone, TextEncoder, TextDecoder,
    Uint8Array, ArrayBuffer, URL, atob, btoa, JSON, Object, Array, Map, Set, Proxy, Reflect, console, setTimeout, clearTimeout };
  vm.createContext(ctx);
  const source = modules.map(n => { const f = path.resolve(__dirname, '../../src/' + n + '.js'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }).join('\n');
  vm.runInContext(source + ';this.A={SessionVault,JournalArchive,SyncKey,SyncRevisions,SyncOutbox,DriveSync,DriveRecovery:typeof DriveRecovery === "undefined"?null:DriveRecovery,ControlVaultPacket};', ctx);
  const A = ctx.A; assert.equal(typeof A.DriveRecovery?.create, 'function', 'missing controlled initial A2 recovery');
  const descriptor = await A.SyncKey.create(pass, webcrypto);
  const codec = A.ControlVaultPacket.create({ validateBusiness: A.DriveSync.validateBusiness, crypto: webcrypto });
  const values = { 'twrc.settings.v1': JSON.stringify({ cars: [{ id: 'carA', odo: [{ at: 1, km: 12345 }], tire: { dot: '0126', treads: [{ mm: 6 }] } }], edits: {}, calib: [], journal: {} }),
    'twrc.context.v1': JSON.stringify({ v: 1, debrief: { active: null, entries: [] }, done: {} }),
    'twrc.future-business.v1': JSON.stringify({ preserved: ['unknown compatible value'] }) };
  values[A.JournalArchive.KEY] = JSON.stringify(A.JournalArchive.capture(values));
  const projected = plain(A.DriveSync.projection(values));
  const rev = { id: '1'.repeat(32), device: '2'.repeat(32), seq: 1, parents: [] };
  const makeFile = async (revision, contents = projected) => {
    const data = plain(A.SyncRevisions.snapshot(contents, revision, () => false, '2026-10-25T10:00:00.000Z'));
    const bytes = await codec.sealWith(data, descriptor.handle, 'prod-999', data.at);
    return { bytes, ref: { fileId: 'file-' + revision.id, fileSha256: sha(bytes), size: bytes.length, revision: clone(revision) } };
  };
  const initial = await makeFile(rev);
  function setup(options = {}) {
    const raw = options.raw || storage(), ses = storage(), locks = lock();
    let state = null, persistError = false, receiptError = false;
    const copies = new Map(), files = [clone(initial)], stats = { downloads: 0, uploads: 0 };
    const store = { async read() { return clone(state); }, async write(v) { if (persistError) throw new Error('idb'); state = clone(v); },
      async recovery(b) { if (receiptError) throw new Error('idb'); const h = sha(b); copies.set(h, clone(b)); return h; },
      async readRecovery(h) { return clone(copies.get(h) || null); } };
    const provider = { async profiles() { return [{ bytes: new TextEncoder().encode(JSON.stringify(descriptor.descriptor)), sha256: sha(JSON.stringify(descriptor.descriptor)) }]; },
      async list() { return files.map(f => clone(f.ref)); }, async download(ref, _, selected) { assert.equal(selected, folder); stats.downloads++;
        const f = files.find(f => f.ref.fileId === ref.fileId); if (!f) throw new Error('network');
        return { packet: { copyBytes: () => clone(f.bytes) }, proof: { fileId: ref.fileId, fileSha256: ref.fileSha256 } }; },
      async reserveId() { stats.uploads++; throw new Error('forbidden'); }, async upload() { stats.uploads++; throw new Error('forbidden'); } };
    const vault = () => A.SessionVault.create({ raw, session: ses, crypto: options.crypto || webcrypto, target: null, locks });
    const controller = () => { const c = A.DriveRecovery.create({ vault: vault(), provider, store, locks, crypto: webcrypto, version: () => 'prod-999', current: options.current || (() => true) }); c.select({ folder, binding }); return c; };
    return { raw, ses, files, copies, store, provider, stats, vault, controller,
      get state() { return clone(state); }, corruptState(f) { state = f(state); }, persistFail(v) { persistError = v; }, copyFail(v) { receiptError = v; } };
  }
  let count = 0;
  const test = async (name, fn) => { await fn(); count++; console.log('✅ récupération A2 : ' + name); };
  await test('aperçu authentifié sans écriture ; confirmation et réouverture obligatoires ; toutes les valeurs conservées', async () => {
    const s = setup(); s.raw.setItem('foreign.app', 'preserved'); s.raw.setItem('twrc.view', 'garage');
    const c = s.controller(), before = s.raw.dump(), ticket = await c.prepare(pass);
    assert.deepEqual(s.raw.dump(), before); assert.equal(s.state, null); assert.equal(s.copies.size, 0);
    assert.equal(sha(c.exportCopy(ticket)), ticket.sha256);
    await assert.rejects(c.install(ticket, pass), e => e.code === 'confirmation');
    assert.equal((await c.install(ticket, pass, true)).state, 'REOPEN_REQUIRED');
    assert.equal(s.state.recoveryInit.phase, 'installed'); assert.equal(s.stats.uploads, 0);
    await assert.rejects(c.verify(pass), e => e.code === 'reopen-required');
    const fresh = s.controller(); const result = await fresh.verify(pass); assert.equal(result.state, 'RESTORED_VERIFIED');
    assert.deepEqual(plain(await s.vault().syncVerifyInitialized(pass)), { ...projected, 'twrc.key': pass });
    assert.equal(s.raw.getItem('foreign.app'), 'preserved'); assert.equal(s.raw.getItem('twrc.view'), 'garage');
    assert.equal(s.ses.getItem(A.SessionVault.SESSION), null); assert(!JSON.stringify(s.raw.dump()).includes(pass));
    assert(!JSON.stringify(s.state).includes(pass)); assert(!JSON.stringify(s.state).includes('unknown compatible value'));
    assert.equal(s.state.recoveryInit.phase, 'verified'); assert.deepEqual(s.state.base, [rev.id]);
    const n = s.raw.writes; await fresh.verify(pass); assert.equal(s.raw.writes, n, 'verification never rewrites the vault');
  });
  await test('mauvais code, corruption, profil KDF invalide, graphe incomplet ou divergent : aucune écriture', async () => {
    for (const kind of ['password', 'bytes', 'missing-parent', 'two-heads', 'profile']) {
      const s = setup(), c = s.controller();
      if (kind === 'bytes') s.files[0].bytes[s.files[0].bytes.length - 2] ^= 1;
      if (kind === 'missing-parent') s.files[0] = await makeFile({ ...rev, parents: ['3'.repeat(32)] });
      if (kind === 'two-heads') s.files.push(await makeFile({ ...rev, id: '4'.repeat(32), device: '5'.repeat(32) }));
      if (kind === 'profile') s.provider.profiles = async () => [{ bytes: new TextEncoder().encode('{"kdf":null}'), sha256: 'a'.repeat(64) }];
      await assert.rejects(c.prepare(kind === 'password' ? 'wrong' : pass));
      assert.equal(s.raw.getItem(A.SessionVault.VAULT), null); assert.equal(s.state, null); assert.equal(s.copies.size, 0); assert.equal(s.stats.uploads, 0);
    }
  });
  await test('coffre même illisible, donnée inconnue, ancien coffre, session ou import en attente : refus sans suppression', async () => {
    for (const key of [A.SessionVault.VAULT, 'twrc.settings.v1', 'twrc.unknown', 'twrc.device.vault.v1', 'twrc.restore.pending.v1', A.SessionVault.SESSION]) {
      const s = setup(); s.raw.setItem(key, 'preserve-exact-bytes'); const before = s.raw.dump();
      await assert.rejects(s.controller().prepare(pass), e => e.code === 'not-empty'); assert.deepEqual(s.raw.dump(), before);
    }
  });
  await test('nouvelle tête depuis aperçu et compte changé : nouvelle décision, aucune écriture', async () => {
    const s = setup(), c = s.controller(), ticket = await c.prepare(pass);
    s.files.push(await makeFile({ id: '6'.repeat(32), device: rev.device, seq: 2, parents: [rev.id] }));
    await assert.rejects(c.install(ticket, pass, true), e => e.code === 'source-changed'); assert.equal(s.state, null);
    const next = await c.prepare(pass); c.select({ folder: 'other', binding: 'b'.repeat(64) });
    await assert.rejects(c.install(next, pass, true)); assert.equal(s.raw.getItem(A.SessionVault.VAULT), null);
  });
  await test('IDB indisponible et écriture locale refusée : pas de succès ; reprise du même paquet préparé', async () => {
    const s = setup(), c = s.controller(), ticket = await c.prepare(pass);
    s.copyFail(true); await assert.rejects(c.install(ticket, pass, true)); assert.equal(s.raw.getItem(A.SessionVault.VAULT), null); assert.equal(s.state, null);
    s.copyFail(false); s.raw.fail(true); await assert.rejects(c.install(ticket, pass, true));
    assert.equal(s.raw.getItem(A.SessionVault.VAULT), null); assert.equal(s.state.recoveryInit.phase, 'pending'); assert.equal(s.copies.size, 1);
    s.raw.fail(false); const retry = s.controller(), again = await retry.prepare(pass); await retry.install(again, pass, true);
    assert.equal(s.copies.size, 1); assert.equal((await s.controller().verify(pass)).state, 'RESTORED_VERIFIED');
  });
  await test('relecture locale altérée et copie indépendante altérée : aucune validation', async () => {
    const s = setup(), c = s.controller(); await c.install(await c.prepare(pass), pass, true);
    const before = s.raw.getItem(A.SessionVault.VAULT); s.raw.setItem(A.SessionVault.VAULT, before.slice(0, -3));
    await assert.rejects(s.controller().verify(pass)); assert.equal(s.state.recoveryInit.phase, 'installed');
    s.raw.setItem(A.SessionVault.VAULT, before); s.copies.get(s.state.recoveryInit.source)[0] ^= 1;
    await assert.rejects(s.controller().verify(pass), e => e.code === 'integrity'); assert.equal(s.state.recoveryInit.phase, 'installed');
  });
  await test('limite de catalogue et absence de sauvegarde : arrêt sans tronquer ni créer de version', async () => {
    for (const many of [false, true]) { const s = setup(); s.provider.list = async () => many ? Array(129).fill(clone(initial.ref)) : [];
      await assert.rejects(s.controller().prepare(pass)); assert.equal(s.state, null); assert.equal(s.stats.uploads, 0); }
  });
  await test('coffre créé par un autre contexte pendant la dérivation : octets étrangers conservés', async () => {
    const raw = storage(); let inject = true;
    const crypt = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
      get(target, key) { if (key === 'deriveBits') return async (...args) => {
        const out = await target.deriveBits(...args); if (inject) { inject = false; raw.setItem(A.SessionVault.VAULT, 'concurrent-exact-bytes'); } return out;
      }; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
    }) };
    const s = setup({ raw, crypto: crypt }), c = s.controller(), ticket = await c.prepare(pass);
    await assert.rejects(c.install(ticket, pass, true)); assert.equal(raw.getItem(A.SessionVault.VAULT), 'concurrent-exact-bytes');
    assert.equal(s.state.recoveryInit.phase, 'pending'); assert.equal(s.stats.uploads, 0);
  });
  await test('accusé IDB perdu après le coffre écrit : vérification du journal pending après réouverture', async () => {
    const s=setup(), c=s.controller(), ticket=await c.prepare(pass), write=s.store.write;
    let writes=0;
    s.store.write=async value=>{if(++writes===2)throw new Error('lost-local-ack');await write(value);};
    await assert.rejects(c.install(ticket,pass,true));
    assert(s.raw.getItem(A.SessionVault.VAULT));assert.equal(s.state.recoveryInit.phase,'pending');
    assert.equal((await s.controller().verify(pass)).state,'RESTORED_VERIFIED');assert.equal(s.copies.size,1);assert.equal(s.stats.uploads,0);
  });
  await test('deux onglets préparés : une seule installation, seconde confirmation refusée sans écrasement', async () => {
    const s=setup(), a=s.controller(), b=s.controller(), ta=await a.prepare(pass), tb=await b.prepare(pass);
    const results=await Promise.allSettled([a.install(ta,pass,true),b.install(tb,pass,true)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
    assert.equal(s.copies.size,1);assert.equal((await s.controller().verify(pass)).state,'RESTORED_VERIFIED');
    assert.deepEqual(plain(await s.vault().syncVerifyInitialized(pass)),{...projected,'twrc.key':pass});
  });
  console.log('✅ ' + count + ' groupes de récupération initiale A2, Google simulé uniquement');
};
