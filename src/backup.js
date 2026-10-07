// Sauvegarde V2 : seulement l'état utilisateur durable.
// Les observations physiques (GPS), trajets actifs, caches réseau et diagnostics runtime
// restent propres à l'appareil courant et ne sont jamais transportés.
'use strict';
const Backup = (() => {
  const VERSION = 2;
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const text = (v, max = 1200) => typeof v === 'string' ? v.slice(0, max) : null;
  const stamp = v => Number.isFinite(v) && v >= 0 ? v : null;
  const local = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(v) ? v : null;

  function dayContext(v) {
    v = obj(v) ? v : {};
    const n = obj(v.nextDestination) ? v.nextDestination : null;
    const p = obj(v.lastConfirmedPlace) ? v.lastConfirmedPlace : null;
    const d = obj(v.dayType) ? v.dayType : null;
    const o = obj(v.outfitChoice) ? v.outfitChoice : null;
    return {
      nextDestination: n && stamp(n.confirmedAt) != null && stamp(n.expiresAt) != null ? {
        placeId: text(n.placeId, 120), source: ['user', 'pending'].includes(n.source) ? n.source : 'pending',
        confirmedAt: n.confirmedAt, expiresAt: n.expiresAt, originId: text(n.originId, 120),
        tripKey: text(n.tripKey), dep: local(n.dep)
      } : null,
      lastConfirmedPlace: p && text(p.placeId, 120) && stamp(p.at) != null ? { placeId: text(p.placeId, 120), at: p.at, source: 'manual' } : null,
      departedAt: stamp(v.departedAt), arrivedAt: stamp(v.arrivedAt),
      dayType: d && local(d.date) && ['work', 'off'].includes(d.value) ? { date: d.date, value: d.value } : null,
      activeCarId: text(v.activeCarId, 120),
      outfitChoice: o && local(o.date) && ['office', 'outing', 'walk'].includes(o.occasion) ? { date: o.date, occasion: o.occasion } : null
    };
  }
  function placeConf(v) {
    return obj(v) && text(v.placeId, 120) && stamp(v.at) != null ? {
      placeId: text(v.placeId, 120), at: v.at, how: text(v.how, 40), day: local(v.day)
    } : null;
  }
  function placeLast(v) {
    return obj(v) && text(v.placeId, 120) && stamp(v.at) != null ? {
      placeId: text(v.placeId, 120), at: v.at, source: text(v.source, 40)
    } : null;
  }
  function thermal(v) {
    if (!obj(v) || !Number.isInteger(v.s) || v.s < 0 || v.s > 4 || !['faible', 'moyenne'].includes(v.conf)) return null;
    const range = Array.isArray(v.range) && v.range.length === 2 && v.range.every(Number.isFinite) ? v.range.slice(0, 2) : null;
    return range ? { s: v.s, range, conf: v.conf } : null;
  }
  function prediction(v) {
    if (!obj(v)) return null;
    const e = obj(v.evidence) ? v.evidence : null;
    return {
      known: v.known === true,
      conditions: Array.isArray(v.conditions) ? v.conditions.filter(x => ['wet', 'rain', 'fog', 'snow', 'ice'].includes(x)).slice(0, 5) : [],
      fetchedAt: stamp(v.fetchedAt), offline: v.offline === true, verdict: text(v.verdict, 180) || '',
      thermal: thermal(v.thermal),
      evidence: e ? {
        fogLevel: Number.isInteger(e.fogLevel) && e.fogLevel >= 0 && e.fogLevel <= 3 ? e.fogLevel : 0,
        trust: ['faible', 'moyenne', 'élevée'].includes(e.trust) ? e.trust : null,
        proofs: Array.isArray(e.proofs) ? e.proofs.map(x => text(x, 240)).filter(Boolean).slice(0, 4) : [],
        contradiction: e.contradiction === true
      } : null
    };
  }
  function debriefStart(v) {
    return obj(v) && text(v.key) && stamp(v.at) != null ? {
      key: text(v.key), at: v.at, name: text(v.name, 180) || '', from: text(v.from, 180) || '', to: text(v.to, 180) || '',
      carId: text(v.carId, 120) || '', car: text(v.car, 180) || '', prediction: prediction(v.prediction)
    } : null;
  }
  function feedback(v) {
    return obj(v) && stamp(v.at) != null ? {
      at: v.at, conditions: Array.isArray(v.conditions) ? v.conditions.filter(x => ['wet', 'rain', 'fog', 'snow', 'ice'].includes(x)).slice(0, 5) : [],
      grip: ['normal', 'reduced', 'slip', 'unknown'].includes(v.grip) ? v.grip : 'unknown'
    } : null;
  }
  function debriefEntry(v) {
    if (!obj(v) || !text(v.key) || stamp(v.at) == null || !['auto', 'confirmé'].includes(v.how)) return null;
    const end = obj(v.end) ? {
      thermal: thermal(v.end.thermal),
      km: Number.isFinite(v.end.km) && v.end.km >= 0 && v.end.km <= 20000 ? v.end.km : null,
      kmSrc: ['route', 'estimate', 'time'].includes(v.end.kmSrc) ? v.end.kmSrc : null
    } : null;
    return {
      key: text(v.key), at: v.at, how: v.how, name: text(v.name, 180) || '', from: text(v.from, 180) || '', to: text(v.to, 180) || '',
      start: debriefStart(v.start), end, feedback: feedback(v.feedback), deferred: v.deferred === true
    };
  }
  function debrief(v) {
    const entries = obj(v) && Array.isArray(v.entries) ? v.entries.map(debriefEntry).filter(Boolean).slice(0, 60) : [];
    // Un trajet actif n'est jamais restauré : il dépend du GPS et de la session appareil.
    return { active: null, entries };
  }
  function done(v) {
    const out = {};
    if (!obj(v)) return out;
    Object.entries(v).slice(-256).forEach(([k, d]) => {
      if (!text(k) || !obj(d) || stamp(d.at) == null || !Number.isFinite(d.exp)) return;
      out[text(k)] = { at: d.at, exp: d.exp, how: text(d.how, 40) || '' };
    });
    return out;
  }
  function lastArrival(v) {
    return obj(v) && text(v.key) && stamp(v.at) != null ? {
      key: text(v.key), name: text(v.name, 180) || '', at: v.at, placeId: text(v.placeId, 120)
    } : null;
  }
  function context(v, now = Date.now()) {
    v = obj(v) ? v : {};
    const p = obj(v.place) ? v.place : {};
    return {
      v: 1, revision: 0, updatedAt: now,
      dayContext: dayContext(v.dayContext),
      place: { conf: placeConf(p.conf), last: placeLast(p.last), extra: null },
      gps: null, tripStart: null, tripEnd: null, returnHome: null,
      done: done(v.done), debrief: debrief(v.debrief), lastArrival: lastArrival(v.lastArrival), lastDeparture: null
    };
  }
  function tyreTherm(v) {
    const out = {};
    if (!obj(v)) return out;
    Object.entries(v).slice(0, 32).forEach(([id, h]) => {
      if (!text(id, 120) || !obj(h) || !local(h.at) || !Number.isFinite(h.T) || h.T < -80 || h.T > 160) return;
      out[text(id, 120)] = { at: h.at, T: Math.round(h.T * 10) / 10, sig: text(h.sig, 240) };
    });
    return out;
  }
  function tripCancel(v) {
    const out = {};
    if (!obj(v)) return out;
    Object.entries(v).forEach(([id, e]) => {
      if (!/^(cal-[0-9a-f]{32}|work-\d{4}-\d{2}-\d{2})$/.test(id) || !obj(e) || stamp(e.at) == null || !Number.isFinite(e.exp)) return;
      out[id] = { at: e.at, exp: e.exp };
    });
    return out;
  }
  function make({ settings, view, context: state, tyreTherm: therm, tripCancel: cancel, at = new Date().toISOString() } = {}) {
    if (!obj(settings)) throw new Error('réglages absents');
    const epoch = Number.isFinite(Date.parse(at)) ? Date.parse(at) : Date.now();
    return {
      app: 'twrc', v: VERSION, at, settings: clone(settings), view: text(view, 40) || null,
      durable: { context: context(state, epoch), tyreTherm: tyreTherm(therm), tripCancel: tripCancel(cancel) }
    };
  }

  const CONTEXT_KEYS = ['twrc.context.v1', 'twrc.gps', 'twrc.place.v1', 'twrc.tripstart.v1', 'twrc.tripend.v1', 'twrc.returnhome.v1', 'twrc.tripdone', 'twrc.debrief.v1'];
  const DURABLE_KEYS = ['twrc.tyretherm.v1', 'twrc.tripcancel'];
  const DERIVED_KEYS = ['twrc.trend', 'twrc.tripmap', 'twrc.croute', 'twrc.calendar.sealed.v1', 'twrc.weather.limit.v1'];
  const DERIVED_PREFIXES = ['twrc.cache.', 'twrc.croute.'];

  function restorePlan(data, now = Date.now()) {
    if (!obj(data) || data.app !== 'twrc' || !obj(data.settings)) return null;
    const writes = { 'twrc.settings.v1': JSON.stringify({ ...clone(data.settings), configured: 1 }) };
    if (text(data.view, 40)) writes['twrc.view'] = data.view;
    const remove = [...CONTEXT_KEYS, ...DURABLE_KEYS, ...DERIVED_KEYS];
    if (data.v >= 2 && obj(data.durable)) {
      writes['twrc.context.v1'] = JSON.stringify(context(data.durable.context, now));
      writes['twrc.tyretherm.v1'] = JSON.stringify(tyreTherm(data.durable.tyreTherm));
      writes['twrc.tripcancel'] = JSON.stringify(tripCancel(data.durable.tripCancel));
    }
    return { writes, remove: [...new Set(remove.filter(k => !Object.prototype.hasOwnProperty.call(writes, k)))], removePrefixes: DERIVED_PREFIXES.slice() };
  }
  return { VERSION, make, restorePlan, context, tyreTherm, tripCancel };
})();
