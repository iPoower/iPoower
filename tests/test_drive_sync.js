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
    async syncSnapshot(deviceKey) { this.deviceKeys = [...(this.deviceKeys || []), deviceKey]; return { values: { ...values }, binding: null, signal: null, expiresAt: this.expiresAt }; },
    async syncApply(transform, keep, current, deviceKey) {
      this.deviceKeys = [...(this.deviceKeys || []), deviceKey];
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
  const d = { files, profileFiles, loseReply: false, uploadAttempts: 0, downloads: 0, disconnect() {},
    async reserveId() { return 'file_' + ++n; },
    async profiles() { return [...profileFiles.values()].map(copy); },
    async uploadProfile(fileId, folder, bytes) { const p = { fileId, bytes: copy(bytes), sha256: sha(bytes) }; profileFiles.set(fileId, p); return copy(p); },
    async list() { return [...files.values()].map(f => copy(f.ref)); },
    async download(ref) { d.downloads++; const f = files.get(ref.fileId); return { packet: { copyBytes: () => copy(f.bytes) }, proof: { ...ref, state: 'verified-bytes', verifiedAt: at } }; },
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
  // Contre-expertise A3 : pendant un conflit, une saisie encore dans la fenêtre de calme n'est jamais annoncée « envoyée ».
  { const c2 = JSON.parse(other.values['twrc.context.v1']); c2.debrief.entries.push({ ...c2.debrief.entries[0], key: 'trajet-en-attente' }); other.edit('twrc.context.v1', JSON.stringify(c2)); }   // saisie additive : jamais en conflit
  const sizeBefore = isolated.files.size; await other.controller.run();
  assert.equal(isolated.files.size, sizeBefore); assert(other.controller.status.message.includes('en attente'), other.controller.status.message);
  assert(!other.controller.status.message.includes('envoyées'));
  await other.controller.run(false, true); assert(other.controller.status.message.includes('envoyées'), 'après envoi relu : envoyées');
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

  // NOESIS 13.5 : (1) véhicules = emplacements fixes du préréglage, relus par position (app.js normalize).
  // Une identité de véhicule divergente (préréglage/configuration différents) est ISOLÉE : conflit explicite,
  // aucune donnée perdue, saisies locales toujours sauvegardées ; même configuration ⇒ reprise automatique.
  // (2) relevés saisis le même jour sur les deux appareils : convergence finie (ordre canonique).
  {
    const net = drive(), pc = owner(net, 1, 'cfgpc'), tel = owner(net, 1, 'cfgtel');
    const cars = o => JSON.parse(o.values['twrc.settings.v1']).cars;
    await pc.controller.run(true);
    { const s = JSON.parse(tel.values['twrc.settings.v1']); s.cars = [{ id: 'carX', odo: [{ d: '2026-10-27', km: 777 }], tire: { treads: [] } }]; tel.edit('twrc.settings.v1', JSON.stringify(s)); }
    await tel.controller.run(true);
    assert.equal(tel.controller.status.state, 'CONFLICT'); assert(tel.controller.status.conflicts[0].paths.includes('cars'));
    assert(tel.controller.status.conflictDetails.every(d => d.path !== 'cars' || d.resolvable === false), 'jamais remplacé par un simple choix');
    assert.deepEqual(cars(tel).map(c => c.id), ['carX'], 'liste locale intacte'); assert.equal(cars(tel)[0].odo[0].km, 777, 'historique local intact');
    assert.deepEqual(cars(pc).map(c => c.id), ['carA'], 'l’autre appareil intact');
    const sister = [...net.files.values()].some(f => f.ref.revision.device !== [...net.files.values()][0].ref.revision.device);
    assert(sister, 'saisies de l’appareil divergent sauvegardées dans une tête séparée');
    // Même configuration appliquée sur l'iPhone (mêmes véhicules) : la synchronisation reprend seule.
    { const s = JSON.parse(tel.values['twrc.settings.v1']); s.cars = [{ id: 'carA', odo: [{ d: '2026-10-27', km: 777 }], tire: { treads: [] } }]; tel.edit('twrc.settings.v1', JSON.stringify(s)); }
    for (let i = 0; i < 2; i++) { await tel.controller.run(true); await pc.controller.run(true); }
    assert.equal(tel.controller.status.conflicts.length, 0); assert.equal(pc.controller.status.conflicts.length, 0);
    assert(cars(pc)[0].odo.some(r => r.km === 777), 'relevé de l’iPhone reçu par le PC après alignement');
    console.log('✅ véhicule d’identité divergente : isolé (conflit explicite, rien perdu, saisies sauvegardées), reprise automatique après alignement');
    // Relevés le même jour des deux côtés : plus de publication sans fin.
    const add = (o, r, t) => { const s = JSON.parse(o.values['twrc.settings.v1']); s.cars[0].odo.push(r.odo); s.cars[0].tire.treads.push(r.tread); o.edit('twrc.settings.v1', JSON.stringify(s)); };
    add(pc, { odo: { d: '2026-10-28', km: 1001 }, tread: { d: '2026-10-28', mm: 6.1, ax: 'av' } }); add(tel, { odo: { d: '2026-10-28', km: 1002 }, tread: { d: '2026-10-28', mm: 6.4, ax: 'av' } });
    pc.advance(60000); tel.advance(60000);
    const sizes = [];
    for (let i = 0; i < 5; i++) { await pc.controller.run(true); await tel.controller.run(true); sizes.push(net.files.size); }
    assert.equal(sizes.at(-1), sizes.at(-2), 'convergence finie, publications : ' + sizes.join(','));
    assert.deepEqual(cars(pc)[0].tire.treads, cars(tel)[0].tire.treads); assert.deepEqual(cars(pc)[0].odo, cars(tel)[0].odo);
    assert.equal(cars(pc)[0].tire.treads.length, 2); assert.equal(cars(pc)[0].odo.filter(r => r.d === '2026-10-28').length, 2);
    console.log('✅ relevés du même jour sur les deux appareils : tous conservés, ordre identique, convergence finie');
  }
  // Phase A · PR 2 : les copies rc-<sha>.json sont immuables. Un passage ne télécharge que les révisions
  // nouvelles (et l'ancêtre commun si la fusion l'exige), jamais tout le dossier (constat du 30/10/2026 : > 170 appels).
  {
    const net = drive(), pc = owner(net, 3, 'incr-pc'), phone = owner(net, 2, 'incr-iphone');
    const stamped = (o, fn) => { const M = o.A.SyncMerge, prev = JSON.parse(o.values[M.SETTINGS]), next = structuredClone(prev); fn(next);
      o.advance(1000); o.edit(M.STAMPS, JSON.stringify(M.edits(prev, next, JSON.parse(o.values[M.STAMPS] || '{}'), at + 864e5 + net.files.size * 1000))); o.edit(M.SETTINGS, JSON.stringify(next)); };
    await pc.controller.run(true); await phone.controller.run(true);
    for (let i = 0; i < 12; i++) {
      const o = i % 2 ? phone : pc, other = i % 2 ? pc : phone;
      stamped(o, x => { x.cars[0].short = 'v' + i; }); await o.controller.run(true); await other.controller.run(true);
    }
    await pc.controller.run(true); await phone.controller.run(true);
    assert(net.files.size >= 12, 'historique de plus de 12 copies');
    assert.equal(JSON.parse(pc.values['twrc.settings.v1']).cars[0].short, 'v11');
    let before = net.downloads;
    for (let i = 0; i < 5; i++) { pc.advance(31e3); await pc.controller.run(); }
    assert.equal(net.downloads - before, 0, 'passage sans nouveauté : aucun téléchargement, quel que soit le nombre de copies');
    assert.equal(pc.controller.status.message, 'synchronisé');
    const restarted = pc.restart(); before = net.downloads; pc.advance(31e3); await restarted.run();
    assert.equal(net.downloads - before, 0, 'mémoire des révisions vérifiées conservée après redémarrage');
    stamped(phone, x => { x.cars[0].short = 'nouveau'; }); await phone.controller.run(true);
    before = net.downloads; pc.advance(31e3); await restarted.run();
    assert(net.downloads - before <= 2, 'nouvelle révision : la tête et au plus son ancêtre commun (' + (net.downloads - before) + ')');
    assert.equal(JSON.parse(pc.values['twrc.settings.v1']).cars[0].short, 'nouveau', 'nouveauté intégrée');
    // Une entrée mémorisée qui ne correspond plus au catalogue n'est jamais crue : nouveau téléchargement authentifié.
    const st = pc.state, k = Object.keys(st.known)[0]; st.known[k].sha = 'f'.repeat(64); await pc.store.write(st);
    before = net.downloads; pc.advance(31e3); await restarted.run();
    assert.equal(net.downloads - before, 1, 'empreinte divergente : révision relue et authentifiée');
    assert.equal(restarted.status.message, 'synchronisé');
    console.log('✅ téléchargement incrémental : 0 téléchargement au repos (' + net.files.size + ' copies), nouveauté = tête + ancêtre au plus, mémoire non crue sans empreinte identique');
  }
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
  {
    // Recette NOESIS 13.6 : chaque blocage affiche son vrai motif, jamais « stockage local non confirmé » par défaut.
    const net = drive(), noSettings = owner(net, 1, 'sans-reglage');
    noSettings.edit('twrc.settings.v1', undefined);
    await noSettings.controller.run(true);
    assert.equal(noSettings.controller.status.message, 'enregistre d’abord un réglage sur cet appareil, puis réessaie');
    assert.equal(net.files.size, 0, 'aucun envoi sans réglage enregistré');
    const notExported = owner(drive(), 1, 'sans-export');
    notExported.vault.syncSnapshot = async () => { throw Object.assign(new Error('Exporte et vérifie une copie avant d’activer la synchronisation.'), { code: 'export' }); };
    await notExported.controller.run(true);
    assert.equal(notExported.controller.status.message, 'copie complète à exporter d’abord (Réglages → Sauvegarde → Exporter)');
    const bug = owner(drive(), 1, 'imprevu');
    bug.vault.syncSnapshot = async () => { throw new TypeError('imprévu'); };
    await bug.controller.run(true);
    assert.equal(bug.controller.status.message, 'erreur inattendue : données locales conservées, réessaie');
    const disk = owner(drive(), 1, 'disque');
    disk.vault.syncSnapshot = async () => { throw new Error('stockage'); };
    await disk.controller.run(true);
    assert.equal(disk.controller.status.message, 'stockage local non confirmé', 'un vrai échec IndexedDB garde son libellé');
    console.log('✅ motifs de blocage explicites : export, réglage, erreur inattendue, stockage');
  }
  // Constat C : la synchro désigne au coffre ses clés propres à l'appareil (SyncMerge.device), pour qu'une
  // écriture de position, de cache ou d'agenda chiffré ne bloque ni l'instantané ni la fusion.
  {
    const net = drive(), a = owner(net, 2, 'predicat-a'), b = owner(net, 2, 'predicat-b');
    await a.controller.run(true); await b.controller.run(true);
    const keys = [...a.vault.deviceKeys, ...b.vault.deviceKeys];
    assert(keys.length >= 4 && keys.every(k => typeof k === 'function'), 'chaque instantané et chaque fusion reçoivent le prédicat');
    assert(keys.every(k => k('twrc.gps') && k('twrc.calendar.sealed.v1') && k('twrc.cache.home') && !k('twrc.settings.v1') && !k('twrc.context.v1')),
      'position, agenda chiffré et caches seulement ; jamais les réglages ni le journal');
    console.log('✅ constat C : instantanés et fusions reçoivent SyncMerge.device (' + keys.length + ' appels)');
  }
  // Constat du 30/10/2026 (PC + iPhone) : jamais « synchronisé », une copie à chaque cycle. Une écriture
  // propre à l'appareil (cache météo, position) en cours d'enregistrement ne doit produire ni envoi ni copie.
  {
    const net = drive(), pc = owner(net, 3, 'boucle'), phone = owner(net, 2, 'boucle-iphone');
    await pc.controller.run(true); await phone.controller.run(true); await pc.controller.run(true);
    const before = net.files.size;
    for (let i = 0; i < 10; i++) {
      pc.edit('twrc.cache.home', JSON.stringify({ t: i })); pc.vault.pendingWrites = true;   // hors synchro, écriture en cours
      pc.advance(31e3); await pc.controller.run();
      phone.advance(31e3); await phone.controller.run();
    }
    assert.equal(net.files.size, before, '10 passages sans saisie synchronisée : aucune nouvelle copie');
    // Contre-épreuve : une vraie saisie, même pendant une écriture en cours, part une fois et une seule.
    // Saisie horodatée comme dans l'app (markEdit) : un écart sans date resterait un conflit à arbitrer.
    const M = pc.A.SyncMerge, prev = JSON.parse(pc.values[M.SETTINGS]), s = structuredClone(prev); s.cars[0].short = 'saisie-reelle';
    pc.edit(M.STAMPS, JSON.stringify(M.edits(prev, s, JSON.parse(pc.values[M.STAMPS] || '{}'), at + 3600e3))); pc.edit(M.SETTINGS, JSON.stringify(s));
    for (let i = 0; i < 3; i++) { pc.advance(31e3); await pc.controller.run(); }
    assert.equal(net.files.size, before + 1, 'la saisie synchronisée est envoyée une seule fois');
    phone.advance(31e3); await phone.controller.run();
    assert.equal(JSON.parse(phone.values['twrc.settings.v1']).cars[0].short, 'saisie-reelle', 'l’autre appareil la reçoit');
    pc.vault.pendingWrites = false; pc.advance(31e3); await pc.controller.run();
    assert.equal(pc.controller.status.message, 'synchronisé', 'statut vert une fois l’écriture locale terminée');
    assert.equal(net.files.size, before + 1);
    console.log('✅ écriture locale hors synchro en cours : 0 copie sur 10 passages, vraie saisie envoyée une fois, puis synchronisé');
  }
  await require('./lib/drive-recovery-checks')();

})().catch(e => { console.error(e); process.exitCode = 1; });
