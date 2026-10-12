// Onglet Météo : poste météo (verdict, prochain trajet, chronologie, ce qui compte, phénomènes, conditions route).
// iPhone 11 Pro Max (414×896 @3x) et PC ; hors ligne, données absentes, fournisseur en panne, données anciennes,
// sans trajet, plusieurs trajets ; aucune duplication de l'analyse Pneus ; aucun nouveau fournisseur externe.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KNOWN = /open-meteo\.com|opendatasoft\.com|ipoower\.github\.io|rainviewer|arcgisonline|tile\.openstreetmap|unpkg\.com|cdn\.jsdelivr|router\.project-osrm|fonts\.g/;
let fail = 0; const rows = [], errors = [], hosts = new Set();
let stage = 'initialisation';
const tapNav = async (page, selector, label) => { stage = label; await page.locator(selector).click({ timeout: 12000 }); };
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } }, wide: { viewport: { width: 1920, height: 1080 } } };

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
  await p.evaluate(() => { UI.view = 'meteo'; renderAll(); window.scrollTo(0, 0); }); await settle(6);
  return { p, c, S, settle, T0 };
}
const wx = p => p.evaluate(() => {
  // La lecture experte déploie les mêmes sections que l'utilisateur.
  document.querySelectorAll('#secWx details[data-ux]').forEach(d => { d.open = true; });
  const el = document.getElementById('secWx'), vis = e => !!e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  const q = s => el ? [...el.querySelectorAll(s)] : [], t = s => q(s).map(x => x.innerText.replace(/\s+/g, ' ').trim());
  const first = [...document.querySelectorAll('main.wrap > section, main.wrap > .grid2, main.wrap > details, #deskMain > section, #deskMain > .grid2')].filter(vis)[0];
  return { shown: vis(el), first: first ? first.id : null, hero: t('.wx-hero')[0] || '', title: t('.wx-ht')[0] || '', heroLv: (q('.wx-hero')[0] || { className: '' }).className,
    current: t('.wx-now')[0] || '',
    hourly: q('.wx-hours-card').map(x => ({ hour: x.dataset.hour, text: x.innerText.replace(/\s+/g, ' ').trim() })),
    hourlyNote: t('.wx-hours-note')[0] || '', hourlyState: t('.wx-hours-state')[0] || '',
    trip: t('.wx-trip')[0] || '', moments: t('.wx-tl li'), ts: q('.wx-tl li[data-ts]').map(x => x.dataset.ts), strip: q('.wx-strip li').length, matters: t('.wx-mat li'), phen: q('.wx-pc:not(.ev)').map(x => x.dataset.k),
    road: t('.wx-road')[0] || '', score: (q('.wx-rs b')[0] || {}).textContent || '', factors: t('.wx-rf li'), tireBtn: q('.wx-tire [data-act=view][data-v=pneus]').length,
    gauges: q('.gauge').length, notice: (document.getElementById('notice').innerText || '').replace(/\s+/g, ' '),
    beforeCur: el && document.getElementById('secCur') ? !!(el.compareDocumentPosition(document.getElementById('secCur')) & Node.DOCUMENT_POSITION_FOLLOWING) : false };
});
const layout = (p, mobile) => p.evaluate(mobile => {
  const W = document.documentElement.clientWidth, el = document.getElementById('secWx'), small = [], wide = [];
  el.querySelectorAll('button, summary, a.btn').forEach(e => { const b = e.getBoundingClientRect(); if (b.height > 0 && mobile && b.height < 43.5) small.push((e.dataset.act || e.tagName) + ' ' + Math.round(b.height)); });
  el.querySelectorAll('*').forEach(e => { if (e.closest('.wx-strip, .wx-hours-track')) return; const b = e.getBoundingClientRect(); if (b.width > 0 && b.right > W + 1) wide.push(e.className || e.tagName); });
  const hero = el.querySelector('.wx-hero').getBoundingClientRect(), decision = document.getElementById('decisionCore').getBoundingClientRect();
  return { sw: document.documentElement.scrollWidth, W, small, wide: [...new Set(wide)].slice(0, 6),
    heroBottom: Math.round(hero.bottom), heroTop: Math.round(hero.top), decisionBottom: Math.round(decision.bottom) };
}, mobile);

