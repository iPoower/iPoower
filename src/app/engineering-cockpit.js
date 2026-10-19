/* Cockpit V1.2 : projection pure des preuves existantes, sans télémétrie,
 * score, conversion physique, persistance ni appel réseau. */
const EngineeringCockpit = (() => {
  const TYPES = Object.freeze({ measured: 'MESURÉE', estimated: 'ESTIMÉE', documented: 'DOCUMENTÉE', unknown: 'INCONNUE' });
  const number = v => String(v).replace('.', ',');
  // Références relues le 19/10/2026 ; ni essai ni règle locale de vigilance.
  const REFERENCES = Object.freeze({
    depth: { label: 'Arrêté du 18 juillet 2019 · article 5 · véhicules M1/N1/O1/O2', url: 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000038995312', checkedOn: '2026-10-19' },
    pressure: { label: 'Michelin · contrôle mensuel et pression à froid', url: 'https://www.michelin.fr/auto/conseils/guide-pneus-hiver/quelle-pression-pneus-hiver', checkedOn: '2026-10-19' }
  });
  function diagnostics(r) {
    const priority = { 'Risque documenté': 0, Vigilance: 1, 'Données insuffisantes': 2, Information: 3 };
    const entries = r.rules.filter(x => x.state !== 'Information').map(x => ({ ...x,
      reference: x.id === 'critical-depth' || x.id === 'estimated-critical-depth' ? { ...REFERENCES.depth }
        : ['pressure-check', 'pressure-target-gap', 'zero-pressure', 'historical-zero-pressure'].includes(x.id) ? { ...REFERENCES.pressure } : null
    })).sort((a, b) => (priority[a.state] ?? 4) - (priority[b.state] ?? 4));
    const samples = r.weather.samples || [];
    const range = (key, label) => {
      const v = samples.map(x => x[key]).filter(x => typeof x === 'number' && Number.isFinite(x));
      return { kind: v.length ? 'estimated' : 'unknown', label, value: v.length ?
        number(Math.floor(Math.min(...v))) + ' à ' + number(Math.ceil(Math.max(...v))) + ' °C' : 'Non disponible' };
    };
    return { entries, weather: { source: r.weather.source || 'Source inconnue', scope: r.weather.scope || 'Portée inconnue',
      fetchedAt: r.weather.fetchedAt || null, ageMin: Number.isFinite(r.weather.ageMin) && r.weather.ageMin >= 0 ? Math.ceil(r.weather.ageMin) : null,
      state: !samples.length ? 'INDISPONIBLE' : !r.weather.fresh ? 'ANCIENNE OU NON DATÉE' : 'PRÉVISIONS RÉCENTES',
      offline: !!r.weather.offline, values: [range('T', 'Air prévu'), range('Tr', 'Chaussée · modèle estimé')] } };
  }
  function build(r) {
    const datum = (kind, label, value, source, date = null, limit = '') => ({ kind, label, value, source, date, limit });
    const unknown = (label, reason) => datum('unknown', label, 'Non disponible', 'Aucune mesure du véhicule', null, reason);
    const results = ids => r.active ? r.facets.filter(f => ids.includes(f.id)).flatMap(f => f.results.map(x =>
      ({ ...datum('documented', f.label, number(x.metric.value) + ' ' + x.metric.unit,
        x.test.source.organisation + ' · ' + x.test.source.year + ' · ' + x.test.size, x.test.source.publishedOn,
        x.metric.protocol + ' · ' + x.comparison.reasons.join(' ') + (r.conflicts.some(c => c.facet === f.id && c.tests.includes(x.test.id)) ? ' Sources contradictoires : conclusion suspendue.' : '') + ' Résultat historique, non transposable au véhicule.'),
        url: x.test.source.url, checkedOn: x.test.source.checkedOn }))) : [];
    const depths = r.active ? r.facts.current.map(x => datum(x.estimated ? 'estimated' : 'measured',
      'Profondeur · ' + ({ av: 'avant', ar: 'arrière' }[x.axle] || 'portée inconnue'), number(x.mm) + ' mm',
      x.estimated ? 'Estimation saisie par vous' : 'Mesure saisie par vous', x.date, r.facts.coverage)) : [];
    const pressures = r.active ? ['av', 'ar'].filter(k => r.pressure[k] !== null).map(k => datum('measured', 'Pression · ' + (k === 'av' ? 'avant' : 'arrière'),
      number(r.pressure[k]) + ' bar', 'Contrôle saisi par vous', r.pressure.date, 'Mesure datée, sans capteur en continu ; conditions à confirmer.')) : [];
    const domain = (id, title, note, items) => ({ id, title, note, items,
      kind: items.some(x => x.kind === 'measured') ? 'measured' : items.some(x => x.kind === 'documented') ? 'documented' : items.some(x => x.kind === 'estimated') ? 'estimated' : 'unknown' });
    return { version: '1.2', active: r.active, title: r.title, size: r.size, diagnostics: diagnostics(r), domains: [
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
