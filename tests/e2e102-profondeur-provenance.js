// Provenance de l'historique de profondeur, vraies saisies (PC et iPhone selon le navigateur de la CI), données fictives.
// Revue du 01/11/2026 : chaque ligne d'historique porte l'origine choisie à SA saisie (jamais treadEst) ; treadEst global =
// origine de l'essieu le plus usé ; verdict toujours sur l'essieu le plus usé ; historique ancien jamais réécrit ni perdu ;
// enregistrement, rechargement et relecture de l'historique.
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
    p.on('dialog', d => d.accept());
    await openSettings();
    const OLD = [{ d: '2026-09-01', mm: 6.5, km: 10000, ax: 'av' }, { d: '2026-09-01', mm: 4.2, km: 10000, ax: 'ar', est: 1 }, { d: '2026-10-01', mm: 3.6, km: 11000, ax: 'av', pos: 'centre', wheel: 'front-left' }];
    const prime = async (tire) => { await p.evaluate(t => { Object.assign(S.cars[0].tire, t); saveSettings(); renderSettings(true); }, tire); await openSettings(); await p.locator('#trw-0').scrollIntoViewIfNeeded(); };
    const save = async (vals, est) => {
      for (const k of ['fl', 'fr', 'rl', 'rr']) for (const f of ['side', 'mid']) await p.locator(`#trw-0-${k}-${f}`).fill(vals[k] && vals[k][f] != null ? String(vals[k][f]) : '');
      await p.locator('#trw-0-est').selectOption(est ? '1' : '0'); await p.locator('#trw-0-d').fill(await p.evaluate(() => treadToday()));
      await p.locator('[data-act="tread-wheels"][data-i="0"]').click(); await p.waitForTimeout(600);
    };
    const state = () => p.evaluate(() => { const t = S.cars[0].tire, d = treadToday(); return { av: t.treadAv, ar: t.treadAr, est: t.treadEst, today: (t.treads || []).filter(r => r.d === d), all: t.treads, mm: tyreStateOf(S.cars[0]).tread.mm, worst: tyreStateOf(S.cars[0]).tread.worstAxle }; });
    const reload = async () => { await p.evaluate(() => window.TWRC_VAULT.flush && window.TWRC_VAULT.flush()); await p.waitForTimeout(500); await p.reload(); await p.waitForTimeout(800); await unlock();
      await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 }); await openSettings(); };
    // Scénario de la revue : AV 6,0 ; AR 3,0 ESTIMÉ (le plus usé) ; nouveau relevé de l'AVANT seul, 5,0 mm, MESURÉ à la jauge.
    await prime({ treadAv: 6, treadAr: 3, tread: 3, treadEst: 1, treads: [...OLD, { d: '2026-10-15', mm: 3, km: 11500, ax: 'ar', est: 1 }, { d: '2026-10-15', mm: 6, km: 11500, ax: 'av' }] });
    await save({ fl: { side: 5 }, fr: { side: 5.1, mid: 5.2 } }, false);
    let s = await state();
    const ok1 = x => x.today.length === 1 && x.today[0].ax === 'av' && x.today[0].mm === 5 && !x.today[0].est && x.est === 1 && x.av === 5 && x.ar === 3 && x.mm === 3 && x.worst === 'ar';
    check('AV mesuré seul : ligne AV « mesure », AR toujours estimé, verdict sur l’AR à 3,0 mm', ok1(s), JSON.stringify(s.today) + ' est=' + s.est + ' mm=' + s.mm);
    check('historique ancien intact (aucune ligne réécrite ni perdue)', JSON.stringify(s.all.slice(0, OLD.length)) === JSON.stringify(OLD) && s.all.length === OLD.length + 3, JSON.stringify(s.all));
    await reload(); s = await state();
    check('après rechargement : ligne AV mesurée, AR estimé, verdict 3,0 mm, historique ancien intact', ok1(s) && JSON.stringify(s.all.slice(0, OLD.length)) === JSON.stringify(OLD), JSON.stringify(s.today) + ' est=' + s.est);
    // Scénario symétrique : AR mesuré, AV estimé et plus usé.
    await p.locator('#trw-0').scrollIntoViewIfNeeded();
    await prime({ treadAv: 3, treadAr: 6, tread: 3, treadEst: 1, treads: [...OLD, { d: '2026-10-15', mm: 3, km: 11500, ax: 'av', est: 1 }, { d: '2026-10-15', mm: 6, km: 11500, ax: 'ar' }] });
    await save({ rl: { side: 5 }, rr: { mid: 5.4 } }, false);
    s = await state();
    const ok2 = x => x.today.length === 1 && x.today[0].ax === 'ar' && x.today[0].mm === 5 && !x.today[0].est && x.est === 1 && x.av === 3 && x.ar === 5 && x.mm === 3 && x.worst === 'av';
    check('symétrique · AR mesuré seul : ligne AR « mesure », AV toujours estimé, verdict sur l’AV à 3,0 mm', ok2(s), JSON.stringify(s.today) + ' est=' + s.est + ' mm=' + s.mm);
    await reload(); s = await state();
    check('symétrique · après rechargement : identique, historique ancien intact', ok2(s) && JSON.stringify(s.all.slice(0, OLD.length)) === JSON.stringify(OLD), JSON.stringify(s.today) + ' est=' + s.est);
    check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
    await c.close();
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « provenance de l’historique »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
