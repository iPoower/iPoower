/* ROUTE RADAR — projection météo de lecture seule, jamais source canonique.
 * Points = séquences météo déjà attachées au trajet. Aucun réseau, GPS ou stockage.
 */
const RouteRadar = (() => {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const validTime = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v) && Number.isFinite(Date.parse(v.slice(0, 16) + ':00'));
  const stamp = v => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  const value = (v, unit = '', dec = 0) => finite(v) ? v.toFixed(dec).replace('.', ',') + unit : '—';
  const ageLabel = age => !finite(age) ? 'âge inconnu' : age < 60 ? Math.floor(age) + ' min' : Math.floor(age / 60) + ' h ' + Math.floor(age % 60) + ' min';
  // Points intermédiaires le long de la géométrie OSRM ([lon, lat]) : un point tous les STEP_KM environ (50 à 80 km),
  // au moins 3 (trajets courts : 25/50/75 %), au plus MAX_N - 1. Le choix se fait sur la DISTANCE ; f reste la fraction
  // de TEMPS (horaire de passage), km la distance cumulée. Pur : aucune requête, aucune horloge.
  const STEP_KM = 65, MAX_N = 15, ALT_HIGH_M = 800;
  const hav = (a, b) => { const R = Math.PI / 180, h = Math.sin((b[1] - a[1]) * R / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin((b[0] - a[0]) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, h))); };
  function samplePoints(co, dur) {
    if (!Array.isArray(co) || co.length < 2) return [];
    const cumD = [0], cumT = [0];
    for (let i = 1; i < co.length; i++) { cumD.push(cumD[i - 1] + hav(co[i - 1], co[i])); cumT.push(cumT[i - 1] + (dur && finite(dur[i - 1]) ? dur[i - 1] : 0)); }
    const totD = cumD[cumD.length - 1] || 1, totT = cumT[cumT.length - 1], byTime = totT > 0;
    const n = Math.max(4, Math.min(MAX_N, Math.round(totD / STEP_KM))), out = [];
    for (let k = 1; k < n; k++) {
      let i = cumD.findIndex(c => c >= k / n * totD); if (i < 0) i = co.length - 1;
      out.push({ f: +((byTime ? cumT[i] / totT : cumD[i] / totD).toFixed(4)), lat: +co[i][1].toFixed(3), lon: +co[i][0].toFixed(3), km: Math.round(cumD[i] * 10) / 10, name: null });
    }
    return out;
  }
  function snapshot({ trip, sources = [], offline = false, now = Date.now() } = {}) {
    if (!trip || trip.originPending || trip.destinationPending || (trip.l && trip.l.originPending))
      return { state: 'unavailable', reason: 'Trajet absent, annulé ou origine/destination à confirmer.', points: [] };
    const leg = trip.l || trip.planL || null;
    const geometry = !!(leg && leg.routed && Array.isArray(leg.g) && leg.g.length > 1);
    const seq = Array.isArray(trip.seq) ? trip.seq : [];
    const p = [], last = seq.length - 1;
    const duration = validTime(trip.dep) && validTime(trip.arr) ? (Date.parse(trip.arr) - Date.parse(trip.dep)) / 60000 : NaN;
    seq.forEach((q, i) => {
      const x = q && Array.isArray(q.hs) && Number.isInteger(q.i) && q.hs[q.i];
      if (!x || typeof x !== 'object') return;
      const exactF = finite(q.f) && q.f >= 0 && q.f <= 1;
      const fraction = exactF ? q.f : last > 0 ? i / last : null;
      // Les horaires reconstitués sans fuseau explicite ne doivent pas être affichés.
      const at = validTime(q.t) ? q.t.slice(0, 16) : fraction != null && finite(duration) && duration >= 0 && typeof addMin === 'function' ? addMin(trip.dep, Math.round(duration * fraction)) : null;
      const located = finite(q.lat) && finite(q.lon) && Math.abs(q.lat) <= 90 && Math.abs(q.lon) <= 180;
      const found = sources.find(s => s && s.hs === q.hs), age = found && finite(stamp(found.at)) && stamp(found.at) <= now + 60000 ? Math.max(0, (now - stamp(found.at)) / 60000) : null;
      const stale = found && (found.mode === 'cache' || found.mode === 'offline' || found.mode === 'stale') ||
        finite(age) && (typeof Reliability !== 'undefined' && typeof Reliability.liveExpired === 'function'
          ? Reliability.liveExpired(stamp(found.at), now) : age > 30);
      const state = offline ? 'Hors ligne · cache' : stale ? 'Cache périmé' : found && found.mode === 'live' && finite(age) ? 'Prévision conservée' : 'Fraîcheur non vérifiée';
      const snow = finite(x.snow) && x.snow > 0 || [71, 73, 75, 77, 85, 86].includes(x.code);
      const rain = finite(x.P) && x.P > 0;
      const fog = finite(x.vis) && x.vis < 1000 || [45, 48].includes(x.code);
      const confidence = geometry && exactF && located ? 'Position documentée par itinéraire' : located ? 'Point géolocalisé · progression estimée' : 'Position locale estimée';
      let label = fraction === 0 && (exactF || seq.length > 1) ? 'DÉPART' : fraction === 1 && (exactF || seq.length > 1) ? 'ARRIVÉE' : 'PARCOURS';
      if (seq.length === 1) label = 'POINT MÉTÉO';
      const risk = trip.crit && trip.crit.q === q ? trip.crit : null;
      p.push({ label, fraction, position: confidence, time: at, timeKind: validTime(q.t) ? 'Passage calculé' : at ? 'Passage estimé' : 'Horaire absent',
        lat: located ? q.lat : null, lon: located ? q.lon : null,
        km: finite(q.km) ? q.km : null, forecastHour: validTime(x.t) ? x.t.slice(11, 16) : null,
        temp: finite(x.T) ? x.T : null, rain: finite(x.P) ? x.P : null, probability: finite(x.pp) ? x.pp : null,
        snow, snowKnown: finite(x.snow) || finite(x.code), visibility: finite(x.vis) ? x.vis : null,
        wind: finite(x.wind) ? x.wind : null, gust: finite(x.gust) ? x.gust : null,
        // altitude du point de grille du modèle (réponse Open-Meteo existante, champ elevation) : aucune autre source
        elevation: finite(q.elev) ? Math.round(q.elev) : null, high: finite(q.elev) && q.elev >= ALT_HIGH_M,
        risk: risk && (risk.lv >= 2 || risk.fog || risk.ice) ? { level: risk.lv, fog: !!risk.fog, ice: !!risk.ice } : null,
        source: found ? 'Modèle horaire Race Control' : 'Modèle non identifié',
        age, state, tone: risk && finite(risk.lv) ? Math.min(3, Math.max(0, risk.lv)) : fog || snow ? 2 : rain ? 1 : 0
      });
    });
    p.sort((a, b) => (a.fraction ?? Infinity) - (b.fraction ?? Infinity));
    const progress = p.filter(x => x.fraction != null).map(x => x.fraction), gaps = progress.slice(1).some((f, i) => f - progress[i] > .6);
    const endpoints = progress.length > 1 && progress[0] <= .01 && progress[progress.length - 1] >= .99;
    const expected = leg && Array.isArray(leg.pts) ? leg.pts.length + 2 : null;
    const partial = !geometry || !endpoints || gaps || expected != null && p.length < expected;
    // Pire point et pire heure : niveau le plus haut, puis le plus tôt sur le parcours.
    const worst = p.reduce((w, x) => !w || x.tone > w.tone ? x : w, null);
    const alts = p.filter(x => finite(x.elevation)), highest = alts.reduce((h, x) => !h || x.elevation > h.elevation ? x : h, null);
    return { state: p.length ? 'ready' : 'unavailable', reason: p.length ? null : 'Aucun point de prévision exploitable pour ce trajet.',
      worst: worst && worst.tone > 0 ? worst : null, highest, highCount: p.filter(x => x.high).length,
      points: p, partial, geometry, offline, missing: expected == null ? null : Math.max(0, expected - p.length),
      routeKind: geometry ? 'Géométrie OSRM conservée' : 'Parcours ou progression estimés',
      coverage: partial ? 'Couverture incomplète' : 'Échantillons ponctuels sur la route',
      caveat: 'Prévisions aux points disponibles uniquement : ni mesure continue ni garantie d’absence de danger.' };
  }
  function html(r, escape) {
    const e = escape || (x => String(x));
    const txt = x => e(String(x));
    if (!r || r.state !== 'ready')
      return '<div class="rr-empty sub" role="status">' + txt(r && r.reason || 'Prévisions de trajet indisponibles.') + '</div>';
    const band = r.points.map(p => '<span class="lv' + p.tone + '" role="listitem" title="' + txt(p.label + ' · ' + (p.time || 'horaire absent')) + '"><span aria-hidden="true">' + (p.snow ? '🌨️' : p.visibility != null && p.visibility < 1000 ? '🌫️' : p.rain != null && p.rain > 0 ? '🌧️' : '🌤️') + '</span></span>').join('');
    const rows = r.points.map(p => {
      const vis = p.visibility == null ? '—' : p.visibility >= 1000 ? value(p.visibility / 1000, ' km', 1) : value(p.visibility, ' m');
      const tag = p.risk && finite(p.risk.level) ? '<span class="pill lv' + p.risk.level + '">Vigilance du moteur · niveau ' + p.risk.level + '</span>' : '';
      return '<li class="rr-point lv' + p.tone + '"><div class="rr-point-head"><b>' + txt(p.label) + '</b><time>' + txt(p.time ? p.time.slice(11, 16) : '—') + '</time></div>' +
        '<p class="sub">' + txt(p.position) + ' · ' + txt(p.timeKind) + (p.km != null ? ' · km ' + txt(value(p.km, '', 1)) : '') + (p.elevation != null ? ' · alt. ' + txt(p.elevation) + ' m' + (p.high ? ' ⛰️' : '') : '') + '</p>' +
        '<div class="rr-metrics"><span>🌡️ ' + txt(value(p.temp, ' °C', 1)) + '</span><span>🌧️ ' + txt(value(p.rain, ' mm/h', 1)) + (p.probability != null ? ' · ' + txt(value(p.probability, ' %')) : '') + '</span><span>🌨️ ' + (p.snowKnown ? p.snow ? 'neige prévue' : 'non prévue' : '—') + '</span><span>🌫️ ' + txt(vis) + '</span><span>💨 ' + txt(value(p.wind, ' km/h')) + (p.gust != null ? ' · raf. ' + txt(value(p.gust, ' km/h')) : '') + '</span></div>' + tag +
        '<small class="rr-source">' + txt(p.source) + ' · ' + txt(p.state) + ' · ' + txt(ageLabel(p.age)) + (p.forecastHour ? ' · échéance modèle ' + txt(p.forecastHour) : '') + '</small></li>';
    }).join('');
    const where = p => (p.km != null ? 'km ' + value(p.km, '', 0) : p.label.toLowerCase()) + (p.time ? ' vers ' + p.time.slice(11, 16) : '');
    const worstHtml = '<p class="rr-worst lv' + (r.worst ? r.worst.tone : 0) + '">' + (r.worst
      ? '<b>Pire point · ' + txt(where(r.worst)) + '</b>' + (r.worst.elevation != null ? ' · alt. ' + txt(r.worst.elevation) + ' m' : '')
      : '<b>Aucun phénomène signalé aux points du trajet</b>') +
      (r.highest ? ' · point le plus haut : ' + txt(r.highest.elevation) + ' m (' + txt(where(r.highest)) + ')' + (r.highCount ? ' · ' + r.highCount + ' point(s) au-dessus de ' + ALT_HIGH_M + ' m' : '') : '') + '</p>';
    return '<div class="rr-top"><span class="pill ' + (r.partial || r.offline ? 'lv1' : 'lv0') + '">' + txt(r.coverage) + '</span>' +
      '<small class="sub">' + txt(r.routeKind) + (r.offline ? ' · hors connexion' : '') + '</small></div>' + worstHtml +
      '<div class="rr-band" role="list" aria-label="Succession des phénomènes aux points de prévision">' + band + '</div>' +
      '<ol class="rr-points">' + rows + '</ol>' +
      '<p class="sub rr-disclaimer">' + txt(r.caveat) + (r.missing ? ' · ' + r.missing + ' point(s) sans prévision.' : '') + '</p>';
  }
  return Object.freeze({ snapshot, html, samplePoints, STEP_KM, ALT_HIGH_M });
})();
function routeRadarHtml(t) {
  const sources = [];
  const add = (m, at) => { if (m && Array.isArray(m.hs)) sources.push({ hs: m.hs, at: m.retrievedAt || at || null, mode: m.mode }); };
  Object.values(M || {}).forEach(m => add(m, m && m.loc && RAW[m.loc.id] && RAW[m.loc.id].t));
  Object.values(MIDM || {}).forEach(m => add(m, null));
  Object.values(CALM || {}).forEach(c => c && add(c.m, c.t));
  Object.values(LEGM || {}).forEach(c => c && Array.isArray(c.models) && c.models.forEach(m => add(m, c.t)));
  const result = RouteRadar.snapshot({ trip: t, sources, offline: offlineNow() });
  return uxFold('route-radar', '🛰️ ROUTE RADAR', RouteRadar.html(result, esc), result.state === 'ready' ? result.coverage + ' · ' + result.points.length + ' points' : 'Météo de trajet indisponible');
}
