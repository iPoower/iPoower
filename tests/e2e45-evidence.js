// Moteur de preuves météo v2 dans l'app : carte « Preuves » (moteur v2 actif par défaut, mode observation en option), contradiction modèles / observation,
// signalement terrain (brouillard, verglas…), journal fantôme v1 / v2, mode actif, hors connexion, iPhone.
// Station fictive « Station test » à ~2 km du lieu principal fictif (48,85 ; 2,35) : METAR de brume saturée, vent faible.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KNOWN = /open-meteo\.com|opendatasoft\.com|ipoower\.github\.io|rainviewer|arcgisonline|tile\.openstreetmap|unpkg\.com|cdn\.jsdelivr|router\.project-osrm|fonts\.g|bigdatacloud\.net/;
let fail = 0; const rows = [], errors = [], hosts = new Set();
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } } };
const T = '2026-10-03T06:20:00+02:00', Tz = Date.parse(T);
const metar = (min, vis, wx, sp) => ({ t: new Date(Tz - min * 60e3).toISOString(), T: 9, Td: 9 - sp, vis, wind: 7, wx, raw: `METAR TEST 030400Z AUTO 03004KT ${String(vis).padStart(4, '0')} ${wx} NSC 09/0${9 - sp} Q1026` });
const OBS_FOG = { stations: { TEST: { id: 'TEST', name: 'Station test', lat: 48.86, lon: 2.36, last: metar(10, 2400, 'BR', 0), hist: [metar(10, 2400, 'BR', 0), metar(40, 3200, 'BR', 0)] } } };

async function session(b, { at, scn = 'doux', dev = 'iphone', meteo = 'ok', unlock = true, obs = null }) {
  const T0 = new Date(at).getTime();
  const ctx = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
  const c = await b.newContext({ ...VP[dev], timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  const p = await c.newPage(); await p.clock.install({ time: T0 });
  const S = { meteo, calls: 0, obs };
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
    if (u.includes('/race-control/obs.json')) return J(S.obs ? { ...S.obs, updated: new Date(T0 - 5 * 60e3).toISOString() } : { stations: {} });
    if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  await p.goto(U); await p.clock.runFor(2500);
  if (unlock) { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); }
  const settle = async (n = 14) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(80); } };
  await settle();
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); window.scrollTo(0, 0); }); await settle(6);
  return { p, c, S, settle, T0 };
}
const ev = p => p.evaluate(() => { const d = document.querySelector('#secWx details[data-k=ev]'); if (d) d.open = true; const el = document.querySelector('#secWx .ev');
  return { shown: !!el, txt: el ? el.innerText.replace(/\s+/g, ' ') : '', first: (document.querySelector('#secWx').firstElementChild || {}).className || '',
    hero: (document.querySelector('#secWx .wx-hero') || { innerText: '' }).innerText.replace(/\s+/g, ' '), reports: localStorage.getItem('twrc.reports.v1') || '', shadow: localStorage.getItem('twrc.shadow.v1') || '' }; });
const toMeteo = async s => { await s.p.click('[data-act=view][data-v=meteo]'); await s.settle(3); };

