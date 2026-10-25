'use strict';
// Le VRAI raccord + les vrais codecs, cryptographie et fusion, deux propriétaires
// indépendants. Seuls réseau, horloge et stockage sont remplacés ici.
const path = require('node:path');
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const files = ['journal-archive', 'debrief', 'sync-merge', 'sync-revisions', 'sync-outbox', 'sync-key', 'control-vault-packet', 'drive-transport', 'drive-sync'];
const source = files.map(n => fs.readFileSync(path.resolve(__dirname, '../src/' + n + '.js'), 'utf8')).join('\n');
const copy = v => structuredClone(v), sha = v => createHash('sha256').update(v).digest('hex');
const pass = 'synthetic-runtime-code', at = Date.parse('2026-10-23T08:00:00.000Z');
function lock() { let chain = Promise.resolve(); return { request(name, options, fn) { if (typeof options === 'function') fn = options; const p = chain.then(() => fn({ name })); chain = p.catch(() => {}); return p; } }; }
function owner(network, count, label, crypt = webcrypto) {
  let time = at, state = null, values, applied = 0, failure = false; const recoveries = [];
  const c = { crypto: webcrypto, navigator: { locks: lock(), onLine: true }, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    URL, btoa, atob, console };
  vm.createContext(c); vm.runInContext(source + ';this.api={DriveSync,SyncMerge,SyncRevisions,JournalArchive,DriveTransport,ControlVaultPacket};', c);
  const A = c.api;
  const entries = Array.from({ length: count }, (_, i) => ({ key: label + '-' + i, at: at - (i % 2 ? 91 : 365) * 864e5 - i, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B', start: null, end: null, feedback: null, deferred: false }));
  if (entries.length) entries.push({ ...entries[0], feedback: { at, conditions: ['rain'], grip: 'normal' } });
  values = { 'twrc.key': pass, 'twrc.settings.v1': JSON.stringify({ cars: [{ id: 'carA', odo: [], tire: { treads: [] } }], edits: {}, calib: [], journal: {} }),
    'twrc.context.v1': JSON.stringify({ v: 1, gps: { lat: 1, lon: 2 }, dayContext: { own: label }, debrief: { active: { key: 'active-' + label }, entries }, done: {} }) };
  values[A.JournalArchive.KEY] = JSON.stringify(A.JournalArchive.capture(values));
  const vault = { mode: 'vault', expiresAt: at + 7 * 864e5, expired: () => false,
    async syncSnapshot() { return { values: { ...values }, binding: null, signal: null, expiresAt: this.expiresAt }; },
    async syncApply(transform, keep, current) {
      if (failure) throw new Error('quota');
      const next = transform({ ...values });
      if (JSON.stringify(next) !== JSON.stringify(values)) { await keep(new TextEncoder().encode('encrypted-local-copy')); if (!current()) throw new Error('locked'); values = next; applied++; }
    } };
  const store = { read: async () => copy(state), write: async s => { state = copy(s); }, recovery: async b => { if (failure) throw new Error('quota'); recoveries.push(copy(b)); return sha(b); }, latestRecovery: async () => recoveries.at(-1) || null };
  const controller = A.DriveSync.create({ vault, provider: network, store, keys: {}, locks: c.navigator.locks, crypto: crypt, now: () => time, version: () => 'prod-999' });
  controller.select({ folder: 'fixtureFolder', binding: 'a'.repeat(64) });
  return { A, controller, vault, store, get values() { return copy(values); }, get state() { return copy(state); }, get applied() { return applied; }, recoveries,
    advance(n) { time += n; }, edit(key, value) { values[key] = value; }, fail(value) { failure = value; } };
}
function drive() {
  const files = new Map(), profileFiles = new Map(); let n = 0;
  const d = { files, profileFiles, loseReply: false, disconnect() {},
    async reserveId() { return 'file_' + ++n; },
    async profiles() { return [...profileFiles.values()].map(copy); },
    async uploadProfile(fileId, folder, bytes) { const p = { fileId, bytes: copy(bytes), sha256: sha(bytes) }; profileFiles.set(fileId, p); return copy(p); },
    async list() { return [...files.values()].map(f => copy(f.ref)); },
    async download(ref) { const f = files.get(ref.fileId); return { packet: { copyBytes: () => copy(f.bytes) }, proof: { ...ref, state: 'verified-bytes', verifiedAt: at } }; },
    async uploadRevision(fileId, folder, packet, rev) {
      if (d.beforeUpload) await d.beforeUpload();
      const bytes = packet.copyBytes(), prior = files.get(fileId);
      if (prior) assert.equal(sha(prior.bytes), sha(bytes), 'même identifiant, mêmes octets');
      else files.set(fileId, { bytes, ref: { fileId, fileSha256: sha(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: copy(rev), state: 'unverified' } });
      if (d.loseReply) { d.loseReply = false; throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); }
      return d.download(files.get(fileId).ref);
    } };
  return d;
}
(async () => {
  const d = drive(), pc = owner(d, 120, 'pc'), phone = owner(d, 61, 'phone');
  const originalRecords = [...new Set([...pc.A.JournalArchive.capture(pc.values).records, ...phone.A.JournalArchive.capture(phone.values).records])].sort();
  await pc.controller.run(true); assert.equal(d.files.size, 1); assert.equal(pc.state.outbox.job, null);
  const packet = JSON.parse(new TextDecoder().decode([...d.files.values()][0].bytes));
  assert(!JSON.stringify(packet).includes(pass)); assert.equal(JSON.parse(new TextDecoder().decode([...d.profileFiles.values()][0].bytes)).format, 'race-control-sync-key');
  await phone.controller.run(true);
  assert.equal(phone.controller.status.message, 'synchronisé');
  assert.equal(phone.A.JournalArchive.capture(phone.values).records.length, 183);
  assert.equal(JSON.parse(phone.values['twrc.context.v1']).gps.lat, 1); assert(phone.recoveries.length);
  for (let i = 0; i < 3; i++) { await pc.controller.run(true); await phone.controller.run(true); }
  assert.equal(pc.A.JournalArchive.capture(pc.values).records.length, 183);
  assert.deepEqual(Array.from(pc.A.JournalArchive.capture(pc.values).records).sort(), originalRecords, 'every complete record and response is preserved, not only its count');
  const count = d.files.size; await pc.controller.run(true); await phone.controller.run(true); assert.equal(d.files.size, count, 'convergence sans versions vides');
  console.log('✅ deux appareils, 120/61 trajets, 91/365 jours, deux réponses : union, copie avant fusion et convergence finie');

  const before = pc.state.outbox.verified;
  const settings = JSON.parse(pc.values['twrc.settings.v1']); settings.cars[0].photo = 'synthetic-photo';
  pc.edit('twrc.settings.v1', JSON.stringify(settings)); pc.edit('twrc.editstamps.v1', JSON.stringify({ 'cars.0.photo': at + 10 }));
  d.loseReply = true; await pc.controller.run(true); assert(pc.state.outbox.job); const pending = pc.state.outbox.job;
  assert(d.files.has(pending.fileId)); assert.equal(pc.state.outbox.verified.sha, before.sha, 'aucun faux reçu après coupure');
  await pc.controller.run(true); assert.equal(pc.state.outbox.job, null); assert.equal(pc.state.outbox.verified.fileId, pending.fileId);
  assert.equal([...d.files.values()].filter(f => f.ref.revision.id === pending.rev.id).length, 1);
  console.log('✅ réponse finale perdue : même fichier réservé repris, pas de doublon, reçu seulement après relecture');

  const fresh = owner(d, 1, 'new'); fresh.fail(true); const initial = JSON.stringify(fresh.values); await fresh.controller.run(true);
  assert.equal(JSON.stringify(fresh.values), initial); assert.equal(fresh.state.base.length, 0); assert.equal(fresh.applied, 0);
  console.log('✅ quota/stockage avant fusion : données et base inchangées, aucun succès trompeur');

  const last = d.files.size; pc.controller.select({ folder: 'other', binding: 'b'.repeat(64) }); await pc.controller.run(true);
  assert.equal(d.files.size, last); assert(pc.controller.status.message.includes('autre compte'));
  console.log('✅ changement de compte/dossier : aucun paquet en attente envoyé dans une autre destination');

  const isolated = drive(), old = owner(isolated, 1, 'old'), other = owner(isolated, 1, 'other');
  await old.controller.run(true);
  const s = JSON.parse(other.values['twrc.settings.v1']); s.cars[0].photo = 'divergence-sans-date'; other.edit('twrc.settings.v1', JSON.stringify(s));
  await other.controller.run(true); assert(other.controller.status.message.startsWith('conflit')); assert.equal(other.state.base.length, 0); assert.equal(isolated.files.size, 1);
  other.vault.mode = 'locked'; await other.controller.run(true); assert.equal(isolated.files.size, 1);
  console.log('✅ conflit ancien sans date + verrouillage : aucune tête absorbée ni publication silencieuse');

  // Une destination quittée pendant un upload ne peut recevoir un accusé tardif.
  {
    const remote = drive(), local = owner(remote, 1, 'paused');
    let entered, release; const started = new Promise(r => { entered = r; }), held = new Promise(r => { release = r; });
    remote.beforeUpload = async () => { entered(); await held; };
    const sending = local.controller.run(true); await started;
    const paused = local.controller.pause(); release(); await Promise.all([sending, paused]);
    const pending = local.state.outbox.job; assert(pending); assert.equal(local.state.outbox.verified, null);
    assert.equal(local.controller.status.state, 'SYNC_BLOCKED');
    local.controller.select({folder:'other',binding:'b'.repeat(64)}); await local.controller.run(true);
    assert(local.controller.status.message.includes('autre compte')); assert.equal(remote.files.size,1);
    local.controller.select({folder:'fixtureFolder',binding:'a'.repeat(64)}); await local.controller.run(true);
    assert.equal(local.state.outbox.job,null); assert.equal(local.state.outbox.verified.fileId,pending.fileId); assert.equal(remote.files.size,1);
    console.log('✅ changement de destination pendant envoi : réponse tardive non acquittée, file conservée et même identifiant repris dans la destination initiale');
  }

  const failures = [];
  for (const kind of ['first', 'automatic']) for (const stage of ['seal', 'upload']) {
    try {
      let release, entered, pause = false;
      const started = new Promise(r => { entered = r; });
      const held = new Promise(r => { release = r; });
      const wait = async () => { if (pause) { pause = false; entered(); await held; } };
      const crypt = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, {
        get(target, key) {
          if (key === 'encrypt') return async (...args) => {
            const aad = args[0].additionalData && new TextDecoder().decode(args[0].additionalData);
            if (stage === 'seal' && aad && aad.startsWith('["race-control-backup",')) await wait();
            return target.encrypt(...args);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        }
      }) };
      const remote = drive(), local = owner(remote, 1, 'concurrent', crypt);
      if (kind === 'automatic') await local.controller.run(true);
      const edit = value => { const s = JSON.parse(local.values['twrc.settings.v1']); s.cars[0].photo = value; local.edit('twrc.settings.v1', JSON.stringify(s)); };
      edit('fixture-A'); pause = true;
      if (stage === 'upload') remote.beforeUpload = wait;
      const sending = local.controller.run(true); await started;
      edit('fixture-B'); release(); await sending;
      const latest = [...remote.files.values()].at(-1);
      const codec = local.A.ControlVaultPacket.create({ validateBusiness: local.A.DriveSync.validateBusiness, crypto: webcrypto });
      const sent = await codec.open(latest.bytes, pass, 'prod-999');
      assert.equal(JSON.parse(sent.values['twrc.settings.v1']).cars[0].photo, 'fixture-A');
      assert.equal(JSON.parse(local.values['twrc.settings.v1']).cars[0].photo, 'fixture-B');
      assert.notEqual(local.state.outbox.dirtySince, null, 'concurrent edit must be durably pending before success status');
      assert.notEqual(local.controller.status.message, 'synchronisé');
      await local.controller.run(true);
      const after = await codec.open([...remote.files.values()].at(-1).bytes, pass, 'prod-999');
      assert.equal(JSON.parse(after.values['twrc.settings.v1']).cars[0].photo, 'fixture-B');
      assert.deepEqual(JSON.parse(JSON.stringify(after.values)), JSON.parse(JSON.stringify(local.A.DriveSync.projection(local.values))), 'complete durable payload matches the verified remote revision');
      assert.equal(local.controller.status.message, 'synchronisé');
      console.log('✅ ' + kind + '/' + stage + ': concurrent edit remains pending until its own verified upload');
    } catch (e) { console.error('FAIL concurrent ' + kind + '/' + stage + ': ' + e.message); failures.push(e); }
  }
  if (failures.length) throw new AggregateError(failures, failures.length + ' concurrency failures');

  await require('./lib/drive-recovery-checks')();

})().catch(e => { console.error(e); process.exitCode = 1; });
