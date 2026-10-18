'use strict';
// Recette du vrai HTML assemblé et du coffre, sur fixtures fictives uniquement. Aucun réseau réel.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const BR = require('./lib/browser'), { unlockIfLocked } = require('./lib/unlock');
const SP = process.env.SP, U = 'https://ipoower.github.io/iPoower/race-control/';
const html = fs.readFileSync('site/index.html', 'utf8'), source = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const T0 = Date.parse('2026-10-18T08:00:00Z'), x = { URL, console, Math, Intl, Map, Set, JSON,
  Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } } };
vm.createContext(x); vm.runInContext(source + ';this.payload=makeDemoPayload;this.ensemble=makeDemoEnsemble;this.nowcast=makeDemoNowcast;', x);
let count = 0;
(async () => {
  const browser = await BR.launch();
  try {
    for (const device of ['iphone', 'pc']) {
      const context = await browser.newContext({ viewport: device === 'iphone' ? { width: 414, height: 896 } : { width: 1280, height: 800 },
        isMobile: device === 'iphone', hasTouch: device === 'iphone', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
      const page = await context.newPage(), errors = [], networkNoise = []; let weatherCalls = 0;
      page.on('pageerror', e => {
        const full = (e.name ? e.name + ': ' : '') + e.message;
        // Même distinction que lib/context-session : WebKit remonte les fetch annulés en pageerror.
        // Comptés explicitement ; les exceptions de code restent bloquantes.
        if (BR.NAME === 'webkit' && /\bFetch API cannot load\b/.test(full) && !/\b(?:ReferenceError|SyntaxError|RangeError|is not a function|is not defined|undefined is not|null is not)\b/.test(full)) { networkNoise.push(full.replace(/\?.*$/, '')); return; }
        errors.push(full);
      }); await page.clock.install({ time: T0 });
      await page.route('**/*', route => {
        const u = route.request().url(), url = new URL(u), json = value => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(value) });
        if (['api.open-meteo.com', 'ensemble-api.open-meteo.com', 'air-quality-api.open-meteo.com'].includes(url.hostname)) {
          weatherCalls++; const q = url.searchParams, lats = String(q.get('latitude') || '48.85').split(','), lons = String(q.get('longitude') || '2.35').split(',');
          const one = i => x.payload('pluie', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
          if (lats.length > 1) return json(lats.map((_, i) => one(i)));
          const base = one(0);
          return json(url.hostname === 'ensemble-api.open-meteo.com' ? x.ensemble(base) : q.has('minutely_15') ? x.nowcast(base) : url.hostname === 'air-quality-api.open-meteo.com' ? {} : base);
        }
        if (u === U || u.split('?')[0] === U + 'index.html') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
        if (u.includes('calendar.sealed.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json') });
        if (u.endsWith('tiredb.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json') });
        if (u.endsWith('leaflet.js')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
        if (u.endsWith('leaflet.css')) return route.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
        if (url.hostname === 'public.opendatasoft.com') return json({ records: [] });
        return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: '' });
      });
      await page.goto(U); await page.clock.runFor(2500); const settle = async () => { for (let i = 0; i < 6; i++) { await page.clock.runFor(500); await page.waitForTimeout(80); } };
      await unlockIfLocked(page, settle); await settle();
      let ready = false;
      for (let i = 0; i < 30; i++) { ready = await page.evaluate(() => typeof CX !== 'undefined' && !!CX && S.cars.length === 2); if (ready) break; await settle(); }
      assert(ready, 'Contexte météo fictif indisponible');
      await page.evaluate(() => {
        Object.assign(S.cars[0].tire, { type: 'summer', brand: 'Michelin', model: 'Pilot Sport 4S', size: '215/40 ZR18 89Y XL', treadAv: 2.4, treadAr: 5.8, tread: 2.4, treadEst: 0,
          treads: [{ d: '2026-10-12', mm: 2.4, ax: 'av', pos: 'shoulders', km: null }, { d: '2026-10-12', mm: 3.6, ax: 'av', pos: 'centre', km: null }], info: 'Note fictive <img src=x onerror=alert(1)>' });
        Object.assign(S.cars[0].plan, { on: 1, brand: 'Goodyear', model: 'UltraGrip Performance 3', size: '215/40 R18 89V XL' });
        Object.assign(S.cars[1].tire, { type: 'summer', brand: 'Rovelo', model: 'RPX988', size: '225/45 ZR17 94Y XL', treadAv: 4.4, treadAr: 6.2, tread: 4.4, treadEst: 0 });
        saveSettings(); rebuild(); renderAll();
      });
      await settle();
      // Le contexte canonique exige un choix explicite : aucun véhicule n'est supposé actif.
      if (await page.locator('#dayContext details.day-editor').getAttribute('open') === null) await page.locator('#dayContext details.day-editor > summary').click();
      await page.locator('#dayContext [data-act="day-car"]').first().click();
      await settle();
      if (await page.locator('#dayContext details.day-editor').getAttribute('open') !== null) await page.locator('#dayContext details.day-editor > summary').click();
      const before = await page.evaluate(() => JSON.stringify(S.cars));
      const tab = async name => { await page.locator(`#viewSeg [data-v="${name}"]`).click(); await settle(); };
      await tab('pneus');
      const panel = page.locator('#secCars .ti-panel').first();
      const tyreText = await panel.textContent(); assert.match(tyreText, /Pilot Sport 4S/); assert.match(tyreText, /dimension différente/); assert.match(tyreText, /épaules/); assert.match(tyreText, /centre/); assert.match(tyreText, /NON MONTÉ/);
      assert.match(tyreText, /Alertes de sécurité/); assert.match(tyreText, /Essais du même modèle, non directement transposables/);
      assert.match(tyreText, /Mesures du véhicule/);
      assert.equal(await panel.locator('img').count(), 0);
      const roveloText = await page.locator('#secCars .ti-panel').nth(1).textContent();
      assert.match(roveloText, /Données d’essais insuffisantes/);
      assert.match(roveloText, /Essais indisponibles/);
      assert.match(roveloText, /Vigilance/); // pluie prévue : la vigilance garde sa priorité sur les données manquantes
      count++; console.log('✅ ' + device + ' · monte exacte, essais différents, mesures et projet non monté');
      for (const [view, selector] of [['meteo', '#secWx'], ['analyse', '#secLab'], ['trajet', '#secTrip']]) {
        await tab(view); const p = page.locator(selector + ' .ti-panel').first();
        assert(await p.isVisible(), device + ' · panneau ' + view + ' absent : ' + await page.evaluate(() => JSON.stringify({ view: UI.view, car: appDay().activeCarId, weather: !!CX })));
        assert.match(await p.textContent(), /Qualité des preuves/);
        count++; console.log('✅ ' + device + ' · intégration ' + view);
      }
      await tab('analyse');
      const evidence = page.locator('#secLab .ti-panel').first();
      await evidence.locator(':scope > summary').click();
      await evidence.locator('details.ti-test').first().locator('summary').click();
      assert.match(await evidence.innerText(), /35,52 m/); assert.match(await evidence.innerText(), /80 → 1 km\/h/); assert.match(await evidence.innerText(), /78,5 km\/h/);
      assert.equal(await page.locator('#secLab .lab-brk [data-k=dist]').count(), 0);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        small: [...document.querySelectorAll('#secLab .ti-panel summary, #secLab .ti-panel a')].filter(x => x.getBoundingClientRect().height > 0 && x.getBoundingClientRect().height < 43).length }));
      assert(layout.scroll <= layout.width + 1, JSON.stringify(layout)); assert.equal(layout.small, 0); count++; console.log('✅ ' + device + ' · valeurs originales, protocoles, liens et cibles tactiles');
      await page.screenshot({ path: SP + '/place-tyre-intelligence-' + device + '.png', fullPage: true });
      assert.equal(await page.evaluate(() => JSON.stringify(S.cars)), before);
      const calls = weatherCalls; await page.evaluate(() => { for (let i = 0; i < 10; i++) tyreIntelligenceHtml(S.cars[0], 'analyse'); });
      assert.equal(weatherCalls, calls); count++; console.log('✅ ' + device + ' · aucune mutation et aucun appel API du module');
      const absent = await page.evaluate(() => { const previous = CX; CX = null; renderCars(); const text = document.querySelector('#secCars .ti-panel')?.textContent || ''; CX = previous; renderCars(); return text; });
      assert.match(absent, /Pilot Sport 4S/); assert.match(absent, /Météo du contexte indisponible/); assert.match(absent, /35,52/);
      count++; console.log('✅ ' + device + ' · essais accessibles dans Pneus même sans météo');
      await context.setOffline(true); await page.evaluate(() => { RAW[UI.loc].t -= 2 * 3600e3; renderAll(); });
      assert.match(await page.locator('#secLab .ti-panel').first().textContent(), /Météo ancienne/); assert.match(await evidence.textContent(), /35,52/);
      count++; console.log('✅ ' + device + ' · catalogue utilisable hors ligne, météo périmée signalée');
      await context.setOffline(false); await page.reload(); await unlockIfLocked(page, settle); await settle();
      await tab('pneus'); assert.match(await page.locator('#secCars .ti-panel').first().textContent(), /épaules/);
      assert.equal(await page.evaluate(() => S.cars[0].tire.treads.length), 2); assert.equal(await page.evaluate(() => S.cars[0].tire.treads[1].mm), 3.6);
      assert.deepEqual(errors, []); count++; console.log('✅ ' + device + ' · points conservés au rechargement, aucune erreur JavaScript · fetch annulés WebKit comptés : ' + networkNoise.length);
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK`);
})().catch(error => { console.error('❌ Tyre Intelligence : ' + error.message); process.exit(1); });
