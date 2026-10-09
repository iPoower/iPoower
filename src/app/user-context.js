/* Les noms historiques sont des adaptateurs vers UN document canonique, jamais
 * des copies par onglet. LIVE reste le moteur GPS ; son résultat rejoint la
 * projection commune AVANT le rendu de Pneus, Météo, Tenue, Analyse et Agenda.
 */
const USER_STORE = userContextStore({ read: lsGet, write: (k, v) => {
  if (v == null) APP_STORAGE.removeItem(k); else APP_STORAGE.setItem(k, v);
} });
['GPS', 'PLACE', 'TRIPSTART', 'TRIPEND', 'RETURNHOME'].forEach((name, i) => {
  const field = ['gps', 'place', 'tripStart', 'tripEnd', 'returnHome'][i];
  Object.defineProperty(window, name, { configurable: false, get: () => USER_STORE.state[field], set: v => { USER_STORE.state[field] = v; } });
});
const APP_CONTEXT = { snapshot: null, planned: [], trips: [], live: null, rendering: false, ready: false, weatherPreview: null, calendarLegs: null };
function appAction(fn) { return USER_STORE.transaction(fn); }
function appGpsFloor() { return Math.max(PLACE.conf && PLACE.conf.at || 0, TRIPSTART && TRIPSTART.at || 0, USER_STORE.state.lastDeparture && USER_STORE.state.lastDeparture.at || 0); }
function appCurrentGps() { return GPS && !GPS.placePending && !PLACE_HOLD && GPS.acc <= PLACE_ACC_GPS && GPS.t >= appGpsFloor() && Date.now() - GPS.t <= 10 * 60e3 ? GPS : null; }
function appReopenReturn(placeId, at) {
  if (placeId !== S.work.to) return;
  const key = 'commute|' + placeToday() + 'T' + S.work.ret + '|ret', done = USER_STORE.state.done[key];
  if (done && done.at <= at) delete USER_STORE.state.done[key];
}
function appTripPlace(t, end, origin = null) {
  if (!t) return null;
  const start = end === 'from' && (origin || TRIPSTART && TRIPSTART.key === t.key && TRIPSTART.o || t.l && t.l.from);
  const p = start || (t.src === 'work' ? t.td && t.td[end === 'to' ? 'LB' : 'LA'] : (t.l || t.planL) && (t.l || t.planL)[end]);
  if (!p || !locHasCoords(p)) return null;
  const places = placeList().filter(locHasCoords);
  const known = places.find(l => p.id && l.id === p.id) || places.filter(l => distKm(l, p) <= 1.5).sort((a, b) => distKm(a, p) - distKm(b, p))[0];
  return known || { id: end === 'from' ? 'gps' : 'arrival', name: end === 'from' && start ? 'Ma position au départ' : t[end] || p.name || p.city || p.label || 'Destination', lat: p.lat, lon: p.lon };
}
function appArrival(t, how, at = Date.now()) {
  const p = appTripPlace(t, 'to'); if (!p) return;
  const chosen = appDay().nextDestination;
  if (chosen && chosen.destinationPoint && p.id === chosen.destinationPoint.id) PLACE.extra = { ...chosen.destinationPoint, at };
  if (p.id === 'arrival') {
    PLACE.extra = { ...p, at };
    const sources = [
      ...Object.values(M).map(m => ({ m, t: m && RAW[m.id] && RAW[m.id].t })),
      ...Object.values(CALM),
      ...Object.values(LEGM).flatMap(c => (c.models || []).map(m => ({ m, t: c.t })))
    ].filter(s => s.m && s.m.payload && locHasCoords(s.m.loc) && distKm(p, s.m.loc) <= 1.5 && Number.isFinite(s.t));
    sources.sort((a, b) => b.t - a.t);
    if (sources[0]) {
      const { m, t: fetched } = sources[0];
      RAW[p.id] = { p: m.payload, mode: m.mode, t: fetched, lat: p.lat, lon: p.lon };
      lsSet('twrc.cache.' + p.id, JSON.stringify(RAW[p.id]));
      M[p.id] = makeModel(m.payload, m.mode, p);
    }
  }
  PLACE.conf = how === 'auto' ? null : { placeId: p.id, at, how: 'arrival', day: placeToday() };
  PLACE.last = { placeId: p.id, at, source: how === 'auto' ? 'gps' : 'manual' };
  USER_STORE.state.lastDeparture = null;
  USER_STORE.state.lastArrival = { key: t.key, name: t.name || p.name, at, placeId: p.id };
  if (how !== 'auto') appConfirmedPlace(p.id, at);
  else { const day = appDay(); day.arrivedAt = at; day.nextDestination = null; }
  appReopenReturn(p.id, at);
  APP_CONTEXT.weatherPreview = null; UI.loc = p.id;
}
function appDeparture(t, s) {
  debriefDeparture(t, s);
  const from = appTripPlace(t, 'from', s.o), to = appTripPlace(t, 'to');
  s.trip = { src: t.src, key: t.key, dep: t.planDep || t.dep, arr: t.arr, dir: t.td && t.td.dir,
    eventId: t.e ? TripCancel.eventId(t.e) : null, fromId: from && from.id, toId: to && to.id };
  if (PLACE.conf) PLACE.last = { placeId: PLACE.conf.placeId, at: s.at, source: 'départ annoncé' };
  appDay().departedAt = s.at;
  PLACE.conf = null; USER_STORE.state.lastDeparture = null; APP_CONTEXT.weatherPreview = null; TRIPSTART = s;
}
function appWorkTripData(dir, off, departure = null) {
  const r = tripData(dir, off, departure); if (!r.err || r.cancelled) return r;
  // Les horaires et destinations sont des faits de planning, indépendants de
  // la disponibilité météo au premier lancement ou hors ligne.
  const w = S.work;
  const clock = nowIn('Europe/Paris'), today = clock.slice(0, 10), time = dir === 'go' ? w.dep : w.ret;
  if (off === 'auto') off = appCommuteOff(today, time, clock.slice(11, 16), w.days);
  if (!Number.isFinite(off)) return r;
  const dep = departure || addMin(today + 'T00:00', off * 1440 + toMin(time)); if (workCancelled(dep.slice(0, 10))) return r;
  const ends = appCommuteEndpoints(dir, dep.slice(0, 10), 'commute|' + dep.slice(0, 10) + 'T' + time + '|' + dir), LA = ends.from, LB = ends.to;
  if (!locHasCoords(LA) || !locHasCoords(LB)) return r;
  return { dir, LA, LB, fromName: LA.name, toName: LB.name, dep, arr: addMin(dep, +w.durMin || 30), seq: [], A: null, B: null, noWeather: true };
}
function appRefreshContext({ persist = true } = {}) {
  appDay();
  USER_STORE.state.debrief = Debrief.clean(USER_STORE.state.debrief);
  const c = placeNow();
  if (!APP_CONTEXT.weatherPreview) {
    if (c.place && ['manual', 'last'].includes(c.source)) UI.loc = c.place.id;
    else if (c.source === 'gps' && GPS && !PLACE_HOLD) UI.loc = 'gps';
    else if (c.coords && GPS && !PLACE_HOLD) UI.loc = 'gps';
    else if (c.source === 'trip') {
      const originId = TRIPSTART && TRIPSTART.trip && TRIPSTART.trip.fromId || USER_STORE.state.lastDeparture && USER_STORE.state.lastDeparture.placeId || PLACE.last && PLACE.last.placeId;
      if (appCurrentGps()) UI.loc = 'gps';
      else if (locById(originId)) UI.loc = originId;
    }
  }
  if (PLACE.extra && !M[PLACE.extra.id]) {
    const p = PLACE.extra, cached = CALM['cal' + p.lat.toFixed(2) + '_' + p.lon.toFixed(2)];
    if (cached && cached.m) M[p.id] = cached.m;
  }
  CX = computeCtx();
  APP_CONTEXT.planned = []; APP_CONTEXT.trips = appBuildTrips();
  // liveApply peut restaurer/clôturer un départ ; relire le lieu APRÈS le moteur.
  const location = placeNow(), active = LIVE.phase === 'active' ? APP_CONTEXT.trips.find(t => t.key === LIVE.key) || LIVE.base : null;
  const next = APP_CONTEXT.trips.find(t => !active || t.key !== active.key) || null;
  const leaving = USER_STORE.state.lastDeparture;
  const current = active || leaving ? appCurrentGps() || { id: 'travel', name: 'En déplacement' } : location.place || (location.source === 'gps' && GPS ? GPS : null);
  const origin = active ? appTripPlace(active, 'from') : leaving ? locById(leaving.placeId) : current;
  if (persist) USER_STORE.flush();
  APP_CONTEXT.snapshot = Object.freeze({ revision: USER_STORE.state.revision, currentLocation: current, location,
    status: active || leaving ? 'travel' : current ? current.id === S.work.to ? 'work' : current.id === S.locs[0].id ? 'home' : 'arrived' : 'unknown',
    activeTrip: active, origin,
    destination: active ? appTripPlace(active, 'to') : leaving ? null : next ? appTripPlace(next, 'to') : null,
    nextTrip: next, departureTime: active ? active.dep : next && next.dep,
    confirmation: PLACE.conf, gps: GPS, agendaEvent: (active || next) && (active || next).e || null,
    returnHome: RETURNHOME, trips: APP_CONTEXT.trips, plannedTrips: APP_CONTEXT.planned,
    dayContext: appDay(), date: placeToday(), dayType: appWorkOn(placeToday()) ? 'work' : 'off', activeCarId: appDay().activeCarId,
    destinationSource: appDay().nextDestination ? appDay().nextDestination.source : next ? 'planned' : 'unknown',
    updatedAt: USER_STORE.state.updatedAt, weatherLocationId: UI.loc });
}
USER_STORE.subscribe(() => { if (APP_CONTEXT.ready && !APP_CONTEXT.rendering) renderAll(); });
window.addEventListener('storage', e => {
  if (e.key === DeviceStorage.VAULT) { DeviceStorage.freeze(!!e.newValue); location.reload(); return; }
  if (LOCKED()) return;
  if (e.key !== USER_STORE.key || !e.newValue) return;
  APP_CONTEXT.rendering = true;
  const changed = USER_STORE.receive(e.newValue);
  APP_CONTEXT.rendering = false;
  if (changed) {
    // Toute réponse OSRM en cours appartenait au contexte précédent.
    LIVE.gen++; tripPreviewReset();
    gpsWeatherGen++; gpsNameGen++; WEATHER_REQUESTS.cancelGroup('gps');
    PLACE_FIX = PLACE_PENDING = PLACE_REJ = null; PLACE_HOLD = false; FIX = FIXPREV = null;
    if (GPS && RAW.gps && (!locHasCoords(RAW.gps.pt) || distKm(GPS, RAW.gps.pt) > 3)) {
      delete RAW.gps; delete ENSRAW.gps; delete NOWRAW.gps; delete AQRAW.gps;
    }
    Object.assign(LIVE, { key: null, phase: 'idle', base: null, manual: 0, route: null, startFix: null, lastFix: null });
    APP_CONTEXT.weatherPreview = null; rebuild(); renderAll();
  }
});
// @include app/day-context.js
