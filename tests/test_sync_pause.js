'use strict';
// Pause Drive après réinitialisation (décision du propriétaire) : le VRAI raccord, les vrais codecs, la vraie
// fusion ; seuls réseau, horloge et stockage sont simulés. Le transport compte chaque appel d'écriture.
// Exigences : pause ⇒ 0 écriture (même après rechargement et nouvelle saisie, même si la pause arrive pendant
// un passage) ; « Récupérer » ⇒ réglages identiques à l'octet à la version Drive, journal intact, aucune
// écriture ; « Remplacer » ⇒ envoi seulement après la levée de la pause, puis synchro normale.
// Contre-tests : pause ignorée, ou point d'arrêt d'écriture retiré ⇒ ces scénarios échouent.
// Données fictives uniquement (Lieu A → Lieu B, voiture fictive).
const path = require('node:path'), fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const files = ['journal-archive', 'debrief', 'sync-merge', 'sync-revisions', 'sync-outbox', 'sync-key', 'control-vault-packet', 'drive-transport', 'drive-sync'];
const read = n => fs.readFileSync(path.resolve(__dirname, '../src/' + n + '.js'), 'utf8');
const ORIGINAL = read('drive-sync');
const copy = v => structuredClone(v), sha = v => createHash('sha256').update(v).digest('hex');
const pass = 'code-fictif-pause-1234', at = Date.parse('2026-10-23T08:00:00.000Z'), PAUSE = 'twrc.sync.paused.v1';
const SETTINGS_A = JSON.stringify({ cars: [{ id: 'carA', name: 'Voiture fictive', odo: [], tire: { treads: [] } }], locs: [{ id: 'home', name: 'Lieu A' }, { id: 'work', name: 'Lieu B' }], edits: {}, calib: [{ t: '2026-10-01T07:00', loc: 'home', Tr: 2 }], journal: {}, horizon: 24 });
const SETTINGS_RESET = JSON.stringify({ cars: [{ id: 'carA', name: 'Voiture 1', odo: [], tire: { treads: [] } }], locs: [{ id: 'home', name: 'Lieu principal' }], edits: {}, calib: [], journal: {}, horizon: 12 });
function lock() { let chain = Promise.resolve(); return { request(name, options, fn) { if (typeof options === 'function') fn = options; const p = chain.then(() => fn({ name })); chain = p.catch(() => {}); return p; } }; }
function owner(network, label, driveSource = ORIGINAL) {
  let time = at, state = null, values;
  const c = { crypto: webcrypto, navigator: { locks: lock(), onLine: true }, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, URL, btoa, atob, console };
  vm.createContext(c);
  vm.runInContext(files.map(n => n === 'drive-sync' ? driveSource : read(n)).join('\n') + ';this.api={DriveSync,SyncMerge,JournalArchive};', c);
  const A = c.api;
  const entries = [0, 1, 2].map(i => ({ key: label + '-' + i, at: at - i * 864e5, how: 'confirmé', name: 'Lieu A → Lieu B', from: 'Lieu A', to: 'Lieu B', start: null, end: null, feedback: i ? null : { at, conditions: ['rain'], grip: 'normal' }, deferred: false }));
  values = { 'twrc.key': pass, 'twrc.settings.v1': SETTINGS_A, 'twrc.context.v1': JSON.stringify({ v: 1, debrief: { active: null, entries }, done: {} }) };
  values[A.JournalArchive.KEY] = JSON.stringify(A.JournalArchive.capture(values));
  const vault = { mode: 'vault', expiresAt: at + 7 * 864e5, expired: () => false, onSnapshot: null,
    async syncSnapshot() { if (this.onSnapshot) this.onSnapshot(); return { values: { ...values }, binding: null, signal: null, expiresAt: this.expiresAt }; },
    async syncApply(transform, keep, current) {
      const next = transform({ ...values });
      if (JSON.stringify(next) !== JSON.stringify(values)) { await keep(new TextEncoder().encode('copie-locale-chiffree')); if (!current()) throw new Error('locked'); values = next; }
    } };
  const store = { read: async () => copy(state), write: async s => { state = copy(s); }, recovery: async b => sha(b) };
  const make = () => { const x = A.DriveSync.create({ vault, provider: network, store, keys: {}, locks: c.navigator.locks, crypto: webcrypto, now: () => time, version: () => 'prod-999' }); x.select({ folder: 'dossierFictif', binding: 'a'.repeat(64) }); return x; };
  return { A, vault, controller: make(), restart: make, get values() { return copy(values); }, get state() { return copy(state); },
    edit(k, v) { if (v === undefined) delete values[k]; else values[k] = v; }, advance(n) { time += n; } };
}
function drive() {
  const files = new Map(), profileFiles = new Map(); let n = 0;
  const d = { files, profileFiles, writes: 0, lists: 0, beforeList: null, loseReply: false, disconnect() {},
    async reserveId() { if (d.failReserve) { d.failReserve = false; throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); } d.writes++; return 'file_' + ++n; },
    async profiles() { return [...profileFiles.values()].map(copy); },
    async uploadProfile(fileId, folder, bytes) { d.writes++; const p = { fileId, bytes: copy(bytes), sha256: sha(bytes) }; profileFiles.set(fileId, p); return copy(p); },
    async list() { d.lists++; if (d.beforeList) await d.beforeList(); return [...files.values()].map(f => copy(f.ref)); },
    async download(ref) { const f = files.get(ref.fileId); return { packet: { copyBytes: () => copy(f.bytes) }, proof: { ...ref, state: 'verified-bytes', verifiedAt: at } }; },
    async uploadRevision(fileId, folder, packet, rev) {
      d.writes++;
      const bytes = packet.copyBytes();
      if (!files.has(fileId)) files.set(fileId, { bytes, ref: { fileId, fileSha256: sha(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: copy(rev), state: 'unverified' } });
      if (d.loseReply) { d.loseReply = false; throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); }
      return d.download(files.get(fileId).ref);
    } };
  return d;
}
const records = o => [...o.A.JournalArchive.capture(o.values).records].sort();
const pauseMark = () => JSON.stringify({ v: 1, at, why: 'reset' });
// Réinitialisation telle que l'app l'écrit : pause d'abord, puis réglages par défaut. Le journal n'est pas touché.
const reset = o => { o.edit(PAUSE, pauseMark()); o.edit('twrc.settings.v1', SETTINGS_RESET); };
let n = 0; const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };

