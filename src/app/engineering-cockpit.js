/* Cockpit V1.2 : projection pure des preuves existantes, sans télémétrie,
 * score, conversion physique, persistance ni appel réseau. */
const EngineeringCockpit = (() => {
  const TYPES = Object.freeze({ measured: 'MESURÉE', estimated: 'ESTIMÉE', documented: 'DOCUMENTÉE', unknown: 'INCONNUE' });
  const number = v => String(v).replace('.', ',');
  function build(r) {
    const datum = (kind, label, value, source, date = null, limit = '') => ({ kind, label, value, source, date, limit });
    const unknown = (label, reason) => datum('unknown', label, 'Non disponible', 'Aucune mesure du véhicule', null, reason);
    const results = ids => r.active ? r.facets.filter(f => ids.includes(f.id)).flatMap(f => f.results.map(x =>
      datum('documented', f.label, number(x.metric.value) + ' ' + x.metric.unit,
        x.test.source.organisation + ' · ' + x.test.source.year + ' · ' + x.test.size, x.test.source.publishedOn,
        x.metric.protocol + ' · ' + x.comparison.reasons.join(' ') + ' Résultat historique, non transposable au véhicule.'))) : [];
    const depths = r.active ? r.facts.current.map(x => datum(x.estimated ? 'estimated' : 'measured',
      'Profondeur · ' + ({ av: 'avant', ar: 'arrière' }[x.axle] || 'portée inconnue'), number(x.mm) + ' mm',
      x.estimated ? 'Estimation saisie par vous' : 'Mesure saisie par vous', x.date, r.facts.coverage)) : [];
    const pressures = r.active ? ['av', 'ar'].filter(k => r.pressure[k] !== null).map(k => datum('measured', 'Pression · ' + (k === 'av' ? 'avant' : 'arrière'),
      number(r.pressure[k]) + ' bar', 'Contrôle saisi par vous', r.pressure.date, 'Mesure datée, sans capteur en continu ; conditions à confirmer.')) : [];
    const domain = (id, title, note, items) => ({ id, title, note, items,
      kind: items.some(x => x.kind === 'measured') ? 'measured' : items.some(x => x.kind === 'documented') ? 'documented' : items.some(x => x.kind === 'estimated') ? 'estimated' : 'unknown' });
    return { version: '1.2', active: r.active, title: r.title, size: r.size, domains: [
      domain('acceleration', 'Accélération', 'Motricité et performance du véhicule non instrumentées.', [unknown('Accélération du véhicule', 'Aucun 0–100 km/h, effort longitudinal ou coefficient d’adhérence déduit des pneus ou du GPS.')]),
      domain('braking', 'Freinage', 'Essais publiés distincts du freinage actuel.', [unknown('Distance du véhicule', 'Aucune distance de freinage personnalisée calculée.'), ...results(['dryBraking', 'wetBraking', 'snowBraking'])]),
      domain('cornering', 'Tenue en virage', 'Chronos de protocole, sans limite de virage déduite.', [unknown('Adhérence en virage du véhicule', 'Rayon, transfert de charge et adhérence instantanée non mesurés.'), ...results(['dryHandling', 'wetHandling'])]),
      domain('stability', 'Stabilité du véhicule', 'Aucune conclusion sur le châssis à partir des seuls pneus.', [unknown('Stabilité dynamique', 'Géométrie, amortisseurs, charge et intervention de l’ESP non documentés.')]),
      domain('aquaplaning', 'Aquaplaning', 'Longitudinal et transversal restent deux essais distincts.', [unknown('État de la chaussée', 'Épaisseur d’eau inconnue ; aucune vitesse sûre de circulation calculée.'), ...results(['aquaLongitudinal', 'aquaLateral'])]),
      domain('tyres', 'État pneumatique', 'Monte active et points renseignés uniquement.', [...depths, ...pressures,
        ...(!depths.length ? [unknown('Profondeur', 'Mesurer les rainures de la monte active.')] : []),
        ...(!pressures.length ? [unknown('Pression réelle', 'Une pression cible ou une date seule ne constitue pas une mesure.')] : [])])
    ] };
  }
  return Object.freeze({ TYPES, build });
})();
