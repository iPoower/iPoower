/* Public-only weather snapshot generator. NEVER imports the personal app or decrypts secrets.
   Run on a dedicated CI/server runner only after separate publication authorization.
   No browser calls the external API; no user locations/IPs are transmitted to Open-Meteo. */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const CITIES = Object.freeze([
  { id: 'amiens', name: 'Amiens', lat: 49.8941, lon: 2.2958 },
  { id: 'lille', name: 'Lille', lat: 50.6293, lon: 3.0573 },
  { id: 'rouen', name: 'Rouen', lat: 49.4431, lon: 1.0993 },
  { id: 'paris', name: 'Paris', lat: 48.8566, lon: 2.3522 }
]);
const API = 'https://api.open-meteo.com/v1/forecast';
const CURRENT = ['temperature_2m','apparent_temperature','precipitation','wind_speed_10m','wind_gusts_10m'];
const HOURLY = [...CURRENT,'precipitation_probability'];
const scalar = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
function utc(t) {
  if (typeof t !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t)) return null;
  const v = t + ':00Z'; return Number.isFinite(Date.parse(v)) ? v : null;
}
function urlFor(city) {
  const u = new URL(API);
  u.search = new URLSearchParams({
    latitude: String(city.lat), longitude: String(city.lon),
    current: CURRENT.join(','), hourly: HOURLY.join(','),
    timezone: 'GMT', forecast_days: '2', wind_speed_unit: 'kmh',
    precipitation_unit: 'mm'
  }).toString();
  return u.toString();
}
function toRow(src, i = null) {
  const get = key => i == null ? src[key] : src[key] && src[key][i];
  return { time: utc(get('time')), temperature: scalar(get('temperature_2m')),
    apparentTemperature: scalar(get('apparent_temperature')),
    precipitation: scalar(get('precipitation')),
    precipitationProbability: scalar(get('precipitation_probability')),
    wind: scalar(get('wind_speed_10m')), gusts: scalar(get('wind_gusts_10m')) };
}
async function buildSnapshot(fetcher = fetch, now = Date.now()) {
  const cities = {};
  // Serial requests (not 4 parallel bursts) and one bounded retry-free pass: 429 stops the job.
  for (const city of CITIES) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    let result;
    try {
      const response = await fetcher(urlFor(city), { method: 'GET', headers: { Accept: 'application/json' },
        redirect: 'error', signal: ctrl.signal });
      if (!response.ok) throw new Error(response.status === 429 ? 'weather desk rate limited' : 'weather desk upstream unavailable');
      result = await response.json();
    } finally { clearTimeout(timeout); }
    if (!result || result.error || !result.current || !result.hourly || !Array.isArray(result.hourly.time))
      throw new Error('weather desk invalid upstream schema');
    const current = toRow(result.current);
    const hourly = result.hourly.time.map((_, i) => toRow(result.hourly, i))
      .filter(row => row.time && Date.parse(row.time) >= now - 3600000)
      .slice(0, 24);
    if (!current.time || current.temperature == null || hourly.length < 12 ||
      hourly.some(row => row.temperature == null))
      throw new Error('weather desk insufficient public data');
    cities[city.id] = { name: city.name, current, hourly };
  }
  return { schema: 1, provider: 'Open-Meteo', generatedAt: new Date(now).toISOString(), cities };
}
async function main() {
  const snapshot = await buildSnapshot();
  const dest = path.join(__dirname, 'public-weather.json');
  const tmp = dest + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(snapshot) + '\n', { mode: 0o644 });
    fs.renameSync(tmp, dest);
  } finally { try { fs.unlinkSync(tmp); } catch (_) {} }
  console.log('Weather Desk public snapshot generated; no personal location, key or URL logged.');
}
if (require.main === module) main().catch(() => { console.error('Weather Desk: public snapshot unavailable; existing file preserved.'); process.exitCode = 1; });
module.exports = { buildSnapshot, CITIES, utc, urlFor };
