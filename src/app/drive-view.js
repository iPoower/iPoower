// Mode « EN DIRECT » (20/11/2026, maquette A « cockpit » validée) : plein écran iPhone pendant le trajet. Carte Plan IGN
// (Géoplateforme, repli OpenStreetMap) qui suit ta position, km parcourus et restants, vitesse GPS, arrivée, secteur et
// prochain danger météo du parcours. Lecture seule : réutilise le trajet canonique (LiveRoute, FIX, routeTower) ; aucun
// nouveau GPS, aucune écriture. Pas de guidage tournant par tournant ni de radars.
const DRIVE = { open: false, map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, timer: null, wake: null, wakeState: '', prevFix: null, speed: null, hist: [], follow: true };
const IGN_PLAN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const driveTrip = () => { const s = APP_CONTEXT.snapshot || {}; return s.activeTrip || s.nextTrip || null; };
function driveShell() {
  return '<div class="dv-map" role="region" aria-label="Carte du trajet en direct"></div>' +
    '<div class="dv-top"><span class="dv-tag">EN DIRECT</span><span class="dv-gps" data-dv="gps">GPS —</span>' +
    '<button type="button" class="dv-close" data-act="drive-close" aria-label="Quitter le mode en direct">✕</button></div>' +
    '<button type="button" class="dv-recenter" data-act="drive-follow" hidden>Recentrer</button>' +
    '<div class="dv-panel">' +
    '<div class="dv-km"><div><small>PARCOURUS</small><b data-dv="done">—</b><span>km</span></div><div><small>RESTANTS</small><b data-dv="left" class="dv-left">—</b><span>km</span></div></div>' +
    '<div class="dv-bar" aria-hidden="true"><i data-dv="bar"></i></div>' +
    '<div class="dv-figs"><span><small>VITESSE GPS</small><b data-dv="speed">—</b></span><span><small>ARRIVÉE</small><b data-dv="eta">—</b></span><span><small>SECTEUR</small><b data-dv="sector">—</b></span></div>' +
    '<div class="dv-next" data-dv-lv="x"><b data-dv="next">—</b><span data-dv="nextWhat"></span></div>' +
    '<p class="dv-foot" data-dv="foot"></p></div>';
}
const driveSet = (k, v) => { const el = document.querySelector('#liveDrive [data-dv="' + k + '"]'); if (el && el.textContent !== v) el.textContent = v; };
const driveKm = v => Number.isFinite(v) ? (v < 10 ? f1(v) : f0(v)) : '—';
async function driveOpen() {
  const root = $('#liveDrive'); if (!root || LOCKED()) return;
  const t = driveTrip();
  if (!t) { commandFeedback && document.activeElement && commandFeedback(document.activeElement, 'Aucun trajet en cours ni prévu'); return; }
  DRIVE.open = true; DRIVE.follow = true; root.hidden = false; root.innerHTML = driveShell(); document.documentElement.classList.add('dv-on');
  driveWake(true); driveTick();
  clearInterval(DRIVE.timer); DRIVE.timer = setInterval(driveTick, 1000);
  const close = root.querySelector('.dv-close'); if (close) close.focus({ preventScroll: true });
}
// Ouverture automatique après « Partir maintenant » : seulement quand l'itinéraire est prêt (au plus 20 s d'attente). Un
// itinéraire en échec laisse le Trajet visible, avec son message et « Réessayer » : jamais masqués par le plein écran.
function driveAutoOpen(key, left = 20, routeOf = t => LiveRoute.route(t, null)) {
  if (DRIVE.open || LOCKED()) return;
  const t = driveTrip();
  if (!t || t.key !== key) return;
  if (routeOf(t)) { driveOpen(); return; }
  if (left > 0) setTimeout(() => driveAutoOpen(key, left - 1, routeOf), 1000);
}
function driveClose() {
  const root = $('#liveDrive'); DRIVE.open = false; clearInterval(DRIVE.timer); DRIVE.timer = null; driveWake(false);
  if (DRIVE.map) { try { DRIVE.map.remove(); } catch (e) { /* carte déjà retirée */ } }
  Object.assign(DRIVE, { map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, prevFix: null, speed: null, hist: [] });
  document.documentElement.classList.remove('dv-on');
  if (root) { root.hidden = true; root.innerHTML = ''; }
}
// Écran maintenu allumé (Wake Lock) : demandé à l'ouverture, redemandé au retour au premier plan ; état affiché, jamais promis.
async function driveWake(on) {
  try {
    if (!on) { if (DRIVE.wake) await DRIVE.wake.release(); DRIVE.wake = null; return; }
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') { DRIVE.wakeState = 'écran : verrouillage automatique possible'; return; }
    DRIVE.wake = await navigator.wakeLock.request('screen'); DRIVE.wakeState = 'écran maintenu allumé';
    DRIVE.wake.addEventListener && DRIVE.wake.addEventListener('release', () => { DRIVE.wakeState = 'écran : verrouillage automatique possible'; });
  } catch (e) { DRIVE.wakeState = 'écran : verrouillage automatique possible'; }
}
document.addEventListener('visibilitychange', () => { if (DRIVE.open && !document.hidden) driveWake(true); });
document.addEventListener('keydown', e => { if (DRIVE.open && e.key === 'Escape') driveClose(); });
async function driveMap(route, dark) {
  const root = $('#liveDrive'), node = root && root.querySelector('.dv-map'); if (!node || DRIVE.map) return;
  try { await loadLeaflet(); } catch (e) { driveSet('foot', 'Carte indisponible · chiffres du trajet conservés'); return; }
  if (!DRIVE.open || DRIVE.map || !node.isConnected) return;
  const map = L.map(node, { zoomControl: false, attributionControl: true, zoomAnimation: false, keyboard: false });
  DRIVE.map = map;
  let loaded = false, errors = 0;
  const base = L.tileLayer(IGN_PLAN, { maxZoom: 19, maxNativeZoom: 19, className: dark ? 'dv-dark' : '', attribution: '© IGN Géoplateforme · Itinéraire © OSRM' }).addTo(map);
  base.on('tileload', () => { loaded = true; });
  base.on('tileerror', () => {
    if (++errors >= 3 && !loaded && DRIVE.map === map && !map._osm) {
      map._osm = 1; map.removeLayer(base);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: dark ? 'osm-dark' : '', attribution: '© OpenStreetMap · Itinéraire © OSRM' }).addTo(map);
    }
  });
  if (route) { DRIVE.line = L.polyline(route.pts, { color: '#5fb0e8', weight: 6, opacity: .45 }).addTo(map); DRIVE.done = L.polyline([], { color: '#5fb0e8', weight: 6, opacity: 1 }).addTo(map); map.fitBounds(DRIVE.line.getBounds(), { padding: [24, 24] }); }
  else map.setView([46.6, 2.4], 6);
  DRIVE.marker = L.marker(route ? route.pts[0] : [46.6, 2.4], { icon: L.divIcon({ className: 'dv-car', html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false }).addTo(map);
  map.on('dragstart', () => { DRIVE.follow = false; const b = root.querySelector('.dv-recenter'); if (b) b.hidden = false; });
}
function driveTick() {
  if (!DRIVE.open) return;
  const t = driveTrip();
  if (!t) { driveSet('foot', 'Aucun trajet en cours ni prévu'); return; }
  const route = LiveRoute.route(t, null);
  if (DRIVE.key !== t.key) { DRIVE.key = t.key; DRIVE.route = route; DRIVE.last = null; DRIVE.hist = []; if (DRIVE.map) { DRIVE.map.remove(); DRIVE.map = null; } }
  if (!DRIVE.map) driveMap(route, !isLight());
  const active = !!(LIVE.key === t.key && LIVE.phase === 'active');
  const g = LiveRoute.gps({ route, fix: FIX, previous: DRIVE.last, now: Date.now(), floor: appGpsFloor(), enabled: !!S.gpsAuto, active,
    held: PLACE_HOLD || !!PLACE_PENDING, hidden: document.hidden, locked: LOCKED(), demo: DEMO.on });
  if (g.valid) DRIVE.last = g;
  const pose = g.valid ? g : DRIVE.last, fraction = pose ? pose.fraction : active ? null : 0;
  const m = LiveRoute.metrics(route, fraction, { now: Date.now() });
  const total = route ? route.km : null;
  driveSet('done', Number.isFinite(fraction) && Number.isFinite(total) ? driveKm(total * fraction) : '—');
  driveSet('left', Number.isFinite(m.remaining) ? driveKm(m.remaining) : Number.isFinite(total) && !active ? driveKm(total) : '—');
  const bar = document.querySelector('#liveDrive [data-dv="bar"]'); if (bar) bar.style.width = (Number.isFinite(m.percent) ? m.percent : 0) + '%';
  // Vitesse : celle du GPS quand il la fournit, sinon la distance PARCOURUE sur le tracé pendant les 90 dernières secondes
  // (relevés valides seulement, au moins 5 s d'écart) ; jamais inventée ni calculée entre deux relevés identiques.
  if (g.valid && Number.isFinite(total)) {
    const h = DRIVE.hist || (DRIVE.hist = []); if (!h.length || h[h.length - 1].ts !== g.ts) h.push({ ts: g.ts, km: total * g.fraction });
    while (h.length && g.ts - h[0].ts > 90e3) h.shift();
  }
  const fixV = FIX && Number.isFinite(FIX.speed) && FIX.speed >= 0 && FIX.acc <= 30 ? FIX.speed * 3.6 : null, h = DRIVE.hist || [];
  const old = h.length > 1 ? h[0] : null, cur = h[h.length - 1];
  DRIVE.speed = fixV != null ? fixV : old && cur.ts - old.ts >= 5e3 ? Math.max(0, cur.km - old.km) / ((cur.ts - old.ts) / 3600e3) : null;
  if (!(DRIVE.speed < 300)) DRIVE.speed = null;
  driveSet('speed', active && g.valid && Number.isFinite(DRIVE.speed) ? f0(DRIVE.speed) : '—');
  const eta = active && Number.isFinite(m.remainingMin) ? addMin(liveNow().slice(0, 16), Math.round(m.remainingMin)) : t.arr;
  driveSet('eta', eta && /T\d{2}:\d{2}/.test(eta) ? eta.slice(11, 16) : '—');
  driveSet('sector', m.sector ? 'S' + m.sector : '—');
  driveSet('gps', active ? (g.valid ? 'GPS ± ' + Math.round(g.acc) + ' m' : g.reason) : 'Départ prévu ' + tripWhen(t.dep));
  // Prochain danger : le premier point du tour du parcours (même lecture que le mur des stands) après la position actuelle.
  const rows = t.seq && typeof F1Pure.routeTower === 'function' ? F1Pure.routeTower(t.seq) : [], doneKm = Number.isFinite(fraction) && Number.isFinite(total) ? total * fraction : 0;
  const next = rows.find(r => r.level != null && r.level >= 1 && (r.km == null || r.km >= doneKm - 0.5));
  const box = document.querySelector('#liveDrive .dv-next');
  if (box) box.dataset.dvLv = next ? String(next.level) : '0';
  driveSet('next', next ? (Number.isFinite(next.km) ? (next.km - doneKm > 0.5 ? 'Dans ' + driveKm(next.km - doneKm) + ' km' : 'Maintenant') : 'Sur le parcours') : 'RAS');
  driveSet('nextWhat', next ? (next.notes && next.notes.length ? next.notes[0] : next.label || '') + (Number.isFinite(next.rain) && next.rain >= 0.2 ? ' · ' + F1Pure.rainShown(next.rain) + ' mm/h' : '') : 'Aucun signal notable devant toi');
  driveSet('foot', [route ? '' : 'Itinéraire en préparation', DRIVE.wakeState, 'prévisions du modèle, pas une mesure sur la route'].filter(Boolean).join(' · '));
  if (DRIVE.map && pose && pose.point) {
    if (DRIVE.marker) DRIVE.marker.setLatLng(pose.point);
    if (DRIVE.done && route) { const k = route.cumulative.findIndex(c => c >= route.total * pose.fraction); DRIVE.done.setLatLngs(route.pts.slice(0, Math.max(1, k)).concat([pose.point])); }
    if (DRIVE.follow) DRIVE.map.setView(pose.point, Math.max(DRIVE.map.getZoom() || 15, 15), { animate: false });
  }
}
