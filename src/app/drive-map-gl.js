// Carte du mode « EN DIRECT » v2 · lot 2 (21/11/2026) : MapLibre GL (auto-hébergé, intégrité vérifiée, construction CSP sans
// worker blob:) + tuiles VECTORIELLES IGN (Géoplateforme, PLAN.IGN), déjà autorisées. Vue orientée dans le sens de la marche,
// inclinée, bâtiments en 3D à leur hauteur BD TOPO (« hauteur » de bati_surf), zoom automatique (vitesse, manœuvre proche),
// flèche interpolée entre deux relevés (jamais extrapolée). Jour : style IGN clair allégé ; nuit : style dérivé sombre, routes
// plus claires que le sol ; photo aérienne IGN en option (Réglages). Sans WebGL ou si la 3D ne charge pas : repli à plat (Leaflet).
// Une seule interface pour la vue : setRoute, setDone, setCar, follow, setLights, setTheme, setBase, counts, remove.
const DRIVE_IGN_STYLE = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json';
let DRIVE_IGN_RAW = null;   // style IGN téléchargé (session)
function loadMapLibre() {
  if (window.maplibregl && window.maplibregl.Map) return Promise.resolve();
  if (loadMapLibre.p) return loadMapLibre.p;
  loadMapLibre.p = new Promise((res, rej) => {
    // empreintes SRI = octets du paquet npm maplibre-gl@4.7.1 (tools/web-assets.js) : tout fichier modifié est refusé
    const js = document.createElement('script'); js.src = 'vendor/maplibre/maplibre-gl-csp.js'; js.integrity = 'sha384-wkz3bHd2XHn0zfBLsJfGiElUhnowWv/hdfV/QfPpaQXPrS1euKdOIZFHNVrbocON'; js.crossOrigin = 'anonymous'; js.referrerPolicy = 'no-referrer';
    js.onload = () => { try { maplibregl.setWorkerUrl('vendor/maplibre/maplibre-gl-csp-worker.js'); res(); } catch (e) { loadMapLibre.p = null; rej(e); } };
    js.onerror = () => { loadMapLibre.p = null; rej(new Error('carte 3D indisponible')); }; document.head.appendChild(js);
  });
  return loadMapLibre.p;
}
const driveWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };
// Couleur CSS (#rgb, #rrggbb, rgb(a), hsl(a)) → [h, s, l, a] ; null si non reconnue.
function driveHsl(c) {
  if (typeof c !== 'string') return null;
  let r, g, b, a = 1, m;
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim()))) { const x = m[1].length === 3 ? m[1].split('').map(v => v + v).join('') : m[1]; r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16); }
  else if ((m = /^rgba?\(([^)]+)\)$/i.exec(c.trim()))) { const v = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); [r, g, b] = v; a = v[3] == null ? 1 : v[3]; }
  else if ((m = /^hsla?\(([^)]+)\)$/i.exec(c.trim()))) { const v = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return [v[0], v[1] / 100, v[2] / 100, v[3] == null ? 1 : v[3]]; }
  else return null;
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0, h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, s, l, a];
}
// Style nuit dérivé : surfaces assombries (claires → sombres), lignes (routes) en gris clair au-dessus du sol, textes clairs.
function driveNightColor(c, prop) {
  const x = driveHsl(c); if (!x) return c;
  const [h, s, l, a] = x, fmt = (L, S) => `hsla(${Math.round(h)},${Math.round(S * 100)}%,${Math.round(L * 100)}%,${a})`;
  if (prop === 'text-color') return fmt(.86 - l * .18, s * .5);
  if (prop === 'text-halo-color') return fmt(.07, s * .3);
  if (prop === 'line-color') return fmt(.2 + l * .32, s * .55);
  return fmt(.06 + (1 - l) * .2, s * .45);   // fill, background, circle
}
function driveRecolor(v, prop) {
  if (typeof v === 'string') return driveNightColor(v, prop);
  if (Array.isArray(v)) return v.map(x => driveRecolor(x, prop));
  if (v && typeof v === 'object' && Array.isArray(v.stops)) return { ...v, stops: v.stops.map(([z, c]) => [z, driveRecolor(c, prop)]) };
  return v;
}
// Couches inutiles au volant (cadastre, courbes de niveau, limites, petits symboles de bâtiments) : retirées, rendu plus léger.
const DRIVE_DROP = /^(parcellaire_|toponyme_parcellaire_|oro_courbe|oro_lin|oro_ponc|limite_|toponyme_limite_|bati_ponc|bati_lin|toponyme_bati_ponc|routier_ponc|hydro_ponc|toponyme_ocs_|ocs_lin)/;
async function driveGlStyle(night, base) {
  if (!DRIVE_IGN_RAW) {
    const s = await fetchJSON(DRIVE_IGN_STYLE, 12000);
    if (!s || !s.sources || !s.sources.plan_ign || !Array.isArray(s.layers)) throw new Error('style IGN invalide');
    DRIVE_IGN_RAW = s;
  }
  const s = JSON.parse(JSON.stringify(DRIVE_IGN_RAW));
  s.layers = s.layers.filter(l => !DRIVE_DROP.test(l['source-layer'] || '') && !(l['source-layer'] === 'bati_surf' && l.minzoom >= 14));
  if (night) s.layers.forEach(l => { if (l.paint) Object.keys(l.paint).forEach(k => { if (/-color$/.test(k)) l.paint[k] = driveRecolor(l.paint[k], k.replace(/^fill-outline-color$/, 'fill-color')); }); });
  if (base === 'ortho') {
    // Photo aérienne : seules les routes nommées et les localités restent par-dessus la photo.
    s.sources.ortho = { type: 'raster', tiles: [IGN_ORTHO], tileSize: 256, maxzoom: 19, attribution: '© IGN Géoplateforme · BD ORTHO' };
    s.layers = [{ id: 'dv-ortho', type: 'raster', source: 'ortho', paint: { 'raster-brightness-max': night ? .7 : 1 } }]
      .concat(s.layers.filter(l => l.type === 'symbol' && /toponyme_routier|toponyme_localite/.test(l['source-layer'] || '')));
  } else s.layers.unshift({ id: 'dv-bg', type: 'background', paint: { 'background-color': night ? '#0f141c' : '#f4f1ea' } });
  // Bâtiments en 3D à leur hauteur BD TOPO (hauteur inconnue : 6 m), à partir du zoom 14.
  const h = ['max', 3, ['coalesce', ['to-number', ['get', 'hauteur']], 6]];
  s.layers.push({ id: 'dv-b3d', type: 'fill-extrusion', source: 'plan_ign', 'source-layer': 'bati_surf', minzoom: 14, paint: {
    'fill-extrusion-color': ['interpolate', ['linear'], h, 0, night ? '#2b3242' : '#e9e3d8', 30, night ? '#3e4862' : '#d4ccbf'],
    'fill-extrusion-height': h, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': base === 'ortho' ? .55 : .94, 'fill-extrusion-vertical-gradient': true } });
  return s;
}
function driveGlLightIcon() {
  // Icône de feu NEUTRE (même dessin que DRIVE_LIGHT_SVG) : boîtier sombre, trois feux éteints au contour gris.
  const c = document.createElement('canvas'); c.width = 28; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#2c2c2e'; x.strokeStyle = '#f2f2f7'; x.lineWidth = 3; x.beginPath(); x.rect(3, 3, 22, 58); x.fill(); x.stroke();
  x.strokeStyle = '#aeaeb2'; x.lineWidth = 2.5; [16, 32, 48].forEach(y => { x.beginPath(); x.arc(14, y, 6, 0, Math.PI * 2); x.stroke(); });
  return x.getImageData(0, 0, c.width, c.height);
}
const driveFc = list => ({ type: 'FeatureCollection', features: list.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) });
const driveLine = pts => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: (pts || []).map(p => [p[1], p[0]]) } });
const driveReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
async function driveMapGl(node, route, night) {
  await loadMapLibre();
  let base = driveBasePref(), theme = night, style = await driveGlStyle(night, base);
  const start = route ? route.pts[0] : [46.6, 2.4];
  const map = new maplibregl.Map({ container: node, style, center: [start[1], start[0]], zoom: route ? 16.5 : 6, pitch: route ? 60 : 0, bearing: 0, maxPitch: 70,
    attributionControl: false, fadeDuration: 0, keyboard: false, antialias: false,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1) });   // rendu plafonné à 2× (iPhone 3× : ≈ 55 % de pixels en moins) ; sources dans le panneau
  const data = { route: driveLine(route && route.pts), done: driveLine([]), lights: driveFc([]) }, counts = { lights: 0 };
  const el = document.createElement('div'); el.className = 'dv-car3d';
  el.innerHTML = '<svg width="54" height="54" viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="24" fill="#fff" opacity=".95"/><circle cx="27" cy="27" r="20" fill="#0a84ff"/><path d="M27 12 L37 38 L27 32 L17 38 Z" fill="#fff"/></svg>';
  const car = new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat([start[1], start[0]]).addTo(map);
  const set = (id, d) => { data[id] = d; const s = map.getSource('dv-' + id); if (s) s.setData(d); };
  function layers() {
    if (!map.hasImage('dv-light')) map.addImage('dv-light', driveGlLightIcon(), { pixelRatio: 2 });
    Object.keys(data).forEach(k => { if (!map.getSource('dv-' + k)) map.addSource('dv-' + k, { type: 'geojson', data: data[k] }); });
    const line = (id, src, color, width, opacity = 1) => map.addLayer({ id, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity } }, 'dv-b3d');
    line('dv-route-case', 'dv-route', theme ? '#003a80' : '#0040a8', 17); line('dv-route', 'dv-route', theme ? '#3fa9ff' : '#0a84ff', 12); line('dv-done', 'dv-done', '#8e8e93', 10, .8);
    map.addLayer({ id: 'dv-lights', type: 'symbol', source: 'dv-lights', layout: { 'icon-image': 'dv-light', 'icon-anchor': 'bottom', 'icon-size': 1.25, 'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport', 'icon-allow-overlap': true } });
  }
  map.on('style.load', layers);
  // Chargement : seul un style illisible ou un délai dépassé font revenir à la carte à plat ; une tuile en erreur est ignorée.
  try {
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('carte 3D trop lente')), 15000);
      map.once('load', () => { clearTimeout(t); res(); });
      map.on('error', e => { if (!map.loaded() && !(e && (e.tile || e.sourceId))) { clearTimeout(t); rej(e && e.error || new Error('carte 3D')); } });
    });
  } catch (e) { try { map.remove(); } catch (x) { /* carte déjà retirée */ } throw e; }
  // Voiture aux deux tiers de la hauteur de la carte (la carte s'arrête au panneau du bas), comme une appli de navigation.
  const pad = () => map.setPadding({ top: Math.round(node.clientHeight * .36), bottom: 0, left: 0, right: 0 });
  pad(); map.on('resize', pad);
  // Flèche interpolée entre le dernier relevé affiché et le nouveau (≤ 0,9 s), jamais au-delà du nouveau relevé.
  let shown = start.slice(), anim = null;
  function moveCar(p, bearing) {
    if (Number.isFinite(bearing)) car.setRotation(bearing);
    cancelAnimationFrame(anim); const from = shown.slice(), to = p.slice();
    if (driveReduced() || DriveNav.meters(from, to) > 500) { shown = to; car.setLngLat([to[1], to[0]]); return; }
    const t0 = performance.now(), dur = 900;
    const step = now => { const k = Math.min(1, (now - t0) / dur); shown = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]; car.setLngLat([shown[1], shown[0]]); if (k < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }
  let fitted = false;
  // Cadre redimensionné (bandeaux, barre d'outils de Safari) sans que la carte l'ait vu : canvas recalé sur le cadre.
  const fit = () => { const c = map.getCanvas(); if (c && (c.clientWidth !== node.clientWidth || c.clientHeight !== node.clientHeight)) map.resize(); };
  return {
    kind: '3d', map, credit: 'Carte © IGN Géoplateforme (PLAN.IGN, BD TOPO' + (base === 'ortho' ? ', BD ORTHO' : '') + ') · itinéraire OSRM · feux © OpenStreetMap',
    on: (ev, fn) => map.on(ev === 'drag' ? 'dragstart' : ev, fn),
    setRoute(r, fit) { set('route', driveLine(r && r.pts)); if (r && (fit || !fitted)) { fitted = true; const b = new maplibregl.LngLatBounds(); r.pts.forEach(p => b.extend([p[1], p[0]])); if (fit) map.fitBounds(b, { padding: 40, pitch: 45, duration: 0 }); } },
    setDone(pts) { set('done', driveLine(pts)); },
    setCar: moveCar,
    shown: () => shown.slice(),
    // Caméra : sens de la marche, inclinée, zoom demandé (vitesse, manœuvre) ; 0,9 s de transition ou recadrage direct.
    follow(p, bearing, zoom) { fit(); const cam = { center: [p[1], p[0]], bearing: Number.isFinite(bearing) ? bearing : map.getBearing(), pitch: 60, zoom: Number.isFinite(zoom) ? zoom : Math.max(map.getZoom(), 16.5) };
      if (driveReduced()) map.jumpTo(cam); else map.easeTo({ ...cam, duration: 900, easing: t => t }); },
    setLights(list) { counts.lights = (list || []).length; set('lights', driveFc((list || []).map(l => [l.lon, l.lat]))); },
    async setTheme(n) { fit(); const b = driveBasePref(); if (n === theme && b === base) return; theme = n; base = b;
      try { style = await driveGlStyle(n, b); map.setStyle(style, { diff: false }); this.credit = 'Carte © IGN Géoplateforme (PLAN.IGN, BD TOPO' + (b === 'ortho' ? ', BD ORTHO' : '') + ') · itinéraire OSRM · feux © OpenStreetMap'; } catch (e) { /* style inchangé si le chargement échoue */ } },
    theme: () => (theme ? 'nuit' : 'jour') + (base === 'ortho' ? '+photo' : ''),
    counts: () => ({ ...counts }),
    remove() { cancelAnimationFrame(anim); try { map.remove(); } catch (e) { /* carte déjà retirée */ } }
  };
}
