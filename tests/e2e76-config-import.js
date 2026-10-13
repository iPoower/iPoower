// Vraie PWA compilée avec le preset/les clés fictifs de la CI. Réseau externe
// bloqué par context-session ; aucun essai sur la production ou un profil réel.
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { session, BR, errors, U } = require('./lib/context-session');
const PW = fs.readFileSync('.passphrase', 'utf8').trim();
const fixture = () => JSON.parse(fs.readFileSync('preset.json', 'utf8'));
const link = cfg => '#' + 'cfg=' + Buffer.from(JSON.stringify(cfg)).toString('base64url');
const imported = () => {
  const cfg = fixture(); cfg.cars[0].name = 'Véhicule de lien fictif';
  cfg.cars[0].tire = { ...cfg.cars[0].tire, treadAv: 3.2, treadAr: 4.4, dot: '1425', pchk: { date: '2026-10-12', T: 12 } };
  cfg.cars[0].sets = { winter: { brand: 'Marque de test', model: 'Pneu fictif', size: '215/40 R18', dot: '1225', tread: 7.2 } };
  cfg.cars[0].odo = [{ d: '2026-10-12', km: 12000 }];
  cfg.cars[0].plan = { on: 1, brand: 'Marque de test', model: 'Pneu fictif', size: '215/40 R18', ordered: '2026-09-17', etaFrom: '2026-12-07', etaTo: '2026-12-08', etaChecked: '2026-10-13', date: '2026-12-11', appointmentConfirmed: 0 };
  cfg.journal = { '2026-09-15': { T: 6.1, Tr: 4.5, ice: 0, vis: 10000, lv: { carA: 1, carB: 0 } } };
  return cfg;
};
let n = 0, stage = '';
const check = async (name, fn) => { stage = name; await fn(); n++; console.log('✅ ' + name); };
const setLink = async (s, cfg, suffix = '') => {
  await s.p.evaluate(hash => { location.hash = hash; }, link(cfg) + suffix);
  await s.p.waitForFunction(() => !/(?:^#|&)cfg=/.test(location.hash)); await s.settle(3);
};
const read = p => p.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('twrc.settings.v1') || 'null'), id: localStorage.getItem('twrc.cfghash'), status: window.TWRC_CONFIG_IMPORT.status.state,
  protected: ['twrc.context.v1', 'twrc.reports.v1', 'twrc.shadow.v1', 'twrc.tyretherm.v1', 'twrc.tripcancel'].map(k => [k, localStorage.getItem(k)]) }));
