/* Conseils de tenue : heuristique de confort, indépendante des scores pneus et du relais.
   Les pièces sont des suggestions, pas un inventaire de la garde-robe. */
function wardrobeWindow(model, dayOffset, localNow) {
  if (!model || !Array.isArray(model.hs) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localNow || '')) return null;
  const next = new Date(localNow.slice(0, 10) + 'T12:00:00Z');
  next.setUTCDate(next.getUTCDate() + (dayOffset === 1 ? 1 : 0));
  const date = next.toISOString().slice(0, 10), first = dayOffset === 1 ? 8 : +localNow.slice(11, 13);
  const last = Math.max(first, 20);
  const samples = model.hs.filter(x => x.date === date && x.hh >= first && x.hh <= last).map(x => ({ ...x }));
  // La valeur actuelle complète l'heure courante seulement si elle est encore récente.
  const c = model.cur;
  const age = c && c.time ? (Date.parse(localNow.slice(0, 16) + ':00Z') - Date.parse(c.time.slice(0, 16) + ':00Z')) / 60000 : Infinity;
  if (dayOffset !== 1 && c && age >= -15 && age <= 90 && c.time.slice(0, 10) === date) {
    const i = samples.findIndex(x => x.hh === +c.time.slice(11, 13));
    if (i >= 0) samples[i] = { ...samples[i], ...c, uv: samples[i].uv };
  }
  return { date, samples, start: samples[0] ? samples[0].t.slice(11, 16) : null,
    end: samples.length ? samples[samples.length - 1].t.slice(11, 16) : null,
    incomplete: samples.length < last - first + 1 };
}

