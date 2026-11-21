/* Onglet GPS (21/11/2026, décision du propriétaire) : le mode EN DIRECT a son onglet, toujours accessible, avec ou sans trajet.
 * - Trajet en cours ou dans les 3 h (même règle que l'ouverture du GPS, driveSoonTrip) : sa carte (destination, voiture,
 *   distance, départ) et un grand bouton « Démarrer » qui ouvre le cockpit EN DIRECT sur CE trajet.
 * - Sinon : directement le choix de la voiture (voiture du jour présélectionnée, rien d'écrit avant de démarrer), puis
 *   « Rouler sans destination » ou « Choisir une destination » (formulaire de l'onglet Trajet, départ maintenant).
 * L'onglet Trajet ne sert plus qu'à préparer : il n'ouvre plus le mode EN DIRECT. Aucune donnée nouvelle n'est stockée ici. */
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
function gpsGuideDest(t) {
  const to = appTripPlace(t, 'to'); if (!to || !locHasCoords(to)) return null;
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
  const t = typeof driveSoonTrip === 'function' ? driveSoonTrip() : null;
  const html = `<div class="mod-h"><h2>GPS · EN DIRECT</h2><span class="src obs">${t ? 'trajet en cours ou dans les 3 h' : 'aucun trajet dans les 3 h'}</span></div>` +
    (t ? gpsTripCardHtml(t) : gpsSetupHtml()) + '<p class="dv-foot">Itinéraire indicatif, la signalisation prime. Rien à toucher en roulant : pose le téléphone sur un support.</p>';
  el.hidden = false;
  if (el.innerHTML !== html) el.innerHTML = html;
}
