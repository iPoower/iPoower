// Sécurité V1 dans le vrai navigateur (iPhone et PC) : migration d'un ancien profil EN CLAIR sans perte, aucune donnée sensible
// au repos (stockage réel lu par Playwright, indépendant du JavaScript de la page), bon/mauvais code, rechargement, réouverture,
// verrouillage, aucune violation de la politique de sécurité du contenu. Fixtures fictives uniquement.
'use strict';
const assert = require('node:assert/strict'), fs = require('fs');
const { session, BR, errors } = require('./lib/context-session');
const PW = fs.readFileSync('.passphrase', 'utf8').trim(), ORIGIN = 'https://ipoower.github.io';
let n = 0, stage = ''; const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const rawOf = async c => Object.fromEntries(((await c.storageState()).origins.find(o => o.origin === ORIGIN) || { localStorage: [] }).localStorage.map(x => [x.name, x.value]));
const submit = async (s, code) => { await s.p.fill('#unlockPw', code); await Promise.all([s.p.waitForNavigation({ timeout: 60000 }), s.p.click('#unlockForm button[type=submit]')]); await s.settle(8); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      // 1. profil de référence : déverrouillé, réglages + journal fictifs, puis exporté dans l'ANCIEN format (tout en clair)
      const ref = await session(b, { at: '2026-10-08T07:00:00+02:00', dev });
      await ref.p.evaluate(() => { USER_STORE.state.debrief.entries.unshift({ key: 'journal-fictif-secu', at: Date.now() - 3600e3, how: 'auto', name: 'Trajet fictif', from: 'home', to: 'work', feedback: { at: Date.now() - 3000e3, conditions: [], grip: 'normal' } }); USER_STORE.flush(); saveSettings(); });
      const legacy = await ref.p.evaluate(() => { const o = {}; Object.keys(localStorage).filter(k => k.startsWith('twrc.')).forEach(k => { o[k] = localStorage.getItem(k); }); return o; });
      const me = await ref.p.evaluate(() => ({ names: S.locs.map(l => l.name), car: S.cars[0].name }));
      await ref.c.close();
      assert(legacy['twrc.key'] && legacy['twrc.plain'] && legacy['twrc.settings.v1'] && /journal-fictif-secu/.test(legacy['twrc.context.v1']), 'ancien profil complet');
      const SENS = [PW, ...me.names, me.car, 'journal-fictif-secu'];
      const leaks = raw => Object.entries(raw).filter(([k, v]) => k !== 'twrc.vault.v2' && (k === 'twrc.key' || k === 'twrc.plain' || k === 'twrc.settings.v1' || k === 'twrc.context.v1' || SENS.some(x => v.includes(x)))).map(([k]) => k);

      // 2. appareil de Bryan simulé : ancien profil en clair → première ouverture de la nouvelle version
      const s = await session(b, { at: '2026-10-08T07:05:00+02:00', dev, unlock: false, seed: legacy }); const p = s.p;
      await check(dev + ' · migration automatique : coffre vérifié, données identiques, plus aucune copie lisible', async () => {
        const st = await p.evaluate(() => ({ mode: window.TWRC_VAULT.mode, migrated: window.TWRC_VAULT.migrated, locked: LOCKED(), names: S.locs.map(l => l.name), car: S.cars[0].name,
          journal: USER_STORE.state.debrief.entries.some(e => e.key === 'journal-fictif-secu'), values: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('twrc.')).map(k => [k, localStorage.getItem(k)])) }));
        assert.equal(st.mode, 'vault'); assert.equal(st.migrated, true); assert.equal(st.locked, false);
        assert.deepEqual(st.names, me.names); assert.equal(st.car, me.car); assert.equal(st.journal, true);
        for (const k of ['twrc.key', 'twrc.plain', 'twrc.plain.v', 'twrc.settings.v1']) assert.equal(st.values[k], legacy[k], 'valeur identique : ' + k);
        const raw = await rawOf(s.c); assert.deepEqual(leaks(raw), []); assert(raw['twrc.vault.v2']);
        assert.match(await p.locator('#notice').innerText(), /DONNÉES CHIFFRÉES SUR CET APPAREIL/);
      });
      await check(dev + ' · session déverrouillée : rien de sensible au repos, sessionStorage limité à la clé de session', async () => {
        await p.evaluate(() => { S.cars[0].name = S.cars[0].name + ''; saveSettings(); }); await s.settle(4);
        assert.deepEqual(leaks(await rawOf(s.c)), []);
        const ses = await p.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('twrc.')));
        assert.deepEqual(ses, ['twrc.session.v2']); const key = await p.evaluate(() => sessionStorage.getItem('twrc.session.v2'));
        assert(!SENS.some(x => key.includes(x)), 'clé de session : aucun code ni donnée personnelle'); assert.match(JSON.parse(key).k, /^[A-Za-z0-9+/=]{44}$/);
      });
      await check(dev + ' · rechargement : pas de code redemandé, données identiques', async () => {
        await p.reload(); await s.settle(8);
        assert.equal(await p.locator('#unlockPw').count(), 0); assert.equal(await p.evaluate(() => S.cars[0].name), me.car);
      });
      await check(dev + ' · réouverture (nouvelle fenêtre) : code demandé, aucune donnée personnelle chargée', async () => {
        const q = await s.c.newPage(); await q.goto(require('./lib/context-session').U); for (let i = 0; i < 8; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); }
        assert.equal(await q.locator('#unlockPw').count(), 1);
        const st = await q.evaluate(() => ({ locked: LOCKED(), names: S.locs.map(l => l.name), car: S.cars[0].name, preset: !!window.TWRC_PRESET }));
        assert.equal(st.locked, true); assert(!st.names.some(x => me.names.includes(x))); assert.notEqual(st.car, me.car); assert.equal(st.preset, false);
        await q.close();
      });
      await check(dev + ' · deux vraies fenêtres : sauvegardes simultanées, coffre relu après rechargement', async () => {
        const q = await s.c.newPage(); await q.clock.install({ time: s.T0 }); await q.goto(require('./lib/context-session').U);
        const settleQ = async () => { for (let i = 0; i < 8; i++) { await q.clock.runFor(500); await q.waitForTimeout(80); } };
        try {
          await settleQ(); await q.fill('#unlockPw', PW);
          await Promise.all([q.waitForNavigation({ timeout: 60000 }), q.click('#unlockForm button[type=submit]')]); await settleQ();
          assert.equal(await q.evaluate(() => TWRC_VAULT.mode), 'vault');
          // Retenir le verrou natif pour mettre les deux écritures en file avant de les libérer.
          await p.evaluate(() => new Promise(ready => {
            window.__vaultTestLock = navigator.locks.request('twrc.vault.v2', { mode: 'exclusive' }, () => new Promise(release => { window.__vaultTestRelease = release; ready(); }));
          }));
          const a = p.evaluate(async () => { localStorage.setItem('twrc.test.concurrent.a', 'fenetre-A'); await TWRC_VAULT.flush(); return TWRC_VAULT.error; });
          const b = q.evaluate(async () => { localStorage.setItem('twrc.test.concurrent.b', 'fenetre-B'); await TWRC_VAULT.flush(); return TWRC_VAULT.error; });
          try {
            await p.waitForFunction(async () => (await navigator.locks.query()).pending.filter(l => l.name === 'twrc.vault.v2').length >= 2);
          } finally { await p.evaluate(() => { window.__vaultTestRelease(); return window.__vaultTestLock; }); }
          assert.deepEqual(await Promise.all([a, b]), [null, null]);
          await q.reload(); await settleQ();
          assert.deepEqual(await q.evaluate(() => [localStorage.getItem('twrc.test.concurrent.a'), localStorage.getItem('twrc.test.concurrent.b')]), ['fenetre-A', 'fenetre-B']);
          const raw = await rawOf(s.c); assert.deepEqual(leaks(raw), []); assert(!JSON.stringify(raw).includes('fenetre-A')); assert(!JSON.stringify(raw).includes('fenetre-B'));
          await Promise.all([p.evaluate(async () => { localStorage.removeItem('twrc.test.concurrent.a'); await TWRC_VAULT.flush(); }), q.evaluate(async () => { localStorage.removeItem('twrc.test.concurrent.b'); await TWRC_VAULT.flush(); })]);
          await q.reload(); await settleQ();
          assert.deepEqual(await q.evaluate(() => [localStorage.getItem('twrc.test.concurrent.a'), localStorage.getItem('twrc.test.concurrent.b')]), [null, null]);
        } finally { await q.close(); }
      });
      await check(dev + ' · Verrouiller : clé de session effacée, verrouillé, coffre intact, rien en clair', async () => {
        const vault = (await rawOf(s.c))['twrc.vault.v2'];
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]); await s.settle(8);
        assert.equal(await p.evaluate(() => LOCKED()), true); assert.equal(await p.evaluate(() => sessionStorage.getItem('twrc.session.v2')), null);
        const raw = await rawOf(s.c); assert.deepEqual(leaks(raw), []); assert(raw['twrc.vault.v2'] && raw['twrc.vault.v2'].length >= vault.length * 0.5);
      });
      await check(dev + ' · mauvais code : refusé, message clair, coffre inchangé', async () => {
        const before = (await rawOf(s.c))['twrc.vault.v2'];
        await s.p.fill('#unlockPw', 'code-faux-fictif'); await s.p.click('#unlockForm button[type=submit]');
        await p.waitForFunction(() => /Code incorrect|autre code/.test((document.getElementById('unlockMsg') || {}).textContent || ''), null, { timeout: 30000 });
        assert.equal((await rawOf(s.c))['twrc.vault.v2'], before); assert.equal(await p.evaluate(() => LOCKED()), true);
      });
      await check(dev + ' · bon code : réglages, voiture et journal récupérés à l’identique', async () => {
        await submit(s, PW);
        const st = await p.evaluate(() => ({ names: S.locs.map(l => l.name), car: S.cars[0].name, journal: USER_STORE.state.debrief.entries.some(e => e.key === 'journal-fictif-secu'), locked: LOCKED() }));
        assert.deepEqual(st.names, me.names); assert.equal(st.car, me.car); assert.equal(st.journal, true); assert.equal(st.locked, false);
        assert.deepEqual(leaks(await rawOf(s.c)), []);
      });
      await check(dev + ' · aucune violation de la politique de sécurité du contenu', async () => {
        assert.deepEqual(await p.evaluate(() => window.__csp), []);
        assert.match(await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content), /script-src 'sha256-/);
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
