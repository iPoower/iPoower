// Débrief d'arrivée : clôture unique des trois chemins (placeConfirm, liveArrive, returnHomeDone), annulation,
// expiration de done, aucune mesure inventée, aucune coordonnée stockée, carte Pneus et Journal par de vrais taps.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0;
async function check(label, fn) { try { await fn(); n++; console.log('✅ ' + label); } catch (e) { console.error('❌ ' + label + ' · ' + e.message); throw e; } }
const GO = 'commute|2026-10-07T06:30|go';
const state = p => p.evaluate(() => ({ keys: Object.keys(DEBRIEF.items), items: DEBRIEF.items, raw: localStorage.getItem(Debrief.KEY), done: USER_STORE.state.done }));
async function tap(p, dev, sel) { const el = p.locator(sel).first(); if (dev === 'iphone') await el.tap(); else await el.click(); }
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-07T07:20:00+02:00', dev }); const p = s.p;
      // Préconditions techniques uniquement (lieux et horaires fictifs) ; les actions utilisateur sont de vrais taps.
      await p.evaluate(() => {
        S.locs = [{ id: 'home', name: 'Domicile test', lat: 48.85, lon: 2.35 }, { id: 'work', name: 'Travail test', lat: 48.9, lon: 2.25 }];
        S.customs = []; S.work = { from: 'home', to: 'work', dep: '06:30', ret: '18:00', days: [1, 2, 3, 4, 5], durMin: 40 };
        CAL = { events: [] }; GPS = null; FIX = FIXPREV = null; S.gpsAuto = 0; UI.view = 'pneus'; saveSettings(); renderAll();
      });
      await tap(p, dev, '[data-act=refresh]'); await s.settle();

      await check(dev + ' · placeConfirm (chosenTrip + trajet résolu identiques) → un seul débrief', async () => {
        await tap(p, dev, '#placeBar [data-act=place-confirm][data-place=work]'); await s.settle(4);
        const x = await state(p); assert.deepEqual(x.keys, [GO]); assert.ok(x.done[GO]);
      });
      await check(dev + ' · deuxième confirmation du même lieu → aucun doublon', async () => {
        await p.evaluate(() => placeConfirm('work', 'manual')); await s.settle(2);
        assert.deepEqual((await state(p)).keys, [GO]);
      });
      await check(dev + ' · carte Pneus : « Pire » → cause → Enregistrer (vrais taps), puis Journal', async () => {
        assert.match(await p.locator('#secDbf').innerText(), /débrief/i);
        await tap(p, dev, '#secDbf [data-act=dbf-verdict][data-v=worse]');
        assert.equal(await p.locator('#secDbf [data-act=dbf-save]').isDisabled(), true);
        await tap(p, dev, '#secDbf [data-act=dbf-cause][data-c=fog]'); await tap(p, dev, '#secDbf [data-act=dbf-save]');
        assert.match(await p.locator('#secDbf').innerText(), /débrief enregistré/i);
        const f = (await state(p)).items[GO].feedback; assert.equal(f.verdict, 'worse'); assert.deepEqual(f.causes, ['fog']);
        assert.match(await p.locator('#secJournal').innerText(), /débriefs des trajets[\s\S]*brouillard/i);
      });
      await check(dev + ' · carte invisible hors de l’onglet Pneus', async () => {
        await tap(p, dev, '#viewSeg [data-act=view][data-v=meteo]'); assert.equal(await p.locator('#secDbf').isVisible(), false);
        await tap(p, dev, '#viewSeg [data-act=view][data-v=pneus]');
      });
      await check(dev + ' · « Annuler l’arrivée » (vrai bouton) → done et débrief supprimés', async () => {
        await tap(p, dev, '[data-act=trip-undo]'); await s.settle(2);
        const x = await state(p); assert.deepEqual(x.keys, []); assert.equal(x.done[GO], undefined);
      });
      await check(dev + ' · annulation puis nouvelle arrivée légitime → nouveau débrief', async () => {
        await tap(p, dev, '#placeBar [data-act=place-confirm][data-place=work]'); await s.settle(4);
        const x = await state(p); assert.deepEqual(x.keys, [GO]); assert.equal(x.items[GO].feedback, null);
      });
      await check(dev + ' · done expiré (24 h) → le débrief historique ne se duplique pas', async () => {
        const r = await p.evaluate(k => { USER_STORE.state.done[k].exp = Date.now() - 1; const t = { key: k, src: 'work', td: { dir: 'go' } };
          return { first: closeTrip(t, 'confirmé'), count: Object.keys(DEBRIEF.items).length }; }, GO);
        assert.equal(r.first, true); assert.equal(r.count, 1);
      });
      await check(dev + ' · trajet vivant : GPS auto puis clic → une clôture, mesures conservées', async () => {
        const r = await p.evaluate(() => {
          const t = BRF_TRIPS.find(x => x.src === 'work' && x.td && x.td.dir === 'ret'); if (!t) return { missing: true };
          LIVE.key = t.key; LIVE.base = t; LIVE.phase = 'active';
          liveArrive('auto'); const again = closeTrip(t, 'confirmé');
          return { key: t.key, again, rec: DEBRIEF.items[t.key], th: DEBRIEF.items[t.key] && DEBRIEF.items[t.key].thermal, tires: hasTires(labCar()), n: Object.keys(DEBRIEF.items).filter(k => k === t.key).length };
        });
        assert.ok(!r.missing, 'trajet retour domicile-travail introuvable'); assert.equal(r.again, false); assert.equal(r.n, 1); assert.equal(r.rec.how, 'auto'); assert.ok(r.tires); assert.ok(r.th && Array.isArray(r.th.range) && Number.isInteger(r.th.s), 'mesure thermique perdue : ' + JSON.stringify(r.th));
      });
      await check(dev + ' · « Je suis déjà rentré » sans télémétrie → aucune mesure inventée', async () => {
        const r = await p.evaluate(() => { const t = { key: 'leg|2026-10-07T17:10|ret|2026-10-07T15:00', src: 'cal', dep: '2026-10-07T17:10', arr: '2026-10-07T17:50', l: { k: 'ret', km: 12 } };
          closeTrip(t, 'confirmé'); return DEBRIEF.items[t.key]; });
        assert.equal(r.observed, null); assert.equal(r.thermal, null); assert.equal(r.evidence, null); assert.equal(r.startedAt, null);
        assert.equal(r.planned.min, 40); assert.equal(r.planned.km, 12);
      });
      await check(dev + ' · stockage : aucune coordonnée, aucun nom de lieu', async () => {
        const raw = (await state(p)).raw; assert.ok(raw);
        for (const leak of ['"lat"', '"lon"', '48.85', '2.35', 'Domicile test', 'Travail test']) assert.ok(!raw.includes(leak), 'fuite : ' + leak);
      });
      await s.c.close();
    }
    assert.deepEqual(errors, []);
    console.log(`\n✅ ${n} contrôles débrief au vert`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
