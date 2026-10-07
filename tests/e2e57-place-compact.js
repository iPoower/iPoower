// Contexte canonique, vrais clics/taps et captures sur iPhone 11 Pro Max / desktop.
// Noms et coordonnées fictifs ; le libellé travail est plus long que celui de la capture utilisateur.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { session, BR, errors, U } = require('./lib/context-session');
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const state = p => p.evaluate(() => {
  const c = APP_CONTEXT.snapshot;
  return { status: c.status, place: c.currentLocation && c.currentLocation.id, confirmation: c.confirmation,
    weather: c.weatherLocationId, origin: c.origin && c.origin.id, destination: c.destination && c.destination.id,
    active: c.activeTrip && c.activeTrip.key, gps: GPS, raw: GEO.raw, fix: FIX,
    stored: JSON.parse(localStorage.getItem(USER_STORE.key)) };
});
const compact = async p => {
  assert.equal(await p.locator('#placeBar .place.compact:not(.expanded)').count(), 1);
  assert.equal(await p.locator('#placeBar [data-act=place-toggle]').getAttribute('aria-expanded'), 'false');
  assert(!await p.locator('#placeActions').isVisible()); assert(!await p.locator('#locChips').isVisible());
  assert.equal(await p.locator('#placeBar button:visible').count(), 2);
};
async function tap(p, dev, selector) { const el = p.locator(selector).first(); if (dev === 'iphone') await el.tap(); else await el.click(); }
async function confirm(p, dev, id) { await tap(p, dev, '#placeBar [data-act=place-confirm][data-place=' + id + ']'); }
async function modify(p, dev) { await tap(p, dev, '#placeBar [data-act=place-toggle]'); }
async function chooseDestination(p, dev, id) {
  await tap(p, dev, '#viewSeg [data-act=view][data-v=pneus]');
  if (await p.locator('#dayContext .day-editor').getAttribute('open') == null) await tap(p, dev, '#dayContext .day-editor > summary');
  if (await p.locator('#dayContext .day-destination').getAttribute('open') == null) await tap(p, dev, '#dayContext .day-destination > summary');
  await tap(p, dev, '#dayContext [data-act=day-destination][data-id="' + id + '"]');
}
async function layout(p) {
  return p.evaluate(() => {
    const bar = document.querySelector('#placeBar'), chips = document.querySelector('#locChips'), r = bar.getBoundingClientRect();
    const shown = chips.getClientRects().length > 0, bottom = shown ? chips.getBoundingClientRect().bottom : r.bottom;
    const buttons = [...bar.querySelectorAll('button')].filter(el => el.getClientRects().length);
    return { height: bottom - r.top, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      small: buttons.filter(el => { const b = el.getBoundingClientRect(); return b.width < 44 || b.height < 44; }).map(el => el.textContent),
      clipped: [...bar.querySelectorAll('.pl-info > *, button')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent) };
  });
}
async function setup(b, dev) {
  const s = await session(b, { at: '2026-10-07T07:10:00+02:00', dev });
  await s.p.evaluate(() => {
    stopGps(); GPS = FIX = FIXPREV = PLACE_FIX = PLACE_PENDING = null; PLACE_HOLD = false;
    GEO.raw = GEO.error = null; GEO.permission = 'à demander'; S.gpsAuto = 0;
    S.locs = [{ id: 'home', name: 'Maison fictive', lat: 48.85, lon: 2.35 }, { id: 'work', name: 'Commune fictive / Agglomération test', lat: 48.9, lon: 2.25 }];
    S.customs = [{ id: 'site-a', name: 'Destination A fictive', lat: 48.8, lon: 2.4 }, { id: 'site-b', name: 'Destination B au nom particulièrement long', lat: 48.7, lon: 2.5 }];
    S.work = { from: 'home', to: 'work', dep: '06:30', ret: '16:00', days: [1, 2, 3], durMin: 40 };
    CAL = { events: [] }; saveSettings(); renderAll();
  });
  return s;
}
async function capture(p, dev, name) {
  await tap(p, dev, '#viewSeg [data-act=view][data-v=pneus]');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(process.env.SP, 'place-' + name + '-' + dev + '-' + BR.NAME + '.png') });
}
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await setup(b, dev), p = s.p;
      await check(dev + ' · inconnu : toutes les confirmations et la localisation restent visibles', async () => {
        assert.equal((await state(p)).status, 'unknown'); assert(await p.locator('#locChips').isVisible());
        assert.equal(await p.locator('#placeBar [data-act=place-confirm]:visible').count(), 4);
        assert.equal(await p.locator('#placeBar .compact').count(), 0);
      });
      await confirm(p, dev, 'work');
      await check(dev + ' · AU TRAVAIL confirmé à 07:10 : compact, météo locale, départ direct', async () => {
        await compact(p); const x = await state(p), text = await p.locator('#placeBar').innerText();
        assert.equal(x.status, 'work'); assert.equal(x.confirmation.placeId, 'work');
        assert.match(text, /AU TRAVAIL.*Commune fictive/); assert.match(text, /Confirmé 07:10/); assert.match(text, /météo locale/);
        assert.equal((text.match(/Commune fictive/g) || []).length, 1);
        assert.match(await p.locator('[data-act=place-leave]').innerText(), /Je quitte le travail/);
        assert(!('lat' in x.confirmation)); assert.equal(x.stored.place.conf.placeId, 'work');
      });
      const small = await layout(p); await capture(p, dev, 'compact');
      await check(dev + ' · Pneus, Météo, Tenue, Analyse : même lieu confirmé et même météo', async () => {
        const before = await state(p);
        for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
          await tap(p, dev, '#viewSeg [data-act=view][data-v=' + view + ']'); await compact(p);
          const x = await state(p); assert.equal(x.status, 'work'); assert.equal(x.place, 'work'); assert.equal(x.weather, 'work');
          assert.deepEqual(x.confirmation, before.confirmation);
        }
      });
      await modify(p, dev);
      await check(dev + ' · Modifier ouvre les corrections, Ma position et Météo consultée', async () => {
        assert.equal(await p.locator('[data-act=place-toggle]').getAttribute('aria-expanded'), 'true');
        assert.equal(await p.locator('#placeActions [data-act=place-confirm]:visible').count(), 3);
        assert(await p.locator('#locChips [data-act=locate]').isVisible()); assert(await p.locator('#locChips [data-act=locs-toggle]').isVisible());
        assert.match(await p.locator('#placeBar').innerText(), /source : confirmation utilisateur/);
      });
      const full = await layout(p); await capture(p, dev, 'expanded');
      if (dev === 'pc') await check('desktop · Modifier au clavier conserve le focus et les commandes', async () => {
        const toggle = p.locator('#placeBar [data-act=place-toggle]'); await toggle.focus(); await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false'); assert(await toggle.evaluate(el => el === document.activeElement));
        await toggle.press('Space'); assert.equal(await toggle.getAttribute('aria-expanded'), 'true'); assert(await toggle.evaluate(el => el === document.activeElement));
      });
      await check(dev + ' · gain vertical ≥ 40 %, aucune coupure/débordement et cibles ≥ 44 px', async () => {
        assert(small.height <= full.height * 0.6, JSON.stringify({ small, full }));
        assert(small.height <= 140, JSON.stringify(small));
        for (const x of [small, full]) { assert(!x.overflow, JSON.stringify(x)); assert.deepEqual(x.small, []); assert.deepEqual(x.clipped, []); }
      });
      fs.writeFileSync(path.join(process.env.SP, 'place-metrics-' + dev + '-' + BR.NAME + '.json'), JSON.stringify({ compact: small, expanded: full, reduction: 1 - small.height / full.height }, null, 2));
      await tap(p, dev, '#locChips [data-act=locs-toggle]'); await tap(p, dev, '#locChips [data-act=loc][data-id=home]'); await modify(p, dev);
      await check(dev + ' · une météo distante reste nommée sans déplacer l’utilisateur', async () => {
        await compact(p); assert.equal((await state(p)).place, 'work'); assert.equal((await state(p)).weather, 'home');
        assert.match(await p.locator('#placeBar').innerText(), /Météo : Maison fictive/);
      });
      await modify(p, dev); await confirm(p, dev, 'home');
      await check(dev + ' · nouvelle confirmation domicile : fermeture automatique et contexte partagé', async () => { await compact(p); assert.equal((await state(p)).status, 'home'); assert.equal((await state(p)).weather, 'home'); });
      await modify(p, dev); await confirm(p, dev, 'site-b');
      await check(dev + ' · SUR PLACE : compact et libellé long lisible', async () => { await compact(p); assert.equal((await state(p)).status, 'arrived'); assert.deepEqual((await layout(p)).clipped, []); });
      await modify(p, dev); await confirm(p, dev, 'work'); await modify(p, dev);
      const other = await s.c.newPage(); await other.goto(U); await s.settle(4);
      await modify(other, dev); await confirm(other, dev, 'home');
      await p.waitForFunction(() => APP_CONTEXT.snapshot.status === 'home');
      await check(dev + ' · confirmation dans une autre fenêtre : état propagé et panneau replié', async () => { await compact(p); await compact(other); assert.deepEqual((await state(p)).confirmation, (await state(other)).confirmation); });
      await other.close(); await p.reload(); await s.settle(4);
      await check(dev + ' · réouverture PWA : confirmation conservée et compact automatique', () => compact(p));
      await modify(p, dev); await confirm(p, dev, 'work'); await chooseDestination(p, dev, '');
      await check(dev + ' · destination à choisir : réouverture automatique sans perdre le travail confirmé', async () => {
        assert.equal((await state(p)).status, 'work'); assert(await p.locator('#placeActions').isVisible()); assert(await p.locator('#locChips').isVisible());
        assert.equal(await p.locator('#placeBar .compact').count(), 0);
      });
      await chooseDestination(p, dev, 'home'); await compact(p); await tap(p, dev, '#placeBar [data-act=place-leave]');
      await check(dev + ' · Je quitte le travail : même retour canonique, départ réel et panneau complet', async () => {
        const x = await state(p); assert.equal(x.status, 'travel'); assert.equal(x.origin, 'work'); assert.equal(x.destination, 'home');
        assert.equal(x.confirmation, null); assert(x.active); assert.equal(x.stored.tripStart.key, x.active);
        assert.equal(await p.locator('#placeBar .compact').count(), 0); assert(await p.locator('#locChips').isVisible());
      });
      await confirm(p, dev, 'home'); await compact(p); await s.c.close();
      const denied = await setup(b, dev), q = denied.p;
      await q.evaluate(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => ({ getCurrentPosition(ok, err) { setTimeout(() => err({ code: 1 }), 0); }, watchPosition() { return 1; }, clearWatch() {} }) }));
      await tap(q, dev, '#locChips [data-act=locate]'); await denied.settle(2); await confirm(q, dev, 'work');
      await check(dev + ' · GPS refusé + travail confirmé : compact, lieu conservé et aucune position GPS inventée', async () => {
        await compact(q); const x = await state(q); assert.equal(x.status, 'work'); assert.equal(x.place, 'work');
        assert.equal(x.gps, null); assert.equal(x.raw, null); assert.equal(x.fix, null); assert.equal(x.stored.gps, null);
        assert.match(await q.locator('#placeBar').innerText(), /GPS indisponible/); assert(!await q.locator('#locMsg').isVisible());
        const m = await layout(q); assert(!m.overflow); assert.deepEqual(m.clipped, []); assert.deepEqual(m.small, []); assert(m.height <= 150);
      });
      await capture(q, dev, 'gps-denied'); await modify(q, dev);
      await check(dev + ' · l’aide existante pour réactiver le GPS reste accessible', async () => { assert(await q.locator('#locMsg').isVisible()); assert.match(await q.locator('#locMsg').innerText(), /Localisation refusée.*réglages/); assert(await q.locator('#locChips [data-act=locate]').isVisible()); });
      await denied.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + e.message); process.exit(1); });
