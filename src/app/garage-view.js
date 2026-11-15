// @include app/garage-scene.js
// @include app/live-route-view.js
// @include app/mission-control.js
// @include app/garage-economics-core.js
// @include app/garage-economics-view.js
// @include app/inbox-core.js
// @include app/inbox-view.js
/* Onglet Garage : consultation des fiches existantes et de l'entretien déclaré dans ces fiches.
 * Aucune nouvelle table, aucun journal d'entretien inventé, aucune connexion OBD.
 */
const GARAGE_ODO_EVERY_DAYS = 7;   // rappel du compteur : chaque semaine (choix du propriétaire)
const GARAGE_MAINT_LV = { late: 2, soon: 1, ok: 0, unknown: 0 };
function garageMaintHtml(m, c) {
  const r = m.revision, ct = m.ct, o = m.odo, lv = s => GARAGE_MAINT_LV[s] || 0;
  const left = (days, km) => [days != null ? (days < 0 ? 'dépassée de ' + -days + ' j' : 'dans ' + days + ' j') : '',
    km != null ? (km <= 0 ? 'dépassée de ' + garageKm(-km) : garageKm(km) + ' restants') : ''].filter(Boolean).join(' · ');
  const revision = r.missing === 'last' ? '<li class="lv0">Révision · dernière non renseignée</li>'
    : r.missing === 'interval' ? '<li class="lv0">Révision · dernière le ' + garageDate(r.last.d) + (r.last.km != null ? ' à ' + garageKm(r.last.km) : '') + ' · intervalle du carnet à renseigner</li>'
    : '<li class="lv' + lv(r.status) + '"><b>Révision' + (r.status === 'late' ? ' en retard' : r.status === 'soon' ? ' bientôt' : '') + '</b> · avant ' +
      [r.dueDate ? 'le ' + garageDate(r.dueDate) : '', r.dueKm != null ? garageKm(r.dueKm) : ''].filter(Boolean).join(' ou ') +
      '<small>' + left(r.dateDaysLeft, r.kmLeft) +
      (r.kmDate ? ' · km atteints vers le ' + garageDate(r.kmDate) + ' à ton rythme' : r.dueKm != null && !o.kmPerDay ? ' · date selon les km : rythme pas encore calculable' : '') + '</small></li>';
  const control = ct.next ? '<li class="lv' + lv(ct.status) + '"><b>Contrôle technique' + (ct.status === 'late' ? ' dépassé' : ct.status === 'soon' ? ' bientôt' : '') + '</b> · avant le ' + garageDate(ct.next) +
      '<small>' + left(ct.daysLeft, null) + (ct.source === 'two-years' ? ' · 2 ans après le dernier (' + garageDate(ct.last) + ')' : ' · date limite déclarée') + '</small></li>'
    : '<li class="lv0">Contrôle technique · dernier non renseigné</li>';
  const counter = '<li class="lv' + (o.due ? 1 : 0) + '"><b>' + (o.due ? 'Compteur à mettre à jour' : 'Compteur à jour') + '</b>' +
    (o.last ? ' · relevé ' + (o.ageDays === 0 ? 'aujourd’hui' : 'il y a ' + o.ageDays + ' j') : ' · aucun relevé') +
    '<small>' + (o.kmPerDay ? 'Rythme ≈ ' + Math.round(o.kmPerDay).toLocaleString('fr-FR') + ' km/j' : 'Rythme inconnu : deux relevés réels espacés d’au moins 7 jours nécessaires') + ' · rappel chaque semaine</small>' +
    (o.due ? '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(c.id) + '" data-garage-target="odo">Relever le compteur</button>' : '') + '</li>';
  return '<div class="garage-checks garage-maint" data-garage-maint="' + esc(c.id) + '"><h4>🔧 Entretien</h4><ul>' + revision + control + counter + '</ul>' +
    '<button type="button" class="btn sm garage-maint-edit" data-act="garage-quick" data-car="' + esc(c.id) + '" data-garage-target="maintenance">Renseigner l’entretien</button></div>';
}
// Évolution du kilométrage (relevés réels de la fiche) et objectif choisi par voiture : kilométrage cible ou « à vie ».
const ODO_GOAL_STATUS = {};
function garageMonth(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? esc(d.slice(5, 7) + '/' + d.slice(0, 4)) : '—'; }
function garageOdoChart(tr) {
  const pts = tr.readings, t = tr.target;
  if (pts.length < 2 || tr.nonMonotonic) return '';
  // Projection vers l'objectif tracée seulement si sa date est calculée et proche (≤ 30 ans) : sinon l'historique serait écrasé.
  const proj = t && t.eta && !t.reached && t.daysLeft != null && t.daysLeft <= 30 * 365 ? { d: t.eta, km: t.km } : null;
  const day = d => Date.parse(d + 'T00:00:00Z') / 864e5, x0 = day(pts[0].d), x1 = day((proj || pts[pts.length - 1]).d);
  const y0 = pts[0].km, y1 = Math.max(pts[pts.length - 1].km, proj ? proj.km : 0), W = 300, H = 90;
  const X = d => ((day(d) - x0) / Math.max(1, x1 - x0) * W).toFixed(1), Y = km => (H - (km - y0) / Math.max(1, y1 - y0) * H).toFixed(1);
  const step = Math.max(1, Math.ceil(pts.length / 200)), shown = pts.filter((p, i) => i % step === 0 || i === pts.length - 1);
  const line = shown.map((p, i) => (i ? 'L' : 'M') + X(p.d) + ' ' + Y(p.km)).join(' '), last = pts[pts.length - 1];
  const label = 'Compteur de ' + garageKm(y0) + ' (' + garageMonth(pts[0].d) + ') à ' + garageKm(last.km) + ' (' + garageMonth(last.d) + ')' +
    (proj ? ', projection jusqu’à ' + garageKm(proj.km) + ' vers ' + garageMonth(proj.d) : '');
  return '<figure class="odo-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' +
    (proj ? '<line class="odo-goal-line" x1="0" x2="' + W + '" y1="0" y2="0"/><path class="odo-proj" d="M' + X(last.d) + ' ' + Y(last.km) + ' L' + X(proj.d) + ' ' + Y(proj.km) + '"/>' : '') +
    '<path class="odo-line" d="' + line + '"/></svg>' +
    '<figcaption><span>' + garageMonth(pts[0].d) + ' · ' + garageKm(y0) + '</span><span>' + (proj ? '🏁 ' + garageMonth(proj.d) + ' · ' + garageKm(proj.km) : garageMonth(last.d) + ' · ' + garageKm(last.km)) + '</span></figcaption></figure>';
}
function garageOdoHtml(raw, today) {
  if (!raw || !raw.id) return '';
  const tr = Garage.odoTrend(raw, { today }), t = tr.target, g = tr.goal, id = esc(raw.id);
  const pace = tr.kmPerYear ? '≈ ' + garageKm(Math.round(tr.kmPerYear / 100) * 100) + '/an à ton rythme' : 'rythme inconnu : deux relevés espacés d’au moins 7 jours nécessaires';
  let head;
  if (t) {
    const pct = t.pct == null ? null : Math.floor(t.pct);
    head = '<div class="odo-goal" data-odo-goal-state="km"><p><b>🎯 Objectif ' + garageKm(t.km) + '</b>' + (pct != null ? ' · ' + pct + ' %' : '') + '</p>' +
      (pct != null ? '<div class="odo-bar" role="progressbar" aria-label="Progression vers ' + esc(garageKm(t.km)) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' : '') +
      '<small>' + (!tr.last ? 'Aucun relevé : relève le compteur pour suivre l’objectif'
        : t.reached ? '🏁 Objectif atteint' + (t.reachedOn ? ' (relevé du ' + garageDate(t.reachedOn) + ')' : '')
        : 'Reste ' + garageKm(t.remaining) + ' · ' + (t.eta ? 'atteint vers ' + garageMonth(t.eta) + ' (' + pace + ')' : pace)) + '</small></div>';
  } else if (g && g.life) {
    head = '<div class="odo-goal" data-odo-goal-state="life"><p><b>♾️ Objectif : à vie</b> · aucune limite de kilométrage</p><small>' +
      (tr.totalKm != null && tr.count >= 2 ? garageKm(tr.totalKm) + ' parcourus depuis le ' + garageDate(tr.first.d) + ' · ' : '') + pace + '</small></div>';
  } else head = '<div class="odo-goal" data-odo-goal-state="none"><p><b>Aucun objectif de kilométrage</b></p><small>' + pace + '</small></div>';
  const stats = tr.count ? '<ul class="odo-stats">' +
      '<li><span>Relevés</span><b>' + tr.count + '</b><small>depuis le ' + garageDate(tr.first.d) + '</small></li>' +
      '<li><span>Parcourus</span><b>' + (tr.totalKm != null ? garageKm(tr.totalKm) : '—') + '</b><small>entre le premier et le dernier relevé</small></li>' +
      '<li><span>12 derniers mois</span><b>' + (tr.last12 != null ? garageKm(tr.last12) : '—') + '</b><small>' + (tr.last12 != null ? 'd’après les relevés' : 'historique de moins d’un an') + '</small></li>' +
      '<li><span>Rythme</span><b>' + (tr.kmPerYear ? garageKm(Math.round(tr.kmPerYear / 100) * 100) + '/an' : '—') + '</b><small>' + (tr.kmPerDay ? '≈ ' + Math.round(tr.kmPerDay).toLocaleString('fr-FR') + ' km/j' : 'à calculer') + '</small></li></ul>'
    : '<p class="garage-empty">Aucun relevé du compteur : la courbe apparaîtra dès le premier relevé (« Compteur km » ci-dessus).</p>';
  const warn = tr.nonMonotonic ? '<p class="odo-warn">⚠️ Un relevé est inférieur au précédent : corrige-le dans Paramètres. Courbe et rythme suspendus.</p>' : '';
  const mode = g && g.life ? 'life' : t ? 'km' : 'none';
  const form = '<form class="odo-goal-form" data-odo-goal="' + id + '"><label>Objectif<select name="mode">' +
      [['none', 'Aucun'], ['km', 'Kilométrage cible'], ['life', 'À vie (sans limite)']].map(([v, l]) => '<option value="' + v + '"' + (v === mode ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label><label data-odo-goal-km' + (mode === 'km' ? '' : ' hidden') + '>Kilométrage cible (km)<input name="km" inputmode="numeric" autocomplete="off" placeholder="ex. 250 000" value="' + (t ? esc(t.km.toLocaleString('fr-FR')) : '') + '"></label>' +
      '<button type="submit" class="btn sm pri">Enregistrer l’objectif</button><p class="odo-goal-status" role="status">' + esc(ODO_GOAL_STATUS[raw.id] || '') + '</p></form>';
  return '<section class="garage-odo" data-garage-odo="' + id + '">' + head +
    uxFold('garage-odo-' + raw.id, '📈 Évolution du kilométrage', warn + garageOdoChart(tr) + stats + form, tr.count ? tr.count + ' relevé' + (tr.count > 1 ? 's' : '') + ' · objectif' : 'objectif') + '</section>';
}
// Écrit, relit et vide le coffre ; sinon l'ancien objectif est remis et l'échec est dit (même contrat que le budget).
async function odoGoalPersist(car, next) {
  const ix = S.cars.indexOf(car);
  if (ix < 0 || LOCKED() || DEMO.on || DeviceStorage.isFrozen()) throw new Error('Garage indisponible : déverrouille Race Control.');
  const had = Object.prototype.hasOwnProperty.call(car, 'odoGoal'), before = car.odoGoal;
  car.odoGoal = next; markEdit('cars.' + ix + '.odoGoal');
  try {
    saveSettings();
    const saved = JSON.parse(lsGet('twrc.settings.v1') || 'null');
    if (!saved || !saved.cars || JSON.stringify(saved.cars[ix] && saved.cars[ix].odoGoal) !== JSON.stringify(next)) throw new Error('relecture');
    const vs = window.TWRC_VAULT;
    if (vs && vs.mode === 'vault') { await vs.flush(); if (vs.error || vs.pendingRecovery) throw new Error('coffre'); }
  } catch (e) {
    if (had) car.odoGoal = before; else delete car.odoGoal;
    try { saveSettings(); } catch (x) { /* l'ancienne valeur reste en mémoire */ }
    throw new Error('Enregistrement non confirmé : rien n’a été modifié. Réessaie.');
  }
}
document.addEventListener('submit', async event => {
  const form = event.target, carId = form && form.dataset && form.dataset.odoGoal;
  if (!carId) return;
  event.preventDefault();
  const car = (S.cars || []).find(c => c && c.id === carId), status = form.querySelector('.odo-goal-status');
  if (!car) return;
  const say = text => { ODO_GOAL_STATUS[carId] = text; if (status) status.textContent = text; };
  try {
    const data = new FormData(form), mode = String(data.get('mode') || 'none');
    let next = null, msg = 'Objectif retiré';
    if (mode === 'life') { next = { life: 1 }; msg = 'Objectif « à vie » enregistré'; }
    else if (mode === 'km') {
      const km = GarageEconomics.parseKm(data.get('km'));
      if (km == null || !Garage.odoGoal({ km })) throw new Error('Kilométrage cible invalide : un nombre entier de 1 à ' + Garage.GOAL_MAX_KM.toLocaleString('fr-FR') + ' km.');
      const last = Garage.odoTrend(car, { today: nowIn('Europe/Paris').slice(0, 10) }).last;
      if (last && km <= last.km && !confirm('Cet objectif (' + km.toLocaleString('fr-FR') + ' km) est déjà atteint par le dernier relevé (' + last.km.toLocaleString('fr-FR') + ' km).\n\nL’enregistrer quand même ?')) { say('Objectif non modifié.'); return; }
      next = { km }; msg = 'Objectif ' + km.toLocaleString('fr-FR') + ' km enregistré';
    }
    await odoGoalPersist(car, next);
    say(msg + ' · enregistré dans le coffre.');
    renderGarage.last = null; renderGarage();
  } catch (e) { say(e.message || 'Enregistrement non confirmé.'); }
});
// Le kilométrage cible n'est demandé qu'en mode « Kilométrage cible ».
document.addEventListener('change', event => {
  const sel = event.target && event.target.closest && event.target.closest('form[data-odo-goal] select[name=mode]');
  const box = sel && sel.form.querySelector('[data-odo-goal-km]');
  if (box) box.hidden = sel.value !== 'km';
});
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
      '<div><span>Montage actuel</span><b>' + (t.mount ? garageDate(t.mount) : 'Date inconnue') + '</b><small>' + (t.kmSinceMount == null ? 'Compteur au montage à saisir' : garageKm(t.kmSinceMount) + ' depuis montage') + '</small>' +
        (t.kmSinceMount == null ? '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(c.id) + '" data-garage-target="mount">Saisir le compteur au montage</button>' : '') + '</div>' +
      '</div><p class="garage-dot">' + (t.dot ? esc(t.dot) : 'DOT non renseigné') + '</p>' +
      (t.stored.length ? '<p class="garage-sets">Autres jeux enregistrés : ' +
        t.stored.map(s => esc(s.label) + (s.title ? ' · ' + esc(s.title) : '')).join(' ; ') + '</p>' : '')
    : '<p class="garage-empty">Monte non confirmée : complète la fiche avant toute conclusion pneumatique.</p>';
  const notices = c.notices.length
    ? '<div class="garage-checks"><h4>À contrôler selon les données renseignées</h4><ul>' + c.notices.map(n => '<li class="lv' +
      (Number.isInteger(n.level) && n.level >= 0 && n.level <= 3 ? n.level : 1) + '">' + esc(n.text) + '</li>').join('') + '</ul></div>'
    : '<p class="garage-empty">Aucune échéance pneumatique calculée à partir des données disponibles ; cela ne signifie pas que le véhicule est sans entretien.</p>';
  const winter = p ? '<details class="garage-plan"><summary>❄️ Montage hiver prévu' + (p.model ? ' · ' + esc(p.model) : '') + (p.appointment || p.estimate ? ' · ' + garageDate(p.appointment || p.estimate) : '') + '</summary>' +
      '<div><p>' + esc(p.model || 'Modèle non renseigné') + (p.size ? ' · ' + esc(p.size) : '') + '</p>' +
      '<p>Montage estimé : ' + (p.estimate ? garageDate(p.estimate) : 'non renseigné') + '</p>' +
      (p.ordered ? '<p>Commande passée le ' + garageDate(p.ordered) + '</p>' : '') +
      '<p>Livraison annoncée : ' + (p.eta ? garageDate(p.eta) + (p.etaTo ? ' au ' + garageDate(p.etaTo) : '') : 'non renseignée') + '</p>' +
      '<p>Rendez-vous : ' + (p.appointment ? garageDate(p.appointment) + (p.confirmed ? ' · confirmé' : ' · à confirmer') : 'non renseigné') + '</p></div></details>'
    : '';
  return '<article class="garage-car" data-garage-car="' + esc(c.id) + '">' +
    '<div class="garage-car-head"><div><span class="garage-index">VÉHICULE · ' + esc(c.short) + '</span><h3>' + esc(c.name) +
    '</h3>' + (c.spec ? '<p>' + esc(c.spec) + '</p>' : '') + '</div><div class="garage-choose">' + active + '</div></div>' +
    // Action principale : les relevés rapides (compteur, profondeur, pressions) ; « Modifier la fiche » passe en action secondaire.
    '<div class="garage-quick" aria-label="Relevés rapides de ' + esc(c.short) + '"><span>Relevés rapides</span>' +
      '<div class="chips">' + [['odo','Compteur km'],['tread','Profondeur mm'],['pressure','Pressions AV/AR']].map(([k,label]) =>
        '<button type="button" class="btn pri sm" data-act="garage-quick" data-car="' + esc(c.id) +
        '" data-garage-target="' + k + '">' + label + '</button>').join('') + '</div></div>' +
    '<button type="button" class="btn garage-edit" data-act="goset-cfg">Modifier la fiche</button>' +
    '<div class="twin-vehicle-art"><span class="twin-plate" aria-hidden="true">' + esc(c.short) + '</span>' + garageCarSvg(c.silhouette) + '<small>SILHOUETTE STYLISÉE · TEINTE ILLUSTRATIVE</small></div>' +
    '<div class="garage-meter"><span>COMPTEUR ENREGISTRÉ</span><strong class="num">' + esc(current) + '</strong><small>' + currentNote + '</small></div>' +
    garageOdoHtml((S.cars || []).find(x => x && x.id === c.id), nowIn('Europe/Paris').slice(0, 10)) +
    '<div class="twin-quality"><span class="src obs">' + (t ? 'MONTE DÉCLARÉE' : 'MONTE À CONFIRMER') + '</span><span class="src est">' +
    (t && t.tread ? t.tread.estimated ? 'USURE ESTIMÉE' : 'MESURE DÉCLARÉE' : 'USURE INCONNUE') + '</span></div>' +
    mounted + notices +
    uxFold('garage-records-' + c.id, 'Mesures et fiche pneus', tyres + (c.quality.length ? '<ul class="lab-why">' + c.quality.map(q=>'<li>' + esc(q.label + ' · ' + q.text) + '</li>').join('') + '</ul>' : ''), 'Monte · pression · montage') + winter +
    garageMaintHtml(c.maintenance, c) +
    garageEconomicsHtml((S.cars || []).find(x => x && x.id === c.id)) +
    '</article>';
}
function renderGarage() {
  const el = $('#secGarage');
  if (!el) return;
  el.hidden = UI.view !== 'garage';
  if (el.hidden) { garageMotionDetach(); garageLiveDetach(); if (el.innerHTML) el.innerHTML = ''; renderGarage.last = null; return; }
  if (LOCKED()) { garageMotionDetach(); garageLiveDetach(); el.innerHTML = '<p class="sub">Déverrouille Race Control pour retrouver les fiches chiffrées.</p>'; renderGarage.last = null; return; }
  const active = appActiveCar(), today = nowIn('Europe/Paris').slice(0, 10), cars = Garage.overview(S.cars, active && active.id, tyreStateOf)
    .map(c => { const raw = S.cars.find(x => x && x.id === c.id); return { ...c, maintenance: Garage.maintenance(raw, { today, kmPerDay: raw ? kmPerDay(raw) : null, odoEveryDays: GARAGE_ODO_EVERY_DAYS }) }; });
  const trip = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const scene = Garage.preview(trip, { sourceFor: garageWeatherSources(), offline: offlineNow(), now: Date.now(), freshness: Reliability.freshState, frostFor: q => q && q.hs ? frostHour(q.hs, q.i) : null });
  // Voiture confirmée, sinon voiture affichée (données réelles de sa fiche), signalée comme non confirmée pour le trajet.
  const shown = appDisplayedCar(), selected = cars.find(c => c.active) || (shown && cars.find(c => c.id === shown.id)) || null;
  const compared = selected ? Garage.comparison([selected], trip, scene)[0] : null;
  // Le même Waze que dans le briefing historique, uniquement sur geste explicite.
  const navigation = !DEMO.on && trip && !trip.destinationPending && !(trip.l && trip.l.originPending) ? wazeBtn(tripTo(trip)) : '';
  const mission = MissionControl.project({ car: selected, carConfirmed: !!(selected && selected.active), trip, scene, comparison: compared,
    offline: offlineNow(), navigationAvailable: !!navigation, agendaUnavailable: APP_CONTEXT.agendaSelectionUnavailable, risk: trip ? tripRisk(trip) : null });
  // La fiche et sa commande d'édition historique restent au premier écran.
  // NEXT MISSION suit les fiches, accessible immédiatement par ancre dédiée.
  const parts = { records: cars.length ? '<div class="garage-grid">' + cars.map(garageVehicleHtml).join('') + '</div>' : '<p class="garage-empty">Aucune voiture enregistrée dans Race Control.</p>',
    budget: garageEconomicsCompareHtml(S.cars),
    inbox: inboxHtml(),
    mission: missionControlHtml(mission, navigation),
    trip: garageTripHtml(scene, selected),
    compare: garageCompareHtml(cars, trip, scene) };
  const html = JSON.stringify(parts);
  // Une projection identique conserve le geste en cours, le focus et les extensions F1.
  // Une vraie modification reste visible, en gardant les plans hiver ouverts par véhicule.
  if (html === renderGarage.last) { garageMotionAttach(el); garageLiveAttach(trip, selected); return; }
  const focused = document.activeElement, inGarage = focused && el.contains(focused), carNode = inGarage && focused.closest('[data-garage-car]');
  const token = inGarage ? { id: focused.id, act: focused.dataset.act, car: carNode && carNode.dataset.garageCar,
    plan: focused.tagName === 'SUMMARY' && focused.parentElement.classList.contains('garage-plan') } : null;
  const expanded = new Set([...el.querySelectorAll('.garage-plan[open]')]
    .map(plan => plan.closest('[data-garage-car]').dataset.garageCar));
  // Volet « Coût & rentabilité » : resté ouvert après un enregistrement (le rendu remplace la fiche).
  const budgetOpen = new Set([...el.querySelectorAll('.garage-economics[open]')].map(d => d.dataset.garageEconomics));
  const foldFocus = uxFocusKey(el);
  if (!el.querySelector('#twinGarageBody')) el.innerHTML = GARAGE_STYLE + LIVE_ROUTE_STYLE + ECON_STYLE + INBOX_STYLE +
    '<div class="mod-h"><h2>🛠️ GARAGE NUMÉRIQUE</h2><span class="src obs">LE GARAGE · données enregistrées</span></div>' +
    '<div class="twin-intro"><p>Véhicules · prochain trajet · préparation explicable.</p><div class="mission-actions"><a class="btn sm twin-jump" href="#missionControl">PROCHAINE MISSION ↓</a><a class="btn sm twin-jump" href="#garageTrip">Voir le trajet en direct ↓</a></div></div>' +
    '<div id="twinGarageBody" class="twin-body">' + Object.keys(parts).map(k=>'<div data-twin-part="' + k + '"></div>').join('') + '</div>' +
    '<p class="garage-note">Les profondeurs et contrôles sont saisis par toi. La pression affichée est une cible, pas une mesure en temps réel. Aucun capteur moteur, diagnostic OBD ou historique de réparations n’est disponible.</p>';
  for (const [key, content] of Object.entries(parts)) {
    const part = el.querySelector('[data-twin-part="' + key + '"]');
    if (part._garageHTML !== content) {
      // Les prévisions peuvent changer pendant un geste. Le cockpit conserve
      // son DOM, sa carte, son zoom et son curseur ; son adaptateur invalide
      // séparément les données d'un trajet effectivement remplacé.
      const liveRoot = key === 'trip' && part.querySelector('#garageLiveRoute');
      if (key === 'trip') garageMotionDetach();
      const template = liveRoot && document.createElement('template');
      if (template) template.innerHTML = content;
      const incoming = template && template.content.querySelector('#garageTrip');
      const slot = incoming && incoming.querySelector('#garageLiveRoute');
      if (slot && liveRoot.parentElement.id === 'garageTrip') {
        // Ne pas déconnecter le cockpit, même provisoirement : un input retiré
        // puis réinséré perdrait son focus et sa capture du pointeur.
        const parent = liveRoot.parentElement, before = document.createDocumentFragment(), after = document.createDocumentFragment();
        let passed = false;
        for (const child of [...incoming.childNodes]) {
          if (child === slot) { passed = true; continue; }
          (passed ? after : before).appendChild(child);
        }
        for (const child of [...parent.childNodes]) if (child !== liveRoot) child.remove();
        parent.insertBefore(before, liveRoot); parent.appendChild(after);
      } else part.innerHTML = content;
      part._garageHTML = content;
    }
  }
  renderGarage.last = html;
  el.querySelectorAll('.garage-plan').forEach(plan => {
    if (expanded.has(plan.closest('[data-garage-car]').dataset.garageCar)) plan.open = true;
  });
  el.querySelectorAll('.garage-economics').forEach(d => { if (budgetOpen.has(d.dataset.garageEconomics)) d.open = true; });
  uxRestoreFocus(el, foldFocus);
  if (token && focused && !focused.isConnected) {
    const car = [...el.querySelectorAll('[data-garage-car]')].find(x=>x.dataset.garageCar===token.car);
    const target = token.id ? [...el.querySelectorAll('[id]')].find(x=>x.id===token.id) : token.plan && car ? car.querySelector('.garage-plan > summary') :
      token.act && car ? [...car.querySelectorAll('[data-act]')].find(x=>x.dataset.act===token.act) : null;
    if (target) target.focus({ preventScroll:true });
  }
  garageMotionAttach(el);
  garageLiveAttach(trip, selected);
}
