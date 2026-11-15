'use strict';
// Scénario FICTIF du constat du 14/11/2026 (aucun lieu réel) : samedi 20:30, nuit claire, calme et humide (HR 93 %), pluie
// faible après minuit, chaussée estimée 1,6–1,8 °C au petit matin (min 1,6 °C vers 05:00), air 3,8–4,3 °C ; trajet domicile-travail lundi 06:30.
// Voiture A en pneus été, voiture B en pneus hiver, profondeurs saines (aucun garde-fou de profondeur en jeu).
const AT = '2026-11-14T20:30:00+01:00';
const AIR = 3.75, RH = 93, NRAIN = 0.3;   // chaussée min 1,6 °C humide vers 05:00 (PRUDENCE, règle option A)
const hourOf = t => +String(t).slice(11, 13), dayOf = t => String(t).slice(0, 10);
const night = t => (dayOf(t) === '2026-11-14' && hourOf(t) >= 21) || (dayOf(t) === '2026-11-15' && hourOf(t) <= 9);
function wx(o) {
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
    H.temperature_2m = H.time.map((t, i) => night(t) ? AIR + Math.abs(hourOf(t) - 4 + (dayOf(t) === '2026-11-14' ? 24 : 0)) * 0.12 : H.temperature_2m[i]);
    if (Array.isArray(H.apparent_temperature)) H.apparent_temperature = H.time.map((t, i) => night(t) ? Math.round((H.temperature_2m[i] - 2.4) * 10) / 10 : H.apparent_temperature[i]);
    for (const [k, v] of [['cloud_cover', 8], ['wind_speed_10m', 3], ['wind_gusts_10m', 7], ['precipitation', 0], ['relative_humidity_2m', RH], ['weather_code', 0], ['dew_point_2m', null], ['rain', 0], ['snowfall', 0]])
      if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => night(H.time[i]) ? v : x);
    for (const k of ['precipitation', 'rain']) if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => /^2026-11-15T0[0-3]/.test(H.time[i]) ? NRAIN : x);
  }
  return o;
}
// Exécuté dans la page (p.evaluate) : profil fictif.
function setup() {
  const day = '2026-11-13';
  S.cars.forEach((c, i) => Object.assign(c.tire, { type: i ? 'winter' : 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
    tread: 5.5, treadAv: 5.5, treadAr: 5.5, treads: [{ d: day, mm: 5.5, km: null, ax: 'av' }, { d: day, mm: 5.5, km: null, ax: 'ar' }] }));
  S.work.dep = '06:30'; saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
}
// Curseur de la courbe 24 h sur 06:00 (heure de gel PRUDENCE du scénario).
function chartAt() { const i = CX.m.hs.findIndex(x => x.t.startsWith('2026-11-15T06')); if (i >= 0) { UI.chartIdx = i; renderAll(); } }
module.exports = { AT, wx, setup, chartAt };