(async () => {
  const b = await BR.launch();
  try {
    // 1. modèle « doux » (visibilité bonne) + station proche en brume saturée → v2 : brouillard local probable, contradiction
    let s = await session(b, { at: T, scn: 'doux', obs: OBS_FOG }); await toMeteo(s); let x = await ev(s.p);
    check('1 · carte « Preuves météo · moteur v2 » active par défaut', x.shown && /moteur v2/i.test(x.txt) && !/mode observation/i.test(x.txt), x.txt.slice(0, 200));
    check('1 · actif par défaut : la carte v2 critique passe avant le verdict v1, bandeau brouillard v2 affiché', /\bev\b/.test(x.first) && await s.p.evaluate(() => /BROUILLARD LOCAL PROBABLE/.test((document.querySelector('#banners [data-k=ev]') || { innerText: '' }).innerText)), x.first);
    await s.p.evaluate(() => { S.flags.weatherEvidenceV2 = 'shadow'; saveSettings(); renderAll(); }); await toMeteo(s); x = await ev(s.p);
    check('1 · v2 : BROUILLARD LOCAL PROBABLE avec preuve observée (brume saturée, distance et âge)', /BROUILLARD LOCAL PROBABLE/.test(x.txt) && /Station test \(\d+ km, il y a 10 min\) : visibilité 2,4 km · BR · T − Td 0/.test(x.txt), x.txt.slice(0, 400));
    check('1 · contradiction visible, jamais moyennée', /CONTRADICTION DÉTECTÉE · Les modèles sous-estiment probablement un phénomène local de visibilité/.test(x.txt), x.txt.slice(0, 400));
    check('1 · confiance par phénomène (sept lignes), aucun pourcentage de « confiance »', /Température/.test(x.txt) && /Brouillard/.test(x.txt) && /Visibilité/.test(x.txt) && /Localisation/.test(x.txt) && !/confiance \d+ ?%/i.test(x.txt));
    check('1 · mode observation : le verdict principal n’est pas modifié (v1 affiché en tête)', /wx-hero/.test(x.first) && !/BROUILLARD LOCAL PROBABLE/.test(x.hero), x.first + ' | ' + x.hero.slice(0, 120));
    check('1 · journal fantôme alimenté (niveaux v1 / v2, aucune coordonnée)', /"v2":2/.test(x.shadow) && !/lat|lon/.test(x.shadow), x.shadow.slice(0, 200));
    // 2. signalement terrain : brouillard présent ici
    await s.p.locator('#secWx [data-act=ev-report][data-k=fog]').click(); await s.settle(2); x = await ev(s.p);
    check('2 · « 🌫 Brouillard » signalé : verdict recalculé, observation marquée non officielle', /brouillard signalé il y a 0 min \(observation utilisateur, non officielle\)/.test(x.txt) && /récents : 🌫 Brouillard/.test(x.txt), x.txt.slice(0, 500));
    check('2 · stockage local du signalement : lieu arrondi (~1 km), journal prévision / observation', /"kind":"fog"/.test(x.reports) && /"lat":48\.85,"lon":2\.35/.test(x.reports) && /"obs":1/.test(x.shadow), x.reports);
    await s.p.click('[data-act=view][data-v=analyse]'); await s.settle(2);
    const surf = await s.p.evaluate(() => (document.querySelector('#secLab') || {}).innerText || '');
    check('2 · onglet Analyse : brouillard signalé = humidité accrue (jamais chaussée mouillée automatique)', /Chaussée : humide \(signalée par vous\)/.test(surf.replace(/\s+/g, ' ')) || /humide/.test(surf), surf.slice(0, 200));
    // 3. mode actif : le phénomène critique v2 passe en tête
    await s.p.evaluate(() => { S.flags.weatherEvidenceV2 = 'on'; saveSettings(); renderAll(); }); await toMeteo(s); x = await ev(s.p);
    check('3 · mode actif : la carte v2 critique passe avant le verdict v1', /\bev\b/.test(x.first), x.first);
    // 4. hors connexion : conditions actuelles non vérifiables, confiance réduite
    await s.c.setOffline(true); await s.p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2); x = await ev(s.p);
    check('4 · hors connexion : « conditions actuelles non vérifiables » et dernière observation datée', /Hors connexion : conditions actuelles non vérifiables · dernière observation : Station test/.test(x.txt), x.txt.slice(0, 300));
    await s.c.setOffline(false);
    // 5. mode désactivé : aucune carte
    await s.p.evaluate(() => { S.flags.weatherEvidenceV2 = 'off'; saveSettings(); renderAll(); }); await s.settle(1); x = await ev(s.p);
    check('5 · mode désactivé : aucune carte v2', !x.shown);
    // 6. diagnostic : comparaison v1 / v2
    const dg = await s.p.evaluate(() => { document.getElementById('settings').open = true; renderSettings(true); renderDiag(); return document.getElementById('diagBox').innerText.replace(/\s+/g, ' '); });
    check('6 · diagnostic : mode, entrées, faux négatifs et positifs v1 / v2', /Moteur v2 \(preuves\) mode off · \d+ entrées · vérités terrain \d+ · faux négatifs v1 \d+ \/ v2 \d+/.test(dg), dg.slice(-300));
    // 7. iPhone : carte ouverte sans débordement, boutons ≥ 44 pt
    await s.p.evaluate(() => { S.flags.weatherEvidenceV2 = 'shadow'; saveSettings(); UI.evOpen = true; renderAll(); }); await toMeteo(s);
    const L = await s.p.evaluate(() => { const W = document.documentElement.clientWidth, small = []; document.querySelectorAll('#secWx .ev button, #secWx .ev summary').forEach(e => { const r = e.getBoundingClientRect(); if (r.height > 0 && r.height < 43.5) small.push(Math.round(r.height)); });
      return { sw: document.documentElement.scrollWidth, W, small }; });
    check('7 · iPhone : carte v2 ouverte sans débordement, cibles ≥ 44 pt', L.sw <= L.W && !L.small.length, JSON.stringify(L));
    await s.c.close();
    // 8. aucune observation, modèle clair : pas de brouillard inventé
    s = await session(b, { at: '2026-10-03T14:00:00+02:00', scn: 'doux' }); await toMeteo(s); x = await ev(s.p);
    check('8 · sans observation, temps doux : aucun phénomène critique inventé', x.shown && /aucun phénomène critique prouvé/.test(x.txt) && !/CONTRADICTION/.test(x.txt), x.txt.slice(0, 200));
    await s.c.close();
    const extra = [...hosts].filter(h => !KNOWN.test(h));
    check('9 · aucun fournisseur externe supplémentaire', !extra.length, extra.join(', '));
    check('9 · aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n')); console.log('erreurs JS : ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'aucune'));
  console.log(`${rows.length - fail}/${rows.length} scénarios OK`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
