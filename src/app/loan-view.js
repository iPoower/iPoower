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
    const res = Array.isArray(r.res) ? r.res.filter(z => z && z.c && z.c.id === x.carId) : [];
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
  const chip = (act, v, on, label) => '<button type="button" class="chip" data-act="' + act + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
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
