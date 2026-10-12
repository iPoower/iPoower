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
      if (!data.wrappingKey || data.wrappingKey.extractable || data.wrappingKey.algorithm.name !== 'AES-GCM' || data.wrappingKey.algorithm.length !== 256 ||
          typeof data.iv !== 'string' || data.iv.length !== 16 || typeof data.cipher !== 'string' || data.cipher.length !== 64) throw new Error('Clé non conforme');
      const rawKey = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: decode(data.iv), additionalData: extra(data) }, data.wrappingKey, decode(data.cipher)
      ));
      if (rawKey.length !== 32 || Date.now() >= data.exp) throw new Error('Clé expirée');
      return { rawKey, expiresAt: data.exp };
    } catch (e) { await clear().catch(() => {}); return null; }
  }
  // Session d'un seul onglet : sessionStorage ne garde qu'un identifiant, des
  // métadonnées authentifiées et la clé du coffre CHIFFRÉE. La clé d'enveloppe
  // est un CryptoKey non extractible dans IndexedDB. Une panne IDB impose le
  // code au prochain chargement, sans toucher au coffre ni bloquer la page.
  const sessionExtra = d => encoder.encode(JSON.stringify({ v: 4, id: d.id, s: d.s, l: d.l, a: d.a, e: d.e }));
  const validSession = d => !!d && d.v === 4 && /^[0-9a-f]{32}$/.test(d.id || '') &&
    typeof d.s === 'string' && (d.l === null || typeof d.l === 'string') &&
    Number.isSafeInteger(d.a) && Number.isSafeInteger(d.e) && d.e - d.a === WEEK_MS;
  const sessionSlot = id => 'tab:' + id;
  const sessions = {
    async save(rawKey, meta, crypto) {
      if (!(rawKey instanceof Uint8Array) || rawKey.length !== 32) throw new Error('Clé de session invalide');
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
      const descriptor = { ...meta, v: 4, id };
      if (!validSession(descriptor) || decode(descriptor.s).length !== 16) throw new Error('Métadonnées de session invalides');
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: sessionExtra(descriptor) }, key, rawKey));
      await record('readwrite', s => {
        // Collecter uniquement les sessions terminées ; ne jamais évincer un onglet actif.
        const cursor = s.openCursor(), now = Date.now();
        cursor.onsuccess = () => { const row = cursor.result; if (!row) return;
          if (String(row.key).startsWith('tab:') && Number.isSafeInteger(row.value.e) && row.value.e <= now) row.delete();
          row.continue();
        };
        return s.put({ v: 4, key, e: descriptor.e }, sessionSlot(id));
      });
      return { ...descriptor, i: encode(iv), c: encode(cipher) };
    },
    async resume(descriptor, crypto, now = Date.now()) {
      if (!validSession(descriptor) || now < descriptor.a || now >= descriptor.e ||
          typeof descriptor.i !== 'string' || typeof descriptor.c !== 'string') return null;
      let rawKey;
      try {
        const item = await record('readonly', s => s.get(sessionSlot(descriptor.id)));
        if (!item || item.v !== 4 || item.e !== descriptor.e || !item.key || item.key.extractable ||
            item.key.algorithm.name !== 'AES-GCM' || item.key.algorithm.length !== 256) return null;
        const iv = decode(descriptor.i), cipher = decode(descriptor.c);
        if (iv.length !== 12 || cipher.length !== 48) return null;
        rawKey = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: sessionExtra(descriptor) }, item.key, cipher));
        if (rawKey.length !== 32) { rawKey.fill(0); return null; }
        return { rawKey, expiresAt: descriptor.e };
      } catch (e) { if (rawKey) rawKey.fill(0); return null; }
    },
    async clear(descriptor) {
      if (descriptor && /^[0-9a-f]{32}$/.test(descriptor.id || '')) await record('readwrite', s => s.delete(sessionSlot(descriptor.id)));
    },
    async revokeAll() {
      await record('readwrite', s => {
        const request = s.openCursor();
        request.onsuccess = () => { const row = request.result; if (!row) return;
          if (String(row.key).startsWith('tab:')) row.delete();
          row.continue();
        };
      });
    }
  };
  return { WEEK_MS, save, resume, clear, sessions };
})();
