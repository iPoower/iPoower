/* Navigation « EN DIRECT » (20/11/2026) : tracé routier complet, détection de sortie d'itinéraire, feux tricolores.
 * Module PUR : aucun réseau, stockage, GPS ni DOM ; l'heure et les relevés sont fournis. Coordonnées [lat, lon].
 * Sortie d'itinéraire : comme les applis de guidage, mais sans recalage sur le réseau routier : relevés précis (≤ 50 m)
 * à plus de max(70 m, 2 × précision) du tracé, 3 de suite sur au moins 4 s ; jamais près de l'arrivée (1,2 km), ni dans les
 * 20 s qui suivent un nouveau tracé. Feux : nœuds OpenStreetMap « highway=traffic_signals » à ≤ 30 m du tracé, regroupés
 * par carrefour (60 m), jamais inventés. */
const DriveNav = (() => {
  const finite = Number.isFinite, RAD = Math.PI / 180, R = 6371000;
  const ok = p => Array.isArray(p) && p.length === 2 && p.every(finite) && Math.abs(p[0]) <= 85 && Math.abs(p[1]) <= 180;
  const meters = (a, b) => R * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
  const OFF = { acc: 50, min: 70, count: 3, spanMs: 4000, destKm: 1.2, graceMs: 20000 };
  // Itinéraire OSRM (GeoJSON [lon, lat]) → tracé complet { pts, cumulative, total (m), km, min (brut), signature }.
  function fromOsrm(j, key) {
    const r = j && Array.isArray(j.routes) && j.routes[0], co = r && r.geometry && r.geometry.coordinates;
    if (!Array.isArray(co) || co.length < 2 || co.length > 50000) return null;
    const raw = co.map(c => Array.isArray(c) ? [c[1], c[0]] : null);
    if (!raw.every(ok)) return null;
    const pts = raw.filter((p, i) => !i || meters(raw[i - 1], p) > .1);
    if (pts.length < 2) return null;
    const cumulative = [0];
    for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + meters(pts[i - 1], pts[i]));
    const total = cumulative[cumulative.length - 1];
    if (total < 1) return null;
    const km = finite(r.distance) && r.distance > 0 ? r.distance / 1000 : total / 1000;
    const min = finite(r.duration) && r.duration > 0 ? r.duration / 60 : null;
    return { key: key || null, pts, cumulative, total, km, min, full: true, signature: pts.length + '|' + pts[0].join(',') + '|' + pts[pts.length - 1].join(',') + '|' + Math.round(total) };
  }
  // Point du tracé le plus proche : écart (m) et distance le long du tracé (m).
  function nearest(route, p) {
    if (!route || !ok(p)) return null;
    let best = null;
    const cos = Math.cos(p[0] * RAD);
    for (let i = 1; i < route.pts.length; i++) {
      const a = route.pts[i - 1], b = route.pts[i], x = (b[1] - a[1]) * cos, y = b[0] - a[0], len = x * x + y * y;
      const u = len ? Math.max(0, Math.min(1, ((p[1] - a[1]) * cos * x + (p[0] - a[0]) * y) / len)) : 0;
      const q = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], gap = meters(p, q);
      if (!best || gap < best.gap) best = { gap, along: route.cumulative[i - 1] + u * (route.cumulative[i] - route.cumulative[i - 1]), point: q };
    }
    return best;
  }
  // Une étape de la détection : renvoie le nouvel état { n, first, off }. Un relevé imprécis ou répété ne compte pas.
  function offStep(state, { route, fix, destKm = null, now = Date.now(), routeAt = 0 } = {}) {
    const s = { n: 0, first: null, last: null, off: false, gap: null, ...(state || {}) };
    if (!route || !fix || !finite(fix.lat) || !finite(fix.lon) || !finite(fix.acc) || fix.acc > OFF.acc || !finite(fix.ts)) return { ...s, off: false };
    if (s.last != null && fix.ts <= s.last) return { ...s, off: false };
    const hit = nearest(route, [fix.lat, fix.lon]);
    if (!hit) return { ...s, off: false };
    const away = hit.gap > Math.max(OFF.min, 2 * fix.acc);
    const quiet = now - routeAt < OFF.graceMs || finite(destKm) && destKm <= OFF.destKm;
    const n = away && !quiet ? s.n + 1 : 0, first = n === 1 ? fix.ts : n ? s.first : null;
    return { n, first, last: fix.ts, gap: hit.gap, off: n >= OFF.count && fix.ts - first >= OFF.spanMs };
  }
  // Cap du véhicule (degrés, 0 = nord) entre deux relevés distants d'au moins 15 m ; sinon null.
  function heading(a, b) {
    if (!a || !b || !ok([a.lat, a.lon]) || !ok([b.lat, b.lon]) || meters([a.lat, a.lon], [b.lat, b.lon]) < 15) return null;
    const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
    return Math.round((Math.atan2(y, x) / RAD + 360) % 360);
  }
  // Requête Overpass des feux à ≤ 30 m du tracé. Tracé échantillonné (≤ 300 points, ≈ 4 décimales) ; les portions à moins
  // de 800 m d'un lieu privé (domicile, travail) ne sont JAMAIS envoyées. Null si rien d'envoyable.
  function lightsQuery(route, privatePoints = []) {
    if (!route || !route.pts || route.pts.length < 2) return null;
    const priv = (privatePoints || []).filter(p => p && ok([p.lat, p.lon])).map(p => [p.lat, p.lon]);
    const far = p => priv.every(q => meters(p, q) > 800);
    // Portions envoyables séparées (une portion privée n'est jamais remplacée par une ligne droite qui la traverserait).
    const step = Math.max(40, route.total / 300), parts = [[]];
    let next = 0;
    route.pts.forEach((p, i) => {
      if (!far(p)) { if (parts[parts.length - 1].length) parts.push([]); return; }
      if (route.cumulative[i] >= next || i === route.pts.length - 1) { parts[parts.length - 1].push(p); next = route.cumulative[i] + step; }
    });
    const lines = parts.filter(x => x.length >= 2).slice(0, 20).map(x => x.map(p => (+p[0].toFixed(4)) + ',' + (+p[1].toFixed(4))).join(','));
    if (!lines.length) return null;
    return '[out:json][timeout:20];(' + lines.map(l => 'node["highway"="traffic_signals"](around:30,' + l + ');').join('') + ');out skel;';
  }
  // Réponse Overpass → feux le long du tracé, regroupés par carrefour, triés par distance depuis le départ (m).
  function lights(json, route) {
    const els = json && Array.isArray(json.elements) ? json.elements : [];
    if (!route || els.length > 5000) return [];
    const hits = els.filter(e => e && e.type === 'node' && ok([e.lat, e.lon])).map(e => ({ lat: e.lat, lon: e.lon, hit: nearest(route, [e.lat, e.lon]) }))
      .filter(x => x.hit && x.hit.gap <= 30).sort((a, b) => a.hit.along - b.hit.along);
    const out = [];
    hits.forEach(x => { const last = out[out.length - 1]; if (last && x.hit.along - last.along <= 60) last.n++; else out.push({ lat: x.lat, lon: x.lon, along: x.hit.along, n: 1 }); });
    return out;
  }
  // Feux encore devant (distance le long du tracé > position − 15 m) : nombre et distance du prochain (m).
  function lightsAhead(list, along) {
    const ahead = (list || []).filter(l => !finite(along) || l.along > along - 15);
    return { count: ahead.length, next: ahead.length && finite(along) ? Math.max(0, ahead[0].along - along) : null };
  }
  // Alerte d'approche : prochain feu à ≤ 300 m (et pas encore franchi, 15 m de marge), feux enchaînés dans les 150 m suivants.
  // Renvoie null hors de portée. « key » identifie le feu (un seul bip par feu).
  function lightAlert(list, along, reach = 300) {
    if (!finite(along)) return null;
    const ahead = (list || []).filter(l => l.along > along - 15);
    if (!ahead.length) return null;
    const next = ahead[0], dist = Math.max(0, next.along - along);
    if (dist > reach) return null;
    return { dist, chain: ahead.filter(l => l.along - next.along <= 150).length, key: Math.round(next.along) };
  }
  // Kilomètres du trajet pour le compteur : distance suivie (tracés successifs) si elle couvre au moins la moitié de
  // l'itinéraire prévu, sinon distance prévue ; arrondie au km. Jamais négative ni invraisemblable (> 2 000 km).
  function tripKm(followed, planned) {
    const f = finite(followed) && followed > 0 ? followed : null, p = finite(planned) && planned > 0 ? planned : null;
    const km = f != null && (p == null || f >= p * .5) ? f : p;
    return km != null && km <= 2000 ? { km: Math.max(1, Math.round(km)), src: km === f ? 'gps' : 'route' } : null;
  }
  return Object.freeze({ OFF, fromOsrm, nearest, offStep, heading, lightsQuery, lights, lightsAhead, lightAlert, tripKm, meters });
})();
if (typeof module !== 'undefined') module.exports = DriveNav;
