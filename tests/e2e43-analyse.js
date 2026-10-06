// Onglet 🔬 Analyse : pneus réellement montés, état thermique estimé (avec mémoire), fenêtre, freinage, adhérence,
// aquaplaning, comparaison, trajet, pression, fiche constructeur sourcée, confiance. iPhone 11 Pro Max et PC ;
// monte inconnue, modèle non renseigné, mémoire thermique (arrêt court / nuit), roulage suivi, hors connexion,
// données anciennes, météo absente ; aucune fausse précision ; aucun nouveau fournisseur ; autres onglets intacts.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KNOWN = /open-meteo\.com|opendatasoft\.com|ipoower\.github\.io|rainviewer|arcgisonline|tile\.openstreetmap|unpkg\.com|cdn\.jsdelivr|router\.project-osrm|fonts\.g/;
let fail = 0; const rows = [], errors = [], hosts = new Set();
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
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
const lab = p => p.evaluate(() => {
  document.querySelectorAll('#secLab details[data-k=spec], #secLab details[data-k=conf]').forEach(d => { d.open = true; });
  const el = document.getElementById('secLab'), vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  const q = s => el ? [...el.querySelectorAll(s)] : [], t = s => q(s).map(x => x.innerText.replace(/\s+/g, ' ').trim());
  const first = [...document.querySelectorAll('main.wrap > section, main.wrap > .grid2, main.wrap > details')].filter(vis)[0];
  return { shown: vis(el), first: first ? first.id : null, hero: t('.lab-hero')[0] || '', all: el ? el.innerText.replace(/\s+/g, ' ') : '',
    bars: q('.lab-bar').length, cmp: q('.lab-t tbody tr').length, trip: t('.lab-trip')[0] || '', tripRows: q('.lab-tl li:not(.ev)').length, links: q('.lab-sp a').map(a => a.href),
    marker: !!el && !!el.querySelector('.lab-mk'), others: ['secCars', 'secWx', 'secTenue', 'secCur'].filter(id => vis(document.getElementById(id))), tabs: [...document.querySelectorAll('#viewSeg button')].map(b => b.dataset.v).join(',') };
});
const layout = (p, mobile) => p.evaluate(mobile => {
  const W = document.documentElement.clientWidth, el = document.getElementById('secLab'), small = [], wide = [];
  document.querySelectorAll('#secLab button, #secLab summary, #viewSeg button').forEach(e => { const b = e.getBoundingClientRect(); if (b.height > 0 && mobile && b.height < 43.5) small.push((e.dataset.act || e.tagName) + ' ' + Math.round(b.height)); });
  el.querySelectorAll('*').forEach(e => { const b = e.getBoundingClientRect(); if (b.width > 0 && b.right > W + 1) wide.push(e.className || e.tagName); });
  return { sw: document.documentElement.scrollWidth, W, small, wide: [...new Set(wide)].slice(0, 6), heroBottom: Math.round(el.querySelector('.lab-hero').getBoundingClientRect().bottom) };
}, mobile);
const toLab = async s => { await s.p.click('[data-act=view][data-v=analyse]'); await s.settle(3); await s.p.evaluate(() => window.scrollTo(0, 0)); };
// libellé « tendance · niveau » : la tendance (en chauffe, stabilisé, en refroidissement, au repos) est distincte du niveau (froid … très chaud)
const STATES = /((EN CHAUFFE|STABILISÉ|EN REFROIDISSEMENT|AU REPOS) · (AMBIANT|FROID|SOUS LA PLAGE FAVORABLE|FAVORABLE|CHAUD|TRÈS CHAUD))|SUPPOSÉ AMBIANT/;

