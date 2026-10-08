/* Débrief local : prévision figée au départ, arrivée unique, retour conducteur.
 * Fonctions pures ; aucune coordonnée, trace GPS, requête ni température mesurée.
 * Les états thermiques 0–4 et la confiance faible/moyenne viennent de tyreLab.
 */
const Debrief = (() => {
  const LIMIT = 60, RETENTION = 90 * 86400000;
  const CONDITIONS = ['wet', 'rain', 'fog', 'snow', 'ice'];
  const LABELS = { wet: 'Chaussée humide', rain: 'Pluie', fog: 'Brume / brouillard', snow: 'Neige', ice: 'Verglas' };
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  const text = (x, max = 180) => typeof x === 'string' ? x.slice(0, max) : '';
  const key = x => typeof x === 'string' && x.length > 0 && x.length <= 1200 ? x : null;
  const time = (x, now) => Number.isFinite(x) && x > 0 && x <= now + 60000;
  const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  const conditions = xs => CONDITIONS.filter(k => Array.isArray(xs) && xs.includes(k));
  function thermal(v) {
    if (!obj(v) || !Number.isInteger(v.s) || v.s < 0 || v.s > 4 || !['faible', 'moyenne'].includes(v.conf)) return null;
    const range = Array.isArray(v.range) && v.range.length === 2 && v.range.every(x => finite(x, -80, 160) != null) && v.range[0] <= v.range[1] ? v.range.slice() : null;
    return range ? { s: v.s, range, conf: v.conf } : null;
  }
  function prediction(v, now) {
    if (!obj(v)) return null;
    return { known: v.known === true, conditions: conditions(v.conditions),
      fetchedAt: time(v.fetchedAt, now) ? v.fetchedAt : null, offline: v.offline === true,
      verdict: text(v.verdict), thermal: thermal(v.thermal),
      evidence: obj(v.evidence) && Number.isInteger(v.evidence.fogLevel) && v.evidence.fogLevel >= 0 && v.evidence.fogLevel <= 3 ? {
        fogLevel: v.evidence.fogLevel, trust: ['faible', 'moyenne', 'élevée'].includes(v.evidence.trust) ? v.evidence.trust : null,
        proofs: Array.isArray(v.evidence.proofs) ? v.evidence.proofs.slice(0, 4).map(s => text(s, 240)) : [], contradiction: v.evidence.contradiction === true } : null };
  }
  function start(v, now) {
    if (!obj(v) || !key(v.key) || !time(v.at, now) || now - v.at >= 12 * 3600e3) return null;
    return { key: v.key, at: v.at, name: text(v.name), from: text(v.from), to: text(v.to),
      carId: text(v.carId, 120), car: text(v.car), prediction: prediction(v.prediction, v.at) };
  }
  function feedback(v, now) {
    if (!obj(v) || !time(v.at, now) || !Array.isArray(v.conditions) || v.conditions.some(k => !CONDITIONS.includes(k))) return null;
    return { at: v.at, conditions: conditions(v.conditions),
      grip: ['normal', 'reduced', 'slip', 'unknown'].includes(v.grip) ? v.grip : 'unknown' };
  }
  function entry(v, now) {
    if (!obj(v) || !key(v.key) || !time(v.at, now) || now - v.at >= RETENTION || !['auto', 'confirmé'].includes(v.how)) return null;
    const s = obj(v.start) && time(v.start.at, now) && v.start.at <= v.at ? start(v.start, v.at) : null;
    const end = obj(v.end) ? { thermal: thermal(v.end.thermal), km: finite(v.end.km, 0, 20000),
      kmSrc: ['route', 'estimate', 'time'].includes(v.end.kmSrc) ? v.end.kmSrc : null } : null;
    const f = feedback(v.feedback, now);
    return { key: v.key, at: v.at, how: v.how, name: text(v.name), from: text(v.from), to: text(v.to),
      start: s && s.key === v.key ? s : null, end, feedback: f && f.at >= v.at ? f : null, deferred: v.deferred === true };
  }
  function clean(v, now = Date.now()) {
    const seen = new Set(), entries = [];
    const rows = obj(v) && Array.isArray(v.entries) ? v.entries : [];
    rows.slice(0, LIMIT * 2).map(x => entry(x, now)).filter(Boolean).sort((a, b) => b.at - a.at).forEach(e => {
      if (!seen.has(e.key) && entries.length < LIMIT) { seen.add(e.key); entries.push(e); }
    });
    return { active: start(v && v.active, now), entries };
  }
  function begin(v, value, now = Date.now()) {
    const state = clean(v, now), s = start(value, now);
    if (s && (!state.active || state.active.key !== s.key || state.active.at !== s.at)) state.active = s;
    return state;
  }
  function close(v, value, now = Date.now()) {
    const state = clean(v, now);
    if (!obj(value) || !key(value.key) || !['auto', 'confirmé'].includes(value.how)) return state;
    const s = state.active && state.active.key === value.key && state.active.at <= now ? state.active : null;
    if (!state.entries.some(e => e.key === value.key)) {
      const e = entry({ ...value, at: now, start: s, feedback: null, deferred: false }, now);
      if (e) state.entries.unshift(e);
    }
    if (s) state.active = null;
    state.entries = state.entries.slice(0, LIMIT);
    return state;
  }
  function reply(v, tripKey, value, now = Date.now()) {
    const state = clean(v, now), e = state.entries.find(e => e.key === tripKey), f = feedback({ ...value, at: now }, now);
    if (e && f) { e.feedback = f; e.deferred = false; }
    return state;
  }
  function defer(v, tripKey, now = Date.now()) {
    const state = clean(v, now), e = state.entries.find(e => e.key === tripKey);
    if (e && !e.feedback) e.deferred = true;
    return state;
  }
  function undo(v, tripKey, now = Date.now()) {
    const state = clean(v, now); state.entries = state.entries.filter(e => e.key !== tripKey);
    if (state.active && state.active.key === tripKey) state.active = null;
    return state;
  }
  function compare(e) {
    const p = e && e.start && e.start.prediction, f = e && e.feedback;
    if (!f) return { kind: 'pending', missed: [], unused: [] };
    if (!p || !p.known || !p.fetchedAt || e.start.at - p.fetchedAt > 90 * 60e3) return { kind: 'unknown', missed: [], unused: [] };
    // Pluie et chaussée humide décrivent la même famille ; brume, neige et
    // verglas restent séparés pour ne pas masquer un phénomène non annoncé.
    const family = xs => [...new Set(xs.map(k => ['wet', 'rain'].includes(k) ? 'wet' : k))];
    const predicted = family(p.conditions), observed = family(f.conditions);
    const missed = observed.filter(k => !predicted.includes(k)), unused = predicted.filter(k => !observed.includes(k));
    return { kind: missed.length && unused.length ? 'mixed' : missed.length ? 'missed' : unused.length ? 'unused' : 'match', missed, unused };
  }
  function stats(v, now = Date.now()) {
    const entries = clean(v, now).entries, counts = { match: 0, missed: 0, unused: 0, mixed: 0, unknown: 0, pending: 0 };
    entries.forEach(e => counts[compare(e).kind]++);
    return { total: entries.length, answered: entries.filter(e => e.feedback).length,
      comparable: counts.match + counts.missed + counts.unused + counts.mixed, counts };
  }
  return { LIMIT, RETENTION, CONDITIONS, LABELS, thermal, clean, begin, close, reply, defer, undo, compare, stats };
})();
