// Analyse · « Mon bilan » (16/11/2026), données FICTIVES, PC puis iPhone : trois cartes en tête (à faire bientôt, chiffres
// du mois, pneus dans le temps), laboratoire historique replié dessous, kilomètres des 30 derniers jours calculés à la main,
// objectif et « à vie », replis conservés au rafraîchissement, « Saisir » vers le champ existant sans rien écrire.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), { unlockIfLocked } = require('./lib/unlock');
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
    if (host === 'public.opendatasoft.com') {
      const dom = url.searchParams.get('refine.domain_id') || '00', now = Date.now(), iso = t => new Date(t).toISOString();
      const mid = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Europe/Paris' })); mid.setHours(24, 0, 0, 0);
      const tomorrow = now + (mid - new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Europe/Paris' })));
      const rec = f => ({ fields: { domain_id: dom, product_datetime: iso(now - 3600e3), ...f } });
      return J({ records: [rec({ color_id: 1, color: 'vert', phenomenon: 'vent', echeance: 'J', begin_time: iso(now - 3600e3), end_time: iso(tomorrow) }),
        rec({ color_id: 3, color: 'orange', phenomenon: 'vent', echeance: 'J1', begin_time: iso(tomorrow), end_time: iso(tomorrow + 864e5) })] });
    }
    if (host === 'api.rainviewer.com') return J({ host: 'https://tilecache.rainviewer.com', radar: { past: [] } });
    if (host === 'tilecache.rainviewer.com' || host.endsWith('.arcgisonline.com') || host === 'tile.openstreetmap.org' || host.endsWith('.tile.openstreetmap.org')) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
    if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.js') });
    if (url.origin === O && url.pathname.endsWith('/vendor/leaflet/leaflet.css')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync('node_modules/leaflet/dist/leaflet.css') });
    if (url.origin === O && url.pathname.endsWith('/obs.json')) return J({ stations: {} });
    if (url.origin === O && url.pathname.endsWith('/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
    if (url.origin === O && !/\.(js|json)$/.test(url.pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
    return r.abort();
  });
  const ready = () => p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && document.querySelector('#secCars article.car'), null, { timeout: 40000 });
  await p.goto(U); await p.waitForTimeout(800); await unlockIfLocked(p); await ready();
  // Profil FICTIF : voiture A avec trois relevés et objectif 250 000 km, voiture B « à vie », journal de saison.
  await p.evaluate(() => {
    const today = nowIn('Europe/Paris').slice(0, 10), d = n => addMin(today + 'T00:00', -1440 * n).slice(0, 10), [a, b] = S.cars;
    a.odo = [{ d: d(60), km: 100000 }, { d: d(20), km: 101600 }, { d: d(2), km: 102500 }]; a.odoGoal = { km: 250000 };
    b.odo = [{ d: d(40), km: 8000 }, { d: d(3), km: 9100 }]; b.odoGoal = { life: 1 };
    S.journal = { [d(3)]: { T: 1.5, ice: 1 }, [d(4)]: { T: 2, ice: 0 }, [d(6)]: { T: 9, ice: 0 } };
    UI.bcar = a.id; appSetCar(a.id); saveSettings(); rebuild();
  });
  await p.waitForTimeout(1500);
  await p.locator('#viewSeg [data-act=view][data-v=analyse]').first().click(); await p.waitForTimeout(900);
  await p.waitForSelector('#secLab section.bilan', { timeout: 15000 });
  // 1. Ordre : « Mon bilan » (3 cartes) en tête, laboratoire historique replié dessous
  const lay = await p.evaluate(() => { const el = $('#secLab'), kids = [...el.querySelectorAll('section.bilan > .bilan-card')].map(x => x.dataset.bilan), fold = el.querySelector('details[data-ux="lab-full"]'), bil = el.querySelector('section.bilan');
    return { kids, fold: !!fold, open: fold && fold.open, after: !!(fold && bil && (bil.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING)), sum: fold ? fold.querySelector('summary').textContent : '', inside: fold ? fold.querySelector('.ux-fold-body').children.length : 0 }; });
  check(`${dev} · trois cartes dans l’ordre (à faire, chiffres, pneus) puis « Laboratoire pneus » replié`, lay.kids.join() === 'todo,stats,tyres' && lay.fold && !lay.open && lay.after && /Laboratoire pneus/.test(lay.sum) && lay.inside > 0, JSON.stringify(lay));
  // 2. À faire bientôt : mêmes lignes que la projection pure, triées par urgence, chaque bouton mène à un champ existant
  const td = await p.evaluate(() => { const today = nowIn('Europe/Paris').slice(0, 10), want = Bilan.todo(bilanInputs(today), today);
    const li = [...document.querySelectorAll('[data-bilan="todo"] li[data-bilan-item]')];
    return { want: want.map(x => x.carId + ':' + x.id), got: li.map(x => x.dataset.bilanItem), tones: li.map(x => x.dataset.tone), targets: [...document.querySelectorAll('[data-bilan="todo"] [data-garage-target]')].map(x => x.dataset.garageTarget),
      more: (document.querySelector('[data-bilan="todo"] details.bilan-more > summary') || {}).textContent || '', visible: li.filter(x => !x.closest('details:not([open])')).length }; });
  const rank = { late: 0, soon: 1, todo: 2, info: 3 };
  check(`${dev} · « À faire bientôt » = projection pure, triée (en retard → information)`, td.got.length > 0 && JSON.stringify(td.got) === JSON.stringify(td.want) && td.tones.every((t, i) => !i || rank[td.tones[i - 1]] <= rank[t]), JSON.stringify(td));
  check(`${dev} · boutons vers des champs existants ; au-delà de 5, repliés sous « Voir les N autres »`, td.targets.every(t => ['odo', 'tread', 'pressure', 'maintenance', 'model'].includes(t)) && (td.got.length <= 5 ? !td.more : td.visible === 5 && td.more === 'Voir les ' + (td.got.length - 5) + ' autres'), JSON.stringify({ t: td.targets, more: td.more, vis: td.visible }));
  // 3. Tes chiffres du mois : 30 derniers jours interpolés (100 000 + 1 600 × 30/40 = 101 200 → 102 500 : 1 300 km), objectif 41 %
  const st = await p.evaluate(() => { const c = document.querySelector('[data-bilan="stats"]'), tiles = [...c.querySelectorAll('.bilan-tile')].map(t => [t.querySelector('span').textContent, t.querySelector('b').textContent, t.querySelector('small').textContent]);
    const today = nowIn('Europe/Paris').slice(0, 10), mo = Bilan.mornings(S.journal, today, 30), cells = [...c.querySelectorAll('.bilan-trips > div > div')].map(x => x.textContent);
    return { tiles, bar: (c.querySelector('.odo-bar') || { getAttribute: () => null }).getAttribute('aria-valuenow'), goal: (c.querySelector('.bilan-goal') || {}).textContent || '', cells, mo }; });
  const tile = k => (st.tiles.find(t => t[0] === k) || []);
  check(`${dev} · compteur 102 500 et 1 300 km sur les 30 derniers jours (interpolé)`, /^102\s500$/.test(tile('COMPTEUR')[1]) && /^1\s300 km$/.test(tile('30 DERNIERS JOURS')[1]) && /^du \d\d\/\d\d au \d\d\/\d\d$/.test(tile('30 DERNIERS JOURS')[2]), JSON.stringify(st.tiles));
  check(`${dev} · objectif 250 000 km : barre à 41 %, reste et date au rythme actuel`, st.bar === '41' && /Objectif 250\s000 km/.test(st.goal) && /Reste 147\s500 km/.test(st.goal) && /atteint vers \S+ \d{4}/.test(st.goal), st.bar + ' | ' + st.goal);
  check(`${dev} · matins froids et verglas = journal de saison (au moins les 2 et 1 saisis)`, st.mo.cold >= 2 && st.mo.frost >= 1 && st.cells.some(x => x.startsWith(String(st.mo.cold)) && /sous 5 °C/.test(x)) && st.cells.some(x => x.startsWith(String(st.mo.frost)) && /verglas/.test(x)), JSON.stringify(st.cells) + ' ' + JSON.stringify(st.mo));
  // 4. Tes pneus dans le temps : 14 départs au plus, à partir d'aujourd'hui, niveau selon la monte
  const ty = await p.evaluate(() => { const c = document.querySelector('[data-bilan="tyres"]'), cells = [...c.querySelectorAll('.bilan-cal [data-level]')];
    return { n: cells.length, levels: cells.map(x => x.dataset.level), titles: cells.map(x => x.title), wear: (c.querySelector('.bilan-wear') || {}).textContent || '', confirm: !!c.querySelector('[data-garage-target="model"]') }; });
  check(`${dev} · pneus : usure (ou mesure manquante) et calendrier des départs (≤ 14, niveaux connus)`, (ty.confirm || (/REMPLACEMENT ESTIMÉ/.test(ty.wear) && ty.n > 0 && ty.n <= 14 && ty.levels.every(l => ['ok', 'limit', 'cold', 'unknown'].includes(l)) && ty.titles.every(t => /^\S+ \d\d\/\d\d · /.test(t)))), JSON.stringify(ty).slice(0, 400));
  // 5. Voiture B (objectif « à vie ») : le bilan suit la voiture choisie
  if (await p.locator('#secLab .lab-cars [data-act=labcar]').count() > 1) {
    await p.locator('#secLab .lab-cars [data-act=labcar]').nth(1).click(); await p.waitForTimeout(700);
    const b = await p.evaluate(() => (document.querySelector('[data-bilan="stats"] .bilan-goal') || {}).textContent || '');
    check(`${dev} · voiture B : « Objectif : à vie » et 1 100 km parcourus depuis le premier relevé`, /Objectif : à vie/.test(b) && /1\s100 km parcourus depuis le \d\d\/\d\d/.test(b), b);
    await p.locator('#secLab .lab-cars [data-act=labcar]').nth(0).click(); await p.waitForTimeout(700);
  }
  // 6. Les replis restent ouverts après un rafraîchissement de l'onglet
  await p.locator('#secLab details[data-ux="lab-full"] > summary').click(); await p.waitForTimeout(200);
  if (await p.locator('#secLab details.bilan-more').count()) { await p.locator('#secLab details.bilan-more > summary').click(); await p.waitForTimeout(200); }
  const keep = await p.evaluate(() => { renderLab.last = null; renderLab(); const f = document.querySelector('details[data-ux="lab-full"]'), m = document.querySelector('details.bilan-more');
    return { lab: f.open, more: m ? m.open : null, labVisible: f.querySelector('.ux-fold-body').getBoundingClientRect().height > 0 }; });
  check(`${dev} · « Laboratoire pneus » et « Voir les autres » restent ouverts après rafraîchissement`, keep.lab && keep.labVisible && keep.more !== false, JSON.stringify(keep));
  // 6 bis. Alerte critique (profondeur 1,4 mm à l'avant, sous le minimum légal de 1,6 mm) : l'en-tête « Analyse pneus » est épinglé au-dessus du bilan, jamais replié
  const crit = await p.evaluate(() => { const today = nowIn('Europe/Paris').slice(0, 10), a = S.cars[0];
    Object.assign(a.tire, { tread: 1.4, treadAv: 1.4, treadAr: 5, treadEst: 0, treads: [{ d: today, mm: 1.4, km: null, ax: 'av' }, { d: today, mm: 5, km: null, ax: 'ar' }] });
    saveSettings(); rebuild(); renderAll(); renderLab.last = null; renderLab();
    const el = $('#secLab'), hero = el.querySelector(':scope > .lab-hero'), bil = el.querySelector('section.bilan');
    return { pinned: !!hero, before: !!(hero && bil && (hero.compareDocumentPosition(bil) & Node.DOCUMENT_POSITION_FOLLOWING)), alert: hero ? (hero.querySelector('[role=alert]') || {}).textContent || '' : '', h: hero ? hero.getBoundingClientRect().height : 0,
      folded: !!el.querySelector('details[data-ux="lab-full"] .lab-hero') }; });
  check(`${dev} · profondeur critique : « Analyse pneus » et ⛔ épinglés au-dessus du bilan (pas dans le repli)`, crit.pinned && crit.before && /⛔/.test(crit.alert) && crit.h > 0 && !crit.folded, JSON.stringify(crit));
  // 7. « Saisir » ouvre les Paramètres sur le champ existant, sans rien écrire
  const before = await p.evaluate(() => JSON.stringify(S.cars));
  const first = p.locator('#secLab [data-bilan="todo"] [data-act="garage-quick"]').first();
  if (await first.count()) {
    const tg = await first.getAttribute('data-garage-target'); await first.click(); await p.waitForTimeout(500);
    const f = await p.evaluate(() => ({ open: $('#settings').open, id: document.activeElement && document.activeElement.id, same: null }));
    const want = { odo: /^odo-\d+$/, tread: /^trd-\d+$/, pressure: /-tire-pchk-av$/, maintenance: /-maint-rev-d$/, model: /-tire-model$/ }[tg];
    check(`${dev} · « Saisir » (${tg}) ouvre les Paramètres sur le bon champ`, f.open && !!want && want.test(f.id || ''), JSON.stringify(f));
    check(`${dev} · aucune valeur écrite par le bilan`, before === await p.evaluate(() => JSON.stringify(S.cars)));
    await p.evaluate(() => { $('#settings').open = false; });
  }
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${dev} · aucun débordement horizontal`, over <= 1, String(over));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'PC', { viewport: { width: 1440, height: 900 } });
    await run(b, 'iPhone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
