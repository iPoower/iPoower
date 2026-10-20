/* LIVE ROUTE : projection éphémère du trajet canonique. Aucun réseau, stockage,
 * GPS supplémentaire ou déduction du mouvement à partir de l'heure prévue. */
const LiveRoute = (() => {
  const finite = Number.isFinite, RAD = Math.PI / 180, R = 6371000;
  const clamp = f => Math.max(0, Math.min(1, f));
  const point = p => Array.isArray(p) && p.length === 2 && p.every(finite) && Math.abs(p[0]) <= 85 && Math.abs(p[1]) <= 180;
  const dx = (a, b) => ((b - a + 540) % 360) - 180;
  const meters = (a, b) => R * RAD * Math.hypot(b[0] - a[0], dx(a[1], b[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
  const interpolate = (a, b, f) => [a[0] + (b[0] - a[0]) * f, ((a[1] + dx(a[1], b[1]) * f + 540) % 360) - 180];
  function route(trip, fallback) {
    if (!trip || trip.destinationPending || trip.originPending || trip.l && trip.l.originPending) return null;
    const leg = [trip.planL, trip.l].find(l => l && l.routed && Array.isArray(l.g) && l.g.length > 1);
    const g = leg ? leg.g : fallback && !fallback.est ? fallback.pts : null;
    if (!Array.isArray(g) || g.length < 2 || g.length > 25000 || !g.every(point)) return null;
    const pts = g.filter((p, i) => !i || meters(g[i - 1], p) > .1).map(p => p.slice());
    if (pts.length < 2) return null;
    const cumulative = [0];
    for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + meters(pts[i - 1], pts[i]));
    const total = cumulative[cumulative.length - 1];
    if (total < 1) return null;
    const min = leg && finite(leg.min) && leg.min > 0 ? leg.min : null;
    const km = leg && finite(leg.km) && leg.km > 0 ? leg.km : total / 1000;
    return { key: trip.key, pts, cumulative, total, km, min, distanceKind: leg && finite(leg.km) ? 'Distance itinéraire' : 'Distance du tracé',
      remainingRoute: !!(leg && leg === trip.l && trip.running && !trip.planL), signature: JSON.stringify(pts) };
  }
  function at(route, fraction) {
    if (!route || !finite(fraction)) return null;
    const f = clamp(fraction), d = f * route.total, n = route.pts.length;
    let i = 1;
    while (i < n - 1 && route.cumulative[i] < d) i++;
    const a = route.pts[i - 1], b = route.pts[i], length = route.cumulative[i] - route.cumulative[i - 1];
    return { point: interpolate(a, b, length ? (d - route.cumulative[i - 1]) / length : 0), fraction: f,
      bearing: (Math.atan2(dx(a[1], b[1]) * Math.cos((a[0] + b[0]) * RAD / 2), b[0] - a[0]) / RAD + 360) % 360,
      index: i };
  }
  function project(route, fix, previous) {
    const p = [fix.lat, fix.lon], hits = [];
    for (let i = 1; i < route.pts.length; i++) {
      const a = route.pts[i - 1], b = route.pts[i], cos = Math.cos(p[0] * RAD);
      const x = dx(a[1], b[1]) * cos, y = b[0] - a[0], len = x * x + y * y;
      const u = len ? clamp((dx(a[1], p[1]) * cos * x + (p[0] - a[0]) * y) / len) : 0;
      const q = interpolate(a, b, u), distance = route.cumulative[i - 1] + u * (route.cumulative[i] - route.cumulative[i - 1]);
      hits.push({ gap: meters(p, q), fraction: distance / route.total });
    }
    hits.sort((a, b) => a.gap - b.gap);
    const best = hits[0], close = hits.filter(h => h.gap <= best.gap + 5);
    if (previous && finite(previous.fraction)) close.sort((a, b) => Math.abs(a.fraction - previous.fraction) - Math.abs(b.fraction - previous.fraction));
    else if (close.some(h => Math.abs(h.fraction - best.fraction) * route.total > 250)) return null;
    return close[0];
  }
  function gps({ route, fix, previous = null, now = Date.now(), floor = 0, enabled = false, active = false, held = false, hidden = false, locked = false, demo = false } = {}) {
    const unavailable = reason => ({ valid: false, reason, fraction: null, point: null });
    if (!route) return unavailable('Tracé routier indisponible');
    if (locked || hidden) return unavailable('Position non actualisée');
    if (demo) return unavailable('DÉMO · aucun GPS réel');
    if (!active) return unavailable('Trajet non démarré');
    if (!enabled) return unavailable('Suivi GPS désactivé');
    if (held) return unavailable('Position à confirmer');
    if (!fix || !point([fix.lat, fix.lon]) || !finite(fix.acc) || fix.acc < 0 || fix.acc > 60) return unavailable('GPS imprécis ou indisponible');
    if (!finite(fix.ts) || fix.ts < floor || fix.ts > now + 1000 || now - fix.ts > 15000 || previous && fix.ts < previous.ts) return unavailable('Position non actualisée');
    if (previous && fix.ts > previous.ts && previous.fix && meters([previous.fix.lat, previous.fix.lon], [fix.lat, fix.lon]) >
      70 * (fix.ts - previous.ts) / 1000 + previous.fix.acc + fix.acc) return unavailable('Déplacement GPS à confirmer');
    const hit = project(route, fix, previous);
    if (!hit) return unavailable('Position ambiguë sur le tracé');
    if (hit.gap > Math.max(60, fix.acc * 1.5)) return unavailable('Position hors du tracé');
    const pose = at(route, hit.fraction);
    return { valid: true, reason: 'GPS LIVE', ...pose, ts: fix.ts, acc: fix.acc, fix: { ...fix }, gap: hit.gap };
  }
  function metrics(route, fraction, { simulated = false, now = Date.now(), startedAt = null } = {}) {
    if (!route || !finite(fraction)) return { percent: null, remaining: null, elapsed: null, remainingMin: null, sector: null };
    const f = clamp(fraction);
    return { percent: Math.round(f * 100), remaining: route.km * (1 - f),
      elapsed: simulated ? route.min == null ? null : route.min * f : finite(startedAt) && startedAt <= now ? (now - startedAt) / 60000 : null,
      remainingMin: route.min == null ? null : route.min * (1 - f), sector: Math.min(3, Math.floor(f * 3) + 1) };
  }
  function forecasts(route, points) {
    if (!route) return [];
    return (points || []).flatMap(p => {
      if (!point([p.lat,p.lon])) return [];
      const hit = project(route, {lat:p.lat,lon:p.lon});
      if (!hit || hit.gap > 1000) return [];
      // Le point météo garde ses coordonnées : sa projection sert seulement
      // à estimer une distance sur le tracé, jamais à inventer une observation.
      return [{ ...p, fraction: hit.fraction, routeLocated: true, routePoint: [p.lat,p.lon], gap: hit.gap }];
    });
  }
  function weather(points, fraction) {
    if (!finite(fraction)) return null;
    return (points || []).filter(p => finite(p.fraction) && p.fraction >= fraction && p.fraction <= 1 &&
      (p.routeLocated || p.position === 'Position documentée par itinéraire') && (p.snow || p.rain > 0 || p.visibility != null && p.visibility < 1000 || p.gust >= 40 || p.risk && p.risk.level >= 2))
      .sort((a, b) => a.fraction - b.fraction)[0] || null;
  }
  return Object.freeze({ route, at, gps, metrics, forecasts, weather });
})();
