/* Weather Desk preview: deliberately NO imports from Race Control, NO storage, NO SW, NO GPS, NO personal API. */
(() => {
  'use strict';
  const CITY_IDS = Object.freeze(['amiens', 'lille', 'rouen', 'paris']);
  const CITY_LABELS = Object.freeze({ amiens: 'Amiens', lille: 'Lille', rouen: 'Rouen', paris: 'Paris' });
  const LIVE_MS = 35 * 60 * 1000, MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  let dataset = null, failed = false, busy = false;
  const number = v => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, unit = '', digits = 0) => number(v) ? v.toFixed(digits).replace('.', ',') + unit : '—';
  const stamp = t => typeof t === 'string' ? Date.parse(t) : NaN;
  const time = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const date = t => new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
  const isRow = r => r && typeof r === 'object' && Number.isFinite(stamp(r.time)) &&
    ['temperature','apparentTemperature','precipitation','precipitationProbability','wind','gusts'].every(k => r[k] == null || number(r[k]));
  function valid(j) {
    if (!j || j.schema !== 1 || !Number.isFinite(stamp(j.generatedAt)) || !j.cities || typeof j.cities !== 'object') return false;
    const age = Date.now() - stamp(j.generatedAt);
    if (age < -5 * 60e3 || age > 7 * 24 * 3600e3) return false;
    return CITY_IDS.every(id => {
      const c = j.cities[id];
      return c && c.name === CITY_LABELS[id] && isRow(c.current) && Array.isArray(c.hourly) &&
        c.hourly.length >= 12 && c.hourly.length <= 48 && c.hourly.every(isRow);
    });
  }
  function frost(c) {
    const near = c.hourly.slice(0, 12).filter(x => number(x.temperature));
    if (!near.length) return 'Indisponible';
    const frozen = near.some(x => x.temperature <= 0);
    const wet = near.some(x => number(x.precipitation) && x.precipitation >= .2);
    return frozen ? (wet ? 'Gel / verglas possible*' : 'Gel possible*') : 'Faible selon l’air*';
  }
  function status(text, mode) {
    $('status').textContent = text;
    $('status').className = 'status' + (mode ? ' ' + mode : '');
  }
  function reset() {
    for (const id of ['temp','feels','rain','wind','gust','frost']) $(id).textContent = '—';
    $('hours').replaceChildren();
  }
  function render() {
    const age = dataset ? Date.now() - stamp(dataset.generatedAt) : Infinity;
    if (!dataset || age > MAX_AGE_MS || age < -5 * 60e3) {
      reset(); status('DONNÉES INDISPONIBLES', 'off');
      $('updated').textContent = dataset ? 'Données publiques trop anciennes : aucun affichage.' : 'Aucun fichier public valide disponible.';
      return;
    }
    const c = dataset.cities[$('city').value];
    if (!c) { reset(); status('DONNÉES INDISPONIBLES', 'off'); return; }
    status(!failed && age <= LIVE_MS ? 'LIVE · MODÈLE' : 'CACHE · ' + Math.round(age / 60000) + ' min',
      !failed && age <= LIVE_MS ? '' : 'cache');
    $('updated').textContent = 'Ville : ' + c.name + ' · fichier public : ' + date(dataset.generatedAt) +
      (failed ? ' · mise à jour impossible, copie mémoire seulement' : '') + ' · aucun suivi personnel';
    const n = c.current;
    $('temp').textContent = fmt(n.temperature, ' °C', 1);
    $('feels').textContent = 'Ressenti ' + fmt(n.apparentTemperature, ' °C', 1);
    $('rain').textContent = fmt(n.precipitation, ' mm', 1);
    $('wind').textContent = fmt(n.wind, ' km/h');
    $('gust').textContent = fmt(n.gusts, ' km/h');
    $('frost').textContent = frost(c);
    const rows = c.hourly.filter(r => stamp(r.time) >= Date.now() - 3600000).slice(0, 12);
    $('hours').replaceChildren(...rows.map(r => {
      const li = document.createElement('li');
      const t = document.createElement('time'); t.dateTime = r.time; t.textContent = time(r.time);
      const deg = document.createElement('strong'); deg.textContent = fmt(r.temperature, '°', 1);
      const rain = document.createElement('span'); rain.textContent = 'Pluie ' + fmt(r.precipitation, ' mm', 1);
      const prob = document.createElement('span'); prob.textContent = 'Prob. ' + fmt(r.precipitationProbability, '%');
      const wind = document.createElement('span'); wind.textContent = 'Vent ' + fmt(r.wind, ' km/h');
      li.append(t, deg, rain, prob, wind); return li;
    }));
    if (!rows.length) { const li = document.createElement('li'); li.textContent = 'Prévisions expirées'; $('hours').append(li); }
  }
  async function refresh() {
    if (busy) return;
    busy = true; $('refresh').disabled = true;
    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch('./public-weather.json', { method: 'GET', cache: 'no-store',
        credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error('public forecast unavailable');
      const payload = await response.json();
      if (!valid(payload)) throw new Error('invalid public forecast');
      if (!dataset || stamp(payload.generatedAt) >= stamp(dataset.generatedAt)) dataset = payload;
      failed = false;
    } catch (_) {
      // No error text, URLs, coordinates, cookies, secrets or raw provider responses in diagnostics.
      failed = true;
    } finally {
      clearTimeout(kill); busy = false; $('refresh').disabled = false; render();
    }
  }
  $('city').addEventListener('change', render);
  $('refresh').addEventListener('click', refresh);
  $('fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });
  window.addEventListener('focus', () => { render(); refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
  setInterval(() => { if (!document.hidden) refresh(); else render(); }, 30 * 60 * 1000);
  setInterval(render, 60 * 1000);
  refresh();
})();
