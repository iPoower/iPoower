/* Plan de tenue déterministe. Entrée = instant explicite + snapshots déjà en mémoire.
   Aucun réseau, stockage, GPS, agenda distant ou score pneus dans ce moteur.
   Les heures sont celles du fuseau de référence de Race Control, comme les trajets. */
const OUTFIT_LAYERS = ['jacket', 'knit', 'outer', 'scarf'];
const outfitNumber = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const outfitTime = t => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t || '') && Number.isFinite(Date.parse(t + ':00Z')) && new Date(t + ':00Z').toISOString().slice(0, 16) === t;
const outfitShift = (t, min) => new Date(Date.parse(t + ':00Z') + min * 60000).toISOString().slice(0, 16);
const outfitSamePlace = (a, b) => !!(a && b && ((a.id && b.id && a.id === b.id) ||
  (outfitNumber(a.lat) != null && outfitNumber(a.lon) != null && outfitNumber(b.lat) != null && outfitNumber(b.lon) != null &&
   Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lon - b.lon) < 0.0001)));
const outfitPlaceName = p => p && (p.name || p.city || p.label || p.loc) || 'Lieu non précisé';
const outfitBits = mask => OUTFIT_LAYERS.filter((_, i) => mask & (1 << i));
const outfitCount = mask => outfitBits(mask).length;
const outfitEarlierCost = (a, b) => !b || a.some((x, i) => x !== b[i] && a.slice(0, i).every((v, j) => v === b[j]) && x < b[i]);