(async () => {
  const b = await BR.launch();
  try {
    // 1. iPhone 11 Pro Max, samedi matin : plusieurs trajets de l'agenda (Lille 08:30, Amiens 17:00 et 20:00), nuit froide
    let s = await session(b, { at: '2026-10-03T05:40:00+02:00', scn: 'froid' });
    let w = await wx(s.p);
    if (process.env.WX_DUMP) console.log(JSON.stringify(w, null, 1));
    // capture locale facultative (jamais dans la CI)
    if (process.env.WX_SHOT) { await s.p.locator('#secWx').screenshot({ path: process.env.WX_SHOT + '-iphone.png' }); await s.p.evaluate(() => window.scrollTo(0, 0)); }
    check('1 · Météo : le poste météo est la première section, avant les mesures détaillées', w.shown && w.first === 'secWx' && w.beforeCur, JSON.stringify({ first: w.first, shown: w.shown }));
    // innerText restitue les majuscules de text-transform : le libellé reste le même.
    check('1 · verdict lisible : niveau 🟢🟡🟠🔴, titre, température et ressenti', /lv[0-3]/.test(w.heroLv) && w.title.length > 4 && /Température actuelle/i.test(w.hero) && /Ressenti .* °C/.test(w.hero), w.hero);
    check('1 · température actuelle : carte dédiée et immédiatement lisible', /Température actuelle/i.test(w.current) && /°C/.test(w.current) && /Ressenti/.test(w.current), w.current);
    check('1 · températures futures visibles sans ouvrir de section : 11 h incluse, 12 h de prévisions et valeurs du modèle',
      w.hourly.length >= 12 && w.hourly.some(x => x.hour === '2026-10-03T11:00' && /°/.test(x.text)) &&
      w.hourly.every(x => /^2026-10-03T\\d{2}:00|^2026-10-04T\\d{2}:00/.test(x.hour)), JSON.stringify(w.hourly));
    check('1 · heure par heure : provenance modèle, rafraîchissement 5 min et pas de nouvelle API', /Prévisions du modèle/.test(w.hourlyNote) && /toutes les 5 min/.test(w.hourlyNote), w.hourlyNote);
    check('1 · prochain trajet de l’agenda : origine → destination, horaires, départ et arrivée', /Prochain trajet/i.test(w.trip) && /→/.test(w.trip) && /Départ/.test(w.trip) && /Arrivée/.test(w.trip), w.trip);
    check('1 · plusieurs trajets : la chronologie montre plusieurs départs, triés', w.moments.filter(x => /départ/.test(x)).length >= 2, w.moments.join(' | '));
    check('1 · chronologie dans l’ordre des heures, lendemain signalé', w.ts.length > 2 && w.ts.every((x, i) => !i || w.ts[i - 1] <= x) && w.moments.filter((x, i) => w.ts[i].slice(0, 10) > '2026-10-03').every(x => /^dem\. /.test(x)), w.moments.join(' | '));
    check('1 · rendez-vous sans lieu ou 📺 jamais présentés comme trajets', !/France – Italie|Appel sans lieu|Sport/.test(w.moments.join(' ') + w.trip), w.moments.join(' | '));
    check('1 · « ce qui compte » : 1 à 5 lignes', w.matters.length >= 1 && w.matters.length <= 5, w.matters.join(' | '));
    check('1 · sept cartes phénomènes compactes', w.phen.join(',') === 'rain,fog,wind,ice,temp,sun,road', w.phen.join(','));
    check('1 · conditions route : score sur 100 et facteurs expliqués', /^\d{1,3}$/.test(w.score) && w.factors.length >= 6 && w.factors.every(x => /−\d+|\b0$/.test(x)), w.factors.join(' | '));
    check('1 · Pneus : synthèse courte et lien, aucune jauge ni verdict pneumatique copié', w.tireBtn === 1 && w.gauges === 0 && /Impact pneus/.test(w.road) && !/GO —|NO GO|HIGH RISK|CAUTION/.test(w.hero + w.road), w.road);
    const L = await layout(s.p, true);
    check('1 · iPhone : aucun défilement horizontal de la page, rien ne dépasse', L.sw <= L.W && !L.wide.length, JSON.stringify(L));
    check('1 · iPhone : cibles tactiles ≥ 44 pt dans le poste météo', !L.small.length, L.small.join(', '));
    check('1 · iPhone : synthèse Race Control entièrement visible et verdict météo déjà engagé sans défiler', L.decisionBottom > 0 && L.decisionBottom < 896 && L.heroTop > 0 && L.heroTop < 896, JSON.stringify(L));
    // détail au toucher, conservé après une actualisation
    await s.p.locator('#secWx details[data-k=fog] summary').click(); await s.settle(1);
    await s.p.evaluate(() => renderAll()); await s.settle(2);
    check('1 · carte phénomène : détail au toucher, toujours ouvert après actualisation', await s.p.evaluate(() => document.querySelector('#secWx details[data-k=fog]').open && document.querySelector('#secWx details[data-k=fog] ul').getBoundingClientRect().height > 0));
    // la bande horaire défile seule, la page non
    const strip = await s.p.evaluate(() => { const e = document.querySelector('#secWx .wx-strip'); return { sw: e.scrollWidth, cw: e.clientWidth, n: e.children.length }; });
    check('1 · bande horaire défilante (au moins 12 h) sans élargir la page', strip.n >= 12 && strip.sw > strip.cw, JSON.stringify(strip));
    // lien vers Pneus
    await tapNav(s.p, '#secWx [data-act=view][data-v=pneus]', 'Météo → Pneus depuis le résumé météo'); await s.settle(2);
    check('1 · « Voir analyse Pneus » ouvre l’onglet Pneus ; le poste météo y est masqué', await s.p.evaluate(() => UI.view === 'pneus' && document.getElementById('secWx').hidden && !!document.querySelector('#secCars .car')));
    await tapNav(s.p, '#viewSeg [data-act=view][data-v=garage]', 'Pneus → Garage dans les onglets'); await s.settle(2);
    check('1 · Garage : poste météo masqué', await s.p.evaluate(() => document.getElementById('secWx').hidden));
    await tapNav(s.p, '#viewSeg [data-act=view][data-v=meteo]', 'Garage → Météo dans les onglets'); await s.settle(2);
    check('1 · retour à Météo : poste météo et mesures détaillées présents', (await wx(s.p)).shown && await s.p.locator('#secCur').isVisible());
    // 2. données anciennes (cache de plus de 3 h) puis hors connexion : dernière analyse conservée, signalée
    await s.p.evaluate(() => { RAW[UI.loc].t = Date.now() - 4 * 3600e3; M[UI.loc].mode = 'cache'; renderAll(); }); await s.settle(1);
    w = await wx(s.p);
    check('2 · données anciennes : verdict conservé, marqué indicatif, état STALE affiché', w.shown && /verdict indicatif/.test(w.hero) && /CACHE · STALE · 4,0 h/i.test(w.hero), w.hero);
    await s.c.setOffline(true); await s.p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2);
    w = await wx(s.p);
    check('2 · hors connexion : poste météo affiché depuis le cache, mention HORS LIGNE', w.shown && /HORS LIGNE/i.test(w.hero), w.hero);
    check('2 · hors ligne : températures horaires conservées, jamais présentées comme relevés LIVE',
      w.hourly.length >= 12 && w.hourly.some(x => x.hour === '2026-10-03T11:00') &&
      /HORS LIGNE/.test(w.hourlyState) && /dernières données conservées/.test(w.hourlyNote) &&
      /reçues il y a/.test(w.hourlyNote), JSON.stringify({ hourly: w.hourly, state: w.hourlyState, note: w.hourlyNote }));
    await s.c.setOffline(false); await s.c.close();

    // 3. sans trajet : aucun trajet inventé
    s = await session(b, { at: '2026-10-03T05:40:00+02:00', scn: 'doux' });
    await s.p.evaluate(() => { CAL = null; S.work.days = [7]; renderAll(); }); await s.settle(2);
    w = await wx(s.p);
    check('3 · aucun trajet : message clair, aucun départ dans la chronologie', /Aucun trajet prévu/.test(w.trip) && !w.moments.some(x => /départ/.test(x)), w.trip + ' | ' + w.moments.join(' | '));
    check('3 · temps doux sans trajet : « ce qui compte » sans remplissage', w.matters.length >= 1 && w.matters.length <= 3, w.matters.join(' | '));
    await s.c.close();

    // 4. PC 1280 et 1920 : même contenu, sans débordement
    for (const dev of ['pc', 'wide']) {
      s = await session(b, { at: '2026-10-03T05:40:00+02:00', scn: 'pluie', dev });
      w = await wx(s.p); const Lp = await layout(s.p, false);
      if (process.env.WX_SHOT && dev === 'pc') await s.p.locator('#secWx').screenshot({ path: process.env.WX_SHOT + '-pc.png' });
      check(`4 · ${dev} : mêmes blocs que l’iPhone, sans débordement`, w.shown && w.first === 'secWx' && w.phen.length === 7 && /Conditions route/i.test(w.road) && Lp.sw <= Lp.W && !Lp.wide.length, JSON.stringify({ Lp, first: w.first }));
      await s.c.close();
    }

    // 5. fournisseur indisponible (503) puis absent (réseau coupé) au premier lancement : rien d'inventé, message clair
    for (const meteo of ['503', 'abort']) {
      s = await session(b, { at: '2026-10-03T05:40:00+02:00', meteo });
      w = await wx(s.p);
      check(`5 · météo ${meteo === '503' ? 'en panne (503)' : 'absente'} : poste météo masqué, aucune valeur inventée, message « Météo indisponible »`, !w.shown && /Météo indisponible/i.test(w.notice) && s.S.calls > 0, JSON.stringify({ shown: w.shown, notice: w.notice.slice(0, 120) }));
      // retour du fournisseur : le poste météo apparaît
      s.S.meteo = 'ok'; await s.p.evaluate(() => refreshAll()); await s.settle(10);
      w = await wx(s.p);
      check(`5 · retour du fournisseur après ${meteo} : poste météo affiché`, w.shown && w.title.length > 4, JSON.stringify({ shown: w.shown, notice: w.notice.slice(0, 120) }));
      await s.c.close();
    }

    // Vigilance : requête sur le code du département, bulletin réel du format
    // public simulé ; une panne ou un bulletin vide ne deviennent jamais « RAS ».
    for (const dev of ['iphone', 'pc']) {
      s = await session(b, { at: '2026-10-11T14:00:00+02:00', scn: 'doux', dev });
      let feed = 'ok', requested = null;
      await s.p.route('https://public.opendatasoft.com/**', r => {
        requested = new URL(r.request().url()).searchParams.get('refine.domain_id');
        if (feed === 'abort') return r.abort();
        const fields = { domain_id: '80', color_id: 2, color: 'jaune', phenomenon: 'vent', echeance: 'J', product_datetime: '2026-10-11T04:00Z', end_time: '2026-10-11T22:00Z' };
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ records: feed === 'empty' ? [] : [{ fields }] }) });
      });
      const state = () => s.p.evaluate(async () => {
        S.dept = { code: '80', name: 'Somme' }; S.alerts.vigi = 1;
        await fetchVigi(); renderAlerts();
        const row = document.querySelector('#secAlerts input[data-alert=vigi]').closest('.al');
        return { state: VIGI.state, row: row.innerText, block: vigiBlock(), diagnostic: diagRows().find(r => r[0] === 'API météo')[1] };
      });
      let result = await state();
      check(`${dev} · vigilance Somme : code 80, bulletin jaune daté et alerte cohérente`, requested === '80' && result.state === 'ok' && /JAUNE.*bulletin du/.test(result.block) && /Vigilance jaune/.test(result.row), JSON.stringify(result));
      for (feed of ['empty', 'abort']) {
        result = await state();
        check(`${dev} · vigilance ${feed} : inconnue, sans RAS ni faux feu vert`, result.state !== 'ok' && /INCONNU/.test(result.row) && /indisponible/.test(result.row) && !/RAS|VERTE/.test(result.row), JSON.stringify(result));
      }
      check(`${dev} · diagnostic : la file réseau ne prétend pas vérifier le fournisseur`, /file réseau.*non vérifié/.test(result.diagnostic) && !/disponible/.test(result.diagnostic), result.diagnostic);
      await s.c.close();
    }
    // 6. phénomène marqué : brouillard givrant au petit matin (scénario « froid », lendemain matin) → verdict orange ou rouge
    s = await session(b, { at: '2026-10-03T23:30:00+02:00', scn: 'froid' });
    w = await wx(s.p);
    check('6 · nuit froide : verdict 🟠 ou 🔴, phénomène nommé, fenêtre donnée', /lv[23]/.test(w.heroLv) && /BROUILLARD|VERGLAS|GEL/.test(w.title) && /\d\d:\d\d/.test(w.hero), w.hero);
    check('6 · « ce qui compte » commence par le plus grave', /^🔴|^🟠/.test(w.matters[0] || ''), w.matters.join(' | '));
    await s.c.close();

    // Réponse météo locale valide, mais un trajet courant et un suivant sans
    // prévisions : le DOM ne doit jamais transformer l’absence en voyant vert.
    for (const dev of ['iphone', 'pc']) {
      s = await session(b, { at: '2026-10-03T05:40:00+02:00', scn: 'doux', dev });
      const neutral = await s.p.evaluate(() => {
        const input = wxInput();
        const make = (id, dep, arr) => ({ id, label: 'trajet fictif', dep, arr, from: 'Ville A', to: 'Ville B', points: [] });
        input.trips = [make('empty-first', '2026-10-03T07:00', '2026-10-03T07:40'), make('empty-later', '2026-10-03T12:00', '2026-10-03T12:40')];
        const original = wxInput; wxInput = () => input; renderWx.last = ''; renderWx(); wxInput = original;
        const box = document.querySelector('#secWx .wx-trip');
        return { cls: box.className, text: box.innerText, green: !!box.querySelector('.lv0'), matters: document.querySelector('#secWx .wx-mat').innerText };
      });
      check(`${dev} · météo route inconnue : carte neutre et suivant indisponible, aucune rassurance inventée`, /lvx/.test(neutral.cls) && !neutral.green && !/🟢/.test(neutral.text) && /Ensuite : ⏳.*météo indisponible/.test(neutral.text) && !/Pas de pluie attendue sur les trajets/.test(neutral.matters), JSON.stringify(neutral));
      await s.c.close();
    }
    await require('./lib/temperature-card')(b, check);
    const extra = [...hosts].filter(h => !KNOWN.test(h));
    check('7 · aucun fournisseur externe supplémentaire', !extra.length, extra.join(', '));
    check('7 · aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n')); console.log('erreurs JS : ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'aucune'));
  console.log(`${rows.length - fail}/${rows.length} scénarios OK`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error('❌ Météo : étape ' + stage + ' · ' + String(e.name || 'Erreur') + ' · ' + String(e.message || e).split('\n')[0].slice(0, 170)); process.exitCode = 1; });
