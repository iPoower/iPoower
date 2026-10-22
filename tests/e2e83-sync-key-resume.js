'use strict';
// Lot D1 : vraie persistance IndexedDB d'une CryptoKey non extractible dans
// Chromium/WebKit. Deux profils isolés PC/iPhone, onglets fermés puis rouverts
// SANS ressaisie du code. Aucun Google, réseau ou écran de la PWA.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const BR = require('./lib/browser');
const { source, exportsSource, load, business, at, code } = require('./lib/control-vault-owner');
const keySource = fs.readFileSync(path.join(__dirname, '../src/sync-key.js'), 'utf8');
const fixture = business(load());
const U = 'https://race.fixture.test/';
let n = 0;
async function profile(browser, iphone) {
  const context = await browser.newContext(iphone ? { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true } : {});
  await context.route(U + '**', route => {
    if (route.request().url() === U + 'owner.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: source + exportsSource + '\n' + keySource + ';window.SyncKey=SyncKey;' });
    return route.fulfill({ status: 200, contentType: 'text/html', headers: {
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }, body: '<!doctype html><html lang="fr"><title>Clé fictive RC</title><script src="/owner.js"></script><body>Clé fictive</body></html>' });
  });
  return context;
}
// Chaque appel ouvre un NOUVEL onglet : rien en mémoire ne survit, seul IndexedDB.
async function tab(context) {
  const p = await context.newPage();
  await p.goto(U); await p.waitForFunction(() => !!window.owner && !!window.SyncKey);
  await p.evaluate(() => {
    const { P, B, C, J } = window.owner;
    window.codec = P.create({ validateBusiness(data) {
      if (!C.validateTyreExtensions(data.settings)) return false;
      if (data.v === 2) {
        const c = data.durable?.context;
        if (!c || c.gps !== null || c.tripStart !== null || c.debrief?.active !== null) return false;
        J.read(c.debrief.archive);
      }
      return !!B.restorePlan(data, Date.parse(data.at));
    } });
  });
  return p;
}
(async () => {
  const browser = await BR.launch();
  try {
    const pc = await profile(browser, false), phone = await profile(browser, true);
    // Saisie du code sur le PC : création du descripteur public et mémorisation.
    let p = await tab(pc);
    const descriptor = await p.evaluate(async ({ code, at }) => {
      const { descriptor, handle } = await SyncKey.create(code, crypto, at);
      await SyncKey.storage().remember(handle, 'device', Date.now() + 7 * 864e5);
      return descriptor;
    }, { code, at });
    await p.close();
    p = await tab(pc);
    const packet = await p.evaluate(async ({ descriptor, data, at }) => {
      const handle = await SyncKey.storage().resume(descriptor, 'device');
      if (!handle) throw new Error('reprise PC impossible');
      return Array.from(await codec.sealWith(data, handle, 'prod-156', at));
    }, { descriptor, data: fixture.data, at });
    await p.close();
    n++; console.log('✅ PC : onglet fermé puis rouvert, paquet chiffré sans ressaisie du code');

    p = await tab(phone);
    await p.evaluate(async ({ descriptor, code }) => {
      let refused = false;
      try { await SyncKey.derive(descriptor, 'autre-code-fictif', crypto); } catch (e) { refused = e.code === 'AUTHENTICATION_FAILED'; }
      if (!refused) throw new Error('mauvais code accepté');
      await SyncKey.storage().remember(await SyncKey.derive(descriptor, code, crypto), 'device', Date.now() + 7 * 864e5);
    }, { descriptor, code });
    await p.close();
    p = await tab(phone);
    const phoneResult = await p.evaluate(async ({ descriptor, packet, at }) => {
      const handle = await SyncKey.storage().resume(descriptor, 'device');
      const data = await codec.openWith(new Uint8Array(packet), handle, 'prod-156');
      const back = Array.from(await codec.sealWith(data, handle, 'prod-156', at));
      // Contenu brut de la base : aucune trace du code, clé non exportable.
      const row = await new Promise((resolve, reject) => {
        const req = indexedDB.open('twrc.sync-key.v1');
        req.onsuccess = () => { const g = req.result.transaction('records').objectStore('records').get('sync:device');
          g.onsuccess = () => { resolve(g.result); req.result.close(); }; g.onerror = reject; };
        req.onerror = reject;
      });
      let exported = false;
      try { await crypto.subtle.exportKey('raw', row.key); exported = true; } catch (e) { /* attendu */ }
      return { data, back, exported, extractable: row.key.extractable, fields: Object.keys(row).sort(), local: localStorage.length, session: sessionStorage.length };
    }, { descriptor, packet, at });
    assert.deepEqual(phoneResult.data, fixture.data);
    assert.equal(phoneResult.data.durable.context.debrief.archive.records.length, 122);
    assert.deepEqual([phoneResult.exported, phoneResult.extractable, phoneResult.local, phoneResult.session], [false, false, 0, 0]);
    assert.deepEqual(phoneResult.fields, ['a', 'e', 'key', 'keyId', 's', 'v']);
    await p.close();
    n++; console.log('✅ iPhone : une saisie, onglet rouvert, paquet PC lu sans code ; clé non exportable, aucun stockage web');

    p = await tab(pc);
    const pcResult = await p.evaluate(async ({ descriptor, back, code }) => {
      const handle = await SyncKey.storage().resume(descriptor, 'device');
      const synced = await codec.openWith(new Uint8Array(back), handle, 'prod-156');
      const manual = await codec.open(new Uint8Array(back), code, 'prod-156');
      await SyncKey.storage().revoke();
      return { synced, manual, after: await SyncKey.storage().resume(descriptor, 'device') };
    }, { descriptor, back: phoneResult.back, code });
    assert.deepEqual(pcResult.synced, fixture.data); assert.deepEqual(pcResult.manual, fixture.data); assert.equal(pcResult.after, null);
    await p.close();
    p = await tab(pc);
    assert.equal(await p.evaluate(async d => SyncKey.storage().resume(d, 'device'), descriptor), null);
    n++; console.log('✅ PC : retour iPhone lu sans code, lecture manuelle intacte ; verrouillage → code requis après réouverture');
    await pc.close(); await phone.close();
    console.log(n + '/' + n + ' scénarios OK · moteur ' + BR.NAME + ', iPhone émulé uniquement');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
