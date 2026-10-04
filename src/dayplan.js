/* Plan de tenue pur. Les heures sont locales et déjà alignées par l'adaptateur.
   Pas de réseau, de stockage ou d'horloge : mêmes entrées, même résultat. */
function dayplan(input) {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const unique = values => [...new Set(values)];
  const layers = ['Chemise légère', 'Veste légère', 'Maille fine', 'Maille chaude', 'Manteau', 'Écharpe, gants et bonnet'];
  const limits = [Infinity, 25, 19, 13, 7, 0];
  const representative = [28, 22, 16, 10, 4, -1];
  const stack = level => level == null ? [] : layers.slice(0, level + 1);
  const levelFor = temperature => temperature <= 0 ? 5 : temperature <= 7 ? 4 : temperature <= 13 ? 3 : temperature <= 19 ? 2 : temperature <= 25 ? 1 : 0;
  // Z sert seulement à mesurer des intervalles entre heures murales ; aucune
  // conversion implicite selon le fuseau de la machine n'est effectuée ici.
  const minutes = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? Date.parse(value + (value.length === 16 ? ':00Z' : 'Z')) / 60000 : NaN;
  const moments = ((input && input.moments) || []).map(moment => ({
    start: moment.start, end: moment.end, location: typeof moment.location === 'string' ? moment.location : '',
    kind: moment.kind || 'gap', event: !!moment.event, weather: moment.weather ? { ...moment.weather } : null,
    unknown: !!moment.unknown || !moment.location, stale: !!moment.stale
  })).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const temperature = moment => {
    if (moment.unknown || !moment.weather) return null;
    return finite(moment.weather.Tapp) ? moment.weather.Tapp : finite(moment.weather.T) ? moment.weather.T : null;
  };
  const temps = moments.map(temperature);
  const first = temps.findIndex(value => value != null);
  if (first < 0) return null;

  // Une variation doit dépasser la frontière de 1 °C pour changer de niveau.
  const candidate = (value, current) => {
    const next = levelFor(value);
    if (next < current && value <= limits[current] + 1) return current;
    if (next > current && value > limits[current + 1] - 1) return current;
    return next;
  };
  const effective = Array(moments.length).fill(null);
  let current = levelFor(temps[first]), ignoredThermal = false;
  for (let i = first; i < moments.length; i++) {
    if (temps[i] == null) continue;
    const next = candidate(temps[i], current);
    if (next !== current) {
      const direction = Math.sign(next - current);
      let duration = 0, hasEvent = false;
      for (let j = i; j < moments.length; j++) {
        if (temps[j] == null || (j > i && moments[j - 1].end !== moments[j].start)) break;
        if (Math.sign(candidate(temps[j], current) - current) !== direction) break;
        const span = minutes(moments[j].end) - minutes(moments[j].start);
        if (Number.isFinite(span) && span > 0) duration += span;
        hasEvent = hasEvent || moments[j].event;
      }
      if (duration < 120 && !hasEvent) {
        ignoredThermal = true;
      } else current = next;
    }
    effective[i] = current;
  }

  // Les dangers sont indépendants du ressenti et de la règle thermique de 2 h.
  const hazards = moment => {
    if (moment.unknown || !moment.weather) return [];
    const weather = moment.weather, result = [];
    if ([56, 57, 66, 67].includes(weather.code)) result.push('freezing');
    if ((finite(weather.snow) && weather.snow > 0) || [71, 73, 75, 77, 85, 86].includes(weather.code)) result.push('snow');
    if ([95, 96, 99].includes(weather.code)) result.push('storm');
    if ((finite(weather.pp) && weather.pp >= 50) || (finite(weather.P) && weather.P >= 0.1) || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weather.code)) result.push('rain');
    // Même prudence que wardrobe.js : vent soutenu à 40 km/h ou rafales à 50.
    if ((finite(weather.gust) && weather.gust >= 50) || (finite(weather.wind) && weather.wind >= 40)) result.push('wind');
    return result;
  };
  const hazardLists = moments.map(hazards), allHazards = unique(hazardLists.flat());
  const wet = allHazards.some(hazard => hazard !== 'wind');
  const hood = allHazards.includes('wind') || allHazards.includes('storm');
  const protection = wet ? 'Imperméable avec capuche' : 'Couche extérieure coupe-vent';
  const hazardCarry = wet ? [protection, ...(hood ? [] : ['Parapluie'])] : hood ? [protection] : [];
  const baseLevel = Math.max(...effective.filter(level => level != null));
  const baseLayers = stack(baseLevel), firstLayers = stack(effective[first]);
  const carry = unique([...baseLayers.filter(layer => !firstLayers.includes(layer)), ...hazardCarry]);

  // sartorialAdvice reste l'unique calcul du détail vestimentaire. Une température
  // filtrée est ramenée à son niveau effectif, pour que la carte et le plan ne
  // divergent pas. Les dangers de tous les lieux connus restent dans ces samples.
  const samples = moments.flatMap((moment, index) => {
    if (moment.unknown || !moment.weather) return [];
    const weather = { ...moment.weather };
    if (temps[index] != null && levelFor(temps[index]) !== effective[index]) {
      weather.T = representative[effective[index]];
      weather.Tapp = representative[effective[index]];
    }
    return [weather];
  });
  const advice = sartorialAdvice(samples, input.occasion);
  // Les métriques affichées décrivent la météo réelle, même lorsqu'une courte
  // oscillation a été lissée pour choisir les vêtements. Seul le choix thermique
  // ci-dessus repose sur les niveaux effectifs.
  const actualTemperatures = temps.filter(value => value != null);
  advice.low = Math.min(...actualTemperatures);
  advice.high = Math.max(...actualTemperatures);
  advice.tempFallback = moments.some(moment => !moment.unknown && moment.weather && !finite(moment.weather.Tapp));
  advice.partial = moments.some(moment => !moment.unknown && moment.weather && ['Tapp', 'pp', 'P', 'gust'].some(key => !finite(moment.weather[key])));
  if (advice.pieces[1].detail === 'Maille amovible pour les endroits chauffés.') advice.pieces[1].detail = 'Maille amovible pour adapter les couches au fil de la journée.';
  advice.title = ['Chaleur · tenue allégée', 'Douceur · matières respirantes',
    'Mi-saison · veste et maille fine', 'Fraîcheur · veste et mailles amovibles',
    'Froid · manteau et maille', 'Grand froid · couches chaudes'][baseLevel];
  const upperLayers = [baseLevel <= 1 ? 'Chemise légère en coton ou lin' : 'Chemise en coton',
    ...(baseLevel >= 2 ? ['Maille fine'] : []), ...(baseLevel >= 3 ? ['Maille chaude'] : [])];
  advice.pieces[1].item = upperLayers.join(' + ');
  advice.pieces[1].detail = 'Couches du kit de la journée, amovibles selon les moments du plan.';
  const outerLayers = [...(baseLevel >= 1 ? ['Veste légère'] : []),
    ...(baseLevel >= 4 ? [baseLevel === 5 ? 'Manteau de laine épais' : 'Manteau de laine'] : []),
    ...(wet || hood ? [protection] : [])];
  advice.pieces[0].item = outerLayers.length ? outerLayers.join(' + ') : 'Veste en lin, facultative';
  advice.pieces[0].detail = wet ? 'Une couche réellement résistante à la pluie ; la laine seule ne suffit pas.' :
    baseLevel >= 4 ? 'Un manteau par-dessus la veste pour les passages dehors.' :
      baseLevel >= 1 ? 'Veste amovible selon les moments du plan.' : 'À garder surtout pour le rendez-vous ou le bureau.';
  if ((finite(advice.gust) && advice.gust >= 35) || (finite(advice.wind) && advice.wind >= 25)) {
    advice.pieces[0].detail += ' Ferme la couche extérieure pendant les passages exposés au vent.';
  }
  const actions = [], removed = new Set();
  let previousLevel = effective[first], previousHazards = [];
  const timeline = moments.map((moment, index) => {
    const rowActions = [], level = effective[index];
    const addAction = (text, kind) => {
      const confirmed = moment.stale ? 'À confirmer : ' + text : text;
      rowActions.push(confirmed);
      actions.push({ time: moment.start, text: confirmed, kind });
    };
    if (level != null && index !== first && level !== previousLevel) {
      const before = stack(previousLevel), after = stack(level);
      const add = after.filter(layer => !before.includes(layer));
      const takeOff = before.filter(layer => !after.includes(layer)).reverse();
      const event = moment.event ? (+String(moment.start).slice(11, 13) >= 17 ? 'Pour ton rendez-vous du soir, ' : 'Pour ton rendez-vous, ') : '';
      if (add.length) addAction(event + (add.every(layer => removed.has(layer)) ? 'remets ' : 'ajoute ') + add.join(', ') + '.', 'thermal');
      if (takeOff.length) {
        takeOff.forEach(layer => removed.add(layer));
        addAction(event + 'retire ' + takeOff.join(', ') + ' ; garde ces pièces avec toi.', 'thermal');
      }
    }
    if (level != null) previousLevel = level;
    const localHazards = hazardLists[index];
    const onset = localHazards.filter(hazard => !previousHazards.includes(hazard));
    if (onset.length) {
      const texts = [];
      if (onset.includes('freezing')) texts.push('Pluie verglaçante : mets l’imperméable, utilise une semelle crantée et évite les surfaces glissantes.');
      if (onset.includes('snow')) texts.push('Neige : mets l’imperméable et garde des chaussures résistantes à l’eau, à semelle crantée.');
      if (onset.includes('storm')) texts.push('Orage : mets la protection avec capuche et vérifie la vigilance avant de rester dehors.');
      if (onset.includes('rain')) texts.push(hood ? 'Pluie : mets l’imperméable avec capuche.' : 'Pluie : mets l’imperméable et prends le parapluie.');
      if (onset.includes('wind')) texts.push('Vent fort : ferme une couche coupe-vent et préfère la capuche au parapluie.');
      addAction(texts.join(' '), 'weather');
    }
    const precipitation = ['rain', 'snow', 'freezing', 'storm'];
    const hasPrecipitationData = moment.weather && (['P', 'pp', 'snow', 'code'].some(key => finite(moment.weather[key])));
    if (!moment.unknown && hasPrecipitationData && previousHazards.some(hazard => precipitation.includes(hazard)) &&
      !localHazards.some(hazard => precipitation.includes(hazard))) {
      addAction('Protection de pluie utile jusqu’à ' + moment.start.slice(11, 16) +
        ' ; range l’imperméable si les conditions se confirment.', 'weather');
    }
    previousHazards = localHazards;
    const status = moment.unknown ? 'Lieu inconnu · météo locale non calculée' : !moment.weather ? 'Météo locale non calculée' : moment.stale ? 'Données anciennes · à confirmer' : temps[index] == null ? 'Température indisponible' : 'Prévision locale';
    return { ...moment, weather: moment.unknown ? null : moment.weather, level, layers: stack(level), actions: rowActions, status,
      temperatureRange: temps[index] == null ? null : { low: temps[index], high: temps[index] } };
  });

  // Même lieu, niveau et dangers : les variations horaires de température seules
  // ne créent pas 24 lignes. Une nouvelle action garde son heure et sa ligne.
  // On conserve l'amplitude du ressenti et les pires valeurs de précipitations,
  // rafales et UV, sans fusionner à travers une transition météo.
  const weatherKey = row => hazards(row).join(',');
  const grouped = [];
  timeline.forEach(row => {
    const last = grouped[grouped.length - 1];
    if (last && last.end === row.start && last.location === row.location && last.kind === row.kind && last.event === row.event && last.level === row.level && last.status === row.status && !row.actions.length && weatherKey(last) === weatherKey(row)) {
      last.end = row.end;
      if (last.temperatureRange && row.temperatureRange) {
        last.temperatureRange.low = Math.min(last.temperatureRange.low, row.temperatureRange.low);
        last.temperatureRange.high = Math.max(last.temperatureRange.high, row.temperatureRange.high);
      }
      if (last.weather && row.weather) {
        ['P', 'pp', 'gust', 'wind', 'snow', 'uv'].forEach(key => {
          if (finite(row.weather[key])) last.weather[key] = finite(last.weather[key]) ? Math.max(last.weather[key], row.weather[key]) : row.weather[key];
        });
      }
    } else grouped.push({ ...row, weather: row.weather ? { ...row.weather } : null, layers: [...row.layers], actions: [...row.actions],
      temperatureRange: row.temperatureRange ? { ...row.temperatureRange } : null });
  });
  const warnings = unique([...(Array.isArray(input.warnings) ? input.warnings.filter(value => typeof value === 'string') : []),
    ...(moments.some(moment => moment.unknown) ? ['Lieu inconnu · météo locale non calculée.'] : []),
    ...(moments.some(moment => moment.stale) ? ['Données anciennes : confirme la météo avant le départ.'] : [])]);
  const notes = ['Conseils pour les passages à l’extérieur ; retire la maille dans les lieux chauffés.',
    'Niveaux additifs : chemise légère, puis veste légère, maille fine, maille chaude, manteau et accessoires grand froid. Les couches se retirent selon la timeline.'];
  if (advice.high - advice.low >= 10) notes.push('Amplitude de ressenti d’au moins 10 °C : privilégie des couches amovibles.');
  if (ignoredThermal) notes.push('Les variations de confort thermique de moins de 2 h sont lissées ; les dangers météo restent immédiats.');
  const danger = allHazards.some(hazard => ['freezing', 'snow', 'storm', 'wind'].includes(hazard));
  const adaptationCount = unique(actions.filter(action => action.time !== moments[0].start).map(action => action.time)).length;
  const indicatorLevel = danger ? 'warning' : adaptationCount > 1 ? 'multiple' : adaptationCount === 1 ? 'adapt' : 'stable';
  return { date: input.date, start: input.start, end: input.end, base: { level: baseLevel, layers: baseLayers }, carry, actions,
    indicator: { level: indicatorLevel, text: danger ? 'Protection météo nécessaire' : adaptationCount > 1 ? 'Plusieurs adaptations' : adaptationCount === 1 ? '1 adaptation nécessaire' : 'Tenue valable toute la journée', count: adaptationCount },
    notes, warnings, advice, timeline: grouped };
}
