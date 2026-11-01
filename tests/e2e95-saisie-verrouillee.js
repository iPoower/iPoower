// D1 · page verrouillée (coffre présent, session fermée) : aucune saisie ne peut être faite puis perdue en silence.
// Contrôles qui écrivent désactivés avec un message visible ; saisie forcée refusée par le gestionnaire ; coffre
// identique octet par octet ; choix inchangés après déverrouillage. iPhone/PC, Chromium/WebKit, données fictives.
'use strict';
const assert = require('node:assert/strict');
const { setTimeout: wait } = require('node:timers/promises');
const { BR, session, errors } = require('./lib/context-session');
const { openVault } = require('./lib/vault-open');
const MSG = /Déverrouille l’app pour modifier : rien n’est enregistré tant que l’app est verrouillée/;
const ACTS = ['day-type', 'day-car', 'day-destination', 'place-confirm'];
let n = 0, stage = '';
const check = async (label, fn) => { stage = label; await fn(); n++; console.log('✅ ' + label); };
const PW = () => require('node:fs').readFileSync('.passphrase', 'utf8').trim();
(async () => {
  const browser = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(browser, { at: '2026-10-10T08:00:00+02:00', dev }), p = s.p; await s.settle(4);
      const choice = () => p.evaluate(() => JSON.stringify({ day: appDay().dayType || null, car: appDay().activeCarId || null, dest: appDay().nextDestination || null, conf: PLACE.conf || null }));
      const before = await choice();
      let sealed;
      await check(dev + ' · verrouillage manuel : page verrouillée, coffre présent', async () => {
        sealed = await p.evaluate(async () => { await TWRC_VAULT.flush(); return window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT); });
        assert(sealed, 'coffre durable avant verrouillage');
        await p.evaluate(() => { const d = document.getElementById('settings'); d.open = true; renderSettings(true); });
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.locator('[data-act=lock]').click()]);
        await p.waitForFunction(() => typeof LOCKED === 'function' && LOCKED() && typeof storeLocked === 'function' && storeLocked(), null, { timeout: 15000 });
        await s.settle(4);
        assert.equal(await p.evaluate(() => TWRC_VAULT.mode), 'locked');
        // Référence : le coffre tel qu'il est UNE FOIS verrouillé (le verrouillage enregistre légitimement une dernière fois).
        sealed = await p.evaluate(() => window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT));
      });
      await check(dev + ' · Pneus : choix du jour, voiture, destination et lieu désactivés, message visible', async () => {
        const r = await p.evaluate(acts => {
          document.querySelectorAll('details').forEach(d => { d.open = true; });
          const vis = e => !!(e.offsetParent || e.getClientRects().length);
          const els = [...document.querySelectorAll(acts.map(a => `[data-act="${a}"]`).join(','))].filter(vis);
          const msgs = [...document.querySelectorAll('.locked-write-msg')].filter(vis).map(e => e.textContent);
          return { count: els.length, acts: [...new Set(els.map(e => e.dataset.act))], enabled: els.filter(e => !e.disabled || e.getAttribute('aria-disabled') !== 'true').map(e => e.dataset.act), msgs };
        }, ACTS);
        assert(r.count >= 3 && r.acts.includes('day-type') && r.acts.includes('day-car'), JSON.stringify(r));
        assert.deepEqual(r.enabled, [], 'contrôles encore actifs : ' + JSON.stringify(r.enabled));
        assert(r.msgs.some(m => MSG.test(m)), 'message visible : ' + JSON.stringify(r.msgs));
      });
      await check(dev + ' · Trajet : formulaire et « Programmer » désactivés, message visible', async () => {
        await p.locator('#viewSeg [data-act=view][data-v=trajet]').first().click(); await s.settle(2);
        const r = await p.evaluate(() => {
          const vis = e => !!(e.offsetParent || e.getClientRects().length);
          const els = [...document.querySelectorAll('#secTrip input:not([type=hidden]), #secTrip select, #secTrip textarea, [data-act="trip-plan"]')].filter(vis);
          return { count: els.length, enabled: els.filter(e => !e.disabled).map(e => e.id || e.name || e.dataset.act), msg: [...document.querySelectorAll('#secTrip .locked-write-msg')].some(e => vis(e)) };
        });
        assert(r.count >= 2, JSON.stringify(r)); assert.deepEqual(r.enabled, []); assert.equal(r.msg, true);
        await p.locator('#viewSeg [data-act=view][data-v=pneus]').first().click(); await s.settle(2);
      });
      await check(dev + ' · saisie forcée (contrôle réactivé) : refusée par le gestionnaire, rien en mémoire ni dans le coffre', async () => {
        const r = await p.evaluate(acts => {
          const ctx0 = localStorage.getItem('twrc.context.v1'), day0 = JSON.stringify(appDay()), conf0 = JSON.stringify(PLACE.conf || null), out = [];
          for (const a of acts) {
            const e = [...document.querySelectorAll(`[data-act="${a}"]`)].find(x => x.getAttribute('aria-pressed') !== 'true');
            if (!e) continue;
            e.disabled = false; e.removeAttribute('aria-disabled'); e.click();
            out.push({ a, text: e.textContent });
          }
          return { out, memSame: localStorage.getItem('twrc.context.v1') === ctx0, daySame: JSON.stringify(appDay()) === day0, confSame: JSON.stringify(PLACE.conf || null) === conf0 };
        }, ACTS);
        assert(r.out.length >= 3, JSON.stringify(r));
        assert(r.out.every(x => /Déverrouille/.test(x.text)), 'retour visible sur le bouton : ' + JSON.stringify(r.out));
        assert.equal(r.memSame, true, 'mémoire de session inchangée'); assert.equal(r.daySame, true); assert.equal(r.confSame, true);
        await wait(500);   // temps réel : une écriture asynchrone éventuelle aurait le temps d'aboutir
        assert.equal(await p.evaluate(() => window.TWRC_RAW_STORAGE.getItem(SessionVault.VAULT)), sealed, 'coffre identique octet par octet');
        const v = await openVault(sealed, PW());
        assert(v['twrc.settings.v1'], 'coffre lisible (vrai module, hors page)');
      });
      await check(dev + ' · déverrouillage : choix d’avant intacts, contrôles de nouveau actifs', async () => {
        const now = await p.evaluate(() => Date.now()); await p.clock.setFixedTime(now);
        await p.fill('#unlockPw', PW());
        await Promise.all([p.waitForNavigation({ timeout: 60000 }), p.click('#unlockForm button[type=submit]')]);
        // Attente côté Node (l'horloge Playwright ne doit pas suspendre le sondage), globaux testés avant usage.
        const deadline = Date.now() + 30000; let ok = false;
        while (!ok && Date.now() < deadline) { ok = await p.evaluate(() => typeof LOCKED === 'function' && !!window.TWRC_VAULT && window.TWRC_VAULT.mode === 'vault' && !LOCKED()).catch(() => false); if (!ok) await wait(100); }
        assert(ok, 'coffre réellement rouvert sous 30 s'); await s.settle(4);
        assert.equal(await choice(), before, 'aucune saisie verrouillée reportée');
        const r = await p.evaluate(() => ({ disabled: [...document.querySelectorAll('[data-act="day-type"], [data-act="day-car"]')].filter(e => e.disabled).length, msgs: document.querySelectorAll('.locked-write-msg').length }));
        assert.deepEqual(r, { disabled: 0, msgs: 0 });
      });
      await s.c.close();
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, [], errors.join(' | ')));
    console.log(n + '/' + n + ' scénarios OK');
  } finally { await browser.close(); }
})().catch(e => { console.error('❌ ' + stage + ' · ' + (e && e.stack || e)); process.exit(1); });
