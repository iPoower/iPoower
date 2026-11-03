// Lot S · sauvegarde visible. Constats terrain (Chromium sous Windows) : Drive coupé affichait trois libellés différents pour
// le même état (« Reconnexion requise », « Prêt à connecter Google Drive », « Se connecter à Google »), sans date de dernière
// copie réussie, pendant que la synthèse disait « Données critiques fraîches » ; Diagnostic affichait « Stockage local :
// DURABLE » alors que navigator.storage.persisted() renvoyait false et que storage.persist() n'était jamais demandé.
// Vraie app, Drive simulé (aucun appel Google) : envoi réel par DriveSync avec un fournisseur fictif, puis coupure de la
// session Google. Données fictives. Ce test CONSTATE : chaque écart est listé, aucun n'est masqué.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const activateJournal = require('./lib/journal-activation');
const AT = '2026-11-03T18:00:00+01:00';
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 500)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 500)); } };
// navigator.storage simulé : persisted() = false (navigateur non persistant), persist() refusé ; chaque appel est compté.
const STORAGE_STUB = () => {
  window.__persist = { asked: 0, granted: false };
  const st = navigator.storage || {};
  const fake = { persisted: async () => window.__persist.granted, persist: async () => { window.__persist.asked++; return window.__persist.granted; },
    estimate: st.estimate ? st.estimate.bind(st) : async () => ({}), getDirectory: st.getDirectory ? st.getDirectory.bind(st) : undefined };
  Object.defineProperty(navigator, 'storage', { configurable: true, get: () => fake });
};
// Drive simulé en mémoire de la page, branché sur le VRAI rappel d'état de l'app (driveOnChange) quand il existe.
const installDrive = p => p.evaluate(() => {
  const files = {}; let id = 0;
  const hex = async u => [...new Uint8Array(await crypto.subtle.digest('SHA-256', u))].map(x => x.toString(16).padStart(2, '0')).join('');
  const profiles = {};
  const download = ref => ({ packet: { copyBytes: () => files[ref.fileId].bytes.slice() }, proof: { ...ref, state: 'verified-bytes', verifiedAt: Date.now() } });
  const provider = { disconnect() {},
    async reserveId() { return 'file_' + (++id); },
    async profiles() { return Object.values(profiles); },
    async uploadProfile(fileId, folder, bytes) { profiles[fileId] = { fileId, bytes: bytes.slice(), sha256: await hex(bytes) }; return profiles[fileId]; },
    async list() { return Object.values(files).map(f => f.ref); },
    async download(ref) { return download(ref); },
    async uploadRevision(fileId, folder, packet, rev) { const bytes = packet.copyBytes();
      files[fileId] = { bytes, ref: { fileId, fileSha256: await hex(bytes), cipherSha256: JSON.parse(new TextDecoder().decode(bytes)).sha256, size: bytes.length, revision: JSON.parse(JSON.stringify(rev)), state: 'unverified' } };
      return download(files[fileId].ref); } };
  const fallback = state => { DRIVE_UI.text = state.message; DRIVE_UI.status = state; if (state.state === 'SYNCED') { DRIVE_BADGE.pending = 0; DRIVE_BADGE.syncedAt = Date.now(); } renderDriveSync(); };
  window.TWRC_DRIVE_CONFIGURED = true; DRIVE_UI.config = DRIVE_UI.config || { raceOrigin: location.origin };
  DRIVE_UI.session = { connected: true, disconnect() {}, prepare: async () => {} };
  DRIVE_UI.sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999',
    onChange: typeof driveOnChange === 'function' ? driveOnChange : fallback, onApplied: () => {} });
  DRIVE_UI.sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); DRIVE_UI.selected = true; DRIVE_UI.prepared = true;
  // Sans drive-config.json servi, initDriveSync ne câble pas l'écouteur : le banc branche le MÊME gestionnaire que l'app.
  if (typeof driveVaultChange === 'function' && !window.__driveWired) { window.__driveWired = true; window.addEventListener('twrc-vault-change', driveVaultChange); }
});
const cut = p => p.evaluate(() => {   // session Google expirée : même effet que le minuteur de l'app (tick)
  DRIVE_UI.session.connected = false; DRIVE_UI.sync.stop(); DRIVE_UI.selected = false;
  DRIVE_UI.hint = { folder: 'dossier-fictif', binding: 'a'.repeat(64) };
  if (typeof driveSessionLost === 'function') driveSessionLost(); else DRIVE_UI.text = 'Envoi Drive en pause : autorisation Google expirée ou révoquée. Les saisies restent enregistrées localement ; appuie sur Reprendre la synchronisation Drive.';
  renderDriveSync();
});
const view = p => p.evaluate(() => {
  const badge = document.getElementById('driveBadge'), panel = document.getElementById('driveSyncPanel');
  return { badge: badge ? badge.textContent.replace(/\s+/g, ' ').trim() : '', aria: badge ? badge.getAttribute('aria-label') : '',
    panel: panel ? panel.textContent.replace(/\s+/g, ' ') : '(panneau absent)', buttons: panel ? [...panel.querySelectorAll('button')].map(b => b.textContent.trim()) : [] };
});
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: AT, dev, geo: { lat: 48.8502, lon: 2.3501, acc: 20 } }), p = s.p;   // à la maison (lieu fictif confirmé)
      await s.c.addInitScript(STORAGE_STUB); await p.reload(); await s.settle(10);
      await activateJournal(p);
      // ---------- Stockage : persistance demandée une fois, à la première écriture du coffre ----------
      await p.evaluate(async () => { S.horizon = 18; saveSettings(); await TWRC_VAULT.flush(); S.horizon = 20; saveSettings(); await TWRC_VAULT.flush(); });
      await s.settle(2);
      const asked = await p.evaluate(() => window.__persist.asked);
      expect(`${dev} · storage.persist() demandé à la première écriture du coffre, une seule fois`, asked === 1, 'appels ' + asked);
      await p.evaluate(() => { UI.diag = true; renderSettings && renderSettings(true); });
      const store = await p.evaluate(() => (diagText().split('\n').find(l => /^Stockage local/.test(l)) || '(ligne absente)'));
      expect(`${dev} · Diagnostic : « persistant : non » affiché quand navigator.storage.persisted() = false`, /persistant : non/.test(store), store);
      expect(`${dev} · Diagnostic : jamais « DURABLE » pour une simple relecture après écriture`, !/DURABLE/.test(store), store);
      // ---------- Drive : envoi réel réussi, puis coupure de la session Google ----------
      await installDrive(p);
      await p.evaluate(async () => { await DRIVE_UI.sync.run(true); await DRIVE_UI.sync.run(false, true); }); await s.settle(3);
      const synced = await p.evaluate(() => DRIVE_UI.status && DRIVE_UI.status.state);
      expect(`${dev} · contexte : copie Drive envoyée, relue et vérifiée (SYNCED)`, synced === 'SYNCED', synced);
      const okAt = await p.evaluate(() => Date.now()), hm = new Date(okAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
      await p.clock.fastForward(5 * 60e3);
      await cut(p); await s.settle(2);
      const v1 = await view(p);
      expect(`${dev} · badge Drive coupé : date et heure de la dernière copie réussie (${hm})`, v1.aria.includes('dernière copie') && v1.aria.includes(hm), v1.aria);
      // Badge : libellé complet dans l'aria-label (le texte visible sur iPhone est la forme courte « Reconnecter »).
      expect(`${dev} · même libellé « Reconnexion requise » dans le badge et le panneau Sauvegarde`, /Reconnexion requise/.test(v1.aria) && (dev === 'pc' ? /Reconnexion requise/.test(v1.badge) : /Reconnecter/.test(v1.badge)) && (v1.panel.match(/Reconnexion requise/g) || []).length >= 1, 'badge « ' + v1.badge + ' » · panneau « ' + v1.panel.slice(0, 300) + ' »');
      expect(`${dev} · aucun autre libellé pour cet état (« Prêt à connecter Google Drive », « Se connecter à Google », « connexion requise »)`,
        !/Prêt à connecter Google Drive|Se connecter à Google|CLOUD · connexion requise/.test(v1.panel) && !v1.buttons.includes('Se connecter à Google'), v1.panel.slice(0, 400) + ' · boutons ' + JSON.stringify(v1.buttons));
      // ---------- Modification non sauvegardée : âge visible ----------
      await p.evaluate(() => { scrollTo(0, 0); UI.view = 'garage'; renderAll(); });
      await p.evaluate(async () => { S.cars[0].name = 'Voiture fictive modifiée'; saveSettings(); await TWRC_VAULT.flush(); }); await s.settle(2);
      await p.clock.fastForward(14 * 60e3); await p.evaluate(() => renderDriveBadge()); await s.settle(1);
      const v2 = await view(p);
      expect(`${dev} · badge : âge des modifications non sauvegardées (« 1 modif non sauvegardée depuis 14 min »)`, /1 modif non sauvegardée depuis 14 min/.test(v2.aria), v2.aria);
      // ---------- Aucun « tout va bien » global tant que Drive est coupé ----------
      await p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(3);
      const syn = await p.evaluate(() => (diagText().split('\n').find(l => /^Synthèse Race Control/.test(l)) || '(ligne absente)'));
      expect(`${dev} · synthèse : jamais « Données critiques fraîches » tant que Drive est coupé ; la coupure est nommée`, !/Données critiques fraîches/.test(syn) && /Sauvegarde Drive/.test(syn), syn);
      // ---------- Rechargement : la date de dernière copie et l'âge des modifications survivent ----------
      await p.reload(); await s.settle(12);
      await p.evaluate(() => { DRIVE_UI.config = DRIVE_UI.config || { raceOrigin: location.origin }; if (typeof driveVaultChange === 'function') window.addEventListener('twrc-vault-change', driveVaultChange); DRIVE_UI.hint = { folder: 'dossier-fictif', binding: 'a'.repeat(64) }; DRIVE_UI.session = { connected: false, disconnect() {}, prepare: async () => {} }; renderDriveSync(); });
      const v3 = await view(p);
      expect(`${dev} · après rechargement : dernière copie (${hm}) et modification non sauvegardée toujours affichées`, v3.aria.includes('dernière copie') && v3.aria.includes(hm) && /1 modif non sauvegardée depuis/.test(v3.aria), v3.aria);
      await s.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
