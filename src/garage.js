/* Garage : projection PURE des voitures déjà enregistrées.
 * Une source de vérité : S.cars + tyreState() ; aucune donnée mécanique inventée,
 * ni nouveau stockage, ni diagnostic OBD. Les dates sont celles déclarées.
 */
'use strict';
const Garage = (() => {
  const str = x => typeof x === 'string' ? x.trim() : '';
  const val = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
  const validDate = x => /^\d{4}-\d{2}-\d{2}$/.test(str(x));
  function overview(cars, activeId, stateFor) {
    if (!Array.isArray(cars)) return [];
    const used = new Set();
    return cars.filter(car => car && typeof car === 'object').map((car, index) => {
      const key = str(car.id) || 'car-' + index;
      if (used.has(key)) return null;
      used.add(key);
      const t = car.tire || {}, p = car.plan || {};
      const state = typeof stateFor === 'function' ? stateFor(car) : null;
      const readings = (Array.isArray(car.odo) ? car.odo : [])
        .filter(x => x && val(x.km) != null && validDate(x.d))
        .slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
      const last = readings.length ? readings[readings.length - 1] : null;
      const mounted = state && state.active;
      const lastPressure = state && state.pressure && state.pressure.check;
      const plan = !!p.on && t.type !== 'winter' ? {
        model: [str(p.brand), str(p.model)].filter(Boolean).join(' ') || null,
        size: str(p.size) || null,
        eta: validDate(p.etaFrom) ? p.etaFrom : null,
        etaTo: validDate(p.etaTo) ? p.etaTo : null,
        appointment: validDate(p.appointmentDate) ? p.appointmentDate : null,
        confirmed: !!p.appointmentConfirmed
      } : null;
      return {
        id: key, name: str(car.name) || str(car.short) || 'Voiture ' + (index + 1),
        short: str(car.short) || str(car.name) || 'Voiture ' + (index + 1),
        spec: str(car.spec), active: key === activeId,
        silhouette: silhouette(car),
        quality: state && Array.isArray(state.quality) ? state.quality.filter(q => q && ['Modèle exact', 'DOT', 'Profondeur', 'Pression'].includes(q.k)).map(q => ({ label: str(q.k), text: str(q.txt) })) : [],
        odo: last ? { km: last.km, date: last.d, source: 'USER_ENTERED' } : null,
        tyre: mounted ? {
          type: mounted.label,
          model: state.model && [str(state.model.brand), str(state.model.model)].filter(Boolean).join(' ') || null,
          size: str(t.size) || null,
          tread: state.tread && val(state.tread.mm) != null ? { mm: state.tread.mm, estimated: !!state.tread.est, date: state.tread.date || null } : null,
          pressure: state.pressure && val(state.pressure.target) != null ? { bar: state.pressure.target, checked: lastPressure && lastPressure.date || null,
            axles: state.pressure.axles && { ...state.pressure.axles } } : null,
          dot: state.dot && state.dot.txt || null,
          mount: state.mount && state.mount.date || null,
          kmSinceMount: state.mount && val(state.mount.kmSince) != null ? state.mount.kmSince : null,
          stored: state.stored || []
        } : null,
        notices: state && Array.isArray(state.maint) ? state.maint.map(m => ({ level: m.lv, text: str(m.text) })).filter(m => m.text) : [],
        winterPlan: plan
      };
    }).filter(Boolean);
  }
  // Aucune voiture codée en dur : la silhouette dépend seulement du libellé enregistré.
  function silhouette(car) {
    const name = [str(car.name), str(car.short)].join(' ').toLowerCase();
    return /\bi20\s*n\b/.test(name) ? 'sport' : /\b308\b/.test(name) ? 'touring' : 'generic';
  }
  const stamp = x => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str(x)) ? x.slice(0, 16) : null;
  function daylight(at, days) {
    const day = (days || []).find(d => d && d.date === (at || '').slice(0, 10));
    const rise = day && stamp(day.sunrise), set = day && stamp(day.sunset);
    return !at || !rise || !set ? 'unknown' : at >= rise && at < set ? 'day' : 'night';
  }
  // Projection de la séquence canonique. Les positions dans le dessin ne sont
  // jamais des coordonnées, des distances, ni une progression GPS.
  function preview(trip, { sourceFor = () => null, offline = false, now = Date.now(), freshness = () => 'STALE' } = {}) {
    if (!trip) return { available: false, samples: [], status: 'INDISPONIBLE', complete: false };
    const seq = Array.isArray(trip.seq) ? trip.seq : [];
    const points = seq.map(q => {
      const h = q && q.hs && q.hs[q.i], source = q && sourceFor(q);
      if (!h) return null;
      const at = stamp(q.t) || stamp(h.t), received = source && source.at;
      const known = Number.isFinite(received) && received > 0 && received <= now + 60000;
      const age = known ? Math.max(0, (now - received) / 60000) : null;
      const fresh = known ? freshness(age) : 'UNKNOWN';
      const rain = Number.isFinite(h.rain) && h.rain > 0 || Number.isFinite(h.Pl) && h.Pl > 0 || [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(h.code);
      const snow = Number.isFinite(h.snow) && h.snow > 0 || [71,73,75,77,85,86].includes(h.code);
      // Une visibilité réduite peut venir de la pluie : seul un code de
      // brouillard documenté justifie le voile. La visibilité reste affichée.
      const fog = [45,48].includes(h.code);
      const wind = Number.isFinite(h.wind) && h.wind > 0 || Number.isFinite(h.gust) && h.gust > 0;
      const direction = Number.isFinite(h.dir) && h.dir >= 0 && h.dir <= 360 ? h.dir : null;
      const place = str(q.name) || str(q.loc);
      const passage = stamp(q.t) || (place === str(trip.from) ? stamp(trip.dep) : place === str(trip.to) ? stamp(trip.arr) : null);
      return { at, place, temperature: Number.isFinite(h.T) ? h.T : null,
        rain: !!rain, snow: !!snow, fog: !!fog, visibility: val(h.vis), sun: h.code === 0 || h.code === 1,
        wind: !!wind, windDirection: direction, windSpeed: val(h.wind), gust: val(h.gust),
        phase: daylight(passage, source && source.days), received: known ? received : null,
        fresh, demo: !!source && source.mode === 'demo', cache: offline || !!source && source.mode === 'cache',
        complete: known && source.mode !== 'demo' && fresh !== 'STALE' && ['T', 'Tr', 'P', 'RH', 'vis', 'gust'].every(k => Number.isFinite(h[k])) };
    });
    const rows = points.filter(Boolean), indexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].filter(i => i >= 0 && i < rows.length);
    const complete = !!points.length && points.every(p => p && p.complete);
    const cached = rows.some(p => p.cache), stale = rows.some(p => p.fresh === 'STALE'), aging = rows.some(p => p.fresh === 'AGING'), demo = rows.some(p => p.demo);
    return { available: true, from: str(trip.from) || 'Départ à confirmer', to: str(trip.to) || 'Destination à confirmer',
      departure: stamp(trip.dep), arrival: stamp(trip.arr), samples: indexes.map(i => ({ ...rows[i], index: i + 1 })), count: rows.length,
      complete, demo, status: demo ? 'DÉMO · SIMULATION' : offline ? 'HORS LIGNE' : !rows.length ? 'MÉTÉO INDISPONIBLE' : stale ? 'CACHE ANCIEN' : cached ? 'CACHE' : !complete || aging ? 'À CONFIRMER' : 'PRÉVISION',
      // Une source manquante ou ancienne ne justifie pas une ambiance animée.
      animate: complete && !offline && !cached,
      hasNight: rows.some(p => p.phase === 'night'),
      phase: !rows.length ? 'unknown' : rows.every(p => p.phase === rows[0].phase) ? rows[0].phase : 'mixed' };
  }
  function comparison(cars, trip, scene) {
    return (cars || []).map(car => {
      const r = trip && Array.isArray(trip.res) && trip.res.find(x => x && x.c && x.c.id === car.id);
      const w = r && r.w, evaluated = !!(scene && scene.complete && car.tyre && w && Number.isInteger(w.level) && w.level >= 0 && w.level <= 3);
      const t = car.tyre;
      const valid = evaluated && !!(t.model && t.size && t.tread && !t.tread.estimated && t.tread.date && t.pressure && t.pressure.checked);
      const parts = evaluated && w.worst && w.worst.parts || [];
      return { id: car.id, level: valid ? w.level : null,
        label: !valid ? 'DONNÉES INSUFFISANTES' : ['AUCUN SIGNAL CRITIQUE CALCULÉ', 'SURVEILLANCE', 'PRUDENCE', 'DANGER'][w.level],
        reasons: parts.filter(p => p && str(p.label)).slice(0, 3).map(p => str(p.label)),
        missing: [!car.tyre && 'Monte non confirmée', car.tyre && !car.tyre.model && 'Modèle exact absent', car.tyre && !car.tyre.size && 'Dimensions absentes',
          (!car.tyre || !car.tyre.tread) && 'Profondeur absente', car.tyre && car.tyre.tread && car.tyre.tread.estimated && 'Profondeur estimée à mesurer',
          (!car.tyre || !car.tyre.pressure || !car.tyre.pressure.checked) && 'Contrôle de pression non daté', !valid && 'Évaluation du trajet indisponible ou incomplète'].filter(Boolean) };
    });
  }
  return { overview, silhouette, preview, comparison, daylight };
})();
