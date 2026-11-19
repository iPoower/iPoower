/* Onglet TRAJET : surface UX au-dessus du contexte canonique existant.
 * Aucune state machine parallèle : nextDestination + activeCarId restent la vérité.
 */
// @include app/route-radar.js
const TRIP_FORM = {
  bound: null, activeCarSeed: null, destinationId: null, destinationHit: null, destinationQuery: '', destinationResults: [],
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
// Une seule origine affichée partout (résumé du trajet et champ Départ), avec sa provenance :
// choix manuel enregistré > origine du trajet prévu > lieu proposé par le contexte (lieu reconnu, GPS fiable, domicile).
function tripSharedOrigin() {
  const n = appDay().nextDestination;
  if (n && n.source === 'manual' && (n.originPoint || n.originId)) {
    const point = n.originPoint || locById(n.originId);
    if (point) return { point, mode: n.originPoint ? (n.originPoint.provider === 'GPS navigateur' ? '__gps' : '__manual') : n.originId, source: 'choisi' };
  }
  const t = n ? APP_CONTEXT.trips.find(x => x.key === n.tripKey) : APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip;
  const planned = t && !t.originPending && appTripPlace(t, 'from');
  // Point prévu hors des lieux enregistrés : proposé comme adresse de départ, sans le remplacer par la position du moment.
  if (planned && locHasCoords(planned)) return planned.id && locById(planned.id) ? { point: planned, mode: planned.id, source: 'trajet prévu' }
    : { point: planned, mode: '__manual', hit: { ...planned }, source: 'trajet prévu' };
  const rec = tripRecommendedOrigin();
  return { point: rec.point, mode: rec.mode, source: 'proposé par le contexte', pending: !!(t && t.originPending) };
}
function tripDraftInit(force = false) {
  const d = appDay(), n = d.nextDestination, manual = n && n.source === 'manual' ? n : null;
  const token = manual ? manual.tripKey + '|' + manual.updatedAt : 'new';
  if (!force && TRIP_FORM.bound === token) {
    // Un changement du véhicule global actualise le brouillon sans effacer
    // départ, destination ou horaire. Un choix local reste tant que le global ne change pas.
    if (TRIP_FORM.activeCarSeed !== (d.activeCarId || null)) {
      TRIP_FORM.carId = d.activeCarId || null;   // aucune présélection : une voiture n'est jamais déduite
      TRIP_FORM.activeCarSeed = d.activeCarId || null;
    }
    return;
  }
  // Un ancien résultat réseau ne doit pas réapparaître après rechargement du formulaire.
  TRIP_FORM.destGen++; TRIP_FORM.originGen++;
  TRIP_FORM.destSearching = TRIP_FORM.originSearching = null;
  const now = localTs(Date.now()).slice(0, 16), dep = manual && manual.dep || now, rec = tripSharedOrigin();
  TRIP_FORM.bound = token;
  TRIP_FORM.destinationId = manual && manual.placeId && !manual.destinationPoint ? manual.placeId : null;
  TRIP_FORM.destinationHit = manual && manual.destinationPoint ? { ...manual.destinationPoint } : null;
  const knownDest = TRIP_FORM.destinationId && locById(TRIP_FORM.destinationId);
  TRIP_FORM.destinationQuery = TRIP_FORM.destinationHit ? (TRIP_FORM.destinationHit.address || TRIP_FORM.destinationHit.name) : knownDest ? knownDest.name : '';
  TRIP_FORM.destinationResults = [];
  TRIP_FORM.originMode = manual && manual.originPoint ? (manual.originPoint.provider === 'GPS navigateur' ? '__gps' : '__manual') : manual && manual.originId || rec.mode;
  TRIP_FORM.originHit = manual && manual.originPoint ? { ...manual.originPoint } : !manual && rec.hit ? { ...rec.hit } : null;
  TRIP_FORM.originQuery = TRIP_FORM.originHit && TRIP_FORM.originHit.provider !== 'GPS navigateur' ? (TRIP_FORM.originHit.address || TRIP_FORM.originHit.name) : '';
  TRIP_FORM.originResults = [];
  TRIP_FORM.when = manual ? dep.slice(0, 10) === now.slice(0, 10) ? (Math.abs(tsToDate(dep) - tsToDate(now)) <= 5 * 60000 ? 'now' : 'later') : 'date' : 'now';
  TRIP_FORM.date = dep.slice(0, 10); TRIP_FORM.time = dep.slice(11, 16);
  TRIP_FORM.carId = d.activeCarId || null; TRIP_FORM.message = '';   // aucune présélection : une voiture n'est jamais déduite
  TRIP_FORM.activeCarSeed = d.activeCarId || null;
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
    // Le GPS brut et une origine mémorisée ne remplacent pas le fix validé.
    // Un trajet déjà programmé reste conservé ; seule sa reprogrammation attend un GPS fiable.
    const fix = appCurrentGps();
    return fix && locHasCoords(fix)
      ? tripPoint({ ...fix, name: 'Ma position', provider: 'GPS navigateur', precision: '±' + Math.round(fix.acc || 0) + ' m' }, 'manual-origin', 'Ma position')
      : null;
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
  return { n, t, l, offline, error: !offline && !!(l && l.routeError), ready: !!(l && !l.originPending && Number.isFinite(l.km) && Number.isFinite(l.min)) };
}
// Contrôles informatifs : aucune décision d'aptitude à conduire et aucune mutation.
function tripPreflightHtml(route, car, origin, dest, departure) {
  const tire = car && car.tire;
  const tyreKnown = !!(tire && tire.type && !['unknown', 'none'].includes(tire.type) && (tire.model || tire.brand));
  const weather = RAW && RAW[UI.loc];
  const minutes = weather && weather.t ? Reliability.ageMin(weather.t) : null;
  const weatherFresh = !offlineNow() && Number.isFinite(minutes) && minutes >= 0 && minutes <= 30;
  const routeReady = !!(route && route.ready && !route.offline);
  const checked = !!(origin && dest && locHasCoords(origin) && locHasCoords(dest));
  const pendingRoute = !checked ? 'Choisir un départ et une destination valides'
    : routeReady ? 'Itinéraire enregistré · ' + f1(route.l.km) + ' km (vérifier les modifications avant de partir)'
    : route && route.offline ? 'Calcul indisponible hors ligne · dernier trajet conservé si connu'
    : 'Calcul après programmation du trajet';
  const rows = [
    ['route', routeReady ? 'disponible' : 'à vérifier', pendingRoute],
    ['meteo', weatherFresh ? 'récente' : 'à vérifier', weatherFresh
      ? 'Météo locale reçue il y a ' + (minutes < 1 ? '< 1' : Math.floor(minutes)) + ' min · pas une observation sur tout le parcours'
      : offlineNow() ? 'Hors connexion · conditions à actualiser dès que possible'
        : minutes == null ? 'Réception météo locale non vérifiée'
          : 'Dernière météo locale reçue il y a ' + (minutes < 1 ? '< 1' : Math.floor(minutes)) + ' min'],
    // Aucune voiture choisie : ne pas accuser une fiche incomplète (audit du 12/11/2026, monte pourtant renseignée).
    ['pneus', !car ? 'voiture à choisir' : tyreKnown ? 'déclarés' : 'à compléter', !car
      ? 'Choisis la voiture du trajet ci-dessus : sa monte sera contrôlée'
      : tyreKnown ? 'Monte déclarée pour ' + (car.short || car.name || 'le véhicule') + ' · pression et état à vérifier physiquement'
      : 'Monte ou modèle non renseigné · compléter la fiche du véhicule']
  ];
  const later = departure && departure > localTs(Date.now()).slice(0, 16);
  return '<section class="trip-preflight" aria-label="Contrôles avant départ"><h3>CHECK DES STANDS</h3>' +
    '<ul>' + rows.map(([key, tag, description]) => '<li data-preflight="' + key + '"><b>' +
      esc(key === 'meteo' ? 'Météo locale' : key === 'pneus' ? 'Pneus' : 'Itinéraire') + ' · ' + esc(tag) +
      '</b><span>' + esc(description) + '</span></li>').join('') + '</ul>' +
    '<p>Repères informatifs uniquement · aucun feu vert de sécurité. ' +
    (later ? 'Les conditions peuvent changer avant le départ.' : 'Vérifie visuellement ton véhicule avant de partir.') +
    '</p></section>';
}
// Onglet Trajet · « mur des stands » (19/11/2026) : état de la piste (risque global du trajet), tour du parcours (un point météo
// par ligne, même lecture qu'« État de la route »), stratégie pneus et comparatif des voitures du MÊME trajet. Lecture seule :
// rien n'est écrit, le formulaire existant reste la seule saisie. Point sélectionné = état de vue (PW).
const PW = { key: null, point: null };
function tripWallHtml(t) {
  if (!t) return '<section class="pw-wall" aria-label="Mur des stands"><p class="sub">Aucun trajet programmé ni prévu : renseigne les paramètres de course pour lancer la lecture du parcours.</p></section>';
  const key = t.key || t.dep || null; if (PW.key !== key) { PW.key = key; PW.point = null; }
  const sources = typeof f1WeatherSources === 'function' ? f1WeatherSources(t.seq) : { known: false, ageMin: null };
  const rows = F1Pure.routeTower(t.seq, { ageMin: sources.known ? sources.ageMin : null });
  const risk = typeof tripRisk === 'function' ? tripRisk(t) : null, names = ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'];
  const lv = risk && Number.isInteger(risk.lv) ? risk.lv : null;
  const banner = lv == null ? '' : '<div class="pw-flag" role="status" data-lv="' + lv + '"><b>PISTE · ' + names[lv] + '</b><span>' + esc(risk.why || 'aucune cause identifiée sur ce trajet') + '</span></div>';
  if (!rows.length) return '<section class="pw-wall" aria-label="Mur des stands">' + banner + '<p class="sub">Tour du parcours en attente : points météo du trajet pas encore reçus ou trop anciens.</p></section>';
  if (PW.point == null || PW.point >= rows.length) PW.point = rows.reduce((b, r, i) => r.level != null && (b == null || r.level > rows[b].level) ? i : b, null) ?? 0;
  const n = v => v == null ? '—' : f1(v), z = rows[PW.point];
  const vis = v => v == null ? '—' : v >= 1000 ? f1(v / 1000).replace(/,0$/, '') + ' km' : f0(v) + ' m';
  const line = (r, i) => '<button type="button" class="pw-row" data-act="pw-point" data-i="' + i + '" aria-pressed="' + (i === PW.point) + '" aria-label="' +
    esc('Point ' + (i + 1) + (r.name ? ', ' + r.name : '') + ', secteur ' + r.sector + (r.at ? ', passage ' + r.at : '') + (r.label ? ', ' + r.label : '')) + '">' +
    '<i data-lv="' + (r.level == null ? 'x' : r.level) + '">S' + r.sector + '</i><span class="pw-pt"><b>' + esc(r.name || 'Point ' + (i + 1)) + '</b><small>' + (r.km != null ? 'km ' + f0(r.km) : '') + '</small></span>' +
    '<span class="pw-mono">' + esc(r.at || '—') + '</span><span class="pw-mono">' + (r.T == null ? '—' : f0(r.T) + '°') + '</span><span class="pw-mono pw-rain" data-lv="' + (r.level == null ? 'x' : r.level) + '">' + n(r.rain) + '</span></button>';
  return '<section class="pw-wall" aria-label="Mur des stands">' + banner +
    '<div class="pw-tower"><div class="pw-tower-h"><b>TOUR DU PARCOURS</b><span>' + rows.length + ' point' + (rows.length > 1 ? 's' : '') + ' météo · prévu</span></div>' +
    '<div class="pw-cols" aria-hidden="true"><span>S</span><span>POINT</span><span>HEURE</span><span>AIR</span><span>PLUIE</span></div>' + rows.map(line).join('') +
    '<div class="pw-detail"><div><span>CHAUSSÉE</span><b>' + (z.road == null ? '—' : n(z.road) + ' °C') + '</b></div><div><span>VISIBILITÉ</span><b>' + vis(z.vis) + '</b></div><div><span>RAFALES</span><b>' + (z.gust == null ? '—' : f0(z.gust) + ' km/h') + '</b></div></div>' +
    '<p class="sub pw-note">' + esc((z.notes.length ? z.notes.join(' / ') : 'Aucun signal notable sur ce point') + ' · prévisions du modèle, pas une mesure sur la route.') + '</p></div></section>';
}
function tripStrategyHtml(t, car) {
  const label = { summer: 'été', winter: 'hiver', allseason: '4 saisons' }, letter = { summer: 'É', winter: 'H', allseason: '4S' };
  const tire = car && car.tire, type = tire && label[tire.type] ? tire.type : null;
  let tread = '';
  if (car && typeof treadAxles === 'function' && tire) { const a = treadAxles(tire); if (a && (a.av != null || a.ar != null)) tread = 'AV ' + (a.av == null ? '—' : f1(a.av)) + ' mm · AR ' + (a.ar == null ? '—' : f1(a.ar)) + ' mm'; }
  const target = tire && tire.press ? String(tire.press).slice(0, 40) : '';
  const head = !car ? '<p class="sub">Choisis la voiture du trajet dans les paramètres de course.</p>'
    : '<div class="pw-tyre"><span class="pw-compound" data-t="' + (type || 'x') + '" aria-hidden="true">' + (type ? letter[type] : '?') + '</span><div><b>' + esc((car.short || car.name || 'Voiture') + (type ? ' · pneus ' + label[type] : ' · monte à confirmer')) + '</b>' +
      (tread || target ? '<small>' + esc([tread, target ? 'cible ' + target : ''].filter(Boolean).join(' · ')) + '</small>' : '<small>Profondeur et pression à renseigner</small>') + '</div></div>';
  const res = t && Array.isArray(t.res) ? t.res.filter(r => r && r.c && r.w && Number.isFinite(r.w.score)) : [];
  const ab = res.length > 1 ? '<div class="pw-ab"><span class="pw-k">QUELLE VOITURE · MÊME TRAJET</span>' + res.map(r => '<div class="pw-bar"><b>' + esc(r.c.short || r.c.name) + '</b><span><i data-lv="' + r.w.level + '" style="width:' + Math.max(4, Math.min(100, r.w.score)) + '%"></i></span><b class="pw-mono">' + r.w.score + '</b></div>').join('') + '</div>' : '';
  const opts = t && typeof F1Pure.departureOptions === 'function' ? F1Pure.departureOptions(t.seq) : null;
  const best = opts && opts.needed && opts.best ? '<button type="button" class="pw-best" data-act="view" data-v="meteo"><span><b class="pw-mono">' + (opts.best.shift < 0 ? '−' : '+') + Math.abs(opts.best.shift) + ' h</b> · ' + esc(opts.best.label.toLowerCase() + ' au lieu de ' + opts.planned.label.toLowerCase()) + '</span><span>Meilleur départ →</span></button>' : '';
  return '<section class="pw-strat" aria-label="Stratégie pneus"><h3 class="pw-h">STRATÉGIE PNEUS</h3>' + head + ab + best + '</section>';
}
function renderTripView() {
  const el = $('#secTrip'); if (!el) return;
  el.hidden = UI.view !== 'trajet'; if (el.hidden) return;
  tripDraftInit();
  const current = appDay().nextDestination, existing = current && current.source === 'manual';
  const rec = tripSharedOrigin(), origin = tripOriginValue(), dest = tripDestinationValue();
  const points = placeList().filter(p => !/^manual-(?:origin|destination)$/.test(p.id || ''));
  const opts = [];
  if (appCurrentGps() || TRIP_FORM.originMode === '__gps') opts.push(['__gps', '📍 Ma position']);
  points.forEach(p => opts.push([p.id, (p.kind === 'work' ? '🏢 ' : p.kind === 'home' ? '🏠 ' : '📌 ') + p.name]));
  opts.push(['__manual', '⌨️ Adresse manuelle']);
  const resultButtons = (TRIP_FORM.destinationResults || []).map((h, i) => `<button class="trip-suggestion" data-act="trip-dest-pick" data-i="${i}"><b>${esc(h.name)}</b><span>${esc(h.sub || h.address || '')}</span><small>${esc(h.provider || '')}${h.precision ? ' · ' + esc(h.precision) : ''}</small></button>`).join('');
  const originButtons = (TRIP_FORM.originResults || []).map((h, i) => `<button class="trip-suggestion" data-act="trip-origin-pick" data-i="${i}"><b>${esc(h.name)}</b><span>${esc(h.sub || h.address || '')}</span><small>${esc(h.provider || '')}</small></button>`).join('');
  const quick = tripKnownDestinations().slice(0, 5).map(p => `<button class="chip" data-act="trip-dest-known" data-id="${esc(p.id)}" aria-pressed="${TRIP_FORM.destinationId === p.id}">${p.kind === 'work' ? '🏢' : p.kind === 'home' ? '🏠' : '📌'} ${esc(p.name)}</button>`).join('');
  const carOptions = `<option value="" ${TRIP_FORM.carId ? '' : 'selected'}>— Voiture du trajet à choisir —</option>` + S.cars.map(c => `<option value="${esc(c.id)}" ${TRIP_FORM.carId === c.id ? 'selected' : ''}>${esc(c.name || c.short || c.id)}</option>`).join('');
  const route = tripRouteState(), routeLine = route ? route.ready
    ? `<div class="trip-route-state ${route.offline ? 'old' : ''}"><b>${route.offline ? 'Hors connexion · dernière route connue' : 'Itinéraire prêt'}</b><span>${f1(route.l.km)} km · ~${Math.round(route.l.min)} min${route.t && route.t.wait ? ' · météo de route en attente' : ''}</span></div>`
    : route.error ? `<div class="trip-route-state old" role="status"><b>Itinéraire indisponible</b><span>Le service de calcul d’itinéraire n’a pas répondu : distance, durée et météo du parcours ne sont pas connues. Départ, destination, véhicule et horaire sont conservés ; nouvel essai automatique chaque minute.</span><button class="btn sm" data-act="trip-route-retry">Réessayer maintenant</button></div>`
    : `<div class="trip-route-state old"><b>${route.offline ? 'Hors connexion' : 'Calcul en cours'}</b><span>${route.offline ? 'Départ, destination, véhicule et horaire sont conservés. La route sera recalculée au retour du réseau.' : 'OSRM et la météo de route se préparent.'}</span></div>` : '';
  const selectedDest = dest ? `<div class="trip-selected"><b>✓ ${esc(dest.name)}</b><span>${esc(dest.address || dest.sub || '')}</span>${dest.provider ? `<small>${esc(dest.provider)}${dest.precision ? ' · ' + esc(dest.precision) : ''}</small>` : ''}</div>` : '';
  const dep = tripDepartureValue(), immediate = TRIP_FORM.when === 'now';
  const preflight = tripPreflightHtml(route, S.cars.find(c => c.id === TRIP_FORM.carId), origin, dest, dep);
  const radarTrip = current && APP_CONTEXT.trips.find(x => x.key === current.tripKey) || (!current && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip)) || null;
  const radarShell = `<div class="trip-radar">${routeRadarHtml(radarTrip)}</div>`;
  const intelligence = tyreIntelligenceHtml(S.cars.find(c => c.id === TRIP_FORM.carId) || appActiveCar(), 'trajet', CX && wxTrips(CX.m).find(t => current && t.id === current.tripKey) || null);
  const wall = tripWallHtml(radarTrip), strat = tripStrategyHtml(radarTrip, S.cars.find(c => c.id === TRIP_FORM.carId) || appActiveCar());
  const html = `<div class="mod-h"><h2>TRAJET · MUR DES STANDS</h2><span class="src obs">contexte partagé Race Control</span></div>
    <div class="pw-grid"><div class="pw-c">${wall}</div><div class="pw-s">${strat}</div><div class="pw-l"><div class="trip-form"><h3 class="pw-h">PARAMÈTRES DE COURSE</h3>
      <div class="trip-field"><span class="trip-label">Départ</span><div class="trip-origin-head"><b>${origin ? esc(origin.name) : 'Origine à choisir'}</b><span>${TRIP_FORM.originMode === rec.mode ? esc(rec.source) : 'choisi'}</span></div>
        <label class="sr-only" for="tripOriginSel">Modifier le départ</label><select id="tripOriginSel" data-trip-field="origin">${opts.map(([v,t]) => `<option value="${esc(v)}" ${TRIP_FORM.originMode === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${TRIP_FORM.originMode === '__manual' ? `<div class="trip-search"><input type="search" id="tripOriginQ" value="${esc(TRIP_FORM.originQuery)}" placeholder="Adresse de départ"><button class="btn" data-act="trip-origin-search">Rechercher</button></div><div class="trip-suggestions">${originButtons}</div>` : ''}
      </div>
      <div class="trip-field trip-destination"><label class="trip-label" for="tripDestQ">Destination</label><div class="trip-search"><input type="search" id="tripDestQ" value="${esc(TRIP_FORM.destinationQuery)}" placeholder="Où vas-tu ?" autocomplete="street-address"><button class="btn" data-act="trip-dest-search">Rechercher</button></div>
        <div class="chips trip-quick">${quick}</div><div class="trip-suggestions">${resultButtons}</div>${selectedDest}
      </div>
      <fieldset class="trip-field"><legend class="trip-label">Départ</legend><div class="trip-when">
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="now" ${TRIP_FORM.when === 'now' ? 'checked' : ''}> Maintenant</label>
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="later" ${TRIP_FORM.when === 'later' ? 'checked' : ''}> Plus tard aujourd’hui</label>
        <label><input type="radio" name="tripWhen" data-trip-field="when" value="date" ${TRIP_FORM.when === 'date' ? 'checked' : ''}> Autre date</label>
      </div><div class="trip-time">${TRIP_FORM.when === 'date' ? `<label>Date<input type="date" id="tripDate" data-trip-field="date" value="${esc(TRIP_FORM.date)}"></label>` : ''}${TRIP_FORM.when !== 'now' ? `<label>Heure<input type="time" id="tripTime" data-trip-field="time" value="${esc(TRIP_FORM.time)}"></label>` : `<span class="sub">Départ immédiat · ${esc(dep.slice(11,16))}</span>`}</div></fieldset>
      <div class="trip-field"><label class="trip-label" for="tripCar">Véhicule</label><select id="tripCar" data-trip-field="car">${carOptions}</select></div>
      ${TRIP_FORM.message ? `<p class="trip-message" role="status">${esc(TRIP_FORM.message)}</p>` : ''}${routeLine}${preflight}
      <div class="trip-actions"><button class="btn pri trip-main" data-act="trip-plan">${immediate ? 'DÉMARRER LE TRAJET' : existing ? 'METTRE À JOUR LE TRAJET' : 'PROGRAMMER LE TRAJET'}</button>
      ${existing ? '<button class="btn" data-act="trip-plan-cancel">Annuler le trajet</button>' : ''}</div>
    </div></div><div class="pw-r">${radarShell}<div class="trip-intelligence">${intelligence}</div></div></div>`;
  // Les mises à jour de la route ne doivent pas détacher les commandes pendant un appui,
  // ni remplacer les champs lorsqu'aucune valeur du formulaire n'a changé.
  const controlsHTML = html.replace(routeLine, '').replace(preflight, '').replace(radarShell, '').replace(intelligence, '').replace(wall, '').replace(strat, '');
  if (el._tripControlsHTML === controlsHTML && el.querySelector('.trip-form')) {
    const previous = el.querySelector('.trip-route-state');
    if (previous) { if (previous.outerHTML !== routeLine) previous.outerHTML = routeLine; }
    else if (routeLine) el.querySelector('.trip-actions').insertAdjacentHTML('beforebegin', routeLine);
    const preflightPanel = el.querySelector('.trip-preflight');
    if (preflightPanel && preflightPanel.outerHTML !== preflight) preflightPanel.outerHTML = preflight;
    const radarPanel = el.querySelector('.trip-radar');
    if (radarPanel && radarPanel._radarHTML !== radarShell) {
      const focus = uxFocusKey(radarPanel); radarPanel.outerHTML = radarShell;
      uxRestoreFocus(el.querySelector('.trip-radar'), focus);
    }
    // Mur des stands et stratégie : redessinés seuls (le formulaire et le focus de saisie restent en place).
    for (const [sel, part] of [['.pw-c', wall], ['.pw-s', strat]]) { const box = el.querySelector(sel); if (box && box.innerHTML !== part) {
      const a = document.activeElement, keep = a && box.contains(a) && a.dataset && a.dataset.act ? '[data-act="' + a.dataset.act + '"]' + (a.dataset.i != null ? '[data-i="' + a.dataset.i + '"]' : '') : null;
      box.innerHTML = part; const back = keep && box.querySelector(keep); if (back) back.focus({ preventScroll: true }); } }
    const panel = el.querySelector('.trip-intelligence');
    if (panel && panel.innerHTML !== intelligence) { const focus = uxFocusKey(panel); panel.innerHTML = intelligence; uxRestoreFocus(panel, focus); }
  } else {
    const active = document.activeElement;
    const focus = active && el.contains(active) && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null;
    el.innerHTML = html;
    const next = focus && document.getElementById(focus.id);
    if (next && el.contains(next)) {
      next.focus({ preventScroll: true });
      if (Number.isInteger(focus.start) && typeof next.setSelectionRange === 'function') next.setSelectionRange(focus.start, focus.end, focus.direction || 'none');
    }
  }
  const panel = el.querySelector('.trip-intelligence'); if (panel) uxRestoreFocus(panel, null);
  const radarMounted = el.querySelector('.trip-radar'); if (radarMounted) radarMounted._radarHTML = radarShell;
  el._tripControlsHTML = controlsHTML;
}
// « Bien arrivé » dans l'onglet Trajet (retour du 19/11, app iPhone) : trajet parti et arrivé depuis moins de 3 h, non clos,
// quelle que soit la destination (domicile, travail, agenda, adresse saisie). La confirmation passe par la MÊME machine que
// l'arrivée GPS ou « Bien arrivé » du trajet suivi (closeTrip, journal, lieu confirmé) : aucune autre source de vérité.
function tripArrivalPending() {
  if (DEMO.on) return null;
  if (LIVE.key && LIVE.base && LIVE.phase === 'active') return { t: LIVE.base, live: true };
  const now = liveNow(), done = USER_STORE.state.done || {};
  // Trajets affichés et trajets planifiés du jour (un aller passé quitte la liste affichée mais reste planifié).
  // Un trajet dont l'heure est passée quitte ces listes : l'aller et le retour domicile-travail du jour et les trajets agenda
  // du jour sont reconstruits comme le fait déjà la confirmation de lieu (mêmes clés, mêmes données de planning).
  const today = now.slice(0, 10), past = [];
  if (appWorkOn(today)) ['go', 'ret'].forEach(d => {
    if (today + 'T' + (d === 'go' ? S.work.dep : S.work.ret) > now) return;
    const r = appWorkTripData(d, 0);
    if (r && !r.err) past.push({ src: 'work', td: r, dep: r.dep, arr: r.arr, from: r.fromName, to: r.toName, name: appCommuteLabel(r), key: 'commute|' + r.dep + '|' + d });
  });
  if (CAL && Array.isArray(CAL.events)) CAL.events.filter(e => calendarSpatial(e) && !calendarCancelled(e)).forEach(e => effLegs(e).forEach(l => {
    if (!l || !l.dep || l.dep > now || l.dep.slice(0, 10) !== today) return;
    past.push({ src: 'cal', dep: l.dep, planDep: l.dep, planL: l, l, arr: l.arr, name: (l.k === 'ret' ? 'Retour' : 'Aller') + ' · ' + calTitle(e.t),
      from: l.from ? l.from.city || l.from.label : 'Origine', to: l.to ? l.to.city || l.to.label : 'Destination', key: calendarTripKey(e, l) });
  }));
  const seen = new Set(), all = [...(Array.isArray(BRF_SHOWN) ? BRF_SHOWN : []), ...(Array.isArray(BRF_TRIPS) ? BRF_TRIPS : []), ...past].filter(t => t && t.key && !seen.has(t.key) && seen.add(t.key));
  const list = all.filter(t => t && t.key && t.dep && t.dep <= now && !done[t.key] && !LIVE.done[t.key]
    && liveMin(t.arr || t.dep, now) <= 180 && !(PLACE.conf && (appTripPlace(t, 'to') || {}).id === PLACE.conf.placeId && PLACE.conf.at >= tsToDate(t.dep)));
  const t = list.sort((a, b) => String(b.dep).localeCompare(String(a.dep)))[0];
  return t ? { t, live: false } : null;
}
function tripArrivalHtml() {
  const x = tripArrivalPending(); if (!x) return '';
  const t = x.t, to = appTripPlace(t, 'to'), arr = /T\d{2}:\d{2}/.test(t.arr || '') ? t.arr.slice(11, 16) : '';
  return '<div class="pw-arrive" role="group" aria-label="Arrivée du trajet"><span><b>ARRIVÉE À CONFIRMER</b><small>' + esc((t.from || 'Départ') + ' → ' + (to && to.name || t.to || 'Destination')) +
    (arr ? ' · arrivée prévue ' + arr : '') + '</small></span><button type="button" class="btn pri" data-act="trip-arrived-key" data-key="' + esc(t.key) + '">✅ Bien arrivé</button></div>';
}
function renderTripSummary() {
  const el = $('#secTripSummary'); if (!el) return;
  const n = appDay().nextDestination;
  const t = n ? APP_CONTEXT.trips.find(x => x.key === n.tripKey) : UI.view === 'trajet' && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  if (!['pneus', 'trajet'].includes(UI.view) || (!n && !t) || n && n.source === 'pending') { el.hidden = true; el.innerHTML = ''; return; }
  const shared = tripSharedOrigin(), from = shared.pending ? null : shared.point, to = n && (n.destinationPoint || locById(n.placeId)) || t && appTripPlace(t, 'to');
  const car = appActiveCar(), l = t && (t.l || t.planL), route = l && !l.originPending && Number.isFinite(l.km) ? `${f1(l.km)} km · ~${Math.round(l.min)} min` : offlineNow() ? 'route à recalculer au retour du réseau' : l && l.routeError ? 'itinéraire indisponible pour le moment' : 'route en préparation';
  const address = to && (to.address || to.sub) || '';
  el.hidden = false;
  // Onglet Trajet : en-tête du mur des stands, compte à rebours du départ (même minuterie que les autres cartes).
  const depTs = n && n.dep || t && t.dep || '', wall = UI.view === 'trajet';
  el.classList.toggle('pw-head', wall);
  el.innerHTML = (wall ? tripArrivalHtml() : '') + `<div class="trip-summary-head"><span class="trip-label">${wall ? '' : '🧭 '}${t && t === APP_CONTEXT.snapshot.activeTrip ? 'TRAJET EN COURS' : 'PROCHAIN TRAJET'}</span><b class="mono">${esc(tripWhen(depTs) || '—')}</b></div>
    ${wall && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(depTs) && !(t && t === APP_CONTEXT.snapshot.activeTrip) ? '<div class="pw-count">' + cdSpan(depTs.slice(0, 16)) + '</div>' : ''}
    <div class="trip-summary-route"><b>${esc(from && from.name || 'Origine à confirmer')} → ${esc(to && to.name || 'Destination à confirmer')}</b>${address ? `<span>${esc(address)}</span>` : ''}${from ? `<small class="trip-origin-src">Départ : ${esc(shared.source)}</small>` : ''}</div>
    <div class="trip-summary-meta"><span>🚗 ${esc(appCarLabel().text)}</span><span>${esc(route)}</span></div>
    ${UI.view === 'trajet' ? '<a class="btn pri" href="#secTrip">Modifier le trajet</a>' : '<div class="chips"><button class="btn sm" data-act="view" data-v="trajet">Voir / modifier le trajet</button></div>'}`;
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
  // Une voiture choisie ici est un choix explicite : elle devient la voiture active, enregistrée tout de suite comme
  // « Choisir pour mes trajets » du Garage (une seule vérité). « — à choisir — » ne retire jamais la voiture active.
  if (target.dataset.tripField === 'car' && TRIP_FORM.carId && TRIP_FORM.carId !== (appDay().activeCarId || null) && appSetCar(TRIP_FORM.carId) !== false)
    TRIP_FORM.activeCarSeed = TRIP_FORM.carId;
  TRIP_FORM.message = ''; renderTripView();
}
function tripProgram(button) {
  tripCaptureForm();
  const origin = tripOriginValue(), dest = tripDestinationValue(), dep = tripDepartureValue(), now = localTs(Date.now()).slice(0, 16);
  if (!origin || !locHasCoords(origin)) {
    TRIP_FORM.message = TRIP_FORM.originMode === '__gps'
      ? 'Position GPS indisponible ou non fiable : actualise la localisation ou choisis un autre départ.'
      : 'Choisis un départ valide.';
    renderTripView(); return;
  }
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
    if (e.target.value !== TRIP_FORM.destinationQuery) { TRIP_FORM.destinationQuery = e.target.value; TRIP_FORM.destGen++; TRIP_FORM.destSearching = null; TRIP_FORM.destinationId = null; TRIP_FORM.destinationHit = null; TRIP_FORM.destinationResults = [];
      // Effacer aussi le DOM immédiatement, sans rerendre le formulaire (focus et curseur conservés).
      e.target.closest('.trip-field')?.querySelector('.trip-suggestions')?.replaceChildren();
      e.target.closest('.trip-field')?.querySelector('.trip-selected')?.remove();
      const b = e.target.closest('.trip-field')?.querySelector('[data-act=trip-dest-search]'); if (b) b.textContent = 'Rechercher'; }
  } else if (e.target && e.target.id === 'tripOriginQ') {
    if (e.target.value !== TRIP_FORM.originQuery) { TRIP_FORM.originQuery = e.target.value; TRIP_FORM.originGen++; TRIP_FORM.originSearching = null; TRIP_FORM.originHit = null; TRIP_FORM.originResults = [];
      e.target.closest('.trip-field')?.querySelector('.trip-suggestions')?.replaceChildren();
      const b = e.target.closest('.trip-field')?.querySelector('[data-act=trip-origin-search]'); if (b) b.textContent = 'Rechercher'; }
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target && e.target.id === 'tripDestQ') { e.preventDefault(); const b = $('#secTrip [data-act="trip-dest-search"]'); if (b) b.click(); }
  if (e.target && e.target.id === 'tripOriginQ') { e.preventDefault(); const b = $('#secTrip [data-act="trip-origin-search"]'); if (b) b.click(); }
});
