// Données routières et corrélation OSRM : pur, sans réseau, GPS persistant ni score pneus.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RoadIntelligence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const R = 6371000, RAD = Math.PI / 180, CELL = 0.005;
  const TYPES = new Set(['accident', 'works', 'closure', 'obstacle', 'stopped_vehicle', 'restriction', 'weather', 'congestion', 'jam', 'slowdown', 'unknown']);
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const text = x => typeof x === 'string' ? x.slice(0, 1200) : null;
  const num = x => finite(x) && x >= 0 ? x : null;
  const stamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) ? x : null;
  const point = p => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
  const roadNumber = x => String(x || '').toUpperCase().replace(/\b([ANDRM])\s*0*(\d+)/g, '$1$2').match(/\b[ANDRM]\d+[A-Z]?\b/g) || [];
  function meters(a, b) {
    const x = (b[0] - a[0]) * RAD * Math.cos((a[1] + b[1]) * RAD / 2), y = (b[1] - a[1]) * RAD;
    return R * Math.hypot(x, y);
  }
  function bearing(a, b) {
    return (Math.atan2((b[0] - a[0]) * Math.cos((a[1] + b[1]) * RAD / 2), b[1] - a[1]) / RAD + 360) % 360;
  }
  const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  function points(g) {
    if (!g || !Array.isArray(g.coordinates)) return null;
    if (g.type === 'Point') return point(g.coordinates) ? [g.coordinates] : null;
    return g.type === 'LineString' && g.coordinates.length >= 2 && g.coordinates.length <= 128 && g.coordinates.every(point) ? g.coordinates : null;
  }
  function normalize(event, provider) {
    if (!event || typeof event !== 'object' || typeof event.sourceId !== 'string' || !event.sourceId || !/^[a-z][a-z0-9-]{0,39}$/.test(provider)) return null;
    const geometry = event.geometry ? points(event.geometry) : null;
    if (event.geometry && !geometry) return null;
    const p = geometry && geometry[0] || [event.lon ?? event.longitude, event.lat ?? event.latitude];
    if (!point(p)) return null;
    const start = stamp(event.start ?? event.startTime), end = stamp(event.end ?? event.endTime);
    return {
      id: provider + ':' + event.sourceId.slice(0, 180), provider, sourceId: event.sourceId.slice(0, 180),
      type: TYPES.has(event.type) ? event.type : 'unknown', subtype: text(event.subtype), title: text(event.title) || 'Événement routier',
      description: text(event.description), severity: [0, 1, 2, 3].includes(event.severity) ? event.severity : null,
      status: ['active', 'suspended', 'ended'].includes(event.status) ? event.status : 'unknown',
      lat: p[1], lon: p[0], geometry: geometry ? { type: geometry.length > 1 ? 'LineString' : 'Point', coordinates: geometry.length > 1 ? geometry : p } : null,
      roadName: text(event.roadName), roadNumber: text(event.roadNumber), direction: text(event.direction),
      heading: finite(event.heading) && event.heading >= 0 && event.heading < 360 ? event.heading : null,
      start, end, updatedAt: stamp(event.updatedAt), delaySeconds: num(event.delaySeconds), lengthMeters: num(event.lengthMeters),
      currentSpeed: num(event.currentSpeed), freeFlowSpeed: num(event.freeFlowSpeed), congestion: text(event.congestion),
      laneInfo: text(event.laneInfo), confidence: ['high', 'medium', 'low'].includes(event.confidence) ? event.confidence : 'unknown',
      sourceUrl: typeof event.sourceUrl === 'string' && /^https:\/\//.test(event.sourceUrl) ? event.sourceUrl.slice(0, 600) : null,
      officialSource: event.officialSource === true, producer: text(event.producer), rawReference: text(event.rawReference),
      distanceAhead: null, etaToEvent: null, relevanceScore: null, provenance: []
    };
  }
  function fromOSRM(json) {
    const r = json && json.routes && json.routes[0], co = r && r.geometry && r.geometry.coordinates;
    if (!Array.isArray(co) || co.length < 2 || co.length > 25000 || !co.every(point)) return null;
    const durations = (r.legs || []).flatMap(l => l.annotation && l.annotation.duration || []);
    const byTime = durations.length === co.length - 1 && durations.every(x => finite(x) && x >= 0);
    const index = new Map(), segments = [], refs = new Map();
    co.forEach((p, i) => { const key = p.join(','); if (!refs.has(key)) refs.set(key, []); refs.get(key).push(i); });
    const names = []; let lastEnd = 0;
    for (const leg of r.legs || []) for (const s of leg.steps || []) {
      const pts = s.geometry && s.geometry.coordinates;
      if (!Array.isArray(pts) || !pts.length || !pts.every(point)) return null;
      // Le step d'arrivée peut répéter son unique point ; il ne couvre aucun segment.
      const path = pts.every(p => p[0] === pts[0][0] && p[1] === pts[0][1]) ? [pts[0]] : pts;
      const candidates = (refs.get(path[0].join(',')) || []).filter(i => i >= lastEnd && i + path.length <= co.length &&
        path.every((p, k) => p[0] === co[i + k][0] && p[1] === co[i + k][1]));
      const start = candidates.includes(lastEnd) ? lastEnd : candidates.length === 1 ? candidates[0] : null;
      // Une géométrie de step ambiguë ou absente ne prolonge jamais le nom du précédent.
      if (start == null) return null;
      if (start > lastEnd) names.push({ start: lastEnd, roads: [], name: null });
      names.push({ start, roads: roadNumber(s.ref || s.name), name: text(s.name) });
      lastEnd = start + path.length - 1;
      if (path.length > 1) names.push({ start: lastEnd, roads: [], name: null });
    }
    names.sort((a, b) => a.start - b.start);
    let distance = 0, seconds = 0, nameAt = 0, axisRun = 0, previousAxis = null;
    for (let i = 0; i < co.length - 1; i++) {
      while (nameAt + 1 < names.length && names[nameAt + 1].start <= i) nameAt++;
      const a = co[i], b = co[i + 1], length = meters(a, b), name = names[nameAt], duration = byTime ? durations[i] : null;
      const s = { a, b, length, distance, seconds: byTime ? seconds : null, duration, heading: bearing(a, b),
        roads: name && name.start <= i ? name.roads : [], name: name && name.start <= i ? name.name : null, i };
      const axis = s.roads.slice().sort().join(','); if (axis !== previousAxis) axisRun++;
      s.axisRun = axisRun; previousAxis = axis;
      segments.push(s); distance += length; if (byTime) seconds += duration;
      const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
      const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 128) return null;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const key = x + ':' + y; if (!index.has(key)) index.set(key, []); index.get(key).push(i);
      }
    }
    return { segments, index, distance, seconds: byTime ? seconds : null };
  }
  function projections(route, p, accept = () => true) {
    if (!route || !point(p)) return [];
    const candidates = new Set(), x = Math.floor(p[0] / CELL), y = Math.floor(p[1] / CELL), out = [];
    for (let a = x - 1; a <= x + 1; a++) for (let b = y - 1; b <= y + 1; b++)
      for (const i of route.index.get(a + ':' + b) || []) candidates.add(i);
    for (const i of candidates) {
      const s = route.segments[i]; if (!accept(s)) continue;
      const c = Math.cos(p[1] * RAD), ax = (s.a[0] - p[0]) * c, ay = s.a[1] - p[1];
      const dx = (s.b[0] - s.a[0]) * c, dy = s.b[1] - s.a[1], den = dx * dx + dy * dy;
      const t = den ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den)) : 0;
      out.push({ gap: R * RAD * Math.hypot(ax + t * dx, ay + t * dy), distance: s.distance + t * s.length,
        seconds: s.seconds == null ? null : s.seconds + t * s.duration, segment: s });
    }
    return out.sort((a, b) => a.gap - b.gap);
  }
  function project(route, p, preferredDistance) {
    const candidates = projections(route, p); if (!candidates.length) return null;
    const close = candidates.filter(c => c.gap <= candidates[0].gap + 3);
    if (finite(preferredDistance)) close.sort((a, b) => Math.abs(a.distance - preferredDistance) - Math.abs(b.distance - preferredDistance));
    return close[0];
  }
  const headings = { northBound: 0, northEastBound: 45, eastBound: 90, southEastBound: 135, southBound: 180, southWestBound: 225, westBound: 270, northWestBound: 315 };
  function filter(route, fix, events, now, previousDistance) {
    const rejected = [], matches = [];
    if (!fix || !finite(fix.acc) || fix.acc > 60 || fix.acc < 0 || !finite(fix.ts) || now - fix.ts > 120000 || fix.ts > now + 10000)
      return { events: [], rejected, position: null, reason: 'gps_uncertain' };
    const position = project(route, [fix.lon, fix.lat], previousDistance);
    if (!position || position.gap > 60) return { events: [], rejected, position, reason: 'off_route' };
    for (const e of events) {
      let reason = null;
      if (e.status !== 'active' || !e.updatedAt || Date.parse(e.updatedAt) > now + 60000 ||
          (e.end && Date.parse(e.end) <= now) || (e.start && Date.parse(e.start) > now)) reason = 'expired';
      const pts = points(e.geometry) || [[e.lon, e.lat]], roads = roadNumber([e.roadNumber, e.roadName].join(' '));
      const heading = e.heading != null ? e.heading : headings[e.direction], both = ['bothWays', 'both'].includes(e.direction);
      if (!reason && !roads.length) reason = 'road_unknown';
      if (!reason && heading == null && !both) reason = 'direction_unknown';
      const hits = [];
      for (const p of pts) {
        const close = projections(route, p).filter(x => x.gap <= 25);
        const onRoad = close.filter(x => roads.some(n => x.segment.roads.includes(n)));
        const directed = onRoad.filter(x => both || heading != null && angle(heading, x.segment.heading) <= 60);
        if (!reason && !close.length) reason = 'off_route';
        if (!reason && !onRoad.length) reason = close.some(x => x.segment.roads.length) ? 'parallel_road' : 'road_unknown';
        if (!reason && !directed.length) reason = 'opposite_direction';
        const hit = directed[0];
        if (!reason && hit && directed.some(x => x.gap <= hit.gap + 3 && Math.abs(x.distance - hit.distance) > 250)) reason = 'ambiguous_crossing';
        if (hit) hits.push(hit);
      }
      // Les bornes DATEX ne sont pas une polyline : pas d'interpolation à travers un échangeur.
      // Toutes les bornes doivent correspondre au même axe et sens de la route OSRM.
      if (!reason && hits.length > 1 && hits.some(h => h.segment.axisRun !== hits[0].segment.axisRun)) reason = 'non_used_section';
      const ordered = hits.slice().sort((a, b) => a.distance - b.distance);
      const within = ordered.length > 1 && position.distance >= ordered[0].distance && position.distance <= ordered[ordered.length - 1].distance;
      const hit = within ? position : ordered.find(h => h.distance >= position.distance);
      const ahead = hit ? hit.distance - position.distance : null;
      const eta = hit && position.seconds != null && hit.seconds != null ? Math.max(0, hit.seconds - position.seconds) : null;
      if (!reason && !hit) reason = 'behind';
      if (!reason && ahead > 60000) reason = 'outside_corridor';
      if (!reason && e.end && eta != null && Date.parse(e.end) <= now + eta * 1000) reason = 'expires_before_encounter';
      if (reason) { rejected.push({ id: e.id, reason }); continue; }
      const recent = now - Date.parse(e.updatedAt) <= 60 * 60e3;
      matches.push({ ...e, distanceAhead: Math.max(0, ahead),
        etaToEvent: eta,
        relevanceScore: 0.9, matchConfidence: 'high', matchReason: 'road_direction_geometry',
        routeStatus: ahead <= 250 ? 'imminent' : ahead <= 1000 ? 'near' : 'ahead',
        alertEligible: recent && e.severity >= 2 && ['accident', 'closure', 'obstacle', 'stopped_vehicle', 'weather'].includes(e.type),
        provenance: [{ provider: e.provider, sourceId: e.sourceId, producer: e.producer, updatedAt: e.updatedAt, sourceUrl: e.sourceUrl, officialSource: e.officialSource }]
      });
    }
    return { events: correlate(matches), rejected, position, reason: null };
  }
  function overlaps(a, b) {
    return (!a.end || !b.start || Date.parse(a.end) > Date.parse(b.start)) && (!b.end || !a.start || Date.parse(b.end) > Date.parse(a.start));
  }
  function correlate(events) {
    const out = [], buckets = new Map();
    for (const e of events.slice().sort((a, b) => a.distanceAhead - b.distanceAhead)) {
      const key = [e.type, roadNumber(e.roadNumber).sort().join(','), e.direction].join('|'), bin = Math.floor(e.distanceAhead / 150);
      let same = null;
      for (let i = bin - 1; i <= bin + 1 && !same; i++) {
        const providers = buckets.get(key + '|' + i); if (!providers) continue;
        for (const [provider, candidates] of providers) if (provider !== e.provider) {
          same = candidates.find(x => x.matchConfidence === 'high' && e.matchConfidence === 'high' && x.roadNumber && e.roadNumber &&
            Math.abs(x.distanceAhead - e.distanceAhead) < 120 && x.updatedAt && e.updatedAt &&
            Math.abs(Date.parse(x.updatedAt) - Date.parse(e.updatedAt)) < 600000 && overlaps(x, e));
          if (same) break;
        }
      }
      if (same) {
        if (!same.provenance.some(p => p.provider === e.provider && p.sourceId === e.sourceId)) same.provenance.push(...e.provenance);
        same.alertEligible = same.alertEligible || e.alertEligible;
        same.providerFresh = same.providerFresh && e.providerFresh;
      } else {
        const copy = { ...e, provenance: (e.provenance || []).slice() }; out.push(copy);
        const k = key + '|' + bin; if (!buckets.has(k)) buckets.set(k, new Map());
        const group = buckets.get(k); if (!group.has(e.provider)) group.set(e.provider, []);
        // Cas dense/ambigu : conserver les événements séparés, limiter les essais de fusion.
        if (group.get(e.provider).length < 16) group.get(e.provider).push(copy);
      }
    }
    return out;
  }
  function feed(json, provider, now) {
    if (!json || json.schema !== 1 || json.provider !== provider || json.complete !== true || !Array.isArray(json.events) || json.events.length > 2500 ||
        !stamp(json.checkedAt) || Date.parse(json.checkedAt) > now + 60000 || !stamp(json.publicationTime) || Date.parse(json.publicationTime) > now + 60000 ||
        typeof json.coverage !== 'string' || !json.coverage.trim() || json.flows != null && !Array.isArray(json.flows)) throw new Error('invalid_payload');
    const events = json.events.map(e => normalize(e, provider)), flows = (json.flows || []).map(e => normalize({ ...e, type: 'unknown' }, provider));
    if (flows.length > 2500 || events.some(e => !e) || flows.some(e => !e) || new Set(events.map(e => e.id)).size !== events.length) throw new Error('invalid_payload');
    return { ...json, events, flows, ageMs: Math.max(0, now - Date.parse(json.checkedAt), now - Date.parse(json.publicationTime)) };
  }
  function alertGate({ events, seen, now, lastAlert, fresh }) {
    if (!fresh || now - lastAlert < 300000) return null;
    return events.find(e => e.alertEligible && e.providerFresh !== false && !e.provenance.some(p => seen.has(p.provider + ':' + p.sourceId))) || null;
  }
  function cadence(phase, imminent) {
    return phase === 'active' ? imminent ? 30000 : 60000 : ['imminent', 'late'].includes(phase) ? 120000 : phase === 'advice' ? 600000 : Infinity;
  }
  return { normalize, fromOSRM, project, filter, correlate, feed, alertGate, roadNumber, meters, cadence };
});
