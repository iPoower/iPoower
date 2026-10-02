// Relais Race Control (GitHub Actions, toutes les 30 min) :
// 1) observations réelles des stations (METAR) -> obs.json
// 2) de 90 à 5 min avant le départ, verdict du trajet toutes les 15 min -> notification si orange/rouge, brouillard ou verglas,
//    puis nouvelle notification seulement en cas d'aggravation (3 par matin maximum)
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = __dirname, crypto = require('crypto');
// configuration personnelle chiffrée : clé fournie par le secret GitHub RC_KEY
function openCfg() {
  const plainFile = path.join(dir, 'relay-config.json');
  if (fs.existsSync(plainFile)) return JSON.parse(fs.readFileSync(plainFile, 'utf8'));
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'relay-config.sealed.json'), 'utf8')), pass = (process.env.RC_KEY || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
  if (!pass) { console.log('Secret RC_KEY absent : observations seules, pas de notification'); return null; }
  const key = crypto.pbkdf2Sync(pass, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), buf = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(S.i, 'base64')); d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
}
const STATIONS = [{ id: 'LFAQ', name: 'Albert-Bray', lat: 49.9715, lon: 2.6976 }, { id: 'LFAY', name: 'Amiens-Glisy', lat: 49.8730, lon: 2.3870 }];
let cfg = null; try { cfg = openCfg(); } catch (e) { console.log('Configuration illisible', e.message); }
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'engine.js'), 'utf8') + ';this.E={makeModel,mergeArome,summarize,windowAssess,LV,ICE_LV,TYPE_LABEL,hasTires,f1,f0,addMin,toMin,nowIn,distKm,applyObs,wxFr};', ctx);
const E = ctx.E;
const obsFile = path.join(dir, 'obs.json');
const prev = fs.existsSync(obsFile) ? JSON.parse(fs.readFileSync(obsFile, 'utf8')) : { stations: {}, notified: null };

