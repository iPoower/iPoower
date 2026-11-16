/* Analyse · « Mon bilan » (16/11/2026) : projection PURE de données déjà enregistrées (aucune écriture, aucune donnée
 * inventée, aucune horloge interne : « today » et « now » sont fournis). Trois cartes :
 *   1. À faire bientôt : plan hiver, pressions, profondeur, compteur, révision, contrôle technique (toutes voitures) ;
 *   2. Tes chiffres du mois : compteur, km des 30 derniers jours, rythme, coût/km, objectif, trajets et matins froids ;
 *   3. Tes pneus dans le temps : âge, usure projetée (seulement avec deux mesures), 14 prochains départs du matin.
 * Les entrées viennent des règles existantes (Garage.odoTrend / maintenance / overview, tyreState, wearInfo, budget,
 * journal des trajets, journal de saison, prévisions horaires) : une seule vérité, ce module ne fait que les réunir. */
'use strict';
const Bilan = (() => {
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const valid = d => typeof d === 'string' && DAY.test(d);
  const diff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const RANK = { late: 0, soon: 1, todo: 2, info: 3 };
  const PRESSURE_DAYS = 30, TREAD_DAYS = 120, SOON_DAYS = 14;

  // 1. À faire bientôt, toutes voitures confondues. car = { id, short, hasTires, plan, maintenance, pressureDate, treadMm, treadDate, treadEst }
  function todo(cars, today) {
    if (!valid(today)) throw new Error('date du jour requise');
    const out = [];
    const add = (c, x) => out.push({ carId: c.id, car: c.short, ...x });
    for (const c of Array.isArray(cars) ? cars : []) {
      if (!c || !c.id) continue;
      const p = c.plan, when = p && (valid(p.appointment) ? p.appointment : valid(p.estimate) ? p.estimate : null);
      if (when) { const n = diff(today, when);
        add(c, { id: 'winter', title: 'Montage des pneus hiver', sub: p.appointment ? (p.confirmed ? 'Rendez-vous confirmé' : 'Rendez-vous à confirmer') : 'Date estimée, sans rendez-vous', days: n,
          tone: n < 0 ? 'late' : n <= SOON_DAYS ? 'soon' : 'info', target: null }); }   // détails du plan : Garage
      if (c.hasTires) {
        const pa = valid(c.pressureDate) ? diff(c.pressureDate, today) : null;
        if (pa == null) add(c, { id: 'pressure', title: 'Contrôler les pressions', sub: 'Aucun contrôle daté', days: null, tone: 'todo', target: 'pressure' });
        else if (pa > PRESSURE_DAYS) add(c, { id: 'pressure', title: 'Contrôler les pressions', sub: 'Dernier contrôle il y a ' + pa + ' j', days: 0, tone: 'soon', target: 'pressure' });
        const ta = valid(c.treadDate) ? diff(c.treadDate, today) : null;
        if (c.treadMm == null) add(c, { id: 'tread', title: 'Mesurer la profondeur', sub: 'Jamais mesurée : analyses limitées', days: null, tone: 'todo', target: 'tread' });
        else if (c.treadEst) add(c, { id: 'tread', title: 'Mesurer la profondeur', sub: 'Valeur estimée, à mesurer à la jauge', days: null, tone: 'todo', target: 'tread' });
        else if (ta != null && ta > TREAD_DAYS) add(c, { id: 'tread', title: 'Mesurer la profondeur', sub: 'Dernière mesure il y a ' + ta + ' j', days: 0, tone: 'soon', target: 'tread' });
      }
      const m = c.maintenance || {}, o = m.odo, r = m.revision, ct = m.ct;
      if (o) {
        if (o.due) add(c, { id: 'odo', title: 'Relever le compteur', sub: o.last ? 'Dernier relevé il y a ' + o.ageDays + ' j' : 'Aucun relevé enregistré', days: 0, tone: o.last ? 'soon' : 'todo', target: 'odo' });
        else if (o.last && Number.isFinite(o.everyDays) && Number.isFinite(o.ageDays)) { const n = Math.max(0, o.everyDays - o.ageDays);
          add(c, { id: 'odo', title: 'Relever le compteur', sub: 'Rappel chaque semaine', days: n, tone: 'info', target: 'odo' }); }
      }
      if (r) {
        if (r.missing === 'last') add(c, { id: 'revision', title: 'Révision', sub: 'Dernière révision à renseigner', days: null, tone: 'todo', target: 'maintenance' });
        else if (r.missing === 'interval') add(c, { id: 'revision', title: 'Révision', sub: 'Intervalle du carnet à renseigner', days: null, tone: 'todo', target: 'maintenance' });
        else if (r.status === 'late' || r.status === 'soon') add(c, { id: 'revision', title: 'Révision', sub: r.status === 'late' ? 'En retard' : 'Bientôt', days: r.daysLeft, tone: r.status, target: 'maintenance' });
      }
      if (ct) {
        if (!ct.next) add(c, { id: 'ct', title: 'Contrôle technique', sub: 'Dernier contrôle à renseigner', days: null, tone: 'todo', target: 'maintenance' });
        else if (ct.status === 'late' || ct.status === 'soon') add(c, { id: 'ct', title: 'Contrôle technique', sub: ct.status === 'late' ? 'Date limite dépassée' : 'Bientôt', days: ct.daysLeft, tone: ct.status, target: 'maintenance' });
      }
    }
    return out.sort((a, b) => RANK[a.tone] - RANK[b.tone] || (a.days == null) - (b.days == null) || (a.days || 0) - (b.days || 0));
  }

  // Kilomètres sur les N derniers jours, à partir des relevés fiables (trend.readings) : interpolés au début de la fenêtre
  // quand un relevé la précède, sinon depuis le premier relevé de la fenêtre (partiel, daté).
  function kmWindow(trend, today, days = 30) {
    const r = trend && Array.isArray(trend.readings) ? trend.readings : [];
    if (!valid(today) || r.length < 2 || (trend && trend.nonMonotonic)) return null;
    const from = addDays(today, -days), last = r[r.length - 1];
    if (last.d < from) return null;   // aucun relevé dans la fenêtre
    const before = r.filter(x => x.d <= from).pop(), after = r.find(x => x.d >= from);
    if (before && after && before !== after) {
      const at = before.km + (after.km - before.km) * diff(before.d, from) / Math.max(1, diff(before.d, after.d));
      return { km: Math.max(0, Math.round(last.km - at)), from, to: last.d, partial: false };
    }
    const start = before || after;
    if (!start || start === last) return null;
    return { km: Math.max(0, last.km - start.km), from: start.d, to: last.d, partial: start.d !== from };
  }

  // Trajets des N derniers jours pour une voiture (journal des trajets) et matins froids (journal de saison, lieu principal).
  function trips(entries, carId, now, days = 30) {
    const since = now - days * 864e5, rows = (Array.isArray(entries) ? entries : []).filter(e => e && Number.isFinite(e.at) && e.at >= since && e.at <= now && !e.cancelledAt && e.start && e.start.carId === carId);
    // Le retour du conducteur (même « rien de particulier ») l'emporte sur la prévision du départ.
    const cond = e => (e.feedback && Array.isArray(e.feedback.conditions) ? e.feedback.conditions : e.start && e.start.prediction ? e.start.prediction.conditions || [] : []);
    return { count: rows.length, wet: rows.filter(e => cond(e).some(k => k === 'rain' || k === 'wet')).length, ice: rows.filter(e => cond(e).some(k => k === 'ice' || k === 'snow')).length };
  }
  function mornings(journal, today, days = 30) {
    if (!valid(today)) return { days: 0, cold: 0, frost: 0 };
    const from = addDays(today, -days), rows = Object.entries(journal && typeof journal === 'object' ? journal : {}).filter(([d, r]) => valid(d) && d > from && d <= today && r && Number.isFinite(r.T));
    return { days: rows.length, cold: rows.filter(([, r]) => r.T < 5).length, frost: rows.filter(([, r]) => Number.isFinite(r.ice) && r.ice >= 1).length };
  }

  // Départs du matin des prochains jours (température de l'air à l'heure de départ) classés selon la monte réellement montée.
  function morningLevel(type, T) {
    if (!Number.isFinite(T)) return 'unknown';
    if (type === 'summer' || type === 'unknown') return T >= 7 ? 'ok' : T >= 3 ? 'limit' : 'cold';
    if (type === 'winter') return T >= 20 ? 'limit' : 'ok';
    if (type === 'allseason') return T <= -5 ? 'limit' : 'ok';
    return 'unknown';
  }
  function calendar(days, type, n = 14) {
    const rows = (Array.isArray(days) ? days : []).filter(x => x && valid(x.date)).slice(0, n).map(x => ({ date: x.date, T: Number.isFinite(x.T) ? x.T : null, level: morningLevel(type, x.T) }));
    return { rows, cold: rows.filter(x => x.level === 'cold').length, limit: rows.filter(x => x.level === 'limit').length };
  }

  // Usure : une date seulement avec la projection existante (wearInfo : deux mesures comparables) ; sinon ce qu'il manque.
  function wear(w) {
    if (w && valid(w.dateThr) && Number.isFinite(w.kmThr)) return { kind: 'projection', date: w.dateThr, thr: w.thr, kmThr: w.kmThr, kmLegal: Number.isFinite(w.kmLegal) ? w.kmLegal : null, rate: w.rate };
    if (w && Number.isFinite(w.kmThr)) return { kind: 'km', thr: w.thr, kmThr: w.kmThr, rate: w.rate };
    if (w && w.last && Number.isFinite(w.last.mm)) return { kind: 'one', mm: w.last.mm, date: w.last.d, thr: w.thr };
    return { kind: 'none', thr: w && w.thr };
  }

  return { todo, kmWindow, trips, mornings, calendar, morningLevel, wear, PRESSURE_DAYS, TREAD_DAYS };
})();
