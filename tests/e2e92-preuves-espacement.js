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
      // Historique (#288) : avant la dette D2, chaque rendu de l'onglet Météo appelait aussi evShadowTick (evidenceHtml) ;
      // un rendu automatique tombant entre le changement d'heure et l'appel du test faussait la mesure. Depuis D2, un rendu
      // n'écrit plus (dernier scénario ci-dessous) ; le passage sur Pneus est conservé, sans effet sur la règle mesurée.
      await p.evaluate(() => { chooseView('pneus'); });
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
        // Dette D2 : un rendu de l'onglet Météo n'écrit jamais le journal ; l'arrivée d'une nouvelle météo (refreshAll) l'écrit.
        // Compteur : événements d'écriture du coffre pour twrc.shadow.v1, mesurés de façon SYNCHRONE autour de chaque rendu
        // (une actualisation automatique concurrente ne peut pas s'y glisser) ; le même compteur doit voir l'écriture du témoin.
        // Journal amorcé avec une dernière entrée vieille de 2 h : l'ancien code (écriture au rendu) aurait écrit.
        await check(dev + ' · D2 : 20 rendus de l’onglet Météo sans écriture du journal, nouvelle météo reçue = une écriture', async () => {
          await p.clock.setSystemTime(AT + 6 * 3600e3);
          await p.evaluate(() => {
            chooseView('meteo');
            lsSet('twrc.shadow.v1', JSON.stringify([{ at: Date.now() - 2 * 3600e3, loc: UI.loc, v1: 0, v2: 0, trust: 'fictif', contra: false }]));
            window.__shadowWrites = 0;
            window.addEventListener('twrc-vault-change', e => { if (e.key === 'twrc.shadow.v1') window.__shadowWrites++; });
          });
          const renders = [];
          for (let k = 0; k < 20; k++) {
            await p.clock.setSystemTime(AT + 6 * 3600e3 + k * 10 * 60e3);
            renders.push(await p.evaluate(() => {
              const w0 = window.__shadowWrites, v0 = lsGet('twrc.shadow.v1'); renderAll();
              return { writes: window.__shadowWrites - w0, same: lsGet('twrc.shadow.v1') === v0, view: UI.view, card: !!document.querySelector('#secWx .ev') };
            }));
          }
          assert(renders.every(r => r.view === 'meteo' && r.card), 'carte « Preuves » rendue à chaque passage (test non aveugle)');
          assert.equal(renders.reduce((a, r) => a + r.writes, 0), 0, 'aucune écriture du journal pendant 20 rendus');
          assert(renders.every(r => r.same), 'journal identique à l’octet près après chaque rendu');
          const w = await p.evaluate(async () => {
            if (busy) return { busy: true };   // actualisation déjà en cours : mesure impossible, échec explicite
            lsSet('twrc.shadow.v1', JSON.stringify([{ at: Date.now() - 2 * 3600e3, loc: UI.loc, v1: 0, v2: 0, trust: 'fictif', contra: false }]));
            const w0 = window.__shadowWrites, before = shadowLoad().length, start = Date.now(); await refreshAll(true);
            const L = shadowLoad(); return { writes: window.__shadowWrites - w0, added: L.length - before, last: L[L.length - 1], start, now: Date.now() };
          });
          assert(!w.busy, 'aucune actualisation concurrente'); assert.equal(w.writes, 1, 'témoin positif : nouvelle météo reçue → une écriture du journal');
          assert.equal(w.added, 1); assert(w.last.at >= w.start && w.last.at <= w.now, 'entrée datée de l’arrivée de la météo'); assert.notEqual(w.last.src, 'utilisateur');
        });
      } finally { await s.c.close(); }
    }
  } finally { await b.close(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(n + '/' + n + ' scénarios espacement du journal de preuves [' + BR.NAME + ']');
})().catch(e => { console.error(e); process.exit(1); });
