// Réinitialisation protégée (zéro perte), PC et iPhone simulé, Chromium et WebKit. Profil, code et lieux fictifs
// (« Lieu A », « Voiture fictive test ») ; aucun compte réel ni réseau extérieur.
// Parcours : zone danger séparée de la démo → mot RÉINITIALISER exigé → abandon sans effet → instantané chiffré dans
// le coffre (rien en clair au repos) → réinitialisation → rechargement → « Annuler la réinitialisation » → réglages
// identiques à l'octet ; journal des trajets intact à chaque étape. Drive configuré : synchro en PAUSE après réinitialisation
// (0 écriture, même après saisie et rechargement), puis « Récupérer » (à l'octet, 0 écriture) ou « Remplacer » (mot REMPLACER).
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
const journal = p => p.evaluate(() => JSON.stringify({ archive: localStorage.getItem('twrc.debrief.archive.v1'),
  entries: (USER_STORE.state.debrief.entries || []).map(e => [e.key, e.feedback && e.feedback.grip]) }));
// Transport Drive simulé dans la page : mêmes méthodes que DriveTransport.OpaqueDrive, fichiers en sessionStorage.
const installDrive = p => p.evaluate(() => {
  const KEY = 'fixture.drive.v1';
  const st = () => JSON.parse(sessionStorage.getItem(KEY) || '{"files":{},"profiles":{},"n":0,"writes":0}');
  const put = s => sessionStorage.setItem(KEY, JSON.stringify(s));
  const b64 = u => { let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const unb = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const download = ref => { const f = st().files[ref.fileId], bytes = unb(f.bytes); return { packet: { copyBytes: () => bytes.slice() }, proof: { ...ref, state: 'verified-bytes', verifiedAt: Date.now() } }; };
  const provider = { disconnect() {},
    async reserveId() { const s = st(); s.writes++; s.n++; put(s); return 'file_' + s.n; },
    async profiles() { return Object.values(st().profiles).map(x => ({ fileId: x.fileId, bytes: unb(x.bytes), sha256: x.sha256 })); },
    async uploadProfile(fileId, folder, bytes) { const s = st(); s.writes++; const sha256 = await hex(bytes); s.profiles[fileId] = { fileId, bytes: b64(bytes), sha256 }; put(s); return { fileId, bytes: bytes.slice(), sha256 }; },
    async list() { return Object.values(st().files).map(f => f.ref); },
    async download(ref) { return download(ref); },
    async uploadRevision(fileId, folder, packet, rev) {
      const s = st(); s.writes++; const bytes = packet.copyBytes();
      if (!s.files[fileId]) s.files[fileId] = { bytes: b64(bytes), ref: { fileId, fileSha256: await hex(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: JSON.parse(JSON.stringify(rev)), state: 'unverified' } };
      put(s); return download(s.files[fileId].ref);
    } };
  window.TWRC_DRIVE_CONFIGURED = true;
  DRIVE_UI.session = { connected: true, disconnect() {} };
  DRIVE_UI.sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999',
    onChange: state => { DRIVE_UI.status = state; DRIVE_UI.text = state.message; }, onApplied: driveApplied });
  DRIVE_UI.sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); DRIVE_UI.selected = true;
  renderSettings(true);
});
const drive = p => p.evaluate(() => { const s = JSON.parse(sessionStorage.getItem('fixture.drive.v1') || '{"files":{},"writes":0}'); return { writes: s.writes, revisions: Object.keys(s.files).length }; });
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: '2026-10-07T15:00:00+02:00', dev }), p = s.p;
      await activateJournal(p);
      const key = 'work-2026-10-07|aller', at = Date.parse('2026-10-07T07:12:00+02:00');
      await p.evaluate(({ key, at }) => {
        USER_STORE.state.debrief.entries.unshift({ key, at, how: 'auto', name: 'Lieu A → Lieu B', from: 'home', to: 'work',
          feedback: { at: at + 8 * 60e3, conditions: ['wet'], grip: 'normal' }, deferred: false });
        USER_STORE.flush();
        S.work.dep = '07:10'; S.work.ret = '18:40'; S.work.durMin = 45; S.horizon = 24;
        S.calib = [{ t: '2026-10-07T07:00', loc: 'home', kind: 'ice', Tr: 2, T: 3 }];
        S.customs.push({ id: 'cfict', name: 'Lieu A', sub: 'Département 38', lat: 48.8, lon: 2.3 });
        S.cars[0].name = 'Voiture fictive test'; saveSettings(); renderAll();
      }, { key, at });
      await p.evaluate(() => TWRC_VAULT.flush()); await s.settle(4);
      const before = await settingsText(p), journalBefore = await journal(p);
      assert.match(before, /Voiture fictive test/); assert.match(journalBefore, /work-2026-10-07\|aller/);
      assert.equal(await p.evaluate(() => TWRC_VAULT.mode), 'vault');

      await check(dev + ' · « Réinitialiser » est dans une zone danger séparée, sous « Lancer la démo »', async () => {
        await reveal(p, '#resetZone [data-act=reset]');
        const layout = await p.evaluate(() => {
          const reset = document.querySelector('[data-act=reset]'), demo = document.querySelector('[data-act=demo-sel]');
          return { danger: !!reset.closest('.set-danger'), sameRow: reset.parentElement === demo.parentElement,
            after: !!(demo.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING), title: document.querySelector('#resetTitle').textContent,
            count: document.querySelectorAll('[data-act=reset]').length };
        });
        assert.deepEqual(layout, { danger: true, sameRow: false, after: true, title: '⚠️ Zone danger', count: 1 });
      });
      await check(dev + ' · ouvrir puis abandonner : mot exigé, aucune donnée modifiée, aucun dialogue natif', async () => {
        let dialogs = 0; const onDialog = d => { dialogs++; d.dismiss(); }; p.on('dialog', onDialog);
        await p.locator('[data-act=reset]').click(); await s.settle(1);
        assert.equal(await p.locator('#resetWord').isVisible(), true);
        assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('#resetWord').fill('REINITIALIS'); assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('#resetWord').fill('oui'); assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('[data-act=reset-cancel]').click(); await s.settle(2);
        p.off('dialog', onDialog);
        assert.equal(dialogs, 0); assert.equal(await settingsText(p), before); assert.equal(await journal(p), journalBefore);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage)), null); assert.equal(await p.locator('[data-act=reset-undo]').count(), 0);
      });
      await check(dev + ' · RÉINITIALISER saisi : instantané chiffré confirmé, puis valeurs initiales ; journal intact', async () => {
        await p.locator('[data-act=reset]').click(); await s.settle(1);
        await p.locator('#resetWord').fill('RÉINITIALISER'); assert.equal(await p.locator('[data-act=reset-go]').isEnabled(), true);
        await p.locator('[data-act=reset-go]').click(); await s.settle(6);
        await p.evaluate(() => TWRC_VAULT.flush());
        assert.deepEqual(await p.evaluate(() => S.work), await p.evaluate(() => DEFAULTS.work));
        assert.equal(await p.evaluate(() => S.cars[0].name), await p.evaluate(() => DEFAULTS.cars[0].name));
        assert.equal(await p.evaluate(() => JSON.stringify([S.customs, S.calib]) === JSON.stringify([DEFAULTS.customs, DEFAULTS.calib])), true);
        assert.equal(await p.evaluate(() => S.customs.some(l => l.name === 'Lieu A') || S.calib.length > 0), false);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage).settings), before, 'instantané identique à l’octet');
        assert.equal(await journal(p), journalBefore, 'journal des trajets modifié par la réinitialisation');
        const raw = await rawOf(s.c);
        assert(raw['twrc.vault.v2'], 'coffre absent');
        assert.equal(raw['twrc.restore.reset.v1'], undefined, 'instantané en clair sur le disque');
        assert.deepEqual(Object.entries(raw).filter(([, v]) => /Voiture fictive test|Lieu A|Département 38/.test(v)).map(([k]) => k), [], 'réglage fictif lisible au repos');
        assert.equal(await p.locator('[data-act=reset-undo]').count(), 1);
      });
      await check(dev + ' · après rechargement : instantané toujours présent dans le coffre, bouton d’annulation visible', async () => {
        await p.reload(); await s.settle(14);
        assert.equal(await p.evaluate(() => TWRC_VAULT.mode), 'vault');
        await reveal(p, '#resetZone [data-act=reset-undo]');
        assert.match(await p.locator('#resetZone').innerText(), /chiffré dans le coffre de cet appareil, jamais envoyé à Drive/);
      });
      await check(dev + ' · « Annuler la réinitialisation » : réglages identiques à l’octet, instantané retiré, journal intact', async () => {
        await p.locator('[data-act=reset-undo]').click(); await s.settle(6); await p.evaluate(() => TWRC_VAULT.flush());
        assert.equal(await settingsText(p), before, 'réglages restaurés différents à l’octet');
        assert.equal(await p.evaluate(() => S.cars[0].name), 'Voiture fictive test'); assert.equal(await p.evaluate(() => S.work.dep), '07:10');
        assert.equal(await p.evaluate(() => S.customs.some(l => l.name === 'Lieu A')), true); assert.equal(await p.evaluate(() => S.calib.length), 1);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage)), null); assert.equal(await p.locator('[data-act=reset-undo]').count(), 0);
        assert.equal(await journal(p), journalBefore);
        await p.reload(); await s.settle(14);
        assert.equal(await settingsText(p), before, 'restauration perdue au rechargement'); assert.equal(await journal(p), journalBefore);
      });
      // ---------- Google Drive configuré : pause après réinitialisation, puis Récupérer ou Remplacer ----------
      // Transport Drive simulé DANS la page (fichiers en sessionStorage : survivent au rechargement) ; il compte
      // chaque appel d'écriture (réservation, profil, révision). Vrai raccord DriveSync, vrai coffre, vrai codec.
      await installDrive(p);
      await check(dev + ' · Drive : publication initiale des réglages (référence de la version Drive)', async () => {
        await p.evaluate(() => DRIVE_UI.sync.run(true));
        const d = await drive(p); assert(d.writes > 0, 'aucune publication initiale'); assert.equal(d.revisions, 1);
        assert.equal(await p.evaluate(() => DRIVE_UI.sync.status.message), 'synchronisé');
      });
      const driveSettings = await settingsText(p); assert.equal(driveSettings, before);
      const w0 = (await drive(p)).writes;
      await check(dev + ' · réinitialisation avec Drive : plus de case d’accord, synchro en PAUSE, 0 écriture Drive', async () => {
        await reveal(p, '#resetZone [data-act=reset]'); await p.locator('[data-act=reset]').click(); await s.settle(1);
        assert.equal(await p.locator('#resetDrive').count(), 0, 'case d’accord Drive supprimée');
        assert.match(await p.locator('#resetZone').innerText(), /synchronisation passe en pause/);
        await p.locator('#resetWord').fill('RÉINITIALISER'); await p.locator('[data-act=reset-go]').click(); await s.settle(6);
        assert.notEqual(await settingsText(p), before, 'réglages réinitialisés');
        assert.equal(await p.evaluate(() => lsGet(DriveSync.PAUSE) != null), true, 'pause posée');
        await p.evaluate(async () => { await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); });
        assert.equal((await drive(p)).writes, w0, 'écriture Drive pendant la pause');
        assert.equal(await p.evaluate(() => DRIVE_UI.sync.status.state), 'PAUSED');
        assert.equal(await p.locator('#syncPause [data-act=sync-recover]').count(), 1); assert.equal(await p.locator('#syncPause [data-act=sync-replace]').count(), 1);
        assert.equal(await journal(p), journalBefore);
      });
      await check(dev + ' · pause : nouvelle saisie puis rechargement, toujours 0 écriture ; choix persistant, rien en clair', async () => {
        await p.evaluate(async () => { S.horizon = 6; saveSettings(); await TWRC_VAULT.flush(); await DRIVE_UI.sync.run(true); });
        assert.equal((await drive(p)).writes, w0);
        await p.reload(); await s.settle(14); await installDrive(p);
        await p.evaluate(async () => { await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); });
        assert.equal((await drive(p)).writes, w0, 'écriture Drive après rechargement');
        await reveal(p, '#syncPause [data-act=sync-recover]');
        assert.match(await p.locator('#syncPause').innerText(), /Rien n’est envoyé à Drive/);
        const raw = await rawOf(s.c); assert.equal(raw['twrc.sync.paused.v1'], undefined, 'marqueur de pause en clair sur le disque');
        assert.equal(await journal(p), journalBefore);
      });
      await check(dev + ' · « Remplacer aussi Drive » : mot REMPLACER exigé, abandon sans envoi', async () => {
        await p.locator('#syncPause [data-act=sync-replace]').click(); await s.settle(1);
        assert.equal(await p.locator('[data-act=sync-replace-go]').isDisabled(), true);
        await p.locator('#replaceWord').fill('REMPLAC'); assert.equal(await p.locator('[data-act=sync-replace-go]').isDisabled(), true);
        await p.locator('#replaceWord').fill('RÉINITIALISER'); assert.equal(await p.locator('[data-act=sync-replace-go]').isDisabled(), true);
        await p.locator('[data-act=sync-replace-cancel]').click(); await s.settle(1);
        assert.equal((await drive(p)).writes, w0); assert.equal(await p.evaluate(() => lsGet(DriveSync.PAUSE) != null), true, 'pause conservée');
      });
      await check(dev + ' · « Récupérer mes données depuis Drive » : réglages identiques à l’octet à la version Drive, 0 écriture, journal intact', async () => {
        await p.locator('#syncPause [data-act=sync-recover]').click();
        await p.waitForFunction(() => !UI.syncBusy && !DRIVE_UI.sync.status.running, null, { timeout: 60000 }); await s.settle(2);
        assert.equal(await settingsText(p), driveSettings, 'réglages différents de la version Drive');
        assert.equal(await p.evaluate(() => S.cars[0].name), 'Voiture fictive test');
        assert.equal(await p.evaluate(() => lsGet(DriveSync.PAUSE)), null, 'pause levée après récupération');
        assert.equal(await p.locator('#syncPause').count(), 0);
        assert.equal((await drive(p)).revisions, 1, 'aucune nouvelle version Drive'); assert.equal((await drive(p)).writes, w0, 'récupération sans écriture Drive');
        assert.equal(await p.evaluate(() => DRIVE_UI.sync.status.conflicts.length), 0);
        assert.equal(await journal(p), journalBefore);
      });
      await check(dev + ' · « Remplacer aussi Drive » avec REMPLACER : envoi après le mot seulement, puis synchro normale ; journal intact', async () => {
        await reveal(p, '#resetZone [data-act=reset]'); await p.locator('[data-act=reset]').click(); await s.settle(1);
        await p.locator('#resetWord').fill('reinitialiser'); await p.locator('[data-act=reset-go]').click(); await s.settle(6);
        const reset = await settingsText(p); await p.evaluate(() => DRIVE_UI.sync.run(true));
        assert.equal((await drive(p)).writes, w0, 'envoi avant le choix');
        await reveal(p, '#syncPause [data-act=sync-replace]'); await p.locator('#syncPause [data-act=sync-replace]').click(); await s.settle(1);
        await p.locator('#replaceWord').fill('remplacer'); assert.equal(await p.locator('[data-act=sync-replace-go]').isEnabled(), true);
        await p.locator('[data-act=sync-replace-go]').click();
        await p.waitForFunction(() => !UI.syncBusy && !DRIVE_UI.sync.status.running, null, { timeout: 60000 }); await s.settle(2);
        const after = await drive(p); assert(after.writes > w0, 'aucun envoi après REMPLACER'); assert.equal(after.revisions, 2);
        assert.equal(await p.evaluate(() => lsGet(DriveSync.PAUSE)), null); assert.equal(await p.evaluate(() => DRIVE_UI.sync.status.message), 'synchronisé');
        assert.equal(await settingsText(p), reset);
        await p.evaluate(async () => { S.horizon = 6; saveSettings(); await TWRC_VAULT.flush(); await DRIVE_UI.sync.run(true); });
        assert.equal((await drive(p)).revisions, 3, 'la synchro reprend normalement');
        assert.equal(await journal(p), journalBefore);
      });
      await s.settle(3); await s.c.close();
    }
    await check('aucune exception JavaScript', async () => assert.deepEqual(errors, []));
    if (NETWORK_NOISE.length) console.log('ℹ️ requêtes réseau coupées signalées par WebKit : ' + NETWORK_NOISE.length);
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + (step || 'préparation du parcours') + '\n' + e.message.replace(/[\r\n]+/g, ' ')); process.exitCode = 1; });
