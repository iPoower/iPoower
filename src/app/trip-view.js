/* Onglet TRAJET : surface UX au-dessus du contexte canonique existant.
 * Aucune state machine parallèle : nextDestination + activeCarId restent la vérité.
 */
const TRIP_FORM = {
  bound: null, destinationId: null, destinationHit: null, destinationQuery: '', destinationResults: [],
  originMode: null, originHit: null, originQuery: '', originResults: [], when: 'now', date: '', time: '', carId: null,
  message: '', destGen: 0, originGen: 0
};
function tripPoint(v, id, fallback) {
  if (!v || !locHasCoords(v)) return null;
  return DayContext.cleanPoint({ id: id || v.id, name: v.name || v.label || fallback || 'Lieu', address: v.address || v.name || v.label || '',
    lat: +v.lat, lon: +v.lon, provider: v.provider || '', precision: v.precision || '', ...frAdmin(v) }, id || 'manual-point');
}
function tripRecommendedOrigin() {
  const c = placeNow(), p = c && c.place;
  if (p && locHasCoords(p)) return { mode: p.id, point: p };
  const fix = appCurrentGps();
  if (fix && locHasCoords(fix)) return { mode: '__gps', point: { id: 'manual-origin', name: 'Ma position', lat: fix.lat, lon: fix.lon, provider: 'GPS navigateur', precision: '±' + Math.round(fix.acc || 0) + ' m' } };
  const home = S.locs && S.locs[0];
  return { mode: home && home.id || '', point: home || null };
}
function tripDraftInit(force = false) {
  const d = appDay(), n = d.nextDestination, manual = n && n.source === 'manual' ? n : null;
  const token = manual ? manual.tripKey + '|' + manual.updatedAt : 'new';
  if (!force && TRIP_FORM.bound === token) return;
  // Un ancien résultat réseau ne doit pas réapparaître après rechargement du formulaire.
  TRIP_FORM.destGen++; TRIP_FORM.originGen++;
  TRIP_FORM.destSearching = TRIP_FORM.originSearching = null;
  const now = localTs(Date.now()).slice(0, 16), dep = manual && manual.dep || now, rec = tripRecommendedOrigin();
  TRIP_FORM.bound = token;
  TRIP_FORM.destinationId = manual && manual.placeId && !manual.destinationPoint ? manual.placeId : null;
  TRIP_FORM.destinationHit = manual && manual.destinationPoint ? { ...manual.destinationPoint } : null;
  const knownDest = TRIP_FORM.destinationId && locById(TRIP_FORM.destinationId);
  TRIP_FORM.destinationQuery = TRIP_FORM.destinationHit ? (TRIP_FORM.destinationHit.address || TRIP_FORM.destinationHit.name) : knownDest ? knownDest.name : '';
  TRIP_FORM.destinationResults = [];
  TRIP_FORM.originMode = manual && manual.originPoint ? (manual.originPoint.provider === 'GPS navigateur' ? '__gps' : '__manual') : manual && manual.originId || rec.mode;
  TRIP_FORM.originHit = manual && manual.originPoint ? { ...manual.originPoint } : null;
  TRIP_FORM.originQuery = TRIP_FORM.originHit && TRIP_FORM.originHit.provider !== 'GPS navigateur' ? (TRIP_FORM.originHit.address || TRIP_FORM.originHit.name) : '';
  TRIP_FORM.originResults = [];
  TRIP_FORM.when = manual ? dep.slice(0, 10) === now.slice(0, 10) ? (Math.abs(tsToDate(dep) - tsToDate(now)) <= 5 * 60000 ? 'now' : 'later') : 'date' : 'now';
  TRIP_FORM.date = dep.slice(0, 10); TRIP_FORM.time = dep.slice(11, 16);
  TRIP_FORM.carId = d.activeCarId || S.cars[0] && S.cars[0].id || null; TRIP_FORM.message = '';
}
function tripCaptureForm() {
  const dest = $('#tripDestQ'), origin = $('#tripOriginQ'), os = $('#tripOriginSel'), car = $('#tripCar'), date = $('#tripDate'), time = $('#tripTime');
  const when = document.querySelector('input[name="tripWhen"]:checked');
  if (dest) TRIP_FORM.destinationQuery = dest.value;
  if (origin) TRIP_FORM.originQuery = origin.value;
  if (os) TRIP_FORM.originMode = os.value;
  if (car) TRIP_FORM.carId = car.value || null;
  if (date) TRIP_FORM.date = date.value;
  if (time) TRIP_FORM.time = time.value;
  if (when) TRIP_FORM.when = when.value;
}
function tripOriginValue() {
  if (TRIP_FORM.originMode === '__manual') return tripPoint(TRIP_FORM.originHit, 'manual-origin', 'Départ manuel');
  if (TRIP_FORM.originMode === '__gps') {
    const fix = appCurrentGps() || GPS;
    return fix && locHasCoords(fix) ? tripPoint({ ...fix, name: 'Ma position', provider: 'GPS navigateur', precision: '±' + Math.round(fix.acc || 0) + ' m' }, 'manual-origin', 'Ma position') : tripPoint(TRIP_FORM.originHit, 'manual-origin', 'Ma position');
  }
  return locById(TRIP_FORM.originMode);
}
function tripDestinationValue() {
  return TRIP_FORM.destinationId ? locById(TRIP_FORM.destinationId) : tripPoint(TRIP_FORM.destinationHit, 'manual-destination', 'Destination');
}
function tripDepartureValue() {
  const now = localTs(Date.now()).slice(0, 16), today = now.slice(0, 10);
  if (TRIP_FORM.when === 'now') return now;
  if (TRIP_FORM.when === 'later') return today + 'T' + (TRIP_FORM.time || S.work.ret || now.slice(11, 16));
  return (TRIP_FORM.date || today) + 'T' + (TRIP_FORM.time || now.slice(11, 16));
}
function tripKnownDestinations() {
  const current = tripOriginValue();
  return placeList().filter(p => p && locHasCoords(p) && (!current || p.id !== current.id) && !/^manual-(?:origin|destination)$/.test(p.id || ''));
}
function tripRouteState() {
  const n = appDay().nextDestination, t = n && APP_CONTEXT.trips.find(x => x.key === n.tripKey);
  if (!n || n.source !== 'manual') return null;
  const l = t && (t.l || t.planL), offline = offlineNow();
  return { n, t, l, offline, ready: !!(l && !l.originPending && Number.isFinite(l.km) && Number.isFinite(l.min)) };
}
function renderTripView() {
  const el = $('#secTrip'); if (!el) return;
  el.hidden = UI.view !== 'trajet'; if (el.hidden) return;
  tripDraftInit();
  const current = appDay().nextDestination, existing = current && current.source === 'manual';
  const rec = tripRecommendedOrigin(), origin = tripOriginValue(), dest = tripDestinationValue();
  const points = placeList().filter(p => !/^manual-(?:origin|destination)$/.test(p.id || ''));
  const opts = [];
  if (appCurrentGps() || TRIP_FORM.originMode === '__gps') opts.push(['__gps', '📍 Ma position']);
  points.forEach(p => opts.push([p.id, (p.kind === 'work' ? '🏢 ' : p.kind === 'home' ? '🏠 ' : '📌 ') + p.name]));
  opts.push(['__manual', '⌨️ Adresse manuelle']);
  const resultButtons = (TRIP_FORM.destinationResults || []).map((h, i) => `<button class="trip-suggestion" data-act="trip-dest-pick" data-i="${i}"><b>${esc(h.name)}</b><span>${esc(h.sub || h.address || '')}</span><small>${esc(h.provider || '')}${h.precision ? ' · ' + esc(h.precision) : ''}</small></button>`).join('');
  const originButtons = (TRIP_FORM.originResults || []).map((h, i) => `<button class="trip-suggestion" data-act="trip-origin-pick" data-i="${i}"><b>${esc(h.name)}</b><span>${esc(h.sub || h.address || '')}</span><small>${esc(h.provider || '')}</small></button>`).join('');
  const quick = tripKnownDestinations().slice(0, 5).map(p => `<button class="chip" data-act="trip-dest-known" data-id="${esc(p.id)}" aria-pressed="${TRIP_FORM.destinationId === p.id}">${p.kind === 'work' ? '🏢' : p.kind === 'home' ? '🏠' : '📌'} ${esc(p.name)}</button>`).join('');
  const carOptions = S.cars.map(c => `<option value="${esc(c.id)}" ${TRIP_FORM.carId === c.id ? 'selected' : ''}>${esc(c.name || c.short || c.id)}</option>`).join('');
  const route = tripRouteState(), routeLine = route ? route.ready
    ? `<div class="trip-route-state ${route.offline ? 'old' : ''}"><b>${route.offline ? 'Hors connexion · dernière route connue' : 'Itinéraire prêt'}</b><span>${f1(route.l.km)} km · ~${Math.round(route.l.min)} min${route.t && route.t.wait ? ' · météo de route en attente' : ''}</span></div>`
    : `<div class="trip-route-state old"><b>${route.offline ? 'Hors connexion' : 'Calcul en cours'}</b><span>${route.offline ? 'Départ, destination, véhicule et horaire sont conservés. La route sera recalculée au retour du réseau.' : 'OSRM et la météo de route se préparent.'}</span></div>` : '';
  const selectedDest = dest ? `<div class="trip-selected"><b>✓ ${esc(dest.name)}</b><span>${esc(dest.address || dest.sub || '')}</span>${dest.provider ? `<small>${esc(dest.provider)}${dest.precision ? ' · ' + esc(dest.precision) : ''}</small>` : ''}</div>` : '';
  const dep = tripDepartureValue(), immediate = TRIP_FORM.when === 'now';
  el.innerHTML = `<div class="mod-h"><h2>🧭 TRAJET</h2><span class="src obs">contexte partagé Race Control</span></div>
    <div class="trip-form">
      <div class="trip-field"><span class="trip-label">Départ</span><div class="trip-origin-head"><b>${origin ? esc(origin.name) : 'Origine à choisir'}</b><span>${TRIP_FORM.originMode === rec.mode ? 'proposé par le contexte' : 'choisi'}</span></div>
        <label class="sr-only" for="tripOriginSel">Modifier le départ</label><select id="tripOriginSel" data-trip-field="origin">${opts.map(([v,t]) => `<option value="${esc(v)}" ${TRIP_FORM.originMode === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${TRIP_FORM.originMode === '__manual' ? `<div class="trip-search"><input type="search" id="tripOriginQ" value="${esc(TRIP_FORM.originQuery)}" placeholder="Adresse de départ"><button class="btn" data-act="trip-origin-search">Rechercher</button></div><div class="trip-suggestions">${originButtons}</div>` : ''}
      </div>
      <div class="trip-field trip-destination"><label class="trip-label" for="tripDestQ">Destination</label><div class="trip-search"><input type="search" id="tripDestQ" value="${esc(TRIP_FORM.destinationQuery)}" placeholder="Où allez-vous ?" autocomplete="street-address"><button class="btn" data-act="trip-dest-search">Rechercher</button></div>
        <div class="chips trip-quick">${quick}</div><div class="trip-suggestions">${resultButtons}</div>${selectedDest}
      </div>
      <fieldset class="trip-field"><legend class="trip-label">Départ</legend><div class="trip-when">
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="now" ${TRIP_FORM.when === 'now' ? 'checked' : ''}> Maintenant</label>
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="later" ${TRIP_FORM.when === 'later' ? 'checked' : ''}> Plus tard aujourd’hui</label>
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="date" ${TRIP_FORM.when === 'date' ? 'checked' : ''}> Autre date</label>
      </div><div class="trip-time">${TRIP_FORM.when === 'date' ? `<label>Date<input type="date" id="tripDate" data-trip-field="date" value="${esc(TRIP_FORM.date)}"></label>` : ''}${TRIP_FORM.when !== 'now' ? `<label>Heure<input type="time" id="tripTime" data-trip-field="time" value="${esc(TRIP_FORM.time)}"></label>` : `<span class="sub">Départ immédiat · ${esc(dep.slice(11,16))}</span>`}</div></fieldset>
      <div class="trip-field"><label class="trip-label" for="tripCar">Véhicule</label><select id="tripCar" data-trip-field="car">${carOptions}</select></div>
      ${TRIP_FORM.message ? `<p class="trip-message" role="status">${esc(TRIP_FORM.message)}</p>` : ''}${routeLine}
      <div class="trip-actions"><button class="btn pri trip-main" data-act="trip-plan">${immediate ? 'DÉMARRER LE TRAJET' : existing ? 'METTRE À JOUR LE TRAJET' : 'PROGRAMMER LE TRAJET'}</button>
      ${existing ? '<button class="btn" data-act="trip-plan-cancel">Annuler le trajet</button>' : ''}</div>
    </div>`;
}
function renderTripSummary() {
  const el = $('#secTripSummary'); if (!el) return;
  const n = appDay().nextDestination;
  if (UI.view !== 'pneus' || !n || n.source === 'pending') { el.hidden = true; el.innerHTML = ''; return; }
  const t = APP_CONTEXT.trips.find(x => x.key === n.tripKey), from = n.originPoint || locById(n.originId) || t && appTripPlace(t, 'from'), to = n.destinationPoint || locById(n.placeId) || t && appTripPlace(t, 'to');
  const car = appActiveCar(), l = t && (t.l || t.planL), route = l && !l.originPending && Number.isFinite(l.km) ? `${f1(l.km)} km · ~${Math.round(l.min)} min` : offlineNow() ? 'route à recalculer au retour du réseau' : 'route en préparation';
  const address = to && (to.address || to.sub) || '';
  el.hidden = false;
  el.innerHTML = `<div class="trip-summary-head"><span class="trip-label">🧭 PROCHAIN TRAJET</span><b class="mono">${esc((n.dep || '').slice(11,16) || '—')}</b></div>
    <div class="trip-summary-route"><b>${esc(from && from.name || 'Origine à confirmer')} → ${esc(to && to.name || 'Destination à confirmer')}</b>${address ? `<span>${esc(address)}</span>` : ''}</div>
    <div class="trip-summary-meta"><span>🚗 ${esc(car && (car.short || car.name) || 'véhicule à choisir')}</span><span>${esc(route)}</span><span>${n.source === 'manual' ? 'manuel' : n.source}</span></div>
    <div class="chips"><button class="btn sm" data-act="view" data-v="trajet">Voir le trajet</button><button class="btn sm" data-act="view" data-v="trajet">Modifier</button></div>`;
}
async function tripSearch(kind, button) {
  tripCaptureForm();
  const origin = kind === 'origin', genKey = origin ? 'originGen' : 'destGen';
  const pendingKey = origin ? 'originSearching' : 'destSearching';
  const query = () => (origin ? TRIP_FORM.originQuery : TRIP_FORM.destinationQuery).trim();
  const q = query();
  // Un double clic n'invalide pas une recherche identique qui est déjà en cours.
  if (TRIP_FORM[pendingKey] === q) return;
  const gen = ++TRIP_FORM[genKey];
  const current = () => gen === TRIP_FORM[genKey] && query() === q;
  if (q.length < 2) { TRIP_FORM.message = 'Saisis au moins deux caractères.'; renderTripView(); return; }
  if (offlineNow()) { TRIP_FORM.message = 'Recherche d’adresse indisponible hors connexion. Un trajet déjà programmé reste conservé.'; renderTripView(); return; }
  // La même recherche ne doit jamais être déclenchée en double (bouton, touche Entrée, double-clic).
  TRIP_FORM[pendingKey] = q;
  if (button) button.textContent = 'Recherche…';
  try {
    const out = await geocode(q);
    if (!current()) return;
    if (origin) TRIP_FORM.originResults = out; else TRIP_FORM.destinationResults = out;
    TRIP_FORM.message = out.length ? '' : 'Aucun résultat : vérifie numéro, rue, ville et code postal.';
  } catch (e) {
    if (!current()) return;
    TRIP_FORM.message = 'Recherche impossible pour le moment.';
  } finally {
    if (TRIP_FORM[pendingKey] === q) TRIP_FORM[pendingKey] = null;
    if (current()) renderTripView();
  }
}
function tripPick(kind, index) {
  const list = kind === 'origin' ? TRIP_FORM.originResults : TRIP_FORM.destinationResults, h = list[+index]; if (!h) return;
  if (kind === 'origin') { TRIP_FORM.originGen++; TRIP_FORM.originHit = h; TRIP_FORM.originQuery = h.address || h.name; TRIP_FORM.originResults = []; }
  else { TRIP_FORM.destGen++; TRIP_FORM.destinationHit = h; TRIP_FORM.destinationId = null; TRIP_FORM.destinationQuery = h.address || h.name; TRIP_FORM.destinationResults = []; }
  TRIP_FORM.message = ''; renderTripView();
}
function tripPickKnown(id) {
  const p = locById(id); if (!p) return;
  TRIP_FORM.destGen++; TRIP_FORM.destinationId = id; TRIP_FORM.destinationHit = null; TRIP_FORM.destinationQuery = p.name; TRIP_FORM.destinationResults = []; TRIP_FORM.message = ''; renderTripView();
}
function tripFieldChanged(target) {
  tripCaptureForm();
  if (target.dataset.tripField === 'origin' && TRIP_FORM.originMode !== '__manual') { TRIP_FORM.originGen++; TRIP_FORM.originHit = null; TRIP_FORM.originResults = []; TRIP_FORM.originQuery = ''; }
  TRIP_FORM.message = ''; renderTripView();
}
function tripProgram(button) {
  tripCaptureForm();
  const origin = tripOriginValue(), dest = tripDestinationValue(), dep = tripDepartureValue(), now = localTs(Date.now()).slice(0, 16);
  if (!origin || !locHasCoords(origin)) { TRIP_FORM.message = 'Choisis un départ valide.'; renderTripView(); return; }
  if (!dest || !locHasCoords(dest)) { TRIP_FORM.message = 'Choisis une destination dans les suggestions.'; renderTripView(); return; }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dep) || dep < addMin(now, -5)) { TRIP_FORM.message = 'Choisis une heure de départ actuelle ou future.'; renderTripView(); return; }
  const originKnown = TRIP_FORM.originMode !== '__manual' && TRIP_FORM.originMode !== '__gps' ? origin.id : null;
  const destKnown = TRIP_FORM.destinationId ? dest.id : null;
  const key = appProgramManualTrip({ originId: originKnown, originPoint: originKnown ? null : tripPoint(origin, 'manual-origin', origin.name),
    destinationId: destKnown, destinationPoint: destKnown ? null : tripPoint(dest, 'manual-destination', dest.name), dep, carId: TRIP_FORM.carId });
  TRIP_FORM.bound = null; rebuild(); renderAll();
  if (!offlineNow()) refreshAll();
  if (TRIP_FORM.when === 'now') setTimeout(() => { appRefreshContext(); const t = APP_CONTEXT.trips.find(x => x.key === key); if (t) liveStart(key); }, 0);
  else { TRIP_FORM.message = 'Trajet programmé.'; renderTripView(); }
  if (button) commandFeedback(button, TRIP_FORM.when === 'now' ? 'Trajet démarré' : 'Trajet programmé');
}
function tripCancelPlan() {
  const key = appCancelManualTrip(); if (!key) return;
  TRIP_FORM.bound = null; TRIP_FORM.message = 'Trajet annulé. Le planning automatique reprend la main.'; rebuild(); renderAll();
}
document.addEventListener('input', e => {
  if (e.target && e.target.id === 'tripDestQ') {
    if (e.target.value !== TRIP_FORM.destinationQuery) { TRIP_FORM.destinationQuery = e.target.value; TRIP_FORM.destGen++; TRIP_FORM.destSearching = null; TRIP_FORM.destinationId = null; TRIP_FORM.destinationHit = null; TRIP_FORM.destinationResults = []; }
  } else if (e.target && e.target.id === 'tripOriginQ') {
    if (e.target.value !== TRIP_FORM.originQuery) { TRIP_FORM.originQuery = e.target.value; TRIP_FORM.originGen++; TRIP_FORM.originSearching = null; TRIP_FORM.originHit = null; TRIP_FORM.originResults = []; }
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target && e.target.id === 'tripDestQ') { e.preventDefault(); const b = $('#secTrip [data-act="trip-dest-search"]'); if (b) b.click(); }
  if (e.target && e.target.id === 'tripOriginQ') { e.preventDefault(); const b = $('#secTrip [data-act="trip-origin-search"]'); if (b) b.click(); }
});
