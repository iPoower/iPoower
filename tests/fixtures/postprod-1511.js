'use strict';
// Scénario FICTIF du constat du 15/11/2026 (vidéo prod-210, 07:18) : dimanche matin à 4 °C (air), chaussée estimée vers 3 °C,
// humide ; deux voitures fictives (« voiture 0 » en pneus été, « voiture 1 » en pneus hiver, choisie) ; prochain trajet
// domicile-travail le LUNDI 16/11 à 06:30 (40 min). Sur la fenêtre du trajet, le modèle de base annonce 2,3 mm/h et AROME
// 0,0 mm/h (P5) ; aux points intermédiaires (modèle de base seul), aucune pluie. Lieux et station fictifs.
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const inTrip = t => dayOf(t) === '2026-11-16' && hourOf(t) >= 6 && hourOf(t) <= 7;
const sunday = t => dayOf(t) === '2026-11-15';
function wx() {
  return (o, kind) => {
    const H = o.hourly || {};
    if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
      H.temperature_2m = H.time.map((t, i) => sunday(t) ? (hourOf(t) <= 11 ? 4 : 8) : dayOf(t) === '2026-11-16' && hourOf(t) <= 9 ? 9 + hourOf(t) * 0.2 : H.temperature_2m[i]);
      if (Array.isArray(H.apparent_temperature)) H.apparent_temperature = H.time.map((t, i) => sunday(t) && hourOf(t) <= 11 ? -1.1 : H.apparent_temperature[i]);
      if (Array.isArray(H.relative_humidity_2m)) H.relative_humidity_2m = H.time.map((t, i) => sunday(t) ? 97 : H.relative_humidity_2m[i]);
      const mm = t => inTrip(t) && kind === 'base' ? 2.3 : 0;   // désaccord : base 2,3 mm/h, AROME 0,0 mm/h, points intermédiaires secs
      for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => sunday(H.time[i]) || dayOf(H.time[i]) === '2026-11-16' ? mm(H.time[i]) : x);
      if (Array.isArray(H.precipitation_probability)) H.precipitation_probability = H.precipitation_probability.map((x, i) => sunday(H.time[i]) || dayOf(H.time[i]) === '2026-11-16' ? 20 : x);
      for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['weather_code', 3], ['wind_gusts_10m', 30]]) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => sunday(H.time[i]) || inTrip(H.time[i]) ? v : x);
    }
    return o;
  };
}
// Exécuté dans la page : deux voitures équipées (été, hiver), la voiture hiver choisie ; panneaux F1 utiles activés.
function setup() {
  const day = '2026-11-13';
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
    tread: 6, treadAv: 6, treadAr: 6, treads: [{ d: day, mm: 6, km: null, ax: 'av' }, { d: day, mm: 6, km: null, ax: 'ar' }] }));
  S.work.dep = '06:30'; S.work.durMin = 40; S.flags = S.flags || {}; S.flags.f1RaceEngineer = 1; S.flags.f1TrackConditions = 1;
  saveSettings(); appSetCar(S.cars[1].id); rebuild(); renderAll();
}
// Observation METAR fictive de la station (P6) : faible bruine à 6 km, relevé de 07:00 ; état simulé en mémoire, jamais enregistré.
function injectObs() {
  const m = M[UI.loc]; if (!m) return false;
  m.obs = { id: 'ZZZZ', name: 'Station test', dist: 6, age: 18, T: m.hs[m.nowI].T, Td: m.hs[m.nowI].Td, vis: 20000, wx: '-DZ', wind: 17, gust: null,
    qnh: null, t: new Date(Date.now() - 18 * 60e3).toISOString(), dT: 0, visAdj: false, raw: 'ZZZZ fictif' };
  appRefreshContext({ persist: false }); renderAll(); return true;
}
module.exports = { wx, setup, injectObs };
