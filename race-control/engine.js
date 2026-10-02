/* ===================== MOTEUR (pur, sans DOM) ===================== */
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const FZ_CODES = new Set([56, 57, 66, 67]);
const FOG_CODES = new Set([45, 48]);
const LV = [
  { i: 0, key: 'go', emoji: '🟢', name: 'GO', label: 'GO — CONDITIONS ADAPTÉES' },
  { i: 1, key: 'caution', emoji: '🟡', name: 'CAUTION', label: 'CAUTION — SURVEILLANCE' },
  { i: 2, key: 'risk', emoji: '🟠', name: 'HIGH RISK', label: 'HIGH RISK — PRUDENCE RENFORCÉE' },
  { i: 3, key: 'nogo', emoji: '🔴', name: 'NO GO', label: 'NO GO / CONDITIONS DÉFAVORABLES AUX PNEUS MONTÉS' }
];
const ICE_LV = ['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ', 'TRÈS ÉLEVÉ'];
const TYPE_LABEL = { summer: 'été', winter: 'hiver', allseason: '4 saisons 3PMSF', unknown: 'non renseignés', none: 'aucun (en attente)' };
const hasTires = car => car && car.tire && car.tire.type !== 'none';
// type inconnu : analyse prudente, sur la base de pneus été
const effType = car => car.tire.type === 'unknown' ? 'summer' : car.tire.type;
const WMO = {
  0: 'Ciel dégagé', 1: 'Plutôt dégagé', 2: 'Partiellement nuageux', 3: 'Couvert',
  45: 'Brouillard', 48: 'Brouillard givrant',
  51: 'Bruine légère', 53: 'Bruine', 55: 'Bruine dense', 56: 'Bruine verglaçante', 57: 'Bruine verglaçante dense',
  61: 'Pluie faible', 63: 'Pluie modérée', 65: 'Pluie forte', 66: 'Pluie verglaçante', 67: 'Pluie verglaçante forte',
  71: 'Neige faible', 73: 'Neige modérée', 75: 'Neige forte', 77: 'Grains de neige',
  80: 'Averses faibles', 81: 'Averses', 82: 'Averses violentes', 85: 'Averses de neige', 86: 'Averses de neige fortes',
  95: 'Orage', 96: 'Orage avec grêle', 99: 'Orage violent avec grêle'
};

const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = n => String(n).padStart(2, '0');
function pw(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/* ---------- temps (chaînes locales naïves "YYYY-MM-DDTHH:MM") ---------- */
const tsToDate = ts => new Date((ts.length === 16 ? ts + ':00' : ts) + 'Z');
const dateToTs = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
const addMin = (ts, m) => dateToTs(new Date(tsToDate(ts).getTime() + m * 60000));
const dayDiff = (a, b) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 86400000);
const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
function nowIn(tz) {
  try {
    const s = new Date().toLocaleString('sv-SE', { timeZone: tz, hour12: false });
    return s.replace(' ', 'T').slice(0, 16);
  } catch (e) { return dateToTs(new Date()); }
}

/* ---------- physique simple ---------- */
function dewMagnus(T, RH) {
  if (T == null || RH == null || RH <= 0) return null;
  const a = 17.62, b = 243.12, g = Math.log(RH / 100) + a * T / (b + T);
  return b * g / (a - g);
}
function wetBulb(T, RH) { // Stull 2011
  if (T == null || RH == null) return null;
  return T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
}
function recentPrecip(hs, i, n) {
  let s = 0;
  for (let k = 0; k < n; k++) { const x = hs[i - k]; if (x && x.P != null) s += x.P; }
  return s;
}
function recentSnow(hs, i, n) {
  let s = 0;
  for (let k = 0; k < n; k++) { const x = hs[i - k]; if (x && x.snow != null) s += x.snow; }
  return s;
}

/* ---------- température de chaussée ESTIMÉE ---------- */
let ROAD_BIAS = 0;   // correction apprise à partir des retours terrain
const setRoadBias = b => { ROAD_BIAS = b || 0; };
function estRoad(hs, i) {
  const x = hs[i];
  if (!x || x.T == null) return null;
  const w = [0.40, 0.25, 0.15, 0.10, 0.06, 0.04];
  let s = 0, ws = 0;
  for (let k = 0; k < w.length; k++) {
    const y = hs[i - k];
    if (y && y.T != null) { s += w[k] * y.T; ws += w[k]; }
  }
  const Tb = s / ws;                       // inertie thermique: moyenne pondérée des heures précédentes
  const wind = x.wind != null ? x.wind : 10;
  const cloud = x.cloud != null ? x.cloud : 60;
  const rh = x.RH != null ? x.RH : 80;
  let rad = x.rad;
  if (rad == null) rad = Math.max(0, Math.sin(Math.PI * (x.hh - 6.5) / 11)) * 600 * (1 - 0.75 * cloud / 100);
  const wet = recentPrecip(hs, i, 2) >= 0.2;
  let adj = 0;
  if (rad > 20) {                          // gain solaire, freiné par le vent et la pluie
    adj += 7.5 * Math.min(rad, 900) / 800 / (1 + wind / 25);
    if (wet) adj *= 0.4;
  } else {                                 // refroidissement radiatif nocturne: ciel dégagé + vent faible
    const clear = Math.pow(1 - cloud / 100, 1.2);
    const loss = 3.0 * clear / (1 + wind / 15) * (1 + (1 - rh / 100) * 0.3);
    adj -= Math.min(loss, 3.5);
    if (wet) adj *= 0.5;
  }
  if (wet && rh < 85) adj -= (1 - rh / 100) * 1.2;   // évaporation sur chaussée mouillée
  let Tr = Tb + adj + ROAD_BIAS;
  if ((x.snow || 0) > 0.05) Tr = Math.min(Tr, x.T + 0.2);   // neige: chaussée proche de l'air
  Tr = clamp(Tr, x.T - 4, x.T + 9);
  return Math.round(Tr * 10) / 10;
}

/* ---------- risque de verglas ESTIMÉ ---------- */
const iceLevel = s => s == null ? null : s < 20 ? 0 : s < 45 ? 1 : s < 70 ? 2 : 3;
function iceRisk(hs, i) {
  const x = hs[i];
  if (!x || x.T == null || x.Tr == null) return { score: null, level: null, factors: [] };
  const f = [];
  if (FZ_CODES.has(x.code)) return { score: 100, level: 3, factors: ['Pluie ou bruine verglaçante annoncée par le modèle'] };
  const Ta = x.T, Tr = x.Tr, rh = x.RH != null ? x.RH : 80;
  if (Ta >= 6 && Tr >= 4) return { score: 0, level: 0, factors: [] };
  const ts = pw(Tr, [[-5, 52], [-2, 45], [0, 28], [2, 10], [4, 0]]);
  if (ts <= 0) return { score: 0, level: 0, factors: [] };
  const wet6 = recentPrecip(hs, i, 6);
  const P = x.P || 0;
  let m = 0;
  if (P >= 0.1 && Tr <= 1.5) { m = 35; f.push(`Précipitations (${P.toFixed(1)} mm) sur chaussée estimée à ${Tr.toFixed(1)} °C`); }
  else if (wet6 >= 0.3 && Tr <= 1.5) { m = 30; f.push(`Chaussée mouillée par la pluie récente (${wet6.toFixed(1)} mm sur 6 h)`); }
  else if (x.Td != null && Tr <= x.Td + 0.5 && Tr <= 1.5 && rh >= 75) { m = 18; f.push('Chaussée sous le point de rosée : givre ou condensation gelée possibles'); }
  else if (rh >= 90) { m = 12; f.push(`Humidité élevée (${Math.round(rh)} %)`); }
  else if (rh >= 85) { m = 6; }
  if ((x.snow || 0) > 0.05 && Tr <= 1) { m = Math.max(m, 30); f.push('Chute de neige sur chaussée froide'); }
  const sn12 = recentSnow(hs, i, 12);
  let bonus = 0;
  if (sn12 >= 0.2 && Ta <= 1.5 && (x.snow || 0) <= 0.05) { bonus += 12; f.push('Neige récente : regel possible'); }
  const p1 = hs[i - 1], p3 = hs[i - 3];
  if (p1 && p1.T != null && p1.T > 0.5 && Ta <= 0.5) { bonus += 8; f.push('Passage de la température de l’air sous 0 °C'); }
  if (p3 && p3.T != null && p3.T - Ta >= 3 && Tr <= 2 && (wet6 >= 0.2 || rh >= 90)) { bonus += 6; f.push(`Baisse rapide de température (−${(p3.T - Ta).toFixed(1)} °C en 3 h) sur chaussée humide`); }
  if (x.vis != null && x.vis < 1000 && Ta <= 0.5) { bonus += 10; f.push('Brouillard avec air ≤ 0 °C : dépôt de givre possible'); }
  let score = ts * (0.30 + 0.70 * (m / 35)) + bonus;
  if (P >= 0.2 && !(x.snow > 0.05) && Tr <= -0.5 && Ta <= 1) { score = Math.max(score, 75); f.push('Pluie sur chaussée estimée négative : verglas probable'); }
  if (Tr <= 0 && m === 0) f.push('Gel sans humidité détectée : chaussée probablement sèche');
  if (Tr < 2 && f.length === 0) f.push(`Chaussée estimée à ${Tr.toFixed(1)} °C`);
  score = Math.round(clamp(score, 0, 100));
  return { score, level: iceLevel(score), factors: f };
}

