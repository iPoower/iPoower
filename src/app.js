/* ===================== APPLICATION ===================== */
const $ = s => document.querySelector(s);
const APP_STORAGE = (() => { try { return DeviceStorage.guard(localStorage, () => !!window.TWRC_STORAGE_ERROR); }
  catch (e) { return { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }; } })();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Données du relais (observations, agenda chiffré, DATEX) : même origine sur GitHub Pages ; sur une origine dédiée
// (Cloudflare Pages), lues depuis RC_DATA_BASE fixé à la construction. Rien de personnel n'y transite en clair.
const dataUrl = f => (window.TWRC_DATA_BASE || '') + f;
const lsGet = k => { try { return APP_STORAGE.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { APP_STORAGE.setItem(k, v); } catch (e) { /* stockage indisponible */ } };
const locHasCoords = l => !!l && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180;
const calendarPlaces = (settings = S) => [...(settings.locs || []), ...(settings.customs || [])];
const calendarRelevant = e => calendarEventRelevant(e, calendarPlaces());
const calendarPlace = e => calendarEventPlace(e, calendarPlaces());
const calendarSpatial = e => !!calendarPlace(e);

/* ---------- réglages (code neutre : aucune donnée personnelle par défaut) ---------- */
const BASE = {
  v: 1, configured: 0,
  locs: [
    { id: 'home', name: 'Lieu principal', sub: '', lat: 48.8566, lon: 2.3522 },
    { id: 'work', name: 'Lieu de travail', sub: '', lat: 50.6292, lon: 3.0573 }
  ],
  customs: [],
  work: { from: 'home', to: 'work', durMin: 40, dep: '07:30', ret: '17:30', days: [1, 2, 3, 4, 5] },
  horizon: 12, rainThr: 5, dept: { code: '', name: '' }, calib: [], journal: {}, gpsAuto: 0, flags: { weatherEvidenceV2: 'on' }, road: { on: 1 },
  alerts: { t7: 1, t5s: 1, t0: 1, ice: 1, snow: 1, rain: 1, fog: 1, vis: 1, frost: 1, drop: 1, pre: 1, press: 1, age: 1, glare: 1, mont: 1, vigi: 1, ens: 1, rain15: 1 },
  cars: [
    { id: 'car1', name: 'Voiture 1', short: 'Voiture 1', spec: '', sporty: 0,
      tire: { type: 'summer', brand: '', model: '', size: '', tread: null, treadAv: null, treadAr: null, treadEst: 0, press: '', mounted: '', dot: '', info: '', pchk: { date: '', T: null } },
      plan: { on: 0, brand: '', model: '', size: '', ordered: '', etaFrom: '', etaTo: '', etaChecked: '', date: '', appointmentDate: '', appointmentConfirmed: 0 } },
    { id: 'car2', name: 'Voiture 2', short: 'Voiture 2', spec: '', sporty: 0,
      tire: { type: 'allseason', brand: '', model: '', size: '', tread: null, treadAv: null, treadAr: null, treadEst: 0, press: '', mounted: '', dot: '', info: '', pchk: { date: '', T: null } },
      plan: { on: 0, brand: '', model: '', size: '', ordered: '', etaFrom: '', etaTo: '', etaChecked: '', date: '', appointmentDate: '', appointmentConfirmed: 0 } }
  ]
};
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(d, s) {
  if (s == null) return clone(d);
  if (Array.isArray(d) || typeof d !== 'object' || d === null) return s;
  const o = {};
  Object.keys(d).forEach(k => { o[k] = (k in s) ? deepMerge(d[k], s[k]) : clone(d[k]); });
  Object.keys(s).forEach(k => { if (!(k in o)) o[k] = s[k]; });
  return o;
}
function normalize(saved, base) {
  const S = deepMerge(base, saved ? { ...saved, locs: undefined, cars: undefined, customs: undefined } : null);
  if (saved && Array.isArray(saved.locs)) S.locs = base.locs.map((d, i) => deepMerge(d, saved.locs[i]));
  if (saved && Array.isArray(saved.cars)) S.cars = base.cars.map((d, i) => deepMerge(d, saved.cars[i]));
  S.customs = saved && Array.isArray(saved.customs) ? saved.customs : clone(base.customs);
  return S;
}
// Migration étroite d'une ancienne identité véhicule déjà enregistrée.
// Elle ne touche qu'à la combinaison historique exacte ; aucun véhicule générique n'est renommé.
function repairVehicleIdentity(settings) {
  if (!settings || !Array.isArray(settings.cars)) return false;
  const car = settings.cars.find(c => c && c.id === '308');
  if (!car || car.name !== 'Peugeot 308 Féline 2.0 HDi' || car.spec !== '136 ch FAP · 2009 · BVM6 · traction avant') return false;
  car.name = 'Peugeot 308 2.0 HDi 136 Premium Pack';
  car.short = '308';
  car.spec = '136 ch FAP · Premium Pack · 2009 · BVM6 · traction avant';
  return true;
}
// réglages chiffrés (site public) : déchiffrés une fois avec le code, puis gardés sur l'appareil
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function unseal(pass) {
  const S0 = window.TWRC_SEALED; if (!S0 || !crypto || !crypto.subtle) return false;
  let txt;
  try {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(S0.s), iterations: S0.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    txt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(S0.i) }, key, b64(S0.c))); JSON.parse(txt);
  } catch (e) { unseal.error = e.name === 'OperationError' ? 'Code incorrect.' : 'Déverrouillage impossible : chiffrement indisponible. Tes données restent conservées.'; return false; }
  const VS = window.TWRC_VAULT;
  if (VS) {
    // Sécurité V1 : le préréglage déchiffré et le code ne sont conservés que dans le coffre chiffré (jamais en clair).
    const raw = window.TWRC_RAW_STORAGE, had = VS.mode === 'vault' || !!(raw && (raw.getItem(SessionVault.VAULT) || raw.getItem(DeviceStorage.VAULT)));
    try { await VS.unlock(pass, { 'twrc.plain': txt, 'twrc.plain.v': String(window.TWRC_SEALED_V) }); }
    catch (e) {
      unseal.error = e.unsupported ? 'Déverrouillage impossible : ' + e.message : e.name === 'OperationError' ? 'Ce code ouvre la configuration, mais le coffre de cet appareil a été chiffré avec un autre code : saisis le code utilisé lors du chiffrement. Rien n’a été modifié.'
        : 'Déverrouillage impossible : stockage local indisponible ou plein. Tes données restent conservées.';
      return false;
    }
    window.TWRC_STORAGE_ERROR = false; unseal.restored = had; return true;
  }
  // Sans coffre de session (stockage en récupération, chiffrement indisponible au démarrage) : aucun déverrouillage plutôt
  // qu'une copie en clair du code ou des réglages (sécurité V1). Les données restent conservées ; un redémarrage relance le coffre.
  unseal.error = 'Déverrouillage impossible pour l’instant : stockage local en récupération ou chiffrement indisponible. Tes données restent conservées ; rouvre l’app.';
  return false;
}
// coffre de session verrouillé (code demandé) ; ancien coffre v1 lu sur le stockage brut
const vaultLocked = () => !!(window.TWRC_VAULT && window.TWRC_VAULT.locked());
const storeLocked = () => vaultLocked() || DeviceStorage.isLocked(window.TWRC_RAW_STORAGE || localStorage);
// tout rechargement attend la fin de l'écriture chiffrée en cours (aucune modification perdue)
async function reloadSafe(delay = 0) {
  try { if (window.TWRC_VAULT) await window.TWRC_VAULT.flush(); } catch (e) { /* le rechargement reste possible */ }
  setTimeout(() => location.reload(), delay);
}
const LOCKED = () => DeviceStorage.isFrozen() || !!window.TWRC_STORAGE_ERROR || storeLocked() || !!window.TWRC_SEALED && !window.TWRC_PRESET;
async function lockDevice(button) {
  if (DeviceStorage.isFrozen()) return;
  const VS = window.TWRC_VAULT, vault = VS && VS.mode === 'vault';
  if (!vault && !lsGet('twrc.key')) { alert('Le code de configuration est nécessaire pour protéger tes données.'); return; }
  // Trajet en cours : verrouiller arrête le suivi GPS ; jamais sans confirmation explicite.
  if (APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.activeTrip && !confirm('Un trajet est en cours : verrouiller arrête son suivi GPS sur cet appareil. Verrouiller quand même ?')) return;
  if (button) { button.disabled = true; button.textContent = 'Protection des données…'; }
  try {
    // Ne pas quitter une session possédant des modifications encore seulement en mémoire.
    localStorage.setItem('twrc.settings.v1', JSON.stringify(S));
    if (localStorage.getItem('twrc.settings.v1') !== JSON.stringify(S) || !USER_STORE.retry()) throw new Error('Données locales non confirmées.');
    stopGps();
    if (vault) {
      await VS.lock();   // coffre réécrit et relu, clé de session effacée, autres onglets prévenus
      DeviceStorage.freeze(true); location.reload(); return;
    }
    DeviceStorage.freeze(true);
    await DeviceStorage.lock(localStorage, lsGet('twrc.key'), crypto);
    location.reload();
  } catch (e) {
    const protectedCopy = !vault && DeviceStorage.isLocked(localStorage);
    DeviceStorage.freeze(protectedCopy);
    alert(protectedCopy ? 'Copie chiffrée conservée. Le nettoyage local doit être repris ; rouvre l’app.' : 'Verrouillage non effectué : enregistrement chiffré impossible. Tes données sont conservées sur cet appareil.');
    if (protectedCopy) location.reload();
    else if (button) { button.disabled = false; button.textContent = 'Verrouiller cet appareil'; }
  }
}
// Préréglage éventuel injecté à la construction (version privée uniquement)
const DEFAULTS = (typeof window !== 'undefined' && window.TWRC_PRESET && !LOCKED()) ? normalize({ ...window.TWRC_PRESET, configured: 1 }, BASE) : clone(BASE);
repairVehicleIdentity(DEFAULTS);
// Configuration privée transmise dans le fragment d'URL (#cfg=...) : jamais envoyée au serveur
let CFG_IMPORTED = false;
function hashCfg() {
  try {
    const h = location.hash || '';
    if (!h.startsWith('#cfg=')) return null;
    const raw = h.slice(5), b = raw.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '==='.slice((b.length + 3) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    return { raw, cfg: JSON.parse(json) };
  } catch (e) { return null; }
}
// Réparer le reste de l'ancien « + Destination » : seule la dernière destination ajoutée sans choix explicite du travail.
// Un travail sélectionné volontairement (edits work.to / work) ou un préréglage personnalisé reste intact.
function repairStoredWork(saved) {
  const edits = saved && saved.edits || {}, last = saved && Array.isArray(saved.customs) && saved.customs[saved.customs.length - 1];
  const work = saved && saved.work, expected = DEFAULTS.work && DEFAULTS.work.to;
  if (!work || !last || !edits.customs || edits['work.to'] || edits.work || work.to !== last.id || work.to === expected ||
      !DEFAULTS.locs.some(l => l.id === expected)) return false;
  const previous = work.to; work.to = expected;
  // L'ancienne confirmation peut viser le faux travail : demander une nouvelle confirmation, sans inventer une position.
  try {
    const place = JSON.parse(lsGet('twrc.place.v1') || 'null');
    if (place) {
      if (place.conf && place.conf.placeId === previous) place.conf = null;
      if (place.last && place.last.placeId === previous) place.last = null;
      lsSet('twrc.place.v1', JSON.stringify(place));
    }
  } catch (e) { /* confirmation illisible : sans effet sur les autres réglages */ }
  lsSet('twrc.settings.v1', JSON.stringify(saved)); return true;
}
function loadSettings() {
  if (window.TWRC_STORAGE_ERROR || storeLocked()) return clone(BASE);
  let saved = null;
  try { saved = JSON.parse(lsGet('twrc.settings.v1') || 'null'); } catch (e) { saved = null; }
  repairStoredWork(saved);
  // nouveau préréglage publié : il remplace une fois les anciens réglages de l'appareil
  if (window.TWRC_PRESET && window.TWRC_PRESET_V && lsGet('twrc.presetv') !== window.TWRC_PRESET_V) {
    // on garde ce qui ne se trouve que sur le téléphone : contrôles de pression, DOT, profondeurs, jeux de pneus
    const old = saved;
    const keep = saved && Array.isArray(saved.cars) ? Object.assign(saved.cars.map(c => c ? { tire: c.tire ? { pchk: c.tire.pchk, dot: c.tire.dot, tread: c.tire.tread, treadAv: c.tire.treadAv, treadAr: c.tire.treadAr, treadEst: c.tire.treadEst, treads: c.tire.treads, mountKm: c.tire.mountKm, lastRot: c.tire.lastRot } : null, sets: c.sets, photo: c.photo, odo: c.odo } : null), { calib: saved.calib, journal: saved.journal }) : null;
    saved = null; lsSet('twrc.presetv', window.TWRC_PRESET_V);
    try { APP_STORAGE.removeItem('twrc.settings.v1'); } catch (e) { /* stockage indisponible */ }
    if (keep) {
      const fresh = normalize(null, DEFAULTS);
      keep.forEach((k, i) => { const c = fresh.cars[i]; if (!k || !c) return; if (k.sets) c.sets = k.sets; if (k.photo) c.photo = k.photo; if (k.odo) c.odo = k.odo;
        if (k.tire) ['pchk', 'dot', 'tread', 'treadAv', 'treadAr', 'treadEst', 'treads', 'mountKm', 'lastRot'].forEach(f => { const v = k.tire[f]; if (v != null && v !== '' && !(f === 'pchk' && !v.date)) c.tire[f] = v; }); });
      const oldCalib = keep.calib;
      saved = { ...fresh, configured: 1, calib: oldCalib || [], journal: keep.journal || {} }; reapplyEdits(saved, old); lsSet('twrc.settings.v1', JSON.stringify(saved));
    }
  }
  const hc = hashCfg();
  // on importe le lien s'il est nouveau, ou si cet appareil n'a encore aucun réglage
  if (hc && (!saved || lsGet('twrc.cfghash') !== hc.raw)) {
    saved = { ...hc.cfg, configured: 1 }; CFG_IMPORTED = true;
    lsSet('twrc.cfghash', hc.raw); lsSet('twrc.settings.v1', JSON.stringify(saved));
  }
  if (repairVehicleIdentity(saved)) lsSet('twrc.settings.v1', JSON.stringify(saved));
  return normalize(saved, DEFAULTS);
}
let S = loadSettings();
const saveSettings = () => { S.configured = 1; lsSet('twrc.settings.v1', JSON.stringify(S)); };
let TRIPCANCEL = {}; try { TRIPCANCEL = TripCancel.load(APP_STORAGE, Date.now()); } catch (e) { /* stockage indisponible */ }
let TRIPCANCELTIMER = null;
// position réelle (GPS du téléphone) : reste sur l'appareil
// @include app/user-context.js
// @include app/trip-view.js
function tripContextLocs() {
  const n = USER_STORE.state.dayContext && USER_STORE.state.dayContext.nextDestination;
  return n ? [n.originPoint, n.destinationPoint].filter(locHasCoords) : [];
}
const allLocs = () => {
  const seen = new Set();
  return [...(GPS ? [GPS] : []), ...S.locs, ...S.customs, ...tripContextLocs(), ...(PLACE.extra ? [PLACE.extra] : [])].filter(l => {
    if (!l || !l.id) return !!l;
    if (seen.has(l.id)) return false; seen.add(l.id); return true;
  });
};
// réglages modifiés à la main : ils survivent aux nouvelles versions du préréglage
function getPath(o, p) { return p.split('.').reduce((a, k) => a == null ? undefined : a[k], o); }  // déclaration hissée : utilisée dès loadSettings
function markEdit(p) { (S.edits || (S.edits = {}))[p] = 1; }
function reapplyEdits(dst, src) {
  if (!src) return;
  const ed = src.edits || {};
  Object.keys(ed).forEach(p => { const v = getPath(src, p); if (v !== undefined) { try { setPath(dst, p, JSON.parse(JSON.stringify(v))); } catch (e) { /* chemin disparu */ } } });
  dst.edits = { ...ed };
  if (src.gpsAuto != null) dst.gpsAuto = src.gpsAuto;   // réglage de l'appareil (GPS)
}
function setPath(o, path, val) {
  const p = path.split('.'); let t = o;
  for (let i = 0; i < p.length - 1; i++) t = t[p[i]];
  t[p[p.length - 1]] = val;
}

/* ---------- données ---------- */
const API = 'https://api.open-meteo.com/v1/forecast';
const Q_CUR = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const Q_HR = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,shortwave_radiation,uv_index';
const Q_DY = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,snowfall_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max';
const urlFor = l => `${API}?latitude=${l.lat}&longitude=${l.lon}&current=${Q_CUR}&hourly=${Q_HR}&daily=${Q_DY}&timezone=auto&past_days=1&forecast_days=14`;
// Météo-France AROME (via Open-Meteo) : haute résolution sur 0–48 h. Pas de visibilité ni de probabilité de pluie : elles restent issues du modèle de base.
const Q_AR = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
const urlArome = l => `${API}?latitude=${l.lat}&longitude=${l.lon}&current=${Q_CUR}&hourly=${Q_AR}&models=meteofrance_seamless&timezone=auto&past_days=1&forecast_days=3`;

let M = {};            // modèles par lieu
const RAW = {};        // charges utiles + mode
const ERR = {};
let DEMO = { on: false, scn: 'froid' };
let MIDM = {};                       // modèles des points intermédiaires
let MIDP = {};                       // données brutes des points intermédiaires
const MIDPENDING = new Set(), MID_TTL = 25 * 60e3, MID_FAILURE_RETRY = 10 * 60e3;
let VIGI = { state: 'none', items: [], t: null };
const ENSRAW = {}, NOWRAW = {};
let OBS = null;   // observations réelles publiées par le relais (obs.json)
let OBS_LAST = null;   // dernière lecture d'obs.json, gardée pour le moteur v2 hors connexion (datée, décotée par l'âge, jamais « actuelle »)
const ENS_MODELS = ['ecmwf_ifs025', 'icon_seamless_eps', 'icon_seamless'];
const ENS_LABEL = { ecmwf_ifs025: 'ECMWF ENS', icon_seamless_eps: 'DWD ICON-EPS', icon_seamless: 'DWD ICON-EPS', demo: 'scénarios simulés' };
const urlEns = (l, mdl) => `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${l.lat}&longitude=${l.lon}&hourly=temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m&models=${mdl}&timezone=auto&past_days=1&forecast_days=2`;
const urlNow = l => `${API}?latitude=${l.lat}&longitude=${l.lon}&minutely_15=precipitation,snowfall&forecast_minutely_15=12&past_minutely_15=1&timezone=auto`;
async function fetchEns(l) {
  if (!locHasCoords(l)) return null;
  for (const mdl of ENS_MODELS) {
    try { const p = await fetchJSON(urlEns(l, mdl), 20000, l.gps ? 'gps' : 'shared'); if (p && p.hourly && Object.keys(p.hourly).some(k => /_member\d+$/.test(k))) return { p, model: mdl, t: Date.now() }; } catch (e) { if (e.status === 429 || e.cancelled) return null; /* modèle suivant */ }
  }
  return null;
}
const gpsSourceCurrent = (l, gen) => !l.gps || (GPS && gen === gpsWeatherGen && distKm(l, GPS) <= 3);
let ensBusy = false, ensAgain = false, ensForce = false;
async function refreshEns(force) {
  if (DEMO.on) return;
  if (ensBusy) { ensAgain = true; ensForce = ensForce || !!force; return; } ensBusy = true;
  const todo = allLocs().filter(l => Number.isFinite(l.lat) && Number.isFinite(l.lon) && (force || !ENSRAW[l.id] || Date.now() - ENSRAW[l.id].t > 60 * 60e3));
  const gen = gpsWeatherGen;
  const res = await Promise.allSettled(todo.map(l => fetchEns(l)));
  res.forEach((r, k) => { if (r.status === 'fulfilled' && r.value && gpsSourceCurrent(todo[k], gen)) ENSRAW[todo[k].id] = r.value; });
  ensBusy = false;
  if (todo.length) { rebuild(); softRender(); }
  const again = ensAgain, queuedForce = ensForce; ensAgain = ensForce = false;
  if (again) return refreshEns(queuedForce);
}
const TCARS = () => S.cars.filter(hasTires);
// base pneus : version intégrée à la page, puis fichier publié (mis à jour chaque mois)
if (window.TWRC_TIREDB) loadTireDB(window.TWRC_TIREDB, 'intégrée');
async function refreshTireDB() {
  if (location.protocol !== 'https:') return;
  try {
    const js = await fetchJSON('tiredb.json?t=' + Math.floor(Date.now() / 3600e3), 10000);
    const cur = TIRE_DB_META;
    if (js && (js.version > cur.version || (js.updated && (!cur.updated || js.updated > cur.updated)))) { if (loadTireDB(js, 'en ligne')) { renderSettings(); softRender(); } }
  } catch (e) { /* hors ligne : base intégrée */ }
}
// La correction de chaussée est propre à chaque lieu (calibBias) : appliquée seulement pendant la construction du modèle de CE lieu.
// Hors de cette fenêtre (points de trajet, agenda, démo), aucune correction.
function applyCalib() { setRoadBias(0); }
const calibFor = id => calibBias(S.calib, id);
const locById = id => allLocs().find(l => l.id === id);
let lastOk = null, lastTry = null, busy = false, CX = null;
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
// Fraîcheur dérivée de l'âge réel, jamais d'une étiquette posée au téléchargement : après une suspension iOS ou un
// réseau qui ne répond plus, une météo « live » trop ancienne redevient un cache daté (badge CACHE, « maintenant » = horloge).
const LIVE_MAX_MS = 15 * 60e3;
function expireLive(now = Date.now()) {
  let n = 0;
  [...Object.values(RAW), ...Object.values(MIDP)].forEach(r => { if (r && r.mode === 'live' && !(now - r.t <= LIVE_MAX_MS)) { r.mode = 'cache'; n++; } });
  return n > 0;
}
function markOfflineCache() {
  Object.values(RAW).forEach(r => { if (r && r.mode === 'live') r.mode = 'cache'; });
  OBS = null;   // une observation de station ne doit jamais rester présentée comme « actuelle » hors connexion
}
applyCalib();
const UI = { loc: S.locs[0].id, dir: 'go', dayOff: null, bcar: S.cars[0].id, chartIdx: null,
  // dernier onglet ouvert restauré, TRAJET compris (reprise hors connexion)
  // Cockpit : chaque ouverture de l'app commence sur Pneus ; un simple rechargement garde l'onglet choisi (mémoire de l'onglet).
  view: (() => { let v = null; try { v = sessionStorage.getItem('rc.tab'); } catch (e) { /* session indisponible */ } return ['meteo', 'trajet', 'tenue', 'analyse'].includes(v) ? v : 'pneus'; })(), outfitDay: 0, labCar: null,
  outfitOccasion: 'outing', placeExpanded: null };
const DECISION_HISTORY = Decision.history(APP_STORAGE);
let DECISION_LAST = null;

const WEATHER_REQUESTS = weatherRequestManager({ fetch: (...args) => fetch(...args),
  read: () => lsGet('twrc.weather.limit.v1'), write: value => lsSet('twrc.weather.limit.v1', value),
  readIncidents: () => lsGet('twrc.weather.incidents.v1'), writeIncidents: value => lsSet('twrc.weather.incidents.v1', value),
  invalidResponse: (value, url) => {
    const u = new URL(url);
    if (u.pathname !== '/v1/forecast' || !(u.searchParams.get('hourly') || '').split(',').includes('temperature_2m')) return false;
    return Array.isArray(value) ? value.some(p => !!validForecast(p)) : !!validForecast(value);
  } });
async function fetchJSON(url, ms, group = 'shared', cacheMs = 0) {
  // hors connexion déclaré par l'appareil : aucune requête vers un service EXTERNE (inutile, coûteuse en batterie ; Safari la
  // signale en erreur). Les fichiers de l'app (agenda chiffré, base pneus, observations, version) restent demandés : le service
  // worker les sert depuis son cache, c'est ce qui permet le démarrage à froid hors ligne.
  if (offlineNow() && /^https?:\/\//i.test(url) && new URL(url).origin !== location.origin) { const e = new Error('Hors connexion : requête non envoyée'); e.offline = true; throw e; }
  if (WEATHER_REQUESTS.owns(url)) return WEATHER_REQUESTS.get(url, ms || 12000, group, cacheMs);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
function loadCache() {
  allLocs().forEach(l => {
    if (!locHasCoords(l)) return;
    try {
      const c = JSON.parse(lsGet('twrc.cache.' + l.id) || 'null');
      if (c && c.p && !validForecast(c.p) && Number.isFinite(c.t) && (l.gps ? distKm(c, l) <= 3 : Math.abs(c.lat - l.lat) < 1e-6 && Math.abs(c.lon - l.lon) < 1e-6) && Date.now() - c.t < 36 * 3600e3) {
        RAW[l.id] = { p: c.p, mode: 'cache', t: c.t, lat: c.lat, lon: c.lon };
        if (l.gps) gpsWeatherOrigin = { lat: c.lat, lon: c.lon };
      }
    } catch (e) { /* cache illisible */ }
  });
}
async function loadLoc(l, force = false) {
  if (!locHasCoords(l)) throw new Error('Coordonnées du lieu à renseigner.');
  const origin = { lat: l.lat, lon: l.lon }, gen = l.gps ? ++gpsWeatherGen : null;
  if (l.gps) { WEATHER_REQUESTS.cancelGroup('gps'); gpsWeatherOrigin = origin; }
  const group = l.gps ? 'gps' : 'shared';
  // Modèle du lieu affiché : 5 min ; autres lieux : 20 min ; AROME : 35 min ; nowcast : 15 min.
  // Un rafraîchissement manuel (force) interroge toujours le fournisseur. Un trajet/lieu nouveau a une URL neuve.
  const baseUrl = urlFor(l);
  const [b, ar, nc] = await Promise.allSettled([
    fetchJSON(baseUrl, 12000, group, force ? 0 : l.id === UI.loc ? 4 * 60e3 : 18 * 60e3),
    fetchJSON(urlArome(l), 12000, group, force ? 0 : 35 * 60e3),
    fetchJSON(urlNow(l), 12000, group, force ? 0 : 14 * 60e3)
  ]);
  // Validation AVANT toute écriture : une réponse 200 vide, tronquée ou d'un portail ne remplace jamais la dernière météo valide.
  const invalid = b.status === 'fulfilled' ? validForecast(b.value) : null;
  if (b.status !== 'fulfilled' || invalid) { if (l.gps && gen === gpsWeatherGen) gpsWeatherOrigin = null; throw b.status !== 'fulfilled' ? b.reason : new Error('réponse météo invalide : ' + invalid); }
  // Ne jamais laisser un ancien AROME en cache écraser une prévision de base reçue plus récemment :
  // en cas de décalage de fraîcheur, le modèle de base fait foi jusqu'au prochain vrai relevé AROME.
  const arFresh = ar.status === 'fulfilled' && !!ar.value
    && (WEATHER_REQUESTS.fetchedAt(urlArome(l)) || 0) >= (WEATHER_REQUESTS.fetchedAt(baseUrl) || 0) - 60e3;
  const p = mergeArome(b.value, arFresh ? ar.value : null);
  // Un ancien lieu GPS ne remplace jamais la météo d'une position plus récente, ni un GPS oublié.
  if (l.gps && (gen !== gpsWeatherGen || !GPS || distKm(origin, GPS) > 3)) return p;
  if (nc.status === 'fulfilled' && nc.value && nc.value.minutely_15) NOWRAW[l.id] = nc.value; else delete NOWRAW[l.id];
  // Conserver la vraie heure du téléchargement, pas celle de la relecture du cache mémoire.
  const retrievedAt = WEATHER_REQUESTS.fetchedAt(baseUrl) || Date.now();
  RAW[l.id] = { p, mode: 'live', t: retrievedAt, ...origin }; delete ERR[l.id];
  try { lsSet('twrc.cache.' + l.id, JSON.stringify({ t: retrievedAt, ...origin, p })); } catch (e) { /* quota */ }
  return p;
}
async function reverseName(lat, lon) {
  try {
    const j = await fetchJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=fr`, 8000);
    const n = j.locality || j.city || ''; const sub = j.city && j.locality && j.city !== j.locality ? j.city : (j.principalSubdivision || '');
    return { name: n || 'Ma position', sub };
  } catch (e) { return { name: 'Ma position', sub: '' }; }
}
let gpsWatch = null, gpsWatchHi = false, gpsBusy = false, gpsRequestGen = 0, gpsWatchGen = 0;
// Provenance séparée : cette API est celle du navigateur, quel que soit son fournisseur réel.
let GEO = { permission: 'inconnue', status: 'aucune demande', raw: null, error: null, reason: '' }, geoPermission = null;
let PLACE_FIX = null, PLACE_PENDING = null, PLACE_HOLD = false;
function geoFailure(err) {
  const code = err && err.code, status = code === 1 ? 'PERMISSION_DENIED' : code === 2 ? 'POSITION_UNAVAILABLE' : code === 3 ? 'TIMEOUT' : 'UNAVAILABLE';
  const msg = code === 1 ? 'Localisation refusée : autorise ce site dans les réglages de localisation du navigateur.'
    : code === 2 ? 'Position navigateur indisponible : vérifie le service de localisation et réessaie.'
    : code === 3 ? 'Délai de localisation dépassé : réessaie au premier plan, avec le service de localisation actif.'
    : 'Localisation indisponible sur ce navigateur ou dans ce contexte.';
  GEO.status = status; GEO.error = { code: status, message: msg, at: Date.now() };
  if (code === 1) { GEO.permission = 'refusée'; if (gpsWatch != null) { try { navigator.geolocation.clearWatch(gpsWatch); } catch (e) { /* arrêté */ } gpsWatch = null; gpsWatchGen++; } }
  alertLoc(msg); renderPlace(); renderDiag();
}
function readGeoPermission() {
  if (!navigator.permissions || !navigator.permissions.query || geoPermission) return;
  try {
  navigator.permissions.query({ name: 'geolocation' }).then(p => {
    geoPermission = p;
    const update = () => { GEO.permission = p.state === 'granted' ? 'autorisée' : p.state === 'denied' ? 'refusée' : GEO.raw ? 'autorisée' : 'à demander'; renderPlace(); renderDiag(); };
    update(); p.onchange = () => { update(); if (p.state === 'denied') { stopGps(); geoFailure({ code: 1 }); } else if (p.state === 'granted' && S.gpsAuto) resumeGps(); };
  }).catch(() => { /* Safari : Permissions API optionnelle ; le résultat de la demande fait foi. */ });
  } catch (e) { /* Ancien navigateur : query peut aussi lever une exception synchrone. */ }
}
function receivePosition(pos, focus) {
  onPos(pos, focus).catch(() => { GEO.status = 'traitement interrompu'; alertLoc('Position reçue, traitement interrompu : réessaie.'); renderDiag(); });
}
// Le nom persistant peut provenir d'une ancienne version : le premier fix le résout à nouveau.
let gpsWeatherOrigin = null, gpsNameOrigin = null, gpsWeatherGen = 0, gpsNameGen = 0;
function stopGps() {
  gpsRequestGen++; gpsBusy = false; gpsWatchGen++; PLACE_PENDING = null;
  if (gpsWatch != null) { try { navigator.geolocation.clearWatch(gpsWatch); } catch (e) { /* déjà arrêté */ } gpsWatch = null; }
}
function liveGpsRequest(options) {
  const gen = gpsRequestGen;
  try { navigator.geolocation.getCurrentPosition(p => { if (gen === gpsRequestGen && S.gpsAuto) receivePosition(p, false); }, e => { if (gen === gpsRequestGen && S.gpsAuto) geoFailure(e); }, options); } catch (e) { geoFailure(e); }
}
function locate(manual, fresh) {
  if (!('geolocation' in navigator) || (location.protocol !== 'https:' && location.hostname !== 'localhost')) { geoFailure({ code: 0 }); return; }
  if (manual && !S.gpsAuto) { S.gpsAuto = 1; saveSettings(); }
  readGeoPermission();
  if (gpsBusy) { if (manual) alertLoc('Recherche de ta position déjà en cours…'); return; }
  gpsBusy = true; GEO.status = 'recherche en cours'; const gen = ++gpsRequestGen; if (manual) alertLoc('Recherche de ta position…'); renderDiag();
  const error = err => { if (gen !== gpsRequestGen) return; gpsBusy = false; geoFailure(err); if (err && err.code !== 1) startWatch(true); };
  try {
    navigator.geolocation.getCurrentPosition(pos => { if (gen !== gpsRequestGen) return; gpsBusy = false; if (manual) alertLoc(''); receivePosition(pos, !!manual); startWatch(LIVE.phase === 'active' || !FIX || FIX.acc > PLACE_ACC_GPS); },
      error, { enableHighAccuracy: true, timeout: 15000, maximumAge: manual || fresh ? 0 : 10000 });
  } catch (e) { error({ code: 0 }); }
}
// Haute précision pour acquérir un point exploitable et pendant le trajet ; suivi économique ensuite, avec cache court et délai borné.
function startWatch(hi, restart) {
  hi = !!hi; if (!('geolocation' in navigator) || document.hidden || (gpsWatch != null && gpsWatchHi === hi && !restart)) return;
  if (gpsWatch != null) { try { navigator.geolocation.clearWatch(gpsWatch); } catch (e) { /* déjà arrêté */ } gpsWatch = null; }
  gpsWatchHi = hi; const gen = ++gpsWatchGen;
  try { gpsWatch = navigator.geolocation.watchPosition(p => { if (gen === gpsWatchGen && S.gpsAuto) receivePosition(p, false); }, e => { if (gen === gpsWatchGen && S.gpsAuto) geoFailure(e); }, { enableHighAccuracy: hi, maximumAge: 10000, timeout: 30000 }); } catch (e) { geoFailure(e); }
}
async function onPos(pos, focus) {
  if (!pos || !pos.coords) { geoFailure({ code: 2 }); return; }
  const c = pos.coords, ts = Number.isFinite(pos.timestamp) && pos.timestamp > 0 ? pos.timestamp : Date.now();
  const raw = { lat: c.latitude, lon: c.longitude, acc: c.accuracy == null ? Infinity : c.accuracy, ts, speed: Number.isFinite(c.speed) ? c.speed : null };
  const context = placeContext(placeInput());
  GEO.raw = raw; GEO.permission = 'autorisée'; GEO.error = null; GEO.status = placeFixClass(raw) === 'gps' ? 'position précise reçue' : 'position approximative reçue';
  const previous = FIX || (GPS ? { lat: GPS.lat, lon: GPS.lon, acc: GPS.acc, ts: GPS.t } : null);
  const observation = placeObserve({ fix: raw, previous, logical: PLACE_FIX || (GPS && GPS.placePending ? null : previous), context, pending: PLACE_PENDING, places: placeList(), now: Date.now() });
  const refused = observation.accept ? placeGate(raw) : observation.reason;
  GEO.reason = refused || observation.reason;
  if (refused) {
    PLACE_PENDING = null; PLACE_REJ = { source: 'navigateur', reason: refused };
    if (focus) alertLoc(placeFixClass(raw) === 'coarse' ? `Localisation navigateur approximative · précision ~${Math.round(raw.acc / 1000)} km. Confirmation manuelle disponible.` : 'Position ignorée : ' + refused + '.');
    renderAll(); if (typeof renderDiag === 'function') renderDiag(); return;
  }
  const tasks = []; let weatherMoved;
  appAction(() => {
  PLACE_FIX = observation.logical; PLACE_PENDING = observation.pending; PLACE_HOLD = !!observation.hold;
  if (USER_STORE.state.lastDeparture && !PLACE_HOLD && placeFixClass(PLACE_FIX) === 'gps') {
    const found = placeContext(placeInput({ moving: false, movingSince: null, conf: null, fix: PLACE_FIX }));
    if (found.place && found.place.id !== USER_STORE.state.lastDeparture.placeId) USER_STORE.state.lastDeparture = null;
  }
  PLACE_REJ = PLACE_PENDING || /hystérésis/.test(observation.reason) ? { source: 'navigateur', reason: observation.reason } : null;
  const np = { lat: +c.latitude.toFixed(4), lon: +c.longitude.toFixed(4) };
  // relevé brut pour le trajet vivant (mémoire uniquement) : horodatage réel du relevé, pas l'heure de réception
  FIXPREV = FIX; FIX = raw;
  liveOnFix(FIX);
  // Références fixes : des pas successifs de moins de 3 km doivent aussi finir par changer de ville/météo.
  const nameMoved = !gpsNameOrigin || distKm(gpsNameOrigin, np) > 3; weatherMoved = !gpsWeatherOrigin || distKm(gpsWeatherOrigin, np) > 3;
  const prevName = GPS && !nameMoved ? { name: GPS.name, sub: GPS.sub } : null;
  GPS = { id: 'gps', gps: true, ...np, acc: Math.round(c.accuracy), t: ts, placePending: !!observation.hold, name: prevName ? prevName.name : 'Ma position', sub: prevName ? prevName.sub : '' };
  if (!S.gpsAuto) { S.gpsAuto = 1; saveSettings(); }
  if (focus && !PLACE.conf) UI.loc = 'gps';   // un lieu confirmé reste le contexte, même après « Ma position »
  if (nameMoved && !offlineNow()) {
    gpsNameOrigin = np; const gen = ++gpsNameGen;
    tasks.push(reverseName(np.lat, np.lon).then(nm => { if (!GPS || gen !== gpsNameGen || distKm(np, GPS) > 3) return; appAction(() => Object.assign(GPS, nm)); }));
  }
  if (weatherMoved) {
    delete ENSRAW.gps; delete NOWRAW.gps; delete RAW.gps; delete AQRAW.gps;
    if (offlineNow()) { gpsWeatherOrigin = null; ERR.gps = 'hors connexion : aucune météo récente pour cette nouvelle position'; }
    else {
      const request = loadLoc(GPS), gen = gpsWeatherGen;
      tasks.push(request.then(() => { if (GPS && gen === gpsWeatherGen) lastOk = Date.now(); }, e => { if (GPS && gen === gpsWeatherGen) ERR.gps = e.message; }));
    }
  }
  rebuild();
  });
  if (tasks.length) { await Promise.all(tasks); if (!GPS) return; rebuild(); renderAll(); if (weatherMoved) refreshEns(); }
}
/* ===================== LIEU COURANT (localisation métier, une seule source de vérité) ===================== */
// Tout est décidé par placeContext (src/placectx.js, pur et testé). Ici : stockage local, relevés du navigateur, actions et rendu.
// twrc.place.v1 = { conf: { placeId, at, how, day } | null, last: { placeId, at, source } | null } : identifiants de lieux et heures,
// AUCUNE coordonnée. NETLOC est réservé à une éventuelle source réseau indépendante. Le navigateur ne le remplit jamais.
const PLACE_KEY = 'twrc.place.v1';
let NETLOC = null, PLACE_REJ = null;
const placeSave = () => USER_STORE.flush();
const placeToday = () => nowIn('Europe/Paris').slice(0, 10);
function placeList() {
  const home = S.locs[0];
  const seen = new Set();
  return [...S.locs, ...S.customs, ...tripContextLocs(), ...(PLACE.extra ? [PLACE.extra] : [])].filter(l => locHasCoords(l) && (!l.id || !seen.has(l.id) && seen.add(l.id)))
    .map(l => ({ ...l, id: l.id, name: l.name || l.label || 'Lieu', lat: l.lat, lon: l.lon, kind: l.id === S.work.to ? 'work' : l.id === home.id ? 'home' : 'custom' }));
}
function placeInput(extra) {
  if (USER_STORE.state.lastDeparture && Date.now() - USER_STORE.state.lastDeparture.at >= 20 * 3600e3) USER_STORE.state.lastDeparture = null;
  const precise = PLACE_HOLD || GPS && GPS.placePending ? PLACE_FIX : PLACE_FIX || (GPS && Number.isFinite(GPS.t) && Number.isFinite(GPS.acc) ? { lat: GPS.lat, lon: GPS.lon, acc: GPS.acc, ts: GPS.t } : null) || GEO.raw;
  return { now: Date.now(), today: placeToday(), places: placeList(), conf: PLACE.conf, last: PLACE.last, fix: precise, net: NETLOC,
    moving: LIVE.phase === 'active' || !!TRIPSTART || !!USER_STORE.state.lastDeparture, movingSince: TRIPSTART ? TRIPSTART.at : LIVE.startFix ? LIVE.startFix.ts : USER_STORE.state.lastDeparture && USER_STORE.state.lastDeparture.at, fmt: hmLocal, ...(extra || {}) };
}
// contexte courant ; une confirmation terminée (départ, GPS précis ailleurs, fin de journée) est effacée une seule fois
function placeNow() {
  const c = placeContext(placeInput());
  if (c.ended && PLACE.conf) { PLACE.last = { placeId: PLACE.conf.placeId, at: PLACE.conf.at, source: 'fin : ' + c.ended.reason }; PLACE.conf = null; placeSave(); }
  if (!PLACE.conf && c.source === 'gps' && c.place && (!PLACE.last || PLACE.last.placeId !== c.place.id || Date.now() - PLACE.last.at > 10 * 60e3)) { PLACE.last = { placeId: c.place.id, at: Date.now(), source: 'gps' }; placeSave(); }
  return c;
}
// garde à l'entrée des relevés du navigateur : renvoie la raison d'un refus, ou null si le relevé peut être utilisé
function placeGate(fix) {
  const c = placeContext(placeInput({ fix, net: null }));
  const r = c.rejected.find(x => x.source !== 'réseau');
  return r ? r.reason : null;
}
// trajet aller (domicile-travail ou agenda) vers ce lieu, en cours ou arrivé depuis moins de 2 h
function placeArrivalTrip(placeId, now = liveNow()) {
  const p = placeList().find(x => x.id === placeId); if (!p) return null;
  return BRF_SHOWN.find(t => {
    const d = liveDest(t); if (!d || distKm(d, p) > 1.5 || !t.dep || t.dep > now) return false;
    return liveMin(t.arr || t.dep, now) <= 120;
  }) || (LIVE.key && LIVE.base && liveDest(LIVE.base) && distKm(liveDest(LIVE.base), p) <= 1.5 ? LIVE.base : null);
}
function placeArriveBtn(t) {
  if (PLACE.conf || !t || !t.dep || t.dep > liveNow()) return '';
  const d = liveDest(t), p = d && placeList().find(x => distKm(x, d) <= 1.5 && x.kind !== 'custom'); if (!p) return '';
  return `<button class="btn sm" data-act="place-confirm" data-place="${esc(p.id)}" data-how="arrival">✅ ${esc((PLACE_KIND[p.kind] || PLACE_KIND.custom).arrive)}</button>`;
}
function placeConfirm(placeId, how) {
  return appAction(() => {
  const p = placeList().find(x => x.id === placeId); if (!p) return;
  const now = Date.now();
  UI.placeExpanded = null;
  const previous = placeNow().place;
  PLACE_PENDING = null; PLACE_FIX = null; PLACE_HOLD = false;
  PLACE.conf = { placeId, at: now, how: how === 'arrival' ? 'arrival' : 'manual', day: placeToday() }; PLACE.last = { placeId, at: now, source: 'manual' };
  const activeTrip = APP_CONTEXT.snapshot.activeTrip;
  const intention = appDay().nextDestination;
  const chosenTrip = activeTrip && (appTripPlace(activeTrip, 'to') || {}).id === placeId ? activeTrip : BRF_SHOWN.find(t => (appTripPlace(t, 'to') || {}).id === placeId
    && t.dep && t.dep.slice(0, 10) === placeToday() && (t.dep <= liveNow() || intention && intention.placeId === placeId && (!intention.tripKey || intention.tripKey === t.key)));
  if (appDay().nextDestination && (!appDay().nextDestination.placeId || appDay().nextDestination.placeId === placeId)) {
    appConfirmedPlace(placeId, now);
  } else { appDay().lastConfirmedPlace = { placeId, at: now, source: 'manual' }; appDay().departedAt = null; }
  USER_STORE.state.lastDeparture = null;
  appReopenReturn(placeId, now);
  // la machine de trajet existante termine proprement l'aller : arrivée du trajet vivant, sinon trajet planifié marqué arrivé
  let t = placeArrivalTrip(placeId) || chosenTrip || (p.kind === 'work' ? BRF_TRIPS.find(t => t.src === 'work' && t.td.dir === 'go' && t.dep.slice(0, 10) === placeToday()) : null);
  if (!t && p.kind === 'work' && appWorkOn(placeToday())) {
    const td = appWorkTripData('go', 0);
    if (!td.err) t = { src: 'work', td, dep: td.dep, arr: td.arr, from: td.fromName, to: td.toName, name: 'Aller domicile-travail', key: 'commute|' + td.dep + '|go' };
  }
  if (!t && p.kind === 'home' && previous && previous.id === S.work.to && appWorkOn(placeToday())) {
    const td = appWorkTripData('ret', 0);
    if (!td.err) t = { src: 'work', td, dep: td.dep, arr: td.arr, from: td.fromName, to: td.toName, name: 'Retour domicile-travail', key: 'commute|' + td.dep + '|ret' };
  }
  if (t && t.key) closeTrip(t, 'confirmé');
  if (PLACE.conf && PLACE.conf.placeId === placeId) PLACE.conf.how = how === 'arrival' ? 'arrival' : 'manual';
  if (LIVE.phase === 'active') liveReset();
  APP_CONTEXT.weatherPreview = null; UI.loc = placeId; rebuild();
  });
}
function placeLeave() {
  UI.placeExpanded = null;
  return appAction(() => {
  if (!PLACE.conf) return;
  if (!appDay().nextDestination && !BRF_SHOWN.some(t => t.src === 'cal' && (appTripPlace(t, 'from') || {}).id === PLACE.conf.placeId && t.dep.slice(0, 10) === placeToday())) appChooseDestination(null, 'pending');
  const intention = appDay().nextDestination;
  const next = intention && !intention.placeId ? null : BRF_SHOWN.find(t => !t.originPending && (appTripPlace(t, 'from') || {}).id === PLACE.conf.placeId && (!intention || t.key === intention.tripKey));
  if (next) { liveStart(next.key); return; }
  PLACE.last = { placeId: PLACE.conf.placeId, at: Date.now(), source: 'départ annoncé' }; PLACE.conf = null; placeSave();
  USER_STORE.state.lastDeparture = { placeId: PLACE.last.placeId, at: Date.now() };
  appDay().departedAt = Date.now();
  // prépare le retour sans l'inventer : la détection de déplacement reprend, le trajet prévu reste celui du planning ou de l'agenda
  if (liveAllowed()) { LIVE.hiAt = 0; liveAskFix(); }
  APP_CONTEXT.weatherPreview = null;
  });
}
// Le repli est dérivé du contexte canonique. Seule l'ouverture demandée est locale à l'UI ;
// sa clé de confirmation la referme aussi après une arrivée ou une confirmation dans une autre fenêtre.
function placeDisclosure(c) {
  const destination = appDay().nextDestination;
  // Une position GPS réellement fiable n'a pas besoin d'une seconde validation utilisateur.
  // Les confirmations manuelles et la météo consultée conservent leurs états distincts.
  const manual = c.source === 'manual' && !!c.confirmed && !!c.place;
  const trustedGps = c.source === 'gps' && c.trust === 'Fiable';
  const compact = (manual || trustedGps) && !PLACE_PENDING
    && LIVE.phase !== 'active' && !USER_STORE.state.lastDeparture && !(destination && !destination.placeId);
  const key = manual ? c.confirmed.placeId + '|' + c.confirmed.at
    : trustedGps ? 'gps|' + (c.place ? c.place.id : 'position') : null;
  return { compact, key, expanded: !compact || UI.placeExpanded === key };
}
function renderPlace() {
  const el = $('#placeBar'); if (!el) return;
  const c = placeNow(), K = PLACE_KIND, pl = placeList(), work = pl.find(p => p.kind === 'work'), home = pl.find(p => p.kind === 'home');
  const confirm = (p, arrival = false) => `<button class="btn${arrival ? ' pri' : ''} sm" data-act="place-confirm" data-place="${esc(p.id)}" data-how="${arrival ? 'arrival' : 'manual'}"><span aria-hidden="true">${arrival ? '✅' : (K[p.kind] || K.custom).icon}</span><span class="pl-copy"><span>${esc(arrival ? (K[p.kind] || K.custom).arrive : (K[p.kind] || K.custom).already)}</span><small>${esc(p.name)}</small></span></button>`;
  const { compact, expanded } = placeDisclosure(c);
  const details = $('#locChips'); if (details) details.hidden = compact && !expanded;
  let h;
  if (c.source === 'manual') {
    const k = K[c.place.kind] || K.custom, weather = allLocs().find(p => p.id === UI.loc);
    const weatherLabel = weather && weather.id === c.place.id ? '🌦 météo locale' : weather ? '🌦 Météo : ' + weather.name : '🌦 Météo à choisir';
    const gpsUnavailable = GEO.permission === 'refusée' || !!GEO.error;
    const meta = expanded ? c.badge : 'Confirmé ' + hmLocal(c.confirmed.at);
    h = `<div class="place on${compact ? ' compact' : ''}${expanded ? ' expanded' : ''}"><span class="pl-info" role="status"><b>${esc(c.title)} · ${esc(c.place.name)}</b><span class="pl-meta" title="Source : confirmation utilisateur">${esc(meta)} · ${esc(weatherLabel)}${gpsUnavailable ? ' · <span class="pl-gps">📍 GPS indisponible</span>' : ''}</span>${expanded && c.net ? `<span class="sub">${esc(c.net)}</span>` : ''}</span><span class="pl-main"><button class="btn sm" data-act="place-leave"><span aria-hidden="true">🚗</span><span>${esc(k.leave)}</span></button>${compact ? `<button class="btn sm pl-toggle" data-act="place-toggle" aria-expanded="${expanded}" aria-controls="placeActions locChips"><span>${expanded ? 'Réduire' : 'Modifier'}</span><span aria-hidden="true">${expanded ? '▴' : '▾'}</span></button>` : ''}</span><span class="pl-act" id="placeActions" ${expanded ? '' : 'hidden'}>${pl.filter(p => p && p.id !== c.place.id).map(p => confirm(p)).join('')}</span></div>`;
  } else if (c.source === 'gps' && compact) {
    const where = c.place ? c.place.name : GPS && GPS.name ? GPS.name : 'Ma position';
    const weather = allLocs().find(p => p.id === UI.loc);
    const weatherLabel = UI.loc === 'gps' || weather && c.place && weather.id === c.place.id
      ? 'météo locale' : weather ? 'météo consultée : ' + weather.name : 'météo à choisir';
    const precision = GPS && Number.isFinite(GPS.acc) ? ' · ± ' + Math.round(GPS.acc) + ' m' : '';
    h = `<div class="place compact gps-compact${expanded ? ' expanded' : ''}">
      <span class="pl-info" role="status"><b>📍 ${esc(where)}</b><span class="pl-meta">· Fiable · GPS navigateur${esc(precision)} · ${esc(weatherLabel)}</span></span>
      <span class="pl-main"><button class="btn sm pl-toggle" data-act="place-toggle" aria-expanded="${expanded}" aria-controls="placeActions locChips" aria-label="${expanded ? 'Réduire les choix de localisation' : 'Changer de lieu ou confirmer ma position'}"><span>${expanded ? 'Réduire' : 'Changer'}</span><span aria-hidden="true">${expanded ? '▴' : '▾'}</span></button></span>
      <span class="pl-act" id="placeActions" ${expanded ? '' : 'hidden'}>${pl.map(p => confirm(p)).join('')}</span>
    </div>`;
  } else {
    const arr = [work, home].filter(Boolean).map(p => ({ p, t: placeArrivalTrip(p.id) })).find(x => x.t);
    const btns = pl.filter(Boolean).map(p => confirm(p, !!arr && arr.p.id === p.id)).join('');
    h = `<div class="place${arr ? ' arr' : ''}">${arr ? `<b>${c.source === 'trip' ? '🚗 EN ROUTE · destination' : 'ARRIVÉE'} · ${(K[arr.p.kind] || K.custom).icon} ${esc(arr.p.name)}</b>` : `<span class="pl-src"><b>${esc(c.title)}</b> · ${esc(c.trust)}${c.badge ? ' · ' + esc(c.badge) : ''}</span>`}<span class="pl-act">${btns}</span></div>`;
  }
  if (el.innerHTML !== h) el.innerHTML = h;
}
// diagnostic interne : brut navigateur, réseau, lieu logique, source gagnante et sources écartées (coordonnées arrondies à ~1 km)
function placeDiagRows(forCopy) {
  const c = placeContext(placeInput()), rd = v => Number.isFinite(v) ? v.toFixed(forCopy ? 2 : 5) : '—', f = GEO.raw || FIX;
  const seconds = f ? Math.max(0, Math.round((Date.now() - f.ts) / 1000)) : null;
  const raw = f ? `${rd(f.lat)}, ${rd(f.lon)} · ±${Math.round(f.acc)} m · il y a ${seconds < 60 ? seconds + ' s' : ageTxt(seconds / 60)} · source : API navigateur` : 'aucun relevé';
  const net = NETLOC ? `${NETLOC.name || 'nom inconnu'} · ±${Math.round(NETLOC.acc / 1000)} km · il y a ${ageTxt(ageOf(NETLOC.ts))}` : 'aucune';
  const rej = c.rejected.concat(PLACE_REJ ? [PLACE_REJ] : []);
  const used = FIX || f, distances = used && placeFixClass(used) === 'gps' ? placeList().map(p => [(p.kind === 'home' ? 'Distance domicile' : p.kind === 'work' ? 'Distance travail' : 'Distance ' + p.name), Math.round(placeDistance(used, p) * 1000) + ' m']) : [];
  const source = { gps: 'GPS navigateur', approx: 'navigateur approximatif', coarse: 'navigateur trop imprécis', manual: 'confirmation utilisateur', network: 'position réseau', last: 'dernier lieu fiable', trip: 'mouvement confirmé', none: 'aucune' }[c.source];
  return [['Permission localisation', GEO.permission], ['Statut localisation navigateur', GEO.status + (document.hidden ? ' · suivi suspendu en arrière-plan' : '')],
    ['Géolocalisation navigateur (brute)', raw], ['Position navigateur retenue', FIX ? `±${Math.round(FIX.acc)} m · il y a ${ageTxt(ageOf(FIX.ts))}` : 'aucune'],
    ['Dernière erreur localisation', GEO.error ? GEO.error.code + ' · ' + GEO.error.message : 'aucune'], ['Position réseau / IP', net],
    ...distances,
    ['Lieu logique Race Control', `${c.place ? c.place.name : c.title.replace(/^\S+ /, '')} · ${c.trust} · ${c.place ? c.place.kind === 'home' ? 'domicile' : c.place.kind === 'work' ? 'travail' : 'destination connue' : c.source === 'gps' ? 'autre' : 'indéterminé'}`], ['Source retenue', `${c.source} · ${source}${c.originLock ? ' · origine verrouillée : ' + c.originLock : ''}`],
    ['Raison localisation', c.source === 'manual' ? 'confirmation utilisateur' : c.source === 'trip' ? 'déplacement confirmé · trajet en cours' : GEO.reason || (c.source === 'last' ? 'dernier lieu fiable · attente de position fraîche' : c.source === 'gps' ? 'position navigateur précise dans la géofence' : 'position insuffisante · confirmation manuelle disponible')],
    ['Sources écartées', rej.length ? rej.map(x => `${x.source} : ${x.reason}`).join(' | ') : 'aucune']];
}
function alertLoc(msg) { const el = $('#locMsg'); if (el) { el.textContent = msg; el.hidden = !msg; } }
async function refreshAll(force = true) {
  if (DeviceStorage.isFrozen() || storeLocked() || window.TWRC_STORAGE_ERROR) { renderStatus(); renderNotice(); return; }
  if (busy) return;
  if (offlineNow()) { DEMO.on = false; MIDP = {}; markOfflineCache(); rebuild(); renderAll(); loadCalendar(); return; }
  busy = true; DEMO.on = false; lastTry = Date.now(); renderStatus();
  const locs = allLocs(), gpsStart = gpsWeatherGen, generations = new Map();
  try {
    if (location.protocol === 'https:') {
      const o = await fetchJSON(dataUrl('obs.json') + '?t=' + Math.floor(Date.now() / 300e3), 8000);
      // Les observations stations sont un enrichissement du modèle live : si le relais est trop vieux,
      // on les ignore plutôt que d'injecter une pseudo-observation périmée dans une météo fraîche.
      OBS = relayAgeMin(o && o.updated) <= RELAY_OBS_MAX_MIN ? o : null; if (o && o.stations) OBS_LAST = o;
      RELAY_SEEN = true; RELAY_AT = o && o.updated ? o.updated : null; RELAY_ERR = o && o.relay && o.relay.err ? String(o.relay.err).slice(0, 120) : null;
    }
  } catch (e) { OBS = null; }
  const res = await Promise.allSettled(locs.map(l => {
    // Une position remplacée pendant la lecture des observations ne relance pas une ancienne météo.
    if (l.gps && !gpsSourceCurrent(l, gpsStart)) return Promise.resolve(null);
    const request = loadLoc(l, force); if (l.gps) generations.set(l.id, gpsWeatherGen); return request;
  }));
  let ok = 0;
  res.forEach((r, k) => {
    const l = locs[k];
    if (l.gps && (!generations.has(l.id) || !gpsSourceCurrent(l, generations.get(l.id)))) return;
    if (r.status === 'fulfilled' && r.value && r.value.hourly && r.value.hourly.time) ok++;
    else { ERR[l.id] = (r.reason && r.reason.message) || 'réponse invalide'; if (RAW[l.id]) RAW[l.id].mode = 'cache'; }
  });
  if (ok) lastOk = Math.max(lastOk || 0, ...locs.map(l => (RAW[l.id] && RAW[l.id].mode === 'live' ? RAW[l.id].t : 0)));
  busy = false; rebuild(); renderAll();
  fetchVigi(); refreshEns(); radarRefresh(); loadCalendar();
}
function startDemo(scn) {
  DEMO = { on: true, scn }; busy = false; MIDP = {};
  rebuild(); renderAll();
}
function rebuild() {
  M = {}; MIDM = {}; expireLive();
  Object.keys(MIDP).forEach(id => {
    const r = MIDP[id], ttl = r && r.p ? MID_TTL : MID_FAILURE_RETRY;
    if (!r || !Number.isFinite(r.t) || Date.now() - r.t >= ttl || Date.now() < r.t) { delete MIDP[id]; return; }
    try { MIDM[id] = r.p ? makeModel(r.p, r.mode, r.pt) : null; } catch (e) { MIDM[id] = null; }
  });
  allLocs().forEach((l, k) => {
    if (!locHasCoords(l)) return;
    if (DEMO.on) {
      const pl = makeDemoPayload(DEMO.scn, l, 'Europe/Paris', [0, -0.3, 0.6, -0.8, 0.4, 0][k % 6]), m = makeModel(pl, 'demo', l);
      m.ens = ensembleStats(makeDemoEnsemble(pl), m); m.ensModel = 'demo'; m.nc = nowcast(makeDemoNowcast(pl), m.nowStr); M[l.id] = m; return;
    }
    const r = RAW[l.id]; if (!r) return;
    const cb = calibFor(l.id);
    try {
      setRoadBias(cb.bias);
      const m = makeModel(r.p, r.mode, l);
      const en = ENSRAW[l.id]; if (en) { m.ens = ensembleStats(en.p, m); m.ensModel = en.model; }
      if (NOWRAW[l.id] && r.mode === 'live') m.nc = nowcast(NOWRAW[l.id], m.nowStr);
      if (OBS && r.mode === 'live') m.obs = applyObs(m, OBS.stations, 35);
      m.roadBias = cb.bias; M[l.id] = m;
    } catch (e) { ERR[l.id] = 'données illisibles'; } finally { setRoadBias(0); }
  });
}
// Vigilance Météo-France (relais Opendatasoft). Lecture tolérante : le format exact n'est pas garanti.
const VIGI_DS = 'weatherref-france-vigilance-meteo-departement';
const vigiLink = () => `https://vigilance.meteofrance.fr/fr/${normTxt(S.dept.name) ? String(S.dept.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, '-') : ''}`;
function parseVigi(js, code, name) {
  const recs = (js.records || js.results || []).map(r => r.fields || r || {});
  const nn = normTxt(name);
  const mine = recs.filter(f => Object.values(f).some(v => String(v).trim() === code || String(v).trim() === code.padStart(2, '0') || (nn && normTxt(v) === nn)));
  const COL = { vert: 1, jaune: 2, orange: 3, rouge: 4, green: 1, yellow: 2, red: 4 }, PH = /vent|pluie|orage|neige|verglas|canicule|froid|avalanche|vague|submersion|crue|inondation/i;
  const out = [];
  mine.forEach(f => {
    let lvl = null, ph = null;
    Object.entries(f).forEach(([k, v]) => {
      const s = normTxt(v);
      if (COL[s] != null && lvl == null) lvl = COL[s];
      if (/couleur|color|niveau|level/i.test(k) && /^[1-4]$/.test(String(v).trim()) && lvl == null) lvl = +String(v).trim();
      if (/ph[eé]nom/i.test(k) && typeof v === 'string') ph = v; else if (!ph && typeof v === 'string' && PH.test(v) && v.length < 40) ph = v;
    });
    if (lvl) out.push({ lvl, ph: ph || 'phénomène non précisé' });
  });
  return { items: out, matched: mine.length };
}
async function fetchVigi() {
  const code = String(S.dept.code || '').trim(); if (!code || DEMO.on) { VIGI = { state: 'none', items: [], t: null }; return; }
  try {
    const js = await fetchJSON(`https://public.opendatasoft.com/api/records/1.0/search/?dataset=${VIGI_DS}&q=${encodeURIComponent(S.dept.name || code)}&rows=60`, 10000);
    const r = parseVigi(js, code, S.dept.name);
    VIGI = { state: r.matched ? 'ok' : 'unread', items: r.items, t: Date.now() };
  } catch (e) { VIGI = { state: 'err', items: [], t: Date.now() }; }
  if (CX) { CX.alerts = Object.assign(CX.alerts, extraAlerts(CX.m, CX.sum24)); renderAlerts(); renderBanners(); }
}
function vigiBlock() {
  if (!S.dept.code) return '';
  const link = `<a href="${esc(vigiLink())}" target="_blank" rel="noopener" style="color:var(--accent)">vigilance.meteofrance.fr ↗</a>`;
  let body;
  if (VIGI.state === 'ok') {
    const top = VIGI.items.length ? VIGI.items.reduce((a, b) => b.lvl > a.lvl ? b : a) : null;
    body = top ? `<span class="pill lv${Math.max(0, top.lvl - 1)}">${['', 'VERTE', 'JAUNE', 'ORANGE', 'ROUGE'][top.lvl]}</span> ${esc(top.ph)}` : 'Aucune vigilance particulière lue.';
  } else if (VIGI.state === 'unread') body = 'Données reçues mais illisibles pour ce département.';
  else if (VIGI.state === 'err') body = 'Relais indisponible.';
  else body = 'Chargement…';
  return `<div class="note lvx"><b>VIGILANCE ${esc((S.dept.name || S.dept.code).toUpperCase())}</b><span>${body} Référence officielle : ${link}</span></div>`;
}
// résultats normalisés : même département (code + nom), commune et code postal quelle que soit la source (audit A05)
async function geocode(q) { return (await GeoSearch.search(q, fetchJSON)).map(h => ({ ...h, ...frAdmin(h) })); }

/* ---------- formats ---------- */
const hmLocal = ms => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const RELAY_WARN_MIN = 20, RELAY_OBS_MAX_MIN = 35;
let RELAY_AT = null, RELAY_ERR = null, RELAY_SEEN = false;   // dernier obs.json lu (même trop vieux pour enrichir la météo) : diagnostic uniquement
const relayAgeMin = ts => { const t = Date.parse(ts || ''); return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 60000) : Infinity; };
const relayAgeTxt = m => !Number.isFinite(m) ? 'inconnue' : m < 60 ? Math.max(1, Math.round(m)) + ' min' : Math.floor(m / 60) + ' h ' + Math.round(m % 60) + ' min';
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const card = d => d == null ? '' : CARD[Math.round(d / 45) % 8];
const wx = c => WMO[c] || (c == null ? '—' : 'Code ' + c);
const RISKTXT = ['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ', 'CRITIQUE'];
const visTxt = v => v == null ? '—' : v >= 10000 ? '> 10 km' : v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(v) + ' m';
function icon(code) {
  const cloud = '<path d="M7 16.5h10a3.4 3.4 0 0 0 .3-6.8A5 5 0 0 0 7.6 9 3.9 3.9 0 0 0 7 16.5z"/>';
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>';
  let b;
  if (code === 0 || code === 1) b = sun;
  else if (code === 2) b = '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1" />' + '<path d="M9 19h9a3 3 0 0 0 .3-6 4.4 4.4 0 0 0-8.4 1A3.2 3.2 0 0 0 9 19z"/>';
  else if (code === 3) b = cloud;
  else if (FOG_CODES.has(code)) b = '<path d="M7 13h10a3.2 3.2 0 0 0 .3-6.4A4.6 4.6 0 0 0 8 6a3.6 3.6 0 0 0-1 7z"/><path d="M4 17h16M7 20.5h10"/>';
  else if (SNOW_CODES.has(code)) b = cloud + '<path d="M8 20h.01M12 21h.01M16 20h.01" stroke-width="2.4"/>';
  else if (code >= 95) b = cloud + '<path d="M12.5 15.5 10.5 19h3l-2 3.5"/>';
  else b = cloud + '<path d="M8 19l-1 2.5M12 19l-1 2.5M16 19l-1 2.5"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
}
const verdictHtml = (l, sm) => `<div class="verdict lv${l}${sm ? ' sm' : ''}"><span class="em">${LV[l].emoji}</span><span>${LV[l].label}</span></div>`;
// Profil générique (audit A06) : tant que les lieux et la monte ne sont pas renseignés (ou appareil verrouillé), les conclusions
// sont un APERÇU : jamais GO ni un score /100 présenté comme un conseil personnel. Seuls les paramètres nécessaires comptent.
const PROFILE = () => ProfileCheck.check({ locked: LOCKED(), locs: S.locs, work: S.work });
const carProfile = car => PROFILE().car(car);
// variante compacte, dans le bloc de verdict lui-même (le verdict reste visible sans défilement sur iPhone)
const genericLine = gaps => `<p class="wx-hl generic-note" data-k="generic">🧪 <b>Aperçu générique — configure tes lieux et ta monte</b> · ${gaps.map(g => esc(g.text)).join(' · ')} <button class="btn sm" data-act="goset-cfg">Configurer</button></p>`;
const genericNote = gaps => `<div class="note lvx generic-note" data-k="generic" role="note"><b>🧪 APERÇU GÉNÉRIQUE — configure tes lieux et ta monte</b><span>${gaps.map(g => esc(g.text)).join(' · ')}. Verdicts et estimations : un exemple de calcul, pas un conseil pour ta voiture. <button class="btn sm" data-act="goset-cfg">${LOCKED() ? 'Déverrouiller ou configurer' : 'Configurer'}</button></span></div>`;
const iceName = l => l == null ? '—' : ICE_LV[l];
const mt = (k, v, unit, note, warn) => `<div class="mt${warn ? ' warn' : ''}"><span class="k">${k}</span><span class="v">${v}${unit ? `<small>${unit}</small>` : ''}</span>${note ? `<span class="n">${note}</span>` : ''}</div>`;

/* ---------- contexte de calcul ---------- */
ALERT_DEFS.push(
  { id: 'press', label: 'Pression à froid (baisse de 10 °C ou plus depuis le contrôle)' },
  { id: 'age', label: 'Pneus âgés (code DOT de 6 ans ou plus)' },
  { id: 'glare', label: 'Soleil rasant dans l’axe du trajet' },
  { id: 'mont', label: 'Destination soumise à la Loi Montagne' },
  { id: 'vigi', label: 'Vigilance Météo-France du département' },
  { id: 'ens', label: 'Probabilité de chaussée gelée (scénarios d’ensemble)' },
  { id: 'rain15', label: 'Pluie imminente (moins de 45 min)' });
function extraAlerts(m, sum24) {
  const out = {}, today = m.nowStr.slice(0, 10);
  // pression
  const pr = [];
  TCARS().forEach(c => {
    const pc = c.tire.pchk || {};
    if (pc.T != null && sum24.Tmin != null && pc.T - sum24.Tmin >= 10) {
      const loss = pressLoss(pressTarget(c.tire.press), pc.T, sum24.Tmin);
      pr.push({ sev: 2, t: `${c.short} : ≈ −${f1(loss).replace(/^-/, '')} bar à ${f1(sum24.Tmin)} °C`, d: `Contrôlée à ${f1(pc.T)} °C le ${fmtDay(pc.date)}. Revérifie à froid, avant de rouler.` });
    } else if (pc.date && dayDiff(pc.date, today) > 30) pr.push({ sev: 1, t: `${c.short} : dernier contrôle il y a ${dayDiff(pc.date, today)} jours`, d: 'Un contrôle par mois, pneus froids, est recommandé.' });
  });
  if (pr.length) out.press = { id: 'press', sev: Math.max(...pr.map(x => x.sev)), title: pr.map(x => x.t).join(' · '), detail: pr.map(x => x.d).join(' ') };
  // âge DOT
  const ag = TCARS().map(c => ({ c, y: dotAge(c.tire.dot, m.nowStr) })).filter(o => o.y != null && o.y >= 6);
  if (ag.length) out.age = { id: 'age', sev: ag.some(o => o.y >= 10) ? 3 : 2, title: ag.map(o => `${o.c.short} : pneus de ${f1(o.y)} ans`).join(' · '), detail: 'Au-delà de 6 ans la gomme durcit et perd de l’adhérence à froid, même avec une bonne profondeur. Fais-les contrôler.' };
  // soleil rasant (prochain aller et prochain retour)
  const gl = ['go', 'ret'].map(d => ({ d, t: tripData(d, 'auto') })).filter(o => !o.t.err && o.t.glare);
  if (gl.length) out.glare = { id: 'glare', sev: 2, title: gl.map(o => `Soleil rasant ${o.d === 'go' ? 'à l’aller' : 'au retour'} vers ${o.t.glare.ts.slice(11, 16)}`).join(' · '), detail: 'Soleil bas dans l’axe de la route : éblouissement possible. Pare-soleil, lunettes, pare-brise propre, distances allongées.' };
  // Loi Montagne
  const td = tripData(UI.dir, 'auto');
  if (!td.err && td.mont.concerned && (td.mont.season || dayDiff(today, '2026-11-01'.replace('2026', today.slice(0, 4))) <= 14)) {
    const nc = TCARS().filter(c => effType(c) === 'summer').map(c => c.short);
    out.mont = { id: 'mont', sev: td.mont.season ? 2 : 1, title: `${td.toName} : vigilance Loi Montagne ${td.mont.season ? '(1er novembre – 31 mars)' : 'à partir du 1er novembre'}`, detail: `${montagneWhy(td.mont, td.toName)}. Pneus 3PMSF ou chaînes / chaussettes obligatoires seulement dans les communes fixées par arrêté préfectoral : vérifie la commune. Source : ${MONT_SRC.text}.${nc.length ? ' Non équipées en 3PMSF : ' + nc.join(', ') + '.' : ''}` };
  }
  // probabilités d'ensemble
  const ew = ensWindow(m.ens, m.hs.slice(m.nowI, m.nowI + 25).map(x => x.t));
  if (ew && ew.pRoad0 >= 0.3) out.ens = { id: 'ens', sev: ew.pRoad0 >= 0.6 ? 3 : 2, title: `Chaussée sous 0 °C : ${pct(ew.pRoad0)} des scénarios`, detail: `Pic vers ${ew.tRoad0 ? ew.tRoad0.slice(11, 16) : '—'}. Verglas élevé dans ${pct(ew.pIce)} des scénarios ${ENS_LABEL[m.ensModel] || ''}. Estimation, pas une observation.` };
  // pluie imminente
  if (m.nc && !m.nc.nowWet && m.nc.startIn != null && m.nc.startIn <= 45) out.rain15 = { id: 'rain15', sev: 1, title: `${m.nc.snow ? 'Neige' : 'Pluie'} dans ${m.nc.startIn} min`, detail: `Prévision au quart d’heure, ${f1(m.nc.total)} mm sur 2 h.` };
  // vigilance
  if (VIGI.state === 'ok' && VIGI.items.length) {
    const top = VIGI.items.reduce((a, b) => b.lvl > a.lvl ? b : a);
    if (top.lvl >= 2) out.vigi = { id: 'vigi', sev: top.lvl - 1, title: `Vigilance ${['', 'verte', 'jaune', 'orange', 'rouge'][top.lvl]} : ${top.ph}`, detail: `${S.dept.name || S.dept.code}. Source : Météo-France, relayée par Opendatasoft. Confirme sur le site officiel.` };
  }
  return out;
}
function computeCtx() {
  const m = M[UI.loc];
  if (!locHasCoords(allLocs().find(l => l.id === UI.loc))) return null;
  if (!m || m.nowI < 0 || m.nowI >= m.hs.length - 3) return null;
  const seq = seqOf(m, m.nowI, S.horizon), sum = summarize(seq);
  const cars = S.cars.map(car => {
    const w = windowAssess(car, seq, 'card');
    return { car, w, nar: w ? narrate(car, w, sum, 'actuellement') : null, season: hasTires(car) ? seasonAnalysis(m, car) : null };
  });
  const sum24 = summarize(seqOf(m, m.nowI, 24));
  const alerts = Object.assign(computeAlerts(m, TCARS(), S, Object.fromEntries(cars.filter(c => c.season).map(c => [c.car.id, c.season]))), extraAlerts(m, sum24));
  return { m, seq, sum, cars, sum24, alerts };
}

/* ---------- rendu : statut, lieux, bandeaux ---------- */
// heure de la météo réellement utilisée pour le lieu affiché (et non du dernier succès sur un autre lieu)
const dataAt = () => (RAW[UI.loc] && RAW[UI.loc].t) || lastOk;
function mainMode() { const m = M[UI.loc]; return locHasCoords(allLocs().find(l => l.id === UI.loc)) && m ? m.mode : null; }
function renderStatus() {
  const mode = DEMO.on ? 'demo' : mainMode(), off = !DEMO.on && offlineNow();
  const b = mode === 'demo' ? '<span class="badge demo"><i></i>DÉMO</span>' : off ? '<span class="badge"><i></i>HORS LIGNE</span>' : mode === 'live' ? '<span class="badge live"><i></i>LIVE</span>' : mode === 'cache' ? '<span class="badge cache"><i></i>CACHE</span>' : '<span class="badge"><i></i>HORS LIGNE</span>';
  let u;
  if (mode === 'demo') u = 'Simulation : aucune donnée réelle';
  else if (off && RAW[UI.loc]) u = 'Données en cache du ' + hmLocal(RAW[UI.loc].t) + ' · figées jusqu’au retour du réseau';
  else if (off) u = 'Aucune donnée météo en cache · reconnexion automatique';
  else if (mode === 'live' && lastOk) u = '<span class="lg">Dernière mise à jour : </span><span class="sh">MAJ </span>' + hmLocal(dataAt()) + ' <span class="auto" title="Actualisation automatique toutes les 5 minutes">· auto 5 min</span>';
  else if (mode === 'cache') u = (RAW[UI.loc] ? 'Cache du ' + hmLocal(RAW[UI.loc].t) : 'Cache') + ' · données non actualisées';
  else u = 'Aucune donnée météo';
  const pause = WEATHER_REQUESTS.state(), limited = !DEMO.on && pause.until > Date.now();
  const blocked = busy || limited && !off;
  document.querySelectorAll('[data-act="refresh"]').forEach(button => { button.disabled = blocked; button.title = busy ? 'Actualisation en cours' : limited && !off ? 'Reprise automatique après la pause du fournisseur météo' : ''; });
  if (limited && !off) u += ' · fournisseur météo limité · reprise automatique après ' + new Date(pause.until).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  if (busy && !off && mode !== 'demo') u += ' <span class="sync">· actualisation…</span>';   // HORS LIGNE → actualisation → LIVE
  if (typeof renderDiag === 'function') renderDiag();
  $('#statusbar').innerHTML = `${b}<span class="upd" aria-live="polite">${u}</span>
    <button class="btn pri sm" data-act="refresh" aria-label="Actualiser maintenant" ${blocked ? 'disabled' : ''}><span class="${busy ? 'spin' : ''}" style="display:inline-block">⟳</span> <span class="lg">Actualiser maintenant</span><span class="sh">Actualiser</span></button>`;
}
function renderLocChips() {
  const el = $('#locChips');
  const gpsChip = GPS ? `<button class="chip gpsc" data-act="loc" data-id="gps" aria-label="Météo : ${esc(GPS.name)} · Ma position${GPS.acc ? ' · précision ±' + esc(GPS.acc) + ' m' : ''}" aria-pressed="${UI.loc === 'gps'}"><span aria-hidden="true">📍</span><span class="loc-copy"><span>Ma position</span><small>${esc(GPS.name)}</small></span></button>`
    : `<button class="chip gpsc" data-act="locate"><span aria-hidden="true">📍</span><span>Ma position</span></button>`;
  const fixed = allLocs().filter(l => !l.gps), chips = fixed.map(l => { const role = l.id === S.work.to ? '🏢 Travail' : l.id === S.locs[0].id ? '🏠 Domicile' : '📌 Destination'; return `<button class="chip" data-act="loc" data-id="${esc(l.id)}" aria-label="Météo : ${esc(l.name)} · ${role}" aria-pressed="${l.id === UI.loc}"><span aria-hidden="true">${role.split(' ')[0]}</span><span class="loc-copy"><small>${role.slice(role.indexOf(' ') + 1)}</small><span>${esc(l.name)}</span></span></button>`; }).join('');
  const refresh = GPS ? '<button class="chip" data-act="locate" aria-label="Actualiser ma position">↻</button>' : '';
  const sel = fixed.find(l => l.id === UI.loc);
  el.classList.toggle('has-gps', !!GPS);
  el.innerHTML = gpsChip +
    `<button class="chip loc-toggle${sel ? ' on' : ''}" data-act="locs-toggle" aria-label="Mes lieux météo${sel ? ' · ' + esc(sel.name) : ''}" aria-controls="locChoices" aria-expanded="${!!UI.locsOpen}"><span class="loc-copy"><small>${sel ? 'Météo consultée' : 'Météo des lieux'}</small><span>${sel ? esc(sel.name) : 'Mes lieux'}</span></span><span aria-hidden="true">${UI.locsOpen ? '▴' : '▾'}</span></button>` + refresh +
    `<div id="locChoices" class="locs-more" ${UI.locsOpen ? '' : 'hidden'}><div class="loc-grid">${chips}</div><button class="chip loc-manage" data-act="goset">Gérer mes lieux</button></div><span class="sub" id="locMsg" ${GEO.error ? '' : 'hidden'}>${GEO.error ? esc(GEO.error.message) : ''}</span>`;
  renderPlace();
}
function renderSrc() {
  const m = M[UI.loc], l = allLocs().find(x => x.id === UI.loc) || allLocs()[0];
  if (!locHasCoords(l)) { $('#srcline').innerHTML = 'Lieu sans coordonnées · météo locale non calculée.'; return; }
  if (!m) { $('#srcline').innerHTML = 'Source : Open-Meteo (aucune donnée chargée).'; return; }
  const obs = m.cur.time ? m.cur.time.slice(11, 16) : '—';
  const srcHtml = DEMO.on
    ? `Source : <b>scénario simulé « ${esc(DEMO_SCN[DEMO.scn].name)} »</b>. Les valeurs ne viennent d’aucun capteur ni d’aucun service météo.`
    : `${lastOk && m.mode === 'live' ? 'Dernière mise à jour : <b>' + hmLocal(dataAt()) + '</b> · ' : ''}Source : <b>Open-Meteo</b>${m.payload.__arome && m.payload.__arome.hours ? ' · <b>Météo-France AROME</b> jusqu’au ' + fmtDay(m.payload.__arome.until.slice(0, 10)) + ' ' + m.payload.__arome.until.slice(11, 16) + ' (visibilité et probabilité de pluie : modèle de base)' : ' (modèle de base, AROME indisponible)'} · modèles météo, pas une station · dernière observation : <b>${obs}</b> heure locale (valeurs actuelles du modèle, renouvelées toutes les 15 min) · ${l.gps ? 'position GPS' + (l.acc ? ' ±' + l.acc + ' m' : '') + (l.sub ? ' · ' + esc(l.sub) : '') : 'position'} ${l.lat.toFixed(2).replace('.', ',')} N, ${l.lon.toFixed(2).replace('.', ',')} E · prévisions horaires sur 14 jours.${m.mode === 'cache' ? ' <b>Données en cache : peuvent être obsolètes.</b>' : ''}`;
  const el = $('#srcline'), open = el.querySelector('details') && el.querySelector('details').open;
  el.innerHTML = `<details${open ? ' open' : ''}><summary>ⓘ Sources et fraîcheur des données${lastOk && m.mode === 'live' ? ' · MAJ ' + hmLocal(lastOk) : ''}</summary><div>${srcHtml}</div></details>`;
}
function renderNotice() {
  const m = M[UI.loc], el = $('#notice');
  if (window.TWRC_STORAGE_ERROR) { el.innerHTML = '<div class="note lvx" role="alert"><b>RÉCUPÉRATION LOCALE</b><span>Une restauration interrompue reste protégée. Libère de l’espace de stockage puis rouvre l’app ; aucun réglage personnel n’est chargé.</span></div>'; return; }
  $('#demoBar').innerHTML = DEMO.on ? `<div class="demo-bar"><b>MODE DÉMO · DONNÉES SIMULÉES, PAS DE MÉTÉO RÉELLE</b><span>${esc(DEMO_SCN[DEMO.scn].name)}</span>
    <select id="demoScn" data-act-change="demoScn" aria-label="Scénario de démo">${Object.keys(DEMO_SCN).map(k => `<option value="${k}" ${k === DEMO.scn ? 'selected' : ''}>${esc(DEMO_SCN[k].name)}</option>`).join('')}</select>
    <button class="btn sm" data-act="demo-off">Quitter la démo</button></div>` : '';
  const lock = LOCKED() && !lsGet('twrc.nocode') ? `<div class="note lvx unlock"><b>🔒 CONFIGURATION</b><span>${storeLocked() ? 'Tes réglages et ton journal sont conservés dans une copie chiffrée. Déverrouille cet appareil avec ton code.' : 'Réglages personnels chiffrés. Entre ton code : il est demandé à chaque réouverture de l’app, pas à chaque rechargement.'}
      <form id="unlockForm" action="#" method="post" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input type="text" name="username" autocomplete="username" value="Race Control" readonly tabindex="-1" aria-hidden="true" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"><input type="password" name="password" id="unlockPw" aria-label="Code de configuration" autocomplete="current-password" placeholder="code" style="flex:1;min-width:150px"><button class="btn sm" type="submit">Déverrouiller</button></form><span class="sub">Accepte « Enregistrer le mot de passe » : l’iPhone le remplira ensuite avec Face ID.</span><span class="sub">${storeLocked() ? '' : 'Pas de code ? <button class="btn sm" data-act="nocode">Utiliser l’app avec mes propres réglages</button>'}</span><span class="sub" id="unlockMsg"></span></span></div>` : '';
  const setup = lock || (CFG_IMPORTED ? `<div class="note lv0"><b>CONFIGURÉ</b><span>Tes lieux et tes voitures sont enregistrés sur cet appareil. Ajoute la page à l’écran d’accueil depuis ce lien.</span></div>`
    : !S.configured ? `<div class="note lvx"><b>À CONFIGURER</b><span>Renseigne tes lieux et tes voitures dans les paramètres. Ils restent sur cet appareil. <button class="btn sm" data-act="goset-cfg">Ouvrir les paramètres</button></span></div>` : '');
  // Une réponse météo peut arriver entre la saisie et la validation du code.
  // Garder le formulaire en place conserve la valeur, le focus et le remplissage du gestionnaire de mots de passe.
  // Sécurité V1 : état du coffre de session (erreur d'écriture, migration non terminée, migration réussie)
  const VS = window.TWRC_VAULT, vaultNote = !VS ? '' : VS.error ? `<div class="note lv2" role="alert" data-k="vault"><b>ENREGISTREMENT CHIFFRÉ</b><span>${esc(VS.error)}</span></div>`
    : VS.warn ? `<div class="note lv1" role="status" data-k="vault"><b>STOCKAGE LOCAL</b><span>${esc(VS.warn)}</span></div>`
    : VS.migrated ? `<div class="note lv0" role="status" data-k="vault"><b>🔐 DONNÉES CHIFFRÉES SUR CET APPAREIL</b><span>Réglages, lieux, journal et code sont désormais chiffrés au repos. Le code sera demandé à chaque réouverture de l’app (le trousseau de l’iPhone peut le remplir) ; un simple rechargement ne le redemande pas.</span></div>` : '';
  const setContent = extra0 => {
    const extra = vaultNote + extra0;
    const form = el.querySelector('.unlock');
    if (lock && form) {
      Array.from(el.childNodes).forEach(node => { if (node !== form) node.remove(); });
      if (extra) form.insertAdjacentHTML('afterend', extra);
    } else el.innerHTML = setup + extra;
  };
  if (m && CX) { setContent(''); return; }
  const err = ERR[UI.loc];
  // le déverrouillage reste possible quand la météo manque (premier lancement hors ligne, fournisseur en panne)
  setContent(`<div class="notice"><h3>${busy ? 'Chargement de la météo…' : 'Météo indisponible'}</h3>
    <p class="muted">${busy ? 'Interrogation d’Open-Meteo.' : `Open-Meteo n’a pas répondu${err ? ' (' + esc(err) + ')' : ''}. Aucune valeur n’est inventée : l’analyse reste vide tant que les données réelles manquent. Cela arrive hors ligne ou quand le réseau bloque l’accès aux services externes.`}</p>
    ${window.TWRC_LIVE_URL ? `<p><a href="${esc(window.TWRC_LIVE_URL)}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">Ouvrir la version en temps réel ↗</a></p>` : ''}
    <div class="chips"><button class="btn pri" data-act="refresh">Réessayer</button><button class="btn" data-act="demo" data-scn="froid">Voir la démo (données simulées)</button></div></div>`);
}
function renderBanners() {
  const el = $('#banners'); if (!CX) { el.innerHTML = ''; return; }
  const { m, alerts } = CX, hs = m.hs, n = m.nowI;
  let vmin = null, vi = null;
  for (let k = 0; k <= Math.max(6, S.horizon); k++) { const x = hs[n + k]; if (x && x.vis != null && (vmin == null || x.vis < vmin)) { vmin = x.vis; vi = k; } }
  let h = '';
  if (vmin != null && vmin < 1000) {
    const lv = vmin < 200 ? 3 : vmin < 500 ? 2 : 1;
    h += `<div class="banner lv${lv}" role="alert"><h3>⚠ Brouillard : visibilité ${f0(vmin)} m${vi ? ' vers ' + hs[n + vi].t.slice(11, 16) : ' maintenant'}</h3>
      <div class="thr"><span class="${vmin < 1000 ? 'on' : ''}">&lt; 1 000 m</span><span class="${vmin < 500 ? 'on' : ''}">&lt; 500 m</span><span class="${vmin < 200 ? 'on' : ''}">&lt; 200 m</span></div>
      <span style="font-size:13px">La météo elle-même impose une prudence particulière : distances de sécurité allongées, feux adaptés, vitesse réduite, quels que soient les pneus.</span></div>`;
  }
  // moteur v2 actif : un brouillard / visibilité prouvé par observation s'affiche même quand le modèle reste clair (score pneus inclus)
  if (!h && EV_FLAG() === 'on') { const v = evNow(), w = v && v.r.worst; if (w && w.lv >= 2 && v.r.headline) h += `<div class="banner lv${w.lv}" role="alert" data-k="ev"><h3>⚠ ${esc(v.r.headline.text)}</h3><span style="font-size:13px">Preuve observée (moteur v2) : prudence quels que soient les pneus. Détail dans l’onglet Météo.</span></div>`; }
  const top = Object.values(alerts).filter(a => S.alerts[a.id] && a.sev >= 2 && a.id !== 'fog' && a.id !== 'vis' && !(UI.view === 'meteo' && TIRE_ALERTS.includes(a.id))).sort((a, b) => b.sev - a.sev).slice(0, 3);
  if (top.length) h += '<div class="notes">' + top.map(a => `<div class="note lv${a.sev}"><b>${a.sev >= 3 ? 'DANGER' : 'ATTENTION'}</b><span>${esc(a.title)}</span></div>`).join('') + '</div>';
  el.innerHTML = h;
}

function decisionOpenCarChooser() {
  if (UI.view === 'analyse' || UI.view === 'trajet') chooseView('pneus');
  const editor = $('#dayContext details.day-editor');
  if (!editor) return false;
  editor.open = true;
  const group = $('#dayContext [role="group"][aria-label="Voiture active"]');
  if (!group) return false;
  group.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  return true;
}

// « Ce qui compte » (3 au plus) : classement des moteurs existants — phénomènes du poste Météo sur les trajets, puis
// alertes — jamais une règle visuelle. Seuls les signaux réels (niveau ≥ 1) y figurent.
function cockpitMatters(alerts) {
  let desk = null; try { desk = CX && CX.m ? wxDesk(wxInput()) : null; } catch (e) { desk = null; }
  const out = [], seen = new Set(), push = (lv, text) => { const k = String(text || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim().slice(0, 32); if (!k || seen.has(k)) return; seen.add(k); out.push({ lv: Math.max(0, Math.min(3, lv)), text: String(text) }); };
  ((desk && desk.matters) || []).filter(m => m.lv >= 1).forEach(m => push(m.lv, m.text));
  (alerts || []).filter(a => a.sev >= 1 && a.id !== 'wxdesk').sort((a, b) => b.sev - a.sev).forEach(a => push(a.sev, a.title));
  return { desk, items: out.sort((a, b) => b.lv - a.lv).slice(0, 3) };
}
function renderDecisionCore() {
  const el = $('#decisionCore');
  if (!el) return;
  if (!CX || !APP_CONTEXT.snapshot || DEMO.on || LOCKED()) {
    el.hidden = true; el.innerHTML = ''; DECISION_LAST = null; return;
  }
  const snap = APP_CONTEXT.snapshot, now = Date.now(), raw = RAW[UI.loc];
  const ageMin = value => {
    const t = typeof value === 'number' ? value : Date.parse(value || '');
    return Number.isFinite(t) ? Math.max(0, (now - t) / 60000) : null;
  };
  const car = appActiveCar(), carEval = car && CX.cars.find(x => x.car.id === car.id);
  const active = !!snap.activeTrip, gpsAge = FIX && Number.isFinite(FIX.ts) ? ageMin(FIX.ts) : null;
  const agendaRequired = !!snap.agendaEvent, calAge = CAL ? ageMin(CAL.updated) : null;
  const confidence = Decision.confidence({
    weather: { available: !!raw && !!CX.m, ageMin: raw ? ageMin(raw.t) : null, mode: raw && raw.mode },
    online: !offlineNow(), contextKnown: snap.status !== 'unknown',
    storageDurable: USER_STORE.durability().status === 'durable',
    tyresRequired: true, carChosen: !!car, tyresKnown: !!(car && hasTires(car) && carEval && carEval.w && !carProfile(car).generic),
    activeTrip: active, gpsAgeMin: gpsAge,
    routeReady: !active || !!(LIVE.route && !LIVE.routeErr && Number.isFinite(LIVE.lastOk) && now - LIVE.lastOk <= 5 * 60e3),
    agendaRequired, agendaAvailable: !!CAL, agendaAgeMin: calAge
  });
  const alerts = Object.values(CX.alerts || {}).filter(a => S.alerts[a.id] && Number.isFinite(a.sev) && (!car || !TIRE_ALERTS.includes(a.id)));
  // Cockpit : le phénomène dominant du moteur Météo entre toujours dans la décision (un danger n'est jamais caché derrière
  // un score pneus rassurant, même si sa notification est désactivée dans les réglages).
  const cm = cockpitMatters(alerts);
  if (cm.desk && cm.desk.level >= 1 && cm.desk.hero) alerts.push({ id: 'wxdesk', sev: cm.desk.level, title: cap1(String(cm.desk.hero.title).toLowerCase()) + (cm.desk.hero.lines[1] ? ' · ' + cm.desk.hero.lines[1] : '') });
  const decision = Decision.decide({ alerts, tyreLevel: carEval && carEval.w ? carEval.w.level : null,
    tyreReason: carEval && carEval.nar ? carEval.nar.head : '', confidence });
  const hour = CX.m && CX.m.hs[CX.m.nowI] || {}, tyre = car && car.tire || {};
  const state = Decision.snapshot({
    at: raw && raw.t || now, riskLevel: decision.riskLevel, confidenceKey: confidence.key,
    weatherMode: raw && raw.mode, weatherAt: raw && raw.t,
    temperature: CX.m && CX.m.cur && CX.m.cur.T, roadTemp: hour.Tr, visibility: hour.vis,
    destinationKey: snap.nextTrip && snap.nextTrip.key || snap.dayContext && snap.dayContext.nextDestination && snap.dayContext.nextDestination.tripKey,
    destinationId: snap.destination && snap.destination.id,
    carId: car && car.id,
    tyreSig: car ? [tyre.type || '', tyre.brand || '', tyre.model || '', tyre.size || ''].join('|') : null,
    placeId: snap.currentLocation && snap.currentLocation.id
  });
  const changes = DECISION_HISTORY.changes(state).slice(0, 4);
  DECISION_HISTORY.save(state);
  DECISION_LAST = { confidence, decision, state, changes };
  const icon = ['✓', '◌', '⚠', '⛔'][decision.displayLevel] || '•';
  const confClass = 'lv' + Math.min(2, confidence.level);
  const destination = snap.destination && snap.destination.name || (snap.destination ? 'Destination' : 'Aucune destination immédiate');
  const carLabel = car ? (car.short || car.name || car.id) : 'À choisir';
  const wAge = raw ? ageMin(raw.t) : null, fresh = wAge == null ? 'météo —' : 'météo ' + (wAge < 1 ? 'moins de 1 min' : Math.round(wAge) + ' min');
  const whyLeft = confidence.reasons.filter(r => !['Lieu courant à confirmer', 'Voiture active à choisir'].includes(r));
  const cur = snap.currentLocation, placeOk = !!(cur && snap.status !== 'unknown'), placeLabel = placeOk ? (cur.name || 'confirmé') : 'non confirmé';
  const changesHtml = changes.length ? '<details class="decision-changes"><summary>Depuis la dernière ouverture · ' + changes.length + ' changement' + (changes.length > 1 ? 's' : '') + '</summary><div>' +
    changes.map(c => '<span class="' + esc(c.kind) + '">' + (c.kind === 'up' ? '↑ ' : c.kind === 'down' ? '↓ ' : '↔ ') + esc(c.text) + '</span>').join('') + '</div></details>' : '';
  el.className = 'decision-core lv' + decision.displayLevel;
  el.hidden = false;
  el.innerHTML = '<div class="decision-top"><div class="decision-main"><span class="decision-k">RACE CONTROL</span><h2>' + icon + ' ' + esc(decision.label) + '</h2><p>' + esc(decision.reason) + (cm.items.length ? '' : ' · pas une garantie de sécurité') + '</p></div>' +
    '<span class="decision-confidence ' + confClass + '">Confiance · <b>' + esc(confidence.label) + '</b> · ' + esc(fresh) + '</span></div>' +
    // « Ce qui compte » sur le cockpit (Pneus, accueil) ; les autres onglets gardent la carte compacte au-dessus de leur verdict
    (cm.items.length && UI.view === 'pneus' ? '<ul class="decision-matters" aria-label="Ce qui compte">' + cm.items.map(x => '<li class="lv' + x.lv + '"><span aria-hidden="true">' + WXD_EMO[x.lv] + '</span><span>' + esc(x.text) + '</span></li>').join('') + '</ul>'
      : '') +
    '<div class="decision-meta"><span class="decision-place">Lieu · <b>' + esc(placeLabel) + '</b>' + (placeOk ? '' : ' <a href="#placeBar" class="decision-change">Confirmer</a>') + '</span>' +
    '<span class="decision-car">Voiture · <b>' + esc(carLabel) + '</b>' + (car ? ' · choix manuel' : '') + ' <button type="button" class="decision-change" data-act="decision-car-change" aria-label="Changer la voiture active">Changer</button></span>' +
    '<span>Destination · <b>' + esc(destination) + '</b></span></div>' +
    // raisons de confiance déjà dites par les lignes Lieu / Voiture : pas de répétition
    (confidence.level > 0 && whyLeft.length ? '<div class="decision-why">' + whyLeft.map(r => '<span>' + esc(r) + '</span>').join('') + '</div>' : '') + changesHtml;
}

/* ---------- probabilités et pluie 15 min ---------- */
const pct = p => p == null ? '—' : Math.round(p * 100) + ' %';
const pLv = p => p >= 0.6 ? 3 : p >= 0.3 ? 2 : p >= 0.1 ? 1 : 0;
function probBars(w, label) {
  if (!w) return '';
  const row = (k, p) => `<div class="pb lv${pLv(p)}"><span class="k">${k}</span><span class="bar"><i style="width:${Math.round(p * 100)}%"></i></span><b class="num">${pct(p)}</b></div>`;
  return `<div class="probs"><div class="sub">${label} · ${w.n} scénarios</div>${row('Chaussée ≤ 0 °C (est.)', w.pRoad0)}${row('Air ≤ 0 °C', w.pAir0)}${row('Verglas élevé ou plus (est.)', w.pIce)}${row('Air sous 5 °C', w.pT5)}${row('Pluie ≥ 0,5 mm/h', w.pRain)}</div>`;
}
function obsBlock(m) {
  const o = m.obs; if (!o) return '';
  const tl = new Date(o.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `<div class="obsb"><div class="mod-h"><span class="sub">MESURE RÉELLE · station ${esc(o.name)} (${esc(o.id)}) à ${f0(o.dist)} km · ${tl}</span><span class="src obs">mesuré</span></div>
    <div class="obs-row"><span><b class="num">${f1(o.T)} °C</b> air</span><span><b class="num">${f1(o.Td)} °C</b> rosée</span><span><b class="num">${visTxt(o.vis)}</b> visibilité</span>${o.wind != null ? `<span><b class="num">${f0(o.wind)}${o.gust ? '–' + f0(o.gust) : ''} km/h</b> vent</span>` : ''}${o.wx ? `<span class="pill lv${/FG|FZ/.test(o.wx) ? 2 : 1}">${esc(wxFr(o.wx))}</span>` : ''}</div>
    <div class="disc">Prévisions recalées sur cette mesure : ${o.dT >= 0 ? '+' : ''}${f1(o.dT)} °C sur l’heure en cours, écart estompé sur 6 h${o.visAdj ? ' ; visibilité observée reportée sur 3 h' : ''}.</div></div>`;
}
function ncBlock(m) {
  const nc = m.nc; if (!nc) return '';
  const txt = nc.nowWet ? `${nc.snow ? 'Neige' : 'Pluie'} en cours${nc.stopAt ? ', fin probable vers ' + nc.stopAt : ' pendant au moins 2 h'}` : nc.startIn != null ? `${nc.snow ? 'Neige' : 'Pluie'} dans ${nc.startIn} min` : 'Pas de pluie prévue d’ici 2 h';
  const cells = nc.slots.map(s => { const p = s.P || 0, l = p >= 1 ? 3 : p >= 0.4 ? 2 : p >= 0.1 ? 1 : 0; return `<i class="${p >= 0.1 ? 'lv' + l : 'lvx'}" title="${s.ts.slice(11, 16)} · ${f1(p)} mm"></i>`; }).join('');
  return `<div class="nc"><div class="sub">PLUIE AU QUART D’HEURE · 2 H · <b style="color:var(--fg)">${txt}</b></div><div class="strip" style="height:14px">${cells}</div><div class="strip-l"><span>${nc.slots[0].ts.slice(11, 16)}</span><span>${nc.slots[nc.slots.length - 1].ts.slice(11, 16)}</span></div></div>`;
}

/* ---------- rendu : météo actuelle ---------- */
function renderCurrent() {
  const el = $('#secCur'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const { m, sum24 } = CX, c = m.cur, hs = m.hs, n = m.nowI;
  const day = m.days.find(d => d.date === m.nowStr.slice(0, 10)) || {};
  const pAgo = hs[n - 3], trend = (pAgo && pAgo.pres != null && c.pres != null) ? c.pres - pAgo.pres : null;
  const snowTxt = sum24.snowSum > 0 || sum24.snowCode ? `Neige prévue${sum24.snowSum > 0 ? ' : ' + f1(sum24.snowSum) + ' cm' : ''}` : sum24.sleet ? 'Neige mouillée possible (estimé)' : 'Aucune prévue sur 24 h';
  const cls = rainClass(c.P);
  const ev = [3, 6, 12].map(k => { const x = hs[n + k]; if (!x) return ''; return `<div><span>Dans ${k} h · ${x.t.slice(11, 16)}</span><b>${f1(x.T)} °C</b><span>${(x.Pl || 0) >= 0.1 ? f1(x.Pl) + ' mm/h' : 'sec'} · vis. ${visTxt(x.vis)}</span></div>`; }).join('');
  const l = allLocs().find(x => x.id === UI.loc);
  el.innerHTML = `<div class="mod-h"><h2>🌡️ Météo actuelle · ${esc(l ? l.name : '')}</h2><span class="src obs">mesuré/prévision météo</span></div>
  <div class="cur"><div class="bigT num">${c.T == null ? '—' : f1(c.T)}<sup>°C</sup></div>
    <div class="cond"><span class="lbl">${icon(c.code)}${esc(wx(c.code))}</span><span class="sub">Ressentie ${f1(c.Tapp)} °C · min ${f1(day.tmin)} / max ${f1(day.tmax)} °C aujourd’hui</span></div></div>
  <div class="metrics">
    ${mt('Humidité', f0(c.RH), '%')}
    ${mt('Point de rosée', f1(c.Td), '°C', c.Td != null && c.T != null ? 'écart ' + f1(c.T - c.Td) + ' °C' : '')}
    ${mt('Précipitations', f1(c.P), 'mm', 'intensité ' + (cls || '—'))}
    ${mt('Prob. de pluie', f0(c.pp), '%')}
    ${mt('Neige', f1(c.snow), 'cm', esc(snowTxt), sum24.snowSum > 0)}
    ${mt('Visibilité', visTxt(c.vis), '', c.vis != null && c.vis < 1000 ? 'brouillard' : '', c.vis != null && c.vis < 1000)}
    ${mt('Vent', f0(c.wind), 'km/h', c.dir != null ? 'de ' + card(c.dir) : '')}
    ${mt('Rafales', f0(c.gust), 'km/h', '', c.gust != null && c.gust >= 55)}
    ${mt('Pression', f0(c.pres), 'hPa', trend == null ? '' : (trend > 0.5 ? '↗ ' : trend < -0.5 ? '↘ ' : '→ ') + f1(trend) + ' / 3 h')}
    ${mt('Nuages', f0(c.cloud), '%')}
    ${uvMetric(m, day)}
    ${mt('Lever du soleil', day.sunrise ? day.sunrise.slice(11, 16) : '—', '')}
    ${mt('Coucher du soleil', day.sunset ? day.sunset.slice(11, 16) : '—', '')}
  </div>
  <div class="mod-h"><h3 style="font-family:var(--f-disp);letter-spacing:.08em;text-transform:uppercase;font-size:16px">Estimations</h3><span class="src est">estimé · pas de capteur routier</span></div>
  <div class="est-box">
    <div class="mt"><span class="k">Température chaussée estimée</span><span class="v">${f1(c.Tr)}<small>°C ± 2</small></span><span class="n">minimum estimé ${f1(CX.sum.TrMin)} °C sur ${S.horizon} h</span></div>
    <div class="mt lv${c.ice && c.ice.level != null ? c.ice.level : 'x'}"><span class="k">❄️ Risque verglas · risque estimé</span><span class="v" style="color:var(--lv-t)">${iceName(c.ice ? c.ice.level : null)}</span><span class="n">pic sur 24 h : ${iceName(sum24.iceLevel)} vers ${hhmm(sum24.iceI)}</span></div>
    <div class="mt"><span class="k">Risque de neige</span><span class="v" style="font-size:14px">${esc(snowTxt)}</span><span class="n">${sum24.sleet && !(sum24.snowSum > 0) ? 'estimé (thermomètre mouillé ≤ 1 °C)' : 'prévision météo'}</span></div>
  </div>
  ${(() => { const fb = frostBand(c.Tr); return fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t} · maintenant</b><span>${fb.d}</span></div>` : ''; })()}
  ${obsBlock(m)}
  ${ncBlock(m)}
  <div><div class="sub" style="margin-bottom:6px">ÉVOLUTION · PRÉVISIONS</div><div class="evo">${ev}</div></div>`;
}

// @include app/calendar-origin-view.js
// @include app/weather-view.js
// @include app/analysis-view.js
// @include app/debrief-view.js
/* ---------- mode Météo : bascule, ordre des modules ---------- */
const TIRE_ALERTS = ['press', 'age', 'mont'];
const curLoc = () => allLocs().find(x => x.id === UI.loc) || allLocs()[0];
const scrollBehavior = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
function chooseView(view) {
  UI.view = ['pneus', 'meteo', 'trajet', 'tenue', 'analyse'].includes(view) ? view : 'pneus';
  lsSet('twrc.view', UI.view); try { sessionStorage.setItem('rc.tab', UI.view); } catch (e) { /* session indisponible */ }
  renderAll(); window.scrollTo({ top: 0, behavior: scrollBehavior() });
}
/* ---------- bureau (≥ 1200 px, souris) : colonne principale + colonne de compléments, côte à côte ----------
   Même contenu et mêmes sections que sur mobile, seulement réparties : rien n'est masqué ni dupliqué. Le mobile (et le tactile)
   garde la colonne unique : le passage d'un mode à l'autre déplace les sections, sans re-rendu ni perte d'état. */
const DESK = typeof matchMedia === 'function' ? matchMedia('(min-width: 1200px) and (pointer: fine)') : { matches: false };
const DESK_FULL = new Set(['hdrMore', 'banners', 'jump']);
const DESK_RAIL = {
  pneus: ['secWeatherLink', 'secCmp', 'secDebrief', 'secIce', 'secCal', 'secTip', 'secAlerts'],
  meteo: ['secRadar', 'secAir', 'secIce', 'secDebrief', 'secAlerts', 'secTip', 'secCal'],
  analyse: ['secSeason', 'secJournal', 'secDebrief'],
  tenue: [], trajet: []
};
function deskLayout(order) {
  let cols = document.getElementById('deskCols');
  document.body.classList.toggle('desk', !!DESK.matches);
  if (!DESK.matches) {   // colonne unique : toute section restée dans les colonnes (absente de l'ordre de cette vue) revient avant elles
    if (cols) { cols.querySelectorAll('#deskMain > *, #deskRail > *').forEach(el => cols.before(el)); cols.remove(); }
    return;
  }
  if (!cols) {
    cols = document.createElement('div'); cols.id = 'deskCols'; cols.className = 'desk-cols';
    cols.innerHTML = '<div class="desk-main" id="deskMain"></div><aside class="desk-rail" id="deskRail" aria-label="Compléments"></aside>';
  }
  const view = ['meteo', 'trajet', 'tenue', 'analyse'].includes(UI.view) ? UI.view : 'pneus', rail = new Set(DESK_RAIL[view]);
  const main = cols.querySelector('#deskMain'), side = cols.querySelector('#deskRail'), notice = document.getElementById('notice');
  if (notice.nextElementSibling !== cols) notice.after(cols);
  order.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (DESK_FULL.has(id)) cols.before(el); else (rail.has(id) ? side : main).appendChild(el);
  });
  document.body.classList.toggle('desk-solo', !rail.size);
}
const deskSync = () => { if (!!DESK.matches !== document.body.classList.contains('desk')) { renderView.last = null; renderView(); } };
if (DESK.addEventListener) DESK.addEventListener('change', deskSync);
window.addEventListener('resize', deskSync);   // filet : certains navigateurs signalent le changement de média plus tard
function renderView() {
  const vm = UI.view === 'meteo', vtr = UI.view === 'trajet', vt = UI.view === 'tenue', va = UI.view === 'analyse', vp = !vm && !vtr && !vt && !va;
  document.body.classList.toggle('vm', vm);
  document.body.classList.toggle('vtr', vtr);
  document.body.classList.toggle('vt', vt);
  document.body.classList.toggle('va', va);
  const nav = $('#viewSeg'), navHtml = `<div class="seg view" role="group" aria-label="Affichage"><button data-act="view" data-v="meteo" aria-pressed="${vm}"><span class="tab-ic" aria-hidden="true">🌦️</span> Météo</button><button data-act="view" data-v="pneus" aria-pressed="${vp}"><span class="tab-ic" aria-hidden="true">🛞</span> Pneus</button><button class="trip-tab" data-act="view" data-v="trajet" aria-pressed="${vtr}"><span class="tab-ic" aria-hidden="true">🧭</span> TRAJET</button><button data-act="view" data-v="tenue" aria-pressed="${vt}"><span class="tab-ic" aria-hidden="true">👔</span> Tenue</button><button data-act="view" data-v="analyse" aria-pressed="${va}"><span class="tab-ic" aria-hidden="true">🔬</span> Analyse</button></div>`;
  // Un rendu identique conserve les boutons, leur focus et les liens ; les changements restent calculés à chaque appel.
  if (nav.innerHTML !== navHtml) nav.innerHTML = navHtml;
  const links = vtr ? [['secTrip', 'Planifier'], ['settings', 'Réglages']] : va ? [['secLab', 'Analyse'], ['secSeason', 'Saison pneus'], ['secJournal', 'Journal de saison'], ['settings', 'Réglages']] : vt ? [['secTenue', 'Ma tenue'], ['settings', 'Réglages']] : vm
    ? [['secWx', 'Synthèse'], ['secRadar', 'Radar'], ['secChart', '24 h'], ['secDays', '7 jours'], ['secCur', 'Détails'], ['secAir', 'Air · UV'], ['secIce', 'Verglas'], ['secAlerts', 'Alertes'], ['settings', 'Réglages']]
    : [['secBrf', 'Départ'], ['secCars', 'Voitures'], ['secBrief', 'Préparer'], ['secWeatherLink', 'Météo'], ['secIce', 'Verglas'], ['secAlerts', 'Alertes'], ['settings', 'Réglages']];
  if (!vtr && USER_STORE.state.debrief.entries.length && !DEMO.on) links.splice(1, 0, ['secDebrief', 'Journal des trajets']);
  const jump = $('#jump'), jumpHtml = links.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('');
  if (jump.innerHTML !== jumpHtml) jump.innerHTML = jumpHtml;
  const order = vtr
    ? ['secTrip', 'secTripSummary', 'hdrMore', 'banners', 'secBrf', 'secCal', 'secCur', 'secTip', 'secCars', 'secBrief', 'secCmp', 'secIce', 'secChart', 'secDays', 'secRadar', 'secAir', 'secSeason', 'secJournal', 'secAlerts', 'secWx', 'secLab', 'secTenue']
    : va
    ? ['jump', 'secLab', 'secSeason', 'secJournal', 'hdrMore', 'banners', 'secTenue', 'secBrf', 'secCal', 'secCur', 'secTip', 'secCars', 'secBrief', 'secCmp', 'secIce', 'secChart', 'secDays', 'secRadar', 'secAir', 'secAlerts', 'secWx'] : vt
    ? ['secTenue', 'hdrMore', 'banners', 'secBrf', 'secCal', 'secCur', 'secTip', 'secCars', 'secBrief', 'secCmp', 'secIce', 'secChart', 'secDays', 'secRadar', 'secAir', 'secSeason', 'secJournal', 'secAlerts', 'secWx', 'secLab'] : vm
    ? ['secWx', 'banners', 'hdrMore', 'secRadar', 'secChart', 'secDays', 'secCur', 'secAir', 'secIce', 'secAlerts', 'secTip', 'secCal', 'secBrf', 'secCars', 'secBrief', 'secCmp', 'secSeason', 'secJournal', 'secLab']
    : ['secTripSummary', 'secBrf', 'banners', 'hdrMore', 'secCars', 'secBrief', 'secCmp', 'secWeatherLink', 'secCal', 'secCur', 'secTip', 'secIce', 'secChart', 'secDays', 'secRadar', 'secAir', 'secSeason', 'secJournal', 'secAlerts', 'secWx', 'secLab', 'secTenue'];
  if (renderView.last === UI.view) return; renderView.last = UI.view;
  let prev = $('#notice');
  if (!va && !vtr) order.splice(order.indexOf('hdrMore') + 1, 0, 'jump');
  const brf = order.indexOf('secBrf'); if (brf >= 0) order.splice(brf + 1, 0, 'secRoad');
  if (!vtr) order.splice(va ? 2 : 1, 0, 'secDebrief');
  order.forEach(id => { const el = document.getElementById(id); if (!el) return; if (prev.nextElementSibling !== el) prev.after(el); prev = el; });
  deskLayout(order);
  if (RADAR.map) { const map = RADAR.map; setTimeout(() => { if (RADAR.map === map) map.invalidateSize(); }, 60); }
}

/* ---------- tenue : adaptation en mémoire, sans réseau ni nouveau stockage ---------- */
// Les horodatages du moteur sont locaux et naïfs. L'agenda publié est en heure de
// Paris ; les prévisions d'une destination peuvent utiliser un autre fuseau.
function tenueZoneTime(ts, fromZone, toZone) {
  if (!ts || fromZone === toZone) return ts;
  const nominal = tsToDate(ts.slice(0, 16)).getTime();
  let instant = nominal;
  const local = (n, zone) => new Date(n).toLocaleString('sv-SE', { timeZone: zone, hour12: false }).replace(' ', 'T').slice(0, 16);
  // Résolution du décalage à la date du créneau, y compris autour du changement d'heure.
  for (let k = 0; k < 3; k++) {
    const delta = nominal - tsToDate(local(instant, fromZone)).getTime();
    if (!delta) break;
    instant += delta;
  }
  return local(instant, toZone);
}
function buildTenueDay(options = {}) {
  const context = options.context || null;
  const settings = options.settings || S, models = options.models || M, raw = options.raw || RAW;
  const calendar = Object.prototype.hasOwnProperty.call(options, 'calendar') ? options.calendar : CAL;
  const calendarModels = options.calendarModels || CALM, legModels = options.legModels || LEGM, midModels = options.midModels || MIDM;
  const gps = Object.prototype.hasOwnProperty.call(options, 'gps') ? options.gps : GPS;
  const locs = [...(gps ? [gps] : []), ...(settings.locs || []), ...(settings.customs || [])];
  const selected = typeof options.currentLoc === 'object' ? options.currentLoc : locs.find(x => x.id === (options.currentLoc || UI.loc)) || locs[0];
  const ref = selected && models[selected.id], zone = options.timezone || (ref && ref.tz) || 'Europe/Paris';
  const localNow = (options.localNow || nowIn(zone)).slice(0, 16), offset = options.dayOffset == null ? UI.outfitDay : options.dayOffset;
  const date = addMin(localNow.slice(0, 10) + 'T00:00', offset === 1 ? 1440 : 0).slice(0, 10);
  const midnight = date + 'T00:00', start = offset === 1 ? date + 'T07:00' : localNow;
  // Après 23 h, on couvre encore la fin de l'heure courante jusqu'à minuit.
  const end = start < date + 'T23:00' ? date + 'T23:00' : addMin(midnight, 1440);
  const retrievalNow = options.retrievalNow == null ? Date.now() : options.retrievalNow;
  const cancelState = settings === S ? appCalendarCancelState(options.cancelState || TRIPCANCEL) : options.cancelState || TRIPCANCEL, cancelNow = options.cancelNow == null ? Date.now() : options.cancelNow;
  const events = (calendar && calendar.events || []).filter(e => e.s);
  const eventCancelled = e => calendarCancelled(e, events, cancelState, cancelNow);
  const commuteCancelled = day => workCancelled(day, cancelState, cancelNow);
  const agendaZone = options.calendarTimezone || 'Europe/Paris', agendaTime = ts => tenueZoneTime(ts.slice(0, 16), agendaZone, zone);
  const warnings = [], finite = v => typeof v === 'number' && Number.isFinite(v);
  const coords = x => x && finite(x.lat) && finite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180;
  const norm = s => String(s || '').trim().toLocaleLowerCase('fr-FR');
  const byId = id => locs.find(x => x.id === id);
  const home = (settings.locs || [])[0], work = settings.work || {};
  // La position observée reste le lieu physique même si sa météo manque ou
  // provient du cache. Son âge et sa précision suivent les critères de LIVE.
  const gpsTime = gps && (gps.t ?? gps.ts), gpsAge = retrievalNow - gpsTime;
  const gpsSeed = offset !== 1 && selected && (selected.id === 'gps' || selected.gps) && coords(gps) &&
    finite(gpsTime) && gpsAge <= LIVE_AGE_IMM && gpsAge > -60e3 && finite(gps.acc) && gps.acc >= 0 && gps.acc <= LIVE_ACC;
  const samePlace = (a, b) => a && b && ((a.id && a.id === b.id) || (coords(a) && coords(b) && distKm(a, b) < 1.5));
  const knownModel = p => {
    if (!p) return { m: null, t: null };
    const candidates = [];
    const known = p.id && models[p.id] ? p : p.id && byId(p.id) || (p.home || norm(p.label) === 'domicile' ? home : null) || locs.find(l => samePlace(l, p));
    if (known && models[known.id]) candidates.push({ m: models[known.id], t: raw[known.id] && raw[known.id].t });
    if (coords(p)) {
      const c = calendarModels['cal' + p.lat.toFixed(2) + '_' + p.lon.toFixed(2)];
      if (c && c.m) candidates.push({ m: c.m, t: c.t });
      for (const c of Object.values(legModels)) {
        const m = c && c.models && c.models.find(m => m && samePlace(m.loc, p));
        if (m) candidates.push({ m, t: c.t });
      }
    }
    const eligible = ref && ref.mode === 'demo' ? candidates.filter(source => source.m.mode === 'demo') : candidates;
    eligible.sort((a, b) => Number(sourceStale(a)) - Number(sourceStale(b)) || (finite(b.t) ? b.t : -Infinity) - (finite(a.t) ? a.t : -Infinity));
    return eligible[0] || { m: null, t: null };
  };
  const place = p => p ? { ...p, name: p.name || p.city || p.label || p.loc || 'Lieu connu' } : null;
  const resolveEvent = e => place(calendarEventPlace(e, calendarPlaces(settings)));
  const sourceStale = source => {
    const m = source.m; if (!m || m.mode === 'demo') return false;
    if (ref && ref.mode === 'demo') return false;
    if (m.mode === 'cache' || !finite(source.t) || retrievalNow - source.t > 60 * 60e3 || source.t > retrievalNow + 15 * 60e3) return true;
    // Les modèles horaires agenda n'ont pas de valeur « current » : leur âge de
    // récupération suffit. Un modèle avec current doit aussi avoir une observation récente.
    const current = m.cur && m.cur.time;
    if (current) {
      const currentNow = tenueZoneTime(localNow, zone, m.tz || zone);
      const age = (tsToDate(currentNow) - tsToDate(current.slice(0, 16))) / 60000;
      if (age > 90 || age < -15) return true;
    }
    return false;
  };
  const sample = (source, ts) => {
    const m = source && source.m; if (!m || !Array.isArray(m.hs)) return null;
    if (ref && ref.mode === 'demo' && m.mode !== 'demo') return null;
    const local = tenueZoneTime(ts, zone, m.tz || zone), hour = local.slice(0, 13) + ':00';
    const i = m.byTime ? m.byTime.get(hour) : m.hs.findIndex(x => x.t === hour);
    const h = i != null && i >= 0 ? m.hs[i] : null; if (!h) return null;
    const c = m.cur, age = c && c.time ? (tsToDate(tenueZoneTime(localNow, zone, m.tz || zone)) - tsToDate(c.time.slice(0, 16))) / 60000 : Infinity;
    const current = offset !== 1 && ts.slice(0, 13) === localNow.slice(0, 13) && c && c.time && c.time.slice(0, 13) === local.slice(0, 13) && age >= -15 && age <= 90;
    return current ? { ...h, ...c, uv: h.uv, t: ts } : { ...h, t: ts };
  };
  const segments = [];
  const trip = (from, to, dep, arr, kind, priority, sources, key) => {
    if (!dep || !arr || arr <= dep || arr <= midnight || dep >= end) return;
    segments.push({ start: dep, end: arr, from: place(from), to: place(to), kind: 'trip', origin: kind, priority, sources, key, location: `${(place(from) || {}).name || 'Lieu inconnu'} → ${(place(to) || {}).name || 'Lieu inconnu'}` });
  };
  const commute = day => {
    const from = byId(work.from), to = byId(work.to); if (!from || !to) return;
    const dur = +work.durMin || 30;
    [['go', from, to, work.dep], ['ret', to, from, work.ret]].forEach(([dir, a, b, time]) => {
      if (!/^\d{2}:\d{2}$/.test(time || '')) return;
      const sourceZone = models[a.id] && models[a.id].tz || zone;
      const sourceDay = tenueZoneTime(day + 'T12:00', zone, sourceZone).slice(0, 10);
      if (!appWorkOn(sourceDay, work.days) || commuteCancelled(sourceDay)) return;
      const dep = tenueZoneTime(sourceDay + 'T' + time, sourceZone, zone), pts = [{ f: 0, ...knownModel(a) }, ...midPoints(a, b).filter(p => midModels[p.id]).map(p => ({ f: p.f, m: midModels[p.id], t: midModels[p.id].retrievedAt ?? null })), { f: 1, ...knownModel(b) }];
      trip(a, b, dep, addMin(dep, dur), dir === 'go' ? 'work-go' : 'work-ret', 10, pts, 'commute|' + sourceDay + 'T' + time + '|' + dir);
    });
  };
  commute(addMin(midnight, -1440).slice(0, 10)); commute(date); commute(addMin(midnight, 1440).slice(0, 10));
  const direct = settings.calDirect || {};
  // Même chaîne effective que les trajets, mais seulement des lectures : effLegs
  // peut lancer OSRM/legEval. Le plan de tenue ne lance aucun appel réseau.
  const effective = TripCancel.rebuild(events, home, direct, cancelState, cancelNow, {
    beforeFirst: e => tripCancelBeforeFirst(e, settings, cancelState, cancelNow),
    relevant: e => !!calendarEventPlace(e, calendarPlaces(settings)),
    place: e => calendarEventPlace(e, calendarPlaces(settings))
  });
  for (const e of events) {
    if (!calendarEventRelevant(e, calendarPlaces(settings)) || eventCancelled(e)) continue;
    const begin = agendaTime(e.allDay ? e.s.slice(0, 10) + 'T09:00' : e.s);
    const finish = agendaTime(e.allDay ? e.s.slice(0, 10) + 'T18:00' : e.e || addMin(e.s, 60));
    const p = resolveEvent(e);
    if (finish > midnight && begin < end && finish > begin) {
      segments.push({ start: begin, end: finish, kind: 'event', priority: 30, to: p, title: e.t || 'Rendez-vous',
        location: p ? `${e.t || 'Rendez-vous'} · ${p.name}` : 'Lieu inconnu · météo locale non calculée', unknown: !p });
      if (e.allDay) warnings.push('Événement sur la journée entière : créneau 09:00–18:00 supposé, à confirmer.');
    }
    const legs = p ? effective.get(e) || [] : [];
    for (let l of legs) {
      // Le briefing peut avoir déjà publié la route ET sa météo. Sinon les
      // heures et l'ancienne géométrie ne justifient aucune adaptation Tenue.
      if (l.originPending && cancelState === TRIPCANCEL && calendar === CAL) l = tripCancelReadyLeg(e, l) || l;
      if (l.originPending || l.originUncertain) {
        warnings.push('Origine à confirmer après annulation du trajet précédent : la tenue ne tient pas compte de cette route en attente.');
        continue;
      }
      if (!l.from || !l.to || !l.dep) continue;
      const dep = agendaTime(l.dep), arr = agendaTime(l.arr || addMin(l.dep, +l.min || 0));
      const c = legModels[legKey(l)], pts = legPoints(l).map((p, i) => ({ f: p.f, ...(c && c.models && c.models[i] ? { m: c.models[i], t: c.t } : knownModel(p)) }));
      trip(l.from, l.to, dep, arr, 'agenda', 40, pts, context ? calendarTripKey(e, l) : l.k);
    }
  }
  if (!calendar) warnings.push('Agenda indisponible : le plan suit les lieux et trajets déjà connus.');
  else if (calendar.updated && retrievalNow - Date.parse(calendar.updated) > 24 * 60 * 60e3) warnings.push('Agenda ancien : lieux et horaires à confirmer.');
  // Au présent, une observation GPS fiable prévaut sur un programme commencé
  // auparavant. Aucun trajet implicite vers son ancienne origine n'est ajouté.
  // start est arrondi à la minute : l'observation peut déjà être postérieure à
  // un départ/événement de cette même minute, qui ne remplace donc pas le GPS.
  const contextSeed = context && offset !== 1 && (context.activeTrip ? context.origin : context.location.source === 'gps' && context.gps ? context.gps : context.currentLocation);
  if (context && offset !== 1) {
    // Les trajets effectifs viennent du même plan que Météo et Analyse. Le
    // calendrier reste une prévision des activités, jamais une preuve d'arrivée.
    const templates = segments.filter(s => s.kind === 'trip');
    for (let i = segments.length - 1; i >= 0; i--) if (segments[i].kind === 'trip' && (contextSeed || segments[i].end > start)) segments.splice(i, 1);
    if (contextSeed) segments.forEach(s => {
      if (!s.nonSpatial && s.start <= start && (context.location.source === 'gps' || !s.to || !samePlace(s.to, contextSeed))) s.beforeGps = true;
    });
    context.trips.forEach(t => {
      if (t.originPending || !t.dep || !t.arr) return;
      const from = appTripPlace(t, 'from'), to = appTripPlace(t, 'to'); if (!from || !to) return;
      const template = templates.find(s => s.key === t.key);
      const sources = template && samePlace(template.from, from) ? template.sources : [{ f: 0, ...knownModel(from) }, { f: 1, ...knownModel(to) }];
      const active = context.activeTrip && context.activeTrip.key === t.key;
      if (contextSeed && !active && agendaTime(t.dep) <= start) return;
      trip(from, to, agendaTime(t.dep), agendaTime(t.arr), t.src === 'work' ? t.td.dir === 'ret' ? 'work-ret' : 'work-go' : 'agenda', active ? 50 : t.src === 'work' ? 10 : 40, sources, t.key);
    });
  } else if (gpsSeed) segments.forEach(s => { if (!s.nonSpatial && s.start <= start) s.beforeGps = true; });
  const boundaries = new Set([midnight, start, end]);
  for (let t = midnight; t < end; t = addMin(t, 60)) boundaries.add(t);
  segments.forEach(s => {
    boundaries.add(s.start); boundaries.add(s.end);
    const sources = s.sources || [knownModel(s.to)];
    sources.forEach(source => {
      const m = source.m; if (!m) return;
      // Fuseaux à décalage de demi-heure : couper aussi aux heures du modèle.
      m.hs.forEach(x => { const t = tenueZoneTime(x.t, m.tz || zone, zone); if (t > s.start && t < s.end) boundaries.add(t); });
    });
    if (s.kind === 'trip') {
      const duration = (tsToDate(s.end) - tsToDate(s.start)) / 60000;
      (s.sources || []).forEach((p, i, pts) => { if (i) boundaries.add(addMin(s.start, Math.round(duration * (pts[i - 1].f + p.f) / 2))); });
    }
  });
  // Tous les changements de météo du lieu de base restent visibles, même si
  // le modèle se trouve dans un fuseau à décalage non entier.
  Object.values(models).forEach(m => { if (m && m.hs) m.hs.forEach(x => { const t = tenueZoneTime(x.t, m.tz || zone, zone); if (t > midnight && t < end) boundaries.add(t); }); });
  const times = [...boundaries].filter(t => t <= end).sort(), moments = [];
  let current = place(contextSeed || (gpsSeed ? gps : segments.some(s => s.kind === 'trip' || s.to) ? home : selected || home));
  for (let i = 0; i < times.length - 1; i++) {
    const at = times[i], until = times[i + 1];
    if ((gpsSeed || contextSeed) && at < start) continue;
    // Un rendez-vous sans lieu peut masquer la frise du trajet, mais ne peut
    // effacer son arrivée connue. Une diversion localisée prioritaire remplace
    // en revanche le trajet prévu et conserve son dernier lieu.
    segments.filter(s => !s.cancelled && !s.beforeGps && s.kind === 'trip' && s.end === at && s.to)
      .sort((a, b) => a.priority - b.priority).forEach(s => {
        const diverted = segments.some(other => !other.cancelled && !other.beforeGps && other !== s && other.to && !other.unknown &&
          other.priority > s.priority && other.start < s.end && other.end > s.start);
        if (!diverted) current = s.to;
      });
    const starting = segments.filter(s => !s.beforeGps && s.start === at).sort((a, b) => a.priority - b.priority);
    starting.forEach(s => {
      if (s.origin === 'work-ret' && current && !samePlace(current, s.from)) { s.cancelled = true; warnings.push('Retour domicile-travail non retenu : le dernier lieu connu est ailleurs.'); }
      if (s.origin === 'agenda' && current && s.from && !samePlace(current, s.from)) warnings.push(`Origine du trajet agenda à confirmer : départ prévu depuis ${s.from.name}, dernier lieu connu ${current.name}.`);
      if (!s.cancelled && s.kind === 'event' && s.to) current = s.to;
    });
    const candidates = segments.filter(s => !s.cancelled && !s.beforeGps && s.start <= at && s.end > at).sort((a, b) => b.priority - a.priority);
    const logical = candidates[0] && candidates[0].nonSpatial ? candidates[0] : null;
    const active = logical ? candidates.find(s => !s.nonSpatial) : candidates[0];
    if (at < start || at >= end || until <= at) continue;
    let source, location, kind, unknown = false;
    if (active && active.kind === 'trip') {
      const duration = tsToDate(active.end) - tsToDate(active.start), f = duration ? (tsToDate(at) - tsToDate(active.start)) / duration : 0;
      source = (active.sources || []).reduce((best, p) => !best || Math.abs(p.f - f) < Math.abs(best.f - f) ? p : best, null) || { m: null, t: null };
      location = active.location; kind = 'trip'; unknown = !coords(active.from) || !coords(active.to);
    } else if (active) {
      unknown = active.unknown; source = unknown ? { m: null, t: null } : knownModel(active.to); location = active.location; kind = 'event';
    } else {
      source = knownModel(current); location = current ? current.name : 'Lieu inconnu · météo locale non calculée'; unknown = !current;
      kind = samePlace(current, home) ? 'home' : samePlace(current, byId(work.to)) ? 'work' : 'gap';
    }
    const physicalEvent = kind === 'event';
    if (logical) { location = `${logical.location} · ${location}`; kind = 'event'; }
    const weather = unknown ? null : sample(source, at);
    moments.push({ start: at, end: until > end ? end : until, location, kind, event: physicalEvent, weather, unknown, stale: sourceStale(source) });
  }
  return { date, start, end, occasion: options.occasion || appOutfitOccasion(offset), moments, warnings: [...new Set(warnings)] };
}
/* ---------- vue du plan : le détail lit exactement le conseil du moteur ---------- */
function renderTenue() {
  const el = $('#secTenue'); el.hidden = UI.view !== 'tenue'; if (el.hidden) return;
  const context = APP_CONTEXT.snapshot, l = context.currentLocation || curLoc(), m = M[l.id], tomorrow = UI.outfitDay === 1; UI.outfitOccasion = appOutfitOccasion();
  const controls = `<div class="outfit-controls"><div class="seg" role="group" aria-label="Jour de la tenue">${[[0, 'Aujourd’hui'], [1, 'Demain']].map(([v, t]) => `<button data-act="outfit-day" data-v="${v}" aria-pressed="${UI.outfitDay === v}">${t}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Usage de la tenue">${[['office', 'Bureau'], ['outing', 'Sortie'], ['walk', 'Promenade']].map(([v, t]) => `<button data-act="outfit-occasion" data-v="${v}" aria-pressed="${UI.outfitOccasion === v}">${t}</button>`).join('')}</div></div>`;
  const head = `<div class="mod-h"><h2>👔 Tenue · ${esc(l.name)}</h2><span class="src obs">Sartorial</span></div>${controls}`;
  const input = buildTenueDay({ currentLoc: l, context }), plan = dayplan(input), a = plan && plan.advice;
  if (!a) {
    el.innerHTML = `${head}<div class="outfit-empty" role="status"><h3>${busy ? 'Météo en cours de chargement' : 'Météo insuffisante pour cette tenue'}</h3><p>${tomorrow ? 'Les prévisions de demain ne sont pas encore disponibles pour ce lieu.' : 'Il faut une température pour proposer des couches adaptées.'}</p><button class="btn" data-act="refresh" ${busy ? 'disabled' : ''}>Actualiser la météo</button></div>`; return;
  }
  const stale = input.moments.some(x => x.stale), state = m && m.mode === 'demo' ? 'Simulation · aucune donnée réelle' : stale ? 'Données anciennes · tenue à confirmer' : 'Prévisions météo · conseil de confort';
  const interval = `${fmtDay(plan.date)} · ${plan.start.slice(11, 16)}–${plan.end.slice(11, 16)}`;
  const metric = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  const detail = [...new Set([...a.notes, ...plan.notes, ...plan.warnings])];
  if (a.partial || input.moments.some(x => !x.weather && !x.unknown)) detail.push('Données partielles : certains créneaux, le ressenti, la pluie ou les rafales manquent.');
  const timeline = plan.timeline.map(x => {
    const w = x.weather, f = w && (num(w.Tapp) ?? num(w.T));
    const range = x.temperatureRange;
    const feels = range && range.low != null && range.high != null && range.low !== range.high ? `${f1(range.low)} à ${f1(range.high)} °C` : f == null ? '—' : `${f1(f)} °C`;
    const rain = !w ? 'Pluie —' : w.pp != null ? `Pluie ${f0(w.pp)} %${w.P != null ? ' · ' + f1(w.P) + ' mm' : ''}` : w.P != null ? `Pluie ${f1(w.P)} mm` : 'Pluie —';
    const wind = !w ? 'Vent —' : w.gust != null ? `Rafales ${f0(w.gust)} km/h` : w.wind != null ? `Vent ${f0(w.wind)} km/h` : 'Vent —';
    return `<li class="outfit-moment" data-kind="${esc(x.kind)}" data-start="${esc(x.start)}"><div class="outfit-moment-heading"><time>${esc(x.start.slice(11, 16))}–${esc(x.end.slice(11, 16))}</time><b>${esc(x.location)}</b></div>
      ${x.unknown ? '' : `<div class="outfit-moment-weather"><span>Ressenti ${esc(feels)}${w && w.Tapp == null && w.T != null ? ' · air' : ''}</span><span>${esc(rain)}</span><span>${esc(wind)}</span></div>`}
      ${x.status && (!x.unknown || x.status !== x.location) ? `<p class="outfit-moment-status${x.stale || x.unknown || !w ? ' old' : ''}">${esc(x.status)}</p>` : ''}
      ${x.layers.length ? `<p class="outfit-moment-layers">N${x.level} · ${x.layers.map(esc).join(' + ')}</p>` : ''}
      ${x.actions.length ? `<ul class="outfit-moment-actions">${x.actions.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}</li>`;
  }).join('');
  const carry = [...new Set([...plan.carry, ...a.accessories])];
  el.innerHTML = `${head}<div class="outfit-context${stale ? ' old' : ''}"><span>${esc(state)}</span><b>${esc(interval)}</b></div>
    <div class="outfit-body"><div class="outfit-dayplan"><div class="outfit-plan-heading"><h3>🧥 Plan de tenue de la journée</h3><span class="outfit-indicator" data-level="${esc(plan.indicator.level)}">${esc(plan.indicator.text)}</span>${plan.weatherWarning ? `<span class="outfit-weather-warning" data-level="warning" data-risks="${esc(plan.weatherWarning.risks.join(' '))}" role="status">${esc(plan.weatherWarning.text)}</span>` : ''}</div>
      <div class="outfit-base"><span class="outfit-label">Kit complet de la journée · N${plan.base.level} max</span><p>${plan.base.layers.map(esc).join(' + ')}</p></div>
      <div class="outfit-extra outfit-carry"><h3>🎒 À emporter</h3>${carry.length ? `<ul>${carry.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>Aucune pièce supplémentaire prévue.</p>'}</div>
      ${plan.actions.length ? `<div class="outfit-extra outfit-actions"><h3>🔄 Adaptations prévues</h3><ul>${plan.actions.map(x => `<li data-time="${esc(x.time)}"><b>${esc(x.time.slice(11, 16))}</b> · ${esc(x.text)}</li>`).join('')}</ul></div>` : ''}
      <ol class="outfit-timeline" aria-label="Heures, lieux et adaptations de la tenue">${timeline}</ol></div>
    <div class="outfit-side"><div class="outfit-verdict"><span class="outfit-label">${tomorrow ? 'Ta tenue de demain' : 'Ta tenue pour la suite de la journée'} · kit complet</span><h3>${esc(a.title)}</h3><p>Détail du kit complet du plan ; la timeline indique les couches portées à chaque moment.</p></div>
    <div class="outfit-metrics">${metric('Ressenti' + (a.tempFallback ? ' / air' : ''), f0(a.low) + ' à ' + f0(a.high) + ' °C')}${metric('Pluie · max', a.pp == null ? '—' : f0(a.pp) + ' %')}${metric('Rafales · max', a.gust == null ? '—' : f0(a.gust) + ' km/h')}</div>
    <div class="outfit-pieces">${a.pieces.map((p, i) => `<div class="outfit-piece"><span class="outfit-no mono">0${i + 1}</span><div><span class="outfit-label">${esc(p.label)}</span><h4>${esc(p.item)}</h4><p>${esc(p.detail)}</p></div></div>`).join('')}</div>
    <div class="outfit-palette"><span class="outfit-label">Accord de couleurs suggéré</span><div>${a.palette.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
    ${detail.length ? `<div class="outfit-extra"><h3>📝 À prévoir</h3><ul>${detail.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <p class="outfit-method">Suggestions de pièces, à adapter à ce que tu possèdes et à ta sensibilité au froid. Les seuils sont des repères de confort. Le ressenti météo intègre déjà le vent ; aucune température de chaussée ni score pneus n’intervient ici.</p></div></div>`;
}

/* ---------- UV ---------- */
function uvToday(m) {
  const today = m.nowStr.slice(0, 10); let best = null;
  m.hs.forEach(x => { if (x.date === today && x.uv != null && (!best || x.uv > best.uv)) best = x; });
  return best;
}
function uvMetric(m, day) {
  const now = uvInfo((m.hs[m.nowI] || {}).uv), pk = uvToday(m), mx = uvInfo(day && day.uv != null ? day.uv : pk ? pk.uv : null);
  if (!now && !mx) return mt('Indice UV', '—', '');
  return mt('Indice UV', now ? f1(now.v) : '—', '', `${now ? now.name.toLowerCase() : ''}${mx ? ' · max ' + f0(mx.v) + (pk ? ' vers ' + pk.t.slice(11, 16) : '') : ''}`, now && now.lv >= 2);
}

/* ---------- qualité de l'air et pollens (Copernicus CAMS via Open-Meteo) ---------- */
const AQRAW = {}, AQERR = {}, AQBUSY = new Set(), AQREQ = new Map();
const urlAQ = l => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${l.lat}&longitude=${l.lon}&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&hourly=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,${POLLENS.map(p => p.k).join(',')}&timezone=auto&forecast_days=2`;
async function fetchAQ(l) {
  if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;
  const previous = AQREQ.get(l.id), gen = gpsWeatherGen;
  if (AQBUSY.has(l.id) && (!l.gps || previous && gpsSourceCurrent(previous.origin, previous.gen))) return;
  const request = { origin: { ...l }, gen }; AQREQ.set(l.id, request); AQBUSY.add(l.id);
  try {
    const p = await fetchJSON(urlAQ(l), 12000, l.gps ? 'gps' : 'shared', 45 * 60e3); if (!p || !p.hourly) throw new Error('réponse invalide');
    if (gpsSourceCurrent(request.origin, gen)) { AQRAW[l.id] = { p, t: WEATHER_REQUESTS.fetchedAt(urlAQ(l)) || Date.now() }; delete AQERR[l.id]; }
  } catch (e) { if (gpsSourceCurrent(request.origin, gen)) AQERR[l.id] = { t: Date.now(), msg: e.message }; }
  finally {
    // Une ancienne requête ne libère pas le verrou de celle qui la remplace.
    if (AQREQ.get(l.id) === request) { AQREQ.delete(l.id); AQBUSY.delete(l.id); if (UI.loc === l.id) renderAir(); }
  }
}
const polCls = l => l == null || l === 0 ? 'lvx' : 'lv' + Math.min(3, l - 1);
function renderAir() {
  const el = $('#secAir'); if (!el) return; if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const m = CX.m, l = curLoc(), id = l.id, r = AQRAW[id], er = AQERR[id];
  if (!DEMO.on && (!r || Date.now() - r.t > 45 * 60e3) && !(er && Date.now() - er.t < 5 * 60e3)) fetchAQ(l);
  const a = DEMO.on ? airSummary(makeDemoAir(m.payload), m.nowStr) : r ? airSummary(r.p, m.nowStr) : null;
  const day = m.days.find(d => d.date === m.nowStr.slice(0, 10)) || {};
  const uN = uvInfo((m.hs[m.nowI] || {}).uv), pk = uvToday(m), uM = uvInfo(day.uv != null ? day.uv : pk ? pk.uv : null);
  const tile = (k, info, unit, note) => `<div class="airt ${info ? 'lv' + info.lv : 'lvx'}"><span class="k">${k}</span><span class="v num">${info ? (unit === 'uv' ? f1(info.v) : f0(info.v)) : '—'}</span><span class="n">${info ? esc(info.name) : 'indisponible'}${note ? ' · ' + note : ''}</span></div>`;
  let pol = '';
  if (a && a.anyPol) {
    const act = a.pol.filter(p => (p.lv || 0) > 0 || (p.pkLv || 0) > 0), rest = a.pol.filter(p => !act.includes(p));
    pol = act.length ? `<div class="probs">${act.map(p => `<div class="pb ${polCls(Math.max(p.lv || 0, p.pkLv || 0))}"><span class="k">${p.name}</span><span class="bar"><i style="width:${Math.max(4, Math.max(p.lv || 0, p.pkLv || 0) * 25)}%"></i></span><b class="num">${POL_NAME[Math.max(p.lv || 0, p.pkLv || 0)]}</b></div>`).join('')}
      <div class="sub">Niveau = pic des 24 prochaines heures. ${rest.length ? 'Nul : ' + rest.map(p => p.name.toLowerCase()).join(', ') + '.' : ''}</div></div>` : `<div class="sub">🌿 Pollens : niveau nul pour les 6 espèces suivies (${a.pol.map(p => p.name.toLowerCase()).join(', ')}).</div>`;
  } else if (a) pol = '<div class="sub">🌿 Pollens : aucune donnée pour ce lieu (hors saison ou hors Europe).</div>';
  const pollu = a ? [['PM2,5', a.pm25], ['PM10', a.pm10], ['O₃', a.o3], ['NO₂', a.no2]].filter(x => x[1] != null).map(x => `<span><b class="num">${f0(x[1])}</b> ${x[0]}</span>`).join('') : '';
  const msg = !a ? `<div class="sub">${AQBUSY.has(id) ? 'Chargement de la qualité de l’air…' : er ? 'Qualité de l’air indisponible (' + esc(er.msg) + ').' : 'Qualité de l’air en attente.'}</div>` : '';
  el.innerHTML = `<div class="mod-h"><h2>🌿 Air · UV · pollens</h2><span class="src obs">prévision</span></div>
    <div class="airg">${tile('UV maintenant', uN, 'uv', uN ? '' : '')}${tile('UV max auj.', uM, 'uv', pk && uM ? 'vers ' + pk.t.slice(11, 16) : '')}${tile('Qualité de l’air', a && a.aqi, 'aqi', a && a.aqiPk && a.aqiPk.v > (a.aqi ? a.aqi.v : 0) + 9 ? 'pic ' + a.aqiPk.v + (a.aqiPkAt ? ' vers ' + a.aqiPkAt : '') : '')}</div>
    ${uM && uM.lv >= 1 ? `<div class="note lv${uM.lv}"><b>☀️ UV</b><span>${esc(uM.tip)}.</span></div>` : ''}
    ${pollu ? `<div class="obs-row airp">${pollu}<span class="sub">µg/m³</span></div>` : ''}${msg}${pol}
    <div class="disc">UV : échelle OMS (Open-Meteo). Air et pollens : modèle européen Copernicus CAMS via Open-Meteo, maille d’environ 10 km. Indice européen : 0–20 bon, 20–40 correct, 40–60 moyen, 60–80 médiocre, au-delà très médiocre. Prévisions, pas des mesures de capteur.</div>`;
}

/* ---------- radar de pluie (RainViewer : 2 dernières heures, image toutes les 10 min) ---------- */
const RADAR = { map: null, baseL: null, baseKind: '', layers: [], frames: [], idx: 0, play: null, t: 0, marker: null, state: 'idle', at: null, io: null, err: '' };
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve();
  if (loadLeaflet.p) return loadLeaflet.p;
  loadLeaflet.p = new Promise((res, rej) => {
    // empreintes SRI (identiques à celles publiées sur leafletjs.com) : le navigateur refuse tout fichier modifié
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H'; css.crossOrigin = 'anonymous'; css.referrerPolicy = 'no-referrer'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; js.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'; js.crossOrigin = 'anonymous'; js.referrerPolicy = 'no-referrer';
    js.onload = () => res(); js.onerror = () => { loadLeaflet.p = null; rej(new Error('carte indisponible')); }; document.head.appendChild(js);
  });
  return loadLeaflet.p;
}
const isLight = () => { const t = document.documentElement.dataset.theme; return t === 'light' || (t !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches); };
// fond de carte sans clé : Esri gris (sombre ou clair) + noms de villes au-dessus du radar ; secours OpenStreetMap
function radarBase(map, kind) {
  (RADAR.baseL || []).forEach(x => map.removeLayer(x));
  const d = !isLight(), E = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + (d ? 'Dark' : 'Light') + '_Gray_';
  if (kind === 'esri') {
    const base = L.tileLayer(E + 'Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 10, attribution: 'Fond © Esri · © OpenStreetMap · Radar © RainViewer' });
    const lab = L.tileLayer(E + 'Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 10, pane: 'labels' });
    let ok = 0, bad = 0;
    base.on('tileload', () => { ok++; });
    base.on('tileerror', () => { bad++; if (!ok && bad >= 3) radarBase(map, 'osm'); });
    RADAR.baseL = [base.addTo(map), lab.addTo(map)];
  } else {
    RADAR.baseL = [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 10, className: d ? 'osm-dark' : '', attribution: '© OpenStreetMap · Radar © RainViewer' }).addTo(map)];
  }
  RADAR.baseKind = kind;
}
function radarMsg(t) { const e = $('#rmsg'); if (e) { e.textContent = t || ''; e.hidden = !t; } }
function renderRadar() {
  const el = $('#secRadar'); if (!el) return;
  if (!el.dataset.ready) {
    el.dataset.ready = 1;
    el.innerHTML = `<div class="mod-h"><h2>📡 Radar pluie</h2><span class="src obs">mesuré · radar</span></div>
      <div class="radar"><div id="rmap" class="rmap" role="img" aria-label="Carte radar des précipitations"></div><div class="rmsg" id="rmsg">La carte se charge quand tu arrives ici.</div>
        <button class="btn sm rctr" data-act="rcenter" aria-label="Recentrer sur le lieu" disabled>◎</button></div>
      <div class="rctl"><button class="btn sm" data-act="rplay" id="rplay" aria-label="Lecture" disabled>▶</button><input type="range" id="rslide" min="0" max="0" value="0" aria-label="Heure de l’image radar" disabled><span class="num" id="rtime">—</span></div>
      <div class="rleg"><span>faible</span><i></i><span>forte</span></div>
      <div class="disc">Pluie et neige réellement mesurées par les radars sur les 2 dernières heures (RainViewer, précision régionale). Pour les 2 prochaines heures, voir « Pluie au quart d’heure » dans la météo actuelle. Un doigt fait défiler la page, deux doigts déplacent et zooment la carte.</div>`;
    $('#rslide').addEventListener('input', e => { radarPlay(false); radarShow(+e.target.value); });
    if ('IntersectionObserver' in window) {
      RADAR.io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { RADAR.io.disconnect(); initRadar(); } }, { rootMargin: '200px' });
      RADAR.io.observe(el);
    } else initRadar();
  }
  el.hidden = !CX;
  if (RADAR.state === 'ready') { radarCenter(false); if (Date.now() - RADAR.t > 10 * 60e3) radarRefresh(); }
}
function radarControls() { const ready = !!RADAR.map && RADAR.layers.length > 0; document.querySelectorAll('#secRadar [data-act], #rslide').forEach(b => { b.disabled = !ready; }); }
async function initRadar() {
  if (RADAR.state === 'loading' || RADAR.state === 'ready') return;
  RADAR.wanted = true; RADAR.state = 'loading'; radarMsg('Chargement du radar…'); radarControls();
  try {
    await loadLeaflet();
    const l = curLoc(), mob = L.Browser.mobile;
    if (!locHasCoords(l)) { RADAR.state = 'idle'; radarMsg('Coordonnées du lieu à renseigner.'); return; }
    if (!RADAR.map) {
    const map = L.map('rmap', { zoomControl: false, minZoom: 5, maxZoom: 10, dragging: !mob, touchZoom: true, scrollWheelZoom: false, tap: false, attributionControl: true }).setView([l.lat, l.lon], 8);
    map.attributionControl.setPrefix(false);
    map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
    radarBase(map, 'esri');
    L.control.zoom({ position: 'topright' }).addTo(map);
    RADAR.marker = L.circleMarker([l.lat, l.lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#ff8c2b', fillOpacity: 1 }).addTo(map);
    RADAR.map = map; RADAR.at = l.id;
    }
    await radarFrames();
    RADAR.state = 'ready'; RADAR.err = null; radarControls();
  } catch (e) { RADAR.state = 'idle'; RADAR.err = e.message; radarControls(); radarMsg('Radar indisponible pour le moment. Réessaie avec « Actualiser ».'); }
}
async function radarFrames() {
  if (!RADAR.map) return;
  const js = await fetchJSON('https://api.rainviewer.com/public/weather-maps.json', 10000);
  const past = (js && js.radar && js.radar.past) || []; if (!past.length) throw new Error('aucune image');
  RADAR.layers.forEach(x => RADAR.map.removeLayer(x));
  RADAR.frames = past;
  RADAR.layers = past.map(f => L.tileLayer(`${js.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 10, zIndex: 5 }).addTo(RADAR.map));
  const sl = $('#rslide'); if (sl) sl.max = past.length - 1;
  RADAR.t = Date.now(); radarShow(past.length - 1); radarMsg(''); radarControls();
}
function radarShow(i) {
  if (!RADAR.layers.length) return;
  RADAR.idx = (i + RADAR.layers.length) % RADAR.layers.length;
  RADAR.layers.forEach((x, k) => x.setOpacity(k === RADAR.idx ? 0.8 : 0));
  const f = RADAR.frames[RADAR.idx], d = new Date(f.time * 1000), ago = Math.round((Date.now() - d) / 60000);
  const sl = $('#rslide'); if (sl) sl.value = RADAR.idx;
  const tt = $('#rtime'); if (tt) tt.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())} · ${RADAR.idx === RADAR.layers.length - 1 ? 'dernière image' : 'il y a ' + ago + ' min'}`;
}
function radarPlay(on) {
  if (RADAR.play) { clearTimeout(RADAR.play); RADAR.play = null; }
  const b = $('#rplay'); if (b) { b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', on ? 'Pause' : 'Lecture'); }
  if (!on || !RADAR.layers.length) return;
  if (RADAR.idx === RADAR.layers.length - 1) radarShow(0);
  const step = () => { if (document.hidden) { radarPlay(false); return; } radarShow(RADAR.idx + 1); RADAR.play = setTimeout(step, RADAR.idx === RADAR.layers.length - 1 ? 1600 : 550); };
  RADAR.play = setTimeout(step, 550);
}
function radarCenter(force) {
  if (!RADAR.map) return; const l = curLoc();
  if (!locHasCoords(l)) return;
  if (!force && RADAR.at === l.id) return;
  RADAR.at = l.id; RADAR.marker.setLatLng([l.lat, l.lon]); RADAR.map.setView([l.lat, l.lon], force ? Math.max(8, RADAR.map.getZoom()) : 8, { animate: true });
}
function radarRefresh() {
  if (offlineNow()) return;
  if (RADAR.wanted && RADAR.state === 'idle') { initRadar(); return; }
  if (RADAR.state === 'ready' && Date.now() - RADAR.t > 9 * 60e3 && !radarRefresh.busy) {
    radarRefresh.busy = true; radarFrames().catch(() => radarMsg('Radar non actualisé. Réessaie avec « Actualiser ».')).finally(() => { radarRefresh.busy = false; });
  }
}


/* ---------- sauvegarde chiffrée (export / import entre téléphones) ---------- */
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
async function bkKey(pass, salt, it, use) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [use]);
}
const bkMsg = t => { const e = $('#bkMsg'); if (e) e.textContent = t; };
function bkPass() { const v = (($('#bkPw') || {}).value || '').trim(); return v || lsGet('twrc.key') || ''; }
async function backupExport() {
  const pass = bkPass();
  if (pass.length < 8) { bkMsg('Entre un code d’au moins 8 caractères : il sera demandé à l’import.'); return; }
  if (!crypto || !crypto.subtle) { bkMsg('Chiffrement indisponible sur ce navigateur.'); return; }
  bkMsg('Chiffrement…');
  try {
    const data = Backup.make({ settings: S, view: UI.view, context: USER_STORE.state, tyreTherm: ttLoad(), tripCancel: TRIPCANCEL, at: new Date().toISOString() });
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), it = 600000;
    const key = await bkKey(pass, salt, it, 'encrypt');
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
    const txt = JSON.stringify({ app: 'twrc-backup', v: Backup.VERSION, kdf: 'PBKDF2-SHA256', it, s: b64e(salt), i: b64e(iv), c: b64e(ct) });
    const day = new Date().toISOString().slice(0, 10), name = `race-control-sauvegarde-${day}.json`;
    const file = new File([txt], name, { type: 'application/json' });
    let done = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Sauvegarde Race Control' }); done = true; }
      catch (e) { if (e && e.name === 'AbortError') { bkMsg('Export annulé.'); return; } }
    }
    if (!done) { const u = URL.createObjectURL(file), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
    lsSet('twrc.lastbackup', day);
    bkMsg(`✅ Sauvegarde V2 prête (${Math.max(1, Math.round(txt.length / 1024))} Ko) · contexte durable inclus.`);
    const p = $('#bkSec .sub b'); if (p) p.textContent = fmtDay(day);
  } catch (e) { bkMsg('Échec de la sauvegarde : ' + (e.message || e)); }
}
async function backupApplyPlan(plan) {
  const VS = window.TWRC_VAULT;
  if (!VS || VS.mode !== 'vault') { DeviceStorage.apply(localStorage, plan); return; }
  // Coffre de session : l'import n'est réussi qu'une fois le coffre chiffré réécrit ET relu ; sinon retour exact à l'état précédent.
  const names = [...new Set([...Object.keys(plan.writes), ...plan.remove])], before = Object.fromEntries(names.map(k => [k, localStorage.getItem(k)]));
  DeviceStorage.apply(localStorage, plan);
  await VS.flush();
  if (VS.error) {
    names.forEach(k => { if (before[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, before[k]); });
    await VS.flush();
    throw new Error(VS.error);
  }
}
async function backupImport(f) {
  bkMsg('Lecture du fichier…');
  let o; try { o = JSON.parse(await f.text()); } catch (e) { bkMsg('Fichier illisible.'); return; }
  if (!o || o.app !== 'twrc-backup' || !o.c) { bkMsg('Ce fichier n’est pas une sauvegarde Race Control.'); return; }
  const pass = bkPass(); if (!pass) { bkMsg('Entre le code utilisé pour la sauvegarde, puis réessaie.'); return; }
  bkMsg('Déchiffrement…');
  let data;
  try {
    const key = await bkKey(pass, b64(o.s), o.it || 600000, 'decrypt');
    data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(o.i) }, key, b64(o.c))));
  } catch (e) { bkMsg('Code incorrect : entre le code utilisé lors de la sauvegarde.'); return; }
  // le journal des trajets de ce téléphone (ressenti conducteur) est fusionné, jamais effacé par l'import
  const plan = Backup.restorePlan(data, Date.now(), { context: USER_STORE.state, tyreTherm: ttLoad(), tripCancel: TRIPCANCEL });
  if (!plan) { bkMsg('Sauvegarde incomplète.'); return; }
  const when = new Date(data.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const version = data.v >= 2 ? 'V2' : 'V1';
  const kept = plan.kept ? `\n\nJournal des trajets conservé : ${plan.kept} trajet${plan.kept > 1 ? 's' : ''} de ce téléphone ${data.v >= 2 ? 'ajouté' : 'gardé'}${plan.kept > 1 ? 's' : ''}.` : '';
  if (!confirm(`Remplacer les réglages de ce téléphone par la sauvegarde ${version} du ${when} ?${kept}`)) { bkMsg('Import annulé.'); return; }
  if (window.TWRC_PRESET_V) plan.writes['twrc.presetv'] = String(window.TWRC_PRESET_V);
  plan.writes['twrc.lastbackup'] = String(data.at).slice(0, 10);
  try { await backupApplyPlan(plan); }
  catch (e) { bkMsg(e.recoveryPending ? 'Import interrompu : la copie de récupération est conservée. Libère de l’espace puis rouvre l’app.' : 'Import non appliqué : stockage local indisponible. Tes réglages et ton journal précédents sont conservés.'); return; }
  // Les anciens moteurs encore en mémoire ne doivent pas réécrire l'état importé avant le rechargement.
  DeviceStorage.freeze(true);
  bkMsg(`✅ Sauvegarde ${version} restaurée. Redémarrage…`);
  reloadSafe(600);
}


/* ---------- astuces : faits vérifiés, renouvelés toutes les 10 minutes, choisis selon la météo du moment ---------- */
// k = catégorie · w = condition (facultative) qui rend l'astuce prioritaire · src = source
const TIPS = [
  { k: 'law', t: 'Sous la pluie, les limites baissent : 110 km/h au lieu de 130 sur autoroute, 100 au lieu de 110 sur voie express, 80 au lieu de 90 là où le 90 s’applique.', src: 'Code de la route, art. R413-2', w: c => c.rain },
  { k: 'law', t: 'Visibilité de 50 m ou moins (brouillard, pluie, neige) : vitesse limitée à 50 km/h sur toutes les routes, autoroute comprise.', src: 'Code de la route, art. R413-2', w: c => c.fog },
  { k: 'law', t: 'Les feux de brouillard arrière ne s’allument que par brouillard ou chute de neige. Sous la pluie, ils éblouissent : 135 € d’amende.', src: 'Code de la route, art. R416-7', w: c => c.fog || c.rain },
  { k: 'law', t: 'Distance de sécurité : au moins 2 secondes avec le véhicule devant. Sur autoroute, cela fait 2 traits de la bande d’arrêt d’urgence.', src: 'Code de la route, art. R412-12 · Bison Futé' },
  { k: 'drive', t: 'Sur route mouillée, augmente nettement l’écart (3 à 4 secondes au lieu de 2) : la distance de freinage s’allonge sur chaussée humide.', src: 'Sécurité routière', w: c => c.rain },
  { k: 'law', t: 'Profondeur minimale légale des sculptures : 1,6 mm sur toute la bande de roulement. Les témoins d’usure (repère TWI sur le flanc) sont justement à 1,6 mm.', src: 'Code de la route, art. R314-1' },
  { k: 'law', t: 'Pneus usés sous 1,6 mm : 135 € d’amende, et l’assureur peut réduire l’indemnisation en cas d’accident.', src: 'Code de la route, art. R314-1' },
  { k: 'tyre', t: 'Lis le code DOT de ton pneu : les 4 derniers chiffres donnent la semaine et l’année de fabrication. « 2124 » = 21ᵉ semaine de 2024.', src: 'Marquage DOT, norme fabricants' },
  { k: 'tyre', t: 'La pression baisse d’environ 0,1 bar à chaque baisse de 10 °C. Un pneu réglé en été est souvent sous-gonflé au premier froid.', src: 'Pneus-online · règle physique des gaz', w: c => c.cold },
  { k: 'tyre', t: 'Contrôle la pression à froid : avant de rouler, ou après au moins 2 h d’arrêt. À chaud, la mesure est faussée vers le haut.', src: 'Recommandation des manufacturiers' },
  { k: 'tyre', t: 'La pression recommandée est sur l’étiquette du montant de porte conducteur, dans la trappe à carburant ou dans le carnet. Jamais celle gravée sur le flanc : c’est un maximum.', src: 'Recommandation des manufacturiers' },
  { k: 'tyre', t: 'Voiture chargée (vacances, coffre plein) : applique la pression « charge » de l’étiquette, souvent 0,2 à 0,3 bar de plus.', src: 'Étiquette constructeur' },
  { k: 'tyre', t: 'Sous environ 7 °C, la gomme d’un pneu été durcit et accroche moins. Ce seuil est une règle pratique : la perte d’adhérence est progressive.', src: 'Règle pratique des manufacturiers', w: c => c.cold && c.summer },
  { k: 'tyre', t: 'Le symbole 3PMSF (montagne à 3 pics et flocon) prouve des tests sur neige. Le marquage M+S seul ne suffit plus pour la Loi Montagne.', src: 'Loi Montagne · décret 2020-1264', w: c => c.winter },
  { k: 'law', t: 'Loi Montagne : du 1er novembre au 31 mars, dans les communes concernées de 34 départements, 4 pneus 3PMSF ou des chaînes / chaussettes dans le coffre sont obligatoires. Sinon 135 €.', src: 'Décret 2020-1264', w: c => c.winter },
  { k: 'drive', t: 'Les chaînes et les chaussettes se montent sur les roues motrices. Sur une traction (la grande majorité des citadines et compactes), c’est l’avant.', src: 'Notices des équipementiers' },
  { k: 'tyre', t: 'Un pneu vieillit même s’il roule peu : fais-le contrôler à partir de 5 ans. Les manufacturiers conseillent de ne pas dépasser 10 ans.', src: 'Recommandation Michelin, Goodyear, Continental' },
  { k: 'tyre', t: 'Stocke les pneus hors saison au frais, au sec et à l’abri de la lumière. Sur jantes : empilés à plat. Sans jantes : debout, tournés de temps en temps.', src: 'Recommandation des manufacturiers' },
  { k: 'tyre', t: 'Quand tu n’as que 2 pneus neufs, ils se montent à l’arrière : c’est l’essieu arrière qui évite le tête-à-queue sur sol glissant.', src: 'Recommandation Michelin et des manufacturiers' },
  { k: 'tyre', t: 'L’aquaplaning arrive quand le pneu ne chasse plus l’eau assez vite. Le risque monte avec la vitesse, l’usure et l’épaisseur d’eau : lève le pied dès les flaques.', src: 'Sécurité routière', w: c => c.rain },
  { k: 'meteo', t: 'Le verglas peut se former sans pluie : une chaussée humide qui passe sous 0 °C gèle. Le matin après une nuit claire, c’est le piège classique.', src: 'Météo-France', w: c => c.freeze },
  { k: 'meteo', t: 'La pluie verglaçante tombe liquide sous 0 °C et gèle au contact du sol. Elle crée une glace transparente, presque invisible.', src: 'Météo-France', w: c => c.freeze },
  { k: 'meteo', t: 'Ponts et viaducs gèlent souvent avant le reste de la route : ils sont refroidis par-dessus et par-dessous. Même chose pour les zones à l’ombre.', src: 'Bison Futé · Météo-France', w: c => c.freeze },
  { k: 'meteo', t: 'Nuit claire et vent faible : la route perd sa chaleur vers le ciel et peut être plus froide que l’air de quelques degrés. Un 2 °C annoncé peut cacher une route à 0 °C.', src: 'Physique du rayonnement nocturne', w: c => c.freeze || c.cold },
  { k: 'meteo', t: 'Quand la température et le point de rosée sont à moins de 2 °C d’écart, sans vent, le brouillard guette. L’appli affiche cet écart dans la météo actuelle.', src: 'Météo-France', w: c => c.fog },
  { k: 'meteo', t: 'Vigilance orange neige-verglas : limite tes déplacements et équipe la voiture. Vigilance rouge : reste chez toi sauf urgence.', src: 'Météo-France, vigilance', w: c => c.freeze },
  { k: 'drive', t: 'Sur verglas avec ABS : freine fort et maintiens la pédale. Le grondement dans la pédale est normal, c’est l’ABS qui travaille.', src: 'Sécurité routière', w: c => c.freeze },
  { k: 'drive', t: 'Sur neige, démarre en 2ᵉ et accélère tout en douceur : moins de couple aux roues, moins de patinage.', src: 'Sécurité routière · auto-écoles', w: c => c.snow },
  { k: 'drive', t: 'Par vent fort, tiens bien le volant en sortie de tunnel, de forêt ou au dépassement d’un camion : la rafale arrive d’un coup.', src: 'Sécurité routière', w: c => c.wind },
  { k: 'car', t: 'Une batterie perd une bonne partie de sa capacité par grand froid. Si la voiture démarre mal à l’automne, fais-la tester avant l’hiver.', src: 'Constructeurs et équipementiers', w: c => c.cold },
  { k: 'car', t: 'Passe au lave-glace antigel avant les premières gelées : un lave-glace été gèle dans les gicleurs et sur le pare-brise.', src: 'Constructeurs', w: c => c.cold },
  { k: 'car', t: 'Ne verse jamais d’eau chaude sur un pare-brise givré : le choc thermique peut le fissurer. Grattoir, ou dégivrage par la ventilation.', src: 'Assureurs et vitrage auto' },
  { k: 'car', t: 'Avant de partir, dégivre toutes les vitres, rétroviseurs et feux, pas seulement un hublot devant toi : rouler sans visibilité est verbalisable.', src: 'Sécurité routière', w: c => c.freeze },
  { k: 'car', t: 'Sans contrôle de pression automatique (TPMS), vérifie au moins une fois par mois et avant chaque long trajet.', src: 'Sécurité routière' },
  { k: 'meteo', t: 'Indice UV de 3 ou plus : protection conseillée (lunettes, crème), même par temps frais. En voiture, le pare-brise feuilleté filtre l’essentiel des UV, mais les vitres latérales laissent passer une partie des UVA.', src: 'OMS · indice UV', w: c => c.uv },
  { k: 'meteo', t: 'Soleil rasant le matin ou le soir : garde un pare-brise propre dedans et dehors. Le voile gras intérieur multiplie l’éblouissement.', src: 'Sécurité routière' },
  { k: 'meteo', t: 'AROME, le modèle de Météo-France utilisé par l’appli, calcule la météo sur une grille d’environ 1,3 km : il voit les orages et brouillards locaux que les modèles mondiaux ratent.', src: 'Météo-France' },
  { k: 'meteo', t: 'Une probabilité de pluie de 30 % ne veut pas dire « pluie 30 % du temps » : c’est la chance qu’il pleuve au moins un peu sur ce lieu et à cette heure.', src: 'Météo-France' },
  { k: 'tyre', t: 'Un pneu sous-gonflé chauffe plus, s’use plus vite sur les épaules et augmente la consommation. Il allonge aussi le freinage sur le mouillé.', src: 'Recommandation des manufacturiers' },
  { k: 'tyre', t: 'Permuter les pneus avant et arrière égalise l’usure, surtout sur une traction où l’avant s’use plus vite. Respecte le sens de roulement si le pneu en a un.', src: 'Recommandation des manufacturiers' }
];
const TIP_CAT = { live: ['⚡', 'En direct'], law: ['⚖️', 'Code de la route'], tyre: ['🛞', 'Pneus'], meteo: ['🌦️', 'Météo'], drive: ['🚗', 'Conduite'], car: ['🔧', 'Voiture'] };
let TIP_OFF = 0;
function tipCtx() {
  const c = {}; if (!CX) return c;
  const { m, sum24 } = CX, x = m.hs[m.nowI] || {}, mo = +m.nowStr.slice(5, 7);
  c.rain = (sum24.Pmax || 0) >= 0.3 || (x.P || 0) > 0;
  c.fog = sum24.visMin != null && sum24.visMin < 1000;
  c.freeze = (sum24.TrMin != null && sum24.TrMin <= 1) || (sum24.Tmin != null && sum24.Tmin <= 1) || (sum24.iceLevel || 0) >= 1;
  c.cold = sum24.Tmin != null && sum24.Tmin < 7;
  c.snow = (sum24.snowSum || 0) > 0 || !!sum24.snowCode;
  c.wind = (sum24.gustMax || 0) >= 60;
  c.uv = (x.uv || 0) >= 3 || m.hs.some(h => h.date === m.nowStr.slice(0, 10) && (h.uv || 0) >= 3);
  c.winter = mo >= 10 || mo <= 3;
  c.summer = TCARS().some(car => effType(car) === 'summer');
  return c;
}

// astuces en direct : calculées à partir des vraies données du moment (lieu affiché, voitures, station)
function liveTips() {
  if (!CX) return [];
  const { m, sum24 } = CX, n = m.nowI, hs = m.hs, out = [], l = curLoc(), ln = l ? l.name.split(' /')[0] : 'ici';
  const nx = hs.slice(n, n + 24).filter(Boolean), at = x => x.t.slice(11, 16);
  const add = (t, src, lv) => out.push({ k: 'live', t, src: 'Données en direct · ' + src, lv: lv || 0 });
  const today = m.nowStr.slice(0, 10), day = m.days.find(d => d.date === today) || {};
  // pluie imminente (prévision au quart d'heure)
  if (m.nc && m.nc.startIn != null && m.nc.startIn <= 90) add(`${m.nc.snow ? 'Neige' : 'Pluie'} attendue dans ${m.nc.startIn} min à ${ln}. Pense aux feux de croisement et allonge les distances dès les premières gouttes : la route est la plus glissante au début de la pluie.`, 'prévision au quart d’heure', 1);
  else if (m.nc && m.nc.nowWet) add(`${m.nc.snow ? 'Il neige' : 'Il pleut'} en ce moment à ${ln}${m.nc.stopAt ? ', fin probable vers ' + m.nc.stopAt : ''}. Vitesses abaissées sur autoroute (110) et voie express (100).`, 'prévision au quart d’heure', 1);
  // mesure réelle de la station
  if (m.obs && m.obs.T != null) {
    const ago = Math.round((Date.now() - Date.parse(m.obs.t)) / 60000);
    add(`Mesuré il y a ${ago} min à la station ${m.obs.name} : ${f1(m.obs.T)} °C${m.obs.vis != null && m.obs.vis < 5000 ? ', visibilité ' + m.obs.vis + ' m' : ''}${m.obs.wx ? ' (' + wxFr(m.obs.wx) + ')' : ''}. Les prévisions de l’appli sont recalées sur cette mesure.`, 'station ' + m.obs.id);
  }
  // chaussée sous 0 °C
  const ice = nx.find(x => x.Tr != null && x.Tr <= 0);
  if (ice) add(`Chaussée estimée à ${f1(ice.Tr)} °C vers ${at(ice)} à ${ln}. Prévois 5 minutes de dégivrage et méfie-toi des ponts et des zones d’ombre.`, 'chaussée estimée (± 2 °C)', 2);
  // brouillard
  const fog = nx.find(x => x.vis != null && x.vis < 1000);
  if (fog) add(`Visibilité prévue à ${f0(fog.vis)} m vers ${at(fog)}. Feux de brouillard arrière seulement si elle tombe vraiment bas, jamais sous la simple pluie.`, 'prévision de visibilité', fog.vis < 200 ? 3 : 2);
  else { const x = hs[n]; if (x && x.T != null && x.Td != null && x.T - x.Td < 2 && (x.wind == null || x.wind < 10)) add(`Écart température / point de rosée de seulement ${f1(x.T - x.Td)} °C et peu de vent : brume ou brouillard possibles dans les prochaines heures.`, 'analyse air et rosée', 1); }
  // rafales
  const g = nx.reduce((a, x) => x.gust != null && x.gust >= 60 && (!a || x.gust > a.gust) ? x : a, null);
  if (g) add(`Rafales jusqu’à ${f0(g.gust)} km/h vers ${at(g)}. Tiens fermement le volant en sortie de forêt, sur les ponts et en doublant un camion.`, 'prévision de vent', g.gust >= 80 ? 2 : 1);
  // chute de température
  const T0 = hs[n] && hs[n].T, tmin = nx.reduce((a, x) => x.T != null && (!a || x.T < a.T) ? x : a, null);
  if (T0 != null && tmin && T0 - tmin.T >= 5 && tmin.T <= 7) add(`La température va chuter de ${f0(T0 - tmin.T)} °C d’ici ${at(tmin)} (${f1(tmin.T)} °C). ${tmin.T <= 3 ? 'Si tu pars à ce moment-là, prévois de quoi dégivrer.' : 'Les pneus été passent sous leur zone de confort et la pression baisse avec le froid.'}`, 'prévision horaire');
  // UV
  const pk = uvToday(m); if (pk && pk.uv >= 3 && pk.t >= m.nowStr.slice(0, 13)) add(`Indice UV maximal de ${f0(pk.uv)} vers ${at(pk)} aujourd’hui. Lunettes de soleil dans la voiture, surtout avec le soleil bas.`, 'indice UV (OMS)');
  // départ et retour de nuit
  const cdToday = appWorkOn(today);   // les astuces du trajet domicile-travail ne valent que les jours de trajet
  if (cdToday && day.sunrise && S.work.dep && day.sunrise.slice(11, 16) > S.work.dep) add(`Lever du soleil à ${day.sunrise.slice(11, 16)}, après ton départ de ${S.work.dep} : trajet de nuit. Vérifie que tes feux et ton pare-brise sont propres.`, 'éphéméride');
  if (cdToday && day.sunset && S.work.ret) { const s0 = day.sunset.slice(11, 16), r = toMin(S.work.ret) - toMin(s0); if (r >= -45 && r <= 30) add(`Coucher du soleil à ${s0}, autour de ton retour de ${S.work.ret} : soleil rasant puis pénombre. Lunettes de soleil et feux allumés tôt.`, 'éphéméride'); }
  // voitures : pression, pneus été au froid, âge, montage hiver
  TCARS().forEach(car => {
    const t = car.tire, pc = t.pchk, tgt = pressTarget(t.press);
    if (pc && pc.T != null && tmin && pc.T - tmin.T >= 8) add(`${car.short} : pression contrôlée à ${f0(pc.T)} °C. À ${f1(tmin.T)} °C vers ${at(tmin)}, elle aura perdu environ ${f1(pressLoss(tgt, pc.T, tmin.T))} bar. Recontrôle à froid.`, 'ton contrôle du ' + fmtDay(pc.date), 1);
    if (effType(car) === 'summer') { const dh = (S.work.dep || '06:30').slice(0, 5), co = appCommuteOff(today, dh, m.nowStr.slice(11, 16));
      const dd = co == null ? null : addMin(today + 'T00:00', co * 1440).slice(0, 10), dep = dd ? m.byTime.get(dd + 'T' + dh.slice(0, 2) + ':00') : null, x = dep != null ? hs[dep] : null;
      if (x && x.T != null && x.T < 7) add(`${co === 0 ? 'Ce matin' : co === 1 ? 'Demain' : cap1(fmtDay(dd))} à ${dh} : ${f1(x.T)} °C, sous le seuil de 7 °C des pneus été de la ${car.short}. Freinages plus longs, surtout sur le mouillé.`, 'prévision horaire', 1); }
    const age = dotAge(t.dot, m.nowStr); if (age != null && age >= 5) add(`${car.short} : pneus de ${f1(age)} ans (DOT ${t.dot}). À partir de 5 ans, fais-les inspecter chaque année.`, 'code DOT', age >= 8 ? 2 : 1);
    if (car.plan && car.plan.on && effType(car) !== 'winter') { const pd = car.plan.appointmentConfirmed && car.plan.appointmentDate ? car.plan.appointmentDate : car.plan.date; if (pd) { const j = dayDiff(today, pd); if (j >= 0 && j <= 21) add(`${car.short} : ${car.plan.appointmentConfirmed && car.plan.appointmentDate ? 'rendez-vous de montage' : 'montage estimé'} dans ${j} jour${j > 1 ? 's' : ''} (${fmtDay(pd)}). ${car.plan.appointmentConfirmed && car.plan.appointmentDate ? 'Vérifie l’état des pneus stockés.' : 'Pense à confirmer le rendez-vous et à vérifier l’état des pneus stockés.'}`, 'ton planning', 1); } }
  });
  // air et pollens
  const aq = AQRAW[UI.loc], a = !DEMO.on && aq ? airSummary(aq.p, m.nowStr) : null;
  if (a && a.aqi && a.aqi.v >= 60) add(`Qualité de l’air ${a.aqi.name.toLowerCase()} (indice ${a.aqi.v}) : dans les bouchons, passe la ventilation en recyclage.`, 'Copernicus CAMS', 1);
  if (a && a.polMax >= 3) { const p = a.pol.filter(x => Math.max(x.lv || 0, x.pkLv || 0) >= 3).map(x => x.name.toLowerCase()).join(', '); add(`Pollens élevés (${p}) : vitres fermées en roulant, et un filtre d’habitacle propre fait vraiment la différence.`, 'Copernicus CAMS', 1); }
  return out.sort((x, y) => y.lv - x.lv);
}
function tipList() {
  const c = tipCtx(), hot = TIPS.filter(t => t.w && t.w(c)), rest = TIPS.filter(t => !hot.includes(t));
  // astuces liées à la météo du moment en priorité : elles reviennent 2 fois plus souvent
  const base = hot.length ? [...hot, ...rest.filter((_, i) => i % 2 === 0), ...hot, ...rest.filter((_, i) => i % 2 === 1)] : rest;
  // astuces en direct : une sur deux (les plus urgentes d'abord)
  const lv = liveTips(); if (!lv.length) return base;
  const out = []; base.forEach((t, i) => { out.push(lv[i % lv.length]); out.push(t); }); return out;
}
const tipSlot = () => Math.floor(Date.now() / 600e3);
function renderTip() {
  const el = $('#secTip'); if (!el) return;
  const list = tipList(); if (!list.length) { el.hidden = true; return; } el.hidden = false;
  const i = ((tipSlot() + TIP_OFF) % list.length + list.length) % list.length, tp = list[i], cat = TIP_CAT[tp.k] || ['💡', 'Astuce'];
  const ctx = tp.k !== 'live' && tp.w && tp.w(tipCtx());
  const next = new Date((tipSlot() + 1) * 600e3);
  el.innerHTML = `<div class="tip${tp.k === 'live' ? ' live lv' + Math.min(3, tp.lv || 0) : ''}"><div class="tip-h"><span class="tip-c">${cat[0]} ${esc(cat[1])}${ctx ? ' · <b>en lien avec la météo ou la saison</b>' : ''}</span>
      <span class="tip-n"><button class="btn sm" data-act="tip" data-d="-1" aria-label="Astuce précédente">‹</button><button class="btn sm" data-act="tip" data-d="1" aria-label="Astuce suivante">›</button></span></div>
    <p class="tip-t">${tp.k === 'live' ? '⚡' : '💡'} ${esc(tp.t)}</p><div class="tip-s">Source : ${esc(tp.src)} · nouvelle astuce à ${pad(next.getHours())}:${pad(next.getMinutes())}</div></div>`;
  renderTip.slot = tipSlot();
}
setInterval(() => { if (!document.hidden && renderTip.slot !== tipSlot()) renderTip(); }, 20e3);


/* ---------- V2 : briefing du matin (verdict → paramètres critiques → détail) ---------- */
// plage d'incertitude de la chaussée estimée (± 2 °C) : affichage seulement, le moteur n'est pas modifié
function frostBand(Tr) {
  if (Tr == null) return null;
  const lo = Tr - 2, hi = Tr + 2, rng = `plage plausible ${f1(lo)} → ${f1(hi)} °C`;
  if (hi < 0) return { lv: 3, t: 'SURFACE SOUS 0 °C — QUASI CERTAIN', d: `Chaussée estimée ${f1(Tr)} °C ± 2 · ${rng}. Toute humidité présente au sol peut geler (risque de glace : voir Verglas).` };
  if (lo < 0) return { lv: 2, t: 'INCERTITUDE GEL', d: `Chaussée estimée ${f1(Tr)} °C ± 2 · ${rng}. Le gel est possible : ponts, ombres et creux d’abord.` };
  if (lo < 2) return { lv: 1, t: 'MARGE DE GEL FAIBLE', d: `Chaussée estimée ${f1(Tr)} °C ± 2 · ${rng}. Ponts et zones ombragées peuvent être plus froids.` };
  return null;
}
function nextTrip() {
  const m = M[S.work.from] || M[S.locs[0].id];
  const clock = DEMO.on && m ? m.nowStr : nowIn(m && m.tz || 'Europe/Paris');
  const now = toMin(clock.slice(11, 16)), ret = toMin(S.work.ret);
  const place = placeNow(), atWork = place.place && place.place.id === S.work.to, atHome = place.place && place.place.id === S.work.from;
  const workingDay = appWorkOn(clock);
  const dir = appCommuteDirection(clock);
  const td = appWorkTripData(dir, workingDay && (atWork || atHome && now < ret) ? 0 : 'auto');
  const completed = td && LIVE.done['commute|' + td.dep + '|' + td.dir];
  if (td && !td.err && !completed) return td;
  if (completed || td && td.cancelled) {
    for (let off = 1; off <= 8; off++) {
      const date = addMin(clock.slice(0, 10) + 'T00:00', off * 1440).slice(0, 10);
      if (!appWorkOn(date)) continue;
      const next = appWorkTripData('go', off); if (next && !next.err && !LIVE.done['commute|' + next.dep + '|go']) return next;
    }
  }
  return null;
}
// prochaine heure à risque sur 72 h (lieu de départ du matin)
function nextRisk(afterTs) {
  const m = M[S.work.from] || M[S.locs[0].id]; if (!m) return null;
  for (let i = Math.max(m.nowI, 0); i < Math.min(m.hs.length, m.nowI + 72); i++) {
    const x = m.hs[i]; if (afterTs && x.t <= afterTs) continue;
    const fb = frostBand(x.Tr), v = TCARS().map(c => hourVerdict(c, m.hs, i)).filter(Boolean).reduce((a, b) => Math.max(a, b.level), 0);
    let why = null, lv = 0;
    if (fb && fb.lv >= 2) { why = `chaussée ${f1(x.Tr)} °C (${fb.t.toLowerCase()})`; lv = fb.lv; }
    else if (x.vis != null && x.vis < 1000) { why = `brouillard ${f0(x.vis)} m`; lv = x.vis < 200 ? 3 : 2; }
    else if ((x.P || 0) >= 2) { why = `forte pluie ${f1(x.P)} mm/h`; lv = 2; }
    else if ((x.gust || 0) >= 70) { why = `rafales ${f0(x.gust)} km/h`; lv = 2; }
    else if (v >= 2) { const c = TCARS().find(cc => { const h = hourVerdict(cc, m.hs, i); return h && h.level === v; }), a = c ? tireAssess(c, m.hs, i) : null, pt = a && a.parts.slice().sort((p, q) => q.v - p.v)[0];
      why = `${c ? c.short + ' ' : ''}${LV[v].name}${pt ? ' (' + pt.label + ')' : ''}`; lv = v; }
    else if (fb) { why = `chaussée ${f1(x.Tr)} °C (marge de gel faible)`; lv = 1; }
    if (why) { const d = new Date(x.t.slice(0, 10) + 'T12:00:00Z'); return { lv, t: x.t, day: dayDiff(m.nowStr.slice(0, 10), x.date) === 0 ? 'auj.' : DAYN[d.getUTCDay()], why }; }
  }
  return null;
}
function gaugeSvg(score, lv) {
  const r = 46, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, score || 0)) / 100;
  return `<svg class="gauge lv${lv}" viewBox="0 0 120 120" role="img" aria-label="${score == null ? 'Aperçu : aucun score calculé' : 'Score ' + score + ' sur 100'}">
    <circle cx="60" cy="60" r="${r}" class="g-bg"/><circle cx="60" cy="60" r="${r}" class="g-fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" class="g-n">${score == null ? '—' : score}</text><text x="60" y="78" class="g-l">${score == null ? 'aperçu' : '/ 100'}</text></svg>`;
}
/* ===================== TRAJET VIVANT : origine GPS réelle (navigateur uniquement, mémoire uniquement) ===================== */
// Un seul trajet vivant à la fois : le trajet commencé, sinon le prochain trajet qui part dans 90 min ou moins.
// Automate : advice (aperçu) → imminent (avant l'heure) → late (heure passée, aucun mouvement constaté) → active (mouvement confirmé) → arrivé / expiré.
// Départ adaptatif : pour un ALLER, l'arrivée prévue (b.arr, marge du rendez-vous déjà incluse par le relais) est la contrainte :
//   départ conseillé = b.arr − durée OSRM × 1,1 depuis la position réelle. Pour un RETOUR, le départ prévu reste la contrainte.
// Aperçu (advice) : prochain aller seulement, jusqu'à 4 h avant le départ prévu, GPS frais et à plus de 1 km de l'origine prévue ;
//   relevés basse consommation uniquement, recalcul après 5 km ou 30 min. Suivi vivant dès min(départ prévu, départ conseillé) − 90 min.
// Les notifications du relais restent calculées depuis le trajet planifié : la position n'est jamais envoyée à GitHub.
// Route, météo de route et références du moteur restent en mémoire : aucun tracé n'est stocké dans localStorage ou twrc.croute.
// Le contexte canonique conserve le point courant et les faits minimaux de départ/arrivée ; rien n'est publié dans obs.json,
// l'agenda ou le relais. Aucun nouveau fournisseur externe : en mode trajet vivant,
// la position courante arrondie à 0,001° est en plus transmise à OSRM pour calculer le trajet restant.
const ROUTE_MARGIN_MAX = 15;
const routeTravelMin = (raw, reserved = 0) => {
  const base = Math.max(1, Number(raw) || 1), cap = Math.max(0, ROUTE_MARGIN_MAX - Math.max(0, reserved));
  return Math.max(1, Math.round(base + Math.min(base * 0.1, cap)));
};
const LIVE_WIN = 90, LIVE_ADV = 240, LIVE_ADV_KM = 5, LIVE_ADV_AGE = 30 * 60e3, LIVE_ACC = 250, LIVE_ACC_ARR = 150, LIVE_ARR_KM = 0.3, LIVE_AGE_IMM = 5 * 60e3, LIVE_AGE_RUN = 2 * 60e3, LIVE_GRACE = 5 * 60e3;
const LIVE = { key: null, phase: 'idle', base: null, startFix: null, lastFix: null, carN: 0, near: null, arrN: 0, arrTs: 0, gen: 0, route: null, routeAt: 0, routeOrigin: null, routeTry: 0, routeErr: false,
  last: null, lastOk: 0, hiAt: 0, loAt: 0, nowAt: 0, done: {}, noAuto: {}, lastDone: null };
APP_CONTEXT.live = LIVE;
Object.defineProperty(LIVE, 'lastDone', { get: () => USER_STORE.state.lastArrival, set: v => { USER_STORE.state.lastArrival = v; } });
const DONE_VIEW = new Proxy({}, {
  get: (_, k) => USER_STORE.state.done[k] && (USER_STORE.state.done[k].reason || 'arrivé'),
  set: (_, k, v) => { if (!USER_STORE.state.done[k]) USER_STORE.state.done[k] = { how: v === 'arrivé' ? 'confirmé' : v, reason: v, at: Date.now(), exp: Date.now() + 24 * 3600e3 }; return true; },
  deleteProperty: (_, k) => { delete USER_STORE.state.done[k]; return true; },
  ownKeys: () => Object.keys(USER_STORE.state.done),
  getOwnPropertyDescriptor: (_, k) => USER_STORE.state.done[k] ? { enumerable: true, configurable: true } : undefined
});
Object.defineProperty(LIVE, 'done', { get: () => DONE_VIEW, set: values => {
  USER_STORE.state.done = {}; Object.entries(values || {}).forEach(([k, v]) => { DONE_VIEW[k] = v; });
} });
// Aperçu demandé par l'utilisateur hors de la fenêtre de 4 h : automate séparé, aucune persistance.
// Il ne peut constater ni un départ ni une arrivée et ne demande aucun suivi GPS continu.
const TRIPPREVIEW = { key: null, phase: 'idle', gen: 0, base: null, planSignature: null, fix: null, origin: null, route: null, requestedAt: 0, readyAt: 0, exp: 0, message: '' };
const TRIPPREVIEW_AGE = 30 * 60e3, TRIPPREVIEW_KM = 1;
Object.defineProperty(window, 'BRF_TRIPS', { get: () => APP_CONTEXT.planned });
Object.defineProperty(window, 'BRF_SHOWN', { get: () => APP_CONTEXT.trips });
const RETURNHOME_KEY = 'twrc.returnhome.v1';
function returnHomeLoad() {
  if (RETURNHOME && RETURNHOME.exp <= Date.now()) RETURNHOME = null;
}
function returnHomeSave(x) {
  RETURNHOME = x || null;
  USER_STORE.flush();
}
function returnHomeClear(key) {
  if (!RETURNHOME || (key && RETURNHOME.key !== key)) return;
  returnHomeSave(null);
}
function returnHomeActive(key) {
  if (RETURNHOME && RETURNHOME.exp <= Date.now()) returnHomeClear();
  return !!RETURNHOME && RETURNHOME.key === key;
}
returnHomeLoad();
// « Je rentre chez moi maintenant » avance seulement l'intention de départ.
// Le passage ACTIVE reste exclusivement piloté par le mouvement automobile confirmé.
function returnHomeApply(T, now) {
  if (!RETURNHOME || RETURNHOME.exp <= Date.now()) { if (RETURNHOME) returnHomeClear(); return T; }
  return T.map(t => {
    if (t.key !== RETURNHOME.key || t.src !== 'cal' || !t.l || t.l.k !== 'ret') return t;
    const min = Math.max(1, Number(t.l.min) || Math.round(Math.max(1, liveMin(t.dep, t.arr || t.dep))));
    const dep = now, arr = addMin(dep, min), l = { ...t.l, dep, arr, assumed: false };
    const r = legEval(l);
    return { ...t, manualReturn: true, planDep: t.dep, dep, arr, running: false, l,
      res: r.res, sum: r.sum, seq: r.seq, crit: r.crit, worst: r.res ? r.worst : null, wait: !!r.loading };
  });
}
function returnHomeStart(key) {
  return appAction(() => {
  const t = BRF_TRIPS.find(x => x.key === key && x.src === 'cal' && x.l && x.l.k === 'ret');
  if (!t) return;
  appChooseDestination((homeExact() || {}).id);
  appDay().nextDestination.tripKey = key;
  returnHomeSave({ key, at: Date.now(), exp: Date.now() + 6 * 3600e3 });
  if (LIVE.key) liveReset();
  if (TRIPPREVIEW.key) tripPreviewReset();
  if (liveAllowed()) { LIVE.hiAt = 0; liveAskFix(); }
  });
}
function returnHomeUndo() {
  return appAction(() => {
  const key = RETURNHOME && RETURNHOME.key;
  if (key && LIVE.key === key && LIVE.phase !== 'active') liveReset();
  returnHomeClear();
  });
}
// Confirmation manuelle a posteriori : l'utilisateur affirme qu'il est déjà rentré.
// Aucun mouvement n'est inventé ; seul le trajet retour ciblé est marqué terminé.
function returnHomeDone(key) {
  return appAction(() => {
  const t = BRF_TRIPS.find(x => x.key === key && x.src === 'cal' && x.l && x.l.k === 'ret');
  if (!t) return;
  closeTrip(t, 'confirmé');
  });
}
function returnHomeButtonForTrip(t) {
  const plan = t && (t.planL || t.l);
  if (!t || t.src !== 'cal' || !t.e || !plan || plan.k !== 'ret') return '';
  if (t.l && t.l.destinationOverride && (tripTo(t) || {}).id !== (homeExact() || {}).id) return `<button class="btn sm" data-act="trip-start" data-key="${esc(t.key)}">🚗 Je pars maintenant</button>`;
  const now = liveNow(), planDep = t.planDep || plan.dep || t.dep, sameDay = planDep.slice(0, 10) === now.slice(0, 10), started = t.e.allDay || !t.e.s || t.e.s <= now;
  if (!sameDay || !started) return '';
  if (LIVE.done[t.key]) return '<span class="sub">✓ Déjà rentré confirmé</span>';
  const done = `<button class="btn sm" data-act="return-home-done" data-key="${esc(t.key)}">🏠 Déjà rentré</button>`;
  if (LIVE.key === t.key && LIVE.phase === 'active') return '<span class="sub">🏠 Retour maison en cours</span> ' + done;
  if (returnHomeActive(t.key)) return '<span class="sub">✓ Retour maison demandé</span> <button class="btn sm" data-act="return-home-undo">Annuler</button> ' + done;
  return `<button class="btn sm" data-act="return-home" data-key="${esc(t.key)}">🏠 Je rentre chez moi maintenant</button> ${done}`;
}
// Deux rendez-vous simultanés restent deux cibles d'action. Les anciennes clés
// restent valides quand l'agenda ne fournit aucun identifiant et n'est pas ambigu.
function calendarTripKey(e, l) {
  const key = 'leg|' + (l.originPlannedDep || l.dep) + '|' + l.k + '|' + e.s;
  if (e.id || e.uid || e.UID) return key + '|' + TripCancel.eventId(e);
  const events = CAL && CAL.events || [];
  return TripCancel.identifiable(events, e) ? key : key + '|duplicate|' + events.indexOf(e);
}
// Compatibilité d'une version : les anciennes arrivées agenda utilisaient une clé sans ID d'occurrence.
function calendarTripLegacyKey(e, l) { return e && l ? 'leg|' + (l.originPlannedDep || l.dep) + '|' + l.k + '|' + e.s : null; }
function liveDoneHas(t, all) {
  if (!t || LIVE.done[t.key]) return !!t;
  const l = t.planL || t.l, legacy = t.src === 'cal' && t.e ? calendarTripLegacyKey(t.e, l) : null;
  if (!legacy || !LIVE.done[legacy]) return false;
  // L'ancienne clé était ambiguë pour deux occurrences strictement simultanées : ne jamais en masquer plusieurs pendant la migration.
  return (all || []).filter(x => x && x.src === 'cal' && x.e && calendarTripLegacyKey(x.e, x.planL || x.l) === legacy).length === 1;
}
// trajets terminés (arrivée) mémorisés sur l'appareil : uniquement clé du trajet (heures, sens), mode, heure et expiration — AUCUNE coordonnée
const TRIPDONE = 'twrc.tripdone';
// « 🚗 Je pars maintenant » : départ déclaré (clé du trajet, heure, origine), relu au rechargement ; fin de trajet : résumé pour Analyse
const TRIPSTART_KEY = 'twrc.tripstart.v1', TRIPEND_KEY = 'twrc.tripend.v1';
const lsPut = (k, v) => { if (v) lsSet(k, JSON.stringify(v)); else { try { APP_STORAGE.removeItem(k); } catch (e) { /* stockage indisponible */ } } };
const tripStartSave = v => { TRIPSTART = v; USER_STORE.flush(); };
const tripEndSave = v => { TRIPEND = v; USER_STORE.flush(); };
function liveDonePersist(key, how) {
  const o = USER_STORE.state.done;
  const n = Date.now(); Object.keys(o).forEach(k => { if (!(o[k] && o[k].exp > n)) delete o[k]; });
  if (how) o[key] = { how, at: n, exp: n + 24 * 3600e3 }; else delete o[key];
  USER_STORE.flush();
}
// chargement : les entrées expirées sont réellement effacées du stockage (clé supprimée si plus rien n'est à garder)
function liveDoneLoad(legacy = false) {
  let o = USER_STORE.state.done;
  if (legacy) { try { o = JSON.parse(lsGet(TRIPDONE) || 'null'); } catch (e) { o = null; } }
  const n = Date.now(), keep = {};
  if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (o[k] && o[k].exp > n) keep[k] = o[k]; });
  USER_STORE.state.done = keep; USER_STORE.flush();
}
liveDoneLoad();
let FIX = null, FIXPREV = null;   // derniers relevés bruts ; ts = pos.timestamp (heure réelle du relevé, pas l'heure de réception)
const liveNow = () => nowIn('Europe/Paris');
const liveMin = (a, b) => (tsToDate(b) - tsToDate(a)) / 60e3;
const liveAge = f => f ? Math.max(0, Date.now() - f.ts) : Infinity;
const liveFresh = (f, maxAge) => !!f && f.acc <= LIVE_ACC && liveAge(f) <= maxAge && f.ts - Date.now() < 60e3;
function liveAllowed() {
  return !DEMO.on && !!S.gpsAuto && location.protocol === 'https:' && ('geolocation' in navigator) && !(LOCKED() && !lsGet('twrc.nocode'));
}
// destination réelle (jamais envoyée telle quelle : domicile et travail arrondis à 0,01°, comme pour la mini-carte)
function liveDest(t) {
  if (t.originPending || t.l && t.l.originPending) return null;
  if ((t.src === 'cal' || t.src === 'local') && t.l && locHasCoords(t.l.to)) return { lat: t.l.to.lat, lon: t.l.to.lon, name: t.to, priv: t.l.k === 'ret' };
  if (t.src === 'work' && t.td && locHasCoords(t.td.LB)) return { lat: t.td.LB.lat, lon: t.td.LB.lon, name: t.to, priv: true };
  return null;
}
// aller (l'arrivée est la contrainte) ; origine prévue du trajet ; départ effectif (conseillé pour un aller dont la route est connue)
const liveOut = t => (t.src === 'cal' && !!t.l && t.l.k === 'go') || (t.src === 'work' && !!t.td && t.td.dir === 'go');
const livePlanFrom = t => t.src === 'cal' || t.src === 'local' ? (t.l && t.l.from) : (t.td && t.td.LA);
// départ adaptatif seulement pour un aller, et seulement si la route part à plus de 1 km de l'origine prévue : chez soi, l'heure
// planifiée (et, pour le boulot, la durée choisie dans les réglages) n'est jamais modifiée
const liveAdapt = (b, R) => liveOut(b) && !!b.arr && !!R && !!livePlanFrom(b) && distKm(R.o, livePlanFrom(b)) > 1;
const liveRouteMin = (b, R) => routeTravelMin(R && (R.rawMin ?? R.min), liveOut(b) ? 10 : 0);
const liveEffDep = b => LIVE.route && LIVE.route.key === LIVE.key && liveAdapt(b, LIVE.route) ? addMin(b.arr, -liveRouteMin(b, LIVE.route)) : b.dep;
const liveFirst = (a, b) => a < b ? a : b;
function liveReset(reason) {
  if (LIVE.key && reason) LIVE.done[LIVE.key] = reason;
  Object.assign(LIVE, { key: null, phase: 'idle', base: null, startFix: null, lastFix: null, carN: 0, near: null, arrN: 0, arrTs: 0, route: null, routeAt: 0, routeOrigin: null, routeTry: 0, routeErr: false, last: null, lastOk: 0, hiAt: 0, loAt: 0, nowAt: 0 });
  LIVE.gen++;   // toute réponse encore en route est désormais ignorée
  LIVE.manual = 0; if (TRIPSTART) tripStartSave(null);
  USER_STORE.state.debrief.active = null;
  if (gpsWatch != null && gpsWatchHi) startWatch(false);   // retour au suivi basse consommation
}
// destination pour l'ARRIVÉE : un retour vise le domicile local exact (le relais n'a qu'un domicile arrondi à 0,01°)
const liveArrDest = b => b.src === 'cal' && b.l && b.l.k === 'ret' && !b.l.destinationOverride ? (homeExact() || liveDest(b)) : liveDest(b);
// vitesse entre deux relevés (m/s) : vitesse GPS si fournie, sinon déduite (distance / Δt) — seulement si le déplacement dépasse
// deux fois l'incertitude cumulée des deux relevés (le bruit GPS ne crée aucune vitesse) ; null si non mesurable
const LIVE_CAR = 2;
function liveSpeed(a, b) {
  if (!a || !b || b.ts <= a.ts) return null;
  if (b.speed != null) return b.speed;   // vitesse mesurée par le GPS : propre à ce relevé
  const dt = (b.ts - a.ts) / 1000, d = distKm(a, b) * 1000;
  if (dt < 5 || b.ts - a.ts > LIVE_AGE_IMM) return null;   // intervalle trop court ou de plus de 5 min : vitesse non mesurable
  return d <= 2 * (a.acc + b.acc) ? 0 : d / dt;
}
// « 🚗 Je pars maintenant » : bascule le trajet affiché en « en cours » dans l'automate existant (aucune deuxième machine).
// Origine : relevé GPS frais, sinon lieu confirmé, sinon origine prévue du trajet ; itinéraire OSRM demandé tout de suite.
function liveBegin(t, s) {
  const o = s.o && Number.isFinite(+s.o.lat) ? s.o : null, sf = { lat: o ? +o.lat : NaN, lon: o ? +o.lon : NaN, acc: s.acc || 100, ts: s.at, src: s.src };
  Object.assign(LIVE, { key: t.key, base: t, phase: 'active', manual: s.at, startFix: sf, lastFix: sf, carN: 0, arrN: 0, near: null });
  if (o && !offlineNow()) liveRoute(sf, t);
  if (liveAllowed()) startWatch(true);   // suivi continu si le GPS est autorisé
}
function liveStart(key) {
  return appAction(() => {
  const t = BRF_SHOWN.find(x => x.key === key); if (!t || !liveDest(t) || LIVE.key === key && LIVE.phase === 'active') return;
  const base = LIVE.key === key && LIVE.base ? LIVE.base : t; if (LIVE.key && LIVE.key !== key) liveReset();
  const pc = PLACE.conf && placeList().find(p => p.id === PLACE.conf.placeId), fix = !pc && liveFresh(FIX, LIVE_AGE_IMM) ? FIX : null;
  const o = fix || (pc && locHasCoords(pc) ? pc : null) || livePlanFrom(base);
  const s = { key, at: Date.now(), o: o && locHasCoords(o) ? { lat: +o.lat, lon: +o.lon } : null, acc: fix ? fix.acc : 100, src: fix ? 'gps' : pc ? 'lieu confirmé' : 'origine prévue' };
  appDeparture(base, s); liveBegin(base, s);
  });
}
function liveArrive(how) {
  return appAction(() => {
  if (LIVE.key && LIVE.base) closeTrip(LIVE.base, how);
  });
}
// relevé de confirmation demandé tout de suite (arrivée à confirmer), au plus un toutes les 10 s ; jamais de haute précision en aperçu
function liveAskNow() {
  if (Date.now() - LIVE.nowAt < 10e3) return;
  LIVE.nowAt = Date.now();
  liveGpsRequest({ enableHighAccuracy: LIVE.phase !== 'advice', timeout: 15000, maximumAge: 0 });
}
// chaque nouveau relevé : arrivée (dans TOUTES les phases), puis départ. L'heure conseille QUAND partir ; seul le mouvement décide
// SI le trajet a commencé. Aucune transition sur un relevé périmé (pos.timestamp) ou imprécis. Jamais au rendu : un rendu ne recrée rien.
//   arrivée (fenêtre vivante seulement, jamais en aperçu) : 2 relevés frais (≤ 2 min), précis (≤ 150 m), distincts, à ≤ 300 m → arrivé ; ≤ 1,5 km → « arrivée probable » (confirmation manuelle)
//   départ : référence figée une seule fois + déplacement > max(300 m, 2 × incertitude) + vitesse automobile (> 2 m/s) sur 2 relevés successifs,
//            mesurée ou déduite ; dès la fenêtre vivante (90 min avant le plus tôt des départs prévu / conseillé), sans attendre l'heure
function liveOnFix(fix) {
  if (PLACE.conf && fix.ts <= PLACE.conf.at) return;   // un GPS antérieur ne défait jamais une confirmation plus récente
  if (TRIPSTART && fix.ts < TRIPSTART.at) return;
  if (!LIVE.key || !LIVE.base) { if (liveAllowed()) { clearTimeout(liveOnFix.t); liveOnFix.t = setTimeout(renderBrf, 300); } return; }
  const ad = liveArrDest(LIVE.base);
  if (LIVE.phase === 'advice') { LIVE.arrN = 0; LIVE.near = null; }   // aperçu (jusqu'à 4 h avant) : ni arrivée automatique, ni arrivée probable
  else if (ad && fix.ts !== LIVE.arrTs && liveFresh(fix, LIVE_AGE_RUN)) {   // un relevé périmé ne compte pas et n'interrompt pas la série
    LIVE.arrTs = fix.ts;
    const d = distKm(fix, ad), sure = fix.acc <= LIVE_ACC_ARR;
    LIVE.arrN = sure && d <= LIVE_ARR_KM ? LIVE.arrN + 1 : 0;
    LIVE.near = sure && d <= 1.5 ? d : null;
    if (LIVE.arrN >= 2 && !(LIVE.noAuto[LIVE.key] > Date.now())) { liveArrive('auto'); return; }
    if (LIVE.arrN === 1) liveAskNow();
  }
  if (LIVE.phase !== 'active') {
    if (!LIVE.startFix) { if (liveFresh(fix, LIVE_AGE_IMM)) LIVE.startFix = LIVE.lastFix = fix; }   // référence figée une seule fois
    else if (liveFresh(fix, LIVE_AGE_RUN) && fix.ts !== (LIVE.lastFix && LIVE.lastFix.ts)) {
      const v = liveSpeed(LIVE.lastFix, fix), gap = fix.ts - LIVE.lastFix.ts > LIVE_AGE_IMM;
      LIVE.carN = v != null && v > LIVE_CAR ? (gap ? 1 : LIVE.carN + 1) : 0;   // mesure impossible = série cassée ; plus de 5 min d'écart = nouvelle série
      const sf = LIVE.startFix, thr = Math.max(0.3, 2 * Math.max(fix.acc, sf.acc) / 1000);
      if (LIVE.phase !== 'advice' && LIVE.carN >= 2 && distKm(sf, fix) > thr) {
        appAction(() => { appDeparture(LIVE.base, { key: LIVE.key, at: fix.ts, o: { lat: sf.lat, lon: sf.lon }, acc: sf.acc, src: 'gps' }); LIVE.phase = 'active'; startWatch(true); });
      }   // suivi haute précision continu
      LIVE.lastFix = fix;
    }
  }
  clearTimeout(liveOnFix.t); liveOnFix.t = setTimeout(renderBrf, 300);
}
// demande ponctuelle haute précision (fenêtre avant départ ou départ dépassé), au plus une par minute
function liveAskFix() {
  if (LIVE.phase === 'active' || LIVE.phase === 'advice' || Date.now() - LIVE.hiAt < 60e3) return;
  LIVE.hiAt = Date.now();
  liveGpsRequest({ enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
// aperçu : relevé ponctuel BASSE consommation (jamais de haute précision), au plus un toutes les 5 min
function liveAskLow() {
  if (Date.now() - LIVE.loAt < 5 * 60e3) return;
  LIVE.loAt = Date.now();
  liveGpsRequest({ enableHighAccuracy: false, timeout: 20000, maximumAge: 4 * 60e3 });
}
// itinéraire depuis la position : comme le relais (géométrie complète + durées, points placés selon le TEMPS de parcours)
function liveParse(j) {
  const r = j && j.routes && j.routes[0]; if (!r || !r.geometry || !r.geometry.coordinates || r.geometry.coordinates.length < 2) return null;
  const co = r.geometry.coordinates, dur = (r.legs && r.legs[0] && r.legs[0].annotation && r.legs[0].annotation.duration) || null;
  const hv = (p, q) => distKm({ lat: p[1], lon: p[0] }, { lat: q[1], lon: q[0] }), cumD = [0], cumT = [0];
  for (let i = 1; i < co.length; i++) { cumD.push(cumD[i - 1] + hv(co[i - 1], co[i])); cumT.push(cumT[i - 1] + (dur && dur[i - 1] != null ? dur[i - 1] : 0)); }
  const totT = cumT[cumT.length - 1], totD = cumD[cumD.length - 1] || 1, byTime = totT > 0;
  const pts = [0.25, 0.5, 0.75].map(f => { let i = (byTime ? cumT : cumD).findIndex(c => c >= f * (byTime ? totT : totD)); if (i < 0) i = co.length - 1;
    return { f, lat: +co[i][1].toFixed(3), lon: +co[i][0].toFixed(3), km: Math.round(cumD[i] * 10) / 10, name: null }; });
  const g = [], step = totD / 80; let nxt = 0;
  for (let i = 0; i < co.length; i++) if (cumD[i] >= nxt || i === co.length - 1) { g.push([+co[i][1].toFixed(3), +co[i][0].toFixed(3)]); nxt = cumD[i] + step; }
  const km = r.distance != null ? r.distance / 1000 : totD, sec = r.duration != null ? r.duration : totT, rawMin = Math.max(1, sec / 60);
  let road = null;
  try { if (typeof RoadIntelligence !== 'undefined') road = RoadIntelligence.fromOSRM(j); } catch (e) { /* le trajet météo reste utilisable */ }
  return { km: Math.round(km * 10) / 10, rawMin, min: routeTravelMin(rawMin), pts, g, road };   // marge routière plafonnée ; l'aller réserve séparément 10 min avant le rendez-vous
}
function tripPreviewReset() {
  const gen = TRIPPREVIEW.gen + 1;
  Object.assign(TRIPPREVIEW, { key: null, phase: 'idle', gen, base: null, planSignature: null, fix: null, origin: null, route: null, requestedAt: 0, readyAt: 0, exp: 0, message: '' });
}
function tripPlanSignature(t) {
  if (!t) return null;
  const from = livePlanFrom(t), to = liveDest(t);
  return JSON.stringify([t.key, t.e && (t.e.id || t.e.uid || t.e.UID) || '', from && [from.lat, from.lon], to && [to.lat, to.lon, !!to.priv]]);
}
const tripPreviewMatches = t => !!t && tripPlanSignature(t) === TRIPPREVIEW.planSignature;
const tripPreviewAllowed = () => !DEMO.on && !offlineNow() && location.protocol === 'https:' && ('geolocation' in navigator) && !(LOCKED() && !lsGet('twrc.nocode'));
const tripPreviewFuture = (t, now) => !!t && !t.live && !t.manualPreview && !!liveDest(t) && liveMin(now, t.dep) > LIVE_ADV;
function tripPreviewStart(key) {
  const b = BRF_TRIPS.find(t => t.key === key), now = liveNow();
  if (!tripPreviewAllowed() || !tripPreviewFuture(b, now)) return;
  tripPreviewReset();
  Object.assign(TRIPPREVIEW, { key, base: b, planSignature: tripPlanSignature(b), phase: 'gps', requestedAt: Date.now(), exp: Date.now() + TRIPPREVIEW_AGE });
  const gen = TRIPPREVIEW.gen;
  const accept = fix => {
    if (gen !== TRIPPREVIEW.gen || key !== TRIPPREVIEW.key) return;
    if (!tripPreviewMatches(BRF_TRIPS.find(t => t.key === key))) { tripPreviewReset(); renderBrf(); return; }
    if (!liveFresh(fix, LIVE_AGE_IMM) || fix.ts < TRIPPREVIEW.requestedAt - 1000 || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180) {
      TRIPPREVIEW.phase = 'error'; TRIPPREVIEW.message = 'Position trop ancienne ou imprécise pour calculer cet aperçu.'; renderBrf(); return;
    }
    TRIPPREVIEW.fix = fix; tripPreviewRoute(fix, b, gen);
  };
  // « Maintenant » demande toujours un relevé neuf, même si FIX est encore
  // précis et utilisable par LIVE. Pas de onPos, stockage ou watch continu.
  try { navigator.geolocation.getCurrentPosition(p => {
      const c = p && p.coords;
      accept(c ? { lat: c.latitude, lon: c.longitude, acc: c.accuracy == null ? Infinity : c.accuracy, ts: p.timestamp, speed: null } : null);
    }, err => {
      if (gen !== TRIPPREVIEW.gen || key !== TRIPPREVIEW.key) return;
      TRIPPREVIEW.phase = 'error'; TRIPPREVIEW.message = err && err.code === 1 ? 'Localisation refusée : active-la pour calculer depuis ici.' : 'Position introuvable pour le moment.'; renderBrf();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); }
  catch (e) { TRIPPREVIEW.phase = 'error'; TRIPPREVIEW.message = 'Localisation indisponible pour le moment.'; }
  renderBrf();
}
function tripPreviewRoute(fix, b, gen) {
  const o = liveOrigin(fix), d = liveDest(b); if (!d) { tripPreviewReset(); return; }
  const dd = d.priv ? { lat: rc2(d.lat), lon: rc2(d.lon) } : { lat: +(+d.lat).toFixed(3), lon: +(+d.lon).toFixed(3) };
  TRIPPREVIEW.origin = o; TRIPPREVIEW.phase = 'loading';
  fetchJSON(`https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${dd.lon},${dd.lat}?overview=full&geometries=geojson&annotations=duration&steps=true`, 10000)
    .then(j => {
      if (gen !== TRIPPREVIEW.gen || b.key !== TRIPPREVIEW.key) return;
      if (!tripPreviewMatches(BRF_TRIPS.find(t => t.key === b.key))) { tripPreviewReset(); renderBrf(); return; }
      const r = liveParse(j); if (!r) throw new Error('itinéraire vide');
      TRIPPREVIEW.route = { ...r, key: b.key, gen, o, d: { lat: d.lat, lon: d.lon, name: d.name } }; renderBrf();
    })
    .catch(() => {
      if (gen !== TRIPPREVIEW.gen || b.key !== TRIPPREVIEW.key) return;
      TRIPPREVIEW.phase = 'error'; TRIPPREVIEW.message = 'Aperçu indisponible pour le moment · trajet planifié affiché.'; renderBrf();
    });
}
function tripPreviewApply(T, now) {
  if (!TRIPPREVIEW.key) return T;
  const b = T.find(t => t.key === TRIPPREVIEW.key);
  // La fenêtre automatique reprend toujours la main ; une réponse tardive ne réactive pas l'aperçu.
  if (!tripPreviewAllowed() || !tripPreviewFuture(b, now) || !tripPreviewMatches(b) || Date.now() >= TRIPPREVIEW.exp ||
      (TRIPPREVIEW.fix && liveFresh(FIX, LIVE_AGE_IMM) && FIX.ts >= TRIPPREVIEW.fix.ts && distKm(FIX, TRIPPREVIEW.fix) > TRIPPREVIEW_KM)) {
    tripPreviewReset(); return T;
  }
  TRIPPREVIEW.base = b;
  const R = TRIPPREVIEW.route; if (!R || TRIPPREVIEW.phase === 'error') return T;
  const routeMin = liveRouteMin(b, R), dep = liveAdapt(b, R) ? addMin(b.arr, -routeMin) : b.dep;
  const leg = { k: 'preview', from: { lat: R.o.lat, lon: R.o.lon, label: 'Ma position', city: 'Ma position' }, to: { lat: R.d.lat, lon: R.d.lon, label: R.d.name, city: R.d.name },
    km: R.km, min: routeMin, dep, arr: addMin(dep, routeMin), pts: R.pts, g: R.g, routed: true };
  const r = legEval(leg);
  if (r.err || r.beyond) { TRIPPREVIEW.phase = 'error'; TRIPPREVIEW.message = 'Météo de l’aperçu indisponible · trajet planifié affiché.'; return T; }
  if (!r.res) return T;   // route ET météo prêtes : jamais de résultat partiel
  TRIPPREVIEW.phase = 'ready'; if (!TRIPPREVIEW.readyAt) TRIPPREVIEW.readyAt = Date.now();
  // Les heures planifiées restent la référence : cet aperçu ponctuel ne change ni la timeline ni le relais.
  const preview = { ...b, manualPreview: true, previewGen: R.gen, previewDep: dep, previewArr: leg.arr, planL: b.l, from: '📍 Ma position', l: leg, obs: null, running: false,
    res: r.res, sum: r.sum, seq: r.seq, crit: r.crit, worst: r.worst, wait: false,
    gpsTxt: `📍 Aperçu ponctuel · position relevée à ${new Date(TRIPPREVIEW.fix.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} · valable jusqu’à ${new Date(TRIPPREVIEW.exp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}` };
  return T.map(t => t.key === b.key ? preview : t);
}
function tripOriginHtml(t) {
  const now = liveNow(), planned = tripPreviewFuture(t, now), elsewhere = planned && liveFresh(FIX, LIVE_AGE_IMM) && livePlanFrom(t) && distKm(FIX, livePlanFrom(t)) > 1;
  const origin = `<div class="brf-r">${elsewhere ? '<small>Origine planifiée : </small>' : ''}${esc(t.from)} <span>→</span> ${esc(t.to)}</div>`;
  const notice = elsewhere ? `<div class="brf-why">📍 Tu es actuellement ailleurs. Le trajet sera recalculé depuis ta position à partir de ${addMin(t.dep, liveOut(t) ? -LIVE_ADV : -LIVE_WIN).slice(11, 16)} si tu es toujours ici.</div>` : '';
  const pending = TRIPPREVIEW.key === t.key && ['gps', 'loading'].includes(TRIPPREVIEW.phase);
  const message = TRIPPREVIEW.key === t.key ? (pending ? (TRIPPREVIEW.phase === 'gps' ? 'Recherche de ta position…' : 'Calcul de l’aperçu : route et météo…') : TRIPPREVIEW.message) : '';
  const button = planned && tripPreviewAllowed() ? `<div class="cal-v"><button class="btn sm" data-act="trip-preview" data-key="${esc(t.key)}" ${pending ? 'disabled' : ''}>📍 Calculer depuis ici maintenant</button></div>` : '';
  return origin + notice + (message ? `<div class="brf-why" role="status">${esc(message)}</div>` : '') + button;
}
// une route n'est « courante » que pour le relevé qui la justifie : même trajet, origine à ≤ 1 km du relevé, calculée il y a ≤ 10 min.
// Sinon elle est périmée : un recalcul est demandé, et elle ne peut plus produire d'analyse présentée comme actuelle.
const liveOrigin = fix => ({ lat: +fix.lat.toFixed(3), lon: +fix.lon.toFixed(3) });
const liveRouteCurrent = (R, o) => { const adv = LIVE.phase === 'advice';
  return !!R && R.key === LIVE.key && distKm(R.o, o) <= (adv ? LIVE_ADV_KM : 1) && Date.now() - LIVE.routeAt <= (adv ? LIVE_ADV_AGE : 10 * 60e3); };
function liveRoute(fix, b) {
  if (offlineNow()) { LIVE.routeErr = true; return; }
  const o = liveOrigin(fix);
  if (liveRouteCurrent(LIVE.route, o) || Date.now() - LIVE.routeTry < 30e3) return;   // recalcul après ~1 km / 10 min (aperçu : 5 km / 30 min), jamais en rafale
  const d = liveDest(b); if (!d) return;
  const dd = d.priv ? { lat: rc2(d.lat), lon: rc2(d.lon) } : { lat: +(+d.lat).toFixed(3), lon: +(+d.lon).toFixed(3) };
  LIVE.routeTry = Date.now(); const gen = ++LIVE.gen, key = LIVE.key;
  fetchJSON(`https://router.project-osrm.org/route/v1/driving/${o.lon},${o.lat};${dd.lon},${dd.lat}?overview=full&geometries=geojson&annotations=duration&steps=true`, 10000)
    .then(j => {
      if (gen !== LIVE.gen || key !== LIVE.key) return;   // OSRM : réponse d'une ancienne position ou d'un autre trajet, ignorée (génération)
      // (météo : chaque route a sa propre clé géographique legKey/LEGM ; une réponse tardive d'une ancienne route n'est jamais lue pour la route courante)
      const p = liveParse(j); if (!p) throw new Error('itinéraire vide');
      LIVE.route = { ...p, key, gen, o, d: { lat: d.lat, lon: d.lon, name: d.name } }; if (!LIVE.route0 || LIVE.route0.key !== key) LIVE.route0 = { key, km: p.km, o }; LIVE.routeAt = Date.now(); LIVE.routeOrigin = o; LIVE.routeErr = false; renderBrf();
    })
    .catch(() => { if (gen === LIVE.gen && key === LIVE.key) { LIVE.routeErr = true; renderBrf(); } });
}
const liveAgo = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`; };
// version vivante du trajet ; tant qu'aucune analyse vivante complète (route + météo) n'existe, le trajet planifié reste affiché.
// Une analyse n'est COURANTE que si : relevé frais + route courante pour ce relevé + météo de cette route prête. Seule une analyse
// courante est présentée comme actuelle et fait avancer lastOk ; sinon la dernière analyse est affichée, marquée ancienne, 5 min au plus.
function liveTrip(b, now) {
  const run = LIVE.phase === 'active', fix = FIX, fresh = liveFresh(fix, run ? LIVE_AGE_RUN : LIVE_AGE_IMM) && fix.ts >= appGpsFloor();
  if (fresh) liveRoute(fix, b);
  if (!liveAllowed()) { /* départ déclaré, GPS coupé : aucune demande de position */ }
  else if (LIVE.phase === 'advice') { if (!fresh) liveAskLow(); } else if (!fresh || LIVE.phase === 'late') liveAskFix();
  let a = null;
  if (fresh && liveRouteCurrent(LIVE.route, liveOrigin(fix))) {
    // aller : départ conseillé = arrivée prévue − durée depuis ici ; retour : départ prévu ; parti ou en retard : maintenant
    const R = LIVE.route, out = liveAdapt(b, R), routeMin = liveRouteMin(b, R), adep = out ? addMin(b.arr, -routeMin) : b.dep, dep = LIVE.phase === 'imminent' || LIVE.phase === 'advice' ? adep : now;
    const leg = { k: 'live', from: { lat: R.o.lat, lon: R.o.lon, label: 'Ma position', city: 'Ma position' }, to: { lat: R.d.lat, lon: R.d.lon, label: R.d.name, city: R.d.name },
      km: R.km, min: routeMin, dep, arr: addMin(dep, routeMin), pts: R.pts, g: R.g, routed: true };
    const r = legEval(leg);
    if (r.res) { a = { leg, r, fixTs: fix.ts, gen: R.gen, adv: out ? { target: b.arr, dep: adep } : null }; LIVE.last = a; LIVE.lastOk = Date.now(); }   // bascule atomique : route ET météo prêtes
  }
  let old = null;
  if (!a && LIVE.last && Date.now() - LIVE.lastOk <= LIVE_GRACE) { a = LIVE.last; old = fresh ? 'route' : 'gps'; }   // dernière analyse, marquée ancienne
  if (!a) {
    const started = TRIPSTART && TRIPSTART.key === b.key ? TRIPSTART.at : LIVE.manual;
    const mb = run && started ? { ...b, running: true, dep: localTs(started), arr: addMin(localTs(started), Math.max(1, liveMin(b.dep, b.arr || b.dep))) } : { ...b, running: false };
    // Une météo de route en attente n'efface pas une heure conseillée déjà
    // validée depuis la même origine, avec une géométrie encore courante.
    if (!run && LIVE.last && LIVE.last.adv && fresh && liveRouteCurrent(LIVE.route, liveOrigin(fix))) {
      mb.dep = liveEffDep(b); mb.adv = { target: b.arr, dep: mb.dep }; mb.live = LIVE.phase; mb.planDep = b.dep;
      if (LIVE.phase === 'late') { mb.dep = now; mb.arr = addMin(now, liveRouteMin(b, LIVE.route)); }
    }
    return LIVE.last ? { ...mb, liveLost: true } : mb;
  }
  const { leg, r } = a, hm = new Date(LIVE.lastOk).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return { ...b, live: LIVE.phase, liveGen: a.gen, planDep: b.dep, planL: b.l, adv: a.adv, dep: leg.dep, arr: leg.arr, running: run, from: '📍 Ma position', l: leg, obs: null,
    res: r.res, sum: r.sum, seq: r.seq, crit: r.crit, worst: r.worst, wait: false,
    gpsTxt: old === 'gps' ? `📍 GPS ancien · dernière analyse ${hm}` : old === 'route' ? `📍 Itinéraire non actualisé · dernière analyse ${hm}` : `📍 GPS · actualisé il y a ${liveAgo(Date.now() - fix.ts)}` };
}
// appliqué à la timeline : retire les trajets terminés, garde le trajet commencé après son heure prévue, rend vivant un seul trajet
function liveApply(T, now) {
  // Une ancienne route ne rend jamais un rappel éligible au suivi vivant.
  // Garder l'absence d'agenda temporaire distincte d'un événement exclu connu.
  if (CAL && CAL.events && LIVE.base && LIVE.base.src === 'cal') {
    const e = CAL.events.find(e => e === LIVE.base.e || LIVE.base.e && TripCancel.eventId(e) === TripCancel.eventId(LIVE.base.e));
    if (!e || !calendarSpatial(e)) liveReset();
  }
  // Un trajet déjà terminé reste terminé même si le GPS est désactivé au rechargement.
  const beforeDone = T; T = T.filter(t => !liveDoneHas(t, beforeDone));
  if (!LIVE.key && !DEMO.on && TRIPSTART && Date.now() - TRIPSTART.at < 12 * 3600e3) { const t = T.find(x => x.key === TRIPSTART.key); if (t) liveBegin(t, TRIPSTART); }
  if (!liveAllowed() && !LIVE.manual) { if (LIVE.key) liveReset(); return T; }
  let cur = LIVE.key ? T.find(t => t.key === LIVE.key) : null;
  if (cur) LIVE.base = cur;
  else if (LIVE.key && LIVE.base && (LIVE.phase === 'active' || LIVE.last)) { cur = LIVE.base; T.push(cur); }   // trajet suivi en direct : reste affiché
  else if (LIVE.key) liveReset();
  if (LIVE.key) {   // expiration : jamais parti → arrivée prévue + 30 min ; parti → coupe-circuit arrivée prévue + max(60 min, 2 × durée)
    const b = LIVE.base, dur = Math.max(1, liveMin(b.dep, b.arr || b.dep)), mArr = LIVE.manual ? addMin(localTs(LIVE.manual), dur) : null;
    if (liveMin(mArr && mArr > (b.arr || b.dep) ? mArr : b.arr || b.dep, now) > (LIVE.phase === 'active' ? Math.max(60, 2 * dur) : 30)) { const k = b.key; liveReset(LIVE.phase === 'active' ? 'coupe-circuit' : 'expiré'); T = T.filter(t => t.key !== k); cur = null; }
  }
  if (LIVE.key && LIVE.phase === 'advice') {   // aperçu abandonné si l'on revient à moins de 1 km de l'origine prévue
    const pf = livePlanFrom(LIVE.base);
    if (pf && liveFresh(FIX, LIVE_AGE_IMM) && distKm(FIX, pf) <= 1) { liveReset(); cur = null; }
  }
  if (!LIVE.key) {
    // Une météo réévaluée pour « maintenant » ne rouvre pas toute seule la
    // fenêtre GPS d'un départ planifié ancien. Un départ explicite la rouvre.
    const nxt = T.filter(t => liveDest(t) && (t.manualReturn || liveMin(t.planDep || t.dep, now) <= Math.max(1, liveMin(t.dep, t.arr || t.dep)) + 30)).sort((a, b) => a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : 0)[0];
    if (!nxt) return T;
    let ph = null;
    if (liveMin(now, nxt.dep) <= LIVE_WIN) ph = 'imminent';
    else if (liveOut(nxt) && nxt.arr && liveMin(now, nxt.dep) <= LIVE_ADV && liveFresh(FIX, LIVE_AGE_IMM) && livePlanFrom(nxt) && distKm(FIX, livePlanFrom(nxt)) > 1) ph = 'advice';
    if (!ph) return T;
    Object.assign(LIVE, { key: nxt.key, base: nxt, phase: ph }); cur = nxt;
    if (liveFresh(FIX, LIVE_AGE_IMM)) LIVE.startFix = LIVE.lastFix = FIX;
    setTimeout(() => { if (LIVE.key === nxt.key) { if (LIVE.phase === 'advice') liveAskLow(); else { LIVE.hiAt = 0; liveAskFix(); } } }, 0);   // ne pas attendre le suivi passif
    if (FIX) setTimeout(() => { if (LIVE.key === nxt.key) liveOnFix(FIX); }, 0);   // le dernier relevé compte aussi pour l'arrivée (réouverture sur place)
  }
  if (LIVE.phase !== 'active') {   // suivi vivant dès min(départ prévu, départ conseillé) − 90 min ; jamais plus tard que la règle des 90 min
    const eff = liveEffDep(LIVE.base);
    if (LIVE.phase === 'advice' && liveMin(now, liveFirst(LIVE.base.dep, eff)) > LIVE_WIN) { /* reste en aperçu */ }
    else {
      const wasAdv = LIVE.phase === 'advice', k = LIVE.key; LIVE.phase = now < eff ? 'imminent' : 'late';
      if (wasAdv) {   // entrée dans la fenêtre vivante : l'arrivée devient possible → relevé demandé, dernier relevé réexaminé
        setTimeout(() => { if (LIVE.key === k) { LIVE.hiAt = 0; liveAskFix(); if (FIX) liveOnFix(FIX); } }, 0);
      }
    }
  }
  const lt = liveTrip(LIVE.base, now);
  return T.map(t => t.key === LIVE.key ? lt : t);
}
setInterval(() => { if ((LIVE.key || TRIPPREVIEW.key) && !document.hidden) renderBrf(); }, 15e3);

// Le poste météo (onglet Météo) suit chaque mise à jour du briefing : mêmes trajets, mêmes modèles, aucun appel en plus.
// @include app/road-view.js
function renderBrf() { renderAll(); }
function appBuildTrips() {
  const clockModel = (CX && CX.m) || M[S.locs[0].id] || Object.values(M).find(Boolean);
  const cars = appTripCars();
  const now = DEMO.on && clockModel ? clockModel.nowStr.slice(0, 16) : nowIn(clockModel && clockModel.payload && clockModel.payload.timezone || 'Europe/Paris');
  const today = now.slice(0, 10), nowHm = now.slice(11, 16);
  // une seule timeline : trajet domicile-travail + trajets agenda, triés par heure réelle de départ
  // modèle commun Trip : { src: 'work' | 'cal' | 'local', carId (voiture active ou comparaison), dep, arr, running, from, to, res, sum, seq, worst }
  let T = []; const workT = (td, running) => {
    if (workCancelled(td.dep.slice(0, 10))) return;
    const plannedDep = td.dep, key = 'commute|' + plannedDep + '|' + td.dir;
    const current = placeNow().place;
    if (td.dir === 'go' && plannedDep.slice(0, 10) === today && current && current.id === S.work.to && !(TRIPSTART && TRIPSTART.key === key)) return;
    const place = placeNow().place, overdue = td.dep <= now && place && place.id === (td.dir === 'go' ? S.work.from : S.work.to);
    if (TRIPSTART && TRIPSTART.key === key || overdue) {
      const actual = appWorkTripData(td.dir, dayDiff(today, plannedDep.slice(0, 10)), TRIPSTART && TRIPSTART.key === key ? localTs(TRIPSTART.at) : now);
      if (!actual.err) td = actual;
    }
    const res = td.seq.length ? cars.map(c => ({ c, w: windowAssess(c, td.seq, 'trip') })).filter(r => r.w) : [];
    T.push({ src: 'work', carId: appDay().activeCarId, dep: td.dep, planDep: plannedDep, arr: td.arr, running: false, name: appCommuteLabel(td), customRoute: appCommuteLabel(td).startsWith('Trajet ·'), from: td.fromName, to: td.toName,
      res: res.length ? res : null, sum: td.seq.length ? summarize(td.seq) : null, seq: td.seq, wait: !td.seq.length, worst: res.length ? res.reduce((m, r) => Math.max(m, r.w.level), 0) : null, key, obs: td.A && td.A.obs, td });
  };
  // trajet domicile-travail en cours (entre le départ et l'arrivée) : il reste affiché jusqu'à l'arrivée
  if (appWorkOn(today)) ['go', 'ret'].forEach(d => { const t0 = toMin(d === 'go' ? S.work.dep : S.work.ret), n = toMin(nowHm);
    if (n >= t0 && n < t0 + (+S.work.durMin || 30)) { const r = appWorkTripData(d, 0); if (r && !r.err) workT(r, true); } });
  if (appWorkOn(today)) ['go', 'ret'].forEach(d => {
    const time = d === 'go' ? S.work.dep : S.work.ret;
    if (today + 'T' + time > now) { const r = appWorkTripData(d, 0); if (r && !r.err) workT(r, false); }
  });
  const td = nextTrip(); if (td && !T.some(t => t.key === 'commute|' + td.dep + '|' + td.dir)) workT(td, false);
  if (CAL && CAL.events) CAL.events.filter(calendarSpatial).forEach(e => effLegs(e).forEach(l => {
    if ((l.arr || l.dep) < now && !(TRIPSTART && calendarTripKey(e, l) === TRIPSTART.key)) return;   // gardé jusqu'à l'arrivée
    const key = calendarTripKey(e, l), planned = l;
    if (TRIPSTART && TRIPSTART.key === key) {
      const dep = localTs(TRIPSTART.at), dur = +l.min || Math.max(1, liveMin(l.dep, l.arr));
      l = { ...l, dep, arr: addMin(dep, dur) };
    }
    const r = legEval(l);
    T.push({ src: 'cal', carId: appDay().activeCarId, dep: l.dep, planDep: planned.dep, planL: planned, arr: l.arr, running: false, name: `${l.k === 'ret' ? 'Retour' : 'Aller'} · ${e.t}`, from: l.originRecalc && l.originName ? l.originName : l.from ? l.from.city || l.from.label : 'Origine à confirmer', to: l.to ? l.to.city || l.to.label : 'Destination à confirmer', l, e, originPending: !!l.originPending,
      res: r.res, sum: r.sum, seq: r.seq, crit: r.crit, worst: r.res ? r.worst : null, wait: !!r.loading, key });
  }));
  // Un départ déclaré reste restorable après l'heure d'arrivée prévue.
  if (TRIPSTART && TRIPSTART.trip && TRIPSTART.trip.src === 'work' && !T.some(t => t.key === TRIPSTART.key)) {
    const r = appWorkTripData(TRIPSTART.trip.dir, dayDiff(today, TRIPSTART.trip.dep.slice(0, 10)));
    if (r && !r.err) workT(r, false);
  }
  T = appLocalTrips(T, now);
  APP_CONTEXT.planned = T.slice();   // cibles des actions explicites, uniquement en mémoire
  T = returnHomeApply(T, now);   // action explicite : le retour choisi devient le prochain départ, sans déclarer la voiture partie
  T = liveApply(T, now);   // trajet vivant (position GPS réelle) : un seul, en mémoire uniquement
  T = tripPreviewApply(T, now);
  T.sort((a, b) => a.dep < b.dep ? -1 : a.dep > b.dep ? 1 : a.src === 'work' ? -1 : 1);
  return DayContext.prioritize(T, appDay(), Date.now());
}
function renderBrfCore() {
  const el = $('#secBrf'); if (!el) return;
  const clockModel = (CX && CX.m) || M[S.locs[0].id] || Object.values(M).find(Boolean), cars = TCARS();
  if (!cars.length) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const now = DEMO.on && clockModel ? clockModel.nowStr.slice(0, 16) : nowIn(clockModel && clockModel.payload && clockModel.payload.timezone || 'Europe/Paris');
  const today = now.slice(0, 10), nowHm = now.slice(11, 16), T = APP_CONTEXT.snapshot.trips;
  const eve = toMin(nowHm) >= Math.min(18 * 60, appWorkOn(today) ? toMin(S.work.ret) : 1440);
  const fullFor = d => { const n = dayDiff(today, d.slice(0, 10)); return n <= 0 || (n === 1 && eve); };
  const dayLbl = d => { const n = dayDiff(today, d.slice(0, 10)); return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : fmtDay(d.slice(0, 10)); };
  const full = T.filter(t => fullFor(t.dep)), main = full[0], rest = full.slice(1);
  const wk = T.find(t => t.src === 'work'), ag = T.find(t => t.src === 'cal');
  const emo = t => t.res && t.res.every(r => carProfile(r.c).generic) ? '🧪' : t.worst == null ? (t.wait ? '⏳' : '·') : LV[t.worst].emoji;
  const tLine = t => `${emo(t)} <b>${dayDiff(today, t.dep) === 0 ? '' : dayLbl(t.dep) + ' · '}${t.originPending ? 'horaire à confirmer' : t.dep.slice(11, 16)}</b> · ${t.src === 'work' ? '🏁' : '📅'} ${esc(t.name)}`;
  const line = (k, v) => `<div class="brf-n"><span class="k">${k}</span><span>${v}</span></div>`;
  // trajet plus risqué que le prochain : mis en évidence même s'il vient après
  const crit = rest.filter(t => t.worst != null && t.worst >= 2 && t.worst > (main && main.worst != null ? main.worst : 0)).sort((a, b) => b.worst - a.worst)[0];
  // prochain risque : cherché sur les trajets réellement prévus (boulot + agenda), pas sur un lieu fixe
  const riskOf = t => { if (!t.res) return null; const s = t.sum, fb = frostBand(s.TrMin), top = t.res.reduce((a, r) => !a || r.w.level > a.w.level ? r : a, null);
    if (t.worst >= 2 && top && !carProfile(top.c).generic) { const pt = ((top.w.worst && top.w.worst.parts) || []).slice().sort((a, b) => b.v - a.v)[0]; return { lv: t.worst, why: `${top.c.short} ${LV[t.worst].name}${pt ? ' (' + pt.label + ')' : ''}` }; }
    if ((s.iceLevel || 0) >= 1) return { lv: Math.min(3, s.iceLevel + 1), why: `verglas ${ICE_LV[s.iceLevel].toLowerCase()}` };
    if (s.visMin != null && s.visMin < 1000) return { lv: s.visMin < 200 ? 3 : 2, why: `brouillard ${f0(s.visMin)} m` };
    if (fb && fb.lv >= 2) return { lv: fb.lv, why: `chaussée ${f1(s.TrMin)} °C (${fb.t.toLowerCase()})` };
    if (t.worst === 1 && top && !carProfile(top.c).generic) return { lv: 1, why: `${top.c.short} ${LV[1].name}` };
    return null; };
  const rk = T.filter(t => t !== main && t !== crit).map(t => ({ t, r: riskOf(t) })).find(o => o.r);
  const riskPending = PROFILE().generic || cars.some(car => carProfile(car).generic) ? '🧪 Aperçu générique · configure tes lieux et ta monte pour analyser tes trajets.'
    : !T.length ? 'Aucun trajet prévu à analyser.' : T.some(t => !t.res || !t.res.length || !t.sum) ? 'Données météo en attente pour analyser les trajets.' : '🟢 Aucun risque identifié sur les trajets prévus';
  const nrLine = line('Prochain risque sur mes trajets', rk ? `<span class="lv${rk.r.lv}"><b style="color:var(--lv-t)">${rk.r.lv >= 3 ? '🔴' : rk.r.lv >= 2 ? '🟠' : '🟡'} ${dayLbl(rk.t.dep)} ${rk.t.dep.slice(11, 16)}</b> · ${rk.t.src === 'work' ? '🏁' : '📅'} ${esc(rk.t.name)} · ${esc(rk.r.why)}</span>` : T.some(t => t.originPending) ? 'Analyse en attente pour les trajets recalculés.' : riskPending);
  const tail = `${crit ? `<div class="frost lv${crit.worst}"><b>${LV[crit.worst].emoji} Trajet le plus risqué : ${crit.dep.slice(11, 16)} · ${esc(crit.name)}</b><span>${crit.res.map(r => carProfile(r.c).generic ? `${esc(r.c.short)} : aperçu générique` : `${esc(r.c.short)} : ${LV[r.w.level].name} ${r.w.score}/100`).join(' · ')}</span></div>` : ''}
    ${rest.length ? line('Ensuite', rest.map(tLine).join('<br>')) : ''}
    ${wk && !full.includes(wk) ? line('Prochain trajet domicile-travail', `🏁 <b>${dayLbl(wk.dep)} · ${wk.dep.slice(11, 16)}</b> · ${cdSpan(wk.dep)}`) : ''}
    ${ag && !full.includes(ag) ? line('Prochain trajet agenda', `📅 <b>${dayLbl(ag.dep)} · ${ag.dep.slice(11, 16)}</b> · ${esc(ag.name)}`) : ''}
    ${nrLine}`;
  if (!main) {   // plus aucun trajet aujourd'hui : seulement des lignes discrètes vers la suite
    el.className = 'mod brf lv0';
    const msg = !CAL && !CALDONE && lsGet('twrc.key') ? '⏳ Lecture de l’agenda…' : `💤 ${appWorkOn(today) && wk && wk.dep.slice(0, 10) > today ? 'Plus de trajet prévu aujourd’hui' : 'Aucun trajet prévu aujourd’hui'}`;
    el.innerHTML = `${liveUndoHtml()}${tripCancelUndoHtml()}<div class="brf-h"><span class="brf-k">${msg}</span></div>${tail}`;
    return;
  }
  el.className = 'mod brf lv' + (main.res ? main.res[0].w.level : 0);
  el.innerHTML = liveUndoHtml() + tripCancelUndoHtml() + briefCard(main, dayLbl) + tail;
  if (main.res && !(LOCKED() && !lsGet('twrc.nocode'))) tripMapMount(main);   // pas de carte (ni d'appel externe) avant le déverrouillage
}
// « arrivée probable » : relevé frais et précis à ≤ 1,5 km de la destination, sans arrivée automatique (au-delà de 300 m, ou arrivée annulée)
function liveProbable(t) {
  if (!t || t.key !== LIVE.key || LIVE.near == null || LIVE.phase === 'advice' || !liveFresh(FIX, LIVE_AGE_RUN)) return null;
  return LIVE.near > LIVE_ARR_KM || LIVE.noAuto[t.key] > Date.now() ? Math.max(LIVE.near, 0.001) : null;
}
const liveUndoHtml = () => LIVE.lastDone && Date.now() - LIVE.lastDone.at < 10 * 60e3 ? `<div class="brf-why">✓ Arrivé · ${esc(LIVE.lastDone.name)} <button class="btn sm" data-act="trip-undo">Annuler l’arrivée</button></div>` : '';
const workCancelled = (date, state = TRIPCANCEL, now = Date.now()) => TripCancel.has(state, TripCancel.workId(date), now);
const calendarCancelled = (e, events = CAL && CAL.events || [e], state = TRIPCANCEL, now = Date.now()) => TripCancel.identifiable(events, e) && TripCancel.has(state, TripCancel.eventId(e), now);
let TRIPCANCELNOTICE = '';
function tripCancelSchedulePurge() {
  if (TRIPCANCELTIMER != null) { clearTimeout(TRIPCANCELTIMER); TRIPCANCELTIMER = null; }
  const exps = Object.values(TRIPCANCEL || {}).map(e => e && e.exp).filter(Number.isFinite);
  if (!exps.length) return;
  const delay = Math.max(1, Math.min(0x7fffffff, Math.min(...exps) - Date.now() + 25));
  TRIPCANCELTIMER = setTimeout(() => {
    TRIPCANCELTIMER = null;
    const before = Object.keys(TRIPCANCEL || {}).length;
    TRIPCANCEL = TripCancel.save(APP_STORAGE, TRIPCANCEL, Date.now());
    const changed = Object.keys(TRIPCANCEL || {}).length !== before;
    tripCancelSchedulePurge();
    if (changed) tripCancelChanged();
  }, delay);
}
const cancelAffectedDay = e => workCancelled(e.s.slice(0, 10), appCalendarCancelState()) || !!(CAL && CAL.events && CAL.events.some(other => other.s.slice(0, 10) === e.s.slice(0, 10) && (TripCancel.nonSpatialNeedsRebuild(other, calendarSpatial, calendarPlace) || calendarCancelled(other))));
function tripCancelButton(t) {
  const allowed = t && (t.src === 'cal' && t.e || t.src === 'work' && t.dep.slice(0, 10) === liveNow().slice(0, 10));
  return allowed ? `<button class="btn sm" data-act="trip-cancel" data-key="${esc(t.key)}">${t.src === 'work' ? '✕ Pas de trajet aujourd’hui' : '✕ Je n’y vais pas'}</button>` : '';
}
function tripCancelUndoHtml() {
  const entries = TripCancel.undoable(TRIPCANCEL, Date.now());
  const notice = TRIPCANCELNOTICE ? `<div class="brf-why" role="status">${esc(TRIPCANCELNOTICE)}</div>` : '';
  return notice + (entries.length ? `<div class="brf-why">Trajet annulé sur cet appareil. ${entries.map(e => `<button class="btn sm" data-act="trip-cancel-undo" data-id="${e.id}">Annuler l’annulation</button>`).join(' ')}<span class="sub">Les notifications cloud déjà planifiées peuvent encore arriver. Google Agenda conserve le programme d’origine.</span></div>` : '');
}
function tripCancelChanged() {
  const affected = t => {
    if (!t) return false;
    if (t.src === 'work') return workCancelled(t.dep.slice(0, 10));
    if (!t.e || !CAL || !CAL.events) return false;
    const e = CAL.events.find(e => e === t.e || TripCancel.eventId(e) === TripCancel.eventId(t.e));
    if (!e || !calendarSpatial(e) || calendarCancelled(e)) return true;
    const old = t.planL || t.l;
    const chains = TripCancel.rebuild(CAL.events, homeExact(), calDirectSet(), appCalendarCancelState(), Date.now(), { beforeFirst: tripCancelBeforeFirst, relevant: calendarSpatial, place: calendarPlace });
    const next = (chains.get(e) || []).find(l => l.k === (old && old.k));
    if (!old || !next || next.originUncertain) return true;
    const same = (a, b, privatePoint) => a && b && Number.isFinite(a.lat) && Number.isFinite(a.lon) && Number.isFinite(b.lat) && Number.isFinite(b.lon) && (privatePoint ? rc2(a.lat) === rc2(b.lat) && rc2(a.lon) === rc2(b.lon) : +a.lat.toFixed(3) === +b.lat.toFixed(3) && +a.lon.toFixed(3) === +b.lon.toFixed(3));
    return !same(old.from, next.from, old.fromKind === 'home' && next.fromKind === 'home' || old.fromKind === 'work' && next.fromKind === 'work') || !same(old.navTo || old.to, next.to, old.k === 'ret');
  };
  const resetLive = affected(LIVE.base), resetPreview = affected(TRIPPREVIEW.base);
  CANCELROUTEGEN++; CANCELROUTES.clear();
  if (resetLive) liveReset();
  if (resetPreview) tripPreviewReset();
  tripCancelSchedulePurge();
  renderAll();
}
function tripCancelStart(key) {
  const t = BRF_TRIPS.find(t => t.key === key); if (!t) return;
  const now = Date.now(); let id, exp;
  if (t.src === 'cal' && t.e) {
    if (!TripCancel.identifiable(CAL && CAL.events || [], t.e)) { TRIPCANCELNOTICE = 'Actualise l’agenda pour annuler séparément ces rendez-vous simultanés.'; renderBrf(); return; }
    id = TripCancel.eventId(t.e); exp = TripCancel.eventExpiration(t.e, now);
  }
  else if (t.src === 'work' && t.dep.slice(0, 10) === liveNow().slice(0, 10)) { id = TripCancel.workId(t.dep.slice(0, 10)); exp = TripCancel.workExpiration(t.dep.slice(0, 10), now); }
  else return;
  if (!window.confirm(t.src === 'work' ? 'Annuler les trajets aller et retour domicile-travail pour aujourd’hui sur cet appareil ?' : 'Annuler les trajets aller et retour de ce rendez-vous sur cet appareil ? Le rendez-vous reste dans Google Agenda.')) return;
  TRIPCANCELNOTICE = '';
  TRIPCANCEL = TripCancel.cancel(TRIPCANCEL, id, exp, now);
  try { TRIPCANCEL = TripCancel.save(APP_STORAGE, TRIPCANCEL, now); } catch (e) { /* état en mémoire */ }
  tripCancelChanged();
}
function tripCancelUndo(id) {
  if (!TripCancel.undoable(TRIPCANCEL, Date.now()).some(e => e.id === id)) return;
  TRIPCANCEL = TripCancel.undo(TRIPCANCEL, id, Date.now());
  try { TRIPCANCEL = TripCancel.save(APP_STORAGE, TRIPCANCEL, Date.now()); } catch (e) { /* état en mémoire */ }
  tripCancelChanged();
}
// navigation externe : Waze (lien universel), ouvert UNIQUEMENT par un geste de l'utilisateur. Seule la destination est transmise :
// Waze part lui-même de la position courante de l'appareil (aucune origine, aucune position GPS envoyée) ; rien n'est stocké.
const wazeUrl = p => p && p.lat != null && p.lon != null && isFinite(+p.lat) && isFinite(+p.lon) ? `https://waze.com/ul?ll=${+p.lat},${+p.lon}&navigate=yes` : null;
const wazeBtn = p => { const u = wazeUrl(p); return u ? `<a class="btn sm" href="${u}" target="_blank" rel="noopener noreferrer">🚙 Ouvrir dans Waze</a>` : ''; };
// domicile local EXACT (préréglage de l'appareil). Le relais n'a qu'un domicile arrondi à 0,01° (confidentialité des appels OSRM) :
// pour Waze, ouvert par l'utilisateur, un retour vise le vrai domicile. L'arrondi OSRM, le relais et l'agenda chiffré ne changent pas.
const homeExact = () => { const L = S.locs || [], h = L.find(l => l.id === 'home') || L[0]; return locHasCoords(h) ? h : null; };
const legNavTo = leg => leg && leg.k === 'ret' && !leg.destinationOverride ? (homeExact() || leg.to) : leg && (leg.navTo || leg.to);
// destination du trajet AFFICHÉ (vivant, adaptatif, agenda ou boulot) ; planL = trajet agenda d'origine d'un trajet vivant
const tripTo = t => t.src === 'cal' ? (t.planL || t.l || {}).k === 'ret' && !(t.planL || t.l || {}).destinationOverride ? homeExact() || (t.l && t.l.to) : legNavTo(t.l) : (t.td && t.td.LB) || (t.l && (t.l.navTo || t.l.to)) || null;
// départ déclaré / arrivée confirmée : actions globales du trajet (même automate, lues par tous les onglets)
const liveStartBtn = t => !DEMO.on && !t.running && t.live !== 'active' && !t.manualPreview && !t.manualReturn && LIVE.phase !== 'active' && liveDest(t) ? `<button class="btn sm" data-act="trip-start" data-key="${esc(t.key)}">🚗 Je pars maintenant</button>` : '';
const liveArrBtn = t => (t.running || t.live === 'active') && LIVE.key === t.key ? `<button class="btn sm" data-act="trip-arrived">✅ Bien arrivé</button>` : '';
// Loi Montagne (audit A05) : même règle pour domicile-travail, agenda et trajet manuel, au départ comme à l'arrivée.
// Département ou altitude = vigilance ; seule la commune fixée par arrêté préfectoral fait foi, avec lien vers la liste officielle.
const placeElev = p => { const m = p && p.id && M[p.id]; return m && m.payload ? num(m.payload.elevation) : null; };
function montNoteHtml(list, dep, car) {
  if (!list.length) return '';
  const inSeason = list.some(o => o.mc.season), ss = montagneSeason(dep), effT = car ? effType(car) : null;
  const carTxt = !car ? '' : effT === 'summer' ? ` ${esc(car.short)} en pneus ${TYPE_LABEL[car.tire.type]} : prévois chaînes ou chaussettes.` : ` ${esc(car.short)} : conforme si le marquage 3PMSF est présent.`;
  return `<div class="note lv${inSeason ? 2 : 1}" data-k="mont"><b>🏔️ LOI MONTAGNE · VIGILANCE</b><span>${list.map(o => esc(montagneWhy(o.mc, (o.role ? o.role + ' · ' : '') + o.name))).join(' ; ')}. Du 1er novembre au 31 mars, pneus 3PMSF ou chaînes / chaussettes obligatoires seulement dans les communes fixées par arrêté préfectoral : <a href="${MONT_SRC.communes}" target="_blank" rel="noopener noreferrer">vérifier la commune</a>${inSeason ? '' : ' (période pas encore commencée à cette date)'}.${carTxt}</span><span class="sub">Source : ${esc(MONT_SRC.text)} · <a href="${MONT_SRC.url}" target="_blank" rel="noopener noreferrer">service-public.gouv.fr</a>${ss.note ? ' · ' + esc(ss.note) : ''}</span></div>`;
}
function tripMontagneHtml(t, car) {
  const ends = [['Départ', t.td ? t.td.LA : t.l && t.l.from, t.td ? t.fromName || t.td.fromName : t.l && t.l.from && t.l.from.name], ['Arrivée', tripTo(t), t.td ? t.td.toName : (tripTo(t) || {}).name]];
  const seen = new Set(), list = [];
  ends.forEach(([role, p, name]) => {
    if (!p || !locHasCoords(p)) return; const k = (+p.lat).toFixed(3) + ',' + (+p.lon).toFixed(3); if (seen.has(k)) return; seen.add(k);
    const mc = t.td && role === 'Arrivée' && t.td.mont ? t.td.mont : montagneInfo(p, t.dep || '', placeElev(p));
    if (mc.concerned) list.push({ role, name: name || p.name || 'lieu', mc });
  });
  return montNoteHtml(list, t.dep || '', car);
}
// carte de briefing complète, identique pour un trajet domicile-travail et un trajet agenda
function briefCard(t, dayLbl) {
  if (t.destinationPending || t.l && t.l.destinationOverride && !t.l.to) return `<div class="brf-h"><span class="brf-k">${APP_CONTEXT.snapshot.status === 'travel' ? '🚗 En trajet' : '🏁 Prochain trajet'}</span></div><div class="brf-ev"><b>${esc(t.from || 'Origine à confirmer')} → Destination à confirmer</b></div><p class="brf-why" role="status">Choisis la destination dans Aujourd’hui pour calculer le trajet.</p>`;
  const src = t.customRoute || t.src === 'local' ? 'trajet choisi' : t.src === 'work' ? 'domicile-travail' : 'agenda';
  if (t.l && t.l.originPending) return `<div class="brf-h"><span class="brf-k">🏁 Prochain trajet · ${src}</span></div><div class="brf-ev">📅 <b>${esc(t.name)}</b></div><p class="brf-why" role="status">${t.l.originRecalc ? '📍 Départ confirmé : ' + esc(t.l.originName) + ' · recalcul de la route, de l’heure de départ et de la météo en cours. Ancien trajet invalidé.' : 'Origine à confirmer après annulation du trajet précédent'}</p><div class="cal-v">${tripCancelButton(t)}</div>`;
  const head = `<div class="brf-h">${t.manualPreview ? `<span class="brf-k">📍 Aperçu depuis ma position · ${src}</span><span class="brf-w">${dayLbl(t.dep)} · départ estimé <b>${t.previewDep.slice(11, 16)}</b> · arrivée estimée ${t.previewArr.slice(11, 16)}</span>`
    : t.live === 'active' ? `<span class="brf-k">🏎️ Trajet en cours · ${src}</span><span class="brf-w">${f0(t.l.km)} km restants · ${t.l.min} min · arrivée estimée <b>${t.arr.slice(11, 16)}</b></span>`
    : t.manualReturn ? `<span class="brf-k">🏠 Retour maison demandé · ${src}</span><span class="brf-w">départ maintenant · le trajet passe « en cours » uniquement après mouvement confirmé</span>`
    : t.live === 'late' && t.adv ? `<span class="brf-k">⏱ Départ conseillé dépassé · ${src}</span><span class="brf-w">arrivée estimée <b>${t.arr.slice(11, 16)}</b> · ${liveMin(t.adv.target, t.arr) > 0 ? `retard estimé +${Math.round(liveMin(t.adv.target, t.arr))} min` : `dans les temps (cible ${t.adv.target.slice(11, 16)})`}</span>`
    : t.live === 'late' ? `<span class="brf-k">⏱ Départ prévu dépassé · ${src}</span><span class="brf-w">prévu ${t.planDep.slice(11, 16)} · itinéraire depuis ma position</span>`
    : t.adv && (t.live === 'imminent' || t.live === 'advice') ? `<span class="brf-k">🏁 Prochain trajet · ${src}</span><span class="brf-w">${dayLbl(t.dep)} · départ conseillé <b>${t.adv.dep.slice(11, 16)}</b> · arrivée cible ${t.adv.target.slice(11, 16)} · ${cdSpan(t.adv.dep)}</span>`
    : t.running ? `<span class="brf-k">🏎️ Trajet en cours · ${src}</span><span class="brf-w">parti à ${t.dep.slice(11, 16)} · arrivée prévue <b>${(t.arr || '').slice(11, 16)}</b></span>`
    : `<span class="brf-k">🏁 Prochain trajet · ${src}</span><span class="brf-w">${dayLbl(t.dep)} · ${t.dep.slice(11, 16)} → ${(t.arr || '').slice(11, 16)} · ${cdSpan(t.dep)}</span>`}</div>
    <div class="brf-ev">${t.src === 'cal' ? '📅' : '🏁'} <b>${esc(t.name)}</b>${t.l ? ` · ${f0(t.l.km)} km · ${t.l.min} min${t.live ? ' depuis ici' : ''}${t.l.routed ? ' · route analysée' : ' (estimé)'}` : ''}</div>
    ${tripOriginHtml(t)}<div class="cal-v">${tripCancelButton(t)}${returnHomeButtonForTrip(t)}${liveStartBtn(t)}${placeArriveBtn(t) || liveArrBtn(t)}</div>${liveProbable(t) ? `<div class="frost lv1"><b>🟡 Arrivée probable</b><span>Tu es à ~${liveProbable(t) < 1 ? Math.round(liveProbable(t) * 1000) + ' m' : f1(liveProbable(t)) + ' km'} de la destination (lieu de l’agenda peut-être approximatif). <button class="btn sm" data-act="trip-arrived">✓ Je suis arrivé</button></span></div>` : ''}${t.gpsTxt ? `<div class="brf-why">${esc(t.gpsTxt)}</div>` : t.liveLost ? '<div class="brf-why">📍 Suivi GPS indisponible · trajet planifié affiché</div>' : ''}`;
  if (!t.res) return head + `<p class="muted">${appActiveCar() && !hasTires(appActiveCar()) ? 'Pneus de la voiture active à renseigner.' : t.wait ? '⏳ Analyse météo de la route en cours…' : 'Météo de la route indisponible pour l’instant.'}</p>${wazeBtn(tripTo(t)) ? `<div class="cal-v">${wazeBtn(tripTo(t))}</div>` : ''}`;
  const sum = t.sum, top = t.res[0], lv = top.w.level, xs = t.seq.map(q => q.hs[q.i]), genP = carProfile(top.c), genTop = genP.generic ? genP : null;
  // cockpit : données jugées dégradées par la synthèse → verdict pneus indicatif, jamais un feu vert affiché comme acquis
  const confD = DECISION_LAST && DECISION_LAST.confidence, indic = !genTop && !!confD && confD.level >= 2;
  const ppMax = Math.max(...xs.map(x => x.pp || 0)), Pmax = Math.max(...xs.map(x => x.P || 0));
  const parts = ((top.w.worst && top.w.worst.parts) || []).slice().sort((a, b) => b.v - a.v).slice(0, 2).map(p => p.label);
  const fb = frostBand(sum.TrMin), ob = t.obs;
  const k = (lbl, v, unit, tag, cls) => `<div class="kpi ${cls || ''}"><span class="k">${lbl}<i class="tag ${tag}">${tag === 'est' ? 'estimé' : tag === 'obs' ? 'mesuré' : 'prévu'}</i></span><span class="v num">${v}<small>${unit}</small></span></div>`;
  const deg = v => v == null ? '—' : String(Math.round(v)).replace('-', '−') + '°';
  const visV = v => v == null ? '—' : v >= 10000 ? '>10' : v >= 1000 ? f0(v / 1000) : f0(v), visU = v => v == null ? '' : v >= 1000 ? 'km' : 'm';
  const iceS = ['Faible', 'Modéré', 'Élevé', 'Max'];
  const tr = trendOf(t.key, t.planDep || t.dep, snapOf(t.res, sum, t.seq)), cr = t.crit;
  const mOpen = lsGet('twrc.tripmap') === '1';
  return head + `
    ${genTop ? genericNote(genTop.gaps) : ''}
    <div class="brf-m hasmap">${genTop ? gaugeSvg(null, 'x') : gaugeSvg(top.w.score, indic ? 'x' : lv)}
      <div class="brf-v"><span class="brf-lv">${genTop ? '🧪 APERÇU' : indic ? '◌ INDICATIF · ' + LV[lv].name : LV[lv].emoji + ' ' + LV[lv].name}</span>
        <span class="brf-car">${esc(top.c.short)} · ${esc(TYPE_LABEL[effType(top.c)] || '')}</span>
        <span class="brf-why">${indic ? `Données ${esc(confD.label.toLowerCase())} : ${esc(confD.reason)} · ` : ''}${parts.length ? 'Points d’attention : ' + parts.map(esc).join(' · ') : genTop ? 'Aucune pénalité dans cet exemple de calcul' : indic ? 'aucune pénalité calculée' : '✓ Pneus actuels adaptés au trajet'}</span>
        ${t.res.slice(1).map(r => carProfile(r.c).generic ? `<span class="brf-why">🧪 ${esc(r.c.short)} : aperçu</span>` : `<span class="brf-why">${LV[r.w.level].emoji} ${esc(r.c.short)} : ${LV[r.w.level].name} ${r.w.score}/100</span>`).join('')}</div>
      <div class="brf-map" id="tmapW"></div></div>
    <div class="kpis">
      ${k('Route', deg(sum.TrMin), '±2', 'est', fb ? 'lv' + fb.lv : '')}
      ${k('Air', deg(sum.Tmin), '', 'prev')}
      ${k('Pluie', Pmax >= 0.1 ? f1(Pmax) : f0(ppMax), Pmax >= 0.1 ? 'mm' : '%', 'prev', Pmax >= 2 ? 'lv2' : '')}
      ${k('Verglas', iceS[Math.min(3, sum.iceLevel || 0)], '', 'est', (sum.iceLevel || 0) >= 1 ? 'lv' + Math.min(3, sum.iceLevel + 1) + ' wd' : 'wd')}
      ${k('Visib.', visV(sum.visMin), visU(sum.visMin), 'prev', (sum.visMin != null && sum.visMin < 1000 ? 'lv2' : ''))}
    </div>
    ${fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t}</b><span>${fb.d}</span></div>` : ''}
    ${briefThermalHtml(t, top.c)}
    ${tripMontagneHtml(t, top.c)}
    ${cr && cr.q.f > 0 && cr.q.f < 1 && cr.sc >= 20 ? `<div class="brf-why">📍 Point le plus délicat : km ${f0(cr.q.f * t.l.km)}${cr.q.name ? ' (' + esc(cr.q.name) + ')' : ''} vers ${cr.q.t.slice(11, 16)}</div>` : ''}
    ${ob && ob.T != null ? `<div class="brf-obs"><i class="tag obs">mesuré</i> ${esc(ob.name)} · ${new Date(ob.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} · <b>${f1(ob.T)} °C</b>${ob.vis != null && ob.vis < 5000 ? ' · visibilité ' + ob.vis + ' m' : ''}${ob.wx ? ' · ' + esc(wxFr(ob.wx)) : ''}</div>` : ''}
    <div class="brf-t">${trendHtml(tr)}</div>
    <div class="cal-v"><button class="btn sm brf-mapt" data-act="tripmap" aria-expanded="${mOpen}">🗺️ ${mOpen ? 'Masquer le trajet ▴' : 'Voir le trajet ▾'}</button>${wazeBtn(tripTo(t))}</div>
    <div class="brf-mapm" id="tmapM" ${mOpen ? '' : 'hidden'}></div>`;
}

/* ---------- mini-carte du prochain trajet (Leaflet chargé seulement quand la carte est visible) ---------- */
const TMAP = { node: null, map: null, key: '' };
const wideScreen = () => matchMedia('(min-width: 760px)').matches;
const rc2 = v => Math.round(v * 100) / 100;   // domicile et travail arrondis à ~1 km avant tout appel externe
async function tripGeo(t) {
  if (t.src === 'cal' || t.src === 'local' || t.live || t.manualPreview) {   // route agenda/locale, vivante ou aperçu : mémoire uniquement
    const P = legPoints(t.l), pts = t.l.g && t.l.g.length > 1 ? t.l.g : P.map(p => [p.lat, p.lon]), cr = t.crit;
    // point critique : seulement en cas de vrai risque (verdict orange ou rouge, verglas, brouillard)
    const cp = cr && (cr.lv >= 2 || cr.ice >= 1 || cr.fog) && P[cr.q.k] ? { at: [P[cr.q.k].lat, P[cr.q.k].lon], lv: Math.max(2, cr.lv), t: cr.q.t } : null;
    return { pts, est: !(t.l.g && t.l.g.length > 1), crit: cp };
  }
  const td = t.td, a = [rc2(td.LA.lat), rc2(td.LA.lon)], b = [rc2(td.LB.lat), rc2(td.LB.lon)], k = a.join(',') + ';' + b.join(',');
  let C = {}; try { C = JSON.parse(lsGet('twrc.croute') || '{}'); } catch (e) { C = {}; }
  if (C[k]) return { pts: C[k], est: false, crit: null };
  try {
    const j = await fetchJSON(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=simplified&geometries=geojson`, 10000);
    const co = j && j.routes && j.routes[0] && j.routes[0].geometry.coordinates;
    if (co && co.length > 1) { const st = Math.max(1, Math.ceil(co.length / 120)), g = co.filter((c, i) => i % st === 0 || i === co.length - 1).map(c => [+c[1].toFixed(3), +c[0].toFixed(3)]);
      lsSet('twrc.croute', JSON.stringify({ [k]: g })); return { pts: g, est: false, crit: null }; }
  } catch (e) { /* itinéraire indisponible : tracé estimé */ }
  return { pts: [a, ...(td.mids || []).map(p => [p.lat, p.lon]), b], est: true, crit: null };
}
function tripMapMount(t) {
  const wide = wideScreen(), slot = wide ? $('#tmapW') : lsGet('twrc.tripmap') === '1' ? $('#tmapM') : null;
  if (!slot) return;
  const key = `${t.key}|${t.worst}|${t.live ? 'L' + t.liveGen : t.manualPreview ? 'P' + t.previewGen : ''}|${wide ? 'w' : 'm'}`;
  if (TMAP.node && TMAP.key === key) { slot.appendChild(TMAP.node); if (TMAP.map) { const map = TMAP.map; setTimeout(() => { if (TMAP.map === map) map.invalidateSize(); }, 0); } return; }
  if (TMAP.map) { try { TMAP.map.remove(); } catch (e) { /* déjà retirée */ } TMAP.map = null; }
  const node = document.createElement('div'); node.className = 'tmap'; node.setAttribute('role', 'img'); node.setAttribute('aria-label', `Carte du trajet ${t.from} → ${t.to}`);
  slot.appendChild(node); TMAP.node = node; TMAP.key = key;
  tripGeo(t).then(geo => loadLeaflet().then(() => { if (TMAP.node === node) drawTripMap(node, t, geo); }))
    .catch(() => { if (TMAP.node === node) node.innerHTML = '<div class="tmap-b">Carte indisponible</div>'; });
}
function drawTripMap(node, t, geo) {
  const d = !isLight(), E = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_' + (d ? 'Dark' : 'Light') + '_Gray_';
  const map = L.map(node, { zoomControl: false, scrollWheelZoom: false, dragging: !L.Browser.mobile, keyboard: false, attributionControl: true });
  map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none';
  const base = L.tileLayer(E + 'Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13, attribution: '© Esri · © OpenStreetMap · Itinéraire © OSRM' }).addTo(map);
  L.tileLayer(E + 'Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13, pane: 'labels' }).addTo(map);
  let ok = 0, bad = 0; base.on('tileload', () => ok++);
  base.on('tileerror', () => { if (++bad >= 3 && !ok && !map._osm) { map._osm = 1; L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 13, className: d ? 'osm-dark' : '', attribution: '© OpenStreetMap · Itinéraire © OSRM' }).addTo(map); } });
  const cs = getComputedStyle($('#secBrf')), col = (cs.getPropertyValue('--lv-t') || cs.getPropertyValue('--accent') || '#2ecc71').trim();
  const line = L.polyline(geo.pts, { color: col, weight: 4, opacity: .95, dashArray: geo.est ? '6 7' : null }).addTo(map);
  const a = geo.pts[0], b = geo.pts[geo.pts.length - 1];
  L.circleMarker(a, { radius: 5, color: '#fff', weight: 2, fillColor: '#0b0f14', fillOpacity: 1 }).addTo(map).bindTooltip('Départ · ' + t.from);
  L.circleMarker(b, { radius: 6, color: col, weight: 2, fillColor: col, fillOpacity: .9 }).addTo(map).bindTooltip('Arrivée · ' + t.to);
  if (geo.crit) {
    const cc = (cs.getPropertyValue(geo.crit.lv >= 3 ? '--nogo-t' : '--risk-t') || (geo.crit.lv >= 3 ? '#e74c3c' : '#f39c12')).trim();
    L.circleMarker(geo.crit.at, { radius: 8, color: cc, weight: 3, fillColor: cc, fillOpacity: .35 }).addTo(map).bindTooltip('Point le plus délicat vers ' + geo.crit.t.slice(11, 16));
  }
  map.fitBounds(line.getBounds(), { padding: [16, 16] });
  node.insertAdjacentHTML('beforeend', `<div class="tmap-b">${t.worst != null ? LV[t.worst].emoji : '·'}${geo.est ? ' tracé estimé' : ''}</div>`);
  TMAP.map = map;
}


/* ---------- agenda Google : trajets des rendez-vous (fichier chiffré publié par le relais) ---------- */
let CAL = null, CALDONE = false; const CALM = {}, CALBUSY = new Set();   // CALDONE : première lecture de l'agenda terminée (avec ou sans agenda)
const CAL_CACHE_KEY = 'twrc.calendar.sealed.v1';
function calendarSealedCache() {
  try { const x = JSON.parse(lsGet(CAL_CACHE_KEY) || 'null'); return x && x.sealed && x.sealed.c && Date.now() - x.t < 9 * 24 * 3600e3 ? x : null; }
  catch (e) { return null; }
}
async function openSealed(S0, pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(S0.s), iterations: S0.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(S0.i) }, key, b64(S0.c))));
}
async function loadCalendar() {
  const pass = lsGet('twrc.key'); if (!pass || location.protocol !== 'https:' || !crypto.subtle) return;
  let S0 = null, fallback = null;
  try {
    S0 = await fetchJSON(dataUrl('calendar.sealed.json') + '?t=' + Math.floor(Date.now() / 300e3), 8000);
  } catch (e) {
    fallback = calendarSealedCache(); S0 = fallback && fallback.sealed;
  }
  try {
    if (!S0 || !S0.c) return;
    const cached = offlineNow() || !!fallback;
    // Le cache chiffré n'est remplacé qu'après un déchiffrement réussi : un fichier corrompu ne détruit jamais le dernier agenda valide.
    const keep = () => { if (!fallback) lsSet(CAL_CACHE_KEY, JSON.stringify({ t: Date.now(), sealed: S0 })); };   // chiffré uniquement
    if (CAL && CAL.c === S0.c) {
      keep(); CAL.offline = cached; CAL.cacheAt = fallback ? fallback.t : Date.now(); CALDONE = true; renderCal(); renderBrf(); renderTenue(); return;
    }
    const d = await openSealed(S0, String(pass).trim().toLowerCase());
    // une copie plus ancienne (cache CDN, réponse tardive) n'écrase jamais un agenda plus récent
    if (CAL && CAL.updated && d.updated && Date.parse(d.updated) < Date.parse(CAL.updated)) return;
    keep();
    CAL = { ...d, c: S0.c, offline: cached, cacheAt: fallback ? fallback.t : Date.now() };
    CALDONE = true; renderCal(); renderBrf(); renderTenue();
  } catch (e) { /* code différent ou cache illisible */ }
  finally { if (!CALDONE) { CALDONE = true; renderBrf(); } }
}
// Météo des lieux d'agenda et points de route : modèle horaire réutilisé pendant 25 min ; cockpit et observations restent à 5 min.
const PT_TTL = 25 * 60e3;
async function calModel(ev) {
  if (!calendarSpatial(ev) || !locHasCoords(ev)) return null;
  const id = 'cal' + ev.lat.toFixed(2) + '_' + ev.lon.toFixed(2);
  if (CALM[id] && Date.now() - CALM[id].t < PT_TTL) return CALM[id].m;
  if (CALBUSY.has(id)) return null; CALBUSY.add(id);
  try { const p = await fetchJSON(`${API}?latitude=${ev.lat}&longitude=${ev.lon}&hourly=${Q_HR}&daily=${Q_DY}&timezone=auto&past_days=1&forecast_days=10`, 12000); const bad = validForecast(p); if (bad) throw new Error(bad); CALM[id] = { t: Date.now(), m: makeModel(p, 'live', { id, lat: ev.lat, lon: ev.lon, name: ev.label || ev.loc }) }; }
  catch (e) { CALM[id] = { t: Date.now() - PT_TTL + 10 * 60e3, m: null }; }
  CALBUSY.delete(id); renderCal(); renderTenue(); return CALM[id].m;
}
function calTrip(ev) {
  const home = M[S.locs[0].id]; if (!calendarSpatial(ev) || !home || !locHasCoords(S.locs[0]) || !locHasCoords(ev)) return null;
  const km = distKm(S.locs[0], ev), rawDur = km * 1.3 / (km < 25 ? 55 : km < 60 ? 70 : 90) * 60, dur = routeTravelMin(rawDur, 10);
  if (km < 3) return { km, near: true };
  const id = 'cal' + ev.lat.toFixed(2) + '_' + ev.lon.toFixed(2), B = CALM[id] && CALM[id].m;
  if (!B) { if (!CALM[id]) calModel(ev); return { km, dur, loading: true }; }
  const startMin = ev.allDay ? toMin('09:00') : toMin(ev.s.slice(11, 16)), day = ev.s.slice(0, 10);
  const dep = addMin(day + 'T00:00', startMin - dur - 10), arr = addMin(dep, dur), seq = [];
  for (let t = dep.slice(0, 13) + ':00'; t <= arr.slice(0, 13) + ':00'; t = addMin(t, 60)) { const a = home.byTime.get(t), b = B.byTime.get(t); if (a != null) seq.push({ hs: home.hs, i: a }); if (b != null) seq.push({ hs: B.hs, i: b }); }
  if (!seq.length) return { km, dur, dep, beyond: true };
  const res = appTripCars().map(c => ({ c, w: windowAssess(c, seq, 'trip') })).filter(r => r.w);
  return { km, dur, dep, arr, sum: summarize(seq), res: res.length ? res : null, worst: res.length ? res.reduce((m, r) => Math.max(m, r.w.level), 0) : null };
}

// trajets calculés par le relais (itinéraire routier, aller / retour, enchaînement) : météo aux points de passage
const LEGM = {}, LEGBUSY = new Set();
const legKey = leg => legPoints(leg).map(p => (+p.lat).toFixed(2) + ',' + (+p.lon).toFixed(2)).join(';');
async function fetchLeg(leg) {
  const k = legKey(leg); if (LEGBUSY.has(k)) return; LEGBUSY.add(k);
  const pts = legPoints(leg);
  try {
    let js = await fetchJSON(`${API}?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}&hourly=${Q_HR}&timezone=Europe%2FParis&past_days=1&forecast_days=10`, 15000);
    if (!Array.isArray(js)) js = [js];
    LEGM[k] = { t: Date.now(), models: js.map((p, i) => { try { return validForecast(p) ? null : makeModel(p, 'live', pts[i]); } catch (e) { return null; } }) };
  } catch (e) { LEGM[k] = { t: Date.now() - PT_TTL + 10 * 60e3, models: null }; }
  LEGBUSY.delete(k); clearTimeout(fetchLeg.t); fetchLeg.t = setTimeout(() => { renderCal(); renderBrf(); renderTenue(); }, 150);
}
function legEval(leg) {
  if (leg.originPending || !locHasCoords(leg.from) || !locHasCoords(leg.to)) return { loading: true, originPending: true };
  const k = legKey(leg), c = LEGM[k];
  if (!c || Date.now() - c.t > PT_TTL) { fetchLeg(leg); if (!c) return { loading: true }; }
  if (!c.models) return { err: true };
  const seq = legSeq(c.models, legPoints(leg), leg.dep, leg.min); if (!seq.length) return { beyond: true };
  const res = appTripCars().map(car => ({ c: car, w: windowAssess(car, seq, 'trip') })).filter(r => r.w);
  return { seq, sum: summarize(seq), res: res.length ? res : null, worst: res.length ? res.reduce((m, r) => Math.max(m, r.w.level), 0) : null, crit: legCritical(seq, appTripCars()) };
}
function calDirectSet() { return S.calDirect || {}; }
const CANCELROUTES = new Map(); let CANCELROUTEGEN = 0;
function tripCancelBeforeFirst(e, settings = S, state = TRIPCANCEL, now = Date.now()) {
  const locs = [...(settings.locs || []), ...(settings.customs || [])];
  const home = locs.find(l => l.id === 'home') || (settings.locs || [])[0], work = settings.work || {}, date = e.s.slice(0, 10);
  const valid = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const homePoint = valid(home) ? { ...home, label: 'Domicile', city: 'Domicile' } : null;
  const real = settings === S && date === placeToday() && e.s >= liveNow() ? appRealOrigin(date) : null;
  if (real) return { ...real, label: real.name, city: real.name };
  if (!appWorkOn(date, work.days) || workCancelled(date, state, now)) return homePoint;
  const dep = date + 'T' + work.dep, ret = date + 'T' + work.ret, duration = +work.durMin || 30;
  const target = e.allDay ? date + 'T09:00' : e.s;
  if (target < dep || target >= addMin(ret, duration)) return homePoint;
  if (target < addMin(dep, duration) || target >= ret) return null;
  const loc = locs.find(l => l.id === work.to);
  return valid(loc) ? { ...loc, kind: 'work', label: loc.name || 'Travail', city: loc.name || 'Travail' } : null;
}
const tripCancelRouteKey = (e, leg) => JSON.stringify([TripCancel.eventId(e), leg.k, leg.from, leg.to, leg.dep, leg.targetArr]);
function manualRouteCacheKey(leg) {
  if (!leg || !leg.manual || !locHasCoords(leg.from) || !locHasCoords(leg.to)) return null;
  const p = x => (+x.lat).toFixed(3) + ',' + (+x.lon).toFixed(3);
  return 'manual|' + p(leg.from) + '>' + p(leg.to);
}
function manualRouteCacheRead(leg) {
  const key = manualRouteCacheKey(leg); if (!key) return null;
  let C = {}; try { C = JSON.parse(lsGet('twrc.croute') || '{}'); } catch (e) { return null; }
  const r = C[key];
  return r && Number.isFinite(r.km) && Number.isFinite(r.min) && Array.isArray(r.g) && r.g.length > 1 ? r : null;
}
function manualRouteCacheWrite(leg, route) {
  const key = manualRouteCacheKey(leg); if (!key || !route) return;
  let C = {}; try { C = JSON.parse(lsGet('twrc.croute') || '{}'); } catch (e) { C = {}; }
  const oldManual = Object.keys(C).filter(k => k.startsWith('manual|')).sort((a, b) => (C[b].at || 0) - (C[a].at || 0));
  oldManual.slice(7).forEach(k => delete C[k]);
  C[key] = { at: Date.now(), km: route.km, min: route.min, pts: (route.pts || []).slice(0, 8), g: (route.g || []).slice(0, 100) };
  lsSet('twrc.croute', JSON.stringify(C));
}
function tripCancelReadyLeg(e, leg) {
  const entry = CANCELROUTES.get(tripCancelRouteKey(e, leg));
  return entry && entry.phase === 'ready' ? entry.leg : null;
}
function tripCancelRouteLeg(e, leg) {
  const point = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!point(leg.from) || !point(leg.to)) return { ...leg, from: null, min: null, km: null, pts: [], g: [], routed: false, originPending: true, originUncertain: true };
  const roundPoint = p => p.id === S.locs[0].id || p.id === S.work.from || p.id === S.work.to || p.label === 'Domicile' ? { lat: rc2(p.lat), lon: rc2(p.lon) } : { lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3) };
  if (!leg.originPending) return { ...leg, from: { ...leg.from, ...roundPoint(leg.from) }, to: { ...leg.to, ...roundPoint(leg.to) }, navTo: leg.navTo || { ...leg.to }, pts: (leg.pts || []).map(p => ({ ...p, lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3) })), g: (leg.g || []).map(p => [+p[0].toFixed(3), +p[1].toFixed(3)]) };
  if (leg.originUncertain) return leg;
  const a = roundPoint(leg.from), b = roundPoint(leg.to), cached = leg.manual ? manualRouteCacheRead(leg) : null;
  if (leg.manual && offlineNow()) {
    return cached ? { ...leg, ...cached, from: { ...leg.from, ...a }, to: { ...leg.to, ...b }, navTo: { ...leg.to }, dep: leg.dep, arr: addMin(leg.dep, cached.min), routed: true, cachedRoute: true, originPending: false }
      : { ...leg, from: { ...leg.from, ...a }, to: { ...leg.to, ...b }, navTo: { ...leg.to }, min: null, km: null, pts: [], g: [], routed: false, routeOffline: true, originPending: true };
  }
  const key = tripCancelRouteKey(e, leg);
  let entry = CANCELROUTES.get(key);
  if (!entry) {
    const gen = CANCELROUTEGEN; entry = { phase: 'loading', leg: null }; CANCELROUTES.set(key, entry);
    fetchJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&annotations=duration`, 10000)
      .then(j => {
        if (gen !== CANCELROUTEGEN || !e.manual && calendarCancelled(e)) return;
        const route = liveParse(j); if (!route) throw new Error('itinéraire vide');
        const routeMin = routeTravelMin(route.rawMin ?? route.min, leg.k === 'go' && leg.targetArr ? 10 : 0);
        const dep = leg.k === 'go' && leg.targetArr ? addMin(leg.targetArr, -routeMin) : leg.dep;
        entry.leg = { ...leg, ...route, min: routeMin, from: { ...leg.from, ...a }, to: { ...leg.to, ...b }, navTo: { ...leg.to }, dep, arr: addMin(dep, routeMin), routed: true, byTime: true, rebuilt: true };
        delete entry.leg.originPending; delete entry.leg.originUncertain; delete entry.leg.rebuildFrom;
        if (leg.manual) manualRouteCacheWrite(leg, entry.leg);
        entry.phase = 'weather'; renderCal(); renderBrf(); renderTenue();
      })
      .catch(() => {
        if (gen !== CANCELROUTEGEN) return;
        const old = leg.manual ? manualRouteCacheRead(leg) : null;
        if (old) {
          entry.leg = { ...leg, ...old, from: { ...leg.from, ...a }, to: { ...leg.to, ...b }, navTo: { ...leg.to }, dep: leg.dep, arr: addMin(leg.dep, old.min), routed: true, cachedRoute: true };
          delete entry.leg.originPending; entry.phase = 'weather';
        } else entry.phase = 'error';
        renderCal(); renderBrf(); renderTenue();
      });
  }
  if (entry.leg && legEval(entry.leg).sum) { entry.phase = 'ready'; return entry.leg; }
  // Ne pas exposer une ancienne route ou une nouvelle heure tant que route ET météo ne sont pas prêtes.
  return { ...leg, from: null, min: null, km: null, pts: [], g: [], routed: false, originPending: true };
}
function effLegs(e, all) {
  if (!calendarSpatial(e) || calendarCancelled(e)) return [];
  if (cancelAffectedDay(e)) {
    const chains = TripCancel.rebuild(CAL.events, homeExact(), calDirectSet(), appCalendarCancelState(), Date.now(), { beforeFirst: tripCancelBeforeFirst, relevant: calendarSpatial, place: calendarPlace });
    return (chains.get(e) || chains.get(TripCancel.eventId(e)) || []).map(leg => tripCancelRouteLeg(e, appAgendaLeg(e, leg)));
  }
  const D = calDirectSet(); let legs = (e.legs || []).slice();
  // le retour maison d'un rendez-vous disparaît si le suivant est enchaîné directement
  legs = legs.filter(l => !(l.k === 'ret' && l.brk && D[l.brk]));
  if (e.alt && D[e.alt.key]) legs = legs.map(l => l.k === 'go' && l.brk === e.alt.key ? { ...e.alt.direct, chosen: true } : l);
  return legs.map(l => { const effective = appAgendaLeg(e, l); return effective === l ? l : tripCancelRouteLeg(e, effective); });
}
function altHtml(e) {
  if (cancelAffectedDay(e)) return '';
  if (e.mode === 'conflit') return '<div class="alt"><span class="sub">⚠️ <b>#maison</b> et <b>#direct</b> sont tous les deux dans ce rendez-vous : règle par défaut appliquée. Garde un seul mot-clé.</span></div>';
  if (e.mode === 'direct' || e.mode === 'maison') return `<div class="alt"><span class="sub">📌 Selon ton agenda (<b>#${e.mode}</b>) : ${e.mode === 'direct' ? 'enchaîné directement depuis le rendez-vous précédent' : 'retour maison avant ce rendez-vous'}. Appli et notifications suivent ce choix.</span></div>`;
  if (!e.alt || !e.alt.direct) return '';
  const on = !!calDirectSet()[e.alt.key], d = e.alt.direct, v = e.alt.viaHome, dk = v.km - d.km, dm = v.min - d.min;
  const cmp = `Retour maison : ${f0(v.km)} km · ${v.min} min · Direct : ${f0(d.km)} km · ${d.min} min (${dk >= 0 ? '−' : '+'}${f0(Math.abs(dk))} km, ${dm >= 0 ? '−' : '+'}${Math.abs(dm)} min)`;
  return `<div class="alt"><span class="sub">${on ? '↪ Enchaîné directement depuis ' + esc(e.alt.fromLabel || 'le rendez-vous précédent') : 'Plus de 3 h depuis le rendez-vous précédent : retour maison supposé.'} ${cmp}</span>
    <button class="btn sm" data-act="caldirect" data-k="${esc(e.alt.key)}">${on ? '🏠 Repasser par la maison' : '↪ Je ne rentre pas : enchaîner directement'}</button></div>`;
}
function legHtml(leg, ev) {
  const trip = ev ? { src: 'cal', e: ev, dep: leg.dep, arr: leg.arr, l: leg, key: calendarTripKey(ev, leg) } : null;
  const action = trip && (leg.arr || leg.dep) >= liveNow() ? tripCancelButton(trip) : '';
  const homeAction = trip ? returnHomeButtonForTrip(trip) : '';
  const cancel = action || homeAction ? `<div class="cal-v">${action}${homeAction}</div>` : '';
  if (leg.originPending) return `<div class="leg lvx"><div class="leg-h"><b>${leg.k === 'go' ? 'ALLER' : 'RETOUR'}</b></div><p class="sub" role="status">${leg.originRecalc ? '📍 Départ confirmé : ' + esc(leg.originName) + ' · nouvel itinéraire et météo en cours de calcul' : 'Origine à confirmer après annulation du trajet précédent'}</p>${cancel}</div>`;
  const r = legEval(leg), go = leg.k === 'go';
  const head = `<div class="leg-h"><b>${go ? 'ALLER' : 'RETOUR'}</b> · départ <b>${leg.dep.slice(11, 16)}</b> → ${leg.arr.slice(11, 16)} · ${f0(leg.km)} km · ${leg.min} min${leg.assumed ? ' · <span class="muted">horaire supposé</span>' : ''} · ${cdSpan(leg.dep)}</div>
    <div class="leg-src">${leg.routed ? '<i class="tag prev">🛣 route · OSRM</i>' : '<i class="tag est">≈ route estimée</i>'}</div>
    <div class="leg-o">${go ? (leg.fromKind === 'prev' ? '↪ depuis ' + esc(leg.from.label || 'le rendez-vous précédent') + (leg.chosen ? ' (enchaînement choisi)' : ' (rendez-vous précédent)') : leg.fromKind === 'home' ? '🏠 depuis le domicile' : '📍 depuis ' + esc(leg.from.city || leg.from.label || 'le lieu connu')) : '🏠 vers le domicile'}</div>`;
  const nav = wazeBtn(legNavTo(leg));
  let body;
  if (r.loading) body = `<div class="cal-v"><span class="sub">Analyse de la météo le long de la route…</span>${nav}</div>`;
  else if (r.err) body = `<div class="cal-v"><span class="sub">Météo indisponible pour ce trajet.</span>${nav}</div>`;
  else if (r.beyond) body = `<div class="cal-v"><span class="sub">Trop loin pour les prévisions horaires.</span>${nav}</div>`;
  else if (!r.res || !r.res.length) {
    const fb = frostBand(r.sum.TrMin);
    body = `<div class="cal-v"><span class="sub">Pneus de la voiture active à renseigner · météo du trajet conservée.</span>${nav}</div>
      <div class="cal-k"><span>Route <b>${f1(r.sum.TrMin)} °C</b> <i class="tag est">estimé</i></span><span>Air <b>${f1(r.sum.Tmin)} °C</b></span><span>Pluie <b>${(r.sum.Pmax || 0) >= 0.1 ? f1(r.sum.Pmax) + ' mm/h' : 'sec'}</b></span><span>Visib. <b>${visTxt(r.sum.visMin)}</b></span></div>
      ${fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t}</b><span>${fb.d}</span></div>` : ''}`;
  }
  else {
    const fb = frostBand(r.sum.TrMin), c = r.crit;
    let crit = '';
    if (c && c.q.f > 0 && c.q.f < 1 && (c.lv >= 1 || c.fog || c.ice >= 1 || (c.x.Tr != null && c.x.Tr < 2) || (c.x.P || 0) >= 1)) {
      const why = c.fog ? 'visibilité ' + visTxt(c.x.vis) : c.ice >= 1 ? 'verglas ' + ICE_LV[c.ice].toLowerCase() : (c.x.P || 0) >= 1 ? 'pluie ' + f1(c.x.P) + ' mm/h' : c.lv >= 1 ? LV[c.lv].name : 'chaussée ' + f1(c.x.Tr) + ' °C';
      const k = r.seq.indexOf(c.q), a = r.seq[Math.max(0, k - 1)], b = r.seq[Math.min(r.seq.length - 1, k + 1)];
      const nm = q => q && q.name ? q.name : q ? 'km ' + Math.round(q.km != null ? q.km : q.f * leg.km) : '';
      const seg = c.q.name && a.name && b.name && a.name !== b.name ? `${esc(a.name)} → ${esc(b.name)}` : `vers ${esc(nm(c.q))}`;
      crit = `<div class="leg-c lv${Math.max(1, c.lv)}">⚠️ Tronçon critique : <b>${seg}</b> · ${a.t.slice(11, 16)}–${b.t.slice(11, 16)} · ${esc(why)}${c.q.km != null ? ` <span class="muted">(km ${f0(c.q.km)})</span>` : ''}</div>`;
    }
    body = `<div class="cal-v"><span class="pill lv${r.worst}">${LV[r.worst].emoji} ${LV[r.worst].name}${r.res[0] ? ' ' + r.res[0].w.score : ''}</span>${nav}</div>
      <div class="cal-k"><span>Route <b>${f1(r.sum.TrMin)} °C</b> <i class="tag est">estimé</i></span><span>Air <b>${f1(r.sum.Tmin)} °C</b></span><span>Pluie <b>${(r.sum.Pmax || 0) >= 0.1 ? f1(r.sum.Pmax) + ' mm/h' : 'sec'}</b></span><span>Visib. <b>${visTxt(r.sum.visMin)}</b></span></div>
      ${ev ? trendHtml(trendOf(calendarTripKey(ev, leg), leg.dep, snapOf(r.res, r.sum, r.seq))) : ''}
      ${crit}${fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t}</b><span>${fb.d}</span></div>` : ''}
      ${r.res.length > 1 ? `<span class="sub">${r.res.map(x => `${esc(x.c.short)} : ${LV[x.w.level].name} ${x.w.score}`).join(' · ')}</span>` : ''}`;
  }
  return `<div class="leg lv${r.worst != null ? r.worst : 'x'}">${head}${body}${cancel}</div>`;
}
// résumé de la journée : nombre de déplacements, kilomètres, trajet à surveiller
function daySummary(evs, now) {
  const legs = []; evs.forEach(e => effLegs(e).forEach(l => { if (l.dep >= now.slice(0, 16)) legs.push({ l, e }); }));
  if (!legs.length) return '';
  const day = legs.map(x => x.l.dep.slice(0, 10)).sort()[0], L = legs.filter(x => x.l.dep.slice(0, 10) === day);
  const km = L.reduce((a, x) => a + (x.l.km || 0), 0), ev = L.map(x => ({ x, r: legEval(x.l) })).filter(o => o.r && o.r.res);
  const worst = ev.reduce((a, o) => !a || o.r.worst > a.r.worst ? o : a, null), dd = dayDiff(now.slice(0, 10), day);
  const lbl = dd === 0 ? 'Aujourd’hui' : dd === 1 ? 'Demain' : fmtDay(day);
  return `<div class="cal-sum lv${worst ? worst.r.worst : 0}"><b>${lbl} · ${L.length} trajet${L.length > 1 ? 's' : ''} · ${f0(km)} km</b>
    <span>${worst && worst.r.worst >= 1 ? `${LV[worst.r.worst].emoji} ${worst.x.l.k === 'ret' ? 'retour' : 'aller'} ${esc(worst.x.e.t)} (${worst.x.l.dep.slice(11, 16)}) à surveiller` : ev.length === L.length ? '🟢 pneus adaptés à tous les trajets prévus' : 'analyse en cours…'}</span></div>`;
}
const calendarHasDeclaredPlace = e => !!e && typeof e.loc === 'string' && e.loc.trim().length > 2;
function renderCal() {
  const el = $('#secCal'); if (!el) return;
  if (!CAL) { el.hidden = true; el.innerHTML = ''; return; }
  const now = DEMO.on && CX ? CX.m.nowStr : liveNow(), home = S.locs[0], fut = (CAL.events || []).filter(e => (e.allDay ? e.s.slice(0, 10) >= now.slice(0, 10) : e.s > now));
  // Agenda · trajets : lieu reconnu (coordonnées ou lieu configuré) ou déplacement déclaré (#trajet, #direct, #maison).
  // Un « Lieu » rempli mais non reconnu (« Teams », faute de frappe) est masqué mais compté, sans titre : rien ne
  // disparaît sans bruit. Sans lieu reconnu, aucun itinéraire, météo, Waze ni Tenue n'est inventé (calendarSpatial).
  const skip = fut.filter(e => e.mode === 'pasdetrajet'), relevant = fut.filter(calendarRelevant),
    hidden = fut.filter(e => e.mode !== 'pasdetrajet' && !calendarRelevant(e)),
    unknownPlace = hidden.filter(calendarHasDeclaredPlace), noPlace = hidden.filter(e => !calendarHasDeclaredPlace(e)),
    located = relevant.filter(calendarSpatial);
  const near = located.filter(e => locHasCoords(home) && distKm(home, calendarEventPlace(e, calendarPlaces())) < 3);
  const evs = located.filter(e => !near.includes(e)).slice(0, 8).concat(relevant.filter(e => !calendarSpatial(e)).slice(0, 8));
  const dateLabel = e => {
    const d = new Date(e.s.slice(0, 10) + 'T12:00:00Z'), dd = dayDiff(now.slice(0, 10), e.s.slice(0, 10));
    return `${dd === 0 ? 'auj.' : dd === 1 ? 'demain' : DAYN[d.getUTCDay()] + ' ' + pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1)} · ${e.allDay ? 'journée' : e.s.slice(11, 16)}`;
  };
  el.hidden = false;
  const up = new Date(CAL.updated).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), calCached = !!CAL.offline,
    calAge = relayAgeMin(CAL.updated), calStale = !calCached && calAge > RELAY_WARN_MIN,
    calState = calCached ? 'cache chiffré' : calStale ? `⚠ relais ${relayAgeTxt(calAge)}` : 'prévision';
  // Un relais vieux ne doit pas monopoliser l'écran. Alerte forte seulement si un départ Agenda
  // peut arriver dans les 4 h ; sinon une ligne compacte suffit jusqu'au rattrapage.
  const depTimes = [];
  relevant.forEach(e => {
    if (e.legs) effLegs(e).forEach(l => { if (l && l.dep && l.dep >= now.slice(0, 16)) depTimes.push(l.dep); });
    else if (!e.allDay && e.s >= now.slice(0, 16)) depTimes.push(e.s);
  });
  depTimes.sort();
  const nextDepMin = depTimes.length ? Math.round((tsToDate(depTimes[0]) - tsToDate(now.slice(0, 16))) / 60000) : Infinity,
    calUrgent = calStale && nextDepMin <= 240,
    calWarn = !calStale ? '' : calUrgent
      ? `<div class="note lv1" role="status"><b>⚠️ Agenda à vérifier avant le prochain trajet</b><span>Relais vieux de ${relayAgeTxt(calAge)}. Une modification récente de Google Agenda peut manquer ; dernier plan connu conservé.</span></div>`
      : `<div class="disc" role="status"><b>⚠ Agenda : relais vieux de ${relayAgeTxt(calAge)}</b> · aucun départ Agenda imminent ; dernier plan connu conservé en attendant le rattrapage.</div>`;
  const rows = evs.map(e => {
    const spatial = calendarSpatial(e), effectiveRoute = spatial && (e.legs || cancelAffectedDay(e)), tr = spatial && !effectiveRoute ? calTrip(e) : null;
    let body;
    if (calendarCancelled(e)) body = '<span class="sub">Aller et retour annulés sur cet appareil. Le rendez-vous reste dans Google Agenda.</span>';
    else if (!spatial) body = calendarHasDeclaredPlace(e)
      ? '<span class="sub">Lieu introuvable sur la carte : précise l’adresse ou la ville dans le rendez-vous. Itinéraire et météo locale non calculés.</span>'
      : '<span class="sub">Lieu inconnu · météo locale non calculée. Précise le lieu de ce déplacement dans Google Agenda. Itinéraire non calculé.</span>';
    else if (effectiveRoute) { const L = effLegs(e); body = altHtml(e) + (!e.allDay && L.length && !L.some(l => l.k === 'go') ? '<span class="sub">↪ Enchaîné avec le rendez-vous précédent, même lieu : pas de trajet aller.</span>' : '') + (L.length ? L.map(l => legHtml(l, e)).join('') : '<span class="sub">Même lieu que le rendez-vous précédent : pas de trajet.</span>'); }
    else if (!tr) body = '<span class="sub">Météo en attente…</span>';
    else if (tr.near) body = `<span class="sub">À moins de 3 km de chez toi : pas de trajet à analyser.</span>`;
    else if (tr.loading) body = `<span class="sub">${f0(tr.km)} km · analyse de la météo du trajet…</span>`;
    else if (tr.beyond) body = `<span class="sub">${f0(tr.km)} km · départ ≈ ${tr.dep.slice(11, 16)} · trop loin pour les prévisions horaires.</span>`;
    else if (!tr.res || !tr.res.length) {
      const fb = frostBand(tr.sum.TrMin);
      body = `<div class="cal-v"><span class="sub">Pneus de la voiture active à renseigner · météo du trajet conservée.</span>
        <span class="sub">départ conseillé ≈ <b>${tr.dep.slice(11, 16)}</b> · ${f0(tr.km)} km · ~${tr.dur} min</span>${wazeBtn(e)}</div>
        <div class="cal-k"><span>Route <b>${f1(tr.sum.TrMin)} °C</b> <i class="tag est">estimé</i></span><span>Air <b>${f1(tr.sum.Tmin)} °C</b></span><span>Pluie <b>${(tr.sum.Pmax || 0) >= 0.1 ? f1(tr.sum.Pmax) + ' mm/h' : 'sec'}</b></span><span>Visib. <b>${visTxt(tr.sum.visMin)}</b></span></div>
        ${fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t}</b><span>${fb.d}</span></div>` : ''}`;
    }
    else {
      const fb = frostBand(tr.sum.TrMin), lvw = tr.worst;
      body = `<div class="cal-v"><span class="pill lv${lvw}">${LV[lvw].emoji} ${LV[lvw].name}${tr.res[0] ? ' ' + tr.res[0].w.score : ''}</span>
        <span class="sub">départ conseillé ≈ <b>${tr.dep.slice(11, 16)}</b> · ${f0(tr.km)} km · ~${tr.dur} min</span>${wazeBtn(e)}</div>
        <div class="cal-k"><span>Route <b>${f1(tr.sum.TrMin)} °C</b> <i class="tag est">estimé</i></span><span>Air <b>${f1(tr.sum.Tmin)} °C</b></span><span>Pluie <b>${(tr.sum.Pmax || 0) >= 0.1 ? f1(tr.sum.Pmax) + ' mm/h' : 'sec'}</b></span><span>Visib. <b>${visTxt(tr.sum.visMin)}</b></span></div>
        ${fb ? `<div class="frost lv${fb.lv}"><b>${fb.lv >= 3 ? '🔴' : fb.lv >= 2 ? '🟠' : '🟡'} ${fb.t}</b><span>${fb.d}</span></div>` : ''}
        ${tr.res.length > 1 ? `<span class="sub">${tr.res.map(r => `${esc(r.c.short)} : ${LV[r.w.level].name} ${r.w.score}`).join(' · ')}</span>` : ''}`;
    }
    return `<div class="cal-e" data-event-id="${esc(e.id || '')}"><div class="cal-h"><span class="cal-d">${dateLabel(e)}</span><b class="cal-t">${esc(e.t)}</b><span class="sub">📍 ${esc(calendarEventPlace(e, calendarPlaces())?.name || e.label || e.loc || 'Lieu inconnu')}</span></div>${body}</div>`;
  }).join('');
  el.innerHTML = `<div class="mod-h"><h2>📅 Agenda · trajets</h2><span class="src obs">Google Agenda · ${calState}</span></div>${calWarn}${evs.length ? `<div class="cal-l">${rows}</div>` : '<p class="sub">Aucun déplacement à analyser sur les 8 prochains jours.</p>'}
    <div class="disc">${calCached ? '<b>Hors connexion : dernier agenda chiffré disponible.</b> ' : ''}${skip.length ? skip.length + ' rendez-vous ignorés (#pasdetrajet ou 📺). ' : ''}${noPlace.length ? noPlace.length + ' rappel' + (noPlace.length > 1 ? 's' : '') + ' sans lieu masqué' + (noPlace.length > 1 ? 's' : '') + '. ' : ''}${unknownPlace.length ? `<b>${unknownPlace.length} rendez-vous au lieu non reconnu masqué${unknownPlace.length > 1 ? 's' : ''}</b> : précise l’adresse, ou ajoute #trajet si c’est un déplacement. ` : ''}${near.length ? near.length + ' rendez-vous à moins de 3 km de chez toi masqués. ' : ''}Race Control utilise les rendez-vous avec un lieu reconnu. Les rappels sans lieu et les éléments <b>#pasdetrajet</b> ou 📺 sont exclus. Pour signaler un vrai déplacement dont le lieu reste à préciser, ajoute <b>#trajet</b> dans le titre ou la description Google Agenda. <b>#direct</b> enchaîne les rendez-vous ; <b>#maison</b> prévoit un passage par chez toi. Agenda sur 8 jours, synchronisé le ${up} (chiffré avec ton code). Itinéraires © contributeurs OpenStreetMap · OSRM, avec une marge totale plafonnée à 15 min pour un rendez-vous (dont 10 min d’arrivée anticipée), sans trafic : touche 🚙 Waze pour le trafic réel. Départ du domicile arrondi à ~1 km pour la confidentialité (le tout début du tracé peut légèrement différer). Météo prise au départ, à ¼, ½ et ¾ du temps de parcours et à l’arrivée, à l’heure de passage. Moins de 3 h entre deux rendez-vous : enchaînés ; plus de 3 h : retour maison supposé, modifiable en un tap. Les notifications suivent le plan par défaut. « Journée entière » : arrivée 09:00, retour 18:00 supposés.</div>`;
}


/* ---------- V3.2 : compte à rebours, tendance locale, briefing de la journée ---------- */
// compte à rebours vivant : tout élément .cd[data-dep] est mis à jour toutes les 30 s
function cdText(dep) {
  const now = nowIn('Europe/Paris').slice(0, 16), m = Math.round((tsToDate(dep) - tsToDate(now)) / 60000);
  if (m < -5) return { t: 'départ passé', cls: 'past' };
  if (m <= 0) return { t: 'DÉPART MAINTENANT', cls: 'now' };
  if (m <= 20) return { t: `DÉPART DANS ${m} MIN`, cls: 'now' };
  return { t: m < 60 ? `départ dans ${m} min` : m < 24 * 60 ? `départ dans ${Math.floor(m / 60)} h ${pad(m % 60)}` : `départ dans ${Math.floor(m / 1440)} j`, cls: '' };
}
const cdSpan = dep => { const c = cdText(dep); return `<span class="cd ${c.cls}" data-dep="${dep}">${c.t}</span>`; };
setInterval(() => { if (document.hidden) return; document.querySelectorAll('.cd[data-dep]').forEach(el => { const c = cdText(el.dataset.dep); el.textContent = c.t; el.className = 'cd ' + c.cls; }); }, 30e3);
// tendance : première prévision vue pour un trajet (sur ce téléphone uniquement), comparée à l'actuelle
let TREND = null;
function trendStore() { if (!TREND) { try { TREND = JSON.parse(lsGet('twrc.trend') || '{}'); } catch (e) { TREND = {}; } } return TREND; }
function trendOf(key, dep, snap) {
  const T = trendStore(), now = nowIn('Europe/Paris').slice(0, 16);
  Object.keys(T).forEach(k => { if (T[k].dep < addMin(now, -1440)) delete T[k]; });
  if (!T[key]) { T[key] = { dep, at: now, ...snap }; lsSet('twrc.trend', JSON.stringify(T)); return { first: true, at: now }; }
  const r = T[key], at = r.at.slice(11, 16) + (r.at.slice(0, 10) !== now.slice(0, 10) ? ' (veille)' : ''), ch = [];
  if (r.lv != null && snap.lv != null && snap.lv !== r.lv) ch.push({ w: snap.lv > r.lv ? 1 : -1, t: `${LV[r.lv].name} → ${LV[snap.lv].name}` });
  if (r.pp != null && snap.pp != null && Math.abs(snap.pp - r.pp) >= 20) ch.push({ w: snap.pp > r.pp ? 1 : -1, t: `pluie ${snap.pp > r.pp ? '+' : '−'}${Math.round(Math.abs(snap.pp - r.pp))} pts` });
  if (r.vis != null && snap.vis != null && r.vis < 20000 && snap.vis <= r.vis / 2) ch.push({ w: 1, t: 'visibilité divisée par ' + Math.max(2, Math.round(r.vis / Math.max(snap.vis, 1))) });
  else if (r.vis != null && snap.vis != null && snap.vis < 20000 && snap.vis >= r.vis * 2) ch.push({ w: -1, t: 'visibilité en hausse' });
  if (r.tr != null && snap.tr != null && Math.abs(snap.tr - r.tr) >= 2) ch.push({ w: snap.tr < r.tr ? 1 : -1, t: `chaussée ${snap.tr < r.tr ? '−' : '+'}${f1(Math.abs(snap.tr - r.tr))} °C` });
  return { at, ch, worse: ch.some(c => c.w > 0), better: ch.length && ch.every(c => c.w < 0) };
}
function trendHtml(tr) {
  if (!tr) return '';
  if (tr.first) return `<span class="trend">📈 suivi démarré à ${tr.at.slice(11, 16)}</span>`;
  if (!tr.ch.length) return `<span class="trend ok">→ conditions stables depuis ${tr.at}</span>`;
  return `<span class="trend ${tr.worse ? 'bad' : 'good'}">${tr.worse ? '↘ se dégrade' : '↗ s’améliore'} depuis ${tr.at} : ${tr.ch.map(c => esc(c.t)).join(' · ')}</span>`;
}
const snapOf = (res, sum, seq) => ({ lv: res.reduce((m, r) => Math.max(m, r.w.level), 0), pp: Math.max(0, ...seq.map(q => q.hs[q.i].pp || 0)), vis: sum.visMin, tr: sum.TrMin });
// briefing de la journée : trajets agenda + trajet domicile/travail, prochain départ, trajet critique
function dayBriefHtml(td, tdLv) {
  dayBriefHtml.day = dayBriefHtml.first = dayBriefHtml.next = null; dayBriefHtml.lv = 0;
  if (!CAL || !CAL.events) return '';
  const now = CX.m.nowStr.slice(0, 16), legs = [];
  CAL.events.filter(calendarSpatial).forEach(e => effLegs(e).forEach(l => { if (l.dep >= now) legs.push({ l, e }); }));
  if (!legs.length) return '';
  const day = legs.map(x => x.l.dep.slice(0, 10)).sort()[0], L = legs.filter(x => x.l.dep.slice(0, 10) === day).sort((a, b) => a.l.dep < b.l.dep ? -1 : 1);
  const R = L.map(x => ({ ...x, r: legEval(x.l) })), ready = R.filter(x => x.r && x.r.res);
  const worst = ready.reduce((a, x) => !a || x.r.worst > a.r.worst ? x : a, null);
  const km = L.reduce((a, x) => a + (x.l.km || 0), 0), dd = dayDiff(now.slice(0, 10), day), lbl = dd === 0 ? 'Aujourd’hui' : dd === 1 ? 'Demain' : fmtDay(day);
  const nx = R[0], nm = x => `${x.l.k === 'ret' ? 'retour' : 'aller'} ${esc(x.e.t)}`;
  const tr = x => { if (!x.r || !x.r.res) return null; return trendOf(calendarTripKey(x.e, x.l), x.l.dep, snapOf(x.r.res, x.r.sum, x.r.seq)); };
  // tendance affichée seulement quand elle change quelque chose ; sinon une seule ligne « stable »
  const T = R.slice(0, 4).map(x => ({ x, t: tr(x) })), anyCh = T.some(o => o.t && !o.t.first && o.t.ch.length), ref = (T.find(o => o.t) || {}).t;
  const lines = T.map(o => `<div class="db-l"><span>${o.x.r && o.x.r.res ? LV[o.x.r.worst].emoji : '⏳'} ${o.x.l.dep.slice(11, 16)} · ${nm(o.x)}</span>${o.t && !o.t.first && o.t.ch.length ? trendHtml(o.t) : ''}</div>`).join('')
    + (!anyCh && ref ? `<div class="db-n">${trendHtml(ref.first ? ref : { ...ref, ch: [] })}</div>` : '');
  const car = TCARS()[0];
  dayBriefHtml.day = day; dayBriefHtml.first = nx.l.dep; dayBriefHtml.next = nm(nx); dayBriefHtml.lv = worst ? worst.r.worst : 0;
  return `<div class="db lv${worst ? worst.r.worst : 0}"><div class="db-h"><b>${lbl} · ${L.length} trajet${L.length > 1 ? 's' : ''} agenda · ${f0(km)} km</b></div>
    ${worst && worst.r.worst >= 1 ? `<div class="db-w">${LV[worst.r.worst].emoji} <b>${nm(worst)} (${worst.l.dep.slice(11, 16)})</b> = trajet critique</div>` : ready.length === L.length ? '<div class="db-w">🟢 aucun trajet à risque</div>' : ''}
    <div class="db-n">⏱ Prochain départ agenda : <b>${nx.l.dep.slice(11, 16)}</b> · ${cdSpan(nx.l.dep)} · ${nm(nx)}</div>
    ${lines}${car ? `<div class="db-c">🚗 ${esc(car.short)} · ${esc(TYPE_LABEL[effType(car)] || '')}</div>` : ''}</div>`;
}

/* ---------- rendu : voitures ---------- */
const tireTxt = car => {
  const t = car.tire, a = [t.brand, t.model].filter(Boolean).join(' ');
  return `${a ? esc(a) : '<span class="muted">marque / modèle non renseignés</span>'} · <span class="tt">${esc(t.size || '—')}</span>${t.tread != null ? ` · <span class="tt">${esc(treadTxt(treadAxles(t), treadAxles(t).worst))}${t.treadEst ? ' (estimée)' : ''}</span>` : ''}`;
};
const lastOdo = car => (car.odo || []).slice().sort((x, y) => x.km - y.km).slice(-1)[0] || null;
function kmPerDay(car) {
  const o = (car.odo || []).slice().sort((x, y) => x.d < y.d ? -1 : 1); if (o.length < 2) return null;
  const days = dayDiff(o[0].d, o[o.length - 1].d); return days >= 7 ? (o[o.length - 1].km - o[0].km) / days : null;
}
function wearInfo(car) {
  const t = car.tire, wx = treadAxles(t).ax, tr = (t.treads || []).filter(x => x.km != null && x.mm != null && !x.est && (!x.ax || !wx || x.ax === wx)).sort((x, y) => x.km - y.km);
  const thr = t.type === 'winter' ? 4 : 3, last = (t.treads || []).slice(-1)[0] || null, out = { last, thr };
  if (tr.length >= 2) {
    const a = tr[0], b = tr[tr.length - 1], rate = (a.mm - b.mm) / Math.max(1, b.km - a.km) * 1000;
    if (rate > 0.005) {
      out.rate = rate; out.kmThr = b.km + (b.mm - thr) / rate * 1000; out.kmLegal = b.km + (b.mm - 1.6) / rate * 1000;
      const kpd = kmPerDay(car), lo = lastOdo(car);
      if (kpd && lo) out.dateThr = addMin(lo.d + 'T00:00', Math.max(0, (out.kmThr - lo.km) / kpd) * 1440).slice(0, 10);
    }
  }
  const lo = lastOdo(car), base = t.lastRot != null ? t.lastRot : t.mountKm;
  if (lo && base != null) { out.sinceRot = lo.km - base; out.nextRot = base + 10000; }
  return out;
}
function wearLine(car) {
  const w = wearInfo(car), t = car.tire; if (!w.last && !(car.odo || []).length) return '';
  const parts = [];
  if (w.last) parts.push(`Profondeur <b>${f1(w.last.mm)} mm</b> (${fmtDay(w.last.d)})`);
  if (w.rate) parts.push(`${w.rate.toFixed(2).replace('.', ',')} mm / 1 000 km`, `${w.thr} mm vers ${(Math.round(w.kmThr / 100) * 100).toLocaleString('fr-FR')} km${w.dateThr ? ' (≈ ' + new Date(w.dateThr + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + ')' : ''}`);
  else if (w.last) parts.push('<span class="muted">une 2e mesure (avec le compteur) permettra de projeter l’usure</span>');
  if (w.sinceRot != null) parts.push(w.sinceRot >= 10000 ? `<b style="color:var(--risk-t)">permutation AV/AR conseillée</b> (${Math.round(w.sinceRot)} km depuis)` : `permutation vers ${(Math.round(w.nextRot / 100) * 100).toLocaleString('fr-FR')} km`);
  const lo = lastOdo(car); if (lo) parts.push(`compteur ${lo.km.toLocaleString('fr-FR')} km`);
  return `<div class="tirebox wear"><span>Usure · ${parts.join(' · ')}</span></div>`;
}
function tireExtra(car, m) {
  const t = car.tire, pc = t.pchk || {}, age = dotAge(t.dot, m.nowStr), ci = S.cars.indexOf(car);
  const pTxt = pc.date ? `contrôlée le ${fmtDay(pc.date)} à ${f1(pc.T)} °C` : 'contrôle non enregistré';
  const loss = pc.T != null && CX && CX.sum24.Tmin != null && pc.T - CX.sum24.Tmin >= 3 ? ` · ≈ −${f1(pressLoss(pressTarget(t.press), pc.T, CX.sum24.Tmin))} bar au plus froid des 24 h` : '';
  const ageTxt = age != null ? `<span class="${age >= 6 ? 'pill lv' + (age >= 10 ? 3 : 2) : 'tt'}">DOT ${esc(t.dot)} · ${f1(age)} ans</span>` : `<span class="tt">DOT non renseigné</span>`;
  return `<div class="tirebox"><span>Pression ${t.press ? '<b>' + esc(/bar/i.test(t.press) ? t.press : t.press + ' bar') + '</b>' : '<span class="muted">cible non renseignée</span>'} · ${pTxt}${loss}</span>
    <button class="btn sm" data-act="pchk" data-car="${esc(car.id)}">Pression vérifiée maintenant</button>${ageTxt}</div>${wearLine(car)}${(() => { const sh = tireSheet(t, m.nowStr); const ls = sh.lines.concat(t.info ? [t.info] : []); return ls.length ? `<details class="tinfo"><summary>Fiche du pneu${sh.db ? ' · reconnu dans la base' : ''}</summary><ul class="parts">${ls.map(l => `<li><span>${esc(l)}</span></li>`).join('')}</ul></details>` : ''; })()}`;
}
function carSilhouette(noTires) {
  const wheel = (x) => noTires
    ? `<circle cx="${x}" cy="44" r="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3" opacity=".7"/><path d="M${x - 5} 56h10M${x} 47v9" stroke="currentColor" stroke-width="2" opacity=".8"/>`
    : `<circle cx="${x}" cy="44" r="9" fill="var(--fg3)"/><circle cx="${x}" cy="44" r="4" fill="var(--panel2)"/>`;
  return `<svg viewBox="0 0 124 62" aria-hidden="true"><path d="M8 42l2-9q2-5 8-6l20-3 14-10q3-2 8-2h22q6 0 10 4l12 11q8 2 9 7l1 8z" fill="var(--panel2)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M42 24l11-8h14l1 8zM72 24l-1-8h10q4 0 7 3l5 5z" fill="var(--accent-soft)" stroke="currentColor" stroke-width="1"/>${wheel(30)}${wheel(94)}</svg>`;
}
function carThumb(car) {
  const i = S.cars.indexOf(car), ph = car.photo;
  return `<label class="thumb${ph ? ' has' : ''}" for="photo-${i}" title="${ph ? 'Changer la photo' : 'Ajouter une photo de la voiture'}">
    ${ph ? `<img src="${ph}" alt="${esc(car.name)}">` : carSilhouette(!hasTires(car)) + '<span>+ Photo</span>'}
    <input type="file" accept="image/*" id="photo-${i}" data-photo="${i}" hidden></label>`;
}
function waitCard(car) {
  const sz = car.tire.size || (car.sets && car.sets.unknown && car.sets.unknown.size) || '';
  return `<article class="car wait"><div class="car-h"><div class="car-top"><div><h3>${esc(car.name)}</h3><span class="spec">${esc(car.spec)}</span></div>${carThumb(car)}</div></div>
    <div class="waitbox">
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="14" stroke-dasharray="7 6" opacity=".55"/>
        <circle cx="60" cy="60" r="27" fill="none" stroke="currentColor" stroke-width="3" opacity=".8"/>
        <g class="hg"><path d="M49 45h22M49 75h22M52 45v5l8 10-8 10v5M68 45v5l-8 10 8 10v5" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M55 70l5-6 5 6z" fill="var(--accent)"/></g></svg>
      <div><div class="wt">En attente de pneus</div>
        <p class="sub">Aucun pneu monté : pas de verdict, de score ni d’alerte pour cette voiture.${sz ? ` Dimension : <b class="mono">${esc(sz)}</b>.` : ''}</p>
        <button class="btn sm" data-act="goset-cfg">Pneus montés ? Les renseigner</button></div></div></article>`;
}
function renderCars() {
  const el = $('#secCars'); if (!CX) { el.innerHTML = ''; return; }
  const { m } = CX;
  el.innerHTML = CX.cars.map(({ car, w, nar }) => {
    if (!hasTires(car)) return waitCard(car);
    if (!w) return `<article class="car"><div class="car-h"><h3>${esc(car.name)}</h3></div><div class="car-b"><p class="muted">Données insuffisantes pour évaluer cette voiture.</p></div></article>`;
    const c = m.cur, i = m.nowI;
    const strip = []; for (let k = 0; k <= 24; k++) { const v = hourVerdict(car, m.hs, i + k); strip.push(v ? `<i class="lv${v.level}" title="${m.hs[i + k].t.slice(11, 16)} · ${LV[v.level].name} · ${v.score}/100"></i>` : ''); }
    const labels = [0, 6, 12, 18, 24].map(k => `<span>${m.hs[i + k] ? m.hs[i + k].t.slice(11, 16) : ''}</span>`).join('');
    const wi = w.worst, pf = carProfile(car), gen = pf.generic;
    return `<article class="car ${gen ? 'lvx generic' : 'lv' + w.level}">
      <div class="car-h"><div class="car-top"><div><h3>${esc(car.name)}</h3><span class="spec">${esc(car.spec)}</span></div>${carThumb(car)}</div>
        <div class="tirebox"><span><b>Pneus montés : ${TYPE_LABEL[car.tire.type]}</b></span><span>${tireTxt(car)}</span></div>
        ${tireExtra(car, m)}</div>
      ${gen ? genericNote(pf.gaps) : verdictHtml(w.level)}
      <div class="car-b">
        <div class="scoreRow"><div><div class="lab">TYRE WEATHER SCORE</div><div class="score num">${gen ? '—' : w.score}<small>${gen ? 'aperçu' : '/100'}</small></div></div>
          <div style="display:flex;flex-direction:column;gap:6px"><div class="lab">Niveau de risque : <b style="color:var(--lv-t)">${gen ? 'aperçu (profil générique)' : RISKTXT[w.level]}</b></div><div class="bar"><i style="width:${gen ? 0 : w.score}%"></i></div>
          <div class="sub">${f1(c.T)} °C · ${esc(wx(c.code))} · chaussée est. ${f1(c.Tr)} °C</div></div></div>
        <p class="expl">${gen ? '<b>Météo de référence.</b> Renseigne tes lieux et ta monte pour évaluer cette voiture.' : `<b>${esc(nar.head)}</b> ${esc(nar.body)}`}</p>
        ${gen ? '' : `<div><div class="sub" style="margin-bottom:4px">Évolution heure par heure · 24 h</div><div class="strip" role="img" aria-label="Verdict heure par heure sur 24 heures">${strip.join('')}</div><div class="strip-l">${labels}</div></div>`}
        ${gen ? '' : `<details><summary>Détail du calcul · pire heure ${hhmm({ hs: wi.x ? m.hs : m.hs, i: m.hs.indexOf(wi.x) })}</summary>
          <ul class="parts">${wi.parts.length ? wi.parts.map(p => `<li><span>${esc(p.label)}${p.kind === 'hazard' ? ' <span class="muted">(météo)</span>' : ''}</span><b>−${p.v}</b></li>`).join('') : '<li><span>Aucune pénalité notable</span><b>0</b></li>'}</ul>
          <p class="disc" style="margin-top:6px">Indice = 100 − moyenne (heure actuelle, pire heure des ${S.horizon} h). Les seuils de température sont des repères pratiques, pas des bascules.</p></details>`}
        <p class="disc">Indice d’aide à la décision — les conditions réelles de la route et l’état du véhicule restent déterminants.</p>
      </div></article>`;
  }).join('');
}

/* ---------- trajet ---------- */
function midPoints(LA, LB) {
  if (!locHasCoords(LA) || !locHasCoords(LB)) return [];
  // ordre canonique : mêmes points (et mêmes requêtes) à l'aller et au retour
  if (LA.lat > LB.lat || (LA.lat === LB.lat && LA.lon > LB.lon)) return midPoints(LB, LA).map(p => ({ ...p, f: 1 - p.f })).reverse();
  const d = distKm(LA, LB); if (d <= 60) return [];
  const n = Math.min(8, Math.round(d / 50)), out = [];
  for (let k = 1; k < n; k++) {
    const f = k / n;
    const lat = +(LA.lat + (LB.lat - LA.lat) * f).toFixed(3), lon = +(LA.lon + (LB.lon - LA.lon) * f).toFixed(3);
    out.push({ id: `mid_${lat}_${lon}`, name: `point à ≈ ${Math.round(d * f)} km`, f, lat, lon });
  }
  return out;
}
async function ensureMids(pts) {
  const todo = pts.filter(p => !MIDM[p.id] && !MIDPENDING.has(p.id)); if (!todo.length) return;
  todo.forEach(p => MIDPENDING.add(p.id));
  await Promise.allSettled(todo.map(async p => {
    try {
      const pl = DEMO.on ? makeDemoPayload(DEMO.scn, p, 'Europe/Paris', 0.3) : await fetchJSON(urlFor(p));
      const bad = validForecast(pl); if (bad) throw new Error(bad);
      MIDP[p.id] = { p: pl, mode: DEMO.on ? 'demo' : 'live', pt: p, t: Date.now() }; MIDM[p.id] = makeModel(pl, MIDP[p.id].mode, p); MIDM[p.id].retrievedAt = MIDP[p.id].t;
    } catch (e) { MIDP[p.id] = { p: null, mode: 'cache', pt: p, t: Date.now() }; MIDM[p.id] = null; }
    finally { MIDPENDING.delete(p.id); }
  }));
  softRender();
}
// dir : 'go' | 'ret' ; off : null = choix de l'interface, 'auto' = prochain départ
function tripData(dir = UI.dir, off = null, departure = null) {
  const w = S.work;
  const nm = id => (locById(id) || {}).name || id;
  const model = M[dir === 'go' ? w.from : w.to];
  const clock = DEMO.on && model ? model.nowStr : nowIn(model && model.tz || 'Europe/Paris');
  const time = dir === 'go' ? w.dep : w.ret, today = clock.slice(0, 10);
  const auto = appCommuteOff(today, time, clock.slice(11, 16), w.days);   // saute les jours sans trajet domicile-travail
  if (auto == null) return { err: 'Aucun jour de trajet domicile-travail coché (Réglages → Trajet).' };
  if (off === 'auto') off = auto;
  else if (off == null) { if (UI.dayOff == null) UI.dayOff = auto; off = UI.dayOff; }   // un nombre = décalage imposé
  const dur = +w.durMin || 30;
  const dep = departure || addMin(today + 'T00:00', off * 1440 + toMin(time)), arr = addMin(dep, dur);
  if (!appWorkOn(dep.slice(0, 10)) && !(TRIPSTART && TRIPSTART.trip && TRIPSTART.trip.src === 'work')) return { err: 'Pas de travail prévu pour cette journée.', cancelled: true };
  if (workCancelled(dep.slice(0, 10))) return { err: 'Trajets domicile-travail annulés pour cette journée sur cet appareil.', cancelled: true };
  const ends = appCommuteEndpoints(dir, dep.slice(0, 10), 'commute|' + dep.slice(0, 10) + 'T' + time + '|' + dir), LA = ends.from, LB = ends.to;
  const fromId = LA && LA.id, toId = LB && LB.id, A = M[fromId], B = M[toId];
  if (!LB) return { err: 'Destination à confirmer.', destinationPending: true };
  if (!A || !B || A.nowI < 0 || B.nowI < 0 || !locHasCoords(LA) || !locHasCoords(LB)) return { err: `Données ou coordonnées manquantes pour ${!A || !locHasCoords(LA) ? nm(fromId) : nm(toId)}.` };
  const hDep = dep.slice(0, 13) + ':00', hArr = arr.slice(0, 13) + ':00', seq = [];
  const dist = distKm(LA, LB), mids = midPoints(LA, LB);
  const missing = mids.filter(p => MIDM[p.id] === undefined);
  if (missing.length) ensureMids(missing);
  const chain = [{ m: A, f: 0, name: nm(fromId) }, ...mids.filter(p => MIDM[p.id]).map(p => ({ m: MIDM[p.id], f: p.f, name: p.name })), { m: B, f: 1, name: nm(toId) }];
  for (let t = hDep; t <= hArr; t = addMin(t, 60)) {
    const frac = clamp((tsToDate(t) - tsToDate(dep)) / ((tsToDate(arr) - tsToDate(dep)) || 1), 0, 1);
    if (dur <= 90 && !mids.length) {
      const iA = A.byTime.get(t), iB = B.byTime.get(t);
      if (iA != null) seq.push({ hs: A.hs, i: iA, loc: nm(fromId) });
      if (iB != null && B !== A) seq.push({ hs: B.hs, i: iB, loc: nm(toId) });
    } else {
      const pt = chain.reduce((b, c) => Math.abs(c.f - frac) < Math.abs(b.f - frac) ? c : b, chain[0]);
      const i = pt.m.byTime.get(t); if (i != null) seq.push({ hs: pt.m.hs, i, loc: pt.name });
    }
  }
  if (!seq.length) return { err: 'Horaire hors de la plage de prévision disponible.' };
  const offSec = A.payload && A.payload.utc_offset_seconds != null ? A.payload.utc_offset_seconds : 7200;
  const gl = glareCheck(LA, LB, dep, dur, offSec, ts => { const i = A.byTime.get(ts.slice(0, 13) + ':00'); return i != null ? A.hs[i].cloud : null; });
  const mont = montagneInfo(LB, dep, B.payload ? num(B.payload.elevation) : null);
  return { A, B, LA, LB, dir, dep, arr, dur, seq, dist, mids, midsLoaded: chain.length - 2, glare: gl.glare, cap: gl.bearing, mont,
    fromName: nm(fromId), toName: nm(toId), iDep: A.byTime.get(hDep), iArr: B.byTime.get(hArr), past: dep < clock };
}
function colStats(seq) {
  const s = summarize(seq), x = seq[0].hs[seq[0].i];
  const single = seq.length === 1;
  return { T: s.Tmin, Tmax: s.Tmax, Tr: s.TrMin, P: s.Pmax, pp: s.ppMax, vis: s.visMin, fog: (s.visMin != null && s.visMin < 1000) || s.fog, frost: s.Tmin != null && s.Tmin <= 1,
    ice: s.iceLevel, snow: s.snowSum > 0 || s.snowCode, sleet: s.sleet, gust: s.gustMax, wind: s.windMax, code: single ? x.code : null };
}
const CALIB_LV = { observation: 'observation', motif: 'motif possible', signal: 'signal', suggestion: 'suggestion' };
function feedbackBlock() {
  const l = curLoc(), c = calibFor(l && l.id), last = (S.calib || []).filter(r => r && l && r.loc === l.id).slice(-1)[0];
  const state = c.applied ? `correction appliquée ici : <b class="mono">${c.bias > 0 ? '+' : ''}${f1(c.bias)} °C</b> (${c.n} retours utiles cohérents)`
    : c.n ? `<b class="mono">aucune correction</b> · ${c.n} retour${c.n > 1 ? 's' : ''} utile${c.n > 1 ? 's' : ''} ici = ${CALIB_LV[c.level]}${c.coherent ? '' : ', contradictoires'} (correction à partir de ${CALIB_MIN} retours cohérents au même lieu)`
    : '<b class="mono">aucune correction</b>';
  return `<div class="fb"><div class="sub">RETOUR TERRAIN · ce que tu as vu sur la route (noté comme observation pour ce lieu)</div>
    <div class="chips"><button class="btn sm" data-act="fb" data-k="ice">❄️ Givre / verglas vu</button><button class="btn sm" data-act="fb" data-k="wet">💧 Mouillé, pas gelé</button><button class="btn sm" data-act="fb" data-k="dry">✅ Sec, RAS</button></div>
    <div class="disc">Chaussée : ${state}${c.dry ? ` · ${c.dry} « Sec, RAS » noté${c.dry > 1 ? 's' : ''}, sans effet sur la température (ne renseigne pas le gel)` : ''}${last ? ` · dernier : ${fmtDay(last.t.slice(0, 10))} ${last.t.slice(11, 16)}` : ''}.</div></div>`;
}
function renderBrief() {
  const el = $('#secBrief'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const td = tripData(), w = S.work, dir = UI.dir; if (appActiveCar()) UI.bcar = appActiveCar().id;
  const time = dir === 'go' ? w.dep : w.ret;
  const locOpts = (sel, key) => allLocs().map(l => `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  if (!appActiveCar() && !TCARS().some(c => c.id === UI.bcar) && TCARS().length) UI.bcar = TCARS()[0].id;
  const carSeg = TCARS().map(c => `<button data-act="bcar" data-car="${esc(c.id)}" aria-pressed="${UI.bcar === c.id}">${esc(c.short)}</button>`).join('');
  const mFrom = M[w.from] || M[S.locs[0].id], day0 = mFrom ? (DEMO.on ? mFrom.nowStr : nowIn(mFrom.tz || 'Europe/Paris')).slice(0, 10) : null, dOffs = [];
  if (day0) for (let o = 0; o < 10 && dOffs.length < 3; o++) if (appWorkOn(addMin(day0 + 'T00:00', o * 1440), w.days)) dOffs.push(o);
  if (UI.dayOff != null && !dOffs.includes(UI.dayOff)) { dOffs.push(UI.dayOff); dOffs.sort((a, b) => a - b); }
  const dayLbl = o => o === 0 ? 'Aujourd’hui' : o === 1 ? 'Demain' : cap1(fmtDay(addMin(day0 + 'T00:00', o * 1440).slice(0, 10)));
  let head = `<div class="mod-h"><h2>🚦 Briefing départ</h2><span class="src obs">prévision météo</span></div>
  <div class="ctrl">
    <div class="fld"><span class="l">Voiture</span><div class="seg">${carSeg}</div></div>
    <div class="fld"><span class="l">Sens</span><div class="seg"><button data-act="dir" data-d="go" aria-pressed="${dir === 'go'}">Aller</button><button data-act="dir" data-d="ret" aria-pressed="${dir === 'ret'}">Retour</button></div></div>
    <div class="fld"><span class="l">Jour</span><div class="seg">${dOffs.map(k => `<button data-act="day" data-off="${k}" aria-pressed="${UI.dayOff === k}">${dayLbl(k)}</button>`).join('')}</div></div>
    <div class="fld"><label for="quick-work-${dir === 'go' ? 'dep' : 'ret'}">Heure de départ</label><input type="time" id="quick-work-${dir === 'go' ? 'dep' : 'ret'}" data-bind="work.${dir === 'go' ? 'dep' : 'ret'}" value="${esc(time)}"></div>
    <div class="fld"><label for="quick-work-durMin">Durée (min)</label><input type="number" id="quick-work-durMin" data-bind="work.durMin" data-num="1" min="5" max="1200" step="5" value="${esc(w.durMin)}" style="width:92px"></div>
    <div class="fld"><span class="l">Départ depuis</span><div class="seg">${allLocs().filter(l => l.id !== (dir === 'go' ? w.to : w.from)).slice(0, 4).map(l => `<button data-act="from" data-id="${esc(l.id)}" aria-pressed="${(dir === 'go' ? w.from : w.to) === l.id}">${esc(l.name.split(' / ')[0])}</button>`).join('')}</div></div>
    <div class="fld"><label for="quick-work-from">De</label><select id="quick-work-from" data-bind="work.from">${locOpts(w.from)}</select></div>
    <div class="fld"><label for="quick-work-to">Vers</label><select id="quick-work-to" data-bind="work.to">${locOpts(w.to)}</select></div>
  </div>`;
  if (td.err) { el.innerHTML = head + `<p class="muted">${esc(td.err)}</p>`; return; }
  const car = appActiveCar() || TCARS().find(c => c.id === UI.bcar) || TCARS()[0];
  if (!car) { el.innerHTML = head + '<p class="muted">Aucune voiture équipée de pneus.</p>'; return; }
  if (!hasTires(car)) { el.innerHTML = head + '<p class="muted">Pneus de la voiture active à renseigner.</p>'; return; }
  const wa = windowAssess(car, td.seq, 'trip'), sm = summarize(td.seq);
  if (!wa) { el.innerHTML = head + '<p class="muted">Données insuffisantes.</p>'; return; }
  const nar = narrate(car, wa, sm, 'au départ'), pf = carProfile(car), gen = pf.generic;
  const xD = td.A.hs[td.iDep], xA = td.B.hs[td.iArr];
  const cD = xD ? colStats([{ hs: td.A.hs, i: td.iDep }]) : null, cA = xA ? colStats([{ hs: td.B.hs, i: td.iArr }]) : null, cT = colStats(td.seq);
  const yn = (v, t) => v ? `<b style="color:var(--risk-t)">${t || 'oui'}</b>` : 'non';
  const ice = l => l == null ? '—' : `<span class="pill lv${l}">${ICE_LV[l]}</span>`;
  const R = (k, f) => `<tr><td class="k">${k}</td><td class="num">${cD ? f(cD, false) : '—'}</td><td class="num">${f(cT, true)}</td><td class="num">${cA ? f(cA, false) : '—'}</td></tr>`;
  const rows = [
    R('Température', (c, d) => d ? `min ${f1(c.T)} · max ${f1(c.Tmax)} °C` : `${f1(c.T)} °C`),
    R('Chaussée (estimée)', c => `${f1(c.Tr)} °C`),
    R('Pluie', (c, d) => `${f1(c.P)} mm/h${c.pp != null ? ` · ${f0(c.pp)} %` : ''}`),
    R('Visibilité', c => visTxt(c.vis)),
    R('Brouillard (< 1 000 m)', c => yn(c.fog, 'oui')),
    R('Risque de gel (≤ 1 °C)', c => yn(c.frost, 'possible')),
    R('Risque verglas (estimé)', c => ice(c.ice)),
    R('Risque neige', c => c.snow ? yn(1, 'prévue') : c.sleet ? 'neige mouillée (est.)' : 'non'),
    R('Vent / rafales', c => `${f0(c.wind)} / ${f0(c.gust)} km/h`)
  ].join('') + `<tr><td class="k">Soleil rasant dans l’axe</td><td class="num">—</td><td class="num">${td.glare ? `<b style="color:var(--risk-t)">oui vers ${td.glare.ts.slice(11, 16)}</b> · ${f0(td.glare.alt)}° au-dessus de l’horizon` : 'non'}</td><td class="num">—</td></tr>`;
  const mc = td.mont, effT = effType(car);
  const montTxt = mc.concerned ? montNoteHtml([{ name: td.toName, mc }], td.dep, car) : '';
  const routeTxt = `Cap ${capTxt(td.cap)} (${f0(td.cap)}°) · ${f0(td.dist)} km à vol d’oiseau${td.mids.length ? ` · ${td.midsLoaded}/${td.mids.length} points intermédiaires analysés (≈ tous les 50 km)` : ''}`;
  el.innerHTML = head + `<div class="sub">${esc(td.fromName)} → ${esc(td.toName)} · départ <b class="mono">${td.dep.slice(11, 16)}</b> le ${fmtDay(td.dep.slice(0, 10))} · arrivée <b class="mono">${td.arr.slice(11, 16)}</b>${td.past ? ' · <b style="color:var(--risk-t)">horaire déjà passé</b>' : ''}</div>
  ${gen ? genericNote(pf.gaps) : verdictHtml(wa.level)}
  <p class="expl">${gen ? '<b>Prévision de référence.</b> Renseigne tes lieux et ta monte pour évaluer ton départ.' : `<b>${esc(nar.head)}</b> ${esc(nar.body)}`}</p>
  ${gen ? '' : '<div class="sub">Réponse à « puis-je partir avec cette voiture et ces pneus ? » : un indice, pas une autorisation. La décision te revient.</div>'}
  <div class="scroll"><table class="tbl"><thead><tr><th></th><th>Départ · ${td.dep.slice(11, 16)}<br><span class="muted" style="text-transform:none;letter-spacing:0">${esc(td.fromName)}</span></th><th>Pendant le trajet</th><th>Arrivée · ${td.arr.slice(11, 16)}<br><span class="muted" style="text-transform:none;letter-spacing:0">${esc(td.toName)}</span></th></tr></thead><tbody>${rows}</tbody></table></div>
  ${montTxt}
  ${(() => { const times = [...new Set(td.seq.map(s => s.hs[s.i].t))]; const ws = [td.A, td.B].map(mm => ensWindow(mm.ens, times)).filter(Boolean);
     if (!ws.length) return ''; const w = ws.reduce((x, y) => ({ n: Math.max(x.n, y.n), pRoad0: Math.max(x.pRoad0, y.pRoad0), pAir0: Math.max(x.pAir0, y.pAir0), pIce: Math.max(x.pIce, y.pIce), pT5: Math.max(x.pT5, y.pT5), pRain: Math.max(x.pRain, y.pRain) }));
     return probBars(w, `PROBABILITÉS PENDANT LE TRAJET · ${esc(ENS_LABEL[td.A.ensModel] || '')}`); })()}
  ${feedbackBlock()}
  <div class="disc">${routeTxt}. ${td.mids.length ? 'Chaque heure est évaluée au point de la route le plus proche de ta position estimée (vitesse constante, ligne droite).' : (td.dur > 90 ? 'Première moitié évaluée au départ, seconde à l’arrivée.' : 'Trajet court : chaque heure est évaluée aux deux extrémités, le cas le plus défavorable est retenu.')}${gen ? '' : ` Score du trajet : <b class="mono">${wa.score}/100</b>.`}</div>`;
  el._td = td;
}

/* ---------- comparateur ---------- */
function renderCompare() {
  const el = $('#secCmp'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const td = tripData(); let seq, label;
  if (td.err) { seq = CX.seq; label = `les ${S.horizon} prochaines heures`; } else { seq = td.seq; label = `le trajet ${td.fromName} → ${td.toName} (${td.dep.slice(11, 16)}–${td.arr.slice(11, 16)})`; }
  const mode = td.err ? 'card' : 'trip', sm = summarize(seq);
  const res = TCARS().map(car => ({ car, w: windowAssess(car, seq, mode) })).filter(r => r.w);
  if (res.length < 2) { const wait = S.cars.filter(c => !hasTires(c)).map(c => c.short); el.hidden = false;
    el.innerHTML = `<div class="mod-h"><h2>🚗 Quelle voiture prendre ?</h2><span class="src">comparaison factuelle</span></div><p class="sub">${wait.length ? `Comparaison suspendue : ${esc(wait.join(', '))} en attente de pneus. Seule ${esc(res.map(r => r.car.short).join(', ') || 'aucune voiture')} est analysée.` : 'Comparaison indisponible.'}</p>`; return; }
  const wet = seq.some(s => { const x = s.hs[s.i]; return (x.P || 0) >= 0.1 || recentPrecip(s.hs, s.i, 2) >= 0.3; });
  const cold = sm.Tmin != null && sm.Tmin < 7;
  const best = [...res].sort((a, b) => b.w.score - a.w.score)[0], gap = Math.abs(res[0].w.score - res[1].w.score), genericCompare = res.some(r => carProfile(r.car).generic);
  const cards = res.map(({ car, w }) => {
    const L = [], t = effType(car);
    if (car.tire.type === 'unknown') L.push(['❔', 'Type de pneus inconnu : jugé comme des pneus été par prudence']);
    if (t === 'summer') {
      if (sm.Tmin != null && sm.Tmin < 5) L.push(['⚠️', cold && wet ? 'Route froide et humide' : 'Route froide']); else if (cold && wet) L.push(['⚠️', 'Route fraîche et humide']);
      if (sm.snowSum > 0 || sm.snowCode) L.push(['⚠️', 'Neige prévue : pneus été inadaptés']);
      if (sm.iceLevel >= 1) L.push(['⚠️', `Verglas ${ICE_LV[sm.iceLevel].toLowerCase()} (estimé)`]);
      if (sm.Tmin != null && sm.Tmin >= 10 && !wet) L.push(['✅', 'Température dans la plage normale du pneu été']);
    } else if (t === 'winter') {
      if (sm.Tmax != null && sm.Tmax >= 20) L.push(['⚠️', 'Douceur : usure accrue, précision réduite']);
      if (cold || sm.snowSum > 0) L.push(['✅', 'Pneu hiver cohérent avec le froid / la neige']);
    } else {
      if (sm.snowSum > 0 || sm.snowCode || sm.Tmin < -3) L.push(['⚠️', 'Conditions sévères : sous un excellent pneu hiver']);
      if (cold && wet) L.push(['✅', 'Configuration plus adaptée aux conditions froides/humides' + (w === best.w && gap >= 8 ? '' : '')]);
      else if (!cold) L.push(['✅', 'Polyvalent dans ces conditions']);
    }
    if (sm.Pmax >= 4) L.push(['⚠️', `Pluie jusqu’à ${f1(sm.Pmax)} mm/h`]);
    if (sm.visMin != null && sm.visMin < 1000) L.push(['⚠️', `Brouillard (${f0(sm.visMin)} m) : prudence quel que soit le pneu`]);
    if (!L.length) L.push(['✅', 'Aucune contrainte particulière détectée']);
    const gen = carProfile(car).generic;
    return `<div class="cmpc ${gen ? 'lvx' : 'lv' + w.level}"><div class="verdict sm ${gen ? 'lvx' : 'lv' + w.level}"><span class="em">${gen ? '🧪' : LV[w.level].emoji}</span><span>${esc(car.short)} · ${gen ? 'aperçu' : w.score + '/100'}</span></div>
      <div class="body"><b>Pneus ${TYPE_LABEL[car.tire.type]}</b><span class="muted mono" style="font-size:12px">${esc(car.tire.size)}</span>${L.map(([i, t]) => `<div>${gen && i === '✅' ? 'ℹ️' : i} ${esc(t)}</div>`).join('')}</div></div>`;
  }).join('');
  const [a, b] = res, sporty = res.find(r => r.car.sporty && effType(r.car) === 'summer');
  const why = [
    `Pneus : ${res.map(r => `${r.car.short} en ${TYPE_LABEL[r.car.tire.type]} (${esc(r.car.tire.size)})`).join(' ; ')}.`,
    `Conditions sur ${esc(label)} : ${f1(sm.Tmin)} à ${f1(sm.Tmax)} °C, chaussée estimée jusqu’à ${f1(sm.TrMin)} °C, pluie max ${f1(sm.Pmax)} mm/h, visibilité min ${visTxt(sm.visMin)}, ${sm.snowSum > 0 || sm.snowCode ? 'neige prévue' : 'pas de neige prévue'}, risque de verglas estimé ${ICE_LV[sm.iceLevel].toLowerCase()}.`,
    genericCompare ? 'Comparaison personnalisée en attente : renseigne les lieux et la monte de chaque voiture.' : gap < 5 ? `Les deux configurations obtiennent un indice proche (${a.w.score} et ${b.w.score}) : les pneus ne les distinguent pas nettement dans ces conditions.` : `Écart d’indice : ${gap} points en faveur de ${esc(best.car.short)} pour l’adéquation pneus/météo.`,
    sporty && (cold || wet) ? `${esc(sporty.car.short)} (usage sportif, ${esc(sporty.car.spec || 'puissance élevée')}) sollicite davantage l’adhérence disponible au démarrage et en sortie de courbe quand le pneu est froid.` : '',
    'Cette comparaison ne porte que sur les pneus et la météo. Elle ne tient pas compte de l’état des freins, de l’usure réelle, du chargement ni de ton expérience : le choix t’appartient.'
  ].filter(Boolean);
  el.innerHTML = `<div class="mod-h"><h2>🚗 Quelle voiture prendre ?</h2><span class="src">comparaison factuelle</span></div>
    <div class="cmp">${cards}</div><div class="why">${why.map(t => `<span>${t}</span>`).join('')}</div>`;
}

/* ---------- verglas ---------- */
function renderIce() {
  const el = $('#secIce'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const { m, sum24 } = CX, n = m.nowI, c = m.cur;
  const peakX = sum24.iceI ? sum24.iceI.hs[sum24.iceI.i] : null;
  const lvN = c.ice ? c.ice.level : null, lvP = sum24.iceLevel;
  const cells = []; for (let k = 0; k <= 24; k++) { const x = m.hs[n + k]; cells.push(`<i class="lv${x && x.ice && x.ice.level != null ? x.ice.level : 'x'}" title="${x ? x.t.slice(11, 16) + ' · ' + iceName(x.ice && x.ice.level) : ''}"></i>`); }
  const f = peakX && peakX.ice ? peakX.ice.factors : [];
  el.innerHTML = `<div class="mod-h"><h2>❄️ Risque verglas</h2><span class="src est">risque estimé</span></div>
    <div class="iceHead"><div><div class="sub">Maintenant</div><div class="iceLvl lv${lvN == null ? 'x' : lvN}">${iceName(lvN)}</div></div>
    <div><div class="sub">Pic sur 24 h${peakX ? ' · ' + peakX.t.slice(11, 16) + ' · chaussée est. ' + f1(peakX.Tr) + ' °C' : ''}</div><div class="iceLvl lv${lvP == null ? 'x' : lvP}">${iceName(lvP)}</div></div></div>
    <div><div class="scale lv${lvP == null ? 'x' : lvP}">${[0, 1, 2, 3].map(k => `<span class="${lvP != null && k <= lvP ? 'on' : ''}"></span>`).join('')}</div><div class="scale-l"><span>FAIBLE</span><span>MODÉRÉ</span><span>ÉLEVÉ</span><span>TRÈS ÉLEVÉ</span></div></div>
    <div><div class="sub" style="margin-bottom:4px">Heure par heure · 24 h</div><div class="strip" style="height:16px">${cells.join('')}</div><div class="strip-l"><span>${m.hs[n].t.slice(11, 16)}</span><span>${m.hs[n + 12] ? m.hs[n + 12].t.slice(11, 16) : ''}</span><span>${m.hs[n + 24] ? m.hs[n + 24].t.slice(11, 16) : ''}</span></div></div>
    ${(() => { const w = ensWindow(m.ens, m.hs.slice(n, n + 25).map(x => x.t)); return w ? `<div class="note lv${pLv(w.pRoad0)}"><b>PROBABILITÉ</b><span>Chaussée sous 0 °C dans ${pct(w.pRoad0)} des scénarios ${esc(ENS_LABEL[m.ensModel] || '')} sur 24 h${w.tRoad0 ? ' (pic vers ' + w.tRoad0.slice(11, 16) + ')' : ''} · verglas élevé ${pct(w.pIce)}.</span></div>` : ''; })()}
    ${f.length ? `<div><div class="sub" style="margin-bottom:4px">Facteurs au pic</div><ul class="factors">${f.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '<p class="sub">Aucun facteur de gel significatif sur 24 h.</p>'}
    <p class="disc">Risque calculé à partir de la température de l’air, du point de rosée, de l’humidité, de la pluie récente, des précipitations, de la chaussée estimée et du passage sous 0 °C. Ce n’est pas une observation routière : un pont ou une zone ombragée peut geler avant.</p>`;
}

/* ---------- graphique 24 h ---------- */
function renderChartShell() {
  const el = $('#secChart'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  el.innerHTML = `<div class="mod-h"><h2>📈 Graphique 24 h</h2><span class="src">mesuré/prévision + estimé</span></div>
   <div class="legend"><span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--c-air)" stroke-width="2.4"/></svg>Air (prévision)</span>
   <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--c-road)" stroke-width="2.4" stroke-dasharray="5 3"/></svg>Chaussée (estimé)</span>
   <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--c-dew)" stroke-width="2" stroke-dasharray="1.5 3"/></svg>Point de rosée</span>
   ${CX.m.ens ? '<span><svg viewBox="0 0 22 8"><rect x="0" y="0" width="22" height="8" fill="var(--c-air)" opacity=".25"/></svg>Air : 80 % des scénarios</span>' : ''}
   <span><svg viewBox="0 0 22 8"><rect x="4" y="0" width="12" height="8" fill="var(--c-rain)" opacity=".8"/></svg>Pluie mm/h</span>
   <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--cau-t)" stroke-width="1.6" stroke-dasharray="4 3"/></svg>7 °C</span>
   <span><svg viewBox="0 0 22 8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--c-ice)" stroke-width="2.4"/></svg>0 °C</span></div>
   <div class="chartbox" id="chartbox" tabindex="0" role="application" aria-label="Graphique 24 heures. Flèches gauche et droite pour changer d’heure."></div>
   <div class="sub">Touche ou glisse sur le graphique pour lire une heure. La bande sous les barres de pluie signale une visibilité inférieure à 1 000 m.</div>
   <div class="readout" id="readout" aria-live="polite"></div>`;
  drawChart(); renderReadout();
}
function chartRange() { const m = CX.m; return [Math.max(0, m.nowI - 2), Math.min(m.hs.length - 1, m.nowI + 24)]; }
function drawChart() {
  const box = $('#chartbox'); if (!box || !CX) return;
  const m = CX.m, [i0, i1] = chartRange(), pts = m.hs.slice(i0, i1 + 1), W = Math.max(300, Math.round(box.clientWidth || 340)), H = 280;
  const Lm = 34, Rm = 32, Tm = 14, Bm = 36, pw_ = W - Lm - Rm, plotH = H - Tm - Bm, tempH = Math.round(plotH * 0.72), rainTop = Tm + tempH + 12, rainH = plotH - tempH - 12;
  const vals = []; pts.forEach(x => { [x.T, x.Tr, x.Td].forEach(v => v != null && vals.push(v)); const s = m.ens && m.ens.get(x.t); if (s) vals.push(s.p10, s.p90); });
  const ymin = Math.min(...vals, 0) - 1.5, ymax = Math.max(...vals, 7) + 1.5;
  const X = k => Lm + pw_ * (k / Math.max(1, pts.length - 1)), Y = v => Tm + tempH * (1 - (v - ymin) / (ymax - ymin));
  const span = ymax - ymin, step = span > 24 ? 10 : span > 12 ? 5 : span > 6 ? 2 : 1;
  let g = '';
  for (let v = Math.ceil(ymin / step) * step; v <= ymax; v += step) g += `<line x1="${Lm}" x2="${W - Rm}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${Lm - 5}" y="${Y(v) + 3}" text-anchor="end">${v}°</text>`;
  const z0 = Y(0), zb = Tm + tempH;
  const freeze = ymin < 0 ? `<defs><pattern id="hat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--c-ice)" stroke-width="1.2" opacity=".5"/></pattern></defs><rect x="${Lm}" y="${z0}" width="${pw_}" height="${zb - z0}" fill="url(#hat)"/><rect x="${Lm}" y="${z0}" width="${pw_}" height="${zb - z0}" fill="var(--c-ice)" opacity=".10"/>` : '';
  let band = '';
  if (m.ens) { const up = [], lo = []; pts.forEach((x, k) => { const s = m.ens.get(x.t); if (s) { up.push(X(k).toFixed(1) + ' ' + Y(s.p90).toFixed(1)); lo.unshift(X(k).toFixed(1) + ' ' + Y(s.p10).toFixed(1)); } });
    if (up.length > 2) band = `<path d="M${up.join('L')}L${lo.join('L')}Z" fill="var(--c-air)" opacity=".16"/>`; }
  const lines = `<line x1="${Lm}" x2="${W - Rm}" y1="${z0}" y2="${z0}" stroke="var(--c-ice)" stroke-width="2"/><text x="${W - Rm + 4}" y="${z0 + 3}" style="fill:var(--c-ice);font-weight:600">0°</text>
    <line x1="${Lm}" x2="${W - Rm}" y1="${Y(7)}" y2="${Y(7)}" stroke="var(--cau-t)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - Rm + 4}" y="${Y(7) + 3}" style="fill:var(--cau-t)">7°</text>`;
  const path = key => { let d = '', pen = false; pts.forEach((x, k) => { const v = x[key]; if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); return d; };
  const pmax = Math.max(2, ...pts.map(x => x.P || 0)), bw = Math.max(3, pw_ / pts.length * 0.62);
  let rain = `<line x1="${Lm}" x2="${W - Rm}" y1="${rainTop + rainH}" y2="${rainTop + rainH}" stroke="var(--line2)"/><text x="${W - Rm + 4}" y="${rainTop + 8}">${f0(pmax)}</text><text x="${W - Rm + 4}" y="${rainTop + rainH}">0</text><text x="${Lm - 5}" y="${rainTop + 8}" text-anchor="end">mm/h</text>`;
  pts.forEach((x, k) => { const p = x.P || 0; if (p > 0) { const h = Math.max(1.5, rainH * Math.min(p, pmax) / pmax); rain += `<rect x="${X(k) - bw / 2}" y="${rainTop + rainH - h}" width="${bw}" height="${h}" fill="${(x.snow || 0) > 0.05 ? 'var(--c-ice)' : 'var(--c-rain)'}" opacity=".85"/>`; } });
  let fog = '', xl = '';
  const fy = rainTop + rainH + 4;
  pts.forEach((x, k) => {
    if (x.vis != null && x.vis < 1000) fog += `<rect x="${X(k) - bw / 2}" y="${fy}" width="${bw}" height="5" fill="${x.vis < 200 ? 'var(--nogo)' : x.vis < 500 ? 'var(--risk)' : 'var(--cau)'}"/>`;
    if (x.hh % 3 === 0) xl += x.hh === 0 ? `<text x="${X(k)}" y="${H - 8}" text-anchor="middle" style="fill:var(--fg);font-weight:600">${x.date.slice(8)}/${x.date.slice(5, 7)}</text>` : `<text x="${X(k)}" y="${H - 8}" text-anchor="middle">${pad(x.hh)}h</text>`;
    if (x.hh === 0 && k > 0) xl += `<line x1="${X(k)}" x2="${X(k)}" y1="${Tm}" y2="${rainTop + rainH}" stroke="var(--line2)" stroke-dasharray="2 3"/>`;
  });
  const kn = m.nowI - i0, nowL = `<line x1="${X(kn)}" x2="${X(kn)}" y1="${Tm}" y2="${rainTop + rainH}" stroke="var(--accent)" stroke-width="1.2"/><text x="${X(kn) + 3}" y="${Tm + 9}" style="fill:var(--accent)">maintenant</text>`;
  if (UI.chartIdx == null || UI.chartIdx < i0 || UI.chartIdx > i1) UI.chartIdx = m.nowI;
  const ks = UI.chartIdx - i0, xs = pts[ks];
  let sel = `<line x1="${X(ks)}" x2="${X(ks)}" y1="${Tm}" y2="${rainTop + rainH}" stroke="var(--fg)" stroke-width="1.2" opacity=".8"/>`;
  [['T', 'var(--c-air)'], ['Tr', 'var(--c-road)'], ['Td', 'var(--c-dew)']].forEach(([k, col]) => { if (xs[k] != null) sel += `<circle cx="${X(ks)}" cy="${Y(xs[k])}" r="4.5" fill="var(--panel)" stroke="${col}" stroke-width="2.2"/>`; });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Température, chaussée estimée, point de rosée et pluie sur 24 heures">${g}${freeze}${band}${lines}${rain}${fog}${xl}
    <path d="${path('Td')}" fill="none" stroke="var(--c-dew)" stroke-width="2" stroke-dasharray="1.5 3.5" stroke-linecap="round"/>
    <path d="${path('Tr')}" fill="none" stroke="var(--c-road)" stroke-width="2.4" stroke-dasharray="6 3.5" stroke-linejoin="round"/>
    <path d="${path('T')}" fill="none" stroke="var(--c-air)" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>${nowL}${sel}</svg>`;
  const svg = box.firstChild, pick = e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width), k = Math.round((x - Lm) / pw_ * (pts.length - 1));
    const idx = i0 + clamp(k, 0, pts.length - 1);
    if (idx !== UI.chartIdx) { UI.chartIdx = idx; if (!drawChart.raf) drawChart.raf = requestAnimationFrame(() => { drawChart.raf = 0; drawChart(); renderReadout(); }); }
  };
  svg.addEventListener('pointerdown', pick); svg.addEventListener('pointermove', pick);
  box.onkeydown = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const [a, b] = chartRange(); UI.chartIdx = clamp(UI.chartIdx + (e.key === 'ArrowLeft' ? -1 : 1), a, b); drawChart(); renderReadout(); box.focus(); } };
}
function renderReadout() {
  const el = $('#readout'); if (!el || !CX) return;
  const m = CX.m, x = m.hs[UI.chartIdx]; if (!x) return;
  const cars = TCARS().map(car => { const v = hourVerdict(car, m.hs, UI.chartIdx); return v ? (carProfile(car).generic ? `<span class="pill lvx">${esc(car.short)} 🧪 aperçu</span>` : `<span class="pill lv${v.level}">${esc(car.short)} ${LV[v.level].emoji} ${v.score}/100</span>`) : ''; }).join('');
  const kv = (k, v) => `<div><span class="k">${k}</span><span class="v">${v}</span></div>`;
  el.innerHTML = `<div class="hh">${fmtDay(x.date)} · ${pad(x.hh)}:00 · ${esc(wx(x.code))}</div>
   <div class="ro-grid">${kv('Air', f1(x.T) + ' °C')}${kv('Ressentie', f1(x.Tapp) + ' °C')}${kv('Chaussée (est.)', f1(x.Tr) + ' °C')}${kv('Point de rosée', f1(x.Td) + ' °C')}${kv('Humidité', f0(x.RH) + ' %')}
   ${kv('Pluie', f1(x.Pl) + ' mm/h' + (x.pp != null ? ' · ' + f0(x.pp) + ' %' : ''))}${kv('Neige', f1(x.snow) + ' cm')}${kv('Visibilité', visTxt(x.vis))}${kv('Vent / rafales', f0(x.wind) + ' / ' + f0(x.gust) + ' km/h')}
   ${kv('Nuages', f0(x.cloud) + ' %')}${kv('Pression', f0(x.pres) + ' hPa')}${kv('Risque verglas (est.)', iceName(x.ice && x.ice.level) + (x.ice && x.ice.score != null ? ' · ' + x.ice.score : ''))}</div>
   <div class="ro-cars">${cars}</div>`;
}

/* ---------- 7 jours ---------- */
function renderDays() {
  const el = $('#secDays'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const { m } = CX, today = m.nowStr.slice(0, 10);
  const ds = m.days.filter(d => dayDiff(today, d.date) >= 0).slice(0, 7);
  const gmin = Math.min(...ds.map(d => d.tmin ?? 99), 0) - 1, gmax = Math.max(...ds.map(d => d.tmax ?? -99), 7) + 1, X = v => ((v - gmin) / (gmax - gmin) * 100).toFixed(1);
  const rows = ds.map(d => {
    const dt = new Date(d.date + 'T12:00:00Z'), pips = CX.cars.filter(c => hasTires(c.car)).map(c => { const di = dayInfosOne(m, c.car, d.date); return `<i class="pip lv${di == null ? 'x' : di}" title="${esc(c.car.short)} : ${di == null ? '—' : LV[di].name}"></i>`; }).join('');
    return `<div class="dayrow"><div class="dn">${dayDiff(today, d.date) === 0 ? 'auj.' : DAYN[dt.getUTCDay()]}<b>${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}</b></div>${icon(d.code)}
      <div class="rng" title="${esc(wx(d.code))}"><div class="track"></div><div class="m0" style="left:${X(0)}%"></div><div class="m7" style="left:${X(7)}%"></div>
        <div class="fill" style="left:${X(d.tmin ?? 0)}%;width:${Math.max(2, X(d.tmax ?? 0) - X(d.tmin ?? 0))}%"></div></div>
      <div class="pr"><span class="num" style="color:var(--c-air)">${f0(d.tmin)}°</span> / <span class="num" style="color:var(--fg)">${f0(d.tmax)}°</span><br>${(d.psum || 0) >= 0.1 ? f1(d.psum) + ' mm' : '—'}${(d.ssum || 0) > 0 ? ' · ❄ ' + f1(d.ssum) + ' cm' : ''}</div>
      ${UI.view === 'meteo' ? `<div class="pips dm">${d.pmax != null ? '☂ ' + f0(d.pmax) + ' %' : ''}${d.uv != null ? '<br>UV ' + f0(d.uv) : ''}</div>` : `<div class="pips">${pips}</div>`}</div>`;
  }).join('');
  el.innerHTML = `<div class="mod-h"><h2>📆 Prévisions 7 jours</h2><span class="src obs">prévision météo</span></div>
   <div class="sub">Barre = min → max. Repères : 0 °C (bleu) et 7 °C (jaune). ${UI.view === 'meteo' ? 'À droite : probabilité de pluie maximale et indice UV maximal du jour.' : `Carrés = verdict pneus du jour (${CX.cars.filter(c => hasTires(c.car)).map(c => esc(c.car.short)).join(', ')}).`}</div><div class="days">${rows}</div>`;
}
function dayInfosOne(m, car, date) {
  const idx = []; m.hs.forEach((x, i) => { if (x.date === date) idx.push({ hs: m.hs, i }); });
  const w = idx.length ? windowAssess(car, idx, 'trip') : null; return w ? w.level : null;
}
function renderWeatherLink() {
  const el = $('#secWeatherLink'); el.hidden = UI.view !== 'pneus';
  if (el.hidden) return;
  const c = CX && CX.m.cur, l = curLoc();
  el.innerHTML = `<div><h3>🌦️ Météo · ${esc(l.name)}</h3><p>${c ? `${f1(c.T)} °C · ${esc(wx(c.code))} · ${rainClass(c.P) || 'précipitations non disponibles'} · visibilité ${visTxt(c.vis)}` : 'Données météo indisponibles'}</p></div><button class="btn" data-act="weather-details">Détails météo →</button>`;
}

// @include app/season-actions.js
/* ---------- saison pneus ---------- */
function renderSeason() {
  // Une actualisation météo ne doit pas interrompre la saisie de la confirmation.
  if (MOUNT_FORM && document.activeElement && document.activeElement.matches('#secSeason input[data-mount-field]')) return;
  const el = $('#secSeason'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const cards = CX.cars.filter(c => c.season).map(({ car, season: s }) => { const ci = S.cars.indexOf(car);
    const di = s.days.slice(0, 14);
    const cells = days => days.map(d => { const dt = new Date(d.date + 'T12:00:00Z'), label = d.level == null ? 'Données insuffisantes' : LV[d.level].name;
      return `<div class="cell lv${d.level == null ? 'x' : d.level}" role="img" aria-label="${fmtDay(d.date)} · minimum ${f0(d.tmin)} degrés, maximum ${f0(d.tmax)} degrés · ${label}" title="${fmtDay(d.date)} · ${label}"><b>${DAYN[dt.getUTCDay()]}${pad(dt.getUTCDate())}</b><span class="lo">${f0(d.tmin)}°</span>/<span class="hi">${f0(d.tmax)}°</span></div>`; }).join('');
    const cal = `<div class="season-week"><div class="sub">Jours 1 à 7 · prévisions min / max</div><div class="cal">${cells(di.slice(0, 7))}</div></div>${di.length > 7 ? `<div class="season-week trend"><div class="sub">Jours 8 à 14 · tendance plus incertaine</div><div class="cal">${cells(di.slice(7))}</div></div>` : ''}`;
    let cd = '';
    if (car.plan && car.plan.on && car.tire.type !== 'winter') {
      const plan = car.plan, n = s.countdown && s.countdown.n;
      const planTxt = [plan.brand, plan.model].filter(Boolean).join(' ') || 'pneus hiver';
      const etaDate = plan.etaTo || plan.etaFrom, etaTxt = plan.etaFrom && plan.etaTo && plan.etaFrom !== plan.etaTo
        ? `${fmtDay(plan.etaFrom)} → ${fmtDay(plan.etaTo)}`
        : etaDate ? fmtDay(etaDate) : 'non renseignée';
      const today = CX.m.nowStr.slice(0, 10);
      const supplyStatus = !etaDate ? 'À RENSEIGNER' : today < (plan.etaFrom || etaDate) ? 'EN ATTENTE' : today <= etaDate ? 'FENÊTRE ETA' : 'ETA DÉPASSÉE';
      const apptTxt = plan.appointmentConfirmed && !plan.appointmentDate
        ? 'confirmation incomplète · date à renseigner'
        : plan.appointmentDate ? `${plan.appointmentConfirmed ? 'confirmé' : 'à confirmer'} · ${fmtDay(plan.appointmentDate)}` : 'non confirmé';
      const mountLabel = s.countdown && s.countdown.kind === 'confirmed' ? 'avant rendez-vous confirmé' : 'avant montage estimé';
      const covered = s.countdown ? s.countdown.weatherCoveredDays || 0 : 0, remaining = s.countdown ? s.countdown.weatherRemainingDays || 0 : 0;
      const etaConflict = !!(plan.date && etaDate && plan.date < etaDate && !(plan.appointmentConfirmed && plan.appointmentDate));
      const etaRangeInvalid = !!(plan.etaFrom && plan.etaTo && plan.etaFrom > plan.etaTo);
      const apptIncomplete = !!plan.appointmentConfirmed && !plan.appointmentDate;
      cd = `<div class="stat lvx"><span class="sub">Prochaine monte : ${esc(planTxt)}${plan.size ? ' · ' + esc(plan.size) : ''}</span>
        ${n == null ? '<span class="sub">Date de montage estimée non renseignée.</span>' : `<span class="cd num">${n > 0 ? 'J-' + pad(n) : n === 0 ? 'Jour J' : 'J+' + pad(-n)}</span><span class="sub">${n > 0 ? esc(mountLabel) : 'date de montage atteinte ou dépassée'} · ${fmtDay(s.countdown.date)}</span>`}
        <span class="sub"><b>Commande</b> · ${plan.ordered ? fmtDay(plan.ordered) : 'date non renseignée'}</span>
        <span class="sub"><b>Approvisionnement</b> · ${esc(supplyStatus)} · ETA ${esc(etaTxt)}${plan.etaChecked ? ' · vérifié ' + fmtDay(plan.etaChecked) : ''}</span>
        <span class="sub"><b>Rendez-vous</b> · ${esc(apptTxt)}</span>
        ${etaConflict ? '<div class="note lv2"><b>COHÉRENCE</b><span>Le montage estimé est antérieur à la dernière ETA fournisseur. Vérifie les deux dates.</span></div>' : ''}
        ${etaRangeInvalid ? '<div class="note lv2"><b>COHÉRENCE</b><span>La fin de l’ETA fournisseur est antérieure à son début. Corrige la fenêtre.</span></div>' : ''}
        ${apptIncomplete ? '<div class="note lv2"><b>COHÉRENCE</b><span>Le rendez-vous est marqué confirmé mais aucune date n’est renseignée. Il ne remplace pas le montage estimé.</span></div>' : ''}
        ${n == null ? '' : `<div class="note lv${remaining > 0 ? 1 : 0}"><b>COUVERTURE MÉTÉO</b><span>${covered} jour${covered > 1 ? 's' : ''} analysé${covered > 1 ? 's' : ''} sur ${Math.max(0, n)} avant ${s.countdown.kind === 'confirmed' ? 'le rendez-vous' : 'le montage'}.${remaining > 0 ? ` ${remaining} jour${remaining > 1 ? 's' : ''} encore non évaluable${remaining > 1 ? 's' : ''} : aucune conclusion météo n’est extrapolée au-delà de la fenêtre disponible.` : ' Toute la période restante est couverte par les prévisions disponibles.'}</span></div>`}
        <details class="wx-how"><summary>Mettre à jour le suivi</summary>
          <div class="frow">
            <div class="fld"><label for="f-cars-${ci}-plan-ordered">Commande passée</label><input type="date" id="f-cars-${ci}-plan-ordered" data-bind="cars.${ci}.plan.ordered" value="${esc(plan.ordered)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-eta-from">ETA fournisseur · début</label><input type="date" id="f-cars-${ci}-plan-eta-from" data-bind="cars.${ci}.plan.etaFrom" value="${esc(plan.etaFrom)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-eta-to">ETA fournisseur · fin</label><input type="date" id="f-cars-${ci}-plan-eta-to" data-bind="cars.${ci}.plan.etaTo" value="${esc(plan.etaTo)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-eta-checked">ETA vérifiée le</label><input type="date" id="f-cars-${ci}-plan-eta-checked" data-bind="cars.${ci}.plan.etaChecked" value="${esc(plan.etaChecked)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-date">Montage estimé</label><input type="date" id="f-cars-${ci}-plan-date" data-bind="cars.${ci}.plan.date" value="${esc(plan.date)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-appt">Date du rendez-vous</label><input type="date" id="f-cars-${ci}-plan-appt" data-bind="cars.${ci}.plan.appointmentDate" value="${esc(plan.appointmentDate)}"></div>
            <div class="fld"><label for="f-cars-${ci}-plan-appt-ok">Rendez-vous confirmé</label><select id="f-cars-${ci}-plan-appt-ok" data-bind="cars.${ci}.plan.appointmentConfirmed" data-num="1"><option value="1" ${plan.appointmentConfirmed ? 'selected' : ''}>Oui</option><option value="0" ${plan.appointmentConfirmed ? '' : 'selected'}>Non</option></select></div>
          </div>
        </details>
        <div class="chips"><button class="btn" data-act="mount-open" data-car="${esc(car.id)}"${DEMO.on ? ' disabled' : ''}>Montage effectué</button></div>${mountDraft(car)}</div>`;
      if (s.coldBefore) cd += `<div class="note lv3"><b>ALERTE</b><span>Période froide ${s.coldBefore.severe ? 'avec conditions hivernales' : '(≥ 2 nuits à 2 °C ou moins)'} prévue dès le ${fmtDay(s.coldBefore.first.date)}, avant ${s.countdown.kind === 'confirmed' ? 'le rendez-vous confirmé' : 'le montage estimé'} du ${fmtDay(s.countdown.date)}.${s.coldBefore.partial ? ' La météo disponible ne couvre pas toute la période restante.' : ''}</span></div>`;
    }
    return `<div class="season lv${s.level}"><h3>${esc(car.name)} · pneus ${TYPE_LABEL[car.tire.type]}</h3>
      <div class="stat"><b>${esc(s.title)}</b><span>${esc(s.text)}</span></div>${cd}
      ${car.tire.type === 'winter' && car.tire.mounted ? `<p class="sub" role="status">Montage enregistré : ${esc(fmtDay(car.tire.mounted))}${Number.isFinite(car.tire.mountKm) ? ' · compteur ' + car.tire.mountKm.toLocaleString('fr-FR') + ' km' : ''}</p>` : ''}
      ${cal}<div class="season-legend" aria-label="Légende des verdicts pneus">${[['lv0', 'Adapté'], ['lv1', 'Vigilance'], ['lv2', 'Risque élevé'], ['lv3', 'Déconseillé'], ['lvx', 'Données insuffisantes']].map(([lv, text]) => `<span class="${lv}"><i aria-hidden="true"></i>${text}</span>`).join('')}</div></div>`;
  }).join('');
  const form = el.querySelector('.mount-form');
  el.innerHTML = `<div class="mod-h"><h2>🍂 Saison pneus</h2><span class="src">prévisions + suivi du montage</span></div><div class="grid2">${cards}</div>
   <p class="disc">Fiabilité décroissante au-delà de 5 à 7 jours. Le seuil de 7 °C est une règle pratique, pas une frontière physique.</p>`;
  const fresh = el.querySelector('.mount-form');
  if (form && fresh && form.dataset.car === fresh.dataset.car) { fresh.replaceWith(form); form.querySelector('.mount-message').textContent = MOUNT_FORM.msg; }
}

/* ---------- journal de saison ---------- */
function recordJournal() {
  const m = M[S.locs[0].id]; if (!m || m.nowI < 0 || DEMO.on || m.mode !== 'live') return;
  const today = m.nowStr.slice(0, 10), J = S.journal || (S.journal = {}); let changed = false;
  [addMin(today + 'T00:00', -1440).slice(0, 10), today].forEach(date => {
    if (date === today && +m.nowStr.slice(11, 13) < 9) return;
    const idx = []; m.hs.forEach((x, i) => { if (x.date === date && x.hh <= 9) idx.push(i); }); if (idx.length < 8) return;
    const xs = idx.map(i => m.hs[i]), mn = k => Math.min(...xs.map(x => x[k]).filter(v => v != null));
    const depI = m.byTime.get(date + 'T' + S.work.dep.slice(0, 2) + ':00');
    const lv = {}; TCARS().forEach(c => { const v = depI != null ? hourVerdict(c, m.hs, depI) : null; if (v) lv[c.id] = v.level; });
    const rec = { T: Math.round(mn('T') * 10) / 10, Tr: Math.round(mn('Tr') * 10) / 10, ice: Math.max(...xs.map(x => x.ice && x.ice.level || 0)), vis: Math.round(mn('vis')), lv };
    if (JSON.stringify(J[date]) !== JSON.stringify(rec)) { J[date] = rec; changed = true; }
  });
  const keys = Object.keys(J).sort(); if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => delete J[k]);
  if (changed) lsSet('twrc.settings.v1', JSON.stringify(S));   // un journal automatique ne configure pas les lieux et voitures
}
function renderJournal() {
  const el = $('#secJournal'); if (!el) return; if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const J = S.journal || {}, today = CX.m.nowStr.slice(0, 10), y = +today.slice(0, 4), start = (+today.slice(5, 7) >= 9 ? y : y - 1) + '-09-01';
  const days = Object.keys(J).filter(d => d >= start).sort(), rec = days.map(d => ({ d, ...J[d] }));
  const cnt = f => rec.filter(f).length, first = f => (rec.find(f) || {}).d;
  const ff = first(r => r.T <= 0), fr = first(r => r.Tr <= 0);
  const tile = (k, v, n) => `<div class="mt"><span class="k">${k}</span><span class="v">${v}</span>${n ? `<span class="n">${n}</span>` : ''}</div>`;
  const cells = []; for (let k = 59; k >= 0; k--) { const d = addMin(today + 'T00:00', -k * 1440).slice(0, 10), r = J[d];
    const c = !r ? 'lvx' : r.T <= 0 ? 'lv3' : r.T < 3 ? 'lv2' : r.T < 7 ? 'lv1' : 'lv0';
    cells.push(`<i class="${c}" title="${fmtDay(d)}${r ? ' · min ' + f1(r.T) + ' °C · chaussée ' + f1(r.Tr) + ' °C' : ' · non enregistré'}"></i>`); }
  el.innerHTML = `<div class="mod-h"><h2>📓 Journal de saison</h2><span class="src">depuis le ${fmtDay(start)}</span></div>
   <div class="metrics">${tile('Matins enregistrés', rec.length, '')}${tile('Sous 7 °C', cnt(r => r.T < 7), 'repère pneus hiver')}${tile('Sous 3 °C', cnt(r => r.T < 3), '')}${tile('Gel (≤ 0 °C)', cnt(r => r.T <= 0), '')}${tile('Verglas modéré ou plus', cnt(r => r.ice >= 1), 'estimé')}${tile('Premier gel', ff ? fmtDay(ff) : '—', fr ? 'chaussée ≤ 0 °C : ' + fmtDay(fr) : 'chaussée : pas encore')}</div>
   <div><div class="sub" style="margin-bottom:4px">60 derniers matins (0–9 h, ${esc(S.locs[0].name)}) · gris = non enregistré</div><div class="strip jr">${cells.join('')}</div>
   <div class="strip-l"><span>${fmtDay(addMin(today + 'T00:00', -59 * 1440).slice(0, 10))}</span><span>aujourd’hui</span></div></div>
   <p class="disc">Enregistré automatiquement à chaque ouverture, à partir des prévisions recalées sur la station quand elle est disponible. Les matins où l’app n’a pas été ouverte sont rattrapés sur 1 jour.</p>`;
}

/* ---------- alertes ---------- */
function renderAlerts() {
  const el = $('#secAlerts'); if (!CX) { el.innerHTML = ''; el.hidden = true; return; } el.hidden = false;
  const items = ALERT_DEFS.map(d => ({ d, a: CX.alerts[d.id], on: !!S.alerts[d.id] }));
  const rank = i => (i.on && i.a) ? 10 + i.a.sev : i.on ? 1 : 0;
  items.sort((x, y) => rank(y) - rank(x));
  const act = items.filter(i => i.on && i.a).length;
  el.innerHTML = `<div class="mod-h"><h2>🔔 Alertes</h2><span class="src">${act} active${act > 1 ? 's' : ''} · 24 h</span></div>
   ${vigiBlock()}<div>${items.map(({ d, a, on }) => `<div class="al${on ? '' : ' off'}"><div><label class="sw"><input type="checkbox" data-alert="${d.id}" ${on ? 'checked' : ''} aria-label="${esc(d.label)}"><i></i></label></div>
     <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;min-width:0"><div style="min-width:0"><div class="t">${esc(a && on ? a.title : d.label)}</div><div class="d">${on ? (a ? esc(a.detail) : (d.id === 'pre' && S.cars.some(c => c.plan.on && c.tire.type !== 'winter' && !(c.plan.date || (c.plan.appointmentConfirmed && c.plan.appointmentDate))) ? 'Renseigne un montage estimé ou un rendez-vous confirmé (Saison pneus) pour activer cette alerte.' : 'Non déclenchée')) : 'Désactivée'}</div></div>
     ${on && a ? `<span class="sev lv${a.sev}">${a.sev >= 3 ? 'DANGER' : a.sev === 2 ? 'ATTENTION' : 'INFO'}</span>` : `<span class="sev none">${on ? 'RAS' : 'OFF'}</span>`}</div></div>`).join('')}</div>
   <p class="disc">Les alertes sont recalculées à chaque actualisation et visibles à l’ouverture de la page. Aucune notification n’est envoyée quand la page est fermée.</p>`;
}

/* ---------- paramètres ---------- */
const bindIn = (path, val, o = {}) => `<div class="fld${o.wide ? ' wide' : ''}"><label for="f-${path.replace(/\./g, '-')}">${o.label}</label><input type="${o.type || 'text'}" id="f-${path.replace(/\./g, '-')}" data-bind="${path}" ${o.num ? 'data-num="1"' : ''} ${o.attrs || ''} value="${esc(val == null ? '' : val)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}></div>`;
function renderSettings(force) {
  const el = $('#settingsBody'); if (!el) return;
  if (storeLocked() || window.TWRC_STORAGE_ERROR) { el.innerHTML = '<p>Déverrouille la configuration pour retrouver tes réglages et ton journal conservés sur cet appareil.</p>'; return; }
  const d = $('#settings'); if (!force && d && !d.open) { el.innerHTML = ''; el.dataset.stale = '1'; return; }
  el.dataset.stale = '';
  const carSet = S.cars.map((c, i) => `<div class="set-sec"><h3>${esc(c.name)}</h3>${c.photo ? `<div class="chips"><button class="btn sm" data-act="photo-del" data-i="${i}">Retirer la photo</button></div>` : ''}
    <div class="frow">${bindIn(`cars.${i}.name`, c.name, { label: 'Nom', wide: 1 })}${bindIn(`cars.${i}.short`, c.short, { label: 'Nom court' })}
      <div class="fld"><label for="f-cars-${i}-sporty">Usage sportif occasionnel</label><select id="f-cars-${i}-sporty" data-bind="cars.${i}.sporty" data-num="1"><option value="1" ${c.sporty ? 'selected' : ''}>Oui</option><option value="0" ${c.sporty ? '' : 'selected'}>Non</option></select></div>
      <div class="fld"><label for="f-cars-${i}-tire-type">Type de pneus montés</label><select id="f-cars-${i}-tire-type" data-bind="cars.${i}.tire.type"><option value="summer" ${c.tire.type === 'summer' ? 'selected' : ''}>Été</option><option value="winter" ${c.tire.type === 'winter' ? 'selected' : ''}>Hiver</option><option value="allseason" ${c.tire.type === 'allseason' ? 'selected' : ''}>4 saisons 3PMSF</option><option value="unknown" ${c.tire.type === 'unknown' ? 'selected' : ''}>Je ne sais pas</option><option value="none" ${c.tire.type === 'none' ? 'selected' : ''}>Aucun (en attente de pneus)</option></select></div>
      ${(() => { const comp = compatible(c), k = sizeKey(c.tire.size || (c.sets && c.sets.summer && c.sets.summer.size) || ''), cur = findTire(c.tire.brand, c.tire.model);
        const recent = d => d.added && dayDiff(d.added, new Date().toISOString().slice(0, 10)) <= 60;
        const opt = d => `<option value="${TIRE_DB.indexOf(d)}" ${cur === d ? 'selected' : ''}>${recent(d) ? '★ ' : ''}${esc(d.brand + ' ' + d.model)}${d.sizes && k && d.sizes[k] ? ' · ' + esc(d.sizes[k]) : ''}</option>`;
        const grp = (list, lbl) => list.length ? `<optgroup label="${lbl}">${list.map(opt).join('')}</optgroup>` : '';
        const by = ty => comp.filter(d => d.type === ty);
        const others = TIRE_DB.filter(d => !comp.includes(d));
        return `<div class="fld wide"><label for="f-db-${i}">Choisir dans la base · ${comp.length} modèles en ${esc(k || 'dimension inconnue')}</label><select id="f-db-${i}" data-db="${i}"><option value="">—</option>
          ${grp(by('summer'), 'Été · ' + (k || ''))}${grp(by('winter'), 'Hiver · ' + (k || ''))}${grp(by('allseason'), '4 saisons · ' + (k || ''))}${grp(others, 'Autres dimensions')}</select></div>`; })()}
      ${bindIn(`cars.${i}.tire.brand`, c.tire.brand, { label: 'Marque du pneu', ph: 'ex. Michelin' })}${bindIn(`cars.${i}.tire.model`, c.tire.model, { label: 'Modèle exact', ph: 'ex. Pilot Sport 4' })}
      ${bindIn(`cars.${i}.tire.size`, c.tire.size, { label: 'Dimensions / indices' })}${(() => { const x = treadAxles(c.tire); return bindIn(`cars.${i}.tire.treadAv`, x.av, { label: 'Profondeur avant (mm)', type: 'number', num: 1, attrs: 'min="0" max="12" step="0.1" inputmode="decimal"' }) + bindIn(`cars.${i}.tire.treadAr`, x.ar, { label: 'Profondeur arrière (mm)', type: 'number', num: 1, attrs: 'min="0" max="12" step="0.1" inputmode="decimal"' }); })()}
      <div class="fld"><label for="f-cars-${i}-tire-treadEst">Origine des profondeurs</label><select id="f-cars-${i}-tire-treadEst" data-bind="cars.${i}.tire.treadEst" data-num="1"><option value="0" ${c.tire.treadEst ? '' : 'selected'}>Mesurées (jauge)</option><option value="1" ${c.tire.treadEst ? 'selected' : ''}>Estimées</option></select></div>
      ${bindIn(`cars.${i}.tire.press`, c.tire.press, { label: 'Pression recommandée (bar)', ph: 'ex. 2,4 AV / 2,3 AR' })}${bindIn(`cars.${i}.tire.mounted`, c.tire.mounted, { label: 'Date de montage', type: 'date' })}
      ${bindIn(`cars.${i}.tire.dot`, c.tire.dot, { label: 'Code DOT (semaine + année)', ph: 'ex. 2321', attrs: 'inputmode="numeric" maxlength="4"' })}
      ${bindIn(`cars.${i}.tire.info`, c.tire.info, { label: 'Fiche du pneu (fabrication, indices…)', wide: 1 })}
      <div class="fld"><label for="odo-${i}">Compteur actuel (km)</label><div style="display:flex;gap:6px"><input type="number" id="odo-${i}" inputmode="numeric" min="0" step="1" placeholder="${lastOdo(c) ? lastOdo(c).km : 'ex. 42150'}" style="flex:1;min-width:0"><button class="btn sm" data-act="odo" data-i="${i}">Enregistrer</button></div></div>
      <div class="fld wide"><label for="trd-${i}">Nouveau relevé de profondeur (mm)</label><div style="display:flex;gap:6px"><input type="number" id="trd-${i}" inputmode="decimal" min="0" max="12" step="0.1" placeholder="ex. 6,5" style="flex:1;min-width:0"><button class="btn sm" data-act="tread-add" data-i="${i}">Enregistrer</button></div>
        <div style="display:flex;gap:6px;margin-top:6px"><select id="trdax-${i}" aria-label="Essieu du relevé" style="flex:1;min-width:0"><option value="both">AV + AR</option><option value="av">Avant seul</option><option value="ar">Arrière seul</option></select><select id="trdest-${i}" aria-label="Origine du relevé" style="flex:1;min-width:0"><option value="0">Mesure (jauge)</option><option value="1">Estimation</option></select></div></div>
      ${bindIn(`cars.${i}.tire.mountKm`, c.tire.mountKm, { label: 'Compteur au montage (km)', type: 'number', num: 1, attrs: 'step="1" inputmode="numeric"' })}
      <div class="fld"><span class="l">Permutation AV/AR</span><button class="btn sm" data-act="rot" data-i="${i}">Permutation faite aujourd’hui</button></div>
      ${bindIn(`cars.${i}.tire.pchk.date`, (c.tire.pchk || {}).date, { label: 'Dernier contrôle pression', type: 'date' })}${bindIn(`cars.${i}.tire.pchk.T`, (c.tire.pchk || {}).T, { label: 'Température au contrôle (°C)', type: 'number', num: 1, attrs: 'step="0.5"' })}</div>
    <div class="frow"><div class="fld wide"><label for="f-cars-${i}-plan-on">Pneus hiver prévus</label><select id="f-cars-${i}-plan-on" data-bind="cars.${i}.plan.on" data-num="1"><option value="1" ${c.plan.on ? 'selected' : ''}>Oui, suivre le montage</option><option value="0" ${c.plan.on ? '' : 'selected'}>Non</option></select></div>
      ${bindIn(`cars.${i}.plan.brand`, c.plan.brand, { label: 'Marque' })}${bindIn(`cars.${i}.plan.model`, c.plan.model, { label: 'Modèle' })}${bindIn(`cars.${i}.plan.size`, c.plan.size, { label: 'Dimensions / indices' })}</div>
    <div class="frow">
      ${bindIn(`cars.${i}.plan.ordered`, c.plan.ordered, { label: 'Commande passée', type: 'date' })}${bindIn(`cars.${i}.plan.etaFrom`, c.plan.etaFrom, { label: 'ETA fournisseur · début', type: 'date' })}${bindIn(`cars.${i}.plan.etaTo`, c.plan.etaTo, { label: 'ETA fournisseur · fin', type: 'date' })}${bindIn(`cars.${i}.plan.etaChecked`, c.plan.etaChecked, { label: 'ETA vérifiée le', type: 'date' })}</div>
    <div class="frow">
      ${bindIn(`cars.${i}.plan.date`, c.plan.date, { label: 'Montage estimé', type: 'date' })}${bindIn(`cars.${i}.plan.appointmentDate`, c.plan.appointmentDate, { label: 'Date du rendez-vous', type: 'date' })}
      <div class="fld"><label for="f-cars-${i}-plan-appt-ok">Rendez-vous confirmé</label><select id="f-cars-${i}-plan-appt-ok" data-bind="cars.${i}.plan.appointmentConfirmed" data-num="1"><option value="1" ${c.plan.appointmentConfirmed ? 'selected' : ''}>Oui</option><option value="0" ${c.plan.appointmentConfirmed ? '' : 'selected'}>Non</option></select></div></div></div>`).join('');
  const locSet = S.locs.map((l, i) => `<div class="frow">${bindIn(`locs.${i}.name`, l.name, { label: i === 0 ? 'Zone principale' : 'Lieu de travail / 2e zone', wide: 1 })}${bindIn(`locs.${i}.lat`, l.lat, { label: 'Latitude', type: 'number', num: 1, attrs: 'step="0.0001"' })}${bindIn(`locs.${i}.lon`, l.lon, { label: 'Longitude', type: 'number', num: 1, attrs: 'step="0.0001"' })}</div>`).join('') +
    S.customs.map((l, i) => `<div class="frow">${bindIn(`customs.${i}.name`, l.name, { label: 'Destination', wide: 1 })}${bindIn(`customs.${i}.lat`, l.lat, { label: 'Latitude', type: 'number', num: 1, attrs: 'step="0.0001"' })}${bindIn(`customs.${i}.lon`, l.lon, { label: 'Longitude', type: 'number', num: 1, attrs: 'step="0.0001"' })}<div class="fld"><span class="l">&nbsp;</span><button class="btn sm" data-act="loc-del" data-i="${i}">Retirer</button></div></div>`).join('');
  el.innerHTML = `<div class="set-sec"><h3>🚗 Voitures et pneus</h3></div>${carSet}
    <div class="set-sec"><h3>📍 Lieux</h3>${locSet}
      <div class="fld"><label for="geoQ">Ajouter une destination ou une adresse</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input type="search" id="geoQ" placeholder="Adresse, ville ou lieu" style="flex:1;min-width:140px"><button class="btn" data-act="geo-search">Rechercher</button></div><span class="sub">France : IGN / Base Adresse Nationale · monde : OpenStreetMap. Recherche uniquement quand tu appuies sur « Rechercher ».</span></div><div class="hits" id="geoHits"></div></div>
    <div class="set-sec"><h3>📚 Base pneus</h3><p class="sub">${TIRE_DB_META.count} modèles · ${TIRE_DB_META.version ? 'version ' + TIRE_DB_META.version + ' du ' + esc(TIRE_DB_META.updated || '') : 'base de secours'} (${esc(TIRE_DB_META.source)}). ${S.cars.map(c => `${esc(c.short)} : ${compatible(c).length} compatibles`).join(' · ')}. Mise à jour automatique chaque mois ; ★ = nouveauté de moins de 60 jours.</p></div>
    <div class="set-sec"><h3>🎯 Calibration terrain</h3><p class="sub">Corrections apprises de tes retours, lieu par lieu : <b class="mono">${(() => { const xs = allLocs().map(l => ({ l, c: calibFor(l.id) })).filter(x => x.c.n); return xs.length ? xs.map(x => esc(x.l.name) + ' ' + (x.c.applied ? (x.c.bias > 0 ? '+' : '') + f1(x.c.bias) + ' °C' : 'aucune (' + x.c.n + '/' + CALIB_MIN + ')')).join(' · ') : 'aucune'; })()}</b>. Un retour isolé est une observation : une correction n’est appliquée qu’à partir de ${CALIB_MIN} retours cohérents au même lieu, et seulement à ce lieu.</p><div class="chips"><button class="btn sm" data-act="calib-reset">Effacer la calibration</button></div></div>
    <div class="set-sec"><h3>📡 Ma position</h3><p class="sub">${GPS ? `Dernière position : <b>${esc(GPS.name)}</b>${GPS.sub ? ', ' + esc(GPS.sub) : ''} (±${GPS.acc || '?'} m, ${new Date(GPS.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}). L’app s’ouvre sur ta position et se recale quand tu te déplaces de plus de 3 km. La position reste sur ce téléphone.` : 'Touche « 📍 Ma position » en haut pour suivre la météo de l’endroit où tu es.'}</p>
      ${GPS ? '<div class="chips"><button class="btn sm" data-act="locate">Actualiser ma position</button><button class="btn sm" data-act="gps-forget">Oublier ma position</button></div>' : ''}</div>
    <div class="set-sec"><h3>🔔 Notifications du matin</h3>
      <p class="sub">Chaque matin de trajet domicile-travail (${daysTxt(S.work.days)}), de 90 à 5 minutes avant ton départ de ${esc(S.work.dep)}, un relais automatique (GitHub) recalcule le verdict du trajet toutes les 15 minutes depuis tes deux points de départ. Il t’envoie une notification si une voiture passe en 🟠 ou 🔴, s’il y a un risque de verglas ou du brouillard sous 500 m, puis une nouvelle uniquement si la situation s’aggrave (3 au maximum). Aucun nom de lieu n’apparaît dans les notifications. 1. Installe l’app gratuite <b>ntfy</b> (App Store). 2. <b>+</b> → sujet ci-dessous, serveur ntfy.sh. 3. Autorise les notifications.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="ntfyTopic" readonly value="${esc(window.TWRC_NTFY || '')}" style="flex:1;min-width:160px"><button class="btn" data-act="copy" data-for="ntfyTopic" data-v="${esc(window.TWRC_NTFY || '')}">Copier</button><button class="btn" data-act="ntfy-test">Envoyer un test</button></div></div>
    <div class="set-sec"><h3>📱 Widget écran d’accueil</h3>
      <p class="sub">1. Installe l’app gratuite <b>Scriptable</b> (App Store). 2. Dans Scriptable, <b>+</b> → colle le script (bouton ci-dessous) → nomme-le « Race Control ». 3. Écran d’accueil : appui long → <b>+</b> → Scriptable → taille <b>moyenne</b> → touche le widget → Script : « Race Control ». Le widget se met à jour seul (iOS décide du rythme, en général toutes les 15 à 30 min).</p>
      <div class="chips"><button class="btn" data-act="copy-widget">Copier le script du widget</button><a class="btn" href="widget.js" target="_blank" rel="noopener">Voir le script</a></div></div>
    <div class="set-sec"><h3>🧪 Moteur météo v2 (preuves)</h3><p class="sub">Observation : calculé et journalisé à côté du moteur actuel, sans changer les verdicts. Actif : le phénomène critique prouvé passe en tête de l’onglet Météo.</p><div class="seg" role="group" aria-label="Moteur v2">${[['off', 'Désactivé'], ['shadow', 'Observation'], ['on', 'Actif']].map(([v, t]) => `<button data-act="ev-flag" data-v="${v}" aria-pressed="${EV_FLAG() === v}">${t}</button>`).join('')}</div></div>
    <div class="set-sec"><h3>⚠️ Vigilance Météo-France</h3><div class="frow">${bindIn('dept.code', S.dept.code, { label: 'Département (numéro)', ph: 'ex. 33' })}${bindIn('dept.name', S.dept.name, { label: 'Nom du département', ph: 'ex. Gironde' })}</div></div>
    <div class="set-sec"><h3>⏰ Ouverture automatique le matin</h3>
      <p class="sub">Sur iPhone : app <b>Raccourcis</b> → <b>Automatisation</b> → <b>+</b> → <b>Heure de la journée</b> (ex. 06:45, jours de semaine) → <b>Exécuter immédiatement</b> → action <b>Ouvrir les URL</b> avec l’adresse ci-dessous. La page s’ouvre seule chaque matin avec les verdicts à jour.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="autoUrl" readonly value="${esc(location.href.split('#')[0].split('?')[0])}" style="flex:1;min-width:160px"><button class="btn" data-act="copy" data-for="autoUrl" data-v="${esc(location.href.split('#')[0].split('?')[0])}">Copier</button></div></div>
    <div class="set-sec"><h3>🧭 Trajet</h3><div class="frow">${bindIn('work.dep', S.work.dep, { label: 'Départ aller', type: 'time' })}${bindIn('work.ret', S.work.ret, { label: 'Départ retour', type: 'time' })}${bindIn('work.durMin', S.work.durMin, { label: 'Durée (min)', type: 'number', num: 1, attrs: 'min="5" max="1200" step="5"' })}</div>
      <div class="fld"><span class="l">Jours de trajet domicile-travail</span><div class="seg wdays">${WDN.map((n, k) => `<button data-act="wday" data-d="${k + 1}" aria-pressed="${commuteDays(S.work.days).includes(k + 1)}">${n}</button>`).join('')}</div></div>
      <p class="sub">Les autres jours (télétravail, repos) : pas de briefing domicile-travail, le briefing passe directement au prochain jour de trajet. L’agenda reste actif 7 j/7. Les notifications du matin suivent la configuration chiffrée du relais : si ton rythme change, fais-la mettre à jour aussi.</p></div>
    <div class="set-sec"><h3>🚧 Événements routiers</h3><p class="sub">DATEX · Bison Futé / DIR. Couverture partielle du réseau national non concédé. Filtrage local sur le trajet OSRM ; aucune position transmise à DATEX. Alertes visuelles pendant le trajet, app ouverte. Vitesses et ETA trafic indisponibles.</p><div class="fld"><label for="f-road-on">Signalements sur mon trajet</label><select id="f-road-on" data-bind="road.on" data-num="1"><option value="1" ${S.road.on ? 'selected' : ''}>Activés</option><option value="0" ${S.road.on ? '' : 'selected'}>Désactivés</option></select></div></div>
    <div class="set-sec"><h3>🔬 Analyse</h3><div class="frow"><div class="fld"><label for="f-horizon">Horizon des verdicts</label><select id="f-horizon" data-bind="horizon" data-num="1">${[6, 12, 24].map(h => `<option value="${h}" ${S.horizon === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></div>${bindIn('rainThr', S.rainThr, { label: 'Forte pluie (mm/h)', type: 'number', num: 1, attrs: 'min="1" max="30" step="0.5"' })}</div></div>
    <div class="set-sec" id="bkSec"><h3>💾 Sauvegarde</h3>
      <p class="sub">Journal, DOT, usure, kilométrage, pressions, photos, calibration et réglages, dans un seul fichier <b>chiffré avec ton code</b>. À faire avant de changer de téléphone ou de vider Safari. Sur le nouveau téléphone : Importer, puis le même code. Dernière sauvegarde : <b>${lsGet('twrc.lastbackup') ? fmtDay(lsGet('twrc.lastbackup')) : 'jamais'}</b>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="password" id="bkPw" autocomplete="current-password" placeholder="${lsGet('twrc.key') ? 'code (vide = code de déverrouillage)' : 'code, 8 caractères minimum'}" style="flex:1;min-width:160px">
        <button class="btn pri" data-act="bk-export">Exporter</button><label class="btn" for="bkFile">Importer</label><input type="file" id="bkFile" accept=".json,application/json,text/plain" hidden></div>
      <p class="sub" id="bkMsg" aria-live="polite"></p></div>
    <div class="set-sec"><h3>🗂️ Données</h3><div class="frow"><div class="fld"><label for="demoSel">Scénario de démonstration</label><select id="demoSel">${Object.keys(DEMO_SCN).map(k => `<option value="${k}">${esc(DEMO_SCN[k].name)}</option>`).join('')}</select></div></div>
      <div class="chips"><button class="btn" data-act="demo-sel">Lancer la démo (données simulées)</button><button class="btn" data-act="reset">Réinitialiser les réglages</button>${window.TWRC_SEALED && !LOCKED() ? '<button class="btn" data-act="lock">Verrouiller cet appareil</button>' : ''}${LOCKED() && lsGet('twrc.nocode') ? '<button class="btn" data-act="withcode">J’ai un code de déverrouillage</button>' : ''}</div>
      <p class="disc">Les réglages sont enregistrés dans ce navigateur.</p></div>
    <div class="set-sec"><h3>🏷️ Version</h3><p class="sub" id="verLine">${verLine()}</p></div>
    <div class="set-sec"><h3>🩺 Diagnostic</h3><p class="sub">Sources et précision à l’écran ; positions arrondies à environ 1 km dans la copie, sans adresse ni titre de rendez-vous.</p>
      <dl class="diag" id="diagBox">${diagHtml()}</dl><div class="chips"><button class="btn" data-act="diag-copy">Copier le diagnostic</button></div></div>`;
  loadVersion(); loadSwVersion();
}
// @include app/diagnostics.js
/* ---------- orchestration du rendu ---------- */
function renderAll() {
  if (APP_CONTEXT.rendering) return;
  APP_CONTEXT.rendering = true;
  try {
    appRefreshContext(); recordJournal();
    renderView(); renderTripView(); renderTripSummary(); renderDecisionCore(); renderStatus(); renderLocChips(); renderDayContext(); renderSrc(); renderNotice(); renderBanners(); renderBrfCore(); renderCal(); renderCurrent(); renderWeatherLink(); renderTenue(); renderTip(); renderCars(); renderBrief(); renderCompare(); renderIce(); renderChartShell(); renderDays(); renderRadar(); renderAir(); renderSeason(); renderJournal(); renderAlerts();
    renderWx(); renderLab(); renderDebrief(); labThermTick(false); roadSync();
  } finally { APP_CONTEXT.rendering = false; }
}
function softRender() { renderAll(); } // paramètres inchangés ; mêmes sélecteurs de contexte


/* ---------- événements ---------- */
let geoSearchGen = 0;
function commandFeedback(button, message, input) {
  if (button) { button.textContent = message; button.setAttribute('aria-live', 'polite'); }
  if (input) input.focus();
}
document.addEventListener('click', async e => {
  const j = e.target.closest('.jump a');
  if (j) { e.preventDefault(); const el = document.querySelector(j.getAttribute('href')); if (el) { if (el.tagName === 'DETAILS') { el.open = true; renderSettings(true); } el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); } return; }
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act;
  if (a === 'cal-origin-open' || a === 'cal-origin-close' || a === 'cal-origin-search' || a === 'cal-origin-pick' || a === 'cal-origin-save' || a === 'cal-origin-reset') { await calOriginAction(a, t); return; }
  if (a === 'trip-dest-search') { await tripSearch('destination', t); return; }
  if (a === 'trip-origin-search') { await tripSearch('origin', t); return; }
  if (a === 'trip-dest-pick') { tripPick('destination', t.dataset.i); return; }
  if (a === 'trip-origin-pick') { tripPick('origin', t.dataset.i); return; }
  if (a === 'trip-dest-known') { tripPickKnown(t.dataset.id); return; }
  if (a === 'trip-plan') { tripProgram(t); return; }
  if (a === 'trip-plan-cancel') { tripCancelPlan(); return; }
  if (a === 'day-destination') { if (t.dataset.agendaKey) appChooseAgendaDestination(t.dataset.agendaKey); else appChooseDestination(t.dataset.id || null); return; }
  if (a === 'day-type') { appSetDayType(t.dataset.v); return; }
  if (a === 'day-car') { appSetCar(t.dataset.id || null); return; }
  if (a === 'decision-car-change') { decisionOpenCarChooser(); return; }
  if (a === 'refresh') refreshAll();
  else if (a === 'unlock') {
    const pw = ($('#unlockPw') || {}).value || '', msg = $('#unlockMsg'); if (msg) msg.textContent = 'Déchiffrement…';
    const ok = await unseal(pw.trim()); if (ok) { if (!unseal.restored) { try { APP_STORAGE.removeItem('twrc.presetv'); } catch (err) { /* stockage */ } } location.reload(); } else if (msg) msg.textContent = unseal.error || 'Code incorrect.';
  }
  else if (a === 'lock') { await lockDevice(t); }
  else if (a === 'locate') locate(true);
  else if (a === 'trip-preview') tripPreviewStart(t.dataset.key);
  else if (a === 'trip-cancel') tripCancelStart(t.dataset.key);
  else if (a === 'trip-cancel-undo') tripCancelUndo(t.dataset.id);
  else if (a === 'return-home') returnHomeStart(t.dataset.key);
  else if (a === 'return-home-done') returnHomeDone(t.dataset.key);
  else if (a === 'return-home-undo') returnHomeUndo();
  else if (a === 'caldirect') { const k = t.dataset.k; S.calDirect = { ...(S.calDirect || {}) }; if (S.calDirect[k]) delete S.calDirect[k]; else S.calDirect[k] = 1; markEdit('calDirect'); saveSettings(); renderCal(); renderBrf(); renderTenue(); }
  else if (a === 'tip') { TIP_OFF += +t.dataset.d || 1; renderTip(); }
  else if (a === 'nocode') { lsSet('twrc.nocode', '1'); renderNotice(); roadSync(); const d = $('#settings'); if (d) { d.open = true; renderSettings(true); d.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); } }
  else if (a === 'withcode') { try { localStorage.removeItem('twrc.nocode'); } catch (err) { /* stockage */ } renderNotice(); roadSync(); window.scrollTo({ top: 0, behavior: scrollBehavior() }); }
  else if (a === 'bk-export') backupExport();
  else if (a === 'view') chooseView(t.dataset.v);
  else if (a === 'brf-lab') { chooseView('analyse'); try { window.scrollTo(0, 0); } catch (e) { /* défilement indisponible */ } }
  else if (a === 'weather-details') chooseView('meteo');
  else if (a === 'outfit-day') { UI.outfitDay = t.dataset.v === '1' ? 1 : 0; renderTenue(); }
  else if (a === 'outfit-occasion') { appAction(() => { appDay().outfitChoice = { date: addMin(placeToday() + 'T00:00', UI.outfitDay * 1440).slice(0, 10), occasion: ['office', 'walk'].includes(t.dataset.v) ? t.dataset.v : 'outing' }; }); }
  else if (a === 'rplay') radarPlay(!RADAR.play);
  else if (a === 'rcenter') radarCenter(true);
  else if (a === 'gps-forget') { stopGps(); gpsWeatherOrigin = gpsNameOrigin = null; gpsWeatherGen++; gpsNameGen++; GPS = null; GEO.raw = null; GEO.error = null; GEO.reason = ''; GEO.status = 'suivi désactivé'; PLACE_FIX = PLACE_PENDING = PLACE_REJ = null; PLACE_HOLD = false; alertLoc('Suivi de position désactivé.'); WEATHER_REQUESTS.cancelGroup('gps'); S.gpsAuto = 0; saveSettings(); try { localStorage.removeItem('twrc.gps'); localStorage.removeItem('twrc.cache.gps'); } catch (err) { /* stockage */ } delete RAW.gps; delete ENSRAW.gps; delete NOWRAW.gps; delete AQRAW.gps; FIX = FIXPREV = null; liveReset(); tripPreviewReset(); UI.loc = S.locs[0].id; rebuild(); renderSettings(); renderAll(); }
  else if (a === 'loc') { APP_CONTEXT.weatherPreview = t.dataset.id; UI.loc = t.dataset.id; UI.chartIdx = null; UI.locsOpen = false;
    // Après un choix météo depuis le GPS, retrouver le cockpit sans les raccourcis dépliés.
    if (placeNow().source === 'gps') UI.placeExpanded = null;
    renderAll(); }
  else if (a === 'locs-toggle') { UI.locsOpen = !UI.locsOpen; renderLocChips(); }
  else if (a === 'tire') { const c = S.cars.find(x => x.id === t.dataset.car); switchTire(c, t.dataset.type); const ci = S.cars.indexOf(c); markEdit(`cars.${ci}.tire`); markEdit(`cars.${ci}.sets`); saveSettings(); renderSettings(); softRender(); }
  else if (a === 'fb') {
    const m = M[UI.loc]; if (!m || m.nowI < 0) { commandFeedback(t, 'Météo indisponible pour ce relevé'); return; }
    const x = m.hs[m.nowI], raw = x.Tr != null ? Math.round((x.Tr - (m.roadBias || 0)) * 10) / 10 : null;
    S.calib = (S.calib || []).concat([{ t: m.nowStr, loc: UI.loc, kind: t.dataset.k, Tr: raw, T: x.T }]).slice(-30);
    saveSettings(); applyCalib(); rebuild(); renderAll();
  }
  else if (a === 'photo-del') { const c = S.cars[+t.dataset.i]; if (c) { delete c.photo; saveSettings(); renderSettings(); softRender(); } }
  else if (a === 'odo' || a === 'tread-add' || a === 'rot') {
    const i = +t.dataset.i, c = S.cars[i], today = (M[UI.loc] && M[UI.loc].nowStr.slice(0, 10)) || new Date().toISOString().slice(0, 10);
    if (!c) { commandFeedback(t, 'Véhicule indisponible'); return; }
    if (a === 'odo') { const input = $('#odo-' + i), v = parseFloat((input || {}).value); if (!isFinite(v) || v < 0) { commandFeedback(t, 'Saisis un compteur positif ou nul', input); return; } c.odo = (c.odo || []).filter(o => o.d !== today).concat([{ d: today, km: Math.round(v) }]).slice(-60); }
    if (a === 'tread-add') { const input = $('#trd-' + i), v = parseFloat(String((input || {}).value).replace(',', '.')); if (!isFinite(v) || v < 0 || v > 12) { commandFeedback(t, 'Saisis une profondeur de 0 à 12 mm', input); return; } const lo = lastOdo(c);
      const mm = Math.round(v * 10) / 10, ax = ($('#trdax-' + i) || {}).value || 'both', est = ($('#trdest-' + i) || {}).value === '1';
      c.tire.treads = (c.tire.treads || []).concat([{ d: today, mm, km: lo ? lo.km : null, ...(ax !== 'both' ? { ax } : {}), ...(est ? { est: 1 } : {}) }]).slice(-30);
      setTreadAxle(c.tire, ax === 'av' || ax === 'ar' ? ax : 'both', mm); c.tire.treadEst = est ? 1 : 0; }
    if (a === 'rot') { const lo = lastOdo(c); if (!lo) { t.textContent = 'Enregistre d’abord le compteur'; return; } c.tire.lastRot = lo.km; }
    saveSettings(); renderSettings(); softRender(); commandFeedback($(`#settings [data-act="${a}"][data-i="${i}"]`), 'Enregistré');
  }
  else if (a === 'calib-reset') {
    if (!confirm('Effacer tous les retours de calibration et les corrections apprises ? Cette action est définitive.')) return;
    S.calib = []; saveSettings(); applyCalib(); rebuild(); renderSettings(); renderAll();
  }
  else if (a === 'pchk') { const c = S.cars.find(x => x.id === t.dataset.car), m = M[UI.loc]; if (!c) { commandFeedback(t, 'Véhicule indisponible'); return; } c.tire.pchk = { date: m ? m.nowStr.slice(0, 10) : new Date().toISOString().slice(0, 10), T: m && m.cur.T != null ? Math.round(m.cur.T * 10) / 10 : null }; saveSettings(); renderSettings(); softRender(); }
  else if (a === 'ntfy-test') {
    try { const r = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: window.TWRC_NTFY, title: 'Race Control · test', message: 'Les notifications du matin arrivent bien sur ce téléphone.', tags: ['white_check_mark'], click: location.href.split('#')[0] }) });
      t.textContent = r.ok ? 'Test envoyé' : 'Échec (' + r.status + ')'; } catch (err) { t.textContent = 'Réseau indisponible'; }
  }
  else if (a === 'copy-widget') {
    try {
      if (!window.__wjs) { const r = await fetch('widget.js', { cache: 'no-store' }); if (!r.ok) throw new Error('Script indisponible'); window.__wjs = await r.text(); }
      const home = S.locs[0], work = S.locs[1];
      const cfg = { home: { id: home.id, name: home.name, lat: home.lat, lon: home.lon }, work: { id: work.id, name: work.name, lat: work.lat, lon: work.lon }, dep: S.work.dep, durMin: S.work.durMin, days: commuteDays(S.work.days),
        cars: S.cars.map(c => ({ short: c.short, sporty: c.sporty, tire: { type: c.tire.type, size: c.tire.size, tread: c.tire.tread ?? null, dot: c.tire.dot || '' }, plan: { on: 0 } })) };
      await navigator.clipboard.writeText(window.__wjs.replace(/const CFG = null;[^\n]*/, 'const CFG = ' + JSON.stringify(cfg) + ';'));
      t.textContent = 'Script copié (avec tes voitures)';
    }
    catch (err) { t.textContent = 'Copie impossible : ouvre « Voir le script »'; }
  }
  else if (a === 'diag-copy') { renderDiag(); try { await navigator.clipboard.writeText(diagText()); t.textContent = 'Copié'; } catch (err) { t.textContent = 'Copie impossible'; } }
  else if (a === 'copy') { const v = t.dataset.v; try { await navigator.clipboard.writeText(v); t.textContent = 'Copié'; } catch (err) { const i = document.getElementById(t.dataset.for); if (i) { i.focus(); i.select(); } commandFeedback(t, i ? 'Texte sélectionné : copie manuellement' : 'Copie impossible'); } }
  else if (a === 'from') { if (UI.dir === 'go') { S.work.from = t.dataset.id; markEdit('work.from'); } else { S.work.to = t.dataset.id; markEdit('work.to'); } saveSettings(); softRender(); }
  else if (a === 'dir') { UI.dir = t.dataset.d; UI.dayOff = null; softRender(); }
  else if (a === 'day') { UI.dayOff = +t.dataset.off; softRender(); }
  else if (a === 'debrief-condition') debriefPick('condition', t.dataset.v);
  else if (a === 'debrief-grip') debriefPick('grip', t.dataset.v);
  else if (a === 'debrief-save') debriefSave();
  else if (a === 'debrief-later') debriefLater();
  else if (a === 'debrief-open') debriefOpen(t.dataset.key);
  else if (a === 'debrief-clear') debriefClear();
  else if (a === 'trip-arrived') { if (LIVE.key) liveArrive('confirmé'); }
  else if (a === 'trip-start') liveStart(t.dataset.key);
  else if (a === 'lab-drive-forget') {
    const car = labCar(); if (!car || DEMO.on || LIVE.phase === 'active') return;
    const history = ttLoad(); delete history[car.id]; lsSet(TT_KEY, JSON.stringify(history));
    LAB_DRIVE_NOTE[car.id] = { text: 'Historique thermique oublié pour cette voiture.' };
    renderLab.clearDriveDraft = true; renderAll();
  }
  else if (a === 'place-confirm') placeConfirm(t.dataset.place, t.dataset.how);
  else if (a === 'place-toggle') {
    const d = placeDisclosure(placeNow()), focused = document.activeElement === t;
    UI.placeExpanded = d.expanded ? null : d.key; renderPlace();
    const button = $('#placeBar [data-act=place-toggle]'); if (focused && button) button.focus({ preventScroll: true });
  }
  else if (a === 'place-leave') placeLeave();
  else if (a === 'ev-report') reportAdd(t.dataset.k);
  else if (a === 'ev-flag') { S.flags = S.flags || {}; S.flags.weatherEvidenceV2 = t.dataset.v; saveSettings(); renderSettings(true); renderAll(); }
  else if (a === 'trip-undo') appAction(() => { const d = LIVE.lastDone; if (d) { USER_STORE.state.debrief = Debrief.undo(USER_STORE.state.debrief, d.key); if (TRIPEND && TRIPEND.key === d.key) TRIPEND = null; DEBRIEF_FORM = null; delete LIVE.done[d.key]; liveDonePersist(d.key, null); LIVE.noAuto[d.key] = Date.now() + 10 * 60e3; if (PLACE.conf && (d.placeId === PLACE.conf.placeId || PLACE.conf.at === d.at)) PLACE.conf = null; LIVE.lastDone = null; } });
  else if (a === 'tripmap') { lsSet('twrc.tripmap', lsGet('twrc.tripmap') === '1' ? '0' : '1'); renderBrf(); }
  else if (a === 'wday') {
    const d = +t.dataset.d, cur = commuteDays(S.work.days).slice(), k = cur.indexOf(d);
    if (k >= 0) { if (cur.length === 1) { commandFeedback(t, 'Garde au moins un jour de trajet'); return; } cur.splice(k, 1); } else cur.push(d);   // au moins un jour de trajet
    S.work.days = cur.sort((a, b) => a - b); markEdit('work.days'); UI.dayOff = null; saveSettings(); renderSettings(); softRender();
  }
  else if (a === 'bcar') { appSetCar(t.dataset.car); }
  else if (a === 'demo') startDemo(t.dataset.scn || 'froid');
  else if (a === 'demo-sel') startDemo(($('#demoSel') || {}).value || 'froid');
  else if (a === 'demo-off') { DEMO.on = false; rebuild(); renderAll(); refreshAll(); }
  else if (a === 'mount-open') mountOpen(t.dataset.car);
  else if (a === 'mount-save') mountSave();
  else if (a === 'mount-cancel') { MOUNT_FORM = null; renderSeason(); }
  else if (a === 'labcar') { appSetCar(t.dataset.car); }
  else if (a === 'goset-cfg') { const d = $('#settings'); d.open = true; renderSettings(true); d.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); }
  else if (a === 'goset') { UI.locsOpen = false; renderLocChips(); const d = $('#settings'); d.open = true; renderSettings(true); d.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); setTimeout(() => { const q = $('#geoQ'); q && q.focus(); }, 300); }
  else if (a === 'reset') {
    if (!confirm('Réinitialiser tous les réglages, les véhicules, les lieux et la calibration à leurs valeurs initiales ? Le trajet en cours sera aussi réinitialisé. Cette action est définitive.')) return;
    PLACE = { conf: null, last: null, extra: null }; TRIPSTART = null; RETURNHOME = null; GPS = null; USER_STORE.state.lastDeparture = null; USER_STORE.state.dayContext = {}; APP_CONTEXT.weatherPreview = null; DECISION_HISTORY.reset(); liveReset(); S = clone(DEFAULTS); lsSet('twrc.settings.v1', JSON.stringify(S)); UI.loc = S.locs[0].id; UI.bcar = S.cars[0].id; rebuild(); renderSettings(); renderAll(); refreshAll();
  }
  else if (a === 'geo-search') {
    const input = $('#geoQ'), q = (input.value || '').trim(), box = $('#geoHits'), gen = ++geoSearchGen; window.__hits = [];
    if (q.length < 2) { box.innerHTML = '<span class="sub" role="status">Saisis au moins deux caractères.</span>'; input.focus(); return; }
    box.innerHTML = '<span class="sub">Recherche…</span>';
    const current = () => gen === geoSearchGen && box.isConnected && input.isConnected && input.value.trim() === q;
    try { const r = await geocode(q); if (!current()) return; window.__hits = r; box.innerHTML = r.length ? r.map((h, i) => `<button data-act="geo-add" data-i="${i}">${esc(h.name)} <span class="muted">· ${esc(h.sub)} · ${h.provider ? esc(h.provider) + ' · ' : ''}${h.lat.toFixed(4)}, ${h.lon.toFixed(4)}</span></button>`).join('') : '<span class="sub">Aucun résultat. Vérifie le numéro, la rue et le code postal.</span>'; }
    catch (err) { if (current()) box.innerHTML = '<span class="sub" role="status">Recherche impossible (réseau indisponible). Tu peux aussi saisir latitude et longitude à la main.</span>'; }
  } else if (a === 'geo-add') {
    const h = (window.__hits || [])[+t.dataset.i]; if (!h) { commandFeedback(t, 'Relance la recherche'); return; } if (S.customs.length >= 4) { commandFeedback(t, 'Limite de quatre destinations : supprime un lieu'); return; } geoSearchGen++;
    markEdit('customs'); S.customs.push({ id: 'c' + Date.now().toString(36), name: h.name, sub: h.sub, ...frAdmin(h), lat: +h.lat.toFixed(4), lon: +h.lon.toFixed(4) });
    saveSettings(); renderSettings(); refreshAll();   // une destination ajoutée ne remplace jamais le lieu de travail (domicile-travail, « Au travail »)
  } else if (a === 'loc-del') {
    markEdit('customs'); const l = S.customs.splice(+t.dataset.i, 1)[0]; if (l) { if (S.work.to === l.id) S.work.to = S.locs[1].id; if (S.work.from === l.id) S.work.from = S.locs[0].id; if (UI.loc === l.id) UI.loc = S.locs[0].id; delete RAW[l.id]; }
    saveSettings(); renderSettings(); rebuild(); renderAll();
  }
});
document.addEventListener('keydown', e => { if (e.target.id === 'geoQ' && e.key === 'Enter') { e.preventDefault(); const b = $('[data-act="geo-search"]'); if (b) b.click(); } });
function resizePhoto(file, maxW) {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => {
      const sc = Math.min(1, maxW / img.width), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.8)); };
      img.onerror = rej; img.src = rd.result; };
    rd.onerror = rej; rd.readAsDataURL(file);
  });
}
document.addEventListener('submit', async e => {
  if (e.target && e.target.id === 'labLastDriveForm') {
    e.preventDefault(); const form = e.target, car = labCar(); if (!car || form.dataset.car !== car.id || DEMO.on) return;
    const data = new FormData(form), input = labInput(car);
    if (LIVE.phase === 'active') input.drive = { ...(input.drive || {}), active: true };
    const result = tyreLabLastDrive(input, { at: data.get('at'), minutes: data.get('minutes'), kind: data.get('kind') });
    if (result.ok) {
      ttLoad()[car.id] = result.history; lsSet(TT_KEY, JSON.stringify(ttLoad()));
      LAB_DRIVE_NOTE[car.id] = { text: 'Roulage enregistré sur cet appareil. Température estimée à partir de votre saisie.' };
      renderLab.clearDriveDraft = true;
    } else LAB_DRIVE_NOTE[car.id] = { text: result.error, error: true };
    renderAll(); return;
  }
  if (!e.target || e.target.id !== 'unlockForm') return;
  e.preventDefault();
  const pw = ($('#unlockPw') || {}).value || '', msg = $('#unlockMsg'); if (msg) msg.textContent = 'Déchiffrement…';
  const ok = await unseal(pw.trim()); if (ok) { if (!unseal.restored) { try { APP_STORAGE.removeItem('twrc.presetv'); } catch (err) { /* stockage */ } } location.reload(); } else if (msg) msg.textContent = unseal.error || 'Code incorrect.';
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t && t.dataset && t.dataset.tripField) { tripFieldChanged(t); return; }
  if (t.id === 'bkFile') { if (t.files && t.files[0]) backupImport(t.files[0]); t.value = ''; return; }
  if (t.dataset.photo != null && t.files && t.files[0]) {
    const car = S.cars[+t.dataset.photo];
    resizePhoto(t.files[0], 360).then(url => { car.photo = url; saveSettings(); renderSettings(); softRender(); }).catch(() => { const label = t.closest('label'); if (label) { label.title = 'Image illisible : choisis une autre photo'; const msg = label.querySelector('span'); if (msg) { msg.textContent = 'Image illisible'; msg.setAttribute('role', 'status'); } else label.insertAdjacentHTML('beforeend', '<span role="status">Image illisible</span>'); } });
    return;
  }
  if (t.dataset.actChange === 'demoScn') { startDemo(t.value); return; }
  if (t.dataset.db != null && t.dataset.db !== undefined && t.matches('select[data-db]')) {
    const car = S.cars[+t.dataset.db], d = TIRE_DB[+t.value]; if (!car || !d) return;
    if (car.tire.type !== d.type) switchTire(car, d.type);
    car.tire.brand = d.brand; car.tire.model = d.model; markEdit(`cars.${t.dataset.db}.tire`); markEdit(`cars.${t.dataset.db}.sets`);
    saveSettings(); renderSettings(); softRender(); return;
  }
  if (t.dataset.alert) { S.alerts[t.dataset.alert] = t.checked ? 1 : 0; markEdit('alerts.' + t.dataset.alert); saveSettings(); renderAlerts(); renderBanners(); return; }
  if (t.dataset.bind) {
    let v = t.value;
    if (t.dataset.num) { v = v === '' ? null : parseFloat(String(v).replace(',', '.')); if (v != null && isNaN(v)) v = null; }
    if (t.dataset.bind === 'work.durMin' && v == null) v = 40;
    const pm = /^cars\.(\d+)\.tire\.pchk\./.exec(t.dataset.bind);
    if (pm && !S.cars[+pm[1]].tire.pchk) S.cars[+pm[1]].tire.pchk = { date: '', T: null };
    const tm = /^cars\.(\d+)\.tire\.type$/.exec(t.dataset.bind);
    const trm = /^cars\.(\d+)\.tire\.tread(Av|Ar)$/.exec(t.dataset.bind);
    if (tm) switchTire(S.cars[+tm[1]], v); else if (trm) setTreadAxle(S.cars[+trm[1]].tire, trm[2] === 'Av' ? 'av' : 'ar', v); else setPath(S, t.dataset.bind, v);
    if (trm) { markEdit(`cars.${trm[1]}.tire.tread`); markEdit(`cars.${trm[1]}.tire.treadAv`); markEdit(`cars.${trm[1]}.tire.treadAr`); }
    if (tm) { markEdit(`cars.${tm[1]}.tire`); markEdit(`cars.${tm[1]}.sets`); } else markEdit(t.dataset.bind);
    // modèle reconnu dans la base : le type de pneu se met à jour tout seul
    const bm = /^cars\.(\d+)\.tire\.(brand|model)$/.exec(t.dataset.bind);
    if (bm) { const car = S.cars[+bm[1]], d = findTire(car.tire.brand, car.tire.model);
      if (d && car.tire.type !== d.type) { const keep = { brand: car.tire.brand, model: car.tire.model }; switchTire(car, d.type); Object.assign(car.tire, keep); renderSettings(); } }
    saveSettings();
    const b = t.dataset.bind;
    if (/^(locs|customs)\.\d+\.(lat|lon)$/.test(b)) {
      // coordonnées déplacées à la main : l'ancienne commune ne vaut plus ; l'alerte montagne retombe sur l'altitude
      const [k, i] = b.split('.'), l = S[k] && S[k][+i];
      if (l && ['deptCode', 'dept', 'city', 'cityCode', 'postcode'].some(f => l[f])) { ['deptCode', 'dept', 'city', 'cityCode', 'postcode'].forEach(f => { if (f in l) l[f] = ''; }); markEdit(k); saveSettings(); }
      rebuild(); refreshAll(); return;
    }
    if (b.startsWith('dept.')) fetchVigi();
    if (b.startsWith('work.')) UI.dayOff = b === 'work.dep' || b === 'work.ret' ? null : UI.dayOff;
    softRender();
    // Plusieurs contrôles du même réglage (rapide / paramètres) : valeur cohérente sans reconstruire le formulaire.
    if (b.startsWith('work.')) document.querySelectorAll('[data-bind]').forEach(peer => {
      if (peer !== t && peer.dataset.bind === b) peer.value = v == null ? '' : String(v);
    });
    if (/\.tire\.type$/.test(b) || /plan\.on$/.test(b) || /\.tire\.tread(Av|Ar)$/.test(b)) renderSettings();
  }
});
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#cfg=')) location.reload(); });
// @include app/lifecycle.js
// Sécurité V1 : écriture chiffrée immédiate quand l'app passe en arrière-plan ; erreur d'écriture affichée sans attendre.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && window.TWRC_VAULT) window.TWRC_VAULT.flush(); });
window.addEventListener('pagehide', () => { if (window.TWRC_VAULT) window.TWRC_VAULT.flush(); });
window.addEventListener('twrc-vault-error', () => { try { renderNotice(); } catch (e) { /* rendu suivant */ } });
