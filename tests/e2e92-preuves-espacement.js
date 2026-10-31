// Journal du moteur de preuves v2 (twrc.shadow.v1, synchronisé) : les entrées AUTOMATIQUES sont espacées
// de 60 min par lieu, avec ou sans observation de station ; les signalements « utilisateur » restent
// ajoutés immédiatement. Constat du 31/10/2026 : copies Drive sans saisie. Données fictives uniquement.
'use strict';
const assert = require('node:assert/strict');
const { BR, session, errors } = require('./lib/context-session');
const AT = Date.parse('2026-10-31T09:00:00+01:00');
let n = 0;
const check = async (t, fn) => { await fn(); n++; console.log('✅ ' + t); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-31T09:00:00+01:00', dev }), p = s.p;
      // Prévision synthétique ; `station` ajoute une observation proche (couche A), comme une vraie station à 6 km.
      const tick = (minutes, station) => p.clock.setSystemTime(AT + 3600e3 + minutes * 60e3).then(() => p.evaluate(st => {
        const v = { v1: 0, r: { worst: { lv: 1, trust: 'fictif', ev: st ? [{ layer: 'A', w: 0.8, lv: 1 }] : [] }, contradiction: false } };
        const before = shadowLoad().length; evShadowTick(v); return shadowLoad().length - before;
      }, station));
      try {
        await p.evaluate(() => { localStorage.setItem('twrc.shadow.v1', '[]'); });
        await check(dev + ' · entrées automatiques sans station : une par heure au plus', async () => {
          assert.equal(await tick(0, false), 1, 'première entrée');
          assert.equal(await tick(20, false), 0, '20 min plus tard : aucune entrée');
          assert.equal(await tick(59, false), 0, '59 min plus tard : aucune entrée');
          assert.equal(await tick(61, false), 1, '61 min plus tard : nouvelle entrée');
        });
        await p.evaluate(() => { localStorage.setItem('twrc.shadow.v1', '[]'); });
        await check(dev + ' · entrées automatiques AVEC observation de station : même espacement', async () => {
          assert.equal(await tick(120, true), 1, 'première entrée');
          assert.equal(await tick(121, true), 0, '1 min plus tard : aucune entrée');
          assert.equal(await tick(150, true), 0, '30 min plus tard : aucune entrée');
          assert.equal(await tick(181, true), 1, '61 min plus tard : nouvelle entrée');
        });
        await check(dev + ' · signalements « utilisateur » : ajoutés immédiatement, sans espacement', async () => {
          const r = await p.evaluate(() => {
            const count = () => shadowLoad().filter(e => e.src === 'utilisateur').length, a = count();
            if (!evNow()) return { skip: true };
            reportAdd('fog'); const b1 = count(); reportAdd('lowvis'); const b2 = count();
            return { a, b1, b2 };
          });
          assert(!r.skip, 'prévision disponible pour figer le signalement');
          assert.equal(r.b1, r.a + 1, 'premier signalement enregistré'); assert.equal(r.b2, r.a + 2, 'second, une seconde après : enregistré aussi');
        });
      } finally { await s.c.close(); }
    }
  } finally { await b.close(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(n + '/' + n + ' scénarios espacement du journal de preuves [' + BR.NAME + ']');
})().catch(e => { console.error(e); process.exit(1); });