/* ---------- construction du modèle d'un lieu ---------- */
function buildHours(p) {
  const H = p.hourly || {}, t = H.time || [];
  const g = (k, i) => (H[k] ? num(H[k][i]) : null);
  const hs = t.map((ts, i) => ({
    t: ts, date: ts.slice(0, 10), hh: +ts.slice(11, 13),
    T: g('temperature_2m', i), RH: g('relative_humidity_2m', i), Td: g('dew_point_2m', i), Tapp: g('apparent_temperature', i),
    pp: g('precipitation_probability', i), P: g('precipitation', i), rain: g('rain', i), snow: g('snowfall', i),
    code: g('weather_code', i), pres: g('pressure_msl', i), cloud: g('cloud_cover', i), vis: g('visibility', i),
    wind: g('wind_speed_10m', i), gust: g('wind_gusts_10m', i), rad: g('shortwave_radiation', i)
  }));
  hs.forEach(x => { x.Pl = (x.snow || 0) > 0.05 ? 0 : x.P; });
  hs.forEach(x => {
    if (x.Td == null && x.T != null && x.RH != null) { const d = dewMagnus(x.T, x.RH); if (d != null) { x.Td = Math.round(d * 10) / 10; x.TdEst = true; } }
  });
  hs.forEach((x, i) => { x.Tr = estRoad(hs, i); });
  hs.forEach((x, i) => { x.ice = iceRisk(hs, i); });
  return hs;
}
function makeModel(payload, mode, loc) {
  const hs = buildHours(payload);
  const tz = payload.timezone || 'Europe/Paris';
  const curT = payload.current && payload.current.time;
  const nowStr = (mode === 'live' && curT) ? curT.slice(0, 16) : nowIn(tz);
  const nowHour = nowStr.slice(0, 13) + ':00';
  let nowI = -1;
  for (let i = 0; i < hs.length; i++) { if (hs[i].t <= nowHour) nowI = i; else break; }
  const byTime = new Map(hs.map((x, i) => [x.t, i]));
  const D = payload.daily || {}, dt = D.time || [];
  const dg = (k, i) => (D[k] ? num(D[k][i]) : null);
  const days = dt.map((d, i) => ({
    date: d, tmin: dg('temperature_2m_min', i), tmax: dg('temperature_2m_max', i),
    sunrise: D.sunrise ? D.sunrise[i] : null, sunset: D.sunset ? D.sunset[i] : null,
    psum: dg('precipitation_sum', i), ssum: dg('snowfall_sum', i), pmax: dg('precipitation_probability_max', i),
    gust: dg('wind_gusts_10m_max', i), code: dg('weather_code', i)
  }));
  // min/max journaliers recalculés sur les heures fusionnées (cohérence avec AROME et le graphique)
  days.forEach(d => { const ts = hs.filter(x => x.date === d.date && x.T != null).map(x => x.T); if (ts.length === 24) { d.tmin = Math.min(...ts); d.tmax = Math.max(...ts); } });
  const c = payload.current || {};
  const h0 = hs[nowI] || {};
  const cur = {
    time: curT || null,
    T: num(c.temperature_2m) ?? h0.T ?? null, Tapp: num(c.apparent_temperature) ?? h0.Tapp ?? null,
    RH: num(c.relative_humidity_2m) ?? h0.RH ?? null, P: num(c.precipitation) ?? h0.P ?? null,
    snow: num(c.snowfall) ?? h0.snow ?? null, code: num(c.weather_code) ?? h0.code ?? null,
    cloud: num(c.cloud_cover) ?? h0.cloud ?? null, pres: num(c.pressure_msl) ?? h0.pres ?? null,
    wind: num(c.wind_speed_10m) ?? h0.wind ?? null, gust: num(c.wind_gusts_10m) ?? h0.gust ?? null,
    dir: num(c.wind_direction_10m), isDay: c.is_day,
    Td: h0.Td ?? null, vis: h0.vis ?? null, pp: h0.pp ?? null, Tr: h0.Tr ?? null, ice: h0.ice || null
  };
  return { id: loc && loc.id, loc, hs, nowI, nowStr, tz, byTime, days, cur, mode, payload };
}
const seqOf = (m, i0, n) => {
  const out = [];
  for (let k = 0; k <= n; k++) { const i = i0 + k; if (i >= 0 && i < m.hs.length) out.push({ hs: m.hs, i }); }
  return out;
};

