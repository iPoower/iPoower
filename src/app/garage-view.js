// @include app/garage-scene.js
// @include app/mission-control.js
/* Onglet Garage : consultation uniquement des fiches existantes.
 * Aucune nouvelle table, aucun journal d'entretien inventé, aucune connexion OBD.
 */
function garageDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? esc(d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)) : 'date non renseignée';
}
function garageKm(km) { return Number.isFinite(km) ? Math.round(km).toLocaleString('fr-FR') + ' km' : 'non renseigné'; }
function garageVehicleHtml(c) {
  const t = c.tyre, p = c.winterPlan;
  const active = c.active ? '<span class="garage-active">VOITURE ACTIVE</span>' :
    '<button type="button" class="btn sm garage-select" data-act="day-car" data-id="' + esc(c.id) + '">Choisir pour mes trajets</button>';
  const current = c.odo ? garageKm(c.odo.km) : '—';
  const currentNote = c.odo ? 'Déclaré le ' + garageDate(c.odo.date) : 'Aucun relevé enregistré';
  const mounted = t ? '<p class="garage-mounted"><span>MONTE ACTUELLE · ' + esc(t.type) + '</span><b>' + esc(t.model || 'Modèle non renseigné') + '</b></p>' : '';
  const tyres = t ? '<div class="garage-data">' +
      '<div><span>Monte actuelle</span><b>' + esc(t.type) + '</b><small>' + esc(t.model || 'Modèle non renseigné') + (t.size ? ' · ' + esc(t.size) : '') + '</small></div>' +
      '<div><span>Profondeur</span><b>' + (t.tread ? esc(String(t.tread.mm).replace('.', ',')) + ' mm' : '—') + '</b><small>' + (t.tread ? (t.tread.estimated ? 'Estimée, non mesurée' : 'Mesure déclarée') + (t.tread.date ? ' · ' + garageDate(t.tread.date) : '') : 'Pas de mesure disponible') + '</small></div>' +
      '<div><span>Pression recommandée</span><b>' + (t.pressure ? esc(String(t.pressure.bar).replace('.', ',')) + ' bar' : '—') + '</b><small>' + (t.pressure ? (t.pressure.checked ? 'Contrôle déclaré le ' + garageDate(t.pressure.checked) : 'Cible renseignée, aucun contrôle daté') : 'Cible non renseignée') + '</small></div>' +
      '<div><span>Montage actuel</span><b>' + (t.mount ? garageDate(t.mount) : 'Date inconnue') + '</b><small>' + (t.kmSinceMount == null ? 'Km depuis montage non calculables' : garageKm(t.kmSinceMount) + ' depuis montage') + '</small></div>' +
      '</div><p class="garage-dot">' + (t.dot ? esc(t.dot) : 'DOT non renseigné') + '</p>' +
      (t.stored.length ? '<p class="garage-sets">Autres jeux enregistrés : ' +
        t.stored.map(s => esc(s.label) + (s.title ? ' · ' + esc(s.title) : '')).join(' ; ') + '</p>' : '')
    : '<p class="garage-empty">Monte non confirmée : complète la fiche avant toute conclusion pneumatique.</p>';
  const notices = c.notices.length
    ? '<div class="garage-checks"><h4>À contrôler selon les données renseignées</h4><ul>' + c.notices.map(n => '<li class="lv' +
      (Number.isInteger(n.level) && n.level >= 0 && n.level <= 3 ? n.level : 1) + '">' + esc(n.text) + '</li>').join('') + '</ul></div>'
    : '<p class="garage-empty">Aucune échéance pneumatique calculée à partir des données disponibles ; cela ne signifie pas que le véhicule est sans entretien.</p>';
  const winter = p ? '<details class="garage-plan"><summary>❄️ Montage hiver prévu' + (p.model ? ' · ' + esc(p.model) : '') + '</summary>' +
      '<div><p>' + esc(p.model || 'Modèle non renseigné') + (p.size ? ' · ' + esc(p.size) : '') + '</p>' +
      '<p>Livraison annoncée : ' + (p.eta ? garageDate(p.eta) + (p.etaTo ? ' au ' + garageDate(p.etaTo) : '') : 'non renseignée') + '</p>' +
      '<p>Rendez-vous : ' + (p.appointment ? garageDate(p.appointment) + (p.confirmed ? ' · confirmé' : ' · à confirmer') : 'non renseigné') + '</p></div></details>'
    : '';
  return '<article class="garage-car" data-garage-car="' + esc(c.id) + '">' +
    '<div class="garage-car-head"><div><span class="garage-index">VÉHICULE · ' + esc(c.short) + '</span><h3>' + esc(c.name) +
    '</h3>' + (c.spec ? '<p>' + esc(c.spec) + '</p>' : '') + '</div><div class="garage-choose">' + active + '</div></div>' +
    '<button type="button" class="btn pri garage-edit" data-act="goset-cfg">Modifier la fiche</button>' +
    '<div class="twin-vehicle-art">' + garageCarSvg(c.silhouette) + '<small>SILHOUETTE STYLISÉE · TEINTE ILLUSTRATIVE</small></div>' +
    '<div class="garage-meter"><span>COMPTEUR ENREGISTRÉ</span><strong class="num">' + esc(current) + '</strong><small>' + currentNote + '</small></div>' +
    '<div class="twin-quality"><span class="src obs">' + (t ? 'MONTE DÉCLARÉE' : 'MONTE À CONFIRMER') + '</span><span class="src est">' +
    (t && t.tread ? t.tread.estimated ? 'USURE ESTIMÉE' : 'MESURE DÉCLARÉE' : 'USURE INCONNUE') + '</span></div>' +
    mounted + notices +
    uxFold('garage-records-' + c.id, 'Mesures et fiche pneus', tyres + (c.quality.length ? '<ul class="lab-why">' + c.quality.map(q=>'<li>' + esc(q.label + ' · ' + q.text) + '</li>').join('') + '</ul>' : ''), 'Monte · pression · montage') + winter +
    '<div class="garage-footer"><span>Entretien mécanique : aucun carnet général enregistré dans Race Control.</span></div>' +
    '</article>';
}
function renderGarage() {
  const el = $('#secGarage');
  if (!el) return;
  el.hidden = UI.view !== 'garage';
  if (el.hidden) { garageMotionDetach(); if (el.innerHTML) el.innerHTML = ''; renderGarage.last = null; return; }
  if (LOCKED()) { garageMotionDetach(); el.innerHTML = '<p class="sub">Déverrouille Race Control pour retrouver les fiches chiffrées.</p>'; renderGarage.last = null; return; }
  const active = appActiveCar(), cars = Garage.overview(S.cars, active && active.id, tyreStateOf);
  const trip = APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.nextTrip;
  const scene = Garage.preview(trip, { sourceFor: garageWeatherSources(), offline: offlineNow(), now: Date.now(), freshness: Reliability.freshState });
  const selected = cars.find(c => c.active) || null;
  const compared = selected ? Garage.comparison([selected], trip, scene)[0] : null;
  // Le même Waze que dans le briefing historique, uniquement sur geste explicite.
  const navigation = !DEMO.on && trip && !trip.destinationPending && !(trip.l && trip.l.originPending) ? wazeBtn(tripTo(trip)) : '';
  const mission = MissionControl.project({ car: selected, trip, scene, comparison: compared,
    offline: offlineNow(), navigationAvailable: !!navigation, agendaUnavailable: APP_CONTEXT.agendaSelectionUnavailable });
  const parts = { mission: missionControlHtml(mission, navigation),
    records: cars.length ? '<div class="garage-grid">' + cars.map(garageVehicleHtml).join('') + '</div>' : '<p class="garage-empty">Aucune voiture enregistrée dans Race Control.</p>',
    trip: garageTripHtml(scene, selected),
    compare: garageCompareHtml(cars, trip, scene) };
  const html = JSON.stringify(parts);
  // Une projection identique conserve le geste en cours, le focus et les extensions F1.
  // Une vraie modification reste visible, en gardant les plans hiver ouverts par véhicule.
  if (html === renderGarage.last) { garageMotionAttach(el); return; }
  const focused = document.activeElement, inGarage = focused && el.contains(focused), carNode = inGarage && focused.closest('[data-garage-car]');
  const token = inGarage ? { id: focused.id, act: focused.dataset.act, car: carNode && carNode.dataset.garageCar,
    plan: focused.tagName === 'SUMMARY' && focused.parentElement.classList.contains('garage-plan') } : null;
  const expanded = new Set([...el.querySelectorAll('.garage-plan[open]')]
    .map(plan => plan.closest('[data-garage-car]').dataset.garageCar));
  const foldFocus = uxFocusKey(el);
  if (!el.querySelector('#twinGarageBody')) el.innerHTML = GARAGE_STYLE +
    '<div class="mod-h"><h2>🛠️ TWIN GARAGE LIVE</h2><span class="src obs">THE GARAGE · données enregistrées</span></div>' +
    '<div class="twin-intro"><p>Véhicules · prochain trajet · préparation explicable.</p><a class="btn sm twin-jump" href="#garageTrip">Voir le prochain trajet 2D ↓</a></div>' +
    '<div id="twinGarageBody" class="twin-body">' + Object.keys(parts).map(k=>'<div data-twin-part="' + k + '"></div>').join('') + '</div>' +
    '<p class="garage-note">Les profondeurs et contrôles sont saisis par toi. La pression affichée est une cible, pas une mesure en temps réel. Aucun capteur moteur, diagnostic OBD ou historique de réparations n’est disponible.</p>';
  for (const [key, content] of Object.entries(parts)) {
    const part = el.querySelector('[data-twin-part="' + key + '"]');
    if (part._garageHTML !== content) { if (key === 'trip') garageMotionDetach(); part.innerHTML = content; part._garageHTML = content; }
  }
  renderGarage.last = html;
  el.querySelectorAll('.garage-plan').forEach(plan => {
    if (expanded.has(plan.closest('[data-garage-car]').dataset.garageCar)) plan.open = true;
  });
  uxRestoreFocus(el, foldFocus);
  if (token && focused && !focused.isConnected) {
    const car = [...el.querySelectorAll('[data-garage-car]')].find(x=>x.dataset.garageCar===token.car);
    const target = token.id ? [...el.querySelectorAll('[id]')].find(x=>x.id===token.id) : token.plan && car ? car.querySelector('.garage-plan > summary') :
      token.act && car ? [...car.querySelectorAll('[data-act]')].find(x=>x.dataset.act===token.act) : null;
    if (target) target.focus({ preventScroll:true });
  }
  garageMotionAttach(el);
}
