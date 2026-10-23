'use strict';
// Lot D3 : file d'envoi local d'abord, regroupement, transferts séquentiels, reprise après coupure,
// reconnexion visible et statut « synchronisé » seulement après relecture. Vrais codec, clé et révisions ;
// fournisseur simulé avec pannes injectées. Données fictives uniquement.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const read = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const names = ['journal-archive.js', 'debrief.js', 'calendar-origin.js', 'backup.js', 'config-import.js', 'control-vault-packet.js', 'sync-key.js', 'sync-merge.js', 'sync-revisions.js', 'sync-outbox.js'];
const ctx = { Date, JSON, Math, Number, Object, Array, RegExp, Set, Map, String, Uint8Array, TextEncoder, TextDecoder, atob, btoa, crypto: webcrypto, Promise, Error };
vm.createContext(ctx);
vm.runInContext(names.map(read).join('\n') + ';this.X={ P:ControlVaultPacket, K:SyncKey, M:SyncMerge, R:SyncRevisions, O:SyncOutbox, J:JournalArchive };', ctx);
const { P, K, M, R, O, J } = ctx.X;
const json = v => JSON.parse(JSON.stringify(v)), sha = b => createHash('sha256').update(b).digest('hex');
const codec = P.create({ validateBusiness: d => { R.content(d, M.device); return true; } });
let n = 0;
const check = async (name, fn) => { await fn(); n++; console.log('✅ ' + name); };
const at = '2026-10-22T08:00:00.000Z', T0 = Date.parse(at), code = 'synthetic-outbox-code';
const trip = key => ({ key, at: T0, how: 'confirmé', name: 'Trajet fictif', from: 'Lieu A', to: 'Lieu B', start: null, end: null, feedback: null, deferred: false });
const hex = () => [...webcrypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');

// Fournisseur simulé : fichiers immuables, pannes à la demande, compteur de transferts simultanés.
function provider() {
  const p = { files: new Map(), fault: null, corruptOnce: false, inflight: 0, maxInflight: 0, calls: 0 };
  const gate = name => { p.calls++; const f = p.fault; if (f && f.at === name) { if (f.once) p.fault = null; throw Object.assign(new Error(f.kind), { kind: f.kind }); } };
  p.reserve = async () => { gate('reserve'); return 'f' + hex(); };
  p.upload = async (id, bytes) => {
    p.inflight++; p.maxInflight = Math.max(p.maxInflight, p.inflight);
    try {
      gate('upload');
      if (p.files.has(id)) { if (sha(p.files.get(id)) !== sha(bytes)) throw Object.assign(new Error('collision'), { kind: 'network' }); }
      else p.files.set(id, Uint8Array.from(bytes));
      gate('ack');                                        // coupure APRÈS écriture, avant accusé
    } finally { p.inflight--; }
  };
  p.download = async id => {
    gate('download');
    const b = Uint8Array.from(p.files.get(id));
    if (p.corruptOnce) { p.corruptOnce = false; b[b.length - 3] ^= 1; }
    return b;
  };
  return p;
}
// Appareil : données locales (toujours écrites d'abord), état de file JSON + octets en attente « persistés ».
function device(drive, handle) {
  const values = { 'twrc.settings.v1': JSON.stringify({ v: 1, cars: [], calib: [], journal: {}, edits: {} }),
    'twrc.context.v1': JSON.stringify({ v: 1, debrief: { active: null, entries: [] }, done: {} }) };
  values[J.KEY] = JSON.stringify(J.capture(values));
  const d = { id: hex(), seq: 0, base: [], values, disk: { state: JSON.stringify(O.initial()), bytes: null }, handle, drive };
  d.edit = (key, now) => {           // local d'abord : aucune dépendance au réseau ni à la file
    const c = JSON.parse(d.values['twrc.context.v1']); c.debrief.entries.push(trip(key));
    d.values['twrc.context.v1'] = JSON.stringify(c); d.values[J.KEY] = JSON.stringify(J.capture(d.values));
    d.disk.state = JSON.stringify(O.noteChange(JSON.parse(d.disk.state), now));
  };
  // Verrou exclusif de l'appelant (navigator.locks dans l'application) : une seule étape à la fois, tous onglets.
  let chain = Promise.resolve();
  d.step = now => { const run = chain.then(() => d.stepLocked(now)); chain = run.catch(() => {}); return run; };
  d.stepLocked = async now => {
    let s = JSON.parse(d.disk.state);
    const save = x => { s = x; d.disk.state = JSON.stringify(x); };
    const action = O.next(s, now);
    if (action === 'seal') {
      const rev = R.next({ device: d.id, seq: d.seq, parents: d.base }, webcrypto);
      const bytes = await codec.sealWith(json(R.snapshot(d.values, rev, M.device, at)), d.handle, 'prod-156', at);
      d.disk.bytes = Array.from(bytes);                // octets CHIFFRÉS conservés avant tout réseau
      d.seq = rev.seq;
      save(O.sealed(s, { rev: json(rev), sha: sha(bytes), size: bytes.length }, now));
    }
    if (!['seal', 'resume'].includes(O.next(s, now))) return action;
    try {
      if (s.job.phase === 'sealed') save(O.reserved(s, await d.drive.reserve()));
      if (s.job.phase === 'reserved' || s.job.phase === 'sent') { await d.drive.upload(s.job.fileId, Uint8Array.from(d.disk.bytes)); save(O.sent(s)); }
      const id = s.job.fileId, revId = s.job.rev.id;
      save(O.verified(s, id, sha(await d.drive.download(id)), now));
      if (!s.job) { d.base = [revId]; d.disk.bytes = null; }
    } catch (e) { save(O.failed(s, e.kind || 'network', now)); }
    return action;
  };
  d.restart = () => Object.assign(device(d.drive, d.handle), { id: d.id, seq: d.seq, base: d.base, values: d.values, disk: { ...d.disk } });
  d.status = c => json(O.status(JSON.parse(d.disk.state), c));
  return d;
}
const trips = async (bytes, handle) => json(J.capture((await codec.openWith(bytes, handle, 'prod-156')).values).records).map(r => JSON.parse(r).key).sort();
(async () => {
  const { handle } = await K.create(code, webcrypto, at);
  await check('regroupement : douze saisies rapprochées → un seul envoi, puis forçage à 10 min en saisie continue', async () => {
    const drive = provider(), d = device(drive, handle);
    for (let i = 0; i < 12; i++) { d.edit('t' + i, T0 + i * 1500); await d.step(T0 + i * 1500); }
    assert.equal(drive.files.size, 0);
    await d.step(T0 + 11 * 1500 + O.QUIET_MS);
    assert.equal(drive.files.size, 1); assert.equal(d.status().label, 'synchronisé');
    const e = device(provider(), handle);
    for (let t = 0; t <= O.MAX_WAIT_MS; t += 10000) { e.edit('c' + t, T0 + t); await e.step(T0 + t); }
    assert.equal(e.drive.files.size, 1);
  });
  await check('hors ligne : Race Control reste utilisable, rien n’est perdu, jamais « synchronisé » avant relecture', async () => {
    const drive = provider(), d = device(drive, handle);
    drive.fault = { at: 'reserve', kind: 'offline' };
    let t = T0;
    for (let i = 0; i < 5; i++) { d.edit('off' + i, t); t += O.QUIET_MS; await d.step(t); assert.notEqual(d.status().label, 'synchronisé'); }
    assert.equal(drive.files.size, 0); assert(d.status().attempts >= 1);
    assert.equal(json(J.capture(d.values).records).length, 5);   // données locales intactes et complètes
    drive.fault = null;
    for (let i = 0; i < 6 && !d.status().synced; i++) { t += 900000; await d.step(t); await d.step(t); }
    assert.equal(d.status().label, 'synchronisé');
    const last = [...drive.files.values()].pop();
    assert.deepEqual(await trips(last, handle), ['off0', 'off1', 'off2', 'off3', 'off4']);
  });
  await check('coupure à chaque étape puis redémarrage : même fichier repris, aucun doublon, aucune perte', async () => {
    for (const at_ of ['reserve', 'upload', 'ack', 'download']) {
      const drive = provider(); let d = device(drive, handle);
      d.edit('x-' + at_, T0); drive.fault = { at: at_, kind: 'interrupted', once: true };
      await d.step(T0 + O.QUIET_MS);
      const reservedId = JSON.parse(d.disk.state).job && JSON.parse(d.disk.state).job.fileId;
      d = d.restart();                                            // fermeture complète : seul le disque survit
      for (let k = 0; k < 6 && !d.status().synced; k++) await d.step(T0 + O.QUIET_MS + 900000 * (k + 1));
      assert.equal(d.status().label, 'synchronisé', at_);
      assert.equal(drive.files.size, 1, 'un seul fichier pour ' + at_);
      if (reservedId) assert(drive.files.has(reservedId), 'identifiant réservé réutilisé pour ' + at_);
      assert.deepEqual(await trips([...drive.files.values()][0], handle), ['x-' + at_]);
    }
  });
  await check('transferts séquentiels : jamais deux envois simultanés, saisie pendant le scellement conservée', async () => {
    const drive = provider(), d = device(drive, handle);
    d.edit('a', T0); const s = O.sealed(JSON.parse(d.disk.state), { rev: { id: hex(), parents: [], device: d.id, seq: 1 }, sha: '0'.repeat(64), size: 1 }, T0);
    assert.throws(() => O.sealed(s, { rev: { id: hex(), parents: [], device: d.id, seq: 2 }, sha: '1'.repeat(64), size: 1 }, T0), e => e.code === 'OUTBOX_BUSY');
    const later = O.sealed(O.noteChange(O.noteChange(O.initial(), T0), T0 + 5), { rev: { id: hex(), parents: [], device: d.id, seq: 1 }, sha: '2'.repeat(64), size: 1 }, T0 + 1);
    assert.notEqual(json(later).dirtySince, null);              // saisie postérieure au scellement : reste à envoyer
    const p = provider(), e = device(p, handle);
    for (let i = 0; i < 4; i++) { e.edit('s' + i, T0 + i * O.QUIET_MS * 2); await Promise.all([e.step(T0 + (i * 2 + 1) * O.QUIET_MS), e.step(T0 + (i * 2 + 1) * O.QUIET_MS)]); }
    assert.equal(p.maxInflight, 1); assert.equal(p.files.size, 4);   // deux déclenchements simultanés : un seul envoi chacun
  });
  await check('session Google expirée : « reconnexion » visible, aucune tentative silencieuse, reprise après action', async () => {
    const drive = provider(), d = device(drive, handle);
    drive.fault = { at: 'upload', kind: 'auth' };
    d.edit('r1', T0); await d.step(T0 + O.QUIET_MS);
    assert.equal(d.status().label, 'reconnexion');
    const calls = drive.calls; d.edit('r2', T0 + 60000);
    for (let t = 1; t < 5; t++) await d.step(T0 + t * 3600000);
    assert.equal(drive.calls, calls); assert.equal(d.status().label, 'reconnexion');
    drive.fault = null;
    d.disk.state = JSON.stringify(O.unblock(JSON.parse(d.disk.state), T0 + 5 * 3600000));
    await d.step(T0 + 5 * 3600000); await d.step(T0 + 5 * 3600000 + O.QUIET_MS);
    assert.equal(d.status().label, 'synchronisé');
    assert.deepEqual(await trips([...drive.files.values()].pop(), handle), ['r1', 'r2']);
    for (const k of ['code', 'quota', 'conflict']) assert.equal(json(O.status(O.failed(O.initial(), k, T0))).label, { code: 'code', quota: 'espace', conflict: 'conflit' }[k]);
  });
  await check('octets divergents : SYNC_BLOCKED, même identifiant conservé, aucune duplication automatique', async () => {
    const drive = provider(), d = device(drive, handle);
    drive.corruptOnce = true; d.edit('c1', T0); await d.step(T0 + O.QUIET_MS);
    const reserved = [...drive.files.keys()][0], pending = JSON.parse(d.disk.state).job;
    assert.equal(d.status().label, 'intégrité'); assert.equal(d.status().state, 'SYNC_BLOCKED');
    assert.equal(pending.fileId, reserved); assert.equal(drive.files.size, 1);
    const calls = drive.calls;
    await d.step(T0 + O.QUIET_MS + 60000);
    assert.equal(drive.calls, calls); assert.equal(drive.files.size, 1);
    // Action humaine de relecture : jamais de nouvel identifiant ni de nouveaux octets.
    d.disk.state = JSON.stringify(O.unblock(JSON.parse(d.disk.state), T0 + 120000));
    await d.step(T0 + 120000);
    assert.equal(d.status().label, 'synchronisé'); assert.equal(drive.files.size, 1);
    assert.equal(JSON.parse(d.disk.state).verified.fileId, reserved);
  });
  await check('statuts : « synchronisé » exige la relecture, « opérationnel » exige restauration ET iPhone physique', async () => {
    const verified = O.verified(O.sent(O.reserved(O.sealed(O.initial(), { rev: { id: hex(), parents: [], device: hex(), seq: 1 }, sha: 'a'.repeat(64), size: 1 }, T0), 'f1')), 'f1', 'a'.repeat(64), T0);
    assert.equal(json(O.status(O.sent(O.reserved(O.sealed(O.initial(), { rev: { id: hex(), parents: [], device: hex(), seq: 1 }, sha: 'a'.repeat(64), size: 1 }, T0), 'f1')))).label, 'vérification');
    assert.deepEqual([O.status(verified).synced, O.status(verified).operational], [true, false]);
    assert.equal(O.status(verified, { restoreProof: true }).operational, false);
    assert.equal(O.status(verified, { restoreProof: true, physicalProof: true }).operational, true);
    assert.equal(O.status(verified, { conflicts: 1 }).label, 'conflit'); assert.equal(O.status(verified, { headsPending: 1 }).label, 'à intégrer');
    assert.equal(O.status(O.initial()).label, 'local');
    const text = JSON.stringify(verified); assert(!/Lieu|Trajet|voiture/.test(text));
    for (const bad of [{ v: 2 }, { ...json(verified), blocked: 'autre' }, { ...json(verified), attempts: -1 }]) assert.throws(() => O.next(bad, T0), e => e.code === 'INVALID_OUTBOX');
  });
  await check('moteur assemblé restant pur, sans réseau ni stockage propre', async () => {
    const build = fs.readFileSync(path.join(__dirname, '../tools/build.js'), 'utf8'), src = read('sync-outbox.js');
    assert(build.includes("'sync-outbox'")); assert(!/fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB/.test(src));
  });
  console.log(n + '/' + n + ' scénarios OK · file d’envoi sur fournisseur simulé, aucune synchronisation activée');
})().catch(e => { console.error(e); process.exitCode = 1; });