/* ---------- évaluation pneumatique ---------- */
const SUMMER_COLD = [[-3, 70], [0, 60], [1, 48], [3, 36], [5, 24], [7, 12], [10, 4], [12, 0]];
function speedRating(size) { const m = /\d{2,3}([A-Z])\b/.exec(size || ''); return m ? m[1] : null; }
function perfFactor(car) {
  let f = car.sporty ? 1.08 : 1;
  if (effType(car) === 'summer') { const s = speedRating(car.tire.size); if (s === 'Y' || s === 'Z') f *= 1.07; else if (s === 'W') f *= 1.04; }
  return f;
}
function tireAssess(car, hs, i) {
  const x = hs[i];
  if (!x || x.T == null) return null;
  const tire = car.tire, type = effType(car), perf = perfFactor(car);
  const parts = []; let pen = 0;
  const add = (label, v, kind) => { if (v >= 0.5) { parts.push({ label, v: Math.round(v), kind }); pen += v; } };
  const Ta = x.T, Tr = x.Tr, Tc = Tr != null ? (Ta + Tr) / 2 : Ta;
  const P = x.Pl || 0;
  const wet = (x.P || 0) >= 0.1 || recentPrecip(hs, i, 2) >= 0.3;
  const snow = (x.snow || 0) > 0.05 || SNOW_CODES.has(x.code);
  const fz = FZ_CODES.has(x.code);
  const ice = x.ice && x.ice.score != null ? x.ice.score : 0;
  const tread = tire.tread;
  // — météo seule (indépendant du type de pneu)
  if (x.vis != null) add(`Visibilité ${Math.round(x.vis)} m`, x.vis < 200 ? 30 : x.vis < 500 ? 20 : x.vis < 1000 ? 10 : 0, 'hazard');
  if (x.gust != null) add(`Rafales ${Math.round(x.gust)} km/h`, x.gust >= 90 ? 20 : x.gust >= 70 ? 12 : x.gust >= 55 ? 6 : 0, 'hazard');
  if (snow) add('Chutes de neige', 10 + ((x.snow || 0) >= 1 ? 6 : 0), 'hazard');
  if (fz) add('Pluie ou bruine verglaçante', 50, 'hazard');
  add(`Risque de verglas estimé (${ice}/100)`, ice * 0.25, 'hazard');
  // — pluie / aquaplaning (dépend de la profondeur)
  let rainPen = P >= 7.6 ? 18 : P >= 4 ? 10 : P >= 2.5 ? 4 : 0;
  if (rainPen && tread != null) rainPen *= tread < 3 ? 1.6 : tread < 4 ? 1.25 : 1;
  add(`Pluie ${P.toFixed(1).replace('.', ',')} mm/h : aquaplaning`, rainPen, 'tyre');
  // — spécifique au pneu
  if (type === 'summer') {
    let c = pw(Tc, SUMMER_COLD) * perf * (wet ? 1.25 : 0.75);
    add(`Pneus été et froid (${Tc.toFixed(1).replace('.', ',')} °C air/chaussée${wet ? ', mouillé' : ', sec'})`, c, 'tyre');
    if (snow) add('Pneus été sur neige', 45, 'tyre');
    if (ice >= 45) add('Pneus été et verglas probable', ice * 0.35, 'tyre');
    if (tread != null && tread < 3 && wet) add('Profondeur < 3 mm sur sol mouillé', 12, 'tyre');
  } else if (type === 'winter') {
    if (Ta >= 25) add('Pneus hiver et chaleur : usure, précision réduite', 18, 'tyre');
    else if (Ta >= 20) add('Pneus hiver et douceur : usure, précision réduite', wet ? 6 : 10, 'tyre');
    else if (Ta >= 15 && !wet) add('Pneus hiver et douceur', 4, 'tyre');
    if (tread != null && tread < 4 && (snow || ice >= 20)) add('Gomme hiver < 4 mm : efficacité neige réduite', 10, 'tyre');
    add('Verglas (marge pneu hiver)', ice * 0.05, 'tyre');
  } else {
    if (Tc < 7) add('4 saisons : compromis hors de la plage idéale', 3, 'tyre');
    if (Tc <= -5) add('4 saisons en froid sévère', 10, 'tyre');
    else if (Tc <= 0) add('4 saisons sous 0 °C', 6 * perf, 'tyre');
    if (snow) add('4 saisons sur neige', 12 + ((x.snow || 0) >= 1 ? 4 : 0), 'tyre');
    if (ice >= 45) add('4 saisons et verglas probable', ice * 0.15, 'tyre');
    if (Ta >= 28) add('4 saisons en forte chaleur', 6, 'tyre');
    else if (Ta >= 22 && !wet) add('4 saisons en chaleur', 3, 'tyre');
    if (tread != null && tread < 3 && wet) add('Profondeur < 3 mm sur sol mouillé', 8, 'tyre');
  }
  if (tread != null && tread < 1.6) add('Profondeur sous le minimum légal (1,6 mm)', 40, 'tyre');
  const age = dotAge(tire.dot, x.t);
  if (age != null && age >= 6 && Tc < 10) add(`Gomme âgée (${age.toFixed(1).replace('.', ',')} ans) : moins d’adhérence à froid`, age >= 10 ? 10 : 5, 'tyre');
  return { x, pen: Math.min(100, pen), parts, flags: { wet, snow, fz, ice, Tc } };
}
function flagLevel(car, a, k) {
  let L = 0; const type = effType(car), f = a.flags, x = a.x, near = k <= 6;
  if (f.fz) L = Math.max(L, near ? 3 : 2);
  if (type === 'summer') {
    if (f.snow) L = Math.max(L, near ? 3 : 2);
    if (f.ice >= 70) L = Math.max(L, near ? 3 : 2); else if (f.ice >= 45) L = Math.max(L, 2);
  } else if (f.ice >= 70) L = Math.max(L, 2);
  if (x.vis != null) { if (x.vis < 200) L = Math.max(L, 2); else if (x.vis < 500) L = Math.max(L, 1); }
  if (x.gust != null && x.gust >= 90) L = Math.max(L, 2);
  return L;
}
const scoreToLevel = s => s >= 80 ? 0 : s >= 60 ? 1 : s >= 40 ? 2 : 3;
function windowAssess(car, seq, mode) {
  if (!hasTires(car)) return null;
  const items = []; let pMax = -1, kMax = 0, lvl = 0;
  seq.forEach((s, k) => {
    const a = tireAssess(car, s.hs, s.i);
    if (!a) { items.push(null); return; }
    a.k = k; a.loc = s.loc; items.push(a);
    if (a.pen > pMax) { pMax = a.pen; kMax = k; }
    lvl = Math.max(lvl, flagLevel(car, a, k));
  });
  const valid = items.filter(Boolean);
  if (!valid.length) return null;
  const first = valid[0], pNow = first.pen;
  const P = mode === 'trip' ? pMax : (pNow + pMax) / 2;
  let score = Math.round(clamp(100 - P, 0, 100));
  const sl = scoreToLevel(score);
  const level = Math.max(sl, lvl);
  if (level > sl) score = Math.min(score, [100, 79, 59, 39][level]);
  return { items, first, worst: items[kMax], kMax, pNow, pMax, P, score, level, scoreLevel: sl, flagLevel: lvl };
}
function hourVerdict(car, hs, i) {
  if (!hasTires(car)) return null;
  const a = tireAssess(car, hs, i);
  if (!a) return null;
  const sc = Math.round(clamp(100 - a.pen, 0, 100));
  const level = Math.max(scoreToLevel(sc), flagLevel(car, a, 0));
  return { a, score: level > scoreToLevel(sc) ? Math.min(sc, [100, 79, 59, 39][level]) : sc, level };
}

/* ---------- résumé d'une séquence d'heures ---------- */
function summarize(seq) {
  const r = { n: 0, Tmin: null, Tmax: null, iTmin: null, TrMin: null, Pmax: 0, iPmax: null, Psum: 0, visMin: null, iVis: null,
    snowSum: 0, snowCode: false, iSnow: null, iceMax: 0, iceI: null, gustMax: null, iGust: null, windMax: null, fz: false, fog: false, ppMax: null };
  seq.forEach(s => {
    const x = s.hs[s.i]; if (!x) return; r.n++;
    if (x.T != null) { if (r.Tmin == null || x.T < r.Tmin) { r.Tmin = x.T; r.iTmin = s; } if (r.Tmax == null || x.T > r.Tmax) r.Tmax = x.T; }
    if (x.Tr != null && (r.TrMin == null || x.Tr < r.TrMin)) r.TrMin = x.Tr;
    if ((x.Pl || 0) > r.Pmax) { r.Pmax = x.Pl; r.iPmax = s; }
    r.Psum += x.Pl || 0;
    if (x.vis != null && (r.visMin == null || x.vis < r.visMin)) { r.visMin = x.vis; r.iVis = s; }
    if ((x.snow || 0) > 0.05) { r.snowSum += x.snow; if (!r.iSnow) r.iSnow = s; }
    if (SNOW_CODES.has(x.code)) { r.snowCode = true; if (!r.iSnow) r.iSnow = s; }
    if (FZ_CODES.has(x.code)) r.fz = true;
    if (FOG_CODES.has(x.code)) r.fog = true;
    const is = x.ice && x.ice.score != null ? x.ice.score : 0;
    if (is > r.iceMax || (r.iceI == null && is >= 0)) { if (is >= r.iceMax) { r.iceMax = is; r.iceI = s; } }
    if (x.gust != null && (r.gustMax == null || x.gust > r.gustMax)) { r.gustMax = x.gust; r.iGust = s; }
    if (x.wind != null && (r.windMax == null || x.wind > r.windMax)) r.windMax = x.wind;
    if (x.pp != null && (r.ppMax == null || x.pp > r.ppMax)) r.ppMax = x.pp;
  });
  r.iceLevel = iceLevel(r.iceMax);
  // neige mouillée possible (estimé) : précipitation avec température du thermomètre mouillé ≤ 1 °C
  r.sleet = false;
  seq.forEach(s => { const x = s.hs[s.i]; if (x && (x.P || 0) >= 0.2 && !(x.snow > 0.05)) { const tw = wetBulb(x.T, x.RH); if (tw != null && tw <= 1 && x.T <= 3) r.sleet = true; } });
  return r;
}
const hhmm = s => s ? s.hs[s.i].t.slice(11, 16) : '';
const f1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const f0 = v => v == null ? '—' : String(Math.round(v));
const rainClass = P => P == null ? null : P < 0.1 ? 'aucune' : P < 2.5 ? 'faible' : P < 7.6 ? 'modérée' : 'forte';

