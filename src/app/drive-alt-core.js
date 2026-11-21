/* Altitude du parcours (21/11/2026, lot 5) : profil du tracé (service d'altimétrie IGN, RGE ALTI), altitude à la position,
 * prochain point haut. Module PUR : aucune requête ni stockage ; les réponses sont fournies.
 * Gel au point haut : AUCUNE règle propre à ce module. La vue lit la règle UNIQUE d'engine.js (chaussée estimée + humidité de
 * la même heure, option A amendée le 14/11) sur la prévision Open-Meteo demandée aux coordonnées du col AVEC son altitude
 * réelle (paramètre « elevation ») ; ce module ne fait que mettre en forme le niveau et le libellé qu'elle produit.
 * Aucune correction fixe par l'altitude (les inversions hivernales la rendraient fausse). Sans réponse : « non couverte ».
 * Les portions à moins de 1,5 km d'un lieu enregistré ne sont jamais envoyées (altitude inconnue là, rien d'inventé). */
const DriveAlt = (() => {
  const finite = Number.isFinite, RAD = Math.PI / 180;
  const meters = (a, b) => 6371000 * RAD * Math.hypot(b[0] - a[0], (b[1] - a[1]) * Math.cos((a[0] + b[0]) * RAD / 2));
  // Points du profil : tous les max(250 m, longueur / 150), hors zones privées ; [lat, lon] arrondis à 4 décimales.
  function samples(route, privatePoints = []) {
    if (!route || !Array.isArray(route.pts) || route.pts.length < 2 || !finite(route.total)) return [];
    const priv = (privatePoints || []).filter(p => p && finite(p.lat) && finite(p.lon)).map(p => [p.lat, p.lon]);
    const step = Math.max(250, route.total / 150), out = [];
    let next = 0, i = 1;
    for (let along = 0; along <= route.total && out.length < 160; along = next) {
      while (i < route.pts.length - 1 && route.cumulative[i] < along) i++;
      const a = route.pts[i - 1], b = route.pts[i], seg = route.cumulative[i] - route.cumulative[i - 1], k = seg ? (along - route.cumulative[i - 1]) / seg : 0;
      const p = [+(a[0] + (b[0] - a[0]) * k).toFixed(4), +(a[1] + (b[1] - a[1]) * k).toFixed(4)];
      if (priv.every(q => meters(p, q) > 1500)) out.push({ along: Math.round(along), at: p });
      next = along + step; if (along < route.total && next > route.total) next = route.total; else if (along >= route.total) break;
    }
    return out;
  }
  // Réponse de l'altimétrie IGN ({ elevations: [...] }) → profil [{ along, z, at }] ; valeurs absurdes (< −500 m, > 5000 m) écartées.
  function profile(json, pts) {
    const z = json && Array.isArray(json.elevations) ? json.elevations : null;
    if (!z || !Array.isArray(pts) || z.length !== pts.length) return null;
    return pts.map((p, i) => ({ along: p.along, at: p.at, z: finite(+z[i]) && +z[i] > -500 && +z[i] < 5000 ? Math.round(+z[i]) : null })).filter(x => x.z != null);
  }
  // Altitude à une distance le long du tracé (interpolée entre deux points connus distants de ≤ 2 km) ; null sinon.
  function altAt(prof, along) {
    if (!Array.isArray(prof) || !prof.length || !finite(along)) return null;
    let j = prof.findIndex(x => x.along >= along);
    if (j === 0) return along >= prof[0].along - 300 ? prof[0].z : null;
    if (j < 0) return along - prof[prof.length - 1].along <= 300 ? prof[prof.length - 1].z : null;
    const a = prof[j - 1], b = prof[j]; if (b.along - a.along > 2000) return null;
    return Math.round(a.z + (b.z - a.z) * (along - a.along) / ((b.along - a.along) || 1));
  }
  // Prochain point haut devant : le plus haut des points à venir s'il dépasse l'altitude actuelle d'au moins 150 m ou 600 m absolus.
  function summit(prof, along) {
    if (!Array.isArray(prof) || !finite(along)) return null;
    const ahead = prof.filter(x => x.along > along + 200), here = altAt(prof, along);
    if (!ahead.length) return null;
    const top = ahead.reduce((h, x) => x.z > h.z ? x : h, ahead[0]);
    if (!(top.z >= 600 || here != null && top.z - here >= 150)) return null;
    return { z: top.z, along: top.along, dist: top.along - along, at: top.at, gain: here != null ? top.z - here : null };
  }
  // Libellé du gel au point haut : niveau et mots de la règle d'engine.js, fournis par la vue (v = { lv, name, words, ref, basis,
  // at, stale }) ; ce module n'a aucun seuil. Quota atteint (429), panne ou plafond sans prévision antérieure : « non couverte ».
  const n1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace(/,0$/, '').replace('-', '−');
  function summitLabel(t) {
    if (!t || t.err) return t && t.err === 429 ? 'gel non couvert (service météo saturé)' : 'gel non couvert';
    if (!t.words) return 'gel non couvert';
    const ref = finite(t.ref) ? (t.basis === 'road' ? 'chaussée est. ' : 'air ') + n1(t.ref) + ' °C' + (t.basis === 'road' ? '' : ' (repli : chaussée non estimée)') : '';
    const hh = typeof t.at === 'string' && /T\d{2}:\d{2}/.test(t.at) ? t.at.slice(11, 16) : '';
    return [t.name, t.words, ref].filter(Boolean).join(' · ') + (t.stale && hh ? ' · prévision de ' + hh + ' (plafond d’appels atteint)' : '');
  }
  // Verdict gel au point haut pour l'heure de passage : la règle d'engine.js (fournie : summarize, frostRisk, frostWords, LV),
  // appliquée à l'heure du modèle du col (makeModel d'engine.js), exactement comme un point de la carte trajet. Null sans heure.
  function verdict(m, passTs, eng) {
    const i = m && m.byTime && typeof passTs === 'string' ? m.byTime.get(passTs.slice(0, 13) + ':00') : null;
    if (i == null || !eng) return null;
    const fr = eng.frostRisk(eng.summarize([{ hs: m.hs, i }])), ok = Number.isInteger(fr.level);
    return { lv: ok ? fr.level : null, name: ok ? eng.LV[fr.level].name : 'INDÉTERMINÉ', words: eng.frostWords(fr).label, ref: fr.ref, basis: fr.basis, key: fr.key, at: m.hs[i].t };
  }
  const MAX_CALLS = 3;   // appels météo « point haut » par trajet, au plus (Open-Meteo a déjà renvoyé des 429)
  return Object.freeze({ samples, profile, altAt, summit, summitLabel, verdict, MAX_CALLS });
})();
if (typeof module !== 'undefined') module.exports = DriveAlt;
