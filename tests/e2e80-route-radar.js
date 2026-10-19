// Route Radar : vérifications Chromium/WebKit sur données de trajet fictives en mémoire.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let count = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); count++; console.log('✅ ' + label); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-19T15:00:00+02:00', dev }), p = s.p;
      try {
        await p.locator('#viewSeg [data-act=view][data-v=trajet]').click();
        await check(dev + ' · affichage compact repliable sans nouvel onglet', async () => {
          assert.equal(await p.locator('#secTrip .trip-radar details[data-ux=route-radar]').count(), 1);
          assert.equal(await p.locator('#viewSeg [data-act=view]').count(), 5);
        });
        await p.evaluate(() => {
          const m = M[UI.loc] || Object.values(M).find(Boolean);
          const hs = m && m.hs || [{ t: '2026-10-19T15:00', T: 8, P: 1, vis: 800, wind: 15, gust: 30 }];
          const i = m && m.nowI >= 0 ? m.nowI : 0;
          const point = (f, k) => ({ hs, i: Math.min(i, hs.length - 1), f, lat: 49 + f, lon: 2 + f,
            km: f * 30, t: '2026-10-19T15:' + String(k * 10).padStart(2, '0') });
          const t = { key: 'fixture-route', src: 'local', dep: '2026-10-19T15:00', arr: '2026-10-19T15:20', from: 'Lieu A', to: 'Lieu B',
            l: { routed: true, km: 30, min: 20, g: [[49, 2], [49.5, 2.5], [50, 3]], pts: [{ f: .5 }],
              from: { name: 'Lieu A', lat: 49, lon: 2 }, to: { name: 'Lieu B', lat: 50, lon: 3 } },
            seq: [point(0, 0), point(.5, 1), point(1, 2)] };
          const d = appDay();
          d.nextDestination = { source: 'manual', tripKey: t.key, dep: t.dep, updatedAt: Date.now(),
            originPoint: { lat: 49, lon: 2, name: 'Lieu A' }, destinationPoint: { lat: 50, lon: 3, name: 'Lieu B' } };
          APP_CONTEXT.trips = [t]; APP_CONTEXT.snapshot.trips = [t];
          renderTripView();
        });
        await p.locator('.trip-radar summary').click();
        await check(dev + ' · trois points météo et provenance explicite', async () => {
          assert.equal(await p.locator('.rr-point').count(), 3);
          const t = await p.locator('.trip-radar').innerText();
          for (const word of ['DÉPART', 'PARCOURS', 'ARRIVÉE', 'Prévisions aux points', 'Position documentée'])
            assert(t.includes(word), 'libellé manquant : ' + word);
          assert.equal(await p.locator('.rr-band > span').count(), 3);
        });
        const state = await p.evaluate(() => {
          const node = document.querySelector('.trip-radar details'), before = JSON.stringify(appDay().nextDestination);
          const car = appDay().activeCarId;
          const beforeNetwork = performance.getEntriesByType('resource').filter(x => /open-meteo|project-osrm/.test(x.name)).length;
          for (let k = 0; k < 12; k++) renderTripView();
          return { same: node === document.querySelector('.trip-radar details'), expanded: node.open,
            unchanged: before === JSON.stringify(appDay().nextDestination), car: car === appDay().activeCarId,
            newNetwork: performance.getEntriesByType('resource').filter(x => /open-meteo|project-osrm/.test(x.name)).length - beforeNetwork,
            scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth };
        });
        await check(dev + ' · rendu stable, aucune mutation ni requête, mobile sans débordement', async () => {
          assert(state.same && state.expanded && state.unchanged && state.car);
          assert.equal(state.newNetwork, 0);
          assert(state.scroll <= state.width + 1, JSON.stringify(state));
        });
        await s.c.setOffline(true);
        await p.evaluate(() => renderTripView());
        await check(dev + ' · hors connexion conserve les points et dégrade la fraîcheur', async () => {
          assert.equal(await p.locator('.rr-point').count(), 3);
          assert.match(await p.locator('.trip-radar').innerText(), /Hors ligne · cache/);
        });
        await p.evaluate(() => { appDay().activeCarId = S.cars[1].id; renderTripView(); });
        await check(dev + ' · changement de voiture préserve la source unique', async () => {
          assert.equal(await p.locator('.rr-point').count(), 3);
          assert.equal(await p.evaluate(() => APP_CONTEXT.trips[0].key), 'fixture-route');
        });
        await p.evaluate(() => { appDay().nextDestination.tripKey = 'nouvelle-destination'; renderTripView(); });
        await check(dev + ' · destination changée invalide la prévision précédente', async () => {
          assert.equal(await p.locator('.rr-point').count(), 0);
        });
        await p.evaluate(() => {
          appDay().nextDestination = null; APP_CONTEXT.snapshot.nextTrip = null; APP_CONTEXT.snapshot.activeTrip = null;
          renderTripView();
        });
        await check(dev + ' · annulation sans résidu visuel', async () => {
          assert.equal(await p.locator('.rr-point').count(), 0);
        });
        await s.c.setOffline(false);
      } finally { await s.c.close(); }
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ').slice(0, 600)));
    console.log(count + '/' + count + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + e.stack); process.exit(1); });
