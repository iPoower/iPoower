// Lieu courant de confiance (PC au travail, COARSE) : « Bien arrivé », « Je suis déjà au travail », « Je quitte le travail »,
// « Bien rentré » ; une position réseau (IP / COARSE) ne remplace jamais un lieu confirmé ni ne s'affiche comme position réelle.
// Lieux fictifs : Maison test (48,85 ; 2,35), Travail test (48,90 ; 2,25), « Ville approximative test » ≈ 100 km plus loin (fournisseur navigateur inconnu).
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const KNOWN = /open-meteo\.com|opendatasoft\.com|ipoower\.github\.io|rainviewer|arcgisonline|tile\.openstreetmap|unpkg\.com|cdn\.jsdelivr|router\.project-osrm|fonts\.g|bigdatacloud\.net/;
let fail = 0; const rows = [], errors = [], hosts = new Set();
const check = (n, ok, d) => { rows.push((ok ? '✅ ' : '❌ ') + n + (ok || !d ? '' : ' · ' + String(d).slice(0, 400))); if (!ok) fail++; };
const VP = { iphone: { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, pc: { viewport: { width: 1280, height: 800 } } };
const COARSE = { lat: 48.75, lon: 0.95, acc: 20000 }, COARSE2 = { lat: 49.4, lon: 1.1, acc: 35000 }, WORK = { lat: 48.9005, lon: 2.2502, acc: 25 }, HOME = { lat: 48.8502, lon: 2.3501, acc: 20 };

async function session(b, { at, scn = 'doux', dev = 'pc', meteo = 'ok', unlock = true, geo = null }) {
  const T0 = new Date(at).getTime();
  const ctx = { console, Math, Date: class extends Date { constructor(...a) { super(...(a.length ? a : [T0])); } static now() { return T0; } }, Intl, Map, Set, JSON };
  vm.createContext(ctx); vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
  const c = await b.newContext({ ...VP[dev], timezoneId: 'Europe/Paris', locale: 'fr-FR' });
  // géolocalisation simulée sur l'horloge de test : window.__geo = { lat, lon, acc } ou null (aucune position disponible)
  await c.addInitScript(g => {
    window.__geo = g; const W = new Map(); let n = 0;
    const pos = () => ({ coords: { latitude: window.__geo.lat, longitude: window.__geo.lon, accuracy: window.__geo.acc, speed: null }, timestamp: Date.now() });
    const geo = { getCurrentPosition(ok, err) { setTimeout(() => window.__geo ? ok(pos()) : err && err({ code: 2, message: 'indisponible' }), 20); },
      watchPosition(ok, err) { const id = ++n; W.set(id, { ok, err }); setTimeout(() => window.__geo ? ok(pos()) : err && err({ code: 2 }), 20); return id; }, clearWatch(id) { W.delete(id); } };
    window.__geoPush = () => W.forEach(w => window.__geo ? w.ok(pos()) : w.err && w.err({ code: 2 }));
    Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geo });
  }, geo);
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
    if (u.includes('api.bigdatacloud.net')) { S.rev = (S.rev || 0) + 1; const q = new URL(u).searchParams; return J({ locality: +q.get('longitude') < 1.5 ? 'Ville approximative test' : 'Ville proche', city: '', principalSubdivision: 'Région test' }); }
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
const st = p => p.evaluate(() => { const b = document.getElementById('placeBar'); document.getElementById('settings').open = true; renderSettings(true); renderDiag();
  const dd = [...document.querySelectorAll('#diagBox dt')].reduce((o, dt) => (o[dt.textContent] = dt.nextElementSibling.textContent, o), {});
  return { bar: b ? b.innerText.replace(/\s+/g, ' ').trim() : '', loc: UI.loc, conf: PLACE.conf, gps: GPS ? { name: GPS.name, acc: GPS.acc } : null, chips: document.getElementById('locChips').innerText.replace(/\s+/g, ' '),
    stored: localStorage.getItem('twrc.place.v1'), diag: dd, brief: (document.getElementById('secBrf').innerText || '').replace(/\s+/g, ' ') }; });
const locateAt = async (s, g) => { await s.p.evaluate(g => { window.__geo = g; }, g); await s.p.evaluate(() => locate(true)); await s.settle(2); await s.p.evaluate(() => window.__geoPush()); await s.settle(2); };

