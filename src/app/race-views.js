/* F1 Pure : adaptateurs de lecture des cinq écrans existants.
 * Tout est OFF par défaut. Aucune nouvelle section de navigation, aucun
 * calcul de navigation concurrent, aucun stockage de trajet supplémentaire.
 */
const F1_FLAGS = Object.freeze(F1Pure.FEATURES.map(x => x.id));
const F1_OPEN = Object.create(null);
// Modules de tête lisibles dès l'activation ; la fermeture reste mémorisée pour la session.
const F1_PRIMARY = new Set(['raceEngineer', 'trackConditions', 'strategyAB', 'telemetryReplay']);
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
  return '<details id="f1-panel-' + esc(id) + '" class="f1-extension wx-pc lab-d" data-f1="' + esc(id) + '"' +
    ((Object.hasOwn(F1_OPEN, id) ? F1_OPEN[id] : F1_PRIMARY.has(id)) ? ' open' : '') +
    '><summary><span class="ic" aria-hidden="true">🏎️</span><span class="tt">' + esc(title) + '</span><span class="ln">' + esc(desc) +
    '</span></summary><div class="lab-sp">' + body + '</div></details>';
}
function f1BriefingHtml() {
  const snap = APP_CONTEXT.snapshot;
  const confidence = DECISION_LAST && DECISION_LAST.confidence;
  const x = F1Pure.raceEngineer({ decision: DECISION_LAST && DECISION_LAST.decision,
    confidence: confidence && { ...confidence, reason: (confidence.reasons || []).join(' · ') }, trip: snap && (snap.activeTrip || snap.nextTrip),
    car: appActiveCar() });
  const speak = x.state !== 'indisponible' ? '<button class="btn sm" data-act="race-speak">🔊 Écouter le briefing</button>' : '';
  return f1Panel('raceEngineer', 'RACE ENGINEER', x.title, '<ul class="lab-why">' + x.lines.map(f1Line).join('') +
    '</ul><p class="sub">Conseil fondé sur la décision et la confiance existantes, pas sur une IA distante.</p>' + speak);
}
function f1TrackHtml() {
  const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const raw = RAW[UI.loc], age = raw && Number.isFinite(raw.t) && raw.mode !== 'cache' ? Math.max(0, (Date.now() - raw.t) / 60000) : Infinity;
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
  const car = appActiveCar(), raw = RAW[UI.loc];
  // Les évaluations doivent provenir du même trajet et du moteur déjà utilisé
  // par « Quelle voiture prendre ? ». Le contexte seul ne possède PAS de t.res.
  const recent = raw && raw.mode !== 'cache' && Number.isFinite(raw.t) &&
    Date.now() - raw.t <= 90 * 60000 && raw.t <= Date.now() + 15 * 60000;
  const cars = t && !t.originPending && Array.isArray(t.seq) && t.seq.length && recent && CX
    ? TCARS().filter(c => hasTires(c) && !carProfile(c).generic).map(c => ({
      c, w: windowAssess(c, t.seq, 'trip')
    })).filter(r => r.w) : [];
  const x = F1Pure.strategyAB(cars.length >= 2 ? { res: cars } : null, car && car.id);
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
function renderF1Dock() {
  const nav = $('#viewSeg'), current = $('#f1Dock');
  const on = !LOCKED() && !DEMO.on &&
    F1Pure.FEATURES.filter(f => f1Enabled(f.id) && f.view === UI.view);
  if (!nav || !on.length) { if (current) current.remove(); return; }
  const available = on.filter(f => $('#f1-panel-' + f.id));
  const html = '<div id="f1Dock" class="f1-dock" role="region" aria-label="Accès aux modules F1">' +
    '<span class="f1-dock-title"><span aria-hidden="true">🏎️</span> F1 ACTIVE <small>' +
    F1Pure.FEATURES.filter(f => f1Enabled(f.id)).length + '/6</small></span>' +
    '<nav class="f1-dock-links" aria-label="Modules F1 de cet onglet">' +
    (available.length ? available.map(f => '<a href="#f1-panel-' + esc(f.id) + '">' +
      esc(f.title) + ' ↗</a>').join('') :
      '<span class="f1-dock-wait">Modules activés · données en attente</span>') +
    '</nav></div>';
  if (current) {
    // Pas de recréation intempestive : conserve les puces et l'éventuel geste tactile.
    if (current.outerHTML !== html) current.outerHTML = html;
  } else nav.insertAdjacentHTML('afterend', html);
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
    const html = build();
    if (current) { if (current.outerHTML !== html) current.outerHTML = html; return; }
    // Une section peut être longue (Météo, Analyse, briefing). Ne jamais
    // cacher les nouveautés APRÈS la totalité de son contenu sur mobile.
    // Les modules de même section suivent l'ordre de FEATURES.
    // Préserver les verdicts de sécurité : le poste Météo garde son héros
    // d'alerte en premier et l'Analyse garde son diagnostic principal visible.
    const first = id === 'trackConditions' ? root.querySelector(':scope > .wx-hero') :
      id === 'telemetryReplay' ? root.querySelector(':scope > .lab-hero') :
      root.querySelector(':scope > .mod-h, :scope > .decision-top');
    let anchor = first;
    while (anchor && anchor.nextElementSibling &&
      anchor.nextElementSibling.matches('.f1-extension')) anchor = anchor.nextElementSibling;
    if (anchor) anchor.insertAdjacentHTML('afterend', html);
    else root.insertAdjacentHTML('afterbegin', html);
  });
  renderF1Dock();
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
