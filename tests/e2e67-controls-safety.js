// Vrais clics et dialogues sur profils fictifs : PC/iPhone simulé, aucun compte réel ni réseau extérieur.
'use strict';
const assert = require('node:assert/strict'), { session, BR, errors, NETWORK_NOISE } = require('./lib/context-session');
let n = 0, step = '';
async function check(name, fn) { step = name; await fn(); n++; console.log('✅ ' + name); }
async function reveal(p, selector) {
  if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
  await p.locator(selector).waitFor({ state: 'attached' });
  const target = p.locator(selector), parents = target.locator('xpath=ancestor::details[not(@open)]');
  while (await parents.count()) await parents.first().locator(':scope > summary').click();
}
async function confirmClick(p, action, accept) {
  const seen = new Promise(resolve => p.once('dialog', async dialog => {
    resolve({ type: dialog.type(), message: dialog.message() });
    await (accept ? dialog.accept() : dialog.dismiss());
  }));
  const selector = '#settings [data-act=' + action + ']'; await reveal(p, selector); await p.locator(selector).click();
  const dialog = await seen; assert.equal(dialog.type, 'confirm'); return dialog.message;
}
const snapshot = p => p.evaluate(() => JSON.stringify({ settings: S, place: PLACE, departure: TRIPSTART, returning: RETURNHOME, gps: GPS,
  lastDeparture: USER_STORE.state.lastDeparture, day: USER_STORE.state.dayContext, preview: APP_CONTEXT.weatherPreview, live: LIVE }));
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: '2026-10-07T15:00:00+02:00', dev }), p = s.p;
      await p.evaluate(() => {
        S.work.dep = '07:10'; S.work.ret = '18:40'; S.work.durMin = 45;
        S.calib = [{ t: '2026-10-07T07:00', loc: 'home', kind: 'ice', Tr: 2, T: 3 }];
        S.cars[0].name = 'Véhicule personnalisé test'; saveSettings(); UI.dir = 'go'; renderAll();
      });
      await check(dev + ' · cinq onglets : identifiants HTML uniques avec Réglages ouverts', async () => {
        for (const view of ['meteo', 'pneus', 'trajet', 'tenue', 'analyse']) {
          await p.locator('#viewSeg [data-act=view][data-v=' + view + ']').click();
          await reveal(p, '#f-work-dep');
          const duplicates = await p.evaluate(() => {
            const ids = [...document.querySelectorAll('[id]')].map(x => x.id).filter(Boolean);
            return [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
          });
          assert.deepEqual(duplicates, [], view + ' : ' + duplicates.join(', '));
        }
      });
      await p.locator('#viewSeg [data-act=view][data-v=pneus]').click();
      await check(dev + ' · chaque libellé Départ/Durée cible et focalise son propre contrôle', async () => {
        for (const id of ['f-work-dep', 'f-work-ret', 'f-work-durMin', 'quick-work-dep', 'quick-work-durMin']) {
          await reveal(p, '#' + id);
          const label = p.locator('label[for="' + id + '"]'); assert.equal(await label.count(), 1);
          assert.equal(await label.evaluate(el => el.control && el.control.id), id);
          await label.click(); assert.equal(await p.evaluate(() => document.activeElement.id), id);
        }
        await p.locator('#secBrief [data-act=dir][data-d=ret]').click();
        const label = p.locator('label[for=quick-work-ret]'); await label.click();
        assert.equal(await p.evaluate(() => document.activeElement.id), 'quick-work-ret');
      });
      await check(dev + ' · saisies rapides et paramètres partagent la valeur, sans partager leur identifiant', async () => {
        await p.fill('#quick-work-durMin', '55'); await p.locator('#quick-work-durMin').press('Tab'); await s.settle(2);
        assert.equal(await p.evaluate(() => S.work.durMin), 55); assert.equal(await p.locator('#f-work-durMin').inputValue(), '55');
        await reveal(p, '#f-work-durMin'); await p.fill('#f-work-durMin', '65'); await p.locator('#f-work-durMin').press('Tab'); await s.settle(2);
        assert.equal(await p.evaluate(() => S.work.durMin), 65); assert.equal(await p.locator('#quick-work-durMin').inputValue(), '65');
        await p.fill('#f-work-ret', '19:05'); await p.locator('#f-work-ret').press('Tab'); await s.settle(2);
        assert.equal(await p.locator('#quick-work-ret').inputValue(), '19:05');
      });
      await check(dev + ' · incident HTTP 503 : cause et durée privées visibles après retour LIVE', async () => {
        s.S.meteo = '503'; await p.evaluate(() => { lastTry = 0; refreshAll(true); }); await s.settle(12);
        assert.equal(await p.evaluate(() => WEATHER_REQUESTS.incidents().some(x => x.kind === 'http' && x.status === 503)), true);
        s.S.meteo = 'ok'; await p.evaluate(() => { lastTry = 0; refreshAll(true); }); await s.settle(12);
        assert.equal(await p.evaluate(() => RAW[UI.loc].mode), 'live');
        const text = await p.evaluate(() => weatherIncidentText()); assert.match(text, /HTTP 503/); assert.match(text, /appel \d+ (?:ms|s)/);
        assert.doesNotMatch(text, /https?:|latitude|longitude|Maison test|Travail test/);
        await p.evaluate(() => window.TWRC_VAULT.flush()); await p.reload(); await s.settle(14);
        assert.equal(await p.evaluate(() => S.work.durMin), 65); assert.equal(await p.evaluate(() => S.work.ret), '19:05');
        assert.equal(await p.evaluate(() => WEATHER_REQUESTS.incidents().some(x => x.status === 503)), true);
        const fields = await p.evaluate(() => WEATHER_REQUESTS.incidents().flatMap(x => Object.keys(x)));
        assert(fields.every(x => ['at', 'kind', 'durationMs', 'status'].includes(x)));
      });
      await check(dev + ' · annuler Effacer calibration ne modifie aucune donnée', async () => {
        await reveal(p, '#settings [data-act=calib-reset]'); const before = await snapshot(p);
        assert.match(await confirmClick(p, 'calib-reset', false), /retours de calibration.*définitive/);
        assert.equal(await snapshot(p), before); assert.equal(await p.evaluate(() => S.calib.length), 1);
      });
      await check(dev + ' · confirmer Effacer calibration supprime uniquement les retours', async () => {
        const before = await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work }));
        await confirmClick(p, 'calib-reset', true);
        assert.equal(await p.evaluate(() => S.calib.length), 0);
        assert.equal(await p.evaluate(() => JSON.stringify({ cars: S.cars, work: S.work })), before);
      });
      await check(dev + ' · annuler Réinitialiser conserve réglages et contexte', async () => {
        await reveal(p, '#settings [data-act=reset]'); const before = await snapshot(p);
        assert.match(await confirmClick(p, 'reset', false), /véhicules.*lieux.*trajet en cours/s); assert.equal(await snapshot(p), before);
      });
      await check(dev + ' · confirmer Réinitialiser restaure les valeurs initiales', async () => {
        await confirmClick(p, 'reset', true);
        assert.deepEqual(await p.evaluate(() => S.work), await p.evaluate(() => DEFAULTS.work));
        assert.equal(await p.evaluate(() => S.cars[0].name), await p.evaluate(() => DEFAULTS.cars[0].name));
        assert.equal(await p.evaluate(() => TRIPSTART), null); assert.equal(await p.evaluate(() => RETURNHOME), null);
        assert.equal(await p.evaluate(() => USER_STORE.state.lastDeparture), null);
        assert.equal(await p.evaluate(() => WEATHER_REQUESTS.incidents().some(x => x.status === 503)), true);
      });
      await s.settle(3); await s.c.close();
    }
    await check('aucune exception JavaScript', async () => assert.deepEqual(errors, []));
    if (NETWORK_NOISE.length) console.log('ℹ️ requêtes réseau coupées signalées par WebKit : ' + NETWORK_NOISE.length);
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error(step + ' · ' + e.message); process.exitCode = 1; });
