// Synchronisation Drive bloquée en production (24/11/2026) : préférences EN DIRECT d'un seul appareil devenues un conflit.
// Vraie app, deux appareils (PC et iPhone) sur un Drive simulé partagé (aucun appel Google), données fictives.
// Avant : le bip d'approche des feux (twrc.drive.beep) ou le fond de carte (twrc.drive.base) réglé sur l'iPhone partait sur Drive ;
// le PC, qui n'avait pas ce réglage, voyait une « clé entière » différente, non résoluble : badge « Action requise » et plus
// aucune saisie échangée, avec « (absent) » affiché des deux côtés.
// Attendu : ces préférences restent propres à chaque appareil ; une révision déjà envoyée par l'ancienne version (qui les
// contient) ne crée aucun conflit ; les saisies circulent dans les deux sens ; une vraie donnée entière en conflit est décrite
// honnêtement (jamais « (absent) » des deux côtés).
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const activateJournal = require('./lib/journal-activation');
const AT = '2026-11-16T07:00:00+01:00';
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
const DRIVE = { files: {}, profiles: {}, n: 0, revisions: [] };
const exposeDrive = async p => { await p.exposeFunction('fxDriveGet', () => JSON.stringify(DRIVE)); await p.exposeFunction('fxDrivePut', t => { Object.assign(DRIVE, JSON.parse(t)); }); };
const installDrive = (p, device) => p.evaluate(async device => {
  const st = async () => JSON.parse(await window.fxDriveGet()), put = s => window.fxDrivePut(JSON.stringify(s));
  const b64 = u => { let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const unb = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const download = async ref => { const f = (await st()).files[ref.fileId], bytes = unb(f.bytes); return { packet: { copyBytes: () => bytes.slice() }, proof: { ...ref, state: 'verified-bytes', verifiedAt: Date.now() } }; };
  const provider = { disconnect() {},
    async reserveId() { const s = await st(); s.n++; await put(s); return 'file_' + s.n; },
    async profiles() { return Object.values((await st()).profiles).map(x => ({ fileId: x.fileId, bytes: unb(x.bytes), sha256: x.sha256 })); },
    async uploadProfile(fileId, folder, bytes) { const s = await st(); const sha256 = await hex(bytes); s.profiles[fileId] = { fileId, bytes: b64(bytes), sha256 }; await put(s); return { fileId, bytes: bytes.slice(), sha256 }; },
    async list() { return Object.values((await st()).files).map(f => f.ref); },
    async download(ref) { return download(ref); },
    async uploadRevision(fileId, folder, packet, rev) {
      const s = await st(); const bytes = packet.copyBytes();
      if (!s.files[fileId]) { s.files[fileId] = { bytes: b64(bytes), by: device, ref: { fileId, fileSha256: await hex(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: JSON.parse(JSON.stringify(rev)), state: 'unverified' } }; s.revisions.push({ id: rev.id, device }); }
      await put(s); return download(s.files[fileId].ref);
    } };
  window.TWRC_DRIVE_CONFIGURED = true; DRIVE_UI.config = DRIVE_UI.config || { raceOrigin: location.origin };
  DRIVE_UI.session = { connected: true, disconnect() {}, prepare: async () => {} }; DRIVE_UI.prepared = true; DRIVE_UI.prep = 'ready';
  DRIVE_UI.sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999', onChange: driveOnChange, onApplied: () => { S = loadSettings(); rebuild(); renderAll(); } });
  DRIVE_UI.sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); DRIVE_UI.selected = true;
  if (!window.__wired) { window.__wired = true; for (const key of Object.keys(DRIVE_USER_PART)) DRIVE_BADGE.sig[key] = driveUserPart(key); window.addEventListener('twrc-vault-change', driveVaultChange); }
  renderDriveSync();
}, device);
const stabilize = async (p, s) => { for (let i = 0; i < 3; i++) { await p.evaluate(async () => { await TWRC_VAULT.flush(); await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); }); await s.settle(2); } };
const state = p => p.evaluate(() => ({ status: (DRIVE_UI.sync.status || {}).state, conflicts: (DRIVE_UI.sync.status.conflicts || []).slice(), blocked: !!DRIVE_UI.sync.status.blocked, badge: (document.getElementById('driveBadge') || {}).textContent || '',
  cars: S.cars.map(c => c.name), beep: lsGet('twrc.drive.beep'), base: lsGet('twrc.drive.base') }));
