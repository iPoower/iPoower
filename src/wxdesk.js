/* Poste météo de l'onglet Météo : moteur pur (aucun réseau, stockage ni horloge : mêmes entrées, même résultat).
   Il répond à « quoi, quand, où, quel impact pour moi » à partir des heures déjà calculées par le moteur (air, pluie,
   visibilité, rafales, chaussée estimée Tr, risque de verglas) et des trajets déjà connus de Race Control.
   Météo = environnement : aucun verdict pneumatique ici (l'onglet Pneus garde l'adhérence, la gomme et la saison).

   Seuils, alignés sur ceux déjà utilisés par l'app (bandeau brouillard, prochain risque, briefing, rafales) :
     pluie      : ≥ 0,2 mm/h (ou probabilité ≥ 60 % avec ≥ 0,1 mm/h) 🟡 · ≥ 2 mm/h ou orage 🟠
     pluie possible (signal sans quantité significative, même règle que la Tenue) : probabilité ≥ 50 %, 0,1 mm/h,
                  code bruine/pluie/averses, ou modèle de base ≥ 0,2 mm/h quand AROME calcule moins. Jamais « pas de pluie » :
                  🟡 si probabilité ≥ 60 % (seuil de la pénalité du score route), sinon 🟢 ; la source de chaque valeur est citée.
     neige      : chute de neige > 0,05 cm/h ou code neige 🟠
     brouillard : visibilité < 1 000 m 🟡 · < 500 m 🟠 · < 200 m 🔴 (code brouillard sans visibilité : 🟡)
     vent       : rafales ≥ 55 km/h 🟡 · ≥ 70 km/h 🟠 · ≥ 90 km/h 🔴
     gel        : chaussée estimée − 2 °C < 0 🟡 · + 2 °C < 0 🟠 · verglas MODÉRÉ 🟠 · ÉLEVÉ ou plus, pluie verglaçante 🔴
     température: air ≥ 35 °C ou ressenti ≤ −10 °C 🟡
     soleil     : soleil bas dans l'axe d'un trajet (calcul géométrique fourni par l'app) 🟡
   Conditions route : 100 − pénalités listées une à une (voir ROAD_PEN) ; le niveau affiché n'est jamais plus doux
   que le pire facteur. Aucune note opaque : chaque point retiré est expliqué. */