function sartorialAdvice(samples, occasion) {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const vals = k => samples.map(x => x[k]).filter(finite);
  const max = k => { const v = vals(k); return v.length ? Math.max(...v) : null; };
  const feels = samples.map(x => finite(x.Tapp) ? x.Tapp : x.T).filter(finite);
  if (!feels.length) return null;
  const low = Math.min(...feels), high = Math.max(...feels), gust = max('gust'), wind = max('wind'), pp = max('pp'), rain = max('P'), uv = max('uv');
  const snowy = samples.some(x => (finite(x.snow) && x.snow > 0) || [71, 73, 75, 77, 85, 86].includes(x.code));
  const freezingRain = samples.some(x => [56, 57, 66, 67].includes(x.code));
  const storm = samples.some(x => [95, 96, 99].includes(x.code));
  const wet = snowy || freezingRain || storm || (pp != null && pp >= 50) || (rain != null && rain >= 0.1) ||
    samples.some(x => [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(x.code) || (finite(x.Pb) && x.Pb >= 0.2));   // même signal que « pluie possible » de l'onglet Météo
  const breezy = (gust != null && gust >= 35) || (wind != null && wind >= 25);
  const strongWind = (gust != null && gust >= 50) || (wind != null && wind >= 40);
  const walk = occasion === 'walk', formal = occasion === 'office';
  let title, outer, upper, trousers, outerNote, upperNote;
  if (low <= 0) {
    title = 'Grand froid · couches chaudes'; outer = 'Manteau de laine épais'; upper = 'Chemise + pull mérinos'; trousers = 'Pantalon en flanelle de laine';
    outerNote = 'Coupe assez ample pour garder la maille dessous.'; upperNote = 'Sous-couche fine supplémentaire si tu restes dehors.';
  } else if (low <= 7) {
    title = 'Froid · manteau et maille'; outer = 'Manteau de laine'; upper = 'Chemise + maille chaude'; trousers = 'Pantalon en flanelle';
    outerNote = 'Un manteau par-dessus la veste pour les passages dehors.'; upperNote = 'Mérinos ou laine, avec un col confortable.';
  } else if (low <= 13) {
    title = 'Fraîcheur · veste et maille fine'; outer = 'Veste en tweed ou flanelle'; upper = 'Chemise Oxford + pull fin'; trousers = 'Pantalon en laine de mi-saison';
    outerNote = 'Manteau léger en plus pour une longue sortie.'; upperNote = 'Maille amovible pour les endroits chauffés.';
  } else if (low <= 19) {
    title = 'Mi-saison · veste légère'; outer = 'Veste en laine légère'; upper = 'Chemise en coton'; trousers = 'Pantalon en laine légère ou coton';
    outerNote = 'Construction souple, confortable pour la journée.'; upperNote = 'Une maille fine à emporter si tu es frileux.';
  } else if (low <= 25) {
    title = 'Douceur · matières respirantes'; outer = 'Veste non doublée'; upper = 'Chemise légère en coton ou lin'; trousers = 'Pantalon en laine fresco ou lin';
    outerNote = 'La veste peut se retirer dès que tu as chaud.'; upperNote = 'Tissage aéré et coupe qui laisse circuler l’air.';
  } else {
    title = 'Chaleur · tenue allégée'; outer = 'Veste en lin, facultative'; upper = 'Chemise légère en lin'; trousers = 'Pantalon léger en lin ou fresco';
    outerNote = 'À garder surtout pour le rendez-vous ou le bureau.'; upperNote = 'Tons clairs et couches limitées.';
  }
  const notes = [], accessories = [];
  if (wet) {
    outer = low <= 7 ? 'Imperméable doublé sur la tenue' : 'Trench ou imperméable léger';
    outerNote = 'Une couche réellement résistante à la pluie ; la laine seule ne suffit pas.';
    notes.push('Pluie ou neige possible : couvre la veste et privilégie des chaussures adaptées à l’humidité.');
    accessories.push(strongWind || storm ? 'Protection de pluie avec capuche' : 'Parapluie à emporter');
  }
  if (breezy) {
    outerNote += ' Prévois une couche extérieure qui coupe le vent.';
    notes.push(strongWind ? 'Rafales fortes : préfère la capuche au parapluie.' : 'Vent sensible : une veste fermée ou un trench aide pendant les passages dehors.');
  }
  if (low <= 7) accessories.push(low <= 0 ? 'Écharpe, gants et bonnet' : 'Écharpe en laine');
  if (uv != null && uv >= 3) accessories.push('Lunettes de soleil et protection solaire');
  if (storm) notes.push('Orage prévu : vérifie la vigilance avant une longue promenade.');
  if (freezingRain || snowy) notes.push('Sol potentiellement glissant : privilégie une semelle crantée.');
  if (high - low >= 7) notes.push('La température varie nettement : choisis une maille ou une veste facile à retirer.');
  if (walk) notes.push('Pour marcher longtemps, garde des couches amovibles et des chaussures déjà confortables.');
  const shoes = snowy || freezingRain ? 'Bottines résistantes à l’eau, semelle crantée' : wet ? 'Derbies ou bottines, semelle gomme' : walk ? 'Derbies souples, semelle gomme' : low > 19 ? 'Mocassins ou derbies légers' : 'Derbies ou richelieus en cuir';
  if (formal) accessories.push(low > 25 ? 'Cravate légère, selon le rendez-vous' : 'Cravate sobre, selon le rendez-vous');
  if (!accessories.length) accessories.push('Ceinture accordée aux chaussures');
  return { title, low, high, gust, wind, pp, rain, uv, wet, strongWind, snowy,
    tempFallback: samples.some(x => !finite(x.Tapp)),
    partial: samples.some(x => !finite(x.Tapp) || !finite(x.pp) || !finite(x.P) || !finite(x.gust)),
    pieces: [
      { label: 'Veste · protection', item: outer, detail: outerNote },
      { label: 'Chemise · maille', item: upper, detail: upperNote },
      { label: 'Pantalon', item: trousers, detail: 'Coupe nette, avec assez d’aisance pour bouger.' },
      { label: 'Chaussures', item: shoes, detail: wet ? 'Évite le daim fragile et les semelles lisses sous la pluie.' : 'Choisis une paire confortable pour le temps passé debout.' }
    ], accessories, notes, palette: low > 19 ? ['Marine', 'Écru', 'Sable', 'Marron'] : ['Marine', 'Écru', 'Gris', 'Marron'] };
}
