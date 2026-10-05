/* Moteur de preuves météo v2 (weatherEvidenceV2) : fusion de PREUVES, pas une moyenne. Pur : aucun réseau, stockage ni horloge.
   Couches : A observations physiques (METAR, SYNOP, Météo-France) · B nowcast/radar · C modèles · D terrain (utilisateur,
   communauté) · E signatures physiques calculées (T − Td, vent, nuit/matin). Aucune couche n'est une vérité universelle :
   elles se corroborent ou se contredisent, et un phénomène critique observé gagne sur un modèle « confiant ».
   Règles clés :
   - visibilité physique > code météo textuel (« partiellement nuageux, 180 m » → visibilité très réduite) ;
   - pour le présent, observation récente fiable > nowcast > modèle ; le poids d'une observation décroît avec la distance,
     l'âge, l'écart d'altitude et l'échéance (une observation décrit maintenant, pas demain) ;
   - pire condition crédible le long du trajet (jamais la moyenne des points) ;
   - absence de signalement communautaire = presque aucune preuve (ne réduit jamais un risque) ;
   - la qualité de localisation plafonne la confiance des phénomènes très locaux (brouillard, visibilité, gel) ;
   - pas de pourcentage unique : une confiance par phénomène (élevée, moyenne, faible) et des axes séparés. */
