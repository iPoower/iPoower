'use strict';
const { session, BR } = require('./lib/context-session');
(async () => { const b = await BR.launch(); try {
  const s = await session(b, { at: '2026-11-16T07:00:00+01:00', dev: 'pc' }), p = s.p; await s.settle(4);
  await p.evaluate(() => { const today = '2026-11-16'; S.cars.forEach((c, i) => Object.assign(c.tire, { type: 'summer', brand: 'Marque ' + i, model: 'Modèle test', size: '205/55 R16 91V', tread: 6, treadAv: 6, treadAr: 6, treads: [{ d: today, mm: 6, ax: 'both' }], pchk: { date: today, T: 8, av: 2.3, ar: 2.3 }, press: '2,3 AV / 2,3 AR' })); saveSettings(); rebuild(); renderAll(); });
  await s.settle(6);
  for (const v of ['pneus', 'trajet']) { await p.evaluate(v => { UI.view = v; renderAll(); }, v); await s.settle(6);
    console.log(v, JSON.stringify(await p.evaluate(() => {
      const t = APP_CONTEXT.snapshot && (APP_CONTEXT.snapshot.activeTrip || APP_CONTEXT.snapshot.nextTrip), raw = RAW[UI.loc], src = f1WeatherSources(t && t.seq);
      const txt = id => ((document.getElementById(id) || {}).textContent || '').replace(/\s+/g, ' ');
      return { active: appActiveCar() && appActiveCar().id, bcar: UI.bcar, tripForm: typeof TRIP_FORM === 'object' ? TRIP_FORM.carId : null, trip: !!t, originPending: t && t.originPending, seq: t && t.seq && t.seq.length,
        rawMode: raw && raw.mode, rawAge: raw ? Reliability.ageMin(raw.t) : null, limit: Reliability.FRESHNESS.agingMaxMin, src, cmp: txt('secCmp').slice(0, 300),
        ab: (txt('secF1') || document.body.textContent.replace(/\s+/g, ' ')).match(/STRATÉGIE A\/B.{0,260}/) && (txt('secF1') || document.body.textContent.replace(/\s+/g, ' ')).match(/STRATÉGIE A\/B.{0,260}/)[0],
        choose: document.body.textContent.replace(/\s+/g, ' ').match(/.{0,80}(à choisir|non confirmée).{0,80}/g) };
    })).slice(0, 2500)); }
} finally { await b.close(); } })().catch(e => { console.error(e); process.exit(1); });
