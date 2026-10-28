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
  const makeController = () => {
    const instance = A.DriveSync.create({ vault, provider: network, store, keys: {}, locks: c.navigator.locks, crypto: crypt, now: () => time, version: () => 'prod-999' });
    instance.select({ folder: 'fixtureFolder', binding: 'a'.repeat(64) });
    return instance;
  };
  const controller = makeController();
  return { A, controller, vault, store, get values() { return copy(values); }, get state() { return copy(state); }, get applied() { return applied; }, recoveries,
    restart: makeController, advance(n) { time += n; }, edit(key, value) { values[key] = value; }, fail(value) { failure = value; } };
}
function drive() {
  const files = new Map(), profileFiles = new Map(); let n = 0;
  const d = { files, profileFiles, loseReply: false, uploadAttempts: 0, disconnect() {},
    async reserveId() { return 'file_' + ++n; },
    async profiles() { return [...profileFiles.values()].map(copy); },
    async uploadProfile(fileId, folder, bytes) { const p = { fileId, bytes: copy(bytes), sha256: sha(bytes) }; profileFiles.set(fileId, p); return copy(p); },
    async list() { return [...files.values()].map(f => copy(f.ref)); },
    async download(ref) { const f = files.get(ref.fileId); return { packet: { copyBytes: () => copy(f.bytes) }, proof: { ...ref, state: 'verified-bytes', verifiedAt: at } }; },
    async uploadRevision(fileId, folder, packet, rev) {
      d.uploadAttempts++;
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
  // Test the vendored Google Drive transport, not a local imitation of its method.
  {
    const sourceHash = 'dce5beafe7dab3fffa4beabb17a8d059fc8393de22b95df2ab9aa0663b969985';
    const vendor = fs.readFileSync(path.resolve(__dirname, '../src/drive-transport.js'), 'utf8');
    assert.match(vendor, new RegExp('"src/services/opaque-drive.ts": "' + sourceHash + '"'));
    assert.equal((vendor.match(/page\.incompleteSearch !== void 0 && page\.incompleteSearch !== false/g) || []).length, 3,
      'all three Drive list paths must accept the omitted optional default');
    const context = {
      location: { origin: 'https://race.example.com' }, crypto: webcrypto,
      TextEncoder, TextDecoder, Uint8Array, URL, URLSearchParams, btoa, atob,
      Response, AbortController, setTimeout, clearTimeout,
    };
    vm.createContext(context);
    vm.runInContext(vendor + ';this.T=DriveTransport;', context);
    const T = context.T, scope = 'https://www.googleapis.com/auth/drive.file';
    let incomplete = undefined;
    const fetcher = async url => {
      const u = new URL(String(url));
      if (u.pathname.endsWith('/files/folder_A')) return new Response(JSON.stringify({
        id: 'folder_A', mimeType: 'application/vnd.google-apps.folder', trashed: false,
        ownedByMe: true, appProperties: { cv_contract: 'rc-folder-v1' }, capabilities: { canAddChildren: true },
      }));
      assert.equal(u.pathname, '/drive/v3/files');
      return new Response(JSON.stringify({ ...(incomplete !== undefined ? { incompleteSearch: incomplete } : {}), files: [] }));
    };
    const client = new T.OpaqueDrive(['https://race.example.com'], fetcher);
    client.connect('fixture_token', 3600, [scope]);
    assert.deepEqual(Array.from(await client.folders()), []);
    assert.deepEqual(Array.from(await client.profiles('folder_A')), []);
    assert.deepEqual(Array.from(await client.list('folder_A')), []);
    incomplete = true;
    await assert.rejects(client.folders(), e => e.code === 'incomplete');
    incomplete = null;
    await assert.rejects(client.folders(), e => e.code === 'incomplete');
    client.disconnect();
    console.log('✅ transport vendored synchronisé : trois listes Google acceptent le champ absent et refusent true/null');
  }
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

  {
    const remote = drive(), local = owner(remote, 1, 'tampered-revision');
    remote.beforeUpload = async () => { throw Object.assign(new Error('synthetic interruption'), { code: 'unavailable' }); };
    await local.controller.run(true);
    const pending = local.state.outbox.job;
    assert(pending); assert.equal(pending.phase, 'reserved'); assert.equal(remote.files.size, 0);
    const attemptsBeforeTamper = remote.uploadAttempts;
    const pendingBytes = copy(local.state.bytes);
    const altered = local.state;
    altered.outbox.job.rev.id = 'f'.repeat(32); // autre révision valide en forme, octets GCM inchangés
    await local.store.write(altered);
    remote.beforeUpload = null;
    await local.controller.run(true);
    assert.equal(remote.uploadAttempts, attemptsBeforeTamper, 'job.rev altéré doit être refusé avant tout upload');
    assert.equal(remote.files.size, 0, 'aucun paquet portant des métadonnées de révision incohérentes');
    assert.equal(local.state.outbox.blocked, 'integrity', 'job incohérent bloqué sans effacer la file');
    assert.notEqual(local.controller.status.message, 'synchronisé', 'aucun faux succès après reprise');
    assert(local.state.outbox.job, 'file d’attente conservée');
    assert.equal(local.state.outbox.job.fileId, pending.fileId, 'identifiant réservé conservé');
    assert.deepEqual(local.state.bytes, pendingBytes, 'octets chiffrés conservés');
    console.log('✅ reprise : révision durable altérée refusée avant upload, file chiffrée et identifiant conservés');
  }

  {
    const remote = drive(), local = owner(remote, 1, 'intact-resume');
    remote.beforeUpload = async () => { throw Object.assign(new Error('synthetic interruption'), { code: 'unavailable' }); };
    await local.controller.run(true);
    const pending = local.state.outbox.job;
    assert(pending); assert.equal(remote.files.size, 0);
    const resumed = local.restart(); // nouveau contrôleur : aucune poignée de clé en mémoire
    local.vault.mode = 'locked';
    await resumed.run(true);
    assert.equal(remote.uploadAttempts, 1, 'coffre verrouillé : aucun nouvel envoi');
    assert.equal(local.state.outbox.job.fileId, pending.fileId, 'reprise verrouillée conserve l’identifiant');
    assert.notEqual(resumed.status.message, 'synchronisé');
    local.vault.mode = 'vault'; remote.beforeUpload = null;
    await resumed.run(true);
    assert.equal(remote.files.size, 1);
    assert.equal(local.state.outbox.job, null);
    assert.equal(resumed.status.message, 'synchronisé', 'reprise intacte après redérivation du code');
    console.log('✅ reprise intacte : verrouillage conserve la file, puis redérivation et reçu terminent le même ID');
  }

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
  // NOESIS 13.4 : un conflit n'empêche plus de sauvegarder les saisies locales. La tête distante n'est
  // jamais absorbée ; cet appareil publie une tête SŒUR (sans la tête distante comme parent) et les deux
  // versions restent consultables jusqu'au choix explicite.
  const oldHead = [...isolated.files.values()][0].ref.revision.id, oldPhoto = JSON.parse(old.values['twrc.settings.v1']).cars[0].photo;
  await other.controller.run(true); assert(other.controller.status.message.startsWith('conflit')); assert.equal(other.controller.status.state, 'CONFLICT');
  assert(!other.state.base.includes(oldHead), 'tête distante jamais absorbée');
  const sister = [...isolated.files.values()].filter(f => f.ref.revision.id !== oldHead);
  assert.equal(sister.length, 1, 'saisies locales sauvegardées dans une tête séparée'); assert(!sister[0].ref.revision.parents.includes(oldHead));
  const detail = other.controller.status.conflictDetails.find(x => x.path === 'cars.0.photo');
  assert(detail && detail.resolvable && detail.local === 'divergence-sans-date' && detail.remote === oldPhoto && detail.id === oldHead);
  const published = isolated.files.size; other.vault.mode = 'locked'; await other.controller.run(true); assert.equal(isolated.files.size, published);
  console.log('✅ conflit ancien sans date : tête distante jamais absorbée, saisies locales sauvegardées à part, versions consultables, verrouillage respecté');
  other.vault.mode = 'vault';
  assert.throws(() => other.controller.resolve(oldHead, 'cars', 'remote'), /confirmation/, 'chemin non résoluble refusé');
  other.controller.resolve(oldHead, 'cars.0.photo', 'remote'); await other.controller.run(true);
  assert.equal(other.controller.status.conflicts.length, 0); const mergedRev = [...isolated.files.values()].find(f => f.ref.revision.id === other.state.base[0]);
  assert(mergedRev && mergedRev.ref.revision.parents.includes(oldHead), 'tête distante intégrée après choix : parent de la révision de fusion');
  assert.equal(JSON.parse(other.values['twrc.settings.v1']).cars[0].photo, oldPhoto);
  await old.controller.run(true); assert.equal(old.controller.status.conflicts.length, 0);
  assert.equal(JSON.parse(old.values['twrc.settings.v1']).cars[0].photo, oldPhoto);
  console.log('✅ résolution explicite : choix appliqué, tête intégrée, l’autre appareil converge sans nouveau conflit');

  // Horloges divergentes de bout en bout : l'iPhone (horloge +10 min) modifie AVANT le PC.
  {
    const net = drive(), pc = owner(net, 1, 'pc'), tel = owner(net, 1, 'tel');
    const setPressure = (o, value, stamp) => {
      // Horodatages calculés comme dans l'app (SyncMerge.edits), avec l'horloge propre à l'appareil.
      const before = JSON.parse(o.values['twrc.settings.v1']), s = JSON.parse(o.values['twrc.settings.v1']); s.prefs = { ...(s.prefs || {}), pressure: value };
      const st = JSON.parse(JSON.stringify(o.A.SyncMerge.edits(before, s, JSON.parse(o.values['twrc.editstamps.v1'] || '{}'), stamp)));
      o.edit('twrc.settings.v1', JSON.stringify(s)); o.edit('twrc.editstamps.v1', JSON.stringify(st));
    };
    setPressure(pc, 2.4, at); await pc.controller.run(true); await tel.controller.run(true); await pc.controller.run(true);
    assert.equal(JSON.parse(tel.values['twrc.settings.v1']).prefs.pressure, 2.4, 'base commune reçue');
    setPressure(tel, 2.2, at + 10 * 60000); tel.advance(60000); await tel.controller.run(true);
    setPressure(pc, 2.6, at + 5 * 60000); pc.advance(120000); await pc.controller.run(true);
    assert.equal(JSON.parse(pc.values['twrc.settings.v1']).prefs.pressure, 2.6, 'modification la plus récente (PC) jamais écrasée par l’horloge en avance');
    assert.equal(pc.controller.status.state, 'CONFLICT'); assert(pc.controller.status.conflictDetails.some(d => d.path === 'prefs.pressure' && d.local === 2.6 && d.remote === 2.2));
    await tel.controller.run(true); assert.equal(JSON.parse(tel.values['twrc.settings.v1']).prefs.pressure, 2.2, 'l’iPhone garde aussi sa version');
    assert.equal(tel.controller.status.state, 'CONFLICT');
    const rid = pc.controller.status.conflictDetails.find(d => d.path === 'prefs.pressure').id;
    pc.controller.resolve(rid, 'prefs.pressure', 'local'); pc.advance(60000); await pc.controller.run(true); await tel.controller.run(true);
    assert.equal(JSON.parse(tel.values['twrc.settings.v1']).prefs.pressure, 2.6); assert.equal(tel.controller.status.conflicts.length, 0);
    assert.equal(pc.controller.status.conflicts.length, 0);
    console.log('✅ horloge en avance sur l’iPhone : conflit des deux côtés, aucune valeur écrasée, choix explicite puis convergence');
  }

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

  // NOESIS 13.4 : passage en arrière-plan (iPhone) ⇒ envoi anticipé sans attendre la fenêtre de calme,
  // mais sans lever un blocage ni ignorer le délai de reprise après échec.
  {
    const net = drive(), dev = owner(net, 1, 'flush');
    await dev.controller.run(true); const before = net.files.size;
    const s = JSON.parse(dev.values['twrc.settings.v1']); s.cars[0].short = 'saisie-avant-fermeture'; dev.edit('twrc.settings.v1', JSON.stringify(s));
    await dev.controller.run(); assert.equal(net.files.size, before, 'fenêtre de calme : pas encore d’envoi');
    await dev.controller.run(false, true); assert.equal(net.files.size, before + 1, 'arrière-plan : saisie envoyée et relue immédiatement');
    assert.equal(dev.state.outbox.dirtySince, null);
    const s2 = JSON.parse(dev.values['twrc.settings.v1']); s2.cars[0].short = 'pendant-coupure'; dev.edit('twrc.settings.v1', JSON.stringify(s2));
    net.loseReply = true; await dev.controller.run(false, true); const after = net.files.size;
    await dev.controller.run(false, true); assert.equal(net.files.size, after, 'délai de reprise respecté : pas de rafale d’envois au masquage');
    const hint = await dev.A.DriveSync.resumeHint(dev.store);
    assert.deepEqual(JSON.parse(JSON.stringify(hint)), { folder: 'fixtureFolder', binding: 'a'.repeat(64) }, 'indice de reprise sans jeton ni code');
    assert(!JSON.stringify(dev.state).includes('synthetic-runtime-code'), 'aucun code dans l’état de synchronisation');
    console.log('✅ arrière-plan : envoi anticipé de la dernière saisie, délai de reprise après échec respecté');
  }
  await require('./lib/drive-recovery-checks')();

})().catch(e => { console.error(e); process.exitCode = 1; });
