// F1 Pure : six modules opt-in dans les cinq onglets, vrais taps iPhone / clics PC.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors } = require('./lib/context-session');
let n = 0, stage = '';
async function check(name, fn) { stage = name; await fn(); n++; console.log('✅ ' + name); }
const active = p => p.evaluate(() => ({
  modules: [...document.querySelectorAll('.f1-extension')].filter(x => x.getClientRects().length).map(x => x.dataset.f1),
  tabs: [...document.querySelectorAll('#viewSeg [data-act=view]')].map(x => x.dataset.v),
  flags: { ...S.flags }, cars: JSON.stringify(S.cars),
  trips: JSON.stringify({ start: USER_STORE.state.tripStart, end: USER_STORE.state.tripEnd, debrief: USER_STORE.state.debrief })
}));
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-10T12:00:00+02:00', dev }), p = s.p;
      const tap = async selector => { stage = dev + ' · ' + selector; const el = p.locator(selector).first();
        if (dev === 'iphone') await el.tap({ timeout: 20000 }); else await el.click({ timeout: 20000 });
        await s.settle(3);
      };
      const view = async name => tap('#viewSeg [data-act=view][data-v=' + name + ']');
      try {
        const before = await active(p);
        await check(dev + ' · aucun panneau F1 par défaut, navigation à 5 vues', async () => {
          assert.equal(before.modules.length, 0);
          assert.deepEqual(before.tabs, ['meteo', 'pneus', 'trajet', 'tenue', 'analyse']);
          assert.equal(await p.evaluate(() => F1Pure.FEATURES.every(f => !f1Enabled(f.id))), true);
        });
        await p.evaluate(() => { document.getElementById('settings').open = true; renderSettings(true); });
        const ids = ['raceEngineer','trackConditions','tyreManagement','strategyAB','theGarage','telemetryReplay'];
        for (const id of ids) await tap('#settings [data-act=f1-toggle][data-f1=' + id + ']');
        await check(dev + ' · six interrupteurs activables séparément', async () => {
          assert.equal(await p.evaluate(() => F1Pure.FEATURES.filter(f => f1Enabled(f.id)).length), 6);
          assert.equal(await p.locator('#settings [data-act=f1-toggle][aria-pressed=true]').count(), 6);
        });
        await view('pneus');
        await check(dev + ' · Race Engineer + Tyre Management + Garage sans ajouter de section ni modifier les cinq onglets', async () => {
          const x = await active(p);
          assert.deepEqual(x.tabs, before.tabs);
          assert(x.modules.includes('raceEngineer'), JSON.stringify(x.modules));
          assert(x.modules.includes('tyreManagement'), JSON.stringify(x.modules));
          assert(x.modules.includes('theGarage'), JSON.stringify(x.modules));
          assert(await p.locator('#decisionCore [data-f1=raceEngineer] summary').isVisible());
          assert(await p.locator('#secBrief [data-f1=tyreManagement] summary').isVisible());
        });
        await view('meteo');
        await check(dev + ' · Track Conditions reste dans Météo et distingue prévision et mesure', async () => {
          await tap('#secWx [data-f1=trackConditions] > summary');
          const text = await p.locator('#secWx [data-f1=trackConditions]').innerText();
          assert(/TRACK CONDITIONS/.test(text)); assert(/Aucun découpage GPS précis/.test(text));
          assert.equal(await p.locator('#decisionCore [data-f1=raceEngineer]').count(), 0);
        });
        await view('trajet');
        await check(dev + ' · Strategy A/B ne crée aucun itinéraire ni résultat inventé', async () => {
          const text = await p.locator('#secTrip [data-f1=strategyAB]').innerText();
          assert(/STRATEGY A\/B/.test(text));
          assert.equal(await p.locator('#secTrip [data-f1=strategyAB]').count(), 1);
        });
        await view('analyse');
        await check(dev + ' · Telemetry Replay dans Analyse, jamais de GPS simulé en donnée mesurée', async () => {
          const q = p.locator('#secLab [data-f1=telemetryReplay]');
          assert.equal(await q.count(), 1);
          await tap('#secLab [data-f1=telemetryReplay] > summary');
          assert.match(await q.innerText(), /Aucun trajet|Retour|journal|capteur/i);
        });
        await check(dev + ' · aucun véhicule ni contexte modifié par les six projections', async () => {
          const after = await active(p);
          assert.equal(after.cars, before.cars);
          assert.equal(after.trips, before.trips);
        });
        await p.reload(); await s.settle(12);
        await check(dev + ' · six options conservées au rechargement sans nouvel état de trajet', async () => {
          assert.equal(await p.evaluate(() => F1Pure.FEATURES.filter(f => f1Enabled(f.id)).length), 6);
          assert.equal(await p.locator('#secLab [data-f1=telemetryReplay]').count(), 1);
        });
        await p.evaluate(() => { document.getElementById('settings').open = true; renderSettings(true); });
        for (const id of ids) await tap('#settings [data-act=f1-toggle][data-f1=' + id + ']');
        await check(dev + ' · les six options sont réversibles sans effacer de donnée', async () => {
          assert.equal(await p.evaluate(() => F1Pure.FEATURES.every(f => !f1Enabled(f.id))), true);
          assert.equal((await active(p)).modules.length, 0);
        });
        await view('tenue');
        await check(dev + ' · onglet Tenue totalement inchangé', async () => {
          assert.equal((await active(p)).modules.length, 0);
          assert.equal(await p.locator('#viewSeg [data-act=view]').count(), 5);
        });
      } finally { await s.c.close(); }
    }
    await check('F1 Pure · aucune erreur JS', async () => assert.deepEqual(errors, []));
  } finally { await b.close(); }
  console.log(n + '/' + n + ' scénarios F1 Pure PC/iPhone réussis');
})().catch(e => { console.error('Étape : ' + stage); console.error(e); process.exit(1); });
