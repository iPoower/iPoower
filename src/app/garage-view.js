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
// Relevés enregistrés et correction : on n'efface jamais ; corriger = marqueur d'annulation + valeur juste (Garage.odoReplace).
const ODO_FIX = {}, ODO_FIX_STATUS = {};
function garageOdoList(raw, tr) {
  const id = esc(raw.id), live = Garage.odoLive(raw.odo).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.d || '') && Number.isFinite(o.km)).sort((a, b) => b.d.localeCompare(a.d));
  const voided = (Array.isArray(raw.odo) ? raw.odo : []).filter(o => o && o.void).length;
  if (!live.length && !voided) return '';
  const bad = new Set(tr.suspect ? [tr.suspect.d] : tr.nonMonotonic && tr.pair ? [tr.pair.from.d, tr.pair.to.d] : []);
  live.sort((a, b) => (bad.has(b.d) ? 1 : 0) - (bad.has(a.d) ? 1 : 0) || b.d.localeCompare(a.d) || b.km - a.km);
  // Même jour : seul le plus élevé compte (règle de Garage.odoSeries) ; les autres sont montrés « non comptés », corrigeables.
  const kept = new Set(), dup = o => { if (kept.has(o.d)) return true; const top = Math.max(...live.filter(x => x.d === o.d).map(x => x.km)); if (o.km === top) { kept.add(o.d); return false; } return true; };
  const dupOf = new Map(live.slice().sort((a, b) => b.km - a.km).map(o => [o, false]));
  kept.clear(); [...dupOf.keys()].forEach(o => dupOf.set(o, dup(o)));   // relevé(s) incohérent(s) en tête, puis du plus récent au plus ancien
  const row = o => {
    const flag = bad.has(o.d), same = dupOf.get(o), editing = ODO_FIX[raw.id] === o.d && !same, when = esc(o.d);
    const action = editing
      ? '<form class="odo-fix-form" data-odo-fix-form="' + id + '" data-d="' + when + '"><label>Kilométrage juste du ' + garageDate(o.d) +
        '<input name="km" inputmode="numeric" autocomplete="off" value="' + esc(o.km.toLocaleString('fr-FR')) + '"></label>' +
        '<button type="submit" class="btn sm pri">Enregistrer la correction</button>' +
        '<button type="button" class="btn sm" data-odo-fix-cancel="' + id + '">Fermer</button>' +
        '<p class="odo-fix-danger"><button type="button" class="btn sm odo-void" data-odo-void="' + id + '" data-d="' + when + '">Annuler ce relevé…</button>' +
        '<small>Il ne comptera plus ; il reste tracé comme annulé. Une confirmation est demandée.</small></p></form>'
      : '<button type="button" class="btn sm" data-odo-fix="' + id + '" data-d="' + when + '">Corriger</button>';
    return '<li class="' + (flag ? 'odo-bad' : same ? 'odo-dup' : '') + '" data-odo-day="' + when + '"' + (same ? ' data-odo-dup="1"' : '') + '><span>' + garageDate(o.d) + '</span><b>' + garageKm(o.km) + '</b>' +
      (flag ? '<em>⚠️ incohérent</em>' : same ? '<em>même jour · non compté</em>' : '') + (same ? '' : action) + '</li>';
  };
  return '<div class="odo-list"><h5>Relevés enregistrés</h5><p class="odo-fix-status" role="status">' + esc(ODO_FIX_STATUS[raw.id] || '') + '</p>' +
    (live.length ? '<ul>' + live.map(row).join('') + '</ul>' : '') +
    (voided ? '<p class="sub">' + voided + ' relevé' + (voided > 1 ? 's' : '') + ' corrigé' + (voided > 1 ? 's' : '') + ' ou annulé' + (voided > 1 ? 's' : '') + ' : conservé' + (voided > 1 ? 's' : '') + ' comme annulé' + (voided > 1 ? 's' : '') + ', jamais effacé' + (voided > 1 ? 's' : '') + '.</p>' : '') + '</div>';
}
async function odoPersist(car, next) {
  const ix = S.cars.indexOf(car);
  if (ix < 0 || LOCKED() || DEMO.on || DeviceStorage.isFrozen()) throw new Error('Garage indisponible : déverrouille Race Control.');
  const before = car.odo;
  car.odo = next; markEdit('cars.' + ix + '.odo');
  try {
    saveSettings();
    const saved = JSON.parse(lsGet('twrc.settings.v1') || 'null');
    if (!saved || !saved.cars || JSON.stringify(saved.cars[ix] && saved.cars[ix].odo) !== JSON.stringify(next)) throw new Error('relecture');
    const vs = window.TWRC_VAULT;
    if (vs && vs.mode === 'vault') { await vs.flush(); if (vs.error || vs.pendingRecovery) throw new Error('coffre'); }
  } catch (e) {
    car.odo = before; try { saveSettings(); } catch (x) { /* l'ancienne liste reste en mémoire */ }
    throw new Error('Enregistrement non confirmé : rien n’a été modifié. Réessaie.');
  }
}
function odoFixRefresh(carId, focus) {
  renderGarage.last = null; renderGarage();
  const fold = focus && document.querySelector('[data-garage-odo="' + CSS.escape(carId) + '"] details.ux-fold');
  if (fold && !fold.open) fold.open = true;   // « Corriger » depuis l'alerte : le volet s'ouvre sur la saisie
  if (focus) { const i = document.querySelector('[data-odo-fix-form="' + CSS.escape(carId) + '"] input[name=km]'); if (i) { i.focus({ preventScroll: true }); i.select(); const f = i.closest('li'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' }); } }
}
document.addEventListener('click', async event => {
  const t = event.target && event.target.closest && event.target.closest('[data-odo-fix],[data-odo-fix-cancel],[data-odo-void]');
  if (!t) return;
  event.preventDefault();
  if (t.dataset.odoFix) { ODO_FIX[t.dataset.odoFix] = t.dataset.d; ODO_FIX_STATUS[t.dataset.odoFix] = ''; odoFixRefresh(t.dataset.odoFix, true); return; }
  if (t.dataset.odoFixCancel) { delete ODO_FIX[t.dataset.odoFixCancel]; odoFixRefresh(t.dataset.odoFixCancel); return; }
  const carId = t.dataset.odoVoid, day = t.dataset.d, car = (S.cars || []).find(c => c && c.id === carId);
  const cur = car && Garage.odoLive(car.odo).find(o => o.d === day);
  if (!car || !cur) return;
  if (!confirm('Annuler le relevé du ' + day.slice(8) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4) + ' (' + cur.km.toLocaleString('fr-FR') + ' km) ?\n\nIl ne comptera plus dans les calculs ; il reste tracé comme annulé, sur tous tes appareils.')) return;
  try { await odoPersist(car, Garage.odoReplace(car.odo, day, null)); delete ODO_FIX[carId]; ODO_FIX_STATUS[carId] = 'Relevé du ' + garageDate(day) + ' annulé · enregistré dans le coffre.'; }
  catch (e) { ODO_FIX_STATUS[carId] = e.message || 'Enregistrement non confirmé.'; }
  odoFixRefresh(carId); softRender();
});
document.addEventListener('submit', async event => {
  const form = event.target, carId = form && form.dataset && form.dataset.odoFixForm;
  if (!carId) return;
  event.preventDefault();
  const day = form.dataset.d, car = (S.cars || []).find(c => c && c.id === carId), cur = car && Garage.odoLive(car.odo).find(o => o.d === day);
  if (!car || !cur) return;
  const dd = day.slice(8) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
  try {
    const km = GarageEconomics.parseKm(new FormData(form).get('km'));
    if (km == null) throw new Error('Saisis le kilométrage juste (nombre entier de kilomètres), ou « Annuler ce relevé ».');
    if (km === cur.km) { ODO_FIX_STATUS[carId] = 'Valeur identique : rien n’a été modifié.'; delete ODO_FIX[carId]; odoFixRefresh(carId); return; }
    // Même chronologie et même borne de vraisemblance que toute saisie (relevés, pleins, révision, montage).
    const clash = RcInbox.kmConflict({ ...car, odo: Garage.odoLive(car.odo).filter(o => o.d !== day) }, day, km);
    if (clash && !confirm('Ce kilométrage (' + km.toLocaleString('fr-FR') + ' km) contredit ' + clash.label + ' du ' + garageDate(clash.d) + ' (' + Number(clash.km).toLocaleString('fr-FR') + ' km).\n\nCorriger quand même ?')) return;
    const jump = !clash && Garage.kmJump(car, day, km);
    if (jump && !confirm('Ce kilométrage implique ≈ ' + jump.kmPerDay.toLocaleString('fr-FR') + ' km par jour par rapport au relevé du ' + garageDate(jump.d) + ' (' + Number(jump.km).toLocaleString('fr-FR') + ' km).\n\nCorriger quand même ?')) return;
    if (!confirm('Corriger le relevé du ' + dd + ' : ' + cur.km.toLocaleString('fr-FR') + ' km → ' + km.toLocaleString('fr-FR') + ' km ?\n\nL’ancienne valeur reste tracée comme annulée, sur tous tes appareils.')) return;
    await odoPersist(car, Garage.odoReplace(car.odo, day, km));
    delete ODO_FIX[carId]; ODO_FIX_STATUS[carId] = 'Relevé du ' + dd + ' corrigé : ' + km.toLocaleString('fr-FR') + ' km · enregistré dans le coffre.';
  } catch (e) { ODO_FIX_STATUS[carId] = e.message || 'Enregistrement non confirmé.'; }
  odoFixRefresh(carId); softRender();
});
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
      '<li><span>' + (Garage.odoLive(raw.odo).length > tr.count ? 'Jours relevés' : 'Relevés') + '</span><b>' + tr.count + '</b><small>depuis le ' + garageDate(tr.first.d) + '</small></li>' +
      '<li><span>Parcourus</span><b>' + (tr.totalKm != null ? garageKm(tr.totalKm) : '—') + '</b><small>entre le premier et le dernier relevé</small></li>' +
      '<li><span>12 derniers mois</span><b>' + (tr.last12 != null ? garageKm(tr.last12) : '—') + '</b><small>' + (tr.last12 != null ? 'd’après les relevés' : 'historique de moins d’un an') + '</small></li>' +
      '<li><span>Rythme</span><b>' + (tr.kmPerYear ? garageKm(Math.round(tr.kmPerYear / 100) * 100) + '/an' : '—') + '</b><small>' + (tr.kmPerDay ? '≈ ' + Math.round(tr.kmPerDay).toLocaleString('fr-FR') + ' km/j' : 'à calculer') + '</small></li></ul>'
    : '<p class="garage-empty">Aucun relevé du compteur : la courbe apparaîtra dès le premier relevé (« Compteur km » ci-dessus).</p>';
  // Relevé invraisemblable (compteur qui recule ou saut > 1 500 km/j) : jamais effacé, écarté des calculs s'il est seul en cause.
  const pr = tr.pair, jump = pr ? (pr.to.km < pr.from.km ? 'le compteur recule' : '≈ ' + pr.kmPerDay.toLocaleString('fr-FR') + ' km/j') : '';
  const warnText = tr.suspect
    ? '⚠️ Relevé du ' + garageDate(tr.suspect.d) + ' (' + garageKm(tr.suspect.km) + ') écarté des calculs : incohérent avec les autres relevés (' + jump +
      ' entre le ' + garageDate(pr.from.d) + ' et le ' + garageDate(pr.to.d) + '). Un chiffre manque ou est en trop ? Il reste enregistré dans la fiche.'
    : tr.nonMonotonic && pr
      ? '⚠️ Relevés incohérents : ' + garageDate(pr.from.d) + ' (' + garageKm(pr.from.km) + ') puis ' + garageDate(pr.to.d) + ' (' + garageKm(pr.to.km) + '), ' + jump +
        '. Impossible de savoir lequel est faux : courbe et rythme suspendus.'
      : '';
  const warn = warnText ? '<p class="odo-warn" role="status">' + warnText + '</p>' : '';
  const mode = g && g.life ? 'life' : t ? 'km' : 'none';
  const form = '<form class="odo-goal-form" data-odo-goal="' + id + '"><label>Objectif<select name="mode">' +
      [['none', 'Aucun'], ['km', 'Kilométrage cible'], ['life', 'À vie (sans limite)']].map(([v, l]) => '<option value="' + v + '"' + (v === mode ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></label><label data-odo-goal-km' + (mode === 'km' ? '' : ' hidden') + '>Kilométrage cible (km)<input name="km" inputmode="numeric" autocomplete="off" placeholder="ex. 250 000" value="' + (t ? esc(t.km.toLocaleString('fr-FR')) : '') + '"></label>' +
      '<button type="submit" class="btn sm pri">Enregistrer l’objectif</button><p class="odo-goal-status" role="status">' + esc(ODO_GOAL_STATUS[raw.id] || '') + '</p></form>';
  return '<section class="garage-odo" data-garage-odo="' + id + '">' + head + (warn ? '<p class="odo-warn odo-warn-head" data-odo-suspect>' +
      (tr.suspect ? '⚠️ 1 relevé incohérent écarté des calculs (' + garageDate(tr.suspect.d) + ', ' + garageKm(tr.suspect.km) + ') ' +
        '<button type="button" class="btn sm" data-odo-fix="' + id + '" data-d="' + esc(tr.suspect.d) + '">Corriger</button>' : '⚠️ Relevés incohérents : calculs suspendus') + '</p>' : '') +
    uxFold('garage-odo-' + raw.id, '📈 Évolution du kilométrage', warn + garageOdoChart(tr) + stats + garageOdoList(raw, tr) + form, (n => (n ? n + ' relevé' + (n > 1 ? 's' : '') + ' · ' : '') + (t ? 'objectif ' + garageKm(t.km) : g && g.life ? 'objectif à vie' : 'aucun objectif'))(Garage.odoLive(raw.odo).length)) + '</section>';
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
