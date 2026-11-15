'use strict';
// Scénario FICTIF du constat du 14/11/2026 (trajet) : samedi 20:30 ; prochain trajet domicile-travail le LUNDI 16/11 à 06:30
// (40 min), sans gel ; pluie faible (RAIN mm/h) pendant la fenêtre du trajet, ou trajet sec (RAIN = 0). Lieux fictifs.
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const inTrip = t => dayOf(t) === '2026-11-16' && hourOf(t) >= 6 && hourOf(t) <= 7;
function wx(rain) {
  return o => {
    const H = o.hourly || {};
    if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
      H.temperature_2m = H.time.map((t, i) => dayOf(t) === '2026-11-16' && hourOf(t) <= 9 ? 9 + hourOf(t) * 0.2 : H.temperature_2m[i]);
      for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => inTrip(H.time[i]) ? rain : dayOf(H.time[i]) === '2026-11-16' ? 0 : x);
      for (const [k, v] of [['visibility', 20000], ['snowfall', 0], ['weather_code', rain ? 61 : 2], ['wind_gusts_10m', 20]]) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => inTrip(H.time[i]) ? v : x);
    }
    return o;
  };
}
// Exécuté dans la page : profil fictif, deux voitures équipées, panneaux « Ingénieur de course » et « État de la route ».
function setup() {
  const day = '2026-11-13';
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
    tread: 6, treadAv: 6, treadAr: 6, treads: [{ d: day, mm: 6, km: null, ax: 'av' }, { d: day, mm: 6, km: null, ax: 'ar' }] }));
  S.work.dep = '06:30'; S.work.durMin = 40; S.flags = S.flags || {}; S.flags.f1RaceEngineer = 1; S.flags.f1TrackConditions = 1;
  saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
module.exports = { wx, setup };
