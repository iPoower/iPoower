// Liaison Pneus → Analyse (une seule source de vérité) : une saisie dans l'onglet Pneus (profondeur, pression, DOT, type de
// monte) est reprise immédiatement par Analyse, survit au rechargement et reste disponible hors connexion ; un changement de
// monte invalide l'ancienne mémoire thermique ; un jeu stocké n'est jamais analysé ; aucune seconde saisie des pneus
// dans Analyse. Le formulaire distinct « Dernier roulage » ne renseigne que l'historique de conduite.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/', BR = require('./lib/browser');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
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
const field = async (p, bind, value) => { await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
  const sel = `[data-bind="${bind}"]`; const tag = await p.$eval(sel, e => e.tagName);
  if (tag === 'SELECT') await p.selectOption(sel, value); else { await p.fill(sel, String(value)); await p.$eval(sel, e => e.dispatchEvent(new Event('change', { bubbles: true }))); } };
const labTxt = p => p.evaluate(() => { UI.view = 'analyse'; renderAll(); document.querySelectorAll('#secLab details[data-k]').forEach(d => { d.open = true; }); return (document.getElementById('secLab').innerText || '').replace(/\s+/g, ' '); });
const diag = p => p.evaluate(() => { document.getElementById('settings').open = true; renderSettings(true); renderDiag(); return [...document.querySelectorAll('#diagBox dt')].reduce((o, dt) => (o[dt.textContent] = dt.nextElementSibling.textContent, o), {}); });

