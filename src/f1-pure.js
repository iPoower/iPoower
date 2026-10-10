/* Modules F1 pure experience : projections de lecture UNIQUEMENT.
 * Aucune seconde source de vérité : météo, décision, pneus et débriefs viennent
 * des moteurs existants. Aucune mutation, position GPS ou télémétrie inventée.
 */
'use strict';
const F1Pure = (() => {
  const FEATURES = Object.freeze([
    { id: 'raceEngineer', title: 'Race Engineer', view: 'pneus', description: 'Briefing décisionnel, vocal sur demande' },
    { id: 'trackConditions', title: 'Track Conditions', view: 'meteo', description: 'Lecture météo du trajet par secteurs' },
    { id: 'tyreManagement', title: 'Tyre Management', view: 'pneus', description: 'État et actions pneus réellement renseignés' },
    { id: 'strategyAB', title: 'Strategy A/B', view: 'trajet', description: 'Comparer les voitures sur le même trajet' },
    { id: 'theGarage', title: 'The Garage', view: 'pneus', description: 'État technique des voitures enregistrées' },
    { id: 'telemetryReplay', title: 'Telemetry Replay', view: 'analyse', description: 'Retour terrain, sans capteurs imaginaires' }
  ]);
  const finite = Number.isFinite, text = x => typeof x === 'string' ? x : '';
  const level = x => finite(x) ? Math.max(0, Math.min(3, Math.floor(x))) : null;
  const label = l => ['STABLE', 'SURVEILLANCE', 'PRUDENCE', 'DANGER'][l] || 'INDISPONIBLE';
  const condition = key => ({ wet: 'Chaussée humide', rain: 'Pluie', fog: 'Brume / brouillard', snow: 'Neige', ice: 'Verglas' }[key] || text(key));
  function raceEngineer({ decision, confidence, trip, car } = {}) {
    if (!decision || !confidence) return { state: 'indisponible', title: 'Briefing indisponible', lines: ['En attente du cockpit décisionnel.'] };
    const risk = level(decision.displayLevel);
    let action;
    if (confidence.level >= 2) action = 'Ne pas déduire de feu vert : actualiser les données et confirmer les pneus ou le trajet.';
    else if (risk >= 3) action = 'Danger identifié : reconsidérer le départ ou le parcours ; privilégier la sécurité.';
    else if (risk >= 2) action = 'Prudence renforcée : vérifier les conditions réelles avant de partir.';
    else if (risk >= 1) action = 'Vérifier le point de vigilance avant le départ et adapter la conduite.';
    else action = 'Aucune alerte critique identifiée ; respecter les conditions réelles.';
    const route = trip && trip.to ? 'Prochain trajet : ' + text(trip.to) + (trip.dep ? ' · départ prévu ' + text(trip.dep).slice(11, 16) : '') : 'Aucun trajet immédiat identifié.';
    const confidenceLine = 'Confiance : ' + text(confidence.label || 'à confirmer') + (confidence.reason ? ' · ' + text(confidence.reason) : '');
    return { state: risk >= 2 || confidence.level >= 2 ? 'prudence' : 'information',
      title: risk == null ? 'Analyse en attente' : label(risk),
      lines: [route, car ? 'Voiture : ' + text(car.short || car.name || car.id) : 'Voiture active à confirmer.', confidenceLine,
        'Priorité : ' + text(decision.reason || 'Conditions à vérifier.'), action],
      action };
  }
  // La segmentation ne prétend jamais représenter des frontières géographiques
  // précises : uniquement les points météo réellement disponibles du trajet.
  function trackConditions(seq, { ageMin = null } = {}) {
    const rows = Array.isArray(seq) ? seq.map(q => q && q.hs && q.hs[q.i]).filter(Boolean) : [];
    if (!rows.length || ageMin != null && (!finite(ageMin) || ageMin > 90))
      return { available: false, reason: rows.length ? 'Prévisions de parcours trop anciennes.' : 'Aucun point météo de parcours disponible.', sectors: [] };
    const count = Math.min(3, rows.length), sectors = [];
    for (let n = 0; n < count; n++) {
      const a = Math.floor(n * rows.length / count), b = Math.floor((n + 1) * rows.length / count), points = rows.slice(a, b);
      let worst = 0; const signals = new Set();
      points.forEach(x => {
        if (x.ice && finite(x.ice.level) && x.ice.level >= 1) { worst = Math.max(worst, Math.min(3, x.ice.level + 1)); signals.add('Verglas · risque estimé'); }
        if (finite(x.vis) && x.vis < 1000) { worst = Math.max(worst, x.vis < 200 ? 3 : 2); signals.add('Visibilité réduite'); }
        if (finite(x.P) && x.P >= 0.5 || finite(x.Pl) && x.Pl >= 0.5) { worst = Math.max(worst, 1); signals.add('Pluie prévue'); }
        if (finite(x.snow) && x.snow > 0) { worst = Math.max(worst, 2); signals.add('Neige prévue'); }
        if (finite(x.Tr) && x.Tr <= 0) { worst = Math.max(worst, 1); signals.add('Chaussée estimée à 0 °C ou moins'); }
      });
      sectors.push({ index: n + 1, points: points.length, level: worst, label: label(worst), notes: [...signals].slice(0, 3),
        estimated: true });
    }
    return { available: true, reason: 'Points de prévision existants, secteurs de lecture non géolocalisés.', sectors };
  }
  function tyreManagement(state) {
    if (!state || !state.active) return { available: false, lines: ['Monte active non confirmée : aucun diagnostic pneus.'] };
    const lines = [ 'Monte active : ' + text(state.active.label) ];
    if (state.tread && finite(state.tread.mm)) lines.push('Profondeur la plus faible : ' + state.tread.mm.toFixed(1).replace('.', ',') + ' mm · ' + (state.tread.est ? 'estimée par utilisateur' : 'déclarée mesurée'));
    else lines.push('Profondeur non mesurée.');
    if (state.pressure && finite(state.pressure.target)) lines.push('Pression cible enregistrée : ' + state.pressure.target + ' bar (pas une mesure actuelle).');
    else lines.push('Pression cible non renseignée.');
    if (state.mount && finite(state.mount.kmSince)) lines.push('Depuis le montage : ' + state.mount.kmSince + ' km calculés sur les relevés disponibles.');
    if (Array.isArray(state.maint) && state.maint.length) lines.push(...state.maint.slice(0, 3).map(x => text(x.text)));
    return { available: true, lines };
  }
  function strategyAB(trip, activeCarId) {
    const rows = trip && Array.isArray(trip.res) ? trip.res.filter(r => r && r.c && r.w && level(r.w.level) != null) : [];
    const a = rows.find(r => r.c.id === activeCarId) || null, b = rows.find(r => !a || r.c.id !== a.c.id) || null;
    if (!trip || !a || !b) return { available: false, reason: 'Deux évaluations pneumatiques fiables sur le même trajet ne sont pas disponibles.', choices: [] };
    const choices = [a, b].map((r, i) => ({ scenario: i ? 'B' : 'A', car: text(r.c.short || r.c.name || r.c.id), level: level(r.w.level), risk: label(level(r.w.level)) }));
    return { available: true, choices, reason: 'Même origine, même horaire et même météo ; seule la voiture change. Aucun itinéraire alternatif ni gain de temps inventé.' };
  }
  function theGarage(cars) {
    if (!Array.isArray(cars) || !cars.length) return { available: false, cars: [] };
    return { available: true, cars: cars.filter(Boolean).map(car => {
      const t = car.tire || {}, odos = Array.isArray(car.odo) ? car.odo.filter(x => x && finite(x.km)) : [];
      const odo = odos.reduce((m, x) => !m || x.km > m.km ? x : m, null);
      return { name: text(car.short || car.name || car.id), tyre: [t.brand, t.model].filter(Boolean).join(' ') || 'Pneu non renseigné',
        odo: odo ? odo.km : null, mounted: text(t.mounted) || null, pressure: text(t.press) || null };
    }) };
  }
  function telemetryReplay(entries, compare) {
    const e = Array.isArray(entries) && entries[0];
    if (!e) return { available: false, reason: 'Aucun trajet clôturé dans le journal.' };
    const cmp = typeof compare === 'function' ? compare(e) : null;
    const lines = [
      'Trajet : ' + text(e.name || 'Trajet terminé'),
      e.start && finite(e.start.at) ? 'Départ enregistré et prévision figée.' : 'Départ non déclaré : aucun horaire réel inventé.',
      e.feedback ? 'Retour conducteur : ' + (e.feedback.conditions.length ? e.feedback.conditions.map(condition).join(' · ') : 'aucun phénomène indiqué') : 'Observation du conducteur non renseignée.',
      cmp && cmp.kind === 'unknown' ? 'Prévision non comparable : donnée absente ou trop ancienne.' : cmp && cmp.kind === 'pending' ? 'Comparaison en attente de retour conducteur.' :
        cmp ? 'Comparaison : ' + ({ match: 'concordante', missed: 'phénomène non annoncé', unused: 'alerte non rencontrée', mixed: 'écart mixte' }[cmp.kind] || 'non disponible') : 'Comparaison indisponible.',
      e.end && e.end.thermal ? 'Estimation thermique disponible (modèle, non mesurée).' : 'Pas de mesure thermique enregistrée.'
    ];
    return { available: true, lines, note: 'Relecture du journal local : aucune télémétrie de vitesse, freinage, GPS ou capteur ajoutée.' };
  }
  return { FEATURES, raceEngineer, trackConditions, tyreManagement, strategyAB, theGarage, telemetryReplay };
})();
