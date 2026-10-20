/* Twin Garage : SVG/CSS locaux, lecture seule des modèles et de la timeline.
 * Aucune requête, minuterie d'animation, géométrie ou persistance supplémentaire. */
// @include app/garage-style.js
// Trois gabarits purement illustratifs, jamais déduits d'une mesure ou d'un
// capteur. Profil vers la droite, mêmes coordonnées dans les cartes et la scène.
function garageCarSvg(kind, scene = false) {
  const sport = kind === 'sport', touring = kind === 'touring';
  const shape = sport ? 'sport' : touring ? 'touring' : 'generic';
  const body = sport
    ? 'M12 54 L19 42 L53 38 L78 23 Q85 16 96 16 H151 Q165 16 174 29 L190 41 L229 45 Q248 48 253 58 L251 72 L243 78 H226 Q222 60 205 60 Q189 60 184 79 H80 Q76 60 57 60 Q39 60 35 79 H17 Q11 75 11 68 Z'
    : touring
      ? 'M12 56 Q14 44 24 41 L38 34 Q51 17 81 14 Q119 9 146 15 Q165 20 181 36 L196 46 L234 49 Q247 51 252 61 L249 75 L244 78 H226 Q221 60 204 60 Q187 60 183 79 H78 Q74 60 56 60 Q38 60 34 79 H18 Q11 76 12 65 Z'
      : 'M14 57 L27 39 L69 33 L96 17 H160 L191 39 L235 47 L250 62 L245 78 H224 Q220 61 203 61 Q186 61 182 79 H79 Q75 61 57 61 Q40 61 35 79 H16 Z';
  const glass = sport
    ? 'M77 39 L96 22 H117 V40 H76 Z M124 22 H150 Q160 23 168 33 L179 41 H124 Z'
    : touring
      ? 'M43 40 Q54 24 81 20 L111 19 V42 H41 Z M118 19 L141 20 Q158 24 174 42 H118 Z'
      : 'M77 38 L98 22 H120 V41 H75 Z M127 22 H158 L183 42 H127 Z';
  const start = scene
    ? '<g class="twin-car-svg twin-car-' + shape + '" data-shape="' + shape + '">'
    : '<svg class="twin-car-svg twin-car-' + shape + '" data-shape="' + shape + '" viewBox="0 0 264 100" aria-hidden="true" focusable="false">';
  const back = sport
    ? '<path class="twin-spoiler" d="M8 33 L52 33 L61 38 L18 39 L9 37 Z"/>'
    : '';
  const details = sport
    ? '<path class="twin-reflection" d="M29 44 L53 42 M89 20 H150 M195 44 L225 47"/>' +
      '<path class="twin-body-shade" d="M19 62 L37 58 L36 77 L17 76 Z M81 71 H182 L184 77 H79 Z M227 70 L249 68 L245 77 H226 Z"/>' +
      '<path class="twin-character" d="M34 52 L87 49 L172 51 L218 47 M119 42 V69 M179 44 L183 66 M124 47 H136"/>' +
      '<path class="twin-mirror" d="M178 38 L187 39 L188 44 L176 43 Z"/>' +
      '<path class="twin-grille" d="M241 58 L252 59 L249 70 L239 70 Z"/>' +
      '<path class="twin-lamp" d="M226 48 L244 51 L239 56 L223 54 Z"/>' +
      '<path class="twin-rear-lamp" d="M17 46 L25 44 L30 50 L21 53 L15 51 Z"/>' +
      '<path class="twin-sport-accent" d="M19 76 H35 M82 80 H183 M227 79 H245"/>' +
      '<path class="twin-intake" d="M20 68 L31 65 L30 72 H20 Z M244 72 H250"/>'
    : touring
      ? '<path class="twin-reflection" d="M34 40 Q51 18 81 16 Q119 11 145 17 M197 48 L231 51"/>' +
        '<path class="twin-body-shade" d="M17 65 L34 60 L34 75 H18 Z M79 72 Q131 76 182 70 L182 78 H79 Z"/>' +
        '<path class="twin-character" d="M30 54 Q90 48 151 51 Q195 50 224 55 M113 43 V69 M178 45 L183 66 M119 49 H132"/>' +
        '<path class="twin-chrome" d="M41 44 Q110 46 177 45 M82 78 H180"/>' +
        '<path class="twin-mirror" d="M181 41 Q192 39 195 44 L191 48 H181 Z"/>' +
        '<path class="twin-lamp" d="M219 50 Q235 49 245 54 L239 59 L218 57 Z"/>' +
        '<path class="twin-rear-lamp" d="M15 49 L24 46 L29 50 V58 L14 58 Z"/>' +
        '<path class="twin-grille" d="M246 62 L252 63 L249 71 L242 72 Z"/>'
      : '<path class="twin-character" d="M80 44 V69 M125 44 V69 M145 49 H155"/>' +
        '<path class="twin-lamp" d="M228 50 L245 56 L241 59 L225 56 Z"/>' +
        '<path class="twin-rear-lamp" d="M18 48 L27 45 V57 H18 Z"/>';
  const wheels = [57, 204].map(x => {
    const spokes = sport
      ? Array.from({length:5}, (_, i) => {
        const a = i * Math.PI * 2 / 5;
        const x1 = (x + Math.cos(a) * 3).toFixed(2), y1 = (78 + Math.sin(a) * 3).toFixed(2);
        const x2 = (x + Math.cos(a) * 9).toFixed(2), y2 = (78 + Math.sin(a) * 9).toFixed(2);
        return 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2;
      }).join(' ')
      : 'M' + (x-8) + ' 78 H' + (x+8) + ' M' + x + ' 70 V86 M' + (x-6) + ' 72 L' + (x+6) + ' 84 M' + (x+6) + ' 72 L' + (x-6) + ' 84';
    return '<g class="twin-wheel"><circle class="twin-rubber" cx="' + x + '" cy="78" r="17"/>' +
      '<circle class="twin-rim" cx="' + x + '" cy="78" r="10"/>' +
      '<path class="twin-spokes" d="' + spokes + '"/><circle class="twin-hub" cx="' + x + '" cy="78" r="2.5"/></g>';
  }).join('');
  return start +
    '<ellipse class="twin-shadow" cx="132" cy="95" rx="116" ry="3.5"/>' + back +
    '<path class="twin-paint" d="' + body + '"/>' +
    '<path class="twin-glass" d="' + glass + '"/>' + details + wheels +
    (scene ? '</g>' : '</svg>');
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
  // Direction météo = provenance depuis le nord ; flèche SVG = vers l'est.
  // Conversion vers le sens d'écoulement : direction + 180 - 90 degrés.
  if (s.wind && s.windDirection != null) shapes += '<g transform="rotate(' + ((s.windDirection+90)%360) + ' ' + w/2 + ' 93)"><g class="twin-wind twin-animated"><path d="M25 93 H' + (w-25) + ' m-12 -5 l12 5 -12 5"/></g></g>';
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
    uxFold('garage-sources', 'Sources et confiance', '<p class="sub">Planning : contexte partagé du prochain trajet. Météo : ' + (scene.demo ? 'simulation du mode démonstration, pas une prévision réelle.' : 'prévisions Open-Meteo du parcours déjà chargées lorsqu’elles sont disponibles, pas une observation terrain.') + '</p>' +
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
