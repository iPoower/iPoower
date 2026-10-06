// Contexte du jour : données synthétiques, vrais taps, quatre vues et expiration.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors, U } = require('./lib/context-session');
let n = 0, scope = {};
const read = p => p.evaluate(() => {
  const c = APP_CONTEXT.snapshot;
  return { day: c.dayType, place: c.currentLocation && c.currentLocation.id, origin: c.origin && c.origin.id, destination: c.destination && c.destination.id,
    status: c.status, car: c.activeCarId, occasion: UI.outfitOccasion, next: c.nextTrip && { from: c.nextTrip.from, to: c.nextTrip.to, car: c.nextTrip.carId, src: c.nextTrip.src, key: c.nextTrip.key },
    dayContext: USER_STORE.state.dayContext, work: S.work, stored: JSON.parse(localStorage.getItem(USER_STORE.key)) };
});
async function check(label, fn) { try { await fn(); n++; console.log('✅ ' + label); } catch (e) { console.error('❌ ' + label + ' · ' + e.message); throw e; } }
async function tap(p, selector) {
  const el = p.locator(selector).first(); scope.selector = selector;
  try { await el.tap(); } catch (e) {
    console.error('DIAGNOSTIC ' + JSON.stringify({ ...scope, present: await el.count(), visible: await el.isVisible().catch(() => false), enabled: await el.isEnabled().catch(() => false), state: await read(p), overlay: await p.evaluate(() => [...document.querySelectorAll('[role=dialog],dialog[open]')].map(x => x.id)) })); throw e;
  }
}
async function destination(p, id) { const details = p.locator('#dayContext details'); if (!(await details.getAttribute('open') != null)) await tap(p, '#dayContext summary'); await tap(p, '#dayContext [data-act=day-destination][data-id="' + id + '"]'); }
async function views(p, expected) {
  for (const v of ['pneus', 'meteo', 'tenue', 'analyse']) {
    scope.view = v; await tap(p, '#viewSeg [data-act=view][data-v=' + v + ']');
    const s = await read(p); for (const [k, x] of Object.entries(expected)) assert.equal(s[k], x, v + ' · ' + JSON.stringify(s));
    if (expected.destination === 'b') {
      assert.equal(s.next.to, 'Lieu B'); assert.equal(s.next.from, 'Travail test');
      if (v === 'pneus') assert.match(await p.locator('#secBrf').innerText(), /Lieu B/i);
      if (v === 'meteo') assert.match(await p.locator('#secWx .wx-route').innerText(), /Travail test.*Lieu B/i);
      if (v === 'tenue') assert.match(await p.locator('#secTenue').innerText(), /Lieu B/i);
      if (v === 'analyse') assert.equal(await p.evaluate(() => labCar().id), 'carB');
    }
  }
}
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) for (const profile of ['configured', 'clean']) {
      scope = { device: dev, profile, phase: 'préconditions' };
      const s = await session(b, { at: '2026-10-06T17:00:00+02:00', dev, unlock: profile === 'configured' }); let p = s.p;
      if (profile === 'clean') await tap(p, '[data-act=nocode]');
      // Préconditions techniques uniquement : aucune action utilisateur simulée par evaluate.
      await p.evaluate(() => {
        S.locs = [{ id: 'home', name: 'Domicile test', lat: 48.85, lon: 2.35 }, { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }];
        S.customs = [{ id: 'b', name: 'Lieu B', lat: 48.8, lon: 2.45 }];
        S.work = { from: 'home', to: 'work', dep: '06:30', ret: '18:00', days: [1, 2, 3], durMin: 40 };
        S.cars = [structuredClone(S.cars[0]), structuredClone(S.cars[0])]; S.cars.forEach((c, i) => { c.id = 'car' + (i ? 'B' : 'A'); c.name = c.short = 'Voiture ' + (i ? 'B' : 'A'); });
        CAL = { events: [] }; GPS = null; FIX = FIXPREV = null; S.gpsAuto = 0; saveSettings(); renderAll();
      });
      await tap(p, '[data-act=refresh]'); await s.settle();
      scope.phase = 'travail confirmé'; await tap(p, '#placeBar [data-act=place-confirm][data-place=work]');
      await check(dev + '/' + profile + ' · Maison est uniquement PRÉVU', async () => { const x = await read(p); assert.equal(x.destination, 'home'); assert.equal(x.dayContext.nextDestination, null); });
      scope.phase = 'WORK → CUSTOM'; await destination(p, 'b'); await tap(p, '[data-act=day-car][data-id=carB]');
      await s.settle();
      await check(dev + '/' + profile + ' · même destination et voiture dans les quatre vues', () => views(p, { place: 'work', destination: 'b', car: 'carB', status: 'work' }));
      const original = (await read(p)).work;
      await check(dev + '/' + profile + ' · touch 44 px, pas de débordement, comparaison intacte', async () => {
        assert(await p.evaluate(() => [...document.querySelectorAll('#dayContext button')].filter(x => x.getClientRects().length).every(x => x.getBoundingClientRect().height >= 44)));
        assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.equal(await p.evaluate(() => TCARS().length), 2); assert.equal(await p.evaluate(() => appTripCars().length), 1);
        assert.equal((await read(p)).next.car, 'carB');
      });
      await p.reload(); await s.settle();
      await check(dev + '/' + profile + ' · reload conserve le contexte', () => views(p, { place: 'work', destination: 'b', car: 'carB' }));
      await p.close(); p = await s.c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(U);
      await p.waitForFunction(() => APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.activeCarId === 'carB');
      await check(dev + '/' + profile + ' · réouverture conserve Lieu B', () => views(p, { place: 'work', destination: 'b', car: 'carB' }));
      scope.phase = 'congé puis travail'; await tap(p, '[data-act=day-type][data-v=off]');
      await check('Congé retire commute local sans réécrire planning', async () => { assert.equal((await read(p)).day, 'off'); assert(await p.evaluate(() => !APP_CONTEXT.snapshot.trips.some(t => t.src === 'work' && t.dep.slice(0, 10) === placeToday()))); assert.deepEqual((await read(p)).work, original); });
      await tap(p, '[data-act=day-type][data-v=work]');
      await check('Travail rétablit commute ; Tenue manuel reste prioritaire', async () => {
        await tap(p, '#viewSeg [data-act=view][data-v=tenue]'); assert.equal((await read(p)).occasion, 'office');
        await tap(p, '[data-act=outfit-occasion][data-v=outing]'); assert.equal((await read(p)).occasion, 'outing');
        await tap(p, '[data-act=day-type][data-v=work]'); assert.equal((await read(p)).occasion, 'outing');
      });
      scope.phase = 'arrivée Lieu B'; await tap(p, '#placeBar [data-act=place-leave]');
      await tap(p, '#placeBar [data-act=place-confirm][data-place=b]');
      await check('Arrivée termine destination et départ ensemble', async () => { const x = await read(p); assert.equal(x.place, 'b'); assert.equal(x.dayContext.nextDestination, null); assert.equal(x.stored.tripStart, null); });
      scope.phase = 'CUSTOM → HOME'; await destination(p, 'home');
      await check('Lieu B → Maison', async () => { const x = await read(p); assert.equal(x.destination, 'home'); assert.equal(x.origin, 'b'); });
      await tap(p, '#placeBar [data-act=place-confirm][data-place=home]');
      await destination(p, 'work'); await check('HOME → WORK', async () => { assert.equal((await read(p)).destination, 'work'); });
      await tap(p, '#placeBar [data-act=place-confirm][data-place=work]');
      await destination(p, 'home'); await check('WORK → HOME explicite', async () => assert.equal((await read(p)).destination, 'home'));
      await destination(p, ''); await tap(p, '#placeBar [data-act=place-leave]');
      await check('WORK → UNKNOWN ne devient jamais Maison', () => views(p, { status: 'travel', destination: null, car: 'carB' }));
      await p.reload(); await p.waitForFunction(() => APP_CONTEXT.snapshot && APP_CONTEXT.snapshot.status === 'travel');
      await check('UNKNOWN persiste après reload', async () => assert.equal((await read(p)).destination, null));
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
  } finally { await b.close(); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error('❌ ' + JSON.stringify(scope)); console.error(e); process.exit(1); });
