// Relevé terrain GPS dans le débrief (21/11/2026, gel des fonctions GPS), données FICTIVES, vrais taps iPhone / clics PC.
// Après l'arrivée, le passager note consignes fausses, annonces trop tardives, pertes du GPS et batterie au départ et à
// l'arrivée ; enregistré avec le débrief (coffre chiffré), affiché dans le journal avec la consommation en %/h, conservé au
// rechargement ; cibles ≥ 44 px ; aucun lieu ni position dans le relevé.
'use strict';
const assert = require('node:assert/strict');
const { session, BR, errors } = require('./lib/context-session');
let n = 0, stage = '';
async function check(label, fn) { stage = label; await fn(); n++; console.log('✅ ' + label); }
const tap = async (s, selector) => { const b = s.p.locator(selector).first(); if (s.dev === 'iphone') await b.tap({ timeout: 12000 }); else await b.click({ timeout: 12000 }); await s.settle(1); };
const journal = p => p.evaluate(() => USER_STORE.state.debrief);
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { dev, at: '2026-10-07T06:20:00+02:00' }); s.dev = dev;
      try {
        await require('./lib/journal-activation')(s.p);
        await s.p.evaluate(() => { S.work.days = [1, 2, 3, 4, 5]; saveSettings(); UI.view = 'pneus'; renderAll(); }); await s.settle(4);
        await tap(s, '#secBrf [data-act=trip-start]');
        await s.p.clock.fastForward(30 * 60e3); await s.settle(4);
        await tap(s, '#placeBar [data-act=place-confirm][data-place=work]'); await s.settle(2);
        await check(dev + ' · débrief après l’arrivée : relevé terrain GPS proposé (facultatif, passager), cibles ≥ 44 px', async () => {
          const f = await s.p.evaluate(() => { const r = document.querySelector('#secDebrief .debrief-field'); return r && { legend: r.querySelector('legend').textContent,
            steps: [...r.querySelectorAll('.debrief-step span')].map(x => x.textContent), small: [...r.querySelectorAll('button, input')].map(x => x.getBoundingClientRect()).some(b => b.height < 43.9) }; });
          assert(f, 'relevé absent'); assert.match(f.legend, /Relevé terrain GPS · facultatif, rempli par le passager/);
          assert.deepEqual(f.steps, ['Consignes fausses', 'Annonces trop tardives', 'Pertes du GPS']); assert.equal(f.small, false);
        });
        await tap(s, '#secDebrief [data-act=debrief-field][data-f=late][data-d="1"]'); await tap(s, '#secDebrief [data-act=debrief-field][data-f=late][data-d="1"]');
        await tap(s, '#secDebrief [data-act=debrief-field][data-f=loss][data-d="1"]'); await tap(s, '#secDebrief [data-act=debrief-field][data-f=loss][data-d="-1"]'); await tap(s, '#secDebrief [data-act=debrief-field][data-f=loss][data-d="-1"]');
        await s.p.locator('#secDebrief [data-debrief-bat=start]').fill('92'); await s.p.locator('#secDebrief [data-debrief-bat=end]').fill('86');
        await check(dev + ' · compteurs : + et − par unité, jamais sous 0', async () => {
          const c = await s.p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#secDebrief [data-debrief-count]')].map(x => [x.dataset.debriefCount, x.textContent])));
          assert.deepEqual(c, { wrong: '0', late: '2', loss: '0' });
        });
        await tap(s, '#secDebrief [data-act=debrief-condition][data-v=normal]'); await tap(s, '#secDebrief [data-act=debrief-save]'); await s.settle(2);
        await check(dev + ' · enregistré avec le débrief : 0 consigne fausse, 2 annonces tardives, 0 perte, batterie 92 % → 86 %, aucun lieu', async () => {
          const j = await journal(s.p), f = j.entries[0].feedback.field;
          assert.deepEqual(f, { wrong: 0, late: 2, loss: 0, batStart: 92, batEnd: 86 }); assert.deepEqual(Object.keys(f).sort(), ['batEnd', 'batStart', 'late', 'loss', 'wrong']);
        });
        await s.p.reload(); await s.settle(12);
        await s.p.evaluate(() => { UI.view = 'pneus'; renderAll(); }); await s.settle(2);
        if (await s.p.locator('#secDebrief .debrief-journal').getAttribute('open') == null) await tap(s, '#secDebrief .debrief-journal > summary');
        await tap(s, '#secDebrief .debrief-entry > summary');
        await check(dev + ' · rechargement : relevé conservé et affiché dans le journal avec la consommation (12 %/h sur 30 min)', async () => {
          const j = await journal(s.p); assert.deepEqual(j.entries[0].feedback.field, { wrong: 0, late: 2, loss: 0, batStart: 92, batEnd: 86 });
          const t = await s.p.locator('#secDebrief [data-dv-field]').first().innerText();
          assert.equal(t, '0 consigne fausse · 2 annonces trop tardives · 0 perte du GPS · batterie 92 % → 86 % (12 %/h)');
        });
      } catch (e) { throw new Error(dev + ' · ' + stage + ' : ' + e.message); } finally { await s.c.close(); }
    }
    await check('aucune erreur JavaScript', async () => assert.deepEqual(errors, []));
    console.log(`\n✅ ${n} contrôles au vert`);
  } catch (e) { console.error('❌ ' + e.message); process.exitCode = 1; } finally { await b.close(); }
})();