function outfitSource(place, sources) {
  // Correspondance exacte uniquement : aucune ville voisine ne remplace un lieu inconnu.
  return sources.filter(s => s.model && Array.isArray(s.model.hs) && outfitSamePlace(place, s.place))
    .sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0))[0] || null;
}
function outfitSample(source, t, input) {
  if (!source) return { sample: null, stale: false };
  const m = source.model;
  const offset = outfitNumber(source.utcOffset) != null && outfitNumber(input.utcOffset) != null ? (source.utcOffset - input.utcOffset) / 60 : 0;
  const local = outfitShift(t, offset), hour = local.slice(0, 13) + ':00';
  let sample = m.hs.find(x => x.t === hour) || null;
  const c = m.cur, age = c && outfitTime((c.time || '').slice(0, 16)) ? (Date.parse(outfitShift(input.now, offset) + ':00Z') - Date.parse(c.time.slice(0, 16) + ':00Z')) / 60000 : null;
  const fetchAge = outfitNumber(source.fetchedAt) == null ? Infinity : (input.nowMs - source.fetchedAt) / 60000;
  const stale = m.mode === 'cache' || (m.mode !== 'demo' && (fetchAge > 60 || fetchAge < -5 || (age != null && (age > 90 || age < -15))));
  // Ne jamais injecter une observation ancienne dans une heure future/passée différente.
  if (sample && c && !stale && age != null && age >= -15 && age <= 90 && local.slice(0, 13) === c.time.slice(0, 13) &&
      t.slice(0, 13) === input.now.slice(0, 13)) sample = { ...sample, ...c, t: hour, uv: sample.uv };
  return { sample, stale };
}
function outfitWeather(readings) {
  const samples = readings.map(r => r.sample).filter(Boolean), values = key => samples.map(x => outfitNumber(x[key])).filter(x => x != null);
  const max = key => { const v = values(key); return v.length ? Math.max(...v) : null; };
  const temperatures = values('T'), feels = samples.map(x => outfitNumber(x.Tapp) ?? outfitNumber(x.T)).filter(x => x != null);
  const snow = samples.some(x => (outfitNumber(x.snow) || 0) > 0 || [71, 73, 75, 77, 85, 86].includes(x.code));
  const freezing = samples.some(x => [56, 57, 66, 67].includes(x.code));
  const storm = samples.some(x => [95, 96, 99].includes(x.code));
  const pp = max('pp'), P = max('P'), wind = max('wind'), gust = max('gust');
  const wet = snow || freezing || storm || (P != null && P >= 0.1) || (pp != null && pp >= 50) || samples.some(x => [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(x.code));
  const missing = !readings.length || readings.some(r => !r.sample || (outfitNumber(r.sample.Tapp) ?? outfitNumber(r.sample.T)) == null);
  const partial = missing || samples.some(x => ['T', 'Tapp', 'pp', 'P', 'snow', 'wind', 'gust', 'code'].some(k => outfitNumber(x[k]) == null));
  return { samples, missing, partial, stale: readings.some(r => r.stale),
    Tlow: temperatures.length ? Math.min(...temperatures) : null, Thigh: temperatures.length ? Math.max(...temperatures) : null,
    low: feels.length ? Math.min(...feels) : null, high: feels.length ? Math.max(...feels) : null,
    pp, P, snowAmount: max('snow'), wind, gust, wet, snow, freezing, storm,
    precipKnown: !!samples.length && readings.every(r => r.sample && ['pp', 'P', 'snow', 'code'].every(k => outfitNumber(r.sample[k]) != null)),
    windKnown: !!samples.length && readings.every(r => r.sample && ['wind', 'gust'].every(k => outfitNumber(r.sample[k]) != null)),
    strongWind: (gust || 0) >= 50 || (wind || 0) >= 40,
    hazard: freezing ? 'freezing' : snow ? 'snow' : storm ? 'storm' : wet ? 'rain' : 'dry' };
}

function outfitSchedule(input, date) {
  const locations = input.locations || [], activities = [], trips = [];
  const placeOf = p => locations.find(l => outfitSamePlace(l, p)) || (p && (p.id || (outfitNumber(p.lat) != null && outfitNumber(p.lon) != null)) ? p : null);
  const events = input.calendar && Array.isArray(input.calendar.events) ? input.calendar.events : [];
  events.filter(e => e.mode !== 'pasdetrajet' && outfitTime(e.s)).forEach((e, i) => {
    const s = e.allDay ? e.s.slice(0, 10) + 'T09:00' : e.s;
    const end = e.allDay ? e.s.slice(0, 10) + 'T18:00' : outfitTime(e.e) && e.e > s ? e.e : outfitShift(s, 60);
    activities.push({ s, e: end, place: placeOf(e), label: e.t || 'Événement', kind: 'event', key: 'event-' + i, priority: 20,
      assumed: !!e.allDay || !outfitTime(e.e) || e.e <= s, locationMissing: !placeOf(e) });
  });
  (input.legs || []).forEach((leg, i) => {
    if (!outfitTime(leg.dep) || !outfitTime(leg.arr) || leg.arr <= leg.dep) return;
    trips.push({ ...leg, s: leg.dep, e: leg.arr, from: placeOf(leg.from), to: placeOf(leg.to), kind: 'trip', key: 'leg-' + i, priority: 30 });
  });
  // Le trajet habituel est connu dans les réglages ; ne pas déclencher tripData/ensureMids.
  const w = input.work, from = w && locations.find(l => l.id === w.from), to = w && locations.find(l => l.id === w.to);
  if (from && to && from.id !== to.id && w && Array.isArray(w.days) && /^\d{2}:\d{2}$/.test(w.dep || '') && /^\d{2}:\d{2}$/.test(w.ret || '')) {
    for (const day of [outfitShift(date + 'T12:00', -1440).slice(0, 10), date]) {
      if (!w.days.includes(new Date(day + 'T12:00:00Z').getUTCDay())) continue;
      const duration = Math.max(1, Math.min(720, outfitNumber(w.durMin) || 30));
      const go = day + 'T' + w.dep; let ret = day + 'T' + w.ret;
      if (!outfitTime(go) || !outfitTime(ret)) continue;
      const arrival = outfitShift(go, duration); if (ret < arrival) ret = outfitShift(ret, 1440);
      const points = [{ f: 0, place: from }, ...(input.workPoints || []).map(p => ({ f: p.f, place: p })), { f: 1, place: to }];
      trips.push({ s: go, e: arrival, from, to, points, kind: 'trip', label: 'Aller habituel', key: 'work-go-' + day, priority: 10 });
      trips.push({ s: ret, e: outfitShift(ret, duration), from: to, to: from, points: points.map(p => ({ ...p, f: 1 - p.f })).reverse(), kind: 'trip', label: 'Retour habituel', key: 'work-ret-' + day, priority: 10 });
      if (ret > arrival) activities.push({ s: arrival, e: ret, place: to, label: 'Lieu de travail · horaires habituels', kind: 'work', key: 'work-' + day, priority: 5 });
    }
  }
  return { activities, trips };
}

function outfitPeriods(input, date) {
  const { activities, trips } = outfitSchedule(input, date), all = [...activities, ...trips];
  const midnight = date + 'T00:00', nextMidnight = outfitShift(midnight, 1440);
  const relevant = all.filter(x => x.e > midnight && x.s < nextMidnight);
  const usualStart = input.dayOffset !== 1 && input.now < date + 'T08:00' ? input.now.slice(0, 13) + ':00' : date + 'T08:00';
  const start = relevant.reduce((s, x) => (x.s < midnight ? midnight : x.s) < s ? (x.s < midnight ? midnight : x.s) : s, usualStart);
  const usualEnd = date + 'T20:00', activityEnd = relevant.reduce((end, x) => x.e > end ? x.e : end, usualEnd);
  // Inclure le lieu d'arrivée après le dernier trajet du soir, jusqu'à minuit.
  const end = [nextMidnight, outfitShift(activityEnd > start ? activityEnd : start, activityEnd > usualEnd || start >= usualEnd ? 30 : 0)].sort()[0];
  const marks = new Set([start, end]);
  for (let t = outfitShift(start.slice(0, 13) + ':00', 60); t < end; t = outfitShift(t, 60)) marks.add(t);
  relevant.forEach(x => { if (x.s > start && x.s < end) marks.add(x.s); if (x.e > start && x.e < end) marks.add(x.e); });
  const times = [...marks].sort(), sources = input.sources || [], out = [];
  for (let i = 0; i < times.length - 1; i++) {
    const s = times[i], e = times[i + 1];
    const active = all.filter(x => x.s <= s && x.e > s).sort((a, b) => b.priority - a.priority || a.s.localeCompare(b.s) || a.key.localeCompare(b.key));
    const chosen = active[0];
    const completed = relevant.filter(x => x.e <= s).sort((a, b) => b.e.localeCompare(a.e) || b.priority - a.priority)[0];
    const place = chosen ? chosen.kind === 'trip' ? null : chosen.place : completed ? completed.kind === 'trip' ? completed.to : completed.place : input.selected;
    let readings;
    if (chosen && chosen.kind === 'trip') {
      const points = chosen.points && chosen.points.length ? chosen.points : [{ f: 0, place: chosen.from }, { f: 1, place: chosen.to }];
      const duration = (Date.parse(chosen.e + ':00Z') - Date.parse(chosen.s + ':00Z')) / 60000;
      // Conditions aux heures de passage déjà connues : protection dès le départ, même si la pluie est à l'arrivée.
      readings = points.map(p => outfitSample(outfitSource(p.place, sources), outfitShift(chosen.s, Math.round((p.f || 0) * duration)), input));
    } else readings = [outfitSample(outfitSource(place, sources), s, input)];
    out.push({ s, e, place, placeName: chosen && chosen.kind === 'trip' ? outfitPlaceName(chosen.from) + ' → ' + outfitPlaceName(chosen.to) : outfitPlaceName(place),
      kind: chosen ? chosen.kind : 'place', label: chosen ? chosen.label || 'Trajet prévu' : 'Au dernier lieu connu',
      key: chosen ? chosen.key : 'place', assumed: !!(chosen && chosen.assumed), conflict: active.filter(x => x.priority >= 20).length > 1,
      readings, weather: outfitWeather(readings) });
  }
  return { start, end, periods: out };
}

function outfitLayerPlan(periods, low, high) {
  const wet = periods.some(p => p.weather.wet), windy = periods.some(p => p.weather.strongWind);
  const outerWarmth = low <= 7 ? 3 : 1;
  const labels = { jacket: high > 25 ? 'Veste en lin, facultative' : high > 19 ? 'Veste non doublée' : 'Veste en laine légère',
    knit: low <= 0 ? 'Pull mérinos chaud' : 'Maille fine amovible',
    outer: wet || windy ? (low <= 7 ? 'Imperméable doublé avec capuche' : 'Trench ou imperméable léger avec capuche') : low <= 0 ? 'Manteau de laine épais' : 'Manteau de laine amovible',
    scarf: low <= 0 ? 'Écharpe, gants et bonnet' : 'Écharpe en laine' };
  const target = f => f <= 0 ? 6 : f <= 7 ? 4 : f <= 13 ? 2 : f <= 19 ? 1 : 0;
  const ceiling = f => f <= 2 ? 6 : f <= 9 ? 5 : f <= 15 ? 3 : f <= 22 ? 1 : 0;
  let states = new Map([['0|0', { mask: 0, used: 0, cost: [0, 0, 0, 0, 0], path: [], started: false }]]);
  for (const p of periods) {
    const w = p.weather, known = w.low != null, protectedNeeded = w.wet || w.strongWind;
    const next = new Map(), minutes = (Date.parse(p.e + ':00Z') - Date.parse(p.s + ':00Z')) / 60000;
    for (const prev of states.values()) for (let mask = 0; mask < 16; mask++) {
      if (!known && mask !== prev.mask) continue; // météo absente : aucun changement inventé
      if (known && ((protectedNeeded && !(mask & 4)) || (w.low <= 7 && !(mask & 8)) || (w.low > 7 && w.high > 13 && (mask & 8)))) continue;
      const heat = (mask & 1 ? 1 : 0) + (mask & 2 ? 2 : 0) + (mask & 4 ? outerWarmth : 0);
      const minimum = known ? target(w.low) : 0, maximum = known ? Math.max(ceiling(w.high), protectedNeeded ? 1 : 0) : 6;
      // Une protection ne se porte pas toute une journée douce et sèche pour économiser un geste au retour.
      if (known && !protectedNeeded && minimum <= 1 && (mask & 4)) continue;
      const discomfort = known ? Math.max(0, minimum - heat) * 2 + Math.max(0, heat - maximum) : 0;
      const used = prev.used | mask, changes = known && prev.started && mask !== prev.mask ? 1 : 0;
      // Ordre lexicographique : confort/protection, pièces supplémentaires distinctes,
      // puis adaptations, surplus thermique et présence de la veste sartoriale.
      // La veste appartient à la base ; maille, manteau/protection et accessoires se mutualisent.
      const cost = [prev.cost[0] + discomfort * minutes, outfitCount(used & 14), prev.cost[2] + changes,
        prev.cost[3] + (known ? Math.max(0, heat - minimum) * minutes : 0), prev.cost[4] + (known && w.high <= 22 && !(mask & 1) ? minutes : 0)];
      const candidate = { mask, used, cost, path: [...prev.path, known ? mask : null], started: prev.started || known }, key = mask + '|' + used;
      if (outfitEarlierCost(cost, next.get(key)?.cost)) next.set(key, candidate);
    }
    states = next;
  }
  let best = null; for (const state of states.values()) if (outfitEarlierCost(state.cost, best?.cost)) best = state;
  return { labels, path: best ? best.path : periods.map(() => null), used: best ? best.used : 0, compromise: !!(best && best.cost[0]) };
}

function outfitDayPlan(input) {
  if (!outfitTime(input.now) || outfitNumber(input.nowMs) == null) return null;
  const date = outfitShift(input.now, input.dayOffset === 1 ? 1440 : 0).slice(0, 10);
  const window = outfitPeriods(input, date), periods = window.periods;
  const samples = periods.flatMap(p => p.weather.samples), advice = sartorialAdvice(samples, input.occasion);
  const notes = [];
  if (!input.calendar) notes.push(input.calendarDone ? 'Aucun agenda disponible : les trajets habituels et le lieu sélectionné servent de repères.' : 'Agenda en cours de lecture : le plan sera complété avec les événements reçus.');
  else if (!(input.calendar.events || []).some(e => e.mode !== 'pasdetrajet' && outfitTime(e.s) && e.s.slice(0, 10) <= date && (e.e || e.s).slice(0, 10) >= date)) notes.push('Aucun événement reçu pour ce jour : plan fondé sur les trajets habituels et le lieu sélectionné.');
  notes.push('Entre les horaires connus, le dernier lieu est conservé. La météo décrit les passages dehors ; la présence en intérieur n’est pas déduite.');
  if (periods.some(p => !p.place && p.kind !== 'trip')) notes.push('Événement sans localisation : aucune météo d’un autre lieu ne lui est attribuée.');
  if (periods.some(p => p.assumed)) notes.push('Horaires supposés : journée entière 09:00–18:00, ou fin manquante après une heure.');
  if (periods.some(p => p.conflict)) notes.push('Des horaires connus se chevauchent : le lieu et le trajet concernés restent à confirmer.');
  const quality = { missing: periods.some(p => p.weather.missing), partial: periods.some(p => p.weather.partial), stale: periods.some(p => p.weather.stale),
    locationMissing: periods.some(p => !p.place && p.kind !== 'trip'), conflict: periods.some(p => p.conflict), agendaPending: !input.calendar && !input.calendarDone };
  if (quality.partial) notes.push('Données partielles : les valeurs absentes restent inconnues ; le ressenti peut être remplacé par la température de l’air.');
  if (quality.stale) notes.push('Données anciennes : vérifie la météo avant le départ ; les observations périmées ne remplacent pas les prévisions.');
  const layers = advice ? outfitLayerPlan(periods, advice.low, advice.high) : { labels: {}, path: periods.map(() => null), used: 0 };
  if (layers.compromise) notes.push('Amplitude ou conditions extrêmes : les couches offrent un compromis de confort, à confirmer sur place.');
  let lastMask = null, adaptations = 0;
  periods.forEach((p, i) => {
    const mask = layers.path[i], w = p.weather, previous = periods[i - 1];
    p.past = p.e <= input.now; p.current = p.s <= input.now && p.e > input.now;
    p.layerIds = mask == null ? [] : outfitBits(mask);
    p.layerText = mask == null ? 'Couches à confirmer · météo insuffisante' : ['Chemise', ...p.layerIds.map(id => layers.labels[id])].join(' + ');
    p.actions = [];
    if (mask != null) {
      if (lastMask == null) p.actions.push({ type: 'wear', text: 'Porter les couches indiquées au départ.' });
      else if (lastMask !== mask) {
        adaptations++;
        OUTFIT_LAYERS.forEach((id, k) => {
          if ((lastMask & (1 << k)) && !(mask & (1 << k))) p.actions.push({ type: 'remove', id, text: 'Enlever : ' + layers.labels[id] + ' ; garder avec toi.' });
          if (!(lastMask & (1 << k)) && (mask & (1 << k))) p.actions.push({ type: 'add', id, text: 'Ajouter : ' + layers.labels[id] + '.' });
        });
      }
      lastMask = mask;
    } else p.actions.push({ type: 'confirm', text: 'Météo à confirmer pour ce créneau ; aucune adaptation calculée.' });
    if (previous && previous.weather.precipKnown && w.precipKnown) {
      if (!previous.weather.wet && w.wet) p.transition = 'Pluie ou neige prévue à partir de ce créneau.';
      if (previous.weather.wet && !w.wet) p.transition = 'Pluie/neige non prévue sur ce créneau : la protection peut être retirée si le froid et le vent le permettent.';
    }
  });
  const firstMask = layers.path.find(mask => mask != null) || 0;
  const extras = OUTFIT_LAYERS.filter((id, i) => i > 0 && (layers.used & (1 << i))).map(id => {
    const bit = 1 << OUTFIT_LAYERS.indexOf(id), first = periods.find((p, i) => (layers.path[i] || 0) & bit);
    return { id, item: layers.labels[id], wornInitially: !!(firstMask & bit), firstUse: first ? first.s : null,
      detail: firstMask & bit ? 'Porté au départ, à garder avec toi après retrait.' : 'À emporter dès le départ pour ' + (first ? first.s.slice(11, 16) : 'la suite de la journée') + '.' };
  });
  if (advice && advice.uv >= 3) extras.push({ id: 'sun', item: 'Lunettes de soleil et protection solaire', detail: 'Pour les passages dehors aux heures ensoleillées.' });
  if (extras.some(x => !x.wornInitially)) {
    const p = periods.find(p => p.layerIds.length || p.weather.low != null);
    if (p) extras.filter(x => !x.wornInitially).forEach(x => p.actions.push({ type: 'bring', id: x.id, text: 'Emporter : ' + x.item + '.' }));
  }
  // Résumer les heures stables, en gardant les transitions météo, lieux, événements et grandes périodes.
  const timeline = [], phase = s => +s.slice(11, 13) < 12 ? 'morning' : +s.slice(11, 13) < 17 ? 'afternoon' : +s.slice(11, 13) < 20 ? 'evening' : 'night';
  periods.forEach(p => {
    const prev = timeline[timeline.length - 1], signature = q => [q.key, q.placeName, phase(q.s), q.layerIds.join(','), q.weather.hazard,
      q.weather.strongWind, q.weather.missing, q.weather.partial, q.weather.stale, q.weather.precipKnown, q.weather.windKnown].join('|');
    if (prev && signature(prev) === signature(p) && !p.actions.length && !p.transition) {
      prev.e = p.e; prev.readings.push(...p.readings); prev.weather = outfitWeather(prev.readings);
    } else timeline.push({ ...p, readings: [...p.readings] });
  });
  const title = advice && advice.title.split(' · ')[0] + ' · couches amovibles';
  const base = advice ? { ...advice, title, pieces: [
    { label: 'Veste · base amovible', item: layers.labels.jacket, detail: 'La même veste sur la journée ; la timeline indique quand la porter ou la retirer.' },
    { label: 'Chemise', item: advice.high > 25 ? 'Chemise légère en lin' : advice.high > 19 ? 'Chemise légère en coton ou lin' : 'Chemise en coton', detail: 'Une seule chemise, avec les couches amovibles prévues par-dessus.' },
    { label: 'Pantalon', item: advice.high > 25 ? 'Pantalon léger en lin ou fresco' : advice.high > 19 ? 'Pantalon en laine légère ou coton' : advice.high <= 7 ? 'Pantalon en flanelle de laine' : 'Pantalon en laine de mi-saison', detail: 'Une seule coupe et une matière adaptées au moment le plus doux.' },
    advice.pieces[3] ] } : null;
  const confirmed = !quality.partial && !quality.stale && !quality.locationMissing && !quality.conflict && !quality.agendaPending && !layers.compromise;
  return { date, now: input.now, start: window.start, end: window.end, base, extras, timeline, adaptations,
    status: adaptations === 0 ? 'Tenue valable toute la journée' : adaptations === 1 ? '1 adaptation nécessaire' : 'plusieurs adaptations',
    confirmed, quality, notes: [...(advice ? advice.notes : []), ...notes], labels: layers.labels,
    minimalPieces: outfitCount(layers.used & 14) };
}
