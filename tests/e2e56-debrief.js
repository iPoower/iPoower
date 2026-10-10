// Débrief : vrais taps/clics, tous les chemins d'arrivée, journal partagé et reload.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = '';
async function check(label, fn) { stage = label; await fn(); n++; console.log('✅ ' + label); }
const state = p => p.evaluate(() => ({ phase: LIVE.phase, key: LIVE.key, start: USER_STORE.state.tripStart,
  journal: USER_STORE.state.debrief, stored: JSON.parse(localStorage.getItem(USER_STORE.key)), end: TRIPEND }));
const tap = async (s, selector) => { stage = s.dev + ' · clic ' + selector; const button = s.p.locator(selector).first();
  try { if (s.dev === 'iphone') await button.tap({ timeout: 12000 }); else await button.click({ timeout: 12000 }); await s.settle(2); }
  catch (e) { throw new Error(stage + ' : ' + e.message); }
};
const tab = (s, view) => tap(s, '#viewSeg [data-act=view][data-v=' + view + ']');
async function setup(b, dev, at = '2026-10-07T06:20:00+02:00') {
  const s = await session(b, { dev, at }); s.dev = dev;
  await s.p.evaluate(() => { S.work.days = [1, 2, 3, 4, 5]; saveSettings(); renderAll(); }); await s.settle(4); await tab(s, 'pneus'); return s;
}
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await setup(b, dev);
      try {
        const key = await s.p.locator('#secBrf [data-act=trip-start]').first().getAttribute('data-key');
        await tap(s, '#secBrf [data-act=trip-start]');
        const frozen = (await state(s.p)).journal.active;
        await check(dev + ' · départ : prévision figée du trajet et voiture active', async () => {
          assert.equal(frozen.key, key); assert(frozen.prediction.known); assert(frozen.prediction.fetchedAt); assert(frozen.carId);
          assert.equal((await state(s.p)).stored.debrief.active.key, key);
          await s.p.evaluate(key => liveStart(key), key); assert.deepEqual((await state(s.p)).journal.active, frozen); assert.equal((await state(s.p)).start.at, frozen.at);
        });
        await s.p.clock.fastForward(20 * 60e3); await s.settle(4);
        await check(dev + ' · 20 min et actualisations : prévision initiale conservée', async () => assert.deepEqual((await state(s.p)).journal.active, frozen));
        await s.p.reload(); await s.settle(12);
        await check(dev + ' · reload pendant le trajet : même départ et même snapshot', async () => { assert.equal((await state(s.p)).key, key); assert.deepEqual((await state(s.p)).journal.active, frozen); });
        await tab(s, 'pneus'); await tap(s, '#placeBar [data-act=place-confirm][data-place=work]');
        await check(dev + ' · confirmation de lieu : arrivée, thermique et débrief dans une transaction', async () => {
          const v = await state(s.p); assert.equal(v.start, null); assert.equal(v.journal.active, null); assert.equal(v.journal.entries.length, 1);
          assert.equal(v.journal.entries[0].key, key); assert.deepEqual(v.journal.entries[0].start, frozen); assert(v.journal.entries[0].end.thermal);
          assert.equal(v.stored.debrief.entries.length, 1); assert.equal(v.stored.place.conf.placeId, 'work');
          assert(await s.p.locator('#secDebrief').isVisible()); assert(await s.p.locator('[data-act=debrief-save]').isDisabled());
        });
        await tap(s, '#secDebrief [data-act=debrief-condition][data-v=fog]');
        await tap(s, '#secDebrief [data-act=debrief-grip][data-v=reduced]');
        await tap(s, '#secDebrief [data-act=debrief-save]');
        await check(dev + ' · brume non annoncée : retour enregistré et écart visible', async () => {
          const v = await state(s.p); assert.deepEqual(v.journal.entries[0].feedback.conditions, ['fog']); assert.equal(v.journal.entries[0].feedback.grip, 'reduced');
          assert(!frozen.prediction.conditions.includes('fog')); assert((await s.p.locator('#secDebrief').innerText()).includes('Phénomène non annoncé'));
        });
        await check(dev + ' · quatre vues : un seul journal, cibles tactiles 44 px et aucun débordement', async () => {
          for (const view of ['pneus', 'meteo', 'tenue', 'analyse']) {
            await tab(s, view); assert.equal((await state(s.p)).journal.entries.length, 1); assert(await s.p.locator('#secDebrief').isVisible());
            const box = await s.p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
              small: [...document.querySelectorAll('#secDebrief button')].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect()).some(r => r.height < 43.9 || r.width < 43.9) }));
            assert.equal(box.overflow, false); assert.equal(box.small, false);
          }
        });
        await s.p.reload(); await s.settle(12);
        await check(dev + ' · reload après débrief : observation et prévision d’origine conservées', async () => {
          const v = await state(s.p); assert.deepEqual(v.journal.entries[0].start, frozen); assert.deepEqual(v.journal.entries[0].feedback.conditions, ['fog']);
          assert.equal(await s.p.locator('#secDebrief .debrief-form').count(), 0, 'aucun questionnaire rouvert au chargement');
        });
        await check(dev + ' · callback d’arrivée répété : aucune nouvelle entrée ni observation perdue', async () => {
          await s.p.evaluate(key => closeTrip({ key, name: 'callback tardif' }, 'auto'), key);
          const v = await state(s.p); assert.equal(v.journal.entries.length, 1); assert.deepEqual(v.journal.entries[0].feedback.conditions, ['fog']);
        });
        await tab(s, 'pneus'); if (await s.p.locator('#secDebrief .debrief-journal').getAttribute('open') == null) await tap(s, '#secDebrief .debrief-journal > summary'); await tap(s, '#secDebrief .debrief-entry > summary'); await tap(s, '#secDebrief [data-act=debrief-open]');
        await tap(s, '#secDebrief [data-act=debrief-condition][data-v=normal]'); await tap(s, '#secDebrief [data-act=debrief-save]');
        await check(dev + ' · corriger le débrief remplace le retour sans multiplier les trajets', async () => {
          const v = await state(s.p); assert.equal(v.journal.entries.length, 1); assert.deepEqual(v.journal.entries[0].feedback.conditions, []);
        });
        await tap(s, '#secBrf [data-act=trip-undo]');
        await check(dev + ' · annuler l’arrivée retire le débrief et le bilan correspondant', async () => { const v = await state(s.p); assert.equal(v.journal.entries.length, 0); assert.equal(v.end, null); });
        await tap(s, '#placeBar [data-act=place-confirm][data-place=work]');
        await tap(s, '#secDebrief [data-act=debrief-later]');
        await check(dev + ' · arrivée après coup et Plus tard : aucune durée ni prévision inventées', async () => {
          const v = await state(s.p); assert.equal(v.journal.entries.length, 1); assert.equal(v.journal.entries[0].start, null); assert.equal(v.journal.entries[0].feedback, null);
          assert.equal(v.journal.entries[0].deferred, true); assert.equal(await s.p.locator('#secDebrief [data-act=debrief-save]').count(), 0);
          await s.p.reload(); await s.settle(6);
          assert.equal(await s.p.locator('#secDebrief .debrief-form').count(), 0, 'Plus tard ne rouvre pas un ancien débrief');
          const j = s.p.locator('#secDebrief .debrief-journal');
          if (await j.getAttribute('open') == null) await tap(s, '#secDebrief .debrief-journal > summary');
        });
        s.p.once('dialog', d => d.accept()); await tap(s, '#secDebrief [data-act=debrief-clear]');
        await check(dev + ' · effacement explicite : journal supprimé après reload', async () => { await s.p.reload(); await s.settle(8); assert.equal((await state(s.p)).journal.entries.length, 0); });
      } finally { await s.c.close(); }
    }
    const gps = await setup(b, 'iphone');
    try {
      await tap(gps, '#secBrf [data-act=trip-start]');
      await gps.p.evaluate(() => { S.gpsAuto = 1; saveSettings(); startWatch(true); window.__geo = { lat: 48.9005, lon: 2.2502, acc: 20 }; window.__geoPush(); }); await gps.settle(4);
      await gps.p.clock.runFor(16000); await gps.p.evaluate(() => window.__geoPush()); await gps.settle(4);
      await check('GPS · deux relevés précis à destination : débrief automatique unique', async () => { const v = await state(gps.p); assert.equal(v.journal.entries.length, 1); assert.equal(v.journal.entries[0].how, 'auto'); assert.equal(v.start, null); });
    } finally { await gps.c.close(); }
    const manual = await setup(b, 'iphone', '2026-10-03T14:00:00+02:00');
    try {
      await tap(manual, '#secBrf [data-act=trip-start]'); await manual.p.clock.fastForward(12 * 60e3); await manual.settle(4);
      await tap(manual, '#secBrf [data-act=trip-arrived]');
      await check('Bien arrivé · même clôture et même demande de débrief', async () => { const v = await state(manual.p); assert.equal(v.journal.entries.length, 1); assert.equal(v.journal.entries[0].how, 'confirmé'); assert(v.journal.entries[0].start); });
      await tap(manual, '#secDebrief [data-act=debrief-snooze]');
      await check('iPhone · ne plus demander aujourd’hui masque le formulaire sans perdre le journal', async () => {
        const v = await state(manual.p);
        assert(v.journal.quietUntil > Date.now() || v.journal.quietUntil > v.journal.entries[0].at);
        assert.equal(v.journal.entries.length, 1); assert.equal(v.journal.entries[0].feedback, null);
        assert.equal(await manual.p.locator('#secDebrief .debrief-form').count(), 0);
      });
      await manual.p.reload(); await manual.settle(10);
      await check('iPhone · après rechargement et nouveau trajet, silence quotidien conservé', async () => {
        assert.equal(await manual.p.locator('#secDebrief .debrief-form').count(), 0);
        await manual.p.evaluate(() => closeTrip({ key: 'trajet-deux', name: 'Autre trajet', from: 'A', to: 'B' }, 'confirmé'));
        const v = await state(manual.p);
        assert.equal(v.journal.entries.length, 2);
        assert.equal(await manual.p.locator('#secDebrief .debrief-form').count(), 0);
        assert(v.journal.quietUntil);
      });
    } finally { await manual.c.close(); }
    const duplicate = await setup(b, 'iphone', '2026-10-03T14:00:00+02:00');
    try {
      await tap(duplicate, '#secBrf [data-act=trip-start]');
      // Le briefing met à disposition « Bien arrivé » après progression réelle du temps simulé.
      await duplicate.p.clock.fastForward(12 * 60e3); await duplicate.settle(4);
      await tap(duplicate, '#secBrf [data-act=trip-arrived]');
      await tap(duplicate, '#secDebrief [data-act=debrief-condition][data-v=normal]');
      await tap(duplicate, '#secDebrief [data-act=debrief-save]');
      await duplicate.p.evaluate(() => {
        const old = USER_STORE.state.debrief.entries[0];
        closeTrip({ key: old.key + '|autre-id', name: old.name, from: old.from, to: old.to }, 'confirmé');
      });
      await duplicate.settle(4);
      await check('iPhone · second ID probable doublon : entrée conservée mais aucun second questionnaire', async () => {
        const v = await state(duplicate.p);
        assert.equal(v.journal.entries.length, 2);
        assert.equal(v.journal.entries.filter(e => !!e.feedback).length, 1);
        assert.equal(await duplicate.p.locator('#secDebrief .debrief-form').count(), 0);
        assert((await duplicate.p.locator('#secDebrief').innerText()).includes('Doublon possible'));
      });
    } finally { await duplicate.c.close(); }
    const cancel = await setup(b, 'iphone');
    try {
      await tap(cancel, '#secBrf [data-act=trip-start]'); cancel.p.once('dialog', d => d.accept()); await tap(cancel, '#secBrf [data-act=trip-cancel]');
      await check('Annulation · aucun trajet arrivé, snapshot actif abandonné', async () => { const v = await state(cancel.p); assert.equal(v.journal.entries.length, 0); assert.equal(v.journal.active, null); assert.equal(v.start, null); });
      await tap(cancel, '#secBrf [data-act=trip-cancel-undo]');
      await check('Annuler l’annulation · aucun faux débrief', async () => assert.equal((await state(cancel.p)).journal.entries.length, 0));
    } finally { await cancel.c.close(); }
    const retro = await setup(b, 'iphone', '2026-10-06T17:15:00+02:00');
    try {
      await tap(retro, '#secBrf [data-act=return-home-done]');
      await check('Déjà rentré · clôture après coup sans prévision fabriquée', async () => { const v = await state(retro.p); assert.equal(v.journal.entries.length, 1); assert.equal(v.journal.entries[0].start, null); assert.equal(v.journal.entries[0].how, 'confirmé'); });
    } finally { await retro.c.close(); }
    const vehicle = await setup(b, 'pc', '2026-10-03T14:00:00+02:00');
    try {
      await vehicle.p.evaluate(() => { const other = structuredClone(S.cars[0]); other.id = 'carB'; other.name = other.short = 'Voiture B'; S.cars.push(other); saveSettings(); renderAll(); });
      await tap(vehicle, '#secBrf [data-act=trip-start]');
      const initial = (await state(vehicle.p)).journal.active.carId;
      await tap(vehicle, '#dayContext .day-editor > summary'); await tap(vehicle, '#dayContext [data-act=day-car][data-id=carB]');
      await vehicle.p.clock.fastForward(12 * 60e3); await vehicle.settle(4); await tap(vehicle, '#secBrf [data-act=trip-arrived]');
      await check('Voiture changée après départ · bilan rattaché à la voiture du trajet, pas à la sélection suivante', async () => {
        const v = await state(vehicle.p); assert.equal(v.end.carId, initial); assert.equal(v.journal.entries[0].start.carId, initial);
        await tab(vehicle, 'analyse'); assert.equal(await vehicle.p.locator('#secLab [data-k=end]').count(), 0);
      });
    } finally { await vehicle.c.close(); }
    await check('Débrief · aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
  } finally { await b.close(); }
  console.log(`${n}/${n} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.error('Étape : ' + stage); console.error(e); process.exit(1); });