const EV_CFG = {
  // signature physique du brouillard de rayonnement : air saturé (T − Td faible, HR ≈ 100 %), vent faible (< 10 km/h), nuit ou
  // début de matinée, ciel dégagé. Sources : Météo-France « Le brouillard » ; NAV CANADA « Brouillard de rayonnement ».
  // Seuils de départ, testés et configurables (à recalibrer avec le journal prévision/observation) :
  spread: [0.5, 1, 2],            // °C : ≤ 0,5 très favorable, ≤ 1 favorable, ≤ 2 possible
  windCalm: 10, windMix: 20,      // km/h : vent faible favorable ; au-delà de 20, le mélange dissipe
  rh: 97,                         // % : air quasi saturé
  vis: [200, 1000, 5000],         // m : < 200 dense (🔴), < 1 000 brouillard (🟠), < 5 000 brume (🟡)
  ceilFt: 300,                    // ft : nuages à 300 ft ou moins = stratus bas / brouillard proche du sol
  dist: [[10, 1], [25, 0.7], [50, 0.4], [Infinity, 0.15]],        // km → poids (au-delà de 50 km : indice régional)
  age: [[30, 1], [60, 0.8], [120, 0.5], [180, 0.25], [Infinity, 0.1]],   // min → poids (3 h et plus : forte décote)
  lead: 180,                      // min : au-delà, une observation n'informe plus la prévision (persistance)
  altDiff: 150, altFactor: 0.6,   // m : station plus haute ou plus basse de plus de 150 m → poids × 0,6
  report: { km: 5, min: 60 },     // signalement utilisateur : pertinent à moins de 5 km et 60 min
  community: { km: 7, min: 15, n: 3, farKm: 30, farMin: 45 }
};
const EV_TRUST = ['faible', 'moyenne', 'élevée'];
function evidenceEngine(input) {
  const inp = input || {}, now = inp.now, C = Object.assign({}, EV_CFG, inp.cfg || {});
  const fin = v => typeof v === 'number' && Number.isFinite(v), n = v => fin(v) ? v : null;
  const R = Math.PI / 180, km = (a, b) => { const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
  const step = (tab, v) => tab.find(([lim]) => v <= lim)[1];
  const fmtVis = v => v >= 10000 ? '> 10 km' : v >= 1000 ? (Math.round(v / 100) / 10).toString().replace('.', ',') + ' km' : Math.round(v / 10) * 10 + ' m';
  const visLv = v => v == null ? null : v < C.vis[0] ? 3 : v < C.vis[1] ? 2 : v < C.vis[2] ? 1 : 0;
  const ceilOf = raw => { let b = null; String(raw || '').replace(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})\b/g, (_, k, h) => { const ft = +h * 100; if (b == null || ft < b) b = ft; }); return b; };
  const locTrust = (inp.location && inp.location.trust) || 'Indisponible';
  const locCap = { Confirmée: 2, Fiable: 2, Estimée: 1, Incertaine: 0, Indisponible: 0 }[locTrust] ?? 0;
  const fresh = inp.fresh || {}, stale = fresh.offline || (fin(fresh.modelAgeMin) && fresh.modelAgeMin > 90);
  const pts = (inp.points || []).filter(p => p && p.x && fin(p.ms)).sort((a, b) => a.ms - b.ms);
  if (!pts.length) return null;
  const stations = (inp.stations || []).filter(s => s && fin(s.lat) && fin(s.lon));
  const reports = (inp.reports || []).filter(r => r && fin(r.at) && fin(r.lat) && fin(r.lon));
  const comm = inp.community && inp.community.available ? (inp.community.items || []) : null;

  /* ---------- brouillard et visibilité, par point (heure de passage) ---------- */
  function fogAt(p) {
    const x = p.x, ev = [], lead = Math.max(0, (p.ms - now) / 60e3);
    const T = n(x.T), Td = n(x.Td), RH = n(x.RH), wind = n(x.wind), sp = T != null && Td != null ? Math.max(0, T - Td) : null;
    let phys = 0, obsLv = null, obsW = 0, userLv = null, comLv = null;
    // E — signature physique
    if (sp != null) {
      const s = sp <= C.spread[0] ? 3 : sp <= C.spread[1] ? 2 : sp <= C.spread[2] ? 1 : 0;
      if (s) { phys += s; ev.push({ layer: 'E', source: 'T − Td', text: `écart température / point de rosée ${sp.toFixed(1).replace('.', ',')} °C`, w: 0.5, dir: '+' }); }
      else ev.push({ layer: 'E', source: 'T − Td', text: `air non saturé (écart ${sp.toFixed(1).replace('.', ',')} °C)`, w: 0.5, dir: '−' });
    }
    if (RH != null && RH >= C.rh && !(sp != null && sp <= C.spread[1])) { phys += 1; ev.push({ layer: 'E', source: 'humidité', text: `humidité ${Math.round(RH)} %`, w: 0.3, dir: '+' }); }
    if (wind != null) {
      if (wind <= C.windCalm && phys) { phys += 1; ev.push({ layer: 'E', source: 'vent', text: `vent faible ${Math.round(wind)} km/h`, w: 0.3, dir: '+' }); }
      else if (wind > C.windMix) { phys -= 2; ev.push({ layer: 'E', source: 'vent', text: `vent ${Math.round(wind)} km/h : mélange de l’air`, w: 0.3, dir: '−' }); }
    }
    const hh = +String(p.t || '').slice(11, 13), nightMorning = fin(hh) && (hh >= 20 || hh <= 10);
    if (nightMorning && phys >= 2) { phys += 1; ev.push({ layer: 'E', source: 'heure', text: 'nuit ou début de matinée (refroidissement)', w: 0.2, dir: '+' }); }
    const physLv = phys >= 5 ? 2 : phys >= 3 ? 1 : 0;   // la physique seule ne conclut jamais « dense »
    // C — modèle : la visibilité numérique gagne sur le code textuel
    const mv = n(x.vis), mvLv = visLv(mv), fogCode = [45, 48].includes(n(x.code));
    if (mv != null) ev.push({ layer: 'C', source: 'modèle', text: `visibilité prévue ${fmtVis(mv)}`, w: 0.4, dir: mvLv ? '+' : '−' });
    if (fogCode) ev.push({ layer: 'C', source: 'modèle', text: 'code « brouillard »', w: 0.4, dir: '+' });
    const modelLv = Math.max(mvLv || 0, fogCode ? 2 : 0);
    // A — observations : distance × âge × altitude × échéance
    stations.forEach(st => {
      const o = (st.obs || []).filter(o => o && fin(Date.parse(o.t))).sort((a, b) => Date.parse(b.t) - Date.parse(a.t))[0]; if (!o) return;
      const d = km(p, st), age = Math.max(0, (now - Date.parse(o.t)) / 60e3), w0 = step(C.dist, d) * step(C.age, age) * (fin(st.elev) && fin(p.elev) && Math.abs(st.elev - p.elev) > C.altDiff ? C.altFactor : 1);
      const w = w0 * Math.max(0, 1 - lead / C.lead); if (w <= 0.02) return;
      const fg = /FG/.test(o.wx || ''), br = /BR/.test(o.wx || ''), ceil = ceilOf(o.raw), osp = fin(o.T) && fin(o.Td) ? o.T - o.Td : null;
      let lv = visLv(n(o.vis)) || 0;
      if (fg) lv = Math.max(lv, 2);
      // brume saturée sous vent faible : des bancs plus denses sont probables à l'écart de la station (vallées, creux)
      if (br && osp != null && osp <= C.spread[1] && (o.wind == null || o.wind <= C.windCalm)) lv = Math.max(lv, 2);
      if (ceil != null && ceil <= C.ceilFt && osp != null && osp <= C.spread[1]) lv = Math.max(lv, 2);
      const tag = `${st.name || st.id} (${Math.round(d)} km, il y a ${Math.round(age)} min)`;
      ev.push({ layer: 'A', source: 'observation ' + (st.kind || 'METAR'), text: `${tag} : visibilité ${o.vis != null ? fmtVis(o.vis) : 'n.c.'}${o.wx ? ' · ' + o.wx : ''}${osp != null ? ' · T − Td ' + osp : ''}${ceil != null ? ' · nuages ' + ceil + ' ft' : ''}${d > 50 ? ' · indice régional' : ''}`, w: Math.round(w * 100) / 100, dir: lv ? '+' : '−', lv });
      // la meilleure observation pondérée l'emporte (pas de moyenne) ; une observation faible ne vaut qu'un indice
      const eff = w >= 0.6 ? lv : w >= 0.3 ? Math.min(lv, 2) : Math.min(lv, 1);
      if (obsLv == null || w > obsW) { obsLv = eff; obsW = w; }
    });
    // D — signalement utilisateur (non officiel) : très pertinent localement et récemment
    reports.filter(r => ['fog', 'lowvis'].includes(r.kind) && km(p, r) <= C.report.km && Math.abs(p.ms - r.at) / 60e3 <= C.report.min).forEach(r => {
      userLv = Math.max(userLv || 0, r.kind === 'lowvis' ? 3 : 2);
      ev.push({ layer: 'D', source: 'vous', text: `${r.kind === 'lowvis' ? 'visibilité très réduite' : 'brouillard'} signalé il y a ${Math.round(Math.max(0, now - r.at) / 60e3)} min (observation utilisateur, non officielle)`, w: 0.9, dir: '+' });
    });
    // D — communauté (si une source autorisée existe) : un amas cohérent > un signalement isolé ; l'absence ne prouve rien
    if (comm) {
      const near = comm.filter(c => c.kind === 'fog' && km(p, c) <= C.community.km && Math.abs(now - c.at) / 60e3 <= C.community.min);
      const far = comm.filter(c => c.kind === 'fog' && km(p, c) <= C.community.farKm && Math.abs(now - c.at) / 60e3 <= C.community.farMin);
      if (near.length >= C.community.n) { comLv = phys >= 3 ? 2 : 1; ev.push({ layer: 'D', source: 'communauté', text: `${near.length} signalements brouillard récents (< ${C.community.min} min, ${C.community.km} km)`, w: 0.6, dir: '+' }); }
      else if (far.length) { comLv = 1; ev.push({ layer: 'D', source: 'communauté', text: `${far.length} signalement(s) isolé(s) : indice faible`, w: 0.2, dir: '+' }); }
    }
    // fusion : niveau = la preuve crédible la plus forte ; une observation fraîche proche peut abaisser un modèle pessimiste
    const physical = Math.max(physLv, obsLv || 0, userLv || 0, comLv || 0);
    let lv = Math.max(modelLv, physical);
    const obsClear = obsLv === 0 && obsW >= 0.7 && lead <= 60;
    if (obsClear && modelLv >= 2 && !userLv) lv = Math.max(1, physical);   // observation récente et proche dégagée : le modèle était trop pessimiste pour le présent
    // contradictions (jamais moyennées)
    let contra = null;
    if (modelLv <= 1 && physical >= 2) contra = 'Les modèles sous-estiment probablement un phénomène local de visibilité.';
    else if (obsClear && modelLv >= 2) contra = 'Le modèle annonce du brouillard, l’observation proche et récente non : modèle probablement trop pessimiste pour l’instant.';
    // confiance : accord des couches indépendantes, plafonnée par la localisation et la fraîcheur
    const layers = new Set(ev.filter(e => e.dir === '+' && (e.lv == null || e.lv >= 1)).map(e => e.layer));
    let trust = lv === 0 ? (obsLv === 0 && obsW >= 0.6 ? 2 : 1) : layers.size >= 3 ? 2 : layers.size === 2 ? 1 : 0;
    if (contra) trust = Math.min(trust, 1);
    if (lv === 0 && !stations.length && sp == null) trust = 0;
    trust = Math.min(trust, locCap); if (stale) trust = Math.max(0, trust - 1);
    const range = lv === 3 ? 'moins de 200 m possible' : lv === 2 ? '200 m à 1 km possible (bancs)' : lv === 1 ? '1 à 5 km, brume' : 'bonne (> 5 km)';
    return { lv, trust, range, contra, ev, sp, modelLv, physLv, obsLv, userLv, comLv };
  }
  const fog = pts.map(p => ({ p, f: fogAt(p) }));
  // pire condition crédible du trajet (pas la moyenne)
  const visOf = c => n(c.p.x.vis) ?? Infinity;   // à niveau égal : la visibilité la plus basse, puis la preuve la plus solide
  const worst = fog.reduce((b, c) => !b || c.f.lv > b.f.lv || (c.f.lv === b.f.lv && (visOf(c) < visOf(b) || (visOf(c) === visOf(b) && c.f.trust > b.f.trust))) ? c : b, null);
  const multi = pts.length > 1;
  /* ---------- autres phénomènes : valeur, niveau, confiance ---------- */
  const xs = pts.map(p => p.x);
  const min = k => { const v = xs.map(x => n(x[k])).filter(v => v != null); return v.length ? Math.min(...v) : null; }, max = k => { const v = xs.map(x => n(x[k])).filter(v => v != null); return v.length ? Math.max(...v) : null; };
  const obsT = stations.map(s => (s.obs || [])[0]).filter(o => o && fin(o.T) && (now - Date.parse(o.t)) / 60e3 <= 90);
  const tNow = n(pts[0].x.T), tAgree = obsT.length && tNow != null ? Math.min(...obsT.map(o => Math.abs(o.T - tNow))) : null;
  const tTrust = Math.max(0, (tAgree == null ? 1 : tAgree <= 2 ? 2 : 1) - (stale ? 1 : 0));
  const Pmax = Math.max(0, ...xs.map(x => n(x.Pl) ?? n(x.P) ?? 0)), ppMax = max('pp');
  const rainLv = Pmax >= 2 ? 2 : Pmax >= 0.2 ? 1 : 0, rainTrust = Math.max(0, (inp.radar ? 2 : 1) - (stale ? 1 : 0));
  const gust = max('gust'), windLv = gust == null ? 0 : gust >= 90 ? 3 : gust >= 70 ? 2 : gust >= 55 ? 1 : 0;
  const Trm = min('Tr'), iceMax = Math.max(0, ...xs.map(x => x.ice && fin(x.ice.level) ? x.ice.level : 0));
  const frostLv = iceMax >= 2 ? 3 : iceMax === 1 ? 2 : Trm != null && Trm < 2 ? 1 : 0;
  const frostTrust = Math.min(1, locCap) - (stale ? 1 : 0);
  const fw = worst.f;
  const phen = [
    { id: 'temp', icon: '🌡', label: 'Température', value: tNow != null ? `${Math.round(tNow)} °C` : '—', lv: 0, trust: tTrust, why: tAgree != null ? `modèle et observation à ${tAgree.toFixed(1).replace('.', ',')} °C près` : 'modèle seul' },
    { id: 'rain', icon: '🌧', label: 'Pluie', value: rainLv ? `jusqu’à ${Pmax.toFixed(1).replace('.', ',')} mm/h` : ppMax != null && ppMax >= 40 ? `risque ${Math.round(ppMax)} %` : 'faible risque', lv: rainLv, trust: rainTrust, why: inp.radar ? 'modèle + radar' : 'modèle seul (radar non intégré à la décision)' },
    { id: 'wind', icon: '💨', label: 'Vent', value: gust != null ? `rafales ${Math.round(gust)} km/h` : '—', lv: windLv, trust: Math.max(0, 2 - (stale ? 1 : 0)), why: 'modèle' },
    { id: 'fog', icon: '🌫', label: 'Brouillard', value: ['Risque faible', 'Brume possible', 'Risque élevé', 'Brouillard dense possible'][fw.lv], lv: fw.lv, trust: fw.trust, why: fw.ev.filter(e => e.dir === '+').map(e => e.source).filter((v, i, a) => a.indexOf(v) === i).join(' + ') || 'aucune preuve' },
    { id: 'vis', icon: '👁', label: 'Visibilité', value: fw.range, lv: fw.lv, trust: Math.min(fw.trust, fw.obsLv != null ? 2 : 1), why: fw.obsLv != null ? 'observation + modèle' : 'modèle et physique seulement' },
    { id: 'frost', icon: '🧊', label: 'Gel', value: ['Faible', 'Marge faible', 'Gel de surface possible', 'Verglas possible'][frostLv], lv: frostLv, trust: Math.max(0, frostTrust), why: 'chaussée estimée (aucun capteur routier)' },
    { id: 'loc', icon: '📍', label: 'Localisation', value: locTrust, lv: locCap === 0 ? 2 : locCap === 1 ? 1 : 0, trust: locCap, why: 'plafonne la confiance des phénomènes locaux' }
  ].map(x => ({ ...x, trustTxt: EV_TRUST[Math.max(0, Math.min(2, x.trust))] }));
  /* ---------- axes de confiance séparés ---------- */
  const nObs = stations.filter(s => (s.obs || []).some(o => (now - Date.parse(o.t)) / 60e3 <= 90)).length;
  const axes = {
    data: stale ? 'dégradée (données anciennes ou hors ligne)' : 'bonne',
    models: inp.ensemble ? (inp.ensemble.spread || 'disponible') : 'non mesuré (un seul modèle déterministe)',
    location: locTrust,
    observations: nObs ? `${nObs} station(s) récente(s)` : 'aucune observation récente',
    freshness: fin(fresh.modelAgeMin) ? `prévision reçue il y a ${Math.round(fresh.modelAgeMin)} min` : 'inconnue'
  };
  /* ---------- verdict : phénomènes critiques d'abord, alerte seulement si utile ---------- */
  const crit = phen.filter(x => ['fog', 'frost', 'rain', 'wind'].includes(x.id) && x.lv >= 2).sort((a, b) => b.lv - a.lv);
  const fogWin = fog.filter(c => c.f.lv >= 2).map(c => c.p.t);
  const headline = fw.lv >= 2 ? { icon: '🌫', text: fw.lv === 3 ? 'BROUILLARD DENSE POSSIBLE' : 'BROUILLARD LOCAL PROBABLE', sub: fw.range, window: fogWin.length ? [fogWin[0].slice(11, 16), fogWin[fogWin.length - 1].slice(11, 16)] : null,
    where: multi && worst.p.label ? `portion du trajet : ${worst.p.label}` : null, proofs: fw.ev.filter(e => e.dir === '+').map(e => e.text).slice(0, 4), trust: EV_TRUST[fw.trust] } : null;
  // alerte = importance × crédibilité × impact trajet
  const impact = inp.onTrip ? 1 : 0.6;
  const alert = crit.length ? crit[0].lv * (1 + crit[0].trust) / 3 * impact >= 1 : false;
  return { fog: fog.map(c => ({ label: c.p.label || null, t: c.p.t, ...c.f })), worst: { label: worst.p.label || null, t: worst.p.t, ...fw }, phen, axes, headline, alert,
    contradiction: fog.map(c => c.f.contra).find(Boolean) || null, community: comm ? 'disponible' : 'non disponible (aucune source autorisée)' };
}
// Journal prévision / observation : faux négatifs, faux positifs, précision, rappel, score de Brier (événement « brouillard »).
function evidenceScore(log) {
  const L = (log || []).filter(e => e && e.obs != null && e.pred != null);
  let tp = 0, fp = 0, fn = 0, tn = 0, brier = 0;
  L.forEach(e => { const o = e.obs ? 1 : 0, p = e.pred >= 2 ? 1 : 0; if (p && o) tp++; else if (p) fp++; else if (o) fn++; else tn++; brier += ((e.prob ?? [0.05, 0.25, 0.6, 0.85][e.pred]) - o) ** 2; });
  return { n: L.length, tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, brier: L.length ? brier / L.length : null };
}
