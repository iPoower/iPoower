// Lot 1 · vraisemblance de la position (iPhone et PC, Chromium et WebKit). Lieux fictifs uniquement :
// Maison test / Travail test (lib/jarvis-session) ; « point lointain » fictif ≈ 300 km au sud.
// Une position approximative (> 100 m) loin de tous les lieux n'est jamais utilisée en silence pour la météo ;
// l'utilisateur choisit « Utiliser mon lieu principal » ou « Utiliser quand même ». Un GPS précis lointain reste accepté.
'use strict';
const assert = require('node:assert/strict'), BR = require('./lib/browser'), { session, HOME } = require('./lib/jarvis-session');
const FAR = { lat: 46.15, lon: 2.35 };
let count = 0, step = '';
async function check(name, fn) { step = name; await fn(); count++; console.log('✅ ' + name); }
const state = p => p.evaluate(() => ({ gps: GPS && { lat: GPS.lat, lon: GPS.lon, acc: GPS.acc }, loc: UI.loc, conf: PLACE.conf && PLACE.conf.placeId,
  doubt: PLACE_DOUBT && { code: PLACE_DOUBT.code, km: PLACE_DOUBT.km, acc: PLACE_DOUBT.acc }, source: placeContext(placeInput()).source,
  note: (document.querySelector('#placeBar [data-k=loc-doubt]') || {}).innerText || '' }));
async function locateAt(s, at) { await s.p.evaluate(x => Object.assign(__geo, x), at); await s.p.locator('[data-act=locate]').first().click(); await s.settle(6); }
async function run(browser, iphone) {
  const tag = iphone ? 'iPhone' : 'PC';
  // 1. approximatif lointain : en attente, avertissement, météo non déplacée ; « Utiliser mon lieu principal »
  let s = await session(browser, { iphone });
  try {
    await locateAt(s, { ...FAR, acc: 178 });
    await check(tag + ' · approximatif à ≈ 300 km : non utilisé, avertissement avec distance et précision', async () => {
      const x = await state(s.p);
      assert.equal(x.gps, null, 'aucune position GPS créée'); assert.notEqual(x.loc, 'gps', 'météo jamais « Position GPS »');
      assert.equal(x.doubt.code, 'far'); assert(x.doubt.km >= 290 && x.doubt.km <= 310, String(x.doubt.km)); assert.equal(x.doubt.acc, 178);
      assert.match(x.note, /≈ \d+ km/); assert.match(x.note, /± 178 m/);
      assert.equal(await s.p.locator('#placeBar [data-act=loc-main]').count(), 1); assert.equal(await s.p.locator('#placeBar [data-act=loc-force]').count(), 1);
    });
    await s.p.locator('#placeBar [data-act=loc-main]').click(); await s.settle(4);
    await check(tag + ' · « Utiliser mon lieu principal » : domicile confirmé, avertissement retiré', async () => {
      const x = await state(s.p); assert.equal(x.conf, 'home'); assert.equal(x.doubt, null); assert.equal(x.note, ''); assert.equal(x.gps, null);
    });
    assert.deepEqual(s.errors, []);
  } finally { await s.c.close(); }
  // 2. « Utiliser quand même » : la zone choisie est acceptée pour la page
  s = await session(browser, { iphone });
  try {
    await locateAt(s, { ...FAR, acc: 178 });
    await s.p.locator('#placeBar [data-act=loc-force]').click(); await s.settle(6);
    await check(tag + ' · « Utiliser quand même » : position utilisée, avertissement retiré', async () => {
      const x = await state(s.p); assert(x.gps, 'position utilisée'); assert.equal(x.gps.acc, 178); assert.equal(x.doubt, null); assert.equal(x.note, '');
    });
    assert.deepEqual(s.errors, []);
  } finally { await s.c.close(); }
  // 3. GPS précis lointain : accepté sans avertissement (voyage) ; 4. approximatif proche : accepté
  s = await session(browser, { iphone });
  try {
    await locateAt(s, { ...FAR, acc: 20 });
    await check(tag + ' · GPS précis à ≈ 300 km : accepté (voyage), aucun avertissement', async () => {
      const x = await state(s.p); assert(x.gps); assert.equal(x.gps.acc, 20); assert.equal(x.doubt, null); assert.equal(x.note, '');
    });
    assert.deepEqual(s.errors, []);
  } finally { await s.c.close(); }
  s = await session(browser, { iphone });
  try {
    await locateAt(s, { lat: HOME.lat + 0.05, lon: HOME.lon, acc: 300 });
    await check(tag + ' · approximatif à ≈ 6 km d’un lieu : accepté, aucun avertissement', async () => {
      const x = await state(s.p); assert(x.gps); assert.equal(x.doubt, null); assert.equal(x.note, '');
    });
    assert.deepEqual(s.errors, []);
  } finally { await s.c.close(); }
}
(async () => {
  const browser = await BR.launch();
  try { for (const iphone of [false, true]) await run(browser, iphone); }
  finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.log('❌ ' + step); console.log(String(e.message).replace(/\n/g, ' ').slice(0, 700)); console.error(e); process.exit(1); });
