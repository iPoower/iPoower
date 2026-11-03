// Lot S · reconnexion Google Drive en un vrai geste, après un rechargement à froid. Vraie app sur une origine dédiée fictive
// (configuration Drive publique fictive, initDriveSync réel), Google simulé : la bibliothèque d'identité est servie par le banc,
// avec un délai contrôlé (avant, pendant, après la préparation) ; la fenêtre d'autorisation est « bloquée » par le navigateur
// simulé. Aucun appel réel à Google, aucun jeton. Données fictives. Ce test CONSTATE : chaque écart est listé.
// Attendu : préparation lancée seulement avec une liaison confirmée ; pendant la préparation, « Préparation de Google… » (jamais
// annoncé comme une reconnexion), appui = message, ni fenêtre ni panneau ; Google prêt : un appui sur le badge ou le bouton
// appelle l'autorisation DANS le geste ; fenêtre bloquée : message visible ; préparation échouée : erreur visible et nouvel essai.
'use strict';
const fs = require('fs'), vm = require('vm'), BR = require('./lib/browser'), activateJournal = require('./lib/journal-activation');
const ctx = { console, Math, Date, Intl, Map, Set, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('engine.js', 'utf8') + fs.readFileSync('demo.js', 'utf8') + ';this.mk=makeDemoPayload;this.me=makeDemoEnsemble;this.mn=makeDemoNowcast;', ctx);
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), SP = process.env.SP, built = fs.readFileSync('site/index.html', 'utf8');
// CSP du build AVEC Drive reproduite (tools/build.js ajoute ces deux origines à script-src quand une configuration Drive
// existe) : la page de test est construite sans configuration Drive. Aucune autre directive n'est modifiée.
const html = built.replace(/(script-src [^;]*)/, '$1 https://accounts.google.com/gsi/client https://apis.google.com');
const gsiCount = t => (t.match(/accounts\.google\.com\/gsi\/client/g) || []).length;
if (html === built || gsiCount(html) !== gsiCount(built) + 1) throw new Error('CSP de test : script-src introuvable');
const O = 'https://rc-geste.example', U = O + '/';
const CONFIG = { approved: true, clientId: '123456789012-gestefictif.apps.googleusercontent.com', apiKey: 'AIza' + 'C'.repeat(35), appId: '123456789012', raceOrigin: O, vaultOrigin: 'https://cv-geste.example' };
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
        if (host === 'tilecache.rainviewer.com' || host.endsWith('.arcgisonline.com') || host.endsWith('tile.openstreetmap.org')) return r.fulfill({ status: 200, contentType: 'image/png', body: PX });
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
      // Sans liaison confirmée : aucune préparation de Google (aucune bibliothèque demandée).
      await p.waitForTimeout(1500);
      expect(`${dev} · sans liaison confirmée : Google jamais préparé`, G.served === 0 && (await p.evaluate(() => DRIVE_UI.prep)) === 'idle', JSON.stringify({ served: G.served, prep: await p.evaluate(() => DRIVE_UI.prep) }));
      // Liaison confirmée fictive enregistrée sur l'appareil (même chemin que DriveSync), puis rechargement à froid.
      await activateJournal(p);
      const seeded = await p.evaluate(async () => {
        const provider = { disconnect() {}, async reserveId() { return 'f1'; }, async profiles() { return []; }, async uploadProfile(id, f, bytes) { return { fileId: id, bytes, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('') }; },
          async list() { return []; }, async download() { throw new Error('aucun'); }, async uploadRevision() { throw Object.assign(new Error('network'), { code: 'network' }); } };
        const sync = DriveSync.create({ vault: TWRC_VAULT, provider, version: () => 'prod-999' });
        sync.select({ folder: 'dossier-fictif', binding: 'a'.repeat(64) }); try { await sync.run(true); } catch (e) { /* envoi refusé : sans objet ici */ }
        sync.stop(); return DriveSync.resumeHint();
      });
      expect(`${dev} · contexte : liaison confirmée fictive enregistrée sur l’appareil`, !!seeded && seeded.folder === 'dossier-fictif', JSON.stringify(seeded));
      // ---------- Avant / pendant la préparation ----------
      let release; G.hold = { promise: new Promise(r => { release = r; }) };
      await p.reload(); await unlock();
      await p.waitForFunction(() => DRIVE_UI.hint && DRIVE_UI.prep === 'preparing', null, { timeout: 30000 }).catch(async e => { console.log('DIAG ' + JSON.stringify(await p.evaluate(() => ({ hint: DRIVE_UI.hint, prep: DRIVE_UI.prep, prepared: DRIVE_UI.prepared, cfg: !!DRIVE_UI.config, text: DRIVE_UI.text, session: !!DRIVE_UI.session })))); throw e; });
      const pre = await p.evaluate(() => { const b = document.getElementById('driveBadge'); return { key: b.dataset.key, aria: b.getAttribute('aria-label'), text: b.textContent }; });
      expect(`${dev} · rechargement à froid : Google préparé d’avance, badge « Préparation de Google… » (jamais « Reconnexion requise »), heure de copie présente`,
        pre.key === 'preparing' && /Préparation de Google…/.test(pre.aria) && !/Reconnexion requise/.test(pre.aria) && /copie non vérifiée|non vérifiée|\d\d:\d\d/.test(pre.text), JSON.stringify(pre));
      await p.evaluate(() => scrollTo(0, 0)); await p.locator('#driveBadge').click(); await p.waitForTimeout(300);
      const during = await p.evaluate(() => ({ calls: window.__gsi ? window.__gsi.calls : 0, settings: !!(document.getElementById('settings') || {}).open, text: DRIVE_UI.text }));
      expect(`${dev} · appui pendant la préparation : ni fenêtre ni panneau, message visible`, during.calls === 0 && !during.settings && /Préparation de Google…/.test(during.text), JSON.stringify(during));
      await p.evaluate(() => { const s = document.getElementById('settings'); s.open = true; renderSettings(true); });
      const btn = await p.evaluate(() => [...document.querySelectorAll('#driveSyncPanel button')].map(b => ({ t: b.textContent, d: b.disabled })));
      expect(`${dev} · panneau pendant la préparation : bouton « Préparation de Google… » désactivé, aucun bouton annonçant deux gestes`, btn.some(x => x.t === 'Préparation de Google…' && x.d) && !btn.some(x => x.t === 'Reconnecter Google Drive'), JSON.stringify(btn));
      // ---------- Après la préparation ----------
      release(); G.hold = null;
      await p.waitForFunction(() => DRIVE_UI.prepared === true && DRIVE_UI.prep === 'ready', null, { timeout: 30000 }); await p.waitForTimeout(200);
      await p.evaluate(() => { document.getElementById('settings').open = false; scrollTo(0, 0); renderDriveSync(); });
      const ready = await p.evaluate(() => document.getElementById('driveBadge').dataset.key);
      expect(`${dev} · Google prêt : badge « Reconnexion requise »`, ready === 'reconnect', ready);
      await p.locator('#driveBadge').click(); await p.waitForTimeout(400);
      const tap = await p.evaluate(() => ({ calls: window.__gsi.calls, gesture: window.__gsi.gesture.slice(), text: DRIVE_UI.text, busy: DRIVE_UI.busy }));
      expect(`${dev} · un seul appui sur le badge : autorisation demandée une fois, DANS le geste`, tap.calls === 1 && tap.gesture[0] === true, JSON.stringify(tap));
      expect(`${dev} · fenêtre bloquée : message visible, nouvel essai possible`, /fenêtre bloquée/.test(tap.text) && !tap.busy, JSON.stringify(tap));
      await p.evaluate(() => { const s = document.getElementById('settings'); s.open = true; renderSettings(true); });
      await p.locator('#driveSyncPanel button', { hasText: 'Reconnecter Google Drive' }).click(); await p.waitForTimeout(400);
      const tap2 = await p.evaluate(() => ({ calls: window.__gsi.calls, gesture: window.__gsi.gesture.slice() }));
      expect(`${dev} · un seul appui sur le bouton du panneau : autorisation demandée dans le geste`, tap2.calls === 2 && tap2.gesture[1] === true, JSON.stringify(tap2));
      // ---------- Préparation échouée : erreur visible, puis nouvel essai ----------
      G.mode = 'fail'; await p.reload(); await unlock();
      await p.waitForFunction(() => DRIVE_UI.prep === 'failed', null, { timeout: 40000 });
      const failed = await p.evaluate(() => ({ key: document.getElementById('driveBadge').dataset.key, aria: document.getElementById('driveBadge').getAttribute('aria-label'), text: DRIVE_UI.text }));
      expect(`${dev} · préparation échouée : erreur visible (badge et panneau), nouvel essai proposé`, failed.key === 'prepfail' && /impossible/.test(failed.aria) && /Réessayer la préparation de Google/.test(failed.text), JSON.stringify(failed));
      G.mode = 'ok'; await p.evaluate(() => scrollTo(0, 0)); await p.locator('#driveBadge').click();
      await p.waitForFunction(() => DRIVE_UI.prepared === true, null, { timeout: 30000 });
      const retried = await p.evaluate(() => ({ key: document.getElementById('driveBadge').dataset.key, calls: window.__gsi ? window.__gsi.calls : 0 }));
      expect(`${dev} · appui après l’échec : préparation relancée (aucune fenêtre ouverte hors préparation), puis « Reconnexion requise »`, retried.key === 'reconnect' && retried.calls === 0, JSON.stringify(retried));
      expect(`${dev} · aucune erreur JavaScript`, !errors.length, errors.join(' / '));
      await c.close();
    }
  } finally { await b.close(); }
  console.log(`\n${n} contrôle(s) conforme(s) · ${findings.length} écart(s)`);
  if (findings.length) { console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('❌ ' + e.message); if (findings.length) console.log('ÉCARTS :\n- ' + findings.join('\n- ')); process.exit(1); });
