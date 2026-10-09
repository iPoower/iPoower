/* Coffre de session (sécurité V1) — aucune donnée personnelle ni code en clair dans le stockage durable du navigateur.
 *
 * Au repos (localStorage) : uniquement le coffre chiffré `twrc.vault.v2` et quelques préférences d'interface sans donnée
 * personnelle (PUBLIC). Pendant une session déverrouillée : les valeurs vivent en mémoire (MemStore) ; chaque écriture est
 * rechiffrée dans le coffre (AES-256-GCM, IV aléatoire neuf à chaque écriture, clé PBKDF2-SHA256 600 000 itérations dérivée
 * du code, sel aléatoire de 16 octets, format versionné, intégrité GCM vérifiée par relecture).
 * La clé dérivée de l'onglet est gardée dans sessionStorage (`twrc.session.v2`) : un rechargement ne redemande pas le code ;
 * la fermeture de l'onglet / de l'app l'efface → code demandé à la réouverture. « Verrouiller » l'efface aussitôt.
 * Limite assumée : ce chiffrement protège les données AU REPOS (copie du disque, autre application lisant le stockage,
 * appareil verrouillé). Il ne protège pas d'un JavaScript malveillant exécuté dans une session déjà déverrouillée.
 *
 * Migration (ancien format en clair, `twrc.key` présent) : instantané → chiffrement → relecture et déchiffrement →
 * comparaison valeur par valeur → seulement alors suppression des copies lisibles. Toute erreur avant la vérification
 * laisse les anciennes données intactes. Une interruption après l'écriture du coffre reprend au démarrage suivant :
 * tant que les données en clair existent, elles font foi et le coffre est revérifié contre elles avant nettoyage.
 */
