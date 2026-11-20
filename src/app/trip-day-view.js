// Onglet Trajet · lot 1 (maquettes validées le 20/11/2026) : feuille de route du jour, créneau de départ, briefing copilote.
// Lecture des trajets déjà construits (BRF_SHOWN, BRF_TRIPS, trajets du jour reconstruits) : aucune autre source de vérité.
// Seule écriture : « Décaler le départ » d'un trajet SAISI dans l'onglet, par la même fonction que « Mettre à jour le trajet ».
// Les trajets domicile-travail et agenda restent en simulation : leur horaire vient des réglages ou de l'agenda.
const FR = { open: null, focus: null };
const SLOT = { key: null, sel: null, undo: null };
const BRIEF = { playing: false, idx: -1, rate: 1, key: null, gen: 0 };
const TRIP_LV_NAMES = ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'];
// Trajets du jour déjà partis : mêmes reconstructions que la confirmation d'arrivée (mêmes clés, mêmes données de planning).
function tripTodayPast(now) {
  const today = now.slice(0, 10), past = [];
  if (appWorkOn(today)) ['go', 'ret'].forEach(d => {
    if (today + 'T' + (d === 'go' ? S.work.dep : S.work.ret) > now) return;
    const r = appWorkTripData(d, 0);
    if (r && !r.err) past.push({ src: 'work', td: r, dep: r.dep, arr: r.arr, from: r.fromName, to: r.toName, name: appCommuteLabel(r), key: 'commute|' + r.dep + '|' + d });
  });
  if (typeof CAL !== 'undefined' && CAL && Array.isArray(CAL.events)) CAL.events.filter(e => calendarSpatial(e) && !calendarCancelled(e)).forEach(e => effLegs(e).forEach(l => {
    if (!l || !l.dep || l.dep > now || l.dep.slice(0, 10) !== today) return;
    past.push({ src: 'cal', dep: l.dep, planDep: l.dep, planL: l, l, arr: l.arr, name: (l.k === 'ret' ? 'Retour' : 'Aller') + ' · ' + calTitle(e.t),
      from: l.from ? l.from.city || l.from.label : 'Origine', to: l.to ? l.to.city || l.to.label : 'Destination', key: calendarTripKey(e, l) });
  }));
  return past;
}
function tripUnion(extra) {
  const seen = new Set();
  return [...(Array.isArray(BRF_SHOWN) ? BRF_SHOWN : []), ...(Array.isArray(BRF_TRIPS) ? BRF_TRIPS : []), ...(extra || [])]
    .filter(t => t && t.key && t.dep && !seen.has(t.key) && seen.add(t.key));
}
const tripHm = ts => typeof ts === 'string' && /T\d{2}:\d{2}/.test(ts) ? ts.slice(11, 16) : '';
const tripDur = m => !Number.isFinite(m) || m < 0 ? '' : m >= 60 ? Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0') : Math.round(m) + ' min';
// Distance et durée connues seulement : itinéraire calculé, sinon distance à vol d'oiseau majorée (même repère que l'Analyse).
function tripKmMin(t) {
  const l = t.l || t.planL, min = t.arr && t.dep ? liveMin(t.dep, t.arr) : null;
  if (l && !l.originPending && Number.isFinite(l.km)) return { km: l.km, min: Number.isFinite(l.min) ? l.min : min, est: false };
  const d = t.td && Number.isFinite(t.td.dist) ? t.td.dist * 1.3 : null;
  return { km: d, min: Number.isFinite(min) ? min : null, est: d != null };
}
function tripLv(t) {
  const r = t && t.seq && typeof tripRisk === 'function' ? tripRisk(t) : null;
  return r && !r.indet && Number.isInteger(r.lv) ? { lv: r.lv, why: r.why || '' } : null;
}
function tripDayList() {
  const now = liveNow(), today = now.slice(0, 10), done = USER_STORE.state.done || {};
  const list = tripUnion(tripTodayPast(now)).filter(t => t.dep.slice(0, 10) === today).sort((a, b) => a.dep.localeCompare(b.dep));
  let nextSeen = false;
  return list.map((t, i) => {
    const d = done[t.key], liveDone = LIVE.done && LIVE.done[t.key];
    let state = 'later';
    if (LIVE.key === t.key && LIVE.phase === 'active') state = 'live';
    else if (d || liveDone) state = d && /annul/i.test(String(d.reason || d.how || '')) ? 'cancel' : 'done';
    else if (t.dep <= now) state = 'past';
    else if (!nextSeen) { state = 'next'; nextSeen = true; }
    return { t, n: i + 1, state, at: d && Number.isFinite(d.at) ? d.at : null, risk: tripLv(t), size: tripKmMin(t) };
  });
}
function tripDayHtml() {
  const list = tripDayList(); if (list.length < 2) return '';
  if (FR.open && !list.some(x => x.t.key === FR.open)) FR.open = null;
  const km = list.reduce((s, x) => s + (Number.isFinite(x.size.km) ? x.size.km : 0), 0), min = list.reduce((s, x) => s + (Number.isFinite(x.size.min) ? x.size.min : 0), 0);
  const est = list.some(x => x.size.est || !Number.isFinite(x.size.km));
  const ended = list.filter(x => ['done', 'cancel', 'past'].includes(x.state)).length, ahead = list.filter(x => ['next', 'later', 'live'].includes(x.state));
  const worst = ahead.filter(x => x.risk).sort((a, b) => b.risk.lv - a.risk.lv || a.t.dep.localeCompare(b.t.dep))[0];
  const stateTxt = x => x.state === 'live' ? 'EN COURS'
    : x.state === 'done' ? '✓ ARRIVÉE CONFIRMÉE' + (x.at ? ' À ' + hmLocal(x.at) : '')
    : x.state === 'cancel' ? 'ANNULÉE'
    : x.state === 'past' ? 'PARTIE · ARRIVÉE NON CONFIRMÉE'
    : x.state === 'next' ? 'PROCHAINE · ' + cdSpan(x.t.dep.slice(0, 16)) : 'PRÉVUE';
  const src = t => t.src === 'work' ? 'domicile-travail' : t.src === 'cal' ? 'agenda' : 'saisi';
  const rows = [];
  list.forEach((x, i) => {
    const prev = list[i - 1];
    if (prev && prev.t.arr && x.t.dep) { const gap = liveMin(prev.t.arr, x.t.dep); if (gap > 0) rows.push('<div class="fr-gap"><span aria-hidden="true"></span>Sur place · ' + tripDur(gap) + '</div>'); }
    const t = x.t, open = FR.open === t.key, to = appTripPlace(t, 'to'), from = appTripPlace(t, 'from');
    const route = (from && from.name || t.from || 'Départ') + ' → ' + (to && to.name || t.to || 'Destination');
    const meta = [Number.isFinite(x.size.km) ? (x.size.est ? '~' : '') + f0(x.size.km) + ' km' : '', Number.isFinite(x.size.min) ? '~' + tripDur(x.size.min) : '', src(t)].filter(Boolean).join(' · ');
    const future = ['next', 'later'].includes(x.state);
    const detail = open ? '<div class="fr-more"><span>' + esc(x.risk ? (x.risk.why || 'Aucune cause identifiée sur ce trajet') : 'Verdict indisponible : météo du parcours pas encore reçue.') + '</span>' +
      '<small>' + esc((t.arr ? 'arrivée prévue ' + tripHm(t.arr) : '') + (t.name ? (t.arr ? ' · ' : '') + t.name : '')) + '</small>' +
      (future ? '<button type="button" class="fr-go" data-act="fr-focus" data-key="' + esc(t.key) + '"><span>Voir dans le mur des stands</span><span aria-hidden="true">→</span></button>' : '') + '</div>' : '';
    rows.push('<div class="fr-card" data-state="' + x.state + '"><button type="button" class="fr-head" data-act="fr-open" data-key="' + esc(t.key) + '" aria-expanded="' + open + '">' +
      '<span class="fr-n">ES ' + x.n + '</span><span class="fr-r"><b>' + esc(route) + '</b><small>' + esc(meta) + '</small></span>' +
      '<span class="fr-t"><b>' + esc(tripHm(t.dep)) + '</b><small data-lv="' + (x.risk ? x.risk.lv : 'x') + '">' + (x.risk ? TRIP_LV_NAMES[x.risk.lv] : '—') + '</small></span></button>' +
      '<span class="fr-state">' + stateTxt(x) + '</span>' + detail + '</div>');
  });
  const today = liveNow().slice(0, 10);
  return '<section class="fr-sheet" aria-label="Feuille de route du jour"><div class="fr-plate"><div class="fr-band"><span>FEUILLE DE ROUTE</span><span>' + esc(fmtDay(today).toUpperCase()) + '</span></div>' +
    '<div class="fr-sum"><b>' + list.length + ' SPÉCIALES' + (km > 0 ? ' · ' + (est ? '~' : '') + f0(km) + ' KM' : '') + '</b>' +
    '<span>' + [min > 0 ? '~' + tripDur(min) + ' de route' : '', ended ? ended + ' passée' + (ended > 1 ? 's' : '') : '', ahead.length ? ahead.length + ' à venir' : ''].filter(Boolean).join(' · ') + '</span>' +
    (worst && worst.risk.lv >= 1 ? '<span class="fr-worst" data-lv="' + worst.risk.lv + '">ÉTAPE LA PLUS DÉLICATE : ES ' + worst.n + ' · ' + TRIP_LV_NAMES[worst.risk.lv] + '</span>' : '') +
    '</div></div><div class="fr-list">' + rows.join('') + '</div><p class="sub">Lecture seule : la feuille ne crée ni ne modifie aucun trajet.</p></section>';
}
// Trajet affiché dans le mur des stands quand une spéciale à venir est choisie dans la feuille (état de vue, rien n'est écrit).
function tripDayFocusTrip() {
  if (!FR.focus) return null;
  const now = liveNow(), t = tripUnion().find(x => x.key === FR.focus && x.dep > now);
  if (!t) FR.focus = null;
  return t || null;
}
// Créneau de départ : la MÊME lecture que « Meilleur départ » (departureOptions), étendue à ±2 h, par heures entières (prévisions horaires).
function tripSlotsHtml(t) {
  if (!t || !t.seq || typeof F1Pure.departureOptions !== 'function') return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t.dep || '') || t.dep.slice(0, 16) <= liveNow().slice(0, 16) || t === APP_CONTEXT.snapshot.activeTrip || t.running) return '';
  const sources = typeof f1WeatherSources === 'function' ? f1WeatherSources(t.seq) : { known: false, ageMin: null };
  const opts = F1Pure.departureOptions(t.seq, { ageMin: sources.known ? sources.ageMin : null, shifts: [-2, -1, 1, 2] });
  if (!opts) return '';
  if (SLOT.key !== t.key) { SLOT.key = t.key; SLOT.sel = null; }
  const n = appDay().nextDestination, manual = !!(n && n.source === 'manual' && n.tripKey === t.key);
  const now = liveNow(), outbound = t.src === 'cal' && t.l && t.l.k !== 'ret';
  const list = opts.options.map(o => {
    const dep = o.dep || addMin(t.dep, o.shift * 60), arr = t.arr ? addMin(t.arr, o.shift * 60) : null;
    return { ...o, dep: dep.slice(0, 16), arr: arr && arr.slice(0, 16), past: dep.slice(0, 16) < addMin(now, -5).slice(0, 16), late: outbound && o.shift > 0 };
  });
  const best = opts.best ? opts.best.shift : null;
  if (SLOT.sel == null || !list.some(o => o.shift === SLOT.sel && o.available)) SLOT.sel = best != null ? best : 0;
  const sel = list.find(o => o.shift === SLOT.sel) || list.find(o => o.shift === 0);
  const cols = list.map(o => {
    const tag = o.shift === 0 ? 'PRÉVU' : o.shift === best ? 'MIEUX' : '';
    const lvAttr = o.available ? o.level : 'x';
    return '<button type="button" class="sl-col" data-act="slot-pick" data-s="' + o.shift + '" aria-pressed="' + (o.shift === SLOT.sel) + '"' + (o.available ? '' : ' disabled') +
      ' aria-label="' + esc('Départ ' + tripHm(o.dep) + (o.available ? ', ' + o.label : ', prévisions indisponibles') + (o.late ? ', arrivée après l’heure prévue' : '') + (o.past ? ', heure passée' : '')) + '">' +
      '<span class="sl-tag" data-k="' + (o.shift === 0 ? 'plan' : o.shift === best ? 'best' : '') + '">' + tag + '</span>' +
      '<span class="sl-bar" data-lv="' + lvAttr + '"' + (o.late || o.past ? ' data-off="1"' : '') + ' style="height:' + (22 + (o.available ? o.level : 0) * 12) + 'px"></span>' +
      '<b>' + esc(tripHm(o.dep)) + '</b></button>';
  }).join('');
  let detail = '';
  if (sel && sel.available) {
    const diff = sel.shift * 60, cause = sel.level ? sel.cause || '' : 'Aucun signal notable sur le parcours';
    const delta = sel.shift === 0 ? 'Horaire prévu' : (diff < 0 ? 'Départ ' + tripDur(-diff) + ' plus tôt' : 'Départ ' + tripDur(diff) + ' plus tard') + (sel.late ? ' · arrivée après l’heure prévue' : '');
    detail = '<div class="sl-detail" data-lv="' + sel.level + '"><div><b class="sl-hm">' + esc(tripHm(sel.dep) + (sel.arr ? ' → ' + tripHm(sel.arr) : '')) + '</b><b class="sl-lv" data-lv="' + sel.level + '">' + esc(sel.label) + '</b></div>' +
      '<span>' + esc(cause + (Number.isFinite(sel.rain) && sel.rain >= 0.2 ? ' · pluie max ' + f1(sel.rain) + ' mm/h' : '')) + '</span><small' + (sel.late ? ' class="sl-warn"' : '') + '>' + esc(delta) + '</small></div>';
  }
  let action = '';
  if (SLOT.undo && SLOT.undo.key === t.key) action = '<div class="sl-done" role="status"><b>DÉPART DÉCALÉ À ' + esc(tripHm(t.dep)) + '</b><span>Compte à rebours, mur des stands et briefing suivent la nouvelle heure.</span>' +
    '<button type="button" class="btn" data-act="slot-undo">Revenir à ' + esc(tripHm(SLOT.undo.dep)) + '</button></div>';
  else if (manual && sel && sel.shift !== 0) action = sel.past || !sel.available ? '<button type="button" class="sl-apply" disabled>' + (sel.past ? 'Heure déjà passée' : 'Prévisions indisponibles') + '</button>'
    : '<button type="button" class="sl-apply" data-act="slot-apply" data-s="' + sel.shift + '">Décaler le départ à ' + esc(tripHm(sel.dep)) + '</button>';
  else if (!manual) action = '<p class="sub">Simulation seulement : ' + (t.src === 'cal' ? 'l’heure vient de ton agenda' : t.src === 'work' ? 'l’horaire vient de tes réglages domicile-travail' : 'trajet planifié automatiquement') + ', rien n’est modifié ici.</p>';
  return '<section class="sl-box" aria-label="Créneau de départ"><div class="sl-h"><b>CRÉNEAU DE DÉPART</b><span>−2 h · +2 h</span></div>' +
    '<div class="sl-cols" role="group" aria-label="Heures de départ possibles">' + cols + '</div>' + detail + action +
    '<p class="sub">Même lecture que l’état de la piste, départ décalé d’heures entières · prévisions du modèle.</p></section>';
}
function tripSlotApply(shift) {
  const n = appDay().nextDestination, t = n && n.source === 'manual' ? APP_CONTEXT.trips.find(x => x.key === n.tripKey) : null;
  if (!t || !Number.isInteger(shift) || !shift) return false;
  const dep = addMin(n.dep, shift * 60).slice(0, 16);
  if (dep < addMin(liveNow(), -5).slice(0, 16)) return false;
  const before = n.dep;
  appProgramManualTrip({ originId: n.originPoint ? null : n.originId, originPoint: n.originPoint || null,
    destinationId: n.destinationPoint ? null : n.placeId, destinationPoint: n.destinationPoint || null, dep, carId: null });
  SLOT.undo = { key: n.tripKey, dep: before }; SLOT.sel = 0;
  TRIP_FORM.bound = null; rebuild(); renderAll(); if (!offlineNow()) refreshAll();
  return true;
}
function tripSlotUndo() {
  const n = appDay().nextDestination, u = SLOT.undo; SLOT.undo = null;
  if (!u || !n || n.source !== 'manual' || n.tripKey !== u.key) { renderAll(); return false; }
  appProgramManualTrip({ originId: n.originPoint ? null : n.originId, originPoint: n.originPoint || null,
    destinationId: n.destinationPoint ? null : n.placeId, destinationPoint: n.destinationPoint || null, dep: u.dep, carId: null });
  SLOT.sel = 0; TRIP_FORM.bound = null; rebuild(); renderAll(); if (!offlineNow()) refreshAll();
  return true;
}
// Briefing copilote : les MÊMES notes que le carnet de l'onglet Pneus (copilotNotes), lues seulement sur appui (jamais en arrière-plan).
function tripBriefNotes(t) {
  if (!t || !t.seq) return [];
  const sources = typeof f1WeatherSources === 'function' ? f1WeatherSources(t.seq) : { known: false, ageMin: null };
  const rows = F1Pure.routeTower(t.seq, { ageMin: sources.known ? sources.ageMin : null }), fz = typeof tripFrost === 'function' ? tripFrost(t) : null;
  const car = S.cars.find(c => c.id === (t.carId || appDay().activeCarId)) || appActiveCar();
  return F1Pure.copilotNotes(rows, { dep: t.dep, arr: t.arr, frost: fz && Number.isInteger(fz.fr.level) ? fz.fr.level : null, tyre: car ? effType(car) : null });
}
const tripSay = s => String(s).replace(/(\d),(\d)/g, '$1 virgule $2').replace(/mm\/h/g, 'millimètres par heure').replace(/km\/h/g, 'kilomètres heure')
  .replace(/\bkm\b/g, 'kilomètre').replace(/°C|°/g, ' degrés').replace(/−/g, 'moins ').replace(/·/g, ',');
