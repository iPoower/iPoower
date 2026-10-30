// Badge de sauvegarde : le compteur « N modifs en attente » ne compte que les saisies de l'utilisateur.
// Vraie app servie sur une origine dédiée fictive avec une configuration Drive publique fictive : le badge
// et son écouteur sont câblés par l'app elle-même (initDriveSync). Google n'est jamais chargé ni contacté
// (aucune connexion) : seul l'affichage du compteur est vérifié, aucun envoi.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://rc-badge.example', U = O + '/';
const CONFIG = { approved: true, clientId: '123456789012-badgefictif.apps.googleusercontent.com', apiKey: 'AIza' + 'B'.repeat(35), appId: '123456789012', raceOrigin: O, vaultOrigin: 'https://cv-badge.example' };
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
      if (url.origin === O && url.pathname === '/drive-config.json') return J(CONFIG);
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
    await p.goto(U); await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
    await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 });
    await p.waitForTimeout(1500);
    // Badge câblé par l'app (configuration Drive chargée) ; une liaison fictive affiche « Reconnexion requise ».
    await p.waitForFunction(() => DRIVE_UI.config && document.getElementById('driveBadge'), null, { timeout: 20000 });
    await p.evaluate(() => {
      window.__keys = []; window.addEventListener('twrc-vault-change', e => window.__keys.push(e.key));
      DRIVE_UI.hint = { folder: 'dossier-fictif', binding: 'a'.repeat(64) }; DRIVE_BADGE.pending = 0; renderDriveBadge();
    });
    const state = () => p.evaluate(() => ({ n: DRIVE_BADGE.pending, text: document.getElementById('driveBadge').textContent, keys: window.__keys.slice() }));
    const s0 = await state();
    check('badge rendu, aucune modification en attente au départ', s0.n === 0 && /Reconnexion requise$/.test(s0.text), JSON.stringify(s0));

    // 1. Écritures météo automatiques : actualisation réelle (relevés, comparaisons, journal du matin, contexte).
    await p.evaluate(() => {
      const shadow = JSON.parse(lsGet('twrc.shadow.v1') || '[]'), reports = JSON.parse(lsGet('twrc.reports.v1') || '[]'), day = new Date().toISOString().slice(0, 10);
      lsSet('twrc.shadow.v1', JSON.stringify(shadow.concat([{ at: Date.now(), T: 4.2, model: 'fictif' }])));
      lsSet('twrc.reports.v1', JSON.stringify(reports.concat([{ at: Date.now(), kind: 'fictif' }])));
      S.journal = { ...(S.journal || {}), [day]: { T: 3.1, Tr: 2.4, ice: 0, vis: 9000, lv: {} } };
      lsSet('twrc.settings.v1', JSON.stringify(S));   // même écriture que recordJournal()
      refreshAll();
    });
    await p.waitForTimeout(4000);
    const s1 = await state(), auto = s1.keys.filter(k => /twrc\.(shadow|reports|settings|context)/.test(k));
    check('écritures météo automatiques réellement faites', auto.includes('twrc.shadow.v1') && auto.includes('twrc.reports.v1') && auto.includes('twrc.settings.v1'), [...new Set(s1.keys)].join(','));
    check('écriture météo automatique : compteur inchangé', s1.n === 0 && !/modif/.test(s1.text), JSON.stringify({ n: s1.n, text: s1.text }));

    // 2. Saisie au Garage : compteur relevé depuis la fiche du véhicule (clics réels).
    await p.evaluate(() => scrollTo(0, 0));
    await p.locator('[data-act=view][data-v=garage]').first().click(); await p.waitForTimeout(400);
    await p.locator('[data-act=garage-quick][data-garage-target=odo]').first().click(); await p.waitForTimeout(500);
    const before = await state();
    await p.locator('#odo-0').fill('24680'); await p.locator('[data-act=odo][data-i="0"]').click(); await p.waitForTimeout(1200);
    const s2 = await state();
    check('saisie au Garage : compteur augmenté de 1', s2.n === before.n + 1, JSON.stringify({ avant: before.n, apres: s2.n }));
    check('badge : « Reconnexion requise · 1 modif en attente »', /Reconnexion requise · 1 modif en attente/.test(s2.text), s2.text);

    // 3. Nouvelle écriture automatique après la saisie : toujours 1.
    await p.evaluate(() => { const r = JSON.parse(lsGet('twrc.reports.v1') || '[]'); lsSet('twrc.reports.v1', JSON.stringify(r.concat([{ at: Date.now(), kind: 'fictif-2' }]))); });
    await p.waitForTimeout(1200);
    const s3 = await state();
    check('écriture automatique après la saisie : compteur toujours à 1', s3.n === 1, String(s3.n));
    check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
    await c.close();
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles du compteur de badge');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
