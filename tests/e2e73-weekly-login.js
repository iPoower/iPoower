// Session locale 7 jours dans les vrais moteurs Chromium/WebKit : iPhone et PC, données fictives.
// Démontrer IDB non extractible, fermeture d'onglet, expiration, verrouillage explicite et refus.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors, U } = require('./lib/context-session');
const DAY = 86400000;
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
async function openAt(context, date) {
  const p = await context.newPage();
  await p.clock.install({ time: date });
  await p.goto(U);
  await p.waitForFunction(() => !!window.TWRC_VAULT && typeof LOCKED === 'function' && typeof S === 'object' &&
    (window.TWRC_VAULT.mode === 'locked' || window.TWRC_VAULT.mode === 'vault'));
  return p;
}
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-10T08:00:00+02:00', dev }), p = s.p;
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
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]);
        const q = await openAt(s.c, s.T0 + DAY);
        try { assert.equal(await q.evaluate(() => LOCKED()), true); assert.equal(await q.locator('#unlockPw').count(), 1); }
        finally { await q.close(); }
      });
      await check(dev + ' · case désactivée : ouverture suivante avec mot de passe', async () => {
        assert(await p.locator('#rememberWeek').isChecked());
        await p.locator('#rememberWeek').uncheck();
        const PW = require('node:fs').readFileSync('.passphrase', 'utf8').trim();
        await p.fill('#unlockPw', PW);
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
        assert.equal(await p.evaluate(() => LOCKED()), false);
        const q = await openAt(s.c, s.T0 + DAY);
        try { assert.equal(await q.evaluate(() => LOCKED()), true); assert.equal(await q.locator('#unlockPw').count(), 1); }
        finally { await q.close(); }
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
