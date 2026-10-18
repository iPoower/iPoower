/* Coffre de session (sécurité V1) — aucune donnée personnelle ni code en clair dans le stockage durable du navigateur.
 *
 * Au repos (localStorage) : uniquement le coffre chiffré `twrc.vault.v2` et quelques préférences d'interface sans donnée
 * personnelle (PUBLIC). Pendant une session déverrouillée : les valeurs vivent en mémoire (MemStore) ; chaque écriture est
 * rechiffrée dans le coffre (AES-256-GCM, IV aléatoire neuf à chaque écriture, clé PBKDF2-SHA256 600 000 itérations dérivée
 * du code, sel aléatoire de 16 octets, format versionné, intégrité GCM vérifiée par relecture).
 * La clé de session est enveloppée par une clé non extractible IndexedDB : aucune clé brute dans sessionStorage.
 * Une session authentifiée expire après 7 jours. Option « appareil personnel » : clé non extractible IndexedDB,
 * jamais le code en clair. « Verrouiller » révoque immédiatement cette autorisation et prévient les autres onglets.
 * Limite : le coffre protège la lecture passive de son blob chiffré seul. Il ne protège pas d'un JavaScript malveillant
 * de même origine, d'une session ouverte ou d'une copie complète du profil navigateur permettant de réutiliser ses clés.
 * Non extractible est une restriction WebCrypto, pas une attestation de stockage matériel sécurisé.
 *
 * Migration (ancien format en clair, `twrc.key` présent) : instantané → chiffrement → relecture et déchiffrement →
 * comparaison valeur par valeur → seulement alors suppression des copies lisibles. Toute erreur avant la vérification
 * laisse les anciennes données intactes. Une interruption après l'écriture du coffre reprend au démarrage suivant :
 * tant que les données en clair existent, elles font foi et le coffre est revérifié contre elles avant nettoyage.
 */
