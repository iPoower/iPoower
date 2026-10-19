/* Twin Garage : SVG/CSS locaux, lecture seule des modèles et de la timeline.
 * Aucune requête, minuterie d'animation, géométrie ou persistance supplémentaire. */
// @include app/garage-style.js
function garageCarSvg(kind, scene = false) {
  const sport = kind === 'sport', touring = kind === 'touring';
  const body = sport ? 'M18 60 L32 40 L65 34 L96 12 L167 12 L200 36 L235 45 L246 63 L241 73 L17 73 Z' :
    touring ? 'M16 59 L27 32 Q35 17 58 14 L154 12 Q172 12 189 31 L208 43 L238 50 L246 66 L239 76 L17 76 Z' :
      'M17 60 L31 39 L70 31 L99 13 L165 14 L199 38 L233 46 L245 64 L239 75 L17 75 Z';
  const glass = touring ? 'M41 33 L58 20 L106 19 L106 38 L39 38 Z M113 19 L153 18 Q168 19 181 36 L113 38 Z' :
    'M78 34 L102 18 L128 18 L128 36 Z M135 18 L163 18 L187 36 L135 36 Z';
  return (scene ? '<g class="twin-car-svg">' : '<svg class="twin-car-svg" viewBox="0 0 264 100" aria-hidden="true" focusable="false">') +
    '<ellipse class="twin-shadow" cx="132" cy="87" rx="116" ry="7"/>' +
    (sport ? '<path class="twin-paint" d="M26 28 H65 L69 34 H26 Z"/>' : '') +
    '<path class="twin-paint" d="' + body + '"/><path class="twin-glass" d="' + glass + '"/>' +
    '<path class="twin-trim" d="M81 43 V68 M141 42 V69 M97 45 H107 M158 45 H167 M22 70 H237"/>' +
    '<path class="twin-lamp" d="M225 47 L239 53 L241 58 L225 56 Z"/><path class="twin-rear" d="M23 44 L30 42 V55 H20 Z"/>' +
    (sport ? '<path class="twin-rear" d="M81 74 H176"/>' : '') +
    [61,202].map(x => '<g class="twin-wheel"><circle class="twin-rubber" cx="' + x + '" cy="73" r="19"/><circle class="twin-rim" cx="' + x + '" cy="73" r="11"/><path class="twin-spokes" d="M' + (x-9) + ' 73 H' + (x+9) + ' M' + x + ' 64 V82 M' + (x-6) + ' 67 L' + (x+6) + ' 79 M' + (x+6) + ' 67 L' + (x-6) + ' 79"/></g>').join('') + (scene ? '</g>' : '</svg>');
}
function garageWeatherSources() {
  const frames = new Map(), add = (m, at) => { if (m && m.hs) frames.set(m.hs, { at, mode: m.mode, days: m.days }); };
  for (const [id, m] of Object.entries(M)) add(m, RAW[id] && RAW[id].t);
  for (const [id, m] of Object.entries(MIDM)) add(m, MIDP[id] && MIDP[id].t);
  for (const c of Object.values(CALM)) if (c) add(c.m, c.t);
  for (const c of Object.values(LEGM)) if (c && c.models) for (const m of c.models) add(m, c.t);
  return q => frames.get(q.hs) || null;
}
function garageWeatherText(s) {
  const lines = [];
  if (s.rain) lines.push('Pluie prévue');
  if (s.snow) lines.push('Neige prévue');
  if (s.fog) lines.push('Brume / brouillard prévu');
  if (!s.fog && s.visibility != null && s.visibility < 1000) lines.push('Visibilité prévue ' + f0(s.visibility) + ' m');
  if (s.sun && s.phase === 'day') lines.push('Éclaircies prévues');
  if (s.wind) lines.push('Vent' + (s.windSpeed != null ? ' ' + f1(s.windSpeed) + ' km/h' : '') + (s.gust != null ? ' · rafales ' + f0(s.gust) + ' km/h' : ''));
  if (s.phase === 'night') lines.push('Nuit · éphémérides du modèle');
  else if (s.phase === 'day') lines.push('Jour · éphémérides du modèle');
  else lines.push('Jour / nuit non déterminé');
  return lines;
}
function garageWeatherSvg(s, n, count) {
  const w = 800 / count;
  let shapes = '<rect class="twin-sky ' + (s.phase === 'night' ? 'twin-night' : '') + '" width="800" height="210"/>';
  if (s.phase === 'night') shapes += '<circle class="twin-moon" cx="' + w*.63 + '" cy="38" r="14"/>' + [22,57,100,160].map((x,i)=>'<circle class="twin-star" cx="' + (x % w) + '" cy="' + (20+i*14) + '" r="1.5"/>').join('');
  if (s.sun && s.phase === 'day') shapes += '<circle class="twin-sun-soft" cx="' + w*.63 + '" cy="42" r="37"/><circle class="twin-sun" cx="' + w*.63 + '" cy="42" r="19"/>';
  if (s.rain || s.snow || s.fog) shapes += '<path class="twin-cloud" d="M18 54 Q0 35 28 29 Q31 10 53 23 Q73 10 85 34 Q112 40 99 54 Z"/>';
  if (s.rain) shapes += '<g class="twin-rain twin-animated">' + Array.from({length:12},(_,i)=>'<path d="M' + (14+i*67)%w + ' ' + (58+i%3*34) + ' l-5 14"/>').join('') + '</g>';
  if (s.snow) shapes += '<g class="twin-snow twin-animated">' + Array.from({length:9},(_,i)=>'<circle cx="' + (21+i*79)%w + '" cy="' + (55+i%3*35) + '" r="2.5"/>').join('') + '</g>';
  if (s.fog) shapes += '<g class="twin-fog twin-animated"><path d="M0 117 Q50 101 110 118 T270 115 T450 120 T800 114"/><path d="M0 144 Q80 127 160 141 T370 140 T800 144"/></g>';
  // Le modèle horaire courant ne contient généralement pas de direction :
  // on montre alors les valeurs du vent, sans inventer un sens de déplacement.
  if (s.wind && s.windDirection != null) shapes += '<g transform="rotate(' + ((s.windDirection+180)%360) + ' ' + w/2 + ' 93)"><g class="twin-wind twin-animated"><path d="M25 93 H' + (w-25) + ' m-12 -5 l12 5 -12 5"/></g></g>';
  return '<svg x="' + n*w + '" y="0" width="' + w + '" height="210" viewBox="0 0 ' + w + ' 210" overflow="hidden">' + shapes + '</svg>';
}
function garageTripHtml(scene, active) {
  if (!scene.available) return '<div id="garageTrip" class="twin-trip"><div class="mod-h"><h3>PROCHAIN TRAJET · 2D</h3><span class="src est">INDISPONIBLE</span></div><p class="garage-empty">Aucun prochain trajet connu. Les fiches restent consultables ; aucun parcours n’est créé pour animer le Garage.</p></div>';
  const samples = scene.samples;
  const times = (scene.departure ? scene.departure.slice(8,10) + '/' + scene.departure.slice(5,7) + ' · ' + scene.departure.slice(11,16) : 'Horaire à confirmer') +
    (scene.arrival ? ' → ' + scene.arrival.slice(11,16) : '');
  const svg = '<svg class="twin-scene-svg" viewBox="0 0 800 240" aria-hidden="true" focusable="false">' +
    '<rect class="twin-sky" width="800" height="240"/>' + samples.map((s,n)=>garageWeatherSvg(s,n,samples.length)).join('') +
    '<path class="twin-horizon" d="M0 143 Q80 110 150 139 T320 133 T490 142 T650 131 T800 139 V240 H0 Z"/>' +
    '<path class="twin-land" d="M0 162 Q120 148 260 166 T530 158 T800 166 V240 H0 Z"/>' +
    '<path class="twin-road" d="M0 184 H800 V235 H0 Z"/><path class="twin-edge" d="M0 185 H800 M0 234 H800"/>' +
    '<path class="twin-lanes" d="M0 211 H800"/>' +
    '<g class="twin-drive twin-animated">' + (active ? '<g transform="translate(0 153) scale(.65)">' +
      (scene.hasNight ? '<path class="twin-headlights" d="M241 53 L335 25 L335 79 L241 58 Z"/>' : '') +
      garageCarSvg(active.silhouette, true) + '</g>' : '') + '</g></svg>';
  return '<div id="garageTrip" class="twin-trip"><div class="mod-h"><h3>PROCHAIN TRAJET · 2D</h3><span class="src est">' + esc(scene.status) + '</span></div>' +
    '<div class="twin-route"><div><small>DÉPART</small><b>' + esc(scene.from) + '</b></div><span aria-hidden="true">→</span><div><small>DESTINATION</small><b>' + esc(scene.to) + '</b></div></div>' +
    '<div class="twin-caption"><span class="num">' + esc(times) + '</span><span>' + esc(active ? active.name + ' · voiture active' : 'Voiture active à choisir') + '</span></div>' +
    '<figure class="twin-scene" data-animate="' + (scene.animate && !!active) + '" data-running="false">' + svg +
    '<figcaption>PRÉVISUALISATION ILLUSTRATIVE · SCHÉMA SANS ÉCHELLE<br>Animation en boucle, sans suivi GPS.</figcaption></figure>' +
    '<div class="twin-tools"><label class="btn sm twin-motion"><input id="garageMotion" type="checkbox" checked> Animations</label><span class="sub">' +
    (scene.animate && active ? 'Pause automatique hors écran.' : 'Vue statique · données à confirmer ou cache.') + '</span></div>' +
    (samples.length ? '<ol class="twin-samples">' + samples.map(s => '<li><small>POINT ' + s.index + ' / ' + scene.count + (s.at ? ' · ' + esc(s.at.slice(11,16)) : '') + '</small><b>' +
      (s.temperature == null ? 'Température indisponible' : f1(s.temperature) + ' °C') + '</b>' + (s.place ? '<span>' + esc(s.place) + '</span>' : '') +
      '<span>' + esc(garageWeatherText(s).join(' · ')) + '</span></li>').join('') + '</ol>' : '<p class="garage-empty">Prévisions de ce trajet absentes. Aucun effet météo représenté.</p>') +
    uxFold('garage-sources', 'Sources et confiance', '<p class="sub">Planning : contexte partagé du prochain trajet. Météo : modèles Open-Meteo déjà chargés pour les points de ce parcours, pas une observation terrain.</p>' +
      '<p class="sub">' + esc(scene.complete ? 'Couverture des paramètres du moteur disponible.' : 'DONNÉES INSUFFISANTES · couverture météo ou provenance incomplète.') + '</p>' +
      '<ul class="lab-why">' + samples.map(s=>'<li>Point ' + s.index + ' · ' + (s.received ? 'Reçu le ' + esc(new Date(s.received).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})) : 'Réception inconnue') +
        ' · ' + esc(({FRESH:'frais',AGING:'à confirmer',STALE:'ancien',UNKNOWN:'âge inconnu'}[s.fresh] || 'âge inconnu')) + (s.cache ? ' · cache' : '') + '</li>').join('') + '</ul>' +
      '<p class="sub">Jusqu’à trois points existants sont montrés. Leur espacement est schématique : aucune distance, vitesse, adhérence ni température mesurée de chaussée n’est déduite du dessin. Le sens du vent reste absent si la prévision ne le fournit pas.</p>', 'Prévisions · réception · limites') + '</div>';
}
function garagePressure(p) {
  return !p ? 'Cible non renseignée' : p.axles ? 'AV ' + f1(p.axles.av) + ' / AR ' + f1(p.axles.ar) + ' bar' : f1(p.bar) + ' bar';
}
function garageCompareHtml(cars, trip, scene) {
  const rows = Garage.comparison(cars, trip, scene);
  const body = '<p class="sub">Même trajet, même météo. Diagnostics du moteur existant ; aucun classement de sécurité entre les véhicules.</p><div class="garage-grid">' + rows.map(r => {
    const c = cars.find(c=>c.id===r.id), t = c.tyre;
    return '<article class="twin-compare"><h4>' + esc(c.name) + '</h4><span class="decision-confidence ' + (r.level == null ? 'lvx' : 'lv' + r.level) + '">' + esc(r.label) + '</span>' +
      '<dl><dt>Monte déclarée</dt><dd>' + esc(t ? [t.type,t.model || 'Modèle absent',t.size || 'Dimensions absentes'].join(' · ') : 'Non confirmée') + '</dd>' +
      '<dt>Usure</dt><dd>' + (t && t.tread ? f1(t.tread.mm) + ' mm · ' + (t.tread.estimated ? 'estimée, à mesurer' : 'mesure déclarée') + (t.tread.date ? ' · ' + garageDate(t.tread.date) : ' · date inconnue') : 'Aucune profondeur disponible') + '</dd>' +
      '<dt>Pression cible</dt><dd>' + esc(garagePressure(t && t.pressure)) + '</dd><dt>Contrôle déclaré</dt><dd>' + (t && t.pressure && t.pressure.checked ? garageDate(t.pressure.checked) + ' · aucune valeur mesurée enregistrée' : 'Aucun contrôle daté') + '</dd></dl>' +
      (r.reasons.length ? '<ul class="lab-why">' + r.reasons.map(x=>'<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="sub">' + (r.level == null ? 'Vigilances du trajet non évaluables.' : 'Aucun signal critique calculé à partir de ces prévisions ; ce n’est pas une garantie de sécurité.') + '</p>') +
      (r.missing.length ? '<p class="garage-empty">À compléter : ' + esc(r.missing.join(' · ')) + '.</p>' : '') + '</article>';
  }).join('') + '</div>';
  return uxFold('garage-comparison','Préparer et comparer les véhicules',body,'Montes · contrôles · vigilances explicables');
}
// Un seul observateur, aucun RAF ni intervalle. Les listeners ne font que
// basculer animation-play-state ; une reprise iOS ne recharge rien ici.
const GARAGE_MOTION = { node: null, observer: null, visible: false, paused: false, media: null, ready: false };
function garageMotionState() {
  const m = GARAGE_MOTION, node = m.node;
  if (!node) return;
  node.dataset.running = String(m.visible && !m.paused && !(m.media && m.media.matches) && !document.hidden && UI.view === 'garage' && !LOCKED() && node.dataset.animate === 'true');
}
function garageMotionDetach() {
  const m = GARAGE_MOTION;
  if (m.node) m.node.dataset.running = 'false';
  if (m.observer) m.observer.disconnect();
  m.node = null; m.observer = null; m.visible = false;
}
function garageMotionAttach(el) {
  const m = GARAGE_MOTION;
  if (!m.ready) {
    m.ready = true; m.media = window.matchMedia('(prefers-reduced-motion: reduce)');
    m.media.addEventListener('change', garageMotionState);
    document.addEventListener('visibilitychange', garageMotionState);
    window.addEventListener('pagehide', () => { if (m.node) m.node.dataset.running = 'false'; });
    window.addEventListener('pageshow', garageMotionState);
    el.addEventListener('change', e => { if (e.target.id === 'garageMotion') { m.paused = !e.target.checked; garageMotionState(); } });
  }
  const input = el.querySelector('#garageMotion'); if (input) input.checked = !m.paused;
  const node = el.querySelector('.twin-scene');
  if (node !== m.node) {
    garageMotionDetach(); m.node = node;
    if (node && typeof IntersectionObserver === 'function') {
      m.observer = new IntersectionObserver(entries => { for (const e of entries) if (e.target === m.node) { m.visible = e.isIntersecting; garageMotionState(); } }, { threshold: .05 });
      m.observer.observe(node);
    } // Sans IntersectionObserver : vue statique plutôt qu'une animation invisible.
  }
  garageMotionState();
}
