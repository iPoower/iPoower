/* Contexte utilisateur canonique. Aucun moteur météo, DOM ou appel réseau ici.
 * Les anciennes clés sont des miroirs de compatibilité écrits ensemble ; elles
 * ne sont lues qu'à la migration. Une transaction publie un seul changement.
 */
const DayContext = (() => {
  const date = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  const hour = at => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  const nextDate = d => new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  function expiry(at) {
    const day = nextDate(date(at)), nominal = Date.parse(day + 'T04:00:00Z');
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    let instant = nominal;
    for (let i = 0; i < 3; i++) { const p = {}; fmt.formatToParts(new Date(instant)).forEach(x => { p[x.type] = x.value; }); instant += nominal - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); }
    return instant;
  }
  const id = v => typeof v === 'string' && v.length > 0 && v.length <= 1200;
  const timestamp = (v, now) => Number.isFinite(v) && v >= 0 && v <= now + 60000;
  function clean(v, now, places = null, cars = null) {
    v = v || {}; const n = v.nextDestination, c = v.lastConfirmedPlace;
    const exists = x => !places || places.some(p => p.id === x);
    const arrivedAt = timestamp(v.arrivedAt, now) ? v.arrivedAt : null;
    const valid = n && (n.source === 'user' || n.source === 'pending') && timestamp(n.confirmedAt, now) && n.expiresAt > now && n.expiresAt <= expiry(n.confirmedAt)
      && (!arrivedAt || arrivedAt < n.confirmedAt) && (n.placeId == null || id(n.placeId) && exists(n.placeId));
    return { nextDestination: valid ? { placeId: n.placeId || null, source: n.source, confirmedAt: n.confirmedAt, expiresAt: n.expiresAt,
      originId: id(n.originId) ? n.originId : null, tripKey: id(n.tripKey) ? n.tripKey : null, dep: typeof n.dep === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.dep) ? n.dep : null } : null,
      lastConfirmedPlace: c && id(c.placeId) && exists(c.placeId) && timestamp(c.at, now) && c.source === 'manual' ? { placeId: c.placeId, at: c.at, source: 'manual' } : null,
      departedAt: timestamp(v.departedAt, now) ? v.departedAt : null, arrivedAt,
      dayType: v.dayType && v.dayType.date === date(now) && ['work', 'off'].includes(v.dayType.value) ? { date: v.dayType.date, value: v.dayType.value } : null,
      activeCarId: id(v.activeCarId) && (!cars || cars.some(c => c.id === v.activeCarId)) ? v.activeCarId : null,
      outfitChoice: v.outfitChoice && [date(now), nextDate(date(now))].includes(v.outfitChoice.date) && ['office', 'outing', 'walk'].includes(v.outfitChoice.occasion) ? { date: v.outfitChoice.date, occasion: v.outfitChoice.occasion } : null };
  }
  function morningOrigin(v, now, places) {
    const c = clean(v, now, places), p = c.lastConfirmedPlace; if (!p || now - p.at > 20 * 3600e3 || c.departedAt != null && c.departedAt >= p.at) return null;
    const today = date(now), confirmed = date(p.at);
    if (confirmed !== today && !(nextDate(confirmed) === today && hour(p.at) >= 16)) return null;
    return places.find(l => l.id === p.placeId) || null;
  }
  function destination(v, planned, now, places) {
    const n = clean(v, now, places).nextDestination;
    return n ? { place: places.find(p => p.id === n.placeId) || null, source: n.placeId ? 'user' : 'pending', confirmedAt: n.confirmedAt } : { place: planned || null, source: planned ? 'planned' : 'unknown', confirmedAt: null };
  }
  function returnLeg(leg, key, v, now, places) {
    const n = clean(v, now, places).nextDestination; if (!n || n.tripKey !== key) return leg;
    const to = places.find(p => p.id === n.placeId) || null;
    if (to && leg.to && to.id === leg.to.id && to.lat === leg.to.lat && to.lon === leg.to.lon) return { ...leg, navTo: to, destinationOverride: true };
    return { ...leg, to, navTo: to, destinationOverride: true, g: [], pts: [], km: null, min: null, routed: false,
      originPending: true, originUncertain: !to || !leg.from, targetArr: null };
  }
  function workOn(day, v, days) {
    day = day.slice(0, 10); const explicit = v && v.dayType;
    if (explicit && explicit.date === day) return explicit.value === 'work';
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay() || 7;
    return (days || []).includes(weekday);
  }
  function occasion(day, v, working, destinationId, workId) {
    const manual = v && v.outfitChoice;
    return manual && manual.date === day ? manual.occasion : working || destinationId && destinationId === workId ? 'office' : 'outing';
  }
  function prioritize(trips, v, now) {
    const n = clean(v, now).nextDestination, chosen = n && trips.find(t => t.key === n.tripKey);
    if (!chosen) return trips;
    // Les départs plus faibles incompatibles avec « destination suivante »
    // ne pilotent aucune vue. Les trajets ultérieurs restent des prévisions.
    return [chosen, ...trips.filter(t => t.key !== chosen.key && (!chosen.arr || !t.dep || t.dep >= chosen.arr))];
  }
  return { date, expiry, clean, morningOrigin, destination, returnLeg, workOn, occasion, prioritize };
})();
function userContextStore({ read, write, now = () => Date.now() }) {
  const key = 'twrc.context.v1', listeners = new Set();
  const parse = k => { try { return JSON.parse(read(k) || 'null'); } catch (e) { return null; } };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const time = t => Number.isFinite(t) && t >= 0 && t <= now() + 60000;
  const point = p => obj(p) && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  const trip = t => obj(t) && typeof t.key === 'string' && t.key.length <= 1200 && time(t.at) && now() - t.at < 12 * 3600e3;
  function normalize(v) {
    const p = obj(v.place) ? v.place : {}, done = {};
    const conf = obj(p.conf) && typeof p.conf.placeId === 'string' && time(p.conf.at) ? p.conf : null;
    const start = trip(v.tripStart) ? v.tripStart : null;
    // Une ancienne page peut réécrire v1 sans connaître ce nouveau champ.
    // Le miroir sert seulement à cette récupération ; un champ canonique vide gagne.
    const debrief = Debrief.clean(Object.prototype.hasOwnProperty.call(v, 'debrief') ? v.debrief : parse('twrc.debrief.v1'), now());
    if (!start || conf && conf.at >= start.at || debrief.active && debrief.active.key !== start.key) debrief.active = null;
    if (obj(v.done)) Object.entries(v.done).slice(-256).forEach(([k, d]) => {
      if (obj(d) && time(d.at) && Number.isFinite(d.exp) && d.exp > now() && typeof d.how === 'string') done[k] = d;
    });
    return { v: 1, revision: Number.isSafeInteger(v.revision) && v.revision >= 0 ? v.revision : 0,
      updatedAt: time(v.updatedAt) ? v.updatedAt : now(), dayContext: DayContext.clean(v.dayContext || {
        lastConfirmedPlace: conf ? { placeId: conf.placeId, at: conf.at, source: 'manual' } : null,
        departedAt: start && start.at || v.lastDeparture && v.lastDeparture.at || null
      }, now()),
      place: { conf,
        last: obj(p.last) && typeof p.last.placeId === 'string' && time(p.last.at) ? p.last : null,
        extra: point(p.extra) && time(p.extra.at) ? p.extra : null },
      gps: point(v.gps) && time(v.gps.t) && Number.isFinite(v.gps.acc) && v.gps.acc >= 0 ? v.gps : null,
      tripStart: start && !(conf && conf.at >= start.at) ? start : null,
      tripEnd: obj(v.tripEnd) && time(v.tripEnd.at) ? v.tripEnd : null,
      returnHome: trip(v.returnHome) && Number.isFinite(v.returnHome.exp) && v.returnHome.exp > now() ? v.returnHome : null,
      done, debrief, lastArrival: obj(v.lastArrival) && time(v.lastArrival.at) ? v.lastArrival : null,
      lastDeparture: obj(v.lastDeparture) && typeof v.lastDeparture.placeId === 'string' && time(v.lastDeparture.at) && now() - v.lastDeparture.at < 20 * 3600e3 ? v.lastDeparture : null };
  }
  const saved = parse(key), legacy = !saved ? { place: parse('twrc.place.v1'), gps: parse('twrc.gps'),
    tripStart: parse('twrc.tripstart.v1'), tripEnd: parse('twrc.tripend.v1'), returnHome: parse('twrc.returnhome.v1'), done: parse('twrc.tripdone') } : null;
  let state = normalize(saved && saved.v === 1 ? saved : legacy || {}), depth = 0, baseline = '', publishing = false;
  const oldOutfit = read('twrc.outfit.occasion');
  if (!(saved && saved.dayContext) && ['office', 'outing', 'walk'].includes(oldOutfit)) state.dayContext.outfitChoice = { date: DayContext.date(now()), occasion: oldOutfit };
  const encode = v => v == null ? null : JSON.stringify(v);
  function persist() {
    // Une écriture atomique du document canonique précède les anciens miroirs.
    // Un stockage refusé conserve exactement le même contexte en mémoire.
    try { write(key, JSON.stringify(state)); } catch (e) { return; }
    if (oldOutfit != null) { try { write('twrc.outfit.occasion', null); } catch (e) { /* migration déjà dans le document */ } }
    const mirrors = { 'twrc.place.v1': { conf: state.place.conf, last: state.place.last }, 'twrc.gps': state.gps,
      'twrc.tripstart.v1': state.tripStart, 'twrc.tripend.v1': state.tripEnd, 'twrc.returnhome.v1': state.returnHome,
      'twrc.tripdone': Object.keys(state.done).length ? state.done : null, 'twrc.debrief.v1': state.debrief };
    Object.entries(mirrors).forEach(([k, v]) => { try { write(k, encode(v)); } catch (e) { /* compatibilité facultative */ } });
  }
  function flush() {
    if (depth) return false;
    const next = JSON.stringify(state); if (next === baseline) return false;
    const durable = parse(key);
    state.revision = Math.max(state.revision, durable && Number.isSafeInteger(durable.revision) ? durable.revision : 0) + 1;
    state.updatedAt = Math.max(state.updatedAt, now()); baseline = JSON.stringify(state); persist();
    if (!publishing) { publishing = true; try { listeners.forEach(fn => fn(state)); } finally { publishing = false; } }
    return true;
  }
  function transaction(fn) {
    depth++; try { return fn(state); } finally { depth--; if (!depth) flush(); }
  }
  function receive(value) {
    let incoming; try { incoming = JSON.parse(value || 'null'); } catch (e) { return false; }
    if (!incoming || incoming.v !== 1) return false;
    // Le dernier document réellement stocké gagne, même avec deux clics dans
    // la même milliseconde. Un ancien événement storage retardé est écarté.
    const durable = read(key); if (durable && durable !== value) return false;
    if (JSON.stringify(normalize(incoming)) === baseline) return false;
    state = normalize(incoming); baseline = JSON.stringify(state); listeners.forEach(fn => fn(state)); return true;
  }
  baseline = JSON.stringify(state); persist();
  return { key, get state() { return state; }, transaction, flush, receive,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
