// Garage · kilomètres par semaine : relevés compteur uniquement, lecture seule, iPhone/PC, thèmes clair et sombre.
// Voitures, dates et kilométrages fictifs.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const { BR, session, errors } = require('./lib/context-session');
let n = 0;
const check = async (t, fn) => { await fn(); n++; console.log('✅ ' + t); };
(async () => {
  const b = await BR.launch();
  try {
    for (const dev of ['iphone', 'pc']) {
      const s = await session(b, { at: '2026-10-21T09:00:00+02:00', dev }), p = s.p;
      try {
        const settingsBefore = await p.evaluate(() => {
          const [a, c] = S.cars;
          a.odo = [{ d: '2026-10-05', km: 1000 }, { d: '2026-10-19', km: 1700 }];
          if (c) c.odo = [{ d: '2026-10-20', km: 5000 }];
          saveSettings(); UI.view = 'garage'; renderAll();
          return lsGet('twrc.settings.v1');
        });
        await s.settle(2);
        await check(dev + ' · graphique : barres de la voiture avec 2 relevés, total du mois, état vide explicite pour l’autre', async () => {
          const r = await p.evaluate(() => {
            const sec = document.getElementById('garageKm');
            return { text: sec.innerText, bars: sec.querySelectorAll('rect.km-bar').length, svg: sec.querySelector('svg.km-chart'),
              role: sec.querySelector('svg').getAttribute('role'), title: sec.querySelector('svg title').textContent,
              rows: [...sec.querySelectorAll('.km-values tbody tr')].map(tr => [...tr.cells].map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim()) };
          });
          assert.equal(r.role, 'img'); assert.match(r.title, /Kilomètres par semaine/);
          assert.equal(r.bars, 2, 'deux semaines couvertes par les relevés, aucune barre inventée');
          assert.match(r.text, /ce mois : 700 km du 05\/10 au 19\/10/);
          assert.match(r.text, /1 relevé, prochain attendu le 27\/10/);
          assert.match(r.text, /répartis de façon linéaire/);
          assert(r.rows.some(x => /^05\/10 350 km$/.test(x)), 'valeurs lisibles sans couleur : ' + JSON.stringify(r.rows));
          assert(r.rows.some(x => /^19\/10 —$/.test(x)), 'semaine après le dernier relevé : aucune valeur');
        });
        await check(dev + ' · lecture seule : aucune écriture de réglage', async () => {
          await p.evaluate(() => { renderAll(); renderAll(); });
          assert.equal(await p.evaluate(() => lsGet('twrc.settings.v1')), settingsBefore);
        });
        await check(dev + ' · deux voitures côte à côte : barres distinctes (couleur + hachures), légende et tableau à deux colonnes', async () => {
          const r = await p.evaluate(() => {
            const c = S.cars[1]; if (!c) return null;
            c.odo = [{ d: '2026-10-01', km: 5000 }, { d: '2026-10-15', km: 5420 }]; saveSettings(); renderAll();
            const sec = document.getElementById('garageKm');
            return { car0: sec.querySelectorAll('rect.km-car0').length, car1: sec.querySelectorAll('rect.km-car1').length,
              cols: sec.querySelectorAll('.km-values thead th').length, legend: sec.querySelector('.km-legend').textContent, text: sec.innerText };
          });
          if (!r) return;   // profil fictif à une seule voiture
          assert.equal(r.car0, 2); assert(r.car1 >= 2, 'barres de la seconde voiture'); assert.equal(r.cols, 3);
          assert.match(r.text, /ce mois : 420 km du 01\/10 au 15\/10 · moyenne 30 km\/jour/);
        });
        for (const scheme of ['dark', 'light']) {
          await p.emulateMedia({ colorScheme: scheme }); await p.evaluate(() => { document.documentElement.dataset.theme = 'auto'; });
          await check(dev + ' · thème ' + scheme + ' : barres visibles, aucun débordement horizontal', async () => {
            const r = await p.evaluate(() => {
              const bar = document.querySelector('#garageKm rect.km-bar'), cs = getComputedStyle(bar);
              return { fill: cs.fill, scroll: document.documentElement.scrollWidth, width: innerWidth,
                over: [...document.querySelectorAll('#garageKm *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length };
            });
            assert.notEqual(r.fill, 'none'); assert.notEqual(r.fill, ''); assert(r.scroll <= r.width, 'défilement horizontal : ' + r.scroll + ' > ' + r.width);
            assert.equal(r.over, 0);
            await p.locator('#garageKm').screenshot({ path: path.join(process.env.SP, 'garage-km-' + BR.NAME + '-' + dev + '-' + scheme + '.png') });
          });
        }
      } finally { await s.c.close(); }
    }
  } finally { await b.close(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(n + '/' + n + ' scénarios kilomètres par semaine [' + BR.NAME + ']');
})().catch(e => { console.error(e); process.exit(1); });
