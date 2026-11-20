// Trajets imprévus (20/11/2026, maquettes validées) : quelqu'un d'autre part avec une des voitures. Données dans S.loans
// (réglages chiffrés, sauvegardés et synchronisés comme le reste). Jamais un trajet de l'utilisateur : aucune position,
// aucune journée, aucun suivi GPS modifiés ; seuls la feuille de route, la voiture occupée et la météo du trajet en tiennent compte.
const LOAN_FORM = { open: false, carId: null, driver: '', originId: null, query: '', results: [], hit: null, dep: 'now', depTime: '', ret: 'time', retTime: '', message: '', searching: null, gen: 0 };
const loanNowTs = () => liveNow().slice(0, 16);
const loanList = () => Array.isArray(S.loans) ? S.loans : [];
const loanCar = id => S.cars.find(c => c.id === id) || null;
const loanCarName = id => { const c = loanCar(id); return c ? c.short || c.name || id : id; };
// Voiture partie avec quelqu'un (prêt ouvert, départ passé ou dans 30 min) : null sinon.
const loanBusy = carId => RcLoans.busy(loanList(), carId, loanNowTs());
function loanSaveList(list) {
  S.loans = RcLoans.clean(list, S.cars.map(c => c.id), Date.now());
  markEdit('loans'); saveSettings();
}
// Trajets d'un prêt avec route et météo du parcours (même machine que les trajets saisis : itinéraire, legEval), évalués pour
// la voiture PRÊTÉE seulement. Les trajets rentrés restent listés (état « terminé ») jusqu'à la purge de 48 h.
function loanTrips() {
  const out = [];
  loanList().forEach(x => RcLoans.legs(x).forEach(g => {
    const l0 = { k: 'local', from: g.from, to: g.to, navTo: g.to, dep: g.dep, arr: addMin(g.dep, 30), min: 30, pts: [], manual: true };
    const ready = typeof tripCancelRouteLeg === 'function' ? tripCancelRouteLeg({ id: g.key, s: g.dep, manual: true }, { ...l0, originPending: true }) : l0;
    const r = !ready.originPending && typeof legEval === 'function' ? legEval(ready) : {};
    // Verdict pour la voiture PRÊTÉE (legEval n'évalue que la voiture active de l'utilisateur quand elle est choisie).
    const car = loanCar(x.carId), w = car && Array.isArray(r.seq) && r.seq.length && typeof windowAssess === 'function' ? windowAssess(car, r.seq, 'trip') : null;
    const res = w ? [{ c: car, w }] : [];
    out.push({ src: 'loan', key: g.key, loanId: x.id, leg: g.k, driver: x.driver, carId: x.carId, back: x.back, dep: g.dep,
      arr: Number.isFinite(ready.min) && !ready.originPending ? addMin(g.dep, ready.min) : null, l: ready,
      from: g.from.name, to: g.to.name, name: (g.k === 'ret' ? 'Retour · ' : 'Aller · ') + x.driver,
      res: res.length ? res : null, sum: r.sum || null, seq: r.seq || [], wait: !res.length, worst: res.length ? res[0].w.level : null });
  }));
  return out;
}
// Bandeau « 308 · PARTIE AVEC … » (onglet Trajet) : un par prêt ouvert dont le départ est passé ou imminent.
function loanBannerHtml() {
  const now = loanNowTs();
  return RcLoans.open(loanList()).filter(x => x.dep <= RcLoans.addMinutes(now, 30)).map(x =>
    '<div class="ln-busy" role="group" aria-label="' + esc(loanCarName(x.carId) + ' partie avec ' + x.driver) + '"><span><b>' + esc((loanCarName(x.carId) + ' · partie avec ' + x.driver).toUpperCase()) + '</b><small>' +
    esc(x.from.name + ' → ' + x.to.name + ' · depuis ' + x.dep.slice(11, 16) + (x.ret ? ' · retour prévu ' + (x.ret.slice(0, 10) === now.slice(0, 10) ? '' : fmtDay(x.ret.slice(0, 10)) + ' ') + x.ret.slice(11, 16) : ' · retour à confirmer')) +
    '</small></span><button type="button" class="btn pri" data-act="loan-back" data-id="' + esc(x.id) + '">' + esc('Rentré·e') + '</button></div>').join('');
}
// Encadré « À dire à … » : le trajet d'un autre conducteur a un risque (même tripRisk que le mur) ; meilleur départ s'il existe.
function loanAdviceHtml(t) {
  if (!t || t.src !== 'loan' || t.back) return '';
  const r = typeof tripRisk === 'function' && t.seq && t.seq.length ? tripRisk(t) : null;
  if (!r || r.indet || !Number.isInteger(r.lv) || r.lv < 1) return '';
  let best = '';
  try { const o = F1Pure.departureOptions(t.seq, { shifts: [-2, -1, 1, 2] }); if (o && o.best) best = ' Partir à ' + addMin(t.dep, o.best.shift * 60).slice(11, 16) + ' : ' + o.best.label.toLowerCase() + '.'; } catch (e) { best = ''; }
  return '<div class="ln-advice" data-lv="' + r.lv + '"><span aria-hidden="true">⚠</span><span><b>À dire à ' + esc(t.driver) + ' :</b> ' + esc(r.why || 'conditions à surveiller') + '.' + esc(best) + '</span></div>';
}
function loanFormHtml() {
  const f = LOAN_FORM;
  if (!f.open) return '<button type="button" class="btn ln-open" data-act="loan-open">+ Trajet imprévu <span class="sub">quelqu’un part avec une voiture</span></button>';
  const cars = S.cars.filter(c => hasTires(c) || true);
  if (!f.carId || !cars.some(c => c.id === f.carId)) f.carId = cars[0] && cars[0].id || null;
  const places = placeList().filter(p => !/^manual-(?:origin|destination)$/.test(p.id || ''));
  if (!f.originId || !places.some(p => p.id === f.originId)) f.originId = (places.find(p => p.kind === 'home') || places[0] || {}).id || null;
  // Attributs écrits en clair (l'audit des commandes relit le code source) : data-act="loan-car", data-act="loan-dep", data-act="loan-ret".
  const ACT = { 'loan-car': 'data-act="loan-car"', 'loan-dep': 'data-act="loan-dep"', 'loan-ret': 'data-act="loan-ret"' };
  const chip = (act, v, on, label) => '<button type="button" class="chip" ' + ACT[act] + ' data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
  const hits = (f.results || []).map((h, i) => '<button type="button" class="trip-suggestion" data-act="loan-pick" data-i="' + i + '"><b>' + esc(h.name) + '</b><span>' + esc(h.sub || h.address || '') + '</span></button>').join('');
  return '<section class="ln-form" aria-label="Trajet imprévu"><div class="ln-h"><b>TRAJET IMPRÉVU</b><span>quelqu’un part avec une voiture</span></div>' +
    '<span class="trip-label">Voiture</span><div class="chips">' + cars.map(c => chip('loan-car', c.id, f.carId === c.id, c.short || c.name || c.id)).join('') + '</div>' +
    '<label class="trip-label" for="loanDriver">Conducteur</label><input id="loanDriver" maxlength="40" value="' + esc(f.driver) + '" placeholder="Prénom" autocomplete="off">' +
    '<label class="trip-label" for="loanOrigin">Départ de</label><select id="loanOrigin">' + places.map(p => '<option value="' + esc(p.id) + '"' + (f.originId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
    '<label class="trip-label" for="loanQ">Destination</label><div class="trip-search"><input type="search" id="loanQ" value="' + esc(f.query) + '" placeholder="Ville ou adresse"><button type="button" class="btn" data-act="loan-search">Rechercher</button></div>' +
    '<div class="trip-suggestions">' + hits + '</div>' + (f.hit ? '<div class="trip-selected"><b>✓ ' + esc(f.hit.name) + '</b><span>' + esc(f.hit.address || f.hit.sub || '') + '</span></div>' : '') +
    '<span class="trip-label">Départ</span><div class="chips">' + chip('loan-dep', 'now', f.dep === 'now', 'Maintenant') + chip('loan-dep', 'at', f.dep === 'at', 'À une heure') + '</div>' +
    (f.dep === 'at' ? '<label class="sr-only" for="loanDepTime">Heure de départ</label><input type="time" id="loanDepTime" value="' + esc(f.depTime) + '">' : '') +
    '<span class="trip-label">Retour (facultatif)</span><div class="chips">' + chip('loan-ret', 'time', f.ret === 'time', 'Heure prévue') + chip('loan-ret', 'none', f.ret === 'none', 'À confirmer') + '</div>' +
    (f.ret === 'time' ? '<label class="sr-only" for="loanRetTime">Heure de retour</label><input type="time" id="loanRetTime" value="' + esc(f.retTime) + '">' : '') +
    (f.message ? '<p class="trip-message" role="status">' + esc(f.message) + '</p>' : '') +
    '<div class="ln-actions"><button type="button" class="btn pri" data-act="loan-save">Enregistrer le trajet</button><button type="button" class="btn" data-act="loan-cancel">Annuler</button></div>' +
    '<p class="sub">Ta position et ta journée ne changent pas : c’est le trajet de quelqu’un d’autre. Aucun suivi GPS.</p></section>';
}
function loanCapture() {
  const v = id => { const el = document.getElementById(id); return el ? el.value : null; };
  const d = v('loanDriver'); if (d != null) LOAN_FORM.driver = d;
  const o = v('loanOrigin'); if (o != null) LOAN_FORM.originId = o;
  const q = v('loanQ'); if (q != null) { if (q !== LOAN_FORM.query) { LOAN_FORM.hit = null; } LOAN_FORM.query = q; }
  const a = v('loanDepTime'); if (a != null) LOAN_FORM.depTime = a;
  const r = v('loanRetTime'); if (r != null) LOAN_FORM.retTime = r;
}
async function loanSearch(button) {
  loanCapture();
  const q = LOAN_FORM.query.trim(), gen = ++LOAN_FORM.gen;
  if (q.length < 2) { LOAN_FORM.message = 'Saisis au moins deux caractères.'; renderTripView(); return; }
  if (offlineNow()) { LOAN_FORM.message = 'Recherche d’adresse indisponible hors connexion.'; renderTripView(); return; }
  if (button) button.textContent = 'Recherche…';
  try { const out = await geocode(q); if (gen !== LOAN_FORM.gen) return; LOAN_FORM.results = out; LOAN_FORM.message = out.length ? '' : 'Aucun résultat : précise la ville ou l’adresse.'; }
  catch (e) { if (gen !== LOAN_FORM.gen) return; LOAN_FORM.message = 'Recherche impossible pour le moment.'; }
  renderTripView();
}
// Enregistrement : conducteur, voiture, départ connu, destination CHOISIE dans les résultats (jamais devinée), heures valides.
function loanSave() {
  loanCapture();
  const f = LOAN_FORM, now = loanNowTs(), today = now.slice(0, 10), origin = locById(f.originId);
  const hm = v => /^\d{2}:\d{2}$/.test(v || '') ? v : null;
  const dep = f.dep === 'now' ? now : hm(f.depTime) ? today + 'T' + hm(f.depTime) : null;
  let ret = f.ret === 'time' ? (hm(f.retTime) ? today + 'T' + hm(f.retTime) : null) : null;
  if (ret && dep && ret <= dep) ret = RcLoans.addMinutes(ret, 1440);   // retour après minuit : le lendemain
  const fail = m => { f.message = m; renderTripView(); return false; };
  if (!f.driver.trim()) return fail('Indique le conducteur.');
  if (!origin || !locHasCoords(origin)) return fail('Choisis un départ connu.');
  if (!f.hit || !Number.isFinite(f.hit.lat) || !Number.isFinite(f.hit.lon)) return fail('Recherche la destination puis choisis un résultat.');
  if (!dep) return fail('Indique l’heure de départ.');
  if (f.ret === 'time' && !ret) return fail('Indique l’heure de retour ou choisis « À confirmer ».');
  if (loanBusy(f.carId)) return fail(loanCarName(f.carId) + ' est déjà partie : confirme d’abord son retour.');
  let x;
  try { x = RcLoans.make({ carId: f.carId, driver: f.driver, from: { id: origin.id, name: origin.name, lat: origin.lat, lon: origin.lon },
    to: { name: f.hit.name, lat: f.hit.lat, lon: f.hit.lon, address: f.hit.address || f.hit.sub || '' }, dep, ret }, Date.now()); }
  catch (e) { return fail('Trajet incomplet : vérifie le conducteur, la destination et les heures.'); }
  loanSaveList([...loanList(), x]);
  Object.assign(LOAN_FORM, { open: false, driver: '', query: '', results: [], hit: null, dep: 'now', depTime: '', ret: 'time', retTime: '', message: '' });
  rebuild(); renderAll(); if (!offlineNow()) refreshAll();
  return true;
}
function loanBack(id) {
  const list = loanList().map(x => x.id === id && !x.back ? { ...x, back: Date.now() } : x);
  if (list.every((x, i) => x === loanList()[i])) return false;
  loanSaveList(list); rebuild(); renderAll(); return true;
}
// Choix d'un bouton du formulaire (voiture, départ, retour) : saisie en cours conservée, focus rendu au bouton redessiné.
function loanChoose(field, act, t) {
  loanCapture(); LOAN_FORM[field] = t.dataset.v; LOAN_FORM.message = ''; renderTripView();
  const back = document.querySelector('#secTrip [data-act="' + act + '"][data-v="' + CSS.escape(t.dataset.v) + '"]'); if (back) back.focus({ preventScroll: true });
}

// Répartition des voitures (20/11, maquette validée) : ton prochain trajet et un trajet imprévu le même jour, aux heures qui se
// chevauchent. Les deux répartitions possibles sont évaluées avec la météo de CHAQUE parcours (windowAssess, mode trajet) :
// conseil = pire niveau le plus bas, puis somme des niveaux, puis meilleur total d'indice pneus. Rien n'est appliqué sans appui.
const SPLIT = { key: null, pick: null };
function loanSplit() {
  const snap = APP_CONTEXT.snapshot || {}, u = snap.activeTrip || snap.nextTrip, mine = appActiveCar() || appDisplayedCar && appDisplayedCar();
  if (!u || !u.dep || !Array.isArray(u.seq) || !u.seq.length || !mine) return null;
  const uEnd = u.arr || RcLoans.addMinutes(u.dep.slice(0, 16), 60);
  const legs = loanTrips().filter(t => t.leg === 'go' && !t.back && t.dep.slice(0, 10) === u.dep.slice(0, 10));
  const x = legs.map(t => ({ t, loan: loanList().find(l => l.id === t.loanId) })).find(({ t, loan }) => loan &&
    t.dep < uEnd && (loan.ret || RcLoans.addMinutes(t.dep, 12 * 60)) > u.dep.slice(0, 16));
  if (!x || !Array.isArray(x.t.seq) || !x.t.seq.length) return null;
  const other = S.cars.find(c => c.id !== mine.id && hasTires(c)), loanCarNow = loanCar(x.loan.carId);
  if (!other || !loanCarNow) return null;
  const pairs = [[mine, loanCarNow.id === mine.id ? other : loanCarNow], [loanCarNow.id === mine.id ? other : loanCarNow, mine]];
  const opts = pairs.map(([a, b]) => {
    const wa = windowAssess(a, u.seq, 'trip'), wb = windowAssess(b, x.t.seq, 'trip');
    if (!wa || !wb || !Number.isInteger(wa.level) || !Number.isInteger(wb.level)) return null;
    return { me: a, them: b, wa, wb, worst: Math.max(wa.level, wb.level), sum: wa.level + wb.level, score: (wa.score || 0) + (wb.score || 0) };
  });
  if (opts.some(o => !o)) return null;
  const best = opts.slice().sort((p, q) => p.worst - q.worst || p.sum - q.sum || q.score - p.score)[0];
  const key = u.key + '|' + x.loan.id;
  if (SPLIT.key !== key) { SPLIT.key = key; SPLIT.pick = null; }
  return { u, t: x.t, loan: x.loan, opts, best, double: loanCarNow.id === mine.id,
    applied: opts.findIndex(o => o.me.id === mine.id && o.them.id === x.loan.carId) };
}
function loanSplitHtml() {
  let sp = null; try { sp = loanSplit(); } catch (e) { sp = null; }
  if (!sp) return '';
  const names = ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'], nm = c => c.short || c.name || c.id;
  const pick = SPLIT.pick != null ? SPLIT.pick : sp.opts.indexOf(sp.best);
  const why = o => { const w = o.wa.level >= o.wb.level ? o.wa : o.wb, who = o.wa.level >= o.wb.level ? 'ton trajet' : 'le trajet de ' + sp.loan.driver;
    return w.level ? 'Point le plus délicat : ' + who + ' (' + names[w.level].toLowerCase() + ')' : 'Aucun signal notable sur les deux trajets'; };
  const row = (o, i) => '<button type="button" class="sp-opt" data-act="split-pick" data-i="' + i + '" aria-pressed="' + (i === pick) + '">' +
    '<span class="sp-top"><b>' + (o === sp.best ? 'CONSEILLÉ' : 'AUTRE CHOIX') + (i === sp.applied ? ' · ACTUEL' : '') + '</b><span data-lv="' + o.worst + '">PIRE RISQUE : ' + names[o.worst] + '</span></span>' +
    '<span class="sp-grid"><span>Toi · ' + esc(tripHm(sp.u.dep)) + '</span><b data-lv="' + o.wa.level + '">' + esc(nm(o.me)) + ' · ' + names[o.wa.level] + '</b>' +
    '<span>' + esc(sp.loan.driver) + ' · ' + esc(tripHm(sp.t.dep)) + '</span><b data-lv="' + o.wb.level + '">' + esc(nm(o.them)) + ' · ' + names[o.wb.level] + '</b></span>' +
    '<small>' + esc(why(o)) + '</small></button>';
  const sel = sp.opts[pick], same = pick === sp.applied;
  return '<section class="sp-box" aria-label="Qui prend quelle voiture"><div class="sp-h"><b>QUI PREND QUELLE VOITURE ?</b><span>2 trajets en même temps</span></div>' +
    (sp.double ? '<p class="sp-warn" role="status">La même voiture est prévue pour les deux trajets : choisis une répartition.</p>' : '') +
    sp.opts.map(row).join('') +
    '<button type="button" class="sp-apply" data-act="split-apply" data-i="' + pick + '"' + (same ? ' disabled' : '') + '>' +
    (same ? 'RÉPARTITION ACTUELLE' : 'APPLIQUER : TOI ' + esc(nm(sel.me).toUpperCase()) + ' · ' + esc(sp.loan.driver.toUpperCase()) + ' ' + esc(nm(sel.them).toUpperCase())) + '</button>' +
    '<p class="sub">Rien n’est appliqué sans ton appui. Calcul : météo de chaque parcours et pneus de chaque voiture.</p></section>';
}
function loanSplitApply(i) {
  let sp = null; try { sp = loanSplit(); } catch (e) { sp = null; }
  const o = sp && sp.opts[i]; if (!o) return false;
  if (appSetCar(o.me.id) === false) return false;
  loanSaveList(loanList().map(x => x.id === sp.loan.id ? { ...x, carId: o.them.id } : x));
  SPLIT.pick = null; rebuild(); renderAll(); return true;
}
