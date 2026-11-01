/* Réinitialisation protégée (zéro perte de données).
 * Avant toute remise à zéro, la valeur EXACTE des réglages (texte enregistré, à l'octet) est copiée dans
 * `twrc.restore.reset.v1`, via le même magasin que les réglages : avec un code, c'est le coffre chiffré
 * (SessionVault, AES-256-GCM), jamais une copie en clair sur le disque. L'écriture est relue avant d'aller plus loin :
 * sans instantané confirmé, aucune réinitialisation. « Annuler la réinitialisation » réécrit ce texte tel quel.
 * Deux réinitialisations de suite n'écrasent pas la première : les 3 derniers instantanés sont gardés (pile).
 * Clé propre à l'appareil (préfixe `twrc.restore.` = SyncMerge.device) : l'instantané ne voyage jamais par Drive.
 * Le journal des trajets n'est ni lu ni écrit ici (clés protégées par JournalArchive).
 */
const RESET_GUARD = (() => {
  const KEY = 'twrc.restore.reset.v1', SETTINGS = 'twrc.settings.v1', WORD = 'RÉINITIALISER', MAX = 3;
  // Majuscules/minuscules et accent indifférents (clavier iPhone) ; le mot entier reste exigé.
  const bare = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  const wordOk = s => bare(s) === bare(WORD);
  const valid = x => !!x && Number.isFinite(x.at) && (x.settings === null || typeof x.settings === 'string');
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
  // Instantané : texte stocké tel quel (null = aucun réglage encore enregistré sur cet appareil).
  function take(store, now) {
    const snap = { at: now, settings: store.getItem(SETTINGS) };
    write(store, [...list(store), snap].slice(-MAX));
    return snap;
  }
  // Restauration à l'octet du dernier instantané ; il n'est retiré qu'après relecture conforme.
  function restore(store) {
    const l = list(store), snap = l[l.length - 1]; if (!snap) throw new Error('Aucun instantané à restaurer sur cet appareil.');
    if (snap.settings === null) store.removeItem(SETTINGS); else store.setItem(SETTINGS, snap.settings);
    if (store.getItem(SETTINGS) !== snap.settings) throw new Error('Restauration non confirmée : instantané conservé.');
    write(store, l.slice(0, -1));
    return snap;
  }
  return { KEY, SETTINGS, WORD, MAX, wordOk, list, read, take, restore };
})();
