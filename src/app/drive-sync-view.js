/* Réglages → Sauvegarde. Aucun changement des écrans Twin Garage. */
let DRIVE_UI = { config: null, session: null, sync: null, prepared: false, selected: false, busy: false,
  text: 'Google Drive : non activé sur cette version.', timer: null };
function renderDriveSync() {
  const root = document.getElementById('driveSyncPanel'); if (!root) return;
  const d = DRIVE_UI, connected = d.session && d.session.connected;
  root.innerHTML = `<h4>Google Drive · PC ↔ iPhone</h4><p class="sub" role="status" aria-live="polite">${esc(d.text)}</p>
    <p class="sub">Copies chiffrées avec le code de Race Control, versions conservées. Le même compte Google et le même dossier doivent être choisis sur chaque appareil. La synchronisation reprend lorsque l’app est ouverte ; Safari peut la suspendre en arrière-plan.</p>`;
  const button = (label, action, disabled = false) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.disabled = disabled || d.busy;
    b.addEventListener('click', action); root.appendChild(b);
  };
  button('Exporter la copie avant fusion', async () => {
    try { const bytes = await DriveStore.create('twrc.drive.sync.v1').latestRecovery(); if (!bytes) { d.text = 'Aucune fusion locale effectuée : pas de copie avant fusion.'; renderDriveSync(); return; }
      await downloadRecovery(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { d.text = 'Copie avant fusion non lisible. Aucun fichier annoncé complet.'; renderDriveSync(); }
  });
  if (!d.config) return;
  button(!d.prepared ? 'Préparer la connexion Google' : connected ? 'Changer de compte Google' : 'Se connecter à Google', async () => {
    d.busy = true;
    try {
      if (!d.prepared) { await d.session.prepare(); d.prepared = true; d.text = 'Connexion prête. Appuie sur Se connecter à Google.'; }
      else { const promise = d.session.connect(); d.selected = false; await promise; d.text = 'Connecté. Choisis le dossier de sauvegarde.'; }
    } catch { d.text = 'Connexion Google non confirmée. Réessaie depuis ce bouton.'; }
    finally { d.busy = false; renderDriveSync(); }
  });
  if (connected) button('Choisir le dossier Google Drive', async () => {
    d.busy = true;
    try { const promise = d.session.chooseFolder(); const selected = await promise; d.sync.select(selected); d.selected = true; await d.sync.run(true); }
    catch { d.text = 'Dossier non sélectionné ou accès non confirmé. Les fichiers sont conservés.'; }
    finally { d.busy = false; renderDriveSync(); }
  });
  if (connected && d.selected) button('Vérifier et synchroniser maintenant', () => d.sync.run(true));
  if (connected) button('Déconnecter', () => { d.session.disconnect(); d.sync.stop(); d.selected = false; d.text = 'Déconnecté. Les copies locales et Drive sont conservées.'; renderDriveSync(); });
}
async function backupDriveImport(bytes) {
  if (DEMO.on) { bkMsg('Quitte la démonstration avant une restauration.'); return; }
  try {
    const pass = bkPass(); if (!pass) throw new Error('code');
    const codec = ControlVaultPacket.create({ validateBusiness: DriveSync.validateBusiness });
    const data = await codec.open(bytes, pass, ControlVaultPacket.loadedVersion(window.TWRC_BUILD, VER));
    if (!confirm('Fusionner cette copie chiffrée avec les données de cet appareil ? Une copie locale avant fusion sera conservée. Aucun conflit ne sera arbitré automatiquement.')) { bkMsg('Restauration annulée.'); return; }
    const store = DriveStore.create('twrc.drive.sync.v1');
    await window.TWRC_VAULT.syncApply(values => {
      const result = SyncMerge.values(values, data.values), r = result.report;
      if (r.keysKept.length || r.settings && r.settings.conflicts.length) throw new Error('conflict');
      return result.values;
    }, bytes => store.recovery(bytes));
    bkMsg('Copie authentifiée et fusionnée. Copie avant fusion conservée. Redémarrage…'); reloadSafe(800);
  } catch { bkMsg('Import non appliqué : code, version, contenu ou réglages divergents à vérifier. Les copies et les données locales sont conservées.'); }
}
async function initDriveSync() {
  // Ni requête de configuration ni script Google sur l'origine partagée.
  if (location.protocol !== 'https:' || /(^|\.)github\.io$/.test(location.hostname)) return;
  try {
    const config = await GoogleDriveSession.load();
    if (location.origin !== config.raceOrigin) return;
    const provider = new DriveTransport.OpaqueDrive([config.raceOrigin]);
    DRIVE_UI.config = config; window.TWRC_DRIVE_CONFIGURED = true;
    DRIVE_UI.session = GoogleDriveSession.create(config, provider);
    DRIVE_UI.sync = DriveSync.create({ vault: window.TWRC_VAULT, provider,
      version: () => ControlVaultPacket.loadedVersion(window.TWRC_BUILD, VER),
      onChange: state => { DRIVE_UI.text = state.message; renderDriveSync(); },
      onApplied: () => {
        S = loadSettings();
        const context = lsGet(USER_STORE.key); if (context) USER_STORE.receive(context);
        TRIPCANCEL = TripCancel.load(APP_STORAGE, Date.now()); rebuild(); renderAll();
      } });
    DRIVE_UI.text = 'Prêt à connecter Google Drive. Exporte d’abord une copie complète et vérifiée de cet appareil.';
    const tick = () => { if (!document.hidden && !DEMO.on && DRIVE_UI.selected && DRIVE_UI.session.connected) DRIVE_UI.sync.run(); };
    DRIVE_UI.timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    const stop = () => { DRIVE_UI.session.disconnect(); DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; renderDriveSync(); };
    window.addEventListener('twrc-session-expired', stop); window.addEventListener('twrc-session-locked', stop);
    window.addEventListener('pagehide', stop); renderDriveSync();
  } catch { /* configuration absente/non approuvée : sauvegardes locales inchangées */ }
}
