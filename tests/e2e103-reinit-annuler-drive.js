// #303 · scénario C : après « Récupérer mes données depuis Drive », exécuter réellement « Annuler la réinitialisation »,
// recharger et vérifier l'intégrité. Deux appareils simulés (PC = A, iPhone = B), un seul Drive simulé partagé côté Node
// (chaque écriture, chaque révision et ses parents sont comptés). Données fictives.
// Attendu (scénario contrôlé, sans écriture concurrente, une seule modification locale à republier) :
//  restauration à l'octet des réglages d'origine (relevés par pneu et historique inclus) ; une seule nouvelle révision
//  Drive après stabilisation, de parent la version distante adoptée et de contenu égal aux données restaurées ; aucune
//  publication intermédiaire de réglages réinitialisés ; aucune perte ni conflit sur B ; persistance après rechargement.
// Variante : échec de la persistance locale avant la reprise : pause active, aucune écriture Drive, instantané conservé,
//  erreur visible. Ce test CONSTATE : tout écart est un résultat à rapporter, pas à masquer.
'use strict';
const assert = require('node:assert/strict'), { session, BR, errors, U, NETWORK_NOISE } = require('./lib/context-session');
const activateJournal = require('./lib/journal-activation');
const ORIGIN = new URL(U).origin;
let n = 0, step = '';
async function check(name, fn) { step = name; await fn(); n++; console.log('✅ ' + name); }
async function reveal(p, selector) {
  if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
  await p.locator(selector).waitFor({ state: 'attached' });
  const parents = p.locator(selector).locator('xpath=ancestor::details[not(@open)]');
  while (await parents.count()) await parents.first().locator(':scope > summary').click();
  await p.locator(selector).scrollIntoViewIfNeeded();
}
const rawOf = async c => Object.fromEntries(((await c.storageState()).origins.find(o => o.origin === ORIGIN) || { localStorage: [] }).localStorage.map(x => [x.name, x.value]));
const settingsText = p => p.evaluate(() => localStorage.getItem('twrc.settings.v1'));
const stampsText = p => p.evaluate(() => localStorage.getItem('twrc.editstamps.v1'));
const journal = p => p.evaluate(() => JSON.stringify({ archive: localStorage.getItem('twrc.debrief.archive.v1'),
  entries: (USER_STORE.state.debrief.entries || []).map(e => [e.key, e.feedback && e.feedback.grip]) }));
