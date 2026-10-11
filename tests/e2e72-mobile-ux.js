// Rendu et vrais gestes sur les fixtures existantes. Aucun profil réel, GPS ou réseau externe.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { BR, session, errors } = require('./lib/context-session');
let stage = '', count = 0;
const check = async (label, fn) => { stage = label; await fn(); count++; console.log('✅ ' + label); };
const views = ['meteo', 'pneus', 'trajet', 'garage', 'analyse'];
const root = { meteo: '#secWx', pneus: '#secCars', trajet: '#secTrip', garage: '#secGarage', analyse: '#secLab' };
async function overflow(p) {
  const size = await p.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  assert(size.document <= size.width + 1, JSON.stringify(size));
}
async function run(browser, width, dev) {
  const s = await session(browser, { at: '2026-10-07T06:00:00+02:00', dev }), p = s.p;
  const label = BR.NAME + ' ' + width;
  const press = selector => dev === 'iphone' ? p.locator(selector).first().tap() : p.locator(selector).first().click();
  try {
    await p.setViewportSize({ width, height: dev === 'iphone' ? 896 : 900 });
    await p.evaluate(() => { appSetCar(S.cars[0].id); document.querySelector('#placeBar [data-act=place-confirm][data-place=home]').click(); });
    await s.settle(4);
    const source = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work }));
    await check(label + ' · navigation familière', async () => {
      assert.deepEqual(await p.locator('#viewSeg [data-v]').evaluateAll(xs => xs.map(x => x.dataset.v)), views);
    });
    const metrics = [];
    for (const view of views) {
      await press('#viewSeg [data-v=' + view + ']'); await s.settle(2);
      await p.evaluate(() => window.scrollTo(0, 0));
      await check(label + ' · ' + view + ' essentiel visible, détails repliés et aucun débordement', async () => {
        assert(await p.locator(root[view]).isVisible()); await overflow(p);
        const folds = p.locator(root[view] + ' details[data-ux]');
        assert.equal(await folds.evaluateAll(xs => xs.filter(x => x.open).length), 0);
        if (view === 'meteo') assert(await p.locator('#secWx .wx-hero').isVisible());
        if (view === 'pneus') {
          assert(await p.locator('#decisionCore .decision-mount').isVisible());
          assert(await p.locator('#secCars .car-active .tirebox').first().isVisible());
        }
        if (view === 'garage') {
          assert(await p.locator('#secGarage .garage-mounted').first().isVisible());
          assert(await p.locator('#secGarage .garage-meter').first().isVisible());
        }
        if (view === 'analyse') assert.match(await p.locator('#secLab .lab-hero').innerText(), /Confiance/i);
        if (view === 'trajet') {
          assert(await p.locator('#secTripSummary').isVisible());
          const pos = await p.evaluate(() => ({ summary: document.getElementById('secTripSummary').getBoundingClientRect().top, form: document.getElementById('secTrip').getBoundingClientRect().top }));
          assert(pos.summary < pos.form, JSON.stringify(pos));
          assert.equal(await p.locator('#secTripSummary a').innerText(), 'Modifier le trajet');
        }
        const size = await p.evaluate(id => {
          const r = document.querySelector(id).getBoundingClientRect();
          return { top: Math.round(r.top), height: Math.round(r.height), documentHeight: document.documentElement.scrollHeight };
        }, root[view]);
        metrics.push({ view, ...size });
        if (width === 414 || dev === 'pc') await p.screenshot({ path: path.join(process.env.SP, 'place-ux-' + dev + '-' + view + '.png') });
      });
      const keys = await p.locator(root[view] + ' details[data-ux]').evaluateAll(xs => xs.map(x => x.dataset.ux));
      for (const key of keys) {
        const selector = root[view] + ' details[data-ux="' + key + '"]';
        await check(label + ' · ouvrir ' + key + ', actualiser sans perdre le focus', async () => {
          await press(selector + ' > summary'); await s.settle(1);
          assert(await p.locator(selector).evaluate(x => x.open)); await overflow(p);
          await p.locator(selector + ' > summary').focus();
          await p.evaluate(() => { renderAll(); renderAll(); });
          assert(await p.locator(selector).evaluate(x => x.open && document.activeElement === x.firstElementChild));
          await press(selector + ' > summary'); await s.settle(1);
          assert.equal(await p.locator(selector).evaluate(x => x.open), false);
        });
      }
      if (dev === 'iphone') await check(label + ' · ' + view + ' cibles tactiles et champs iOS', async () => {
        const bad = await p.evaluate(id => [...document.querySelectorAll(id + ' button, ' + id + ' details[data-ux] > summary, ' + id + ' input:not([type=radio]):not([type=checkbox]):not([type=file]), ' + id + ' select')]
          .filter(x => x.getBoundingClientRect().height > 0).filter(x => x.getBoundingClientRect().height < 43.5)
          .map(x => x.id || x.dataset.act || x.tagName), root[view]);
        assert.deepEqual(bad, []);
      });
    }
    await check(label + ' · données inchangées par le rendu', async () => {
      assert.equal(await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work })), source);
    });
    await check(label + ' · rechargement et hors ligne', async () => {
      await p.evaluate(() => window.TWRC_VAULT.flush()); await p.reload(); await s.settle(10);
      assert.equal(await p.evaluate(() => UI.view), 'analyse');
      assert.equal(await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work })), source);
      await s.c.setOffline(true);
      for (const view of views) { await press('#viewSeg [data-v=' + view + ']'); await s.settle(1); assert(await p.locator(root[view]).isVisible()); await overflow(p); }
    });
    fs.writeFileSync(path.join(process.env.SP, 'place-ux-' + width + '.json'), JSON.stringify({ browser: BR.NAME, width, metrics, physicalDevice: false }, null, 2));
  } finally { await s.c.close(); }
}
(async () => {
  const browser = await BR.launch();
  try { for (const [width, dev] of [[414, 'iphone'], [375, 'iphone'], [320, 'iphone'], [1280, 'pc']]) await run(browser, width, dev); }
  finally { await browser.close(); }
  assert.deepEqual(errors, []); console.log(count + '/' + count + ' scénarios UX mobile OK');
})().catch(e => { console.error('❌ UX · ' + stage + ' · ' + String(e.message || e).split('\n')[0]); process.exit(1); });
