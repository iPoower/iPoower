// Constat du 01/11/2026 (capture iPhone, données fictives ici) : le verdict « ici, maintenant » affichait
// « DANGER · Météo hivernale avant le montage hiver (autre voiture) » alors que la voiture affichée était une autre et la météo calme.
// Attendu : le verdict immédiat ne parle que de la voiture affichée ; « montage hiver à prévoir » est une alerte de PLANIFICATION
// (VIGILANCE, liste des alertes 24 h, Pneus/Garage), jamais un DANGER du verdict immédiat. WebKit simule l'iPhone.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-10-14T10:00:00+02:00';
// Météo calme aujourd'hui et demain ; nuits à 0 °C du 17 au 19/10 (avant le montage hiver de l'autre voiture, le 24/10).
const COLD = new Set(['2026-10-17', '2026-10-18', '2026-10-19']);
const wx = (o, kind) => {
  if (kind === 'now') return o;
  const H = o.hourly || {}, D = o.daily || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) H.temperature_2m = H.time.map((t, i) => COLD.has(String(t).slice(0, 10)) && +String(t).slice(11, 13) <= 8 ? 0 : H.temperature_2m[i]);
  if (Array.isArray(D.time) && Array.isArray(D.temperature_2m_min)) D.temperature_2m_min = D.time.map((t, i) => COLD.has(String(t).slice(0, 10)) ? 0 : D.temperature_2m_min[i]);
  return o;
};
let n = 0; const check = (label, ok, detail) => { assert(ok, label + ' · ' + String(detail || '').slice(0, 900)); n++; console.log('✅ ' + label); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: AT, dev, wx }), p = s.p; await s.settle(4);
      const setup = await p.evaluate(() => {
        if (S.cars.length < 2) return { error: 'profil de test : deux voitures attendues' };
        const [a, o] = S.cars;
        Object.assign(a.tire, { type: 'winter', brand: 'Marque A', model: 'Modèle test', size: '205/55 R16 91V' });
        Object.assign(o.tire, { type: 'summer', brand: 'Marque B', model: 'Modèle test', size: '205/55 R16 91V' });
        o.plan = { on: 1, brand: 'Marque C', model: 'Pneu fictif', size: '205/55 R16 91V', date: '2026-10-24' };
        saveSettings(); appSetCar(a.id); renderAll();
        return { shown: a.short || a.name, other: o.short || o.name };
      });
      assert(!setup.error, setup.error);
      await p.locator('#viewSeg [data-act=view][data-v=pneus]').click(); await s.settle(6);
      const r = await p.evaluate(() => {
        const core = document.getElementById('decisionCore');
        return { pre24: CX.alerts && CX.alerts.pre ? { sev: CX.alerts.pre.sev, title: CX.alerts.pre.title } : null, preNow: !!(CX.alertsNow && CX.alertsNow.pre),
          label: core && core.querySelector('h2') ? core.querySelector('h2').innerText : '', text: core ? core.innerText : '', active: appActiveCar() && appActiveCar().id === S.cars[0].id };
      });
      check(dev + ' · cas reproduit : l’autre voiture (pneus été) a bien une météo hivernale avant son montage', !!r.pre24, JSON.stringify(r));
      check(dev + ' · « montage hiver à prévoir » = planification VIGILANCE (alertes 24 h), jamais DANGER', r.pre24 && r.pre24.sev === 1 && /^Montage hiver à prévoir/.test(r.pre24.title), JSON.stringify(r.pre24));
      check(dev + ' · absente de la fenêtre « ici, maintenant »', r.preNow === false, JSON.stringify(r));
      check(dev + ' · verdict de la voiture affichée : RAS ou VIGILANCE, jamais DANGER', r.active && /^\W*(RAS|VIGILANCE)\b/u.test(r.label.trim()) && !/DANGER/.test(r.label), r.label + ' | ' + r.text.slice(0, 400));
      check(dev + ' · le verdict immédiat ne cite pas l’autre voiture', !r.text.includes(setup.other) && !/montage hiver/i.test(r.text), r.text.slice(0, 600));
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'aucune erreur de page');
    console.log(`\n✅ ${n} contrôles au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