function tripBriefHtml(t) {
  if (!t) return '';
  if (BRIEF.key !== t.key && BRIEF.playing) tripBriefStop();
  const notes = tripBriefNotes(t), to = appTripPlace(t, 'to');
  const play = BRIEF.playing && BRIEF.key === t.key;
  const body = notes.length ? '<ol class="bf-notes">' + notes.map((x, i) => '<li data-lv="' + (x.level == null ? 'x' : x.level) + '"' + (play && BRIEF.idx === i ? ' aria-current="true"' : '') + '><b>' + String(x.n).padStart(2, '0') + '</b><span>' + esc(x.text) + '</span></li>').join('') + '</ol>'
    : '<p class="sub">Briefing en attente : points météo du trajet pas encore reçus ou trop anciens.</p>';
  return '<section class="bf-box" aria-label="Briefing copilote"><div class="bf-h"><b>BRIEFING COPILOTE</b><span>' + esc((to && to.name || t.to || '') + (t.dep ? ' · départ ' + tripHm(t.dep) : '')) + '</span></div>' +
    (notes.length ? '<button type="button" class="bf-play" data-act="brief-play" data-key="' + esc(t.key || '') + '" aria-pressed="' + play + '"><span class="bf-ico" aria-hidden="true">' + (play ? '■' : '▶') + '</span><span><b>' + (play ? 'ARRÊTER LA LECTURE' : 'ÉCOUTER LE BRIEFING') + '</b><small>' +
      (play ? 'note ' + (BRIEF.idx + 1) + ' sur ' + notes.length : notes.length + ' note' + (notes.length > 1 ? 's' : '') + ' · lecture à voix haute') + '</small></span></button>' : '') + body +
    (notes.length ? '<div class="seg bf-rate" role="group" aria-label="Débit de lecture"><button type="button" data-act="brief-rate" data-v="1" aria-pressed="' + (BRIEF.rate === 1) + '">Débit normal</button><button type="button" data-act="brief-rate" data-v="0.8" aria-pressed="' + (BRIEF.rate !== 1) + '">Plus lent</button></div>' : '') +
    '<p class="sub">Lu seulement quand tu appuies. Tiré des prévisions du modèle, pas une mesure sur la route.</p></section>';
}
function tripBriefStop() {
  BRIEF.gen++; BRIEF.playing = false; BRIEF.idx = -1;
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* synthèse indisponible */ }
}
function tripBriefPlay(button, t) {
  if (BRIEF.playing) { tripBriefStop(); renderTripView(); return; }
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { commandFeedback(button, 'Lecture vocale indisponible'); return; }
  const notes = tripBriefNotes(t); if (!t || !notes.length) return;
  const from = appTripPlace(t, 'from'), to = appTripPlace(t, 'to');
  const lines = ['Briefing. ' + (from && from.name || t.from || 'Départ') + ' vers ' + (to && to.name || t.to || 'destination') + (t.dep ? ', départ ' + tripHm(t.dep).replace(':', ' heures ') : '') + '.', ...notes.map(n => n.text)];
  try { synth.cancel(); } catch (e) { /* rien à arrêter */ }
  const gen = ++BRIEF.gen; BRIEF.playing = true; BRIEF.key = t.key; BRIEF.idx = -1;
  const mark = i => { if (gen !== BRIEF.gen) return; BRIEF.idx = i; renderTripView(); };
  lines.forEach((line, i) => {
    const u = new SpeechSynthesisUtterance(tripSay(line));
    u.lang = 'fr-FR'; u.rate = BRIEF.rate === 1 ? 0.95 : 0.8;
    u.onstart = () => mark(i - 1);
    if (i === lines.length - 1) u.onend = u.onerror = () => { if (gen === BRIEF.gen) { BRIEF.playing = false; BRIEF.idx = -1; renderTripView(); } };
    synth.speak(u);   // geste utilisateur explicite, jamais au chargement ni en arrière-plan
  });
  renderTripView();
}
