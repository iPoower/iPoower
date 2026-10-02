/* ===================== DÉMO : scénarios simulés, au format exact de l'API ===================== */
function parisOffsetH(dateStr) {
  const y = +dateStr.slice(0, 4);
  const lastSun = m => { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; };
  const d = new Date(dateStr + 'T12:00:00Z');
  return (d >= lastSun(2) && d < lastSun(9)) ? 2 : 1;
}
function sunTimes(dateStr, lat, lon) {
  const d = new Date(dateStr + 'T12:00:00Z'), y0 = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = Math.floor((d - y0) / 86400000);
  const dec = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365) * Math.PI / 180, la = lat * Math.PI / 180;
  const L = 24 / Math.PI * Math.acos(clamp(-Math.tan(la) * Math.tan(dec), -1, 1));
  const noon = 12 - lon / 15 + parisOffsetH(dateStr);
  return [noon - L / 2, noon + L / 2];
}
const hm = h => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60) % 60)}`;
const diur = (m, a, hh) => m + a * Math.cos(2 * Math.PI * (hh - 15) / 24);
const noiseAt = (k, s) => Math.sin(k * 12.9898 + s * 78.233) * 0.5;

const DEMO_SCN = {
  froid: {
    name: 'Nuit claire : gel et brouillard au petit matin',
    fn: c => {
      let T = diur(5.5 - 0.6 * Math.max(0, c.d), 4.5, c.hh), cloud = 25, wind = 7, P = 0, RH = 80, vis = 20000, code = 0, snow = 0, gust = 14;
      if (c.d === 0 && c.hh >= 21) { T = Math.min(T, 3.2 - (c.hh - 21) * 0.8); cloud = 8; wind = 4; RH = 93; }
      if (c.d === 0 && c.hh === 21) { P = 0.4; code = 61; T = 3.1; cloud = 70; RH = 96; }
      if (c.d === 1 && c.hh <= 9) {
        const Tn = [-0.5, -0.9, -1.3, -1.7, -2.1, -2.4, -2.5, -2.2, -1.2, 0.4][c.hh];
        T = Tn; cloud = 5; wind = 3; gust = 8; RH = 97;
        const v = { 4: 600, 5: 300, 6: 150, 7: 120, 8: 350, 9: 900 }[c.hh];
        if (v) { vis = v; code = T < 0 ? 48 : 45; }
      }
      return { T, RH, P, snow, code, vis, wind, gust, cloud };
    }
  },
  pluie: {
    name: 'Pluie froide et rafales',
    fn: c => {
      let T = diur(6.5 - 0.3 * Math.max(0, c.d), 2.5, c.hh), cloud = 80, wind = 14, gust = 30, P = 0, RH = 88, vis = 15000, code = 3, snow = 0;
      if (c.rel >= 0 && c.rel < 16) { P = 1.1 + 2.4 * Math.abs(Math.sin(c.rel / 3)); code = P > 2.5 ? 63 : 61; wind = 25; gust = 58; vis = 7000; RH = 96; T -= 1.5; }
      if (c.rel >= 16 && c.rel < 40) { P = 0.3; code = 61; RH = 92; }
      return { T, RH, P, snow, code, vis, wind, gust, cloud };
    }
  },
  neige: {
    name: 'Neige nocturne',
    fn: c => {
      let T = diur(2.5 - 0.4 * Math.max(0, c.d), 3, c.hh), cloud = 85, wind = 12, gust = 28, P = 0, RH = 88, vis = 12000, code = 3, snow = 0;
      if (c.rel >= 2 && c.rel < 14) { T = Math.min(T, 0.6 - (c.rel - 2) * 0.2); snow = 0.5 + 0.7 * Math.abs(Math.sin(c.rel / 2.5)); P = snow * 0.9; code = 73; vis = 900; RH = 95; }
      if (c.rel >= 14 && c.rel < 30) { T = Math.min(T, -1.2); }
      return { T, RH, P, snow, code, vis, wind, gust, cloud };
    }
  },
  doux: {
    name: 'Doux et sec',
    fn: c => ({ T: diur(15.5, 5, c.hh), RH: 62, P: 0, snow: 0, code: 1, vis: 24000, wind: 9, gust: 20, cloud: 20 })
  }
};

function makeDemoPayload(key, loc, tz, dT) {
  tz = tz || 'Europe/Paris';
  const scn = DEMO_SCN[key] || DEMO_SCN.froid, nowStr = nowIn(tz), today = nowStr.slice(0, 10);
  const start = addMin(today + 'T00:00', -1440), nowHour = nowStr.slice(0, 13) + ':00';
  const N = 15 * 24, H = { time: [] };
  const keys = ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'pressure_msl', 'cloud_cover', 'visibility', 'wind_speed_10m', 'wind_gusts_10m', 'shortwave_radiation', 'uv_index'];
  keys.forEach(k => H[k] = []);
  const rows = [], lat = loc.lat, lon = loc.lon, sun = {};
  for (let k = 0; k < N; k++) {
    const ts = addMin(start, k * 60), date = ts.slice(0, 10), hh = +ts.slice(11, 13);
    const rel = Math.round((tsToDate(ts) - tsToDate(nowHour)) / 3600000), d = dayDiff(today, date);
    const v = scn.fn({ rel, hh, d, k });
    let T = v.T + (dT || 0) + noiseAt(k, 1) * 0.5;
    if (!sun[date]) sun[date] = sunTimes(date, lat, lon);
    const [sr, ss] = sun[date];
    const h = hh + 0.5;
    const rad = (h > sr && h < ss) ? Math.sin(Math.PI * (h - sr) / (ss - sr)) * 650 * (1 - 0.75 * v.cloud / 100) : 0;
    const td = v.RH >= 96 ? T - 0.4 : dewMagnus(T, v.RH);
    const wchill = T - Math.max(0, v.wind - 4) * 0.12;
    H.time.push(ts);
    H.temperature_2m.push(+T.toFixed(1)); H.relative_humidity_2m.push(Math.round(v.RH)); H.dew_point_2m.push(+td.toFixed(1));
    H.apparent_temperature.push(+wchill.toFixed(1)); H.precipitation_probability.push(v.P > 0 ? 85 : v.cloud > 70 ? 25 : 5);
    H.precipitation.push(+v.P.toFixed(1)); H.rain.push(v.snow > 0 ? 0 : +v.P.toFixed(1)); H.showers.push(0); H.snowfall.push(+v.snow.toFixed(1));
    H.weather_code.push(v.code); H.pressure_msl.push(+(1014 + 4 * Math.sin(k / 30)).toFixed(1)); H.cloud_cover.push(Math.round(v.cloud));
    H.visibility.push(v.vis); H.wind_speed_10m.push(+v.wind.toFixed(1)); H.wind_gusts_10m.push(+v.gust.toFixed(1)); H.shortwave_radiation.push(Math.round(rad)); H.uv_index.push(+(rad / 95).toFixed(1));
    rows.push({ date, T, P: v.P, snow: v.snow, code: v.code, gust: v.gust, pp: H.precipitation_probability[k], uv: rad / 95 });
  }
  const D = { time: [], temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [], precipitation_sum: [], snowfall_sum: [], precipitation_probability_max: [], wind_gusts_10m_max: [], weather_code: [], uv_index_max: [] };
  Object.keys(sun).forEach(date => {
    const r = rows.filter(x => x.date === date); if (r.length < 24) return;
    D.time.push(date);
    D.temperature_2m_max.push(+Math.max(...r.map(x => x.T)).toFixed(1)); D.temperature_2m_min.push(+Math.min(...r.map(x => x.T)).toFixed(1));
    D.sunrise.push(date + 'T' + hm(sun[date][0])); D.sunset.push(date + 'T' + hm(sun[date][1]));
    D.precipitation_sum.push(+r.reduce((a, x) => a + x.P, 0).toFixed(1)); D.snowfall_sum.push(+r.reduce((a, x) => a + x.snow, 0).toFixed(1));
    D.precipitation_probability_max.push(Math.max(...r.map(x => x.pp))); D.wind_gusts_10m_max.push(Math.max(...r.map(x => x.gust)));
    D.weather_code.push(Math.max(...r.map(x => x.code))); D.uv_index_max.push(+Math.max(...r.map(x => x.uv)).toFixed(1));
  });
  const ni = H.time.indexOf(nowHour), q = Math.floor(+nowStr.slice(14, 16) / 15) * 15;
  const cur = { time: nowStr.slice(0, 14) + pad(q), interval: 900 };
  ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'rain', 'showers', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_gusts_10m'].forEach(k => cur[k] = H[k][ni]);
  cur.is_day = H.shortwave_radiation[ni] > 0 ? 1 : 0; cur.wind_direction_10m = 230;
  return { latitude: lat, longitude: lon, timezone: tz, utc_offset_seconds: parisOffsetH(today) * 3600, current: cur, hourly: H, daily: D, demo: true, scenario: key };
}

// ensemble simulé (démo uniquement) : dispersion croissante avec l'échéance
function makeDemoEnsemble(base, members) {
  members = members || 51;
  const H = base.hourly, n = Math.min(H.time.length, 4 * 24), out = { time: H.time.slice(0, n) };
  const nowHour = nowIn(base.timezone || 'Europe/Paris').slice(0, 13) + ':00';
  const i0 = Math.max(0, H.time.indexOf(nowHour));
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let m = 0; m < members; m++) {
    const sfx = m === 0 ? '' : '_member' + String(m).padStart(2, '0'), z = m === 0 ? 0 : gauss(), wet = rnd();
    let walk = 0;
    out['temperature_2m' + sfx] = H.temperature_2m.slice(0, n).map((T, i) => { const lead = Math.max(0, i - i0); walk += m ? gauss() * 0.12 : 0; return +(T + z * (0.4 + 0.05 * lead) + walk).toFixed(1); });
    out['relative_humidity_2m' + sfx] = H.relative_humidity_2m.slice(0, n);
    out['cloud_cover' + sfx] = H.cloud_cover.slice(0, n);
    out['wind_speed_10m' + sfx] = H.wind_speed_10m.slice(0, n);
    out['precipitation' + sfx] = H.precipitation.slice(0, n).map(P => +(P * (wet < 0.25 ? 0 : 0.5 + wet)).toFixed(1));
  }
  return { latitude: base.latitude, longitude: base.longitude, timezone: base.timezone, hourly: out, demo: true };
}
function makeDemoNowcast(base) {
  const nowStr = nowIn(base.timezone || 'Europe/Paris'), q = Math.floor(+nowStr.slice(14, 16) / 15) * 15;
  let ts = addMin(nowStr.slice(0, 14) + pad(q), -15); const time = [], P = [], S = [];
  for (let k = 0; k < 13; k++) { const i = base.hourly.time.indexOf(ts.slice(0, 13) + ':00'); time.push(ts); P.push(i >= 0 ? +((base.hourly.precipitation[i] || 0) / 4).toFixed(2) : 0); S.push(i >= 0 ? +((base.hourly.snowfall[i] || 0) / 4).toFixed(2) : 0); ts = addMin(ts, 15); }
  return { timezone: base.timezone, minutely_15: { time, precipitation: P, snowfall: S } };
}

// qualité de l'air et pollens simulés (démo uniquement)
function makeDemoAir(base) {
  const H = base.hourly, n = Math.min(H.time.length, 4 * 24), out = { time: H.time.slice(0, n) };
  const w = k => H.time.slice(0, n).map((t, i) => { const hh = +t.slice(11, 13); return +Math.max(0, k[0] + k[1] * Math.sin(Math.PI * (hh - 8) / 14) + noiseAt(i, k[2]) * k[3]).toFixed(1); });
  out.european_aqi = w([28, 14, 3, 6]); out.pm2_5 = w([8, 4, 4, 2]); out.pm10 = w([14, 6, 5, 3]); out.ozone = w([55, 25, 6, 5]); out.nitrogen_dioxide = w([12, -5, 7, 3]);
  out.grass_pollen = w([6, 9, 8, 3]); out.birch_pollen = w([0, 0, 9, 0]); out.alder_pollen = w([0.5, 1, 10, 0.5]); out.mugwort_pollen = w([1, 2, 11, 1]); out.olive_pollen = w([0, 0, 12, 0]); out.ragweed_pollen = w([2, 4, 13, 1]);
  return { hourly: out, current: {}, demo: true };
}