/* ---------- explication en langage naturel ---------- */
function narrate(car, w, sum, intro) {
  const L = LV[w.level], type = effType(car), unk = car.tire.type === 'unknown';
  const head = `${L.emoji} ${L.name} — ${car.short} ${unk ? ': type de pneus non renseigné, analyse prudente comme des pneus été' : 'équipée de pneus ' + TYPE_LABEL[type]}.`;
  const x0 = w.first.x, wet0 = w.first.flags.wet;
  const s = [];
  s.push(`${f1(x0.T)} °C ${intro}${wet0 ? ', chaussée humide' : ', chaussée sèche'}.`);
  const drop = sum.Tmin != null && x0.T - sum.Tmin >= 2;
  if (drop) {
    const it = sum.iTmin, wetT = recentPrecip(it.hs, it.i, 2) >= 0.3 || (it.hs[it.i].P || 0) >= 0.1;
    s.push(`Baisse vers ${f1(sum.Tmin)} °C prévue à ${hhmm(it)}${wetT ? ' avec chaussée humide' : ', chaussée sèche'}.`);
  } else if (sum.Tmax != null && sum.Tmax - sum.Tmin >= 2) {
    s.push(`Températures comprises entre ${f0(sum.Tmin)} et ${f0(sum.Tmax)} °C.`);
  }
  if (sum.Pmax >= 7.6) s.push(`Pluie forte (jusqu’à ${f1(sum.Pmax)} mm/h vers ${hhmm(sum.iPmax)}) : risque d’aquaplaning.`);
  else if (sum.Pmax >= 2.5) s.push(`Pluie modérée (jusqu’à ${f1(sum.Pmax)} mm/h vers ${hhmm(sum.iPmax)}).`);
  else if (sum.Pmax >= 0.1) s.push('Pluie faible.');
  if (sum.snowSum > 0 || sum.snowCode) s.push(`Neige prévue${sum.snowSum > 0 ? ` (${f1(sum.snowSum)} cm cumulés)` : ''} dès ${hhmm(sum.iSnow)}.`);
  else if (sum.sleet) s.push('Pas de neige annoncée, mais neige mouillée possible (estimé).');
  else s.push('Pas de neige prévue.');
  if (sum.iceLevel >= 1) s.push(`Risque de verglas ${ICE_LV[sum.iceLevel].toLowerCase()} (estimé) vers ${hhmm(sum.iceI)}.`);
  else if (sum.Tmin != null && sum.Tmin > 1.5) s.push('Aucun risque de gel détecté.');
  else s.push('Pas de risque de verglas notable (estimé).');
  if (sum.visMin != null && sum.visMin < 1000) s.push(`Brouillard : visibilité jusqu’à ${f0(sum.visMin)} m vers ${hhmm(sum.iVis)}.`);
  if (sum.gustMax != null && sum.gustMax >= 55) s.push(`Rafales jusqu’à ${f0(sum.gustMax)} km/h.`);
  if ((sum.visMin != null && sum.visMin < 500) || (sum.gustMax != null && sum.gustMax >= 90)) s.push('Indépendamment des pneus, la météo elle-même impose une prudence particulière.');
  // conclusion selon le pneu
  const cold = sum.Tmin != null && sum.Tmin < 7;
  if (type === 'summer') {
    if (w.level >= 2) s.push(unk ? 'Si ce sont des pneus été, ils sont hors de leur plage de confiance : vérifie le flanc (marquage 3PMSF ou M+S) pour fixer le type.' : 'Les pneus été sont hors de leur plage de confiance : adhérence fortement réduite, freinages et relances à anticiper.');
    else if (w.level === 1 && cold) s.push('Adhérence à surveiller, surtout au départ à froid et sur route humide.');
  } else if (type === 'winter') {
    if (sum.Tmax != null && sum.Tmax >= 18) s.push('Douceur : les pneus hiver restent sûrs mais s’usent plus vite et perdent en précision.');
  } else if (cold && w.level >= 1) {
    s.push('Les 4 saisons 3PMSF sont polyvalents, sans égaler un excellent pneu hiver dans les conditions hivernales sévères.');
  }
  return { head, body: s.join(' ') };
}

/* ---------- saison pneus ---------- */
function dayInfos(model, car) {
  const today = model.nowStr.slice(0, 10), out = [];
  model.days.forEach(d => {
    const off = dayDiff(today, d.date);
    if (off < 0 || off > 14) return;
    const idx = []; model.hs.forEach((x, i) => { if (x.date === d.date) idx.push(i); });
    if (!idx.length) return;
    const seq = idx.map(i => ({ hs: model.hs, i }));
    const sm = summarize(seq);
    const tmin = d.tmin != null ? d.tmin : sm.Tmin, tmax = d.tmax != null ? d.tmax : sm.Tmax;
    const w = windowAssess(car, seq, 'trip');
    const iceHours = idx.filter(i => model.hs[i].ice && model.hs[i].ice.score >= 45).length;
    out.push({ date: d.date, off, tmin, tmax, snow: Math.max(d.ssum || 0, sm.snowSum), snowCode: sm.snowCode, fz: sm.fz, iceHours, iceMax: sm.iceMax,
      psum: d.psum != null ? d.psum : sm.Psum, code: d.code, level: w ? w.level : null, score: w ? w.score : null });
  });
  return out;
}
function seasonAnalysis(model, car) {
  const di = dayInfos(model, car), nd = di.slice(0, 7), type = effType(car);
  const severeDay = d => (d.snow > 0.2 || d.snowCode) || d.iceHours > 0 || (d.tmin != null && d.tmin <= -1) || d.fz;
  const consec = (arr, pred, n) => { let c = 0; for (const d of arr) { c = pred(d) ? c + 1 : 0; if (c >= n) return true; } return false; };
  let level = 0, title = '', text = '';
  const firstSevere = di.find(severeDay);
  if (type === 'summer') {
    const cold7 = nd.filter(d => d.tmin != null && d.tmin < 3).length;
    const chill7 = nd.filter(d => d.tmin != null && d.tmin < 7).length;
    if (firstSevere && firstSevere.off <= 7) { level = 3; title = 'Conditions hivernales détectées avant montage'; text = `Neige, gel ou verglas probable dès le ${fmtDay(firstSevere.date)}. Les pneus été ne sont pas adaptés à ces conditions.`; }
    else if (firstSevere || cold7 >= 3 || nd.some(d => d.tmin != null && d.tmin <= 1) || consec(nd, d => d.tmax != null && d.tmax < 10, 3)) { level = 2; title = 'Montage hiver recommandé prochainement'; text = firstSevere ? `Conditions hivernales annoncées vers le ${fmtDay(firstSevere.date)} (prévision lointaine, moins fiable).` : `${cold7} nuit(s) sous 3 °C sur les 7 prochains jours.`; }
    else if (chill7 >= 2 || nd.filter(d => d.tmax != null && d.tmax < 12).length >= 3) { level = 1; title = 'Transition hiver à envisager'; text = `${chill7} nuit(s) sous 7 °C sur les 7 prochains jours : les performances relatives des pneus hiver et été commencent à évoluer.`; }
    else { level = 0; title = 'Pneus été encore adaptés'; text = 'Aucune période froide significative détectée dans les prévisions.'; }
  } else if (type === 'winter') {
    const warm = nd.filter(d => d.tmax != null && d.tmax >= 18).length;
    if (nd.filter(d => d.tmax != null && d.tmax >= 20).length >= 5) { level = 2; title = 'Pneus hiver moins pertinents'; text = 'Chaleur durable prévue : usure accrue, précision réduite, performances estivales inférieures à un bon pneu été.'; }
    else if (consec(nd, d => d.tmax != null && d.tmax >= 17, 3) || warm >= 4) { level = 1; title = 'Transition été à envisager'; text = 'Températures durablement douces : les pneus hiver s’usent plus vite et perdent en précision.'; }
    else { level = 0; title = 'Pneus hiver adaptés'; text = 'Températures cohérentes avec des pneus hiver.'; }
  } else {
    level = 0; title = '4 saisons 3PMSF : polyvalents';
    text = firstSevere ? 'Conditions hivernales annoncées : le 4 saisons reste utilisable mais n’égale pas un excellent pneu hiver.' : 'Aucune contrainte particulière détectée. En été, ils ne donnent pas les performances maximales d’un pneu été sportif.';
  }
  // compte à rebours + période froide avant montage
  let countdown = null, coldBefore = null;
  const plan = car.plan;
  if (plan && plan.on && type !== 'winter') {
    if (plan.date) {
      const n = dayDiff(model.nowStr.slice(0, 10), plan.date);
      countdown = { n, date: plan.date };
      const before = di.filter(d => d.date < plan.date);
      const ev = before.filter(d => severeDay(d) || (d.tmin != null && d.tmin <= 2));
      const sev = before.find(severeDay);
      const cold2 = before.filter(d => d.tmin != null && d.tmin <= 2).length;
      if (sev || cold2 >= 2) coldBefore = { first: sev || ev[0], severe: !!sev, cold2, partial: dayDiff(model.nowStr.slice(0, 10), plan.date) > 14 };
      countdown.partial = n > 14;
    } else countdown = { n: null };
  }
  return { level, title, text, days: di, countdown, coldBefore };
}
const DAYN = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
function fmtDay(d) { const dt = new Date(d + 'T12:00:00Z'); return `${DAYN[dt.getUTCDay()]} ${pad(dt.getUTCDate())}/${pad(dt.getUTCMonth() + 1)}`; }

