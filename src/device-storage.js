/* Stockage local : import vérifié et coffre de verrouillage.
 * Le coffre conserve les réglages/journaux ; seuls les caches dérivés sont jetés.
 * Un journal d'import permet de revenir à l'état précédent après interruption.
 */
const DeviceStorage = (() => {
  const VAULT = 'twrc.device.vault.v1', PENDING = 'twrc.restore.pending.v1';
  let frozen = false;
  const appKey = k => typeof k === 'string' && k.startsWith('twrc.') && k !== PENDING;
  const keys = storage => Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(Boolean);
  const read = (storage, k) => storage.getItem(k);
  function put(storage, k, value) {
    if (value == null) storage.removeItem(k); else storage.setItem(k, value);
    if (read(storage, k) !== value) throw new Error('Écriture locale non confirmée.');
  }
  function snapshot(storage, names) { return Object.fromEntries(names.map(k => [k, read(storage, k)])); }
  function validValues(values) {
    return values && typeof values === 'object' && !Array.isArray(values) &&
      Object.entries(values).every(([k, v]) => appKey(k) && (v === null || typeof v === 'string'));
  }
  function rollback(storage, before) {
    // Retirer d'abord les nouvelles valeurs libère la place pour les anciennes.
    Object.keys(before).forEach(k => { if (read(storage, k) !== before[k]) put(storage, k, null); });
    Object.entries(before).forEach(([k, v]) => { if (read(storage, k) !== v) put(storage, k, v); });
  }
  function recover(storage) {
    let text; try { text = read(storage, PENDING); } catch (e) { return; }
    if (!text) return;
    const saved = JSON.parse(text);
    if (!saved || saved.v !== 1 || !validValues(saved.before)) throw new Error('Récupération locale à vérifier.');
    rollback(storage, saved.before);
    put(storage, PENDING, null);
  }
  function apply(storage, plan) {
    if (!plan || !validValues(plan.writes) || Object.values(plan.writes).some(v => v == null) ||
      !Array.isArray(plan.remove) || !plan.remove.every(appKey) || !Array.isArray(plan.removePrefixes) ||
      !plan.removePrefixes.every(p => p === 'twrc.cache.' || p === 'twrc.croute.')) throw new Error('Plan de restauration invalide.');
    recover(storage);
    const names = [...new Set([...Object.keys(plan.writes), ...plan.remove])];
    const before = snapshot(storage, names), journal = JSON.stringify({ v: 1, before });
    // Ces caches sont recalculables. Le journal protège toutes les données durables.
    keys(storage).filter(k => plan.removePrefixes.some(p => k.startsWith(p))).forEach(k => put(storage, k, null));
    put(storage, PENDING, journal); // si le stockage refuse ce journal, aucune donnée durable n'a changé
    try {
      Object.entries(plan.writes).forEach(([k, v]) => put(storage, k, v));
      plan.remove.filter(k => !Object.hasOwn(plan.writes, k)).forEach(k => put(storage, k, null));
      put(storage, PENDING, null); // succès uniquement après toutes les vérifications
    } catch (error) {
      try { rollback(storage, before); put(storage, PENDING, null); } catch (e) {
        // Garder le journal : la reprise suivante restaure l'ancien état avant de lire les réglages.
        error.recoveryPending = true;
      }
      throw error;
    }
  }
  const isLocked = storage => { try { return !!read(storage, VAULT); } catch (e) { return false; } };
  function finishLock(storage) {
    if (!isLocked(storage)) return;
    keys(storage).filter(k => k.startsWith('twrc.') && k !== VAULT).forEach(k => put(storage, k, null));
  }
  function bootstrap(target, storage) {
    try { recover(storage); finishLock(storage); } catch (e) { target.TWRC_STORAGE_ERROR = true; }
  }
  function guard(storage, failed = () => false) {
    const hidden = () => frozen || failed() || isLocked(storage) || !!read(storage, PENDING);
    return {
      get length() { return hidden() ? 0 : storage.length; },
      key: i => hidden() ? null : storage.key(i),
      getItem: k => hidden() && k.startsWith('twrc.') ? null : read(storage, k),
      setItem: (k, v) => { if (!hidden()) storage.setItem(k, v); },
      removeItem: k => { if (!hidden()) storage.removeItem(k); }
    };
  }
  const encode = bytes => {
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function derive(pass, salt, crypto) {
    if (!pass || !crypto || !crypto.subtle) throw new Error('Code ou chiffrement indisponible.');
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function validVault(v) {
    return v && v.v === 1 && v.it === 600000 && typeof v.s === 'string' && typeof v.i === 'string' && typeof v.c === 'string';
  }
  async function lock(storage, pass, crypto) {
    recover(storage);
    const names = keys(storage).filter(k => appKey(k) && k !== VAULT && k !== 'twrc.key' && !k.startsWith('twrc.cache.'));
    const values = snapshot(storage, names), text = JSON.stringify({ v: 1, values });
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await derive(pass, salt, crypto);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
    const checked = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher));
    if (checked !== text) throw new Error('Copie chiffrée non confirmée.');
    put(storage, VAULT, JSON.stringify({ v: 1, it: 600000, s: encode(salt), i: encode(iv), c: encode(cipher) }));
    // Le coffre est déjà relu et authentifié : une interruption reprend ce nettoyage au démarrage.
    finishLock(storage);
  }
  async function unlockPlan(storage, pass, crypto) {
    const text = read(storage, VAULT); if (!text) return null;
    const vault = JSON.parse(text); if (!validVault(vault)) throw new Error('Coffre local invalide.');
    const key = await derive(pass, decode(vault.s), crypto);
    const data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(vault.i) }, key, decode(vault.c))));
    if (!data || data.v !== 1 || !validValues(data.values) || Object.hasOwn(data.values, VAULT) || Object.hasOwn(data.values, 'twrc.key')) throw new Error('Coffre local invalide.');
    return { writes: Object.fromEntries(Object.entries(data.values).filter(([, v]) => v != null)), remove: [VAULT], removePrefixes: [] };
  }
  return { VAULT, PENDING, apply, recover, bootstrap, guard, isLocked, finishLock, lock, unlockPlan,
    isFrozen: () => frozen, freeze: value => { frozen = !!value; } };
})();
