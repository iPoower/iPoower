// Météo : origine explicite par occurrence Agenda, sans changer le lieu météo ni les autres rendez-vous.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
const start = '2026-10-09T07:00:00+02:00';
const view = p => p.evaluate(() => {
  const id = CAL && CAL.events && CAL.events[0] && TripCancel.eventId(CAL.events[0]);
  const t = APP_CONTEXT.trips.find(t => t.src === 'cal' && t.e && t.e.id === 'fiction-1' && t.l.k === 'go');
  return { id, row: id && appDay().agendaOrigins[id], uiLoc: UI.loc, trip: t && { key: t.key, from: t.from, to: t.to,
    pending: !!t.l.originPending }, keys: Object.keys(appDay().agendaOrigins || {}) };
});
const putEvents = p => p.evaluate(() => {
  const home = { ...S.locs[0], label: 'Domicile test', city: 'Domicile test' };
  const target = { lat: 49.58, lon: 2.35, label: 'Lieu d essai A', city: 'Lieu d essai A' };
  const other = { lat: 49.77, lon: 2.5, label: 'Lieu d essai B', city: 'Lieu d essai B' };
  const leg = (to, dep, arr) => ({ k: 'go', from: home, to, dep, arr,
    min: 50, km: 64, routed: true, pts: [], g: [[home.lat, home.lon], [to.lat, to.lon]] });
  CAL = { events: [
    { id: 'fiction-1', t: 'Essai A', s: '2026-10-09T12:00', e: '2026-10-09T13:00',
      lat: target.lat, lon: target.lon, loc: 'Lieu A', legs: [leg(target, '2026-10-09T10:50', '2026-10-09T11:40')] },
    { id: 'fiction-2', t: 'Essai B', s: '2026-10-09T17:00', e: '2026-10-09T18:00',
      lat: other.lat, lon: other.lon, loc: 'Lieu B', legs: [leg(other, '2026-10-09T15:50', '2026-10-09T16:40')] }
  ], updated: new Date(Date.now()).toISOString() };
  CALDONE = true; UI.view = 'meteo'; renderAll();
});
(async () => {
  const b = await BR.launch();
  let n = 0;
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: start, dev });
      const p = s.p;
      await putEvents(p); await s.settle(3);
      const initial = await view(p);
      assert(initial.trip, dev + ' : trajet Agenda absent');
      assert.equal(await p.locator('#secWx [data-act="cal-origin-open"]').count(), 1);
      assert.equal((await p.locator('#viewSeg button').all()).length, 5);
      n++;
      const open = p.locator('#secWx [data-act="cal-origin-open"]');
      dev === 'iphone' ? await open.tap() : await open.click();
      assert.equal(await p.locator('#calOriginMode').count(), 1);
      await p.locator('#calOriginMode').selectOption(await p.evaluate(() => S.work.to));
      assert.equal(await p.locator('#secWx [data-act="cal-origin-save"]').count(), 1);
      dev === 'iphone' ? await p.locator('#secWx [data-act="cal-origin-save"]').tap()
        : await p.locator('#secWx [data-act="cal-origin-save"]').click();
      await s.settle(4);
      const saved = await view(p);
      assert(saved.row, dev + ' : départ non persisté');
      assert.equal(saved.row.source, 'saved');
      assert.equal(saved.row.originId, await p.evaluate(() => S.work.to));
      assert.equal(saved.uiLoc, initial.uiLoc, dev + ' : lieu météo modifié');
      assert.equal(saved.keys.length, 1, dev + ' : autre rendez-vous modifié');
      n++;
      // En cours de recalcul OSRM (mock réseau muet), les anciennes valeurs ne sont jamais déclarées comme nouvelles.
      assert(saved.trip && saved.trip.pending, dev + ' : route périmée réutilisée');
      assert.match(await p.locator('#secWx .wx-trip').innerText(), /en cours|chargement|confirmer|attente/i);
      n++;
      const again = p.locator('#secWx [data-act="cal-origin-open"]');
      dev === 'iphone' ? await again.tap() : await again.click();
      assert.equal(await p.locator('#secWx [data-act="cal-origin-reset"]').count(), 1);
      dev === 'iphone' ? await p.locator('#secWx [data-act="cal-origin-reset"]').tap()
        : await p.locator('#secWx [data-act="cal-origin-reset"]').click();
      await s.settle(2);
      assert.equal((await view(p)).keys.length, 0);
      n++;
      await s.c.close();
    }
    assert.deepEqual(errors, [], 'Erreurs runtime : ' + errors.slice(0, 3).join(' | '));
    console.log(n + '/' + n + ' scénarios Origine Agenda OK');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