(async () => {
  const b = await BR.launch();
  try {
    const s = await session(b, { at: '2026-10-03T07:00:00+02:00', scn: 'pluie', dev: 'pc' });
    let t = await labTxt(s.p);
    const tyreInputsAbsent = await s.p.evaluate(() => [...document.querySelectorAll('#secLab input, #secLab select')].every(e => e.closest('#labLastDriveForm') && !e.dataset.bind));
    check('F · Analyse lit la monte active de Pneus (pneu été, dimension saisie), sans seconde saisie des pneus', /Monte active : été/.test(t) && /215\/40 ZR18 89Y XL/.test(t) && tyreInputsAbsent, t.slice(0, 200));
    // A · profondeur saisie dans Pneus → Analyse (aquaplaning, qualité des données)
    await field(s.p, 'cars.0.tire.treadAv', '2.4'); await field(s.p, 'cars.0.tire.treadAr', '2.4'); await s.settle(2); t = await labTxt(s.p);
    check('A · profondeur 2,4 mm saisie dans Pneus : reprise immédiatement (mesurée par vous) et aquaplaning recalculé', /Profondeur : 2,4 mm, mesurée par vous/.test(t) && /Profondeur 2,4 mm/.test(t), t.slice(0, 600));
    // A2 · essieux distincts : l'avant usé pilote les calculs ; A3 · estimation affichée comme telle, puis retour à la mesure
    await field(s.p, 'cars.0.tire.treadAr', '5.5'); await s.settle(2); t = await labTxt(s.p);
    const ax = await s.p.evaluate(() => ({ tread: S.cars[0].tire.tread, av: S.cars[0].tire.treadAv, ar: S.cars[0].tire.treadAr }));
    check('A2 · AV 2,4 / AR 5,5 : essieux affichés, calculs sur l’essieu le plus usé (avant)', ax.tread === 2.4 && ax.av === 2.4 && ax.ar === 5.5 && /AV 2,4 \/ AR 5,5 mm, mesurée par vous/.test(t) && /essieu le plus usé \(avant\)/.test(t) && /Profondeur 2,4 mm/.test(t), JSON.stringify(ax) + ' ' + t.slice(0, 600));
    await field(s.p, 'cars.0.tire.treadEst', '1'); await s.settle(2); t = await labTxt(s.p);
    check('A3 · profondeur estimée : signalée dans Analyse et dans la confiance', /estimée par vous \(pas mesurée à la jauge\)/.test(t) && /Profondeur estimée par vous, pas mesurée à la jauge/.test(t), t.slice(0, 900));
    await field(s.p, 'cars.0.tire.treadEst', '0'); await field(s.p, 'cars.0.tire.treadAr', '2.4'); await s.settle(2);
    // B · pression et contrôle daté
    await field(s.p, 'cars.0.tire.press', '2,4 AV / 2,6 AR'); await field(s.p, 'cars.0.tire.pchk.date', '2026-08-01'); await field(s.p, 'cars.0.tire.pchk.T', '22'); await s.settle(2); t = await labTxt(s.p);
    check('B · pression et contrôle saisis dans Pneus : cible par essieu, contrôle ancien → confiance et entretien', /Cible saisie : 2,4 bar/.test(t) && /AV 2,4 bar · AR 2,6 bar/.test(t) && /Pression contrôlée il y a 63 j/.test(t) && /Pression à contrôler à froid/.test(t), t.slice(0, 800));
    // D · DOT
    await field(s.p, 'cars.0.tire.dot', '1825'); await s.settle(2); t = await labTxt(s.p);
    check('D · DOT 1825 saisi dans Pneus : semaine 18 / 2025, âge calculé, sans pénalité d’adhérence', /fabrication semaine 18 \/ 2025 · ≈ 1 an 5 mois/.test(t) && /sans effet calculé sur l’adhérence/.test(t), t.slice(0, 800));
    // J · mémoire thermique de la monte été, puis passage au jeu hiver → mémoire ignorée, autre modèle thermique
    await s.p.evaluate(() => { const st = tyreStateOf(S.cars[0]); localStorage.setItem('twrc.tyretherm.v1', JSON.stringify({ carA: { at: nowIn('Europe/Paris'), T: 40, sig: st.sig } })); TT = null; });
    let dg = await diag(s.p);
    check('J · mémoire thermique valide pour la monte été', /^valide/.test(dg['Mémoire thermique'] || ''), dg['Mémoire thermique']);
    await field(s.p, 'cars.0.tire.type', 'winter'); await s.settle(2); t = await labTxt(s.p); dg = await diag(s.p);
    check('C · jeu hiver monté dans Pneus : Analyse passe en hiver (autre modèle thermique)', /Monte active : hiver/.test(t) && /seuils hiver/.test(t), t.slice(0, 300));
    check('J · changement de monte : l’ancienne estimation thermique est ignorée', /ignorée/.test(dg['Mémoire thermique'] || '') && /HISTORIQUE INCONNU/.test(t), dg['Mémoire thermique']);
    check('G · le jeu été devient « stocké » et n’est jamais analysé', /Jeux stockés \(jamais analysés\) : été/.test(t) && dg['Monte active'] === 'hiver', t.slice(0, 900));
    // H · rechargement : tout persiste (réglages locaux de Pneus)
    await s.p.reload(); await s.settle(10); t = await labTxt(s.p); dg = await diag(s.p);
    check('H · après rechargement : jeu hiver et pressions conservés ; le DOT du jeu été ne « migre » pas sur l’hiver', dg['Monte active'] === 'hiver' && /DOT non renseigné/.test(t) && !/fabrication semaine 18/.test(t) && /AV 2,4 bar · AR 2,6 bar/.test(t), JSON.stringify(dg['Monte active']) + ' | ' + t.slice(0, 300));
    // retour au jeu été : la profondeur, la pression et le DOT saisis pour l'été reviennent (rien perdu)
    await field(s.p, 'cars.0.tire.type', 'summer'); await s.settle(2); t = await labTxt(s.p);
    check('aucune perte : retour au jeu été, profondeur 2,4 mm et DOT 1825 retrouvés', /Monte active : été/.test(t) && /Profondeur : 2,4 mm/.test(t) && /fabrication semaine 18 \/ 2025/.test(t), t.slice(0, 600));
    // I · hors connexion : la monte et ses données restent connues
    await s.c.setOffline(true); await s.p.evaluate(() => window.dispatchEvent(new Event('offline'))); await s.settle(2); t = await labTxt(s.p);
    check('I · hors connexion : Analyse connaît toujours la monte et ses données', /Monte active : été/.test(t) && /Profondeur : 2,4 mm/.test(t), t.slice(0, 300));
    await s.c.setOffline(false);
    // K · essieux distingués
    dg = await diag(s.p);
    check('K · diagnostic : avant et arrière distingués (2,4 / 2,6 bar), profil et qualité des données', /2\.4 bar/.test(dg['Avant'] || '') && /2\.6 bar/.test(dg['Arrière'] || '') && /generic|manufacturer/.test(dg['Profil pneu'] || '') && /Modèle exact/.test(dg['Données pneu'] || ''), JSON.stringify([dg['Avant'], dg['Arrière']]));
    // E · un véhicule sans monte : aucune donnée inventée
    await s.p.evaluate(() => { UI.labCar = 'carB'; }); t = await labTxt(s.p);
    check('E · voiture sans monte : « Monte active inconnue », rien d’inventé', /Monte active inconnue/i.test(t), t.slice(0, 200));
    await s.c.close();
    check('aucune erreur JavaScript', !errors.length, errors.slice(0, 3).join(' | '));
  } finally { await b.close(); }
  console.log(rows.join('\n')); console.log('erreurs JS : ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'aucune'));
  console.log(`${rows.length - fail}/${rows.length} scénarios OK`); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
