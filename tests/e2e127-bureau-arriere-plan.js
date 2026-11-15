// Ordinateur · Race Control ouvert en arrière-plan (16/11/2026), données FICTIVES : titre d'onglet et icône = verdict
// « Ici, maintenant » (heure de départ, jamais de lieu), pastille de l'app installée dès VIGILANCE, raccourcis 1 à 5 et R
// (inactifs verrouillé, pendant une saisie ou avec un modificateur). Scénarios météo « doux » puis « neige ».
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), { unlockIfLocked } = require('./lib/unlock');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://ipoower.github.io', U = O + '/iPoower/race-control/';
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + d)); if (!ok) fail++; };
async function run(b, dev, view, scn) {
  const c = await b.newContext({ ...view, timezoneId: 'Europe/Paris' }), p = await c.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());
  // Badging API simulée (Chromium sans app installée) : on enregistre les appels.
  await c.addInitScript(() => { window.__badge = []; navigator.setAppBadge = () => { window.__badge.push('set'); return Promise.resolve(); }; navigator.clearAppBadge = () => { window.__badge.push('clear'); return Promise.resolve(); }; });
  await p.route('**/*', r => {
    const url = new URL(r.request().url()), host = url.hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
      const q = url.searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(','), one = i => ctx.mk(scn, { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
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
  // Verrouillé : titre neutre, raccourcis inactifs
  check(`${dev} · verrouillé : titre d’origine, aucun état affiché`, await p.title() === 'TYRE WEATHER RACE CONTROL', await p.title());
  await p.keyboard.press('4'); await p.waitForTimeout(200);
  check(`${dev} · verrouillé : les raccourcis ne font rien`, await p.evaluate(() => typeof UI === 'undefined' || UI.view !== 'garage'));
  await unlockIfLocked(p);
  await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && typeof CX === 'object' && CX && document.querySelector('#decisionCore h2'), null, { timeout: 40000 });
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => ({ title: document.title, h2: document.querySelector('#decisionCore h2').textContent, icon: (document.querySelector('link[rel="icon"]') || {}).href || '', badge: window.__badge.slice(-1)[0] || null, lv: DECISION_LAST && DECISION_LAST.decision.displayLevel, places: allLocs().map(l => l.name).filter(Boolean) }));
  const label = st.h2.replace(/^\S+\s/, '');
  check(`${dev} · titre d’onglet = verdict « Ici, maintenant » (${scn})`, st.title.includes(label) && /· Race Control$/.test(st.title) && /^[🟢🟡🟠🔴⚪]/u.test(st.title), JSON.stringify({ title: st.title, h2: st.h2 }));
  check(`${dev} · titre : heure de départ, aucun lieu enregistré`, /départ (\S+ \d{2}\/\d{2} )?\d{2}:\d{2}/.test(st.title) && !st.places.some(n => st.title.includes(n.split(' / ')[0])), st.title);
  check(`${dev} · icône d’onglet : pastille SVG de la couleur du niveau`, /^data:image\/svg\+xml,/.test(st.icon));
  check(`${dev} · pastille de l’app installée : ${scn === 'doux' ? 'effacée (RAS ou analyse limitée)' : 'posée dès VIGILANCE'}`, st.badge === ((st.lv >= 1 && !/ANALYSE LIMITÉE/.test(st.h2)) ? 'set' : 'clear'), JSON.stringify({ badge: st.badge, lv: st.lv, h2: st.h2 }));
  // Raccourcis : 4 → Garage, 1 → Météo, 3 → Trajet, 5 → Analyse, 2 → Pneus
  const views = [];
  for (const k of ['4', '1', '3', '5', '2']) { await p.keyboard.press(k); await p.waitForTimeout(250); views.push(await p.evaluate(() => UI.view)); }
  check(`${dev} · touches 1 à 5 : onglets dans l’ordre affiché`, views.join(',') === 'garage,meteo,trajet,analyse,pneus', views.join(','));
  // Pas pendant une saisie ni avec un modificateur
  await p.evaluate(() => { const i = document.createElement('input'); i.id = 'kbdProbe'; document.body.appendChild(i); i.focus(); });
  await p.keyboard.press('4'); await p.waitForTimeout(200);
  const typing = await p.evaluate(() => ({ view: UI.view, value: document.getElementById('kbdProbe').value }));
  await p.evaluate(() => { document.getElementById('kbdProbe').remove(); document.body.focus(); });
  await p.keyboard.press('Alt+4'); await p.waitForTimeout(200);
  check(`${dev} · saisie et Alt+chiffre : aucun changement d’onglet, le chiffre reste dans le champ`, typing.view === 'pneus' && typing.value === '4' && await p.evaluate(() => UI.view) === 'pneus', JSON.stringify(typing));
  await p.evaluate(() => { window.__refresh = 0; window.refreshAll = () => { window.__refresh++; }; });
  await p.keyboard.press('r'); await p.waitForTimeout(200);
  check(`${dev} · touche R : actualisation demandée`, await p.evaluate(() => window.__refresh) === 1);
  check(`${dev} · onglets annoncés avec leur raccourci (aria-keyshortcuts)`, await p.evaluate(() => ['meteo', 'pneus', 'trajet', 'garage', 'analyse'].every((v, i) => (document.querySelector('#viewSeg [data-v="' + v + '"]') || {}).getAttribute && document.querySelector('#viewSeg [data-v="' + v + '"]').getAttribute('aria-keyshortcuts') === String(i + 1))));
  check(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
  await c.close();
}
(async () => {
  const b = await BR.launch();
  try {
    await run(b, 'PC', { viewport: { width: 1440, height: 900 } }, 'doux');
    await run(b, 'PC', { viewport: { width: 1440, height: 900 } }, 'neige');
  } finally { await b.close(); }
  console.log(rows.join('\n'));
  console.log(fail ? `❌ ${fail} contrôle(s) en échec` : `✅ ${rows.length} contrôles au vert`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