// Drive simulé partagé entre les deux appareils : état tenu côté Node, lu/écrit par fonctions exposées.
const DRIVE = { files: {}, profiles: {}, n: 0, writes: 0 };
const exposeDrive = async p => {
  await p.exposeFunction('fxDriveGet', () => JSON.stringify(DRIVE));
  await p.exposeFunction('fxDrivePut', t => { Object.assign(DRIVE, JSON.parse(t)); });
};
const installDrive = (p, device) => p.evaluate(async device => {
  const st = async () => JSON.parse(await window.fxDriveGet()), put = s => window.fxDrivePut(JSON.stringify(s));
  const b64 = u => { let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const unb = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const download = async ref => { const f = (await st()).files[ref.fileId], bytes = unb(f.bytes); return { packet: { copyBytes: () => bytes.slice() }, proof: { ...ref, state: 'verified-bytes', verifiedAt: Date.now() } }; };
  const provider = { disconnect() {},
    async reserveId() { const s = await st(); s.writes++; s.n++; await put(s); return 'file_' + s.n; },
    async profiles() { return Object.values((await st()).profiles).map(x => ({ fileId: x.fileId, bytes: unb(x.bytes), sha256: x.sha256 })); },
    async uploadProfile(fileId, folder, bytes) { const s = await st(); s.writes++; const sha256 = await hex(bytes); s.profiles[fileId] = { fileId, bytes: b64(bytes), sha256 }; await put(s); return { fileId, bytes: bytes.slice(), sha256 }; },
    async list() { return Object.values((await st()).files).map(f => f.ref); },
    async download(ref) { return download(ref); },
    async uploadRevision(fileId, folder, packet, rev) {
      const s = await st(); s.writes++; const bytes = packet.copyBytes();
      if (!s.files[fileId]) s.files[fileId] = { bytes: b64(bytes), by: device, ref: { fileId, fileSha256: await hex(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: JSON.parse(JSON.stringify(rev)), state: 'unverified' } };
      await put(s); return download(s.files[fileId].ref);
    } };
  window.TWRC_DRIVE_CONFIGURED = true;
  DRIVE_UI.session = { connected: true, disconnect() {} };
  DRIVE_UI.sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999',
    onChange: state => { DRIVE_UI.status = state; DRIVE_UI.text = state.message; }, onApplied: driveApplied });
  DRIVE_UI.sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); DRIVE_UI.selected = true;
  renderSettings(true);
}, device);
const revs = () => Object.values(DRIVE.files).map(f => ({ id: f.ref.revision.id, parents: f.ref.revision.parents, device: f.by }));
const stabilize = async (p, s) => { for (let i = 0; i < 3; i++) { await p.evaluate(async () => { await TWRC_VAULT.flush(); await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); }); await s.settle(2); } };
const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 600)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 600)); } };
(async () => {
  const b = await BR.launch();
  try {
    // ---------- Appareil A (PC) : données d'origine, relevé par pneu et historique inclus ----------
    const sa = await session(b, { at: '2026-10-07T15:00:00+02:00', dev: 'pc' }), pa = sa.p;
    await exposeDrive(pa); await activateJournal(pa);
    await pa.evaluate(() => {
      S.work.dep = '07:10'; S.work.ret = '18:40'; S.horizon = 24; S.cars[0].name = 'Voiture fictive test';
      S.cars[0].tire.treads = [{ d: '2026-09-01', mm: 6.5, km: 10000, ax: 'av' }, { d: '2026-09-01', mm: 6.1, km: 10000, ax: 'ar', est: 1 }];
      saveSettings();
      const r = applyTreadWheels(S.cars[0], { fl: { side: 5.2, mid: 5.6 }, fr: { side: 5.1 }, rl: { side: 6 }, rr: { mid: 6.2 } }, { date: '2026-10-06', est: false });
      if (r.error) throw new Error(r.error);
      saveSettings(); renderAll();
    });
    await pa.evaluate(() => TWRC_VAULT.flush()); await sa.settle(4);
    await installDrive(pa, 'A'); await stabilize(pa, sa);
    const O = await settingsText(pa), rev1 = revs();
    expect('A · publication initiale : une révision (rev1) contenant les réglages d’origine', rev1.length === 1, JSON.stringify(rev1));
    // ---------- Appareil B (iPhone) : adopte rev1 ----------
    const sb = await session(b, { at: '2026-10-07T15:00:00+02:00', dev: 'iphone' }), pb = sb.p;
    await exposeDrive(pb); await activateJournal(pb); await installDrive(pb, 'B');
    await pb.evaluate(async () => { await DRIVE_UI.sync.adopt(); await TWRC_VAULT.flush(); }); await sb.settle(3);
    const bFirst = await settingsText(pb);
    expect('B · adopte rev1 : réglages identiques à ceux de A, sans conflit', bFirst === O && (await pb.evaluate(() => DRIVE_UI.sync.status.conflicts.length)) === 0, (bFirst === O) + ' / conflits ' + (await pb.evaluate(() => DRIVE_UI.sync.status.conflicts.length)));
    const wB0 = DRIVE.writes;
    // ---------- A : une seule modification locale à republier (non encore envoyée) ----------
    await pa.evaluate(async () => { S.horizon = 12; saveSettings(); await TWRC_VAULT.flush(); });
    const O2 = await settingsText(pa);   // réglages d'origine à restaurer : rev1 + la modification locale
    const T2 = await stampsText(pa);     // horodatages d'édition d'origine (dont celui de la modification locale)
    const w1 = DRIVE.writes;
    // ---------- A : réinitialisation → pause ----------
    await reveal(pa, '#resetZone [data-act=reset]'); await pa.locator('[data-act=reset]').click(); await sa.settle(1);
    await pa.locator('#resetWord').fill('RÉINITIALISER'); await pa.locator('[data-act=reset-go]').click(); await sa.settle(6);
    await pa.evaluate(async () => { await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); });
    expect('A · réinitialisation : synchro en pause, aucune écriture Drive', DRIVE.writes === w1 && await pa.evaluate(() => lsGet(DriveSync.PAUSE) != null), 'écritures ' + (DRIVE.writes - w1));
    // ---------- A : « Récupérer mes données depuis Drive » ----------
    await reveal(pa, '#syncPause [data-act=sync-recover]'); await pa.locator('#syncPause [data-act=sync-recover]').click();
    await pa.waitForFunction(() => !UI.syncBusy && !DRIVE_UI.sync.status.running, null, { timeout: 60000 }); await sa.settle(2);
    const afterRecover = await settingsText(pa), revAfterRecover = revs().length;
    expect('A · « Récupérer » : réglages = rev1, aucune nouvelle révision', afterRecover === O && revAfterRecover === 1, 'identique à rev1 : ' + (afterRecover === O) + ' · révisions ' + revAfterRecover);
    const undoBtn = await pa.locator('[data-act=reset-undo]').count();
    expect('A · après « Récupérer » : « Annuler la réinitialisation » toujours proposé (instantané conservé)', undoBtn === 1, 'boutons ' + undoBtn);
    if (undoBtn !== 1) throw new Error('STOP : annulation impossible après « Récupérer »');
    // ---------- A : « Annuler la réinitialisation » réellement exécuté ----------
    await reveal(pa, '#resetZone [data-act=reset-undo]'); await pa.locator('[data-act=reset-undo]').click(); await sa.settle(6);
    const afterUndo = await settingsText(pa);
    expect('A · « Annuler la réinitialisation » : réglages d’origine à l’octet (modification locale, relevé par pneu et historique inclus)', afterUndo === O2,
      'diff : ' + JSON.stringify(Object.keys(JSON.parse(O2)).filter(k => JSON.stringify(JSON.parse(O2)[k]) !== JSON.stringify(JSON.parse(afterUndo)[k]))));
    const stampsUndo = await stampsText(pa);
    expect('A · « Annuler » : horodatages d’édition d’origine restaurés à l’octet (jamais l’heure de la restauration)', stampsUndo === T2, 'avant ' + String(T2).slice(0, 200) + ' · après ' + String(stampsUndo).slice(0, 200));
    await stabilize(pa, sa);
    const all = revs(), news = all.filter(r => r.id !== rev1[0].id);
    expect('A · après stabilisation : une seule nouvelle révision Drive', news.length === 1, JSON.stringify(all));
    expect('A · nouvelle révision : parent = rev1 (version distante adoptée)', news.length === 1 && JSON.stringify(news[0].parents) === JSON.stringify([rev1[0].id]), JSON.stringify(news));
    const localAfter = await settingsText(pa);
    expect('A · après stabilisation : réglages locaux toujours égaux aux réglages restaurés', localAfter === O2, 'diff : ' + JSON.stringify(Object.keys(JSON.parse(O2)).filter(k => JSON.stringify(JSON.parse(O2)[k]) !== JSON.stringify(JSON.parse(localAfter)[k]))));
    // ---------- B : reçoit la nouvelle révision ----------
    await pb.evaluate(async () => { await DRIVE_UI.sync.run(true); await TWRC_VAULT.flush(); }); await sb.settle(3);
    const bAfter = await settingsText(pb), bConf = await pb.evaluate(() => DRIVE_UI.sync.status.conflicts.length), bHorizon = await pb.evaluate(() => S.horizon), bRec = await pb.evaluate(() => JSON.stringify(S.treadWheels || null));
    expect('B · contenu de la nouvelle révision = données restaurées (horizon 12, relevé par pneu conservé), aucun conflit, aucune perte',
      bHorizon === 12 && bConf === 0 && bRec === JSON.stringify(JSON.parse(O2).treadWheels || null) && JSON.stringify(JSON.parse(bAfter).cars[0].tire.treads) === JSON.stringify(JSON.parse(O2).cars[0].tire.treads),
      'horizon ' + bHorizon + ' · conflits ' + bConf + ' · relevé ' + (bRec === JSON.stringify(JSON.parse(O2).treadWheels || null)));
    const deep = (a, c, p = '') => { if (JSON.stringify(a) === JSON.stringify(c)) return []; if (a && c && typeof a === 'object' && typeof c === 'object') return [...new Set([...Object.keys(a), ...Object.keys(c)])].flatMap(k => deep(a[k], c[k], p ? p + '.' + k : k)); return [p + ' : ' + JSON.stringify(a) + ' → ' + JSON.stringify(c)]; };
    const diffKeys = (x, y) => deep(JSON.parse(x), JSON.parse(y)).map(t => t.slice(0, 300));
    console.log('DIAG B réglages ≠ O2 : ' + JSON.stringify(diffKeys(O2, bAfter)));
    expect('aucune publication intermédiaire de réglages réinitialisés (toutes les révisions viennent de rev1 ou de la restauration)', revs().length === 2, JSON.stringify(revs()));
    // ---------- A : rechargement ----------
    await pa.reload(); await sa.settle(14); await installDrive(pa, 'A'); await stabilize(pa, sa);
    const afterReload = await settingsText(pa), stampsReload = await stampsText(pa);
    console.log('DIAG A rechargé ≠ O2 : ' + JSON.stringify(diffKeys(O2, afterReload)));
    console.log('DIAG révisions après rechargement : ' + JSON.stringify(revs().map(r => r.device + ':' + r.id.slice(0, 8) + '<' + r.parents.map(x => x.slice(0, 8)).join(','))));
    await stabilize(pb, sb); await stabilize(pa, sa); await stabilize(pb, sb);
    console.log('DIAG révisions après 3 cycles de plus : ' + revs().length + ' · A=B ' + ((await settingsText(pa)) === (await settingsText(pb))));
    expect('A · après rechargement : réglages et horodatages restaurés persistés, aucune nouvelle révision', afterReload === O2 && stampsReload === T2 && revs().length === 2, 'identique : ' + (afterReload === O2) + ' · horodatages : ' + (stampsReload === T2) + ' · révisions ' + revs().length);
    expect('A · après rechargement : pause levée, instantané retiré, aucun conflit', await pa.evaluate(() => lsGet(DriveSync.PAUSE) == null && !RESET_GUARD.read(APP_STORAGE) && DRIVE_UI.sync.status.conflicts.length === 0), await pa.evaluate(() => JSON.stringify({ pause: lsGet(DriveSync.PAUSE) != null, snap: !!RESET_GUARD.read(APP_STORAGE), conflicts: DRIVE_UI.sync.status.conflicts })));
    await sb.c.close(); await sa.c.close();
    // ---------- Variante : échec de la persistance locale avant la reprise de la synchro ----------
    for (const k of Object.keys(DRIVE)) delete DRIVE[k]; Object.assign(DRIVE, { files: {}, profiles: {}, n: 0, writes: 0 });
    const sc = await session(b, { at: '2026-10-07T15:00:00+02:00', dev: 'pc' }), pc = sc.p;
    await exposeDrive(pc); await activateJournal(pc);
    await pc.evaluate(async () => { S.cars[0].name = 'Voiture fictive test'; saveSettings(); await TWRC_VAULT.flush(); });
    await installDrive(pc, 'C'); await stabilize(pc, sc);
    await reveal(pc, '#resetZone [data-act=reset]'); await pc.locator('[data-act=reset]').click(); await sc.settle(1);
    await pc.locator('#resetWord').fill('RÉINITIALISER'); await pc.locator('[data-act=reset-go]').click(); await sc.settle(6);
    const wC = DRIVE.writes;
    // Le disque refuse désormais toute écriture (quota plein simulé sur le stockage réel du coffre).
    await pc.evaluate(() => { const raw = window.TWRC_RAW_STORAGE || localStorage, orig = Storage.prototype.setItem; window.fxNativeSetItem = orig;
      Storage.prototype.setItem = function (k, v) { if (this === raw) { const e = new Error('Quota simulé'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); }; });
    await reveal(pc, '#resetZone [data-act=reset-undo]'); await pc.locator('[data-act=reset-undo]').click(); await sc.settle(6);
    await pc.evaluate(async () => { try { await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); } catch (e) {} }); await sc.settle(2);
    const st = await pc.evaluate(() => ({ pause: lsGet(DriveSync.PAUSE) != null, snap: !!RESET_GUARD.read(APP_STORAGE), msg: (document.getElementById('resetZone') || {}).innerText || '' }));
    expect('échec de persistance · pause Drive toujours active', st.pause, JSON.stringify(st).slice(0, 300));
    expect('échec de persistance · aucune écriture Drive', DRIVE.writes === wC, 'écritures ' + (DRIVE.writes - wC));
    expect('échec de persistance · instantané conservé', st.snap, JSON.stringify(st).slice(0, 300));
    expect('échec de persistance · erreur visible, aucun message de succès', /non enregistr/i.test(st.msg) && /stockage/i.test(st.msg) && !/Réinitialisation annulée/.test(st.msg), st.msg.slice(0, 300));
    expect('échec de persistance · réglages affichés = réglages réellement écrits (réinitialisés)', await pc.evaluate(() => S.cars[0].name !== 'Voiture fictive test'), await pc.evaluate(() => S.cars[0].name));
    // Disque de nouveau disponible : un nouvel essai aboutit (état récupérable), puis rechargement = état écrit.
    await pc.evaluate(() => { Storage.prototype.setItem = window.fxNativeSetItem; });
    await reveal(pc, '#resetZone [data-act=reset-undo]'); await pc.locator('[data-act=reset-undo]').click(); await sc.settle(6);
    const retry = await pc.evaluate(() => ({ pause: lsGet(DriveSync.PAUSE) != null, snap: !!RESET_GUARD.read(APP_STORAGE), name: S.cars[0].name, msg: (document.getElementById('resetMsg') || {}).textContent || '', err: TWRC_VAULT.error }));
    expect('échec de persistance · nouvel essai après libération du stockage : annulation aboutie', !retry.pause && !retry.snap && retry.name === 'Voiture fictive test' && /^Réinitialisation annulée/.test(retry.msg) && !retry.err, JSON.stringify(retry).slice(0, 300));
    await pc.reload(); await sc.settle(14);
    const reloaded = await pc.evaluate(() => ({ pause: lsGet(DriveSync.PAUSE) != null, snap: !!RESET_GUARD.read(APP_STORAGE), name: S.cars[0].name }));
    expect('échec de persistance · après rechargement : état écrit = annulation aboutie', !reloaded.pause && !reloaded.snap && reloaded.name === 'Voiture fictive test', JSON.stringify(reloaded));
    await sc.c.close();
    // ---------- Écriture concurrente : B modifie un AUTRE réglage pendant la pause de A ----------
    // Après « Annuler » (directement, ou après « Récupérer »), la modification de B doit survivre sur les deux appareils.
    for (const recover of [false, true]) {
      const tag = recover ? 'concurrent · Récupérer puis Annuler' : 'concurrent · Annuler directement';
      for (const k of Object.keys(DRIVE)) delete DRIVE[k]; Object.assign(DRIVE, { files: {}, profiles: {}, n: 0, writes: 0 });
      const xa = await session(b, { at: '2026-10-07T15:00:00+02:00', dev: 'pc' }), qa = xa.p;
      await exposeDrive(qa); await activateJournal(qa);
      await qa.evaluate(async () => { S.work.dep = '07:10'; S.horizon = 24; S.cars[0].name = 'Voiture fictive test'; saveSettings(); await TWRC_VAULT.flush(); });
      await installDrive(qa, 'A'); await stabilize(qa, xa);
      const xb = await session(b, { at: '2026-10-07T15:00:00+02:00', dev: 'iphone' }), qb = xb.p;
      await exposeDrive(qb); await activateJournal(qb); await installDrive(qb, 'B');
      await qb.evaluate(async () => { await DRIVE_UI.sync.adopt(); await TWRC_VAULT.flush(); }); await xb.settle(3);
      await qa.evaluate(async () => { S.horizon = 12; saveSettings(); await TWRC_VAULT.flush(); });   // modification locale de A, non envoyée
      await reveal(qa, '#resetZone [data-act=reset]'); await qa.locator('[data-act=reset]').click(); await xa.settle(1);
      await qa.locator('#resetWord').fill('RÉINITIALISER'); await qa.locator('[data-act=reset-go]').click(); await xa.settle(6);
      await qb.evaluate(async () => { S.work.dep = '08:20'; saveSettings(); await TWRC_VAULT.flush(); }); await stabilize(qb, xb);   // B publie pendant la pause de A
      if (recover) { await reveal(qa, '#syncPause [data-act=sync-recover]'); await qa.locator('#syncPause [data-act=sync-recover]').click();
        await qa.waitForFunction(() => !UI.syncBusy && !DRIVE_UI.sync.status.running, null, { timeout: 60000 }); await xa.settle(2); }
      await reveal(qa, '#resetZone [data-act=reset-undo]'); await qa.locator('[data-act=reset-undo]').click(); await xa.settle(6);
      await stabilize(qa, xa); await stabilize(qb, xb); await stabilize(qa, xa);
      const va = await qa.evaluate(() => ({ dep: S.work.dep, horizon: S.horizon, conflicts: DRIVE_UI.sync.status.conflictDetails.map(d => [d.path, d.local, d.remote]) }));
      const vb = await qb.evaluate(() => ({ dep: S.work.dep, horizon: S.horizon, conflicts: DRIVE_UI.sync.status.conflictDetails.map(d => [d.path, d.local, d.remote]) }));
      expect(`${tag} · modification de B (départ 08:20) conservée sur A et B`, va.dep === '08:20' && vb.dep === '08:20', 'A ' + JSON.stringify(va) + ' · B ' + JSON.stringify(vb));
      expect(`${tag} · modification de A restaurée (horizon 12) sur A et B`, va.horizon === 12 && vb.horizon === 12, 'A ' + JSON.stringify(va) + ' · B ' + JSON.stringify(vb));
      expect(`${tag} · aucun conflit`, !va.conflicts.length && !vb.conflicts.length, 'A ' + JSON.stringify(va.conflicts) + ' · B ' + JSON.stringify(vb.conflicts) + ' · révisions ' + JSON.stringify(revs()));
      await xb.c.close(); await xa.c.close();
    }
  } finally { await b.close(); }
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
