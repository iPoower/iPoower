// Clics réels (sans force), contrôles natifs et assertions d'état/résultat, avant et après rerender.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), BR = require('./lib/browser'), { session } = require('./lib/jarvis-session');
let count = 0, step = '';
async function check(name, fn) { step = name; await fn(); count++; console.log('✅ ' + name); }
(async () => {
  const browser = await BR.launch();
  try {
    for (const iphone of [false, true]) {
      const s = await session(browser, { iphone }), p = s.p, tag = iphone ? 'iPhone' : 'PC';
      const click = async selector => {
        step = step.split(' · clic ')[0] + ' · clic ' + selector;
        const button = p.locator(selector).first(), parents = button.locator('xpath=ancestor::details[not(@open)]');
        while (await parents.count()) { await parents.first().locator(':scope > summary').click(); await s.settle(1); }
        await button.click(); await s.settle(1);
      };
      const open = async () => { await p.locator('#settings > summary').click(); await s.settle(1); };
      await check(tag + ' · tous les onglets et aria-pressed après deux passages', async () => {
        for (let n = 0; n < 2; n++) for (const v of ['pneus', 'meteo', 'tenue', 'analyse']) { await click(`[data-act=view][data-v=${v}]`); assert.equal(await p.evaluate(() => UI.view), v); assert.equal(await p.locator(`[data-act=view][data-v=${v}]`).getAttribute('aria-pressed'), 'true'); }
      });
      await check(tag + ' · préférence Réduire les animations respectée par les scrolls programmatiques', async () => {
        await p.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await p.evaluate(() => scrollBehavior()), 'auto');
        await p.emulateMedia({ reducedMotion: 'no-preference' }); assert.equal(await p.evaluate(() => scrollBehavior()), 'smooth');
      });
      if (iphone) await check('iPhone 11 Pro Max · cibles secondaires visibles ≥ 44 px', async () => {
        await click('[data-act=view][data-v=meteo]');
        const bad = await p.evaluate(() => [...document.querySelectorAll('.jump a, button.btn.sm, summary')].filter(el => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && r.height < 43.5;
        }).map(el => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), h: Math.round(el.getBoundingClientRect().height) })));
        assert.deepEqual(bad, []);
      });
      await click('[data-act=view][data-v=pneus]');
      await check(tag + ' · menu des lieux ouvre les paramètres puis se replie', async () => { await click('[data-act=locs-toggle]'); await click('[data-act=goset]'); assert.equal(await p.locator('#settings').getAttribute('open'), ''); assert.equal(await p.locator('[data-act=locs-toggle]').getAttribute('aria-expanded'), 'false'); await p.locator('#settings > summary').click(); });
      await check(tag + ' · boutons dynamiques météo et cartes conservés après refresh', async () => { const before = s.calls.length; await click('#statusbar [data-act=refresh]'); await s.settle(8); assert(s.calls.length > before); assert.match(await p.locator('#statusbar').innerText(), /LIVE/); assert(await p.locator('[data-act=tip]').count()); });
      await check(tag + ' · astuce : action et contenu renouvelés', async () => { const before = await p.evaluate(() => TIP_OFF); await click('[data-act=tip][data-d="1"]'); assert.equal(await p.evaluate(() => TIP_OFF), before + 1); });
      await check(tag + ' · véhicule de trajet', async () => { const car = await p.locator('[data-act=bcar]').last().getAttribute('data-car'); await p.locator('[data-act=bcar]').last().click(); assert.equal(await p.evaluate(() => UI.bcar), car); });
      await check(tag + ' · sens, jour, origine du domicile-travail', async () => {
        await click('[data-act=dir][data-d=ret]'); assert.equal(await p.evaluate(() => UI.dir), 'ret');
        await click('[data-act=day][data-off="1"]'); assert.equal(await p.evaluate(() => UI.dayOff), 1);
        const origin = await p.locator('[data-act=from]').first().getAttribute('data-id'); await click('[data-act=from]'); assert.equal(await p.evaluate(() => S.work.to), origin);
        await click('[data-act=dir][data-d=go]');
      });
      await check(tag + ' · monte et contrôle pression dans les cartes pneus', async () => {
        await open(); await p.selectOption('[data-bind="cars.0.tire.type"]', 'winter'); await s.settle(1); assert.equal(await p.evaluate(() => S.cars[0].tire.type), 'winter');
        await p.selectOption('[data-bind="cars.0.tire.type"]', 'summer'); await s.settle(1); await p.locator('#settings > summary').click();
        await click('[data-act=pchk][data-car=carA]'); assert(await p.evaluate(() => !!S.cars[0].tire.pchk.date));
      });
      await check(tag + ' · retour terrain et switch alerte', async () => {
        await click('[data-act=fb]'); assert(await p.evaluate(() => S.calib.length > 0));
        // un retour isolé est une observation : aucune correction de chaussée, nulle part
        assert.deepEqual(await p.evaluate(() => Object.values(M).map(m => m.roadBias || 0).filter(b => b !== 0)), []);
        for (let i = 0; i < 4; i++) await click('[data-act=fb][data-k=ice]');
        // 5 retours « givre » cohérents au lieu affiché : correction appliquée à CE lieu seulement
        const cal = await p.evaluate(() => ({ here: M[UI.loc] && M[UI.loc].roadBias, others: Object.keys(M).filter(id => id !== UI.loc).map(id => M[id].roadBias || 0), c: calibBias(S.calib, UI.loc) }));
        assert.equal(cal.c.applied, true, JSON.stringify(cal)); assert(cal.here < 0, JSON.stringify(cal));
        assert(cal.others.length && cal.others.every(b => b === 0), JSON.stringify(cal));
        const alert = p.locator('input[data-alert]').first(), name = await alert.getAttribute('data-alert'), old = await alert.isChecked(); await alert.locator('xpath=..').click();
        assert.equal(await p.evaluate(name => S.alerts[name], name), old ? 0 : 1);
      });
      await check(tag + ' · photo valide puis image illisible : résultat visible', async () => {
        const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await p.locator('#photo-0').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image }); await s.settle(3); assert.match(await p.evaluate(() => S.cars[0].photo), /^data:image\/jpeg/);
        await p.locator('#photo-0').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid fixture') }); await s.settle(3); assert.match(await p.locator('label[for=photo-0]').getAttribute('title'), /Image illisible/);
      });
      await click('[data-act=view][data-v=meteo]');
      await check(tag + ' · radar, lecture, pause, curseur et recentrage', async () => {
        await p.locator('#secRadar').scrollIntoViewIfNeeded(); await s.settle(8); await p.waitForFunction(() => RADAR.state === 'ready');
        await click('[data-act=rplay]'); assert.equal(await p.evaluate(() => !!RADAR.play), true); await click('[data-act=rplay]'); assert.equal(await p.evaluate(() => !!RADAR.play), false);
        await click('[data-act=rcenter]'); assert.equal(await p.evaluate(() => RADAR.at), await p.evaluate(() => UI.loc));
        await p.locator('#rslide').press('ArrowLeft'); assert(await p.evaluate(() => RADAR.idx >= 0));
      });
      await check(tag + ' · graphique par pointeur et flèches clavier', async () => {
        await p.locator('#chartbox').click({ position: { x: 100, y: 100 } }); const before = await p.evaluate(() => UI.chartIdx);
        await p.locator('#chartbox').press('ArrowRight'); assert.equal(await p.evaluate(() => UI.chartIdx), before + 1);
      });
      await click('[data-act=view][data-v=meteo]');
      await check(tag + ' · choix de lieu météo après dépliage', async () => {
        await click('[data-act=locs-toggle]'); assert.equal(await p.evaluate(() => UI.locsOpen), true); await click('[data-act=loc][data-id=work]'); assert.equal(await p.evaluate(() => UI.loc), 'work');
      });
      await click('[data-act=view][data-v=tenue]');
      await check(tag + ' · jour et occasion Tenue', async () => { await click('[data-act=outfit-day][data-v="1"]'); assert.equal(await p.evaluate(() => UI.outfitDay), 1); await click('[data-act=outfit-occasion][data-v=walk]'); assert.equal(await p.evaluate(() => UI.outfitOccasion), 'walk'); });
      await click('[data-act=view][data-v=analyse]');
      await check(tag + ' · véhicule Analyse propagé au contexte global', async () => { const car = await p.locator('[data-act=labcar]').last().getAttribute('data-car'); await p.locator('[data-act=labcar]').last().click(); const selected = await p.evaluate(() => ({ active: APP_CONTEXT.snapshot.activeCarId, lab: labCar().id })); assert.equal(selected.active, car); assert.equal(selected.lab, car); });
      await open();
      await check(tag + ' · calibration effacée et photo dynamique retirée', async () => {
        await click('[data-act=calib-reset]'); assert.equal(await p.evaluate(() => S.calib.length), 0);
        await p.evaluate(() => { S.cars[0].photo = 'data:image/png;base64,iVBORw0KGgo='; renderSettings(true); }); await click('[data-act=photo-del][data-i="0"]'); assert.equal(await p.evaluate(() => S.cars[0].photo || null), null);
      });
      await check(tag + ' · diagnostic sépare application chargée et version serveur', async () => { assert.match(await p.locator('#diagBox').innerText(), /Application chargée/); assert.match(await p.locator('#diagBox').innerText(), /Version publiée/); assert.equal(await p.evaluate(() => window.TWRC_BUILD.length), 12); });
      await check(tag + ' · compteur vide puis compteur nul et valide', async () => {
        await click('[data-act=odo][data-i="0"]'); assert.match(await p.locator('[data-act=odo][data-i="0"]').innerText(), /Saisis/);
        for (const km of [0, 42150]) { await p.fill('#odo-0', String(km)); await click('[data-act=odo][data-i="0"]'); assert.equal(await p.evaluate(() => lastOdo(S.cars[0]).km), km); assert.equal(await p.locator('[data-act=odo][data-i="0"]').innerText(), 'Enregistré'); }
      });
      await check(tag + ' · profondeur invalide et mesure valide, permutation', async () => {
        await p.fill('#trd-0', '20'); await click('[data-act=tread-add][data-i="0"]'); assert.match(await p.locator('[data-act=tread-add][data-i="0"]').innerText(), /0 à 12/);
        await p.fill('#trd-0', '6.5'); await click('[data-act=tread-add][data-i="0"]'); assert.equal(await p.evaluate(() => S.cars[0].tire.tread), 6.5);
        // relevé de l'avant seul, estimé : l'arrière garde 6,5 ; valeur effective = essieu le plus usé ; origine et essieu dans l'historique
        await p.fill('#trd-0', '2.3'); await p.selectOption('#trdax-0', 'av'); await p.selectOption('#trdest-0', '1'); await click('[data-act=tread-add][data-i="0"]');
        assert.deepEqual(await p.evaluate(() => { const t = S.cars[0].tire, h = t.treads[t.treads.length - 1]; return [t.treadAv, t.treadAr, t.tread, t.treadEst, h.ax, h.est]; }), [2.3, 6.5, 2.3, 1, 'av', 1]);
        await click('[data-act=rot][data-i="0"]'); assert.equal(await p.evaluate(() => S.cars[0].tire.lastRot), 42150);
      });
      await check(tag + ' · select et switch moteur, persistance', async () => {
        await p.selectOption('[data-bind=horizon]', '12'); assert.equal(await p.evaluate(() => S.horizon), 12);
        await click('[data-act=ev-flag][data-v=shadow]'); assert.equal(await p.evaluate(() => EV_FLAG()), 'shadow');
      });
      await check(tag + ' · dernier jour de trajet expliqué', async () => {
        await p.evaluate(() => { S.work.days = [1]; renderSettings(true); }); await click('[data-act=wday][data-d="1"]'); assert.match(await p.locator('[data-act=wday][data-d="1"]').innerText(), /Garde au moins/);
        await click('[data-act=wday][data-d="2"]'); assert.deepEqual(await p.evaluate(() => S.work.days), [1, 2]);
      });
      await check(tag + ' · clipboard autorisé et refusé, diagnostic copié', async () => {
        await click('[data-act=copy][data-for=autoUrl]'); assert.equal(await p.locator('[data-act=copy][data-for=autoUrl]').innerText(), 'Copié');
        await p.evaluate(() => { __copyDenied = true; }); await click('[data-act=copy][data-for=autoUrl]'); assert.match(await p.locator('[data-act=copy][data-for=autoUrl]').innerText(), /manuellement/);
        await p.evaluate(() => { __copyDenied = false; }); await click('[data-act=diag-copy]'); assert.match(await p.evaluate(() => __clipboard.at(-1)), /Race Control · diagnostic/);
      });
      await check(tag + ' · widget : HTTP 503 ne devient pas le script copié', async () => {
        s.state.widgetStatus = 503; const before = await p.evaluate(() => __clipboard.length); await click('[data-act=copy-widget]'); assert.match(await p.locator('[data-act=copy-widget]').innerText(), /Copie impossible/); assert.equal(await p.evaluate(() => __clipboard.length), before);
        s.state.widgetStatus = 200; await click('[data-act=copy-widget]'); assert.match(await p.evaluate(() => __clipboard.at(-1)), /const CFG = \{/);
      });
      await check(tag + ' · recherche courte et Entrée, ajout dynamique', async () => {
        await p.fill('#geoQ', 'A'); await click('[data-act=geo-search]'); assert.match(await p.locator('#geoHits').innerText(), /deux caractères/);
        await p.fill('#geoQ', 'Ville'); await p.press('#geoQ', 'Enter'); await s.settle(3); assert.equal(await p.locator('[data-act=geo-add]').count(), 1);
        const before = await p.evaluate(() => S.customs.length); await click('[data-act=geo-add]'); assert.equal(await p.evaluate(() => S.customs.length), before + 1);
        await click('[data-act=loc-del][data-i="0"]'); assert.equal(await p.evaluate(() => S.customs.length), before);
      });
      await check(tag + ' · recherche concurrente : la réponse ancienne ne remplace pas la nouvelle', async () => {
        let release; s.state.holdSearch = { query: 'Ancienne', promise: new Promise(r => { release = r; }) };
        await p.fill('#geoQ', 'Ancienne'); await click('[data-act=geo-search]'); await p.waitForFunction(() => document.querySelector('#geoHits').textContent.includes('Recherche'));
        await p.fill('#geoQ', 'Nouvelle'); await click('[data-act=geo-search]'); await s.settle(4); release(); await s.settle(3);
        assert.match(await p.locator('#geoHits').innerText(), /Nouvelle test/); assert(!/Ancienne test/.test(await p.locator('#geoHits').innerText())); s.state.holdSearch = null;
      });
      await check(tag + ' · recherche après destruction du panneau : aucun résultat obsolète', async () => {
        let release; s.state.holdSearch = { query: 'Détruite', promise: new Promise(r => { release = r; }) };
        await p.fill('#geoQ', 'Détruite'); await click('[data-act=geo-search]'); await p.evaluate(() => renderSettings(true)); release(); await s.settle(4);
        assert.equal(await p.locator('#geoHits').innerText(), ''); assert.equal(await p.evaluate(() => window.__hits.length), 0); s.state.holdSearch = null;
      });
      await check(tag + ' · notification de test : POST simulé, résultat visible', async () => {
        await p.evaluate(() => { window.TWRC_NTFY = 'fixture-only'; renderSettings(true); }); await click('[data-act=ntfy-test]'); assert.equal(await p.locator('[data-act=ntfy-test]').innerText(), 'Test envoyé');
      });
      await check(tag + ' · export et import : erreurs de saisie expliquées', async () => {
        await click('[data-act=bk-export]'); assert.match(await p.locator('#bkMsg').innerText(), /8 caractères/);
        await p.locator('#bkFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') }); await s.settle(2); assert((await p.locator('#bkMsg').innerText()).length > 10);
      });
      await check(tag + ' · listeners conservés après rechargement', async () => { await p.reload(); await s.settle(12); await click('[data-act=view][data-v=tenue]'); assert.equal(await p.evaluate(() => UI.view), 'tenue'); assert.deepEqual(await p.evaluate(() => [S.cars[0].tire.tread, S.cars[0].tire.treadAv, S.cars[0].tire.treadAr, S.cars[0].tire.treadEst]), [2.3, 2.3, 6.5, 1]); });
      await check(tag + ' · offline et online : commandes et onglets actifs', async () => { await s.c.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await click('[data-act=view][data-v=analyse]'); assert.equal(await p.evaluate(() => UI.view), 'analyse'); await s.c.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await s.settle(8); assert.match(await p.locator('#statusbar').innerText(), /LIVE/); });
      await p.locator('#settings > summary').click(); await s.settle(1);
      await check(tag + ' · démo, changement de scénario, sortie et reset', async () => {
        await click('[data-act=demo-sel]'); assert.equal(await p.evaluate(() => DEMO.on), true);
        await p.selectOption('#demoScn', 'pluie'); assert.equal(await p.evaluate(() => DEMO.scn), 'pluie');
        await click('[data-act=demo-off]'); await s.settle(8); assert.equal(await p.evaluate(() => DEMO.on), false);
        await click('[data-act=reset]'); await s.settle(8); assert.equal(await p.evaluate(() => S.horizon), await p.evaluate(() => DEFAULTS.horizon));
      });
      assert.deepEqual(s.errors, []); await s.c.close();
    }
    const radar = await session(browser); radar.state.radar = 'abort';
    await radar.p.locator('[data-act=view][data-v=meteo]').click(); await radar.settle(1);
    await radar.p.locator('#secRadar').scrollIntoViewIfNeeded(); await radar.settle(6);
    await check('radar · panne initiale : commandes désactivées et raison visible', async () => { await radar.p.waitForFunction(() => RADAR.state === 'idle'); assert.equal(await radar.p.locator('[data-act=rplay]').isDisabled(), true); assert.match(await radar.p.locator('#rmsg').innerText(), /Actualiser/); });
    radar.state.radar = 'ok'; await radar.p.locator('#statusbar [data-act=refresh]').click(); await radar.settle(8);
    await check('radar · refresh après panne initiale : carte réutilisée, commandes rétablies', async () => { await radar.p.waitForFunction(() => RADAR.state === 'ready'); assert.equal(await radar.p.locator('[data-act=rplay]').isEnabled(), true); });
    assert.deepEqual(radar.errors, []); await radar.c.close();
    const locked = await session(browser, { locked: true }), p = locked.p;
    await check('premier lancement · CTA sans code et retour au formulaire', async () => {
      assert.equal(await p.evaluate(() => S.configured), 0); assert(await p.evaluate(() => Object.keys(S.journal).length > 0));
      await p.locator('[data-act=nocode]').click(); await locked.settle(2); assert.equal(await p.evaluate(() => lsGet('twrc.nocode')), '1');
      await p.getByRole('button', { name: 'Ouvrir les paramètres' }).click(); assert.equal(await p.locator('#settings').getAttribute('open'), '');
      await p.locator('[data-act=withcode]').click(); await locked.settle(2); assert.equal(await p.locator('#unlockPw').count(), 1);
    });
    await check('déverrouillage · mauvais code explique l’échec', async () => { await p.fill('#unlockPw', 'fixture-wrong'); await p.locator('#unlockForm button[type=submit]').click(); await locked.settle(3); await p.waitForFunction(() => document.querySelector('#unlockMsg').textContent === 'Code incorrect.'); });
    await check('déverrouillage · formulaire et focus préservés pendant le refresh', async () => { await p.fill('#unlockPw', 'fixture-typing'); await p.evaluate(() => renderAll()); assert.equal(await p.inputValue('#unlockPw'), 'fixture-typing'); });
    await check('déverrouillage · code correct, puis verrouillage', async () => {
      await p.fill('#unlockPw', fs.readFileSync('.passphrase', 'utf8').trim()); await Promise.all([p.waitForNavigation(), p.locator('#unlockForm button[type=submit]').click()]); await locked.settle(8); assert.equal(await p.evaluate(() => LOCKED()), false);
      await p.locator('#settings > summary').click(); await locked.settle(2); await Promise.all([p.waitForNavigation(), p.locator('[data-act=lock]').click()]); await locked.settle(4); assert.equal(await p.evaluate(() => LOCKED()), true);
    });
    assert.deepEqual(locked.errors, []); await locked.c.close();
  } finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK · erreurs JS : aucune`);
})().catch(e => { console.log('❌ ' + step); console.log(e.message.replace(/\n/g, ' ').slice(0,700)); console.error(e); process.exit(1); });
