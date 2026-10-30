/* Réglages → Sauvegarde. Aucun changement des écrans Twin Garage. */
let DRIVE_UI = { config: null, session: null, sync: null, prepared: false, selected: false, busy: false,
  text: 'Google Drive : non activé sur cette version.', timer: null, dedicatedFolders: [] };
function renderDriveSync() {
  renderDriveBadge();
  const root = document.getElementById('driveSyncPanel'); if (!root) return;
  const d = DRIVE_UI, connected = d.session && d.session.connected;
  root.innerHTML = `<h4>Google Drive · PC ↔ iPhone</h4><p class="sub" role="status" aria-live="polite">${esc(d.text)}</p>
    <p class="sub">Copies chiffrées avec le code de Race Control, versions conservées. Le même compte Google et le même dossier doivent être choisis sur chaque appareil. La synchronisation reprend lorsque l’app est ouverte ; Safari peut la suspendre en arrière-plan.</p>`;
  const button = (label, action, disabled = false) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.disabled = disabled || d.busy;
    b.addEventListener('click', action); root.appendChild(b);
  };
  const recover = document.createElement('a'); recover.className = 'btn'; recover.href = './recovery.html';
  recover.textContent = 'Récupération sur un nouvel appareil'; root.appendChild(recover);
  // État en trois volets : jamais « tout est sauvegardé » quand seule la copie locale est confirmée.
  const st = d.status || null, line = text => { const p = document.createElement('p'); p.className = 'sub'; p.textContent = text; root.appendChild(p); return p; };
  line('LOCAL · coffre chiffré sur cet appareil : ' + (window.TWRC_STORAGE_ERROR ? 'échec d’écriture locale, données en mémoire à vérifier' : window.TWRC_VAULT && window.TWRC_VAULT.pendingWrites ? 'écriture en attente' : 'enregistré'));
  line('CLOUD · ' + (!d.config ? 'Google Drive non activé sur cette version' : !connected ? 'connexion requise (aucune copie Drive envoyée depuis cet appareil tant qu’elle manque)' :
    !st ? 'en attente' : ({ SYNCED: 'envoi confirmé et relu (intégrité vérifiée)', VERIFYING: 'envoi ou vérification en cours', PENDING: 'en attente d’envoi', CONFLICT: st.message, SYNC_BLOCKED: 'bloqué : ' + st.message, LOCAL: 'local seulement' })[st.state] || st.message));
  line('PÉRIMÈTRE · Drive exclut volontairement la position, le trajet en cours, les caches, le code et la mémoire thermique des pneus (estimation de quelques heures) ; la copie complète exportée les contient.');
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
  button('Copies avant fusion (toutes)', async () => {
    try { d.copies = await DriveSync.premergeRecoveries(); d.text = d.copies.length ? d.copies.length + ' copie(s) avant fusion conservée(s) sur cet appareil.' : 'Aucune fusion locale effectuée : pas de copie avant fusion.'; }
    catch { d.text = 'Copies avant fusion non lisibles. Aucun fichier annoncé complet.'; }
    renderDriveSync();
  });
  for (const copy of d.copies || []) {
    line('Copie avant fusion · ' + (copy.at ? new Date(copy.at).toLocaleString('fr-FR') : 'date inconnue (copie antérieure)') + ' · ' + copy.size + ' octets · ' + copy.hash.slice(0, 12));
    button('Exporter cette copie', async () => {
      try { const bytes = await DriveSync.premergeRecovery(undefined, undefined, copy.hash); await downloadRecovery(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { d.text = 'Copie avant fusion non lisible ou altérée. Aucun fichier annoncé complet.'; renderDriveSync(); }
    });
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
  });
  button(!d.prepared ? 'Préparer la connexion Google' : connected ? 'Changer de compte Google' : 'Se connecter à Google', async () => {
    d.busy = true;
    try {
      if (!d.prepared) { await d.session.prepare(); d.prepared = true; d.text = 'Connexion prête. Appuie sur Se connecter à Google.'; }
      else { d.sync.stop(); d.selected = false; d.dedicatedFolders = []; const promise = d.session.connect(); await promise; d.text = 'Compte affiché : confirme explicitement ce compte dédié avant tout accès aux fichiers.'; }
    } catch { d.text = 'Connexion Google non confirmée. Réessaie depuis ce bouton.'; }
    finally { d.busy = false; renderDriveSync(); }
  });
  if (connected && d.session.identity) {
    const account = document.createElement('p'); account.className = 'sub'; account.textContent = 'Compte Google sélectionné : ' + d.session.identity.label; root.appendChild(account);
    if (!d.session.confirmed) button('Confirmer ce compte dédié', () => {
      try { d.session.confirmAccount(d.session.identity.id); d.text = 'Compte confirmé. Crée un dossier neuf dédié ou retrouve les dossiers déjà autorisés pour cette application.'; }
      catch { d.text = 'Compte non confirmé. Reconnecte le compte dédié.'; }
      renderDriveSync();
    });
  }
  if (connected && d.session.confirmed) {
    button('Créer un dossier neuf dédié', async () => {
      d.busy = true; d.selected = false; const paused = d.sync.pause();
      try { await d.session.newFolder(); await paused; d.dedicatedFolders = []; d.text = 'Dossier neuf dédié créé et relu. Retrouve les dossiers dédiés pour le sélectionner.'; }
      catch { d.text = 'Création non confirmée. Réessaie avec le même compte : aucun dossier existant ne sera remplacé.'; }
      finally { d.busy = false; renderDriveSync(); }
    });
    button('Retrouver les dossiers dédiés', async () => {
      d.busy = true; d.selected = false; d.dedicatedFolders = []; const paused = d.sync.pause();
      try { [d.dedicatedFolders] = await Promise.all([d.session.listDedicatedFolders(), paused]); d.text = d.dedicatedFolders.length ? 'Dossiers dédiés retrouvés. Choisis explicitement celui à utiliser.' : 'Aucun dossier dédié autorisé trouvé. Crée un dossier neuf, puis actualise cette liste.'; }
      catch { d.text = 'Liste des dossiers non confirmée. Les fichiers et la file sont conservés.'; }
      finally { d.busy = false; renderDriveSync(); }
    });
    for (const folder of d.dedicatedFolders) {
      const label = document.createElement('p'); label.className = 'sub';
      label.textContent = folder.name + ' · créé le ' + new Date(folder.createdTime).toLocaleString('fr-FR') + ' · référence ' + folder.id.slice(-8); root.appendChild(label);
      button('Utiliser ce dossier', async () => {
        d.busy = true; d.selected = false; const paused = d.sync.pause();
        try { const [selected] = await Promise.all([d.session.chooseDedicatedFolder(folder.id), paused]); d.sync.select(selected); d.selected = true; d.text = 'Dossier dédié relu et sélectionné : ' + selected.folder; await d.sync.run(true); }
        catch { d.text = 'Dossier non sélectionné ou accès non confirmé. Les fichiers et la file sont conservés.'; }
        finally { d.busy = false; renderDriveSync(); }
      });
    }
    button('Choisir le dossier Google Drive', async () => {
      d.busy = true; d.selected = false; const paused = d.sync.pause();
      try { const promise = d.session.chooseFolder(); const [selected] = await Promise.all([promise, paused]); d.sync.select(selected); d.selected = true; d.text = 'Dossier dédié sélectionné : ' + selected.folder; await d.sync.run(true); }
      catch { d.text = 'Dossier non sélectionné ou accès non confirmé. Les fichiers et la file sont conservés.'; }
      finally { d.busy = false; renderDriveSync(); }
    });
  }
  if (connected && d.selected) button('Sauvegarder maintenant (envoi, relecture, vérification)', () => d.sync.run(true));
  if (connected) button('Déconnecter', () => { d.session.disconnect(); d.sync.stop(); d.selected = false; d.dedicatedFolders = []; d.text = 'Déconnecté. Les copies locales et Drive sont conservées.'; renderDriveSync(); });
}
// Badge de sauvegarde, visible depuis tous les écrans (barre d'état) : projection de l'état DriveSync,
// aucun nouveau stockage. Un appui ouvre Sauvegarde, ou reconnecte Google si la session a expiré.
const DRIVE_BADGE = { pending: 0, syncedAt: 0, hidden: false, lastAt: 0, sig: {} };
// Catégorie par clé, pour le seul compteur « N modifs en attente » : ce qui est envoyé, et quand, reste
// décidé par DriveSync. Saisies de l'utilisateur : réglages (Garage, compteur, pneus, entretien, réglages ;
// sauf le journal météo du matin, calculé) et débriefs (journal des trajets du contexte). Toute autre clé est
// automatique : relevés et comparaisons météo, contexte du jour, horodatages techniques, caches.
const DRIVE_USER_PART = {
  'twrc.settings.v1': v => { if (v && typeof v === 'object') delete v.journal; return v; },
  'twrc.context.v1': v => v && v.debrief ? v.debrief.entries : null,
  'twrc.debrief.v1': v => v && v.entries ? v.entries : null
};
function driveUserPart(key) {
  try { return JSON.stringify(DRIVE_USER_PART[key](JSON.parse(lsGet(key) || 'null'))); } catch { return ''; }
}
// Vrai si l'écriture change la partie saisie par l'utilisateur ; l'empreinte est tenue à jour à chaque écriture.
function driveUserWrite(key) {
  if (!Object.hasOwn(DRIVE_USER_PART, key)) return false;
  const part = driveUserPart(key), changed = part !== DRIVE_BADGE.sig[key];
  DRIVE_BADGE.sig[key] = part; return changed;
}
function driveNoteWrite(e) {
  const user = !!(e && e.key) && driveUserWrite(e.key);
  // Une saisie écrit souvent plusieurs clés : un enregistrement = une modification. Une fusion reçue
  // pendant une synchronisation n'est pas une saisie.
  if (!user || DRIVE_UI.sync && DRIVE_UI.sync.status.running || Date.now() - (DRIVE_BADGE.lastAt || 0) <= 800) return;
  DRIVE_BADGE.pending++; DRIVE_BADGE.lastAt = Date.now(); renderDriveBadge();
}
const DRIVE_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function driveBadgeState() {
  const d = DRIVE_UI, B = DRIVE_BADGE, st = d.status || {}, active = !!(d.session && d.session.connected && d.selected);
  const n = B.pending, wait = n ? ' · ' + n + ' modif' + (n > 1 ? 's' : '') + ' en attente' : '';
  if (!window.TWRC_VAULT || window.TWRC_VAULT.mode !== 'vault') return { cls: '', icon: '🔒', text: 'Sauvegarde en pause', hint: 'Déverrouille l’app pour synchroniser.', act: 'open' };
  // iOS suspend l'app fermée : aucune synchronisation possible en arrière-plan, le dire honnêtement.
  if (B.hidden && n) return { cls: 'cache', icon: '⏳', text: 'Ouvre l’app pour synchroniser' + wait, hint: 'Aucune synchronisation quand l’app est fermée.', act: 'open' };
  if (navigator.onLine === false) return { cls: 'nogo', icon: '⛔', text: 'Hors ligne' + wait, hint: 'Envoi automatique au retour du réseau, sans perte.', act: 'open' };
  if (!active) return d.hint ? { cls: 'cache', icon: '⚠️', text: 'Reconnexion requise' + wait, hint: 'Un appui pour reconnecter Google Drive (Google exige ce geste).', act: 'reconnect' }
    : { cls: '', icon: '☁️', text: 'Sauvegarde Drive à activer', hint: 'Ouvre Paramètres → Sauvegarde.', act: 'open' };
  if (st.state === 'SYNC_BLOCKED' && /reconnexion/.test(st.message)) return { cls: 'cache', icon: '⚠️', text: 'Reconnexion requise' + wait, hint: 'Un appui pour reconnecter Google Drive.', act: 'reconnect' };
  if (st.state === 'SYNC_BLOCKED' && /en attente/.test(st.message)) return { cls: 'cache', icon: '⏳', text: 'Envoi en attente' + wait, hint: 'Nouvel essai automatique.', act: 'open' };
  if (st.state === 'CONFLICT' || st.state === 'SYNC_BLOCKED') return { cls: 'cache', icon: '⚠️', text: 'Action requise', hint: st.message || 'Ouvre Sauvegarde.', act: 'open' };
  if (st.state === 'SYNCED' && !n) return { cls: 'live', icon: '☁️✓', text: 'À jour · ' + DRIVE_HM.format(B.syncedAt || Date.now()), hint: 'Dernière sauvegarde envoyée, relue et vérifiée.', act: 'open' };
  return { cls: 'cache', icon: '⏳', text: 'Envoi en cours', hint: 'Envoi, relecture et vérification automatiques.', act: 'open' };
}
function renderDriveBadge() {
  if (!DRIVE_UI.config) return;
  const bar = document.querySelector('.statusbar'); if (!bar) return;
  let b = document.getElementById('driveBadge');
  if (!b) {
    const row = document.createElement('div'); row.className = 'drive-badge-row'; bar.appendChild(row);
    b = document.createElement('button'); b.type = 'button'; b.id = 'driveBadge'; b.addEventListener('click', driveBadgeTap); row.appendChild(b);
  }
  const s = driveBadgeState(), text = s.icon + ' ' + s.text;
  b.className = 'badge drive-badge' + (s.cls ? ' ' + s.cls : ''); b.dataset.state = s.act === 'reconnect' ? 'reconnect' : s.cls || 'idle';
  if (b.textContent !== text) b.textContent = text;
  b.title = s.hint; b.setAttribute('aria-label', 'Sauvegarde Google Drive : ' + s.text + '. ' + s.hint);
}
function driveOpenBackup() {
  const d = document.getElementById('settings'); if (!d) return;
  d.open = true; renderSettings(true);
  const sec = document.getElementById('bkSec'); if (sec) sec.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}