/* ---------- alertes ---------- */
const ALERT_DEFS = [
  { id: 't7', label: 'Température prévue < 7 °C' },
  { id: 't5s', label: 'Température < 5 °C avec pneus été' },
  { id: 't0', label: 'Température proche de 0 °C' },
  { id: 'ice', label: 'Risque de verglas (modéré ou plus)' },
  { id: 'snow', label: 'Neige prévue' },
  { id: 'rain', label: 'Forte pluie' },
  { id: 'fog', label: 'Brouillard important (< 500 m)' },
  { id: 'vis', label: 'Visibilité faible (< 1 000 m)' },
  { id: 'frost', label: 'Gel nocturne' },
  { id: 'drop', label: 'Baisse brutale de température' },
  { id: 'pre', label: 'Météo dangereuse avant le montage hiver' }
];
function computeAlerts(model, cars, S, seasonByCar) {
  const res = {}; const seq = seqOf(model, model.nowI, 24); const sm = summarize(seq);
  const set = (id, sev, title, detail) => { res[id] = { id, sev, title, detail }; };
  if (sm.Tmin != null && sm.Tmin < 7) set('t7', 1, `Minimum prévu ${f1(sm.Tmin)} °C`, `Vers ${hhmm(sm.iTmin)}. Le seuil de 7 °C est une règle pratique : les performances relatives hiver/été évoluent, ce n’est pas une bascule instantanée.`);
  const summerCars = cars.filter(c => effType(c) === 'summer');
  if (sm.Tmin != null && sm.Tmin < 5 && summerCars.length) set('t5s', 2, `${f1(sm.Tmin)} °C avec pneus été (${summerCars.map(c => c.short + (c.tire.type === 'unknown' ? ' : type inconnu' : '')).join(', ')})`, `Vers ${hhmm(sm.iTmin)}. Adhérence réduite, surtout sur chaussée humide.`);
  if (sm.Tmin != null && sm.Tmin <= 1.5) set('t0', 3, `Température proche de 0 °C (${f1(sm.Tmin)} °C)`, `Vers ${hhmm(sm.iTmin)}. Chaussée estimée jusqu’à ${f1(sm.TrMin)} °C.`);
  if (sm.iceLevel >= 1) set('ice', sm.iceLevel >= 2 ? 3 : 2, `Risque de verglas ${ICE_LV[sm.iceLevel]} (estimé)`, `Pic vers ${hhmm(sm.iceI)}. Risque calculé, non observé sur la route.`);
  if (sm.snowSum > 0 || sm.snowCode) set('snow', summerCars.length ? 3 : 2, `Neige prévue${sm.snowSum > 0 ? ` (${f1(sm.snowSum)} cm)` : ''}`, `À partir de ${hhmm(sm.iSnow)}.`);
  const thr = S.rainThr || 5;
  if (sm.Pmax >= thr) set('rain', 2, `Forte pluie : ${f1(sm.Pmax)} mm/h`, `Vers ${hhmm(sm.iPmax)}. Seuil réglé à ${thr} mm/h.`);
  if (sm.visMin != null && sm.visMin < 500) set('fog', sm.visMin < 200 ? 3 : 2, `Brouillard : visibilité ${f0(sm.visMin)} m`, `Vers ${hhmm(sm.iVis)}.`);
  if (sm.visMin != null && sm.visMin < 1000) set('vis', 1, `Visibilité réduite : ${f0(sm.visMin)} m`, `Vers ${hhmm(sm.iVis)}.`);
  // gel nocturne : 21h → 9h
  let frost = null;
  seq.forEach(s => { const x = s.hs[s.i]; if ((x.hh >= 21 || x.hh <= 9) && x.T != null && x.T <= 0 && (!frost || x.T < frost.T)) frost = { T: x.T, s }; });
  if (frost) set('frost', 2, `Gel nocturne : ${f1(frost.T)} °C`, `Vers ${hhmm(frost.s)}.`);
  let drop = null;
  for (let k = 0; k + 3 < seq.length; k++) { const a = seq[k].hs[seq[k].i], b = seq[k + 3].hs[seq[k + 3].i]; if (a.T != null && b.T != null && a.T - b.T >= 5 && (!drop || a.T - b.T > drop.d)) drop = { d: a.T - b.T, s: seq[k + 3], from: a.T, to: b.T }; }
  if (drop) set('drop', drop.d >= 8 ? 3 : 2, `Baisse brutale : −${f1(drop.d)} °C en 3 h`, `De ${f1(drop.from)} à ${f1(drop.to)} °C vers ${hhmm(drop.s)}.`);
  const pre = cars.map(c => ({ c, s: seasonByCar[c.id] })).filter(o => o.s && o.s.coldBefore && effType(o.c) === 'summer');
  if (pre.length) { const o = pre[0]; set('pre', 3, `Météo hivernale avant le montage hiver (${o.c.short})`, `Premier épisode : ${fmtDay(o.s.coldBefore.first.date)}, avant le montage prévu le ${fmtDay(o.s.countdown.date)}.${o.s.coldBefore.partial ? ' Prévision au-delà de 14 j non disponible : analyse partielle.' : ''}`); }
  return res;
}

