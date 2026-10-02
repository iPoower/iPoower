// Relais Race Control (GitHub Actions, toutes les 30 min) :
// 1) observations réelles des stations (METAR) -> obs.json
// 2) entre 05:25 et 06:15 (heure de Paris), verdict du trajet -> notification ntfy si orange ou rouge
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = __dirname, crypto = require('crypto');
// configuration personnelle chiffrée : clé fournie par le secret GitHub RC_KEY
function openCfg() {
  const plainFile = path.join(dir, 'relay-config.json');
  if (fs.existsSync(plainFile)) return JSON.parse(fs.readFileSync(plainFile, 'utf8'));
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'relay-config.sealed.json'), 'utf8')), pass = process.env.RC_KEY;
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

(async () => {
  // obs.json est public : on n'y garde ni lieu ni titre de notification
  const out = { updated: new Date().toISOString(), stations: {}, notified: prev.notified || null, lastPush: prev.lastPush ? { at: prev.lastPush.at, level: prev.lastPush.level } : null };
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
  if (cfg && (force || (hm >= 5 * 60 + 25 && hm <= 6 * 60 + 15)) && (force || out.notified !== today)) {
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
      const fog = sum.visMin != null && sum.visMin < 500, ice = (sum.iceLevel || 0) >= 1;
      const st = Object.values(out.stations).find(s => s.last && s.last.T != null);
      if (force || worst >= 2 || fog || ice) {
        const title = `${E.LV[worst].emoji} ${E.LV[worst].name} · départ ${cfg.dep} (${origins.map(o => o.name.split(' ')[0].split('-')[0]).join(' / ')})`;
        const lines = res.map(r => `${r.c.short} (${E.TYPE_LABEL[r.c.tire.type]}) : ${E.LV[r.w.level].name} ${r.w.score}/100`);
        lines.push(`Min ${E.f1(sum.Tmin)} °C · chaussée est. ${E.f1(sum.TrMin)} °C · verglas ${E.ICE_LV[sum.iceLevel || 0].toLowerCase()}${fog ? ' · brouillard ' + E.f0(sum.visMin) + ' m' : ''}`);
        if (st) lines.push(`Mesuré ${st.name} : ${E.f1(st.last.T)} °C${st.last.vis != null && st.last.vis < 5000 ? ', visibilité ' + st.last.vis + ' m' : ''}${st.last.wx ? ' · ' + E.wxFr(st.last.wx) : ''}`);
        const r = await fetch('https://ntfy.sh/', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: cfg.ntfy, title, message: lines.join('\n'), priority: worst >= 3 ? 5 : worst >= 2 ? 4 : 3, tags: ['car'], click: cfg.site }) });
        console.log('ntfy', r.status); out.relay.ntfy = r.status; out.lastPush = { at: now, level: worst };
      } else { console.log('Conditions sans alerte, pas de notification'); out.relay.ntfy = 'rien'; }
      out.notified = today;
    } catch (e) { console.log('Verdict impossible', e.message); out.relay.err = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 120); }
  }
  fs.writeFileSync(obsFile, JSON.stringify(out));
  console.log('Terminé');
  process.exit(0);
})();
