/* Onglet GPS (21/11/2026, décision du propriétaire) : le mode EN DIRECT a son onglet, toujours accessible, avec ou sans trajet.
 * - Trajet en cours ou dans les 3 h (même règle que l'ouverture du GPS, driveSoonTrip) : sa carte (destination, voiture,
 *   distance, départ) et un grand bouton « Démarrer » qui ouvre le cockpit EN DIRECT sur CE trajet.
 * - Sinon : directement le choix de la voiture (voiture du jour présélectionnée, rien d'écrit avant de démarrer), puis
 *   « Rouler sans destination » ou « Choisir une destination » (formulaire de l'onglet Trajet, départ maintenant).
 * L'onglet Trajet ne sert plus qu'à préparer : il n'ouvre plus le mode EN DIRECT. Aucune donnée nouvelle n'est stockée ici. */
/* Onglet Départ (27/11/2026, décision du propriétaire) : il roule avec CarPlay, qui affiche Plans ; Race Control ne peut pas
 * s'afficher sur CarPlay (app web). Par défaut, l'onglet ne guide donc plus : il donne le verdict du trajet et LANCE l'app de
 * guidage. Le mode EN DIRECT ci-dessus reste intact, derrière la préférence de l'appareil « EN DIRECT (sans CarPlay) ».
 * - Arrivée non confirmée : même action que la feuille de route (« Confirmer mon arrivée », clôture existante).
 * - Trajet en cours ou dans les 3 h (driveSoonTrip) : trajet, verdict (gpsVerdictLine), grand bouton « Lancer dans Plans ».
 *   Plans d'abord, puis Waze, puis Google Maps ; un lieu enregistré n'est jamais envoyé (mêmes liens que GuideLinks).
 * - Sinon : renvoi vers l'onglet Trajet pour préparer. Rien n'est écrit ici, aucune requête avant l'appui sur un lien. */
