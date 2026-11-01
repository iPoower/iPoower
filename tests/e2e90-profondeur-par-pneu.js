// Profondeur PAR PNEU : vrais clics dans Paramètres (PC et iPhone selon le navigateur de la CI), données fictives.
// 4 positions × 2 points + date, minimum par essieu pour le verdict et l'alerte, usure irrégulière (repère indicatif),
// confirmation de transition à la première saisie, saisie invalide refusée, saisie par essieu plus récente signalée,
// conservation après rechargement, aucun débordement à 320 px.
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
    const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await openSettings();
    const i = 0, ready = await p.evaluate(() => ({ id: S.cars[0].id, type: S.cars[0].tire.type, n: Object.keys(S.treadWheels || {}).length }));
    check('monte été active, aucun relevé par pneu au départ', ready.type === 'summer' && ready.n === 0, JSON.stringify(ready));
    await p.locator('#trw-0').scrollIntoViewIfNeeded();
    const carName = await p.evaluate(() => String(S.cars[0].short || S.cars[0].name || S.cars[0].id));
    check('libellés : nom de la voiture sur chaque pneu, chaque champ et le bouton (accessibilité, mauvaise fiche évitée)', (await p.locator('#trw-0 legend').allInnerTexts()).every(t => t.startsWith(carName + ' · ')) &&
      (await p.locator('#trw-0 input[type=number]').evaluateAll((els, n) => els.every(e => (e.getAttribute('aria-label') || '').startsWith(n + ' · ')), carName)) && (await p.locator('[data-act="tread-wheels"][data-i="0"]').innerText()).includes(carName));
    check('formulaire : 4 pneus × 2 points, date du jour et version de l’appareil', await p.locator('#trw-0 input[type=number]').count() === 8 &&
      /^\d{4}-\d{2}-\d{2}$/.test(await p.locator('#trw-0-d').inputValue()) && /Version de cet appareil/.test(await p.locator('#trw-0').innerText()));
    // Statut précédent : profondeur ESTIMÉE (treadEst = 1). Un relevé par pneu à la jauge doit le remplacer par « mesurée ».
    await p.evaluate(() => { S.cars[0].tire.treadEst = 1; saveSettings(); renderSettings(true); }); await openSettings(); await p.locator('#trw-0').scrollIntoViewIfNeeded();
    const fill = async v => { for (const [k, side, mid] of v) { await p.locator(`#trw-0-${k}-side`).fill(side); await p.locator(`#trw-0-${k}-mid`).fill(mid); } };
    const save = async () => { await p.locator('[data-act="tread-wheels"][data-i="0"]').click(); await p.waitForTimeout(600); };
    // Saisie invalide : refusée, rien d'écrit, aucune confirmation demandée avant la validation des valeurs ? (la confirmation précède : refusée ensuite)
    await fill([['fl', '6.0', '6.2'], ['fr', '5.1', '6.4'], ['rl', '7', '7.1'], ['rr', '13', '6.9']]);
    const before = await p.evaluate(() => JSON.stringify([S.cars[0].tire, S.treadWheels || null]));
    await save();
    check('valeur hors 0–12 mm refusée avec un message, aucune écriture', /AR droit · côté : saisis une profondeur de 0 à 12 mm/.test(await p.locator('[data-act="tread-wheels"][data-i="0"]').innerText()) &&
      await p.evaluate(() => JSON.stringify([S.cars[0].tire, S.treadWheels || null])) === before);
    check('saisie invalide : aucune question de transition posée', dialogs.length === 0, JSON.stringify(dialogs));
    // Saisie valide.
    await p.locator('#trw-0-rr-side').fill('6.8'); await save();
    const st = await p.evaluate(() => { const c = S.cars[0], r = treadWheelsRecord(S, c); return { av: c.tire.treadAv, ar: c.tire.treadAr, t: c.tire.tread, r, key: Object.keys(S.treadWheels || {}), inTire: 'treadWheels' in c.tire, hist: (c.tire.treads || []).map(x => x.ax + ':' + x.mm) }; });
    check('enregistré : minimum par essieu (AV 5,1 / AR 6,8), relevé séparé hors de la fiche pneu', st.av === 5.1 && st.ar === 6.8 && st.t === 5.1 && st.r && st.r.fr.side === 5.1 && st.r.fl.side === 6 &&
      st.key.length === 1 && st.key[0] === 'car-' + ready.id && !st.inTire, JSON.stringify(st));
    const origin = await p.evaluate(() => ({ est: S.cars[0].tire.treadEst, rec: treadWheelsRecord(S, S.cars[0]) && treadWheelsRecord(S, S.cars[0]).est, hist: (S.cars[0].tire.treads || []).filter(x => x.d === treadToday()).map(x => !!x.est), guard: tyreStateOf(S.cars[0]).tread.est }));
    check('mesure par pneu : remplace le statut « estimée » précédent (treadEst 0, historique du jour non estimé)', origin.est === 0 && origin.guard === false && origin.hist.length > 0 && origin.hist.every(e => e === false), JSON.stringify(origin));
    check('historique daté : une ligne par essieu (minimum)', st.hist.includes('av:5.1') && st.hist.includes('ar:6.8'), JSON.stringify(st.hist));
    check('première saisie valide : confirmation de mise à jour du PC et de l’iPhone demandée, une seule fois', dialogs.length === 1 && /mis à jour/.test(dialogs[0]) && /Diagnostic/.test(dialogs[0]), JSON.stringify(dialogs));
    await p.locator('#trw-0').scrollIntoViewIfNeeded();
    const form = await p.locator('#trw-0').innerText();
    check('usure irrégulière affichée : AV droit, géométrie conseillée, seuil indicatif non réglementaire', /Usure irrégulière AV droit : écart côté \/ milieu de 1,3 mm/.test(form) && /Contrôle de géométrie conseillé/.test(form) && /non réglementaire/.test(form), form.slice(0, 600));
    await p.waitForFunction(() => typeof CX === 'object' && CX && CX.alerts && CX.alerts.treadgap, null, { timeout: 15000 }).catch(() => null);
    const al = await p.evaluate(() => CX && CX.alerts && CX.alerts.treadgap ? { sev: CX.alerts.treadgap.sev, t: CX.alerts.treadgap.title, d: CX.alerts.treadgap.detail } : null);
    check('alerte « usure irrégulière » : VIGILANCE, géométrie conseillée, seuil indicatif', !!al && al.sev === 1 && /AV droit/.test(al.t) && /Contrôle de géométrie conseillé/.test(al.d) && /Seuil indicatif de 1 mm, non réglementaire/.test(al.d), JSON.stringify(al));
    const verdict = await p.evaluate(() => tyreStateOf(S.cars[0]).tread);
    check('verdict : profondeur effective = valeur la plus basse (5,1 mm)', verdict.mm === 5.1 && verdict.av === 5.1 && verdict.ar === 6.8, JSON.stringify(verdict));
    // Saisie par essieu plus récente (comme depuis un appareil pas encore à jour) : signalée, détail AR non appliqué.
    await p.locator('#f-cars-0-tire-treadAr').scrollIntoViewIfNeeded(); await p.locator('#f-cars-0-tire-treadAr').fill('4'); await p.locator('#f-cars-0-tire-treadAr').dispatchEvent('change'); await p.waitForTimeout(600);
    await p.locator('#trw-0').scrollIntoViewIfNeeded();
    const stale = await p.locator('#trw-0').innerText(), kept = await p.evaluate(() => ({ ar: S.cars[0].tire.treadAr, r: treadWheelsRecord(S, S.cars[0]) }));
    check('saisie par essieu plus récente : signalée, relevé par pneu conservé, verdict sur 4 mm', /profondeur de l’essieu arrière a été modifiée après ce relevé/.test(stale) && kept.ar === 4 && kept.r && kept.r.rr.side === 6.8 &&
      await p.evaluate(() => tyreStateOf(S.cars[0]).tread.mm) === 4, stale.slice(0, 400));
    // Rechargement : relevé, valeurs et signalement conservés.
    await p.evaluate(() => window.TWRC_VAULT.flush && window.TWRC_VAULT.flush()); await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(800); await unlock();
    await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 30000 });
    const after = await p.evaluate(() => ({ av: S.cars[0].tire.treadAv, ar: S.cars[0].tire.treadAr, r: treadWheelsRecord(S, S.cars[0]) }));
    check('conservé après rechargement', after.av === 5.1 && after.ar === 4 && after.r && after.r.fr.mid === 6.4 && after.r.av === 5.1, JSON.stringify(after));
    // 320 px : aucun débordement horizontal du formulaire ni de la page.
    await p.setViewportSize({ width: 320, height: 640 }); await p.waitForTimeout(300); await openSettings(); await p.locator('#trw-0').scrollIntoViewIfNeeded();
    const ov = await p.evaluate(() => { const f = document.getElementById('trw-0'), r = f.getBoundingClientRect(); return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: Math.round(r.right), inner: [...f.querySelectorAll('input,fieldset')].every(e => e.getBoundingClientRect().right <= r.right + 1) }; });
    check('320 px : aucun débordement horizontal', ov.page <= 0 && ov.right <= 320 && ov.inner, JSON.stringify(ov));
    check('aucune erreur JavaScript', !errors.length, errors.join(' / '));
    await c.close();
  } finally { await b.close(); }
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' contrôles « profondeur par pneu »');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
