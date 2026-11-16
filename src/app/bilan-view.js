// @include app/bilan-core.js
/* Analyse · « Mon bilan » (16/11/2026) : trois cartes en tête de l'onglet Analyse, le laboratoire existant replié dessous.
 * Lecture seule : chaque bouton mène à la saisie existante (Paramètres ou Garage), aucune valeur n'est écrite ici. */
const BILAN_TONE = { late: 'var(--nogo)', soon: 'var(--risk)', todo: 'var(--cau)', info: 'var(--accent)' };
const BILAN_LEVEL = { ok: 'var(--go)', limit: 'var(--cau)', cold: 'var(--risk)', unknown: 'var(--line2)' };
const bilanMonth = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const bilanDm = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—';
function bilanInputs(today) {
  const active = appActiveCar(), overview = Garage.overview(S.cars, active && active.id, tyreStateOf);
  return S.cars.filter(Boolean).map(raw => {
    const o = overview.find(x => x.id === raw.id) || {}, st = hasTires(raw) ? tyreStateOf(raw) : null;
    const pchk = raw.tire && raw.tire.pchk && /^\d{4}-\d{2}-\d{2}$/.test(raw.tire.pchk.date || '') ? raw.tire.pchk.date : null;
    return { id: raw.id, short: raw.short || raw.name || raw.id, hasTires: hasTires(raw), plan: o.winterPlan || null,
      maintenance: Garage.maintenance(raw, { today, kmPerDay: kmPerDay(raw), odoEveryDays: GARAGE_ODO_EVERY_DAYS }),
      pressureDate: pchk, treadMm: st && st.tread && st.tread.mm != null ? st.tread.mm : null, treadDate: st && st.tread ? st.tread.date || null : null, treadEst: !!(st && st.tread && st.tread.est) };
  });
}
// Départs du matin : air à l'heure de départ habituelle, au lieu de départ habituel (prévisions déjà chargées, aucune requête).
function bilanMornings(today) {
  const m = M[S.work.from] || M[S.locs[0] && S.locs[0].id], dep = String(S.work.dep || '07:00').slice(0, 5), h = +dep.slice(0, 2);
  if (!m || !Array.isArray(m.hs)) return [];
  // Départ du jour déjà passé : le calendrier commence demain.
  const first = nowIn(m.tz || 'Europe/Paris').slice(11, 16) < dep ? today : addMin(today + 'T00:00', 1440).slice(0, 10), out = [];
  for (const x of m.hs) if (x && x.date >= first && x.hh === h && !out.some(d => d.date === x.date)) out.push({ date: x.date, T: x.T });
  return out;
}
function bilanHtml(car) {
  if (!car || DEMO.on) return '';
  const today = nowIn('Europe/Paris').slice(0, 10), now = Date.now();
  // 1. À faire bientôt (toutes voitures)
  const items = Bilan.todo(bilanInputs(today), today);
  const when = x => x.days == null ? 'à faire' : x.days < 0 ? 'dépassé de ' + -x.days + ' j' : x.days === 0 ? 'maintenant' : 'dans ' + x.days + ' j';
  const act = x => x.target
    ? '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(x.carId) + '" data-garage-target="' + x.target + '">Saisir</button>'
    : '<button type="button" class="btn sm" data-act="view" data-v="garage">Voir</button>';
  const late = items.filter(x => x.tone !== 'info').length;
  const todo = '<div class="bilan-card" data-bilan="todo"><div class="bilan-h"><h3>À faire bientôt</h3><span>' + (late ? late + ' à faire' : 'à jour') + '</span></div>' +
    (items.length ? '<ul class="bilan-todo">' + items.map((x, i) => (i === 5 ? '</ul><details class="bilan-more" data-ux="bilan-more"><summary>Voir les ' + (items.length - 5) + ' autres</summary><ul class="bilan-todo">' : '') + '<li data-bilan-item="' + esc(x.carId + ':' + x.id) + '" data-tone="' + x.tone + '"><i aria-hidden="true" style="background:' + BILAN_TONE[x.tone] + '"></i>' +
      '<span class="bt"><b>' + esc(x.title) + ' · ' + esc(x.car) + '</b><small>' + esc(x.sub) + '</small></span>' +
      '<span class="bw"><em style="color:' + BILAN_TONE[x.tone] + '">' + esc(when(x)) + '</em>' + act(x) + '</span></li>').join('') + '</ul>' + (items.length > 5 ? '</details>' : '')
      : '<p class="sub">Rien d’urgent : les échéances renseignées sont à jour.</p>') + '</div>';
  // 2. Tes chiffres du mois (voiture analysée)
  const tr = Garage.odoTrend(car, { today }), win = Bilan.kmWindow(tr, today, 30), econ = econProject(car), t = tr.target;
  const tile = (k, v, n) => '<div class="bilan-tile"><span>' + k + '</span><b>' + v + '</b><small>' + n + '</small></div>';
  const tiles = tile('COMPTEUR', tr.last ? esc(Math.round(tr.last.km).toLocaleString('fr-FR')) : '—', tr.last ? 'relevé du ' + bilanDm(tr.last.d) : 'aucun relevé') +
    tile('30 DERNIERS JOURS', win ? esc(win.km.toLocaleString('fr-FR')) + ' km' : '—', win ? (win.partial ? 'depuis le ' : 'du ') + bilanDm(win.from) + ' au ' + bilanDm(win.to) : 'deux relevés nécessaires') +
    tile('RYTHME', tr.kmPerYear ? esc((Math.round(tr.kmPerYear / 100) * 100).toLocaleString('fr-FR')) : '—', tr.kmPerYear ? 'km par an' : 'à calculer') +
    tile('COÛT / KM', econ.costPerKmCents != null ? esc((econ.costPerKmCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' €' : '—', econ.costPerKmCents != null ? 'déclaré, depuis l’achat' : 'prix d’achat à renseigner');
  const goal = t ? '<div class="bilan-goal"><div><span>Objectif ' + esc(garageKm(t.km)) + '</span><span>' + (t.pct != null ? Math.floor(t.pct) + ' %' : '—') + '</span></div>' +
      (t.pct != null ? '<div class="odo-bar" role="progressbar" aria-label="Progression vers l’objectif" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.floor(t.pct) + '"><i style="width:' + Math.floor(t.pct) + '%"></i></div>' : '') +
      '<small>' + (t.reached ? 'Objectif atteint' : t.remaining != null ? 'Reste ' + esc(garageKm(t.remaining)) + (t.eta ? ' · atteint vers ' + esc(bilanMonth(t.eta)) + ' au rythme actuel' : ' · date : rythme à calculer') : 'Relève le compteur pour suivre l’objectif') + '</small></div>'
    : tr.goal && tr.goal.life ? '<div class="bilan-goal"><div><span>Objectif : à vie</span><span>∞</span></div><small>' + (tr.totalKm != null && tr.count >= 2 ? esc(garageKm(tr.totalKm)) + ' parcourus depuis le ' + bilanDm(tr.first.d) : 'Aucune limite de kilométrage') + '</small></div>'
    : '<div class="bilan-goal"><small>Aucun objectif de kilométrage · Garage › Évolution du kilométrage</small></div>';
  const tp = Bilan.trips(USER_STORE.state.debrief && USER_STORE.state.debrief.entries, car.id, now, 30), mo = Bilan.mornings(S.journal, today, 30);
  const cell = (v, k) => '<div><b>' + v + '</b><span>' + k + '</span></div>';
  const cons = econ.consumption;
  const stats = '<div class="bilan-card" data-bilan="stats"><div class="bilan-h"><h3>Tes chiffres du mois</h3><span>' + esc(car.short || car.name || '') + '</span></div>' +
    '<div class="bilan-tiles">' + tiles + '</div>' + goal +
    '<div class="bilan-trips"><span class="bk">30 DERNIERS JOURS</span><div>' + cell(tp.count, 'trajet' + (tp.count > 1 ? 's' : '') + ' (journal)') + cell(tp.wet, 'sous la pluie') +
      cell(mo.cold, 'matin' + (mo.cold > 1 ? 's' : '') + ' sous 5 °C') + cell(mo.frost, 'matin' + (mo.frost > 1 ? 's' : '') + ' à risque de verglas') + '</div>' +
      '<small>Trajets de cette voiture enregistrés au journal · matins relevés au journal de saison' + (mo.days ? ' (' + mo.days + ' jour' + (mo.days > 1 ? 's' : '') + ')' : ' (aucun matin enregistré)') + '.</small>' +
      '<small>' + (cons ? 'Consommation réelle : ' + esc(cons.litresPer100.toFixed(1).replace('.', ',')) + ' L/100 km (du ' + bilanDm(cons.startDate) + ' au ' + bilanDm(cons.endDate) + ')' : 'Consommation réelle : après deux pleins complets saisis (ticket et compteur).') + '</small></div></div>';
  // 3. Tes pneus dans le temps (voiture analysée)
  const st = hasTires(car) ? tyreStateOf(car) : null, tire = car.tire || {};
  let tyres;
  if (!st) tyres = '<div class="bilan-card" data-bilan="tyres"><div class="bilan-h"><h3>Tes pneus dans le temps</h3></div><p class="sub">Monte active inconnue : renseigne les pneus montés pour suivre leur âge, leur usure et les départs du matin.</p>' +
    '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(car.id) + '" data-garage-target="model">Renseigner les pneus</button></div>';
  else {
    const w = Bilan.wear(wearInfo(car)), cal = Bilan.calendar(bilanMornings(today), effType(car), 14);
    const wearHead = w.kind === 'projection' ? w.thr + ' mm vers ' + esc(bilanMonth(w.date)) : w.kind === 'km' ? w.thr + ' mm vers ' + esc(garageKm(Math.round(w.kmThr / 100) * 100)) : w.kind === 'one' ? 'Une mesure : ' + esc(String(w.mm).replace('.', ',')) + ' mm' : 'Mesure nécessaire';
    const wearNote = w.kind === 'projection' ? (w.kmLegal != null ? '1,6 mm (minimum légal) vers ' + esc(garageKm(Math.round(w.kmLegal / 100) * 100)) + ' · ' : '') + 'usure ' + esc(w.rate.toFixed(2).replace('.', ',')) + ' mm / 1 000 km'
      : w.kind === 'km' ? 'Date : rythme du compteur à calculer · usure ' + esc(w.rate.toFixed(2).replace('.', ',')) + ' mm / 1 000 km'
      : w.kind === 'one' ? 'Relevé du ' + bilanDm(w.date) + ' · une deuxième mesure, au moins 1 000 km plus tard, donne l’usure et la date de remplacement'
      : 'Deux mesures de profondeur espacées d’au moins 1 000 km donnent l’usure et la date de remplacement (' + (w.thr || 3) + ' mm, puis 1,6 mm légal).';
    const dows = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], dow = d => dows[new Date(d + 'T12:00:00Z').getUTCDay()];
    const kind = effType(car), lvTxt = { ok: 'pneus adaptés', limit: kind === 'winter' ? 'douceur pour des pneus hiver' : 'limite', cold: 'trop froid pour la monte', unknown: 'inconnu' };
    const calHtml = cal.rows.length ? '<div class="bilan-cal" role="list">' + cal.rows.map(x => '<div role="listitem" data-level="' + x.level + '" title="' + esc(dow(x.date) + ' ' + bilanDm(x.date) + ' · ' + (x.T == null ? '—' : f0(x.T) + ' °C') + ' · ' + lvTxt[x.level]) + '" style="background:' + BILAN_LEVEL[x.level] + '">' +
        '<span>' + dow(x.date) + '</span><b>' + (x.T == null ? '—' : String(Math.round(x.T)).replace('-', '−') + '°') + '</b><span class="sr-sep"> · ' + lvTxt[x.level] + '</span></div>').join('') + '</div>' +
        '<div class="bilan-leg"><span><i style="background:' + BILAN_LEVEL.ok + '"></i>pneus adaptés</span><span><i style="background:' + BILAN_LEVEL.limit + '"></i>' + (kind === 'winter' ? 'douceur' : 'limite') + '</span>' + (kind === 'winter' ? '' : '<span><i style="background:' + BILAN_LEVEL.cold + '"></i>trop froid pour la monte</span>') + '</div>' +
        '<small>' + (kind === 'summer' || kind === 'unknown' ? (cal.cold + cal.limit ? (cal.cold + cal.limit) + ' départ' + (cal.cold + cal.limit > 1 ? 's' : '') + ' sur ' + cal.rows.length + ' sous 7 °C en pneus été' + (cal.cold ? ' (dont ' + cal.cold + ' sous 3 °C)' : '') : 'Tous les départs au-dessus de 7 °C') : kind === 'winter' ? (cal.limit ? cal.limit + ' départ' + (cal.limit > 1 ? 's' : '') + ' à 20 °C ou plus : usure accrue des pneus hiver' : 'Tous les départs dans la plage des pneus hiver') : 'Pneus 4 saisons : polyvalents sur ces départs') + ' · départ habituel à ' + esc(String(S.work.dep || '').slice(0, 5)) + '.</small>'
      : '<p class="sub">Prévisions indisponibles pour les prochains départs.</p>';
    tyres = '<div class="bilan-card" data-bilan="tyres"><div class="bilan-h"><h3>Tes pneus dans le temps</h3><span>' + esc((TYPE_LABEL[tire.type] || '').toUpperCase()) + '</span></div>' +
      '<p class="bilan-tyre"><b>' + esc([tire.brand, tire.model].filter(Boolean).join(' ') || 'Modèle non renseigné') + (tire.size ? ' · ' + esc(tire.size) : '') + '</b>' +
      '<small>' + esc([st.dot ? st.dot.txt : 'DOT non renseigné', st.mount && st.mount.date ? 'monté le ' + fmtDay(st.mount.date) : 'date de montage non renseignée'].join(' · ')) + '</small></p>' +
      '<div class="bilan-wear"><span class="bk">REMPLACEMENT ESTIMÉ</span><b>' + wearHead + '</b><small>' + wearNote + '</small>' +
      '<button type="button" class="btn sm" data-act="garage-quick" data-car="' + esc(car.id) + '" data-garage-target="tread">Mesurer la profondeur</button></div>' +
      '<div class="bilan-days"><span class="bk">PROCHAINS DÉPARTS DU MATIN</span>' + calHtml + '</div></div>';
  }
  return '<section class="bilan" aria-label="Mon bilan"><div class="bilan-top"><span class="bk">ANALYSE · MON BILAN</span><h2>Où en sont tes voitures</h2></div>' + todo + stats + tyres + '</section>';
}