(async () => {
  const b = await BR.launch();
  try {
    const sa = await session(b, { at: AT, dev: 'pc' }), pa = sa.p; await sa.settle(6);
    await exposeDrive(pa); await activateJournal(pa); await installDrive(pa, 'PC'); await stabilize(pa, sa);
    const sb = await session(b, { at: AT, dev: 'iphone' }), pb = sb.p; await sb.settle(6);
    await exposeDrive(pb); await activateJournal(pb); await installDrive(pb, 'iPhone'); await stabilize(pb, sb); await stabilize(pa, sa); await stabilize(pb, sb);
    const a0 = await state(pa), b0 = await state(pb);
    expect('contexte : PC et iPhone synchronisés sur le Drive simulé, sans conflit', !a0.conflicts.length && !b0.conflicts.length, JSON.stringify({ a0, b0 }));
    // 1. Cas de production : l'iPhone, encore sur l'ANCIENNE règle (préférences EN DIRECT envoyées sur Drive), active le bip et le
    //    fond Ortho, et modifie une vraie donnée. Sa révision sur Drive contient donc ces deux clés.
    const revB = DRIVE.revisions.filter(r => r.device === 'iPhone').length;
    await pb.evaluate(async () => { window.__device = SyncMerge.device; SyncMerge.device = k => !/^twrc\.drive\./.test(k) && window.__device(k);
      lsSet('twrc.drive.beep', '1'); lsSet('twrc.drive.base', 'ortho'); S.cars[1].name = 'Voiture fictive B (iPhone)'; saveSettings(); await TWRC_VAULT.flush(); });
    await stabilize(pb, sb);
    await pb.evaluate(() => { SyncMerge.device = window.__device; });
    expect('iPhone (ancienne règle) : sa révision avec bip et fond de carte est bien partie sur Drive', DRIVE.revisions.filter(r => r.device === 'iPhone').length === revB + 1 && (await state(pb)).status === 'SYNCED', JSON.stringify({ revB, revisions: DRIVE.revisions }));
    // Le PC (sans bip ni fond réglés) modifie une autre donnée, puis se synchronise.
    await pa.evaluate(async () => { S.cars[0].name = 'Voiture fictive A (PC)'; saveSettings(); await TWRC_VAULT.flush(); });
    await stabilize(pa, sa);
    const a1 = await state(pa);
    expect('PC : la révision de l’iPhone contenant bip et fond de carte ne crée AUCUN conflit (avant : clé entière, « Action requise »)', !a1.conflicts.length && !a1.blocked && !/Action requise/.test(a1.badge), JSON.stringify(a1));
    expect('PC : la saisie de l’iPhone est intégrée, la sienne conservée', a1.cars[0] === 'Voiture fictive A (PC)' && a1.cars[1] === 'Voiture fictive B (iPhone)', JSON.stringify(a1.cars));
    expect('PC : ses propres préférences EN DIRECT ne sont pas remplacées par celles de l’iPhone', a1.beep === null && a1.base === null, JSON.stringify(a1));
    await stabilize(pb, sb);
    const b1 = await state(pb);
    expect('iPhone : la saisie du PC arrive, aucun conflit', !b1.conflicts.length && !b1.blocked && b1.cars[0] === 'Voiture fictive A (PC)' && b1.cars[1] === 'Voiture fictive B (iPhone)', JSON.stringify(b1));
    expect('iPhone : garde son bip et son fond Ortho', b1.beep === '1' && b1.base === 'ortho', JSON.stringify(b1));
    // 2. Nouvelle règle des deux côtés : réglages opposés sur chaque appareil, toujours aucun conflit, chacun garde le sien.
    await pa.evaluate(async () => { lsSet('twrc.drive.beep', '0'); lsSet('twrc.drive.base', 'plan'); S.cars[0].name = 'Voiture fictive A2'; saveSettings(); await TWRC_VAULT.flush(); });
    await stabilize(pa, sa); await stabilize(pb, sb); await stabilize(pa, sa);
    const a2 = await state(pa), b2 = await state(pb);
    expect('réglages EN DIRECT opposés sur les deux appareils : aucun conflit, chacun garde le sien, les saisies circulent', !a2.conflicts.length && !b2.conflicts.length &&
      a2.beep === '0' && a2.base === 'plan' && b2.beep === '1' && b2.base === 'ortho' && b2.cars[0] === 'Voiture fictive A2', JSON.stringify({ a2, b2 }));
    // 3. Affichage : une vraie donnée entière en conflit n'est plus décrite « (absent) » des deux côtés.
    const view = await pa.evaluate(() => { let panel = document.getElementById('driveSyncPanel'); if (!panel) { panel = document.createElement('div'); panel.id = 'driveSyncPanel'; document.body.appendChild(panel); }
      const before = DRIVE_UI.status; DRIVE_UI.status = { ...(before || {}), conflictDetails: [{ path: 'clé:twrc.future.donnee', device: 'appareil-fictif-55311b', resolvable: false }] };
      renderDriveSync(); const t = panel.innerText; DRIVE_UI.status = before; renderDriveSync(); return t; });
    expect('affichage : donnée entière en conflit décrite « valeur différente », jamais « (absent) » des deux côtés', /valeur différente sur cet appareil et sur l’autre appareil \(…55311b\)/.test(view) && !/\(absent\)/.test(view), view.slice(0, 600));
    await sb.c.close(); await sa.c.close();
    expect('aucune erreur JavaScript', !errors.length, errors.join(' / '));
  } finally { await b.close(); }
  if (findings.length) { console.error(`\n❌ ${findings.length} contrôle(s) en échec`); process.exit(1); }
  console.log(`\n✅ ${n} contrôles au vert`);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
