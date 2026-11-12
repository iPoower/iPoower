// Lisibilité de l'accueil (12/11/2026), données fictives, iPhone 11 Pro Max puis PC :
// voiture sans pneus repliée en une ligne ; raccourci « Saisir la profondeur » sous un verdict plafonné, jusqu'au relevé par pneu.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser');
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
  await p.goto(U); await p.waitForTimeout(800);
  if (await p.locator('#unlockPw').isVisible().catch(() => false)) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
  await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && typeof CX === 'object' && CX && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  // Profil fictif : voiture A en pneus été sans profondeur, voiture B sans pneus.
  await p.evaluate(() => { const t = S.cars[0].tire; ['tread', 'treadAv', 'treadAr'].forEach(k => { t[k] = null; }); t.treads = []; t.brand = 'Marque test'; t.model = 'Été test'; S.cars[1].tire.type = 'none'; renderCars.last = ''; renderCars(); });
  const wait = p.locator('#secCars article.car.wait');
  check(`${dev} · voiture sans pneus : une carte repliée, titre et état lisibles sans l’ouvrir`, await wait.count() === 1 && await wait.locator('details.ux-fold').evaluate(d => !d.open) && /Voiture test B/.test(await wait.locator('summary').innerText()) && /En attente de pneus/i.test(await wait.locator('summary').innerText()), await wait.innerText().catch(() => ''));
  const h = await wait.evaluate(e => e.getBoundingClientRect().height);
  check(`${dev} · carte repliée compacte (moins de 90 px de haut)`, h < 90, String(h));
  await wait.locator('summary').click();
  check(`${dev} · un geste l’ouvre : dimension et raccourci vers la fiche conservés`, await wait.locator('[data-act=goset-cfg]').isVisible() && /225\/45 R17/.test(await wait.innerText()));
  const todo = p.locator('#secCars article.car:not(.wait) .tread-todo [data-garage-target=tread-wheels]');
  check(`${dev} · verdict plafonné : raccourci « Saisir la profondeur » sur la carte`, await todo.count() === 1 && /ANALYSE LIMITÉE|profondeur non renseignée/i.test(await p.locator('#secCars article.car:not(.wait)').innerText()));
  const box = await todo.boundingBox();
  check(`${dev} · raccourci : cible tactile d’au moins 44 pt`, dev === 'PC' || (box && box.height >= 44 && box.width >= 44), JSON.stringify(box));
  await todo.click(); await p.waitForTimeout(700);
  const focus = await p.evaluate(() => ({ open: document.querySelector('#settings').open, id: document.activeElement && document.activeElement.id }));
  check(`${dev} · raccourci : Paramètres ouverts, curseur dans le relevé par pneu (avant gauche)`, focus.open && focus.id === 'trw-0-fl-side', JSON.stringify(focus));
  // relevé saisi → le raccourci disparaît, l'analyse n'est plus limitée
  for (const [k, v] of [['fl', '6.2'], ['fr', '6.1'], ['rl', '6.5'], ['rr', '6.4']]) await p.locator(`#trw-0-${k}-side`).fill(v);
  await p.locator('#trw-0-est').selectOption('0'); await p.locator('#trw-0-d').fill(await p.evaluate(() => treadToday()));
  await p.locator('[data-act="tread-wheels"][data-i="0"]').click(); await p.waitForTimeout(900);
  const saved = await p.locator('[data-act="tread-wheels"][data-i="0"]').innerText();
  const after = await p.evaluate(() => ({ todo: document.querySelectorAll('#secCars .tread-todo').length, txt: document.querySelector('#secCars article.car:not(.wait)').innerText, av: S.cars[0].tire.treadAv }));
  check(`${dev} · profondeur saisie : raccourci retiré, plus de « profondeur non renseignée »`, after.todo === 0 && after.av === 6.1 && !/profondeur non renseignée/i.test(after.txt), JSON.stringify({ todo: after.todo, av: after.av, saved }));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'iPhone', { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    await run(b, 'PC', { viewport: { width: 1280, height: 900 } });
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « lisibilité de l’accueil »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
