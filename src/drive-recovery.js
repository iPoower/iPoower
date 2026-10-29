/* Récupération A2 sur une installation vierge. RC seul déchiffre.
 * Réutilise les codecs A1/A2, le coffre atomique et DriveStore existants.
 * GET uniquement sur Drive : aucun upload, suppression, fusion ou choix par date.
 */
const DriveRecovery = (() => {
  const LOCK = 'twrc.drive.sync.v1', LIMITS = Object.freeze({ versions: 128, bytes: 128 * 1024 * 1024 });
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  function create({ vault, provider, store = DriveStore.create(LOCK), locks = navigator.locks,
    crypto: crypt = globalThis.crypto, now = () => Date.now(), version, current = () => true }) {
    const random = () => [...crypt.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
    const documentId = random(), codec = ControlVaultPacket.create({ validateBusiness: DriveSync.validateBusiness, crypto: crypt });
    const hash = async b => [...new Uint8Array(await crypt.subtle.digest('SHA-256', b))].map(v => v.toString(16).padStart(2, '0')).join('');
    const fingerprint = v => hash(new TextEncoder().encode(JSON.stringify(canonical(v))));
    let selected = null, draft = null, busy = false, epoch = 0;
    async function locked(work) {
      if (busy) return fail('busy');
      if (!locks || typeof locks.request !== 'function') return fail('unsupported');
      busy = true;
      try { return await locks.request(LOCK, work); } finally { busy = false; }
    }
    function lease() {
      const target = selected, generation = epoch;
      const guard = () => { if (!target || target !== selected || generation !== epoch || !current()) return fail('auth'); };
      guard(); return { target, guard };
    }
    function pending(s) {
      const r = s && s.recoveryInit;
      if (!r || r.v !== 1 || !['pending', 'installed', 'verified'].includes(r.phase) ||
        !/^[0-9a-f]{32}$/.test(r.document) || !/^[0-9a-f]{64}$/.test(r.source) ||
        !/^[0-9a-f]{64}$/.test(r.values) || !/^[0-9a-f]{64}$/.test(r.catalog) ||
        !/^[0-9a-f]{64}$/.test(r.profile) || !/^[0-9a-f]{64}$/.test(s.binding) ||
        !/^[0-9a-f]{32}$/.test(s.device) || s.v !== 1 || !Array.isArray(s.base) || !Number.isSafeInteger(s.seq)) return fail('stockage');
      SyncRevisions.meta(r.revision); SyncOutbox.status(s.outbox);
      if (s.outbox.job || s.bytes || s.outbox.dirtySince !== null) return fail('pending');
      return r;
    }
    async function vacant(target) {
      if (!await vault.syncCanInitialize()) return fail('not-empty');
      const s = await store.read();
      if (s) {
        const r = pending(s);
        if (r.phase !== 'pending' || s.binding !== target.binding || s.base.length || s.seq !== 0) return fail('pending');
      }
      return s;
    }
    function checkpoint(value) {
      if (value === null || value === undefined) return null;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'revision,sha256' ||
        typeof value.revision !== 'string' || typeof value.sha256 !== 'string' ||
        !/^[0-9a-f]{32}$/.test(value.revision) || !/^[0-9a-f]{64}$/.test(value.sha256)) return fail('checkpoint');
      return Object.freeze({ revision: value.revision, sha256: value.sha256 });
    }
    // `choice` : tête choisie explicitement quand plusieurs coexistent (conflit ouvert, appareil perdu).
    async function load(pass, target, guard, reference = null, choice = null) {
      const profiles = await provider.profiles(target.folder); guard();
      if (profiles.length !== 1) return fail('profile');
      const profile = profiles[0], descriptor = SyncKey.parse(profile.bytes);
      const handle = await SyncKey.derive(descriptor, pass, crypt); guard();
      const catalog = (await provider.list(target.folder)).filter(r => r.revision); guard();
      if (!catalog.length) return fail('absent');
      if (catalog.length > LIMITS.versions || catalog.some(r => !Number.isSafeInteger(r.size) || r.size < 1 || r.size > ControlVaultPacket.LIMITS.file) ||
        catalog.reduce((n, r) => n + r.size, 0) > LIMITS.bytes) return fail('limit');
      // Le premier plan sert seulement à borner et cibler la lecture. Il n'est
      // jamais une preuve : chaque révision est ensuite authentifiée.
      const local = { device: random(), seq: 0, base: [], dirty: false };
      const claimed = catalog.map(r => ({ ...SyncRevisions.meta(r.revision), fileSha256: r.fileSha256 }));
      const plan = SyncRevisions.plan(claimed, local);
      if (plan.action === 'blocked' || plan.warnings.length) return fail('conflict');
      if (plan.heads.length > 1 && choice === null) {
        // Jamais de choix par date : proposer les têtes, l'utilisateur en désigne une.
        const heads = plan.heads.map(id => { const c = claimed.find(x => x.id === id); return Object.freeze({ id, device: c.device, seq: c.seq }); });
        throw Object.assign(new Error('heads'), { code: 'heads', heads });
      }
      const wanted = plan.heads.length === 1 && choice === null ? plan.heads[0] : choice;
      if (typeof wanted !== 'string' || !plan.heads.includes(wanted)) return fail('conflict');
      let head = null; const confirmed = [];
      for (const ref of catalog) {
        const back = await provider.download(ref, undefined, target.folder); guard();
        const bytes = back.packet.copyBytes();
        const data = await codec.openWith(bytes, handle, version(), ref.fileSha256); guard();
        confirmed.push(SyncRevisions.confirm(ref.revision, data, ref.fileSha256, SyncMerge.device));
        if (ref.revision.id === wanted) head = { bytes, data, ref: structuredClone(ref), proof: structuredClone(back.proof) };
      }
      const verified = SyncRevisions.plan(confirmed, local);
      if (!head || verified.action === 'blocked' || verified.warnings.length || verified.heads.length !== plan.heads.length ||
        !verified.heads.includes(wanted) || head.data.rev.id !== wanted) return fail('conflict');
      // Une ancre conservée hors de Drive borne le rejeu : elle doit figurer
      // dans la lignée authentifiée, avec ses octets exacts. Elle ne prouve
      // pas l'absence d'une version ultérieure encore inconnue de cet appareil.
      if (reference && !confirmed.some(r => r.id === reference.revision && r.fileSha256 === reference.sha256)) return fail('checkpoint');
      // L'ancre doit appartenir à la lignée de la tête restaurée, pas seulement au catalogue (A2).
      if (reference) {
        const by = new Map(confirmed.map(r => [r.id, r.parents])), seen = new Set(), stack = [wanted];
        while (stack.length) { const id = stack.pop(); if (seen.has(id) || !by.has(id)) continue; seen.add(id); stack.push(...by.get(id)); }
        if (!seen.has(reference.revision)) return fail('checkpoint');
      }
      const catalogHash = await fingerprint(catalog.map(r => ({ fileId: r.fileId, sha: r.fileSha256, size: r.size, revision: r.revision })).sort((a, b) => a.fileId.localeCompare(b.fileId)));
      guard();
      return { ...head, profile: profile.sha256, catalog: catalogHash, values: await fingerprint(head.data.values) };
    }
    async function prepare(pass, knownCheckpoint = null, head = null) { return locked(async () => {
      draft = null; const { target, guard } = lease(); const prior = await vacant(target); guard();
      const reference = checkpoint(knownCheckpoint);
      const data = await load(pass, target, guard, reference, head); guard();
      if (prior && (prior.recoveryInit.source !== data.ref.fileSha256 || prior.recoveryInit.catalog !== data.catalog || prior.recoveryInit.profile !== data.profile)) return fail('source-changed');
      const ticket = Object.freeze({ revision: data.data.rev.id, at: data.data.at, size: data.bytes.length, sha256: data.ref.fileSha256 });
      draft = { ...data, ticket, target, reference, head, generation: epoch, preparedAt: now() }; return ticket;
    }); }
    async function install(ticket, pass, confirmed = false) { return locked(async () => {
      const before = draft, { target, guard } = lease();
      if (!confirmed || !before || before.ticket !== ticket || before.target !== target || before.generation !== epoch || now() - before.preparedAt > 300000) return fail('confirmation');
      const previous = await vacant(target); guard();
      // Une sauvegarde arrivée depuis l'aperçu impose une nouvelle décision.
      const fresh = await load(pass, target, guard, before.reference, before.head); guard();
      if (fresh.ref.fileSha256 !== before.ref.fileSha256 || fresh.catalog !== before.catalog || fresh.profile !== before.profile) return fail('source-changed');
      let state = null;
      await vault.syncInitialize(fresh.data.values, pass, async () => {
        const source = await store.recovery(fresh.bytes, crypt); guard();
        if (source !== fresh.ref.fileSha256) return fail('integrity');
        state = { v: 1, device: previous ? previous.device : random(), seq: 0, base: [], binding: target.binding,
          profile: fresh.profile, profileJob: null, outbox: SyncOutbox.initial(), bytes: null, observed: null, signal: null, recovery: null,
          recoveryInit: { v: 1, phase: 'pending', document: documentId, source, values: fresh.values, catalog: fresh.catalog,
            profile: fresh.profile, revision: structuredClone(fresh.data.rev), fileId: fresh.ref.fileId, downloadedAt: now() } };
        await store.write(state); guard();
      }, () => { guard(); return true; });
      state.recoveryInit.phase = 'installed'; await store.write(state);
      draft = null; return Object.freeze({ state: 'REOPEN_REQUIRED', revision: state.recoveryInit.revision.id });
    }); }
    async function verify(pass) { return locked(async () => {
      const s = await store.read(); if (!s) return fail('not-installed');
      const r = pending(s);
      if (r.document === documentId) return fail('reopen-required');
      const bytes = await store.readRecovery(r.source);
      if (!(bytes instanceof Uint8Array) || await hash(bytes) !== r.source) return fail('integrity');
      const data = await codec.open(bytes, pass, version(), r.source);
      SyncRevisions.confirm(r.revision, data, r.source, SyncMerge.device);
      if (await fingerprint(data.values) !== r.values) return fail('integrity');
      const local = await vault.syncVerifyInitialized(pass), names = Object.keys(local).filter(k => k !== 'twrc.key');
      if (local['twrc.key'] !== pass || names.length !== Object.keys(data.values).length || names.some(k => local[k] !== data.values[k])) return fail('local-changed');
      s.base = [r.revision.id]; s.profile = r.profile; s.observed = await fingerprint(DriveSync.projection(local));
      s.outbox = SyncOutbox.initial(); s.outbox.verified = { id: r.revision.id, sha: r.source, fileId: r.fileId, at: r.downloadedAt };
      s.recoveryInit = { ...r, phase: 'verified', verifiedAt: r.verifiedAt || now() };
      await store.write(s);
      return Object.freeze({ state: 'RESTORED_VERIFIED', revision: r.revision.id, sha256: r.source });
    }); }
    return Object.freeze({ prepare, install, verify,
      select(value) { if (busy) return fail('busy'); epoch++; draft = null;
        if (!value || typeof value.folder !== 'string' || !/^[0-9a-f]{64}$/.test(value.binding)) return fail('binding');
        selected = Object.freeze({ folder: value.folder, binding: value.binding }); },
      cancel() { epoch++; selected = null; draft = null; },
      exportCopy(ticket) { if (!draft || draft.ticket !== ticket || draft.generation !== epoch) return fail('confirmation'); return draft.bytes.slice(); },
      async pendingCopy() { const s = await store.read(); if (!s) return fail('not-installed'); const r = pending(s); const bytes = await store.readRecovery(r.source);
        if (!(bytes instanceof Uint8Array) || await hash(bytes) !== r.source) return fail('integrity'); return bytes.slice(); }
    });
  }
  return Object.freeze({ create, LIMITS });
})();
