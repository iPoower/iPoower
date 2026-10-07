// Synthèse transverse : décision, confiance qualitative et changements significatifs.
// Aucun score probabiliste inventé, aucune coordonnée ni titre d'agenda persisté.
'use strict';
const Decision = (() => {
  const KEY = 'twrc.decision.latest.v1';
  const CONF = [
    { key: 'solid', label: 'SOLIDE' },
    { key: 'confirm', label: 'À CONFIRMER' },
    { key: 'degraded', label: 'DÉGRADÉ' }
  ];
  const RISK = ['CONDITIONS STABLES', 'SURVEILLANCE', 'PRUDENCE', 'DANGER'];
  const finite = Number.isFinite;
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  const text = (v, max = 180) => typeof v === 'string' ? v.slice(0, max) : null;
  const round1 = v => finite(v) ? Math.round(v * 10) / 10 : null;
  const clampLevel = v => finite(v) ? Math.max(0, Math.min(3, Math.round(v))) : 0;

  function confidence(input = {}) {
    let level = 0;
    const reasons = [];
    const add = (n, reason) => {
      if (n > level) level = n;
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    };
    const w = input.weather || {};
    if (!w.available || !finite(w.ageMin)) add(2, 'Météo indisponible');
    else {
      if (w.ageMin > 60) add(2, 'Météo trop ancienne');
      else if (w.ageMin > 15) add(1, 'Météo à confirmer');
      if (w.mode !== 'live') add(1, 'Météo en cache');
    }
    if (input.online === false) add(1, 'Réseau hors ligne');
    if (input.contextKnown === false) add(1, 'Lieu courant à confirmer');
    if (input.storageDurable === false) add(1, 'Stockage local non validé');
    if (input.tyresRequired && !input.tyresKnown) add(2, 'Pneus montés à confirmer');
    if (input.activeTrip) {
      if (!finite(input.gpsAgeMin) || input.gpsAgeMin > 2) add(2, 'GPS du trajet non frais');
      if (!input.routeReady) add(2, 'Itinéraire vivant non actualisé');
    }
    if (input.agendaRequired) {
      if (!input.agendaAvailable) add(1, 'Agenda indisponible');
      else if (finite(input.agendaAgeMin) && input.agendaAgeMin > 60) add(1, 'Agenda ancien');
    }
    const meta = CONF[Math.min(2, level)];
    return { level, key: meta.key, label: meta.label, reason: reasons[0] || 'Données critiques fraîches', reasons: reasons.slice(0, 3) };
  }

  function decide(input = {}) {
    const alerts = (input.alerts || []).filter(a => a && finite(a.sev)).map(a => ({ sev: clampLevel(a.sev), title: text(a.title, 220) || '' }))
      .sort((a, b) => b.sev - a.sev);
    const tyreLevel = input.tyreLevel == null ? null : clampLevel(input.tyreLevel);
    const top = alerts[0] || null;
    const riskLevel = Math.max(top ? top.sev : 0, tyreLevel == null ? 0 : tyreLevel);
    let reason = top && top.sev >= (tyreLevel == null ? -1 : tyreLevel) ? top.title : text(input.tyreReason, 220);
    let label = RISK[riskLevel], displayLevel = riskLevel;
    const conf = input.confidence || CONF[0];
    if (conf.level >= 2 && riskLevel < 2) {
      label = 'DONNÉES DÉGRADÉES';
      displayLevel = 2;
      reason = conf.reason;
    }
    return { riskLevel, displayLevel, label, reason: reason || (riskLevel ? 'Conditions à surveiller' : 'Aucun signal critique détecté') };
  }

  function snapshot(v = {}) {
    return {
      v: 1,
      at: finite(v.at) ? v.at : null,
      riskLevel: clampLevel(v.riskLevel),
      confidenceKey: ['solid', 'confirm', 'degraded'].includes(v.confidenceKey) ? v.confidenceKey : 'degraded',
      weatherMode: ['live', 'cache', 'demo'].includes(v.weatherMode) ? v.weatherMode : null,
      weatherAt: finite(v.weatherAt) ? v.weatherAt : null,
      temperature: round1(v.temperature),
      roadTemp: round1(v.roadTemp),
      visibility: finite(v.visibility) && v.visibility >= 0 ? Math.round(v.visibility) : null,
      destinationKey: text(v.destinationKey, 240),
      destinationId: text(v.destinationId, 120),
      carId: text(v.carId, 120),
      tyreSig: text(v.tyreSig, 360),
      placeId: text(v.placeId, 120)
    };
  }
  const confRank = key => ({ solid: 0, confirm: 1, degraded: 2 }[key] ?? 2);
  const visBand = v => !finite(v) ? null : v < 200 ? 3 : v < 500 ? 2 : v < 1000 ? 1 : 0;
  const visText = v => !finite(v) ? '—' : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(v) + ' m';
  const tempText = v => String(round1(v)).replace('.', ',') + ' °C';
  function changes(previous, current) {
    if (!previous || !current) return [];
    const a = snapshot(previous), b = snapshot(current), out = [];
    if (a.riskLevel !== b.riskLevel) out.push({ kind: b.riskLevel > a.riskLevel ? 'up' : 'down', text: 'Risque : ' + RISK[a.riskLevel] + ' → ' + RISK[b.riskLevel] });
    if (a.confidenceKey !== b.confidenceKey) out.push({ kind: confRank(b.confidenceKey) > confRank(a.confidenceKey) ? 'up' : 'down', text: 'Confiance : ' + CONF[confRank(a.confidenceKey)].label + ' → ' + CONF[confRank(b.confidenceKey)].label });
    if ((a.destinationKey || a.destinationId) !== (b.destinationKey || b.destinationId)) out.push({ kind: 'change', text: 'Destination modifiée' });
    if (a.carId !== b.carId) out.push({ kind: 'change', text: 'Voiture active modifiée' });
    if (a.tyreSig !== b.tyreSig) out.push({ kind: 'change', text: 'Monte pneumatique modifiée' });
    if (a.placeId !== b.placeId) out.push({ kind: 'change', text: 'Lieu courant modifié' });
    if (visBand(a.visibility) !== visBand(b.visibility) && visBand(a.visibility) != null && visBand(b.visibility) != null)
      out.push({ kind: visBand(b.visibility) > visBand(a.visibility) ? 'up' : 'down', text: 'Visibilité : ' + visText(a.visibility) + ' → ' + visText(b.visibility) });
    if (finite(a.roadTemp) && finite(b.roadTemp) && Math.abs(b.roadTemp - a.roadTemp) >= 1.5)
      out.push({ kind: b.roadTemp < a.roadTemp ? 'up' : 'down', text: 'Chaussée estimée : ' + tempText(a.roadTemp) + ' → ' + tempText(b.roadTemp) });
    if (finite(a.temperature) && finite(b.temperature) && Math.abs(b.temperature - a.temperature) >= 2)
      out.push({ kind: 'change', text: 'Air : ' + tempText(a.temperature) + ' → ' + tempText(b.temperature) });
    if (a.weatherMode !== b.weatherMode) out.push({ kind: b.weatherMode === 'live' ? 'down' : 'up', text: b.weatherMode === 'live' ? 'Météo de nouveau LIVE' : 'Météo passée en cache' });
    return out;
  }

  function parse(raw) {
    try {
      const v = JSON.parse(raw || 'null');
      return v && v.v === 1 ? snapshot(v) : null;
    } catch (e) { return null; }
  }
  function history(storage, key = KEY) {
    let baseline = null, latest = null;
    try { baseline = parse(storage && storage.getItem(key)); latest = baseline ? JSON.stringify(baseline) : null; } catch (e) { baseline = null; }
    return {
      key,
      baseline: () => clone(baseline),
      changes: current => changes(baseline, current),
      save(current) {
        const clean = snapshot(current), raw = JSON.stringify(clean);
        if (raw === latest) return false;
        latest = raw;
        try { if (storage) storage.setItem(key, raw); } catch (e) { return false; }
        return true;
      },
      reset() {
        baseline = null; latest = null;
        try { if (storage) storage.removeItem(key); } catch (e) { /* stockage indisponible */ }
      }
    };
  }
  return { KEY, confidence, decide, snapshot, changes, history };
})();
