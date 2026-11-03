// Lot G · une seule vérité pour le risque de gel, vraie app (PC et iPhone), données fictives. Constats terrain (même lieu,
// même trajet, même heure) : Gestion des pneus « Risque de gel : non » et « Aucun risque de gel détecté » avec une chaussée
// estimée sous 1 °C (seuil appliqué à l'air) ; synthèse « Prochain risque sur mes trajets » verte alors que la carte du trajet
// domicile-travail indiquait « INCERTITUDE GEL » ; « Quelle voiture prendre ? » : pneus « indistincts » alors qu'une voiture
// est à 1,8 mm à l'avant (garde-fou #307) et l'autre à 4,6 mm. Ce test CONSTATE : chaque écart est listé.
'use strict';
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-15T20:00:00+01:00';           // dimanche soir ; départ domicile-travail lundi 06:30
const COLD = h => h >= 4 && h <= 9;               // lundi matin : air autour de 1,8 °C, nuit claire et calme (chaussée plus froide)
const wx = (o, kind) => {
  if (kind === 'now') return o;
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
    const cold = i => String(H.time[i]).startsWith('2026-11-16') && COLD(+String(H.time[i]).slice(11, 13));
    H.temperature_2m = H.time.map((t, i) => cold(i) ? 1.8 + (+String(t).slice(11, 13) - 6) * 0.15 : H.temperature_2m[i]);
    for (const [k, v] of [['cloud_cover', 5], ['wind_speed_10m', 3], ['wind_gusts_10m', 6], ['precipitation', 0], ['relative_humidity_2m', 85], ['weather_code', 0]])
      if (Array.isArray(H[k])) H[k] = H[k].map((x, i) => cold(i) ? v : x);
  }
  return o;
};
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 500)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 500)); } };
const text = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ') : '(absent)'; }, sel);
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: AT, dev, wx }), p = s.p; await s.settle(4);
      const setup = await p.evaluate(() => {
        if (S.cars.length < 2) return { error: 'profil de test : deux voitures attendues' };
        S.work.dep = '06:30'; S.flags = S.flags || {}; S.flags.f1RaceEngineer = 1;
        const day = '2026-11-15';
        S.cars.forEach((c, i) => Object.assign(c.tire, { type: 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', treadEst: 0, dot: '1224',
          tread: i ? 4.6 : 1.8, treadAv: i ? 4.6 : 1.8, treadAr: i ? 4.6 : 5.0, treads: [{ d: day, mm: i ? 4.6 : 1.8, km: null, ax: 'av' }, { d: day, mm: i ? 4.6 : 5.0, km: null, ax: 'ar' }] }));
        saveSettings(); appSetCar(S.cars[0].id); rebuild(); renderAll();
        return { cars: S.cars.map(c => c.short) };
      });
      if (setup.error) throw new Error(setup.error);
      await p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(10);
      // Fenêtre du trajet domicile-travail, telle que calculée par l'app.
      const ctx = await p.evaluate(() => { const t = T.find(x => x.src === 'work' && x.sum); if (!t) return null;
        return { dep: t.dep, airMin: t.sum.Tmin, roadMin: t.sum.TrMin, fr: typeof frostRisk === 'function' ? frostRisk(t.sum) : null, band: frostBand(t.sum.TrMin) }; });
      const lo = ctx && ctx.roadMin != null ? ctx.roadMin - 2 : null;
      expect(`${dev} · contexte : trajet domicile-travail ${ctx && ctx.dep} avec chaussée estimée dans la marge du gel (chaussée − 2 °C < 0) et air au-dessus de 1 °C`,
        !!ctx && lo < 0 && ctx.airMin > 1, JSON.stringify(ctx));
      // Synthèse : pire risque de tous les trajets, domicile-travail compris ; jamais verte avec une incertitude gel.
      const brf = await text(p, '#secBrf'), line = (brf.match(/Prochain risque sur mes trajets[^]*?(?=Ensuite|Trajet le plus risqué|$)/) || [''])[0].slice(0, 300);
      expect(`${dev} · synthèse « Prochain risque sur mes trajets » : jamais verte avec une incertitude gel sur le trajet domicile-travail`, !/🟢/.test(line) && /🟠|🔴/.test(line) && /chaussée|gel|DANGER|PRUDENCE|VIGILANCE/i.test(line), line);
      // Gestion des pneus (trajet) : le seuil de gel s'applique à la chaussée estimée.
      const brief = await text(p, '#secBrief');
      const row = (brief.match(/Risque de gel[^]*?(?=Risque verglas)/) || [''])[0];
      expect(`${dev} · Gestion des pneus : « Risque de gel » jamais « non » sur le trajet (chaussée ${ctx && ctx.roadMin} °C, air ${ctx && ctx.airMin} °C)`, !!row && /possible|sous 0/.test(row) && !/: non|non ·/.test(row), row.slice(0, 200));
      expect(`${dev} · récit : jamais « Aucun risque de gel détecté » avec une chaussée dans la marge du gel`, !/Aucun risque de gel détecté/.test(brief), (brief.match(/[^.]*gel[^.]*\./g) || []).join(' ').slice(0, 300));
      // A/B : le garde-fou de profondeur (#307) distingue les deux voitures.
      const cmp = await text(p, '#secCmp');
      expect(`${dev} · « Quelle voiture prendre ? » : 1,8 mm à l’avant contre 4,6 mm, jamais « les pneus ne les distinguent pas »`, !/ne les distinguent pas/.test(cmp) && /garde-fou|sous 2 mm|Niveaux/.test(cmp), cmp.slice(0, 600));
      // Ingénieur de course : la fenêtre DU TRAJET (même frostRisk), jamais la température « maintenant ».
      const eng = await text(p, '#f1-panel-raceEngineer'), f1c = v => v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
      expect(`${dev} · Ingénieur de course : chaussée et air minimum de la fenêtre du trajet (${f1c(ctx && ctx.roadMin)} / ${f1c(ctx && ctx.airMin)} °C)`,
        !!ctx && eng.includes('Fenêtre du trajet : air min ' + f1c(ctx.airMin) + ' °C · chaussée estimée min ' + f1c(ctx.roadMin) + ' °C'), eng.slice(0, 500));
      // Même donnée de référence (t.sum du trajet) et même règle (frostRisk) : bandeau de décision et cartes pneus.
      const want = ctx && 'air min ' + f1c(ctx.airMin) + ' °C · chaussée estimée min ' + f1c(ctx.roadMin) + ' °C';
      const coreTrip = await text(p, '#decisionCore .decision-trip-frost'), cardTrip = await p.evaluate(() => [...document.querySelectorAll('.car-trip-frost')].map(e => e.textContent.replace(/\s+/g, ' ')));
      expect(`${dev} · bandeau : ligne du trajet = fenêtre du trajet (${want})`, !!want && coreTrip.includes(want), coreTrip.slice(0, 300));
      expect(`${dev} · cartes pneus : prochain trajet = même fenêtre et mêmes minimums sur chaque voiture`, !!want && cardTrip.length >= 2 && cardTrip.every(x => x.includes(want)), JSON.stringify(cardTrip).slice(0, 400));
      // Alertes (fenêtre des 24 h) : même règle ; une alerte plus sévère que le trajet nomme une heure hors du trajet.
      const al = await p.evaluate(() => { const a = CX.alerts && CX.alerts.t0, sm = summarize(CX.seq), fr = frostRisk(sm); const t = T.find(x => x.src === 'work' && x.sum);
        return { t0: a ? { sev: a.sev, title: a.title } : null, horizon: { key: fr.key, level: fr.level, roadMin: fr.roadMin }, at: sm.iTrMin ? sm.iTrMin.hs[sm.iTrMin.i].t : null, trip: t ? { dep: t.dep, arr: t.arr, level: frostRisk(t.sum).level } : null }; });
      const inTrip = al.at && al.trip && al.at.slice(0, 13) >= String(al.trip.dep).slice(0, 13) && al.at.slice(0, 13) <= String(al.trip.arr || al.trip.dep).slice(0, 13);
      expect(`${dev} · alertes : niveau de l’alerte de gel = frostRisk de sa fenêtre ; plus sévère que le trajet seulement à une heure hors du trajet, nommée`,
        (al.horizon.level >= 2 ? !!al.t0 && al.t0.sev === al.horizon.level : !al.t0) && (!al.t0 || !al.trip || al.t0.sev <= al.trip.level || (!inTrip && /vers \d\d:\d\d/.test(al.t0.title))), JSON.stringify(al));
      // Minimums affichés par chaque surface (constat « minimums contradictoires ») : relevés pour le rapport.
      const mins = await p.evaluate(() => { const t = T.find(x => x.src === 'work' && x.sum);
        return { trajet: t && { air: t.sum.Tmin, chaussee: t.sum.TrMin }, maintenant: CX && CX.m && CX.m.hs[CX.m.nowI] ? { air: CX.m.hs[CX.m.nowI].T, chaussee: CX.m.hs[CX.m.nowI].Tr } : null,
          horizon: CX && CX.seq ? (() => { const sm = summarize(CX.seq); return { air: sm.Tmin, chaussee: sm.TrMin }; })() : null }; });
      console.log('MINIMUMS ' + dev + ' ' + JSON.stringify(mins));
      await s.c.close();
    }
  } finally { await b.close(); }
  if (errors.length) findings.push('erreurs de page : ' + errors.join(' | ').slice(0, 600));
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
