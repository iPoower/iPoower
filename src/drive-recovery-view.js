/* Page dédiée de récupération RC : aucun moteur métier ni préréglage ne
 * démarre ici. Aucune saisie de code n'est envoyée à Google ou Control Vault. */
(async () => {
  const $ = id => document.getElementById(id), status = $('recovery-status');
  let session = null, recovery = null, selected = false, ticket = null, reader = null, busy = false;
  const say = text => { status.textContent = text; };
  function paint() {
    const connected = session && session.connected, confirmed = connected && session.confirmed;
    $('recovery-account').textContent = connected && session.identity ? 'Compte sélectionné : ' + session.identity.label : '';
    $('recovery-connect').disabled = busy || !session;
    $('recovery-confirm-account').disabled = busy || !connected || confirmed;
    $('recovery-folder').disabled = busy || !confirmed;
    $('recovery-dedicated').disabled = busy || !confirmed;
    for (const button of $('recovery-dedicated-list').querySelectorAll('button')) button.disabled = busy || !confirmed;
    $('recovery-preview').disabled = busy || !selected || !confirmed || !reader;
    $('recovery-export').disabled = busy || !ticket;
    $('recovery-install').disabled = busy || !ticket || !$('recovery-consent').checked;
    $('recovery-verify').disabled = busy || !recovery || !reader;
    $('recovery-pending-copy').disabled = busy || !recovery;
  }
  const errors = { 'not-empty': 'Ce navigateur contient déjà des données Race Control. Elles sont conservées. Utilise la procédure de sauvegarde puis de fusion contrôlée.',
    pending: 'Une opération existe déjà. Conserve sa copie et termine sa vérification ; aucun état n’est remplacé.',
    conflict: 'Plusieurs versions divergent ou la lignée est incomplète. Aucune version n’est choisie automatiquement.',
    absent: 'Aucune révision A2 trouvée dans ce dossier.', profile: 'Profil de chiffrement absent ou ambigu. Copies conservées.',
    'source-changed': 'Une nouvelle version est apparue depuis l’aperçu. Relis les versions avant de confirmer.',
    auth: 'Compte, autorisation ou dossier non confirmé. Reconnecte Google et confirme la destination.',
    'reopen-required': 'Ferme cette page puis rouvre Récupération avant la vérification.',
    confirmation: 'Relis l’aperçu et confirme explicitement la récupération.',
    limit: 'Historique trop volumineux pour cette récupération. Aucune version n’est tronquée ou supprimée.',
    integrity: 'Intégrité non confirmée. Les copies et les données locales sont conservées.',
    checkpoint: 'Référence saisie invalide, absente ou différente : récupération bloquée. Conserve les copies et retrouve les deux champs du reçu connu. Aucune donnée locale remplacée.',
    'local-changed': 'Le coffre local diffère de la copie choisie. Aucune réussite annoncée ; conserve les deux copies.',
    code: 'Code Race Control manquant : saisis-le avant de continuer.',
    AUTHENTICATION_FAILED: 'Code refusé pour cette copie : saisis le code Race Control utilisé lors de la sauvegarde. Aucune donnée modifiée.',
    CODE_REQUIRED: 'Code refusé pour cette copie : saisis le code Race Control utilisé lors de la sauvegarde. Aucune donnée modifiée.',
    network: 'Réseau ou Google Drive indisponible : réessaie quand la connexion est rétablie. Aucune donnée modifiée.',
    PRODUCER_TOO_NEW: 'Copie créée par une version plus récente de Race Control : recharge cette page pour obtenir la dernière version.',
    UNKNOWN_READER_VERSION: 'Copie créée par une version plus récente de Race Control : recharge cette page pour obtenir la dernière version.',
    unsupported: 'Navigateur à mettre à jour : la récupération exige le verrouillage entre onglets.',
    busy: 'Une opération est déjà en cours : attends sa fin.' };
  async function action(work) {
    if (busy) return; busy = true; paint();
    try { await work(); }
    catch (e) { ticket = null; const motif = e && /^[A-Za-z0-9_-]{1,40}$/.test(e.code || e.message || '') ? e.code || e.message : 'inconnu'; say(errors[e.code] || 'Opération non confirmée (motif : ' + motif + '). Aucune copie existante n’est supprimée. Si l’installation a commencé, ferme puis rouvre cette page pour vérifier le coffre.'); }
    finally { busy = false; paint(); }
  }
  const password = () => { const text = $('recovery-code').value; if (!text || text.length > 1024) throw Object.assign(new Error('code'), { code: 'code' }); return text; };
  const checkpoint = () => {
    const revision = $('recovery-known-revision').value.trim(), sha256 = $('recovery-known-sha').value.trim();
    return revision || sha256 ? { revision, sha256 } : null;
  };
  function download(bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'Race_Control_copie_chiffree.json'; a.rel = 'noopener'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // Sur l'origine partagée, ne lire aucun stockage privé et ne charger Google.
  if (location.protocol !== 'https:' || /(^|\.)github\.io$/.test(location.hostname)) {
    say('Récupération disponible uniquement sur l’origine Cloudflare dédiée et autorisée.'); paint(); return;
  }
  try {
    const raw = window.localStorage, vault = SessionVault.create({ raw, session: sessionStorage, crypto, target: window });
    // Pas de boot/migration du coffre, de préréglage ni de session mémorisée.
    const provider = new DriveTransport.OpaqueDrive([location.origin]);
    recovery = DriveRecovery.create({ vault, provider, version: () => reader,
      current: () => !!(session && session.connected && session.confirmed && selected) });
    const r = await fetch('./version.json', { credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!r.ok || Number(r.headers.get('Content-Length') || 0) > 4096) throw new Error('version');
    const stream = r.body && r.body.getReader(); if (!stream) throw new Error('version');
    const chunks = []; let size = 0;
    try { for (;;) { const { done, value } = await stream.read(); if (done) break; size += value.length; if (size > 4096) throw new Error('version'); chunks.push(value); } }
    finally { await stream.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    reader = ControlVaultPacket.loadedVersion(window.TWRC_RECOVERY_BUILD, ControlVaultPacket.strictJson(bytes, 4));
    $('recovery-version').textContent = 'Version chargée : ' + reader + ' · ' + window.TWRC_RECOVERY_BUILD;
    say('Vérification locale après réouverture disponible. Pour récupérer depuis Drive, prépare puis connecte Google.');
    try {
      const cfg = await GoogleDriveSession.load(); if (cfg.raceOrigin !== location.origin) throw new Error('origin');
      session = GoogleDriveSession.create(cfg, provider);
    } catch { say('Google Drive non activé sur cette version. La vérification d’une récupération déjà installée reste disponible.'); }
  } catch { say('Version ou stockage non confirmé. Aucune récupération appliquée. Rétablis le réseau pour vérifier la version chargée.'); }
  let prepared = false;
  $('recovery-connect').addEventListener('click', () => {
    if (busy || !session) return;
    // GIS doit conserver le geste utilisateur avant le premier await.
    if (prepared) {
      recovery.cancel(); selected = false; ticket = null;
      $('recovery-dedicated-list').replaceChildren();
      const promise = session.connect(); action(async () => { await promise; say('Vérifie le compte affiché puis confirme-le.'); });
    } else action(async () => { await session.prepare(); prepared = true; $('recovery-connect').textContent = 'Se connecter à Google'; say('Connexion prête. Appuie sur Se connecter à Google.'); });
  });
  $('recovery-confirm-account').addEventListener('click', () => action(async () => {
    session.confirmAccount(session.identity.id); say('Compte confirmé. Choisis le dossier dédié existant ; aucun dossier ni fichier n’est créé ici.');
  }));
  $('recovery-folder').addEventListener('click', () => {
    if (busy) return; selected = false; ticket = null; recovery.cancel();
    const promise = session.chooseFolder(); action(async () => { recovery.select(await promise); selected = true; say('Dossier confirmé. Saisis le code Race Control pour vérifier les versions.'); });
  });
  $('recovery-dedicated').addEventListener('click', () => action(async () => {
    selected = false; ticket = null; recovery.cancel();
    $('recovery-preview-info').textContent = ''; $('recovery-consent').checked = false;
    $('recovery-dedicated-list').replaceChildren();
    const folders = await session.listDedicatedFolders();
    for (const folder of folders) {
      const label = document.createElement('p'), button = document.createElement('button');
      label.textContent = folder.name + ' · créé le ' + new Date(folder.createdTime).toLocaleString('fr-FR') + ' · référence ' + folder.id.slice(-8);
      button.textContent = 'Utiliser ce dossier';
      button.addEventListener('click', () => action(async () => {
        selected = false; ticket = null; recovery.cancel();
        recovery.select(await session.chooseDedicatedFolder(folder.id)); selected = true;
        say('Dossier dédié relu et confirmé. Saisis le code Race Control pour vérifier les versions.');
      }));
      $('recovery-dedicated-list').append(label, button);
    }
    say(folders.length ? 'Dossiers dédiés retrouvés. Choisis explicitement celui à utiliser.' : 'Aucun dossier dédié autorisé trouvé. Vérifie le compte et la destination de la sauvegarde.');
  }));
  // Plusieurs têtes (conflit resté ouvert, appareil perdu) : aucune n'est choisie automatiquement.
  // Chaque tête est proposée ; l'autre reste sur Drive et sera fusionnée ensuite, conflits affichés.
  function offerHeads(heads, reference) {
    const info = $('recovery-preview-info'); info.replaceChildren();
    const intro = document.createElement('p'); intro.textContent = heads.length + ' versions divergentes coexistent sur Drive. Choisis celle à restaurer ; les autres restent conservées et seront proposées en fusion après restauration.';
    info.append(intro);
    for (const h of heads) {
      const b = document.createElement('button'); b.textContent = 'Restaurer la version de l’appareil …' + h.device.slice(-6) + ' (révision n° ' + h.seq + ')';
      b.addEventListener('click', () => action(async () => { await previewWith(reference, h.id); }));
      info.append(b);
    }
  }
  async function previewWith(reference, head = null) {
    ticket = await recovery.prepare(password(), reference, head); $('recovery-consent').checked = false;
    $('recovery-preview-info').textContent = 'Copie du ' + new Date(ticket.at).toLocaleString('fr-FR') + ' · révision ' + ticket.revision + ' · ' + ticket.size + ' octets chiffrés · SHA-256 ' + ticket.sha256;
    say((reference ? 'La référence saisie correspond à une révision authentifiée. Vérifie qu’elle provient bien de ta copie indépendante antérieure. ' : 'Lignée authentifiée sans référence indépendante : la présence de la dernière sauvegarde n’est pas prouvée. ') + 'Exporte cette copie chiffrée indépendamment, puis confirme l’installation sur ce navigateur vierge.');
  }
  $('recovery-preview').addEventListener('click', () => action(async () => {
    const reference = checkpoint();
    try { await previewWith(reference); }
    catch (e) { if (e.code !== 'heads') throw e; ticket = null; offerHeads(e.heads, reference); say('Versions divergentes : choix explicite requis. Rien n’a été écrit.'); }
  }));
  $('recovery-consent').addEventListener('change', paint);
  $('recovery-code').addEventListener('input', () => { ticket = null; paint(); });
  for (const id of ['recovery-known-revision', 'recovery-known-sha']) $(id).addEventListener('input', () => { ticket = null; paint(); });
  $('recovery-export').addEventListener('click', () => action(async () => { download(recovery.exportCopy(ticket)); say('Fichier chiffré proposé au téléchargement. Vérifie son enregistrement hors du navigateur avant installation.'); }));
  $('recovery-install').addEventListener('click', () => action(async () => {
    if (!$('recovery-consent').checked) return;
    await recovery.install(ticket, password(), true); ticket = null; $('recovery-code').value = '';
    session.disconnect(); selected = false;
    say('Copie installée dans le coffre chiffré. Restauration à vérifier : ferme cette page, rouvre-la et utilise Vérifier après réouverture.');
  }));
  $('recovery-verify').addEventListener('click', () => action(async () => {
    const proof = await recovery.verify(password()); $('recovery-code').value = '';
    say('Restauration vérifiée après réouverture : toutes les valeurs du coffre correspondent à la révision ' + proof.revision + '. Tu peux ouvrir Race Control, le déverrouiller puis reconnecter le même compte et dossier.');
    $('recovery-open-app').hidden = false;
  }));
  $('recovery-pending-copy').addEventListener('click', () => action(async () => { download(await recovery.pendingCopy()); say('Copie chiffrée de l’opération proposée au téléchargement.'); }));
  $('recovery-disconnect').addEventListener('click', () => { session?.disconnect(); recovery?.cancel(); selected = false; ticket = null; $('recovery-code').value = ''; $('recovery-dedicated-list').replaceChildren(); say('Déconnecté. Les copies restent conservées.'); paint(); });
  const stop = () => { session?.disconnect(); recovery?.cancel(); selected = false; ticket = null; $('recovery-code').value = ''; $('recovery-dedicated-list').replaceChildren(); };
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { $('recovery-code').value = ''; ticket = null; } else paint(); });
  paint();
})();