const SessionVault = (() => {
  const VAULT = 'twrc.vault.v2', SESSION = 'twrc.session.v2', LOCK_SIGNAL = 'twrc.lock.signal', V1 = 'twrc.device.vault.v1', IT = 600000, WEEK_MS = 7 * 24 * 60 * 60 * 1000;
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
    try {
      const base64 = x => typeof x === 'string' && x.length > 0 && x.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(x);
      return !!v && v.app == null && [2, 3].includes(v.v) && v.kdf === 'PBKDF2-SHA256' && v.it === IT &&
        base64(v.s) && v.s.length === 24 && dec(v.s).length === 16 &&
        base64(v.i) && v.i.length === 16 && dec(v.i).length === 12 &&
        base64(v.c) && v.c.length <= 64 * 1024 * 1024 && dec(v.c).length >= 16;
    } catch (e) { return false; }
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
    const version = values[JournalArchive.KEY] == null ? 2 : 3;
    const iv = crypto.getRandomValues(new Uint8Array(12)), text = JSON.stringify({ v: version, n, t, values });
    const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text)));
    return { sealed: JSON.stringify({ v: version, kdf: 'PBKDF2-SHA256', it: IT, n, t, s: enc(salt), i: enc(iv), c: enc(c) }), text };
  }
  const order = v => ({ n: Number.isFinite(v && v.n) ? v.n : 0, t: Number.isFinite(v && v.t) ? v.t : 0 });
  const newer = (a, b) => a.n > b.n || (a.n === b.n && a.t > b.t);
  async function open(vault, key, crypto) {
    const text = td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dec(vault.i) }, key, dec(vault.c)));
    const data = JSON.parse(text);
    if (!data || data.v !== vault.v || (vault.n != null && (data.n !== vault.n || data.t !== vault.t)) || !data.values || typeof data.values !== 'object' || Array.isArray(data.values) ||
      !Object.entries(data.values).every(([k, v]) => secret(k) && typeof v === 'string')) throw new Error('Coffre local invalide.');
    if (data.v === 3) {
      if (!Object.prototype.hasOwnProperty.call(data.values, JournalArchive.KEY)) throw new Error('Archive exhaustive absente.');
      JournalArchive.read(data.values[JournalArchive.KEY]);
    }
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
  function mergeStray(saved, stray) {
    const values = { ...stray, ...saved };
    if (saved[JournalArchive.KEY] != null) values[JournalArchive.KEY] = JSON.stringify(JournalArchive.union(JournalArchive.capture(saved), JournalArchive.capture(stray)));
    return values;
  }
  // Les caches recalculables (météo, routes) peuvent être sacrifiés si le stockage est plein — jamais les données durables.
  const CACHE = k => k.startsWith('twrc.cache.') || k.startsWith('twrc.croute') || k.startsWith('twrc.road.');
  // seul un stockage PLEIN justifie de sacrifier les caches ; un refus (mode privé, permission) ne supprime rien
  const full = e => !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

  /* ---------- magasin en mémoire, présenté comme localStorage ---------- */
  const PENDING = 'twrc.restore.pending.v1';
  function memStore(raw, initial, persist, access = () => true) {
    // vol : journal d'import (anciennes valeurs) gardé en mémoire uniquement, jamais en clair sur le disque
    const m = new Map(Object.entries(initial || {})), dirty = new Set(), vol = new Map();
    const listOf = () => access(false) ? [...keysOf(raw).filter(k => !secret(k) && !META.has(k)), ...m.keys(), ...vol.keys()] : [];
    const api = {
      get length() { return listOf().length; },
      key: i => { const l = listOf(); return i >= 0 && i < l.length ? l[i] : null; },
      getItem: k => { if (!access(false)) return null; k = String(k); if (k === PENDING) return vol.has(k) ? vol.get(k) : null; return secret(k) ? (m.has(k) ? m.get(k) : null) : META.has(k) ? null : raw.getItem(k); },
      setItem: (k, v) => { access(true); k = String(k); v = String(v); if (k === PENDING) { vol.set(k, v); return; } if (META.has(k)) return; if (!secret(k)) { raw.setItem(k, v); return; } m.set(k, v); dirty.add(k); persist(); },
      removeItem: k => { access(true); k = String(k); if (k === PENDING) { vol.delete(k); return; } if (META.has(k)) return; if (!secret(k)) { raw.removeItem(k); return; } if (m.delete(k)) { dirty.add(k); persist(); } },
      clear: () => { access(true); [...m.keys()].forEach(k => dirty.add(k)); m.clear(); vol.clear(); persist(); }
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
  function create({ raw, session, crypto, target, remembered = null, sessionKeys = remembered && remembered.sessions, now = () => Date.now(), locks = target && target.navigator && target.navigator.locks }) {
    const st = { mode: 'plain', key: null, salt: null, n: 0, t: 0, saved: {}, mem: null, epoch: 0, lockSignal: raw.getItem(LOCK_SIGNAL), chain: Promise.resolve(), error: null, warn: null, timer: null, expiresAt: 0 };
    const values = () => Object.fromEntries(st.mem.map);
    // Barrière synchrone : aucun accès au magasin ne repose exclusivement sur le timer iOS.
    // Les écritures non confirmées restent en mémoire, même si la sauvegarde ou le verrouillage échoue.
    function expire() {
      // Une page Safari suspendue peut manquer l'événement storage. Le signal
      // durable est vérifié à chaque accès, sans dépendre d'un timer.
      if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) !== st.lockSignal) { forget(); return true; }
      if (st.mode === 'expired') return true;
      if (st.mode !== 'vault' || !st.expiresAt || now() < st.expiresAt) return false;
      st.epoch++;
      st.mode = 'expired';
      st.key = null; st.salt = null;
      clearSession();
      if (target && typeof target.dispatchEvent === 'function') {
        try { target.dispatchEvent(new Event('twrc-session-expired')); } catch (e) { /* le getter reste verrouillé */ }
      }
      return true;
    }
    function allowStore(write) {
      if (expire() || st.mode !== 'vault') {
        if (write) throw Object.assign(new Error('Session expirée : ressaisis le code pour récupérer les modifications en attente.'), { expired: true });
        return false;
      }
      return true;
    }
    function requireLocks() {
      if (!locks || typeof locks.request !== 'function') throw Object.assign(new Error('Ce navigateur ne permet pas une sauvegarde sûre entre plusieurs fenêtres. Mets-le à jour ou exporte une sauvegarde.'), { unsupported: true });
    }
    // Une file Promise par page ne suffit pas : le verrou couvre lecture, fusion, chiffrement ET vérification sur toute l'origine.
    async function exclusive(fn) { requireLocks(); return locks.request(VAULT, { mode: 'exclusive' }, fn); }
    function clearSession() {
      let previous = null;
      try { previous = JSON.parse(session.getItem(SESSION) || 'null'); } catch (e) { /* métadonnées corrompues */ }
      try { session.removeItem(SESSION); } catch (e) { /* stockage refusé */ }
      if (sessionKeys && previous) try { Promise.resolve(sessionKeys.clear(previous)).catch(() => {}); } catch (e) { /* signal durable conservé */ }
    }
    function forget() {
      st.epoch++; if (st.mem) { st.mem.map.clear(); st.mem.dirty.clear(); st.mem.vol.clear(); }
      clearSession();
      st.key = null; st.salt = null; st.saved = {}; st.expiresAt = 0; st.mode = 'locked'; st.error = null;
    }
    function guardSession(epoch, mem) {
      expire();
      if (st.mode === 'vault' && raw.getItem(LOCK_SIGNAL) !== st.lockSignal) forget();
      if (st.mode !== 'vault' || st.epoch !== epoch || st.mem !== mem) throw Object.assign(new Error('Session verrouillée pendant l’enregistrement.'), { cancelled: true });
    }
    function merge(data, notify) {
      const before = values(), next = { ...data.values };
      st.mem.dirty.forEach(k => { if (st.mem.map.has(k)) next[k] = st.mem.map.get(k); else delete next[k]; });
      const protectedNext = JournalArchive.protect(data.values, next);
      Object.assign(next, protectedNext);
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
      if (st.saved[JournalArchive.KEY] != null && vault.v !== 3) throw Object.assign(new Error('Ancien coffre réapparu : aucune écriture autorisée.'), { archiveConflict: true });
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
      const sent = new Map([...mem.dirty].map(k => [k, mem.map.has(k) ? mem.map.get(k) : null]));
      let snap = { ...base };
      sent.forEach((v, k) => { if (v == null) delete snap[k]; else snap[k] = v; });
      snap = JournalArchive.protect(base, snap);
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
    async function saveWithConflictRetry() {
      // Un ancien onglet peut encore écrire sans le verrou pendant WebCrypto.
      // Reprendre depuis le coffre authentifié, jamais depuis un instantané périmé.
      // Seuls les conflits vérifiés sont retentés ; quota, refus, corruption,
      // verrouillage et expiration conservent leur traitement strict.
      for (let attempt = 0; attempt < 3; attempt++) {
        try { return await exclusive(savePending); }
        catch (e) {
          if (!e.conflict || attempt === 2) throw e;
        }
      }
    }
    function flush() {
      if (st.mode !== 'vault') return st.chain;
      st.chain = st.chain.then(saveWithConflictRetry).catch(e => {
        if (e.cancelled || st.mode !== 'vault') return;
        st.error = (e.recoveryRequired ? e.message + ' ' : e.unsupported ? e.message + ' ' : 'Enregistrement chiffré non confirmé (stockage plein, refusé ou modifié) : ') + 'les modifications restent en mémoire ; exporte une sauvegarde.';
        if (target && target.dispatchEvent) try { target.dispatchEvent(new Event('twrc-vault-error')); } catch (x) { /* rien */ }
      });
      // Inclure aussi la microtâche automatique déclenchée par setItem : le
      // demandeur ne reçoit pas un ancien Promise alors qu'un retry reste actif.
      return (async () => { let tail; do { tail = st.chain; await tail; } while (tail !== st.chain || st.timer); })();
    }
    function nextOrder() { const d = order(readVault(raw)); return { n: Math.max(st.n, d.n) + 1, t: Math.max(Date.now(), st.t + 1, d.t + 1) }; }
    async function useKey(rawKey, salt) { st.key = await importKey(rawKey, crypto); st.salt = salt; }
    async function saveSession(rawKey, salt, expiresAt = now() + WEEK_MS, resumedDescriptor = null) {
      st.expiresAt = expiresAt;
      let previous = null, descriptor = null;
      try {
        previous = JSON.parse(session.getItem(SESSION) || 'null');
        // Retirer immédiatement l'ancien format qui exposait la clé dérivée.
        session.removeItem(SESSION);
        if (!sessionKeys) throw new Error('Stockage de session indisponible');
        // window.open peut copier sessionStorage : conserver le descripteur
        // déjà authentifié au boot évite d'invalider le rechargement de l'onglet parent.
        descriptor = resumedDescriptor || await sessionKeys.save(rawKey, { s: enc(salt), l: raw.getItem(LOCK_SIGNAL), a: expiresAt - WEEK_MS, e: expiresAt }, crypto);
        const text = JSON.stringify(descriptor);
        session.setItem(SESSION, text);
        if (session.getItem(SESSION) !== text) throw new Error('Session non confirmée');
      } catch (e) {
        try { session.removeItem(SESSION); } catch (x) { /* pas de repli en clé brute */ }
        if (sessionKeys && descriptor) await sessionKeys.clear(descriptor).catch(() => {});
        st.warn = 'Reprise automatique de cet onglet indisponible : le code sera redemandé au rechargement. Tes données restent conservées.';
      }
      // Une ancienne clé d'enveloppe v4 peut être partagée par un onglet créé
      // avec opener. La supprimer ici révoquerait cet onglet sans demande.
      // Elle est collectée à l'expiration ou par le verrouillage explicite.
    }
    async function writeVerified(vals, salt, guard, evictCaches = true) {
      requireLocks();
      const key = st.key, signal = raw.getItem(LOCK_SIGNAL), previous = raw.getItem(VAULT);
      const active = () => {
        if (st.key !== key || raw.getItem(LOCK_SIGNAL) !== signal) throw Object.assign(new Error('Session modifiée.'), { cancelled: true });
        if (guard) guard();
      };
      active();
      const prior = readVault(raw);
      if (prior && !prior.invalid && prior.v === 3 && vals[JournalArchive.KEY] == null)
        throw new Error('Archive exhaustive absente : écriture refusée.');
      const nx = nextOrder(), out = await seal(vals, key, salt, crypto, nx.n, nx.t); active();
      // Les anciennes versions ne prennent pas le verrou : ne pas écraser une écriture qu'elles ont faite pendant WebCrypto.
      if (raw.getItem(VAULT) !== previous) throw Object.assign(new Error('Coffre modifié pendant le chiffrement.'), { conflict: true });
      try { put(raw, VAULT, out.sealed); }
      catch (e) {
        if (!full(e) || !evictCaches) throw e;
        keysOf(raw).filter(k => isApp(k) && CACHE(k)).forEach(k => { try { raw.removeItem(k); } catch (x) { /* rien */ } });
        active(); put(raw, VAULT, out.sealed);
      }
      try {
        const back = await open(JSON.parse(raw.getItem(VAULT)), key, crypto); active();
        if (!same(back.values, vals) || raw.getItem(VAULT) !== out.sealed) throw new Error('Coffre relu différent.');
      } catch (e) {
        // Ne jamais annuler le commit d'un autre onglet. Une écriture dont nous
        // sommes encore propriétaires revient aux octets précédents.
        if (raw.getItem(VAULT) === out.sealed) {
          try { put(raw, VAULT, previous); }
          catch (rollback) { throw Object.assign(new Error('Vérification interrompue : conserve la copie de récupération.'), { recoveryPending: true }); }
        }
        throw e;
      }
      st.n = nx.n; st.t = nx.t; st.saved = { ...vals };
    }
    // stockage plein pendant la migration : sacrifier les caches recalculables puis réessayer une seule fois
    async function writeWithRoom(vals, salt, guard) {
      try { await writeVerified(vals, salt, guard); return vals; } catch (e) {
        if (!full(e)) throw e;
        const lean = Object.fromEntries(Object.entries(vals).filter(([k]) => !CACHE(k)));
        // setItem remplace atomiquement l'ancien coffre. Le supprimer n'économise rien dans la taille finale et expose à une perte au nouvel échec.
        keysOf(raw).filter(k => isApp(k) && CACHE(k)).forEach(k => { try { raw.removeItem(k); } catch (x) { /* rien */ } });
        await writeVerified(lean, salt, guard); return lean;
      }
    }
    function enter(vals) { st.epoch++; st.mem = memStore(raw, vals, persist, allowStore); st.saved = { ...vals }; st.lockSignal = raw.getItem(LOCK_SIGNAL); st.mode = 'vault'; st.error = null; }

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
          await saveSession(rawKey, salt); rawKey.fill(0); dropPlain(raw, Object.keys(snap));
          if (!sameKeysGone(raw, snap)) throw new Error('Nettoyage incomplet.');
          enter(stored); st.migrated = true; return st.mode;
        } catch (e) {
          // Rien n'a été retiré tant que la vérification n'a pas réussi : l'app continue sur l'ancien stockage.
          st.mode = 'plain'; st.warn = 'Chiffrement local non terminé : tes données restent intactes sur cet appareil (non chiffrées). ' + (e.unsupported ? e.message : 'Libère de l’espace ou exporte une sauvegarde.'); return st.mode;
        }
      }
      // 2. Coffre v2 : session d'onglet valide OU autorisation locale de 7 jours.
      if (vault && !vault.invalid) {
        let ses = null, corruptSession = false, storedSession = null;
        try {
          storedSession = session.getItem(SESSION);
          if (storedSession) ses = JSON.parse(storedSession);
        } catch (e) { corruptSession = true; }
        // Une session présente mais illisible n'autorise pas le repli silencieux sur l'appareil mémorisé.
        if (storedSession && (!ses || typeof ses !== 'object' || ![3, 4].includes(ses.v))) corruptSession = true;
        const currentTime = now(), signal = raw.getItem(LOCK_SIGNAL);
        const valid = ses && [3, 4].includes(ses.v) && ses.s === vault.s &&
          (ses.l ?? null) === signal && Number.isSafeInteger(ses.a) && Number.isSafeInteger(ses.e) &&
          ses.e - ses.a === WEEK_MS && currentTime >= ses.a && currentTime < ses.e;
        if (storedSession && !valid) corruptSession = true; // paramètres falsifiés, expirés ou périmés : refuser le repli
        let active = null;
        if (valid) {
          try {
            if (ses.v === 3) {
              // Compatibilité de récupération seulement : authentifier le
              // coffre puis réécrire en v4, sans renouveler l'expiration.
              const rawKey = dec(ses.k);
              if (rawKey.length === 32) active = { rawKey, expiresAt: ses.e }; else corruptSession = true;
            } else if (sessionKeys && !Object.hasOwn(ses, 'k')) active = await sessionKeys.resume(ses, crypto, currentTime);
            if (!active) corruptSession = true;
          } catch (e) { corruptSession = true; /* Base64 corrompu : exiger le code */ }
        }
        if (corruptSession) {
          clearSession();
          if (remembered) try { await remembered.clear(); } catch (e) { /* session déjà invalidée */ }
        }
        if (!active && !corruptSession && remembered) {
          try { active = await remembered.resume(vault.s, signal, crypto); } catch (e) { /* exiger le code */ }
        }
        if (active) {
          try {
            if (raw.getItem(LOCK_SIGNAL) !== signal || now() >= active.expiresAt) throw new Error('Autorisation expirée');
            await useKey(active.rawKey, dec(vault.s));
            const data = await open(vault, st.key, crypto);
            if (raw.getItem(LOCK_SIGNAL) !== signal || now() >= active.expiresAt) throw new Error('Autorisation révoquée');
            st.n = order(data).n; st.t = order(data).t;
            const stray = plainSnapshot(raw), vals = mergeStray(data.values, stray);
            const kept = Object.keys(stray).length ? await writeWithRoom(vals, st.salt) : vals;
            await saveSession(active.rawKey, st.salt, active.expiresAt, valid && ses.v === 4 ? ses : null); active.rawKey.fill(0);
            enter(kept);
            if (Object.keys(stray).length) dropPlain(raw, Object.keys(stray));
            return st.mode;
          } catch (e) {
            active.rawKey.fill(0); clearSession();
            // Coffre remplacé ou autorisation non valide : renouveler par code.
            if (remembered) try { await remembered.clear(); } catch (x) { /* rien */ }
            st.key = null; st.salt = null; st.expiresAt = 0;
          }
        }
        clearSession();
        st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; return st.mode;
      }
      if (vault && vault.invalid) { st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; st.warn = 'Coffre local illisible : conservé tel quel, rien n’a été effacé.'; return st.mode; }
      // 3. Coffre v1 (« Verrouiller » d'avant) : verrouillé jusqu'au code, qui le convertit en coffre v2.
      if (raw.getItem(V1)) { st.mem = memStore(raw, {}, () => {}); st.mode = 'locked'; st.v1 = true; return st.mode; }
      st.mode = 'plain'; return st.mode;
    }
    function sameKeysGone(r, snap) { return Object.keys(snap).every(k => r.getItem(k) == null); }

    /* Déverrouillage avec le code : coffre v2, coffre v1 ou données en clair existantes → coffre v2 vérifié → session. */
    async function unlock(pass, extra, keepWeek = false) { return exclusive(async () => {
      expire();
      while (st.mode === 'vault' && st.mem.dirty.size) await savePending();
      return unlockInside(pass, extra, keepWeek);
    }); }
    async function unlockInside(pass, extra, keepWeek, recoverySource = null) {
      const vault = readVault(raw);
      if (vault && vault.invalid) throw new Error('Coffre local illisible : conservé tel quel.');
      let vals, salt, rawKey, drop = [], dropV1 = false;
      if (vault) {
        salt = dec(vault.s); rawKey = await deriveRaw(pass, salt, crypto);
        const key = await importKey(rawKey, crypto), data = await open(vault, key, crypto);   // code faux → OperationError, clé de la session inchangée
        st.key = key; st.salt = salt;
        const stray = plainSnapshot(raw); vals = mergeStray(data.values, stray); drop = Object.keys(stray); st.n = order(data).n; st.t = order(data).t;
        // Suite à une expiration, seules les modifications non confirmées sont reprises.
        // Aucune perte sur mauvais code / quota plein : l'ancien MemStore reste intact jusqu'au coffre vérifié.
        if (st.mode === 'expired' && st.mem) st.mem.dirty.forEach(k => {
          if (st.mem.map.has(k)) vals[k] = st.mem.map.get(k); else delete vals[k];
        });
      } else {
        salt = crypto.getRandomValues(new Uint8Array(16)); rawKey = await deriveRaw(pass, salt, crypto);
        const stray = plainSnapshot(raw); vals = { ...stray }; drop = Object.keys(stray);
        if (raw.getItem(V1)) { const plan = await DeviceStorage.unlockPlan(raw, pass, crypto); Object.assign(vals, plan.writes); dropV1 = true; }
        await useKey(rawKey, salt);
      }
      if (vault && vault.v === 3) vals = JournalArchive.protect((await open(vault, st.key, crypto)).values, vals);
      Object.assign(vals, extra || {}, { 'twrc.key': pass });
      Object.keys(vals).forEach(k => { if (!secret(k)) { delete vals[k]; } });
      const guard = recoverySource ? () => { if (!same(plainSnapshot(raw), recoverySource)) throw new Error('Source modifiée depuis la copie : activation refusée.'); } : null;
      if (guard) guard();
      const kept = await writeWithRoom(vals, salt, guard);
      await saveSession(rawKey, salt);
      if (guard) guard();
      dropPlain(raw, drop); if (dropV1) put(raw, V1, null);
      enter(kept);
      // Autorisation persistante facultative, non exportée dans les sauvegardes.
      if (remembered) {
        try {
          if (keepWeek) await remembered.save(rawKey, salt, raw.getItem(LOCK_SIGNAL), crypto);
          else await remembered.clear();
        } catch (e) { st.warn = 'Ouverture automatique indisponible sur cet appareil : le code sera redemandé à la prochaine ouverture.'; }
      }
      rawKey.fill(0);
      return true;
    }
    async function lock() {
      expire();
      if (st.mode === 'expired' && st.mem && st.mem.dirty.size) {
        throw Object.assign(new Error('Modifications non enregistrées : ressaisis le code avant de quitter cette page.'), { recovery: true });
      }
      if (st.mode === 'vault') { await flush(); if (st.error) throw new Error(st.error); }
      const finish = async () => {
        while (st.mode === 'vault' && st.mem.dirty.size) await savePending();
        // Un nonce rend le signal distinct, même si deux verrouillages ont lieu à la même milliseconde.
        put(raw, LOCK_SIGNAL, Date.now() + ':' + enc(crypto.getRandomValues(new Uint8Array(12))));
        if (sessionKeys && sessionKeys.revokeAll) try { await sessionKeys.revokeAll(); } catch (e) { /* le signal révoque les sessions même si IDB est refusé */ }
        if (remembered) try { await remembered.clear(); } catch (e) { /* signal durable révoque aussi la clé conservée */ }
        forget();
      };
      if (locks && typeof locks.request === 'function') await exclusive(finish); else await finish();
    }
    // Autre onglet : coffre réécrit → fusion (valeurs distantes + modifications locales non encore écrites) ; verrou → verrouiller ici.
    async function onStorage(e, notify) {
      expire();
      if (e.key === LOCK_SIGNAL && e.newValue && (st.mode === 'vault' || st.mode === 'locked' || st.mode === 'expired')) {
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
      } catch (x) {
        if (x.archiveConflict) { st.error = x.message; if (target && target.dispatchEvent) target.dispatchEvent(new Event('twrc-vault-error')); }
        return st.mode === 'locked' ? 'locked' : null;
      }
    }
    // Une copie externe est vérifiée par réouverture du fichier sélectionné.
    // La preuve est liée aux octets du coffre courant, pas à une case cochée.
    async function plainRecovery(pass) { return exclusive(async () => {
      if (st.mode !== 'plain' || raw.getItem(VAULT) || raw.getItem(V1) || raw.getItem(PENDING)) throw new Error('Source de récupération indisponible.');
      if (typeof pass !== 'string' || pass.length < 8) throw new Error('Entre un code d’au moins 8 caractères pour cette copie.');
      const snapshot = plainSnapshot(raw), salt = crypto.getRandomValues(new Uint8Array(16));
      const rawKey = await deriveRaw(pass, salt, crypto);
      try {
        const key = await importKey(rawKey, crypto), out = await seal(snapshot, key, salt, crypto, 1, now());
        const checked = await open(JSON.parse(out.sealed), key, crypto);
        if (!same(checked.values, snapshot) || !same(plainSnapshot(raw), snapshot)) throw new Error('Source modifiée : recommence la copie.');
        return out.sealed;
      } finally { rawKey.fill(0); }
    }); }
    async function recoverySnapshot() { return exclusive(async () => {
      expire(); if (st.mode !== 'vault') throw new Error('Déverrouille cet appareil.');
      const sealed = raw.getItem(VAULT), vault = JSON.parse(sealed);
      if (sealed.length > 68 * 1024 * 1024) throw new Error('Copie trop volumineuse : aucun fichier incomplet produit.');
      await open(vault, st.key, crypto);
      if (raw.getItem(VAULT) !== sealed) throw new Error('Coffre modifié : recommence la copie.');
      return sealed;
    }); }
    async function activateJournal(fileText, pass) { return exclusive(async () => {
      if (st.mode === 'plain') {
        if (raw.getItem(VAULT) || raw.getItem(V1) || raw.getItem(PENDING)) throw new Error('Source de récupération indisponible.');
        const snapshot = await readRecovery(fileText, pass, crypto);
        if (!same(plainSnapshot(raw), snapshot)) throw new Error('La copie ne correspond plus au profil courant.');
        return unlockInside(pass, { [JournalArchive.KEY]: JSON.stringify(JournalArchive.capture(snapshot)) }, false, snapshot);
      }
      expire(); if (st.mode !== 'vault') throw new Error('Déverrouille cet appareil.');
      const epoch = st.epoch, mem = st.mem, guard = () => guardSession(epoch, mem);
      const sealed = raw.getItem(VAULT);
      if (fileText !== sealed) throw new Error('La copie ne correspond plus au coffre courant. Exporte une nouvelle copie.');
      const data = await latest(guard);
      const sent = new Map([...mem.dirty].map(k => [k, mem.map.has(k) ? mem.map.get(k) : null]));
      const pending = { ...data.values };
      sent.forEach((v, k) => { if (v == null) delete pending[k]; else pending[k] = v; });
      const next = JournalArchive.protect(data.values, pending, true);
      await writeVerified(next, st.salt, guard, false); guard();
      sent.forEach((v, k) => { if ((mem.map.has(k) ? mem.map.get(k) : null) === v) mem.dirty.delete(k); });
      merge({ n: st.n, t: st.t, values: next }); st.error = null;
      return true;
    }); }
    // Import d'un lien historique : vérifier sous le MÊME verrou que toutes
    // les écritures, puis publier une unique enveloppe chiffrée et relue.
    // Ni configuration existante ni autre donnée durable ne sont remplacées.
    async function importConfig(cfg, current = () => true, baseline = null) { return exclusive(async () => {
      expire();
      if (st.mode !== 'vault') return { state: 'locked' };
      const epoch = st.epoch, mem = st.mem, guard = () => {
        guardSession(epoch, mem);
        if (!current()) throw Object.assign(new Error('Import remplacé.'), { cancelled: true });
      };
      guard();
      while (mem.dirty.size) { await savePending(); guard(); }
      const data = await latest(guard), next = { ...data.values };
      const key = ConfigImport.IDENTIFIER, settingsKey = ConfigImport.SETTINGS;
      const legacy = next[key];
      if (legacy != null && !ConfigImport.ID.test(legacy)) {
        const id = await ConfigImport.legacyIdentifier(legacy, crypto); guard();
        if (id) next[key] = id; else delete next[key];
      }
      let state = 'none';
      if (cfg !== null) {
        if (!ConfigImport.validate(cfg)) return { state: 'invalid' };
        const id = await ConfigImport.identifier(cfg, crypto); guard();
        if (next[settingsKey] != null && next[key] === id) state = 'duplicate';
        else {
          const settings = ConfigImport.initialSettings(cfg, next[settingsKey] ?? null, baseline);
          if (!settings) state = 'configured';
          else { next[settingsKey] = JSON.stringify(settings); next[key] = id; state = 'applied'; }
        }
      }
      if (!same(next, data.values)) {
        guard(); await writeVerified(next, st.salt, guard, false); guard();
        // Commit mémoire seulement après la vérification durable. Pas
        // d'événement de contenu avant l'initialisation/rechargement de l'app.
        merge({ n: st.n, t: st.t, values: next }, () => {});
      } else merge(data, () => {}); // lecture concurrente authentifiée : ne pas rendre une ancienne copie
      return { state };
    }); }
    return {
      boot, unlock, lock, flush, onStorage, importConfig, recoverySnapshot, plainRecovery, activateJournal,
      expired: () => expire(),
      get expiresAt() { return st.expiresAt; },
      get pendingRecovery() { return st.mode === 'expired' && !!st.mem && st.mem.dirty.size > 0; },
      // Même un profil sans historique doit activer explicitement l'archive
      // avant son premier débrief : aucun passage v3 au premier enregistrement.
      get journalNeedsRecovery() { return st.mode === 'vault' && st.saved[JournalArchive.KEY] == null; },
      get pendingWrites() { return !!st.mem && st.mem.dirty.size > 0; },
      get mode() { return st.mode; }, get error() { return st.error; }, get warn() { return st.warn; }, get migrated() { return !!st.migrated; },
      get store() { return st.mem ? st.mem.store : null; }, locked: () => expire() || st.mode === 'locked'
    };
  }
  async function readRecovery(text, pass, crypto) {
    if (typeof text !== 'string' || text.length > 68 * 1024 * 1024) throw new Error('Copie trop volumineuse.');
    const vault = JSON.parse(text);
    if (!validVault(vault)) throw new Error('Copie de récupération inconnue.');
    const rawKey = await deriveRaw(pass, dec(vault.s), crypto);
    try { return (await open(vault, await importKey(rawKey, crypto), crypto)).values; }
    finally { rawKey.fill(0); }
  }
  return { create, readRecovery, VAULT, SESSION, LOCK_SIGNAL, PUBLIC, secret, validVault, IT };
})();
