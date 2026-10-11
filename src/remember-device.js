/* Autorisation locale optionnelle de 7 jours (appareil personnel).
 * Jamais de mot de passe ni de clé du coffre en clair dans localStorage ou IndexedDB.
 * Une clé AES-GCM non extractible, conservée dans IndexedDB, chiffre la clé de session.
 * Limite : un script malveillant exécuté sur la même origine pendant ces 7 jours peut
 * solliciter WebCrypto. Ce n'est pas un substitut au verrouillage de l'iPhone.
 */
const RememberDevice = (() => {
  const NAME = 'twrc.remember-device.v1', STORE = 'records', SLOT = 'device';
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const encoder = new TextEncoder();
  const encode = b => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
  const decode = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const extra = d => encoder.encode(JSON.stringify({ v: 1, s: d.s, l: d.l, at: d.at, exp: d.exp }));

  function connect() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return; }
      let req;
      try { req = indexedDB.open(NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ouverture IndexedDB impossible'));
      req.onblocked = () => reject(new Error('IndexedDB occupé'));
    });
  }
  async function record(mode, action) {
    const db = await connect();
    return new Promise((resolve, reject) => {
      let result;
      try {
        const tx = db.transaction(STORE, mode);
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Opération IndexedDB annulée')); };
        tx.onerror = () => { /* onabort porte l'erreur finale */ };
        const req = action(tx.objectStore(STORE));
        if (req) { req.onsuccess = () => { result = req.result; }; req.onerror = () => { /* onabort */ }; }
      } catch (e) { db.close(); reject(e); }
    });
  }
  const clear = () => record('readwrite', s => s.delete(SLOT));
  async function save(rawKey, salt, signal, crypto) {
    if (!(rawKey instanceof Uint8Array) || rawKey.length !== 32) throw new Error('Clé de session invalide');
    const now = Date.now(), meta = { v: 1, s: encode(salt), l: signal ?? null, at: now, exp: now + WEEK_MS };
    const wrappingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: extra(meta) }, wrappingKey, rawKey));
    await record('readwrite', s => s.put({ ...meta, wrappingKey, iv: encode(iv), cipher: encode(cipher) }, SLOT));
    return meta.exp;
  }
  async function resume(salt, signal, crypto) {
    let data;
    try { data = await record('readonly', s => s.get(SLOT)); }
    catch (e) { return null; }  // navigation privée / permissions : code requis
    if (!data) return null;
    const now = Date.now();
    if (data.v !== 1 || data.s !== salt || data.l !== (signal ?? null) ||
        !Number.isSafeInteger(data.at) || !Number.isSafeInteger(data.exp) ||
        data.exp - data.at !== WEEK_MS || now < data.at || now >= data.exp) {
      await clear().catch(() => {}); return null;
    }
    try {
      if (!data.wrappingKey || data.wrappingKey.extractable || data.wrappingKey.algorithm.name !== 'AES-GCM') throw new Error('Clé non conforme');
      const rawKey = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(data.iv), additionalData: extra(data) }, data.wrappingKey, decode(data.cipher)
      ));
      if (rawKey.length !== 32 || Date.now() >= data.exp) throw new Error('Clé expirée');
      return { rawKey, expiresAt: data.exp };
    } catch (e) { await clear().catch(() => {}); return null; }
  }
  return { WEEK_MS, save, resume, clear };
})();
