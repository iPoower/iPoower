/* Contexte utilisateur canonique. Aucun moteur météo, DOM ou appel réseau ici.
 * Les anciennes clés sont des miroirs de compatibilité écrits ensemble ; elles
 * ne sont lues qu'à la migration. Une transaction publie un seul changement.
 */
const DayContext = (() => {
  const date = at => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  const hour = at => +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(at));
  const nextDate = d => new Date(Date.parse(d + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const local = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : null;
  const text = (v, max = 1200) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  function parisAt(day, hm = '04:00') {
    const nominal = Date.parse(day + 'T' + hm + ':00Z');
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    let instant = nominal;
    for (let i = 0; i < 3; i++) { const p = {}; fmt.formatToParts(new Date(instant)).forEach(x => { p[x.type] = x.value; }); instant += nominal - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); }
    return instant;
  }
  function expiry(at) { return parisAt(nextDate(date(at))); }
  function tripExpiry(dep, at) {
    const day = local(dep) ? dep.slice(0, 10) : date(at), exp = parisAt(nextDate(day));
    return Math.min(exp, at + 370 * 86400000);
  }
  const id = v => typeof v === 'string' && v.length > 0 && v.length <= 1200;
  const timestamp = (v, now) => Number.isFinite(v) && v >= 0 && v <= now + 60000;
  function cleanPoint(v, fallbackId) {
    if (!v || typeof v !== 'object' || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180) return null;
    const pid = text(v.id, 120) || fallbackId;
    return { id: pid, name: text(v.name || v.label, 220) || 'Lieu', address: text(v.address, 320) || '', lat: +v.lat, lon: +v.lon,
      provider: text(v.provider, 80) || '', precision: text(v.precision, 80) || '' };
  }
  function clean(v, now, places = null, cars = null) {
    v = v || {}; const n = v.nextDestination, c = v.lastConfirmedPlace;
    const exists = x => !places || places.some(p => p.id === x);
    const arrivedAt = timestamp(v.arrivedAt, now) ? v.arrivedAt : null;
    const dep = n && local(n.dep), rawSource = n && ['user', 'manual', 'calendar', 'live', 'pending'].includes(n.source) ? n.source : null;
    const originPoint = n && cleanPoint(n.originPoint, 'manual-origin'), destinationPoint = n && cleanPoint(n.destinationPoint, 'manual-destination');
    // Compatibilité v1 : l'ancien { source:'user', placeId:null } signifiait déjà « À confirmer ».
    const source = rawSource === 'user' && n && n.placeId == null && !destinationPoint ? 'pending' : rawSource;
    const targetOk = !!n && (source === 'pending' ? n.placeId == null && !destinationPoint : !!(destinationPoint || id(n.placeId) && exists(n.placeId)));
    const maxExpiry = n && timestamp(n.confirmedAt, now) ? tripExpiry(dep, n.confirmedAt) : null;
    const valid = n && source && timestamp(n.confirmedAt, now) && Number.isFinite(n.expiresAt) && n.expiresAt > now && maxExpiry && n.expiresAt <= maxExpiry + 60000
      && (!arrivedAt || arrivedAt < n.confirmedAt) && targetOk;
    return { nextDestination: valid ? { placeId: id(n.placeId) ? n.placeId : destinationPoint && destinationPoint.id || null, source, confirmedAt: n.confirmedAt, expiresAt: n.expiresAt,
      originId: id(n.originId) ? n.originId : originPoint && originPoint.id || null, originPoint, destinationPoint,
      tripKey: id(n.tripKey) ? n.tripKey : null, dep, createdAt: timestamp(n.createdAt, now) ? n.createdAt : n.confirmedAt,
      updatedAt: timestamp(n.updatedAt, now) ? n.updatedAt : n.confirmedAt } : null,
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
    return n ? { place: n.destinationPoint || places.find(p => p.id === n.placeId) || null, source: n.source === 'pending' ? 'pending' : n.source, confirmedAt: n.confirmedAt } : { place: planned || null, source: planned ? 'planned' : 'unknown', confirmedAt: null };
  }
  function returnLeg(leg, key, v, now, places) {
    const n = clean(v, now, places).nextDestination; if (!n || n.tripKey !== key) return leg;
    const to = n.destinationPoint || places.find(p => p.id === n.placeId) || null;
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
  return { date, expiry, tripExpiry, cleanPoint, clean, morningOrigin, destination, returnLeg, workOn, occasion, prioritize };
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
  let durability = { status: 'durable', failedAt: null, lastOkAt: null, validatedAt: null, error: null };
  function persist() {
    // Une écriture atomique du document canonique précède les anciens miroirs.
    // Une panne de stockage reste visible et retentable : jamais de faux « sauvegardé ».
    try { write(key, JSON.stringify(state)); }
    catch (e) {
      durability = { status: 'degraded', failedAt: now(), lastOkAt: durability.lastOkAt, validatedAt: durability.validatedAt, error: String(e && e.message || e || 'écriture refusée').slice(0, 120) };
      return false;
    }
    durability = { status: 'durable', failedAt: null, lastOkAt: now(), validatedAt: durability.validatedAt, error: null };
    if (oldOutfit != null) { try { write('twrc.outfit.occasion', null); } catch (e) { /* migration déjà dans le document */ } }
    const mirrors = { 'twrc.place.v1': { conf: state.place.conf, last: state.place.last }, 'twrc.gps': state.gps,
      'twrc.tripstart.v1': state.tripStart, 'twrc.tripend.v1': state.tripEnd, 'twrc.returnhome.v1': state.returnHome,
      'twrc.tripdone': Object.keys(state.done).length ? state.done : null, 'twrc.debrief.v1': state.debrief };
    Object.entries(mirrors).forEach(([k, v]) => { try { write(k, encode(v)); } catch (e) { /* compatibilité facultative */ } });
    return true;
  }
  function validateDurable() {
    // Une reprise n'est validée qu'après relecture du document canonique.
    // Cela évite un faux DURABLE si l'écriture a été acceptée sans être relisible
    // (stockage révoqué, contexte navigateur instable ou concurrence inattendue).
    const expected = JSON.stringify(state);
    let stored = null;
    try { stored = read(key); }
    catch (e) {
      durability = { status: 'degraded', failedAt: now(), lastOkAt: durability.lastOkAt, validatedAt: durability.validatedAt,
        error: String(e && e.message || e || 'relecture refusée').slice(0, 120) };
      return false;
    }
    if (stored !== expected) {
      durability = { status: 'degraded', failedAt: now(), lastOkAt: durability.lastOkAt, validatedAt: durability.validatedAt,
        error: 'validation stockage : document canonique différent ou illisible' };
      return false;
    }
    durability = { status: 'durable', failedAt: null, lastOkAt: durability.lastOkAt || now(), validatedAt: now(), error: null };
    return true;
  }
  function flush() {
    if (depth) return false;
    const next = JSON.stringify(state); if (next === baseline) return false;
    const durable = parse(key), base = (() => { try { return JSON.parse(baseline || 'null'); } catch (e) { return null; } })();
    state.revision = Math.max(base && Number.isSafeInteger(base.revision) ? base.revision : 0, durable && Number.isSafeInteger(durable.revision) ? durable.revision : 0) + 1;
    state.updatedAt = Math.max(state.updatedAt, now());
    if (persist()) baseline = JSON.stringify(state);
    if (!publishing) { publishing = true; try { listeners.forEach(fn => fn(state)); } finally { publishing = false; } }
    return true;
  }
  function retry() {
    if (depth) return false;
    if (durability.status === 'durable' && JSON.stringify(state) === baseline) return validateDurable();
    const ok = persist();
    if (!ok || !validateDurable()) return false;
    baseline = JSON.stringify(state); return true;
  }
  function transaction(fn) {
    depth++; try { return fn(state); } finally { depth--; if (!depth) flush(); }
  }
  function receive(value) {
    // Une fenêtre qui possède une modification non durable ne l'écrase jamais
    // par un événement storage concurrent : elle retente d'abord sa propre vérité.
    if (durability.status === 'degraded') return false;
    let incoming; try { incoming = JSON.parse(value || 'null'); } catch (e) { return false; }
    if (!incoming || incoming.v !== 1) return false;
    // Le dernier document réellement stocké gagne, même avec deux clics dans
    // la même milliseconde. Un ancien événement storage retardé est écarté.
    const durable = read(key); if (durable && durable !== value) return false;
    if (JSON.stringify(normalize(incoming)) === baseline) return false;
    state = normalize(incoming); baseline = JSON.stringify(state); listeners.forEach(fn => fn(state)); return true;
  }
  baseline = ''; if (persist()) baseline = JSON.stringify(state);
  return { key, get state() { return state; }, transaction, flush, retry, durability: () => ({ ...durability }), receive,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
