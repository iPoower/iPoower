// @include app/garage-scene.js
// @include app/live-route-view.js
// @include app/mission-control.js
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
    '<small>' + (o.kmPerDay ? 'Rythme ≈ ' + Math.round(o.kmPerDay).toLocaleString('fr-FR') + ' km/j' : 'Rythme : deux relevés espacés d’au moins 7 jours nécessaires') + ' · rappel chaque semaine</small>' +
    (o.due ? '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(c.id) + '" data-garage-target="odo">Relever le compteur</button>' : '') + '</li>';
  return '<div class="garage-checks garage-maint" data-garage-maint="' + esc(c.id) + '"><h4>🔧 Entretien</h4><ul>' + revision + control + counter + '</ul>' +
    '<button type="button" class="btn sm garage-maint-edit" data-act="garage-quick" data-car="' + esc(c.id) + '" data-garage-target="maintenance">Renseigner l’entretien</button></div>';
}
function garageDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? esc(d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)) : 'date non renseignée';
}
function garageKm(km) { return Number.isFinite(km) ? Math.round(km).toLocaleString('fr-FR') + ' km' : 'non renseigné'; }
// Kilométrage par semaine : relevés compteur uniquement, lecture seule. SVG natif, valeurs aussi en tableau.
function garageKmHtml(rawCars, today) {
  const dm = d => d.slice(8, 10) + '/' + d.slice(5, 7), fmt = km => Math.round(km).toLocaleString('fr-FR');
  const cars = (rawCars || []).filter(c => c && c.id).slice(0, 2).map((c, i) => ({ id: c.id, name: c.short || c.name || 'Voiture ' + (i + 1), i,
    k: Garage.kmWeekly(c, { today, everyDays: GARAGE_ODO_EVERY_DAYS }), perDay: kmPerDay(c) }));
  if (!cars.length) return '';
  const lines = cars.map(c => {
    if (c.k.state === 'empty') return '<li><b>' + esc(c.name) + '</b> · ' + (c.k.readings ? c.k.readings + ' relevé' + (c.k.readings > 1 ? 's' : '') + (c.k.readings > 1 ? ' sur moins de 7 jours' : '') : 'aucun relevé') +
      (c.k.next ? ', prochain attendu le ' + dm(c.k.next) : ' : relève le compteur pour commencer') + '</li>';
    const m = c.k.month;
    return '<li><b>' + esc(c.name) + '</b> · ce mois : ' + (m.km == null ? (m.anomaly ? 'compteur à vérifier (relevé en baisse)' : 'pas de relevé ce mois-ci') : fmt(m.km) + ' km du ' + dm(m.from) + ' au ' + dm(m.until)) +
      (c.perDay != null ? ' · moyenne ' + fmt(c.perDay) + ' km/jour' : '') + '</li>';
  }).join('');
  const shown = cars.filter(c => c.k.state === 'ok');
  let chart = '';
  if (shown.length) {
    const weeks = shown[0].k.weeks.map(w => w.start), max = Math.max(1, ...shown.flatMap(c => c.k.weeks.map(w => w.km || 0)));
    const W = 320, H = 150, top = 18, base = 122, gw = W / weeks.length, bw = Math.min(14, (gw - 8) / shown.length);
    const bars = weeks.map((start, wi) => shown.map((c, ci) => {
      const w = c.k.weeks[wi], x = wi * gw + (gw - bw * shown.length) / 2 + ci * bw;
      if (w.km == null) return w.anomaly ? '<text class="km-na" x="' + (x + bw / 2) + '" y="' + (base - 4) + '" text-anchor="middle">!</text>' : '';
      const h = Math.max(1, (base - top) * w.km / max);
      return '<rect class="km-bar km-car' + c.i + (w.partial ? ' km-partial' : '') + '" x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' +
        esc(c.name) + ' · semaine du ' + dm(start) + ' : ' + fmt(w.km) + ' km' + (w.partial ? ' (semaine partielle)' : '') + '</title></rect>' +
        (shown.length === 1 ? '<text class="km-val" x="' + (x + bw / 2 - 1).toFixed(1) + '" y="' + (base - h - 4).toFixed(1) + '" text-anchor="middle">' + fmt(w.km) + '</text>' : '');
    }).join('') + (wi % 2 === weeks.length % 2 ? '' : '<text class="km-axis" x="' + (wi * gw + gw / 2) + '" y="' + (H - 12) + '" text-anchor="middle">' + dm(start) + '</text>')).join('');
    const rows = weeks.map((start, wi) => '<tr><th scope="row">' + dm(start) + '</th>' + shown.map(c => { const w = c.k.weeks[wi];
      return '<td>' + (w.km == null ? (w.anomaly ? 'à vérifier' : '—') : fmt(w.km) + ' km' + (w.partial ? ' (partielle)' : '')) + '</td>'; }).join('') + '</tr>').join('');
    chart = '<svg class="km-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="kmChartTitle kmChartDesc" preserveAspectRatio="xMidYMid meet">' +
      '<title id="kmChartTitle">Kilomètres par semaine, ' + shown.length + ' voiture' + (shown.length > 1 ? 's' : '') + '</title>' +
      '<desc id="kmChartDesc">Barres par semaine du ' + dm(weeks[0]) + ' au ' + dm(weeks[weeks.length - 1]) + ', maximum ' + fmt(max) + ' km. Répartition linéaire entre relevés compteur.</desc>' +
      '<defs><pattern id="kmHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="km-hatch"/></pattern></defs>' +
      '<line class="km-base" x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '"/>' + bars + '</svg>' +
      '<p class="km-legend">' + shown.map(c => '<span class="km-key km-car' + c.i + '"></span>' + esc(c.name)).join(' · ') + ' · barre claire : semaine partielle</p>' +
      '<details class="km-values"><summary>Voir les valeurs</summary><table><thead><tr><th scope="col">Semaine</th>' + shown.map(c => '<th scope="col">' + esc(c.name) + '</th>').join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></details>';
  }
  return '<section id="garageKm" class="garage-km" aria-labelledby="garageKmTitle"><div class="mod-h"><h3 id="garageKmTitle">KILOMÈTRES PAR SEMAINE</h3><span class="src est">relevés compteur</span></div>' +
    '<ul class="km-sum">' + lines + '</ul>' + chart +
    '<p class="sub">Entre deux relevés, les kilomètres sont répartis de façon linéaire (estimation). Aucune valeur avant le premier relevé ni après le dernier.</p></section>';
}
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
    '<button type="button" class="btn pri garage-edit" data-act="goset-cfg">Modifier la fiche</button>' +
    '<div class="garage-quick" aria-label="Relevés rapides de ' + esc(c.short) + '"><span>Relevés rapides</span>' +
      '<div class="chips">' + [['odo','Compteur km'],['tread','Profondeur mm'],['pressure','Pressions AV/AR']].map(([k,label]) =>
        '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(c.id) +
        '" data-garage-target="' + k + '">' + label + '</button>').join('') + '</div></div>' +
    '<div class="twin-vehicle-art"><span class="twin-plate" aria-hidden="true">' + esc(c.short) + '</span>' + garageCarSvg(c.silhouette) + '<small>SILHOUETTE STYLISÉE · TEINTE ILLUSTRATIVE</small></div>' +
    '<div class="garage-meter"><span>COMPTEUR ENREGISTRÉ</span><strong class="num">' + esc(current) + '</strong><small>' + currentNote + '</small></div>' +
    '<div class="twin-quality"><span class="src obs">' + (t ? 'MONTE DÉCLARÉE' : 'MONTE À CONFIRMER') + '</span><span class="src est">' +
    (t && t.tread ? t.tread.estimated ? 'USURE ESTIMÉE' : 'MESURE DÉCLARÉE' : 'USURE INCONNUE') + '</span></div>' +
    mounted + notices +
    uxFold('garage-records-' + c.id, 'Mesures et fiche pneus', tyres + (c.quality.length ? '<ul class="lab-why">' + c.quality.map(q=>'<li>' + esc(q.label + ' · ' + q.text) + '</li>').join('') + '</ul>' : ''), 'Monte · pression · montage') + winter +
    garageMaintHtml(c.maintenance, c) +
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
  const scene = Garage.preview(trip, { sourceFor: garageWeatherSources(), offline: offlineNow(), now: Date.now(), freshness: Reliability.freshState });
  const selected = cars.find(c => c.active) || null;
  const compared = selected ? Garage.comparison([selected], trip, scene)[0] : null;
  // Le même Waze que dans le briefing historique, uniquement sur geste explicite.
  const navigation = !DEMO.on && trip && !trip.destinationPending && !(trip.l && trip.l.originPending) ? wazeBtn(tripTo(trip)) : '';
  const mission = MissionControl.project({ car: selected, trip, scene, comparison: compared,
    offline: offlineNow(), navigationAvailable: !!navigation, agendaUnavailable: APP_CONTEXT.agendaSelectionUnavailable });
  // La fiche et sa commande d'édition historique restent au premier écran.
  // NEXT MISSION suit les fiches, accessible immédiatement par ancre dédiée.
  const parts = { records: cars.length ? '<div class="garage-grid">' + cars.map(garageVehicleHtml).join('') + '</div>' : '<p class="garage-empty">Aucune voiture enregistrée dans Race Control.</p>',
    km: garageKmHtml(S.cars, today),
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
  const foldFocus = uxFocusKey(el);
  if (!el.querySelector('#twinGarageBody')) el.innerHTML = GARAGE_STYLE + LIVE_ROUTE_STYLE +
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
