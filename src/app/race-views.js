/* F1 Pure : adaptateurs de lecture des cinq écrans existants.
 * Tout est OFF par défaut. Aucune nouvelle section de navigation, aucun
 * calcul de navigation concurrent, aucun stockage de trajet supplémentaire.
 */
const F1_FLAGS = Object.freeze(F1Pure.FEATURES.map(x => x.id));
const F1_OPEN = Object.create(null);
const f1Enabled = id => F1_FLAGS.includes(id) && !!(S.flags && S.flags['f1' + id[0].toUpperCase() + id.slice(1)]);
function f1Toggle(id) {
  if (!F1_FLAGS.includes(id)) return;
  const key = 'f1' + id[0].toUpperCase() + id.slice(1);
  S.flags = S.flags || {};
  S.flags[key] = S.flags[key] ? 0 : 1;
  markEdit('flags.' + key); saveSettings();
  renderSettings(true); renderAll();
}
const f1Line = line => '<li>' + esc(line) + '</li>';
function f1Panel(id, title, desc, body) {
  return '<details class="f1-extension wx-pc lab-d" data-f1="' + esc(id) + '"' + (F1_OPEN[id] ? ' open' : '') +
    '><summary><span class="ic" aria-hidden="true">🏎️</span><span class="tt">' + esc(title) + '</span><span class="ln">' + esc(desc) +
    '</span></summary><div class="lab-sp">' + body + '</div></details>';
}
function f1BriefingHtml() {
  const snap = APP_CONTEXT.snapshot;
  const x = F1Pure.raceEngineer({ decision: DECISION_LAST && DECISION_LAST.decision,
    confidence: DECISION_LAST && DECISION_LAST.confidence, trip: snap && (snap.activeTrip || snap.nextTrip),
    car: appActiveCar() });
  const speak = x.state !== 'indisponible' ? '<button class="btn sm" data-act="race-speak">🔊 Écouter le briefing</button>' : '';
  return f1Panel('raceEngineer', 'RACE ENGINEER', x.title, '<ul class="lab-why">' + x.lines.map(f1Line).join('') +
    '</ul><p class="sub">Conseil fondé sur la décision et la confiance existantes, pas sur une IA distante.</p>' + speak);
}
function f1TrackHtml() {
  const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const raw = RAW[UI.loc], age = raw && Number.isFinite(raw.t) ? Math.max(0, (Date.now() - raw.t) / 60000) : null;
  const x = F1Pure.trackConditions(t && t.seq, { ageMin: age });
  const rows = x.available ? '<ol class="lab-why">' + x.sectors.map(s => '<li><b>Secteur ' + s.index +
    ' · ' + esc(s.label) + '</b> · ' + s.points + ' point(s) météo · ' +
    esc(s.notes.length ? s.notes.join(' / ') : 'aucun signal notable sur ces prévisions') + '</li>').join('') + '</ol>'
    : '<p class="sub">' + esc(x.reason) + '</p>';
  return f1Panel('trackConditions', 'TRACK CONDITIONS', t ? t.name || 'Prochain trajet' : 'Aucun trajet', rows +
    '<p class="sub">Lecture ordonnée des points météo du trajet (maximum 3 secteurs). Aucun découpage GPS précis ni capteur de piste.</p>');
}
function f1TyreHtml() {
  const car = appActiveCar(), state = car ? tyreState(car) : null;
  const x = F1Pure.tyreManagement(state);
  return f1Panel('tyreManagement', 'TYRE MANAGEMENT', car ? car.short || car.name : 'Voiture à choisir',
    '<ul class="lab-why">' + x.lines.map(f1Line).join('') +
    '</ul><p class="sub">Données provenant uniquement de l’état pneus existant. Aucune usure ou pression mesurée automatiquement.</p>');
}
function f1StrategyHtml() {
  const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const car = appActiveCar(), x = F1Pure.strategyAB(t, car && car.id);
  const content = x.available ? '<ul class="lab-why">' + x.choices.map(c => '<li><b>STRATÉGIE ' +
    esc(c.scenario) + '</b> · ' + esc(c.car) + ' : ' + esc(c.risk) + '</li>').join('') + '</ul>'
    : '<p class="sub">' + esc(x.reason) + '</p>';
  return f1Panel('strategyAB', 'STRATEGY A/B', 'Comparaison à données égales', content +
    '<p class="sub">' + esc(x.available ? x.reason : 'Aucune stratégie fictive n’est proposée.') + '</p>');
}
function f1GarageHtml() {
  const x = F1Pure.theGarage(S.cars);
  return f1Panel('theGarage', 'THE GARAGE', 'Suivi des véhicules enregistrés',
    '<ul class="lab-why">' + x.cars.map(c => '<li><b>' + esc(c.name) + '</b> · ' + esc(c.tyre) +
    (c.odo != null ? ' · compteur déclaré ' + c.odo.toLocaleString('fr-FR') + ' km' : ' · compteur non renseigné') +
    (c.mounted ? ' · monté le ' + esc(c.mounted) : '') + '</li>').join('') +
    '</ul><p class="sub">Fiches issues des réglages existants, sans diagnostic mécanique automatique.</p>');
}
function f1ReplayHtml() {
  const x = F1Pure.telemetryReplay(USER_STORE.state.debrief && USER_STORE.state.debrief.entries, Debrief.compare);
  return f1Panel('telemetryReplay', 'TELEMETRY REPLAY', 'Dernier trajet clôturé',
    '<ul class="lab-why">' + (x.available ? x.lines : [x.reason]).map(f1Line).join('') +
    '</ul><p class="sub">' + esc(x.note || 'Aucun capteur embarqué ou suivi GPS enregistré dans le replay.') + '</p>');
}
function renderF1Pure() {
  const host = {
    raceEngineer: ['#decisionCore', f1BriefingHtml, 'pneus'],
    trackConditions: ['#secWx', f1TrackHtml, 'meteo'],
    tyreManagement: ['#secBrief', f1TyreHtml, 'pneus'],
    strategyAB: ['#secTrip', f1StrategyHtml, 'trajet'],
    theGarage: ['#secBrief', f1GarageHtml, 'pneus'],
    telemetryReplay: ['#secLab', f1ReplayHtml, 'analyse']
  };
  F1_FLAGS.forEach(id => {
    const [selector, build, view] = host[id], root = $(selector); if (!root) return;
    const current = root.querySelector('.f1-extension[data-f1="' + id + '"]');
    const valid = f1Enabled(id) && UI.view === view && !DEMO.on && !LOCKED() && !root.hidden;
    if (!valid) { if (current) current.remove(); return; }
    const html = build(), existing = current && current.outerHTML;
    if (current && existing === html) return;
    if (current) current.outerHTML = html;
    else root.insertAdjacentHTML('beforeend', html);
  });
}
function f1Speak(button) {
  if (!f1Enabled('raceEngineer') || LOCKED() || DEMO.on) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    commandFeedback(button, 'Lecture vocale indisponible'); return;
  }
  const snap = APP_CONTEXT.snapshot;
  const lines = F1Pure.raceEngineer({ decision: DECISION_LAST && DECISION_LAST.decision,
    confidence: DECISION_LAST && DECISION_LAST.confidence, trip: snap && (snap.activeTrip || snap.nextTrip), car: appActiveCar() }).lines;
  synth.cancel();
  const voice = new SpeechSynthesisUtterance(lines.join('. '));
  voice.lang = 'fr-FR'; voice.rate = 0.95;
  synth.speak(voice); // geste utilisateur explicite, jamais au chargement ni en arrière-plan
}
document.addEventListener('toggle', e => {
  const node = e.target && e.target.closest && e.target.closest('details.f1-extension');
  if (node && F1_FLAGS.includes(node.dataset.f1)) F1_OPEN[node.dataset.f1] = node.open;
}, true);
