// Accès aux API Open-Meteo : concurrence bornée, requêtes identiques partagées et pause HTTP 429.
// Pause et 20 derniers échecs : métadonnées bornées uniquement, aucune URL, coordonnée ni message brut.
function weatherRequestManager(options) {
  const net = options.fetch, now = options.now || (() => Date.now());
  const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
  const read = options.read || (() => null), write = options.write || (() => {});
  const readIncidents = options.readIncidents || (() => null), writeIncidents = options.writeIncidents || (() => {});
  const invalidResponse = options.invalidResponse || (() => false);
  const incidentKinds = ['network', 'timeout', 'http', 'invalid-json', 'invalid-response', 'quota-minute', 'quota-hour', 'quota-day', 'quota-concurrent', 'quota-limited'];
  // La durée mesure l'appel HTTP (corps compris), pas une indisponibilité globale du fournisseur.
  const cleanIncident = x => x && incidentKinds.includes(x.kind) && Number.isFinite(x.at) && x.at >= 0 && x.at <= now() + 60000
    && Number.isFinite(x.durationMs) && x.durationMs >= 0 && x.durationMs <= 3600e3
    ? { at: Math.floor(x.at), kind: x.kind, durationMs: Math.round(x.durationMs),
      ...(Number.isInteger(x.status) && x.status >= 100 && x.status <= 599 ? { status: x.status } : {}) } : null;
  let incidentRows = [];
  try { const rows = JSON.parse(readIncidents() || 'null'); if (Array.isArray(rows)) incidentRows = rows.slice(-20).map(cleanIncident).filter(Boolean); } catch (e) { /* stockage indisponible */ }
  function recordIncident(job, error) {
    // Une requête partagée compte une fois ; attente de quota, annulation et géocodage ne sont pas des échecs météo envoyés.
    if (!job.observe || job.startedAt == null || error && error.cancelled) return;
    const kind = job.status === 429 ? 'quota-' + (incidentKinds.includes('quota-' + job.quotaKind) ? job.quotaKind : 'limited')
      : error ? error.name === 'AbortError' ? 'timeout' : job.status >= 400 ? 'http' : job.phase === 'json' ? 'invalid-json' : 'network'
      : job.invalid ? 'invalid-response' : null;
    if (!kind) return;
    const row = cleanIncident({ at: now(), kind, durationMs: Math.max(0, Math.min(3600e3, now() - job.startedAt)), status: job.status });
    if (!row) return;
    incidentRows = [...incidentRows, row].slice(-20);
    try { writeIncidents(JSON.stringify(incidentRows)); } catch (e) { /* historique conservé en mémoire */ }
  }
  const queue = [], pending = new Map(), snapshots = new Map(); let active = 0, limit = { until: 0, failures: 0, kind: '' };
  // Cache mémoire borné : les prévisions sont partagées par URL exacte, jamais enregistrées en stockage persistant.
  // Les appels 5 min du cockpit ne doivent pas redemander à chaque fois les modèles horaires/itinéraires inchangés.
  const CACHE_LIMIT = 48;
  const validSnapshot = v => v && !v.error && (Array.isArray(v)
    ? v.length > 0 && v.every(x => x && x.hourly && Array.isArray(x.hourly.time) && x.hourly.time.length)
    : !!((v.hourly && Array.isArray(v.hourly.time) && v.hourly.time.length)
      || (v.minutely_15 && Array.isArray(v.minutely_15.time) && v.minutely_15.time.length)));
  function remember(url, value) {
    if (!validSnapshot(value)) return false;
    snapshots.delete(url); snapshots.set(url, { value, at: now() });
    if (snapshots.size > CACHE_LIMIT) snapshots.delete(snapshots.keys().next().value);
    return true;
  }
  const fetchedAt = url => snapshots.get(url)?.at || null;
  // Quota journalier Open-Meteo (« try again tomorrow ») : reprise à minuit UTC (+2 min), pas 24 h plus tard. Si la porte se
  // referme juste après minuit, ou si le quota est encore épuisé à la reprise, nouvelle tentative dans 1 h.
  // Incident du 7 octobre 2026 : 429 journalier à 14:44, pause jusqu'au lendemain 14:44 → matinée entière sur le cache.
  const dayReset = (at, again = false) => { const next = Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate() + 1, 0, 2);
    return again || next - at < 10 * 60e3 ? at + 3600e3 : next; };
  const owns = url => { try { return /(^|\.)open-meteo\.com$/.test(new URL(url).hostname); } catch (e) { return false; } };
  function state() {
    try {
      const s = JSON.parse(read() || 'null');
      if (s && Number.isFinite(s.until) && s.until > limit.until && s.until <= now() + 7 * 86400e3) {
        const kind = ['minute', 'hour', 'day', 'concurrent', 'limited'].includes(s.kind) ? s.kind : 'limited';
        // at = moment du refus ; absent des pauses écrites avant ce correctif (une pause journalière y valait 24 h)
        const at = Number.isFinite(s.at) ? s.at : kind === 'day' ? s.until - 86400e3 : null;
        limit = { until: s.until, failures: Math.max(1, Math.min(8, Math.floor(+s.failures || 1))), kind, ...(at != null ? { at } : {}) };
      }
      // Quota journalier : jamais au-delà de la première reprise (minuit UTC + 2 min) qui suit le refus. Incident du 8 octobre :
      // pause de 24 h écrite par l'ancienne version à 14:44 ; l'ancien correctif la ramenait à la reprise suivant « maintenant »
      // (le lendemain 02:02), ce qui la laissait intacte après minuit. Elle expire désormais à la reprise qui suit le refus.
      if (limit.kind === 'day' && Number.isFinite(limit.at) && limit.until > dayReset(limit.at)) { limit = { ...limit, until: dayReset(limit.at) }; save(); }
      if (limit.kind === 'day' && limit.until > dayReset(now())) { limit = { ...limit, until: dayReset(now()) }; save(); }
    } catch (e) { /* stockage indisponible ou illisible : la pause en mémoire reste valable */ }
    return { ...limit, active, queued: queue.filter(j => !j.done).length };
  }
  function save() { try { write(JSON.stringify(limit)); } catch (e) { /* stockage indisponible */ } }
  function limitedError() {
    const e = new Error('HTTP 429 · fournisseur météo limité · nouvelle tentative après la pause');
    e.status = 429; e.retryAt = state().until; return e;
  }
  function abortError(replaced = false) { const e = new Error(replaced ? 'Requête météo remplacée' : 'Délai météo dépassé'); e.name = 'AbortError'; if (replaced) e.cancelled = true; return e; }
  const priority = url => { const u = new URL(url); return u.pathname === '/v1/forecast' && u.searchParams.has('current') ? 0 : u.searchParams.has('minutely_15') ? 1 : 2; };
  async function refuse(response, job) {
    job.quotaKind = 'limited';
    const at = now(), previous = state(); let reason = '', header = null;
    try { header = response.headers.get('Retry-After'); } catch (e) { /* non exposé par CORS */ }
    const failures = previous.until > at ? previous.failures : Math.min(8, previous.failures + 1);
    let delay = null;
    if (header != null && /^\d+$/.test(String(header).trim())) delay = Number(header) * 1000;
    else if (header) { const date = Date.parse(header); if (Number.isFinite(date) && date > at) delay = date - at; }
    if (!Number.isFinite(delay) || delay < 0) delay = null;
    const backoff = Math.min(15 * 60e3, 60e3 * 2 ** (failures - 1));
    // Ferme la porte dès le statut 429, avant de lire un éventuel corps lent ou absent.
    limit = { until: Math.max(previous.until, at + Math.max(1000, delay == null ? backoff : delay)), failures, kind: 'limited', at }; save();
    try { const body = await response.json(); reason = typeof body.reason === 'string' ? body.reason.toLowerCase() : ''; } catch (e) { /* corps absent */ }
    const kind = /daily|per day|tomorrow/.test(reason) ? 'day' : /hourly|next hour/.test(reason) ? 'hour' : /minutely|next minute/.test(reason) ? 'minute' : /concurrent/.test(reason) ? 'concurrent' : 'limited';
    job.quotaKind = kind;
    const fallback = kind === 'day' ? dayReset(at, previous.kind === 'day' && failures >= 2) - at : kind === 'hour' ? 3600e3 : backoff;
    limit = { until: Math.max(state().until, at + Math.max(1000, delay == null ? fallback : delay)), failures, kind, at }; save();
    throw limitedError();
  }
  function finish(job, error, value) {
    if (job.done) return; job.done = true; cancel(job.timer);
    if (pending.get(job.url) === job) pending.delete(job.url);
    recordIncident(job, error);
    if (error) job.reject(error); else job.resolve(value);
  }
  async function run(job) {
    try {
      if (state().until > now()) throw limitedError();
      job.startedAt = now(); job.phase = 'network';
      const r = await net(job.url, { signal: job.ctl.signal, cache: 'no-store' });
      if (job.done || job.ctl.signal.aborted) throw abortError();
      job.status = r.status;
      if (r.status === 429) await refuse(r, job);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      job.phase = 'json';
      const value = await r.json();
      if (job.done || job.ctl.signal.aborted) throw abortError();
      // Une réponse lancée avant le refus ne doit pas effacer une pause encore active.
      if (state().until <= now() && limit.failures) { limit = { until: 0, failures: 0, kind: '' }; save(); }
      job.invalid = !remember(job.url, value);
      // Observateur facultatif : même les prévisions structurées mais refusées par le moteur restent traçables.
      // Une erreur de l'observateur ne doit jamais modifier la réponse, le cache ou le verdict métier.
      try { if (job.observe && invalidResponse(value, job.url)) job.invalid = true; } catch (e) { /* diagnostic seulement */ }
      finish(job, null, value);
    } catch (e) { finish(job, e); }
    finally { active--; pump(); }
  }
  function pump() {
    while (queue.length && active < 2) {
      const job = queue.shift(); if (job.done) continue;
      if (state().until > now()) { finish(job, limitedError()); continue; }
      active++; run(job);
    }
  }
  function cancelGroup(group) {
    for (const job of pending.values()) {
      if (!job.groups.delete(group) || job.groups.size) continue;
      job.ctl.abort(); finish(job, abortError(true));
    }
    pump();
  }
  function get(url, ms = 12000, group = 'shared', cacheMs = 0) {
    if (pending.has(url)) { const job = pending.get(url); job.groups.add(group); return job.promise; }
    // Un 429 reste prioritaire sur le cache : l'interface sait qu'elle affiche une donnée de secours.
    if (state().until > now()) return Promise.reject(limitedError());
    const snap = snapshots.get(url), ttl = Math.max(0, Math.min(2 * 3600e3, Number(cacheMs) || 0));
    if (ttl && snap && now() >= snap.at && now() - snap.at < ttl) return Promise.resolve(snap.value);
    const job = { url, priority: priority(url), observe: /^\/v1\/(forecast|ensemble|air-quality)$/.test(new URL(url).pathname),
      ctl: new AbortController(), done: false, groups: new Set([group]) };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    pending.set(url, job);
    // Le délai couvre aussi la file d'attente : une panne ne bloque pas busy indéfiniment.
    job.timer = later(() => { job.ctl.abort(); finish(job, abortError()); pump(); }, ms);
    queue.push(job); queue.sort((a, b) => a.priority - b.priority); pump(); return job.promise;
  }
  return { owns, get, state, cancelGroup, fetchedAt, incidents: () => incidentRows.map(x => ({ ...x })) };
}
