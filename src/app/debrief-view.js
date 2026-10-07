/* Arrivée et débrief : même transaction canonique pour les quatre onglets. */
function debriefDeparture(t, s) {
  if (DEMO.on) return;
  const car = labCar(), seq = t.seq || [], hours = seq.map(q => q.hs && q.hs[q.i]).filter(Boolean);
  const sources = [
    ...Object.values(M).filter(Boolean).map(m => ({ m, at: RAW[m.id] && RAW[m.id].t })),
    ...Object.entries(MIDM).filter(([, m]) => m).map(([id, m]) => ({ m, at: MIDP[id] && MIDP[id].t })),
    ...Object.values(CALM).map(c => ({ m: c.m, at: c.t })),
    ...Object.values(LEGM).flatMap(c => (c.models || []).map(m => ({ m, at: c.t })))
  ];
  const fetched = seq.map(q => sources.find(c => c.m && c.m.hs === q.hs && Number.isFinite(c.at)));
  const fetchedAt = fetched.length && fetched.every(Boolean) ? Math.min(...fetched.map(c => c.at)) : null;
  const flags = new Set();
  hours.forEach(x => {
    if ((x.Pl ?? x.P ?? 0) >= 0.1) flags.add('rain');
    if ((x.RH ?? 0) >= 95) flags.add('wet');
    if (x.vis != null && x.vis < 1000 || [45, 48].includes(x.code)) flags.add('fog');
    if ((x.snow || 0) > 0.05 || [71, 73, 75, 77, 85, 86].includes(x.code)) flags.add('snow');
    if (x.ice && x.ice.level >= 1 || [56, 57, 66, 67].includes(x.code)) flags.add('ice');
  });
  let evidence = null;
  const ev = EV_FLAG() === 'on' && evInput();
  if (ev && ev.tripKey === t.key) {
    const r = evidenceEngine(ev);
    if (r) {
      if (r.worst.lv >= 1) flags.add('fog');
      evidence = { fogLevel: r.worst.lv, trust: EV_TRUST[r.worst.trust],
        proofs: r.worst.ev.filter(e => e.dir === '+').map(e => e.text).slice(0, 4), contradiction: !!r.contradiction };
    }
  }
  let thermal = null;
  const r = tripLab(t, car), row = r && r.trip && r.trip.rows[r.trip.rows.length - 1];
  if (row && r.confidence) thermal = { s: row.s, range: row.range, conf: r.confidence.level };
  const verdict = t.res && t.res.find(r => car && r.c.id === car.id);
  USER_STORE.state.debrief = Debrief.begin(USER_STORE.state.debrief, { key: t.key, at: s.at,
    name: t.name, from: t.from, to: t.to, carId: car && car.id, car: car && (car.short || car.name),
    prediction: { known: hours.length === seq.length && hours.length > 0, conditions: [...flags], fetchedAt,
      offline: offlineNow(), verdict: verdict ? LV[verdict.w.level].name : '', thermal, evidence } });
}
function closeTrip(t, how = 'confirmé') {
  return appAction(() => {
    if (DEMO.on || !t || !t.key || !['auto', 'confirmé'].includes(how)) return null;
    const prior = USER_STORE.state.debrief.entries.find(e => e.key === t.key);
    if (LIVE.done[t.key] && prior) return prior;
    const at = Date.now(), active = LIVE.key === t.key;
    const snapshot = USER_STORE.state.debrief.active;
    const vehicle = snapshot && snapshot.key === t.key ? S.cars.find(c => c.id === snapshot.carId) : labCar();
    const fin = active && LIVE.phase === 'active' && vehicle ? labThermTick(true, vehicle) : null;
    const d = fin && fin.inp.drive, r = fin && fin.r;
    const end = d && r ? { thermal: { s: r.thermal.s, range: r.thermal.range, conf: r.confidence.level }, km: d.km, kmSrc: d.kmSrc } : null;
    // Une arrivée déclarée après coup n'invente ni départ réel ni bilan thermique.
    TRIPEND = d && r ? { key: t.key, carId: vehicle.id, at, name: t.name || '', km: d.km, kmSrc: d.kmSrc,
      min: Math.round((at - d.startTs) / 60e3), range: r.thermal.range, state: r.thermal.state, conf: r.confidence.level } : null;
    USER_STORE.state.debrief = Debrief.close(USER_STORE.state.debrief, { key: t.key, how,
      name: t.name, from: t.from, to: t.to, end }, at);
    liveDonePersist(t.key, how); LIVE.lastDone = { key: t.key, name: t.name || '', at };
    returnHomeClear(t.key); appArrival(t, how, at);
    if (active) liveReset('arrivé'); else LIVE.done[t.key] = 'arrivé';
    if (TRIPPREVIEW.key === t.key) tripPreviewReset();
    DEBRIEF_FORM = null;
    return USER_STORE.state.debrief.entries.find(e => e.key === t.key);
  });
}
let DEBRIEF_FORM = null;
const DEBRIEF_COMPARE = { pending: 'Retour à renseigner', unknown: 'Prévision non comparable', match: 'Concordant',
  missed: 'Phénomène non annoncé', unused: 'Alerte non rencontrée', mixed: 'Écart mixte' };