(async () => {
  const b = await BR.launch();
  try {
    // 1. iPhone 11 Pro Max, nuit froide : voiture A (pneu été, modèle non renseigné), voiture B (aucune monte)
    let s = await session(b, { at: '2026-10-03T05:40:00+02:00', scn: 'froid' });
    await toLab(s); let a = await lab(s.p);
    if (process.env.LAB_DUMP) console.log(JSON.stringify(a, null, 1));
    check('1 · quatre onglets, Analyse en dernier', a.tabs === 'pneus,meteo,tenue,analyse', a.tabs);
    check('1 · Analyse : seule section visible avec les réglages, en tête', a.shown && a.first === 'secLab' && !a.others.length, JSON.stringify({ first: a.first, others: a.others }));
    check('1 · verdict : pneu réellement monté (modèle non renseigné → analyse générique été), dimension, état, plage estimée', /Modèle non renseigné · pneu été/.test(a.hero) && /215\/40 ZR18 89Y XL/.test(a.hero) && STATES.test(a.hero) && /Gomme estimée ≈ −?\d+ à −?\d+ °C/.test(a.hero), a.hero);
    check('1 · verdict : freinage, virage, pluie, facteur limitant, confiance', /Freinage : \S+/.test(a.hero) && /Virage : \S+/.test(a.hero) && /(Si pluie|Pluie) : \S+/.test(a.hero) && /Facteur limitant : /.test(a.hero) && /Confiance : (faible|moyenne|élevée)/.test(a.hero), a.hero);
    check('1 · fenêtre de fonctionnement avec repère et explication « Pourquoi ? »', a.marker && /Pourquoi « /.test(a.all) && /FROID EN CHAUFFE FAVORABLE CHAUD/.test(a.all), a.all.slice(0, 300));
    check('1 · freinage, adhérence en 5 barres, aquaplaning, comparaison en 5 lignes', /🛑 FREINAGE/i.test(a.all) && a.bars === 5 && /AQUAPLANING/i.test(a.all) && a.cmp === 5, JSON.stringify({ bars: a.bars, cmp: a.cmp }));
    check('1 · trajet de l’agenda suivi point par point', /Analyse du trajet ·/i.test(a.trip) && a.tripRows >= 2, a.trip.slice(0, 200));
    check('1 · pression : cible saisie et estimation, jamais « réelle »', /Cible saisie : 2,3 bar/.test(a.all) && /estimation/.test(a.all) && !/pression réelle/i.test(a.all));
    check('1 · fiche : DONNÉE CONSTRUCTEUR séparée, rubriques « non disponible » sans modèle', /DONNÉE CONSTRUCTEUR/.test(a.all) && /DÉCODAGE DE LA MONTE SAISIE/.test(a.all) && /Étiquette UE : non disponible/.test(a.all) && !a.links.length);
    check('1 · aucune fausse précision : pas de « exactement », mention estimation et absence de capteur', !/exactement/i.test(a.all) && /aucune mesure de capteur/.test(a.all) && /aucun capteur direct/.test(a.all));
    const L = await layout(s.p, true);
    check('1 · iPhone : aucun débordement, cibles ≥ 44 pt (onglets compris), verdict visible sans défiler', L.sw <= L.W && !L.wide.length && !L.small.length && L.heroBottom < 896, JSON.stringify(L));
    if (process.env.LAB_SHOT) await s.p.locator('#secLab').screenshot({ path: process.env.LAB_SHOT + '-iphone.png' });   // capture locale facultative, après les mesures
    await s.p.locator('#secLab details[data-k=why] summary').click(); await s.p.locator('#secLab details[data-k=b-brake] summary').click(); await s.settle(1);
    await s.p.evaluate(() => renderAll()); await s.settle(2);
    check('1 · explications ouvertes au toucher et conservées après actualisation', await s.p.evaluate(() => document.querySelector('#secLab details[data-k=why]').open && document.querySelector('#secLab details[data-k=b-brake]').open));
    // voiture B : aucune monte active
    await s.p.click('[data-act=labcar][data-car=carB]'); await s.settle(1); a = await lab(s.p);
    check('1 · voiture sans monte active : « Monte active inconnue — sélectionner les pneus montés. », aucune analyse', /Monte active inconnue — sélectionner les pneus montés\./i.test(a.hero) && a.bars === 0, a.hero);
    await s.p.click('[data-act=labcar][data-car=carA]'); await s.settle(1);
    // modèle connu : fiche constructeur reliée à ses sources
    await s.p.evaluate(() => { S.cars[0].tire.brand = 'Michelin'; S.cars[0].tire.model = 'Pilot Sport 4S'; saveSettings(); renderAll(); }); await s.settle(1); a = await lab(s.p);
    check('1 · modèle connu : DONNÉE CONSTRUCTEUR avec liens vers les pages Michelin, rubriques manquantes signalées', /Michelin Pilot Sport 4S/.test(a.hero) && a.links.length >= 3 && a.links.every(h => /^https:\/\/www\.michelin/.test(h)) && /Étiquette UE : non disponible/.test(a.all), JSON.stringify(a.links));
    // 2. mémoire thermique : arrêt de 10 min après un trajet, puis nuit entière
    const setMem = (min, T) => s.p.evaluate(([min, T]) => { const now = DEMO.on ? M[UI.loc].nowStr : nowIn('Europe/Paris'), at = new Date(Date.parse(now.slice(0, 16) + ':00Z') - min * 60e3).toISOString().slice(0, 16);
      localStorage.setItem('twrc.tyretherm.v1', JSON.stringify({ carA: { at, T, sig: tyreStateOf(S.cars[0]).sig } })); TT = null; renderAll(); }, [min, T]);
    await setMem(10, 40); await s.settle(1); a = await lab(s.p);
    check('2 · arrêt de 10 min après un trajet : « À l’arrêt », température conservée', /À L’ARRÊT/i.test(a.hero) && /Température conservée/.test(a.all), a.hero + ' | ' + a.all.slice(0, 400));
    await setMem(14 * 60, 40); await s.settle(1); a = await lab(s.p);
    check('2 · nuit entière : retour proche de l’état froid', /Retour proche de l’état froid/.test(a.all) && /AU REPOS · AMBIANT · FROID/.test(a.hero) && !/EN CHAUFFE/.test(a.hero), a.hero);
    // 3. roulage suivi au GPS : état « en roulage », mémoire écrite sans aucune position
    const mem = await s.p.evaluate(() => { const l = allLocs()[0]; LIVE.phase = 'active'; LIVE.key = 'test'; LIVE.startFix = { ts: Date.now() - 14 * 60e3, lat: l.lat, lon: l.lon, acc: 20 }; FIX = { ts: Date.now(), lat: l.lat + 0.12, lon: l.lon, acc: 20 };
      labThermTick.at = 0; renderAll(); const r = localStorage.getItem('twrc.tyretherm.v1'); LIVE.phase = 'idle'; LIVE.key = null; LIVE.startFix = null; FIX = null; return r; });
    a = await lab(s.p);
    const memOk = (() => { try { const o = JSON.parse(mem).carA; return Object.keys(o).sort().join(',') === 'T,at,sig' && !/lat|lon|\d{2}\.\d{3}/.test(mem); } catch (e) { return false; } })();
    check('3 · roulage suivi : mémoire thermique écrite (heure + température seulement, aucune position)', memOk, mem);
    // 4. données anciennes puis hors connexion : l'analyse reste disponible, confiance réduite
    await s.p.evaluate(() => { RAW[UI.loc].t = Date.now() - 4 * 3600e3; M[UI.loc].mode = 'cache'; renderAll(); }); await s.settle(1); a = await lab(s.p);
    check('4 · données anciennes : confiance réduite et motif affiché', /Météo ancienne \(4 h\)/.test(a.all), a.all.slice(-500));
    await s.c.setOffline(true); await s.p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2); a = await lab(s.p);
    check('4 · hors connexion : analyse affichée depuis le cache', a.shown && STATES.test(a.hero), a.hero);
    await s.c.setOffline(false);
    // 5. les autres onglets restent intacts
    await s.p.click('[data-act=view][data-v=pneus]'); await s.settle(2);
    check('5 · Pneus intact (voitures visibles), Analyse masquée', await s.p.evaluate(() => !!document.querySelector('#secCars .car') && document.getElementById('secLab').hidden));
    await s.p.click('[data-act=view][data-v=meteo]'); await s.settle(2);
    check('5 · Météo intacte (poste météo visible), Analyse masquée', await s.p.evaluate(() => !document.getElementById('secWx').hidden && document.getElementById('secLab').hidden));
    await s.p.click('[data-act=view][data-v=tenue]'); await s.settle(2);
    check('5 · Tenue intacte, Analyse masquée', await s.p.evaluate(() => !document.getElementById('secTenue').hidden && getComputedStyle(document.getElementById('secLab')).display === 'none' || document.getElementById('secLab').hidden));
    await s.c.close();

    // 6. PC 1280 : même contenu, sans débordement
    s = await session(b, { at: '2026-10-03T14:00:00+02:00', scn: 'pluie', dev: 'pc' }); await toLab(s); a = await lab(s.p); const Lp = await layout(s.p, false);
    if (process.env.LAB_SHOT) await s.p.locator('#secLab').screenshot({ path: process.env.LAB_SHOT + '-pc.png' });
    check('6 · PC : mêmes blocs que l’iPhone, sans débordement', a.shown && a.bars === 5 && a.cmp === 5 && Lp.sw <= Lp.W && !Lp.wide.length, JSON.stringify(Lp));
    check('6 · pluie : aquaplaning et freinage pluie évalués', /AQUAPLANING/i.test(a.all) && /Pluie : \S+/.test(a.hero), a.hero);
    await s.c.close();

    // 7. météo absente au premier lancement : pneu identifié, aucune estimation inventée
    s = await session(b, { at: '2026-10-03T05:40:00+02:00', meteo: '503' }); await toLab(s); a = await lab(s.p);
    check('7 · météo absente : pneu affiché, « aucune estimation thermique », aucune barre', a.shown && /Météo indisponible : aucune estimation thermique/.test(a.hero) && a.bars === 0, a.hero);
    await s.c.close();

    // 8. Régression prod-38 : le libellé marginal long repoussait le bas du verdict à 922 px
    // sur iPhone, après confirmation du domicile. Seules les entrées météo / mémoire sont préparées.
    s = await session(b, { at: '2026-10-06T06:15:00+02:00' }); await toLab(s);
    await s.p.locator('#placeBar [data-act=place-confirm][data-place=home]').tap();
    await s.p.waitForFunction(() => APP_CONTEXT.snapshot.confirmation?.placeId === 'home');
    const cooling = await s.p.evaluate(() => {
      const car = labCar(), m = CX.m, now = Date.now();
      Object.assign(car.tire, { type: 'summer', brand: '', model: '', size: '215/40 ZR18 89Y XL', press: '2,4', tread: 6, pchk: { date: '2026-09-20', T: 15 } });
      m.hs = m.hs.map(h => ({ ...h, T: 12, Tr: 13, RH: 70, P: 0, Pl: 0, snow: 0, code: 1, gust: 15, rad: 0, ice: { ...h.ice, level: 0, score: 0 } }));
      RAW[UI.loc].t = now; localStorage.removeItem(TT_KEY);
      TT = { [car.id]: { at: localTs(now - 30 * 60000), T: 45, sig: tyreStateOf(car).sig } };
      LIVE.phase = 'idle'; LIVE.key = LIVE.startFix = LIVE.base = LIVE.route0 = LIVE.route = LIVE.lastFix = FIX = TRIPSTART = null; labThermTick.at = now;
      const r = tyreLab(labInput(car)); renderLab();
      return { state: r.hero.state, trend: r.thermal.trend, range: r.thermal.range, warm: r.hero.warm, why: r.thermal.why };
    });
    a = await lab(s.p); const Lc = await layout(s.p, true);
    check('8 · arrêt récent : en refroidissement sous la plage favorable, estimation prudente inchangée', cooling.state === 'En refroidissement · sous la plage favorable' && cooling.trend === 'cooling' && cooling.range.join(',') === '22,38' && cooling.warm === null && cooling.why.some(x => /bas de plage/.test(x) && /prudence/.test(x)), JSON.stringify(cooling));
    check('8 · iPhone domicile confirmé : verdict complet visible sans défiler, aucune cible masquée ni débordement', a.hero.includes('EN REFROIDISSEMENT · SOUS LA PLAGE FAVORABLE') && Lc.sw <= Lc.W && !Lc.wide.length && !Lc.small.length && Lc.heroBottom < 896, JSON.stringify(Lc));
    if (process.env.LAB_SHOT) await s.p.screenshot({ path: process.env.LAB_SHOT + '-iphone-cooling.png' });
    await s.c.close();

    const extra = [...hosts].filter(h => !KNOWN.test(h));
    check('9 · aucun fournisseur externe supplémentaire', !extra.length, extra.join(', '));
    check('9 · aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n')); console.log('erreurs JS : ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'aucune'));
  console.log(`${rows.length - fail}/${rows.length} scénarios OK`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
