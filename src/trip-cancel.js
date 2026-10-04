/* Annulations locales : état technique, jamais une arrivée. Aucun réseau ni coordonnée persistée. */
const TripCancel = (() => {
  const KEY = 'twrc.tripcancel', UNDO_MS = 10 * 60e3, EVENT_MARGIN_MS = 2 * 3600e3;
  const validId = id => typeof id === 'string' && /^(cal-[0-9a-f]{32}|work-\d{4}-\d{2}-\d{2})$/.test(id);
  const point = p => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const copyPoint = p => p ? { ...p } : null;
  const hash = s => [2166136261, 2246822507, 3266489909, 668265263].map(seed => {
    let h = seed; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }).join('');
  function eventId(e) {
    // Le relais ancien ne conserve pas l'UID. Son occurrence s/e constitue
    // alors l'identifiant technique disponible. Ni titre, ni adresse, ni position ne participent à ce repli.
    // Deux occurrences simultanées sans UID sont ambiguës : rebuild les conserve, sans appliquer une annulation commune.
    const technical = e.id || e.uid || e.UID || '';
    const occurrence = [e.s || '', e.e || '', !!e.allDay];
    return 'cal-' + hash(JSON.stringify([technical, occurrence]));
  }
  const workId = date => 'work-' + date;
  const identifiable = (events, e) => (events || []).filter(other => eventId(other) === eventId(e)).length === 1;
  function clean(state, now) {
    const out = {};
    if (state && typeof state === 'object' && !Array.isArray(state)) Object.keys(state).forEach(id => {
      const e = state[id];
      if (validId(id) && e && Number.isFinite(e.at) && Number.isFinite(e.exp) && e.exp > now && e.at <= now + 60e3 && e.at <= e.exp) out[id] = { at: e.at, exp: e.exp };
    });
    return out;
  }
  function save(storage, state, now) {
    const out = clean(state, now);
    try { if (Object.keys(out).length) storage.setItem(KEY, JSON.stringify(out)); else storage.removeItem(KEY); } catch (e) { /* stockage indisponible : état en mémoire */ }
    return out;
  }
  function load(storage, now) {
    let raw = null, state = null;
    try { raw = storage.getItem(KEY); state = JSON.parse(raw || 'null'); } catch (e) { /* JSON invalide ou stockage indisponible */ }
    const out = clean(state, now), text = Object.keys(out).length ? JSON.stringify(out) : null;
    // Purge physique, y compris JSON invalide/champs privés ajoutés à une ancienne entrée.
    try { if (text === null) { if (raw !== null) storage.removeItem(KEY); } else if (text !== raw) storage.setItem(KEY, text); } catch (e) { /* stockage indisponible */ }
    return out;
  }
  const has = (state, id, now) => !!(state && Object.prototype.hasOwnProperty.call(state, id) && state[id] && state[id].exp > now);
  function cancel(state, id, exp, now) {
    const out = clean(state, now);
    if (validId(id) && Number.isFinite(exp) && exp > now) out[id] = { at: now, exp };
    return out;
  }
  function undo(state, id, now) {
    const out = clean(state, now), entry = out[id];
    if (entry && now >= entry.at && now - entry.at <= UNDO_MS) delete out[id];
    return out;
  }
  const undoable = (state, now) => Object.keys(clean(state, now)).filter(id => now >= state[id].at && now - state[id].at <= UNDO_MS).map(id => ({ id, ...state[id] }));
  const shift = (local, minutes) => new Date(Date.parse(local.slice(0, 16) + ':00Z') + minutes * 60e3).toISOString().slice(0, 16);
  function localEpoch(local, timezone = 'Europe/Paris') {
    if (typeof local !== 'string') return NaN;
    if (/Z$|[+-]\d\d:\d\d$/.test(local)) return Date.parse(local);
    const ts = local.length === 10 ? local + 'T00:00' : local.slice(0, 16), nominal = Date.parse(ts + ':00Z');
    if (!Number.isFinite(nominal)) return NaN;
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    let instant = nominal;
    // Convertir l'heure murale de l'agenda sans utiliser le fuseau du navigateur.
    for (let i = 0; i < 3; i++) {
      const parts = {}; fmt.formatToParts(new Date(instant)).forEach(p => { parts[p.type] = p.value; });
      const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
      instant += nominal - shown;
    }
    return instant;
  }
  function eventExpiration(e, now, timezone = 'Europe/Paris') {
    let end = e.e || e.s;
    if (e.allDay && !e.e && end) end = shift(end.slice(0, 10) + 'T00:00', 1440);
    const epoch = localEpoch(end, timezone);
    return Number.isFinite(epoch) ? Math.max(epoch + EVENT_MARGIN_MS, now + UNDO_MS) : now + EVENT_MARGIN_MS;
  }
  function workExpiration(date, now = Date.now(), timezone = 'Europe/Paris') {
    const midnight = localEpoch(shift(date + 'T00:00', 1440), timezone);
    return Number.isFinite(midnight) ? Math.max(midnight, now + UNDO_MS) : now + UNDO_MS;
  }
  const distance = (a, b) => {
    const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2), y = Math.sin((b.lon - a.lon) * r / 2);
    return 12742 * Math.asin(Math.min(1, Math.sqrt(x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y)));
  };
  const same = (a, b) => point(a) && point(b) && Math.abs(a.lat - b.lat) < 0.00005 && Math.abs(a.lon - b.lon) < 0.00005;
  function selectedLegs(e, directSet) {
    return (e.legs || []).filter(l => !(l.k === 'ret' && l.brk && directSet[l.brk])).map(l => e.alt && directSet[e.alt.key] && l.k === 'go' && l.brk === e.alt.key ? { ...e.alt.direct, chosen: true } : { ...l });
  }
  // Le relais actuel omet déjà les données spatiales de #pasdetrajet. Ne pas
  // reconstruire ses routes saines ni remplacer leur ancre domicile arrondie.
  const nonSpatialNeedsRebuild = e => !!e && e.mode === 'pasdetrajet' &&
    (point(e) || !!(e.legs || []).length || !!(e.alt && e.alt.direct));
  function rebuild(events, home, directSet, state, now, context = {}) {
    directSet = directSet || {};
    const result = new Map(), byDay = new Map(), counts = new Map();
    (events || []).forEach(e => { const id = eventId(e); counts.set(id, (counts.get(id) || 0) + 1); });
    const cancelled = e => counts.get(eventId(e)) === 1 && has(state, eventId(e), now);
    const set = (e, legs) => {
      // La référence de l'événement est toujours distincte, même avec un agenda ancien sans UID.
      result.set(e, legs);
      if (counts.get(eventId(e)) === 1) result.set(eventId(e), legs);
    };
    (events || []).forEach(e => {
      set(e, cancelled(e) || e.mode === 'pasdetrajet' ? [] : selectedLegs(e, directSet));
      const d = (e.s || '').slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(e);
    });
    const H = home ? { ...home, label: 'Domicile', city: 'Domicile' } : null;
    const eventPoint = e => point(e) ? { lat: e.lat, lon: e.lon, label: e.label || e.loc || 'Rendez-vous', city: e.label || e.loc || 'Rendez-vous' } : null;
    for (const [day, dayEvents] of byDay) {
      // Un ancien agenda peut encore rattacher la route suivante à un événement
      // désormais non spatial. Reconstruire ce jour même sans annulation locale.
      if (!dayEvents.some(e => cancelled(e) || nonSpatialNeedsRebuild(e)) && !has(state, workId(day), now)) continue;
      const remaining = dayEvents.filter(e => !cancelled(e) && e.mode !== 'pasdetrajet' && point(e)).sort((a, b) => a.s.localeCompare(b.s));
      // Toute route réutilisée a exactement les mêmes extrémités ; ni géométrie ni météo d'une vieille origine.
      const routes = dayEvents.flatMap(e => [...(e.legs || []), ...(e.alt && e.alt.direct ? [e.alt.direct] : [])]);
      remaining.forEach(e => set(e, []));
      const add = (e, k, from, to, fromKind, anchor, assumed = false) => {
        const old = routes.find(l => l.k === k && same(l.from, from) && same(l.to, to) && Number.isFinite(l.min) && l.min > 0);
        let leg;
        if (old) {
          const dep = k === 'go' ? shift(anchor, -old.min - 10) : anchor;
          leg = { ...old, k, from: copyPoint(from), to: copyPoint(to), fromKind, dep, arr: shift(dep, old.min), assumed };
          delete leg.brk; delete leg.byKey; delete leg.chosen;
        } else {
          const previous = (e.legs || []).find(l => l.k === k);
          // L'heure originale ne sert qu'au classement. Aucune durée/départ conseillé/route n'est valable avant recalcul.
          const arr = k === 'go' ? shift(anchor, -10) : anchor;
          leg = { k, from: copyPoint(from), to: copyPoint(to), fromKind, dep: k === 'go' && previous ? previous.dep : anchor, arr,
            km: null, min: null, pts: [], g: [], routed: false, byTime: false, assumed, originPending: true,
            rebuildFrom: copyPoint(from), originUncertain: !point(from) || !point(to), targetArr: k === 'go' ? arr : null };
        }
        result.get(e).push(leg);
      };
      let initial = H;
      if (remaining.length && typeof context.beforeFirst === 'function') {
        try { initial = copyPoint(context.beforeFirst(remaining[0])); } catch (e) { initial = null; }
      }
      const initialKind = same(initial, H) ? 'home' : initial ? (initial.kind || (initial.id === 'work' ? 'work' : 'known')) : 'unknown';
      let prev = null;
      for (const e of remaining) {
        const P = eventPoint(e), near = point(H) && distance(H, P) < 3;
        if (e.allDay) { if (!near || !point(initial) || !same(initial, H)) { add(e, 'go', initial, P, initialKind, day + 'T09:00'); if (!near) add(e, 'ret', P, H, 'event', day + 'T18:00', true); } continue; }
        if (near) { if (prev && !prev.near) add(prev.e, 'ret', prev.p, H, 'event', shift(prev.e.e, 10)); else if (!prev && (!point(initial) || distance(initial, P) >= 3)) add(e, 'go', initial, P, initialKind, e.s); prev = { e, p: P, near: true }; continue; }
        const gap = prev && !prev.near ? (Date.parse(e.s + ':00Z') - Date.parse(prev.e.e + ':00Z')) / 60e3 : null;
        const direct = e.alt && directSet[e.alt.key];
        const chain = gap !== null && gap >= 0 && (e.mode === 'direct' || direct ? true : e.mode === 'maison' ? false : gap <= 180);
        if (chain) { if (distance(prev.p, P) >= 1) add(e, 'go', prev.p, P, 'prev', e.s); }
        else { if (prev && !prev.near) add(prev.e, 'ret', prev.p, H, 'event', shift(prev.e.e, 10)); add(e, 'go', prev ? H : initial, P, prev ? 'home' : initialKind, e.s); }
        prev = { e, p: P, near: false };
      }
      if (prev && !prev.near) add(prev.e, 'ret', prev.p, H, 'event', shift(prev.e.e, 10));
      // Événement sans lieu : aucune route ne peut être reconstruite depuis une origine annulée.
      dayEvents.filter(e => !cancelled(e) && e.mode !== 'pasdetrajet' && !point(e)).forEach(e => {
        const invalid = selectedLegs(e, directSet).some(l => l.fromKind === 'prev');
        if (invalid) set(e, selectedLegs(e, directSet).map(l => l.fromKind === 'prev' ? {
          k: l.k, dep: l.dep, arr: l.arr, from: null, to: copyPoint(l.to), fromKind: 'unknown', originPending: true, originUncertain: true,
          rebuildFrom: null, targetArr: l.k === 'go' ? l.arr : null, pts: [], g: [], min: null, km: null, routed: false
        } : l));
      });
    }
    return result;
  }
  return { KEY, UNDO_MS, EVENT_MARGIN_MS, eventId, workId, identifiable, clean, save, load, has, cancel, undo, undoable, eventExpiration, workExpiration, localEpoch, rebuild, selectedLegs, nonSpatialNeedsRebuild };
})();
