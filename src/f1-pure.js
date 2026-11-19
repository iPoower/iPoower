/* Modules F1 pure experience : projections de lecture UNIQUEMENT.
 * Aucune seconde source de vérité : météo, décision, pneus et débriefs viennent
 * des moteurs existants. Aucune mutation, position GPS ou télémétrie inventée.
 */
'use strict';
const F1Pure = (() => {
  // Politique de fraîcheur (valeurs de Reliability.FRESHNESS, vérifiées par tests/test_reliability.js) : ≤ 15 min frais · ≤ 60 min à confirmer · au-delà périmé.
  const STALE_AFTER_MIN = 60;
  const FEATURES = Object.freeze([
    { id: 'raceEngineer', title: 'Ingénieur de course', view: 'pneus', description: 'Briefing décisionnel, vocal sur demande' },
    { id: 'trackConditions', title: 'État de la route', view: 'meteo', description: 'Lecture météo du trajet par secteurs' },
    { id: 'tyreManagement', title: 'Gestion des pneus', view: 'pneus', description: 'État et actions pneus réellement renseignés' },
    { id: 'strategyAB', title: 'Stratégie A/B', view: 'trajet', description: 'Comparer les voitures sur le même trajet' },
    { id: 'theGarage', title: 'Le garage', view: 'garage', description: 'État technique des voitures enregistrées' },
    { id: 'telemetryReplay', title: 'Relecture du trajet', view: 'analyse', description: 'Retour terrain, sans capteurs imaginaires' }
  ]);
  const finite = Number.isFinite, text = x => typeof x === 'string' ? x : '';
  const level = x => finite(x) ? Math.max(0, Math.min(3, Math.floor(x))) : null;
  const label = l => ['RAS', 'VIGILANCE', 'PRUDENCE', 'DANGER'][l] || 'INDISPONIBLE';   // échelle unique de l'app
  const condition = key => ({ wet: 'Chaussée humide', rain: 'Pluie', fog: 'Brume / brouillard', snow: 'Neige', ice: 'Verglas' }[key] || text(key));
  function raceEngineer({ decision, confidence, trip, car, frost, when } = {}) {
    if (!decision || !confidence) return { state: 'indisponible', title: 'Briefing indisponible', lines: ['En attente du cockpit décisionnel.'] };
    const risk = level(decision.displayLevel);
    let action;
    if (confidence.level >= 2) action = 'Ne pas déduire de feu vert : actualiser les données et confirmer les pneus ou le trajet.';
    else if (risk >= 3) action = 'Danger identifié : reconsidérer le départ ou le parcours ; privilégier la sécurité.';
    else if (risk >= 2) action = 'Prudence renforcée : vérifier les conditions réelles avant de partir.';
    else if (risk >= 1) action = 'Vérifier le point de vigilance avant le départ et adapter la conduite.';
    else action = 'Aucune alerte critique identifiée ; respecter les conditions réelles.';
    const route = trip && trip.to ? 'Prochain trajet : ' + text(trip.to) + (trip.dep ? ' · départ prévu ' + (text(when) || text(trip.dep).slice(11, 16)) : '') : 'Aucun trajet immédiat identifié.';
    // Fenêtre DU TRAJET (frostRisk du moteur) : jamais la température « maintenant » pour un départ plus tard (constat : 4,8 °C
    // retenus pour un départ à 06:30 dont la chaussée estimée était proche du gel).
    const num = v => typeof v === 'number' && Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1).replace('.', ',') : '—';
    // Vocabulaire unique du moteur (FROST_WORDS) ; copie de repli identique quand f1-pure est chargé seul (tests isolés).
    const frostTxt = typeof FROST_WORDS !== 'undefined' ? FROST_WORDS : { sous0: 'gel · chaussée sous 0 °C possible', possible: 'gel possible', incertitude: 'gel possible (marge de prudence)', marge: 'pas de gel attendu (marge faible)', aucun: 'aucun risque de gel' };
    // « aucun risque de gel » : limité à la fenêtre du trajet, écrit (A4, mission du 14/11).
    const frostWord = k => k === 'aucun' || k === 'marge' ? frostTxt[k] + ' sur cette fenêtre' : frostTxt[k];
    const frostLine = frost && frostTxt[frost.key] ? 'Fenêtre du trajet : air min ' + num(frost.airMin) + ' °C · chaussée estimée min ' + num(frost.roadMin) + ' °C (marge de prudence ± ' + (frost.margin) + ' °C) · ' + frostWord(frost.key) : null;
    const confidenceLine = 'Confiance : ' + text(confidence.label || 'à confirmer') + (confidence.reason ? ' · ' + text(confidence.reason) : '');
    return { state: risk >= 2 || confidence.level >= 2 ? 'prudence' : 'information',
      title: risk == null ? 'Analyse en attente' : label(risk),
      lines: [route, ...(frostLine ? [frostLine] : []), car ? 'Voiture : ' + text(car.short || car.name || car.id) : 'Voiture active à confirmer.', confidenceLine,
        'Priorité : ' + text(decision.reason || 'Conditions à vérifier.'), action],
      action };
  }
  // La segmentation ne prétend jamais représenter des frontières géographiques
  // précises : uniquement les points météo réellement disponibles du trajet.
  const FZ_F1 = new Set([56, 57, 66, 67]);
  // Pluie d'une heure ou d'une fenêtre (A5, mission du 14/11) : MÊMES seuils que le poste Météo (wxdesk, ROAD_POLICY.rainMmH) :
  // ≥ 0,2 mm/h VIGILANCE, ≥ 2 mm/h PRUDENCE. Lue par « État de la route » ET par le risque global du trajet (tripRisk).
  const RAIN_MMH = 0.2, RAIN_STRONG_MMH = 2;
  const rainLevel = mm => finite(mm) ? (mm >= RAIN_STRONG_MMH ? 2 : mm >= RAIN_MMH ? 1 : 0) : 0;
  const rainOf = x => finite(x.Pl) ? x.Pl : finite(x.P) && !(finite(x.snow) && x.snow > 0.05) ? x.P : null;
  // Chiffres d'un secteur (18/11/2026) : heures de passage et kilomètres du parcours (legSeq), pire pluie, chaussée estimée la
  // plus froide, visibilité la plus faible, rafale la plus forte. Valeur absente = null, jamais inventée.
  const hhmm = t => typeof t === 'string' && /T\d{2}:\d{2}/.test(t) ? t.slice(11, 16) : null;
  function sectorFigures(qs, points) {
    const pick = (f, k) => { const v = points.map(x => x[k]).filter(finite); return v.length ? f(...v) : null; };
    const rains = points.map(rainOf).filter(finite), km = qs.map(q => q.km).filter(finite);
    // Heure de la prévision lue (« 06 h ») : repère honnête quand le point n'a pas d'heure de passage (trajet domicile-travail).
    const hh = x => x && typeof x.t === 'string' && /T\d{2}/.test(x.t) ? x.t.slice(11, 13) + ' h' : null;
    return { from: hhmm(qs.length && qs[0].t), to: hhmm(qs.length && qs[qs.length - 1].t), h0: hh(points[0]), h1: hh(points[points.length - 1]),
      km0: km.length ? Math.min(...km) : null, km1: km.length ? Math.max(...km) : null,
      rain: rains.length ? Math.max(...rains) : null, road: pick(Math.min, 'Tr'), vis: pick(Math.min, 'vis'), gust: pick(Math.max, 'gust') };
  }
  // Même trajet, départ décalé d'heures ENTIÈRES (prévisions horaires) : chaque point garde sa série et sa place sur le parcours,
  // seule l'heure avance d'un cran. Heure absente ou série non contiguë (changement d'heure, fin de prévision) : null, jamais deviné.
  const shiftTs = (t, h) => { const ms = Date.parse(String(t).slice(0, 16) + ':00Z'); return finite(ms) ? new Date(ms + h * 3600e3).toISOString().slice(0, 16) : null; };
  function shiftSeq(seq, hours) {
    if (!Array.isArray(seq) || !seq.length || !Number.isInteger(hours)) return null;
    const out = [];
    for (const q of seq) {
      if (!q || !Array.isArray(q.hs) || !Number.isInteger(q.i)) return null;
      const a = q.hs[q.i], b = q.hs[q.i + hours];
      if (!a || !b || typeof a.t !== 'string' || typeof b.t !== 'string' || shiftTs(a.t, hours) !== b.t.slice(0, 16)) return null;
      out.push({ ...q, i: q.i + hours, ...(typeof q.t === 'string' ? { t: shiftTs(q.t, hours) } : {}) });
    }
    return out;
  }
  // Meilleur départ : la MÊME lecture (trackConditions, mêmes seuils que le risque global) à −1 h, à l'heure prévue et à +1 h.
  // Conseillé seulement s'il fait baisser le niveau ; à égalité l'horaire prévu reste (jamais de déplacement pour rien).
  function departureOptions(seq, { ageMin = null, shifts = [-1, 1] } = {}) {
    const read = h => {
      const s = h ? shiftSeq(seq, h) : seq, x = s && trackConditions(s, { ageMin });
      if (!x || !x.available) return { shift: h, available: false };
      const worst = x.sectors.reduce((m, z) => !m || z.level > m.level ? z : m, null);
      const rain = Math.max(...x.sectors.map(z => finite(z.figures && z.figures.rain) ? z.figures.rain : 0));
      return { shift: h, available: true, level: worst.level, label: label(worst.level), cause: worst.level ? worst.notes[0] || null : null,
        sector: worst.index, rain, dep: s[0] && typeof s[0].t === 'string' ? s[0].t : null, sectors: x.sectors };
    };
    const planned = read(0);
    if (!planned.available) return null;
    const options = [...shifts.filter(h => h < 0).sort((a, b) => a - b).map(read), planned, ...shifts.filter(h => h > 0).sort((a, b) => a - b).map(read)];
    const better = options.filter(o => o.available && o.shift && o.level < planned.level)
      .sort((a, b) => a.level - b.level || a.rain - b.rain || Math.abs(a.shift) - Math.abs(b.shift) || a.shift - b.shift)[0] || null;
    return { planned, options, best: better, needed: planned.level >= 1 };
  }
  function trackConditions(seq, { ageMin = null } = {}) {
    // Points du parcours avec leur heure de passage et leur kilomètre (legSeq) : seuls les points lisibles sont gardés.
    const pts = Array.isArray(seq) ? seq.filter(q => q && q.hs && q.hs[q.i]) : [], rows = pts.map(q => q.hs[q.i]);
    if (!rows.length || ageMin != null && (!finite(ageMin) || ageMin > STALE_AFTER_MIN))
      return { available: false, reason: rows.length ? 'Prévisions de parcours trop anciennes.' : 'Aucun point météo de parcours disponible.', sectors: [] };
    const count = Math.min(3, rows.length), sectors = [];
    for (let n = 0; n < count; n++) {
      const a = Math.floor(n * rows.length / count), b = Math.floor((n + 1) * rows.length / count), points = rows.slice(a, b), qs = pts.slice(a, b);
      let worst = 0; const signals = new Set();
      points.forEach(x => {
        // Gel : niveau de la règle unique (frostHour) quand le moteur est chargé ; le verglas estimé n'en fixe plus le niveau.
        const fh = typeof frostHour === 'function' && finite(x.Tr) ? frostHour([x], 0) : null;
        if (fh) { if (fh.level >= 1) { worst = Math.max(worst, fh.level); signals.add((fh.level >= 2 ? 'Gel possible' : 'Gel possible (marge de prudence)') + ' · estimation'); } }
        else if (x.ice && finite(x.ice.level) && x.ice.level >= 1) { worst = Math.max(worst, Math.min(3, x.ice.level + 1)); signals.add('Verglas · risque estimé'); }
        if (FZ_F1.has(x.code)) { worst = 3; signals.add('Pluie verglaçante annoncée'); }
        if (finite(x.vis) && x.vis < 1000) { worst = Math.max(worst, x.vis < 200 ? 3 : 2); signals.add('Visibilité réduite'); }
        { const rl = rainLevel(rainOf(x)); if (rl) { worst = Math.max(worst, rl); signals.add(rl >= 2 ? 'Pluie modérée ou forte prévue' : 'Pluie prévue'); } }
        if (finite(x.snow) && x.snow > 0.05) { worst = Math.max(worst, 2); signals.add('Neige prévue'); }   // même seuil que la synthèse (summarize)
        if (!fh && finite(x.Tr) && x.Tr <= 0) { worst = Math.max(worst, 1); signals.add('Chaussée estimée à 0 °C ou moins'); }
      });
      sectors.push({ index: n + 1, points: points.length, level: worst, label: label(worst), notes: [...signals].slice(0, 3),
        estimated: true, figures: sectorFigures(qs, points) });
    }
    return { available: true, reason: 'Points de prévision existants, secteurs de lecture non géolocalisés.', sectors };
  }
  // Tour du parcours (onglet Trajet, 19/11/2026) : une ligne par point météo réel du trajet, dans l'ordre, avec le secteur de
  // lecture (même découpage que trackConditions), l'heure de passage, les valeurs de l'heure lue et le niveau du point calculé
  // par la MÊME lecture (trackConditions sur ce seul point). Aucune valeur inventée : absente = null.
  function routeTower(seq, { ageMin = null } = {}) {
    const pts = Array.isArray(seq) ? seq.filter(q => q && q.hs && q.hs[q.i]) : [];
    if (!pts.length || ageMin != null && (!finite(ageMin) || ageMin > STALE_AFTER_MIN)) return [];
    const count = Math.min(3, pts.length), sectorOf = k => { for (let n = 0; n < count; n++) if (k < Math.floor((n + 1) * pts.length / count)) return n + 1; return count; };
    return pts.map((q, k) => {
      const x = q.hs[q.i], one = trackConditions([q]), lv = one.available ? one.sectors[0].level : null;
      return { index: k, sector: sectorOf(k), name: text(q.name) || null, km: finite(q.km) ? q.km : null, at: hhmm(q.t) || (typeof x.t === 'string' ? x.t.slice(11, 13) + ' h' : null),
        T: finite(x.T) ? x.T : null, road: finite(x.Tr) ? x.Tr : null, rain: finite(rainOf(x)) ? rainOf(x) : null, vis: finite(x.vis) ? x.vis : null, gust: finite(x.gust) ? x.gust : null,
        level: lv, label: lv == null ? null : label(lv), notes: one.available ? one.sectors[0].notes : [] };
    });
  }
  // Onglet Pneus · épreuve spéciale (19/11/2026) : ruban de surface et notes du copilote tirés des lignes de routeTower
  // (mêmes points, mêmes niveaux, mêmes signaux, mêmes seuils de pluie 0,2 / 2 mm/h). Rien d'inventé : valeur absente = pas de chiffre.
  const SURFACE = { ice: 'GEL POSSIBLE', snow: 'NEIGE', wet: 'MOUILLÉ', damp: 'HUMIDE', dry: 'SEC' };
  function surfaceOf(r) {
    const notes = r && Array.isArray(r.notes) ? r.notes.join(' ') : '';
    if (/Gel|Verglas|verglaçante|0 °C ou moins/.test(notes)) return 'ice';
    if (/Neige/.test(notes)) return 'snow';
    if (!r || !finite(r.rain)) return null;
    return r.rain >= RAIN_STRONG_MMH ? 'wet' : r.rain >= RAIN_MMH ? 'damp' : 'dry';
  }
  function stageSurface(rows) {
    const pts = Array.isArray(rows) ? rows.filter(Boolean) : [], out = [];
    pts.forEach((r, k) => {
      const kind = surfaceOf(r), last = out[out.length - 1];
      if (last && last.kind === kind) last.to = k; else out.push({ kind, label: kind ? SURFACE[kind] : 'INCONNU', from: k, to: k });
    });
    // Part de chaque segment : kilomètres du parcours quand ils sont tous connus et croissants, sinon nombre de points.
    const km = pts.map(r => r.km), byKm = pts.length > 1 && km.every(finite) && km.every((v, i) => !i || v >= km[i - 1]) && km[km.length - 1] > km[0];
    const span = byKm ? km[km.length - 1] - km[0] : pts.length;
    return out.map((s, i) => {
      const a = byKm ? km[s.from] : s.from, b = byKm ? (i + 1 < out.length ? km[out[i + 1].from] : km[km.length - 1]) : s.to + 1;
      return { ...s, kmFrom: finite(km[s.from]) ? km[s.from] : null, kmTo: finite(km[s.to]) ? km[s.to] : null, share: span > 0 ? Math.round(1000 * (b - a) / span) / 10 : 0 };
    });
  }
  function copilotNotes(rows, { dep = null, arr = null, frost = null, tyre = null } = {}) {
    const pts = Array.isArray(rows) ? rows.filter(Boolean) : []; if (!pts.length) return [];
    const fr = v => String(Math.round(v * 10) / 10).replace('.', ','), km = v => finite(v) ? 'km ' + Math.round(v) : null, notes = [];
    const first = pts[0], cond = [first.T != null ? 'air ' + fr(first.T) + ' °C' : null, first.road != null ? 'chaussée ' + fr(first.road) + ' °C' : null].filter(Boolean);
    // Pneus été : mêmes repères que « Quelle voiture prendre ? » (air < 5 °C : route froide ; < 7 °C et chaussée humide : fraîche et humide).
    const Ts = pts.map(r => r.T).filter(finite), Tmin = Ts.length ? Math.min(...Ts) : null, wet = pts.some(r => finite(r.rain) && r.rain >= RAIN_MMH);
    const cold = tyre === 'summer' && Tmin != null ? (Tmin < 5 ? 'Route froide pour des pneus été.' : Tmin < 7 && wet ? 'Route fraîche et humide pour des pneus été.' : null) : null;
    notes.push({ level: first.level, text: 'Départ' + (hhmm(dep) || first.at ? ' ' + (hhmm(dep) || first.at) : '') + (cond.length ? ' · ' + cond.join(', ') : '') + '.' + (cold ? ' ' + cold : '') });
    const groups = [];
    pts.forEach((r, k) => { const g = groups[groups.length - 1]; if (g && g.level === r.level) g.to = k; else groups.push({ level: r.level, from: k, to: k }); });
    groups.forEach((g, i) => {
      const a = pts[g.from], b = pts[g.to], part = pts.slice(g.from, g.to + 1), rains = part.map(r => r.rain).filter(finite), worst = part.reduce((m, r) => !m || (r.level || 0) > (m.level || 0) ? r : m, null);
      const where = groups.length === 1 ? 'Sur tout le parcours' : i === 0 ? (g.from === g.to ? 'Au départ' : km(b.km) ? 'Jusqu’au ' + km(b.km) : 'Secteur S' + a.sector)
        : i === groups.length - 1 ? (g.from === g.to ? 'À l’arrivée' : km(a.km) ? 'Après le ' + km(a.km) : 'Secteur S' + a.sector) : (km(a.km) && km(b.km) ? 'Du ' + km(a.km) + ' au ' + km(b.km) : 'Secteur S' + a.sector);
      const when = i > 0 && a.at ? ', vers ' + a.at : '', rain = rains.length ? Math.max(...rains) : null;
      const what = worst && worst.level && worst.notes && worst.notes.length ? worst.notes.join(' / ') + (rain != null && rain >= RAIN_MMH ? ' (' + fr(rain) + ' mm/h)' : '')
        : rain == null ? (g.level == null ? 'lecture indisponible' : 'RAS') : rain >= RAIN_MMH ? 'pluie ' + fr(rain) + ' mm/h' : 'sec, RAS';
      notes.push({ level: g.level, text: where + when + ' : ' + what + '.' });
    });
    const fl = finite(frost) ? frost : null;
    notes.push({ level: fl, text: 'Arrivée' + (hhmm(arr) ? ' ' + hhmm(arr) : '') + (fl == null ? '.' : fl === 0 ? '. Aucun risque de gel.' : '. Gel : ' + label(fl).toLowerCase() + '.') });
    return notes.map((n, i) => ({ n: i + 1, level: n.level == null ? null : n.level, text: n.text }));
  }
  function tyreManagement(state) {
    if (!state || !state.active) return { available: false, lines: ['Monte active non confirmée : aucun diagnostic pneus.'] };
    const lines = [ 'Monte active : ' + text(state.active.label) ];
    if (state.tread && finite(state.tread.mm)) lines.push('Profondeur la plus faible : ' + state.tread.mm.toFixed(1).replace('.', ',') + ' mm · ' + (state.tread.est ? 'estimée par utilisateur' : 'déclarée mesurée'));
    else lines.push('Profondeur non mesurée.');
    const fr = (v, d) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });   // B5 : « 2,4 bar », « 49 100 km »
    if (state.pressure && finite(state.pressure.target)) lines.push('Pression cible enregistrée : ' + fr(state.pressure.target, 1) + ' bar (pas une mesure actuelle).');
    else lines.push('Pression cible non renseignée.');
    if (state.mount && finite(state.mount.kmSince)) lines.push('Depuis le montage : ' + fr(state.mount.kmSince, 0) + ' km calculés sur les relevés disponibles.');
    if (Array.isArray(state.maint) && state.maint.length) lines.push(...state.maint.slice(0, 3).map(x => text(x.text)));
    return { available: true, lines };
  }
  function strategyAB(trip, activeCarId) {
    const rows = trip && Array.isArray(trip.res) ? trip.res.filter(r => r && r.c && r.w && level(r.w.level) != null) : [];
    const a = rows.find(r => r.c.id === activeCarId) || null, b = rows.find(r => !a || r.c.id !== a.c.id) || null;
    if (!trip || !a || !b) return { available: false, reason: 'Deux évaluations pneumatiques fiables sur le même trajet ne sont pas disponibles.', choices: [] };
    const choices = [a, b].map((r, i) => ({ scenario: i ? 'B' : 'A', car: text(r.c.short || r.c.name || r.c.id), level: level(r.w.level), risk: label(level(r.w.level)) }));
    return { available: true, choices, reason: 'Même origine, même horaire et même météo ; seule la voiture change. Aucun itinéraire alternatif ni gain de temps inventé.' };
  }
  function theGarage(cars) {
    if (!Array.isArray(cars) || !cars.length) return { available: false, cars: [] };
    return { available: true, cars: cars.filter(Boolean).map(car => {
      const t = car.tire || {}, odos = Array.isArray(car.odo) ? (v => car.odo.filter(x => x && !x.void && finite(x.km) && !v.has(x.d + '|' + x.km)))(new Set(car.odo.filter(x => x && x.void).map(x => x.d + '|' + x.km))) : [];   // relevés annulés exclus (Garage.odoLive)
      const odo = odos.reduce((m, x) => !m || x.km > m.km ? x : m, null);
      return { name: text(car.short || car.name || car.id), tyre: [t.brand, t.model].filter(Boolean).join(' ') || 'Pneu non renseigné',
        odo: odo ? odo.km : null, mounted: text(t.mounted) || null, pressure: text(t.press) || null };
    }) };
  }
  function telemetryReplay(entries, compare) {
    const e = Array.isArray(entries) && entries[0];
    if (!e) return { available: false, reason: 'Aucun trajet clôturé dans le journal.' };
    const cmp = typeof compare === 'function' ? compare(e) : null;
    const lines = [
      'Trajet : ' + text(e.name || 'Trajet terminé'),
      e.start && finite(e.start.at) ? 'Départ enregistré et prévision figée.' : 'Départ non déclaré : aucun horaire réel inventé.',
      e.feedback ? 'Retour conducteur : ' + (e.feedback.conditions.length ? e.feedback.conditions.map(condition).join(' · ') : 'aucun phénomène indiqué') : 'Observation du conducteur non renseignée.',
      cmp && cmp.kind === 'unknown' ? 'Prévision non comparable : donnée absente ou trop ancienne.' : cmp && cmp.kind === 'pending' ? 'Comparaison en attente de retour conducteur.' :
        cmp ? 'Comparaison : ' + ({ match: 'concordante', missed: 'phénomène non annoncé', unused: 'alerte non rencontrée', mixed: 'écart mixte' }[cmp.kind] || 'non disponible') : 'Comparaison indisponible.',
      e.end && e.end.thermal ? 'Estimation thermique disponible (modèle, non mesurée).' : 'Pas de mesure thermique enregistrée.'
    ];
    return { available: true, lines, note: 'Relecture du journal local : aucune télémétrie de vitesse, freinage, GPS ou capteur ajoutée.' };
  }
  return { FEATURES, raceEngineer, trackConditions, shiftSeq, departureOptions, routeTower, stageSurface, copilotNotes, tyreManagement, strategyAB, theGarage, telemetryReplay, rainLevel };
})();
