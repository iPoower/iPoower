// Drive · prolongation discrète de l'autorisation Google (18/11/2026), vraie app sur une origine dédiée fictive, vrai build
// Drive et sa CSP (même banc que e2e106), Google et session simulés : aucun appel réel, aucun jeton, données fictives.
// Attendu : dans les 10 dernières minutes, un appui dans l'application (hors saisie) demande la prolongation DANS le geste ;
// jamais plus tôt, jamais pendant une saisie, au plus une fois toutes les 10 minutes ; un échec ne coupe rien.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), activateJournal = require('./lib/journal-activation');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, built = fs.readFileSync('site/index.html', 'utf8');
const O = 'https://rc-prolonge.example', U = O + '/';
const CONFIG = { approved: true, clientId: '123456789012-prolongefictif.apps.googleusercontent.com', apiKey: 'AIza' + 'C'.repeat(35), appId: '123456789012', raceOrigin: O, vaultOrigin: 'https://cv-prolonge.example' };
// CSP du VRAI build avec Drive : tools/build.js est exécuté ici avec la configuration publique FICTIVE ci-dessus (origine dédiée
// fictive, sans fichiers privés, chiffrés copiés dans un dossier temporaire : rien n'est écrit dans le dépôt). Toutes ses directives
// et origines sont reprises telles quelles ; seules les empreintes des scripts (sha256/sha384) sont celles de la page de test, dont
// le contenu inline (préréglage fictif, identifiant de build) diffère par construction. Aucune copie figée de la politique.
const html = (() => {
  const { spawnSync } = require('child_process'), path = require('path'), ROOT = path.resolve(__dirname, '..');
  const tmp = fs.mkdtempSync(path.resolve('drive-csp-')), rel = path.relative(ROOT, tmp);
  try {
    fs.cpSync(path.join(ROOT, 'encrypted'), path.join(tmp, 'enc'), { recursive: true });
    const b = spawnSync(process.execPath, [path.join(ROOT, 'tools/build.js')], { cwd: ROOT, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, RC_OUT: rel + '/out', RC_PRIVATE: rel + '/aucun', RC_ENCRYPTED: rel + '/enc', GOOGLE_DRIVE_CONFIG: JSON.stringify(CONFIG), RC_DATA_BASE: 'https://data-prolonge.example/d/' } });
    if (b.status !== 0) throw new Error('Build Drive fictif en échec : ' + String(b.stderr).slice(0, 300));
    const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/, drive = fs.readFileSync(path.join(tmp, 'out/index.html'), 'utf8').match(META), own = built.match(META);
    if (!drive || !own) throw new Error('CSP introuvable dans un des deux builds');
    const parse = csp => new Map(csp.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v])), isHash = t => /^'sha(256|384|512)-/.test(t);
    const D = parse(drive[1]), S = parse(own[1]);
    const has = (k, token) => (D.get(k) || []).some(t => t === token);   // jeton CSP exact, jamais une sous-chaîne
    if (!has('script-src', 'https://accounts.google.com/gsi/client') || !has('frame-src', 'https://docs.google.com')) throw new Error('Le build Drive ne porte pas les origines Google attendues');
    D.set('script-src', [...S.get('script-src').filter(isHash), ...D.get('script-src').filter(t => !isHash(t))]);
    const csp = [...D].map(([k, v]) => [k, ...v].join(' ')).join('; ');
    // Contre-contrôle : hors empreintes, chaque directive est identique, jeton pour jeton, à celle du build Drive.
    const P = parse(csp), strip = m => JSON.stringify([...m].map(([k, v]) => [k, v.filter(t => !isHash(t))]));
    if (strip(P) !== strip(parse(drive[1]))) throw new Error('CSP de test différente du build Drive hors empreintes');
    console.log(`CSP extraite du build Drive réel : ${P.size} directives, ${[...P].filter(([, v]) => v.some(t => /google/.test(t))).map(([k]) => k).join(', ')} avec origines Google`);
    return built.replace(own[0], `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
})();
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAABJRU5ErkJggg==', 'base64');
// Bibliothèque d'identité simulée : chaque demande d'autorisation est comptée, avec l'événement en cours (geste ou non) ; la
// fenêtre est refusée par le navigateur simulé (popup_failed_to_open), comme un bloqueur de fenêtres.
const GSI = `(() => { const S = window.__gsi = window.__gsi || { calls: 0, gesture: [] };
  window.google = { accounts: { oauth2: { hasGrantedAllScopes: () => true, initTokenClient(cfg) { return { requestAccessToken() {
    S.calls++; const ev = window.event; S.gesture.push(!!ev && /^(click|pointerup|mouseup|touchend|keydown|keyup)$/.test(ev.type));
    setTimeout(() => cfg.error_callback({ type: 'popup_failed_to_open', message: 'Failed to open popup window' }), 0); } }; } } } }; })();`;
let n = 0; const findings = [];
const expect = (label, ok, detail) => { if (ok) { n++; console.log('✅ ' + label); } else { findings.push(label + ' · ' + String(detail || '').slice(0, 500)); console.log('❌ ' + label + ' · ' + String(detail || '').slice(0, 500)); } };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const c = await b.newContext(dev === 'pc' ? { viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Paris' } : { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, timezoneId: 'Europe/Paris' });
      const p = await c.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      const G = { mode: 'ok', hold: null, served: 0 };   // ok · hold (préparation en cours) · fail (bibliothèque indisponible)
      await c.route('**/*', async r => {
        const url = new URL(r.request().url()), host = url.hostname, J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
        if (host === 'accounts.google.com' && url.pathname === '/gsi/client') {
          if (G.hold) await G.hold.promise;
          if (G.mode === 'fail') return r.fulfill({ status: 503, contentType: 'text/plain', body: 'indisponible' });
          G.served++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: GSI });
        }
        if (host === 'apis.google.com') return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* Picker non simulé */' });
        if (host === 'open-meteo.com' || host.endsWith('.open-meteo.com')) {
          const q = url.searchParams, la = String(q.get('latitude')).split(','), lo = String(q.get('longitude')).split(','), one = i => ctx.mk('doux', { lat: +la[i], lon: +lo[i] }, 'Europe/Paris', 0);
          if (la.length > 1) return J(la.map((_, i) => one(i)));
          const x = one(0); return J(url.pathname.includes('ensemble') ? ctx.me(x) : q.get('minutely_15') ? ctx.mn(x) : host.startsWith('air-quality') ? {} : x);
        }
        if (url.origin === O && url.pathname === '/drive-config.json') return J(CONFIG);
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
      const unlock = async () => {
        await p.waitForFunction(() => document.getElementById('unlockPw') || (typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault'), null, { timeout: 60000 });
        if (await p.locator('#unlockPw').count() && await p.locator('#unlockPw').isVisible()) {
          await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }).catch(() => {}), p.click('#unlockForm button[type=submit]')]);
        }
        await p.waitForFunction(() => typeof S === 'object' && window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault', null, { timeout: 60000 });
        await p.waitForFunction(() => DRIVE_UI.config && document.getElementById('driveBadge'), null, { timeout: 30000 });
      };
      await p.goto(U); await unlock();
      // Session et synchronisation simulées dans la vraie app : seule la logique de déclenchement est observée.
      await p.evaluate(() => {
        window.__renew = { calls: 0, gesture: [], fail: false, left: 50 * 60000 };
        DRIVE_UI.sync = { run: async () => {}, stop() {}, select() {} };
        DRIVE_UI.session = { get connected() { return true; }, get confirmed() { return true; }, get renewing() { return false; }, get remainingMs() { return window.__renew.left; },
          identity: { label: 'fixture@example.invalid' }, disconnect() {}, connect: () => Promise.reject(Object.assign(new Error('auth'), { code: 'auth' })),
          renew() { const R = window.__renew; R.calls++; const ev = window.event; R.gesture.push(!!ev && ev.type === 'click'); return R.fail ? Promise.reject(Object.assign(new Error('auth'), { code: 'auth' })) : Promise.resolve(); } };
        DRIVE_UI.selected = true; DRIVE_UI.busy = false; DRIVE_UI.renewAt = 0;
        const i = document.createElement('input'); i.id = 'saisieTest'; i.style.cssText = 'position:fixed;top:120px;left:10px;width:120px;height:40px;z-index:99999'; document.body.appendChild(i);
      });
      const tapTab = async () => { await p.evaluate(() => scrollTo(0, 0)); await p.locator('#viewSeg [data-v="meteo"]').click(); await p.waitForTimeout(150); };
      const R = () => p.evaluate(() => ({ ...window.__renew, text: DRIVE_UI.text, selected: DRIVE_UI.selected }));
      await tapTab();
      expect(`${dev} · 50 min restantes : aucun appel à Google`, (await R()).calls === 0, JSON.stringify(await R()));
      await p.evaluate(() => { window.__renew.left = 6 * 60000; });
      await p.locator('#saisieTest').click(); await p.waitForTimeout(150);
      expect(`${dev} · 6 min restantes, appui dans un champ de saisie : aucune prolongation (le clavier n’est jamais interrompu)`, (await R()).calls === 0, JSON.stringify(await R()));
      await tapTab(); const one = await R();
      expect(`${dev} · 6 min restantes, appui sur un onglet : prolongation demandée une fois, DANS le geste`, one.calls === 1 && one.gesture[0] === true, JSON.stringify(one));
      expect(`${dev} · prolongation réussie : message « prolongée … même compte », synchronisation toujours active`, /prolongée pour le même compte/.test(one.text) && one.selected === true, JSON.stringify(one));
      await tapTab();
      expect(`${dev} · nouvel appui juste après : aucune nouvelle demande (au plus une toutes les 10 min)`, (await R()).calls === 1, JSON.stringify(await R()));
      await p.evaluate(() => { DRIVE_UI.renewAt = Date.now() - 11 * 60000; window.__renew.fail = true; DRIVE_UI.text = 'texte avant échec'; });
      await tapTab(); const failed = await R();
      expect(`${dev} · prolongation refusée par Google : rien ne change (synchronisation active, aucun message alarmant)`, failed.calls === 2 && failed.gesture[1] === true && failed.selected === true && failed.text === 'texte avant échec', JSON.stringify(failed));
      await p.evaluate(() => { DRIVE_UI.renewAt = 0; DRIVE_UI.busy = true; });
      await tapTab();
      expect(`${dev} · reconnexion déjà en cours : aucune prolongation concurrente`, (await R()).calls === 2, JSON.stringify(await R()));
      await p.evaluate(() => { DRIVE_UI.busy = false; DRIVE_UI.selected = false; });
      await tapTab();
      expect(`${dev} · synchronisation non active : aucune prolongation`, (await R()).calls === 2, JSON.stringify(await R()));
      const src = await p.evaluate(() => GoogleDriveSession.create.toString());
      expect(`${dev} · code chargé : la session expose la prolongation et la reconnexion au même compte`, /function renew\(/.test(src) && /login_hint/.test(src), src.length);
      expect(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
      await c.close();
    }
  } finally { await b.close(); }
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
