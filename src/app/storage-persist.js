// Persistance du stockage local (constat : Diagnostic disait « DURABLE » alors que navigator.storage.persisted()
// renvoyait false et que storage.persist() n'était jamais demandé). La persistance est DEMANDÉE au navigateur à la
// première écriture du coffre de chaque ouverture (jamais au chargement : rien à protéger avant), une seule fois, et
// seulement si elle n'est pas déjà accordée. L'état affiché est celui que le navigateur RELIT (persisted()), jamais
// déduit d'une simple relecture après écriture. Sans API (ancien navigateur) : « inconnu », jamais « oui ».
const STORAGE_PERSIST = { asked: false, persisted: null, granted: null, at: 0 };
function storagePersistApi() { try { return navigator.storage && typeof navigator.storage.persisted === 'function' ? navigator.storage : null; } catch { return null; } }
function storagePersistRefresh() {
  const st = storagePersistApi(); if (!st) { STORAGE_PERSIST.persisted = null; return Promise.resolve(null); }
  return st.persisted().then(v => { STORAGE_PERSIST.persisted = v === true; return STORAGE_PERSIST.persisted; }, () => { STORAGE_PERSIST.persisted = null; return null; });
}
function storagePersistAsk() {
  if (STORAGE_PERSIST.asked) return;
  STORAGE_PERSIST.asked = true;
  const st = storagePersistApi(); if (!st || typeof st.persist !== 'function') return;
  storagePersistRefresh().then(already => already ? true : st.persist().then(v => { STORAGE_PERSIST.granted = v === true; STORAGE_PERSIST.at = Date.now(); return storagePersistRefresh(); }))
    .catch(() => { /* refus ou API indisponible : affiché « non » ou « inconnu » */ });
}
// « persistant : oui / non / inconnu » pour le Diagnostic.
const storagePersistText = () => 'persistant : ' + (STORAGE_PERSIST.persisted === true ? 'oui' : STORAGE_PERSIST.persisted === false ? 'non' + (STORAGE_PERSIST.asked && STORAGE_PERSIST.granted === false ? ' (demande refusée par le navigateur)' : '') : 'inconnu');
try { window.addEventListener('twrc-vault-change', storagePersistAsk); storagePersistRefresh(); } catch { /* hors navigateur */ }
