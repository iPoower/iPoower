// @include app/live-route-core.js
// @include app/live-route-style.js
/* Adaptateur de lecture du contexte partagé. La carte ne pilote ni l'agenda,
 * ni la destination, ni le watch GPS, ni les requêtes Route Radar/DATEX. */
const GARAGE_LIVE = { root: null, trip: null, car: null, context: null, route: null, fallback: null, requested: false,
  map: null, marker: null, progress: null, weatherLayer: null, roadLayer: null, signature: null, carId: null,
  observer: null, visible: false, generation: 0, timer: null, raf: null, playing: false, frame: null,
  fraction: 0, mode: 'simulation', compact: false, lastGood: null, gps: null, resumeAfter: 0, suspended: false, media: null };
function garageLiveHtml() {
  return '<section id="garageLiveRoute" aria-label="LIVE ROUTE · cockpit du trajet" data-mode="simulation" data-live="false" data-compact="false">' +
    '<div class="lr-top"><b class="lr-title">LIVE ROUTE</b><span class="lr-mode" role="status">SIMULATION · PRÉPARATION</span></div>' +
    '<div class="lr-hud"><div><small>DISTANCE RESTANTE</small><b data-lr-value="distance">—</b><small>km · estimation du tracé</small></div>' +
    '<div><small data-lr-value="eta-label">ARRIVÉE PRÉVUE</small><b data-lr-value="eta">—</b><small>trafic non inclus</small></div>' +
    '<div><small data-lr-value="progress-label">PARCOURS SIMULÉ</small><b data-lr-value="percent">—</b><small data-lr-value="sector">secteurs de distance</small></div></div>' +
    '<div class="lr-map-shell"><div class="lr-map" role="region" aria-label="Carte routière interactive du trajet"></div>' +
    '<p class="lr-map-note" role="status">Carte chargée à l’approche de ce panneau.</p></div>' +
    '<div class="lr-sectors" aria-label="Trois secteurs de distance égale"><span>S1 · DÉPART</span><span>S2 · PARCOURS</span><span>S3 · ARRIVÉE</span></div>' +
    '<div class="lr-actions"><button type="button" class="btn sm" data-lr="simulation" aria-pressed="true">Simulation</button>' +
    '<button type="button" class="btn sm" data-lr="gps" aria-pressed="false">GPS LIVE</button>' +
    '<button type="button" class="btn sm" data-lr="play" disabled>Lire ▶</button>' +
    '<button type="button" class="btn sm" data-lr="fit">Recentrer</button>' +
    '<button type="button" class="btn sm" data-lr="compact" aria-pressed="false">Vue compacte</button></div>' +
    '<label class="lr-scrub" for="garageRouteTime">Chronologie simulée · allure uniforme<input id="garageRouteTime" type="range" min="0" max="1000" step="1" value="0" disabled></label>' +
    '<p class="lr-clock" data-lr-value="clock">Durée et passage à confirmer.</p>' +
    '<div class="lr-weather"><b data-lr-value="weather">PRÉVISIONS PONCTUELLES</b><span data-lr-value="weather-detail">Les points météo disponibles apparaîtront sur le parcours.</span></div>' +
    '<p class="lr-trust" data-lr-value="gps-trust">Simulation indépendante de la position réelle.</p>' +
    '<p class="lr-trust" data-lr-value="road">Circulation : couverture partielle, selon les sources disponibles.</p>' +
    '<p class="lr-trust">Carte OSRM · secteurs de distance, pas des temps de passage mesurés. Le suivi nécessite l’app ouverte. Manipulations à l’arrêt ou par un passager.</p></section>';
}
function garageLiveText(selector, value) {
  const node = GARAGE_LIVE.root && GARAGE_LIVE.root.querySelector(selector);
  if (node && node.textContent !== value) node.textContent = value;
}
function garageLiveData(key, value) {
  const root = GARAGE_LIVE.root, text = String(value);
  if (root && root.dataset[key] !== text) root.dataset[key] = text;
}
function garageLiveContext(t) {
  if (!t) return null;
  const l = t.planL || (!t.running && t.l), p = x => x ? [x.lat, x.lon] : null;
  return JSON.stringify([t.key, t.to, !!(t.originPending || t.destinationPending || t.l && t.l.originPending),
    p(l && l.from || t.td && t.td.LA), p(l && l.to || t.l && t.l.to || t.td && t.td.LB)]);
}
function garageLivePause() {
  const s = GARAGE_LIVE;
  if (s.raf != null) cancelAnimationFrame(s.raf);
  s.raf = null; s.frame = null; s.playing = false;
  garageLiveText('[data-lr=play]', 'Lire ▶');
}
function garageLiveRemoveMap() {
  const s = GARAGE_LIVE;
  if (s.map) s.map.remove();
  s.map = s.marker = s.progress = s.weatherLayer = s.roadLayer = null;
  s.signature = s.carId = null;
}
function garageLiveDetach() {
  const s = GARAGE_LIVE;
  garageLivePause(); clearTimeout(s.timer); s.timer = null;
  if (s.observer) s.observer.disconnect();
  s.observer = null; s.visible = false; s.generation++;
  garageLiveRemoveMap();
  s.root = s.trip = s.car = s.route = s.fallback = s.context = s.lastGood = s.gps = null;
  s.requested = false; s.fraction = 0; s.mode = 'simulation'; s.resumeAfter = 0;
}
function garageLiveAllowed() {
  return !!(GARAGE_LIVE.root && GARAGE_LIVE.root.isConnected && GARAGE_LIVE.visible &&
    !GARAGE_LIVE.suspended && !document.hidden && UI.view === 'garage' && !LOCKED());
}
function garageLiveRadar() {
  const t = GARAGE_LIVE.trip, sourceFor = garageWeatherSources(), sources = [];
  for (const q of t && t.seq || []) {
    if (!q || !Array.isArray(q.hs)) continue;
    const source = sourceFor(q);
    if (source && !sources.some(s => s.hs === q.hs)) sources.push({ hs: q.hs, at: source.at, mode: source.mode });
  }
  return RouteRadar.snapshot({ trip: t, sources, offline: offlineNow(), now: Date.now() });
}
function garageLivePose() {
  const s = GARAGE_LIVE, active = !!(s.trip && LIVE.key === s.trip.key && LIVE.phase === 'active' &&
    (s.trip.running || APP_CONTEXT.snapshot.activeTrip && APP_CONTEXT.snapshot.activeTrip.key === s.trip.key));
  if (active) { s.mode = 'gps'; garageLivePause(); }
  s.gps = LiveRoute.gps({ route: s.route, fix: FIX, previous: s.lastGood, now: Date.now(),
    floor: Math.max(appGpsFloor(), s.resumeAfter), enabled: !!S.gpsAuto, active, held: PLACE_HOLD || !!PLACE_PENDING,
    hidden: document.hidden || s.suspended, locked: LOCKED(), demo: DEMO.on });
  if (s.gps.valid) s.lastGood = s.gps;
  const simulated = s.mode === 'simulation', fraction = simulated ? s.fraction : s.gps.valid ? s.gps.fraction : null;
  return { active, simulated, fraction, pose: simulated ? LiveRoute.at(s.route, fraction) : s.gps.valid ? s.gps : s.lastGood };
}
function garageLiveRefresh() {
  const s = GARAGE_LIVE;
  if (!s.root || !s.trip) return;
  const state = garageLivePose(), t = s.trip, r = s.route, simulated = state.simulated;
  const startedAt = TRIPSTART && TRIPSTART.key === t.key ? TRIPSTART.at : LIVE.key === t.key && LIVE.manual || null;
  const m = LiveRoute.metrics(r, state.fraction, { simulated, now: Date.now(), startedAt });
  const value = (k, v) => garageLiveText('[data-lr-value="' + k + '"]', v);
  garageLiveData('mode', s.mode); garageLiveData('live', !simulated && s.gps.valid); garageLiveData('compact', s.compact);
  garageLiveText('.lr-mode', simulated ? (DEMO.on ? 'DÉMO · ' : '') + 'SIMULATION · ' + (s.playing ? 'LECTURE ACCÉLÉRÉE' : 'PRÉPARATION') : s.gps.reason);
  value('distance', m.remaining == null ? '—' : f1(m.remaining));
  value('percent', m.percent == null ? '—' : m.percent + '%');
  value('progress-label', simulated ? 'PARCOURS SIMULÉ' : r && r.remainingRoute ? 'TRACÉ RESTANT' : 'PARCOURS GPS');
  value('eta-label', simulated ? 'ARRIVÉE PRÉVUE' : 'ETA ESTIMÉE');
  const eta = simulated ? t.arr && t.arr.slice(11, 16) : m.remainingMin == null ? null : addMin(localTs(Date.now()), Math.ceil(m.remainingMin)).slice(11, 16);
  value('eta', eta || '—');
  value('sector', m.sector == null ? 'position non actualisée' : 'secteur ' + m.sector + ' / 3');
  const elapsed = m.elapsed == null ? 'durée indisponible' : Math.floor(m.elapsed) + ' min ' + String(Math.floor(m.elapsed * 60) % 60).padStart(2, '0') + ' s';
  const passage = simulated && r && r.min != null && t.dep ? ' · passage simulé ' + addMin(t.dep, Math.round(s.fraction * r.min)).slice(11, 16) : '';
  value('clock', (simulated ? 'Durée simulée · ' : 'Écoulé depuis le départ · ') + elapsed + passage);
  value('gps-trust', simulated ? 'Lecture accélérée à allure uniforme · aucune position réelle simulée en mode GPS.' : s.gps.valid ?
    'Relevé GPS · ±' + Math.round(s.gps.acc) + ' m · reçu il y a ' + Math.max(0, Math.floor((Date.now() - s.gps.ts) / 1000)) + ' s · position projetée sur le tracé.' :
    s.gps.reason + (s.lastGood ? ' · véhicule figé à la dernière position reçue.' : ' · aucune position affichée.'));
  s.root.querySelector('[data-lr=simulation]').disabled = state.active;
  for (const mode of ['gps', 'simulation']) {
    const node = s.root.querySelector('[data-lr=' + mode + ']'), pressed = String(s.mode === mode);
    if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed);
  }
  const play = s.root.querySelector('[data-lr=play]');
  play.disabled = !simulated || !r || !!(s.media && s.media.matches);
  garageLiveText('[data-lr=play]', s.playing ? 'Pause Ⅱ' : 'Lire ▶');
  const slider = s.root.querySelector('#garageRouteTime'); slider.disabled = !simulated || !r;
  if (document.activeElement !== slider) slider.value = String(Math.round(s.fraction * 1000));
  s.root.querySelectorAll('.lr-sectors span').forEach((node, i) => {
    for (const [key, b] of Object.entries({ passed: m.sector != null && i + 1 < m.sector, current: i + 1 === m.sector }))
      if (node.dataset[key] !== String(b)) node.dataset[key] = String(b);
  });
  const radar = garageLiveRadar(), forecast = { ...radar, points: LiveRoute.forecasts(r, radar.points) }, next = LiveRoute.weather(forecast.points, state.fraction);
  value('weather', next ? (next.snow ? '🌨️ Neige prévue' : next.visibility != null && next.visibility < 1000 ? '🌫️ Visibilité réduite prévue' : next.rain > 0 ? '🌧️ Pluie prévue' : next.gust >= 40 ? '💨 Rafales prévues' : '⚠️ Vigilance prévue') : 'PRÉVISIONS PONCTUELLES');
  value('weather-detail', next ? 'Point de prévision proche du tracé · ' + (r ? 'dans ≈ ' + f1(Math.max(0, next.fraction - state.fraction) * r.km) + ' km · ' : '') +
    (next.time ? next.timeKind + ' ' + next.time.slice(11, 16) + ' · ' : '') + next.state + ' · ' + (next.age == null ? 'réception inconnue' : Math.floor(next.age) + ' min depuis réception') +
    (next.gap > 60 ? ' · point à ≈ ' + Math.round(next.gap) + ' m du tracé' : '') :
    state.fraction == null ? 'Position non actualisée : distance aux phénomènes non calculée.' : !forecast.points.length && radar.points.length ? 'Position des prévisions non comparable à ce tracé · voir les points météo ci-dessous.' :
      radar.points.length ? 'Aucun phénomène documenté aux points à venir · couverture ponctuelle, pas une mesure continue.' : 'Prévisions de trajet indisponibles · aucun phénomène inventé.');
  if (s.marker) {
    if (state.pose) {
      s.marker.setLatLng(state.pose.point); s.marker.setOpacity(1);
      const bearing = s.marker.getElement() && s.marker.getElement().querySelector('.lr-bearing');
      if (bearing) bearing.style.transform = 'rotate(' + (state.pose.bearing - 90) + 'deg)';
      if (s.progress) s.progress.setLatLngs([...r.pts.slice(0, state.pose.index), state.pose.point]);
    } else { s.marker.setOpacity(0); if (s.progress) s.progress.setLatLngs([]); }
  }
  garageLiveDrawWeather(forecast);
  garageLiveRoad(!simulated && s.gps.valid);
}
function garageLiveDrawWeather(radar) {
  const s = GARAGE_LIVE;
  if (!s.weatherLayer || !s.route) return;
  const points = radar.points.filter(p => p.routeLocated && Number.isFinite(p.fraction));
  const signature = JSON.stringify(points.map(p => [p.routePoint, p.fraction, p.tone, p.snow, p.rain, p.visibility, p.gust, p.state, p.forecastHour]));
  if (s.weatherLayer._liveSignature === signature) return;
  s.weatherLayer._liveSignature = signature; s.weatherLayer.clearLayers();
  points.slice(0, 12).forEach(p => {
    const pose = LiveRoute.at(s.route, p.fraction); if (!pose) return;
    L.marker(p.routePoint, { interactive: true, keyboard: false, icon: L.divIcon({ className: 'lr-weather-icon', iconSize: [24,24], iconAnchor: [12,12],
      html: '<span class="lr-waypoint">' + (p.snow ? '❄' : p.visibility != null && p.visibility < 1000 ? '≋' : p.rain > 0 ? '☂' : '·') + '</span>' }) })
      .bindTooltip('Prévision ponctuelle · ' + esc(p.timeKind) + ' ' + esc(p.time ? p.time.slice(11,16) : 'horaire inconnu') + ' · ' + esc(p.state) +
        (p.gap > 60 ? ' · à ≈ ' + Math.round(p.gap) + ' m du tracé' : '')).addTo(s.weatherLayer);
  });
}
function garageLiveRoad(valid) {
  const s = GARAGE_LIVE, manager = ROAD.manager;
  const allowed = valid && S.road.on === 1 && manager && manager.context && manager.context.key === s.trip.key &&
    manager.context.fix && FIX && manager.context.fix.ts === FIX.ts;
  const snapshot = allowed ? manager.snapshot({ online: !offlineNow() }) : null;
  const events = snapshot && snapshot.fresh && !snapshot.reason ? snapshot.events.filter(e => e.providerFresh).slice(0,3) : [];
  garageLiveText('[data-lr-value=road]', events.length ? events.map(e => e.title + ' · ' + roadDistance(e.distanceAhead) + ' devant · ' + (e.producer || e.provider)).join(' / ') :
    S.road.on !== 1 ? 'Circulation : source désactivée.' : 'Circulation : aucun événement vérifié disponible ici · couverture partielle.');
  if (!s.roadLayer) return;
  const signature = JSON.stringify(events.map(e => [e.id, e.updatedAt]));
  if (s.roadLayer._liveSignature === signature) return;
  s.roadLayer._liveSignature = signature; s.roadLayer.clearLayers();
  events.filter(e => Number.isFinite(e.lat) && Number.isFinite(e.lon)).forEach(e => L.circleMarker([e.lat,e.lon], { radius: 7, color: '#f4ad55', weight: 2, fillOpacity: .5 })
    .bindTooltip(esc(e.title) + ' · ' + esc(e.producer || e.provider) + ' · ' + esc(e.updatedAt || 'date inconnue')).addTo(s.roadLayer));
}
function garageLiveCarIcon() {
  return L.divIcon({ className: 'lr-vehicle-icon', iconSize: [58,28], iconAnchor: [29,14],
    html: '<div class="lr-bearing">' + garageCarSvg(GARAGE_LIVE.car && GARAGE_LIVE.car.silhouette) + '</div>' });
}
async function garageLiveEnsure() {
  const s = GARAGE_LIVE;
  if (!garageLiveAllowed() || !s.trip || s.loading) return;
  const token = s.generation, root = s.root, current = () => token === s.generation && root === s.root && garageLiveAllowed();
  s.loading = true;
  try {
    let route = LiveRoute.route(s.trip, s.fallback);
    if (!route && !s.requested && s.trip.src === 'work' && s.trip.td && !s.trip.destinationPending && !s.trip.originPending && !(s.trip.l && s.trip.l.originPending)) {
      s.requested = true;
      // Chemin cartographique historique : mêmes arrondis privés et même cache.
      const fallback = await tripGeo(s.trip);
      if (!current()) return;
      s.fallback = fallback; route = LiveRoute.route(s.trip, fallback);
    }
    if (!current()) return;
    if (!route) {
      garageLivePause(); garageLiveRemoveMap(); s.lastGood = null;
      garageLiveText('.lr-map-note', 'Tracé routier indisponible · la scène 2D reste consultable. Recentrer permet de réessayer.');
      s.route = null; garageLiveRefresh(); return;
    }
    if (route.min == null && s.trip.dep && s.trip.arr) {
      const duration = (tsToDate(s.trip.arr) - tsToDate(s.trip.dep)) / 60000;
      if (Number.isFinite(duration) && duration > 0) route.min = duration;
    }
    const signature = route.signature + '|' + isLight();
    if (s.signature !== signature) {
      garageLivePause(); garageLiveRemoveMap(); s.lastGood = null; s.fraction = 0; s.route = route;
      await loadLeaflet(); if (!current()) return;
      const node = root.querySelector('.lr-map');
      const map = L.map(node, { zoomControl: false, scrollWheelZoom: false, keyboard: true, dragging: true, touchZoom: true, attributionControl: true, zoomAnimation: false });
      s.map = map; s.signature = signature;
      const dark = !isLight(), prefix = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + (dark ? 'Dark' : 'Light') + '_Gray_';
      let loaded = false, errors = 0, fallback = false;
      const base = L.tileLayer(prefix + 'Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 18,
        attribution: '© Esri · © OpenStreetMap · Itinéraire © OSRM' }).addTo(map);
      map.createPane('routeLabels'); map.getPane('routeLabels').style.zIndex = 450; map.getPane('routeLabels').style.pointerEvents = 'none';
      const labels = L.tileLayer(prefix + 'Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 18, pane: 'routeLabels' }).addTo(map);
      const tileLoaded = () => { if (s.map === map) { loaded = true; garageLiveText('.lr-map-note', 'OSRM · ' + (route.remainingRoute ? 'tracé restant actualisé' : 'tracé routier') + ' · orientation selon le parcours'); } };
      base.on('tileload', tileLoaded);
      base.on('tileerror', () => {
        if (s.map !== map) return;
        garageLiveText('.lr-map-note', 'Fond de carte indisponible · tracé OSRM conservé');
        if (++errors >= 3 && !loaded && !fallback && !offlineNow()) {
          fallback = true; map.removeLayer(base); map.removeLayer(labels);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, className: dark ? 'osm-dark' : '', attribution: '© OpenStreetMap · Itinéraire © OSRM' })
            .on('tileload', tileLoaded).addTo(map);
        }
      });
      const color = getComputedStyle(root).getPropertyValue('--accent').trim() || '#2ecc71';
      const line = L.polyline(route.pts, { color, weight: 5, opacity: .3 }).addTo(map);
      s.progress = L.polyline([], { color, weight: 5, opacity: 1 }).addTo(map);
      [0,1/3,2/3,1].forEach((f,i) => {
        const pose = LiveRoute.at(route,f);
        L.circleMarker(pose.point, { radius: i === 0 || i === 3 ? 6 : 4, color, weight: 2, fillColor: color, fillOpacity: .8 })
          .bindTooltip(i === 0 ? 'Départ du tracé' : i === 3 ? 'Arrivée du tracé' : 'Secteur ' + (i + 1) + ' · repère de distance').addTo(map);
      });
      s.weatherLayer = L.layerGroup().addTo(map); s.roadLayer = L.layerGroup().addTo(map);
      s.marker = L.marker(route.pts[0], { icon: garageLiveCarIcon(), keyboard: false, interactive: false, zIndexOffset: 800 }).addTo(map);
      s.carId = s.car && s.car.id;
      map.fitBounds(line.getBounds(), { padding: [35,45], maxZoom: 14, animate: false });
      garageLiveText('.lr-map-note', 'OSRM · fond de carte en cours de chargement');
    } else { s.route = route; if (s.map) s.map.invalidateSize({ pan: false }); }
    if (s.marker && s.carId !== (s.car && s.car.id)) { s.marker.setIcon(garageLiveCarIcon()); s.carId = s.car && s.car.id; }
    garageLiveRefresh();
  } catch (e) {
    if (current()) garageLiveText('.lr-map-note', 'Carte indisponible · la scène 2D reste consultable. Recentrer permet de réessayer.');
  } finally { if (token === s.generation) s.loading = false; }
}
function garageLivePulse() {
  const s = GARAGE_LIVE; clearTimeout(s.timer); s.timer = null;
  if (!garageLiveAllowed()) return;
  const canonical = APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip;
  if (garageLiveContext(canonical) !== s.context) { renderGarage(); return; }
  garageLiveRefresh();
  s.timer = setTimeout(garageLivePulse, 1000);
}
function garageLiveFrame(ts) {
  const s = GARAGE_LIVE; s.raf = null;
  if (!s.playing || !garageLiveAllowed() || s.mode !== 'simulation' || s.media.matches) { garageLivePause(); return; }
  const delta = s.frame == null ? 0 : Math.min(80, Math.max(0, ts - s.frame)); s.frame = ts;
  s.fraction = Math.min(1, s.fraction + delta / 40000);
  garageLiveRefresh();
  if (s.fraction >= 1) garageLivePause();
  else s.raf = requestAnimationFrame(garageLiveFrame);
}
function garageLiveAttach(trip, car) {
  const s = GARAGE_LIVE, root = document.getElementById('garageLiveRoute'), context = garageLiveContext(trip);
  if (!root || !trip || LOCKED()) { garageLiveDetach(); return; }
  if (root !== s.root || context !== s.context) {
    garageLiveDetach(); s.loading = false; s.root = root; s.trip = trip; s.car = car; s.context = context;
    if (!s.media) {
      s.media = matchMedia('(prefers-reduced-motion: reduce)');
      s.media.addEventListener('change', () => { garageLivePause(); garageLiveRefresh(); });
    }
    root.onclick = event => {
      const button = event.target.closest('[data-lr]'); if (!button || !garageLiveAllowed()) return;
      event.preventDefault(); const a = button.dataset.lr;
      if (a === 'simulation' || a === 'gps') { garageLivePause(); s.mode = a; }
      else if (a === 'play' && !button.disabled) {
        if (s.playing) garageLivePause();
        else { if (s.fraction >= 1) s.fraction = 0; s.playing = true; s.frame = null; s.raf = requestAnimationFrame(garageLiveFrame); }
      } else if (a === 'compact') {
        s.compact = !s.compact; button.setAttribute('aria-pressed', String(s.compact));
        garageLiveData('compact', s.compact); if (s.map) s.map.invalidateSize({ pan: false });
      } else if (a === 'fit') {
        if (s.map && s.route) s.map.fitBounds(L.latLngBounds(s.route.pts), { padding: [35,45], maxZoom: 14, animate: false });
        else { s.requested = false; garageLiveEnsure(); }
      }
      garageLiveRefresh();
    };
    root.oninput = event => {
      if (event.target.id !== 'garageRouteTime' || event.target.disabled || !garageLiveAllowed()) return;
      garageLivePause(); s.fraction = Math.max(0,Math.min(1,Number(event.target.value)/1000)); garageLiveRefresh();
    };
    s.observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      for (const e of entries) if (e.target === root) {
        s.visible = e.isIntersecting;
        if (s.visible) { garageLiveEnsure(); garageLivePulse(); }
        else { garageLivePause(); clearTimeout(s.timer); s.timer = null; }
      }
    }, { threshold: .05 }) : null;
    if (s.observer) s.observer.observe(root);
    else { s.visible = true; garageLiveEnsure(); garageLivePulse(); }
  }
  s.trip = trip; s.car = car;
  garageLiveRefresh(); if (s.visible) garageLiveEnsure();
}
function garageLiveVisibility() {
  const s = GARAGE_LIVE; if (!s.root) return;
  if (document.hidden || s.suspended) {
    s.resumeAfter = Date.now() + 1; garageLivePause(); clearTimeout(s.timer); s.timer = null; garageLiveRefresh();
  } else { garageLiveEnsure(); garageLivePulse(); }
}
document.addEventListener('visibilitychange', garageLiveVisibility);
window.addEventListener('pagehide', () => { GARAGE_LIVE.suspended = true; garageLiveVisibility(); });
window.addEventListener('pageshow', () => { GARAGE_LIVE.suspended = false; garageLiveVisibility(); });
document.addEventListener('twrc-session-expired', garageLiveDetach);
