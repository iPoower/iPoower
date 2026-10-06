// Fournisseurs isolés. Seul le flux public global est persisté, jamais sa corrélation privée.
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./road-intelligence') : root.RoadIntelligence);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Road) {
  'use strict';
  const FRESH_MS = 120000, CACHE_MS = 24 * 3600000;
  class RoadProvider {
    constructor(options) {
      Object.assign(this, { enabled: true, cacheAllowed: false, minIntervalMs: 30000, maxAgeMs: 720000, timeoutMs: 8000 }, options);
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(this.id) || typeof this.load !== 'function') throw new Error('Provider incomplet');
    }
  }
  class DatexRoadProvider extends RoadProvider {
    constructor(fetchImpl) {
      super({ id: 'datex', label: 'DATEX · Bison Futé / DIR', cacheAllowed: true,
        load: signal => fetchImpl('road-datex.json', { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }) });
    }
  }
  class Manager {
    constructor({ providers, now = Date.now, onChange = () => {}, storage = null, setTimer = (...args) => setTimeout(...args), clearTimer = id => clearTimeout(id) }) {
      if (new Set(providers.map(p => p.id)).size !== providers.length || providers.length > 8) throw new Error('Providers invalides');
      this.now = now; this.onChange = onChange; this.storage = storage; this.setTimer = setTimer; this.clearTimer = clearTimer;
      this.generation = 0; this.context = null; this.seen = new Set(); this.lastAlert = -Infinity; this.progress = null;
      this.states = new Map(providers.map(p => [p.id, { provider: p, state: p.enabled ? 'idle' : 'disabled', feed: null, triedAt: -Infinity, retryAt: 0, failures: 0, controller: null }]));
      for (const s of this.states.values()) if (s.provider.cacheAllowed && storage) {
        try {
          const j = JSON.parse(storage.getItem('twrc.road.' + s.provider.id));
          s.feed = Road.feed(j, s.provider.id, now());
          if (s.feed.ageMs > CACHE_MS) { storage.removeItem('twrc.road.' + s.provider.id); s.feed = null; }
          else s.state = 'cached';
        } catch (e) { /* cache absent, invalide ou stockage refusé */ }
      }
    }
    changed() { try { this.onChange(); } catch (e) { /* une panne de rendu trafic n'affecte aucun autre module */ } }
    suspend() {
      this.generation++;
      for (const s of this.states.values()) {
        if (s.controller) s.controller.abort(); s.controller = null;
        if (s.state === 'loading') s.state = s.feed ? 'cached' : 'idle';
      }
    }
    stop() {
      this.generation++; this.context = null; this.progress = null; this.seen.clear(); this.lastAlert = -Infinity;
      for (const s of this.states.values()) { if (s.controller) s.controller.abort(); s.controller = null; if (s.state === 'loading') s.state = s.feed ? 'cached' : 'idle'; }
      this.changed();
    }
    setEnabled(id, enabled) {
      const s = this.states.get(id); if (!s) return;
      s.provider.enabled = !!enabled;
      if (!enabled && s.controller) { s.controller.abort(); s.controller = null; }
      s.state = enabled ? s.feed ? 'cached' : 'idle' : 'disabled'; if (enabled) s.triedAt = -Infinity;
    }
    setContext(context) {
      const old = this.context;
      if (!context || !context.key || !context.route || !['advice', 'imminent', 'late', 'active'].includes(context.phase)) { if (old) this.stop(); return; }
      if (!old || context.key !== old.key || context.route !== old.route) {
        this.generation++; this.progress = null;
        for (const s of this.states.values()) { if (s.controller) s.controller.abort(); s.controller = null; if (s.state === 'loading') s.state = s.feed ? 'cached' : 'idle'; }
        if (!old || context.key !== old.key) { this.seen.clear(); this.lastAlert = -Infinity; }
      }
      this.context = context;
    }
    snapshot({ online = true } = {}) {
      const now = this.now(), providers = [], events = [], flows = []; let fresh = false;
      for (const s of this.states.values()) {
        const age = s.feed ? Math.max(0, now - Date.parse(s.feed.checkedAt), now - Date.parse(s.feed.publicationTime)) : null;
        const confirmed = s.provider.enabled && online && !!s.feed && age <= s.provider.maxAgeMs && s.state === 'ready';
        const active = confirmed && age <= FRESH_MS; fresh = fresh || active;
        providers.push({ id: s.provider.id, label: s.provider.label, state: !s.provider.enabled ? 'disabled' : !online ? 'offline' : age > s.provider.maxAgeMs && s.feed ? 'stale' : s.state,
          active, confirmed, ageMs: age, coverage: s.feed && s.feed.coverage, checkedAt: s.feed && s.feed.checkedAt, publicationTime: s.feed && s.feed.publicationTime });
        if (s.feed && s.provider.enabled && age <= s.provider.maxAgeMs && (confirmed || s.provider.cacheAllowed)) {
          events.push(...s.feed.events.map(e => ({ ...e, providerFresh: active })));
          flows.push(...s.feed.flows.map(e => ({ ...e, providerFresh: active, alertEligible: false })));
        }
        if (s.feed && age > CACHE_MS) { s.feed = null; if (s.provider.cacheAllowed && this.storage) try { this.storage.removeItem('twrc.road.' + s.provider.id); } catch (e) {} }
      }
      const filtered = this.context ? Road.filter(this.context.route, this.context.fix, events, now, this.progress) : { events: [], rejected: [], position: null, reason: 'inactive' };
      if (filtered.position) this.progress = filtered.position.distance;
      filtered.events.forEach(e => { if (!e.providerFresh || !online || this.context.phase !== 'active') e.alertEligible = false; });
      const flow = this.context ? Road.filter(this.context.route, this.context.fix, flows, now, this.progress).events : [];
      return { ...filtered, flows: flow, providers, fresh: fresh && online, online, key: this.context && this.context.key };
    }
    nextAlert(options) {
      const view = this.snapshot(options), event = Road.alertGate({ events: view.events, seen: this.seen, now: this.now(), lastAlert: this.lastAlert, fresh: view.fresh });
      if (event) { event.provenance.forEach(p => this.seen.add(p.provider + ':' + p.sourceId)); this.lastAlert = this.now(); }
      return event;
    }
    async refresh({ online = true, visible = true } = {}) {
      if (!this.context || !online || !visible) return;
      const generation = this.generation, view = this.snapshot({ online });
      const interval = Road.cadence(this.context.phase, view.events.some(e => e.routeStatus === 'imminent'));
      await Promise.allSettled([...this.states.values()].map(async s => {
        const p = s.provider, now = this.now();
        if (!p.enabled || s.controller || now < s.retryAt || now - s.triedAt < Math.max(interval, p.minIntervalMs)) return;
        s.triedAt = now; const controller = new AbortController(); s.controller = controller; s.state = 'loading'; this.changed();
        let timer;
        try {
          const request = Promise.resolve().then(() => p.load(controller.signal)).then(async response => {
            if (!response.ok) {
              const error = new Error('http_' + response.status); error.status = response.status;
              const retry = response.headers && response.headers.get('retry-after');
              error.retryMs = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : retry ? Math.max(0, Date.parse(retry) - this.now()) : 0;
              throw error;
            }
            const content = await response.text(); if (content.length > 1500000) throw new Error('invalid_payload');
            return { json: JSON.parse(content), cached: response.headers && response.headers.get('x-twrc-cache') === 'fallback' };
          });
          const timeout = new Promise((_, reject) => { timer = this.setTimer(() => { controller.abort(); reject(new Error('timeout')); }, p.timeoutMs); });
          const { json, cached } = await Promise.race([request, timeout]), parsed = Road.feed(json, p.id, this.now());
          if (generation !== this.generation || controller.signal.aborted || !p.enabled) return;
          s.feed = parsed; s.state = cached ? 'cached' : parsed.ageMs > p.maxAgeMs ? 'stale' : 'ready'; s.failures = 0; s.retryAt = 0;
          if (p.cacheAllowed && this.storage) try { this.storage.setItem('twrc.road.' + p.id, JSON.stringify(json)); } catch (e) { /* quota local : mémoire seulement */ }
        } catch (error) {
          error = error && typeof error === 'object' ? error : new Error('unavailable');
          if (generation !== this.generation || !p.enabled || controller.signal.aborted && error.message !== 'timeout') return;
          s.failures++; s.state = error.message === 'timeout' ? 'timeout' : error.status === 401 || error.status === 403 ? 'unauthorized' : error.status === 429 ? 'limited' : 'unavailable';
          const cooldown = s.state === 'unauthorized' || s.failures >= 3 ? 600000 : Math.min(600000, Math.max(interval, p.minIntervalMs) * Math.pow(2, s.failures - 1));
          s.retryAt = this.now() + Math.min(3600000, Math.max(cooldown, Number.isFinite(error.retryMs) ? error.retryMs : 0));
        } finally {
          this.clearTimer(timer); if (s.controller === controller) { s.controller = null; this.changed(); }
        }
      }));
    }
  }
  return { RoadProvider, DatexRoadProvider, publicDatex: fetchImpl => new DatexRoadProvider(fetchImpl), Manager, FRESH_MS, CACHE_MS };
});
