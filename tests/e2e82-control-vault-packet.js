'use strict';
// Vrais WebCrypto Chromium/WebKit, deux profils isolés. Pas de Google/OAuth,
// ni d'import dans la PWA : le codec préparatoire ne modifie aucun écran.
const assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const BR = require('./lib/browser');
const { source, exportsSource, load, business, at, code } = require('./lib/control-vault-owner');
const fixture = business(load());
const nativeVault = ['device-storage','remember-device','session-vault'].map(n => fs.readFileSync(path.join(__dirname,'../src/'+n+'.js'),'utf8')).join('\n');
const U = 'https://race.fixture.test/';
let n = 0;
async function page(browser, iphone) {
  const context = await browser.newContext(iphone ? { viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true } : {});
  await context.route(U + '**', route => {
    if (route.request().url() === U + 'owner.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: source + exportsSource + nativeVault });
    return route.fulfill({ status: 200, contentType: 'text/html', headers: {
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }, body: '<!doctype html><html lang="fr"><title>Codec fictif RC</title><script src="/owner.js"></script><body>Codec fictif</body></html>' });
  });
  const p = await context.newPage();
  await p.goto(U); await p.waitForFunction(() => !!window.owner);
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
  return { p, context };
}
(async () => {
  const browser = await BR.launch();
  try {
    const pc = await page(browser, false), phone = await page(browser, true);
    const packet = await pc.p.evaluate(async ({ data, code, at }) => Array.from(await window.codec.seal(data, code, 'prod-156', at)), { data: fixture.data, code, at });
    const reference = createHash('sha256').update(Buffer.from(packet)).digest('hex');
    const read = p => p.evaluate(async ({ packet, code, reference }) => window.codec.open(new Uint8Array(packet), code, 'prod-156', reference), { packet, code, reference });
    assert.deepEqual(await read(phone.p), fixture.data); n++; console.log('✅ PC → octets opaques → profil iPhone : 120 trajets, anciens retours et versions identiques');
    const failures = await phone.p.evaluate(async ({ packet, code }) => {
      const result = [];
      for (const [bytes, pass, version] of [[packet, 'autre-code-fictif', 'prod-156'], [packet, code, 'prod-9'], [packet, code, null]]) {
        try { await window.codec.open(new Uint8Array(bytes), pass, version); result.push('unexpected'); } catch (e) { result.push(e.code); }
      }
      const e = JSON.parse(new TextDecoder().decode(new Uint8Array(packet))); e.appVersion = 'prod-155';
      try { await window.codec.open(new TextEncoder().encode(JSON.stringify(e)), code, 'prod-156'); result.push('unexpected'); }
      catch (e) { result.push(e.code); }
      return result;
    }, { packet, code });
    assert.deepEqual(failures, ['AUTHENTICATION_FAILED', 'PRODUCER_TOO_NEW', 'UNKNOWN_READER_VERSION', 'AUTHENTICATION_FAILED']);
    n++; console.log('✅ iPhone : code, producteur futur, lecteur inconnu et AAD refusés');
    await pc.context.close(); await phone.context.close();
    const reopened = await page(browser, true);
    assert.deepEqual(await read(reopened.p), fixture.data);
    assert.deepEqual(await reopened.p.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    await reopened.context.close(); n++; console.log('✅ fermeture des profils puis déchiffrement sans clé ni session Control Vault');
    // NOESIS-RC-004 : recovery requires a new empty origin and a new durable
    // local vault; merely decrypting the packet is not a restore.
    const virgin = await page(browser, true);
    const first = await virgin.p.evaluate(async ({ packet, code, reference }) => {
      if (localStorage.length !== 0 || sessionStorage.length !== 0)
        throw Error('The supposedly virgin device has existing storage');
      const data = await window.codec.open(new Uint8Array(packet), code, 'prod-156', reference);
      const plan = window.owner.B.restorePlan(data, Date.parse(data.at));
      if (!plan || !plan.writes || !plan.writes['twrc.debrief.archive.v1'])
        throw Error('Owner restore plan is not complete');
      const app = SessionVault.create({raw:localStorage,session:sessionStorage,crypto,target:window,remembered:RememberDevice});
      await app.boot();
      if (app.mode !== 'plain') throw Error('Expected empty initial profile');
      await app.unlock(code,plan.writes,false);
      const snapshot = await app.syncSnapshot();
      const expectedKeys=Object.keys(plan.writes).filter(k => SessionVault.secret(k));
      for (const key of expectedKeys) if (snapshot.values[key] !== plan.writes[key])
        throw Error('Durable value mismatch for '+key);
      return { expectedKeys, values:Object.fromEntries(expectedKeys.map(k=>[k,snapshot.values[k]])),
        journal:JSON.parse(snapshot.values['twrc.debrief.archive.v1']).records.length,
        cars:JSON.parse(snapshot.values['twrc.settings.v1']).cars.length,
        encrypted:!!localStorage.getItem(SessionVault.VAULT),
        codePersisted:localStorage.getItem(SessionVault.VAULT).includes(code) };
    }, { packet, code, reference });
    assert.equal(first.journal,122,'all historical and live trip records must survive');
    assert.equal(first.cars,1);
    assert(first.encrypted && !first.codePersisted,'restored state must be encrypted at rest');
    const persisted=await virgin.p.evaluate(()=>localStorage.getItem(SessionVault.VAULT));
    assert(persisted && !persisted.includes('synthetic-owner-code'));
    await virgin.p.reload();
    const after=await virgin.p.evaluate(async ({code})=>{
      const app=SessionVault.create({raw:localStorage,session:sessionStorage,crypto,target:window,remembered:RememberDevice});
      await app.boot(); if(app.mode!=='vault') await app.unlock(code);
      const snapshot=await app.syncSnapshot();
      return {values:snapshot.values,journal:JSON.parse(snapshot.values['twrc.debrief.archive.v1']).records.length};
    }, {code});
    for(const key of first.expectedKeys) assert.equal(after.values[key],first.values[key],'reload preserved '+key);
    assert.equal(after.journal,122);
    await virgin.context.close();
    n++; console.log('✅ nouvel appareil vierge : import V2 réel dans SessionVault, relecture chiffrée et 122 archives après redémarrage');
    console.log(n + '/' + n + ' scénarios OK · moteur ' + BR.NAME + ', iPhone émulé uniquement');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
