// « Ajouter une voiture » : vrais clics dans Paramètres (PC et iPhone selon le navigateur de la CI).
// Fiche vierge créée, visible au Garage, saisissable, conservée après rechargement ; nom vide ou en double refusé.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://ipoower.github.io', U = O + '/iPoower/race-control/';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
(async () => {
  const b = await BR.launch();
  try {
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, timezoneId: 'Europe/Paris' });
    const p = await c.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    let weatherCalls = 0;
    await p.route('**/*', r => {
      const u = r.request().url(), url = new URL(u), host = url.hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      // Correspondance sur le nom d'hôte analysé (jamais une sous-chaîne de l'URL).
      if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
        weatherCalls++;
        const q = url.searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(','), one = i => ctx.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
        if (la.length > 1) return J(la.map((_, i) => one(i)));
        const x = one(0); return J(host.startsWith('ensemble') || url.pathname.includes('ensemble') ? ctx.me(x) : q.get('minutely_15') ? ctx.mn(x) : host.startsWith('air-quality') ? {} : x);
      }
      if (url.origin === O && url.pathname.endsWith('/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
      if (host === 'api.rainviewer.com') return J({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
      if (host === 'tilecache.rainviewer.com' || host.endsWith('.arcgisonline.com') || host === 'tile.openstreetmap.org' || host.endsWith('.tile.openstreetmap.org')) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
      if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
      if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
      if (url.origin === O && url.pathname.endsWith('/obs.json')) return J({ stations: {} });
      if (url.origin === O && url.pathname.endsWith('/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
      if (url.origin === O && !/\.(js|json)$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort();
    });
    const unlock = async () => {
      if (!await p.locator('#unlockPw').isVisible().catch(() => false)) return;
      await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
    };
    await p.goto(U); await p.waitForTimeout(800); await unlock();
    await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 });
    const openSettings = async () => { if (!await p.locator('#settings').evaluate(d => d.open)) await p.locator('#settings > summary').click(); await p.locator('#carNewName').waitFor({ timeout: 10000 }); await p.locator('#carNewName').scrollIntoViewIfNeeded(); };
    const n0 = await p.evaluate(() => S.cars.length);
    await openSettings();
    // Refus : nom vide, puis nom d'une voiture existante.
    await p.locator('[data-act=car-add]').click(); await p.waitForTimeout(300);
    check('nom vide refusé, aucune voiture créée', await p.evaluate(() => S.cars.length) === n0 && /1 à 60 caractères/.test(await p.locator('[data-act=car-add]').innerText()));
    const existing = await p.evaluate(() => S.cars[0].name);
    await p.locator('#carNewName').fill(existing.toUpperCase()); await p.locator('[data-act=car-add]').click(); await p.waitForTimeout(300);
    check('nom en double refusé (casse ignorée)', await p.evaluate(() => S.cars.length) === n0 && /déjà ce nom/.test(await p.locator('[data-act=car-add]').innerText()));
    // Création.
    await p.locator('#carNewName').fill('Voiture test C'); await p.locator('[data-act=car-add]').click(); await p.waitForTimeout(800);
    const made = await p.evaluate(() => { const c = S.cars[S.cars.length - 1]; return { n: S.cars.length, name: c.name, userAdded: c.userAdded, id: c.id, tire: c.tire && c.tire.type, maint: !!(c.maint && c.maint.ct), odo: (c.odo || []).length }; });
    check('voiture créée : fiche vierge (pneus, entretien), identifiant unique', made.n === n0 + 1 && made.name === 'Voiture test C' && made.userAdded === 1 && /^v-[0-9a-f]{12}$/.test(made.id) && made.tire === 'summer' && made.maint && made.odo === 0, JSON.stringify(made));
    check('confirmation affichée', /Voiture ajoutée : Voiture test C/.test(await p.locator('[data-act=car-add]').innerText()));
    // Saisie sur la nouvelle voiture (compteur).
    const i = made.n - 1;
    await p.locator('#odo-' + i).scrollIntoViewIfNeeded(); await p.locator('#odo-' + i).fill('1234'); await p.locator(`[data-act=odo][data-i="${i}"]`).click(); await p.waitForTimeout(600);
    check('compteur saisi sur la nouvelle voiture', await p.evaluate(i => (S.cars[i].odo || []).slice(-1)[0].km, i) === 1234);
    // Garage.
    await p.evaluate(() => scrollTo(0, 0)); await p.locator('[data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(600);
    check('visible au Garage', (await p.locator('#secGarage').innerText()).includes('Voiture test C'));
    // Rechargement : la voiture créée est conservée (au-delà de la liste du préréglage).
    await p.evaluate(() => window.TWRC_VAULT.flush && window.TWRC_VAULT.flush()); await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(800); await unlock();
    await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 });
    const kept = await p.evaluate(id => { const c = S.cars.find(x => x.id === id); return c ? { name: c.name, km: (c.odo || []).slice(-1)[0] && c.odo.slice(-1)[0].km, n: S.cars.length } : null; }, made.id);
    check('conservée après rechargement, avec son compteur', !!kept && kept.name === 'Voiture test C' && kept.km === 1234 && kept.n === n0 + 1, JSON.stringify(kept));
    check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
    await c.close();
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « Ajouter une voiture »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
