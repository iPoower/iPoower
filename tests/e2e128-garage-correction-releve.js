// Garage · correction d'un relevé du compteur (16/11/2026), données FICTIVES, PC puis iPhone : liste des relevés, relevé
// incohérent mis en évidence, « Corriger » (marqueur d'annulation + valeur juste, jamais d'effacement), relecture du coffre
// après rechargement, « Annuler ce relevé », « Fermer ».
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), { unlockIfLocked } = require('./lib/unlock');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://ipoower.github.io', U = O + '/iPoower/race-control/';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
async function run(b, dev, view) {
  const c = await b.newContext({ ...view, timezoneId: 'Europe/Paris' }), p = await c.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  await p.route('**/*', r => {
    const url = new URL(r.request().url()), host = url.hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
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
  const ready = () => p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  await p.goto(U); await p.waitForTimeout(800); await unlockIfLocked(p); await ready();
  // Relevés FICTIFS : au premier, il manque un chiffre (constat du 16/11 sur valeurs réelles, non reproduites ici).
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10), D = [day(29), day(22), day(15), day(8)];
  await p.evaluate(d => { S.cars[0].odo = [{ d: d[0], km: 21100 }, { d: d[1], km: 211300 }, { d: d[2], km: 211650 }, { d: d[3], km: 212000 }]; delete S.cars[0].odoGoal; saveSettings(); }, D);
  await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(900);
  await p.evaluate(() => { renderGarage.last = null; renderGarage(); }); await p.waitForTimeout(300);
  const A = () => p.locator('[data-garage-odo="carA"]');
  await A().locator('details.ux-fold > summary').click();
  const rows = await A().locator('.odo-list li').count(), bad = await A().locator(`.odo-list li.odo-bad[data-odo-day="${D[0]}"]`).count();
  check(`${dev} · liste des relevés : relevé incohérent en tête et mis en évidence, puis du plus récent au plus ancien`, rows === 4 && bad === 1 && /21\s100 km/.test(await A().locator('.odo-list li').first().innerText()) && /212\s000 km/.test(await A().locator('.odo-list li').nth(1).innerText()), JSON.stringify({ rows, bad }));
  // Corriger le relevé faux
  const dialogs = []; p.on('dialog', d => dialogs.push(d.message()));
  await A().locator('details.ux-fold > summary').click(); await p.waitForTimeout(200);   // volet refermé : « Corriger » depuis l'alerte
  await A().locator(`[data-odo-suspect] [data-odo-fix][data-d="${D[0]}"]`).click(); await p.waitForTimeout(400);
  check(`${dev} · « Corriger » dans l’alerte ouvre le volet sur la bonne ligne`, await A().locator('details.ux-fold').evaluate(d => d.open) && await A().locator(`.odo-list li[data-odo-day="${D[0]}"] .odo-fix-form`).count() === 1);
  const focused = await p.evaluate(() => document.activeElement && document.activeElement.name);
  check(`${dev} · « Corriger » ouvre la saisie sur la valeur actuelle, curseur dans le champ`, focused === 'km' && /21\s100/.test(await A().locator('.odo-fix-form input[name=km]').inputValue()), focused);
  await A().locator('.odo-fix-form input[name=km]').fill('210 950'); await A().locator('.odo-fix-form button[type=submit]').click(); await p.waitForTimeout(1500);
  const fixed = await p.evaluate(() => ({ odo: S.cars[0].odo, live: Garage.odoLive(S.cars[0].odo).map(o => o.km), status: document.querySelector('[data-garage-odo="carA"] .odo-list .odo-fix-status').textContent, susp: document.querySelectorAll('[data-garage-odo="carA"] [data-odo-suspect]').length, text: document.querySelector('[data-garage-odo="carA"]').textContent }));
  check(`${dev} · correction confirmée (ancienne → nouvelle valeur annoncées), enregistrée dans le coffre`, dialogs.some(m => /21\s100 km → 210\s950 km/.test(m) && /annulée/.test(m)) && /corrigé.*enregistré dans le coffre/.test(fixed.status), dialogs.join(' / ') + ' | ' + fixed.status);
  check(`${dev} · ancienne valeur jamais effacée : marqueur d’annulation, valeur juste en vigueur`, fixed.odo.some(o => o.km === 21100 && !o.void) && fixed.odo.some(o => o.km === 21100 && o.void === 1) && fixed.live.join(',') === '210950,211300,211650,212000', JSON.stringify(fixed.odo));
  check(`${dev} · plus d’alerte, km parcourus recalculés sur la valeur juste`, fixed.susp === 0 && /1\s050 km/.test(fixed.text) && /1 relevé corrigé ou annulé/.test(fixed.text), fixed.text.slice(0, 400));
  // Rechargement : la correction est relue du coffre
  await p.reload(); await p.waitForTimeout(800); await unlockIfLocked(p);
  await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  check(`${dev} · après rechargement : correction relue depuis le coffre`, await p.evaluate(() => Garage.odoLive(S.cars[0].odo).map(o => o.km).join(',')) === '210950,211300,211650,212000');
  // Annuler un relevé (sans le remplacer), puis « Fermer » une saisie ouverte
  await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(900);
  if (!(await A().locator('details.ux-fold').evaluate(d => d.open))) await A().locator('details.ux-fold > summary').click();
  await A().locator(`[data-odo-fix][data-d="${D[2]}"]`).click(); await p.waitForTimeout(300);
  await A().locator(`[data-odo-void][data-d="${D[2]}"]`).click(); await p.waitForTimeout(1500);
  const voided = await p.evaluate(() => Garage.odoLive(S.cars[0].odo).map(o => o.km).join(','));
  check(`${dev} · « Annuler ce relevé » : confirmé, il ne compte plus, tracé comme annulé`, voided === '210950,211300,212000' && dialogs.some(m => /Annuler le relevé/.test(m)), voided);
  await A().locator(`[data-odo-fix][data-d="${D[3]}"]`).click(); await p.waitForTimeout(300);
  await A().locator('[data-odo-fix-cancel]').click(); await p.waitForTimeout(300);
  check(`${dev} · « Fermer » referme la saisie sans rien modifier`, await A().locator('.odo-fix-form').count() === 0 && await p.evaluate(() => Garage.odoLive(S.cars[0].odo).length) === 3);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'PC', { viewport: { width: 1280, height: 900 } });
    await run(b, 'iPhone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