const SessionVault = (() => {
  const VAULT = 'twrc.vault.v2', SESSION = 'twrc.session.v2', LOCK_SIGNAL = 'twrc.lock.signal', V1 = 'twrc.device.vault.v1', IT = 600000;
  // Préférences sans donnée personnelle (onglet, mode sans code, carte repliée, pause de quota, occasion de tenue, anti-boucle).
  const PUBLIC = new Set(['twrc.view', 'twrc.nocode', 'twrc.tripmap', 'twrc.weather.limit.v1', 'twrc.outfit.occasion', 'twrc.presetv', LOCK_SIGNAL]);
  const isPublic = k => PUBLIC.has(k) || k.startsWith('twrc.reload.');
  const isApp = k => typeof k === 'string' && k.startsWith('twrc.');
  // Clés jamais chiffrées dans le coffre : lui-même, la session, le coffre v1 et le journal d'import du stockage brut.
  const META = new Set([VAULT, SESSION, V1, 'twrc.restore.pending.v1']);
  const secret = k => isApp(k) && !isPublic(k) && !META.has(k);
  const keysOf = s => { const out = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k != null) out.push(k); } return out; };
  const enc = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const te = new TextEncoder(), td = new TextDecoder();

  function validVault(v) {
    try { return !!v && v.v === 2 && v.kdf === 'PBKDF2-SHA256' && v.it === IT && dec(v.s).length === 16 && dec(v.i).length === 12 && dec(v.c).length >= 16; } catch (e) { return false; }
  }
  const readVault = raw => { try { const t = raw.getItem(VAULT); if (!t) return null; const v = JSON.parse(t); return validVault(v) ? v : { invalid: true }; } catch (e) { return { invalid: true }; } };
  async function deriveRaw(pass, salt, crypto) {
    const m = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: IT, hash: 'SHA-256' }, m, 256));
  }
  const importKey = (raw, crypto) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  // n (ordre global des écritures, tous onglets) et t (horodatage) sont en clair dans l'en-tête : aucune donnée personnelle.
  // Ils sont aussi dans le texte chiffré et doivent concorder (un en-tête modifié ne peut pas imposer un état).
  async function seal(values, key, salt, crypto, n, t) {
    const iv = crypto.getRandomValues(new Uint8Array(12)), text = JSON.stringify({ v: 2, n, t, values });
    const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text)));
    return { sealed: JSON.stringify({ v: 2, kdf: 'PBKDF2-SHA256', it: IT, n, t, s: enc(salt), i: enc(iv), c: enc(c) }), text };
  }
  const order = v => ({ n: Number.isFinite(v && v.n) ? v.n : 0, t: Number.isFinite(v && v.t) ? v.t : 0 });
  const newer = (a, b) => a.n > b.n || (a.n === b.n && a.t > b.t);
  async function open(vault, key, crypto) {
    const text = td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dec(vault.i) }, key, dec(vault.c)));
    const data = JSON.parse(text);
    if (!data || data.v !== 2 || (vault.n != null && (data.n !== vault.n || data.t !== vault.t)) || !data.values || typeof data.values !== 'object' || Array.isArray(data.values) ||
      !Object.entries(data.values).every(([k, v]) => secret(k) && typeof v === 'string')) throw new Error('Coffre local invalide.');
    return data;
  }
  const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] === a[k]); };
  function put(raw, k, v) {
    if (v == null) raw.removeItem(k); else raw.setItem(k, v);
    if (raw.getItem(k) !== (v == null ? null : v)) throw new Error('Écriture locale non confirmée.');
  }
  // Copies lisibles retirées seulement après un coffre relu ET déchiffré identique (appelé uniquement dans ce cas).
  function dropPlain(raw, names) { names.forEach(k => { if (secret(k)) put(raw, k, null); }); }
  function plainSnapshot(raw) { const o = {}; keysOf(raw).filter(secret).forEach(k => { const v = raw.getItem(k); if (v != null) o[k] = v; }); return o; }
  // Les caches recalculables (météo, routes) peuvent être sacrifiés si le stockage est plein — jamais les données durables.
  const CACHE = k => k.startsWith('twrc.cache.') || k.startsWith('twrc.croute') || k.startsWith('twrc.road.');
  // seul un stockage PLEIN justifie de sacrifier les caches ; un refus (mode privé, permission) ne supprime rien
  const full = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

  /* ---------- magasin en mémoire, présenté comme localStorage ---------- */
  const PENDING = 'twrc.restore.pending.v1';
  function memStore(raw, initial, persist) {
    // vol : journal d'import (anciennes valeurs) gardé en mémoire uniquement, jamais en clair sur le disque
    const m = new Map(Object.entries(initial || {})), dirty = new Set(), vol = new Map();
    const listOf = () => [...keysOf(raw).filter(k => !secret(k) && !META.has(k)), ...m.keys(), ...vol.keys()];
    const api = {
      get length() { return listOf().length; },
      key: i => { const l = listOf(); return i >= 0 && i < l.length ? l[i] : null; },
      getItem: k => { k = String(k); if (k === PENDING) return vol.has(k) ? vol.get(k) : null; return secret(k) ? (m.has(k) ? m.get(k) : null) : META.has(k) ? null : raw.getItem(k); },
      setItem: (k, v) => { k = String(k); v = String(v); if (k === PENDING) { vol.set(k, v); return; } if (META.has(k)) return; if (!secret(k)) { raw.setItem(k, v); return; } m.set(k, v); dirty.add(k); persist(); },
      removeItem: k => { k = String(k); if (k === PENDING) { vol.delete(k); return; } if (META.has(k)) return; if (!secret(k)) { raw.removeItem(k); return; } if (m.delete(k)) { dirty.add(k); persist(); } },
      clear: () => { [...m.keys()].forEach(k => dirty.add(k)); m.clear(); vol.clear(); persist(); }
    };
    // Présenté comme un vrai Storage : Object.keys(localStorage), localStorage[k], « k in localStorage » fonctionnent.
    const store = new Proxy(api, {
      get: (t, p) => typeof p === 'symbol' || p in t ? (typeof t[p] === 'function' ? t[p] : Reflect.get(t, p)) : t.getItem(p),
      set: (t, p, v) => { if (typeof p === 'symbol' || p in t) return Reflect.set(t, p, v); t.setItem(p, v); return true; },   // méthodes remplaçables comme sur Storage
      deleteProperty: (t, p) => { if (typeof p !== 'symbol' && !(p in t)) t.removeItem(p); return true; },
      has: (t, p) => typeof p === 'symbol' || p in t ? Reflect.has(t, p) : t.getItem(p) != null,
      ownKeys: () => listOf(),
      getOwnPropertyDescriptor: (t, p) => typeof p === 'string' && !(p in t) && t.getItem(p) != null ? { value: t.getItem(p), writable: true, enumerable: true, configurable: true } : undefined
    });
    return { store, map: m, dirty, vol };
  }

  /* ---------- session (une instance par page) ---------- */
  function create({ raw, session, crypto, target, locks = target && target.navigator && target.navigator.locks }) {
    const st = { mode: 'plain', key: null, salt: null, n: 0, t: 0, saved: {}, mem: null, epoch: 0, lockSignal: raw.getItem(LOCK_SIGNAL), chain: Promise.resolve(), error: null, warn: null, timer: null };
    const values = () => Object.fromEntries(st.mem.map);
    function requireLocks() {
      if (!locks || typeof locks.request !== 'function') throw Object.assign(new Error('Ce navigateur ne permet pas une sauvegarde sûre entre plusieurs fenêtres. Mets-le à jour ou exporte une sauvegarde.'), { unsupported: true });
    }
    // Une file Promise par page ne suffit pas : le verrou couvre lecture, fusion, chiffrement ET vérification sur toute l'origine.
    async function exclusive(fn) { requireLocks(); return locks.request(VAULT, { mode: 'exclusive' }, fn); }
    function forget() {
      st.epoch++; if (st.mem) { st.mem.map.clear(); st.mem.dirty.clear(); st.mem.vol.clear(); }
      try { session.removeItem(SESSION); } catch (e) { /* rien */ }
      st.key = null; st.salt = null; st.saved = {}; st.mode = 'locked'; st.error = null;
    }
    function guardSession(epoch, mem) {
      if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) !== st.lockSignal) forget();
      if (st.mode !== 'vault' || st.epoch !== epoch || st.mem !== mem) throw Object.assign(new Error('Session verrouillée pendant l’enregistrement.'), { cancelled: true });
    }
    function merge(data, notify) {
      const before = values(), next = { ...data.values };
      st.mem.dirty.forEach(k => { if (st.mem.map.has(k)) next[k] = st.mem.map.get(k); else delete next[k]; });
      st.n = order(data).n; st.t = order(data).t; st.saved = { ...data.values };
      st.mem.map.clear(); Object.entries(next).forEach(([k, v]) => st.mem.map.set(k, v));
      const changed = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter(k => before[k] !== next[k]);
      changed.forEach(k => {
        if (notify) notify(k, before[k] ?? null, next[k] ?? null);
        else if (target && target.StorageEvent && target.dispatchEvent) {
          try { target.dispatchEvent(new target.StorageEvent('storage', { key: k, oldValue: before[k] ?? null, newValue: next[k] ?? null })); } catch (e) { /* rendu suivant */ }
        }
      });
    }
    async function latest(guard) {
      const sealed = raw.getItem(VAULT), vault = sealed && JSON.parse(sealed);
      if (!validVault(vault) || vault.s !== enc(st.salt)) throw new Error('Coffre local invalide ou remplacé.');
      const data = await open(vault, st.key, crypto); guard();
      if (raw.getItem(VAULT) !== sealed) throw Object.assign(new Error('Coffre modifié pendant la lecture.'), { conflict: true });
      return data;
    }
    async function savePending() {
      if (st.mode !== 'vault') return;
      const epoch = st.epoch, mem = st.mem, guard = () => guardSession(epoch, mem); guard();
      if (!mem.dirty.size) return;
      // Relire le dernier coffre authentifié sous verrou, puis appliquer seulement les clés modifiées (suppression comprise).
      const data = await latest(guard), base = newer({ n: st.n, t: st.t }, order(data)) ? st.saved : data.values;
      const sent = new Map([...mem.dirty].map(k => [k, mem.map.has(k) ? mem.map.get(k) : null])), snap = { ...base };
      sent.forEach((v, k) => { if (v == null) delete snap[k]; else snap[k] = v; });
      await writeVerified(snap, st.salt, guard); guard();
      // Une valeur peut encore changer pendant WebCrypto. Elle reste en attente jusqu'à sa propre écriture vérifiée.
      sent.forEach((v, k) => { if ((mem.map.has(k) ? mem.map.get(k) : null) === v) mem.dirty.delete(k); });
      merge({ n: st.n, t: st.t, values: snap }); st.error = null;
    }
    function persist() {
      if (st.mode !== 'vault' || st.timer) return;
      // microtâche (pas une minuterie) : part dès la fin du code en cours, jamais retardée par une horloge gelée ou un onglet en veille
      st.timer = true; Promise.resolve().then(() => { st.timer = null; flush(); });
    }
    function flush() {
      if (st.mode !== 'vault') return st.chain;
      st.chain = st.chain.then(() => exclusive(savePending)).catch(e => {
        if (e.cancelled || st.mode !== 'vault') return;
        st.error = (e.unsupported ? e.message + ' ' : 'Enregistrement chiffré non confirmé (stockage plein, refusé ou modifié) : ') + 'les modifications restent en mémoire ; exporte une sauvegarde.';
        if (target && target.dispatchEvent) try { target.dispatchEvent(new Event('twrc-vault-error')); } catch (x) { /* rien */ }
      });
      return st.chain;
    }
    function nextOrder() { const d = order(readVault(raw)); return { n: Math.max(st.n, d.n) + 1, t: Math.max(Date.now(), st.t + 1, d.t + 1) }; }
    async function useKey(rawKey, salt) { st.key = await importKey(rawKey, crypto); st.salt = salt; }
    function saveSession(rawKey, salt) { try { session.setItem(SESSION, JSON.stringify({ v: 2, s: enc(salt), k: enc(rawKey), l: raw.getItem(LOCK_SIGNAL) })); } catch (e) { /* session non conservée : code redemandé au rechargement */ } }
    async function writeVerified(vals, salt, guard) {
      requireLocks();
      const key = st.key, signal = raw.getItem(LOCK_SIGNAL), previous = raw.getItem(VAULT);
      const active = guard || (() => { if (st.key !== key || raw.getItem(LOCK_SIGNAL) !== signal) throw Object.assign(new Error('Session modifiée.'), { cancelled: true }); });
      active(); const nx = nextOrder(), out = await seal(vals, key, salt, crypto, nx.n, nx.t); active();
      // Les anciennes versions ne prennent pas le verrou : ne pas écraser une écriture qu'elles ont faite pendant WebCrypto.
      if (raw.getItem(VAULT) !== previous) throw Object.assign(new Error('Coffre modifié pendant le chiffrement.'), { conflict: true });
      try { put(raw, VAULT, out.sealed); }
      catch (e) {
        if (!full(e)) throw e;
        keysOf(raw).filter(k => isApp(k) && CACHE(k)).forEach(k => { try { raw.removeItem(k); } catch (x) { /* rien */ } });
        active(); put(raw, VAULT, out.sealed);
      }
      const back = await open(JSON.parse(raw.getItem(VAULT)), key, crypto); active();
      if (!same(back.values, vals) || raw.getItem(VAULT) !== out.sealed) throw new Error('Coffre relu différent.');
      st.n = nx.n; st.t = nx.t; st.saved = { ...vals };
    }
    // stockage plein pendant la migration : sacrifier les caches recalculables puis réessayer une seule fois
    async function writeWithRoom(vals, salt) {
      try { await writeVerified(vals, salt); return vals; } catch (e) {
        if (!full(e)) throw e;
        const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k)));
        // setItem remplace atomiquement l'ancien coffre. Le supprimer n'économise rien dans la taille finale et expose à une perte au nouvel échec.
        keysOf(raw).filter(k => isApp(k) && CACHE(k)).forEach(k => { try { raw.removeItem(k); } catch (x) { /* rien */ } });
        await writeVerified(lean, salt); return lean;
      }
    }
    function enter(vals) { st.epoch++; st.mem = memStore(raw, vals, persist); st.saved = { ...vals }; st.lockSignal = raw.getItem(LOCK_SIGNAL); st.mode = 'vault'; st.error = null; }

    /* Démarrage : mode et magasin à utiliser par l'application. Ne jette jamais : en cas de doute, rien n'est effacé. */
    async function boot() {
      // Aucun coffre ni migration : démarrer dans la microtâche courante, avant pageshow (reprise GPS), sans attendre un verrou inutile.
      if (!readVault(raw) && !raw.getItem('twrc.key') && !raw.getItem(V1)) { st.mode = 'plain'; return st.mode; }
      return locks && typeof locks.request === 'function' ? exclusive(bootInside) : bootInside();
    }
    async function bootInside() {
      const vault = readVault(raw), plainKey = raw.getItem('twrc.key');
      // 1. Ancien format en clair, appareil déverrouillé : migration vérifiée.
      if (plainKey) {
        try {
          const snap = plainSnapshot(raw); let salt, rawKey;
          if (vault && !vault.invalid) {   // migration interrompue : revérifier le coffre contre les données en clair
            salt = dec(vault.s); rawKey = await deriveRaw(plainKey, salt, crypto); await useKey(rawKey, salt);
            let ok = false; try { ok = same((await open(vault, st.key, crypto)).values, snap); } catch (e) { ok = false; }
            if (!ok) await writeWithRoom(snap, salt);
          } else {
            salt = crypto.getRandomValues(new Uint8Array(16)); rawKey = await deriveRaw(plainKey, salt, crypto); await useKey(rawKey, salt);
            await writeWithRoom(snap, salt);
          }
          const stored = (await open(JSON.parse(raw.getItem(VAULT)), st.key, crypto)).values;
          saveSession(rawKey, salt); dropPlain(raw, Object.keys(snap));
          if (!sameKeysGone(raw, snap)) throw new Error('Nettoyage incomplet.');
          enter(stored); st.migrated = true; return st.mode;
        } catch (e) {
          // Rien n'a été retiré tant que la vérification n'a pas réussi : l'app continue sur l'ancien stockage.
          st.mode = 'plain'; st.warn = 'Chiffrement local non terminé : tes données restent intactes sur cet appareil (non chiffrées). ' + (e.unsupported ? e.message : 'Libère de l’espace ou exporte une sauvegarde.'); return st.mode;
        }
      }
      // 2. Coffre v2 + clé de session de cet onglet.
      if (vault && !vault.invalid) {
        let ses = null; try { ses = JSON.parse(session.getItem(SESSION) || 'null'); } catch (e) { ses = null; }
        if (ses && ses.v === 2 && ses.s === vault.s && typeof ses.k === 'string' && (ses.l ?? null) === raw.getItem(LOCK_SIGNAL)) {
          try {
            await useKey(dec(ses.k), dec(vault.s)); const data = await open(vault, st.key, crypto); st.n = order(data).n; st.t = order(data).t;
            // copies lisibles égarées (ancienne version ouverte ailleurs, préremplissage) : absorbées si absentes, puis retirées
            const stray = plainSnapshot(raw), vals = { ...stray, ...data.values };
            const kept = Object.keys(stray).length ? await writeWithRoom(vals, st.salt) : vals;
            enter(kept);
            if (Object.keys(stray).length) dropPlain(raw, Object.keys(stray));
            return st.mode;
          } catch (e) { try { session.removeItem(SESSION); } catch (x) { /* rien */ } }
        }
        try { session.removeItem(SESSION); } catch (e) { /* rien */ }
        st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; return st.mode;
      }
      if (vault && vault.invalid) { st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; st.warn = 'Coffre local illisible : conservé tel quel, rien n’a été effacé.'; return st.mode; }
      // 3. Coffre v1 (« Verrouiller » d'avant) : verrouillé jusqu'au code, qui le convertit en coffre v2.
      if (raw.getItem(V1)) { st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; st.v1 = true; return st.mode; }
      st.mode = 'plain'; return st.mode;
    }
    function sameKeysGone(r, snap) { return Object.keys(snap).every(k => r.getItem(k) == null); }

    /* Déverrouillage avec le code : coffre v2, coffre v1 ou données en clair existantes → coffre v2 vérifié → session. */
    async function unlock(pass, extra) { return exclusive(async () => {
      while (st.mode === 'vault' && st.mem.dirty.size) await savePending();
      return unlockInside(pass, extra);
    }); }
    async function unlockInside(pass, extra) {
      const vault = readVault(raw);
      if (vault && vault.invalid) throw new Error('Coffre local illisible : conservé tel quel.');
      let vals, salt, rawKey, drop = [], dropV1 = false;
      if (vault) {
        salt = dec(vault.s); rawKey = await deriveRaw(pass, salt, crypto);
        const key = await importKey(rawKey, crypto), data = await open(vault, key, crypto);   // code faux → OperationError, clé de la session inchangée
        st.key = key; st.salt = salt;
        const stray = plainSnapshot(raw); vals = { ...stray, ...data.values }; drop = Object.keys(stray); st.n = order(data).n; st.t = order(data).t;
      } else {
        salt = crypto.getRandomValues(new Uint8Array(16)); rawKey = await deriveRaw(pass, salt, crypto);
        const stray = plainSnapshot(raw); vals = { ...stray }; drop = Object.keys(stray);
        if (raw.getItem(V1)) { const plan = await DeviceStorage.unlockPlan(raw, pass, crypto); Object.assign(vals, plan.writes); dropV1 = true; }
        await useKey(rawKey, salt);
      }
      Object.assign(vals, extra || {}, { 'twrc.key': pass });
      Object.keys(vals).forEach(k => { if (!secret(k)) { delete vals[k]; } });
      const kept = await writeWithRoom(vals, salt);
      saveSession(rawKey, salt);
      dropPlain(raw, drop); if (dropV1) put(raw, V1, null);
      enter(kept); return true;
    }
    async function lock() {
      if (st.mode === 'vault') { await flush(); if (st.error) throw new Error(st.error); }
      const finish = async () => {
        while (st.mode === 'vault' && st.mem.dirty.size) await savePending();
        // Un nonce rend le signal distinct, même si deux verrouillages ont lieu à la même milliseconde.
        try { raw.setItem(LOCK_SIGNAL, Date.now() + ':' + enc(crypto.getRandomValues(new Uint8Array(12)))); } catch (e) { /* signal facultatif */ }
        forget();
      };
      if (locks && typeof locks.request === 'function') await exclusive(finish); else await finish();
    }
    // Autre onglet : coffre réécrit → fusion (valeurs distantes + modifications locales non encore écrites) ; verrou → verrouiller ici.
    async function onStorage(e, notify) {
      if (e.key === LOCK_SIGNAL && e.newValue && (st.mode === 'vault' || st.mode === 'locked')) {
        // Un bon code a pu être saisi depuis ce signal : ne pas verrouiller la nouvelle session sur une notification périmée.
        if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) === st.lockSignal) return null;
        forget(); return 'locked';
      }
      if (e.key !== VAULT || st.mode !== 'vault' || !e.newValue) return null;
      const epoch = st.epoch, mem = st.mem, guard = () => guardSession(epoch, mem);
      try {
        return await exclusive(async () => {
          guard();
          // L'événement peut être périmé : seule la valeur ACTUELLE relue et authentifiée sur disque fait foi.
          const data = await latest(guard);
          if (!newer(order(data), { n: st.n, t: st.t })) {
            // Restaurer uniquement un véritable recul sur disque, avec le dernier état sauvegardé, jamais les valeurs locales non écrites.
            if (newer({ n: st.n, t: st.t }, order(data))) await writeVerified(st.saved, st.salt, guard);
            if (mem.dirty.size) persist(); return 'stale';
          }
          merge(data, notify); if (mem.dirty.size) persist(); return 'merged';
        });
      } catch (x) { return st.mode === 'locked' ? 'locked' : null; }
    }
    return {
      boot, unlock, lock, flush, onStorage,
      get mode() { return st.mode; }, get error() { return st.error; }, get warn() { return st.warn; }, get migrated() { return !!st.migrated; },
      get store() { return st.mem ? st.mem.store : null; }, locked: () => st.mode === 'locked'
    };
  }
  return { create, VAULT, SESSION, LOCK_SIGNAL, PUBLIC, secret, validVault, IT };
})();
