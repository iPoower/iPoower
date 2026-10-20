/* MISSION CONTROL : projection en lecture seule des mêmes valeurs que Twin Garage.
 * Aucun moteur, cache, minuteur, stockage ni nouvel appel réseau.
 */
const MissionControl = (() => {
  const str = v => typeof v === 'string' && v.trim() ? v.trim() : null;
  const datetime = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v || '') ? v.slice(0,16) : null;
  function point(scene, index) {
    const s = scene && Array.isArray(scene.samples) && scene.samples.find(x => x && x.index === index);
    if (!s) return null;
    return { temperature: Number.isFinite(s.temperature) ? s.temperature : null,
      rain: !!s.rain, snow: !!s.snow, fog: !!s.fog,
      fresh: str(s.fresh) || 'UNKNOWN', received: Number.isFinite(s.received) ? s.received : null,
      cache: !!s.cache };
  }
  function project({ car = null, trip = null, scene = null, comparison = null, offline = false,
    navigationAvailable = false, agendaUnavailable = false } = {}) {
    const usable = !!trip && !trip.destinationPending && !(trip.l && trip.l.originPending);
    const tyre = car && car.tyre || null;
    const notices = car && Array.isArray(car.notices) ? car.notices.filter(n => n && str(n.text)) : [];
    const ordered = notices.slice().sort((a,b) => (Number.isInteger(b.level) ? b.level : -1) - (Number.isInteger(a.level) ? a.level : -1));
    let vigilance = null, vigilanceSource = null;
    if (usable && scene && scene.complete && !scene.demo && comparison && comparison.level != null && comparison.reasons && comparison.reasons.length) {
      vigilance = str(comparison.reasons[0]); vigilanceSource = 'Moteur du trajet · prévisions et monte documentées';
    } else if (ordered.length) {
      vigilance = str(ordered[0].text); vigilanceSource = 'Suivi pneumatique existant · donnée déclarée';
    }
    const count = scene && Number.isInteger(scene.count) ? scene.count : 0;
    // La prévisualisation compacte écarte les points sans météo : sans alignement
    // exact avec la séquence source, son dernier point ne prouve PAS l'arrivée.
    const endpointsAligned = usable && Array.isArray(trip.seq) && count > 0 && count === trip.seq.length;
    return {
      vehicle: car ? str(car.name) || str(car.short) : null,
      carId: car && car.id || null,
      tyre: tyre ? { type: str(tyre.type), model: str(tyre.model), size: str(tyre.size),
        tread: tyre.tread && Number.isFinite(tyre.tread.mm) ? { mm: tyre.tread.mm,
          estimated: !!tyre.tread.estimated, date: str(tyre.tread.date) } : null,
        pressureChecked: tyre.pressure && str(tyre.pressure.checked) || null } : null,
      trip: usable ? { from: str(trip.from), to: str(trip.to),
        departure: datetime(scene && scene.departure) || datetime(trip.dep) } : null,
      tripPending: !!trip && !usable,
      weather: { status: usable && scene ? str(scene.status) || 'INDISPONIBLE' : 'INDISPONIBLE',
        complete: !!usable && !!scene && !!scene.complete, demo: !!scene && !!scene.demo,
        departure: endpointsAligned ? point(scene,1) : null,
        arrival: endpointsAligned && count >= 2 ? point(scene,count) : null },
      vigilance, vigilanceSource, offline: !!offline,
      navigationAvailable: usable && !!navigationAvailable,
      agendaUnavailable: usable && !!agendaUnavailable && trip.src === 'cal'
    };
  }
  return Object.freeze({ project });
})();