/* ===================== AJOUTS : géométrie, soleil, pneus, Loi Montagne ===================== */
const RAD = Math.PI / 180;
function distKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
// position du soleil (algorithme simplifié, précision ~1°) ; ms = instant UTC
function sunPos(ms, lat, lon) {
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
  const g = (357.529 + 0.98560028 * d) % 360, q = (280.459 + 0.98564736 * d) % 360;
  const L = q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD), e = 23.439 - 0.00000036 * d;
  const RA = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD;
  const dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
  const GMST = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
  const H = ((GMST * 15 + lon - RA) % 360 + 540) % 360 - 180;
  const alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(H * RAD)) / RAD;
  const az = (Math.atan2(-Math.sin(H * RAD), Math.tan(dec * RAD) * Math.cos(lat * RAD) - Math.sin(lat * RAD) * Math.cos(H * RAD)) / RAD + 360) % 360;
  return { alt, az };
}
// soleil bas (0,5° à 15°) à ±30° du cap de la route, ciel peu couvert
function glareCheck(A, B, depTs, durMin, offsetSec, cloudAt) {
  const br = bearing(A, B); let best = null;
  for (let m = 0; m <= durMin; m += 10) {
    const ts = addMin(depTs, m), f = m / Math.max(1, durMin);
    const s = sunPos(tsToDate(ts).getTime() - offsetSec * 1000, A.lat + (B.lat - A.lat) * f, A.lon + (B.lon - A.lon) * f);
    const diff = Math.abs(((s.az - br) % 360 + 540) % 360 - 180), cl = cloudAt(ts);
    if (s.alt > 0.5 && s.alt <= 15 && diff <= 30 && (cl == null || cl < 60) && (!best || s.alt < best.alt)) best = { ts, alt: s.alt, az: s.az, diff, cloud: cl };
  }
  return { bearing: br, glare: best };
}
const CAP = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const capTxt = b => CAP[Math.round(b / 45) % 8];
// âge d'un pneu depuis le code DOT (SSAA)
function dotAge(dot, nowStr) {
  const m = /^(\d{2})(\d{2})$/.exec(String(dot || '').trim()); if (!m) return null;
  const wk = +m[1], yr = 2000 + (+m[2]); if (wk < 1 || wk > 53) return null;
  const made = Date.UTC(yr, 0, 1) + (wk - 1) * 7 * 864e5, now = Date.parse(nowStr.slice(0, 10) + 'T12:00:00Z');
  const y = (now - made) / (365.25 * 864e5); return y < -0.1 ? null : Math.max(0, y);
}
// pression : loi des gaz parfaits sur la pression absolue
function pressTarget(s) { const m = /(\d+(?:[.,]\d+)?)/.exec(String(s || '')); const v = m ? parseFloat(m[1].replace(',', '.')) : null; return v != null && v > 0.8 && v < 5 ? v : null; }
function pressLoss(target, Tcheck, Tnow) { const p = target != null ? target : 2.4; return (p + 1.013) * (Tcheck - Tnow) / (273.15 + Tcheck); }
// Loi Montagne : 34 départements (liste 2025-2026), communes fixées par arrêté préfectoral
const MONT_DEPTS = ['Ain', 'Allier', 'Alpes-de-Haute-Provence', 'Alpes-Maritimes', 'Ardèche', 'Ariège', 'Aude', 'Aveyron', 'Bas-Rhin', 'Cantal', 'Doubs', 'Drôme', 'Haute-Garonne', 'Haute-Loire', 'Hautes-Alpes', 'Haute-Saône', 'Haute-Savoie', 'Hautes-Pyrénées', 'Haut-Rhin', 'Isère', 'Jura', 'Loire', 'Lozère', 'Moselle', 'Puy-de-Dôme', 'Pyrénées-Atlantiques', 'Pyrénées-Orientales', 'Rhône', 'Savoie', 'Tarn', 'Territoire de Belfort', 'Var', 'Vaucluse', 'Vosges'];
const normTxt = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const MONT_SET = new Set(MONT_DEPTS.map(normTxt));
function montagneInfo(loc, dateStr, elev) {
  const inDept = !!(loc && loc.dept && MONT_SET.has(normTxt(loc.dept)));
  const md = dateStr.slice(5, 10), season = md >= '11-01' || md <= '03-31';
  const high = elev != null && elev >= 700;
  return { inDept, season, elev, high, concerned: inDept || high };
}

/* ===================== AJOUTS 2 : AROME, ensemble, pluie 15 min, calibration ===================== */
function mergeArome(base, ar) {
  base.__arome = { hours: 0, until: null };
  if (!ar || !ar.hourly || !ar.hourly.time || !base.hourly) return base;
  const H = base.hourly, A = ar.hourly, idx = new Map(H.time.map((t, i) => [t, i]));
  const ct = (base.current && base.current.time) || (ar.current && ar.current.time);
  const limit = ct ? addMin(ct.slice(0, 13) + ':00', 48 * 60) : null;
  A.time.forEach((t, j) => {
    const i = idx.get(t); if (i == null || (limit && t > limit)) return;
    let any = false;
    Object.keys(A).forEach(k => { if (k === 'time' || !H[k]) return; const v = A[k][j]; if (typeof v === 'number' && isFinite(v)) { H[k][i] = v; any = true; } });
    if (any) { base.__arome.hours++; base.__arome.until = t; }
  });
  if (ar.current && base.current) Object.keys(ar.current).forEach(k => { const v = ar.current[k]; if (k !== 'time' && k !== 'interval' && typeof v === 'number' && isFinite(v)) base.current[k] = v; });
  return base;
}

