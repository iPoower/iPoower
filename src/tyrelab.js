/* Onglet Analyse : moteur pneumatique pur (aucun réseau, stockage ni horloge : mêmes entrées, même résultat).
   « Comment mes pneus se comportent-ils maintenant, sur ce trajet et dans ces conditions ? »
   Aucun capteur n'est disponible : tout ce qui suit est une ESTIMATION RACE CONTROL, affichée en plages, jamais en valeur exacte.
   Dépend des fonctions pures de engine.js (decodeSize, pressTarget, dotAge) et de tirespecs.js (tireSpecFor).

   MODÈLE THERMIQUE (premier ordre, avec mémoire) — température de gomme/carcasse estimée T :
     environnement  Tenv = ½ air + ½ chaussée estimée (le pneu touche la route et baigne dans l'air)
     en roulage     Teq = Tenv + ΔT, ΔT = ΔT_type_de_route × f_eau × f_vent × f_pression × f_gomme
                    ΔT_type_de_route : ville 14 °C, route 20 °C, autoroute 26 °C (ordre de grandeur cohérent avec le conseil
                    Michelin d'ajouter ≈ 0,3 bar à chaud : +9 % de pression absolue ≈ +25 °C de gaz)
                    f_eau : sec 1 · humide 0,85 · pluie faible 0,65 · pluie ≥ 2 mm/h ou neige 0,5 (l'eau refroidit la bande)
                    constante de distance τ = 10 km (7 km en ville, freinages fréquents) : moins de 3 km roulés ≈ encore froid (Michelin)
     à l'arrêt      Teq = Tenv (+ 3 °C au soleil fort), constante de temps 50 min (×0,8 sous la pluie) : après 2 h, il reste
                    moins de 10 % de l'écart, le pneu est « froid » au sens de Michelin
     intégration    T ← Teq + (T − Teq)·exp(−Δ/τ), par pas de 2 min au plus
   Incertitude : ±3 °C (erreur sur l'environnement) + 25 % de l'écart à l'environnement (erreur relative sur la montée ΔT du
   roulage, dont les valeurs sont des ordres de grandeur), + 3 °C sans historique (s'estompe avec la distance roulée), + 3 °C
   sans météo fraîche. Elle ne diminue PAS quand la température se stabilise : la stabilisation lève l'incertitude de calendrier
   (« quand ? »), pas l'erreur sur la température d'équilibre elle-même (« combien ? »).
   L'état affiché est le plus prudent de la plage (le côté froid pour l'adhérence, le côté chaud pour la surchauffe).

   ÉTAT ≠ TENDANCE
     état     où se situe la gomme dans les fenêtres : froid · sous la plage favorable · favorable · chaud · très chaud
     tendance ce que fait la température : en chauffe · stabilisé · en refroidissement · au repos (ambiant)
     roulage  stabilisé quand l'écart restant à l'équilibre du roulage ≤ 5 % de la montée (≈ 3 constantes de temps, soit ≈ 30 km
              à τ = 10 km) ou ≤ 1 °C (un tiers de l'incertitude de base) ; au-delà : en chauffe (écart > 0) ou en refroidissement
     arrêt    « ambiant » à ±3 °C de l'environnement (indiscernable à l'incertitude de base) ; au-dessus : en refroidissement
     Un pneu peut donc être « Stabilisé · sous la plage favorable » : équilibre atteint, mais trop frais pour entrer dans la plage.

   FENÊTRES (hypothèses Race Control, gomme estimée, °C)  froid | sous la plage favorable | favorable | chaud | très chaud
     été          < 10 | 10–20 | 20–50 | 50–65 | > 65     (été UHP, indices W/Y/ZR : +5 °C sur les deux premiers seuils)
     4 saisons    <  5 |  5–15 | 15–45 | 45–60 | > 60
     hiver        < −5 | −5–5  |  5–35 | 35–50 | > 50
   ADHÉRENCE relative (1 = sec, pneu en température) = surface × température × gomme/ambiance × profondeur × pression :
     surface      sec 1 · humide 0,85 · pluie 0,7 · pluie ≥ 2 mm/h 0,6 · eau stagnante 0,5 · neige 0,2 (été) 0,4 (4 saisons) 0,45 (3PMSF) 0,5 (hiver)
                  · verglas 0,15 (hiver 0,2)
     température  froid 0,85 / 0,92 / 0,97 (été / 4 saisons / hiver) · en chauffe 0,93 / 0,96 / 0,99 · chaud 0,97 · très chaud 0,9
     ambiance     été sous 7 °C ×0,9 · hiver au-dessus de 20 °C ×0,92 (règle pratique des 7 °C déjà utilisée par l'app)
     profondeur   sur mouillé : < 3 mm ×0,85 · < 1,6 mm ×0,7 · pression estimée sous la cible de 0,3 bar ×0,95
     niveaux      ≥ 0,9 optimal 🟢 · ≥ 0,72 bon 🟡 · ≥ 0,5 dégradé 🟠 · sinon très dégradé 🔴
   DISTANCES (ordre de grandeur, jamais une mesure) : d = v² / (2 μ g), μ sec 0,7–0,9 et mouillé 0,4–0,55 (μ ≈ 0,8 sec, environ
     moitié sur mouillé : fr.wikipedia.org/wiki/Distance_d'arrêt), multiplié par les facteurs ci-dessus ; temps de réaction 1 s affiché à part.
     Neige et verglas : aucune distance, indice relatif seulement. */
