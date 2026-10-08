// Verrouillage réel de l'appareil (audit A01) et import de sauvegarde sans faux succès (audit A02), dans le vrai navigateur.
// Données fictives des fixtures uniquement. Vrai déverrouillage par le formulaire, vrai clic « Verrouiller cet appareil ».
'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), crypto = require('crypto');
const { session, BR, errors } = require('./lib/context-session');
const PW = fs.readFileSync('.passphrase', 'utf8').trim();
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const reloadUnlock = async (s, p) => { await p.fill('#unlockPw', PW); await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]); await s.settle(10); };
function seal(data) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), it = 600000, k = crypto.pbkdf2Sync(PW, salt, it, 32, 'sha256');
  const e = crypto.createCipheriv('aes-256-gcm', k, iv), c = Buffer.concat([e.update(JSON.stringify(data)), e.final(), e.getAuthTag()]);
  return Buffer.from(JSON.stringify({ app: 'twrc-backup', v: data.v, kdf: 'PBKDF2-SHA256', it, s: salt.toString('base64'), i: iv.toString('base64'), c: c.toString('base64') }));
}
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-08T07:00:00+02:00', dev }), p = s.p, urls = [];
      p.on('request', r => { if (/open-meteo|osrm|bigdatacloud|nominatim|geopf/.test(r.url())) urls.push(r.url()); });
      // empreinte personnelle des fixtures (lieux, voiture) + une entrée de journal et un contexte
      const me = await p.evaluate(() => {
        USER_STORE.state.debrief.entries.unshift({ key: 'journal-fictif', at: Date.now() - 3600e3, how: 'auto', name: 'Trajet fictif', from: 'home', to: 'work', feedback: { at: Date.now() - 3000e3, conditions: [], grip: 'normal' } });
        USER_STORE.flush(); saveSettings();
        return { names: S.locs.map(l => l.name), coords: S.locs.map(l => [String(l.lat), String(l.lon)]), car: S.cars[0].name };
      });
      const leaks = () => p.evaluate(({ names, coords, car }) => {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = localStorage.getItem(k); if (k === 'twrc.vault.v1') continue;
          const num = x => new RegExp('(^|[^0-9.])' + x.replace('.', '\\.') + '([^0-9]|$)').test(v);
          if (names.some(x => v.includes(x)) || coords.some(([a, o]) => num(a) && num(o)) || v.includes(car)) out.push(k); }
        return out;
      }, me);
      assert((await leaks()).length > 0, 'précondition : données personnelles fictives présentes avant verrouillage');
      await check(dev + ' · « Verrouiller cet appareil » : rechargé verrouillé, plus aucune donnée personnelle en clair', async () => {
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]); await s.settle(8);
        assert.equal(await p.evaluate(() => LOCKED()), true); assert.equal(await p.locator('#unlockPw').count(), 1);
        assert.deepEqual(await leaks(), []); assert.equal(await p.evaluate(() => localStorage.getItem('twrc.key')), null);
        assert(await p.evaluate(() => !!localStorage.getItem('twrc.vault.v1')));
      });
      await check(dev + ' · verrouillé : ni lieux, ni voiture, ni journal chargés ; aucune requête vers les lieux personnels', async () => {
        const st = await p.evaluate(() => ({ names: S.locs.map(l => l.name), car: S.cars[0].name, journal: USER_STORE.state.debrief.entries.length }));
        assert(!st.names.some(x => me.names.includes(x)), JSON.stringify(st)); assert.notEqual(st.car, me.car); assert.equal(st.journal, 0);
        urls.length = 0; await s.settle(14);
        assert(!urls.some(u => me.coords.some(([a, o]) => u.includes('latitude=' + a) && u.includes('longitude=' + o))), urls.join('\n'));
      });
      await check(dev + ' · déverrouillage avec le code : lieux, voiture et journal reviennent à l’identique, coffre supprimé', async () => {
        await reloadUnlock(s, p);
        const st = await p.evaluate(() => ({ names: S.locs.map(l => l.name), car: S.cars[0].name, journal: USER_STORE.state.debrief.entries.some(e => e.key === 'journal-fictif'), vault: !!localStorage.getItem('twrc.vault.v1'), locked: LOCKED() }));
        assert.deepEqual(st.names, me.names); assert.equal(st.car, me.car); assert.equal(st.journal, true); assert.equal(st.vault, false); assert.equal(st.locked, false);
      });
      await check(dev + ' · import refusé par le stockage : message d’échec, aucun rechargement, réglages et journal intacts', async () => {
        const before = await p.evaluate(() => localStorage.getItem('twrc.settings.v1'));
        const settings = await p.evaluate(() => JSON.parse(JSON.stringify({ ...S, locs: S.locs.map(l => ({ ...l, name: l.name + ' importé' })) })));
        await p.evaluate(() => { const set = Storage.prototype.setItem; window.__denyCtx = true;
          Storage.prototype.setItem = function (k, v) { if (window.__denyCtx && k === 'twrc.context.v1') throw new DOMException('refus', 'QuotaExceededError'); return set.call(this, k, v); };
          const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        const file = seal({ app: 'twrc', v: 2, at: new Date().toISOString(), settings, view: 'pneus', durable: { context: { debrief: { entries: [] } }, tyreTherm: {}, tripCancel: {} } });
        if (await p.$('#bkPw')) await p.fill('#bkPw', PW);
        p.once('dialog', d => d.accept());
        let navigated = false; p.once('framenavigated', () => { navigated = true; });
        await p.setInputFiles('#bkFile', { name: 'sauvegarde-fictive.json', mimeType: 'application/json', buffer: file });
        await p.waitForFunction(() => /Import impossible|Import interrompu/.test((document.getElementById('bkMsg') || {}).textContent || ''), null, { timeout: 30000 });
        await s.settle(4);
        const st = await p.evaluate(() => ({ msg: document.getElementById('bkMsg').textContent, settings: localStorage.getItem('twrc.settings.v1'), journal: JSON.parse(localStorage.getItem('twrc.context.v1')).debrief.entries.some(e => e.key === 'journal-fictif') }));
        await p.evaluate(() => { window.__denyCtx = false; });
        assert.match(st.msg, /Import impossible .*rien n’a été modifié/); assert.equal(st.settings, before, 'anciens réglages conservés'); assert.equal(st.journal, true); assert.equal(navigated, false);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
