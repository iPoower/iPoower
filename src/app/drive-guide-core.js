/* Guidage tournant par tournant du mode « EN DIRECT » (21/11/2026, lot 3). Module PUR : aucune lecture ni écriture, aucun réseau.
 * Consignes en français générées UNIQUEMENT à partir des étapes OSRM (type de manœuvre, direction, nom ou numéro de route, sortie
 * de rond-point) : rien n'est deviné. Étape inconnue → « Continuez » sans direction inventée. Voies conseillées seulement si OSRM
 * les fournit. Distances par paliers : au-delà de 1 km la distance arrondie, puis 1 km, 500 m, 200 m, 100 m et « maintenant ».
 * Itinéraire indicatif : la signalisation prime. */
const DriveGuide = (() => {
  const finite = Number.isFinite;
  const DIR = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
    'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
  const side = m => m === 'left' || m === 'slight left' || m === 'sharp left' ? 'gauche' : m === 'right' || m === 'slight right' || m === 'sharp right' ? 'droite' : null;
  const ord = n => n === 1 ? '1re' : n + 'e';
  // « sur Avenue X » / « vers A 26 » / rien (jamais de nom inventé).
  const where = (st, prep = 'sur') => st.name ? ' ' + prep + ' ' + st.name : st.ref ? ' vers ' + st.ref : '';
  function text(st) {
    if (!st || typeof st.type !== 'string') return 'Continuez';
    const m = st.modifier, d = DIR[m];
    switch (st.type) {
      case 'depart': return 'Partez' + where(st);
      case 'arrive': return side(m) ? 'Arrivée à destination, à ' + side(m) : 'Arrivée à destination';
      case 'turn': return m === 'uturn' ? 'Faites demi-tour' + where(st) : m === 'straight' ? 'Continuez tout droit' + where(st) : d ? 'Tournez ' + d + where(st) : 'Tournez' + where(st);
      case 'end of road': return d && m !== 'straight' ? 'Au bout de la route, tournez ' + d + where(st) : 'Au bout de la route' + where(st, 'vers');
      case 'new name': case 'continue': return m && m !== 'straight' && d ? 'Continuez ' + d + where(st) : 'Continuez' + where(st);
      case 'merge': return 'Insérez-vous' + (side(m) ? ' à ' + side(m) : '') + where(st);
      case 'on ramp': return 'Prenez la bretelle' + (side(m) ? ' à ' + side(m) : '') + where(st, 'vers');
      case 'off ramp': return 'Prenez la sortie' + (side(m) ? ' à ' + side(m) : '') + where(st, 'vers');
      case 'fork': return side(m) ? 'Restez à ' + side(m) + where(st) : 'À l’embranchement' + where(st, 'vers');
      case 'roundabout': case 'rotary': return 'Au rond-point, ' + (Number.isInteger(st.exit) && st.exit > 0 && st.exit < 13 ? 'prenez la ' + ord(st.exit) + ' sortie' : 'sortez') + where(st);
      case 'roundabout turn': return 'Au rond-point, tournez ' + (d || '') + where(st);
      case 'exit roundabout': case 'exit rotary': return 'Sortez du rond-point' + where(st);
      default: return 'Continuez' + where(st);
    }
  }
  // Flèche (forme seulement, aucune couleur) : identifiant de pictogramme dessiné par la vue.
  function arrow(st) {
    if (!st) return 'straight';
    if (st.type === 'arrive') return 'arrive';
    if (st.type === 'roundabout' || st.type === 'rotary' || st.type === 'roundabout turn') return 'roundabout';
    const m = st.modifier;
    return m === 'uturn' ? 'uturn' : m && /^(left|right|slight left|slight right|sharp left|sharp right)$/.test(m) ? m.replace(' ', '-') : 'straight';
  }
  // Paliers : > 1 km → distance arrondie (« 3,4 km ») ; puis « 1 km », « 500 m », « 200 m », « 100 m » ; ≤ 30 m « maintenant ».
  function distLabel(d) {
    if (!finite(d) || d < 0) return '';
    if (d <= 30) return 'maintenant';
    if (d <= 100) return '100 m';
    if (d <= 200) return '200 m';
    if (d <= 500) return '500 m';
    if (d <= 1000) return '1 km';
    return (Math.round(d / 100) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '') + ' km';
  }
  // Palier courant (pour une annonce future) : change seulement en franchissant 1 km, 500, 200, 100 m, puis « maintenant ».
  const tier = d => !finite(d) ? null : d <= 30 ? 0 : d <= 100 ? 100 : d <= 200 ? 200 : d <= 500 ? 500 : d <= 1000 ? 1000 : Infinity;
  // Voies : seulement celles fournies par OSRM, dans l'ordre ; « conseillée » = valid.
  const lanes = st => st && Array.isArray(st.lanes) && st.lanes.length ? st.lanes.map(l => ({ ok: !!l.valid, dirs: (l.indications || []).filter(x => typeof x === 'string') })) : null;
  // État du guidage à une position (m le long du tracé) : manœuvre en cours, distance, palier, puis la suivante.
  function state(nav, along) {
    const list = nav && Array.isArray(nav.steps) ? nav.steps.filter(st => st.type !== 'depart' && !(st.type === 'new name' && (!st.modifier || st.modifier === 'straight'))) : [];
    if (!list.length || !finite(along)) return null;
    const i = list.findIndex(st => st.along > along - 15);
    if (i < 0) return null;
    const cur = list[i], then = list[i + 1] || null, dist = Math.max(0, cur.along - along);
    return { text: text(cur), arrow: arrow(cur), dist, label: distLabel(dist), tier: tier(dist), lanes: lanes(cur),
      then: then ? { text: text(then), arrow: arrow(then) } : null, key: Math.round(cur.along) + '|' + cur.type };
  }
  const NOTICE = 'Itinéraire indicatif, la signalisation prime';
  return Object.freeze({ text, arrow, distLabel, tier, lanes, state, NOTICE });
})();
if (typeof module !== 'undefined') module.exports = DriveGuide;
