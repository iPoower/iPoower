'use strict';
// Intelligence pneumatique V2 (17/11/2026) : vrai HTML assemblé et coffre, données 100 % fictives, aucun réseau réel.
// Vérifie dans l'interface : plus d'inférence « haute performance » ni de règle des 7 °C, essais ADAC affichés avec leur
// comparabilité (sans coefficient), lacunes d'essais explicites, train prévu non monté, isolation des deux voitures, hors ligne.
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
        Object.assign(S.cars[0].tire, { type: 'summer', brand: 'Continental', model: 'PremiumContact 7', size: '225/45 R17 94Y XL', treadAv: 7, treadAr: 7, tread: 7, treadEst: 0, treads: [] });
        Object.assign(S.cars[0].plan, { on: 1, brand: 'Goodyear', model: 'Vector All Season 4', size: '225/45 R17 94W XL' });
        Object.assign(S.cars[1].tire, { type: 'summer', brand: 'Rovelo', model: 'RPX-988', size: '225/45 ZR17 94Y XL', treadAv: 1.4, treadAr: 5, tread: 1.4, treadEst: 0, treads: [] });
        saveSettings(); rebuild(); renderAll();
      });
      await settle();
      // Même action que le bouton « voiture du jour » (data-act="day-car" → appSetCar), utilisable depuis n'importe quel onglet.
      const pick = async i => { await page.evaluate(k => { appSetCar(S.cars[k].id); renderAll(); }, i); await settle();
        assert.equal(await page.evaluate(() => appDay().activeCarId), await page.evaluate(k => S.cars[k].id, i)); };
      const tab = async name => { await page.locator(`#viewSeg [data-v="${name}"]`).click(); await settle(); };
      await pick(0);
      const before = await page.evaluate(() => JSON.stringify(S.cars));
      // 1. Pneus : essai ADAC du modèle monté, avec sa comparabilité ; projet non monté distinct
      await tab('pneus');
      const pc7 = await page.locator('#secCars .ti-panel').first().textContent();
      assert.match(pc7, /PremiumContact 7/); assert.match(pc7, /30,1/); assert.match(pc7, /dimension différente/i); assert.match(pc7, /NON MONTÉ/);
      assert.match(pc7, /Vector All Season 4/);
      const rov = await page.locator('#secCars .ti-panel').nth(1).textContent();
      assert.match(rov, /RPX-988/); assert.doesNotMatch(rov, /30,1|PremiumContact/, 'aucun essai d’un autre pneu attribué au Rovelo');
      count++; console.log('✅ ' + device + ' · Pneus : essai ADAC du modèle monté avec comparabilité, projet non monté séparé, aucun essai prêté au Rovelo');
      // 2. Analyse : plus d'inférence « haute performance » ni de règle des 7 °C ; hypothèse générique annoncée
      await tab('analyse');
      const lab = await page.locator('#secLab').textContent();
      assert.doesNotMatch(lab, /fenêtre décalée|haute performance \(|règle des 7 °C|Pneu été sous 7 °C/);
      assert.match(lab, /indice de vitesse Y/); assert.match(lab, /sans effet sur la fenêtre thermique/);
      assert.match(lab, /n’applique plus de seuil fixe à 7 °C/);
      assert.match(lab, /PremiumContact 7/);
      count++; console.log('✅ ' + device + ' · Analyse : indice de vitesse sans effet, aucune règle des 7 °C, hypothèse générique annoncée');
      // 3. Isolation : la voiture B affiche ses propres pneus et son état critique, la voiture A est inchangée
      await pick(1); await tab('analyse');
      const labB = await page.locator('#secLab').textContent();
      assert.match(labB, /RPX-988/); assert.doesNotMatch(labB, /PremiumContact 7/); assert.match(labB, /sous le minimum légal|1,4 mm/);
      await tab('pneus');
      assert.match(await page.locator('#secCars .ti-panel').first().textContent(), /PremiumContact 7/, 'la carte de la voiture A garde sa monte');
      assert.equal(await page.evaluate(() => JSON.stringify(S.cars)), before, 'aucune donnée de véhicule modifiée par l’affichage');
      count++; console.log('✅ ' + device + ' · isolation : voiture B (1,4 mm) critique avec ses pneus, voiture A inchangée, aucune mutation');
      // 4. Hors ligne : le catalogue est embarqué, aucun appel réseau du module
      await pick(0);
      const calls = weatherCalls; await context.setOffline(true); await page.evaluate(() => { renderAll(); for (let i = 0; i < 5; i++) tyreIntelligenceHtml(S.cars[0], 'analyse'); });
      await tab('pneus'); assert.match(await page.locator('#secCars .ti-panel').first().textContent(), /30,1/); assert.equal(weatherCalls, calls);
      await context.setOffline(false);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(layout.scroll <= layout.width + 1, JSON.stringify(layout));
      assert.deepEqual(errors, []);
      count++; console.log('✅ ' + device + ' · hors ligne : essais affichés sans réseau, aucun débordement, aucune erreur JavaScript · fetch annulés WebKit comptés : ' + networkNoise.length);
      await page.screenshot({ path: SP + '/pneus-v2-' + device + '.png', fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(`${count}/${count} scénarios OK`);
})().catch(error => { console.error('❌ Pneus V2 : ' + error.message); process.exit(1); });
