// Garage · évolution du kilométrage et objectif par voiture (16/11/2026), données FICTIVES, PC puis iPhone :
// courbe des relevés réels, objectif en kilomètres (progression, reste, date au rythme réel, projection) ou « à vie »,
// valeur invalide refusée, objectifs relus du coffre après rechargement, historique des relevés jamais tronqué à 60.
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
  // Relevés FICTIFS datés par rapport au jour réel (≈ 15 000 km/an) ; aucune voiture ni objectif réels.
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  await p.evaluate(([a, b, c]) => { S.cars[0].odo = [{ d: a, km: 180000 }, { d: b, km: 187000 }, { d: c, km: 195000 }]; S.cars[1].odo = [{ d: b, km: 4000 }, { d: c, km: 11000 }];
    delete S.cars[0].odoGoal; delete S.cars[1].odoGoal; saveSettings(); }, [day(366), day(186), day(1)]);
  await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(900);
  await p.evaluate(() => { renderGarage.last = null; renderGarage(); }); await p.waitForTimeout(300);
  const A = p.locator('[data-garage-odo="carA"]'), B = p.locator('[data-garage-odo="carB"]');
  check(`${dev} · chaque fiche a son bloc kilométrage, sans objectif au départ`, await A.count() === 1 && await B.count() === 1 && await A.locator('[data-odo-goal-state=none]').count() === 1, await A.innerText().catch(() => 'absent'));
  // Objectif kilométrage cible (fictif : 250 000 km) pour A
  await A.locator('details.ux-fold > summary').click();
  check(`${dev} · courbe tracée depuis les relevés réels, décrite pour les lecteurs d’écran`, await A.locator('.odo-chart svg path.odo-line').count() === 1 && /180\s000 km/.test(await A.locator('.odo-chart svg').getAttribute('aria-label')));
  await A.locator('select[name=mode]').selectOption('km'); await A.locator('input[name=km]').fill('250 000');
  await A.locator('button[type=submit]').click(); await p.waitForTimeout(1200);
  const a = await A.innerText(), bar = await A.locator('.odo-bar').getAttribute('aria-valuenow').catch(() => null);
  check(`${dev} · objectif 250 000 km : enregistré dans le coffre, 78 %, reste 55 000 km, date estimée au rythme réel`,
    await p.evaluate(() => JSON.stringify(S.cars[0].odoGoal)) === '{"km":250000}' && /enregistré dans le coffre/.test(a) && bar === '78' && /Reste 55\s000 km/.test(a) && /atteint vers \d{2}\/20\d{2}/.test(a), a.slice(0, 400));
  check(`${dev} · projection pointillée jusqu’à l’objectif sur la courbe`, await A.locator('.odo-chart path.odo-proj').count() === 1 && /🏁/.test(await A.locator('.odo-chart figcaption').innerText()));
  // Objectif « à vie » pour B
  await B.locator('details.ux-fold > summary').click();
  await B.locator('select[name=mode]').selectOption('life'); await B.locator('button[type=submit]').click(); await p.waitForTimeout(1200);
  const bt = await B.innerText();
  check(`${dev} · objectif « à vie » : aucune limite, km parcourus et rythme affichés, champ kilométrage masqué`, await p.evaluate(() => JSON.stringify(S.cars[1].odoGoal)) === '{"life":1}' && /♾️ Objectif : à vie/.test(bt) && /7\s000 km parcourus/.test(bt) && !/Reste/.test(bt) && await B.locator('[data-odo-goal-km]').isHidden(), bt.slice(0, 300));
  // Valeur invalide : refusée, rien de modifié
  await A.locator('select[name=mode]').selectOption('km'); await A.locator('input[name=km]').fill('abc'); await A.locator('button[type=submit]').click(); await p.waitForTimeout(600);
  check(`${dev} · kilométrage cible invalide refusé, objectif précédent conservé`, /invalide/i.test(await A.locator('.odo-goal-status').innerText()) && await p.evaluate(() => JSON.stringify(S.cars[0].odoGoal)) === '{"km":250000}');
  // Rechargement : objectifs conservés (coffre)
  await p.reload(); await p.waitForTimeout(800); await unlockIfLocked(p); await ready();
  check(`${dev} · après rechargement : objectifs relus depuis le coffre`, await p.evaluate(() => JSON.stringify([S.cars[0].odoGoal, S.cars[1].odoGoal])) === '[{"km":250000},{"life":1}]');
  // Historique long : la saisie des Paramètres ne tronque plus aux 60 derniers relevés
  await p.evaluate(() => { const base = Date.parse('2024-01-01T00:00:00Z'); S.cars[0].odo = Array.from({ length: 65 }, (_, i) => ({ d: new Date(base + i * 7 * 864e5).toISOString().slice(0, 10), km: 150000 + i * 300 })); saveSettings(); document.querySelector('#settings').open = true; renderSettings(true); });
  await p.waitForTimeout(600);
  await p.locator('#odo-0').fill('199000'); await p.locator('[data-act="odo"][data-i="0"]').click(); await p.waitForTimeout(900);
  const odo = await p.evaluate(() => ({ n: S.cars[0].odo.length, first: S.cars[0].odo[0].km, sorted: S.cars[0].odo.every((o, i, a) => !i || a[i - 1].d <= o.d) }));
  check(`${dev} · relevé ajouté dans Paramètres : 66 relevés gardés (aucun des 60 premiers effacé), ordre chronologique`, odo.n === 66 && odo.first === 150000 && odo.sorted, JSON.stringify(odo));
  await p.locator('#viewSeg [data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(900);
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
