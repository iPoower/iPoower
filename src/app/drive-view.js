// Mode « EN DIRECT » (20/11/2026, maquette A « cockpit » validée) : plein écran iPhone pendant le trajet. Carte Plan IGN
// (Géoplateforme, repli OpenStreetMap) qui suit ta position, km parcourus et restants, vitesse GPS, arrivée, secteur et
// prochain danger météo du parcours. Réutilise le trajet canonique (LiveRoute, FIX, routeTower) ; aucun nouveau GPS.
// Ajouts du 20/11 (soir) : tracé routier complet (OSRM), sortie d'itinéraire détectée → recalcul immédiat depuis ta position
// (même réponse reprise par le suivi du trajet : km, arrivée, météo), feux tricolores du parcours (OpenStreetMap, Overpass)
// avec alerte d'approche à 300 m (bandeau, bip facultatif ; la couleur du feu n'est connue de personne),
// « BIEN ARRIVÉ » qui clôt le trajet (même machine que l'arrivée GPS : journal, lieu confirmé) et ajoute les km au compteur.
// Écritures : seulement la clôture du trajet et le relevé du compteur, sur appui. Pas de guidage tournant par tournant ni de radars.
const DRIVE = { open: false, map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, timer: null, wake: null, wakeState: '', prevFix: null, speed: null, hist: [], follow: true,
  nav: null, navGen: 0, navAt: 0, navAsked: null, km0: 0, off: null, rerouting: false, rerouteAt: 0, reroutes: 0, navMsg: '', navMsgAt: 0,
  lights: null, lightsSig: null, lightsLayer: null, lightsErr: false, arrived: null, fixTs: 0, navFuzzy: false, refineAt: 0, beepKey: null, beeps: 0, audio: null };
