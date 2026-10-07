// Briefing du trajet : ligne « Gomme · estimation » (état et plage °C au départ → à l'arrivée, fenêtre atteinte ou non),
// calculée par le même tyreLab que l'Analyse sur les mêmes points datés du trajet ; bouton Détail → onglet Analyse.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const rows = [], errors = [], hosts = new Set();
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 500))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } } };

async function session(b, { at, scn = 'doux', dev = 'iphone', meteo = 'ok', unlock = true }) {
  const T0 = new Date(at).getTime();
  const ctx = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
  const c = await b.newContext({ ...VP[dev], timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  const S = { meteo, calls: 0 };
  p.on('pageerror', e => errors.push(dev + ' · ' + e.message));
  p.on('request', r => { try { hosts.add(new URL(r.url()).host); } catch (e) { /* url illisible */ } });
  await p.route('**/*', r => {
    const u = r.request().url(), J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (u.includes('open-meteo.com')) {
      S.calls++;
      if (S.meteo === 'abort') return r.abort();
      if (S.meteo === '503') return r.fulfill({ status: 503, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'Service Unavailable' });
      const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(',');
      const one = i => ctx.mk(scn, { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
      if (lats.length > 1) return J(lats.map((_, i) => one(i)));
      const base = one(0); return J(u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : u.includes('air-quality') ? {} : base);
    }
    if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
    if (u.includes('router.project-osrm.org')) return r.abort();
    if (u.includes('api.rainviewer.com')) { const n = Math.floor(T0 / 600000) * 600; return J({ version: '2.0', host: 'https://tilecache.rainviewer.com', radar: { past: [{ time: n, path: '/v2/radar/' + n }] } }); }
    if (/tilecache\.rainviewer|arcgisonline|tile\.openstreetmap/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
    if (u.includes('leaflet@1.9.4/dist/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (u.includes('leaflet@1.9.4/dist/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (u.includes('/race-control/obs.json')) return J({ stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  await p.goto(U); await p.clock.runFor(2500);
  if (unlock) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
  const settle = async (n = 14) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } };
  await settle();
  await p.evaluate(() => window.scrollTo(0, 0));
  return { p, c, S, settle, T0 };
}

// lecture de la carte et de la référence calculée dans la page (même fonction que le débrief)
const probe = p => p.evaluate(() => {
  UI.view = 'pneus'; renderAll();
  const el = document.querySelector('#secBrf [data-k=gum]'), main = BRF_SHOWN.find(t => t.res), car = main && main.res[0].c;
  const r = main ? tripLab(main, car) : null, tr = r && r.trip && r.trip.rows;
  return { txt: el ? el.innerText.replace(/\s+/g, ' ') : null, has: !!main,
    first: tr ? { lvl: TL_LEVEL_TXT[tr[0].s], range: tr[0].range, s: tr[0].s } : null, last: tr ? { lvl: TL_LEVEL_TXT[tr[tr.length - 1].s], range: tr[tr.length - 1].range } : null,
    reached: tr ? tr.some(x => x.s === 2) : null, hot: tr ? tr.some(x => x.s >= 3) : null, n: tr ? tr.length : 0,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
});
const rg = x => `${String(x[0]).replace('-', '−')}–${String(x[1]).replace('-', '−')} °C`;

(async () => {
  const b = await BR.launch();
  try {
    for (const [scn, dev] of [['pluie', 'iphone'], ['doux', 'pc'], ['froid', 'iphone']]) {
      const s = await session(b, { at: '2026-10-07T06:00:00+02:00', scn, dev }), p = s.p, tag = `${dev} · ${scn}`;
      await s.settle(6); const g = await probe(p);
      check(tag + ' · un trajet analysé et sa ligne Gomme dans le briefing', g.has && g.n >= 2 && !!g.txt && /Gomme · estimation/.test(g.txt), JSON.stringify(g));
      if (g.txt && g.first) {
        check(tag + ' · départ et arrivée identiques au calcul tyreLab du trajet (état + plage °C)',
          g.txt.includes(`Départ : ${g.first.lvl} (${rg(g.first.range)})`) && g.txt.includes(`Arrivée : ${g.last.lvl} (${rg(g.last.range)})`), JSON.stringify(g));
        const want = g.hot ? /Gomme chaude/ : g.reached ? /Fenêtre favorable atteinte/ : /N’atteint pas sa fenêtre favorable/;
        check(tag + ' · verdict cohérent avec la fenêtre (atteinte, non atteinte ou chaude)', want.test(g.txt), JSON.stringify(g));
      }
      check(tag + ' · aucun débordement horizontal', !g.overflow);
      if (scn === 'pluie') check(tag + ' · pluie froide d’octobre sur pneus été : la fenêtre n’est pas atteinte', g.reached === false && /N’atteint pas/.test(g.txt || ''), JSON.stringify(g));
      await p.click('#secBrf [data-act=brf-lab]'); await s.settle(2);
      check(tag + ' · Détail ouvre l’onglet Analyse', await p.evaluate(() => UI.view) === 'analyse');
      await s.c.close();
    }
  } finally { await b.close(); }
  check('aucune erreur JavaScript', !errors.length, errors.join(' | '));
  console.log(rows.join('\n')); console.log(`${rows.length - fail}/${rows.length} scénarios OK`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌', e); process.exit(1); });
