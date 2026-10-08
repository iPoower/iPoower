// Stockage local sûr : import de sauvegarde vérifié (jamais de faux succès) et coffre chiffré du verrouillage.
// Fonctions pures vis-à-vis de l'application : elles reçoivent le stockage (API localStorage) et WebCrypto en paramètres.
'use strict';
const SafeStore = (() => {
  // Clés techniques laissées en clair au verrouillage : aucune donnée personnelle (pause météo, onglet, choix « sans code »).
  const TECHNICAL = new Set(['twrc.weather.limit.v1', 'twrc.view', 'twrc.nocode', 'twrc.vault.v1']);
  // Secrets déverrouillés : jamais copiés dans le coffre, effacés au verrouillage, recréés par le déverrouillage.
  const UNLOCKED = ['twrc.plain', 'twrc.plain.v', 'twrc.key'];
  const VAULT = 'twrc.vault.v1', IT = 600000;
  const keysOf = storage => { const out = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k != null) out.push(k); } return out; };
  const personal = storage => keysOf(storage).filter(k => /^twrc\./.test(k) && !TECHNICAL.has(k) && !UNLOCKED.includes(k));

  /* ---------- A02 : import vérifié ----------
     plan = { writes: { clé: valeur }, remove: [clés], removePrefixes: [préfixes] } (Backup.restorePlan).
     1. instantané de toutes les clés concernées ; 2. retraits puis écritures, chaque erreur remonte ; 3. relecture de chaque
     écriture et de chaque retrait ; 4. au moindre écart : retour à l'instantané. Le succès n'est annoncé qu'après la relecture. */
  function apply(plan, storage) {
    const all = keysOf(storage), writes = Object.entries(plan.writes);
    // caches dérivés (préfixes) : retirés en premier pour libérer de la place ; leur restauration est facultative
    const derived = all.filter(k => plan.removePrefixes.some(p => k.startsWith(p)) && !(k in plan.writes));
    // données canoniques : chaque clé est d'abord ÉCRASÉE (jamais supprimée avant que sa nouvelle valeur soit en place)
    const removed = [...new Set(plan.remove)].filter(k => !(k in plan.writes));
    const canonical = [...new Set([...removed, ...Object.keys(plan.writes)])];
    const before = new Map(canonical.map(k => [k, storage.getItem(k)])), cache = new Map(derived.map(k => [k, storage.getItem(k)]));
    const rollback = () => {
      for (const [k, v] of before) { try { if (v == null) storage.removeItem(k); else if (storage.getItem(k) !== v) storage.setItem(k, v); } catch (e) { /* constaté ci-dessous */ } }
      for (const [k, v] of cache) { try { if (v != null) storage.setItem(k, v); } catch (e) { /* cache dérivé : sera recalculé */ } }
      // échec = toute donnée canonique qui ne retrouve pas sa valeur d'origine (exception ou écriture altérée)
      return [...before].filter(([k, v]) => { try { return storage.getItem(k) !== v; } catch (e) { return true; } }).map(([k]) => k);
    };
    try {
      derived.forEach(k => storage.removeItem(k));
      writes.forEach(([k, v]) => storage.setItem(k, v));
      removed.forEach(k => storage.removeItem(k));
      const bad = writes.filter(([k, v]) => storage.getItem(k) !== v).map(([k]) => k).concat(removed.filter(k => storage.getItem(k) != null));
      if (bad.length) throw Object.assign(new Error('relecture différente'), { keys: bad });
      return { ok: true };
    } catch (e) {
      const failed = rollback();
      return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'quota' : e && e.keys ? 'verify' : 'write', rolledBack: !failed.length, failed };
    }
  }

  /* ---------- A01 : coffre du verrouillage ----------
     « Verrouiller cet appareil » : toutes les données personnelles (réglages, contexte, journal, lieux, caches de météo et de
     route, GPS…) sont chiffrées avec le code (PBKDF2-SHA256 600 000 itérations → AES-256-GCM) dans une seule clé, puis
     effacées en clair. Rien de personnel n'est alors chargé, affiché ni envoyé. Le déverrouillage avec le même code les rend
     intactes. Le coffre est écrit et relu AVANT tout effacement : un stockage plein annule le verrouillage sans rien perdre. */
  const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function derive(subtle, pass, salt, it, use) {
    const base = await subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [use]);
  }
  async function lock(storage, pass, cryptoImpl, opt = {}) {
    if (!pass) return { ok: false, error: 'nocode' };
    const subtle = cryptoImpl && cryptoImpl.subtle; if (!subtle) return { ok: false, error: 'crypto' };
    const keys = personal(storage), data = Object.fromEntries(keys.map(k => [k, storage.getItem(k)]));
    let previous = null; try { previous = storage.getItem(VAULT); } catch (e) { /* lecture impossible */ }
    if (previous) {   // coffre déjà présent (verrouillage interrompu) : on le fusionne, les valeurs actuelles l'emportent
      const old = await openVault(previous, pass, cryptoImpl); if (!old) return { ok: false, error: 'oldvault' };
      Object.keys(old).forEach(k => { if (!(k in data)) data[k] = old[k]; });
    }
    const it = opt.iterations || IT, salt = cryptoImpl.getRandomValues(new Uint8Array(16)), iv = cryptoImpl.getRandomValues(new Uint8Array(12));
    const key = await derive(subtle, pass, salt, it, 'encrypt');
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
    const txt = JSON.stringify({ v: 1, it, s: b64e(salt), i: b64e(iv), c: b64e(ct), n: Object.keys(data).length });
    try { storage.setItem(VAULT, txt); } catch (e) { return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'quota' : 'write' }; }
    if (storage.getItem(VAULT) !== txt) return { ok: false, error: 'verify' };
    const back = await openVault(txt, pass, cryptoImpl);
    if (!back || Object.keys(data).some(k => back[k] !== data[k])) { try { if (previous) storage.setItem(VAULT, previous); else storage.removeItem(VAULT); } catch (e) { /* inchangé */ } return { ok: false, error: 'verify' }; }
    [...keys, ...UNLOCKED].forEach(k => { try { storage.removeItem(k); } catch (e) { /* déjà absent */ } });
    return { ok: true, count: Object.keys(data).length };
  }
  async function openVault(txt, pass, cryptoImpl) {
    try {
      const o = typeof txt === 'string' ? JSON.parse(txt) : txt;
      const key = await derive(cryptoImpl.subtle, pass, b64d(o.s), o.it || IT, 'decrypt');
      const pt = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv: b64d(o.i) }, key, b64d(o.c));
      const data = JSON.parse(new TextDecoder().decode(pt));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch (e) { return null; }
  }
  // Déverrouillage : remplace les données génériques créées pendant le verrouillage par celles du coffre, vérifie, puis supprime
  // le coffre. Code différent (préréglage republié avec un autre code) : le coffre reste intact.
  async function unlock(storage, pass, cryptoImpl) {
    let txt = null; try { txt = storage.getItem(VAULT); } catch (e) { return { ok: false, error: 'read' }; }
    if (!txt) return { ok: true, restored: 0 };
    const data = await openVault(txt, pass, cryptoImpl); if (!data) return { ok: false, error: 'code' };
    const plan = { writes: data, remove: personal(storage).filter(k => !(k in data)), removePrefixes: [] };
    const r = apply(plan, storage); if (!r.ok) return { ok: false, error: r.error };
    try { storage.removeItem(VAULT); } catch (e) { /* le coffre restera, sans danger : mêmes données */ }
    return { ok: true, restored: Object.keys(data).length };
  }
  const locked = storage => { try { return !!storage.getItem(VAULT); } catch (e) { return false; } };
  return { apply, lock, unlock, openVault, locked, personal, TECHNICAL, UNLOCKED, VAULT };
})();
if (typeof module !== 'undefined') module.exports = SafeStore;
