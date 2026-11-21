/* Altitude du parcours (21/11/2026, lot 5) : profil du tracé (service d'altimétrie IGN, RGE ALTI), altitude à la position,
 * prochain point haut et gel prévu à son altitude. Module PUR : aucune requête ni stockage ; les réponses sont fournies.
 * Un col peut être sous 0 °C quand la vallée ne l'est pas (et l'inverse en cas d'inversion hivernale) : AUCUNE correction fixe
 * par l'altitude n'est appliquée ; la température vient d'Open-Meteo interrogé aux coordonnées du col AVEC son altitude réelle
 * (paramètre « elevation », réduction d'échelle du modèle). Sans réponse : « non couvert », jamais « pas de gel ».
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
  // Gel au point haut : température prévue (°C) à son altitude, à l'heure de passage. ≤ 0 : DANGER ; ≤ 2 : VIGILANCE ; sinon RAS.
  function frost(tempC) {
    if (!finite(tempC)) return null;
    return { level: tempC <= 0 ? 2 : tempC <= 2 ? 1 : 0, label: tempC <= 0 ? 'gel probable' : tempC <= 2 ? 'gel possible' : 'pas de gel prévu' };
  }
  // Heure prévue (« AAAA-MM-JJTHH:00 ») la plus proche du passage dans une réponse horaire Open-Meteo ; température ou null.
  function tempAt(json, ts) {
    const h = json && json.hourly, t = h && Array.isArray(h.time) ? h.time : null, v = h && Array.isArray(h.temperature_2m) ? h.temperature_2m : null;
    if (!t || !v || typeof ts !== 'string') return null;
    const key = ts.slice(0, 13) + ':00', i = t.indexOf(key);
    return i >= 0 && finite(v[i]) ? v[i] : null;
  }
  // Libellé de la température au point haut : jamais « RAS » sans donnée ; quota atteint (429) ou panne → « non couverte ».
  function summitLabel(t) {
    if (t && t.err) return t.err === 429 ? 'température non couverte (service météo saturé)' : 'température non couverte';
    const f = frost(t && t.v); if (!f) return 'température non couverte';
    return (Math.round(t.v * 10) / 10).toString().replace('.', ',').replace('-', '−') + ' °C prévus · ' + f.label;
  }
  const MAX_CALLS = 3;   // appels météo « point haut » par trajet, au plus (Open-Meteo a déjà renvoyé des 429)
  return Object.freeze({ samples, profile, altAt, summit, frost, tempAt, summitLabel, MAX_CALLS });
})();
if (typeof module !== 'undefined') module.exports = DriveAlt;
