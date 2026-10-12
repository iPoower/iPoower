'use strict';
// Attaques exclusivement fictives. Le test d'origine prouve la limite actuelle,
// pas une migration effective. Aucun site réel n'est interrogé.
const assert = require('node:assert/strict'), { setTimeout: wait } = require('node:timers/promises');
const { session, BR, errors, U } = require('./lib/context-session');
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-10T08:00:00+02:00', dev, remember: true }), p = s.p;
      try {
        await check(dev + ' · Leaflet local réellement chargé et CSP normale sans violation', async () => {
          await p.evaluate(() => loadLeaflet());
          assert.equal(await p.evaluate(() => !!window.L?.map), true);
          const script = await p.evaluate(() => [...document.scripts].find(x => x.src.includes('vendor/leaflet/leaflet.js'))?.src);
          assert(script && new URL(script).origin === new URL(U).origin); assert.deepEqual(await p.evaluate(() => window.__csp), []);
        });
        await check(dev + ' · saisie utilisateur hostile : nom conservé comme texte, aucune injection', async () => {
          const payload = '<img id="rc-xss" src="x" onerror="window.__userXss=true">';
          await p.evaluate(() => { document.querySelector('#settings').open = true; renderSettings(true); });
          await p.locator('[data-bind="cars.0.name"]').fill(payload);
          await p.locator('[data-bind="cars.0.name"]').dispatchEvent('change'); await s.settle(4);
          await p.evaluate(() => renderAll());
          assert.equal(await p.locator('#rc-xss').count(), 0); assert.equal(await p.evaluate(() => !!window.__userXss), false);
          assert.equal(await p.evaluate(() => S.cars[0].name), payload, 'aucune suppression silencieuse de la saisie');
        });
        await check(dev + ' · scripts non approuvés inline, CDN et same-origin bloqués par le navigateur', async () => {
          await s.c.route('**/hostile-fortress.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.__unsigned=true' }));
          await p.evaluate(() => {
            for (const url of [null, 'https://unpkg.com/hostile-fortress.js', new URL('hostile-fortress.js', location.href).href]) {
              const script = document.createElement('script'); if (url) script.src = url; else script.textContent = 'window.__unsigned=true'; document.body.appendChild(script);
            }
          });
          await wait(300); await p.clock.runFor(100);
          const state = await p.evaluate(() => ({ executed: !!window.__unsigned, violations: window.__csp }));
          assert.equal(state.executed, false); assert(state.violations.some(x => x.includes('inline'))); assert(state.violations.some(x => x.includes('unpkg.com'))); assert(state.violations.some(x => x.includes('hostile-fortress.js')));
        });
        await check(dev + ' · partage d’origine démontré : application voisine lit stockage et invoque la clé mémorisée', async () => {
          const other = await s.c.newPage();
          try {
            const url = 'https://ipoower.github.io/Reconversion-Control/fixture-fortress.html';
            await s.c.route(url, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture origine</title>' })); await other.goto(url);
            const state = await other.evaluate(async () => {
              const vault = JSON.parse(localStorage.getItem('twrc.vault.v2'));
              const db = await new Promise((resolve, reject) => { const r = indexedDB.open('twrc.remember-device.v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
              const device = await new Promise((resolve, reject) => { const r = db.transaction('records', 'readonly').objectStore('records').get('device'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close();
              const decode = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
              const aad = new TextEncoder().encode(JSON.stringify({ v: 1, s: device.s, l: device.l, at: device.at, exp: device.exp }));
              const bits = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(device.iv), additionalData: aad }, device.wrappingKey, decode(device.cipher));
              const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
              const data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(vault.i) }, key, decode(vault.c))));
              return { read: !!vault, nonextractable: !device.wrappingKey.extractable, decrypted: typeof data.values['twrc.settings.v1'] === 'string' };
            });
            assert.equal(state.read, true); assert.equal(state.nonextractable, true); assert.equal(state.decrypted, true, 'un CryptoKey non extractible ne constitue pas une isolation de même origine');
          } finally { await other.close(); }
        });
        await check(dev + ' · origine distincte fictive : stockage et autorisation de Race Control absents', async () => {
          const separate = await s.c.newPage();
          try {
            const url = 'https://rc-isolation.invalid/fixture.html'; await s.c.route(url, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture séparée</title>' })); await separate.goto(url);
            assert.equal(await separate.evaluate(() => localStorage.getItem('twrc.vault.v2')), null);
            const empty = await separate.evaluate(async () => {
              const db = await new Promise((resolve, reject) => { const r = indexedDB.open('twrc.remember-device.v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('records'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
              const count = await new Promise((resolve, reject) => { const r = db.transaction('records').objectStore('records').count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); db.close(); return count;
            }); assert.equal(empty, 0);
          } finally { await separate.close(); }
        });
      } finally { await s.c.close(); }
      const tampered = await session(browser, { at: '2026-10-10T08:00:00+02:00', dev, asset: (file, bytes) => file === 'leaflet.js' ? Buffer.concat([bytes, Buffer.from(';window.__tampered=true;')]) : bytes });
      try {
        await check(dev + ' · SRI réel : bibliothèque altérée refusée sans exécuter le payload', async () => {
          const refused = await tampered.p.evaluate(() => loadLeaflet().then(() => false, () => true)); assert.equal(refused, true);
          assert.equal(await tampered.p.evaluate(() => !!window.__tampered), false); assert.equal(await tampered.p.evaluate(() => !!window.L?.map), false);
        });
      } finally { await tampered.c.close(); }
    }
    await check('aucune exception JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(`${n}/${n} scénarios OK`);
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e.stack || e)); process.exit(1); });
