// Recette R4-04c (27/11/2026, données FICTIVES) : sur l'onglet Météo, le bloc de décision affichait « 1,8 °C avec pneus été
// (autre voiture) » et un verdict PRUDENCE alors que la voiture du jour était en pneus hiver. Attendu (même règle que e2e98) :
// le verdict « ici, maintenant » ne parle que de la voiture du jour ; l'alerte « pneus été » d'une autre voiture reste dans la
// liste des alertes 24 h (planification), jamais dans le verdict immédiat. Contre-épreuve : voiture du jour en pneus été.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const AT = '2026-11-16T07:00:00+01:00';
// Matinée froide (3 °C jusqu'à midi le jour du test) : « < 5 °C avec pneus été » dans la fenêtre « ici, maintenant ».
const wx = (o, kind) => {
  if (kind === 'now') return o;
  const H = o.hourly || {};
  if (Array.isArray(H.time) && Array.isArray(H.temperature_2m)) H.temperature_2m = H.time.map((t, i) => String(t).slice(0, 10) === '2026-11-16' && +String(t).slice(11, 13) <= 12 ? 3 : H.temperature_2m[i]);
  return o;
};
let n = 0; const check = (label, ok, detail) => { assert(ok, label + ' · ' + String(detail || '').slice(0, 900)); n++; console.log('✅ ' + label); };
const read = p => p.evaluate(() => {
  const core = document.getElementById('decisionCore'), t5 = id => CX.alertsNow && CX.alertsNow[id] ? CX.alertsNow[id].title : null;
  return { all24: CX.alerts && CX.alerts.t5s ? CX.alerts.t5s.title : null, now: t5('t5s'), text: core ? core.innerText : '', label: core && core.querySelector('h2') ? core.querySelector('h2').innerText : '' };
});
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: AT, dev, wx }), p = s.p; await s.settle(4);
      const cars = await p.evaluate(() => {
        if (S.cars.length < 2) return { error: 'profil de test : deux voitures attendues' };
        const [a, o] = S.cars;
        Object.assign(a.tire, { type: 'winter', brand: 'Marque A', model: 'Modèle test', size: '205/55 R16 91V', tread: 7 });
        Object.assign(o.tire, { type: 'summer', brand: 'Marque B', model: 'Modèle test', size: '205/55 R16 91V', tread: 7 });
        saveSettings(); appSetCar(a.id); UI.view = 'meteo'; rebuild(); renderAll();
        return { day: a.short || a.name, other: o.short || o.name, otherId: o.id };
      });
      assert(!cars.error, cars.error);
      await s.settle(6);
      const r = await read(p);
      check(`${dev} · cas reproduit : l’autre voiture (pneus été) a bien l’alerte « < 5 °C avec pneus été » dans les alertes 24 h`, !!r.all24 && r.all24.includes(cars.other), JSON.stringify(r));
      check(`${dev} · voiture du jour en hiver : alerte « pneus été » absente du verdict « ici, maintenant »`, r.now === null, JSON.stringify(r));
      check(`${dev} · le bloc de décision ne cite ni l’autre voiture ni des pneus été`, !r.text.includes(cars.other) && !/pneus été/i.test(r.text), r.text.slice(0, 700));
      // Contre-épreuve : la voiture du jour est celle en pneus été → l'alerte revient, à son nom.
      await p.evaluate(id => { appSetCar(id); rebuild(); renderAll(); }, cars.otherId); await s.settle(4);
      const q = await read(p);
      check(`${dev} · voiture du jour en pneus été : l’alerte revient dans le verdict immédiat, à son nom`, !!q.now && q.now.includes(cars.other), JSON.stringify(q));
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'aucune erreur de page');
    console.log(`\n✅ ${n} contrôles au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