// statistiques d'ensemble : chaque scénario est passé dans le même moteur (chaussée, verglas)
function interpGaps(arr) {
  const a = arr.map(num), n = a.length;
  for (let i = 0; i < n; i++) if (a[i] == null) {
    let j = i; while (j < n && a[j] == null) j++;
    if (i > 0 && j < n && a[i - 1] != null) for (let k = i; k < j; k++) a[k] = a[i - 1] + (a[j] - a[i - 1]) * (k - i + 1) / (j - i + 1);
    i = j;
  }
  return a;
}
function ensembleStats(ens, base) {
  const H = ens && ens.hourly; if (!H || !H.time || !base) return null;
  const mem = {};
  Object.keys(H).forEach(k => { if (k === 'time') return; const m = /^(.*?)(?:_member(\d+))?$/.exec(k); (mem[m[2] || '00'] = mem[m[2] || '00'] || {})[m[1]] = H[k]; });
  const ids = Object.keys(mem).filter(id => Array.isArray(mem[id].temperature_2m) && mem[id].temperature_2m.some(v => num(v) != null));
  if (ids.length < 5) return null;
  const t = H.time, per = t.map(() => ({ n: 0, road0: 0, air0: 0, ice: 0, t5: 0, rain: 0, Ts: [] }));
  ids.forEach(id => {
    const mb = mem[id], T = interpGaps(mb.temperature_2m), RHa = mb.relative_humidity_2m ? interpGaps(mb.relative_humidity_2m) : null;
    const CL = mb.cloud_cover ? interpGaps(mb.cloud_cover) : null, WI = mb.wind_speed_10m ? interpGaps(mb.wind_speed_10m) : null, PR = mb.precipitation ? mb.precipitation.map(num) : null;
    const hs = t.map((ts, i) => {
      const bi = base.byTime.get(ts), b = bi != null ? base.hs[bi] : {};
      const RH = RHa && RHa[i] != null ? RHa[i] : (b.RH ?? null), P = PR && PR[i] != null ? PR[i] : 0;
      return { t: ts, date: ts.slice(0, 10), hh: +ts.slice(11, 13), T: T[i], RH, Td: dewMagnus(T[i], RH), P, Pl: P, snow: 0, code: null,
        vis: b.vis ?? null, cloud: CL && CL[i] != null ? CL[i] : (b.cloud ?? null), wind: WI && WI[i] != null ? WI[i] : (b.wind ?? null), rad: b.rad ?? null };
    });
    hs.forEach((x, i) => { x.Tr = estRoad(hs, i); }); hs.forEach((x, i) => { x.ice = iceRisk(hs, i); });
    hs.forEach((x, i) => {
      if (x.T == null) return; const s = per[i]; s.n++; s.Ts.push(x.T);
      if (x.Tr != null && x.Tr <= 0) s.road0++; if (x.T <= 0) s.air0++; if (x.ice.score != null && x.ice.score >= 45) s.ice++; if (x.T < 5) s.t5++; if ((x.P || 0) >= 0.5) s.rain++;
    });
  });
  const out = new Map();
  t.forEach((ts, i) => {
    const s = per[i]; if (!s.n) return; s.Ts.sort((a, b) => a - b);
    const q = p => s.Ts[Math.min(s.Ts.length - 1, Math.max(0, Math.round(p * (s.Ts.length - 1))))];
    out.set(ts, { n: s.n, pRoad0: s.road0 / s.n, pAir0: s.air0 / s.n, pIce: s.ice / s.n, pT5: s.t5 / s.n, pRain: s.rain / s.n, p10: q(0.1), p90: q(0.9) });
  });
  return out;
}
function ensWindow(stats, times) {
  if (!stats) return null;
  const r = { n: 0, pRoad0: 0, pAir0: 0, pIce: 0, pT5: 0, pRain: 0, tRoad0: null };
  times.forEach(ts => { const s = stats.get(ts); if (!s) return; r.n = Math.max(r.n, s.n);
    if (s.pRoad0 > r.pRoad0) { r.pRoad0 = s.pRoad0; r.tRoad0 = ts; }
    ['pAir0', 'pIce', 'pT5', 'pRain'].forEach(k => { r[k] = Math.max(r[k], s[k]); }); });
  return r.n ? r : null;
}
// pluie au quart d'heure : prochaine averse et état actuel
function nowcast(p, nowStr) {
  const M15 = p && p.minutely_15; if (!M15 || !M15.time) return null;
  const now = nowStr.slice(0, 16), q = Math.floor(+now.slice(14, 16) / 15) * 15, start = now.slice(0, 14) + pad(q);
  const slots = [];
  M15.time.forEach((ts, i) => { if (ts >= start && slots.length < 8) slots.push({ ts, P: num(M15.precipitation ? M15.precipitation[i] : null), S: num(M15.snowfall ? M15.snowfall[i] : null) }); });
  if (!slots.length || slots.every(s => s.P == null)) return null;
  const wet = s => (s.P || 0) >= 0.1;
  const nowWet = wet(slots[0]), firstWet = slots.find(wet), firstDry = slots.find(s => !wet(s));
  const mins = ts => Math.round((tsToDate(ts) - tsToDate(now)) / 60000);
  return { slots, nowWet, startIn: !nowWet && firstWet ? Math.max(0, mins(firstWet.ts)) : null, stopAt: nowWet && firstDry ? firstDry.ts.slice(11, 16) : null,
    snow: slots.some(s => (s.S || 0) > 0), total: slots.reduce((a, s) => a + (s.P || 0), 0) };
}
// calibration : givre vu → chaussée réelle ≤ 0 ; mouillé non gelé → chaussée réelle > 0
function calibBias(list) {
  const inf = (list || []).filter(r => r && (r.kind === 'ice' || r.kind === 'wet') && r.Tr != null).slice(-12);
  if (!inf.length) return { bias: 0, n: 0 };
  const errs = inf.map(r => r.kind === 'ice' ? Math.min(0, -0.3 - r.Tr) : Math.max(0, 0.5 - r.Tr));
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  return { bias: Math.round(clamp(mean * inf.length / (inf.length + 2), -3, 3) * 10) / 10, n: inf.length };
}

