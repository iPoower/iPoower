// Weather Watch : adaptation et suivi en mémoire du moteur existant, jamais de nouveau calcul météo.
// Aucun accès réseau/stockage/DOM ; les alertes utilisent uniquement les valeurs fournies et des seuils explicites.
const WeatherWatch = (() => {
  // Politique de fraîcheur (valeurs de Reliability.FRESHNESS, vérifiées par tests/test_reliability.js) : ≤ 15 min frais · ≤ 60 min à confirmer · au-delà périmé.
  const FRESH_MAX_MIN = 15;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const value = x => finite(x) ? x : null;
  const minute = ts => typeof ts === 'string' ? Date.parse(ts.slice(0, 16) + ':00Z') / 60000 : NaN;
  const THRESHOLDS = [
    { id: 't7', field: 'T', below: 7, hysteresis: .5, label: 'Température sous 7 °C', level: 1 },
    { id: 't3', field: 'T', below: 3, hysteresis: .5, label: 'Température sous 3 °C', level: 2 },
    { id: 't0', field: 'T', below: 0, hysteresis: .5, label: 'Température sous 0 °C', level: 3 },
    { id: 'vis1000', field: 'vis', below: 1000, hysteresis: 200, label: 'Visibilité prévue sous 1 000 m', level: 2 },
    { id: 'vis500', field: 'vis', below: 500, hysteresis: 100, label: 'Visibilité prévue sous 500 m', level: 3 }
  ];
  function snapshot({ input, desk, model, raw, place, offline, demo, nowMs }) {
    if (!input || !desk || !model) return null;
    const now = input.now, at = minute(now), all = input.hours || [];
    const hour = all.find(x => minute(x.t) <= at && at < minute(x.t) + 60) || null;
    const coverage = !!hour;
    const ageMin = raw && finite(raw.t) && raw.t <= nowMs + 60000 ? Math.max(0, (nowMs - raw.t) / 60000) : null;
    const expired = !coverage || ageMin == null || ageMin > 36 * 60;
    const currentAge = desk.current.source === 'current' ? minute(now) - minute(model.cur.time) : 0;
    const fresh = !demo && !offline && !expired && raw.mode === 'live' && model.mode === 'live' && ageMin <= FRESH_MAX_MIN
      && finite(currentAge) && currentAge >= -1 && currentAge <= 30;
    const mode = demo ? 'DÉMO · simulé' : expired ? 'EXPIRÉ / INDISPONIBLE' : offline ? 'HORS LIGNE' : fresh ? 'LIVE' : 'CACHE';
    // La valeur principale est EXACTEMENT celle de Météo. Une valeur en cache est nommée comme telle.
    // L'heure prévue avance indépendamment dans la bande horaire, même sans connexion.
    const current = coverage ? { ...desk.current } : { T: null, Tapp: null, source: 'hourly' };
    const timeline = (desk.timeline.strip || []).filter(x => minute(x.t) + 60 > at && minute(x.t) <= at + 12 * 60).slice(0, 13);
    const ar = model.payload && model.payload.__arome;
    const modelSource = ar && ar.hours ? 'Open-Meteo + Météo-France AROME' : 'Open-Meteo · modèle de base';
    const h = hour || {}, obs = model.obs;
    const observation = obs && typeof obs.t === 'string' && finite(Date.parse(obs.t)) && Date.parse(obs.t) <= nowMs + 60000
      ? { id: obs.id, name: obs.name, t: obs.t, T: value(obs.T), vis: value(obs.vis), ageMin: Math.max(0, (nowMs - Date.parse(obs.t)) / 60000) } : null;
    return { now, nowMs, key: place ? [place.id, place.lat, place.lon].join('|') : model.id,
      name: place && place.name || 'Lieu sélectionné', mode, fresh, expired, coverage, ageMin,
      fetchedAt: raw && value(raw.t), currentTime: current.source === 'current' ? model.cur.time || h.t || null : h.t || null,
      current, hourTime: hour && hour.t, forecastNow: value(h.T), roadT: value(h.Tr),
      ice: h.ice && finite(h.ice.level) ? h.ice.level : null,
      wind: value(h.wind), gust: value(h.gust), vis: value(h.vis), pp: value(h.pp), rain: value(h.Pl) ?? value(h.P), snow: value(h.snow),
      fog: (desk.phen.find(x => x.id === 'fog') || {}).line || 'Donnée indisponible',
      timeline, nextChange: desk.nextChange, road: desk.road, hero: desk.hero, modelSource,
      rainSource: h.ar ? 'Météo-France AROME via Open-Meteo' : 'Open-Meteo · modèle de base',
      observation, estimates: timeline.map(x => { const y = all.find(hh => hh.t === x.t) || {}; return { t: x.t, Tr: value(y.Tr) }; }) };
  }
  // L'historique est limité à 8 lieux et 60 événements par lieu, uniquement pendant cette session.
  function monitor() {
    const places = new Map();
    function state(key) {
      if (!places.has(key)) {
        if (places.size >= 8) places.delete(places.keys().next().value);
        places.set(key, { last: null, latches: {}, cooldown: {}, events: [], alerts: [] });
      }
      return places.get(key);
    }
    function ingest(s, options = {}) {
      if (!s) return { events: [], alerts: [], emitted: [] };
      const st = state(s.key), prev = st.last, emitted = [], cooldownMs = Math.max(1, Math.min(120, Number(options.cooldownMin) || 15)) * 60000;
      const record = (kind, text) => st.events.push({ at: s.nowMs, kind, text });
      const alert = (id, text, level) => {
        if (!options.enabled || !s.fresh || (st.cooldown[id] || 0) > s.nowMs) return;
        const row = { id, at: s.nowMs, text, level };
        st.cooldown[id] = s.nowMs + cooldownMs; st.alerts.push(row); emitted.push(row);
      };
      if (!prev || prev.mode !== s.mode) record('statut', 'Données : ' + s.mode + (s.mode === 'LIVE' ? ' · modèles actualisés' : ' · fraîcheur à vérifier'));
      const ob = s.observation, po = prev && prev.observation;
      if (ob && (!po || ob.id !== po.id || ob.t !== po.t))
        record('observation', `Station ${ob.name || ob.id} · relevé ${ob.t}${ob.T != null ? ' · ' + ob.T.toFixed(1) + ' °C' : ''}${ob.vis != null ? ' · visibilité ' + Math.round(ob.vis) + ' m' : ''}`);
      // Comparer la même échéance, pas la température de deux heures successives.
      // Un téléchargement identique et l'écoulement du temps ne sont pas des révisions.
      if (prev && s.fetchedAt > prev.fetchedAt) {
        const old = new Map(prev.timeline.map(x => [x.t, x]));
        const changed = s.timeline.find(x => {
          const p = old.get(x.t); return p && ((finite(x.T) && finite(p.T) && Math.abs(x.T - p.T) >= .3)
            || (finite(x.vis) && finite(p.vis) && Math.abs(x.vis - p.vis) >= 250)
            || (finite(x.pp) && finite(p.pp) && Math.abs(x.pp - p.pp) >= 15)
            || (finite(x.gust) && finite(p.gust) && Math.abs(x.gust - p.gust) >= 10));
        });
        if (changed) {
          const p = old.get(changed.t), delta = finite(changed.T) && finite(p.T) && Math.abs(changed.T - p.T) >= .3
            ? `température prévue ${p.T.toFixed(1)} → ${changed.T.toFixed(1)} °C`
            : finite(changed.vis) && finite(p.vis) && Math.abs(changed.vis - p.vis) >= 250
              ? `visibilité prévue ${Math.round(p.vis)} → ${Math.round(changed.vis)} m`
              : finite(changed.pp) && finite(p.pp) && Math.abs(changed.pp - p.pp) >= 15
                ? `probabilité de pluie ${Math.round(p.pp)} → ${Math.round(changed.pp)} %` : `rafales prévues ${Math.round(p.gust)} → ${Math.round(changed.gust)} km/h`;
          record('prévision', changed.t.slice(11, 16) + ' · ' + delta);
        }
      }
      if (prev && prev.hourTime === s.hourTime && finite(prev.roadT) && finite(s.roadT)
          && (Math.abs(s.roadT - prev.roadT) >= .4 || s.ice !== prev.ice))
        record('estimation', `Chaussée estimée ${prev.roadT.toFixed(1)} → ${s.roadT.toFixed(1)} °C · moteur Race Control`);
      // Les seuils ne sont réarmés que par une donnée fraîche. Après une interruption,
      // une nouvelle base est établie : pas de notification rétroactive sur un cache.
      if (s.fresh) {
        const baseline = !prev || !prev.fresh || options.rebaseline;
        for (const t of THRESHOLDS) {
          const v = t.field === 'T' ? s.current.T : s[t.field]; if (!finite(v)) { delete st.latches[t.id]; continue; }
          const below = v < t.below;
          if (baseline || st.latches[t.id] == null) st.latches[t.id] = below;
          else if (below && !st.latches[t.id]) { st.latches[t.id] = true; alert(t.id, t.label, t.level); }
          else if (v >= t.below + t.hysteresis) st.latches[t.id] = false;
        }
        if (!baseline) {
          if (s.ice != null && prev.ice != null && s.ice > prev.ice && s.ice >= 1) alert('ice', 'Risque de gel / verglas en hausse · estimation', Math.min(3, s.ice + 1));
          if (finite(s.gust) && finite(prev.gust) && s.gust >= 55 && s.gust - prev.gust >= 15) alert('gust', 'Rafales en hausse d’au moins 15 km/h, à 55 km/h ou plus', s.gust >= 70 ? 2 : 1);
          if (s.road && prev.road && finite(s.road.score) && finite(prev.road.score) && s.road.level > prev.road.level)
            alert('road', 'Risque routier en hausse · période du moteur Météo', s.road.level);
        }
        // Pluie imminente : prochaine heure (ou nowcast fourni au moteur), quantité ≥ 0,2 mm/h OU probabilité ≥ 60 %.
        const imminent = s.timeline.find(x => minute(x.t) <= minute(s.now) + 60 && ((finite(x.P) && x.P >= .2) || (finite(x.pp) && x.pp >= 60)));
        const rainOn = !!imminent;
        if (!baseline && st.latches.rain === false && rainOn) alert('rain', 'Pluie possible dans l’heure · prévision disponible', 1);
        st.latches.rain = rainOn;
      }
      st.last = s; st.events = st.events.slice(-60); st.alerts = st.alerts.slice(-12);
      return { events: st.events.slice(), alerts: st.alerts.slice(), emitted };
    }
    return { ingest, size: () => places.size };
  }
  return { snapshot, monitor, THRESHOLDS };
})();
