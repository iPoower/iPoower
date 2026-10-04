// Relais Race Control (GitHub Actions, toutes les 30 min) :
// 1) observations réelles des stations (METAR) -> obs.json
// 2) de 90 à 5 min avant le départ, verdict du trajet toutes les 15 min -> notification si orange/rouge, brouillard ou verglas,
//    puis nouvelle notification seulement en cas d'aggravation (3 par matin maximum)
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = __dirname, crypto = require('crypto');
// Deux clés indépendantes, sans repli de l'une sur l'autre :
//  - RC_KEY  (secret GitHub) : ouvre uniquement la configuration du relais (relay-config.sealed.json) ;
//  - APP_KEY (secret GitHub, = code de déverrouillage de l'app) : chiffre uniquement l'agenda (calendar.sealed.json), que l'app ouvre avec le même code.
const normKey = s => String(s || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();
function unsealWith(S, pass) {
  const key = crypto.pbkdf2Sync(pass, Buffer.from(S.s, 'base64'), S.it, 32, 'sha256'), buf = Buffer.from(S.c, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(S.i, 'base64')); d.setAuthTag(buf.subarray(buf.length - 16));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
}
function openCfg() {
  const plainFile = path.join(dir, 'relay-config.json');
  if (fs.existsSync(plainFile)) return JSON.parse(fs.readFileSync(plainFile, 'utf8'));
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'relay-config.sealed.json'), 'utf8')), app = normKey(process.env.APP_KEY);
  // clé du relais uniquement (RC_KEY), jamais APP_KEY : une clé du relais égale au code de l'app est refusée, même par valeur.
  const keys = [['RC_KEY', normKey(process.env.RC_KEY)]].filter(([, k]) => k);
  if (!keys.length) { console.log('Secret RC_KEY absent : observations seules, pas de notification'); return null; }
  for (const [name, k] of keys) {
    if (app && k === app) { console.log(`${name} identique à APP_KEY : refusée (les clés doivent être séparées)`); continue; }
    try { const c = unsealWith(S, k); console.log(`Configuration du relais ouverte avec ${name}`); return c; } catch (e) { console.log(`${name} n'ouvre pas la configuration du relais`); }
  }
  return null;
}
const STATIONS = [{ id: 'LFAQ', name: 'Albert-Bray', lat: 49.9715, lon: 2.6976 }, { id: 'LFAY', name: 'Amiens-Glisy', lat: 49.8730, lon: 2.3870 }];
let cfg = null; try { cfg = openCfg(); } catch (e) { console.log('Configuration illisible', e.message); }
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'engine.js'), 'utf8') + ';this.E={makeModel,mergeArome,summarize,windowAssess,LV,ICE_LV,TYPE_LABEL,hasTires,f1,f0,addMin,toMin,nowIn,distKm,applyObs,wxFr,legPoints,legSeq,legCritical,isCommuteDay};', ctx);
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
// mots-clés de l'agenda : #pasdetrajet (ou 📺 dans le titre) > conflit #maison + #direct > #maison / #direct
function modeOf(text, prev) {
  const t = String(text || '').toLowerCase(), has = k => t.includes(k);
  let m = prev || null;
  if (has('#pasdetrajet') || has('#pas-de-trajet') || String(text || '').includes('📺')) return 'pasdetrajet';
  if (m === 'pasdetrajet') return m;
  const mai = has('#maison') || m === 'maison', dir = has('#direct') || m === 'direct';
  return mai && dir ? 'conflit' : mai ? 'maison' : dir ? 'direct' : (m === 'conflit' ? m : null);
}
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
    else if (name === 'SUMMARY') { cur.title = unesc(val); cur.mode = modeOf(cur.title, cur.mode); }
    else if (name === 'LOCATION') cur.loc = unesc(val);
    else if (name === 'DESCRIPTION') cur.mode = modeOf(unesc(val), cur.mode);
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
  const COUNTRY = /^(france|belgique|belgium|suisse|switzerland|luxembourg|deutschland|allemagne|españa|espagne|italia|italie|united kingdom|royaume-uni)$/i;
  const parts = q.split(',').map(x => x.trim()).filter(x => x && !COUNTRY.test(x));
  // 1) adresse française : chaîne complète, puis sans le nom du lieu (salle, église…), en gardant le code postal
  const cands = [parts.join(', '), parts.slice(1).join(', '), parts.slice(-2).join(', ')].filter((x, k, a) => x && a.indexOf(x) === k);
  for (const c of cands) {
    try {
      const j = await getJSON('https://data.geopf.fr/geocodage/search?limit=1&q=' + encodeURIComponent(c.slice(0, 200)));
      const f = j && j.features && j.features[0];
      if (f && f.properties && f.properties.score >= 0.5) return { lat: +f.geometry.coordinates[1].toFixed(4), lon: +f.geometry.coordinates[0].toFixed(4), label: f.properties.label };
    } catch (e) { /* suivant */ }
  }
  // 2) nom de ville (après un code postal s'il y en a un), jamais un nom de pays
  const cities = [];
  parts.forEach(x => { const m = /\b\d{5}\s+(.+)$/.exec(x); if (m) cities.push(m[1]); });
  parts.slice().reverse().forEach(x => { if (!/\d/.test(x) && x.length <= 40) cities.push(x.replace(/^.*\b(?:de|d’|d')\s*/i, '').trim(), x); });
  for (const name of cities.filter((x, k, a) => x && a.indexOf(x) === k)) {
    try { const j = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=' + encodeURIComponent(name));
      const r = j && j.results && j.results[0]; if (r && r.feature_code !== 'PCLI') return { lat: r.latitude, lon: r.longitude, label: [r.name, r.admin1, r.country_code === 'FR' ? '' : r.country].filter(Boolean).join(', ') }; } catch (e) { /* suivant */ }
  }
  return null;
}
function sealWith(pass, obj) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = crypto.pbkdf2Sync(pass, salt, 600000, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', it: 600000, s: salt.toString('base64'), i: iv.toString('base64'), c: ct.toString('base64') };
}

/* ----- itinéraires (OSRM) et enchaînement des rendez-vous ----- */
const hav = (a, b) => { const R = x => x * Math.PI / 180, dLa = R(b[1] - a[1]), dLo = R(b[0] - a[0]); return 6371 * 2 * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(R(a[1])) * Math.cos(R(b[1])) * Math.sin(dLo / 2) ** 2)); };
const rc = v => Math.round(v * 100) / 100;   // domicile arrondi à ~1 km avant tout envoi à un service externe
const ROUTES = {}, CITY = {};
const cityOf = label => { const m = /\b\d{5}\s+(.+)$/.exec(String(label || '')); return m ? m[1].trim() : String(label || '').split(',')[0].trim(); };
async function cityAt(lat, lon) {   // commune traversée (nom du tronçon critique)
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (CITY[k] !== undefined) return CITY[k];
  let n = null;
  try { const j = await getJSON(`https://data.geopf.fr/geocodage/reverse?limit=1&lon=${lon}&lat=${lat}`); const f = j && j.features && j.features[0]; n = f && f.properties ? (f.properties.city || f.properties.name || null) : null; } catch (e) { n = null; }
  if (!n) {   // hors agglomération (autoroute, champs) : commune la plus proche via OpenStreetMap, 1 requête/s maximum
    await new Promise(r => setTimeout(r, 1100));
    try { const j = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=fr&lat=${lat}&lon=${lon}`); const ad = j && j.address; n = ad ? (ad.city || ad.town || ad.village || ad.municipality || null) : null; } catch (e) { n = null; }
  }
  return (CITY[k] = n);
}
async function routeLeg(a, b) {
  const key = [a.lat, a.lon, b.lat, b.lon].join(',');
  if (ROUTES[key]) return ROUTES[key];
  let res = null;
  try {
    // géométrie complète + durée de chaque tronçon : les points météo sont placés selon le TEMPS de parcours
    const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&annotations=duration`);
    const r = j && j.routes && j.routes[0];
    if (r && r.geometry && r.geometry.coordinates.length > 1) {
      const co = r.geometry.coordinates, dur = (r.legs && r.legs[0] && r.legs[0].annotation && r.legs[0].annotation.duration) || null;
      const cumD = [0], cumT = [0];
      for (let i = 1; i < co.length; i++) { cumD.push(cumD[i - 1] + hav(co[i - 1], co[i])); cumT.push(cumT[i - 1] + (dur && dur[i - 1] != null ? dur[i - 1] : 0)); }
      const totT = cumT[cumT.length - 1], totD = cumD[cumD.length - 1] || 1, byTime = totT > 0;
      const pts = [];
      for (const f of [0.25, 0.5, 0.75]) {
        let i = (byTime ? cumT : cumD).findIndex(c => c >= f * (byTime ? totT : totD)); if (i < 0) i = co.length - 1;
        pts.push({ f, lat: +co[i][1].toFixed(3), lon: +co[i][0].toFixed(3), km: Math.round(cumD[i] * 10) / 10, name: await cityAt(co[i][1], co[i][0]) });
      }
      // tracé simplifié pour la mini-carte de l'app (~80 points, ~100 m de précision) : stocké uniquement dans calendar.sealed.json (chiffré)
      const g = [], step = totD / 80; let nxt = 0;
      for (let i = 0; i < co.length; i++) if (cumD[i] >= nxt || i === co.length - 1) { g.push([+co[i][1].toFixed(3), +co[i][0].toFixed(3)]); nxt = cumD[i] + step; }
      res = { km: Math.round(r.distance / 100) / 10, min: Math.max(1, Math.round(r.duration / 60)), pts, routed: true, byTime, g };
    }
  } catch (e) { /* routeur indisponible : estimation */ }
  if (!res) {
    const km0 = E.distKm(a, b), km = Math.round(km0 * 13) / 10;
    res = { km, min: Math.round(km / (km0 < 25 ? 55 : km0 < 60 ? 70 : 90) * 60), pts: [0.25, 0.5, 0.75].map(f => ({ f, lat: +(a.lat + (b.lat - a.lat) * f).toFixed(3), lon: +(a.lon + (b.lon - a.lon) * f).toFixed(3), km: Math.round(km * f * 10) / 10, name: null })), routed: false, byTime: false };
  }
  return (ROUTES[key] = res);
}
const shift = (ts, m) => new Date(Date.parse(ts + ':00Z') + m * 60000).toISOString().slice(0, 16);
// aller (depuis le domicile ou le rendez-vous précédent s'il finit moins de 3 h avant) et retour (après le dernier rendez-vous enchaîné)
async function planLegs(events, home) {
  const H = { lat: rc(home.lat), lon: rc(home.lon), label: 'Domicile', home: true };
  const P = e => ({ lat: e.lat, lon: e.lon, label: e.label || e.loc, city: cityOf(e.label || e.loc) });
  const keyOf = e => e.s + '|' + (e.t || '');
  const mkGo = async (from, e, fromKind, arrive) => { const r = await routeLeg(from, e), need = Math.round(r.min * 1.1) + 10;
    return { k: 'go', from: { lat: from.lat, lon: from.lon, label: from.label, city: from.city || from.label }, to: P(e), fromKind, km: r.km, min: Math.round(r.min * 1.1), dep: shift(arrive, -need), arr: shift(arrive, -10), pts: r.pts, g: r.g, routed: r.routed, byTime: r.byTime }; };
  const mkRet = async (e, leave, assumed) => { const r = await routeLeg(e, H);
    return { k: 'ret', from: P(e), to: { lat: H.lat, lon: H.lon, label: H.label, city: H.label }, fromKind: 'event', km: r.km, min: Math.round(r.min * 1.1), dep: leave, arr: shift(leave, Math.round(r.min * 1.1)), pts: r.pts, g: r.g, routed: r.routed, byTime: r.byTime, assumed: !!assumed }; };
  const days = {};
  events.filter(e => e.lat != null && e.mode !== 'pasdetrajet').forEach(e => (days[e.s.slice(0, 10)] = days[e.s.slice(0, 10)] || []).push(e));
  for (const d of Object.keys(days).sort()) {
    const list = days[d].sort((a, b) => a.s < b.s ? -1 : 1);
    let prev = null;
    for (const e of list) {
      e.legs = [];
      const near = E.distKm(home, e) < 3;
      if (e.allDay) { if (!near) { e.legs.push(await mkGo(H, e, 'home', d + 'T09:00')); e.legs.push(await mkRet(e, d + 'T18:00', true)); } continue; }
      if (near) { if (prev && !prev.near) prev.ev.legs.push(await mkRet(prev.ev, shift(prev.ev.e, 10))); prev = { ev: e, near: true }; continue; }
      const gap = prev && !prev.near ? (Date.parse(e.s + ':00Z') - Date.parse(prev.ev.e + ':00Z')) / 60000 : null;
      // mots-clés : #direct enchaîne quel que soit l'écart, #maison force le retour ; en cas de conflit, règle par défaut
      const chain = gap != null && gap >= 0 && (e.mode === 'direct' ? true : e.mode === 'maison' ? false : gap <= 180);
      if (chain && E.distKm(prev.ev, e) >= 1) { const g = await mkGo(P(prev.ev), e, 'prev', e.s); if (e.mode === 'direct') g.byKey = true; e.legs.push(g); }
      else if (chain) { /* même lieu : pas de trajet */ }
      else if (e.mode === 'maison' && prev && !prev.near) { const r = await mkRet(prev.ev, shift(prev.ev.e, 10)); r.byKey = true; prev.ev.legs.push(r); const g = await mkGo(H, e, 'home', e.s); g.byKey = true; e.legs.push(g); }
      else {
        if (prev && !prev.near && gap != null && gap > 180 && !e.mode) {
          // écart de plus de 3 h : retour maison par défaut, avec l'option « enchaîner directement » préparée
          const ret = await mkRet(prev.ev, shift(prev.ev.e, 10)), go = await mkGo(H, e, 'home', e.s), direct = await mkGo(P(prev.ev), e, 'prev', e.s);
          ret.brk = go.brk = keyOf(e); prev.ev.legs.push(ret); e.legs.push(go);
          e.alt = { key: keyOf(e), direct, fromLabel: prev.ev.label || prev.ev.loc, viaHome: { km: Math.round((ret.km + go.km) * 10) / 10, min: ret.min + go.min } };
        } else { if (prev && !prev.near) prev.ev.legs.push(await mkRet(prev.ev, shift(prev.ev.e, 10))); e.legs.push(await mkGo(H, e, 'home', e.s)); }
      }
      prev = { ev: e, near: false };
    }
    if (prev && !prev.near) prev.ev.legs.push(await mkRet(prev.ev, shift(prev.ev.e, 10)));
  }
}
async function calendarSync(out) {
  const url = (process.env.GCAL_ICS || '').trim().replace(/^["'<«\s]+|["'>»\s]+$/g, '').replace(/^webcal:\/\//i, 'https://'), pass = (process.env.APP_KEY || '').trim().replace(/^["'«\s]+|["'»\s]+$/g, '').toLowerCase();   // APP_KEY seule : jamais RC_KEY
  out.relay.cal = !url ? 'absent' : !pass ? 'sans clé' : 'ok';
  if (url && !pass) console.log('Secret APP_KEY absent : agenda non synchronisé');
  if (url) { let h = 'invalide'; try { const U = new URL(url); h = U.hostname + ' · ' + (/\/private-[0-9a-f]+\//.test(U.pathname) ? 'adresse secrète' : /\/public\//.test(U.pathname) ? 'adresse publique' : /\.ics$/.test(U.pathname) ? 'fichier ics' : 'pas un lien ics') + ' · ' + url.length + ' car.'; } catch (e) { h = 'pas une adresse web'; } out.relay.calUrlDiag = h; }  // diagnostic sans la partie secrète, publié seulement en cas d'erreur
  if (!url || !pass) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('agenda ' + r.status);
    const from = toParis(new Date()), to = toParis(new Date(Date.now() + 8 * 864e5));
    const occ = expand(parseIcs(await r.text()), from.slice(0, 10) + 'T00:00', to).slice(0, 25);
    const geo = {}, events = [];
    for (const e of occ) {
      const loc = typeof e.loc === 'string' ? e.loc.trim() : '';
      // Garder les rendez-vous sans lieu pour le plan du jour, sans météo ni trajet inventés.
      const g = e.mode === 'pasdetrajet' || loc.length <= 2 ? null : geo[loc] !== undefined ? geo[loc] : (geo[loc] = await geocodeLoc(loc));
      events.push({ t: e.title || 'Rendez-vous', s: e.s, e: e.e, allDay: !!e.start.allDay, loc, lat: g ? g.lat : null, lon: g ? g.lon : null, label: g ? g.label : null, mode: e.mode || null });
    }
    out.relay.calSkip = events.filter(x => x.mode === 'pasdetrajet').length;
    out.relay.calN = events.length; out.relay.calGeo = events.filter(x => x.lat != null).length;
    if (cfg) { try { await planLegs(events, (cfg.origins && cfg.origins[0]) || cfg.home); out.relay.calLegs = events.reduce((n, e) => n + (e.legs || []).length, 0); out.relay.calRouted = events.reduce((n, e) => n + (e.legs || []).filter(l => l.routed).length, 0); } catch (e) { out.relay.calLegErr = String(e.message || e).slice(0, 80); } }
    delete out.relay.calUrlDiag;
    fs.writeFileSync(path.join(dir, 'calendar.sealed.json'), JSON.stringify(sealWith(pass, { v: 2, updated: new Date().toISOString(), events })));
    return events;
  } catch (e) { out.relay.calErr = String(e.message || e).replace(/https?:\S+/g, 'url').slice(0, 120); out.relay.calUrl = out.relay.calUrlDiag; delete out.relay.calUrlDiag; return null; }
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
  // jours sans trajet domicile-travail (télétravail, repos) : pas de notification du matin ; l'agenda, lui, reste actif 7 j/7
  const commute = !!cfg && E.isCommuteDay(today, cfg.days);
  const depMin = cfg ? E.toMin(cfg.dep) : 390, inWin = commute && hm >= depMin - 90 && hm <= depMin - 5;
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
  // 3) agenda : synchronisation chiffrée + alerte par trajet (aller et retour, météo le long de la route), sans nom de lieu
  const evs = await calendarSync(out);
  if (cfg && evs && evs.length) {
    try {
      const API = 'https://api.open-meteo.com/v1/forecast', Q = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,shortwave_radiation';
      const cars = cfg.cars.filter(E.hasTires), notified = prev.calNotified || {};
      out.calNotified = Object.fromEntries(Object.entries(notified).filter(([k]) => k.slice(0, 10) >= now.slice(0, 10)));
      const legs = []; evs.forEach(ev => (ev.legs || []).forEach(l => legs.push(l)));
      for (const leg of legs) {
        const hrs = (Date.parse(leg.dep + ':00Z') - Date.parse(now + ':00Z')) / 36e5; if (hrs < 0 || hrs > 14) continue;
        const pts = E.legPoints(leg);
        let js = await getJSON(`${API}?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}&hourly=${Q}&timezone=Europe%2FParis&past_days=1&forecast_days=3`);
        if (!Array.isArray(js)) js = [js];
        const models = js.map((p, k) => { try { return E.makeModel(p, 'relay', pts[k]); } catch (e) { return null; } });
        const seq = E.legSeq(models, pts, leg.dep, leg.min); if (!seq.length) continue;
        const res = cars.map(c => ({ c, w: E.windowAssess(c, seq, 'trip') })).filter(r => r.w), worst = res.reduce((m, r) => Math.max(m, r.w.level), 0), sum = E.summarize(seq);
        const key = leg.dep + '|' + leg.k, fog = sum.visMin != null && sum.visMin < 500, ice = sum.iceLevel || 0;
        if ((worst >= 2 || fog || ice >= 1) && (notified[key] == null || worst > notified[key])) {
          const cr = E.legCritical(seq, cars);
          const title = `📅 ${E.LV[worst].emoji} ${E.LV[worst].name} · ${leg.k === 'ret' ? 'retour' : 'trajet'} agenda, départ ${leg.dep.slice(11, 16)}`;
          const lines = [`${Math.round(leg.km)} km · ~${leg.min} min${leg.routed ? '' : ' (estimé)'}`, ...res.map(r => `${r.c.short} : ${E.LV[r.w.level].name} ${r.w.score}/100`),
            `Min ${E.f1(sum.Tmin)} °C · chaussée est. ${E.f1(sum.TrMin)} °C · verglas ${E.ICE_LV[ice].toLowerCase()}${fog ? ' · brouillard ' + E.f0(sum.visMin) + ' m' : ''}`];
          if (cr && cr.q.f > 0 && cr.q.f < 1) lines.push(`Point le plus délicat : km ${Math.round(cr.q.f * leg.km)} vers ${cr.q.t.slice(11, 16)}`);
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