const raw = async c => Object.fromEntries(((await c.storageState()).origins.find(o => o.origin === new URL(U).origin) || { localStorage: [] }).localStorage.map(x => [x.name, x.value]));
const submit = async (s, code = PW) => {
  await s.p.fill('#unlockPw', code);
  await Promise.all([s.p.waitForNavigation({ timeout: 60000 }), s.p.click('#unlockForm button[type=submit]')]); await s.settle(5);
};
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-13T08:00:00+02:00', dev, unlock: false, meteo: 'abort' }), p = s.p, cfg = imported();
      cfg.work.days = dev === 'iphone' ? [7] : [1, 2, 3, 4, 5, 6, 7];
      p.on('dialog', d => d.accept());
      try {
        await check(dev + ' · jours ISO invalides : URL nettoyée, aucun import ni changement de stockage', async () => {
          const before = await read(p), disk = await raw(s.c);
          for (const days of [[0], [1, 0, 7], [8], [7, 7]]) {
            const next = imported(); next.work.days = days; await setLink(s, next);
            const after = await read(p); assert.equal(after.status, 'invalid');
            assert.deepEqual(after.settings, before.settings); assert.equal(after.id, before.id);
            assert.deepEqual(after.protected, before.protected); assert.deepEqual(await raw(s.c), disk);
          }
        });
        await check(dev + ' · nouvelle installation verrouillée : URL propre, import seulement en mémoire, aucun réglage écrit', async () => {
          await p.evaluate(() => history.replaceState({ keep: 1 }, '', location.pathname + '?keep=1'));
          await setLink(s, cfg, '&section=secSeason');
          assert.equal(new URL(p.url()).search, '?keep=1'); assert.equal(new URL(p.url()).hash, '#section=secSeason');
          const state = await read(p); assert.equal(state.status, 'locked'); assert.equal(state.settings, null); assert.equal(state.id, null);
          assert.equal(await p.locator('#unlockPw').count(), 1);
          const disk = await raw(s.c); assert(!JSON.stringify(disk).includes(cfg.cars[0].name));
        });
        await check(dev + ' · code fictif validé : vrai coffre, import relu, dates/jeux/profondeurs et historique conservés', async () => {
          // Autorisation d'appareil fictif pour tester ensuite une réouverture.
          await p.locator('#rememberWeek').check(); await submit(s);
          const state = await read(p); assert.equal(await p.evaluate(() => LOCKED()), false); assert.match(state.id, /^sha256:[0-9a-f]{64}$/);
          assert.deepEqual(state.settings.work.days, cfg.work.days);
          assert(await p.evaluate(() => isCommuteDay('2026-10-18', S.work.days)), 'dimanche conservé dans le vrai moteur');
          assert.equal(await p.evaluate(() => isCommuteDay('2026-10-13', S.work.days)), dev === 'pc');
          assert.equal(state.settings.cars[0].name, cfg.cars[0].name); assert.deepEqual(state.settings.cars[0].plan, cfg.cars[0].plan);
          assert.equal(state.settings.cars[0].tire.treadAv, 3.2); assert.deepEqual(state.settings.cars[0].sets, cfg.cars[0].sets);
          assert.deepEqual(state.settings.cars[0].odo, cfg.cars[0].odo); assert.deepEqual(state.settings.journal, cfg.journal);
          assert.equal(new URL(p.url()).hash, '#section=secSeason'); assert.equal(new URL(p.url()).search, '?keep=1');
          const disk = await raw(s.c); assert(disk['twrc.vault.v2']); assert(!disk['twrc.settings.v1']); assert(!disk['twrc.cfghash']);
          assert(!JSON.stringify(disk).includes(cfg.cars[0].name)); assert(!JSON.stringify(disk).includes(Buffer.from(JSON.stringify(cfg)).toString('base64url')));
        });
        await check(dev + ' · lien identique après modifications locales : aucune réapplication ni perte', async () => {
          await p.evaluate(() => {
            S.cars[0].plan.date = '2026-12-20'; markEdit('cars.0.plan.date'); saveSettings();
            USER_STORE.state.debrief.entries.unshift({ key: 'journal-fictif-r2', at: Date.now() - 30000, how: 'auto', name: 'Retour fictif', from: 'home', to: 'work', feedback: { at: Date.now() - 10000, conditions: ['wet'], grip: 'normal' } });
            USER_STORE.flush(); localStorage.setItem('twrc.reports.v1', JSON.stringify([{ kind: 'wet', at: Date.now() }]));
            localStorage.setItem('twrc.shadow.v1', JSON.stringify([{ observed: 'dry', at: Date.now() }]));
          });
          await p.evaluate(() => window.TWRC_VAULT.flush()); const before = await read(p); await setLink(s, cfg);
          const after = await read(p); assert.equal(after.status, 'duplicate'); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected);
        });
        await check(dev + ' · lien différent sur appareil configuré : refus explicite et toutes les données identiques', async () => {
          const before = await read(p), next = imported(); next.cars[0].name = 'Remplacement fictif refusé'; await setLink(s, next);
          const after = await read(p); assert.equal(after.status, 'configured'); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected);
          assert.match(await p.locator('[data-k="config-import"]').textContent(), /Import refusé/);
        });
        await check(dev + ' · ancien cfghash et relance : empreinte remplacée, saisies et journal conservés', async () => {
          await p.evaluate(value => localStorage.setItem('twrc.cfghash', value), Buffer.from(JSON.stringify(cfg)).toString('base64url'));
          await p.evaluate(() => window.TWRC_VAULT.flush()); const before = await read(p); await p.reload(); await s.settle(5);
          const after = await read(p); assert.match(after.id, /^sha256:[0-9a-f]{64}$/); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected);
          const disk = await raw(s.c); assert(!disk['twrc.cfghash']); assert(!JSON.stringify(disk).includes(cfg.cars[0].name));
        });
        await check(dev + ' · import malformé, trop volumineux ou hostile : URL retirée et valeurs inchangées', async () => {
          const before = await read(p); const hostile = imported(); hostile.cars[0].tire.treadAv = 'invalide';
          for (const hash of ['#' + 'cfg=%broken', '#' + 'cfg=' + 'A'.repeat(180000), link(hostile)]) {
            await p.evaluate(h => { location.hash = h; }, hash); await p.waitForFunction(() => window.TWRC_CONFIG_IMPORT.status.state === 'invalid'); await s.settle(2);
            const after = await read(p); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected); assert.equal(new URL(p.url()).hash, '');
          }
          assert(!await p.evaluate(() => document.body.innerText.includes('cfg=')));
        });
        await check(dev + ' · fermer puis rouvrir la page : état chiffré repris, historique identique, aucun fragment privé', async () => {
          await p.evaluate(() => window.TWRC_VAULT.flush()); const before = await read(p); await p.close();
          const reopened = await s.c.newPage(); reopened.on('dialog', d => d.accept()); await reopened.goto(U + '?keep=1');
          await reopened.waitForFunction(() => typeof S !== 'undefined' && !LOCKED());
          const after = await read(reopened); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected); assert.equal(after.id, before.id);
          assert.equal(new URL(reopened.url()).hash, '');
          await reopened.close();
        });
      } finally { await s.c.close(); }
      const locked = await session(b, { at: '2026-10-13T08:00:00+02:00', dev, meteo: 'abort' }); locked.p.on('dialog', d => d.accept());
      try {
        await check(dev + ' · coffre existant verrouillé : nouveau lien nettoyé, coffre intact avant code puis remplacement refusé', async () => {
          await locked.p.evaluate(() => { S.cars[0].tire.dot = '2025'; markEdit('cars.0.tire.dot'); saveSettings(); document.getElementById('settings').open = true; renderSettings(true); });
          await locked.p.evaluate(() => window.TWRC_VAULT.flush()); const before = await read(locked.p);
          await Promise.all([locked.p.waitForNavigation({ timeout: 60000 }), locked.p.click('[data-act="lock"]')]); await locked.settle(3);
          const disk = await raw(locked.c); await setLink(locked, imported());
          assert.deepEqual(await raw(locked.c), disk); assert.equal((await read(locked.p)).status, 'locked');
          await submit(locked); const after = await read(locked.p); assert.deepEqual(after.settings, before.settings); assert.deepEqual(after.protected, before.protected); assert.equal(new URL(locked.p.url()).hash, '');
        });
      } finally { await locked.c.close(); }
    }
    await check('aucune erreur JavaScript ni violation CSP de fonctionnement', async () => assert.deepEqual(errors, []));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + e.name + ': ' + e.message.split('\n')[0]); process.exit(1); });
