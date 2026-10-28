/* Raccord propriétaire : données en mémoire dans RC, paquets opaques dans Drive.
 * Un verrou par origine, une file durable, aucun effacement ni écrasement distant.
 * Le réseau n'est jamais dans le chemin d'enregistrement local de l'application.
 */
const DriveSync = (() => {
  const LOCK = 'twrc.drive.sync.v1', DB = 'twrc.drive.sync.v1';
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const id = crypt => [...crypt.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  function projection(values) {
    const out = Object.fromEntries(Object.entries(values).filter(([k]) => !SyncMerge.device(k)));
    if (!out[JournalArchive.KEY] || !out[SyncMerge.SETTINGS]) return fail('recovery');
    JournalArchive.read(out[JournalArchive.KEY]);
    if (out[JournalArchive.CONTEXT]) {
      const c = JSON.parse(out[JournalArchive.CONTEXT]), d = c.debrief || {};
      out[JournalArchive.CONTEXT] = JSON.stringify({ v: 1, debrief: { active: null, entries: d.entries || [], archive: d.archive || JournalArchive.capture(values) }, done: c.done || {} });
    }
    if (out[JournalArchive.MIRROR]) {
      const d = JSON.parse(out[JournalArchive.MIRROR]);
      out[JournalArchive.MIRROR] = JSON.stringify({ active: null, entries: d.entries || [], archive: d.archive || JournalArchive.capture(values) });
    }
    return out;
  }
  function validateBusiness(data) {
    SyncRevisions.content(data, SyncMerge.device);
    const v = data.values, s = JSON.parse(v[SyncMerge.SETTINGS]);
    if (!s || !Array.isArray(s.cars) || new Set(s.cars.map(c => c.id)).size !== s.cars.length) return false;
    JournalArchive.read(v[JournalArchive.KEY]);
    // Le contenu est JSON strict au niveau extérieur ET dans chaque valeur.
    for (const key of [SyncMerge.SETTINGS, SyncMerge.STAMPS, JournalArchive.KEY, JournalArchive.CONTEXT, JournalArchive.MIRROR, 'twrc.reports.v1', 'twrc.shadow.v1', 'twrc.tripdone', 'twrc.tripcancel'])
      if (v[key] !== undefined) ControlVaultPacket.strictJson(new TextEncoder().encode(v[key]), 64);
    return JSON.stringify(projection(v)) === JSON.stringify(v);
  }
  async function premergeRecovery(store = DriveStore.create(DB), crypt = globalThis.crypto) {
    const state = await store.read();
    if (!state || state.recovery == null) return null;
    if (state.v !== 1 || !/^[0-9a-f]{64}$/.test(state.recovery)) return fail('stockage');
    const bytes = await store.readRecovery(state.recovery);
    if (!(bytes instanceof Uint8Array)) return fail('stockage');
    const hash = [...new Uint8Array(await crypt.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (hash !== state.recovery) return fail('integrity');
    return bytes.slice();
  }
  function create({ vault, provider, store = DriveStore.create(DB), keys = SyncKey.storage(), locks = navigator.locks,
    crypto: crypt = globalThis.crypto, now = () => Date.now(), version, onChange = () => {}, onApplied = () => {} }) {
    const codec = ControlVaultPacket.create({ validateBusiness, crypto: crypt });
    let conflictDetails = []; const resolutions = new Map();
    let selected = null, handle = null, signal = null, running = false, message = 'local', conflicts = [], lastRecovery = null, stopped = false, localVersion = 0, observedVersion = 0, blocked = false, finishing = Promise.resolve(), finish = () => {};
    const digest = async bytes => [...new Uint8Array(await crypt.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
    const fingerprint = v => digest(new TextEncoder().encode(JSON.stringify(canonical(v))));
    function state() {
      if (message === 'synchronisé' && (localVersion !== observedVersion || vault.pendingWrites)) message = 'en attente';
      return { message, conflicts: [...conflicts], conflictDetails: conflictDetails.map(d => ({ ...d })), running, lastRecovery,
        state: blocked ? 'SYNC_BLOCKED' : running ? 'VERIFYING' : conflicts.length ? 'CONFLICT' : message === 'synchronisé' ? 'SYNCED' : selected ? 'PENDING' : 'LOCAL' };
    }
    const notify = () => onChange(state());
    function changed(event) {
      if (!selected || stopped || event.key && SyncMerge.device(event.key)) return;
      localVersion++; if (!blocked) message = 'en attente'; notify();
    }
    function listen() { if (globalThis.addEventListener) globalThis.addEventListener('twrc-vault-change', changed); }
    listen();
    function current() { return !stopped && vault.mode === 'vault' && !vault.expired() && vault.expiresAt > now(); }
    function guard() { if (!current()) { handle = null; return fail('code'); } }
    async function read() {
      const state = await store.read();
      if (!state) return { v: 1, device: id(crypt), seq: 0, base: [], binding: null, profile: null, profileJob: null,
        outbox: SyncOutbox.initial(), bytes: null, observed: null, signal: null, recovery: null };
      if (state.v !== 1 || !/^[0-9a-f]{32}$/.test(state.device) || !Array.isArray(state.base) || !Number.isSafeInteger(state.seq)) return fail('stockage');
      SyncOutbox.status(state.outbox);
      if (state.recoveryInit && state.recoveryInit.phase !== 'verified') return fail('recovery');
      lastRecovery = state.recovery;
      return state;
    }
    async function save(s) { await store.write(s); }
    async function authenticate(s, snap, catalog) {
      const profiles = await provider.profiles(selected.folder); guard();
      if (profiles.length > 1) return fail('conflict');
      if (!profiles.length && catalog.length && !s.profileJob) return fail('code');
      if (!profiles.length) {
        if (!s.profileJob) {
          const pass = snap.values['twrc.key']; if (!pass) return fail('code');
          const created = await SyncKey.create(pass, crypt); guard();
          s.profileJob = { bytes: new TextEncoder().encode(JSON.stringify(created.descriptor)), fileId: null }; handle = created.handle;
          await save(s);
        }
        if (!s.profileJob.fileId) { s.profileJob.fileId = await provider.reserveId(); guard(); await save(s); }
        const back = await provider.uploadProfile(s.profileJob.fileId, selected.folder, s.profileJob.bytes); guard();
        s.profile = back.sha256; s.profileJob = null; await save(s);
        // Relecture du catalogue : un démarrage concurrent ne choisit jamais
        // arbitrairement un des deux sels de compte.
        const all = await provider.profiles(selected.folder); guard();
        if (all.length !== 1 || all[0].sha256 !== s.profile) return fail('conflict');
        profiles.push(all[0]);
      }
      const profile = profiles[0], descriptor = SyncKey.parse(profile.bytes);
      if (s.profile && s.profile !== profile.sha256) { handle = null; return fail('code'); }
      if (signal !== snap.signal) handle = null;
      signal = snap.signal;
      if (!handle && s.signal === snap.signal && snap.binding) {
        try { handle = await keys.resume(descriptor, snap.binding, crypt, now()); } catch { /* pas de clé brute de repli */ }
      }
      if (!handle) {
        const pass = snap.values['twrc.key']; if (!pass) return fail('code');
        handle = await SyncKey.derive(descriptor, pass, crypt); guard();
      }
      if (snap.binding) {
        try { await keys.remember(handle, snap.binding, snap.expiresAt, now()); } catch { /* clé en mémoire seulement, session locale déjà autorisée */ }
      }
      s.profile = profile.sha256; s.signal = snap.signal; await save(s);
    }
    async function observeCurrent(s) {
      const version = localVersion;
      const latest = await vault.syncSnapshot(); guard();
      const hash = await fingerprint(projection(latest.values)); guard();
      if (s.observed !== hash) {
        s.outbox = SyncOutbox.noteChange(s.outbox, now()); s.observed = hash;
      }
      // Une écriture locale pas encore confirmée ne peut produire un statut vert.
      if (vault.pendingWrites) s.outbox = SyncOutbox.noteChange(s.outbox, now());
      observedVersion = version;
    }
    async function send(s) {
      const job = s.outbox.job;
      if (!job || !(s.bytes instanceof Uint8Array) || await digest(s.bytes) !== job.sha) return fail('stockage');
      guard();
      if (job.phase === 'sealed') { s.outbox = SyncOutbox.reserved(s.outbox, await provider.reserveId()); guard(); await save(s); }
      const packet = await DriveTransport.readRacePacket(s.bytes, job.sha); guard();
      const opened = await codec.openWith(s.bytes, handle, version(), job.sha); guard();
      try { SyncRevisions.confirm(job.rev, opened, job.sha, SyncMerge.device); }
      catch { return fail('integrity'); }
      guard();
      const back = await provider.uploadRevision(s.outbox.job.fileId, selected.folder, packet, job.rev); guard();
      s.outbox = SyncOutbox.sent(s.outbox); await save(s);
      s.outbox = SyncOutbox.verified(s.outbox, back.proof.fileId, back.proof.fileSha256, now());
      s.base = [job.rev.id]; s.seq = Math.max(s.seq, job.rev.seq); s.bytes = null;
      await observeCurrent(s); await save(s);
      message = SyncOutbox.status(s.outbox).label;
    }
    async function runInside(force) {
      guard(); let s = await read();
      if (!selected) { message = 'reconnexion'; return; }
      if (s.binding && s.binding !== selected.binding) return fail('binding');
      s.binding = selected.binding;
      let snap = await vault.syncSnapshot(); guard();
      const local = projection(snap.values), hash = await fingerprint(local); guard();
      if (s.observed !== hash) { s.outbox = SyncOutbox.noteChange(s.outbox, now()); s.observed = hash; await save(s); }
      if (s.outbox.blocked && !force) { blocked = true; message = SyncOutbox.status(s.outbox).label; return; }
      if (force) s.outbox = SyncOutbox.unblock(s.outbox, now());
      if (navigator.onLine === false) { message = 'en attente · hors ligne'; return; }
      const catalog = await provider.list(selected.folder); guard();
      await authenticate(s, snap, catalog); guard();
      if (s.outbox.job) { if (now() < s.outbox.retryAt && !force) return; message = 'envoi'; notify(); await send(s); return; }
      const confirmed = [], opened = new Map();
      for (const ref of catalog) {
        if (!ref.revision) continue; // sauvegardes manuelles conservées, hors graphe A2
        const back = await provider.download(ref, undefined, selected.folder); guard();
        const data = await codec.openWith(back.packet.copyBytes(), handle, version(), ref.fileSha256); guard();
        confirmed.push(SyncRevisions.confirm(ref.revision, data, ref.fileSha256, SyncMerge.device));
        opened.set(ref.revision.id, { ref, data, proof: back.proof });
      }
      // Relire après les requêtes : aucun instantané pris avant le réseau ne
      // peut écraser une saisie locale arrivée pendant le téléchargement.
      snap = await vault.syncSnapshot(); guard();
      const planned = SyncRevisions.plan(confirmed, { device: s.device, seq: s.seq, base: s.base, dirty: s.outbox.dirtySince !== null });
      if (planned.action === 'blocked' || planned.warnings.some(w => w.code === 'MISSING_PARENT' || w.code === 'BASE_UNAVAILABLE')) return fail('conflict');
      // Fusion à trois voies : base = ancêtre commun authentifié de cette lignée et de la tête
      // distante. Une tête en conflit n'est pas intégrée, sans bloquer les autres têtes ni l'envoi
      // des saisies locales ; ses deux versions restent consultables jusqu'au choix explicite.
      const optionsFor = (rid, clean) => {
        const lca = SyncRevisions.ancestor(confirmed, [...s.base, ...clean], [rid]);
        return { base: lca && opened.has(lca) ? opened.get(lca).data.values : undefined, resolutions: resolutions.get(rid) };
      };
      let desired = { ...snap.values }; const merged = [], clean = [], details = [];
      for (const rid of planned.integrate) {
        const remote = opened.get(rid).data, result = SyncMerge.values(desired, remote.values, optionsFor(rid, clean));
        const open = SyncRevisions.settle(planned, [{ id: rid, report: result.report }], false).conflicts;
        merged.push({ id: rid, report: result.report });
        if (!open.length) { desired = result.values; clean.push(rid); continue; }
        details.push(...SyncMerge.conflictValues(desired, remote.values, open[0].paths).map(d => ({ ...d, id: rid, device: remote.rev.device, at: remote.at })));
      }
      const settled = SyncRevisions.settle(planned, merged, await fingerprint(projection(desired)) !== await fingerprint(projection(snap.values)));
      conflicts = settled.conflicts; conflictDetails = details;
      if (settled.integrated.length) {
        // Recalculer la fusion SOUS le verrou du coffre. Conflit nouveau ⇒ rien
        // n'est écrit et aucune tête distante n'est déclarée intégrée.
        await vault.syncApply(values => {
          let next = values; const done = [];
          for (const rid of settled.integrated) {
            const result = SyncMerge.values(next, opened.get(rid).data.values, optionsFor(rid, done));
            if (SyncRevisions.settle(planned, [{ id: rid, report: result.report }], false).conflicts.length) return fail('conflict');
            next = result.values; done.push(rid);
          }
          return next;
        }, async bytes => { s.recovery = await store.recovery(bytes, crypt); lastRecovery = s.recovery; }, current);
        for (const rid of settled.integrated) resolutions.delete(rid);
        guard(); s.base = settled.parents; s.seq = Math.max(s.seq, ...confirmed.filter(c => c.device === s.device).map(c => c.seq));
        await save(s); onApplied();
        snap = await vault.syncSnapshot(); guard();
        const after = projection(snap.values), remote = s.base.length === 1 && opened.get(s.base[0]);
        // Une tête identique se rejoint sans créer une révision vide.
        if (remote && await fingerprint(after) === await fingerprint(remote.data.values)) {
          s.outbox = SyncOutbox.initial(); s.outbox.verified = { id: remote.ref.revision.id, sha: remote.ref.fileSha256, fileId: remote.ref.fileId, at: now() };
        } else s.outbox = SyncOutbox.noteChange(s.outbox, now());
        s.observed = await fingerprint(after); await save(s);
      }
      if (force && s.outbox.dirtySince !== null) s.outbox.lastChange = Math.max(0, now() - SyncOutbox.QUIET_MS);
      if (SyncOutbox.next(s.outbox, now()) === 'seal') {
        const rev = SyncRevisions.next({ device: s.device, seq: Math.max(s.seq, planned.nextSeq - 1), parents: s.base }, crypt);
        const snapshotAt = now(), data = SyncRevisions.snapshot(projection(snap.values), rev, SyncMerge.device, new Date(snapshotAt).toISOString());
        s.observed = await fingerprint(data.values); guard();
        s.bytes = await codec.sealWith(data, handle, version(), data.at); guard();
        s.outbox = SyncOutbox.sealed(s.outbox, { rev, sha: await digest(s.bytes), size: s.bytes.length }, snapshotAt); await save(s);
        message = 'envoi'; notify(); await send(s);
      }
      await observeCurrent(s); await save(s);
      message = conflicts.length ? 'conflit : choix requis, saisies locales envoyées' : SyncOutbox.status(s.outbox).label;
    }
    // Choix explicite pour un chemin en conflit ; appliqué à la prochaine vérification.
    function resolve(rid, path, choice) {
      const d = conflictDetails.find(x => x.id === rid && x.path === path);
      if (!d || !d.resolvable || !['local', 'remote'].includes(choice)) return fail('confirmation');
      resolutions.set(rid, { ...(resolutions.get(rid) || {}), [path]: choice });
    }
    async function run(force = false) {
      if (running || stopped) return;
      if (!locks || typeof locks.request !== 'function') { blocked = true; message = 'navigateur à mettre à jour'; notify(); return; }
      running = true; finishing = new Promise(resolve => { finish = resolve; }); blocked = false; message = 'vérification'; notify();
      try { await locks.request(LOCK, { ifAvailable: true }, lock => lock ? runInside(force) : undefined); }
      catch (e) {
        blocked = true;
        const code = e.code || (e.conflict ? 'network' : 'stockage');
        message = ({ auth: 'reconnexion', code: 'code requis', CODE_REQUIRED: 'code requis', AUTHENTICATION_FAILED: 'code requis', binding: 'autre compte ou dossier : envoi arrêté', conflict: 'conflit : versions conservées', quota: 'espace Drive insuffisant', integrity: 'intégrité à vérifier : envoi bloqué, identifiant conservé', recovery: 'copie de récupération à vérifier', stockage: 'stockage local non confirmé', PRODUCER_TOO_NEW: 'version plus récente : mets Race Control à jour', UNKNOWN_READER_VERSION: 'version chargée non confirmée : vérifie la mise à jour', FILE_TOO_LARGE: 'copie trop volumineuse : envoi arrêté sans troncature', CONSERVATION_BLOCKED: 'contenu à vérifier : copies conservées' })[code] || 'en attente · transfert non confirmé';
        try {
          await locks.request(LOCK, async () => {
            const s = await read(), kind = ['auth', 'quota', 'conflict'].includes(code) ? code : /code|CODE_REQUIRED|AUTHENTICATION/.test(code) ? 'code' :
              code === 'integrity' && s.outbox.job ? 'integrity' : ['binding', 'PRODUCER_TOO_NEW', 'UNKNOWN_READER_VERSION', 'FILE_TOO_LARGE', 'CONSERVATION_BLOCKED', 'integrity'].includes(code) ? 'conflict' : 'network';
            s.outbox = SyncOutbox.failed(s.outbox, kind, now()); await save(s);
          });
        } catch { /* ne jamais afficher de succès après un échec IDB */ }
      } finally { running = false; finish(); notify(); }
    }
    return Object.freeze({ run, resolve, select: value => { if (running) return fail('busy'); selected = { ...value }; handle = null; stopped = false; listen(); },
      pause: () => { stopped = true; handle = null; selected = null; blocked = false; message = 'local'; notify(); return finishing; },
      stop: () => { if (globalThis.removeEventListener) globalThis.removeEventListener('twrc-vault-change', changed); blocked = false; stopped = true; handle = null; selected = null; provider.disconnect(); message = 'local'; notify(); },
      recovery: () => premergeRecovery(store, crypt),
      get status() { return state(); } });
  }
  return Object.freeze({ create, projection, validateBusiness, premergeRecovery });
})();
