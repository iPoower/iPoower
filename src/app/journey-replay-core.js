/* Journey Replay : projection pure du journal de débrief.
 * Le parcours est un symbole sans échelle, PAS une trace GPS.
 * Aucun accès à APP_CONTEXT actuel, météo réseau, DOM ou stockage.
 */
'use strict';
const JourneyReplay = (() => {
  const conditionOrder = Debrief.CONDITIONS;
  const valid = xs => conditionOrder.filter(k => Array.isArray(xs) && xs.includes(k));
  const label = k => Debrief.LABELS[k] || 'Information non disponible';
  const str = v => typeof v === 'string' ? v.slice(0, 180) : '';
  const timestamp = t => Number.isFinite(t) && t > 0 ? t : null;
  const empty = reason => ({ available: false, reason, frames: [], missing: [reason], status: 'INDISPONIBLE' });
  // La projection choisit la photographie prise au départ, jamais la météo
  // du jour ou la voiture active aujourd'hui pour reconstituer hier.
  function project(entry, cars = []) {
    if (!entry || typeof entry !== 'object') return empty('Trajet terminé absent du journal');
    if (entry.cancelledAt) return empty('Arrivée annulée · historique conservé');
    if (!timestamp(entry.at) || !['auto', 'confirmé'].includes(entry.how)) return empty('Arrivée non confirmée dans le journal');
    const start = entry.start && typeof entry.start === 'object' ? entry.start : null;
    const forecast = start && start.prediction && start.prediction.known === true ? start.prediction : null;
    const feedback = entry.feedback && Array.isArray(entry.feedback.conditions) ? entry.feedback : null;
    const comparison = Debrief.compare(entry);
    const carId = start ? str(start.carId) : '';
    const saved = carId && Array.isArray(cars) ? cars.find(c => c && c.id === carId) : null;
    const car = start && (str(start.car) || (saved && (str(saved.short) || str(saved.name)))) || null;
    const silhouette = car ? Garage.silhouette(saved || { name: car }) : null;
    const before = forecast ? valid(forecast.conditions) : null;
    const after = feedback ? valid(feedback.conditions) : null;
    const missing = [];
    if (!start) missing.push('Départ non archivé');
    if (!car) missing.push('Véhicule utilisé non enregistré');
    if (!forecast) missing.push('Prévision de départ absente ou incomplète');
    if (!feedback) missing.push('Retour conducteur non renseigné');
    if (comparison.kind === 'unknown') missing.push('Comparaison impossible : prévision absente, trop ancienne ou sans horodatage valable');
    const from = str(start && start.from) || str(entry.from) || null;
    const to = str(start && start.to) || str(entry.to) || null;
    if (!from || !to) missing.push('Trajet déclaré incomplet');
    const frame = (kind, list) => ({
      kind, source: kind === 'before' ? 'PRÉVISION ENREGISTRÉE AU DÉPART' : 'DÉCLARATION DU CONDUCTEUR',
      conditions: list, labels: list === null ? [] : list.map(label),
      known: list !== null, wet: list !== null && (list.includes('wet') || list.includes('rain')),
      rain: list !== null && list.includes('rain'), fog: list !== null && list.includes('fog'),
      snow: list !== null && list.includes('snow'), ice: list !== null && list.includes('ice')
    });
    return {
      available: true, key: str(entry.key), name: str(entry.name) || 'Trajet terminé',
      from, to, departure: timestamp(start && start.at), arrival: entry.at, car, carId: carId || null, silhouette,
      frames: [frame('before', before), frame('after', after)], comparison: comparison.kind,
      missed: comparison.missed.map(label), unused: comparison.unused.map(label),
      comparable: ['match', 'missed', 'unused', 'mixed'].includes(comparison.kind),
      offlineAtDeparture: !!(forecast && forecast.offline), missing,
      status: comparison.kind === 'pending' ? 'RETOUR NON RENSEIGNÉ' :
        comparison.kind === 'unknown' ? 'NON COMPARABLE' : 'COMPARAISON DOCUMENTÉE',
      // Aucun lever/coucher historique n'est stocké dans le journal.
      // L'heure seule n'est pas une preuve suffisante de luminosité.
      phase: 'unknown', routeScale: 'illustrative', telemetry: null
    };
  }
  return { project };
})();