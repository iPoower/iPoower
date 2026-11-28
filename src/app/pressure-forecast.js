// Pression prédictive (28/11/2026, choix du propriétaire) : projection pure, sans accès au stockage ni au réseau.
// Une seule loi physique pour toute l'app : pressLoss (engine.js, loi des gaz à volume constant, pression absolue,
// Kelvin), injectée ici. Trois pressions restent distinctes et ne se remplacent jamais :
//   · la cible plaque (saisie par l'utilisateur, à froid) ;
//   · la dernière mesure réelle au manomètre (pchk : date, température du contrôle, AV, AR) ;
//   · la pression prédite (estimation Race Control) à une température prévue.
// Base de la projection : la mesure quand elle est datée, chiffrée et accompagnée de sa température ; sinon une simulation
// théorique « gonflé à la cible maintenant » (dite comme telle). La perte naturelle (≈ 0,1 bar par mois) et la précision
// du manomètre ne sont pas modélisées : elles abaissent la fiabilité affichée, jamais la valeur.
const PressureForecast = (() => {
  const fin = Number.isFinite, AXLES = ['av', 'ar'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const r2 = v => Math.round(v * 100) / 100;
  // Cible plaque : « 2,3 AV / 2,5 AR » (même lecture que tyreLab) ou une valeur unique pour les deux essieux.
  function targets(text) {
    const s = String(text || ''), N = '(\\d+(?:[.,]\\d+)?)', num = x => parseFloat(x.replace(',', '.')), ok = v => v > 0.8 && v < 5;
    const ax = new RegExp(N + '\\s*(?:bar\\s*)?AV\\b[^]*?' + N + '\\s*(?:bar\\s*)?AR\\b', 'i').exec(s) || new RegExp('AV\\D{0,3}' + N + '[^]*?AR\\D{0,3}' + N, 'i').exec(s);
    if (ax && ok(num(ax[1])) && ok(num(ax[2]))) return { av: num(ax[1]), ar: num(ax[2]) };
    const one = /(\d+(?:[.,]\d+)?)/.exec(s), v = one ? num(one[1]) : null;
    return v != null && ok(v) ? { av: v, ar: v } : null;
  }
  // Fiabilité de la projection : fraîcheur de la mesure, sinon simulation théorique.
  function reliability(meas, measuredNoT) {
    if (!meas) return { level: 'théorique', lv: 0, label: 'Simulation théorique',
      why: measuredNoT ? 'Température du contrôle non renseignée : la mesure ne peut pas être projetée. Simulation depuis la cible plaque.'
        : 'Aucune mesure datée : simulation depuis la cible plaque, comme si tu gonflais maintenant.' };
    const a = meas.ageDays;
    if (a <= 7) return { level: 'bonne', lv: 3, label: 'Fiabilité bonne', why: a <= 1 ? 'Mesure d’hier ou du jour.' : `Mesure d’il y a ${a} jours.` };
    if (a <= 21) return { level: 'moyenne', lv: 2, label: 'Fiabilité moyenne', why: `Mesure d’il y a ${a} jours : la perte naturelle (≈ 0,1 bar par mois) n’est pas comptée.` };
    return { level: 'faible', lv: 1, label: 'Fiabilité faible', why: `Mesure d’il y a ${a} jours : perte naturelle non comptée, projection probablement optimiste. Recontrôle à froid.` };
  }
  // Écart à la cible : la précision d'un manomètre grand public (≈ 0,05 à 0,1 bar) borne la lecture.
  const gapLv = (p, tgt) => p == null || tgt == null ? 0 : p - tgt <= -0.2 ? 2 : p - tgt <= -0.1 ? 1 : 0;
  /**
   * in = { pressText, pchk, hours: [{ t:'YYYY-MM-DDTHH:00', T }], nowStr:'YYYY-MM-DDTHH:MM', nowT, days = 7, pressLoss }
   */
  function project(inp) {
    const loss = inp && inp.pressLoss;
    if (typeof loss !== 'function') return { known: false, reason: 'Loi de pression indisponible.' };
    const tgt = targets(inp.pressText), pc = inp.pchk && typeof inp.pchk === 'object' ? inp.pchk : {}, nowStr = String(inp.nowStr || ''), today = nowStr.slice(0, 10);
    const raw = {}; AXLES.forEach(k => { raw[k] = fin(pc[k]) && pc[k] > 0 && pc[k] < 6 ? pc[k] : null; });
    const hasRaw = AXLES.some(k => raw[k] != null), dated = DAY.test(pc.date || '') && DAY.test(today) && pc.date <= today;
    const measured = hasRaw && dated ? { date: pc.date, T: fin(pc.T) ? pc.T : null, av: raw.av, ar: raw.ar, ageDays: days(pc.date, today) } : null;
    const usable = measured && measured.T != null ? measured : null;
    const hours = (Array.isArray(inp.hours) ? inp.hours : []).filter(x => x && typeof x.t === 'string' && fin(x.T));
    const n = Math.max(1, Math.min(7, Math.round(inp.days || 7)));
    const end = (() => { const d = new Date(Date.parse(today + 'T12:00:00Z') + (n - 1) * 86400000); return d.toISOString().slice(0, 10); })();
    const from = nowStr.slice(0, 13) + ':00', ahead = DAY.test(today) ? hours.filter(x => x.t >= from && x.t.slice(0, 10) <= end) : [];
    const rel = reliability(usable, measured && measured.T == null);
    if (!tgt && !usable) return { known: false, target: null, measured, reliability: rel,
      reason: measured ? 'Cible plaque non renseignée et température du contrôle manquante : aucune projection.' : 'Cible plaque non renseignée : aucune projection (Réglages → voiture).' };
    // Base : mesure par essieu (un essieu non mesuré reste vide, jamais copié de l'autre) ou simulation depuis la cible.
    const T0 = usable ? usable.T : fin(inp.nowT) ? inp.nowT : ahead.length ? ahead[0].T : null;
    if (T0 == null) return { known: false, target: tgt, measured, reliability: rel, reason: 'Température actuelle indisponible : aucune simulation.' };
    const p0 = {}; AXLES.forEach(k => { p0[k] = usable ? usable[k] : tgt[k]; });
    const at = T => { const o = {}; AXLES.forEach(k => { o[k] = p0[k] == null ? null : r2(p0[k] - loss(p0[k], T0, T)); }); return o; };
    const lvOf = p => Math.max(...AXLES.map(k => tgt ? gapLv(p[k], tgt[k]) : 0));
    const series = ahead.map(x => ({ t: x.t, T: x.T, ...at(x.T) }));
    const byDay = new Map(); series.forEach(x => { const d = x.t.slice(0, 10), c = byDay.get(d); if (!c || x.T < c.T) byDay.set(d, x); });
    const dayRows = [...byDay.entries()].map(([d, x], i) => ({ date: d, min: x, lv: lvOf(x), far: days(today, d) >= 3, i }));
    const worst = series.reduce((a, x) => !a || x.T < a.T ? x : a, null);
    return { known: true, target: tgt, measured, base: usable ? 'mesure' : 'simulation', T0, p0, reliability: rel,
      series, days: dayRows, worst: worst ? { ...worst, lv: lvOf(worst) } : null, measuredLv: usable ? lvOf(usable) : 0,
      at: (T) => fin(T) ? { T, ...at(T), lv: lvOf(at(T)) } : null };
  }
  return { project, targets };
})();
