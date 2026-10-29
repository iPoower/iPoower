/* Réglages → Sauvegarde. Aucun changement des écrans Twin Garage.
 * Deux gestes visibles (Sauvegarder / Récupérer) ; les commandes détaillées restent dans « Options avancées ». */
let DRIVE_UI = { config: null, session: null, sync: null, prepared: false, selected: false, busy: false,
  text: 'Google Drive : non activé sur cette version.', timer: null, dedicatedFolders: [], advanced: false };
function driveSummary(d, connected) {
  if (!d.config) return 'Sauvegarde automatique non disponible sur cette adresse. La copie fichier ci-dessous reste disponible.';
  const st = d.status || null;
  if (connected && d.selected) return !st ? '🔄 Active · vérification en cours' : st.state === 'SYNCED' ? '✅ Active · dernière sauvegarde envoyée, relue et vérifiée'
    : st.state === 'CONFLICT' || st.state === 'SYNC_BLOCKED' ? '⚠️ Action requise · ' + st.message : '🔄 Active · envoi en cours ou en attente';
  if (d.hint) return '⏸ En pause · Google demande un geste à chaque ouverture : appuie sur Sauvegarder mes données.';
  return 'Pas encore activée sur cet appareil : appuie sur Sauvegarder mes données (une seule fois, puis automatique).';
}
function renderDriveSync() {
  const root = document.getElementById('driveSyncPanel'); if (!root) return;
  const d = DRIVE_UI, connected = d.session && d.session.connected;
  renderDriveResume();
  root.innerHTML = `<p class="sub"><b>${esc(driveSummary(d, connected))}</b></p>`;
  const main = document.createElement('div'); main.className = 'chips'; root.appendChild(main);
  const button = (label, action, disabled = false, target = root, primary = false) => {
    const b = document.createElement('button'); b.className = primary ? 'btn pri' : 'btn'; b.textContent = label; b.disabled = disabled || d.busy;
    b.addEventListener('click', action); target.appendChild(b); return b;
  };
  button('☁️ Sauvegarder mes données', driveSave, false, main, true);
  button('🔄 Récupérer mes données', driveRecover, false, main);
  const status = document.createElement('p'); status.className = 'sub'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = d.text; root.appendChild(status);
  const st = d.status || null, line = (text, target = root) => { const p = document.createElement('p'); p.className = 'sub'; p.textContent = text; target.appendChild(p); return p; };
  if (st && st.conflictDetails && st.conflictDetails.length) {
    line('CONFLIT · action requise. Les deux versions sont conservées ; rien n’est remplacé sans ton choix.').setAttribute('role', 'alert');
    const show = v => { const t = v === undefined ? '(absent)' : JSON.stringify(v); return t.length > 120 ? t.slice(0, 117) + '…' : t; };
    for (const c of st.conflictDetails) {
      line(c.path + ' · cet appareil : ' + show(c.local) + ' · autre appareil (…' + String(c.device).slice(-6) + ') : ' + show(c.remote));
      if (!c.resolvable) { line('Résolution impossible dans l’app pour ce type d’écart (véhicule ajouté ou retiré d’un seul côté, ou donnée entière). Les deux versions restent conservées, mais les nouvelles saisies de l’autre appareil ne seront PAS intégrées ici tant que ce point n’est pas traité. Exporte une copie complète de chaque appareil.'); continue; }
      for (const [label, choice] of [['Garder cet appareil', 'local'], ['Prendre l’autre appareil', 'remote']])
        button(label + ' · ' + c.path, async () => {
          try { d.sync.resolve(c.id, c.path, choice); d.text = 'Choix enregistré : vérification et synchronisation…'; await d.sync.run(true); }
          catch { d.text = 'Choix non appliqué : conflit modifié entre-temps. Les deux versions restent conservées.'; }
          renderDriveSync();
        });
    }
  }
  // Options avancées : toutes les commandes existantes, repliées par défaut, inchangées.
  const more = document.createElement('details'); more.id = 'driveAdvanced'; more.open = !!d.advanced;
  more.addEventListener('toggle', () => { d.advanced = more.open; });
  more.innerHTML = '<summary>Options avancées (compte, dossier, copies, état détaillé)</summary>'; root.appendChild(more);
  line('Copies chiffrées avec le code de Race Control, versions conservées. Le même compte Google et le même dossier doivent être choisis sur chaque appareil. La synchronisation reprend lorsque l’app est ouverte ; Safari peut la suspendre en arrière-plan.', more);
  const recover = document.createElement('a'); recover.className = 'btn'; recover.href = './recovery.html';
  recover.textContent = 'Récupération sur un nouvel appareil'; more.appendChild(recover);
  // État en trois volets : jamais « tout est sauvegardé » quand seule la copie locale est confirmée.
  line('LOCAL · coffre chiffré sur cet appareil : ' + (window.TWRC_STORAGE_ERROR ? 'échec d’écriture locale, données en mémoire à vérifier' : window.TWRC_VAULT && window.TWRC_VAULT.pendingWrites ? 'écriture en attente' : 'enregistré'), more);
  line('CLOUD · ' + (!d.config ? 'Google Drive non activé sur cette version' : !connected ? 'connexion requise (aucune copie Drive envoyée depuis cet appareil tant qu’elle manque)' :
    !st ? 'en attente' : ({ SYNCED: 'envoi confirmé et relu (intégrité vérifiée)', VERIFYING: 'envoi ou vérification en cours', PENDING: 'en attente d’envoi', CONFLICT: st.message, SYNC_BLOCKED: 'bloqué : ' + st.message, LOCAL: 'local seulement' })[st.state] || st.message), more);
  line('PÉRIMÈTRE · Drive exclut volontairement la position, le trajet en cours, les caches, le code et la mémoire thermique des pneus (estimation de quelques heures) ; la copie complète exportée les contient.', more);
  button('Copies avant fusion (toutes)', async () => {
    try { d.copies = await DriveSync.premergeRecoveries(); d.text = d.copies.length ? d.copies.length + ' copie(s) avant fusion conservée(s) sur cet appareil.' : 'Aucune fusion locale effectuée : pas de copie avant fusion.'; }
    catch { d.text = 'Copies avant fusion non lisibles. Aucun fichier annoncé complet.'; }
    renderDriveSync();
  }, false, more);
  for (const copy of d.copies || []) {
    line('Copie avant fusion · ' + (copy.at ? new Date(copy.at).toLocaleString('fr-FR') : 'date inconnue (copie antérieure)') + ' · ' + copy.size + ' octets · ' + copy.hash.slice(0, 12), more);
    button('Exporter cette copie', async () => {
      try { const bytes = await DriveSync.premergeRecovery(undefined, undefined, copy.hash); await downloadRecovery(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { d.text = 'Copie avant fusion non lisible ou altérée. Aucun fichier annoncé complet.'; renderDriveSync(); }
    }, false, more);
  }
  if (!d.config) return;
  // Reprise : même compte et même dossier qu'une liaison déjà confirmée ⇒ un geste (deux à la première
  // ouverture : chargement Google puis autorisation). Aucun jeton conservé ; Google exige ce geste.
  if (d.hint && !(connected && d.selected)) button(d.prepared ? 'Reprendre la synchronisation Drive' : 'Préparer la reprise Drive', async () => {
    d.busy = true;
    try {
      if (!d.prepared) { await d.session.prepare(); d.prepared = true; d.text = 'Connexion prête : appuie sur Reprendre la synchronisation Drive.'; return; }
      d.sync.stop(); d.selected = false; const promise = d.session.connect();   // appel synchrone dans le geste
      await promise; const selected = await d.session.resume(d.hint);
      d.sync.select(selected); d.selected = true; d.text = 'Synchronisation reprise avec le même compte et le même dossier.'; await d.sync.run(true);
    } catch (e) { d.text = e && e.code === 'confirmation' ? 'Compte ou dossier différent de la liaison confirmée : confirme explicitement le compte, puis le dossier.' : 'Reprise non confirmée. Les copies et la file d’envoi sont conservées ; réessaie depuis ce bouton.'; }
    finally { d.busy = false; renderDriveSync(); }
  }, false, more);
  button(!d.prepared ? 'Préparer la connexion Google' : connected ? 'Changer de compte Google' : 'Se connecter à Google', async () => {
    d.busy = true;
    try {
      if (!d.prepared) { await d.session.prepare(); d.prepared = true; d.text = 'Connexion prête. Appuie sur Se connecter à Google.'; }
      else { d.sync.stop(); d.selected = false; d.dedicatedFolders = []; const promise = d.session.connect(); await promise; d.text = 'Compte affiché : confirme explicitement ce compte dédié avant tout accès aux fichiers.'; }
    } catch { d.text = 'Connexion Google non confirmée. Réessaie depuis ce bouton.'; }
    finally { d.busy = false; renderDriveSync(); }
  }, false, more);
  if (connected && d.session.identity) {
    const account = document.createElement('p'); account.className = 'sub'; account.textContent = 'Compte Google sélectionné : ' + d.session.identity.label; more.appendChild(account);
    if (!d.session.confirmed) button('Confirmer ce compte dédié', () => {
      try { d.session.confirmAccount(d.session.identity.id); d.text = 'Compte confirmé. Crée un dossier neuf dédié ou retrouve les dossiers déjà autorisés pour cette application.'; }
      catch { d.text = 'Compte non confirmé. Reconnecte le compte dédié.'; }
      renderDriveSync();
    }, false, more);
  }
  if (connected && d.session.confirmed) {
    button('Créer un dossier neuf dédié', async () => {
      d.busy = true; d.selected = false; const paused = d.sync.pause();
      try { await d.session.newFolder(); await paused; d.dedicatedFolders = []; d.text = 'Dossier neuf dédié créé et relu. Retrouve les dossiers dédiés pour le sélectionner.'; }
      catch { d.text = 'Création non confirmée. Réessaie avec le même compte : aucun dossier existant ne sera remplacé.'; }
      finally { d.busy = false; renderDriveSync(); }
    }, false, more);
    button('Retrouver les dossiers dédiés', async () => {
      d.busy = true; d.selected = false; d.dedicatedFolders = []; const paused = d.sync.pause();
      try { [d.dedicatedFolders] = await Promise.all([d.session.listDedicatedFolders(), paused]); d.text = d.dedicatedFolders.length ? 'Dossiers dédiés retrouvés. Choisis explicitement celui à utiliser.' : 'Aucun dossier dédié autorisé trouvé. Crée un dossier neuf, puis actualise cette liste.'; }
      catch { d.text = 'Liste des dossiers non confirmée. Les fichiers et la file sont conservés.'; }
      finally { d.busy = false; renderDriveSync(); }
    }, false, more);
    for (const folder of d.dedicatedFolders) {
      const label = document.createElement('p'); label.className = 'sub';
      label.textContent = folder.name + ' · créé le ' + new Date(folder.createdTime).toLocaleString('fr-FR') + ' · référence ' + folder.id.slice(-8); more.appendChild(label);
      button('Utiliser ce dossier', async () => {
        d.busy = true; d.selected = false; const paused = d.sync.pause();
        try { const [selected] = await Promise.all([d.session.chooseDedicatedFolder(folder.id), paused]); d.sync.select(selected); d.selected = true; d.text = 'Dossier dédié relu et sélectionné : ' + selected.folder; await d.sync.run(true); }
        catch { d.text = 'Dossier non sélectionné ou accès non confirmé. Les fichiers et la file sont conservés.'; }
        finally { d.busy = false; renderDriveSync(); }
      }, false, more);
    }
    button('Choisir le dossier Google Drive', async () => {
      d.busy = true; d.selected = false; const paused = d.sync.pause();
      try { const promise = d.session.chooseFolder(); const [selected] = await Promise.all([promise, paused]); d.sync.select(selected); d.selected = true; d.text = 'Dossier dédié sélectionné : ' + selected.folder; await d.sync.run(true); }
      catch { d.text = 'Dossier non sélectionné ou accès non confirmé. Les fichiers et la file sont conservés.'; }
      finally { d.busy = false; renderDriveSync(); }
    }, false, more);
  }
  if (connected && d.selected) button('Sauvegarder maintenant (envoi, relecture, vérification)', () => d.sync.run(true), false, more);
  if (connected) button('Déconnecter', () => { d.session.disconnect(); d.sync.stop(); d.selected = false; d.dedicatedFolders = []; d.text = 'Déconnecté. Les copies locales et Drive sont conservées.'; renderDriveSync(); }, false, more);
}
// Parcours guidé : chaque étape réutilise les gestes existants (compte puis dossier confirmés
// explicitement, fusion par le moteur, conflits montrés) ; aucun choix silencieux.
function driveFailure(e) {
  const code = e && e.code;
  return code === 'auth' || code === 'cancelled' ? 'Connexion Google non confirmée (fenêtre fermée ou accès refusé). Tes données restent sur cet appareil ; réessaie.'
    : code === 'network' ? 'Réseau ou Google indisponible. Tes données restent sur cet appareil ; réessaie plus tard.'
      : code === 'confirmation' ? 'Compte ou dossier non confirmé. Rien n’a été envoyé ni remplacé.'
        : 'Sauvegarde non confirmée. Tes données restent sur cet appareil ; réessaie ou ouvre Options avancées.';
}
async function driveStep(work) {
  const d = DRIVE_UI; d.busy = true; renderDriveSync();
  try { await work(); } catch (e) { d.text = driveFailure(e); } finally { d.busy = false; renderDriveSync(); }
}
async function driveAttach(selected) {
  const d = DRIVE_UI; await d.sync.pause(); d.sync.select(selected); d.selected = true;
  d.text = 'Sauvegarde automatique active : chaque modification est envoyée, relue et vérifiée tant que l’app est ouverte.';
  await d.sync.run(true);
}
function driveSave() {
  const d = DRIVE_UI, VS = window.TWRC_VAULT;
  if (d.busy) return;
  if (!d.config || !d.session) { d.text = 'Sauvegarde automatique non disponible sur cette adresse. Utilise la copie fichier (Exporter).'; renderDriveSync(); return; }
  if (DEMO.on) { d.text = 'Quitte la démonstration avant de sauvegarder.'; renderDriveSync(); return; }
  if (!VS || VS.mode !== 'vault') { d.text = 'Déverrouille d’abord Race Control avec ton code, puis réessaie.'; renderDriveSync(); return; }
  // Première fois seulement : la copie complète (fichier) réactive le journal, condition existante de l'envoi.
  if (VS.journalNeedsRecovery) {
    d.text = 'Première sauvegarde sur cet appareil : une copie de sécurité complète est d’abord enregistrée (fichier chiffré), puis l’app redémarre. Appuie ensuite de nouveau sur Sauvegarder mes données.'; renderDriveSync();
    backupExport(); return;
  }
  const connected = d.session.connected;
  if (connected && d.selected) { driveStep(async () => { await d.sync.run(true); }); return; }
  if (!d.prepared) {
    driveStep(async () => { await d.session.prepare(); d.prepared = true; d.text = 'Google est prêt : appuie encore une fois sur Sauvegarder mes données.'; });
    return;
  }
  // GIS exige que la fenêtre Google s'ouvre dans le geste : connect() avant tout await.
  let pending = null;
  if (!connected) { d.sync.stop(); d.selected = false; d.dedicatedFolders = []; pending = d.session.connect(); }
  driveStep(async () => {
    if (pending) await pending;
    // Même compte et même dossier que la liaison déjà confirmée : reprise directe.
    if (d.hint) {
      try { await driveAttach(await d.session.resume(d.hint)); return; }
      catch (e) { if (!(e && e.code === 'confirmation')) throw e; }
    }
    if (!d.session.confirmed) {
      if (!confirm('Sauvegarder Race Control avec le compte Google ' + d.session.identity.label + ' ?')) { d.text = 'Compte non confirmé. Rien n’a été envoyé.'; return; }
      d.session.confirmAccount(d.session.identity.id);
    }
    let folders = await d.session.listDedicatedFolders();
    if (!folders.length) {
      if (!confirm('Aucun dossier de sauvegarde Race Control sur ce compte. En créer un maintenant ?')) { d.text = 'Aucun dossier créé. Rien n’a été envoyé.'; return; }
      await d.session.newFolder(); folders = await d.session.listDedicatedFolders();
    }
    if (folders.length !== 1) {
      d.dedicatedFolders = folders; d.advanced = true;
      d.text = folders.length ? 'Plusieurs dossiers de sauvegarde trouvés : choisis celui à utiliser (Options avancées → Utiliser ce dossier).' : 'Dossier créé mais pas encore visible : réessaie dans un instant.';
      return;
    }
    const folder = folders[0];
    if (!confirm('Utiliser le dossier de sauvegarde « ' + folder.name + ' » (référence ' + folder.id.slice(-8) + ') ? Les données de cet appareil et celles déjà présentes sont fusionnées ; en cas d’écart, rien n’est remplacé sans ton choix.')) { d.text = 'Dossier non confirmé. Rien n’a été envoyé.'; return; }
    await driveAttach(await d.session.chooseDedicatedFolder(folder.id));
  });
}
async function driveRecover() {
  const d = DRIVE_UI, VS = window.TWRC_VAULT;
  let blank = false;
  try { blank = !!VS && VS.mode === 'plain' && await VS.syncCanInitialize(); } catch { blank = false; }
  if (blank && d.config) { location.href = './recovery.html'; return; }
  d.text = blank ? 'Récupération depuis Google Drive non disponible sur cette adresse. Importe une copie fichier (Importer).'
    : 'Cet appareil contient déjà tes données Race Control : elles sont conservées. Pour y ajouter celles de Google Drive, appuie sur Sauvegarder mes données : les deux sont fusionnées et rien n’est remplacé sans ton choix. Pour un fichier exporté : Importer.';
  renderDriveSync();
}
// Bandeau de reprise sur l'écran principal : Google exige un geste par ouverture (aucun jeton conservé).
function renderDriveResume() {
  let bar = document.getElementById('driveResume');
  const d = DRIVE_UI, show = d.config && d.session && d.hint && !(d.session.connected && d.selected) && !DEMO.on &&
    window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault';
  if (!show) { if (bar) bar.replaceChildren(); return; }
  if (!bar) { const host = document.getElementById('demoBar'); if (!host) return; bar = document.createElement('div'); bar.id = 'driveResume'; host.after(bar); }
  bar.innerHTML = '<div class="note lv1" role="status"><b>☁️ SAUVEGARDE EN PAUSE</b><span>Tes modifications sont gardées sur cet appareil. Un geste suffit pour reprendre l’envoi automatique vers Google Drive.</span></div>';
  const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = d.busy ? 'Reprise…' : 'Reprendre la sauvegarde'; b.disabled = !!d.busy;
  b.addEventListener('click', driveSave); bar.firstChild.appendChild(b);
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
      onChange: state => { DRIVE_UI.text = state.message; DRIVE_UI.status = state; renderDriveSync(); },
      onApplied: () => {
        S = loadSettings();
        const context = lsGet(USER_STORE.key); if (context) USER_STORE.receive(context);
        TRIPCANCEL = TripCancel.load(APP_STORAGE, Date.now()); rebuild(); renderAll();
      } });
    DRIVE_UI.text = 'Prêt à connecter Google Drive. Exporte d’abord une copie complète et vérifiée de cet appareil.';
    try { DRIVE_UI.hint = await DriveSync.resumeHint(); } catch { DRIVE_UI.hint = null; }
    // Liaison déjà confirmée : charger Google à l'avance pour qu'un seul geste suffise à la reprise.
    if (DRIVE_UI.hint) DRIVE_UI.session.prepare().then(() => { DRIVE_UI.prepared = true; renderDriveSync(); }, () => {});
    const tick = () => {
      if (DRIVE_UI.selected && !DRIVE_UI.session.connected) { DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; DRIVE_UI.text = 'Envoi Drive en pause : autorisation Google expirée ou révoquée. Les saisies restent enregistrées localement ; appuie sur Reprendre la sauvegarde.'; DriveSync.resumeHint().then(h => { DRIVE_UI.hint = h; renderDriveSync(); }, () => renderDriveSync()); return; }
      if (!document.hidden && !DEMO.on && DRIVE_UI.selected && DRIVE_UI.session.connected) DRIVE_UI.sync.run();
    };
    DRIVE_UI.timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick); window.addEventListener('focus', tick);
    // iPhone : l'app peut être suspendue dès son passage en arrière-plan ; envoyer la dernière saisie
    // sans attendre la fenêtre de calme (blocages et délais de reprise respectés).
    document.addEventListener('visibilitychange', () => { if (document.hidden && !DEMO.on && DRIVE_UI.selected && DRIVE_UI.session.connected) DRIVE_UI.sync.run(false, true); });
    // Saisie locale : vérifier juste après la fenêtre de calme au lieu d'attendre le prochain cycle de 30 s.
    let soon = null; window.addEventListener('twrc-vault-change', () => { clearTimeout(soon); soon = setTimeout(tick, SyncOutbox.QUIET_MS + 1000); });
    const stop = () => { DRIVE_UI.session.disconnect(); DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; DRIVE_UI.dedicatedFolders = []; renderDriveSync(); };
    window.addEventListener('twrc-session-expired', stop); window.addEventListener('twrc-session-locked', stop);
    window.addEventListener('pagehide', stop); renderDriveSync();
  } catch { /* configuration absente/non approuvée : sauvegardes locales inchangées */ }
}