async function pauseScenario(source) {
  const d = drive(), pc = owner(d, 'pc', source);
  await pc.controller.run(true); assert.equal(d.files.size, 1, 'publication initiale');
  const journal = records(pc), w0 = d.writes, l0 = d.lists;
  reset(pc); pc.advance(60000);
  await pc.controller.run(true); await pc.controller.run(false, true);
  assert.equal(d.writes, w0, 'aucune écriture Drive pendant la pause'); assert.equal(d.lists, l0, 'aucun accès réseau pendant la pause');
  assert.equal(pc.controller.status.state, 'PAUSED'); assert.match(pc.controller.status.message, /pause/);
  // nouvelle saisie pendant la pause, puis « rechargement » (nouveau contrôleur, même stockage)
  const s = JSON.parse(pc.values['twrc.settings.v1']); s.horizon = 6; pc.edit('twrc.settings.v1', JSON.stringify(s)); pc.advance(60000);
  await pc.controller.run(true);
  const reloaded = pc.restart(); await reloaded.run(true); await reloaded.run(false, true);
  assert.equal(d.writes, w0, 'aucune écriture après nouvelle saisie ni rechargement'); assert.equal(d.files.size, 1);
  assert.deepEqual(records(pc), journal, 'journal intact pendant la pause');
  return true;
}
// La pause arrive PENDANT un passage (après le contrôle d'entrée) avec un envoi en attente : le point d'arrêt
// d'écriture relit le coffre et refuse toute réservation et tout envoi.
async function gateScenario(source) {
  const d = drive(), pc = owner(d, 'gate', source);
  d.loseReply = true; await pc.controller.run(true);              // envoi en attente (réponse perdue)
  assert(pc.state.outbox.job, 'envoi en attente');
  const w0 = d.writes;
  d.beforeList = async () => { d.beforeList = null; reset(pc); }; // réinitialisation pendant le passage
  await pc.controller.run(true);
  assert.equal(d.writes, w0, 'point d’arrêt : aucune écriture une fois la pause posée');
  assert.equal(pc.controller.status.state, 'PAUSED');
  assert(pc.state.outbox.job, 'file conservée, aucun échec enregistré'); assert.equal(pc.state.outbox.blocked, null);
  // passage interrompu avant scellement : jamais de paquet contenant la réinitialisation
  const d2 = drive(), tel = owner(d2, 'seal', source);
  await tel.controller.run(true); const w1 = d2.writes;
  d2.beforeList = async () => { d2.beforeList = null; reset(tel); };
  { const t = JSON.parse(tel.values['twrc.settings.v1']); t.horizon = 6; tel.edit('twrc.settings.v1', JSON.stringify(t)); }   // saisie à envoyer
  tel.advance(60000); await tel.controller.run(true);
  assert.equal(d2.writes, w1); assert.equal(tel.state.outbox.job, null, 'aucun envoi scellé contenant la réinitialisation');
  // envoi scellé mais pas encore réservé : la réservation elle-même est refusée pendant la pause
  const d3 = drive(), ipad = owner(d3, 'reserve', source);
  await ipad.controller.run(true); const s3 = JSON.parse(ipad.values['twrc.settings.v1']); s3.horizon = 6; ipad.edit('twrc.settings.v1', JSON.stringify(s3)); ipad.advance(60000);
  d3.failReserve = true; await ipad.controller.run(true); assert.equal(ipad.state.outbox.job.phase, 'sealed');
  const w3 = d3.writes; d3.beforeList = async () => { d3.beforeList = null; reset(ipad); }; ipad.advance(600000);
  await ipad.controller.run(true); assert.equal(d3.writes, w3, 'aucune réservation pendant la pause'); assert.equal(ipad.state.outbox.job.phase, 'sealed');
  return true;
}
(async () => {
  await check('pause : 0 écriture Drive et 0 accès réseau après réinitialisation, après nouvelle saisie et après rechargement', () => pauseScenario(ORIGINAL));
  await check('point d’arrêt unique : pause posée pendant un passage, envoi en attente ⇒ aucune réservation ni envoi, rien de scellé', () => gateScenario(ORIGINAL));

  await check('« Récupérer » : lecture seule, réglages identiques à l’octet à la version Drive, journal intact, puis synchro normale', async () => {
    const d = drive(), pc = owner(d, 'recup'), tel = owner(d, 'recup-tel');
    await pc.controller.run(true); await tel.controller.run(true);
    // l'autre appareil modifie un réglage horodaté : la dernière version Drive n'est pas l'ancienne copie locale
    const s = JSON.parse(tel.values['twrc.settings.v1']); s.horizon = 6; tel.edit('twrc.settings.v1', JSON.stringify(s));
    tel.edit('twrc.editstamps.v1', JSON.stringify({ horizon: at + 1000 })); tel.advance(60000); await tel.controller.run(true);
    const head = [...d.files.values()].find(f => !f.ref.revision.parents.length || f.ref.revision.device !== pc.state.device && f.ref.revision.parents.length);
    assert(head);
    const journal = records(pc); reset(pc); const w0 = d.writes;
    await pc.controller.run(true); assert.equal(d.writes, w0);
    const r = await pc.controller.adopt();
    assert.equal(d.writes, w0, 'récupération sans aucune écriture Drive');
    assert.equal(pc.values['twrc.settings.v1'], tel.values['twrc.settings.v1'], 'réglages identiques à l’octet à la version Drive');
    assert.equal(r.settings, pc.values['twrc.settings.v1']);
    assert.equal(pc.values['twrc.editstamps.v1'], tel.values['twrc.editstamps.v1']);
    assert(journal.every(x => records(pc).includes(x)), 'journal des trajets intact (union, rien retiré)');
    assert.equal(pc.values[PAUSE], pauseMark(), 'la pause reste tant que l’app ne l’a pas levée');
    pc.edit(PAUSE, undefined); pc.advance(60000); await pc.controller.run(true);
    assert.equal(pc.controller.status.conflicts.length, 0, 'aucun conflit après récupération');
    assert.equal(pc.values['twrc.settings.v1'], tel.values['twrc.settings.v1']);
    await tel.controller.run(true); assert.equal(tel.controller.status.conflicts.length, 0, 'aucun conflit sur l’autre appareil');
    assert.equal(JSON.parse(tel.values['twrc.settings.v1']).horizon, 6, 'l’autre appareil garde ses réglages');
  });

  await check('« Remplacer » : aucun envoi avant la levée de la pause, envoi après, puis synchro normale ; journal intact', async () => {
    const d = drive(), pc = owner(d, 'remplace');
    await pc.controller.run(true); const journal = records(pc); reset(pc); pc.advance(60000);
    const w0 = d.writes; await pc.controller.run(true); assert.equal(d.writes, w0, 'aucun envoi avant le choix');
    pc.edit(PAUSE, undefined); await pc.controller.run(true);            // REMPLACER saisi : l'app lève la pause
    assert(d.writes > w0, 'envoi effectué après le choix'); assert.equal(pc.controller.status.message, 'synchronisé');
    const last = [...d.files.values()].at(-1), opened = pc.controller.status;
    assert.equal(d.files.size, 2); assert(opened);
    const s = JSON.parse(pc.values['twrc.settings.v1']); s.horizon = 6; pc.edit('twrc.settings.v1', JSON.stringify(s)); pc.advance(60000);
    const w1 = d.writes; await pc.controller.run(true); assert(d.writes > w1, 'la synchro reprend normalement'); assert.equal(d.files.size, 3);
    assert.deepEqual(records(pc), journal, 'journal intact'); assert(last.ref.revision.parents.length === 1);
  });

  await check('marqueur de pause propre à l’appareil : jamais dans un paquet Drive', async () => {
    const d = drive(), pc = owner(d, 'marque');
    assert.equal(pc.A.SyncMerge.device(PAUSE), true); assert.equal(pc.A.DriveSync.PAUSE, PAUSE);
    pc.edit(PAUSE, pauseMark()); assert.equal(pc.A.DriveSync.projection(pc.values)[PAUSE], undefined);
  });

  // Contre-tests : chaque mutation doit faire échouer au moins un des scénarios ci-dessus.
  const mutations = [
    ['pause ignorée (marqueur jamais lu)', 'const pausedIn = values => !!values && values[PAUSE] != null;', 'const pausedIn = values => false;', pauseScenario],
    ['contrôle d’entrée retiré', 'if (pausedIn(snap.values)) { paused = true; message = PAUSED_MESSAGE; return; }\n      paused = false;', 'paused = false;', pauseScenario],
    ['point d’arrêt d’écriture retiré (envoi)', 'uploadRevision: async (...a) => { await writable(); return', 'uploadRevision: async (...a) => { return', gateScenario],
    ['point d’arrêt d’écriture retiré (réservation)', 'reserveId: async () => { await writable(); return', 'reserveId: async () => { return', gateScenario],
    ['scellement malgré la pause', "if (pausedIn(snap.values)) { paused = true; message = PAUSED_MESSAGE; await save(s); return; }", '', gateScenario],
  ];
  let killed = 0;
  for (const [name, from, to, scenario] of mutations) {
    assert(ORIGINAL.includes(from), 'mutation inapplicable : ' + name);
    let failed = false; try { await scenario(ORIGINAL.replace(from, to)); } catch { failed = true; }
    assert.equal(failed, true, 'contre-test non détecté : ' + name); killed++;
  }
  console.log(`✅ ${killed}/${mutations.length} mutations rejetées (contre-tests)`);
  console.log(`\n✅ ${n} contrôles de pause Drive après réinitialisation`);
})().catch(e => { console.error('❌ ' + (e && e.stack || e)); process.exit(1); });