function wxDesk(input) {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const n = v => finite(v) ? v : null;
  const mins = ts => typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts) ? Date.parse(ts.slice(0, 16) + ':00Z') / 60000 : NaN;
  const hm = ts => String(ts || '').slice(11, 16);
  const atMin = m => new Date(m * 60000).toISOString().slice(0, 16);
  const r0 = v => v == null ? '—' : String(Math.round(v)).replace('-', '−');
  const r1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace('-', '−');
  const EMO = ['🟢', '🟡', '🟠', '🔴'];
  const ORDER = ['ice', 'snow', 'fog', 'rain', 'wind', 'temp', 'sun'];
  const SNOW = new Set([71, 73, 75, 77, 85, 86]), FZ = new Set([56, 57, 66, 67]), FOG = new Set([45, 48]), RAINY = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
  const now = input && input.now, nowM = mins(now);
  const all = ((input && input.hours) || []).filter(x => x && Number.isFinite(mins(x.t))).slice().sort((a, b) => mins(a.t) - mins(b.t));
  if (!Number.isFinite(nowM) || !all.length) return null;
  const hour0 = Math.floor(nowM / 60) * 60;
  const known = all.filter(x => mins(x.t) >= hour0);
  if (!known.length || mins(known[0].t) > hour0 + 60) return null;   // pas de prévision pour l'heure en cours : rien d'inventé
  const tripsIn = ((input && input.trips) || []).filter(t => t && Number.isFinite(mins(t.dep)) && mins(t.arr || t.dep) >= nowM - 1 && mins(t.dep) <= nowM + 24 * 60)
    .slice().sort((a, b) => mins(a.dep) - mins(b.dep));
  // fenêtre : 12 h, prolongée jusqu'à l'arrivée du dernier trajet des 24 h à venir
  const want = Math.max(nowM + 12 * 60, ...tripsIn.map(t => mins(t.arr || t.dep)));
  const hours = known.filter(x => mins(x.t) <= Math.min(want, hour0 + 24 * 60));
  const lastM = mins(hours[hours.length - 1].t), endM = lastM + 60, endTs = atMin(endM);

  /* ---------- niveau de chaque phénomène pour une heure ---------- */
  function haz(x) {
    const Pl = n(x.Pl) ?? n(x.P) ?? 0, P = n(x.P) ?? 0, pp = n(x.pp), vis = n(x.vis), gust = n(x.gust), Tr = n(x.Tr), code = n(x.code);
    const iceLv = x.ice && finite(x.ice.level) ? x.ice.level : 0, snowy = (n(x.snow) || 0) > 0.05 || SNOW.has(code);
    const storm = code != null && code >= 95;
    const wet = Pl >= 0.2 || (pp != null && pp >= 60 && P >= 0.1);
    const o = { rain: 0, snow: 0, fog: 0, wind: 0, ice: 0, temp: 0 };
    if (!snowy) o.rain = storm || Pl >= 2 ? 2 : wet ? 1 : 0;
    if (snowy) o.snow = 2;
    o.fog = vis != null ? (vis < 200 ? 3 : vis < 500 ? 2 : vis < 1000 ? 1 : 0) : FOG.has(code) ? 1 : 0;
    o.wind = gust == null ? 0 : gust >= 90 ? 3 : gust >= 70 ? 2 : gust >= 55 ? 1 : 0;
    const frost = Tr == null ? 0 : Tr + 2 < 0 ? 2 : Tr - 2 < 0 ? 1 : 0;
    o.ice = Math.max(FZ.has(code) ? 3 : iceLv >= 2 ? 3 : iceLv === 1 ? 2 : 0, frost);
    const T = n(x.T), Ta = n(x.Tapp);
    o.temp = (T != null && T >= 35) || (Ta != null && Ta <= -10) ? 1 : 0;
    return o;
  }
  // signal de pluie sans quantité significative : probabilité, faible quantité, code pluvieux ou désaccord de modèles
  function maybeRain(x, h) {
    if (h.rain || h.snow) return false;
    const Pl = n(x.Pl) ?? n(x.P) ?? 0, pp = n(x.pp), Pb = n(x.Pb);
    return (pp != null && pp >= 50) || Pl >= 0.1 || RAINY.has(n(x.code)) || (Pb != null && Pb >= 0.2);
  }
  const H = hours.map(x => ({ x, t: x.t, m: mins(x.t), h: haz(x) }));
  H.forEach(r => { r.lv = Math.max(...Object.values(r.h)); r.maybe = maybeRain(r.x, r.h); });
  const at = m => { let best = null; H.forEach(r => { if (r.m <= m && (!best || r.m > best.m)) best = r; }); return best; };
  const nowRow = at(nowM) || H[0];

  /* ---------- épisodes : début, fin, pic ---------- */
  const spans = [];
  for (const id of ['rain', 'snow', 'fog', 'wind', 'ice', 'temp']) {
    let cur = null;
    H.forEach(r => {
      const lv = r.h[id];
      if (lv > 0) {
        if (!cur) { cur = { id, start: r.m, end: r.m + 60, lv, peakRow: r, rows: [] }; spans.push(cur); }
        cur.end = r.m + 60; cur.rows.push(r);
        if (lv > cur.lv || (lv === cur.lv && worse(id, r.x, cur.peakRow.x))) { cur.lv = lv; cur.peakRow = r; }
      } else cur = null;
    });
  }
  function worse(id, a, b) {
    if (id === 'rain' || id === 'snow') return (n(a.Pl) ?? n(a.P) ?? 0) + (n(a.snow) || 0) > (n(b.Pl) ?? n(b.P) ?? 0) + (n(b.snow) || 0);
    if (id === 'fog') return (n(a.vis) ?? 1e9) < (n(b.vis) ?? 1e9);
    if (id === 'wind') return (n(a.gust) ?? 0) > (n(b.gust) ?? 0);
    if (id === 'ice') return (n(a.Tr) ?? 99) < (n(b.Tr) ?? 99);
    return false;
  }
  // la pluie au quart d'heure (2 h) précise le début ou la fin de la pluie quand elle est disponible
  const nc = input && input.nowcast;
  const rainFirst = spans.find(s => s.id === 'rain');
  if (nc && rainFirst) {
    if (!nc.nowWet && finite(nc.startIn) && rainFirst.start > nowM && rainFirst.start - nowM <= 180) rainFirst.start = Math.max(nowM, Math.round((nowM + nc.startIn) / 5) * 5), rainFirst.precise = true;
    else if (nc.nowWet && rainFirst.start <= nowM && typeof nc.stopAt === 'string') { const s = mins(now.slice(0, 11) + nc.stopAt); if (Number.isFinite(s) && s > nowM && s < rainFirst.end) rainFirst.end = s, rainFirst.precise = true; }
  }
  spans.sort((a, b) => a.start - b.start || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const active = s => s.start <= nowM && s.end > nowM;

  /* ---------- trajets : points datés (départ, passages, arrivée) ---------- */
  const tripList = tripsIn.map(t => {
    const pts = (t.points || []).filter(p => p && p.x && Number.isFinite(mins(p.t || p.x.t))).map(p => ({ ...p, t: p.t || p.x.t, m: mins(p.t || p.x.t), h: haz(p.x) }));
    pts.forEach(p => { p.lv = Math.max(...Object.values(p.h)); p.maybe = maybeRain(p.x, p.h); });
    const glare = t.glare && Number.isFinite(mins(t.glare.ts)) ? { ts: t.glare.ts } : null;
    return { ...t, pts: t.pending ? [] : pts, glare: t.pending ? null : glare, depM: mins(t.dep), arrM: mins(t.arr || t.dep) };
  });
  const tripsOf = s => tripList.filter(t => !t.pending && t.depM < s.end && t.arrM >= s.start);
  const glareTrips = tripList.filter(t => t.glare);
  if (glareTrips.length) spans.push(...glareTrips.map(t => ({ id: 'sun', start: mins(t.glare.ts), end: mins(t.glare.ts) + 30, lv: 1, trip: t })));
  spans.sort((a, b) => a.start - b.start || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

  /* ---------- textes ---------- */
  const rainTxt = x => { const P = n(x.Pl) ?? n(x.P) ?? 0, code = n(x.code); return code != null && code >= 95 ? 'orage' : P >= 7.6 ? 'pluie forte' : P >= 2 ? 'pluie modérée' : 'pluie faible'; };
  const visTxt = v => v == null ? '—' : v >= 10000 ? '> 10 km' : v >= 1000 ? r0(v / 1000) + ' km' : r0(Math.round(v / 10) * 10) + ' m';
  const sky = code => code == null ? null : code <= 1 ? 'ciel dégagé' : code === 2 ? 'éclaircies' : code === 3 ? 'couvert' : FOG.has(code) ? 'brouillard' : code <= 57 ? 'bruine' : code <= 67 ? 'pluie' : code <= 77 ? 'neige' : code <= 82 ? 'averses' : code <= 86 ? 'averses de neige' : 'orage';
  const NAME = { rain: 'pluie', snow: 'neige', fog: 'brouillard', wind: 'rafales', ice: 'verglas', temp: 'température', sun: 'soleil rasant' };
  // gel : 🟡 chaussée proche de 0 °C (marge faible) · 🟠 gel de surface probable ou verglas modéré · 🔴 verglas possible
  const ICE_TXT = ['', 'chaussée proche du gel', 'gel de surface probable', 'verglas possible'];
  function condTxt(x) {   // conditions d'un point : le phénomène le plus marquant, sinon le ciel
    const h = haz(x), top = ORDER.filter(id => h[id] > 0).sort((a, b) => h[b] - h[a])[0];
    if (top === 'ice') return n(x.Tr) != null ? `chaussée ${r1(x.Tr)} °C (gel possible)` : 'gel possible';
    if (top === 'snow') return 'neige';
    if (top === 'fog') return `brouillard (${visTxt(n(x.vis))})`;
    if (top === 'rain') return rainTxt(x);
    if (top === 'wind') return `rafales ${r0(x.gust)} km/h`;
    if (maybeRain(x, h)) return `pluie possible${n(x.pp) != null && x.pp >= 50 ? ' · ' + r0(x.pp) + ' %' : ''}`;
    return sky(n(x.code)) || 'sec';
  }
  const where = s => {
    const ts = tripsOf(s); if (!ts.length) return '';
    const t = ts[0];
    return `${t.label || 'trajet'} de ${hm(t.dep)}${ts.length > 1 ? ' et ' + (ts.length - 1) + ' autre' + (ts.length > 2 ? 's' : '') : ''}`;
  };

  // Pluie possible sur des heures/points : niveau, moment, et explication sourcée (aucune certitude dans un sens ou l'autre).
  const tripRows = t => t.pending ? [] : t.pts.length ? t.pts : H.filter(r => r.m + 60 > t.depM && r.m <= t.arrM);
  function maybeOf(rows) {
    if (rows.some(r => r.h.rain || r.h.snow)) return null;
    const R = rows.filter(r => r.maybe); if (!R.length) return null;
    const top = k => R.reduce((b, r) => n(r.x[k]) != null && (b == null || r.x[k] > b) ? r.x[k] : b, null);
    const pp = top('pp'), Pb = top('Pb'), Pl = Math.max(...R.map(r => n(r.x.Pl) ?? n(r.x.P) ?? 0)), ar = R.some(r => r.x.ar);
    const code = R.map(r => n(r.x.code)).find(c => RAINY.has(c)) ?? null;
    const qty = `quantité ${Pl < 0.1 ? 'négligeable' : 'faible'}${ar ? ' selon AROME' : ''} (${r1(Pl)} mm/h)`;
    const sig = [pp != null && pp >= 50 ? `probabilité ${r0(pp)} %${ar ? ' (modèle de base)' : ''}` : null, code != null ? `code météo « ${sky(code)} »` : null,
      Pb != null && Pb >= 0.2 && Pl < 0.2 ? `modèle de base ${r1(Pb)} mm/h` : null].filter(Boolean);
    const explain = [cap(qty) + (sig.length ? ' ; pluie possible selon ' + sig.join(', ') : ''),
      ar && sig.some(x => /base/.test(x)) ? 'Modèles en désaccord : ce n’est ni une pluie certaine ni un temps sec garanti' : null,
      code != null && Pl < 0.1 ? 'Code pluvieux avec quantité arrondie à 0 : averse brève ou locale possible' : null].filter(Boolean);
    return { lv: pp != null && pp >= 60 ? 1 : 0, m: R[0].m, t: R[0].t, pp, Pl, Pb, ar, code, text: [sig.join(', '), qty].filter(Boolean).join(' · '), explain };
  }
  const mbH = maybeOf(H.filter(r => r.m + 60 > nowM)), whenM = mb => mb.m <= nowM ? 'maintenant' : 'vers ' + hm(mb.t);

  /* ---------- changements significatifs ---------- */
  const changes = [];
  spans.forEach(s => {
    if (s.id === 'sun') { changes.push({ m: s.start, id: 'sun', lv: 1, text: 'soleil rasant' }); return; }
    const pk = s.peakRow.x;
    const txt = { rain: rainTxt(pk), snow: 'neige', fog: `brouillard · ${visTxt(n(pk.vis))}`, wind: `rafales ${r0(pk.gust)} km/h`, ice: ICE_TXT[s.lv], temp: n(pk.T) >= 35 ? 'forte chaleur' : 'froid intense' }[s.id];
    if (s.start > nowM) changes.push({ m: s.start, id: s.id, lv: s.lv, text: txt });
    if (s.end < endM) changes.push({ m: s.end, id: s.id, lv: 0, text: { rain: 'fin de la pluie', snow: 'fin de la neige', fog: 'dissipation du brouillard', wind: 'vent en baisse', ice: 'fin du risque de gel', temp: 'température plus douce' }[s.id], end: true });
  });
  // amélioration générale : première heure sans aucun phénomène après une période agitée
  for (let i = 1; i < H.length; i++) if (H[i].m > nowM && H[i - 1].lv > 0 && H[i].lv === 0 && H.slice(i).every(r => r.lv === 0)) { changes.push({ m: H[i].m, id: 'better', lv: 0, text: 'amélioration' }); break; }
  // passage de l'air sous 0 °C (ou au-dessus)
  for (let i = 1; i < H.length; i++) {
    const a = n(H[i - 1].x.T), b = n(H[i].x.T);
    if (a != null && b != null && H[i].m > nowM && (a > 0) !== (b > 0)) { changes.push({ m: H[i].m, id: 'zero', lv: b <= 0 ? 1 : 0, text: b <= 0 ? 'air sous 0 °C' : 'air au-dessus de 0 °C' }); break; }
  }
  changes.sort((a, b) => a.m - b.m || b.lv - a.lv);
  const nextChange = changes.find(c => c.m > nowM) || null;

  /* ---------- verdict (Weather Hero) ---------- */
  const real = spans.filter(s => s.lv > 0);
  const dominant = real.slice().sort((a, b) => b.lv - a.lv || (active(b) - active(a)) || a.start - b.start || ORDER.indexOf(a.id) - ORDER.indexOf(b.id))[0] || null;
  const level = dominant ? dominant.lv : 0;
  const cur = (input && input.cur) || {};
  const T = n(cur.T) ?? n(nowRow.x.T), Tapp = n(cur.Tapp) ?? n(nowRow.x.Tapp);
  const currentSource = n(cur.T) != null || n(cur.Tapp) != null ? 'current' : 'hourly';
  const tempLine = `${T == null ? '—' : r0(T)} °C · ressenti ${Tapp == null ? '—' : r0(Tapp)} °C`;
  let title, lines = [];
  const inMin = m => { const d = Math.max(0, Math.round(m - nowM)); return d < 60 ? `dans ${d} min` : `dans ${Math.floor(d / 60)} h${d % 60 ? ' ' + String(d % 60).padStart(2, '0') : ''}`; };
  if (!dominant) {
    title = 'CONDITIONS NORMALES';
    lines.push(tempLine, mbH ? `Pluie possible ${whenM(mbH)} · peu d’eau prévue (${r1(mbH.Pl)} mm/h)` : `Aucun phénomène notable jusqu’à ${hm(endTs)}`);
  } else {
    const s = dominant, now_ = active(s), pk = s.peakRow ? s.peakRow.x : null, span = `${hm(atMin(s.start))}–${hm(atMin(s.end))}`;
    if (s.id === 'ice') {
      title = s.lv >= 3 ? 'RISQUE DE VERGLAS' : s.lv === 2 ? 'GEL DE SURFACE PROBABLE' : 'CHAUSSÉE PROCHE DU GEL';
      lines.push(`Fenêtre critique ${now_ ? 'maintenant' : hm(atMin(s.start))}–${hm(atMin(s.end))}`, `Chaussée estimée ${r1(pk.Tr)} °C ± 2`, tempLine);
    } else if (s.id === 'sun') {
      title = 'SOLEIL RASANT'; lines.push(`Vers ${hm(atMin(s.start))} pendant le ${s.trip.label || 'trajet'}`, tempLine);
    } else {
      const label = { rain: rainTxt(pk).toUpperCase(), snow: 'NEIGE', fog: 'BROUILLARD', wind: 'RAFALES', temp: n(pk.T) >= 35 ? 'FORTE CHALEUR' : 'FROID INTENSE' }[s.id];
      title = now_ ? `${label} EN COURS` : `${label} À PARTIR DE ${hm(atMin(s.start))}`;
      if (now_) lines.push(s.end < endM ? `Fin probable vers ${hm(atMin(s.end))}` : `Jusqu’à au moins ${hm(endTs)}`);
      else lines.push(`Début estimé ${inMin(s.start)}${s.precise ? '' : ' (prévision horaire)'}`);
      if (s.id === 'fog') lines.push(`Visibilité minimale ${visTxt(n(pk.vis))} · ${span}`);
      if (s.id === 'wind') lines.push(`Rafales jusqu’à ${r0(pk.gust)} km/h`);
      lines.push(tempLine);
    }
    const w = s.id === 'sun' ? '' : where(s);
    if (w) lines.splice(1, 0, `${w[0].toUpperCase() + w.slice(1)} potentiellement concerné${tripsOf(s).length > 1 ? 's' : ''}`);
  }
  if (nextChange && !(dominant && nextChange.m === dominant.start && nextChange.id === dominant.id)) lines.push(`Prochain changement : ${hm(atMin(nextChange.m))} · ${nextChange.text}`);
  const ageMin = input && finite(input.ageMin) ? input.ageMin : null, stale = ageMin != null && ageMin > 180;
  const hero = { level, emoji: EMO[level], title, lines: lines.slice(0, 4), dominant: dominant ? dominant.id : null, stale };

  /* ---------- timeline : moments clés (météo + trajets) et bande horaire ---------- */
  const moments = [];
  real.filter(active).forEach(s => moments.push({ m: nowM, kind: 'wx', id: s.id, lv: s.lv, text: s.id === 'ice' ? ICE_TXT[s.lv] : `${NAME[s.id]} en cours`, now: true }));
  changes.forEach(c => moments.push({ m: c.m, kind: 'wx', id: c.id, lv: c.lv, text: c.text }));
  tripList.forEach(t => {
    if (t.pending) return; // L'ancien départ n'est qu'une ancre de tri, jamais un conseil/timeline.
    const lv = t.pts.reduce((a, p) => Math.max(a, p.lv), 0);
    moments.push({ m: t.depM, kind: 'dep', lv, text: `départ · ${t.label || 'trajet'}`, trip: t.id });
    if (t.arrM > t.depM) moments.push({ m: t.arrM, kind: 'arr', lv, text: `arrivée${t.to ? ' · ' + t.to : ''}`, trip: t.id });
  });
  const tl = moments.filter(x => x.m >= nowM - 1 && x.m <= endM).sort((a, b) => a.m - b.m || (a.kind === 'wx') - (b.kind === 'wx'))
    .slice(0, 12).map(x => ({ t: x.now ? 'maintenant' : hm(atMin(x.m)), ts: atMin(x.m), kind: x.kind, id: x.id || null, lv: x.lv, text: x.text, trip: x.trip || null }));
  const strip = H.map(r => {
    const x = r.x, trip = tripList.find(t => !t.pending && r.m + 60 > t.depM && r.m <= t.arrM);
    const ic = r.h.ice >= 2 ? 'ice' : r.h.snow ? 'snow' : r.h.fog ? 'fog' : r.h.rain ? 'rain' : r.h.wind ? 'wind' : null;
    return { t: r.t, hh: hm(r.t), T: n(x.T), P: n(x.Pl) ?? n(x.P), pp: n(x.pp), gust: n(x.gust), vis: n(x.vis), lv: r.lv, ic, code: n(x.code), trip: trip ? trip.id : null, now: r === nowRow };
  });

  /* ---------- phénomènes ---------- */
  const first = id => real.find(s => s.id === id) || null;
  const vals = (k) => H.map(r => n(r.x[k])).filter(v => v != null);
  const maxOf = k => { const v = vals(k); return v.length ? Math.max(...v) : null; }, minOf = k => { const v = vals(k); return v.length ? Math.min(...v) : null; };
  const rowMax = (k, sign = 1) => H.reduce((b, r) => n(r.x[k]) == null ? b : !b || sign * r.x[k] > sign * b.x[k] ? r : b, null);
  const phen = [];
  { const s = first('rain') || first('snow'), Psum = H.reduce((a, r) => a + (n(r.x.Pl) ?? n(r.x.P) ?? 0), 0), ppM = maxOf('pp');
    const mb = !s ? mbH : null;
    const line = mb ? `Possible ${whenM(mb)} · peu d’eau prévue` : !s ? `Aucune avant ${hm(endTs)}` : active(s) ? `${s.id === 'snow' ? 'Neige' : cap(rainTxt(s.peakRow.x))} en cours${s.end < endM ? ' · fin vers ' + hm(atMin(s.end)) : ' · au moins jusqu’à ' + hm(endTs)}` : `${s.id === 'snow' ? 'Neige' : cap(rainTxt(s.peakRow.x))} à partir de ${hm(atMin(s.start))}`;
    phen.push({ id: 'rain', icon: s && s.id === 'snow' ? '🌨' : '🌧', title: s && s.id === 'snow' ? 'Neige' : 'Pluie', lv: s ? s.lv : mb ? mb.lv : 0, line,
      detail: [`Cumul ${r1(Psum)} mm jusqu’à ${hm(endTs)}`, ppM != null ? `Probabilité maximale ${r0(ppM)} %` : null, ...(mb ? mb.explain : []), s ? `Intensité maximale ${r1(n(s.peakRow.x.Pl) ?? n(s.peakRow.x.P))} mm/h vers ${hm(s.peakRow.t)}` : null,
        nc ? (nc.nowWet ? `Au quart d’heure : ${nc.snow ? 'neige' : 'pluie'} en cours${nc.stopAt ? ', fin vers ' + nc.stopAt : ''}` : finite(nc.startIn) ? `Au quart d’heure : début dans ${nc.startIn} min` : 'Au quart d’heure : rien d’ici 2 h') : null].filter(Boolean) }); }
  { const s = first('fog'), vmin = rowMax('vis', -1);
    phen.push({ id: 'fog', icon: '🌫', title: 'Brouillard · visibilité', lv: s ? s.lv : 0,
      line: s ? `${EMO[s.lv]} Visibilité ${visTxt(n(s.peakRow.x.vis))} · ${active(s) ? 'maintenant' : 'vers ' + hm(s.peakRow.t)}` : vmin ? `Visibilité ${visTxt(n(vmin.x.vis))} au plus bas` : 'Visibilité non fournie',
      detail: [s ? `Épisode ${active(s) ? 'en cours' : 'de ' + hm(atMin(s.start))} jusqu’à ${hm(atMin(s.end))}` : null, vmin ? `Minimum ${visTxt(n(vmin.x.vis))} vers ${hm(vmin.t)}` : null, 'Visibilité : modèle de base (pas une mesure)'].filter(Boolean) }); }
  { const s = first('wind'), g = rowMax('gust'), w = maxOf('wind');
    phen.push({ id: 'wind', icon: '💨', title: 'Vent · rafales', lv: s ? s.lv : 0,
      line: g ? `Rafales ${r0(g.x.gust)} km/h${s ? ' · ' + (active(s) ? 'maintenant' : 'vers ' + hm(s.peakRow.t)) : ''}` : 'Vent non fourni',
      detail: [w != null ? `Vent moyen jusqu’à ${r0(w)} km/h` : null, g ? `Pic de rafales vers ${hm(g.t)}` : null, s ? `Au-dessus de 55 km/h de ${hm(atMin(s.start))} à ${hm(atMin(s.end))}` : null].filter(Boolean) }); }
  { const s = first('ice'), tr = rowMax('Tr', -1), ta = minOf('T');
    phen.push({ id: 'ice', icon: '❄️', title: 'Gel · verglas', lv: s ? s.lv : 0,
      line: s ? `${cap(ICE_TXT[s.lv])} · ${active(s) ? 'maintenant' : hm(atMin(s.start))}–${hm(atMin(s.end))}` : 'Aucun risque estimé',
      detail: [tr ? `Chaussée estimée minimale ${r1(tr.x.Tr)} °C ± 2 vers ${hm(tr.t)}` : null, ta != null ? `Air minimal ${r1(ta)} °C` : null, 'Estimation sans capteur routier : ponts et zones d’ombre d’abord'].filter(Boolean) }); }
  { const tmin = minOf('T'), tmax = maxOf('T'), s = first('temp'), z = changes.find(c => c.id === 'zero');
    phen.push({ id: 'temp', icon: '🌡', title: 'Température', lv: s ? s.lv : 0, line: `${T == null ? '—' : r0(T)} °C · min ${r0(tmin)} / max ${r0(tmax)}`,
      detail: [`Ressenti ${Tapp == null ? '—' : r1(Tapp)} °C maintenant`, z ? `${cap(z.text)} vers ${hm(atMin(z.m))}` : null].filter(Boolean) }); }
  { const g = glareTrips[0], sun = (input && input.sun) || {};
    phen.push({ id: 'sun', icon: '🌅', title: 'Soleil rasant', lv: g ? 1 : 0,
      line: g ? `Vers ${hm(g.glare.ts)} · ${g.label || 'trajet'}` : 'Pas dans l’axe des trajets prévus',
      detail: [sun.sunrise ? `Lever ${hm(sun.sunrise)} · coucher ${hm(sun.sunset)}` : null, g ? 'Soleil bas (moins de 15°) à moins de 30° du cap de la route, ciel peu couvert' : 'Calcul fait uniquement pour les trajets connus'].filter(Boolean) }); }
  const roadNow = roadState(nowRow), roadWorst = H.map(r => roadState(r)).sort((a, b) => b.rank - a.rank)[0];
  // l'état actuel, puis le pire état à venir s'il est plus délicat : la couleur correspond toujours au texte affiché
  phen.push({ id: 'road', icon: '🛣', title: 'Chaussée estimée', lv: Math.min(3, roadWorst.lv), line: `${cap(roadNow.text)}${n(nowRow.x.Tr) != null ? ' ' + r1(nowRow.x.Tr) + ' °C' : ''}${roadWorst.rank > roadNow.rank ? ' → ' + roadWorst.text + ' ' + hm(roadWorst.t) : ''}`,
    detail: [roadWorst.rank > roadNow.rank ? `Au pire : ${roadWorst.text} vers ${hm(roadWorst.t)}` : 'État stable sur la période', 'Estimation (air, pluie récente, rosée, rayonnement) : pas un capteur routier'] });
  function roadState(r) {
    const x = r.x, prev = all.some(p => { const m = mins(p.t); return m < r.m && m >= r.m - 180 && (n(p.Pl) ?? n(p.P) ?? 0) >= 0.2; });   // pluie des 3 h précédentes
    const humid = n(x.RH) != null && n(x.RH) >= 95 && n(x.T) != null && n(x.Td) != null && x.T - x.Td < 1;
    if (r.h.snow) return { rank: 5, lv: 2, text: 'enneigée possible', t: r.t };
    if (r.h.ice >= 3) return { rank: 4, lv: 3, text: 'verglas possible', t: r.t };
    if (r.h.ice === 2 && (r.h.rain || prev || humid)) return { rank: 4, lv: 2, text: 'givre possible', t: r.t };
    if (r.h.rain) return { rank: 3, lv: r.h.rain, text: 'mouillée', t: r.t };
    if (prev || humid) return { rank: 2, lv: 1, text: 'humide', t: r.t };
    if (r.h.ice) return { rank: 1, lv: 1, text: 'sèche, froide', t: r.t };
    return { rank: 0, lv: 0, text: 'sèche', t: r.t };
  }

  /* ---------- conditions route : score explicable ---------- */
  const next = tripList.find(t => t.depM >= nowM - 1 && t.depM - nowM <= 12 * 60 && t.pts.length) || tripList.find(t => t.depM < nowM && t.arrM > nowM && t.pts.length);
  const wRows = next ? next.pts.map(p => ({ x: p.x, h: p.h, t: p.t, m: p.m, maybe: p.maybe })) : H.filter(r => r.m <= nowM + 6 * 60);
  const road = roadScore(wRows, next ? !!next.glare : false);
  road.window = next ? { kind: 'trip', label: `sur le ${next.label || 'trajet'} ${hm(next.dep)}–${hm(next.arr || next.dep)}` } : { kind: 'hours', label: `maintenant → ${hm(atMin(Math.min(endM, nowM + 6 * 60)))}` };
  function roadScore(rows, glare) {
    const mx = id => rows.reduce((a, r) => Math.max(a, r.h[id]), 0), xs = rows.map(r => r.x);
    const max = k => { const v = xs.map(x => n(x[k])).filter(v => v != null); return v.length ? Math.max(...v) : null; }, min = k => { const v = xs.map(x => n(x[k])).filter(v => v != null); return v.length ? Math.min(...v) : null; };
    const Pm = Math.max(0, ...xs.map(x => n(x.Pl) ?? n(x.P) ?? 0)), ppm = max('pp'), vm = min('vis'), gm = max('gust'), Tm = min('T'), TM = max('T'), Trm = min('Tr');
    const iceLv = mx('ice'), fz = xs.some(x => FZ.has(n(x.code)) || (x.ice && x.ice.level >= 2)), iceMod = xs.some(x => x.ice && x.ice.level === 1);
    const humid = !mx('rain') && xs.some(x => n(x.RH) != null && x.RH >= 95);
    const F = [];
    const add = (id, label, lv, pen, why) => F.push({ id, label, lv, pen, why });
    add('temp', 'Température', Tm != null && (Tm <= 3 || (TM != null && TM >= 35)) ? 1 : 0, Tm != null && (Tm <= 3 || (TM != null && TM >= 35)) ? ROAD_PEN.temp : 0,
      Tm == null ? 'non fournie' : Tm <= 3 ? `air jusqu’à ${r1(Tm)} °C : chaussée froide` : TM >= 35 ? `air jusqu’à ${r0(TM)} °C` : `air ${r0(Tm)} → ${r0(TM)} °C`);
    add('wind', 'Vent', mx('wind'), gm == null ? 0 : gm >= 90 ? ROAD_PEN.wind[0] : gm >= 70 ? ROAD_PEN.wind[1] : gm >= 55 ? ROAD_PEN.wind[2] : 0, gm == null ? 'non fourni' : `rafales ${r0(gm)} km/h`);
    add('humid', 'Humidité', humid ? 1 : 0, humid ? ROAD_PEN.humid : 0, humid ? 'air saturé : chaussée humide possible' : 'pas d’humidité notable sans pluie');
    const rp = mx('snow') ? 0 : Pm >= 7.6 ? ROAD_PEN.rain[0] : Pm >= 2 ? ROAD_PEN.rain[1] : Pm >= 0.2 ? ROAD_PEN.rain[2] : ppm != null && ppm >= 60 ? ROAD_PEN.rain[3] : 0;
    const mb = Pm >= 0.2 ? null : maybeOf(rows);   // la pénalité « probabilité seule » reste : seule l'explication change
    add('rain', 'Pluie', mx('rain') || (rp ? 1 : 0), rp, Pm >= 0.2 ? `jusqu’à ${r1(Pm)} mm/h` : mb ? `pluie possible : ${mb.text}` : ppm != null && ppm >= 60 ? `probabilité ${r0(ppm)} %` : 'sec');
    if (mx('snow')) add('snow', 'Neige', 2, ROAD_PEN.snow, 'chute de neige prévue');
    const gp = fz ? ROAD_PEN.ice[0] : iceMod ? ROAD_PEN.ice[1] : iceLv >= 2 ? ROAD_PEN.ice[2] : iceLv === 1 ? ROAD_PEN.ice[3] : 0;
    add('ice', 'Gel', iceLv, gp, iceLv ? `chaussée estimée jusqu’à ${r1(Trm)} °C ± 2${fz ? ', verglas élevé' : iceMod ? ', verglas modéré' : ''}` : Trm != null ? `chaussée ≥ ${r0(Trm)} °C` : 'non estimé');
    add('fog', 'Visibilité', mx('fog'), vm == null ? 0 : vm < 200 ? ROAD_PEN.fog[0] : vm < 500 ? ROAD_PEN.fog[1] : vm < 1000 ? ROAD_PEN.fog[2] : 0, vm == null ? 'non fournie' : `minimum ${visTxt(vm)}`);
    if (glare) add('sun', 'Soleil rasant', 1, ROAD_PEN.sun, 'soleil bas dans l’axe de la route');
    const score = Math.max(0, 100 - F.reduce((a, f) => a + f.pen, 0)), sl = score >= 80 ? 0 : score >= 60 ? 1 : score >= 40 ? 2 : 3;
    return { score, level: Math.max(sl, ...F.map(f => f.lv)), factors: F };
  }

  /* ---------- prochain trajet ---------- */
  let trip = null;
  const tt = tripList.find(t => t.arrM > nowM) || null;
  if (tt) {
    const P = tt.pts, mid = P.length > 2 ? P.reduce((b, p) => Math.abs((p.f ?? 0.5) - 0.5) < Math.abs((b.f ?? 0.5) - 0.5) ? p : b, P[1]) : null;
    const pt = (p, lbl) => p ? { label: lbl, t: hm(p.t), T: n(p.x.T), text: condTxt(p.x), lv: p.lv, place: p.name || null } : null;
    const worst = P.reduce((b, p) => !b || p.lv > b.lv ? p : b, null);
    let crit = null;
    if (worst && worst.lv > 0) {
      const id = ORDER.filter(k => worst.h[k] === worst.lv)[0], i = P.indexOf(worst), firstIdx = P.findIndex(p => p.h[id] > 0), fp = P[firstIdx], prev = firstIdx > 0 ? P[firstIdx - 1] : null;
      const kmTxt = fp && finite(fp.km) && fp.km > 0 ? (prev && finite(prev.km) && prev.km < fp.km ? ` après environ ${r0(prev.km)}–${r0(fp.km)} km` : ` vers le km ${r0(fp.km)}`) : firstIdx === 0 ? ' dès le départ' : fp ? ` vers ${hm(fp.t)}` : '';
      crit = { lv: worst.lv, id, text: `${cap(id === 'rain' ? (worst.lv >= 2 ? rainTxt(worst.x) : 'pluie probable') : id === 'ice' ? ICE_TXT[worst.lv] : id === 'fog' ? 'brouillard ' + visTxt(n(worst.x.vis)) : id === 'wind' ? 'rafales ' + r0(worst.x.gust) + ' km/h' : NAME[id])}${kmTxt}`, at: hm(P[i].t) };
    }
    if (!crit && tt.glare) crit = { lv: 1, id: 'sun', text: `Soleil rasant vers ${hm(tt.glare.ts)}`, at: hm(tt.glare.ts) };
    const tmb = !tt.pending && !crit && maybeOf(tripRows(tt));
    if (tmb) crit = { lv: tmb.lv, id: 'rain', text: `Pluie possible ${tmb.m <= tt.depM ? 'dès le départ' : 'vers ' + hm(tmb.t)} · ${tmb.text}`, at: hm(tmb.t), possible: true };
    const later = tripList.filter(t => !t.pending && t !== tt && t.depM > tt.depM).slice(0, 3).map(t => ({ dep: hm(t.dep), label: t.label || 'trajet', lv: t.pts.reduce((a, p) => Math.max(a, p.lv), 0), day: t.dep.slice(0, 10) }));
    trip = { id: tt.id || null, label: tt.label || 'trajet', from: tt.from || null, to: tt.to || null, dep: hm(tt.dep), arr: hm(tt.arr || tt.dep), day: tt.dep.slice(0, 10), durMin: Math.max(0, Math.round(tt.arrM - tt.depM)),
      running: typeof tt.running === 'boolean' ? tt.running : tt.depM <= nowM, km: finite(tt.km) ? tt.km : null, waiting: !P.length,
      points: P.length ? [pt(P[0], 'Départ'), mid && mid !== P[0] && mid !== P[P.length - 1] ? pt(mid, 'Mi-parcours') : null, P.length > 1 ? pt(P[P.length - 1], 'Arrivée') : null].filter(Boolean) : [],
      crit, lv: P.reduce((a, p) => Math.max(a, p.lv), tt.glare ? 1 : 0), later, pending: !!tt.pending };
    if (tt.pending) Object.assign(trip, { dep: null, arr: null, durMin: null, km: null, waiting: true });
  }

  /* ---------- ce qui compte aujourd'hui (3 à 5 lignes, jamais du remplissage) ---------- */
  const items = [];
  const push = (lv, text, m, key) => { if (!items.some(i => i.key === key)) items.push({ lv, text, m, key }); };
  tripList.forEach(t => {
    const w = t.pts.reduce((b, p) => !b || p.lv > b.lv ? p : b, null); if (!w || !w.lv) return;
    const id = ORDER.filter(k => w.h[k] === w.lv)[0], what = { rain: w.lv >= 2 ? cap(rainTxt(w.x)) : 'Pluie probable', snow: 'Neige', fog: 'Brouillard', wind: 'Rafales', ice: cap(ICE_TXT[w.lv]), temp: 'Température extrême' }[id];
    push(w.lv, `${what} pendant le ${t.label || 'trajet'} (${hm(t.dep)})`, t.depM, id + '@trip');
  });
  const tripMaybe = tripList.map(t => ({ t, mb: maybeOf(tripRows(t)) })).filter(o => o.mb);
  tripMaybe.forEach(({ t, mb }) => push(mb.lv, `Pluie possible pendant le ${t.label || 'trajet'} (${hm(t.dep)}) · ${mb.text}`, t.depM, 'rainmaybe@trip'));
  if (mbH && !tripMaybe.length && !first('rain') && !first('snow')) push(mbH.lv, `Pluie possible ${whenM(mbH)} · ${mbH.text}`, mbH.m, 'rainmaybe');
  real.forEach(s => {
    if (s.id === 'sun') { push(1, `Soleil rasant vers ${hm(atMin(s.start))} (${s.trip.label || 'trajet'})`, s.start, 'sun'); return; }
    if (items.some(i => i.key === s.id + '@trip') && s.lv <= 1) return;
    const pk = s.peakRow.x, a = active(s) ? 'maintenant' : hm(atMin(s.start)), b = hm(atMin(s.end));
    const txt = {
      rain: active(s) ? `${cap(rainTxt(pk))} en cours ${s.end < endM ? 'jusqu’à ' + b : 'au moins jusqu’à ' + b}` : `${cap(rainTxt(pk))} probable ${s.end < endM ? `de ${a} à ${b}` : 'à partir de ' + a}`,
      snow: `Neige possible ${active(s) ? 'dès maintenant' : 'à partir de ' + a}`,
      fog: active(s) || s.start - nowM <= 60 ? `Brouillard ${active(s) ? 'jusqu’à' : 'possible avant'} ${b} · visibilité ${visTxt(n(pk.vis))}` : `Brouillard possible ${a}–${b} · visibilité ${visTxt(n(pk.vis))}`,
      wind: `Rafales jusqu’à ${r0(pk.gust)} km/h (vers ${hm(s.peakRow.t)})`,
      ice: `${s.lv >= 3 ? 'Risque de verglas' : cap(ICE_TXT[s.lv])} ${a}–${b} · chaussée ${r1(pk.Tr)} °C`,
      temp: n(pk.T) >= 35 ? `Forte chaleur : jusqu’à ${r0(pk.T)} °C` : `Froid intense : ressenti ${r0(pk.Tapp)} °C`
    }[s.id];
    push(s.lv, txt, s.start, s.id);
  });
  items.sort((a, b) => b.lv - a.lv || a.m - b.m);
  const matters = items.slice(0, 4).map(({ lv, text }) => ({ lv, text }));
  // rassurances utiles seulement quand la question se pose réellement
  const tmin = minOf('T');
  if (matters.length < 5 && !first('ice') && tmin != null && tmin <= 5) matters.push({ lv: 0, text: `Pas de risque de gel estimé (air jusqu’à ${r0(tmin)} °C)` });
  if (matters.length < 5 && !first('rain') && !first('snow') && !tripMaybe.length && tripList.length) matters.push({ lv: 0, text: `Pas de pluie attendue sur les trajets d’ici ${hm(endTs)}` });
  // conseil pratique seulement si la pluie touche un trajet ou tombe dans les 12 h
  if (matters.length < 5 && real.some(s => (s.id === 'rain' || s.id === 'snow') && (s.start - nowM <= 12 * 60 || tripsOf(s).length))) matters.push({ lv: 0, text: 'Prévoir une couche imperméable' });
  if (!matters.length) matters.push({ lv: 0, text: `Rien de notable d’ici ${hm(endTs)} : conditions stables` });

  return { level, hero, current: { T, Tapp, source: currentSource }, nextChange: nextChange ? { t: hm(atMin(nextChange.m)), text: nextChange.text, lv: nextChange.lv } : null,
    window: { from: hm(now), to: hm(endTs), end: endTs }, timeline: { moments: tl, strip }, matters: matters.slice(0, 5), phen, road, trip };
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
}
// Pénalités des conditions route (points retirés de 100), dans l'ordre des seuils de l'en-tête.
const ROAD_PEN = { temp: 5, humid: 5, sun: 5, snow: 35, wind: [30, 20, 10], rain: [30, 20, 10, 5], ice: [45, 25, 15, 8], fog: [35, 25, 15] };
const WXD_EMO = ['🟢', '🟡', '🟠', '🔴'];
