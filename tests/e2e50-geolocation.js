'use strict';
const assert = require('node:assert/strict'), BR = require('./lib/browser'), { session, HOME, WORK } = require('./lib/jarvis-session');
let count = 0;
const state = p => p.evaluate(() => ({ context: placeContext(placeInput()), fix: FIX, gps: GPS, raw: GEO.raw, geo: { permission: GEO.permission, status: GEO.status, error: GEO.error }, pending: PLACE_PENDING, network: NETLOC, auto: S.gpsAuto, watches: window.__watchCount(), phase: LIVE.phase, diag: Object.fromEntries(placeDiagRows()), message: document.querySelector('#locMsg').textContent }));
async function check(name, fn) { await fn(); count++; console.log('✅ ' + name); }
(async () => {
  const browser = await BR.launch();
  try {
    for (const iphone of [false, true]) {
      const s = await session(browser, { iphone, permissionAPI: !iphone }), p = s.p, tag = iphone ? 'iPhone / Permissions API absente' : 'PC';
      await p.evaluate(() => { CAL = { events: [] }; renderAll(); });
      await check(tag + ' · lancement : aucune position inventée', async () => { assert.equal((await state(p)).context.source, 'none'); });
      for (const [code, label] of [[1, 'PERMISSION_DENIED'], [2, 'POSITION_UNAVAILABLE'], [3, 'TIMEOUT']]) {
        await p.evaluate(code => { __geo.error = code; }, code); await p.locator('[data-act=locate]').first().click(); await s.settle();
        await check(tag + ' · erreur ' + label + ' expliquée', async () => { const x = await state(p); assert.equal(x.geo.error.code, label); assert(x.message.length > 20); assert.equal(x.context.place, null); });
      }
      await p.evaluate(() => { __geo.error = 0; __geo.acc = 6000; }); await p.locator('[data-act=locate]').first().click(); await s.settle();
      await check(tag + ' · navigateur approximatif : aucune déduction IP ou VPN', async () => { const x = await state(p); assert.equal(x.network, null); assert.equal(x.raw.acc, 6000); assert.equal(x.context.place, null); assert(!/VPN|Position réseau/.test(x.message)); assert.equal(x.auto, 1); });
      await p.evaluate(h => __geoPush({ ...h, error: 0, age: 0 }), HOME); await s.settle();
      await check(tag + ' · GPS domicile automatique sans clic de confirmation', async () => { const x = await state(p); assert.equal(x.context.place.id, 'home'); assert.equal(x.context.source, 'gps'); assert.equal(x.context.originLock, 'home'); assert.equal(x.geo.permission, 'autorisée'); assert.match(x.diag['Géolocalisation navigateur (brute)'], /±18 m.*source : API navigateur/); assert.match(x.diag['Distance domicile'], /^2[0-9] m$/); });
      await p.evaluate(w => { NETLOC = { ...w, acc: 6000, ts: Date.now(), name: 'Réseau test' }; __geoPush({ ...w, acc: 900 }); }, WORK); await s.settle();
      await check(tag + ' · GPS conservé malgré IP divergente et navigateur à 900 m', async () => { const x = await state(p); assert.equal(x.fix.acc, 18); assert.equal(x.context.place.id, 'home'); assert.equal(x.context.source, 'gps'); assert.match(x.diag['Position réseau / IP'], /±6 km/); });
      await p.clock.runFor(20 * 60e3); await p.evaluate(w => __geoPush(w), WORK); await s.settle();
      await check(tag + ' · un point au travail ne suffit pas', async () => { const x = await state(p); assert.equal(x.context.place.id, 'home'); assert(x.pending); });
      await p.evaluate(w => __geoPush(w), WORK); await s.settle();
      await check(tag + ' · second relevé cohérent reconnaît le travail', async () => { const x = await state(p); assert.equal(x.context.place.id, 'work'); assert.equal(x.context.source, 'gps'); });
      await p.evaluate(() => __geoPush({ lat: 48.9007, lon: 2.2502, speed: null })); await s.settle();
      await check(tag + ' · drift de 25 m conserve le lieu, aucun trajet inventé', async () => { const x = await state(p); assert.equal(x.context.place.id, 'work'); assert.notEqual(x.phase, 'active'); });
      await p.evaluate(() => __geoPush({ lat: 49.5, lon: 1.0, acc: 18 })); await s.settle();
      await check(tag + ' · saut impossible refusé', async () => { const x = await state(p); assert.equal(x.context.place.id, 'work'); assert.match(x.diag['Sources écartées'], /impossible/); });
      await p.evaluate(() => { __hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      await check(tag + ' · suspension : suivi arrêté', async () => assert.equal((await state(p)).watches, 0));
      await p.clock.runFor(30 * 60e3);
      await p.evaluate(h => { Object.assign(__geo, h, { age: 40 * 60e3 }); __hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('focus')); }, HOME); await s.settle();
      await check(tag + ' · reprise : cache périmé refusé, un seul watch', async () => { const x = await state(p); assert.equal(x.watches, 1); assert.equal(x.context.place.id, 'work'); assert.match(x.diag['Sources écartées'], /périmé/); const options = await p.evaluate(() => __geoLog.filter(x => x.kind === 'get').at(-1).options); assert.equal(options.maximumAge, 0); assert(options.enableHighAccuracy && options.timeout); });
      await p.evaluate(h => __geoPush({ ...h, age: 0 }), HOME); await s.settle(); await p.evaluate(h => __geoPush(h), HOME); await s.settle();
      await check(tag + ' · retour domicile confirmé par deux observations', async () => assert.equal((await state(p)).context.place.id, 'home'));
      await p.reload(); await s.settle(12);
      await check(tag + ' · refresh : GPS demandé, sans watch dupliqué', async () => { const x = await state(p); assert.equal(x.context.place.id, 'home'); assert.equal(x.watches, 1); });
      await cOffline(true); await p.locator('#statusbar [data-act=refresh]').click(); await s.settle();
      await check(tag + ' · offline préserve la localisation et le cache météo', async () => { assert.equal((await state(p)).context.place.id, 'home'); assert.match(await p.locator('#statusbar').innerText(), /HORS LIGNE/); });
      await cOffline(false); await s.settle(8);
      await check(tag + ' · retour online réactualise sans perdre le GPS', async () => { assert.equal((await state(p)).context.place.id, 'home'); assert.match(await p.locator('#statusbar').innerText(), /LIVE/); });
      await p.evaluate(() => { document.querySelector('#settings').open = true; renderSettings(true); }); await s.settle(1); await p.locator('[data-act=gps-forget]').click(); await s.settle();
      await p.evaluate(w => __geoOldPush(w), WORK); await s.settle();
      await check(tag + ' · oublier : anciens callbacks ignorés', async () => { const x = await state(p); assert.equal(x.auto, 0); assert.equal(x.fix, null); assert.equal(x.raw, null); assert.equal(x.watches, 0); });
      await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click(); await s.settle();
      await check(tag + ' · override Je suis chez moi conservé', async () => { const x = await state(p); assert.equal(x.context.source, 'manual'); assert.equal(x.context.place.id, 'home'); assert(!/VPN/.test(await p.locator('#placeBar').innerText())); });
      await p.locator('#placeBar [data-act=place-leave]').click(); await s.settle();
      await p.evaluate(() => { PLACE = { conf: null, last: null }; NETLOC = { lat: 48.9, lon: 2.25, acc: 6000, ts: Date.now() }; renderAll(); });
      await check(tag + ' · IP seule : indéterminé, confirmation disponible', async () => { const x = await state(p); assert.equal(x.context.place, null); assert.equal(x.context.source, 'network'); assert.match(x.context.badge, /Position réseau approximative · précision ~6 km/); assert(!/VPN/.test(x.context.badge)); });
      if (!iphone) {
        await p.evaluate(() => { S.gpsAuto = 1; __permissionSet('denied'); });
        await check('Permissions API · révocation arrête le suivi', async () => assert.equal((await state(p)).geo.permission, 'refusée'));
        await p.evaluate(() => { Object.assign(__geo, { lat: 48.8502, lon: 2.3501, acc: 18, error: 0, age: 0 }); __permissionSet('granted'); }); await s.settle();
        await check('Permissions API · autorisation rétablie relance une demande', async () => assert.equal((await state(p)).watches, 1));
      }
      assert.deepEqual(s.errors, []); await s.c.close();
      async function cOffline(value) { await s.c.setOffline(value); await p.evaluate(value => window.dispatchEvent(new Event(value ? 'offline' : 'online')), value); }
    }
    // Permission et API du moteur navigateur, en complément des erreurs/horodatages contrôlés ci-dessus.
    const real = await session(browser, { nativeGeo: true }); await real.p.locator('[data-act=locate]').first().click(); await real.settle(8);
    await check('API native du moteur · position autorisée reconnue au domicile', async () => assert.equal((await real.p.evaluate(() => placeNow())).place.id, 'home'));
    assert.deepEqual(real.errors, []); await real.c.close();
  } finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); process.exit(1); });
