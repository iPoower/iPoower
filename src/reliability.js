// Garde-fous transverses : journal runtime local et cohérence build/prod.
// Aucun réseau, aucune donnée métier et aucune coordonnée précise ne sont conservés ici.
'use strict';
const Reliability = (() => {
  const KEY = 'twrc.runtime.v1';
  const clip = (value, max = 180) => String(value == null ? '' : value)
    .replace(/https?:\/\/\S+/gi, 'url')
    .replace(/\b(?:lat(?:itude)?|lon(?:gitude)?)\s*[:=]\s*-?\d+(?:\.\d+)?/gi, '$1=coordonnée')
    .replace(/-?\d{1,2}\.\d{3,}\s*[,;/]\s*-?\d{1,3}\.\d{3,}/g, 'coordonnées')
    .replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
  const parse = raw => {
    try {
      const v = JSON.parse(raw || 'null');
      return Array.isArray(v) ? v.filter(x => x && Number.isFinite(x.at) && typeof x.kind === 'string' && typeof x.message === 'string').slice(-20) : [];
    } catch (e) { return []; }
  };
  function runtimeRecorder({ target = typeof window !== 'undefined' ? window : null, storage = typeof localStorage !== 'undefined' ? localStorage : null,
    now = () => Date.now(), limit = 20 } = {}) {
    let entries = [];
    try { entries = parse(storage && storage.getItem(KEY)); } catch (e) { entries = []; }
    const save = () => { try { if (storage) storage.setItem(KEY, JSON.stringify(entries)); } catch (e) { /* mémoire seulement */ } };
    const record = (kind, value) => {
      const message = clip(value && value.message != null ? value.message : value);
      entries = [...entries, { at: now(), kind: clip(kind, 24), message: message || 'erreur sans message' }].slice(-limit);
      save(); return entries[entries.length - 1];
    };
    const onError = e => record('error', e && (e.error || e.message));
    const onRejection = e => record('rejection', e && e.reason);
    if (target && target.addEventListener) {
      target.addEventListener('error', onError);
      target.addEventListener('unhandledrejection', onRejection);
    }
    return {
      key: KEY,
      record,
      entries: () => entries.slice(),
      count: () => entries.length,
      last: () => entries.length ? { ...entries[entries.length - 1] } : null,
      clear() { entries = []; try { if (storage) storage.removeItem(KEY); } catch (e) { /* mémoire seulement */ } },
      dispose() {
        if (!target || !target.removeEventListener) return;
        target.removeEventListener('error', onError);
        target.removeEventListener('unhandledrejection', onRejection);
      }
    };
  }
  function versionDecision({ loaded, published, travelling = false, attempted = false, online = true } = {}) {
    if (!loaded || !published) return 'unknown';
    if (loaded === published) return 'current';
    if (!online) return 'offline';
    if (travelling) return 'deferred';
    return attempted ? 'stale' : 'reload';
  }
  return { clip, runtimeRecorder, versionDecision };
})();
const RUNTIME_RECORDER = typeof window !== 'undefined' ? Reliability.runtimeRecorder() : null;
