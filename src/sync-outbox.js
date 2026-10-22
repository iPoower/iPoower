/* File d'envoi de synchronisation — lot D3, PURE : ni réseau, ni stockage, ni écran.
 * Local d'abord : la file ne lit ni n'écrit jamais les données de Race Control ; elle décide seulement
 * quand sceller, envoyer, relire et réessayer. Son état (JSON, sans donnée personnelle) et les octets
 * déjà chiffrés du travail en cours sont conservés par l'appelant : une fermeture ou une coupure
 * reprend le même fichier, avec le même identifiant réservé, sans doublon ni perte.
 * Un seul transfert à la fois. « Synchronisé » exige les octets distants relus et identiques ;
 * « opérationnel » exige en plus une restauration complète et un essai sur iPhone physique.
 */
'use strict';
const SyncOutbox = (() => {
  const QUIET_MS = 30000, MAX_WAIT_MS = 10 * 60000, BACKOFF = [5000, 15000, 60000, 300000, 900000];
  // Arrêts qui exigent une action humaine : jamais de nouvelle tentative silencieuse.
  const BLOCKING = ['auth', 'code', 'quota', 'conflict'];
  const RETRY = ['offline', 'network', 'integrity', 'interrupted'];
  const ID = /^[0-9a-f]{32}$/, SHA = /^[0-9a-f]{64}$/;
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const time = v => Number.isSafeInteger(v) && v >= 0;
  const copy = s => JSON.parse(JSON.stringify(s));
  function initial() { return { v: 1, dirtySince: null, lastChange: null, job: null, attempts: 0, retryAt: 0, blocked: null, verified: null }; }
  function check(s) {
    if (!s || s.v !== 1 || (s.dirtySince !== null && !time(s.dirtySince)) || (s.lastChange !== null && !time(s.lastChange)) ||
      !Number.isSafeInteger(s.attempts) || s.attempts < 0 || !time(s.retryAt) || (s.blocked !== null && !BLOCKING.includes(s.blocked))) return fail('INVALID_OUTBOX');
    const j = s.job;
    if (j !== null && (!j || !ID.test(j.rev && j.rev.id) || !SHA.test(j.sha) || !['sealed', 'reserved', 'sent'].includes(j.phase) ||
      (j.phase !== 'sealed' && (typeof j.fileId !== 'string' || !j.fileId)))) return fail('INVALID_OUTBOX');
    return copy(s);
  }
  // Toute modification durable est déjà enregistrée localement par Race Control avant cet appel.
  function noteChange(state, now) {
    const s = check(state); if (!time(now)) return fail('INVALID_OUTBOX');
    if (s.dirtySince === null) s.dirtySince = now;
    s.lastChange = now; return s;
  }
  // Regroupement : 30 s sans nouvelle saisie, ou 10 min au plus pendant une saisie continue.
  function next(state, now) {
    const s = check(state);
    if (s.blocked) return 'blocked';
    if (s.job) return now >= s.retryAt ? 'resume' : 'wait';
    if (s.dirtySince === null) return 'idle';
    if (now < s.retryAt) return 'wait';
    return now - s.lastChange >= QUIET_MS || now - s.dirtySince >= MAX_WAIT_MS ? 'seal' : 'wait';
  }
  // Le paquet couvre l'état pris à `snapshotAt` ; une saisie postérieure reste en attente.
  function sealed(state, job, snapshotAt) {
    const s = check(state);
    if (s.job || s.blocked || !time(snapshotAt)) return fail('OUTBOX_BUSY');
    s.job = { rev: { id: job.rev.id, parents: [...job.rev.parents], device: job.rev.device, seq: job.rev.seq }, sha: job.sha, size: job.size, fileId: null, phase: 'sealed' };
    if (s.lastChange !== null && s.lastChange <= snapshotAt) { s.dirtySince = null; s.lastChange = null; }
    else if (s.dirtySince !== null) s.dirtySince = Math.max(s.dirtySince, snapshotAt);
    return check(s);
  }
  // L'identifiant fournisseur est conservé AVANT l'envoi : la reprise vise le même fichier.
  function reserved(state, fileId) {
    const s = check(state);
    if (!s.job || s.job.phase !== 'sealed' || typeof fileId !== 'string' || !fileId) return fail('OUTBOX_STATE');
    s.job.fileId = fileId; s.job.phase = 'reserved'; return s;
  }
  function sent(state) {
    const s = check(state);
    if (!s.job || !['reserved', 'sent'].includes(s.job.phase)) return fail('OUTBOX_STATE');
    s.job.phase = 'sent'; return s;
  }
  // Seule la relecture des octets distants termine un travail.
  function verified(state, fileId, remoteSha, now) {
    const s = check(state);
    if (!s.job || s.job.phase !== 'sent' || fileId !== s.job.fileId) return fail('OUTBOX_STATE');
    if (remoteSha !== s.job.sha) return failed(s, 'integrity', now);
    s.verified = { id: s.job.rev.id, sha: s.job.sha, fileId, at: now };
    s.job = null; s.attempts = 0; s.retryAt = 0;
    return s;
  }
  function failed(state, kind, now) {
    const s = check(state);
    if (!time(now) || ![...BLOCKING, ...RETRY].includes(kind)) return fail('INVALID_OUTBOX');
    if (BLOCKING.includes(kind)) { s.blocked = kind; return s; }
    s.attempts++; s.retryAt = now + BACKOFF[Math.min(s.attempts, BACKOFF.length) - 1];
    // Les octets reçus diffèrent : le fichier n'est ni réutilisé ni supprimé ; un nouvel identifiant est réservé.
    if (kind === 'integrity' && s.job) { s.job.phase = 'sealed'; s.job.fileId = null; }
    return s;
  }
  // Action explicite : reconnexion, code saisi, espace libéré ou conflit arbitré.
  function unblock(state, now) {
    const s = check(state); if (!time(now)) return fail('INVALID_OUTBOX');
    s.blocked = null; s.retryAt = now; return s;
  }
  // Statuts honnêtes : chaque niveau exige sa preuve.
  function status(state, ctx = {}) {
    const s = check(state), conflicts = ctx.conflicts | 0, pending = ctx.headsPending | 0;
    const label = s.blocked === 'conflict' || conflicts ? 'conflit' : s.blocked === 'auth' ? 'reconnexion' : s.blocked === 'code' ? 'code' :
      s.blocked === 'quota' ? 'espace' : s.job ? (s.job.phase === 'sent' ? 'vérification' : 'envoi') : s.dirtySince !== null ? 'en attente' :
      pending ? 'à intégrer' : s.verified ? 'synchronisé' : 'local';
    const synced = label === 'synchronisé';
    return { label, synced, operational: synced && ctx.restoreProof === true && ctx.physicalProof === true,
      lastVerified: s.verified ? s.verified.at : null, attempts: s.attempts, retryAt: s.retryAt || null };
  }
  return Object.freeze({ QUIET_MS, MAX_WAIT_MS, BACKOFF, initial, noteChange, next, sealed, reserved, sent, verified, failed, unblock, status });
})();