function driveBadgeTap() {
  const d = DRIVE_UI;
  if (driveBadgeState().act !== 'reconnect' || !d.prepared || !d.hint || d.busy) { driveOpenBackup(); return; }
  // Même reprise que le bouton de Sauvegarde : fenêtre Google ouverte dans le geste, même compte et même dossier.
  d.sync.stop(); d.selected = false; d.busy = true; const promise = d.session.connect();
  (async () => {
    try {
      await promise; const selected = await d.session.resume(d.hint);
      // Reprise juste après l'ouverture : la version chargée (version.json) doit être confirmée avant tout envoi.
      if (!VER) await loadVersion();
      d.sync.select(selected); d.selected = true; d.text = 'Synchronisation reprise avec le même compte et le même dossier.'; await d.sync.run(true);
    }
    catch (e) { d.text = e && e.code === 'confirmation' ? 'Compte ou dossier différent de la liaison confirmée : confirme explicitement le compte, puis le dossier.' : 'Reprise non confirmée. Les copies et la file d’envoi sont conservées ; réessaie.'; driveOpenBackup(); }
    finally { d.busy = false; renderDriveSync(); }
  })();
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
let DRIVE_SOON = null;
function driveSoon() {
  clearTimeout(DRIVE_SOON);
  DRIVE_SOON = setTimeout(() => {
    const d = DRIVE_UI; if (document.hidden || DEMO.on || navigator.onLine === false || !d.selected || !d.session || !d.session.connected) return;
    // Saisie arrivée pendant un envoi : réessayer après celui-ci (aucun envoi concurrent).
    if (d.sync.status.running) { driveSoon(); return; }
    d.sync.run(false, true);
  }, 4000);
}
async function initDriveSync() {
  // Ni requête de configuration ni script Google sur l'origine partagée.
  if (location.protocol !== 'https:' || /(^|\.)github\.io$/.test(location.hostname)) return;
  try {
    const config = await GoogleDriveSession.load();
    if (location.origin !== config.raceOrigin) return;
    if (!VER) loadVersion();   // identité de la version chargée, exigée par chaque envoi Drive (sans ouvrir Paramètres)
    const provider = new DriveTransport.OpaqueDrive([config.raceOrigin]);
    DRIVE_UI.config = config; window.TWRC_DRIVE_CONFIGURED = true;
    DRIVE_UI.session = GoogleDriveSession.create(config, provider);
    DRIVE_UI.sync = DriveSync.create({ vault: window.TWRC_VAULT, provider,
      version: () => ControlVaultPacket.loadedVersion(window.TWRC_BUILD, VER),
      onChange: state => {
        DRIVE_UI.text = state.message; DRIVE_UI.status = state;
        if (state.state === 'SYNCED') { DRIVE_BADGE.pending = 0; DRIVE_BADGE.syncedAt = Date.now(); }
        renderDriveSync();
      },
      onApplied: () => {
        S = loadSettings();
        const context = lsGet(USER_STORE.key); if (context) USER_STORE.receive(context);
        TRIPCANCEL = TripCancel.load(APP_STORAGE, Date.now()); rebuild(); renderAll();
      } });
    DRIVE_UI.text = 'Prêt à connecter Google Drive. Exporte d’abord une copie complète et vérifiée de cet appareil.';
    try { DRIVE_UI.hint = await DriveSync.resumeHint(); } catch { DRIVE_UI.hint = null; }
    // Liaison déjà confirmée : Google chargé d'avance pour qu'un seul appui suffise à la reconnexion.
    if (DRIVE_UI.hint) DRIVE_UI.session.prepare().then(() => { DRIVE_UI.prepared = true; renderDriveSync(); }, () => {});
    const tick = () => {
      if (DRIVE_UI.selected && !DRIVE_UI.session.connected) { DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; DRIVE_UI.text = 'Envoi Drive en pause : autorisation Google expirée ou révoquée. Les saisies restent enregistrées localement ; appuie sur Reprendre la synchronisation Drive.'; DriveSync.resumeHint().then(h => { DRIVE_UI.hint = h; renderDriveSync(); }, () => renderDriveSync()); return; }
      if (!document.hidden && !DEMO.on && DRIVE_UI.selected && DRIVE_UI.session.connected) DRIVE_UI.sync.run();
    };
    DRIVE_UI.timer = setInterval(tick, 30000);
    // Session Google expirée : jamais d'arrêt silencieux, le badge passe à « Reconnexion requise » en quelques secondes.
    setInterval(() => { if (DRIVE_UI.selected && !DRIVE_UI.session.connected) tick(); else renderDriveBadge(); }, 5000);
    document.addEventListener('visibilitychange', () => { DRIVE_BADGE.hidden = document.hidden; renderDriveBadge(); });
    document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick); window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick); window.addEventListener('offline', renderDriveBadge); window.addEventListener('online', () => { renderDriveBadge(); driveSoon(); });
    // iPhone : l'app peut être suspendue dès son passage en arrière-plan ; envoyer la dernière saisie
    // sans attendre la fenêtre de calme (blocages et délais de reprise respectés).
    document.addEventListener('visibilitychange', () => { if (document.hidden && !DEMO.on && DRIVE_UI.selected && DRIVE_UI.session.connected) DRIVE_UI.sync.run(false, true); });
    // Toute saisie enregistrée, depuis n'importe quel écran : envoi automatique regroupé quelques secondes,
    // scellé sans attendre la fenêtre de calme (blocages et délais de reprise respectés, comme en arrière-plan).
    for (const key of Object.keys(DRIVE_USER_PART)) DRIVE_BADGE.sig[key] = driveUserPart(key);
    window.addEventListener('twrc-vault-change', e => { driveNoteWrite(e); driveSoon(); });
    const stop = () => { DRIVE_UI.session.disconnect(); DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; DRIVE_UI.dedicatedFolders = []; renderDriveSync(); };
    window.addEventListener('twrc-session-expired', stop); window.addEventListener('twrc-session-locked', stop);
    window.addEventListener('pagehide', stop); renderDriveSync();
  } catch { /* configuration absente/non approuvée : sauvegardes locales inchangées */ }
}
