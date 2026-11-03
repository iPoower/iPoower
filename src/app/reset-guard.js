/* Réinitialisation protégée (zéro perte de données).
 * Avant toute remise à zéro, la valeur EXACTE des réglages (texte enregistré, à l'octet) est copiée dans
 * `twrc.restore.reset.v1`, via le même magasin que les réglages : avec un code, c'est le coffre chiffré
 * (SessionVault, AES-256-GCM), jamais une copie en clair sur le disque. L'écriture est relue avant d'aller plus loin :
 * sans instantané confirmé, aucune réinitialisation. « Annuler la réinitialisation » réécrit ce texte tel quel.
 * Les horodatages d'édition (`twrc.editstamps.v1`, ceux de la fusion Drive) sont copiés avec les réglages et restaurés
 * à l'identique : jamais l'heure de la restauration. Sans eux, une modification locale rétablie paraîtrait « non
 * modifiée » à la fusion et deviendrait un conflit sur l'autre appareil (constat #303, scénario C).
 * L'instantané n'est retiré qu'en dernier, par `release`, une fois la restauration ENREGISTRÉE par l'app (coffre écrit) :
 * `restore` réécrit et relit, mais ne retire rien.
 * Deux réinitialisations de suite n'écrasent pas la première : les 3 derniers instantanés sont gardés (pile).
 * Clé propre à l'appareil (préfixe `twrc.restore.` = SyncMerge.device) : l'instantané ne voyage jamais par Drive.
 * Le journal des trajets n'est ni lu ni écrit ici (clés protégées par JournalArchive).
 */
const RESET_GUARD = (() => {
  const KEY = 'twrc.restore.reset.v1', SETTINGS = 'twrc.settings.v1', STAMPS = 'twrc.editstamps.v1', WORD = 'RÉINITIALISER', REPLACE = 'REMPLACER', MAX = 3;
  // Majuscules/minuscules et accent indifférents (clavier iPhone) ; le mot entier reste exigé.
  const bare = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  const wordOk = (s, word = WORD) => bare(s) === bare(word);   // RÉINITIALISER, ou REMPLACER pour remplacer aussi Drive
  const text = v => v === null || typeof v === 'string';
  // `stamps` absent : instantané pris avant cette version (horodatages laissés tels quels à la restauration).
  const valid = x => !!x && Number.isFinite(x.at) && text(x.settings) && (x.stamps === undefined || text(x.stamps));
  function list(store) {
    let o = null; try { o = JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { return []; }
    return o && o.v === 1 && Array.isArray(o.list) && o.list.every(valid) ? o.list : [];
  }
  const read = store => { const l = list(store); return l.length ? l[l.length - 1] : null; };
  function write(store, l) {
    if (!l.length) { store.removeItem(KEY); if (store.getItem(KEY) !== null) throw new Error('Instantané non retiré.'); return; }
    const text = JSON.stringify({ v: 1, list: l }); store.setItem(KEY, text);
    if (store.getItem(KEY) !== text) throw new Error('Instantané non confirmé : réinitialisation refusée, réglages inchangés.');
  }
  // Instantané : textes stockés tels quels (null = rien encore enregistré sur cet appareil).
  function take(store, now) {
    const snap = { at: now, settings: store.getItem(SETTINGS), stamps: store.getItem(STAMPS) };
    write(store, [...list(store), snap].slice(-MAX));
    return snap;
  }
  const put = (store, key, value) => { if (value === null) store.removeItem(key); else store.setItem(key, value); };
  // Restauration à l'octet du dernier instantané (réglages puis horodatages), relue. L'instantané est CONSERVÉ :
  // seul `release` le retire, après confirmation de l'enregistrement par l'appelant.
  function restore(store) {
    const l = list(store), snap = l[l.length - 1]; if (!snap) throw new Error('Aucun instantané à restaurer sur cet appareil.');
    put(store, SETTINGS, snap.settings);
    if (snap.stamps !== undefined) put(store, STAMPS, snap.stamps);
    if (store.getItem(SETTINGS) !== snap.settings || (snap.stamps !== undefined && store.getItem(STAMPS) !== snap.stamps))
      throw new Error('Restauration non confirmée : instantané conservé.');
    return snap;
  }
  // Retrait du seul instantané restauré (toujours le dernier de la pile), en dernier ; un autre instantané n'est jamais retiré.
  function release(store, snap) {
    const l = list(store), top = l[l.length - 1];
    if (!snap || !top || top.at !== snap.at || top.settings !== snap.settings || top.stamps !== snap.stamps) throw new Error('Instantané modifié entre-temps : conservé.');
    write(store, l.slice(0, -1));
  }
  return { KEY, SETTINGS, STAMPS, WORD, REPLACE, MAX, wordOk, list, read, take, restore, release };
})();
