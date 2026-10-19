// @include app/journey-replay-core.js
/* Adaptateur d'affichage Journey Replay : même silhouette SVG que Twin Garage.
 * L'animation est représentative, sans vitesse, géométrie ni météo recalculée.
 * Aucun nouveau stockage, requête, intervalle ou boucle requestAnimationFrame.
 */
const JOURNEY_REPLAY_STYLE = '<style>' +
'#secDebrief .jr-replay{margin:12px 0;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);overflow:hidden}' +
'#secDebrief .jr-replay>summary{padding:12px;min-height:44px;cursor:pointer;color:var(--accent);font-weight:600}' +
'#secDebrief .jr-body{padding:0 10px 12px;display:grid;gap:12px;min-width:0}' +
'#secDebrief .jr-route{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center;font:600 18px var(--f-disp)}' +
'#secDebrief .jr-route span{min-width:0;overflow-wrap:anywhere}' +
'#secDebrief .jr-route span:last-child{text-align:right}' +
'#secDebrief .jr-route em{font-style:normal;color:var(--accent)}' +
'#secDebrief .jr-meta,#secDebrief .jr-sub{font:11px/1.6 var(--f-mono);color:var(--fg2)}' +
'#secDebrief .jr-controls{display:flex;gap:7px;align-items:center;flex-wrap:wrap}' +
'#secDebrief .jr-controls .btn{min-height:44px}' +
'#secDebrief .jr-phase[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}' +
'#secDebrief .jr-scene{position:relative;margin:0;overflow:hidden;border:1px solid var(--line);border-radius:5px;background:var(--panel);contain:paint;isolation:isolate}' +
'#secDebrief .jr-scene svg{display:block;width:100%;height:auto;min-height:114px}' +
'#secDebrief .jr-scene figcaption{padding:9px;font:10px/1.5 var(--f-mono);color:var(--fg2);border-top:1px solid var(--line)}' +
'#secDebrief .jr-sky{fill:var(--panel)}#secDebrief .jr-ground{fill:var(--panel2)}' +
'#secDebrief .jr-road{fill:var(--bg)}#secDebrief .jr-lanes{stroke:var(--fg3);stroke-dasharray:26 28;stroke-width:3}' +
'#secDebrief .jr-wet{fill:var(--c-rain);opacity:.14}#secDebrief .jr-ice{fill:var(--c-ice);opacity:.23}' +
'#secDebrief .jr-cloud{fill:var(--fg3);opacity:.4}#secDebrief .jr-rain{stroke:var(--c-rain);stroke-width:3;animation:jr-rain 1.8s linear infinite}' +
'#secDebrief .jr-snow{fill:var(--c-ice);animation:jr-snow 4s linear infinite}' +
'#secDebrief .jr-fog{stroke:var(--fg2);stroke-width:18;opacity:.22;fill:none;animation:jr-fog 9s ease-in-out infinite alternate}' +
'#secDebrief .jr-vehicle{animation:jr-drive 14s linear infinite}' +
'#secDebrief .twin-shadow{fill:var(--bg);opacity:.6}' +
'#secDebrief .twin-paint{fill:color-mix(in srgb,var(--accent) 62%,var(--panel));stroke:var(--accent);stroke-width:1.5}' +
'#secDebrief .twin-glass{fill:var(--panel);stroke:var(--line2);stroke-width:1.5}' +
'#secDebrief .twin-trim{fill:none;stroke:var(--panel);stroke-width:1.5}' +
'#secDebrief .twin-lamp{fill:var(--c-ice)}#secDebrief .twin-rear{fill:none;stroke:var(--risk);stroke-width:3}' +
'#secDebrief .twin-rubber{fill:var(--bg);stroke:var(--line2);stroke-width:2}' +
'#secDebrief .twin-rim{fill:var(--panel2);stroke:var(--fg2);stroke-width:2}' +
'#secDebrief .twin-spokes{stroke:var(--fg2);stroke-width:1.5}' +
'#secDebrief .jr-layer{opacity:0}' +
'#secDebrief .jr-scene[data-mode=before] .jr-before,#secDebrief .jr-scene[data-mode=after] .jr-after{opacity:1}' +
'#secDebrief .jr-scene[data-mode=auto] .jr-before{animation:jr-before 12s steps(1,end) infinite}' +
'#secDebrief .jr-scene[data-mode=auto] .jr-after{animation:jr-after 12s steps(1,end) infinite}' +
'#secDebrief .jr-scene[data-running=false] *{animation-play-state:paused!important}' +
'#secDebrief .jr-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}' +
'#secDebrief .jr-compare>div{min-width:0;border:1px solid var(--line);background:var(--panel);padding:9px;border-radius:4px}' +
'#secDebrief .jr-compare b{display:block;color:var(--accent);font:700 12px var(--f-mono)}' +
'#secDebrief .jr-compare span{display:block;overflow-wrap:anywhere;font-size:12px;line-height:1.6}' +
'#secDebrief .jr-missing{margin:0;padding-left:18px;color:var(--fg2);font-size:11px}' +
'@keyframes jr-drive{0%{transform:translateX(20px)}95%,100%{transform:translateX(570px)}}' +
'@keyframes jr-rain{to{transform:translate(-7px,22px)}}@keyframes jr-snow{to{transform:translate(8px,22px)}}' +
'@keyframes jr-fog{to{transform:translateX(20px)}}' +
'@keyframes jr-before{0%,49.99%{opacity:1}50%,100%{opacity:0}}' +
'@keyframes jr-after{0%,49.99%{opacity:0}50%,100%{opacity:1}}' +
'@media(max-width:374px){#secDebrief .jr-compare{grid-template-columns:1fr}#secDebrief .jr-route{font-size:15px}}' +
'@media(prefers-reduced-motion:reduce){#secDebrief .jr-scene *{animation:none!important}' +
'#secDebrief .jr-scene[data-mode=auto] .jr-before{opacity:1}#secDebrief .jr-scene[data-mode=auto] .jr-after{opacity:0}}' +
'</style>';
function journeyReplayFrameSvg(frame, silhouette) {
  const shapes = [];
  shapes.push('<rect class="jr-sky" width="800" height="240"/>');
  shapes.push('<path class="jr-ground" d="M0 145 Q200 121 400 145 T800 135 V240 H0Z"/>');
  shapes.push('<rect class="jr-road" x="0" y="179" width="800" height="60"/>');
  if (frame.wet) shapes.push('<rect class="jr-wet" x="0" y="181" width="800" height="54"/>');
  if (frame.ice) shapes.push('<path class="jr-ice" d="M0 192 H800 V201 H0Z"/>');
  shapes.push('<path class="jr-lanes" d="M0 211 H800"/>');
  if (frame.rain || frame.snow || frame.fog) {
    shapes.push('<path class="jr-cloud" d="M20 70 Q4 49 38 39 Q43 17 72 34 Q99 16 121 42 Q155 48 141 70Z"/>');
  }
  if (frame.rain) shapes.push('<g class="jr-rain">' +
    Array.from({length:13}, (_, i) => '<path d="M' + (38+i*58) + ' ' + (70+i%3*18) + 'l-7 16"/>').join('') + '</g>');
  if (frame.snow) shapes.push('<g class="jr-snow">' +
    Array.from({length:12}, (_, i) => '<circle cx="' + (39+i*61) + '" cy="' + (74+i%3*21) + '" r="3"/>').join('') + '</g>');
  if (frame.fog) shapes.push('<g class="jr-fog"><path d="M0 120 Q95 105 200 118 T440 117 T800 119"/><path d="M0 148 Q115 133 245 145 T555 146 T800 144"/></g>');
  if (silhouette) shapes.push('<g class="jr-vehicle"><g transform="translate(0 153) scale(.65)">' +
    garageCarSvg(silhouette, true) + '</g></g>');
  return shapes.join('');
}
function journeyReplayHtml(entry, cars, isOpen = false) {
  const model = JourneyReplay.project(entry, cars);
  if (!model.available) return '';
  const fmt = t => t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'non renseigné';
  const phrase = f => !f.known ? 'Données non disponibles' : f.labels.length ? f.labels.join(' · ') : 'Aucun des phénomènes listés';
  const frames = model.frames.map(f => '<g class="jr-layer jr-' + f.kind + '">' +
    journeyReplayFrameSvg(f, model.silhouette) + '</g>').join('');
  const visual = '<figure class="jr-scene" data-mode="auto" data-running="false">' +
    '<svg viewBox="0 0 800 240" role="img" aria-label="Animation symbolique alternant prévision archivée et déclaration conducteur ; aucun suivi GPS">' +
    frames + '</svg><figcaption>ILLUSTRATION SANS ÉCHELLE · AUCUNE TRACE GPS, VITESSE OU MESURE D’ADHÉRENCE · JOUR/NUIT INCONNU</figcaption></figure>';
  const comparison = model.comparable ?
    '<p class="jr-sub"><b>' + esc({match:'Concordance des catégories',missed:'Phénomène non annoncé',unused:'Annonce non rencontrée',mixed:'Écart mixte'}[model.comparison]) + '</b>' +
      (model.missed.length ? ' · Déclaré sans annonce : ' + esc(model.missed.join(' · ')) : '') +
      (model.unused.length ? ' · Annoncé sans déclaration : ' + esc(model.unused.join(' · ')) : '') + '</p>' :
    '<p class="jr-sub">NON COMPARABLE · ' + (model.comparison === 'pending' ? 'aucun retour conducteur' : 'preuve de prévision insuffisante') + '.</p>';
  return '<details class="jr-replay" data-jr-key="' + esc(model.key) + '" data-dk="journey-' + esc(model.key) + '"' + (isOpen ? ' open' : '') + '>' +
    '<summary>🎬 JOURNEY REPLAY · débrief illustré</summary><div class="jr-body">' +
    '<div class="jr-route"><span>' + esc(model.from || 'Départ inconnu') + '</span><em aria-hidden="true">→</em><span>' + esc(model.to || 'Arrivée inconnue') + '</span></div>' +
    '<div class="jr-meta">' + (model.car ? 'VÉHICULE AU DÉPART · ' + esc(model.car) + ' · ' : 'VÉHICULE NON ENREGISTRÉ · ') +
      'Départ : ' + esc(fmt(model.departure)) + ' · Arrivée : ' + esc(fmt(model.arrival)) + '</div>' +
    '<div class="jr-controls" role="group" aria-label="Commandes Journey Replay">' +
    '<button type="button" class="btn sm" data-jr-act="play" aria-pressed="true">Pause</button>' +
    '<button type="button" class="btn sm jr-phase" data-jr-act="before" aria-pressed="false">AVANT</button>' +
    '<button type="button" class="btn sm jr-phase" data-jr-act="after" aria-pressed="false">APRÈS</button></div>' +
    visual + '<div class="jr-compare"><div><b>AVANT · PRÉVISION FIGÉE</b><span>' + esc(phrase(model.frames[0])) +
      '</span><span>Modèle météo archivé, pas une observation.</span></div><div><b>APRÈS · DÉCLARATION CONDUCTEUR</b><span>' +
      esc(phrase(model.frames[1])) + '</span><span>Retour subjectif, pas une mesure instrumentale.</span></div></div>' +
    comparison + (model.offlineAtDeparture ? '<p class="jr-sub">Prévision enregistrée hors ligne au départ.</p>' : '') +
    (model.missing.length ? '<ul class="jr-missing">' + model.missing.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
    '</div></details>';
}
// Lecture volatile et silencieuse : aucune écriture dans le journal.
const JOURNEY_REPLAY_MOTION = { ready: false, root: null, observer: null, media: null, seen: new WeakMap(), choices: new Map() };
function journeyReplaySync() {
  const m = JOURNEY_REPLAY_MOTION;
  if (!m.root) return;
  m.root.querySelectorAll('.jr-replay').forEach(d => {
    const key = d.dataset.jrKey, scene = d.querySelector('.jr-scene'), choice = m.choices.get(key) || { mode: 'auto', paused: false };
    if (!scene) return;
    const reduced = !!(m.media && m.media.matches);
    scene.dataset.mode = reduced && choice.mode === 'auto' ? 'before' : choice.mode;
    scene.dataset.running = String(!reduced && !choice.paused && d.open && m.seen.get(scene) === true &&
      !document.hidden && !m.root.hidden && !LOCKED());
    d.querySelectorAll('[data-jr-act]').forEach(button => {
      const action = button.dataset.jrAct;
      button.setAttribute('aria-pressed', String(action === 'play' ? !choice.paused && choice.mode === 'auto' && !reduced : action === choice.mode));
      if (action === 'play') button.textContent = choice.paused || choice.mode !== 'auto' || reduced ? 'Lecture' : 'Pause';
    });
  });
}
function journeyReplayAttach(root) {
  const m = JOURNEY_REPLAY_MOTION;
  if (!root) return;
  if (!m.ready) {
    m.ready = true;
    m.media = window.matchMedia('(prefers-reduced-motion: reduce)');
    m.media.addEventListener('change', journeyReplaySync);
    document.addEventListener('visibilitychange', journeyReplaySync);
    window.addEventListener('pagehide', () => {
      if (m.root) m.root.querySelectorAll('.jr-scene').forEach(x => x.dataset.running = 'false');
    });
    window.addEventListener('pageshow', journeyReplaySync);
  }
  if (m.root !== root) {
    m.root = root;
    root.addEventListener('click', e => {
      const button = e.target.closest('[data-jr-act]'), detail = button && button.closest('.jr-replay');
      if (!detail || !root.contains(detail)) return;
      const key = detail.dataset.jrKey, action = button.dataset.jrAct;
      const choice = m.choices.get(key) || {mode: 'auto', paused: false};
      if (action === 'play') {
        if (m.media && m.media.matches) { choice.mode = 'before'; choice.paused = true; }
        else if (choice.mode !== 'auto') { choice.mode = 'auto'; choice.paused = false; }
        else choice.paused = !choice.paused;
      } else if (action === 'before' || action === 'after') { choice.mode = action; choice.paused = true; }
      m.choices.set(key, choice);
      journeyReplaySync();
    });
    root.addEventListener('toggle', e => { if (e.target.matches('.jr-replay')) journeyReplaySync(); }, true);
  }
  if (m.observer) m.observer.disconnect();
  m.observer = typeof IntersectionObserver === 'function' ?
    new IntersectionObserver(entries => { entries.forEach(x => m.seen.set(x.target, x.isIntersecting)); journeyReplaySync(); }, {threshold: .05}) : null;
  root.querySelectorAll('.jr-scene').forEach(scene => {
    m.seen.set(scene, false);
    if (m.observer) m.observer.observe(scene);
  });
  journeyReplaySync();
}