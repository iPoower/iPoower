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
    '<div class="garage-meter"><span>COMPTEUR ENREGISTRÉ</span><strong class="num">' + esc(current) + '</strong><small>' + currentNote + '</small></div>' +
    mounted + notices + uxFold('garage-records-' + c.id, 'Mesures et fiche pneus', tyres, 'Monte · pression · montage') + winter +
    '<div class="garage-footer"><span>Entretien mécanique : aucun carnet général enregistré dans Race Control.</span>' +
    '<button type="button" class="btn pri garage-edit" data-act="goset-cfg">Modifier la fiche</button></div>' +
    '</article>';
}
function renderGarage() {
  const el = $('#secGarage');
  if (!el) return;
  el.hidden = UI.view !== 'garage';
  if (el.hidden) { if (el.innerHTML) el.innerHTML = ''; renderGarage.last = null; return; }
  if (LOCKED()) { el.innerHTML = '<p class="sub">Déverrouille Race Control pour retrouver les fiches chiffrées.</p>'; renderGarage.last = null; return; }
  const active = appActiveCar(), cars = Garage.overview(S.cars, active && active.id, tyreStateOf);
  const html = '<div class="mod-h"><h2>🛠️ THE GARAGE</h2><span class="src obs">véhicules · données enregistrées</span></div>' +
    (cars.length ? '<div class="garage-grid">' + cars.map(garageVehicleHtml).join('') + '</div>'
      : '<p class="garage-empty">Aucune voiture enregistrée dans Race Control.</p>') +
    '<p class="garage-note">Les profondeurs et contrôles sont saisis par toi. La pression affichée est une cible, pas une mesure en temps réel. Aucun capteur moteur, diagnostic OBD ou historique de réparations n’est disponible.</p>';
  // Une projection identique conserve le geste en cours, le focus et les extensions F1.
  // Une vraie modification reste visible, en gardant les plans hiver ouverts par véhicule.
  if (html === renderGarage.last) return;
  const expanded = new Set([...el.querySelectorAll('.garage-plan[open]')]
    .map(plan => plan.closest('[data-garage-car]').dataset.garageCar));
  const foldFocus = uxFocusKey(el);
  el.innerHTML = html; renderGarage.last = html;
  el.querySelectorAll('.garage-plan').forEach(plan => {
    if (expanded.has(plan.closest('[data-garage-car]').dataset.garageCar)) plan.open = true;
  });
  uxRestoreFocus(el, foldFocus);
}
