/* Réglages → Sauvegarde. Aucun changement des écrans Twin Garage. */
/* conflit-lisible:début — texte d'un écart de synchronisation, en clair (jamais de JSON à l'écran). Pur : testé hors navigateur. */
const DRIVE_AXLE = { av: 'avant', ar: 'arrière', both: 'les deux essieux' };
const DRIVE_FIELD = { 'tire.treads': 'profondeurs de pneus', odo: 'relevés du compteur', 'tire.type': 'type de pneus', 'tire.press': 'pression conseillée',
  'tire.tread': 'profondeur', 'tire.treadAv': 'profondeur avant', 'tire.treadAr': 'profondeur arrière', 'tire.dot': 'DOT', 'tire.pchk': 'contrôle de pression',
  tire: 'pneus montés', sets: 'trains de pneus', plan: 'monte prévue', name: 'nom', photo: 'photo',
  'economics.ref.purchasePriceCents': 'prix d’achat', 'economics.ref.purchaseDate': 'date d’achat', 'economics.ref.purchaseOdometerKm': 'compteur à l’achat',
  'economics.ref.annualDistanceKm': 'kilométrage annuel prévu', 'economics.ref.estimatedResaleCents': 'revente estimée', 'economics.ref': 'références du budget', economics: 'budget' };
function driveConflictDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : 'date inconnue'; }
function driveConflictNum(v, digits = 0) { return Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '?'; }
function driveConflictLabel(path, cars) {
  const m = /^cars\.(\d+)(?:\.(.+))?$/.exec(String(path || ''));
  if (m) { const c = Array.isArray(cars) && cars[+m[1]], who = c && (c.name || c.short) ? String(c.name || c.short) : 'Voiture ' + (+m[1] + 1);
    return who + (m[2] ? ' · ' + (DRIVE_FIELD[m[2]] || m[2].split('.').pop()) : ''); }
  // Relevé par pneu (enregistrement séparé, clé « car-<id> ») : nommé comme les autres champs d'une voiture.
  const w = /^treadWheels\.car-([A-Za-z0-9_-]+)(?:\.([a-z]+))?/.exec(String(path || ''));
  if (w) { const c = Array.isArray(cars) && cars.find(x => x && x.id === w[1]); return (c && (c.name || c.short) ? String(c.name || c.short) : 'Voiture') + ' · profondeur par pneu'; }
  return String(path || 'réglage').split('.').join(' · ');
}
function driveConflictText(path, v) {
  if (v === undefined) return '(absent)';
  if (v === null || v === '') return '(vide)';
  const list = (rows, one) => { const t = rows.slice(0, 4).map(one); return t.join(' ; ') + (rows.length > 4 ? ' ; + ' + (rows.length - 4) + ' autre' + (rows.length > 5 ? 's' : '') : ''); };
  if (/^cars\.\d+\.tire\.treads$/.test(path) && Array.isArray(v)) return v.length ? list(v, r => r && typeof r === 'object'
    ? driveConflictDate(r.d) + ' · ' + driveConflictNum(+r.mm, 1) + ' mm · ' + (DRIVE_AXLE[r.ax] || 'essieu non précisé') + (Number.isFinite(r.km) ? ' · ' + driveConflictNum(r.km) + ' km' : '') + (r.est ? ' (estimation)' : '')
    : 'relevé illisible') : 'aucun relevé';
  if (/^cars\.\d+\.odo$/.test(path) && Array.isArray(v)) return v.length ? list(v, r => r && typeof r === 'object' ? driveConflictDate(r.d) + ' · ' + driveConflictNum(+r.km) + ' km' : 'relevé illisible') : 'aucun relevé';
  // Montants du budget stockés en centimes : affichés en euros, jamais en centimes bruts.
  if (/^cars\.\d+\.economics\.ref\.\w+Cents$/.test(path) && Number.isFinite(v)) return driveConflictNum(v / 100, Number.isInteger(v / 100) ? 0 : 2) + ' €';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return driveConflictNum(v, Number.isInteger(v) ? 0 : 1);
  if (typeof v === 'string') return v.length > 80 ? v.slice(0, 77) + '…' : v;
  if (Array.isArray(v)) return v.length + ' élément' + (v.length > 1 ? 's' : '');
  const keys = Object.keys(v), flat = keys.filter(k => v[k] == null || ['string', 'number', 'boolean'].includes(typeof v[k]));
  const t = flat.slice(0, 4).map(k => (DRIVE_FIELD[k] || k) + ' : ' + driveConflictText('', v[k])).join(' · ');
  return (t || 'détails') + (keys.length > flat.slice(0, 4).length ? ' · + ' + (keys.length - flat.slice(0, 4).length) + ' champ(s)' : '');
}
// Appareil courant nommé en clair (« cet iPhone », « ce PC »…) ; l'autre appareil n'est connu que par un identifiant.
function driveDeviceName(ua) { const u = String(ua || ''); return /iPhone/.test(u) ? 'cet iPhone' : /iPad/.test(u) ? 'cet iPad' : /Android/.test(u) ? 'ce téléphone' : /Macintosh|Mac OS X/.test(u) ? 'ce Mac' : 'ce PC'; }
// Résumé court d'une version pour le BOUTON : dernières profondeurs par essieu, dernier compteur, sinon texte court.
function driveConflictSummary(path, v) {
  const last = rows => rows.filter(r => r && typeof r === 'object' && r.d).slice().sort((a, b) => String(a.d).localeCompare(String(b.d))).pop();
  if (/^cars\.\d+\.tire\.treads$/.test(path) && Array.isArray(v) && v.length) {
    const r = last(v), day = r ? r.d : null, at = ax => v.filter(x => x && x.d === day && (x.ax === ax || x.ax === 'both')).map(x => +x.mm).filter(Number.isFinite);
    const av = at('av'), ar = at('ar'), mm = xs => xs.length ? driveConflictNum(Math.min(...xs), 1) : '—';
    return (av.length || ar.length ? 'AV ' + mm(av) + ' / AR ' + mm(ar) + ' mm' : driveConflictNum(+r.mm, 1) + ' mm') + ', relevé du ' + driveConflictDate(day);
  }
  if (/^cars\.\d+\.odo$/.test(path) && Array.isArray(v) && v.length) { const r = last(v); return r ? driveConflictNum(+r.km) + ' km, relevé du ' + driveConflictDate(r.d) : 'relevé illisible'; }
  const t = driveConflictText(path, v); return t.length > 60 ? t.slice(0, 57) + '…' : t;
}
// Libellé d'un bouton de conflit : jamais la clé technique (« cars.0.tire.treads »).
function driveConflictButton(choice, path, v, cars, ua) {
  const m = /^cars\.\d+\.(.+)$/.exec(String(path || '')), field = m ? (DRIVE_FIELD[m[1]] || m[1].split('.').pop()) : driveConflictLabel(path, cars);
  const who = choice === 'local' ? driveDeviceName(ua) : 'l’autre appareil';
  return (choice === 'local' ? 'Garder les ' : 'Prendre les ') + field + ' de ' + who + ' (' + driveConflictSummary(path, v) + ')';
}
/* conflit-lisible:fin */
let DRIVE_UI = { config: null, session: null, sync: null, prepared: false, prep: 'idle', prepError: null, selected: false, busy: false,
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
  line('CLOUD · ' + (!d.config ? 'Google Drive non activé sur cette version' : !connected ? driveBadgeState().label + ' (aucune copie Drive envoyée depuis cet appareil tant qu’elle manque)' :
    !st ? 'en attente' : ({ SYNCED: 'envoi confirmé et relu (intégrité vérifiée)', VERIFYING: 'envoi ou vérification en cours', PENDING: 'en attente d’envoi', CONFLICT: st.message, SYNC_BLOCKED: 'bloqué : ' + st.message, LOCAL: 'local seulement' })[st.state] || st.message));
  if (d.config) line('DERNIÈRE COPIE · ' + driveCopyText());
  if (d.config && DRIVE_BADGE.list.length) line('EN ATTENTE SUR CET APPAREIL · ' + drivePendingList());
  line('PÉRIMÈTRE · Drive exclut volontairement la position, le trajet en cours, les caches, le code et la mémoire thermique des pneus (estimation de quelques heures) ; la copie complète exportée les contient.');
  if (st && st.conflictDetails && st.conflictDetails.length) {
    line('CONFLIT · action requise. Les deux versions sont conservées ; rien n’est remplacé sans ton choix.').setAttribute('role', 'alert');
    for (const c of st.conflictDetails) {
      const what = driveConflictLabel(c.path, typeof S === 'object' && S ? S.cars : null);
      line(what + ' · cet appareil : ' + driveConflictText(c.path, c.local) + ' · autre appareil (…' + String(c.device).slice(-6) + ') : ' + driveConflictText(c.path, c.remote));
      if (!c.resolvable) { line('Résolution impossible dans l’app pour ce type d’écart (véhicule ajouté ou retiré d’un seul côté, ou donnée entière). Les deux versions restent conservées, mais les nouvelles saisies de l’autre appareil ne seront PAS intégrées ici tant que ce point n’est pas traité. Exporte une copie complète de chaque appareil.'); continue; }
      for (const choice of ['local', 'remote'])
        button(driveConflictButton(choice, c.path, choice === 'local' ? c.local : c.remote, typeof S === 'object' && S ? S.cars : null, navigator.userAgent), async () => {
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
  // Reprise : même compte et même dossier qu'une liaison déjà confirmée ⇒ UN geste. Google est préparé d'avance (dès que
  // la reconnexion est nécessaire) ; tant qu'il ne l'est pas, le bouton le dit et n'annonce pas de reconnexion immédiate.
  if (d.hint && !(connected && d.selected)) {
    if (d.prep === 'failed') button('Réessayer la préparation de Google', () => { driveEnsurePrepared(); });
    else if (!d.prepared) button(DRIVE_LABEL.preparing, () => {}, true);
    else button(DRIVE_RECONNECT, () => { driveReconnect(); renderDriveSync(); });
  }
  // Avec une liaison déjà confirmée, ce bouton n'est PAS la reprise (autre compte ou autre dossier) : libellé distinct.
  const connectLabel = connected ? 'Changer de compte Google' : d.hint ? 'Utiliser un autre compte Google' : !d.prepared ? 'Préparer la connexion Google' : 'Se connecter à Google';
  button(connectLabel, async () => {
    d.busy = true;
    try {
      if (!d.prepared) { await d.session.prepare(); d.prepared = true; d.text = 'Connexion prête. Appuie sur « ' + (d.hint ? 'Utiliser un autre compte Google' : 'Se connecter à Google') + ' ».'; }
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
// Badge de sauvegarde, visible depuis tous les écrans (barre d'état) : projection de l'état DriveSync. Un appui ouvre
// Sauvegarde, ou reconnecte Google (dans le geste) quand la reconnexion est prête.
const DRIVE_BADGE = { pending: 0, syncedAt: 0, hidden: false, lastAt: 0, sig: {}, pendingSince: 0, list: [], loaded: false, savedAt: 0 };
// Un libellé par état, le même dans le badge, le panneau Sauvegarde et ses boutons (constat : trois libellés pour « coupé »).
// Forme courte (DRIVE_SHORT) quand la place manque (iPhone) : le libellé se raccourcit, jamais l'heure de la dernière copie.
const DRIVE_LABEL = Object.freeze({ locked: 'Sauvegarde en pause', hidden: 'Ouvre l’app pour synchroniser', offline: 'Hors ligne',
  preparing: 'Préparation de Google…', prepfail: 'Préparation de Google impossible', reconnect: 'Reconnexion requise', off: 'Sauvegarde Drive à activer',
  waiting: 'Envoi en attente', action: 'Action requise', synced: 'À jour', sending: 'Envoi en cours' });
const DRIVE_SHORT = Object.freeze({ locked: 'Pause', hidden: 'Ouvrir', offline: 'Hors ligne', preparing: 'Google…', prepfail: 'Réessayer', reconnect: 'Reconnecter',
  off: 'Activer', waiting: 'Attente', action: 'Action', synced: 'À jour', sending: 'Envoi' });
const DRIVE_RECONNECT = 'Reconnecter Google Drive';
// Mémoire du badge, propre à l'appareil (préfixe twrc.sync. : jamais envoyée à Drive, ignorée par DriveSync) et chiffrée
// dans le coffre : dernière copie vérifiée, nombre ET liste des modifications non sauvegardées (heure et nature, aucune
// valeur saisie, aucun jeton) survivent au rechargement. Une date inconnue reste inconnue : jamais remplacée par « maintenant ».
const DRIVE_BADGE_KEY = 'twrc.sync.badge.v1', DRIVE_LIST_MAX = 20;
const driveTime = v => Number.isFinite(v) && v > 0 ? v : 0;
function driveBadgeLoad() {
  if (DRIVE_BADGE.loaded || !window.TWRC_VAULT || window.TWRC_VAULT.mode !== 'vault') return;
  DRIVE_BADGE.loaded = true;
  try {
    const m = JSON.parse(lsGet(DRIVE_BADGE_KEY) || 'null');
    if (m && typeof m === 'object') {
      if (driveTime(m.lastOkAt)) DRIVE_BADGE.syncedAt = Math.max(DRIVE_BADGE.syncedAt, m.lastOkAt);
      if (Number.isInteger(m.pending) && m.pending > 0) {
        DRIVE_BADGE.pending = Math.max(DRIVE_BADGE.pending, m.pending);
        DRIVE_BADGE.pendingSince = driveTime(m.pendingSince) || driveTime(DRIVE_BADGE.pendingSince);
        const list = Array.isArray(m.list) ? m.list.filter(x => x && typeof x.part === 'string' && x.part.length <= 40).map(x => ({ at: driveTime(x.at), part: x.part })) : [];
        if (list.length) DRIVE_BADGE.list = list.slice(-DRIVE_LIST_MAX);
      }
    }
  } catch { /* mémoire illisible : badge recalculé à la prochaine copie */ }
}
// Écriture seulement quand l'information change d'état ; la date « À jour » est rafraîchie au plus toutes les 5 min
// (la date affichée après une coupure est donc au plus 5 min plus ancienne que la réalité, jamais plus récente).
function driveBadgeSave(force) {
  if (!window.TWRC_VAULT || window.TWRC_VAULT.mode !== 'vault') return;
  if (!force && Date.now() - DRIVE_BADGE.savedAt < 5 * 60e3) return;
  DRIVE_BADGE.savedAt = Date.now();
  const B = DRIVE_BADGE;
  lsSet(DRIVE_BADGE_KEY, JSON.stringify({ v: 1, lastOkAt: B.syncedAt || null, pending: B.pending, pendingSince: B.pending ? B.pendingSince || null : null, list: B.pending ? B.list.slice(-DRIVE_LIST_MAX) : [] }));
}
const DRIVE_DAY = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
// Date lisible d'une copie : « 18:05 », « hier 18:05 » ou « 01/11 18:05 » (heure locale de l'appareil).
function driveWhen(t) {
  const d = new Date(t), now = new Date(), day = x => x.getFullYear() + '-' + x.getMonth() + '-' + x.getDate(), y = new Date(now); y.setDate(now.getDate() - 1);
  return (day(d) === day(now) ? '' : day(d) === day(y) ? 'hier ' : DRIVE_DAY.format(d) + ' ') + DRIVE_HM.format(d);
}
// Âge : « moins de 1 min », « 14 min », « 2 h 05 », « 3 j » ; date de départ inconnue ⇒ null (jamais « moins de 1 min »).
function driveAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60e3);
  return m < 1 ? 'moins de 1 min' : m < 60 ? m + ' min' : m < 48 * 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : Math.floor(m / 1440) + ' j';
}
const drivePendingAge = () => DRIVE_BADGE.pendingSince ? driveAge(Date.now() - DRIVE_BADGE.pendingSince) : null;
const driveCopyAt = () => DRIVE_BADGE.syncedAt ? driveWhen(DRIVE_BADGE.syncedAt) : null;
// Forme courte (badge, une ligne) : heure de la copie, puis « 2 modifs · 14 min ».
function drivePendingShort() {
  const B = DRIVE_BADGE, age = drivePendingAge();
  return B.pending ? B.pending + ' modif' + (B.pending > 1 ? 's' : '') + (age ? ' · ' + age : '') : '';
}
function driveCopyShort() {
  const at = driveCopyAt(), p = drivePendingShort();
  return (at ? 'copie ' + at : 'copie non vérifiée') + (p ? ' · ' + p : '');
}
function driveCopyText() {
  const B = DRIVE_BADGE, at = driveCopyAt(), age = drivePendingAge();
  return (at ? 'dernière copie ' + at : 'copie non vérifiée sur cet appareil') +
    (B.pending ? ' · ' + B.pending + ' modif' + (B.pending > 1 ? 's' : '') + ' non sauvegardée' + (B.pending > 1 ? 's' : '') + (age ? ' depuis ' + age : ' (durée inconnue)') : '');
}
// Liste lisible des modifications en attente (panneau Sauvegarde) : heure et nature seulement.
function drivePendingList() {
  return DRIVE_BADGE.list.map(x => (x.at ? DRIVE_HM.format(x.at) : 'heure inconnue') + ' ' + x.part).join(' · ');
}
// Résumé pour la synthèse : jamais de « tout va bien » tant que Drive n'est pas à jour ou en train d'envoyer.
function driveBackupSummary() {
  if (!DRIVE_UI.config) return null;
  const s = driveBadgeState();
  return { ok: s.key === 'synced' || s.key === 'sending', text: 'Sauvegarde Drive · ' + s.label + ' · ' + driveCopyText() };
}
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
  driveBadgeLoad();
  if (!DRIVE_BADGE.pending) DRIVE_BADGE.pendingSince = Date.now();
  DRIVE_BADGE.list = [...DRIVE_BADGE.list, { at: Date.now(), part: e.key === 'twrc.settings.v1' ? 'réglages' : 'journal des trajets' }].slice(-DRIVE_LIST_MAX);
  DRIVE_BADGE.pending++; DRIVE_BADGE.lastAt = Date.now(); driveBadgeSave(true); renderDriveBadge();
}
const DRIVE_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function driveBadgeState() {
  driveBadgeLoad();
  const d = DRIVE_UI, B = DRIVE_BADGE, st = d.status || {}, active = !!(d.session && d.session.connected && d.selected);
  const n = B.pending, copy = driveCopyText();
  // at : heure de la dernière copie, affichée en entier à toutes les largeurs ; tail : modifications en attente.
  const out = (key, cls, icon, hint, act, withCopy = true) => ({ key, cls, icon, label: DRIVE_LABEL[key], short: DRIVE_SHORT[key],
    at: withCopy ? (driveCopyAt() || 'copie non vérifiée') : '', tail: withCopy ? drivePendingShort() : '',
    text: DRIVE_LABEL[key] + (withCopy ? ' · ' + driveCopyShort() : ''), hint: hint + (withCopy ? ' État : ' + copy + '.' : ''), act });
  if (!window.TWRC_VAULT || window.TWRC_VAULT.mode !== 'vault') return out('locked', '', '🔒', 'Déverrouille l’app pour synchroniser.', 'open', false);
  // iOS suspend l'app fermée : aucune synchronisation possible en arrière-plan, le dire honnêtement.
  if (B.hidden && n) return out('hidden', 'cache', '⏳', 'Aucune synchronisation quand l’app est fermée.', 'open');
  if (navigator.onLine === false) return out('offline', 'nogo', '⛔', 'Envoi automatique au retour du réseau, sans perte.', 'open');
  if (!active) {
    if (!d.hint) return out('off', '', '☁️', 'Ouvre Paramètres → Sauvegarde.', 'open');
    // Reconnexion annoncée seulement quand Google est prêt : un seul appui ouvre alors la fenêtre, dans le geste.
    if (d.prep === 'failed') return out('prepfail', 'cache', '⚠️', 'Google n’a pas pu être préparé' + (d.prepError ? ' (' + d.prepError + ')' : '') + ' : touche pour réessayer.', 'prepare');
    if (!d.prepared) return out('preparing', 'cache', '⏳', 'Google se prépare ; la reconnexion sera possible en un appui dans un instant.', 'wait');
    return out('reconnect', 'cache', '⚠️', 'Un appui pour reconnecter Google Drive (Google exige ce geste).', 'reconnect');
  }
  if (st.state === 'SYNC_BLOCKED' && /reconnexion/.test(st.message)) return out('reconnect', 'cache', '⚠️', 'Un appui pour reconnecter Google Drive.', 'reconnect');
  if (st.state === 'SYNC_BLOCKED' && /en attente/.test(st.message)) return out('waiting', 'cache', '⏳', 'Nouvel essai automatique.', 'open');
  if (st.state === 'CONFLICT' || st.state === 'SYNC_BLOCKED') return out('action', 'cache', '⚠️', st.message || 'Ouvre Sauvegarde.', 'open');
  if (st.state === 'SYNCED' && !n) { const at = driveCopyAt();
    return { key: 'synced', cls: 'live', icon: '☁️✓', label: DRIVE_LABEL.synced, short: DRIVE_SHORT.synced, at: at || 'copie non vérifiée', tail: '',
      text: DRIVE_LABEL.synced + ' · ' + (at || 'copie non vérifiée'), hint: at ? 'Dernière sauvegarde envoyée, relue et vérifiée : ' + at + '.' : 'Copie non vérifiée.', act: 'open' }; }
  return out('sending', 'cache', '⏳', 'Envoi, relecture et vérification automatiques.', 'open');
}
// Préparation de Google (bibliothèque chargée d'avance) dès que la reconnexion est nécessaire, et seulement s'il existe une
// liaison confirmée (DRIVE_UI.hint) sur l'origine prévue (configuration validée). Échec : visible, avec un nouvel essai.
function driveEnsurePrepared() {
  const d = DRIVE_UI;
  if (!d.config || !d.session || !d.hint || d.prepared || d.prep === 'preparing') return;
  d.prep = 'preparing'; d.prepError = null; renderDriveSync();
  Promise.resolve().then(() => d.session.prepare()).then(() => { d.prepared = true; d.prep = 'ready'; d.prepError = null; },
    e => { d.prepared = false; d.prep = 'failed'; d.prepError = e && e.code === 'network' ? 'réseau ou bloqueur de contenu' : 'configuration';
      d.text = DRIVE_LABEL.prepfail + ' (' + d.prepError + ') : touche « Réessayer la préparation de Google ». Les saisies restent enregistrées sur cet appareil.'; })
    .finally(() => renderDriveSync());
}
// Reconnexion, depuis le badge ou le bouton du panneau : connect() est appelé DANS le geste (aucune attente avant), puis la
// liaison confirmée (même compte, même dossier) est relue. Fenêtre bloquée ou fermée : message visible, nouvel essai possible.
function driveReconnect() {
  const d = DRIVE_UI;
  if (!d.prepared || !d.hint || d.busy) return false;
  d.sync.stop(); d.selected = false; d.busy = true; const promise = d.session.connect();   // appel synchrone dans le geste
  (async () => {
    try {
      await promise; const selected = await d.session.resume(d.hint);
      // Reprise juste après l'ouverture : la version chargée (version.json) doit être confirmée avant tout envoi.
      if (!VER) await loadVersion();
      d.sync.select(selected); d.selected = true; d.text = 'Synchronisation reprise avec le même compte et le même dossier.'; await d.sync.run(true);
    }
    catch (e) { d.text = e && e.code === 'confirmation' ? 'Compte ou dossier différent de la liaison confirmée : confirme explicitement le compte, puis le dossier.'
      : 'Autorisation Google non obtenue : fenêtre bloquée par le navigateur, fermée ou refusée. Autorise les fenêtres pour ce site, puis touche « ' + DRIVE_RECONNECT + ' ». Les copies et la file d’envoi sont conservées.'; }
    finally { d.busy = false; renderDriveSync(); }
  })();
  return true;
}
function renderDriveBadge() {
  if (!DRIVE_UI.config) return;
  // Dans le bandeau, sur une ligne existante : la barre collante ne grandit pas (titres jamais masqués).
  const bar = document.getElementById('statusbar'); if (!bar) return;
  if (!bar.querySelector('#liveClock')) renderLiveStatus();
  let b = document.getElementById('driveBadge');
  if (!b || b.parentNode !== bar) {
    if (b) b.remove();
    b = document.createElement('button'); b.type = 'button'; b.id = 'driveBadge'; b.addEventListener('click', driveBadgeTap); bar.appendChild(b);
  }
  const s = driveBadgeState(), narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
  const label = narrow ? s.short : s.label, at = s.at ? (narrow ? s.at.replace(/^copie /, '').replace(/^copie non vérifiée$/, 'non vérifiée') : (s.key === 'synced' ? s.at : /^copie/.test(s.at) ? s.at : 'copie ' + s.at)) : '';
  const tail = s.tail ? (narrow ? String(DRIVE_BADGE.pending) : s.tail) : '', text = s.icon + ' ' + label + (at ? ' · ' + at : '') + (tail ? ' · ' + tail : '');
  b.className = 'badge drive-badge' + (s.cls ? ' ' + s.cls : ''); b.dataset.state = s.act === 'reconnect' ? 'reconnect' : s.cls || 'idle';
  // Toutes largeurs : le libellé se réduit (forme courte sur iPhone, puis points de suspension) ; l'heure de la dernière
  // copie (db-at) ne se réduit jamais. Le détail complet reste dans l'info-bulle, aria-label et le panneau Sauvegarde.
  b.dataset.n = DRIVE_BADGE.pending ? String(DRIVE_BADGE.pending) : ''; b.dataset.key = s.key;
  if (b.textContent !== text) {
    const span = (c, t) => { const e = document.createElement('span'); e.className = c; e.textContent = t; return e; };
    b.replaceChildren(...[span('db-ic', s.icon), ' ', span('db-tx', label), at ? span('db-at', ' · ' + at) : null, tail ? span('db-tail', ' · ' + tail) : null].filter(Boolean));
  }
  b.title = s.hint; b.setAttribute('aria-label', 'Sauvegarde Google Drive : ' + s.text + '. ' + s.hint);
}
function driveOpenBackup() {
  const d = document.getElementById('settings'); if (!d) return;
  d.open = true; renderSettings(true);
  const sec = document.getElementById('bkSec'); if (sec) sec.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
}
// Appui sur le badge : reconnexion dans le geste quand Google est prêt ; pendant la préparation, rien n'est présenté comme
// une reconnexion (message visible) ; préparation échouée : nouvel essai. Sinon, ouverture du panneau Sauvegarde.
function driveBadgeTap() {
  const d = DRIVE_UI, act = driveBadgeState().act;
  if (act === 'prepare') { driveEnsurePrepared(); return; }
  if (act === 'wait') { d.text = DRIVE_LABEL.preparing + ' Le prochain appui, une fois Google prêt, lancera la reconnexion.'; renderDriveSync(); return; }
  if (act === 'reconnect' && driveReconnect()) { renderDriveSync(); return; }
  driveOpenBackup();
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
// État DriveSync reçu : « À jour » mémorisé (dernière copie vérifiée), modifications en attente remises à zéro.
function driveOnChange(state) {
  DRIVE_UI.text = state.message; DRIVE_UI.status = state;
  if (state.state === 'SYNCED') {
    driveBadgeLoad(); const had = DRIVE_BADGE.pending > 0 || !DRIVE_BADGE.syncedAt;
    DRIVE_BADGE.pending = 0; DRIVE_BADGE.pendingSince = 0; DRIVE_BADGE.list = []; DRIVE_BADGE.syncedAt = Date.now(); driveBadgeSave(had);
  }
  renderDriveSync();
}
// Session Google expirée ou révoquée : même libellé que le badge, même bouton que la reprise.
function driveSessionLost() {
  DRIVE_UI.text = DRIVE_LABEL.reconnect + ' : autorisation Google expirée ou révoquée. Les saisies restent enregistrées sur cet appareil ; appuie sur « ' + DRIVE_RECONNECT + ' ».';
}
// Écriture dans le coffre : compteur du badge et envoi regroupé. La mémoire du badge (clé propre à l'appareil) ne
// relance jamais une synchronisation (sinon chaque « À jour » relancerait un envoi).
function driveVaultChange(e) { if (e && e.key === DRIVE_BADGE_KEY) return; driveNoteWrite(e); driveSoon(); }
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
      onChange: driveOnChange,
      onApplied: () => {
        const cars = S.cars.map(c => c.id).join();
        S = loadSettings();
        const context = lsGet(USER_STORE.key); if (context) USER_STORE.receive(context);
        TRIPCANCEL = TripCancel.load(APP_STORAGE, Date.now()); rebuild(); renderAll();
        // Voiture ajoutée sur l'autre appareil : Paramètres ouverts la montrent, sauf saisie en cours.
        // Seul ce cas redessine le panneau (un choix de conflit en cours n'est jamais effacé).
        const set = document.getElementById('settings');
        if (cars !== S.cars.map(c => c.id).join() && (!set || !set.open || !set.contains(document.activeElement) || document.activeElement === set.querySelector('summary'))) renderSettings();
      } });
    DRIVE_UI.text = DRIVE_LABEL.off + '. Exporte d’abord une copie complète et vérifiée de cet appareil.';
    try { DRIVE_UI.hint = await DriveSync.resumeHint(); } catch { DRIVE_UI.hint = null; }
    if (DRIVE_UI.hint) DRIVE_UI.text = DRIVE_LABEL.reconnect + ' : un appui sur « ' + DRIVE_RECONNECT + ' » reprend la synchronisation avec le même compte et le même dossier.';
    // Liaison déjà confirmée : Google chargé d'avance pour qu'un seul appui suffise à la reconnexion.
    driveEnsurePrepared();
    const tick = () => {
      if (DRIVE_UI.selected && !DRIVE_UI.session.connected) { DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; driveSessionLost(); DriveSync.resumeHint().then(h => { DRIVE_UI.hint = h; driveEnsurePrepared(); renderDriveSync(); }, () => renderDriveSync()); return; }
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
    window.addEventListener('twrc-vault-change', driveVaultChange);
    const stop = () => { DRIVE_UI.session.disconnect(); DRIVE_UI.sync.stop(); DRIVE_UI.selected = false; DRIVE_UI.dedicatedFolders = []; renderDriveSync(); };
    window.addEventListener('twrc-session-expired', stop); window.addEventListener('twrc-session-locked', stop);
    window.addEventListener('pagehide', stop); renderDriveSync();
  } catch { /* configuration absente/non approuvée : sauvegardes locales inchangées */ }
}
