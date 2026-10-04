/* ===================== FLIGHT RECORDER (local, privacy-first) ===================== */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RC_OBS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'twrc.flight.v1';
  const VERSION = 1;
  const MAX_EVENTS = 180;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const FORBIDDEN_KEY = /^(?:lat|lon|lng|latitude|longitude|coord|coords|coordinates|address|title|event|eventtitle|location|place|city|name|label)$/i;
  const STATUS = new Set(['ok', 'degraded', 'error', 'offline', 'unknown']);
  let memory = null;

  const now = () => Date.now();
  const storage = () => {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch (e) { return null; }
  };
  const finite = v => Number.isFinite(v) ? v : null;
  const cleanText = v => String(v == null ? '' : v)
    .replace(/-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/g, '[coord]')
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .slice(0, 120);

  function clean(value, depth) {
    depth = depth || 0;
    if (depth > 3 || value == null) return value == null ? null : undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return finite(value);
    if (typeof value === 'string') return cleanText(value);
    if (Array.isArray(value)) return value.slice(0, 12).map(v => clean(v, depth + 1)).filter(v => v !== undefined);
    if (typeof value !== 'object') return undefined;
    const out = {};
    Object.keys(value).slice(0, 32).forEach(k => {
      if (FORBIDDEN_KEY.test(k)) return;
      const v = clean(value[k], depth + 1);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function load() {
    if (memory) return memory;
    const s = storage();
    try {
      const parsed = s ? JSON.parse(s.getItem(KEY) || '[]') : [];
      memory = Array.isArray(parsed) ? parsed : [];
    } catch (e) { memory = []; }
    const cutoff = now() - MAX_AGE_MS;
    memory = memory.filter(e => e && Number.isFinite(e.ts) && e.ts >= cutoff).slice(-MAX_EVENTS);
    return memory;
  }

  function persist() {
    const s = storage();
    if (!s) return;
    try { s.setItem(KEY, JSON.stringify(load())); } catch (e) { /* quota / private mode */ }
  }

  function record(type, domain, data) {
    const list = load(), ts = now();
    const payload = clean(data || {}, 0) || {};
    if (payload.status && !STATUS.has(payload.status)) payload.status = 'unknown';
    const event = {
      v: VERSION,
      ts,
      type: cleanText(type || 'event').slice(0, 24),
      domain: cleanText(domain || 'system').slice(0, 32),
      data: payload
    };
    list.push(event);
    const cutoff = ts - MAX_AGE_MS;
    memory = list.filter(e => e.ts >= cutoff).slice(-MAX_EVENTS);
    persist();
    return event;
  }

  const source = (domain, data) => record('source', domain, data);
  const decision = (domain, data) => record('decision', domain, data);
  const recovery = (domain, data) => record('recovery', domain, data);

  function events(limit) {
    const n = Math.max(1, Math.min(50, Number(limit) || 20));
    return load().slice(-n).map(e => ({ ...e, data: clean(e.data, 0) || {} }));
  }

  function snapshot() {
    const list = load(), latest = {};
    list.forEach(e => { if (e.type === 'source') latest[e.domain] = e; });
    const lastDecision = [...list].reverse().find(e => e.type === 'decision') || null;
    const lastRecovery = [...list].reverse().find(e => e.type === 'recovery') || null;
    const since = now() - 24 * 60 * 60 * 1000;
    let errors24h = 0, fallbacks24h = 0;
    list.forEach(e => {
      if (e.ts < since) return;
      if (e.data && (e.data.status === 'error' || e.data.status === 'offline')) errors24h++;
      if (e.data && e.data.fallback && e.data.fallback !== 'none') fallbacks24h++;
    });
    return {
      version: VERSION,
      count: list.length,
      sources: latest,
      lastDecision,
      lastRecovery,
      errors24h,
      fallbacks24h,
      events: events(12)
    };
  }

  function clear() {
    memory = [];
    const s = storage();
    try { if (s) s.removeItem(KEY); } catch (e) { /* stockage indisponible */ }
  }

  function ageText(ms) {
    if (!Number.isFinite(ms) || ms < 0) return 'inconnue';
    if (ms < 60 * 1000) return Math.max(1, Math.round(ms / 1000)) + ' s';
    if (ms < 60 * 60 * 1000) return Math.round(ms / 60000) + ' min';
    const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  return Object.freeze({ record, source, decision, recovery, events, snapshot, clear, ageText });
});
