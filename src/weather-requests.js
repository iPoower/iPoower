// Accès aux API Open-Meteo : concurrence bornée, requêtes identiques partagées et pause HTTP 429.
// Seuls le délai, sa catégorie et le nombre de refus sont persistés : aucune URL ni coordonnée.
function weatherRequestManager(options) {
  const net = options.fetch, now = options.now || (() => Date.now());
  const later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
  const read = options.read || (() => null), write = options.write || (() => {});
  const queue = [], pending = new Map(); let active = 0, limit = { until: 0, failures: 0, kind: '' };
  // Quota journalier Open-Meteo (« try again tomorrow ») : reprise à minuit UTC (+2 min), pas 24 h plus tard. Si la porte se
  // referme juste après minuit, ou si le quota est encore épuisé à la reprise, nouvelle tentative dans 1 h.
  // Incident du 7 octobre 2026 : 429 journalier à 14:44, pause jusqu'au lendemain 14:44 → matinée entière sur le cache.
  const dayReset = (at, again = false) => { const next = Date.UTC(new Date(at).getUTCFullYear(), new Date(at).getUTCMonth(), new Date(at).getUTCDate() + 1, 0, 2);
    return again || next - at < 10 * 60e3 ? at + 3600e3 : next; };
  const owns = url => { try { return /(^|\.)open-meteo\.com$/.test(new URL(url).hostname); } catch (e) { return false; } };
  function state() {
    try {
      const s = JSON.parse(read() || 'null');
      if (s && Number.isFinite(s.until) && s.until > limit.until && s.until <= now() + 7 * 86400e3)
        limit = { until: s.until, failures: Math.max(1, Math.min(8, Math.floor(+s.failures || 1))), kind: ['minute', 'hour', 'day', 'concurrent', 'limited'].includes(s.kind) ? s.kind : 'limited' };
      // pause journalière enregistrée par une ancienne version (24 h) : ramenée à la prochaine reprise à minuit UTC
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
  async function refuse(response) {
    const at = now(), previous = state(); let reason = '', header = null;
    try { header = response.headers.get('Retry-After'); } catch (e) { /* non exposé par CORS */ }
    const failures = previous.until > at ? previous.failures : Math.min(8, previous.failures + 1);
    let delay = null;
    if (header != null && /^\d+$/.test(String(header).trim())) delay = Number(header) * 1000;
    else if (header) { const date = Date.parse(header); if (Number.isFinite(date) && date > at) delay = date - at; }
    if (!Number.isFinite(delay) || delay < 0) delay = null;
    const backoff = Math.min(15 * 60e3, 60e3 * 2 ** (failures - 1));
    // Ferme la porte dès le statut 429, avant de lire un éventuel corps lent ou absent.
    limit = { until: Math.max(previous.until, at + Math.max(1000, delay == null ? backoff : delay)), failures, kind: 'limited' }; save();
    try { const body = await response.json(); reason = typeof body.reason === 'string' ? body.reason.toLowerCase() : ''; } catch (e) { /* corps absent */ }
    const kind = /daily|per day|tomorrow/.test(reason) ? 'day' : /hourly|next hour/.test(reason) ? 'hour' : /minutely|next minute/.test(reason) ? 'minute' : /concurrent/.test(reason) ? 'concurrent' : 'limited';
    const fallback = kind === 'day' ? dayReset(at, previous.kind === 'day' && failures >= 2) - at : kind === 'hour' ? 3600e3 : backoff;
    limit = { until: Math.max(state().until, at + Math.max(1000, delay == null ? fallback : delay)), failures, kind }; save();
    throw limitedError();
  }
  function finish(job, error, value) {
    if (job.done) return; job.done = true; cancel(job.timer);
    if (pending.get(job.url) === job) pending.delete(job.url);
    if (error) job.reject(error); else job.resolve(value);
  }
  async function run(job) {
    try {
      if (state().until > now()) throw limitedError();
      const r = await net(job.url, { signal: job.ctl.signal, cache: 'no-store' });
      if (job.done || job.ctl.signal.aborted) throw abortError();
      if (r.status === 429) await refuse(r);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const value = await r.json();
      if (job.done || job.ctl.signal.aborted) throw abortError();
      // Une réponse lancée avant le refus ne doit pas effacer une pause encore active.
      if (state().until <= now() && limit.failures) { limit = { until: 0, failures: 0, kind: '' }; save(); }
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
  function get(url, ms = 12000, group = 'shared') {
    if (pending.has(url)) { const job = pending.get(url); job.groups.add(group); return job.promise; }
    if (state().until > now()) return Promise.reject(limitedError());
    const job = { url, priority: priority(url), ctl: new AbortController(), done: false, groups: new Set([group]) };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    pending.set(url, job);
    // Le délai couvre aussi la file d'attente : une panne ne bloque pas busy indéfiniment.
    job.timer = later(() => { job.ctl.abort(); finish(job, abortError()); pump(); }, ms);
    queue.push(job); queue.sort((a, b) => a.priority - b.priority); pump(); return job.promise;
  }
  return { owns, get, state, cancelGroup };
}
