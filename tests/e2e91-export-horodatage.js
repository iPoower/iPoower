// Export d'une copie : une valeur de réglage encore en mémoire est enregistrée AVEC son horodatage de
// saisie (saveSettings), sinon l'autre appareil verrait un écart non daté, traité comme un conflit.
// Constat du 31/10/2026 (copies Drive après un export). Données fictives uniquement.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors } = require('./lib/context-session');
let n = 0;
const check = async (t, fn) => { await fn(); n++; console.log('✅ ' + t); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-31T09:00:00+01:00', dev }), p = s.p;
      try {
        const noShare = () => p.evaluate(() => { Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); });
        // Profil fictif : journal à activer. Le premier export l'active puis recharge la page (branche prévue).
        await noShare();
        if (await p.evaluate(() => TWRC_VAULT.journalNeedsRecovery)) {
          // WebKit interrompt waitForNavigation dès qu'un téléchargement commence : attendre le fichier, puis le rechargement.
          const file = p.waitForEvent('download', { timeout: 30000 }).catch(() => null), loaded = p.waitForEvent('load', { timeout: 60000 });
          await p.evaluate(() => { backupExport(); });
          await file; await loaded;
          await s.settle(); await noShare();
        }
        assert.equal(await p.evaluate(() => TWRC_VAULT.journalNeedsRecovery), false, 'journal actif : branche d’export normale');
        await check(dev + ' · export : réglage en mémoire enregistré avec son horodatage de saisie', async () => {
          const before = await p.evaluate(() => { window.TWRC_DRIVE_CONFIGURED = true; return lsGet(SyncMerge.STAMPS) || '{}'; });
          const [r] = await Promise.all([
            p.evaluate(async () => {
              S.cars[0].short = 'Saisie-non-enregistree';
              await backupExport();
              return { stamps: JSON.parse(lsGet(SyncMerge.STAMPS) || '{}'), settings: JSON.parse(lsGet('twrc.settings.v1')), msg: (document.getElementById('bkMsg') || {}).textContent || '' };
            }),
            p.waitForEvent('download', { timeout: 20000 }).catch(() => null)
          ]);
          assert.equal(r.settings.cars[0].short, 'Saisie-non-enregistree', 'la valeur exportée est bien enregistrée');
          assert(Number(r.stamps['cars.0.short']) > 0, 'horodatage de saisie présent pour cars.0.short : ' + JSON.stringify(r.stamps));
          assert.notEqual(JSON.stringify(r.stamps), before, 'horodatages mis à jour par l’export');
          assert.doesNotMatch(r.msg, /non confirmée/, 'export réussi : ' + r.msg);
        });
        await check(dev + ' · export sans changement : aucun nouvel horodatage', async () => {
          const r = await p.evaluate(async () => { const a = lsGet(SyncMerge.STAMPS); await backupExport(); return { a, b: lsGet(SyncMerge.STAMPS) }; });
          assert.equal(r.b, r.a, 'rien de modifié, rien de daté');
        });
      } finally { await s.c.close(); }
    }
  } finally { await b.close(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(n + '/' + n + ' scénarios export horodaté [' + BR.NAME + ']');
})().catch(e => { console.error(e); process.exit(1); });