const MISSION_STYLE = '<style>' +
  '#secGarage .mission-control{padding:13px;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);display:grid;gap:11px;min-width:0}' +
  '#secGarage .mission-control h3{font:700 19px var(--f-disp);letter-spacing:.06em;margin:0}' +
  '#secGarage .mission-control .mission-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:7px}' +
  '#secGarage .mission-control .mission-car{font:600 clamp(17px,5vw,22px) var(--f-disp);overflow-wrap:anywhere}' +
  '#secGarage .mission-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:9px;align-items:center}' +
  '#secGarage .mission-route>div{min-width:0;display:grid;gap:4px}' +
  '#secGarage .mission-route>div:last-child{text-align:right}' +
  '#secGarage .mission-route small,#secGarage .mission-grid small{font:11px var(--f-mono);letter-spacing:.04em;color:var(--fg2)}' +
  '#secGarage .mission-route b{overflow-wrap:anywhere;font:600 16px var(--f-disp)}' +
  '#secGarage .mission-route>span{color:var(--accent)}' +
  '#secGarage .mission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
  '#secGarage .mission-grid>div{min-width:0;display:grid;align-content:start;gap:4px;padding:9px;border:1px solid var(--line);background:var(--panel);border-radius:4px}' +
  '#secGarage .mission-grid b{font:600 14px var(--f-disp);overflow-wrap:anywhere}' +
  '#secGarage .mission-grid span{color:var(--fg2);font-size:11px;overflow-wrap:anywhere}' +
  '#secGarage .mission-watch{margin:0;padding:9px;border-left:3px solid var(--accent);background:var(--panel);font-size:12px;line-height:1.5;overflow-wrap:anywhere}' +
  '#secGarage .mission-watch b{display:block;margin-bottom:3px}' +
  '#secGarage .mission-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
  '#secGarage .mission-actions .btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center}' +
  '#secGarage .mission-foot{margin:0;font-size:11px;line-height:1.6;color:var(--fg2)}' +
  '#secGarage .mission-control details.ux-fold{min-width:0}' +
  '@media(max-width:374px){#secGarage .mission-route{gap:5px}#secGarage .mission-route b{font-size:13px}#secGarage .mission-grid{grid-template-columns:minmax(0,1fr)}}' +
  '</style>';

function missionPointHtml(p) {
  if (!p) return '<b>Données indisponibles</b><span>Pas de prévision au point de passage.</span>';
  const phenomena = [p.rain && 'pluie prévue', p.snow && 'neige prévue', p.fog && 'brouillard prévu'].filter(Boolean);
  const state = ({ FRESH:'réception récente', AGING:'fraîcheur à confirmer', STALE:'donnée ancienne', UNKNOWN:'âge inconnu' })[p.fresh] || 'âge inconnu';
  return '<b>' + (p.temperature == null ? 'Température indisponible' : esc(f1(p.temperature)) + ' °C · air prévu') + '</b>' +
    '<span>' + esc(phenomena.join(' · ') || 'Aucun phénomène signalé par ces valeurs') + '</span>' +
    '<span>' + esc(state + (p.cache ? ' · cache' : '')) + '</span>';
}