const debriefConditions = xs => xs.length ? xs.map(k => Debrief.LABELS[k]).join(' · ') : 'Aucun de ces phénomènes';
function debriefSummary(e) {
  const time = at => new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `<p class="sub">${esc(e.from || 'Origine non renseignée')} → ${esc(e.to || 'Destination')} · arrivée ${time(e.at)} (${e.how === 'auto' ? 'GPS' : 'confirmée'})${e.start ? ' · ' + Math.round((e.at - e.start.at) / 60e3) + ' min depuis le départ' : ' · départ réel non renseigné'}</p>`;
}
function debriefDetails(e) {
  const p = e.start && e.start.prediction, cmp = Debrief.compare(e);
  const therm = v => `${v.range[0]} à ${v.range[1]} °C · ${TL_STATES[v.s].toLowerCase()} · confiance ${v.conf}`;
  return `${debriefSummary(e)}
    <dl class="debrief-facts">${e.start && e.start.car ? `<div><dt>Voiture au départ</dt><dd>${esc(e.start.car)}</dd></div>` : ''}<div><dt>Prévision au départ</dt><dd>${p && p.known ? esc(debriefConditions(p.conditions)) : 'Non disponible'}${p && p.verdict ? ' · verdict pneus : ' + esc(p.verdict) : ''}</dd></div>
    ${p ? `<div><dt>Données au départ</dt><dd>${p.fetchedAt ? 'Récupérées ' + Math.max(0, Math.round((e.start.at - p.fetchedAt) / 60e3)) + ' min avant le départ' : 'Âge non disponible'}${p.offline ? ' · hors ligne' : ''}</dd></div>` : ''}
    ${p && p.evidence ? `<div><dt>Preuves brouillard au départ</dt><dd>${['Risque faible', 'Brume possible', 'Risque élevé', 'Brouillard dense possible'][p.evidence.fogLevel]}${p.evidence.trust ? ' · confiance locale ' + p.evidence.trust : ''}${p.evidence.proofs.length ? ' · ' + esc(p.evidence.proofs.join(' · ')) : ''}${p.evidence.contradiction ? ' · contradiction détectée' : ''}</dd></div>` : ''}
    ${e.feedback ? `<div><dt>Rencontré sur la route</dt><dd>${esc(debriefConditions(e.feedback.conditions))}</dd></div><div><dt>Adhérence ressentie</dt><dd>${esc({ normal: 'Habituelle', reduced: 'Moins bonne', slip: 'Glissement ressenti', unknown: 'Non évaluée' }[e.feedback.grip])}</dd></div>` : ''}
    ${p && p.thermal ? `<div><dt>Thermique prévue à l’arrivée</dt><dd>${esc(therm(p.thermal))}</dd></div>` : ''}
    ${e.end && e.end.thermal ? `<div><dt>Thermique estimée à l’arrivée</dt><dd>${esc(therm(e.end.thermal))}${e.end.km != null ? ' · ' + f1(e.end.km) + ' km (' + (e.end.kmSrc === 'route' ? 'itinéraire' : 'estimés') + ')' : ''}</dd></div>` : ''}</dl>
    ${e.feedback ? `<p class="debrief-result"><b>${DEBRIEF_COMPARE[cmp.kind]}</b>${cmp.missed.length ? ' · rencontré sans annonce : ' + esc(debriefConditions(cmp.missed)) : ''}${cmp.unused.length ? ' · annoncé sans rencontre : ' + esc(debriefConditions(cmp.unused)) : ''}</p>` : ''}`;
}
function debriefOpen(key) {
  const e = USER_STORE.state.debrief.entries.find(e => e.key === key); if (!e) return;
  DEBRIEF_FORM = { key, conditions: e.feedback ? e.feedback.conditions.slice() : null, grip: e.feedback ? e.feedback.grip : 'unknown' };
  renderDebrief(); $('#secDebrief').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function debriefPick(kind, value) {
  if (!DEBRIEF_FORM) return;
  if (kind === 'condition') {
    if (value === 'normal') DEBRIEF_FORM.conditions = [];
    else if (Debrief.CONDITIONS.includes(value)) {
      const selected = DEBRIEF_FORM.conditions || [];
      DEBRIEF_FORM.conditions = selected.includes(value) ? selected.filter(k => k !== value) : [...selected, value];
    }
  } else if (['normal', 'reduced', 'slip', 'unknown'].includes(value)) DEBRIEF_FORM.grip = value;
  renderDebrief();
}
function debriefSave() {
  if (!DEBRIEF_FORM || !Array.isArray(DEBRIEF_FORM.conditions)) return;
  const form = DEBRIEF_FORM; DEBRIEF_FORM = null;
  appAction(() => { USER_STORE.state.debrief = Debrief.reply(USER_STORE.state.debrief, form.key, form); });
}
function debriefLater() {
  if (!DEBRIEF_FORM) return;
  const key = DEBRIEF_FORM.key; DEBRIEF_FORM = null;
  appAction(() => { USER_STORE.state.debrief = Debrief.defer(USER_STORE.state.debrief, key); });
  renderDebrief();
}
function debriefClear() {
  if (!window.confirm('Effacer les débriefs enregistrés sur cet appareil ?')) return;
  DEBRIEF_FORM = null;
  appAction(() => { USER_STORE.state.debrief.entries = []; });
}
function renderDebrief() {
  const el = $('#secDebrief'); if (!el) return;
  const state = USER_STORE.state.debrief;
  const open = new Set([...el.querySelectorAll('details[open]')].map(d => d.dataset.dk));
  const hadForm = !!el.querySelector('.debrief-form');
  if (DEMO.on || !state.entries.length) { el.hidden = true; el.innerHTML = ''; renderDebrief.last = ''; DEBRIEF_FORM = null; return; }
  el.hidden = false;
  if (DEBRIEF_FORM && !state.entries.some(e => e.key === DEBRIEF_FORM.key)) DEBRIEF_FORM = null;
  const pending = state.entries.find(e => !e.feedback && !e.deferred);
  if (!DEBRIEF_FORM && pending) DEBRIEF_FORM = { key: pending.key, conditions: null, grip: 'unknown' };
  const e = DEBRIEF_FORM && state.entries.find(e => e.key === DEBRIEF_FORM.key), st = Debrief.stats(state);
  const choice = (act, value, label, on) => `<button class="btn sm" ${act === 'debrief-condition' ? 'data-act="debrief-condition"' : 'data-act="debrief-grip"'} data-v="${value}" aria-pressed="${on}">${label}</button>`;
  const form = e ? `<div class="debrief-form"><div class="mod-h"><h2>🏁 Débrief du trajet</h2><span class="src">${esc(e.name || 'Trajet terminé')}</span></div>${debriefSummary(e)}
    <fieldset><legend>Ce que tu as rencontré</legend><p class="sub">Plusieurs réponses possibles. Renseigne ce que tu as effectivement observé.</p><div class="debrief-choices">${choice('debrief-condition', 'normal', 'Aucun de ces phénomènes', Array.isArray(DEBRIEF_FORM.conditions) && !DEBRIEF_FORM.conditions.length)}${Debrief.CONDITIONS.map(k => choice('debrief-condition', k, Debrief.LABELS[k], (DEBRIEF_FORM.conditions || []).includes(k))).join('')}</div></fieldset>
    <fieldset><legend>Adhérence ressentie · facultatif</legend><div class="debrief-choices">${[['unknown', 'Non évaluée'], ['normal', 'Habituelle'], ['reduced', 'Moins bonne'], ['slip', 'Glissement ressenti']].map(([v, label]) => choice('debrief-grip', v, label, DEBRIEF_FORM.grip === v)).join('')}</div></fieldset>
    <div class="debrief-actions"><button class="btn" data-act="debrief-save"${DEBRIEF_FORM.conditions == null ? ' disabled' : ''}>Enregistrer le débrief</button><button class="btn sm" data-act="debrief-later">Plus tard</button></div><details class="debrief-snapshot" data-dk="snapshot"${open.has('snapshot') ? ' open' : ''}><summary>Prévision au départ et bilan estimé</summary>${debriefDetails(e)}</details></div>` : '';
  const counts = st.comparable ? `${st.comparable} retour${st.comparable > 1 ? 's' : ''} comparable${st.comparable > 1 ? 's' : ''} : ${st.counts.match} concordant${st.counts.match > 1 ? 's' : ''} · ${st.counts.missed} phénomène${st.counts.missed > 1 ? 's' : ''} non annoncé${st.counts.missed > 1 ? 's' : ''} · ${st.counts.unused} alerte${st.counts.unused > 1 ? 's' : ''} non rencontrée${st.counts.unused > 1 ? 's' : ''} · ${st.counts.mixed} écart${st.counts.mixed > 1 ? 's' : ''} mixte${st.counts.mixed > 1 ? 's' : ''}.` : 'Aucun retour comparable pour le moment.';
  const html = `${form}<details class="debrief-journal" data-dk="journal"${open.has('journal') || !e && hadForm ? ' open' : ''}><summary>Journal des trajets · ${st.total} trajet${st.total > 1 ? 's' : ''} · ${st.answered} débrief${st.answered > 1 ? 's' : ''}</summary><p>${counts}</p>
    <p class="sub">Comparaison des phénomènes annoncés avec tes observations, sur cet appareil. Les températures restent estimées. Une prévision absente ou ancienne n’entre pas dans les retours comparables.</p>
    ${state.entries.map(row => `<details class="debrief-entry" data-dk="entry-${esc(row.key)}"${open.has('entry-' + row.key) ? ' open' : ''}><summary>${esc(row.name || 'Trajet')} · ${new Date(row.at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' })} · ${DEBRIEF_COMPARE[Debrief.compare(row).kind]}</summary>${debriefDetails(row)}<button class="btn sm" data-act="debrief-open" data-key="${esc(row.key)}">${row.feedback ? 'Modifier le débrief' : 'Renseigner le débrief'}</button></details>`).join('')}
    <p class="sub">60 trajets maximum · conservés 90 jours · données locales.</p><button class="btn sm" data-act="debrief-clear">Effacer le journal</button></details>`;
  if (renderDebrief.last !== html) { el.innerHTML = html; renderDebrief.last = html; }
}
