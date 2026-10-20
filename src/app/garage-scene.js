/* Scène secondaire Twin Garage : SVG/CSS locaux et lecture seule des modèles.
 * Le cockpit cartographique est géré séparément par live-route-view. */
// @include app/garage-style.js
// Trois gabarits purement illustratifs, jamais déduits d'une mesure ou d'un
// capteur. Profil vers la droite, mêmes coordonnées dans les cartes et la scène.
// V1.5 « manga touge » : encrage épais, aplats cel-shading à bord net, reflets
// durs, roues à l'échelle. Proportions reprises des cotes publiques de chaque
// gabarit (longueur, empattement, porte-à-faux, hauteur, diamètre de roue),
// sans livrée, logo ni élément repris d'une œuvre existante.
const GARAGE_CAR = {
  // Citadine sportive : caisse courte, porte-à-faux réduits, becquet de pavillon.
  sport: {
    wheels: [52, 200],
    body: 'M22 86 L31 86 A22.5 22.5 0 1 1 73 86 L179 86 A22.5 22.5 0 1 1 221 86 L241 86 L252 89 L252 86 Q253.5 72 249 65 L243 58 Q216 51 188 48 L151 23 Q112 18.5 72 20.5 L62 22 Q45 30 31 45 L23 56 Q18 66 19 78 Z',
    glass: 'M181 49 L151 27.5 Q120 24 86 25 Q76 27 71 36 L75 47.5 Z',
    shade: 'M19.4 72 L30.3 72 A22.5 22.5 0 0 0 31 86 L22 86 Z M73.7 72 L178.3 72 A22.5 22.5 0 0 0 179 86 L73 86 A22.5 22.5 0 0 0 73.7 72 Z M221.7 72 L252.6 72 L252 86 L221 86 A22.5 22.5 0 0 0 221.7 72 Z',
    shine: 'M74 52.5 L186 50.5 L193 53 L76 55.5 Z M198 52.5 L236 57.5 L231 59.5 L199 55.5 Z M92 21.8 L140 22.6 L135 24.6 L95 23.8 Z',
    glare: 'M163 31 L170 31 L153 47.5 L146 47.5 Z M173 36 L176 36 L165 47.5 L162 47.5 Z M104 27 L109 27 L101 47 L96 47 Z',
    lines: 'M121 26 V84 M181.5 50 Q184.5 66 180 81 M77 47.5 Q73.5 64 75.5 81 M149 56.5 H159 M97 55.5 H107 M34 58 L120 61.5 L236 62.5',
    pillar: 'M121 26.2 V48.6',
    lamp: 'M237 58.5 L249.5 64 L247.5 67.5 L232.5 63 Z',
    rear: 'M27.5 50 L36 48 L35 56 L22.5 58.5 Z',
    grille: 'M240 73.5 L252.4 73.5 L252.1 82 L239 82 Z M226 75 L234 75 L233 81 L225 81 Z',
    mirror: 'M175.5 45 L186 43.5 L188 50 L177.5 51.5 Z',
    extra: '<path class="twin-spoiler" d="M84 18.5 L57 18.6 L51 23.2 L60 26 L80 22.6 Z"/>' +
      '<path class="twin-sport-accent" d="M76 86.6 H177 M232 88.4 L251 89.6 M21 86.4 H30"/>'
  },
  // Compacte cinq portes : capot long et plongeant, pare-brise très incliné, hayon arrondi.
  touring: {
    wheels: [56, 198],
    body: 'M16 86 L35 86 A22.5 22.5 0 1 1 77 86 L177 86 A22.5 22.5 0 1 1 219 86 L240 86 Q250 86 251 80 L251 70 Q250.5 62 244 58 Q222 50 190 45 L136 17 Q100 11 66 17 Q40 24 24 44 Q15 58 15 74 Z',
    glass: 'M184 46.5 L137 20.5 Q102 15.5 70 20.5 Q52 27 42.5 42 L45 46.5 Z',
    shade: 'M15 72 L34.3 72 A22.5 22.5 0 0 0 35 86 L16 86 Z M77.7 72 L176.3 72 A22.5 22.5 0 0 0 177 86 L77 86 A22.5 22.5 0 0 0 77.7 72 Z M219.7 72 L251 72 L251 80 Q250 86 240 86 L219 86 A22.5 22.5 0 0 0 219.7 72 Z',
    shine: 'M48 50 L186 49 L195 52 L50 53 Z M198 49.5 L238 56 L232 58 L200 52.5 Z M84 15.6 L130 16.8 L124 18.8 L88 17.8 Z',
    glare: 'M160 25 L167 25 L148 46 L141 46 L160 25 Z M171 31 L174 31 L161 46 L158 46 Z M99 18 L104 18 L95 46 L90 46 Z',
    lines: 'M128 18.5 V84 M186 47 Q190 65 184 81 M82 46.5 Q79 64 80.5 81 M156 55 H166 M100 54.5 H110 M28 57 Q130 60 238 61',
    pillar: 'M128 18.8 V47 M73 20 Q66 32 69 46.6',
    lamp: 'M224 53.5 Q237.5 54.5 247.5 60 L244.5 64.5 Q232 61.5 220.5 58 Z',
    rear: 'M21.5 49 L31 45.5 L33 54 L19.5 58 Z',
    grille: 'M237.5 68.5 L251 68.5 L251 79.5 L240 79 Z M226 73 L233 73 L233 80 L226 80 Z',
    mirror: 'M180 42 Q190 40.5 193 46 L189 50 H180 Z',
    extra: '<path class="twin-chrome" d="M45 46.5 Q52 27 70 20.5 Q102 15.5 137 20.5 L185 46.6 M46 48.4 L186 48.4"/>'
  },
  // Gabarit neutre quand le libellé ne correspond à aucun modèle reconnu.
  generic: {
    wheels: [54, 200],
    body: 'M20 86 L33 86 A22.5 22.5 0 1 1 75 86 L179 86 A22.5 22.5 0 1 1 221 86 L242 86 Q250 86 250 80 L250 68 Q248 61 242 58 L188 47 L152 22 Q112 18 74 20 Q50 26 30 44 Q20 56 20 72 Z',
    glass: 'M182 48 L152 26 Q116 22 78 24 Q60 30 48 44 L50 47 Z',
    shade: 'M20 72 L32.3 72 A22.5 22.5 0 0 0 33 86 L20 86 Z M75.7 72 L178.3 72 A22.5 22.5 0 0 0 179 86 L75 86 A22.5 22.5 0 0 0 75.7 72 Z M221.7 72 L250 72 L250 80 Q250 86 242 86 L221 86 A22.5 22.5 0 0 0 221.7 72 Z',
    shine: 'M52 51 L184 50 L192 53 L54 54 Z M92 19.5 L138 20.6 L132 22.6 L96 21.6 Z',
    glare: 'M162 29 L168 29 L152 46 L146 46 Z',
    lines: 'M124 24 V84 M182.5 48.5 Q186 65 181 81 M79 46.5 Q76 64 77.5 81 M151 55 H160 M99 54.5 H108',
    pillar: 'M124 24.2 V47.5',
    lamp: 'M232 57 L246 61 L243.5 64.5 L229 61.5 Z',
    rear: 'M22 50 L32 46 V56 L21.5 58 Z',
    grille: 'M238 70 L250 70 V79 L239 79 Z',
    mirror: 'M176 43 L186 42 L187 48 L177 49 Z',
    extra: ''
  }
};
function garageCarSvg(kind, scene = false) {
  const shape = GARAGE_CAR[kind] ? kind : 'generic', g = GARAGE_CAR[shape], sport = shape === 'sport';
  const start = scene
    ? '<g class="twin-car-svg twin-car-' + shape + '" data-shape="' + shape + '">'
    : '<svg class="twin-car-svg twin-car-' + shape + '" data-shape="' + shape + '" viewBox="0 0 264 100" aria-hidden="true" focusable="false">';
  // Roues : pneu, flanc, jante, étrier (sportive), rayons et moyeu. Dans la
  // scène, seul le groupe des rayons tourne, suspendu avec le reste du mouvement.
  const wheels = g.wheels.map(x => {
    const cy = 76, ray = (a, r1, r2) => 'M' + (x + Math.cos(a) * r1).toFixed(2) + ' ' + (cy + Math.sin(a) * r1).toFixed(2) +
      ' L' + (x + Math.cos(a) * r2).toFixed(2) + ' ' + (cy + Math.sin(a) * r2).toFixed(2);
    const spokes = Array.from({length: sport ? 10 : 5}, (_, i) => sport
      ? ray((Math.floor(i / 2) * 72 + (i % 2 ? 7 : -7)) * Math.PI / 180, 3.4, 11.6)
      : ray((i * 72 + 18) * Math.PI / 180, 3.4, 11.6)).join(' ');
    const caliper = sport
      ? '<path class="twin-caliper" d="M' + (x + 4.4) + ' ' + (cy - 8.4) + ' A9.5 9.5 0 0 1 ' + (x + 9.2) + ' ' + (cy - 2.4) + '"/>'
      : '';
    return '<g class="twin-wheel"><circle class="twin-rubber" cx="' + x + '" cy="' + cy + '" r="18"/>' +
      '<circle class="twin-sidewall" cx="' + x + '" cy="' + cy + '" r="15.2"/>' +
      '<circle class="twin-rim" cx="' + x + '" cy="' + cy + '" r="12.6"/>' + caliper +
      '<g class="twin-spin' + (scene ? ' twin-animated' : '') + '"><path class="twin-spokes" d="' + spokes + '"/>' +
      '<circle class="twin-hub" cx="' + x + '" cy="' + cy + '" r="2.8"/></g>' +
      '<path class="twin-rim-shine" d="M' + (x - 9.5) + ' ' + (cy - 5) + ' A11 11 0 0 1 ' + (x - 3) + ' ' + (cy - 10.6) + '"/></g>';
  }).join('');
  const wells = g.wheels.map(x => 'M' + (x - 21) + ' 86 A22.5 22.5 0 1 1 ' + (x + 21) + ' 86 Z').join(' ');
  // Détourage clair sous l'encrage : la silhouette reste lisible sur fond sombre.
  const halo = '<path class="twin-halo" d="' + g.body + ' ' + g.wheels.map(x => 'M' + (x - 18) + ' 76 A18 18 0 1 0 ' + (x + 18) + ' 76 A18 18 0 1 0 ' + (x - 18) + ' 76 Z').join(' ') + '"/>';
  return start +
    '<ellipse class="twin-shadow" cx="136" cy="94.5" rx="118" ry="3.6"/>' +
    halo + '<path class="twin-well" d="' + wells + '"/>' +
    '<path class="twin-paint" d="' + g.body + '"/>' +
    '<path class="twin-body-shade" d="' + g.shade + '"/>' +
    '<path class="twin-reflection" d="' + g.shine + '"/>' +
    '<path class="twin-glass" d="' + g.glass + '"/>' +
    '<path class="twin-glare" d="' + g.glare + '"/>' +
    '<path class="twin-pillar" d="' + g.pillar + '"/>' +
    '<path class="twin-character" d="' + g.lines + '"/>' +
    '<path class="twin-mirror" d="' + g.mirror + '"/>' +
    '<path class="twin-grille" d="' + g.grille + '"/>' +
    '<path class="twin-lamp" d="' + g.lamp + '"/>' +
    '<path class="twin-rear-lamp" d="' + g.rear + '"/>' +
    g.extra +
    '<path class="twin-ink" d="' + g.body + '"/>' +
    wheels +
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
  if (!scene.available) return '<div id="garageTrip" class="twin-trip"><div class="mod-h"><h3>PROCHAIN TRAJET · LIVE ROUTE</h3><span class="src est">INDISPONIBLE</span></div><p class="garage-empty">Aucun prochain trajet connu. Les fiches restent consultables ; aucun parcours n’est créé pour animer le Garage.</p></div>';
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
      (scene.hasNight ? '<path class="twin-headlights" d="M247 61 L345 34 L345 92 L247 66 Z"/>' : '') +
      '<path class="twin-speed" d="M-70 30 H8 M-40 44 H14 M-90 58 H4 M-55 72 H18 M-80 86 H10"/>' +
      garageCarSvg(active.silhouette, true) + '</g>' : '') + '</g></svg>';
  return '<div id="garageTrip" class="twin-trip"><div class="mod-h"><h3>PROCHAIN TRAJET · LIVE ROUTE</h3><span class="src est">' + esc(scene.status) + '</span></div>' +
    '<div class="twin-route"><div><small>DÉPART</small><b>' + esc(scene.from) + '</b></div><span aria-hidden="true">→</span><div><small>DESTINATION</small><b>' + esc(scene.to) + '</b></div></div>' +
    '<div class="twin-caption"><span class="num">' + esc(times) + '</span><span>' + esc(active ? active.name + ' · voiture active' : 'Voiture active à choisir') + '</span></div>' +
    garageLiveHtml() +
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