const TL_WIN = { summer: [10, 20, 50, 65], allseason: [5, 15, 45, 60], winter: [-5, 5, 35, 50] };
const TL_STATES = ['Pneu froid', 'Sous la plage favorable', 'Fenêtre favorable', 'Chaud', 'Très chaud'];   // NIVEAUX ; « en chauffe » est une tendance
const TL_LEVEL_TXT = ['froid', 'sous la plage favorable', 'favorable', 'chaud', 'très chaud'];
const TL_TREND_TXT = { heating: 'En chauffe', stable: 'Stabilisé', cooling: 'En refroidissement', rest: 'Au repos' };
const TL_SETTLE = 0.05, TL_BASE_U = 3;   // convergence (part de la montée) ; incertitude de base (°C)
const TL_KIND = { ville: { dT: 14, tauKm: 7, v: 30, label: 'ville' }, route: { dT: 20, tauKm: 10, v: 70, label: 'route' }, autoroute: { dT: 26, tauKm: 10, v: 115, label: 'autoroute' } };
const TL_MU = { dry: [0.7, 0.9], wet: [0.4, 0.55] };
const TL_TAU_PARK = 50;
function tyreLab(input) {
  const finite = v => typeof v === 'number' && Number.isFinite(v), n = v => finite(v) ? v : null;
  const mins = ts => typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts) ? Date.parse(ts.slice(0, 16) + ':00Z') / 60000 : NaN;
  const hm = m => new Date(m * 60000).toISOString().slice(11, 16);
  const r0 = v => String(Math.round(v)).replace('-', '−'), r1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace('-', '−');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const EMO = ['🟢', '🟡', '🟠', '🔴'];
  const inp = input || {}, car = inp.car, tire = car && car.tire;
  const nowM = mins(inp.now);
  /* ---------- 1. monte active ---------- */
  const TYPES = { summer: 'été', winter: 'hiver', allseason: '4 saisons' };
  if (!tire || !TYPES[tire.type]) return { known: false, reason: 'Monte active inconnue — sélectionner les pneus montés.', car: car ? car.name || car.short : null };
  const type = tire.type, d = typeof decodeSize === 'function' ? decodeSize(tire.size) : null;
  const uhp = type === 'summer' && d && (d.zr || d.si === 'W' || d.si === 'Y');
  const pmsf = inp.db ? inp.db.pmsf === true : null;
  const win = TL_WIN[type].slice(); if (uhp) { win[0] += 5; win[1] += 5; }
  const spec = typeof tireSpecFor === 'function' ? tireSpecFor(tire.brand, tire.model) : null;
  const modelKnown = !!(tire.brand && tire.model);
  const title = modelKnown ? `${tire.brand} ${tire.model}` : `Modèle non renseigné · pneu ${TYPES[type]}`;
  const tyre = { title, brand: tire.brand || null, model: tire.model || null, size: tire.size || null, season: TYPES[type], uhp, pmsf,
    li: d && d.li, kg: d && d.kg, si: d && d.si, kmh: d && d.kmh, xl: d ? d.xl : null, fp: d ? d.fp : null, rf: d ? d.rf : null, width: d ? d.w : null,
    axles: 'Même monte à l’avant et à l’arrière (positions non différenciées dans Race Control)', generic: !modelKnown };
  // pressions cibles par essieu quand elles sont saisies (« 2,3 AV / 2,5 AR »)
  const pz = String(tire.press || ''), NUM = '(\\d+(?:[.,]\\d+)?)';
  const ax = new RegExp(NUM + '\\s*(?:bar\\s*)?AV\\b[^]*?' + NUM + '\\s*(?:bar\\s*)?AR\\b', 'i').exec(pz) || new RegExp('AV\\D{0,3}' + NUM + '[^]*?AR\\D{0,3}' + NUM, 'i').exec(pz);
  if (ax) { const av = parseFloat(ax[1].replace(',', '.')), ar = parseFloat(ax[2].replace(',', '.')); tyre.pressAxles = { av, ar, differ: Math.abs(av - ar) >= 0.05 };
    if (tyre.pressAxles.differ) tyre.axles = `Même pneu à l’avant et à l’arrière, pressions cibles différentes : AV ${r1(av)} / AR ${r1(ar)} bar`; }
  const specOut = { known: TIRE_SPEC_KEYS.map(k => { const f = spec && spec.f.filter(x => x.k === k); return f && f.length ? f.map(x => ({ k, v: x.v, src: x.src, kind: x.kind, check: !!x.check })) : [{ k, v: null }]; }).flat(),
    db: inp.db ? { cat: inp.db.cat || null, pmsf: inp.db.pmsf, tier: inp.db.tier || null } : null };
  if (!Number.isFinite(nowM)) return { known: true, tyre, spec: specOut, noWeather: true };

  /* ---------- 2. environnement heure par heure ---------- */
  const H = ((inp.hours || []).filter(x => x && Number.isFinite(mins(x.t)) && n(x.T) != null)).slice().sort((a, b) => mins(a.t) - mins(b.t));
  const noWeather = !H.length || mins(H[0].t) > nowM || mins(H[H.length - 1].t) + 60 < nowM;
  if (noWeather) return { known: true, tyre, spec: specOut, noWeather: true, state: inp.state || null, confidence: { level: 'faible', reasons: ['Aucune météo pour l’heure en cours : aucune estimation thermique possible.'] } };
  const rowAt = m => { let b = H[0]; for (const x of H) { if (mins(x.t) <= m) b = x; else break; } return b; };
  const recentRain = m => H.filter(x => { const t = mins(x.t); return t <= m && t > m - 180; }).reduce((a, x) => a + (n(x.Pl) ?? n(x.P) ?? 0), 0);
  function env(m) {
    const x = rowAt(m), Ta = n(x.T), Tr = n(x.Tr) ?? Ta, Pl = n(x.Pl) ?? n(x.P) ?? 0, snow = (n(x.snow) || 0) > 0.05 || [71, 73, 75, 77, 85, 86].includes(n(x.code));
    const iceLv = x.ice && finite(x.ice.level) ? x.ice.level : 0, fz = [56, 57, 66, 67].includes(n(x.code)), acc = recentRain(m);
    const surf = fz || iceLv >= 2 || (Tr != null && Tr <= 0 && (Pl >= 0.1 || acc >= 0.3)) ? 'ice' : snow ? 'snow' : Pl >= 2 && acc >= 6 ? 'pool' : Pl >= 2 ? 'heavy' : Pl >= 0.2 ? 'rain'
      : acc >= 0.3 || (n(x.RH) != null && x.RH >= 95) ? 'damp' : 'dry';
    // signalement terrain de l'utilisateur (≤ 60 min) : aggrave l'état de surface, jamais ne l'améliore ; brouillard = humidité accrue
    const RK = { ice: 'ice', snow: 'snow', rain: 'rain', wet: 'damp', slippery: 'damp', fog: 'damp', lowvis: 'damp' }, ORD = ['dry', 'damp', 'rain', 'heavy', 'pool', 'snow', 'ice'];
    let sf = surf; (inp.reports || []).forEach(r => { const t = mins(r.at), k = RK[r.kind]; if (k && Number.isFinite(t) && Math.abs(m - t) <= 60 && ORD.indexOf(k) > ORD.indexOf(sf)) sf = k; });
    return { x, Ta, Tr, Tenv: (Ta + Tr) / 2, Pl, acc, surf: sf, reported: sf !== surf, gust: n(x.gust), rad: n(x.rad), RH: n(x.RH), t: x.t };
  }
  const SURF_TXT = { dry: 'sec', damp: 'humide', rain: 'pluie', heavy: 'pluie forte', pool: 'eau stagnante probable', snow: 'neige', ice: 'verglas possible' };
  /* ---------- 3. pression (saisie ou estimée, jamais « réelle ») ---------- */
  const target = typeof pressTarget === 'function' ? pressTarget(tire.press) : null, pc = tire.pchk || {}, Tchk = n(pc.T);
  const pAbs = 1.013;
  // une seule formule de pression pour toute l'app : pressLoss (engine.js), loi des gaz à volume constant
  const coldAt = Tenv => target == null || Tchk == null ? null : target - (typeof pressLoss === 'function' ? pressLoss(target, Tchk, Tenv) : (target + pAbs) * (Tchk - Tenv) / (273.15 + Tchk));
  /* ---------- 4. dynamique thermique ---------- */
  function kindOf(v) { return v == null ? null : v < 45 ? 'ville' : v < 80 ? 'route' : 'autoroute'; }
  const fType = { summer: 1, allseason: 1.05, winter: 1.1 }[type];
  function eqDrive(e, kind, Tnow) {
    const K = TL_KIND[kind], fW = { dry: 1, damp: 0.85, rain: 0.65, heavy: 0.5, pool: 0.5, snow: 0.5, ice: 0.6 }[e.surf], fV = e.gust != null && e.gust >= 50 ? 0.92 : 1;
    const pc0 = coldAt(e.Tenv), fP = pc0 != null && target != null && pc0 < target - 0.2 ? 1.12 : 1;
    return { Teq: e.Tenv + K.dT * fW * fV * fP * fType, tauKm: K.tauKm, v: K.v, fW, fP };
  }
  function eqPark(e) { return { Teq: e.Tenv + (e.rad != null && e.rad > 300 ? 3 : 0), tau: TL_TAU_PARK * (['rain', 'heavy', 'pool'].includes(e.surf) ? 0.8 : 1) }; }
  // fait évoluer T de m0 à m1 ; drive = { kind, v } ou null (arrêt) ; renvoie T et la distance parcourue
  function evolve(T, m0, m1, drive) {
    let m = m0, km = 0;
    while (m < m1 - 1e-6) {
      const dt = Math.min(2, m1 - m), e = env(m);
      if (drive) { const q = eqDrive(e, drive.kind, T), v = drive.v || q.v, dk = v * dt / 60; T = q.Teq + (T - q.Teq) * Math.exp(-dk / q.tauKm); km += dk; }
      else { const q = eqPark(e); T = q.Teq + (T - q.Teq) * Math.exp(-dt / q.tau); }
      m += dt;
    }
    return { T, km };
  }
  // état de départ : mémoire thermique (dernier état connu) sinon pneu froid à l'environnement (hypothèse prudente)
  const hist = inp.history && finite(inp.history.T) && Number.isFinite(mins(inp.history.at)) && mins(inp.history.at) <= nowM ? inp.history : null;
  const drv = inp.drive && inp.drive.active && Number.isFinite(mins(inp.drive.since)) ? inp.drive : null;
  const why = [];
  const eNow = env(nowM);
  let T, phase, parkedMin = null, drivenKm = null, drivenMin = null, driveKind = null;
  if (drv) {
    const since = mins(drv.since), v = n(drv.speedKmh), kind = drv.kind && TL_KIND[drv.kind] ? drv.kind : kindOf(v) || 'route';
    // avant le départ : depuis la mémoire si elle existe, sinon froid
    let T0 = env(since).Tenv, t0 = since; if (hist && mins(hist.at) <= since) T0 = evolve(hist.T, mins(hist.at), since, null).T;
    else if (hist && mins(hist.at) <= nowM) { T0 = hist.T; t0 = mins(hist.at); }   // mémoire enregistrée pendant ce roulage : on repart d'elle (départ à chaud conservé)
    const r = evolve(T0, t0, nowM, { kind, v: v || TL_KIND[kind].v });
    T = r.T; phase = 'driving'; drivenMin = nowM - since; drivenKm = n(drv.km) ?? r.km; driveKind = kind;
    why.push(`En roulage depuis ${Math.round(drivenMin)} min (≈ ${r1(drivenKm)} km, ${TL_KIND[kind].label}${v ? ' ≈ ' + r0(v) + ' km/h' : ', vitesse supposée'})`);
  } else if (hist) {
    const at = mins(hist.at); parkedMin = nowM - at;
    T = evolve(hist.T, at, nowM, null).T; phase = 'parked';
    why.push(`À l’arrêt depuis ${parkedMin < 90 ? Math.round(parkedMin) + ' min' : r1(parkedMin / 60) + ' h'} (dernier état estimé ${r0(hist.T)} °C)`);
  } else { T = eNow.Tenv; phase = 'unknown'; why.push('Historique de roulage inconnu : pneu supposé froid (hypothèse prudente)'); }
  why.unshift(`Air : ${r1(eNow.Ta)} °C`, `Chaussée estimée : ${r1(eNow.Tr)} °C`);
  why.push(`Pneu ${TYPES[type]}${uhp ? ' haute performance (indice ' + (d.si || 'ZR') + ')' : ''}`, `Chaussée : ${SURF_TXT[eNow.surf]}${eNow.reported ? ' (signalée par vous)' : ''}`);
  /* ---------- 5. incertitude, état, fenêtre ---------- */
  const stale = finite(inp.ageMin) && inp.ageMin > 90;
  // l'incertitude sur l'état de départ inconnu s'estompe avec la distance roulée (même constante que l'échauffement)
  const unk = km => phase === 'unknown' || (phase === 'driving' && !hist) ? 3 * Math.exp(-(km || 0) / 10) : 0;
  const u = 3 + 0.25 * Math.abs(T - eNow.Tenv) + unk(drivenKm) + (stale ? 3 : 0);
  const lo = T - u, hi = T + u;
  const cls = t => t < win[0] ? 0 : t < win[1] ? 1 : t < win[2] ? 2 : t < win[3] ? 3 : 4;
  // prudence : le bas de plage décide du froid ; la surchauffe se juge sur l'estimation centrale, puis le haut de plage aggrave
  const stateOf = (t, uu) => { const a = cls(t - uu); if (a <= 1) return a; const c = cls(t); return c >= 3 ? Math.max(c, cls(t + uu)) : 2; };
  const st = stateOf(T, u);
  const stLv = s => s === 2 ? 0 : s === 1 || s === 3 ? 1 : s === 4 ? 3 : type === 'winter' ? 1 : 2;
  const range = [Math.floor(lo), Math.ceil(hi)];
  // position sur l'échelle froid → très chaud (0 à 1) pour la jauge
  const pos = clamp((T - (win[0] - 10)) / ((win[3] + 10) - (win[0] - 10)), 0, 1);
  const marks = [win[0], win[1], win[2], win[3]].map(t => clamp((t - (win[0] - 10)) / ((win[3] + 10) - (win[0] - 10)), 0, 1));
  /* ---------- 5 bis. tendance (ce que fait la température), distincte de l'état (où elle se situe) ---------- */
  let trend, eq, ambient = false;
  if (phase === 'driving') {
    const q = eqDrive(eNow, driveKind, T), gap = q.Teq - T, rise = q.Teq - eNow.Tenv; eq = q.Teq;
    trend = Math.abs(gap) <= Math.max(TL_SETTLE * Math.abs(rise), 1) ? 'stable' : gap > 0 ? 'heating' : 'cooling';
  } else {
    const q = eqPark(eNow); eq = q.Teq;
    ambient = Math.abs(T - eNow.Tenv) <= TL_BASE_U;
    trend = !ambient && T - q.Teq > 0 ? 'cooling' : 'rest';
  }
  const lvlSuffix = st === 0 || st >= 3 ? ' · ' + TL_LEVEL_TXT[st] : '';
  // sans historique ni roulage suivi, « au repos » serait plus certain que les données : la température est seulement SUPPOSÉE ambiante
  const stateTxt = trend === 'rest' && ambient ? (phase === 'unknown' ? 'Supposé ambiant' : 'Au repos · ambiant') + lvlSuffix : `${TL_TREND_TXT[trend]} · ${TL_LEVEL_TXT[st]}`;
  why.push(phase === 'driving'
    ? trend === 'stable' ? `Tendance : stabilisée — l’équilibre de ce roulage est atteint à ${r0(TL_SETTLE * 100)} % près`
      : `Tendance : ${trend === 'heating' ? 'en chauffe' : 'en refroidissement'} — équilibre de ce roulage ≈ ${r0(eq)} °C, encore ${r0(Math.abs(eq - T))} °C d’écart`
    : trend === 'cooling' ? `Tendance : en refroidissement vers l’ambiante (≈ ${r0(eq)} °C)` : `Tendance : au repos${ambient ? (phase === 'unknown' ? ' ; température supposée ambiante (aucun historique d’arrêt connu)' : ', gomme à la température ambiante (± 3 °C)') : ''}`);
  const cT = cls(T);
  if (cT > st) why.push(`Estimation centrale ≈ ${r0(T)} °C (${TL_LEVEL_TXT[cT]}) mais bas de plage ≈ ${r0(lo)} °C : état affiché par prudence (${TL_LEVEL_TXT[st]})`);
  else if (cT < st) why.push(`Estimation centrale ≈ ${r0(T)} °C (${TL_LEVEL_TXT[cT]}) mais haut de plage ≈ ${r0(hi)} °C : état affiché par prudence (${TL_LEVEL_TXT[st]})`);
  if (type === 'summer' && eNow.Tenv < 7) why.push(`Pneu été sous 7 °C (air/chaussée ≈ ${r1(eNow.Tenv)} °C) : adhérence réduite même une fois la gomme stabilisée (règle des 7 °C)`);
  /* ---------- 6. mise en température (plages) ---------- */
  const tripKind = inp.trip && inp.trip.kind && TL_KIND[inp.trip.kind] ? inp.trip.kind : null;
  const kind = driveKind || tripKind || 'route';
  function warmUp(Tstart, e, k) {
    const q = eqDrive(e, k, Tstart), target0 = win[1], Tl = Tstart - u;   // départ prudent : bas de plage
    const fast = { Teq: e.Tenv + (q.Teq - e.Tenv) * 1.2, tauKm: q.tauKm * 0.8 }, slow = { Teq: e.Tenv + (q.Teq - e.Tenv) * 0.8, tauKm: q.tauKm * 1.3 };
    if (Tl >= target0) return { reached: true };
    if (Tstart >= target0) return { marginal: true, central: Tstart, low: Tl };   // estimation centrale déjà dans la plage : seule la marge d'incertitude passe sous le seuil
    const kmTo = p => p.Teq <= target0 ? Infinity : p.tauKm * Math.log((p.Teq - Tl) / (p.Teq - target0));
    const a = kmTo(fast), b = kmTo(slow), v = q.v;
    if (!Number.isFinite(a)) return { never: true, Teq: q.Teq };
    return { km: [Math.max(1, Math.floor(a)), Number.isFinite(b) ? Math.ceil(b) : null], min: [Math.max(1, Math.floor(a / v * 60)), Number.isFinite(b) ? Math.ceil(b / v * 60) : null], kind: k, v };
  }
  const warm = warmUp(T, eNow, kind);
  warm.hyp = driveKind ? null : tripKind ? `type de route du prochain trajet : ${TL_KIND[tripKind].label}` : 'hypothèse : route (≈ 70 km/h), aucun trajet connu';
  if (st >= 2 && drv) {   // déjà dans la fenêtre : depuis quand (approximatif)
    const since = mins(drv.since); let Tt = hist && mins(hist.at) <= since ? evolve(hist.T, mins(hist.at), since, null).T : env(since).Tenv, m = since;
    while (m < nowM && Tt - u < win[1]) { Tt = evolve(Tt, m, m + 1, { kind, v: n(drv.speedKmh) || TL_KIND[kind].v }).T; m += 1; }
    warm.sinceMin = Math.max(0, Math.round(nowM - m));
  }
  // refroidissement (à l'arrêt) : part de l'échauffement conservée
  let cool = null;
  if (phase === 'parked') {
    const kept = Math.abs(hist.T - eNow.Tenv) < 1 ? 0 : clamp((T - eNow.Tenv) / (hist.T - eNow.Tenv), 0, 1);
    cool = { kept: Math.round(kept * 100), label: kept >= 0.6 ? 'Température conservée' : kept >= 0.2 ? 'Refroidissement modéré' : 'Retour proche de l’état froid' };
  }
  /* ---------- 7. adhérence, freinage, aquaplaning ---------- */
  const tread = n(tire.tread);
  function aquaOf(e, k) {
    if (e.Pl < 0.2 && e.acc < 1) return { lv: 0, word: 'Faible', why: ['Pas de pluie ni d’eau accumulée'] };
    let R = e.Pl >= 7.6 ? 4 : e.Pl >= 4 ? 3 : e.Pl >= 2 ? 2 : e.Pl >= 0.2 ? 1 : 0; const w = [`Pluie ${r1(e.Pl)} mm/h`];
    if (e.acc >= 6) { R++; w.push(`Eau accumulée ≈ ${r0(e.acc)} mm sur 3 h`); }
    if (k === 'autoroute') { R++; w.push('Vitesse élevée (autoroute)'); } else if (k === 'ville') { R--; w.push('Vitesse faible (ville)'); }
    if (tread != null) { if (tread < 1.6) { R += 2; w.push(`Profondeur ${r1(tread)} mm (sous le minimum légal)`); } else if (tread < 3) { R++; w.push(`Profondeur ${r1(tread)} mm`); } }
    else w.push('Profondeur de sculpture non renseignée');
    if (d && d.w >= 235) { R++; w.push(`Pneu large (${d.w} mm)`); }
    const lv = R <= 0 ? 0 : R <= 2 ? 1 : R === 3 ? 2 : 3;
    return { lv, word: ['Faible', 'Modéré', 'Élevé', 'Critique'][lv], why: w };
  }
  function gripAt(e, s, k) {
    const f = [];
    const S = { dry: 1, damp: 0.85, rain: 0.7, heavy: 0.6, pool: 0.5, snow: type === 'summer' ? 0.2 : type === 'winter' ? 0.5 : pmsf ? 0.45 : 0.4, ice: type === 'winter' ? 0.2 : 0.15 }[e.surf];
    f.push({ k: 'Chaussée ' + SURF_TXT[e.surf], v: S });
    const tf = s === 0 ? { summer: 0.85, allseason: 0.92, winter: 0.97 }[type] : s === 1 ? { summer: 0.93, allseason: 0.96, winter: 0.99 }[type] : s === 3 ? 0.97 : s === 4 ? 0.9 : 1;
    f.push({ k: 'Gomme ' + ['froide', 'sous la plage favorable', 'dans sa fenêtre favorable', 'chaude', 'très chaude'][s], v: tf });
    if (type === 'summer' && e.Tenv < 7) f.push({ k: `Pneu été sous 7 °C (${r1(e.Tenv)} °C air/chaussée)`, v: 0.9 });
    if (type === 'winter' && e.Ta > 20) f.push({ k: `Pneu hiver au-dessus de 20 °C`, v: 0.92 });
    const wet = !['dry'].includes(e.surf);
    if (wet && tread != null && tread < 3) f.push({ k: `Profondeur ${r1(tread)} mm sur sol mouillé`, v: tread < 1.6 ? 0.7 : 0.85 });
    const p = coldAt(e.Tenv); if (p != null && p < target - 0.3) f.push({ k: `Pression estimée ≈ ${r1(p)} bar (cible ${r1(target)})`, v: 0.95 });
    const mu = f.reduce((a, x) => a * x.v, 1), lv = mu >= 0.9 ? 0 : mu >= 0.72 ? 1 : mu >= 0.5 ? 2 : 3;
    const dom = f.filter(x => x.v < 1).sort((a, b) => a.v - b.v)[0] || null;
    // distances : seulement sur sec/humide/pluie, jamais sur neige ou verglas. μ = plage « sec » × adhérence relative.
    let dist = null;
    if (!['snow', 'ice'].includes(e.surf)) {
      // références : pneu en température, chaussée sèche puis mouillée ; « maintenant » : référence sèche × adhérence relative
      const g = 9.81, v = 80 / 3.6, dd = mu0 => Math.round(v * v / (2 * mu0 * g));
      dist = { v: 80, now: [dd(TL_MU.dry[1] * mu), dd(TL_MU.dry[0] * mu)], dry: [dd(TL_MU.dry[1]), dd(TL_MU.dry[0])], wet: [dd(TL_MU.wet[1]), dd(TL_MU.wet[0])], react: Math.round(v) };
    }
    const aqua = aquaOf(e, k);
    // barres de 0 à 10, chacune avec sa raison
    const pctTxt = x => `${x.k} : ×${Math.round(x.v * 100)} %`;
    const bar = x => clamp(Math.round(x * 10), 0, 10), word = b => b >= 9 ? 'Excellente' : b >= 7 ? 'Bonne' : b >= 5 ? 'Moyenne' : b >= 3 ? 'Faible' : 'Très faible';
    const snowTr = e.surf === 'snow' && type === 'summer' ? 0.75 : 1, tfLat = tf * tf;   // motricité été sur neige plus faible ; froid plus sensible en virage
    const gust = e.gust == null ? 1 : e.gust >= 90 ? 0.5 : e.gust >= 70 ? 0.7 : e.gust >= 55 ? 0.85 : 1, aq = [1, 0.85, 0.65, 0.45][aqua.lv];
    const bars = [
      { id: 'trac', label: 'Accélération', b: bar(mu * snowTr), why: [...f.map(pctTxt), snowTr < 1 ? 'Pneu été sur neige : motricité réduite ×75 %' : null].filter(Boolean) },
      { id: 'brake', label: 'Freinage', b: bar(mu), why: f.map(pctTxt) },
      { id: 'corner', label: 'Virage', b: bar(mu / tf * tfLat), why: [...f.map(pctTxt), tf < 1 ? 'Gomme sous sa plage favorable : effet renforcé en appui latéral' : null].filter(Boolean) },
      { id: 'stab', label: 'Stabilité', b: bar(gust * aq), why: [e.gust != null ? `Rafales ${r0(e.gust)} km/h` : 'Rafales non fournies', `Aquaplaning ${aqua.word.toLowerCase()}`] },
      { id: 'aqua', label: 'Aquaplaning', b: bar(aq), why: aqua.why }
    ].map(x => ({ ...x, word: x.id === 'aqua' ? ['Bonne', 'Vigilance', 'Risque élevé', 'Critique'][aqua.lv] : word(x.b), lv: x.id === 'aqua' ? aqua.lv : x.b >= 9 ? 0 : x.b >= 7 ? 1 : x.b >= 5 ? 2 : 3 }));
    return { mu, lv, word: ['Optimal', 'Bon', 'Dégradé', 'Très dégradé'][lv], f, dom, dist, aqua, bars };
  }
  const gNow = gripAt(eNow, st, kind);
  /* ---------- 8. trajet : état le long du parcours ---------- */
  let trip = null;
  const tp = inp.trip && Array.isArray(inp.trip.points) && inp.trip.points.length ? inp.trip : null;
  if (tp) {
    const pts = tp.points.map(p => ({ ...p, m: mins(p.t) })).filter(p => Number.isFinite(p.m)).sort((a, b) => a.m - b.m);
    const totKm = n(tp.km);
    const kmOf = p => n(p.km) ?? (totKm != null && n(p.f) != null ? p.f * totKm : null);
    let Tt = T, mPrev = nowM, prevWet = null; const rows = [];
    const startM = pts[0].m;
    if (startM > nowM) Tt = evolve(T, nowM, startM, phase === 'driving' ? { kind, v: TL_KIND[kind].v } : null).T;   // attente jusqu'au départ
    mPrev = Math.max(nowM, startM);
    pts.forEach((p, i) => {
      if (i > 0) {
        const a = pts[i - 1], dk = kmOf(p) != null && kmOf(a) != null ? kmOf(p) - kmOf(a) : null, dmin = p.m - a.m;
        const v = dk != null && dmin > 0 ? dk / dmin * 60 : null, k = kindOf(v) || tripKind || 'route';
        if (p.m > mPrev) Tt = evolve(Tt, mPrev, p.m, { kind: k, v: v || TL_KIND[k].v }).T;
        p.kind = k;
      }
      mPrev = Math.max(mPrev, p.m);
      const e = env(p.m), uu = 3 + 0.25 * Math.abs(Tt - e.Tenv) + unk(kmOf(p) != null && kmOf(pts[0]) != null ? kmOf(p) - kmOf(pts[0]) : 0);
      const s = stateOf(Tt, uu);
      const g = gripAt(e, s, p.kind || 'route'), wet = !['dry', 'damp'].includes(e.surf);
      const events = [];
      if (prevWet === false && wet) events.push({ ic: '🌧', text: `Début ${SURF_TXT[e.surf]}`, impact: ['refroidissement progressif de la gomme', 'freinage mouillé dégradé', 'aquaplaning en hausse'] });
      if (prevWet === true && !wet) events.push({ ic: '🌤', text: 'Fin de la pluie', impact: ['la gomme se réchauffe à nouveau', 'chaussée encore humide un moment'] });
      prevWet = wet;
      rows.push({ t: hm(p.m), name: p.name || null, km: kmOf(p) != null ? Math.round(kmOf(p)) : null, state: TL_STATES[s], s, lv: stLv(s), brakeLv: g.lv, range: [Math.floor(Tt - uu), Math.ceil(Tt + uu)], brake: g.word, events, kind: p.kind || null });
    });
    trip = { label: tp.label || 'trajet', dep: hm(pts[0].m), arr: hm(pts[pts.length - 1].m), rows, startS: rows[0].s, endS: rows[rows.length - 1].s };
  }
  /* ---------- 9. comparaison départ / maintenant ---------- */
  const cmpRow = (lbl, a, b) => ({ label: lbl, a, b });
  const cell = (lv, word) => ({ lv, word });
  let compare = null;
  {
    let aLbl, bLbl, sA, sB, eA, eB, kA = kind, kB = kind;
    if (drv) { aLbl = 'Départ'; bLbl = 'Maintenant'; const since = mins(drv.since), Ts = hist && mins(hist.at) <= since ? evolve(hist.T, mins(hist.at), since, null).T : env(since).Tenv; eA = env(since); sA = stateOf(Ts, u); sB = st; eB = eNow; }
    else if (trip) { aLbl = `Départ ${trip.dep}`; bLbl = `Arrivée ${trip.arr}`; sA = trip.startS; sB = trip.endS; eA = env(mins(inp.trip.points[0].t)); eB = env(mins(inp.trip.points[inp.trip.points.length - 1].t)); }
    else { aLbl = 'Maintenant'; bLbl = 'Après ~15 km'; sA = st; eA = eB = eNow; const r = evolve(T, nowM, nowM + 15 / TL_KIND[kind].v * 60, { kind, v: TL_KIND[kind].v }); sB = stateOf(r.T, u); }
    const wetE = e => ({ ...e, surf: e.surf === 'dry' || e.surf === 'damp' ? 'rain' : e.surf, Pl: Math.max(e.Pl, 1) }), dryE = e => ({ ...e, surf: 'dry' });
    const A = { d: gripAt(dryE(eA), sA, kA), w: gripAt(wetE(eA), sA, kA), n: gripAt(eA, sA, kA) }, B = { d: gripAt(dryE(eB), sB, kB), w: gripAt(wetE(eB), sB, kB), n: gripAt(eB, sB, kB) };
    compare = { a: aLbl, b: bLbl, rows: [
      cmpRow('Température', cell(stLv(sA), TL_STATES[sA].replace('Pneu ', '').replace('Fenêtre ', '')), cell(stLv(sB), TL_STATES[sB].replace('Pneu ', '').replace('Fenêtre ', ''))),
      cmpRow('Freinage sec', cell(A.d.lv, A.d.word), cell(B.d.lv, B.d.word)),
      cmpRow('Freinage pluie', cell(A.w.lv, A.w.word), cell(B.w.lv, B.w.word)),
      cmpRow('Virage', cell(A.n.bars[2].lv, A.n.bars[2].word), cell(B.n.bars[2].lv, B.n.bars[2].word)),
      cmpRow('Aquaplaning', cell(A.n.aqua.lv, A.n.aqua.word), cell(B.n.aqua.lv, B.n.aqua.word))] };
  }
  /* ---------- 10. pression ---------- */
  let press;
  if (target == null) press = { known: false, text: 'Pression cible non renseignée : aucune estimation de pression (Réglages → voiture).' };
  else {
    const cold = coldAt(eNow.Tenv);   // à chaud : ordre de grandeur constructeur (+0,1 à +0,3 bar en roulage), jamais tiré de la gomme estimée
    const notes = [`Cible saisie : ${r1(target)} bar à froid (pression enregistrée par l’utilisateur)`];
    if (Tchk == null) notes.push('Température du dernier contrôle inconnue : variation non estimée');
    else {
      notes.push(`Dernier contrôle : ${pc.date || 'date inconnue'} à ${r1(Tchk)} °C`);
      notes.push(`À froid maintenant (${r1(eNow.Tenv)} °C) : ≈ ${r1(cold - 0.05)}–${r1(cold + 0.05)} bar (estimation, loi des gaz : ≈ 0,1 bar par 10 °C)`);
      if (phase === 'driving') notes.push(`En roulage : ≈ ${r1(cold + 0.1)}–${r1(cold + 0.3)} bar (ordre de grandeur : +0,1 à +0,3 bar à chaud, aucun capteur) ; une hausse à chaud est normale, ne jamais dégonfler à chaud`);
      if (Tchk - eNow.Tenv >= 10) notes.push('Contrôlée par temps plus chaud : la pression baisse avec la saison, à revérifier à froid');
    }
    press = { known: true, target, cold, low: cold != null && cold < target - 0.2, notes, src: 'saisie utilisateur + estimation Race Control (aucun capteur)' };
  }
  /* ---------- 11. confiance ---------- */
  const reasons = ['Température du pneu estimée : aucun capteur direct n’est disponible'];
  let score = 3;
  if (phase === 'unknown') { score -= 1; reasons.push('Historique de roulage inconnu (pneu supposé froid)'); }
  if (!modelKnown) { score -= 1; reasons.push('Modèle exact non renseigné : analyse générique de la saison'); }
  else if (!spec) { score -= 0.5; reasons.push('Fiche constructeur non disponible dans Race Control'); }
  if (target == null) { score -= 0.5; reasons.push('Pression cible inconnue'); }
  if (tread == null) { score -= 0.5; reasons.push('Profondeur de sculpture inconnue'); }
  if (stale) { score -= 1; reasons.push(`Météo ancienne (${Math.round(inp.ageMin / 60)} h)`); }
  if (!drv && !tripKind) { score -= 0.5; reasons.push('Type de route supposé (aucun trajet ni roulage en cours)'); }
  // état pneumatique (onglet Pneus) : la qualité et la fraîcheur comptent, pas le nombre de champs remplis
  const st0 = inp.state;
  if (st0 && st0.pressure && target != null) { const c = st0.pressure.check; if (!c || c.fresh === 'stale') { score -= 0.5; reasons.push(c ? `Pression contrôlée il y a ${c.ageD} j` : 'Pression : aucun contrôle daté'); } else if (c.fresh === 'aging') { score -= 0.25; reasons.push(`Pression contrôlée il y a ${c.ageD} j`); } }
  if (st0 && st0.tread && st0.tread.fresh === 'stale') { score -= 0.5; reasons.push(`Profondeur mesurée il y a ${st0.tread.ageD} j`); }
  if (st0 && st0.dot) reasons.push(`Âge : ${st0.dot.txt.replace(/^DOT \d{4} · /, '')} (surveillance, sans effet calculé sur l’adhérence)`);
  if (!drv) score = Math.min(score, 2.4);   // sans roulage suivi au GPS, l'état thermique reste une hypothèse : confiance au plus moyenne
  // axes séparés ; niveau global plafonné à « moyenne » : modèle thermique générique, aucun capteur de pression ni de température
  const axes = [['Données pneu', modelKnown && target != null && tread != null ? 'renseignées dans Pneus' : 'incomplètes'],
    ['Trajet', drv ? (drv.kmSrc === 'route' ? 'roulage suivi, progression sur l’itinéraire' : 'roulage suivi, distance estimée (vol d’oiseau ×1,2)') : tripKind ? 'trajet prévu (agenda)' : 'supposé'],
    ['Météo', stale ? 'ancienne' : 'récente'], ['Modèle thermique', 'générique (estimation Race Control)'], ['Capteur direct', 'non']];
  const confidence = { level: score >= 1.5 ? 'moyenne' : 'faible', score, reasons, axes };
  /* ---------- 12. verdict principal ---------- */
  const limiting = gNow.dom ? (gNow.dom.k.startsWith('Gomme') ? ['gomme froide', 'gomme sous sa plage favorable', 'gomme dans sa fenêtre', 'gomme chaude', 'gomme très chaude'][st] : gNow.dom.k.toLowerCase()) : 'aucun';
  const lvl = Math.max(stLv(st), gNow.lv);
  const hero = { title: tyre.title, size: tyre.size, state: stateTxt, s: st, lvl, emoji: EMO[stLv(st)], range,
    warm: warm.reached ? (warm.sinceMin != null ? `Zone favorable atteinte depuis ~${warm.sinceMin} min` : null) : warm.marginal ? null : warm.never ? 'Zone favorable non atteinte dans ces conditions' : warm.min[1] == null ? `≥ ${warm.min[0]} min · ≥ ${warm.km[0]} km (peut ne pas être atteinte)` : `≈ ${warm.min[0]}–${warm.min[1]} min · ≈ ${warm.km[0]}–${warm.km[1]} km`,
    brake: gNow.word, corner: gNow.bars[2].word, rain: gNow.aqua.lv ? ['Faible', 'Vigilance', 'Risque élevé', 'Critique'][gNow.aqua.lv] : gripAt({ ...eNow, surf: 'rain', Pl: 1 }, st, kind).word, limiting, confidence: confidence.level };
  return { known: true, tyre, spec: specOut, now: inp.now, phase, parkedMin, drivenKm, drivenMin, kind, env: { Ta: eNow.Ta, Tr: eNow.Tr, Tenv: eNow.Tenv, surf: eNow.surf, surfTxt: SURF_TXT[eNow.surf], Pl: eNow.Pl },
    thermal: { T, range, state: stateTxt, level: TL_STATES[st], trend, trendTxt: TL_TREND_TXT[trend], eq: Math.round(eq * 10) / 10, s: st, lv: stLv(st), win, pos, marks, why, uhp }, warm, cool, grip: gNow, trip, compare, press, confidence, hero, state: inp.state || null };
}
