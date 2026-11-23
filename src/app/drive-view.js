// Mode « EN DIRECT » (20/11/2026, maquette A « cockpit » validée) : plein écran iPhone pendant le trajet. Carte Plan IGN
// (Géoplateforme, repli OpenStreetMap) qui suit ta position, km parcourus et restants, vitesse GPS, arrivée, secteur et
// prochain danger météo du parcours. Réutilise le trajet canonique (LiveRoute, FIX, routeTower) ; aucun nouveau GPS.
// Ajouts du 20/11 (soir) : tracé routier complet (OSRM), sortie d'itinéraire détectée → recalcul immédiat depuis ta position
// (même réponse reprise par le suivi du trajet : km, arrivée, météo), feux tricolores du parcours (OpenStreetMap, Overpass)
// avec alerte d'approche à 300 m (bandeau, bip facultatif ; la couleur du feu n'est connue de personne),
// « BIEN ARRIVÉ » qui clôt le trajet (même machine que l'arrivée GPS : journal, lieu confirmé) et ajoute les km au compteur.
// 21/11 (lot 1 « EN DIRECT v2 ») : vitesse GPS dans une pastille neutre (jamais un cercle rouge, qui se lit comme une limitation),
// icône de feu neutre sans lampe colorée (la couleur réelle d'un feu n'est connue de personne), libellé « 3 feux · prochain à 180 m »,
// fond Plan IGN clair le jour et sombre la nuit (soleil à la position, automatique), photo aérienne IGN en option (Réglages).
// Écritures : seulement la clôture du trajet et le relevé du compteur, sur appui. Pas de guidage tournant par tournant ni de radars.
const DRIVE = { open: false, map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, timer: null, wake: null, wakeState: '', prevFix: null, speed: null, hist: [], follow: true,
  nav: null, navGen: 0, navAt: 0, navAsked: null, km0: 0, off: null, rerouting: false, rerouteAt: 0, reroutes: 0, navMsg: '', navMsgAt: 0,
  lights: null, lightsSig: null, lightsCtl: null, lightsAttempts: 0, lightsRetryAt: 0, lightsErr: false, arrived: null, fixTs: 0, navFuzzy: false, refineAt: 0, beepKey: null, beeps: 0, audio: null,
  mv: null, mvPending: false, glErr: '', setup: null, free: null };
const DRIVE_LIGHTS = new Map();   // feux par tracé (mémoire de la session seulement, 6 tracés au plus)
const IGN_ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
// Fond de carte : « plan » (Plan IGN, clair le jour, sombre la nuit) ou « ortho » (photo aérienne BD ORTHO), choisi dans les Réglages.
const DRIVE_BASE_KEY = 'twrc.drive.base';
const driveBasePref = () => lsGet(DRIVE_BASE_KEY) === 'ortho' ? 'ortho' : 'plan';
// Icône de feu NEUTRE : boîtier et trois feux éteints (contours gris), aucune couleur rouge, orange ou verte.
const DRIVE_LIGHT_SVG = '<svg viewBox="0 0 14 32" width="14" height="32" aria-hidden="true" focusable="false"><rect x="1" y="1" width="12" height="30" rx="4" fill="#2c2c2e" stroke="#f2f2f7" stroke-width="1.5"/>' +
  '<circle cx="7" cy="8" r="3" fill="none" stroke="#aeaeb2" stroke-width="1.4"/><circle cx="7" cy="16" r="3" fill="none" stroke="#aeaeb2" stroke-width="1.4"/><circle cx="7" cy="24" r="3" fill="none" stroke="#aeaeb2" stroke-width="1.4"/></svg>';
