// Saisies réelles PC/iPhone simulé : carte et Analyse cohérentes, reload et hors ligne.
'use strict';
const assert = require('node:assert/strict'), { session, BR, errors } = require('./lib/context-session');
let n = 0, step = '';
async function check(label, fn) { step = label; await fn(); n++; console.log('✅ ' + label); }
async function reveal(p, selector) {
  if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
  const parents = p.locator(selector).locator('xpath=ancestor::details[not(@open)]');
  while (await parents.count()) await parents.first().locator(':scope > summary').click();
}
async function reading(p, s, km, mm) {
  await reveal(p, '#odo-0'); await p.fill('#odo-0', String(km));
  await p.locator('#settings [data-act=odo][data-i="0"]').click(); await s.settle(1);
  await reveal(p, '#trd-0'); await p.fill('#trd-0', String(mm));
  await p.locator('#settings [data-act=tread-add][data-i="0"]').click(); await s.settle(1);
}
const values = p => p.evaluate(() => ({ rate: tyreStateOf(S.cars[0]).tread.rate, card: wearInfo(S.cars[0]), text: wearLine(S.cars[0]) }));
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: '2026-10-10T15:00:00+02:00', dev }), p = s.p;
      // Une mesure de référence datée ; toutes les nouvelles mesures passent par les vrais boutons.
      await p.evaluate(() => { const c = S.cars[0]; c.odo = [{ d: '2026-09-01', km: 20000 }];
        Object.assign(c.tire, { tread: 6.4, treadAv: 6.4, treadAr: 6.4, treadEst: 0,
          treads: [{ d: '2026-09-01', km: 20000, mm: 6.4 }] }); saveSettings(); rebuild(); renderAll(); });
      await check(dev + ' · relevé à 100 km : carte sans projection, même décision que le domaine', async () => {
        await reading(p, s, 20100, 6.3); const v = await values(p);
        assert.equal(v.rate, null); assert.equal(v.card.rate ?? null, null);
        assert.match(v.text, /au moins 1 000 km/); assert.doesNotMatch(v.text, /mm vers/);
      });
      await check(dev + ' · relevé à 1 000 km : projection présente et taux partagé', async () => {
        await reading(p, s, 21000, 6.2); const v = await values(p);
        assert.equal(v.card.rate, v.rate); assert(Math.abs(v.rate - 0.2) < 1e-9);
        assert.match(v.text, /0,20 mm \/ 1 000 km/); assert.match(v.text, /3 mm vers/);
        await p.locator('#viewSeg [data-act=view][data-v=pneus]').click();
        assert.match(await p.locator('#secCars .wear').first().innerText(), /0,20 mm \/ 1 000 km/);
      });
      await check(dev + ' · rechargement puis hors ligne : mesures et projection conservées', async () => {
        const before = await values(p); await p.evaluate(() => window.TWRC_VAULT.flush());
        await p.reload(); await s.settle(8); const after = await values(p);
        assert.deepEqual(after.card, before.card); assert.equal(after.rate, before.rate);
        await s.c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2);
        assert.deepEqual((await values(p)).card, before.card);
        await p.locator('#viewSeg [data-act=view][data-v=analyse]').click();
        assert(await p.locator('#secLab').isVisible());
      });
      await s.c.close();
    }
    await check('aucune exception JavaScript', async () => assert.deepEqual(errors, []));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + (step || 'préparation') + ' · ' + e.message); process.exitCode = 1; });
