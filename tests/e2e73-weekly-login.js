// Session locale 7 jours dans les vrais moteurs Chromium/WebKit : iPhone et PC, données fictives.
// Démontrer IDB non extractible, fermeture d'onglet, expiration, verrouillage explicite et refus.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors, U } = require('./lib/context-session');
const DAY = 86400000;
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const ready = p => p.waitForFunction(() => typeof LOCKED === 'function' && !!window.TWRC_VAULT && typeof S === 'object',
  null, { polling: 100, timeout: 15000 });
const unlocked = p => p.waitForFunction(() => typeof LOCKED === 'function' && !!window.TWRC_VAULT &&
  window.TWRC_VAULT.mode === 'vault' && !LOCKED(), null, { polling: 100, timeout: 15000 });
async function openAt(context, date) {
  const p = await context.newPage();
  // Playwright partage l'horloge entre toutes les pages du contexte. Installer
  // plusieurs horloges enregistrait des dates contradictoires au rechargement.
  await p.clock.setSystemTime(date);
  await p.goto(U);
  await p.waitForFunction(() => !!window.TWRC_VAULT && typeof LOCKED === 'function' && typeof S === 'object' &&
    (window.TWRC_VAULT.mode === 'locked' || window.TWRC_VAULT.mode === 'vault'));
  return p;
}
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-10T08:00:00+02:00', dev, remember: true }), p = s.p;
      const initial = await p.evaluate(() => ({ name: S.cars[0].name, locked: LOCKED(), vault: window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT) }));
      assert.equal(initial.locked, false); assert(initial.vault);
      await check(dev + ' · case de maintien : clé AES-GCM non extractible dans IndexedDB, aucune donnée en clair', async () => {
        const state = await p.evaluate(async () => {
          const db = await new Promise((resolve, reject) => { const r = indexedDB.open('twrc.remember-device.v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
          const item = await new Promise((resolve, reject) => {
            const t = db.transaction('records', 'readonly'), r = t.objectStore('records').get('device');
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
          });
          db.close();
          return { present: !!item, extractable: item && item.wrappingKey.extractable, ttl: item && item.exp - item.at, raw: JSON.stringify({ cipher: item.cipher, iv: item.iv }), session: sessionStorage.getItem('twrc.session.v2') };
        });
        assert(state.present, 'autorisation sauvegardée');
        assert.equal(state.extractable, false);
        assert.equal(state.ttl, 7 * DAY);
        assert(!state.raw.includes('code-fictif') && !state.raw.includes('twrc.key'));
        assert(state.session && !state.session.includes('code-fictif'));
        assert.equal(await p.evaluate(() => window.TWRC_RAW_STORAGE.getItem('twrc.key')), null);
      });
      await check(dev + ' · nouvel onglet 24 h après : pas de code et données intactes', async () => {
        const q = await openAt(s.c, s.T0 + DAY);
        try {
          assert.equal(await q.evaluate(() => TWRC_VAULT.mode), 'vault');
          assert.equal(await q.locator('#unlockPw').count(), 0);
          assert.equal(await q.evaluate(() => S.cars[0].name), initial.name);
        } finally { await q.close(); }
      });
      await check(dev + ' · huitième jour : demande le code sans effacer le coffre', async () => {
        const q = await openAt(s.c, s.T0 + 8 * DAY);
        try {
          assert.equal(await q.evaluate(() => LOCKED()), true);
          assert.equal(await q.locator('#unlockPw').count(), 1);
          assert.equal(await q.evaluate(() => !!window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)), true);
        } finally { await q.close(); }
      });
      await check(dev + ' · verrouiller manuellement interdit toute réouverture sans code', async () => {
        // Le scénario « huitième jour » ci-dessus ouvre un autre onglet avec une date future.
        // L'onglet initial reçoit le signal d'expiration au retour : il ne doit PAS exposer
        // le bouton de verrouillage de l'interface derrière l'écran bloquant.
        // Reconnecter dans l'écran de récupération avant de tester le verrouillage manuel.
        const PW = require('node:fs').readFileSync('.passphrase', 'utf8').trim();
        // Après le saut temporel, le coffre peut être expiré sans que le modal ait
        // encore été affiché. Forcer le contrôle, puis réauthentifier si nécessaire.
        await p.evaluate(() => { if (typeof checkSessionExpiry === 'function') checkSessionExpiry(); });
        if (await p.locator('#twrcExpiryOverlay').count()) {
          await p.locator('#twrcExpiryPassword').fill(PW);
          await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('#twrcExpiryForm button[type=submit]').click()]);
          await s.settle(4);
        } else if (await p.evaluate(() => LOCKED())) {
          await p.fill('#unlockPw', PW);
          await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('#unlockForm button[type=submit]').click()]);
          await s.settle(4);
        }
        assert.equal(await p.evaluate(() => LOCKED()), false, 'le coffre doit être ouvert avant verrouillage manuel');
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        await p.locator('[data-act=lock]').waitFor({ state: 'visible', timeout: 5000 });
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]);
        await ready(p);
        const q = await openAt(s.c, await p.evaluate(() => Date.now()));
        try { assert.equal(await q.evaluate(() => LOCKED()), true); assert.equal(await q.locator('#unlockPw').count(), 1); }
        finally { await q.close(); }
      });
      await check(dev + ' · case désactivée : ouverture suivante avec mot de passe', async () => {
        assert.equal(await p.locator('#rememberWeek').isChecked(), false, 'la conservation reste volontaire');
        const PW = require('node:fs').readFileSync('.passphrase', 'utf8').trim();
        await p.fill('#unlockPw', PW);
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
        // A WebKit navigation can resolve before the async vault unseal has completed.
        // Do not treat "loaded but still locked" as successful authorization.
        await unlocked(p);
        assert.equal(await p.evaluate(() => LOCKED()), false);
        const q = await openAt(s.c, await p.evaluate(() => Date.now()) + DAY);
        try { assert.equal(await q.evaluate(() => LOCKED()), true); assert.equal(await q.locator('#unlockPw').count(), 1); }
        finally { await q.close(); }
      });
      await check(dev + ' · session locale corrompue : écran de code au lieu d’un crash', async () => {
        await p.evaluate(() => {
          const key = 'twrc.session.v2', ses = JSON.parse(sessionStorage.getItem(key));
          ses.k = '!!base64-invalide!!';
          sessionStorage.setItem(key, JSON.stringify(ses));
        });
        await p.reload(); await ready(p); await s.settle(4);
        assert.equal(await p.evaluate(() => LOCKED()), true);
        assert.equal(await p.locator('#unlockPw').count(), 1);
      });
      await check(dev + ' · expiration sur la même page : coffre illisible et écran bloquant', async () => {
        const PW = require('node:fs').readFileSync('.passphrase', 'utf8').trim();
        await p.fill('#unlockPw', PW);
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
        await ready(p);
        assert.equal(await p.evaluate(() => LOCKED()), false);
        // L'expiration est calculée depuis la DERNIÈRE saisie du code.
        // Après les scénarios de verrouillage et de reconnexion, l'échéance
        // n'est plus nécessairement T0 + 7 jours : utiliser celle du coffre.
        const expiresAt = await p.evaluate(() => window.TWRC_VAULT.expiresAt);
        assert(expiresAt > 0, 'une échéance de session doit exister');
        await p.clock.setFixedTime(expiresAt + 1000);
        const result = await p.evaluate(() => {
          checkSessionExpiry();
          const v = window.TWRC_VAULT;
          const oldValue = localStorage.getItem('twrc.settings.v1');
          let refused = false;
          try { localStorage.setItem('twrc.settings.v1', 'new-secret-after-expiration'); }
          catch (e) { refused = e.expired === true; }
          return {
            mode: v.mode, locked: LOCKED(), refused, oldValue,
            hidden: document.body.classList.contains('twrc-session-expired'),
            overlay: !!document.getElementById('twrcExpiryOverlay'),
            persisted: window.TWRC_RAW_STORAGE.getItem('twrc.settings.v1')
          };
        });
        assert.equal(result.mode, 'expired');
        assert.equal(result.locked, true);
        assert.equal(result.refused, true);
        assert.equal(result.oldValue, null);
        assert.equal(result.hidden, true);
        assert.equal(result.overlay, true);
        assert.equal(result.persisted, null);
        assert(await p.locator('#twrcExpiryPassword').isVisible());
        assert.equal(await p.locator('#twrcExpiryRemember').isChecked(), false);
      });
      await check(dev + ' · déverrouillage depuis l’écran expiré : coffre et voiture récupérés', async () => {
        const PW = require('node:fs').readFileSync('.passphrase', 'utf8').trim();
        await p.locator('#twrcExpiryPassword').fill(PW);
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('#twrcExpiryForm button[type=submit]').click()]);
        await ready(p); await s.settle(6);
        assert.equal(await p.evaluate(() => LOCKED()), false);
        assert.equal(await p.evaluate(() => S.cars[0].name), initial.name);
        assert.equal(await p.locator('#twrcExpiryOverlay').count(), 0);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
