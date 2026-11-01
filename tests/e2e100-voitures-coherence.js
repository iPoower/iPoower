// PR 2 · cohérence des véhicules, vraies vues (PC et iPhone selon le navigateur de la CI), données fictives.
// Constats du 01/11/2026 : Garage › Prochaine mission affichait « monte non confirmée, profondeur non renseignée » alors que les
// deux voitures avaient leurs pneus et mesures ; bandeau, briefing et Trajet disaient « véhicule à choisir » alors que l'onglet
// Pneus calculait déjà avec une voiture ; Trajet disait la comparaison A/B indisponible alors que Pneus comparait deux scores.
// Attendu : voiture AFFICHÉE, PROPOSÉE et CONFIRMÉE distinguées ; une présélection n'est jamais considérée comme utilisée.
// Diagnostic : position arrondie à ~1 km à l'écran comme dans la copie.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-16T07:00:00+01:00';   // lundi : trajet domicile-travail du profil fictif
let n = 0; const check = (label, ok, detail) => { assert(ok, label + ' · ' + String(detail || '').slice(0, 900)); n++; console.log('✅ ' + label); };
const view = async (s, v) => { await s.p.evaluate(v => { UI.view = v; renderAll(); window.scrollTo(0, 0); }, v); await s.settle(6); };
const text = (s, sel) => s.p.evaluate(sel => [...document.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ')).join('\n'), sel);
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: AT, dev }), p = s.p; await s.settle(4);
      const setup = await p.evaluate(() => {
        const today = '2026-11-16';
        S.cars.forEach((c, i) => Object.assign(c.tire, { type: 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', tread: 6 - i, treadAv: 6 - i, treadAr: 6 - i,
          treadEst: 0, treads: [{ d: today, mm: 6 - i, km: null, ax: 'both' }], pchk: { date: today, T: 8, av: 2.3, ar: 2.3 }, press: '2,3 AV / 2,3 AR', dot: '1224' }));
        S.flags.f1StrategyAB = 1; appDay().activeCarId = null; saveSettings(); rebuild(); renderAll();
        return { cars: S.cars.map(c => c.short || c.name), active: appActiveCar() && appActiveCar().id, shown: appDisplayedCar() && appDisplayedCar().id };
      });
      check(`${dev} · contexte : deux voitures équipées, aucune voiture confirmée, une voiture affichée`, setup.cars.length === 2 && !setup.active && !!setup.shown, JSON.stringify(setup));
      const shownName = setup.cars[0];
      // Pneus : la décision nomme la voiture affichée, non confirmée (jamais « à choisir » quand une voiture est calculée).
      await view(s, 'pneus');
      const core = await text(s, '#decisionCore');
      check(`${dev} · Pneus : voiture affichée nommée, non confirmée`, core.includes(shownName + ' · affichée, non confirmée pour le trajet') && !/Voiture · À choisir/.test(core), core.slice(0, 600));
      // Trajet : résumé, comparaison A/B, formulaire sans présélection.
      await view(s, 'trajet');
      const trip = await text(s, '#secTrip, .trip-summary-meta');
      check(`${dev} · Trajet : jamais « véhicule à choisir » alors qu’une voiture est affichée`, !/véhicule à choisir/.test(trip) && trip.includes('affichée, non confirmée pour le trajet'), trip.slice(0, 600));
      const ab = await text(s, '[data-k="f1-strategyAB"], .f1-panel, #secTrip');
      check(`${dev} · Trajet : comparaison A/B disponible (deux voitures, même trajet), voiture A signalée non confirmée`, /STRATÉGIE A\b/.test(ab) && /STRATÉGIE B\b/.test(ab) && /aucune voiture n’est encore confirmée pour ce trajet/.test(ab) && !/ne sont pas disponibles/.test(ab), ab.slice(0, 900));
      const form = await p.evaluate(() => ({ carId: TRIP_FORM.carId, sel: (document.getElementById('tripCar') || {}).value }));
      check(`${dev} · Trajet : aucune voiture présélectionnée dans le formulaire`, form.carId === null && (form.sel === '' || form.sel === undefined), JSON.stringify(form));
      // Programmer un trajet sans choisir de voiture : aucune voiture n'est déduite comme utilisée.
      const prog = await p.evaluate(() => { const dep = addMin(liveNow(), 60).slice(0, 16), [o, d] = S.locs;
        appProgramManualTrip({ originId: o.id, originPoint: null, destinationId: d.id, destinationPoint: null, dep, carId: TRIP_FORM.carId }); rebuild(); renderAll();
        return { active: appActiveCar() && appActiveCar().id, next: !!appDay().nextDestination }; });
      check(`${dev} · trajet programmé sans voiture choisie : aucune voiture confirmée par déduction`, prog.next && !prog.active, JSON.stringify(prog));
      // Garage › Prochaine mission : données réelles de la voiture affichée, signalée non confirmée.
      await view(s, 'garage');
      const mission = await text(s, '#missionControl');
      check(`${dev} · Garage › Prochaine mission : monte et profondeur de la voiture affichée, signalée non confirmée`, mission.includes('affichée, non confirmée pour le trajet') &&
        !/Monte non confirmée/.test(mission) && !/Profondeur non renseignée/.test(mission) && /6,0 mm|6 mm/.test(mission), mission.slice(0, 900));
      // Confirmation explicite : libellés de voiture confirmée partout.
      await p.evaluate(id => { appSetCar(id); rebuild(); renderAll(); }, setup.shown); await s.settle(4);
      await view(s, 'pneus'); const core2 = await text(s, '#decisionCore');
      await view(s, 'garage'); const mission2 = await text(s, '#missionControl');
      check(`${dev} · voiture confirmée : plus aucune mention « non confirmée »`, core2.includes(shownName) && !/non confirmée pour le trajet/.test(core2 + mission2), core2.slice(0, 300) + ' | ' + mission2.slice(0, 300));
      // Diagnostic : coordonnées arrondies à 2 décimales (≈ 1 km) à l'écran comme dans la copie.
      const diag = await p.evaluate(() => { GEO.raw = { lat: 48.123456, lon: 2.654321, acc: 12, ts: Date.now() }; return { screen: diagHtml(), copy: diagText() }; });
      check(`${dev} · Diagnostic : position arrondie à ~1 km à l’écran et dans la copie`, /48\.12, 2\.65/.test(diag.screen) && !/48\.123|2\.654/.test(diag.screen) && !/48\.123|2\.654/.test(diag.copy), diag.screen.slice(0, 300));
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'aucune erreur de page');
    console.log(`\n✅ ${n} contrôles au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
