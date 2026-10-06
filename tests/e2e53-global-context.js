// Régression fonctionnelle : vrais clics, quatre vues, départs/arrivées précoces,
// profil propre public et profil configuré fictif, reload et nouvelle fenêtre.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors, U } = require('./lib/context-session');
let n = 0;
async function check(label, fn) { await fn(); n++; console.log('✅ ' + label); }
const text = async (p, id) => (await p.locator(id).innerText()).replace(/\s+/g, ' ');
const state = p => p.evaluate(() => {
  const c = APP_CONTEXT.snapshot;
  return { status: c.status, location: c.currentLocation && c.currentLocation.id, origin: c.origin && c.origin.id,
    destination: c.destination && c.destination.id, active: c.activeTrip && c.activeTrip.key,
    activeDir: c.activeTrip && c.activeTrip.td && c.activeTrip.td.dir,
    nextDir: c.nextTrip && c.nextTrip.td && c.nextTrip.td.dir, weather: c.weatherLocationId,
    confirmation: c.confirmation && c.confirmation.placeId, done: Object.keys(USER_STORE.state.done),
    stored: JSON.parse(localStorage.getItem(USER_STORE.key)), updatedAt: c.updatedAt, revision: c.revision };
});
async function tab(p, value) { await p.locator('[data-act=view][data-v=' + value + ']').click(); }
async function allViews(s, stage, expected, home, work) {
  const { p } = s;
  for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
    await tab(p, view);
    await check(stage + ' · ' + view + ' partage lieu, statut, trajet et persistance', async () => {
      const x = await state(p); for (const [k, v] of Object.entries(expected)) assert.equal(x[k], v, k + ' · ' + JSON.stringify(x));
      assert(x.updatedAt > 0 && x.revision > 0); assert.equal(x.stored.place.conf && x.stored.place.conf.placeId, x.confirmation);
      assert.equal(x.stored.tripStart && x.stored.tripStart.key, x.active);
      const bar = await text(p, '#placeBar');
      if (expected.status === 'work') assert.match(bar, /AU TRAVAIL/);
      if (expected.status === 'home') assert.match(bar, /À LA MAISON/);
      if (expected.status === 'travel') assert.match(bar, /EN ROUTE/);
      if (view === 'pneus' && expected.status !== 'travel') assert((await text(p, '#secCur')).includes(expected.location === 'work' ? work : home));
      if (view === 'tenue') {
        const first = await text(p, '#secTenue .outfit-moment:first-child .outfit-moment-heading');
        if (expected.status === 'work') { assert(first.includes(work)); assert(!first.includes('→'), first); }
        if (expected.status === 'home') { assert(first.includes(home)); assert(!first.includes('→'), first); }
        if (expected.status === 'travel') assert(first.includes(expected.activeDir === 'go' ? home + ' → ' + work : work + ' → ' + home), first);
      }
      if (view === 'meteo' && expected.status === 'work') assert((await text(p, '#secWx')).includes(work + ' → ' + home));
      if (view === 'analyse' && expected.status === 'travel') assert.match(await text(p, '#secLab'), /TRAJET EN COURS/i);
    });
  }
}
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) for (const profile of ['public-propre', 'configure']) {
      const s = await session(browser, { at: '2026-10-05T06:20:00+02:00', dev, unlock: profile === 'configure' });
      let p = s.p;
      if (profile === 'public-propre') { await p.locator('[data-act=nocode]').click(); await s.settle(4); }
      const tag = dev + ' · ' + profile, home = profile === 'configure' ? 'Maison test' : 'Lieu principal', work = profile === 'configure' ? 'Travail test' : 'Lieu de travail';
      let navigations = 0; const onNav = f => { if (f === p.mainFrame()) navigations++; }; p.on('framenavigated', onNav);
      await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click();
      await allViews(s, tag + ' · maison', { status: 'home', location: 'home', origin: 'home', confirmation: 'home', active: null, nextDir: 'go', weather: 'home' }, home, work);
      await tab(p, 'pneus'); await p.locator('#secBrf [data-act=trip-start]').first().click();
      await allViews(s, tag + ' · aller commencé', { status: 'travel', origin: 'home', destination: 'work', activeDir: 'go', confirmation: null }, home, work);
      await p.clock.fastForward(5 * 60e3); await s.settle(2);
      // L'arrivée est déclarée depuis Météo, avant l'heure de départ prévue.
      await tab(p, 'meteo'); await p.locator('#placeBar [data-act=place-confirm][data-place=work]').click();
      await allViews(s, tag + ' · déjà au travail', { status: 'work', location: 'work', origin: 'work', destination: 'home', confirmation: 'work', active: null, nextDir: 'ret', weather: 'work' }, home, work);
      await check(tag + ' · l’aller est clôturé et aucun clic n’a rechargé la page', async () => { assert((await state(p)).done.some(k => /^commute\|.*\|go$/.test(k))); assert.equal(navigations, 0); });
      p.off('framenavigated', onNav); await p.reload(); await s.settle(8);
      await allViews(s, tag + ' · reload au travail', { status: 'work', location: 'work', confirmation: 'work', active: null, nextDir: 'ret', weather: 'work' }, home, work);
      // Départ depuis Analyse : le bouton global démarre le même retour anticipé.
      await tab(p, 'analyse'); await p.locator('#placeBar [data-act=place-leave]').click();
      await allViews(s, tag + ' · retour commencé', { status: 'travel', origin: 'work', destination: 'home', activeDir: 'ret', confirmation: null }, home, work);
      const activeKey = (await state(p)).active;
      await p.reload(); await s.settle(8); assert.equal((await state(p)).active, activeKey);
      await allViews(s, tag + ' · reload en retour', { status: 'travel', origin: 'work', destination: 'home', activeDir: 'ret', confirmation: null }, home, work);
      await tab(p, 'tenue'); await p.locator('#placeBar [data-act=place-confirm][data-place=home]').click();
      await allViews(s, tag + ' · arrivé maison', { status: 'home', location: 'home', origin: 'home', confirmation: 'home', active: null, nextDir: 'go', weather: 'home' }, home, work);
      const stored = (await state(p)).stored;
      await p.close(); p = await s.c.newPage(); await p.clock.install({ time: s.T0 + 5 * 60e3 }); await p.goto(U);
      s.p = p; s.settle = async (count = 6) => { for (let i = 0; i < count; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } };
      await s.settle(8);
      await allViews(s, tag + ' · fermeture/réouverture', { status: 'home', location: 'home', confirmation: 'home', active: null, nextDir: 'go', weather: 'home' }, home, work);
      await check(tag + ' · réouverture conserve les deux arrivées et le contexte ; aucun autre fournisseur', async () => { const x = await state(p); assert.deepEqual(x.stored.done, stored.done); assert.equal(x.stored.place.conf.at, stored.place.conf.at); });
      await s.c.close();
    }
    await check('aucune erreur JavaScript sur les quatre parcours', async () => assert.deepEqual(errors, []));
  } finally { await browser.close(); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error(e); process.exit(1); });
