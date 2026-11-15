// Audit navigateurs du 15/11/2026 (Chromium, profils Chrome et Brave simulés), données FICTIVES, PC puis iPhone :
// 1. écran de verrouillage : « Pas de code ? » sur sa propre ligne (plus de « ouverture.Pas de code ») ;
// 2. carte « Ici, maintenant » : « ANALYSE LIMITÉE » (profondeur inconnue) en ton neutre, jamais en vert ✓,
//    comme le verdict des cartes voiture ; une fois la profondeur saisie, le RAS retrouve son vert ✓.
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
  // 1. écran de verrouillage
  await p.locator('#unlockPw').waitFor({ timeout: 20000 });
  const lock = await p.evaluate(() => {
    const f = document.getElementById('unlockForm'), box = f.closest('span') || f.parentElement, nc = box.querySelector('[data-act=nocode]');
    const line = nc && nc.parentElement, prev = line && line.previousElementSibling;
    return { txt: box.innerText, below: !!(line && prev && line.getBoundingClientRect().top >= prev.getBoundingClientRect().bottom - 1) };
  });
  check(`${dev} · verrouillage : « Pas de code ? » sur sa propre ligne, aucun mot collé`, !/ouverture\.Pas/.test(lock.txt) && /Pas de code/.test(lock.txt) && lock.below, JSON.stringify(lock).slice(0, 300));
  await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
  await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && typeof CX === 'object' && CX && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  // 2. profondeur inconnue : verdict neutre
  await p.evaluate(() => { const t = S.cars[0].tire; ['tread', 'treadAv', 'treadAr'].forEach(k => { t[k] = null; }); t.treads = []; t.brand = 'Marque test'; t.model = 'Été test'; renderCars.last = ''; renderCars(); renderDecisionCore.last = null; renderDecisionCore(); });
  await p.waitForFunction(() => /ANALYSE LIMITÉE/.test((document.querySelector('#decisionCore h2') || {}).textContent || ''), null, { timeout: 15000 });
  const hero = () => p.evaluate(() => { const el = document.getElementById('decisionCore'), core = el.classList.contains('decision-core') ? el : el.querySelector('.decision-core'); return { h2: el.querySelector('h2').textContent.trim(), cls: core ? core.className : el.className }; });
  const lim = await hero();
  check(`${dev} · « ANALYSE LIMITÉE » : ton neutre (lvx), pas de ✓ vert`, /\blvx\b/.test(lim.cls) && !/\blv0\b/.test(lim.cls) && !/✓/.test(lim.h2), JSON.stringify(lim));
  const carNeutral = await p.evaluate(() => [...document.querySelectorAll('#secCars .verdict')].some(v => v.classList.contains('lvx') && /ANALYSE LIMITÉE/.test(v.textContent)));
  check(`${dev} · même ton que le verdict de la carte voiture (⚪ · lvx)`, carNeutral);
  // 3. profondeur saisie par pneu (chemin réel de l'interface) : le RAS redevient vert ✓
  await p.evaluate(() => { const b = document.querySelector('[data-garage-target=tread-wheels]'); if (b) b.click(); });
  await p.waitForTimeout(700);
  if (!(await p.locator('#trw-0-fl-side').isVisible().catch(() => false))) await p.evaluate(() => { document.querySelector('#settings').open = true; });
  for (const [k, v] of [['fl', '6.2'], ['fr', '6.1'], ['rl', '6.5'], ['rr', '6.4']]) await p.locator(`#trw-0-${k}-side`).fill(v);
  await p.locator('#trw-0-est').selectOption('0'); await p.locator('#trw-0-d').fill(await p.evaluate(() => treadToday()));
  await p.locator('[data-act="tread-wheels"][data-i="0"]').click(); await p.waitForTimeout(1200);
  await p.evaluate(() => { renderDecisionCore.last = null; renderDecisionCore(); });
  const ok = await hero();
  check(`${dev} · profondeur connue : verdict hors « ANALYSE LIMITÉE », ton du niveau réel (lv0-3)`, !/ANALYSE LIMITÉE/.test(ok.h2) && /\blv[0-3]\b/.test(ok.cls) && !/\blvx\b/.test(ok.cls) && (!/\blv0\b/.test(ok.cls) || /✓/.test(ok.h2)), JSON.stringify(ok));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'PC', { viewport: { width: 1280, height: 900 } });
    await run(b, 'iPhone', { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