/* ===================== BASE PNEUS + DÉCODAGE AUTOMATIQUE ===================== */
// Catégories au niveau du modèle (type, 3PMSF, usage). Les étiquettes UE dépendent de la dimension : non stockées.
const TIRE_DB = [
  ['Michelin', 'Pilot Sport 4S', 'summer', 0, 'Été ultra-haute performance (UHP), sportive'],
  ['Michelin', 'Pilot Sport 5', 'summer', 0, 'Été sport'],
  ['Michelin', 'Primacy 4+', 'summer', 0, 'Été confort / longévité'],
  ['Michelin', 'CrossClimate 2', 'allseason', 1, '4 saisons 3PMSF, orienté été'],
  ['Michelin', 'Pilot Alpin 5', 'winter', 1, 'Hiver performance'],
  ['Michelin', 'Alpin 6', 'winter', 1, 'Hiver tourisme'],
  ['Goodyear', 'UltraGrip Performance 3', 'winter', 1, 'Hiver performance (gamme 2022)'],
  ['Goodyear', 'UltraGrip 9+', 'winter', 1, 'Hiver tourisme'],
  ['Goodyear', 'Vector 4Seasons Gen-3', 'allseason', 1, '4 saisons 3PMSF'],
  ['Goodyear', 'Eagle F1 Asymmetric 6', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Goodyear', 'Eagle F1 Asymmetric 5', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Goodyear', 'EfficientGrip Performance 2', 'summer', 0, 'Été tourisme'],
  ['Continental', 'SportContact 7', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Continental', 'PremiumContact 7', 'summer', 0, 'Été tourisme premium'],
  ['Continental', 'AllSeasonContact 2', 'allseason', 1, '4 saisons 3PMSF'],
  ['Continental', 'WinterContact TS 870', 'winter', 1, 'Hiver tourisme'],
  ['Continental', 'WinterContact TS 870 P', 'winter', 1, 'Hiver performance'],
  ['Bridgestone', 'Potenza Sport', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Bridgestone', 'Turanza 6', 'summer', 0, 'Été tourisme'],
  ['Bridgestone', 'Turanza All Season 6', 'allseason', 1, '4 saisons 3PMSF'],
  ['Bridgestone', 'Weather Control A005 Evo', 'allseason', 1, '4 saisons 3PMSF'],
  ['Bridgestone', 'Blizzak LM005', 'winter', 1, 'Hiver tourisme'],
  ['Pirelli', 'P Zero', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Pirelli', 'Cinturato P7', 'summer', 0, 'Été tourisme'],
  ['Pirelli', 'Cinturato All Season SF3', 'allseason', 1, '4 saisons 3PMSF'],
  ['Pirelli', 'Sottozero 3', 'winter', 1, 'Hiver performance'],
  ['Hankook', 'Ventus S1 evo3', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Hankook', 'Kinergy 4S2', 'allseason', 1, '4 saisons 3PMSF'],
  ['Hankook', 'Winter i*cept RS3', 'winter', 1, 'Hiver tourisme'],
  ['Dunlop', 'Sport Maxx RT2', 'summer', 0, 'Été ultra-haute performance (UHP)'],
  ['Dunlop', 'Winter Sport 5', 'winter', 1, 'Hiver performance']
].map(([brand, model, type, pmsf, cat]) => ({ brand, model, type, pmsf: !!pmsf, cat, sizes: {}, tier: '' }));
let TIRE_DB_META = { version: 0, updated: null, sizes: {}, count: TIRE_DB.length, source: 'intégrée' };
const sizeKey = s => { const d = decodeSize(s); return d ? `${d.w}/${d.ar} R${d.rim}` : null; };
// charge une base JSON (fichier publié) : remplace la liste intégrée si elle est valide
function loadTireDB(js, source) {
  if (!js || !Array.isArray(js.tires) || js.tires.length < 5) return false;
  const list = js.tires.filter(x => x && x.b && x.m && ['summer', 'winter', 'allseason'].includes(x.t))
    .map(x => ({ brand: x.b, model: x.m, type: x.t, pmsf: x.p == null ? null : !!x.p, cat: x.c || '', sizes: x.s || {}, tier: x.tier || '', added: x.a || null, year: x.y || null }));
  if (list.length < 5) return false;
  TIRE_DB.length = 0; list.forEach(x => TIRE_DB.push(x));
  TIRE_DB_META = { version: js.version || 0, updated: js.updated || null, sizes: js.sizes || {}, count: list.length, source: source || 'fichier', note: js.note || '' };
  return true;
}
function findTire(brand, model) {
  const b = normTxt(brand), raw = String(model || ''), m = normTxt(raw.replace(/\(.*?\)/g, '')), mFull = normTxt(raw);
  if (!m) return null;
  const pool = TIRE_DB.filter(t => !b || normTxt(t.brand) === b);
  const exact = pool.find(t => normTxt(t.model) === mFull || normTxt(t.model) === m || normTxt(t.model.replace(/\(.*?\)/g, '')) === m);
  if (exact) return exact;
  // sinon le préfixe le plus long (évite de confondre « Pilot Sport 4 » et « Pilot Sport 4S »)
  return pool.filter(t => m.startsWith(normTxt(t.model.replace(/\(.*?\)/g, '')))).sort((x, y) => y.model.length - x.model.length)[0] || null;
}
const SRC_TXT = { 'vérifié': 'dimension vérifiée', catalogue: 'vu au catalogue pour ce véhicule', gamme: 'gamme du fabricant, à confirmer à l’achat' };
function compatible(car) {
  const k = sizeKey(car.tire.size || (car.sets && car.sets.summer && car.sets.summer.size) || '');
  return k ? TIRE_DB.filter(t => t.sizes && t.sizes[k]) : [];
}
const LOAD_KG = { 60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300, 67: 307, 68: 315, 69: 325, 70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437, 80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580, 90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775, 100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030, 110: 1060 };
const SPEED_KMH = { L: 120, M: 130, N: 140, P: 150, Q: 160, R: 170, S: 180, T: 190, U: 200, H: 210, V: 240, W: 270, Y: 300 };
function decodeSize(size) {
  const s = String(size || '').toUpperCase(), m = /(\d{3})\s*\/\s*(\d{2})\s*(ZR|R)?\s*(\d{2})(?:\s*\(?\s*(\d{2,3})\s*([A-Z])\s*\)?)?/.exec(s);
  if (!m) return null;
  const w = +m[1], ar = +m[2], rim = +m[4], side = Math.round(w * ar / 100), dia = Math.round(rim * 25.4 + 2 * side);
  const li = m[5] ? +m[5] : null, si = m[6] || null;
  return { w, ar, rim, side, dia, zr: m[3] === 'ZR', li, kg: li != null ? LOAD_KG[li] || null : null, si, kmh: si ? SPEED_KMH[si] || null : null,
    xl: /\bXL\b|EXTRA\s*LOAD|REINF/.test(s), fp: /\bFP\b|\bMFS\b|\bFR\b/.test(s), rf: /\bRFT\b|\bROF\b|RUN\s*FLAT|\bSSR\b/.test(s) };
}
function dotTxt(dot, nowStr) {
  const m = /^(\d{2})(\d{2})$/.exec(String(dot || '').trim()); if (!m) return null;
  const age = dotAge(dot, nowStr);
  return `DOT ${dot} = semaine ${+m[1]} de 20${m[2]}${age != null ? ` (${(Math.round(age * 10) / 10).toFixed(1).replace('.', ',')} ans)` : ''}`;
}
// fiche automatique : décodage dimension + DOT + base de modèles
function tireSheet(tire, nowStr) {
  const out = [], d = decodeSize(tire.size), db = findTire(tire.brand, tire.model);
  if (db) { const k = sizeKey(tire.size), src = k && db.sizes ? db.sizes[k] : null;
    out.push(`${db.brand} ${db.model} : ${db.cat}${db.pmsf === true ? ' · marquage 3PMSF (flocon)' : db.pmsf === false ? ' · sans 3PMSF' : ' · 3PMSF à vérifier sur le flanc'}${db.tier ? ' · gamme ' + db.tier : ''}${src ? ' · ' + (SRC_TXT[src] || src) : ''}`); }
  if (d) {
    out.push(`Largeur ${d.w} mm · flanc ${d.side} mm (${d.ar} %) · jante ${d.rim}" · diamètre ≈ ${d.dia} mm`);
    const idx = [];
    if (d.li != null) idx.push(`charge ${d.li} = ${d.kg ? d.kg + ' kg par pneu' : 'indice inconnu'}`);
    if (d.si) idx.push(`vitesse ${d.si} = ${d.kmh ? d.kmh + ' km/h' : 'au-delà de 240 km/h'}`);
    if (idx.length) out.push(idx.join(' · '));
    const fl = []; if (d.xl) fl.push('Extra Load (renforcé)'); if (d.zr) fl.push('ZR (> 240 km/h)'); if (d.fp) fl.push('protège-jante'); if (d.rf) fl.push('roulage à plat');
    if (fl.length) out.push(fl.join(' · '));
  }
  const dt = dotTxt(tire.dot, nowStr); if (dt) out.push(dt);
  return { lines: out, db };
}

/* ===================== RECALAGE PAR OBSERVATION RÉELLE (station METAR) ===================== */
// La mesure de la station corrige l'heure en cours, puis l'écart s'estompe sur 6 h (température, rosée)
// et sur 3 h pour la visibilité (brouillard observé).
function applyObs(model, stations, maxKm) {
  if (!model || model.nowI < 0 || !stations) return null;
  const loc = model.loc || {}, now = Date.now();
  let best = null;
  Object.values(stations).forEach(s => {
    if (!s || !s.last || s.last.T == null || loc.lat == null) return;
    const d = distKm(loc, s), age = (now - Date.parse(s.last.t)) / 60000;
    if (d <= (maxKm || 35) && age >= -10 && age <= 100 && (!best || d < best.d)) best = { s, d, age };
  });
  if (!best) return null;
  const o = best.s.last, hs = model.hs, i0 = model.nowI, x0 = hs[i0];
  if (!x0 || x0.T == null) return null;
  const dT = o.T - x0.T, dTd = o.Td != null && x0.Td != null ? o.Td - x0.Td : 0;
  for (let k = 0; k <= 6; k++) { const x = hs[i0 + k]; if (!x || x.T == null) continue; const w = 1 - k / 7; x.T = Math.round((x.T + dT * w) * 10) / 10; if (x.Td != null) x.Td = Math.round((x.Td + dTd * w) * 10) / 10; }
  let visAdj = false;
  if (o.vis != null && (x0.vis == null || o.vis < x0.vis)) {
    for (let k = 0; k <= 3; k++) { const x = hs[i0 + k]; if (!x) continue; const w = 1 - k / 4, mv = x.vis != null ? x.vis : 20000; x.vis = Math.round(o.vis * w + mv * (1 - w)); }
    visAdj = true;
  }
  if (/FG/.test(o.wx || '') && x0.code !== 45 && x0.code !== 48) x0.code = (o.T <= 0 ? 48 : 45);
  hs.forEach((x, i) => { x.Tr = estRoad(hs, i); }); hs.forEach((x, i) => { x.ice = iceRisk(hs, i); });
  model.cur.Tr = hs[i0].Tr; model.cur.ice = hs[i0].ice; model.cur.vis = hs[i0].vis; model.cur.Td = hs[i0].Td;
  return { id: best.s.id, name: best.s.name, dist: best.d, age: Math.round(best.age), T: o.T, Td: o.Td, vis: o.vis, wx: o.wx, wind: o.wind, gust: o.gust, qnh: o.qnh, t: o.t, dT, visAdj, raw: o.raw };
}
const WX_FR = { FG: 'brouillard', BR: 'brume', FZFG: 'brouillard givrant', RA: 'pluie', DZ: 'bruine', SN: 'neige', SHRA: 'averses', TS: 'orage', HZ: 'brume sèche', FZRA: 'pluie verglaçante', FZDZ: 'bruine verglaçante', MIFG: 'brouillard mince', BCFG: 'bancs de brouillard', PRFG: 'brouillard partiel' };
const wxFr = s => String(s || '').split(' ').filter(Boolean).map(t => { const k = t.replace(/^[-+]|^VC/, ''); return (t[0] === '-' ? 'faible ' : t[0] === '+' ? 'fort ' : '') + (WX_FR[k] || WX_FR[k.slice(2)] || t); }).join(', ');
