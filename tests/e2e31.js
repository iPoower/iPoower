// Onglet Tenue dans l'app réelle : réseau/horloge/réglages fictifs, Chromium et WebKit.
const fs = require('fs'), vm = require('vm');
const T0 = Date.parse('2026-10-03T09:00:00+02:00'), RD = Date;
class FD extends RD { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }
const ctx = { console, Date: FD, Math, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;this.ma=makeDemoAir;', ctx);
const html = fs.readFileSync('site/index.html', 'utf8'), PW = fs.readFileSync('.passphrase', 'utf8').trim();
const U = 'https://ipoower.github.io/iPoower/race-control/';
const rows = [], errors = []; let failures = 0, forecasts = 0;
const check = (name, ok) => { rows.push((ok ? '✅ ' : '❌ ') + name); if (!ok) failures++; };
(async () => {
  const b = await require('./lib/browser').launch();
  try {
    const c = await b.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.clock.install({ time: T0 });
    await p.route('**/*', r => {
      const u = r.request().url(), J = v => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
      if (u.includes('air-quality-api')) return J(ctx.ma(ctx.mk('doux', { lat: 48.85, lon: 2.35 }, 'Europe/Paris', 0)));
      if (u.includes('open-meteo.com')) {
        const q = new URL(u).searchParams, base = ctx.mk('doux', { lat: +q.get('latitude'), lon: +q.get('longitude') }, 'Europe/Paris', 0);
        if (u.includes('ensemble')) return J(ctx.me(base)); if (q.get('minutely_15')) return J(ctx.mn(base)); forecasts++; return J(base);
      }
      if (u.includes('/obs.json')) return J({ stations: {} });
      if (u.includes('/tiredb.json')) return J(JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')));
      if (u.includes('/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(process.env.SP + '/cal.fake.json', 'utf8') });
      if (u.includes('/sw.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '//' });
      if (u === U) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort();
    });
    const settle = async () => { for (let k = 0; k < 6; k++) { await p.clock.runFor(500); await p.waitForTimeout(70); } };
    const txt = () => p.locator('#secTenue').innerText();
    const visible = id => p.locator('#' + id).isVisible();
    await p.goto(U); await settle(); await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle();
    check('même titre, onglets Pneus / Météo / Tenue / Analyse dans cet ordre', await p.locator('.title').innerText().then(t => /TYRE WEATHER RACE CONTROL/i.test(t)) &&
      await p.locator('#viewSeg button').evaluateAll(a => a.map(x => x.dataset.v).join(',') === 'pneus,meteo,tenue,analyse'));
    check('la tenue est masquée dans le cockpit Pneus', !(await visible('secTenue')) && await visible('secCars'));
    const n = forecasts;
    await p.click('[data-act=view][data-v=tenue]'); await settle();
    check('Tenue sélectionnée et quatre pièces visibles', await visible('secTenue') && await p.locator('.outfit-piece').count() === 4 && await p.locator('[data-v=tenue]').getAttribute('aria-pressed') === 'true');
    check('les modules de conduite sont masqués dans Tenue', !(await visible('secBrf')) && !(await visible('secCars')));
    check('la météo existante est réutilisée sans nouvel appel de prévision', forecasts === n);
    check('le ressenti et les limites de confort sont affichés', /Ressenti/.test(await txt()) && /repères de confort/.test(await txt()));
    await p.click('[data-act=outfit-day][data-v="1"]');
    check('Demain affiche le 04/10 avec une tenue dédiée', /04\/10/.test(await txt()) && /Ta tenue de demain/.test(await txt()));
    await p.click('[data-act=outfit-occasion][data-v=office]');
    check('Bureau propose une cravate', /Cravate/.test(await txt()));
    await p.click('[data-act=outfit-occasion][data-v=walk]');
    check('Promenade adapte les chaussures et le confort de marche', /semelle gomme/.test(await txt()) && /marcher longtemps/.test(await txt()));
    // Ces scénarios historiques vérifient la météo du seul lieu sélectionné.
    // L'agenda déchiffré du harnais couvre plusieurs lieux : on l'isole ici,
    // les enchaînements agenda/travail restant couverts par e2e32.
    await p.evaluate(() => {
      CAL = { events: [] }; S.work.days = [1, 2, 3, 4, 5];
      for (const id of Object.keys(CALM)) delete CALM[id];
      for (const id of Object.keys(LEGM)) delete LEGM[id];
    });
    await p.click('[data-act=outfit-day][data-v="0"]'); await p.evaluate(() => startDemo('pluie'));
    check('pluie et rafales : imperméable et capuche', /imperméable/i.test(await txt()) && /capuche/i.test(await txt()) && !/Parapluie à emporter/i.test(await txt()));
    await p.evaluate(() => startDemo('froid')); await p.click('[data-act=outfit-day][data-v="1"]');
    check('matin glacial : manteau et accessoires chauds', /Grand froid/.test(await txt()) && /gants/.test(await txt()));
    await p.click('[data-act=outfit-day][data-v="0"]');
    await p.evaluate(() => { M[UI.loc].hs.forEach(x => Object.assign(x, { T: 33, Tapp: 31, pp: 0, P: 0, snow: 0, code: 0, gust: 10, uv: 7 })); Object.assign(M[UI.loc].cur, { T: 33, Tapp: 31, pp: 0, P: 0, snow: 0, code: 0, gust: 10 }); renderTenue(); });
    check('chaleur : lin et protection solaire', /Chaleur/.test(await txt()) && /lin/.test(await txt()) && /solaire/.test(await txt()));
    await p.evaluate(() => { M[UI.loc].mode = 'cache'; renderTenue(); });
    check('cache explicitement marqué à confirmer', /Données anciennes/.test(await txt()) && /à confirmer/.test(await txt()));
    await p.evaluate(() => { M[UI.loc].hs.forEach(x => Object.assign(x, { Tapp: null, pp: null, gust: null })); Object.assign(M[UI.loc].cur, { Tapp: null, pp: null, gust: null }); renderTenue(); });
    check('température ressentie absente : repli sur l’air signalé', /Données partielles/.test(await txt()) && await p.locator('.outfit-piece').count() === 4);
    await p.evaluate(() => { M = {}; renderTenue(); });
    check('météo absente : aucun vêtement prétendument calculé', /Météo insuffisante/.test(await txt()) && await p.locator('.outfit-piece').count() === 0);
    await p.evaluate(() => startDemo('doux'));
    await p.click('[data-act=loc][data-id=work]');
    check('le lieu choisi met à jour le panneau Tenue', /Travail test/i.test(await p.locator('#secTenue h2').innerText()));
    for (const width of [320, 414, 1280]) {
      await p.setViewportSize({ width, height: 896 }); await settle();
      check('mise en page sans débordement à ' + width + ' px', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await p.setViewportSize({ width: 414, height: 896 });
    check('commandes tactiles de tenue au moins 44 px', await p.locator('.outfit-controls button').evaluateAll(a => a.every(x => x.getBoundingClientRect().height >= 44)));
    // Capture locale, seulement si demandée par l'atelier (jamais publiée dans la CI).
    if (process.env.RC_OUTFIT_SHOT) await p.locator('body').screenshot({ path: process.env.RC_OUTFIT_SHOT, fullPage: true });
    await p.reload(); await settle();
    check('onglet Tenue et usage Promenade conservés au rechargement', await visible('secTenue') && await p.locator('[data-act=outfit-occasion][data-v=walk]').getAttribute('aria-pressed') === 'true');
    await p.click('[data-act=view][data-v=meteo]');
    check('Météo reste utilisable et masque la tenue', await visible('secCur') && !(await visible('secTenue')));
    await p.click('[data-act=view][data-v=pneus]');
    check('retour au cockpit Pneus avec les voitures visibles', await visible('secCars') && !(await visible('secTenue')));
    check('aucune erreur JavaScript', errors.length === 0);
    console.log(rows.join('\n')); console.log('errors', JSON.stringify(errors)); console.log((rows.length - failures) + '/' + rows.length + ' scénarios OK');
    process.exitCode = failures ? 1 : 0;
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