function parseMetar(raw) {
  const o = {}; const s = ' ' + raw + ' ';
  let m = / (M?\d{2})\/(M?\d{2}) /.exec(s); if (m) { const v = x => x[0] === 'M' ? -(+x.slice(1)) : +x; o.T = v(m[1]); o.Td = v(m[2]); }
  if (/ CAVOK /.test(s)) o.vis = 10000; else { m = / (\d{4})(?:NDV)? /.exec(s.replace(/ \d{6}Z /, ' ')); if (m) o.vis = +m[1] === 9999 ? 10000 : +m[1]; }
  m = / (\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT /.exec(s); if (m) { o.wind = Math.round(+m[2] * 1.852); if (m[3]) o.gust = Math.round(+m[3] * 1.852); }
  m = / Q(\d{4}) /.exec(s); if (m) o.qnh = +m[1];
  const wx = raw.split(/\s+/).filter(x => /^(?:[-+]|VC)?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ)+$/.test(x));
  o.wx = wx.join(' ');
  return o;
}
async function getJSON(u) { const r = await fetch(u, { headers: { 'User-Agent': 'race-control-relay (github.com/iPoower)' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }


/* ===== agenda Google (adresse iCal secrète, secret GitHub GCAL_ICS) -> calendar.sealed.json chiffré avec le code de l'app ===== */
const PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const toParis = d => PARIS.format(d).replace(' ', 'T').slice(0, 16);
function parisToDate(local) { // heure murale de Paris -> instant
  const guess = new Date(local + ':00Z'); const off = (new Date(toParis(guess) + ':00Z') - guess); return new Date(guess - off);
}
function icsDate(v, params) {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) return { s: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00`, allDay: true };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v); if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  return { s: m[7] ? toParis(new Date(iso + ':00Z')) : iso, allDay: false }; // TZID : traité comme heure de Paris
}
const unesc = t => String(t || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
function parseIcs(txt) {
  const lines = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/), evs = []; let cur = null;
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') { cur = { exdate: [] }; continue; }
    if (ln === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = ln.indexOf(':'); if (i < 0) continue;
    const head = ln.slice(0, i), val = ln.slice(i + 1), [name, ...pr] = head.split(';'), params = pr.join(';');
    if (name === 'DTSTART') cur.start = icsDate(val, params);
    else if (name === 'DTEND') cur.end = icsDate(val, params);
    else if (name === 'SUMMARY') cur.title = unesc(val);
    else if (name === 'LOCATION') cur.loc = unesc(val);
    else if (name === 'UID') cur.uid = val;
    else if (name === 'STATUS') cur.status = val;
    else if (name === 'RRULE') cur.rrule = Object.fromEntries(val.split(';').map(x => x.split('=')));
    else if (name === 'EXDATE') val.split(',').forEach(v => { const d = icsDate(v, params); if (d) cur.exdate.push(d.s); });
    else if (name === 'RECURRENCE-ID') cur.recId = icsDate(val, params);
  }
  return evs;
}
// occurrences dans la fenêtre [from, to] (récurrences quotidiennes et hebdomadaires gérées)
function expand(evs, from, to) {
  const out = [], over = new Set(evs.filter(e => e.recId).map(e => e.uid + '|' + e.recId.s));
  const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  evs.forEach(e => {
    if (!e.start || e.status === 'CANCELLED') return;
    const durMin = e.end ? (Date.parse(e.end.s + ':00Z') - Date.parse(e.start.s + ':00Z')) / 60000 : 60;
    const push = s => { if (s >= from && s <= to && !e.exdate.includes(s) && (e.recId || !over.has(e.uid + '|' + s))) out.push({ ...e, s, e: new Date(Date.parse(s + ':00Z') + durMin * 60000).toISOString().slice(0, 16) }); };
    const r = e.rrule;
    if (!r || e.recId) { push(e.start.s); return; }
    const iv = +(r.INTERVAL || 1), until = r.UNTIL ? (icsDate(r.UNTIL, '') || {}).s : null, count = r.COUNT ? +r.COUNT : null;
    const byday = r.BYDAY ? r.BYDAY.split(',').map(d => DOW.indexOf(d.slice(-2))) : null, t0 = e.start.s.slice(10);
    let n = 0;
    for (let k = 0; k < 800; k++) {
      const d = new Date(Date.parse(e.start.s.slice(0, 10) + 'T12:00:00Z') + k * 864e5), ds = d.toISOString().slice(0, 10) + t0;
      if (until && ds > until) break; if (ds > to) break;
      let ok = false;
      if (r.FREQ === 'DAILY') ok = k % iv === 0;
      else if (r.FREQ === 'WEEKLY') ok = Math.floor(k / 7) % iv === 0 && (byday ? byday.includes(d.getUTCDay()) : k % 7 === 0);
      else break;
      if (!ok) continue; n++; if (count && n > count) break;
      push(ds);
    }
  });
  return out.sort((a, b) => a.s < b.s ? -1 : 1);
}
async function geocodeLoc(q) {
  try {
    const j = await getJSON('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(q.slice(0, 200)));
    const f = j && j.features && j.features[0];
    if (f && f.properties && f.properties.score >= 0.45) return { lat: +f.geometry.coordinates[1].toFixed(4), lon: +f.geometry.coordinates[0].toFixed(4), label: f.properties.label };
  } catch (e) { /* géocodeur français indisponible */ }
  const parts = q.split(',').map(x => x.replace(/\d{5}/g, '').trim()).filter(Boolean);
  for (const name of [...parts.slice().reverse(), q]) {
    try { const j = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=' + encodeURIComponent(name));
      const r = j && j.results && j.results[0]; if (r) return { lat: r.latitude, lon: r.longitude, label: [r.name, r.admin1, r.country_code === 'FR' ? '' : r.country].filter(Boolean).join(', ') }; } catch (e) { /* suivant */ }
  }
  return null;
}
function sealWith(pass, obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(pass, salt, 600000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', it: 600000, s: salt.toString('base64'), i: iv.toString('base64'), c: ct.toString('base64') };
}
async function calendarSync(out) {
  const url = (process.env.GCAL_ICS || '').trim(), pass = (process.env.APP_KEY || process.env.RC_KEY || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
  out.relay.cal = !url ? 'absent' : !pass ? 'sans clé' : 'ok';
  if (!url || !pass) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('agenda ' + r.status);
    const from = toParis(new Date()), to = toParis(new Date(Date.now() + 8 * 864e5));
    const occ = expand(parseIcs(await r.text()), from.slice(0, 10) + 'T00:00', to).filter(e => e.loc && e.loc.length > 2).slice(0, 25);
    const geo = {}, events = [];
    for (const e of occ) {
      const g = geo[e.loc] !== undefined ? geo[e.loc] : (geo[e.loc] = await geocodeLoc(e.loc));
      events.push({ t: e.title || 'Rendez-vous', s: e.s, e: e.e, allDay: !!e.start.allDay, loc: e.loc, lat: g ? g.lat : null, lon: g ? g.lon : null, label: g ? g.label : null });
    }
    out.relay.calN = events.length; out.relay.calGeo = events.filter(x => x.lat != null).length;
    fs.writeFileSync(path.join(dir, 'calendar.sealed.json'), JSON.stringify(sealWith(pass, { updated: new Date().toISOString(), events })));
    return events;
  } catch (e) { out.relay.calErr = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 120); return null; }
}

(async () => {
  // obs.json est public : on n'y garde ni lieu ni titre de notification
  const out = { updated: new Date().toISOString(), stations: {}, notified: prev.notified || null, calNotified: prev.calNotified || {}, lastPush: prev.lastPush ? { at: prev.lastPush.at, level: prev.lastPush.level } : null };
  // 1) METAR
  try {
    const ids = STATIONS.map(s => s.id).join(',');
    const list = await getJSON(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=6`);
    STATIONS.forEach(st => {
      const obs = list.filter(x => x.icaoId === st.id && x.rawOb).sort((a, b) => b.obsTime - a.obsTime);
      const hist = obs.slice(0, 12).map(x => ({ t: new Date(x.obsTime * 1000).toISOString(), ...parseMetar(x.rawOb), raw: x.rawOb }));
      out.stations[st.id] = { ...st, last: hist[0] || null, hist };
    });
  } catch (e) { console.log('METAR indisponible', e.message); out.stations = prev.stations || {}; out.metarError = e.message; }
  // 2) notification du matin
  const now = E.nowIn('Europe/Paris'), hm = E.toMin(now.slice(11, 16)), today = now.slice(0, 10);
  const force = process.env.FORCE_PUSH === '1';
  // diagnostic public, sans aucune donnée personnelle
  out.relay = { cfg: cfg ? 'ok' : (process.env.RC_KEY ? 'illisible' : 'absent'), force, at: now };
  // état du matin : on garde le pire constaté du jour pour ne notifier qu'en cas d'aggravation
  const pm = prev.morning && prev.morning.date === today ? prev.morning : null;
  out.morning = pm || { date: today, w: -1, i: -1, f: false, sent: 0, checks: 0 };
  const depMin = cfg ? E.toMin(cfg.dep) : 390, inWin = hm >= depMin - 90 && hm <= depMin - 5;
  if (cfg && (force || inWin)) {
    try {
      const API = 'https://api.open-meteo.com/v1/forecast';
      const Q = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
      const QA = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
      const model = async l => { const b = await getJSON(`${API}?latitude=${l.lat}&longitude=${l.lon}&hourly=${Q}&timezone=auto&past_days=1&forecast_days=2`);
        let a = null; try { a = await getJSON(`${API}?latitude=${l.lat}&longitude=${l.lon}&hourly=${QA}&models=meteofrance_seamless&timezone=auto&past_days=1&forecast_days=2`); } catch (e) { a = null; }
        const m = E.makeModel(E.mergeArome(b, a), 'relay', l); E.applyObs(m, out.stations, 35); return m; };
      const origins = cfg.origins && cfg.origins.length ? cfg.origins : [cfg.home];
      const [B, ...As] = await Promise.all([model(cfg.work), ...origins.map(model)]);
      const dep = today + 'T' + cfg.dep, arr = E.addMin(dep, cfg.durMin), seq = [];
      // tous les points de départ possibles : on retient le cas le plus défavorable
      for (let t = dep.slice(0, 13) + ':00'; t <= arr.slice(0, 13) + ':00'; t = E.addMin(t, 60)) {
        As.forEach(A => { const a = A.byTime.get(t); if (a != null) seq.push({ hs: A.hs, i: a }); });
        const b = B.byTime.get(t); if (b != null) seq.push({ hs: B.hs, i: b }); }
      const sum = E.summarize(seq);
      const res = cfg.cars.filter(E.hasTires).map(c => ({ c, w: E.windowAssess(c, seq, 'trip') })).filter(r => r.w);
      const worst = res.reduce((m, r) => Math.max(m, r.w.level), 0);
      const fog = sum.visMin != null && sum.visMin < 500, ice = sum.iceLevel || 0;
      const alert = worst >= 2 || fog || ice >= 1, M = out.morning;
      // première alerte du jour, ou aggravation nette par rapport au pire déjà signalé (3 maximum)
      const first = M.sent === 0, worse = worst > M.w || ice > M.i || (fog && !M.f);
      const go = force || (alert && (first || worse) && M.sent < 3);
      M.checks++;
      if (go) {
        const st = Object.values(out.stations).find(s => s.last && s.last.T != null);
        const tag = !force && !first ? '⚠️ Aggravation · ' : '';
        const title = `${tag}${E.LV[worst].emoji} ${E.LV[worst].name} · départ ${cfg.dep} · trajet du matin`;  // aucun nom de lieu (ntfy.sh est un serveur public)
        const lines = res.map(r => `${r.c.short} (${E.TYPE_LABEL[r.c.tire.type]}) : ${E.LV[r.w.level].name} ${r.w.score}/100`);
        lines.push(`Min ${E.f1(sum.Tmin)} °C · chaussée est. ${E.f1(sum.TrMin)} °C · verglas ${E.ICE_LV[ice].toLowerCase()}${fog ? ' · brouillard ' + E.f0(sum.visMin) + ' m' : ''}`);
        if (st) lines.push(`Mesuré station proche : ${E.f1(st.last.T)} °C${st.last.vis != null && st.last.vis < 5000 ? ', visibilité ' + st.last.vis + ' m' : ''}${st.last.wx ? ' · ' + E.wxFr(st.last.wx) : ''}`);
        const r = await fetch('https://ntfy.sh/', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: cfg.ntfy, title, message: lines.join('\n'), priority: worst >= 3 ? 5 : worst >= 2 || !first ? 4 : 3, tags: ['car'], click: cfg.site }) });
        console.log('ntfy', r.status); out.relay.ntfy = r.status;
        if (r.ok) { out.lastPush = { at: now, level: worst }; if (!force) M.sent++; }
      } else { console.log(alert ? 'Alerte déjà signalée, pas d\'aggravation' : 'Conditions sans alerte'); out.relay.ntfy = 'rien'; }
      if (!force && (alert || go)) { M.w = Math.max(M.w, worst); M.i = Math.max(M.i, ice); M.f = M.f || fog; }
      out.notified = today;
    } catch (e) { console.log('Verdict impossible', e.message); out.relay.err = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 120); }
  }
  // 3) agenda : synchronisation chiffrée + alerte pour les trajets du jour (sans nom de lieu dans la notification)
  const evs = await calendarSync(out);
  if (cfg && evs && evs.length) {
    try {
      const API = 'https://api.open-meteo.com/v1/forecast', Q = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
      const home = (cfg.origins && cfg.origins[0]) || cfg.home, cars = cfg.cars.filter(E.hasTires), notified = (prev.calNotified || {});
      out.calNotified = Object.fromEntries(Object.entries(notified).filter(([k]) => k.slice(0, 10) >= now.slice(0, 10)));
      for (const ev of evs) {
        if (ev.lat == null || ev.allDay) continue;
        const km = E.distKm(home, ev); if (km < 3) continue;
        const dur = Math.round(km * 1.3 / (km < 25 ? 55 : km < 60 ? 70 : 90) * 60) + 10, dep = new Date(Date.parse(ev.s + ':00Z') - (dur + 10) * 60000).toISOString().slice(0, 16);
        const hrs = (Date.parse(dep + ':00Z') - Date.parse(now + ':00Z')) / 36e5; if (hrs < 0 || hrs > 14) continue;
        const mk = async l => E.makeModel(await getJSON(`${API}?latitude=${l.lat}&longitude=${l.lon}&hourly=${Q}&timezone=auto&past_days=1&forecast_days=3`), 'relay', l);
        const [A, B] = await Promise.all([mk(home), mk(ev)]), seq = [];
        const arr = new Date(Date.parse(dep + ':00Z') + dur * 60000).toISOString().slice(0, 16);
        for (let t = dep.slice(0, 13) + ':00'; t <= arr.slice(0, 13) + ':00'; t = E.addMin(t, 60)) { const a = A.byTime.get(t), b = B.byTime.get(t); if (a != null) seq.push({ hs: A.hs, i: a }); if (b != null) seq.push({ hs: B.hs, i: b }); }
        if (!seq.length) continue;
        const res = cars.map(c => ({ c, w: E.windowAssess(c, seq, 'trip') })).filter(r => r.w), worst = res.reduce((m, r) => Math.max(m, r.w.level), 0), sum = E.summarize(seq);
        const key = ev.s + '|' + (ev.t || '').length, fog = sum.visMin != null && sum.visMin < 500, ice = sum.iceLevel || 0;
        if ((worst >= 2 || fog || ice >= 1) && (notified[key] == null || worst > notified[key])) {
          const title = `📅 ${E.LV[worst].emoji} ${E.LV[worst].name} · trajet agenda de ${ev.s.slice(11, 16)}`;
          const lines = [`Départ conseillé ≈ ${dep.slice(11, 16)} · ${Math.round(km)} km`, ...res.map(r => `${r.c.short} : ${E.LV[r.w.level].name} ${r.w.score}/100`),
            `Min ${E.f1(sum.Tmin)} °C · chaussée est. ${E.f1(sum.TrMin)} °C · verglas ${E.ICE_LV[ice].toLowerCase()}${fog ? ' · brouillard ' + E.f0(sum.visMin) + ' m' : ''}`];
          const r = await fetch('https://ntfy.sh/', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: cfg.ntfy, title, message: lines.join('\n'), priority: worst >= 3 ? 5 : 4, tags: ['calendar'], click: cfg.site }) });
          if (r.ok) out.calNotified[key] = worst;
        }
      }
    } catch (e) { out.relay.calAlertErr = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 120); }
  }
  fs.writeFileSync(obsFile, JSON.stringify(out));
  console.log('Terminé');
  process.exit(0);
})();