const GPS_LAUNCH = ['plans', 'waze', 'google'], GPS_APP = { plans: 'Plans', waze: 'Waze', google: 'Google Maps' };
function gpsLaunchHtml(t) {
  const links = GuideLinks.all(gpsGuideDest(t)), by = Object.fromEntries(links.map(a => [a.id, a]));
  const main = GPS_LAUNCH.map(id => by[id]).find(a => a && a.url);
  const link = (a, cls, text) => `<a class="${cls}" data-guide="${a.id}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${text}</a>`;
  const others = GPS_LAUNCH.map(id => by[id]).filter(a => a && a !== main).map(a => a.url ? link(a, 'btn', GPS_APP[a.id])
    : `<span class="gps-guide-off"><button type="button" class="btn" data-guide="${a.id}" disabled>${GPS_APP[a.id]}</button><small>${esc(a.why)}</small></span>`).join('');
  return `<div class="gps-launch" data-gps="launch"><p class="gps-verdict" data-gps="verdict">${esc(gpsVerdictLine(t))}</p>` +
    (main ? link(main, 'btn pri gps-go', '▶ Lancer dans ' + GPS_APP[main.id]) : '<button type="button" class="btn pri gps-go" disabled>▶ Lancer le guidage</button><p class="sub">Aucune app de guidage ne peut ouvrir cette destination : choisis-la directement dans Plans.</p>') +
    `<div class="gps-guide-apps">${others}</div>` +
    `<small class="sub">${main && main.id === 'plans' ? 'Plans s’affiche sur CarPlay dès que l’iPhone est branché. ' : ''}Race Control garde le verdict pneus, météo et gel ; l’app choisie guide. Rien n’est envoyé avant l’appui.</small></div>`;
}
function gpsArrivalHtml() {
  const x = typeof tripDayArrival === 'function' ? tripDayArrival() : null; if (!x) return '';
  const to = appTripPlace(x.t, 'to');
  return `<div class="gps-arrival" data-gps="arrival"><span class="trip-label">ARRIVÉE À CONFIRMER</span><b>${esc(to && to.name || x.t.to || 'Destination')}</b>` +
    `<button type="button" class="btn pri" data-act="fr-arrived" data-key="${esc(x.t.key)}">✓ Confirmer mon arrivée</button><small class="sub">L’heure de confirmation sera enregistrée.</small></div>`;
}
function gpsDepartHtml() {
  const t = typeof driveSoonTrip === 'function' ? driveSoonTrip() : null;
  const odo = typeof tripOdoHint === 'function' ? tripOdoHintHtml(tripOdoHint()) : '';   // relevé guidé après une arrivée du jour
  if (!t) return gpsArrivalHtml() + odo + '<div class="gps-trip" data-gps="none"><p>Aucun trajet en cours ni dans les 3 h.</p><button type="button" class="btn pri gps-go" data-act="view" data-v="trajet">Préparer un trajet</button></div>';
  const shared = tripSharedOrigin(), from = !shared.pending && shared.point || appTripPlace(t, 'from'), to = appTripPlace(t, 'to'), l = t.l || t.planL, active = t === APP_CONTEXT.snapshot.activeTrip;
  const car = S.cars.find(c => c.id === t.carId) || appActiveCar();
  const route = l && !l.originPending && Number.isFinite(l.km) ? `${f1(l.km)} km · ~${Math.round(l.min)} min` : offlineNow() ? 'route à recalculer au retour du réseau' : l && l.routeError ? 'itinéraire indisponible pour le moment' : 'route en préparation';
  return gpsArrivalHtml() + odo + `<div class="gps-trip" data-gps="trip"><div class="trip-summary-head"><span class="trip-label">${active ? 'TRAJET EN COURS' : 'PROCHAIN TRAJET'}</span><b class="mono">${esc(tripWhen(t.dep) || '—')}</b></div>
    <div class="trip-summary-route"><b>${esc(from && from.name || 'Origine à confirmer')} → ${esc(to && to.name || 'Destination à confirmer')}</b>${to && (to.address || to.sub) ? `<span>${esc(to.address || to.sub)}</span>` : ''}</div>
    <div class="trip-summary-meta"><span>🚗 ${esc(car ? car.short || car.name : 'voiture à choisir')}</span><span>${esc(route)}</span><span>Départ ${esc(tripWhen(t.dep) || '—')}</span></div>
    ${gpsLaunchHtml(t)}
    <button type="button" class="btn sm" data-act="view" data-v="trajet">Modifier dans Trajet</button></div>`;
}
function gpsTripCardHtml(t) {
  // Origine : la même que la carte du trajet de l'onglet Trajet (origine partagée confirmée), sinon celle du trajet.
  const shared = tripSharedOrigin(), from = !shared.pending && shared.point || appTripPlace(t, 'from'), to = appTripPlace(t, 'to'), l = t.l || t.planL, active = t === APP_CONTEXT.snapshot.activeTrip;
  const car = S.cars.find(c => c.id === t.carId) || appActiveCar();
  const route = l && !l.originPending && Number.isFinite(l.km) ? `${f1(l.km)} km · ~${Math.round(l.min)} min` : offlineNow() ? 'route à recalculer au retour du réseau' : l && l.routeError ? 'itinéraire indisponible pour le moment' : 'route en préparation';
  return `<div class="gps-trip" data-gps="trip"><div class="trip-summary-head"><span class="trip-label">${active ? 'TRAJET EN COURS' : 'PROCHAIN TRAJET'}</span><b class="mono">${esc(tripWhen(t.dep) || '—')}</b></div>
    <div class="trip-summary-route"><b>${esc(from && from.name || 'Origine à confirmer')} → ${esc(to && to.name || 'Destination à confirmer')}</b>${to && (to.address || to.sub) ? `<span>${esc(to.address || to.sub)}</span>` : ''}</div>
    <div class="trip-summary-meta"><span>🚗 ${esc(car ? car.short || car.name : 'voiture à choisir')}</span><span>${esc(route)}</span><span>Départ ${esc(tripWhen(t.dep) || '—')}</span></div>
    <button type="button" class="btn pri gps-go" data-act="drive-open">Démarrer</button>
    ${gpsGuideHtml(t)}
    <button type="button" class="btn sm" data-act="view" data-v="trajet">Modifier dans Trajet</button></div>`;
}
// « Guider avec… » : destination du trajet pour un guidage dans Waze, Plans ou Google Maps (GuideLinks). Une destination à
// ≤ 1,5 km d'un lieu enregistré est privée : domicile et travail passent par les favoris Waze, jamais par une adresse.
function gpsGuideDest(t) { return guidePlaceDest(appTripPlace(t, 'to')); }
// Même règle pour tout lien de guidage, y compris l'ancien bouton « Ouvrir dans Waze » de l'onglet Trajet (recette R4-01e, 27/11).
function guidePlaceDest(to) {
  if (!to || !locHasCoords(to)) return null;
  const home = S.locs[0], saved = [...(S.locs || []), ...(S.customs || [])].filter(locHasCoords);
  const near = saved.filter(l => to.id && l.id === to.id || distKm(l, to) <= 1.5).sort((a, b) => distKm(a, to) - distKm(b, to))[0];
  const privacy = !near ? null : home && near.id === home.id ? 'home' : near.id === S.work.to ? 'work' : 'private';
  return { address: typeof to.address === 'string' ? to.address : null, lat: +to.lat, lon: +to.lon, privacy };
}
// Rappel du verdict du trajet (même synthèse que l'onglet Trajet : risque global, indice pneus, règle gel d'engine.js).
function gpsVerdictLine(t) {
  const tr = tripRisk(t), tf = tripFrost(t), tyre = Number.isInteger(t.worst) && LV[t.worst] ? LV[t.worst].name : null;
  if (!tr && !tf) return 'Verdict du trajet en cours de calcul : consulte l’onglet Trajet avant de partir.';
  return 'Verdict du trajet : ' + [tr ? riskName(tr) : null, tyre ? 'pneus ' + tyre : null, tf ? frostWords(tf.fr).label : 'gel indéterminé'].filter(Boolean).join(' · ');
}
function gpsGuideHtml(t) {
  const d = gpsGuideDest(t), label = { waze: 'Guider avec Waze', plans: 'avec Plans', google: 'avec Google Maps' };
  const apps = GuideLinks.all(d).map(a => a.url
    ? `<a class="btn" data-guide="${a.id}" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${label[a.id]}</a>`
    : `<span class="gps-guide-off"><button type="button" class="btn" data-guide="${a.id}" disabled>${label[a.id]}</button><small>${esc(a.why)}</small></span>`).join('');
  return `<div class="gps-guide" data-gps="guide"><p class="gps-verdict" data-gps="verdict">${esc(gpsVerdictLine(t))}</p><div class="gps-guide-apps">${apps}</div>
    <small class="sub">Race Control garde le verdict pneus, météo et gel ; l’app choisie guide. Rien n’est envoyé avant l’appui.</small></div>`;
}
function gpsSetupHtml() {
  const s = DRIVE.setup || (DRIVE.setup = { carId: appDay().activeCarId || (S.cars[0] && S.cars[0].id) || null });
  if (!S.cars.length) return '<p class="sub">Aucune voiture enregistrée : ajoute-la dans le Garage.</p><button type="button" class="btn" data-act="view" data-v="garage">Ouvrir le Garage</button>';
  return '<h3 id="gpsCarH">Quelle voiture conduis-tu ?</h3><div class="dv-cars" role="group" aria-labelledby="gpsCarH">' +
    S.cars.map(c => '<button type="button" data-act="drive-car" data-id="' + esc(c.id) + '" aria-pressed="' + (c.id === s.carId) + '"><b>' + esc(c.short || c.name) + '</b><small>' + esc(DRIVE_TYRE[c.tire && c.tire.type] || 'pneus non renseignés') + '</small></button>').join('') +
    '</div><div class="dv-setup-go"><button type="button" class="btn pri gps-go" data-act="drive-free"' + (s.carId ? '' : ' disabled') + '>Rouler sans destination</button>' +
    '<button type="button" class="btn" data-act="drive-dest"' + (s.carId ? '' : ' disabled') + '>Choisir une destination</button></div>' +
    '<p class="sub">La voiture choisie devient ta voiture du jour (verdicts, pneus). Aucun trajet n’est créé tant que tu n’as pas choisi.</p>';
}
function renderGps() {
  const el = $('#secGps'); if (!el) return;
  if (UI.view !== 'gps') { el.hidden = true; return; }
  const live = typeof driveLivePref === 'function' && driveLivePref();
  let html;
  if (!live) html = `<div class="mod-h"><h2>Départ</h2><span class="src obs">verdict, puis guidage par Plans</span></div>` + gpsDepartHtml() +
    '<p class="dv-foot">Voiture sans CarPlay : active le mode EN DIRECT dans Réglages, section « Mode EN DIRECT ».</p>';
  else {
    const t = typeof driveSoonTrip === 'function' ? driveSoonTrip() : null;
    html = `<div class="mod-h"><h2>GPS · EN DIRECT</h2><span class="src obs">${t ? 'trajet en cours ou dans les 3 h' : 'aucun trajet dans les 3 h'}</span></div>` +
      (t ? gpsTripCardHtml(t) : gpsSetupHtml()) + '<p class="dv-foot">Itinéraire indicatif, la signalisation prime. Rien à toucher en roulant : pose le téléphone sur un support.</p>';
  }
  el.hidden = false;
  const label = live ? 'GPS : conduite en direct' : 'Départ : verdict du trajet et lancement du guidage';
  if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
  if (el.innerHTML !== html) el.innerHTML = html;
}
