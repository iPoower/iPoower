// Réinitialisation protégée (zéro perte), PC et iPhone simulé, Chromium et WebKit. Profil, code et lieux fictifs
// (« Lieu A », « Voiture fictive test ») ; aucun compte réel ni réseau extérieur.
// Parcours : zone danger séparée de la démo → mot RÉINITIALISER exigé → abandon sans effet → instantané chiffré dans
// le coffre (rien en clair au repos) → réinitialisation → rechargement → « Annuler la réinitialisation » → réglages
// identiques à l'octet ; journal des trajets intact à chaque étape ; accord Drive séparé quand Drive est configuré.
'use strict';
const assert = require('node:assert/strict'), { session, BR, errors, U, NETWORK_NOISE } = require('./lib/context-session');
const activateJournal = require('./lib/journal-activation');
const ORIGIN = new URL(U).origin;
let n = 0, step = '';
async function check(name, fn) { step = name; await fn(); n++; console.log('✅ ' + name); }
async function reveal(p, selector) {
  if (!await p.locator('#settings').evaluate(el => el.open)) await p.locator('#settings > summary').click();
  await p.locator(selector).waitFor({ state: 'attached' });
  const parents = p.locator(selector).locator('xpath=ancestor::details[not(@open)]');
  while (await parents.count()) await parents.first().locator(':scope > summary').click();
  await p.locator(selector).scrollIntoViewIfNeeded();
}
const rawOf = async c => Object.fromEntries(((await c.storageState()).origins.find(o => o.origin === ORIGIN) || { localStorage: [] }).localStorage.map(x => [x.name, x.value]));
const settingsText = p => p.evaluate(() => localStorage.getItem('twrc.settings.v1'));
const journal = p => p.evaluate(() => JSON.stringify({ archive: localStorage.getItem('twrc.debrief.archive.v1'),
  entries: (USER_STORE.state.debrief.entries || []).map(e => [e.key, e.feedback && e.feedback.grip]) }));
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['pc', 'iphone']) {
      const s = await session(b, { at: '2026-10-07T15:00:00+02:00', dev }), p = s.p;
      await activateJournal(p);
      const key = 'work-2026-10-07|aller', at = Date.parse('2026-10-07T07:12:00+02:00');
      await p.evaluate(({ key, at }) => {
        USER_STORE.state.debrief.entries.unshift({ key, at, how: 'auto', name: 'Lieu A → Lieu B', from: 'home', to: 'work',
          feedback: { at: at + 8 * 60e3, conditions: ['wet'], grip: 'normal' }, deferred: false });
        USER_STORE.flush();
        S.work.dep = '07:10'; S.work.ret = '18:40'; S.work.durMin = 45; S.horizon = 24;
        S.calib = [{ t: '2026-10-07T07:00', loc: 'home', kind: 'ice', Tr: 2, T: 3 }];
        S.customs.push({ id: 'cfict', name: 'Lieu A', sub: 'Département 38', lat: 48.8, lon: 2.3 });
        S.cars[0].name = 'Voiture fictive test'; saveSettings(); renderAll();
      }, { key, at });
      await p.evaluate(() => TWRC_VAULT.flush()); await s.settle(4);
      const before = await settingsText(p), journalBefore = await journal(p);
      assert.match(before, /Voiture fictive test/); assert.match(journalBefore, /work-2026-10-07\|aller/);
      assert.equal(await p.evaluate(() => TWRC_VAULT.mode), 'vault');

      await check(dev + ' · « Réinitialiser » est dans une zone danger séparée, sous « Lancer la démo »', async () => {
        await reveal(p, '#resetZone [data-act=reset]');
        const layout = await p.evaluate(() => {
          const reset = document.querySelector('[data-act=reset]'), demo = document.querySelector('[data-act=demo-sel]');
          return { danger: !!reset.closest('.set-danger'), sameRow: reset.parentElement === demo.parentElement,
            after: !!(demo.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING), title: document.querySelector('#resetTitle').textContent,
            count: document.querySelectorAll('[data-act=reset]').length };
        });
        assert.deepEqual(layout, { danger: true, sameRow: false, after: true, title: '⚠️ Zone danger', count: 1 });
      });
      await check(dev + ' · ouvrir puis abandonner : mot exigé, aucune donnée modifiée, aucun dialogue natif', async () => {
        let dialogs = 0; const onDialog = d => { dialogs++; d.dismiss(); }; p.on('dialog', onDialog);
        await p.locator('[data-act=reset]').click(); await s.settle(1);
        assert.equal(await p.locator('#resetWord').isVisible(), true);
        assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('#resetWord').fill('REINITIALIS'); assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('#resetWord').fill('oui'); assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('[data-act=reset-cancel]').click(); await s.settle(2);
        p.off('dialog', onDialog);
        assert.equal(dialogs, 0); assert.equal(await settingsText(p), before); assert.equal(await journal(p), journalBefore);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage)), null); assert.equal(await p.locator('[data-act=reset-undo]').count(), 0);
      });
      await check(dev + ' · RÉINITIALISER saisi : instantané chiffré confirmé, puis valeurs initiales ; journal intact', async () => {
        await p.locator('[data-act=reset]').click(); await s.settle(1);
        await p.locator('#resetWord').fill('RÉINITIALISER'); assert.equal(await p.locator('[data-act=reset-go]').isEnabled(), true);
        await p.locator('[data-act=reset-go]').click(); await s.settle(6);
        await p.evaluate(() => TWRC_VAULT.flush());
        assert.deepEqual(await p.evaluate(() => S.work), await p.evaluate(() => DEFAULTS.work));
        assert.equal(await p.evaluate(() => S.cars[0].name), await p.evaluate(() => DEFAULTS.cars[0].name));
        assert.equal(await p.evaluate(() => JSON.stringify([S.customs, S.calib]) === JSON.stringify([DEFAULTS.customs, DEFAULTS.calib])), true);
        assert.equal(await p.evaluate(() => S.customs.some(l => l.name === 'Lieu A') || S.calib.length > 0), false);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage).settings), before, 'instantané identique à l’octet');
        assert.equal(await journal(p), journalBefore, 'journal des trajets modifié par la réinitialisation');
        const raw = await rawOf(s.c);
        assert(raw['twrc.vault.v2'], 'coffre absent');
        assert.equal(raw['twrc.restore.reset.v1'], undefined, 'instantané en clair sur le disque');
        assert.deepEqual(Object.entries(raw).filter(([, v]) => /Voiture fictive test|Lieu A|Département 38/.test(v)).map(([k]) => k), [], 'réglage fictif lisible au repos');
        assert.equal(await p.locator('[data-act=reset-undo]').count(), 1);
      });
      await check(dev + ' · après rechargement : instantané toujours présent dans le coffre, bouton d’annulation visible', async () => {
        await p.reload(); await s.settle(14);
        assert.equal(await p.evaluate(() => TWRC_VAULT.mode), 'vault');
        await reveal(p, '#resetZone [data-act=reset-undo]');
        assert.match(await p.locator('#resetZone').innerText(), /chiffré dans le coffre de cet appareil, jamais envoyé à Drive/);
      });
      await check(dev + ' · « Annuler la réinitialisation » : réglages identiques à l’octet, instantané retiré, journal intact', async () => {
        await p.locator('[data-act=reset-undo]').click(); await s.settle(6); await p.evaluate(() => TWRC_VAULT.flush());
        assert.equal(await settingsText(p), before, 'réglages restaurés différents à l’octet');
        assert.equal(await p.evaluate(() => S.cars[0].name), 'Voiture fictive test'); assert.equal(await p.evaluate(() => S.work.dep), '07:10');
        assert.equal(await p.evaluate(() => S.customs.some(l => l.name === 'Lieu A')), true); assert.equal(await p.evaluate(() => S.calib.length), 1);
        assert.equal(await p.evaluate(() => RESET_GUARD.read(localStorage)), null); assert.equal(await p.locator('[data-act=reset-undo]').count(), 0);
        assert.equal(await journal(p), journalBefore);
        await p.reload(); await s.settle(14);
        assert.equal(await settingsText(p), before, 'restauration perdue au rechargement'); assert.equal(await journal(p), journalBefore);
      });
      await check(dev + ' · Drive configuré : accord séparé et explicite exigé avant toute réinitialisation envoyée', async () => {
        await p.evaluate(() => { window.__driveWas = window.TWRC_DRIVE_CONFIGURED; window.TWRC_DRIVE_CONFIGURED = true; });
        await reveal(p, '#resetZone [data-act=reset]'); await p.locator('[data-act=reset]').click(); await s.settle(1);
        await p.locator('#resetWord').fill('RÉINITIALISER');
        assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true, 'mot seul insuffisant avec Drive');
        assert.match(await p.locator('#resetZone').innerText(), /envoyés au dossier Drive/);
        await p.locator('#resetDrive').check(); assert.equal(await p.locator('[data-act=reset-go]').isEnabled(), true);
        await p.locator('#resetDrive').uncheck(); assert.equal(await p.locator('[data-act=reset-go]').isDisabled(), true);
        await p.locator('[data-act=reset-cancel]').click(); await s.settle(2);
        await p.evaluate(() => { window.TWRC_DRIVE_CONFIGURED = window.__driveWas; });
        assert.equal(await settingsText(p), before); assert.equal(await journal(p), journalBefore);
      });
      await s.settle(3); await s.c.close();
    }
    await check('aucune exception JavaScript', async () => assert.deepEqual(errors, []));
    if (NETWORK_NOISE.length) console.log('ℹ️ requêtes réseau coupées signalées par WebKit : ' + NETWORK_NOISE.length);
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await b.close(); }
})().catch(e => { console.error('❌ ' + (step || 'préparation du parcours') + '\n' + e.message.replace(/[\r\n]+/g, ' ')); process.exitCode = 1; });
