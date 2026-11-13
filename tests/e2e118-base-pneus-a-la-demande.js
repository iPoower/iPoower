// Matin du 13/11 · performance : la base pneus publiée (tiredb.json, ≈ 405 Ko depuis l'étiquette UE) n'est plus téléchargée
// au démarrage, où elle l'était DEUX fois (page verrouillée puis déverrouillée) pour être presque toujours identique à la version
// intégrée à la page. Elle est vérifiée à l'ouverture des Paramètres (choix des pneus), au plus une fois par heure ; une base
// publiée plus récente est toujours chargée ; une erreur ne bloque pas la vérification suivante. Build et données 100 % fictifs.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const T0 = new Date('2026-10-03T14:00:00+02:00').getTime();
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const TDB = JSON.parse(fs.readFileSync('site/tiredb.json', 'utf8')), U = 'https://ipoower.github.io/iPoower/race-control/';
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅' : '❌') + ' ' + n + (d ? ' · ' + d : '')); if (!ok) fail++; };
(async () => {
  const B = require('./lib/browser'), b = await B.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Paris' });
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  let served = TDB, status = 200; const hits = [];
  p.on('pageerror', e => rows.push('ERR ' + e.message));
  await p.route('**/*', r => {
    const u = r.request().url(), host = new URL(u).hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
      const q = new URL(u).searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(',');
      const one = i => ctx.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0); return J(la.length > 1 ? la.map((_, i) => one(i)) : one(0));
    }
    if (u.startsWith(U) && new URL(u).pathname.endsWith('/tiredb.json')) { hits.push(u); return status === 200 ? J(served) : r.fulfill({ status, body: 'indisponible' }); }
    if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const settle = async (k = 6) => { for (let i = 0; i < k; i++) { await p.clock.runFor(500); await p.waitForTimeout(100); } };
  const meta = () => p.evaluate(() => ({ version: TIRE_DB_META.version, count: TIRE_DB_META.count, source: TIRE_DB_META.source }));
  const settings = async open => { const isOpen = await p.locator('#settings').evaluate(d => d.open); if (isOpen !== open) await p.locator('#settings > summary').click(); await settle(4); };
  await p.goto(U); await p.clock.runFor(2500); await settle(4);
  const locked = hits.length;
  await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle(12);
  const m0 = await meta();
  check('118.1 · démarrage (page verrouillée puis déverrouillée) : aucun téléchargement de la base pneus', locked === 0 && hits.length === 0, `verrouillée ${locked} · après déverrouillage ${hits.length} (avant : 2 × ${Math.round(JSON.stringify(TDB).length / 1024)} Ko)`);
  check('118.2 · base intégrée chargée et complète dès le démarrage', m0.version === TDB.version && m0.count > 100, JSON.stringify(m0));
  await settings(true);
  check('118.3 · ouverture des Paramètres : la base publiée est vérifiée une fois', hits.length === 1, hits.length + ' requête(s)');
  check('118.4 · choix des pneus disponible (base complète)', await p.locator('#f-db-0 option').count() > 100, (await p.locator('#f-db-0 option').count()) + ' options');
  await settings(false); await settings(true); await settings(false); await settings(true);
  check('118.5 · réouvertures dans l’heure : aucune requête de plus', hits.length === 1, hits.length + ' requête(s)');
  // Une base publiée plus récente (nouveau déploiement) : chargée à l'ouverture suivante, une fois l'heure passée.
  served = { ...TDB, version: TDB.version + 1, updated: '2099-01-01' };
  await settings(false); await p.clock.fastForward(61 * 60e3); await settle(4); await settings(true);
  const m1 = await meta(), shown = await p.locator('#settingsBody').innerText();
  check('118.6 · après une heure, nouvelle vérification ; base plus récente chargée et affichée', hits.length === 2 && m1.version === TDB.version + 1 && new RegExp('version ' + (TDB.version + 1)).test(shown), `${hits.length} requêtes · ${JSON.stringify(m1)}`);
  // Erreur du serveur : la base actuelle est gardée et l'échec ne bloque pas la vérification suivante pendant une heure.
  status = 503; await settings(false); await p.clock.fastForward(61 * 60e3); await settle(4); await settings(true);
  const m2 = await meta();
  status = 200; await settings(false); await settings(true);
  check('118.7 · erreur 503 : base conservée, nouvelle tentative possible sans attendre une heure', hits.length === 4 && m2.version === TDB.version + 1, `${hits.length} requêtes · ${JSON.stringify(m2)}`);
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' scénarios OK · erreurs JS : ' + (rows.some(x => x.startsWith('ERR ')) ? 'présentes' : 'aucune'));
  await c.close(); await b.close(); process.exit(fail || rows.some(x => x.startsWith('ERR ')) ? 1 : 0);
})();