const DRIVE_LIGHTS = new Map();   // feux par tracé (mémoire de la session seulement, 6 tracés au plus)
const IGN_PLAN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const driveTrip = () => { const s = APP_CONTEXT.snapshot || {}; return s.activeTrip || s.nextTrip || null; };
function driveShell() {
  return '<div class="dv-map" role="region" aria-label="Carte du trajet en direct"></div>' +
    '<div class="dv-top"><span class="dv-tag">EN DIRECT</span><span class="dv-gps" data-dv="gps">GPS —</span>' +
    '<button type="button" class="dv-beep" data-act="drive-beep" aria-pressed="' + (driveBeepOn() ? 'true' : 'false') + '" aria-label="Bip à l’approche des feux">' + (driveBeepOn() ? '🔔' : '🔕') + '</button>' +
    '<button type="button" class="dv-close" data-act="drive-close" aria-label="Quitter le mode en direct">✕</button></div>' +
    '<div class="dv-alerts"><p class="dv-nav" data-dv="nav" role="status" hidden></p><p class="dv-lightalert" data-dv="lightAlert" role="status" hidden></p></div>' +
    '<button type="button" class="dv-recenter" data-act="drive-follow" hidden>Recentrer</button>' +
    '<div class="dv-panel">' +
    '<div class="dv-km"><div><small>PARCOURUS</small><b data-dv="done">—</b><span>km</span></div><div><small>RESTANTS</small><b data-dv="left" class="dv-left">—</b><span>km</span></div></div>' +
    '<div class="dv-bar" aria-hidden="true"><i data-dv="bar"></i></div>' +
    '<div class="dv-figs"><span><small>VITESSE GPS</small><b data-dv="speed">—</b></span><span><small>ARRIVÉE</small><b data-dv="eta">—</b></span>' +
    '<span><small>FEUX</small><b data-dv="lights">—</b><em data-dv="lightNext"></em></span><span><small>SECTEUR</small><b data-dv="sector">—</b></span></div>' +
    '<div class="dv-next" data-dv-lv="x"><b data-dv="next">—</b><span data-dv="nextWhat"></span></div>' +
    '<button type="button" class="btn pri dv-arrive" data-act="drive-arrived" hidden>✅ BIEN ARRIVÉ</button>' +
    '<div class="dv-done" data-dv="arrived" hidden></div>' +
    '<p class="dv-foot" data-dv="foot"></p></div>';
}
const driveSet = (k, v) => { const el = document.querySelector('#liveDrive [data-dv="' + k + '"]'); if (el && el.textContent !== v) el.textContent = v; };
const driveKm = v => Number.isFinite(v) ? (v < 10 ? f1(v) : f0(v)) : '—';
const driveM = m => !Number.isFinite(m) ? '' : m < 1000 ? Math.round(m / 10) * 10 + ' m' : f1(m / 1000) + ' km';
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
  Object.assign(DRIVE, { map: null, base: null, marker: null, line: null, done: null, key: null, route: null, last: null, prevFix: null, speed: null, hist: [],
    nav: null, navGen: DRIVE.navGen + 1, navAt: 0, navAsked: null, km0: 0, off: null, rerouting: false, rerouteAt: 0, reroutes: 0, navMsg: '', navMsgAt: 0,
    lights: null, lightsSig: null, lightsLayer: null, lightsErr: false, arrived: null, fixTs: 0, navFuzzy: false, refineAt: 0, beepKey: null });
  document.documentElement.classList.remove('dv-on');
  if (root) { root.hidden = true; root.innerHTML = ''; root.classList.remove('dv-arrived'); }
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
  const base = L.tileLayer(IGN_PLAN, { maxZoom: 19, maxNativeZoom: 19, className: dark ? 'dv-dark' : '', attribution: '© IGN Géoplateforme · Itinéraire © OSRM · Feux © OpenStreetMap' }).addTo(map);
  base.on('tileload', () => { loaded = true; });
  base.on('tileerror', () => {
    if (++errors >= 3 && !loaded && DRIVE.map === map && !map._osm) {
      map._osm = 1; map.removeLayer(base);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: dark ? 'osm-dark' : '', attribution: '© OpenStreetMap · Itinéraire © OSRM' }).addTo(map);
    }
  });
  DRIVE.lightsLayer = L.layerGroup().addTo(map);
  driveDrawRoute(route, true);
  DRIVE.marker = L.marker(route ? route.pts[0] : [46.6, 2.4], { icon: L.divIcon({ className: 'dv-car', html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15] }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(map);
  map.on('dragstart', () => { DRIVE.follow = false; const b = root.querySelector('.dv-recenter'); if (b) b.hidden = false; });
  driveDrawLights();
}
// Tracé affiché = tracé suivi (DRIVE.nav, sinon tracé prévu). Redessiné à chaque nouvel itinéraire, sans recadrer si la carte suit.
function driveDrawRoute(route, fit) {
  const map = DRIVE.map; if (!map) return;
  [DRIVE.line, DRIVE.done].forEach(l => { if (l) map.removeLayer(l); });
  DRIVE.line = DRIVE.done = null; DRIVE.route = route || null;
  if (!route) { map.setView([46.6, 2.4], 6); return; }
  DRIVE.line = L.polyline(route.pts, { color: '#5fb0e8', weight: 6, opacity: .45 }).addTo(map);
  DRIVE.done = L.polyline([], { color: '#5fb0e8', weight: 6, opacity: 1 }).addTo(map);
  if (fit || !DRIVE.follow) map.fitBounds(DRIVE.line.getBounds(), { padding: [24, 24] });
}
function driveDrawLights() {
  const layer = DRIVE.lightsLayer; if (!layer || !DRIVE.map) return;
  layer.clearLayers();
  (DRIVE.lights || []).forEach(l => L.marker([l.lat, l.lon], { icon: L.divIcon({ className: 'dv-light', html: '<i></i>', iconSize: [12, 26], iconAnchor: [6, 13] }),
    interactive: false, keyboard: false, title: 'Feu tricolore (OpenStreetMap)' }).addTo(layer));
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
      driveLightsFetch(nav);
      driveTick();
    })
    .catch(() => {
      if (gen !== DRIVE.navGen) return;
      DRIVE.rerouting = false;
      if (reroute) { DRIVE.navMsg = 'Recalcul impossible pour le moment · nouvel essai dans 20 s'; DRIVE.navMsgAt = Date.now(); }
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
// Feux tricolores du parcours : une demande Overpass par tracé (mémorisée pour la session), hors portions privées.
async function driveLightsFetch(nav) {
  if (!nav || !nav.full || DRIVE.lightsSig === nav.signature) return;
  DRIVE.lightsSig = nav.signature; DRIVE.lightsErr = false;
  if (DRIVE_LIGHTS.has(nav.signature)) { DRIVE.lights = DRIVE_LIGHTS.get(nav.signature); driveDrawLights(); return; }
  DRIVE.lights = null; driveDrawLights();
  const q = DriveNav.lightsQuery(nav, (S.locs || []).filter(locHasCoords));
  if (!q) { DRIVE.lights = []; return; }
  if (offlineNow()) { DRIVE.lightsErr = true; return; }
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = DriveNav.lights(await r.json(), nav);
    DRIVE_LIGHTS.set(nav.signature, list); while (DRIVE_LIGHTS.size > 6) DRIVE_LIGHTS.delete(DRIVE_LIGHTS.keys().next().value);
    if (DRIVE.lightsSig === nav.signature && DRIVE.open) { DRIVE.lights = list; driveDrawLights(); driveTick(); }
  } catch (e) { if (DRIVE.lightsSig === nav.signature) DRIVE.lightsErr = true; }
  finally { clearTimeout(to); }
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
    if (box) { const h = driveArrivedHtml(DRIVE.arrived); if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; } box.hidden = false; }
    if (arrive) arrive.hidden = true;
    const la0 = document.querySelector('#liveDrive [data-dv="lightAlert"]'); if (la0) la0.hidden = true;
    const root = $('#liveDrive'); if (root) root.classList.add('dv-arrived');
    driveSet('gps', 'Trajet terminé'); return;
  }
  const t = driveTrip();
  if (!t) { driveSet('foot', 'Aucun trajet en cours ni prévu'); return; }
  if (DRIVE.key !== t.key) {
    Object.assign(DRIVE, { key: t.key, to: t.to, carId: t.carId || appDay().activeCarId, plan: t.planL || t.l, last: null, hist: [], nav: null, navAt: 0, navAsked: null, km0: 0, off: null, lights: null, lightsSig: null, fixTs: 0, navFuzzy: false, refineAt: 0 });
    DRIVE.navGen++; if (DRIVE.map) { DRIVE.map.remove(); DRIVE.map = null; DRIVE.lightsLayer = null; }
  }
  const planned = LiveRoute.route(t, null), route = DRIVE.nav || planned;
  if (!DRIVE.map) driveMap(route, !isLight());
  else if (DRIVE.route !== route) driveDrawRoute(route, false);
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
  const L0 = DRIVE.lights, along = pose && route ? route.total * pose.fraction : active ? null : 0, la = L0 ? DriveNav.lightsAhead(L0, along) : null;
  driveSet('lights', la ? String(la.count) : '—');
  driveSet('lightNext', la && la.count && la.next != null ? 'à ' + driveM(la.next) : la && !la.count ? 'aucun' : DRIVE.lightsErr ? 'indisponibles' : '');
  // Alerte d'approche (≤ 300 m) : grand bandeau, et un bip court par feu si l'utilisateur l'a activé (appareil seulement).
  const alert = active && g.valid && L0 ? DriveNav.lightAlert(L0, along) : null, ab = document.querySelector('#liveDrive [data-dv="lightAlert"]');
  if (ab) {
    ab.hidden = !alert;
    if (alert) driveSet('lightAlert', '🚦 ' + (alert.dist < 30 ? (alert.chain > 1 ? alert.chain + ' FEUX ENCHAÎNÉS' : 'FEU') + ' · MAINTENANT'
      : (alert.chain > 1 ? alert.chain + ' FEUX ENCHAÎNÉS DANS ' : 'FEU DANS ') + driveM(alert.dist)));
  }
  if (alert && DRIVE.beepKey !== alert.key) { DRIVE.beepKey = alert.key; if (driveBeepOn()) driveBeep(); }
  const offNow = DRIVE.off && DRIVE.off.n > 0 && active;
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
  driveSet('foot', [route ? (DRIVE.nav ? '' : 'Itinéraire détaillé en préparation') : 'Itinéraire en préparation', DRIVE.wakeState, 'prévisions du modèle, pas une mesure sur la route'].filter(Boolean).join(' · '));
  // Hors du tracé : la voiture est montrée à sa vraie position (jamais recollée sur l'ancien tracé).
  const carAt = g.valid ? g.point : offNow && fresh ? [fresh.lat, fresh.lon] : pose && pose.point;
  if (DRIVE.map && carAt) {
    if (DRIVE.marker) DRIVE.marker.setLatLng(carAt);
    if (DRIVE.done && route && pose) { const k = route.cumulative.findIndex(c => c >= route.total * pose.fraction); DRIVE.done.setLatLngs(route.pts.slice(0, Math.max(1, k)).concat([pose.point])); }
    if (DRIVE.follow) DRIVE.map.setView(carAt, Math.max(DRIVE.map.getZoom() || 15, 15), { animate: false });
  }
}
