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
    car: appActiveCar(), frost: (() => { const tf = tripFrost(); return tf && tf.fr; })(),
    when: (() => { const t = snap && (snap.activeTrip || snap.nextTrip); return t ? tripWhen(t.dep) : ''; })() });
  const speak = x.state !== 'indisponible' ? '<button class="btn sm" data-act="race-speak">🔊 Écouter le briefing</button>' : '';
  return f1Panel('raceEngineer', 'INGÉNIEUR DE COURSE', x.title, '<ul class="lab-why">' + x.lines.map(f1Line).join('') +
    '</ul><p class="sub">Conseil fondé sur la décision et la confiance existantes, pas sur une IA distante.</p>' + speak);
}
function f1WeatherSources(seq) {
  const frames = new Map(), add = (m, at) => { if (m && m.hs) frames.set(m.hs, { at, mode: m.mode }); };
  for (const [id, m] of Object.entries(M)) add(m, RAW[id] && RAW[id].t);
  for (const [id, m] of Object.entries(MIDM)) add(m, MIDP[id] && MIDP[id].t);
  for (const c of Object.values(CALM)) if (c) add(c.m, c.t);
  for (const c of Object.values(LEGM)) if (c && c.models) for (const m of c.models) add(m, c.t);
  const sources = (seq || []).map(q => q && frames.get(q.hs)), now = Date.now();
  if (!sources.length || sources.some(s => !s || !Number.isFinite(s.at) || s.at > now + 60e3)) return { known: false, cache: true, ageMin: Infinity };
  return { known: true, cache: offlineNow() || sources.some(s => s.mode === 'cache'), ageMin: Math.max(...sources.map(s => Math.max(0, (now - s.at) / 60000))) };
}
// « État de la route » (19/11/2026) : trajet daté, ruban des secteurs avec l'heure de passage, chiffres du secteur touché et
// meilleur départ (même lecture à −1 h / +1 h). État de vue seulement : rien n'est écrit, le départ reste celui de l'utilisateur.
const F1_TRACK = { key: null, shift: 0, sector: 0 };
function f1TrackHtml() {
  const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const sources = f1WeatherSources(t && t.seq), age = sources.ageMin;
  const complete = t && t.seq && t.seq.every(q => q && q.hs && q.hs[q.i] && ['T', 'Tr', 'P', 'vis'].every(k => Number.isFinite(q.hs[q.i][k])));
  const x = F1Pure.trackConditions(complete ? t.seq : null, { ageMin: age });
  const key = t ? t.key || t.dep || null : null;
  if (F1_TRACK.key !== key) { F1_TRACK.key = key; F1_TRACK.shift = 0; F1_TRACK.sector = 0; }
  const foot = (sources.known ? '<p class="sub">PRÉVU' + (sources.cache ? ' · CACHE' : '') + ' · point le plus ancien reçu il y a ' + esc(ageTxt(age)) + '.</p>' : '') +
    '<p class="sub">Lecture ordonnée des points météo du trajet (maximum 3 secteurs). Aucun découpage GPS précis ni capteur de piste.</p>';
  const title = t ? t.name || 'Prochain trajet' : 'Aucun trajet';
  if (!x.available) return f1Panel('trackConditions', 'ÉTAT DE LA ROUTE', title, '<p class="sub">' + esc(x.reason) + '</p>' + foot);
  const opts = F1Pure.departureOptions(t.seq, { ageMin: age });
  const shown = opts && F1_TRACK.shift ? opts.options.find(o => o.shift === F1_TRACK.shift && o.available) || null : null;
  if (F1_TRACK.shift && !shown) F1_TRACK.shift = 0;
  const sectors = shown ? shown.sectors : x.sectors;
  F1_TRACK.sector = Math.min(Math.max(0, F1_TRACK.sector), sectors.length - 1);
  const hm = ts => typeof ts === 'string' && ts.length >= 16 ? ts.slice(11, 16) : '';
  // Départ d'une option : heure du premier point (legSeq), sinon départ prévu décalé (trajets domicile-travail sans heure par point).
  const depOf = o => o && (o.dep || (o.shift != null && typeof t.dep === 'string' ? addMin(t.dep, o.shift * 60) : null));
  const km = v => Number.isFinite(v) ? f0(v) : null;
  const span = sectors.map(z => z.figures || {}), kmEnd = span.length ? span[span.length - 1].km1 : null;
  // 1. Trajet daté (jamais « Aller » sans jour ni heure) ; une simulation est nommée comme telle.
  const shiftDep = shown ? depOf(shown) : null, shiftArr = shiftDep && t.arr ? addMin(t.arr, shown.shift * 60) : null;
  const when = shown ? 'Simulation · départ ' + tripWhen(shiftDep) + (shiftArr ? ' → arrivée ' + hm(shiftArr) : '') + ' · prévu ' + hm(t.dep)
    : 'Départ ' + tripWhen(t.dep) + (t.arr ? ' → arrivée ' + hm(t.arr) : '');
  const worst = sectors.reduce((m, z) => !m || z.level > m.level ? z : m, null), wf = worst.figures || {};
  const verdict = '<p class="trk-verdict" data-lv="' + worst.level + '"><b>' + esc(worst.label) + '</b><span>' +
    esc(worst.level ? (worst.notes[0] || 'signal sur le parcours') + ' · secteur ' + worst.index + (wf.from || wf.h0 ? ' vers ' + (wf.from || wf.h0) : '') : 'aucun signal notable sur ces prévisions') + '</span></p>';
  // 2. Ruban : largeur selon les kilomètres du secteur (sinon le nombre de points), heure de passage, niveau.
  const strip = '<div class="trk-strip" role="group" aria-label="Secteurs du parcours">' + sectors.map((z, i) => {
    const f = z.figures || {}, w = Number.isFinite(f.km0) && Number.isFinite(f.km1) && f.km1 > f.km0 ? f.km1 - f.km0 : z.points;
    return '<button type="button" class="trk-seg" data-act="track-sector" data-i="' + i + '" data-lv="' + z.level + '" aria-pressed="' + (i === F1_TRACK.sector) +
      '" style="flex:' + Math.max(1, Math.round(w)) + ' 1 0" aria-label="' + esc('Secteur ' + z.index + ', ' + z.label + (f.from ? ', passage vers ' + f.from : f.h0 ? ', prévision de ' + f.h0 : '')) + '">' +
      '<b>' + esc(f.from || f.h0 || '—') + '</b><span>S' + z.index + '</span></button>';
  }).join('') + '</div>' +
    (Number.isFinite(kmEnd) ? '<div class="trk-km"><span>' + esc(hm(shiftDep || t.dep)) + ' · km 0</span><span>km ' + esc(km(kmEnd)) + '</span></div>' : '');
  // 3. Chiffres du secteur touché.
  const z = sectors[F1_TRACK.sector], f = z.figures || {};
  const vis = Number.isFinite(f.vis) ? (f.vis >= 1000 ? f1(f.vis / 1000).replace(/,0$/, '') + ' km' : f0(f.vis) + ' m') : '—';
  const cell = (k, v) => '<div><span>' + k + '</span><b>' + v + '</b></div>';
  const detail = '<div class="trk-detail"><div class="trk-detail-h"><b>Secteur ' + z.index + ' · ' + esc(z.label) + '</b><span>' + esc(f.from && f.to ? f.from + '–' + f.to : f.from || (f.h0 ? 'prévision de ' + (f.h0 === f.h1 || !f.h1 ? f.h0 : f.h0 + '–' + f.h1) : '')) + '</span></div>' +
    '<div class="trk-figs">' + cell('PLUIE', Number.isFinite(f.rain) ? F1Pure.rainShown(f.rain) + ' mm/h' : '—') + cell('CHAUSSÉE ESTIMÉE', Number.isFinite(f.road) ? f1(f.road) + ' °C' : '—') +
    cell('VISIBILITÉ', vis) + cell('RAFALES', Number.isFinite(f.gust) ? f0(f.gust) + ' km/h' : '—') + '</div>' +
    '<p class="sub">' + esc((km(f.km0) != null && km(f.km1) != null ? 'km ' + km(f.km0) + '–' + km(f.km1) + ' · ' : '') + z.points + (z.points > 1 ? ' points météo · ' : ' point météo · ') +
      (z.notes.length ? z.notes.join(' / ') : 'aucun signal notable sur ces prévisions')) + '</p></div>';
  // 4. Meilleur départ : seulement quand l'horaire prévu porte un signal ; jamais un niveau affiché pour un trajet sans signal.
  let best = '';
  if (opts && opts.needed) {
    const tag = h => h < 0 ? '−' + -h + ' h' : h > 0 ? '+' + h + ' h' : 'prévu';
    const chips = opts.options.map(o => '<button type="button" class="trk-dep" data-act="track-shift" data-h="' + o.shift + '" aria-pressed="' + (o.shift === F1_TRACK.shift) + '"' + (o.available ? '' : ' disabled') + '>' +
      '<span>' + tag(o.shift) + (opts.best && opts.best.shift === o.shift ? ' · conseillé' : '') + '</span><b>' + esc(o.available ? hm(depOf(o)) : '—') + '</b>' +
      (o.available ? '<i data-lv="' + o.level + '">' + esc(o.label) + '</i>' : '<i>prévision absente</i>') + '</button>').join('');
    const advice = opts.best ? 'Partir à ' + hm(depOf(opts.best)) + ' : ' + opts.best.label.toLowerCase() + ' au lieu de ' + opts.planned.label.toLowerCase() +
        (opts.best.cause ? ' (' + opts.best.cause.toLowerCase() + ')' : ' (aucun signal)') + '.'
      : 'Partir une heure plus tôt ou plus tard ne fait pas baisser le niveau : l’horaire prévu reste le bon choix.';
    best = '<div class="trk-best"><span class="trk-k">MEILLEUR DÉPART</span><div class="trk-deps" role="group" aria-label="Heure de départ">' + chips + '</div>' +
      '<p>' + esc(advice) + '</p><p class="sub">Même lecture et mêmes seuils, départ décalé d’une heure entière (prévisions horaires). Une suggestion : ton départ reste le tien.</p></div>';
  } else if (opts) best = '<p class="sub trk-best-ok">Horaire prévu : aucun signal sur le parcours, pas besoin de décaler le départ.</p>';
  return f1Panel('trackConditions', 'ÉTAT DE LA ROUTE', title, '<p class="trk-when">' + esc(when) + '</p>' + verdict + strip + detail + best + foot);
}
function f1TyreHtml() {
  const car = appActiveCar(), state = car ? tyreState(car, { wheels: treadWheelsRecord(S, car) }) : null;
  const x = F1Pure.tyreManagement(state);
  return f1Panel('tyreManagement', 'GESTION DES PNEUS', car ? car.short || car.name : 'Voiture à choisir',
    '<ul class="lab-why">' + x.lines.map(f1Line).join('') +
    '</ul><p class="sub">Données provenant uniquement de l’état pneus existant. Aucune usure ou pression mesurée automatiquement.</p>');
}
function f1StrategyHtml() {
  const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip);
  const car = appActiveCar(), raw = RAW[UI.loc];
  const sources = f1WeatherSources(t && t.seq);
  // Les évaluations doivent provenir du même trajet et du moteur déjà utilisé
  // par « Quelle voiture prendre ? ». Le contexte seul ne possède PAS de t.res.
  const rawAge = raw ? Reliability.ageMin(raw.t) : null, limit = Reliability.FRESHNESS.agingMaxMin;   // même seuil de péremption que les autres vues
  const recent = raw && raw.mode !== 'cache' && rawAge !== null && rawAge <= limit && sources.known && !sources.cache && sources.ageMin <= limit;
  const cars = t && !t.originPending && Array.isArray(t.seq) && t.seq.length && recent && CX
    ? TCARS().filter(c => hasTires(c) && !carProfile(c).generic).map(c => ({
      c, w: windowAssess(c, t.seq, 'trip')
    })).filter(r => r.w) : [];
  const shown = car || appDisplayedCar(), x = F1Pure.strategyAB(cars.length >= 2 ? { res: cars } : null, shown && shown.id);
  const content = x.available ? '<ul class="lab-why">' + x.choices.map(c => '<li><b>STRATÉGIE ' +
    esc(c.scenario) + '</b> · ' + esc(c.car) + ' : ' + esc(c.risk) + '</li>').join('') + '</ul>'
    : '<p class="sub">' + esc(x.reason) + '</p>';
  return f1Panel('strategyAB', 'STRATÉGIE A/B', 'Comparaison à données égales', content +
    '<p class="sub">' + esc(x.available ? x.reason : 'Aucune stratégie fictive n’est proposée.') + '</p>' +
    (x.available && !car ? '<p class="sub ab-unconfirmed">Stratégie A = voiture affichée (' + esc(appCarLabel().text) + ') : aucune voiture n’est encore confirmée pour ce trajet.</p>' : ''));
}
function f1GarageHtml() {
  const x = F1Pure.theGarage(S.cars);
  return f1Panel('theGarage', 'LE GARAGE', 'Suivi des véhicules enregistrés',
    '<ul class="lab-why">' + x.cars.map(c => '<li><b>' + esc(c.name) + '</b> · ' + esc(c.tyre) +
    (c.odo != null ? ' · compteur déclaré ' + c.odo.toLocaleString('fr-FR') + ' km' : ' · compteur non renseigné') +
    (c.mounted ? ' · monté le ' + esc(c.mounted) : '') + '</li>').join('') +
    '</ul><p class="sub">Fiches issues des réglages existants, sans diagnostic mécanique automatique.</p>');
}
function f1ReplayHtml() {
  const x = F1Pure.telemetryReplay(USER_STORE.state.debrief && USER_STORE.state.debrief.entries, Debrief.compare);
  return f1Panel('telemetryReplay', 'RELECTURE DU TRAJET', 'Dernier trajet clôturé',
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
    raceEngineer: ['#secBrief', f1BriefingHtml, 'pneus'],
    trackConditions: ['#secWx', f1TrackHtml, 'meteo'],
    tyreManagement: ['#secBrief', f1TyreHtml, 'pneus'],
    strategyAB: ['#secTrip', f1StrategyHtml, 'trajet'],
    theGarage: ['#secGarage', f1GarageHtml, 'garage'],
    telemetryReplay: ['#secLab', f1ReplayHtml, 'analyse']
  };
  F1_FLAGS.forEach(id => {
    const [selector, build, view] = host[id], root = $(selector); if (!root) return;
    const current = root.querySelector('.f1-extension[data-f1="' + id + '"]');
    const valid = f1Enabled(id) && UI.view === view && !DEMO.on && !LOCKED() && !root.hidden;
    if (!valid) { if (current) current.remove(); return; }
    if (current) F1_OPEN[id] = current.open;
    const html = build();
    // Le choix ouvert/fermé appartient à l'utilisateur, pas au contenu projeté.
    // outerHTML sérialise « open » en open="" et recréait un panneau inchangé.
    const content = html.replace(' data-f1="' + id + '" open>', ' data-f1="' + id + '">');
    if (current) {
      if (current._f1HTML !== content) {
        current.outerHTML = html;
        root.querySelector('#f1-panel-' + id)._f1HTML = content;
      }
      return;
    }
    // Une section peut être longue (Météo, Analyse, briefing). Ne jamais
    // cacher les nouveautés APRÈS la totalité de son contenu sur mobile.
    // Les modules de même section suivent l'ordre de FEATURES.
    // Préserver les verdicts de sécurité : le poste Météo garde son héros
    // d'alerte en premier et l'Analyse garde son diagnostic principal visible.
    const first = id === 'trackConditions' ? root.querySelector(':scope > .wx-hours') || root.querySelector(':scope > .wx-hero') :
      id === 'telemetryReplay' ? root.querySelector(':scope > .lab-hero') :
      root.querySelector(':scope > .mod-h, :scope > .decision-top');
    let anchor = first;
    while (anchor && anchor.nextElementSibling &&
      anchor.nextElementSibling.matches('.f1-extension')) anchor = anchor.nextElementSibling;
    if (anchor) anchor.insertAdjacentHTML('afterend', html);
    else root.insertAdjacentHTML('afterbegin', html);
    root.querySelector('#f1-panel-' + id)._f1HTML = content;
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