function missionControlHtml(m, navigationHtml = '') {
  const date = m.trip && m.trip.departure, title = m.trip ? 'PROCHAIN TRAJET CONNU' : m.tripPending ? 'TRAJET À CONFIRMER' : 'AUCUN TRAJET';
  const desc = m.trip ? '<div class="mission-route"><div><small>DÉPART</small><b data-mission-from>' + esc(m.trip.from || 'Origine à confirmer') +
    '</b></div><span aria-hidden="true">→</span><div><small>DESTINATION</small><b data-mission-to>' + esc(m.trip.to || 'Destination à confirmer') +
    '</b></div></div><p class="mission-foot">Départ ' + (date ? '<time datetime="' + esc(date) + '">' + esc(date.slice(8,10) + '/' + date.slice(5,7) + ' · ' + date.slice(11,16)) + '</time>' : 'horaire non communiqué') + '</p>' :
    '<p class="garage-empty" role="status">' + (m.tripPending ? 'Origine ou destination non confirmée : trajet, météo et navigation non conclus.' :
      'Aucun prochain trajet connu. Choisis une destination dans Race Control ; aucune route n’est créée par ce briefing.') + '</p>';
  const t = m.tyre, tyre = t ? [t.type, t.model, t.size].filter(Boolean).join(' · ') || 'Monte déclarée sans modèle' : 'Monte non confirmée';
  const wear = t && t.tread ? f1(t.tread.mm) + ' mm · ' + (t.tread.estimated ? 'estimation saisie' : 'mesure déclarée') +
    (t.tread.date ? ' · ' + t.tread.date.slice(8,10) + '/' + t.tread.date.slice(5,7) : ' · date non renseignée') : 'Profondeur non renseignée';
  const detail = '<p class="sub">Voiture et pneus : mêmes données déclarées que les fiches Garage et Pneus. Trajet : même prochain trajet que le contexte global. Météo : mêmes points et réceptions que Twin Garage, jamais une observation de la route.</p>' +
    '<p class="sub">Couverture météo : ' + esc(m.weather.complete ? 'complète selon le moteur existant' : 'incomplète ou non démontrée') +
    ' · ' + esc(m.weather.status) + (m.offline ? ' · hors ligne' : '') + (m.weather.demo ? ' · simulation uniquement' : '') + '.</p>' +
    '<p class="sub">Profondeur : ' + esc(wear) + '. ' + (t && t.pressureChecked ? 'Dernier contrôle de pression déclaré le ' + esc(t.pressureChecked) + '.' : 'Aucun contrôle de pression daté.') +
    ' Les prévisions et règles existantes ne garantissent jamais la sécurité du trajet.</p>';
  return MISSION_STYLE + '<article id="missionControl" class="mission-control" aria-label="Mission Control · briefing avant départ">' +
    '<div class="mission-head"><h3>🏁 NEXT MISSION</h3><span class="src est">' + esc(title) + '</span></div>' +
    '<div class="mission-car" data-mission-car>' + esc(m.vehicle || 'Voiture active non choisie') + '</div>' + desc +
    '<div class="mission-grid"><div><small>MÉTÉO AU DÉPART · PRÉVISION</small>' + missionPointHtml(m.weather.departure) + '</div>' +
    '<div><small>MÉTÉO À L’ARRIVÉE · PRÉVISION</small>' + missionPointHtml(m.weather.arrival) + '</div>' +
    '<div><small>PNEUS RÉELLEMENT DÉCLARÉS</small><b data-mission-tyres>' + esc(tyre) + '</b><span>' + esc(wear) + '</span></div>' +
    '<div><small>SOURCE ET FRAÎCHEUR</small><b>' + esc(m.weather.status) + (m.offline ? ' · HORS LIGNE' : '') + '</b>' +
    '<span>' + esc(m.weather.demo ? 'Mode démonstration · pas de météo réelle' : m.weather.complete ? 'Paramètres du trajet couverts' : 'Données incomplètes ou non datées') + '</span></div></div>' +
    '<p class="mission-watch" role="status"><b>⚠️ VIGILANCE PRINCIPALE</b>' +
      esc(m.vigilance || 'Aucune vigilance étayée disponible avec les données actuelles.') +
      '<span class="sub">' + esc(m.vigilanceSource || 'Diagnostic non conclu') + '</span></p>' +
    (m.agendaUnavailable ? '<p class="garage-empty">Agenda indisponible : vérifier le prochain départ avant de partir.</p>' : '') +
    '<div class="mission-actions"><button type="button" class="btn pri sm" data-act="view" data-v="trajet">Voir le trajet</button>' +
      (m.navigationAvailable ? navigationHtml : '') + '</div>' +
    uxFold('mission-sources', 'Sources et limites', detail, 'Fraîcheur · pneus · fiabilité') +
    '<p class="mission-foot">Synthèse informative, sans télémétrie ni garantie de sécurité. Vérifie les conditions réelles avant le départ.</p></article>';
}
