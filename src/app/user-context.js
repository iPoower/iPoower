/* Les noms historiques sont des adaptateurs vers UN document canonique, jamais
 * des copies par onglet. LIVE reste le moteur GPS ; son résultat rejoint la
 * projection commune AVANT le rendu de Pneus, Météo, Tenue, Analyse et Agenda.
 */
const USER_STORE = userContextStore({ read: lsGet, write: (k, v) => {
  if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
} });
['GPS', 'PLACE', 'TRIPSTART', 'TRIPEND', 'RETURNHOME'].forEach((name, i) => {
  const field = ['gps', 'place', 'tripStart', 'tripEnd', 'returnHome'][i];
  Object.defineProperty(window, name, { configurable: false, get: () => USER_STORE.state[field], set: v => { USER_STORE.state[field] = v; } });
});
const APP_CONTEXT = { snapshot: null, planned: [], trips: [], live: null, rendering: false, ready: false, weatherPreview: null };
function appAction(fn) { return USER_STORE.transaction(fn); }
function appTripPlace(t, end) {
  if (!t) return null;
  const p = t.src === 'work' ? t.td && t.td[end === 'to' ? 'LB' : 'LA'] : (t.planL || t.l) && (t.planL || t.l)[end];
  if (!p || !locHasCoords(p)) return null;
  const known = [...S.locs, ...S.customs].find(l => locHasCoords(l) && distKm(l, p) <= 1.5);
  return known || { id: 'arrival', name: t[end] || p.name || p.city || p.label || 'Destination', lat: p.lat, lon: p.lon };
}
function appArrival(t, how) {
  const p = appTripPlace(t, 'to'); if (!p) return;
  const at = Date.now();
  if (p.id === 'arrival') PLACE.extra = { ...p, at };
  PLACE.conf = how === 'auto' ? null : { placeId: p.id, at, how: 'arrival', day: placeToday() };
  PLACE.last = { placeId: p.id, at, source: how === 'auto' ? 'gps' : 'manual' };
  USER_STORE.state.lastArrival = { key: t.key, name: t.name || p.name, at, placeId: p.id };
  APP_CONTEXT.weatherPreview = null; UI.loc = p.id;
}
function appDeparture(t, s) {
  const from = appTripPlace(t, 'from'), to = appTripPlace(t, 'to');
  s.trip = { src: t.src, key: t.key, dep: t.planDep || t.dep, arr: t.arr, dir: t.td && t.td.dir,
    eventId: t.e ? TripCancel.eventId(t.e) : null, fromId: from && from.id, toId: to && to.id };
  if (PLACE.conf) PLACE.last = { placeId: PLACE.conf.placeId, at: s.at, source: 'départ annoncé' };
  PLACE.conf = null; APP_CONTEXT.weatherPreview = null; TRIPSTART = s;
}
function appRefreshContext() {
  const c = placeNow();
  if (!APP_CONTEXT.weatherPreview) {
    if (c.place && ['manual', 'gps', 'last'].includes(c.source)) UI.loc = c.place.id;
    else if (c.coords && GPS && !PLACE_HOLD) UI.loc = 'gps';
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
  const current = active ? GPS && !PLACE_HOLD && Date.now() - GPS.t <= 10 * 60e3 ? GPS : { id: 'travel', name: 'En déplacement' } : location.place;
  const origin = active ? appTripPlace(active, 'from') : current;
  USER_STORE.flush();
  APP_CONTEXT.snapshot = Object.freeze({ revision: USER_STORE.state.revision, currentLocation: current, location,
    status: active ? 'travel' : current ? current.id === S.work.to ? 'work' : current.id === S.locs[0].id ? 'home' : 'arrived' : 'unknown',
    activeTrip: active, origin,
    destination: active ? appTripPlace(active, 'to') : next ? appTripPlace(next, 'to') : null,
    nextTrip: next, departureTime: active ? active.dep : next && next.dep,
    confirmation: PLACE.conf, gps: GPS, agendaEvent: (active || next) && (active || next).e || null,
    returnHome: RETURNHOME, trips: APP_CONTEXT.trips, plannedTrips: APP_CONTEXT.planned,
    updatedAt: USER_STORE.state.updatedAt, weatherLocationId: UI.loc });
}
USER_STORE.subscribe(() => { if (APP_CONTEXT.ready && !APP_CONTEXT.rendering) renderAll(); });
window.addEventListener('storage', e => {
  if (e.key !== USER_STORE.key || !e.newValue) return;
  APP_CONTEXT.rendering = true;
  const changed = USER_STORE.receive(e.newValue);
  APP_CONTEXT.rendering = false;
  if (changed) {
    // Toute réponse OSRM en cours appartenait au contexte précédent.
    LIVE.gen++; tripPreviewReset();
    Object.assign(LIVE, { key: null, phase: 'idle', base: null, manual: 0, route: null, startFix: null, lastFix: null });
    APP_CONTEXT.weatherPreview = null; rebuild(); renderAll();
  }
});
