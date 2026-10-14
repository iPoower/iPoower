// Incident du 14 octobre 2026 (iPhone/Safari) : HTTP 429 Open-Meteo affiché « HORS LIGNE » alors que le Wi-Fi fonctionnait,
// bouton « Réessayer » actif mais sans effet, et avertissement d'import pour un ancien lien de configuration.
// Réseau 100 % simulé, profil et clés fictifs : aucune requête externe, aucun lieu, lien ou coordonnée réels.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8');
const T0 = new Date('2026-10-14T16:50:00+02:00').getTime(); let TNOW = T0;
const RD = Date, FD = class extends RD { constructor(...a) { super(...(a.length ? a : [TNOW])); } static now() { return TNOW; } };
const ctx = { console, Math, Date: FD, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(src + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, html = fs.readFileSync('site/index.html', 'utf8');
const U = 'https://ipoower.github.io/iPoower/race-control/';
let fail = 0; const rows = [], check = (n, ok, d) => { rows.push((ok ? '✅' : '❌') + ' ' + n + (d ? ' · ' + d : '')); if (!ok) fail++; };
(async () => {
  const b = await require('./lib/browser').launch();
  const scenario = async (dev, viewport, mobile) => {
    const c = await b.newContext({ viewport, isMobile: mobile, hasTouch: mobile, timezoneId: 'Europe/Paris' });
    await c.addInitScript(() => { window.__OFFLINE = false; Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !window.__OFFLINE }); });
    const p = await c.newPage(); await p.clock.install({ time: T0 }); p.on('pageerror', e => rows.push('ERR ' + e.message));
    let meteo = 0, LIMIT = true;
    const J = (r, o, s = 200) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    await p.route('**/*', r => { const u = r.request().url();
      if (/(^|\.)open-meteo\.com$/.test(new URL(u).hostname)) { meteo++;   // hôte exact (pas une sous-chaîne d'URL)
        if (LIMIT) return J(r, { error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' }, 429);
        const q = new URL(u).searchParams, lats = String(q.get('latitude')).split(','), lons = String(q.get('longitude')).split(','), one = i => ctx.mk('doux', { lat: +lats[i], lon: +lons[i] }, 'Europe/Paris', 0);
        if (lats.length > 1) return J(r, lats.map((_, i) => one(i))); const base = one(0);
        return J(r, u.includes('ensemble') ? ctx.me(base) : q.get('minutely_15') ? ctx.mn(base) : base); }
      if (u.includes('/race-control/calendar.sealed.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(SP + '/cal.fake.json', 'utf8') });
      if (u.includes('/race-control/obs.json')) return J(r, { stations: {} });
      if (u.includes('/race-control/tiredb.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync('site/tiredb.json', 'utf8') });
      if (u.startsWith(U) && !/\.(js|json)$/.test(new URL(u).pathname)) return r.fulfill({ status: 200, contentType: 'text/html', body: html });
      return r.abort(); });
    const settle = async (n = 8) => { for (let i = 0; i < n; i++) { await p.clock.runFor(500); await p.waitForTimeout(100); } };
    const view = () => p.evaluate(() => ({ bar: document.querySelector('#statusbar').innerText.replace(/\s+/g, ' '), body: document.body.innerText.replace(/\s+/g, ' '),
      btn: [...document.querySelectorAll('[data-act="refresh"]')].map(x => ({ t: x.textContent.trim(), off: x.disabled })), hash: location.hash }));
    await p.goto(U); await p.clock.runFor(2500); await p.fill('#unlockPw', PW);
    await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await settle(16);
    let s = await view();
    // 429 dès l'ouverture, sans cache : en ligne → jamais « HORS LIGNE »
    check(dev + ' · HTTP 429 sans cache, réseau actif : badge LIMITÉ, jamais HORS LIGNE, reprise annoncée',
      /^LIMITÉ/.test(s.bar) && !/HORS LIGNE/.test(s.bar) && /fournisseur météo limité · reprise automatique après/.test(s.bar), s.bar);
    check(dev + ' · carte : « Fournisseur météo limité », quota journalier, connexion fonctionnelle, aucune valeur inventée',
      /Fournisseur météo limité/i.test(s.body) && /quota journalier/.test(s.body) && /Ta connexion fonctionne/.test(s.body) && /Aucune valeur n’est inventée/.test(s.body), (s.body.match(/(Fournisseur météo limité|Météo indisponible).{0,260}/i) || [s.body.slice(0, 300)])[0]);
    check(dev + ' · Actualiser et Réessayer désactivés pendant la pause, avec l’heure de reprise', s.btn.length >= 2 && s.btn.every(x => x.off) && s.btn.some(x => /Reprise auto \d\d\/\d\d \d\d:\d\d/.test(x.t)), JSON.stringify(s.btn));
    // Ancien lien de configuration ouvert pendant une session (favori, icône) : contenu fictif hors schéma, refusé, retiré, message explicite.
    const legacy = Buffer.from(JSON.stringify({ v: 1, ancienChamp: true })).toString('base64').replace(/=+$/, '');
    await p.evaluate(h => { location.hash = h; }, '#cfg=' + legacy); await settle(8); const imp = await view();
    check(dev + ' · ancien lien de configuration : message explicite, lien retiré de l’adresse, aucun contenu affiché',
      !/cfg/.test(imp.hash) && /Lien de configuration ignoré.*format ancien.*remplace le favori/.test(imp.body) && !imp.body.includes(legacy) && !imp.body.includes('ancienChamp'), (imp.hash || '(adresse propre)') + ' · ' + ((imp.body.match(/Lien de configuration[^.]*\./) || ['(message absent)'])[0]));
    const before = meteo;
    await p.evaluate(() => document.querySelectorAll('[data-act="refresh"]').forEach(x => { x.disabled = false; x.click(); })); await settle(6);
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await settle(6);
    for (let i = 0; i < 20; i++) { TNOW += 60e3; await p.clock.runFor(60e3); } await settle(4);
    check(dev + ' · pause respectée : clics forcés, événement « online » et 20 min d’auto-actualisation → 0 requête Open-Meteo', meteo === before, `${before} → ${meteo}`);
    // vraie coupure : HORS LIGNE redevient l'état affiché
    await p.evaluate(() => { window.__OFFLINE = true; window.dispatchEvent(new Event('offline')); }); await settle(4); s = await view();
    check(dev + ' · vraie perte de réseau : HORS LIGNE (distingué du fournisseur limité)', /^HORS LIGNE/.test(s.bar) && !/LIMITÉ/.test(s.bar), s.bar);
    // fin de la pause, réseau revenu : reprise automatique et LIVE ; puis un « online » ne refait pas tout le cycle
    LIMIT = false; await p.evaluate(() => { window.__OFFLINE = false; }); TNOW = Date.parse('2026-10-15T00:03:00Z'); await p.clock.setSystemTime(TNOW);
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await settle(16); s = await view();
    check(dev + ' · fin de pause : reprise automatique, badge LIVE, boutons réactivés', /^LIVE/.test(s.bar) && s.btn.every(x => !x.off), s.bar + ' · ' + JSON.stringify(s.btn));
    const fresh = meteo; await p.evaluate(() => window.dispatchEvent(new Event('online'))); await settle(10);
    check(dev + ' · bascule réseau juste après une actualisation : caches respectés (pas de nouvel aller-retour complet)', meteo - fresh <= 1, `${meteo - fresh} requête(s)`);
    await c.close();
  };
  await scenario('iPhone', { width: 414, height: 896 }, true);
  await scenario('PC', { width: 1280, height: 900 }, false);
  console.log(rows.join('\n') + '\n\n' + (rows.length - fail) + '/' + rows.length + ' scénarios OK · erreurs JS : ' + (rows.some(x => x.startsWith('ERR ')) ? 'présentes' : 'aucune'));
  await b.close(); process.exit(fail || rows.some(x => x.startsWith('ERR ')) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