const IGN_PLAN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const driveTrip = () => { const s = APP_CONTEXT.snapshot || {}; return s.activeTrip || s.nextTrip || null; };
// Ouverture du GPS : trajet en cours, ou programmé dans les 3 h ; plus tard (le trajet de demain matin), choix de la voiture d'abord.
function driveSoonTrip() {
  const s = APP_CONTEXT.snapshot || {}; if (s.activeTrip) return s.activeTrip;
  const t = s.nextTrip, min = t && typeof t.dep === 'string' ? (Date.parse(t.dep.slice(0, 16)) - Date.parse(liveNow().slice(0, 16))) / 60e3 : NaN;
  return Number.isFinite(min) && min <= 180 ? t : null;
}
function driveShell() {
  return '<div class="dv-map" role="region" aria-label="Carte du trajet en direct"></div>' +
    '<div class="dv-top"><span class="dv-tag">EN DIRECT</span><span class="dv-gps" data-dv="gps">GPS —</span>' +
    '<button type="button" class="dv-beep" data-act="drive-beep" aria-pressed="' + (driveBeepOn() ? 'true' : 'false') + '" aria-label="Bip à l’approche des feux">' + (driveBeepOn() ? '🔔' : '🔕') + '</button>' +
    '<button type="button" class="dv-close" data-act="drive-close" aria-label="Quitter le mode en direct">✕</button></div>' +
    '<div class="dv-alerts"><div class="dv-guide" data-dv="guide" role="status" aria-live="polite" hidden><span class="dv-garrow" data-dv="garrow" aria-hidden="true"></span>' +
    '<span class="dv-gmain"><b data-dv="gdist"></b><span data-dv="gtext"></span></span></div><div class="dv-lanes" data-dv="glanes" aria-label="Voies conseillées" hidden></div>' +
    '<p class="dv-then" data-dv="gthenbox" hidden><span>Puis</span><span class="dv-tarrow" data-dv="gtarrow" aria-hidden="true"></span><span data-dv="gthen"></span></p>' +
    '<p class="dv-nav" data-dv="nav" role="status" hidden></p></div>' +
    '<div class="dv-panel"><span class="dv-credit" data-dv="credit"></span><div class="dv-speed" aria-label="Vitesse GPS"><b data-dv="speed">—</b><small>km/h</small></div>' +
    '<button type="button" class="dv-recenter" data-act="drive-follow" hidden>Recentrer</button>' +
    '<p class="dv-lightalert" data-dv="lightAlert" role="status" hidden><span class="dv-li">' + DRIVE_LIGHT_SVG + '</span><span data-dv="lightAlertText"></span></p>' +
    '<div class="dv-summary"><div class="dv-metric"><small data-dv="etaLabel">ARRIVÉE</small><b data-dv="eta">—</b><span class="dv-freeunit">km</span></div>' +
    '<div class="dv-metric"><small>RESTANTS</small><b data-dv="left" class="dv-left">—</b><span>km</span></div>' +
    '<details class="dv-details"><summary>Détails</summary><div class="dv-details-body">' +
    '<div class="dv-figs"><span><small>PARCOURUS</small><b><span data-dv="done">—</span> km</b></span><span><small>SECTEUR</small><b data-dv="sector">—</b></span></div>' +
    '<div class="dv-bar" aria-hidden="true"><i data-dv="bar"></i></div>' +
    '<p class="dv-lights"><span class="dv-li">' + DRIVE_LIGHT_SVG + '</span><span data-dv="lightsLabel">Recherche des feux…</span></p>' +
    '<p class="dv-gnote" data-dv="gnote">' + DriveGuide.NOTICE + '</p><p class="dv-foot" data-dv="foot"></p></div></details></div>' +
    '<p class="dv-alt" data-dv-lv="0" hidden><span class="dv-alti"><small>ALTITUDE</small><b data-dv="alt">—</b></span><span data-dv="altTop"></span></p>' +
    '<div class="dv-next" data-dv-lv="x"><b data-dv="next">—</b><span data-dv="nextWhat"></span></div>' +
    '<button type="button" class="btn pri dv-arrive" data-act="drive-arrived" hidden>✅ BIEN ARRIVÉ</button>' +
    '<button type="button" class="btn pri dv-arrive dv-freeend" data-act="drive-free-end" hidden>Terminer le trajet</button>' +
    '<div class="dv-done" data-dv="arrived" hidden></div>' +
    '</div>';
}
const driveSet = (k, v) => { const el = document.querySelector('#liveDrive [data-dv="' + k + '"]'); if (el && el.textContent !== v) el.textContent = v; };
const driveKm = v => Number.isFinite(v) ? (v < 10 ? f1(v) : f0(v)) : '—';
const driveM = m => !Number.isFinite(m) ? '' : m < 1000 ? Math.round(m / 10) * 10 + ' m' : f1(m / 1000) + ' km';
async function driveOpen() {
  const root = $('#liveDrive'); if (!root || LOCKED()) return;
  const t = driveTrip();
  if (!t && !DRIVE.free) { commandFeedback && document.activeElement && commandFeedback(document.activeElement, 'Aucun trajet en cours ni prévu'); return; }
  DRIVE.open = true; DRIVE.follow = true; root.hidden = false; root.innerHTML = driveShell(); root.classList.toggle('dv-free', !!DRIVE.free); document.documentElement.classList.add('dv-on');
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
// Lot 4 · ouverture du GPS : trajet en cours ou programmé → mode EN DIRECT directement (voiture du trajet). Sinon : choix de la
// voiture d'abord (voiture du jour présélectionnée), puis « Rouler sans destination » ou « Choisir une destination ».
function driveGps() {
  if (LOCKED()) return;
  if (driveSoonTrip()) { driveOpen(); return; }
  const root = $('#liveDrive'); if (!root) return;
  DRIVE.setup = { carId: appDay().activeCarId || (S.cars[0] && S.cars[0].id) || null };
  root.hidden = false; root.classList.add('dv-setupmode'); document.documentElement.classList.add('dv-on'); driveSetupRender();
  const first = root.querySelector('[data-act="drive-car"][aria-pressed="true"]') || root.querySelector('[data-act="drive-car"]'); if (first) first.focus({ preventScroll: true });
}
const DRIVE_TYRE = { summer: 'pneus été', winter: 'pneus hiver', allseason: 'pneus 4 saisons' };
function driveSetupRender() {
  const root = $('#liveDrive'), s = DRIVE.setup; if (!root || !s) return;
  root.innerHTML = '<div class="dv-setup"><div class="dv-top"><span class="dv-tag">GPS</span><button type="button" class="dv-close" data-act="drive-close" aria-label="Fermer">✕</button></div>' +
    '<h2 id="dvSetupH">Quelle voiture conduis-tu ?</h2><div class="dv-cars" role="group" aria-labelledby="dvSetupH">' +
    S.cars.map(c => '<button type="button" data-act="drive-car" data-id="' + esc(c.id) + '" aria-pressed="' + (c.id === s.carId) + '"><b>' + esc(c.short || c.name) + '</b><small>' + esc(DRIVE_TYRE[c.tire && c.tire.type] || 'pneus non renseignés') + '</small></button>').join('') +
    '</div><div class="dv-setup-go"><button type="button" class="btn pri" data-act="drive-free"' + (s.carId ? '' : ' disabled') + '>Rouler sans destination</button>' +
    '<button type="button" class="btn" data-act="drive-dest"' + (s.carId ? '' : ' disabled') + '>Choisir une destination</button></div>' +
    '<p class="dv-foot">La voiture choisie devient ta voiture du jour (verdicts, pneus). Aucun trajet n\'est créé tant que tu n\'as pas choisi.</p></div>';
}
// Choix de la voiture : dans l'écran GPS plein écran (ouverture par « 🧭 GPS ») ou dans l'onglet GPS ; seul l'écran visible est redessiné.
function driveSetupCar(id) {
  if (!DRIVE.setup || !S.cars.some(c => c.id === id)) return;
  DRIVE.setup.carId = id;
  const root = $('#liveDrive'), overlay = !!root && !root.hidden && root.classList.contains('dv-setupmode');
  if (overlay) driveSetupRender(); else if (typeof renderGps === 'function') renderGps();
  const b = $((overlay ? '#liveDrive' : '#secGps') + ' [data-act="drive-car"][data-id="' + CSS.escape(id) + '"]'); if (b) b.focus({ preventScroll: true });
}
// « Choisir une destination » : formulaire du Trajet, départ maintenant, voiture choisie ; « Partir maintenant » rouvre le GPS.
function driveSetupDest() {
  const id = DRIVE.setup && DRIVE.setup.carId; if (!id) return;
  appSetCar(id); TRIP_FORM.carId = id; TRIP_FORM.when = 'now'; driveClose();
  UI.view = 'trajet'; renderAll(); const q = $('#tripDestQ'); if (q) { q.scrollIntoView({ block: 'center', behavior: scrollBehavior() }); q.focus({ preventScroll: true }); }
}
// « Rouler sans destination » : carte qui suit, vitesse, km parcourus (GPS), jour/nuit ; pas d'itinéraire, donc ni feux ni guidage.
// GPS de ce mode seulement (watchPosition), arrêté à la fermeture ; positions gardées en mémoire, jamais envoyées.
function driveFreeStart() {
  const id = DRIVE.setup && DRIVE.setup.carId; if (!id || !('geolocation' in navigator)) return;
  appSetCar(id);
  const free = DRIVE.free = { carId: id, at: Date.now(), km: 0, last: null, fix: null, prev: null, watch: null, err: '' };
  try { free.watch = navigator.geolocation.watchPosition(p => { const c = p && p.coords; if (!c || DRIVE.free !== free) return; free.fix = { lat: c.latitude, lon: c.longitude, acc: c.accuracy, ts: p.timestamp, speed: Number.isFinite(c.speed) ? c.speed : null }; driveFreeMove(free); },
    e => { if (DRIVE.free === free) free.err = e && e.code === 1 ? 'Localisation refusée' : 'Position introuvable'; }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }); } catch (e) { free.err = 'Localisation indisponible'; }
  DRIVE.setup = null; const root = $('#liveDrive'); if (root) root.classList.remove('dv-setupmode');
  driveOpen();
}
// Distance parcourue : seulement entre relevés précis (≤ 30 m), déplacement réel (> 8 m et > incertitude) et plausible (≤ 70 m/s).
function driveFreeMove(free) {
  const f = free.fix; if (!f || !Number.isFinite(f.ts) || f.acc > 30) return;
  const l = free.last;
  if (!l) { free.last = f; return; }
  if (f.ts <= l.ts) return;
  const d = DriveNav.meters([l.lat, l.lon], [f.lat, f.lon]), dt = (f.ts - l.ts) / 1000;
  if (d / dt > 70) { free.last = f; return; }
  if (d > Math.max(8, (l.acc + f.acc) / 2)) { free.km += d / 1000; free.prev = l; free.last = f; free.speed = f.speed != null ? f.speed * 3.6 : d / dt * 3.6; }
  else if (dt > 20) free.speed = 0;
}
function driveFreeEnd() {
  const free = DRIVE.free; if (!free) return;
  try { if (free.watch != null) navigator.geolocation.clearWatch(free.watch); } catch (e) { /* GPS déjà arrêté */ }
  const car = S.cars.find(c => c.id === free.carId) || null, km = free.km >= 0.5 ? { km: Math.max(1, Math.round(free.km)), src: 'gps' } : null;
  DRIVE.arrived = { key: 'free', free: true, to: 'trajet libre', car, k: km, odo: km ? null : { ok: false, msg: 'Moins de 500 m parcourus : compteur inchangé' } };
  free.done = true; driveTick();
}
function driveFreeTick() {
  const free = DRIVE.free, f = free.fix, fresh = f && Date.now() - f.ts <= 15000 && f.acc <= 50 ? f : null;
  const night = fresh ? DriveNav.isNight(fresh.lat, fresh.lon, Date.now()) : true, root = $('#liveDrive');
  if (root) root.classList.toggle('dv-night', night);
  if (!DRIVE.mv) driveMap(null, night); else DRIVE.mv.setTheme(night);
  driveSet('done', driveKm(free.km)); driveSet('left', '—'); driveSet('sector', '—');
  driveSet('etaLabel', 'PARCOURUS'); driveSet('eta', driveKm(free.km));
  driveSet('speed', fresh && Number.isFinite(free.speed) ? f0(free.speed) : '—');
  driveSet('lightsLabel', 'Sans destination : ni feux ni guidage'); driveSet('next', 'Libre'); driveSet('nextWhat', 'Aucun itinéraire : seulement ta position, ta vitesse et les km');
  driveSet('gps', fresh ? 'GPS ± ' + Math.round(fresh.acc) + ' m' : free.err || 'Recherche du GPS…');
  const car = S.cars.find(c => c.id === free.carId), end = $('#liveDrive .dv-freeend');
  if (end) { end.hidden = false; const k = Math.round(free.km); end.textContent = 'Terminer le trajet' + (free.km >= 0.5 ? ' · ' + Math.max(1, k) + ' km' : ''); }
  driveSet('foot', ['Trajet libre · ' + (car ? car.short || car.name : ''), DRIVE.wakeState, DRIVE.mv && DRIVE.mv.credit].filter(Boolean).join(' · '));
  if (DRIVE.mv && fresh) {
    const head = free.prev ? DriveNav.heading(free.prev, free.last) : null, at = [fresh.lat, fresh.lon];
    DRIVE.mv.setCar(at, head); if (DRIVE.follow) DRIVE.mv.follow(at, head, DriveNav.autoZoom(free.speed, null));
  }
}
function driveClose() {
  if (DRIVE.lightsCtl) DRIVE.lightsCtl.abort();
  if (DRIVE.free && DRIVE.free.watch != null && !DRIVE.free.done) { try { navigator.geolocation.clearWatch(DRIVE.free.watch); } catch (e) { /* GPS déjà arrêté */ } }
  DRIVE.free = null; DRIVE.setup = null; const r0 = $('#liveDrive'); if (r0) r0.classList.remove('dv-setupmode');
  const root = $('#liveDrive'); DRIVE.open = false; clearInterval(DRIVE.timer); DRIVE.timer = null; driveWake(false);
  if (DRIVE.mv) DRIVE.mv.remove();
  Object.assign(DRIVE, { mv: null, mvPending: false, map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, prevFix: null, speed: null, hist: [], summitCalls: 0, summitKey: null, summitT: null, summitLast: null, summitCol: null, summitCache: null,
    nav: null, navGen: DRIVE.navGen + 1, navAt: 0, navAsked: null, km0: 0, off: null, rerouting: false, rerouteAt: 0, reroutes: 0, navMsg: '', navMsgAt: 0,
    lights: null, lightsSig: null, lightsCtl: null, lightsAttempts: 0, lightsRetryAt: 0, lightsErr: false, arrived: null, fixTs: 0, navFuzzy: false, refineAt: 0, beepKey: null });
  document.documentElement.classList.remove('dv-on');
  if (root) { root.hidden = true; root.innerHTML = ''; root.classList.remove('dv-arrived', 'dv-free'); }
  if (typeof renderGps === 'function') renderGps();   // onglet GPS : retour au choix de la voiture ou à la carte du trajet
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
// Carte : 3D IGN (MapLibre, drive-map-gl.js) si le téléphone sait l'afficher, sinon Plan IGN à plat (Leaflet) ; même interface.
async function driveMap(route, night) {
  const root = $('#liveDrive'), node = root && root.querySelector('.dv-map'); if (!node || DRIVE.mv || DRIVE.mvPending) return;
  DRIVE.mvPending = true; const key = DRIVE.key;
  let mv = null;
  let flat = false; try { flat = sessionStorage.getItem('rc-dv-flat') === '1'; } catch (e) { /* stockage de session indisponible */ }
  if (driveWebGL() && !offlineNow() && !flat) { try { mv = await driveMapGl(node, route, night); } catch (e) { mv = null; DRIVE.glErr = String(e && e.message || e).slice(0, 120); node.innerHTML = ''; } }
  if (!mv) { try { mv = await driveMapFlat(node, route); } catch (e) { driveSet('foot', 'Carte indisponible · chiffres du trajet conservés'); } }
  DRIVE.mvPending = false;
  if (!mv) return;
  if (!DRIVE.open || DRIVE.key !== key || !node.isConnected) { mv.remove(); return; }
  DRIVE.mv = mv; DRIVE.map = mv.map;
  driveSet('credit', mv.kind === '3d' ? '© IGN · © OpenStreetMap · OSRM' : '');
  if (mv.kind === '3d') driveGlProbe(mv, route);
  mv.on('drag', () => { DRIVE.follow = false; const b2 = root.querySelector('.dv-recenter'); if (b2) b2.hidden = false; });
  if (DRIVE.route) mv.setRoute(DRIVE.route, true);
  mv.setLights(DRIVE.lights || []);
  driveTick();
}
// Fluidité de la 3D mesurée pendant 8 s : trop lente sur cet appareil (< 15 images/s) → carte à plat pour la session, dit à l'écran.
// Drapeau de session seulement (sessionStorage « rc-dv-flat ») : ni stockage durable, ni export, ni synchronisation.
function driveGlProbe(mv, route) {
  const iv = []; let last = null; const t0 = performance.now();
  const loop = t => { if (DRIVE.mv !== mv) return; if (last != null) iv.push(t - last); last = t;
    if (t - t0 < 8000) { requestAnimationFrame(loop); return; }
    if (DriveNav.slowFrames(iv)) { try { sessionStorage.setItem('rc-dv-flat', '1'); } catch (e) { /* stockage de session indisponible */ }
      mv.remove(); DRIVE.mv = null; DRIVE.map = null; DRIVE.glSlow = true; const node = document.querySelector('#liveDrive .dv-map'); if (node) node.innerHTML = ''; driveMap(DRIVE.route, false); } };
  requestAnimationFrame(loop);
}
// Repli à plat : Plan IGN (clair le jour, sombre la nuit par une classe) ou photo aérienne, voiture, tracé, feux neutres.
async function driveMapFlat(node, route) {
  await loadLeaflet();
  const map = L.map(node, { zoomControl: false, attributionControl: true, zoomAnimation: false, keyboard: false });
  driveBaseLayer(map);
  const lights = L.layerGroup().addTo(map), counts = { lights: 0 };
  let line = null, done = null;
  const car = L.marker(route ? route.pts[0] : [46.6, 2.4], { icon: L.divIcon({ className: 'dv-car', html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
  const api = {
    kind: 'plat', map, credit: '',
    on: (ev, fn) => map.on(ev === 'drag' ? 'dragstart' : ev, fn),
    setRoute(r, fit) { [line, done].forEach(l => { if (l) map.removeLayer(l); }); line = done = null;
      if (!r) { map.setView([46.6, 2.4], 6); return; }
      line = L.polyline(r.pts, { color: '#5fb0e8', weight: 6, opacity: .45 }).addTo(map); done = L.polyline([], { color: '#5fb0e8', weight: 6, opacity: 1 }).addTo(map);
      if (fit) map.fitBounds(line.getBounds(), { padding: [24, 24] }); },
    setDone(pts) { if (done) done.setLatLngs(pts); },
    setCar(p) { car.setLatLng(p); },
    shown: () => { const l = car.getLatLng(); return [l.lat, l.lng]; },
    follow(p) { map.setView(p, Math.max(map.getZoom() || 15, 15), { animate: false }); },
    setLights(list) { lights.clearLayers(); counts.lights = (list || []).length;
      (list || []).forEach(l => L.marker([l.lat, l.lon], { icon: L.divIcon({ className: 'dv-light', html: DRIVE_LIGHT_SVG, iconSize: [18, 40], iconAnchor: [9, 40] }), interactive: false, keyboard: false, title: 'Feu tricolore (OpenStreetMap)' }).addTo(lights)); },
    async setTheme() { map.invalidateSize({ pan: false }); driveBaseLayer(map); },
    theme: () => 'plat',
    counts: () => ({ ...counts }),
    remove() { try { map.remove(); } catch (e) { /* carte déjà retirée */ } }
  };
  api.setRoute(route, true);
  return api;
}
// Fond de carte (Plan IGN ou photo aérienne) : remplacé en direct si le réglage change ; jour / nuit par une classe sur la vue.
// Plan IGN indisponible (3 tuiles en échec avant la première) : repli OpenStreetMap, comme avant.
function driveBaseLayer(map) {
  const kind = driveBasePref();
  if (map._dvBase && map._dvKind === kind) return;
  if (map._dvBase) map.removeLayer(map._dvBase);
  let loaded = false, errors = 0;
  const layer = kind === 'ortho'
    ? L.tileLayer(IGN_ORTHO, { maxZoom: 19, maxNativeZoom: 19, className: 'dv-ortho', attribution: '© IGN Géoplateforme · BD ORTHO · Itinéraire © OSRM · Feux © OpenStreetMap' })
    : L.tileLayer(IGN_PLAN, { maxZoom: 19, maxNativeZoom: 19, className: 'dv-plan', attribution: '© IGN Géoplateforme · Itinéraire © OSRM · Feux © OpenStreetMap' });
  layer.on('tileload', () => { loaded = true; });
  layer.on('tileerror', () => {
    if (++errors >= 3 && !loaded && DRIVE.map === map && map._dvBase === layer) {
      map.removeLayer(layer); map._dvBase = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'dv-plan', attribution: '© OpenStreetMap · Itinéraire © OSRM' }).addTo(map);
    }
  });
  map._dvBase = layer.addTo(map); map._dvKind = kind;
  if (map._dvBase.bringToBack) map._dvBase.bringToBack();
}
// Tracé affiché = tracé suivi (DRIVE.nav, sinon tracé prévu). Redessiné à chaque nouvel itinéraire, sans recadrer si la carte suit.
function driveDrawRoute(route, fit) { DRIVE.route = route || null; if (DRIVE.mv) DRIVE.mv.setRoute(DRIVE.route, fit && !DRIVE.last); }
function driveDrawLights() { if (DRIVE.mv) DRIVE.mv.setLights(DRIVE.lights || []); }
// Pictogrammes de manœuvre (dessins propres à l'app, traits blancs, aucune couleur) : forme de la flèche seulement.
const DRIVE_ARROWS = {
  straight: '<path d="M24 42V9M13 19 24 8l11 11"/>', right: '<path d="M17 42V25q0-9 9-9h12M30 8l8 8-8 8"/>', left: '<path d="M31 42V25q0-9-9-9H10M18 8l-8 8 8 8"/>',
  'slight-right': '<path d="M19 42V29l15-16M24 11l11 1-1 11"/>', 'slight-left': '<path d="M29 42V29L14 13M24 11l-11 1 1 11"/>',
  'sharp-right': '<path d="M16 42V13l19 19M35 21v11H24"/>', 'sharp-left': '<path d="M32 42V13L13 32M13 21v11h11"/>',
  uturn: '<path d="M32 42V18q0-10-9-10t-9 10v10M8 22l6 8 6-8"/>', roundabout: '<circle cx="24" cy="21" r="8"/><path d="M24 42V29M30 15l8-8M30 7h8v8"/>',
  arrive: '<path d="M15 42V7h19l-4 7 4 7H15"/>' };
const driveArrowSvg = (k, size) => '<svg viewBox="0 0 48 48" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (DRIVE_ARROWS[k] || DRIVE_ARROWS.straight) + '</svg>';
// Voies (seulement si OSRM les fournit) : une case par voie, conseillée en clair, les autres estompées ; flèches tirées des indications.
const DRIVE_LANE_ARROW = { left: 'left', 'slight left': 'slight-left', 'sharp left': 'sharp-left', right: 'right', 'slight right': 'slight-right', 'sharp right': 'sharp-right', uturn: 'uturn', straight: 'straight' };
const driveLanesHtml = lanes => lanes.map(l => '<span class="dv-lane' + (l.ok ? ' ok' : '') + '">' + (l.dirs.length ? l.dirs : ['straight']).slice(0, 2).map(d => driveArrowSvg(DRIVE_LANE_ARROW[d] || 'straight', 18)).join('') + '</span>').join('');
// Guidage : manœuvre en cours (tracé détaillé, trajet démarré, position sur le tracé). Hors du tracé ou pendant un recalcul :
// bandeau masqué, aucune consigne tirée d'un tracé qu'on ne suit plus. Annonces aux paliers notées (pour une future voix).
function driveGuide(on, along) {
  const box = document.querySelector('#liveDrive [data-dv="guide"]'); if (!box) return;
  const g = on ? DriveGuide.state(DRIVE.nav, along) : null, lanesEl = document.querySelector('#liveDrive [data-dv="glanes"]'), thenEl = document.querySelector('#liveDrive [data-dv="gthenbox"]');
  box.hidden = !g; if (lanesEl) lanesEl.hidden = !(g && g.lanes); if (thenEl) thenEl.hidden = !(g && g.then);
  if (!g) return;
  const a = document.querySelector('#liveDrive [data-dv="garrow"]');
  if (a && a.dataset.k !== g.arrow) { a.dataset.k = g.arrow; a.innerHTML = driveArrowSvg(g.arrow, 64); }
  driveSet('gdist', g.label === 'maintenant' ? 'Maintenant' : g.label); driveSet('gtext', g.text);
  if (g.lanes && lanesEl) { const h = driveLanesHtml(g.lanes); if (lanesEl.dataset.h !== h) { lanesEl.innerHTML = h; lanesEl.dataset.h = h; } }
  if (g.then) { const t = document.querySelector('#liveDrive [data-dv="gtarrow"]'); if (t && t.dataset.k !== g.then.arrow) { t.dataset.k = g.then.arrow; t.innerHTML = driveArrowSvg(g.then.arrow, 22); } driveSet('gthen', g.then.text); }
  const mark = g.key + '|' + g.tier;
  if (DRIVE.gMark !== mark) { DRIVE.gMark = mark; (DRIVE.announces || (DRIVE.announces = [])).push({ key: g.key, label: g.label, text: g.text }); if (DRIVE.announces.length > 200) DRIVE.announces.shift(); }
}
// Point envoyé au calculateur d'itinéraire : à moins de 1,5 km du domicile, du travail ou d'un lieu enregistré, arrondi à ~1 km
// (règle rc2 de l'app) ; ailleurs, 3 décimales (≈ 100 m) comme le suivi du trajet, et 4 décimales (≈ 10 m) pour la position
// d'une voiture EN ROUTE qui demande un recalcul : sinon le tracé repartirait d'une rue voisine et se recalculerait en boucle.
function driveNavPoint(p, priv, moving) {
  if (!p || !Number.isFinite(+p.lat) || !Number.isFinite(+p.lon)) return null;
  const n = moving ? 4 : 3;
  return priv || driveNearPrivate(p) ? { lat: rc2(+p.lat), lon: rc2(+p.lon), fuzzy: true } : { lat: +(+p.lat).toFixed(n), lon: +(+p.lon).toFixed(n), fuzzy: false };
}
// Zone privée (1,5 km autour d'un lieu enregistré) : tracé volontairement approximatif, donc aucune « sortie d'itinéraire » ;
// dès qu'on en sort, le tracé est affiné sans message depuis la position (4 décimales).
const driveNearPrivate = p => !!p && (S.locs || []).some(l => locHasCoords(l) && distKm(l, p) <= 1.5);
// Distance suivie (km) : tracés précédents + position sur le tracé courant.
const driveFollowed = pose => DRIVE.km0 + (pose && DRIVE.route ? DRIVE.route.km * pose.fraction : 0);
// Itinéraire complet (OSRM) : à l'ouverture depuis l'origine prévue (ou ta position si le trajet est démarré), puis à chaque
// sortie d'itinéraire depuis ta position. Une réponse d'un ancien trajet ou d'une ancienne demande est ignorée (génération).
function driveNavRequest(t, fix, reroute) {
  if (!t || offlineNow()) return;
  const d = liveDest(t), from = fix ? driveNavPoint(fix, false, true) : driveNavPoint(livePlanFrom(t), false), to = d && driveNavPoint(d, d.priv);
  if (!from || !to) return;
  const gen = ++DRIVE.navGen, key = t.key, h = fix && DRIVE.prevFix ? DriveNav.heading(DRIVE.prevFix, fix) : null;
  if (reroute) { DRIVE.rerouting = true; DRIVE.rerouteAt = Date.now(); DRIVE.reroutes++; DRIVE.navMsg = 'Hors itinéraire · recalcul depuis ta position…'; DRIVE.navMsgAt = Date.now(); }
  fetchJSON(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&annotations=duration&steps=true` +
    (h != null ? `&bearings=${h},60;&radiuses=200;unlimited` : ''), 10000)
    .then(j => {
      if (!DRIVE.open || gen !== DRIVE.navGen || DRIVE.key !== key) return;
      const nav = DriveNav.fromOsrm(j, key); if (!nav) throw new Error('itinéraire vide');
      // Continuité des km parcourus : distance déjà suivie + écart entre la dernière position sur l'ancien tracé et ta position.
      if (fix) {
        const pose = DRIVE.last, hit = !pose && DRIVE.route ? DriveNav.nearest(DRIVE.route, [fix.lat, fix.lon]) : null;
        DRIVE.km0 = pose ? driveFollowed(pose) + DriveNav.meters(pose.point, [fix.lat, fix.lon]) / 1000
          : hit && hit.gap <= 1000 ? DRIVE.km0 + DRIVE.route.km * hit.along / DRIVE.route.total : DRIVE.km0;
      }
      const before = DRIVE.route ? DRIVE.route.km * (1 - (DRIVE.last ? DRIVE.last.fraction : 0)) : null;
      DRIVE.nav = nav; DRIVE.navAt = Date.now(); DRIVE.last = null; DRIVE.off = null; DRIVE.rerouting = false; DRIVE.navFuzzy = from.fuzzy;
      driveDrawRoute(nav, !fix);
      if (reroute) {
        const diff = Number.isFinite(before) ? nav.km - before : null;
        DRIVE.navMsg = 'Itinéraire recalculé depuis ta position' + (Number.isFinite(diff) && Math.abs(diff) >= .1 ? ' · ' + (diff > 0 ? '+' : '−') + f1(Math.abs(diff)) + ' km' : ''); DRIVE.navMsgAt = Date.now();
        driveFeedLive(j, fix, d);
      }
      driveLightsFetch(nav); driveAltFetch(nav);
      driveTick();
    })
    .catch(() => {
      if (gen !== DRIVE.navGen) return;
      DRIVE.rerouting = false;
      if (reroute) { DRIVE.navMsg = 'Recalcul impossible · itinéraire précédent conservé, nouvel essai dans 20 s'; DRIVE.navMsgAt = Date.now(); }
    });
}
// La même réponse alimente le suivi du trajet (LIVE) : km, heure d'arrivée et météo du nouveau parcours, sans second appel.
function driveFeedLive(j, fix, d) {
  if (!LIVE.key || LIVE.key !== DRIVE.key || LIVE.phase !== 'active') return;
  const p = liveParse(j); if (!p) return;
  const gen = ++LIVE.gen, o = liveOrigin(fix);
  LIVE.route = { ...p, key: LIVE.key, gen, o, d: { lat: d.lat, lon: d.lon, name: d.name } };
  if (!LIVE.route0 || LIVE.route0.key !== LIVE.key) LIVE.route0 = { key: LIVE.key, km: p.km, o };
  LIVE.routeAt = Date.now(); LIVE.routeTry = Date.now(); LIVE.routeOrigin = o; LIVE.routeErr = false;
  renderBrf();
}
// Altitude du parcours (lot 5) : profil du tracé par l'altimétrie IGN (RGE ALTI, data.geopf.fr déjà autorisé), hors zones privées ;
// prochain point haut ; température prévue à SON altitude à l'heure de passage (Open-Meteo, altitude imposée), gel signalé.
const IGN_ALTI = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
async function driveAltFetch(nav) {
  if (!nav || !nav.full || nav.profile || nav.altAsked || offlineNow()) return;
  nav.altAsked = true;
  const pts = DriveAlt.samples(nav, (S.locs || []).filter(locHasCoords)); if (pts.length < 2) return;
  try {
    const j = await fetchJSON(IGN_ALTI + '?lon=' + pts.map(p => p.at[1]).join('|') + '&lat=' + pts.map(p => p.at[0]).join('|') + '&resource=ign_rge_alti_wld&zonly=true', 15000);
    nav.profile = DriveAlt.profile(j, pts);
  } catch (e) { nav.profile = null; }
  if (DRIVE.open) driveTick();
}
// Gel au point haut : Open-Meteo interrogé aux coordonnées du col AVEC son altitude réelle (« elevation »), avec les mêmes variables
// horaires que les points d'un trajet. UNE réponse (toute la série horaire) sert chaque heure de passage du même col pendant 60 min ;
// au plus DriveAlt.MAX_CALLS appels par trajet ; un appel bloqué par la pause 429 commune n'est pas compté (nouvel essai après).
// Verdict = règle UNIQUE d'engine.js, par le même chemin qu'un point de la carte trajet : makeModel → summarize de l'heure de
// passage → frostRisk / frostWords (chaussée estimée + humidité de la même heure, repli sur l'air signalé). Aucun seuil ici.
// Quota (429) ou panne : « non couvert ». Plafond atteint : dernière prévision valide de CE col, avec son heure.
const DRIVE_SUMMIT_TTL = 60 * 60e3;
const driveSummitFromModel = (m, passTs) => DriveAlt.verdict(m, passTs, { summarize, frostRisk, frostWords, LV });
const driveSummitModel = (json, at) => json && json.hourly && Array.isArray(json.hourly.time) ? makeModel(json, 'live', { lat: at[0], lon: at[1] }) : null;
// Un col = le même point haut à ≤ 1 km et ≤ 50 m d'altitude près : un profil rafraîchi (tracé GPS, recalcul) qui déplace le point
// haut de quelques mètres garde son identité et ne coûte pas un nouvel appel météo.
function driveSummitSpot(top) {
  const c = DRIVE.summitCol;
  if (c && DriveNav.meters(c.at, top.at) <= 1000 && Math.abs(c.z - top.z) <= 50) return c.id;
  DRIVE.summitCol = { at: top.at.slice(), z: top.z, id: top.at.join(',') + '|' + top.z }; return DRIVE.summitCol.id;
}
async function driveSummitTemp(top, passTs) {
  const spot = driveSummitSpot(top), key = spot + '|' + passTs.slice(0, 13);
  if (DRIVE.summitKey === key) return;
  const c = DRIVE.summitCache, hit = c && c.spot === spot && Date.now() - c.at < DRIVE_SUMMIT_TTL ? driveSummitFromModel(c.model, passTs) : null;
  if (hit) { DRIVE.summitKey = key; DRIVE.summitT = hit; DRIVE.summitLast = { spot, v: hit }; return; }
  if ((DRIVE.summitCalls || 0) >= DriveAlt.MAX_CALLS) {
    const last = DRIVE.summitLast && DRIVE.summitLast.spot === spot ? DRIVE.summitLast.v : null;
    DRIVE.summitKey = key; DRIVE.summitT = last ? { ...last, stale: true } : { err: 'plafond' }; return;
  }
  const pause = typeof WEATHER_REQUESTS !== 'undefined' && WEATHER_REQUESTS.state();
  if (pause && pause.until > Date.now()) { DRIVE.summitKey = spot + '|pause'; DRIVE.summitT = { err: 429 }; return; }
  DRIVE.summitKey = key; DRIVE.summitCalls = (DRIVE.summitCalls || 0) + 1; DRIVE.summitT = null;
  try {
    const j = await fetchJSON(API + '?latitude=' + top.at[0] + '&longitude=' + top.at[1] + '&elevation=' + top.z + '&hourly=' + Q_HR + '&timezone=Europe%2FParis&past_days=1&forecast_days=3', 12000);
    const m = driveSummitModel(j, top.at), v = m ? driveSummitFromModel(m, passTs) : null;
    if (m) DRIVE.summitCache = { spot, model: m, at: Date.now() };
    if (DRIVE.summitKey === key) { DRIVE.summitT = v || { err: 'absente' }; if (v) DRIVE.summitLast = { spot, v }; if (DRIVE.open) driveTick(); }
  } catch (e) { if (DRIVE.summitKey === key) { DRIVE.summitT = { err: e && (e.status === 429 || /429/.test(e.message || '')) ? 429 : 'panne' }; if (DRIVE.open) driveTick(); } }
}
function driveAltRow(route, along, active) {
  const row = document.querySelector('#liveDrive .dv-alt'); if (!row) return;
  const prof = route && route.profile, here = prof ? DriveAlt.altAt(prof, along) : null, top = prof ? DriveAlt.summit(prof, along) : null;
  row.hidden = !(prof && (here != null || top)); if (row.hidden) return;
  driveSet('alt', here != null ? here + ' m' : '—');
  if (!top) { row.dataset.dvLv = '0'; driveSet('altTop', 'Pas de point haut notable devant'); return; }
  const speed = Number.isFinite(DRIVE.speed) && DRIVE.speed > 20 ? DRIVE.speed : 60, pass = addMin(liveNow().slice(0, 16), Math.round(top.dist / 1000 / speed * 60));
  if (active) driveSummitTemp(top, pass);
  const mine = DRIVE.summitKey && DRIVE.summitKey.startsWith(driveSummitSpot(top) + '|'), t = mine ? DRIVE.summitT : null;
  row.dataset.dvLv = t && !t.err && Number.isInteger(t.lv) ? String(t.lv) : t ? 'x' : '';
  driveSet('altTop', 'Point haut ' + top.z + ' m dans ' + driveKm(top.dist / 1000) + ' km · ' + (t ? DriveAlt.summitLabel(t) : 'gel en cours de calcul'));
}
// Une panne temporaire ne condamne plus les feux pour tout le trajet. Au plus 3 essais sur le même service, espacés
// de 30 puis 60 s. Une fermeture ou un nouveau tracé annule l'appel ; seule sa réponse peut alimenter la carte.
async function driveLightsFetch(nav) {
  if (!DRIVE.open || !nav || !nav.full) return;
  if (DRIVE.lightsSig !== nav.signature) {
    if (DRIVE.lightsCtl) DRIVE.lightsCtl.abort();
    Object.assign(DRIVE, { lightsSig: nav.signature, lights: null, lightsCtl: null, lightsAttempts: 0, lightsRetryAt: 0, lightsErr: false });
    driveDrawLights();
  }
  if (DRIVE.lights || DRIVE.lightsCtl || DRIVE.lightsAttempts >= 3 || Date.now() < DRIVE.lightsRetryAt) return;
  if (DRIVE_LIGHTS.has(nav.signature)) { DRIVE.lights = DRIVE_LIGHTS.get(nav.signature); driveDrawLights(); return; }
  const q = DriveNav.lightsQuery(nav, (S.locs || []).filter(locHasCoords));
  if (!q) { DRIVE.lights = []; return; }
  if (offlineNow()) { DRIVE.lightsErr = true; return; }
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
  DRIVE.lightsCtl = ctl; DRIVE.lightsAttempts++; DRIVE.lightsErr = false;
  try {
    const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    if (!json || !Array.isArray(json.elements) || json.elements.length > 5000 || json.remark) throw new Error('Réponse des feux incomplète');
    if (DRIVE.lightsCtl !== ctl || !DRIVE.open) return;
    const list = DriveNav.lights(json, nav);
    DRIVE_LIGHTS.set(nav.signature, list); while (DRIVE_LIGHTS.size > 6) DRIVE_LIGHTS.delete(DRIVE_LIGHTS.keys().next().value);
    DRIVE.lights = list; driveDrawLights();
  } catch (e) {
    if (DRIVE.lightsCtl === ctl && DRIVE.open) { DRIVE.lightsErr = true; DRIVE.lightsRetryAt = Date.now() + 30000 * DRIVE.lightsAttempts; }
  } finally {
    clearTimeout(to);
    if (DRIVE.lightsCtl === ctl) { DRIVE.lightsCtl = null; if (DRIVE.open) driveTick(); }
  }
}
// Compteur : dernier relevé + km du trajet, relevé du jour (même chronologie que Garage). Refusé, sans écriture, s'il n'existe
// aucun relevé, s'il contredit un relevé ou une dépense, ou s'il implique un saut invraisemblable.
function driveOdoAdd(car, km) {
  if (LOCKED() || DEMO.on) return { ok: false, msg: 'Compteur non modifié : application verrouillée ou démo' };
  if (!car || !Number.isFinite(km) || km <= 0) return { ok: false, msg: 'Compteur non modifié : km du trajet inconnus' };
  const lo = lastOdo(car); if (!lo) return { ok: false, msg: 'Compteur jamais saisi pour ' + (car.short || car.name) + ' : enregistre-le une fois dans Garage' };
  const today = liveNow().slice(0, 10), v = Math.round(lo.km + km);
  const clash = RcInbox.kmConflict({ ...car, odo: Garage.odoLive(car.odo).filter(o => o.d !== today) }, today, v);
  if (clash) return { ok: false, msg: 'Compteur non modifié : ' + v.toLocaleString('fr-FR') + ' km contredirait ' + clash.label + ' · vérifie-le dans Garage' };
  if (Garage.kmJump(car, today, v)) return { ok: false, msg: 'Compteur non modifié : saut invraisemblable · vérifie-le dans Garage' };
  car.odo = Garage.odoReplace(car.odo, today, v); saveSettings();
  return { ok: true, from: lo.km, km: v };
}
// Bip d'approche : préférence de l'appareil (désactivé par défaut), son court généré sur place (aucun fichier, aucun réseau).
// Safari n'autorise le son qu'après un appui : le contexte audio est ouvert par le bouton 🔔. Pas de vibration (non disponible).
const DRIVE_BEEP_KEY = 'twrc.drive.beep';
const driveBeepOn = () => lsGet(DRIVE_BEEP_KEY) === '1';
function driveBeepToggle(btn) {
  const on = !driveBeepOn(); lsSet(DRIVE_BEEP_KEY, on ? '1' : '0');
  if (on) { try { DRIVE.audio = DRIVE.audio || new (window.AudioContext || window.webkitAudioContext)(); DRIVE.audio.resume && DRIVE.audio.resume(); } catch (e) { DRIVE.audio = null; } }
  if (btn) { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.textContent = on ? '🔔' : '🔕'; }
  driveSet('foot', on ? 'Bip activé à 300 m de chaque feu' : 'Bip désactivé');
}
function driveBeep() {
  DRIVE.beeps = (DRIVE.beeps || 0) + 1;
  try {
    const a = DRIVE.audio; if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime;
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + 0.2);
  } catch (e) { /* son indisponible : le bandeau reste affiché */ }
}
function driveTripCar(t) { const id = (t && t.carId) || appDay().activeCarId; return S.cars.find(c => c.id === id) || null; }
function driveTripKm(t) { const l = t && (t.planL || t.l); return DriveNav.tripKm(DRIVE.fixTs ? driveFollowed(DRIVE.last) : null, l && Number.isFinite(l.km) ? l.km : DRIVE.route && DRIVE.route.km); }
// « BIEN ARRIVÉ » : clôture par la même machine que l'arrivée GPS (journal, lieu confirmé), puis km ajoutés au compteur.
function driveArrived() {
  const t = driveTrip();
  if (!t || LIVE.key !== t.key || DRIVE.key !== t.key) { driveSet('foot', 'Trajet déjà terminé ou introuvable'); return; }
  const car = driveTripCar(t), k = driveTripKm(t);
  liveArrive('confirmé');
  const odo = k ? driveOdoAdd(car, k.km) : { ok: false, msg: 'Compteur non modifié : km du trajet inconnus' };
  DRIVE.arrived = { key: t.key, to: t.to || 'destination', car, k, odo };
  rebuild(); renderAll(); driveTick();
}
// Arrivée détectée par le GPS pendant le mode en direct : même écran, compteur ajouté seulement sur appui.
function driveOdoConfirm() {
  const a = DRIVE.arrived; if (!a || a.odo) return;
  a.odo = a.k ? driveOdoAdd(a.car, a.k.km) : { ok: false, msg: 'Compteur non modifié : km du trajet inconnus' };
  renderAll(); driveTick();
}
function driveArrivedHtml(a) {
  const km = a.k ? '+' + a.k.km + ' km' + (a.k.src === 'route' ? ' (itinéraire prévu)' : '') : 'km inconnus';
  const odo = !a.odo ? '<button type="button" class="btn pri" data-act="drive-odo">Ajouter ' + esc(km) + ' au compteur</button>'
    : a.odo.ok ? '<p>Compteur ' + esc(a.car ? a.car.short || a.car.name : '') + ' : <b>' + a.odo.km.toLocaleString('fr-FR') + ' km</b> <small>(relevé du jour, estimé : dernier relevé + km du trajet · corrigeable dans Garage)</small></p>'
    : '<p class="dv-warn">' + esc(a.odo.msg) + '</p>';
  if (a.free) return '<b>✅ TRAJET TERMINÉ</b><p>' + esc(km) + ' parcourus (GPS) · ' + esc(a.car ? a.car.short || a.car.name : '') + '</p>' + odo + '<button type="button" class="btn" data-act="drive-close">Fermer</button>';
  return '<b>✅ ARRIVÉ · ' + esc(String(a.to).toUpperCase()) + '</b><p>' + esc(km) + ' · position : ' + esc(a.to) + ' confirmée</p>' + odo +
    '<button type="button" class="btn" data-act="drive-close">Fermer</button>';
}
function driveTick() {
  if (!DRIVE.open) return;
  const box = document.querySelector('#liveDrive [data-dv="arrived"]'), arrive = document.querySelector('#liveDrive .dv-arrive');
  // Arrivée (bouton ou GPS) : écran d'arrivée, le cockpit s'arrête.
  if (!DRIVE.arrived && DRIVE.key && LIVE.lastDone && LIVE.lastDone.key === DRIVE.key && LIVE.key !== DRIVE.key) {
    const t = { key: DRIVE.key, to: DRIVE.to, carId: DRIVE.carId, planL: DRIVE.plan };
    DRIVE.arrived = { key: DRIVE.key, to: DRIVE.to || 'destination', car: driveTripCar(t), k: driveTripKm(t), odo: null };
  }
  if (DRIVE.arrived) {
    const fe = document.querySelector('#liveDrive .dv-freeend'); if (fe) fe.hidden = true;
    if (box) { const h = driveArrivedHtml(DRIVE.arrived); if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; } box.hidden = false; }
    if (arrive) arrive.hidden = true;
    const la0 = document.querySelector('#liveDrive [data-dv="lightAlert"]'); if (la0) la0.hidden = true;
    driveGuide(false);
    const root = $('#liveDrive'); if (root) root.classList.add('dv-arrived');
    driveSet('gps', 'Trajet terminé'); return;
  }
  if (DRIVE.free) { driveFreeTick(); return; }
  const t = driveTrip();
  if (!t) { driveSet('foot', 'Aucun trajet en cours ni prévu'); return; }
  if (DRIVE.key !== t.key) {
    if (DRIVE.lightsCtl) DRIVE.lightsCtl.abort();
    Object.assign(DRIVE, { key: t.key, to: t.to, carId: t.carId || appDay().activeCarId, plan: t.planL || t.l, last: null, hist: [], nav: null, navAt: 0, navAsked: null, km0: 0, off: null, lights: null, lightsSig: null, fixTs: 0, navFuzzy: false, refineAt: 0, summitCalls: 0, summitKey: null, summitT: null, summitLast: null, summitCol: null, summitCache: null, summitCol: null });
    Object.assign(DRIVE, { lightsCtl: null, lightsAttempts: 0, lightsRetryAt: 0, lightsErr: false });
    DRIVE.navGen++; if (DRIVE.mv) { DRIVE.mv.remove(); DRIVE.mv = null; DRIVE.map = null; }
  }
  const planned = LiveRoute.route(t, null), route = DRIVE.nav || planned;
  // Jour / nuit selon le soleil à la position (sinon au départ du tracé), jamais selon le mode sombre du téléphone ; changé en direct.
  const sunAt = FIX && liveFresh(FIX, LIVE_AGE_RUN) ? [FIX.lat, FIX.lon] : route ? route.pts[0] : null, rootEl = $('#liveDrive');
  const night = sunAt ? DriveNav.isNight(sunAt[0], sunAt[1], Date.now()) : true;
  if (rootEl) rootEl.classList.toggle('dv-night', night);
  if (DRIVE.route !== route) driveDrawRoute(route, !DRIVE.route);
  if (!DRIVE.mv) driveMap(route, night);
  else DRIVE.mv.setTheme(night);
  const active = !!(LIVE.key === t.key && LIVE.phase === 'active');
  const fresh = active && FIX && liveFresh(FIX, LIVE_AGE_RUN) && FIX.ts >= appGpsFloor() ? FIX : null;
  // Tracé complet demandé une fois par trajet (et redemandé depuis ta position au démarrage si l'ouverture était avant).
  const ask = active ? (fresh ? 'gps' : null) : 'plan';
  if (ask && DRIVE.navAsked !== ask && !(DRIVE.navAsked === 'gps' && ask === 'plan')) { DRIVE.navAsked = ask; driveNavRequest(t, ask === 'gps' ? fresh : null, false); }
  const g = LiveRoute.gps({ route, fix: FIX, previous: DRIVE.last, now: Date.now(), floor: appGpsFloor(), enabled: !!S.gpsAuto, active,
    held: PLACE_HOLD || !!PLACE_PENDING, hidden: document.hidden, locked: LOCKED(), demo: DEMO.on });
  if (g.valid) { DRIVE.last = g; DRIVE.fixTs = g.ts; }
  // Sortie d'itinéraire : relevés précis loin du tracé, 3 de suite → recalcul immédiat depuis ta position (au plus toutes les 20 s).
  const dest = liveArrDest(t), destKm = fresh && dest ? distKm(fresh, dest) : null;
  if (fresh && fresh.ts !== DRIVE.offTs) {
    DRIVE.offTs = fresh.ts;
    const priv = driveNearPrivate(fresh);
    DRIVE.off = DriveNav.offStep(DRIVE.off, { route, fix: fresh, destKm: priv ? 0 : destKm, now: Date.now(), routeAt: DRIVE.navAt });
    if (DRIVE.navFuzzy && !priv && !DRIVE.rerouting && Date.now() - DRIVE.refineAt >= 20e3) { DRIVE.refineAt = Date.now(); DRIVE.off = null; driveNavRequest(t, fresh, false); }
    else if (DRIVE.off.off && !DRIVE.rerouting && Date.now() - DRIVE.rerouteAt >= 20e3 && DRIVE.reroutes < 40) driveNavRequest(t, fresh, true);
    if (DRIVE.prevFix && DriveNav.meters([DRIVE.prevFix.lat, DRIVE.prevFix.lon], [fresh.lat, fresh.lon]) >= 15 || !DRIVE.prevFix) DRIVE.prevFix = { lat: fresh.lat, lon: fresh.lon, ts: fresh.ts };
  }
  const pose = g.valid ? g : DRIVE.last, fraction = pose ? pose.fraction : active ? null : 0;
  const m = LiveRoute.metrics(route, fraction, { now: Date.now() });
  const total = route ? route.km : null, followed = Number.isFinite(fraction) && Number.isFinite(total) ? DRIVE.km0 + total * fraction : DRIVE.km0 > 0 ? DRIVE.km0 : null;
  driveSet('done', driveKm(followed));
  driveSet('left', Number.isFinite(m.remaining) ? driveKm(m.remaining) : Number.isFinite(total) && !active ? driveKm(total) : '—');
  const bar = document.querySelector('#liveDrive [data-dv="bar"]'); if (bar) bar.style.width = (Number.isFinite(m.percent) ? m.percent : 0) + '%';
  // Vitesse : celle du GPS quand il la fournit, sinon la distance SUIVIE pendant les 90 dernières secondes (relevés valides
  // seulement, au moins 5 s d'écart, continue d'un tracé à l'autre) ; jamais inventée ni calculée entre deux relevés identiques.
  if (g.valid && Number.isFinite(followed)) {
    const h = DRIVE.hist || (DRIVE.hist = []); if (!h.length || h[h.length - 1].ts !== g.ts) h.push({ ts: g.ts, km: followed });
    while (h.length && g.ts - h[0].ts > 90e3) h.shift();
  }
  const fixV = FIX && Number.isFinite(FIX.speed) && FIX.speed >= 0 && FIX.acc <= 30 ? FIX.speed * 3.6 : null, h = DRIVE.hist || [];
  const old = h.length > 1 ? h[0] : null, cur = h[h.length - 1];
  DRIVE.speed = fixV != null ? fixV : old && cur.ts - old.ts >= 5e3 ? Math.max(0, cur.km - old.km) / ((cur.ts - old.ts) / 3600e3) : null;
  if (!(DRIVE.speed < 300)) DRIVE.speed = null;
  driveSet('speed', active && (g.valid || DRIVE.off && DRIVE.off.n) && Number.isFinite(DRIVE.speed) ? f0(DRIVE.speed) : '—');
  const navMin = DRIVE.nav && Number.isFinite(DRIVE.nav.min) ? routeTravelMin(DRIVE.nav.min) : null;
  const leftMin = active && Number.isFinite(fraction) ? (navMin != null ? navMin * (1 - fraction) : m.remainingMin) : null;
  const eta = active && Number.isFinite(leftMin) ? addMin(liveNow().slice(0, 16), Math.round(leftMin)) : t.arr;
  driveSet('eta', eta && /T\d{2}:\d{2}/.test(eta) ? eta.slice(11, 16) : '—');
  driveSet('sector', m.sector ? 'S' + m.sector : '—');
  // Feux : nombre encore devant et distance du prochain (le long du tracé).
  driveLightsFetch(DRIVE.nav);
  const L0 = DRIVE.lights, along = pose && route ? route.total * pose.fraction : active ? null : 0, la = L0 ? DriveNav.lightsAhead(L0, along) : null;
  driveSet('lightsLabel', la ? DriveNav.lightsLabel(la, driveM) : DRIVE.lightsErr ? 'Feux indisponibles' + (DRIVE.lightsAttempts < 3 ? ' · nouvel essai automatique' : '') : 'Feux : recherche…');
  // Alerte d'approche (≤ 300 m) : pastille sur la carte, et un bip court par feu si l'utilisateur l'a activé (appareil seulement).
  const alert = active && g.valid && L0 ? DriveNav.lightAlert(L0, along) : null, ab = document.querySelector('#liveDrive [data-dv="lightAlert"]');
  if (ab) {
    ab.hidden = !alert;
    if (alert) driveSet('lightAlertText', alert.dist < 30 ? (alert.chain > 1 ? alert.chain + ' feux enchaînés' : 'Feu') + ' · maintenant'
      : (alert.chain > 1 ? alert.chain + ' feux enchaînés dans ' : 'Feu dans ') + driveM(alert.dist));
  }
  if (alert && DRIVE.beepKey !== alert.key) { DRIVE.beepKey = alert.key; if (driveBeepOn()) driveBeep(); }
  const offNow = DRIVE.off && DRIVE.off.n > 0 && active;
  driveAltRow(route, along, active);
  driveGuide(active && g.valid && !offNow && !DRIVE.rerouting && !!DRIVE.nav && route === DRIVE.nav, along);
  driveSet('gps', active ? (g.valid ? 'GPS ± ' + Math.round(g.acc) + ' m' : offNow || DRIVE.rerouting ? 'Hors itinéraire' : g.reason) : 'Départ prévu ' + tripWhen(t.dep));
  const nav = document.querySelector('#liveDrive [data-dv="nav"]');
  if (nav) { const show = !!DRIVE.navMsg && (DRIVE.rerouting || Date.now() - DRIVE.navMsgAt < 10e3); nav.hidden = !show; if (show) driveSet('nav', DRIVE.navMsg); }
  // Prochain danger : le premier point du tour du parcours (même lecture que le mur des stands) après la position actuelle.
  const rows = t.seq && typeof F1Pure.routeTower === 'function' ? F1Pure.routeTower(t.seq) : [], doneKm = Number.isFinite(followed) ? followed : 0;
  const next = rows.find(r => r.level != null && r.level >= 1 && (r.km == null || r.km >= doneKm - 0.5));
  const nb = document.querySelector('#liveDrive .dv-next');
  if (nb) nb.dataset.dvLv = next ? String(next.level) : '0';
  driveSet('next', next ? (Number.isFinite(next.km) ? (next.km - doneKm > 0.5 ? 'Dans ' + driveKm(next.km - doneKm) + ' km' : 'Maintenant') : 'Sur le parcours') : 'RAS');
  driveSet('nextWhat', next ? (next.notes && next.notes.length ? next.notes[0] : next.label || '') + (Number.isFinite(next.rain) && next.rain >= 0.2 ? ' · ' + F1Pure.rainShown(next.rain) + ' mm/h' : '') : 'Aucun signal notable devant toi');
  // « BIEN ARRIVÉ » : trajet démarré et arrivée proche (≤ 400 m de la destination, ≤ 300 m restants, ou arrivée probable).
  const near = active && (Number.isFinite(destKm) && destKm <= 0.4 || Number.isFinite(m.remaining) && m.remaining <= 0.3 || LIVE.near != null);
  if (arrive) {
    const k = near ? driveTripKm(t) : null, label = '✅ BIEN ARRIVÉ' + (k ? ' · +' + k.km + ' km au compteur' : '');
    arrive.hidden = !near; if (near && arrive.textContent !== label) arrive.textContent = label;
  }
  driveSet('foot', [route ? (DRIVE.nav ? '' : 'Itinéraire détaillé en préparation') : 'Itinéraire en préparation', DRIVE.wakeState, 'prévisions du modèle, pas une mesure sur la route', DRIVE.glSlow ? 'carte 3D trop lente sur cet appareil : carte à plat' : '', DRIVE.mv && DRIVE.mv.credit].filter(Boolean).join(' · '));
  // Hors du tracé : la voiture est montrée à sa vraie position (jamais recollée sur l'ancien tracé), cap = direction suivie.
  // Caméra : sens de la marche, zoom automatique selon la vitesse et la prochaine manœuvre (étapes OSRM du tracé détaillé).
  const carAt = g.valid ? g.point : offNow && fresh ? [fresh.lat, fresh.lon] : pose && pose.point;
  const head = g.valid ? g.bearing : offNow && fresh && DRIVE.prevFix ? DriveNav.heading(DRIVE.prevFix, fresh) : pose ? pose.bearing : null;
  const stepNext = DRIVE.nav && Number.isFinite(along) ? DriveNav.nextStep(DRIVE.nav, along) : null;
  DRIVE.zoom = DriveNav.autoZoom(Number.isFinite(DRIVE.speed) ? DRIVE.speed : null, stepNext ? stepNext.along - along : null);
  if (DRIVE.mv && carAt) {
    DRIVE.mv.setCar(carAt, head);
    if (route && pose) { const k = route.cumulative.findIndex(c => c >= route.total * pose.fraction); DRIVE.mv.setDone(route.pts.slice(0, Math.max(1, k)).concat([pose.point])); }
    if (DRIVE.follow && (active || pose)) DRIVE.mv.follow(carAt, head, DRIVE.zoom);
  }
}
