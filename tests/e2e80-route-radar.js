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
        const synthetic = await p.evaluate(() => {
          const m = M[UI.loc] || Object.values(M).find(Boolean);
          const hs = m && m.hs || [{ t: '2026-10-19T15:00', T: 8, P: 1, vis: 800, wind: 15, gust: 30 }];
          const i = m && m.nowI >= 0 ? m.nowI : 0;
          const at = Date.now(), dep = localTs(at).slice(0, 16);
          const point = (f, k) => ({ hs, i: Math.min(i, hs.length - 1), f, lat: 49 + f, lon: 2 + f,
            km: f * 30, t: addMin(dep, k * 10) });
          const t = { key: 'fixture-route', src: 'local', dep, arr: addMin(dep, 20), from: 'Lieu A', to: 'Lieu B',
            l: { routed: true, km: 30, min: 20, g: [[49, 2], [49.5, 2.5], [50, 3]], pts: [{ f: .5 }],
              from: { name: 'Lieu A', lat: 49, lon: 2 }, to: { name: 'Lieu B', lat: 50, lon: 3 } },
            seq: [point(0, 0), point(.5, 1), point(1, 2)] };
          const d = appDay();
          d.nextDestination = { source: 'manual', tripKey: t.key, dep: t.dep,
            confirmedAt: at, expiresAt: DayContext.tripExpiry(t.dep, at), createdAt: at, updatedAt: at,
            originPoint: { id: 'manual-origin', lat: 49, lon: 2, name: 'Lieu A' },
            destinationPoint: { id: 'manual-destination', lat: 50, lon: 3, name: 'Lieu B' } };
          window.__radarSelection = { ...d.nextDestination };
          APP_CONTEXT.trips = [t]; APP_CONTEXT.snapshot.trips = [t];
          window.__radarFixture = t;
          renderTripView();
          const root = document.querySelector('#secTrip .trip-radar');
          const detail = root.querySelector('details'); detail.open = true;
          const radar = RouteRadar.snapshot({ trip: t, offline: offlineNow() });
          return { projected: radar.points.length, rendered: root.querySelectorAll('.rr-point').length,
            band: root.querySelectorAll('.rr-band > span').length, text: root.textContent };
        });
        await check(dev + ' · trois points météo et provenance explicite au rendu initial', async () => {
          assert.equal(synthetic.projected, 3, 'trois échantillons synthétiques sont présents');
          assert.equal(synthetic.rendered, 3, 'projection non perdue entre moteur et HTML : ' + JSON.stringify(synthetic));
          assert.equal(synthetic.band, 3);
          for (const word of ['DÉPART', 'PARCOURS', 'ARRIVÉE', 'Prévisions aux points', 'Position documentée'])
            assert(synthetic.text.includes(word), 'libellé manquant : ' + word);
        });
        const state = await p.evaluate(() => {
          // Le test contrôle un instantané du trajet pendant le rendu.
          // Le contexte vivant peut se recalculer entre deux opérations Playwright.
          APP_CONTEXT.trips = [window.__radarFixture];
          APP_CONTEXT.snapshot.trips = [window.__radarFixture];
          appDay().nextDestination = { ...window.__radarSelection };
          renderTripView();
          const node = document.querySelector('.trip-radar details'); node.open = true;
          const before = JSON.stringify(appDay().nextDestination);
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
        const offlineEvidence = await p.evaluate(() => {
          APP_CONTEXT.trips = [window.__radarFixture];
          APP_CONTEXT.snapshot.trips = [window.__radarFixture];
          appDay().nextDestination = { ...window.__radarSelection };
          renderTripView();
          return { count: document.querySelectorAll('.rr-point').length,
            text: document.querySelector('.trip-radar').textContent };
        });
        await check(dev + ' · hors connexion conserve les points et dégrade la fraîcheur', async () => {
          assert.equal(offlineEvidence.count, 3);
          assert.match(offlineEvidence.text, /Hors ligne · cache/);
        });
        const otherCar = await p.evaluate(() => {
          // Une action UI réelle reconstruit le contexte canonique : réinstaller
          // le trajet fictif après le changement pour n'évaluer que Route Radar.
          const d = appDay(); d.activeCarId = S.cars[1].id;
          d.nextDestination = { ...window.__radarSelection };
          APP_CONTEXT.trips = [window.__radarFixture];
          APP_CONTEXT.snapshot.trips = [window.__radarFixture];
          renderTripView();
          return { count: document.querySelectorAll('.rr-point').length,
            key: APP_CONTEXT.trips[0].key, selected: appDay().nextDestination?.tripKey || null,
            car: appDay().activeCarId };
        });
        await check(dev + ' · changement de voiture préserve la source unique', async () => {
          assert.equal(otherCar.count, 3);
          assert.equal(otherCar.key, 'fixture-route');
          assert.equal(otherCar.selected, 'fixture-route');
          assert(otherCar.car);
        });
        const replaced = await p.evaluate(() => {
          appDay().nextDestination.tripKey = 'nouvelle-destination'; renderTripView();
          return document.querySelectorAll('.rr-point').length;
        });
        await check(dev + ' · destination changée invalide la prévision précédente', async () => {
          assert.equal(replaced, 0);
        });
        const cancelled = await p.evaluate(() => {
          appDay().nextDestination = null; APP_CONTEXT.snapshot.nextTrip = null; APP_CONTEXT.snapshot.activeTrip = null;
          renderTripView();
          return document.querySelectorAll('.rr-point').length;
        });
        await check(dev + ' · annulation sans résidu visuel', async () => {
          assert.equal(cancelled, 0);
        });
        await s.c.setOffline(false);
      } finally { await s.c.close(); }
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ').slice(0, 600)));
    console.log(count + '/' + count + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + e.stack); process.exit(1); });