(async () => {
  const b = await BR.launch();
  try {
    // 1. PC, lundi 06:50 : aller domicile-travail en cours (départ 06:30, 40 min) → « ARRIVÉE · Travail » puis « Bien arrivé »
    let s = await session(b, { at: '2026-10-05T06:50:00+02:00' }); let x = await st(s.p);
    check('1 · trajet aller en cours : « ARRIVÉE · 🏢 Travail test » et bouton « ✅ Bien arrivé »', /ARRIVÉE · 🏢 Travail test/.test(x.bar) && /✅ Bien arrivé/.test(x.bar), x.bar);
    await s.p.locator('#placeBar [data-act=place-confirm][data-how=arrival]').click(); await s.settle(2); x = await st(s.p);
    check('1 · confirmé : « 🏢 AU TRAVAIL · Confirmé à 06:50 · source : confirmation utilisateur »', /🏢 AU TRAVAIL/.test(x.bar) && /Confirmé à 06:50 · source : confirmation utilisateur/.test(x.bar) && x.loc === 'work', JSON.stringify({ bar: x.bar, loc: x.loc }));
    check('1 · trajet aller terminé proprement (plus affiché en cours)', !/Trajet en cours · domicile-travail/.test(x.brief) && /commute\|/.test(await s.p.evaluate(() => localStorage.getItem('twrc.tripdone') || '')), x.brief.slice(0, 200));
    check('1 · stockage : identifiant de lieu et heure seulement, aucune coordonnée', !!x.stored && /"placeId":"work"/.test(x.stored) && !/lat|lon|48\.|2\.2/.test(x.stored), x.stored);
    // 2. COARSE : position IP à ~100 km, précision 20 km → lieu non déduit
    await locateAt(s, COARSE); x = await st(s.p);
    check('2 · relevé approximatif à ~100 km juste après la confirmation : le lieu reste Travail', /🏢 AU TRAVAIL/.test(x.bar) && x.loc === 'work' && !x.gps, JSON.stringify({ bar: x.bar, loc: x.loc, gps: x.gps }));
    check('2 · Relevé navigateur approximatif signalé sans inférer un fournisseur, jamais affiché comme position réelle', /Position approximative ignorée pour le lieu confirmé/.test(x.bar) && !/Ville approximative test/.test(x.chips), x.bar + ' | ' + x.chips);
    check('2 · diagnostic : brut, réseau, lieu logique, source gagnante, source écartée', x.diag['Position réseau / IP'] === 'aucune' && /±20000 m/.test(x.diag['Géolocalisation navigateur (brute)'] || '') && /Travail test · Confirmée/.test(x.diag['Lieu logique Race Control'] || '') && /^manual/.test(x.diag['Source retenue'] || '') && /navigateur : précision insuffisante/.test(x.diag['Sources écartées'] || ''), JSON.stringify(['Position réseau / IP', 'Lieu logique Race Control', 'Source retenue', 'Sources écartées'].map(k => x.diag[k])));
    await locateAt(s, COARSE2); x = await st(s.p);
    check('2 · changement de position approximative sans déplacement : toujours Travail', /🏢 AU TRAVAIL/.test(x.bar) && x.loc === 'work', x.bar);
    // 3. rafraîchissement / réouverture : la confirmation survit, le relevé approximatif aussi est toujours ignoré
    await s.p.reload(); await s.settle(10); x = await st(s.p);
    check('3 · après rechargement (PWA rouverte) : AU TRAVAIL, lieu Travail sélectionné', /🏢 AU TRAVAIL/.test(x.bar) && x.loc === 'work', JSON.stringify({ bar: x.bar, loc: x.loc }));
    // 4. relevé précis impossible (100 km en 3 min) : rejeté
    await s.p.clock.runFor(3 * 60e3); await locateAt(s, { lat: 48.75, lon: 0.95, acc: 30 }); x = await st(s.p);
    check('4 · relevé « précis » à 100 km en 3 min : rejeté comme incohérent', /🏢 AU TRAVAIL/.test(x.bar) && /déplacement impossible/.test(x.diag['Sources écartées'] || ''), JSON.stringify(x.diag));
    // 5. « Je quitte le travail » : fin de l'état, dernier lieu fiable conservé
    await s.p.locator('#placeBar [data-act=place-leave]').click(); await s.settle(2); x = await st(s.p);
    check('5 · « Je quitte le travail » : état terminé, Travail reste le dernier lieu fiable', !x.conf && /Travail test · Estimée/.test(x.diag['Lieu logique Race Control'] || '') && /🏢 Je suis déjà au travail/.test(x.bar), JSON.stringify({ bar: x.bar, diag: x.diag['Lieu logique Race Control'] }));
    await s.c.close();

    // 6. ouvert après l'arrivée, hors ligne, sans GPS : « Je suis déjà au travail », puis reconnexion avec une position approximative
    s = await session(b, { at: '2026-10-05T08:15:00+02:00', geo: null }); x = await st(s.p);
    check('6 · aucune position disponible : « Localisation physique indisponible »', /Localisation physique indisponible/.test(x.bar), x.bar);
    await s.c.setOffline(true); await s.p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(1);
    await s.p.locator('#placeBar [data-act=place-confirm][data-place=work]').click(); await s.settle(2); x = await st(s.p);
    check('6 · hors connexion : « Je suis déjà au travail » enregistré localement', /🏢 AU TRAVAIL/.test(x.bar) && /"how":"manual"/.test(x.stored || '') && x.loc === 'work', x.bar);
    await s.c.setOffline(false); await s.p.evaluate(() => window.dispatchEvent(new Event('online'))); await s.settle(4);
    await locateAt(s, COARSE); x = await st(s.p);
    check('6 · reconnexion + position approximative : pas de bascule Travail → ville du COARSE', /🏢 AU TRAVAIL/.test(x.bar) && x.loc === 'work' && !/Ville approximative test/.test(x.chips), x.bar);
    // 7. GPS précis qui contredit légitimement (rentré à la maison 45 min plus tard)
    await s.p.clock.runFor(45 * 60e3); await locateAt(s, HOME); x = await st(s.p);
    check('7 · GPS précis et cohérent à la maison 45 min plus tard : la confirmation du travail se termine', !x.conf && /Maison test/.test(x.bar) && /Fiable/.test(x.bar) && /GPS/.test(x.bar), JSON.stringify({ bar: x.bar, conf: x.conf }));
    await s.c.close();

    // 8. seulement le relevé approximatif, sans confirmation : jamais présenté comme position réelle
    s = await session(b, { at: '2026-10-05T10:00:00+02:00', geo: COARSE }); await locateAt(s, COARSE); x = await st(s.p);
    check('8 · position navigateur approximative seule : « Localisation physique indisponible », « Position réseau approximative : précision ~20 km »', /Localisation physique indisponible/.test(x.bar) && /Localisation navigateur approximative · précision ~20 km/.test(x.bar) && !x.gps && x.loc !== 'gps', JSON.stringify({ bar: x.bar, gps: x.gps, loc: x.loc }));
    // 9. précision moyenne (± 900 m) près du travail : estimée seulement
    await locateAt(s, { lat: 48.902, lon: 2.252, acc: 900 }); x = await st(s.p);
    check('9 · localisation navigateur ± 900 m : « Estimée », jamais « Confirmée »', /Travail test · Estimée/.test(x.bar), x.bar);
    // 10. GPS précis au travail : lieu reconnu, « Fiable »
    await locateAt(s, WORK); x = await st(s.p);
    check('10 · GPS précis au travail : 🏢 Travail test · Fiable · GPS', /Travail test · Fiable · GPS navigateur · ± 25 m/.test(x.bar), x.bar);
    await s.c.close();

    // 11. retour à la maison : trajet retour en cours (départ 16:00) → « Bien rentré »
    s = await session(b, { at: '2026-10-05T16:20:00+02:00', geo: null }); x = await st(s.p);
    check('11 · retour en cours : « ARRIVÉE · 🏠 Maison test » et « ✅ Bien rentré »', /ARRIVÉE · 🏠 Maison test/.test(x.bar) && /✅ Bien rentré/.test(x.bar), x.bar);
    await s.p.locator('#placeBar [data-act=place-confirm][data-how=arrival]').click(); await s.settle(2); x = await st(s.p);
    check('11 · confirmé : « 🏠 À LA MAISON », lieu Maison sélectionné', /🏠 À LA MAISON/.test(x.bar) && x.loc === 'home', x.bar);
    await s.c.close();

    // 11 bis. ajouter une destination (« + Destination ») ne change pas le lieu de travail
    s = await session(b, { at: '2026-10-05T09:30:00+02:00', geo: null });
    const w = await s.p.evaluate(async () => { const before = S.work.to; window.__hits = [{ name: 'Ville D', sub: 'Test', lat: 48.7, lon: 1.0 }];
      const bt = document.createElement('button'); bt.dataset.act = 'geo-add'; bt.dataset.i = '0'; document.body.appendChild(bt); bt.click(); bt.remove();
      await new Promise(r => setTimeout(r, 50)); return { before, after: S.work.to, added: S.customs.some(c => c.name === 'Ville D'), work: (placeList().find(p => p.kind === 'work') || {}).id }; });
    check('11 bis · « + Destination » : destination ajoutée, lieu de travail inchangé', w.added && w.after === w.before && w.work === w.before, JSON.stringify(w));
    await s.c.close();


    // 11 ter. ancien bug déjà enregistré : réparer au rechargement, sans confirmer un faux lieu.
    s = await session(b, { at: '2026-10-05T09:30:00+02:00', geo: null });
    await s.p.evaluate(() => {
      S.customs.push({ id: 'c-legacy', name: 'Destination ancienne test', lat: 48.7, lon: 1 });
      S.work.to = 'c-legacy'; markEdit('customs'); delete (S.edits || {})['work.to']; saveSettings();
      localStorage.setItem('twrc.place.v1', JSON.stringify({ conf: { placeId: 'c-legacy', at: Date.now(), how: 'manual', day: '2026-10-05' }, last: { placeId: 'c-legacy', at: Date.now(), source: 'manual' } }));
    });
    await s.p.reload(); await s.settle(10);
    let repaired = await s.p.evaluate(() => ({ work: S.work.to, custom: S.customs.some(l => l.id === 'c-legacy'), conf: PLACE.conf, last: PLACE.last }));
    check('11 ter · ancien ajout : Travail rétabli, destination conservée, fausse confirmation effacée', repaired.work === 'work' && repaired.custom && !repaired.conf && !repaired.last, JSON.stringify(repaired));
    // Ce cas vérifie le domicile-travail : l’agenda fictif est couvert par les autres scénarios.
    await s.p.evaluate(() => { CAL = { events: [] }; renderAll(); });
    await s.p.locator('#placeBar [data-act=place-confirm][data-place=work]').click(); await s.settle(2);
    await s.p.locator('[data-act=view][data-v=pneus]').click(); await s.settle(2); x = await st(s.p);
    const route = await s.p.locator('#secBrf .brf-r').innerText();
    check('11 ter · lieu confirmé nommé, retour depuis le vrai Travail', /AU TRAVAIL · Travail test/.test(x.bar) && route.replace(/\s+/g, ' ').trim().toLowerCase() === 'travail test → maison test', route + ' | ' + x.bar);
    const labels = await s.p.locator('#locChips [data-act=loc]').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || '').join(' | '));
    check('11 ter · lieux météo : domicile, travail et destination identifiés', /Météo : Travail test · 🏢 Travail/.test(labels) && /Météo : Destination ancienne test · 📌 Destination/.test(labels), labels);
    await s.p.evaluate(() => { S.work.to = 'c-legacy'; markEdit('work.to'); saveSettings(); });
    await s.p.reload(); await s.settle(10);
    check('11 ter · choix explicite d’un travail personnalisé conservé après rechargement', await s.p.evaluate(() => S.work.to === 'c-legacy'));
    await s.c.close();

    // 12. iPhone : barre lisible, sans débordement, cibles ≥ 44 pt
    s = await session(b, { at: '2026-10-05T06:50:00+02:00', dev: 'iphone' });
    const L = await s.p.evaluate(() => { const W = document.documentElement.clientWidth, small = []; document.querySelectorAll('#placeBar button').forEach(e => { const r = e.getBoundingClientRect(); if (r.height < 43.5) small.push(Math.round(r.height)); });
      return { sw: document.documentElement.scrollWidth, W, small, n: document.querySelectorAll('#placeBar button').length }; });
    check('12 · iPhone : barre du lieu sans débordement, boutons ≥ 44 pt', L.sw <= L.W && !L.small.length && L.n >= 1, JSON.stringify(L));
    await s.c.close();

    const extra = [...hosts].filter(h => !KNOWN.test(h));
    check('13 · aucun fournisseur externe supplémentaire', !extra.length, extra.join(', '));
    check('13 · aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n')); console.log('erreurs JS : ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'aucune'));
  console.log(`${rows.length - fail}/${rows.length} scénarios OK`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log(rows.join('\n')); console.error(e); process.exitCode = 1; });
